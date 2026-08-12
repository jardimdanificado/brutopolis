# =============================================================================
#  Makefile.js — brutopolis JS variant build
# =============================================================================
#
#  Builds a self-contained brutopolis_js.wasm that runs all game logic in
#  JavaScript via embedded MicroQuickJS.
#
#  Usage:
#    make -f Makefile.js             → builds brutopolis_js.wasm
#    make -f Makefile.js run         → builds and runs
#    make -f Makefile.js gen-assets  → regenerates assets_js.h
#    make -f Makefile.js clean       → removes build artefacts
#    make -f Makefile.js patch       → patches mquickjs stdlib (run once)
#
# =============================================================================

CLANG     ?= clang
WAGNOSTIC ?= $(if $(wildcard ../wagnostic/emulators/wasm3/wagnostic),../wagnostic/emulators/wasm3/wagnostic,wagnostic)
PYTHON3   ?= python3

# Repo structure
LIB       := lib
DECODERS  := $(LIB)/decoders
INCLUDE   := $(LIB)/include
SHIM      := $(LIB)/shim
# Prefer a vendored copy. During development, the sibling wagner checkout is
# also supported, but a clean checkout without either copy fails explicitly.
MQJS_DIR  ?= $(if $(wildcard src_js/mquickjs/mquickjs.c),src_js/mquickjs,$(if $(wildcard ../wagner/lib/mquickjs/mquickjs.c),../wagner/lib/mquickjs,src_js/mquickjs))

TARGET := brutopolis_js.wasm
ASSETS := assets_js.h

CFLAGS = \
	--target=wasm32 \
	-nostdlib \
	-fno-delete-null-pointer-checks \
	-O2 \
	-w \
	-isystem $(INCLUDE) \
	-I$(DECODERS) \
	-I. \
	-Isrc_js \
	-I$(MQJS_DIR) \
	-DWAGNER_TITLE=\"brutopolis-js\" \
	-DWAGNER_CFG_W=320 \
	-DWAGNER_CFG_H=240 \
	-DWAGNER_CFG_BPP=8 \
	-DWAGNER_CFG_SCALE=1 \
	-DWAGNER_CFG_R_BITS=3 \
	-DWAGNER_CFG_R_SHIFT=5 \
	-DWAGNER_CFG_G_BITS=3 \
	-DWAGNER_CFG_G_SHIFT=2 \
	-DWAGNER_CFG_B_BITS=2 \
	-DWAGNER_CFG_B_SHIFT=0 \
	-DWAGNER_CFG_A_BITS=0 \
	-DWAGNER_CFG_A_SHIFT=0 \
	-DLODEPNG_NO_COMPILE_DISK \
	-DLODEPNG_NO_COMPILE_ENCODER \
	-DLODEPNG_NO_COMPILE_ANCILLARY_CHUNKS \
	-DLODEPNG_NO_COMPILE_ERROR_TEXT \
	-DWAGNER_NO_AUDIO_DECODE \
	-DWAGNER_ASSETS_HEADER=\"assets_js.h\" \
	-include $(ASSETS)

LDFLAGS = \
	-Wl,--no-entry \
	-Wl,--export-all \
	-Wl,--allow-undefined \
	-Wl,-z,stack-size=2097152

SRCS = \
	src_js/main_js.c \
	src_js/native_world.c \
	$(DECODERS)/lodepng.c \
	$(SHIM)/libc_shim.c

# MicroQuickJS sources
MQJS_SRCS = \
	$(MQJS_DIR)/mquickjs.c \
	$(MQJS_DIR)/cutils.c \
	$(MQJS_DIR)/dtoa.c \
	$(MQJS_DIR)/libm.c

.PHONY: all run gen-assets patch clean setup test-js

all: setup $(TARGET)

# Validate the dependency without mutating the checkout or relying on network.
setup:
	@if [ ! -f "$(MQJS_DIR)/mquickjs.c" ] || [ ! -f "$(MQJS_DIR)/mquickjs.h" ] || [ ! -f "$(MQJS_DIR)/mqjs_stdlib.h" ] || ! grep -q 'js_draw_sprite' "$(MQJS_DIR)/mqjs_stdlib.h"; then \
		echo "error: MicroQuickJS not found in $(MQJS_DIR)" >&2; \
		echo "       use the Wagner-generated MicroQuickJS stdlib (with js_draw_sprite)" >&2; \
		echo "       or set MQJS_DIR=/path/to/wagner/lib/mquickjs" >&2; \
		exit 1; \
	fi
	@echo "→ MicroQuickJS: $(MQJS_DIR)"

$(TARGET): $(SRCS) $(MQJS_SRCS) $(ASSETS) wagner.h
	$(CLANG) $(CFLAGS) $(LDFLAGS) -o $@ $(SRCS) $(MQJS_SRCS)
	@echo "✓  Built $(TARGET)  ($$(wc -c < $(TARGET)) bytes)"

gen-assets: $(ASSETS)

$(ASSETS): js/world.js js/creatures.js js/game_setup.js js/runtime.js
	$(PYTHON3) gen_assets_js.py

run: all
	$(WAGNOSTIC) $(TARGET)

patch:
	MQJS_DIR="$(MQJS_DIR)" $(PYTHON3) patch_stdlib.py
	@echo "✓  Patched stdlib"

test-js:
	$(PYTHON3) tests/js_smoke.py

clean:
	rm -f $(TARGET) $(ASSETS)
