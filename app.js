// =============================================================================
// Brutopolis — Hierarchical Property Bag Engine & WASM Graphics Pipeline
// =============================================================================

import { wash_memory, wash_load, wash_write_string } from "./wash.js";
import { createWorld } from "./js/world.js";
import {
  createEntity,
  tickRecursive,
  syncRenderTreeToWasm,
  entityRegistry,
  getEntityById
} from "./js/engine.js";
import {
  createStomachProp,
  createParasiteChild,
  createRandomWalkProp,
  createPhotosynthesisProp,
  createRegenerationProp,
  createBurnProp,
  createTree,
  createKnight,
  createParasiteHost,
  createDragon,
  createFruit
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
const statWorldChildren = document.getElementById("stat-world-children");
const statLightHud = document.getElementById("stat-light-hud");

// Inspector Elements
const inspIdBadge = document.getElementById("insp-id-badge");
const inspEmpty = document.getElementById("insp-empty");
const inspDetails = document.getElementById("insp-details");
const inspAvatar = document.getElementById("insp-avatar");
const inspName = document.getElementById("insp-name");
const inspPropsCount = document.getElementById("insp-props-count");
const inspPos = document.getElementById("insp-pos");
const inspBreadcrumbs = document.getElementById("insp-breadcrumbs");
const inspPropsList = document.getElementById("insp-props-list");
const inspChildrenList = document.getElementById("insp-children-list");
const inspChildrenCount = document.getElementById("insp-children-count");

const selectInjectProp = document.getElementById("select-inject-prop");
const btnInjectProp = document.getElementById("btn-inject-prop");
const btnInspFollow = document.getElementById("btn-insp-follow");
const btnInspKill = document.getElementById("btn-insp-kill");

// Spawner buttons
const btnSpawnCreature = document.getElementById("btn-spawn-creature");
const btnSpawnParasiteHost = document.getElementById("btn-spawn-parasite-host");
const btnSpawnTree = document.getElementById("btn-spawn-tree");
const btnSpawnDragon = document.getElementById("btn-spawn-dragon");
const btnSpawnFruit = document.getElementById("btn-spawn-fruit");
const btnInspectWorld = document.getElementById("btn-inspect-world");

// Scratch pointers for Avatar preview
const SPRITE_BUF_PTR = mem.heapBase + FRAMEBUFFER_SIZE + 16384;
const NAME_PTR = mem.heapBase + FRAMEBUFFER_SIZE + 20480;

// ---------------------------------------------------------------------------
// Mouse & Keyboard Controls
// ---------------------------------------------------------------------------

let mouseX = 0;
let mouseY = 0;
let mouseButtons = 0;
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;

canvas.addEventListener("mousemove", (e) => {
  const rect = canvas.getBoundingClientRect();
  mouseX = ((e.clientX - rect.left) / rect.width) * CANVAS_WIDTH;
  mouseY = ((e.clientY - rect.top) / rect.height) * CANVAS_HEIGHT;

  if (isDragging && shader) {
    const dx = mouseX - dragStartX;
    const dy = mouseY - dragStartY;
    const zoom = shader.exports.wasm_get_camera_zoom();
    const tileSize = 16.0 * zoom;
    if (tileSize > 0.5) {
      const cx = shader.exports.wasm_get_camera_x() - dx / tileSize;
      const cy = shader.exports.wasm_get_camera_y() - dy / tileSize;
      shader.exports.wasm_set_camera(cx, cy, zoom);
      dragStartX = mouseX;
      dragStartY = mouseY;
    }
  }
});

canvas.addEventListener("mousedown", (e) => {
  const rect = canvas.getBoundingClientRect();
  mouseX = ((e.clientX - rect.left) / rect.width) * CANVAS_WIDTH;
  mouseY = ((e.clientY - rect.top) / rect.height) * CANVAS_HEIGHT;
  mouseButtons = 1;
  isDragging = true;
  dragStartX = mouseX;
  dragStartY = mouseY;
});

window.addEventListener("mouseup", () => {
  if (isDragging && shader) {
    const totalDrag = Math.abs(mouseX - dragStartX) + Math.abs(mouseY - dragStartY);
    if (totalDrag < 4) {
      const foundId = shader.exports.wasm_select_at(mouseX, mouseY, CANVAS_WIDTH, CANVAS_HEIGHT);
      lastSelectedId = foundId;
      updateInspector();
    }
  }
  mouseButtons = 0;
  isDragging = false;
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
  if (keysDown.has("KeyD") || keysDown.has("ArrowRight")) cx += speed;

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

  // Clear existing registry & create Root World Entity
  entityRegistry.clear();
  world = createWorld(mem, shader.exports);
  lastSelectedId = -1;

  const cx = Math.floor(shader.exports.wasm_get_camera_x());
  const cy = Math.floor(shader.exports.wasm_get_camera_y());

  // 1. Spawn Trees in World
  for (let i = 0; i < 15; i++) {
    const rx = cx + Math.floor((Math.random() - 0.5) * 50);
    const ry = cy + Math.floor((Math.random() - 0.5) * 50);
    if (world.isWalkable(rx, ry)) {
      world.addChild(createTree(rx, ry));
    }
  }

  // 2. Spawn Knights
  for (let i = 0; i < 6; i++) {
    const rx = cx + Math.floor((Math.random() - 0.5) * 40);
    const ry = cy + Math.floor((Math.random() - 0.5) * 40);
    if (world.isWalkable(rx, ry)) {
      world.addChild(createKnight(rx, ry));
    }
  }

  // 3. Spawn Parasite hosts (Cat containing a Child Parasite entity!)
  for (let i = 0; i < 3; i++) {
    const rx = cx + Math.floor((Math.random() - 0.5) * 40);
    const ry = cy + Math.floor((Math.random() - 0.5) * 40);
    if (world.isWalkable(rx, ry)) {
      world.addChild(createParasiteHost(rx, ry));
    }
  }

  // 4. Spawn Dragon
  const dragon = createDragon(cx + 4, cy + 4);
  world.addChild(dragon);

  lastSelectedId = dragon.id;
  shader.exports.wasm_select_entity(dragon.id);
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
    const pos = selEntity.getWorldPos();
    shader.exports.wasm_set_camera(pos.x, pos.y, shader.exports.wasm_get_camera_zoom());
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
    entity.destroy();
    lastSelectedId = -1;
    updateInspector();
  }
});

btnInspectWorld?.addEventListener("click", () => {
  if (world) {
    lastSelectedId = world.id;
    updateInspector();
  }
});

// Property / Child Injector Handler
btnInjectProp.addEventListener("click", () => {
  const entity = getEntityById(lastSelectedId);
  if (!entity) return;

  const propType = selectInjectProp.value;
  if (propType === "parasite_child") {
    entity.addChild(createParasiteChild(1.5));
  } else if (propType === "stomach") {
    entity.properties.stomach = createStomachProp(100, 100);
  } else if (propType === "regeneration") {
    entity.properties.regeneration = createRegenerationProp(1.0);
  } else if (propType === "burn") {
    entity.properties.burn = createBurnProp(0.5);
  } else if (propType === "random_walk") {
    entity.properties.random_walk = createRandomWalkProp(0.7);
  } else if (propType === "photosynthesis") {
    entity.properties.photosynthesis = createPhotosynthesisProp();
  }
  updateInspector();
});

// ---------------------------------------------------------------------------
// Spawner Actions
// ---------------------------------------------------------------------------

btnSpawnCreature?.addEventListener("click", () => {
  if (!world || !shader) return;
  const cx = Math.floor(shader.exports.wasm_get_camera_x());
  const cy = Math.floor(shader.exports.wasm_get_camera_y());
  const ent = createKnight(cx, cy);
  world.addChild(ent);
  lastSelectedId = ent.id;
  shader.exports.wasm_select_entity(ent.id);
  updateInspector();
});

btnSpawnParasiteHost?.addEventListener("click", () => {
  if (!world || !shader) return;
  const cx = Math.floor(shader.exports.wasm_get_camera_x());
  const cy = Math.floor(shader.exports.wasm_get_camera_y());
  const host = createParasiteHost(cx, cy);
  world.addChild(host);
  lastSelectedId = host.id;
  shader.exports.wasm_select_entity(host.id);
  updateInspector();
});

btnSpawnTree?.addEventListener("click", () => {
  if (!world || !shader) return;
  const cx = Math.floor(shader.exports.wasm_get_camera_x());
  const cy = Math.floor(shader.exports.wasm_get_camera_y());
  const tree = createTree(cx, cy);
  world.addChild(tree);
  lastSelectedId = tree.id;
  shader.exports.wasm_select_entity(tree.id);
  updateInspector();
});

btnSpawnDragon?.addEventListener("click", () => {
  if (!world || !shader) return;
  const cx = Math.floor(shader.exports.wasm_get_camera_x());
  const cy = Math.floor(shader.exports.wasm_get_camera_y());
  const dragon = createDragon(cx, cy);
  world.addChild(dragon);
  lastSelectedId = dragon.id;
  shader.exports.wasm_select_entity(dragon.id);
  updateInspector();
});

btnSpawnFruit?.addEventListener("click", () => {
  if (!world || !shader) return;
  const cx = Math.floor(shader.exports.wasm_get_camera_x());
  const cy = Math.floor(shader.exports.wasm_get_camera_y());
  const fruit = createFruit(cx, cy);
  world.addChild(fruit);
  lastSelectedId = fruit.id;
  shader.exports.wasm_select_entity(fruit.id);
  updateInspector();
});

// ---------------------------------------------------------------------------
// Dynamic Hierarchical Inspector
// ---------------------------------------------------------------------------

function updateStatsAndClock() {
  if (!world) return;

  const clock = world.properties.clock;
  if (clock) {
    hudClock.textContent = `DIA ${String(clock.day).padStart(2, "0")} ${String(clock.hour).padStart(2, "0")}:${String(clock.minute).padStart(2, "0")}`;
  }
  hudLight.textContent = `${Math.round((world.properties.light || 1.0) * 100)}%`;
  hudHeat.textContent = `${Math.round((world.properties.heat || 0.8) * 100)}%`;

  statPop.textContent = entityRegistry.size;
  statWorldChildren.textContent = world.entities ? world.entities.length : 0;
  statLightHud.textContent = `${Math.round((world.properties.light || 1.0) * 100)}%`;
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
  inspName.textContent = entity.properties.name || (entity.id === 0 ? "Mundo" : `Entidade #${entity.id}`);

  const pos = entity.getWorldPos();
  inspPos.textContent = entity.x !== undefined ? `POS: ${entity.x}, ${entity.y}` : `HERDADA: ${pos.x}, ${pos.y}`;

  // 1. Breadcrumbs Path Hierarchy
  inspBreadcrumbs.innerHTML = "";
  const path = entity.getPath();
  path.forEach((p, idx) => {
    const span = document.createElement("span");
    span.textContent = p.name;
    span.style.cursor = "pointer";
    span.style.textDecoration = "underline";
    span.addEventListener("click", () => {
      lastSelectedId = p.id;
      updateInspector();
    });
    inspBreadcrumbs.appendChild(span);
    if (idx < path.length - 1) {
      const sep = document.createElement("span");
      sep.textContent = " > ";
      sep.style.color = "var(--gray)";
      inspBreadcrumbs.appendChild(sep);
    }
  });

  const propEntries = Object.entries(entity.properties);
  inspPropsCount.textContent = `${propEntries.length} PROPS`;

  // 2. Render Avatar Preview if entity has 'render' property
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
    inspAvatar.innerHTML = `<span style="font-size: 16px; color: var(--gray);">${entity.id === 0 ? "🌍" : "∅"}</span>`;
  }

  // 3. Dynamic Property Cards
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

    // If property has current and max -> render progress bar!
    if (typeof prop === "object" && typeof prop.current === "number" && typeof prop.max === "number" && prop.max > 0) {
      const barContainer = document.createElement("div");
      barContainer.className = "prop-bar-container";

      const barHeader = document.createElement("div");
      barHeader.className = "prop-bar-header";
      barHeader.innerHTML = `<span>Nível</span><span><b>${Math.round(prop.current)}</b>/${prop.max}</span>`;
      barContainer.appendChild(barHeader);

      const barBg = document.createElement("div");
      barBg.className = "bar-bg";

      const barFill = document.createElement("div");
      barFill.className = "bar-fill";
      barFill.style.background = key === "health" ? "var(--red-bright)" : (key === "stomach" ? "var(--orange-bright)" : "var(--aqua-bright)");
      barFill.style.width = `${Math.max(0, Math.min(100, (prop.current / prop.max) * 100))}%`;

      barBg.appendChild(barFill);
      barContainer.appendChild(barBg);
      card.appendChild(barContainer);
    }

    // Display fields of the property object or primitive value
    const fields = document.createElement("div");
    fields.className = "prop-fields";

    if (typeof prop === "object") {
      for (const [fieldKey, fieldVal] of Object.entries(prop)) {
        if (fieldKey === "effect" || fieldKey.startsWith("_")) continue;

        const fieldItem = document.createElement("span");
        fieldItem.className = "prop-field-item";
        let displayVal = fieldVal;
        if (typeof fieldVal === "number") {
          displayVal = Number.isInteger(fieldVal) ? fieldVal : fieldVal.toFixed(2);
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

  // 4. Dynamic Child Entities List (Entidades Interiores)
  inspChildrenList.innerHTML = "";
  const children = entity.entities || [];
  inspChildrenCount.textContent = `${children.length} filhas`;

  if (children.length === 0) {
    inspChildrenList.innerHTML = `<div style="font-size: 10px; color: var(--gray); font-style: italic;">Nenhuma entidade interior.</div>`;
  } else {
    for (const child of children) {
      const childCard = document.createElement("div");
      childCard.className = "prop-card";
      childCard.style.borderLeft = "3px solid var(--purple-bright)";

      const childHeader = document.createElement("div");
      childHeader.className = "prop-header";

      const nameBtn = document.createElement("span");
      nameBtn.style.cursor = "pointer";
      nameBtn.style.color = "var(--fg0)";
      nameBtn.style.fontWeight = "600";
      nameBtn.textContent = `#${child.id} ${child.properties.name || "Entidade Filha"}`;
      nameBtn.addEventListener("click", () => {
        lastSelectedId = child.id;
        updateInspector();
      });
      childHeader.appendChild(nameBtn);

      const delChildBtn = document.createElement("button");
      delChildBtn.className = "prop-del-btn";
      delChildBtn.innerHTML = "×";
      delChildBtn.title = `Remover / Destruir entidade interior #${child.id}`;
      delChildBtn.addEventListener("click", () => {
        child.destroy();
        updateInspector();
      });
      childHeader.appendChild(delChildBtn);
      childCard.appendChild(childHeader);

      inspChildrenList.appendChild(childCard);
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
    // 1. Tick Recursive Hierarchical Tree if not paused
    if (!isPaused) {
      simAccumulator += dt;
      const stepDt = 1.0 / currentTps;
      const maxSteps = 15;
      let steps = 0;

      while (simAccumulator >= stepDt && steps < maxSteps) {
        simAccumulator -= stepDt;
        steps++;
        tickRecursive(world, stepDt);
      }
      if (steps >= maxSteps) simAccumulator = 0;
    }

    // 2. Sync renderable tree nodes into WASM shared memory
    syncRenderTreeToWasm(world, mem, shader.exports);

    // 3. Update WASM clock & lighting from root world entity
    const clock = world.properties.clock || { day: 0, hour: 10, minute: 0 };
    shader.exports.wasm_set_clock(
      clock.day,
      clock.hour,
      clock.minute,
      world.properties.light || 1.0,
      world.properties.heat || 0.8,
      entityRegistry.size
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
    resetWorld();
    console.log("✓ Brutopolis (Hierarchical Tree Engine) initialized successfully!");
    requestAnimationFrame(frame);
  } catch (err) {
    console.error("Failed to load Brutopolis:", err);
  }
}

init();
