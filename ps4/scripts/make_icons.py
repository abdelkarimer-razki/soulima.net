#!/usr/bin/env python3
"""
make_icons.py — Generate PS4 icon0.png (512x512) and pic1.png (1920x1080)
from the existing Soulima logo.
"""

import os
import sys
from PIL import Image, ImageOps

ROOT    = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCE_SYS = os.path.join(ROOT, "sce_sys")
LOGO_SRC = "/home/abdelkarim/Desktop/karim/labs/soulima.net/docs/assets/soulimaWhiteLogo.png"

os.makedirs(SCE_SYS, exist_ok=True)

def composite_on_black(logo: Image.Image, canvas_w: int, canvas_h: int,
                       logo_max_w: int, logo_max_h: int) -> Image.Image:
    """Resize logo to fit within logo_max dimensions, centre on black canvas."""
    logo = logo.convert("RGBA")
    logo.thumbnail((logo_max_w, logo_max_h), Image.LANCZOS)

    canvas = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 255))
    x = (canvas_w - logo.width)  // 2
    y = (canvas_h - logo.height) // 2
    canvas.paste(logo, (x, y), logo)
    return canvas.convert("RGB")


# ------------------------------------------------------------------
# icon0.png  512x512
# ------------------------------------------------------------------
logo = Image.open(LOGO_SRC)
icon = composite_on_black(logo, 512, 512, 512, 512)
icon.save(os.path.join(SCE_SYS, "icon0.png"))
print(f"[make_icons] icon0.png  {icon.size}")

# ------------------------------------------------------------------
# pic1.png  1920x1080
# ------------------------------------------------------------------
logo = Image.open(LOGO_SRC)
pic1 = composite_on_black(logo, 1920, 1080, 960, 540)
pic1.save(os.path.join(SCE_SYS, "pic1.png"))
print(f"[make_icons] pic1.png   {pic1.size}")

print("[make_icons] Done.")
