#!/usr/bin/env node

// =============================================================================
// Brutopolis — Terminal-Based Biological Ecosystem Runner (ANSI 24-bit TrueColor)
// =============================================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
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
  createKnight,
  createArcher,
  createCat,
  createWolf,
  createBear,
  createGoblin,
  createBat,
  createSeaSerpent,
  createDragon,
  createOakTree,
  createWillowTree,
  createPineTree,
  createWaterLily,
  createSeaweed,
  createFruit,
  createSeedEntity
} from "./js/properties.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// Simulation State
// ---------------------------------------------------------------------------

let shader = null;
let world = null;
let entities = [];
let mem = null;

let isPaused = false;
let currentTps = 60;
let simAccumulator = 0;
let selectedEntityId = -1;
let currentPreset = 0;
let showHelp = false;
let isMouseEnabled = true;

// Timing & FPS
let lastTime = Date.now();
let fpsFrames = 0;
let currentFps = 60;
let lastFpsUpdate = Date.now();

// ---------------------------------------------------------------------------
// Terminal Setup & Mouse SGR Handling
// ---------------------------------------------------------------------------

let termCols = process.stdout.columns || 120;
let termRows = process.stdout.rows || 40;

// Dynamic Viewport Dimensions
let sidebarWidth = 46;
let mapCols = Math.max(30, termCols - sidebarWidth - 1);
let mapRows = Math.max(15, termRows - 2);

// Framebuffer dimensions (2 vertical pixels per terminal character row using half-blocks ▀)
let fbWidth = mapCols;
let fbHeight = mapRows * 2;
let framePixels = new Uint8Array(fbWidth * fbHeight * 4);

function updateLayoutDimensions() {
  termCols = process.stdout.columns || 120;
  termRows = process.stdout.rows || 40;

  sidebarWidth = termCols >= 110 ? 46 : (termCols >= 90 ? 38 : 30);
  mapCols = Math.max(20, termCols - sidebarWidth - 1);
  mapRows = Math.max(10, termRows - 2);

  fbWidth = mapCols;
  fbHeight = mapRows * 2;
  const newSize = fbWidth * fbHeight * 4;
  if (framePixels.length !== newSize) {
    framePixels = new Uint8Array(newSize);
  }
}

process.stdout.on("resize", () => {
  updateLayoutDimensions();
});

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
  selectedEntityId = -1;

  // 1. Adult Trees Spread Globally (Oak, Willow, Pine)
  spawnRandomGlobal(70, createOakTree, (x, y) => world.getTile(x, y) === 0);
  spawnRandomGlobal(60, createWillowTree, (x, y) => world.getTile(x, y) === 0 || world.getTile(x, y) === 2);
  spawnRandomGlobal(50, createPineTree, (x, y) => world.getTile(x, y) === 0 || world.getTile(x, y) === 1);

  // 2. Aquatic Plants in Seas and Lakes
  spawnRandomGlobal(80, createWaterLily, (x, y) => world.getTile(x, y) === 2);
  spawnRandomGlobal(100, createSeaweed, (x, y) => world.getTile(x, y) === 2);

  // 3. Seeds & Fruits Scattered Globally
  spawnRandomGlobal(150, (x, y) => createSeedEntity(x, y, Math.random() < 0.5 ? "large" : "small", Math.random() < 0.5 ? "oak" : "willow"), (x, y) => world.getTile(x, y) === 0);
  spawnRandomGlobal(80, (x, y) => createFruit(x, y, Math.random() < 0.5 ? "large" : "small", Math.random() < 0.5 ? "oak" : "willow"), (x, y) => world.isWalkable(x, y));

  // 4. Animals & Humanoids
  spawnRandomGlobal(25, (x, y) => createCat(x, y, false), (x, y) => world.getTile(x, y) === 0);
  spawnRandomGlobal(18, createWolf, (x, y) => world.getTile(x, y) === 0 || world.getTile(x, y) === 1);
  spawnRandomGlobal(10, createBear, (x, y) => world.getTile(x, y) === 0);
  spawnRandomGlobal(30, createBat, (x, y) => true);
  spawnRandomGlobal(20, createSeaSerpent, (x, y) => world.getTile(x, y) === 2);
  spawnRandomGlobal(4, createDragon, (x, y) => world.getTile(x, y) === 1);
  spawnRandomGlobal(20, (x, y) => createKnight(x, y, Math.random() < 0.5 ? "male" : "female"), (x, y) => world.getTile(x, y) === 0);
  spawnRandomGlobal(20, (x, y) => createArcher(x, y, Math.random() < 0.5 ? "male" : "female"), (x, y) => world.getTile(x, y) === 0);
  spawnRandomGlobal(25, createGoblin, (x, y) => world.getTile(x, y) === 0 || world.getTile(x, y) === 1);

  // Select first living entity
  const firstLiving = entities.find(e => e.properties && e.properties.life);
  if (firstLiving) {
    selectedEntityId = firstLiving.id;
    shader.exports.wasm_select_entity(firstLiving.id);
  }
}

function spawnEntityAtCamera(factoryFn) {
  if (!shader) return;
  const cx = Math.floor(shader.exports.wasm_get_camera_x());
  const cy = Math.floor(shader.exports.wasm_get_camera_y());
  const ent = factoryFn(cx, cy);
  entities.push(ent);
  selectedEntityId = ent.id;
  shader.exports.wasm_select_entity(ent.id);
}

function cycleNextEntity() {
  if (entities.length === 0) return;
  const living = entities.filter(e => !e.destroyed && e.properties && e.properties.life);
  if (living.length === 0) return;

  const curIdx = living.findIndex(e => e.id === selectedEntityId);
  const nextIdx = (curIdx + 1) % living.length;
  const nextEnt = living[nextIdx];
  selectedEntityId = nextEnt.id;
  if (shader) {
    shader.exports.wasm_select_entity(nextEnt.id);
    shader.exports.wasm_set_camera(nextEnt.x, nextEnt.y, shader.exports.wasm_get_camera_zoom());
  }
}

// ---------------------------------------------------------------------------
// High-Speed ANSI Half-Block Frame Renderer
// ---------------------------------------------------------------------------

function renderTerminalFrame() {
  if (!shader || !world) return;

  const now = Date.now();
  const dt = Math.min(0.1, (now - lastTime) * 0.001);
  lastTime = now;

  // FPS Counter
  fpsFrames++;
  if (now - lastFpsUpdate >= 1000) {
    currentFps = fpsFrames;
    fpsFrames = 0;
    lastFpsUpdate = now;
  }

  // 1. Tick Simulation if not paused
  if (!isPaused) {
    world.clock.tick(dt);
    simAccumulator += dt;
    const stepDt = 1.0 / currentTps;
    const maxSteps = 10;
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

  // 4. Render 2D pixel map to WASM memory buffer
  shader.exports._start(
    mem.heapBase,
    fbWidth,
    fbHeight,
    now * 0.001,
    0,
    0,
    0,
    dt
  );

  // Copy WASM rendered RGBA pixels
  const wasmPixels = new Uint8Array(mem.buffer, mem.heapBase, fbWidth * fbHeight * 4);
  framePixels.set(wasmPixels);

  // 5. Build ANSI Text Buffer with Side-by-Side Split Screen
  let output = "\x1b[H"; // Move cursor to top-left (0,0)

  // Top Header Bar
  const clock = world.clock;
  const timeStr = `DIA ${String(clock.day).padStart(2, "0")} ${String(clock.hour).padStart(2, "0")}:${String(clock.minute).padStart(2, "0")}`;
  const lightStr = `LUZ ${Math.round(clock.globalLight * 100)}%`;
  const tempStr = `TEMP ${Math.round(clock.globalHeat * 100)}%`;
  const pauseBadge = isPaused ? "\x1b[1;41;37m [PAUSADO] \x1b[0m" : "\x1b[1;32m [RODANDO] \x1b[0m";
  const presetNames = ["Arquipélago", "Continente", "Terras Altas"];
  const headerLeft = ` \x1b[1;38;5;208m❖ BRUTOPOLIS\x1b[0m \x1b[90m│\x1b[0m \x1b[1;33m${timeStr}\x1b[0m \x1b[90m│\x1b[0m \x1b[33m${lightStr}\x1b[0m \x1b[90m│\x1b[0m \x1b[31m${tempStr}\x1b[0m \x1b[90m│\x1b[0m ${pauseBadge}`;
  const headerRight = `\x1b[36m${presetNames[currentPreset] || "Mundo"}\x1b[0m \x1b[90m│\x1b[0m \x1b[32m${currentFps} FPS\x1b[0m \x1b[90m│\x1b[0m \x1b[33m${currentTps} TPS\x1b[0m `;
  
  // Format Header line
  output += `\x1b[48;5;235m${headerLeft}${" ".repeat(Math.max(2, termCols - 68))}${headerRight}\x1b[0m\n`;

  // Get Inspected Entity Data
  const inspected = getEntityById(selectedEntityId);
  const sidebarLines = buildSidebarLines(inspected, sidebarWidth);

  // High-Speed ANSI Half-Block Row Rendering (▀)
  let lastFg = -1;
  let lastBg = -1;

  for (let row = 0; row < mapRows; row++) {
    const yTop = row * 2;
    const yBot = row * 2 + 1;

    const rowTopOffset = yTop * fbWidth * 4;
    const rowBotOffset = (yBot < fbHeight ? yBot : yTop) * fbWidth * 4;

    for (let x = 0; x < mapCols; x++) {
      const offTop = rowTopOffset + x * 4;
      const offBot = rowBotOffset + x * 4;

      const r1 = framePixels[offTop + 0];
      const g1 = framePixels[offTop + 1];
      const b1 = framePixels[offTop + 2];

      const r2 = framePixels[offBot + 0];
      const g2 = framePixels[offBot + 1];
      const b2 = framePixels[offBot + 2];

      const fgColor = (r1 << 16) | (g1 << 8) | b1;
      const bgColor = (r2 << 16) | (g2 << 8) | b2;

      if (fgColor !== lastFg) {
        output += `\x1b[38;2;${r1};${g1};${b1}m`;
        lastFg = fgColor;
      }
      if (bgColor !== lastBg) {
        output += `\x1b[48;2;${r2};${g2};${b2}m`;
        lastBg = bgColor;
      }

      output += "▀";
    }

    // Reset Color at border separator
    output += "\x1b[0m\x1b[90m│\x1b[0m";
    lastFg = -1;
    lastBg = -1;

    // Append Sidebar Column Line
    const sbLine = sidebarLines[row] || "";
    output += `${sbLine}\x1b[0m\n`;
  }

  // Footer Command Bar
  const footPop = `\x1b[32mPop: ${entities.length}\x1b[0m \x1b[90m(\x1b[32m${entities.filter(e => e.properties.life).length} vivos\x1b[90m)\x1b[0m`;
  const footHelp = `\x1b[90m[\x1b[33mWASD\x1b[90m] Mover [\x1b[33mQ/E\x1b[90m] Zoom [\x1b[33mEspaço\x1b[90m] Pausa [\x1b[33mTab\x1b[90m] Próximo [\x1b[33m1-9\x1b[90m] Spawn [\x1b[33mK\x1b[90m] Kill [\x1b[33mR\x1b[90m] Reset [\x1b[33mH\x1b[90m] Ajuda\x1b[0m`;
  output += `\x1b[48;5;235m ${footPop} \x1b[90m│\x1b[0m ${footHelp}${" ".repeat(Math.max(1, termCols - 92))}\x1b[0m`;

  process.stdout.write(output);
}

// ---------------------------------------------------------------------------
// Sidebar Text Formatter
// ---------------------------------------------------------------------------

function buildProgressBar(value, max, length = 12, color = "\x1b[32m") {
  const pct = Math.max(0, Math.min(1, max > 0 ? value / max : 0));
  const filled = Math.round(pct * length);
  const empty = length - filled;
  return `${color}${"█".repeat(filled)}${"\x1b[90m"}${"░".repeat(empty)}\x1b[0m ${Math.round(pct * 100)}%`;
}

function buildSidebarLines(entity, width) {
  const lines = [];
  const pad = (s) => s.padEnd(width).slice(0, width);

  lines.push(` \x1b[1;37m─── INSPETOR BIOLÓGICO ───\x1b[0m`);

  if (!entity || entity.destroyed) {
    lines.push(` \x1b[90mNenhuma criatura selecionada\x1b[0m`);
    lines.push(` \x1b[90mClique no mapa ou use [Tab]\x1b[0m`);
    lines.push(``);
    lines.push(` \x1b[1;33mPOPULAÇÃO & NATUREZA:\x1b[0m`);
    lines.push(`   Total: \x1b[37m${entities.length}\x1b[0m entidades`);
    lines.push(`   Vivas: \x1b[32m${entities.filter(e => e.properties.life).length}\x1b[0m criaturas`);
    lines.push(`   Alimentos: \x1b[33m${entities.filter(e => e.properties.edible).length}\x1b[0m itens`);
    lines.push(``);
    lines.push(` \x1b[1;36mÚLTIMOS ACONTECIMENTOS:\x1b[0m`);
    const recent = getRecentWorldEvents(6);
    for (const ev of recent) {
      const typeColor = ev.type === "DEATH" ? "\x1b[31m" : ev.type === "ATTACK" ? "\x1b[33m" : ev.type === "AMPUTATION" ? "\x1b[35m" : "\x1b[36m";
      lines.push(`  ${typeColor}•\x1b[0m \x1b[90m[${ev.type}]\x1b[0m \x1b[37m${ev.description.slice(0, width - 14)}\x1b[0m`);
    }
    return lines;
  }

  // Entity Details Header
  const name = entity.properties.name || `Entidade #${entity.id}`;
  const species = entity.properties.species || "desconhecida";
  const pos = `X:${entity.x} Y:${entity.y}`;
  lines.push(` \x1b[1;33m${name}\x1b[0m \x1b[90m(#${entity.id})\x1b[0m`);
  lines.push(`   \x1b[90mEspécie:\x1b[0m \x1b[32m${species}\x1b[0m \x1b[90m│ POS:\x1b[0m \x1b[36m${pos}\x1b[0m`);

  // Vital Bars
  if (entity.properties.life) {
    const lp = entity.properties.life;
    lines.push(`   \x1b[1;37mEnergia Vital:\x1b[0m ${buildProgressBar(lp.energy, lp.max, 10, "\x1b[32m")} \x1b[90m(${Math.round(lp.energy)}/${lp.max})\x1b[0m`);
  }

  const condProp = Object.values(entity.properties).find(p => p && typeof p.condition === "number" && typeof p.maxCondition === "number");
  if (condProp) {
    lines.push(`   \x1b[1;37mCondição Fís:\x1b[0m  ${buildProgressBar(condProp.condition, condProp.maxCondition, 10, "\x1b[36m")}`);
  }

  if (entity.properties.bladder) {
    const bp = entity.properties.bladder;
    lines.push(`   \x1b[1;37mÁgua/Bexiga:\x1b[0m   ${buildProgressBar(bp.water, bp.maxWater, 10, "\x1b[34m")}`);
  }

  // Active Amputations / Bleeding
  for (const [k, p] of Object.entries(entity.properties)) {
    if (k.startsWith("amputated_")) {
      lines.push(`   \x1b[1;41;37m ⚠️ MEMBRO AMPUTADO: -${p.bleedRate} cal/s \x1b[0m`);
    }
  }

  // Respiration
  if (entity.properties.gills) {
    lines.push(`   \x1b[36m🫁 Respiração:\x1b[0m \x1b[1;36mBranquial (Aquático)\x1b[0m`);
  } else if (entity.properties.lungs) {
    lines.push(`   \x1b[33m🫁 Respiração:\x1b[0m \x1b[1;33mPulmonar (Terrestre)\x1b[0m`);
  }

  // Brain & Cognition
  if (entity.properties.brain) {
    const bp = entity.properties.brain;
    lines.push(` \x1b[1;35m─── COGNIÇÃO & MEMÓRIA ───\x1b[0m`);
    lines.push(`   \x1b[90mHumor:\x1b[0m \x1b[33m${bp.mood || "calmo"}\x1b[0m \x1b[90m│ Território:\x1b[0m \x1b[36m${bp.territoryZoneKey ? `Zona ${bp.territoryZoneKey}` : "Nenhum"}\x1b[0m`);
    lines.push(`   \x1b[90mZonas 8x8:\x1b[0m ${Object.keys(bp.geoMemory || {}).length} conhecidas \x1b[90m│ Rec:\x1b[0m ${bp.objectMemory?.length || 0}/${bp.objectCapacity || 5}`);
    lines.push(`   \x1b[90mMemórias:\x1b[0m Recente (${bp.shortTermMemory?.length || 0}) \x1b[90m│ Longo:\x1b[0m (${bp.longTermMemory?.length || 0})`);
  }

  // Stomach & Digestion
  if (entity.properties.stomach) {
    const sp = entity.properties.stomach;
    lines.push(` \x1b[1;33m─── DIGESTÃO (${sp.items?.length || 0}/${sp.capacity || 4}) ───\x1b[0m`);
    if (!sp.items || sp.items.length === 0) {
      lines.push(`   \x1b[90mEstômago vazio\x1b[0m`);
    } else {
      for (const it of sp.items.slice(0, 2)) {
        lines.push(`   \x1b[37m• ${it.name}\x1b[0m \x1b[90m(+${it.nutrition} cal, ${Math.round(it.remainingTurns)}s)\x1b[0m`);
      }
    }
  }

  // Personal Events
  const myEvents = getEventsForEntity(entity.id, 4);
  if (myEvents.length > 0) {
    lines.push(` \x1b[1;36m─── HISTÓRICO PESSOAL ───\x1b[0m`);
    for (const ev of myEvents.reverse()) {
      const typeColor = ev.type === "DEATH" ? "\x1b[31m" : ev.type === "ATTACK" ? "\x1b[33m" : ev.type === "AMPUTATION" ? "\x1b[35m" : "\x1b[36m";
      lines.push(`   ${typeColor}•\x1b[0m \x1b[90m[${ev.type}]\x1b[0m \x1b[37m${ev.description.slice(0, width - 14)}\x1b[0m`);
    }
  }

  return lines;
}

// ---------------------------------------------------------------------------
// Interactive Keyboard & Mouse Dispatcher
// ---------------------------------------------------------------------------

function setupTerminal() {
  process.stdout.write("\x1b[?1049h"); // Enable Alternate Screen Buffer
  process.stdout.write("\x1b[?25l");   // Hide Cursor
  process.stdout.write("\x1b[2J");     // Clear Screen

  if (isMouseEnabled) {
    process.stdout.write("\x1b[?1000h\x1b[?1006h"); // Enable SGR Mouse tracking
  }

  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", handleTerminalInput);
  }
}

function cleanupTerminal() {
  if (isMouseEnabled) {
    process.stdout.write("\x1b[?1000l\x1b[?1006l"); // Disable Mouse tracking
  }
  process.stdout.write("\x1b[?25h");   // Restore Cursor
  process.stdout.write("\x1b[?1049l"); // Exit Alternate Screen Buffer
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(false);
  }
}

function handleTerminalInput(key) {
  // SGR Mouse Input: \x1b[<0;col;rowM (Press) or \x1b[<0;col;rowm (Release)
  if (key.startsWith("\x1b[<")) {
    const match = key.match(/\x1b\[<(\d+);(\d+);(\d+)([Mm])/);
    if (match && shader) {
      const btn = parseInt(match[1], 10);
      const mouseCol = parseInt(match[2], 10) - 1; // 0-indexed column
      const mouseRow = parseInt(match[3], 10) - 2; // 0-indexed row (offset for header)
      const isPress = match[4] === "M";

      if (isPress && mouseCol >= 0 && mouseCol < mapCols && mouseRow >= 0 && mouseRow < mapRows) {
        const pixelX = mouseCol;
        const pixelY = mouseRow * 2;
        const foundId = shader.exports.wasm_select_at(pixelX, pixelY, fbWidth, fbHeight);
        if (foundId > 0) {
          selectedEntityId = foundId;
        }
      }
    }
    return;
  }

  // Ctrl+C or 'q' -> Exit
  if (key === "\u0003" || key === "q" || key === "Q") {
    cleanupTerminal();
    console.log("\x1b[32mBrutopolis finalizado com sucesso.\x1b[0m");
    process.exit(0);
  }

  // Space -> Pause / Resume
  if (key === " ") {
    isPaused = !isPaused;
    if (shader) shader.exports.wasm_set_paused(isPaused ? 1 : 0);
    return;
  }

  // Tab -> Cycle next creature
  if (key === "\t") {
    cycleNextEntity();
    return;
  }

  // WASD / Arrow Movement
  if (shader) {
    let cx = shader.exports.wasm_get_camera_x();
    let cy = shader.exports.wasm_get_camera_y();
    let zoom = shader.exports.wasm_get_camera_zoom();
    const panStep = Math.max(2, Math.round(16.0 / zoom));

    if (key === "w" || key === "W" || key === "\x1b[A") cy -= panStep;
    if (key === "s" || key === "S" || key === "\x1b[B") cy += panStep;
    if (key === "a" || key === "A" || key === "\x1b[D") cx -= panStep;
    if (key === "d" || key === "D" || key === "\x1b[C") cx += panStep;

    // Zoom
    if (key === "e" || key === "E" || key === "+") zoom = Math.min(4.0, zoom * 1.25);
    if (key === "z" || key === "Z" || key === "-") zoom = Math.max(0.2, zoom / 1.25);

    shader.exports.wasm_set_camera(cx, cy, zoom);
  }

  // Center on Selected
  if (key === "c" || key === "C") {
    const ent = getEntityById(selectedEntityId);
    if (ent && shader) {
      shader.exports.wasm_set_camera(ent.x, ent.y, shader.exports.wasm_get_camera_zoom());
    } else if (shader) {
      shader.exports.wasm_set_camera(256, 256, 1.0);
    }
  }

  // Kill Selected Entity
  if (key === "k" || key === "K") {
    const ent = getEntityById(selectedEntityId);
    if (ent) {
      explodeEntityOnDeath(ent, entities, world);
      destroyEntity(ent, entities);
      cycleNextEntity();
    }
  }

  // Regenerate World
  if (key === "r" || key === "R") {
    resetWorld((currentPreset + 1) % 3);
  }

  // Creature Spawners
  if (key === "1") spawnEntityAtCamera(createKnight);
  if (key === "2") spawnEntityAtCamera(createArcher);
  if (key === "3") spawnEntityAtCamera(createWolf);
  if (key === "4") spawnEntityAtCamera(createBear);
  if (key === "5") spawnEntityAtCamera(createCat);
  if (key === "6") spawnEntityAtCamera(createGoblin);
  if (key === "7") spawnEntityAtCamera(createBat);
  if (key === "8") spawnEntityAtCamera(createSeaSerpent);
  if (key === "9") spawnEntityAtCamera(createDragon);
  if (key === "0") spawnEntityAtCamera(createFruit);
}

// ---------------------------------------------------------------------------
// Bootloader
// ---------------------------------------------------------------------------

async function main() {
  try {
    updateLayoutDimensions();

    const wasmPath = path.join(__dirname, "brutopolis.wasm");
    const wasmBytes = fs.readFileSync(wasmPath);

    mem = wash_memory(32 * 1024 * 1024);
    shader = await wash_load(wasmBytes, mem, {
      env: { console_log: () => {}, get_random: () => Math.random() }
    });

    world = new World(mem, shader.exports);
    resetWorld(0);

    setupTerminal();

    // Main 60 FPS Render Loop
    setInterval(renderTerminalFrame, 1000 / 60);
  } catch (err) {
    cleanupTerminal();
    console.error("Erro fatal ao inicializar Brutopolis no terminal:", err);
    process.exit(1);
  }
}

process.on("SIGINT", () => {
  cleanupTerminal();
  process.exit(0);
});

process.on("exit", () => {
  cleanupTerminal();
});

main();
