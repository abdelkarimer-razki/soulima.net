import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class MoviedbAPIService {

  private apiKey = 'acc5f02e54fa612710d3245f53f29600';
  constructor(private http: HttpClient) { }


  //movies functions
  searchMovies(query: string) {
    const params = new HttpParams()
      .set('api_key', this.apiKey)
      .set('query', query);

    return this.http.get('https://api.themoviedb.org/3/search/movie', { params });
  }

  getTrendingMovies()
  {
    const params = new HttpParams()
    .set('api_key', this.apiKey)

    return this.http.get('https://api.themoviedb.org/3/trending/movie/day', { params });
  }

  getTopRatedMovies()
  {
    const params = new HttpParams()
    .set('api_key', this.apiKey)

    return this.http.get('https://api.themoviedb.org/3/movie/top_rated', { params });
  }

  getVideosMovie(query: string)
  {
    const params = new HttpParams()
    .set('api_key', this.apiKey)

    return this.http.get('https://api.themoviedb.org/3/movie/' + query +'/videos', { params });
  }

  getNewRelease()
  {
    const params = new HttpParams()
    .set('api_key', this.apiKey)

    return this.http.get('https://api.themoviedb.org/3/movie/now_playing', { params });
  }

  getMovieDetails(movieId: number) {
    const params = new HttpParams().set('api_key', this.apiKey);

    return this.http.get(`https://api.themoviedb.org/3/movie/${movieId}`, { params });
  }

  getMoviesGenres()
  {
    const params = new HttpParams().set('api_key', this.apiKey);

    return this.http.get(`https://api.themoviedb.org/3/genre/movie/list`, { params });
  }

  getMovieByGenres(genreId:number, pageNumber:number)
  {
    
    const params = new HttpParams().set('api_key', this.apiKey);

    return this.http.get(`https://api.themoviedb.org/3/discover/movie?with_genres=${genreId}&page=${pageNumber}`, { params });
  }


  //series function
  searchSeries(query: string) {
    const params = new HttpParams()
      .set('api_key', this.apiKey)
      .set('query', query);

    return this.http.get('https://api.themoviedb.org/3/search/tv', { params });
  }

  getSerieDetails(movieId: number) {
    const params = new HttpParams().set('api_key', this.apiKey);

    return this.http.get(`https://api.themoviedb.org/3/tv/${movieId}`, { params });
  }

  getNewReleaseSeries()
  {
    const params = new HttpParams()
    .set('api_key', this.apiKey)

    return this.http.get('https://api.themoviedb.org/3/tv/on_the_air', { params });
  }

  getTopRatedSeries()
  {
    const params = new HttpParams()
    .set('api_key', this.apiKey)

    return this.http.get('https://api.themoviedb.org/3/tv/top_rated', { params });
  }

  getMovieImages(movieId: number)
  {
    const params = new HttpParams()
    .set('api_key', this.apiKey)

    return this.http.get(`https://api.themoviedb.org/3/movie/${movieId}/images`, { params });
  }

  getSerieImages(movieId: number)
  {
    const params = new HttpParams()
    .set('api_key', this.apiKey)

    return this.http.get(`https://api.themoviedb.org/3/tv/${movieId}/images`, { params });
  }

  getVideosSerie(query: string)
  {
    const params = new HttpParams()
    .set('api_key', this.apiKey)

    return this.http.get('https://api.themoviedb.org/3/tv/' + query +'/videos', { params });
  }


  getTrendingSeries()
  {
    const params = new HttpParams()
    .set('api_key', this.apiKey)

    return this.http.get('https://api.themoviedb.org/3/trending/tv/day', { params });
  }
}
