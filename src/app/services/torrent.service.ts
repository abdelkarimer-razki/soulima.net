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
  duration?: number;
}

export interface StreamInfo {
  id: string;
  streamUrl: string;
  statusUrl: string;
  fileName: string;
  size: number;
  duration?: number;
}

export interface ActiveDownloadItem {
  downloadId: string;
  streamId: string;
  status: string;
  progress: number;
  message: string;
  downloaded: number;
  total: number;
  fileUrl?: string;
  title?: string;
  posterUrl?: string;
  mediaType?: string;
  season?: number;
  episode?: number;
  meta?: any;
}

const TMDB_API_KEY = atob('YWNjNWYwMmU1NGZhNjEyNzEwZDMyNDVmNTNmMjk2MDA=');

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

  constructor(private http: HttpClient) {
    if (typeof window !== 'undefined' && window.location && window.location.hostname) {
      this.streamServerUrl = `http://${window.location.hostname}:3030`;
    }
  }

  setStreamServerUrl(url: string) {
    this.streamServerUrl = url;
  }

  getStreamUrl(streamId: string): string {
    return `${this.streamServerUrl}/api/stream/${streamId}`;
  }

  prefetchStream(magnet: string, season?: number, episode?: number): void {
    if (!magnet) return;
    this.http.post(`${this.streamServerUrl}/api/stream/prefetch`, { magnet, season, episode }).subscribe({
      error: () => {}
    });
  }

  async fetchSources(
    tmdbId: number,
    mediaType: string,
    season?: number,
    episode?: number,
    title?: string,
    year?: string
  ): Promise<TorrentSource[]> {
    try {
      // 1. Primary: Backend unified multi-source proxy (Torrentio, YTS, PirateBay, SolidTorrents, BitSearch)
      const proxySources = await this.fetchProxySources(tmdbId, season, episode, title, year).catch(() => []);
      if (proxySources && proxySources.length) {
        return proxySources.sort((a, b) => (b.seeds || 0) - (a.seeds || 0));
      }

      // 2. Direct client Torrentio request fallback if backend proxy returned empty/failed
      const isMovie = mediaType === 'movie';
      const imdbId = await this.getImdbId(tmdbId, mediaType).catch(() => null);
      if (!imdbId) return [];
      const clientSources = await this.fetchTorrentioSources(imdbId, isMovie ? null : season, isMovie ? null : episode).catch(() => []);
      return clientSources.sort((a, b) => (b.seeds || 0) - (a.seeds || 0));
    } catch {
      return [];
    }
  }

  private async fetchTorrentioSources(imdbId: string, season?: number | null, episode?: number | null): Promise<TorrentSource[]> {
    try {
      const cleanImdb = imdbId.startsWith('tt') ? imdbId : `tt${imdbId}`;
      const pathPart = (season != null && episode != null)
        ? `series/${cleanImdb}:${season}:${episode}.json`
        : `movie/${cleanImdb}.json`;
      const url = `https://torrentio.strem.fun/stream/${pathPart}`;
      const res: any = await this.withTimeout(this.http.get(url).toPromise(), 6000);
      const streams = res?.streams || [];
      return streams.filter((s: any) => s.infoHash).map((s: any) => {
        const seedMatch = s.title?.match(/👤\s*(\d+)/);
        const seeds = seedMatch ? parseInt(seedMatch[1], 10) : 10;
        const sizeMatch = s.title?.match(/💾\s*([0-9.]+\s*(?:GB|MB|TB))/i);
        const size = sizeMatch ? sizeMatch[1] : '';
        const quality = s.name?.replace('Torrentio\n', '').trim() || '1080p';
        const titleName = s.title?.split('\n')[0] || 'stream';
        return {
          quality,
          magnet: magnetLink(s.infoHash, titleName),
          size,
          seeds,
        };
      });
    } catch {
      return [];
    }
  }

  private async fetchProxySources(
    tmdbId: number,
    season?: number,
    episode?: number,
    title?: string,
    year?: string
  ): Promise<TorrentSource[]> {
    try {
      let url = `${this.streamServerUrl}/api/search?tmdbId=${tmdbId}`;
      if (season != null && episode != null) {
        url += `&season=${season}&episode=${episode}`;
      }
      if (title) url += `&title=${encodeURIComponent(title)}`;
      if (year) url += `&year=${encodeURIComponent(year)}`;
      const data: any = await this.withTimeout(this.http.get(url).toPromise(), 12000);
      return data?.sources || [];
    } catch {
      return [];
    }
  }

  async requestStream(magnet: string, season?: number, episode?: number): Promise<StreamInfo> {
    const data: any = await this.withTimeout(
      this.http.post(`${this.streamServerUrl}/api/stream`, { magnet, season, episode }).toPromise(),
      25000
    );
    return {
      id: data.id,
      streamUrl: data.streamUrl,
      statusUrl: data.statusUrl,
      fileName: data.fileName,
      size: data.size,
      duration: data.duration || 0,
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

  private activePollingStreamId: string | null = null;
  private pollTimeoutTimer: any = null;

  startPolling(streamId: string) {
    this.stopPolling();
    this.activePollingStreamId = streamId;
    const url = `${this.streamServerUrl}/api/stream/${streamId}/status`;
    let pollInterval = 500;
    const poll = () => {
      if (this.activePollingStreamId !== streamId) return;
      this.http.get(url).toPromise().then((data: any) => {
        if (this.activePollingStreamId !== streamId) return;
        this.progressSubject.next({
          downloaded: data.downloaded,
          total: data.total,
          progress: data.progress,
          speed: data.speed,
          peers: data.peers,
          ready: data.ready,
          error: null,
          duration: data.duration || 0,
        });
        if (!data.ready) {
          this.pollTimeoutTimer = setTimeout(poll, pollInterval);
        } else {
          pollInterval = 2000;
          this.pollTimeoutTimer = setTimeout(poll, pollInterval);
        }
      }).catch((err) => {
        if (this.activePollingStreamId !== streamId) return;
        // The server drops streams after an idle timeout. When it 404s, tell
        // the player so it can re-request a fresh URL instead of dying.
        if (err && err.status === 404) {
          this.progressSubject.next({
            downloaded: this.progressSubject.value.downloaded,
            total: this.progressSubject.value.total,
            progress: this.progressSubject.value.progress,
            speed: 0,
            peers: 0,
            ready: false,
            error: 'expired',
          });
        } else {
          this.pollTimeoutTimer = setTimeout(poll, 2000);
        }
      });
    };
    poll();
  }

  stopPolling() {
    this.activePollingStreamId = null;
    if (this.pollTimeoutTimer) {
      clearTimeout(this.pollTimeoutTimer);
      this.pollTimeoutTimer = null;
    }
  }

  stopStream(streamId: string) {
    if (this.activePollingStreamId === streamId) {
      this.stopPolling();
    }
    this.http.delete(`${this.streamServerUrl}/api/stream/${streamId}`).subscribe();
    this.progressSubject.next({
      downloaded: 0, total: 0, progress: 0, speed: 0, peers: 0, ready: false, error: null,
    });
  }

  activeDownloads$ = new BehaviorSubject<ActiveDownloadItem[]>([]);
  activeDownloadState$ = new BehaviorSubject<ActiveDownloadItem | null>(null);

  private downloadPollTimer: any = null;

  /** Start a server-side tracked download; returns a downloadId to poll. */
  async startTrackedDownload(
    streamId: string,
    subtitleId?: string,
    lang?: string,
    offset?: number,
    meta?: { title?: string; posterUrl?: string; mediaType?: string; season?: number; episode?: number }
  ): Promise<string> {
    let url = `${this.streamServerUrl}/api/stream/${streamId}/download?tracked=1`;
    if (subtitleId) {
      url += `&subtitle=${encodeURIComponent(subtitleId)}&lang=${encodeURIComponent(lang || '')}`;
    }
    if (offset) {
      url += `&offset=${encodeURIComponent(offset)}`;
    }
    if (meta?.title) {
      url += `&title=${encodeURIComponent(meta.title)}`;
    }
    if (meta?.posterUrl) {
      url += `&poster=${encodeURIComponent(meta.posterUrl)}`;
    }
    if (meta?.mediaType) {
      url += `&mediaType=${encodeURIComponent(meta.mediaType)}`;
    }
    if (meta?.season != null) {
      url += `&season=${encodeURIComponent(meta.season)}`;
    }
    if (meta?.episode != null) {
      url += `&episode=${encodeURIComponent(meta.episode)}`;
    }
    const data: any = await this.http.get(url).toPromise();
    const downloadId = data.downloadId;
    this.trackBackgroundDownload(downloadId, streamId, meta);
    return downloadId;
  }

  async getActiveDownloads(): Promise<ActiveDownloadItem[]> {
    try {
      const data: any = await this.http.get(`${this.streamServerUrl}/api/downloads`).toPromise();
      const list = (data?.downloads || []).map((d: any): ActiveDownloadItem => ({
        downloadId: d.downloadId,
        streamId: d.streamId,
        status: d.status,
        progress: d.progress,
        message: d.message,
        downloaded: d.downloaded,
        total: d.total,
        fileUrl: d.status === 'complete' ? this.getDownloadFileUrl(d.downloadId) : undefined,
        title: d.meta?.title || 'Video Download',
        posterUrl: d.meta?.posterUrl || '',
        mediaType: d.meta?.mediaType || 'movie',
        season: d.meta?.season,
        episode: d.meta?.episode,
        meta: d.meta,
      }));
      const active = list.filter((d: any) => d.status === 'starting' || d.status === 'downloading' || d.status === 'muxing');
      this.activeDownloads$.next(active);
      if (active.length > 0) {
        this.activeDownloadState$.next(active[0]);
      } else if (this.activeDownloadState$.value && this.activeDownloadState$.value.status !== 'complete') {
        this.activeDownloadState$.next(null);
      }
      return list;
    } catch {
      return [];
    }
  }

  trackBackgroundDownload(downloadId: string, streamId: string, meta?: any) {
    if (this.downloadPollTimer) clearInterval(this.downloadPollTimer);
    const initialItem: ActiveDownloadItem = {
      downloadId,
      streamId,
      status: 'starting',
      progress: 0,
      message: 'Preparing download…',
      downloaded: 0,
      total: 0,
      title: meta?.title || 'Downloading Video',
      posterUrl: meta?.posterUrl || '',
      mediaType: meta?.mediaType || 'movie',
      season: meta?.season,
      episode: meta?.episode,
      meta,
    };
    this.activeDownloadState$.next(initialItem);
    this.activeDownloads$.next([initialItem]);

    this.downloadPollTimer = setInterval(async () => {
      try {
        const st: any = await this.getDownloadStatus(downloadId);
        const cur = this.activeDownloadState$.value;
        if (!cur || cur.downloadId !== downloadId) {
          clearInterval(this.downloadPollTimer);
          this.downloadPollTimer = null;
          return;
        }
        const updatedItem: ActiveDownloadItem = {
          ...cur,
          status: st.status,
          progress: st.progress,
          message: st.message,
          downloaded: st.downloaded,
          total: st.total,
          fileUrl: st.status === 'complete' ? this.getDownloadFileUrl(downloadId) : undefined,
        };
        this.activeDownloadState$.next(updatedItem);
        if (st.status === 'starting' || st.status === 'downloading' || st.status === 'muxing') {
          this.activeDownloads$.next([updatedItem]);
        } else {
          this.activeDownloads$.next([]);
        }
        if (st.status === 'complete' || st.status === 'error' || st.status === 'cancelled') {
          clearInterval(this.downloadPollTimer);
          this.downloadPollTimer = null;
        }
      } catch {
        // Keep polling on transient network drops
      }
    }, 1500);
  }

  getDownloadStatus(downloadId: string): Promise<any> {
    return this.http.get(`${this.streamServerUrl}/api/downloads/${downloadId}/status`).toPromise();
  }

  getDownloadFileUrl(downloadId: string): string {
    return `${this.streamServerUrl}/api/downloads/${downloadId}/file`;
  }

  cancelDownload(downloadId: string): Promise<any> {
    if (this.downloadPollTimer) {
      clearInterval(this.downloadPollTimer);
      this.downloadPollTimer = null;
    }
    this.activeDownloadState$.next(null);
    this.activeDownloads$.next([]);
    return this.http.delete(`${this.streamServerUrl}/api/downloads/${downloadId}`).toPromise().catch(() => null);
  }

  getDownloadBudget(): Promise<any> {
    return this.http.get(`${this.streamServerUrl}/api/budget`).toPromise().catch(() => null);
  }

  getMediaLibrary(): Promise<any> {
    return this.http.get(`${this.streamServerUrl}/api/media`).toPromise().catch(() => ({ items: [] }));
  }

  getMediaMeta(id: string): Promise<any> {
    return this.http.get(`${this.streamServerUrl}/api/media/${id}/meta`).toPromise().catch(() => null);
  }

  getMediaStreamUrl(id: string): string {
    return `${this.streamServerUrl}/api/media/${id}/stream`;
  }

  saveToMediaLibrary(downloadId: string, meta: any): Promise<any> {
    return this.http.post(`${this.streamServerUrl}/api/media`, { downloadId, meta }).toPromise();
  }

  deleteMediaItem(id: string): Promise<any> {
    return this.http.delete(`${this.streamServerUrl}/api/media/${id}`).toPromise().catch(() => null);
  }

  async getImdbId(tmdbId: number, mediaType: string): Promise<string | null> {
    const url = `https://api.themoviedb.org/3/${mediaType === 'tv' ? 'tv' : 'movie'}/${tmdbId}/external_ids?api_key=${TMDB_API_KEY}`;
    const data: any = await this.http.get(url).toPromise();
    return data?.imdb_id || null;
  }
}
