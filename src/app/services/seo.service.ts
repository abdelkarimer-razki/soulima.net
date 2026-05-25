import { Injectable, Inject } from '@angular/core';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';

@Injectable({
  providedIn: 'root'
})
export class SeoService {
  constructor(
    private titleService: Title,
    private metaService: Meta,
    @Inject(DOCUMENT) private document: Document
  ) {}

  updateMeta(config: {
    title: string;
    description: string;
    keywords?: string;
    image?: string;
    url?: string;
    type?: string;
    schema?: any;
  }) {
    // 1. Update Title tag
    this.titleService.setTitle(config.title);

    // 2. Update descriptive & SEO meta tags
    this.metaService.updateTag({ name: 'description', content: config.description });
    
    const keywordsVal = config.keywords || 'سوليما, Soulima, streaming movies, movies, free streaming, TV shows, online streaming, watch movies online, TV series';
    this.metaService.updateTag({ name: 'keywords', content: keywordsVal });
    this.metaService.updateTag({ name: 'robots', content: 'index, follow' });

    // 3. Open Graph (OG) social sharing properties
    this.metaService.updateTag({ property: 'og:title', content: config.title });
    this.metaService.updateTag({ property: 'og:description', content: config.description });
    this.metaService.updateTag({ property: 'og:type', content: config.type || 'website' });
    this.metaService.updateTag({ property: 'og:url', content: config.url || this.document.location.href });
    this.metaService.updateTag({ property: 'og:image', content: config.image || 'https://www.soulima.net/assets/soulima.png' });
    this.metaService.updateTag({ property: 'og:site_name', content: 'Soulima' });
    this.metaService.updateTag({ property: 'og:locale', content: 'en_US' });

    // 4. Twitter Cards
    this.metaService.updateTag({ name: 'twitter:card', content: 'summary_large_image' });
    this.metaService.updateTag({ name: 'twitter:title', content: config.title });
    this.metaService.updateTag({ name: 'twitter:description', content: config.description });
    this.metaService.updateTag({ name: 'twitter:image', content: config.image || 'https://www.soulima.net/assets/soulima.png' });

    // 5. Canonical Link tag updates
    this.updateCanonicalLink(config.url || this.document.location.href);

    // 6. JSON-LD Schema (Structured Data) injection
    if (config.schema) {
      this.updateJsonLd(config.schema);
    } else {
      this.removeJsonLd();
    }
  }

  private updateCanonicalLink(url: string) {
    let link: HTMLLinkElement | null = this.document.querySelector("link[rel='canonical']");
    if (!link) {
      link = this.document.createElement('link');
      link.setAttribute('rel', 'canonical');
      this.document.head.appendChild(link);
    }
    link.setAttribute('href', url);
  }

  private updateJsonLd(schema: any) {
    let script: HTMLScriptElement | null = this.document.querySelector("script[type='application/ld+json']");
    if (!script) {
      script = this.document.createElement('script');
      script.setAttribute('type', 'application/ld+json');
      this.document.head.appendChild(script);
    }
    script.textContent = JSON.stringify(schema);
  }

  private removeJsonLd() {
    const script = this.document.querySelector("script[type='application/ld+json']");
    if (script) {
      script.remove();
    }
  }
}
