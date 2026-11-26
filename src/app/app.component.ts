import { Component, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SmartTvService } from './services/smart-tv.service';
import {
	trigger,
	transition,
	style,
	animate,
	query,
	group
} from '@angular/animations';

export const routeAnimations = trigger('routeAnimations', [
	transition('* <=> *', [
		query(':enter', [
			style({ opacity: 0, transform: 'translateY(18px)' })
		], { optional: true }),
		group([
			query(':leave', [
				animate('200ms ease-in', style({ opacity: 0, transform: 'translateY(-8px)' }))
			], { optional: true }),
			query(':enter', [
				animate('350ms 80ms cubic-bezier(0.25, 1, 0.5, 1)', style({ opacity: 1, transform: 'translateY(0)' }))
			], { optional: true }),
		])
	])
]);

@Component({
	selector: 'app-root',
	templateUrl: './app.component.html',
	styleUrls: ['./app.component.css'],
	animations: [routeAnimations]
})
export class AppComponent {
	getRouteAnimationData(outlet: RouterOutlet) {
		return outlet?.activatedRouteData?.['animation'];
	}
	title = 'soulima.net';
	noPopUp:boolean = true;

	showShareBanner = false;
	isDismissed = false;
	copied = false;

	constructor(public smartTv: SmartTvService) {}

	ngOnInit()
	{
		// Suppress social share banner immediately on Smart TVs
		if (this.smartTv.isSmartTv) {
			this.isDismissed = true;
		}

		const userAgent = navigator.userAgent;
		if (/android/i.test(userAgent))
			this.noPopUp = false;

		const oldDismissed = localStorage.getItem('soulima_share_dismissed') === 'true';
		const dismissedAt = localStorage.getItem('soulima_share_dismissed_at');
		const now = Date.now();
		const cooldown = 24 * 60 * 60 * 1000; // 24 hours cooldown

		if (oldDismissed && !dismissedAt) {
			// Seamlessly migrate old permanent dismiss to a 24h cooldown from now
			localStorage.setItem('soulima_share_dismissed_at', now.toString());
			localStorage.removeItem('soulima_share_dismissed');
			this.isDismissed = true;
		} else if (dismissedAt && (now - Number(dismissedAt) < cooldown)) {
			this.isDismissed = true;
		} else {
			// Delays the entrance of the floating share banner to 6 seconds after page loads
			setTimeout(() => {
				if (!this.isDismissed) {
					this.showShareBanner = true;
				}
			}, 6000);
		}
	}

	copyLink() {
		const link = 'https://soulima.net';
		if (navigator.clipboard) {
			navigator.clipboard.writeText(link).then(() => {
				this.triggerCopiedState();
			}).catch(err => {
				this.fallbackCopy(link);
			});
		} else {
			this.fallbackCopy(link);
		}
	}

	private fallbackCopy(text: string) {
		const el = document.createElement('textarea');
		el.value = text;
		document.body.appendChild(el);
		el.select();
		try {
			document.execCommand('copy');
			this.triggerCopiedState();
		} catch (err) {
			console.error('Fallback copy failed', err);
		}
		document.body.removeChild(el);
	}

	private triggerCopiedState() {
		this.copied = true;
		setTimeout(() => {
			this.copied = false;
			this.dismissBanner();
		}, 1500);
	}

	shareWebsite() {
		const title = 'Soulima.net';
		const text = 'Watch trending movies and TV series for free in high quality and completely ad-free on Soulima.net!';
		const url = 'https://soulima.net';

		if (navigator.share) {
			navigator.share({
				title,
				text,
				url
			}).then(() => {
				this.dismissBanner();
			}).catch(err => {
				console.log('Native share failed or cancelled', err);
			});
		} else {
			// Fallback: Open a direct mobile/desktop friendly WhatsApp share link
			const shareUrl = encodeURIComponent(url);
			const shareText = encodeURIComponent(text);
			window.open(`https://api.whatsapp.com/send?text=${shareText}%20${shareUrl}`, '_blank');
			this.dismissBanner();
		}
	}

	dismissBanner() {
		this.showShareBanner = false;
		localStorage.setItem('soulima_share_dismissed_at', Date.now().toString());
		// Wait for the slide-down animation to complete before removing from DOM
		setTimeout(() => {
			this.isDismissed = true;
		}, 600);
	}
}
