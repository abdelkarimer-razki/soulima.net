import { Component, OnInit, NgZone } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { MoviedbAPIService } from '../services/moviedb-api.service';
import { TorrentSearchService, Torrent } from '../services/torrent-search.service';
import { DomSanitizer, SafeResourceUrl, Title, Meta } from '@angular/platform-browser';
import { SeoService } from '../services/seo.service';

@Component({
  selector: 'app-movie',
  templateUrl: './movie.component.html',
  styleUrls: ['./movie.component.css']
})
export class MovieComponent implements OnInit {

  id: number = 0;
  movie: any = '';
  link: SafeResourceUrl = '';

  servers = [
    { name: 'Server 1 (Vidsrc.net)', url: 'https://vidsrc.net/embed' },
    { name: 'Server 2 (Vidsrc.to)',  url: 'https://vidsrc.to/embed'  },
    { name: 'Server 3 (Embed.su)',   url: 'https://embed.su/embed'   },
    { name: 'Server 4 (Vidsrc.pro)', url: 'https://vidsrc.pro/embed' },
    { name: 'Server 5 (Vidsrc.me)',  url: 'https://vidsrc.me/embed'  },
    { name: 'Server 6 (2embed.cc)',  url: 'https://2embed.cc/embed'  },
    { name: 'Server 7 (Vidsrc.in)',  url: 'https://vidsrc.in/embed'  },
    { name: 'Server 8 (Streamhide)', url: 'https://streamhide.to/embed' },
    { name: 'Server 9 (Autoembed)',  url: 'https://autoembed.cc/embed' },
    { name: 'Server 10 (Moviedata)',  url: 'https://moviedata.info/embed' }
  ];
  selectedServerIndex = 0;
  showControls = true;
  showServerDropdown = false;
  private controlsTimeout: any = null;

  /** 'checking' | 'online' | 'offline' for each server */
  serverStatus: string[] = this.servers.map(() => 'checking');

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
    private seoService: SeoService
  ) {
    this.route.params.subscribe(params => {
      this.id = Number(params['id']);
      this.updateLink();
    });
  }

  updateLink() {
    const embedUrl = this.servers[this.selectedServerIndex].url;
    this.link = this.sanitizer.bypassSecurityTrustResourceUrl(
      `${embedUrl}/movie/${this.id}?player=new&ds_lang=ar`
    );
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
  }

  toggleServerDropdown(event?: Event) {
    if (event) {
      event.stopPropagation();
    }
    this.showServerDropdown = !this.showServerDropdown;
  }

  reportUnavailable(index: number) {
    this.serverStatus[index] = 'offline';
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

          // Auto-select best torrent (most seeds, 1080p preferred)
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

  private async checkServerStatus(url: string): Promise<string> {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 6000);
    try {
      await fetch(`${url}/movie/${this.id}`, { mode: 'no-cors', signal: controller.signal });
      clearTimeout(tid);
      return 'online';
    } catch {
      clearTimeout(tid);
      return 'offline';
    }
  }

  private checkAllServers() {
    this.serverStatus = this.servers.map(() => 'checking');
    this.servers.forEach((server, i) => {
      this.checkServerStatus(server.url).then(status => {
        this.zone.run(() => {
          this.serverStatus[i] = status;
          this.setDefaultToFirstWorkingServer();
        });
      });
    });
  }

  private setDefaultToFirstWorkingServer() {
    const firstOnlineIndex = this.serverStatus.findIndex(s => s === 'online');
    if (firstOnlineIndex !== -1) {
      this.selectedServerIndex = firstOnlineIndex;
      this.updateLink();
    }
  }

  isCheckingServers(): boolean {
    return this.serverStatus.includes('checking');
  }

  ngOnInit(): void {
    this.moviedbAPIService.getMovieDetails(this.id).subscribe((response: any) => {
      this.movie = response;

      // Update dynamic SEO titles and metadata using centralized SeoService
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
    });
    this.checkAllServers();
    this.showPlayerControls();
  }

  getRecentlyWatched() {
    const raw = localStorage.getItem('movies');
    let movies: any[] = raw ? JSON.parse(raw) : [];
    // Strict deduplication by ID matching (converting both to numbers to avoid string/number mismatch)
    movies = movies.filter((m: any) => m && Number(m.id) !== Number(this.id));
    movies.unshift(this.movie);
    movies = movies.slice(0, 20);
    localStorage.setItem('movies', JSON.stringify(movies));
  }
}
