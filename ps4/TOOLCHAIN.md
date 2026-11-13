# OpenOrbis PS4 Toolchain Setup & Reference

This document describes the OpenOrbis PS4 toolchain installation, environment configuration, compilation flags, and FSELF packaging steps for the Soulima PS4 Homebrew project.

---

## 1. Installation Overview

The toolchain consists of the OpenOrbis SDK (headers, libraries, stubs, and ELF tools) paired with LLVM/Clang targeting FreeBSD / PS4:

| Component | Path | Version / Description |
|---|---|---|
| **OpenOrbis Toolchain** | `~/openorbis/OpenOrbis/PS4Toolchain` | v0.5.4 |
| **LLVM Clang & LLD** | `~/local-llvm/bin` | LLVM 21.1.8 (`clang`, `clang++`, `ld.lld`, `lld`) |
| **SDK Binaries** | `~/openorbis/OpenOrbis/PS4Toolchain/bin/linux` | `create-fself`, `create-gp4`, `readoelf`, `PkgTool.Core` |
| **Helper Symlinks** | `~/openorbis/OpenOrbis/PS4Toolchain/bin/` | Unified PATH containing `clang`, `ld.lld`, and OpenOrbis tools |

---

## 2. Environment Setup

Source the environment file before running any build commands:

```bash
source ps4/env.sh
```

Or set the variables manually:

```bash
export OO_PS4_TOOLCHAIN="$HOME/openorbis/OpenOrbis/PS4Toolchain"
export LLVM_BIN="$HOME/local-llvm/bin"
export PATH="$OO_PS4_TOOLCHAIN/bin:$OO_PS4_TOOLCHAIN/bin/linux:$LLVM_BIN:$PATH"
export DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=1
```

> **Note on `DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=1`**:  
> Required for `PkgTool.Core` (a .NET Core binary) on Linux when ICU packages are invariant.

---

## 3. Exact Compiler & Linker Commands

### Step 3.1: Compile C/C++ Source to Object File

The PS4 runs OrbisOS (based on FreeBSD 9/12). Clang targets the FreeBSD 12 ELF ABI with PIC:

```bash
clang --target=x86_64-pc-freebsd12-elf \
  -fPIC \
  -funwind-tables \
  -c \
  -O2 \
  -std=c11 \
  -DSOULIMA_URL=\"http://192.168.1.100:3030\" \
  -isysroot "$OO_PS4_TOOLCHAIN" \
  -isystem "$OO_PS4_TOOLCHAIN/include" \
  -o ps4/build/main.o ps4/src/main.c
```

### Step 3.2: Link into PS4 PIE ELF (`eboot.elf`)

Link using `ld.lld` with OpenOrbis link script `link.x`, CRT startup object `crt1.o`, and system stubs:

```bash
ld.lld -m elf_x86_64 \
  -pie \
  --script "$OO_PS4_TOOLCHAIN/link.x" \
  --eh-frame-hdr \
  -L"$OO_PS4_TOOLCHAIN/lib" \
  "$OO_PS4_TOOLCHAIN/lib/crt1.o" \
  ps4/build/main.o \
  -lc -lkernel -lSceSystemService \
  -o ps4/build/eboot.elf
```

Key libraries:
- `-lc`: C standard library stubs
- `-lkernel`: Orbis kernel syscall stubs
- `-lSceSystemService`: Web browser and splash screen APIs (`sceSystemServiceLaunchWebBrowser`, `sceSystemServiceHideSplashScreen`)

---

## 4. Fake Signed ELF (FSELF) Generation

Jailbroken PS4 systems running GoldHEN/Mira require executables signed as Fake SELFs (FSELF).  
OpenOrbis provides `create-fself` to convert the ELF into a signed `eboot.bin`:

```bash
create-fself \
  -in ps4/build/eboot.elf \
  -out ps4/build/eboot.oelf \
  --eboot ps4/build/eboot.bin \
  --paid 0x3800000000000011
```

Verification:
- The resulting `eboot.bin` starts with Sony SCE SELF header magic: `0x1D3D154F` (`4f 15 3d 1d` in little-endian hex).
- File command identifies it as `data`.

---

## 5. Automated Build

To compile and produce `ps4/build/eboot.bin` in one step:

```bash
cd ps4/src
make clean && make
```
