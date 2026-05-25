import { Injectable, NgZone } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export interface TorrentProgress {
  status: 'idle' | 'loading' | 'playing' | 'error';
  progress: number;
  downloadSpeed: number;
  uploadSpeed: number;
  timeRemaining: number;
  error?: string;
}

// Declare WebTorrent as a global loaded via script tag or dynamic import
declare const WebTorrent: any;

@Injectable({
  providedIn: 'root'
})
export class WebtorrentService {
  private client: any = null;
  private activeTorrents = new Map<string, any>();
  private clientReady = false;
  private progress$ = new BehaviorSubject<TorrentProgress>({
    status: 'idle',
    progress: 0,
    downloadSpeed: 0,
    uploadSpeed: 0,
    timeRemaining: 0
  });

  constructor(private zone: NgZone) {
    this.initializeClient();
  }

  /**
   * Initialize WebTorrent client using the browser bundle
   */
  private initializeClient(): void {
    try {
      // Use dynamic script injection for browser compatibility
      this.loadWebTorrentScript().then(() => {
        this.client = new WebTorrent({
          dht: false,
          tracker: {
            announce: [
              'wss://tracker.openwebtorrent.com',
              'wss://tracker.btorrent.xyz',
              'wss://tracker.fastcast.nz'
            ]
          }
        });

        this.clientReady = true;

        this.client.on('error', (err: Error) => {
          console.error('WebTorrent client error:', err);
          this.zone.run(() => {
            this.progress$.next({
              status: 'error',
              progress: 0,
              downloadSpeed: 0,
              uploadSpeed: 0,
              timeRemaining: 0,
              error: err.message
            });
          });
        });
      }).catch(err => {
        console.error('Failed to load WebTorrent:', err);
      });
    } catch (error) {
      console.error('Failed to initialize WebTorrent:', error);
    }
  }

  /**
   * Dynamically load WebTorrent browser bundle
   */
  private loadWebTorrentScript(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (typeof WebTorrent !== 'undefined') {
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/webtorrent@latest/webtorrent.min.js';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load WebTorrent script'));
      document.head.appendChild(script);
    });
  }

  /**
   * Wait for client to be ready
   */
  private waitForClient(): Promise<void> {
    return new Promise((resolve) => {
      if (this.clientReady && this.client) {
        resolve();
        return;
      }
      const check = setInterval(() => {
        if (this.clientReady && this.client) {
          clearInterval(check);
          resolve();
        }
      }, 200);
      // Timeout after 15 seconds
      setTimeout(() => { clearInterval(check); resolve(); }, 15000);
    });
  }

  streamToVideoElement(magnetOrTorrent: string, videoEl: HTMLVideoElement): Observable<TorrentProgress> {
    return new Observable(subscriber => {
      this.waitForClient().then(() => {
        if (!this.client) {
          subscriber.error({ status: 'error', error: 'WebTorrent not available' });
          return;
        }

        this.zone.run(() => {
          this.progress$.next({ status: 'loading', progress: 0, downloadSpeed: 0, uploadSpeed: 0, timeRemaining: 0 });
          subscriber.next({ status: 'loading', progress: 0, downloadSpeed: 0, uploadSpeed: 0, timeRemaining: 0 });
        });

        // Stop all other running torrent downloads to free up bandwidth and memory
        this.activeTorrents.forEach((t, key) => {
          if (key !== magnetOrTorrent) {
            try { this.client.remove(key); } catch {}
          }
        });
        this.activeTorrents.clear();

        this.client.add(magnetOrTorrent, (torrent: any) => {
          this.activeTorrents.set(magnetOrTorrent, torrent);

          // Find the largest video file and stream it
          const videoFile = torrent.files
            .filter((f: any) => /\.(mp4|mkv|webm|avi|mov|flv)$/i.test(f.name))
            .sort((a: any, b: any) => b.length - a.length)[0];

          if (!videoFile) {
            this.zone.run(() => {
              const errProgress: TorrentProgress = {
                status: 'error', progress: 0, downloadSpeed: 0, uploadSpeed: 0,
                timeRemaining: 0, error: 'No streamable video files found in this torrent.'
              };
              this.progress$.next(errProgress);
              subscriber.error(errProgress);
            });
            try { this.client.remove(magnetOrTorrent); } catch {}
            this.activeTorrents.delete(magnetOrTorrent);
            return;
          }

          // WebTorrent render directly to video element
          videoFile.renderTo(videoEl, { autoplay: true }, (err: Error | null) => {
            if (err) {
              console.error('Render error:', err);
            }
          });

          // Track progress
          const progressInterval = setInterval(() => {
            const progress = this.buildProgress('playing', torrent);
            this.zone.run(() => {
              this.progress$.next(progress);
              subscriber.next(progress);
            });
          }, 500);

          torrent.on('done', () => {
            clearInterval(progressInterval);
            this.zone.run(() => {
              const done = this.buildProgress('playing', torrent);
              this.progress$.next(done);
              subscriber.next(done);
              subscriber.complete();
            });
          });

          torrent.on('error', (err: Error) => {
            clearInterval(progressInterval);
            this.zone.run(() => {
              const errorProgress: TorrentProgress = {
                status: 'error', progress: 0, downloadSpeed: 0, uploadSpeed: 0,
                timeRemaining: 0, error: err.message
              };
              this.progress$.next(errorProgress);
              subscriber.error(errorProgress);
            });
          });

          return () => {
            clearInterval(progressInterval);
          };
        });
      });
    });
  }

  /**
   * Start torrent and return progress updates (no video element wiring)
   */
  startTorrent(magnetOrTorrent: string): Observable<TorrentProgress> {
    return new Observable(subscriber => {
      this.waitForClient().then(() => {
        if (!this.client) {
          subscriber.error({ status: 'error', error: 'WebTorrent not available' });
          return;
        }

        this.zone.run(() => {
          this.progress$.next({ status: 'loading', progress: 0, downloadSpeed: 0, uploadSpeed: 0, timeRemaining: 0 });
        });

        if (this.activeTorrents.has(magnetOrTorrent)) {
          const existing = this.activeTorrents.get(magnetOrTorrent);
          subscriber.next(this.buildProgress('playing', existing));
          return;
        }

        this.client.add(magnetOrTorrent, (torrent: any) => {
          this.activeTorrents.set(magnetOrTorrent, torrent);

          const progressInterval = setInterval(() => {
            const progress = this.buildProgress('playing', torrent);
            this.zone.run(() => {
              this.progress$.next(progress);
              subscriber.next(progress);
            });
          }, 500);

          torrent.on('done', () => {
            clearInterval(progressInterval);
            this.zone.run(() => {
              this.progress$.next(this.buildProgress('playing', torrent));
              subscriber.complete();
            });
          });

          torrent.on('error', (err: Error) => {
            clearInterval(progressInterval);
            this.zone.run(() => {
              const errorProgress: TorrentProgress = {
                status: 'error', progress: 0, downloadSpeed: 0, uploadSpeed: 0,
                timeRemaining: 0, error: err.message
              };
              this.progress$.next(errorProgress);
              subscriber.error(errorProgress);
            });
          });
        });
      });
    });
  }

  /**
   * Get the stream URL for a video element
   */
  getStreamUrl(magnetOrTorrent: string): string {
    const torrent = this.activeTorrents.get(magnetOrTorrent);
    if (!torrent) throw new Error('Torrent not active');

    const videoFile = torrent.files
      .filter((f: any) => /\.(mp4|mkv|webm|avi|mov|flv)$/i.test(f.name))
      .sort((a: any, b: any) => b.length - a.length)[0];

    if (!videoFile) throw new Error('No video files found');
    return videoFile.streamURL;
  }

  /**
   * Stop and remove torrent
   */
  stopTorrent(magnetOrTorrent: string): void {
    const torrent = this.activeTorrents.get(magnetOrTorrent);
    if (torrent && this.client) {
      try {
        this.client.remove(magnetOrTorrent, (err: Error) => {
          if (err) console.error('Error removing torrent:', err);
        });
      } catch {}
      this.activeTorrents.delete(magnetOrTorrent);
    }
  }

  getProgress(): Observable<TorrentProgress> {
    return this.progress$.asObservable();
  }

  private buildProgress(status: TorrentProgress['status'], torrent: any): TorrentProgress {
    return {
      status,
      progress: Math.round((torrent.progress || 0) * 100),
      downloadSpeed: torrent.downloadSpeed || 0,
      uploadSpeed: torrent.uploadSpeed || 0,
      timeRemaining: torrent.timeRemaining || 0
    };
  }

  destroy(): void {
    if (this.client) {
      this.activeTorrents.forEach((torrent) => {
        try { this.client?.remove(torrent); } catch {}
      });
      try { this.client.destroy(); } catch {}
      this.client = null;
    }
    this.activeTorrents.clear();
  }
}
