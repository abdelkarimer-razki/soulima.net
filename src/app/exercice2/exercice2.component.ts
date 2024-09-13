import { Component,Renderer2  } from '@angular/core';
import { MoviedbAPIService } from '../services/moviedb-api.service';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { trigger, transition, style, animate } from '@angular/animations';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

@Component({
  selector: 'app-exercice2',
  templateUrl: './exercice2.component.html',
  styleUrls: ['./exercice2.component.css'],
  animations: [
		trigger('Loading', [
			transition(':enter', [style({ transform: 'translateY(-200%)'}), animate('300ms', style({ transform: 'translateY(0)' }))]),
			transition(':leave', [style({ transform: 'translateY(0)'}), animate('300ms', style({ transform: 'translateY(-200%)' }))])
		])]
})
export class Exercice2Component {
  searchQuery: string ="";
  //movies variables
  movies: any[] = [];
  trendingMovies: any[] = [];
  topRatedMovies:any[] = [];
  newReleasedMovies:any[] = [];
  isMovies = true;
  moviePoster = "";
  showSearch = false
  moviePosterData:any;

  sanitizedUrls: SafeResourceUrl[] = [];
  private vidSrcApiUrl = 'https://vidsrc.xyz/embed/movie/';
  constructor(private moviedbAPIService: MoviedbAPIService,private router:Router,private http: HttpClient,private sanitizer: DomSanitizer,private renderer: Renderer2) { }

  deletenoMoviesFound(){
  }

  searchMovies() {
    this.moviedbAPIService.searchMovies(this.searchQuery)
      .subscribe((response: any) => {
        this.movies = response.results;
      });
    }


      getMovieImage()
      {
        const posterMovieNb:any = Math.floor(Math.random() * 15);
        this.moviedbAPIService.getMovieDetails(this.trendingMovies[posterMovieNb].id)
        .subscribe((response: any) => {
          this.moviePosterData = response
        })
        this.moviedbAPIService.getMovieImages(this.trendingMovies[posterMovieNb].id)
        .subscribe((response: any) => {
          this.moviePoster = response.backdrops[0].file_path
        })
      }

    ngOnInit(): void {
      this.moviedbAPIService.getTrendingMovies()
      .subscribe((response: any) => {
        this.trendingMovies = response.results
        this.getMovieImage()
      })

      this.moviedbAPIService.getTopRatedMovies()
      .subscribe((response: any) => {
        this.topRatedMovies = response.results
      })

      this.moviedbAPIService.getNewRelease()
      .subscribe((response: any) => {
        this.newReleasedMovies = response.results
      })
    }

    onHover(event: Event) {
      const element = event.target as HTMLElement;
      this.renderer.setStyle(element, 'transform', 'scale(1.1)');
      this.renderer.setStyle(element, 'filter', 'saturate(1) drop-shadow(0px 0px 69px rgba(255, 255, 255, 0.335))');
    }

    onLeave(event: Event)
    {
      const element = event.target as HTMLElement;

      this.renderer.removeStyle(element, 'transform');
      this.renderer.removeStyle(element, 'filter');
    }


    getSafeUrl(video: any): SafeResourceUrl {
      let url = '';
      if (video.site === 'YouTube') {
        url = `https://www.youtube.com/embed/${video.key}`;
      } else if (video.site === 'Vimeo') {
        url = `https://player.vimeo.com/video/${video.key}`;
      }
      return this.sanitizer.bypassSecurityTrustResourceUrl(url);
    }

    routerDetailMovie(id: number){
      this.router.navigate(['/movie',id]);
    }
}
