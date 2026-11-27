import { Injectable } from '@angular/core';
import { HttpClient, HttpResponse } from '@angular/common/http';
import { TorrentService } from './torrent.service';

export interface SubtitleTrack {
  lang: string;
  langName: string;
  fileId: string;
}

export type SubtitleSyncStatus = 'unavailable' | 'pending' | 'syncing' | 'synced' | 'failed';

export interface SubtitleContentResponse {
  text: string;
  syncStatus: SubtitleSyncStatus;
}

@Injectable({ providedIn: 'root' })
export class SubtitleService {
  private streamServerUrl = 'http://localhost:3030';

  constructor(private http: HttpClient, private torrentService: TorrentService) {
    if (typeof window !== 'undefined' && window.location && window.location.hostname) {
      this.streamServerUrl = `http://${window.location.hostname}:3030`;
    }
  }

  setStreamServerUrl(url: string) {
    this.streamServerUrl = url;
  }

  getStreamServerUrl(): string {
    return this.streamServerUrl;
  }

  async getSubtitles(
    tmdbId: number,
    season?: number,
    episode?: number,
    title?: string,
    releaseName?: string
  ): Promise<SubtitleTrack[]> {
    let url = `${this.streamServerUrl}/api/subtitles?tmdbId=${tmdbId}`;
    if (season !== undefined && episode !== undefined) {
      url += `&season=${season}&episode=${episode}`;
    } else {
      const imdbId = await this.torrentService.getImdbId(tmdbId, 'movie').catch(() => null);
      if (imdbId) url += `&imdbId=${encodeURIComponent(imdbId)}`;
    }
    if (title) url += `&title=${encodeURIComponent(title)}`;
    if (releaseName) url += `&release=${encodeURIComponent(releaseName)}`;

    const data: any = await this.http.get(url).toPromise();
    const tracks: SubtitleTrack[] = data?.tracks || [];
    return tracks.filter(t => t.lang === 'ar' || t.lang === 'en');
  }

  prefetchSubtitles(tmdbId: number, season?: number, episode?: number): void {
    if (!tmdbId) return;
    this.getSubtitles(tmdbId, season, episode).then(tracks => {
      const topTracks = tracks.filter(t => t.lang === 'en' || t.lang === 'ar').slice(0, 2);
      for (const t of topTracks) {
        this.getSubtitleText(t.fileId).catch(() => {});
      }
    }).catch(() => {});
  }

  /** Fetch subtitle text along with verified X-Subtitle-Sync status */
  async getSubtitleContent(fileId: string, streamId?: string | null): Promise<SubtitleContentResponse> {
    let url = `${this.streamServerUrl}/api/subtitles/content/${encodeURIComponent(fileId)}`;
    if (streamId) url += `?streamId=${encodeURIComponent(streamId)}`;

    const res: HttpResponse<string> = await this.http
      .get(url, { responseType: 'text', observe: 'response' })
      .toPromise() as HttpResponse<string>;

    const headerStatus = res.headers.get('x-subtitle-sync') as SubtitleSyncStatus | null;
    const syncStatus: SubtitleSyncStatus = headerStatus || 'unavailable';
    const text = res.body || '';

    return { text, syncStatus };
  }

  /** Fetch subtitle text directly */
  async getSubtitleText(fileId: string, streamId?: string | null): Promise<string> {
    const res = await this.getSubtitleContent(fileId, streamId);
    return res.text;
  }
}
