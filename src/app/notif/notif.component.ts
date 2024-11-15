import { Component } from '@angular/core';

@Component({
  selector: 'app-notif',
  templateUrl: './notif.component.html',
  styleUrls: ['./notif.component.css']
})
export class NotifComponent {
	popUp = true

	closePopUp()
	{
		this.popUp = false
	}

	stopClose(event:MouseEvent)
	{
	event.stopPropagation();
	}

	downloadImage() {
		const imageUrl = 'assets/apk/soulima.apk'; // Path to the image in the assets folder
	
		// Create an anchor element dynamically
		const link = document.createElement('a');
		
		// Set the download attribute with the desired filename
		link.download = 'soulima.apk'; // The name the file will have when downloaded
		
		// Set the href to the image URL
		link.href = imageUrl;
	
		// Trigger a click event to download the image
		link.click();
	  }
}
