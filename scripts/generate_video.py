import os
import sys
import math
import subprocess
from PIL import Image, ImageDraw, ImageFont, ImageFilter

WIDTH = 1920
HEIGHT = 1080
FPS = 30
TOTAL_DURATION = 48.0
TOTAL_FRAMES = int(TOTAL_DURATION * FPS)

FONT_BOLD_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_REG_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"

def get_fonts():
    return {
        "hero_title": ImageFont.truetype(FONT_BOLD_PATH, 72),
        "scene_title": ImageFont.truetype(FONT_BOLD_PATH, 52),
        "scene_sub": ImageFont.truetype(FONT_REG_PATH, 26),
        "h2": ImageFont.truetype(FONT_BOLD_PATH, 34),
        "body": ImageFont.truetype(FONT_REG_PATH, 22),
        "body_bold": ImageFont.truetype(FONT_BOLD_PATH, 22),
        "small": ImageFont.truetype(FONT_REG_PATH, 18),
        "small_bold": ImageFont.truetype(FONT_BOLD_PATH, 18),
        "badge": ImageFont.truetype(FONT_BOLD_PATH, 16),
        "code": ImageFont.truetype(FONT_BOLD_PATH, 20),
    }

FONTS = get_fonts()

# Load and prepare image assets
def load_assets():
    assets = {}
    
    # Logo
    logo_path = "src/assets/soulimaWhiteLogo.png"
    if os.path.exists(logo_path):
        im = Image.open(logo_path).convert("RGBA")
        assets["logo_large"] = im.resize((160, 160), Image.Resampling.LANCZOS)
        assets["logo_small"] = im.resize((60, 60), Image.Resampling.LANCZOS)
    else:
        assets["logo_large"] = None
        assets["logo_small"] = None
        
    # Posters
    poster_files = [
        ("dune2", "assets/dune2.jpg", "Dune: Part Two", "4K UHD • 18.2 GB", "84 Seeds"),
        ("inception", "assets/inception.jpg", "Inception", "1080p Remux • 12.4 GB", "142 Seeds"),
        ("interstellar", "assets/interstellar.jpg", "Interstellar", "IMAX • 22.1 GB", "210 Seeds"),
        ("darkknight", "assets/darkknight.jpg", "The Dark Knight", "4K HDR • 16.8 GB", "95 Seeds"),
    ]
    posters = []
    for key, path, title, specs, seeds in poster_files:
        if os.path.exists(path):
            p_img = Image.open(path).convert("RGB")
            p_resized = p_img.resize((260, 390), Image.Resampling.LANCZOS)
            posters.append({
                "key": key,
                "image": p_resized,
                "title": title,
                "specs": specs,
                "seeds": seeds
            })
    assets["posters"] = posters
    
    # Backdrop
    bg_path = "assets/backdrop_default.jpg"
    if os.path.exists(bg_path):
        bg = Image.open(bg_path).convert("RGB").resize((WIDTH, HEIGHT), Image.Resampling.LANCZOS)
        # Darken backdrop for high contrast
        dark_overlay = Image.new("RGB", (WIDTH, HEIGHT), (10, 14, 22))
        assets["backdrop"] = Image.blend(dark_overlay, bg, 0.18)
    else:
        assets["backdrop"] = Image.new("RGB", (WIDTH, HEIGHT), (11, 15, 23))
        
    return assets

ASSETS = load_assets()

# Pre-render base background grid
def create_base_canvas():
    base = ASSETS["backdrop"].copy()
    draw = ImageDraw.Draw(base, "RGBA")
    
    # Subtle cyber grid lines
    grid_color = (255, 255, 255, 8)
    for x in range(0, WIDTH, 80):
        draw.line([(x, 0), (x, HEIGHT)], fill=grid_color, width=1)
    for y in range(0, HEIGHT, 80):
        draw.line([(0, y), (WIDTH, y)], fill=grid_color, width=1)
        
    # Top radial glow (subtle blue/cyan)
    glow = Image.new("RGBA", (WIDTH, 400), (0, 150, 255, 0))
    gdraw = ImageDraw.Draw(glow)
    for r in range(350, 0, -20):
        alpha = int((1.0 - r / 350.0) * 18)
        gdraw.ellipse([WIDTH//2 - r*2, -150 - r, WIDTH//2 + r*2, 200 + r], fill=(0, 200, 255, alpha))
    base.paste(glow, (0, 0), glow)
    
    return base

BASE_CANVAS = create_base_canvas()

def draw_badge(draw, x, y, text, bg_color=(20, 30, 48), fg_color=(0, 229, 255), border_color=(0, 200, 255, 120), font=FONTS["badge"], pad_x=14, pad_y=6):
    bbox = font.getbbox(text)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    w = tw + pad_x * 2
    h = th + pad_y * 2
    
    # Background rounded rect
    draw.rounded_rectangle([x, y, x + w, y + h], radius=h//2, fill=bg_color, outline=border_color, width=1)
    draw.text((x + pad_x, y + pad_y - 1), text, font=font, fill=fg_color)
    return w, h

def draw_header(draw):
    # Top header branding
    if ASSETS["logo_small"]:
        draw._image.paste(ASSETS["logo_small"], (60, 32), ASSETS["logo_small"])
        draw.text((130, 42), "SOULIMA", font=FONTS["h2"], fill=(255, 255, 255))
        draw.text((295, 52), "•  P2P STREAMING ARCHITECTURE", font=FONTS["small_bold"], fill=(0, 229, 255))
    else:
        draw.text((60, 42), "SOULIMA", font=FONTS["h2"], fill=(255, 255, 255))
        
    draw_badge(draw, WIDTH - 260, 40, "COMMERCIAL GRADE", bg_color=(16, 185, 129, 30), fg_color=(52, 211, 153), border_color=(16, 185, 129, 100))
    draw_badge(draw, WIDTH - 420, 40, "v2.4 STABLE", bg_color=(245, 158, 11, 30), fg_color=(251, 191, 36), border_color=(245, 158, 11, 100))

def draw_footer_progress(draw, current_time, total_time):
    # Glowing progress bar at bottom
    bar_y = HEIGHT - 22
    bar_h = 6
    progress = min(1.0, max(0.0, current_time / total_time))
    
    draw.rectangle([0, bar_y, WIDTH, bar_y + bar_h], fill=(20, 26, 38))
    pw = int(WIDTH * progress)
    if pw > 0:
        draw.rectangle([0, bar_y, pw, bar_y + bar_h], fill=(0, 229, 255))
        # Head glow dot
        draw.ellipse([pw - 8, bar_y - 4, pw + 8, bar_y + bar_h + 4], fill=(255, 255, 255))
        
    # Time counter
    cur_m = int(current_time) // 60
    cur_s = int(current_time) % 60
    tot_m = int(total_time) // 60
    tot_s = int(total_time) % 60
    t_str = f"{cur_m:02d}:{cur_s:02d} / {tot_m:02d}:{tot_s:02d}"
    draw.text((WIDTH - 150, HEIGHT - 52), t_str, font=FONTS["small"], fill=(156, 163, 175))
    draw.text((60, HEIGHT - 52), "github.com/soulima  •  Angular 16 • WebTorrent • FFmpeg • C++17", font=FONTS["small"], fill=(100, 116, 139))


# ---------------- SCENE RENDERERS ----------------

def render_scene_1(draw, frame_img, t_rel):
    # SCENE 1: HERO / HOOK (0.0s - 7.5s)
    # Fast fade-in
    alpha_factor = min(1.0, t_rel / 0.8)
    
    # Center Hero Box
    center_y = 480
    if ASSETS["logo_large"]:
        # Floating gentle bob
        bob = int(math.sin(t_rel * 2.5) * 6)
        logo_x = WIDTH // 2 - 80
        logo_y = 180 + bob
        frame_img.paste(ASSETS["logo_large"], (logo_x, logo_y), ASSETS["logo_large"])
        
    title_text = "SOULIMA  (سوليما)"
    draw.text((WIDTH//2 - 340, 360), title_text, font=FONTS["hero_title"], fill=(255, 255, 255))
    
    tagline = "Commercial-Grade Peer-to-Peer Media Streaming Platform"
    draw.text((WIDTH//2 - 390, 455), tagline, font=FONTS["h2"], fill=(0, 229, 255))
    
    # Hook Card
    card_w = 1200
    card_h = 170
    card_x = (WIDTH - card_w) // 2
    card_y = 530
    draw.rounded_rectangle([card_x, card_y, card_x + card_w, card_y + card_h], radius=16, fill=(16, 22, 34, 230), outline=(37, 99, 235, 120), width=2)
    
    hook_title = "Instant 4K Video On Demand — Directly from BitTorrent Swarms"
    draw.text((card_x + 60, card_y + 35), hook_title, font=FONTS["h2"], fill=(248, 250, 252))
    
    hook_desc = "Zero cloud storage. Zero download waiting. Playback starts in under 2 seconds."
    draw.text((card_x + 60, card_y + 95), hook_desc, font=FONTS["scene_sub"], fill=(148, 163, 184))
    
    # Badges along bottom of scene 1
    badges = [
        ("⚡ < 2s First Frame", (16, 185, 129), (6, 78, 59)),
        ("🌐 Angular 16 Cinema UI", (59, 130, 246), (30, 58, 138)),
        ("⚙️ FFmpeg On-the-Fly Remux", (168, 85, 247), (88, 28, 135)),
        ("📺 Smart TV & Mobile PWA", (245, 158, 11), (120, 53, 15)),
        ("📦 100% Open Source", (14, 165, 233), (12, 74, 110))
    ]
    bx = (WIDTH - 1200) // 2
    by = 740
    for text, fg, bg in badges:
        bw, bh = draw_badge(draw, bx, by, text, bg_color=bg, fg_color=fg, border_color=fg, font=FONTS["body_bold"], pad_x=20, pad_y=12)
        bx += bw + 20


def render_scene_2(draw, frame_img, t_rel):
    # SCENE 2: CINEMA EXPERIENCE & MULTI-SOURCE SCRAPER (7.5s - 16.0s)
    draw_header(draw)
    
    # Section Header
    draw.text((60, 110), "The Cinema Experience & Multi-Source Engine", font=FONTS["scene_title"], fill=(255, 255, 255))
    draw.text((60, 175), "Aggregates swarms across Torrentio, YTS, PirateBay & BitSearch with auto-aligned subtitles", font=FONTS["scene_sub"], fill=(148, 163, 184))
    
    # 4 Movie Posters Grid
    posters = ASSETS.get("posters", [])
    start_x = 60
    card_w = 260
    card_h = 390
    spacing = 38
    py = 240
    
    for i, p in enumerate(posters):
        px = start_x + i * (card_w + spacing)
        # Gentle staggered slide up
        slide_offset = max(0, int((1.0 - min(1.0, (t_rel - i * 0.15) / 0.5)) * 30))
        cur_py = py + slide_offset
        
        # Poster Card Outline
        draw.rounded_rectangle([px - 4, cur_py - 4, px + card_w + 4, cur_py + card_h + 90], radius=14, fill=(18, 24, 38), outline=(51, 65, 85), width=2)
        # Paste Poster Image
        frame_img.paste(p["image"], (px, cur_py))
        
        # Movie Info Box
        draw.text((px + 10, cur_py + card_h + 12), p["title"], font=FONTS["body_bold"], fill=(255, 255, 255))
        draw.text((px + 10, cur_py + card_h + 38), p["specs"], font=FONTS["small"], fill=(0, 229, 255))
        
        # Seed count badge
        draw_badge(draw, px + 10, cur_py + card_h + 62, f"● {p['seeds']}", bg_color=(6, 78, 59), fg_color=(52, 211, 153), border_color=(16, 185, 129), font=FONTS["badge"], pad_x=10, pad_y=4)
        draw_badge(draw, px + 140, cur_py + card_h + 62, "INSTANT PLAY", bg_color=(30, 58, 138), fg_color=(147, 197, 253), border_color=(59, 130, 246), font=FONTS["badge"], pad_x=10, pad_y=4)
        
    # Feature Bullet Card on the right
    fx = start_x + 4 * (card_w + spacing) + 10
    fw = WIDTH - fx - 60
    fy = 240
    fh = 480
    draw.rounded_rectangle([fx, fy, fx + fw, fy + fh], radius=16, fill=(15, 23, 42, 240), outline=(59, 130, 246, 140), width=2)
    
    draw.text((fx + 30, fy + 35), "Engine Capabilities", font=FONTS["h2"], fill=(248, 250, 252))
    
    bullets = [
        ("Multi-Source Scraping", "Auto-fetches highest seeded 4K/1080p magnets from 4 distinct tracker networks."),
        ("ffsubsync Alignment", "Subtitles automatically synchronized against video audio tracks to fix drift."),
        ("Predictive Prefetching", "Background-warms next episode swarm for sub-second transition latency."),
        ("Adaptive Failover", "Fails over to alternate releases in < 6.5s if a swarm becomes unseeded."),
    ]
    
    by = fy + 95
    for title, desc in bullets:
        draw.ellipse([fx + 30, by + 4, fx + 42, by + 16], fill=(0, 229, 255))
        draw.text((fx + 55, by), title, font=FONTS["body_bold"], fill=(0, 229, 255))
        # Word wrap desc
        draw.text((fx + 55, by + 28), desc[:48], font=FONTS["small"], fill=(203, 213, 225))
        if len(desc) > 48:
            draw.text((fx + 55, by + 50), desc[48:96], font=FONTS["small"], fill=(203, 213, 225))
        by += 85


def render_scene_3(draw, frame_img, t_rel):
    # SCENE 3: DEEP TECH: INSTANT TIME-TO-FIRST-FRAME (16.0s - 26.0s)
    draw_header(draw)
    
    draw.text((60, 110), "Deep Tech: Instant Time-To-First-Frame (TTFF)", font=FONTS["scene_title"], fill=(255, 255, 255))
    draw.text((60, 175), "Sequential piece prioritization bypasses standard BitTorrent random block delivery", font=FONTS["scene_sub"], fill=(148, 163, 184))
    
    # Left Column: The Problem vs Solution Flow
    col_w = 860
    col_h = 490
    cx = 60
    cy = 240
    draw.rounded_rectangle([cx, cy, cx + col_w, cy + col_h], radius=16, fill=(15, 23, 42, 240), outline=(59, 130, 246, 120), width=2)
    
    draw.text((cx + 40, cy + 30), "Sequential Swarm Prioritization Pipeline", font=FONTS["h2"], fill=(255, 255, 255))
    
    steps = [
        ("1. Magnet Ingestion & Tracker Injection", "Enriches raw info-hash with 20+ WebSocket & UDP bootstrap trackers for instant peer discovery."),
        ("2. Metadata & Container Header Prioritization", "Prioritizes byte ranges 0..N immediately to parse moov atom (MP4) and seekheads (Matroska/MKV)."),
        ("3. Sliding Sequential Playback Window", "Locks high priority on active playback pieces; downloads audio & video tracks in linear streaming order."),
        ("4. Trailing Index Atom Pre-fetching", "Fetches trailing index cues before full payload to prepare HTML5 seek table and subtitle tracks.")
    ]
    
    sy = cy + 90
    for num_title, desc in steps:
        draw.rounded_rectangle([cx + 35, sy, cx + col_w - 35, sy + 75], radius=10, fill=(24, 34, 54), outline=(51, 65, 85), width=1)
        draw.text((cx + 55, sy + 14), num_title, font=FONTS["body_bold"], fill=(0, 229, 255))
        draw.text((cx + 55, sy + 42), desc[:78], font=FONTS["small"], fill=(203, 213, 225))
        sy += 92
        
    # Right Column: Animated Live Swarm Telemetry Box
    rx = cx + col_w + 40
    rw = WIDTH - rx - 60
    rh = col_h
    draw.rounded_rectangle([rx, rh_y := cy, rx + rw, cy + rh], radius=16, fill=(10, 16, 28, 250), outline=(16, 185, 129, 140), width=2)
    
    draw.text((rx + 35, rh_y + 30), "Live Swarm Telemetry", font=FONTS["h2"], fill=(52, 211, 153))
    
    # Animated metrics based on t_rel
    time_val = min(1.84, 0.4 + t_rel * 0.4)
    speed_val = min(34.8, 12.0 + t_rel * 2.8)
    peers_val = min(68, int(15 + t_rel * 6))
    
    metrics = [
        ("Time-To-First-Frame", f"{time_val:.2f} s", (52, 211, 153)),
        ("Connected Peers", f"{peers_val} Peers", (0, 229, 255)),
        ("Swarm Transfer Rate", f"{speed_val:.1f} MB/s", (245, 158, 11)),
        ("Stream Health", "99.8% Healthy", (168, 85, 247)),
        ("Container Remuxing", "H.264 Direct Passthrough", (248, 250, 252)),
    ]
    
    my = rh_y + 90
    for label, val, color in metrics:
        draw.text((rx + 35, my), label, font=FONTS["small"], fill=(148, 163, 184))
        draw.text((rx + 35, my + 24), val, font=FONTS["h2"], fill=color)
        draw.line([(rx + 35, my + 68), (rx + rw - 35, my + 68)], fill=(30, 41, 59), width=1)
        my += 78


def render_scene_4(draw, frame_img, t_rel):
    # SCENE 4: SOLVING THE FRAGMENTED MP4 SEEKING PROBLEM (26.0s - 36.0s)
    draw_header(draw)
    
    draw.text((60, 110), "The Breakthrough: Solving Fragmented MP4 Seeking", font=FONTS["scene_title"], fill=(255, 255, 255))
    draw.text((60, 175), "Piped fragmented MP4 streams normally cannot seek. Here is how Soulima solved it.", font=FONTS["scene_sub"], fill=(148, 163, 184))
    
    # Left Card: The Problem (Red/Amber Warning)
    card_w = 860
    card_h = 490
    px = 60
    py = 240
    draw.rounded_rectangle([px, py, px + card_w, py + card_h], radius=16, fill=(28, 15, 18, 240), outline=(239, 68, 68, 140), width=2)
    
    draw_badge(draw, px + 35, py + 30, "THE CORE PROBLEM", bg_color=(127, 29, 29), fg_color=(254, 202, 202), border_color=(239, 68, 68), font=FONTS["small_bold"])
    draw.text((px + 35, py + 75), "Why Browser Torrent Players Fail at Seeking:", font=FONTS["h2"], fill=(254, 226, 226))
    
    prob_bullets = [
        ("• Fragmented MP4 (fMP4) piped via HTTP stdin lacks a continuous byte index.", (252, 165, 165)),
        ("• Scrubbing on standard HTML5 players resets currentTime back to 00:00.", (252, 165, 165)),
        ("• Unsupported audio codecs (AC3, DTS, EAC3) result in completely silent playback.", (252, 165, 165)),
        ("• Heavy 4K transcoding overwhelms typical self-hosted server CPUs.", (252, 165, 165)),
    ]
    pby = py + 140
    for ptext, pcol in prob_bullets:
        draw.text((px + 35, pby), ptext, font=FONTS["body"], fill=pcol)
        pby += 44
        
    # Code snippet highlight
    code_bg = (15, 10, 12)
    draw.rounded_rectangle([px + 35, py + 335, px + card_w - 35, py + 455], radius=10, fill=code_bg, outline=(153, 27, 27), width=1)
    draw.text((px + 50, py + 350), "// Standard Stdin Pipeline: Fails Seek Forward", font=FONTS["code"], fill=(248, 113, 113))
    draw.text((px + 50, py + 385), "ffmpeg -i pipe:0 ... -> currentTime = 00:00 (RESET BUG!)", font=FONTS["code"], fill=(239, 68, 68))
    draw.text((px + 50, py + 415), "video.currentTime = 1200; // Clamped to 0 by browser demuxer", font=FONTS["code"], fill=(156, 163, 175))
    
    # Right Card: The Soulima Solution (Cyan / Emerald)
    sx = px + card_w + 40
    sw = WIDTH - sx - 60
    sh = card_h
    draw.rounded_rectangle([sx, sy := py, sx + sw, sy + sh], radius=16, fill=(10, 24, 28, 250), outline=(16, 185, 129, 160), width=2)
    
    draw_badge(draw, sx + 35, sy + 30, "THE SOULIMA ARCHITECTURE", bg_color=(6, 78, 59), fg_color=(52, 211, 153), border_color=(16, 185, 129), font=FONTS["small_bold"])
    draw.text((sx + 35, sy + 75), "The Virtual Continuous Timeline", font=FONTS["h2"], fill=(255, 255, 255))
    
    sol_steps = [
        ("1. HTTP 206 Loopback", "Built /api/raw-stream/:id for internal byte-range seeking."),
        ("2. Smart FFmpeg Pipeline", "Routed demuxing with -seekable 1 -multiple_requests 1."),
        ("3. On-The-Fly Audio Remux", "AC3/DTS auto-downmixed to AAC; H.264 copied with 0% CPU."),
        ("4. Continuous Virtual Clock", "streamStartTime + video.currentTime for seamless scrubbing.")
    ]
    
    sby = sy + 130
    for stitle, sdesc in sol_steps:
        draw.text((sx + 35, sby), stitle, font=FONTS["body_bold"], fill=(0, 229, 255))
        draw.text((sx + 35, sby + 26), sdesc, font=FONTS["small"], fill=(203, 213, 225))
        sby += 64
        
    # Dynamic Scrubbing Demonstration Bar
    draw.rounded_rectangle([sx + 35, sy + 395, sx + sw - 35, sy + 465], radius=10, fill=(16, 36, 42), outline=(16, 185, 129), width=1)
    scrub_t = (t_rel * 12.0) % 100.0
    draw.text((sx + 50, sy + 408), "Timeline Scrub: [ 00:15:30 ] ────► [ 01:24:45 ] (+69 min)", font=FONTS["small_bold"], fill=(52, 211, 153))
    draw.text((sx + 50, sy + 434), "Status: Byte-Offset Locked  •  Buffer Time: 420ms  •  ZERO RESET", font=FONTS["small"], fill=(0, 229, 255))


def render_scene_5(draw, frame_img, t_rel):
    # SCENE 5: CROSS-PLATFORM TRI-ENGINE (36.0s - 43.0s)
    draw_header(draw)
    
    draw.text((60, 110), "One Streaming Core — Three Native Ecosystems", font=FONTS["scene_title"], fill=(255, 255, 255))
    draw.text((60, 175), "Shared high-performance streaming architecture across Web, Desktop, and Smart TVs", font=FONTS["scene_sub"], fill=(148, 163, 184))
    
    card_w = 560
    card_h = 490
    spacing = 50
    start_x = 60
    cy = 240
    
    platforms = [
        {
            "icon": "🌐",
            "name": "Web Cinema Application",
            "stack": "Angular 16 • RxJS • VideoJS HUD",
            "color_fg": (59, 130, 246),
            "color_bg": (15, 23, 42),
            "border": (37, 99, 235),
            "features": [
                "Full Single-Page Application (SPA)",
                "Virtual continuous timeline seeking",
                "Integrated SubDL subtitle downloader",
                "Predictive next-episode prefetching",
                "Universal cross-browser support"
            ]
        },
        {
            "icon": "🖥️",
            "name": "Linux Desktop App",
            "stack": "Electron • Embedded Node • FFmpeg",
            "color_fg": (168, 85, 247),
            "color_bg": (24, 16, 38),
            "border": (147, 51, 234),
            "features": [
                "Self-contained executable bundle",
                "Embedded background streaming engine",
                "Bundled static FFmpeg/FFprobe binaries",
                "System tray lifecycle & native notifications",
                "AppArmor and Wayland/X11 compliant"
            ]
        },
        {
            "icon": "📺",
            "name": "Smart TV & Mobile PWA",
            "stack": "10-Foot D-Pad • Mobile PWA • Angular 16",
            "color_fg": (245, 158, 11),
            "color_bg": (28, 22, 14),
            "border": (217, 119, 6),
            "features": [
                "Full D-Pad remote control spatial navigation",
                "10-Foot cinema UI optimized for living room TVs",
                "Mobile PWA installable with responsive layouts",
                "Predictive episode prefetching & instant play",
                "Universal Smart TV & touch browser support"
            ]
        }
    ]
    
    for i, p in enumerate(platforms):
        cx = start_x + i * (card_w + spacing)
        draw.rounded_rectangle([cx, cy, cx + card_w, cy + card_h], radius=16, fill=p["color_bg"], outline=p["border"], width=2)
        
        # Header Badge
        draw_badge(draw, cx + 30, cy + 30, p["icon"] + "  " + p["name"], bg_color=(20, 28, 45), fg_color=p["color_fg"], border_color=p["border"], font=FONTS["body_bold"], pad_x=16, pad_y=8)
        
        draw.text((cx + 35, cy + 95), p["stack"], font=FONTS["small_bold"], fill=(203, 213, 225))
        draw.line([(cx + 35, cy + 130), (cx + card_w - 35, cy + 130)], fill=(51, 65, 85), width=1)
        
        fy = cy + 155
        for feat in p["features"]:
            draw.ellipse([cx + 35, fy + 4, cx + 45, fy + 14], fill=p["color_fg"])
            draw.text((cx + 58, fy), feat, font=FONTS["body"], fill=(241, 245, 249))
            fy += 56


def render_scene_6(draw, frame_img, t_rel):
    # SCENE 6: OUTRO & CALL TO ACTION (43.0s - 48.0s)
    center_y = HEIGHT // 2
    
    if ASSETS["logo_large"]:
        frame_img.paste(ASSETS["logo_large"], (WIDTH // 2 - 80, 200), ASSETS["logo_large"])
        
    draw.text((WIDTH//2 - 340, 390), "SOULIMA  (سوليما)", font=FONTS["hero_title"], fill=(255, 255, 255))
    draw.text((WIDTH//2 - 360, 480), "Commercial-Grade P2P Media Streaming Platform", font=FONTS["h2"], fill=(0, 229, 255))
    
    # CTA Card
    card_w = 900
    card_h = 160
    card_x = (WIDTH - card_w) // 2
    card_y = 560
    draw.rounded_rectangle([card_x, card_y, card_x + card_w, card_y + card_h], radius=16, fill=(15, 23, 42, 240), outline=(52, 211, 153, 160), width=2)
    
    draw.text((card_x + 50, card_y + 35), "Engineered by Abdelkarim", font=FONTS["h2"], fill=(255, 255, 255))
    draw.text((card_x + 50, card_y + 90), "Read the complete system architecture & source code on GitHub", font=FONTS["scene_sub"], fill=(203, 213, 225))
    
    # Bottom Badges
    b1_x = WIDTH // 2 - 360
    draw_badge(draw, b1_x, 770, "⭐ GitHub Open Source", bg_color=(30, 41, 59), fg_color=(255, 255, 255), border_color=(100, 116, 139), font=FONTS["h2"], pad_x=24, pad_y=12)
    draw_badge(draw, b1_x + 380, 770, "💬 Let's Connect on LinkedIn", bg_color=(30, 58, 138), fg_color=(147, 197, 253), border_color=(59, 130, 246), font=FONTS["h2"], pad_x=24, pad_y=12)


# ---------------- MAIN RENDER PIPELINE ----------------

def render_video(output_mp4="docs/soulima_showcase_linkedin.mp4", soundtrack="docs/soundtrack.wav"):
    os.makedirs(os.path.dirname(output_mp4), exist_ok=True)
    
    # FFmpeg command to receive raw rgb24 frames from stdin and mux with wav audio
    cmd = [
        "ffmpeg", "-y",
        "-f", "rawvideo",
        "-vcodec", "rawvideo",
        "-s", f"{WIDTH}x{HEIGHT}",
        "-pix_fmt", "rgb24",
        "-r", str(FPS),
        "-i", "-", # stdin
        "-i", soundtrack,
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "18",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "192k",
        "-shortest",
        output_mp4
    ]
    
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    
    print(f"Rendering {TOTAL_FRAMES} frames ({TOTAL_DURATION}s @ {FPS}fps) to {output_mp4}...")
    
    # Scene time thresholds
    # S1: 0.0 - 7.5
    # S2: 7.5 - 16.0
    # S3: 16.0 - 26.0
    # S4: 26.0 - 36.0
    # S5: 36.0 - 43.0
    # S6: 43.0 - 48.0
    
    for f in range(TOTAL_FRAMES):
        cur_time = f / FPS
        frame = BASE_CANVAS.copy()
        draw = ImageDraw.Draw(frame, "RGBA")
        
        if cur_time < 7.5:
            render_scene_1(draw, frame, cur_time)
        elif cur_time < 16.0:
            render_scene_2(draw, frame, cur_time - 7.5)
        elif cur_time < 26.0:
            render_scene_3(draw, frame, cur_time - 16.0)
        elif cur_time < 36.0:
            render_scene_4(draw, frame, cur_time - 26.0)
        elif cur_time < 43.0:
            render_scene_5(draw, frame, cur_time - 36.0)
        else:
            render_scene_6(draw, frame, cur_time - 43.0)
            
        draw_footer_progress(draw, cur_time, TOTAL_DURATION)
        
        # Pipe raw RGB bytes
        proc.stdin.write(frame.tobytes())
        
        if f % 150 == 0:
            pct = (f / TOTAL_FRAMES) * 100
            print(f"Render progress: {f}/{TOTAL_FRAMES} frames ({pct:.1f}%)")
            
    proc.stdin.close()
    proc.wait()
    print(f"Video rendering complete: {output_mp4}")

if __name__ == "__main__":
    render_video()
