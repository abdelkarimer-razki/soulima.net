import { Component, OnInit} from '@angular/core';
import { Router } from '@angular/router';
import { ActivatedRoute } from '@angular/router';
import { MoviedbAPIService } from '../services/moviedb-api.service';

@Component({
	selector: 'app-movie',
	templateUrl: './movie.component.html',
	styleUrls: ['./movie.component.css']
})
export class MovieComponent {
	constructor(private route:ActivatedRoute,private router:Router,private moviedbAPIService: MoviedbAPIService,) { }
	id:number=this.route.snapshot.params['id'];
	movie: any = "";
	ngOnInit(): void {
		this.moviedbAPIService.getMovieDetails(this.id)
		.subscribe((response: any) => {
		this.movie = response
		console.log(this.movie)
		});
	}
	like()
	{
		window.location.href = "https://vidsrc.xyz/embed/movie/" + this.id;
		localStorage.setItem("id",this.movie.id);
	}
}
