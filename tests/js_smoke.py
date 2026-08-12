#!/usr/bin/env python3
"""Deterministic smoke test for the gameplay JS outside the WASM host."""

import pathlib
import subprocess
import sys

root = pathlib.Path(__file__).resolve().parent.parent
files = ["js/world.js", "js/creatures.js", "js/game_setup.js", "js/runtime.js"]
source = "\n".join((root / path).read_text() for path in files)

script = r"""
const vm = require('vm');
const source = process.argv[1];
const noop = () => {};
const context = {
  rgb: (r, g, b) => ((r & 255) << 16) | ((g & 255) << 8) | (b & 255),
  wagner: { frameCount: 0, dt: 1 / 60, keys: [], mouseX: 0, mouseY: 0,
            mouseDown: false, mousePressed: false, mouseWheel: 0 },
  drawSprite: noop, drawSpriteColored: noop, drawBox: noop,
  drawText: noop, fill: noop, clear: noop,
  native_map_width: () => 512, native_map_height: () => 512,
  native_map_generate: noop, native_map_tile: () => 0,
  native_map_walkable: () => true,
  native_find_water: () => null,
  native_find_path: (sx, sy, gx, gy) => [{x: gx, y: gy}],
  native_render_clear: noop, native_render_entity: noop,
  native_render_item: noop,
  native_render_entity_meta: noop, native_render_inventory: noop,
  native_render_clock: noop,
  native_is_paused: () => 0, native_target_tps: () => 60,
  native_selected_entity: () => -1,
  WHITE: 0xffffff, BLACK: 0, RED: 1, GREEN: 2, BLUE: 3,
  YELLOW: 4, CYAN: 5, MAGENTA: 6, ORANGE: 7, GRAY: 8,
  PURPLE: 9, LIME: 10
};
for (const key of ['A','B','C','D','E','Q','R','S','W','TAB','SPACE',
                   'UP','DOWN','LEFT','RIGHT','KP_PLUS','KP_MINUS']) {
  context['KEY_' + key] = 0;
}
vm.createContext(context);
vm.runInContext(source, context, { timeout: 10000 });
context.setup();
const initialEntities = context.entities.filter(Boolean).length;
const initialHunger = context.entities.map((e) => e && e.hunger);
if (initialEntities < 1) throw new Error('setup created no entities');
for (let i = 0; i < 120; i++) context.tick();
if (context.worldClock.totalTicks < 1) throw new Error('world clock did not advance');
if (!context.entities.some((e, i) => e && e.hunger !== initialHunger[i])) throw new Error('entity simulation did not advance');
const mover = context.entities.find((e) => e && e.active && e.movement !== context.MOVE_NONE);
if (!mover) throw new Error('setup created no movable entity');
mover.hunger = mover.maxHunger;
mover.thirst = mover.maxThirst;
mover.fatigue = mover.maxFatigue;
mover.curiosity = 100;
mover.attack = 0;
const startX = mover.x, startY = mover.y;
context.doMoveTo(mover, startX + 3, startY);
for (let i = 0; i < 30; i++) context.tick();
if (mover.x === startX && mover.y === startY) throw new Error('entity did not move along its path');
context.doAttack(mover, { active: false, id: 999 });
if (mover.motor !== context.MOTOR_IDLE || mover.targetId !== -1) throw new Error('dead attack target was not cleared');
const plant = context.entities.find((e) => e && e.active && e.diet === context.DIET_PHOTOSYNTHESIS);
if (plant) {
  plant.thirst = 0;
  context.brainThink(plant);
  if (plant.thought === 'Seeking water' || plant.motor === context.MOTOR_DRINK) throw new Error('photosynthetic entity sought water');
}
if (context.entities.length !== context.MAX_ENTITIES) throw new Error('entity capacity changed');
if (context.droppedItems.length !== context.MAX_ITEMS) throw new Error('item capacity changed');
process.stdout.write(JSON.stringify({
  initialEntities,
  activeEntities: context.entities.filter(Boolean).length,
  items: context.droppedItems.filter(Boolean).length,
  worldTicks: context.worldClock.totalTicks
}) + '\n');
"""

result = subprocess.run(
    ["node", "-e", script, source],
    cwd=root,
    text=True,
    capture_output=True,
)
if result.returncode:
    sys.stderr.write(result.stderr)
    sys.exit(result.returncode)
print("JS smoke: OK " + result.stdout.strip())
