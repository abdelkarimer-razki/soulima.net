import { Component,Renderer2,OnInit, ViewChild, HostListener, ElementRef  } from '@angular/core';
import { Title, Meta } from '@angular/platform-browser';
import { MoviedbAPIService } from '../services/moviedb-api.service';
import { Router, ActivatedRoute } from '@angular/router';
import { trigger, transition, style, animate } from '@angular/animations';
import { YouTubePlayer } from '@angular/youtube-player';
import { forkJoin, Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { CookieService } from 'ngx-cookie-service';
import { SeoService } from '../services/seo.service';
import { SearchCorrectorService } from '../services/search-corrector.service';

interface Genre {
	name: string;
  }
@Component({
  selector: 'app-exercice2',
  templateUrl: './exercice2.component.html',
  styleUrls: ['./exercice2.component.css'],
  animations: [
		trigger('Loading', [
			transition(':enter', [style({ transform: 'translateY(-200%)'}), animate('300ms', style({ transform: 'translateY(0)' }))]),
			transition(':leave', [style({ transform: 'translateY(0)'}), animate('300ms', style({ transform: 'translateY(-200%)' }))])
		]),
		trigger('fade', [
			transition(':leave', [style({ opacity: '1'}), animate('1000ms', style({  opacity: '0' }))])
		])]
})
export class Exercice2Component implements OnInit
{
	@ViewChild(YouTubePlayer) player!: YouTubePlayer;
	searchQuery: string ="";
	suggestedCorrection: string | null = null;
	ghostText: string = "";
	autocompleteTitle: string = "";
	searchSubject = new Subject<string>();
	autocompleteSuggestions: any[] = [];
	showAutocomplete = false;
	//movies variables
	movies: any[] = [];
	searchedMovies: any[] = [];
	searchedSeries: any[] = [];
	trendingMovies: any[] = [];
	topRatedMovies:any[] = [];
	newReleasedMovies:any[] = [];
	recentlyWatched:any[] = [];
	foryou:any[] = [];
 
	isMovies = true;
	showSearch = false
	moviePosterData:any;
	moviePosterLogo = "";

	popUp = false;
	popUpMovie:any;
	popUpPoster = "";
	popUpLogo = "";
	startTrailer = false;

	genraMovies:any[] = [];
	genraName = "";
	genraSearch = false;
	popUpLink:string = "";
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

	constructor(
		private moviedbAPIService: MoviedbAPIService,
		private router:Router,
		private route: ActivatedRoute,
		private renderer: Renderer2,
		private cookie: CookieService,
		private titleService: Title,
		private metaService: Meta,
		private seoService: SeoService,
		private elementRef: ElementRef,
		private searchCorrector: SearchCorrectorService
	) { }

	sliceTo3(table:any[]):any[]
	{
		return table.slice(0,3);
	}

	searchMovies()
	{
		if (!this.searchQuery) {
			this.movies = [];
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

	performSearch(query: string)
	{
		if (!query) {
			this.movies = [];
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
				
				this.movies = [...movieResults, ...seriesResults];
				
				// Create autocomplete suggestions
				const combined = [...movieResults, ...seriesResults];
				combined.sort((a: any, b: any) => (b.popularity || 0) - (a.popularity || 0));
				this.autocompleteSuggestions = combined.slice(0, 6);
				
				// Add results to correction dictionary
				this.searchCorrector.addMediaItems(movieResults);
				this.searchCorrector.addMediaItems(seriesResults);
				
				// Recalculate correction/ghost text with the updated dictionary
				this.updateSuggestions();
				
				this.isSearching = false;
			},
			error: () => {
				this.isSearching = false;
			}
		});
	}

	selectSuggestion(item: any)
	{
		this.showAutocomplete = false;
		this.showPopUp(item);
	}

	applyCorrection(correction: string)
	{
		this.searchQuery = correction;
		this.suggestedCorrection = null;
		this.ghostText = "";
		this.autocompleteTitle = "";
		this.searchMovies();
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

	updateSuggestions()
	{
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

	getGhostText(query: string, matchTitle: string): string
	{
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

	onKeyDown(event: KeyboardEvent)
	{
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

	onPlayerReady(event: any)
	{
		const playerState = event.data;
		if (playerState === 1)
			this.startTrailer = true;
	}

	getMovieImage()
	{
		const posterMovieNb:any = Math.floor(Math.random() * 15);
		const movieId = this.trendingMovies[posterMovieNb].id;

		forkJoin([
			this.moviedbAPIService.getMovieDetails(movieId),
			this.moviedbAPIService.getMovieImages(movieId)
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
				console.error("Error loading movie billboard image/logo:", err);
				this.loading = false;
			}
		});
	}


	getMovieVideos(movieId:any)
	{
		this.moviedbAPIService.getMovieImages(movieId)
		.subscribe((response: any) => {
			this.popUpPoster = response.backdrops[2]?.file_path || response.backdrops[0]?.file_path;
			this.moviedbAPIService.getVideosMovie(movieId)
			.subscribe((response: any) => {
				const trailer = response.results.find((video: any) => video.type === 'Trailer');
				if (trailer?.key)
					this.popUpLink = trailer.key;
			});
		});
	}

	changeAudio()
	{
		this.mute = !this.mute
		if (this.mute)
			this.player.mute()
		else
			this.player.unMute()
	}

	showPopUp(movie:any)
	{
		this.renderer.setStyle(document.body, 'overflow', 'hidden');
		this.popUp = true;
		this.popUpLink = "";
		this.popUpPoster = "";
		this.popUpLogo = "";
		this.startTrailer = false;
		this.mute = true;
		this.popUpMovie = movie;
		this.isPopUpLoading = true;

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
						
						this.popUpPoster = episodeDetails.still_path || images.backdrops[2]?.file_path || images.backdrops[0]?.file_path || details.backdrop_path;
						
						const logo = images.logos?.find((l: any) => l.iso_639_1 === 'en') || images.logos?.[0];
						this.popUpLogo = logo ? logo.file_path : "";

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
					console.error("Error loading pop-up details:", err);
					this.isPopUpLoading = false;
				}
			});
		}
	}

	getMoviesByGenre(genreId:number, genraName:string)
	{
		this.moviedbAPIService.getMovieByGenres(genreId, 1).subscribe((response: any) => {
			this.genraMovies = response.results;
			this.genraName = genraName;
			this.genraSearch = true;
		})
		window.scrollTo(0,0)
	}

	clearGenre()
	{
		this.genraMovies = [];
		this.genraName = "";
		this.genraSearch = false;
		this.searchedMovies = [];
		this.searchedSeries = [];
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
	}

	getForYou()
	{
		var movies = localStorage.getItem("movies");
		if (movies)
		{
			var moviesParsed = JSON.parse(movies);
			var randomMovie =  Math.floor(Math.random() * moviesParsed.length);
			this.moviedbAPIService.getSimilairMovies(moviesParsed[randomMovie].id)
			.subscribe(
				(response: any) => {
					this.foryou = response.results;
				}
			)
		}
	}

	ngOnInit(): void
	{
		const urlSearch = this.route.snapshot.queryParamMap.get('search');
		if (urlSearch) {
			this.searchQuery = urlSearch;
			this.searchMovies();
		}
		this.searchSubject.pipe(
			debounceTime(300),
			distinctUntilChanged()
		).subscribe(query => {
			this.performSearch(query);
		});
		this.seoService.updateMeta({
			title: "Soulima Movies | Free Streaming of Movies & Cinema Hits",
			description: "Watch your favorite movies for free on Soulima. Explore trending cinema hits, classic movies, and new releases in high definition.",
			keywords: "سوليما, Soulima, مشاهدة أفلام, أفلام عربية, أفلام مجانية, streaming movies, movies, free streaming, TV shows, online streaming, watch movies online, Moroccan streaming",
			schema: {
				"@context": "https://schema.org",
				"@type": "WebSite",
				"url": "https://soulima.net/",
				"name": "Soulima Movies",
				"description": "Watch your favorite movies for free on Soulima. Explore trending cinema hits, classic movies, and new releases in high definition.",
				"potentialAction": {
					"@type": "SearchAction",
					"target": "https://soulima.net/?search={search_term_string}",
					"query-input": "required name=search_term_string"
				}
			}
		});
		this.getForYou()
		const data = localStorage.getItem("movies")
		if (data) {
			const parsed = JSON.parse(data);
			const unique = [];
			const seen = new Set();
			for (const m of parsed) {
				if (m && m.id && !seen.has(m.id)) {
					unique.push(m);
					seen.add(m.id);
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
			this.moviedbAPIService.getTrendingMovies(),
			this.moviedbAPIService.getTopRatedMovies(),
			this.moviedbAPIService.getNewRelease()
		]).subscribe({
			next: (responses: any[]) => {
				this.trendingMovies = responses[0]?.results || [];
				this.topRatedMovies = responses[1]?.results || [];
				this.newReleasedMovies = responses[2]?.results || [];
				
				// Seed search corrector service
				this.searchCorrector.addMediaItems(this.trendingMovies);
				this.searchCorrector.addMediaItems(this.topRatedMovies);
				this.searchCorrector.addMediaItems(this.newReleasedMovies);
				
				if (this.trendingMovies.length > 0) {
					this.getMovieImage();
				} else {
					this.loading = false;
					this.showLoadingScreen = false;
				}
			},
			error: (err) => {
				console.error("Error fetching homepage movies:", err);
				this.loading = false;
				this.showLoadingScreen = false;
			}
		});
	}

	switchDivs(): void {
		const div1 = document.getElementById('e1');
		const div2 = document.getElementById('div2');
	
		if (div1 && div2) {
		  const parent = div1.parentNode;
	
		  // Create a temporary placeholder
		  const temp = document.createElement('div');
		  temp.style.display = 'none'; // Hide the temporary element
	
		  // Insert the temp before div1
		  parent?.insertBefore(temp, div1);
	
		  // Move div1 before div2
		  parent?.insertBefore(div1, div2);
	
		  // Move div2 before the temp element
		  parent?.insertBefore(div2, temp);
	
		  // Remove the temporary element
		  parent?.removeChild(temp);
		}
	  }

	ngOnDestroy()
	{
		this.renderer.removeStyle(document.body, 'overflow');
	}


	stopClose(event:MouseEvent)
	{
		event.stopPropagation();
	}

	routerDetailMovie(item: any)
	{
		this.closePopUp();
		if (!item) return;

		let id = typeof item === 'object' ? item.id : item;
		let isTv = false;
		if (typeof item === 'object') {
			isTv = !!(item.name || item.first_air_date || item.isTvShow);
		} else {
			if (this.popUpMovie && this.popUpMovie.id === id) {
				isTv = !!(this.popUpMovie.name || this.popUpMovie.first_air_date || this.popUpMovie.isTvShow);
			}
		}

		if (isTv) {
			const series = localStorage.getItem("series");
			if (series) {
				const seriesParsed = JSON.parse(series);
				for (let i = 0; i < seriesParsed.length; i++) {
					if (seriesParsed[i].id == id) {
						this.router.navigate(['/serie/' + id + '/' + seriesParsed[i].seasonnb + '/' + seriesParsed[i].episodenb]);
						return;
					}
				}
			}
			this.router.navigate(['/serie/' + id + '/1/1']);
		} else {
			this.router.navigate(['/movie', id]);
		}
	}

	onLoadingScreenDismissed() {
		this.showLoadingScreen = false;
	}
}
