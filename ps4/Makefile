################################################################################
# Soulima PS4 PKG — Makefile
# Targets: sfo, assets, eboot, pkg, all, clean
################################################################################

PYTHON      := python3
SCRIPTS_DIR := scripts
SCE_SYS     := sce_sys
BUILD_DIR   := build
DIST_DIR    := dist

SFO         := $(SCE_SYS)/param.sfo
ICON0       := $(SCE_SYS)/icon0.png
PIC1        := $(SCE_SYS)/pic1.png
EBOOT_BIN   := $(BUILD_DIR)/eboot.bin
PKG         := $(DIST_DIR)/Soulima.pkg

.PHONY: all sfo assets eboot pkg clean

all: sfo assets eboot pkg

## Generate param.sfo binary
sfo: $(SFO)

$(SFO): $(SCRIPTS_DIR)/make_sfo.py
	@echo "[SFO] Generating param.sfo..."
	$(PYTHON) $(SCRIPTS_DIR)/make_sfo.py

## Generate icon0.png and pic1.png
assets: $(ICON0) $(PIC1)

$(ICON0) $(PIC1): $(SCRIPTS_DIR)/make_icons.py
	@echo "[ASSETS] Generating icons..."
	$(PYTHON) $(SCRIPTS_DIR)/make_icons.py

## Compile eboot.bin (FSELF)
eboot: $(EBOOT_BIN)

$(EBOOT_BIN): src/main.c
	@echo "[EBOOT] Compiling eboot.bin..."
	$(MAKE) -C src

## Assemble final Soulima.pkg
pkg: $(PKG)

$(PKG): $(SFO) $(ICON0) $(PIC1) $(EBOOT_BIN) $(SCRIPTS_DIR)/build_pkg.py
	@echo "[PKG] Assembling Soulima.pkg..."
	$(PYTHON) $(SCRIPTS_DIR)/build_pkg.py

## Remove generated files
clean:
	@echo "[CLEAN] Removing generated assets and build outputs..."
	$(MAKE) -C src clean
	rm -f $(SFO) $(ICON0) $(PIC1)
	rm -rf $(BUILD_DIR) $(DIST_DIR)
