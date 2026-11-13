# PROJECT HANDOFF & MASTER PLAN: SOULIMA PS4 PKG & TEST LOOP

**Project:** Soulima (Self-hosted Angular + WebTorrent streaming app)  
**Target Console:** PlayStation 4 (Jailbroken / GoldHEN / 5.05 - 11.00+)  
**Repository Path:** `/home/abdelkarim/Desktop/karim/labs/soulima.net`  
**Date:** November 2026

---

## 1. Project Goal & Overview

The goal is to convert **Soulima** into an installable `.pkg` app that appears on the PS4 XMB (dashboard) allowing the user to browse movies/series and stream them on their TV.

### Two-Part Plan:
1. **Automated Multi-Agent Real-User Testing Loop (Laptop Local):**  
   Simulate end-to-end user actions (search, play, seek/change minutes, switch subtitle languages, check buffering) in a headless browser loop to uncover bugs, auto-report them, and iteratively patch them.
2. **PS4 Homebrew Web Launcher App (.pkg):**  
   Package Soulima into a native PS4 homebrew PKG featuring custom metadata (`param.sfo`), icon (`icon0.png`), splash screen (`pic1.png`), and an `eboot.bin` browser launcher that renders Soulima fullscreen via PS4 WebKit, connecting to the streaming backend on the local network.

---

## 2. Technical Architecture & Constraints

```
┌──────────────────────────────────────────────┐       LAN       ┌─────────────────────────────────────────────────────────┐
│              PlayStation 4                   │ ──────────────> │                Host Machine (Laptop / PC)               │
│  [Soulima PKG on XMB] (Title: SOUL00001)     │  HTTP Stream    │  • Streaming Server: Express + WebTorrent (:3030)       │
│  • param.sfo + icon0.png + pic1.png          │ <────────────── │  • Subtitle Fetcher / SubDL API                         │
│  • eboot.bin -> sceSystemServiceLaunchBrowser│                 │  • ffmpeg transcoding (H.264/AAC for PS4 compatibility) │
│  • PS4 WebKit Browser (fullscreen UI)        │                 │  • Angular Web UI (:4200 or bundled static build)       │
└──────────────────────────────────────────────┘                 └─────────────────────────────────────────────────────────┘
```

> **Why this architecture?**  
> Running Node.js, WebTorrent, and ffmpeg directly/natively inside OrbisOS (PS4) requires cross-compiling the entire V8 runtime, patching FreeBSD JIT `mprotect`, and mapping sockets to `libSceNet`. That is a multi-month engineering effort. The **PS4 Homebrew Web App PKG** pattern is the proven, standard approach used by community media clients: native XMB launch -> fullscreen WebKit -> local streaming server.

---

## 3. Where We Arrived (Current Status & Completed Work)

### A. Existing Project State
- Frontend: Angular 16 (`src/`, builds to `docs/`)
- Backend: Express + WebTorrent (`streaming-server/server.js`)
- All local `node_modules` (frontend & backend) are installed and verified working.
- Previous server logs confirm successful torrent streaming and subtitle fetching on this machine.

### B. PS4 Assets & Metadata (Completed ✅)
Located in `/home/abdelkarim/Desktop/karim/labs/soulima.net/ps4/`:
- `ps4/sce_sys/param.sfo`: Validated binary SFO file (Title ID: `SOUL00001`, Title: `Soulima`, App Type: 1, System FW: 5.05+).
- `ps4/sce_sys/icon0.png`: 512x512 XMB application icon.
- `ps4/sce_sys/pic1.png`: 1920x1080 background splash.
- `ps4/scripts/make_sfo.py`: Python generator for PS4 SFO format.
- `ps4/scripts/make_icons.py`: Pillow-based generator for icons and splash.
- `ps4/soulima.conf`: Config file holding server IP (`SERVER_URL=http://192.168.1.100:3030`).

### C. PS4 C Launcher Code (Written ✅, Pending Final Linking)
- `ps4/src/main.c`: Minimal C launcher invoking `sceSystemServiceLaunchWebBrowser` and `sceSystemServiceHideSplashScreen`.
- `ps4/src/main_full.c`: Enhanced C launcher with config file reading from `/data/soulima.conf` or `/app0/soulima.conf`.
- `ps4/src/stub_shims.c`: Stubs for SDK symbols.
- `ps4/src/Makefile`: Compiles and links the source using clang/lld.
- `ps4/env.sh`: Environment configuration pointing to OpenOrbis SDK & LLVM toolchain.

### D. Interruption Point
- Toolchain download and final PKG compilation were interrupted when the subagent reached its quota limit (`RESOURCE_EXHAUSTED`).

---

## 4. Phase 1: Real-User Automated Testing Loop (Local Laptop)

Before deploying to PS4, validate the application with an automated browser test harness.

### 4.1 Test Harness Setup
Use Playwright (or Puppeteer) running in headless/headed mode against local servers:
```bash
# 1. Start backend server
node streaming-server/server.js &

# 2. Start frontend dev server
npm start & # or npx ng serve --host 0.0.0.0 --port 4200
```

### 4.2 Simulated User Test Cases (`tests/e2e/user_flow.spec.ts`)
1. **Search Test:**
   - User types query in search bar (e.g. "Matrix", "Big Buck Bunny").
   - Wait for search results grid to populate.
2. **Selection & Navigation:**
   - Click a movie/show card.
   - Verify navigation to movie details page and check metadata rendering.
3. **Playback Initiation:**
   - Click "Watch" / "Play" button.
   - Assert `<video>` element attaches source `http://localhost:3030/api/stream/...`.
   - Wait for `video.readyState >= 2` (metadata loaded) and `currentTime > 0`.
4. **Seeking / Minute Change:**
   - Trigger seek action to 5 minutes, 15 minutes, 30 minutes.
   - Confirm server handles HTTP Range request headers (`bytes=...`) with HTTP 206 Partial Content.
   - Confirm video continues playing without freezing.
5. **Language & Subtitle Switch:**
   - Click subtitle selector menu.
   - Switch language (e.g., English, Spanish, French).
   - Assert `.vtt` / `.srt` track is loaded and attached to active video player.
6. **Error Detection & Reporting:**
   - Catch console errors, failed network requests (HTTP 4xx/5xx), and video stalled events.
   - Write structured bug logs to `tests/reports/bug_report_<timestamp>.json`.

### 4.3 Autonomous Fix Loop
```
[Run Test Suite] ──> [Bug Detected?] ──No──> [Pass & Ready for PKG]
        │
       Yes
        ▼
[Analyze Error Stack / Network Log]
        ▼
[Apply Fix in src/ or streaming-server/]
        ▼
[Re-run Test Suite]
```

---

## 5. Phase 2: OpenOrbis Toolchain & eboot.bin Compilation

### 5.1 Environment Prerequisites
Ensure LLVM 18+ and OpenOrbis PS4 Toolchain are active:
```bash
source /home/abdelkarim/Desktop/karim/labs/soulima.net/ps4/env.sh
```

### 5.2 Build eboot.elf
Compile `ps4/src/main.c` with the target `x86_64-scei-ps4`:
```bash
clang --target=x86_64-scei-ps4 \
      -isysroot $OO_PS4_TOOLCHAIN \
      -I$OO_PS4_TOOLCHAIN/include \
      -c ps4/src/main.c -o ps4/build/main.o

ld.lld -m elf_x86_64 \
       -pie --script $OO_PS4_TOOLCHAIN/link.x \
       --eh-frame-hdr \
       -L$OO_PS4_TOOLCHAIN/lib \
       -lkernel -lSceSystemService \
       ps4/build/main.o -o ps4/build/eboot.elf
```

### 5.3 Generate Fake Signed eboot.bin (FSELF)
Using OpenOrbis `create-fself` utility:
```bash
$OO_PS4_TOOLCHAIN/bin/linux/create-fself \
    --in ps4/build/eboot.elf \
    --out ps4/build/eboot.bin \
    --paid 0x3800000000000011
```

---

## 6. Phase 3: PKG Packaging & GoldHEN Deployment

### 6.1 Package Directory Structure
Prepare staging directory `ps4/pkg_staging/`:
```
ps4/pkg_staging/
├── sce_sys/
│   ├── param.sfo
│   ├── icon0.png
│   └── pic1.png
├── eboot.bin
└── soulima.conf
```

### 6.2 Building the .pkg
Use `orbis-pub-cmd` or open-source `PkgTool.Core` / `LibOrbisPkg`:

1. **Generate `.gp4` project file (`ps4/scripts/make_gp4.py`):**
   Defines volume title, passcode (`00000000000000000000000000000000`), Content ID (`IV0000-SOUL00001_00-SOULIMA000000000`), and files list.
2. **Compile final PKG:**
   ```bash
   orbis-pub-cmd img_create ps4/project.gp4 ps4/dist/Soulima.pkg
   ```

### 6.3 PS4 Installation Instructions (GoldHEN)
1. Copy `ps4/dist/Soulima.pkg` to the root of an exFAT/FAT32 USB drive.
2. Insert USB into jailbroken PS4.
3. Open PS4 Settings -> **GoldHEN** -> **Package Installer**.
4. Select `Soulima.pkg` and click Install.
5. Ensure your PC running the streaming server is on the same local network (Wi-Fi/Ethernet) and update `ps4/soulima.conf` with your PC's IP address.
6. Launch Soulima directly from the PS4 home screen!

---

## 7. Immediate Next Steps for Next Agent / CLI

1. **Run Local Dev Servers & Playwright Tests:**
   Execute `npm run dev` and run end-to-end user simulation tests to verify streaming, seeking, and subtitles on the PC.
2. **Complete OpenOrbis Toolchain Install:**
   Verify `clang` and `ld.lld` binary links in `/home/abdelkarim/llvm18` and `OpenOrbis/PS4Toolchain` in `/home/abdelkarim/openorbis`.
3. **Compile `eboot.bin`:**
   Execute build inside `ps4/src/Makefile` to produce `eboot.bin`.
4. **Package `Soulima.pkg`:**
   Generate `.gp4` descriptor and run `orbis-pub-cmd` or `LibOrbisPkg` to emit the final PKG in `ps4/dist/`.
