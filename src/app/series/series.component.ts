import { Component, OnInit, NgZone } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
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
	season: number = 1;
	episode: number = 1;
	serie: any = '';
	showSelector = false;
	epiSelector = false;
	servers = [
		{ name: 'Server 1 (Vidsrc.net)', url: 'https://vidsrc.net/embed' },
		{ name: 'Server 2 (Vidsrc.to)',  url: 'https://vidsrc.to/embed'  },
		{ name: 'Server 3 (Embed.su)',   url: 'https://embed.su/embed'   },
		{ name: 'Server 4 (Vidsrc.pro)', url: 'https://vidsrc.pro/embed' },
		{ name: 'Server 5 (Vidsrc.me)',  url: 'https://vidsrc.me/embed'  }
	];
	selectedServerIndex = 0;

	/** 'checking' | 'online' | 'offline' for each server */
	serverStatus: string[] = this.servers.map(() => 'checking');

	seasons: any[] = [];
	episodes: any[] = [];
	link: SafeResourceUrl = '';

	constructor(
		private route: ActivatedRoute,
		private moviedbAPIService: MoviedbAPIService,
		private sanitizer: DomSanitizer,
		private http: HttpClient,
		private zone: NgZone
	) {
		this.route.params.subscribe(params => {
			this.id      = params['id'];
			this.episode = params['episode'];
			this.season  = params['season'];
			this.updateLink();
		});
	}

	updateLink() {
		const embedUrl = this.servers[this.selectedServerIndex].url;
		this.link = this.sanitizer.bypassSecurityTrustResourceUrl(
			`${embedUrl}/tv/${this.id}/${this.season}/${this.episode}?player=new&ds_lang=ar`
		);
	}

	selectServer(index: number) {
		this.selectedServerIndex = index;
		this.updateLink();
	}

	/** Let the user manually flag media-unavailable (cross-origin iframes prevent auto-detection) */
	reportUnavailable(index: number) {
		this.serverStatus[index] = 'offline';
	}

	/** Open EZTV search for the series name — covers all TV shows reliably */
	openDownload() {
		const name  = this.serie?.name || this.serie?.original_name || '';
		const s     = String(this.season).padStart(2, '0');
		const query = encodeURIComponent(`${name} S${s}`);
		window.open(`https://eztvx.to/search/${query}`, '_blank');
	}

	/** Probe each server embed URL with a no-cors fetch + 6 s timeout */
	private async checkServerStatus(url: string): Promise<string> {
		const controller = new AbortController();
		const tid = setTimeout(() => controller.abort(), 6000);
		try {
			await fetch(`${url}/tv/${this.id}/${this.season}/${this.episode}`, {
				mode: 'no-cors',
				signal: controller.signal
			});
			clearTimeout(tid);
			return 'online';
		} catch {
			clearTimeout(tid);
			return 'offline';
		}
	}

	private checkAllServers() {
		this.servers.forEach((server, i) => {
			this.checkServerStatus(server.url).then(status => {
				this.zone.run(() => { this.serverStatus[i] = status; });
			});
		});
	}

	ngOnChanges() {
		var id = document.getElementById('video-element');
	}

	changeEpisode(episdoe: number) {
		this.epiSelector = false;
		this.showSelector = false;
		this.episode = episdoe + 1;
		window.history.pushState({}, '', '/serie/' + this.id + '/' + this.season + '/' + this.episode);
		this.updateLink();
		this.checkAllServers();
		var Movieslocal = localStorage.getItem('series');
		var Movies: any = [];
		if (Movieslocal) {
			console.log('changed!');
			Movies = JSON.parse(Movieslocal);
			this.findElementAndSwitchEpi(Movies);
		}
	}

	createRange(number: number): number[] {
		return Array.from({ length: number }, (_, index) => index + 1);
	}

	changeSeason(event: any) {
		this.season = event.target.value;
	}

	ngOnInit(): void {
		this.getEpisodeDetails();
		this.moviedbAPIService.getSerieDetails(this.id).subscribe((response: any) => {
			this.serie = response;
			this.serie.seasonnb = this.season;
			this.serie.episodenb = this.episode;
			var Movieslocal = localStorage.getItem('series');
			var Movies: any = [];
			if (Movieslocal) {
				Movies = JSON.parse(Movieslocal);
				this.findElementAndSwitchEpi(Movies);
			}
			this.getRecentlyWatched();
			this.serie.seasons.forEach((element: any) => {
				if (element.episode_count != 0 && element.name != 'Specials')
					this.seasons.push(element);
			});
		});
		this.checkAllServers();
	}

	getRecentlyWatched() {
		var Movieslocal = localStorage.getItem('series');
		var Movies: any = [];
		if (Movieslocal) Movies = JSON.parse(Movieslocal);
		if (this.findElement(Movies) == false) {
			if (Movies.length == 20) Movies[0] = this.serie;
			else Movies.unshift(this.serie);
		} else {
			for (let i = 0; i < Movies.length; i++)
				if (Movies[i].id == this.id) Movies.splice(i, 1);
			if (Movies.length > 0) Movies.unshift(this.serie);
			else Movies.push(this.serie);
		}
		localStorage.setItem('series', JSON.stringify(Movies));
	}

	findElementAndSwitchEpi(Movies: any) {
		for (let i = 0; i < Movies.length; i++) {
			if (Movies[i].id == this.id) {
				this.serie.seasonnb = this.season;
				this.serie.episodenb = this.episode;
				this.getRecentlyWatched();
				break;
			}
		}
	}

	findElement(Movies: any): boolean {
		for (let i = 0; i < Movies.length; i++)
			if (Movies[i].id == this.id) return true;
		return false;
	}

	getEpisodeDetails() {
		this.moviedbAPIService.getEpisodeDetails(1396, 1, 1).subscribe((response: any) => {});
	}

	back() {
		this.epiSelector = false;
		this.showSelector = true;
	}

	async choseSeason(seasonNb: number) {
		this.season = seasonNb + 1;
		this.epiSelector = true;
		this.showSelector = false;
		const episodePromises = [];

		for (let i = 0; i < this.seasons[seasonNb].episode_count; i++) {
			episodePromises.push(
				this.moviedbAPIService.getEpisodeDetails(this.serie.id, this.season, i + 1).toPromise()
			);
		}

		this.episodes = [];
		try {
			this.episodes = await Promise.all(episodePromises);
		} catch (error) {
			console.error('Error fetching episodes:', error);
		}
	}
}
