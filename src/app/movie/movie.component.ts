import { Component, OnInit, ElementRef,ViewChild, AfterViewInit} from '@angular/core';
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

  id: number = 0;
  movie: any = "";
  link: SafeResourceUrl = "";
  embed: string = "https://vidsrc.net/embed";
  @ViewChild('vidsrc', { static: false }) iframe!: ElementRef;

  constructor(
    private route: ActivatedRoute,
    private moviedbAPIService: MoviedbAPIService,
    private sanitizer: DomSanitizer,
    private http: HttpClient
  ) { 
    this.route.params.subscribe(params => {
      this.id = params['id'];
      this.link = this.sanitizer.bypassSecurityTrustResourceUrl( this.embed + "/movie/" + this.id + "?player=new&ds_lang=ar");
  });

  }

// Run the function repeatedly every 1000 milliseconds (1 second)

  ngOnInit(): void {
    // this.detectNewTabOpened();
      // setInterval(this.removeSpecificElement, 1);
    this.moviedbAPIService.getMovieDetails(this.id)
      .subscribe((response: any) => {
        this.movie = response;
        //this.checkWebsiteStatus("https://vidsrc.pro/embed/movie/" + this.id);
      });
  }

  ngAfterViewInit(): void {
    // Listen for the iframe load event
    if (this.iframe)
    {
      this.iframe.nativeElement.onload = () => {
        try {
          // Access the iframe's contentDocument
          const iframeDocument = this.iframe.nativeElement.contentDocument || this.iframe.nativeElement.contentWindow.document;
  
          // Get the HTML content of the iframe
          const iframeHTML = iframeDocument.documentElement.innerHTML;
          console.log('Iframe HTML:', iframeHTML);
        } catch (error) {
          console.error('Error accessing iframe content:', error);
        }
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
