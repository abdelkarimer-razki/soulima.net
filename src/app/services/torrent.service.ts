import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { HttpClient } from '@angular/common/http';

export interface TorrentSource {
  quality: string;
  magnet: string;
  size?: string;
}

export interface TorrentProgress {
  downloaded: number;
  total: number;
  progress: number;
  speed: number;
  peers: number;
  ready: boolean;
  error: string | null;
}

export interface StreamInfo {
  id: string;
  streamUrl: string;
  statusUrl: string;
  fileName: string;
  size: number;
}

const TMDB_API_KEY = 'acc5f02e54fa612710d3245f53f29600';

const TRACKERS = [
  'wss://tracker.btorrent.xyz',
  'wss://tracker.openwebtorrent.com',
  'wss://tracker.fastcast.nz',
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://tracker.leechers-paradise.org:6969/announce',
  'udp://tracker.coppersurfer.tk:6969/announce',
];

function magnetLink(hash: string, name: string): string {
  const xt = `urn:btih:${hash.toLowerCase()}`;
  const dn = encodeURIComponent(name);
  const tr = TRACKERS.map(t => `tr=${encodeURIComponent(t)}`).join('&');
  return `magnet:?xt=${xt}&dn=${dn}&${tr}`;
}

@Injectable({ providedIn: 'root' })
export class TorrentService {
  private streamServerUrl = 'http://localhost:3030';

  private progressSubject = new BehaviorSubject<TorrentProgress>({
    downloaded: 0, total: 0, progress: 0, speed: 0, peers: 0, ready: false, error: null,
  });

  progress$: Observable<TorrentProgress> = this.progressSubject.asObservable();

  constructor(private http: HttpClient) {}

  setStreamServerUrl(url: string) {
    this.streamServerUrl = url;
  }

  async fetchSources(tmdbId: number, mediaType: string, season?: number, episode?: number): Promise<TorrentSource[]> {
    try {
      const imdbId = await this.getImdbId(tmdbId, mediaType);
      if (!imdbId) return [];

      if (mediaType === 'movie') {
        return this.fetchYtsSources(imdbId);
      } else {
        return this.fetchEztvSources(imdbId, season, episode);
      }
    } catch {
      return [];
    }
  }

  async requestStream(magnet: string): Promise<StreamInfo> {
    const data: any = await this.http.post(`${this.streamServerUrl}/api/stream`, { magnet }).toPromise();
    return {
      id: data.id,
      streamUrl: data.streamUrl,
      statusUrl: data.statusUrl,
      fileName: data.fileName,
      size: data.size,
    };
  }

  startPolling(streamId: string) {
    const url = `${this.streamServerUrl}/api/stream/${streamId}/status`;
    const poll = () => {
      this.http.get(url).toPromise().then((data: any) => {
        this.progressSubject.next({
          downloaded: data.downloaded,
          total: data.total,
          progress: data.progress,
          speed: data.speed,
          peers: data.peers,
          ready: data.ready,
          error: null,
        });
        if (!data.ready) {
          setTimeout(poll, 2000);
        }
      }).catch(() => {
        setTimeout(poll, 2000);
      });
    };
    poll();
  }

  stopStream(streamId: string) {
    this.http.delete(`${this.streamServerUrl}/api/stream/${streamId}`).subscribe();
    this.progressSubject.next({
      downloaded: 0, total: 0, progress: 0, speed: 0, peers: 0, ready: false, error: null,
    });
  }

  private async getImdbId(tmdbId: number, mediaType: string): Promise<string | null> {
    const url = `https://api.themoviedb.org/3/${mediaType === 'tv' ? 'tv' : 'movie'}/${tmdbId}/external_ids?api_key=${TMDB_API_KEY}`;
    const data: any = await this.http.get(url).toPromise();
    return data?.imdb_id || null;
  }

  private async fetchYtsSources(imdbId: string): Promise<TorrentSource[]> {
    const id = imdbId.replace('tt', '');
    const res: any = await this.http.get(`https://yts.gg/api/v2/movie_details.json?imdb_id=${id}`).toPromise();
    const torrents = res?.data?.movie?.torrents;
    if (!torrents) return [];

    return torrents
      .filter((t: any) => t.hash)
      .map((t: any) => ({
        quality: `${t.quality} ${t.type || ''}`.trim(),
        magnet: magnetLink(t.hash, `${res.data.movie.title} ${t.quality}`),
        size: t.size || undefined,
      }));
  }

  private async fetchEztvSources(imdbId: string, season?: number, episode?: number): Promise<TorrentSource[]> {
    const res: any = await this.http.get(`https://eztvx.to/api/get-torrents?imdb_id=${imdbId}&limit=50`).toPromise();
    const torrents = res?.torrents;
    if (!torrents) return [];

    let filtered = torrents;
    if (season !== undefined && episode !== undefined) {
      filtered = torrents.filter((t: any) => t.season === season && t.episode === episode);
    }

    return filtered.slice(0, 10)
      .filter((t: any) => t.magnet_url)
      .map((t: any) => ({
        quality: `${t.resolution || 'SD'} S${t.season}E${t.episode}`,
        magnet: t.magnet_url,
        size: t.size || undefined,
      }));
  }
}
