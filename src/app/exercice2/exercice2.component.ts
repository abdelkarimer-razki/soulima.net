import { Component,Renderer2,OnInit, ViewChild  } from '@angular/core';
import { MoviedbAPIService } from '../services/moviedb-api.service';
import { Router } from '@angular/router';
import { trigger, transition, style, animate } from '@angular/animations';
import { YouTubePlayer } from '@angular/youtube-player';
import { forkJoin } from 'rxjs';
import { CookieService } from 'ngx-cookie-service';

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
	//movies variables
	movies: any[] = [];
	trendingMovies: any[] = [];
	topRatedMovies:any[] = [];
	newReleasedMovies:any[] = [];
	recentlyWatched:any[] = [];
	foryou:any[] = [];

	isMovies = true;
	showSearch = false
	moviePosterData:any;

	popUp = false;
	popUpMovie:any;
	popUpPoster = "";
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
	isSearching = false;
	isPopUpLoading = false;

	constructor(
		private moviedbAPIService: MoviedbAPIService,
		private router:Router,
		private renderer: Renderer2,
		private cookie: CookieService
	) { }

	sliceTo3(table:any[]):any[]
	{
		return table.slice(0,3);
	}

	searchMovies()
	{
		if (!this.searchQuery) {
			this.movies = [];
			this.isSearching = false;
			return;
		}
		this.isSearching = true;
		this.moviedbAPIService.searchMovies(this.searchQuery)
		.subscribe({
			next: (response: any) => {
				this.movies = response.results;
				this.isSearching = false;
			},
			error: () => {
				this.isSearching = false;
			}
		});
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
		this.moviedbAPIService.getMovieDetails(this.trendingMovies[posterMovieNb].id)
		.subscribe((response: any) => {
			this.moviePosterData = response;
			setTimeout(() => {
				this.loading = false;
			}, 2000)
		})
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
		this.startTrailer = false;
		this.mute = true;
		this.popUpMovie = movie;
		this.isPopUpLoading = true;

		forkJoin([
			this.moviedbAPIService.getMovieDetails(movie.id),
			this.moviedbAPIService.getMovieImages(movie.id),
			this.moviedbAPIService.getVideosMovie(movie.id)
		]).subscribe({
			next: ([details, images, videos]: [any, any, any]) => {
				this.popUpMovie = details;
				this.popUpPoster = images.backdrops[2]?.file_path || images.backdrops[0]?.file_path || details.backdrop_path;
				
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
	}

	closePopUp()
	{
		this.popUp=false;
		this.popUpMovie = {};
		this.popUpPoster=""; 
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
		forkJoin([
			this.moviedbAPIService.getTrendingMovies(),
			this.moviedbAPIService.getTopRatedMovies(),
			this.moviedbAPIService.getNewRelease()
		]).subscribe((responses:any[]) =>
			{
				this.trendingMovies = responses[0].results;
				this.topRatedMovies = responses[1].results;
				this.newReleasedMovies = responses[2].results;
				this.getMovieImage();
			}
		)
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

	routerDetailMovie(id: number)
	{
		this.router.navigate(['/movie',id]);
	}
}
