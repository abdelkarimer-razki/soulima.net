import { Component, OnInit, NgZone, HostListener, ViewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { MoviedbAPIService } from '../services/moviedb-api.service';
import { TorrentSearchService, Torrent } from '../services/torrent-search.service';
import { DomSanitizer, SafeResourceUrl, Title, Meta } from '@angular/platform-browser';
import { SeoService } from '../services/seo.service';
import { ServerConfigService, ServerEntry } from '../services/server-config.service';
import { CustomPlayerComponent } from '../components/custom-player/custom-player.component';

@Component({
  selector: 'app-movie',
  templateUrl: './movie.component.html',
  styleUrls: ['./movie.component.css']
})
export class MovieComponent implements OnInit {

  id: number = 0;
  movie: any = '';
  link: SafeResourceUrl = '';

  servers: ServerEntry[] = [
    { name: 'Server 1 (Vidsrc.to)',     url: 'https://vidsrc.to/embed',                 format: 'standard' },
    { name: 'Server 2 (Vidlink.pro)',   url: 'https://vidlink.pro',                     format: 'standard' },
    { name: 'Server 3 (Embed.su)',      url: 'https://embed.su/embed',                  format: 'standard' },
    { name: 'Server 4 (SmashyStream)',  url: 'https://player.smashy.stream',            format: 'smashy' },
    { name: 'Server 5 (Multiembed)',    url: 'https://multiembed.mov',                  format: 'multiembed' },
    { name: 'Server 6 (Autoembed)',     url: 'https://autoembed.cc/embed',              format: 'standard' },
    { name: 'Server 7 (2embed.cc)',     url: 'https://2embed.cc/embed',                 format: 'standard' },
    { name: 'Server 8 (Vidsrc.pro)',    url: 'https://vidsrc.pro/embed',                format: 'standard' },
    { name: 'Server 9 (Vidsrc.me)',     url: 'https://vidsrc.me/embed',                 format: 'standard' },
    { name: 'Server 10 (Moviedata)',    url: 'https://moviedata.info/embed',            format: 'standard' },
    { name: 'Server 11 (Vidbinge)',     url: 'https://vidbinge.dev/embed',              format: 'standard' },
    { name: 'Server 12 (SuperEmbed)',   url: 'https://superembed.stream',               format: 'standard' },
    { name: 'Server 13 (MoviesAPI)',    url: 'https://moviesapi.club',                  format: 'standard' },
    { name: 'Server 14 (Cineby)',       url: 'https://cineby.app',                      format: 'standard' },
    { name: 'Server 15 (Gomoplayer)',   url: 'https://gomo.to',                        format: 'standard' },
    { name: 'Server 16 (Rive)',         url: 'https://rive.zone',                       format: 'standard' },
    { name: 'Server 17 (Moviesapi.net)', url: 'https://moviesapi.net',                  format: 'standard' },
    { name: 'Server 18 (Vidflix)',      url: 'https://vidflix.net',                     format: 'standard' },
    { name: 'Server 19 (Filmsss)',      url: 'https://filmsss.com',                     format: 'standard' },
    { name: 'Server 20 (Cinezone)',     url: 'https://cinezone.net',                    format: 'standard' },
  ];
  selectedServerIndex = 0;
  loading = true;
  showControls = true;
  showServerDropdown = false;
  private controlsTimeout: any = null;

  /** 'checking' | 'online' | 'offline' for each server */
  serverStatus: string[] = this.servers.map(() => 'checking');

  /** Tracks which servers were already tried this session */
  private triedServers = new Set<number>();

  private readonly SERVER_CACHE_KEY = 'soulima_server_status';
  private readonly RELIABILITY_KEY = 'soulima_server_reliability';
  private readonly FAILURE_THRESHOLD = 0.7;
  private heartbeatTimer: any = null;
  private videoConfirmed = false;

  @ViewChild('player') player!: CustomPlayerComponent;

  // Torrent state
  torrents: Torrent[] = [];
  selectedTorrent: Torrent | null = null;
  torrentMagnet: string | undefined = undefined;
  isSearchingTorrents = false;
  torrentSearchDone = false;
  showTorrentList = false;

  constructor(
    private route: ActivatedRoute,
    private moviedbAPIService: MoviedbAPIService,
    private torrentSearchService: TorrentSearchService,
    private sanitizer: DomSanitizer,
    private zone: NgZone,
    private titleService: Title,
    private metaService: Meta,
    private seoService: SeoService,
    private serverConfig: ServerConfigService
  ) {
    this.route.params.subscribe(params => {
      this.id = Number(params['id']);
      this.updateLink();
    });
  }

  updateLink() {
    const server = this.servers[this.selectedServerIndex];
    let constructedUrl = '';
    if (server.format === 'smashy') {
      constructedUrl = `${server.url}/movie/${this.id}`;
    } else if (server.format === 'multiembed') {
      constructedUrl = `${server.url}/?video_id=${this.id}&tmdb=1`;
    } else {
      constructedUrl = `${server.url}/movie/${this.id}?player=new&ds_lang=ar`;
    }
    const proxyUrl = `/api/embed-proxy?url=${encodeURIComponent(constructedUrl)}`;
    this.link = this.sanitizer.bypassSecurityTrustResourceUrl(proxyUrl);
    this.triedServers.add(this.selectedServerIndex);
    this.resetHeartbeat();
    setTimeout(() => this.player?.switchToServer());
  }

  selectServer(index: number) {
    this.selectedServerIndex = index;
    this.updateLink();
  }

  showPlayerControls() {
    this.showControls = true;
    if (this.controlsTimeout) {
      clearTimeout(this.controlsTimeout);
    }
    this.controlsTimeout = setTimeout(() => {
      this.showControls = false;
      this.showServerDropdown = false;
    }, 3500);
    this.resetHeartbeat();
  }

  toggleServerDropdown(event?: Event) {
    if (event) {
      event.stopPropagation();
    }
    this.showServerDropdown = !this.showServerDropdown;
  }

  reportUnavailable(index: number) {
    this.serverStatus[index] = 'offline';
    this.updateReliability(index, false);
    this.saveServerCache();
    const nextIndex = this.serverStatus.findIndex(
      (s, i) => s === 'online' && !this.triedServers.has(i)
    );
    if (nextIndex !== -1) {
      this.selectServer(nextIndex);
    } else {
      this.triedServers.clear();
      this.checkAllServers();
      setTimeout(() => {
        if (!this.serverStatus.includes('online')) {
          this.autoTorrentFallback();
        }
      }, 7000);
    }
  }

  /** Called when the iframe fails to load — marks server offline, no auto-switch */
  onIframeError() {
    this.clearHeartbeat();
    this.serverStatus[this.selectedServerIndex] = 'offline';
    this.updateReliability(this.selectedServerIndex, false);
    this.saveServerCache();
    setTimeout(() => {
      if (!this.serverStatus.includes('online')) {
        this.autoTorrentFallback();
      }
    }, 7000);
  }

  /** Listen for postMessage from embed iframes (some providers send play/error events) */
  @HostListener('window:message', ['$event'])
  onMessage(event: MessageEvent) {
    const embedOrigins = this.servers.map(s => {
      try { return new URL(s.url).origin; } catch { return ''; }
    }).filter(Boolean);
    if (!embedOrigins.includes(event.origin)) return;

    const data = event.data;
    if (!data) return;

    const type = data.type || data.event || data.action || '';
    const state = data.state || data.status || '';
    const isPlaying = /playing|play|start|buffering/i.test(type) || /playing|play/i.test(state);
    const isError = /error|fail|unavailable|notfound/i.test(type) || /error|fail/i.test(state);

    if (isPlaying) {
      this.videoConfirmed = true;
      this.clearHeartbeat();
    } else if (isError) {
      this.onIframeError();
    }
  }

  /** Start heartbeat: if no play signal or user activity within 5min, try next server */
  private resetHeartbeat() {
    this.clearHeartbeat();
    this.heartbeatTimer = setTimeout(() => {
      if (!this.videoConfirmed) {
        this.onIframeError();
      }
    }, 300000);
  }

  private clearHeartbeat() {
    if (this.heartbeatTimer) {
      clearTimeout(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private autoTorrentFallback() {
    if (!this.torrentSearchDone && !this.isSearchingTorrents) {
      this.searchTorrents();
    }
  }

  /** Search torrents for this movie via YTS */
  searchTorrents() {
    if (this.isSearchingTorrents) return;

    const title = this.movie?.original_title || this.movie?.title || '';
    const year = this.movie?.release_date?.split('-')[0];
    const imdbId = this.movie?.imdb_id;

    this.isSearchingTorrents = true;
    this.showTorrentList = true;

    this.torrentSearchService.searchMovieTorrents(title, year ? Number(year) : undefined, imdbId)
      .subscribe({
        next: (results) => {
          this.torrents = results;
          this.isSearchingTorrents = false;
          this.torrentSearchDone = true;

          if (results.length > 0) {
            const preferred = results.find(t => t.quality === '1080p') || results[0];
            this.selectTorrent(preferred);
          }
        },
        error: () => {
          this.isSearchingTorrents = false;
          this.torrentSearchDone = true;
          this.torrents = [];
        }
      });
  }

  selectTorrent(torrent: Torrent) {
    this.selectedTorrent = torrent;
    this.torrentMagnet = torrent.magnet;
    this.showTorrentList = false;
    setTimeout(() => this.player?.switchToTorrent());
  }

  clearTorrent() {
    this.selectedTorrent = null;
    this.torrentMagnet = undefined;
    this.showTorrentList = false;
    this.torrentSearchDone = false;
    this.torrents = [];
  }

  downloadMagnet(magnet: string) {
    window.open(magnet, '_self');
  }

  /** Download via YTS (opens in new tab) */
  openYtsDownload() {
    const title = this.movie?.title || this.movie?.original_title || '';
    const year  = this.movie?.release_date?.split('-')[0] || '';
    const query = encodeURIComponent(title + (year ? ' ' + year : ''));
    window.open(`https://yts.mx/browse-movies/${query}`, '_blank');
  }

  private buildCheckUrl(server: ServerEntry): string {
    if (server.format === 'smashy') {
      return `${server.url}/movie/${this.id}`;
    } else if (server.format === 'multiembed') {
      return `${server.url}/?video_id=${this.id}&tmdb=1`;
    }
    return `${server.url}/movie/${this.id}`;
  }

  private async checkServerStatus(server: ServerEntry): Promise<string> {
    const checkUrl = this.buildCheckUrl(server);
    const timeout = 2500;

    try {
      return await this.serverConfig.checkServer(checkUrl, timeout);
    } catch {
      return 'offline';
    }
  }

  private isServerUnreliable(index: number): boolean {
    const reliability = this.loadReliability();
    const r = reliability[index];
    if (!r || r.attempts < 3) return false;
    return r.failures / r.attempts > this.FAILURE_THRESHOLD;
  }

  private checkAllServers() {
    this.serverStatus = this.servers.map(() => 'checking');

    const reliability = this.loadReliability();
    const ranked = this.servers
      .map((s, i) => ({ server: s, index: i }))
      .filter(({ index }) => !this.isServerUnreliable(index))
      .sort((a, b) => {
        const ra = reliability[a.index];
        const rb = reliability[b.index];
        const scoreA = ra ? (ra.attempts - ra.failures) / ra.attempts : 0.5;
        const scoreB = rb ? (rb.attempts - rb.failures) / rb.attempts : 0.5;
        return scoreB - scoreA;
      });

    if (ranked.length === 0) {
      this.serverStatus = this.servers.map(() => 'offline');
      this.autoTorrentFallback();
      return;
    }

    ranked.forEach(({ server, index }) => {
      this.checkServerStatus(server).then(status => {
        this.zone.run(() => {
          this.serverStatus[index] = status;
          this.setDefaultToFirstWorkingServer();
          this.saveServerCache();
          if (status === 'online') this.updateReliability(index, true);
        });
      });
    });
  }

  private recheckServersInBackground() {
    this.servers.forEach((server, i) => {
      this.checkServerStatus(server).then(status => {
        this.zone.run(() => {
          this.serverStatus[i] = status;
          this.saveServerCache();
        });
      });
    });
  }

  private getServerCheckQueue(): { server: ServerEntry; index: number }[] {
    const reliability = this.loadReliability();
    return this.servers
      .map((s, i) => ({ server: s, index: i }))
      .filter(({ index }) => !this.isServerUnreliable(index))
      .sort((a, b) => {
        const ra = reliability[a.index];
        const rb = reliability[b.index];
        const scoreA = ra ? (ra.attempts - ra.failures) / ra.attempts : 0.5;
        const scoreB = rb ? (rb.attempts - rb.failures) / rb.attempts : 0.5;
        return scoreB - scoreA;
      });
  }

  private setDefaultToFirstWorkingServer() {
    const firstOnlineIndex = this.serverStatus.findIndex(s => s === 'online');
    if (firstOnlineIndex !== -1 && !this.triedServers.has(firstOnlineIndex)) {
      this.selectedServerIndex = firstOnlineIndex;
      this.updateLink();
    } else if (firstOnlineIndex !== -1 && this.triedServers.has(firstOnlineIndex)) {
      const untriedOnline = this.serverStatus.findIndex(
        (s, i) => s === 'online' && !this.triedServers.has(i)
      );
      if (untriedOnline !== -1) {
        this.selectedServerIndex = untriedOnline;
        this.updateLink();
      }
    }
  }

  isCheckingServers(): boolean {
    return this.serverStatus.includes('checking');
  }

  hasOnlineServer(): boolean {
    return this.serverStatus.includes('online');
  }

  private loadServerCache(): string[] | null {
    try {
      const raw = localStorage.getItem(this.SERVER_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.timestamp && Date.now() - parsed.timestamp < 300000) {
          return parsed.status;
        }
      }
    } catch {}
    return null;
  }

  private saveServerCache() {
    try {
      localStorage.setItem(this.SERVER_CACHE_KEY, JSON.stringify({
        status: this.serverStatus,
        timestamp: Date.now()
      }));
    } catch {}
  }

  private loadReliability(): Record<number, { attempts: number; failures: number }> {
    try {
      const raw = localStorage.getItem(this.RELIABILITY_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  private saveReliability(data: Record<number, { attempts: number; failures: number }>) {
    try {
      localStorage.setItem(this.RELIABILITY_KEY, JSON.stringify(data));
    } catch {}
  }

  private updateReliability(serverIndex: number, success: boolean) {
    const data = this.loadReliability();
    if (!data[serverIndex]) {
      data[serverIndex] = { attempts: 0, failures: 0 };
    }
    data[serverIndex].attempts++;
    if (!success) data[serverIndex].failures++;
    this.saveReliability(data);
  }

  ngOnInit(): void {
    this.serverConfig.getServers().then(remote => {
      if (remote && remote.length >= this.servers.length) {
        this.servers = remote;
        this.serverStatus = this.servers.map(() => 'checking');
      }
    });

    this.moviedbAPIService.getMovieDetails(this.id).subscribe((response: any) => {
      this.movie = response;
      this.loading = false;

      const movieTitle = this.movie?.title || this.movie?.original_title || "Movie";
      const movieYear = this.movie?.release_date ? ` (${this.movie.release_date.split('-')[0]})` : "";
      const movieDesc = this.movie?.overview || `Stream '${movieTitle}'${movieYear} in HD for free on Soulima. Watch with multiple fast server mirrors and high-speed magnet download links.`;
      const movieImg = this.movie?.backdrop_path ? `https://image.tmdb.org/t/p/w500${this.movie.backdrop_path}` : 'https://www.soulima.net/assets/soulima.png';
      const movieUrl = `https://soulima.net/#/movie/${this.id}`;

      this.seoService.updateMeta({
        title: `Watch ${movieTitle}${movieYear} Free - Soulima`,
        description: movieDesc,
        keywords: `${movieTitle}, watch ${movieTitle}, watch ${movieTitle} free, streaming ${movieTitle}, Soulima movies`,
        image: movieImg,
        url: movieUrl,
        type: 'video.movie',
        schema: {
          "@context": "https://schema.org",
          "@type": "Movie",
          "name": movieTitle,
          "image": movieImg,
          "description": movieDesc,
          "dateCreated": this.movie?.release_date || "",
          "url": movieUrl,
          "aggregateRating": this.movie?.vote_average ? {
            "@type": "AggregateRating",
            "ratingValue": this.movie.vote_average,
            "bestRating": "10",
            "worstRating": "1",
            "ratingCount": this.movie.vote_count || 10
          } : undefined
        }
      });

      this.getRecentlyWatched();
      this.updateLink();
      this.searchTorrents();
    });
    this.checkAllServers();
    this.showPlayerControls();
  }

  getRecentlyWatched() {
    const raw = localStorage.getItem('movies');
    let movies: any[] = raw ? JSON.parse(raw) : [];
    movies = movies.filter((m: any) => m && Number(m.id) !== Number(this.id));
    movies.unshift(this.movie);
    movies = movies.slice(0, 20);
    localStorage.setItem('movies', JSON.stringify(movies));
  }
}
