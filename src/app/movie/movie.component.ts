import { Component, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { MoviedbAPIService } from '../services/moviedb-api.service';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { HttpClient, HttpErrorResponse, HttpResponse } from '@angular/common/http';
import { Observable } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';

@Component({
  selector: 'app-movie',
  templateUrl: './movie.component.html',
  styleUrls: ['./movie.component.css']
})
export class MovieComponent implements OnInit {
  id: number = 0;
  movie: any = "";
  private vidSrcApiUrl = 'https://vidsrc.xyz/embed/movie';
  link: SafeResourceUrl = "";

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private moviedbAPIService: MoviedbAPIService,
    private sanitizer: DomSanitizer,
    private http: HttpClient
  ) { 
    this.route.params.subscribe(params => {
      this.id = params['id'];
      this.link = this.sanitizer.bypassSecurityTrustResourceUrl("https://vidsrc.pro/embed/movie/" + this.id);
  });
  }

  ngOnInit(): void {
    this.moviedbAPIService.getMovieDetails(this.id)
      .subscribe((response: any) => {
        this.movie = response;
        this.checkWebsiteStatus("https://vidsrc.pro/embed/movie/" + this.id);
      });
  }


  checkWebsiteStatus(url: string) {
    this.http.get(url, { observe: 'response' }).subscribe(response => {
    }, error => {
      //error 0 = not working
      //error 200 = working
    });
  }

  private handleError(error: HttpErrorResponse) {
    alert("error");
    // Log the error or handle it based on your requirements
    return throwError(error);
  }


  like() {
    window.location.href = "https://vidsrc.xyz/embed/movie/" + this.id;
    localStorage.setItem("id", this.movie.id);
  }

  clicked(event:any)
  {

      event.preventDefault();  // Prevent the default action (e.g., link redirection)
  }
}
