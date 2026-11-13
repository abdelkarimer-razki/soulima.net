# Soulima PS4 Native Homebrew Package — Build & Verification Summary

This document provides a comprehensive report of the verification, compilation, packaging, and validation process for the **Soulima PlayStation 4 Native Homebrew Package (`Soulima.pkg`)**.

---

## 1. Project Overview

- **Application Name**: Soulima Cinema
- **Title ID**: `SOUL00001`
- **Content ID**: `IV0000-SOUL00001_00-SOULIMA000000000`
- **Target OS**: Sony OrbisOS (PlayStation 4, Firmwares 5.05 - 11.00+)
- **Environment**: Jailbroken console running GoldHEN / Mira
- **Packaging Format**: Fake PKG (FPKG) container (`0x7F434E54` magic)
- **Application Architecture**: True native C++17 application rendering directly to 1080p display buffers via `libSceVideoOut` direct video memory mapping, fully controlled via DualShock 4 wireless/USB controller (`libScePad`), featuring live streaming server diagnostics, socket pinging, interactive octet IP configuration, and cinema launching. Default target URL: `http://192.168.1.68:3030`.

---

## 2. Artifact Verification

All input components were verified for structural and specification compliance:

| Artifact | Location | Specifications | Verification Status |
|---|---|---|---|
| **SFO Metadata** | `ps4/sce_sys/param.sfo` | SFO v1.1, starts with `\x00PSF` (0x00505346) | **PASS** — Magic verified, contains valid Title ID `SOUL00001`, Title `Soulima`, App Type `Big App`, Version `1.00`. |
| **App Icon** | `ps4/sce_sys/icon0.png` | PNG 512×512, 8-bit RGB | **PASS** — Verified dimensions and format with libpng header parser. |
| **Splash / Background**| `ps4/sce_sys/pic1.png` | PNG 1920×1080, 8-bit RGB | **PASS** — Verified dimensions and format with libpng header parser. |
| **Native Renderer** | `ps4/src/renderer.cpp` | C++17, `libSceVideoOut` double-buffered 1080p ARGB @ 60 FPS | **PASS** — Cleanly compiles targeting `x86_64-pc-freebsd12-elf`. |
| **Controller Manager** | `ps4/src/controller.cpp`| C++17, `libScePad` & `libSceUserService` edge-detection | **PASS** — Cleanly compiles targeting `x86_64-pc-freebsd12-elf`. |
| **Network Manager** | `ps4/src/network.cpp` | C++17, BSD socket ping & latency probe, `/data/soulima.conf` persistence | **PASS** — Cleanly compiles targeting `x86_64-pc-freebsd12-elf`. |
| **Native Dashboard** | `ps4/src/main.cpp` | C++17, Soulima Cinema 1080p TV Dashboard | **PASS** — Cleanly compiles targeting `x86_64-pc-freebsd12-elf`. |
| **Executable Binary** | `ps4/build/eboot.bin` | Orbis FSELF (0x1D3D154F), paid `0x3800000000000011` | **PASS** — Valid Sony FSELF header magic `4f 15 3d 1d`. |
| **Runtime Modules** | `ps4/sce_module/` | `libc.prx`, `libSceFios2.prx` (Orbis PFS runtime) | **PASS** — Included in PFS image to prevent `0x80990055` installation failure. |
| **Runtime Config** | `ps4/soulima.conf` | Target server URL configuration | **PASS** — Bundled into PKG root (`192.168.1.68:3030`). |

---

## 3. Toolchain & Package Assembly Pipeline

The build environment is powered by the OpenOrbis PS4 Toolchain coupled with LLVM Clang 18 & LLD:

1. **Compilation (`ps4/src/Makefile`)**:
   - Compiler: `clang++ --target=x86_64-pc-freebsd12-elf -fPIC -funwind-tables -std=c++17 -O2`
   - Linker: `ld.lld -pie --script $OO_PS4_TOOLCHAIN/link.x` linking `-lc -lkernel -lc++ -lSceVideoOut -lScePad -lSceUserService -lSceSystemService -lSceNet`.
   - FSELF Signing: `create-fself` converts `eboot.elf` into fake-signed `eboot.bin` (`--paid 0x3800000000000011`).

2. **Assembly Pipeline (`ps4/scripts/build_pkg.py`)**:
   - Stages files into `ps4/build/pkg_staging/` (`eboot.bin`, `sce_sys/param.sfo`, `sce_sys/icon0.png`, `sce_sys/pic1.png`, `sce_sys/about/right.sprx`, `sce_module/libc.prx`, `sce_module/libSceFios2.prx`, `soulima.conf`).
   - Generates project descriptor `project.gp4` using `create-gp4`.
   - Packs inner and outer PFS file system images using OpenOrbis `PkgTool.Core pkg_build`.
   - Copies and validates the final deliverable to `ps4/dist/Soulima.pkg`.

---

## 4. Final Deliverable & Validation Results

### Output Deliverables:
- **`ps4/dist/Soulima.pkg`**:
   - File Size: **6,619,136 bytes** (6.31 MB)
   - Magic: `0x7F434E54` (`\x7fCNT`)
- **`ps4/dist/README.txt`**: Complete installation manual for GoldHEN USB and Remote Package Installer.

### Integrity Validation (`PkgTool.Core pkg_validate`):
All 29 digest, table, and signature checks passed with zero errors:
```
[OK]    (Limit) PKG Size @ 0x418
[OK]    (Hash) Content Digest @ 0x2920
[OK]    (Hash) Game Digest @ 0x2940
[OK]    (Hash) Header Digest @ 0x2960
[OK]    (Hash) Major Param Digest @ 0x29A0
[OK]    (Hash) Param Digest @ 0x29C0
[OK]    (Hash) ENTRY_KEYS digest @ 0x2C80
[OK]    (Hash) IMAGE_KEY digest @ 0x2CA0
[OK]    (Hash) GENERAL_DIGESTS digest @ 0x2CC0
[OK]    (Hash) METAS digest @ 0x2CE0
[OK]    (Hash) ENTRY_NAMES digest @ 0x2D00
[OK]    (Hash) LICENSE_DAT digest @ 0x2D20
[OK]    (Hash) LICENSE_INFO digest @ 0x2D40
[OK]    (Hash) PSRESERVED_DAT digest @ 0x2D60
[OK]    (Hash) PARAM_SFO digest @ 0x2D80
[OK]    (Hash) PLAYGO_CHUNK_DAT digest @ 0x2DA0
[OK]    (Hash) PLAYGO_CHUNK_SHA digest @ 0x2DC0
[OK]    (Hash) PLAYGO_MANIFEST_XML digest @ 0x2DE0
[OK]    (Hash) PIC1_PNG digest @ 0x2E00
[OK]    (Hash) ICON0_PNG digest @ 0x2E20
[OK]    (Hash) PFS Signed Digest @ 0x460
[OK]    (Hash) PFS Image Digest @ 0x440
[OK]    (Hash) Body Digest @ 0x160
[OK]    (Hash) Digest Table Hash @ 0x140
[OK]    (Hash) SC Entries Hash 1 @ 0x100
[OK]    (Hash) SC Entries Hash 2 @ 0x120
[OK]    (Hash) PKG Header Digest @ 0xFE0
[OK]    (Signature) PKG Header Signature @ 0x1000
[OK]    (Signature) Debug RIF Signature @ 0x3650
```

---

## 5. Build Automation Quick Reference

From the `ps4/` directory:
- Rebuild everything (SFO, icons, eboot, and PKG):
  ```bash
  make clean && make
  ```
- Build only the PKG:
  ```bash
  make pkg
  ```
- Configure environment manually:
  ```bash
  source env.sh
  ```
