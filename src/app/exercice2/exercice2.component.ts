import { Component,Renderer2,OnInit, ViewChild  } from '@angular/core';
import { MoviedbAPIService } from '../services/moviedb-api.service';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { trigger, transition, style, animate } from '@angular/animations';
import { YouTubePlayer } from '@angular/youtube-player';


@Component({
  selector: 'app-exercice2',
  templateUrl: './exercice2.component.html',
  styleUrls: ['./exercice2.component.css'],
  animations: [
		trigger('Loading', [
			transition(':enter', [style({ transform: 'translateY(-200%)'}), animate('300ms', style({ transform: 'translateY(0)' }))]),
			transition(':leave', [style({ transform: 'translateY(0)'}), animate('300ms', style({ transform: 'translateY(-200%)' }))])
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
	isMovies = true;
	moviePoster = "";
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
		mute: 1
	};

	constructor(private moviedbAPIService: MoviedbAPIService,private router:Router,private http: HttpClient,private renderer: Renderer2) { }

	searchMovies()
	{
		this.moviedbAPIService.searchMovies(this.searchQuery)
		.subscribe((response: any) => {
			this.movies = response.results;
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
			this.moviePosterData = response
		})

		this.moviedbAPIService.getMovieImages(this.trendingMovies[posterMovieNb].id)
		.subscribe((response: any) => {
			this.moviePoster = response.backdrops[0].file_path
		})
	}


	getMovieVideos(movieId:any)
	{
		this.moviedbAPIService.getMovieImages(movieId)
		.subscribe((response: any) => {
		this.popUpPoster = response.backdrops[2]?.file_path || response.backdrops[0]?.file_path
		this.moviedbAPIService.getVideosMovie(movieId)
		.subscribe((response: any) => {
			const trailer = response.results.find((video: any) => video.type === 'Trailer');
			if (trailer?.key)
			{
				this.popUpLink = trailer.key;
			}
		})
		})
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
		this.popUp = true;
		this.popUpLink = "";
		this.popUpPoster = "";
		this.startTrailer = false
		this.mute = true;
		this.popUpMovie = movie;
		this.moviedbAPIService.getMovieDetails(movie.id)
		.subscribe((response: any) => {
			this.popUpMovie = response
		})
		this.getMovieVideos(movie.id)
	}

	getMoviesByGenre(genreId:number, genraName:string)
	{
		this.moviedbAPIService.getMovieByGenres(genreId, 1).subscribe((response: any) => {
			this.genraMovies = response.results;
			this.genraName = genraName;
			this.genraSearch = true;
		})
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
	}

	ngOnInit(): void
	{
		this.moviedbAPIService.getTrendingMovies()
		.subscribe((response: any) => {
			this.trendingMovies = response.results
			this.getMovieImage()
		})

		this.moviedbAPIService.getTopRatedMovies()
		.subscribe((response: any) => {
			this.topRatedMovies = response.results
		})

		this.moviedbAPIService.getNewRelease()
		.subscribe((response: any) => {
			this.newReleasedMovies = response.results
		})
	}

	onHover(event: Event)
	{
		const element = event.target as HTMLElement;
		this.renderer.setStyle(element, 'transform', 'scale(1.1)');
		this.renderer.setStyle(element, 'filter', 'saturate(1) drop-shadow(0px 0px 69px rgba(255, 255, 255, 0.335))');
	}

	onLeave(event: Event)
	{
		const element = event.target as HTMLElement;

		this.renderer.removeStyle(element, 'transform');
		this.renderer.removeStyle(element, 'filter');
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
