import { Component, OnInit, OnDestroy, HostListener } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { MoviedbAPIService } from '../services/moviedb-api.service';
import { DomSanitizer, SafeResourceUrl, Title, Meta } from '@angular/platform-browser';
import { SeoService } from '../services/seo.service';
import { ServerConfigService, ServerEntry, ServerHealth } from '../services/server-config.service';
import { WatchProgressService } from '../services/watch-progress.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-series',
  templateUrl: './series.component.html',
  styleUrls: ['./series.component.css']
})
export class SeriesComponent implements OnInit, OnDestroy {

	id: number = 0;
	season: number = 1;
	episode: number = 1;
	serie: any = '';
	showSelector = false;
	epiSelector = false;
	servers: ServerEntry[] = [];
	selectedServerIndex = 0;
	loading = true;
	showControls = true;
	showServerDropdown = false;
	discovering = false;
	private controlsTimeout: any = null;

	/** 'checking' | 'online' | 'offline' for each server */
	serverStatus: ServerHealth[] = [];

	private heartbeatTimer: any = null;
	private videoConfirmed = false;
	private subs: Subscription[] = [];

	seasons: any[] = [];
	episodes: any[] = [];
	link: SafeResourceUrl = '';
	iframeOriginalUrl: string = '';

	/** watch-progress tracking */
	savedProgress = 0;
	private watchTimer: any = null;
	private elapsedSeconds = 0;
	private progressSavedAt = 0;

	constructor(
		private route: ActivatedRoute,
		private moviedbAPIService: MoviedbAPIService,
		private sanitizer: DomSanitizer,
		private titleService: Title,
		private metaService: Meta,
		private seoService: SeoService,
		private serverConfig: ServerConfigService,
		private watchProgress: WatchProgressService
	) {
		this.route.params.subscribe(params => {
			this.id      = Number(params['id']);
			this.episode = Number(params['episode']);
			this.season  = Number(params['season']);
			this.updateLink();
		});
	}

	ngOnDestroy() {
		this.saveProgress();
		this.stopWatchTimer();
		this.clearHeartbeat();
		this.subs.forEach(s => s.unsubscribe());
	}

	private subscribeToServers() {
		this.subs.push(
			this.serverConfig.servers$.subscribe(s => {
				this.servers = s;
				this.serverStatus = this.serverConfig.getStatus();
			}),
			this.serverConfig.status$.subscribe(s => {
				this.serverStatus = s;
				this.syncSelectedToOnline();
			}),
			this.serverConfig.selectedIndex$.subscribe(i => {
				const changed = i !== this.selectedServerIndex;
				this.selectedServerIndex = i;
				if (changed) this.updateLink();
			}),
			this.serverConfig.discovering$.subscribe(d => {
				this.discovering = d;
			})
		);
	}

	@HostListener('window:beforeunload')
	onBeforeUnload() {
		this.saveProgress();
	}

	private startWatchTimer() {
		this.stopWatchTimer();
		this.elapsedSeconds = 0;
		this.progressSavedAt = 0;
		this.watchTimer = setInterval(() => {
			this.elapsedSeconds++;
		}, 1000);
	}

	private stopWatchTimer() {
		if (this.watchTimer) {
			clearInterval(this.watchTimer);
			this.watchTimer = null;
		}
	}

	private saveProgress() {
		if (!this.serie?.id) return;
		const total = this.progressSavedAt + this.elapsedSeconds;
		if (total <= 0) return;
		this.watchProgress.save({
			id: this.serie.id,
			name: this.serie.name || this.serie.original_name || '',
			poster_path: this.serie.poster_path || null,
			backdrop_path: this.serie.backdrop_path || null,
			seasonnb: this.season,
			episodenb: this.episode,
			current_still_path: this.serie.current_still_path || null,
			progress: total,
		});
		this.progressSavedAt = total;
		this.elapsedSeconds = 0;
	}

	formatProgress(seconds: number): string {
		return this.watchProgress.formatTime(seconds);
	}

	getEpisodeProgress(episodeNumber: number): number {
		const saved = this.watchProgress.get(this.id);
		if (saved && saved.seasonnb === this.season && saved.episodenb === episodeNumber && saved.progress > 10) {
			return saved.progress;
		}
		return 0;
	}

	resumeFromSaved() {
		const saved = this.watchProgress.get(this.id);
		if (saved && saved.progress > 0) {
			this.updateLinkWithTime(saved.progress);
		}
	}

	updateLink() {
		const saved = this.watchProgress.get(this.id);
		const time = (saved?.seasonnb === this.season && saved?.episodenb === this.episode) ? saved.progress : 0;
		this.savedProgress = time;
		let constructedUrl = this.serverConfig.buildEmbedUrl(this.selectedServerIndex, 'tv', this.id, this.season, this.episode);
		constructedUrl = this.serverConfig.withResumeTime(constructedUrl, time);
		this.link = this.sanitizer.bypassSecurityTrustResourceUrl(constructedUrl);
		this.iframeOriginalUrl = constructedUrl;
		this.resetHeartbeat();
	}

	updateLinkWithTime(time: number) {
		this.elapsedSeconds = 0;
		this.progressSavedAt = time;
		let constructedUrl = this.serverConfig.buildEmbedUrl(this.selectedServerIndex, 'tv', this.id, this.season, this.episode);
		constructedUrl = this.serverConfig.withResumeTime(constructedUrl, time);
		this.link = this.sanitizer.bypassSecurityTrustResourceUrl(constructedUrl);
		this.iframeOriginalUrl = constructedUrl;
		this.resetHeartbeat();
	}

	selectServer(index: number) {
		this.serverConfig.select(index);
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
		this.resetHeartbeat();
	}

	toggleServerDropdown(event?: Event) {
		if (event) {
			event.stopPropagation();
		}
		this.showServerDropdown = !this.showServerDropdown;
	}

	/** Let the user manually flag media-unavailable (cross-origin iframes prevent auto-detection) */
	reportUnavailable(index: number) {
		this.serverConfig.reportUnavailable(index);
	}

	discoverServers() {
		this.serverConfig.discoverNow();
	}

	/** Called when the iframe fails to load — marks server offline, no auto-switch */
	onIframeError() {
		this.clearHeartbeat();
		this.serverConfig.markOffline(this.selectedServerIndex);
	}

	/** Listen for postMessage from embed iframes (some providers send play/error events) */
	@HostListener('window:message', ['$event'])
	onMessage(event: MessageEvent) {
		const embedOrigins = this.servers.map(s => {
			try { return new URL(s.url).origin; } catch { return ''; }
		}).filter(Boolean);
		if (!embedOrigins.includes(event.origin)) return;

		const data = event.data;
		if (!data) return;

		const type = data.type || data.event || data.action || '';
		const state = data.state || data.status || '';
		const isPlaying = /playing|play|start|buffering/i.test(type) || /playing|play/i.test(state);
		const isError = /error|fail|unavailable|notfound/i.test(type) || /error|fail/i.test(state);

		if (isPlaying) {
			this.videoConfirmed = true;
			this.clearHeartbeat();
			this.serverConfig.confirmPlayable(this.selectedServerIndex);
		} else if (isError) {
			this.onIframeError();
		}
	}

	/** Start heartbeat: if no play signal within 5min, assume failure and try next server */
	private resetHeartbeat() {
		this.clearHeartbeat();
		this.heartbeatTimer = setTimeout(() => {
			if (!this.videoConfirmed) {
				this.onIframeError();
			}
		}, 300000);
	}

	private clearHeartbeat() {
		if (this.heartbeatTimer) {
			clearTimeout(this.heartbeatTimer);
			this.heartbeatTimer = null;
		}
	}

	isCheckingServers(): boolean {
		return this.serverConfig.isChecking();
	}

	hasOnlineServer(): boolean {
		return this.serverConfig.hasOnline();
	}

	private syncSelectedToOnline() {
		if (this.serverStatus[this.selectedServerIndex] === 'online') return;
		const next = this.serverConfig.firstOnlineUntried();
		if (next !== -1) {
			this.serverConfig.select(next);
		}
	}

	changeEpisode(episodeNumber: number) {
		this.saveProgress();
		this.epiSelector = false;
		this.showSelector = false;
		this.episode = episodeNumber;
		window.history.pushState({}, '', '/serie/' + this.id + '/' + this.season + '/' + this.episode);
		this.updateLink();
		this.serverConfig.refresh();
		this.showPlayerControls();
		this.startWatchTimer();
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
		this.serverConfig.init();
		this.subscribeToServers();

		this.moviedbAPIService.getSerieDetails(this.id).subscribe((response: any) => {
			this.serie = response;
			this.loading = false;
			this.serie.seasonnb = this.season;
			this.serie.episodenb = this.episode;

			const serieName = this.serie?.name || this.serie?.original_name || "TV Show";
			const episodeTitle = `Watch ${serieName} - Season ${this.season} Episode ${this.episode} Free - Soulima`;
			const episodeDesc = `Stream ${serieName} Season ${this.season} Episode ${this.episode} in high quality for free on Soulima. Access multiple server mirrors.`;
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

			this.moviedbAPIService.getEpisodeDetails(this.id, this.season, this.episode)
				.subscribe((epi: any) => {
					this.serie.current_still_path = epi?.still_path || null;
					const Movies = this.watchProgress.getHistory();
					if (Movies.length) this.findElementAndSwitchEpi(Movies);
					this.getRecentlyWatched();
					this.startWatchTimer();
				});

			this.seasons = [];
			this.serie.seasons.forEach((element: any) => {
				if (element.episode_count != 0 && element.name != 'Specials')
					this.seasons.push(element);
			});

			const activeSeasonData = this.seasons.find(
				(s: any) => s.season_number === this.season
			) || this.seasons[0];
			if (activeSeasonData) {
				this.preloadEpisodesForSeason(activeSeasonData);
			}
		});
		this.showPlayerControls();
	}

	getRecentlyWatched() {
		const total = this.progressSavedAt + this.elapsedSeconds;
		const list = this.watchProgress.getHistory().filter(s => Number(s.id) !== Number(this.id));
		list.unshift({
			id: this.serie.id,
			name: this.serie.name || this.serie.original_name || '',
			poster_path: this.serie.poster_path || null,
			backdrop_path: this.serie.backdrop_path || null,
			seasonnb: this.season,
			episodenb: this.episode,
			current_still_path: this.serie.current_still_path || null,
			progress: total,
			updated_at: Date.now(),
		});
		this.watchProgress.replaceAll(list);
	}

	findElementAndSwitchEpi(Movies: any[]) {
		const found = Movies.some(m => m && Number(m.id) === Number(this.id));
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
		if (this.epiSelector || this.showSelector) {
			this.epiSelector = false;
			this.showSelector = false;
			return;
		}
		if (this.seasons.length === 1) {
			if (this.episodes.length > 0) {
				this.epiSelector = true;
			} else {
				this.choseSeason(0, true);
			}
		} else {
			this.showSelector = true;
		}
	}

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
