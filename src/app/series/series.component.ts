import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { MoviedbAPIService } from '../services/moviedb-api.service';
import { SeoService } from '../services/seo.service';
import { WatchProgressService } from '../services/watch-progress.service';
import { TorrentService, TorrentSource } from '../services/torrent.service';
import { SubtitleService, SubtitleTrack } from '../services/subtitle.service';

@Component({
  selector: 'app-series',
  templateUrl: './series.component.html',
  styleUrls: ['./series.component.css']
})
export class SeriesComponent implements OnInit, OnDestroy {

	id: number = 0;
	season: number = 1;
	episode: number = 1;
	serie: any = null;
	showSelector = false;
	epiSelector = false;
	seasons: any[] = [];
	episodes: any[] = [];
	loading = true;

	torrentSources: TorrentSource[] = [];
	torrentSourcesLoading = false;
	subtitleTracks: SubtitleTrack[] = [];

	private routeSub?: Subscription;

	constructor(
		private route: ActivatedRoute,
		private router: Router,
		private moviedbAPIService: MoviedbAPIService,
		private seoService: SeoService,
		private watchProgress: WatchProgressService,
		private torrentService: TorrentService,
		private subtitleService: SubtitleService
	) {
		this.routeSub = this.route.params.subscribe(params => {
			const newId = Number(params['id']);
			const newEp = Number(params['episode']);
			const newSe = Number(params['season']);
			if (newId && (newId !== this.id || newEp !== this.episode || newSe !== this.season)) {
				this.id      = newId;
				this.episode = newEp || 1;
				this.season  = newSe || 1;
				this.fetchTorrentSources();
				this.fetchSubtitles();
				if (!this.serie || this.serie.id !== newId) {
					this.loadSerie();
				}
			} else if (newId) {
				this.id      = newId;
				this.episode = newEp || 1;
				this.season  = newSe || 1;
			}
		});
	}

	ngOnInit(): void {
		if (this.id) {
			this.loadSerie();
		}
	}

	ngOnDestroy(): void {
		this.routeSub?.unsubscribe();
	}

	loadSerie() {
		if (!this.id) return;
		this.loading = true;
		this.torrentSourcesLoading = true;

		this.moviedbAPIService.getSerieDetails(this.id).subscribe({
			next: (response: any) => {
				this.serie = response;
				this.loading = false;
				this.serie.seasonnb = this.season;
				this.serie.episodenb = this.episode;

				const serieName = this.serie?.name || this.serie?.original_name || 'TV Show';
				const episodeTitle = `Watch ${serieName} - Season ${this.season} Episode ${this.episode} Free - Soulima`;
				const episodeDesc = `Stream ${serieName} Season ${this.season} Episode ${this.episode} in high quality for free on Soulima. Access multiple sources and magnet links.`;
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
						'@context': 'https://schema.org',
						'@type': 'TVEpisode',
						'name': `${serieName} - Season ${this.season} Episode ${this.episode}`,
						'episodeNumber': this.episode,
						'partOfSeason': {
							'@type': 'TVSeason',
							'seasonNumber': this.season
						},
						'partOfSeries': {
							'@type': 'TVSeries',
							'name': serieName,
							'image': episodeImg
						},
						'image': episodeImg,
						'description': episodeDesc,
						'url': episodeUrl
					}
				});

				this.moviedbAPIService.getEpisodeDetails(this.id, this.season, this.episode)
					.subscribe((epi: any) => {
						this.serie.current_still_path = epi?.still_path || null;
						this.serie.current_episode_overview = epi?.overview || this.serie.overview || '';
						this.serie.current_episode_name = epi?.name || '';
						this.serie.current_episode_runtime = epi?.runtime || (this.serie?.episode_run_time?.[0]) || 0;
						this.getRecentlyWatched();
					});

				this.seasons = [];
				if (Array.isArray(this.serie.seasons)) {
					this.serie.seasons.forEach((element: any) => {
						if (element.episode_count !== 0 && element.name !== 'Specials') {
							this.seasons.push(element);
						}
					});
				}

				const activeSeasonData = this.seasons.find(
					(s: any) => s.season_number === this.season
				) || this.seasons[0];
				if (activeSeasonData) {
					this.preloadEpisodesForSeason(activeSeasonData);
				}
			},
			error: () => {
				this.loading = false;
			}
		});

		this.fetchTorrentSources();
		this.fetchSubtitles();
	}

	fetchSubtitles() {
		this.fetchSubtitlesWithRetry(0);
	}

	private fetchSubtitlesWithRetry(attempt: number) {
		const title = this.serie?.name || this.serie?.original_name || '';
		this.subtitleService.getSubtitles(this.id, this.season, this.episode, title)
			.then(tracks => {
				if (tracks && tracks.length) {
					this.subtitleTracks = tracks;
				} else if (attempt < 2) {
					setTimeout(() => this.fetchSubtitlesWithRetry(attempt + 1), 1500);
				} else {
					this.subtitleTracks = [];
				}
			})
			.catch(() => {
				if (attempt < 2) {
					setTimeout(() => this.fetchSubtitlesWithRetry(attempt + 1), 1500);
				} else {
					this.subtitleTracks = [];
				}
			});
	}

	fetchTorrentSources() {
		this.torrentSourcesLoading = true;
		this.fetchSourcesWithRetry(0);
	}

	private fetchSourcesWithRetry(attempt: number) {
		const title = this.serie?.name || this.serie?.original_name || '';
		this.torrentService.fetchSources(this.id, 'tv', this.season, this.episode, title)
			.then(sources => {
				if (sources && sources.length) {
					this.torrentSources = sources;
					this.torrentSourcesLoading = false;
					this.prefetchNextEpisode();
				} else if (attempt < 2) {
					setTimeout(() => this.fetchSourcesWithRetry(attempt + 1), 1500);
				} else {
					this.torrentSources = [];
					this.torrentSourcesLoading = false;
				}
			})
			.catch(() => {
				if (attempt < 2) {
					setTimeout(() => this.fetchSourcesWithRetry(attempt + 1), 1500);
				} else {
					this.torrentSourcesLoading = false;
				}
			});
	}

	prefetchNextEpisode() {
		const currentSeason = this.getCurrentSeasonData();
		if (!currentSeason) return;
		let nextS = this.season;
		let nextE = this.episode + 1;
		if (nextE > currentSeason.episode_count) {
			const sIdx = this.seasons.findIndex(s => s.season_number === this.season);
			if (sIdx !== -1 && sIdx < this.seasons.length - 1) {
				nextS = this.seasons[sIdx + 1].season_number;
				nextE = 1;
			} else {
				return;
			}
		}

		const title = this.serie?.name || this.serie?.original_name || '';
		this.subtitleService.prefetchSubtitles(this.id, nextS, nextE);
		this.torrentService.fetchSources(this.id, 'tv', nextS, nextE, title).then(sources => {
			if (sources && sources.length) {
				const best = sources[0];
				if (best?.magnet) {
					this.torrentService.prefetchStream(best.magnet, nextS, nextE);
				}
			}
		}).catch(() => {});
	}

	onUnplayable() {
		const title = this.serie?.name || this.serie?.original_name || '';
		this.fetchSourcesWithRetry(0);
		this.fetchSubtitlesWithRetry(0);
	}

	changeEpisode(episodeNumber: number) {
		this.epiSelector = false;
		this.showSelector = false;
		if (this.episode === episodeNumber) return;
		this.episode = episodeNumber;
		this.torrentSources = [];
		this.subtitleTracks = [];
		this.router.navigate(['/serie', this.id, this.season, this.episode]);
		this.fetchTorrentSources();
		this.fetchSubtitles();
		this.moviedbAPIService.getEpisodeDetails(this.id, this.season, this.episode)
			.subscribe((epi: any) => {
				if (this.serie) {
					this.serie.seasonnb = this.season;
					this.serie.episodenb = this.episode;
					this.serie.current_still_path = epi?.still_path || null;
					this.serie.current_episode_overview = epi?.overview || this.serie.overview || '';
					this.serie.current_episode_name = epi?.name || '';
					this.serie.current_episode_runtime = epi?.runtime || (this.serie?.episode_run_time?.[0]) || 0;
					this.getRecentlyWatched();
				}
			});
	}

	getRecentlyWatched() {
		if (!this.serie?.id) return;
		const list = this.watchProgress.getHistory().filter(s => Number(s.id) !== Number(this.id));
		list.unshift({
			id: this.serie.id,
			name: this.serie.name || this.serie.original_name || '',
			poster_path: this.serie.poster_path || null,
			backdrop_path: this.serie.backdrop_path || null,
			seasonnb: this.season,
			episodenb: this.episode,
			current_still_path: this.serie.current_still_path || null,
			progress: 0,
			updated_at: Date.now(),
		});
		this.watchProgress.replaceAll(list);
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

	private async preloadEpisodesForSeason(seasonData: any) {
		const episodeCount = seasonData.episode_count || 0;
		// Cap concurrent API calls to 20 to avoid rate-limiting / memory spikes
		const CHUNK = 20;
		const results: any[] = [];
		for (let start = 0; start < episodeCount; start += CHUNK) {
			const end = Math.min(start + CHUNK, episodeCount);
			const chunk = [];
			for (let i = start; i < end; i++) {
				chunk.push(
					this.moviedbAPIService.getEpisodeDetails(this.serie.id, seasonData.season_number, i + 1).toPromise()
				);
			}
			try {
				const batch = await Promise.all(chunk);
				results.push(...batch);
			} catch (error) {
				console.error('Error pre-loading episodes:', error);
			}
		}
		this.episodes = results;
	}

	async choseSeason(seasonNb: number, activateSelector = true) {
		const seasonData = this.seasons[seasonNb];
		if (!seasonData) return;
		this.season = seasonData.season_number;
		this.torrentSources = [];
		this.subtitleTracks = [];
		if (activateSelector) {
			this.epiSelector = true;
			this.showSelector = false;
		}
		// Cap concurrent episode API calls to 20 to avoid rate-limiting
		const CHUNK = 20;
		const count = seasonData.episode_count || 0;
		this.episodes = [];
		for (let start = 0; start < count; start += CHUNK) {
			const end = Math.min(start + CHUNK, count);
			const chunk = [];
			for (let i = start; i < end; i++) {
				chunk.push(
					this.moviedbAPIService.getEpisodeDetails(this.serie.id, this.season, i + 1).toPromise()
				);
			}
			try {
				const batch = await Promise.all(chunk);
				this.episodes.push(...batch);
			} catch (error) {
				console.error('Error fetching episodes:', error);
			}
		}
	}
}
