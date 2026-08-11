# =============================================================================
#  brutopolis — Self-Contained Makefile
# =============================================================================
#
#  All dependencies (wagner.h, lodepng, libc_shim) live inside this repo.
#  No external ~/repos/wagner or ~/repos/wagnostic needed.
#
#  Usage:
#    make              → builds brutopolis.wasm
#    make run          → builds and runs with wagnostic
#    make gen-assets   → regenerates assets.h from assets/ directory
#    make clean        → removes build artifacts
#
# =============================================================================

CLANG     ?= clang
WAGNOSTIC ?= wagnostic

# All paths are relative to this repo root
WAGNER_H   := .
LIB        := lib
DECODERS   := $(LIB)/decoders
INCLUDE    := $(LIB)/include
SHIM       := $(LIB)/shim

TARGET := brutopolis.wasm

CFLAGS = \
	--target=wasm32 \
	-nostdlib \
	-fno-delete-null-pointer-checks \
	-O2 \
	-w \
	-isystem $(INCLUDE) \
	-I$(DECODERS) \
	-I$(WAGNER_H) \
	-I. \
	-Isrc \
	-DWAGNER_TITLE=\"brutopolis\" \
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
	-DWAGNER_NO_AUDIO_DECODE

LDFLAGS = \
	-Wl,--no-entry \
	-Wl,--export-all \
	-Wl,--allow-undefined \
	-Wl,-z,stack-size=1048576

SRCS = \
	src/main.c \
	$(DECODERS)/lodepng.c \
	$(SHIM)/libc_shim.c

.PHONY: all run gen-assets clean

all: $(TARGET)

$(TARGET): $(SRCS) assets.h wagner.h
	$(CLANG) $(CFLAGS) $(LDFLAGS) -o $@ $(SRCS)
	@echo "✓  Built $(TARGET)  ($$(wc -c < $(TARGET)) bytes)"

gen-assets:
	python3 gen_assets.py

run: all
	$(WAGNOSTIC) $(TARGET)

clean:
	rm -f $(TARGET)
