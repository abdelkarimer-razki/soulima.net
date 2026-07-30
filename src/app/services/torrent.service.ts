import { Injectable, NgZone } from '@angular/core';
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

declare const WebTorrent: any;

@Injectable({ providedIn: 'root' })
export class TorrentService {
  private client: any = null;
  private currentTorrent: any = null;

  private progressSubject = new BehaviorSubject<TorrentProgress>({
    downloaded: 0, total: 0, progress: 0, speed: 0, peers: 0, ready: false, error: null,
  });

  progress$: Observable<TorrentProgress> = this.progressSubject.asObservable();

  constructor(private http: HttpClient, private zone: NgZone) {}

  private getClient(): any {
    if (!this.client && typeof WebTorrent !== 'undefined') {
      this.client = new WebTorrent();
    }
    return this.client;
  }

  fetchSources(tmdbId: number, mediaType: string, season?: number, episode?: number): Promise<TorrentSource[]> {
    let url = `/api/torrents?tmdb_id=${tmdbId}&media_type=${mediaType}`;
    if (season !== undefined) url += `&season=${season}`;
    if (episode !== undefined) url += `&episode=${episode}`;
    return this.http.get<{ sources: TorrentSource[] }>(url).toPromise().then(r => r?.sources || []);
  }

  play(magnet: string): HTMLVideoElement | null {
    this.stop();

    const client = this.getClient();
    if (!client) return null;

    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.preload = 'auto';

    client.add(magnet, (torrent: any) => {
      this.currentTorrent = torrent;
      torrent.files.forEach((file: any) => {
        if (file.name.endsWith('.mp4') || file.name.endsWith('.mkv') || file.name.endsWith('.avi') || file.name.endsWith('.webm')) {
          file.renderTo(video, { autoplay: true });
        }
      });

      const interval = setInterval(() => {
        this.zone.run(() => {
          this.progressSubject.next({
            downloaded: torrent.downloaded,
            total: torrent.length,
            progress: torrent.progress,
            speed: torrent.downloadSpeed,
            peers: torrent.numPeers,
            ready: torrent.done || torrent.progress > 0.05,
            error: null,
          });
        });
        if (torrent.done) clearInterval(interval);
      }, 1000);
    });

    client.on('error', (err: Error) => {
      this.zone.run(() => {
        this.progressSubject.next({
          ...this.progressSubject.value, error: err.message,
        });
      });
    });

    return video;
  }

  stop() {
    if (this.currentTorrent) {
      try { this.currentTorrent.destroy(); } catch {}
      this.currentTorrent = null;
    }
    this.progressSubject.next({
      downloaded: 0, total: 0, progress: 0, speed: 0, peers: 0, ready: false, error: null,
    });
  }

  destroy() {
    this.stop();
    if (this.client) {
      try { this.client.destroy(); } catch {}
      this.client = null;
    }
  }
}
