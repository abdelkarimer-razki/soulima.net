import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { TorrentService } from './torrent.service';

export interface SubtitleTrack {
  lang: string;
  langName: string;
  fileId: string;
}

@Injectable({ providedIn: 'root' })
export class SubtitleService {
  private streamServerUrl = 'http://localhost:3030';

  constructor(private http: HttpClient, private torrentService: TorrentService) {}

  setStreamServerUrl(url: string) {
    this.streamServerUrl = url;
  }

  async getSubtitles(tmdbId: number, season?: number, episode?: number): Promise<SubtitleTrack[]> {
    try {
      let url = `${this.streamServerUrl}/api/subtitles?tmdbId=${tmdbId}`;
      if (season !== undefined && episode !== undefined) {
        url += `&season=${season}&episode=${episode}`;
      } else {
        const imdbId = await this.torrentService.getImdbId(tmdbId, 'movie');
        if (imdbId) url += `&imdbId=${encodeURIComponent(imdbId)}`;
      }
      const data: any = await this.http.get(url).toPromise();
      return data?.tracks || [];
    } catch {
      return [];
    }
  }

  /** Fetch subtitle text, optionally with a streamId so the server can auto-sync it */
  getSubtitleText(fileId: string, streamId?: string | null): Promise<string> {
    let url = `${this.streamServerUrl}/api/subtitles/content/${fileId}`;
    if (streamId) url += `?streamId=${encodeURIComponent(streamId)}`;
    return this.http
      .get(url, { responseType: 'text' })
      .toPromise() as Promise<string>;
  }
}
