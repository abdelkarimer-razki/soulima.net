import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map, catchError, shareReplay } from 'rxjs/operators';

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
  private readonly YTS_API = 'https://yts.mx/api/v2';
  private torrentCache = new Map<string, Torrent[]>();

  constructor(private http: HttpClient) {}

  private parseQuality(name: string): string {
    const titleLower = name.toLowerCase();
    if (titleLower.includes('2160p') || titleLower.includes('4k')) return '2160p';
    if (titleLower.includes('1080p')) return '1080p';
    if (titleLower.includes('720p')) return '720p';
    if (titleLower.includes('480p')) return '480p';
    return 'HD/SD';
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Search for movie torrents on YTS, falling back to Apibay if YTS returns no matches
   */
  searchMovieTorrents(title: string, year?: number, imdbId?: string): Observable<Torrent[]> {
    const cacheKey = `movie_${imdbId || title}_${year || ''}`;
    
    // Check cache first
    if (this.torrentCache.has(cacheKey)) {
      return of(this.torrentCache.get(cacheKey) || []);
    }

    // Clean title for search
    const cleanTitle = title.replace(/[^a-zA-Z0-9\s]/g, '').trim();

    // Prioritize IMDB ID query for 100% accurate results
    const queryTerm = imdbId ? imdbId : (cleanTitle + (year ? ` ${year}` : ''));

    return this.http.get<any>(`${this.YTS_API}/list.json`, {
      params: {
        query_term: queryTerm,
        limit: 5,
        sort_by: 'seeds'
      }
    }).pipe(
      map(response => {
        if (!response.data || !response.data.movies || response.data.movies.length === 0) {
          throw new Error('YTS returned no movies');
        }

        const torrents: Torrent[] = [];
        response.data.movies.forEach((movie: any) => {
          if (movie.torrents) {
            movie.torrents.forEach((torrent: any) => {
              torrents.push({
                id: `yts_${movie.id}_${torrent.hash}`,
                name: `${movie.title_english} (${torrent.quality})`,
                magnet: this.buildMagnet(torrent.hash, movie.title_english),
                quality: torrent.quality,
                seeders: torrent.seeds,
                leechers: torrent.peers,
                filesize: torrent.size,
                type: 'movie'
              });
            });
          }
        });

        this.torrentCache.set(cacheKey, torrents);
        return torrents;
      }),
      catchError(() => {
        // Fallback to Apibay search using IMDB ID or title
        return this.searchMovieApibay(cleanTitle, year, imdbId).pipe(
          map(results => {
            this.torrentCache.set(cacheKey, results);
            return results;
          })
        );
      })
    );
  }

  /**
   * Fallback Movie Search on Apibay (using CORS proxy)
   */
  private searchMovieApibay(title: string, year?: number, imdbId?: string): Observable<Torrent[]> {
    const query = imdbId ? imdbId : (year ? `${title} ${year}` : title);
    const targetUrl = `https://apibay.org/q.php?q=${encodeURIComponent(query)}`;
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`;

    return this.http.get<any>(proxyUrl).pipe(
      map(corsResponse => {
        const response = JSON.parse(corsResponse.contents);
        if (!Array.isArray(response) || response.length === 0 || (response.length === 1 && response[0].id === '0')) {
          return [];
        }

        const trackers = [
          'udp://tracker.coppersurfer.tk:6969/announce',
          'udp://tracker.openbittorrent.com:6969/announce',
          'udp://tracker.opentrackr.org:1337/announce',
          'udp://open.stealth.si:80/announce',
          'udp://tracker.torrent.eu.org:451/announce',
          // WebRTC Trackers:
          'wss://tracker.openwebtorrent.com',
          'wss://tracker.btorrent.xyz',
          'wss://tracker.files.fm:7073/announce',
          'wss://tracker.gbitt.info:443/announce',
          'wss://tracker.novage.com.ua:443/announce'
        ];
        const trackerString = trackers.map(t => `&tr=${encodeURIComponent(t)}`).join('');

        const torrents: Torrent[] = response
          .filter(item => item.info_hash && item.info_hash !== '0000000000000000000000000000000000000000')
          .map(item => {
            return {
              id: `apibay_${item.id}`,
              name: item.name,
              magnet: `magnet:?xt=urn:btih:${item.info_hash}&dn=${encodeURIComponent(item.name)}${trackerString}`,
              quality: this.parseQuality(item.name),
              seeders: Number(item.seeders) || 0,
              leechers: Number(item.leechers) || 0,
              filesize: this.formatBytes(Number(item.size) || 0),
              type: 'movie' as const
            };
          });

        torrents.sort((a, b) => b.seeders - a.seeders);
        return torrents;
      }),
      catchError(() => of([]))
    );
  }

  /**
   * Build magnet link from YTS torrent hash (adding WebRTC trackers)
   */
  private buildMagnet(hash: string, title: string): string {
    const trackers = [
      'udp://open.demonii.com:1337/announce',
      'udp://tracker.openbittorrent.com:80/announce',
      'udp://tracker.publicbt.com:80/announce',
      'udp://tracker.istole.it:80/announce',
      'http://tracker.bittorrent.am/announce',
      'http://announce.torrentsmd.com:6969/announce',
      // WebRTC Trackers:
      'wss://tracker.openwebtorrent.com',
      'wss://tracker.btorrent.xyz',
      'wss://tracker.files.fm:7073/announce',
      'wss://tracker.gbitt.info:443/announce',
      'wss://tracker.novage.com.ua:443/announce'
    ];

    const trackerString = trackers.map(t => `&tr=${encodeURIComponent(t)}`).join('');
    return `magnet:?xt=urn:btih:${hash}&dn=${encodeURIComponent(title)}${trackerString}`;
  }

  /**
   * Search TV show torrents using the Pirate Bay (Apibay) API through a CORS proxy
   */
  searchTVTorrents(title: string, season: number, episode: number): Observable<Torrent[]> {
    // Clean show title for accurate search
    const cleanTitle = title.replace(/[^a-zA-Z0-9\s]/g, '').trim();
    const query = `${cleanTitle} S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`;
    
    const cacheKey = `tv_${query}`;
    if (this.torrentCache.has(cacheKey)) {
      return of(this.torrentCache.get(cacheKey) || []);
    }

    const targetUrl = `https://apibay.org/q.php?q=${encodeURIComponent(query)}`;
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`;

    return this.http.get<any>(proxyUrl).pipe(
      map(corsResponse => {
        const response = JSON.parse(corsResponse.contents);
        if (!Array.isArray(response) || response.length === 0 || (response.length === 1 && response[0].id === '0')) {
          return [];
        }

        const trackers = [
          'udp://tracker.coppersurfer.tk:6969/announce',
          'udp://tracker.openbittorrent.com:6969/announce',
          'udp://tracker.opentrackr.org:1337/announce',
          'udp://open.stealth.si:80/announce',
          'udp://tracker.torrent.eu.org:451/announce',
          'udp://tracker.cyberia.is:6969/announce',
          // WebRTC Trackers:
          'wss://tracker.openwebtorrent.com',
          'wss://tracker.btorrent.xyz',
          'wss://tracker.files.fm:7073/announce',
          'wss://tracker.gbitt.info:443/announce',
          'wss://tracker.novage.com.ua:443/announce'
        ];
        const trackerString = trackers.map(t => `&tr=${encodeURIComponent(t)}`).join('');

        const torrents: Torrent[] = response
          .filter(item => item.info_hash && item.info_hash !== '0000000000000000000000000000000000000000')
          .map(item => {
            return {
              id: `apibay_${item.id}`,
              name: item.name,
              magnet: `magnet:?xt=urn:btih:${item.info_hash}&dn=${encodeURIComponent(item.name)}${trackerString}`,
              quality: this.parseQuality(item.name),
              seeders: Number(item.seeders) || 0,
              leechers: Number(item.leechers) || 0,
              filesize: this.formatBytes(Number(item.size) || 0),
              type: 'tv' as const
            };
          });

        torrents.sort((a, b) => b.seeders - a.seeders);
        this.torrentCache.set(cacheKey, torrents);
        return torrents;
      }),
      catchError(error => {
        console.error('TV show torrent search failed:', error);
        return of([]);
      })
    );
  }

  /**
   * Clear torrent cache
   */
  clearCache(): void {
    this.torrentCache.clear();
  }

  /**
   * Get cached torrents
   */
  getCachedTorrents(key: string): Torrent[] | null {
    return this.torrentCache.get(key) || null;
  }
}
