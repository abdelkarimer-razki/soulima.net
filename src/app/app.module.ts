import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { Exercice2Component } from './exercice2/exercice2.component';
import { FormsModule } from '@angular/forms';
import { RouterModule, Routes } from '@angular/router';
import {HttpClientModule } from '@angular/common/http';
import { MovieComponent } from './movie/movie.component';
import { TopMenuComponent } from './top-menu/top-menu.component';
import { SeriesComponent } from './series/series.component';
import { LocationStrategy,HashLocationStrategy } from '@angular/common';
import { PathLocationStrategy } from '@angular/common';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { TvshowsComponent } from './tvshows/tvshows.component';
import { HelloworldComponent } from './helloworld/helloworld.component';
import { YouTubePlayerModule } from '@angular/youtube-player';
import { LoadingScreenComponent } from './loading-screen/loading-screen.component';


HttpClientModule

@NgModule({
  declarations: [
    AppComponent,
    Exercice2Component,
    MovieComponent,
    TopMenuComponent,
    SeriesComponent,
    TvshowsComponent,
    HelloworldComponent,
    LoadingScreenComponent
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    FormsModule,
    BrowserAnimationsModule,
    HttpClientModule,
    YouTubePlayerModule
  ],
  providers: [{provide:LocationStrategy, useClass:PathLocationStrategy}],
  bootstrap: [AppComponent]
})
export class AppModule { }
