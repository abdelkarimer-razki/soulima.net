import { Component, OnInit, OnDestroy, NgZone, HostListener } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { MoviedbAPIService } from '../services/moviedb-api.service';
import { DomSanitizer, SafeResourceUrl, Title, Meta } from '@angular/platform-browser';
import { SeoService } from '../services/seo.service';
import { ServerConfigService, ServerEntry } from '../services/server-config.service';
import { WatchProgressService } from '../services/watch-progress.service';
import { TorrentService, TorrentSource } from '../services/torrent.service';
import { SubtitleService, SubtitleTrack } from '../services/subtitle.service';

@Component({
  selector: 'app-series',
  templateUrl: './series.component.html',
  styleUrls: ['./series.component.css']
})
export class SeriesComponent implements OnDestroy {

	id: number = 0;
	season: number = 1;
	episode: number = 1;
	serie: any = '';
	showSelector = false;
	epiSelector = false;
	servers: ServerEntry[] = [
		{ name: 'Server 1 (Vidsrc.to)',     url: 'https://vidsrc.to/embed',                 format: 'standard' },
		{ name: 'Server 2 (Vidlink.pro)',   url: 'https://vidlink.pro',                     format: 'standard' },
		{ name: 'Server 3 (Embed.su)',      url: 'https://embed.su/embed',                  format: 'standard' },
		{ name: 'Server 4 (SmashyStream)',  url: 'https://player.smashy.stream',            format: 'smashy' },
		{ name: 'Server 5 (Multiembed)',    url: 'https://multiembed.mov',                  format: 'multiembed' },
		{ name: 'Server 6 (Autoembed)',     url: 'https://autoembed.cc/embed',              format: 'standard' },
		{ name: 'Server 7 (2embed.cc)',     url: 'https://2embed.cc/embed',                 format: 'standard' },
		{ name: 'Server 8 (Vidsrc.pro)',    url: 'https://vidsrc.pro/embed',                format: 'standard' },
		{ name: 'Server 9 (Vidsrc.me)',     url: 'https://vidsrc.me/embed',                 format: 'standard' },
		{ name: 'Server 10 (Moviedata)',    url: 'https://moviedata.info/embed',            format: 'standard' },
		{ name: 'Server 11 (Vidbinge)',     url: 'https://vidbinge.dev/embed',              format: 'standard' },
		{ name: 'Server 12 (SuperEmbed)',   url: 'https://superembed.stream',               format: 'standard' },
		{ name: 'Server 13 (MoviesAPI)',    url: 'https://moviesapi.club',                  format: 'standard' },
		{ name: 'Server 14 (Cineby)',       url: 'https://cineby.app',                      format: 'standard' },
		{ name: 'Server 15 (Gomoplayer)',   url: 'https://gomo.to',                        format: 'standard' },
		{ name: 'Server 16 (Rive)',         url: 'https://rive.zone',                       format: 'standard' },
		{ name: 'Server 17 (Moviesapi.net)', url: 'https://moviesapi.net',                  format: 'standard' },
		{ name: 'Server 18 (Vidflix)',      url: 'https://vidflix.net',                     format: 'standard' },
		{ name: 'Server 19 (Filmsss)',      url: 'https://filmsss.com',                     format: 'standard' },
		{ name: 'Server 20 (Cinezone)',     url: 'https://cinezone.net',                    format: 'standard' },
	];
	selectedServerIndex = 0;
	loading = true;
	showControls = true;
	showServerDropdown = false;
	private controlsTimeout: any = null;

	/** 'checking' | 'online' | 'offline' for each server */
	serverStatus: string[] = this.servers.map(() => 'checking');

	/** Tracks which servers were already tried this session */
	private triedServers = new Set<number>();

	private readonly SERVER_CACHE_KEY = 'soulima_server_status';
	private readonly RELIABILITY_KEY = 'soulima_server_reliability';
	private readonly FAILURE_THRESHOLD = 0.7;
	private heartbeatTimer: any = null;
	private videoConfirmed = false;

	seasons: any[] = [];
	episodes: any[] = [];
	link: SafeResourceUrl = '';
	iframeOriginalUrl: string = '';

	/** watch-progress tracking */
	savedProgress = 0;
	private watchTimer: any = null;
	private elapsedSeconds = 0;
	private progressSavedAt = 0;

	playerMode: 'server' | 'torrent' = 'torrent';
	torrentSources: TorrentSource[] = [];
	torrentSourcesLoading = false;
	subtitleTracks: SubtitleTrack[] = [];

	constructor(
		private route: ActivatedRoute,
		private moviedbAPIService: MoviedbAPIService,
		private sanitizer: DomSanitizer,
		private zone: NgZone,
		private titleService: Title,
		private metaService: Meta,
		private seoService: SeoService,
		private serverConfig: ServerConfigService,
		private watchProgress: WatchProgressService,
		private torrentService: TorrentService,
		private subtitleService: SubtitleService
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

	switchMode(mode: 'server' | 'torrent') {
		this.playerMode = 'torrent';
		this.fetchTorrentSources();
	}

	onTorrentUnplayable() {}

	fetchTorrentSources() {
		this.torrentSourcesLoading = true;
		this.torrentService.fetchSources(this.id, 'tv', this.season, this.episode).then(sources => {
			this.torrentSources = sources;
			this.torrentSourcesLoading = false;
		});
	}

	fetchSubtitles() {
		this.subtitleService.getSubtitles(this.id, this.season, this.episode).then(tracks => {
			this.subtitleTracks = tracks;
		});
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
		const server = this.servers[this.selectedServerIndex];
		let constructedUrl = '';
		if (server.format === 'smashy') {
			constructedUrl = `${server.url}/tv/${this.id}?s=${this.season}&e=${this.episode}`;
		} else if (server.format === 'multiembed') {
			constructedUrl = `${server.url}/?video_id=${this.id}&tmdb=1&s=${this.season}&e=${this.episode}`;
		} else {
			constructedUrl = `${server.url}/tv/${this.id}/${this.season}/${this.episode}?player=new&ds_lang=ar`;
		}
		if (time > 5) {
			constructedUrl += `&t=${Math.floor(time)}`;
		}
		this.link = this.sanitizer.bypassSecurityTrustResourceUrl(constructedUrl);
		this.iframeOriginalUrl = constructedUrl;
		this.triedServers.add(this.selectedServerIndex);
		this.resetHeartbeat();
	}

	updateLinkWithTime(time: number) {
		this.elapsedSeconds = 0;
		this.progressSavedAt = time;
		const server = this.servers[this.selectedServerIndex];
		let constructedUrl = '';
		if (server.format === 'smashy') {
			constructedUrl = `${server.url}/tv/${this.id}?s=${this.season}&e=${this.episode}`;
		} else if (server.format === 'multiembed') {
			constructedUrl = `${server.url}/?video_id=${this.id}&tmdb=1&s=${this.season}&e=${this.episode}`;
		} else {
			constructedUrl = `${server.url}/tv/${this.id}/${this.season}/${this.episode}?player=new&ds_lang=ar`;
		}
		if (time > 5) {
			constructedUrl += `&t=${Math.floor(time)}`;
		}
		this.link = this.sanitizer.bypassSecurityTrustResourceUrl(constructedUrl);
		this.iframeOriginalUrl = constructedUrl;
		this.triedServers.add(this.selectedServerIndex);
		this.resetHeartbeat();
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
		this.serverStatus[index] = 'offline';
		this.updateReliability(index, false);
		this.saveServerCache();
		const nextIndex = this.serverStatus.findIndex(
			(s, i) => s === 'online' && !this.triedServers.has(i)
		);
		if (nextIndex !== -1) {
			this.selectServer(nextIndex);
		} else {
			this.triedServers.clear();
			this.checkAllServers();
		}
	}

	/** Called when the iframe fails to load — marks server offline, no auto-switch */
	onIframeError() {
		this.clearHeartbeat();
		this.serverStatus[this.selectedServerIndex] = 'offline';
		this.updateReliability(this.selectedServerIndex, false);
		this.saveServerCache();
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
		} else if (isError) {
			this.onIframeError();
		}
	}

	/** Start heartbeat: if no play signal within 25s, assume failure and try next server */
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

	private buildCheckUrl(server: ServerEntry): string {
		if (server.format === 'smashy') {
			return `${server.url}/tv/${this.id}?s=${this.season}&e=${this.episode}`;
		} else if (server.format === 'multiembed') {
			return `${server.url}/?video_id=${this.id}&tmdb=1&s=${this.season}&e=${this.episode}`;
		}
		return `${server.url}/tv/${this.id}/${this.season}/${this.episode}`;
	}

	private async checkServerStatus(server: ServerEntry): Promise<string> {
		const checkUrl = this.buildCheckUrl(server);
		const timeout = 2500;

		try {
			return await this.serverConfig.checkServer(checkUrl, timeout);
		} catch {
			return 'offline';
		}
	}

	private isServerUnreliable(index: number): boolean {
		const reliability = this.loadReliability();
		const r = reliability[index];
		if (!r || r.attempts < 3) return false;
		return r.failures / r.attempts > this.FAILURE_THRESHOLD;
	}

	private checkAllServers() {
		const cached = this.loadServerCache();
		if (cached) {
			this.serverStatus = cached;
			this.setDefaultToFirstWorkingServer();
			this.recheckServersInBackground();
		} else {
			this.serverStatus = this.servers.map(() => 'checking');
			const ranked = this.getServerCheckQueue();
			if (ranked.length === 0) {
				this.serverStatus = this.servers.map(() => 'offline');
				return;
			}
			ranked.forEach(({ server, index }) => {
				this.checkServerStatus(server).then(status => {
					this.zone.run(() => { 
						this.serverStatus[index] = status;
						this.setDefaultToFirstWorkingServer();
						this.saveServerCache();
						if (status === 'online') this.updateReliability(index, true);
					});
				});
			});
		}
	}

	private getServerCheckQueue(): { server: ServerEntry; index: number }[] {
		const reliability = this.loadReliability();
		return this.servers
			.map((s, i) => ({ server: s, index: i }))
			.filter(({ index }) => !this.isServerUnreliable(index))
			.sort((a, b) => {
				const ra = reliability[a.index];
				const rb = reliability[b.index];
				const scoreA = ra ? (ra.attempts - ra.failures) / ra.attempts : 0.5;
				const scoreB = rb ? (rb.attempts - rb.failures) / rb.attempts : 0.5;
				return scoreB - scoreA;
			});
	}

	private recheckServersInBackground() {
		this.servers.forEach((server, i) => {
			this.checkServerStatus(server).then(status => {
				this.zone.run(() => {
					this.serverStatus[i] = status;
					this.saveServerCache();
				});
			});
		});
	}

	private setDefaultToFirstWorkingServer() {
		const firstOnlineIndex = this.serverStatus.findIndex(status => status === 'online');
		if (firstOnlineIndex !== -1 && !this.triedServers.has(firstOnlineIndex)) {
			this.selectedServerIndex = firstOnlineIndex;
			this.updateLink();
		} else if (firstOnlineIndex !== -1 && this.triedServers.has(firstOnlineIndex)) {
			const untriedOnline = this.serverStatus.findIndex(
				(s, i) => s === 'online' && !this.triedServers.has(i)
			);
			if (untriedOnline !== -1) {
				this.selectedServerIndex = untriedOnline;
				this.updateLink();
			}
		}
	}

	isCheckingServers(): boolean {
		return this.serverStatus.includes('checking');
	}

	hasOnlineServer(): boolean {
		return this.serverStatus.includes('online');
	}

	private loadServerCache(): string[] | null {
		try {
			const raw = localStorage.getItem(this.SERVER_CACHE_KEY);
			if (raw) {
				const parsed = JSON.parse(raw);
				if (parsed.timestamp && Date.now() - parsed.timestamp < 300000) {
					return parsed.status;
				}
			}
		} catch {}
		return null;
	}

	private saveServerCache() {
		try {
			localStorage.setItem(this.SERVER_CACHE_KEY, JSON.stringify({
				status: this.serverStatus,
				timestamp: Date.now()
			}));
		} catch {}
	}

	private loadReliability(): Record<number, { attempts: number; failures: number }> {
		try {
			const raw = localStorage.getItem(this.RELIABILITY_KEY);
			return raw ? JSON.parse(raw) : {};
		} catch {
			return {};
		}
	}

	private saveReliability(data: Record<number, { attempts: number; failures: number }>) {
		try {
			localStorage.setItem(this.RELIABILITY_KEY, JSON.stringify(data));
		} catch {}
	}

	private updateReliability(serverIndex: number, success: boolean) {
		const data = this.loadReliability();
		if (!data[serverIndex]) {
			data[serverIndex] = { attempts: 0, failures: 0 };
		}
		data[serverIndex].attempts++;
		if (!success) data[serverIndex].failures++;
		this.saveReliability(data);
	}

	changeEpisode(episodeNumber: number) {
		this.saveProgress();
		this.epiSelector = false;
		this.showSelector = false;
		this.episode = episodeNumber;
		window.history.pushState({}, '', '/serie/' + this.id + '/' + this.season + '/' + this.episode);
		this.updateLink();
		this.showPlayerControls();
		this.startWatchTimer();
		this.fetchTorrentSources();
		this.fetchSubtitles();
		this.moviedbAPIService.getEpisodeDetails(this.id, this.season, this.episode)
			.subscribe((epi: any) => {
				this.serie.seasonnb = this.season;
				this.serie.episodenb = this.episode;
				this.serie.current_still_path = epi?.still_path || null;
				this.serie.current_episode_overview = epi?.overview || this.serie.overview || '';
				this.serie.current_episode_name = epi?.name || '';
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
		this.serverConfig.getServers().then(remote => {
			if (remote && remote.length >= this.servers.length) {
				this.servers = remote;
				this.serverStatus = this.servers.map(() => 'checking');
			}
		});

		this.moviedbAPIService.getSerieDetails(this.id).subscribe((response: any) => {
			this.serie = response;
			this.loading = false;
			this.serie.seasonnb = this.season;
			this.serie.episodenb = this.episode;

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

			this.moviedbAPIService.getEpisodeDetails(this.id, this.season, this.episode)
				.subscribe((epi: any) => {
					this.serie.current_still_path = epi?.still_path || null;
					this.serie.current_episode_overview = epi?.overview || this.serie.overview || '';
					this.serie.current_episode_name = epi?.name || '';
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
		this.checkAllServers();
		this.showPlayerControls();
		this.fetchTorrentSources();
		this.fetchSubtitles();
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
