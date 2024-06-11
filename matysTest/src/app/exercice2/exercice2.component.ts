import { Component } from '@angular/core';
import { MoviedbAPIService } from '../services/moviedb-api.service';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Component({
  selector: 'app-exercice2',
  templateUrl: './exercice2.component.html',
  styleUrls: ['./exercice2.component.css']
})
export class Exercice2Component {
  searchQuery: string ="";
  movies: any[] = [];
  noMoviesFound: boolean = false;
  private vidSrcApiUrl = 'https://vidsrc.xyz/embed/movie/';
  constructor(private moviedbAPIService: MoviedbAPIService,private router:Router,private http: HttpClient) { }

  checkVidSrcMovie(imdbId: string): Observable<any> {
    return this.http.get(`${this.vidSrcApiUrl}{imdbId}`);
  }

  deletenoMoviesFound(){
  }

  searchMovies() {
    this.moviedbAPIService.searchMovies(this.searchQuery)
      .subscribe((response: any) => {
        this.movies = response.results;
        /*this.movies.forEach((movie: any) => {
          this.checkVidSrcMovie(movie.id).subscribe((response: any) => {
            if (response.status !== "success") {
              this.movies = this.movies.filter((m: any) => m.id !== movie.id);
            }
          });
        })*/
        console.log(this.movies );
        if (response.results.length === 0)
          this.noMoviesFound = true;
        else
          this.noMoviesFound = false;
        if (this.searchQuery == "")
            this.noMoviesFound = false;
      });
    }
    ngOnInit(): void {
    }
    routerDetailMovie(id: number){
      this.router.navigate(['/movie',id]);
    }
  
}
