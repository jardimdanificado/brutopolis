// =============================================================================
// Brutopolis — Pure Canvas Simulation Engine (Embedded 8x8 Engine Font)
// =============================================================================

import { wash_memory, wash_load, wash_write_string } from "./wash.js";
import { World } from "./js/world.js";
import {
  createEntity,
  tickEntities,
  syncRenderToWasm,
  entityRegistry,
  getEntityById,
  destroyEntity,
  explodeEntityOnDeath,
  currentTick,
  resetEngineTicks,
  incrementEngineTick
} from "./js/engine.js";
import {
  resetWorldEvents,
  getEventsForEntity,
  getRecentWorldEvents,
  allEvents
} from "./js/event_log.js";
import {
  createLifeProp,
  createLungsProp,
  createGillsProp,
  createStomachProp,
  createBladderProp,
  createKidneyProp,
  createBrainProp,
  createWingsProp,
  createPawProp,
  createDeepRootProp,
  createSurfaceRootProp,
  createTerrainPreferenceProp,
  createParasitesProp,
  createBodyRegenerationProp,
  createCombatProp,
  createBurnProp,
  createViolentProp,
  createPacifistProp,
  createKnight,
  createArcher,
  createCat,
  createWolf,
  createBear,
  createGoblin,
  createBat,
  createSeaSerpent,
  createDragon,
  createCactus,
  createScorpion,
  createLizard,
  createAlpineShrub,
  createMountainGoat,
  createWoodItem,
  createStoneItem,
  createMouthProp,
  createCommunicationProp,
  createCrafterProp,
  createMinerProp,
  createBuilderProp,
  createGroup,
  createBruiseProp,
  createConcussionProp,
  createScarProp,
  createOakTree,
  createWillowTree,
  createPineTree,
  createWaterLily,
  createSeaweed,
  createFruit,
  createSeedEntity
} from "./js/properties.js";

// ---------------------------------------------------------------------------
// 1. Embedded 8x8 Bitmap Font (Exact Match with C/WASM Engine src/renderer.c)
// ---------------------------------------------------------------------------

const FONT_8X8 = [
  [0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00], // ' ' (32)
  [0x18,0x3c,0x3c,0x18,0x18,0x00,0x18,0x00], // '!'
  [0x66,0x66,0x24,0x00,0x00,0x00,0x00,0x00], // '"'
  [0x6c,0x6c,0xfe,0x6c,0xfe,0x6c,0x6c,0x00], // '#'
  [0x18,0x3e,0x60,0x3c,0x06,0x7c,0x18,0x00], // '$'
  [0x00,0x66,0xa6,0xd4,0x2b,0x65,0x66,0x00], // '%'
  [0x38,0x6c,0x38,0x76,0xdc,0xcc,0x76,0x00], // '&'
  [0x18,0x18,0x30,0x00,0x00,0x00,0x00,0x00], // '''
  [0x0c,0x18,0x30,0x30,0x30,0x18,0x0c,0x00], // '('
  [0x30,0x18,0x0c,0x0c,0x0c,0x18,0x30,0x00], // ')'
  [0x00,0x66,0x3c,0xff,0x3c,0x66,0x00,0x00], // '*'
  [0x00,0x18,0x18,0x7e,0x18,0x18,0x00,0x00], // '+'
  [0x00,0x00,0x00,0x00,0x00,0x18,0x18,0x30], // ','
  [0x00,0x00,0x00,0x7e,0x00,0x00,0x00,0x00], // '-'
  [0x00,0x00,0x00,0x00,0x00,0x18,0x18,0x00], // '.'
  [0x06,0x0c,0x18,0x30,0x60,0xc0,0x80,0x00], // '/'
  [0x3c,0x66,0x6e,0x76,0x66,0x66,0x3c,0x00], // '0' (48)
  [0x18,0x38,0x18,0x18,0x18,0x18,0x7e,0x00], // '1'
  [0x3c,0x66,0x06,0x1c,0x30,0x60,0x7e,0x00], // '2'
  [0x3c,0x66,0x06,0x1c,0x06,0x66,0x3c,0x00], // '3'
  [0x0c,0x1c,0x34,0x64,0x7e,0x04,0x0e,0x00], // '4'
  [0x7e,0x60,0x7c,0x06,0x06,0x66,0x3c,0x00], // '5'
  [0x1c,0x30,0x60,0x7c,0x66,0x66,0x3c,0x00], // '6'
  [0x7e,0xc6,0x0c,0x18,0x30,0x30,0x30,0x00], // '7'
  [0x3c,0x66,0x66,0x3c,0x66,0x66,0x3c,0x00], // '8'
  [0x3c,0x66,0x66,0x3e,0x06,0x0c,0x38,0x00], // '9'
  [0x00,0x18,0x18,0x00,0x00,0x18,0x18,0x00], // ':'
  [0x00,0x18,0x18,0x00,0x00,0x18,0x18,0x30], // ';'
  [0x0c,0x18,0x30,0x60,0x30,0x18,0x0c,0x00], // '<'
  [0x00,0x00,0x7e,0x00,0x7e,0x00,0x00,0x00], // '='
  [0x30,0x18,0x0c,0x06,0x0c,0x18,0x30,0x00], // '>'
  [0x3c,0x66,0x06,0x0c,0x18,0x00,0x18,0x00], // '?'
  [0x3c,0x66,0x6e,0x6e,0x60,0x62,0x3c,0x00], // '@' (64)
  [0x18,0x3c,0x66,0x7e,0x66,0x66,0x66,0x00], // 'A'
  [0x7c,0x66,0x66,0x7c,0x66,0x66,0x7c,0x00], // 'B'
  [0x3c,0x66,0x60,0x60,0x60,0x66,0x3c,0x00], // 'C'
  [0x78,0x6c,0x66,0x66,0x66,0x6c,0x78,0x00], // 'D'
  [0x7e,0x60,0x60,0x7c,0x60,0x60,0x7e,0x00], // 'E'
  [0x7e,0x60,0x60,0x7c,0x60,0x60,0x60,0x00], // 'F'
  [0x3c,0x66,0x60,0x6e,0x66,0x66,0x3a,0x00], // 'G'
  [0x66,0x66,0x66,0x7e,0x66,0x66,0x66,0x00], // 'H'
  [0x3c,0x18,0x18,0x18,0x18,0x18,0x3c,0x00], // 'I'
  [0x1e,0x0c,0x0c,0x0c,0x0c,0x6c,0x38,0x00], // 'J'
  [0x66,0x6c,0x78,0x70,0x78,0x6c,0x66,0x00], // 'K'
  [0x60,0x60,0x60,0x60,0x60,0x60,0x7e,0x00], // 'L'
  [0x63,0x77,0x7f,0x6b,0x63,0x63,0x63,0x00], // 'M'
  [0x66,0x76,0x7e,0x7e,0x6e,0x66,0x66,0x00], // 'N'
  [0x3c,0x66,0x66,0x66,0x66,0x66,0x3c,0x00], // 'O'
  [0x7c,0x66,0x66,0x7c,0x60,0x60,0x60,0x00], // 'P'
  [0x3c,0x66,0x66,0x66,0x6a,0x6c,0x36,0x00], // 'Q'
  [0x7c,0x66,0x66,0x7c,0x6c,0x66,0x66,0x00], // 'R'
  [0x3c,0x66,0x60,0x3c,0x06,0x66,0x3c,0x00], // 'S'
  [0x7e,0x18,0x18,0x18,0x18,0x18,0x18,0x00], // 'T'
  [0x66,0x66,0x66,0x66,0x66,0x66,0x3c,0x00], // 'U'
  [0x66,0x66,0x66,0x66,0x66,0x3c,0x18,0x00], // 'V'
  [0x63,0x63,0x63,0x6b,0x7f,0x77,0x63,0x00], // 'W'
  [0x66,0x66,0x3c,0x18,0x3c,0x66,0x66,0x00], // 'X'
  [0x66,0x66,0x66,0x3c,0x18,0x18,0x18,0x00], // 'Y'
  [0x7e,0x06,0x0c,0x18,0x30,0x60,0x7e,0x00], // 'Z'
  [0x3c,0x30,0x30,0x30,0x30,0x30,0x3c,0x00], // '['
  [0xc0,0x60,0x30,0x18,0x0c,0x06,0x02,0x00], // '\'
  [0x3c,0x0c,0x0c,0x0c,0x0c,0x0c,0x3c,0x00], // ']'
  [0x18,0x3c,0x66,0x00,0x00,0x00,0x00,0x00], // '^'
  [0x00,0x00,0x00,0x00,0x00,0x00,0x00,0xff], // '_'
  [0x30,0x18,0x0c,0x00,0x00,0x00,0x00,0x00], // '`'
  [0x00,0x00,0x3c,0x06,0x3e,0x66,0x3e,0x00], // 'a' (97)
  [0x60,0x60,0x7c,0x66,0x66,0x66,0x7c,0x00], // 'b'
  [0x00,0x00,0x3c,0x66,0x60,0x66,0x3c,0x00], // 'c'
  [0x06,0x06,0x3e,0x66,0x66,0x66,0x3e,0x00], // 'd'
  [0x00,0x00,0x3c,0x66,0x7e,0x60,0x3c,0x00], // 'e'
  [0x1c,0x30,0x78,0x30,0x30,0x30,0x30,0x00], // 'f'
  [0x00,0x00,0x3e,0x66,0x66,0x3e,0x06,0x3c], // 'g'
  [0x60,0x60,0x7c,0x66,0x66,0x66,0x66,0x00], // 'h'
  [0x18,0x00,0x38,0x18,0x18,0x18,0x3c,0x00], // 'i'
  [0x0c,0x00,0x1c,0x0c,0x0c,0x0c,0x6c,0x38], // 'j'
  [0x60,0x60,0x66,0x6c,0x78,0x6c,0x66,0x00], // 'k'
  [0x38,0x18,0x18,0x18,0x18,0x18,0x3c,0x00], // 'l'
  [0x00,0x00,0x66,0x7f,0x7f,0x6b,0x63,0x00], // 'm'
  [0x00,0x00,0x7c,0x66,0x66,0x66,0x66,0x00], // 'n'
  [0x00,0x00,0x3c,0x66,0x66,0x66,0x3c,0x00], // 'o'
  [0x00,0x00,0x7c,0x66,0x66,0x7c,0x60,0x60], // 'p'
  [0x00,0x00,0x3e,0x66,0x66,0x3e,0x06,0x07], // 'q'
  [0x00,0x00,0x7c,0x66,0x60,0x60,0x60,0x00], // 'r'
  [0x00,0x00,0x3e,0x60,0x3c,0x06,0x7c,0x00], // 's'
  [0x18,0x18,0x7e,0x18,0x18,0x18,0x0c,0x00], // 't'
  [0x00,0x00,0x66,0x66,0x66,0x66,0x3e,0x00], // 'u'
  [0x00,0x00,0x66,0x66,0x66,0x3c,0x18,0x00], // 'v'
  [0x00,0x00,0x63,0x6b,0x7f,0x3e,0x36,0x00], // 'w'
  [0x00,0x00,0x66,0x3c,0x18,0x3c,0x66,0x00], // 'x'
  [0x00,0x00,0x66,0x66,0x66,0x3e,0x06,0x3c], // 'y'
  [0x00,0x00,0x7e,0x0c,0x18,0x30,0x7e,0x00], // 'z'
  [0x0e,0x18,0x18,0x70,0x18,0x18,0x0e,0x00], // '{'
  [0x18,0x18,0x18,0x00,0x18,0x18,0x18,0x00], // '|'
  [0x70,0x18,0x18,0x0e,0x18,0x18,0x70,0x00], // '}'
  [0x76,0xdc,0x00,0x00,0x00,0x00,0x00,0x00]  // '~'
];

/**
 * Draws crisp text using the embedded 8x8 engine font directly to Canvas.
 */
function drawText8x8(text, startX, startY, color = "#ffffff", scale = 1) {
  if (!text) return;
  const str = String(text);
  ctx.save();
  ctx.fillStyle = color;

  let cx = startX;
  let cy = startY;

  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (str[i] === "\n") {
      cx = startX;
      cy += 9 * scale;
      continue;
    }

    let charIdx = code - 32;
    if (charIdx < 0 || charIdx >= FONT_8X8.length) {
      // Special symbol fallback
      if (str[i] === "▶" || str[i] === "▸") {
        // Draw 8-bit arrow
        for (let r = 0; r < 8; r++) {
          const w = r <= 3 ? r + 1 : 8 - r;
          ctx.fillRect(cx, cy + r * scale, w * scale, scale);
        }
        cx += 8 * scale;
        continue;
      }
      charIdx = 31; // '?'
    }

    const glyph = FONT_8X8[charIdx];
    for (let r = 0; r < 8; r++) {
      const rowBits = glyph[r];
      for (let c = 0; c < 8; c++) {
        if (rowBits & (1 << (7 - c))) {
          ctx.fillRect(cx + c * scale, cy + r * scale, scale, scale);
        }
      }
    }
    cx += 8 * scale;
  }
  ctx.restore();
}

function wrapText8x8(text, maxCharsPerLine) {
  if (!text) return [];
  const words = text.split(" ");
  const lines = [];
  let currentLine = "";

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (testLine.length > maxCharsPerLine && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

// ---------------------------------------------------------------------------
// Canvas & Simulation Setup
// ---------------------------------------------------------------------------

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;
canvas.width = CANVAS_WIDTH;
canvas.height = CANVAS_HEIGHT;

const FRAMEBUFFER_SIZE = CANVAS_WIDTH * CANVAS_HEIGHT * 4;

const mem = wash_memory(32 * 1024 * 1024);
const imageData = ctx.createImageData(CANVAS_WIDTH, CANVAS_HEIGHT);

let shader = null;
let world = null;
let entities = [];

// Simulation State
let isPaused = false;
let currentTps = 60;
let simAccumulator = 0;
let currentPreset = 0;
let lastSelectedId = -1;

// Performance
let lastTime = 0;
let fpsFrames = 0;
let currentFps = 60;
let lastFpsUpdate = performance.now();

// Active In-Game Screen Mode ("MAP", "INSPECT", "ENTITIES", "GROUPS", "LOGS", "SPAWNER")
let currentMode = "MAP";
let modalScroll = 0;
let inspectingLogEvent = null;

// Registry Filters & Selection
let entityFilter = "ALL";
let groupSelectedIdx = 0;
let logFilter = "ALL";

// Mouse & Input State
let mouseX = 0;
let mouseY = 0;
let mouseButtons = 0;
let isMouseDown = false;
let isDragging = false;
let dragStartClientX = 0;
let dragStartClientY = 0;
let dragCameraStartX = 0;
let dragCameraStartY = 0;

const keysDown = new Set();

// Clickable UI Regions
let activeUiRegions = [];

function registerClickableRegion(x, y, w, h, onClick, cursor = "pointer") {
  activeUiRegions.push({ x, y, w, h, onClick, cursor });
}

// ---------------------------------------------------------------------------
// Screen Resize & Aspect Ratio Fitting
// ---------------------------------------------------------------------------

function resizeCanvasToWindow() {
  const windowW = window.innerWidth;
  const windowH = window.innerHeight;
  const aspect = CANVAS_WIDTH / CANVAS_HEIGHT;

  let displayW, displayH;
  if (windowW / windowH > aspect) {
    displayH = windowH;
    displayW = displayH * aspect;
  } else {
    displayW = windowW;
    displayH = displayW / aspect;
  }

  canvas.style.width = `${Math.floor(displayW)}px`;
  canvas.style.height = `${Math.floor(displayH)}px`;
}

window.addEventListener("resize", resizeCanvasToWindow);
resizeCanvasToWindow();

function getCanvasCoords(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = CANVAS_WIDTH / rect.width;
  const scaleY = CANVAS_HEIGHT / rect.height;

  const cx = (clientX - rect.left) * scaleX;
  const cy = (clientY - rect.top) * scaleY;

  return {
    x: Math.max(0, Math.min(CANVAS_WIDTH, cx)),
    y: Math.max(0, Math.min(CANVAS_HEIGHT, cy)),
    inside: clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom
  };
}

// ---------------------------------------------------------------------------
// World Initialization
// ---------------------------------------------------------------------------

function spawnRandomGlobal(count, factoryFn, conditionFn) {
  let spawned = 0;
  let attempts = 0;
  while (spawned < count && attempts < count * 25) {
    attempts++;
    const rx = Math.floor(Math.random() * 508) + 2;
    const ry = Math.floor(Math.random() * 508) + 2;
    if (!conditionFn || conditionFn(rx, ry)) {
      entities.push(factoryFn(rx, ry));
      spawned++;
    }
  }
}

function resetWorld(presetId = 0) {
  if (!shader) return;
  currentPreset = presetId;
  shader.exports.wasm_init(presetId);

  resetEngineTicks();
  resetWorldEvents();
  world.refresh();
  entities = [];
  lastSelectedId = -1;
  modalScroll = 0;
  inspectingLogEvent = null;

  // Flora
  spawnRandomGlobal(35, createOakTree, (x, y) => world.getTile(x, y) === 0);
  spawnRandomGlobal(25, createWillowTree, (x, y) => world.getTile(x, y) === 0 || world.getTile(x, y) === 3);
  spawnRandomGlobal(30, createCactus, (x, y) => world.getTile(x, y) === 3);
  spawnRandomGlobal(25, createAlpineShrub, (x, y) => world.getTile(x, y) === 4 || world.getTile(x, y) === 1);
  spawnRandomGlobal(20, createPineTree, (x, y) => world.getTile(x, y) === 4 || world.getTile(x, y) === 0);
  spawnRandomGlobal(40, createWaterLily, (x, y) => world.getTile(x, y) === 2);
  spawnRandomGlobal(50, createSeaweed, (x, y) => world.getTile(x, y) === 2);

  // Items & Resources
  spawnRandomGlobal(60, (x, y) => createSeedEntity(x, y, "large", "oak"), (x, y) => world.getTile(x, y) === 0);
  spawnRandomGlobal(40, (x, y) => createSeedEntity(x, y, "small", "willow"), (x, y) => world.getTile(x, y) === 0 || world.getTile(x, y) === 3);
  spawnRandomGlobal(30, (x, y) => createFruit(x, y, "large", "cactus"), (x, y) => world.getTile(x, y) === 3);
  spawnRandomGlobal(40, (x, y) => createFruit(x, y, "large", "oak"), (x, y) => world.isWalkable(x, y));
  spawnRandomGlobal(50, createWoodItem, (x, y) => world.getTile(x, y) === 0);
  spawnRandomGlobal(50, createStoneItem, (x, y) => world.getTile(x, y) === 4 || world.getTile(x, y) === 1);

  // Fauna
  spawnRandomGlobal(25, createScorpion, (x, y) => world.getTile(x, y) === 3);
  spawnRandomGlobal(20, createLizard, (x, y) => world.getTile(x, y) === 3 || world.getTile(x, y) === 0);
  spawnRandomGlobal(20, createMountainGoat, (x, y) => world.getTile(x, y) === 4 || world.getTile(x, y) === 1);
  spawnRandomGlobal(20, (x, y) => createCat(x, y, false), (x, y) => world.getTile(x, y) === 0);
  spawnRandomGlobal(18, createWolf, (x, y) => world.getTile(x, y) === 0 || world.getTile(x, y) === 4);
  spawnRandomGlobal(10, createBear, (x, y) => world.getTile(x, y) === 0);
  spawnRandomGlobal(25, createBat, (x, y) => true);
  spawnRandomGlobal(20, createSeaSerpent, (x, y) => world.getTile(x, y) === 2);
  spawnRandomGlobal(4, createDragon, (x, y) => world.getTile(x, y) === 1 || world.getTile(x, y) === 4);
  spawnRandomGlobal(18, (x, y) => createKnight(x, y, Math.random() < 0.5 ? "male" : "female"), (x, y) => world.getTile(x, y) === 0);
  spawnRandomGlobal(18, (x, y) => createArcher(x, y, Math.random() < 0.5 ? "male" : "female"), (x, y) => world.getTile(x, y) === 0);
  spawnRandomGlobal(22, createGoblin, (x, y) => world.getTile(x, y) === 0 || world.getTile(x, y) === 4);

  // Focus on first living entity
  const firstLiving = entities.find(e => e.properties && e.properties.life);
  if (firstLiving) {
    lastSelectedId = firstLiving.id;
    shader.exports.wasm_select_entity(firstLiving.id);
    shader.exports.wasm_set_camera(firstLiving.x, firstLiving.y, 1.5);
  }
}

function spawnEntityAtCamera(factoryFn) {
  if (!shader) return;
  const cx = Math.floor(shader.exports.wasm_get_camera_x());
  const cy = Math.floor(shader.exports.wasm_get_camera_y());
  const ent = factoryFn(cx, cy);
  entities.push(ent);
  lastSelectedId = ent.id;
  shader.exports.wasm_select_entity(ent.id);
}

function cycleNextLivingEntity() {
  if (entities.length === 0 || !shader) return;
  const living = entities.filter(e => !e.destroyed && e.properties && e.properties.life);
  if (living.length === 0) return;

  const curIdx = living.findIndex(e => e.id === lastSelectedId);
  const nextIdx = (curIdx + 1) % living.length;
  const nextEnt = living[nextIdx];

  lastSelectedId = nextEnt.id;
  shader.exports.wasm_select_entity(nextEnt.id);
  shader.exports.wasm_set_camera(nextEnt.x, nextEnt.y, shader.exports.wasm_get_camera_zoom());
}

function centerCamera() {
  if (!shader) return;
  const sel = getEntityById(lastSelectedId);
  if (sel) {
    shader.exports.wasm_set_camera(sel.x, sel.y, shader.exports.wasm_get_camera_zoom());
  } else {
    shader.exports.wasm_set_camera(256, 256, 1.0);
  }
}

function togglePause() {
  if (!shader) return;
  isPaused = !isPaused;
  shader.exports.wasm_set_paused(isPaused ? 1 : 0);
}

// ---------------------------------------------------------------------------
// Mouse & Keyboard Input Dispatcher
// ---------------------------------------------------------------------------

canvas.addEventListener("mousedown", (e) => {
  if (e.button !== 0 && e.button !== 1 && e.button !== 2) return;
  const coords = getCanvasCoords(e.clientX, e.clientY);
  mouseX = coords.x;
  mouseY = coords.y;
  mouseButtons = e.buttons;

  isMouseDown = true;
  isDragging = false;
  dragStartClientX = e.clientX;
  dragStartClientY = e.clientY;

  if (shader) {
    dragCameraStartX = shader.exports.wasm_get_camera_x();
    dragCameraStartY = shader.exports.wasm_get_camera_y();
  }

  // Handle clickable UI regions first
  if (e.button === 0) {
    for (let i = activeUiRegions.length - 1; i >= 0; i--) {
      const reg = activeUiRegions[i];
      if (coords.x >= reg.x && coords.x <= reg.x + reg.w && coords.y >= reg.y && coords.y <= reg.y + reg.h) {
        reg.onClick();
        return;
      }
    }
  }
});

window.addEventListener("mousemove", (e) => {
  const coords = getCanvasCoords(e.clientX, e.clientY);
  mouseX = coords.x;
  mouseY = coords.y;

  let isOverUi = false;
  for (const reg of activeUiRegions) {
    if (coords.x >= reg.x && coords.x <= reg.x + reg.w && coords.y >= reg.y && coords.y <= reg.y + reg.h) {
      canvas.style.cursor = reg.cursor || "pointer";
      isOverUi = true;
      break;
    }
  }
  if (!isOverUi) {
    canvas.style.cursor = currentMode === "MAP" ? "crosshair" : "default";
  }

  // Camera Drag
  if (isMouseDown && shader && currentMode === "MAP") {
    const totalDist = Math.hypot(e.clientX - dragStartClientX, e.clientY - dragStartClientY);
    if (totalDist > 4) {
      isDragging = true;
      const zoom = shader.exports.wasm_get_camera_zoom();
      const rect = canvas.getBoundingClientRect();
      const pixelScale = rect.width / CANVAS_WIDTH;
      const tileSizeScreen = 16.0 * zoom * pixelScale;

      if (tileSizeScreen > 0.2) {
        const dx = (e.clientX - dragStartClientX) / tileSizeScreen;
        const dy = (e.clientY - dragStartClientY) / tileSizeScreen;
        shader.exports.wasm_set_camera(dragCameraStartX - dx, dragCameraStartY - dy, zoom);
      }
    }
  }
});

window.addEventListener("mouseup", (e) => {
  if (isMouseDown && shader && currentMode === "MAP") {
    const totalDist = Math.hypot(e.clientX - dragStartClientX, e.clientY - dragStartClientY);
    if (!isDragging && totalDist <= 5) {
      const coords = getCanvasCoords(e.clientX, e.clientY);
      if (coords.inside && coords.y > 32 && coords.y < CANVAS_HEIGHT - 36) {
        const foundId = shader.exports.wasm_select_at(coords.x, coords.y, CANVAS_WIDTH, CANVAS_HEIGHT);
        lastSelectedId = foundId;
      }
    }
  }
  isMouseDown = false;
  isDragging = false;
  mouseButtons = 0;
});

canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  if (currentMode !== "MAP") {
    if (e.deltaY < 0) modalScroll = Math.max(0, modalScroll - 2);
    else modalScroll += 2;
    return;
  }

  if (!shader) return;
  let zoom = shader.exports.wasm_get_camera_zoom();
  const cx = shader.exports.wasm_get_camera_x();
  const cy = shader.exports.wasm_get_camera_y();

  if (e.deltaY < 0) {
    zoom = Math.min(8.0, zoom * 1.15);
  } else {
    zoom = Math.max(0.15, zoom / 1.15);
  }

  shader.exports.wasm_set_camera(cx, cy, zoom);
}, { passive: false });

window.addEventListener("keydown", (e) => {
  keysDown.add(e.code);

  if (e.code === "Space") {
    e.preventDefault();
    togglePause();
  } else if (e.code === "KeyR") {
    resetWorld((currentPreset + 1) % 3);
  } else if (e.code === "KeyC") {
    centerCamera();
  } else if (e.code === "KeyK") {
    if (lastSelectedId > 0) {
      const ent = getEntityById(lastSelectedId);
      if (ent) {
        explodeEntityOnDeath(ent, entities, world);
        destroyEntity(ent, entities);
        cycleNextLivingEntity();
      }
    }
  } else if (e.code === "Tab") {
    e.preventDefault();
    cycleNextLivingEntity();
  } else if (e.code === "KeyI") {
    currentMode = currentMode === "INSPECT" ? "MAP" : "INSPECT";
    modalScroll = 0;
  } else if (e.code === "KeyE") {
    currentMode = currentMode === "ENTITIES" ? "MAP" : "ENTITIES";
    modalScroll = 0;
  } else if (e.code === "KeyG") {
    currentMode = currentMode === "GROUPS" ? "MAP" : "GROUPS";
    modalScroll = 0;
  } else if (e.code === "KeyL") {
    currentMode = currentMode === "LOGS" ? "MAP" : "LOGS";
    modalScroll = 0;
    inspectingLogEvent = null;
  } else if (e.code === "KeyS") {
    currentMode = currentMode === "SPAWNER" ? "MAP" : "SPAWNER";
    modalScroll = 0;
  } else if (e.code === "Escape") {
    if (inspectingLogEvent) inspectingLogEvent = null;
    else currentMode = "MAP";
  } else if (e.code === "Equal" || e.code === "NumpadAdd") {
    currentTps = Math.min(360, currentTps + 10);
    if (shader) shader.exports.wasm_set_tps(currentTps);
  } else if (e.code === "Minus" || e.code === "NumpadSubtract") {
    currentTps = Math.max(1, currentTps - 10);
    if (shader) shader.exports.wasm_set_tps(currentTps);
  } else if (e.code === "Digit1") spawnEntityAtCamera(createKnight);
  else if (e.code === "Digit2") spawnEntityAtCamera(createArcher);
  else if (e.code === "Digit3") spawnEntityAtCamera(createWolf);
  else if (e.code === "Digit4") spawnEntityAtCamera(createBear);
  else if (e.code === "Digit5") spawnEntityAtCamera(createCat);
  else if (e.code === "Digit6") spawnEntityAtCamera(createGoblin);
  else if (e.code === "Digit7") spawnEntityAtCamera(createBat);
  else if (e.code === "Digit8") spawnEntityAtCamera(createSeaSerpent);
  else if (e.code === "Digit9") spawnEntityAtCamera(createDragon);
});

window.addEventListener("keyup", (e) => {
  keysDown.delete(e.code);
});

function handleCameraKeys(dt) {
  if (!shader || currentMode !== "MAP") return;
  let cx = shader.exports.wasm_get_camera_x();
  let cy = shader.exports.wasm_get_camera_y();
  let zoom = shader.exports.wasm_get_camera_zoom();

  const speed = (240.0 / zoom) * dt;

  if (keysDown.has("KeyW") || keysDown.has("ArrowUp")) cy -= speed;
  if (keysDown.has("KeyS") || keysDown.has("ArrowDown")) cy += speed;
  if (keysDown.has("KeyA") || keysDown.has("ArrowLeft")) cx -= speed;
  if (keysDown.has("KeyD") || keysDown.has("ArrowRight")) cx -= speed;

  shader.exports.wasm_set_camera(cx, cy, zoom);
}

// ---------------------------------------------------------------------------
// Pure Rectangular NES Boxes & UI Helpers
// ---------------------------------------------------------------------------

function drawNESBox(x, y, w, h) {
  ctx.save();
  ctx.fillStyle = "#000000";
  ctx.fillRect(x, y, w, h);

  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  ctx.restore();
}

function drawNESButton(x, y, w, h, text, isSelected = false, isDanger = false) {
  const isHover = mouseX >= x && mouseX <= x + w && mouseY >= y && mouseY <= y + h;

  ctx.save();
  ctx.fillStyle = isDanger ? (isHover ? "#880000" : "#000000") : (isHover ? "#222222" : "#000000");
  ctx.fillRect(x, y, w, h);

  ctx.strokeStyle = isSelected ? "#f8b800" : (isHover ? "#ffffff" : (isDanger ? "#e40058" : "#7c7c7c"));
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);

  const textCol = isDanger ? "#ff6060" : (isSelected || isHover ? "#f8b800" : "#ffffff");
  const prefix = isSelected || isHover ? "▶" : "";
  const fullText = `${prefix}${text}`;
  const textWidth = fullText.length * 8;
  const tx = Math.floor(x + (w - textWidth) / 2);
  const ty = Math.floor(y + (h - 8) / 2);

  drawText8x8(fullText, tx, ty, textCol, 1);
  ctx.restore();
}

function drawNESProgressBar(x, y, w, h, val, max, label, color = "#58d854") {
  const pct = Math.max(0, Math.min(1, max > 0 ? val / max : 0));
  ctx.save();

  ctx.fillStyle = "#000000";
  ctx.fillRect(x, y, w, h);

  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);

  if (pct > 0) {
    ctx.fillStyle = color;
    ctx.fillRect(x + 3, y + 3, (w - 6) * pct, h - 6);
  }

  // Label in 8x8 font
  drawText8x8(label, x + 6, y + Math.floor((h - 8) / 2), "#ffffff", 1);

  const valStr = `${Math.round(val)}/${Math.round(max)}`;
  const valWidth = valStr.length * 8;
  drawText8x8(valStr, x + w - valWidth - 6, y + Math.floor((h - 8) / 2), "#f8b800", 1);

  ctx.restore();
}

// ---------------------------------------------------------------------------
// 1. Top HUD Bar & Bottom Action Toolbar (Embedded Font)
// ---------------------------------------------------------------------------

function renderTopHudBar() {
  if (!world) return;
  const clock = world.clock;

  drawNESBox(0, 0, CANVAS_WIDTH, 32);

  // Title
  drawText8x8("BRUTOPOLIS", 12, 12, "#f8b800", 1);

  // Time & Ambient Stats
  const timeStr = `D${String(clock.day).padStart(2,"0")} ${String(clock.hour).padStart(2,"0")}:${String(clock.minute).padStart(2,"0")}`;
  drawText8x8(timeStr, 125, 12, "#ffffff", 1);

  drawText8x8(`SUN:${Math.round(clock.globalLight * 100)}%`, 255, 12, "#3cbcfc", 1);
  drawText8x8(`HEAT:${Math.round(clock.globalHeat * 100)}%`, 340, 12, "#f83800", 1);

  const presetNames = ["ARCHIPELAGO", "CONTINENT", "HIGHLANDS"];
  drawText8x8(presetNames[currentPreset] || "WORLD", 435, 12, "#58d854", 1);

  drawText8x8(`${currentFps}FPS`, 565, 12, "#bcbcbc", 1);
  drawText8x8(`${currentTps}TPS`, 635, 12, "#bcbcbc", 1);

  // Pause / Run Button
  const pauseTxt = isPaused ? "PAUSE" : "RUN";
  drawNESButton(CANVAS_WIDTH - 82, 4, 76, 24, pauseTxt, !isPaused, isPaused);
  registerClickableRegion(CANVAS_WIDTH - 82, 4, 76, 24, togglePause);
}

function renderBottomToolbar() {
  drawNESBox(0, CANVAS_HEIGHT - 36, CANVAS_WIDTH, 36);

  const buttons = [
    { label: "DOSSIER", mode: "INSPECT" },
    { label: "ENTITIES", mode: "ENTITIES" },
    { label: "GROUPS", mode: "GROUPS" },
    { label: "LOGS", mode: "LOGS" },
    { label: "SPAWN", mode: "SPAWNER" },
    { label: "NEXT", action: cycleNextLivingEntity },
    { label: "CENTER", action: centerCamera },
    { label: "RESET", action: () => resetWorld((currentPreset + 1) % 3) }
  ];

  let btnX = 8;
  for (const b of buttons) {
    const isAct = currentMode === b.mode;
    const bw = b.label.length * 8 + 18;
    drawNESButton(btnX, CANVAS_HEIGHT - 30, bw, 24, b.label, isAct, false);

    const targetMode = b.mode;
    const targetAction = b.action;
    registerClickableRegion(btnX, CANVAS_HEIGHT - 30, bw, 24, () => {
      if (targetAction) {
        targetAction();
      } else if (targetMode) {
        currentMode = currentMode === targetMode ? "MAP" : targetMode;
        modalScroll = 0;
        inspectingLogEvent = null;
      }
    });

    btnX += bw + 6;
  }

  // Hover Tile / Target Summary
  if (shader && world) {
    const zoom = shader.exports.wasm_get_camera_zoom();
    const tileSize = 16.0 * zoom;
    const cx = shader.exports.wasm_get_camera_x();
    const cy = shader.exports.wasm_get_camera_y();
    const hoverTileX = Math.floor(cx + (mouseX - CANVAS_WIDTH / 2) / tileSize);
    const hoverTileY = Math.floor(cy + (mouseY - CANVAS_HEIGHT / 2) / tileSize);

    const tile = world.getTile(hoverTileX, hoverTileY);
    const tileName = (world.getTileName(tile) || "VOID").toUpperCase();
    const hoverInfo = `[${hoverTileX},${hoverTileY}] ${tileName}`;

    drawText8x8(hoverInfo, CANVAS_WIDTH - hoverInfo.length * 8 - 12, CANVAS_HEIGHT - 22, "#f8b800", 1);
  }
}

// ---------------------------------------------------------------------------
// 2. In-Engine Modal 1: Biological Dossier Screen ([I])
// ---------------------------------------------------------------------------

function renderDossierModal() {
  const mx = 40;
  const my = 40;
  const mw = CANVAS_WIDTH - 80;
  const mh = CANVAS_HEIGHT - 86;

  ctx.save();
  ctx.fillStyle = "rgba(0, 0, 0, 0.9)";
  ctx.fillRect(0, 32, CANVAS_WIDTH, CANVAS_HEIGHT - 68);

  drawNESBox(mx, my, mw, mh);

  drawNESButton(mx + mw - 32, my + 6, 26, 24, "X", false, true);
  registerClickableRegion(mx + mw - 32, my + 6, 26, 24, () => { currentMode = "MAP"; });

  const target = getEntityById(lastSelectedId);

  if (!target || target.destroyed) {
    drawText8x8("NO CREATURE SELECTED", mx + 20, my + 30, "#f8b800", 1);
    drawText8x8("CLICK ON MAP OR PRESS [TAB] TO SELECT.", mx + 20, my + 50, "#ffffff", 1);
    ctx.restore();
    return;
  }

  const props = target.properties;
  const name = (props.name || `ENTITY #${target.id}`).toUpperCase();
  const species = (props.species || "UNKNOWN").toUpperCase();
  const groupName = (props.group?.name || "SOLITARY").toUpperCase();

  // Title
  drawText8x8(`DOSSIER: ${name} (#${target.id})`, mx + 16, my + 14, "#f8b800", 1);

  // Action Buttons
  drawNESButton(mx + mw - 195, my + 6, 75, 24, "FOCUS", false, false);
  registerClickableRegion(mx + mw - 195, my + 6, 75, 24, centerCamera);

  drawNESButton(mx + mw - 112, my + 6, 75, 24, "KILL", false, true);
  registerClickableRegion(mx + mw - 112, my + 6, 75, 24, () => {
    explodeEntityOnDeath(target, entities, world);
    destroyEntity(target, entities);
    cycleNextLivingEntity();
  });

  // Overview Info Box
  drawNESBox(mx + 10, my + 36, mw - 20, 52);
  drawText8x8(`SPECIES: ${species}`, mx + 20, my + 46, "#3cbcfc", 1);
  drawText8x8(`CLAN: ${groupName}`, mx + 250, my + 46, "#d3869b", 1);
  drawText8x8(`POS: [${target.x},${target.y}]`, mx + 490, my + 46, "#f8b800", 1);

  const statusTxt = props.life ? (props.life.energy > 0 ? "STATUS: LIVE" : "STATUS: DEAD") : "STATUS: ITEM";
  const statusCol = props.life ? (props.life.energy > 0 ? "#58d854" : "#f83800") : "#f8b800";
  drawText8x8(statusTxt, mx + 20, my + 66, statusCol, 1);
  drawText8x8(`PROPERTIES: ${Object.keys(props).length}`, mx + 250, my + 66, "#bcbcbc", 1);

  // Vital Gauges
  let gaugeY = my + 94;
  if (props.life) {
    drawNESProgressBar(mx + 10, gaugeY, mw - 20, 18, props.life.energy, props.life.max || 100, "HP ENERGY", "#58d854");
    gaugeY += 22;
  }

  const condProp = Object.values(props).find(p => p && typeof p.condition === "number" && typeof p.maxCondition === "number");
  if (condProp) {
    drawNESProgressBar(mx + 10, gaugeY, mw - 20, 18, condProp.condition, condProp.maxCondition, "BODY CONDITION", "#3cbcfc");
    gaugeY += 22;
  }

  if (props.bladder) {
    drawNESProgressBar(mx + 10, gaugeY, mw - 20, 18, props.bladder.water, props.bladder.maxWater, "WATER BLADDER", "#0078f8");
    gaugeY += 22;
  }

  // Raw Memory Property Dump Box
  const dumpY = gaugeY + 4;
  const dumpH = (my + mh - 12) - dumpY;
  drawNESBox(mx + 10, dumpY, mw - 20, dumpH);

  const lines = [];
  lines.push("--- RAW MEMORY PROPERTY BAG ---");

  for (const [k, v] of Object.entries(props)) {
    if (typeof v === "object" && v !== null) {
      lines.push(`+ [${k.toUpperCase()}]:`);
      for (const [subk, subv] of Object.entries(v)) {
        if (typeof subv === "function") lines.push(`   ${subk.toUpperCase()}: (FN)`);
        else if (Array.isArray(subv)) lines.push(`   ${subk.toUpperCase()}: [${subv.length}]`);
        else if (typeof subv === "object" && subv !== null) lines.push(`   ${subk.toUpperCase()}: (OBJ)`);
        else lines.push(`   ${subk.toUpperCase()}: ${subv}`);
      }
    } else {
      lines.push(`+ ${k.toUpperCase()}: ${v}`);
    }
  }

  const maxScroll = Math.max(0, lines.length - Math.floor(dumpH / 14));
  modalScroll = Math.max(0, Math.min(maxScroll, modalScroll));

  let textY = dumpY + 12;
  const visibleCount = Math.floor((dumpH - 12) / 14);

  for (let i = modalScroll; i < Math.min(lines.length, modalScroll + visibleCount); i++) {
    const line = lines[i];
    const col = line.startsWith("---") ? "#f8b800" : line.startsWith("+ [") ? "#3cbcfc" : "#ffffff";
    drawText8x8(line.slice(0, 76), mx + 20, textY, col, 1);
    textY += 14;
  }

  ctx.restore();
}

// ---------------------------------------------------------------------------
// 3. In-Engine Modal 2: Entities Registry Screen ([E])
// ---------------------------------------------------------------------------

function getFilteredEntities() {
  return entities.filter(e => {
    if (e.destroyed) return false;
    if (entityFilter === "LIVING") return !!e.properties.life;
    if (entityFilter === "ITEMS") return !!e.properties.edible || !!e.properties.resourceType || !!e.properties.germination;
    if (entityFilter === "HUMANOID") return e.properties.name?.includes("Knight") || e.properties.name?.includes("Archer") || e.properties.name?.includes("Goblin");
    if (entityFilter === "BEAST") return e.properties.species === "wolf" || e.properties.species === "bear" || e.properties.species === "cat" || e.properties.species === "scorpion" || e.properties.species === "lizard" || e.properties.species === "goat" || e.properties.species === "dragon";
    if (entityFilter === "FLORA") return e.properties.species === "oak" || e.properties.species === "willow" || e.properties.species === "pine" || e.properties.species === "cactus" || e.properties.species === "shrub";
    return true;
  });
}

function renderEntitiesModal() {
  const mx = 30;
  const my = 40;
  const mw = CANVAS_WIDTH - 60;
  const mh = CANVAS_HEIGHT - 86;

  ctx.save();
  ctx.fillStyle = "rgba(0, 0, 0, 0.9)";
  ctx.fillRect(0, 32, CANVAS_WIDTH, CANVAS_HEIGHT - 68);

  drawNESBox(mx, my, mw, mh);

  drawNESButton(mx + mw - 32, my + 6, 26, 24, "X", false, true);
  registerClickableRegion(mx + mw - 32, my + 6, 26, 24, () => { currentMode = "MAP"; });

  const list = getFilteredEntities();
  drawText8x8(`ENTITIES (${list.length})`, mx + 16, my + 14, "#f8b800", 1);

  // Filter Buttons
  const filters = ["ALL", "LIVING", "HUMANOID", "BEAST", "FLORA", "ITEMS"];
  let fx = mx + 16;
  for (const f of filters) {
    const isAct = entityFilter === f;
    const fw = f.length * 8 + 16;
    drawNESButton(fx, my + 36, fw, 22, f, isAct, false);
    registerClickableRegion(fx, my + 36, fw, 22, () => {
      entityFilter = f;
      modalScroll = 0;
    });
    fx += fw + 6;
  }

  // Table Box
  const tableY = my + 64;
  const tableH = mh - 74;
  drawNESBox(mx + 10, tableY, mw - 20, tableH);

  // Column Headers
  drawText8x8("ID", mx + 20, tableY + 12, "#f8b800", 1);
  drawText8x8("NAME", mx + 65, tableY + 12, "#f8b800", 1);
  drawText8x8("SPECIES", mx + 250, tableY + 12, "#f8b800", 1);
  drawText8x8("POS", mx + 380, tableY + 12, "#f8b800", 1);
  drawText8x8("HP", mx + 470, tableY + 12, "#f8b800", 1);
  drawText8x8("STATUS", mx + 550, tableY + 12, "#f8b800", 1);
  drawText8x8("CLAN", mx + 635, tableY + 12, "#f8b800", 1);

  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(mx + 12, tableY + 24);
  ctx.lineTo(mx + mw - 12, tableY + 24);
  ctx.stroke();

  // Rows
  const rowH = 20;
  const visibleRows = Math.floor((tableH - 28) / rowH);
  const maxScroll = Math.max(0, list.length - visibleRows);
  modalScroll = Math.max(0, Math.min(maxScroll, modalScroll));

  let rowY = tableY + 32;
  for (let i = modalScroll; i < Math.min(list.length, modalScroll + visibleRows); i++) {
    const ent = list[i];
    const isSelected = ent.id === lastSelectedId;
    const isHover = mouseX >= mx + 12 && mouseX <= mx + mw - 12 && mouseY >= rowY - 4 && mouseY <= rowY + 16;

    if (isSelected || isHover) {
      ctx.fillStyle = isSelected ? "#222244" : "#181818";
      ctx.fillRect(mx + 12, rowY - 4, mw - 24, rowH);
    }

    const cursorPrefix = isSelected || isHover ? "▶" : " ";
    drawText8x8(`${cursorPrefix}#${ent.id}`, mx + 16, rowY + 2, isSelected || isHover ? "#f8b800" : "#ffffff", 1);
    drawText8x8((ent.properties.name || "ENTITY").slice(0, 18).toUpperCase(), mx + 65, rowY + 2, "#ffffff", 1);
    drawText8x8((ent.properties.species || "-").slice(0, 10).toUpperCase(), mx + 250, rowY + 2, "#3cbcfc", 1);
    drawText8x8(`[${ent.x},${ent.y}]`, mx + 380, rowY + 2, "#bcbcbc", 1);

    const energyStr = ent.properties.life ? `${Math.round(ent.properties.life.energy)}` : "-";
    drawText8x8(energyStr, mx + 470, rowY + 2, "#58d854", 1);

    const statusStr = ent.properties.life ? (ent.properties.life.energy > 0 ? "LIVE" : "DEAD") : "ITEM";
    const statusCol = ent.properties.life ? (ent.properties.life.energy > 0 ? "#58d854" : "#f83800") : "#f8b800";
    drawText8x8(statusStr, mx + 550, rowY + 2, statusCol, 1);
    drawText8x8((ent.properties.group?.name || "-").slice(0, 9).toUpperCase(), mx + 635, rowY + 2, "#d3869b", 1);

    const curEnt = ent;
    registerClickableRegion(mx + 12, rowY - 4, mw - 24, rowH, () => {
      lastSelectedId = curEnt.id;
      if (shader) {
        shader.exports.wasm_select_entity(curEnt.id);
        shader.exports.wasm_set_camera(curEnt.x, curEnt.y, shader.exports.wasm_get_camera_zoom());
      }
      currentMode = "INSPECT";
    });

    rowY += rowH;
  }

  ctx.restore();
}

// ---------------------------------------------------------------------------
// 4. In-Engine Modal 3: Groups Registry Screen ([G])
// ---------------------------------------------------------------------------

function getAllGroups() {
  const map = new Map();
  for (const e of entities) {
    if (e.destroyed) continue;
    if (e.properties && e.properties.group) {
      const g = e.properties.group;
      if (!map.has(g.id)) map.set(g.id, g);
    }
  }
  return Array.from(map.values());
}

function renderGroupsModal() {
  const mx = 40;
  const my = 40;
  const mw = CANVAS_WIDTH - 80;
  const mh = CANVAS_HEIGHT - 86;

  ctx.save();
  ctx.fillStyle = "rgba(0, 0, 0, 0.9)";
  ctx.fillRect(0, 32, CANVAS_WIDTH, CANVAS_HEIGHT - 68);

  drawNESBox(mx, my, mw, mh);

  drawNESButton(mx + mw - 32, my + 6, 26, 24, "X", false, true);
  registerClickableRegion(mx + mw - 32, my + 6, 26, 24, () => { currentMode = "MAP"; });

  const groups = getAllGroups();
  drawText8x8(`CLANS & FACTIONS (${groups.length})`, mx + 16, my + 14, "#f8b800", 1);

  if (groups.length === 0) {
    drawText8x8("NO FACTIONS FOUNDED YET.", mx + 20, my + 50, "#ffffff", 1);
    ctx.restore();
    return;
  }

  const cardW = mw - 24;
  let cardY = my + 44;

  for (let i = modalScroll; i < Math.min(groups.length, modalScroll + 4); i++) {
    const g = groups[i];
    const livingMembers = g.members.filter(mid => entities.some(e => e.id === mid && !e.destroyed)).length;
    const leaderEnt = entities.find(e => e.id === g.members[0] && !e.destroyed);

    drawNESBox(mx + 12, cardY, cardW, 76);

    drawText8x8(`* ${(g.name || "CLAN").toUpperCase()}`, mx + 24, cardY + 16, "#f8b800", 1);
    drawText8x8(`${livingMembers}/${g.members.length} ALIVE`, mx + cardW - 130, cardY + 16, "#58d854", 1);

    drawText8x8(`LEADER: ${leaderEnt ? leaderEnt.properties.name.toUpperCase() : `MEMBER #${g.members[0]}`}`, mx + 24, cardY + 36, "#ffffff", 1);
    drawText8x8(`TERRITORY: ${g.claimedZones?.join(", ") || "NONE"}`, mx + 24, cardY + 54, "#bcbcbc", 1);

    // Focus Button
    drawNESButton(mx + cardW - 85, cardY + 38, 75, 24, "FOCUS", false, false);
    registerClickableRegion(mx + cardW - 85, cardY + 38, 75, 24, () => {
      if (leaderEnt && shader) {
        lastSelectedId = leaderEnt.id;
        shader.exports.wasm_select_entity(leaderEnt.id);
        shader.exports.wasm_set_camera(leaderEnt.x, leaderEnt.y, shader.exports.wasm_get_camera_zoom());
        currentMode = "MAP";
      }
    });

    cardY += 84;
  }

  ctx.restore();
}

// ---------------------------------------------------------------------------
// 5. In-Engine Modal 4: World Event Log Explorer & Detail Window ([L])
// ---------------------------------------------------------------------------

function getFilteredLogs() {
  const events = allEvents.slice().reverse();
  if (logFilter === "ALL") return events;
  return events.filter(e => e.type === logFilter);
}

function renderLogsModal() {
  const mx = 30;
  const my = 40;
  const mw = CANVAS_WIDTH - 60;
  const mh = CANVAS_HEIGHT - 86;

  ctx.save();
  ctx.fillStyle = "rgba(0, 0, 0, 0.9)";
  ctx.fillRect(0, 32, CANVAS_WIDTH, CANVAS_HEIGHT - 68);

  drawNESBox(mx, my, mw, mh);

  drawNESButton(mx + mw - 32, my + 6, 26, 24, "X", false, true);
  registerClickableRegion(mx + mw - 32, my + 6, 26, 24, () => {
    if (inspectingLogEvent) inspectingLogEvent = null;
    else currentMode = "MAP";
  });

  // If viewing a specific event detail:
  if (inspectingLogEvent) {
    renderLogDetailView(mx, my, mw, mh, inspectingLogEvent);
    ctx.restore();
    return;
  }

  const list = getFilteredLogs();
  drawText8x8(`WORLD LOG (${list.length}) - CLICK EVENT TO INSPECT`, mx + 16, my + 14, "#f8b800", 1);

  // Filter Buttons
  const filters = ["ALL", "ATTACK", "RELATION", "DIALOGUE", "AMPUTATION", "BIRTH", "DEATH", "SPROUT"];
  let fx = mx + 16;
  for (const f of filters) {
    const isAct = logFilter === f;
    const fw = f.length * 8 + 14;
    drawNESButton(fx, my + 36, fw, 22, f, isAct, false);
    registerClickableRegion(fx, my + 36, fw, 22, () => {
      logFilter = f;
      modalScroll = 0;
    });
    fx += fw + 4;
  }

  // Event List Box
  const tableY = my + 64;
  const tableH = mh - 74;
  drawNESBox(mx + 10, tableY, mw - 20, tableH);

  const rowH = 20;
  const visibleRows = Math.floor((tableH - 16) / rowH);
  const maxScroll = Math.max(0, list.length - visibleRows);
  modalScroll = Math.max(0, Math.min(maxScroll, modalScroll));

  let rowY = tableY + 16;
  for (let i = modalScroll; i < Math.min(list.length, modalScroll + visibleRows); i++) {
    const ev = list[i];
    const isHover = mouseX >= mx + 12 && mouseX <= mx + mw - 12 && mouseY >= rowY - 4 && mouseY <= rowY + 16;

    if (isHover) {
      ctx.fillStyle = "#181828";
      ctx.fillRect(mx + 12, rowY - 4, mw - 24, rowH);
    }

    const ts = ev.timestamp ? `D${ev.timestamp.day} ${String(ev.timestamp.hour).padStart(2,"0")}:${String(ev.timestamp.minute).padStart(2,"0")}` : `T${ev.tick}`;
    drawText8x8(ts, mx + 18, rowY + 2, "#bcbcbc", 1);

    const typeColor = ev.type === "DEATH" ? "#f83800" : ev.type === "ATTACK" ? "#f8b800" : ev.type === "AMPUTATION" ? "#e40058" : ev.type === "RELATION" ? "#d3869b" : ev.type === "DIALOGUE" ? "#3cbcfc" : ev.type === "BIRTH" ? "#f8b800" : ev.type === "SPROUT" ? "#58d854" : "#ffffff";
    drawText8x8(`[${ev.type}]`, mx + 115, rowY + 2, typeColor, 1);

    const locStr = ev.location ? `[${ev.location.x},${ev.location.y}] ` : "";
    const shortDesc = `${locStr}${ev.description}`.slice(0, 52).toUpperCase();
    drawText8x8(shortDesc, mx + 235, rowY + 2, "#ffffff", 1);

    // Detail click
    const curEv = ev;
    registerClickableRegion(mx + 12, rowY - 4, mw - 24, rowH, () => {
      inspectingLogEvent = curEv;
    });

    rowY += rowH;
  }

  ctx.restore();
}

function renderLogDetailView(mx, my, mw, mh, ev) {
  const typeColor = ev.type === "DEATH" ? "#f83800" : ev.type === "ATTACK" ? "#f8b800" : ev.type === "AMPUTATION" ? "#e40058" : ev.type === "RELATION" ? "#d3869b" : ev.type === "DIALOGUE" ? "#3cbcfc" : ev.type === "BIRTH" ? "#f8b800" : ev.type === "SPROUT" ? "#58d854" : "#ffffff";

  drawText8x8(`EVENT DETAIL (#${ev.id})`, mx + 16, my + 14, "#f8b800", 1);

  // Detail Container Box
  drawNESBox(mx + 14, my + 38, mw - 28, mh - 50);

  drawText8x8(`EVENT TYPE: [${ev.type}]`, mx + 30, my + 56, typeColor, 1);

  const ts = ev.timestamp ? `DAY ${ev.timestamp.day} ${String(ev.timestamp.hour).padStart(2,"0")}:${String(ev.timestamp.minute).padStart(2,"0")}` : `TICK ${ev.tick}`;
  drawText8x8(`TIME: ${ts}`, mx + 30, my + 76, "#ffffff", 1);

  if (ev.location) {
    drawText8x8(`COORDINATES: [X: ${ev.location.x}, Y: ${ev.location.y}]`, mx + 30, my + 96, "#bcbcbc", 1);
  }

  if (ev.primaryEntityId !== null && ev.primaryEntityId !== undefined) {
    drawText8x8(`PRIMARY ENTITY: #${ev.primaryEntityId}`, mx + 30, my + 116, "#3cbcfc", 1);
  }

  // Full Unwrapped Narrative Box
  drawNESBox(mx + 30, my + 135, mw - 60, mh - 220);
  drawText8x8("FULL NARRATIVE LOG:", mx + 42, my + 150, "#f8b800", 1);

  const maxCharsPerLine = Math.floor((mw - 84) / 8);
  const wrappedLines = wrapText8x8((ev.description || "NO DESCRIPTION RECORDED.").toUpperCase(), maxCharsPerLine);
  let narrativeY = my + 172;

  for (const wline of wrappedLines) {
    drawText8x8(wline, mx + 42, narrativeY, "#ffffff", 1);
    narrativeY += 16;
  }

  // Action Buttons inside Detail view
  if (ev.location) {
    drawNESButton(mx + 30, my + mh - 70, 200, 30, "JUMP TO LOCATION", false, false);
    registerClickableRegion(mx + 30, my + mh - 70, 200, 30, () => {
      if (shader) {
        shader.exports.wasm_set_camera(ev.location.x, ev.location.y, shader.exports.wasm_get_camera_zoom());
        currentMode = "MAP";
      }
    });
  }

  drawNESButton(mx + mw - 190, my + mh - 70, 160, 30, "BACK TO LOGS", false, false);
  registerClickableRegion(mx + mw - 190, my + mh - 70, 160, 30, () => {
    inspectingLogEvent = null;
  });
}

// ---------------------------------------------------------------------------
// 6. In-Engine Modal 5: Spawner Tool Screen ([S])
// ---------------------------------------------------------------------------

function renderSpawnerModal() {
  const mx = 50;
  const my = 40;
  const mw = CANVAS_WIDTH - 100;
  const mh = CANVAS_HEIGHT - 86;

  ctx.save();
  ctx.fillStyle = "rgba(0, 0, 0, 0.9)";
  ctx.fillRect(0, 32, CANVAS_WIDTH, CANVAS_HEIGHT - 68);

  drawNESBox(mx, my, mw, mh);

  drawNESButton(mx + mw - 32, my + 6, 26, 24, "X", false, true);
  registerClickableRegion(mx + mw - 32, my + 6, 26, 24, () => { currentMode = "MAP"; });

  drawText8x8("SPAWNER TOOL", mx + 16, my + 14, "#f8b800", 1);

  const spawners = [
    { label: "KNIGHT", fn: createKnight },
    { label: "ARCHER", fn: createArcher },
    { label: "WOLF", fn: createWolf },
    { label: "BEAR", fn: createBear },
    { label: "CAT", fn: createCat },
    { label: "GOBLIN", fn: createGoblin },
    { label: "BAT", fn: createBat },
    { label: "SERPENT", fn: createSeaSerpent },
    { label: "DRAGON", fn: createDragon },
    { label: "CACTUS", fn: createCactus },
    { label: "SCORPION", fn: createScorpion },
    { label: "LIZARD", fn: createLizard },
    { label: "GOAT", fn: createMountainGoat },
    { label: "SHRUB", fn: createAlpineShrub },
    { label: "WOOD", fn: createWoodItem },
    { label: "STONE", fn: createStoneItem },
    { label: "SEED", fn: (x,y) => createSeedEntity(x,y,"large","oak") },
    { label: "FRUIT", fn: (x,y) => createFruit(x,y,"large","oak") }
  ];

  const cols = 2;
  const colW = (mw - 36) / cols;
  const itemH = 26;

  for (let i = 0; i < spawners.length; i++) {
    const s = spawners[i];
    const col = i % cols;
    const row = Math.floor(i / cols);
    const sx = mx + 18 + col * colW;
    const sy = my + 44 + row * (itemH + 6);

    drawNESButton(sx, sy, colW - 10, itemH, `+ ${s.label}`, false, false);

    const spawnFn = s.fn;
    registerClickableRegion(sx, sy, colW - 10, itemH, () => {
      spawnEntityAtCamera(spawnFn);
      currentMode = "MAP";
    });
  }

  ctx.restore();
}

// ---------------------------------------------------------------------------
// 7. Hover In-Game Floating Creature Tooltip (8x8 Font)
// ---------------------------------------------------------------------------

function renderHoverTooltip() {
  if (currentMode !== "MAP" || !shader || !world) return;

  const zoom = shader.exports.wasm_get_camera_zoom();
  const tileSize = 16.0 * zoom;
  const cx = shader.exports.wasm_get_camera_x();
  const cy = shader.exports.wasm_get_camera_y();
  const hoverTileX = Math.floor(cx + (mouseX - CANVAS_WIDTH / 2) / tileSize);
  const hoverTileY = Math.floor(cy + (mouseY - CANVAS_HEIGHT / 2) / tileSize);

  const hoveredEnt = entities.find(e => !e.destroyed && e.x === hoverTileX && e.y === hoverTileY);
  if (!hoveredEnt) return;

  const tw = 180;
  const th = 56;
  const tx = Math.min(CANVAS_WIDTH - tw - 12, mouseX + 16);
  const ty = Math.min(CANVAS_HEIGHT - th - 44, mouseY + 16);

  drawNESBox(tx, ty, tw, th);

  ctx.save();
  drawText8x8((hoveredEnt.properties.name || "ENTITY").slice(0, 18).toUpperCase(), tx + 8, ty + 10, "#f8b800", 1);
  drawText8x8(`SP:${(hoveredEnt.properties.species || "-").toUpperCase()}`, tx + 8, ty + 24, "#ffffff", 1);

  if (hoveredEnt.properties.life) {
    drawNESProgressBar(tx + 8, ty + 36, tw - 16, 12, hoveredEnt.properties.life.energy, hoveredEnt.properties.life.max || 100, "HP", "#58d854");
  } else {
    drawText8x8("ITEM / RESOURCE", tx + 8, ty + 38, "#3cbcfc", 1);
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Main Animation Frame Loop
// ---------------------------------------------------------------------------

function frame(time) {
  const dt = lastTime > 0 ? (time - lastTime) * 0.001 : 0.016;
  lastTime = time;

  // FPS Counter
  fpsFrames++;
  if (time - lastFpsUpdate >= 1000) {
    currentFps = fpsFrames;
    fpsFrames = 0;
    lastFpsUpdate = time;
  }

  handleCameraKeys(dt);
  activeUiRegions = [];

  if (shader && world) {
    // 1. Tick Simulation if not paused
    if (!isPaused) {
      world.clock.tick(dt);

      simAccumulator += dt;
      const stepDt = 1.0 / currentTps;
      const maxSteps = 15;
      let steps = 0;

      while (simAccumulator >= stepDt && steps < maxSteps) {
        simAccumulator -= stepDt;
        steps++;
        incrementEngineTick();
        tickEntities(entities, stepDt, world);
      }
      if (steps >= maxSteps) simAccumulator = 0;
    }

    // 2. Sync renderable entities into WASM shared memory
    syncRenderToWasm(entities, mem, shader.exports);

    // 3. Update WASM clock & lighting
    shader.exports.wasm_set_clock(
      world.clock.day,
      world.clock.hour,
      world.clock.minute,
      world.clock.globalLight,
      world.clock.globalHeat,
      entities.length
    );

    // 4. Run WASM Pixel Renderer
    shader.exports._start(
      mem.heapBase,
      CANVAS_WIDTH,
      CANVAS_HEIGHT,
      time * 0.001,
      mouseX,
      mouseY,
      mouseButtons,
      dt
    );

    // 5. Blit rendered pixel buffer to Canvas
    const pixelsU8 = new Uint8Array(mem.buffer, mem.heapBase, FRAMEBUFFER_SIZE);
    imageData.data.set(pixelsU8);
    ctx.putImageData(imageData, 0, 0);

    // 6. Draw Pure In-Engine Canvas UI Overlay using Renderer's 8x8 Font
    renderTopHudBar();
    renderBottomToolbar();
    renderHoverTooltip();

    if (currentMode === "INSPECT") renderDossierModal();
    else if (currentMode === "ENTITIES") renderEntitiesModal();
    else if (currentMode === "GROUPS") renderGroupsModal();
    else if (currentMode === "LOGS") renderLogsModal();
    else if (currentMode === "SPAWNER") renderSpawnerModal();
  }

  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------------------
// Bootloader
// ---------------------------------------------------------------------------

async function init() {
  try {
    shader = await wash_load("./brutopolis.wasm", mem);
    world = new World(mem, shader.exports);
    resetWorld(0);
    console.log("✓ Brutopolis (Pure Canvas Engine with Embedded 8x8 Font) initialized successfully!");
    requestAnimationFrame(frame);
  } catch (err) {
    console.error("Failed to load Brutopolis:", err);
  }
}

init();
