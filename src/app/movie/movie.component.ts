import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { MoviedbAPIService } from '../services/moviedb-api.service';
import { SeoService } from '../services/seo.service';
import { TorrentService, TorrentSource } from '../services/torrent.service';
import { SubtitleService, SubtitleTrack } from '../services/subtitle.service';

@Component({
  selector: 'app-movie',
  templateUrl: './movie.component.html',
  styleUrls: ['./movie.component.css']
})
export class MovieComponent implements OnInit, OnDestroy {

  id: number = 0;
  movie: any = null;
  torrentSources: TorrentSource[] = [];
  torrentSourcesLoading = false;
  subtitleTracks: SubtitleTrack[] = [];
  private routeSub?: Subscription;

  constructor(
    private route: ActivatedRoute,
    private moviedbAPIService: MoviedbAPIService,
    private seoService: SeoService,
    private torrentService: TorrentService,
    private subtitleService: SubtitleService
  ) {
    this.routeSub = this.route.params.subscribe(params => {
      const newId = Number(params['id']);
      if (newId && newId !== this.id) {
        this.id = newId;
        this.loadMovie();
      } else if (newId) {
        this.id = newId;
      }
    });
  }

  ngOnInit(): void {
    if (this.id) {
      this.loadMovie();
    }
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
  }

  loadMovie() {
    if (!this.id) return;
    this.torrentSourcesLoading = true;

    this.moviedbAPIService.getMovieDetails(this.id).subscribe({
      next: (response: any) => {
        this.movie = response;

        const movieTitle = this.movie?.title || this.movie?.original_title || 'Movie';
        const movieYear = this.movie?.release_date ? ` (${this.movie.release_date.split('-')[0]})` : '';
        const rawYear = (this.movie?.release_date || '').slice(0, 4);
        const movieDesc = this.movie?.overview || `Stream '${movieTitle}'${movieYear} in HD for free on Soulima. Watch with multiple fast torrent sources and high-speed magnet links.`;
        const movieImg = this.movie?.backdrop_path ? `https://image.tmdb.org/t/p/w500${this.movie.backdrop_path}` : 'https://www.soulima.net/assets/soulima.png';
        const movieUrl = `https://soulima.net/#/movie/${this.id}`;

        this.seoService.updateMeta({
          title: `Watch ${movieTitle}${movieYear} Free - Soulima`,
          description: movieDesc,
          keywords: `${movieTitle}, watch ${movieTitle}, watch ${movieTitle} free, streaming ${movieTitle}, Soulima movies`,
          image: movieImg,
          url: movieUrl,
          type: 'video.movie',
        });

        this.getRecentlyWatched();
        this.fetchTorrentSources(movieTitle, rawYear);
        this.fetchSubtitles(movieTitle);
      },
      error: () => {
        this.fetchTorrentSources();
        this.fetchSubtitles();
      }
    });
  }

  fetchSubtitles(title?: string) {
    this.fetchSubtitlesWithRetry(0, title);
  }

  private fetchSubtitlesWithRetry(attempt: number, title?: string) {
    const t = title || this.movie?.title || this.movie?.original_title || '';
    this.subtitleService.getSubtitles(this.id, undefined, undefined, t)
      .then(tracks => {
        if (tracks && tracks.length) {
          this.subtitleTracks = tracks;
        } else if (attempt < 2) {
          setTimeout(() => this.fetchSubtitlesWithRetry(attempt + 1, title), 1500);
        } else {
          this.subtitleTracks = [];
        }
      })
      .catch(() => {
        if (attempt < 2) {
          setTimeout(() => this.fetchSubtitlesWithRetry(attempt + 1, title), 1500);
        } else {
          this.subtitleTracks = [];
        }
      });
  }

  onUnplayable() {
    const t = this.movie?.title || this.movie?.original_title || '';
    this.fetchSourcesWithRetry(0, t);
    this.fetchSubtitlesWithRetry(0, t);
  }

  fetchTorrentSources(title?: string, year?: string) {
    this.torrentSourcesLoading = true;
    const t = title || this.movie?.title || this.movie?.original_title || '';
    const y = year || (this.movie?.release_date || '').slice(0, 4);
    this.fetchSourcesWithRetry(0, t, y);
  }

  private fetchSourcesWithRetry(attempt: number, title?: string, year?: string) {
    this.torrentService.fetchSources(this.id, 'movie', undefined, undefined, title, year)
      .then(sources => {
        if (sources && sources.length) {
          this.torrentSources = sources;
          this.torrentSourcesLoading = false;
        } else if (attempt < 2) {
          setTimeout(() => this.fetchSourcesWithRetry(attempt + 1, title, year), 1500);
        } else {
          this.torrentSources = [];
          this.torrentSourcesLoading = false;
        }
      })
      .catch(() => {
        if (attempt < 2) {
          setTimeout(() => this.fetchSourcesWithRetry(attempt + 1, title, year), 1500);
        } else {
          this.torrentSourcesLoading = false;
        }
      });
  }

  getRecentlyWatched() {
    try {
      const raw = localStorage.getItem('movies');
      let movies: any[] = raw ? JSON.parse(raw) : [];
      movies = movies.filter((m: any) => m && Number(m.id) !== Number(this.id));
      const strippedMovie = {
        id: this.movie?.id || this.id,
        title: this.movie?.title,
        original_title: this.movie?.original_title,
        poster_path: this.movie?.poster_path,
        backdrop_path: this.movie?.backdrop_path,
        vote_average: this.movie?.vote_average,
        release_date: this.movie?.release_date
      };
      movies.unshift(strippedMovie);
      movies = movies.slice(0, 20);
      localStorage.setItem('movies', JSON.stringify(movies));
    } catch (e) {
      console.warn('Could not save to recently watched movies:', e);
    }
  }
}
