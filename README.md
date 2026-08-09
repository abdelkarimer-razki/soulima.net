# Soulima

Free movie & TV streaming web app (SPA). Built with Angular 16, backed by TMDB for metadata, and powered by a system of live embed-server mirrors with automatic health checks and provider discovery.

## Tech stack

- **Frontend**: Angular 16 (single-page app, static build)
- **Backend**: Vercel serverless functions (Node 18) in `/api`
- **Data**: TMDB API for titles, posters and episode metadata
- **Streaming**: multiple embed providers (`vidlink.pro`, `multiembed.mov`, `superembed.stream`, `vidsrc.sbs`, ...) selected automatically from working mirrors

## Project structure

```
├── src/            Angular app (components, services, styles)
├── api/            Vercel serverless functions (Node)
│   ├── servers.ts        Static verified server list
│   ├── check-server.ts   Reachability + bot-challenge/shell detection for a URL
│   └── discover.ts       Auto-discovery: probes candidates & detects embed format
├── docs/           Production build output (deployed artifact)
├── vercel.json     SPA rewrite rules (all non-/api routes -> index.html)
└── angular.json
```

## Development server

```bash
npm install
ng serve
```

Navigate to `http://localhost:4200/`. The app auto-reloads on source changes.

## Build

```bash
ng build
```

Build artifacts go to `docs/` (production configuration). This folder is the deployed static site.

## Deployment

Deploy on Vercel with the root `vercel.json` rewrite config. The `/api` directory becomes serverless functions; everything else serves the SPA.

## How the server-mirror system works

1. **`/api/servers`** returns the static verified provider list.
2. The frontend checks each provider's reachability through **`/api/check-server`** (marks bot-challenge pages and empty shells as offline) and ranks by reliability (stored in `localStorage`).
3. **`/api/discover`** re-probes known candidates plus pattern variants (e.g. `vidsrc.{tld}`), detects the correct embed URL format from player markers (m3u8/video/mp4), and returns freshly working providers.
4. The frontend runs discovery in the background (cached ~6h) and can be triggered manually from the server dropdown. Newly found providers are merged into the live list without a redeploy.

## Code scaffolding

```bash
ng generate component component-name
```

## Further help

`ng help` or the [Angular CLI overview](https://angular.io/cli).
