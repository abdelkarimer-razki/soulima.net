import { Component,Renderer2  } from '@angular/core';
import { MoviedbAPIService } from '../services/moviedb-api.service';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

@Component({
  selector: 'app-exercice2',
  templateUrl: './exercice2.component.html',
  styleUrls: ['./exercice2.component.css']
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
  moviePosterData:any;

  //series variables
  series: any[] = [];
  trendingSeries: any[] = [];
  topRatedSeries:any[] = [];
  newReleasedSeries:any[] = [];
  isSeries = false;

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

    searchSeries() {
      this.moviedbAPIService.searchSeries(this.searchQuery)
        .subscribe((response: any) => {
          this.series = response.results;
        });
      }

      getMovieImage()
      {
        const posterMovieNb:any = Math.floor(Math.random() * 15);
        this.moviedbAPIService.getMovieDetails(this.trendingMovies[posterMovieNb].id)
        .subscribe((response: any) => {
          this.moviePosterData = response
          console.log(this.moviePosterData)
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


      this.moviedbAPIService.getTrendingSeries()
      .subscribe((response: any) => {
        this.trendingSeries = response.results
      })

      this.moviedbAPIService.getTopRatedSeries()
      .subscribe((response: any) => {
        this.topRatedSeries = response.results
      })

      this.moviedbAPIService.getNewReleaseSeries()
      .subscribe((response: any) => {
        this.newReleasedSeries = response.results
      })

      const scrollableDiv = document.getElementById('scrollableDiv');

      if (scrollableDiv)
      {
        scrollableDiv.addEventListener('wheel', function (e) {
          e.preventDefault();
          scrollableDiv.scrollLeft += e.deltaY;
        });
      }
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

    routerDetailSerie(id: number){
      this.router.navigate(['/serie/'+ id + '/1/1'])
    }
  
}
