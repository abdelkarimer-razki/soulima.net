import { Component } from '@angular/core';
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
  movies: any[] = [];
  trendingMovies: any[] = [];
  topRatedMovies:any[] = [];
  newReleasedMovies:any[] = [];
  videos:any[] = []
  sanitizedUrls: SafeResourceUrl[] = [];
  noMoviesFound: boolean = false;
  private vidSrcApiUrl = 'https://vidsrc.xyz/embed/movie/';
  constructor(private moviedbAPIService: MoviedbAPIService,private router:Router,private http: HttpClient,private sanitizer: DomSanitizer) { }

  deletenoMoviesFound(){
  }

  searchMovies() {
    this.moviedbAPIService.searchMovies(this.searchQuery)
      .subscribe((response: any) => {
        this.movies = response.results;
        if (response.results.length === 0)
          this.noMoviesFound = true;
        else
          this.noMoviesFound = false;

        if (this.searchQuery == "")
            this.noMoviesFound = false;
      });
    }
    ngOnInit(): void {

      this.moviedbAPIService.getTrendingMovies()
      .subscribe((response: any) => {
        this.trendingMovies = response.results
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

    getMovieVideo(movieid:any)
    {
      this.moviedbAPIService.getVideosMovie(movieid)
      .subscribe((response: any) => {
        this.videos = response.results
        console.log(this.videos)
      })
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
