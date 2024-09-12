import { Component, OnInit,  ViewChild, ElementRef } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { MoviedbAPIService } from '../services/moviedb-api.service';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-movie',
  templateUrl: './movie.component.html',
  styleUrls: ['./movie.component.css']
})
export class MovieComponent implements OnInit {
  @ViewChild('iframeElement') iframeElement!: ElementRef;

  id: number = 0;
  movie: any = "";
  link: SafeResourceUrl = "";

  constructor(
    private route: ActivatedRoute,
    private moviedbAPIService: MoviedbAPIService,
    private sanitizer: DomSanitizer,
    private http: HttpClient
  ) { 
    this.route.params.subscribe(params => {
      this.id = params['id'];
      this.link = this.sanitizer.bypassSecurityTrustResourceUrl("https://vidsrc.pro/embed/movie/" + this.id + "?player=new&ds_lang=ar");
  });

  }

// Run the function repeatedly every 1000 milliseconds (1 second)

  ngOnInit(): void {
    // this.detectNewTabOpened();
      // setInterval(this.removeSpecificElement, 1);
    this.moviedbAPIService.getMovieDetails(this.id)
      .subscribe((response: any) => {
        this.movie = response;
        this.checkWebsiteStatus("https://vidsrc.pro/embed/movie/" + this.id);
      });
      const iframe = document.getElementById('vidsrc') as HTMLIFrameElement;
  
      if (iframe && iframe.contentWindow) {
        iframe.contentWindow.open = function() {
          console.log('Pop-up blocked from vidsrc iframe!');
          return null;
        };
      }
  }


  checkWebsiteStatus(url: string) {
    this.http.get(url, { observe: 'response' }).subscribe(response => {
    }, error => {
      //error 0 = not working
      //error 200 = working
    });
  }
}
