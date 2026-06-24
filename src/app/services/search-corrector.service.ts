import { Injectable } from '@angular/core';

interface DictionaryEntry {
  title: string;
  normalized: string;
  popularity: number;
}

@Injectable({
  providedIn: 'root'
})
export class SearchCorrectorService {
  private dictionaryMap = new Map<string, DictionaryEntry>();

  constructor() {
  }

  public addTitles(titles: string[], basePopularity: number = 50): void {
    for (const title of titles) {
      if (!title) continue;
      const normalized = this.normalize(title);
      if (!normalized) continue;
      
      const existing = this.dictionaryMap.get(normalized);
      if (existing) {
        // Keep the one with higher popularity
        existing.popularity = Math.max(existing.popularity, basePopularity);
      } else {
        this.dictionaryMap.set(normalized, {
          title,
          normalized,
          popularity: basePopularity
        });
      }
    }
  }

  public addMediaItems(items: any[]): void {
    if (!items || !items.length) return;
    for (const item of items) {
      const title = item.title || item.original_title || item.name || item.original_name;
      const popularity = item.popularity || 10;
      if (title) {
        this.addTitles([title], popularity);
      }
    }
  }

  public normalize(str: string): string {
    let clean = str.toLowerCase();
    
    // Expand contractions so they map to the same normalized terms
    clean = this.expandContractions(clean);
    
    return clean
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private expandContractions(str: string): string {
    const contractions: { [key: string]: string } = {
      "i'm": "i am",
      "im": "i am",
      "it's": "it is",
      "its": "it is",
      "don't": "do not",
      "dont": "do not",
      "you're": "you are",
      "youre": "you are",
      "we're": "we are",
      "they're": "they are",
      "theyre": "they are",
      "can't": "can not",
      "cant": "can not",
      "won't": "will not",
      "wont": "will not",
      "isn't": "is not",
      "isnt": "is not",
      "aren't": "are not",
      "arent": "are not",
      "wasn't": "was not",
      "wasnt": "was not",
      "weren't": "were not",
      "werent": "were not",
      "haven't": "have not",
      "havent": "have not",
      "hasn't": "has not",
      "hasnt": "has not",
      "hadn't": "had not",
      "hadnt": "had not",
      "who's": "who is",
      "whos": "who is",
      "what's": "what is",
      "whats": "what is",
      "where's": "where is",
      "wheres": "where is",
      "there's": "there is",
      "theres": "there is",
      "here's": "here is",
      "heres": "here is",
      "let's": "let us",
      "lets": "let us",
      "you've": "you have",
      "youve": "you have",
      "i've": "i have",
      "ive": "i have",
      "we've": "we have",
      "weve": "we have",
      "they've": "they have",
      "theyve": "they have"
    };

    return str.split(/\s+/).map(word => {
      const cleanWord = word.replace(/[^\w']/g, '');
      return contractions[cleanWord] || word;
    }).join(' ');
  }

  public suggestCorrection(query: string): string | null {
    if (!query) return null;
    const normalizedQuery = this.normalize(query);
    if (!normalizedQuery || normalizedQuery.length < 3) return null;

    // If query has exact match, no correction needed
    if (this.dictionaryMap.has(normalizedQuery)) {
      return null;
    }

    const queryLen = normalizedQuery.length;
    let maxAllowedDistance = 1;
    if (queryLen >= 5 && queryLen <= 8) {
      maxAllowedDistance = 2;
    } else if (queryLen > 8) {
      maxAllowedDistance = 3;
    }

    let bestMatches: DictionaryEntry[] = [];
    let minDistance = Infinity;

    for (const entry of this.dictionaryMap.values()) {
      const distance = this.getLevenshteinDistance(normalizedQuery, entry.normalized);
      
      // If we find an exact match, we don't need correction
      if (distance === 0) {
        return null;
      }

      if (distance <= maxAllowedDistance) {
        if (distance < minDistance) {
          minDistance = distance;
          bestMatches = [entry];
        } else if (distance === minDistance) {
          bestMatches.push(entry);
        }
      }
    }

    if (bestMatches.length === 0) {
      return null;
    }

    // Sort matching entries by popularity descending
    bestMatches.sort((a, b) => b.popularity - a.popularity);

    return bestMatches[0].title;
  }

  public suggestPrefixCorrection(query: string): string | null {
    if (!query) return null;
    const normalizedQuery = this.normalize(query);
    if (!normalizedQuery || normalizedQuery.length < 2) return null;

    let bestMatches: DictionaryEntry[] = [];
    for (const entry of this.dictionaryMap.values()) {
      if (entry.normalized.startsWith(normalizedQuery)) {
        bestMatches.push(entry);
      }
    }

    if (bestMatches.length === 0) {
      return null;
    }

    // Sort by popularity descending
    bestMatches.sort((a, b) => b.popularity - a.popularity);

    return bestMatches[0].title;
  }

  private getLevenshteinDistance(a: string, b: string): number {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    const matrix: number[][] = [];

    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1      // deletion
          );
        }
      }
    }

    return matrix[b.length][a.length];
  }
}
