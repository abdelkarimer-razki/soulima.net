import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { HttpClient } from '@angular/common/http';

export interface TorrentSource {
  quality: string;
  magnet: string;
  size?: string;
  seeds?: number;
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
  'wss://tracker.openwebtorrent.com',
  'wss://tracker.btorrent.xyz',
  'wss://tracker.files.fm:7000/announce',
  'wss://tracker.webtorrent.dev',
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://open.demonii.com:1337/announce',
  'udp://open.stealth.si:80/announce',
  'udp://tracker.torrent.eu.org:451/announce',
  'udp://explodie.org:6969/announce',
  'udp://tracker.tiny-vps.com:6969/announce',
  'udp://tracker.cyberia.is:6969/announce',
  'udp://tracker.moeking.me:6969/announce',
  'udp://ipv4.tracker.harry.lu:80/announce',
  'udp://valerie.zackptg5.com:6969/announce',
  'udp://exodus.desync.com:6969/announce',
  'udp://tracker.coppersurfer.tk:6969/announce',
  'udp://tracker.leechers-paradise.org:6969/announce',
  'http://tracker.opentrackr.org:1337/announce',
  'https://tracker.btorrent.xyz',
  'https://tracker.tamersrealm.com:443/announce',
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

  prefetchStream(magnet: string): void {
    if (!magnet) return;
    this.http.post(`${this.streamServerUrl}/api/stream/prefetch`, { magnet }).subscribe({
      error: () => {}
    });
  }

  async fetchSources(tmdbId: number, mediaType: string, season?: number, episode?: number): Promise<TorrentSource[]> {
    try {
      if (mediaType === 'movie') {
        const imdbId = await this.getImdbId(tmdbId, mediaType);
        if (!imdbId) return [];
        return this.fetchYtsSources(imdbId);
      }

      return this.fetchProxySources(tmdbId, season, episode);
    } catch {
      return [];
    }
  }

  private async fetchProxySources(tmdbId: number, season?: number, episode?: number): Promise<TorrentSource[]> {
    try {
      const url = `${this.streamServerUrl}/api/search?tmdbId=${tmdbId}&season=${season}&episode=${episode}`;
      const data: any = await this.http.get(url).toPromise();
      return data?.sources || [];
    } catch {
      return [];
    }
  }

  async requestStream(magnet: string): Promise<StreamInfo> {
    const data: any = await this.withTimeout(
      this.http.post(`${this.streamServerUrl}/api/stream`, { magnet }).toPromise(),
      25000
    );
    return {
      id: data.id,
      streamUrl: data.streamUrl,
      statusUrl: data.statusUrl,
      fileName: data.fileName,
      size: data.size,
    };
  }

  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`request timeout after ${ms}ms`)), ms);
      promise.then(
        v => { clearTimeout(timer); resolve(v); },
        e => { clearTimeout(timer); reject(e); }
      );
    });
  }

  startPolling(streamId: string) {
    const url = `${this.streamServerUrl}/api/stream/${streamId}/status`;
    let pollInterval = 500;
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
          setTimeout(poll, pollInterval);
        } else {
          pollInterval = 2000;
          setTimeout(poll, pollInterval);
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

  getDownloadUrl(streamId: string): string {
    return `${this.streamServerUrl}/api/stream/${streamId}/download`;
  }

  async getImdbId(tmdbId: number, mediaType: string): Promise<string | null> {
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
}
