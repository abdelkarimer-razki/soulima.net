import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';

const DEFAULT_TMDB_KEY = atob('YWNjNWYwMmU1NGZhNjEyNzEwZDMyNDVmNTNmMjk2MDA=');

@Injectable({
  providedIn: 'root'
})
export class MoviedbAPIService {

  private apiKey = (typeof window !== 'undefined' && localStorage.getItem('soulima_tmdb_key')) || DEFAULT_TMDB_KEY;
  private cache = new Map<string, { data: any; expiresAt: number }>();

  constructor(private http: HttpClient) {
    this.fetchConfig();
  }

  loadConfig(): Promise<void> {
    const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
    const configUrl = typeof window !== 'undefined' && window.location.port === '3030'
      ? '/api/config'
      : `http://${host}:3030/api/config`;
    return fetch(configUrl)
      .then(res => res.json())
      .then(cfg => {
        if (cfg?.tmdbApiKey) {
          this.apiKey = cfg.tmdbApiKey;
          try { localStorage.setItem('soulima_tmdb_key', cfg.tmdbApiKey); } catch (_) {}
        }
      })
      .catch(() => {});
  }

  private fetchConfig() {
    this.loadConfig();
  }

  private getCached(key: string, ttlMs: number, fetcher: () => Observable<any>): Observable<any> {
    const hit = this.cache.get(key);
    if (hit && Date.now() < hit.expiresAt) {
      return of(hit.data);
    }
    return fetcher().pipe(
      tap(data => {
        this.cache.set(key, { data, expiresAt: Date.now() + ttlMs });
      })
    );
  }

  //movies functions
  searchMovies(query: string) {
    const params = new HttpParams()
      .set('api_key', this.apiKey)
      .set('query', query);

    return this.http.get('https://api.themoviedb.org/3/search/movie', { params });
  }

  getTrendingMovies() {
    return this.getCached('trending_movie', 600000, () => {
      const params = new HttpParams().set('api_key', this.apiKey);
      return this.http.get('https://api.themoviedb.org/3/trending/movie/day', { params });
    });
  }

  getTopRatedMovies() {
    return this.getCached('top_rated_movie', 600000, () => {
      const params = new HttpParams().set('api_key', this.apiKey);
      return this.http.get('https://api.themoviedb.org/3/movie/top_rated', { params });
    });
  }

  getVideosMovie(query: string)
  {
    const params = new HttpParams()
    .set('api_key', this.apiKey)

    return this.http.get('https://api.themoviedb.org/3/movie/' + query +'/videos', { params });
  }

  getNewRelease() {
    return this.getCached('new_release_movie', 600000, () => {
      const params = new HttpParams().set('api_key', this.apiKey);
      return this.http.get('https://api.themoviedb.org/3/movie/now_playing', { params });
    });
  }

  getMovieDetails(movieId: number) {
    const params = new HttpParams().set('api_key', this.apiKey);

    return this.http.get(`https://api.themoviedb.org/3/movie/${movieId}`, { params });
  }

  getMoviesGenres() {
    return this.getCached('genres_movie', 3600000, () => {
      const params = new HttpParams().set('api_key', this.apiKey);
      return this.http.get(`https://api.themoviedb.org/3/genre/movie/list`, { params });
    });
  }

  getMovieByGenres(genreId:number, pageNumber:number)
  {
    
    const params = new HttpParams().set('api_key', this.apiKey);

    return this.http.get(`https://api.themoviedb.org/3/discover/movie?with_genres=${genreId}&page=${pageNumber}`, { params });
  }

  getSimilairMovies(movieId:number)
  {
    const params = new HttpParams()
    .set('api_key', this.apiKey)

    return this.http.get(`https://api.themoviedb.org/3/movie/${movieId}/similar`, { params });
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
    return this.getCached('new_release_series', 600000, () => {
      const params = new HttpParams().set('api_key', this.apiKey);
      return this.http.get('https://api.themoviedb.org/3/tv/on_the_air', { params });
    });
  }

  getTopRatedSeries()
  {
    return this.getCached('top_rated_series', 600000, () => {
      const params = new HttpParams().set('api_key', this.apiKey);
      return this.http.get('https://api.themoviedb.org/3/tv/top_rated', { params });
    });
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
    return this.getCached('trending_series', 600000, () => {
      const params = new HttpParams().set('api_key', this.apiKey);
      return this.http.get('https://api.themoviedb.org/3/trending/tv/day', { params });
    });
  }

  getEpisodeDetails(serieId:number, season:number, episode:number)
  {
    const params = new HttpParams()
    .set('api_key', this.apiKey)

    return this.http.get(`https://api.themoviedb.org/3/tv/${serieId}/season/${season}/episode/${episode}`, { params });
  }

  getEpisodeVideos(serieId: number, season: number, episode: number)
  {
    const params = new HttpParams()
    .set('api_key', this.apiKey)

    return this.http.get(`https://api.themoviedb.org/3/tv/${serieId}/season/${season}/episode/${episode}/videos`, { params });
  }

  getSimilairSeries(serieId:number)
  {
    const params = new HttpParams()
    .set('api_key', this.apiKey)

    return this.http.get(`https://api.themoviedb.org/3/tv/${serieId}/similar`, { params });
  }

  getMovieCredits(movieId: number) {
    const params = new HttpParams().set('api_key', this.apiKey);
    return this.http.get(`https://api.themoviedb.org/3/movie/${movieId}/credits`, { params });
  }

  getSerieCredits(serieId: number) {
    const params = new HttpParams().set('api_key', this.apiKey);
    return this.http.get(`https://api.themoviedb.org/3/tv/${serieId}/credits`, { params });
  }
}
