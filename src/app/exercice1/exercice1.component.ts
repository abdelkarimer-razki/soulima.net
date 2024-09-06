import { Component,OnInit } from '@angular/core';

@Component({
	selector: 'app-exercice1',
	templateUrl: './exercice1.component.html',
	styleUrls: ['./exercice1.component.css']
})
export class Exercice1Component {
	price:any = "";
	name:string = "";
	total:any = 0;
	payment:boolean = false;
	priceToPay:any = "";
	isEnough:boolean = false;
	isName:boolean = false;
	prices:any = [];
	tens:any = 0;
	fives:any = 0;
	done:boolean = false;
	ones:any = 0;
	ngOnInit(): void {}
	insertPrices()
	{
		this.prices.push(this.price);
		this.price = "";
		for(let i = 0; i < this.prices.length; i++)
		{
		this.total += parseInt(this.prices[i]);
		}
	}
	insertClientName()
	{
		if (this.name != "")
		this.isName = true;
	}
	pay()
	{
		if (this.priceToPay <= this.total)
			this.isEnough = true;
		else
		{
			this.isEnough = false;
			this.done = true;
			var rest = this.priceToPay - this.total;
			this.tens = Math.floor(rest / 10);
			rest = rest % 10;
			this.fives = Math.floor(rest / 5);
			rest = rest % 5;
			this.ones = rest;
		}
	}
	goToPayment()
	{
		this.payment = true;
		console.log(this.payment);
	}
}
