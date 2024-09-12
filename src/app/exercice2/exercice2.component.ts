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
  //movies variables
  movies: any[] = [];
  trendingMovies: any[] = [];
  topRatedMovies:any[] = [];
  newReleasedMovies:any[] = [];
  isMovies = true;

  //series variables
  series: any[] = [];
  trendingSeries: any[] = [];
  topRatedSeries:any[] = [];
  newReleasedSeries:any[] = [];
  isSeries = false;

  sanitizedUrls: SafeResourceUrl[] = [];
  private vidSrcApiUrl = 'https://vidsrc.xyz/embed/movie/';
  constructor(private moviedbAPIService: MoviedbAPIService,private router:Router,private http: HttpClient,private sanitizer: DomSanitizer) { }

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
