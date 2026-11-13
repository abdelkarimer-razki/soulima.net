# Soulima (سوليما) — Commercial-Grade P2P Media Streaming Platform

[![Angular](https://img.shields.io/badge/Angular-16.0-DD0031.svg?logo=angular)](https://angular.io/)
[![Node.js](https://img.shields.io/badge/Node.js-20.x-339933.svg?logo=node.js)](https://nodejs.org/)
[![WebTorrent](https://img.shields.io/badge/WebTorrent-P2P%20Engine-brightgreen.svg)](https://webtorrent.io/)
[![FFmpeg](https://img.shields.io/badge/FFmpeg-Remux%20%26%20Transcode-007808.svg?logo=ffmpeg)](https://ffmpeg.org/)
[![PlayStation 4](https://img.shields.io/badge/PS4-OpenOrbis%20Homebrew-003791.svg?logo=playstation)](https://openorbis.github.io/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**Soulima** is a self-hosted, commercial-grade peer-to-peer streaming engine and modern web cinema application. It delivers instantaneous, Netflix-grade video on demand directly from distributed BitTorrent swarms without requiring files to be downloaded completely prior to playback.

Available across **Web Browsers**, **Linux Desktop (Electron)**, and **Jailbroken PlayStation 4 (OpenOrbis FPKG)**.

---

## 📸 Architecture & System Design

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
│  • Virtual Continuous Timeline (streamStartTime + currentTime)                         │
│  • Instant In-Buffer & Server-Side Dynamic Out-of-Buffer Scrubbing                     │
│  • Multi-Source Torrent Scraper (Torrentio, YTS, PirateBay, BitSearch)                 │
│  • Multi-Language Subtitles (SubDL + YIFY Subtitles + ffsubsync Alignment)             │
│  • Predictive Next-Episode Background Prefetching (Sub-second Episode Switching)        │
│  • Cross-Platform Delivery: Web UI • Linux Desktop App • PS4 OpenOrbis FPKG           │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 🌟 Key Engineering Highlights

### 1. Pure Torrent Streaming (Zero Cloud Storage, Zero Buffering Waits)
- **Instant Time-To-First-Frame (TTFF):** Prioritizes the initial byte blocks (file headers, metadata) and trailing cues (`moov` atoms / Matroska seekheads) immediately upon magnet ingestion, enabling playback in seconds.
- **Dynamic Tracker Merging:** Enriches every magnet URI with 20+ bootstrap WebSocket and UDP trackers for rapid peer discovery even in sparse swarms.
- **Fast Swarm Failover:** Identifies dead or unseeded torrents within 6.5 seconds and automatically fails over to the next highest-seeded release.

### 2. On-the-Fly MKV Remuxing & Transcoding
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

### 4. Background Episode Prefetching
- While an active episode is playing, the client automatically requests and warms up the BitTorrent swarm for the next episode in the season pack.
- Episode transitions happen with near-instantaneous switch latency (<1s warm TTFF).

### 5. Multi-Language Subtitles with `ffsubsync` Auto-Alignment
- Integrates SubDL and YIFY Subtitles APIs for multi-language subtitle tracks.
- Asynchronously aligns subtitles against the video audio stream using `ffsubsync`, correcting audio/subtitle sync drift automatically.

---

## 🎮 Cross-Platform Ecosystem

### 🌐 Web Application
- Single Page Application built with Angular 16, RxJS, and clean cinema HUD controls.
- Runs on any standard browser (Chrome, Firefox, Safari, Edge).

### 🖥️ Linux Desktop App (Electron)
- Standalone desktop bundle with embedded Node.js streaming server and static FFmpeg binary.
- Full desktop integration with AppArmor compliance, icon badges, and system tray lifecycle.

### 🕹️ PlayStation 4 Homebrew (OpenOrbis FPKG)
- Custom native C launcher (`ps4/src/main.c`) targeting `x86_64-scei-ps4` using the OpenOrbis Toolchain.
- 100% compliant `param.sfo` descriptor generated via `PkgTool.Core` with `CATEGORY="gd"` and valid `CONTENT_ID`.
- Integrates `sceSystemServiceLaunchWebBrowser` to run Soulima in full-screen hardware-accelerated WebKit on jailbroken PS4 firmware (GoldHEN 5.05 - 11.00).

---

## 🚀 Quick Start

### Prerequisites
- [Node.js](https://nodejs.org/) v18+ (v20+ recommended)
- [FFmpeg](https://ffmpeg.org/) installed and available in `PATH`

### 1. Run the Web & Streaming Server
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
npx ng build --configuration=production

# Run production server
node streaming-server/server.js
```

---

### 3. Run Automated E2E Test Suite
The repository includes automated multi-agent user simulation tests powered by Puppeteer:

```bash
# Run the intensive MKV & MP4 timeline scrubbing verification
node tests/e2e/test_seek_behavior.mjs

# Run the complete commercial user loop (Search -> Modal -> Movie -> Seek -> Subtitles -> Series -> Episode switch)
node tests/e2e/comprehensive_user_loop.mjs
```

---

### 4. Assemble PS4 Fake PKG (Optional)
Requires OpenOrbis PS4 Toolchain:
```bash
# Compile eboot and assemble validated Fake PKG
python3 ps4/scripts/build_pkg.py
```
Outputs `ps4/dist/Soulima.pkg`, ready to install via GoldHEN Package Installer.

---

## 📁 Repository Structure

```
├── src/                          # Angular 16 Cinema Client
│   ├── app/
│   │   ├── components/
│   │   │   ├── torrent-player/   # Core HTML5 P2P video player & HUD controls
│   │   │   └── player-loader/    # Buffering & metadata progress overlay
│   │   ├── movie/                # Movie details and cinema view
│   │   ├── series/               # TV show season/episode browser & cinema view
│   │   └── services/             # Torrent, subtitle, and TMDB integration services
├── streaming-server/             # High-Performance Node.js Torrent & Transcoding Engine
│   ├── server.js                 # WebTorrent, FFmpeg remuxing, Range streaming, and proxy APIs
├── desktop/                      # Electron Linux Desktop Wrapper
│   ├── main.js                   # Main Electron process with embedded daemon management
│   └── build.mjs                 # Packaging & static binary bundling scripts
├── ps4/                          # PlayStation 4 Homebrew Port
│   ├── src/                      # Native C launcher (sceSystemService)
│   ├── scripts/                  # OpenOrbis SFO & PKG automation scripts
│   └── sce_sys/                  # PS4 icons, splash art, and parameter metadata
├── tests/                        # Automated Multi-Agent E2E Verification
│   └── e2e/                      # Headless Puppeteer benchmarks and seeking test loops
└── docs/                         # Compiled production web bundle
```

---

## 🛠️ Technology Stack

| Layer | Technologies |
| --- | --- |
| **Frontend** | Angular 16, TypeScript, RxJS, HTML5 Video API, CSS Custom Properties |
| **P2P & Streaming** | WebTorrent, Express.js, HTTP 206 Partial Content, WebSockets, DHT, PEX |
| **Transcoding** | FFmpeg 7.x, fragmented MP4, libx264, AAC, ffsubsync |
| **Metadata & Subtitles** | TMDB API, SubDL REST API, YIFY Subtitles API |
| **Desktop** | Electron 43, Electron Builder |
| **Console Port** | C, OpenOrbis PS4 Toolchain, OrbisOS WebKit, PkgTool.Core |
| **Testing & CI** | Puppeteer Headless Browser, E2E Latency Benchmarking |

---

## 📄 License
This project is open-source under the [MIT License](LICENSE).
