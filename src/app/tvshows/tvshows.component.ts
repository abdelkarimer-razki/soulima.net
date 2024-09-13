import { Component,Renderer2  } from '@angular/core';
import { MoviedbAPIService } from '../services/moviedb-api.service';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { trigger, transition, style, animate } from '@angular/animations';


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
  searchQuery: string ="";
  moviePoster = "";
  moviePosterData:any;
  series: any[] = [];
  trendingSeries: any[] = [];
  showSearch = false
  topRatedSeries:any[] = [];
  newReleasedSeries:any[] = [];
  isSeries = true;

  sanitizedUrls: SafeResourceUrl[] = [];
  constructor(private moviedbAPIService: MoviedbAPIService,private router:Router,private http: HttpClient,private sanitizer: DomSanitizer,private renderer: Renderer2) { }


    searchSeries() {
      this.moviedbAPIService.searchSeries(this.searchQuery)
        .subscribe((response: any) => {
          this.series = response.results;
        });
      }


      getSerieImage()
      {
        const posterMovieNb:any = Math.floor(Math.random() * 15);
        this.moviedbAPIService.getSerieDetails(this.trendingSeries[posterMovieNb].id)
        .subscribe((response: any) => {
          this.moviePosterData = response
          console.log(this.moviePosterData)
        })
        this.moviedbAPIService.getSerieImages(this.trendingSeries[posterMovieNb].id)
        .subscribe((response: any) => {
          this.moviePoster = response.backdrops[0].file_path
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
  
}
