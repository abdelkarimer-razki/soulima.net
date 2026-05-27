import { Component } from '@angular/core';

@Component({
	selector: 'app-root',
	templateUrl: './app.component.html',
	styleUrls: ['./app.component.css']
})
export class AppComponent {
	title = 'soulima.net';
	noPopUp:boolean = true;

	showShareBanner = false;
	isDismissed = false;
	copied = false;

	ngOnInit()
	{
		const userAgent = navigator.userAgent;
		if (/android/i.test(userAgent))
			this.noPopUp = false;

		// Check if the user has already permanently dismissed the share banner
		if (localStorage.getItem('soulima_share_dismissed') === 'true') {
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
		}, 2000);
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
			}).catch(err => {
				console.log('Native share failed or cancelled', err);
			});
		} else {
			// Fallback: Open a direct mobile/desktop friendly WhatsApp share link
			const shareUrl = encodeURIComponent(url);
			const shareText = encodeURIComponent(text);
			window.open(`https://api.whatsapp.com/send?text=${shareText}%20${shareUrl}`, '_blank');
		}
	}

	dismissBanner() {
		this.showShareBanner = false;
		localStorage.setItem('soulima_share_dismissed', 'true');
		// Wait for the slide-down animation to complete before removing from DOM
		setTimeout(() => {
			this.isDismissed = true;
		}, 600);
	}
}
