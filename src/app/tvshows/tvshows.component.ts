import { Component,Renderer2,ViewChild, OnInit, OnDestroy, HostListener, ElementRef  } from '@angular/core';
import { MoviedbAPIService } from '../services/moviedb-api.service';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { DomSanitizer, SafeResourceUrl, Title, Meta } from '@angular/platform-browser';
import { trigger, transition, style, animate } from '@angular/animations';
import { YouTubePlayer } from '@angular/youtube-player';
import { forkJoin, Subject, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { SeoService } from '../services/seo.service';
import { SearchCorrectorService } from '../services/search-corrector.service';
import { WatchProgressService } from '../services/watch-progress.service';




@Component({
  selector: 'app-tvshows',
  templateUrl: './tvshows.component.html',
  styleUrls: ['./tvshows.component.css'],
  animations: [
		trigger('Loading', [
			transition(':enter', [style({ transform: 'translateY(-200%)'}), animate('300ms', style({ transform: 'translateY(0)' }))]),
			transition(':leave', [style({ transform: 'translateY(0)'}), animate('300ms', style({ transform: 'translateY(-200%)' }))])
		]),
		trigger('fade', [
			transition(':leave', [style({ opacity: '1'}), animate('1000ms', style({  opacity: '0' }))])
		])]
})
export class TvshowsComponent implements OnInit, OnDestroy {
	@ViewChild(YouTubePlayer) player!: YouTubePlayer;

	searchQuery: string ="";
	suggestedCorrection: string | null = null;
	ghostText: string = "";
	autocompleteTitle: string = "";
	searchSubject = new Subject<string>();
	private searchSub?: Subscription;
	autocompleteSuggestions: any[] = [];
	showAutocomplete = false;

	//Series holder
	moviePosterData:any;
	moviePosterLogo = "";
	series: any[] = [];
	searchedMovies: any[] = [];
	searchedSeries: any[] = [];
	trendingSeries: any[] = [];
	showSearch = false
	topRatedSeries:any[] = [];
	newReleasedSeries:any[] = [];
	recentlyWatched:any[] = [];
	foryou:any[] = [];
 
	isSeries = true;


	popUp=false;
	popUpMovie:any;
	popUpPoster="";
	popUpLogo="";
	startTrailer=false;

	popUpLink:any;
	mute:boolean = true;
	playerVars = {
		disablekb: 1,
		autoplay: 1,  // Enable autoplay
		controls: 0,  // Show controls (optional)
		rel: 0,       // Disable related videos at the end (optional)
		modestbranding: 1, // Remove YouTube logo from the control bar (optional),
		mute: 1,
	loop: 1
	};

	loading = true;
	showLoadingScreen = true;
	isSearching = false;
	isPopUpLoading = false;
	private lastFocusedCard: HTMLElement | null = null;


  sanitizedUrls: SafeResourceUrl[] = [];
  constructor(
    private moviedbAPIService: MoviedbAPIService,
    private router:Router,
    private http: HttpClient,
    private sanitizer: DomSanitizer,
    private renderer: Renderer2,
    private titleService: Title,
    private metaService: Meta,
    private seoService: SeoService,
    private elementRef: ElementRef,
    private searchCorrector: SearchCorrectorService,
    public watchProgress: WatchProgressService
  ) { }


    searchSeries() {
      if (!this.searchQuery) {
        this.series = [];
        this.searchedMovies = [];
        this.searchedSeries = [];
        this.autocompleteSuggestions = [];
        this.isSearching = false;
        this.showAutocomplete = false;
        this.suggestedCorrection = null;
        this.ghostText = "";
        this.autocompleteTitle = "";
        return;
      }
      this.isSearching = true;
      this.showAutocomplete = true;
      this.updateSuggestions();
      this.searchSubject.next(this.searchQuery);
    }

    performSearch(query: string) {
      if (!query) {
        this.series = [];
        this.searchedMovies = [];
        this.searchedSeries = [];
        this.autocompleteSuggestions = [];
        this.isSearching = false;
        return;
      }
      this.isSearching = true;
      forkJoin([
        this.moviedbAPIService.searchMovies(query),
        this.moviedbAPIService.searchSeries(query)
      ]).subscribe({
        next: ([moviesResponse, seriesResponse]: [any, any]) => {
          if (query !== this.searchQuery) {
            return;
          }
          const movieResults = (moviesResponse.results || []).map((m: any) => ({ ...m, media_type: 'movie' }));
          const seriesResults = (seriesResponse.results || []).map((s: any) => ({ ...s, media_type: 'tv' }));
          
          movieResults.sort((a: any, b: any) => (b.popularity || 0) - (a.popularity || 0));
          seriesResults.sort((a: any, b: any) => (b.popularity || 0) - (a.popularity || 0));
          
          this.searchedMovies = movieResults;
          this.searchedSeries = seriesResults;
          
          this.series = [...movieResults, ...seriesResults];
          
          // Create autocomplete suggestions
          const combined = [...movieResults, ...seriesResults];
          combined.sort((a: any, b: any) => (b.popularity || 0) - (a.popularity || 0));
          this.autocompleteSuggestions = combined.slice(0, 6);
          
          // Add results to correction dictionary
          this.searchCorrector.addMediaItems(movieResults);
          this.searchCorrector.addMediaItems(seriesResults);
          
          // Recalculate suggestions with the updated dictionary
          this.updateSuggestions();
          
          this.isSearching = false;
        },
        error: () => {
          this.isSearching = false;
        }
      });
    }

    selectSuggestion(item: any) {
      this.showAutocomplete = false;
      this.showPopUp(item);
    }

    applyCorrection(correction: string) {
      this.searchQuery = correction;
      this.suggestedCorrection = null;
      this.ghostText = "";
      this.autocompleteTitle = "";
      this.searchSeries();
    }

    getDetailUrl(item: any): string {
      if (!item) return '';
      const isTv = !!(item.name || item.first_air_date || item.isTvShow || item.media_type === 'tv');
      if (isTv) {
        const series = localStorage.getItem("series");
        if (series) {
          const seriesParsed = JSON.parse(series);
          const matched = seriesParsed.find((s: any) => s && s.id === item.id);
          if (matched) {
            return `/serie/${item.id}/${matched.seasonnb}/${matched.episodenb}`;
          }
        }
        return `/serie/${item.id}/1/1`;
      }
      return `/movie/${item.id}`;
    }

    onCardClick(event: MouseEvent, item: any) {
      event.preventDefault();
      this.showPopUp(item);
    }

    updateSuggestions() {
      this.ghostText = '';
      this.autocompleteTitle = '';
      this.suggestedCorrection = null;
      
      if (!this.searchQuery) return;
      
      const prefixMatch = this.searchCorrector.suggestPrefixCorrection(this.searchQuery);
      if (prefixMatch) {
        this.autocompleteTitle = prefixMatch;
        this.ghostText = this.getGhostText(this.searchQuery, prefixMatch);
      } else {
        this.suggestedCorrection = this.searchCorrector.suggestCorrection(this.searchQuery);
      }
    }

    getGhostText(query: string, matchTitle: string): string {
      if (!query || !matchTitle) return '';
      
      const normQuery = this.searchCorrector.normalize(query);
      const normTitle = this.searchCorrector.normalize(matchTitle);
      
      if (!normTitle.startsWith(normQuery)) return '';
      
      let queryIndex = 0;
      let titleIndex = 0;
      
      while (queryIndex < normQuery.length && titleIndex < matchTitle.length) {
        const qChar = normQuery[queryIndex];
        const tChar = matchTitle[titleIndex].toLowerCase();
        
        if (qChar === tChar) {
          queryIndex++;
          titleIndex++;
        } else if (/[^\w]/.test(matchTitle[titleIndex])) {
          titleIndex++;
        } else if (/[^\w]/.test(qChar)) {
          queryIndex++;
        } else {
          titleIndex++;
        }
      }
      
      return matchTitle.substring(titleIndex);
    }

    onKeyDown(event: KeyboardEvent) {
      if ((event.key === 'Tab' || event.key === 'ArrowRight') && this.autocompleteTitle && (this.ghostText || this.searchQuery !== this.autocompleteTitle)) {
        this.applyCorrection(this.autocompleteTitle);
        event.preventDefault();
      }
    }

    @HostListener('document:click', ['$event'])
    onDocumentClick(event: MouseEvent) {
      const clickedInside = this.elementRef.nativeElement.contains(event.target);
      if (!clickedInside) {
        this.showAutocomplete = false;
      }
    }

      changeAudio()
      {
        this.mute = !this.mute
        if (this.mute)
          this.player.mute()
        else
          this.player.unMute()
      }

      onPlayerReady(event: any)
      {
        const playerState = event.data;
        if (playerState === 1)
          this.startTrailer = true;
      }
      getSerieImage()
      {
        const posterMovieNb:any = Math.floor(Math.random() * 15);
        const serieId = this.trendingSeries[posterMovieNb].id;

        forkJoin([
          this.moviedbAPIService.getSerieDetails(serieId),
          this.moviedbAPIService.getSerieImages(serieId)
        ]).subscribe({
          next: ([details, images]: [any, any]) => {
            this.moviePosterData = details;

            // Find an English logo, or default to first available logo, or empty string
            const logo = images.logos.find((l: any) => l.iso_639_1 === 'en') || images.logos[0];
            this.moviePosterLogo = logo ? logo.file_path : "";

            setTimeout(() => {
              this.loading = false;
            }, 2000);
          },
          error: (err) => {
            console.error("Error loading TV show billboard image/logo:", err);
            this.loading = false;
          }
        });
      }

    ngOnInit(): void {
      this.searchSub = this.searchSubject.pipe(
        debounceTime(300),
        distinctUntilChanged()
      ).subscribe(query => {
        this.performSearch(query);
      });
      this.seoService.updateMeta({
        title: "Soulima TV Shows | Free Streaming of TV Series & Seasons",
        description: "Watch trending TV series, full seasons, and new releases for free in high quality on Soulima. Enjoy unlimited show streaming.",
        keywords: "سوليما, Soulima, مشاهدة مسلسلات, مسلسلات أونلاين, مسلسلات مجانية, streaming tv shows, free series, TV series, online streaming, Arabic series, Moroccan tv shows",
        url: "https://soulima.net/#/tvshows",
        schema: {
          "@context": "https://schema.org",
          "@type": "WebSite",
          "url": "https://soulima.net/#/tvshows",
          "name": "Soulima TV Shows",
          "description": "Watch trending TV series, full seasons, and new releases for free in high quality on Soulima. Enjoy unlimited show streaming."
        }
      });
		this.getForYou()
      const data = localStorage.getItem("series")
      if (data) {
        const parsed = JSON.parse(data);
        const unique = [];
        const seen = new Set();
        for (const s of parsed) {
          if (s && s.id && !seen.has(s.id)) {
            unique.push(s);
            seen.add(s.id);
          }
        }
        this.recentlyWatched = unique;
      }

      // Safety fallback: Never stay stuck on loading screen longer than 3.5 seconds
      setTimeout(() => {
        if (this.loading || this.showLoadingScreen) {
          this.loading = false;
          this.showLoadingScreen = false;
        }
      }, 3500);

      if (!navigator.onLine) {
        this.loading = false;
        this.showLoadingScreen = false;
        return;
      }

      forkJoin([
        this.moviedbAPIService.getTrendingSeries(),
        this.moviedbAPIService.getTopRatedSeries(),
        this.moviedbAPIService.getNewReleaseSeries(),
      ]).subscribe({
        next: (responses: any[]) => {
          this.trendingSeries = responses[0]?.results || [];
          this.topRatedSeries = responses[1]?.results || [];
          this.newReleasedSeries = responses[2]?.results || [];

          // Seed search corrector service
          this.searchCorrector.addMediaItems(this.trendingSeries);
          this.searchCorrector.addMediaItems(this.topRatedSeries);
          this.searchCorrector.addMediaItems(this.newReleasedSeries);

          if (this.trendingSeries.length > 0) {
            this.getSerieImage();
          } else {
            this.loading = false;
            this.showLoadingScreen = false;
          }
        },
        error: (err) => {
          console.error("Error fetching tv series:", err);
          this.loading = false;
          this.showLoadingScreen = false;
        }
      });
    }

    ngOnDestroy()
    {
      this.searchSub?.unsubscribe();
		  this.renderer.removeStyle(document.body, 'overflow');
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


    routerDetailSerie(item: any) {
      this.closePopUp();
      if (!item) return;

      let id = typeof item === 'object' ? item.id : item;
      let isTv = true;
      if (typeof item === 'object') {
        isTv = !item.title && (!!item.name || !!item.first_air_date || !!item.isTvShow);
      } else {
        if (this.popUpMovie && this.popUpMovie.id === id) {
          isTv = !this.popUpMovie.title && (!!this.popUpMovie.name || !!this.popUpMovie.first_air_date || !!this.popUpMovie.isTvShow);
        }
      }

      if (isTv) {
        var series = localStorage.getItem("series");
        if (series)
        {
          var seriesParsed = JSON.parse(series);
          for (let i = 0; i < seriesParsed.length; i++) {
            if (seriesParsed[i].id == id) {
              this.router.navigate(['/serie/'+ id + '/' + seriesParsed[i].seasonnb + '/' + seriesParsed[i].episodenb]);
              return;
            }
          }
        }
        this.router.navigate(['/serie/'+ id + '/1/1']);
      } else {
        this.router.navigate(['/movie', id]);
      }
    }
  
    showPopUp(movie:any)
    {
      this.lastFocusedCard = document.activeElement as HTMLElement | null;
      this.renderer.setStyle(document.body, 'overflow', 'hidden');

      this.popUp = true;
      this.popUpLink = "";
      this.popUpPoster = "";
      this.popUpLogo = "";

      this.startTrailer = false;
      this.mute = true;
      this.popUpMovie = movie;
      this.isPopUpLoading = true;

      setTimeout(() => {
        if (document.body.classList.contains('soulima-tv')) {
          const playBtn = document.querySelector('.playinPopUp') as HTMLElement | null;
          if (playBtn) playBtn.focus();
        }
      }, 100);

      const isTv = movie.name || movie.first_air_date || movie.isTvShow || movie.seasonnb || movie.episodenb;

      if (isTv) {
        if (movie.seasonnb && movie.episodenb) {
          forkJoin([
            this.moviedbAPIService.getSerieDetails(movie.id),
            this.moviedbAPIService.getSerieImages(movie.id),
            this.moviedbAPIService.getVideosSerie(movie.id),
            this.moviedbAPIService.getEpisodeDetails(movie.id, movie.seasonnb, movie.episodenb),
            this.moviedbAPIService.getEpisodeVideos(movie.id, movie.seasonnb, movie.episodenb),
            this.moviedbAPIService.getSerieCredits(movie.id)
          ]).subscribe({
            next: ([details, images, videos, episodeDetails, episodeVideos, serieCredits]: [any, any, any, any, any, any]) => {
              const episodeDirectors = episodeDetails.crew?.filter((member: any) => member.job === 'Director').map((dir: any) => dir.name) || [];
              const showCreators = details.created_by?.map((creator: any) => creator.name) || [];
              const directors = episodeDirectors.length > 0 ? episodeDirectors : showCreators;

              const guestStars = episodeDetails.guest_stars?.slice(0, 5).map((actor: any) => actor.name) || [];
              const mainCast = serieCredits.cast?.slice(0, 5).map((actor: any) => actor.name) || [];
              const cast = guestStars.length > 0 ? guestStars : mainCast;

              this.popUpMovie = {
                ...details,
                episode_title: episodeDetails.name,
                season_number: episodeDetails.season_number,
                episode_number: episodeDetails.episode_number,
                overview: episodeDetails.overview || details.overview,
                vote_average: episodeDetails.vote_average || details.vote_average,
                first_air_date: episodeDetails.air_date || details.first_air_date,
                isEpisodePopup: true,
                isTvShow: true,
                directors: directors,
                cast: cast
              };
              
              // Set the episode still image as the poster backdrop
              this.popUpPoster = episodeDetails.still_path || images.backdrops[2]?.file_path || images.backdrops[0]?.file_path || details.backdrop_path;
              
              const logo = images.logos?.find((l: any) => l.iso_639_1 === 'en') || images.logos?.[0];
              this.popUpLogo = logo ? logo.file_path : "";

              // Check if episode has a trailer, fallback to series trailer if not
              const epiTrailer = episodeVideos.results?.find((video: any) => video.type === 'Trailer');
              const showTrailer = videos.results?.find((video: any) => video.type === 'Trailer');
              const trailer = epiTrailer || showTrailer;
              if (trailer?.key) {
                this.popUpLink = trailer.key;
              }
              
              this.isPopUpLoading = false;
            },
            error: (err) => {
              console.error("Error loading episode pop-up details:", err);
              this.isPopUpLoading = false;
            }
          });
        } else {
          forkJoin([
            this.moviedbAPIService.getSerieDetails(movie.id),
            this.moviedbAPIService.getSerieImages(movie.id),
            this.moviedbAPIService.getVideosSerie(movie.id),
            this.moviedbAPIService.getSerieCredits(movie.id)
          ]).subscribe({
            next: ([details, images, videos, serieCredits]: [any, any, any, any]) => {
              const creators = details.created_by?.map((creator: any) => creator.name) || [];
              const crewDirectors = serieCredits.crew?.filter((member: any) => member.job === 'Director' || member.job === 'Executive Producer').slice(0, 2).map((dir: any) => dir.name) || [];
              const directors = creators.length > 0 ? creators : crewDirectors;

              const cast = serieCredits.cast?.slice(0, 5).map((actor: any) => actor.name) || [];

              this.popUpMovie = { 
                ...details, 
                isTvShow: true,
                directors: directors,
                cast: cast
              };
              this.popUpPoster = images.backdrops[2]?.file_path || images.backdrops[0]?.file_path || details.backdrop_path;
              
              const logo = images.logos?.find((l: any) => l.iso_639_1 === 'en') || images.logos?.[0];
              this.popUpLogo = logo ? logo.file_path : "";

              const trailer = videos.results.find((video: any) => video.type === 'Trailer');
              if (trailer?.key) {
                this.popUpLink = trailer.key;
              }
              this.isPopUpLoading = false;
            },
            error: (err) => {
              console.error("Error loading pop-up details:", err);
              this.isPopUpLoading = false;
            }
          });
        }
      } else {
        forkJoin([
          this.moviedbAPIService.getMovieDetails(movie.id),
          this.moviedbAPIService.getMovieImages(movie.id),
          this.moviedbAPIService.getVideosMovie(movie.id),
          this.moviedbAPIService.getMovieCredits(movie.id)
        ]).subscribe({
          next: ([details, images, videos, movieCredits]: [any, any, any, any]) => {
            const directors = movieCredits.crew?.filter((member: any) => member.job === 'Director').map((dir: any) => dir.name) || [];
            const cast = movieCredits.cast?.slice(0, 5).map((actor: any) => actor.name) || [];

            this.popUpMovie = {
              ...details,
              directors: directors,
              cast: cast
            };
            this.popUpPoster = images.backdrops[2]?.file_path || images.backdrops[0]?.file_path || details.backdrop_path;
            
            const logo = images.logos?.find((l: any) => l.iso_639_1 === 'en') || images.logos?.[0];
            this.popUpLogo = logo ? logo.file_path : "";

            const trailer = videos.results.find((video: any) => video.type === 'Trailer');
            if (trailer?.key) {
              this.popUpLink = trailer.key;
            }
            this.isPopUpLoading = false;
          },
          error: (err) => {
            console.error("Error loading movie pop-up details:", err);
            this.isPopUpLoading = false;
          }
        });
      }
    }

    closePopUp()
    {
      this.popUp=false;
      this.popUpMovie = {};
      this.popUpPoster="";
      this.popUpLogo="";
      this.startTrailer=false;
      this.mute = true;
      this.popUpLink= "";
      this.renderer.removeStyle(document.body, 'overflow');
      if (this.lastFocusedCard) {
        try {
          this.lastFocusedCard.focus();
        } catch (_) {}
        this.lastFocusedCard = null;
      }
    }

    getSerieVideos(movieId:any)
    {
      this.moviedbAPIService.getSerieImages(movieId)
      .subscribe((response: any) => {
        this.popUpPoster = response.backdrops[2]?.file_path || response.backdrops[0]?.file_path;
        this.moviedbAPIService.getVideosSerie(movieId)
        .subscribe((response: any) => {
          const trailer = response.results.find((video: any) => video.type === 'Trailer');
          if (trailer?.key)
            this.popUpLink = trailer?.key;
        });
      });
    }


	getForYou()
	{
		var series = localStorage.getItem("series");
		if (series)
		{
			var seriesParsed = JSON.parse(series);
			var randomMovie =  Math.floor(Math.random() * seriesParsed.length);
			this.moviedbAPIService.getSimilairSeries(seriesParsed[randomMovie].id)
			.subscribe(
				(response: any) => {
					this.foryou = response.results;
					console.log("here", randomMovie)
				}
			)
		}
	}

	stopClose(event:MouseEvent)
	{
		event.stopPropagation();
	}

	onLoadingScreenDismissed() {
		this.showLoadingScreen = false;
	}
}
