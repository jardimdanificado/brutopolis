// =============================================================================
// Brutopolis - Web Worker Simulation Engine
// =============================================================================

import { World } from "./world.js";
import {
  createEntity,
  tickEntities,
  entityRegistry,
  getEntityById,
  destroyEntity,
  explodeEntityOnDeath,
  currentTick,
  resetEngineTicks,
  incrementEngineTick,
  rebuildSpatialGrid,
  getEntityAtTile,
  getEntitiesInRadius,
  tileEntityMap
} from "./engine.js";
import {
  resetWorldEvents,
  getEventsForEntity,
  getEventsForGroup,
  getRecentWorldEvents,
  getEventById,
  exportWorldSaveJSON,
  restoreWorldEvents,
  recordWorldEvent,
  OP_RELATION,
  allEvents
} from "./event_log.js";
import {
  createHuman,
  createElf,
  createDwarf,
  createOrc,
  createBoar,
  createDeer,
  createSpider,
  createKnight,
  createArcher,
  createCat,
  createBat,
  createDragon,
  createWolf,
  createBear,
  createGoblin,
  createSeaSerpent,
  createScorpion,
  createLizard,
  createAlpineShrub,
  createMountainGoat,
  createCapybara,
  createCow,
  createChicken,
  createDuck,
  createFrog,
  createRabbit,
  createKobold,
  createLizardfolk,
  createCatfolk,
  createCentaur,
  createWoodItem,
  createStoneItem,
  createOakTree,
  createWillowTree,
  createPineTree,
  createCactus,
  createWaterLily,
  createSeaweed,
  createFruit,
  createSeedEntity,
  createStoneWallEntity,
  createWaterWellEntity,
  createRoadEntity,
  createEmbarkParty,
  rebindEntityMethods,
  getZoneSize,
  setZoneSize,
  getGroupStockpile,
  setActiveWorld,
  isTileInClaimedZones,
  createGroupMemberProp
} from "./properties.js";

// Worker Simulation State
let world = null;
let entities = [];
let isPaused = false;
let simSpeed = 1.0;
let currentPreset = 0;
let genSeed = 1337;
let genWidth = 256;
let genHeight = 256;
let genZoneSize = 8;
let lastEventCountPosted = 0;
let groupsDirty = false;

const SPAWNERS = {
  HUMAN: (x, y) => createHuman(x, y),
  ELF: (x, y) => createElf(x, y),
  DWARF: (x, y) => createDwarf(x, y),
  ORC: (x, y) => createOrc(x, y),
  BOAR: (x, y) => createBoar(x, y),
  DEER: (x, y) => createDeer(x, y),
  SPIDER: (x, y) => createSpider(x, y),
  KNIGHT: (x, y) => createKnight(x, y),
  ARCHER: (x, y) => createArcher(x, y),
  CAT: (x, y) => createCat(x, y),
  BAT: (x, y) => createBat(x, y),
  DRAGON: (x, y) => createDragon(x, y),
  WOLF: (x, y) => createWolf(x, y),
  BEAR: (x, y) => createBear(x, y),
  GOBLIN: (x, y) => createGoblin(x, y),
  SERPENT: (x, y) => createSeaSerpent(x, y),
  SCORPION: (x, y) => createScorpion(x, y),
  LIZARD: (x, y) => createLizard(x, y),
  SHRUB: (x, y) => createAlpineShrub(x, y),
  GOAT: (x, y) => createMountainGoat(x, y),
  CAPYBARA: (x, y) => createCapybara(x, y),
  COW: (x, y) => createCow(x, y),
  CHICKEN: (x, y) => createChicken(x, y),
  DUCK: (x, y) => createDuck(x, y),
  FROG: (x, y) => createFrog(x, y),
  RABBIT: (x, y) => createRabbit(x, y),
  KOBOLD: (x, y) => createKobold(x, y),
  LIZARDFOLK: (x, y) => createLizardfolk(x, y),
  CATFOLK: (x, y) => createCatfolk(x, y),
  CENTAUR: (x, y) => createCentaur(x, y),
  LOG: (x, y) => createWoodItem(x, y),
  STONE: (x, y) => createStoneItem(x, y),
  WALL: (x, y) => createStoneWallEntity(x, y),
  WELL: (x, y) => createWaterWellEntity(x, y),
  "DIRT ROAD": (x, y) => createRoadEntity(x, y, null, false),
  "ROAD SNAP POINT": (x, y) => createRoadEntity(x, y, null, true)
};

function getAllGroups() {
  const groupsMap = new Map();
  if (world && Array.isArray(world.groups)) {
    for (const g of world.groups) {
      if (g && g.id) groupsMap.set(g.id, g);
    }
  }
  for (let i = 0; i < entities.length; i++) {
    const e = entities[i];
    if (e && !e.destroyed && e.properties && e.properties.group && e.properties.group.id) {
      const g = e.properties.group;
      if (!groupsMap.has(g.id)) {
        groupsMap.set(g.id, g);
      }
    }
  }
  return Array.from(groupsMap.values());
}

function spawnRandomGlobal(count, factoryFn, conditionFn = null, bounds = null) {
  let spawned = 0;
  const minX = bounds ? bounds.minX : 2;
  const maxX = bounds ? bounds.maxX : (world?.width || 1024) - 2;
  const minY = bounds ? bounds.minY : 2;
  const maxY = bounds ? bounds.maxY : (world?.height || 1024) - 2;
  const spanX = Math.max(1, maxX - minX);
  const spanY = Math.max(1, maxY - minY);
  const maxAttempts = count * 25;

  for (let attempt = 0; attempt < maxAttempts && spawned < count; attempt++) {
    const rx = minX + Math.floor(Math.random() * spanX);
    const ry = minY + Math.floor(Math.random() * spanY);
    if (!conditionFn || conditionFn(rx, ry)) {
      const e = factoryFn(rx, ry);
      entities.push(e);
      spawned++;
    }
  }
}

function generateConfiguredWorld(config) {
  const genPreset = config.preset !== undefined ? config.preset : 0;
  genWidth = config.width || 256;
  genHeight = config.height || 256;
  genZoneSize = config.zoneSize || 8;
  genSeed = config.seed || (Math.floor(Math.random() * 1000000) + 1);
  const genCreatureDensity = config.creatureDensity || "STANDARD";
  const genPlantDensity = config.plantDensity || "NORMAL";
  const genSpawnPioneers = config.spawnPioneers !== undefined ? config.spawnPioneers : true;
  const genEmbarkCount = config.embarkCount !== undefined ? config.embarkCount : Math.floor(Math.random() * 5) + 3;

  currentPreset = genPreset;
  setZoneSize(genZoneSize);

  if (!world) {
    world = new World(genPreset, genSeed);
  } else {
    world.generate(genPreset, genSeed);
  }
  setActiveWorld(world);

  resetEngineTicks();
  resetWorldEvents();
  world.refresh();
  entities = [];

  const minX = Math.floor((1024 - genWidth) / 2);
  const maxX = minX + genWidth;
  const minY = Math.floor((1024 - genHeight) / 2);
  const maxY = minY + genHeight;

  if (genWidth < 1024 || genHeight < 1024) {
    for (let y = 0; y < 1024; y++) {
      for (let x = 0; x < 1024; x++) {
        if (x < minX || x >= maxX || y < minY || y >= maxY) {
          world.setTile(x, y, 5);
        }
      }
    }
  }

  const areaRatio = (genWidth * genHeight) / (512 * 512);
  const plantMult = (genPlantDensity === "SPARSE" ? 0.4 : genPlantDensity === "DENSE" ? 2.0 : 1.0) * areaRatio;
  const creatureMult = (genCreatureDensity === "NONE" ? 0 : genCreatureDensity === "LOW" ? 0.4 : genCreatureDensity === "HIGH" ? 2.0 : 1.0) * areaRatio;

  const inBounds = (x, y) => x >= minX && x < maxX && y >= minY && y < maxY;
  const spawnBounds = { minX, maxX, minY, maxY };

  const floraCount = (base) => Math.max(1, Math.round(base * plantMult));
  spawnRandomGlobal(floraCount(80), createOakTree, (x, y) => inBounds(x, y) && world.getTile(x, y) === 0, spawnBounds);
  spawnRandomGlobal(floraCount(60), createWillowTree, (x, y) => inBounds(x, y) && (world.getTile(x, y) === 0 || world.getTile(x, y) === 3), spawnBounds);
  spawnRandomGlobal(floraCount(65), createCactus, (x, y) => inBounds(x, y) && world.getTile(x, y) === 3, spawnBounds);
  spawnRandomGlobal(floraCount(50), createAlpineShrub, (x, y) => inBounds(x, y) && (world.getTile(x, y) === 4 || world.getTile(x, y) === 1), spawnBounds);
  spawnRandomGlobal(floraCount(55), createPineTree, (x, y) => inBounds(x, y) && (world.getTile(x, y) === 4 || world.getTile(x, y) === 0), spawnBounds);
  spawnRandomGlobal(floraCount(80), createWaterLily, (x, y) => inBounds(x, y) && world.getTile(x, y) === 2, spawnBounds);
  spawnRandomGlobal(floraCount(100), createSeaweed, (x, y) => inBounds(x, y) && world.getTile(x, y) === 2, spawnBounds);

  spawnRandomGlobal(floraCount(60), (x, y) => createSeedEntity(x, y, "large", "oak"), (x, y) => inBounds(x, y) && world.getTile(x, y) === 0, spawnBounds);
  spawnRandomGlobal(floraCount(40), (x, y) => createSeedEntity(x, y, "small", "willow"), (x, y) => inBounds(x, y) && (world.getTile(x, y) === 0 || world.getTile(x, y) === 3), spawnBounds);
  spawnRandomGlobal(floraCount(30), (x, y) => createFruit(x, y, "large", "cactus"), (x, y) => inBounds(x, y) && world.getTile(x, y) === 3, spawnBounds);
  spawnRandomGlobal(floraCount(40), (x, y) => createFruit(x, y, "large", "oak"), (x, y) => inBounds(x, y) && world.isWalkable(x, y), spawnBounds);
  spawnRandomGlobal(floraCount(50), createWoodItem, (x, y) => inBounds(x, y) && world.getTile(x, y) === 0, spawnBounds);
  spawnRandomGlobal(floraCount(50), createStoneItem, (x, y) => inBounds(x, y) && (world.getTile(x, y) === 4 || world.getTile(x, y) === 1), spawnBounds);

  let centerPlayX = minX + Math.floor(genWidth / 2);
  let centerPlayY = minY + Math.floor(genHeight / 2);
  let startX = centerPlayX;
  let startY = centerPlayY;
  const maxSearchRadius = Math.floor(Math.min(genWidth, genHeight) / 2) - 2;

  for (let r = 0; r < maxSearchRadius; r++) {
    let found = false;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (world.isWalkable(centerPlayX + dx, centerPlayY + dy)) {
          startX = centerPlayX + dx;
          startY = centerPlayY + dy;
          found = true;
          break;
        }
      }
      if (found) break;
    }
    if (found) break;
  }

  const faunaCount = (base) => Math.max(0, Math.round(base * creatureMult));
  spawnRandomGlobal(faunaCount(35), createBoar, (x, y) => inBounds(x, y) && world.isWalkable(x, y), spawnBounds);
  spawnRandomGlobal(faunaCount(40), createDeer, (x, y) => inBounds(x, y) && world.isWalkable(x, y), spawnBounds);
  spawnRandomGlobal(faunaCount(30), createSpider, (x, y) => inBounds(x, y) && world.isWalkable(x, y), spawnBounds);
  spawnRandomGlobal(faunaCount(25), createWolf, (x, y) => inBounds(x, y) && world.isWalkable(x, y), spawnBounds);
  spawnRandomGlobal(faunaCount(18), createBear, (x, y) => inBounds(x, y) && world.isWalkable(x, y), spawnBounds);
  spawnRandomGlobal(faunaCount(25), createCat, (x, y) => inBounds(x, y) && world.isWalkable(x, y), spawnBounds);
  spawnRandomGlobal(faunaCount(30), createBat, (x, y) => inBounds(x, y) && world.isWalkable(x, y), spawnBounds);
  spawnRandomGlobal(faunaCount(20), createMountainGoat, (x, y) => inBounds(x, y) && (world.getTile(x, y) === 4 || world.getTile(x, y) === 1), spawnBounds);
  spawnRandomGlobal(faunaCount(25), createCapybara, (x, y) => inBounds(x, y) && (world.getTile(x, y) === 0 || world.getTile(x, y) === 2), spawnBounds);
  spawnRandomGlobal(faunaCount(30), createCow, (x, y) => inBounds(x, y) && world.getTile(x, y) === 0, spawnBounds);
  spawnRandomGlobal(faunaCount(35), createChicken, (x, y) => inBounds(x, y) && world.getTile(x, y) === 0, spawnBounds);
  spawnRandomGlobal(faunaCount(30), createDuck, (x, y) => inBounds(x, y) && (world.getTile(x, y) === 0 || world.getTile(x, y) === 2), spawnBounds);
  spawnRandomGlobal(faunaCount(35), createFrog, (x, y) => inBounds(x, y) && (world.getTile(x, y) === 0 || world.getTile(x, y) === 2), spawnBounds);
  spawnRandomGlobal(faunaCount(35), createRabbit, (x, y) => inBounds(x, y) && world.isWalkable(x, y), spawnBounds);
  spawnRandomGlobal(faunaCount(20), createScorpion, (x, y) => inBounds(x, y) && world.getTile(x, y) === 3, spawnBounds);
  spawnRandomGlobal(faunaCount(22), createLizard, (x, y) => inBounds(x, y) && (world.getTile(x, y) === 3 || world.getTile(x, y) === 0), spawnBounds);
  spawnRandomGlobal(faunaCount(12), createSeaSerpent, (x, y) => inBounds(x, y) && world.getTile(x, y) === 2, spawnBounds);
  spawnRandomGlobal(faunaCount(5), createDragon, (x, y) => inBounds(x, y) && world.isWalkable(x, y), spawnBounds);

  let firstLeaderId = -1;

  if (genSpawnPioneers) {
    const spawnedEmbarkCenters = [];
    const minDistanceBetweenEmbarks = Math.max(30, Math.min(genWidth, genHeight) * 0.20);

    function findSuitableEmbarkSpot(targetX, targetY, searchRadius = 40) {
      for (let r = 0; r < searchRadius; r += 2) {
        for (let dy = -r; dy <= r; dy += 2) {
          for (let dx = -r; dx <= r; dx += 2) {
            const cx = targetX + dx;
            const cy = targetY + dy;
            if (inBounds(cx, cy) && world.isWalkable(cx, cy)) {
              let tooClose = false;
              for (const [ex, ey] of spawnedEmbarkCenters) {
                if (Math.hypot(cx - ex, cy - ey) < minDistanceBetweenEmbarks) {
                  tooClose = true;
                  break;
                }
              }
              if (!tooClose) return { x: cx, y: cy };
            }
          }
        }
      }
      return null;
    }

    const EMBARK_THEMES = ["diverse", "dwarf", "elf", "orc", "goblin", "lizardfolk", "human", "catfolk", "centaur", "random"];
    const shuffledThemes = [...EMBARK_THEMES].sort(() => Math.random() - 0.5);

    for (let k = 0; k < genEmbarkCount; k++) {
      let embarkSpot = null;
      if (k === 0) {
        embarkSpot = { x: startX, y: startY };
      } else {
        const angle = (k / genEmbarkCount) * Math.PI * 2 + (Math.random() * 0.4 - 0.2);
        const dist = (Math.min(genWidth, genHeight) * 0.25) + Math.random() * (Math.min(genWidth, genHeight) * 0.15);
        const approxX = Math.floor(centerPlayX + Math.cos(angle) * dist);
        const approxY = Math.floor(centerPlayY + Math.sin(angle) * dist);

        embarkSpot = findSuitableEmbarkSpot(approxX, approxY, 60) || findSuitableEmbarkSpot(centerPlayX, centerPlayY, maxSearchRadius);
      }

      if (embarkSpot) {
        spawnedEmbarkCenters.push([embarkSpot.x, embarkSpot.y]);
        const theme = shuffledThemes[k % shuffledThemes.length];
        const res = createEmbarkParty(embarkSpot.x, embarkSpot.y, world, entities, { theme });
        if (k === 0 && res.members.length > 0) {
          firstLeaderId = res.members[0].id;
        }
      }
    }
  }

  rebuildSpatialGrid(entities, getZoneSize());
  lastEventCountPosted = allEvents.length;
  groupsDirty = true;

  postFullWorldState(startX, startY, firstLeaderId);
}

function sanitizeForTransfer(obj, depth = 0) {
  if (depth > 6 || obj === null || obj === undefined) return obj;
  if (typeof obj === "function") return undefined;
  if (typeof obj !== "object") return obj;
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeForTransfer(item, depth + 1)).filter(item => item !== undefined);
  }
  const clean = {};
  for (const k in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, k)) {
      if (k.startsWith("_") && k !== "_rawDescription") continue;
      const val = obj[k];
      if (typeof val === "function") continue;
      if (k === "group" && val && typeof val === "object" && val.id) {
        clean[k] = {
          id: val.id,
          name: val.name,
          color: val.color,
          backcolor: val.backcolor,
          flagSkin: val.flagSkin,
          claimedZones: val.claimedZones ? [...val.claimedZones] : [],
          members: val.members ? [...val.members] : [],
          founderSurname: val.founderSurname || null
        };
      } else {
        const sanitized = sanitizeForTransfer(val, depth + 1);
        if (sanitized !== undefined) {
          clean[k] = sanitized;
        }
      }
    }
  }
  return clean;
}

function getSanitizedProperties(e) {
  if (!e.properties) return {};
  if (!e._sanitizedProps || e._propsVersion !== e._lastSanitizedVersion) {
    e._sanitizedProps = sanitizeForTransfer(e.properties);
    e._lastSanitizedVersion = e._propsVersion || 0;
  }
  if (e.properties.life && e._sanitizedProps.life) {
    e._sanitizedProps.life.energy = e.properties.life.energy;
    e._sanitizedProps.life.isSleeping = !!e.properties.life.isSleeping;
  }
  if (e.properties.brain && e._sanitizedProps.brain) {
    e._sanitizedProps.brain.condition = e.properties.brain.condition;
  }
  if (e.properties.door && e._sanitizedProps.door) {
    e._sanitizedProps.door.isOpen = !!e.properties.door.isOpen;
  }
  if (e.properties.torch && e._sanitizedProps.torch) {
    e._sanitizedProps.torch.isLit = !!e.properties.torch.isLit;
    e._sanitizedProps.torch.fuel = e.properties.torch.fuel;
  }
  if (e.properties.campfire && e._sanitizedProps.campfire) {
    e._sanitizedProps.campfire.isLit = !!e.properties.campfire.isLit;
    e._sanitizedProps.campfire.fuel = e.properties.campfire.fuel;
  }
  return e._sanitizedProps;
}

function serializeEntities() {
  const result = [];
  for (let i = 0; i < entities.length; i++) {
    const ent = entities[i];
    if (!ent) continue;
    result.push({
      id: ent.id,
      x: ent.x,
      y: ent.y,
      birthTick: ent.birthTick,
      deathTick: ent.deathTick,
      destroyed: !!ent.destroyed,
      emote: ent.emote,
      motor: ent.motor,
      combatFlash: ent.combatFlash,
      isConstructed: ent.isConstructed,
      wallStyle: ent.wallStyle,
      properties: getSanitizedProperties(ent)
    });
  }
  return result;
}

function serializeRegistry() {
  const result = [];
  for (const [id, ent] of entityRegistry.entries()) {
    if (!ent) continue;
    result.push({
      id: ent.id,
      x: ent.x,
      y: ent.y,
      birthTick: ent.birthTick,
      deathTick: ent.deathTick,
      destroyed: !!ent.destroyed,
      emote: ent.emote,
      motor: ent.motor,
      combatFlash: ent.combatFlash,
      isConstructed: ent.isConstructed,
      wallStyle: ent.wallStyle,
      properties: sanitizeForTransfer(ent.properties)
    });
  }
  return result;
}

let cachedGroups = null;
function serializeGroups() {
  const groups = getAllGroups();
  return groups.map(g => ({
    id: g.id,
    name: g.name,
    color: g.color,
    backcolor: g.backcolor,
    flagSkin: g.flagSkin,
    claimedZones: g.claimedZones ? [...g.claimedZones] : [],
    members: g.members ? [...g.members] : [],
    founderSurname: g.founderSurname || null,
    leaderId: g.leaderId || null,
    _plannedRoads: g._plannedRoads ? g._plannedRoads.map(r => ({ x: r.x, y: r.y, isSnapPoint: !!r.isSnapPoint, roadType: r.roadType || 0 })) : null,
    _plaza: g._plaza ? { warehouse: { ...g._plaza.warehouse }, campfire: { ...g._plaza.campfire }, well: { ...g._plaza.well } } : null,
    _housePlots: g._housePlots ? { ...g._housePlots } : null
  }));
}

function serializeEvents() {
  return allEvents.map(ev => ({
    id: ev.id,
    opcode: ev.opcode,
    type: ev.type,
    count: ev.count || 1,
    tick: ev.tick,
    timestamp: ev.timestamp || { day: 0, hour: 0, minute: 0 },
    primaryEntityId: ev.primaryEntityId,
    secondaryEntityId: ev.secondaryEntityId,
    location: ev.location ? { x: ev.location.x, y: ev.location.y } : null,
    description: ev.description,
    metadata: sanitizeForTransfer(ev.metadata)
  }));
}

function postFullWorldState(startX = 256, startY = 256, firstLeaderId = -1) {
  self.postMessage({
    type: "WORLD_INIT",
    map: world.map,
    width: world.width,
    height: world.height,
    preset: currentPreset,
    seed: genSeed,
    zoneSize: getZoneSize(),
    clock: {
      day: world.clock.day,
      hour: world.clock.hour,
      minute: world.clock.minute,
      globalLight: world.clock.globalLight,
      totalSeconds: world.clock.totalSeconds
    },
    tick: currentTick,
    entities: serializeEntities(),
    registry: serializeRegistry(),
    groups: serializeGroups(),
    events: serializeEvents(),
    startX,
    startY,
    firstLeaderId
  });
}

let lastSyncTime = 0;

function postSimSync(force = false) {
  const now = performance.now();
  if (!force && now - lastSyncTime < 40) return; // Throttle UI sync messages to max 25 FPS to keep main thread light
  lastSyncTime = now;

  const activeEnts = [];
  for (let i = 0; i < entities.length; i++) {
    const e = entities[i];
    if (!e || e.destroyed) continue;
    activeEnts.push({
      id: e.id,
      x: e.x,
      y: e.y,
      birthTick: e.birthTick,
      destroyed: false,
      emote: e.emote,
      motor: e.motor,
      combatFlash: e.combatFlash,
      isConstructed: e.isConstructed,
      wallStyle: e.wallStyle,
      properties: getSanitizedProperties(e)
    });
  }

  let newEvents = null;
  if (allEvents.length > lastEventCountPosted) {
    newEvents = serializeEvents().slice(lastEventCountPosted);
    lastEventCountPosted = allEvents.length;
  }

  self.postMessage({
    type: "SIM_UPDATE",
    clock: {
      day: world.clock.day,
      hour: world.clock.hour,
      minute: world.clock.minute,
      globalLight: world.clock.globalLight,
      totalSeconds: world.clock.totalSeconds
    },
    tick: currentTick,
    entities: activeEnts,
    groups: serializeGroups(),
    events: newEvents
  });
}

function applyTileBrush(cx, cy, tileType, brushSize) {
  if (!world) return;
  const half = Math.floor(brushSize / 2);
  const modifiedTiles = [];
  for (let dy = -half; dy <= half; dy++) {
    for (let dx = -half; dx <= half; dx++) {
      const tx = cx + dx;
      const ty = cy + dy;
      if (tx >= 0 && tx < (world.width || 512) && ty >= 0 && ty < (world.height || 512)) {
        world.setTile(tx, ty, tileType);
        modifiedTiles.push({ x: tx, y: ty, tile: tileType });
      }
    }
  }
  self.postMessage({
    type: "TILES_UPDATED",
    tiles: modifiedTiles
  });
}

function applyEditorAction(data) {
  const { tool, tileX, tileY, selectedTile, brushSize, spawnerLabel } = data;
  if (!world || tileX < 0 || tileX >= (world.width || 512) || tileY < 0 || tileY >= (world.height || 512)) return;

  if (tool === "PAINT") {
    applyTileBrush(tileX, tileY, selectedTile, brushSize || 1);
  } else if (tool === "SPAWN" && spawnerLabel) {
    const fn = SPAWNERS[spawnerLabel];
    if (fn) {
      const ent = fn(tileX, tileY);
      if (ent) {
        const allActiveClans = getAllGroups();
        const targetClan = allActiveClans.find(g => isTileInClaimedZones(tileX, tileY, g.claimedZones));
        if (targetClan) {
          ent.properties.group = targetClan;
          if (!ent.properties.group_member) {
            ent.properties.group_member = createGroupMemberProp();
          }
          if (!targetClan.members) targetClan.members = [];
          if (!targetClan.members.includes(ent.id)) targetClan.members.push(ent.id);

          if (ent.properties.brain) {
            if (!ent.properties.brain.affinities) ent.properties.brain.affinities = {};
            for (const mid of targetClan.members) {
              if (mid !== ent.id) {
                ent.properties.brain.affinities[mid] = 40;
                const peerEnt = getEntityById(mid);
                const peer = (peerEnt && !peerEnt.destroyed) ? peerEnt : null;
                if (peer && peer.properties?.brain) {
                  if (!peer.properties.brain.affinities) peer.properties.brain.affinities = {};
                  peer.properties.brain.affinities[ent.id] = 40;
                }
              }
            }
          }

          if (targetClan.founderSurname && ent.properties.surname) {
            ent.properties.surname = targetClan.founderSurname;
          }

          recordWorldEvent({
            opcode: OP_RELATION,
            type: "RELATION",
            primaryEntityId: ent.id,
            location: { x: tileX, y: tileY },
            description: `${ent.properties.name} joined the '${targetClan.name}' faction in their territory!`,
            tick: currentTick,
            timestamp: world?.clock ? { day: world.clock.day, hour: world.clock.hour, minute: world.clock.minute } : null,
            metadata: { clan: targetClan.name }
          });
        }
        entities.push(ent);
        rebuildSpatialGrid(entities, getZoneSize());
        groupsDirty = true;
      }
    }
  } else if (tool === "BULLDOZER") {
    const tileBucket = tileEntityMap.get(`${tileX}_${tileY}`);
    const targets = tileBucket ? Array.from(tileBucket).filter(e => !e.destroyed) : [];
    for (const t of targets) {
      destroyEntity(t, entities);
    }
    rebuildSpatialGrid(entities, getZoneSize());
  }
  postSimSync(true);
}

function loadWorldSave(saveData) {
  if (!saveData) return;
  try {
    entities = [];
    entityRegistry.clear();

    if (saveData.world?.terrain && world) {
      const binaryStr = atob(saveData.world.terrain);
      const mapW = world.width || 1024;
      for (let i = 0; i < binaryStr.length; i++) {
        const tileVal = binaryStr.charCodeAt(i);
        const x = i % mapW;
        const y = Math.floor(i / mapW);
        world.setTile(x, y, tileVal);
      }
    }

    if (saveData.world?.zoneSize) {
      setZoneSize(saveData.world.zoneSize);
      genZoneSize = getZoneSize();
    }
    if (saveData.world?.width && saveData.world?.height && world) {
      genWidth = saveData.world.width;
      genHeight = saveData.world.height;
      world.width = genWidth;
      world.height = genHeight;
    }

    if (saveData.world?.clock && world) {
      world.clock.day = saveData.world.clock.day || 0;
      world.clock.hour = saveData.world.clock.hour || 0;
      world.clock.minute = saveData.world.clock.minute || 0;
      world.clock.globalLight = saveData.world.clock.globalLight !== undefined ? saveData.world.clock.globalLight : 1.0;
      world.clock.totalSeconds = saveData.world.clock.totalSeconds || 0;
    }

    if (saveData.world?.tick !== undefined) {
      resetEngineTicks();
      for (let i = 0; i < saveData.world.tick; i++) {
        incrementEngineTick();
      }
    }

    if (world) world.groups = saveData.groups || [];

    if (Array.isArray(saveData.entities)) {
      for (const entData of saveData.entities) {
        if (!entData) continue;
        const ent = {
          id: entData.id,
          x: entData.x,
          y: entData.y,
          birthTick: entData.birthTick,
          deathTick: entData.deathTick,
          destroyed: entData.destroyed,
          renderable: entData.renderable,
          properties: entData.properties || {}
        };
        rebindEntityMethods(ent);
        entities.push(ent);
        entityRegistry.set(ent.id, ent);
      }
    }

    if (Array.isArray(saveData.registry)) {
      for (const regData of saveData.registry) {
        if (!regData || entityRegistry.has(regData.id)) continue;
        const ent = {
          id: regData.id,
          x: regData.x,
          y: regData.y,
          birthTick: regData.birthTick,
          deathTick: regData.deathTick,
          destroyed: true,
          renderable: regData.renderable,
          properties: regData.properties || {}
        };
        entityRegistry.set(ent.id, ent);
      }
    }

    if (Array.isArray(saveData.events)) {
      restoreWorldEvents(saveData.events);
    }

    currentPreset = saveData.world?.preset || 0;
    genSeed = saveData.world?.seed || 12345;
    rebuildSpatialGrid(entities, getZoneSize());
    lastEventCountPosted = allEvents.length;
    groupsDirty = true;

    const camX = saveData.camera?.x || 256;
    const camY = saveData.camera?.y || 256;
    postFullWorldState(camX, camY, -1);
  } catch (err) {
    console.error("Worker failed to load save:", err);
  }
}

let lastTickTime = performance.now();

function simulationLoop() {
  const now = performance.now();
  const realDt = Math.min((now - lastTickTime) * 0.001, 0.1);
  lastTickTime = now;

  if (!isPaused && world) {
    if (typeof simSpeed === "number" && simSpeed > 1.0) {
      const subTicks = Math.min(Math.round(simSpeed), 4);
      const subDt = (realDt * simSpeed) / subTicks;
      for (let s = 0; s < subTicks; s++) {
        world.clock.tick(subDt);
        incrementEngineTick();
        tickEntities(entities, subDt, world);
      }
    } else {
      const speedVal = typeof simSpeed === "number" ? simSpeed : 1.0;
      const effectiveDt = realDt * speedVal;
      world.clock.tick(effectiveDt);
      incrementEngineTick();
      tickEntities(entities, effectiveDt, world);
    }

    postSimSync(false);
  }
}

setInterval(simulationLoop, 33);

self.onmessage = (e) => {
  const data = e.data;
  if (!data || !data.type) return;

  switch (data.type) {
    case "INIT_WORLD":
    case "GENERATE_WORLD":
      generateConfiguredWorld(data);
      break;

    case "SET_PAUSED":
      isPaused = !!data.isPaused;
      break;

    case "SET_SPEED":
      if (typeof data.simSpeed === "number") {
        simSpeed = data.simSpeed;
      }
      break;

    case "APPLY_EDITOR_ACTION":
      applyEditorAction(data);
      break;

    case "KILL_ENTITY": {
      const target = getEntityById(data.entityId);
      if (target) {
        explodeEntityOnDeath(target, entities, world);
        destroyEntity(target, entities);
        postSimSync(true);
      }
      break;
    }

    case "SPAWN_ENTITY": {
      const fn = SPAWNERS[data.spawnerLabel];
      if (fn) {
        const ent = fn(data.x, data.y);
        if (ent) {
          entities.push(ent);
          rebuildSpatialGrid(entities, getZoneSize());
          postSimSync(true);
        }
      }
      break;
    }

    case "SAVE_WORLD": {
      const customWorld = {
        width: genWidth,
        height: genHeight,
        zoneSize: getZoneSize(),
        map: world.map,
        clock: world.clock
      };
      const saveData = exportWorldSaveJSON(
        customWorld,
        entities,
        currentTick,
        entityRegistry,
        getAllGroups(),
        data.camera,
        genSeed,
        currentPreset
      );
      self.postMessage({ type: "SAVE_DATA_READY", saveData });
      break;
    }

    case "LOAD_WORLD":
      loadWorldSave(data.saveData);
      break;
  }
};
