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
}
