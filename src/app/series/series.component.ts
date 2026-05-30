import { Component, OnInit, NgZone } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { MoviedbAPIService } from '../services/moviedb-api.service';
import { TorrentSearchService, Torrent } from '../services/torrent-search.service';
import { DomSanitizer, SafeResourceUrl, Title, Meta } from '@angular/platform-browser';
import { SeoService } from '../services/seo.service';

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
		{ name: 'Server 3 (Vidlink.pro)', url: 'https://vidlink.pro'      },
		{ name: 'Server 4 (Embed.su)',   url: 'https://embed.su/embed'   },
		{ name: 'Server 5 (Vidsrc.cc)',  url: 'https://vidsrc.cc/v2/embed' },
		{ name: 'Server 6 (Vidsrc.pro)', url: 'https://vidsrc.pro/embed' },
		{ name: 'Server 7 (Vidsrc.me)',  url: 'https://vidsrc.me/embed'  },
		{ name: 'Server 8 (Vidsrc.rip)', url: 'https://vidsrc.rip/embed' },
		{ name: 'Server 9 (Vidsrc.xyz)', url: 'https://vidsrc.xyz/embed' },
		{ name: 'Server 10 (Vidsrc.pm)', url: 'https://vidsrc.pm/embed'  },
		{ name: 'Server 11 (Vidsrc.icu)', url: 'https://vidsrc.icu/embed' },
		{ name: 'Server 12 (Vidsrc.in)', url: 'https://vidsrc.in/embed'  },
		{ name: 'Server 13 (2embed.cc)', url: 'https://2embed.cc/embed'  },
		{ name: 'Server 14 (Streamhide)', url: 'https://streamhide.to/embed' },
		{ name: 'Server 15 (Autoembed)', url: 'https://autoembed.cc/embed' },
		{ name: 'Server 16 (Moviedata)', url: 'https://moviedata.info/embed' }
	];
	selectedServerIndex = 0;
	showControls = true;
	showServerDropdown = false;
	private controlsTimeout: any = null;

	/** 'checking' | 'online' | 'offline' for each server */
	serverStatus: string[] = this.servers.map(() => 'checking');

	seasons: any[] = [];
	episodes: any[] = [];
	link: SafeResourceUrl = '';

	// Torrent state
	torrents: Torrent[] = [];
	selectedTorrent: Torrent | null = null;
	torrentMagnet: string | undefined = undefined;
	isSearchingTorrents = false;
	torrentSearchDone = false;
	showTorrentList = false;

	constructor(
		private route: ActivatedRoute,
		private moviedbAPIService: MoviedbAPIService,
		private torrentSearchService: TorrentSearchService,
		private sanitizer: DomSanitizer,
		private zone: NgZone,
		private titleService: Title,
		private metaService: Meta,
		private seoService: SeoService
	) {
		this.route.params.subscribe(params => {
			this.id      = Number(params['id']);
			this.episode = Number(params['episode']);
			this.season  = Number(params['season']);
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

	showPlayerControls() {
		this.showControls = true;
		if (this.controlsTimeout) {
			clearTimeout(this.controlsTimeout);
		}
		this.controlsTimeout = setTimeout(() => {
			this.showControls = false;
			this.showServerDropdown = false;
		}, 3500);
	}

	toggleServerDropdown(event?: Event) {
		if (event) {
			event.stopPropagation();
		}
		this.showServerDropdown = !this.showServerDropdown;
	}

	/** Let the user manually flag media-unavailable (cross-origin iframes prevent auto-detection) */
	reportUnavailable(index: number) {
		this.serverStatus[index] = 'offline';
	}

	/** Search torrents for this episode */
	searchTorrents() {
		if (this.isSearchingTorrents) return;

		const name = this.serie?.original_name || this.serie?.name || '';
		const query = `${name} S${String(this.season).padStart(2,'0')}E${String(this.episode).padStart(2,'0')}`;

		this.isSearchingTorrents = true;
		this.showTorrentList = true;

		this.torrentSearchService.searchTVTorrents(name, this.season, this.episode)
			.subscribe({
				next: (results) => {
					this.torrents = results;
					this.isSearchingTorrents = false;
					this.torrentSearchDone = true;
					if (results.length > 0) this.selectTorrent(results[0]);
				},
				error: () => {
					this.isSearchingTorrents = false;
					this.torrentSearchDone = true;
					this.torrents = [];
				}
			});
	}

	selectTorrent(torrent: Torrent) {
		this.selectedTorrent = torrent;
		this.torrentMagnet = torrent.magnet;
		this.showTorrentList = false;
	}

	clearTorrent() {
		this.selectedTorrent = null;
		this.torrentMagnet = undefined;
		this.showTorrentList = false;
		this.torrentSearchDone = false;
		this.torrents = [];
	}

	downloadMagnet(magnet: string) {
		window.open(magnet, '_self');
	}

	/** Open EZTV search for the series name — covers all TV shows reliably */
	openEztvDownload() {
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
		this.serverStatus = this.servers.map(() => 'checking');
		this.servers.forEach((server, i) => {
			this.checkServerStatus(server.url).then(status => {
				this.zone.run(() => { 
					this.serverStatus[i] = status;
					this.setDefaultToFirstWorkingServer();
				});
			});
		});
	}

	private setDefaultToFirstWorkingServer() {
		const firstOnlineIndex = this.serverStatus.findIndex(status => status === 'online');
		if (firstOnlineIndex !== -1) {
			this.selectedServerIndex = firstOnlineIndex;
			this.updateLink();
		}
	}

	isCheckingServers(): boolean {
		return this.serverStatus.includes('checking');
	}

	ngOnChanges() {
		var id = document.getElementById('video-element');
	}

	changeEpisode(episodeNumber: number) {
		this.epiSelector = false;
		this.showSelector = false;
		this.episode = episodeNumber;
		window.history.pushState({}, '', '/serie/' + this.id + '/' + this.season + '/' + this.episode);
		this.updateLink();
		this.checkAllServers();
		this.showPlayerControls();
		// Fetch updated episode still for the new episode and save to recently watched
		this.moviedbAPIService.getEpisodeDetails(this.id, this.season, this.episode)
			.subscribe((epi: any) => {
				this.serie.seasonnb = this.season;
				this.serie.episodenb = this.episode;
				this.serie.current_still_path = epi?.still_path || null;
				this.getRecentlyWatched();
			});
	}

	createRange(number: number): number[] {
		return Array.from({ length: number }, (_, index) => index + 1);
	}

	changeSeason(event: any) {
		this.season = event.target.value;
	}

	ngOnInit(): void {
		this.moviedbAPIService.getSerieDetails(this.id).subscribe((response: any) => {
			this.serie = response;
			this.serie.seasonnb = this.season;
			this.serie.episodenb = this.episode;

			// Update dynamic TV show episode title, meta description, and Open Graph tags using centralized SeoService
			const serieName = this.serie?.name || this.serie?.original_name || "TV Show";
			const episodeTitle = `Watch ${serieName} - Season ${this.season} Episode ${this.episode} Free - Soulima`;
			const episodeDesc = `Stream ${serieName} Season ${this.season} Episode ${this.episode} in high quality for free on Soulima. Access multiple mirrors and magnet links.`;
			const episodeImg = this.serie?.backdrop_path ? `https://image.tmdb.org/t/p/w500${this.serie.backdrop_path}` : 'https://www.soulima.net/assets/soulima.png';
			const episodeUrl = `https://soulima.net/#/serie/${this.id}/${this.season}/${this.episode}`;

			this.seoService.updateMeta({
				title: episodeTitle,
				description: episodeDesc,
				keywords: `${serieName}, watch ${serieName}, ${serieName} season ${this.season}, ${serieName} episode ${this.episode}, Soulima tv shows`,
				image: episodeImg,
				url: episodeUrl,
				type: 'video.episode',
				schema: {
					"@context": "https://schema.org",
					"@type": "TVEpisode",
					"name": `${serieName} - Season ${this.season} Episode ${this.episode}`,
					"episodeNumber": this.episode,
					"partOfSeason": {
						"@type": "TVSeason",
						"seasonNumber": this.season
					},
					"partOfSeries": {
						"@type": "TVSeries",
						"name": serieName,
						"image": episodeImg
					},
					"image": episodeImg,
					"description": episodeDesc,
					"url": episodeUrl
				}
			});

			// Fetch episode still_path to use as thumbnail in recently watched
			this.moviedbAPIService.getEpisodeDetails(this.id, this.season, this.episode)
				.subscribe((epi: any) => {
					this.serie.current_still_path = epi?.still_path || null;
					const raw = localStorage.getItem('series');
					const Movies: any[] = raw ? JSON.parse(raw) : [];
					if (Movies.length) this.findElementAndSwitchEpi(Movies);
					this.getRecentlyWatched();
				});

			this.seasons = [];
			this.serie.seasons.forEach((element: any) => {
				if (element.episode_count != 0 && element.name != 'Specials')
					this.seasons.push(element);
			});

			// Pre-load episodes for the currently active season (from URL params)
			// so the episode list opens instantly without a loading delay.
			// Use a helper that does NOT mutate this.season.
			const activeSeasonData = this.seasons.find(
				(s: any) => s.season_number === this.season
			) || this.seasons[0];
			if (activeSeasonData) {
				this.preloadEpisodesForSeason(activeSeasonData);
			}
		});
		this.checkAllServers();
		this.showPlayerControls();
	}

	getRecentlyWatched() {
		const raw = localStorage.getItem('series');
		let seriesList: any[] = raw ? JSON.parse(raw) : [];
		// Strict deduplication by ID matching (converting both to numbers to avoid string/number mismatch)
		seriesList = seriesList.filter((s: any) => s && Number(s.id) !== Number(this.id));
		seriesList.unshift(this.serie);
		seriesList = seriesList.slice(0, 20);
		localStorage.setItem('series', JSON.stringify(seriesList));
	}

	findElementAndSwitchEpi(Movies: any) {
		const found = Movies.some((m: any) => m && Number(m.id) === Number(this.id));
		if (found) {
			this.serie.seasonnb = this.season;
			this.serie.episodenb = this.episode;
			this.getRecentlyWatched();
		}
	}

	getEpisodeDetails() {
		this.moviedbAPIService.getEpisodeDetails(1396, 1, 1).subscribe((response: any) => {});
	}

	getCurrentSeasonData() {
		return this.seasons.find(s => s.season_number === this.season);
	}

	hasPreviousEpisode(): boolean {
		if (this.episode > 1) {
			return true;
		}
		const seasonIndex = this.seasons.findIndex(s => s.season_number === this.season);
		return seasonIndex > 0;
	}

	hasNextEpisode(): boolean {
		const currentSeason = this.getCurrentSeasonData();
		if (!currentSeason) return false;
		
		if (this.episode < currentSeason.episode_count) {
			return true;
		}
		const seasonIndex = this.seasons.findIndex(s => s.season_number === this.season);
		return seasonIndex !== -1 && seasonIndex < this.seasons.length - 1;
	}

	async prevEpisode() {
		if (this.episode > 1) {
			this.changeEpisode(this.episode - 1);
		} else {
			const seasonIndex = this.seasons.findIndex(s => s.season_number === this.season);
			if (seasonIndex > 0) {
				const prevSeasonData = this.seasons[seasonIndex - 1];
				await this.choseSeason(seasonIndex - 1, false);
				this.changeEpisode(prevSeasonData.episode_count);
			}
		}
	}

	async nextEpisode() {
		const currentSeason = this.getCurrentSeasonData();
		if (!currentSeason) return;

		if (this.episode < currentSeason.episode_count) {
			this.changeEpisode(this.episode + 1);
		} else {
			const seasonIndex = this.seasons.findIndex(s => s.season_number === this.season);
			if (seasonIndex !== -1 && seasonIndex < this.seasons.length - 1) {
				await this.choseSeason(seasonIndex + 1, false);
				this.changeEpisode(1);
			}
		}
	}

	back() {
		this.epiSelector = false;
		this.showSelector = true;
	}

	toggleSelector() {
		// Close if any panel is open
		if (this.epiSelector || this.showSelector) {
			this.epiSelector = false;
			this.showSelector = false;
			return;
		}
		// Single-season: jump straight to the episode list
		if (this.seasons.length === 1) {
			if (this.episodes.length > 0) {
				this.epiSelector = true;
			} else {
				this.choseSeason(0, true);
			}
		} else {
			// Multi-season: always show the seasons picker first so user can choose
			this.showSelector = true;
		}
	}

	/** Fetch episodes for a given season object without mutating this.season.
	 *  Used for background pre-loading so the player's active season is never overwritten. */
	private async preloadEpisodesForSeason(seasonData: any) {
		const episodePromises: Promise<any>[] = [];
		for (let i = 0; i < seasonData.episode_count; i++) {
			episodePromises.push(
				this.moviedbAPIService.getEpisodeDetails(this.serie.id, seasonData.season_number, i + 1).toPromise()
			);
		}
		try {
			this.episodes = await Promise.all(episodePromises);
		} catch (error) {
			console.error('Error pre-loading episodes:', error);
		}
	}

	async choseSeason(seasonNb: number, activateSelector = true) {
		// Use the actual TMDB season_number so non-contiguous seasons work correctly
		const seasonData = this.seasons[seasonNb];
		if (!seasonData) return;
		this.season = seasonData.season_number;
		if (activateSelector) {
			this.epiSelector = true;
			this.showSelector = false;
		}
		const episodePromises = [];

		for (let i = 0; i < seasonData.episode_count; i++) {
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
