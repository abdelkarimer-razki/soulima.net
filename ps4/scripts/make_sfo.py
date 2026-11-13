#!/usr/bin/env python3
"""
make_sfo.py — Generate a 100% compliant PS4 param.sfo binary using PkgTool.Core
"""

import os
import sys
import subprocess

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCE_SYS_DIR  = os.path.join(PROJECT_ROOT, "sce_sys")
OUT_SFO      = os.path.join(SCE_SYS_DIR, "param.sfo")

OO_TOOLCHAIN = os.environ.get("OO_PS4_TOOLCHAIN", os.path.expanduser("~/openorbis/OpenOrbis/PS4Toolchain"))
PKG_TOOL     = os.path.join(OO_TOOLCHAIN, "bin/linux/PkgTool.Core")

CONTENT_ID   = "IV0000-SOULM0001_00-SOULIMA000000000"
TITLE_ID     = "SOULM0001"
TITLE        = "Soulima"
VERSION      = "01.00"

def run_cmd(args):
    env = os.environ.copy()
    env["DOTNET_SYSTEM_GLOBALIZATION_INVARIANT"] = "1"
    res = subprocess.run(args, env=env, capture_output=True, text=True)
    if res.returncode != 0:
        print(res.stdout)
        print(res.stderr, file=sys.stderr)
        raise RuntimeError(f"Command failed ({res.returncode}): {' '.join(args)}")

def make_sfo(out_path=OUT_SFO):
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    if os.path.exists(out_path):
        os.remove(out_path)
        
    print(f"[make_sfo] Creating new SFO at {out_path}...")
    run_cmd([PKG_TOOL, "sfo_new", out_path])
    
    entries = [
        ("APP_TYPE", "Integer", "4", "1"),
        ("APP_VER", "Utf8", "8", VERSION),
        ("ATTRIBUTE", "Integer", "4", "0"),
        ("CATEGORY", "Utf8", "4", "gd"),
        ("CONTENT_ID", "Utf8", "48", CONTENT_ID),
        ("DOWNLOAD_DATA_SIZE", "Integer", "4", "0"),
        ("SYSTEM_VER", "Integer", "4", "0"),
        ("TITLE", "Utf8", "128", TITLE),
        ("TITLE_ID", "Utf8", "12", TITLE_ID),
        ("VERSION", "Utf8", "8", VERSION),
    ]
    
    for name, etype, maxsize, val in entries:
        run_cmd([PKG_TOOL, "sfo_setentry", "--type", etype, "--maxsize", maxsize, "--value", val, out_path, name])
        
    print(f"[make_sfo] param.sfo generated successfully ({os.path.getsize(out_path)} bytes)")

if __name__ == "__main__":
    make_sfo()
