// =============================================================================
// Brutopolis - Ultra Fast Direct Buffer Canvas 2D Visual Renderer
// =============================================================================

import { ASSET_DATA } from "./assets_data.js";
import { MAP_WIDTH, MAP_HEIGHT, TILE_FLOOR, TILE_MOUNTAIN, TILE_WATER, TILE_SAND, TILE_STONE } from "./world_gen.js";
import { globalWallCoords, resolveWallSkin, getEntitiesInViewport } from "./engine.js";
import { getClanBlueprintTiles } from "./properties.js";

// Cached emote textures
let cachedEmoteTextures = null;
function getEmoteTextures() {
  if (!cachedEmoteTextures) {
    cachedEmoteTextures = [
      findTexture("Emote_Angry.png"),
      findTexture("Emote_Excited.png"),
      findTexture("Emote_Happy.png"),
      findTexture("Emote_Hurt.png"),
      findTexture("Emote_Nerd.png"),
      findTexture("Emote_Sad.png"),
      findTexture("Emote_Serious.png"),
      findTexture("Emote_Sick.png"),
      findTexture("Emote_Sleeping.png"),
      findTexture("Emote_Smug.png"),
      findTexture("Emote_Upset.png"),
      findTexture("Emote_Yarr.png"),
      findTexture("Other_Heart.png"),
      findTexture("Item_Skull.png")
    ];
  }
  return cachedEmoteTextures;
}

// ---------------------------------------------------------------------------
// 32-bit Little-Endian RGBA Color Utilities
// ---------------------------------------------------------------------------

function rgba32(r, g, b, a = 255) {
  return ((a & 0xff) << 24) | ((b & 0xff) << 16) | ((g & 0xff) << 8) | (r & 0xff);
}

function colorScale(c32, s) {
  if (s <= 0) return 0xff000000;
  if (s >= 1.0) return c32;
  const r = Math.min(255, Math.floor((c32 & 0xff) * s));
  const g = Math.min(255, Math.floor(((c32 >> 8) & 0xff) * s));
  const b = Math.min(255, Math.floor(((c32 >> 16) & 0xff) * s));
  const a = (c32 >> 24) & 0xff;
  return ((a & 0xff) << 24) | ((b & 0xff) << 16) | ((g & 0xff) << 8) | (r & 0xff);
}

function hexToRgba32(num, defaultAlpha = 255) {
  if (num === undefined || num === null) return rgba32(255, 255, 255, defaultAlpha);
  const r = (num >>> 0) & 0xff;
  const g = (num >>> 8) & 0xff;
  const b = (num >>> 16) & 0xff;
  let a = (num >>> 24) & 0xff;
  if (a === 0 && defaultAlpha > 0) a = defaultAlpha;
  return rgba32(r, g, b, a);
}

// Keep terrain decoration stable between frames instead of using Math.random,
// which would make the tiles flicker while the camera is rendered.
function shouldRenderTerrainSprite(x, y, tileType) {
  let hash = Math.imul(x ^ Math.imul(y, 374761393), 668265263);
  hash = Math.imul(hash ^ (hash >>> 13) ^ tileType, 1274126177) >>> 0;
  return hash % 100 < 15;
}

// ---------------------------------------------------------------------------
// Asset Texture Manager (16x16 Raw Bitmaps for Fast Direct Software Blit)
// ---------------------------------------------------------------------------

const rawTextures = new Map();
let isAssetsLoaded = false;

function loadAllAssets() {
  if (typeof document === "undefined") return Promise.resolve();
  const promises = [];

  for (const item of ASSET_DATA) {
    const p = new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = img.width || 16;
        c.height = img.height || 16;
        const ctx = c.getContext("2d");
        ctx.drawImage(img, 0, 0);
        const imgData = ctx.getImageData(0, 0, c.width, c.height);
        
        const entry = {
          width: c.width,
          height: c.height,
          data: new Uint32Array(imgData.data.buffer),
          u8: imgData.data
        };
        rawTextures.set(item.filename.toLowerCase(), entry);
        resolve();
      };
      img.onerror = () => resolve();
      img.src = `data:image/png;base64,${item.base64}`;
    });
    promises.push(p);
  }

  return Promise.all(promises).then(() => {
    isAssetsLoaded = true;
  });
}

export { rawTextures };

export function findTexture(path) {
  if (!path) return null;
  const clean = path.toLowerCase().replace(/\\/g, "/");
  const base = clean.split("/").pop();

  if (rawTextures.has(base)) return rawTextures.get(base);
  if (rawTextures.has(clean)) return rawTextures.get(clean);

  const baseNoExt = base.replace(/\.png$/, "");
  for (const [k, tex] of rawTextures.entries()) {
    if (k.includes(baseNoExt)) return tex;
  }

  if (baseNoExt.includes("grass") || baseNoExt.includes("relva") || baseNoExt.includes("grama")) {
    return rawTextures.get("feature_grass.png");
  }
  if (baseNoExt.includes("mountain") || baseNoExt.includes("montanha") || baseNoExt.includes("boulder")) {
    return rawTextures.get("feature_boulders.png");
  }
  if (baseNoExt.includes("sand") || baseNoExt.includes("areia") || baseNoExt.includes("duna")) {
    return rawTextures.get("feature_pebbles.png");
  }
  if (baseNoExt.includes("oak") || baseNoExt.includes("carvalho") || baseNoExt.includes("arvore")) {
    return rawTextures.get("feature_tree_full.png");
  }
  if (baseNoExt.includes("pine") || baseNoExt.includes("pinheiro")) {
    return rawTextures.get("feature_tree_pine.png");
  }
  if (baseNoExt.includes("willow") || baseNoExt.includes("salgueiro")) {
    return rawTextures.get("feature_tree_bare.png");
  }
  if (baseNoExt.includes("flower") || baseNoExt.includes("flor") || baseNoExt.includes("lily")) {
    return rawTextures.get("feature_flower.png");
  }
  if (baseNoExt.includes("cactus") || baseNoExt.includes("cacto") || baseNoExt.includes("shrub")) {
    return rawTextures.get("item_herb.png");
  }
  if (baseNoExt.includes("seaweed") || baseNoExt.includes("alga")) {
    return rawTextures.get("feature_web.png");
  }
  if (baseNoExt.includes("fruit") || baseNoExt.includes("fruta") || baseNoExt.includes("maca")) {
    return rawTextures.get("item_fruit.png");
  }
  if (baseNoExt.includes("nut") || baseNoExt.includes("acorn") || baseNoExt.includes("seed") || baseNoExt.includes("semente")) {
    return rawTextures.get("item_egg.png");
  }
  if (baseNoExt.includes("poop") || baseNoExt.includes("feces") || baseNoExt.includes("dung") || baseNoExt.includes("fezes")) {
    return rawTextures.get("item_nugget.png");
  }
  if (baseNoExt.includes("wood") || baseNoExt.includes("log") || baseNoExt.includes("stick") || baseNoExt.includes("madeira")) {
    return rawTextures.get("item_pole.png");
  }
  if (baseNoExt.includes("stone") || baseNoExt.includes("rock") || baseNoExt.includes("pedra")) {
    return rawTextures.get("feature_boulders.png");
  }
  if (baseNoExt.includes("meat") || baseNoExt.includes("carne")) {
    return rawTextures.get("item_steak.png");
  }
  if (baseNoExt.includes("campfire") || baseNoExt.includes("fogueira") || baseNoExt.includes("fire")) {
    return rawTextures.get("other_fire.png");
  }

  return null;
}

// ---------------------------------------------------------------------------
// Software Blitting Helpers (Fast 32-bit Memory Operations)
// ---------------------------------------------------------------------------

function drawBox32(buf32, fbW, fbH, x, y, w, h, c32) {
  if (w <= 0 || h <= 0) return;
  const x0 = x < 0 ? 0 : x;
  const y0 = y < 0 ? 0 : y;
  const x1 = (x + w) > fbW ? fbW : (x + w);
  const y1 = (y + h) > fbH ? fbH : (y + h);

  const a = (c32 >>> 24) & 0xff;
  if (a === 0) return;

  if (a === 255) {
    for (let py = y0; py < y1; py++) {
      const row = py * fbW;
      for (let px = x0; px < x1; px++) {
        buf32[row + px] = c32;
      }
    }
  } else {
    const alpha = a / 255;
    const inv = 1.0 - alpha;
    const sr = c32 & 0xff;
    const sg = (c32 >> 8) & 0xff;
    const sb = (c32 >> 16) & 0xff;

    for (let py = y0; py < y1; py++) {
      const row = py * fbW;
      for (let px = x0; px < x1; px++) {
        const dst = buf32[row + px];
        const dr = dst & 0xff;
        const dg = (dst >> 8) & 0xff;
        const db = (dst >> 16) & 0xff;
        const outR = (sr * alpha + dr * inv) | 0;
        const outG = (sg * alpha + dg * inv) | 0;
        const outB = (sb * alpha + db * inv) | 0;
        buf32[row + px] = 0xff000000 | (outB << 16) | (outG << 8) | outR;
      }
    }
  }
}

function drawBoxOutline32(buf32, fbW, fbH, x, y, w, h, c32) {
  drawBox32(buf32, fbW, fbH, x, y, w, 1, c32);
  drawBox32(buf32, fbW, fbH, x, y + h - 1, w, 1, c32);
  drawBox32(buf32, fbW, fbH, x, y, 1, h, c32);
  drawBox32(buf32, fbW, fbH, x + w - 1, y, 1, h, c32);
}

function drawSpriteTinted32(buf32, fbW, fbH, tex, x, y, sx, sy, fg32, bg32, light = 1.0) {
  if (!tex || sx <= 0 || sy <= 0) return;
  const texData = tex.data;
  const texW = tex.width;
  const texH = tex.height;

  let drawFg = fg32;
  let drawBg = bg32;

  if (light < 1.0) {
    drawFg = colorScale(fg32, light);
    drawBg = colorScale(bg32, light);
  }

  const bgAlpha = (drawBg >>> 24) & 0xff;

  // Fast 1:1 scale path
  if (sx === 16 && sy === 16 && texW === 16 && texH === 16 && x >= 0 && x + 16 <= fbW && y >= 0 && y + 16 <= fbH) {
    for (let dy = 0; dy < 16; dy++) {
      const fbIdx = (y + dy) * fbW + x;
      const texRow = dy * 16;
      for (let dx = 0; dx < 16; dx++) {
        const p = texData[texRow + dx];
        const a = (p >>> 24) & 0xff;
        if (a < 32) continue;

        const pr = p & 0xff;
        const pg = (p >> 8) & 0xff;
        const pb = (p >> 16) & 0xff;

        if (pr > 128 || pg > 128 || pb > 128) {
          buf32[fbIdx + dx] = drawFg;
        } else if (bgAlpha > 0) {
          buf32[fbIdx + dx] = drawBg;
        }
      }
    }
    return;
  }

  // General scaled blit
  for (let dy = 0; dy < sy; dy++) {
    const py = y + dy;
    if (py < 0 || py >= fbH) continue;
    let iy = Math.floor((dy * texH) / sy);
    if (iy >= texH) iy = texH - 1;
    const texRow = iy * texW;
    const fbRow = py * fbW;

    for (let dx = 0; dx < sx; dx++) {
      const px = x + dx;
      if (px < 0 || px >= fbW) continue;
      let ix = Math.floor((dx * texW) / sx);
      if (ix >= texW) ix = texW - 1;

      const p = texData[texRow + ix];
      const a = (p >>> 24) & 0xff;
      if (a < 32) continue;

      const pr = p & 0xff;
      const pg = (p >> 8) & 0xff;
      const pb = (p >> 16) & 0xff;

      if (pr > 128 || pg > 128 || pb > 128) {
        buf32[fbRow + px] = drawFg;
      } else if (bgAlpha > 0) {
        buf32[fbRow + px] = drawBg;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Main Renderer Class (Direct Framebuffer Blitting)
// ---------------------------------------------------------------------------

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false });
    this.ctx.imageSmoothingEnabled = false;

    this.width = canvas.width || 800;
    this.height = canvas.height || 600;

    this.imageData = this.ctx.createImageData(this.width, this.height);
    this.buf32 = new Uint32Array(this.imageData.data.buffer);

    this.camX = 256.0;
    this.camY = 256.0;
    this.zoom = 1.0;
    this.selectedEntityId = -1;
    this.isPaused = false;
    this.targetTps = 60;
    this.waterTime = 0.0;

    this.initPromise = loadAllAssets();
  }

  setCamera(x, y, zoom) {
    this.camX = x;
    this.camY = y;
    if (typeof zoom === "number") {
      this.zoom = Math.max(0.2, Math.min(4.0, zoom));
    }
  }

  getCameraX() { return this.camX; }
  getCameraY() { return this.camY; }
  getCameraZoom() { return this.zoom; }

  selectEntity(id) { this.selectedEntityId = id; }
  getSelectedId() { return this.selectedEntityId; }

  setPaused(p) { this.isPaused = !!p; }
  isSimPaused() { return this.isPaused; }

  setTps(tps) { this.targetTps = Math.max(1, Math.min(360, tps)); }
  getTps() { return this.targetTps; }

  selectAt(screenX, screenY, entities) {
    const width = this.width;
    const height = this.height;
    if (!width || !height) return -1;

    const tileSize = Math.max(1, 16 * this.zoom);
    const centerX = width / 2;
    const centerY = height / 2;

    const fx = this.camX + (screenX - centerX) / tileSize;
    const fy = this.camY + (screenY - centerY) / tileSize;

    // Pass 1: exact tile hit
    for (const e of entities) {
      if (e.destroyed || !e.properties?.render) continue;
      if (fx >= e.x && fx < e.x + 1 && fy >= e.y && fy < e.y + 1) {
        this.selectedEntityId = e.id;
        return e.id;
      }
    }

    // Pass 2: nearest within 1.5 radius
    let closestDist = 1.5;
    let foundId = -1;
    for (const e of entities) {
      if (e.destroyed || !e.properties?.render) continue;
      const dx = (e.x + 0.5) - fx;
      const dy = (e.y + 0.5) - fy;
      const d = Math.abs(dx) + Math.abs(dy);
      if (d < closestDist) {
        closestDist = d;
        foundId = e.id;
      }
    }

    this.selectedEntityId = foundId;
    return foundId;
  }

  render(world, entities, time, dt, simSpeed = 1.0) {
    const width = this.canvas.width;
    const height = this.canvas.height;
    if (width === 0 || height === 0) return;

    if (this.width !== width || this.height !== height) {
      this.width = width;
      this.height = height;
      this.imageData = this.ctx.createImageData(width, height);
      this.buf32 = new Uint32Array(this.imageData.data.buffer);
    }

    if (!this.isPaused) {
      const speedVal = typeof simSpeed === "number" ? simSpeed : 32.0;
      this.waterTime += Math.min(dt, 0.1) * speedVal;
    }

    const buf32 = this.buf32;
    const totalPixels = width * height;

    // 1. Clear background (fast 32-bit fill)
    const bgColor = rgba32(15, 18, 22, 255);
    buf32.fill(bgColor);

    const tileSize = Math.max(1, Math.floor(16 * this.zoom));
    const centerScreenX = Math.floor(width / 2);
    const centerScreenY = Math.floor(height / 2);

    const halfVisW = Math.ceil(centerScreenX / tileSize) + 2;
    const halfVisH = Math.ceil(centerScreenY / tileSize) + 2;

    const minTx = Math.max(0, Math.floor(this.camX - halfVisW));
    const maxTx = Math.min(MAP_WIDTH - 1, Math.ceil(this.camX + halfVisW));
    const minTy = Math.max(0, Math.floor(this.camY - halfVisH));
    const maxTy = Math.min(MAP_HEIGHT - 1, Math.ceil(this.camY + halfVisH));

    const globalLight = world?.clock?.globalLight !== undefined ? world.clock.globalLight : 1.0;

    // 2. Cached tile textures
    const texFloor = findTexture("Feature_Grass.png");
    const texMountain = findTexture("Feature_Stone_C.png");
    const texWater = findTexture("Feature_Waves.png");
    const texSand = findTexture("Feature_Pebbles.png");
    const texStone = findTexture("Feature_Stone_B.png");

    const colFloorFg = rgba32(140, 200, 110);
    const colFloorBg = rgba32(35, 65, 30);
    const colMountainFg = rgba32(180, 175, 170);
    const colMountainBg = rgba32(70, 65, 65);
    const colSandFg = rgba32(95, 78, 35);
    const colSandBg = rgba32(235, 205, 115);
    const colStoneFg = rgba32(165, 165, 175);
    const colStoneBg = rgba32(55, 55, 62);
    const colWaterFg = rgba32(80, 150, 240);
    const colWaterBg = rgba32(20, 45, 90);

    const map = world.map;

    // 3. Render Terrain Tiles
    for (let ty = minTy; ty <= maxTy; ty++) {
      const screenY = centerScreenY + Math.floor((ty - this.camY) * tileSize);
      const yOffset = ty * MAP_WIDTH;

      for (let tx = minTx; tx <= maxTx; tx++) {
        const screenX = centerScreenX + Math.floor((tx - this.camX) * tileSize);
        const t = map[yOffset + tx];

        let tex = texFloor;
        let fg = colFloorFg;
        let bg = colFloorBg;

        if (t === TILE_WATER) {
          tex = texWater;

          // Velocidade e comprimento da onda adaptados a velocidade da simulacao
          const speedNum = typeof simSpeed === "number" ? simSpeed : 32.0;
          // Quanto mais rapido, menor o comprimento da onda (frequencia espacial maior)
          const spatialFreq = 0.5 + Math.min(2.0, Math.log2(Math.max(0.5, speedNum)) * 0.35);
          
          const wave = Math.sin(this.waterTime * 2.0 + tx * spatialFreq + ty * (spatialFreq * 0.6)) * 0.1;
          const waveScale = Math.max(0.5, Math.min(1.5, 1.0 + wave));

          fg = rgba32(
            Math.round(80 * waveScale),
            Math.round(150 * waveScale),
            Math.round(240 * waveScale)
          );
          bg = colWaterBg;
        } else if (t === TILE_FLOOR) {
          // Grama sem efeito
          tex = texFloor;
          fg = colFloorFg;
          bg = colFloorBg;
        } else if (t === TILE_SAND) {
          tex = texSand;
          fg = colSandFg;
          bg = colSandBg;
        } else if (t === TILE_MOUNTAIN) {
          tex = texMountain;
          fg = colMountainFg;
          bg = colMountainBg;
        } else if (t === TILE_STONE) {
          tex = texStone;
          fg = colStoneFg;
          bg = colStoneBg;
        }

        // Most grass and sand tiles are intentionally kept clean. A small,
        // coordinate-stable portion keeps the full sprite for visual texture.
        if ((t === TILE_FLOOR || t === TILE_SAND) && !shouldRenderTerrainSprite(tx, ty, t)) {
          tex = null;
          fg = bg;
        }

        if (tex) {
          drawBox32(buf32, width, height, screenX, screenY, tileSize, tileSize, colorScale(bg, globalLight));
          drawSpriteTinted32(buf32, width, height, tex, screenX, screenY, tileSize, tileSize, fg, bg, globalLight);
        } else {
          drawBox32(buf32, width, height, screenX, screenY, tileSize, tileSize, colorScale(fg, globalLight));
        }
      }
    }

    // 3.5. Render Planned Clan House Blueprints
    const visibleEntities = getEntitiesInViewport(minTx - 1, maxTx + 1, minTy - 1, maxTy + 1);
    const clanGroups = new Map();
    const occupiedHouseTiles = new Set();
    for (let i = 0; i < visibleEntities.length; i++) {
      const ve = visibleEntities[i];
      if (!ve || ve.destroyed) continue;
      if (ve.properties?.group && ve.properties.group.id) {
        clanGroups.set(ve.properties.group.id, ve.properties.group);
      }
      if (ve.properties?.house || ve.properties?.render?.skin === "Overworld_House.png" || ve.properties?.name?.includes("Casa")) {
        occupiedHouseTiles.add(`${Math.floor(ve.x)}_${Math.floor(ve.y)}`);
      }
    }

    if (clanGroups.size > 0) {
      const houseTex = findTexture("Overworld_House.png");
      for (const group of clanGroups.values()) {
        if (!group || !group.claimedZones) continue;
        const bpTiles = getClanBlueprintTiles(group);
        for (let b = 0; b < bpTiles.length; b++) {
          const bp = bpTiles[b];
          if (bp.type === "house" && bp.x >= minTx && bp.x <= maxTx && bp.y >= minTy && bp.y <= maxTy) {
            const tileKey = `${bp.x}_${bp.y}`;
            if (!occupiedHouseTiles.has(tileKey)) {
              const sx = centerScreenX + Math.floor((bp.x - this.camX) * tileSize);
              const sy = centerScreenY + Math.floor((bp.y - this.camY) * tileSize);
              drawBoxOutline32(buf32, width, height, sx, sy, tileSize, tileSize, rgba32(200, 160, 60));
              // Corner pegs
              drawBox32(buf32, width, height, sx, sy, 2, 2, rgba32(240, 190, 80));
              drawBox32(buf32, width, height, sx + tileSize - 2, sy, 2, 2, rgba32(240, 190, 80));
              drawBox32(buf32, width, height, sx, sy + tileSize - 2, 2, 2, rgba32(240, 190, 80));
              drawBox32(buf32, width, height, sx + tileSize - 2, sy + tileSize - 2, 2, 2, rgba32(240, 190, 80));
              occupiedHouseTiles.add(tileKey);
            }
          }
        }
      }
    }

    // 4. Render Dropped Items & Entities (Fast Viewport Culling)
    const emoteTextures = getEmoteTextures();

    for (let i = 0; i < visibleEntities.length; i++) {
      const e = visibleEntities[i];
      if (!e || e.destroyed || !e.properties || !e.properties.render) continue;

      const r = e.properties.render;
      const isItem = !e.properties.life && (!!e.properties.edible || !!e.properties.resourceType || !!e.properties.germination || e.properties.species === "item");

      const sx = centerScreenX + Math.floor((e.x - this.camX) * tileSize);
      const sy = centerScreenY + Math.floor((e.y - this.camY) * tileSize);

      if (isItem) {
        // Dropped Item - Solid background color, no shadow, matching original WASM renderer
        const itemFg = r.color !== undefined ? hexToRgba32(r.color, 255) : rgba32(255, 255, 255, 255);
        const itemBg = r.backcolor !== undefined ? hexToRgba32(r.backcolor, 255) : rgba32(40, 40, 40, 255);

        const itemTex = findTexture(r.skin || "Item_Egg.png");
        if (itemTex) {
          drawSpriteTinted32(buf32, width, height, itemTex, sx, sy, tileSize, tileSize, itemFg, itemBg, globalLight);
        } else {
          drawBox32(buf32, width, height, sx, sy, tileSize, tileSize, itemFg);
        }
      } else {
        // Creature / Humanoid / Structure Color resolution (uses Clan group contrasting colors if member/structure)
        let entFg = r.color !== undefined ? hexToRgba32(r.color, 255) : rgba32(240, 240, 240);
        let entBg = r.backcolor !== undefined ? hexToRgba32(r.backcolor, 0) : rgba32(20, 20, 20, 0);

        // Group / Clan palette override
        const entGroup = e.properties.group || (e.properties.house?.ownerId && entities.find(m => m.id === e.properties.house.ownerId)?.properties.group);
        if (entGroup && entGroup.color) {
          entFg = hexToRgba32(entGroup.color, 255);
          if (entGroup.backcolor) {
            entBg = hexToRgba32(entGroup.backcolor, 255);
          }
        }

        if (e.combatFlash > 0) {
          entFg = rgba32(255, 60, 60);
          entBg = rgba32(255, 255, 255);
        }

        // Walls, Doors/Gates, Houses and Structures rendering
        const isDoor = !!e.properties.door;
        const isHouse = !!e.properties.house || r.skin === "Overworld_House.png";
        const isWall = !isDoor && !isHouse && (e.properties.structure || r.skin?.startsWith("Wall_") || e.properties.name?.includes("Muralha") || e.properties.name?.includes("Wall"));
        let entSkin = r.skin || "Human_Knight_M.png";
        if (isDoor) {
          entSkin = e.properties.door.isOpen ? "Feature_Door_Open.png" : "Feature_Door_Closed.png";
        } else if (isHouse) {
          entSkin = "Overworld_House.png";
        } else if (isWall) {
          entSkin = resolveWallSkin(e.x, e.y, globalWallCoords);
        }
        const entTex = findTexture(entSkin);
        if (entTex) {
          drawSpriteTinted32(buf32, width, height, entTex, sx, sy, tileSize, tileSize, entFg, entBg, globalLight);
        } else {
          drawBox32(buf32, width, height, sx + 2, sy + 2, tileSize - 4, tileSize - 4, entFg);
        }

        // Health bar & Construction Progress bar
        const hp = e.properties.life ? e.properties.life.energy : e.properties.health ? e.properties.health.current : 0;
        const maxHp = e.properties.life ? e.properties.life.max : e.properties.health ? e.properties.health.max : 100;

        if (maxHp > 0 && hp < maxHp && hp > 0) {
          const barW = tileSize;
          const barH = tileSize > 16 ? 3 : 2;
          const barY = sy - barH - 2;
          drawBox32(buf32, width, height, sx, barY, barW, barH, rgba32(50, 10, 10));
          const fillW = Math.max(1, Math.floor((hp / maxHp) * barW));
          drawBox32(buf32, width, height, sx, barY, fillW, barH, rgba32(80, 220, 80));
        }

        // Construction Progress indicator (renders for houses, walls, gates being built)
        let buildProgress = null;
        if (e.properties.house && !e.properties.house.isCompleted) {
          const h = e.properties.house;
          const cur = (h.woodCurrent || 0) + (h.stoneCurrent || 0);
          const total = (h.woodCost || 50) + (h.stoneCost || 50);
          buildProgress = Math.min(1.0, Math.max(0.0, cur / total));
        } else if (e.isConstructed === false) {
          if (e.woodCost) {
            buildProgress = Math.min(1.0, Math.max(0.0, (e.woodCurrent || 0) / e.woodCost));
          } else if (e.stoneCost) {
            buildProgress = Math.min(1.0, Math.max(0.0, (e.stoneCurrent || 0) / e.stoneCost));
          }
        }

        if (buildProgress !== null) {
          const cBarW = tileSize;
          const cBarH = tileSize > 16 ? 3 : 2;
          const cBarY = sy - cBarH - 2;
          drawBox32(buf32, width, height, sx, cBarY, cBarW, cBarH, rgba32(30, 30, 50));
          const cFillW = Math.max(1, Math.floor(buildProgress * cBarW));
          // Bright cyan/amber construction bar
          drawBox32(buf32, width, height, sx, cBarY, cFillW, cBarH, rgba32(50, 210, 240));
        }

        // Emote bubble & Held Items per hand
        let emoteTex = null;
        if (e.emote >= 0 && e.emote < emoteTextures.length) {
          emoteTex = emoteTextures[e.emote];
        } else if (e.motor === 5) emoteTex = emoteTextures[0]; // Attack -> Angry
        else if (e.motor === 4) emoteTex = emoteTextures[8]; // Sleep -> Sleeping
        else if (e.motor === 6) emoteTex = emoteTextures[10]; // Flee -> Upset
        else if (e.motor === 7) emoteTex = emoteTextures[2]; // Socialize -> Happy

        // Detect items held in all hands/arms
        const heldItems = [];
        for (const [k, p] of Object.entries(e.properties || {})) {
          if ((k.toLowerCase().includes("arm") || k.toLowerCase().includes("hand")) && p && p.heldItem) {
            heldItems.push(p.heldItem);
          }
        }
        if (e.properties?.heldItem) heldItems.push(e.properties.heldItem);
        if (e.properties?.equipment?.mainHand) heldItems.push(e.properties.equipment.mainHand);
        if (e.properties?.equipment?.offHand) heldItems.push(e.properties.equipment.offHand);

        if (tileSize >= 12 && (emoteTex || heldItems.length > 0)) {
          const iconSize = Math.floor(tileSize * 0.48);
          let iconX = sx + tileSize - iconSize;
          const iconY = sy - iconSize - 1;

          if (emoteTex) {
            const tintFg = (e.emote === 12) ? rgba32(255, 60, 120) : (e.emote === 13) ? rgba32(255, 40, 40) : rgba32(255, 240, 100);
            drawSpriteTinted32(buf32, width, height, emoteTex, iconX, iconY, iconSize, iconSize, tintFg, rgba32(0, 0, 0, 0), 1.0);
            iconX -= (iconSize + 1);
          }

          for (let h = 0; h < heldItems.length; h++) {
            const it = heldItems[h];
            const skinName = it.skin || it.render?.skin || (typeof it === "string" ? it : it.name) || "Item_Nugget.png";
            const itemTex = findTexture(skinName);
            if (itemTex) {
              drawSpriteTinted32(buf32, width, height, itemTex, iconX, iconY, iconSize, iconSize, rgba32(255, 255, 255), rgba32(0, 0, 0, 0), globalLight);
              iconX -= (iconSize + 1);
            }
          }
        }
      }
    }

    // 5. Final Pass: Selection Box Overlay (Guaranteed to render ON TOP of all entity sprites)
    if (this.selectedEntityId > 0) {
      for (let i = 0; i < visibleEntities.length; i++) {
        const e = visibleEntities[i];
        if (e && !e.destroyed && e.id === this.selectedEntityId) {
          const sx = centerScreenX + Math.floor((e.x - this.camX) * tileSize);
          const sy = centerScreenY + Math.floor((e.y - this.camY) * tileSize);
          const selectColor = rgba32(255, 215, 0);
          drawBoxOutline32(buf32, width, height, sx - 2, sy - 2, tileSize + 4, tileSize + 4, selectColor);
          drawBoxOutline32(buf32, width, height, sx - 3, sy - 3, tileSize + 6, tileSize + 6, selectColor);
          break;
        }
      }
    }

    // 6. Blit final 32-bit buffer straight to Canvas in 1 call (60 FPS even on Zoomout)
    this.ctx.putImageData(this.imageData, 0, 0);
  }
}
