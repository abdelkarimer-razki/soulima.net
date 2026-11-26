import { Component, Renderer2, OnInit, OnDestroy, ViewChild, HostListener, ElementRef } from '@angular/core';
import { Title, Meta } from '@angular/platform-browser';
import { MoviedbAPIService } from '../services/moviedb-api.service';
import { Router, ActivatedRoute } from '@angular/router';
import { trigger, transition, style, animate } from '@angular/animations';
import { YouTubePlayer } from '@angular/youtube-player';
import { forkJoin, Subject, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { CookieService } from 'ngx-cookie-service';
import { SeoService } from '../services/seo.service';
import { SearchCorrectorService } from '../services/search-corrector.service';
import { WatchProgressService } from '../services/watch-progress.service';

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
			transition(':leave', [style({ opacity: '1'}), animate('1000ms', style({ opacity: '0' }))])
		])]
})
export class Exercice2Component implements OnInit, OnDestroy
{
	@ViewChild(YouTubePlayer) player!: YouTubePlayer;
	searchQuery: string = "";
	suggestedCorrection: string | null = null;
	ghostText: string = "";
	autocompleteTitle: string = "";
	searchSubject = new Subject<string>();
	private searchSub?: Subscription;
	autocompleteSuggestions: any[] = [];
	showAutocomplete = false;

	// View filters
	activeFilter: 'all' | 'movies' | 'series' = 'all';
	searchFilter: 'all' | 'movies' | 'series' = 'all';

	// Content catalogs
	movies: any[] = [];
	searchedMovies: any[] = [];
	searchedSeries: any[] = [];
	
	trendingMovies: any[] = [];
	topRatedMovies: any[] = [];
	newReleasedMovies: any[] = [];
	
	trendingSeries: any[] = [];
	topRatedSeries: any[] = [];
	newReleasedSeries: any[] = [];

	trendingMixed: any[] = [];
	recentlyWatched: any[] = [];
	recentlyWatchedSeries: any[] = [];
	recentlyWatchedMixed: any[] = [];
	foryou: any[] = [];
 
	showSearch = false;
	moviePosterData: any;
	moviePosterLogo = "";

	popUp = false;
	popUpMovie: any;
	popUpPoster = "";
	popUpLogo = "";
	startTrailer = false;

	genraMovies: any[] = [];
	genraName = "";
	genraSearch = false;
	popUpLink: string = "";
	mute: boolean = true;
	playerVars = {
		disablekb: 1,
		autoplay: 1,
		controls: 0,
		rel: 0,
		modestbranding: 1,
		mute: 1,
		loop: 1
	};

	loading = true;
	showLoadingScreen = true;
	isSearching = false;
	isPopUpLoading = false;
	private lastFocusedCard: HTMLElement | null = null;

	constructor(
		private moviedbAPIService: MoviedbAPIService,
		private router: Router,
		private route: ActivatedRoute,
		private renderer: Renderer2,
		private cookie: CookieService,
		private titleService: Title,
		private metaService: Meta,
		private seoService: SeoService,
		private elementRef: ElementRef,
		private searchCorrector: SearchCorrectorService,
		public watchProgress: WatchProgressService
	) { }

	sliceTo3(table: any[]): any[]
	{
		return table.slice(0, 3);
	}

	isItemTv(item: any): boolean {
		if (!item) return false;
		return !!(item.name || item.first_air_date || item.isTvShow || item.media_type === 'tv' || item.seasonnb || item.episodenb);
	}

	get filteredSearchResults(): any[] {
		if (this.searchFilter === 'movies') {
			return this.searchedMovies;
		}
		if (this.searchFilter === 'series') {
			return this.searchedSeries;
		}
		return this.movies;
	}

	setFilter(filter: 'all' | 'movies' | 'series') {
		const previousFilter = this.activeFilter;
		this.activeFilter = filter;
		this.updateSeoMeta();
		if (previousFilter !== filter && (this.trendingMovies.length > 0 || this.trendingSeries.length > 0)) {
			this.getBillboardImage();
		}
		this.router.navigate([], {
			relativeTo: this.route,
			queryParams: filter === 'all' ? { filter: null } : { filter },
			queryParamsHandling: 'merge'
		});
	}

	setSearchFilter(filter: 'all' | 'movies' | 'series') {
		this.searchFilter = filter;
	}

	updateSeoMeta() {
		if (this.activeFilter === 'series') {
			this.seoService.updateMeta({
				title: "Soulima TV Shows | Free Streaming of TV Series & Seasons",
				description: "Watch trending TV series, full seasons, and new releases for free in high quality on Soulima.",
				keywords: "سوليما, Soulima, مشاهدة مسلسلات, مسلسلات أونلاين, streaming tv shows, free series",
				url: "https://soulima.net/#/?filter=series"
			});
		} else if (this.activeFilter === 'movies') {
			this.seoService.updateMeta({
				title: "Soulima Movies | Free Streaming of Movies & Cinema Hits",
				description: "Watch trending movies, blockbuster cinema, and new releases for free in high quality on Soulima.",
				keywords: "سوليما, Soulima, مشاهدة أفلام, streaming movies, movies",
				url: "https://soulima.net/#/?filter=movies"
			});
		} else {
			this.seoService.updateMeta({
				title: "Soulima | Free Streaming of Movies & TV Shows",
				description: "Watch your favorite movies and TV shows for free on Soulima. Explore trending cinema hits, classic series, and new releases in HD.",
				keywords: "سوليما, Soulima, مشاهدة أفلام, مسلسلات, streaming movies, tv shows, free streaming",
				url: "https://soulima.net/"
			});
		}
	}

	buildMixedTrending() {
		const mixed: any[] = [];
		const max = Math.max(this.trendingMovies.length, this.trendingSeries.length);
		for (let i = 0; i < max && mixed.length < 10; i++) {
			if (this.trendingMovies[i]) {
				mixed.push({ ...this.trendingMovies[i], media_type: 'movie', isTvShow: false });
			}
			if (mixed.length < 10 && this.trendingSeries[i]) {
				mixed.push({ ...this.trendingSeries[i], media_type: 'tv', isTvShow: true });
			}
		}
		this.trendingMixed = mixed;
	}

	loadRecentlyWatched() {
		let moviesList: any[] = [];
		try {
			const moviesRaw = localStorage.getItem("movies");
			if (moviesRaw) {
				const parsed = JSON.parse(moviesRaw);
				const seen = new Set();
				for (const m of parsed) {
					if (m && m.id && !seen.has(m.id)) {
						moviesList.push({ ...m, isTvShow: false, updated_at: m.updated_at || Date.now() });
						seen.add(m.id);
					}
				}
			}
		} catch (_) {}
		this.recentlyWatched = moviesList;

		const seriesList = (this.watchProgress.getHistory() || []).map(s => ({ ...s, isTvShow: true }));
		this.recentlyWatchedSeries = seriesList;

		const combined = [...seriesList, ...moviesList];
		combined.sort((a: any, b: any) => (b.updated_at || 0) - (a.updated_at || 0));
		this.recentlyWatchedMixed = combined;
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
				const movieResults = (moviesResponse.results || []).map((m: any) => ({ ...m, media_type: 'movie', isTvShow: false }));
				const seriesResults = (seriesResponse.results || []).map((s: any) => ({ ...s, media_type: 'tv', isTvShow: true }));
				
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
		const isTv = this.isItemTv(item);
		if (isTv) {
			const series = localStorage.getItem("series");
			if (series) {
				try {
					const seriesParsed = JSON.parse(series);
					const matched = seriesParsed.find((s: any) => s && s.id === item.id);
					if (matched) {
						return `/serie/${item.id}/${matched.seasonnb || 1}/${matched.episodenb || 1}`;
					}
				} catch (_) {}
			}
			return `/serie/${item.id}/1/1`;
		}
		return `/movie/${item.id}`;
	}

	onCardClick(event: Event | MouseEvent | KeyboardEvent, item: any) {
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

	getBillboardImage()
	{
		const useSeries = this.activeFilter === 'series' && this.trendingSeries.length > 0;
		const useMovies = this.activeFilter === 'movies' && this.trendingMovies.length > 0;
		
		let list: any[] = [];
		if (useSeries) {
			list = this.trendingSeries;
		} else if (useMovies) {
			list = this.trendingMovies;
		} else {
			list = this.trendingMixed.length > 0 ? this.trendingMixed : (this.trendingMovies.length > 0 ? this.trendingMovies : this.trendingSeries);
		}

		if (!list || list.length === 0) {
			this.loading = false;
			return;
		}

		const randIdx = Math.floor(Math.random() * Math.min(10, list.length));
		const selectedItem = list[randIdx];
		const isTv = this.isItemTv(selectedItem);

		const details$ = isTv ? this.moviedbAPIService.getSerieDetails(selectedItem.id) : this.moviedbAPIService.getMovieDetails(selectedItem.id);
		const images$ = isTv ? this.moviedbAPIService.getSerieImages(selectedItem.id) : this.moviedbAPIService.getMovieImages(selectedItem.id);

		forkJoin([details$, images$]).subscribe({
			next: ([details, images]: [any, any]) => {
				this.moviePosterData = { ...details, isTvShow: isTv };
				const logo = images.logos?.find((l: any) => l.iso_639_1 === 'en') || images.logos?.[0];
				this.moviePosterLogo = logo ? logo.file_path : "";

				setTimeout(() => {
					this.loading = false;
				}, 300);
			},
			error: (err) => {
				console.error("Error loading billboard image/logo:", err);
				this.loading = false;
			}
		});
	}

	getMovieVideos(movieId: any)
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
		this.mute = !this.mute;
		if (this.mute)
			this.player?.mute();
		else
			this.player?.unMute();
	}

	showPopUp(movie: any)
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

		const isTv = this.isItemTv(movie);

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
						
						this.popUpPoster = episodeDetails.still_path || images.backdrops?.[2]?.file_path || images.backdrops?.[0]?.file_path || details.backdrop_path;
						
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
						this.popUpPoster = images.backdrops?.[2]?.file_path || images.backdrops?.[0]?.file_path || details.backdrop_path;
						
						const logo = images.logos?.find((l: any) => l.iso_639_1 === 'en') || images.logos?.[0];
						this.popUpLogo = logo ? logo.file_path : "";

						const trailer = videos.results?.find((video: any) => video.type === 'Trailer');
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
						isTvShow: false,
						directors: directors,
						cast: cast
					};
					this.popUpPoster = images.backdrops?.[2]?.file_path || images.backdrops?.[0]?.file_path || details.backdrop_path;
					
					const logo = images.logos?.find((l: any) => l.iso_639_1 === 'en') || images.logos?.[0];
					this.popUpLogo = logo ? logo.file_path : "";

					const trailer = videos.results?.find((video: any) => video.type === 'Trailer');
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

	getMoviesByGenre(genreId: number, genraName: string)
	{
		this.moviedbAPIService.getMovieByGenres(genreId, 1).subscribe((response: any) => {
			this.genraMovies = response.results;
			this.genraName = genraName;
			this.genraSearch = true;
		});
		window.scrollTo(0, 0);
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
		this.popUp = false;
		this.popUpMovie = {};
		this.popUpPoster = ""; 
		this.popUpLogo = "";
		this.startTrailer = false;
		this.mute = true;
		this.popUpLink = "";
		this.renderer.removeStyle(document.body, 'overflow');
		if (this.lastFocusedCard) {
			try {
				this.lastFocusedCard.focus();
			} catch (_) {}
			this.lastFocusedCard = null;
		}
	}

	getForYou()
	{
		const movies = localStorage.getItem("movies");
		const series = localStorage.getItem("series");
		let seedId: number | null = null;
		let isTvSeed = false;

		if (movies) {
			try {
				const parsed = JSON.parse(movies);
				if (parsed.length > 0) {
					const rand = Math.floor(Math.random() * parsed.length);
					seedId = parsed[rand]?.id;
				}
			} catch (_) {}
		}

		if (!seedId && series) {
			try {
				const parsed = JSON.parse(series);
				if (parsed.length > 0) {
					const rand = Math.floor(Math.random() * parsed.length);
					seedId = parsed[rand]?.id;
					isTvSeed = true;
				}
			} catch (_) {}
		}

		if (seedId) {
			const rec$ = isTvSeed ? this.moviedbAPIService.getSimilairSeries(seedId) : this.moviedbAPIService.getSimilairMovies(seedId);
			rec$.subscribe({
				next: (response: any) => {
					this.foryou = (response.results || []).map((item: any) => ({
						...item,
						isTvShow: isTvSeed
					}));
				},
				error: () => {}
			});
		}
	}

	ngOnInit(): void
	{
		this.route.queryParamMap.subscribe(params => {
			const filter = params.get('filter');
			let newFilter: 'all' | 'movies' | 'series' = 'all';
			if (filter === 'movies') {
				newFilter = 'movies';
			} else if (filter === 'series') {
				newFilter = 'series';
			} else if (this.route.snapshot.data['filter'] === 'series') {
				newFilter = 'series';
			} else {
				newFilter = 'all';
			}
			const filterChanged = this.activeFilter !== newFilter;
			this.activeFilter = newFilter;
			this.updateSeoMeta();

			if (filterChanged && (this.trendingMovies.length > 0 || this.trendingSeries.length > 0)) {
				this.getBillboardImage();
			}

			const urlSearch = params.get('search');
			if (urlSearch && urlSearch !== this.searchQuery) {
				this.searchQuery = urlSearch;
				this.searchMovies();
			}
		});

		this.searchSub = this.searchSubject.pipe(
			debounceTime(300),
			distinctUntilChanged()
		).subscribe(query => {
			this.performSearch(query);
		});

		this.getForYou();
		this.loadRecentlyWatched();

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
			this.moviedbAPIService.getNewRelease(),
			this.moviedbAPIService.getTrendingSeries(),
			this.moviedbAPIService.getTopRatedSeries(),
			this.moviedbAPIService.getNewReleaseSeries()
		]).subscribe({
			next: ([trendMovies, topMovies, newMovies, trendSeries, topSeries, newSeries]: any[]) => {
				this.trendingMovies = trendMovies?.results || [];
				this.topRatedMovies = topMovies?.results || [];
				this.newReleasedMovies = newMovies?.results || [];
				this.trendingSeries = trendSeries?.results || [];
				this.topRatedSeries = topSeries?.results || [];
				this.newReleasedSeries = newSeries?.results || [];
				
				// Seed search corrector service with rich unified catalog
				this.searchCorrector.addMediaItems(this.trendingMovies);
				this.searchCorrector.addMediaItems(this.topRatedMovies);
				this.searchCorrector.addMediaItems(this.newReleasedMovies);
				this.searchCorrector.addMediaItems(this.trendingSeries);
				this.searchCorrector.addMediaItems(this.topRatedSeries);
				this.searchCorrector.addMediaItems(this.newReleasedSeries);
				
				this.buildMixedTrending();
				this.getBillboardImage();
			},
			error: (err) => {
				console.error("Error fetching homepage content:", err);
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

	stopClose(event: MouseEvent)
	{
		event.stopPropagation();
	}

	routerDetailMovie(item: any)
	{
		this.closePopUp();
		if (!item) return;

		let id = typeof item === 'object' ? item.id : item;
		let isTv = this.isItemTv(item);

		if (isTv) {
			const series = localStorage.getItem("series");
			if (series) {
				try {
					const seriesParsed = JSON.parse(series);
					for (let i = 0; i < seriesParsed.length; i++) {
						if (seriesParsed[i].id == id) {
							this.router.navigate(['/serie/' + id + '/' + (seriesParsed[i].seasonnb || 1) + '/' + (seriesParsed[i].episodenb || 1)]);
							return;
						}
					}
				} catch (_) {}
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
