# Soulima (سوليما) — Commercial-Grade P2P Media Streaming Platform

[![Angular](https://img.shields.io/badge/Angular-16.0-DD0031.svg?logo=angular)](https://angular.io/)
[![Node.js](https://img.shields.io/badge/Node.js-20.x-339933.svg?logo=node.js)](https://nodejs.org/)
[![WebTorrent](https://img.shields.io/badge/WebTorrent-P2P%20Engine-brightgreen.svg)](https://webtorrent.io/)
[![FFmpeg](https://img.shields.io/badge/FFmpeg-Remux%20%26%20Transcode-007808.svg?logo=ffmpeg)](https://ffmpeg.org/)
[![Smart TV](https://img.shields.io/badge/Smart%20TV-10--Foot%20D--Pad-E50914.svg)](https://soulima.net)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**Soulima** is a self-hosted, commercial-grade peer-to-peer streaming engine and modern web cinema application. It delivers instantaneous, Netflix-grade video on demand directly from distributed BitTorrent swarms without requiring files to be downloaded completely prior to playback.

Available across **Web Browsers**, **Linux Desktop (Electron)**, and **Smart TVs (10-Foot D-Pad UI) / Mobile PWA**.

---

## Architecture and System Design

```
                     ┌───────────────────────────────────────────────┐
                     │               BitTorrent Swarm                │
                     │  (WSS WebSeeds, Public Trackers, DHT, PEX)    │
                     └───────────────────────┬───────────────────────┘
                                             │ Sequential Pieces
                                             ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        Soulima Streaming Engine (Port 3030)                           │
│                                                                                        │
│  ┌───────────────────────┐   HTTP 206 Range   ┌─────────────────────────────────────┐  │
│  │ WebTorrent Controller ├───────────────────►│ /api/raw-stream/:id (Seekable)     │  │
│  │ Sequential Prioritizer│                    └──────────────────┬──────────────────┘  │
│  └───────────────────────┘                                       │                     │
│                                                                  ▼                     │
│  ┌───────────────────────┐                    ┌─────────────────────────────────────┐  │
│  │ Codec Probe (FFmpeg)  │                    │ FFmpeg Transcode/Remux Pipeline     │  │
│  │ MKV/MP4/HEVC/AAC/DTS  │                    │ -ss seek, copy/h264, aac, fMP4      │  │
│  └───────────────────────┘                    └──────────────────┬──────────────────┘  │
│                                                                  │ Fragmented MP4      │
│                                                                  ▼                     │
│                                               ┌─────────────────────────────────────┐  │
│                                               │ /api/stream/:id?startTime=t         │  │
│                                               └──────────────────┬──────────────────┘  │
└──────────────────────────────────────────────────────────────────┼─────────────────────┘
                                                                   │ Video / Audio Stream
                                                                   ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                       Soulima Cinema Frontend (Angular 16)                             │
│                                                                                        │
│  • Unified Cinema Experience (Movies & TV Series merged with on-page filter pills)    │
│  • Modern Search Interface (Query tags, in-search category tabs, 2:3 responsive grid)  │
│  • Tier-Aware Smart TV Spatial Navigation (10-Foot D-Pad navigation engine)            │
│  • Virtual Continuous Timeline (streamStartTime + currentTime)                         │
│  • Instant In-Buffer & Server-Side Dynamic Out-of-Buffer Scrubbing                     │
│  • Multi-Source Torrent Scraper (Torrentio, YTS, PirateBay, BitSearch)                 │
│  • Resilient Subtitle Engine (3x retry, SubDL, YIFY, ffsubsync, auto-fallback chain)   │
│  • Predictive Next-Episode Background Prefetching (Sub-second Episode Switching)        │
│  • Cross-Platform Delivery: Web UI • Linux Desktop App • Smart TV & Mobile PWA        │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Key Engineering Highlights

### 1. Pure Torrent Streaming (Zero Cloud Storage, Zero Buffering Waits)
- **Instant Time-To-First-Frame (TTFF):** Prioritizes the initial byte blocks (file headers, metadata) and trailing cues (`moov` atoms / Matroska seekheads) immediately upon magnet ingestion, enabling playback in seconds.
- **Dynamic Tracker Merging:** Enriches every magnet URI with 20+ bootstrap WebSocket and UDP trackers for rapid peer discovery even in sparse swarms.
- **Fast Swarm Failover:** Identifies dead or unseeded torrents within 6.5 seconds and automatically fails over to the next highest-seeded release.

### 2. On-the-Fly MKV Remuxing and Transcoding
- **Fragmented MP4 Remuxing (`frag_keyframe+empty_moov+default_base_moof`):** Remuxes Matroska (`.mkv`) containers on the fly to Chromium-compliant fragmented MP4.
- **Smart Codec Passthrough:** Videos encoded in H.264 copy directly with near-zero CPU overhead; HEVC/H.265 files are transcoded on-the-fly with `libx264 veryfast`.
- **Incompatible Audio Transcoding:** Non-browser-safe audio streams (DTS, AC3, EAC3, TrueHD) are automatically downmixed/transcoded to AAC, eliminating silent audio playback in Chromium/WebKit.

### 3. Solved: The Fragmented Stream Seek Problem
- **The Problem:** Fragmented MP4 streams piped over HTTP standard `stdin` are non-seekable. Scrubbing on standard HTML5 players clamps `currentTime` back to `00:00`.
- **The Solution:** 
  1. Built `/api/raw-stream/:id` supporting full HTTP 206 byte-ranges for internal pipeline consumption.
  2. Routed FFmpeg demuxing through loopback HTTP with `-seekable 1 -multiple_requests 1`.
  3. Mapped time seeks (`/api/stream/:id?startTime=t`) directly to byte offsets in WebTorrent (`(approxByte + file.offset) / pieceLength`), prioritizing only the pieces surrounding the seek timestamp.
  4. Engineered a virtual continuous timeline in Angular (`streamStartTime + video.currentTime`), ensuring smooth seeking forward (+30s, +120s, +10min) and backward with zero timeline resets.

### 4. Resilient Subtitle Engine and Frame-Accurate Alignment
- **3-Attempt Exponential Backoff Discovery:** Subtitle scraping operates with parity to source discovery resilience, retrying up to 3 times before error propagation.
- **Dynamic Host URL Resolution:** Resolves subtitle API endpoints dynamically via `window.location.hostname`, preventing localhost blackouts on remote devices and Smart TVs.
- **Verified `X-Subtitle-Sync` Header Feedback:** Communicates background `ffsubsync` status (`pending`, `syncing`, `synced`, `failed`, `unavailable`) directly to the client player, halting polling immediately upon completion or unsuitability.
- **Automatic Fallback Chain and Validation:** Validates that cue counts are non-empty. If a subtitle file fails or has 0 cues, the player automatically cascades to the next best track in the same language.
- **Overlapping Cue Scanner:** Retains all active dialogues across multi-character and singing scenes within a 60-second scanning window.

### 5. Unified Cinema Browsing and Dynamic Billboard
- **Cohesive Catalog:** Merges Movies and TV Series into a single browsing experience with sticky section filter pills (`All Cinema`, `Movies`, `TV Shows`) and instant genre tags (`Action`, `Sci-Fi`, `Comedy`, `Drama`, `Horror`, `Animation`).
- **Dynamic Spotlight Billboard:** Automatically switches the hero billboard to a relevant top title matching the selected medium when filters change.
- **Curated Content Shelves:** Continue Watching (with episode badges and progress bars), Top 10 Trending Today with Netflix-style giant rank typography, Blockbusters, Binge-Worthy TV Series, and Fresh Releases.
- **Safe Headroom Padding:** Employs a 40px internal headroom padding pattern inside horizontal carousels to ensure poster hover scale (`scale(1.06)`), outlines, and drop shadows never clip against scroll boundaries.

### 6. Modern Search Experience
- **Instant Query Highlighting:** Live query tags and result counters (`All (N)`, `Movies (N)`, `TV Shows (N)`).
- **Fluid 2:3 Grid:** High-density responsive card grid with media type tags (`MOVIE` vs `TV SHOW`), star ratings, and hover action shortcuts (`Play Now`, `Info`).
- **Top-Anchored Image Zoom:** Image scaling anchored to `center top` so actor faces and movie titles remain fully visible without clipping inside rounded card masks.
- **Smart Empty State:** Automatic spelling correction suggestions and popular recommendations for zero-result queries.

### 7. Tier-Aware Smart TV Spatial Navigation
- **10-Foot D-Pad Engine (`SmartTvService`):** Recognizes vertical DOM tiers (Top Nav, Billboard, Filters, Shelves, Search Grid, Footer) in strict order.
- **Deterministic Row Transitions:** `ArrowDown` and `ArrowUp` keys transition cleanly across shelves, selecting the horizontally nearest card and auto-centering the entire shelf in the TV viewport (`smooth` window scroll).
- **Index Clamping & Intra-Tier Centering:** `ArrowLeft` and `ArrowRight` navigate cards with automatic horizontal viewport centering (`scrollIntoView({ inline: 'center' })`).

---

## Cross-Platform Ecosystem

### Web Application
- Single Page Application built with Angular 16, RxJS, and clean cinema HUD controls.
- Runs on any standard browser (Chrome, Firefox, Safari, Edge).

### Linux Desktop App (Electron)
- Standalone desktop bundle with embedded Node.js streaming server and static FFmpeg binary.
- Full desktop integration with AppArmor compliance, icon badges, and system tray lifecycle.

### Smart TV and 10-Foot Cinema Experience
- **Spatial D-Pad and Remote Control Navigation:** Built-in 2D directional navigation engine (`SmartTvService`) mapping Arrow keys, Enter, Back, and Media keys seamlessly for TV remotes (LG webOS, Samsung Tizen, Android TV, Fire TV).
- **10-Foot TV Cinema Interface:** Horizontal poster shelves with smooth D-pad scrolling, high-contrast red focus rings (`outline: 3px solid #e50914`), and hero spotlight displaying movie backdrops, ratings, runtime, and synopses.
- **Integrated In-App Cinema Player:** Streams and decodes torrent video directly on the TV browser with animated BitTorrent swarm buffering HUD (seeds, peers, download rate in MB/s, buffer progress), live timeline scrub bar, play/pause, and fast seeking (+/- 10s, +/- 30s).
- **Mobile PWA and Touch Optimized:** Responsive bottom navigation bar, safe-area inset compliance for notches, touch gestures, and home screen installability.

---

## Quick Start

### Prerequisites
- [Node.js](https://nodejs.org/) v18+ (v20+ recommended)
- [FFmpeg](https://ffmpeg.org/) installed and available in `PATH`

### 1. Run the Web and Streaming Server
```bash
# Clone the repository
git clone https://github.com/abdelkarimer-razki/soulima.net.git
cd soulima.net

# Install root dependencies
npm install

# Install streaming server dependencies
npm --prefix streaming-server install

# Start both Angular frontend and Streaming Server concurrently
npm run dev
```
Open **`http://localhost:3030`** in your browser.

---

### 2. Build for Production
```bash
# Build Angular production bundle to docs/
npm run build

# Mirror web build into desktop distribution
rsync -av --delete docs/ desktop/resources/web/

# Run production server
node streaming-server/server.js
```

---

### 3. Run Automated Verification Test Suite
The repository includes automated unit and integration tests covering the player and streaming pipeline:

```bash
# Run unit and integration verification checks
node scripts/test-player-and-server.js

# Run the intensive MKV & MP4 timeline scrubbing verification
node tests/e2e/test_seek_behavior.mjs

# Run the complete commercial user loop
node tests/e2e/comprehensive_user_loop.mjs
```

---

## Repository Structure

```
├── src/                          # Angular 16 Cinema Client
│   ├── app/
│   │   ├── components/
│   │   │   ├── torrent-player/   # Core HTML5 P2P video player & HUD controls
│   │   │   └── player-loader/    # Buffering & metadata progress overlay
│   │   ├── exercice2/            # Unified cinema browsing & modern search experience
│   │   ├── movie/                # Movie details and cinema view
│   │   ├── series/               # TV show season/episode browser & cinema view
│   │   ├── offline-library/      # Local downloads & offline storage viewer
│   │   ├── offline-player/       # Offline media player
│   │   └── services/             # Smart TV spatial nav, torrent, subtitle, & TMDB services
├── streaming-server/             # High-Performance Node.js Torrent & Transcoding Engine
│   └── server.js                 # WebTorrent, FFmpeg remuxing, Range streaming, and proxy APIs
├── desktop/                      # Electron Linux Desktop Wrapper
│   ├── main.js                   # Main Electron process with embedded daemon management
│   ├── build.mjs                 # Packaging & static binary bundling scripts
│   └── resources/                # Embedded server and web assets
├── scripts/                      # Test suites and build verification helpers
│   └── test-player-and-server.js # 9-point unit & integration verification suite
├── tests/                        # Automated Multi-Agent E2E Verification
│   └── e2e/                      # Headless Puppeteer benchmarks and seeking test loops
├── docs/                         # Compiled production web bundle
└── AUDIT_LEDGER.md               # Complete audit history and enhancement ledger
```

---

## Technology Stack

| Layer | Technologies |
| --- | --- |
| **Frontend** | Angular 16, TypeScript, RxJS, HTML5 Video API, CSS Custom Properties |
| **P2P & Streaming** | WebTorrent, Express.js, HTTP 206 Partial Content, WebSockets, DHT, PEX |
| **Transcoding** | FFmpeg 7.x, fragmented MP4, libx264, AAC, ffsubsync |
| **Metadata & Subtitles** | TMDB API, SubDL REST API, YIFY Subtitles API |
| **Desktop** | Electron 43, Electron Builder |
| **Smart TV & Mobile** | Tier-Aware Spatial D-Pad Engine (Angular), 10-Foot UI, PWA Service Worker, Responsive CSS |
| **Testing & CI** | Mocha-compatible custom test harness, Puppeteer Headless Browser |

---

## License
This project is open-source under the [MIT License](LICENSE).
