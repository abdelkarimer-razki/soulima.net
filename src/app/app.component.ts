import { Component } from '@angular/core';

@Component({
	selector: 'app-root',
	templateUrl: './app.component.html',
	styleUrls: ['./app.component.css']
})
export class AppComponent {
	title = 'soulima.net';
	noPopUp:boolean = true;

	ngOnInit()
	{
		const userAgent = navigator.userAgent;
		if (/android/i.test(userAgent))
			this.noPopUp = false;
	}

}
