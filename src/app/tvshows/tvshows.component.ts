import { Component,Renderer2,ViewChild  } from '@angular/core';
import { MoviedbAPIService } from '../services/moviedb-api.service';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { trigger, transition, style, animate } from '@angular/animations';
import { YouTubePlayer } from '@angular/youtube-player';



@Component({
  selector: 'app-tvshows',
  templateUrl: './tvshows.component.html',
  styleUrls: ['./tvshows.component.css'],
  animations: [
		trigger('Loading', [
			transition(':enter', [style({ transform: 'translateY(-200%)'}), animate('300ms', style({ transform: 'translateY(0)' }))]),
			transition(':leave', [style({ transform: 'translateY(0)'}), animate('300ms', style({ transform: 'translateY(-200%)' }))])
		])]
})
export class TvshowsComponent {
	@ViewChild(YouTubePlayer) player!: YouTubePlayer;

  searchQuery: string ="";
  moviePosterData:any;
  series: any[] = [];
  trendingSeries: any[] = [];
  showSearch = false
  topRatedSeries:any[] = [];
  newReleasedSeries:any[] = [];
  isSeries = true;


  popUp=false;
  popUpMovie:any;
  popUpPoster="";
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

  sanitizedUrls: SafeResourceUrl[] = [];
  constructor(private moviedbAPIService: MoviedbAPIService,private router:Router,private http: HttpClient,private sanitizer: DomSanitizer,private renderer: Renderer2) { }


    searchSeries() {
      this.moviedbAPIService.searchSeries(this.searchQuery)
        .subscribe((response: any) => {
          this.series = response.results;
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

      onPlayerReady(event: any)
      {
        const playerState = event.data;
        if (playerState === 1)
          this.startTrailer = true;
      }
      getSerieImage()
      {
        const posterMovieNb:any = Math.floor(Math.random() * 15);
        this.moviedbAPIService.getSerieDetails(this.trendingSeries[posterMovieNb].id)
        .subscribe((response: any) => {
          this.moviePosterData = response
          console.log(this.moviePosterData)
        })
      }

    ngOnInit(): void {
      this.moviedbAPIService.getTrendingSeries()
      .subscribe((response: any) => {
        this.trendingSeries = response.results
        this.getSerieImage()
      })


      this.moviedbAPIService.getTopRatedSeries()
      .subscribe((response: any) => {
        this.topRatedSeries = response.results
      })

      this.moviedbAPIService.getNewReleaseSeries()
      .subscribe((response: any) => {
        this.newReleasedSeries = response.results
      })
    }

    ngOnDestroy()
    {
		  this.renderer.removeStyle(document.body, 'overflow');
    }

    onHover(event: Event) {
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


    getSafeUrl(video: any): SafeResourceUrl {
      let url = '';
      if (video.site === 'YouTube') {
        url = `https://www.youtube.com/embed/${video.key}`;
      } else if (video.site === 'Vimeo') {
        url = `https://player.vimeo.com/video/${video.key}`;
      }
      return this.sanitizer.bypassSecurityTrustResourceUrl(url);
    }


    routerDetailSerie(id: number){
      this.router.navigate(['/serie/'+ id + '/1/1'])
    }
  
    showPopUp(movie:any)
    {
		this.renderer.setStyle(document.body, 'overflow', 'hidden');

      this.popUp = true;
      this.popUpLink = "";
      this.popUpPoster = "";

      this.startTrailer = false
      this.mute = true;
      this.popUpMovie = movie;
      this.moviedbAPIService.getSerieDetails(movie.id)
      .subscribe((response: any) => {
        this.popUpMovie = response
      })
      this.getSerieVideos(movie.id)
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

    getSerieVideos(movieId:any)
    {
      this.moviedbAPIService.getSerieImages(movieId)
      .subscribe((response: any) => {
      this.popUpPoster = response.backdrops[2]?.file_path || response.backdrops[0]?.file_path
      this.moviedbAPIService.getVideosSerie(movieId)
      .subscribe((response: any) => {
        const trailer = response.results.find((video: any) => video.type === 'Trailer');
        if (trailer?.key)
          this.popUpLink = trailer?.key;
      })
      })
    }

    stopClose(event:MouseEvent)
    {
      event.stopPropagation();
    }
}
