#!/usr/bin/env python3
"""
gen_assets_js.py — Generates assets.h for the brutopolis JS build.
Bundles all PNG assets + the JS files (concatenated as game.js).
"""
import os, sys

ASSETS_DIR  = "assets"
JS_FILES    = ["js/world.js", "js/creatures.js", "js/game_setup.js", "js/runtime.js"]
OUTPUT      = "assets_js.h"

entries = []

# 1. PNG assets
if os.path.isdir(ASSETS_DIR):
    for root, dirs, files in os.walk(ASSETS_DIR):
        dirs.sort()
        for name in sorted(files):
            full = os.path.join(root, name)
            rel  = os.path.relpath(full, ASSETS_DIR)
            with open(full, "rb") as f:
                data = f.read()
            entries.append((rel, data))
else:
    print("[gen_assets_js] WARNING: 'assets/' not found")

# 2. Bundle JS files into a single game.js asset
js_bundle = b""
for jf in JS_FILES:
    if os.path.exists(jf):
        with open(jf, "rb") as f:
            js_bundle += f.read() + b"\n"
        print(f"[gen_assets_js] Bundled: {jf}")
    else:
        print(f"[gen_assets_js] WARNING: Missing {jf}")

if js_bundle:
    js_bundle += b"\n// Host compatibility aliases for the gameplay API.\n"
    # MicroQuickJS requires input[input_len] to be a readable NUL byte.
    js_bundle += b"\0"
    entries.append(("game.js", js_bundle))
else:
    entries.append(("game.js", b"\0"))

# Write output
lines = []
lines.append("#pragma once")
lines.append("typedef struct { const char* path; const unsigned char* data; unsigned int size; } WagnerAsset;")

for idx, (path, data) in enumerate(entries):
    var = f"asset_{idx}"
    flat = [f"0x{b:02x}" for b in data]
    rows = []
    for i in range(0, len(flat), 12):
        rows.append("  " + ", ".join(flat[i:i+12]))
    lines.append(f"static const unsigned char {var}[] = {{")
    lines.append(",\n".join(rows) if rows else "  0x00")
    lines.append("};")

lines.append("static const WagnerAsset WAGNER_ASSETS[] = {")
for idx, (path, _) in enumerate(entries):
    safe = path.replace("\\", "/")
    lines.append(f'    {{"{safe}", asset_{idx}, sizeof(asset_{idx})}},')
lines.append("};")
lines.append(f"static const int WAGNER_ASSET_COUNT = {len(entries)};")

with open(OUTPUT, "w") as f:
    f.write("\n".join(lines) + "\n")

print(f"[gen_assets_js] {OUTPUT}: {len(entries)} assets ({len(js_bundle)} bytes JS)")
