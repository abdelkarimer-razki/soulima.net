import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class MoviedbAPIService {

  private apiKey = 'acc5f02e54fa612710d3245f53f29600';
  constructor(private http: HttpClient) { }
  searchMovies(query: string) {
    const params = new HttpParams()
      .set('api_key', this.apiKey)
      .set('query', query);

    return this.http.get('https://api.themoviedb.org/3/search/movie', { params });
  }

  searchSeries(query: string) {
    const params = new HttpParams()
      .set('api_key', this.apiKey)
      .set('query', query);

    return this.http.get('https://api.themoviedb.org/3/search/tv', { params });
  }

  getMovieDetails(movieId: number) {
    const params = new HttpParams().set('api_key', this.apiKey);

    return this.http.get(`https://api.themoviedb.org/3/movie/${movieId}`, { params });
  }

  getSerieDetails(movieId: number) {
    const params = new HttpParams().set('api_key', this.apiKey);

    return this.http.get(`https://api.themoviedb.org/3/tv/${movieId}`, { params });
  }
}
