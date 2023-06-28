import { TestBed } from '@angular/core/testing';

import { MoviedbAPIService } from './moviedb-api.service';

describe('MoviedbAPIService', () => {
  let service: MoviedbAPIService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(MoviedbAPIService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
