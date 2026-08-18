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
  createTerrestrialProp,
  createAquaticProp,
  createFlyingProp,
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
  createSeedEntity,
  createHumanMiner,
  createHumanBuilder,
  createHumanCrafter,
  createHumanFarmer,
  createHumanMatriarch,
  createStoneWallEntity,
  createFarmerProp,
  createMysticGraceProp,
  createScatologicalProp,
  getMoodLabel,
  getGroupStockpile
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

// Simulation Speed & Time State
let isPaused = false;
let simSpeed = 1.0; // 0.5x, 1x, 2x, 4x, 8x, 16x
const SPEED_TIERS = [0.5, 1.0, 2.0, 4.0, 8.0, 16.0];
let currentPreset = 0;
let lastSelectedId = -1;

// Performance
let lastTime = 0;
let fpsFrames = 0;
let currentFps = 60;
let lastFpsUpdate = performance.now();
let tpsCounter = 0;
let measuredTps = 60;
let lastTpsUpdate = performance.now();

// Active In-Game Screen Mode ("MAP", "INSPECT", "ENTITIES", "GROUPS", "LOGS", "SPAWNER")
let currentMode = "MAP";
let modalScroll = 0;
let inspectingLogEvent = null;
let inspectingGroup = null; // Currently inspected clan for full dossier/stockpile view
let visualizedGroupId = null; // ID of clan whose claimed territory is being highlighted on map
let isFollowMode = false; // Camera automatically follows and locks onto selected creature
let isCreatureVisionMode = false; // "See through creature's eyes" perception FOV & Fog of War

function toggleFollowMode() {
  isFollowMode = !isFollowMode;
}

function toggleCreatureVisionMode() {
  isCreatureVisionMode = !isCreatureVisionMode;
}

function parseZoneCoords(zoneStr) {
  if (!zoneStr) return null;
  const parts = zoneStr.includes("_") ? zoneStr.split("_") : zoneStr.split(",");
  const zx = parseInt(parts[0], 10);
  const zy = parseInt(parts[1], 10);
  if (isNaN(zx) || isNaN(zy)) return null;
  return {
    zx,
    zy,
    minX: zx * 8,
    minY: zy * 8,
    maxX: zx * 8 + 7,
    maxY: zy * 8 + 7,
    centerX: zx * 8 + 4,
    centerY: zy * 8 + 4
  };
}

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

function spawnRandomGlobal(count, factoryFn, conditionFn = null) {
  let spawned = 0;
  for (let attempt = 0; attempt < count * 8 && spawned < count; attempt++) {
    const rx = Math.floor(Math.random() * 508) + 2;
    const ry = Math.floor(Math.random() * 508) + 2;
    if (!conditionFn || conditionFn(rx, ry)) {
      const e = factoryFn(rx, ry);
      if (e.properties.life) {
        e.properties.mystic_grace = createMysticGraceProp(180);
      }
      entities.push(e);
      spawned++;
    }
  }
}

function resetWorld(presetId = 0) {
  if (!shader) return;
  currentPreset = presetId;
  const seed = Math.floor(Math.random() * 1000000) + 1;
  if (shader.exports.wasm_init_with_seed) {
    shader.exports.wasm_init_with_seed(presetId, seed);
  } else {
    shader.exports.wasm_init(presetId);
  }

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

  // 1. Determine spawn position for Camera and Founding Clan
  let startX = 256;
  let startY = 256;
  for (let r = 0; r < 100; r++) {
    let found = false;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (world.isWalkable(256 + dx, 256 + dy)) {
          startX = 256 + dx;
          startY = 256 + dy;
          found = true;
          break;
        }
      }
      if (found) break;
    }
    if (found) break;
  }

  // 2. Founding Human Clan: Miner, Builder, Crafter, Farmer and Pregnant Matriarch
  const miner = createHumanMiner(startX, startY, "Aldor, o Minerador");
  const builder = createHumanBuilder(startX + 1, startY, "Brom, o Construtor");
  const crafter = createHumanCrafter(startX, startY + 1, "Cedric, o Artesão");
  const farmer = createHumanFarmer(startX - 1, startY, "Farid, o Fazendeiro");
  const matriarch = createHumanMatriarch(startX + 1, startY + 1, "Elena, a Matriarca");

  const zx = Math.floor(startX / 8);
  const zy = Math.floor(startY / 8);
  const zone1 = `${zx},${zy}`;
  const zone2 = `${zx + 1},${zy}`;

  const foundingClan = createGroup("Clã dos Pioneiros", miner, [zx, zy], [zone1, zone2]);
  foundingClan.storage = ["stone", "stone", "stone", "stone", "wood", "wood", "wood", "wood"];
  miner.properties.group = foundingClan;
  builder.properties.group = foundingClan;
  crafter.properties.group = foundingClan;
  farmer.properties.group = foundingClan;
  matriarch.properties.group = foundingClan;

  foundingClan.members = [miner.id, builder.id, crafter.id, farmer.id, matriarch.id];

  // Mutual high initial affinity (+85) and initial mystic grace
  const clanMembers = [miner, builder, crafter, farmer, matriarch];
  for (const m1 of clanMembers) {
    m1.properties.mystic_grace = createMysticGraceProp(180);
    if (m1.properties.brain) {
      if (!m1.properties.brain.affinities) m1.properties.brain.affinities = {};
      for (const m2 of clanMembers) {
        if (m1 !== m2) m1.properties.brain.affinities[m2.id] = 85;
      }
    }
  }

  entities.push(miner, builder, crafter, farmer, matriarch);

  // Initial clan resources placed right in territory center
  for (let i = 0; i < 4; i++) {
    entities.push(createWoodItem(startX + (i % 2), startY + Math.floor(i / 2)));
    entities.push(createStoneItem(startX - 1 + (i % 2), startY + Math.floor(i / 2)));
  }

  // Position camera and selection right on the founding clan!
  lastSelectedId = miner.id;
  shader.exports.wasm_select_entity(miner.id);
  shader.exports.wasm_set_camera(startX, startY, 2.0);
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
  } else if (e.code === "KeyF") {
    toggleFollowMode();
  } else if (e.code === "KeyV") {
    toggleCreatureVisionMode();
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
    else if (inspectingGroup) inspectingGroup = null;
    else currentMode = "MAP";
  } else if (e.code === "Equal" || e.code === "NumpadAdd" || e.code === "BracketRight") {
    const idx = SPEED_TIERS.indexOf(simSpeed);
    if (idx !== -1 && idx < SPEED_TIERS.length - 1) simSpeed = SPEED_TIERS[idx + 1];
    else simSpeed = Math.min(32, simSpeed * 2);
    if (shader) shader.exports.wasm_set_tps(Math.round(60 * simSpeed));
  } else if (e.code === "Minus" || e.code === "NumpadSubtract" || e.code === "BracketLeft") {
    const idx = SPEED_TIERS.indexOf(simSpeed);
    if (idx > 0) simSpeed = SPEED_TIERS[idx - 1];
    else simSpeed = Math.max(0.25, simSpeed / 2);
    if (shader) shader.exports.wasm_set_tps(Math.round(60 * simSpeed));
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

  // Time & Sun Stats
  const timeStr = `D${String(clock.day).padStart(2,"0")} ${String(clock.hour).padStart(2,"0")}:${String(clock.minute).padStart(2,"0")}`;
  drawText8x8(timeStr, 125, 12, "#ffffff", 1);

  drawText8x8(`SUN:${Math.round(clock.globalLight * 100)}%`, 245, 12, "#3cbcfc", 1);

  const presetNames = ["ARCHIPELAGO", "CONTINENT", "HIGHLANDS"];
  drawText8x8(presetNames[currentPreset] || "WORLD", 345, 12, "#58d854", 1);

  drawText8x8(`${currentFps}FPS`, 460, 12, "#bcbcbc", 1);

  // Speed Controls on HUD
  drawNESButton(525, 4, 18, 24, "-", false, false);
  registerClickableRegion(525, 4, 18, 24, () => {
    const idx = SPEED_TIERS.indexOf(simSpeed);
    if (idx > 0) simSpeed = SPEED_TIERS[idx - 1];
    else simSpeed = Math.max(0.25, simSpeed / 2);
    if (shader) shader.exports.wasm_set_tps(Math.round(60 * simSpeed));
  });

  const speedStr = `${simSpeed}X (${Math.round(60 * simSpeed)}TPS)`;
  drawText8x8(speedStr, 549, 12, "#f8b800", 1);
  registerClickableRegion(549, 4, speedStr.length * 8 + 8, 24, () => {
    const idx = SPEED_TIERS.indexOf(simSpeed);
    simSpeed = SPEED_TIERS[(idx + 1) % SPEED_TIERS.length];
    if (shader) shader.exports.wasm_set_tps(Math.round(60 * simSpeed));
  });

  const plusX = 557 + speedStr.length * 8;
  drawNESButton(plusX, 4, 18, 24, "+", false, false);
  registerClickableRegion(plusX, 4, 18, 24, () => {
    const idx = SPEED_TIERS.indexOf(simSpeed);
    if (idx !== -1 && idx < SPEED_TIERS.length - 1) simSpeed = SPEED_TIERS[idx + 1];
    else simSpeed = Math.min(32, simSpeed * 2);
    if (shader) shader.exports.wasm_set_tps(Math.round(60 * simSpeed));
  });

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
    { label: isFollowMode ? "FOLLOW*" : "FOLLOW", action: toggleFollowMode },
    { label: isCreatureVisionMode ? "VISION*" : "VISION", action: toggleCreatureVisionMode },
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
  drawText8x8(`PROPERTIES: ${Object.keys(props).length}`, mx + 230, my + 66, "#bcbcbc", 1);

  const domains = [];
  if (props.terrestrial) domains.push("TERRESTRE");
  if (props.aquatic) domains.push("AQUATICO");
  if (props.flying) domains.push("VOADOR");
  const domainStr = domains.length > 0 ? domains.join(" + ") : "ESTÁTICO";
  drawText8x8(`DOMÍNIO: ${domainStr}`, mx + 440, my + 66, "#58d854", 1);

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

  if (props.brain && typeof props.brain.mood === "number") {
    const moodVal = props.brain.mood;
    const moodCol = moodVal >= 25 ? "#58d854" : moodVal >= -20 ? "#3cbcfc" : "#f83800";
    drawNESProgressBar(mx + 10, gaugeY, mw - 20, 18, moodVal + 100, 200, `HUMOR: ${getMoodLabel(moodVal).toUpperCase()}`, moodCol);
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
  registerClickableRegion(mx + mw - 32, my + 6, 26, 24, () => {
    if (inspectingGroup) inspectingGroup = null;
    else currentMode = "MAP";
  });

  // If viewing full Clan Dossier / Stockpile Detail
  if (inspectingGroup) {
    renderGroupDetailView(mx, my, mw, mh, inspectingGroup);
    ctx.restore();
    return;
  }

  const groups = getAllGroups();
  drawText8x8(`CLANS & FACTIONS (${groups.length}) - CLICK DETAILS TO INSPECT`, mx + 16, my + 14, "#f8b800", 1);

  if (groups.length === 0) {
    drawText8x8("NO FACTIONS FOUNDED YET.", mx + 20, my + 50, "#ffffff", 1);
    ctx.restore();
    return;
  }

  const cardW = mw - 24;
  let cardY = my + 44;

  for (let i = modalScroll; i < Math.min(groups.length, modalScroll + 3); i++) {
    const g = groups[i];
    const livingMembers = g.members.filter(mid => entities.some(e => e.id === mid && !e.destroyed)).length;
    const leaderEnt = entities.find(e => e.id === g.members[0] && !e.destroyed);
    const stockpile = getGroupStockpile(g, entities);

    drawNESBox(mx + 12, cardY, cardW, 102);

    drawText8x8(`* ${(g.name || "CLAN").toUpperCase()}`, mx + 24, cardY + 14, "#f8b800", 1);
    drawText8x8(`${livingMembers}/${g.members.length} ALIVE`, mx + cardW - 325, cardY + 14, "#58d854", 1);

    drawText8x8(`LEADER: ${leaderEnt ? leaderEnt.properties.name.toUpperCase() : `MEMBER #${g.members[0]}`}`, mx + 24, cardY + 32, "#ffffff", 1);
    drawText8x8(`TERRITORY: ${g.claimedZones?.join(", ") || "NONE"} (${(g.claimedZones?.length || 0) * 64} TILES)`, mx + 24, cardY + 48, "#bcbcbc", 1);

    // Stockpile Summary
    const stockEntries = Object.entries(stockpile.items);
    let stockStr = "VAZIO (EMPTY)";
    if (stockEntries.length > 0) {
      stockStr = stockEntries.map(([name, count]) => `${name}: x${count}`).join(" | ");
    }
    const maxStockLen = Math.floor((cardW - 40) / 8);
    if (stockStr.length > maxStockLen) {
      stockStr = stockStr.slice(0, maxStockLen - 3) + "...";
    }

    drawText8x8(`ESTOQUE (${stockpile.totalCount} ITENS): ${stockStr.toUpperCase()}`, mx + 24, cardY + 66, "#ffd700", 1);
    drawText8x8(`LOCAL: [CHAO: ${stockpile.breakdown.ground} | MEMBROS: ${stockpile.breakdown.members} | RESERVA: ${stockpile.breakdown.storage}]`, mx + 24, cardY + 82, "#3cbcfc", 1);

    // Full Details Button
    const curG = g;
    drawNESButton(mx + cardW - 255, cardY + 30, 80, 24, "DETAILS", false, false);
    registerClickableRegion(mx + cardW - 255, cardY + 30, 80, 24, () => {
      inspectingGroup = curG;
    });

    // View Claimed Territory Button
    const isViewing = visualizedGroupId === g.id;
    drawNESButton(mx + cardW - 170, cardY + 30, 80, 24, isViewing ? "ZONE*" : "ZONE", isViewing, false);
    registerClickableRegion(mx + cardW - 170, cardY + 30, 80, 24, () => {
      visualizedGroupId = g.id;
      let sumX = 0, sumY = 0, count = 0;
      for (const zk of g.claimedZones || []) {
        const coords = parseZoneCoords(zk);
        if (coords) {
          sumX += coords.centerX;
          sumY += coords.centerY;
          count++;
        }
      }
      if (count > 0 && shader) {
        shader.exports.wasm_set_camera(sumX / count, sumY / count, 1.5);
      }
      currentMode = "MAP";
    });

    // Focus Leader Button
    drawNESButton(mx + cardW - 85, cardY + 30, 75, 24, "LEADER", false, false);
    registerClickableRegion(mx + cardW - 85, cardY + 30, 75, 24, () => {
      if (leaderEnt && shader) {
        lastSelectedId = leaderEnt.id;
        shader.exports.wasm_select_entity(leaderEnt.id);
        shader.exports.wasm_set_camera(leaderEnt.x, leaderEnt.y, shader.exports.wasm_get_camera_zoom());
        currentMode = "MAP";
      }
    });

    cardY += 108;
  }

  ctx.restore();
}

/**
 * Full-screen Clan Dossier: detailed territory, itemized stockpile, and member roster.
 */
function renderGroupDetailView(mx, my, mw, mh, g) {
  const livingMembers = g.members.filter(mid => entities.some(e => e.id === mid && !e.destroyed));
  const leaderEnt = entities.find(e => e.id === g.members[0] && !e.destroyed);
  const stockpile = getGroupStockpile(g, entities);

  drawText8x8(`CLAN DOSSIER: ${(g.name || "CLAN").toUpperCase()}`, mx + 16, my + 14, "#f8b800", 1);

  // Top Actions
  drawNESButton(mx + mw - 250, my + 6, 100, 24, "TERRITORY", false, false);
  registerClickableRegion(mx + mw - 250, my + 6, 100, 24, () => {
    visualizedGroupId = g.id;
    let sumX = 0, sumY = 0, count = 0;
    for (const zk of g.claimedZones || []) {
      const coords = parseZoneCoords(zk);
      if (coords) {
        sumX += coords.centerX;
        sumY += coords.centerY;
        count++;
      }
    }
    if (count > 0 && shader) {
      shader.exports.wasm_set_camera(sumX / count, sumY / count, 1.5);
    }
    currentMode = "MAP";
  });

  drawNESButton(mx + mw - 145, my + 6, 100, 24, "FOCUS LEADER", false, false);
  registerClickableRegion(mx + mw - 145, my + 6, 100, 24, () => {
    if (leaderEnt && shader) {
      lastSelectedId = leaderEnt.id;
      shader.exports.wasm_select_entity(leaderEnt.id);
      shader.exports.wasm_set_camera(leaderEnt.x, leaderEnt.y, shader.exports.wasm_get_camera_zoom());
      currentMode = "MAP";
    }
  });

  // 1. Territory & Base Box
  const box1Y = my + 38;
  const box1H = 56;
  drawNESBox(mx + 12, box1Y, mw - 24, box1H);
  drawText8x8("TERRITORY & CLAIMED ZONES:", mx + 20, box1Y + 12, "#ffd700", 1);
  const zoneListStr = (g.claimedZones || []).map(zk => {
    const c = parseZoneCoords(zk);
    return c ? `${zk} [X:${c.minX}..${c.maxX}, Y:${c.minY}..${c.maxY}]` : zk;
  }).join(" | ");
  drawText8x8(zoneListStr || "NENHUMA ZONA REIVINDICADA", mx + 20, box1Y + 30, "#ffffff", 1);

  // 2. Complete Itemized Stockpile Box
  const box2Y = box1Y + box1H + 8;
  const box2H = 110;
  drawNESBox(mx + 12, box2Y, mw - 24, box2H);
  drawText8x8(`ESTOQUE TOTAL (${stockpile.totalCount} ITENS DISPONIVEIS):`, mx + 20, box2Y + 12, "#ffd700", 1);
  drawText8x8(`DISTRIBUICAO: [NO CHAO DO TERRITORIO: ${stockpile.breakdown.ground} | COM MEMBROS: ${stockpile.breakdown.members} | NA RESERVA DO CLA: ${stockpile.breakdown.storage}]`, mx + 20, box2Y + 28, "#3cbcfc", 1);

  const stockEntries = Object.entries(stockpile.items);
  let stockLinesY = box2Y + 48;
  if (stockEntries.length === 0) {
    drawText8x8("NENHUM RECURSO OU ITEM EM ESTOQUE NO MOMENTO.", mx + 20, stockLinesY, "#bcbcbc", 1);
  } else {
    const maxCharsPerLine = Math.floor((mw - 60) / 8);
    const stockFormatted = stockEntries.map(([name, count]) => `• ${name}: ${count} unidades`).join("   ");
    const wrappedStock = wrapText8x8(stockFormatted.toUpperCase(), maxCharsPerLine);
    for (const sLine of wrappedStock.slice(0, 3)) {
      drawText8x8(sLine, mx + 20, stockLinesY, "#58d854", 1);
      stockLinesY += 16;
    }
  }

  // 3. Member Roster & Hand Inventories Box
  const box3Y = box2Y + box2H + 8;
  const box3H = (my + mh - 12) - box3Y;
  drawNESBox(mx + 12, box3Y, mw - 24, box3H);
  drawText8x8(`ROSTER DE MEMBROS (${livingMembers.length}/${g.members.length} VIVOS):`, mx + 20, box3Y + 12, "#ffd700", 1);

  let rosterY = box3Y + 30;
  for (let mi = 0; mi < g.members.length; mi++) {
    if (rosterY + 24 > box3Y + box3H) break;
    const mid = g.members[mi];
    const mEnt = entities.find(e => e.id === mid && !e.destroyed);

    const isAlive = !!mEnt;
    const mName = mEnt ? mEnt.properties.name.toUpperCase() : `MEMBRO #${mid} (MORTO)`;
    const mRole = mEnt ? (mEnt.properties.role || mEnt.properties.species || "HUMAN").toUpperCase() : "-";
    const hpStr = mEnt?.properties.life ? `${Math.round(mEnt.properties.life.energy)}HP` : "-";

    // Held items
    let heldStr = "MAOS: VAZIAS";
    if (mEnt) {
      const left = mEnt.properties.arm_left?.heldItem;
      const right = mEnt.properties.arm_right?.heldItem;
      const held = [];
      if (left) held.push(`ESQ:${left.resourceType || left.name || "ITEM"}`);
      if (right) held.push(`DIR:${right.resourceType || right.name || "ITEM"}`);
      if (held.length > 0) heldStr = held.join(" | ").toUpperCase();
    }

    const mText = `• ${mName} [${mRole}] - ${hpStr} | ${heldStr}`;
    drawText8x8(mText.slice(0, Math.floor((mw - 140) / 8)), mx + 20, rosterY + 4, isAlive ? "#ffffff" : "#9c5050", 1);

    if (mEnt) {
      const curM = mEnt;
      drawNESButton(mx + mw - 100, rosterY - 2, 70, 20, "FOCUS", false, false);
      registerClickableRegion(mx + mw - 100, rosterY - 2, 70, 20, () => {
        lastSelectedId = curM.id;
        if (shader) {
          shader.exports.wasm_select_entity(curM.id);
          shader.exports.wasm_set_camera(curM.x, curM.y, shader.exports.wasm_get_camera_zoom());
        }
        currentMode = "MAP";
      });
    }

    rosterY += 24;
  }
}

/**
 * Renders glowing claimed territory overlay on the world map for the selected clan.
 */
function renderTerritoryOverlay() {
  if (currentMode !== "MAP" || !shader || !world || visualizedGroupId === null) return;
  const groups = getAllGroups();
  const g = groups.find(grp => grp.id === visualizedGroupId);
  if (!g) {
    visualizedGroupId = null;
    return;
  }

  const zoom = shader.exports.wasm_get_camera_zoom();
  const tileSize = 16.0 * zoom;
  const cx = shader.exports.wasm_get_camera_x();
  const cy = shader.exports.wasm_get_camera_y();
  const centerScreenX = CANVAS_WIDTH / 2;
  const centerScreenY = CANVAS_HEIGHT / 2;

  ctx.save();

  // Draw Claimed Macro-Chunks
  for (const zk of g.claimedZones || []) {
    const coords = parseZoneCoords(zk);
    if (!coords) continue;

    const screenX = centerScreenX + (coords.minX - cx) * tileSize;
    const screenY = centerScreenY + (coords.minY - cy) * tileSize;
    const screenW = 8 * tileSize;
    const screenH = 8 * tileSize;

    // Only draw if on screen
    if (screenX + screenW < 0 || screenX > CANVAS_WIDTH || screenY + screenH < 0 || screenY > CANVAS_HEIGHT) continue;

    // Translucent Tinted Fill
    ctx.fillStyle = "rgba(248, 184, 0, 0.18)";
    ctx.fillRect(screenX, screenY, screenW, screenH);

    // Glowing Border
    ctx.strokeStyle = "#ffd700";
    ctx.lineWidth = 2;
    ctx.strokeRect(screenX, screenY, screenW, screenH);

    // Corner Accents
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(screenX, screenY, 4, 4);
    ctx.fillRect(screenX + screenW - 4, screenY, 4, 4);
    ctx.fillRect(screenX, screenY + screenH - 4, 4, 4);
    ctx.fillRect(screenX + screenW - 4, screenY + screenH - 4, 4, 4);

    // Zone Badge
    const zoneBadge = `ZONE [${coords.zx},${coords.zy}]`;
    drawText8x8(zoneBadge, screenX + 4, screenY + 4, "#ffd700", 1);
  }

  // Floating Territory Banner on Top HUD area
  const bannerText = `TERRITORY: ${(g.name || "CLAN").toUpperCase()}`;
  const bannerW = bannerText.length * 8 + 80;
  const bannerX = Math.floor((CANVAS_WIDTH - bannerW) / 2);
  const bannerY = 38;

  drawNESBox(bannerX, bannerY, bannerW, 26);
  drawText8x8(bannerText, bannerX + 8, bannerY + 9, "#ffd700", 1);

  drawNESButton(bannerX + bannerW - 55, bannerY + 3, 50, 20, "HIDE", false, true);
  registerClickableRegion(bannerX + bannerW - 55, bannerY + 3, 50, 20, () => {
    visualizedGroupId = null;
  });

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
  const filters = ["ALL", "KILL", "ATTACK", "RELATION", "DIALOGUE", "AMPUTATION", "BIRTH", "DEATH", "SPROUT"];
  let fx = mx + 16;
  for (const f of filters) {
    const isAct = logFilter === f;
    const fw = f.length * 8 + 12;
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

    const typeColor = ev.type === "KILL" ? "#ff2040" : ev.type === "DEATH" ? "#9c5050" : ev.type === "ATTACK" ? "#f8b800" : ev.type === "AMPUTATION" ? "#e40058" : ev.type === "RELATION" ? "#d3869b" : ev.type === "DIALOGUE" ? "#3cbcfc" : ev.type === "BIRTH" ? "#f8b800" : ev.type === "SPROUT" ? "#58d854" : "#ffffff";
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
  const typeColor = ev.type === "KILL" ? "#ff2040" : ev.type === "DEATH" ? "#9c5050" : ev.type === "ATTACK" ? "#f8b800" : ev.type === "AMPUTATION" ? "#e40058" : ev.type === "RELATION" ? "#d3869b" : ev.type === "DIALOGUE" ? "#3cbcfc" : ev.type === "BIRTH" ? "#f8b800" : ev.type === "SPROUT" ? "#58d854" : "#ffffff";

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
    { label: "FARMER", fn: createHumanFarmer },
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
    { label: "WALL", fn: (x, y) => createStoneWallEntity(x, y) },
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

/**
 * Renders authentic creature perception vision ("Ver pelos olhos da criatura"):
 * - Active perception range: 100% full vibrant color
 * - Explored / Known zones: dimmed dark fog-of-war
 * - Unexplored / Unknown zones: pitch black
 */
function renderCreatureVisionOverlay() {
  if (currentMode !== "MAP" || !shader || !world || !isCreatureVisionMode || lastSelectedId <= 0) return;
  const target = getEntityById(lastSelectedId);
  if (!target || target.destroyed) {
    isCreatureVisionMode = false;
    return;
  }

  const zoom = shader.exports.wasm_get_camera_zoom();
  const tileSize = 16.0 * zoom;
  const camX = shader.exports.wasm_get_camera_x();
  const camY = shader.exports.wasm_get_camera_y();
  const centerScreenX = CANVAS_WIDTH / 2;
  const centerScreenY = CANVAS_HEIGHT / 2;

  const viewRange = target.properties.eye_left?.viewRange || target.properties.eye_right?.viewRange || 8;
  const creatureScreenX = centerScreenX + (target.x - camX) * tileSize + tileSize / 2;
  const creatureScreenY = centerScreenY + (target.y - camY) * tileSize + tileSize / 2;
  const visionRadiusPx = (viewRange + 0.6) * tileSize;

  // Build creature's known macro-zone keys (8x8 chunks)
  const knownZones = new Set();
  if (target.properties.brain?.geoMemory) {
    for (const k of Object.keys(target.properties.brain.geoMemory)) {
      knownZones.add(k);
    }
  }
  if (target.properties.group?.claimedZones) {
    for (const zk of target.properties.group.claimedZones) {
      const parts = zk.includes("_") ? zk.split("_") : zk.split(",");
      knownZones.add(`${parts[0]}_${parts[1]}`);
    }
  }
  // Current zone is always known
  knownZones.add(`${Math.floor(target.x / 8)}_${Math.floor(target.y / 8)}`);

  const minTx = Math.floor(camX - (centerScreenX / tileSize) - 1);
  const maxTx = Math.ceil(camX + (centerScreenX / tileSize) + 1);
  const minTy = Math.floor(camY - (centerScreenY / tileSize) - 1);
  const maxTy = Math.ceil(camY + (centerScreenY / tileSize) + 1);

  const minZx = Math.floor(minTx / 8);
  const maxZx = Math.floor(maxTx / 8);
  const minZy = Math.floor(minTy / 8);
  const maxZy = Math.floor(maxTy / 8);

  ctx.save();

  // Create clipping region for everything strictly OUTSIDE the creature's perception circle
  ctx.beginPath();
  ctx.rect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  ctx.arc(creatureScreenX, creatureScreenY, visionRadiusPx, 0, Math.PI * 2, true);
  ctx.closePath();
  ctx.clip();

  // 1. Draw solid pitch black on unknown zones and dark translucent on known zones (only outside perception radius)
  for (let zy = minZy; zy <= maxZy; zy++) {
    for (let zx = minZx; zx <= maxZx; zx++) {
      const zk = `${zx}_${zy}`;
      const screenX = centerScreenX + (zx * 8 - camX) * tileSize;
      const screenY = centerScreenY + (zy * 8 - camY) * tileSize;
      const screenW = 8 * tileSize;
      const screenH = 8 * tileSize;

      const isKnown = knownZones.has(zk);
      if (isKnown) {
        // Known zone: darker / dimmed (fog-of-war memory)
        ctx.fillStyle = "rgba(0, 0, 0, 0.70)";
        ctx.fillRect(screenX, screenY, screenW, screenH);
      } else {
        // Unknown zone: completely pitch black
        ctx.fillStyle = "#000000";
        ctx.fillRect(screenX, screenY, screenW, screenH);
      }
    }
  }

  ctx.restore();

  // 2. Subtle soft perception perimeter ring
  ctx.save();
  ctx.strokeStyle = "rgba(255, 215, 0, 0.7)";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.arc(creatureScreenX, creatureScreenY, visionRadiusPx, 0, Math.PI * 2);
  ctx.stroke();

  // Badge on screen
  const badge = `[VISION: ${(target.properties.name || "CREATURE").toUpperCase()} (RANGE: ${viewRange})]`;
  drawText8x8(badge, 8, CANVAS_HEIGHT - 48, "#ffd700", 1);
  ctx.restore();
}

/**
 * Compact HUD Box with Summary Info and Quick Toggles for Selected Creature
 */
function renderCreatureSummaryBox() {
  if (currentMode !== "MAP" || lastSelectedId <= 0) return;
  const ent = getEntityById(lastSelectedId);
  if (!ent || ent.destroyed) return;

  const bx = 8;
  const by = 38;
  const bw = 240;
  const bh = 82;

  drawNESBox(bx, by, bw, bh);

  const nameStr = (ent.properties.name || `Entity #${ent.id}`).slice(0, 18).toUpperCase();
  drawText8x8(nameStr, bx + 8, by + 8, "#f8b800", 1);

  const speciesStr = (ent.properties.species || "Creature").toUpperCase();
  const clanStr = (ent.properties.group?.name || "Solitary").slice(0, 10).toUpperCase();
  drawText8x8(`${speciesStr} | ${clanStr}`, bx + 8, by + 20, "#3cbcfc", 1);

  if (ent.properties.life) {
    drawNESProgressBar(bx + 8, by + 32, bw - 16, 12, ent.properties.life.energy, ent.properties.life.max || 100, "HP", "#58d854");
  }

  // Toggles for Follow & Vision
  const followTxt = isFollowMode ? "FOLLOW:ON" : "FOLLOW:OFF";
  drawNESButton(bx + 8, by + 50, 108, 24, followTxt, isFollowMode, false);
  registerClickableRegion(bx + 8, by + 50, 108, 24, () => {
    isFollowMode = !isFollowMode;
  });

  const visionTxt = isCreatureVisionMode ? "VISION:ON" : "VISION:OFF";
  drawNESButton(bx + 124, by + 50, 108, 24, visionTxt, isCreatureVisionMode, false);
  registerClickableRegion(bx + 124, by + 50, 108, 24, () => {
    isCreatureVisionMode = !isCreatureVisionMode;
  });
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

  // Automatic Camera Tracking / Follow Mode
  if (isFollowMode && lastSelectedId > 0 && shader) {
    const target = getEntityById(lastSelectedId);
    if (target && !target.destroyed) {
      const curZoom = shader.exports.wasm_get_camera_zoom();
      shader.exports.wasm_set_camera(target.x, target.y, curZoom);
    } else {
      isFollowMode = false;
    }
  }

  if (shader && world) {
    // 1. Tick Simulation if not paused
    if (!isPaused) {
      const effectiveDt = Math.min(dt, 0.1) * simSpeed;
      world.clock.tick(effectiveDt);
      incrementEngineTick();
      tickEntities(entities, effectiveDt, world);
      tpsCounter++;
    }

    if (time - lastTpsUpdate >= 1000) {
      measuredTps = Math.round(tpsCounter * (1000 / Math.max(1, time - lastTpsUpdate)));
      tpsCounter = 0;
      lastTpsUpdate = time;
    }

    // 2. Sync renderable entities into WASM shared memory
    syncRenderToWasm(entities, mem, shader.exports);

    // 3. Update WASM clock & lighting
    shader.exports.wasm_set_clock(
      world.clock.day,
      world.clock.hour,
      world.clock.minute,
      world.clock.globalLight,
      0.0,
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
    renderCreatureVisionOverlay();
    renderTerritoryOverlay();
    renderTopHudBar();
    renderBottomToolbar();
    renderHoverTooltip();
    renderCreatureSummaryBox();

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
