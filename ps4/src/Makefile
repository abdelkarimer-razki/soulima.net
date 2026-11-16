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
	CXX := $(LLVM_DIR)/bin/clang++
	LD  := $(LLVM_DIR)/bin/ld.lld
else
	CC  ?= clang
	CXX ?= clang++
	LD  ?= ld.lld
endif

FSELF := $(shell \
	if [ -x "$(OO_PS4_TOOLCHAIN)/bin/linux/create-fself" ]; then echo "$(OO_PS4_TOOLCHAIN)/bin/linux/create-fself"; \
	elif [ -x "$(OO_PS4_TOOLCHAIN)/bin/create-fself" ]; then echo "$(OO_PS4_TOOLCHAIN)/bin/create-fself"; \
	else echo "create-fself"; fi)

# --- Source / output ----------------------------------------------------
SRCDIR   := $(dir $(abspath $(lastword $(MAKEFILE_LIST))))
BUILDDIR := $(abspath $(SRCDIR)/../build)

CXX_SOURCES := main.cpp renderer.cpp controller.cpp network.cpp catalog.cpp player.cpp
CXX_OBJS    := $(patsubst %.cpp,$(BUILDDIR)/%.o,$(CXX_SOURCES))

TARGET_ELF  := $(BUILDDIR)/eboot.elf
TARGET_OELF := $(BUILDDIR)/eboot.oelf
TARGET_BIN  := $(BUILDDIR)/eboot.bin

# --- Compile-time URL ---------------------------------------------------
SOULIMA_URL ?= http://192.168.1.68:3030

# --- Flags --------------------------------------------------------------
CXXFLAGS := \
	--target=x86_64-pc-freebsd12-elf \
	-fPIC \
	-funwind-tables \
	-c \
	-O2 \
	-std=c++17 \
	-DSOULIMA_URL=\"$(SOULIMA_URL)\" \
	-isysroot $(OO_PS4_TOOLCHAIN) \
	-isystem $(OO_PS4_TOOLCHAIN)/include \
	-isystem $(OO_PS4_TOOLCHAIN)/include/c++/v1

LDFLAGS := \
	-m elf_x86_64 \
	-pie \
	--script $(OO_PS4_TOOLCHAIN)/link.x \
	--eh-frame-hdr \
	-L$(OO_PS4_TOOLCHAIN)/lib \
	-lc -lkernel -lc++ \
	-lSceVideoOut -lScePad -lSceUserService -lSceSystemService -lSceNet -lSceAvPlayer \
	$(OO_PS4_TOOLCHAIN)/lib/crt1.o

.PHONY: all clean stub fself check host sim

ifeq ($(HAS_OO),yes)

all: $(TARGET_BIN)

$(BUILDDIR):
	mkdir -p $(BUILDDIR)

$(BUILDDIR)/%.o: $(SRCDIR)/%.cpp | $(BUILDDIR)
	@echo "[CXX]   $< -> $@"
	$(CXX) $(CXXFLAGS) -o $@ $<

$(TARGET_ELF): $(CXX_OBJS)
	@echo "[LD]    $(CXX_OBJS) -> eboot.elf"
	$(LD) $(CXX_OBJS) $(LDFLAGS) -o $@

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

HOST_BIN := $(BUILDDIR)/soulima_sim

host sim: $(HOST_BIN)

$(HOST_BIN): $(addprefix $(SRCDIR)/,$(CXX_SOURCES)) | $(BUILDDIR)
	@echo "[HOST] Compiling host simulator with SDL2..."
	g++ -O2 -std=c++17 -DSOULIMA_HOST -DSOULIMA_URL=\"$(SOULIMA_URL)\" \
		$(addprefix $(SRCDIR)/,$(CXX_SOURCES)) -lSDL2 -o $@
	@ln -sf $@ $(SRCDIR)/../soulima_sim
	@echo "Host simulator built: ps4/soulima_sim"

clean:
	rm -rf $(BUILDDIR)
