import { Component,Renderer2,ViewChild  } from '@angular/core';
import { MoviedbAPIService } from '../services/moviedb-api.service';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { trigger, transition, style, animate } from '@angular/animations';
import { YouTubePlayer } from '@angular/youtube-player';
import { forkJoin } from 'rxjs';




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
export class TvshowsComponent {
	@ViewChild(YouTubePlayer) player!: YouTubePlayer;

	searchQuery: string ="";

	//Series holder
	moviePosterData:any;
	moviePosterLogo = "";
	series: any[] = [];
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
	isSearching = false;
	isPopUpLoading = false;


  sanitizedUrls: SafeResourceUrl[] = [];
  constructor(private moviedbAPIService: MoviedbAPIService,private router:Router,private http: HttpClient,private sanitizer: DomSanitizer,private renderer: Renderer2) { }


    searchSeries() {
      if (!this.searchQuery) {
        this.series = [];
        this.isSearching = false;
        return;
      }
      this.isSearching = true;
      this.moviedbAPIService.searchSeries(this.searchQuery)
        .subscribe({
          next: (response: any) => {
            this.series = response.results;
            this.isSearching = false;
          },
          error: () => {
            this.isSearching = false;
          }
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
      forkJoin(
        [
          this.moviedbAPIService.getTrendingSeries(),
          this.moviedbAPIService.getTopRatedSeries(),
          this.moviedbAPIService.getNewReleaseSeries(),
        ]
      ).subscribe(
        (responses:any[]) =>
        {
          this.trendingSeries = responses[0].results;
          this.topRatedSeries = responses[1].results;
          this.newReleasedSeries = responses[2].results;

          this.getSerieImage()
        }
      )
    }

    ngOnDestroy()
    {
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


    routerDetailSerie(id: number){
      var series = localStorage.getItem("series");
      if (series)
      {
        var seriesParsed = JSON.parse(series);
        for (let i = 0; i < seriesParsed.length; i++)
          if (seriesParsed[i].id == id)
            this.router.navigate(['/serie/'+ id + '/' + seriesParsed[i].seasonnb + '/' + seriesParsed[i].episodenb])
        this.router.navigate(['/serie/'+ id + '/1/1'])
      }
      else
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
      this.isPopUpLoading = true;

      forkJoin([
        this.moviedbAPIService.getSerieDetails(movie.id),
        this.moviedbAPIService.getSerieImages(movie.id),
        this.moviedbAPIService.getVideosSerie(movie.id)
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
}
