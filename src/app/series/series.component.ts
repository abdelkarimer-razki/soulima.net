import { Component } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { MoviedbAPIService } from '../services/moviedb-api.service';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { HttpClient } from '@angular/common/http';


@Component({
  selector: 'app-series',
  templateUrl: './series.component.html',
  styleUrls: ['./series.component.css']
})
export class SeriesComponent {

  id: number = 0;
  season: number = 0;
  episode: number = 0;
  serie: any = "";

  seasons:any[] = [];
  link: SafeResourceUrl = "";
  constructor(    private route: ActivatedRoute,
    private moviedbAPIService: MoviedbAPIService,
    private sanitizer: DomSanitizer,
    private http: HttpClient){
      this.route.params.subscribe(params => {
        this.id = params['id'];
        this.episode = params['episode']
        this.season = params['season']
        this.link = this.sanitizer.bypassSecurityTrustResourceUrl("https://vidsrc.pro/embed/tv/" + this.id + "/"+ this.season+"/"+ this.episode+"?player=new&ds_lang=ar");
    });

    }

  ngOnInit(): void {
    this.moviedbAPIService.getSerieDetails(this.id)
    .subscribe(
      (response: any) => {
        this.serie = response;
        this.serie.seasons.forEach((element:any) => {
          this.seasons.push(element.episode_count)
        });

        console.log(this.serie, this.seasons)
      }
    )
  }


}
