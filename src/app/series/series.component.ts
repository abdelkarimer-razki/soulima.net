import { Component } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { MoviedbAPIService } from '../services/moviedb-api.service';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { HttpClient } from '@angular/common/http';
import { forkJoin, firstValueFrom  } from 'rxjs';



@Component({
  selector: 'app-series',
  templateUrl: './series.component.html',
  styleUrls: ['./series.component.css']
})
export class SeriesComponent {

  id: number = 0;
  season: number = 1;
  episode: number = 1;
  serie: any = "";
  showSelector = false
  epiSelector = false

  seasons:any[] = [];
  episodes:any[] = [];
  link: SafeResourceUrl = "";
  constructor(    private route: ActivatedRoute,
    private moviedbAPIService: MoviedbAPIService,
    private sanitizer: DomSanitizer,
    private http: HttpClient){
      this.route.params.subscribe(params => {
        this.id = params['id'];
        this.episode = params['episode']
        this.season = params['season']
        this.link = this.sanitizer.bypassSecurityTrustResourceUrl("https://vidsrc.in/embed/tv/" + this.id + "/"+ this.season+"/"+ this.episode+"?player=new&ds_lang=ar");
    });
    }

    changeEpisode(episdoe:number)
    {
      this.epiSelector = false;
      this.showSelector = false;
      this.episode = episdoe + 1;
      window.history.pushState({}, '', '/serie/'+this.id+'/' + this.season + '/' + this.episode);
      this.link = this.sanitizer.bypassSecurityTrustResourceUrl("https://vidsrc.in/embed/tv/" + this.id + "/"+ this.season+"/"+ this.episode+"?player=new&ds_lang=ar");
    }

    createRange(number: number): number[] {
      return Array.from({ length: number }, (_, index) => index + 1);
    }

    changeSeason(event:any)
    {
      this.season = event.target.value;
    }
    
  ngOnInit(): void {
    this.getEpisodeDetails()
    this.moviedbAPIService.getSerieDetails(this.id)
    .subscribe(
      (response: any) => {
        this.serie = response;

        this.serie.seasons.forEach((element:any) => {
          if (element.episode_count != 0 && element.name != "Specials")
            this.seasons.push(element)
        });
      }
    )
  }

  getEpisodeDetails()
  {
    this.moviedbAPIService.getEpisodeDetails(1396,1,1)
    .subscribe(
        (response: any) => {
        }
    )
  }

  back()
  {
    this.epiSelector = false;
    this.showSelector = true;
  }

  async choseSeason(seasonNb:number)
  {
    this.season = seasonNb + 1;
    this.epiSelector = true
    this.showSelector = false;
    const episodePromises = [];

    for (let i = 0; i < this.seasons[seasonNb].episode_count; i++) {
      episodePromises.push(
        this.moviedbAPIService.getEpisodeDetails(this.serie.id, this.season, i + 1).toPromise()
      );
    }

    this.episodes = []
  
    try {
      this.episodes = await Promise.all(episodePromises);
    } catch (error) {
      console.error('Error fetching episodes:', error);
    }
  }


}
