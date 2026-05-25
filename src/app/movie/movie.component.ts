import { Component, OnInit, ElementRef, ViewChild, NgZone } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { MoviedbAPIService } from '../services/moviedb-api.service';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { HttpClient } from '@angular/common/http';
import { CookieService } from 'ngx-cookie-service';

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
    { name: 'Server 5 (Vidsrc.me)',  url: 'https://vidsrc.me/embed'  }
  ];
  selectedServerIndex = 0;

  /** 'checking' | 'online' | 'offline' for each server */
  serverStatus: string[] = this.servers.map(() => 'checking');

  @ViewChild('vidsrc', { static: false }) iframe!: ElementRef;

  constructor(
    private route: ActivatedRoute,
    private moviedbAPIService: MoviedbAPIService,
    private sanitizer: DomSanitizer,
    private http: HttpClient,
    private cookie: CookieService,
    private zone: NgZone
  ) {
    this.route.params.subscribe(params => {
      this.id = params['id'];
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

  /** Let the user manually flag media-unavailable (cross-origin iframes prevent auto-detection) */
  reportUnavailable(index: number) {
    this.serverStatus[index] = 'offline';
  }

  /** Open YTS search for the movie title — works reliably and is free */
  openDownload() {
    const title = this.movie?.title || this.movie?.original_title || '';
    const year  = this.movie?.release_date?.split('-')[0] || '';
    const query = encodeURIComponent(title + (year ? ' ' + year : ''));
    window.open(`https://yts.mx/browse-movies/${query}`, '_blank');
  }

  /** Probe each server embed URL with a no-cors fetch + 6 s timeout */
  private async checkServerStatus(url: string): Promise<string> {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 6000);
    try {
      await fetch(`${url}/movie/${this.id}`, {
        mode: 'no-cors',
        signal: controller.signal
      });
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
        this.zone.run(() => { this.serverStatus[i] = status; });
      });
    });
  }

  ngOnInit(): void {
    this.moviedbAPIService.getMovieDetails(this.id).subscribe((response: any) => {
      this.movie = response;
      this.getRecentlyWatched();
    });
    this.checkAllServers();
  }

  getRecentlyWatched() {
    var Movieslocal = localStorage.getItem('movies');
    var Movies: any = [];
    if (Movieslocal) Movies = JSON.parse(Movieslocal);
    if (this.findElement(Movies) == false) {
      if (Movies.length == 20) Movies[0] = this.movie;
      else Movies.unshift(this.movie);
    } else {
      for (let i = 0; i < Movies.length; i++)
        if (Movies[i].id == this.id) Movies.splice(i, 1);
      if (Movies.length > 0) Movies.unshift(this.movie);
      else Movies.push(this.movie);
    }
    localStorage.setItem('movies', JSON.stringify(Movies));
  }

  findElement(Movies: any): boolean {
    for (let i = 0; i < Movies.length; i++)
      if (Movies[i].id == this.id) return true;
    return false;
  }
}
