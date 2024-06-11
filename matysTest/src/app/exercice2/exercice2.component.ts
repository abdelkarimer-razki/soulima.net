import { Component } from '@angular/core';
import { MoviedbAPIService } from '../services/moviedb-api.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-exercice2',
  templateUrl: './exercice2.component.html',
  styleUrls: ['./exercice2.component.css']
})
export class Exercice2Component {
  searchQuery: string ="";
  movies: any[] = [];
  noMoviesFound: boolean = false;
  constructor(private moviedbAPIService: MoviedbAPIService,private router:Router) { }
  searchMovies() {
    this.moviedbAPIService.searchMovies(this.searchQuery)
      .subscribe((response: any) => {
        this.movies = response.results;
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
