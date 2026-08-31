// =============================================================================
// Brutopolis Chronicles - 3D Isometric Tycoon Engine (Volumetric 3D Models)
// =============================================================================

import * as THREE from "https://esm.sh/three@0.160.0";
import { ASSET_DATA } from "./assets_data.js";
import { MAP_WIDTH, MAP_HEIGHT, TILE_FLOOR, TILE_MOUNTAIN, TILE_WATER, TILE_SAND, TILE_STONE, TILE_VOID, TILE_ROAD_GRASS, TILE_ROAD_SAND, TILE_ROAD_STONE } from "./world_gen.js";
import { globalWallCoords, resolveWallSkin, getEntitiesInViewport, getEntityById } from "./engine.js";
import { getClanBlueprintTiles, currentZoneSize } from "./properties.js";

// Cache for raw asset images
const textureCache = new Map();
const billboardMatCache = new Map();
const depthMatCache = new Map();
const uiMatCache = new Map();
const rawImages = new Map();

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
  { t: 0.0,  sun: 0x3d5475, amb: 0x0c1422, bg: 0x0c1422, sunI: 0.20, ambI: 0.18 }, // Midnight
  { t: 4.5,  sun: 0x486488, amb: 0x101a2c, bg: 0x101a2c, sunI: 0.24, ambI: 0.22 }, // Pre-dawn
  { t: 5.5,  sun: 0xff7b39, amb: 0x7a4860, bg: 0x7a4860, sunI: 0.70, ambI: 0.45 }, // Sunrise start
  { t: 6.5,  sun: 0xffa048, amb: 0xb07882, bg: 0xb07882, sunI: 0.95, ambI: 0.60 }, // Golden dawn
  { t: 7.5,  sun: 0xffd285, amb: 0xd0b8ae, bg: 0xd0b8ae, sunI: 1.25, ambI: 0.75 }, // Early morning
  { t: 9.0,  sun: 0xfffaea, amb: 0xdde8f5, bg: 0xdde8f5, sunI: 1.40, ambI: 0.82 }, // Morning
  { t: 12.0, sun: 0xffffff, amb: 0xe5f0ff, bg: 0xe5f0ff, sunI: 1.55, ambI: 0.85 }, // Solar Noon
  { t: 15.5, sun: 0xfffaea, amb: 0xdde8f5, bg: 0xdde8f5, sunI: 1.40, ambI: 0.82 }, // Afternoon
  { t: 17.0, sun: 0xffab4c, amb: 0xb57870, bg: 0xb57870, sunI: 1.10, ambI: 0.68 }, // Sunset start
  { t: 18.2, sun: 0xff6a35, amb: 0x8a4565, bg: 0x8a4565, sunI: 0.80, ambI: 0.52 }, // Sunset golden hour
  { t: 19.5, sun: 0x623d72, amb: 0x221634, bg: 0x221634, sunI: 0.38, ambI: 0.28 }, // Dusk twilight
  { t: 21.0, sun: 0x3d5475, amb: 0x0f1828, bg: 0x0f1828, sunI: 0.22, ambI: 0.20 }, // Nightfall
  { t: 24.0, sun: 0x3d5475, amb: 0x0c1422, bg: 0x0c1422, sunI: 0.20, ambI: 0.18 }  // Wrap to midnight
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
  if (!e || !e.properties) return null;
  // Items, plants, structures and inanimate objects must NEVER display creature emotes
  if (!e.properties.life || !e.properties.brain) return null;
  if (e.properties.life?.isSleeping) return "Emote_Sleeping.png";
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
  const isItem = !e.properties?.life && (!!e.properties?.edible || !!e.properties?.resourceType || !!e.properties?.germination || e.properties?.species === "item" || !!e.properties?.weapon || !!e.properties?.armor || !!e.properties?.tool || !!e.properties?.material || !!e.properties?.lifespan);
  const isDoor = !!e.properties?.door;
  const isHouse = !!e.properties?.house || r?.skin === "Overworld_House.png" || e.properties?.name?.includes("Casa");
  const isWall = !isDoor && !isHouse && (e.properties?.structure || r?.skin?.startsWith("Wall_") || e.properties?.name?.includes("Muralha") || e.properties?.name?.includes("Wall"));
  const isCactus = e.properties?.species === "cactus" || e.properties?.name?.toLowerCase().includes("cactus") || e.properties?.name?.toLowerCase().includes("cacto");
  const isTree = !isCactus && (e.properties?.species === "oak" || e.properties?.species === "pine" || e.properties?.species === "willow" || e.properties?.species === "tree" || !!e.properties?.tree || (r?.skin && r?.skin.toLowerCase().includes("tree")));

  if (isTree) return { radius: 1.1, h: 2.6, yBottom: 0.0 };
  if (isHouse) {
    const floors = e.properties?.house?.maxFloors || e.properties?.house?.floors?.length || 2;
    const fpW = e.properties?.house?.footprintW || 1;
    const fpH = e.properties?.house?.footprintH || 1;
    const fpMax = Math.max(fpW, fpH);
    return { radius: Math.max(1.2, fpMax * 0.7 + floors * 0.2), h: 1.6 + floors * 1.25, yBottom: 0.0 };
  }
  if (isCactus) return { radius: 0.9, h: 2.0, yBottom: 0.0 };
  if (isWall) return { radius: 0.75, h: 1.5, yBottom: 0.0 };
  if (isItem) return { radius: 0.65, h: 0.9, yBottom: 0.0 }; // Generous 3D clickable radius for ground items
  return { radius: 0.55, h: 1.1, yBottom: 0.0 }; // Compact creatures
}

// ---------------------------------------------------------------------------
// Texture Registry & Anisotropic Filtering Engine
// ---------------------------------------------------------------------------

export const REGISTERED_TEXTURES = new Set();
let currentGlobalAnisotropy = 4;

export function applyTextureAnisotropy(tex, aniso = currentGlobalAnisotropy) {
  if (!tex || !tex.isTexture) return;
  REGISTERED_TEXTURES.add(tex);
  const level = Math.max(1, Math.min(16, typeof aniso === "number" ? aniso : parseInt(aniso, 10) || 1));
  tex.anisotropy = level;
  if (level > 1) {
    tex.generateMipmaps = true;
    tex.minFilter = THREE.NearestMipmapLinearFilter;
  } else {
    tex.generateMipmaps = false;
    tex.minFilter = THREE.NearestFilter;
  }
  tex.needsUpdate = true;
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

        if (r > 60 || g > 60 || b > 60) {
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

  applyTextureAnisotropy(tex);
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

    const ditherCode = `
      #include <dithering_fragment>
      // Controlled retro Bayer dithering on colors, 3D lighting gradients and shadow falloffs
      float bayer = (getBayer4x4(gl_FragCoord.xy) - 0.5) * ${intensity.toFixed(2)};
      float dSteps = ${steps.toFixed(1)};
      gl_FragColor.rgb = floor(gl_FragColor.rgb * dSteps + bayer + 0.5) / dSteps;
    `;

    if (shader.fragmentShader.includes('#include <dithering_fragment>')) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <dithering_fragment>',
        ditherCode
      );
    } else if (shader.fragmentShader.includes('gl_FragColor = vec4( outgoingLight, diffuseColor.a );')) {
      shader.fragmentShader = shader.fragmentShader.replace(
        'gl_FragColor = vec4( outgoingLight, diffuseColor.a );',
        `gl_FragColor = vec4( outgoingLight, diffuseColor.a );
        float bayer = (getBayer4x4(gl_FragCoord.xy) - 0.5) * ${intensity.toFixed(2)};
        float dSteps = ${steps.toFixed(1)};
        gl_FragColor.rgb = floor(gl_FragColor.rgb * dSteps + bayer + 0.5) / dSteps;`
      );
    }
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
// 3D Procedural Geometries (Saguaro Cactus, Natural Grass, Houses)
// ---------------------------------------------------------------------------

function mergeBufferGeometries(geometries) {
  const nonIndexed = geometries.map(g => (g && g.geo ? g.geo : g)).map(g => (g.index ? g.toNonIndexed() : g));

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

function createNaturalGrassGeometry(w = 0.44, h = 0.38) {
  const p1 = new THREE.PlaneGeometry(w, h);
  p1.translate(0, h * 0.36, 0);

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

// -----------------------------------------------------------------------------
// 10 Unique Residential Architectural Styles (Geometries)
// -----------------------------------------------------------------------------

// -----------------------------------------------------------------------------
// 10 Unique Residential Architectural Styles (Separate Wall & Roof Geometries)
// -----------------------------------------------------------------------------

// -----------------------------------------------------------------------------
// -----------------------------------------------------------------------------
// 10 Unique Multi-Story Residential Architectural Styles (True-Scale Geometries)
// -----------------------------------------------------------------------------

function createCleanPitchedRoof(w, d, h) {
  return createPitchedRoofGeometry(w, d, h);
}

// 0. Timber Cabin (2-Story, 2x1 Footprint: X [0.05..1.95], Z [0.05..0.95])
function createWoodCabinWallGeo() {
  const parts = [];
  
  const plinth = new THREE.BoxGeometry(1.90, 0.20, 0.90); plinth.translate(0, 0.10, 0); parts.push(plinth);
  const f1 = new THREE.BoxGeometry(1.85, 1.10, 0.85); f1.translate(0, 0.75, 0); parts.push(f1);
  const f2 = new THREE.BoxGeometry(1.90, 1.00, 0.90); f2.translate(0, 1.80, 0); parts.push(f2);
  const chimney = new THREE.BoxGeometry(0.35, 2.80, 0.35); chimney.translate(0.75, 1.40, -0.25); parts.push(chimney);
  return mergeBufferGeometries(parts);
}
function createWoodCabinRoofGeo() {
  const roof = createCleanPitchedRoof(1.92, 0.92, 0.85);
  roof.translate(0, 2.30, 0);
  return roof;
}

// 1. Stone Masonry Cottage (2-Story, 2x2 Footprint: X [0.05..1.95], Z [0.05..1.95])
function createStoneCottageWallGeo() {
  const parts = [];
  
  const plinth = new THREE.BoxGeometry(1.90, 0.22, 1.90); plinth.translate(0, 0.11, 0); parts.push(plinth);
  const f1 = new THREE.BoxGeometry(1.85, 1.10, 1.85); f1.translate(0, 0.77, 0); parts.push(f1);
  const f2 = new THREE.BoxGeometry(1.80, 1.00, 1.80); f2.translate(0, 1.82, 0); parts.push(f2);
  const chimney = new THREE.BoxGeometry(0.40, 2.90, 0.40); chimney.translate(-0.70, 1.45, 0.65); parts.push(chimney);
  return mergeBufferGeometries(parts);
}
function createStoneCottageRoofGeo() {
  const roof = createCleanPitchedRoof(1.92, 1.92, 0.95, false);
  roof.translate(0, 2.32, 0);
  return roof;
}

// 2. Thatched Hut / Roundhouse (2-Story, 1x1x2 Footprint: X [0.05..0.95], Z [0.05..0.95])
function createThatchedHutWallGeo() {
  const parts = [];
  
  const footing = new THREE.CylinderGeometry(0.44, 0.46, 0.15, 16); footing.translate(0, 0.075, 0); parts.push(footing);
  const f1 = new THREE.CylinderGeometry(0.42, 0.44, 0.95, 16); f1.translate(0, 0.625, 0); parts.push(f1);
  const f2 = new THREE.CylinderGeometry(0.40, 0.42, 0.90, 16); f2.translate(0, 1.55, 0); parts.push(f2);
  return mergeBufferGeometries(parts);
}
function createThatchedHutRoofGeo() {
  
  const roof = new THREE.ConeGeometry(0.55, 0.85, 16); roof.translate(0, 2.425, 0);
  return roof;
}

// 3. Heavy Log Lodge (3-Story, 2x2x3 Footprint: X [0.05..1.95], Z [0.05..1.95])
function createLogLodgeWallGeo() {
  const parts = [];
  
  const stoneBase = new THREE.BoxGeometry(1.90, 0.22, 1.90); stoneBase.translate(0, 0.11, 0); parts.push(stoneBase);
  const f1 = new THREE.BoxGeometry(1.85, 1.00, 1.85); f1.translate(0, 0.72, 0); parts.push(f1);
  const f2 = new THREE.BoxGeometry(1.88, 1.00, 1.88); f2.translate(0, 1.72, 0); parts.push(f2);
  const f3 = new THREE.BoxGeometry(1.70, 0.90, 1.70); f3.translate(0, 2.67, 0); parts.push(f3);
  const chim1 = new THREE.BoxGeometry(0.35, 3.80, 0.35); chim1.translate(0.70, 1.90, -0.45); parts.push(chim1);
  return mergeBufferGeometries(parts);
}
function createLogLodgeRoofGeo() {
  const roof = createCleanPitchedRoof(1.92, 1.92, 0.95, false);
  roof.translate(0, 3.12, 0);
  return roof;
}

// 4. Half-Timbered Tudor House (2-Story, 2x1x2 Footprint: X [0.05..1.95], Z [0.05..0.95])
function createHalfTimberedWallGeo() {
  const parts = [];
  
  const plinth = new THREE.BoxGeometry(1.90, 0.18, 0.90); plinth.translate(0, 0.09, 0); parts.push(plinth);
  const f1 = new THREE.BoxGeometry(1.85, 1.10, 0.85); f1.translate(0, 0.73, 0); parts.push(f1);
  const f2 = new THREE.BoxGeometry(1.90, 1.00, 0.90); f2.translate(0, 1.78, 0); parts.push(f2);
  const chimney = new THREE.BoxGeometry(0.35, 2.90, 0.35); chimney.translate(0.75, 1.45, 0); parts.push(chimney);
  return mergeBufferGeometries(parts);
}
function createHalfTimberedRoofGeo() {
  const roof = createCleanPitchedRoof(1.92, 0.92, 0.90);
  roof.translate(0, 2.28, 0);
  return roof;
}

// 5. Mud-Brick Adobe / Pueblo (2-Story, 2x2x2 Footprint: X [0.05..1.95], Z [0.05..1.95])
function createMudBrickAdobeWallGeo() {
  const parts = [];
  
  const f1 = new THREE.BoxGeometry(1.90, 1.15, 1.90); f1.translate(0, 0.575, 0); parts.push(f1);
  const f2 = new THREE.BoxGeometry(1.30, 1.00, 1.30); f2.translate(-0.25, 1.65, -0.25); parts.push(f2);
  return mergeBufferGeometries(parts);
}
function createMudBrickAdobeRoofGeo() {
  const parts = [];
  
  const p1 = new THREE.BoxGeometry(1.92, 0.12, 1.92); p1.translate(0, 1.21, 0); parts.push(p1);
  const p2 = new THREE.BoxGeometry(1.34, 0.12, 1.34); p2.translate(-0.25, 2.21, -0.25); parts.push(p2);
  return mergeBufferGeometries(parts);
}

// 6. Alpine Stilt House (3-Story, 2x2x3 Footprint: X [0.05..1.95], Z [0.05..1.95])
function createMountainStiltWallGeo() {
  const parts = [];
  
  const stilt = new THREE.BoxGeometry(0.18, 1.25, 0.18);
  const s1 = stilt.clone(); s1.translate(-0.80, 0.625, -0.80); parts.push(s1);
  const s2 = stilt.clone(); s2.translate(0.80, 0.625, -0.80); parts.push(s2);
  const s3 = stilt.clone(); s3.translate(-0.80, 0.625, 0.80); parts.push(s3);
  const s4 = stilt.clone(); s4.translate(0.80, 0.625, 0.80); parts.push(s4);
  const deck = new THREE.BoxGeometry(1.90, 0.14, 1.90); deck.translate(0, 1.32, 0); parts.push(deck);
  const f2 = new THREE.BoxGeometry(1.70, 1.10, 1.70); f2.translate(0, 1.94, 0); parts.push(f2);
  const f3 = new THREE.BoxGeometry(1.80, 1.00, 1.80); f3.translate(0, 2.99, 0); parts.push(f3);
  return mergeBufferGeometries(parts);
}
function createMountainStiltRoofGeo() {
  const roof = createCleanPitchedRoof(1.92, 1.92, 1.00, false);
  roof.translate(0, 3.49, 0);
  return roof;
}

// 7. Nordic Viking Longhouse (3-Story, 3x2x3 Footprint: X [0.05..2.95], Z [0.05..1.95])
function createLonghouseWallGeo() {
  const parts = [];
  
  const skirt = new THREE.BoxGeometry(2.90, 0.25, 1.90); skirt.translate(0, 0.125, 0); parts.push(skirt);
  const body = new THREE.BoxGeometry(2.85, 2.10, 1.85); body.translate(0, 1.30, 0); parts.push(body);
  return mergeBufferGeometries(parts);
}
function createLonghouseRoofGeo() {
  const roof = createCleanPitchedRoof(2.92, 1.92, 1.10);
  roof.translate(0, 2.35, 0);
  return roof;
}

// 8. Ancient Bone Ossuary (3-Story, 2x2x3 Footprint: X [0.05..1.95], Z [0.05..1.95])
function createBoneOssuaryWallGeo() {
  const parts = [];
  
  const f1 = new THREE.BoxGeometry(1.90, 1.10, 1.90); f1.translate(0, 0.55, 0); parts.push(f1);
  const f2 = new THREE.BoxGeometry(1.75, 1.10, 1.75); f2.translate(0, 1.65, 0); parts.push(f2);
  const f3 = new THREE.BoxGeometry(1.10, 1.00, 1.10); f3.translate(0, 2.70, 0); parts.push(f3);
  return mergeBufferGeometries(parts);
}
function createBoneOssuaryRoofGeo() {
  const parts = [];
  
  const r1 = createCleanPitchedRoof(1.92, 1.92, 0.70, false); r1.translate(0, 2.20, 0); parts.push(r1);
  const spire = new THREE.ConeGeometry(0.60, 1.20, 8); spire.translate(0, 3.80, 0); parts.push(spire);
  return mergeBufferGeometries(parts);
}

// 9. Manor Villa (4-Story, 3x3x4 Footprint: X [0.05..2.95], Z [0.05..2.95])
function createWatchtowerVillaWallGeo() {
  const parts = [];
  
  const f1 = new THREE.BoxGeometry(2.85, 1.15, 2.85); f1.translate(0, 0.575, 0); parts.push(f1);
  const f2 = new THREE.BoxGeometry(2.65, 1.10, 2.65); f2.translate(0, 1.70, 0); parts.push(f2);
  const f3 = new THREE.BoxGeometry(2.45, 1.00, 2.45); f3.translate(0, 2.75, 0); parts.push(f3);
  const f4 = new THREE.BoxGeometry(2.15, 0.90, 2.15); f4.translate(0, 3.70, 0); parts.push(f4);
  const chimney = new THREE.BoxGeometry(0.45, 4.80, 0.45); chimney.translate(0.95, 2.40, -0.75); parts.push(chimney);
  return mergeBufferGeometries(parts);
}
function createWatchtowerVillaRoofGeo() {
  
  const mainRoof = createCleanPitchedRoof(2.25, 2.25, 1.00, false);
  mainRoof.translate(0, 4.15, 0);
  return mainRoof;
}

// 10. Slender Timber Tower House (1x1x3 Footprint: X [0.05..0.95], Z [0.05..0.95])
function createTimberTowerWallGeo() {
  const parts = [];
  
  const base = new THREE.BoxGeometry(0.90, 0.20, 0.90); base.translate(0, 0.10, 0); parts.push(base);
  const f1 = new THREE.BoxGeometry(0.85, 1.00, 0.85); f1.translate(0, 0.70, 0); parts.push(f1);
  const f2 = new THREE.BoxGeometry(0.88, 0.95, 0.88); f2.translate(0, 1.675, 0); parts.push(f2);
  const f3 = new THREE.BoxGeometry(0.82, 0.90, 0.82); f3.translate(0, 2.60, 0); parts.push(f3);
  return mergeBufferGeometries(parts);
}
function createTimberTowerRoofGeo() {
  
  const roof = createCleanPitchedRoof(0.92, 0.92, 0.75, false);
  roof.translate(0, 3.05, 0);
  return roof;
}

// 11. Slender Stone Townhouse (1x1x3 Footprint: X [0.05..0.95], Z [0.05..0.95])
function createStoneTownhouseWallGeo() {
  const parts = [];
  
  const plinth = new THREE.BoxGeometry(0.92, 0.25, 0.92); plinth.translate(0, 0.125, 0); parts.push(plinth);
  const f1 = new THREE.BoxGeometry(0.86, 1.05, 0.86); f1.translate(0, 0.775, 0); parts.push(f1);
  const f2 = new THREE.BoxGeometry(0.84, 1.00, 0.84); f2.translate(0, 1.80, 0); parts.push(f2);
  const f3 = new THREE.BoxGeometry(0.80, 0.90, 0.80); f3.translate(0, 2.75, 0); parts.push(f3);
  return mergeBufferGeometries(parts);
}
function createStoneTownhouseRoofGeo() {
  
  const spire = new THREE.ConeGeometry(0.52, 1.10, 4);
  spire.rotateY(Math.PI / 4);
  spire.translate(0, 3.20 + 0.55, 0);
  return spire;
}

// 12. Stilt Watch-Shack (1x1x2 Footprint: X [0.05..0.95], Z [0.05..0.95])
function createStiltWatchShackWallGeo() {
  const parts = [];
  
  const stilt = new THREE.BoxGeometry(0.12, 1.10, 0.12);
  const s1 = stilt.clone(); s1.translate(-0.35, 0.55, -0.35); parts.push(s1);
  const s2 = stilt.clone(); s2.translate(0.35, 0.55, -0.35); parts.push(s2);
  const s3 = stilt.clone(); s3.translate(-0.35, 0.55, 0.35); parts.push(s3);
  const s4 = stilt.clone(); s4.translate(0.35, 0.55, 0.35); parts.push(s4);
  const deck = new THREE.BoxGeometry(0.92, 0.12, 0.92); deck.translate(0, 1.16, 0); parts.push(deck);
  const f2 = new THREE.BoxGeometry(0.85, 0.95, 0.85); f2.translate(0, 1.70, 0); parts.push(f2);
  return mergeBufferGeometries(parts);
}
function createStiltWatchShackRoofGeo() {
  
  const roof = createCleanPitchedRoof(0.94, 0.94, 0.65, false);
  roof.translate(0, 2.175, 0);
  return roof;
}

// 13. Plaster Steeple Townhouse (1x1x4 Footprint: X [0.05..0.95], Z [0.05..0.95])
function createPlasterSteepleWallGeo() {
  const parts = [];
  
  const plinth = new THREE.BoxGeometry(0.90, 0.18, 0.90); plinth.translate(0, 0.09, 0); parts.push(plinth);
  const f1 = new THREE.BoxGeometry(0.85, 1.00, 0.85); f1.translate(0, 0.68, 0); parts.push(f1);
  const f2 = new THREE.BoxGeometry(0.88, 0.95, 0.88); f2.translate(0, 1.655, 0); parts.push(f2);
  const f3 = new THREE.BoxGeometry(0.82, 0.90, 0.82); f3.translate(0, 2.58, 0); parts.push(f3);
  const f4 = new THREE.BoxGeometry(0.76, 0.85, 0.76); f4.translate(0, 3.455, 0); parts.push(f4);
  return mergeBufferGeometries(parts);
}
function createPlasterSteepleRoofGeo() {
  
  const spire = new THREE.ConeGeometry(0.48, 1.40, 8);
  spire.translate(0, 3.88 + 0.70, 0);
  return spire;
}

// 14. Single-Story Rustic Timber Ranch (1-Story, 2x1x1 Footprint: X [0.05..1.95], Z [0.05..0.95])
function createSingleCabinWallGeo() {
  const parts = []; 
  const porch = new THREE.BoxGeometry(1.90, 0.12, 0.90); porch.translate(0, 0.06, 0); parts.push(porch);
  const cabin = new THREE.BoxGeometry(1.80, 0.85, 0.80); cabin.translate(0, 0.545, 0); parts.push(cabin);
  const p1 = new THREE.BoxGeometry(0.10, 0.85, 0.10); p1.translate(-0.85, 0.545, 0.35); parts.push(p1);
  const p2 = new THREE.BoxGeometry(0.10, 0.85, 0.10); p2.translate(0.85, 0.545, 0.35); parts.push(p2);
  return mergeBufferGeometries(parts);
}
function createSingleCabinRoofGeo() {
  
  const roof = createCleanPitchedRoof(1.92, 0.92, 0.48);
  roof.translate(0, 0.97, 0);
  return roof;
}

// 15. Single-Story Stone Cottage (1-Story, 2x2x1 Footprint: X [0.05..1.95], Z [0.05..1.95])
function createSingleStoneCottageWallGeo() {
  const parts = []; 
  const plinth = new THREE.BoxGeometry(1.90, 0.15, 1.90); plinth.translate(0, 0.075, 0); parts.push(plinth);
  const body = new THREE.BoxGeometry(1.82, 0.82, 1.82); body.translate(0, 0.56, 0); parts.push(body);
  const chimney = new THREE.BoxGeometry(0.35, 1.35, 0.35); chimney.translate(0.65, 0.675, -0.65); parts.push(chimney);
  return mergeBufferGeometries(parts);
}
function createSingleStoneCottageRoofGeo() {
  
  const roof = createCleanPitchedRoof(1.92, 1.92, 0.55, false);
  roof.translate(0, 0.97, 0);
  return roof;
}

// 16. Fenced Ranch Compound (1-Story, 3x3x1 Footprint: X [0.05..2.95], Z [0.05..2.95])
// 16. Fenced Ranch Compound (1-Story, 3x3x1 Footprint: centered at origin)
function createFencedRanchWallGeo() {
  const parts = []; 
  const wingBack = new THREE.BoxGeometry(2.80, 0.88, 1.25); wingBack.translate(0, 0.44, -0.65); parts.push(wingBack);
  const wingSide = new THREE.BoxGeometry(1.20, 0.85, 1.45); wingSide.translate(0.65, 0.425, 0.65); parts.push(wingSide);
  const fPost1 = new THREE.BoxGeometry(0.08, 0.45, 0.08); fPost1.translate(-1.35, 0.225, 1.35); parts.push(fPost1);
  const fPost2 = new THREE.BoxGeometry(0.08, 0.45, 0.08); fPost2.translate(1.35, 0.225, 1.35); parts.push(fPost2);
  const fPost3 = new THREE.BoxGeometry(0.08, 0.45, 0.08); fPost3.translate(1.35, 0.225, -0.10); parts.push(fPost3);
  const railFront = new THREE.BoxGeometry(2.70, 0.08, 0.06); railFront.translate(0, 0.35, 1.35); parts.push(railFront);
  const railSide = new THREE.BoxGeometry(0.06, 0.08, 1.45); railSide.translate(1.35, 0.35, 0.65); parts.push(railSide);
  return mergeBufferGeometries(parts);
}
function createFencedRanchRoofGeo() {
  const parts = [];
  const rBack = createCleanPitchedRoof(2.85, 1.30, 0.55); rBack.translate(0, 0.88, -0.65); parts.push(rBack);
  const rSide = createCleanPitchedRoof(1.25, 1.50, 0.52); rSide.translate(0.65, 0.85, 0.65); parts.push(rSide);
  return mergeBufferGeometries(parts);
}

// 17. Courtyard Hacienda Estate (1-Story Condominium Compound, 4x4x1 Footprint: centered at origin)
function createCourtyardHaciendaWallGeo() {
  const parts = []; 
  const wingN = new THREE.BoxGeometry(3.85, 0.90, 1.05); wingN.translate(0, 0.45, -1.40); parts.push(wingN);
  const wingS = new THREE.BoxGeometry(3.85, 0.90, 1.05); wingS.translate(0, 0.45, 1.40); parts.push(wingS);
  const wingE = new THREE.BoxGeometry(1.05, 0.90, 1.75); wingE.translate(1.40, 0.45, 0); parts.push(wingE);
  const wingW = new THREE.BoxGeometry(1.05, 0.90, 1.75); wingW.translate(-1.40, 0.45, 0); parts.push(wingW);
  const patio = new THREE.BoxGeometry(1.80, 0.08, 1.80); patio.translate(0, 0.04, 0); parts.push(patio);
  const fountain = new THREE.CylinderGeometry(0.35, 0.40, 0.35, 8); fountain.translate(0, 0.20, 0); parts.push(fountain);
  return mergeBufferGeometries(parts);
}
function createCourtyardHaciendaRoofGeo() {
  const parts = []; 
  const rN = createCleanPitchedRoof(3.90, 1.10, 0.48); rN.translate(0, 0.90, -1.40); parts.push(rN);
  const rS = createCleanPitchedRoof(3.90, 1.10, 0.48); rS.translate(0, 0.90, 1.40); parts.push(rS);
  const rE = createCleanPitchedRoof(1.10, 1.80, 0.48); rE.translate(1.40, 0.90, 0); parts.push(rE);
  const rW = createCleanPitchedRoof(1.10, 1.80, 0.48); rW.translate(-1.40, 0.90, 0); parts.push(rW);
  return mergeBufferGeometries(parts);
}

// 18. Single-Story Adobe Rancho (1-Story, 2x2x1 Footprint: X [0.05..1.95], Z [0.05..1.95])
function createAdobeRanchoWallGeo() {
  const parts = []; 
  const body = new THREE.BoxGeometry(1.85, 0.85, 1.85); body.translate(0, 0.425, 0); parts.push(body);
  const parapet = new THREE.BoxGeometry(1.90, 0.15, 1.90); parapet.translate(0, 0.925, 0); parts.push(parapet);
  const oven = new THREE.CylinderGeometry(0.35, 0.42, 0.45, 8); oven.translate(0.65, 0.225, 0.65); parts.push(oven);
  return mergeBufferGeometries(parts);
}
function createAdobeRanchoRoofGeo() {
  
  const coping = new THREE.BoxGeometry(1.75, 0.08, 1.75);
  coping.translate(0, 0.95, 0);
  return coping;
}

// 19. Ground Thatched Croft (1-Story, 1x1x1 Footprint: X [0.05..0.95], Z [0.05..0.95])
function createGroundCroftWallGeo() {
  const parts = []; 
  const body = new THREE.BoxGeometry(0.85, 0.80, 0.85); body.translate(0, 0.40, 0); parts.push(body);
  return mergeBufferGeometries(parts);
}
function createGroundCroftRoofGeo() {
  
  const roof = createCleanPitchedRoof(0.92, 0.92, 0.55);
  roof.translate(0, 0.80, 0);
  return roof;
}

// -----------------------------------------------------------------------------
// Leader House / Chieftain Palace 7 Variations (3x3 Footprint, 7 Stories Tall)
// -----------------------------------------------------------------------------

// 0: Citadel Palace (7 Stories)
function createLeaderCitadelWallGeo() {
  const parts = [];
  for (let i = 0; i < 7; i++) {
    const s = 2.4 - i * 0.15;
    const tier = new THREE.BoxGeometry(s, 0.9, s);
    tier.translate(0, i * 0.9 + 0.45, 0);
    parts.push(tier);
  }
  const tw = 0.6;
  for (const dx of [-1.2, 1.2]) {
    for (const dz of [-1.2, 1.2]) {
      const tower = new THREE.BoxGeometry(tw, 4.0, tw);
      tower.translate(dx, 2.0, dz);
      parts.push(tower);
    }
  }
  return mergeBufferGeometries(parts);
}
function createLeaderCitadelRoofGeo() {
  const parts = [];
  const roof = createCleanPitchedRoof(1.60, 1.60, 1.25, false);
  roof.translate(0, 6.30, 0);
  parts.push(roof);
  const twR = 0.7;
  for (const dx of [-1.2, 1.2]) {
    for (const dz of [-1.2, 1.2]) {
      const troof = createCleanPitchedRoof(twR, twR, 0.8, false);
      troof.translate(dx, 4.0, dz);
      parts.push(troof);
    }
  }
  return mergeBufferGeometries(parts);
}

// 1: Nordic Jarl High Long-Hall Tower (7 Stories)
function createLeaderJarlHallWallGeo() {
  const parts = [];
  const base = new THREE.BoxGeometry(2.9, 1.2, 1.8);
  base.translate(0, 0.6, 0);
  parts.push(base);
  const base2 = new THREE.BoxGeometry(1.8, 1.2, 2.9);
  base2.translate(0, 0.6, 0);
  parts.push(base2);
  for (let i = 1; i < 7; i++) {
    const s = 2.2 - i * 0.25;
    const tier = new THREE.BoxGeometry(s, 1.0, s);
    tier.translate(0, i * 1.0 + 0.5, 0);
    parts.push(tier);
  }
  return mergeBufferGeometries(parts);
}
function createLeaderJarlHallRoofGeo() {
  const parts = [];
  const r1 = createCleanPitchedRoof(3.0, 1.9, 0.8, false);
  r1.translate(0, 1.2, 0);
  parts.push(r1);
  const r2 = createCleanPitchedRoof(1.9, 3.0, 0.8, false);
  r2.translate(0, 1.2, 0);
  parts.push(r2);
  const roof = createCleanPitchedRoof(1.2, 1.2, 1.8, false);
  roof.translate(0, 6.6, 0);
  parts.push(roof);
  return mergeBufferGeometries(parts);
}

// 2: Stepped Ziggurat Palace (7 Stories)
function createLeaderZigguratWallGeo() {
  const parts = [];
  for (let i = 0; i < 7; i++) {
    const s = 2.90 - i * 0.3;
    const h = 0.85;
    const tier = new THREE.BoxGeometry(s, h, s);
    tier.translate(0, i * 0.85 + 0.425, 0);
    parts.push(tier);
  }
  for (let s = 0; s < 15; s++) {
    const step = new THREE.BoxGeometry(1.0, (s+1)*0.2, 0.2);
    step.translate(0, (s+1)*0.1, 1.45 - s*0.1);
    parts.push(step);
  }
  return mergeBufferGeometries(parts);
}
function createLeaderZigguratRoofGeo() {
  const altarRoof = new THREE.BoxGeometry(1.20, 0.3, 1.20);
  altarRoof.translate(0, 7 * 0.85 + 0.15, 0);
  return altarRoof;
}

// 3: Chieftain Pagoda Spire (7 Stories)
function createLeaderPagodaWallGeo() {
  const parts = [];
  for (let i = 0; i < 7; i++) {
    const s = 2.4 - i * 0.2;
    const h = 0.85;
    const tier1 = new THREE.BoxGeometry(s, h, s - 0.4);
    tier1.translate(0, i * 0.85 + 0.425, 0);
    parts.push(tier1);
    const tier2 = new THREE.BoxGeometry(s - 0.4, h, s);
    tier2.translate(0, i * 0.85 + 0.425, 0);
    parts.push(tier2);
  }
  return mergeBufferGeometries(parts);
}
function createLeaderPagodaRoofGeo() {
  const parts = [];
  for (let i = 0; i < 7; i++) {
    const s = 2.8 - i * 0.2;
    const cap1 = new THREE.BoxGeometry(s, 0.15, s - 0.4);
    cap1.translate(0, (i + 1) * 0.85, 0);
    parts.push(cap1);
    const cap2 = new THREE.BoxGeometry(s - 0.4, 0.15, s);
    cap2.translate(0, (i + 1) * 0.85, 0);
    parts.push(cap2);
  }
  const topSpire = new THREE.ConeGeometry(0.30, 2.0, 8);
  topSpire.translate(0, 7 * 0.85 + 1.0, 0);
  parts.push(topSpire);
  return mergeBufferGeometries(parts);
}

// 4: Sanctuary Cathedral Keep (7 Stories)
function createLeaderSanctuaryWallGeo() {
  const parts = [];
  const b1 = new THREE.BoxGeometry(1.2, 6.0, 2.8);
  b1.translate(0, 3.0, 0);
  parts.push(b1);
  const b2 = new THREE.BoxGeometry(2.8, 6.0, 1.2);
  b2.translate(0, 3.0, 0);
  parts.push(b2);
  const center = new THREE.BoxGeometry(1.4, 7.5, 1.4);
  center.translate(0, 3.75, 0);
  parts.push(center);
  return mergeBufferGeometries(parts);
}
function createLeaderSanctuaryRoofGeo() {
  const parts = [];
  const spire = new THREE.ConeGeometry(0.8, 2.5, 4);
  spire.translate(0, 7.5 + 1.25, 0);
  parts.push(spire);
  const r1 = createCleanPitchedRoof(1.3, 2.9, 0.6, false);
  r1.translate(0, 6.0, 0);
  parts.push(r1);
  const r2 = createCleanPitchedRoof(2.9, 1.3, 0.6, false);
  r2.translate(0, 6.0, 0);
  parts.push(r2);
  return mergeBufferGeometries(parts);
}

// 5: Basalt Monolith Castle (7 Stories)
function createLeaderMonolithWallGeo() {
  const parts = [];
  const core = new THREE.BoxGeometry(2.2, 6.5, 2.2);
  core.translate(0, 3.25, 0);
  parts.push(core);
  for (const dx of [-1.1, 1.1]) {
    const b = new THREE.BoxGeometry(0.6, 5.0, 2.8);
    b.translate(dx, 2.5, 0);
    parts.push(b);
  }
  for (const dz of [-1.1, 1.1]) {
    const b = new THREE.BoxGeometry(2.8, 5.0, 0.6);
    b.translate(0, 2.5, dz);
    parts.push(b);
  }
  return mergeBufferGeometries(parts);
}
function createLeaderMonolithRoofGeo() {
  const parts = [];
  const flat = new THREE.BoxGeometry(2.3, 0.2, 2.3);
  flat.translate(0, 6.5, 0);
  parts.push(flat);
  for (const dx of [-1.0, 0, 1.0]) {
    for (const dz of [-1.0, 0, 1.0]) {
      if (Math.abs(dx) === 1.0 || Math.abs(dz) === 1.0) {
        const bat = new THREE.BoxGeometry(0.4, 0.5, 0.4);
        bat.translate(dx, 6.75, dz);
        parts.push(bat);
      }
    }
  }
  return mergeBufferGeometries(parts);
}

// 6: Imperial Pavilion Palace (7 Stories)
function createLeaderImperialWallGeo() {
  const parts = [];
  const back = new THREE.BoxGeometry(2.8, 1.5, 1.0);
  back.translate(0, 0.75, -0.9);
  parts.push(back);
  const lWing = new THREE.BoxGeometry(1.0, 1.5, 1.8);
  lWing.translate(-0.9, 0.75, 0.5);
  parts.push(lWing);
  const rWing = new THREE.BoxGeometry(1.0, 1.5, 1.8);
  rWing.translate(0.9, 0.75, 0.5);
  parts.push(rWing);
  const tower = new THREE.BoxGeometry(1.6, 6.5, 1.6);
  tower.translate(0, 3.25, -0.6);
  parts.push(tower);
  return mergeBufferGeometries(parts);
}
function createLeaderImperialRoofGeo() {
  const parts = [];
  const rb = createCleanPitchedRoof(2.9, 1.1, 0.6, false);
  rb.translate(0, 1.5, -0.9);
  parts.push(rb);
  const rl = createCleanPitchedRoof(1.1, 1.9, 0.6, false);
  rl.translate(-0.9, 1.5, 0.5);
  parts.push(rl);
  const rr = createCleanPitchedRoof(1.1, 1.9, 0.6, false);
  rr.translate(0.9, 1.5, 0.5);
  parts.push(rr);
  const rt = createCleanPitchedRoof(1.8, 1.8, 1.2, false);
  rt.translate(0, 6.5, -0.6);
  parts.push(rt);
  return mergeBufferGeometries(parts);
}

// -----------------------------------------------------------------------------
// Industrial Buildings: Slaughterhouse, Kitchen, and Warehouses
// -----------------------------------------------------------------------------

// Timber Barn Warehouse (Var 0)
function createWarehouseWallGeo0() {
  const parts = [];
  const body = new THREE.BoxGeometry(1.82, 1.30, 1.82); body.translate(0, 0.65, 0); parts.push(body);
  const awning = new THREE.BoxGeometry(1.90, 0.12, 0.40); awning.translate(0, 1.30, 1.00); parts.push(awning);
  const post1 = new THREE.CylinderGeometry(0.08, 0.08, 1.30, 6); post1.translate(-0.85, 0.65, 1.05); parts.push(post1);
  const post2 = new THREE.CylinderGeometry(0.08, 0.08, 1.30, 6); post2.translate( 0.85, 0.65, 1.05); parts.push(post2);
  const crate1 = new THREE.BoxGeometry(0.35, 0.35, 0.35); crate1.translate(-1.02, 0.175, 0.20); parts.push(crate1);
  const crate2 = new THREE.BoxGeometry(0.30, 0.30, 0.30); crate2.translate(-1.02, 0.45, 0.20); parts.push(crate2);
  const mast = new THREE.CylinderGeometry(0.05, 0.05, 0.85, 5); mast.translate(0, 1.30 + 0.88 + 0.40, 0); parts.push(mast);
  return mergeBufferGeometries(parts);
}
function createWarehouseRoofGeo0() {
  const roof = createPitchedRoofGeometry(2.04, 2.04, 0.88);
  roof.translate(0, 1.30, 0);
  return roof;
}

// Stone Depot Vault Warehouse (Var 1)
function createWarehouseWallGeo1() {
  const parts = [];
  const body = new THREE.BoxGeometry(1.85, 1.35, 1.85); body.translate(0, 0.675, 0); parts.push(body);
  const vaultArch = new THREE.BoxGeometry(0.20, 1.10, 0.90); vaultArch.translate(0.95, 0.55, 0); parts.push(vaultArch);
  return mergeBufferGeometries(parts);
}
function createWarehouseRoofGeo1() {
  const roof = createPitchedRoofGeometry(2.05, 2.05, 0.95);
  roof.translate(0, 1.35, 0);
  return roof;
}

// Slaughterhouse Var 0: Timber Abatedouro
function createTimberAbatedouroWallGeo() {
  const parts = [];
  const body = new THREE.BoxGeometry(1.65, 1.15, 1.55); body.translate(0, 0.575, 0); parts.push(body);
  const slab = new THREE.BoxGeometry(0.60, 0.40, 0.45); slab.translate(-0.90, 0.20, 0.25); parts.push(slab);
  const rack = new THREE.BoxGeometry(0.10, 0.95, 0.75); rack.translate(0.90, 0.475, 0.25); parts.push(rack);
  return mergeBufferGeometries(parts);
}
function createTimberAbatedouroRoofGeo() {
  const roof = createPitchedRoofGeometry(1.85, 1.75, 0.75);
  roof.translate(0, 1.15, 0);
  return roof;
}

// Slaughterhouse Var 1: Stone Abattoir
function createStoneAbatedouroWallGeo() {
  const parts = [];
  const body = new THREE.BoxGeometry(1.70, 1.25, 1.60); body.translate(0, 0.625, 0); parts.push(body);
  const chimney = new THREE.BoxGeometry(0.40, 1.95, 0.40); chimney.translate(0.85, 0.975, -0.35); parts.push(chimney);
  return mergeBufferGeometries(parts);
}
function createStoneAbatedouroRoofGeo() {
  const roof = createPitchedRoofGeometry(1.90, 1.80, 0.85);
  roof.translate(0, 1.25, 0);
  return roof;
}

// Kitchen Var 0: Brick Oven Bakery & Kitchen
function createBrickOvenKitchenWallGeo() {
  const parts = [];
  const body = new THREE.BoxGeometry(1.60, 1.15, 1.60); body.translate(0, 0.575, 0); parts.push(body);
  const oven = new THREE.CylinderGeometry(0.48, 0.55, 0.65, 8); oven.translate(-0.92, 0.325, 0.25); parts.push(oven);
  const chimney = new THREE.BoxGeometry(0.38, 2.05, 0.38); chimney.translate(-0.92, 1.025, 0.25); parts.push(chimney);
  return mergeBufferGeometries(parts);
}
function createBrickOvenKitchenRoofGeo() {
  const roof = createPitchedRoofGeometry(1.82, 1.82, 0.80);
  roof.translate(0, 1.15, 0);
  return roof;
}

// Kitchen Var 1: Timber Smokery Kitchen
function createTimberSmokeryKitchenWallGeo() {
  const parts = [];
  const body = new THREE.BoxGeometry(1.55, 1.10, 1.55); body.translate(0, 0.55, 0); parts.push(body);
  const smokeStack = new THREE.BoxGeometry(0.45, 1.80, 0.45); smokeStack.translate(0.75, 0.90, -0.30); parts.push(smokeStack);
  const prepTable = new THREE.BoxGeometry(0.55, 0.42, 0.75); prepTable.translate(-0.88, 0.21, 0.20); parts.push(prepTable);
  return mergeBufferGeometries(parts);
}
function createTimberSmokeryKitchenRoofGeo() {
  const roof = createPitchedRoofGeometry(1.75, 1.75, 0.78);
  roof.translate(0, 1.10, 0);
  return roof;
}

// 3D Ancient Water Well with Stone Basin, Wooden Posts, and Tiled Roof Canopy
function createWaterWellBaseGeometry() {
  const parts = [];
  // 1. Chiseled Stone Basin / Well Rim (cylindrical base)
  const basin = new THREE.CylinderGeometry(0.58, 0.62, 0.48, 12);
  basin.translate(0, 0.24, 0);
  parts.push(basin);

  // 2. Interior dark water disk
  const water = new THREE.CylinderGeometry(0.44, 0.44, 0.05, 10);
  water.translate(0, 0.35, 0);
  parts.push(water);

  return mergeBufferGeometries(parts);
}

function createWaterWellWoodGeometry() {
  const parts = [];
  // Wooden Support Pillars (Left & Right)
  const postL = new THREE.CylinderGeometry(0.05, 0.05, 1.05, 6);
  postL.translate(-0.44, 0.72, 0);
  parts.push(postL);

  const postR = new THREE.CylinderGeometry(0.05, 0.05, 1.05, 6);
  postR.translate(0.44, 0.72, 0);
  parts.push(postR);

  // Wooden Crossbeam Axle
  const beam = new THREE.CylinderGeometry(0.04, 0.04, 0.96, 6);
  beam.rotateZ(Math.PI / 2);
  beam.translate(0, 1.15, 0);
  parts.push(beam);

  // Suspended Wooden Bucket
  const bucket = new THREE.CylinderGeometry(0.09, 0.07, 0.16, 6);
  bucket.translate(0, 0.60, 0);
  parts.push(bucket);

  return mergeBufferGeometries(parts);
}

function createWaterWellRoofGeometry() {
  const roof = createPitchedRoofGeometry(1.15, 1.05, 0.38);
  roof.translate(0, 1.22, 0);
  return roof;
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
// Texture-Derived Normal Map Generator (Pixel-Perfect Alignment with Tile Art)
// ---------------------------------------------------------------------------
const normalMapCache = new Map();

export function createNormalMapFromTexture(skinName, intensity = 1.6) {
  const cacheKey = `${skinName}_${intensity}`;
  if (normalMapCache.has(cacheKey)) return normalMapCache.get(cacheKey);

  const clean = (skinName || "").toLowerCase().replace(/\\/g, "/");
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

  const size = 16;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const imgData = ctx.createImageData(size, size);
  const data = imgData.data;

  const heightMap = new Float32Array(size * size);

  if (img && img.naturalWidth > 0) {
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = size;
    tempCanvas.height = size;
    const tempCtx = tempCanvas.getContext("2d");
    tempCtx.drawImage(img, 0, 0, size, size);
    const srcData = tempCtx.getImageData(0, 0, size, size).data;

    for (let i = 0; i < size * size; i++) {
      const r = srcData[i * 4];
      const g = srcData[i * 4 + 1];
      const b = srcData[i * 4 + 2];
      const a = srcData[i * 4 + 3] / 255.0;
      // Perceptual luminance height from the actual sprite pixels
      const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255.0;
      heightMap[i] = lum * a;
    }
  } else {
    // Organic subtle procedural height fallback for non-textured tiles
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        heightMap[y * size + x] = 0.5 + 0.25 * Math.sin(x * 1.8 + Math.sin(y * 1.2) * 2.0);
      }
    }
  }

  // 3x3 Sobel filter across sprite pixels for accurate surface relief
  for (let y = 0; y < size; y++) {
    const ym = (y - 1 + size) % size;
    const yp = (y + 1) % size;
    for (let x = 0; x < size; x++) {
      const xm = (x - 1 + size) % size;
      const xp = (x + 1) % size;

      const dX = (
        (heightMap[ym * size + xp] - heightMap[ym * size + xm]) * 1.0 +
        (heightMap[y  * size + xp] - heightMap[y  * size + xm]) * 2.0 +
        (heightMap[yp * size + xp] - heightMap[yp * size + xm]) * 1.0
      ) * (intensity / 4.0);

      const dY = (
        (heightMap[yp * size + xm] - heightMap[ym * size + xm]) * 1.0 +
        (heightMap[yp * size + x ] - heightMap[ym * size + x ]) * 2.0 +
        (heightMap[yp * size + xp] - heightMap[yp * size + xp]) * 1.0
      ) * (intensity / 4.0);

      let nx = -dX;
      let ny = -dY;
      let nz = 1.0;
      const len = Math.hypot(nx, ny, nz);
      nx /= len;
      ny /= len;
      nz /= len;

      const r = Math.round(((nx * 0.5 + 0.5) * 255) / 32) * 32;
      const g = Math.round(((ny * 0.5 + 0.5) * 255) / 32) * 32;
      const b = Math.round(((nz * 0.5 + 0.5) * 255) / 32) * 32;

      const idx = (y * size + x) * 4;
      data[idx + 0] = Math.min(255, r);
      data[idx + 1] = Math.min(255, g);
      data[idx + 2] = Math.min(255, b);
      data[idx + 3] = 255;
    }
  }

  ctx.putImageData(imgData, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  applyTextureAnisotropy(tex);
  normalMapCache.set(cacheKey, tex);
  return tex;
}

// ---------------------------------------------------------------------------
// Procedural Pixelated Terrain Normal Map Generator (Grass & Sand)
// ---------------------------------------------------------------------------
function generateProceduralTerrainNormalMap(type, intensity = 1.35) {
  const size = 32;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const imgData = ctx.createImageData(size, size);
  const data = imgData.data;

  const heightMap = new Float32Array(size * size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let h = 0.5;
      if (type === "grass") {
        const f1 = Math.sin(x * 1.8 + Math.sin(y * 0.8) * 2.0);
        const f2 = Math.sin((x + y) * 1.2);
        h = 0.5 + 0.3 * f1 + 0.2 * f2;
      } else if (type === "sand") {
        const r1 = Math.sin(x * 0.4 + y * 0.2);
        const r2 = Math.cos(x * 0.8 - y * 0.3);
        h = 0.5 + 0.35 * r1 + 0.15 * r2;
      }
      heightMap[y * size + x] = Math.round(h * 6) / 6;
    }
  }

  for (let y = 0; y < size; y++) {
    const ym = (y - 1 + size) % size;
    const yp = (y + 1) % size;
    for (let x = 0; x < size; x++) {
      const xm = (x - 1 + size) % size;
      const xp = (x + 1) % size;

      const dX = (heightMap[y * size + xp] - heightMap[y * size + xm]) * (intensity * 1.8);
      const dY = (heightMap[yp * size + x] - heightMap[ym * size + x]) * (intensity * 1.8);

      let nx = -dX;
      let ny = -dY;
      let nz = 1.0;
      const len = Math.hypot(nx, ny, nz);
      nx /= len;
      ny /= len;
      nz /= len;

      const r = Math.round(((nx * 0.5 + 0.5) * 255) / 32) * 32;
      const g = Math.round(((ny * 0.5 + 0.5) * 255) / 32) * 32;
      const b = Math.round(((nz * 0.5 + 0.5) * 255) / 32) * 32;

      const idx = (y * size + x) * 4;
      data[idx + 0] = Math.min(255, r);
      data[idx + 1] = Math.min(255, g);
      data[idx + 2] = Math.min(255, b);
      data[idx + 3] = 255;
    }
  }

  ctx.putImageData(imgData, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  applyTextureAnisotropy(tex);
  return tex;
}

// ---------------------------------------------------------------------------
// Foliage & Plant Pixelated Normal Map Generator (Oak, Pine, Cactus)
// ---------------------------------------------------------------------------
function generateProceduralFoliageNormalMap(type, intensity = 1.6) {
  const size = 32;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const imgData = ctx.createImageData(size, size);
  const data = imgData.data;

  const heightMap = new Float32Array(size * size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let h = 0.5;
      if (type === "oak") {
        const l1 = Math.sin(x * 0.8 + Math.cos(y * 0.9) * 1.5);
        const l2 = Math.cos(x * 1.4 - y * 1.1);
        const l3 = Math.sin((x + y) * 2.1);
        h = 0.5 + 0.3 * l1 + 0.15 * l2 + 0.1 * l3;
      } else if (type === "pine") {
        const n1 = Math.sin(y * 2.8 + (x % 4) * 0.7);
        const n2 = Math.cos(x * 3.2);
        h = 0.5 + 0.35 * n1 + 0.15 * n2;
      } else if (type === "cactus") {
        const rib = Math.sin((x / 32) * Math.PI * 8);
        const spine = ((x % 4 === 0) && (y % 6 === 0)) ? 0.9 : 0.0;
        h = 0.5 + 0.4 * rib + spine;
      }
      heightMap[y * size + x] = Math.round(h * 5) / 5;
    }
  }

  for (let y = 0; y < size; y++) {
    const ym = (y - 1 + size) % size;
    const yp = (y + 1) % size;
    for (let x = 0; x < size; x++) {
      const xm = (x - 1 + size) % size;
      const xp = (x + 1) % size;

      const dX = (heightMap[y * size + xp] - heightMap[y * size + xm]) * (intensity * 1.8);
      const dY = (heightMap[yp * size + x] - heightMap[ym * size + x]) * (intensity * 1.8);

      let nx = -dX;
      let ny = -dY;
      let nz = 1.0;
      const len = Math.hypot(nx, ny, nz);
      nx /= len;
      ny /= len;
      nz /= len;

      const r = Math.round(((nx * 0.5 + 0.5) * 255) / 32) * 32;
      const g = Math.round(((ny * 0.5 + 0.5) * 255) / 32) * 32;
      const b = Math.round(((nz * 0.5 + 0.5) * 255) / 32) * 32;

      const idx = (y * size + x) * 4;
      data[idx + 0] = Math.min(255, r);
      data[idx + 1] = Math.min(255, g);
      data[idx + 2] = Math.min(255, b);
      data[idx + 3] = 255;
    }
  }

  ctx.putImageData(imgData, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  applyTextureAnisotropy(tex);
  return tex;
}

// ---------------------------------------------------------------------------
// Heavy-Dithered Pixel Art Celestial Texture Generator (Sun & Moon)
// ---------------------------------------------------------------------------
function createDitheredCelestialTexture(type) {
  const size = 32;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const imgData = ctx.createImageData(size, size);
  const data = imgData.data;

  // 4x4 Bayer Dither Matrix
  const bayer4x4 = [
     0/16,  8/16,  2/16, 10/16,
    12/16,  4/16, 14/16,  6/16,
     3/16, 11/16,  1/16,  9/16,
    15/16,  7/16, 13/16,  5/16
  ];

  const cx = 15.5;
  const cy = 15.5;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.hypot(dx, dy);
      const bayerVal = bayer4x4[(y % 4) * 4 + (x % 4)];
      const idx = (y * size + x) * 4;

      if (type === "sun") {
        if (dist <= 4.2) {
          // Semi-translucent dithered sun core
          data[idx + 0] = 255;
          data[idx + 1] = 255;
          data[idx + 2] = 215;
          data[idx + 3] = (bayerVal < 0.82) ? 225 : 0;
        } else if (dist <= 7.0) {
          // Dithered golden rim
          const alpha = 0.85 * (1.0 - (dist - 4.2) / 2.8);
          if (alpha > bayerVal) {
            data[idx + 0] = 255;
            data[idx + 1] = 195;
            data[idx + 2] = 35;
            data[idx + 3] = 190;
          } else {
            data[idx + 3] = 0;
          }
        } else if (dist <= 15.5) {
          // Broad heavy dithered corona
          const alpha = 0.65 * (1.0 - (dist - 7.0) / 8.5);
          if (alpha > bayerVal) {
            data[idx + 0] = 255;
            data[idx + 1] = Math.floor(100 + alpha * 110);
            data[idx + 2] = 0;
            data[idx + 3] = 140;
          } else {
            data[idx + 3] = 0;
          }
        } else {
          data[idx + 3] = 0;
        }
      } else if (type === "moon") {
        if (dist <= 4.0) {
          const isCrater = ((x === 14 && y === 14) || (x === 16 && y === 16) || (x === 15 && y === 17));
          if (isCrater) {
            data[idx + 0] = 140;
            data[idx + 1] = 165;
            data[idx + 2] = 205;
            data[idx + 3] = (bayerVal < 0.70) ? 190 : 0;
          } else {
            data[idx + 0] = 225;
            data[idx + 1] = 238;
            data[idx + 2] = 255;
            data[idx + 3] = (bayerVal < 0.82) ? 210 : 0;
          }
        } else if (dist <= 6.8) {
          const alpha = 0.80 * (1.0 - (dist - 4.0) / 2.8);
          if (alpha > bayerVal) {
            data[idx + 0] = 150;
            data[idx + 1] = 185;
            data[idx + 2] = 240;
            data[idx + 3] = 175;
          } else {
            data[idx + 3] = 0;
          }
        } else if (dist <= 15.0) {
          const alpha = 0.55 * (1.0 - (dist - 6.8) / 8.2);
          if (alpha > bayerVal) {
            data[idx + 0] = 90;
            data[idx + 1] = 145;
            data[idx + 2] = 235;
            data[idx + 3] = 120;
          } else {
            data[idx + 3] = 0;
          }
        } else {
          data[idx + 3] = 0;
        }
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  applyTextureAnisotropy(tex);
  return tex;
}

// ---------------------------------------------------------------------------
// Heavy-Dithered Pixel Art God Rays / Crepuscular Streaks Generator
// ---------------------------------------------------------------------------
function createDitheredGodRaysTexture(type = "sun") {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const imgData = ctx.createImageData(size, size);
  const data = imgData.data;

  const bayer4x4 = [
     0/16,  8/16,  2/16, 10/16,
    12/16,  4/16, 14/16,  6/16,
     3/16, 11/16,  1/16,  9/16,
    15/16,  7/16, 13/16,  5/16
  ];

  const cx = 31.5;
  const cy = 31.5;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx);
      const bayerVal = bayer4x4[(y % 4) * 4 + (x % 4)];
      const idx = (y * size + x) * 4;

      if (dist > 2.0 && dist <= 31.5) {
        // 8 radiating crepuscular light streaks with organic harmonic modulations
        const beamPattern = Math.pow(Math.max(0.0, Math.cos(angle * 4.0 + 0.2)), 2.5) * 0.65 +
                            Math.pow(Math.max(0.0, Math.sin(angle * 6.0 - 0.4)), 3.0) * 0.45;
        const radialFalloff = Math.max(0.0, 1.0 - (dist - 2.0) / 29.5);
        const alpha = beamPattern * radialFalloff * 0.85;

        if (alpha > bayerVal) {
          if (type === "sun") {
            data[idx + 0] = 255;
            data[idx + 1] = Math.floor(180 + alpha * 70);
            data[idx + 2] = 40;
            data[idx + 3] = Math.floor(alpha * 190);
          } else {
            data[idx + 0] = 120;
            data[idx + 1] = 175;
            data[idx + 2] = 255;
            data[idx + 3] = Math.floor(alpha * 160);
          }
        } else {
          data[idx + 3] = 0;
        }
      } else {
        data[idx + 3] = 0;
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  applyTextureAnisotropy(tex);
  return tex;
}

// ---------------------------------------------------------------------------
// Heavy-Dithered Pixel Art Lens Flare Optical Element Generator
// ---------------------------------------------------------------------------
function createDitheredLensFlareTexture(variant = 0) {
  const size = 32;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const imgData = ctx.createImageData(size, size);
  const data = imgData.data;

  const bayer4x4 = [
     0/16,  8/16,  2/16, 10/16,
    12/16,  4/16, 14/16,  6/16,
     3/16, 11/16,  1/16,  9/16,
    15/16,  7/16, 13/16,  5/16
  ];

  const cx = 15.5;
  const cy = 15.5;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.hypot(dx, dy);
      const bayerVal = bayer4x4[(y % 4) * 4 + (x % 4)];
      const idx = (y * size + x) * 4;

      if (variant === 0) {
        // Discreet Hexagonal Aperture Flare Disk
        const angle = Math.atan2(dy, dx);
        const hexR = dist * (Math.cos((((angle % (Math.PI / 3)) + (Math.PI / 3)) % (Math.PI / 3)) - Math.PI / 6));
        if (hexR <= 8.5) {
          const alpha = 0.32 * (1.0 - hexR / 8.5);
          if (alpha > bayerVal) {
            data[idx + 0] = 235;
            data[idx + 1] = 160;
            data[idx + 2] = 50;
            data[idx + 3] = 70;
          }
        }
      } else if (variant === 1) {
        // Discreet Pixel Ring Halo
        if (dist >= 5.5 && dist <= 10.5) {
          const ringDist = Math.abs(dist - 8.0);
          const alpha = 0.35 * (1.0 - ringDist / 2.5);
          if (alpha > bayerVal) {
            data[idx + 0] = 90;
            data[idx + 1] = 180;
            data[idx + 2] = 245;
            data[idx + 3] = 75;
          }
        }
      } else {
        // Discreet Anamorphic Star Burst
        if (dist <= 9.0) {
          const alpha = 0.28 * (1.0 - dist / 9.0);
          if (alpha > bayerVal) {
            data[idx + 0] = 245;
            data[idx + 1] = 210;
            data[idx + 2] = 100;
            data[idx + 3] = 60;
          }
        }
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  applyTextureAnisotropy(tex);
  return tex;
}

// ---------------------------------------------------------------------------
// Dynamic Realistic Flame Shader Material (1P & 3P Modes)
// ---------------------------------------------------------------------------
export function createRealisticFlameMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0.0 },
      uCoreColor: { value: new THREE.Color(0xffffdd) },
      uMidColor: { value: new THREE.Color(0xff8811) },
      uEdgeColor: { value: new THREE.Color(0xcc1100) },
      uSmokeColor: { value: new THREE.Color(0x220500) }
    },
    vertexShader: `
      uniform float uTime;
      varying vec2 vUv;
      varying float vNoise;

      void main() {
        vUv = uv;
        vec3 pos = position;

        float h = clamp(pos.y, 0.0, 1.5);
        float sway = sin(uTime * 12.0 + pos.y * 6.0) * 0.12 * h;
        float flutter = cos(uTime * 18.0 + pos.x * 8.0) * 0.08 * h;

        pos.x += sway;
        pos.z += flutter;
        pos.xz *= (1.0 - h * 0.45);

        vec4 worldInst = vec4(pos, 1.0);
        #ifdef USE_INSTANCING
          worldInst = instanceMatrix * worldInst;
        #endif

        vNoise = sway;
        gl_Position = projectionMatrix * viewMatrix * worldInst;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uCoreColor;
      uniform vec3 uMidColor;
      uniform vec3 uEdgeColor;
      uniform vec3 uSmokeColor;
      varying vec2 vUv;
      varying float vNoise;

      void main() {
        vec2 uv = vUv;
        float t = uTime * 6.0;

        float n1 = sin(uv.x * 12.0 + sin(uv.y * 14.0 - t * 1.5) * 4.0);
        float n2 = cos(uv.x * 20.0 - uv.y * 18.0 + t * 2.0);
        float noise = (n1 + n2) * 0.25;

        float centerDist = abs(uv.x - 0.5) * 2.0;
        float shape = (1.0 - centerDist) * (1.0 - uv.y * 0.85) + noise * (1.0 - uv.y);

        if (shape < 0.15) discard;

        vec3 col = uCoreColor;
        if (uv.y > 0.25) {
          float blend1 = smoothstep(0.25, 0.65, uv.y);
          col = mix(uCoreColor, uMidColor, blend1);
        }
        if (uv.y > 0.60) {
          float blend2 = smoothstep(0.60, 0.95, uv.y);
          col = mix(col, uEdgeColor, blend2);
        }
        if (uv.y > 0.90) {
          float blend3 = smoothstep(0.90, 1.0, uv.y);
          col = mix(col, uSmokeColor, blend3);
        }

        float alpha = clamp(shape * 1.8 * (1.0 - uv.y * 0.4), 0.0, 1.0);
        gl_FragColor = vec4(col, alpha);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide
  });
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

    // 2.1 First-Person & Third-Person Perspective Cameras & Free Orbital Look
    this.isFirstPersonMode = false;
    this.isThirdPersonMode = false;
    this.fpCamera = new THREE.PerspectiveCamera(75, aspect, 0.1, 1000);
    this.fpYaw = 0; // Horizontal rotation radians
    this.fpPitch = 0; // Vertical pitch radians
    this.fpEntityId = null;
    this.tpDistance = 4.5; // Third-person orbital distance
    this.tpMinDistance = 1.2;
    this.tpMaxDistance = 24.0;
    this.fpAutoCam = false; // Auto-cam for 1P mode (optional, user-toggled)
    this.lastTargetPosX = null;
    this.lastTargetPosZ = null;

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
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; // High quality smooth shadows
    this.renderer.setClearColor(0xdde8f5, 1.0);

    // 3.1 Post-Processing Pipeline (Depth of Field, Chromatic Aberration & Atmospheric Lens)
    this.postEffectsEnabled = true;
    this.renderTarget = new THREE.WebGLRenderTarget(Math.max(160, Math.floor(this.width * this.scaleFactor)), Math.max(120, Math.floor(this.height * this.scaleFactor)), {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat
    });
    this.postScene = new THREE.Scene();
    this.postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.postMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: this.renderTarget.texture },
        uChroma: { value: 1.0 },
        uDofStrength: { value: 1.0 }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float uChroma;
        uniform float uDofStrength;
        varying vec2 vUv;

        void main() {
          vec2 uv = vUv;
          vec2 center = uv - 0.5;
          float dist = dot(center, center);

          // Chromatic aberration (RGB fringe towards screen edge)
          float chromaOffset = dist * (uChroma * 0.014);
          float r = texture2D(tDiffuse, uv + center * chromaOffset).r;
          float g = texture2D(tDiffuse, uv).g;
          float b = texture2D(tDiffuse, uv - center * chromaOffset).b;
          float a = texture2D(tDiffuse, uv).a;

          // Multi-tap Golden-Angle Bokeh Depth of Field
          if (uDofStrength > 0.001) {
            float blur = dist * uDofStrength * 0.0065;
            vec4 blurCol = vec4(0.0);
            // 8-tap circular bokeh disk
            blurCol += texture2D(tDiffuse, uv + vec2(-0.707, -0.707) * blur);
            blurCol += texture2D(tDiffuse, uv + vec2( 0.707, -0.707) * blur);
            blurCol += texture2D(tDiffuse, uv + vec2(-0.707,  0.707) * blur);
            blurCol += texture2D(tDiffuse, uv + vec2( 0.707,  0.707) * blur);
            blurCol += texture2D(tDiffuse, uv + vec2( 0.0,    -1.0)   * blur);
            blurCol += texture2D(tDiffuse, uv + vec2( 0.0,     1.0)   * blur);
            blurCol += texture2D(tDiffuse, uv + vec2(-1.0,     0.0)   * blur);
            blurCol += texture2D(tDiffuse, uv + vec2( 1.0,     0.0)   * blur);
            blurCol *= 0.125;

            float blend = smoothstep(0.04, 0.38, dist);
            vec3 finalCol = mix(vec3(r, g, b), blurCol.rgb, blend * 0.65);
            gl_FragColor = vec4(finalCol, a);
          } else {
            gl_FragColor = vec4(r, g, b, a);
          }
        }
      `,
      depthTest: false,
      depthWrite: false
    });
    const postQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.postMaterial);
    this.postScene.add(postQuad);

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
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
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

    // Dynamic Night Point Light Pool (Optimized pool for realistic 1P/3P light propagation)
    this.maxNightLights = 32;
    this.maxShadowPointLights = 0; // Point lights do direct local shading; sun/moon provides directional shadows
    this.nightLightPool = [];
    for (let i = 0; i < this.maxNightLights; i++) {
      const pl = new THREE.PointLight(0xffaa44, 0, 24, 1.2);
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

    // 4.5 Graphic Options (Calibrated via in-game Settings Modal)
    this.graphicOptions = {
      normalMaps: true,
      dofStrength: "HIGH",
      chroma: true,
      waterReflections: true,
      fog: "LIGHT",
      godRays: true,
      lensFlare: true
    };
    this._lastPerspState = null;

    // 4.6 Texture-Derived & Procedural Normal Maps
    const normGrass = generateProceduralTerrainNormalMap("grass", 1.25);
    const normSand = generateProceduralTerrainNormalMap("sand", 1.15);
    const normOak = generateProceduralFoliageNormalMap("oak", 1.5);
    const normPine = generateProceduralFoliageNormalMap("pine", 1.5);
    const normCactus = generateProceduralFoliageNormalMap("cactus", 1.6);
    const normStoneB = createNormalMapFromTexture("Feature_Stone_B.png", 1.6);
    const normStoneC = createNormalMapFromTexture("Feature_Stone_C.png", 1.8);
    const normBrickA = createNormalMapFromTexture("Feature_Brick_A.png", 1.6);
    const normBrickB = createNormalMapFromTexture("Feature_Brick_B.png", 1.5);
    const normBrickC = createNormalMapFromTexture("Feature_Brick_C.png", 1.8);
    const normWood = createNormalMapFromTexture("Feature_Wood.png", 1.5);
    const normWaves = createNormalMapFromTexture("Feature_Waves.png", 1.5);

    const makeMat = (isPersp, baseParams, normalMap = null, normalScale = 1.0, roughness = 0.65, metalness = 0.05) => {
      if (!isPersp || !normalMap) {
        return new THREE.MeshLambertMaterial(baseParams);
      }
      const params = Object.assign({}, baseParams, {
        normalMap: normalMap,
        normalScale: new THREE.Vector2(normalScale, normalScale),
        roughness: roughness,
        metalness: metalness
      });
      return new THREE.MeshStandardMaterial(params);
    };

    const buildDict = (isPersp) => ({
      [TILE_FLOOR]: makeMat(isPersp, { color: 0x2e5424, dithering: true, vertexColors: true, side: THREE.DoubleSide }, normGrass, 0.8, 0.82, 0.05),
      sandClean: makeMat(isPersp, { color: 0xdec078, dithering: true, vertexColors: true, side: THREE.DoubleSide }, normSand, 0.8, 0.88, 0.02),
      [TILE_SAND]: makeMat(isPersp, { map: createTintedTexture("Feature_Pebbles.png", 0x6e5228, 0xdec078, 1.0), dithering: true, vertexColors: true, side: THREE.DoubleSide }, normSand, 0.9, 0.86, 0.03),
      [TILE_STONE]: makeMat(isPersp, { map: createTintedTexture("Feature_Stone_B.png", 0xa5a5af, 0x3a3a44, 1.0), dithering: true, vertexColors: true, side: THREE.DoubleSide }, normStoneB, 1.1, 0.70, 0.08),
      [TILE_MOUNTAIN]: makeMat(isPersp, { map: createTintedTexture("Feature_Stone_C.png", 0xb4afaa, 0x484242, 1.0), dithering: true, vertexColors: true, side: THREE.DoubleSide }, normStoneC, 1.25, 0.65, 0.10),
      [TILE_WATER]: makeMat(isPersp, { color: isPersp ? 0x1668b8 : 0xffffff, map: createTintedTexture("Feature_Waves.png", 0x64b4ff, 0x143764, 1.0), dithering: true, vertexColors: true, transparent: false, opacity: 1.0, side: THREE.DoubleSide }, normWaves, 0.9, 0.18, 0.14),
      [TILE_ROAD_GRASS]: makeMat(isPersp, { map: createTintedTexture("Feature_Stone_B.png", 0xa67c52, 0x3d2816, 1.0), dithering: true, vertexColors: true, side: THREE.DoubleSide }, normStoneB, 0.9, 0.75, 0.05),
      [TILE_ROAD_SAND]: makeMat(isPersp, { map: createTintedTexture("Feature_Pebbles.png", 0xc8a060, 0x5c4220, 1.0), dithering: true, vertexColors: true, side: THREE.DoubleSide }, normSand, 0.9, 0.82, 0.04),
      [TILE_ROAD_STONE]: makeMat(isPersp, { map: createTintedTexture("Feature_Brick_A.png", 0x909098, 0x383842, 1.0), dithering: true, vertexColors: true, side: THREE.DoubleSide }, normBrickA, 1.1, 0.65, 0.08),
      cliff: makeMat(isPersp, { map: createTintedTexture("Feature_Stone_C.png", 0x887a6a, 0x2b2218, 1.0), dithering: true, vertexColors: true, side: THREE.DoubleSide }, normStoneC, 1.1, 0.72, 0.05),
      grassFoliage: makeMat(isPersp, { map: createTintedTexture("Feature_Grass.png", 0x3c7228, 0x000000, 0.0), dithering: true, transparent: false, alphaTest: 0.5, depthWrite: true, depthTest: true, side: THREE.DoubleSide }, normGrass, 0.7, 0.85, 0.02),
      treeTrunk: makeMat(isPersp, { color: 0x583c1e, dithering: true }, normWood, 0.9, 0.75, 0.02),
      oakLeaves: makeMat(isPersp, { color: 0x3e8226, dithering: true }, normOak, 1.2, 0.70, 0.02),
      pineLeaves: makeMat(isPersp, { color: 0x205222, dithering: true }, normPine, 1.2, 0.70, 0.02),
      cactus: makeMat(isPersp, { color: 0x3c7c2c, dithering: true }, normCactus, 1.3, 0.75, 0.02),
      houseWall: makeMat(isPersp, { map: createTintedTexture("Feature_Brick_B.png", 0xfffaea, 0x8a6242, 1.0), dithering: true, side: THREE.DoubleSide }, normBrickB, 1.0, 0.60, 0.05),
      houseRoof: makeMat(isPersp, { map: createTintedTexture("Feature_Brick_C.png", 0xff6238, 0x941e0a, 1.0), dithering: true, side: THREE.DoubleSide }, normBrickC, 1.2, 0.45, 0.08),
      woodHouseWall: makeMat(isPersp, { map: createTintedTexture("Feature_Wood.png", 0xd4a373, 0x4a3525, 1.0), dithering: true, side: THREE.DoubleSide }, normWood, 0.9, 0.65, 0.04),
      woodHouseRoof: makeMat(isPersp, { map: createTintedTexture("Feature_Wood.png", 0xa67c52, 0x3b271a, 1.0), dithering: true, side: THREE.DoubleSide }, normWood, 1.0, 0.55, 0.05),
      stoneHouseWall: makeMat(isPersp, { map: createTintedTexture("Feature_Brick_A.png", 0xd8d7de, 0x3a3842, 1.0), dithering: true, side: THREE.DoubleSide }, normBrickA, 1.05, 0.60, 0.06),
      stoneHouseRoof: makeMat(isPersp, { map: createTintedTexture("Feature_Brick_A.png", 0x9098a8, 0x2d3748, 1.0), dithering: true, side: THREE.DoubleSide }, normBrickA, 1.15, 0.50, 0.08),
      houseBlueprint: new THREE.MeshLambertMaterial({ map: createTintedTexture("Feature_Wood.png", 0xdfa052, 0x5a3418, 1.0), dithering: true, side: THREE.DoubleSide }),
      wall: makeMat(isPersp, { map: createTintedTexture("Feature_Brick_A.png", 0xd8d7de, 0x3a3842, 1.0), dithering: true, side: THREE.DoubleSide }, normBrickA, 1.0, 0.60, 0.05),
      woodWall: makeMat(isPersp, { map: createTintedTexture("Feature_Wood.png", 0xc89858, 0x482c18, 1.0), dithering: true, side: THREE.DoubleSide }, normWood, 0.9, 0.65, 0.04),
      mixedWall: makeMat(isPersp, { map: createTintedTexture("Feature_Brick_B.png", 0xdfd0b0, 0x3d3024, 1.0), dithering: true, side: THREE.DoubleSide }, normBrickB, 1.0, 0.60, 0.05),
      wallBlueprint: new THREE.MeshLambertMaterial({ map: createTintedTexture("Feature_Brick_A.png", 0x9a8f82, 0x3d3024, 1.0), dithering: true, side: THREE.DoubleSide }),
      woodLog: makeMat(isPersp, { map: createTintedTexture("Feature_Wood.png", 0xc89858, 0x3d2210, 1.0), dithering: true, side: THREE.DoubleSide }, normWood, 0.9, 0.70, 0.03),
      stoneItem: makeMat(isPersp, { map: createTintedTexture("Feature_Stone_B.png", 0xd8d8e6, 0x3c3c46, 1.0), dithering: true, side: THREE.DoubleSide }, normStoneB, 1.0, 0.65, 0.05),
      gate: makeMat(isPersp, { map: createTintedTexture("Feature_Wood.png", 0xad7842, 0x3a2214, 1.0), dithering: true, side: THREE.DoubleSide }, normWood, 0.9, 0.65, 0.04),
      gateBlueprint: new THREE.MeshLambertMaterial({ map: createTintedTexture("Feature_Wood.png", 0xc89858, 0x482c18, 1.0), dithering: true, side: THREE.DoubleSide }),
      torchFlames: isPersp ? createRealisticFlameMaterial() : new THREE.MeshBasicMaterial({ color: 0xffaa33, dithering: true }),
      campfireLogs: makeMat(isPersp, { map: createTintedTexture("Feature_Wood.png", 0x8a5228, 0x2e1a0a, 1.0), dithering: true, side: THREE.DoubleSide }, normWood, 0.9, 0.70, 0.03),
      campfireFlames: isPersp ? createRealisticFlameMaterial() : new THREE.MeshBasicMaterial({ color: 0xff7711, dithering: true }),
      warehouse: makeMat(isPersp, { map: createTintedTexture("Feature_Wood.png", 0xd4a373, 0x4a3525, 1.0), dithering: true, side: THREE.DoubleSide }, normWood, 0.9, 0.65, 0.04),
      stoneWarehouse: makeMat(isPersp, { map: createTintedTexture("Feature_Brick_A.png", 0xd8d7de, 0x3a3842, 1.0), dithering: true, side: THREE.DoubleSide }, normBrickA, 1.0, 0.60, 0.05),
      slaughterhouseTimber: makeMat(isPersp, { map: createTintedTexture("Feature_Wood.png", 0xc89858, 0x482c18, 1.0), dithering: true, side: THREE.DoubleSide }, normWood, 0.9, 0.65, 0.04),
      slaughterhouseStone: makeMat(isPersp, { map: createTintedTexture("Feature_Brick_A.png", 0xd8d7de, 0x3a3842, 1.0), dithering: true, side: THREE.DoubleSide }, normBrickA, 1.0, 0.60, 0.05),
      kitchenBrick: makeMat(isPersp, { map: createTintedTexture("Feature_Brick_B.png", 0xfffaea, 0x8a6242, 1.0), dithering: true, side: THREE.DoubleSide }, normBrickB, 1.0, 0.60, 0.05),
      kitchenTimber: makeMat(isPersp, { map: createTintedTexture("Feature_Wood.png", 0xd4a373, 0x4a3525, 1.0), dithering: true, side: THREE.DoubleSide }, normWood, 0.9, 0.65, 0.04),
      multiBuildingPalette: [
        makeMat(isPersp, { map: createTintedTexture("Feature_Brick_A.png", 0xd8d7de, 0x3a3842, 1.0), dithering: true, side: THREE.DoubleSide }, normBrickA, 1.0, 0.60, 0.05),
        makeMat(isPersp, { map: createTintedTexture("Feature_Wood.png", 0xc89858, 0x482c18, 1.0), dithering: true, side: THREE.DoubleSide }, normWood, 0.9, 0.65, 0.04),
        makeMat(isPersp, { map: createTintedTexture("Feature_Brick_B.png", 0xfffaea, 0x8a6242, 1.0), dithering: true, side: THREE.DoubleSide }, normBrickB, 1.0, 0.60, 0.05),
        makeMat(isPersp, { map: createTintedTexture("Feature_Wood.png", 0x4a2e18, 0x1a0f08, 1.0), dithering: true, side: THREE.DoubleSide }, normWood, 0.9, 0.65, 0.04),
        makeMat(isPersp, { map: createTintedTexture("Feature_Wood.png", 0xb87838, 0x3e1e0a, 1.0), dithering: true, side: THREE.DoubleSide }, normWood, 0.9, 0.65, 0.04),
        new THREE.MeshLambertMaterial({ color: 0x64c8ff, dithering: true, side: THREE.DoubleSide }),
        makeMat(isPersp, { map: createTintedTexture("Feature_Brick_C.png", 0xb44a2c, 0x4a180c, 1.0), dithering: true, side: THREE.DoubleSide }, normBrickC, 1.2, 0.50, 0.08),
        makeMat(isPersp, { map: createTintedTexture("Feature_Brick_C.png", 0xdb5832, 0x6a1c0c, 1.0), dithering: true, side: THREE.DoubleSide }, normBrickC, 1.2, 0.50, 0.08),
        makeMat(isPersp, { map: createTintedTexture("Feature_Grass.png", 0xd4a044, 0x583e10, 1.0), dithering: true, side: THREE.DoubleSide }, normGrass, 0.8, 0.80, 0.02),
        makeMat(isPersp, { map: createTintedTexture("Feature_Brick_A.png", 0x4a5568, 0x1a202c, 1.0), dithering: true, side: THREE.DoubleSide }, normBrickA, 1.0, 0.55, 0.08),
        makeMat(isPersp, { map: createTintedTexture("Feature_Brick_B.png", 0xd49b6a, 0x4a2e1a, 1.0), dithering: true, side: THREE.DoubleSide }, normBrickB, 1.0, 0.60, 0.05),
        makeMat(isPersp, { map: createTintedTexture("Feature_Wood.png", 0xd4a040, 0x44260a, 1.0), dithering: true, side: THREE.DoubleSide }, normWood, 0.9, 0.65, 0.04),
        makeMat(isPersp, { map: createTintedTexture("Feature_Stone_C.png", 0x383842, 0x141418, 1.0), dithering: true, side: THREE.DoubleSide }, normStoneC, 1.1, 0.65, 0.08)
      ],
      warehouseWalls: [
        makeMat(isPersp, { map: createTintedTexture("Feature_Wood.png", 0xd4a373, 0x4a3525, 1.0), dithering: true, side: THREE.DoubleSide }, normWood, 0.9, 0.65, 0.04),
        makeMat(isPersp, { map: createTintedTexture("Feature_Brick_A.png", 0xd8d7de, 0x3a3842, 1.0), dithering: true, side: THREE.DoubleSide }, normBrickA, 1.0, 0.60, 0.05)
      ],
      warehouseRoofs: [
        makeMat(isPersp, { map: createTintedTexture("Feature_Brick_C.png", 0xffffff, 0x888888, 1.0), dithering: true, side: THREE.DoubleSide }, normBrickC, 1.2, 0.45, 0.08),
        makeMat(isPersp, { map: createTintedTexture("Feature_Brick_C.png", 0xffffff, 0x888888, 1.0), dithering: true, side: THREE.DoubleSide }, normBrickC, 1.2, 0.45, 0.08)
      ],
      slaughterhouseWalls: [
        makeMat(isPersp, { map: createTintedTexture("Feature_Wood.png", 0xc89858, 0x482c18, 1.0), dithering: true, side: THREE.DoubleSide }, normWood, 0.9, 0.65, 0.04),
        makeMat(isPersp, { map: createTintedTexture("Feature_Brick_A.png", 0xd8d7de, 0x3a3842, 1.0), dithering: true, side: THREE.DoubleSide }, normBrickA, 1.0, 0.60, 0.05)
      ],
      slaughterhouseRoofs: [
        makeMat(isPersp, { map: createTintedTexture("Feature_Brick_C.png", 0xffffff, 0x888888, 1.0), dithering: true, side: THREE.DoubleSide }, normBrickC, 1.2, 0.45, 0.08),
        makeMat(isPersp, { map: createTintedTexture("Feature_Brick_C.png", 0xffffff, 0x888888, 1.0), dithering: true, side: THREE.DoubleSide }, normBrickC, 1.2, 0.45, 0.08)
      ],
      kitchenWalls: [
        makeMat(isPersp, { map: createTintedTexture("Feature_Brick_B.png", 0xfffaea, 0x8a6242, 1.0), dithering: true, side: THREE.DoubleSide }, normBrickB, 1.0, 0.60, 0.05),
        makeMat(isPersp, { map: createTintedTexture("Feature_Wood.png", 0xd4a373, 0x4a3525, 1.0), dithering: true, side: THREE.DoubleSide }, normWood, 0.9, 0.65, 0.04)
      ],
      kitchenRoofs: [
        makeMat(isPersp, { map: createTintedTexture("Feature_Brick_C.png", 0xffffff, 0x888888, 1.0), dithering: true, side: THREE.DoubleSide }, normBrickC, 1.2, 0.45, 0.08),
        makeMat(isPersp, { map: createTintedTexture("Feature_Brick_C.png", 0xffffff, 0x888888, 1.0), dithering: true, side: THREE.DoubleSide }, normBrickC, 1.2, 0.45, 0.08)
      ],
      houseWallVariants: [
        makeMat(isPersp, { map: createTintedTexture("Feature_Wood.png", 0xd4a373, 0x4a3525, 1.0), dithering: true, side: THREE.DoubleSide }, normWood, 0.9, 0.65, 0.04),
        makeMat(isPersp, { map: createTintedTexture("Feature_Brick_A.png", 0xd8d7de, 0x3a3842, 1.0), dithering: true, side: THREE.DoubleSide }, normBrickA, 1.0, 0.60, 0.05),
        makeMat(isPersp, { map: createTintedTexture("Feature_Brick_B.png", 0xfffaea, 0x8a6242, 1.0), dithering: true, side: THREE.DoubleSide }, normBrickB, 1.0, 0.60, 0.05),
        makeMat(isPersp, { map: createTintedTexture("Feature_Wood.png", 0xc89858, 0x482c18, 1.0), dithering: true, side: THREE.DoubleSide }, normWood, 0.9, 0.65, 0.04),
        makeMat(isPersp, { map: createTintedTexture("Feature_Brick_B.png", 0xfffaea, 0x8a6242, 1.0), dithering: true, side: THREE.DoubleSide }, normBrickB, 1.0, 0.60, 0.05),
        makeMat(isPersp, { map: createTintedTexture("Feature_Brick_B.png", 0xdfd0b0, 0x3d3024, 1.0), dithering: true, side: THREE.DoubleSide }, normBrickB, 1.0, 0.60, 0.05),
        makeMat(isPersp, { map: createTintedTexture("Feature_Brick_A.png", 0xd8d7de, 0x3a3842, 1.0), dithering: true, side: THREE.DoubleSide }, normBrickA, 1.0, 0.60, 0.05),
        makeMat(isPersp, { map: createTintedTexture("Feature_Wood.png", 0xd4a373, 0x4a3525, 1.0), dithering: true, side: THREE.DoubleSide }, normWood, 0.9, 0.65, 0.04),
        makeMat(isPersp, { map: createTintedTexture("Feature_Brick_A.png", 0xd8d7de, 0x3a3842, 1.0), dithering: true, side: THREE.DoubleSide }, normBrickA, 1.0, 0.60, 0.05),
        makeMat(isPersp, { map: createTintedTexture("Feature_Brick_A.png", 0xd8d7de, 0x3a3842, 1.0), dithering: true, side: THREE.DoubleSide }, normBrickA, 1.0, 0.60, 0.05),
        makeMat(isPersp, { map: createTintedTexture("Feature_Wood.png", 0xd4a373, 0x4a3525, 1.0), dithering: true, side: THREE.DoubleSide }, normWood, 0.9, 0.65, 0.04),
        makeMat(isPersp, { map: createTintedTexture("Feature_Brick_A.png", 0xd8d7de, 0x3a3842, 1.0), dithering: true, side: THREE.DoubleSide }, normBrickA, 1.0, 0.60, 0.05),
        makeMat(isPersp, { map: createTintedTexture("Feature_Wood.png", 0xa67c52, 0x3b271a, 1.0), dithering: true, side: THREE.DoubleSide }, normWood, 0.9, 0.65, 0.04),
        makeMat(isPersp, { map: createTintedTexture("Feature_Brick_B.png", 0xfffaea, 0x8a6242, 1.0), dithering: true, side: THREE.DoubleSide }, normBrickB, 1.0, 0.60, 0.05),
        makeMat(isPersp, { map: createTintedTexture("Feature_Wood.png", 0xd4a373, 0x4a3525, 1.0), dithering: true, side: THREE.DoubleSide }, normWood, 0.9, 0.65, 0.04),
        makeMat(isPersp, { map: createTintedTexture("Feature_Brick_A.png", 0xd8d7de, 0x3a3842, 1.0), dithering: true, side: THREE.DoubleSide }, normBrickA, 1.0, 0.60, 0.05),
        makeMat(isPersp, { map: createTintedTexture("Feature_Wood.png", 0xba8048, 0x3d2412, 1.0), dithering: true, side: THREE.DoubleSide }, normWood, 0.9, 0.65, 0.04),
        makeMat(isPersp, { map: createTintedTexture("Feature_Brick_B.png", 0xfffaea, 0x8a6242, 1.0), dithering: true, side: THREE.DoubleSide }, normBrickB, 1.0, 0.60, 0.05),
        makeMat(isPersp, { map: createTintedTexture("Feature_Brick_B.png", 0xdfd0b0, 0x3d3024, 1.0), dithering: true, side: THREE.DoubleSide }, normBrickB, 1.0, 0.60, 0.05),
        makeMat(isPersp, { map: createTintedTexture("Feature_Wood.png", 0xba8048, 0x3d2412, 1.0), dithering: true, side: THREE.DoubleSide }, normWood, 0.9, 0.65, 0.04)
      ],
      houseRoofVariants: [
        makeMat(isPersp, { map: createTintedTexture("Feature_Brick_C.png", 0xffffff, 0x888888, 1.0), dithering: true, side: THREE.DoubleSide }, normBrickC, 1.2, 0.45, 0.08),
        makeMat(isPersp, { map: createTintedTexture("Feature_Brick_C.png", 0xffffff, 0x888888, 1.0), dithering: true, side: THREE.DoubleSide }, normBrickC, 1.2, 0.45, 0.08),
        makeMat(isPersp, { map: createTintedTexture("Feature_Wood.png", 0xffffff, 0x888888, 1.0), dithering: true, side: THREE.DoubleSide }, normWood, 0.9, 0.55, 0.04),
        makeMat(isPersp, { map: createTintedTexture("Feature_Brick_C.png", 0xffffff, 0x888888, 1.0), dithering: true, side: THREE.DoubleSide }, normBrickC, 1.2, 0.45, 0.08),
        makeMat(isPersp, { map: createTintedTexture("Feature_Wood.png", 0xffffff, 0x888888, 1.0), dithering: true, side: THREE.DoubleSide }, normWood, 0.9, 0.55, 0.04),
        makeMat(isPersp, { map: createTintedTexture("Feature_Brick_C.png", 0xffffff, 0x888888, 1.0), dithering: true, side: THREE.DoubleSide }, normBrickC, 1.2, 0.45, 0.08),
        makeMat(isPersp, { map: createTintedTexture("Feature_Brick_C.png", 0xffffff, 0x888888, 1.0), dithering: true, side: THREE.DoubleSide }, normBrickC, 1.2, 0.45, 0.08),
        makeMat(isPersp, { map: createTintedTexture("Feature_Wood.png", 0xffffff, 0x888888, 1.0), dithering: true, side: THREE.DoubleSide }, normWood, 0.9, 0.55, 0.04),
        makeMat(isPersp, { map: createTintedTexture("Feature_Brick_A.png", 0xffffff, 0x888888, 1.0), dithering: true, side: THREE.DoubleSide }, normBrickA, 1.0, 0.55, 0.08),
        makeMat(isPersp, { map: createTintedTexture("Feature_Brick_C.png", 0xffffff, 0x888888, 1.0), dithering: true, side: THREE.DoubleSide }, normBrickC, 1.2, 0.45, 0.08),
        makeMat(isPersp, { map: createTintedTexture("Feature_Wood.png", 0xffffff, 0x888888, 1.0), dithering: true, side: THREE.DoubleSide }, normWood, 0.9, 0.55, 0.04),
        makeMat(isPersp, { map: createTintedTexture("Feature_Brick_A.png", 0xffffff, 0x888888, 1.0), dithering: true, side: THREE.DoubleSide }, normBrickA, 1.0, 0.55, 0.08),
        makeMat(isPersp, { map: createTintedTexture("Feature_Wood.png", 0xffffff, 0x888888, 1.0), dithering: true, side: THREE.DoubleSide }, normWood, 0.9, 0.55, 0.04),
        makeMat(isPersp, { map: createTintedTexture("Feature_Brick_C.png", 0xffffff, 0x888888, 1.0), dithering: true, side: THREE.DoubleSide }, normBrickC, 1.2, 0.45, 0.08),
        makeMat(isPersp, { map: createTintedTexture("Feature_Wood.png", 0xffffff, 0x888888, 1.0), dithering: true, side: THREE.DoubleSide }, normWood, 0.9, 0.55, 0.04),
        makeMat(isPersp, { map: createTintedTexture("Feature_Brick_C.png", 0xffffff, 0x888888, 1.0), dithering: true, side: THREE.DoubleSide }, normBrickC, 1.2, 0.45, 0.08),
        makeMat(isPersp, { map: createTintedTexture("Feature_Wood.png", 0xffffff, 0x888888, 1.0), dithering: true, side: THREE.DoubleSide }, normWood, 0.9, 0.55, 0.04),
        makeMat(isPersp, { map: createTintedTexture("Feature_Brick_C.png", 0xffffff, 0x888888, 1.0), dithering: true, side: THREE.DoubleSide }, normBrickC, 1.2, 0.45, 0.08),
        makeMat(isPersp, { map: createTintedTexture("Feature_Brick_B.png", 0xffffff, 0x888888, 1.0), dithering: true, side: THREE.DoubleSide }, normBrickB, 1.0, 0.55, 0.05),
        makeMat(isPersp, { map: createTintedTexture("Feature_Wood.png", 0xffffff, 0x888888, 1.0), dithering: true, side: THREE.DoubleSide }, normWood, 0.9, 0.55, 0.04)
      ],
      leaderWallVariants: [
        makeMat(isPersp, { map: createTintedTexture("Feature_Brick_A.png", 0xd8d7de, 0x3a3842, 1.0), dithering: true, side: THREE.DoubleSide }, normBrickA, 1.0, 0.60, 0.05),
        makeMat(isPersp, { map: createTintedTexture("Feature_Wood.png", 0xb87a40, 0x3a2214, 1.0), dithering: true, side: THREE.DoubleSide }, normWood, 0.9, 0.65, 0.04),
        makeMat(isPersp, { map: createTintedTexture("Feature_Brick_B.png", 0xdfd0b0, 0x3d3024, 1.0), dithering: true, side: THREE.DoubleSide }, normBrickB, 1.0, 0.60, 0.05),
        makeMat(isPersp, { map: createTintedTexture("Feature_Wood.png", 0xc89858, 0x482c18, 1.0), dithering: true, side: THREE.DoubleSide }, normWood, 0.9, 0.65, 0.04),
        makeMat(isPersp, { map: createTintedTexture("Feature_Brick_B.png", 0xfffaea, 0x8a6242, 1.0), dithering: true, side: THREE.DoubleSide }, normBrickB, 1.0, 0.60, 0.05),
        makeMat(isPersp, { map: createTintedTexture("Feature_Stone_C.png", 0x383842, 0x141418, 1.0), dithering: true, side: THREE.DoubleSide }, normStoneC, 1.1, 0.65, 0.08),
        makeMat(isPersp, { map: createTintedTexture("Feature_Brick_A.png", 0xd8d7de, 0x3a3842, 1.0), dithering: true, side: THREE.DoubleSide }, normBrickA, 1.0, 0.60, 0.05)
      ],
      leaderRoofVariants: [
        makeMat(isPersp, { map: createTintedTexture("Feature_Brick_C.png", 0xffffff, 0x888888, 1.0), dithering: true, side: THREE.DoubleSide }, normBrickC, 1.2, 0.45, 0.08),
        makeMat(isPersp, { map: createTintedTexture("Feature_Wood.png", 0xffffff, 0x888888, 1.0), dithering: true, side: THREE.DoubleSide }, normWood, 0.9, 0.55, 0.04),
        makeMat(isPersp, { map: createTintedTexture("Feature_Brick_B.png", 0xffffff, 0x888888, 1.0), dithering: true, side: THREE.DoubleSide }, normBrickB, 1.0, 0.55, 0.05),
        makeMat(isPersp, { map: createTintedTexture("Feature_Brick_C.png", 0xffffff, 0x888888, 1.0), dithering: true, side: THREE.DoubleSide }, normBrickC, 1.2, 0.45, 0.08),
        makeMat(isPersp, { map: createTintedTexture("Feature_Brick_C.png", 0xffffff, 0x888888, 1.0), dithering: true, side: THREE.DoubleSide }, normBrickC, 1.2, 0.45, 0.08),
        makeMat(isPersp, { map: createTintedTexture("Feature_Brick_A.png", 0xffffff, 0x888888, 1.0), dithering: true, side: THREE.DoubleSide }, normBrickA, 1.0, 0.55, 0.08),
        makeMat(isPersp, { map: createTintedTexture("Feature_Brick_C.png", 0xffffff, 0x888888, 1.0), dithering: true, side: THREE.DoubleSide }, normBrickC, 1.2, 0.45, 0.08)
      ],
      boneHouseWall: makeMat(isPersp, { map: createTintedTexture("Feature_Stone_B.png", 0xf5f3ea, 0x5a554a, 1.0), dithering: true, side: THREE.DoubleSide }, normStoneB, 1.0, 0.65, 0.05),
      boneHouseRoof: makeMat(isPersp, { map: createTintedTexture("Feature_Stone_B.png", 0xe6e2d3, 0x3d3830, 1.0), dithering: true, side: THREE.DoubleSide }, normStoneB, 1.0, 0.65, 0.05),
      boneWall: makeMat(isPersp, { map: createTintedTexture("Feature_Stone_B.png", 0xf5f3ea, 0x5a554a, 1.0), dithering: true, side: THREE.DoubleSide }, normStoneB, 1.0, 0.65, 0.05),
      road: makeMat(isPersp, { map: createTintedTexture("Feature_Stone_B.png", 0x9b7653, 0x4a3520, 1.0), dithering: true, side: THREE.DoubleSide }, normStoneB, 0.9, 0.75, 0.05),
      roadSnap: makeMat(isPersp, { map: createTintedTexture("Feature_Pebbles.png", 0xd8ba80, 0x6a5024, 1.0), dithering: true, side: THREE.DoubleSide }, normSand, 0.9, 0.82, 0.04),
      waterWellBase: makeMat(isPersp, { map: createTintedTexture("Feature_Brick_A.png", 0xd8d7de, 0x3a3842, 1.0), dithering: true, side: THREE.DoubleSide }, normBrickA, 1.0, 0.60, 0.05),
      waterWellWood: makeMat(isPersp, { map: createTintedTexture("Feature_Wood.png", 0xd4a373, 0x4a3525, 1.0), dithering: true, side: THREE.DoubleSide }, normWood, 0.9, 0.65, 0.04),
      waterWellRoof: makeMat(isPersp, { map: createTintedTexture("Feature_Brick_C.png", 0xffffff, 0x888888, 1.0), dithering: true, side: THREE.DoubleSide }, normBrickC, 1.2, 0.45, 0.08),
      woodBridge: makeMat(isPersp, { map: createTintedTexture("Feature_Wood.png", 0x8b5a2b, 0x3a2214, 1.0), dithering: true, side: THREE.DoubleSide }, normWood, 0.9, 0.65, 0.04),
      stoneBridge: makeMat(isPersp, { map: createTintedTexture("Feature_Brick_A.png", 0xc8c8c8, 0x4a4a4a, 1.0), dithering: true, side: THREE.DoubleSide }, normBrickA, 1.0, 0.60, 0.05),
      waterPlatform: makeMat(isPersp, { map: createTintedTexture("Feature_Wood.png", 0x7c4c24, 0x2e1a0e, 1.0), dithering: true, side: THREE.DoubleSide }, normWood, 0.9, 0.65, 0.04)
    });

    this.materialsIso = buildDict(false);
    this.materialsPerspective = buildDict(true);
    this.materials = Object.assign({}, this.materialsIso);

    // Apply Bayer ordered dithering to all materials in both Isometric and 1P/3P Perspective modes
    for (const dict of [this.materialsIso, this.materialsPerspective]) {
      for (const mat of Object.values(dict)) {
        if (Array.isArray(mat)) {
          for (const m of mat) applyRetroDitherToMaterial(m);
        } else {
          applyRetroDitherToMaterial(mat);
        }
      }
      applyWindFoliageShader(dict.oakLeaves, 0.055);
      applyWindFoliageShader(dict.pineLeaves, 0.038);
      applyWindFoliageShader(dict.grassFoliage, 0.025);
    }

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

    // 20 Distinct House Variations InstancedMeshes (Separate Walls & Roofs)
    const houseWallGeos = [
      createWoodCabinWallGeo(),
      createStoneCottageWallGeo(),
      createThatchedHutWallGeo(),
      createLogLodgeWallGeo(),
      createHalfTimberedWallGeo(),
      createMudBrickAdobeWallGeo(),
      createMountainStiltWallGeo(),
      createLonghouseWallGeo(),
      createBoneOssuaryWallGeo(),
      createWatchtowerVillaWallGeo(),
      createTimberTowerWallGeo(),
      createStoneTownhouseWallGeo(),
      createStiltWatchShackWallGeo(),
      createPlasterSteepleWallGeo(),
      createSingleCabinWallGeo(),
      createSingleStoneCottageWallGeo(),
      createFencedRanchWallGeo(),
      createCourtyardHaciendaWallGeo(),
      createAdobeRanchoWallGeo(),
      createGroundCroftWallGeo()
    ];
    const houseRoofGeos = [
      createWoodCabinRoofGeo(),
      createStoneCottageRoofGeo(),
      createThatchedHutRoofGeo(),
      createLogLodgeRoofGeo(),
      createHalfTimberedRoofGeo(),
      createMudBrickAdobeRoofGeo(),
      createMountainStiltRoofGeo(),
      createLonghouseRoofGeo(),
      createBoneOssuaryRoofGeo(),
      createWatchtowerVillaRoofGeo(),
      createTimberTowerRoofGeo(),
      createStoneTownhouseRoofGeo(),
      createStiltWatchShackRoofGeo(),
      createPlasterSteepleRoofGeo(),
      createSingleCabinRoofGeo(),
      createSingleStoneCottageRoofGeo(),
      createFencedRanchRoofGeo(),
      createCourtyardHaciendaRoofGeo(),
      createAdobeRanchoRoofGeo(),
      createGroundCroftRoofGeo()
    ];

    this.instHouseWallVariants = houseWallGeos.map((geo, idx) => {
      const mesh = new THREE.InstancedMesh(geo, this.materials.houseWallVariants[idx], 200);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      return mesh;
    });

    this.instHouseRoofVariants = houseRoofGeos.map((geo, idx) => {
      const mesh = new THREE.InstancedMesh(geo, this.materials.houseRoofVariants[idx], 200);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      return mesh;
    });

    // 7 Distinct Leader House / Chieftain Palace Variations (3x3 Footprint, 7 Stories)
    const leaderWallGeos = [
      createLeaderCitadelWallGeo(),
      createLeaderJarlHallWallGeo(),
      createLeaderZigguratWallGeo(),
      createLeaderPagodaWallGeo(),
      createLeaderSanctuaryWallGeo(),
      createLeaderMonolithWallGeo(),
      createLeaderImperialWallGeo()
    ];
    const leaderRoofGeos = [
      createLeaderCitadelRoofGeo(),
      createLeaderJarlHallRoofGeo(),
      createLeaderZigguratRoofGeo(),
      createLeaderPagodaRoofGeo(),
      createLeaderSanctuaryRoofGeo(),
      createLeaderMonolithRoofGeo(),
      createLeaderImperialRoofGeo()
    ];

    this.instLeaderHouseWallVariants = leaderWallGeos.map((geo, idx) => {
      const mesh = new THREE.InstancedMesh(geo, this.materials.leaderWallVariants[idx], 50);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      return mesh;
    });

    this.instLeaderHouseRoofVariants = leaderRoofGeos.map((geo, idx) => {
      const mesh = new THREE.InstancedMesh(geo, this.materials.leaderRoofVariants[idx], 50);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      return mesh;
    });

    // Fallback House Geometries for Backward-Compatibility
    const houseWallGeo = new THREE.BoxGeometry(1.5, 1.2, 1.5); houseWallGeo.translate(0, 0.6, 0);
    this.instHouseWalls = new THREE.InstancedMesh(houseWallGeo, this.materials.houseWall, 100);
    this.instHouseRoofs = new THREE.InstancedMesh(createPitchedRoofGeometry(1.68, 1.68, 0.78), this.materials.houseRoof, 100);
    this.instWoodHouseWalls = this.instHouseWallVariants[0];
    this.instWoodHouseRoofs = this.instHouseRoofVariants[0];
    this.instStoneHouseWalls = this.instHouseWallVariants[1];
    this.instStoneHouseRoofs = this.instHouseRoofVariants[1];
    this.instBoneHouseWalls = this.instHouseWallVariants[8];
    this.instBoneHouseRoofs = this.instHouseRoofVariants[8];

    // Bone Wall (Rib Fence + Skulls)
    const boneWallGeo = createBoneWallGeometry();
    this.instBoneWalls = new THREE.InstancedMesh(boneWallGeo, this.materials.boneWall, this.maxInstances);
    this.instBoneWalls.castShadow = true;
    this.instBoneWalls.receiveShadow = true;

    // 2 Variations of Clan Stockpile Warehouses (Timber Barn vs Stone Depot)
    const whWallGeos = [createWarehouseWallGeo0(), createWarehouseWallGeo1()];
    const whRoofGeos = [createWarehouseRoofGeo0(), createWarehouseRoofGeo1()];
    this.instWarehouseWalls = whWallGeos.map((geo, idx) => {
      const mesh = new THREE.InstancedMesh(geo, this.materials.warehouseWalls[idx], 100);
      mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
      return mesh;
    });
    this.instWarehouseRoofs = whRoofGeos.map((geo, idx) => {
      const mesh = new THREE.InstancedMesh(geo, this.materials.warehouseRoofs[idx], 100);
      mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
      return mesh;
    });
    this.instWarehouses = this.instWarehouseWalls; // Backward compatibility

    // 2 Variations of Slaughterhouses (Timber vs Stone)
    const shWallGeos = [createTimberAbatedouroWallGeo(), createStoneAbatedouroWallGeo()];
    const shRoofGeos = [createTimberAbatedouroRoofGeo(), createStoneAbatedouroRoofGeo()];
    this.instSlaughterhouseWalls = shWallGeos.map((geo, idx) => {
      const mesh = new THREE.InstancedMesh(geo, this.materials.slaughterhouseWalls[idx], 100);
      mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
      return mesh;
    });
    this.instSlaughterhouseRoofs = shRoofGeos.map((geo, idx) => {
      const mesh = new THREE.InstancedMesh(geo, this.materials.slaughterhouseRoofs[idx], 100);
      mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
      return mesh;
    });
    this.instSlaughterhouses = this.instSlaughterhouseWalls; // Backward compatibility

    // 2 Variations of Kitchens (Brick Oven vs Timber Smokery)
    const kitWallGeos = [createBrickOvenKitchenWallGeo(), createTimberSmokeryKitchenWallGeo()];
    const kitRoofGeos = [createBrickOvenKitchenRoofGeo(), createTimberSmokeryKitchenRoofGeo()];
    this.instKitchenWalls = kitWallGeos.map((geo, idx) => {
      const mesh = new THREE.InstancedMesh(geo, this.materials.kitchenWalls[idx], 100);
      mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
      return mesh;
    });
    this.instKitchenRoofs = kitRoofGeos.map((geo, idx) => {
      const mesh = new THREE.InstancedMesh(geo, this.materials.kitchenRoofs[idx], 100);
      mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
      return mesh;
    });
    this.instKitchens = this.instKitchenWalls; // Backward compatibility

    // 3D Ancient Stone Water Well with Timber Frame & Terracotta Roof Canopy
    const wellBaseGeo = createWaterWellBaseGeometry();
    const wellWoodGeo = createWaterWellWoodGeometry();
    const wellRoofGeo = createWaterWellRoofGeometry();
    this.instWaterWellBase = new THREE.InstancedMesh(wellBaseGeo, this.materials.waterWellBase, 200);
    this.instWaterWellWood = new THREE.InstancedMesh(wellWoodGeo, this.materials.waterWellWood, 200);
    this.instWaterWellRoof = new THREE.InstancedMesh(wellRoofGeo, this.materials.waterWellRoof, 200);
    for (const wMesh of [this.instWaterWellBase, this.instWaterWellWood, this.instWaterWellRoof]) {
      wMesh.castShadow = true;
      wMesh.receiveShadow = true;
      wMesh.frustumCulled = false;
    }

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

    // Natural Grass Tufts (Proportional height, delicate blades, high buffer capacity)
    const grassGeo = createNaturalGrassGeometry(0.44, 0.42);
    this.instGrassTufts = new THREE.InstancedMesh(grassGeo, this.materials.grassFoliage, 5000);

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
    for (const w of this.instWarehouseWalls) w.frustumCulled = false;
    for (const w of this.instWarehouseRoofs) w.frustumCulled = false;
    for (const s of this.instSlaughterhouseWalls) s.frustumCulled = false;
    for (const s of this.instSlaughterhouseRoofs) s.frustumCulled = false;
    for (const k of this.instKitchenWalls) k.frustumCulled = false;
    for (const k of this.instKitchenRoofs) k.frustumCulled = false;
    this.instWaterWellBase.frustumCulled = false;
    this.instWaterWellWood.frustumCulled = false;
    this.instWaterWellRoof.frustumCulled = false;
    for (const hw of this.instHouseWallVariants) hw.frustumCulled = false;
    for (const hr of this.instHouseRoofVariants) hr.frustumCulled = false;
    this.instHouseWalls.frustumCulled = false;
    this.instHouseRoofs.frustumCulled = false;
    this.instHousePegs.frustumCulled = false;
    this.instHouseStage1.frustumCulled = false;
    this.instHouseStage2.frustumCulled = false;
    this.instHouseStage3.frustumCulled = false;
    for (const hw of this.instLeaderHouseWallVariants) hw.frustumCulled = false;
    for (const hr of this.instLeaderHouseRoofVariants) hr.frustumCulled = false;
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
      ...this.instWarehouseWalls, ...this.instWarehouseRoofs,
      ...this.instSlaughterhouseWalls, ...this.instSlaughterhouseRoofs,
      ...this.instKitchenWalls, ...this.instKitchenRoofs,
      this.instWaterWellBase, this.instWaterWellWood, this.instWaterWellRoof,
      ...this.instHouseWallVariants,
      ...this.instHouseRoofVariants,
      ...this.instLeaderHouseWallVariants,
      ...this.instLeaderHouseRoofVariants,
      this.instHouseWalls, this.instHouseRoofs,
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
    this.floatingUiGroup.visible = true; // Rendered directly in 3D scene (scaled with resolution scale)
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

    // Selection Reticle (Ground Box Decal beneath units & multi-tile structures)
    const reticleGeo = new THREE.BufferGeometry();
    // Unit square from -0.5 to +0.5 with border outline lines
    const reticleVerts = new Float32Array([
      // Outer border strip
      -0.5, 0, -0.5,   0.5, 0, -0.5,
       0.5, 0, -0.5,   0.5, 0,  0.5,
       0.5, 0,  0.5,  -0.5, 0,  0.5,
      -0.5, 0,  0.5,  -0.5, 0, -0.5
    ]);
    reticleGeo.setAttribute('position', new THREE.BufferAttribute(reticleVerts, 3));
    const reticleMat = new THREE.LineBasicMaterial({
      color: 0xffdd33,
      linewidth: 3,
      transparent: true,
      opacity: 0.95,
      depthTest: true,
      depthWrite: false
    });
    this.reticleMesh = new THREE.LineSegments(reticleGeo, reticleMat);
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

    // Persistent reusable collections to eliminate per-frame GC allocations
    this._activeIds = new Set();
    this._activeUiIds = new Set();
    this._occupiedHouseTiles = new Set();
    this._clanGroups = new Map();
    this._knownZones = new Set();
    this._visibleEntitiesArray = [];
    this._mMatrix = new THREE.Matrix4();
    this._scaleMatrix = new THREE.Matrix4();
    this._platMat = new THREE.Matrix4();
    this.tempColor1 = new THREE.Color();

    // 3D Procedural Sky Clouds (High altitude layer)
    const cloudGeo = new THREE.PlaneGeometry(1600, 1600, 16, 16);
    cloudGeo.rotateX(-Math.PI / 2);
    this.cloudMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0.0 },
        uFade: { value: 0.0 },
        uSunColor: { value: new THREE.Color(1.0, 1.0, 1.0) },
        uAmbColor: { value: new THREE.Color(0.6, 0.7, 0.8) }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          vec4 wp = modelMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uFade;
        uniform vec3 uSunColor;
        uniform vec3 uAmbColor;
        varying vec2 vUv;

        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }
        float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i + vec2(0.0,0.0)), hash(i + vec2(1.0,0.0)), u.x),
                     mix(hash(i + vec2(0.0,1.0)), hash(i + vec2(1.0,1.0)), u.x), u.y);
        }
        float fbm(vec2 p) {
          float v = 0.0;
          float a = 0.5;
          for (int i = 0; i < 4; ++i) {
            v += a * noise(p);
            p *= 2.05;
            a *= 0.5;
          }
          return v;
        }

        const mat4 bayerMatrix = mat4(
          0.0/16.0,  8.0/16.0,  2.0/16.0, 10.0/16.0,
          12.0/16.0, 4.0/16.0, 14.0/16.0,  6.0/16.0,
          3.0/16.0, 11.0/16.0,  1.0/16.0,  9.0/16.0,
          15.0/16.0, 7.0/16.0, 13.0/16.0,  5.0/16.0
        );

        void main() {
          if (uFade <= 0.01) discard;

          // Scaled up vUv for smaller, more numerous clouds
          vec2 uv = vUv * 28.0 + vec2(uTime * 0.002, uTime * 0.001);
          float n = fbm(uv);
          // Increased density by lowering the thresholds
          float density = smoothstep(0.40, 0.70, n);

          float effectiveAlpha = density * uFade;

          // Clean empty areas BEFORE dithering to prevent stray dots on 0.0 threshold
          if (effectiveAlpha <= 0.02) {
            discard; 
          }

          ivec2 pixelCoord = ivec2(mod(gl_FragCoord.xy, 4.0));
          float ditherThreshold = bayerMatrix[pixelCoord.x][pixelCoord.y];

          if (effectiveAlpha < ditherThreshold) {
            discard;
          }

          vec3 cloudCol = mix(uAmbColor, uSunColor, density);
          gl_FragColor = vec4(cloudCol, 1.0);
        }
      `,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide
    });
    this.cloudMesh = new THREE.Mesh(cloudGeo, this.cloudMat);
    this.cloudMesh.position.set(512, 55.0, 512);
    this.cloudMesh.renderOrder = 500;
    this.cloudMesh.frustumCulled = false;
    this.scene.add(this.cloudMesh);

    // 3D Celestial Orbit Group (Sun, Moon & God Rays in Perspective Mode)
    this.celestialGroup = new THREE.Group();
    this.scene.add(this.celestialGroup);

    // 1. Pixelated & Heavy-Dithered Sun Billboard + God Rays
    const sunTex = createDitheredCelestialTexture("sun");
    const sunGeo = new THREE.PlaneGeometry(18, 18);
    const sunMat = new THREE.MeshBasicMaterial({
      map: sunTex,
      transparent: true,
      alphaTest: 0.02,
      depthWrite: false,
      depthTest: true,
      fog: false,
      side: THREE.DoubleSide
    });
    this.sunMesh = new THREE.Mesh(sunGeo, sunMat);
    this.sunMesh.renderOrder = 400;

    const sunGodRaysTex = createDitheredGodRaysTexture("sun");
    const sunGodRaysGeo = new THREE.PlaneGeometry(42, 42);
    const sunGodRaysMat = new THREE.MeshBasicMaterial({
      map: sunGodRaysTex,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      fog: false,
      side: THREE.DoubleSide
    });
    this.sunGodRaysMesh = new THREE.Mesh(sunGodRaysGeo, sunGodRaysMat);
    this.sunGodRaysMesh.renderOrder = 405;
    this.sunMesh.add(this.sunGodRaysMesh);
    this.celestialGroup.add(this.sunMesh);

    // 2. Pixelated & Heavy-Dithered Moon Billboard + God Rays
    const moonTex = createDitheredCelestialTexture("moon");
    const moonGeo = new THREE.PlaneGeometry(15, 15);
    const moonMat = new THREE.MeshBasicMaterial({
      map: moonTex,
      transparent: true,
      alphaTest: 0.02,
      depthWrite: false,
      depthTest: true,
      fog: false,
      side: THREE.DoubleSide
    });
    this.moonMesh = new THREE.Mesh(moonGeo, moonMat);
    this.moonMesh.renderOrder = 400;

    const moonGodRaysTex = createDitheredGodRaysTexture("moon");
    const moonGodRaysGeo = new THREE.PlaneGeometry(36, 36);
    const moonGodRaysMat = new THREE.MeshBasicMaterial({
      map: moonGodRaysTex,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      fog: false,
      side: THREE.DoubleSide
    });
    this.moonGodRaysMesh = new THREE.Mesh(moonGodRaysGeo, moonGodRaysMat);
    this.moonGodRaysMesh.renderOrder = 405;
    this.moonMesh.add(this.moonGodRaysMesh);
    this.celestialGroup.add(this.moonMesh);
    this.celestialGroup.visible = false;

    // 3. Pixel-Dithered Optical Lens Flare System (1P/3P)
    this.lensFlareGroup = new THREE.Group();
    this.scene.add(this.lensFlareGroup);
    this.lensFlareElements = [];

    const flareConfigs = [
      { variant: 0, scale: 0.09, factor: 0.35, color: 0xcc8833 },
      { variant: 1, scale: 0.14, factor: 0.70, color: 0x4488cc },
      { variant: 0, scale: 0.06, factor: 1.10, color: 0xccaa44 },
      { variant: 2, scale: 0.10, factor: -0.25, color: 0xcc6622 }
    ];

    for (const cfg of flareConfigs) {
      const fTex = createDitheredLensFlareTexture(cfg.variant);
      const fGeo = new THREE.PlaneGeometry(1.0, 1.0);
      const fMat = new THREE.MeshBasicMaterial({
        map: fTex,
        color: cfg.color,
        transparent: true,
        opacity: 0.40,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false,
        fog: false,
        side: THREE.DoubleSide
      });
      const fMesh = new THREE.Mesh(fGeo, fMat);
      fMesh.renderOrder = 999;
      this.lensFlareGroup.add(fMesh);
      this.lensFlareElements.push({ mesh: fMesh, cfg: cfg });
    }
    this.lensFlareGroup.visible = false;
  }

  // ---------------------------------------------------------------------------
  // Resolution Downscaling (50% Retro Pixel -> 75% Balanced -> 100% Native HD)
  // ---------------------------------------------------------------------------

  updateRendererResolution() {
    const internalW = Math.max(160, Math.floor(this.width * this.scaleFactor));
    const internalH = Math.max(120, Math.floor(this.height * this.scaleFactor));
    this.renderer.setSize(internalW, internalH, false);
    this.renderer.setPixelRatio(1.0);
    if (this.renderTarget) {
      this.renderTarget.setSize(internalW, internalH);
    }

    const canvasDom = this.renderer.domElement;
    if (canvasDom) {
      canvasDom.style.imageRendering = this.scaleFactor < 1.0 ? "pixelated" : "auto";
    }
  }

  setResolutionScale(factor) {
    this.scaleFactor = Math.max(0.25, Math.min(2.0, Number(factor) || 1.0));
    this.updateRendererResolution();
  }

  get resolutionScale() {
    return this.scaleFactor;
  }

  set resolutionScale(val) {
    this.setResolutionScale(val);
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

  setShadowQuality(res = 2048) {
    if (!this.sunLight || !this.sunLight.shadow) return;
    this.sunLight.shadow.mapSize.width = res;
    this.sunLight.shadow.mapSize.height = res;
    if (this.sunLight.shadow.map) {
      this.sunLight.shadow.map.dispose();
      this.sunLight.shadow.map = null;
    }
  }

  setOverheadBadgesVisible(visible = true) {
    if (this.floatingUiGroup) {
      this.floatingUiGroup.visible = !!visible;
    }
  }

  isShadowsActive() {
    return this.shadowsEnabled;
  }

  setAnisotropy(level) {
    const maxAniso = this.renderer?.capabilities?.getMaxAnisotropy ? this.renderer.capabilities.getMaxAnisotropy() : 16;
    let aniso = 1;
    if (typeof level === "number") {
      aniso = Math.max(1, Math.min(level, maxAniso));
    } else if (level === "2X" || level === 2) {
      aniso = Math.min(2, maxAniso);
    } else if (level === "4X" || level === 4) {
      aniso = Math.min(4, maxAniso);
    } else if (level === "8X" || level === 8) {
      aniso = Math.min(8, maxAniso);
    } else if (level === "16X" || level === 16) {
      aniso = Math.min(16, maxAniso);
    } else {
      aniso = 1;
    }

    this.graphicOptions.anisotropy = aniso;
    currentGlobalAnisotropy = aniso;

    for (const tex of REGISTERED_TEXTURES) {
      applyTextureAnisotropy(tex, aniso);
    }

    const scanDict = (dict) => {
      if (!dict) return;
      for (const val of Object.values(dict)) {
        if (Array.isArray(val)) {
          for (const m of val) scanMat(m);
        } else {
          scanMat(val);
        }
      }
    };

    const scanMat = (mat) => {
      if (!mat) return;
      if (mat.map) applyTextureAnisotropy(mat.map, aniso);
      if (mat.normalMap) applyTextureAnisotropy(mat.normalMap, aniso);
      if (mat.roughnessMap) applyTextureAnisotropy(mat.roughnessMap, aniso);
      if (mat.metalnessMap) applyTextureAnisotropy(mat.metalnessMap, aniso);
      if (mat.alphaMap) applyTextureAnisotropy(mat.alphaMap, aniso);
    };

    scanDict(this.materialsIso);
    scanDict(this.materialsPerspective);
  }

  setGraphicOptions(opts) {
    if (!opts) return;
    Object.assign(this.graphicOptions, opts);
    if (opts.anisotropy !== undefined) {
      this.setAnisotropy(opts.anisotropy);
    }
    this.syncActiveMaterials(this.isPerspectiveActive());
  }

  syncActiveMaterials(isPersp = this.isPerspectiveActive()) {
    const useNormalMaps = isPersp && (this.graphicOptions.normalMaps !== false);
    const activeDict = useNormalMaps ? this.materialsPerspective : this.materialsIso;

    for (const [k, mat] of Object.entries(activeDict)) {
      this.materials[k] = mat;
    }

    if (this.instHouseWalls && activeDict.houseWall) this.instHouseWalls.material = activeDict.houseWall;
    if (this.instHouseRoofs && activeDict.houseRoof) this.instHouseRoofs.material = activeDict.houseRoof;
    if (this.instHouseWallVariants) {
      for (let i = 0; i < this.instHouseWallVariants.length; i++) {
        if (this.instHouseWallVariants[i] && activeDict.houseWallVariants[i]) {
          this.instHouseWallVariants[i].material = activeDict.houseWallVariants[i];
        }
      }
    }
    if (this.instHouseRoofVariants) {
      for (let i = 0; i < this.instHouseRoofVariants.length; i++) {
        if (this.instHouseRoofVariants[i] && activeDict.houseRoofVariants[i]) {
          this.instHouseRoofVariants[i].material = activeDict.houseRoofVariants[i];
        }
      }
    }
    if (this.instLeaderHouseWallVariants) {
      for (let i = 0; i < this.instLeaderHouseWallVariants.length; i++) {
        if (this.instLeaderHouseWallVariants[i] && activeDict.leaderWallVariants[i]) {
          this.instLeaderHouseWallVariants[i].material = activeDict.leaderWallVariants[i];
        }
      }
    }
    if (this.instLeaderHouseRoofVariants) {
      for (let i = 0; i < this.instLeaderHouseRoofVariants.length; i++) {
        if (this.instLeaderHouseRoofVariants[i] && activeDict.leaderRoofVariants[i]) {
          this.instLeaderHouseRoofVariants[i].material = activeDict.leaderRoofVariants[i];
        }
      }
    }
    if (this.instWarehouseWalls) {
      for (let i = 0; i < this.instWarehouseWalls.length; i++) {
        if (this.instWarehouseWalls[i] && activeDict.warehouseWalls[i]) {
          this.instWarehouseWalls[i].material = activeDict.warehouseWalls[i];
        }
      }
    }
    if (this.instWarehouseRoofs) {
      for (let i = 0; i < this.instWarehouseRoofs.length; i++) {
        if (this.instWarehouseRoofs[i] && activeDict.warehouseRoofs[i]) {
          this.instWarehouseRoofs[i].material = activeDict.warehouseRoofs[i];
        }
      }
    }
    if (this.instSlaughterhouseWalls) {
      for (let i = 0; i < this.instSlaughterhouseWalls.length; i++) {
        if (this.instSlaughterhouseWalls[i] && activeDict.slaughterhouseWalls[i]) {
          this.instSlaughterhouseWalls[i].material = activeDict.slaughterhouseWalls[i];
        }
      }
    }
    if (this.instSlaughterhouseRoofs) {
      for (let i = 0; i < this.instSlaughterhouseRoofs.length; i++) {
        if (this.instSlaughterhouseRoofs[i] && activeDict.slaughterhouseRoofs[i]) {
          this.instSlaughterhouseRoofs[i].material = activeDict.slaughterhouseRoofs[i];
        }
      }
    }
    if (this.instBoneWalls && activeDict.boneWall) this.instBoneWalls.material = activeDict.boneWall;
    if (this.instOakLeaves && activeDict.oakLeaves) this.instOakLeaves.material = activeDict.oakLeaves;
    if (this.instPineLeaves && activeDict.pineLeaves) this.instPineLeaves.material = activeDict.pineLeaves;
    if (this.instCacti && activeDict.cactus) this.instCacti.material = activeDict.cactus;
    if (this.instCampfireFlames && activeDict.campfireFlames) this.instCampfireFlames.material = activeDict.campfireFlames;
    if (this.instGrassTufts && activeDict.grassFoliage) this.instGrassTufts.material = activeDict.grassFoliage;

    // Reset camera tile marker so terrain chunks re-bind with active materials
    this.lastBuiltCamTileX = -9999;
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

  setFirstPersonMode(enabled, entityId = null) {
    this.isFirstPersonMode = !!enabled;
    if (enabled) this.isThirdPersonMode = false;
    this.fpEntityId = enabled && entityId !== null && entityId !== undefined ? Number(entityId) : null;
    if (enabled && entityId !== null && entityId !== undefined) {
      this.selectedEntityId = Number(entityId);
      this.fpYaw = 0;
      this.fpPitch = 0;
      this.lastBuiltCamTileX = -9999;
      this.lastBuiltCamTileY = -9999;
    }
  }

  setThirdPersonMode(enabled, entityId = null) {
    this.isThirdPersonMode = !!enabled;
    if (enabled) this.isFirstPersonMode = false;
    this.fpEntityId = enabled && entityId !== null && entityId !== undefined ? Number(entityId) : null;
    if (enabled && entityId !== null && entityId !== undefined) {
      this.selectedEntityId = Number(entityId);
      this.fpYaw = 0;
      this.fpPitch = 0.35; // Default angled down view towards creature
      this.tpDistance = 4.5;
      this.lastBuiltCamTileX = -9999;
      this.lastBuiltCamTileY = -9999;
    }
  }

  isFirstPersonActive() {
    return this.isFirstPersonMode && this.fpEntityId !== null && this.fpEntityId !== undefined;
  }

  isThirdPersonActive() {
    return this.isThirdPersonMode && this.fpEntityId !== null && this.fpEntityId !== undefined;
  }

  isPerspectiveActive() {
    return (this.isFirstPersonMode || this.isThirdPersonMode) && this.fpEntityId !== null && this.fpEntityId !== undefined;
  }

  rotatePerspectiveCamera(dYaw, dPitch) {
    if (this.isThirdPersonActive()) {
      // 3P Orbital Camera: Dragging right orbits camera right, dragging down lowers / dragging up raises
      this.fpYaw = (this.fpYaw - dYaw) % (Math.PI * 2);
      if (this.fpYaw < 0) this.fpYaw += Math.PI * 2;
      this.fpPitch = Math.max(-Math.PI * 0.15, Math.min(Math.PI * 0.45, this.fpPitch + dPitch));
    } else {
      // 1P First Person Camera: Dragging right turns right, dragging up looks up
      this.fpYaw = (this.fpYaw + dYaw) % (Math.PI * 2);
      if (this.fpYaw < 0) this.fpYaw += Math.PI * 2;
      this.fpPitch = Math.max(-Math.PI * 0.35, Math.min(Math.PI * 0.35, this.fpPitch + dPitch));
    }
  }

  rotateFirstPersonCamera(dYaw, dPitch) {
    this.rotatePerspectiveCamera(dYaw, dPitch);
  }

  toggleFirstPersonAutoCam() {
    this.fpAutoCam = !this.fpAutoCam;
    return this.fpAutoCam;
  }

  setFirstPersonAutoCam(enabled) {
    this.fpAutoCam = !!enabled;
  }

  isFirstPersonAutoCam() {
    return !!this.fpAutoCam;
  }

  adjustThirdPersonDistance(delta) {
    this.tpDistance = Math.max(this.tpMinDistance, Math.min(this.tpMaxDistance, this.tpDistance + delta));
  }
  getSelectedId() { return this.selectedEntityId; }

  getTileBaseHeight(tileType) {
    switch (tileType) {
      case TILE_WATER: return 0.0;
      case TILE_SAND:
      case TILE_ROAD_SAND: return 0.38;
      case TILE_FLOOR:
      case TILE_ROAD_GRASS: return 1.0;
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

  getTileSurfaceHeight(map, tx, ty, fpW = 1, fpH = 1) {
    let minH = Infinity;
    for (let dy = 0; dy <= fpH; dy++) {
      for (let dx = 0; dx <= fpW; dx++) {
        const cx = tx + dx;
        const cy = ty + dy;
        const t = this.getTileTypeAt(map, Math.min(cx, tx + fpW - 1), Math.min(cy, ty + fpH - 1));
        if (t === TILE_WATER) {
          minH = Math.min(minH, 0.08);
        } else {
          const h = this.getCornerHeight(map, cx, cy);
          minH = Math.min(minH, h);
        }
      }
    }
    return Number.isFinite(minH) ? minH : 0.0;
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
    const id = this.getEntityAtScreen(screenX, screenY, entities, world);
    this.selectedEntityId = id;
    return id;
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
      if (!e || e.destroyed || !e.properties || !e.properties.render || e.properties.species === "effect") continue;

      const r = e.properties.render;
      const isRoad = !e.properties.brain && (!!e.properties.road || e.properties.name?.includes("Estrada") || e.properties.name?.includes("Rua") || e.properties.name?.includes("Encaixe"));
      const isCampfire = !e.properties.brain && !isRoad && (!!e.properties.campfire || e.properties.name?.includes("Campfire") || e.properties.name?.includes("Fogueira"));
      const isTorch = !e.properties.brain && !isRoad && !isCampfire && (!!e.properties.torch || e.properties.name?.includes("Torch") || e.properties.name?.includes("Tocha"));
      const isWarehouse = !e.properties.brain && !isRoad && (!!e.properties.warehouse || e.properties.name?.includes("Armazém") || e.properties.name?.includes("Depósito"));
      const isSlaughterhouse = !e.properties.brain && !isRoad && !isWarehouse && (!!e.properties.slaughterhouse || e.properties.name?.includes("Abatedouro"));
      const isKitchen = !e.properties.brain && !isRoad && !isWarehouse && !isSlaughterhouse && (!!e.properties.kitchen || e.properties.name?.includes("Cozinha"));
      const isWell = !e.properties.brain && !isRoad && !isWarehouse && !isSlaughterhouse && !isKitchen && (!!e.properties.well || !!e.properties.isWell || e.properties.name?.includes("Poço") || e.properties.name?.includes("Well"));
      const isArtisanHut = !e.properties.brain && !isRoad && !isWarehouse && !isSlaughterhouse && !isKitchen && !isWell && (!!e.properties.artisan_hut || e.properties.name?.includes("Artesão") || e.properties.name?.includes("Cabana do Construtor"));
      const isDoor = !e.properties.brain && !isWarehouse && !isSlaughterhouse && !isKitchen && !isWell && !isArtisanHut && !isTorch && !isCampfire && !isRoad && !!e.properties.door;

      const isCactus = e.properties.species === "cactus" || e.properties.name?.toLowerCase().includes("cactus") || e.properties.name?.toLowerCase().includes("cacto");
      const isTree = !isCactus && (e.properties.species === "oak" || e.properties.species === "pine" || e.properties.species === "willow" || e.properties.species === "tree" || !!e.properties.tree || (r.skin && r.skin.toLowerCase().includes("tree")));
      const isWoodLog = !e.properties.brain && !isDoor && !isWarehouse && !isSlaughterhouse && !isKitchen && !isArtisanHut && !isTorch && !isCampfire && !isRoad && (e.properties.resourceType === "wood" || e.properties.name?.includes("Wood Log") || e.properties.name?.includes("Madeira") || r.skin === "Item_Wood.png");
      const isStoneItem = !e.properties.brain && !isDoor && !isWarehouse && !isSlaughterhouse && !isKitchen && !isArtisanHut && !isTorch && !isCampfire && !isRoad && (e.properties.resourceType === "stone" || e.properties.name?.includes("Stone Block") || e.properties.name?.includes("Pedra"));
      const isHouse = !e.properties.brain && !isWoodLog && !isStoneItem && !isTree && !isCactus && !isWarehouse && !isSlaughterhouse && !isKitchen && !isWell && !isArtisanHut && !isTorch && !isCampfire && !isRoad && (!!e.properties.house || (e.properties.species === "structure" && (r.skin === "Overworld_House.png" || e.properties.name?.includes("Casa") || e.properties.name?.includes("Ossuário") || e.properties.name?.includes("Castelo"))));
      const isWall = !e.properties.brain && !isDoor && !isHouse && !isWarehouse && !isSlaughterhouse && !isKitchen && !isWell && !isArtisanHut && !isTorch && !isCampfire && !isRoad && !isWoodLog && !isStoneItem && !isTree && !isCactus && (r.skin?.startsWith("Wall_") || e.properties.name?.includes("Muralha") || e.properties.name?.includes("Paliçada") || e.properties.name?.includes("Muro") || (e.properties.structure && !e.properties.edible && !e.properties.resourceType));

      const isBuilding = isHouse || isWall || isDoor || isWarehouse || isSlaughterhouse || isKitchen || isWell || isArtisanHut;
      const isPlantOrItem = isTree || isCactus || isWoodLog || isStoneItem || isTorch || isCampfire || isRoad;

      const isItem = !e.properties.brain && !isBuilding && !isTree && !isCactus && !isWoodLog && !isStoneItem && !isTorch && !isCampfire && !isRoad;

      // Multi-tile footprint for buildings
      let fpW = 1, fpH = 1;
      if (isHouse && e.properties.house) {
        fpW = e.properties.house.footprintW || (e.properties.house.footprint ? Number(e.properties.house.footprint.split("x")[0]) : 1) || 1;
        fpH = e.properties.house.footprintH || (e.properties.house.footprint ? Number(e.properties.house.footprint.split("x")[1]) : 1) || 1;
      } else if (e.properties.leaderHouse) {
        fpW = 3; fpH = 3;
      } else if (isWarehouse || isSlaughterhouse || isKitchen || isArtisanHut) {
        fpW = 2; fpH = 2;
      }

      const posX = (isBuilding || isPlantOrItem) ? e.x + fpW * 0.5 : e.x;
      const posY = (isBuilding || isPlantOrItem) ? e.y + fpH * 0.5 : e.y;

      const bounds = getEntityBounds(e);
      const surfaceH = map
        ? (isBuilding ? this.getTileSurfaceHeight(map, Math.floor(e.x), Math.floor(e.y)) : this.getSurfaceElevation(map, posX, posY))
        : 1.0;

      const denom = nx * ray.direction.x + nz * ray.direction.z;
      if (Math.abs(denom) > 1e-4) {
        const numer = nx * (posX - ray.origin.x) + nz * (posY - ray.origin.z);
        const t = numer / denom;
        if (t > 0 && t < closestDist) {
          const ix = ray.origin.x + t * ray.direction.x;
          const iy = ray.origin.y + t * ray.direction.y;
          const iz = ray.origin.z + t * ray.direction.z;

          const dy = iy - surfaceH;
          const dx = nx * (ix - posX) - nz * (iz - posY);

          if (dy >= -0.2 && dy <= Math.max(1.0, bounds.h) && Math.abs(dx) <= Math.max(0.75, bounds.radius)) {
            closestDist = t;
            bestEntId = e.id;
          }
        }
      }

      const centerH = surfaceH + (isItem ? 0.25 : bounds.h * 0.45);
      const entPos = new THREE.Vector3(posX, centerH, posY);
      const distToRay = ray.distanceToPoint(entPos);
      if (distToRay < Math.max(0.75, bounds.radius * 0.95)) {
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
        if (e.destroyed || !e.properties) continue;
        // Multi-tile footprint check
        let eFpW = 1, eFpH = 1;
        if (e.properties.house) {
          eFpW = e.properties.house.footprintW || 1;
          eFpH = e.properties.house.footprintH || 1;
        } else if (e.properties.leaderHouse) {
          eFpW = 3; eFpH = 3;
        } else if (e.properties.warehouse || e.properties.slaughterhouse || e.properties.kitchen || e.properties.artisan_hut) {
          eFpW = 2; eFpH = 2;
        }
        // Direct tile hit within footprint
        if (tx >= e.x && tx < e.x + eFpW && ty >= e.y && ty < e.y + eFpH) {
          closestId = e.id;
          break;
        }
        const cx = e.x + eFpW * 0.5;
        const cy = e.y + eFpH * 0.5;
        const d = Math.hypot(cx - tx, cy - ty);
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

  updateCamera(entities = null, dt = 0.016) {
    if (this.isPerspectiveActive()) {
      let targetEnt = entities ? entities.find(e => e && Number(e.id) === Number(this.fpEntityId)) : null;
      if (!targetEnt && typeof getEntityById === "function") {
        targetEnt = getEntityById(this.fpEntityId);
      }

      if (targetEnt && !targetEnt.destroyed && (!targetEnt.properties?.life || !targetEnt.properties.life.isDead)) {
        const eyeX = targetEnt.x;
        const eyeZ = targetEnt.y;
        const surfaceH = this.currentMap ? this.getSurfaceElevation(this.currentMap, eyeX, eyeZ) : 1.0;
        const eyeY = surfaceH + 0.65; // Creature center height

        this.camX = eyeX;
        this.camY = eyeZ;

        // Auto-Cam for 1P: automatically align fpYaw with creature movement direction
        if (this.isFirstPersonActive() && this.fpAutoCam) {
          if (this.lastTargetPosX !== null && this.lastTargetPosZ !== null) {
            const dx = eyeX - this.lastTargetPosX;
            const dz = eyeZ - this.lastTargetPosZ;
            const moveDist = Math.hypot(dx, dz);
            if (moveDist > 0.002) {
              const moveYaw = Math.atan2(dx, dz);
              let diff = (moveYaw - this.fpYaw) % (Math.PI * 2);
              if (diff > Math.PI) diff -= Math.PI * 2;
              if (diff < -Math.PI) diff += Math.PI * 2;
              const step = Math.min(1.0, (dt || 0.016) * 7.5);
              this.fpYaw = (this.fpYaw + diff * step) % (Math.PI * 2);
              if (this.fpYaw < 0) this.fpYaw += Math.PI * 2;
            }
          }
          this.lastTargetPosX = eyeX;
          this.lastTargetPosZ = eyeZ;
        } else {
          this.lastTargetPosX = eyeX;
          this.lastTargetPosZ = eyeZ;
        }

        const aspect = this.width / this.height;
        this.fpCamera.aspect = aspect;
        this.fpCamera.near = 0.05;
        this.fpCamera.far = 800;
        this.fpCamera.updateProjectionMatrix();

        const cosPitch = Math.cos(this.fpPitch);
        const sinPitch = Math.sin(this.fpPitch);
        const sinYaw = Math.sin(this.fpYaw);
        const cosYaw = Math.cos(this.fpYaw);

        if (this.isThirdPersonActive()) {
          // 3P Orbital Camera: Orbit behind/around creature and look directly at creature
          const camPosX = eyeX - sinYaw * cosPitch * this.tpDistance;
          const camPosY = eyeY + sinPitch * this.tpDistance;
          const camPosZ = eyeZ - cosYaw * cosPitch * this.tpDistance;

          this.fpCamera.position.set(camPosX, camPosY, camPosZ);
          this.fpCamera.lookAt(eyeX, eyeY, eyeZ);
        } else {
          // 1P First Person Camera: Position at creature eyes and look forward
          this.fpCamera.position.set(eyeX, eyeY, eyeZ);

          const lookDist = 20.0;
          const targetX = eyeX + sinYaw * cosPitch * lookDist;
          const targetY = eyeY + sinPitch * lookDist;
          const targetZ = eyeZ + cosYaw * cosPitch * lookDist;

          this.fpCamera.lookAt(targetX, targetY, targetZ);
        }
        return;
      } else {
        this.isFirstPersonMode = false;
        this.isThirdPersonMode = false;
        this.fpEntityId = null;
      }
    }

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

    // Atmospheric sky background & ambient fog (eliminates black void outside map)
    this.tempColor1.setHex(k1.bg);
    this.tempColor2.setHex(k2.bg);
    this.tempColor1.lerp(this.tempColor2, sAlpha);
    if (!this.scene.background) this.scene.background = new THREE.Color();
    this.scene.background.copy(this.tempColor1);
    this.renderer.setClearColor(this.tempColor1, 1.0);
    const targetFogDensity = this.isPerspectiveActive() ? 0.016 : 0.0012;
    if (!this.scene.fog) {
      this.scene.fog = new THREE.FogExp2(this.tempColor1.getHex(), targetFogDensity);
    } else {
      this.scene.fog.color.copy(this.tempColor1);
      this.scene.fog.density = targetFogDensity;
    }

    const isPersp = this.isPerspectiveActive();
    const sunIntensity = (k1.sunI + (k2.sunI - k1.sunI) * sAlpha) * (isPersp ? 1.25 : 1.0);
    const ambIntensity = (k1.ambI + (k2.ambI - k1.ambI) * sAlpha) * (isPersp ? 1.15 : 1.0);

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

    // Position and Orient 3D Sun & Moon in Sky Dome during 1P/3P Perspective Mode
    if (this.celestialGroup) {
      if (this.isPerspectiveActive()) {
        this.celestialGroup.visible = true;
        const activeCam = this.fpCamera;
        const enableGodRays = this.graphicOptions.godRays !== false;

        if (isDaytime) {
          this.sunMesh.visible = true;
          this.sunMesh.position.set(this.camX + lightOrbitX * 1.4, lightOrbitY * 1.4, this.camY + lightOrbitZ * 1.4);
          if (activeCam) {
            this.sunMesh.lookAt(activeCam.position);
          }
          if (this.sunGodRaysMesh) {
            this.sunGodRaysMesh.visible = enableGodRays;
            this.sunGodRaysMesh.rotation.z += 0.001;
          }
          this.moonMesh.visible = false;
        } else {
          this.moonMesh.visible = true;
          this.moonMesh.position.set(this.camX + lightOrbitX * 1.4, lightOrbitY * 1.4, this.camY + lightOrbitZ * 1.4);
          if (activeCam) {
            this.moonMesh.lookAt(activeCam.position);
          }
          if (this.moonGodRaysMesh) {
            this.moonGodRaysMesh.visible = enableGodRays;
            this.moonGodRaysMesh.rotation.z += 0.0008;
          }
          this.sunMesh.visible = false;
        }

        // 3D Optical Lens Flare Projection along Screen Light Vector
        if (this.lensFlareGroup && activeCam) {
          const enableFlare = this.graphicOptions.lensFlare !== false;
          const activeCelestial = isDaytime ? this.sunMesh : this.moonMesh;
          const scr = this._tempVec.copy(activeCelestial.position).project(activeCam);
          const onScreen = enableFlare && scr.z < 1.0 && Math.abs(scr.x) < 1.30 && Math.abs(scr.y) < 1.30;

          if (onScreen) {
            this.lensFlareGroup.visible = true;
            const rayX = -scr.x;
            const rayY = -scr.y;
            const fovRad = (activeCam.fov * Math.PI) / 180.0;
            const planeDist = 1.8;
            const halfH = Math.tan(fovRad / 2.0) * planeDist;
            const halfW = halfH * activeCam.aspect;

            for (const elem of this.lensFlareElements) {
              const factor = elem.cfg.factor;
              const lx = (scr.x + rayX * factor) * halfW;
              const ly = (scr.y + rayY * factor) * halfH;
              const lz = -planeDist;

              elem.mesh.position.set(lx, ly, lz);
              const sz = elem.cfg.scale * halfH;
              elem.mesh.scale.set(sz, sz, 1.0);
              elem.mesh.rotation.z = (scr.x + scr.y) * 1.6;
            }
            this.lensFlareGroup.position.copy(activeCam.position);
            this.lensFlareGroup.quaternion.copy(activeCam.quaternion);
          } else {
            this.lensFlareGroup.visible = false;
          }
        }
      } else {
        this.celestialGroup.visible = false;
        if (this.lensFlareGroup) this.lensFlareGroup.visible = false;
      }
    }

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
      [TILE_ROAD_STONE]: { pos: [], uvs: [], colors: [] }
    };

    const gridLinePositions = [];
    const matHelper = new THREE.Matrix4();
    let foliageCount = 0;
    const isPersp = this.isPerspectiveActive();

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

        // 3D Natural Grass Tufts (Clean, small, fine tufts with dense placement in 1P/3P)
        if (tType === TILE_FLOOR) {
          if (!isPersp) {
            // Isometric view: classic 8% density
            if (shouldSpawnGrassTuft(tx, ty) && foliageCount < 1200) {
              const midH = Math.min(h00, h10, h11, h01);
              matHelper.identity();
              matHelper.setPosition(tx + 0.5, midH - 0.04, ty + 0.5);
              this.instGrassTufts.setMatrixAt(foliageCount++, matHelper);
            }
          } else {
            // 1P/3P Perspective Mode: High density of small, delicate natural grass tufts planted firmly into ground
            let tHash = Math.imul(tx ^ Math.imul(ty, 198491317), 445582319);
            tHash = Math.imul(tHash ^ (tHash >>> 11), 892341233) >>> 0;
            const spawnChance = tHash % 100;

            if (spawnChance < 75) {
              const numTufts = (spawnChance < 30) ? 3 : ((spawnChance < 60) ? 2 : 1);
              for (let k = 0; k < numTufts; k++) {
                if (foliageCount >= 5000) break;
                const subHash = Math.imul(tHash ^ (k * 1337 + 7), 2654435761) >>> 0;
                const ox = 0.15 + ((subHash & 0xFF) / 255.0) * 0.70;
                const oy = 0.15 + (((subHash >> 8) & 0xFF) / 255.0) * 0.70;

                let groundY;
                if (ox <= oy) {
                  groundY = h00 + (h01 - h00) * oy + (h11 - h01) * ox;
                } else {
                  groundY = h00 + (h10 - h00) * ox + (h11 - h10) * oy;
                }
                const tuftY = groundY - 0.06;

                const rotY = (((subHash >> 16) & 0xFF) / 255.0) * Math.PI * 2;
                const scale = 0.85 + (((subHash >> 24) & 0xFF) / 255.0) * 0.35;

                matHelper.identity();
                this._rotEuler.set(0, rotY, 0, "YXZ");
                matHelper.makeRotationFromEuler(this._rotEuler);
                matHelper.setPosition(tx + ox, tuftY, ty + oy);
                this._scaleMatrix.makeScale(scale, scale, scale);
                matHelper.multiply(this._scaleMatrix);

                this.instGrassTufts.setMatrixAt(foliageCount++, matHelper);
              }
            }
          }
        }

        // 4-Sided Cliff Drop-walls (South, East, North, West) for full 360-degree visibility
        const baseH = (tType === TILE_WATER) ? -0.4 : 0.0;
        const cliffBaseAO = 0.65 * zoneMult;
        const cliffTopAO = 0.95 * zoneMult;

        // 1. South Face (+Y, at ty + 1, facing +Z)
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
          bucket.colors.push(
            cliffBaseAO, cliffBaseAO, cliffBaseAO,
            cliffBaseAO, cliffBaseAO, cliffBaseAO,
            cliffTopAO, cliffTopAO, cliffTopAO,
            cliffBaseAO, cliffBaseAO, cliffBaseAO,
            cliffTopAO, cliffTopAO, cliffTopAO,
            cliffTopAO, cliffTopAO, cliffTopAO
          );
        }

        // 2. East Face (+X, at tx + 1, facing +X)
        if (tx === clampedMaxTx || map[yOffset + tx + 1] === TILE_WATER) {
          bucket.pos.push(
            tx + 1, baseH, ty + 1,
            tx + 1, baseH, ty,
            tx + 1, h10, ty,

            tx + 1, baseH, ty + 1,
            tx + 1, h10, ty,
            tx + 1, h11, ty + 1
          );
          bucket.uvs.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
          bucket.colors.push(
            cliffBaseAO, cliffBaseAO, cliffBaseAO,
            cliffBaseAO, cliffBaseAO, cliffBaseAO,
            cliffTopAO, cliffTopAO, cliffTopAO,
            cliffBaseAO, cliffBaseAO, cliffBaseAO,
            cliffTopAO, cliffTopAO, cliffTopAO,
            cliffTopAO, cliffTopAO, cliffTopAO
          );
        }

        // 3. North Face (-Y, at ty, facing -Z)
        if (ty === clampedMinTy || map[(ty - 1) * MAP_WIDTH + tx] === TILE_WATER) {
          bucket.pos.push(
            tx + 1, baseH, ty,
            tx, baseH, ty,
            tx, h00, ty,

            tx + 1, baseH, ty,
            tx, h00, ty,
            tx + 1, h10, ty
          );
          bucket.uvs.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
          bucket.colors.push(
            cliffBaseAO, cliffBaseAO, cliffBaseAO,
            cliffBaseAO, cliffBaseAO, cliffBaseAO,
            cliffTopAO, cliffTopAO, cliffTopAO,
            cliffBaseAO, cliffBaseAO, cliffBaseAO,
            cliffTopAO, cliffTopAO, cliffTopAO,
            cliffTopAO, cliffTopAO, cliffTopAO
          );
        }

        // 4. West Face (-X, at tx, facing -X)
        if (tx === clampedMinTx || map[yOffset + tx - 1] === TILE_WATER) {
          bucket.pos.push(
            tx, baseH, ty,
            tx, baseH, ty + 1,
            tx, h01, ty + 1,

            tx, baseH, ty,
            tx, h01, ty + 1,
            tx, h00, ty
          );
          bucket.uvs.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
          bucket.colors.push(
            cliffBaseAO, cliffBaseAO, cliffBaseAO,
            cliffBaseAO, cliffBaseAO, cliffBaseAO,
            cliffTopAO, cliffTopAO, cliffTopAO,
            cliffBaseAO, cliffBaseAO, cliffBaseAO,
            cliffTopAO, cliffTopAO, cliffTopAO,
            cliffTopAO, cliffTopAO, cliffTopAO
          );
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

    const isPersp = this.isPerspectiveActive();
    if (this._lastPerspState !== isPersp) {
      this._lastPerspState = isPersp;
      this.syncActiveMaterials(isPersp);
    }

    if (!this.isPaused) {
      this.waterTime += dt * 1.0;

      const waterMat = this.materials[TILE_WATER];
      if (waterMat) {
        if (waterMat.map) {
          waterMat.map.offset.x = (this.waterTime * 0.12) % 1;
          waterMat.map.offset.y = (this.waterTime * 0.08) % 1;
        }
        if (waterMat.normalMap) {
          waterMat.normalMap.offset.x = (this.waterTime * 0.09) % 1;
          waterMat.normalMap.offset.y = (this.waterTime * 0.06) % 1;
        }
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

    this.updateCamera(entities, dt);
    const nightGlow = this.updateDayNightLighting(world);

    let minTx, maxTx, minTy, maxTy;
    const maxDist = (this.max3DRenderDistance !== undefined) ? this.max3DRenderDistance : 64;
    if (this.renderFullWorld || maxDist === 0) {
      minTx = 0;
      maxTx = MAP_WIDTH - 1;
      minTy = 0;
      maxTy = MAP_HEIGHT - 1;
    } else {
      const aspect = this.width / this.height;
      const isPerspActive = this.isPerspectiveActive();
      const viewSize = isPerspActive ? Math.max(72, maxDist || 64) : Math.min(maxDist, 28 / this.zoom);
      const diagonal = Math.hypot(viewSize * aspect, viewSize);
      const radius = isPerspActive ? Math.max(72, maxDist || 64) : Math.min(maxDist || 64, Math.ceil(diagonal * 1.25) + 3);

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
      this._knownZones.clear();
      knownZones = this._knownZones;
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
    const visibleEntities = getEntitiesInViewport(this.renderedMinTx, this.renderedMaxTx, this.renderedMinTy, this.renderedMaxTy, 8, this._visibleEntitiesArray);
    this._activeIds.clear();
    this._activeUiIds.clear();
    const activeIds = this._activeIds;
    const activeUiIds = this._activeUiIds;
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
    const warehouseCounts = [0, 0];
    const slaughterhouseCounts = [0, 0];
    const kitchenCounts = [0, 0];
    const houseVariantCounts = new Array(20).fill(0);
    const leaderVariantCounts = new Array(7).fill(0);
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

    this._occupiedHouseTiles.clear();
    this._clanGroups.clear();
    const occupiedHouseTiles = this._occupiedHouseTiles;
    const clanGroups = this._clanGroups;

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
      const isRoad = !e.properties.brain && (!!e.properties.road || e.properties.name?.includes("Estrada") || e.properties.name?.includes("Rua") || e.properties.name?.includes("Encaixe"));
      const isCampfire = !e.properties.brain && !isRoad && (!!e.properties.campfire || e.properties.name?.includes("Campfire") || e.properties.name?.includes("Fogueira"));
      const isTorch = !e.properties.brain && !isRoad && !isCampfire && (!!e.properties.torch || e.properties.name?.includes("Torch") || e.properties.name?.includes("Tocha"));
      const isWarehouse = !e.properties.brain && !isRoad && (!!e.properties.warehouse || e.properties.name?.includes("Armazém") || e.properties.name?.includes("Depósito"));
      const isSlaughterhouse = !e.properties.brain && !isRoad && !isWarehouse && (!!e.properties.slaughterhouse || e.properties.name?.includes("Abatedouro"));
      const isKitchen = !e.properties.brain && !isRoad && !isWarehouse && !isSlaughterhouse && (!!e.properties.kitchen || e.properties.name?.includes("Cozinha"));
      const isWell = !e.properties.brain && !isRoad && !isWarehouse && !isSlaughterhouse && !isKitchen && (!!e.properties.well || !!e.properties.isWell || e.properties.name?.includes("Poço") || e.properties.name?.includes("Well"));
      const isArtisanHut = !e.properties.brain && !isRoad && !isWarehouse && !isSlaughterhouse && !isKitchen && !isWell && (!!e.properties.artisan_hut || e.properties.name?.includes("Artesão") || e.properties.name?.includes("Cabana do Construtor"));
      const isDoor = !e.properties.brain && !isWarehouse && !isSlaughterhouse && !isKitchen && !isWell && !isArtisanHut && !isTorch && !isCampfire && !isRoad && !!e.properties.door;

      const isCactus = e.properties.species === "cactus" || e.properties.name?.toLowerCase().includes("cactus") || e.properties.name?.toLowerCase().includes("cacto");
      const isTree = !isCactus && (e.properties.species === "oak" || e.properties.species === "pine" || e.properties.species === "willow" || e.properties.species === "tree" || !!e.properties.tree || (r.skin && r.skin.toLowerCase().includes("tree")));
      const isPine = isTree && (e.properties.species === "pine" || (r.skin && r.skin.toLowerCase().includes("pine")));

      const isWoodLog = !e.properties.brain && !isDoor && !isWarehouse && !isSlaughterhouse && !isKitchen && !isArtisanHut && !isTorch && !isCampfire && !isRoad && (e.properties.resourceType === "wood" || e.properties.name?.includes("Wood Log") || e.properties.name?.includes("Madeira") || r.skin === "Item_Wood.png");
      const isStoneItem = !e.properties.brain && !isDoor && !isWarehouse && !isSlaughterhouse && !isKitchen && !isArtisanHut && !isTorch && !isCampfire && !isRoad && (e.properties.resourceType === "stone" || e.properties.name?.includes("Stone Block") || e.properties.name?.includes("Pedra"));
      const isHouse = !e.properties.brain && !isWoodLog && !isStoneItem && !isTree && !isCactus && !isWarehouse && !isSlaughterhouse && !isKitchen && !isWell && !isArtisanHut && !isTorch && !isCampfire && !isRoad && (!!e.properties.house || !!e.properties.leaderHouse || (e.properties.species === "structure" && (r.skin === "Overworld_House.png" || e.properties.name?.includes("Casa") || e.properties.name?.includes("Palácio") || e.properties.name?.includes("Ossuário") || e.properties.name?.includes("Castelo"))));
      const isLeaderHouse = isHouse && (!!e.properties.leaderHouse || !!e.properties.house?.isLeaderHouse || e.properties.name?.includes("Palácio") || e.properties.name?.includes("Citadel"));
      const isWall = !e.properties.brain && !isDoor && !isHouse && !isWarehouse && !isSlaughterhouse && !isKitchen && !isWell && !isArtisanHut && !isTorch && !isCampfire && !isRoad && !isWoodLog && !isStoneItem && !isTree && !isCactus && (r.skin?.startsWith("Wall_") || e.properties.name?.includes("Muralha") || e.properties.name?.includes("Paliçada") || e.properties.name?.includes("Muro") || (e.properties.structure && !e.properties.edible && !e.properties.resourceType));

      const isBuilding = isHouse || isWall || isDoor || isWarehouse || isSlaughterhouse || isKitchen || isWell || isArtisanHut;
      const isPlantOrItem = isTree || isCactus || isWoodLog || isStoneItem || isTorch || isCampfire || isRoad;

      const isItem = !e.properties.brain && !isBuilding && !isTree && !isCactus && !isWoodLog && !isStoneItem && !isTorch && !isCampfire && !isRoad;
      let surfaceH;
      if (isHouse) {
        const h = e.properties?.house;
        const isLeaderHouse = !!e.properties?.leaderHouse || !!h?.isLeaderHouse;
        const fpW = h?.footprintW || (isLeaderHouse ? 3 : (h?.footprint ? Number(h.footprint.split("x")[0]) : 1)) || 1;
        const fpH = h?.footprintH || (isLeaderHouse ? 3 : (h?.footprint ? Number(h.footprint.split("x")[1]) : 1)) || 1;
        surfaceH = this.getTileSurfaceHeight(map, Math.floor(e.x), Math.floor(e.y), fpW, fpH);
      } else if (isWarehouse || isSlaughterhouse || isKitchen || isArtisanHut) {
        surfaceH = this.getTileSurfaceHeight(map, Math.floor(e.x), Math.floor(e.y), 2, 2);
      } else if (isBuilding) {
        surfaceH = this.getTileSurfaceHeight(map, Math.floor(e.x), Math.floor(e.y), 1, 1);
      } else {
        surfaceH = this.getSurfaceElevation(map, isPlantOrItem ? e.x + 0.5 : e.x, isPlantOrItem ? e.y + 0.5 : e.y);
      }

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
      // --- 3D CENTRAL CLAN WAREHOUSE (Stockpile Building: 2 Variants) ---
      else if (isWarehouse) {
        occupiedHouseTiles.add(`${Math.floor(e.x)}_${Math.floor(e.y)}`);
        const isCompleted = e.properties?.warehouse ? (e.properties.warehouse.isCompleted !== false) : true;
        const whVar = (e.properties?.warehouse?.variant || 0) % 2;
        mMatrix.identity();
        mMatrix.makeRotationY(0);
        mMatrix.setPosition(e.x + 1.0, surfaceH, e.y + 1.0);

        if (isCompleted && warehouseCounts[whVar] < 100) {
          let bClan = e.properties?.group;
          if (!bClan && e.properties?.groupId) bClan = clanGroups.get(e.properties.groupId);
          const clanColor = (bClan && bClan.color !== undefined ? bClan.color : (e.properties?.render?.color || 0xd95738)) & 0xffffff;
          this.instWarehouseWalls[whVar].setMatrixAt(warehouseCounts[whVar], mMatrix);
          this.instWarehouseRoofs[whVar].setMatrixAt(warehouseCounts[whVar], mMatrix);
          this.instWarehouseRoofs[whVar].setColorAt(warehouseCounts[whVar], this.tempColor1.setHex(clanColor));
          warehouseCounts[whVar]++;
        } else if (!isCompleted && stage2Count < 400) {
          this.instHouseStage2.setMatrixAt(stage2Count++, mMatrix);
        }
      }
      // --- 3D VILLAGE SLAUGHTERHOUSE (Abatedouro: 2 Variants) ---
      else if (isSlaughterhouse) {
        occupiedHouseTiles.add(`${Math.floor(e.x)}_${Math.floor(e.y)}`);
        const isCompleted = e.properties?.slaughterhouse ? (e.properties.slaughterhouse.isCompleted !== false) : true;
        const shVar = (e.properties?.slaughterhouse?.variant || 0) % 2;
        mMatrix.identity();
        mMatrix.makeRotationY(0);
        mMatrix.setPosition(e.x + 1.0, surfaceH, e.y + 1.0);

        if (isCompleted && slaughterhouseCounts[shVar] < 100) {
          let bClan = e.properties?.group;
          if (!bClan && e.properties?.groupId) bClan = clanGroups.get(e.properties.groupId);
          const clanColor = (bClan && bClan.color !== undefined ? bClan.color : (e.properties?.render?.color || 0x8a3324)) & 0xffffff;
          this.instSlaughterhouseWalls[shVar].setMatrixAt(slaughterhouseCounts[shVar], mMatrix);
          this.instSlaughterhouseRoofs[shVar].setMatrixAt(slaughterhouseCounts[shVar], mMatrix);
          this.instSlaughterhouseRoofs[shVar].setColorAt(slaughterhouseCounts[shVar], this.tempColor1.setHex(clanColor));
          slaughterhouseCounts[shVar]++;
        } else if (!isCompleted && stage2Count < 400) {
          this.instHouseStage2.setMatrixAt(stage2Count++, mMatrix);
        }
      }
      // --- 3D VILLAGE KITCHEN & BAKERY (Cozinha: 2 Variants) ---
      else if (isKitchen) {
        occupiedHouseTiles.add(`${Math.floor(e.x)}_${Math.floor(e.y)}`);
        const isCompleted = e.properties?.kitchen ? (e.properties.kitchen.isCompleted !== false) : true;
        const kitVar = (e.properties?.kitchen?.variant || 0) % 2;
        mMatrix.identity();
        mMatrix.makeRotationY(0);
        mMatrix.setPosition(e.x + 1.0, surfaceH, e.y + 1.0);

        if (isCompleted && kitchenCounts[kitVar] < 100) {
          let bClan = e.properties?.group;
          if (!bClan && e.properties?.groupId) bClan = clanGroups.get(e.properties.groupId);
          const clanColor = (bClan && bClan.color !== undefined ? bClan.color : (e.properties?.render?.color || 0xc45e28)) & 0xffffff;
          this.instKitchenWalls[kitVar].setMatrixAt(kitchenCounts[kitVar], mMatrix);
          this.instKitchenRoofs[kitVar].setMatrixAt(kitchenCounts[kitVar], mMatrix);
          this.instKitchenRoofs[kitVar].setColorAt(kitchenCounts[kitVar], this.tempColor1.setHex(clanColor));
          kitchenCounts[kitVar]++;
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
          let bClan = e.properties?.group;
          if (!bClan && e.properties?.groupId) bClan = clanGroups.get(e.properties.groupId);
          const clanColor = (bClan && bClan.color !== undefined ? bClan.color : (e.properties?.render?.color || 0x2e86ab)) & 0xffffff;
          this.instWaterWellBase.setMatrixAt(waterWellCount, mMatrix);
          this.instWaterWellWood.setMatrixAt(waterWellCount, mMatrix);
          this.instWaterWellRoof.setMatrixAt(waterWellCount, mMatrix);
          this.instWaterWellRoof.setColorAt(waterWellCount, this.tempColor1.setHex(clanColor));
          waterWellCount++;
        } else if (!isCompleted && stage1Count < 400) {
          this.instHouseStage1.setMatrixAt(stage1Count++, mMatrix);
        }
      }
      // --- 3D ARTISAN & BUILDER WORKSHOP HUT (2x2 Footprint) ---
      else if (isArtisanHut) {
        occupiedHouseTiles.add(`${Math.floor(e.x)}_${Math.floor(e.y)}`);
        const isCompleted = e.properties?.artisan_hut ? (e.properties.artisan_hut.isCompleted !== false) : true;
        mMatrix.identity();
        mMatrix.setPosition(e.x + 1.0, surfaceH, e.y + 1.0);

        if (isCompleted && warehouseCounts[0] < 100) {
          let bClan = e.properties?.group;
          if (!bClan && e.properties?.groupId) bClan = clanGroups.get(e.properties.groupId);
          const clanColor = (bClan && bClan.color !== undefined ? bClan.color : (e.properties?.render?.color || 0xd95738)) & 0xffffff;
          this.instWarehouseWalls[0].setMatrixAt(warehouseCounts[0], mMatrix);
          this.instWarehouseRoofs[0].setMatrixAt(warehouseCounts[0], mMatrix);
          this.instWarehouseRoofs[0].setColorAt(warehouseCounts[0], this.tempColor1.setHex(clanColor));
          warehouseCounts[0]++;
        } else if (!isCompleted && stage2Count < 400) {
          this.instHouseStage2.setMatrixAt(stage2Count++, mMatrix);
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
      // --- 3D HOUSES, LEADER PALACES & 14 ARCHITECTURAL VARIATIONS ---
      else if (isHouse) {
        const h = e.properties.house;
        const isLeaderHouse = !!e.properties.leaderHouse || !!h?.isLeaderHouse;
        const fpW = h?.footprintW || (isLeaderHouse ? 3 : (h?.footprint ? Number(h.footprint.split("x")[0]) : 1)) || 1;
        const fpH = h?.footprintH || (isLeaderHouse ? 3 : (h?.footprint ? Number(h.footprint.split("x")[1]) : 1)) || 1;
        for (let fx = 0; fx < fpW; fx++) {
          for (let fy = 0; fy < fpH; fy++) {
            occupiedHouseTiles.add(`${Math.floor(e.x + fx)}_${Math.floor(e.y + fy)}`);
          }
        }

        const isCompleted = h ? (h.isCompleted !== false) : true;
        const totalCost = (h?.woodCost || 3) + (h?.stoneCost || 2) + (h?.boneCost || 0);
        const curMaterials = (h?.woodCurrent || 0) + (h?.stoneCurrent || 0) + (h?.boneCurrent || 0);
        const progress = isCompleted ? 1.0 : (curMaterials / Math.max(1, totalCost));

        // 90° Cardinal Rotation (0 = 0°, 1 = 90°, 2 = 180°, 3 = 270°)
        const rot = h?.rotation || 0;
        const rotAngle = -rot * (Math.PI / 2);

        mMatrix.identity();
        mMatrix.makeRotationY(rotAngle);
        mMatrix.setPosition(e.x + fpW * 0.5, surfaceH, e.y + fpH * 0.5);

        const htx = Math.floor(e.x);
        const hty = Math.floor(e.y);
        const isHouseOverWater = (map?.getTile ? map.getTile(htx, hty) === 2 : false) || (!!h?.isPlatform);
        if (isHouseOverWater && waterPlatformCount < 800) {
          const platMat = new THREE.Matrix4();
          platMat.setPosition(e.x + fpW * 0.5, 0.08, e.y + fpH * 0.5);
          this.instWaterPlatforms.setMatrixAt(waterPlatformCount++, platMat);
        }

        if (isCompleted) {
          let houseClan = e.properties.group;
          if (!houseClan && h?.ownerId) {
            for (const g of clanGroups.values()) {
              if (g.id === e.properties.groupId || g.members?.includes(h.ownerId) || g.members?.includes(Number(h.ownerId))) {
                houseClan = g;
                break;
              }
            }
          }
          const clanColor = (houseClan && houseClan.color !== undefined ? houseClan.color : (e.properties.render?.color || 0xffd700)) & 0xffffff;

          if (isLeaderHouse) {
            let lVar = 0;
            if (h && h.houseVariant !== undefined) {
              lVar = Math.abs(h.houseVariant) % 7;
            } else if (e.properties.leaderHouse?.variant !== undefined) {
              lVar = Math.abs(e.properties.leaderHouse.variant) % 7;
            } else {
              lVar = Math.abs(htx * 5 + hty * 11) % 7;
            }

            const wallMesh = this.instLeaderHouseWallVariants[lVar] || this.instLeaderHouseWallVariants[0];
            const roofMesh = this.instLeaderHouseRoofVariants[lVar] || this.instLeaderHouseRoofVariants[0];
            if (leaderVariantCounts[lVar] < 50) {
              wallMesh.setMatrixAt(leaderVariantCounts[lVar], mMatrix);
              roofMesh.setMatrixAt(leaderVariantCounts[lVar], mMatrix);
              roofMesh.setColorAt(leaderVariantCounts[lVar], this.tempColor1.setHex(clanColor));
              leaderVariantCounts[lVar]++;
            }
          } else {
            let hVar = 0;
            if (h && h.houseVariant !== undefined) {
              hVar = Math.abs(h.houseVariant) % 20;
            } else {
              hVar = (Math.abs(htx * 7 + hty * 13)) % 20;
            }

            const wallMesh = this.instHouseWallVariants[hVar] || this.instHouseWallVariants[0];
            const roofMesh = this.instHouseRoofVariants[hVar] || this.instHouseRoofVariants[0];
            if (houseVariantCounts[hVar] < 200) {
              wallMesh.setMatrixAt(houseVariantCounts[hVar], mMatrix);
              roofMesh.setMatrixAt(houseVariantCounts[hVar], mMatrix);
              roofMesh.setColorAt(houseVariantCounts[hVar], this.tempColor1.setHex(clanColor));
              houseVariantCounts[hVar]++;
            }
          }

          // Hoist Clan Flag Banner atop the Roof Apex
          const flagKey = `${e.id}_house_flag`;
          activeUiIds.add(flagKey);

          const flagSkin = houseClan?.flagSkin || "Feature_Flower.png";
          const fgHex = clanColor;
          const bgHex = (houseClan && houseClan.backcolor !== undefined ? houseClan.backcolor : 0x1e1e28) & 0xffffff;
          const flagTex = createTintedTexture(flagSkin, fgHex, bgHex, 1.0);
          const flagMatKey = flagTex.uuid;

          let flagMesh = this.floatingUiSprites.get(flagKey);
          if (!flagMesh) {
            let flagMat = uiMatCache.get(flagMatKey);
            if (!flagMat) {
              flagMat = new THREE.MeshBasicMaterial({
                map: flagTex,
                transparent: true,
                alphaTest: 0.05,
                depthTest: true,
                side: THREE.DoubleSide
              });
              uiMatCache.set(flagMatKey, flagMat);
            }
            flagMesh = new THREE.Mesh(this.flagGeo, flagMat);
            flagMesh.renderOrder = 30;
            this.floatingUiGroup.add(flagMesh);
            this.floatingUiSprites.set(flagKey, flagMesh);
          } else if (flagMesh.material !== uiMatCache.get(flagMatKey) || flagMesh.material.map !== flagTex) {
            let flagMat = uiMatCache.get(flagMatKey);
            if (!flagMat) {
              flagMat = new THREE.MeshBasicMaterial({
                map: flagTex,
                transparent: true,
                alphaTest: 0.05,
                depthTest: true,
                side: THREE.DoubleSide
              });
              uiMatCache.set(flagMatKey, flagMat);
            }
            flagMesh.material = flagMat;
          }

          const numFloors = h?.maxFloors || h?.floors?.length || (isLeaderHouse ? 7 : 2);
          const peakY = surfaceH + (1.20 + numFloors * 1.15) + 0.25;
          flagMesh.position.set(e.x + fpW * 0.5, peakY, e.y + fpH * 0.5);
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
        let skinName = r.skin;
        if (!skinName) {
          skinName = isItem ? "Item_Nugget.png" : (e.properties?.brain ? "Human_Knight_M.png" : "Item_Nugget.png");
        }
        if (isDoor) {
          skinName = e.properties.door.isOpen ? "Feature_Door_Open.png" : "Feature_Door_Closed.png";
        }

        const entFg = r.color !== undefined ? r.color : 0xffffff;
        const tex = createTintedTexture(skinName, entFg, 0x000000, 0.0);
        // tex.uuid can be used as cache key since createTintedTexture returns a cached texture instance
        const matKey = tex.uuid;

        let sprite = this.entitySprites.get(e.id);
        if (!sprite) {
          let mat = billboardMatCache.get(matKey);
          if (!mat) {
            mat = new THREE.MeshLambertMaterial({
              map: tex,
              dithering: true,
              transparent: true,
              alphaTest: 0.08,
              side: THREE.DoubleSide
            });
            applyRetroDitherToMaterial(mat);
            billboardMatCache.set(matKey, mat);
          }
          
          let depthMat = depthMatCache.get(matKey);
          if (!depthMat) {
            depthMat = new THREE.MeshDepthMaterial({
              depthPacking: THREE.RGBADepthPacking,
              map: tex,
              alphaTest: 0.08
            });
            depthMatCache.set(matKey, depthMat);
          }

          sprite = new THREE.Mesh(this.billboardGeo, mat);
          sprite.castShadow = true;
          sprite.receiveShadow = true;
          sprite.customDepthMaterial = depthMat;
          sprite.renderOrder = 10;
          sprite.userData = { entityId: e.id };
          this.entityGroup.add(sprite);
          this.entitySprites.set(e.id, sprite);
        } else if (sprite.material !== billboardMatCache.get(matKey) || sprite.material.map !== tex) {
          let mat = billboardMatCache.get(matKey);
          if (!mat) {
            mat = new THREE.MeshLambertMaterial({
              map: tex,
              dithering: true,
              transparent: true,
              alphaTest: 0.08,
              side: THREE.DoubleSide
            });
            applyRetroDitherToMaterial(mat);
            billboardMatCache.set(matKey, mat);
          }
          sprite.material = mat;
          
          let depthMat = depthMatCache.get(matKey);
          if (!depthMat) {
            depthMat = new THREE.MeshDepthMaterial({
              depthPacking: THREE.RGBADepthPacking,
              map: tex,
              alphaTest: 0.08
            });
            depthMatCache.set(matKey, depthMat);
          }
          sprite.customDepthMaterial = depthMat;
        }

        const isSleeping = !!e.properties?.life?.isSleeping && !!e.properties?.brain;
        const isStandingTorch = !!e.properties?.torch;
        const billboardRotY = this.isPerspectiveActive() ? (this.fpYaw + Math.PI) : this.fixedRotationY;
        const isPossessed = this.isFirstPersonActive() && Number(e.id) === Number(this.fpEntityId);

        if (isPossessed) {
          sprite.visible = false;
        } else {
          sprite.visible = true;
        }

        if (isStandingTorch) {
          sprite.scale.set(0.68, 0.68, 0.68);
          sprite.position.set(e.x + 0.5, surfaceH, e.y + 0.5);
          sprite.rotation.y = billboardRotY;
          sprite.rotation.z = 0;
          sprite.castShadow = false; // Do not occlude own light source
          sprite.receiveShadow = false;
        } else if (isItem) {
          sprite.scale.set(0.48, 0.48, 0.48);
          sprite.position.set(e.x, surfaceH, e.y);
          sprite.rotation.y = billboardRotY;
          sprite.rotation.z = 0;
          sprite.castShadow = true;
          sprite.receiveShadow = true;
        } else if (isSleeping) {
          // Lying down flat on the ground while sleeping
          sprite.scale.set(0.65, 0.65, 0.65);
          sprite.position.set(e.x, surfaceH + 0.10, e.y);
          sprite.rotation.y = billboardRotY;
          sprite.rotation.z = Math.PI / 2;
        } else {
          // Compact scale for creatures with subtle elevation in 1P/3P mode so they don't clip ground
          const cScale = this.isPerspectiveActive() ? 0.82 : 0.72;
          const cElev = this.isPerspectiveActive() ? 0.04 : 0.0;
          sprite.scale.set(cScale, cScale, cScale);
          sprite.position.set(e.x, surfaceH + cElev, e.y);
          sprite.rotation.y = billboardRotY;
          sprite.rotation.z = 0;
        }

        // Dimming in Vision Mode outside current zone
        const isConsciousCreature = !isItem && !isDoor && !!e.properties?.brain;
        const inCurZone = !knownZones || (Math.floor(e.x / zoneSz) === curVisionZx && Math.floor(e.y / zoneSz) === curVisionZy);

        if (e.combatFlash > 0) {
          sprite.material.color.setHex(0xff3333);
        } else if (!inCurZone) {
          sprite.material.color.setHex(0x555555); // Dimmed
        } else if (this.isPerspectiveActive() && isConsciousCreature) {
          sprite.material.color.setHex(0xffffff); // Crisp and vibrant in perspective
        } else {
          sprite.material.color.setHex(0xffffff); // Full bright
        }

        // --- 3D FLOATING EMOTES & HELD ITEMS / BACKPACKS PER HAND (STRICTLY CONSCIOUS CREATURES) ---
        if (isConsciousCreature) {
          const emoteSkin = getCreatureEmoteSkin(e);
          const heldItems = [];

          if (e.properties?.backpack) {
            heldItems.push({
              name: "Mochila",
              skin: "Item_Bag.png",
              resourceType: "backpack",
              tint: 0xd4a373
            });
          }

          const ep = e.properties || {};
          for (const k in ep) {
            const p = ep[k];
            if ((k.includes("arm") || k.includes("hand") || k.includes("Arm") || k.includes("Hand")) && p && p.heldItem) {
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
              const emMatKey = emTex.uuid;

              let emMesh = this.floatingUiSprites.get(uiKey);
              if (!emMesh) {
                let emMat = uiMatCache.get(emMatKey);
                if (!emMat) {
                  emMat = new THREE.MeshBasicMaterial({
                    map: emTex,
                    transparent: true,
                    alphaTest: 0.1,
                    depthTest: true,
                    side: THREE.DoubleSide
                  });
                  uiMatCache.set(emMatKey, emMat);
                }
                emMesh = new THREE.Mesh(this.uiIconGeo, emMat);
                emMesh.renderOrder = 25;
                this.floatingUiGroup.add(emMesh);
                this.floatingUiSprites.set(uiKey, emMesh);
              } else if (emMesh.material !== uiMatCache.get(emMatKey) || emMesh.material.map !== emTex) {
                let emMat = uiMatCache.get(emMatKey);
                if (!emMat) {
                  emMat = new THREE.MeshBasicMaterial({
                    map: emTex,
                    transparent: true,
                    alphaTest: 0.1,
                    depthTest: true,
                    side: THREE.DoubleSide
                  });
                  uiMatCache.set(emMatKey, emMat);
                }
                emMesh.material = emMat;
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

              let skinName = it.skin || it.render?.skin;
              if (!skinName) {
                if (it.resourceType === "basket" || it.name?.includes("Cesto") || it.name?.includes("Basket")) skinName = "Item_Bag.png";
                else if (it.resourceType === "backpack" || it.name?.includes("Mochila") || it.name?.includes("Bolsa")) skinName = "Item_Bag.png";
                else if (it.resourceType === "wood") skinName = "Item_Wood.png";
                else if (it.resourceType === "stone") skinName = "Feature_Boulders.png";
                else if (it.resourceType === "meat") skinName = "Item_Steak.png";
                else if (it.resourceType === "food") skinName = "Item_Vegetable.png";
                else skinName = (typeof it === "string" ? it : it.name) || "Item_Nugget.png";
              }
              const tintColor = it.tint || (it.resourceType === "basket" ? 0xffd28c : (it.resourceType === "backpack" ? 0xcc8844 : 0xffffff));
              const itTex = createTintedTexture(skinName, tintColor, 0x000000, 0.0);
              const itMatKey = itTex.uuid;

              let itMesh = this.floatingUiSprites.get(uiKey);
              if (!itMesh) {
                let itMat = uiMatCache.get(itMatKey);
                if (!itMat) {
                  itMat = new THREE.MeshBasicMaterial({
                    map: itTex,
                    transparent: true,
                    alphaTest: 0.1,
                    depthTest: true,
                    side: THREE.DoubleSide
                  });
                  uiMatCache.set(itMatKey, itMat);
                }
                itMesh = new THREE.Mesh(this.uiIconGeo, itMat);
                itMesh.renderOrder = 25;
                this.floatingUiGroup.add(itMesh);
                this.floatingUiSprites.set(uiKey, itMesh);
              } else if (itMesh.material !== uiMatCache.get(itMatKey) || itMesh.material.map !== itTex) {
                let itMat = uiMatCache.get(itMatKey);
                if (!itMat) {
                  itMat = new THREE.MeshBasicMaterial({
                    map: itTex,
                    transparent: true,
                    alphaTest: 0.1,
                    depthTest: true,
                    side: THREE.DoubleSide
                  });
                  uiMatCache.set(itMatKey, itMat);
                }
                itMesh.material = itMat;
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
        // Compute footprint for reticle scaling
        let selFpW = 1, selFpH = 1;
        if (isHouse && e.properties.house) {
          selFpW = e.properties.house.footprintW || 1;
          selFpH = e.properties.house.footprintH || 1;
        } else if (isLeaderHouse || e.properties.leaderHouse) {
          selFpW = 3; selFpH = 3;
        } else if (isWarehouse || isSlaughterhouse || isKitchen || isArtisanHut) {
          selFpW = 2; selFpH = 2;
        }

        const isTileAligned = isTree || isHouse || isLeaderHouse || isWall || isCactus || isWarehouse || isSlaughterhouse || isKitchen || isArtisanHut || isWell || isCampfire || isRoad;

        selectedPos = {
          x: isTileAligned ? Math.floor(e.x) + selFpW * 0.5 : e.x,
          y: surfaceH + 0.02,
          z: isTileAligned ? Math.floor(e.y) + selFpH * 0.5 : e.y,
          fpW: selFpW,
          fpH: selFpH
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

        const isPersp = this.isPerspectiveActive();
        const sz = currentZoneSize || 8;

        // 1. Standing Furniture Torches on Ground
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
          c.distance = isPersp ? 18.0 : Math.max(2.5, sz * 0.38);
          c.decay = isPersp ? 1.15 : 1.4;
          c.intensity = isPersp ? nightGlow * 2.4 : nightGlow * 1.8;
          c.priority = 1; // Top priority for placed torches
          c.distSq = dx * dx + dy * dy;
          continue;
        }

        // 2. Wood Campfire (Warm Radiant Firelight with atmospheric reach and balanced brightness)
        const isCampfire = !!e.properties?.campfire;
        if (isCampfire && e.properties?.campfire?.isLit && (e.properties?.campfire?.fuel || 0) > 0) {
          const sH = this.getSurfaceElevation(map, e.x + 0.5, e.y + 0.5);
          const dx = (e.x + 0.5) - focusX;
          const dy = (e.y + 0.5) - focusY;
          const c = this.lightCandidatesPool[candidateCount++];
          c.x = e.x + 0.5;
          c.y = sH + 0.50;
          c.z = e.y + 0.5;
          c.color = 0xff7b18;
          c.distance = isPersp ? 34.0 : Math.max(8.0, sz * 1.45);
          c.decay = isPersp ? 1.0 : 1.0;
          c.intensity = isPersp ? nightGlow * 6.8 : nightGlow * 6.5;
          c.priority = 0; // Highest priority for central campfires
          c.distSq = dx * dx + dy * dy;
          continue;
        }

        // 3. Torches Carried by Intelligent Creatures
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
            c.distance = isPersp ? 16.0 : Math.max(2.2, sz * 0.32);
            c.decay = isPersp ? 1.2 : 1.5;
            c.intensity = isPersp ? nightGlow * 2.2 : nightGlow * 1.6;
            c.priority = e.id === this.selectedEntityId ? 0 : 2;
            c.distSq = dx * dx + dy * dy;
          }
          continue;
        }

        // 4. Wall Torches / Watchtower Torch Brackets
        const isWall = e.properties?.structure && !e.properties?.house && !e.properties?.door && !!e.properties?.torch;
        if (isWall) {
          const sH = this.getTileSurfaceHeight(map, Math.floor(e.x), Math.floor(e.y), 1, 1);
          const dx = (e.x + 0.5) - focusX;
          const dy = (e.y + 0.5) - focusY;
          const c = this.lightCandidatesPool[candidateCount++];
          c.x = e.x + 0.5;
          c.y = sH + 1.60;
          c.z = e.y + 0.5;
          c.color = 0xffb555;
          c.distance = isPersp ? 20.0 : 10.0;
          c.decay = isPersp ? 1.2 : 1.6;
          c.intensity = isPersp ? nightGlow * 2.6 : nightGlow * 2.0;
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
    for (let w = 0; w < 2; w++) {
      this.instWarehouseWalls[w].count = warehouseCounts[w];
      this.instWarehouseWalls[w].instanceMatrix.needsUpdate = true;
      this.instWarehouseRoofs[w].count = warehouseCounts[w];
      this.instWarehouseRoofs[w].instanceMatrix.needsUpdate = true;
      if (this.instWarehouseRoofs[w].instanceColor) this.instWarehouseRoofs[w].instanceColor.needsUpdate = true;
    }

    for (let s = 0; s < 2; s++) {
      this.instSlaughterhouseWalls[s].count = slaughterhouseCounts[s];
      this.instSlaughterhouseWalls[s].instanceMatrix.needsUpdate = true;
      this.instSlaughterhouseRoofs[s].count = slaughterhouseCounts[s];
      this.instSlaughterhouseRoofs[s].instanceMatrix.needsUpdate = true;
      if (this.instSlaughterhouseRoofs[s].instanceColor) this.instSlaughterhouseRoofs[s].instanceColor.needsUpdate = true;
    }

    for (let k = 0; k < 2; k++) {
      this.instKitchenWalls[k].count = kitchenCounts[k];
      this.instKitchenWalls[k].instanceMatrix.needsUpdate = true;
      this.instKitchenRoofs[k].count = kitchenCounts[k];
      this.instKitchenRoofs[k].instanceMatrix.needsUpdate = true;
      if (this.instKitchenRoofs[k].instanceColor) this.instKitchenRoofs[k].instanceColor.needsUpdate = true;
    }

    this.instWaterWellBase.count = waterWellCount;
    this.instWaterWellBase.instanceMatrix.needsUpdate = true;
    this.instWaterWellWood.count = waterWellCount;
    this.instWaterWellWood.instanceMatrix.needsUpdate = true;
    this.instWaterWellRoof.count = waterWellCount;
    this.instWaterWellRoof.instanceMatrix.needsUpdate = true;
    if (this.instWaterWellRoof.instanceColor) this.instWaterWellRoof.instanceColor.needsUpdate = true;

    for (let h = 0; h < 20; h++) {
      this.instHouseWallVariants[h].count = houseVariantCounts[h];
      this.instHouseWallVariants[h].instanceMatrix.needsUpdate = true;
      this.instHouseRoofVariants[h].count = houseVariantCounts[h];
      this.instHouseRoofVariants[h].instanceMatrix.needsUpdate = true;
      if (this.instHouseRoofVariants[h].instanceColor) {
        this.instHouseRoofVariants[h].instanceColor.needsUpdate = true;
      }
    }

    for (let l = 0; l < 7; l++) {
      this.instLeaderHouseWallVariants[l].count = leaderVariantCounts[l];
      this.instLeaderHouseWallVariants[l].instanceMatrix.needsUpdate = true;
      this.instLeaderHouseRoofVariants[l].count = leaderVariantCounts[l];
      this.instLeaderHouseRoofVariants[l].instanceMatrix.needsUpdate = true;
      if (this.instLeaderHouseRoofVariants[l].instanceColor) {
        this.instLeaderHouseRoofVariants[l].instanceColor.needsUpdate = true;
      }
    }

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
        this.entitySprites.delete(id);
      }
    }

    // Clean inactive floating UI icons & house flags
    for (const [key, spr] of this.floatingUiSprites.entries()) {
      if (!activeUiIds.has(key)) {
        this.floatingUiGroup.remove(spr);
        this.floatingUiSprites.delete(key);
      }
    }

    // Update Claimed Territory 3D Overlay
    this.rebuildTerritoryOverlayIfNeeded(world, clanGroups, visualizedGroupId);

    // Update Selection Reticle
    if (selectedPos) {
      this.reticleMesh.position.set(selectedPos.x, selectedPos.y, selectedPos.z);
      const scaleX = selectedPos.fpW || 1;
      const scaleZ = selectedPos.fpH || 1;
      this.reticleMesh.scale.set(scaleX, 1, scaleZ);
      this.reticleMesh.visible = true;
    } else {
      this.reticleMesh.visible = false;
    }

    // Update 3D Atmosphere Clouds (Always visible in 1P & 3P modes, and at high altitude zoom in isometric)
    if (this.cloudMesh && this.cloudMat) {
      if (this.isPerspectiveActive() || this.zoom <= 0.38) {
        this.cloudMesh.visible = true;
        this.cloudMesh.position.set(this.camX, 42.0, this.camY);
        this.cloudMat.uniforms.uTime.value = performance.now() * 0.001;
        const fade = this.isPerspectiveActive() ? 0.95 : Math.min(1.0, (0.38 - this.zoom) / 0.18);
        this.cloudMat.uniforms.uFade.value = fade;
        this.cloudMat.uniforms.uSunColor.value.copy(this.sunLight.color);
        this.cloudMat.uniforms.uAmbColor.value.copy(this.ambientLight.color);
      } else {
        this.cloudMesh.visible = false;
      }
    }

    // Animated realistic flame shaders for campfires and torches
    const flameTime = performance.now() * 0.001;
    if (this.materials.campfireFlames?.uniforms?.uTime) {
      this.materials.campfireFlames.uniforms.uTime.value = flameTime;
    }
    if (this.materials.torchFlames?.uniforms?.uTime) {
      this.materials.torchFlames.uniforms.uTime.value = flameTime;
    }

    // Draw WebGL Frame with Depth of Field & Chromatic Aberration in Perspective Modes
    const activeCam = this.isPerspectiveActive() ? this.fpCamera : this.camera;
    if (this.isPerspectiveActive() && this.postEffectsEnabled && this.renderTarget) {
      this.renderer.setRenderTarget(this.renderTarget);
      this.renderer.render(this.scene, activeCam);
      this.renderer.setRenderTarget(null);
      this.postMaterial.uniforms.tDiffuse.value = this.renderTarget.texture;

      const dofOpt = this.graphicOptions?.dofStrength || "HIGH";
      let dofVal = 0.0;
      if (dofOpt === "LOW") dofVal = 0.85;
      else if (dofOpt === "MED") dofVal = 1.45;
      else if (dofOpt === "HIGH") dofVal = this.isFirstPersonActive() ? 2.1 : 1.35;
      this.postMaterial.uniforms.uDofStrength.value = dofVal;

      this.postMaterial.uniforms.uChroma.value = (this.graphicOptions?.chroma !== false) ? 1.0 : 0.0;

      this.renderer.render(this.postScene, this.postCamera);
    } else {
      this.renderer.setRenderTarget(null);
      this.renderer.render(this.scene, activeCam);
    }
  }

  projectWorldToScreen(worldX, worldY, elevation = 0) {
    const activeCam = this.isPerspectiveActive() ? this.fpCamera : this.camera;
    if (!activeCam) return null;
    const v = new THREE.Vector3(worldX, elevation, worldY);
    v.project(activeCam);
    const sw = (typeof CANVAS_WIDTH !== "undefined" && CANVAS_WIDTH > 0) ? CANVAS_WIDTH : (this.width || 800);
    const sh = (typeof CANVAS_HEIGHT !== "undefined" && CANVAS_HEIGHT > 0) ? CANVAS_HEIGHT : (this.height || 600);
    const sx = (v.x * 0.5 + 0.5) * sw;
    const sy = (-(v.y * 0.5) + 0.5) * sh;
    return {
      x: sx,
      y: sy,
      visible: v.z < 1.0 && sx >= -100 && sx <= sw + 100 && sy >= -100 && sy <= sh + 100
    };
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
