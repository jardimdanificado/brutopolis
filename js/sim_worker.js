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
  createCreatureFromArchetype,
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
  createHouseEntity,
  createWallEntity,
  createTorchEntity,
  createCampfireEntity,
  createStoneWallEntity,
  createWaterWellEntity,
  createWarehouseEntity,
  createSlaughterhouseEntity,
  createKitchenEntity,
  createBasketItem,
  createBackpackItem,
  createMeatBento,
  createVeganBento,
  createGourmetBento,
  createRoastedMeat,
  createGrilledVeggies,
  createRoadEntity,
  createEmbarkParty,
  rebindEntityMethods,
  getZoneSize,
  setZoneSize,
  getGroupStockpile,
  setActiveWorld,
  isTileInClaimedZones,
  createGroupMemberProp,
  generateWorldRoadNetwork,
  isRoadTile
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
let lastSyncedEventTick = 0;
let groupsDirty = false;
let isTitleWorld = false;

const SPAWNERS = {
  HUMAN: (x, y) => createHuman(x, y),
  HAULER: (x, y) => {
    const c = createCreatureFromArchetype("human", x, y, { role: "Hauler" });
    c.properties.backpack = { type: "backpack", size: "large", capacity: 20, items: [] };
    c.properties.arm_left = c.properties.arm_left || createArmProp("left", 1.0, 100, 100);
    c.properties.arm_left.heldItem = {
      name: "Transport Basket",
      resourceType: "basket",
      skin: "Item_Bag.png",
      container: { type: "basket", capacity: 10, items: [] },
      weight: 1.0
    };
    return c;
  },
  BUTCHER: (x, y) => createCreatureFromArchetype("human", x, y, { role: "Butcher" }),
  COOK: (x, y) => createCreatureFromArchetype("human", x, y, { role: "Cook" }),
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
  WAREHOUSE: (x, y) => createWarehouseEntity(x, y),
  SLAUGHTERHOUSE: (x, y) => createSlaughterhouseEntity(x, y),
  KITCHEN: (x, y) => createKitchenEntity(x, y),
  "BASKET (MED)": (x, y) => createBasketItem(x, y, "medium"),
  "BASKET (LRG)": (x, y) => createBasketItem(x, y, "large"),
  BACKPACK: (x, y) => createBackpackItem(x, y, "medium"),
  "EXPEDITION PACK": (x, y) => createBackpackItem(x, y, "large"),
  "MEAT BENTO": (x, y) => createMeatBento(x, y),
  "VEGAN BENTO": (x, y) => createVeganBento(x, y),
  "GOURMET BENTO": (x, y) => createGourmetBento(x, y),
  "ROASTED MEAT": (x, y) => createRoastedMeat(x, y),
  "GRILLED VEGGIES": (x, y) => createGrilledVeggies(x, y),
  "DIRT ROAD": (x, y) => createRoadEntity(x, y, null, false),
  "ROAD SNAP POINT": (x, y) => createRoadEntity(x, y, null, true)
};

let cachedGroupsList = null;
function getAllGroups() {
  if (!groupsDirty && cachedGroupsList) return cachedGroupsList;
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
  cachedGroupsList = Array.from(groupsMap.values());
  groupsDirty = false;
  return cachedGroupsList;
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

  pendingModifiedTiles = [];
  world.onTileChange = (x, y, tile) => {
    pendingModifiedTiles.push({ x, y, tile });
  };

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

  const genSpawnRoads = config.spawnRoads !== undefined ? config.spawnRoads : (!config.isTitleScreen);
  const isTitleScreen = !!config.isTitleScreen;
  isTitleWorld = isTitleScreen;

  if (isTitleScreen && world?.clock) {
    // Pick one of four atmospheric moments at random
    const modes = [
      { hour: 5,  minute: 50 },  // Dawn
      { hour: 12, minute: 0  },  // Noon
      { hour: 18, minute: 10 },  // Dusk
      { hour: 0,  minute: 0  },  // Midnight
    ];
    const picked = modes[Math.floor(Math.random() * modes.length)];
    world.clock.hour = picked.hour;
    world.clock.minute = picked.minute;
    world.clock.globalLight = picked.hour === 12 ? 1.0 : picked.hour === 0 ? 0.05 : 0.45;
  }

  const areaRatio = (genWidth * genHeight) / (512 * 512);
  const plantMult = (isTitleScreen ? 0.6 : (genPlantDensity === "SPARSE" ? 0.4 : genPlantDensity === "DENSE" ? 2.0 : 1.0)) * areaRatio;
  const creatureMult = (isTitleScreen || genCreatureDensity === "NONE") ? 0 : ((genCreatureDensity === "LOW" ? 0.4 : genCreatureDensity === "HIGH" ? 2.0 : 1.0) * areaRatio);

  const inBounds = (x, y) => x >= minX && x < maxX && y >= minY && y < maxY;
  const spawnBounds = { minX, maxX, minY, maxY };

  // 1. Procedural Global Continental Road Network (Inter-regional highways generated on dry land at world inception)
  if (genSpawnRoads) {
    generateWorldRoadNetwork(world, minX, maxX, minY, maxY, genZoneSize, genSeed, entities);
  }

  const floraCount = (base) => Math.max(1, Math.round(base * plantMult));
  spawnRandomGlobal(floraCount(95), createOakTree, (x, y) => inBounds(x, y) && world.getTile(x, y) === 0 && !isRoadTile(x, y), spawnBounds);
  spawnRandomGlobal(floraCount(75), createWillowTree, (x, y) => inBounds(x, y) && (world.getTile(x, y) === 0 || world.getTile(x, y) === 3) && !isRoadTile(x, y), spawnBounds);
  spawnRandomGlobal(floraCount(70), createCactus, (x, y) => inBounds(x, y) && world.getTile(x, y) === 3 && !isRoadTile(x, y), spawnBounds);
  spawnRandomGlobal(floraCount(60), createAlpineShrub, (x, y) => inBounds(x, y) && (world.getTile(x, y) === 4 || world.getTile(x, y) === 1) && !isRoadTile(x, y), spawnBounds);
  spawnRandomGlobal(floraCount(65), createPineTree, (x, y) => inBounds(x, y) && (world.getTile(x, y) === 4 || world.getTile(x, y) === 0) && !isRoadTile(x, y), spawnBounds);
  spawnRandomGlobal(floraCount(90), createWaterLily, (x, y) => inBounds(x, y) && world.getTile(x, y) === 2, spawnBounds);
  spawnRandomGlobal(floraCount(110), createSeaweed, (x, y) => inBounds(x, y) && world.getTile(x, y) === 2, spawnBounds);

  if (!isTitleScreen) {
    spawnRandomGlobal(floraCount(10), (x, y) => createSeedEntity(x, y, "large", "oak"), (x, y) => inBounds(x, y) && world.getTile(x, y) === 0 && !isRoadTile(x, y), spawnBounds);
    spawnRandomGlobal(floraCount(10), (x, y) => createFruit(x, y, "large", "oak"), (x, y) => inBounds(x, y) && world.isWalkable(x, y) && !isRoadTile(x, y), spawnBounds);
    spawnRandomGlobal(floraCount(12), createWoodItem, (x, y) => inBounds(x, y) && world.getTile(x, y) === 0 && !isRoadTile(x, y), spawnBounds);
    spawnRandomGlobal(floraCount(12), createStoneItem, (x, y) => inBounds(x, y) && (world.getTile(x, y) === 4 || world.getTile(x, y) === 1) && !isRoadTile(x, y), spawnBounds);
  }

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

  // 2. Spawn Clan Embark Parties directly along the continental road network
  if (genSpawnPioneers && !isTitleScreen) {
    const spawnedEmbarkCenters = [];
    const minDistanceBetweenEmbarks = Math.max(30, Math.min(genWidth, genHeight) * 0.20);
    // Collect all generated road network tiles
    const allRoadTiles = [];
    for (let y = minY; y < maxY; y++) {
      for (let x = minX; x < maxX; x++) {
        const t = world.getTile(x, y);
        if (t >= 6 && t <= 9) {
          allRoadTiles.push({ x, y, t });
        }
      }
    }

    function findSuitableEmbarkSpot(targetX, targetY) {
      if (allRoadTiles.length === 0) {
        world.setTile(targetX, targetY, 6); // TILE_ROAD_GRASS
        allRoadTiles.push({ x: targetX, y: targetY, t: 6 });
        return { x: targetX, y: targetY };
      }

      // Sort road tiles by distance to target sector
      const candidates = allRoadTiles
        .map(r => ({ x: r.x, y: r.y, dist: Math.hypot(r.x - targetX, r.y - targetY) }))
        .sort((a, b) => a.dist - b.dist);

      for (const cand of candidates) {
        let tooClose = false;
        for (const [ex, ey] of spawnedEmbarkCenters) {
          if (Math.hypot(cand.x - ex, cand.y - ey) < minDistanceBetweenEmbarks) {
            tooClose = true;
            break;
          }
        }
        if (!tooClose) {
          return { x: cand.x, y: cand.y };
        }
      }

      return candidates[0];
    }

    const EMBARK_THEMES = ["diverse", "dwarf", "elf", "orc", "goblin", "lizardfolk", "human", "catfolk", "centaur", "random"];
    const shuffledThemes = [...EMBARK_THEMES].sort(() => Math.random() - 0.5);

    for (let k = 0; k < genEmbarkCount; k++) {
      let embarkSpot = null;
      if (k === 0) {
        embarkSpot = findSuitableEmbarkSpot(centerPlayX, centerPlayY);
      } else {
        const angle = (k / genEmbarkCount) * Math.PI * 2 + (Math.random() * 0.4 - 0.2);
        const dist = (Math.min(genWidth, genHeight) * 0.28) + Math.random() * (Math.min(genWidth, genHeight) * 0.15);
        const approxX = Math.floor(centerPlayX + Math.cos(angle) * dist);
        const approxY = Math.floor(centerPlayY + Math.sin(angle) * dist);

        embarkSpot = findSuitableEmbarkSpot(approxX, approxY);
      }

      if (embarkSpot) {
        spawnedEmbarkCenters.push([embarkSpot.x, embarkSpot.y]);
        if (k === 0) {
          startX = embarkSpot.x;
          startY = embarkSpot.y;
        }
        const theme = shuffledThemes[k % shuffledThemes.length];
        const res = createEmbarkParty(embarkSpot.x, embarkSpot.y, world, entities, { theme });
        if (k === 0 && res.members.length > 0) {
          firstLeaderId = res.members[0].id;
        }
      }
    }
  }

  if (isTitleScreen) {
    spawnGhostTownRuins(world, minX, maxX, minY, maxY, startX, startY, entities);
  }

  rebuildSpatialGrid(entities, getZoneSize());
  lastSyncedEventTick = currentTick;
  groupsDirty = true;

  postFullWorldState(startX, startY, firstLeaderId, isTitleScreen);
}

function spawnGhostTownRuins(world, minX, maxX, minY, maxY, centerX, centerY, entities) {
  const numClusters = 2 + Math.floor(Math.random() * 2);
  const clusterCenters = [{ cx: centerX, cy: centerY }];

  for (let i = 1; i < numClusters; i++) {
    const angle = (i / numClusters) * Math.PI * 2 + (Math.random() - 0.5) * 0.6;
    const dist = 16 + Math.floor(Math.random() * 20);
    const cx = Math.max(minX + 8, Math.min(maxX - 8, centerX + Math.round(Math.cos(angle) * dist)));
    const cy = Math.max(minY + 8, Math.min(maxY - 8, centerY + Math.round(Math.sin(angle) * dist)));
    if (world.isWalkable(cx, cy)) {
      clusterCenters.push({ cx, cy });
    }
  }

  for (const { cx, cy } of clusterCenters) {
    // 1. Central Ancient Hearth (extinguished stone campfire)
    const hearth = createCampfireEntity(cx, cy);
    if (hearth) {
      hearth.isConstructed = true;
      hearth.woodCurrent = hearth.woodCost || 3;
      if (hearth.properties?.campfire) {
        hearth.properties.campfire.isLit = false;
        hearth.properties.campfire.fuel = 0;
      }
      entities.push(hearth);
    }

    // 2. Abandoned Water Well
    const wellOffsets = [{ dx: 2, dy: 1 }, { dx: -2, dy: 1 }, { dx: 1, dy: -2 }, { dx: -1, dy: -2 }];
    const wellOff = wellOffsets[Math.floor(Math.random() * wellOffsets.length)];
    const wx = cx + wellOff.dx;
    const wy = cy + wellOff.dy;
    if (world.isWalkable(wx, wy)) {
      const well = createWaterWellEntity(wx, wy, { name: "Ancient Ruins" });
      if (well) {
        if (well.properties?.well) {
          well.properties.well.isCompleted = true;
          well.properties.well.woodCurrent = well.properties.well.woodCost;
          well.properties.well.stoneCurrent = well.properties.well.stoneCost;
        }
        entities.push(well);
      }
    }

    // 3. Old Warehouse / Granary Ruin
    const whOffsets = [{ dx: -3, dy: -2 }, { dx: 3, dy: -2 }, { dx: -2, dy: 3 }, { dx: 2, dy: 3 }];
    const whOff = whOffsets[Math.floor(Math.random() * whOffsets.length)];
    const whx = cx + whOff.dx;
    const why = cy + whOff.dy;
    if (world.isWalkable(whx, why)) {
      const wh = createWarehouseEntity(whx, why, { name: "Ancient Ruins" }, Math.floor(Math.random() * 2));
      if (wh) {
        if (wh.properties?.warehouse) {
          wh.properties.warehouse.isCompleted = true;
          wh.properties.warehouse.woodCurrent = wh.properties.warehouse.woodCost;
          wh.properties.warehouse.stoneCurrent = wh.properties.warehouse.stoneCost;
        }
        entities.push(wh);
      }
    }

    // 4. Abandoned Houses & Cottages (4 to 7 per cluster)
    const houseCount = 4 + Math.floor(Math.random() * 4);
    const housePositions = [
      { dx: -3, dy: 0 }, { dx: 3, dy: 0 }, { dx: 0, dy: -3 }, { dx: 0, dy: 3 },
      { dx: -4, dy: -3 }, { dx: 4, dy: -3 }, { dx: -3, dy: 4 }, { dx: 4, dy: 3 },
      { dx: -5, dy: 1 }, { dx: 5, dy: -1 }, { dx: 1, dy: 5 }, { dx: -2, dy: -5 }
    ];

    let spawnedHouses = 0;
    for (const hPos of housePositions) {
      if (spawnedHouses >= houseCount) break;
      const hx = cx + hPos.dx;
      const hy = cy + hPos.dy;
      if (hx >= minX && hx < maxX && hy >= minY && hy < maxY && world.isWalkable(hx, hy)) {
        const hasEnt = entities.some(e => !e.destroyed && e.x === hx && e.y === hy);
        if (!hasEnt) {
          const variantIdx = Math.floor(Math.random() * 10);
          const house = createHouseEntity(hx, hy, "mixed", null, "Ancient Ones", "wood", variantIdx);
          if (house) {
            if (house.properties?.house) {
              house.properties.house.isCompleted = true;
              house.properties.house.woodCurrent = house.properties.house.woodCost;
              house.properties.house.stoneCurrent = house.properties.house.stoneCost;
              house.properties.house.boneCurrent = house.properties.house.boneCost;
            }
            entities.push(house);
            spawnedHouses++;
          }
        }
      }
    }

    // 5. Ruined Stone Perimeter Wall Sections
    const wallRadius = 5;
    for (let angle = 0; angle < Math.PI * 2; angle += 0.4) {
      if (Math.random() > 0.45) {
        const wx = Math.round(cx + Math.cos(angle) * wallRadius);
        const wy = Math.round(cy + Math.sin(angle) * wallRadius);
        if (wx >= minX && wx < maxX && wy >= minY && wy < maxY && world.isWalkable(wx, wy)) {
          const hasEnt = entities.some(e => !e.destroyed && e.x === wx && e.y === wy);
          if (!hasEnt) {
            const wall = createWallEntity(wx, wy, "Forgotten Realm", "stone");
            if (wall) {
              wall.isConstructed = true;
              wall.stoneCurrent = wall.stoneCost || 2;
              entities.push(wall);
            }
          }
        }
      }
    }

    // 6. Ancient Overgrown Cobblestone / Dirt Trails connecting ruins
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        if ((Math.abs(dx) <= 1 || Math.abs(dy) <= 1) && Math.random() < 0.65) {
          const tx = cx + dx;
          const ty = cy + dy;
          if (tx >= minX && tx < maxX && ty >= minY && ty < maxY) {
            const curTile = world.getTile(tx, ty);
            if (curTile === 0 || curTile === 3 || curTile === 4) {
              world.setTile(tx, ty, (curTile === 3) ? 7 : (curTile === 4 ? 8 : 6));
            }
          }
        }
      }
    }

    // 7. Atmospheric Village Standing Torches (3 to 5 torches illuminating ruins and pathways)
    const torchOffsets = [
      { dx: -2, dy: -2 }, { dx: 2, dy: -2 }, { dx: -2, dy: 2 }, { dx: 2, dy: 2 },
      { dx: 0, dy: -4 }, { dx: 0, dy: 4 }, { dx: -4, dy: 0 }, { dx: 4, dy: 0 }
    ];
    let spawnedTorches = 0;
    for (const tOff of torchOffsets) {
      if (spawnedTorches >= 4) break;
      if (Math.random() < 0.75) {
        const tox = cx + tOff.dx;
        const toy = cy + tOff.dy;
        if (tox >= minX && tox < maxX && toy >= minY && toy < maxY && world.isWalkable(tox, toy)) {
          const hasEnt = entities.some(e => !e.destroyed && e.x === tox && e.y === toy);
          if (!hasEnt) {
            const torch = createTorchEntity(tox, toy, null);
            if (torch) {
              if (torch.properties?.torch) {
                torch.properties.torch.isLit = true;
                torch.properties.torch.fuel = 9999;
              }
              entities.push(torch);
              spawnedTorches++;
            }
          }
        }
      }
    }
  }
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
  return sanitizeForTransfer(e.properties);
}

function serializeEntities() {
  const result = [];
  for (let i = 0; i < entities.length; i++) {
    const ent = entities[i];
    if (!ent) continue;
    let s = ent._serializedEntry;
    if (!s) {
      s = {
        id: ent.id,
        x: ent.x,
        y: ent.y,
        birthTick: ent.birthTick,
        deathTick: ent.deathTick,
        destroyed: false,
        emote: ent.emote,
        motor: ent.motor,
        combatFlash: ent.combatFlash,
        isConstructed: ent.isConstructed,
        wallStyle: ent.wallStyle,
        properties: null
      };
      ent._serializedEntry = s;
    }
    s.x = ent.x;
    s.y = ent.y;
    s.birthTick = ent.birthTick;
    s.deathTick = ent.deathTick;
    s.destroyed = !!ent.destroyed;
    s.emote = ent.emote;
    s.motor = ent.motor;
    s.combatFlash = ent.combatFlash;
    s.isConstructed = ent.isConstructed;
    s.wallStyle = ent.wallStyle;
    s.properties = getSanitizedProperties(ent);
    result.push(s);
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

let lastGroupSerializeTime = 0;
let cachedSerializedGroups = null;
function serializeGroups() {
  const now = performance.now();
  if (cachedSerializedGroups && now - lastGroupSerializeTime < 300) {
    return cachedSerializedGroups;
  }
  lastGroupSerializeTime = now;
  const groups = getAllGroups();
  cachedSerializedGroups = groups.map(g => ({
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
  return cachedSerializedGroups;
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

function postFullWorldState(startX = 256, startY = 256, firstLeaderId = -1, isTitleScreen = false) {
  // Transfer a cloned buffer or transfer list to make postMessage instant without blocking main-thread JSON clone
  const mapCopy = new Uint8Array(world.map);
  self.postMessage({
    type: "WORLD_INIT",
    map: mapCopy.buffer,
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
    firstLeaderId,
    isTitleScreen
  }, [mapCopy.buffer]);
}

let pendingModifiedTiles = [];
let lastSyncTime = 0;

let lastPropsSyncTime = 0;
function postSimSync(force = false) {
  const now = performance.now();
  if (!force && now - lastSyncTime < 40) return; // Throttle UI sync messages to max 25 FPS to keep main thread light
  lastSyncTime = now;

  const syncProps = force || (now - lastPropsSyncTime > 1000);
  if (syncProps) {
    lastPropsSyncTime = now;
  }

  // Real-time incremental tile updates (e.g. roads built by creatures or terraforming)
  if (pendingModifiedTiles.length > 0) {
    self.postMessage({
      type: "TILES_UPDATED",
      tiles: pendingModifiedTiles
    });
    pendingModifiedTiles = [];
  }

  const activeEnts = globalThis.cachedActiveEnts = globalThis.cachedActiveEnts || [];
  let entCount = 0;
  
  for (let i = 0; i < entities.length; i++) {
    const e = entities[i];
    if (!e || e.destroyed) continue;
    
    const needsPropSync = syncProps || !e._hasSyncedProps;
    if (needsPropSync) {
      e._hasSyncedProps = true;
    }

    if (entCount >= activeEnts.length) {
      activeEnts.push({});
    }
    const out = activeEnts[entCount++];
    out.id = e.id;
    out.x = e.x;
    out.y = e.y;
    out.birthTick = e.birthTick;
    out.destroyed = false;
    out.emote = e.emote;
    out.motor = e.motor;
    out.combatFlash = e.combatFlash;
    out.isConstructed = e.isConstructed;
    out.wallStyle = e.wallStyle;
    out.properties = needsPropSync ? getSanitizedProperties(e) : undefined;
  }
  
  // We cannot pass a sliced view directly if we want to avoid allocating a new array, 
  // but slice() creates a shallow array copy which is extremely fast compared to 5000 new objects.
  const entsToSync = activeEnts.slice(0, entCount);

  let newEvents = null;
  const unposted = allEvents.filter(ev => ev.tick >= lastSyncedEventTick);
  if (unposted.length > 0) {
    newEvents = unposted.map(ev => ({
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
    lastSyncedEventTick = currentTick;
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
    entities: entsToSync,
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
        
        // Reconnect real group reference
        if (ent.properties.group && ent.properties.group.id && world && world.groups) {
          const realGroup = world.groups.find(g => g.id === ent.properties.group.id);
          if (realGroup) {
            ent.properties.group = realGroup;
          }
        }
        
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
    lastSyncedEventTick = currentTick;
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
    const speedVal = typeof simSpeed === "number" ? Math.max(0.25, simSpeed) : 1.0;

    if (speedVal > 4.0) {
      // --- PREDICTIVE MACRO-SIMULATION (Speeds > 4x: e.g. 8x, 16x, 32x) ---
      // Instead of running 32 distinct sub-tick loops (which crushes weak CPUs),
      // we execute a single predictive macro-pass with aggregated delta-time.
      const effectiveDt = realDt * speedVal;
      world.groups = getAllGroups();

      // Fast-forward world clock in a single analytical step
      const clockDt = isTitleWorld ? effectiveDt * 8.0 : effectiveDt;
      world.clock.tick(clockDt);

      // Increment tick counter proportionally without spinning iterations
      const virtualTicks = Math.max(1, Math.round(speedVal));
      for (let i = 0; i < virtualTicks; i++) {
        incrementEngineTick();
      }

      // Single-pass predictive physics, metabolism & behavior step
      tickEntities(entities, effectiveDt, world);
    } else if (speedVal > 1.0) {
      // Precise micro-ticks for low fast-forward (2x to 4x)
      const subTicks = Math.round(speedVal);
      const subDt = (realDt * speedVal) / subTicks;
      for (let s = 0; s < subTicks; s++) {
        world.groups = getAllGroups();
        world.clock.tick(subDt);
        incrementEngineTick();
        tickEntities(entities, subDt, world);
      }
    } else {
      // Standard 1x speed
      world.groups = getAllGroups();
      const clockDt = isTitleWorld ? realDt * 8.0 : realDt;
      world.clock.tick(clockDt);
      incrementEngineTick();
      tickEntities(entities, realDt, world);
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
