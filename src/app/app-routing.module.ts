import { NgModule } from '@angular/core';
import { Exercice2Component } from './exercice2/exercice2.component';
import { RouterModule, Routes } from '@angular/router';
import { MovieComponent } from './movie/movie.component';

const routes: Routes = [
  { path: '', component: Exercice2Component },
  {path:'movie/:id', component: MovieComponent},
  {path:'**', component: Exercice2Component, redirectTo:''},
  
  
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
