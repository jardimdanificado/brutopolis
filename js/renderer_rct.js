// =============================================================================
// Brutopolis Chronicles - 3D Isometric Tycoon Engine (Volumetric 3D Models)
// =============================================================================

import * as THREE from "https://esm.sh/three@0.160.0";
import { ASSET_DATA } from "./assets_data.js";
import { MAP_WIDTH, MAP_HEIGHT, TILE_FLOOR, TILE_MOUNTAIN, TILE_WATER, TILE_SAND, TILE_STONE, TILE_VOID, TILE_ROAD_GRASS, TILE_ROAD_SAND, TILE_ROAD_STONE, TILE_ROAD_WATER, TILE_ROAD_SNAP } from "./world_gen.js";
import { globalWallCoords, resolveWallSkin, getEntitiesInViewport } from "./engine.js";
import { getClanBlueprintTiles, currentZoneSize } from "./properties.js";

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
  if (e.properties?.life?.isSleeping) return "Emote_Sleeping.png";
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
// Retro Bayer Ordered Dithering on Color & 3D Lighting Edges
// ---------------------------------------------------------------------------

export function applyRetroDitherToMaterial(mat, steps = 24.0, intensity = 0.50) {
  if (!mat) return;
  mat.dithering = true;
  const prevCompile = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader) => {
    if (prevCompile) prevCompile(shader);
    shader.fragmentShader = `
      float getBayer4x4(vec2 p) {
        vec2 m = mod(floor(p), 4.0);
        int x = int(m.x);
        int y = int(m.y);
        if (y == 0) {
          if (x == 0) return 0.0 / 16.0;
          if (x == 1) return 8.0 / 16.0;
          if (x == 2) return 2.0 / 16.0;
          return 10.0 / 16.0;
        } else if (y == 1) {
          if (x == 0) return 12.0 / 16.0;
          if (x == 1) return 4.0 / 16.0;
          if (x == 2) return 14.0 / 16.0;
          return 6.0 / 16.0;
        } else if (y == 2) {
          if (x == 0) return 3.0 / 16.0;
          if (x == 1) return 11.0 / 16.0;
          if (x == 2) return 1.0 / 16.0;
          return 9.0 / 16.0;
        } else {
          if (x == 0) return 15.0 / 16.0;
          if (x == 1) return 7.0 / 16.0;
          if (x == 2) return 13.0 / 16.0;
          return 5.0 / 16.0;
        }
      }
    ` + shader.fragmentShader;

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <dithering_fragment>',
      `
      #include <dithering_fragment>
      // Subtle, controlled Bayer dithering on color transitions & 3D edges
      float bayer = (getBayer4x4(gl_FragCoord.xy) - 0.5) * ${intensity.toFixed(2)};
      float dSteps = ${steps.toFixed(1)};
      gl_FragColor.rgb = floor(gl_FragColor.rgb * dSteps + bayer + 0.5) / dSteps;
      `
    );
  };
}

export function applyWindFoliageShader(mat, deformScale = 0.20) {
  if (!mat) return;
  mat.userData.foliageShader = null;
  const prevCompile = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader) => {
    if (prevCompile) prevCompile(shader);
    shader.uniforms.uSimTick = { value: 0.0 };
    mat.userData.foliageShader = shader;

    shader.vertexShader = `
      uniform float uSimTick;
    ` + shader.vertexShader;

    shader.vertexShader = shader.vertexShader.replace(
      '#include <project_vertex>',
      `
      // Solid discrete shape morph / distortion on interval trigger
      vec4 worldInstPos = instanceMatrix * vec4(position, 1.0);
      float randSeed = fract(sin(dot(worldInstPos.xz, vec2(12.9898, 78.233))) * 43758.5453);
      
      // Variable interval of 15 to 25 simulation frames between shape changes
      float interval = 15.0 + floor(randSeed * 10.0);
      float localTick = uSimTick + randSeed * 100.0;
      
      // Determine which discrete epoch/state the tree is in
      float epoch = floor(localTick / interval);
      
      // Generate unique pseudo-random distortion parameters for each state
      float morphSeedA = fract(sin(dot(vec2(epoch, randSeed * 13.37), vec2(23.1406, 2.665))) * 43758.5453);
      float morphSeedB = fract(sin(dot(vec2(epoch, randSeed * 29.11), vec2(17.913, 9.441))) * 43758.5453);
      float morphSeedC = fract(sin(dot(vec2(epoch, randSeed * 47.19), vec2(31.415, 6.283))) * 43758.5453);
      
      // 3 distinct asymmetrical shape distortion profiles:
      // State 0: Lean and stretch East-West
      // State 1: Squash and bulge North-South
      // State 2: Puff / Expand top canopy
      int state = int(mod(epoch, 3.0));
      
      vec3 morphedPos = position;
      float heightFactor = max(0.0, position.y - 0.25);
      
      if (state == 0) {
        // Skew & sideways stretch
        float dir = morphSeedA > 0.5 ? 1.0 : -1.0;
        morphedPos.x += dir * ${deformScale.toFixed(4)} * heightFactor;
        morphedPos.z += (morphSeedB - 0.5) * ${(deformScale * 0.8).toFixed(4)} * heightFactor;
        morphedPos.y += (morphSeedC - 0.5) * ${(deformScale * 0.4).toFixed(4)} * heightFactor;
      } else if (state == 1) {
        // Asymmetric squash & bulge
        morphedPos.x += (position.x > 0.0 ? 1.0 : -0.7) * ${(deformScale * 0.9).toFixed(4)} * heightFactor;
        morphedPos.z += (morphSeedA > 0.5 ? 1.0 : -1.0) * ${(deformScale * 0.9).toFixed(4)} * heightFactor;
        morphedPos.y -= ${(deformScale * 0.35).toFixed(4)} * heightFactor;
      } else {
        // Top canopy lift / puff
        morphedPos.y += ${(deformScale * 0.6).toFixed(4)} * heightFactor;
        morphedPos.x += (morphSeedB - 0.5) * ${(deformScale * 0.7).toFixed(4)} * heightFactor;
        morphedPos.z += (morphSeedC - 0.5) * ${(deformScale * 0.7).toFixed(4)} * heightFactor;
      }
      
      vec4 mvPosition = vec4( morphedPos, 1.0 );
      #ifdef USE_INSTANCING
        mvPosition = instanceMatrix * mvPosition;
      #endif
      mvPosition = modelViewMatrix * mvPosition;
      gl_Position = projectionMatrix * mvPosition;
      `
    );
  };
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

  const trunk = new THREE.CylinderGeometry(0.18, 0.24, 2.05, 8);
  trunk.translate(0, 0.775, 0);
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

// -----------------------------------------------------------------------------
// House Variational Geometries (Stone Castle Keep & Rustic Forest Wood Cabin)
// -----------------------------------------------------------------------------

// Stone Castle Keep House Walls (Square fortress tower with 4 corner bastion turrets)
function createStoneCastleWallGeometry() {
  const parts = [];
  // Base fortified keep body
  const body = new THREE.BoxGeometry(1.58, 1.40, 1.58);
  body.translate(0, 0.70, 0);
  parts.push(body);

  // 4 Corner Bastion Turrets
  const turretGeo = new THREE.BoxGeometry(0.36, 1.65, 0.36);
  const t1 = turretGeo.clone(); t1.translate(-0.72, 0.825, -0.72); parts.push(t1);
  const t2 = turretGeo.clone(); t2.translate( 0.72, 0.825, -0.72); parts.push(t2);
  const t3 = turretGeo.clone(); t3.translate(-0.72, 0.825,  0.72); parts.push(t3);
  const t4 = turretGeo.clone(); t4.translate( 0.72, 0.825,  0.72); parts.push(t4);

  return mergeBufferGeometries(parts);
}

// Stone Castle Keep Battlements & Roof Geometry (Parapets & Merlons)
function createStoneCastleRoofGeometry() {
  const parts = [];
  // Flat stone walkway slab
  const slab = new THREE.BoxGeometry(1.68, 0.15, 1.68);
  slab.translate(0, 1.40 + 0.075, 0);
  parts.push(slab);

  // Perimeter Crenellated Merlons
  const merlonX = new THREE.BoxGeometry(0.34, 0.28, 0.16);
  for (const x of [-0.48, 0, 0.48]) {
    const mf = merlonX.clone(); mf.translate(x, 1.40 + 0.15 + 0.14, 0.76); parts.push(mf);
    const mb = merlonX.clone(); mb.translate(x, 1.40 + 0.15 + 0.14, -0.76); parts.push(mb);
  }
  const merlonZ = new THREE.BoxGeometry(0.16, 0.28, 0.34);
  for (const z of [-0.32, 0.32]) {
    const ml = merlonZ.clone(); ml.translate(-0.76, 1.40 + 0.15 + 0.14, z); parts.push(ml);
    const mr = merlonZ.clone(); mr.translate( 0.76, 1.40 + 0.15 + 0.14, z); parts.push(mr);
  }

  // Central Flagpole Mast
  const mast = new THREE.CylinderGeometry(0.04, 0.04, 0.70, 5);
  mast.translate(0, 1.40 + 0.15 + 0.35, 0);
  parts.push(mast);

  return mergeBufferGeometries(parts);
}

// Rustic Wood Cabin / Forest Shack Walls Geometry
function createWoodCabinWallGeometry() {
  const parts = [];
  // Interlocking timber logs main body
  const body = new THREE.BoxGeometry(1.48, 1.05, 1.38);
  body.translate(0, 0.525, 0);
  parts.push(body);

  // Front porch veranda posts
  const post = new THREE.CylinderGeometry(0.08, 0.09, 1.05, 6);
  const p1 = post.clone(); p1.translate(-0.65, 0.525, 0.85); parts.push(p1);
  const p2 = post.clone(); p2.translate( 0.65, 0.525, 0.85); parts.push(p2);

  // Stone / Clay fireplace chimney on side
  const chimney = new THREE.BoxGeometry(0.32, 1.55, 0.32);
  chimney.translate(0.78, 0.775, -0.20);
  parts.push(chimney);

  return mergeBufferGeometries(parts);
}

// Rustic Wood Cabin Roof Geometry (Overhanging timber roof extending over front porch)
function createWoodCabinRoofGeometry() {
  const parts = [];
  const roof = createPitchedRoofGeometry(1.72, 1.88, 0.75);
  roof.translate(0, 1.05, 0.10);
  parts.push(roof);

  const mast = new THREE.CylinderGeometry(0.04, 0.04, 0.65, 5);
  mast.translate(0, 1.05 + 0.75 + 0.32, 0.10);
  parts.push(mast);

  return mergeBufferGeometries(parts);
}

// -----------------------------------------------------------------------------
// Large Central Stockpile Warehouse & Bone Ossuary Geometries
// -----------------------------------------------------------------------------

// Large Central Clan Stockpile / Warehouse Geometry (Grand Galpão Comunal)
function createWarehouseGeometry() {
  const parts = [];
  // Main wide building body
  const body = new THREE.BoxGeometry(1.82, 1.30, 1.82);
  body.translate(0, 0.65, 0);
  parts.push(body);

  // Broad Overhanging Timber Barn Roof
  const roof = createPitchedRoofGeometry(2.04, 2.04, 0.88);
  roof.translate(0, 1.30, 0);
  parts.push(roof);

  // Front Porch Awning & Beams
  const awning = new THREE.BoxGeometry(1.90, 0.12, 0.40);
  awning.translate(0, 1.30, 1.00);
  parts.push(awning);

  const post1 = new THREE.CylinderGeometry(0.08, 0.08, 1.30, 6);
  post1.translate(-0.85, 0.65, 1.05);
  parts.push(post1);

  const post2 = new THREE.CylinderGeometry(0.08, 0.08, 1.30, 6);
  post2.translate(0.85, 0.65, 1.05);
  parts.push(post2);

  // Side stacked crates & barrel detail
  const crate1 = new THREE.BoxGeometry(0.35, 0.35, 0.35);
  crate1.translate(-1.02, 0.175, 0.20);
  parts.push(crate1);

  const crate2 = new THREE.BoxGeometry(0.30, 0.30, 0.30);
  crate2.translate(-1.02, 0.45, 0.20);
  parts.push(crate2);

  // Flagpole on roof apex
  const mast = new THREE.CylinderGeometry(0.05, 0.05, 0.85, 5);
  mast.translate(0, 1.30 + 0.88 + 0.40, 0);
  parts.push(mast);

  return mergeBufferGeometries(parts);
}

// 3D Ancient Stone Water Well with Timber Frame & Pitched Roof Canopy
function createWaterWellGeometry() {
  const parts = [];
  // 1. Chiseled Stone Basin / Well Rim (cylindrical base)
  const basin = new THREE.CylinderGeometry(0.58, 0.62, 0.48, 12);
  basin.translate(0, 0.24, 0);
  parts.push(basin);

  // 2. Interior dark water disk
  const water = new THREE.CylinderGeometry(0.44, 0.44, 0.05, 10);
  water.translate(0, 0.35, 0);
  parts.push(water);

  // 3. Wooden Support Pillars (Left & Right)
  const postL = new THREE.CylinderGeometry(0.05, 0.05, 1.05, 6);
  postL.translate(-0.44, 0.72, 0);
  parts.push(postL);

  const postR = new THREE.CylinderGeometry(0.05, 0.05, 1.05, 6);
  postR.translate(0.44, 0.72, 0);
  parts.push(postR);

  // 4. Wooden Crossbeam Axle
  const beam = new THREE.CylinderGeometry(0.04, 0.04, 0.96, 6);
  beam.rotateZ(Math.PI / 2);
  beam.translate(0, 1.15, 0);
  parts.push(beam);

  // 5. Timber Shingled Pitched Canopy / Roof
  const roof = createPitchedRoofGeometry(1.15, 1.05, 0.38);
  roof.translate(0, 1.22, 0);
  parts.push(roof);

  // 6. Suspended Wooden Bucket
  const bucket = new THREE.CylinderGeometry(0.09, 0.07, 0.16, 6);
  bucket.translate(0, 0.60, 0);
  parts.push(bucket);

  return mergeBufferGeometries(parts);
}

// Bone Ossuary House Walls Geometry (Bone Pillars & Skull Corners)
function createBoneHouseWallGeometry() {
  const parts = [];
  const body = new THREE.BoxGeometry(1.50, 1.15, 1.50);
  body.translate(0, 0.575, 0);
  parts.push(body);

  // 4 Corner Skull & Bone Pillars
  const pillarGeo = new THREE.CylinderGeometry(0.12, 0.14, 1.35, 6);
  const p1 = pillarGeo.clone(); p1.translate(-0.70, 0.675, -0.70); parts.push(p1);
  const p2 = pillarGeo.clone(); p2.translate( 0.70, 0.675, -0.70); parts.push(p2);
  const p3 = pillarGeo.clone(); p3.translate(-0.70, 0.675,  0.70); parts.push(p3);
  const p4 = pillarGeo.clone(); p4.translate( 0.70, 0.675,  0.70); parts.push(p4);

  // Skull corner finials
  const skullGeo = new THREE.SphereGeometry(0.14, 6, 6);
  const sk1 = skullGeo.clone(); sk1.translate(-0.70, 1.42, -0.70); parts.push(sk1);
  const sk2 = skullGeo.clone(); sk2.translate( 0.70, 1.42, -0.70); parts.push(sk2);
  const sk3 = skullGeo.clone(); sk3.translate(-0.70, 1.42,  0.70); parts.push(sk3);
  const sk4 = skullGeo.clone(); sk4.translate( 0.70, 1.42,  0.70); parts.push(sk4);

  return mergeBufferGeometries(parts);
}

// Bone Ossuary House Roof Geometry (Rib Dome & Skull Pinnacle)
function createBoneHouseRoofGeometry() {
  const parts = [];
  // Rib dome roof
  const dome = createPitchedRoofGeometry(1.68, 1.68, 0.75);
  dome.translate(0, 1.15, 0);
  parts.push(dome);

  // Central Top Skull Totem
  const topSkull = new THREE.SphereGeometry(0.18, 6, 6);
  topSkull.translate(0, 1.15 + 0.75 + 0.15, 0);
  parts.push(topSkull);

  const mast = new THREE.CylinderGeometry(0.04, 0.04, 0.60, 5);
  mast.translate(0, 1.15 + 0.75 + 0.45, 0);
  parts.push(mast);

  return mergeBufferGeometries(parts);
}

// Bone Wall Geometry (Rib Cage Palisade with Impaled Skulls)
function createBoneWallGeometry() {
  const parts = [];
  const skirt = new THREE.BoxGeometry(1.02, 0.50, 0.40);
  skirt.translate(0, -0.12, 0);
  parts.push(skirt);

  // Vertical Bone Posts
  for (let i = -1.5; i <= 1.5; i += 1.0) {
    const bone = new THREE.CylinderGeometry(0.10, 0.11, 1.10, 6);
    bone.translate(i * 0.25, 0.55, 0);
    parts.push(bone);

    // Skulls on top of center posts
    if (Math.abs(i) < 1.0) {
      const skull = new THREE.SphereGeometry(0.13, 6, 6);
      skull.translate(i * 0.25, 1.10 + 0.10, 0);
      parts.push(skull);
    }
  }
  return mergeBufferGeometries(parts);
}

// 3D Wooden Bridge Geometry (Elevated timber deck with side railings & vertical support pilings)
function createWoodBridgeGeometry() {
  const parts = [];
  const deck = new THREE.BoxGeometry(0.98, 0.08, 0.98);
  deck.translate(0, 0.04, 0);
  parts.push(deck);

  const railL = new THREE.BoxGeometry(0.06, 0.22, 0.98);
  railL.translate(-0.46, 0.15, 0);
  parts.push(railL);

  const railR = new THREE.BoxGeometry(0.06, 0.22, 0.98);
  railR.translate(0.46, 0.15, 0);
  parts.push(railR);

  const stilt = new THREE.CylinderGeometry(0.06, 0.06, 1.30, 6);
  const s1 = stilt.clone(); s1.translate(-0.40, -0.60, -0.40); parts.push(s1);
  const s2 = stilt.clone(); s2.translate( 0.40, -0.60, -0.40); parts.push(s2);
  const s3 = stilt.clone(); s3.translate(-0.40, -0.60,  0.40); parts.push(s3);
  const s4 = stilt.clone(); s4.translate( 0.40, -0.60,  0.40); parts.push(s4);

  return mergeBufferGeometries(parts);
}

// 3D Stone Arch Bridge Geometry (Chiseled stone deck with parapets & heavy masonry piers)
function createStoneBridgeGeometry() {
  const parts = [];
  const deck = new THREE.BoxGeometry(0.98, 0.10, 0.98);
  deck.translate(0, 0.05, 0);
  parts.push(deck);

  const parapetL = new THREE.BoxGeometry(0.12, 0.28, 0.98);
  parapetL.translate(-0.43, 0.18, 0);
  parts.push(parapetL);

  const parapetR = new THREE.BoxGeometry(0.12, 0.28, 0.98);
  parapetR.translate(0.43, 0.18, 0);
  parts.push(parapetR);

  const pier1 = new THREE.BoxGeometry(0.24, 1.40, 0.96);
  pier1.translate(-0.25, -0.65, 0);
  parts.push(pier1);

  const pier2 = new THREE.BoxGeometry(0.24, 1.40, 0.96);
  pier2.translate(0.25, -0.65, 0);
  parts.push(pier2);

  return mergeBufferGeometries(parts);
}

// 3D Water Platform / Stilt Foundation Geometry for Houses & Buildings over water
function createWaterPlatformGeometry() {
  const parts = [];
  const deck = new THREE.BoxGeometry(1.68, 0.12, 1.68);
  deck.translate(0, 0.06, 0);
  parts.push(deck);

  const stilt = new THREE.CylinderGeometry(0.09, 0.09, 1.40, 6);
  const p1 = stilt.clone(); p1.translate(-0.72, -0.64, -0.72); parts.push(p1);
  const p2 = stilt.clone(); p2.translate( 0.72, -0.64, -0.72); parts.push(p2);
  const p3 = stilt.clone(); p3.translate(-0.72, -0.64,  0.72); parts.push(p3);
  const p4 = stilt.clone(); p4.translate( 0.72, -0.64,  0.72); parts.push(p4);

  return mergeBufferGeometries(parts);
}

// Fortified Stone Wall Geometry (Slope-Adaptive Base Skirt + Crenellated Battlements)
function createStoneWallGeometry() {
  const parts = [];
  // 1. Base skirt extending down to anchor into steep ground slopes
  const skirt = new THREE.BoxGeometry(1.02, 0.60, 0.90);
  skirt.translate(0, -0.15, 0);
  parts.push(skirt);

  // 2. Main solid wall body
  const body = new THREE.BoxGeometry(1.0, 1.05, 0.82);
  body.translate(0, 0.525, 0);
  parts.push(body);

  // 3. Merlons / Crenellations atop the wall
  const merlon1 = new THREE.BoxGeometry(0.38, 0.28, 0.86);
  merlon1.translate(-0.31, 1.05 + 0.14, 0);
  parts.push(merlon1);

  const merlon2 = new THREE.BoxGeometry(0.38, 0.28, 0.86);
  merlon2.translate(0.31, 1.05 + 0.14, 0);
  parts.push(merlon2);

  return mergeBufferGeometries(parts);
}

// Wooden Palisade Wall Geometry (Pointed Vertical Logs + Anchoring Skirt)
function createWoodPalisadeGeometry() {
  const parts = [];
  const skirt = new THREE.BoxGeometry(1.02, 0.50, 0.40);
  skirt.translate(0, -0.12, 0);
  parts.push(skirt);

  for (let i = -1.5; i <= 1.5; i += 1.0) {
    const log = new THREE.CylinderGeometry(0.11, 0.12, 1.15, 6);
    log.translate(i * 0.24, 0.575, 0);
    parts.push(log);
    const tip = new THREE.ConeGeometry(0.11, 0.22, 6);
    tip.translate(i * 0.24, 1.15 + 0.11, 0);
    parts.push(tip);
  }
  return mergeBufferGeometries(parts);
}

// Mixed Stone Foundation & Wooden Parapet Wall Geometry
function createMixedWallGeometry() {
  const parts = [];
  const skirt = new THREE.BoxGeometry(1.02, 0.50, 0.80);
  skirt.translate(0, -0.12, 0);
  parts.push(skirt);

  // Stone base
  const stoneBase = new THREE.BoxGeometry(1.0, 0.65, 0.80);
  stoneBase.translate(0, 0.325, 0);
  parts.push(stoneBase);

  // Timber railing & posts
  const beam = new THREE.BoxGeometry(1.02, 0.14, 0.18);
  beam.translate(0, 0.95, 0);
  parts.push(beam);

  const post1 = new THREE.BoxGeometry(0.14, 0.45, 0.20);
  post1.translate(-0.35, 0.80, 0);
  parts.push(post1);

  const post2 = new THREE.BoxGeometry(0.14, 0.45, 0.20);
  post2.translate(0.35, 0.80, 0);
  parts.push(post2);

  return mergeBufferGeometries(parts);
}

// Stage 1: Wall Foundation Trench & Timber Scaffolding
function createWallStage1Geometry() {
  const parts = [];
  const trench = new THREE.BoxGeometry(1.04, 0.30, 0.94);
  trench.translate(0, 0.10, 0);
  parts.push(trench);

  const post = new THREE.BoxGeometry(0.08, 0.70, 0.08);
  const p1 = post.clone(); p1.translate(-0.45, 0.35, -0.40); parts.push(p1);
  const p2 = post.clone(); p2.translate( 0.45, 0.35, -0.40); parts.push(p2);
  const p3 = post.clone(); p3.translate(-0.45, 0.35,  0.40); parts.push(p3);
  const p4 = post.clone(); p4.translate( 0.45, 0.35,  0.40); parts.push(p4);

  return mergeBufferGeometries(parts);
}

// Fortified Wooden & Iron Gatehouse (Closed State)
function createGatehouseClosedGeometry() {
  const parts = [];
  // 1. Left & Right Heavy Timber/Stone Pillars
  const pillarGeo = new THREE.BoxGeometry(0.26, 1.45, 0.60);
  const leftPillar = pillarGeo.clone(); leftPillar.translate(-0.38, 0.725, 0); parts.push(leftPillar);
  const rightPillar = pillarGeo.clone(); rightPillar.translate( 0.38, 0.725, 0); parts.push(rightPillar);

  // 2. Top Architrave / Lintel Beam
  const lintel = new THREE.BoxGeometry(1.08, 0.32, 0.64);
  lintel.translate(0, 1.45 + 0.16, 0);
  parts.push(lintel);

  // 3. Merlons atop the Gatehouse
  const m1 = new THREE.BoxGeometry(0.28, 0.22, 0.66); m1.translate(-0.40, 1.61 + 0.22, 0); parts.push(m1);
  const m2 = new THREE.BoxGeometry(0.28, 0.22, 0.66); m2.translate( 0.40, 1.61 + 0.22, 0); parts.push(m2);

  // 4. Closed Double Wooden Doors with Iron Bracing
  const doorGeo = new THREE.BoxGeometry(0.50, 1.35, 0.12);
  doorGeo.translate(0, 0.675, 0);
  parts.push(doorGeo);

  // Iron Cross-brace
  const brace1 = new THREE.BoxGeometry(0.52, 0.08, 0.16); brace1.translate(0, 0.35, 0); parts.push(brace1);
  const brace2 = new THREE.BoxGeometry(0.52, 0.08, 0.16); brace2.translate(0, 1.05, 0); parts.push(brace2);

  return mergeBufferGeometries(parts);
}

// Fortified Wooden & Iron Gatehouse (Open State)
function createGatehouseOpenGeometry() {
  const parts = [];
  // 1. Left & Right Heavy Pillars
  const pillarGeo = new THREE.BoxGeometry(0.26, 1.45, 0.60);
  const leftPillar = pillarGeo.clone(); leftPillar.translate(-0.38, 0.725, 0); parts.push(leftPillar);
  const rightPillar = pillarGeo.clone(); rightPillar.translate( 0.38, 0.725, 0); parts.push(rightPillar);

  // 2. Top Architrave / Lintel Beam
  const lintel = new THREE.BoxGeometry(1.08, 0.32, 0.64);
  lintel.translate(0, 1.45 + 0.16, 0);
  parts.push(lintel);

  // 3. Merlons atop the Gatehouse
  const m1 = new THREE.BoxGeometry(0.28, 0.22, 0.66); m1.translate(-0.40, 1.61 + 0.22, 0); parts.push(m1);
  const m2 = new THREE.BoxGeometry(0.28, 0.22, 0.66); m2.translate( 0.40, 1.61 + 0.22, 0); parts.push(m2);

  // 4. Swung-Open Doors folded against the interior pillars
  const doorLeaf = new THREE.BoxGeometry(0.10, 1.30, 0.26);
  const leftDoor = doorLeaf.clone(); leftDoor.translate(-0.24, 0.65, 0.14); parts.push(leftDoor);
  const rightDoor = doorLeaf.clone(); rightDoor.translate( 0.24, 0.65, 0.14); parts.push(rightDoor);

  return mergeBufferGeometries(parts);
}

// Stage 1: Gate Foundation & Post Framing
function createGateStage1Geometry() {
  const parts = [];
  const postGeo = new THREE.BoxGeometry(0.18, 1.10, 0.18);
  const p1 = postGeo.clone(); p1.translate(-0.38, 0.55, 0); parts.push(p1);
  const p2 = postGeo.clone(); p2.translate( 0.38, 0.55, 0); parts.push(p2);
  const cross = new THREE.BoxGeometry(0.94, 0.08, 0.08); cross.translate(0, 1.05, 0); parts.push(cross);
  return mergeBufferGeometries(parts);
}

// Volumetric Felled Wood Log Pile 3D Geometry
function createWoodLogGeometry() {
  const parts = [];
  // Bottom log 1
  const log1 = new THREE.CylinderGeometry(0.12, 0.12, 0.68, 6);
  log1.rotateZ(Math.PI / 2);
  log1.translate(0, 0.12, -0.10);
  parts.push(log1);

  // Bottom log 2
  const log2 = new THREE.CylinderGeometry(0.11, 0.11, 0.64, 6);
  log2.rotateZ(Math.PI / 2);
  log2.translate(0.02, 0.11, 0.11);
  parts.push(log2);

  // Top stacked log 3
  const log3 = new THREE.CylinderGeometry(0.10, 0.10, 0.60, 6);
  log3.rotateZ(Math.PI / 2);
  log3.translate(-0.01, 0.28, 0.01);
  parts.push(log3);

  return mergeBufferGeometries(parts);
}

// Volumetric Chiseled Stone Block / Rubble 3D Geometry
function createStoneItemGeometry() {
  const parts = [];
  const b1 = new THREE.BoxGeometry(0.38, 0.22, 0.32);
  b1.translate(0, 0.11, 0);
  parts.push(b1);

  const b2 = new THREE.BoxGeometry(0.24, 0.16, 0.20);
  b2.translate(0.15, 0.24, -0.05);
  parts.push(b2);

  return mergeBufferGeometries(parts);
}

// Standing Outdoor Wood & Iron Torch Post Geometry
function createStandingTorchGeometry() {
  const parts = [];

  // 1. Wooden Stake Post (penetrates down to -0.2 into ground for solid anchor)
  const post = new THREE.CylinderGeometry(0.045, 0.065, 1.25, 6);
  post.translate(0, 0.425, 0); // Bottom is at y = -0.20, Top is at y = 1.05
  parts.push(post);

  // 2. Iron Top Basket / Ring
  const ironRing = new THREE.CylinderGeometry(0.08, 0.055, 0.16, 6);
  ironRing.translate(0, 0.98, 0);
  parts.push(ironRing);

  // 3. Flame core
  const flame = new THREE.OctahedronGeometry(0.11);
  flame.translate(0, 1.12, 0);
  parts.push(flame);

  return mergeBufferGeometries(parts);
}

// Unlit Standing Torch Post (Extinguished / No fuel)
function createStandingTorchUnlitGeometry() {
  const parts = [];
  const post = new THREE.CylinderGeometry(0.045, 0.065, 1.25, 6);
  post.translate(0, 0.425, 0);
  parts.push(post);

  const ironRing = new THREE.CylinderGeometry(0.08, 0.055, 0.16, 6);
  ironRing.translate(0, 0.98, 0);
  parts.push(ironRing);

  return mergeBufferGeometries(parts);
}



// Wood Campfire (Cross-Stacked Wood Logs)
function createWoodCampfireGeometry() {
  const parts = [];

  // Bottom Layer (2 Parallel Logs)
  const l1 = new THREE.CylinderGeometry(0.05, 0.05, 0.52, 6);
  l1.rotateZ(Math.PI / 2);
  l1.translate(0, 0.05, -0.12);
  parts.push(l1);

  const l2 = new THREE.CylinderGeometry(0.05, 0.05, 0.52, 6);
  l2.rotateZ(Math.PI / 2);
  l2.translate(0, 0.05, 0.12);
  parts.push(l2);

  // Top Layer (2 Perpendicular Cross Logs)
  const l3 = new THREE.CylinderGeometry(0.045, 0.045, 0.48, 6);
  l3.rotateX(Math.PI / 2);
  l3.translate(-0.10, 0.11, 0);
  parts.push(l3);

  const l4 = new THREE.CylinderGeometry(0.045, 0.045, 0.48, 6);
  l4.rotateX(Math.PI / 2);
  l4.translate(0.10, 0.11, 0);
  parts.push(l4);

  return mergeBufferGeometries(parts);
}

// Glowing Campfire Flame Geometry (Rendered when isLit === true)
function createCampfireFlameGeometry() {
  const parts = [];
  const f1 = new THREE.OctahedronGeometry(0.18);
  f1.translate(0, 0.22, 0);
  parts.push(f1);

  const f2 = new THREE.OctahedronGeometry(0.12);
  f2.translate(0, 0.34, 0);
  parts.push(f2);

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

    // 1. Scene & Pure Black Void Background
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);

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
    this.renderFullWorld = false;
    this.lastBuiltFullWorld = false;

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
    this.renderer.shadowMap.enabled = this.shadowsEnabled;
    this.renderer.shadowMap.type = THREE.BasicShadowMap; // Pixel-crisp hard unfiltered retro shadows
    this.renderer.setClearColor(0x000000, 1.0);
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
    this.sunLight.shadow.camera.near = 1;
    this.sunLight.shadow.camera.far = 350;
    const sd = 60;
    this.sunLight.shadow.camera.left = -sd;
    this.sunLight.shadow.camera.right = sd;
    this.sunLight.shadow.camera.top = sd;
    this.sunLight.shadow.camera.bottom = -sd;
    this.sunLight.shadow.bias = -0.0001;
    this.sunLight.shadow.normalBias = 0.05;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    // Dynamic Night Point Light Pool (Placed strictly at intelligent creatures, houses, and walls)
    this.maxNightLights = 28;
    this.maxShadowPointLights = 0; // Point lights do direct local shading; sun/moon provides directional shadows
    this.nightLightPool = [];
    for (let i = 0; i < this.maxNightLights; i++) {
      const pl = new THREE.PointLight(0xffaa44, 0, 12, 1.8);
      pl.castShadow = false;
      this.scene.add(pl);
      this.nightLightPool.push(pl);
    }

    // Reusable Math and Transform objects for Zero-Alloc Rendering
    this._mMatrix = new THREE.Matrix4();
    this._scaleMatrix = new THREE.Matrix4();
    this._rotEuler = new THREE.Euler(0, 0, 0, "YXZ");
    this._tempVec = new THREE.Vector3();
    this._tempColor = new THREE.Color();

    // Reusable Light Candidate Structs (Zero GC during nighttime)
    this.lightCandidatesPool = [];
    for (let i = 0; i < 128; i++) {
      this.lightCandidatesPool.push({
        x: 0,
        y: 0,
        z: 0,
        color: 0,
        distance: 0,
        decay: 0,
        intensity: 0,
        priority: 0,
        distSq: 0
      });
    }

    // 5. Materials with Vertex Colors for Contact AO, Textures & Dithering
    this.materials = {
      [TILE_FLOOR]: new THREE.MeshLambertMaterial({
        color: 0x2e5424,
        dithering: true,
        vertexColors: true,
        side: THREE.DoubleSide
      }),
      sandClean: new THREE.MeshLambertMaterial({
        color: 0xdec078,
        dithering: true,
        vertexColors: true,
        side: THREE.DoubleSide
      }),
      [TILE_SAND]: new THREE.MeshLambertMaterial({
        map: createTintedTexture("Feature_Pebbles.png", 0x6e5228, 0xdec078, 1.0),
        dithering: true,
        vertexColors: true,
        side: THREE.DoubleSide
      }),
      [TILE_STONE]: new THREE.MeshLambertMaterial({
        map: createTintedTexture("Feature_Stone_B.png", 0xa5a5af, 0x3a3a44, 1.0),
        dithering: true,
        vertexColors: true,
        side: THREE.DoubleSide
      }),
      [TILE_MOUNTAIN]: new THREE.MeshLambertMaterial({
        map: createTintedTexture("Feature_Stone_C.png", 0xb4afaa, 0x484242, 1.0),
        dithering: true,
        vertexColors: true,
        side: THREE.DoubleSide
      }),
      [TILE_WATER]: new THREE.MeshLambertMaterial({
        map: createTintedTexture("Feature_Waves.png", 0x64b4ff, 0x143764, 1.0),
        dithering: true,
        vertexColors: true,
        transparent: false,
        opacity: 1.0,
        side: THREE.DoubleSide
      }),
      [TILE_ROAD_GRASS]: new THREE.MeshLambertMaterial({
        map: createTintedTexture("Feature_Stone_B.png", 0xa67c52, 0x3d2816, 1.0),
        dithering: true,
        vertexColors: true,
        side: THREE.DoubleSide
      }),
      [TILE_ROAD_SAND]: new THREE.MeshLambertMaterial({
        map: createTintedTexture("Feature_Pebbles.png", 0xc8a060, 0x5c4220, 1.0),
        dithering: true,
        vertexColors: true,
        side: THREE.DoubleSide
      }),
      [TILE_ROAD_STONE]: new THREE.MeshLambertMaterial({
        map: createTintedTexture("Feature_Brick_A.png", 0x909098, 0x383842, 1.0),
        dithering: true,
        vertexColors: true,
        side: THREE.DoubleSide
      }),
      [TILE_ROAD_WATER]: new THREE.MeshLambertMaterial({
        map: createTintedTexture("Feature_Wood.png", 0x8a6038, 0x382412, 1.0),
        dithering: true,
        vertexColors: true,
        side: THREE.DoubleSide
      }),
      [TILE_ROAD_SNAP]: new THREE.MeshLambertMaterial({
        map: createTintedTexture("Feature_Pebbles.png", 0xd4aa70, 0x5c4220, 1.0),
        dithering: true,
        vertexColors: true,
        side: THREE.DoubleSide
      }),
      cliff: new THREE.MeshLambertMaterial({
        map: createTintedTexture("Feature_Stone_C.png", 0x887a6a, 0x2b2218, 1.0),
        dithering: true,
        vertexColors: true,
        side: THREE.DoubleSide
      }),
      grassFoliage: new THREE.MeshLambertMaterial({
        map: createTintedTexture("Feature_Grass.png", 0x3c7228, 0x000000, 0.0),
        dithering: true,
        transparent: false,
        alphaTest: 0.5,
        depthWrite: true,
        depthTest: true,
        side: THREE.DoubleSide
      }),
      treeTrunk: new THREE.MeshLambertMaterial({ color: 0x583c1e, dithering: true }),
      oakLeaves: new THREE.MeshLambertMaterial({ color: 0x3e8226, dithering: true }),
      pineLeaves: new THREE.MeshLambertMaterial({ color: 0x205222, dithering: true }),
      cactus: new THREE.MeshLambertMaterial({ color: 0x3c7c2c, dithering: true }),
      // Textured House Walls (Warm Timbered Plaster/Brick) & Roofs (Terracotta Shingles)
      houseWall: new THREE.MeshLambertMaterial({
        map: createTintedTexture("Feature_Brick_B.png", 0xfffaea, 0x8a6242, 1.0),
        dithering: true,
        side: THREE.DoubleSide
      }),
      houseRoof: new THREE.MeshLambertMaterial({
        map: createTintedTexture("Feature_Brick_C.png", 0xff6238, 0x941e0a, 1.0),
        dithering: true,
        side: THREE.DoubleSide
      }),
      woodHouseWall: new THREE.MeshLambertMaterial({
        map: createTintedTexture("Feature_Wood.png", 0xd4a373, 0x4a3525, 1.0),
        dithering: true,
        side: THREE.DoubleSide
      }),
      woodHouseRoof: new THREE.MeshLambertMaterial({
        map: createTintedTexture("Feature_Wood.png", 0xa67c52, 0x3b271a, 1.0),
        dithering: true,
        side: THREE.DoubleSide
      }),
      stoneHouseWall: new THREE.MeshLambertMaterial({
        map: createTintedTexture("Feature_Brick_A.png", 0xd8d7de, 0x3a3842, 1.0),
        dithering: true,
        side: THREE.DoubleSide
      }),
      stoneHouseRoof: new THREE.MeshLambertMaterial({
        map: createTintedTexture("Feature_Brick_A.png", 0x9098a8, 0x2d3748, 1.0),
        dithering: true,
        side: THREE.DoubleSide
      }),
      houseBlueprint: new THREE.MeshLambertMaterial({
        map: createTintedTexture("Feature_Wood.png", 0xdfa052, 0x5a3418, 1.0),
        dithering: true,
        side: THREE.DoubleSide
      }),
      wall: new THREE.MeshLambertMaterial({
        map: createTintedTexture("Feature_Brick_A.png", 0xd8d7de, 0x3a3842, 1.0),
        dithering: true,
        side: THREE.DoubleSide
      }),
      woodWall: new THREE.MeshLambertMaterial({
        map: createTintedTexture("Feature_Wood.png", 0xc89858, 0x482c18, 1.0),
        dithering: true,
        side: THREE.DoubleSide
      }),
      mixedWall: new THREE.MeshLambertMaterial({
        map: createTintedTexture("Feature_Brick_B.png", 0xdfd0b0, 0x3d3024, 1.0),
        dithering: true,
        side: THREE.DoubleSide
      }),
      wallBlueprint: new THREE.MeshLambertMaterial({
        map: createTintedTexture("Feature_Brick_A.png", 0x9a8f82, 0x3d3024, 1.0),
        dithering: true,
        side: THREE.DoubleSide
      }),
      woodLog: new THREE.MeshLambertMaterial({
        map: createTintedTexture("Feature_Wood.png", 0xc89858, 0x3d2210, 1.0),
        dithering: true,
        side: THREE.DoubleSide
      }),
      stoneItem: new THREE.MeshLambertMaterial({
        map: createTintedTexture("Feature_Stone_B.png", 0xd8d8e6, 0x3c3c46, 1.0),
        dithering: true,
        side: THREE.DoubleSide
      }),
      gate: new THREE.MeshLambertMaterial({
        map: createTintedTexture("Feature_Wood.png", 0xad7842, 0x3a2214, 1.0),
        dithering: true,
        side: THREE.DoubleSide
      }),
      gateBlueprint: new THREE.MeshLambertMaterial({
        map: createTintedTexture("Feature_Wood.png", 0xc89858, 0x482c18, 1.0),
        dithering: true,
        side: THREE.DoubleSide
      }),
      warehouse: new THREE.MeshLambertMaterial({
        map: createTintedTexture("Feature_Wood.png", 0xc89858, 0x482c18, 1.0),
        dithering: true,
        side: THREE.DoubleSide
      }),
      boneHouseWall: new THREE.MeshLambertMaterial({
        map: createTintedTexture("Feature_Stone_B.png", 0xf5f3ea, 0x5a554a, 1.0),
        dithering: true,
        side: THREE.DoubleSide
      }),
      boneHouseRoof: new THREE.MeshLambertMaterial({
        map: createTintedTexture("Feature_Stone_B.png", 0xe6e2d3, 0x3d3830, 1.0),
        dithering: true,
        side: THREE.DoubleSide
      }),
      boneWall: new THREE.MeshLambertMaterial({
        map: createTintedTexture("Feature_Stone_B.png", 0xf5f3ea, 0x5a554a, 1.0),
        dithering: true,
        side: THREE.DoubleSide
      }),
      campfireFlame: new THREE.MeshBasicMaterial({
        color: 0xff8800
      }),
      road: new THREE.MeshLambertMaterial({
        map: createTintedTexture("Feature_Stone_B.png", 0x9b7653, 0x4a3520, 1.0),
        dithering: true,
        side: THREE.DoubleSide
      }),
      roadSnap: new THREE.MeshLambertMaterial({
        map: createTintedTexture("Feature_Pebbles.png", 0xd8ba80, 0x6a5024, 1.0),
        dithering: true,
        side: THREE.DoubleSide
      }),
      waterWell: new THREE.MeshLambertMaterial({
        map: createTintedTexture("Feature_Stone_B.png", 0xd0c4b4, 0x3d352e, 1.0),
        dithering: true,
        side: THREE.DoubleSide
      }),
      woodBridge: new THREE.MeshLambertMaterial({
        map: createTintedTexture("Feature_Wood.png", 0x8b5a2b, 0x3a2214, 1.0),
        dithering: true,
        side: THREE.DoubleSide
      }),
      stoneBridge: new THREE.MeshLambertMaterial({
        map: createTintedTexture("Feature_Brick_A.png", 0xc8c8c8, 0x4a4a4a, 1.0),
        dithering: true,
        side: THREE.DoubleSide
      }),
      waterPlatform: new THREE.MeshLambertMaterial({
        map: createTintedTexture("Feature_Wood.png", 0x7c4c24, 0x2e1a0e, 1.0),
        dithering: true,
        side: THREE.DoubleSide
      })
    };

    // Apply Bayer ordered dithering & GPU Wind Vertex sway to foliage
    for (const mat of Object.values(this.materials)) {
      applyRetroDitherToMaterial(mat);
    }
    applyWindFoliageShader(this.materials.oakLeaves, 0.055);
    applyWindFoliageShader(this.materials.pineLeaves, 0.038);
    applyWindFoliageShader(this.materials.grassFoliage, 0.025);

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
    const oakTrunkGeo = new THREE.CylinderGeometry(0.18, 0.28, 1.5, 6);
    oakTrunkGeo.translate(0, 0.55, 0);
    this.instOakTrunks = new THREE.InstancedMesh(oakTrunkGeo, this.materials.treeTrunk, this.maxInstances);
    this.instOakTrunks.castShadow = true;
    this.instOakTrunks.receiveShadow = true;

    const oakLeafGeo = new THREE.DodecahedronGeometry(0.85);
    oakLeafGeo.translate(0, 1.55, 0);
    this.instOakLeaves = new THREE.InstancedMesh(oakLeafGeo, this.materials.oakLeaves, this.maxInstances);
    this.instOakLeaves.castShadow = true;
    this.instOakLeaves.receiveShadow = true;

    // Pine Trees
    const pineTrunkGeo = new THREE.CylinderGeometry(0.12, 0.20, 1.25, 5);
    pineTrunkGeo.translate(0, 0.425, 0);
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

    // Stone Walls (Finished Stage & Stage 1 Foundation/Scaffolding)
    const wallGeo = createStoneWallGeometry();
    this.instWalls = new THREE.InstancedMesh(wallGeo, this.materials.wall, this.maxInstances);
    this.instWalls.castShadow = true;
    this.instWalls.receiveShadow = true;

    const woodPalGeo = createWoodPalisadeGeometry();
    this.instWoodWalls = new THREE.InstancedMesh(woodPalGeo, this.materials.woodWall, this.maxInstances);
    this.instWoodWalls.castShadow = true;
    this.instWoodWalls.receiveShadow = true;

    const mixedWallGeo = createMixedWallGeometry();
    this.instMixedWalls = new THREE.InstancedMesh(mixedWallGeo, this.materials.mixedWall, this.maxInstances);
    this.instMixedWalls.castShadow = true;
    this.instMixedWalls.receiveShadow = true;

    const wallSt1Geo = createWallStage1Geometry();
    this.instWallsStage1 = new THREE.InstancedMesh(wallSt1Geo, this.materials.wallBlueprint, this.maxInstances);
    this.instWallsStage1.castShadow = true;
    this.instWallsStage1.receiveShadow = true;

    // Fortified Gates (Closed, Open, and Stage 1 Foundation)
    const gateClosedGeo = createGatehouseClosedGeometry();
    this.instGatesClosed = new THREE.InstancedMesh(gateClosedGeo, this.materials.gate, 400);
    this.instGatesClosed.castShadow = true;
    this.instGatesClosed.receiveShadow = true;

    const gateOpenGeo = createGatehouseOpenGeometry();
    this.instGatesOpen = new THREE.InstancedMesh(gateOpenGeo, this.materials.gate, 400);
    this.instGatesOpen.castShadow = true;
    this.instGatesOpen.receiveShadow = true;

    const gateSt1Geo = createGateStage1Geometry();
    this.instGatesStage1 = new THREE.InstancedMesh(gateSt1Geo, this.materials.gateBlueprint, 400);
    this.instGatesStage1.castShadow = true;
    this.instGatesStage1.receiveShadow = true;

    // Houses (Finished Stage 4: Mixed, Wood Cabin, Stone Castle Keep Walls + Roof + Flagpole Mast)
    const houseWallGeo = new THREE.BoxGeometry(1.5, 1.2, 1.5);
    houseWallGeo.translate(0, 0.6, 0);
    this.instHouseWalls = new THREE.InstancedMesh(houseWallGeo, this.materials.houseWall, 400);
    this.instHouseWalls.castShadow = true;
    this.instHouseWalls.receiveShadow = true;

    const woodCabinWallGeo = createWoodCabinWallGeometry();
    this.instWoodHouseWalls = new THREE.InstancedMesh(woodCabinWallGeo, this.materials.woodHouseWall, 400);
    this.instWoodHouseWalls.castShadow = true;
    this.instWoodHouseWalls.receiveShadow = true;

    const stoneCastleWallGeo = createStoneCastleWallGeometry();
    this.instStoneHouseWalls = new THREE.InstancedMesh(stoneCastleWallGeo, this.materials.stoneHouseWall, 400);
    this.instStoneHouseWalls.castShadow = true;
    this.instStoneHouseWalls.receiveShadow = true;

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

    const woodCabinRoofGeo = createWoodCabinRoofGeometry();
    this.instWoodHouseRoofs = new THREE.InstancedMesh(woodCabinRoofGeo, this.materials.woodHouseRoof, 400);
    this.instWoodHouseRoofs.castShadow = true;
    this.instWoodHouseRoofs.receiveShadow = true;

    const stoneCastleRoofGeo = createStoneCastleRoofGeometry();
    this.instStoneHouseRoofs = new THREE.InstancedMesh(stoneCastleRoofGeo, this.materials.stoneHouseRoof, 400);
    this.instStoneHouseRoofs.castShadow = true;
    this.instStoneHouseRoofs.receiveShadow = true;

    // Bone Ossuary Houses (Pillars & Skull Roof)
    const boneHouseWallGeo = createBoneHouseWallGeometry();
    this.instBoneHouseWalls = new THREE.InstancedMesh(boneHouseWallGeo, this.materials.boneHouseWall, 400);
    this.instBoneHouseWalls.castShadow = true;
    this.instBoneHouseWalls.receiveShadow = true;

    const boneHouseRoofGeo = createBoneHouseRoofGeometry();
    this.instBoneHouseRoofs = new THREE.InstancedMesh(boneHouseRoofGeo, this.materials.boneHouseRoof, 400);
    this.instBoneHouseRoofs.castShadow = true;
    this.instBoneHouseRoofs.receiveShadow = true;

    // Bone Wall (Rib Fence + Skulls)
    const boneWallGeo = createBoneWallGeometry();
    this.instBoneWalls = new THREE.InstancedMesh(boneWallGeo, this.materials.boneWall, this.maxInstances);
    this.instBoneWalls.castShadow = true;
    this.instBoneWalls.receiveShadow = true;

    // Large Clan Stockpile Warehouse
    const warehouseGeo = createWarehouseGeometry();
    this.instWarehouses = new THREE.InstancedMesh(warehouseGeo, this.materials.warehouse, 200);
    this.instWarehouses.castShadow = true;
    this.instWarehouses.receiveShadow = true;

    // 3D Ancient Stone Water Well
    const waterWellGeo = createWaterWellGeometry();
    this.instWaterWells = new THREE.InstancedMesh(waterWellGeo, this.materials.waterWell, 200);
    this.instWaterWells.castShadow = true;
    this.instWaterWells.receiveShadow = true;

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

    // 3D Volumetric Resource Items (Wood Logs and Stone Blocks)
    const woodLogGeo = createWoodLogGeometry();
    this.instWoodLogs = new THREE.InstancedMesh(woodLogGeo, this.materials.woodLog, this.maxInstances);
    this.instWoodLogs.castShadow = true;
    this.instWoodLogs.receiveShadow = true;

    const stoneItemGeo = createStoneItemGeometry();
    this.instStoneItems = new THREE.InstancedMesh(stoneItemGeo, this.materials.stoneItem, this.maxInstances);
    this.instStoneItems.castShadow = true;
    this.instStoneItems.receiveShadow = true;

    // 3D Standing Torches (Lit & Unlit Posts)
    const standingTorchGeo = createStandingTorchGeometry();
    this.instTorches = new THREE.InstancedMesh(standingTorchGeo, this.materials.woodWall, 600);
    this.instTorches.castShadow = true;
    this.instTorches.receiveShadow = true;

    const standingTorchUnlitGeo = createStandingTorchUnlitGeometry();
    this.instTorchesUnlit = new THREE.InstancedMesh(standingTorchUnlitGeo, this.materials.woodWall, 600);
    this.instTorchesUnlit.castShadow = true;
    this.instTorchesUnlit.receiveShadow = true;

    // 3D Wood Campfires & Flames
    const woodCampfireGeo = createWoodCampfireGeometry();
    this.instWoodCampfires = new THREE.InstancedMesh(woodCampfireGeo, this.materials.woodWall, 600);
    this.instWoodCampfires.castShadow = true;
    this.instWoodCampfires.receiveShadow = true;

    const campfireFlameGeo = createCampfireFlameGeometry();
    this.instCampfireFlames = new THREE.InstancedMesh(campfireFlameGeo, this.materials.campfireFlame, 600);

    // 3D Roads & Snap Points (Paved Flat Mud / Dirt Path Slabs & Cobblestone Snap Points)
    const roadGeo = new THREE.BoxGeometry(0.96, 0.04, 0.96);
    roadGeo.translate(0, 0.02, 0);
    this.instRoads = new THREE.InstancedMesh(roadGeo, this.materials.road, 1600);
    this.instRoads.receiveShadow = true;

    const roadSnapGeo = new THREE.BoxGeometry(0.96, 0.05, 0.96);
    roadSnapGeo.translate(0, 0.025, 0);
    this.instRoadSnaps = new THREE.InstancedMesh(roadSnapGeo, this.materials.roadSnap, 1600);
    this.instRoadSnaps.receiveShadow = true;

    // 3D Elevated Bridges over Water (Wood & Stone Pillars)
    const woodBridgeGeo = createWoodBridgeGeometry();
    this.instWoodBridges = new THREE.InstancedMesh(woodBridgeGeo, this.materials.woodBridge, 1600);
    this.instWoodBridges.receiveShadow = true;
    this.instWoodBridges.castShadow = true;

    const stoneBridgeGeo = createStoneBridgeGeometry();
    this.instStoneBridges = new THREE.InstancedMesh(stoneBridgeGeo, this.materials.stoneBridge, 1600);
    this.instStoneBridges.receiveShadow = true;
    this.instStoneBridges.castShadow = true;

    // 3D Water Stilt Platform Foundation for Houses & Buildings over water
    const waterPlatformGeo = createWaterPlatformGeometry();
    this.instWaterPlatforms = new THREE.InstancedMesh(waterPlatformGeo, this.materials.waterPlatform, 800);
    this.instWaterPlatforms.receiveShadow = true;
    this.instWaterPlatforms.castShadow = true;

    // Disable Frustum Culling on Instanced Meshes (Manual Viewport Spatial Grid Culling is active)
    this.instOakTrunks.frustumCulled = false;
    this.instOakLeaves.frustumCulled = false;
    this.instPineTrunks.frustumCulled = false;
    this.instPineLeaves.frustumCulled = false;
    this.instCacti.frustumCulled = false;
    this.instWalls.frustumCulled = false;
    this.instWoodWalls.frustumCulled = false;
    this.instMixedWalls.frustumCulled = false;
    this.instBoneWalls.frustumCulled = false;
    this.instWallsStage1.frustumCulled = false;
    this.instGatesClosed.frustumCulled = false;
    this.instGatesOpen.frustumCulled = false;
    this.instGatesStage1.frustumCulled = false;
    this.instWarehouses.frustumCulled = false;
    this.instWaterWells.frustumCulled = false;
    this.instHouseWalls.frustumCulled = false;
    this.instHouseRoofs.frustumCulled = false;
    this.instWoodHouseWalls.frustumCulled = false;
    this.instWoodHouseRoofs.frustumCulled = false;
    this.instStoneHouseWalls.frustumCulled = false;
    this.instStoneHouseRoofs.frustumCulled = false;
    this.instBoneHouseWalls.frustumCulled = false;
    this.instBoneHouseRoofs.frustumCulled = false;
    this.instHousePegs.frustumCulled = false;
    this.instHouseStage1.frustumCulled = false;
    this.instHouseStage2.frustumCulled = false;
    this.instHouseStage3.frustumCulled = false;
    this.instGrassTufts.frustumCulled = false;
    this.instWoodLogs.frustumCulled = false;
    this.instStoneItems.frustumCulled = false;
    this.instTorches.frustumCulled = false;
    this.instTorchesUnlit.frustumCulled = false;
    this.instWoodCampfires.frustumCulled = false;
    this.instCampfireFlames.frustumCulled = false;
    this.instRoads.frustumCulled = false;
    this.instRoadSnaps.frustumCulled = false;
    this.instWoodBridges.frustumCulled = false;
    this.instStoneBridges.frustumCulled = false;
    this.instWaterPlatforms.frustumCulled = false;

    this.instancedGroup = new THREE.Group();
    this.instancedGroup.add(
      this.instOakTrunks, this.instOakLeaves,
      this.instPineTrunks, this.instPineLeaves,
      this.instCacti, this.instWalls, this.instWoodWalls, this.instMixedWalls, this.instBoneWalls, this.instWallsStage1,
      this.instGatesClosed, this.instGatesOpen, this.instGatesStage1,
      this.instWarehouses, this.instWaterWells,
      this.instHouseWalls, this.instHouseRoofs,
      this.instWoodHouseWalls, this.instWoodHouseRoofs,
      this.instStoneHouseWalls, this.instStoneHouseRoofs,
      this.instBoneHouseWalls, this.instBoneHouseRoofs,
      this.instHousePegs, this.instHouseStage1,
      this.instHouseStage2, this.instHouseStage3,
      this.instGrassTufts,
      this.instWoodLogs, this.instStoneItems,
      this.instTorches, this.instTorchesUnlit,
      this.instWoodCampfires, this.instCampfireFlames,
      this.instRoads, this.instRoadSnaps,
      this.instWoodBridges, this.instStoneBridges, this.instWaterPlatforms
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
    if (this.scaleFactor === 0.25) {
      this.scaleFactor = 1.0;
    } else if (this.scaleFactor === 0.5) {
      this.scaleFactor = 0.25;
    } else if (this.scaleFactor === 0.75) {
      this.scaleFactor = 0.5;
    } else {
      this.scaleFactor = 0.75;
    }
    this.updateRendererResolution();
    return this.getResolutionName();
  }

  getResolutionName() {
    if (this.scaleFactor === 0.75) return "75%";
    if (this.scaleFactor === 0.5) return "50%";
    if (this.scaleFactor === 0.25) return "25%";
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

  toggleShadows() {
    this.shadowsEnabled = !this.shadowsEnabled;
    this.renderer.shadowMap.enabled = this.shadowsEnabled;
    this.sunLight.castShadow = this.shadowsEnabled;
    this.scene.traverse((obj) => {
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach(m => m.needsUpdate = true);
        else obj.material.needsUpdate = true;
      }
    });
    return this.getShadowsModeName();
  }

  getShadowsModeName() {
    return this.shadowsEnabled ? "ON" : "OFF";
  }

  isShadowsActive() {
    return this.shadowsEnabled;
  }

  toggleFullWorld() {
    this.renderFullWorld = !this.renderFullWorld;
    this.lastBuiltCamTileX = -9999;
    this.lastBuiltCamTileY = -9999;
    return this.renderFullWorld;
  }

  setFullWorld(enabled) {
    this.renderFullWorld = !!enabled;
    this.lastBuiltCamTileX = -9999;
    this.lastBuiltCamTileY = -9999;
  }

  getFullWorldModeName() {
    return this.renderFullWorld ? "FULL" : "CHUNK";
  }

  setTps(tps) { this.targetTps = tps; }
  getTps() { return this.targetTps; }
  setPaused(p) { this.isPaused = !!p; }
  isSimPaused() { return this.isPaused; }

  setCamera(x, y, zoom) {
    if (typeof x === "number" && !isNaN(x)) {
      this.camX = Math.max(0, Math.min(MAP_WIDTH, x));
    }
    if (typeof y === "number" && !isNaN(y)) {
      this.camY = Math.max(0, Math.min(MAP_HEIGHT, y));
    }
    if (typeof zoom === "number" && !isNaN(zoom)) {
      this.zoom = Math.max(0.08, Math.min(5.0, zoom));
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
      case TILE_ROAD_WATER: return 0.06; // Flat bridge deck over water
      case TILE_SAND:
      case TILE_ROAD_SAND: return 0.38;
      case TILE_FLOOR:
      case TILE_ROAD_GRASS:
      case TILE_ROAD_SNAP: return 1.0;
      case TILE_STONE:
      case TILE_ROAD_STONE: return 2.1;
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

  selectAt(screenX, screenY, entities, world = null) {
    return this.getEntityAtScreen(screenX, screenY, entities, world);
  }

  getEntityAtScreen(screenX, screenY, entities, world = null) {
    const rect = this.container.getBoundingClientRect();
    const w = rect.width || this.width;
    const h = rect.height || this.height;
    const ndcX = ((screenX - rect.left) / w) * 2 - 1;
    const ndcY = -((screenY - rect.top) / h) * 2 + 1;

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
    this.camera.near = -2000;
    this.camera.far = 4000;
    this.camera.updateProjectionMatrix();

    const distance = Math.max(100, viewSize * 2.0);
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

    // Keep the background void pure black
    this.scene.background.setHex(0x000000);

    const sunIntensity = k1.sunI + (k2.sunI - k1.sunI) * sAlpha;
    const ambIntensity = k1.ambI + (k2.ambI - k1.ambI) * sAlpha;

    this.sunLight.intensity = sunIntensity;
    this.ambientLight.intensity = ambIntensity;

    // --- Dynamic 24-Hour Solar / Lunar Celestial Orbit ---
    // Sunrise at 5.5h (East: +X), Noon at 12.0h (Zenith: high +Y), Sunset at 18.5h (West: -X)
    const isDaytime = timeOfDay >= 5.0 && timeOfDay <= 19.5;
    let lightOrbitX, lightOrbitY, lightOrbitZ;

    if (isDaytime) {
      const dayProgress = (timeOfDay - 5.0) / 14.5; // 0.0 at dawn -> 0.5 at noon -> 1.0 at dusk
      const sunAngle = dayProgress * Math.PI; // 0 (East) to PI (West)

      const sunRadius = 80.0;
      lightOrbitX = Math.cos(sunAngle) * sunRadius; // +80 (East) -> 0 -> -80 (West)
      lightOrbitY = Math.max(16.0, Math.sin(sunAngle) * 85.0 + 12.0); // 16 -> 97 -> 16
      lightOrbitZ = Math.sin(sunAngle) * 22.0 + 36.0;
    } else {
      const nightHours = timeOfDay >= 19.5 ? timeOfDay - 19.5 : timeOfDay + 4.5;
      const nightProgress = nightHours / 9.5;
      const moonAngle = nightProgress * Math.PI;

      const moonRadius = 70.0;
      lightOrbitX = -Math.cos(moonAngle) * moonRadius;
      lightOrbitY = Math.max(22.0, Math.sin(moonAngle) * 65.0 + 16.0);
      lightOrbitZ = Math.sin(moonAngle) * 16.0 + 36.0;
    }

    this.sunLight.position.set(this.camX + lightOrbitX, lightOrbitY, this.camY + lightOrbitZ);
    this.sunLight.target.position.set(this.camX, 0, this.camY);
    this.sunLight.target.updateMatrixWorld();

    // Update directional shadow camera frustum to encompass viewport
    const aspect = this.width / this.height;
    const viewSize = (28 / this.zoom);
    const maxSd = Math.max(55, viewSize * Math.max(aspect, 1.0) * 1.5);
    this.sunLight.shadow.camera.left = -maxSd;
    this.sunLight.shadow.camera.right = maxSd;
    this.sunLight.shadow.camera.top = maxSd;
    this.sunLight.shadow.camera.bottom = -maxSd;
    this.sunLight.shadow.camera.updateProjectionMatrix();

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

    // Rebuild only when camera moves outside the cached inner buffer margin (6 tiles buffer)
    const distCamX = Math.abs(curTileX - this.lastBuiltCamTileX);
    const distCamY = Math.abs(curTileY - this.lastBuiltCamTileY);
    const inBufferMargin = distCamX < 6 && distCamY < 6;

    if (inBufferMargin &&
        curZoom === this.lastBuiltZoom && curVisionZx === this.lastVisionZoneX &&
        curVisionZy === this.lastVisionZoneY && knownCount === this.lastVisionKnownCount &&
        this.lastBuiltFullWorld === this.renderFullWorld &&
        this.terrainGroup.children.length > 0) {
      return;
    }

    this.lastBuiltCamTileX = curTileX;
    this.lastBuiltCamTileY = curTileY;
    this.lastBuiltZoom = curZoom;
    this.lastVisionZoneX = curVisionZx;
    this.lastVisionZoneY = curVisionZy;
    this.lastVisionKnownCount = knownCount;
    this.lastBuiltFullWorld = this.renderFullWorld;

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
      [TILE_WATER]: { pos: [], uvs: [], colors: [] },
      [TILE_ROAD_GRASS]: { pos: [], uvs: [], colors: [] },
      [TILE_ROAD_SAND]: { pos: [], uvs: [], colors: [] },
      [TILE_ROAD_STONE]: { pos: [], uvs: [], colors: [] },
      [TILE_ROAD_WATER]: { pos: [], uvs: [], colors: [] },
      [TILE_ROAD_SNAP]: { pos: [], uvs: [], colors: [] }
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

        if (tType !== TILE_WATER && this.zoom >= 0.45) {
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
      mesh.receiveShadow = true;
      mesh.castShadow = false; // Ground plane receives shadows from creatures/buildings, avoiding duplicate shadow pass

      if (matKey === String(TILE_WATER)) {
        this.waterGroup.add(mesh);
      } else {
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

    if (!this.isPaused) {
      this.waterTime += dt * 1.0;

      const waterMat = this.materials[TILE_WATER];
      if (waterMat && waterMat.map) {
        waterMat.map.offset.x = (this.waterTime * 0.12) % 1;
        waterMat.map.offset.y = (this.waterTime * 0.08) % 1;
      }
      if (waterMat?.userData?.shader) {
        waterMat.userData.shader.uniforms.uWaterTime.value = this.waterTime;
      }
      this.waterGroup.position.y = Math.sin(this.waterTime * 2.8) * 0.035;

      // Update GPU Wind Vertex Sway on tree leaves & grass strictly synchronized with simulation ticks
      const currentTickVal = this.simTick || 0;
      if (this.materials.oakLeaves?.userData?.foliageShader) {
        this.materials.oakLeaves.userData.foliageShader.uniforms.uSimTick.value = currentTickVal;
      }
      if (this.materials.pineLeaves?.userData?.foliageShader) {
        this.materials.pineLeaves.userData.foliageShader.uniforms.uSimTick.value = currentTickVal;
      }
      if (this.materials.grassFoliage?.userData?.foliageShader) {
        this.materials.grassFoliage.userData.foliageShader.uniforms.uSimTick.value = currentTickVal;
      }
    }

    this.updateCamera();
    const nightGlow = this.updateDayNightLighting(world);

    let minTx, maxTx, minTy, maxTy;
    if (this.renderFullWorld) {
      minTx = 0;
      maxTx = MAP_WIDTH - 1;
      minTy = 0;
      maxTy = MAP_HEIGHT - 1;
    } else {
      const aspect = this.width / this.height;
      const viewSize = Math.min(65, 28 / this.zoom);
      const diagonal = Math.hypot(viewSize * aspect, viewSize);
      const radius = Math.min(65, Math.ceil(diagonal * 1.25) + 3);

      minTx = Math.max(0, Math.floor(this.camX - radius));
      maxTx = Math.min(MAP_WIDTH - 1, Math.ceil(this.camX + radius));
      minTy = Math.max(0, Math.floor(this.camY - radius));
      maxTy = Math.min(MAP_HEIGHT - 1, Math.ceil(this.camY + radius));
    }

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
    let woodLogCount = 0;
    let stoneItemCount = 0;
    let wallCount = 0;
    let woodWallCount = 0;
    let mixedWallCount = 0;
    let boneWallCount = 0;
    let wallStage1Count = 0;
    let gateClosedCount = 0;
    let gateOpenCount = 0;
    let gateStage1Count = 0;
    let warehouseCount = 0;
    let waterWellCount = 0;
    let houseCount = 0;
    let woodHouseCount = 0;
    let stoneHouseCount = 0;
    let boneHouseCount = 0;
    let pegsCount = 0;
    let stage1Count = 0;
    let stage2Count = 0;
    let stage3Count = 0;
    let torchCount = 0;
    let torchUnlitCount = 0;
    let woodCampfireCount = 0;
    let campfireFlameCount = 0;
    let roadCount = 0;
    let roadSnapCount = 0;
    let woodBridgeCount = 0;
    let stoneBridgeCount = 0;
    let waterPlatformCount = 0;

    const mMatrix = this._mMatrix;
    const scaleMatrix = this._scaleMatrix;
    const hoverTime = (time || 0) * 3.5;
    const floatBob = Math.sin(hoverTime) * 0.04;

    const occupiedHouseTiles = new Set();
    const clanGroups = new Map();

    if (world?.groups && Array.isArray(world.groups)) {
      for (let i = 0; i < world.groups.length; i++) {
        const g = world.groups[i];
        if (g && g.id) clanGroups.set(g.id, g);
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
      const isRoad = !e.properties.life && (!!e.properties.road || e.properties.name?.includes("Estrada") || e.properties.name?.includes("Rua") || e.properties.name?.includes("Encaixe"));
      const isCampfire = !e.properties.life && !isRoad && (!!e.properties.campfire || e.properties.name?.includes("Campfire") || e.properties.name?.includes("Fogueira"));
      const isTorch = !e.properties.life && !isRoad && !isCampfire && (!!e.properties.torch || e.properties.name?.includes("Torch") || e.properties.name?.includes("Tocha"));
      const isWarehouse = !e.properties.life && !isRoad && (!!e.properties.warehouse || e.properties.name?.includes("Armazém"));
      const isWell = !e.properties.life && !isRoad && !isWarehouse && (!!e.properties.well || !!e.properties.isWell || e.properties.name?.includes("Poço") || e.properties.name?.includes("Well"));
      const isDoor = !e.properties.life && !isWarehouse && !isWell && !isTorch && !isCampfire && !isRoad && !!e.properties.door;

      const isCactus = e.properties.species === "cactus" || e.properties.name?.toLowerCase().includes("cactus") || e.properties.name?.toLowerCase().includes("cacto");
      const isTree = !isCactus && (e.properties.species === "oak" || e.properties.species === "pine" || e.properties.species === "willow" || e.properties.species === "tree" || !!e.properties.tree || (r.skin && r.skin.toLowerCase().includes("tree")));
      const isPine = isTree && (e.properties.species === "pine" || (r.skin && r.skin.toLowerCase().includes("pine")));

      const isWoodLog = !e.properties.life && !isDoor && !isWarehouse && !isTorch && !isCampfire && !isRoad && (e.properties.resourceType === "wood" || e.properties.name?.includes("Wood Log") || e.properties.name?.includes("Madeira") || r.skin === "Item_Wood.png");
      const isStoneItem = !e.properties.life && !isDoor && !isWarehouse && !isTorch && !isCampfire && !isRoad && (e.properties.resourceType === "stone" || e.properties.name?.includes("Stone Block") || e.properties.name?.includes("Pedra"));
      const isItem = !e.properties.life && !isDoor && !isTorch && !isCampfire && !isRoad && (!!e.properties.edible || !!e.properties.resourceType || !!e.properties.germination || e.properties.species === "item" || !!e.properties.weapon || !!e.properties.armor || !!e.properties.tool || !!e.properties.material);

      const isHouse = !e.properties.life && !isItem && !isWoodLog && !isStoneItem && !isTree && !isCactus && !isWarehouse && !isWell && !isTorch && !isCampfire && !isRoad && (!!e.properties.house || (e.properties.species === "structure" && (r.skin === "Overworld_House.png" || e.properties.name?.includes("Casa") || e.properties.name?.includes("Ossuário") || e.properties.name?.includes("Castelo") || e.properties.name?.includes("Cabana"))));
      const isWall = !e.properties.life && !isDoor && !isHouse && !isWarehouse && !isWell && !isTorch && !isCampfire && !isRoad && !isItem && !isWoodLog && !isStoneItem && !isTree && !isCactus && (r.skin?.startsWith("Wall_") || e.properties.name?.includes("Muralha") || e.properties.name?.includes("Paliçada") || e.properties.name?.includes("Muro") || (e.properties.structure && !e.properties.edible && !e.properties.resourceType));

      const isPlantOrItem = isTree || isCactus || isWoodLog || isStoneItem || isTorch || isCampfire || isRoad;
      const isBuilding = isHouse || isWall || isDoor || isWarehouse || isWell;
      const surfaceH = isBuilding
        ? this.getTileSurfaceHeight(map, Math.floor(e.x), Math.floor(e.y))
        : this.getSurfaceElevation(map, isPlantOrItem ? e.x + 0.5 : e.x, isPlantOrItem ? e.y + 0.5 : e.y);

      // --- 3D WOOD LOGS (Volumetric Stacked Timber Logs) ---
      if (isWoodLog && woodLogCount < this.maxInstances) {
        const rotY = (((Math.imul(Math.floor(e.x * 10) ^ Math.imul(Math.floor(e.y * 10), 12345), 987654321) >>> 0) % 628) / 100.0);
        mMatrix.makeRotationY(rotY);
        mMatrix.setPosition(e.x + 0.5, surfaceH, e.y + 0.5);
        this.instWoodLogs.setMatrixAt(woodLogCount++, mMatrix);
      }
      // --- 3D STONE BLOCKS (Volumetric Chiseled Blocks) ---
      else if (isStoneItem && stoneItemCount < this.maxInstances) {
        const rotY = (((Math.imul(Math.floor(e.x * 10) ^ Math.imul(Math.floor(e.y * 10), 54321), 123456789) >>> 0) % 628) / 100.0);
        mMatrix.makeRotationY(rotY);
        mMatrix.setPosition(e.x + 0.5, surfaceH, e.y + 0.5);
        this.instStoneItems.setMatrixAt(stoneItemCount++, mMatrix);
      }
      // --- 3D OAK TREES (Natural Random Rotation) ---
      else if (isTree && !isPine && oakCount < this.maxInstances) {
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
      // --- 3D STANDING TORCHES (Lit vs Unlit Post) ---
      else if (isTorch) {
        const isLit = e.properties?.torch?.isLit !== false && (e.properties?.torch?.fuel || 0) > 0;
        mMatrix.identity();
        mMatrix.setPosition(e.x + 0.5, surfaceH, e.y + 0.5);
        if (isLit && torchCount < 600) {
          this.instTorches.setMatrixAt(torchCount++, mMatrix);
        } else if (!isLit && torchUnlitCount < 600) {
          this.instTorchesUnlit.setMatrixAt(torchUnlitCount++, mMatrix);
        }
      }
      // --- 3D WOOD CAMPFIRE (Cross-Stacked Wood Logs + Dynamic Flame) ---
      else if (isCampfire) {
        const curHour = world?.clock ? (world.clock.hour + (world.clock.minute || 0) / 60) : 12;
        const isNight = (curHour >= 17.5 || curHour < 5.8);
        const isLit = isNight && e.properties?.campfire?.isLit && (e.properties?.campfire?.fuel || 0) > 0;
        mMatrix.identity();
        mMatrix.setPosition(e.x + 0.5, surfaceH, e.y + 0.5);
        if (woodCampfireCount < 600) {
          this.instWoodCampfires.setMatrixAt(woodCampfireCount++, mMatrix);
        }
        if (isLit && campfireFlameCount < 600) {
          this.instCampfireFlames.setMatrixAt(campfireFlameCount++, mMatrix);
        }
      }
      // --- 3D PAVED ROADS, BRIDGES & SNAP POINTS (Adaptive Slopes, Ramps & Water Bridges) ---
      // --- 3D PAVED ROADS & SNAP POINTS (Adaptive Slopes & Natural Ramps across Land) ---
      else if (isRoad) {
        const tx = Math.floor(e.x);
        const ty = Math.floor(e.y);
        const tileType = map?.getTile ? map.getTile(tx, ty) : 0;
        if (tileType !== 2 && tileType !== 5) {
          // Adaptive slope & ramp rotation for natural hill grades
          const h00 = map?.getElevation ? map.getElevation(tx, ty) : surfaceH;
          const h10 = map?.getElevation ? map.getElevation(tx + 1, ty) : surfaceH;
          const h01 = map?.getElevation ? map.getElevation(tx, ty + 1) : surfaceH;
          const h11 = map?.getElevation ? map.getElevation(tx + 1, ty + 1) : surfaceH;
          const slopeX = (h10 + h11 - h00 - h01) * 0.5;
          const slopeZ = (h01 + h11 - h00 - h10) * 0.5;

          mMatrix.identity();
          this._rotEuler.set(-slopeZ * 0.45, 0, slopeX * 0.45, "YXZ");
          mMatrix.makeRotationFromEuler(this._rotEuler);
          mMatrix.setPosition(e.x + 0.5, surfaceH + 0.02, e.y + 0.5);

          const isSnap = !!e.properties?.road?.isSnapPoint || e.properties?.name?.includes("Encaixe") || e.properties?.name?.includes("Snap");
          if (isSnap && roadSnapCount < 1600) {
            this.instRoadSnaps.setMatrixAt(roadSnapCount++, mMatrix);
          } else if (!isSnap && roadCount < 1600) {
            this.instRoads.setMatrixAt(roadCount++, mMatrix);
          }
        }
      }
      // --- 3D WALLS (Stone, Wood, Mixed & Slope/Ramp Adaptive) ---
      else if (isWall) {
        const isCompleted = e.isConstructed !== false;
        const tx = Math.floor(e.x);
        const ty = Math.floor(e.y);
        const h00 = map?.getElevation ? map.getElevation(tx, ty) : surfaceH;
        const h10 = map?.getElevation ? map.getElevation(tx + 1, ty) : surfaceH;
        const h01 = map?.getElevation ? map.getElevation(tx, ty + 1) : surfaceH;
        const h11 = map?.getElevation ? map.getElevation(tx + 1, ty + 1) : surfaceH;
        const slopeX = (h10 + h11 - h00 - h01) * 0.5;
        const slopeZ = (h01 + h11 - h00 - h10) * 0.5;

        mMatrix.identity();
        this._rotEuler.set(-slopeZ * 0.40, 0, slopeX * 0.40, "YXZ");
        mMatrix.makeRotationFromEuler(this._rotEuler);
        mMatrix.setPosition(e.x + 0.5, surfaceH, e.y + 0.5);

        const wallStyle = e.wallStyle || e.properties?.wallStyle || "stone";
        if (isCompleted) {
          if (wallStyle === "bone" && boneWallCount < this.maxInstances) {
            this.instBoneWalls.setMatrixAt(boneWallCount++, mMatrix);
          } else if (wallStyle === "wood" && woodWallCount < this.maxInstances) {
            this.instWoodWalls.setMatrixAt(woodWallCount++, mMatrix);
          } else if (wallStyle === "mixed" && mixedWallCount < this.maxInstances) {
            this.instMixedWalls.setMatrixAt(mixedWallCount++, mMatrix);
          } else if (wallCount < this.maxInstances) {
            this.instWalls.setMatrixAt(wallCount++, mMatrix);
          }
        } else if (!isCompleted && wallStage1Count < this.maxInstances) {
          this.instWallsStage1.setMatrixAt(wallStage1Count++, mMatrix);
        }
      }
      // --- 3D CENTRAL CLAN WAREHOUSE (Stockpile Building) ---
      else if (isWarehouse) {
        occupiedHouseTiles.add(`${Math.floor(e.x)}_${Math.floor(e.y)}`);
        const isCompleted = e.properties?.warehouse ? (e.properties.warehouse.isCompleted !== false) : true;
        mMatrix.identity();
        mMatrix.makeRotationY(0);
        mMatrix.setPosition(e.x + 0.5, surfaceH, e.y + 0.5);

        if (isCompleted && warehouseCount < 200) {
          this.instWarehouses.setMatrixAt(warehouseCount++, mMatrix);
        } else if (!isCompleted && stage2Count < 400) {
          this.instHouseStage2.setMatrixAt(stage2Count++, mMatrix);
        }
      }
      // --- 3D ANCIENT STONE WATER WELL ---
      else if (isWell) {
        occupiedHouseTiles.add(`${Math.floor(e.x)}_${Math.floor(e.y)}`);
        const isCompleted = e.properties?.well ? (e.properties.well.isCompleted !== false) : true;
        mMatrix.identity();
        mMatrix.setPosition(e.x + 0.5, surfaceH, e.y + 0.5);

        if (isCompleted && waterWellCount < 200) {
          this.instWaterWells.setMatrixAt(waterWellCount++, mMatrix);
        } else if (!isCompleted && stage1Count < 400) {
          this.instHouseStage1.setMatrixAt(stage1Count++, mMatrix);
        }
      }
      // --- 3D FORTIFIED GATES (Wood & Iron Archway + Open/Closed States) ---
      else if (isDoor) {
        const isCompleted = e.isConstructed !== false;
        const isOpen = !!e.properties?.door?.isOpen;
        const tx = Math.floor(e.x);
        const ty = Math.floor(e.y);

        let gateRotY = 0;
        const hasLeftWall = globalWallCoords?.has?.(`${tx - 1},${ty}`);
        const hasRightWall = globalWallCoords?.has?.(`${tx + 1},${ty}`);
        const hasTopWall = globalWallCoords?.has?.(`${tx},${ty - 1}`);
        const hasBottomWall = globalWallCoords?.has?.(`${tx},${ty + 1}`);

        if ((hasTopWall || hasBottomWall) && !(hasLeftWall || hasRightWall)) {
          gateRotY = Math.PI / 2;
        }

        mMatrix.identity();
        mMatrix.makeRotationY(gateRotY);
        mMatrix.setPosition(e.x + 0.5, surfaceH, e.y + 0.5);

        if (!isCompleted && gateStage1Count < 400) {
          this.instGatesStage1.setMatrixAt(gateStage1Count, mMatrix);
          gateStage1Count++;
        } else if (isOpen && gateOpenCount < 400) {
          this.instGatesOpen.setMatrixAt(gateOpenCount, mMatrix);
          gateOpenCount++;
        } else if (gateClosedCount < 400) {
          this.instGatesClosed.setMatrixAt(gateClosedCount, mMatrix);
          gateClosedCount++;
        }
      }
      // --- 3D HOUSES & PROGRESSIVE MULTI-STAGE CONSTRUCTION ---
      else if (isHouse) {
        occupiedHouseTiles.add(`${Math.floor(e.x)}_${Math.floor(e.y)}`);
        const h = e.properties.house;
        const isCompleted = h ? (h.isCompleted !== false) : true;
        const totalCost = (h?.woodCost || 3) + (h?.stoneCost || 2) + (h?.boneCost || 0);
        const curMaterials = (h?.woodCurrent || 0) + (h?.stoneCurrent || 0) + (h?.boneCurrent || 0);
        const progress = isCompleted ? 1.0 : (curMaterials / Math.max(1, totalCost));

        // Deterministic Cardinal Rotation per House (0, 90, 180, 270 deg)
        const houseRot = (((Math.imul(Math.floor(e.x) ^ Math.imul(Math.floor(e.y), 32452843), 8253729) >>> 0) % 4)) * (Math.PI / 2);
        // Random Height Variation per House (0.85x to 1.25x height)
        const heightScale = 0.85 + (((Math.imul(Math.floor(e.x) ^ Math.imul(Math.floor(e.y), 198491317), 445582319) >>> 0) % 100) / 100.0) * 0.40;

        mMatrix.makeRotationY(houseRot);
        scaleMatrix.makeScale(1.0, heightScale, 1.0);
        mMatrix.multiply(scaleMatrix);
        mMatrix.setPosition(e.x + 0.5, surfaceH, e.y + 0.5);

        const htx = Math.floor(e.x);
        const hty = Math.floor(e.y);
        const isHouseOverWater = (map?.getTile ? map.getTile(htx, hty) === 2 : false) || (!!h?.isPlatform);
        if (isHouseOverWater && waterPlatformCount < 800) {
          const platMat = new THREE.Matrix4();
          platMat.setPosition(e.x + 0.5, 0.08, e.y + 0.5);
          this.instWaterPlatforms.setMatrixAt(waterPlatformCount++, platMat);
        }

        if (isCompleted) {
          const houseStyle = h?.style || "mixed";
          if (houseStyle === "bone" && boneHouseCount < 400) {
            this.instBoneHouseWalls.setMatrixAt(boneHouseCount, mMatrix);
            this.instBoneHouseRoofs.setMatrixAt(boneHouseCount, mMatrix);
            boneHouseCount++;
          } else if (houseStyle === "wood" && woodHouseCount < 400) {
            this.instWoodHouseWalls.setMatrixAt(woodHouseCount, mMatrix);
            this.instWoodHouseRoofs.setMatrixAt(woodHouseCount, mMatrix);
            woodHouseCount++;
          } else if (houseStyle === "stone" && stoneHouseCount < 400) {
            this.instStoneHouseWalls.setMatrixAt(stoneHouseCount, mMatrix);
            this.instStoneHouseRoofs.setMatrixAt(stoneHouseCount, mMatrix);
            stoneHouseCount++;
          } else if (houseCount < 400) {
            this.instHouseWalls.setMatrixAt(houseCount, mMatrix);
            this.instHouseRoofs.setMatrixAt(houseCount, mMatrix);
            houseCount++;
          }

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
            // Stage 1: Foundation + 4 corner posts
            this.instHouseStage1.setMatrixAt(stage1Count++, mMatrix);
          } else if (progress < 0.68 && stage2Count < 400) {
            // Stage 2: Foundation + posts + half walls
            this.instHouseStage2.setMatrixAt(stage2Count++, mMatrix);
          } else if (stage3Count < 400) {
            // Stage 3: Full walls + roof rafters
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
            dithering: true,
            transparent: true,
            alphaTest: 0.08,
            side: THREE.DoubleSide
          });
          applyRetroDitherToMaterial(mat);
          sprite = new THREE.Mesh(this.billboardGeo, mat);
          sprite.castShadow = true;
          sprite.receiveShadow = true;
          sprite.customDepthMaterial = new THREE.MeshDepthMaterial({
            depthPacking: THREE.RGBADepthPacking,
            map: tex,
            alphaTest: 0.08
          });
          sprite.renderOrder = 10;
          sprite.userData = { entityId: e.id };
          this.entityGroup.add(sprite);
          this.entitySprites.set(e.id, sprite);
        } else if (sprite.material.map !== tex) {
          sprite.material.map = tex;
          sprite.material.needsUpdate = true;
          if (sprite.customDepthMaterial) {
            sprite.customDepthMaterial.map = tex;
            sprite.customDepthMaterial.needsUpdate = true;
          }
        }

        const isSleeping = !!e.properties?.life?.isSleeping;
        const isStandingTorch = !!e.properties?.torch;
        if (isStandingTorch) {
          sprite.scale.set(0.68, 0.68, 0.68);
          sprite.position.set(e.x + 0.5, surfaceH, e.y + 0.5);
          sprite.rotation.y = this.fixedRotationY;
          sprite.rotation.z = 0;
          sprite.castShadow = false; // Do not occlude own light source
          sprite.receiveShadow = false;
        } else if (isItem) {
          sprite.scale.set(0.48, 0.48, 0.48);
          sprite.position.set(e.x, surfaceH, e.y);
          sprite.rotation.y = this.fixedRotationY;
          sprite.rotation.z = 0;
          sprite.castShadow = true;
          sprite.receiveShadow = true;
        } else if (isSleeping) {
          // Lying down flat on the ground while sleeping
          sprite.scale.set(0.65, 0.65, 0.65);
          sprite.position.set(e.x, surfaceH + 0.10, e.y);
          sprite.rotation.y = this.fixedRotationY;
          sprite.rotation.z = Math.PI / 2;
        } else {
          // Compact 2/3 scale for creatures
          sprite.scale.set(0.72, 0.72, 0.72);
          sprite.position.set(e.x, surfaceH, e.y);
          sprite.rotation.y = this.fixedRotationY;
          sprite.rotation.z = 0;
        }

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
    if (nightGlow > 0.02) {
      let candidateCount = 0;
      const focusX = (this.selectedEntityId > 0 && selectedPos) ? selectedPos.x : this.camX;
      const focusY = (this.selectedEntityId > 0 && selectedPos) ? selectedPos.z : this.camY;
      const maxPool = this.lightCandidatesPool.length;

      for (let i = 0; i < visibleEntities.length && candidateCount < maxPool; i++) {
        const e = visibleEntities[i];
        if (!e || e.destroyed) continue;

        const sz = currentZoneSize || 8;

        // 1. Standing Furniture Torches on Ground (1/4 Zone Radius, Soft Non-Blinding Glow)
        const isStandingTorch = !!e.properties?.torch;
        if (isStandingTorch && e.properties?.torch?.isLit !== false && (e.properties?.torch?.fuel || 0) > 0) {
          const sH = this.getSurfaceElevation(map, e.x + 0.5, e.y + 0.5);
          const dx = (e.x + 0.5) - focusX;
          const dy = (e.y + 0.5) - focusY;
          const c = this.lightCandidatesPool[candidateCount++];
          c.x = e.x + 0.5;
          c.y = sH + 1.20;
          c.z = e.y + 0.5;
          c.color = 0xffa040;
          c.distance = Math.max(2.5, sz * 0.38); // 1/4 Zone Light Radius
          c.decay = 1.4;
          c.intensity = nightGlow * 1.8;
          c.priority = 1; // Top priority for placed torches
          c.distSq = dx * dx + dy * dy;
          continue;
        }

        // 2. Wood Campfire (1 Full Zone Radius, Warm Radiant Firelight)
        const isCampfire = !!e.properties?.campfire;
        if (isCampfire && e.properties?.campfire?.isLit && (e.properties?.campfire?.fuel || 0) > 0) {
          const sH = this.getSurfaceElevation(map, e.x + 0.5, e.y + 0.5);
          const dx = (e.x + 0.5) - focusX;
          const dy = (e.y + 0.5) - focusY;
          const c = this.lightCandidatesPool[candidateCount++];
          c.x = e.x + 0.5;
          c.y = sH + 0.40;
          c.z = e.y + 0.5;
          c.color = 0xff7b18;
          c.distance = Math.max(8.0, sz * 1.45); // 1 Full Zone Light Radius
          c.decay = 1.0;
          c.intensity = nightGlow * 6.5;
          c.priority = 0; // Highest priority for central campfires
          c.distSq = dx * dx + dy * dy;
          continue;
        }

        // 3. Torches Carried by Intelligent Creatures (MainHand or OffHand - 1/4 Zone Radius)
        const isIntelligent = !!e.properties?.brain || !!e.properties?.group_member;
        if (isIntelligent) {
          const leftTorch = e.properties.arm_left?.heldItem?.resourceType === "torch" && (e.properties.arm_left?.heldItem?.fuel || 0) > 0;
          const rightTorch = e.properties.arm_right?.heldItem?.resourceType === "torch" && (e.properties.arm_right?.heldItem?.fuel || 0) > 0;
          const heldTorch = e.properties.heldItem?.resourceType === "torch" && (e.properties.heldItem?.fuel || 0) > 0;
          if (leftTorch || rightTorch || heldTorch) {
            const sH = this.getSurfaceElevation(map, e.x, e.y);
            const dx = e.x - focusX;
            const dy = e.y - focusY;
            const c = this.lightCandidatesPool[candidateCount++];
            c.x = e.x;
            c.y = sH + 0.95;
            c.z = e.y;
            c.color = 0xffaa44;
            c.distance = Math.max(2.2, sz * 0.32);
            c.decay = 1.5;
            c.intensity = nightGlow * 1.6;
            c.priority = e.id === this.selectedEntityId ? 0 : 2;
            c.distSq = dx * dx + dy * dy;
          }
          continue;
        }

        // 4. Wall Torches / Watchtower Torch Brackets
        const isWall = e.properties?.structure && !e.properties?.house && !e.properties?.door && !!e.properties?.torch;
        if (isWall) {
          const sH = this.getTileSurfaceHeight(map, Math.floor(e.x), Math.floor(e.y));
          const dx = (e.x + 0.5) - focusX;
          const dy = (e.y + 0.5) - focusY;
          const c = this.lightCandidatesPool[candidateCount++];
          c.x = e.x + 0.5;
          c.y = sH + 1.60;
          c.z = e.y + 0.5;
          c.color = 0xffb555;
          c.distance = 10.0;
          c.decay = 1.6;
          c.intensity = nightGlow * 2.0;
          c.priority = 3;
          c.distSq = dx * dx + dy * dy;
        }
      }

      // Sort candidate lights in-place up to candidateCount
      const activeCandidates = this.lightCandidatesPool.slice(0, candidateCount);
      activeCandidates.sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return a.distSq - b.distSq;
      });

      for (let i = 0; i < activeCandidates.length && lightIdx < this.maxNightLights; i++) {
        const c = activeCandidates[i];
        const pl = this.nightLightPool[lightIdx];
        pl.color.setHex(c.color);
        pl.distance = c.distance;
        pl.decay = c.decay;
        pl.intensity = c.intensity;
        pl.position.set(c.x, c.y, c.z);
        lightIdx++;
      }
    }

    // Turn off unused lights in pool
    while (lightIdx < this.maxNightLights) {
      const pl = this.nightLightPool[lightIdx++];
      pl.intensity = 0;
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

    this.instWoodLogs.count = woodLogCount;
    this.instWoodLogs.instanceMatrix.needsUpdate = true;

    this.instStoneItems.count = stoneItemCount;
    this.instStoneItems.instanceMatrix.needsUpdate = true;

    this.instWalls.count = wallCount;
    this.instWalls.instanceMatrix.needsUpdate = true;
    this.instWoodWalls.count = woodWallCount;
    this.instWoodWalls.instanceMatrix.needsUpdate = true;
    this.instMixedWalls.count = mixedWallCount;
    this.instMixedWalls.instanceMatrix.needsUpdate = true;
    this.instBoneWalls.count = boneWallCount;
    this.instBoneWalls.instanceMatrix.needsUpdate = true;
    this.instWallsStage1.count = wallStage1Count;
    this.instWallsStage1.instanceMatrix.needsUpdate = true;

    this.instGatesClosed.count = gateClosedCount;
    this.instGatesClosed.instanceMatrix.needsUpdate = true;
    this.instGatesOpen.count = gateOpenCount;
    this.instGatesOpen.instanceMatrix.needsUpdate = true;
    this.instGatesStage1.count = gateStage1Count;
    this.instGatesStage1.instanceMatrix.needsUpdate = true;

    this.instWarehouses.count = warehouseCount;
    this.instWarehouses.instanceMatrix.needsUpdate = true;

    this.instWaterWells.count = waterWellCount;
    this.instWaterWells.instanceMatrix.needsUpdate = true;

    this.instHouseWalls.count = houseCount;
    this.instHouseWalls.instanceMatrix.needsUpdate = true;
    this.instHouseRoofs.count = houseCount;
    this.instHouseRoofs.instanceMatrix.needsUpdate = true;

    this.instWoodHouseWalls.count = woodHouseCount;
    this.instWoodHouseWalls.instanceMatrix.needsUpdate = true;
    this.instWoodHouseRoofs.count = woodHouseCount;
    this.instWoodHouseRoofs.instanceMatrix.needsUpdate = true;

    this.instStoneHouseWalls.count = stoneHouseCount;
    this.instStoneHouseWalls.instanceMatrix.needsUpdate = true;
    this.instStoneHouseRoofs.count = stoneHouseCount;
    this.instStoneHouseRoofs.instanceMatrix.needsUpdate = true;

    this.instBoneHouseWalls.count = boneHouseCount;
    this.instBoneHouseWalls.instanceMatrix.needsUpdate = true;
    this.instBoneHouseRoofs.count = boneHouseCount;
    this.instBoneHouseRoofs.instanceMatrix.needsUpdate = true;

    this.instHousePegs.count = pegsCount;
    this.instHousePegs.instanceMatrix.needsUpdate = true;

    this.instHouseStage1.count = stage1Count;
    this.instHouseStage1.instanceMatrix.needsUpdate = true;

    this.instHouseStage2.count = stage2Count;
    this.instHouseStage2.instanceMatrix.needsUpdate = true;

    this.instHouseStage3.count = stage3Count;
    this.instHouseStage3.instanceMatrix.needsUpdate = true;

    this.instTorches.count = torchCount;
    this.instTorches.instanceMatrix.needsUpdate = true;
    this.instTorchesUnlit.count = torchUnlitCount;
    this.instTorchesUnlit.instanceMatrix.needsUpdate = true;

    this.instWoodCampfires.count = woodCampfireCount;
    this.instWoodCampfires.instanceMatrix.needsUpdate = true;
    this.instCampfireFlames.count = campfireFlameCount;
    this.instCampfireFlames.instanceMatrix.needsUpdate = true;

    this.instRoads.count = roadCount;
    this.instRoads.instanceMatrix.needsUpdate = true;
    this.instRoadSnaps.count = roadSnapCount;
    this.instRoadSnaps.instanceMatrix.needsUpdate = true;

    this.instWoodBridges.count = woodBridgeCount;
    this.instWoodBridges.instanceMatrix.needsUpdate = true;
    this.instStoneBridges.count = stoneBridgeCount;
    this.instStoneBridges.instanceMatrix.needsUpdate = true;
    this.instWaterPlatforms.count = waterPlatformCount;
    this.instWaterPlatforms.instanceMatrix.needsUpdate = true;

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
