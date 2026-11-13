import { Component } from '@angular/core';
import { Router } from '@angular/router';


@Component({
  selector: 'app-helloworld',
  templateUrl: './helloworld.component.html',
  styleUrls: ['./helloworld.component.css']
})
export class HelloworldComponent {

  constructor(private router:Router){}
  ngOnInit(): void {
    this.router.navigate(['/']);
  }
}
