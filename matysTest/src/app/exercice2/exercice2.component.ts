import { Component } from '@angular/core';
import { MoviedbAPIService } from '../services/moviedb-api.service';

@Component({
  selector: 'app-exercice2',
  templateUrl: './exercice2.component.html',
  styleUrls: ['./exercice2.component.css']
})
export class Exercice2Component {
  searchQuery: string ="";
  movies: any[] = [];
  constructor(private moviedbAPIService: MoviedbAPIService) { }
  searchMovies() {
    this.moviedbAPIService.searchMovies(this.searchQuery)
      .subscribe((response: any) => {
        this.movies = response.results;
        console.log(this.movies);
      });
    }
    ngOnInit(): void {
    }
  
}
