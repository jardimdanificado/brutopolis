// =============================================================================
// Brutopolis — Biological Simulation Engine & WASM Graphics Pipeline
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
  createArmProp,
  createLegProp,
  createEyeProp,
  createWingsProp,
  createDeepRootProp,
  createSurfaceRootProp,
  createTerrainPreferenceProp,
  createParasitesProp,
  createPhotosynthesisProp,
  createRegenerationProp,
  createBodyRegenerationProp,
  createCombatProp,
  createBurnProp,
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
  createOakTree,
  createWillowTree,
  createPineTree,
  createWaterLily,
  createSeaweed,
  createFruit,
  createSeedEntity
} from "./js/properties.js";

// ---------------------------------------------------------------------------
// Canvas & Simulation Setup
// ---------------------------------------------------------------------------

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const CANVAS_WIDTH = 480;
const CANVAS_HEIGHT = 360;
canvas.width = CANVAS_WIDTH;
canvas.height = CANVAS_HEIGHT;

const FRAMEBUFFER_SIZE = CANVAS_WIDTH * CANVAS_HEIGHT * 4;

const mem = wash_memory(32 * 1024 * 1024);
const imageData = ctx.createImageData(CANVAS_WIDTH, CANVAS_HEIGHT);

let shader = null;
let world = null;
let entities = [];

let isPaused = false;
let currentTps = 60;
let simAccumulator = 0;
let lastSelectedId = -1;
let lastRenderedEntityId = -1;
let lastGlobalEventsCount = -1;
let lastEntityEventsCount = -1;
let currentEventFilter = "ALL";

// UI Elements
const hudClock = document.getElementById("hud-clock");
const hudLight = document.getElementById("hud-light");
const hudHeat = document.getElementById("hud-heat");
const btnPause = document.getElementById("btn-pause");
const btnPauseText = document.getElementById("btn-pause-text");
const sliderTps = document.getElementById("slider-tps");
const valTps = document.getElementById("val-tps");
const selectPreset = document.getElementById("select-preset");
const btnReset = document.getElementById("btn-reset");

const btnZoomIn = document.getElementById("btn-zoom-in");
const btnZoomOut = document.getElementById("btn-zoom-out");
const btnCenter = document.getElementById("btn-center");

const cursorPos = document.getElementById("cursor-pos");
const cursorEntity = document.getElementById("cursor-entity");

const statPop = document.getElementById("stat-pop");
const statLiving = document.getElementById("stat-living");
const statFood = document.getElementById("stat-food");

// Tabs Elements
const tabBtns = document.querySelectorAll(".tab-btn");
const tabPanes = document.querySelectorAll(".tab-pane");
const tabEventsBadge = document.getElementById("tab-events-badge");

// Inspector Elements
const inspIdBadge = document.getElementById("insp-id-badge");
const inspEmpty = document.getElementById("insp-empty");
const inspDetails = document.getElementById("insp-details");
const inspAvatar = document.getElementById("insp-avatar");
const inspName = document.getElementById("insp-name");
const inspSpecies = document.getElementById("insp-species");
const inspPropsCount = document.getElementById("insp-props-count");
const inspPos = document.getElementById("insp-pos");
const inspVitalsContainer = document.getElementById("insp-vitals-container");
const inspAmputationsContainer = document.getElementById("insp-amputations-container");
const inspRespirationBadge = document.getElementById("insp-respiration-badge");
const inspBrainCard = document.getElementById("insp-brain-card");
const inspBrainContent = document.getElementById("insp-brain-content");
const inspStomachCard = document.getElementById("insp-stomach-card");
const inspStomachContent = document.getElementById("insp-stomach-content");
const inspPropsList = document.getElementById("insp-props-list");
const inspEventList = document.getElementById("insp-event-list");
const globalEventsList = document.getElementById("global-events-list");
const logEventsCount = document.getElementById("log-events-count");

const selectInjectProp = document.getElementById("select-inject-prop");
const btnInjectProp = document.getElementById("btn-inject-prop");
const btnInspFollow = document.getElementById("btn-insp-follow");
const btnInspKill = document.getElementById("btn-insp-kill");

// Spawner buttons
const btnSpawnKnight = document.getElementById("btn-spawn-knight");
const btnSpawnArcher = document.getElementById("btn-spawn-archer");
const btnSpawnWolf = document.getElementById("btn-spawn-wolf");
const btnSpawnBear = document.getElementById("btn-spawn-bear");
const btnSpawnCat = document.getElementById("btn-spawn-cat");
const btnSpawnGoblin = document.getElementById("btn-spawn-goblin");
const btnSpawnBat = document.getElementById("btn-spawn-bat");
const btnSpawnSerpent = document.getElementById("btn-spawn-serpent");
const btnSpawnDragon = document.getElementById("btn-spawn-dragon");
const btnSpawnCactus = document.getElementById("btn-spawn-cactus");
const btnSpawnScorpion = document.getElementById("btn-spawn-scorpion");
const btnSpawnLizard = document.getElementById("btn-spawn-lizard");
const btnSpawnGoat = document.getElementById("btn-spawn-goat");
const btnSpawnShrub = document.getElementById("btn-spawn-shrub");
const btnSpawnSeed = document.getElementById("btn-spawn-seed");
const btnSpawnFruit = document.getElementById("btn-spawn-fruit");

// Scratch pointers for Avatar preview
const SPRITE_BUF_PTR = mem.heapBase + FRAMEBUFFER_SIZE + 16384;
const NAME_PTR = mem.heapBase + FRAMEBUFFER_SIZE + 20480;

// ---------------------------------------------------------------------------
// Tab Switching Controller
// ---------------------------------------------------------------------------

function activateTab(tabId) {
  tabBtns.forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tab === tabId);
  });
  tabPanes.forEach(pane => {
    pane.classList.toggle("active", pane.id === tabId);
  });
}

tabBtns.forEach(btn => {
  btn.addEventListener("click", () => {
    activateTab(btn.dataset.tab);
  });
});

// Event Log Filter Chips
document.querySelectorAll(".filter-chip").forEach(chip => {
  chip.addEventListener("click", (e) => {
    document.querySelectorAll(".filter-chip").forEach(c => c.classList.remove("active"));
    chip.classList.add("active");
    currentEventFilter = chip.dataset.filter;
    lastGlobalEventsCount = -1; // Force immediate re-render
    updateGlobalEventsList();
  });
});

// ---------------------------------------------------------------------------
// Mouse & Keyboard Controls (Aspect-Ratio Aware & Precise Drag/Click)
// ---------------------------------------------------------------------------

let mouseX = 0;
let mouseY = 0;
let mouseButtons = 0;
let isMouseDown = false;
let isDragging = false;
let dragStartClientX = 0;
let dragStartClientY = 0;
let dragCameraStartX = 0;
let dragCameraStartY = 0;

function getCanvasCoords(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const canvasAspect = CANVAS_WIDTH / CANVAS_HEIGHT;
  const elemAspect = rect.width / rect.height;
  let renderW, renderH, offsetX, offsetY;

  if (elemAspect > canvasAspect) {
    renderH = rect.height;
    renderW = renderH * canvasAspect;
    offsetX = (rect.width - renderW) / 2;
    offsetY = 0;
  } else {
    renderW = rect.width;
    renderH = renderW / canvasAspect;
    offsetX = 0;
    offsetY = (rect.height - renderH) / 2;
  }

  const cx = clientX - rect.left - offsetX;
  const cy = clientY - rect.top - offsetY;

  return {
    x: Math.max(0, Math.min(CANVAS_WIDTH, (cx / renderW) * CANVAS_WIDTH)),
    y: Math.max(0, Math.min(CANVAS_HEIGHT, (cy / renderH) * CANVAS_HEIGHT)),
    inside: cx >= 0 && cx <= renderW && cy >= 0 && cy <= renderH,
    renderW,
    renderH
  };
}

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
});

window.addEventListener("mousemove", (e) => {
  const coords = getCanvasCoords(e.clientX, e.clientY);
  mouseX = coords.x;
  mouseY = coords.y;

  // Update hovered tile info overlay
  if (coords.inside && shader && world) {
    const zoom = shader.exports.wasm_get_camera_zoom();
    const tileSize = 16.0 * zoom;
    const cx = shader.exports.wasm_get_camera_x();
    const cy = shader.exports.wasm_get_camera_y();
    const worldTileX = Math.floor(cx + (coords.x - CANVAS_WIDTH / 2) / tileSize);
    const worldTileY = Math.floor(cy + (coords.y - CANVAS_HEIGHT / 2) / tileSize);

    if (cursorPos) cursorPos.textContent = `POS: ${worldTileX}, ${worldTileY}`;

    // Find if entity is under cursor
    let foundEnt = null;
    for (let i = entities.length - 1; i >= 0; i--) {
      const ent = entities[i];
      if (!ent.destroyed && ent.x === worldTileX && ent.y === worldTileY) {
        foundEnt = ent;
        break;
      }
    }

    if (cursorEntity) {
      if (foundEnt) {
        const entName = foundEnt.properties.name || `Entidade #${foundEnt.id}`;
        cursorEntity.textContent = `🎯 ${entName}`;
        cursorEntity.style.color = "var(--yellow-bright)";
      } else {
        const tile = world.getTile(worldTileX, worldTileY);
        const tileName = tile === 0 ? "Solo Fértil" : tile === 1 ? "Montanha" : tile === 2 ? "Água Oceânica" : "Vazio";
        cursorEntity.textContent = `🗺️ ${tileName}`;
        cursorEntity.style.color = "var(--fg3)";
      }
    }
  }

  // Panning drag
  if (isMouseDown && shader) {
    const totalDist = Math.hypot(e.clientX - dragStartClientX, e.clientY - dragStartClientY);
    if (totalDist > 4) {
      isDragging = true;
      const zoom = shader.exports.wasm_get_camera_zoom();
      const pixelScale = coords.renderW / CANVAS_WIDTH;
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
  if (isMouseDown && shader) {
    const totalDist = Math.hypot(e.clientX - dragStartClientX, e.clientY - dragStartClientY);
    if (!isDragging && totalDist <= 5) {
      const coords = getCanvasCoords(e.clientX, e.clientY);
      if (coords.inside) {
        const foundId = shader.exports.wasm_select_at(coords.x, coords.y, CANVAS_WIDTH, CANVAS_HEIGHT);
        lastSelectedId = foundId;
        if (foundId > 0) {
          activateTab("tab-insp");
        }
        updateInspector();
      }
    }
  }
  isMouseDown = false;
  isDragging = false;
  mouseButtons = 0;
});

canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  if (!shader) return;
  let zoom = shader.exports.wasm_get_camera_zoom();
  const cx = shader.exports.wasm_get_camera_x();
  const cy = shader.exports.wasm_get_camera_y();

  if (e.deltaY < 0) zoom *= 1.15;
  else zoom /= 1.15;

  shader.exports.wasm_set_camera(cx, cy, zoom);
}, { passive: false });

const keysDown = new Set();

window.addEventListener("keydown", (e) => {
  keysDown.add(e.code);

  if (e.code === "Space") {
    e.preventDefault();
    togglePause();
  } else if (e.code === "KeyR") {
    resetWorld();
  } else if (e.code === "KeyC") {
    centerCamera();
  }
});

window.addEventListener("keyup", (e) => {
  keysDown.delete(e.code);
});

function handleKeyMovement(dt) {
  if (!shader) return;
  let cx = shader.exports.wasm_get_camera_x();
  let cy = shader.exports.wasm_get_camera_y();
  let zoom = shader.exports.wasm_get_camera_zoom();

  const speed = (200.0 / zoom) * dt;

  if (keysDown.has("KeyW") || keysDown.has("ArrowUp")) cy -= speed;
  if (keysDown.has("KeyS") || keysDown.has("ArrowDown")) cy += speed;
  if (keysDown.has("KeyA") || keysDown.has("ArrowLeft")) cx -= speed;
  if (keysDown.has("KeyD") || keysDown.has("ArrowRight")) cx -= speed;

  if (keysDown.has("KeyQ")) zoom /= (1.0 + 1.5 * dt);
  if (keysDown.has("KeyE")) zoom *= (1.0 + 1.5 * dt);

  shader.exports.wasm_set_camera(cx, cy, zoom);
}

// ---------------------------------------------------------------------------
// UI Interactions
// ---------------------------------------------------------------------------

function togglePause() {
  if (!shader) return;
  isPaused = !isPaused;
  shader.exports.wasm_set_paused(isPaused ? 1 : 0);
  btnPauseText.textContent = isPaused ? "CONTINUAR" : "PAUSAR";
  btnPause.className = isPaused ? "danger" : "primary";
}

btnPause.addEventListener("click", togglePause);

sliderTps.addEventListener("input", (e) => {
  currentTps = parseInt(e.target.value, 10);
  valTps.textContent = currentTps;
  if (shader) shader.exports.wasm_set_tps(currentTps);
});

function resetWorld() {
  if (!shader) return;
  const preset = parseInt(selectPreset.value, 10);
  shader.exports.wasm_init(preset);

  // Reset engine ticks & clear existing registry & events
  resetEngineTicks();
  resetWorldEvents();
  world.refresh();
  entities = [];
  lastSelectedId = -1;
  lastRenderedEntityId = -1;
  lastGlobalEventsCount = -1;

  // Helper to spawn entities randomly across entire 512x512 map
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

  // 1. Flora Distribution by Biome
  // Fertile Forest / Grassland (Tile 0)
  spawnRandomGlobal(35, createOakTree, (x, y) => world.getTile(x, y) === 0);
  spawnRandomGlobal(25, createWillowTree, (x, y) => world.getTile(x, y) === 0 || world.getTile(x, y) === 3);

  // Desert & Dunes (Tile 3 - Sand)
  spawnRandomGlobal(30, createCactus, (x, y) => world.getTile(x, y) === 3);

  // Rocky Foothills & Mountain Slopes (Tile 4 - Stone & Tile 1)
  spawnRandomGlobal(25, createAlpineShrub, (x, y) => world.getTile(x, y) === 4 || world.getTile(x, y) === 1);
  spawnRandomGlobal(20, createPineTree, (x, y) => world.getTile(x, y) === 4 || world.getTile(x, y) === 0);

  // Aquatic Flora (Tile 2 - Water)
  spawnRandomGlobal(40, createWaterLily, (x, y) => world.getTile(x, y) === 2);
  spawnRandomGlobal(50, createSeaweed, (x, y) => world.getTile(x, y) === 2);

  // 2. Seeds & Fruits Scattered Globally per Biome
  spawnRandomGlobal(60, (x, y) => createSeedEntity(x, y, "large", "oak"), (x, y) => world.getTile(x, y) === 0);
  spawnRandomGlobal(40, (x, y) => createSeedEntity(x, y, "small", "willow"), (x, y) => world.getTile(x, y) === 0 || world.getTile(x, y) === 3);
  spawnRandomGlobal(30, (x, y) => createSeedEntity(x, y, "large", "cactus"), (x, y) => world.getTile(x, y) === 3);
  spawnRandomGlobal(30, (x, y) => createFruit(x, y, "large", "cactus"), (x, y) => world.getTile(x, y) === 3);
  spawnRandomGlobal(40, (x, y) => createFruit(x, y, "large", "oak"), (x, y) => world.isWalkable(x, y));

  // 3. Desert Fauna (Sand Biome)
  spawnRandomGlobal(25, createScorpion, (x, y) => world.getTile(x, y) === 3);
  spawnRandomGlobal(20, createLizard, (x, y) => world.getTile(x, y) === 3 || world.getTile(x, y) === 0);

  // 4. Mountain & Rocky Fauna (Stone & Mountain Biome)
  spawnRandomGlobal(20, createMountainGoat, (x, y) => world.getTile(x, y) === 4 || world.getTile(x, y) === 1);
  spawnRandomGlobal(4, createDragon, (x, y) => world.getTile(x, y) === 1 || world.getTile(x, y) === 4);

  // 5. Forest & Grassland Fauna
  spawnRandomGlobal(20, (x, y) => createCat(x, y, false), (x, y) => world.getTile(x, y) === 0);
  spawnRandomGlobal(8, (x, y) => createCat(x, y, true), (x, y) => world.getTile(x, y) === 0);
  spawnRandomGlobal(18, createWolf, (x, y) => world.getTile(x, y) === 0 || world.getTile(x, y) === 4);
  spawnRandomGlobal(10, createBear, (x, y) => world.getTile(x, y) === 0);
  spawnRandomGlobal(25, createBat, (x, y) => true);
  spawnRandomGlobal(18, (x, y) => createKnight(x, y, Math.random() < 0.5 ? "male" : "female"), (x, y) => world.getTile(x, y) === 0);
  spawnRandomGlobal(18, (x, y) => createArcher(x, y, Math.random() < 0.5 ? "male" : "female"), (x, y) => world.getTile(x, y) === 0);
  spawnRandomGlobal(22, createGoblin, (x, y) => world.getTile(x, y) === 0 || world.getTile(x, y) === 4);

  // 6. Aquatic Ocean Fauna
  spawnRandomGlobal(20, createSeaSerpent, (x, y) => world.getTile(x, y) === 2);

  console.log(`✓ World initialized with ${entities.length} active entities.`);
  updateStatsAndClock();
  updateInspector();
  updateGlobalEventsList();
}

btnReset.addEventListener("click", resetWorld);
selectPreset.addEventListener("change", resetWorld);

btnZoomIn.addEventListener("click", () => {
  if (!shader) return;
  const cx = shader.exports.wasm_get_camera_x();
  const cy = shader.exports.wasm_get_camera_y();
  const zoom = shader.exports.wasm_get_camera_zoom() * 1.25;
  shader.exports.wasm_set_camera(cx, cy, zoom);
});

btnZoomOut.addEventListener("click", () => {
  if (!shader) return;
  const cx = shader.exports.wasm_get_camera_x();
  const cy = shader.exports.wasm_get_camera_y();
  const zoom = shader.exports.wasm_get_camera_zoom() / 1.25;
  shader.exports.wasm_set_camera(cx, cy, zoom);
});

function centerCamera() {
  if (!shader) return;
  const selEntity = getEntityById(lastSelectedId);
  if (selEntity) {
    shader.exports.wasm_set_camera(selEntity.x, selEntity.y, shader.exports.wasm_get_camera_zoom());
  } else {
    shader.exports.wasm_set_camera(256, 256, 1.0);
  }
}

btnCenter.addEventListener("click", centerCamera);
btnInspFollow.addEventListener("click", centerCamera);

btnInspKill.addEventListener("click", () => {
  if (lastSelectedId < 0) return;
  const entity = getEntityById(lastSelectedId);
  if (entity) {
    explodeEntityOnDeath(entity, entities, world);
    destroyEntity(entity, entities);
    lastSelectedId = -1;
    updateInspector();
  }
});

// Property Injector Handler
btnInjectProp.addEventListener("click", () => {
  const entity = getEntityById(lastSelectedId);
  if (!entity) {
    alert("Selecione primeiro uma criatura no mapa para injetar a propriedade!");
    return;
  }

  const propType = selectInjectProp.value;
  if (propType === "lungs") {
    entity.properties.lungs = createLungsProp();
  } else if (propType === "gills") {
    entity.properties.gills = createGillsProp();
  } else if (propType === "body_regen") {
    entity.properties.body_regen = createBodyRegenerationProp(1.0, 4, 10);
  } else if (propType === "combat") {
    entity.properties.combat = createCombatProp(1.2, 3);
  } else if (propType === "wings") {
    entity.properties.wings = createWingsProp(1.0, 100, 100, 20.0);
  } else if (propType === "surface_root") {
    entity.properties.surface_root = createSurfaceRootProp(8);
  } else if (propType === "deep_root") {
    entity.properties.deep_root = createDeepRootProp(18.0, 12.0);
  } else if (propType === "terrain_sand") {
    entity.properties.terrain_pref = createTerrainPreferenceProp([3], "Areia / Deserto");
  } else if (propType === "terrain_stone") {
    entity.properties.terrain_pref = createTerrainPreferenceProp([4, 1], "Chão Rochoso e Montanha");
  } else if (propType === "terrain_water") {
    entity.properties.terrain_pref = createTerrainPreferenceProp([2], "Água");
  } else if (propType === "terrain_floor") {
    entity.properties.terrain_pref = createTerrainPreferenceProp([0], "Solo Fértil");
  } else if (propType === "parasites") {
    entity.properties.parasites = createParasitesProp(1.5);
  } else if (propType === "stomach") {
    entity.properties.stomach = createStomachProp(4);
  } else if (propType === "bladder") {
    entity.properties.bladder = createBladderProp(3000, 3000);
  } else if (propType === "kidney") {
    entity.properties.kidney = createKidneyProp(0.75);
  } else if (propType === "brain") {
    entity.properties.brain = createBrainProp(16);
  } else if (propType === "burn") {
    entity.properties.burn = createBurnProp(0.5, 40);
  }
  lastRenderedEntityId = -1; // Force re-render of inspector
  activateTab("tab-insp");
  updateInspector();
});

// Spawner Actions
function spawnEntityAtCamera(factoryFn) {
  if (!shader) return;
  const cx = Math.floor(shader.exports.wasm_get_camera_x());
  const cy = Math.floor(shader.exports.wasm_get_camera_y());
  const ent = factoryFn(cx, cy);
  entities.push(ent);
  lastSelectedId = ent.id;
  shader.exports.wasm_select_entity(ent.id);
  activateTab("tab-insp");
  updateInspector();
}

btnSpawnKnight?.addEventListener("click", () => spawnEntityAtCamera(createKnight));
btnSpawnArcher?.addEventListener("click", () => spawnEntityAtCamera(createArcher));
btnSpawnWolf?.addEventListener("click", () => spawnEntityAtCamera(createWolf));
btnSpawnBear?.addEventListener("click", () => spawnEntityAtCamera(createBear));
btnSpawnCat?.addEventListener("click", () => spawnEntityAtCamera(createCat));
btnSpawnGoblin?.addEventListener("click", () => spawnEntityAtCamera(createGoblin));
btnSpawnBat?.addEventListener("click", () => spawnEntityAtCamera(createBat));
btnSpawnSerpent?.addEventListener("click", () => spawnEntityAtCamera(createSeaSerpent));
btnSpawnDragon?.addEventListener("click", () => spawnEntityAtCamera(createDragon));
btnSpawnCactus?.addEventListener("click", () => spawnEntityAtCamera(createCactus));
btnSpawnScorpion?.addEventListener("click", () => spawnEntityAtCamera(createScorpion));
btnSpawnLizard?.addEventListener("click", () => spawnEntityAtCamera(createLizard));
btnSpawnGoat?.addEventListener("click", () => spawnEntityAtCamera(createMountainGoat));
btnSpawnShrub?.addEventListener("click", () => spawnEntityAtCamera(createAlpineShrub));
btnSpawnSeed?.addEventListener("click", () => spawnEntityAtCamera(createSeedEntity));
btnSpawnFruit?.addEventListener("click", () => spawnEntityAtCamera(createFruit));

// ---------------------------------------------------------------------------
// Dynamic Biological Inspector & Fast DOM Reconciliation
// ---------------------------------------------------------------------------

function updateStatsAndClock() {
  if (!world) return;

  const clock = world.clock;
  hudClock.textContent = `DIA ${String(clock.day).padStart(2, "0")} ${String(clock.hour).padStart(2, "0")}:${String(clock.minute).padStart(2, "0")}`;
  hudLight.textContent = `${Math.round(clock.globalLight * 100)}%`;
  hudHeat.textContent = `${Math.round(clock.globalHeat * 100)}%`;

  let livingCount = 0;
  let foodCount = 0;

  for (let i = 0; i < entities.length; i++) {
    const e = entities[i];
    if (e.properties.life) livingCount++;
    if (e.properties.edible || e.properties.germination) foodCount++;
  }

  statPop.textContent = entities.length;
  statLiving.textContent = livingCount;
  statFood.textContent = foodCount;

  if (tabEventsBadge) tabEventsBadge.textContent = allEvents.length;
}

function updateGlobalEventsList() {
  if (!globalEventsList) return;
  if (lastGlobalEventsCount === allEvents.length) return;
  lastGlobalEventsCount = allEvents.length;

  if (logEventsCount) logEventsCount.textContent = `${allEvents.length} EVTS`;

  const recents = getRecentWorldEvents(20);
  const filtered = currentEventFilter === "ALL"
    ? recents
    : recents.filter(ev => ev.type === currentEventFilter);

  globalEventsList.innerHTML = "";
  if (filtered.length === 0) {
    globalEventsList.innerHTML = `<span style="color: var(--gray); font-style: italic; padding: 6px;">Nenhum acontecimento registrado para este filtro.</span>`;
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const ev of filtered) {
    const evDiv = document.createElement("div");
    evDiv.className = `event-item ${ev.type.toLowerCase()}`;

    const timeTag = `<span style="color: var(--gray); font-size: 9px;">[D${ev.timestamp.day} ${String(ev.timestamp.hour).padStart(2, "0")}:${String(ev.timestamp.minute).padStart(2, "0")}]</span>`;
    const typeTag = `<b style="color: var(--fg0);">${ev.type}:</b>`;
    const descTag = `<span style="color: var(--fg2);">${ev.description}</span>`;

    evDiv.innerHTML = `${timeTag} ${typeTag} ${descTag}`;

    if (ev.location && (ev.location.x || ev.location.y)) {
      evDiv.style.cursor = "pointer";
      evDiv.title = `Clique para focar câmera na posição [${ev.location.x}, ${ev.location.y}]`;
      evDiv.addEventListener("click", () => {
        if (shader) shader.exports.wasm_set_camera(ev.location.x, ev.location.y, shader.exports.wasm_get_camera_zoom());
      });
    }

    fragment.appendChild(evDiv);
  }
  globalEventsList.appendChild(fragment);
}

function updateInspector() {
  const entity = getEntityById(lastSelectedId);
  if (!entity || entity.destroyed) {
    inspEmpty.style.display = "flex";
    inspDetails.style.display = "none";
    inspIdBadge.textContent = "#--";
    lastSelectedId = -1;
    lastRenderedEntityId = -1;
    return;
  }

  inspEmpty.style.display = "none";
  inspDetails.style.display = "flex";
  inspIdBadge.textContent = `#${entity.id}`;
  inspName.textContent = entity.properties.name || `Entidade #${entity.id}`;
  inspPos.textContent = `POS: ${entity.x}, ${entity.y}`;

  if (inspSpecies) {
    inspSpecies.textContent = entity.properties.species || "Espécie";
  }

  const propEntries = Object.entries(entity.properties);
  inspPropsCount.textContent = `${propEntries.length} PROPS`;

  // 1. Render Avatar Preview (only when selection changed)
  const r = entity.properties.render;
  if (lastRenderedEntityId !== entity.id) {
    lastRenderedEntityId = entity.id;

    if (r && r.skin && shader) {
      wash_write_string(mem, r.skin, NAME_PTR);
      const ok = shader.exports.wasm_get_sprite_data(NAME_PTR, r.color || 0xffffffff, r.backcolor !== undefined ? r.backcolor : 0, SPRITE_BUF_PTR);
      if (ok) {
        const spriteBytes = new Uint8ClampedArray(mem.buffer, SPRITE_BUF_PTR, 16 * 16 * 4);
        let avatarCanvas = document.getElementById("avatar-canvas");
        if (!avatarCanvas) {
          avatarCanvas = document.createElement("canvas");
          avatarCanvas.id = "avatar-canvas";
          avatarCanvas.width = 16;
          avatarCanvas.height = 16;
          avatarCanvas.style.width = "36px";
          avatarCanvas.style.height = "36px";
          avatarCanvas.style.imageRendering = "pixelated";
          inspAvatar.innerHTML = "";
          inspAvatar.appendChild(avatarCanvas);
        }
        const actx = avatarCanvas.getContext("2d");
        const imgData = new ImageData(spriteBytes, 16, 16);
        actx.clearRect(0, 0, 16, 16);
        actx.putImageData(imgData, 0, 0);
      }
    } else {
      inspAvatar.innerHTML = `<span style="font-size: 16px; color: var(--gray);">∅</span>`;
    }
  }

  // 2. Structured Vitals & Physical Condition Bars
  let vitalsHtml = "";

  // Vital Energy Bar
  if (entity.properties.life) {
    const lp = entity.properties.life;
    const energyPct = Math.max(0, Math.min(100, (lp.energy / (lp.max || 100)) * 100));
    vitalsHtml += `
      <div class="stat-row">
        <div class="stat-header">
          <span>⚡ Energia Vital</span>
          <span><b>${Math.round(lp.energy)}</b>/${lp.max || 100} (${Math.round(energyPct)}%)</span>
        </div>
        <div class="bar-bg">
          <div class="bar-fill" style="background: var(--green-bright); width: ${energyPct}%;"></div>
        </div>
      </div>`;
  }

  // Physical Integrity / Condition Bar
  const condLimb = Object.values(entity.properties).find(p => p && typeof p.condition === "number" && typeof p.maxCondition === "number");
  if (condLimb) {
    const condPct = Math.round((condLimb.condition / condLimb.maxCondition) * 100);
    const condColor = condPct > 60 ? "var(--aqua-bright)" : condPct > 25 ? "var(--yellow-bright)" : "var(--red-bright)";
    vitalsHtml += `
      <div class="stat-row">
        <div class="stat-header">
          <span>🛡️ Condição Física</span>
          <span><b>${Math.round(condLimb.condition)}</b>/${condLimb.maxCondition} (${condPct}%)</span>
        </div>
        <div class="bar-bg">
          <div class="bar-fill" style="background: ${condColor}; width: ${Math.max(0, Math.min(100, condPct))}%;"></div>
        </div>
      </div>`;
  }

  // Water / Bladder Bar
  if (entity.properties.bladder) {
    const bp = entity.properties.bladder;
    const waterPct = Math.max(0, Math.min(100, (bp.water / (bp.maxWater || 100)) * 100));
    vitalsHtml += `
      <div class="stat-row">
        <div class="stat-header">
          <span>💧 Água & Bexiga</span>
          <span><b>${Math.round(bp.water)}</b>/${bp.maxWater || 100}</span>
        </div>
        <div class="bar-bg">
          <div class="bar-fill" style="background: var(--blue-bright); width: ${waterPct}%;"></div>
        </div>
      </div>`;
  }

  inspVitalsContainer.innerHTML = vitalsHtml;

  // Active Amputations & Bleeding Loss
  let ampAlerts = "";
  for (const [k, p] of propEntries) {
    if (k.startsWith("amputated_")) {
      ampAlerts += `<div style="background: rgba(251, 73, 52, 0.15); border: 1px solid var(--red-bright); color: var(--red-bright); padding: 4px 8px; border-radius: 4px; font-size: 10px; font-weight: 700; margin-top: 4px;">
        ⚠️ MEMBRO AMPUTADO (${p.part || k}): Hemorragia -${p.bleedRate} cal/s
      </div>`;
    }
  }
  inspAmputationsContainer.innerHTML = ampAlerts;

  // Respiration Badge
  if (entity.properties.gills) {
    inspRespirationBadge.innerHTML = `<span class="pill" style="border-color: var(--aqua-bright); color: var(--aqua-bright); background: rgba(142, 192, 124, 0.1);">🫁 Respiração: Branquial (Aquático)</span>`;
  } else if (entity.properties.lungs) {
    inspRespirationBadge.innerHTML = `<span class="pill" style="border-color: var(--yellow-bright); color: var(--yellow-bright); background: rgba(250, 189, 47, 0.1);">🫁 Respiração: Pulmonar (Terrestre)</span>`;
  } else {
    inspRespirationBadge.innerHTML = "";
  }

  // 3. Brain & Cognition Card
  if (entity.properties.brain) {
    inspBrainCard.style.display = "flex";
    const bp = entity.properties.brain;
    const affEntries = Object.entries(bp.affinities || {});
    let affText = affEntries.length > 0
      ? affEntries.slice(0, 5).map(([tid, val]) => `<span class="pill" style="font-size: 9px;">#${tid}: ${val >= 0 ? "+" : ""}${Math.round(val)}</span>`).join(" ")
      : "<span style='color: var(--gray);'>Nenhuma afinidade</span>";

    const knownZonesCount = Object.keys(bp.geoMemory || {}).length;
    const territoryTxt = bp.territoryZoneKey ? `Zona ${bp.territoryZoneKey}` : "Nenhum";
    const objMemCount = bp.objectMemory?.length || 0;
    const shortMemCount = bp.shortTermMemory?.length || 0;
    const longMemCount = bp.longTermMemory?.length || 0;

    let prefsTxt = "Geral";
    if (bp.preferences) {
      const likes = bp.preferences.likes.map(l => `<span style="color: var(--green-bright);">+${l.value}</span>`).join(", ");
      const dislikes = bp.preferences.dislikes.map(d => `<span style="color: var(--red-bright);">-${d.value}</span>`).join(", ");
      prefsTxt = `${likes}${dislikes ? ` | ${dislikes}` : ""}`;
    }

    inspBrainContent.innerHTML = `
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin-bottom: 6px;">
        <div><b>Humor:</b> <span style="color: var(--yellow-bright);">${bp.mood || "calmo"}</span></div>
        <div><b>Território:</b> <span style="color: var(--aqua-bright);">${territoryTxt}</span></div>
      </div>
      <div style="margin-bottom: 4px;"><b>Zonas 8x8 Conhecidas:</b> ${knownZonesCount} zonas | <b>Recursos:</b> ${objMemCount}/${bp.objectCapacity || 5}</div>
      <div style="margin-bottom: 4px;"><b>Memórias:</b> Recente (${shortMemCount}) | Longo Prazo (${longMemCount})</div>
      <div style="margin-bottom: 4px;"><b>Gosto Alimentar:</b> ${prefsTxt}</div>
      <div style="margin-top: 6px;"><b>Afinidades Sociais:</b><div style="display: flex; flex-wrap: wrap; gap: 4px; margin-top: 2px;">${affText}</div></div>
    `;
  } else {
    inspBrainCard.style.display = "none";
  }

  // 4. Stomach & Digestion Card
  if (entity.properties.stomach) {
    inspStomachCard.style.display = "flex";
    const sp = entity.properties.stomach;
    if (!sp.items || sp.items.length === 0) {
      inspStomachContent.innerHTML = `<span style="color: var(--gray); font-style: italic;">Estômago vazio (0/${sp.capacity || 4} itens)</span>`;
    } else {
      let itemsHtml = `<b>Em Digestão (${sp.items.length}/${sp.capacity || 4}):</b><ul style="margin: 4px 0 0 16px; padding: 0;">`;
      for (const it of sp.items) {
        itemsHtml += `<li><b>${it.name}</b> (+${it.nutrition} cal, ${Math.round(it.remainingTurns)}s restantes)</li>`;
      }
      itemsHtml += `</ul>`;
      inspStomachContent.innerHTML = itemsHtml;
    }
  } else {
    inspStomachCard.style.display = "none";
  }

  // 5. Dynamic Flat Property Bag
  inspPropsList.innerHTML = "";
  const propFragment = document.createDocumentFragment();

  for (const [key, prop] of propEntries) {
    if (prop === undefined || prop === null) continue;

    const card = document.createElement("div");
    card.className = "prop-card";

    const header = document.createElement("div");
    header.className = "prop-header";

    const nameSpan = document.createElement("span");
    nameSpan.className = "prop-name";
    nameSpan.textContent = key;
    header.appendChild(nameSpan);

    const delBtn = document.createElement("button");
    delBtn.className = "prop-del-btn";
    delBtn.innerHTML = "×";
    delBtn.title = `Remover propriedade '${key}'`;
    delBtn.addEventListener("click", () => {
      delete entity.properties[key];
      lastRenderedEntityId = -1;
      updateInspector();
    });
    header.appendChild(delBtn);
    card.appendChild(header);

    const fields = document.createElement("div");
    fields.className = "prop-fields";

    if (typeof prop === "object") {
      for (const [fieldKey, fieldVal] of Object.entries(prop)) {
        if (
          fieldKey === "effect" ||
          fieldKey === "items" ||
          fieldKey === "rootEntityIds" ||
          fieldKey === "affinities" ||
          fieldKey === "geoMemory" ||
          fieldKey === "objectMemory" ||
          fieldKey === "shortTermMemory" ||
          fieldKey === "longTermMemory" ||
          fieldKey === "preferences" ||
          fieldKey.startsWith("_")
        )
          continue;

        const fieldItem = document.createElement("span");
        fieldItem.className = "prop-field-item";
        let displayVal = fieldVal;
        if (typeof fieldVal === "number") {
          displayVal = Number.isInteger(fieldVal) ? fieldVal : fieldVal.toFixed(2);
        } else if (typeof fieldVal === "object" && fieldVal !== null) {
          displayVal = JSON.stringify(fieldVal);
        }
        fieldItem.textContent = `${fieldKey}: ${displayVal}`;
        fields.appendChild(fieldItem);
      }

      if (typeof prop.effect === "function") {
        const effectBadge = document.createElement("span");
        effectBadge.className = "prop-field-item";
        effectBadge.style.color = "var(--green-bright)";
        effectBadge.textContent = prop.rate ? `efeito (${prop.rate}s)` : "efeito (tick)";
        fields.appendChild(effectBadge);
      }
    } else {
      const valItem = document.createElement("span");
      valItem.className = "prop-field-item";
      valItem.textContent = `valor: ${prop}`;
      fields.appendChild(valItem);
    }

    card.appendChild(fields);
    propFragment.appendChild(card);
  }
  inspPropsList.appendChild(propFragment);

  // 6. Entity Personal Event History
  if (inspEventList) {
    const entityEvents = getEventsForEntity(entity.id, 10);
    inspEventList.innerHTML = "";
    if (entityEvents.length === 0) {
      inspEventList.innerHTML = `<span style="color: var(--gray); font-style: italic; padding: 4px;">Nenhum evento registrado nesta criatura.</span>`;
    } else {
      const frag = document.createDocumentFragment();
      for (const ev of entityEvents.reverse()) {
        const evDiv = document.createElement("div");
        evDiv.className = `event-item ${ev.type.toLowerCase()}`;
        evDiv.innerHTML = `<span style="color: var(--gray); font-size: 9px;">[D${ev.timestamp.day} ${String(ev.timestamp.hour).padStart(2, "0")}:${String(ev.timestamp.minute).padStart(2, "0")}]</span> <b style="color: var(--fg0);">${ev.type}:</b> <span style="color: var(--fg2);">${ev.description}</span>`;
        frag.appendChild(evDiv);
      }
      inspEventList.appendChild(frag);
    }
  }
}

// ---------------------------------------------------------------------------
// Main Animation Loop
// ---------------------------------------------------------------------------

let lastTime = 0;
let hudUpdateTimer = 0;

function frame(time) {
  const dt = lastTime > 0 ? (time - lastTime) * 0.001 : 0.016;
  lastTime = time;

  handleKeyMovement(dt);

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

    // 4. Run WASM Renderer
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

    // 6. Update HUD, Global Logs & Inspector periodically (100ms throttle)
    hudUpdateTimer += dt;
    if (hudUpdateTimer >= 0.1) {
      hudUpdateTimer = 0;
      updateStatsAndClock();
      updateGlobalEventsList();
      if (lastSelectedId > 0) {
        updateInspector();
      }
    }
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
    resetWorld();
    console.log("✓ Brutopolis (Biological Ecosystem Engine) initialized successfully!");
    requestAnimationFrame(frame);
  } catch (err) {
    console.error("Failed to load Brutopolis:", err);
  }
}

init();
