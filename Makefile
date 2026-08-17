# =============================================================================
#  brutopolis — Wash WebAssembly Simulation & Engine
# =============================================================================

CLANG ?= clang

LIB      := lib
DECODERS := $(LIB)/decoders
INCLUDE  := $(LIB)/include
SHIM     := $(LIB)/shim

TARGET := brutopolis.wasm

CFLAGS = \
	--target=wasm32 \
	-nostdlib \
	-fno-delete-null-pointer-checks \
	-O2 \
	-w \
	-isystem $(INCLUDE) \
	-I$(DECODERS) \
	-I. \
	-Isrc \
	-DLODEPNG_NO_COMPILE_DISK \
	-DLODEPNG_NO_COMPILE_ENCODER \
	-DLODEPNG_NO_COMPILE_ANCILLARY_CHUNKS \
	-DLODEPNG_NO_COMPILE_ERROR_TEXT

LDFLAGS = \
	-Wl,--no-entry \
	-Wl,--export-all \
	-Wl,--allow-undefined \
	-Wl,-z,stack-size=2097152

SRCS = \
	src/main.c \
	src/world_gen.c \
	src/renderer.c \
	$(DECODERS)/lodepng.c \
	$(SHIM)/libc_shim.c

.PHONY: all run gen-assets clean serve

all: $(TARGET)

$(TARGET): $(SRCS) assets.h
	$(CLANG) $(CFLAGS) $(LDFLAGS) -o $@ $(SRCS)
	@echo "✓  Built $(TARGET) ($$(wc -c < $(TARGET)) bytes)"

gen-assets:
	python3 gen_assets.py

run: all
	node /home/jardel/repos/wash/bin/wash.js $(TARGET)

serve: all
	python3 -m http.server 8080

clean:
	rm -f $(TARGET)
