import { Component, OnInit, NgZone } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { MoviedbAPIService } from '../services/moviedb-api.service';
import { TorrentSearchService, Torrent } from '../services/torrent-search.service';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

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
    private zone: NgZone
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

  reportUnavailable(index: number) {
    this.serverStatus[index] = 'offline';
  }

  /** Search torrents for this movie via YTS */
  searchTorrents() {
    if (this.isSearchingTorrents) return;

    const title = this.movie?.original_title || this.movie?.title || '';
    const year = this.movie?.release_date?.split('-')[0];

    this.isSearchingTorrents = true;
    this.showTorrentList = true;

    this.torrentSearchService.searchMovieTorrents(title, year ? Number(year) : undefined)
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

  ngOnInit(): void {
    this.moviedbAPIService.getMovieDetails(this.id).subscribe((response: any) => {
      this.movie = response;
      this.getRecentlyWatched();
      this.updateLink();
    });
    this.checkAllServers();
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
