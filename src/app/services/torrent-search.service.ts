import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';

export interface Torrent {
  id: string;
  name: string;
  magnet: string;
  quality: string;
  seeders: number;
  leechers: number;
  filesize?: string;
  type: 'movie' | 'tv';
}

@Injectable({
  providedIn: 'root'
})
export class TorrentSearchService {
  private torrentCache = new Map<string, Torrent[]>();

  constructor(private http: HttpClient) {}

  searchMovieTorrents(title: string, year?: number, imdbId?: string): Observable<Torrent[]> {
    const cacheKey = `movie_${imdbId || title}_${year || ''}`;
    if (this.torrentCache.has(cacheKey)) {
      return of(this.torrentCache.get(cacheKey) || []);
    }

    return this.http.post<any>('/api/search-torrents', {
      type: 'movie',
      title,
      year,
      imdbId,
    }).pipe(
      map(response => {
        const torrents: Torrent[] = (response.torrents || []).map((t: any) => ({
          id: t.id,
          name: t.name,
          magnet: t.magnet,
          quality: t.quality,
          seeders: t.seeders,
          leechers: t.leechers,
          filesize: t.filesize,
          type: 'movie' as const,
        }));
        this.torrentCache.set(cacheKey, torrents);
        return torrents;
      }),
      catchError(() => {
        return of([]);
      })
    );
  }

  searchTVTorrents(title: string, season: number, episode: number): Observable<Torrent[]> {
    const cleanTitle = title.replace(/[^a-zA-Z0-9\s]/g, '').trim();
    const query = `${cleanTitle} S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`;
    const cacheKey = `tv_${query}`;

    if (this.torrentCache.has(cacheKey)) {
      return of(this.torrentCache.get(cacheKey) || []);
    }

    return this.http.post<any>('/api/search-torrents', {
      type: 'tv',
      title,
      season,
      episode,
    }).pipe(
      map(response => {
        const torrents: Torrent[] = (response.torrents || []).map((t: any) => ({
          id: t.id,
          name: t.name,
          magnet: t.magnet,
          quality: t.quality,
          seeders: t.seeders,
          leechers: t.leechers,
          filesize: t.filesize,
          type: 'tv' as const,
        }));
        this.torrentCache.set(cacheKey, torrents);
        return torrents;
      }),
      catchError(() => {
        return of([]);
      })
    );
  }

  clearCache(): void {
    this.torrentCache.clear();
  }
}
