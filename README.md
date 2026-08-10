# Soulima

Self-hosted streaming app: an Angular web frontend plus a Node.js torrent-to-HTTP streaming backend. It can run as a regular website (Vercel) or as a **desktop application** (Electron) that runs entirely on your own machine.

## Project layout

| Path | Description |
| --- | --- |
| `src/` | Angular 16 web frontend |
| `api/` | Vercel serverless functions (deployed with the site) |
| `streaming-server/` | Express + WebTorrent backend that streams torrents over HTTP |
| `desktop/` | Electron wrapper that bundles the frontend + streaming server into one app |

## Desktop app

### Prerequisites

- [Node.js](https://nodejs.org) 18 or newer (20+ recommended)
- npm

### Quick start (install and run)

```bash
# 1. Install frontend dependencies (run once)
npm install

# 2. Install streaming server dependencies (run once)
npm --prefix streaming-server install

# 3. Install Electron + build tools (run once)
npm --prefix desktop install

# 4. Build the desktop app (compiles the Angular frontend and
#    bundles the streaming server into desktop/resources/)
npm run desktop:build

# 5. Launch it
npm run desktop:start
```

Or, in one command:

```bash
npm run desktop
```

This compiles the frontend, bundles everything, and opens the Soulima window. The streaming server starts automatically on `http://localhost:3030` and is shut down when you close the app.

### Package an installer

To produce a distributable installer (`.AppImage` / `.deb` on Linux, `.exe` on Windows, `.dmg` on macOS):

```bash
npm --prefix desktop run package
```

The installers are written to `desktop/dist/`.

### Optional: subtitle key

For subtitle search/downloads, copy `streaming-server/.env.example` to `streaming-server/.env` and add a free SubDL API key (https://subdl.com/panel/api). Subtitles are optional; the app works without them.

### Notes

- The first run of `npm --prefix desktop install` downloads the Electron binary (can take a minute).
- On some Linux systems Electron needs its SUID sandbox helper configured: `sudo chown root:root desktop/node_modules/electron/dist/chrome-sandbox && sudo chmod 4755 desktop/node_modules/electron/dist/chrome-sandbox`.
- ffmpeg is used for transcoding; the streaming server auto-detects it (see `FFMPEG_PATH` in `streaming-server/.env.example`).

## Web development

```bash
npm install
npm start            # Angular dev server on http://localhost:4200
npm run dev          # Angular dev server + streaming server together (uses concurrently)
npm run build        # production build -> docs/
```

## Tech stack

- **Frontend:** Angular 16, RxJS, ngx-cookie-service
- **Streaming:** Express, WebTorrent (server-side torrent-to-HTTP), SubDL subtitles
- **Desktop:** Electron 43
