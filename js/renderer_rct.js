// =============================================================================
// Brutopolis Chronicles - 3D Isometric Tycoon Engine (Volumetric 3D Models)
// =============================================================================

import * as THREE from "https://esm.sh/three@0.160.0";
import { ASSET_DATA } from "./assets_data.js";
import { MAP_WIDTH, MAP_HEIGHT, TILE_FLOOR, TILE_MOUNTAIN, TILE_WATER, TILE_SAND, TILE_STONE, TILE_VOID } from "./world_gen.js";
import { globalWallCoords, resolveWallSkin, getEntitiesInViewport } from "./engine.js";
import { getClanBlueprintTiles } from "./properties.js";

// Cache for raw asset images
const rawImages = new Map();
const textureCache = new Map();

for (const item of ASSET_DATA) {
  const clean = item.filename.toLowerCase().replace(/\\/g, "/");
  const base = clean.split("/").pop();
  const img = new Image();
  img.src = `data:image/png;base64,${item.base64}`;
  rawImages.set(base, img);
  rawImages.set(clean, img);
}

// ---------------------------------------------------------------------------
// Smooth Day & Night Color Keyframes (Enhanced Night Visibility & Color Curve)
// ---------------------------------------------------------------------------

const DAY_NIGHT_KEYFRAMES = [
  { t: 0.0,  sun: 0x5a7ca8, amb: 0x22324c, bg: 0x0a101c, sunI: 0.35, ambI: 0.40 }, // Midnight
  { t: 4.5,  sun: 0x6a8cb8, amb: 0x283854, bg: 0x0e1422, sunI: 0.38, ambI: 0.42 }, // Pre-dawn
  { t: 5.5,  sun: 0xff7b39, amb: 0x8a5870, bg: 0x241628, sunI: 0.70, ambI: 0.52 }, // Sunrise start
  { t: 6.5,  sun: 0xffa048, amb: 0xb88890, bg: 0x342430, sunI: 0.95, ambI: 0.65 }, // Golden dawn
  { t: 7.5,  sun: 0xffd285, amb: 0xd0b8ae, bg: 0x2e303c, sunI: 1.25, ambI: 0.78 }, // Early morning
  { t: 9.0,  sun: 0xfffaea, amb: 0xdde8f5, bg: 0x151c28, sunI: 1.40, ambI: 0.85 }, // Morning
  { t: 12.0, sun: 0xffffff, amb: 0xe5f0ff, bg: 0x121922, sunI: 1.55, ambI: 0.90 }, // Solar Noon
  { t: 15.5, sun: 0xfffaea, amb: 0xdde8f5, bg: 0x151c28, sunI: 1.40, ambI: 0.85 }, // Afternoon
  { t: 17.0, sun: 0xffab4c, amb: 0xb57870, bg: 0x241a24, sunI: 1.10, ambI: 0.72 }, // Sunset start
  { t: 18.2, sun: 0xff6a35, amb: 0x8a4565, bg: 0x221226, sunI: 0.80, ambI: 0.58 }, // Sunset golden hour
  { t: 19.5, sun: 0x724888, amb: 0x48345c, bg: 0x160f22, sunI: 0.50, ambI: 0.45 }, // Dusk twilight
  { t: 21.0, sun: 0x5a7ca8, amb: 0x253550, bg: 0x0c121e, sunI: 0.38, ambI: 0.40 }, // Nightfall
  { t: 24.0, sun: 0x5a7ca8, amb: 0x22324c, bg: 0x0a101c, sunI: 0.35, ambI: 0.40 }  // Wrap to midnight
];

const EMOTE_SKINS = [
  "Emote_Angry.png",      // 0
  "Emote_Excited.png",    // 1
  "Emote_Happy.png",      // 2
  "Emote_Hurt.png",       // 3
  "Emote_Nerd.png",       // 4
  "Emote_Sad.png",        // 5
  "Emote_Serious.png",    // 6
  "Emote_Sick.png",       // 7
  "Emote_Sleeping.png",   // 8
  "Emote_Surprised.png",  // 9
  "Emote_Upset.png",      // 10
  "Emote_Question.png",   // 11
  "Emote_Heart.png",      // 12
  "Emote_Exclamation.png" // 13
];

function getCreatureEmoteSkin(e) {
  if (e.emote !== undefined && e.emote >= 0 && e.emote < EMOTE_SKINS.length) {
    return EMOTE_SKINS[e.emote];
  }
  if (e.motor === 5) return "Emote_Angry.png";    // Attack
  if (e.motor === 4) return "Emote_Sleeping.png"; // Sleep
  if (e.motor === 6) return "Emote_Upset.png";    // Flee
  if (e.motor === 7) return "Emote_Happy.png";    // Socialize
  return null;
}

// ---------------------------------------------------------------------------
// Hash Functions for Procedural Terrain Variation
// ---------------------------------------------------------------------------

function shouldRenderTerrainSprite(x, y, tileType) {
  let hash = Math.imul(x ^ Math.imul(y, 374761393), 668265263);
  hash = Math.imul(hash ^ (hash >>> 13) ^ tileType, 1274126177) >>> 0;
  return hash % 100 < 18;
}

function shouldSpawnGrassTuft(x, y) {
  let hash = Math.imul(x ^ Math.imul(y, 198491317), 445582319);
  hash = Math.imul(hash ^ (hash >>> 11), 892341233) >>> 0;
  return hash % 100 < 8; // Controlled 8% natural density
}

// ---------------------------------------------------------------------------
// Entity Bounds Helper for Accurate 3D Picking & Hover
// ---------------------------------------------------------------------------

function getEntityBounds(e) {
  const r = e.properties?.render;
  const isItem = !e.properties?.life && (!!e.properties?.edible || !!e.properties?.resourceType || !!e.properties?.germination || e.properties?.species === "item");
  const isDoor = !!e.properties?.door;
  const isHouse = !!e.properties?.house || r?.skin === "Overworld_House.png" || e.properties?.name?.includes("Casa");
  const isWall = !isDoor && !isHouse && (e.properties?.structure || r?.skin?.startsWith("Wall_") || e.properties?.name?.includes("Muralha") || e.properties?.name?.includes("Wall"));
  const isCactus = e.properties?.species === "cactus" || e.properties?.name?.toLowerCase().includes("cactus") || e.properties?.name?.toLowerCase().includes("cacto");
  const isTree = !isCactus && (e.properties?.species === "oak" || e.properties?.species === "pine" || e.properties?.species === "willow" || e.properties?.species === "tree" || !!e.properties?.tree || (r?.skin && r?.skin.toLowerCase().includes("tree")));

  if (isTree) return { radius: 1.1, h: 2.6, yBottom: 0.0 };
  if (isHouse) return { radius: 1.3, h: 2.4, yBottom: 0.0 };
  if (isCactus) return { radius: 0.9, h: 2.0, yBottom: 0.0 };
  if (isWall) return { radius: 0.75, h: 1.5, yBottom: 0.0 };
  if (isItem) return { radius: 0.45, h: 0.7, yBottom: 0.0 };
  return { radius: 0.55, h: 1.1, yBottom: 0.0 }; // Compact creatures
}

// ---------------------------------------------------------------------------
// Fast Pixel-Perfect Texture Generator
// ---------------------------------------------------------------------------

export function createTintedTexture(skinName, fgHex = 0xffffff, bgHex = 0x000000, bgAlpha = 0.0) {
  const cacheKey = `${skinName}_${fgHex}_${bgHex}_${bgAlpha}`;
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey);

  const clean = (skinName || "item_egg.png").toLowerCase().replace(/\\/g, "/");
  const base = clean.split("/").pop();

  let img = rawImages.get(base) || rawImages.get(clean);
  if (!img) {
    const baseNoExt = base.replace(/\.png$/, "");
    for (const [k, v] of rawImages.entries()) {
      if (k.includes(baseNoExt)) {
        img = v;
        break;
      }
    }
  }

  const canvas = document.createElement("canvas");
  canvas.width = 16;
  canvas.height = 16;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  const fgR = (fgHex >> 16) & 0xff;
  const fgG = (fgHex >> 8) & 0xff;
  const fgB = fgHex & 0xff;

  const bgR = (bgHex >> 16) & 0xff;
  const bgG = (bgHex >> 8) & 0xff;
  const bgB = bgHex & 0xff;

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.generateMipmaps = false;

  function drawTexture() {
    ctx.clearRect(0, 0, 16, 16);
    if (bgAlpha > 0) {
      ctx.fillStyle = `rgba(${bgR}, ${bgG}, ${bgB}, ${bgAlpha})`;
      ctx.fillRect(0, 0, 16, 16);
    }

    if (img && img.naturalWidth > 0) {
      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = 16;
      tempCanvas.height = 16;
      const tempCtx = tempCanvas.getContext("2d");
      tempCtx.drawImage(img, 0, 0, 16, 16);
      const imgData = tempCtx.getImageData(0, 0, 16, 16);
      const data = imgData.data;

      for (let i = 0; i < data.length; i += 4) {
        const a = data[i + 3];
        if (a < 32) continue;

        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        if (r > 110 || g > 110 || b > 110) {
          data[i] = fgR;
          data[i + 1] = fgG;
          data[i + 2] = fgB;
          data[i + 3] = 255;
        } else if (bgAlpha > 0) {
          data[i] = bgR;
          data[i + 1] = bgG;
          data[i + 2] = bgB;
          data[i + 3] = Math.round(bgAlpha * 255);
        } else {
          data[i] = 0;
          data[i + 1] = 0;
          data[i + 2] = 0;
          data[i + 3] = 0;
        }
      }
      ctx.putImageData(imgData, 0, 0);
    }
    tex.needsUpdate = true;
  }

  if (img) {
    if (img.complete && img.naturalWidth > 0) {
      drawTexture();
    } else {
      drawTexture();
      img.addEventListener("load", drawTexture, { once: true });
    }
  } else {
    drawTexture();
  }

  textureCache.set(cacheKey, tex);
  return tex;
}

// ---------------------------------------------------------------------------
// 3D Procedural Geometries (Saguaro Cactus, Natural Grass, Textured Houses)
// ---------------------------------------------------------------------------

function mergeBufferGeometries(geometries) {
  const nonIndexed = geometries.map(g => g.index ? g.toNonIndexed() : g);

  let totalPos = 0;
  let totalUv = 0;
  for (const g of nonIndexed) {
    if (g.attributes && g.attributes.position) {
      totalPos += g.attributes.position.array.length;
    }
    if (g.attributes && g.attributes.uv) {
      totalUv += g.attributes.uv.array.length;
    }
  }

  const posArr = new Float32Array(totalPos);
  const uvArr = new Float32Array(totalUv || (totalPos * 2 / 3));
  let posOffset = 0;
  let uvOffset = 0;

  for (const g of nonIndexed) {
    if (g.attributes && g.attributes.position) {
      const p = g.attributes.position.array;
      posArr.set(p, posOffset);
      posOffset += p.length;

      if (g.attributes.uv) {
        const u = g.attributes.uv.array;
        uvArr.set(u, uvOffset);
        uvOffset += u.length;
      } else {
        // Fallback default UVs
        const vertCount = p.length / 3;
        for (let v = 0; v < vertCount; v++) {
          uvArr[uvOffset++] = (v % 2);
          uvArr[uvOffset++] = Math.floor(v / 2) % 2;
        }
      }
    }
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute("position", new THREE.Float32BufferAttribute(posArr, 3));
  merged.setAttribute("uv", new THREE.Float32BufferAttribute(uvArr, 2));
  merged.computeVertexNormals();
  return merged;
}

function createSaguaroCactusGeometry() {
  const geos = [];

  const trunk = new THREE.CylinderGeometry(0.18, 0.22, 1.75, 8);
  trunk.translate(0, 0.875, 0);
  geos.push(trunk);

  const armLH = new THREE.CylinderGeometry(0.11, 0.11, 0.38, 6);
  armLH.rotateZ(Math.PI / 2);
  armLH.translate(-0.26, 0.85, 0);
  geos.push(armLH);

  const armLV = new THREE.CylinderGeometry(0.11, 0.12, 0.60, 6);
  armLV.translate(-0.42, 1.12, 0);
  geos.push(armLV);

  const armRH = new THREE.CylinderGeometry(0.11, 0.11, 0.38, 6);
  armRH.rotateZ(Math.PI / 2);
  armRH.translate(0.26, 1.05, 0);
  geos.push(armRH);

  const armRV = new THREE.CylinderGeometry(0.11, 0.12, 0.70, 6);
  armRV.translate(0.42, 1.38, 0);
  geos.push(armRV);

  const merged = mergeBufferGeometries(geos);
  // Rotate +45 degrees so arms spread horizontally across isometric view
  merged.rotateY(Math.PI / 4);
  return merged;
}

function createNaturalGrassGeometry(w = 0.72, h = 0.58) {
  const p1 = new THREE.PlaneGeometry(w, h);
  p1.translate(0, h / 2, 0);

  const p2 = p1.clone();
  p2.rotateY(Math.PI / 3);

  const p3 = p1.clone();
  p3.rotateY(-Math.PI / 3);

  return mergeBufferGeometries([p1, p2, p3]);
}

function createPitchedRoofGeometry(width = 1.68, depth = 1.68, height = 0.78) {
  const hw = width / 2;
  const hd = depth / 2;
  const positions = [
    // Front face
    -hw, 0, hd,   hw, 0, hd,   hw, height, 0,
    -hw, 0, hd,   hw, height, 0,  -hw, height, 0,
    // Back face
    -hw, 0, -hd,  -hw, height, 0,  hw, height, 0,
    -hw, 0, -hd,  hw, height, 0,   hw, 0, -hd,
    // Left gable
    -hw, 0, -hd,  -hw, 0, hd,  -hw, height, 0,
    // Right gable
     hw, 0,  hd,   hw, 0, -hd,   hw, height, 0
  ];
  const uvs = [
    0, 0,  1, 0,  1, 1,
    0, 0,  1, 1,  0, 1,

    0, 0,  0, 1,  1, 1,
    0, 0,  1, 1,  1, 0,

    0, 0,  1, 0,  0.5, 1,
    0, 0,  1, 0,  0.5, 1
  ];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.computeVertexNormals();
  return geo;
}

// Stage 0: Empty Clan Plot Pegs & Layout String (0 materials)
function createHousePegsGeometry() {
  const parts = [];
  const pegH = 0.35;
  const pegGeo = new THREE.CylinderGeometry(0.04, 0.05, pegH, 5);
  const px = 0.68;
  const pz = 0.68;

  const p1 = pegGeo.clone(); p1.translate(-px, pegH / 2, -pz); parts.push(p1);
  const p2 = pegGeo.clone(); p2.translate( px, pegH / 2, -pz); parts.push(p2);
  const p3 = pegGeo.clone(); p3.translate(-px, pegH / 2,  pz); parts.push(p3);
  const p4 = pegGeo.clone(); p4.translate( px, pegH / 2,  pz); parts.push(p4);

  const strX = new THREE.BoxGeometry(px * 2, 0.02, 0.02);
  const sx1 = strX.clone(); sx1.translate(0, pegH * 0.75, -pz); parts.push(sx1);
  const sx2 = strX.clone(); sx2.translate(0, pegH * 0.75,  pz); parts.push(sx2);

  const strZ = new THREE.BoxGeometry(0.02, 0.02, pz * 2);
  const sz1 = strZ.clone(); sz1.translate(-px, pegH * 0.75, 0); parts.push(sz1);
  const sz2 = strZ.clone(); sz2.translate( px, pegH * 0.75, 0); parts.push(sz2);

  return mergeBufferGeometries(parts);
}

// Stage 1: Foundation Slab + 4 Timber Corner Posts (1 to 15 materials)
function createHouseStage1Geometry() {
  const parts = [];
  const slab = new THREE.BoxGeometry(1.48, 0.22, 1.48);
  slab.translate(0, 0.11, 0);
  parts.push(slab);

  const postH = 0.95;
  const postGeo = new THREE.BoxGeometry(0.12, postH, 0.12);
  const px = 0.64;
  const pz = 0.64;

  const p1 = postGeo.clone(); p1.translate(-px, 0.22 + postH / 2, -pz); parts.push(p1);
  const p2 = postGeo.clone(); p2.translate( px, 0.22 + postH / 2, -pz); parts.push(p2);
  const p3 = postGeo.clone(); p3.translate(-px, 0.22 + postH / 2,  pz); parts.push(p3);
  const p4 = postGeo.clone(); p4.translate( px, 0.22 + postH / 2,  pz); parts.push(p4);

  return mergeBufferGeometries(parts);
}

// Stage 2: Foundation Slab + Posts + Top Cross Beams + Half Stone Masonry Walls (16 to 34 materials)
function createHouseStage2Geometry() {
  const parts = [];
  const slab = new THREE.BoxGeometry(1.48, 0.22, 1.48);
  slab.translate(0, 0.11, 0);
  parts.push(slab);

  const wallBase = new THREE.BoxGeometry(1.42, 0.55, 1.42);
  wallBase.translate(0, 0.22 + 0.275, 0);
  parts.push(wallBase);

  const postH = 0.95;
  const postGeo = new THREE.BoxGeometry(0.12, postH, 0.12);
  const px = 0.64;
  const pz = 0.64;

  const p1 = postGeo.clone(); p1.translate(-px, 0.22 + postH / 2, -pz); parts.push(p1);
  const p2 = postGeo.clone(); p2.translate( px, 0.22 + postH / 2, -pz); parts.push(p2);
  const p3 = postGeo.clone(); p3.translate(-px, 0.22 + postH / 2,  pz); parts.push(p3);
  const p4 = postGeo.clone(); p4.translate( px, 0.22 + postH / 2,  pz); parts.push(p4);

  const beamX = new THREE.BoxGeometry(1.40, 0.10, 0.10);
  const bx1 = beamX.clone(); bx1.translate(0, 0.22 + postH, -pz); parts.push(bx1);
  const bx2 = beamX.clone(); bx2.translate(0, 0.22 + postH,  pz); parts.push(bx2);

  const beamZ = new THREE.BoxGeometry(0.10, 0.10, 1.40);
  const bz1 = beamZ.clone(); bz1.translate(-px, 0.22 + postH, 0); parts.push(bz1);
  const bz2 = beamZ.clone(); bz2.translate( px, 0.22 + postH, 0); parts.push(bz2);

  return mergeBufferGeometries(parts);
}

// Stage 3: Full Stone Walls + Roof Timber Ridge & Rafter Framing Skeleton (35 to 49 materials)
function createHouseStage3Geometry() {
  const parts = [];
  const walls = new THREE.BoxGeometry(1.48, 1.20, 1.48);
  walls.translate(0, 0.60, 0);
  parts.push(walls);

  const postH = 1.20;
  const pz = 0.64;

  const ridge = new THREE.BoxGeometry(0.10, 0.10, 1.50);
  ridge.translate(0, postH + 0.55, 0);
  parts.push(ridge);

  const strutGeo = new THREE.BoxGeometry(0.08, 0.85, 0.08);
  const s1 = strutGeo.clone(); s1.rotateZ(0.68); s1.translate(-0.35, postH + 0.28, -pz); parts.push(s1);
  const s2 = strutGeo.clone(); s2.rotateZ(-0.68); s2.translate(0.35, postH + 0.28, -pz); parts.push(s2);
  const s3 = strutGeo.clone(); s3.rotateZ(0.68); s3.translate(-0.35, postH + 0.28,  pz); parts.push(s3);
  const s4 = strutGeo.clone(); s4.rotateZ(-0.68); s4.translate(0.35, postH + 0.28,  pz); parts.push(s4);

  return mergeBufferGeometries(parts);
}

// ---------------------------------------------------------------------------
// Main RCT 3D Renderer Class (Volumetric 3D Models + Shaded Terrain)
// ---------------------------------------------------------------------------

export class RCT3DRenderer {
  constructor(container) {
    this.container = container;
    this.width = container.clientWidth || window.innerWidth;
    this.height = container.clientHeight || window.innerHeight;
    this.scaleFactor = 0.5; // Defaults directly to 50% Retro Pixel Mode

    // 1. Scene & Background
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x131922);

    // 2. Fixed Isometric Camera (No Rotation - Locked 45 deg)
    const aspect = this.width / this.height;
    const viewSize = 30;
    this.camera = new THREE.OrthographicCamera(
      -viewSize * aspect,
      viewSize * aspect,
      viewSize,
      -viewSize,
      -300,
      600
    );

    this.fixedRotationY = Math.PI / 4;
    this.currentRotationY = Math.PI / 4;
    this.isometricAngleX = Math.atan(1 / Math.SQRT2); // 35.264°

    this.camX = 512.0;
    this.camY = 512.0;
    this.zoom = 1.2;
    this.selectedEntityId = -1;
    this.waterTime = 0;
    this.isPaused = false;
    this.targetTps = 60;

    // Temporary Colors for Lerping
    this.tempColor1 = new THREE.Color();
    this.tempColor2 = new THREE.Color();

    // Wireframe Mode: 0 = OFF, 1 = GRID (RCT Dark Quad Lines), 2 = FULL
    this.wireframeMode = 0;
    this.shadowsEnabled = true;

    // Current Rendered Terrain Bounds
    this.renderedMinTx = 0;
    this.renderedMaxTx = 0;
    this.renderedMinTy = 0;
    this.renderedMaxTy = 0;
    this.lastBuiltCamTileX = -9999;
    this.lastBuiltCamTileY = -9999;
    this.lastBuiltZoom = -9999;
    this.lastVisionZoneX = -9999;
    this.lastVisionZoneY = -9999;
    this.lastVisionKnownCount = 0;

    // 3. WebGL Renderer with Optional Downscaling
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
    this.updateRendererResolution();

    const canvasDom = this.renderer.domElement;
    canvasDom.style.width = "100%";
    canvasDom.style.height = "100%";
    this.container.appendChild(canvasDom);

    // 4. Directional Sun & Ambient Lighting
    this.ambientLight = new THREE.AmbientLight(0xdde8f5, 0.90);
    this.scene.add(this.ambientLight);

    this.sunLight = new THREE.DirectionalLight(0xfffaea, 1.4);
    this.sunLight.position.set(40, 80, 50);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 1024;
    this.sunLight.shadow.mapSize.height = 1024;
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 250;
    const sd = 60;
    this.sunLight.shadow.camera.left = -sd;
    this.sunLight.shadow.camera.right = sd;
    this.sunLight.shadow.camera.top = sd;
    this.sunLight.shadow.camera.bottom = -sd;
    this.sunLight.shadow.bias = -0.0008;
    this.scene.add(this.sunLight);

    // Dynamic Night Point Light Pool (Placed strictly at intelligent creatures, houses, and walls)
    this.maxNightLights = 28;
    this.nightLightPool = [];
    for (let i = 0; i < this.maxNightLights; i++) {
      const pl = new THREE.PointLight(0xffaa44, 0, 10, 1.8);
      pl.castShadow = false;
      this.scene.add(pl);
      this.nightLightPool.push(pl);
    }

    // 5. Materials with Vertex Colors for Contact AO & Textures
    this.materials = {
      [TILE_FLOOR]: new THREE.MeshLambertMaterial({
        color: 0x2e5424,
        vertexColors: true,
        side: THREE.DoubleSide
      }),
      sandClean: new THREE.MeshLambertMaterial({
        color: 0xdec078,
        vertexColors: true,
        side: THREE.DoubleSide
      }),
      [TILE_SAND]: new THREE.MeshLambertMaterial({
        map: createTintedTexture("Feature_Pebbles.png", 0x6e5228, 0xdec078, 1.0),
        vertexColors: true,
        side: THREE.DoubleSide
      }),
      [TILE_STONE]: new THREE.MeshLambertMaterial({
        map: createTintedTexture("Feature_Stone_B.png", 0xa5a5af, 0x3a3a44, 1.0),
        vertexColors: true,
        side: THREE.DoubleSide
      }),
      [TILE_MOUNTAIN]: new THREE.MeshLambertMaterial({
        map: createTintedTexture("Feature_Stone_C.png", 0xb4afaa, 0x484242, 1.0),
        vertexColors: true,
        side: THREE.DoubleSide
      }),
      [TILE_WATER]: new THREE.MeshLambertMaterial({
        map: createTintedTexture("Feature_Waves.png", 0x64b4ff, 0x143764, 1.0),
        vertexColors: true,
        transparent: false,
        opacity: 1.0,
        side: THREE.DoubleSide
      }),
      cliff: new THREE.MeshLambertMaterial({
        map: createTintedTexture("Feature_Stone_C.png", 0x887a6a, 0x2b2218, 1.0),
        vertexColors: true,
        side: THREE.DoubleSide
      }),
      grassFoliage: new THREE.MeshLambertMaterial({
        map: createTintedTexture("Feature_Grass.png", 0x3c7228, 0x000000, 0.0),
        transparent: false,
        alphaTest: 0.5,
        depthWrite: true,
        depthTest: true,
        side: THREE.DoubleSide
      }),
      treeTrunk: new THREE.MeshLambertMaterial({ color: 0x583c1e }),
      oakLeaves: new THREE.MeshLambertMaterial({ color: 0x3e8226 }),
      pineLeaves: new THREE.MeshLambertMaterial({ color: 0x205222 }),
      cactus: new THREE.MeshLambertMaterial({ color: 0x3c7c2c }),
      // Textured House Walls (Warm Timbered Plaster/Brick) & Roofs (Terracotta Shingles)
      houseWall: new THREE.MeshLambertMaterial({
        map: createTintedTexture("Feature_Brick_B.png", 0xfffaea, 0x8a6242, 1.0),
        side: THREE.DoubleSide
      }),
      houseRoof: new THREE.MeshLambertMaterial({
        map: createTintedTexture("Feature_Brick_C.png", 0xff6238, 0x941e0a, 1.0),
        side: THREE.DoubleSide
      }),
      houseBlueprint: new THREE.MeshLambertMaterial({
        map: createTintedTexture("Feature_Wood.png", 0xdfa052, 0x5a3418, 1.0),
        side: THREE.DoubleSide
      }),
      wall: new THREE.MeshLambertMaterial({
        map: createTintedTexture("Feature_Stone_B.png", 0xa5a5af, 0x3a3a44, 1.0),
        side: THREE.DoubleSide
      })
    };

    // Dark Quad Grid Material (RCT Style)
    this.rctGridMaterial = new THREE.LineBasicMaterial({
      color: 0x050c14,
      transparent: true,
      opacity: 0.38,
      depthTest: true
    });

    // 6. Real Volumetric 3D Instanced Meshes
    this.maxInstances = 1200;

    // Oak Trees
    const oakTrunkGeo = new THREE.CylinderGeometry(0.18, 0.25, 1.2, 6);
    oakTrunkGeo.translate(0, 0.6, 0);
    this.instOakTrunks = new THREE.InstancedMesh(oakTrunkGeo, this.materials.treeTrunk, this.maxInstances);
    this.instOakTrunks.castShadow = true;
    this.instOakTrunks.receiveShadow = true;

    const oakLeafGeo = new THREE.DodecahedronGeometry(0.85);
    oakLeafGeo.translate(0, 1.55, 0);
    this.instOakLeaves = new THREE.InstancedMesh(oakLeafGeo, this.materials.oakLeaves, this.maxInstances);
    this.instOakLeaves.castShadow = true;
    this.instOakLeaves.receiveShadow = true;

    // Pine Trees
    const pineTrunkGeo = new THREE.CylinderGeometry(0.12, 0.18, 0.9, 5);
    pineTrunkGeo.translate(0, 0.45, 0);
    this.instPineTrunks = new THREE.InstancedMesh(pineTrunkGeo, this.materials.treeTrunk, this.maxInstances);
    this.instPineTrunks.castShadow = true;
    this.instPineTrunks.receiveShadow = true;

    const pineLeafGeo = new THREE.ConeGeometry(0.85, 1.6, 5);
    pineLeafGeo.translate(0, 1.55, 0);
    this.instPineLeaves = new THREE.InstancedMesh(pineLeafGeo, this.materials.pineLeaves, this.maxInstances);
    this.instPineLeaves.castShadow = true;
    this.instPineLeaves.receiveShadow = true;

    // Saguaro Cacti (Oriented +45° for perfect silhouette)
    const cactusGeo = createSaguaroCactusGeometry();
    this.instCacti = new THREE.InstancedMesh(cactusGeo, this.materials.cactus, this.maxInstances);
    this.instCacti.castShadow = true;
    this.instCacti.receiveShadow = true;

    // Stone Walls
    const wallGeo = new THREE.BoxGeometry(1.0, 1.1, 1.0);
    wallGeo.translate(0, 0.55, 0);
    this.instWalls = new THREE.InstancedMesh(wallGeo, this.materials.wall, this.maxInstances);
    this.instWalls.castShadow = true;
    this.instWalls.receiveShadow = true;

    // Houses (Finished Stage 4: Stone Walls + Terracotta Clay Roof + Flagpole Mast)
    const houseWallGeo = new THREE.BoxGeometry(1.5, 1.2, 1.5);
    houseWallGeo.translate(0, 0.6, 0);
    this.instHouseWalls = new THREE.InstancedMesh(houseWallGeo, this.materials.houseWall, 400);
    this.instHouseWalls.castShadow = true;
    this.instHouseWalls.receiveShadow = true;

    const houseRoofParts = [];
    const roofGeo = createPitchedRoofGeometry(1.68, 1.68, 0.78);
    roofGeo.translate(0, 1.2, 0);
    houseRoofParts.push(roofGeo);

    // Flagpole Mast Geometry attached to roof apex
    const mastGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.65, 5);
    mastGeo.translate(0, 1.2 + 0.78 + 0.32, 0);
    houseRoofParts.push(mastGeo);

    const fullRoofGeo = mergeBufferGeometries(houseRoofParts);
    this.instHouseRoofs = new THREE.InstancedMesh(fullRoofGeo, this.materials.houseRoof, 400);
    this.instHouseRoofs.castShadow = true;
    this.instHouseRoofs.receiveShadow = true;

    // Progressive Construction Stages
    // Stage 0: Pegs & String Layout (0 materials)
    const pegsGeo = createHousePegsGeometry();
    this.instHousePegs = new THREE.InstancedMesh(pegsGeo, this.materials.houseBlueprint, 400);
    this.instHousePegs.castShadow = true;

    // Stage 1: Foundation Slab + 4 Posts (1 to 15 materials)
    const st1Geo = createHouseStage1Geometry();
    this.instHouseStage1 = new THREE.InstancedMesh(st1Geo, this.materials.houseBlueprint, 400);
    this.instHouseStage1.castShadow = true;
    this.instHouseStage1.receiveShadow = true;

    // Stage 2: Foundation + Posts + Cross Beams + Half Stone Walls (16 to 34 materials)
    const st2Geo = createHouseStage2Geometry();
    this.instHouseStage2 = new THREE.InstancedMesh(st2Geo, this.materials.houseBlueprint, 400);
    this.instHouseStage2.castShadow = true;
    this.instHouseStage2.receiveShadow = true;

    // Stage 3: Full Stone Walls + Roof Rafter Skeleton (35 to 49 materials)
    const st3Geo = createHouseStage3Geometry();
    this.instHouseStage3 = new THREE.InstancedMesh(st3Geo, this.materials.houseBlueprint, 400);
    this.instHouseStage3.castShadow = true;
    this.instHouseStage3.receiveShadow = true;

    // Natural Grass Tufts
    const grassGeo = createNaturalGrassGeometry(0.72, 0.58);
    this.instGrassTufts = new THREE.InstancedMesh(grassGeo, this.materials.grassFoliage, 1200);

    // Disable Frustum Culling on Instanced Meshes (Manual Viewport Spatial Grid Culling is active)
    this.instOakTrunks.frustumCulled = false;
    this.instOakLeaves.frustumCulled = false;
    this.instPineTrunks.frustumCulled = false;
    this.instPineLeaves.frustumCulled = false;
    this.instCacti.frustumCulled = false;
    this.instWalls.frustumCulled = false;
    this.instHouseWalls.frustumCulled = false;
    this.instHouseRoofs.frustumCulled = false;
    this.instHousePegs.frustumCulled = false;
    this.instHouseStage1.frustumCulled = false;
    this.instHouseStage2.frustumCulled = false;
    this.instHouseStage3.frustumCulled = false;
    this.instGrassTufts.frustumCulled = false;

    this.instancedGroup = new THREE.Group();
    this.instancedGroup.add(
      this.instOakTrunks, this.instOakLeaves,
      this.instPineTrunks, this.instPineLeaves,
      this.instCacti, this.instWalls,
      this.instHouseWalls, this.instHouseRoofs,
      this.instHousePegs, this.instHouseStage1,
      this.instHouseStage2, this.instHouseStage3,
      this.instGrassTufts
    );
    this.scene.add(this.instancedGroup);

    // Dynamic Billboard Entities (Creatures, Humanoids, Items)
    this.billboardGeo = new THREE.PlaneGeometry(1.0, 1.0);
    this.billboardGeo.translate(0, 0.50, 0);
    this.entityGroup = new THREE.Group();
    this.scene.add(this.entityGroup);
    this.entitySprites = new Map();

    // Floating UI Group (Emotes, Held Items & Clan House Flags)
    this.uiIconGeo = new THREE.PlaneGeometry(0.40, 0.40);
    this.uiIconGeo.translate(0, 0.20, 0);

    this.flagGeo = new THREE.PlaneGeometry(0.70, 0.50);
    this.flagGeo.translate(0.35, 0.25, 0);

    this.floatingUiGroup = new THREE.Group();
    this.scene.add(this.floatingUiGroup);
    this.floatingUiSprites = new Map();

    // Terrain & Water Groups
    this.terrainGroup = new THREE.Group();
    this.scene.add(this.terrainGroup);

    this.waterGroup = new THREE.Group();
    this.scene.add(this.waterGroup);

    // RCT Dark Quad Line Overlay Group (for GRID mode)
    this.rctGridLineGroup = new THREE.Group();
    this.rctGridLineGroup.visible = false;
    this.scene.add(this.rctGridLineGroup);

    // Claimed Clan Territory 3D Overlay Group
    this.territoryGroup = new THREE.Group();
    this.scene.add(this.territoryGroup);
    this.lastVisualizedGroupId = null;

    // Selection Reticle (Ground Decal beneath units)
    const reticleGeo = new THREE.RingGeometry(0.45, 0.65, 4);
    reticleGeo.rotateX(-Math.PI / 2);
    reticleGeo.rotateY(Math.PI / 4);
    const reticleMat = new THREE.MeshBasicMaterial({
      color: 0xffdd33,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
      depthTest: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2.0,
      polygonOffsetUnits: -2.0
    });
    this.reticleMesh = new THREE.Mesh(reticleGeo, reticleMat);
    this.reticleMesh.renderOrder = 0;
    this.reticleMesh.visible = false;
    this.scene.add(this.reticleMesh);

    // 3D Editor Selection Cursor (Terrain draped polygon + outline)
    this.editorCursorGeo = new THREE.BufferGeometry();
    this.editorCursorMat = new THREE.MeshBasicMaterial({
      color: 0xffe600,
      transparent: true,
      opacity: 0.45,
      depthTest: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -4.0,
      polygonOffsetUnits: -4.0
    });
    this.editorCursorMesh = new THREE.Mesh(this.editorCursorGeo, this.editorCursorMat);
    this.editorCursorMesh.renderOrder = 999;
    this.editorCursorMesh.frustumCulled = false;
    this.editorCursorMesh.visible = false;
    this.scene.add(this.editorCursorMesh);

    this.editorCursorLineGeo = new THREE.BufferGeometry();
    this.editorCursorLineMat = new THREE.LineBasicMaterial({
      color: 0xffffff,
      linewidth: 2,
      transparent: true,
      opacity: 0.95,
      depthTest: true,
      depthWrite: false
    });
    this.editorCursorLine = new THREE.LineSegments(this.editorCursorLineGeo, this.editorCursorLineMat);
    this.editorCursorLine.renderOrder = 1000;
    this.editorCursorLine.frustumCulled = false;
    this.editorCursorLine.visible = false;
    this.scene.add(this.editorCursorLine);

    // Raycaster & Ground Plane
    this.raycaster = new THREE.Raycaster();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  }

  // ---------------------------------------------------------------------------
  // Resolution Downscaling (50% Retro Pixel -> 75% Balanced -> 100% Native HD)
  // ---------------------------------------------------------------------------

  updateRendererResolution() {
    const internalW = Math.max(160, Math.floor(this.width * this.scaleFactor));
    const internalH = Math.max(120, Math.floor(this.height * this.scaleFactor));
    this.renderer.setSize(internalW, internalH, false);
    this.renderer.setPixelRatio(1.0);

    const canvasDom = this.renderer.domElement;
    if (canvasDom) {
      canvasDom.style.imageRendering = this.scaleFactor < 1.0 ? "pixelated" : "auto";
    }
  }

  toggleResolution() {
    if (this.scaleFactor === 0.5) {
      this.scaleFactor = 0.75;
    } else if (this.scaleFactor === 0.75) {
      this.scaleFactor = 1.0;
    } else {
      this.scaleFactor = 0.5;
    }
    this.updateRendererResolution();
    return this.getResolutionName();
  }

  getResolutionName() {
    if (this.scaleFactor === 0.75) return "75%";
    if (this.scaleFactor === 0.5) return "50%";
    return "100%";
  }

  // ---------------------------------------------------------------------------
  // Wireframe Mode Cycling (OFF -> GRID -> FULL -> OFF)
  // ---------------------------------------------------------------------------

  toggleWireframe() {
    this.wireframeMode = (this.wireframeMode + 1) % 3;
    
    if (this.wireframeMode === 0) {
      this.rctGridLineGroup.visible = false;
      for (const mat of Object.values(this.materials)) {
        if (mat) mat.wireframe = false;
      }
    } else if (this.wireframeMode === 1) {
      this.rctGridLineGroup.visible = true;
      for (const mat of Object.values(this.materials)) {
        if (mat) mat.wireframe = false;
      }
    } else if (this.wireframeMode === 2) {
      this.rctGridLineGroup.visible = false;
      for (const mat of Object.values(this.materials)) {
        if (mat) mat.wireframe = true;
      }
    }

    return this.getWireframeModeName();
  }

  getWireframeModeName() {
    if (this.wireframeMode === 1) return "GRID";
    if (this.wireframeMode === 2) return "FULL";
    return "OFF";
  }

  setTps(tps) { this.targetTps = tps; }
  getTps() { return this.targetTps; }
  setPaused(p) { this.isPaused = !!p; }
  isSimPaused() { return this.isPaused; }

  setCamera(x, y, zoom) {
    if (typeof x === "number" && !isNaN(x)) {
      this.camX = Math.max(5, Math.min(MAP_WIDTH - 5, x));
    }
    if (typeof y === "number" && !isNaN(y)) {
      this.camY = Math.max(5, Math.min(MAP_HEIGHT - 5, y));
    }
    if (typeof zoom === "number" && !isNaN(zoom)) {
      this.zoom = Math.max(0.2, Math.min(4.0, zoom));
    }
  }

  getCameraX() { return this.camX; }
  getCameraY() { return this.camY; }
  getCameraZoom() { return this.zoom; }

  selectEntity(id) { this.selectedEntityId = id; }
  getSelectedId() { return this.selectedEntityId; }

  getTileBaseHeight(tileType) {
    switch (tileType) {
      case TILE_WATER: return 0.0;
      case TILE_SAND: return 0.38;
      case TILE_FLOOR: return 1.0;
      case TILE_STONE: return 2.1;
      case TILE_MOUNTAIN: return 3.6;
      default: return 0.0;
    }
  }

  getCornerHeight(map, vx, vy) {
    const t00 = this.getTileTypeAt(map, vx - 1, vy - 1);
    const t10 = this.getTileTypeAt(map, vx, vy - 1);
    const t01 = this.getTileTypeAt(map, vx - 1, vy);
    const t11 = this.getTileTypeAt(map, vx, vy);

    const h00 = this.getTileBaseHeight(t00);
    const h10 = this.getTileBaseHeight(t10);
    const h01 = this.getTileBaseHeight(t01);
    const h11 = this.getTileBaseHeight(t11);

    if (t00 === TILE_WATER && t10 === TILE_WATER && t01 === TILE_WATER && t11 === TILE_WATER) {
      return 0.0;
    }

    const validHeights = [];
    if (t00 !== TILE_WATER && t00 !== TILE_VOID) validHeights.push(h00);
    if (t10 !== TILE_WATER && t10 !== TILE_VOID) validHeights.push(h10);
    if (t01 !== TILE_WATER && t01 !== TILE_VOID) validHeights.push(h01);
    if (t11 !== TILE_WATER && t11 !== TILE_VOID) validHeights.push(h11);

    if (validHeights.length === 0) return 0.0;
    return (validHeights.reduce((a, b) => a + b, 0)) / validHeights.length;
  }

  // ---------------------------------------------------------------------------
  // Procedural Contact Ambient Occlusion (Zero Runtime GPU Cost)
  // ---------------------------------------------------------------------------

  getCornerAO(map, vx, vy) {
    const t00 = this.getTileTypeAt(map, vx - 1, vy - 1);
    const t10 = this.getTileTypeAt(map, vx, vy - 1);
    const t01 = this.getTileTypeAt(map, vx - 1, vy);
    const t11 = this.getTileTypeAt(map, vx, vy);

    let higherNeighbors = 0;
    if (t00 === TILE_MOUNTAIN || t00 === TILE_STONE) higherNeighbors++;
    if (t10 === TILE_MOUNTAIN || t10 === TILE_STONE) higherNeighbors++;
    if (t01 === TILE_MOUNTAIN || t01 === TILE_STONE) higherNeighbors++;
    if (t11 === TILE_MOUNTAIN || t11 === TILE_STONE) higherNeighbors++;

    // Inward crevice / base of cliff receives natural ambient occlusion shading
    if (higherNeighbors >= 3) return 0.72;
    if (higherNeighbors === 2) return 0.82;
    if (higherNeighbors === 1) return 0.91;
    return 1.0;
  }

  getTileTypeAt(map, x, y) {
    if (x < 0 || x >= MAP_WIDTH || y < 0 || y >= MAP_HEIGHT) return TILE_WATER;
    return map[y * MAP_WIDTH + x];
  }

  getTileSurfaceHeight(map, tx, ty) {
    const t = this.getTileTypeAt(map, tx, ty);
    if (t === TILE_WATER) return 0.08;
    const h00 = this.getCornerHeight(map, tx, ty);
    const h10 = this.getCornerHeight(map, tx + 1, ty);
    const h11 = this.getCornerHeight(map, tx + 1, ty + 1);
    const h01 = this.getCornerHeight(map, tx, ty + 1);
    return Math.max(
      (h00 + h10 + h11 + h01) / 4.0,
      Math.max(h00, h10, h11, h01) - 0.05
    );
  }

  getSurfaceElevation(map, x, y) {
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    const t = this.getTileTypeAt(map, tx, ty);
    if (t === TILE_WATER) return 0.08;

    const u = x - tx;
    const v = y - ty;

    const h00 = this.getCornerHeight(map, tx, ty);
    const h10 = this.getCornerHeight(map, tx + 1, ty);
    const h11 = this.getCornerHeight(map, tx + 1, ty + 1);
    const h01 = this.getCornerHeight(map, tx, ty + 1);

    return (1 - u) * (1 - v) * h00 + u * (1 - v) * h10 + u * v * h11 + (1 - u) * v * h01;
  }

  // ---------------------------------------------------------------------------
  // 100% Reliable Pixel-Perfect 3D Entity Picking
  // ---------------------------------------------------------------------------

  selectAt(screenX, screenY, entities, world = null) {
    const rect = this.container.getBoundingClientRect();
    const ndcX = ((screenX - rect.left) / this.width) * 2 - 1;
    const ndcY = -((screenY - rect.top) / this.height) * 2 + 1;

    this.raycaster.setFromCamera({ x: ndcX, y: ndcY }, this.camera);
    const ray = this.raycaster.ray;

    const map = (world && world.map) ? world.map : this.currentMap;

    let bestEntId = -1;
    let closestDist = Infinity;

    const nx = 0.70710678;
    const nz = 0.70710678;

    for (let i = 0; i < entities.length; i++) {
      const e = entities[i];
      if (!e || e.destroyed || !e.properties?.render) continue;

      const bounds = getEntityBounds(e);
      const isStructureOrPlant = bounds.radius > 0.72;
      const surfaceH = map
        ? (isStructureOrPlant ? this.getTileSurfaceHeight(map, Math.floor(e.x), Math.floor(e.y)) : this.getSurfaceElevation(map, e.x, e.y))
        : 1.0;

      // 1. Ray-to-Plane Intersection
      const denom = nx * ray.direction.x + nz * ray.direction.z;
      if (Math.abs(denom) > 1e-4) {
        const numer = nx * (e.x - ray.origin.x) + nz * (e.y - ray.origin.z);
        const t = numer / denom;
        if (t > 0 && t < closestDist) {
          const ix = ray.origin.x + t * ray.direction.x;
          const iy = ray.origin.y + t * ray.direction.y;
          const iz = ray.origin.z + t * ray.direction.z;

          const dy = iy - surfaceH;
          const dx = nx * (ix - e.x) - nz * (iz - e.y);

          if (dy >= bounds.yBottom && dy <= bounds.h && Math.abs(dx) <= bounds.radius) {
            closestDist = t;
            bestEntId = e.id;
          }
        }
      }

      // 2. 3D Capsule / Cylinder Center Check
      const centerH = surfaceH + bounds.h * 0.45;
      const entPos = new THREE.Vector3(e.x, centerH, e.y);
      const distToRay = ray.distanceToPoint(entPos);
      if (distToRay < Math.max(0.55, bounds.radius * 0.95)) {
        const distAlong = ray.origin.distanceTo(entPos);
        if (distAlong < closestDist) {
          closestDist = distAlong;
          bestEntId = e.id;
        }
      }
    }

    if (bestEntId !== -1) {
      this.selectedEntityId = bestEntId;
      return bestEntId;
    }

    // 3. Ground Intersection Fallback
    const intersectPoint = new THREE.Vector3();
    this.groundPlane.constant = -1.0;
    if (this.raycaster.ray.intersectPlane(this.groundPlane, intersectPoint)) {
      const tx = Math.floor(intersectPoint.x + 0.5);
      const ty = Math.floor(intersectPoint.z + 0.5);
      
      let closestId = -1;
      let minD = 1.3;
      for (const e of entities) {
        if (e.destroyed) continue;
        const d = Math.hypot(e.x - tx, e.y - ty);
        if (d < minD) {
          minD = d;
          closestId = e.id;
        }
      }
      this.selectedEntityId = closestId;
      return closestId;
    }

    this.selectedEntityId = -1;
    return -1;
  }

  getEntityAtScreen(screenX, screenY, entities, world = null) {
    const rect = this.container.getBoundingClientRect();
    const ndcX = ((screenX - rect.left) / this.width) * 2 - 1;
    const ndcY = -((screenY - rect.top) / this.height) * 2 + 1;

    this.raycaster.setFromCamera({ x: ndcX, y: ndcY }, this.camera);
    const ray = this.raycaster.ray;

    const map = (world && world.map) ? world.map : this.currentMap;

    let bestEntId = -1;
    let closestDist = Infinity;

    const nx = 0.70710678;
    const nz = 0.70710678;

    for (let i = 0; i < entities.length; i++) {
      const e = entities[i];
      if (!e || e.destroyed || !e.properties?.render) continue;

      const bounds = getEntityBounds(e);
      const isStructureOrPlant = bounds.radius > 0.72;
      const surfaceH = map
        ? (isStructureOrPlant ? this.getTileSurfaceHeight(map, Math.floor(e.x), Math.floor(e.y)) : this.getSurfaceElevation(map, e.x, e.y))
        : 1.0;

      const denom = nx * ray.direction.x + nz * ray.direction.z;
      if (Math.abs(denom) > 1e-4) {
        const numer = nx * (e.x - ray.origin.x) + nz * (e.y - ray.origin.z);
        const t = numer / denom;
        if (t > 0 && t < closestDist) {
          const ix = ray.origin.x + t * ray.direction.x;
          const iy = ray.origin.y + t * ray.direction.y;
          const iz = ray.origin.z + t * ray.direction.z;

          const dy = iy - surfaceH;
          const dx = nx * (ix - e.x) - nz * (iz - e.y);

          if (dy >= bounds.yBottom && dy <= bounds.h && Math.abs(dx) <= bounds.radius) {
            closestDist = t;
            bestEntId = e.id;
          }
        }
      }

      const centerH = surfaceH + bounds.h * 0.45;
      const entPos = new THREE.Vector3(e.x, centerH, e.y);
      const distToRay = ray.distanceToPoint(entPos);
      if (distToRay < Math.max(0.55, bounds.radius * 0.95)) {
        const distAlong = ray.origin.distanceTo(entPos);
        if (distAlong < closestDist) {
          closestDist = distAlong;
          bestEntId = e.id;
        }
      }
    }

    if (bestEntId !== -1) return bestEntId;

    const intersectPoint = new THREE.Vector3();
    this.groundPlane.constant = -1.0;
    if (this.raycaster.ray.intersectPlane(this.groundPlane, intersectPoint)) {
      const tx = Math.floor(intersectPoint.x + 0.5);
      const ty = Math.floor(intersectPoint.z + 0.5);
      
      let closestId = -1;
      let minD = 1.3;
      for (const e of entities) {
        if (e.destroyed) continue;
        const d = Math.hypot(e.x - tx, e.y - ty);
        if (d < minD) {
          minD = d;
          closestId = e.id;
        }
      }
      return closestId;
    }

    return -1;
  }

  getTileAtScreen(screenX, screenY, world = null) {
    const rect = this.container.getBoundingClientRect();
    const w = rect.width || this.width;
    const h = rect.height || this.height;
    const ndcX = ((screenX - rect.left) / w) * 2 - 1;
    const ndcY = -((screenY - rect.top) / h) * 2 + 1;

    this.raycaster.setFromCamera({ x: ndcX, y: ndcY }, this.camera);
    const ray = this.raycaster.ray;

    const map = world?.map;
    if (map && Math.abs(ray.direction.y) > 0.0001) {
      // Raymarch through terrain elevation range (y: 8.0 down to -0.5)
      const tMaxY = (8.0 - ray.origin.y) / ray.direction.y;
      const tMinY = (-0.5 - ray.origin.y) / ray.direction.y;
      const tStart = Math.min(tMaxY, tMinY);
      const tEnd = Math.max(tMaxY, tMinY);

      const steps = 60;
      const dt = (tEnd - tStart) / steps;
      let prevT = tStart;

      for (let i = 1; i <= steps; i++) {
        const t = tStart + i * dt;
        const rx = ray.origin.x + t * ray.direction.x;
        const ry = ray.origin.y + t * ray.direction.y;
        const rz = ray.origin.z + t * ray.direction.z;
        const surfH = this.getSurfaceElevation(map, rx, rz);

        if (ry <= surfH) {
          // Binary search refinement
          let low = prevT;
          let high = t;
          for (let b = 0; b < 5; b++) {
            const mid = (low + high) * 0.5;
            const mx = ray.origin.x + mid * ray.direction.x;
            const my = ray.origin.y + mid * ray.direction.y;
            const mz = ray.origin.z + mid * ray.direction.z;
            if (my <= this.getSurfaceElevation(map, mx, mz)) {
              high = mid;
            } else {
              low = mid;
            }
          }
          const hitX = Math.floor(ray.origin.x + low * ray.direction.x);
          const hitY = Math.floor(ray.origin.z + low * ray.direction.z);
          return {
            x: Math.max(0, Math.min(MAP_WIDTH - 1, hitX)),
            y: Math.max(0, Math.min(MAP_HEIGHT - 1, hitY))
          };
        }
        prevT = t;
      }
    }

    // Fallback: intersect with flat ground plane at Y=0.5
    const intersectPoint = new THREE.Vector3();
    this.groundPlane.constant = -0.5;
    if (this.raycaster.ray.intersectPlane(this.groundPlane, intersectPoint)) {
      const tx = Math.floor(intersectPoint.x);
      const ty = Math.floor(intersectPoint.z);
      return {
        x: Math.max(0, Math.min(MAP_WIDTH - 1, tx)),
        y: Math.max(0, Math.min(MAP_HEIGHT - 1, ty))
      };
    }
    return { x: Math.floor(this.camX), y: Math.floor(this.camY) };
  }

  setEditorCursor(world, tileX, tileY, brushSize = 1, toolColorHex = 0xffe600) {
    if (!world || !world.map) {
      this.hideEditorCursor();
      return;
    }
    const map = world.map;
    const half = Math.floor(brushSize / 2);
    const minTx = Math.max(0, tileX - half);
    const maxTx = Math.min(MAP_WIDTH - 1, tileX + half);
    const minTy = Math.max(0, tileY - half);
    const maxTy = Math.min(MAP_HEIGHT - 1, tileY + half);

    const posArray = [];
    const lineArray = [];

    for (let ty = minTy; ty <= maxTy; ty++) {
      for (let tx = minTx; tx <= maxTx; tx++) {
        const h00 = this.getCornerHeight(map, tx, ty) + 0.08;
        const h10 = this.getCornerHeight(map, tx + 1, ty) + 0.08;
        const h11 = this.getCornerHeight(map, tx + 1, ty + 1) + 0.08;
        const h01 = this.getCornerHeight(map, tx, ty + 1) + 0.08;

        // Triangle 1: (tx, ty), (tx+1, ty), (tx+1, ty+1)
        posArray.push(tx, h00, ty);
        posArray.push(tx + 1, h10, ty);
        posArray.push(tx + 1, h11, ty + 1);

        // Triangle 2: (tx, ty), (tx+1, ty+1), (tx, ty+1)
        posArray.push(tx, h00, ty);
        posArray.push(tx + 1, h11, ty + 1);
        posArray.push(tx, h01, ty + 1);

        // Outer Boundary Outline Lines
        if (ty === minTy) {
          lineArray.push(tx, h00 + 0.02, ty, tx + 1, h10 + 0.02, ty);
        }
        if (tx === maxTx) {
          lineArray.push(tx + 1, h10 + 0.02, ty, tx + 1, h11 + 0.02, ty + 1);
        }
        if (ty === maxTy) {
          lineArray.push(tx + 1, h11 + 0.02, ty + 1, tx, h01 + 0.02, ty + 1);
        }
        if (tx === minTx) {
          lineArray.push(tx, h01 + 0.02, ty + 1, tx, h00 + 0.02, ty);
        }
      }
    }

    this.editorCursorGeo.setAttribute('position', new THREE.Float32BufferAttribute(posArray, 3));
    this.editorCursorGeo.computeVertexNormals();
    this.editorCursorGeo.computeBoundingSphere();

    this.editorCursorLineGeo.setAttribute('position', new THREE.Float32BufferAttribute(lineArray, 3));
    this.editorCursorLineGeo.computeBoundingSphere();

    this.editorCursorMat.color.set(toolColorHex);
    this.editorCursorMesh.visible = true;
    this.editorCursorLine.visible = true;
  }

  hideEditorCursor() {
    if (this.editorCursorMesh) this.editorCursorMesh.visible = false;
    if (this.editorCursorLine) this.editorCursorLine.visible = false;
  }

  updateCamera() {
    const aspect = this.width / this.height;
    const viewSize = (28 / this.zoom);
    this.camera.left = -viewSize * aspect;
    this.camera.right = viewSize * aspect;
    this.camera.top = viewSize;
    this.camera.bottom = -viewSize;
    this.camera.updateProjectionMatrix();

    const distance = 100;
    const cosY = Math.cos(this.fixedRotationY);
    const sinY = Math.sin(this.fixedRotationY);
    const cosX = Math.cos(this.isometricAngleX);
    const sinX = Math.sin(this.isometricAngleX);

    this.camera.position.set(
      this.camX + distance * sinY * cosX,
      distance * sinX,
      this.camY + distance * cosY * cosX
    );
    this.camera.lookAt(this.camX, 1.0, this.camY);

    this.sunLight.position.set(this.camX + 35, 75, this.camY + 45);
    this.sunLight.target.position.set(this.camX, 0, this.camY);
  }

  // ---------------------------------------------------------------------------
  // Smooth Day & Night Transitions
  // ---------------------------------------------------------------------------

  updateDayNightLighting(world) {
    const clock = world?.clock;
    if (!clock) return 0.0;

    const hour = clock.hour !== undefined ? clock.hour : 12;
    const minute = clock.minute !== undefined ? clock.minute : 0;
    const timeOfDay = hour + minute / 60.0;

    let k1 = DAY_NIGHT_KEYFRAMES[0];
    let k2 = DAY_NIGHT_KEYFRAMES[1];

    for (let i = 0; i < DAY_NIGHT_KEYFRAMES.length - 1; i++) {
      if (timeOfDay >= DAY_NIGHT_KEYFRAMES[i].t && timeOfDay <= DAY_NIGHT_KEYFRAMES[i + 1].t) {
        k1 = DAY_NIGHT_KEYFRAMES[i];
        k2 = DAY_NIGHT_KEYFRAMES[i + 1];
        break;
      }
    }

    const span = Math.max(0.001, k2.t - k1.t);
    let alpha = (timeOfDay - k1.t) / span;
    alpha = Math.max(0.0, Math.min(1.0, alpha));
    const sAlpha = alpha * alpha * (3 - 2 * alpha); // Smoothstep curve

    this.tempColor1.setHex(k1.sun);
    this.tempColor2.setHex(k2.sun);
    this.tempColor1.lerp(this.tempColor2, sAlpha);
    this.sunLight.color.copy(this.tempColor1);

    this.tempColor1.setHex(k1.amb);
    this.tempColor2.setHex(k2.amb);
    this.tempColor1.lerp(this.tempColor2, sAlpha);
    this.ambientLight.color.copy(this.tempColor1);

    this.tempColor1.setHex(k1.bg);
    this.tempColor2.setHex(k2.bg);
    this.tempColor1.lerp(this.tempColor2, sAlpha);
    this.scene.background.copy(this.tempColor1);

    const sunIntensity = k1.sunI + (k2.sunI - k1.sunI) * sAlpha;
    const ambIntensity = k1.ambI + (k2.ambI - k1.ambI) * sAlpha;

    this.sunLight.intensity = sunIntensity;
    this.ambientLight.intensity = ambIntensity;

    // Calculate Night Darkness Factor (0.0 = daytime, 1.0 = deep night)
    let nightGlow = 0.0;
    if (timeOfDay >= 19.0 || timeOfDay < 5.5) {
      nightGlow = 1.0;
    } else if (timeOfDay >= 17.5 && timeOfDay < 19.0) {
      nightGlow = (timeOfDay - 17.5) / 1.5;
    } else if (timeOfDay >= 5.5 && timeOfDay < 7.0) {
      nightGlow = 1.0 - (timeOfDay - 5.5) / 1.5;
    }

    return nightGlow;
  }

  // ---------------------------------------------------------------------------
  // Cached Terrain Mesh Builder (Supports Contact AO & Zone Vision)
  // ---------------------------------------------------------------------------

  rebuildTerrainIfNeeded(world, minTx, maxTx, minTy, maxTy, visionTarget = null) {
    const curTileX = Math.floor(this.camX);
    const curTileY = Math.floor(this.camY);
    const curZoom = Math.round(this.zoom * 8);

    const zoneSz = 8;
    let curVisionZx = -9999;
    let curVisionZy = -9999;
    let knownZones = null;
    let knownCount = 0;

    if (visionTarget && !visionTarget.destroyed) {
      knownZones = new Set();
      curVisionZx = Math.floor(visionTarget.x / zoneSz);
      curVisionZy = Math.floor(visionTarget.y / zoneSz);
      knownZones.add(`${curVisionZx}_${curVisionZy}`);

      if (visionTarget.properties.brain?.geoMemory) {
        for (const k of Object.keys(visionTarget.properties.brain.geoMemory)) {
          knownZones.add(k);
        }
      }
      if (visionTarget.properties.group?.claimedZones) {
        for (const zk of visionTarget.properties.group.claimedZones) {
          const p = zk.includes("_") ? zk.split("_") : zk.split(",");
          knownZones.add(`${p[0]}_${p[1]}`);
        }
      }
      knownCount = knownZones.size;
    }

    if (curTileX === this.lastBuiltCamTileX && curTileY === this.lastBuiltCamTileY &&
        curZoom === this.lastBuiltZoom && curVisionZx === this.lastVisionZoneX &&
        curVisionZy === this.lastVisionZoneY && knownCount === this.lastVisionKnownCount &&
        this.terrainGroup.children.length > 0) {
      return;
    }

    this.lastBuiltCamTileX = curTileX;
    this.lastBuiltCamTileY = curTileY;
    this.lastBuiltZoom = curZoom;
    this.lastVisionZoneX = curVisionZx;
    this.lastVisionZoneY = curVisionZy;
    this.lastVisionKnownCount = knownCount;

    while (this.terrainGroup.children.length > 0) {
      const m = this.terrainGroup.children[0];
      this.terrainGroup.remove(m);
      if (m.geometry) m.geometry.dispose();
    }
    while (this.waterGroup.children.length > 0) {
      const m = this.waterGroup.children[0];
      this.waterGroup.remove(m);
      if (m.geometry) m.geometry.dispose();
    }
    while (this.rctGridLineGroup.children.length > 0) {
      const m = this.rctGridLineGroup.children[0];
      this.rctGridLineGroup.remove(m);
      if (m.geometry) m.geometry.dispose();
    }

    const map = world.map;
    const tileMeshBuckets = {
      [TILE_FLOOR]: { pos: [], uvs: [], colors: [] },
      [TILE_SAND]: { pos: [], uvs: [], colors: [] },
      sandClean: { pos: [], uvs: [], colors: [] },
      [TILE_STONE]: { pos: [], uvs: [], colors: [] },
      [TILE_MOUNTAIN]: { pos: [], uvs: [], colors: [] },
      [TILE_WATER]: { pos: [], uvs: [], colors: [] }
    };

    const gridLinePositions = [];
    const matHelper = new THREE.Matrix4();
    let foliageCount = 0;

    const clampedMinTx = Math.max(0, Math.min(MAP_WIDTH - 1, minTx));
    const clampedMaxTx = Math.max(0, Math.min(MAP_WIDTH - 1, maxTx));
    const clampedMinTy = Math.max(0, Math.min(MAP_HEIGHT - 1, minTy));
    const clampedMaxTy = Math.max(0, Math.min(MAP_HEIGHT - 1, maxTy));

    this.renderedMinTx = clampedMinTx;
    this.renderedMaxTx = clampedMaxTx;
    this.renderedMinTy = clampedMinTy;
    this.renderedMaxTy = clampedMaxTy;

    const lineElevOffset = 0.006;

    for (let ty = clampedMinTy; ty <= clampedMaxTy; ty++) {
      const yOffset = ty * MAP_WIDTH;
      const zY = Math.floor(ty / zoneSz);

      for (let tx = clampedMinTx; tx <= clampedMaxTx; tx++) {
        const tType = map[yOffset + tx];
        if (tType === undefined || tType === TILE_VOID) continue;

        const zX = Math.floor(tx / zoneSz);
        const zk = `${zX}_${zY}`;

        // Creature Vision: If creature does not know this zone, DO NOT RENDER IT AT ALL!
        if (knownZones && !knownZones.has(zk)) {
          continue;
        }

        const isCurrentZone = (zX === curVisionZx && zY === curVisionZy);

        // Base Brightness: Current Zone = 1.0 (bright & full colors), other known explored zones = 0.32 (dimmed fog memory)
        let zoneMult = 1.0;
        if (knownZones && !isCurrentZone) {
          zoneMult = 0.32;
        }

        const hasSprite = shouldRenderTerrainSprite(tx, ty, tType);
        let bucketKey = tType;
        if (tType === TILE_SAND && !hasSprite) bucketKey = "sandClean";

        const bucket = tileMeshBuckets[bucketKey] || tileMeshBuckets[tType] || tileMeshBuckets[TILE_FLOOR];
        if (!bucket) continue;

        let h00 = this.getCornerHeight(map, tx, ty);
        let h10 = this.getCornerHeight(map, tx + 1, ty);
        let h11 = this.getCornerHeight(map, tx + 1, ty + 1);
        let h01 = this.getCornerHeight(map, tx, ty + 1);

        // Procedural Contact Ambient Occlusion for each corner
        const ao00 = this.getCornerAO(map, tx, ty);
        const ao10 = this.getCornerAO(map, tx + 1, ty);
        const ao11 = this.getCornerAO(map, tx + 1, ty + 1);
        const ao01 = this.getCornerAO(map, tx, ty + 1);

        if (tType === TILE_WATER) {
          h00 = h10 = h11 = h01 = 0.08;
        }

        bucket.pos.push(
          tx, h00, ty,
          tx, h01, ty + 1,
          tx + 1, h11, ty + 1,

          tx, h00, ty,
          tx + 1, h11, ty + 1,
          tx + 1, h10, ty
        );
        bucket.uvs.push(
          0, 0, 0, 1, 1, 1,
          0, 0, 1, 1, 1, 0
        );

        // Triangle 1: (0,0), (0,1), (1,1)
        bucket.colors.push(zoneMult * ao00, zoneMult * ao00, zoneMult * ao00);
        bucket.colors.push(zoneMult * ao01, zoneMult * ao01, zoneMult * ao01);
        bucket.colors.push(zoneMult * ao11, zoneMult * ao11, zoneMult * ao11);

        // Triangle 2: (0,0), (1,1), (1,0)
        bucket.colors.push(zoneMult * ao00, zoneMult * ao00, zoneMult * ao00);
        bucket.colors.push(zoneMult * ao11, zoneMult * ao11, zoneMult * ao11);
        bucket.colors.push(zoneMult * ao10, zoneMult * ao10, zoneMult * ao10);

        if (tType !== TILE_WATER) {
          gridLinePositions.push(
            tx, h00 + lineElevOffset, ty,
            tx + 1, h10 + lineElevOffset, ty
          );
          gridLinePositions.push(
            tx, h00 + lineElevOffset, ty,
            tx, h01 + lineElevOffset, ty + 1
          );
          if (ty === clampedMaxTy) {
            gridLinePositions.push(
              tx, h01 + lineElevOffset, ty + 1,
              tx + 1, h11 + lineElevOffset, ty + 1
            );
          }
          if (tx === clampedMaxTx) {
            gridLinePositions.push(
              tx + 1, h10 + lineElevOffset, ty,
              tx + 1, h11 + lineElevOffset, ty + 1
            );
          }
        }

        // 3D Natural Grass Tufts with Moderate 8% Density
        if (tType === TILE_FLOOR && shouldSpawnGrassTuft(tx, ty) && foliageCount < 1200) {
          const midH = (h00 + h10 + h11 + h01) / 4.0;
          matHelper.setPosition(tx + 0.5, midH, ty + 0.5);
          this.instGrassTufts.setMatrixAt(foliageCount, matHelper);
          foliageCount++;
        }

        // Cliff Drop-walls with Contact Ambient Occlusion gradient
        const baseH = (tType === TILE_WATER) ? -0.4 : 0.0;
        const cliffBaseAO = 0.65 * zoneMult;
        const cliffTopAO = 0.95 * zoneMult;

        if (ty === clampedMaxTy || map[(ty + 1) * MAP_WIDTH + tx] === TILE_WATER) {
          bucket.pos.push(
            tx, baseH, ty + 1,
            tx + 1, baseH, ty + 1,
            tx + 1, h11, ty + 1,

            tx, baseH, ty + 1,
            tx + 1, h11, ty + 1,
            tx, h01, ty + 1
          );
          bucket.uvs.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
          bucket.colors.push(cliffBaseAO, cliffBaseAO, cliffBaseAO);
          bucket.colors.push(cliffBaseAO, cliffBaseAO, cliffBaseAO);
          bucket.colors.push(cliffTopAO, cliffTopAO, cliffTopAO);
          bucket.colors.push(cliffBaseAO, cliffBaseAO, cliffBaseAO);
          bucket.colors.push(cliffTopAO, cliffTopAO, cliffTopAO);
          bucket.colors.push(cliffTopAO, cliffTopAO, cliffTopAO);
        }

        if (tx === clampedMaxTx || map[yOffset + tx + 1] === TILE_WATER) {
          bucket.pos.push(
            tx + 1, h10, ty,
            tx + 1, h11, ty + 1,
            tx + 1, baseH, ty + 1,

            tx + 1, h10, ty,
            tx + 1, baseH, ty + 1,
            tx + 1, baseH, ty
          );
          bucket.uvs.push(0, 1, 1, 1, 1, 0, 0, 1, 1, 0, 0, 0);
          bucket.colors.push(cliffTopAO, cliffTopAO, cliffTopAO);
          bucket.colors.push(cliffTopAO, cliffTopAO, cliffTopAO);
          bucket.colors.push(cliffBaseAO, cliffBaseAO, cliffBaseAO);
          bucket.colors.push(cliffTopAO, cliffTopAO, cliffTopAO);
          bucket.colors.push(cliffBaseAO, cliffBaseAO, cliffBaseAO);
          bucket.colors.push(cliffBaseAO, cliffBaseAO, cliffBaseAO);
        }
      }
    }

    this.instGrassTufts.count = foliageCount;
    this.instGrassTufts.instanceMatrix.needsUpdate = true;

    for (const [matKey, bucket] of Object.entries(tileMeshBuckets)) {
      if (bucket.pos.length === 0) continue;
      const geom = new THREE.BufferGeometry();
      geom.setAttribute("position", new THREE.Float32BufferAttribute(bucket.pos, 3));
      geom.setAttribute("uv", new THREE.Float32BufferAttribute(bucket.uvs, 2));
      geom.setAttribute("color", new THREE.Float32BufferAttribute(bucket.colors, 3));
      geom.computeVertexNormals();

      const mat = this.materials[matKey] || this.materials[TILE_FLOOR];
      const mesh = new THREE.Mesh(geom, mat);

      if (matKey === String(TILE_WATER)) {
        this.waterGroup.add(mesh);
      } else {
        mesh.receiveShadow = true;
        mesh.castShadow = true;
        this.terrainGroup.add(mesh);
      }
    }

    if (gridLinePositions.length > 0) {
      const gridGeom = new THREE.BufferGeometry();
      gridGeom.setAttribute("position", new THREE.Float32BufferAttribute(gridLinePositions, 3));
      const lineSegments = new THREE.LineSegments(gridGeom, this.rctGridMaterial);
      this.rctGridLineGroup.add(lineSegments);
    }
  }

  // ---------------------------------------------------------------------------
  // 3D Claimed Clan Territory Overlay Builder
  // ---------------------------------------------------------------------------

  rebuildTerritoryOverlayIfNeeded(world, clanGroups, visualizedGroupId) {
    if (visualizedGroupId === this.lastVisualizedGroupId) {
      return;
    }
    this.lastVisualizedGroupId = visualizedGroupId;

    while (this.territoryGroup.children.length > 0) {
      const m = this.territoryGroup.children[0];
      this.territoryGroup.remove(m);
      if (m.geometry) m.geometry.dispose();
      if (m.material) {
        if (Array.isArray(m.material)) m.material.forEach(mat => mat.dispose());
        else m.material.dispose();
      }
    }

    if (!visualizedGroupId || !clanGroups.has(visualizedGroupId) || !world?.map) {
      return;
    }

    const g = clanGroups.get(visualizedGroupId);
    if (!g || !g.claimedZones) return;

    const map = world.map;
    const zoneSz = 8;
    const lineElevOffset = 0.04;
    const fillElevOffset = 0.02;

    const positions = [];
    const colors = [];
    const linePositions = [];

    const groupCol = new THREE.Color(g.color !== undefined ? g.color : 0xffd700);

    for (const zk of g.claimedZones) {
      const p = zk.includes("_") ? zk.split("_") : zk.split(",");
      const zx = parseInt(p[0], 10);
      const zy = parseInt(p[1], 10);
      if (isNaN(zx) || isNaN(zy)) continue;

      const minX = zx * zoneSz;
      const maxX = minX + zoneSz;
      const minY = zy * zoneSz;
      const maxY = minY + zoneSz;

      // Fill quads on each tile
      for (let ty = minY; ty < maxY; ty++) {
        for (let tx = minX; tx < maxX; tx++) {
          if (tx < 0 || tx >= MAP_WIDTH || ty < 0 || ty >= MAP_HEIGHT) continue;
          const h00 = this.getCornerHeight(map, tx, ty) + fillElevOffset;
          const h10 = this.getCornerHeight(map, tx + 1, ty) + fillElevOffset;
          const h11 = this.getCornerHeight(map, tx + 1, ty + 1) + fillElevOffset;
          const h01 = this.getCornerHeight(map, tx, ty + 1) + fillElevOffset;

          positions.push(
            tx, h00, ty,
            tx, h01, ty + 1,
            tx + 1, h11, ty + 1,

            tx, h00, ty,
            tx + 1, h11, ty + 1,
            tx + 1, h10, ty
          );

          for (let k = 0; k < 6; k++) {
            colors.push(groupCol.r, groupCol.g, groupCol.b);
          }
        }
      }

      // Outer Perimeter Grid Lines of the Zone
      for (let tx = minX; tx < maxX; tx++) {
        const hA = this.getCornerHeight(map, tx, minY) + lineElevOffset;
        const hB = this.getCornerHeight(map, tx + 1, minY) + lineElevOffset;
        linePositions.push(tx, hA, minY, tx + 1, hB, minY);

        const hC = this.getCornerHeight(map, tx, maxY) + lineElevOffset;
        const hD = this.getCornerHeight(map, tx + 1, maxY) + lineElevOffset;
        linePositions.push(tx, hC, maxY, tx + 1, hD, maxY);
      }

      for (let ty = minY; ty < maxY; ty++) {
        const hA = this.getCornerHeight(map, minX, ty) + lineElevOffset;
        const hB = this.getCornerHeight(map, minX, ty + 1) + lineElevOffset;
        linePositions.push(minX, hA, ty, minX, hB, ty + 1);

        const hC = this.getCornerHeight(map, maxX, ty) + lineElevOffset;
        const hD = this.getCornerHeight(map, maxX, ty + 1) + lineElevOffset;
        linePositions.push(maxX, hC, ty, maxX, hD, ty + 1);
      }

      // 4 Corner Glowing Boundary Beacons / Obelisks
      const cornerCoords = [
        [minX, minY],
        [maxX, minY],
        [minX, maxY],
        [maxX, maxY]
      ];
      for (const [cx, cy] of cornerCoords) {
        const cH = this.getCornerHeight(map, cx, cy);
        const beaconGeo = new THREE.CylinderGeometry(0.12, 0.18, 1.8, 6);
        beaconGeo.translate(0, 0.9, 0);
        const beaconMat = new THREE.MeshLambertMaterial({
          color: 0xffd700,
          emissive: 0xffa800,
          emissiveIntensity: 0.9
        });
        const beaconMesh = new THREE.Mesh(beaconGeo, beaconMat);
        beaconMesh.position.set(cx, cH, cy);
        this.territoryGroup.add(beaconMesh);
      }
    }

    if (positions.length > 0) {
      const fillGeo = new THREE.BufferGeometry();
      fillGeo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      fillGeo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
      fillGeo.computeVertexNormals();

      const fillMat = new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.26,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1.5,
        polygonOffsetUnits: -1.5,
        side: THREE.DoubleSide
      });
      const fillMesh = new THREE.Mesh(fillGeo, fillMat);
      fillMesh.renderOrder = 2;
      this.territoryGroup.add(fillMesh);
    }

    if (linePositions.length > 0) {
      const lineGeo = new THREE.BufferGeometry();
      lineGeo.setAttribute("position", new THREE.Float32BufferAttribute(linePositions, 3));
      const lineMat = new THREE.LineBasicMaterial({
        color: 0xffd700,
        linewidth: 3,
        transparent: true,
        opacity: 0.95
      });
      const lineSegments = new THREE.LineSegments(lineGeo, lineMat);
      lineSegments.renderOrder = 3;
      this.territoryGroup.add(lineSegments);
    }
  }

  render(world, entities, time, dt, simSpeed = 1.0, visionCreature = null, visualizedGroupId = null) {
    if (!this.width || !this.height || !world) return;
    this.currentMap = world.map;

    if (!this.isPaused && (typeof simSpeed !== "number" || simSpeed > 0)) {
      const spd = (typeof simSpeed === "number") ? simSpeed : 1.0;
      this.waterTime += dt * spd;

      const waterMat = this.materials[TILE_WATER];
      if (waterMat && waterMat.map) {
        waterMat.map.offset.x = (this.waterTime * 0.12) % 1;
        waterMat.map.offset.y = (this.waterTime * 0.08) % 1;
      }
      this.waterGroup.position.y = Math.sin(this.waterTime * 2.8) * 0.035;
    }

    this.updateCamera();
    const nightGlow = this.updateDayNightLighting(world);

    const aspect = this.width / this.height;
    const viewSize = Math.min(50, 28 / this.zoom);
    const diagonal = Math.hypot(viewSize * aspect, viewSize);
    const radius = Math.min(58, Math.ceil(diagonal * 1.4) + 4);

    const minTx = Math.max(0, Math.floor(this.camX - radius));
    const maxTx = Math.min(MAP_WIDTH - 1, Math.ceil(this.camX + radius));
    const minTy = Math.max(0, Math.floor(this.camY - radius));
    const maxTy = Math.min(MAP_HEIGHT - 1, Math.ceil(this.camY + radius));

    this.rebuildTerrainIfNeeded(world, minTx, maxTx, minTy, maxTy, visionCreature);

    // Current Vision Zone
    const zoneSz = 8;
    let curVisionZx = -9999;
    let curVisionZy = -9999;
    let knownZones = null;

    if (visionCreature && !visionCreature.destroyed) {
      knownZones = new Set();
      curVisionZx = Math.floor(visionCreature.x / zoneSz);
      curVisionZy = Math.floor(visionCreature.y / zoneSz);
      knownZones.add(`${curVisionZx}_${curVisionZy}`);

      if (visionCreature.properties.brain?.geoMemory) {
        for (const k of Object.keys(visionCreature.properties.brain.geoMemory)) {
          knownZones.add(k);
        }
      }
      if (visionCreature.properties.group?.claimedZones) {
        for (const zk of visionCreature.properties.group.claimedZones) {
          const p = zk.includes("_") ? zk.split("_") : zk.split(",");
          knownZones.add(`${p[0]}_${p[1]}`);
        }
      }
    }

    // Render 3D Volumetric Instanced Entities
    const map = world.map;
    const visibleEntities = getEntitiesInViewport(this.renderedMinTx, this.renderedMaxTx, this.renderedMinTy, this.renderedMaxTy);
    const activeIds = new Set();
    const activeUiIds = new Set();
    let selectedPos = null;

    let oakCount = 0;
    let pineCount = 0;
    let cactusCount = 0;
    let wallCount = 0;
    let houseCount = 0;
    let pegsCount = 0;
    let stage1Count = 0;
    let stage2Count = 0;
    let stage3Count = 0;

    const mMatrix = new THREE.Matrix4();
    const scaleMatrix = new THREE.Matrix4();
    const hoverTime = (time || 0) * 3.5;
    const floatBob = Math.sin(hoverTime) * 0.04;

    const occupiedHouseTiles = new Set();
    const clanGroups = new Map();

    if (entities && Array.isArray(entities)) {
      for (let i = 0; i < entities.length; i++) {
        const ent = entities[i];
        if (!ent || ent.destroyed) continue;
        if (ent.properties?.group?.id) {
          clanGroups.set(ent.properties.group.id, ent.properties.group);
        }
      }
    }

    for (let i = 0; i < visibleEntities.length; i++) {
      const e = visibleEntities[i];
      if (!e || e.destroyed || !e.properties?.render) continue;

      if (e.x < this.renderedMinTx || e.x > this.renderedMaxTx + 0.99 ||
          e.y < this.renderedMinTy || e.y > this.renderedMaxTy + 0.99) {
        continue;
      }

      if (knownZones) {
        const zk = `${Math.floor(e.x / zoneSz)}_${Math.floor(e.y / zoneSz)}`;
        if (!knownZones.has(zk)) {
          continue; // Entity is in an unknown zone -> completely hidden
        }
      }

      const r = e.properties.render;
      const isItem = !e.properties.life && (!!e.properties.edible || !!e.properties.resourceType || !!e.properties.germination || e.properties.species === "item");
      const isDoor = !!e.properties.door;
      const isHouse = !!e.properties.house || r.skin === "Overworld_House.png" || e.properties.name?.includes("Casa");
      const isWall = !isDoor && !isHouse && (e.properties.structure || r.skin?.startsWith("Wall_") || e.properties.name?.includes("Muralha") || e.properties.name?.includes("Wall"));
      const isCactus = e.properties.species === "cactus" || e.properties.name?.toLowerCase().includes("cactus") || e.properties.name?.toLowerCase().includes("cacto");
      const isTree = !isCactus && (e.properties.species === "oak" || e.properties.species === "pine" || e.properties.species === "willow" || e.properties.species === "tree" || !!e.properties.tree || (r.skin && r.skin.toLowerCase().includes("tree")));
      const isPine = isTree && (e.properties.species === "pine" || (r.skin && r.skin.toLowerCase().includes("pine")));

      const isStructureOrPlant = isTree || isHouse || isWall || isCactus;
      const surfaceH = isStructureOrPlant
        ? this.getTileSurfaceHeight(map, Math.floor(e.x), Math.floor(e.y))
        : this.getSurfaceElevation(map, e.x, e.y);

      // --- 3D OAK TREES (Natural Random Rotation) ---
      if (isTree && !isPine && oakCount < this.maxInstances) {
        const rotY = (((Math.imul(Math.floor(e.x) ^ Math.imul(Math.floor(e.y), 45211), 982451653) >>> 0) % 628) / 100.0);
        mMatrix.makeRotationY(rotY);
        mMatrix.setPosition(e.x + 0.5, surfaceH, e.y + 0.5);
        this.instOakTrunks.setMatrixAt(oakCount, mMatrix);
        this.instOakLeaves.setMatrixAt(oakCount, mMatrix);
        oakCount++;
      }
      // --- 3D PINE TREES (Natural Random Rotation) ---
      else if (isPine && pineCount < this.maxInstances) {
        const rotY = (((Math.imul(Math.floor(e.x) ^ Math.imul(Math.floor(e.y), 73819), 428931173) >>> 0) % 628) / 100.0);
        mMatrix.makeRotationY(rotY);
        mMatrix.setPosition(e.x + 0.5, surfaceH, e.y + 0.5);
        this.instPineTrunks.setMatrixAt(pineCount, mMatrix);
        this.instPineLeaves.setMatrixAt(pineCount, mMatrix);
        pineCount++;
      }
      // --- 3D SAGUARO CACTI (Natural Random Rotation) ---
      else if (isCactus && cactusCount < this.maxInstances) {
        const rotY = (((Math.imul(Math.floor(e.x) ^ Math.imul(Math.floor(e.y), 31849), 619284711) >>> 0) % 4)) * (Math.PI / 2) + Math.PI / 4;
        mMatrix.makeRotationY(rotY);
        mMatrix.setPosition(e.x + 0.5, surfaceH, e.y + 0.5);
        this.instCacti.setMatrixAt(cactusCount, mMatrix);
        cactusCount++;
      }
      // --- 3D STONE WALLS ---
      else if (isWall && wallCount < this.maxInstances) {
        mMatrix.identity();
        mMatrix.setPosition(e.x + 0.5, surfaceH, e.y + 0.5);
        this.instWalls.setMatrixAt(wallCount, mMatrix);
        wallCount++;
      }
      // --- 3D HOUSES & PROGRESSIVE MULTI-STAGE CONSTRUCTION ---
      else if (isHouse) {
        occupiedHouseTiles.add(`${Math.floor(e.x)}_${Math.floor(e.y)}`);
        const h = e.properties.house;
        const isCompleted = h ? (h.isCompleted !== false) : true;
        const totalCost = (h?.woodCost || 25) + (h?.stoneCost || 25);
        const curMaterials = (h?.woodCurrent || 0) + (h?.stoneCurrent || 0);
        const progress = isCompleted ? 1.0 : (curMaterials / Math.max(1, totalCost));

        // Deterministic Cardinal Rotation per House (0, 90, 180, 270 deg)
        const houseRot = (((Math.imul(Math.floor(e.x) ^ Math.imul(Math.floor(e.y), 32452843), 8253729) >>> 0) % 4)) * (Math.PI / 2);
        // Random Height Variation per House (0.85x to 1.25x height)
        const heightScale = 0.85 + (((Math.imul(Math.floor(e.x) ^ Math.imul(Math.floor(e.y), 198491317), 445582319) >>> 0) % 100) / 100.0) * 0.40;

        mMatrix.makeRotationY(houseRot);
        scaleMatrix.makeScale(1.0, heightScale, 1.0);
        mMatrix.multiply(scaleMatrix);
        mMatrix.setPosition(e.x + 0.5, surfaceH, e.y + 0.5);

        if (isCompleted && houseCount < 400) {
          // Stage 4: Finished stone house with terracotta roof & flagpole mast
          this.instHouseWalls.setMatrixAt(houseCount, mMatrix);
          this.instHouseRoofs.setMatrixAt(houseCount, mMatrix);
          houseCount++;

          // Hoist Clan Flag Banner atop the Roof Apex
          let houseClan = e.properties.group;
          if (!houseClan && h?.ownerId) {
            for (const g of clanGroups.values()) {
              if (g.id === e.properties.groupId || g.members?.includes(h.ownerId) || g.members?.includes(Number(h.ownerId))) {
                houseClan = g;
                break;
              }
            }
          }
          const flagKey = `${e.id}_house_flag`;
          activeUiIds.add(flagKey);

          const flagSkin = houseClan?.flagSkin || "Feature_Flower.png";
          const fgHex = (houseClan && houseClan.color !== undefined ? houseClan.color : 0xffd700) & 0xffffff;
          const bgHex = (houseClan && houseClan.backcolor !== undefined ? houseClan.backcolor : 0x1e1e28) & 0xffffff;
          const flagTex = createTintedTexture(flagSkin, fgHex, bgHex, 1.0);

          let flagMesh = this.floatingUiSprites.get(flagKey);
          if (!flagMesh) {
            const flagMat = new THREE.MeshBasicMaterial({
              map: flagTex,
              transparent: true,
              alphaTest: 0.05,
              depthTest: true,
              side: THREE.DoubleSide
            });
            flagMesh = new THREE.Mesh(this.flagGeo, flagMat);
            flagMesh.renderOrder = 30;
            this.floatingUiGroup.add(flagMesh);
            this.floatingUiSprites.set(flagKey, flagMesh);
          } else if (flagMesh.material.map !== flagTex) {
            flagMesh.material.map = flagTex;
            flagMesh.material.needsUpdate = true;
          }

          const peakY = surfaceH + (1.20 + 0.78) * heightScale + 0.25;
          flagMesh.position.set(e.x + 0.5, peakY, e.y + 0.5);
          flagMesh.rotation.y = this.fixedRotationY;
        } else if (!isCompleted) {
          if (progress < 0.32 && stage1Count < 400) {
            // Stage 1 (1 - 15 materials): Stone slab foundation + 4 corner timber posts
            this.instHouseStage1.setMatrixAt(stage1Count++, mMatrix);
          } else if (progress < 0.68 && stage2Count < 400) {
            // Stage 2 (16 - 34 materials): Foundation + posts + cross beams + half-height stone walls
            this.instHouseStage2.setMatrixAt(stage2Count++, mMatrix);
          } else if (stage3Count < 400) {
            // Stage 3 (35 - 49 materials): Full stone walls + roof timber rafters skeleton
            this.instHouseStage3.setMatrixAt(stage3Count++, mMatrix);
          }
        }
      }
      // --- DYNAMIC BILLBOARDS (Creatures, Humanoids, Items, Doors) ---
      else {
        activeIds.add(e.id);
        let skinName = r.skin || "Human_Knight_M.png";
        if (isDoor) {
          skinName = e.properties.door.isOpen ? "Feature_Door_Open.png" : "Feature_Door_Closed.png";
        }

        const entFg = r.color !== undefined ? r.color : 0xffffff;
        const tex = createTintedTexture(skinName, entFg, 0x000000, 0.0);

        let sprite = this.entitySprites.get(e.id);
        if (!sprite) {
          const mat = new THREE.MeshLambertMaterial({
            map: tex,
            transparent: true,
            alphaTest: 0.08,
            side: THREE.DoubleSide
          });
          sprite = new THREE.Mesh(this.billboardGeo, mat);
          sprite.castShadow = true;
          sprite.receiveShadow = false;
          sprite.renderOrder = 10;
          sprite.userData = { entityId: e.id };
          this.entityGroup.add(sprite);
          this.entitySprites.set(e.id, sprite);
        } else if (sprite.material.map !== tex) {
          sprite.material.map = tex;
          sprite.material.needsUpdate = true;
        }

        if (isItem) {
          sprite.scale.set(0.48, 0.48, 0.48);
        } else {
          // Compact 2/3 scale for creatures
          sprite.scale.set(0.72, 0.72, 0.72);
        }

        sprite.position.set(e.x, surfaceH, e.y);
        sprite.rotation.y = this.fixedRotationY;

        // Dimming in Vision Mode outside current zone
        const inCurZone = !knownZones || (Math.floor(e.x / zoneSz) === curVisionZx && Math.floor(e.y / zoneSz) === curVisionZy);

        if (e.combatFlash > 0) {
          sprite.material.color.setHex(0xff3333);
        } else if (!inCurZone) {
          sprite.material.color.setHex(0x555555); // Dimmed
        } else {
          sprite.material.color.setHex(0xffffff); // Full bright
        }

        // --- 3D FLOATING EMOTES & HELD ITEMS PER HAND ---
        if (!isItem && !isDoor) {
          const emoteSkin = getCreatureEmoteSkin(e);
          const heldItems = [];
          for (const [k, p] of Object.entries(e.properties || {})) {
            if ((k.toLowerCase().includes("arm") || k.toLowerCase().includes("hand")) && p && p.heldItem) {
              heldItems.push(p.heldItem);
            }
          }
          if (e.properties?.heldItem) heldItems.push(e.properties.heldItem);
          if (e.properties?.equipment?.mainHand) heldItems.push(e.properties.equipment.mainHand);
          if (e.properties?.equipment?.offHand) heldItems.push(e.properties.equipment.offHand);

          const totalIcons = (emoteSkin ? 1 : 0) + heldItems.length;
          if (totalIcons > 0) {
            const headY = surfaceH + 0.90 + floatBob;
            const iconSpacing = 0.32;
            const startOffset = -((totalIcons - 1) * iconSpacing) / 2;

            // Camera right vector in 45° view: (1/sqrt(2), 0, -1/sqrt(2))
            const rx = 0.70710678;
            const rz = -0.70710678;

            let iconIdx = 0;

            if (emoteSkin) {
              const uiKey = `${e.id}_emote`;
              activeUiIds.add(uiKey);
              const tintFg = (e.emote === 12) ? 0xff3c78 : (e.emote === 13) ? 0xff2828 : 0xfff064;
              const emTex = createTintedTexture(emoteSkin, tintFg, 0x000000, 0.0);

              let emMesh = this.floatingUiSprites.get(uiKey);
              if (!emMesh) {
                const emMat = new THREE.MeshBasicMaterial({
                  map: emTex,
                  transparent: true,
                  alphaTest: 0.1,
                  depthTest: true,
                  side: THREE.DoubleSide
                });
                emMesh = new THREE.Mesh(this.uiIconGeo, emMat);
                emMesh.renderOrder = 25;
                this.floatingUiGroup.add(emMesh);
                this.floatingUiSprites.set(uiKey, emMesh);
              } else if (emMesh.material.map !== emTex) {
                emMesh.material.map = emTex;
                emMesh.material.needsUpdate = true;
              }

              const offset = startOffset + iconIdx * iconSpacing;
              emMesh.position.set(e.x + offset * rx, headY, e.y + offset * rz);
              emMesh.rotation.y = this.fixedRotationY;
              iconIdx++;
            }

            for (let h = 0; h < heldItems.length; h++) {
              const it = heldItems[h];
              const uiKey = `${e.id}_held_${h}`;
              activeUiIds.add(uiKey);

              const skinName = it.skin || it.render?.skin || (typeof it === "string" ? it : it.name) || "Item_Nugget.png";
              const itTex = createTintedTexture(skinName, 0xffffff, 0x000000, 0.0);

              let itMesh = this.floatingUiSprites.get(uiKey);
              if (!itMesh) {
                const itMat = new THREE.MeshBasicMaterial({
                  map: itTex,
                  transparent: true,
                  alphaTest: 0.1,
                  depthTest: true,
                  side: THREE.DoubleSide
                });
                itMesh = new THREE.Mesh(this.uiIconGeo, itMat);
                itMesh.renderOrder = 25;
                this.floatingUiGroup.add(itMesh);
                this.floatingUiSprites.set(uiKey, itMesh);
              } else if (itMesh.material.map !== itTex) {
                itMesh.material.map = itTex;
                itMesh.material.needsUpdate = true;
              }

              const offset = startOffset + iconIdx * iconSpacing;
              itMesh.position.set(e.x + offset * rx, headY, e.y + offset * rz);
              itMesh.rotation.y = this.fixedRotationY;
              iconIdx++;
            }
          }
        }
      }

      if (e.id === this.selectedEntityId) {
        const isTileAligned = isTree || isHouse || isWall || isCactus;
        selectedPos = {
          x: isTileAligned ? e.x + 0.5 : e.x,
          y: surfaceH + 0.015,
          z: isTileAligned ? e.y + 0.5 : e.y
        };
      }
    }

    // --- RENDER UNSTARTED CLAN HOUSE PLOTS (STAGE 0: PEGS & BOUNDARY STRINGS) ---
    if (clanGroups.size > 0 && pegsCount < 400) {
      for (const group of clanGroups.values()) {
        if (!group || !group.claimedZones) continue;
        const bpTiles = getClanBlueprintTiles(group);
        for (let b = 0; b < bpTiles.length; b++) {
          const bp = bpTiles[b];
          if (bp.type === "house" && pegsCount < 400) {
            if (bp.x >= this.renderedMinTx && bp.x <= this.renderedMaxTx &&
                bp.y >= this.renderedMinTy && bp.y <= this.renderedMaxTy) {
              const tileKey = `${bp.x}_${bp.y}`;
              if (!occupiedHouseTiles.has(tileKey)) {
                if (knownZones) {
                  const zk = `${Math.floor(bp.x / zoneSz)}_${Math.floor(bp.y / zoneSz)}`;
                  if (!knownZones.has(zk)) continue;
                }
                const bpH = this.getTileSurfaceHeight(map, bp.x, bp.y);
                const houseRot = (((Math.imul(Math.floor(bp.x) ^ Math.imul(Math.floor(bp.y), 32452843), 8253729) >>> 0) % 4)) * (Math.PI / 2);
                mMatrix.makeRotationY(houseRot);
                mMatrix.setPosition(bp.x + 0.5, bpH, bp.y + 0.5);
                this.instHousePegs.setMatrixAt(pegsCount++, mMatrix);
                occupiedHouseTiles.add(tileKey);
              }
            }
          }
        }
      }
    }

    // --- REAL MULTI-POINT DYNAMIC NIGHT LIGHTS (Placed directly at entities) ---
    let lightIdx = 0;
    if (nightGlow > 0.05) {
      // 1. Finished Houses (Larger warm lantern/hearth glow)
      for (let i = 0; i < visibleEntities.length && lightIdx < this.maxNightLights; i++) {
        const e = visibleEntities[i];
        if (!e || e.destroyed) continue;
        const isHouse = !!e.properties?.house || e.properties?.render?.skin === "Overworld_House.png";
        if (isHouse && e.properties?.house?.isCompleted !== false) {
          const sH = this.getTileSurfaceHeight(map, Math.floor(e.x), Math.floor(e.y));
          const pl = this.nightLightPool[lightIdx++];
          pl.color.setHex(0xff9e3b);
          pl.distance = 11.0;
          pl.decay = 1.6;
          pl.intensity = nightGlow * 2.2;
          pl.position.set(e.x + 0.5, sH + 1.3, e.y + 0.5);
        }
      }

      // 2. Intelligent Humanoids & Members (Small individual torchlight)
      for (let i = 0; i < visibleEntities.length && lightIdx < this.maxNightLights; i++) {
        const e = visibleEntities[i];
        if (!e || e.destroyed) continue;
        const isIntelligent = !!e.properties?.brain || !!e.properties?.group_member;
        if (isIntelligent) {
          const sH = this.getSurfaceElevation(map, e.x, e.y);
          const pl = this.nightLightPool[lightIdx++];
          pl.color.setHex(0xffaa44);
          pl.distance = 7.0;
          pl.decay = 1.8;
          pl.intensity = nightGlow * 1.5;
          pl.position.set(e.x, sH + 0.85, e.y);
        }
      }

      // 3. Stone Walls / Fortresses (Watch torch along perimeter)
      for (let i = 0; i < visibleEntities.length && lightIdx < this.maxNightLights; i++) {
        const e = visibleEntities[i];
        if (!e || e.destroyed) continue;
        const isWall = e.properties?.structure && !e.properties?.house && !e.properties?.door;
        if (isWall) {
          const sH = this.getTileSurfaceHeight(map, Math.floor(e.x), Math.floor(e.y));
          const pl = this.nightLightPool[lightIdx++];
          pl.color.setHex(0xffb555);
          pl.distance = 8.5;
          pl.decay = 1.7;
          pl.intensity = nightGlow * 1.8;
          pl.position.set(e.x + 0.5, sH + 1.4, e.y + 0.5);
        }
      }
    }

    // Turn off unused lights in pool
    while (lightIdx < this.maxNightLights) {
      this.nightLightPool[lightIdx++].intensity = 0;
    }

    // Flush Instanced Counts to GPU
    this.instOakTrunks.count = oakCount;
    this.instOakTrunks.instanceMatrix.needsUpdate = true;
    this.instOakLeaves.count = oakCount;
    this.instOakLeaves.instanceMatrix.needsUpdate = true;

    this.instPineTrunks.count = pineCount;
    this.instPineTrunks.instanceMatrix.needsUpdate = true;
    this.instPineLeaves.count = pineCount;
    this.instPineLeaves.instanceMatrix.needsUpdate = true;

    this.instCacti.count = cactusCount;
    this.instCacti.instanceMatrix.needsUpdate = true;

    this.instWalls.count = wallCount;
    this.instWalls.instanceMatrix.needsUpdate = true;

    this.instHouseWalls.count = houseCount;
    this.instHouseWalls.instanceMatrix.needsUpdate = true;
    this.instHouseRoofs.count = houseCount;
    this.instHouseRoofs.instanceMatrix.needsUpdate = true;

    this.instHousePegs.count = pegsCount;
    this.instHousePegs.instanceMatrix.needsUpdate = true;

    this.instHouseStage1.count = stage1Count;
    this.instHouseStage1.instanceMatrix.needsUpdate = true;

    this.instHouseStage2.count = stage2Count;
    this.instHouseStage2.instanceMatrix.needsUpdate = true;

    this.instHouseStage3.count = stage3Count;
    this.instHouseStage3.instanceMatrix.needsUpdate = true;

    // Clean inactive dynamic billboards
    for (const [id, spr] of this.entitySprites.entries()) {
      if (!activeIds.has(id)) {
        this.entityGroup.remove(spr);
        if (spr.material) spr.material.dispose();
        this.entitySprites.delete(id);
      }
    }

    // Clean inactive floating UI icons & house flags
    for (const [key, spr] of this.floatingUiSprites.entries()) {
      if (!activeUiIds.has(key)) {
        this.floatingUiGroup.remove(spr);
        if (spr.material) spr.material.dispose();
        this.floatingUiSprites.delete(key);
      }
    }

    // Update Claimed Territory 3D Overlay
    this.rebuildTerritoryOverlayIfNeeded(world, clanGroups, visualizedGroupId);

    // Update Selection Reticle
    if (selectedPos) {
      this.reticleMesh.position.set(selectedPos.x, selectedPos.y, selectedPos.z);
      this.reticleMesh.visible = true;
    } else {
      this.reticleMesh.visible = false;
    }

    // Draw WebGL Frame
    this.renderer.render(this.scene, this.camera);
  }

  resize(w, h) {
    this.width = w;
    this.height = h;
    this.updateRendererResolution();

    const aspect = w / h;
    const viewSize = 28 / this.zoom;
    this.camera.left = -viewSize * aspect;
    this.camera.right = viewSize * aspect;
    this.camera.top = viewSize;
    this.camera.bottom = -viewSize;
    this.camera.updateProjectionMatrix();
    this.lastBuiltCamTileX = -9999;
  }
}
