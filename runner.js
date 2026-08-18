#!/usr/bin/env node

// =============================================================================
// Brutopolis — Terminal Roguelike Biological Simulation Runner & Explorer
// =============================================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { wash_memory, wash_load } from "./wash.js";
import { World, MAP_WIDTH, MAP_HEIGHT } from "./js/world.js";
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
  createCactus,
  createScorpion,
  createLizard,
  createAlpineShrub,
  createMountainGoat,
  createWoodItem,
  createStoneItem,
  createOakTree,
  createWillowTree,
  createPineTree,
  createWaterLily,
  createSeaweed,
  createFruit,
  createSeedEntity,
  createMouthProp,
  createCommunicationProp,
  createCrafterProp,
  createMinerProp,
  createBuilderProp,
  createBruiseProp,
  createConcussionProp,
  createTerrestrialProp,
  createAquaticProp,
  createFlyingProp,
  createWingsProp,
  createCombatProp,
  createBodyRegenerationProp,
  createHumanMiner,
  createHumanBuilder,
  createHumanCrafter,
  createHumanFarmer,
  createHumanMatriarch,
  createGroup,
  createFarmerProp,
  createMysticGraceProp,
  createScatologicalProp,
  getMoodLabel,
  getGroupStockpile
} from "./js/properties.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// Simulation State & Modes ("MAP", "INSPECT", "ENTITIES", "GROUPS", "LOGS")
// ---------------------------------------------------------------------------

let shader = null;
let world = null;
let entities = [];
let mem = null;

let isPaused = false;
let simSpeed = 1.0; // 0.5x, 1x, 2x, 4x, 8x, 16x
const SPEED_TIERS = [0.5, 1.0, 2.0, 4.0, 8.0, 16.0];
let currentPreset = 0;

let appMode = "MAP";
let inspectScroll = 0;
let inspectedEntity = null;

// Registry State
let registrySelectedIdx = 0;
let registryFilter = "ALL"; // "ALL", "LIVING", "ITEMS", "HUMANOID", "BEAST", "FLORA"
let groupSelectedIdx = 0;
let logSelectedIdx = 0;
let logFilter = "ALL"; // "ALL", "ATTACK", "AMPUTATION", "DEATH", "SPROUT", "COMMUNICATION"

// Cursor & Viewport
let cursorX = 256;
let cursorY = 256;
let camX = 256;
let camY = 256;
let selectedEntityId = -1;
let isFollowMode = false;
let isCreatureVisionMode = false;

// Performance & Terminal Layout
let lastTime = Date.now();
let fpsFrames = 0;
let currentFps = 60;
let lastFpsUpdate = Date.now();

let termCols = process.stdout.columns || 120;
let termRows = process.stdout.rows || 40;
let mapCols = termCols;
let mapRows = Math.max(10, termRows - 2);

function updateLayoutDimensions() {
  termCols = process.stdout.columns || 120;
  termRows = process.stdout.rows || 40;
  mapCols = termCols;
  mapRows = Math.max(10, termRows - 2);
}

process.stdout.on("resize", () => {
  updateLayoutDimensions();
});

function stripAnsi(str) {
  return str.replace(/\x1b\[[0-9;]*m/g, "");
}

// ---------------------------------------------------------------------------
// Roguelike Glyph Dictionary & Palette
// ---------------------------------------------------------------------------

const TERRAIN_GLYPHS = [
  // 0: Fertile Soil / Forest
  { glyph: ".", fg: "\x1b[38;5;71m", bg: "\x1b[48;5;234m", name: "Fertile Soil / Forest" },
  // 1: Mountain Peak
  { glyph: "▲", fg: "\x1b[38;5;252m", bg: "\x1b[48;5;237m", name: "Mountain Peak" },
  // 2: Ocean Water
  { glyph: "≈", fg: "\x1b[38;5;75m", bg: "\x1b[48;5;17m", name: "Ocean Water" },
  // 3: Sand Dunes / Desert
  { glyph: "░", fg: "\x1b[38;5;221m", bg: "\x1b[48;5;58m", name: "Sand Dunes / Desert" },
  // 4: Rocky Foothills / Stone
  { glyph: "#", fg: "\x1b[38;5;245m", bg: "\x1b[48;5;236m", name: "Rocky Foothills / Stone" },
  // 5: Void
  { glyph: " ", fg: "\x1b[38;5;235m", bg: "\x1b[48;5;232m", name: "Void" }
];

function getEntityGlyph(ent) {
  if (!ent || !ent.properties) return { glyph: "?", fg: "\x1b[37m", bg: "\x1b[40m" };

  const name = ent.properties.name || "";
  const skin = ent.properties.render?.skin || "";
  const species = ent.properties.species || "";

  // 1. Sentient Humanoids
  if (name.includes("Knight") || name.includes("Cavaleiro") || skin.includes("Knight")) {
    return { glyph: "@", fg: "\x1b[1;38;5;231m", bg: "\x1b[48;5;24m" };
  }
  if (name.includes("Archer") || name.includes("Arqueira") || skin.includes("Archer")) {
    return { glyph: "a", fg: "\x1b[1;38;5;119m", bg: "\x1b[48;5;22m" };
  }
  if (name.includes("Goblin") || skin.includes("Goblin")) {
    return { glyph: "g", fg: "\x1b[1;38;5;113m", bg: "\x1b[48;5;58m" };
  }

  // 2. Predators & Beasts
  if (name.includes("Wolf") || name.includes("Lobo") || skin.includes("Wolf")) {
    return { glyph: "d", fg: "\x1b[1;38;5;153m", bg: "\x1b[48;5;236m" };
  }
  if (name.includes("Bear") || name.includes("Urso") || skin.includes("Bear")) {
    return { glyph: "B", fg: "\x1b[1;38;5;172m", bg: "\x1b[48;5;52m" };
  }
  if (name.includes("Cat") || name.includes("Gato") || skin.includes("Cat")) {
    return { glyph: "c", fg: "\x1b[1;38;5;220m", bg: "\x1b[48;5;94m" };
  }
  if (name.includes("Goat") || name.includes("Bode") || species === "goat") {
    return { glyph: "q", fg: "\x1b[1;38;5;254m", bg: "\x1b[48;5;238m" };
  }
  if (name.includes("Scorpion") || name.includes("Escorpião") || species === "scorpion") {
    return { glyph: "s", fg: "\x1b[1;38;5;214m", bg: "\x1b[48;5;58m" };
  }
  if (name.includes("Lizard") || name.includes("Lagarto") || species === "lizard") {
    return { glyph: "l", fg: "\x1b[1;38;5;149m", bg: "\x1b[48;5;94m" };
  }
  if (name.includes("Bat") || name.includes("Morcego") || skin.includes("Bat")) {
    return { glyph: "b", fg: "\x1b[1;38;5;176m", bg: "\x1b[48;5;54m" };
  }
  if (name.includes("Serpent") || name.includes("Serpente") || skin.includes("Snake")) {
    return { glyph: "S", fg: "\x1b[1;38;5;44m", bg: "\x1b[48;5;23m" };
  }
  if (name.includes("Dragon") || name.includes("Dragão") || skin.includes("Dragon")) {
    return { glyph: "D", fg: "\x1b[1;38;5;196m", bg: "\x1b[48;5;52m" };
  }

  // 3. Flora & Trees
  if (name.includes("Oak") || name.includes("Carvalho") || species === "oak") {
    return { glyph: "♣", fg: "\x1b[1;38;5;78m", bg: "\x1b[48;5;22m" };
  }
  if (name.includes("Willow") || name.includes("Salgueiro") || species === "willow") {
    return { glyph: "¶", fg: "\x1b[1;38;5;114m", bg: "\x1b[48;5;23m" };
  }
  if (name.includes("Pine") || name.includes("Pinheiro") || species === "pine") {
    return { glyph: "▲", fg: "\x1b[1;38;5;71m", bg: "\x1b[48;5;235m" };
  }
  if (name.includes("Cactus") || name.includes("Cacto") || species === "cactus") {
    return { glyph: "ψ", fg: "\x1b[1;38;5;112m", bg: "\x1b[48;5;58m" };
  }
  if (name.includes("Shrub") || name.includes("Líquen") || species === "shrub") {
    return { glyph: "*", fg: "\x1b[1;38;5;116m", bg: "\x1b[48;5;236m" };
  }
  if (name.includes("Lily") || name.includes("Vitória-Régia")) {
    return { glyph: "o", fg: "\x1b[1;38;5;170m", bg: "\x1b[48;5;17m" };
  }
  if (name.includes("Seaweed") || name.includes("Alga")) {
    return { glyph: "∫", fg: "\x1b[1;38;5;42m", bg: "\x1b[48;5;18m" };
  }

  // 4. Items & Resources
  if (ent.properties.edible?.foodType === "fruit" || name.includes("Fruit") || name.includes("Fruto")) {
    return { glyph: "%", fg: "\x1b[1;38;5;208m", bg: "\x1b[48;5;94m" };
  }
  if (ent.properties.germination || name.includes("Seed") || name.includes("Semente")) {
    return { glyph: "·", fg: "\x1b[1;38;5;179m", bg: "\x1b[48;5;234m" };
  }
  if (ent.properties.resourceType === "wood" || name.includes("Wood") || name.includes("Madeira")) {
    return { glyph: "=", fg: "\x1b[1;38;5;137m", bg: "\x1b[48;5;235m" };
  }
  if (ent.properties.resourceType === "stone" || name.includes("Stone") || name.includes("Pedra")) {
    return { glyph: "*", fg: "\x1b[1;38;5;248m", bg: "\x1b[48;5;237m" };
  }
  if (ent.properties.structure || name.includes("Muralha") || name.includes("Wall")) {
    const hasN = entities.some(e => !e.destroyed && (e.properties?.structure || e.properties?.name?.includes("Wall") || e.properties?.name?.includes("Muralha")) && e.x === ent.x && e.y === ent.y - 1);
    const hasS = entities.some(e => !e.destroyed && (e.properties?.structure || e.properties?.name?.includes("Wall") || e.properties?.name?.includes("Muralha")) && e.x === ent.x && e.y === ent.y + 1);
    const hasE = entities.some(e => !e.destroyed && (e.properties?.structure || e.properties?.name?.includes("Wall") || e.properties?.name?.includes("Muralha")) && e.x === ent.x + 1 && e.y === ent.y);
    const hasW = entities.some(e => !e.destroyed && (e.properties?.structure || e.properties?.name?.includes("Wall") || e.properties?.name?.includes("Muralha")) && e.x === ent.x - 1 && e.y === ent.y);

    let g = "■";
    if (hasN && hasE && hasS && hasW) g = "┼";
    else if (hasN && hasE && hasS) g = "├";
    else if (hasN && hasS && hasW) g = "┤";
    else if (hasN && hasE && hasW) g = "┴";
    else if (hasE && hasS && hasW) g = "┬";
    else if (hasN && hasS) g = "│";
    else if (hasE && hasW) g = "─";
    else if (hasE && hasS) g = "┌";
    else if (hasS && hasW) g = "┐";
    else if (hasN && hasE) g = "└";
    else if (hasN && hasW) g = "┘";
    else if (hasN || hasS) g = "│";
    else if (hasE || hasW) g = "─";

    return { glyph: g, fg: "\x1b[1;38;5;252m", bg: "\x1b[48;5;238m" };
  }
  if (ent.properties.fertilizer || name.includes("Feces") || name.includes("Fezes")) {
    return { glyph: "~", fg: "\x1b[38;5;94m", bg: "\x1b[48;5;234m" };
  }
  if (ent.properties.edible?.foodType === "meat" || name.includes("Meat") || name.includes("Carne")) {
    return { glyph: "%", fg: "\x1b[1;38;5;167m", bg: "\x1b[48;5;52m" };
  }

  return { glyph: "?", fg: "\x1b[37m", bg: "\x1b[40m" };
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

  cursorX = Math.floor(shader.exports.wasm_get_camera_x()) || 256;
  cursorY = Math.floor(shader.exports.wasm_get_camera_y()) || 256;
  camX = cursorX;
  camY = cursorY;

  // Biome Flora
  spawnRandomGlobal(35, createOakTree, (x, y) => world.getTile(x, y) === 0);
  spawnRandomGlobal(25, createWillowTree, (x, y) => world.getTile(x, y) === 0 || world.getTile(x, y) === 3);
  spawnRandomGlobal(30, createCactus, (x, y) => world.getTile(x, y) === 3);
  spawnRandomGlobal(25, createAlpineShrub, (x, y) => world.getTile(x, y) === 4 || world.getTile(x, y) === 1);
  spawnRandomGlobal(20, createPineTree, (x, y) => world.getTile(x, y) === 4 || world.getTile(x, y) === 0);
  spawnRandomGlobal(40, createWaterLily, (x, y) => world.getTile(x, y) === 2);
  spawnRandomGlobal(50, createSeaweed, (x, y) => world.getTile(x, y) === 2);

  // Resources & Items
  spawnRandomGlobal(60, (x, y) => createSeedEntity(x, y, "large", "oak"), (x, y) => world.getTile(x, y) === 0);
  spawnRandomGlobal(40, (x, y) => createSeedEntity(x, y, "small", "willow"), (x, y) => world.getTile(x, y) === 0 || world.getTile(x, y) === 3);
  spawnRandomGlobal(30, (x, y) => createFruit(x, y, "large", "cactus"), (x, y) => world.getTile(x, y) === 3);
  spawnRandomGlobal(40, (x, y) => createFruit(x, y, "large", "oak"), (x, y) => world.isWalkable(x, y));
  spawnRandomGlobal(50, createWoodItem, (x, y) => world.getTile(x, y) === 0);
  spawnRandomGlobal(50, createStoneItem, (x, y) => world.getTile(x, y) === 4 || world.getTile(x, y) === 1);

  // Biome Fauna
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

  // Initial clan resources in territory
  for (let i = 0; i < 4; i++) {
    entities.push(createWoodItem(startX + (i % 2), startY + Math.floor(i / 2)));
    entities.push(createStoneItem(startX - 1 + (i % 2), startY + Math.floor(i / 2)));
  }

  selectedEntityId = miner.id;
  cursorX = startX;
  cursorY = startY;
  camX = cursorX;
  camY = cursorY;
}

function spawnEntityAtCursor(factoryFn) {
  const ent = factoryFn(cursorX, cursorY);
  entities.push(ent);
  selectedEntityId = ent.id;
}

function cycleNextLivingEntity() {
  if (entities.length === 0) return;
  const living = entities.filter(e => !e.destroyed && e.properties && e.properties.life);
  if (living.length === 0) return;

  const curIdx = living.findIndex(e => e.id === selectedEntityId);
  const nextIdx = (curIdx + 1) % living.length;
  const nextEnt = living[nextIdx];
  selectedEntityId = nextEnt.id;
  cursorX = nextEnt.x;
  cursorY = nextEnt.y;
  keepCursorInCamera();
}

function keepCursorInCamera() {
  cursorX = Math.max(0, Math.min(MAP_WIDTH - 1, cursorX));
  cursorY = Math.max(0, Math.min(MAP_HEIGHT - 1, cursorY));

  const halfW = Math.floor(mapCols / 2);
  const halfH = Math.floor(mapRows / 2);

  camX = Math.max(halfW, Math.min(MAP_WIDTH - halfW, cursorX));
  camY = Math.max(halfH, Math.min(MAP_HEIGHT - halfH, cursorY));
}

// ---------------------------------------------------------------------------
// Stringify Object with ANSI Syntax Highlighting
// ---------------------------------------------------------------------------

function stringifyObjectWithColors(obj, indent = 2) {
  const spaces = " ".repeat(indent);
  if (obj === null) return "\x1b[38;5;244mnull\x1b[0m";
  if (obj === undefined) return "\x1b[38;5;244mundefined\x1b[0m";
  if (typeof obj === "number") return `\x1b[38;5;220m${Number.isInteger(obj) ? obj : obj.toFixed(2)}\x1b[0m`;
  if (typeof obj === "boolean") return `\x1b[38;5;214m${obj}\x1b[0m`;
  if (typeof obj === "string") return `\x1b[38;5;114m"${obj}"\x1b[0m`;
  if (typeof obj === "function") return `\x1b[38;5;119m[Function: ${obj.name || "effect"}]\x1b[0m`;

  if (Array.isArray(obj)) {
    if (obj.length === 0) return "[]";
    let out = "[\n";
    for (let i = 0; i < obj.length; i++) {
      out += `${spaces}  ${stringifyObjectWithColors(obj[i], indent + 2)}${i < obj.length - 1 ? "," : ""}\n`;
    }
    out += `${spaces}]`;
    return out;
  }

  if (typeof obj === "object") {
    const keys = Object.keys(obj);
    if (keys.length === 0) return "{}";
    let out = "{\n";
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const valStr = stringifyObjectWithColors(obj[k], indent + 2);
      out += `${spaces}  \x1b[1;38;5;178m"${k}"\x1b[0m: ${valStr}${i < keys.length - 1 ? "," : ""}\n`;
    }
    out += `${spaces}}`;
    return out;
  }

  return String(obj);
}

// ---------------------------------------------------------------------------
// 1. Dedicated Full-Screen Biological Dossier / Inspector
// ---------------------------------------------------------------------------

function openDedicatedInspector(target) {
  if (!target) {
    target = entities.find(e => !e.destroyed && e.x === cursorX && e.y === cursorY);
  }
  if (!target && selectedEntityId > 0) {
    target = getEntityById(selectedEntityId);
  }

  inspectedEntity = target || null;
  inspectScroll = 0;
  appMode = "INSPECT";
  renderInspectorScreen();
}

function renderInspectorScreen() {
  let out = "\x1b[H";

  const title = inspectedEntity ? `BIOLOGICAL DOSSIER: ${inspectedEntity.properties.name || "Entity"} (#${inspectedEntity.id})` : "TERRAIN INSPECTION (NO CREATURE)";
  const header = ` 🔬 \x1b[1;38;5;208m${title}\x1b[0m \x1b[90m│ POS: [X: ${cursorX}, Y: ${cursorY}]\x1b[0m \x1b[1;41;37m [PAUSED] \x1b[0m`;
  out += `\x1b[48;5;235m${header}${" ".repeat(Math.max(2, termCols - stripAnsi(header).length))}\x1b[0m\x1b[K\n`;

  const lines = [];
  const divider = "\x1b[90m" + "─".repeat(termCols - 2) + "\x1b[0m";

  if (!inspectedEntity) {
    const t = world ? world.getTile(cursorX, cursorY) : 0;
    const tName = world ? world.getTileName(t) : "Unknown";
    lines.push(`\x1b[1;33m📍 TERRAIN DETAILS AT THIS COORDINATE:\x1b[0m`);
    lines.push(`   Coordinates: \x1b[36m[X: ${cursorX}, Y: ${cursorY}]\x1b[0m`);
    lines.push(`   Terrain Type: \x1b[32m${tName}\x1b[0m (Tile Code: ${t})`);
    lines.push(`   Walkable: \x1b[33m${world && world.isWalkable(cursorX, cursorY) ? "Yes" : "No"}\x1b[0m`);
    lines.push(``);
    lines.push(`\x1b[90mNo active creature or item found at this exact tile.\x1b[0m`);
  } else {
    const ent = inspectedEntity;
    const props = ent.properties;
    const eg = getEntityGlyph(ent);

    // Hero Summary
    lines.push(`\x1b[1;37m╔══ GENERAL OVERVIEW ═══════════════════════════════════════════════════════════════════════════╗\x1b[0m`);
    lines.push(`  Glyph: ${eg.bg}${eg.fg} ${eg.glyph} \x1b[0m  Name: \x1b[1;33m${props.name || "N/A"}\x1b[0m (ID: #${ent.id})  Species: \x1b[32m${props.species || "N/A"}\x1b[0m  Group: \x1b[36m${props.group?.name || "Solitary"}\x1b[0m`);
    lines.push(`  Position: \x1b[36mX:${ent.x}, Y:${ent.y}\x1b[0m  Status: \x1b[1;32m${props.life ? (props.life.energy > 0 ? "🟢 ALIVE" : "💀 DEAD") : "📦 ITEM"}\x1b[0m  Active Properties: \x1b[33m${Object.keys(props).length}\x1b[0m`);
    lines.push(`\x1b[1;37m╚════════════════════════════════════════════════════════════════════════════════════════════════╝\x1b[0m`);
    lines.push(``);

    // Vital Gauges
    if (props.life) {
      lines.push(`  \x1b[1;32m⚡ Vital Energy:\x1b[0m      ${Math.round(props.life.energy)} / ${props.life.max} cal (${Math.round((props.life.energy / props.life.max) * 100)}%)`);
    }
    const condProp = Object.values(props).find(p => p && typeof p.condition === "number" && typeof p.maxCondition === "number");
    if (condProp) {
      lines.push(`  \x1b[1;36m🛡️ Physical Condition:\x1b[0m ${Math.round(condProp.condition)} / ${condProp.maxCondition} (${Math.round((condProp.condition / condProp.maxCondition) * 100)}%)`);
    }
    if (props.bladder) {
      lines.push(`  \x1b[1;34m💧 Bladder / Water:\x1b[0m    ${Math.round(props.bladder.water)} / ${props.bladder.maxWater} ml`);
    }
    if (props.brain && typeof props.brain.mood === "number") {
      const moodLabel = getMoodLabel(props.brain.mood);
      const moodColor = props.brain.mood >= 25 ? "\x1b[1;32m" : props.brain.mood >= -20 ? "\x1b[1;36m" : "\x1b[1;31m";
      lines.push(`  \x1b[1;35m🎭 Humor / Estado:\x1b[0m    ${moodColor}${moodLabel}\x1b[0m`);
    }

    // Amputations
    for (const [k, p] of Object.entries(props)) {
      if (k.startsWith("amputated_")) {
        lines.push(`  \x1b[1;41;37m ⚠️ AMPUTATED LIMB: ${p.part || k} ─ Bleeding: -${p.bleedRate} cal/s \x1b[0m`);
      }
    }
    lines.push(``);

    // Complete Object Dump
    lines.push(`\x1b[1;36m📦 COMPLETE ENTITY.PROPERTIES OBJECT DUMP (RAW MEMORY STRUCTURE):\x1b[0m`);
    lines.push(divider);

    const fullDump = stringifyObjectWithColors(props, 2);
    const dumpLines = fullDump.split("\n");
    for (const dl of dumpLines) {
      lines.push("  " + dl);
    }
    lines.push(divider);
    lines.push(``);

    // Event History
    const myEvents = getEventsForEntity(ent.id, 10);
    if (myEvents.length > 0) {
      lines.push(`\x1b[1;33m📜 EVENT LOG FOR THIS CREATURE (${myEvents.length} events):\x1b[0m`);
      for (const ev of myEvents) {
        const typeColor = ev.type === "DEATH" ? "\x1b[31m" : ev.type === "ATTACK" ? "\x1b[33m" : ev.type === "AMPUTATION" ? "\x1b[35m" : "\x1b[32m";
        lines.push(`  ${typeColor}• [${ev.type}]\x1b[0m \x1b[90m[Day ${ev.timestamp.day} ${String(ev.timestamp.hour).padStart(2,"0")}:${String(ev.timestamp.minute).padStart(2,"0")}]\x1b[0m ${ev.description}`);
      }
      lines.push(``);
    }
  }

  const visibleRows = termRows - 2;
  const maxScroll = Math.max(0, lines.length - visibleRows);
  inspectScroll = Math.max(0, Math.min(maxScroll, inspectScroll));

  for (let r = 0; r < visibleRows - 1; r++) {
    const line = lines[inspectScroll + r] || "";
    out += `${line}\x1b[K\n`;
  }

  const scrollInfo = maxScroll > 0 ? `\x1b[90m(Lines ${inspectScroll + 1}-${Math.min(lines.length, inspectScroll + visibleRows)} of ${lines.length} │ Arrows / Wheel to scroll)\x1b[0m ` : "";
  const footerPrompt = `\x1b[1;33m[ Press ESC, ENTER, SPACE or I to exit dossier ]\x1b[0m`;
  out += `\x1b[48;5;235m ${footerPrompt} ${scrollInfo}\x1b[0m\x1b[K`;

  process.stdout.write(out);
}

// ---------------------------------------------------------------------------
// 2. Global Entities Explorer & Registry Screen (Hotkey: E)
// ---------------------------------------------------------------------------

function getFilteredEntities() {
  return entities.filter(e => {
    if (e.destroyed) return false;
    if (registryFilter === "LIVING") return !!e.properties.life;
    if (registryFilter === "ITEMS") return !!e.properties.edible || !!e.properties.resourceType || !!e.properties.germination;
    if (registryFilter === "HUMANOID") return e.properties.name?.includes("Knight") || e.properties.name?.includes("Archer") || e.properties.name?.includes("Goblin");
    if (registryFilter === "BEAST") return e.properties.species === "wolf" || e.properties.species === "bear" || e.properties.species === "cat" || e.properties.species === "scorpion" || e.properties.species === "lizard" || e.properties.species === "goat" || e.properties.species === "dragon";
    if (registryFilter === "FLORA") return e.properties.species === "oak" || e.properties.species === "willow" || e.properties.species === "pine" || e.properties.species === "cactus" || e.properties.species === "shrub";
    return true;
  });
}

function renderEntitiesRegistryScreen() {
  let out = "\x1b[H";

  const list = getFilteredEntities();
  registrySelectedIdx = Math.max(0, Math.min(list.length - 1, registrySelectedIdx));

  const filterTabs = `Filter: [1:ALL (${entities.length})] [2:LIVING] [3:ITEMS] [4:HUMANOIDS] [5:BEASTS] [6:FLORA]`;
  const header = ` 📋 \x1b[1;38;5;208mGLOBAL ENTITIES REGISTRY (${list.length} shown)\x1b[0m \x1b[90m│ ${filterTabs}\x1b[0m \x1b[1;41;37m [PAUSED] \x1b[0m`;
  out += `\x1b[48;5;235m${header}${" ".repeat(Math.max(2, termCols - stripAnsi(header).length))}\x1b[0m\x1b[K\n`;

  const colHeader = `  \x1b[1;37mID   GLYPH  NAME                         SPECIES         POS        ENERGY / MAX        STATUS    GROUP\x1b[0m`;
  out += `${colHeader}\x1b[K\n`;

  const visibleRows = termRows - 4;
  const startIdx = Math.max(0, Math.min(list.length - visibleRows, registrySelectedIdx - Math.floor(visibleRows / 2)));

  for (let i = startIdx; i < startIdx + visibleRows; i++) {
    if (i >= list.length) {
      out += `\x1b[K\n`;
      continue;
    }

    const ent = list[i];
    const isSelected = i === registrySelectedIdx;
    const eg = getEntityGlyph(ent);
    const idStr = String(ent.id).padEnd(5);
    const nameStr = (ent.properties.name || "Entity").slice(0, 26).padEnd(27);
    const speciesStr = (ent.properties.species || "-").slice(0, 14).padEnd(15);
    const posStr = `[${ent.x},${ent.y}]`.padEnd(10);
    
    let energyStr = "-";
    if (ent.properties.life) {
      energyStr = `${Math.round(ent.properties.life.energy)}/${ent.properties.life.max}`;
    }
    energyStr = energyStr.slice(0, 18).padEnd(19);

    const statusStr = ent.properties.life ? (ent.properties.life.energy > 0 ? "\x1b[32mALIVE\x1b[0m" : "\x1b[31mDEAD\x1b[0m") : "\x1b[33mITEM\x1b[0m";
    const groupStr = (ent.properties.group?.name || "-").slice(0, 16);

    const lineText = ` ${idStr} ${eg.bg}${eg.fg} ${eg.glyph} \x1b[0m ${nameStr} ${speciesStr} ${posStr} ${energyStr} ${statusStr}   ${groupStr}`;

    if (isSelected) {
      out += `\x1b[7;1;38;5;226m▶${lineText}\x1b[0m\x1b[K\n`;
    } else {
      out += ` ${lineText}\x1b[0m\x1b[K\n`;
    }
  }

  const foot = `\x1b[1;33m[Up/Down/Wheel]\x1b[0m Navigate \x1b[90m│\x1b[0m \x1b[1;33m[Enter/I]\x1b[0m Dossier \x1b[90m│\x1b[0m \x1b[1;33m[Space/C]\x1b[0m Focus Map \x1b[90m│\x1b[0m \x1b[1;33m[K]\x1b[0m Kill \x1b[90m│\x1b[0m \x1b[1;33m[1-6]\x1b[0m Filter \x1b[90m│\x1b[0m \x1b[1;33m[ESC/E]\x1b[0m Back`;
  out += `\x1b[48;5;235m ${foot}${" ".repeat(Math.max(1, termCols - stripAnsi(foot).length - 2))} \x1b[0m\x1b[K`;

  process.stdout.write(out);
}

// ---------------------------------------------------------------------------
// 3. Global Groups & Factions Registry Screen (Hotkey: G)
// ---------------------------------------------------------------------------

function getAllGroups() {
  const map = new Map();
  for (const e of entities) {
    if (e.destroyed) continue;
    if (e.properties && e.properties.group) {
      const g = e.properties.group;
      if (!map.has(g.id)) {
        map.set(g.id, g);
      }
    }
  }
  return Array.from(map.values());
}

function renderGroupsRegistryScreen() {
  let out = "\x1b[H";

  const groups = getAllGroups();
  groupSelectedIdx = Math.max(0, Math.min(groups.length - 1, groupSelectedIdx));

  const header = ` 🛡️ \x1b[1;38;5;208mGLOBAL GROUPS & FACTIONS REGISTRY (${groups.length} active clans)\x1b[0m \x1b[1;41;37m [PAUSED] \x1b[0m`;
  out += `\x1b[48;5;235m${header}${" ".repeat(Math.max(2, termCols - stripAnsi(header).length))}\x1b[0m\x1b[K\n`;

  if (groups.length === 0) {
    out += `\n  \x1b[90mNo active social groups or factions founded yet.\x1b[0m\n`;
    out += `  \x1b[90mCreatures form groups via social communication or bio-injection.\x1b[0m\n`;
  } else {
    const colHeader = `  \x1b[1;37mID   GROUP NAME                   LEADER/FOUNDER        MEMBERS   CLAIMED ZONES   CAMPFIRE\x1b[0m`;
    out += `${colHeader}\x1b[K\n`;

    const visibleRows = Math.max(3, termRows - 9);
    const startIdx = Math.max(0, Math.min(groups.length - visibleRows, groupSelectedIdx - Math.floor(visibleRows / 2)));

    for (let i = startIdx; i < startIdx + visibleRows; i++) {
      if (i >= groups.length) {
        out += `\x1b[K\n`;
        continue;
      }

      const g = groups[i];
      const isSelected = i === groupSelectedIdx;
      const idStr = String(g.id).padEnd(4);
      const nameStr = (g.name || `Clan #${g.id}`).slice(0, 26).padEnd(28);

      const leaderEnt = entities.find(e => e.id === g.members[0] && !e.destroyed);
      const leaderName = (leaderEnt ? leaderEnt.properties.name : `Member #${g.members[0]}`).slice(0, 20).padEnd(21);

      const livingMembers = g.members.filter(mid => entities.some(e => e.id === mid && !e.destroyed)).length;
      const memStr = `${livingMembers}/${g.members.length} alive`.padEnd(10);
      const zonesStr = (g.claimedZones?.join(", ") || "None").slice(0, 15).padEnd(16);
      const campStr = g.campfire ? `[${g.campfire.x}, ${g.campfire.y}]` : "None";

      const lineText = ` ${idStr} ${nameStr} ${leaderName} ${memStr} ${zonesStr} ${campStr}`;

      if (isSelected) {
        out += `\x1b[7;1;38;5;226m▶${lineText}\x1b[0m\x1b[K\n`;
      } else {
        out += ` ${lineText}\x1b[0m\x1b[K\n`;
      }
    }

    // Selected Group Stockpile Panel
    const selGroup = groups[groupSelectedIdx];
    if (selGroup) {
      const stockpile = getGroupStockpile(selGroup, entities);
      const stockEntries = Object.entries(stockpile.items);
      let stockStr = "\x1b[90mVazio (Nenhum item em estoque)\x1b[0m";
      if (stockEntries.length > 0) {
        stockStr = stockEntries.map(([name, count]) => `\x1b[1;33m${name}\x1b[0m: \x1b[1;32mx${count}\x1b[0m`).join("  •  ");
      }

      const panelHeader = `─── 📦 \x1b[1;38;5;208mESTOQUE & INVENTÁRIO DO GRUPO:\x1b[0m \x1b[1;37m${(selGroup.name || "Clan").toUpperCase()}\x1b[0m `;
      out += `\x1b[90m${panelHeader}${"─".repeat(Math.max(1, termCols - stripAnsi(panelHeader).length))}\x1b[0m\x1b[K\n`;
      out += ` \x1b[1;36mTotal em Estoque:\x1b[0m \x1b[1;32m${stockpile.totalCount} itens\x1b[0m \x1b[90m│\x1b[0m \x1b[37m[No Chão do Território: ${stockpile.breakdown.ground} │ Com Membros: ${stockpile.breakdown.members} │ Reserva: ${stockpile.breakdown.storage}]\x1b[0m\x1b[K\n`;
      out += ` \x1b[1;36mItens:\x1b[0m ${stockStr}\x1b[K\n`;
    }
  }

  const foot = `\x1b[1;33m[Up/Down/Wheel]\x1b[0m Select \x1b[90m│\x1b[0m \x1b[1;33m[Enter/I]\x1b[0m Ver Tudo / Dossiê \x1b[90m│\x1b[0m \x1b[1;33m[Z]\x1b[0m Ver Zona \x1b[90m│\x1b[0m \x1b[1;33m[Space]\x1b[0m Focar Líder \x1b[90m│\x1b[0m \x1b[1;33m[ESC/G]\x1b[0m Back`;
  out += `\x1b[48;5;235m ${foot}${" ".repeat(Math.max(1, termCols - stripAnsi(foot).length - 2))} \x1b[0m\x1b[K`;

  process.stdout.write(out);
}

function renderGroupDetailScreen(g) {
  let out = "\x1b[H";
  const livingMembers = g.members.filter(mid => entities.some(e => e.id === mid && !e.destroyed));
  const leaderEnt = entities.find(e => e.id === g.members[0] && !e.destroyed);
  const stockpile = getGroupStockpile(g, entities);

  const header = ` 🛡️ \x1b[1;38;5;208mDOSSIÊ DETALHADO DO CLÃ:\x1b[0m \x1b[1;37m${(g.name || "Clan").toUpperCase()}\x1b[0m \x1b[1;41;37m [PAUSED] \x1b[0m`;
  out += `\x1b[48;5;235m${header}${" ".repeat(Math.max(2, termCols - stripAnsi(header).length))}\x1b[0m\x1b[K\n`;

  // 1. Clan Overview & Territory
  out += `\n \x1b[1;33m❖ LÍDER/FUNDADOR:\x1b[0m ${leaderEnt ? leaderEnt.properties.name : `Membro #${g.members[0]}`} \x1b[90m│\x1b[0m \x1b[1;32mPopulação:\x1b[0m ${livingMembers.length}/${g.members.length} membros vivos\x1b[K\n`;
  
  const zonesStr = (g.claimedZones || []).map(zk => {
    const parts = zk.includes("_") ? zk.split("_") : zk.split(",");
    const zx = parseInt(parts[0], 10);
    const zy = parseInt(parts[1], 10);
    return isNaN(zx) ? zk : `Zona [${zx},${zy}] (X:${zx*8}..${zx*8+7}, Y:${zy*8}..${zy*8+7})`;
  }).join(" | ");
  out += ` \x1b[1;33m❖ TERRITÓRIO REIVINDICADO:\x1b[0m \x1b[36m${zonesStr || "Nenhum"}\x1b[0m\x1b[K\n`;

  // 2. Full Itemized Stockpile
  out += `\n \x1b[1;38;5;208m─── 📦 ESTOQUE & ARMAZENAMENTO TOTAL (${stockpile.totalCount} ITENS DISPONÍVEIS) ───\x1b[0m\x1b[K\n`;
  out += ` \x1b[37mDistribuição:\x1b[0m \x1b[33mNo Chão do Território: ${stockpile.breakdown.ground}\x1b[0m \x1b[90m│\x1b[0m \x1b[32mCom Membros: ${stockpile.breakdown.members}\x1b[0m \x1b[90m│\x1b[0m \x1b[36mNa Reserva: ${stockpile.breakdown.storage}\x1b[0m\x1b[K\n`;

  const stockEntries = Object.entries(stockpile.items);
  if (stockEntries.length === 0) {
    out += ` \x1b[90m  Nenhum recurso ou item encontrado no estoque do clã.\x1b[0m\x1b[K\n`;
  } else {
    for (const [name, count] of stockEntries) {
      out += `   \x1b[1;33m• ${name}\x1b[0m: \x1b[1;32m${count} unidade(s)\x1b[0m\x1b[K\n`;
    }
  }

  // 3. Member Roster & Individual Hands
  out += `\n \x1b[1;38;5;208m─── 👥 ROSTER DE MEMBROS & INVENTÁRIOS (${livingMembers.length}/${g.members.length}) ───\x1b[0m\x1b[K\n`;
  for (const mid of g.members) {
    const mEnt = entities.find(e => e.id === mid && !e.destroyed);
    const isAlive = !!mEnt;
    const mName = mEnt ? mEnt.properties.name : `Membro #${mid} (Morto)`;
    const mRole = mEnt ? (mEnt.properties.role || mEnt.properties.species || "Human") : "-";
    const hpStr = mEnt?.properties.life ? `${Math.round(mEnt.properties.life.energy)} HP` : "0 HP";

    let heldStr = "Mãos vazias";
    if (mEnt) {
      const left = mEnt.properties.arm_left?.heldItem;
      const right = mEnt.properties.arm_right?.heldItem;
      const held = [];
      if (left) held.push(`Esq: ${left.resourceType || left.name || "Item"}`);
      if (right) held.push(`Dir: ${right.resourceType || right.name || "Item"}`);
      if (held.length > 0) heldStr = held.join(", ");
    }

    const lineCol = isAlive ? "\x1b[1;37m" : "\x1b[90m";
    out += `   ${lineCol}• ${mName.padEnd(24)}\x1b[0m \x1b[36m[${mRole}]\x1b[0m \x1b[32m(${hpStr})\x1b[0m \x1b[90m│\x1b[0m \x1b[33mCarregando: ${heldStr}\x1b[0m\x1b[K\n`;
  }

  out += `\n`;
  const foot = `\x1b[1;33m[ESC/G/Enter]\x1b[0m Voltar ao Registro de Grupos \x1b[90m│\x1b[0m \x1b[1;33m[Z]\x1b[0m Ver Território \x1b[90m│\x1b[0m \x1b[1;33m[Space]\x1b[0m Focar Líder`;
  out += `\x1b[48;5;235m ${foot}${" ".repeat(Math.max(1, termCols - stripAnsi(foot).length - 2))} \x1b[0m\x1b[K`;

  process.stdout.write(out);
}

// ---------------------------------------------------------------------------
// 4. Global World Event Log Explorer Screen (Hotkey: L)
// ---------------------------------------------------------------------------

function getFilteredLogs() {
  const events = allEvents.slice().reverse();
  if (logFilter === "ALL") return events;
  return events.filter(e => e.type === logFilter);
}

function renderWorldLogScreen() {
  let out = "\x1b[H";

  const list = getFilteredLogs();
  logSelectedIdx = Math.max(0, Math.min(list.length - 1, logSelectedIdx));

  const filterTabs = `Filter: [1:ALL (${allEvents.length})] [2:ATTACK] [3:AMPUTATION] [4:DEATH] [5:SPROUT] [6:COMM]`;
  const header = ` 📜 \x1b[1;38;5;208mWORLD EVENT LOG (${list.length} recorded)\x1b[0m \x1b[90m│ ${filterTabs}\x1b[0m \x1b[1;41;37m [PAUSED] \x1b[0m`;
  out += `\x1b[48;5;235m${header}${" ".repeat(Math.max(2, termCols - stripAnsi(header).length))}\x1b[0m\x1b[K\n`;

  if (list.length === 0) {
    out += `\n  \x1b[90mNo events recorded yet for this filter.\x1b[0m\n`;
  } else {
    const colHeader = `  \x1b[1;37mTIME        TYPE           LOCATION   DESCRIPTION\x1b[0m`;
    out += `${colHeader}\x1b[K\n`;

    const visibleRows = termRows - 4;
    const startIdx = Math.max(0, Math.min(list.length - visibleRows, logSelectedIdx - Math.floor(visibleRows / 2)));

    for (let i = startIdx; i < startIdx + visibleRows; i++) {
      if (i >= list.length) {
        out += `\x1b[K\n`;
        continue;
      }

      const ev = list[i];
      const isSelected = i === logSelectedIdx;

      const timeStr = `[D${ev.timestamp.day} ${String(ev.timestamp.hour).padStart(2,"0")}:${String(ev.timestamp.minute).padStart(2,"0")}]`.padEnd(12);
      
      const typeColor = ev.type === "DEATH" ? "\x1b[1;31m" : ev.type === "ATTACK" ? "\x1b[1;33m" : ev.type === "AMPUTATION" ? "\x1b[1;35m" : ev.type === "SPROUT" ? "\x1b[1;32m" : "\x1b[1;36m";
      const typeStr = (ev.type || "EVENT").padEnd(14);
      const locStr = ev.location ? `[${ev.location.x},${ev.location.y}]`.padEnd(10) : "[--, --]  ";
      const descStr = ev.description || "";

      const lineText = ` ${timeStr} ${typeColor}${typeStr}\x1b[0m ${locStr} ${descStr}`;

      if (isSelected) {
        out += `\x1b[7;1;38;5;226m▶${lineText}\x1b[0m\x1b[K\n`;
      } else {
        out += ` ${lineText}\x1b[0m\x1b[K\n`;
      }
    }
  }

  // Selected Log Event Details Preview Box at the bottom if space permits
  const selEv = list[logSelectedIdx];
  if (selEv && termRows >= 18) {
    out += `\x1b[1;30m${"─".repeat(termCols)}\x1b[0m\x1b[K\n`;
    out += ` \x1b[1;33m[EVENT #${selEv.id} DETAIL]\x1b[0m \x1b[1;37mType:\x1b[0m ${selEv.type} \x1b[1;37mPos:\x1b[0m [${selEv.location?.x}, ${selEv.location?.y}]\x1b[K\n`;
    out += ` \x1b[37m${selEv.description}\x1b[0m\x1b[K\n`;
  }

  const foot = `\x1b[1;33m[Up/Down/Wheel]\x1b[0m Select \x1b[90m│\x1b[0m \x1b[1;33m[Space/C/Enter]\x1b[0m Focus Event Map \x1b[90m│\x1b[0m \x1b[1;33m[1-6]\x1b[0m Filter \x1b[90m│\x1b[0m \x1b[1;33m[ESC/L]\x1b[0m Back`;
  out += `\x1b[48;5;235m ${foot}${" ".repeat(Math.max(1, termCols - stripAnsi(foot).length - 2))} \x1b[0m\x1b[K`;

  process.stdout.write(out);
}

// ---------------------------------------------------------------------------
// 5. Main Roguelike Full-Width Map Screen
// ---------------------------------------------------------------------------

function renderRoguelikeScreen() {
  if (appMode === "INSPECT") {
    renderInspectorScreen();
    return;
  }
  if (appMode === "ENTITIES") {
    renderEntitiesRegistryScreen();
    return;
  }
  if (appMode === "GROUPS") {
    renderGroupsRegistryScreen();
    return;
  }
  if (appMode === "LOGS") {
    renderWorldLogScreen();
    return;
  }

  if (!world) return;

  const now = Date.now();
  const dt = Math.min(0.1, (now - lastTime) * 0.001);
  lastTime = now;

  // FPS Meter
  fpsFrames++;
  if (now - lastFpsUpdate >= 1000) {
    currentFps = fpsFrames;
    fpsFrames = 0;
    lastFpsUpdate = now;
  }

  // 1. Tick Simulation if not paused
  if (!isPaused) {
    const effectiveDt = Math.min(dt, 0.1) * simSpeed;
    world.clock.tick(effectiveDt);
    incrementEngineTick();
    tickEntities(entities, effectiveDt, world);
  }

  // Automatic Camera Follow Mode
  if (isFollowMode && selectedEntityId > 0) {
    const followed = entities.find(e => e.id === selectedEntityId && !e.destroyed);
    if (followed) {
      cursorX = followed.x;
      cursorY = followed.y;
      camX = followed.x;
      camY = followed.y;
    } else {
      isFollowMode = false;
    }
  }

  // 2. Build Spatial Hash for Viewport
  const halfW = Math.floor(mapCols / 2);
  const halfH = Math.floor(mapRows / 2);
  const minX = Math.max(0, camX - halfW);
  const maxX = minX + mapCols;
  const minY = Math.max(0, camY - halfH);
  const maxY = minY + mapRows;

  const entityGrid = new Map();
  let entityUnderCursor = null;

  for (let i = 0; i < entities.length; i++) {
    const e = entities[i];
    if (e.destroyed) continue;

    if (e.x === cursorX && e.y === cursorY) {
      if (!entityUnderCursor || (e.properties.life && !entityUnderCursor.properties.life)) {
        entityUnderCursor = e;
      }
    }

    if (e.x >= minX && e.x < maxX && e.y >= minY && e.y < maxY) {
      const key = `${e.x},${e.y}`;
      const existing = entityGrid.get(key);
      if (!existing || (e.properties.life && !existing.properties.life)) {
        entityGrid.set(key, e);
      }
    }
  }

  if (entityUnderCursor) {
    selectedEntityId = entityUnderCursor.id;
  }

  // Pre-calculate creature vision range and known zones
  const visionEnt = isCreatureVisionMode && selectedEntityId > 0 ? entities.find(e => e.id === selectedEntityId && !e.destroyed) : null;
  const viewRange = visionEnt ? (visionEnt.properties?.eye_left?.viewRange || visionEnt.properties?.eye_right?.viewRange || 8) : 8;
  const knownZones = new Set();
  if (visionEnt) {
    if (visionEnt.properties?.brain?.geoMemory) {
      for (const k of Object.keys(visionEnt.properties.brain.geoMemory)) {
        knownZones.add(k);
      }
    }
    if (visionEnt.properties?.group?.claimedZones) {
      for (const zk of visionEnt.properties.group.claimedZones) {
        const parts = zk.includes("_") ? zk.split("_") : zk.split(",");
        knownZones.add(`${parts[0]}_${parts[1]}`);
      }
    }
    knownZones.add(`${Math.floor(visionEnt.x / 8)}_${Math.floor(visionEnt.y / 8)}`);
  }

  // 3. Top Header Bar
  let out = "\x1b[H";
  const clock = world.clock;
  const timeStr = `DAY ${String(clock.day).padStart(2, "0")} ${String(clock.hour).padStart(2, "0")}:${String(clock.minute).padStart(2, "0")}`;
  const lightStr = `LIGHT ${Math.round(clock.globalLight * 100)}%`;
  const pauseBadge = isPaused ? "\x1b[1;41;37m [PAUSED] \x1b[0m" : "\x1b[1;32m [RUNNING] \x1b[0m";
  const presetNames = ["Archipelago", "Continent", "Highlands"];
  
  const headerLeft = ` \x1b[1;38;5;208m❖ BRUTOPOLIS ROGUELIKE\x1b[0m \x1b[90m│\x1b[0m \x1b[1;33m${timeStr}\x1b[0m \x1b[90m│\x1b[0m \x1b[33m${lightStr}\x1b[0m \x1b[90m│\x1b[0m ${pauseBadge}`;
  const headerRight = `\x1b[36m${presetNames[currentPreset] || "World"}\x1b[0m \x1b[90m│\x1b[0m \x1b[32m${currentFps} FPS\x1b[0m \x1b[90m│\x1b[0m \x1b[1;33m${simSpeed}X (${Math.round(60 * simSpeed)} TPS)\x1b[0m `;
  
  const visLeftLen = stripAnsi(headerLeft).length;
  const visRightLen = stripAnsi(headerRight).length;
  const headerGap = Math.max(1, termCols - visLeftLen - visRightLen);

  out += `\x1b[48;5;235m${headerLeft}${" ".repeat(headerGap)}${headerRight}\x1b[0m\x1b[K\n`;

  // 4. Render Map Glyphs Grid
  for (let r = 0; r < mapRows; r++) {
    const worldY = minY + r;
    let rowChars = "";

    for (let c = 0; c < mapCols; c++) {
      const worldX = minX + c;
      const isCursor = worldX === cursorX && worldY === cursorY;

      // Creature Vision filter
      if (visionEnt) {
        const dist = Math.hypot(worldX - visionEnt.x, worldY - visionEnt.y);
        const inPerception = dist <= viewRange;
        const zk = `${Math.floor(worldX / 8)}_${Math.floor(worldY / 8)}`;
        const isKnown = knownZones.has(zk);

        if (!inPerception && !isKnown) {
          rowChars += isCursor ? `\x1b[7;1;38;5;226m \x1b[0m` : `\x1b[40m \x1b[0m`;
          continue;
        } else if (!inPerception && isKnown) {
          // Dimmed explored memory
          const ent = entityGrid.get(`${worldX},${worldY}`);
          if (isCursor) {
            rowChars += `\x1b[7;1;38;5;244m?\x1b[0m`;
          } else if (ent) {
            const eg = getEntityGlyph(ent);
            rowChars += `\x1b[38;5;240m\x1b[48;5;234m${eg.glyph}\x1b[0m`;
          } else {
            const t = world.getTile(worldX, worldY);
            const tg = TERRAIN_GLYPHS[t] || TERRAIN_GLYPHS[5];
            rowChars += `\x1b[38;5;238m\x1b[48;5;232m${tg.glyph}\x1b[0m`;
          }
          continue;
        }
      }

      // Normal full-color rendering
      const ent = entityGrid.get(`${worldX},${worldY}`);

      if (isCursor) {
        if (ent) {
          const eg = getEntityGlyph(ent);
          rowChars += `\x1b[7;1;38;5;226m${eg.glyph}\x1b[0m`;
        } else {
          const t = world.getTile(worldX, worldY);
          const tg = TERRAIN_GLYPHS[t] || TERRAIN_GLYPHS[5];
          rowChars += `\x1b[7;1;38;5;226m${tg.glyph}\x1b[0m`;
        }
      } else if (ent) {
        const eg = getEntityGlyph(ent);
        rowChars += `${eg.bg}${eg.fg}${eg.glyph}\x1b[0m`;
      } else {
        const t = world.getTile(worldX, worldY);
        const tg = TERRAIN_GLYPHS[t] || TERRAIN_GLYPHS[5];
        rowChars += `${tg.bg}${tg.fg}${tg.glyph}\x1b[0m`;
      }
    }
    out += `${rowChars}\x1b[0m\x1b[K\n`;
  }

  // 5. Bottom Status Bar with Contextual Cursor Details
  const tileUnderCursor = world.getTile(cursorX, cursorY);
  const tileName = world.getTileName(tileUnderCursor);

  const followBadge = isFollowMode ? "\x1b[1;32m[F:ON]\x1b[0m" : "\x1b[90m[F:OFF]\x1b[0m";
  const visionBadge = isCreatureVisionMode ? "\x1b[1;33m[V:ON]\x1b[0m" : "\x1b[90m[V:OFF]\x1b[0m";

  let footActions = `\x1b[1;33m[I]\x1b[0m Dossier \x1b[90m│\x1b[0m \x1b[1;33m[E]\x1b[0m Ent \x1b[90m│\x1b[0m \x1b[1;33m[G]\x1b[0m Grp \x1b[90m│\x1b[0m \x1b[1;33m[L]\x1b[0m Log \x1b[90m│\x1b[0m ${followBadge} ${visionBadge} \x1b[90m│\x1b[0m \x1b[33m[+/-]\x1b[0m TPS`;

  const visActLen = stripAnsi(footActions).length;
  const maxInfoLen = Math.max(12, termCols - visActLen - 4);

  let cursorInfo = `\x1b[1;36m📍 [X:${cursorX}, Y:${cursorY}]\x1b[0m \x1b[90m─\x1b[0m \x1b[37m${tileName}\x1b[0m`;

  if (entityUnderCursor) {
    const eg = getEntityGlyph(entityUnderCursor);
    let eName = entityUnderCursor.properties.name || `Entity #${entityUnderCursor.id}`;
    const eLife = entityUnderCursor.properties.life ? `(${Math.round(entityUnderCursor.properties.life.energy)} cal)` : "";
    
    const baseLen = stripAnsi(`📍 [X:${cursorX}, Y:${cursorY}] ─ ${tileName} │ ${eg.glyph}  ${eLife}`).length;
    const maxNameLen = Math.max(6, maxInfoLen - baseLen);
    if (eName.length > maxNameLen) {
      eName = eName.slice(0, maxNameLen - 1) + "…";
    }

    cursorInfo = `\x1b[1;36m📍 [X:${cursorX}, Y:${cursorY}]\x1b[0m \x1b[90m─\x1b[0m \x1b[37m${tileName}\x1b[0m \x1b[90m│\x1b[0m ${eg.bg}${eg.fg} ${eg.glyph} \x1b[0m \x1b[1;33m${eName}\x1b[0m \x1b[32m${eLife}\x1b[0m`;
  }

  const visInfoLen = stripAnsi(cursorInfo).length;
  const footGap = Math.max(1, termCols - visInfoLen - visActLen - 2);

  out += `\x1b[48;5;235m ${cursorInfo}${" ".repeat(footGap)}${footActions} \x1b[0m\x1b[K`;

  process.stdout.write(out);
}

// ---------------------------------------------------------------------------
// Keyboard & Mouse Dispatcher
// ---------------------------------------------------------------------------

function setupTerminal() {
  process.stdout.write("\x1b[?1049h"); // Alternate Screen Buffer
  process.stdout.write("\x1b[?25l");   // Hide Cursor
  process.stdout.write("\x1b[?7l");    // Disable Auto-Wrap
  process.stdout.write("\x1b[2J");     // Clear Screen
  process.stdout.write("\x1b[?1000h\x1b[?1006h"); // SGR Mouse tracking

  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", handleTerminalInput);
  }
}

function cleanupTerminal() {
  process.stdout.write("\x1b[?1000l\x1b[?1006l"); // Disable Mouse tracking
  process.stdout.write("\x1b[?7h");    // Restore Auto-Wrap
  process.stdout.write("\x1b[?25h");   // Restore Cursor
  process.stdout.write("\x1b[?1049l"); // Exit Alternate Screen Buffer
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(false);
  }
}

function handleTerminalInput(key) {
  // SGR Mouse Input
  if (key.startsWith("\x1b[<")) {
    const match = key.match(/\x1b\[<(\d+);(\d+);(\d+)([Mm])/);
    if (match) {
      const btn = parseInt(match[1], 10);
      const mouseCol = parseInt(match[2], 10) - 1;
      const mouseRow = parseInt(match[3], 10) - 2;

      // Mouse Wheel Up (Button 64)
      if (btn === 64 || btn === 96) {
        if (appMode === "INSPECT") {
          inspectScroll = Math.max(0, inspectScroll - 3);
          renderInspectorScreen();
        } else if (appMode === "ENTITIES") {
          registrySelectedIdx = Math.max(0, registrySelectedIdx - 1);
          renderEntitiesRegistryScreen();
        } else if (appMode === "GROUPS") {
          groupSelectedIdx = Math.max(0, groupSelectedIdx - 1);
          renderGroupsRegistryScreen();
        } else if (appMode === "LOGS") {
          logSelectedIdx = Math.max(0, logSelectedIdx - 1);
          renderWorldLogScreen();
        } else {
          cursorY = Math.max(0, cursorY - 2);
          keepCursorInCamera();
        }
        return;
      }

      // Mouse Wheel Down (Button 65)
      if (btn === 65 || btn === 97) {
        if (appMode === "INSPECT") {
          inspectScroll += 3;
          renderInspectorScreen();
        } else if (appMode === "ENTITIES") {
          registrySelectedIdx++;
          renderEntitiesRegistryScreen();
        } else if (appMode === "GROUPS") {
          groupSelectedIdx++;
          renderGroupsRegistryScreen();
        } else if (appMode === "LOGS") {
          logSelectedIdx++;
          renderWorldLogScreen();
        } else {
          cursorY = Math.min(MAP_HEIGHT - 1, cursorY + 2);
          keepCursorInCamera();
        }
        return;
      }

      // Left Click on Map
      if (btn === 0 && match[4] === "M" && appMode === "MAP") {
        if (mouseCol >= 0 && mouseCol < mapCols && mouseRow >= 0 && mouseRow < mapRows) {
          const halfW = Math.floor(mapCols / 2);
          const halfH = Math.floor(mapRows / 2);
          const minX = Math.max(0, camX - halfW);
          const minY = Math.max(0, camY - halfH);

          cursorX = minX + mouseCol;
          cursorY = minY + mouseRow;
          keepCursorInCamera();
        }
        return;
      }
    }
    return;
  }

  // Ctrl+C -> Force Exit
  if (key === "\u0003") {
    cleanupTerminal();
    console.log("\x1b[32mBrutopolis exited.\x1b[0m");
    process.exit(0);
  }

  // -------------------------------------------------------------------------
  // MODE: INSPECT (Dossier View)
  // -------------------------------------------------------------------------
  if (appMode === "INSPECT") {
    if (key === "\x1b" || key === "\r" || key === "\n" || key === " " || key === "i" || key === "I" || key === "q" || key === "Q") {
      appMode = "MAP";
      process.stdout.write("\x1b[2J");
      return;
    }
    if (key === "\x1b[B" || key === "j" || key === "J" || key === "s" || key === "S") {
      inspectScroll += 3;
      renderInspectorScreen();
      return;
    }
    if (key === "\x1b[A" || key === "k" || key === "K" || key === "w" || key === "W") {
      inspectScroll = Math.max(0, inspectScroll - 3);
      renderInspectorScreen();
      return;
    }
    return;
  }

  // -------------------------------------------------------------------------
  // MODE: ENTITIES (Global Registry View)
  // -------------------------------------------------------------------------
  if (appMode === "ENTITIES") {
    const list = getFilteredEntities();

    if (key === "\x1b" || key === "e" || key === "E" || key === "q" || key === "Q") {
      appMode = "MAP";
      process.stdout.write("\x1b[2J");
      return;
    }
    if (key === "\x1b[A" || key === "w" || key === "W" || key === "k" || key === "8") {
      registrySelectedIdx = Math.max(0, registrySelectedIdx - 1);
      renderEntitiesRegistryScreen();
      return;
    }
    if (key === "\x1b[B" || key === "s" || key === "S" || key === "j" || key === "2") {
      registrySelectedIdx = Math.min(list.length - 1, registrySelectedIdx + 1);
      renderEntitiesRegistryScreen();
      return;
    }
    if (key === "1") { registryFilter = "ALL"; registrySelectedIdx = 0; renderEntitiesRegistryScreen(); return; }
    if (key === "2") { registryFilter = "LIVING"; registrySelectedIdx = 0; renderEntitiesRegistryScreen(); return; }
    if (key === "3") { registryFilter = "ITEMS"; registrySelectedIdx = 0; renderEntitiesRegistryScreen(); return; }
    if (key === "4") { registryFilter = "HUMANOID"; registrySelectedIdx = 0; renderEntitiesRegistryScreen(); return; }
    if (key === "5") { registryFilter = "BEAST"; registrySelectedIdx = 0; renderEntitiesRegistryScreen(); return; }
    if (key === "6") { registryFilter = "FLORA"; registrySelectedIdx = 0; renderEntitiesRegistryScreen(); return; }
    if (key === "\t") {
      const filters = ["ALL", "LIVING", "ITEMS", "HUMANOID", "BEAST", "FLORA"];
      const nextIdx = (filters.indexOf(registryFilter) + 1) % filters.length;
      registryFilter = filters[nextIdx];
      registrySelectedIdx = 0;
      renderEntitiesRegistryScreen();
      return;
    }
    if (key === "\r" || key === "\n" || key === "i" || key === "I") {
      const target = list[registrySelectedIdx];
      if (target) openDedicatedInspector(target);
      return;
    }
    if (key === " " || key === "c" || key === "C") {
      const target = list[registrySelectedIdx];
      if (target) {
        cursorX = target.x;
        cursorY = target.y;
        selectedEntityId = target.id;
        keepCursorInCamera();
        appMode = "MAP";
        process.stdout.write("\x1b[2J");
      }
      return;
    }
    if (key === "k" || key === "K" || key === "\x7f") {
      const target = list[registrySelectedIdx];
      if (target) {
        explodeEntityOnDeath(target, entities, world);
        destroyEntity(target, entities);
        renderEntitiesRegistryScreen();
      }
      return;
    }
    return;
  }

  // -------------------------------------------------------------------------
  // MODE: GROUPS (Factions View)
  // -------------------------------------------------------------------------
  if (appMode === "GROUPS") {
    const groups = getAllGroups();

    if (key === "\x1b" || key === "g" || key === "G" || key === "q" || key === "Q") {
      appMode = "MAP";
      process.stdout.write("\x1b[2J");
      return;
    }
    if (key === "\x1b[A" || key === "w" || key === "W" || key === "k") {
      groupSelectedIdx = Math.max(0, groupSelectedIdx - 1);
      renderGroupsRegistryScreen();
      return;
    }
    if (key === "\x1b[B" || key === "s" || key === "S" || key === "j") {
      groupSelectedIdx = Math.min(groups.length - 1, groupSelectedIdx + 1);
      renderGroupsRegistryScreen();
      return;
    }
    if (key === "z" || key === "Z") {
      const targetGroup = groups[groupSelectedIdx];
      if (targetGroup && targetGroup.claimedZones && targetGroup.claimedZones.length > 0) {
        const zk = targetGroup.claimedZones[0];
        const parts = zk.includes("_") ? zk.split("_") : zk.split(",");
        const zx = parseInt(parts[0], 10);
        const zy = parseInt(parts[1], 10);
        if (!isNaN(zx) && !isNaN(zy)) {
          cursorX = zx * 8 + 4;
          cursorY = zy * 8 + 4;
          keepCursorInCamera();
          appMode = "MAP";
          process.stdout.write("\x1b[2J");
        }
      }
      return;
    }
    if (key === "\r" || key === "\n" || key === "i" || key === "I") {
      const targetGroup = groups[groupSelectedIdx];
      if (targetGroup) {
        appMode = "GROUP_DETAIL";
        renderGroupDetailScreen(targetGroup);
      }
      return;
    }
    if (key === " " || key === "c" || key === "C") {
      const targetGroup = groups[groupSelectedIdx];
      if (targetGroup) {
        const leader = entities.find(e => e.id === targetGroup.members[0] && !e.destroyed);
        if (leader) {
          cursorX = leader.x;
          cursorY = leader.y;
          selectedEntityId = leader.id;
        } else if (targetGroup.campfire) {
          cursorX = targetGroup.campfire.x;
          cursorY = targetGroup.campfire.y;
        }
        keepCursorInCamera();
        appMode = "MAP";
        process.stdout.write("\x1b[2J");
      }
      return;
    }
    return;
  }

  // -------------------------------------------------------------------------
  // MODE: GROUP_DETAIL (Full Clan Dossier & Stockpile View)
  // -------------------------------------------------------------------------
  if (appMode === "GROUP_DETAIL") {
    const groups = getAllGroups();
    const targetGroup = groups[groupSelectedIdx];

    if (key === "\x1b" || key === "g" || key === "G" || key === "q" || key === "Q" || key === "\r" || key === "\n" || key === "i" || key === "I") {
      appMode = "GROUPS";
      renderGroupsRegistryScreen();
      return;
    }
    if (key === "z" || key === "Z") {
      if (targetGroup && targetGroup.claimedZones && targetGroup.claimedZones.length > 0) {
        const zk = targetGroup.claimedZones[0];
        const parts = zk.includes("_") ? zk.split("_") : zk.split(",");
        const zx = parseInt(parts[0], 10);
        const zy = parseInt(parts[1], 10);
        if (!isNaN(zx) && !isNaN(zy)) {
          cursorX = zx * 8 + 4;
          cursorY = zy * 8 + 4;
          keepCursorInCamera();
          appMode = "MAP";
          process.stdout.write("\x1b[2J");
        }
      }
      return;
    }
    if (key === " " || key === "c" || key === "C") {
      if (targetGroup) {
        const leader = entities.find(e => e.id === targetGroup.members[0] && !e.destroyed);
        if (leader) {
          cursorX = leader.x;
          cursorY = leader.y;
          selectedEntityId = leader.id;
        } else if (targetGroup.campfire) {
          cursorX = targetGroup.campfire.x;
          cursorY = targetGroup.campfire.y;
        }
        keepCursorInCamera();
        appMode = "MAP";
        process.stdout.write("\x1b[2J");
      }
      return;
    }
    return;
  }

  // -------------------------------------------------------------------------
  // MODE: LOGS (World Event Log Explorer)
  // -------------------------------------------------------------------------
  if (appMode === "LOGS") {
    const list = getFilteredLogs();

    if (key === "\x1b" || key === "l" || key === "L" || key === "q" || key === "Q") {
      appMode = "MAP";
      process.stdout.write("\x1b[2J");
      return;
    }
    if (key === "\x1b[A" || key === "w" || key === "W" || key === "k" || key === "8") {
      logSelectedIdx = Math.max(0, logSelectedIdx - 1);
      renderWorldLogScreen();
      return;
    }
    if (key === "\x1b[B" || key === "s" || key === "S" || key === "j" || key === "2") {
      logSelectedIdx = Math.min(list.length - 1, logSelectedIdx + 1);
      renderWorldLogScreen();
      return;
    }
    if (key === "1") { logFilter = "ALL"; logSelectedIdx = 0; renderWorldLogScreen(); return; }
    if (key === "2") { logFilter = "ATTACK"; logSelectedIdx = 0; renderWorldLogScreen(); return; }
    if (key === "3") { logFilter = "AMPUTATION"; logSelectedIdx = 0; renderWorldLogScreen(); return; }
    if (key === "4") { logFilter = "DEATH"; logSelectedIdx = 0; renderWorldLogScreen(); return; }
    if (key === "5") { logFilter = "SPROUT"; logSelectedIdx = 0; renderWorldLogScreen(); return; }
    if (key === "6") { logFilter = "COMMUNICATION"; logSelectedIdx = 0; renderWorldLogScreen(); return; }
    if (key === "\t") {
      const filters = ["ALL", "ATTACK", "AMPUTATION", "DEATH", "SPROUT", "COMMUNICATION"];
      const nextIdx = (filters.indexOf(logFilter) + 1) % filters.length;
      logFilter = filters[nextIdx];
      logSelectedIdx = 0;
      renderWorldLogScreen();
      return;
    }
    // Focus camera on event location
    if (key === " " || key === "c" || key === "C" || key === "\r" || key === "\n") {
      const targetEvent = list[logSelectedIdx];
      if (targetEvent && targetEvent.location) {
        cursorX = targetEvent.location.x;
        cursorY = targetEvent.location.y;
        keepCursorInCamera();
        appMode = "MAP";
        process.stdout.write("\x1b[2J");
      }
      return;
    }
    return;
  }

  // -------------------------------------------------------------------------
  // MODE: MAP (Main Game Loop)
  // -------------------------------------------------------------------------

  // 'q' or 'Q' -> Quit
  if (key === "q" || key === "Q") {
    cleanupTerminal();
    console.log("\x1b[32mBrutopolis Roguelike exited.\x1b[0m");
    process.exit(0);
  }

  // 'i', 'I', or Enter -> Open Dossier
  if (key === "i" || key === "I" || key === "\r" || key === "\n") {
    openDedicatedInspector();
    return;
  }

  // 'e' or 'E' -> Open Global Entities Registry
  if (key === "e" || key === "E") {
    appMode = "ENTITIES";
    registrySelectedIdx = 0;
    renderEntitiesRegistryScreen();
    return;
  }

  // 'g' or 'G' -> Open Global Groups Registry
  if (key === "g" || key === "G") {
    appMode = "GROUPS";
    groupSelectedIdx = 0;
    renderGroupsRegistryScreen();
    return;
  }

  // 'l' or 'L' -> Open Global World Log Explorer
  if (key === "l" || key === "L") {
    appMode = "LOGS";
    logSelectedIdx = 0;
    renderWorldLogScreen();
    return;
  }

  // Simulation Speed Controls (+ and - or [ and ])
  if (key === "+" || key === "=" || key === "]") {
    const idx = SPEED_TIERS.indexOf(simSpeed);
    if (idx !== -1 && idx < SPEED_TIERS.length - 1) simSpeed = SPEED_TIERS[idx + 1];
    else simSpeed = Math.min(32, simSpeed * 2);
    if (shader) shader.exports.wasm_set_tps(Math.round(60 * simSpeed));
    return;
  }
  if (key === "-" || key === "_" || key === "[") {
    const idx = SPEED_TIERS.indexOf(simSpeed);
    if (idx > 0) simSpeed = SPEED_TIERS[idx - 1];
    else simSpeed = Math.max(0.25, simSpeed / 2);
    if (shader) shader.exports.wasm_set_tps(Math.round(60 * simSpeed));
    return;
  }

  // Space or 'p' -> Pause / Resume
  if (key === " " || key === "p" || key === "P") {
    isPaused = !isPaused;
    if (shader) shader.exports.wasm_set_paused(isPaused ? 1 : 0);
    return;
  }

  // 'f' or 'F' -> Toggle Camera Follow Mode
  if (key === "f" || key === "F") {
    isFollowMode = !isFollowMode;
    return;
  }

  // 'v' or 'V' -> Toggle Creature Vision Mode (Eyes of Creature)
  if (key === "v" || key === "V") {
    isCreatureVisionMode = !isCreatureVisionMode;
    return;
  }

  // Tab -> Cycle next living entity
  if (key === "\t") {
    cycleNextLivingEntity();
    return;
  }

  // Roguelike Cursor Movement
  let dx = 0;
  let dy = 0;

  if (key === "\x1b[A" || key === "w" || key === "W" || key === "k" || key === "8") dy = -1;
  else if (key === "\x1b[B" || key === "s" || key === "S" || key === "j" || key === "2") dy = 1;
  else if (key === "\x1b[D" || key === "a" || key === "A" || key === "h" || key === "4") dx = -1;
  else if (key === "\x1b[C" || key === "d" || key === "D" || key === "l" || key === "6") dx = 1;
  else if (key === "y" || key === "7") { dx = -1; dy = -1; }
  else if (key === "u" || key === "9") { dx = 1; dy = -1; }
  else if (key === "b" || key === "1") { dx = -1; dy = 1; }
  else if (key === "n" || key === "3") { dx = 1; dy = 1; }

  if (dx !== 0 || dy !== 0) {
    cursorX += dx;
    cursorY += dy;
    keepCursorInCamera();
    return;
  }

  // Center on Cursor
  if (key === "c" || key === "C") {
    camX = cursorX;
    camY = cursorY;
    return;
  }

  // Kill / Explode Target
  if (key === "k" || key === "K" || key === "\x7f") {
    const ent = entities.find(e => !e.destroyed && e.x === cursorX && e.y === cursorY);
    if (ent) {
      explodeEntityOnDeath(ent, entities, world);
      destroyEntity(ent, entities);
      cycleNextLivingEntity();
    }
    return;
  }

  // Regenerate World
  if (key === "r" || key === "R") {
    resetWorld((currentPreset + 1) % 3);
    return;
  }

  // Creature Spawners
  if (key === "1") spawnEntityAtCursor(createKnight);
  if (key === "2") spawnEntityAtCursor(createArcher);
  if (key === "3") spawnEntityAtCursor(createWolf);
  if (key === "4") spawnEntityAtCursor(createBear);
  if (key === "5") spawnEntityAtCursor(createCat);
  if (key === "6") spawnEntityAtCursor(createGoblin);
  if (key === "7") spawnEntityAtCursor(createBat);
  if (key === "8") spawnEntityAtCursor(createSeaSerpent);
  if (key === "9") spawnEntityAtCursor(createDragon);
  if (key === "0") spawnEntityAtCursor(createCactus);
  if (key === "!") spawnEntityAtCursor(createScorpion);
  if (key === "@") spawnEntityAtCursor(createLizard);
  if (key === "#") spawnEntityAtCursor(createMountainGoat);
  if (key === "$") spawnEntityAtCursor(createAlpineShrub);
  if (key === "%") spawnEntityAtCursor(createFruit);
  if (key === "^") spawnEntityAtCursor(createWoodItem);
  if (key === "&") spawnEntityAtCursor(createStoneItem);
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

    // 60 FPS Render Loop
    setInterval(renderRoguelikeScreen, 1000 / 60);
  } catch (err) {
    cleanupTerminal();
    console.error("Fatal error starting Brutopolis Roguelike:", err);
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
