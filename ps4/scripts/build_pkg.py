#!/usr/bin/env python3
"""
build_pkg.py — Automated PS4 Homebrew PKG Assembler for Soulima

This script:
1. Validates all required build artifacts (param.sfo, icon0.png, pic1.png, eboot.bin)
2. Stages the package layout
3. Generates project.gp4 via create-gp4
4. Assembles the Fake PKG (FPKG) using OpenOrbis PkgTool.Core
5. Validates PKG digests, tables, and signatures
6. Outputs ready-to-install Soulima.pkg to ps4/dist/

Title ID:   SOULM0001
Content ID: IV0000-SOULM0001_00-SOULIMA000000000
"""

import os
import sys
import shutil
import subprocess
import struct

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCE_SYS_DIR  = os.path.join(PROJECT_ROOT, "sce_sys")
BUILD_DIR    = os.path.join(PROJECT_ROOT, "build")
DIST_DIR     = os.path.join(PROJECT_ROOT, "dist")
CONF_FILE    = os.path.join(PROJECT_ROOT, "soulima.conf")

CONTENT_ID   = "IV0000-SOULM0001_00-SOULIMA000000000"
FINAL_PKG    = os.path.join(DIST_DIR, "Soulima.pkg")

def check_file(path, desc):
    if not os.path.isfile(path):
        print(f"[ERROR] Required file missing: {desc} ({path})", file=sys.stderr)
        return False
    size = os.path.getsize(path)
    if size == 0:
        print(f"[ERROR] Required file is empty: {desc} ({path})", file=sys.stderr)
        return False
    return True

def verify_png(path, expected_w, expected_h):
    with open(path, "rb") as f:
        header = f.read(24)
    if len(header) < 24 or header[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError(f"Not a valid PNG file: {path}")
    w, h = struct.unpack(">II", header[16:24])
    if (w, h) != (expected_w, expected_h):
        raise ValueError(f"PNG dimension mismatch for {path}: expected {expected_w}x{expected_h}, got {w}x{h}")

def verify_sfo(path):
    with open(path, "rb") as f:
        magic = f.read(4)
    if magic != b"\x00PSF":
        raise ValueError(f"Invalid SFO magic in {path}: expected \\x00PSF, got {magic}")

def verify_eboot(path):
    with open(path, "rb") as f:
        magic = f.read(4)
    # 0x1D3D154F is PS4 FSELF/SELF magic (little-endian: 4f 15 3d 1d)
    # 0x7F454C46 is ELF magic (\x7fELF)
    if magic not in (b"\x4f\x15\x3d\x1d", b"\x7fELF"):
        raise ValueError(f"Invalid eboot magic in {path}: {magic.hex()}")

def setup_env():
    env = os.environ.copy()
    home = os.path.expanduser("~")
    oo_toolchain = env.get("OO_PS4_TOOLCHAIN", os.path.join(home, "openorbis/OpenOrbis/PS4Toolchain"))
    llvm_bin = env.get("LLVM_BIN", os.path.join(home, "local-llvm/bin"))
    
    env["OO_PS4_TOOLCHAIN"] = oo_toolchain
    env["DOTNET_SYSTEM_GLOBALIZATION_INVARIANT"] = "1"
    
    bin_dirs = [
        os.path.join(oo_toolchain, "bin"),
        os.path.join(oo_toolchain, "bin/linux"),
        llvm_bin,
    ]
    cur_path = env.get("PATH", "")
    env["PATH"] = ":".join(bin_dirs) + ":" + cur_path
    
    lib_dirs = [
        os.path.join(oo_toolchain, "lib/host"),
        os.path.join(oo_toolchain, "bin/linux"),
    ]
    cur_ld = env.get("LD_LIBRARY_PATH", "")
    env["LD_LIBRARY_PATH"] = ":".join(lib_dirs) + ((":" + cur_ld) if cur_ld else "")
    return env

def find_tool(name, env):
    for p in env.get("PATH", "").split(":"):
        cand = os.path.join(p, name)
        if os.path.isfile(cand) and os.access(cand, os.X_OK):
            return cand
    return shutil.which(name)

def build():
    print("=" * 60)
    print(" Soulima PS4 PKG Assembler")
    print("=" * 60)
    
    sfo_path   = os.path.join(SCE_SYS_DIR, "param.sfo")
    icon0_path = os.path.join(SCE_SYS_DIR, "icon0.png")
    pic1_path  = os.path.join(SCE_SYS_DIR, "pic1.png")
    right_path = os.path.join(SCE_SYS_DIR, "about", "right.sprx")
    eboot_path = os.path.join(BUILD_DIR, "eboot.bin")
    
    # 1. Verification
    print("[1/5] Verifying input artifacts...")
    assert check_file(sfo_path, "param.sfo"), "Missing param.sfo"
    assert check_file(icon0_path, "icon0.png"), "Missing icon0.png"
    assert check_file(pic1_path, "pic1.png"), "Missing pic1.png"
    assert check_file(right_path, "right.sprx"), "Missing sce_sys/about/right.sprx"
    assert check_file(eboot_path, "eboot.bin"), "Missing eboot.bin"
    
    verify_sfo(sfo_path)
    print("  -> param.sfo magic verified (\\x00PSF)")
    verify_png(icon0_path, 512, 512)
    print("  -> icon0.png verified (512x512 PNG)")
    verify_png(pic1_path, 1920, 1080)
    print("  -> pic1.png verified (1920x1080 PNG)")
    verify_eboot(eboot_path)
    print("  -> eboot.bin verified (valid FSELF/ELF)")
    print("  -> right.sprx verified (rights module)")
    
    # 2. Stage files
    staging_dir = os.path.join(BUILD_DIR, "pkg_staging")
    if os.path.exists(staging_dir):
        shutil.rmtree(staging_dir)
    os.makedirs(os.path.join(staging_dir, "sce_sys", "about"), exist_ok=True)
    
    shutil.copy2(eboot_path, os.path.join(staging_dir, "eboot.bin"))
    shutil.copy2(sfo_path, os.path.join(staging_dir, "sce_sys", "param.sfo"))
    shutil.copy2(icon0_path, os.path.join(staging_dir, "sce_sys", "icon0.png"))
    shutil.copy2(pic1_path, os.path.join(staging_dir, "sce_sys", "pic1.png"))
    shutil.copy2(right_path, os.path.join(staging_dir, "sce_sys", "about", "right.sprx"))
    if os.path.isfile(CONF_FILE):
        shutil.copy2(CONF_FILE, os.path.join(staging_dir, "soulima.conf"))
        
    print("[2/5] Staging files prepared in", staging_dir)
    
    # 3. Environment & Tools
    env = setup_env()
    create_gp4 = find_tool("create-gp4", env)
    pkg_tool   = find_tool("PkgTool.Core", env)
    
    if not create_gp4 or not pkg_tool:
        raise RuntimeError(f"Missing build tools: create-gp4={create_gp4}, PkgTool.Core={pkg_tool}")
        
    # 4. Create GP4 project
    print("[3/5] Generating GP4 project descriptor...")
    gp4_path = os.path.join(staging_dir, "project.gp4")
    files_to_pack = "eboot.bin sce_sys/about/right.sprx sce_sys/param.sfo sce_sys/icon0.png sce_sys/pic1.png"
    if os.path.isfile(CONF_FILE):
        files_to_pack += " soulima.conf"
        
    gp4_cmd = [
        create_gp4,
        "-out", gp4_path,
        f"--content-id={CONTENT_ID}",
        f"--files={files_to_pack}"
    ]
    res = subprocess.run(gp4_cmd, cwd=staging_dir, env=env, capture_output=True, text=True)
    if res.returncode != 0:
        print(res.stderr)
        raise RuntimeError(f"create-gp4 failed with exit code {res.returncode}")
    print("  -> project.gp4 created successfully")
    
    # 5. Build PKG
    print("[4/5] Building Fake PKG via PkgTool.Core...")
    os.makedirs(DIST_DIR, exist_ok=True)
    build_cmd = [pkg_tool, "pkg_build", gp4_path, DIST_DIR]
    res = subprocess.run(build_cmd, cwd=staging_dir, env=env, capture_output=True, text=True)
    if res.returncode != 0:
        print(res.stdout)
        print(res.stderr)
        raise RuntimeError(f"PkgTool.Core pkg_build failed with code {res.returncode}")
    print("  -> PKG built successfully!")
    
    # Identify built file
    raw_pkg_name = f"{CONTENT_ID}.pkg"
    raw_pkg_path = os.path.join(DIST_DIR, raw_pkg_name)
    if not os.path.isfile(raw_pkg_path):
        raise RuntimeError(f"Expected output PKG not found: {raw_pkg_path}")
        
    # Copy to Soulima.pkg
    shutil.copy2(raw_pkg_path, FINAL_PKG)
    pkg_size = os.path.getsize(FINAL_PKG)
    print(f"  -> {FINAL_PKG} ready ({pkg_size:,} bytes, {pkg_size / (1024*1024):.2f} MB)")
    
    # 6. Validate PKG
    print("[5/5] Validating PKG structure and signatures...")
    val_cmd = [pkg_tool, "pkg_validate", FINAL_PKG]
    res = subprocess.run(val_cmd, env=env, capture_output=True, text=True)
    if res.returncode != 0:
        print(res.stdout)
        print(res.stderr)
        raise RuntimeError(f"PKG validation failed with code {res.returncode}")
    print("  -> All PKG digests, tables, and signatures VALID [OK]")
    
    print("=" * 60)
    print(f"SUCCESS: Package assembled at {FINAL_PKG}")
    print("=" * 60)
    return FINAL_PKG

if __name__ == "__main__":
    try:
        build()
    except Exception as e:
        print(f"[FATAL] {e}", file=sys.stderr)
        sys.exit(1)
