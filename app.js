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

const statPop = document.getElementById("stat-pop");
const statLiving = document.getElementById("stat-living");
const statFood = document.getElementById("stat-food");

// Inspector Elements
const inspIdBadge = document.getElementById("insp-id-badge");
const inspEmpty = document.getElementById("insp-empty");
const inspDetails = document.getElementById("insp-details");
const inspAvatar = document.getElementById("insp-avatar");
const inspName = document.getElementById("insp-name");
const inspPropsCount = document.getElementById("insp-props-count");
const inspPos = document.getElementById("insp-pos");
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
const btnSpawnSeed = document.getElementById("btn-spawn-seed");
const btnSpawnFruit = document.getElementById("btn-spawn-fruit");

// Scratch pointers for Avatar preview
const SPRITE_BUF_PTR = mem.heapBase + FRAMEBUFFER_SIZE + 16384;
const NAME_PTR = mem.heapBase + FRAMEBUFFER_SIZE + 20480;

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

  const cx = Math.floor(shader.exports.wasm_get_camera_x());
  const cy = Math.floor(shader.exports.wasm_get_camera_y());

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

  // 1. Adult Trees Spread Globally (Oak, Willow, Pine)
  spawnRandomGlobal(70, createOakTree, (x, y) => world.getTile(x, y) === 0);
  spawnRandomGlobal(60, createWillowTree, (x, y) => world.getTile(x, y) === 0 || world.getTile(x, y) === 2);
  spawnRandomGlobal(50, createPineTree, (x, y) => world.getTile(x, y) === 0 || world.getTile(x, y) === 1);

  // 2. Aquatic Plants in Seas and Lakes (Vitória-Régia & Seaweed)
  spawnRandomGlobal(80, createWaterLily, (x, y) => world.getTile(x, y) === 2);
  spawnRandomGlobal(100, createSeaweed, (x, y) => world.getTile(x, y) === 2);

  // 3. Seeds & Fruits Scattered Globally
  spawnRandomGlobal(150, (x, y) => createSeedEntity(x, y, Math.random() < 0.5 ? "large" : "small", Math.random() < 0.5 ? "oak" : "willow"), (x, y) => world.getTile(x, y) === 0);
  spawnRandomGlobal(80, (x, y) => createFruit(x, y, Math.random() < 0.5 ? "large" : "small", Math.random() < 0.5 ? "oak" : "willow"), (x, y) => world.isWalkable(x, y));

  // 4. Large Fauna Distributed Worldwide (Empty stomachs)
  // Terrestrial & Forest Dwellers
  spawnRandomGlobal(50, (x, y) => createKnight(x, y, Math.random() < 0.5 ? "male" : "female"), (x, y) => world.isWalkable(x, y));
  spawnRandomGlobal(45, (x, y) => createArcher(x, y, Math.random() < 0.5 ? "female" : "male"), (x, y) => world.isWalkable(x, y));
  spawnRandomGlobal(55, (x, y) => createWolf(x, y), (x, y) => world.isWalkable(x, y));
  spawnRandomGlobal(35, (x, y) => createBear(x, y), (x, y) => world.isWalkable(x, y));
  spawnRandomGlobal(50, (x, y) => createCat(x, y, Math.random() < 0.25), (x, y) => world.isWalkable(x, y));
  spawnRandomGlobal(50, (x, y) => createGoblin(x, y), (x, y) => world.isWalkable(x, y));

  // Aerial & Flying Dwellers
  spawnRandomGlobal(50, (x, y) => createBat(x, y), () => true);
  spawnRandomGlobal(12, (x, y) => createDragon(x, y), () => true);

  // Aquatic Creatures with Gills
  spawnRandomGlobal(80, (x, y) => createSeaSerpent(x, y), (x, y) => world.getTile(x, y) === 2);

  // 5. Initial Focal Cluster around Camera for Immediate Action
  for (let i = 0; i < 4; i++) {
    const rx = cx + Math.floor((Math.random() - 0.5) * 30);
    const ry = cy + Math.floor((Math.random() - 0.5) * 30);
    if (world.isWalkable(rx, ry)) entities.push(createKnight(rx, ry));
  }
  for (let i = 0; i < 4; i++) {
    const rx = cx + Math.floor((Math.random() - 0.5) * 30);
    const ry = cy + Math.floor((Math.random() - 0.5) * 30);
    if (world.isWalkable(rx, ry)) entities.push(createWolf(rx, ry));
  }
  for (let i = 0; i < 5; i++) {
    const rx = cx + Math.floor((Math.random() - 0.5) * 30);
    const ry = cy + Math.floor((Math.random() - 0.5) * 30);
    if (world.isWalkable(rx, ry)) entities.push(createFruit(rx, ry));
  }
  const focusDragon = createDragon(cx + 4, cy + 4);
  entities.push(focusDragon);
  lastSelectedId = focusDragon.id;
  shader.exports.wasm_select_entity(focusDragon.id);

  updateInspector();
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
  if (!entity) return;

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
  updateInspector();
});

// ---------------------------------------------------------------------------
// Spawner Actions
// ---------------------------------------------------------------------------

function spawnEntityAtCamera(factoryFn) {
  if (!shader) return;
  const cx = Math.floor(shader.exports.wasm_get_camera_x());
  const cy = Math.floor(shader.exports.wasm_get_camera_y());
  const ent = factoryFn(cx, cy);
  entities.push(ent);
  lastSelectedId = ent.id;
  shader.exports.wasm_select_entity(ent.id);
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
btnSpawnSeed?.addEventListener("click", () => spawnEntityAtCamera(createSeedEntity));
btnSpawnFruit?.addEventListener("click", () => spawnEntityAtCamera(createFruit));

// ---------------------------------------------------------------------------
// Dynamic Biological Inspector
// ---------------------------------------------------------------------------

function updateStatsAndClock() {
  if (!world) return;

  const clock = world.clock;
  hudClock.textContent = `DIA ${String(clock.day).padStart(2, "0")} ${String(clock.hour).padStart(2, "0")}:${String(clock.minute).padStart(2, "0")}`;
  hudLight.textContent = `${Math.round(clock.globalLight * 100)}%`;
  hudHeat.textContent = `${Math.round(clock.globalHeat * 100)}%`;

  let livingCount = 0;
  let foodCount = 0;

  for (const e of entities) {
    if (e.properties.life) livingCount++;
    if (e.properties.edible || e.properties.germination) foodCount++;
  }

  statPop.textContent = entities.length;
  statLiving.textContent = livingCount;
  statFood.textContent = foodCount;

  // Global Event Log update
  if (logEventsCount) logEventsCount.textContent = `${allEvents.length} EVTS`;
  if (globalEventsList) {
    const recents = getRecentWorldEvents(12);
    globalEventsList.innerHTML = "";
    if (recents.length === 0) {
      globalEventsList.innerHTML = `<span style="color: var(--gray); font-style: italic;">Nenhum acontecimento ainda...</span>`;
    } else {
      for (const ev of recents) {
        const evDiv = document.createElement("div");
        evDiv.style.padding = "3px 6px";
        evDiv.style.background = "var(--bg0-soft)";
        evDiv.style.borderRadius = "2px";
        evDiv.style.borderLeft = "3px solid " + (
          ev.type === "AMPUTATION" ? "var(--red-bright)" :
          ev.type === "ATTACK" ? "var(--orange-bright)" :
          ev.type === "DEATH" ? "var(--red)" :
          ev.type === "SPROUT" ? "var(--green-bright)" : "var(--blue-bright)"
        );
        evDiv.innerHTML = `<span style="color: var(--gray); font-size: 9px;">[D${ev.timestamp.day} ${String(ev.timestamp.hour).padStart(2,"0")}:${String(ev.timestamp.minute).padStart(2,"0")}]</span> <b style="color: var(--fg0);">${ev.type}:</b> <span style="color: var(--fg2);">${ev.description}</span>`;
        globalEventsList.appendChild(evDiv);
      }
    }
  }
}

function updateInspector() {
  const entity = getEntityById(lastSelectedId);
  if (!entity || entity.destroyed) {
    inspEmpty.style.display = "block";
    inspDetails.style.display = "none";
    inspIdBadge.textContent = "#--";
    lastSelectedId = -1;
    return;
  }

  inspEmpty.style.display = "none";
  inspDetails.style.display = "flex";
  inspIdBadge.textContent = `#${entity.id}`;
  inspName.textContent = entity.properties.name || `Entidade #${entity.id}`;
  inspPos.textContent = `POS: ${entity.x}, ${entity.y}`;

  const propEntries = Object.entries(entity.properties);
  inspPropsCount.textContent = `${propEntries.length} PROPS`;

  // 1. Render Avatar Preview
  const r = entity.properties.render;
  if (r && r.skin && shader) {
    wash_write_string(mem, r.skin, NAME_PTR);
    const ok = shader.exports.wasm_get_sprite_data(NAME_PTR, r.color || 0xffffffff, r.backcolor || 0, SPRITE_BUF_PTR);
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

  // 2. Dynamic Property Cards
  inspPropsList.innerHTML = "";

  for (const [key, prop] of propEntries) {
    if (prop === undefined || prop === null) continue;

    const card = document.createElement("div");
    card.className = "prop-card";

    // Header with name & delete button
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
      updateInspector();
    });
    header.appendChild(delBtn);
    card.appendChild(header);

    // If property is 'life' -> render Energy Bar
    if (key === "life" && typeof prop.energy === "number" && typeof prop.max === "number") {
      const barContainer = document.createElement("div");
      barContainer.className = "prop-bar-container";

      const barHeader = document.createElement("div");
      barHeader.className = "prop-bar-header";
      barHeader.innerHTML = `<span>⚡ Energia Vital</span><span><b>${Math.round(prop.energy)}</b>/${prop.max}</span>`;
      barContainer.appendChild(barHeader);

      const barBg = document.createElement("div");
      barBg.className = "bar-bg";

      const barFill = document.createElement("div");
      barFill.className = "bar-fill";
      barFill.style.background = "var(--green-bright)";
      barFill.style.width = `${Math.max(0, Math.min(100, (prop.energy / prop.max) * 100))}%`;

      barBg.appendChild(barFill);
      barContainer.appendChild(barBg);
      card.appendChild(barContainer);
    }

    // If property has condition and maxCondition -> render Physical Condition Bar
    if (typeof prop.condition === "number" && typeof prop.maxCondition === "number") {
      const barContainer = document.createElement("div");
      barContainer.className = "prop-bar-container";

      const barHeader = document.createElement("div");
      barHeader.className = "prop-bar-header";
      const condPct = Math.round((prop.condition / prop.maxCondition) * 100);
      barHeader.innerHTML = `<span>Condição Física</span><span><b>${Math.round(prop.condition)}</b>/${prop.maxCondition} (${condPct}%)</span>`;
      barContainer.appendChild(barHeader);

      const barBg = document.createElement("div");
      barBg.className = "bar-bg";

      const barFill = document.createElement("div");
      barFill.className = "bar-fill";
      barFill.style.background = condPct > 60 ? "var(--aqua-bright)" : (condPct > 25 ? "var(--yellow-bright)" : "var(--red-bright)");
      barFill.style.width = `${Math.max(0, Math.min(100, condPct))}%`;

      barBg.appendChild(barFill);
      barContainer.appendChild(barBg);
      card.appendChild(barContainer);
    }

    // If property is 'bladder' -> render Water Bar
    if (key === "bladder" && typeof prop.water === "number" && typeof prop.maxWater === "number") {
      const barContainer = document.createElement("div");
      barContainer.className = "prop-bar-container";

      const barHeader = document.createElement("div");
      barHeader.className = "prop-bar-header";
      barHeader.innerHTML = `<span>💧 Água (Bexiga)</span><span><b>${Math.round(prop.water)}</b>/${prop.maxWater}</span>`;
      barContainer.appendChild(barHeader);

      const barBg = document.createElement("div");
      barBg.className = "bar-bg";

      const barFill = document.createElement("div");
      barFill.className = "bar-fill";
      barFill.style.background = "var(--blue-bright)";
      barFill.style.width = `${Math.max(0, Math.min(100, (prop.water / prop.maxWater) * 100))}%`;

      barBg.appendChild(barFill);
      barContainer.appendChild(barBg);
      card.appendChild(barContainer);
    }

    // If property is 'stomach' with digesting items
    if (key === "stomach" && Array.isArray(prop.items)) {
      const digestBox = document.createElement("div");
      digestBox.style.fontSize = "10px";
      digestBox.style.color = "var(--orange-bright)";
      digestBox.style.marginTop = "4px";

      if (prop.items.length === 0) {
        digestBox.innerHTML = `<i>Estômago Vazio (0/${prop.capacity} itens)</i>`;
      } else {
        let itemsHtml = `<b>Em Digestão (${prop.items.length}/${prop.capacity}):</b><ul style="margin: 2px 0 0 14px; padding: 0;">`;
        for (const item of prop.items) {
          itemsHtml += `<li>${item.name} (${Math.round(item.remainingTurns)}s restantes | +${item.nutrition} cal)</li>`;
        }
        itemsHtml += `</ul>`;
        digestBox.innerHTML = itemsHtml;
      }
      card.appendChild(digestBox);
    }

    // If property is 'brain' (Mood, Personality, and Affinities Table)
    if (key === "brain") {
      const brainBox = document.createElement("div");
      brainBox.style.fontSize = "10px";
      brainBox.style.color = "var(--purple-bright)";
      brainBox.style.marginTop = "4px";

      const affEntries = Object.entries(prop.affinities || {});
      let affText = "Nenhuma relação conhecida";
      if (affEntries.length > 0) {
        affText = affEntries.map(([tid, val]) => `#${tid}: ${val >= 0 ? "+" : ""}${Math.round(val)}`).join(", ");
      }

      brainBox.innerHTML = `Humor: <b>${prop.mood || "calmo"}</b><br>Afinidades: <span style="color: var(--fg2);">${affText}</span>`;
      card.appendChild(brainBox);
    }

    // If property is 'amputated_*'
    if (key.startsWith("amputated_")) {
      const ampBox = document.createElement("div");
      ampBox.style.fontSize = "10px";
      ampBox.style.color = "var(--red-bright)";
      ampBox.style.marginTop = "3px";
      ampBox.style.fontWeight = "bold";
      ampBox.innerHTML = `⚠️ MEMBRO AMPUTADO! Hemorragia ativa: <b>-${prop.bleedRate}</b> energia/s`;
      card.appendChild(ampBox);
    }

    // If property is 'lungs' or 'gills'
    if (key === "lungs") {
      const lungBox = document.createElement("div");
      lungBox.style.fontSize = "10px";
      lungBox.style.color = "var(--yellow-bright)";
      lungBox.style.marginTop = "2px";
      lungBox.innerHTML = `Respiração: <b>Pulmonar (Afoga na água)</b>`;
      card.appendChild(lungBox);
    } else if (key === "gills") {
      const gillBox = document.createElement("div");
      gillBox.style.fontSize = "10px";
      gillBox.style.color = "var(--aqua-bright)";
      gillBox.style.marginTop = "2px";
      gillBox.innerHTML = `Respiração: <b>Branquial (Asfixia fora d'água)</b>`;
      card.appendChild(gillBox);
    }

    // Display fields of the property object or primitive value
    const fields = document.createElement("div");
    fields.className = "prop-fields";

    if (typeof prop === "object") {
      for (const [fieldKey, fieldVal] of Object.entries(prop)) {
        if (
          fieldKey === "effect" ||
          fieldKey === "items" ||
          fieldKey === "rootEntityIds" ||
          fieldKey === "affinities" ||
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
        effectBadge.textContent = prop.rate ? `efeito (rate: ${prop.rate}s)` : "efeito (tick)";
        fields.appendChild(effectBadge);
      }
    } else {
      const valItem = document.createElement("span");
      valItem.className = "prop-field-item";
      valItem.textContent = `valor: ${prop}`;
      fields.appendChild(valItem);
    }

    card.appendChild(fields);
    inspPropsList.appendChild(card);
  }

  // 3. Render Personal Event History for Selected Entity
  if (inspEventList) {
    const entityEvents = getEventsForEntity(entity.id, 12);
    inspEventList.innerHTML = "";
    if (entityEvents.length === 0) {
      inspEventList.innerHTML = `<span style="color: var(--gray); font-style: italic;">Nenhum evento registrado nesta criatura.</span>`;
    } else {
      for (const ev of entityEvents.reverse()) {
        const evDiv = document.createElement("div");
        evDiv.style.padding = "2px 6px";
        evDiv.style.background = "var(--bg0-hard)";
        evDiv.style.borderRadius = "2px";
        evDiv.style.borderLeft = "2px solid " + (
          ev.type === "AMPUTATION" ? "var(--red-bright)" :
          ev.type === "ATTACK" ? "var(--orange-bright)" :
          ev.type === "DEATH" ? "var(--red)" : "var(--yellow-bright)"
        );
        evDiv.innerHTML = `<span style="color: var(--gray); font-size: 9px;">[D${ev.timestamp.day} ${String(ev.timestamp.hour).padStart(2,"0")}:${String(ev.timestamp.minute).padStart(2,"0")}]</span> <b style="color: var(--fg0);">${ev.type}:</b> <span style="color: var(--fg2);">${ev.description}</span>`;
        inspEventList.appendChild(evDiv);
      }
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

    // 6. Update HUD and Inspector periodically
    hudUpdateTimer += dt;
    if (hudUpdateTimer >= 0.1) {
      hudUpdateTimer = 0;
      updateStatsAndClock();
      updateInspector();
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
