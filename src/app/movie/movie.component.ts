import { Component, OnInit, HostListener, OnDestroy } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { MoviedbAPIService } from '../services/moviedb-api.service';
import { DomSanitizer, SafeResourceUrl, Title, Meta } from '@angular/platform-browser';
import { SeoService } from '../services/seo.service';
import { ServerConfigService, ServerEntry, ServerHealth } from '../services/server-config.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-movie',
  templateUrl: './movie.component.html',
  styleUrls: ['./movie.component.css']
})
export class MovieComponent implements OnInit, OnDestroy {

  id: number = 0;
  movie: any = '';
  link: SafeResourceUrl = '';
  iframeOriginalUrl: string = '';

  servers: ServerEntry[] = [];
  selectedServerIndex = 0;
  loading = true;
  showControls = true;
  showServerDropdown = false;
  private controlsTimeout: any = null;

  /** 'checking' | 'online' | 'offline' for each server */
  serverStatus: ServerHealth[] = [];

  private heartbeatTimer: any = null;
  private videoConfirmed = false;
  private subs: Subscription[] = [];

  constructor(
    private route: ActivatedRoute,
    private moviedbAPIService: MoviedbAPIService,
    private sanitizer: DomSanitizer,
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

  ngOnDestroy() {
    this.subs.forEach(s => s.unsubscribe());
    this.clearHeartbeat();
  }

  private subscribeToServers() {
    this.subs.push(
      this.serverConfig.servers$.subscribe(s => {
        this.servers = s;
        this.serverStatus = this.serverConfig.getStatus();
      }),
      this.serverConfig.status$.subscribe(s => {
        this.serverStatus = s;
        this.syncSelectedToOnline();
      }),
      this.serverConfig.selectedIndex$.subscribe(i => {
        const changed = i !== this.selectedServerIndex;
        this.selectedServerIndex = i;
        if (changed) this.updateLink();
      })
    );
  }

  updateLink() {
    const constructedUrl = this.serverConfig.buildEmbedUrl(this.selectedServerIndex, 'movie', this.id);
    this.link = this.sanitizer.bypassSecurityTrustResourceUrl(constructedUrl);
    this.iframeOriginalUrl = constructedUrl;
    this.resetHeartbeat();
  }

  selectServer(index: number) {
    this.serverConfig.select(index);
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
    this.serverConfig.reportUnavailable(index);
  }

  /** Called when the iframe fails to load — marks server offline, no auto-switch */
  onIframeError() {
    this.clearHeartbeat();
    this.serverConfig.markOffline(this.selectedServerIndex);
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
      this.serverConfig.confirmPlayable(this.selectedServerIndex);
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

  isCheckingServers(): boolean {
    return this.serverConfig.isChecking();
  }

  hasOnlineServer(): boolean {
    return this.serverConfig.hasOnline();
  }

  private syncSelectedToOnline() {
    if (this.serverStatus[this.selectedServerIndex] === 'online') return;
    const next = this.serverConfig.firstOnlineUntried();
    if (next !== -1) {
      this.serverConfig.select(next);
    }
  }

  ngOnInit(): void {
    this.serverConfig.init();
    this.subscribeToServers();

    this.moviedbAPIService.getMovieDetails(this.id).subscribe((response: any) => {
      this.movie = response;
      this.loading = false;

      const movieTitle = this.movie?.title || this.movie?.original_title || "Movie";
      const movieYear = this.movie?.release_date ? ` (${this.movie.release_date.split('-')[0]})` : "";
      const movieDesc = this.movie?.overview || `Stream '${movieTitle}'${movieYear} in HD for free on Soulima. Watch with multiple fast server mirrors.`;
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
    });
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
