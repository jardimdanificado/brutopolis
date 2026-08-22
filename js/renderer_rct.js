// =============================================================================
// Brutopolis Chronicles - 3D Isometric Tycoon Engine (Volumetric 3D Models)
// =============================================================================

import * as THREE from "https://esm.sh/three@0.160.0";
import { ASSET_DATA } from "./assets_data.js";
import { MAP_WIDTH, MAP_HEIGHT, TILE_FLOOR, TILE_MOUNTAIN, TILE_WATER, TILE_SAND, TILE_STONE, TILE_VOID } from "./world_gen.js";
import { globalWallCoords, resolveWallSkin, getEntitiesInViewport } from "./engine.js";

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
  const isHouse = !!e.properties?.house || r?.skin === "Overworld_House.png";
  const isWall = !isDoor && !isHouse && (e.properties?.structure || r?.skin?.startsWith("Wall_") || e.properties?.name?.includes("Muralha") || e.properties?.name?.includes("Wall"));
  const isCactus = e.properties?.species === "cactus" || e.properties?.name?.toLowerCase().includes("cactus") || e.properties?.name?.toLowerCase().includes("cacto");
  const isTree = !isCactus && (e.properties?.species === "oak" || e.properties?.species === "pine" || e.properties?.species === "willow" || e.properties?.species === "tree" || !!e.properties?.tree || (r?.skin && r?.skin.toLowerCase().includes("tree")));

  if (isTree) return { radius: 1.1, h: 2.6, yBottom: 0.0 };
  if (isHouse) return { radius: 1.3, h: 2.4, yBottom: 0.0 };
  if (isCactus) return { radius: 0.9, h: 2.0, yBottom: 0.0 };
  if (isWall) return { radius: 0.75, h: 1.5, yBottom: 0.0 };
  if (isItem) return { radius: 0.5, h: 0.9, yBottom: 0.0 };
  return { radius: 0.7, h: 1.4, yBottom: 0.0 }; // Creatures / humanoids
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
// 3D Procedural Geometries (Saguaro Cactus, Natural Grass, Roofs)
// ---------------------------------------------------------------------------

function mergeBufferGeometries(geometries) {
  const parts = [];
  for (const g of geometries) {
    parts.push(g.index ? g.toNonIndexed() : g);
  }

  let totalPos = 0;
  let totalUv = 0;
  for (const g of parts) {
    totalPos += g.attributes.position.array.length;
    totalUv += g.attributes.uv.array.length;
  }

  const posArr = new Float32Array(totalPos);
  const uvArr = new Float32Array(totalUv);
  let posOffset = 0;
  let uvOffset = 0;

  for (const g of parts) {
    const p = g.attributes.position.array;
    const u = g.attributes.uv.array;
    posArr.set(p, posOffset);
    uvArr.set(u, uvOffset);
    posOffset += p.length;
    uvOffset += u.length;
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
  // Rotate +45 degrees so arms spread horizontally across the isometric view
  merged.rotateY(Math.PI / 4);
  return merged;
}

function createNaturalGrassGeometry(w = 0.72, h = 0.58) {
  const hw = w / 2;
  const p1 = new THREE.PlaneGeometry(w, h);
  p1.translate(0, h / 2, 0);

  const p2 = p1.clone();
  p2.rotateY(Math.PI / 3);

  const p3 = p1.clone();
  p3.rotateY(-Math.PI / 3);

  return mergeBufferGeometries([p1, p2, p3]);
}

function createPitchedRoofGeometry(width = 1.6, depth = 1.6, height = 0.65) {
  const hw = width / 2;
  const hd = depth / 2;
  const positions = [
    -hw, 0, hd,   hw, 0, hd,   hw, height, 0,
    -hw, 0, hd,   hw, height, 0,  -hw, height, 0,
    -hw, 0, -hd,  -hw, height, 0,  hw, height, 0,
    -hw, 0, -hd,  hw, height, 0,   hw, 0, -hd,
    -hw, 0, -hd,  -hw, 0,  hd,  -hw, height, 0,
     hw, 0,  hd,   hw, 0, -hd,   hw, height, 0
  ];
  const uvs = [
    0, 0, 1, 0, 1, 1,  0, 0, 1, 1, 0, 1,
    0, 0, 0, 1, 1, 1,  0, 0, 1, 1, 1, 0,
    0, 0, 1, 0, 0.5, 1,  0, 0, 1, 0, 0.5, 1
  ];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.computeVertexNormals();
  return geo;
}

// ---------------------------------------------------------------------------
// Main RCT 3D Renderer Class (Volumetric 3D Models + Shaded Terrain)
// ---------------------------------------------------------------------------

export class RCT3DRenderer {
  constructor(container) {
    this.container = container;
    this.width = container.clientWidth || window.innerWidth;
    this.height = container.clientHeight || window.innerHeight;
    this.scaleFactor = 1.0; // 100% Native HD -> 75% Balanced -> 50% Retro Pixel

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

    // 5. Materials with Vertex Colors for Contact AO
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
      houseWall: new THREE.MeshLambertMaterial({
        map: createTintedTexture("Feature_Stone_B.png", 0xdfd4bc, 0x7c6950, 1.0),
        side: THREE.DoubleSide
      }),
      houseRoof: new THREE.MeshLambertMaterial({
        map: createTintedTexture("Feature_Stone_C.png", 0xe65c40, 0x8a2b16, 1.0),
        side: THREE.DoubleSide
      }),
      houseBlueprint: new THREE.MeshLambertMaterial({
        map: createTintedTexture("Feature_Door_Closed.png", 0xe8d090, 0x4a3a20, 0.9),
        transparent: true,
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

    // Houses
    const houseWallGeo = new THREE.BoxGeometry(1.5, 0.9, 1.5);
    houseWallGeo.translate(0, 0.45, 0);
    this.instHouseWalls = new THREE.InstancedMesh(houseWallGeo, this.materials.houseWall, 400);
    this.instHouseWalls.castShadow = true;
    this.instHouseWalls.receiveShadow = true;

    const houseRoofGeo = createPitchedRoofGeometry(1.65, 1.65, 0.65);
    houseRoofGeo.translate(0, 0.9, 0);
    this.instHouseRoofs = new THREE.InstancedMesh(houseRoofGeo, this.materials.houseRoof, 400);
    this.instHouseRoofs.castShadow = true;
    this.instHouseRoofs.receiveShadow = true;

    // Blueprints
    const bpGeo = new THREE.BoxGeometry(1.4, 0.15, 1.4);
    bpGeo.translate(0, 0.08, 0);
    this.instBlueprints = new THREE.InstancedMesh(bpGeo, this.materials.houseBlueprint, 300);

    // Natural Grass Tufts
    const grassGeo = createNaturalGrassGeometry(0.72, 0.58);
    this.instGrassTufts = new THREE.InstancedMesh(grassGeo, this.materials.grassFoliage, 1200);

    this.instancedGroup = new THREE.Group();
    this.instancedGroup.add(
      this.instOakTrunks, this.instOakLeaves,
      this.instPineTrunks, this.instPineLeaves,
      this.instCacti, this.instWalls,
      this.instHouseWalls, this.instHouseRoofs,
      this.instBlueprints, this.instGrassTufts
    );
    this.scene.add(this.instancedGroup);

    // Dynamic Billboard Entities (Creatures, Humanoids, Items)
    this.billboardGeo = new THREE.PlaneGeometry(1.25, 1.25);
    this.billboardGeo.translate(0, 0.62, 0);
    this.entityGroup = new THREE.Group();
    this.scene.add(this.entityGroup);
    this.entitySprites = new Map();

    // Terrain & Water Groups
    this.terrainGroup = new THREE.Group();
    this.scene.add(this.terrainGroup);

    this.waterGroup = new THREE.Group();
    this.scene.add(this.waterGroup);

    // RCT Dark Quad Line Overlay Group (for GRID mode)
    this.rctGridLineGroup = new THREE.Group();
    // Selection Reticle (Ground Decal beneath units)
    const reticleGeo = new THREE.RingGeometry(0.55, 0.75, 4);
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

    // Raycaster & Ground Plane
    this.raycaster = new THREE.Raycaster();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  }

  // ---------------------------------------------------------------------------
  // Resolution Downscaling (100% -> 75% -> 50%)
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
    if (this.scaleFactor === 1.0) {
      this.scaleFactor = 0.75;
    } else if (this.scaleFactor === 0.75) {
      this.scaleFactor = 0.5;
    } else {
      this.scaleFactor = 1.0;
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

    // Normal vector for billboard/volumetric cross-section in 45° isometric view
    const nx = 0.70710678;
    const nz = 0.70710678;

    for (let i = 0; i < entities.length; i++) {
      const e = entities[i];
      if (!e || e.destroyed || !e.properties?.render) continue;

      const surfaceH = map ? this.getSurfaceElevation(map, e.x, e.y) : 1.0;
      const bounds = getEntityBounds(e);

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
      if (distToRay < Math.max(0.65, bounds.radius * 0.95)) {
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

      const surfaceH = map ? this.getSurfaceElevation(map, e.x, e.y) : 1.0;
      const bounds = getEntityBounds(e);

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
      if (distToRay < Math.max(0.65, bounds.radius * 0.95)) {
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

  updateDayNightLighting(world) {
    const clock = world?.clock;
    if (!clock) return;

    const globalLight = clock.globalLight !== undefined ? clock.globalLight : 1.0;
    const hour = clock.hour !== undefined ? clock.hour : 12;
    const minute = clock.minute !== undefined ? clock.minute : 0;
    const timeOfDay = hour + minute / 60.0;

    let sunHex = 0xfffaea;
    let ambientHex = 0xdde8f5;
    let bgHex = 0x131922;

    if (timeOfDay >= 5.0 && timeOfDay < 7.5) {
      sunHex = 0xffa550;
      ambientHex = 0xc5a898;
      bgHex = 0x221820;
    } else if (timeOfDay >= 7.5 && timeOfDay < 16.5) {
      sunHex = 0xfffaea;
      ambientHex = 0xdde8f5;
      bgHex = 0x131922;
    } else if (timeOfDay >= 16.5 && timeOfDay < 19.0) {
      sunHex = 0xff8c42;
      ambientHex = 0x8a6078;
      bgHex = 0x1a1224;
    } else {
      sunHex = 0x6e8cc8;
      ambientHex = 0x1d2942;
      bgHex = 0x080c14;
    }

    const sunIntensity = 0.3 + 1.25 * globalLight;
    const ambientIntensity = 0.25 + 0.70 * globalLight;

    this.sunLight.color.setHex(sunHex);
    this.sunLight.intensity = sunIntensity;

    this.ambientLight.color.setHex(ambientHex);
    this.ambientLight.intensity = ambientIntensity;

    this.scene.background.setHex(bgHex);
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

  render(world, entities, time, dt, simSpeed = 1.0, visionCreature = null) {
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
    this.updateDayNightLighting(world);

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
    let selectedPos = null;

    let oakCount = 0;
    let pineCount = 0;
    let cactusCount = 0;
    let wallCount = 0;
    let houseCount = 0;
    let bpCount = 0;

    const mMatrix = new THREE.Matrix4();

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
      const isHouse = !!e.properties.house || r.skin === "Overworld_House.png";
      const isWall = !isDoor && !isHouse && (e.properties.structure || r.skin?.startsWith("Wall_") || e.properties.name?.includes("Muralha") || e.properties.name?.includes("Wall"));
      const isCactus = e.properties.species === "cactus" || e.properties.name?.toLowerCase().includes("cactus") || e.properties.name?.toLowerCase().includes("cacto");
      const isTree = !isCactus && (e.properties.species === "oak" || e.properties.species === "pine" || e.properties.species === "willow" || e.properties.species === "tree" || !!e.properties.tree || (r.skin && r.skin.toLowerCase().includes("tree")));
      const isPine = isTree && (e.properties.species === "pine" || (r.skin && r.skin.toLowerCase().includes("pine")));

      const surfaceH = this.getSurfaceElevation(map, e.x, e.y);

      // --- 3D OAK TREES ---
      if (isTree && !isPine && oakCount < this.maxInstances) {
        mMatrix.setPosition(e.x + 0.5, surfaceH, e.y + 0.5);
        this.instOakTrunks.setMatrixAt(oakCount, mMatrix);
        this.instOakLeaves.setMatrixAt(oakCount, mMatrix);
        oakCount++;
      }
      // --- 3D PINE TREES ---
      else if (isPine && pineCount < this.maxInstances) {
        mMatrix.setPosition(e.x + 0.5, surfaceH, e.y + 0.5);
        this.instPineTrunks.setMatrixAt(pineCount, mMatrix);
        this.instPineLeaves.setMatrixAt(pineCount, mMatrix);
        pineCount++;
      }
      // --- 3D SAGUARO CACTI ---
      else if (isCactus && cactusCount < this.maxInstances) {
        mMatrix.setPosition(e.x + 0.5, surfaceH, e.y + 0.5);
        this.instCacti.setMatrixAt(cactusCount, mMatrix);
        cactusCount++;
      }
      // --- 3D STONE WALLS ---
      else if (isWall && wallCount < this.maxInstances) {
        mMatrix.setPosition(e.x + 0.5, surfaceH, e.y + 0.5);
        this.instWalls.setMatrixAt(wallCount, mMatrix);
        wallCount++;
      }
      // --- 3D HOUSES & BLUEPRINTS ---
      else if (isHouse) {
        const isCompleted = e.properties.house ? (e.properties.house.isCompleted !== false) : true;
        if (isCompleted && houseCount < 400) {
          mMatrix.setPosition(e.x + 0.5, surfaceH, e.y + 0.5);
          this.instHouseWalls.setMatrixAt(houseCount, mMatrix);
          this.instHouseRoofs.setMatrixAt(houseCount, mMatrix);
          houseCount++;
        } else if (!isCompleted && bpCount < 300) {
          mMatrix.setPosition(e.x + 0.5, surfaceH, e.y + 0.5);
          this.instBlueprints.setMatrixAt(bpCount, mMatrix);
          bpCount++;
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
          sprite.scale.set(0.65, 0.65, 0.65);
        } else {
          sprite.scale.set(1.15, 1.15, 1.15);
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

    this.instBlueprints.count = bpCount;
    this.instBlueprints.instanceMatrix.needsUpdate = true;

    // Clean inactive dynamic billboards
    for (const [id, spr] of this.entitySprites.entries()) {
      if (!activeIds.has(id)) {
        this.entityGroup.remove(spr);
        if (spr.material) spr.material.dispose();
        this.entitySprites.delete(id);
      }
    }

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
