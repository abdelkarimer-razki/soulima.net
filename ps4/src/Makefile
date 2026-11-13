# Soulima PS4 eboot Makefile
# ============================================================
# Builds main.c (or main_full.c) into a PS4-compatible eboot.bin (FSELF)
# using the OpenOrbis PS4 Toolchain.
#
# Usage:
#   make            - build eboot.bin with OpenOrbis
#   make FULL=1     - build main_full.c instead of main.c
#   make stub       - build host-testable stub ELF
#   make clean
# ============================================================

# --- Toolchain detection ------------------------------------------------
OO_PS4_TOOLCHAIN ?= $(shell \
	if [ -n "$$OO_PS4_TOOLCHAIN" ] && [ -d "$$OO_PS4_TOOLCHAIN" ]; then echo "$$OO_PS4_TOOLCHAIN"; \
	elif [ -d "$$HOME/openorbis/OpenOrbis/PS4Toolchain" ]; then echo "$$HOME/openorbis/OpenOrbis/PS4Toolchain"; \
	elif [ -d /opt/openorbis/OpenOrbis/PS4Toolchain ]; then echo /opt/openorbis/OpenOrbis/PS4Toolchain; \
	elif [ -d /opt/openorbis ]; then echo /opt/openorbis; \
	elif [ -d "$$HOME/openorbis" ]; then echo "$$HOME/openorbis"; \
	fi)

LLVM_DIR ?= $(shell \
	if [ -n "$$LLVM_DIR" ] && [ -d "$$LLVM_DIR" ]; then echo "$$LLVM_DIR"; \
	elif [ -d "$$HOME/llvm18/clang+llvm-18.1.8-x86_64-linux-gnu-ubuntu-18.04" ]; then echo "$$HOME/llvm18/clang+llvm-18.1.8-x86_64-linux-gnu-ubuntu-18.04"; \
	fi)

export OO_PS4_TOOLCHAIN
export LD_LIBRARY_PATH := $(HOME)/llvm18/lib:$(LD_LIBRARY_PATH)
HAS_OO := $(shell test -f "$(OO_PS4_TOOLCHAIN)/link.x" && echo yes || echo no)

# Clang / lld executables
ifneq ($(LLVM_DIR),)
	export LD_LIBRARY_PATH := $(HOME)/llvm18/lib:$(LD_LIBRARY_PATH)
	CC  := $(LLVM_DIR)/bin/clang
	LD  := $(LLVM_DIR)/bin/ld.lld
else
	CC  ?= clang
	LD  ?= ld.lld
endif

FSELF := $(shell \
	if [ -x "$(OO_PS4_TOOLCHAIN)/bin/linux/create-fself" ]; then echo "$(OO_PS4_TOOLCHAIN)/bin/linux/create-fself"; \
	elif [ -x "$(OO_PS4_TOOLCHAIN)/bin/create-fself" ]; then echo "$(OO_PS4_TOOLCHAIN)/bin/create-fself"; \
	else echo "create-fself"; fi)

# --- Source / output ----------------------------------------------------
ifeq ($(FULL),1)
SRC      := main_full.c
else
SRC      := main.c
endif

SRCDIR   := $(dir $(abspath $(lastword $(MAKEFILE_LIST))))
BUILDDIR := $(abspath $(SRCDIR)/../build)

TARGET_OBJ  := $(BUILDDIR)/main.o
TARGET_ELF  := $(BUILDDIR)/eboot.elf
TARGET_OELF := $(BUILDDIR)/eboot.oelf
TARGET_BIN  := $(BUILDDIR)/eboot.bin

# --- Compile-time URL ---------------------------------------------------
SOULIMA_URL ?= http://192.168.1.100:3030

# --- Flags --------------------------------------------------------------
CFLAGS := \
	--target=x86_64-pc-freebsd12-elf \
	-fPIC \
	-funwind-tables \
	-c \
	-O2 \
	-std=c11 \
	-DSOULIMA_URL=\"$(SOULIMA_URL)\" \
	-isysroot $(OO_PS4_TOOLCHAIN) \
	-isystem $(OO_PS4_TOOLCHAIN)/include

LDFLAGS := \
	-m elf_x86_64 \
	-pie \
	--script $(OO_PS4_TOOLCHAIN)/link.x \
	--eh-frame-hdr \
	-L$(OO_PS4_TOOLCHAIN)/lib \
	-lc -lkernel -lSceSystemService \
	$(OO_PS4_TOOLCHAIN)/lib/crt1.o

.PHONY: all clean stub fself check

ifeq ($(HAS_OO),yes)

all: $(TARGET_BIN)

$(BUILDDIR):
	mkdir -p $(BUILDDIR)

$(TARGET_OBJ): $(SRCDIR)/$(SRC) | $(BUILDDIR)
	@echo "[CC]    $(SRC) -> main.o"
	$(CC) $(CFLAGS) -o $@ $<

$(TARGET_ELF): $(TARGET_OBJ)
	@echo "[LD]    main.o -> eboot.elf"
	$(LD) $< $(LDFLAGS) -o $@

$(TARGET_BIN): $(TARGET_ELF)
	@echo "[FSELF] eboot.elf -> eboot.bin"
	$(FSELF) -in $(TARGET_ELF) -out $(TARGET_OELF) --eboot $@ --paid 0x3800000000000011
	@echo "Build complete: $@"

fself: $(TARGET_BIN)

else

all: stub

$(BUILDDIR):
	mkdir -p $(BUILDDIR)

stub: $(BUILDDIR)/eboot_stub.elf

$(BUILDDIR)/eboot_stub.elf: $(SRCDIR)/$(SRC) $(SRCDIR)/stub_shims.c | $(BUILDDIR)
	@echo "[STUB] Building host stub ELF (OpenOrbis not found)"
	gcc -O2 -std=c11 -DSOULIMA_URL=\"$(SOULIMA_URL)\" -DSOULIMA_STUB \
		-Wl,--allow-multiple-definition \
		$(SRCDIR)/stub_shims.c $< -o $@
	@echo "Stub built at: $@"

endif

clean:
	rm -rf $(BUILDDIR)
