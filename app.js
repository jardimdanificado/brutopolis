// =============================================================================
// Brutopolis
// =============================================================================

const BrutopolisVersion = "0.119.2";
const BrutopolisVersionName = "Honour all men. Love the brotherhood. Fear God. Honour the king.";

// WASM replaced by Pure JS Renderer
import { World } from "./js/world.js";
import { Renderer, findTexture } from "./js/renderer.js";
import { RCT3DRenderer } from "./js/renderer_rct.js";
import { audio } from "./js/audio_fmod.js";
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
  setEngineTick,
  rebuildSpatialGrid,
  registerEntitySpatial,
  updateEntitySpatial,
  unregisterEntitySpatial,
  getEntityAtTile,
  getEntitiesInRadius,
  getEntitiesInViewport,
  tileEntityMap
} from "./js/engine.js";
import {
  resetWorldEvents,
  getEventsForEntity,
  getEventsForGroup,
  getRecentWorldEvents,
  getEventById,
  getCitationsForEvent,
  getClusteredBattles,
  getBattleById,
  getRelationshipSummary,
  getFullHistoryForEntity,
  getFullHistoryForGroup,
  restoreWorldEvents,
  appendWorldEvents,
  recordWorldEvent,
  setEventLogConfig,
  eventLogConfig,
  OP_RELATION,
  allEvents,
  eventsById
} from "./js/event_log.js";
import {
  createLifeProp,
  createTerrestrialProp,
  createAquaticProp,
  createFlyingProp,
  createStomachProp,
  createBladderProp,
  createKidneyProp,
  createBrainProp,
  createWingsProp,
  createPawProp,
  createDeepRootProp,
  createSurfaceRootProp,
  createTerrainPreferenceProp,
  createParasitesProp,
  createBodyRegenerationProp,
  createCombatProp,
  createBurnProp,
  createViolentProp,
  createPacifistProp,
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
  createMouthProp,
  createCommunicationProp,
  createCrafterProp,
  createMinerProp,
  createBuilderProp,
  createGroup,
  createGroupMemberProp,
  isTileInClaimedZones,
  createBruiseProp,
  createConcussionProp,
  createScarProp,
  createOakTree,
  createWillowTree,
  createPineTree,
  createCactus,
  createWaterLily,
  createSeaweed,
  createFruit,
  createSeedEntity,
  createHumanMiner,
  createHumanBuilder,
  createHumanCrafter,
  createHumanFarmer,
  createHumanMatriarch,
  createHumanHunter,
  createHumanExplorer,
  createStoneWallEntity,
  createWaterWellEntity,
  createRoadEntity,
  createFarmerProp,
  createScatologicalProp,
  createEmbarkParty,
  rebindEntityMethods,
  currentZoneSize,
  getZoneSize,
  setZoneSize,
  getMoodLabel,
  getGroupStockpile,
  setActiveWorld
} from "./js/properties.js";

// Initialize Web Worker for Background Simulation Thread
let simWorker = null;

function initSimWorker() {
  if (simWorker) return;
  simWorker = new Worker("./js/sim_worker.js", { type: "module" });

  simWorker.onmessage = (e) => {
    const data = e.data;
    if (!data || !data.type) return;

    switch (data.type) {
      case "WORLD_INIT": {
        if (!world) {
          world = new World(data.preset || 0, data.seed || 1337);
        }
        world.width = data.width || 256;
        world.height = data.height || 256;
        setZoneSize(data.zoneSize || 8);
        if (data.map) {
          world.map = new Uint8Array(data.map);
        }
        if (data.clock) {
          world.clock.day = data.clock.day;
          world.clock.hour = data.clock.hour;
          world.clock.minute = data.clock.minute;
          world.clock.totalSeconds = data.clock.totalSeconds;
          // Recompute globalLight immediately so the first rendered frame has
          // the correct lighting - avoids the one-frame full-brightness flash
          if (data.clock.globalLight !== undefined) {
            world.clock.globalLight = data.clock.globalLight;
          } else {
            const tod = world.clock.hour + world.clock.minute / 60.0;
            if (tod >= 5.0 && tod <= 19.0) {
              const sunAngle = ((tod - 5.0) / 14.0) * Math.PI;
              world.clock.globalLight = 0.18 + 0.82 * Math.pow(Math.sin(sunAngle), 0.85);
            } else {
              world.clock.globalLight = 0.18;
            }
          }
        }
        setActiveWorld(world);
        if (Array.isArray(data.groups)) {
          world.groups = data.groups;
        }

        if (data.isTitleScreen) {
          // Defer heavy entity processing so audio.update() can run before the spike
          const deferredEntities = data.entities;
          const deferredRegistry = data.registry;
          const deferredEvents = Array.isArray(data.events) ? data.events : [];
          setTimeout(() => {
            updateLocalEntities(deferredEntities, deferredRegistry);
            rebuildSpatialGrid(entities, getZoneSize());
            if (deferredEvents.length) restoreWorldEvents(deferredEvents);
          }, 0);
        } else {
          updateLocalEntities(data.entities, data.registry);
          rebuildSpatialGrid(entities, getZoneSize());
          if (Array.isArray(data.events)) {
            restoreWorldEvents(data.events);
          }
        }

        if (data.startX !== undefined && data.startY !== undefined) {
          const zoomFactor = data.isTitleScreen ? 1.8 : (data.width <= 128 ? 3.0 : data.width <= 256 ? 2.0 : 1.5);
          if (renderer) renderer.setCamera(data.startX, data.startY, zoomFactor);
          if (rctRenderer) rctRenderer.setCamera(data.startX, data.startY, zoomFactor);
          if (data.isTitleScreen) {
            titleCamBaseX = data.startX;
            titleCamBaseY = data.startY;
            currentTitleCamX = data.startX;
            currentTitleCamY = data.startY;
            titleJumpTimer = 0;
          }
        }
        if (data.firstLeaderId && data.firstLeaderId > 0) {
          lastSelectedId = data.firstLeaderId;
          if (renderer) renderer.selectEntity(lastSelectedId);
          if (rctRenderer) rctRenderer.selectEntity(lastSelectedId);
        }
        if (rctRenderer) rctRenderer.lastBuiltCamTileX = -9999;
        if (data.isTitleScreen) {
          currentMode = "TITLE";
          titleWorldLoading = false; // World fully ready, allow background rendering
        } else {
          currentMode = "MAP";
        }
        break;
      }

      case "SIM_UPDATE": {
        tpsCounter++;
        if (data.tick !== undefined) {
          setEngineTick(data.tick);
          if (rctRenderer) rctRenderer.simTick = data.tick;
        }
        if (world && data.clock) {
          world.clock.day = data.clock.day;
          world.clock.hour = data.clock.hour;
          world.clock.minute = data.clock.minute;
          world.clock.globalLight = data.clock.globalLight;
          world.clock.totalSeconds = data.clock.totalSeconds;
        }
        if (Array.isArray(data.groups) && world) {
          world.groups = data.groups;
        }
        if (data.entities) {
          updateLocalEntities(data.entities, data.registry);
        }
        if (Array.isArray(data.events) && data.events.length > 0) {
          appendWorldEvents(data.events);
        }
        break;
      }

      case "TILES_UPDATED": {
        if (world && Array.isArray(data.tiles)) {
          for (const t of data.tiles) {
            world.setTile(t.x, t.y, t.tile);
          }
        }
        if (rctRenderer) rctRenderer.lastBuiltCamTileX = -9999;
        break;
      }
    }
  };
}

const _receivedIdsCache = new Set();

function updateLocalEntities(entitiesData, registryData) {
  if (Array.isArray(registryData)) {
    for (const regData of registryData) {
      if (!regData) continue;
      let ent = entityRegistry.get(regData.id);
      if (!ent) {
        ent = { id: regData.id, properties: {} };
        entityRegistry.set(ent.id, ent);
      }
      ent.x = regData.x;
      ent.y = regData.y;
      ent.birthTick = regData.birthTick;
      ent.deathTick = regData.deathTick;
      ent.destroyed = regData.destroyed;
      ent.emote = regData.emote;
      ent.motor = regData.motor;
      ent.combatFlash = regData.combatFlash;
      ent.isConstructed = regData.isConstructed;
      ent.wallStyle = regData.wallStyle;
      if (regData.properties !== undefined) {
        ent.properties = regData.properties;
      }
    }
  }

  if (Array.isArray(entitiesData)) {
    const curEntities = [];
    const zSize = getZoneSize();
    _receivedIdsCache.clear();
    const receivedIds = _receivedIdsCache;

    for (const entData of entitiesData) {
      if (!entData) continue;
      receivedIds.add(entData.id);

      let ent = entityRegistry.get(entData.id);
      const isNew = !ent;
      if (isNew) {
        ent = { id: entData.id, x: entData.x, y: entData.y, targetX: entData.x, targetY: entData.y, properties: {} };
        entityRegistry.set(ent.id, ent);
      }
      if (ent.targetX === undefined) ent.targetX = entData.x;
      if (ent.targetY === undefined) ent.targetY = entData.y;

      ent.birthTick = entData.birthTick;
      ent.deathTick = entData.deathTick;
      ent.destroyed = entData.destroyed;
      ent.emote = entData.emote;
      ent.motor = entData.motor;
      ent.combatFlash = entData.combatFlash;
      ent.isConstructed = entData.isConstructed;
      ent.wallStyle = entData.wallStyle;
      if (entData.properties !== undefined) {
        ent.properties = entData.properties;
      }

      if (isNew) {
        registerEntitySpatial(ent, zSize);
      } else {
        const dist = Math.hypot(entData.x - ent.x, entData.y - ent.y);
        if (dist > 3.0) {
          ent.x = entData.x;
          ent.y = entData.y;
          updateEntitySpatial(ent, zSize);
        }
      }
      ent.targetX = entData.x;
      ent.targetY = entData.y;

      if (!ent.destroyed) {
        curEntities.push(ent);
      }
    }

    // Clean up ghosts that the worker stopped sending (because they died)
    if (entities && entities.length > 0) {
      for (let i = 0; i < entities.length; i++) {
        const oldEnt = entities[i];
        if (oldEnt && !oldEnt.destroyed && !receivedIds.has(oldEnt.id)) {
          oldEnt.destroyed = true;
          unregisterEntitySpatial(oldEnt, zSize);
        }
      }
    }

    entities = curEntities;
  }
}

// ---------------------------------------------------------------------------
// 1. Embedded 8x8 Bitmap Font (All 256 Characters: Exact Match with C/WASM Engine)
// ---------------------------------------------------------------------------

const FONT_8X8 = [
  [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00], // 0
  [0x00, 0x3c, 0x42, 0xa5, 0x81, 0x99, 0x42, 0x3c], // 1
  [0x00, 0x3c, 0x7e, 0xdb, 0xff, 0xc3, 0x66, 0x3c], // 2
  [0x00, 0x66, 0xff, 0xff, 0x7e, 0x3c, 0x18, 0x00], // 3
  [0x00, 0x18, 0x3c, 0x7e, 0x7e, 0x3c, 0x18, 0x00], // 4
  [0x00, 0x18, 0x3c, 0x7e, 0x18, 0x7e, 0x18, 0x00], // 5
  [0x00, 0x18, 0x3c, 0x7e, 0xff, 0x18, 0x3c, 0x00], // 6
  [0x00, 0x00, 0x18, 0x3c, 0x3c, 0x18, 0x00, 0x00], // 7
  [0xff, 0xff, 0xe7, 0xc3, 0xc3, 0xe7, 0xff, 0xff], // 8
  [0x00, 0x3c, 0x42, 0x81, 0x81, 0x42, 0x3c, 0x00], // 9
  [0xff, 0xc3, 0xbd, 0x7e, 0x7e, 0xbd, 0xc3, 0xff], // 10
  [0x0f, 0x07, 0x0b, 0x59, 0x9b, 0x9b, 0x59, 0x00], // 11
  [0x00, 0x3c, 0x42, 0x42, 0x3c, 0x18, 0x7e, 0x18], // 12
  [0x00, 0x0c, 0x0e, 0x0c, 0x0c, 0x3c, 0x7c, 0x38], // 13
  [0x00, 0x9c, 0xbe, 0xa6, 0x64, 0x6c, 0xec, 0xcc], // 14
  [0x00, 0x24, 0x66, 0xe7, 0x24, 0xe7, 0x66, 0x24], // 15
  [0x00, 0x30, 0x38, 0x3c, 0x3e, 0x3c, 0x38, 0x30], // 16
  [0x00, 0x06, 0x0e, 0x1e, 0x3e, 0x1e, 0x0e, 0x06], // 17
  [0x00, 0x18, 0x3c, 0x7e, 0x18, 0x7e, 0x3c, 0x18], // 18
  [0x00, 0x66, 0x66, 0x66, 0x66, 0x00, 0x66, 0x00], // 19
  [0x00, 0x7f, 0xdb, 0xdb, 0x7b, 0x1b, 0x1b, 0x1b], // 20
  [0x00, 0x3e, 0x63, 0x38, 0x0e, 0x63, 0x3e, 0x00], // 21
  [0x00, 0x00, 0x00, 0x7e, 0x7e, 0x00, 0x00, 0x00], // 22
  [0x00, 0x18, 0x3c, 0x7e, 0x18, 0x18, 0x7e, 0x00], // 23
  [0x00, 0x18, 0x3c, 0x7e, 0x18, 0x18, 0x18, 0x00], // 24
  [0x00, 0x18, 0x18, 0x18, 0x7e, 0x3c, 0x18, 0x00], // 25
  [0x00, 0x10, 0x30, 0x7e, 0x30, 0x10, 0x00, 0x00], // 26
  [0x00, 0x08, 0x0c, 0x7e, 0x0c, 0x08, 0x00, 0x00], // 27
  [0x00, 0x00, 0x00, 0x60, 0x60, 0x60, 0x7e, 0x00], // 28
  [0x00, 0x00, 0x24, 0x66, 0xff, 0x66, 0x24, 0x00], // 29
  [0x00, 0x18, 0x3c, 0x7e, 0xff, 0xff, 0x00, 0x00], // 30
  [0x00, 0xff, 0xff, 0x7e, 0x3c, 0x18, 0x00, 0x00], // 31
  [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00], // 32
  [0x18, 0x3c, 0x3c, 0x18, 0x18, 0x00, 0x18, 0x00], // 33
  [0x66, 0x66, 0x24, 0x00, 0x00, 0x00, 0x00, 0x00], // 34
  [0x6c, 0x6c, 0xfe, 0x6c, 0xfe, 0x6c, 0x6c, 0x00], // 35
  [0x18, 0x3e, 0x60, 0x3c, 0x06, 0x7c, 0x18, 0x00], // 36
  [0x00, 0x66, 0xa6, 0xd4, 0x2b, 0x65, 0x66, 0x00], // 37
  [0x38, 0x6c, 0x38, 0x76, 0xdc, 0xcc, 0x76, 0x00], // 38
  [0x18, 0x18, 0x30, 0x00, 0x00, 0x00, 0x00, 0x00], // 39
  [0x0c, 0x18, 0x30, 0x30, 0x30, 0x18, 0x0c, 0x00], // 40
  [0x30, 0x18, 0x0c, 0x0c, 0x0c, 0x18, 0x30, 0x00], // 41
  [0x00, 0x66, 0x3c, 0xff, 0x3c, 0x66, 0x00, 0x00], // 42
  [0x00, 0x18, 0x18, 0x7e, 0x18, 0x18, 0x00, 0x00], // 43
  [0x00, 0x00, 0x00, 0x00, 0x00, 0x18, 0x18, 0x30], // 44
  [0x00, 0x00, 0x00, 0x7e, 0x00, 0x00, 0x00, 0x00], // 45
  [0x00, 0x00, 0x00, 0x00, 0x00, 0x18, 0x18, 0x00], // 46
  [0x06, 0x0c, 0x18, 0x30, 0x60, 0xc0, 0x80, 0x00], // 47
  [0x3c, 0x66, 0x6e, 0x76, 0x66, 0x66, 0x3c, 0x00], // 48
  [0x18, 0x38, 0x18, 0x18, 0x18, 0x18, 0x7e, 0x00], // 49
  [0x3c, 0x66, 0x06, 0x1c, 0x30, 0x60, 0x7e, 0x00], // 50
  [0x3c, 0x66, 0x06, 0x1c, 0x06, 0x66, 0x3c, 0x00], // 51
  [0x0c, 0x1c, 0x34, 0x64, 0x7e, 0x04, 0x0e, 0x00], // 52
  [0x7e, 0x60, 0x7c, 0x06, 0x06, 0x66, 0x3c, 0x00], // 53
  [0x1c, 0x30, 0x60, 0x7c, 0x66, 0x66, 0x3c, 0x00], // 54
  [0x7e, 0xc6, 0x0c, 0x18, 0x30, 0x30, 0x30, 0x00], // 55
  [0x3c, 0x66, 0x66, 0x3c, 0x66, 0x66, 0x3c, 0x00], // 56
  [0x3c, 0x66, 0x66, 0x3e, 0x06, 0x0c, 0x38, 0x00], // 57
  [0x00, 0x18, 0x18, 0x00, 0x00, 0x18, 0x18, 0x00], // 58
  [0x00, 0x18, 0x18, 0x00, 0x00, 0x18, 0x18, 0x30], // 59
  [0x0c, 0x18, 0x30, 0x60, 0x30, 0x18, 0x0c, 0x00], // 60
  [0x00, 0x00, 0x7e, 0x00, 0x7e, 0x00, 0x00, 0x00], // 61
  [0x30, 0x18, 0x0c, 0x06, 0x0c, 0x18, 0x30, 0x00], // 62
  [0x3c, 0x66, 0x06, 0x0c, 0x18, 0x00, 0x18, 0x00], // 63
  [0x3c, 0x66, 0x6e, 0x6e, 0x60, 0x62, 0x3c, 0x00], // 64
  [0x18, 0x3c, 0x66, 0x7e, 0x66, 0x66, 0x66, 0x00], // 65
  [0x7c, 0x66, 0x66, 0x7c, 0x66, 0x66, 0x7c, 0x00], // 66
  [0x3c, 0x66, 0x60, 0x60, 0x60, 0x66, 0x3c, 0x00], // 67
  [0x78, 0x6c, 0x66, 0x66, 0x66, 0x6c, 0x78, 0x00], // 68
  [0x7e, 0x60, 0x60, 0x7c, 0x60, 0x60, 0x7e, 0x00], // 69
  [0x7e, 0x60, 0x60, 0x7c, 0x60, 0x60, 0x60, 0x00], // 70
  [0x3c, 0x66, 0x60, 0x6e, 0x66, 0x66, 0x3a, 0x00], // 71
  [0x66, 0x66, 0x66, 0x7e, 0x66, 0x66, 0x66, 0x00], // 72
  [0x3c, 0x18, 0x18, 0x18, 0x18, 0x18, 0x3c, 0x00], // 73
  [0x1e, 0x0c, 0x0c, 0x0c, 0x0c, 0x6c, 0x38, 0x00], // 74
  [0x66, 0x6c, 0x78, 0x70, 0x78, 0x6c, 0x66, 0x00], // 75
  [0x60, 0x60, 0x60, 0x60, 0x60, 0x60, 0x7e, 0x00], // 76
  [0x63, 0x77, 0x7f, 0x6b, 0x63, 0x63, 0x63, 0x00], // 77
  [0x66, 0x76, 0x7e, 0x7e, 0x6e, 0x66, 0x66, 0x00], // 78
  [0x3c, 0x66, 0x66, 0x66, 0x66, 0x66, 0x3c, 0x00], // 79
  [0x7c, 0x66, 0x66, 0x7c, 0x60, 0x60, 0x60, 0x00], // 80
  [0x3c, 0x66, 0x66, 0x66, 0x6a, 0x6c, 0x36, 0x00], // 81
  [0x7c, 0x66, 0x66, 0x7c, 0x6c, 0x66, 0x66, 0x00], // 82
  [0x3c, 0x66, 0x60, 0x3c, 0x06, 0x66, 0x3c, 0x00], // 83
  [0x7e, 0x18, 0x18, 0x18, 0x18, 0x18, 0x18, 0x00], // 84
  [0x66, 0x66, 0x66, 0x66, 0x66, 0x66, 0x3c, 0x00], // 85
  [0x66, 0x66, 0x66, 0x66, 0x66, 0x3c, 0x18, 0x00], // 86
  [0x63, 0x63, 0x63, 0x6b, 0x7f, 0x77, 0x63, 0x00], // 87
  [0x66, 0x66, 0x3c, 0x18, 0x3c, 0x66, 0x66, 0x00], // 88
  [0x66, 0x66, 0x66, 0x3c, 0x18, 0x18, 0x18, 0x00], // 89
  [0x7e, 0x06, 0x0c, 0x18, 0x30, 0x60, 0x7e, 0x00], // 90
  [0x3c, 0x30, 0x30, 0x30, 0x30, 0x30, 0x3c, 0x00], // 91
  [0xc0, 0x60, 0x30, 0x18, 0x0c, 0x06, 0x02, 0x00], // 92
  [0x3c, 0x0c, 0x0c, 0x0c, 0x0c, 0x0c, 0x3c, 0x00], // 93
  [0x18, 0x3c, 0x66, 0x00, 0x00, 0x00, 0x00, 0x00], // 94
  [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xff], // 95
  [0x30, 0x18, 0x0c, 0x00, 0x00, 0x00, 0x00, 0x00], // 96
  [0x00, 0x00, 0x3c, 0x06, 0x3e, 0x66, 0x3e, 0x00], // 97
  [0x60, 0x60, 0x7c, 0x66, 0x66, 0x66, 0x7c, 0x00], // 98
  [0x00, 0x00, 0x3c, 0x66, 0x60, 0x66, 0x3c, 0x00], // 99
  [0x06, 0x06, 0x3e, 0x66, 0x66, 0x66, 0x3e, 0x00], // 100
  [0x00, 0x00, 0x3c, 0x66, 0x7e, 0x60, 0x3c, 0x00], // 101
  [0x1c, 0x30, 0x78, 0x30, 0x30, 0x30, 0x30, 0x00], // 102
  [0x00, 0x00, 0x3e, 0x66, 0x66, 0x3e, 0x06, 0x3c], // 103
  [0x60, 0x60, 0x7c, 0x66, 0x66, 0x66, 0x66, 0x00], // 104
  [0x18, 0x00, 0x38, 0x18, 0x18, 0x18, 0x3c, 0x00], // 105
  [0x0c, 0x00, 0x1c, 0x0c, 0x0c, 0x0c, 0x6c, 0x38], // 106
  [0x60, 0x60, 0x66, 0x6c, 0x78, 0x6c, 0x66, 0x00], // 107
  [0x38, 0x18, 0x18, 0x18, 0x18, 0x18, 0x3c, 0x00], // 108
  [0x00, 0x00, 0x66, 0x7f, 0x7f, 0x6b, 0x63, 0x00], // 109
  [0x00, 0x00, 0x7c, 0x66, 0x66, 0x66, 0x66, 0x00], // 110
  [0x00, 0x00, 0x3c, 0x66, 0x66, 0x66, 0x3c, 0x00], // 111
  [0x00, 0x00, 0x7c, 0x66, 0x66, 0x7c, 0x60, 0x60], // 112
  [0x00, 0x00, 0x3e, 0x66, 0x66, 0x3e, 0x06, 0x07], // 113
  [0x00, 0x00, 0x7c, 0x66, 0x60, 0x60, 0x60, 0x00], // 114
  [0x00, 0x00, 0x3e, 0x60, 0x3c, 0x06, 0x7c, 0x00], // 115
  [0x18, 0x18, 0x7e, 0x18, 0x18, 0x18, 0x0c, 0x00], // 116
  [0x00, 0x00, 0x66, 0x66, 0x66, 0x66, 0x3e, 0x00], // 117
  [0x00, 0x00, 0x66, 0x66, 0x66, 0x3c, 0x18, 0x00], // 118
  [0x00, 0x00, 0x63, 0x6b, 0x7f, 0x3e, 0x36, 0x00], // 119
  [0x00, 0x00, 0x66, 0x3c, 0x18, 0x3c, 0x66, 0x00], // 120
  [0x00, 0x00, 0x66, 0x66, 0x66, 0x3e, 0x06, 0x3c], // 121
  [0x00, 0x00, 0x7e, 0x0c, 0x18, 0x30, 0x7e, 0x00], // 122
  [0x0e, 0x18, 0x18, 0x70, 0x18, 0x18, 0x0e, 0x00], // 123
  [0x18, 0x18, 0x18, 0x00, 0x18, 0x18, 0x18, 0x00], // 124
  [0x70, 0x18, 0x18, 0x0e, 0x18, 0x18, 0x70, 0x00], // 125
  [0x76, 0xdc, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00], // 126
  [0x00, 0x10, 0x38, 0x7c, 0xfe, 0x7c, 0x38, 0x10], // 127
  [0x00, 0x3c, 0x66, 0x60, 0x60, 0x66, 0x3c, 0x0c], // 128
  [0x00, 0x66, 0x00, 0x66, 0x66, 0x66, 0x3e, 0x00], // 129
  [0x00, 0x0c, 0x18, 0x3c, 0x66, 0x7e, 0x60, 0x3c], // 130
  [0x00, 0x18, 0x24, 0x3c, 0x06, 0x3e, 0x66, 0x3e], // 131
  [0x00, 0x66, 0x00, 0x3c, 0x06, 0x3e, 0x66, 0x3e], // 132
  [0x00, 0x30, 0x18, 0x3c, 0x06, 0x3e, 0x66, 0x3e], // 133
  [0x00, 0x18, 0x00, 0x3c, 0x06, 0x3e, 0x66, 0x3e], // 134
  [0x00, 0x00, 0x3c, 0x66, 0x60, 0x66, 0x3c, 0x0c], // 135
  [0x00, 0x18, 0x24, 0x3c, 0x66, 0x7e, 0x60, 0x3c], // 136
  [0x00, 0x66, 0x00, 0x3c, 0x66, 0x7e, 0x60, 0x3c], // 137
  [0x00, 0x30, 0x18, 0x3c, 0x66, 0x7e, 0x60, 0x3c], // 138
  [0x00, 0x66, 0x00, 0x18, 0x18, 0x18, 0x3c, 0x00], // 139
  [0x00, 0x18, 0x24, 0x18, 0x18, 0x18, 0x3c, 0x00], // 140
  [0x00, 0x30, 0x18, 0x18, 0x18, 0x18, 0x3c, 0x00], // 141
  [0x00, 0x66, 0x00, 0x3c, 0x66, 0x7e, 0x66, 0x66], // 142
  [0x00, 0x18, 0x00, 0x3c, 0x66, 0x7e, 0x66, 0x66], // 143
  [0x00, 0x0c, 0x18, 0x7e, 0x60, 0x7c, 0x60, 0x7e], // 144
  [0x00, 0x00, 0x3b, 0x46, 0x7e, 0x40, 0x3b, 0x00], // 145
  [0x00, 0x7e, 0x48, 0x78, 0x48, 0x48, 0x7e, 0x00], // 146
  [0x00, 0x18, 0x24, 0x3c, 0x66, 0x66, 0x66, 0x3c], // 147
  [0x00, 0x66, 0x00, 0x3c, 0x66, 0x66, 0x66, 0x3c], // 148
  [0x00, 0x30, 0x18, 0x3c, 0x66, 0x66, 0x66, 0x3c], // 149
  [0x00, 0x18, 0x24, 0x66, 0x66, 0x66, 0x66, 0x3c], // 150
  [0x00, 0x30, 0x18, 0x66, 0x66, 0x66, 0x66, 0x3c], // 151
  [0x00, 0x66, 0x00, 0x66, 0x66, 0x3e, 0x06, 0x3c], // 152
  [0x00, 0x66, 0x00, 0x3c, 0x66, 0x66, 0x66, 0x3c], // 153
  [0x00, 0x66, 0x00, 0x66, 0x66, 0x66, 0x66, 0x3c], // 154
  [0x00, 0x18, 0x3e, 0x60, 0x60, 0x3e, 0x18, 0x00], // 155
  [0x00, 0x3c, 0x66, 0x60, 0x7c, 0x60, 0x7e, 0x00], // 156
  [0x00, 0x66, 0x66, 0x3c, 0x18, 0x7e, 0x18, 0x00], // 157
  [0x00, 0x7c, 0x66, 0x7c, 0x60, 0x7c, 0x60, 0x60], // 158
  [0x00, 0x1c, 0x30, 0x78, 0x30, 0x30, 0x30, 0x00], // 159
  [0x00, 0x0c, 0x18, 0x3c, 0x06, 0x3e, 0x66, 0x3e], // 160
  [0x00, 0x0c, 0x18, 0x18, 0x18, 0x18, 0x3c, 0x00], // 161
  [0x00, 0x0c, 0x18, 0x3c, 0x66, 0x66, 0x66, 0x3c], // 162
  [0x00, 0x0c, 0x18, 0x66, 0x66, 0x66, 0x66, 0x3c], // 163
  [0x00, 0x76, 0xdc, 0x7c, 0x66, 0x66, 0x66, 0x00], // 164
  [0x00, 0x76, 0xdc, 0x66, 0x76, 0x7e, 0x6e, 0x66], // 165
  [0x00, 0x3c, 0x66, 0x3c, 0x00, 0x7e, 0x00, 0x00], // 166
  [0x00, 0x38, 0x6c, 0x38, 0x00, 0x7c, 0x00, 0x00], // 167
  [0x00, 0x18, 0x00, 0x18, 0x30, 0x60, 0x66, 0x3c], // 168
  [0x00, 0x00, 0x7e, 0x06, 0x06, 0x06, 0x00, 0x00], // 169
  [0x00, 0x00, 0x7e, 0x60, 0x60, 0x60, 0x00, 0x00], // 170
  [0x00, 0x60, 0x60, 0x6e, 0x73, 0x36, 0x6c, 0x7e], // 171
  [0x00, 0x60, 0x60, 0x6d, 0x75, 0x37, 0x05, 0x07], // 172
  [0x00, 0x18, 0x00, 0x18, 0x18, 0x3c, 0x3c, 0x18], // 173
  [0x00, 0x36, 0x6c, 0xd8, 0x6c, 0x36, 0x00, 0x00], // 174
  [0x00, 0xd8, 0x6c, 0x36, 0x6c, 0xd8, 0x00, 0x00], // 175
  [0x11, 0x44, 0x11, 0x44, 0x11, 0x44, 0x11, 0x44], // 176
  [0x55, 0xaa, 0x55, 0xaa, 0x55, 0xaa, 0x55, 0xaa], // 177
  [0xdd, 0x77, 0xdd, 0x77, 0xdd, 0x77, 0xdd, 0x77], // 178
  [0x18, 0x18, 0x18, 0x18, 0x18, 0x18, 0x18, 0x18], // 179
  [0x18, 0x18, 0x18, 0xf8, 0x18, 0x18, 0x18, 0x18], // 180
  [0x00, 0x0c, 0x18, 0x3c, 0x66, 0x7e, 0x66, 0x66], // 181
  [0x00, 0x18, 0x24, 0x3c, 0x66, 0x7e, 0x66, 0x66], // 182
  [0x00, 0x30, 0x18, 0x3c, 0x66, 0x7e, 0x66, 0x66], // 183
  [0x00, 0x00, 0x00, 0xf8, 0x18, 0x18, 0x18, 0x18], // 184
  [0x36, 0x36, 0x36, 0xfe, 0x36, 0x36, 0x36, 0x36], // 185
  [0x36, 0x36, 0x36, 0x36, 0x36, 0x36, 0x36, 0x36], // 186
  [0x00, 0x00, 0x00, 0xfe, 0x36, 0x36, 0x36, 0x36], // 187
  [0x36, 0x36, 0x36, 0xfe, 0x00, 0x00, 0x00, 0x00], // 188
  [0x36, 0x36, 0x36, 0xf8, 0x00, 0x00, 0x00, 0x00], // 189
  [0x18, 0x18, 0x18, 0xfe, 0x00, 0x00, 0x00, 0x00], // 190
  [0x00, 0x00, 0x00, 0xf8, 0x18, 0x18, 0x18, 0x18], // 191
  [0x18, 0x18, 0x18, 0x1f, 0x00, 0x00, 0x00, 0x00], // 192
  [0x18, 0x18, 0x18, 0xff, 0x00, 0x00, 0x00, 0x00], // 193
  [0x00, 0x00, 0x00, 0xff, 0x18, 0x18, 0x18, 0x18], // 194
  [0x18, 0x18, 0x18, 0x1f, 0x18, 0x18, 0x18, 0x18], // 195
  [0x00, 0x00, 0x00, 0xff, 0x00, 0x00, 0x00, 0x00], // 196
  [0x18, 0x18, 0x18, 0xff, 0x18, 0x18, 0x18, 0x18], // 197
  [0x00, 0x76, 0xdc, 0x3c, 0x06, 0x3e, 0x66, 0x3e], // 198
  [0x00, 0x76, 0xdc, 0x3c, 0x66, 0x7e, 0x66, 0x66], // 199
  [0x36, 0x36, 0x36, 0x7f, 0x00, 0x00, 0x00, 0x00], // 200
  [0x00, 0x00, 0x00, 0x7f, 0x36, 0x36, 0x36, 0x36], // 201
  [0x36, 0x36, 0x36, 0xff, 0x00, 0x00, 0x00, 0x00], // 202
  [0x00, 0x00, 0x00, 0xff, 0x36, 0x36, 0x36, 0x36], // 203
  [0x36, 0x36, 0x36, 0x7f, 0x36, 0x36, 0x36, 0x36], // 204
  [0x00, 0x00, 0xff, 0x00, 0xff, 0x00, 0x00, 0x00], // 205
  [0x36, 0x36, 0x36, 0xff, 0x36, 0x36, 0x36, 0x36], // 206
  [0x18, 0x18, 0x18, 0xff, 0x00, 0x00, 0x00, 0x00], // 207
  [0x36, 0x36, 0x36, 0xff, 0x00, 0x00, 0x00, 0x00], // 208
  [0x00, 0x00, 0x00, 0xff, 0x18, 0x18, 0x18, 0x18], // 209
  [0x00, 0x18, 0x24, 0x7e, 0x60, 0x7c, 0x60, 0x7e], // 210
  [0x00, 0x66, 0x00, 0x7e, 0x60, 0x7c, 0x60, 0x7e], // 211
  [0x00, 0x30, 0x18, 0x7e, 0x60, 0x7c, 0x60, 0x7e], // 212
  [0x00, 0x00, 0x00, 0x1f, 0x18, 0x18, 0x18, 0x18], // 213
  [0x00, 0x0c, 0x18, 0x3c, 0x18, 0x18, 0x18, 0x3c], // 214
  [0x00, 0x18, 0x24, 0x3c, 0x18, 0x18, 0x18, 0x3c], // 215
  [0x00, 0x66, 0x00, 0x3c, 0x18, 0x18, 0x18, 0x3c], // 216
  [0x18, 0x18, 0x18, 0xf8, 0x00, 0x00, 0x00, 0x00], // 217
  [0x00, 0x00, 0x00, 0x1f, 0x18, 0x18, 0x18, 0x18], // 218
  [0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff], // 219
  [0x00, 0x00, 0x00, 0x00, 0xff, 0xff, 0xff, 0xff], // 220
  [0xf0, 0xf0, 0xf0, 0xf0, 0xf0, 0xf0, 0xf0, 0xf0], // 221
  [0x0f, 0x0f, 0x0f, 0x0f, 0x0f, 0x0f, 0x0f, 0x0f], // 222
  [0xff, 0xff, 0xff, 0xff, 0x00, 0x00, 0x00, 0x00], // 223
  [0x00, 0x0c, 0x18, 0x3c, 0x66, 0x66, 0x66, 0x3c], // 224
  [0x00, 0x3c, 0x66, 0x7c, 0x66, 0x66, 0x7c, 0x60], // 225
  [0x00, 0x18, 0x24, 0x3c, 0x66, 0x66, 0x66, 0x3c], // 226
  [0x00, 0x30, 0x18, 0x3c, 0x66, 0x66, 0x66, 0x3c], // 227
  [0x00, 0x76, 0xdc, 0x3c, 0x66, 0x66, 0x66, 0x3c], // 228
  [0x00, 0x76, 0xdc, 0x3c, 0x66, 0x66, 0x66, 0x3c], // 229
  [0x00, 0x00, 0x66, 0x66, 0x66, 0x7e, 0x60, 0x60], // 230
  [0x00, 0x60, 0x60, 0x7c, 0x66, 0x66, 0x7c, 0x60], // 231
  [0x00, 0x7c, 0x66, 0x7c, 0x66, 0x66, 0x7c, 0x60], // 232
  [0x00, 0x0c, 0x18, 0x66, 0x66, 0x66, 0x66, 0x3c], // 233
  [0x00, 0x18, 0x24, 0x66, 0x66, 0x66, 0x66, 0x3c], // 234
  [0x00, 0x30, 0x18, 0x66, 0x66, 0x66, 0x66, 0x3c], // 235
  [0x00, 0x0c, 0x18, 0x66, 0x66, 0x3e, 0x06, 0x3c], // 236
  [0x00, 0x0c, 0x18, 0x66, 0x66, 0x3c, 0x18, 0x18], // 237
  [0x00, 0xfe, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00], // 238
  [0x00, 0x0c, 0x18, 0x00, 0x00, 0x00, 0x00, 0x00], // 239
  [0x00, 0x00, 0x7e, 0x00, 0x7e, 0x00, 0x7e, 0x00], // 240
  [0x00, 0x18, 0x18, 0x7e, 0x18, 0x18, 0x00, 0x7e], // 241
  [0x00, 0x00, 0x00, 0x00, 0x00, 0x7e, 0x00, 0x7e], // 242
  [0x00, 0x60, 0x60, 0x6d, 0x75, 0x37, 0x05, 0x07], // 243
  [0x00, 0x7f, 0xdb, 0xdb, 0x7b, 0x1b, 0x1b, 0x1b], // 244
  [0x00, 0x3e, 0x63, 0x38, 0x0e, 0x63, 0x3e, 0x00], // 245
  [0x00, 0x18, 0x00, 0x7e, 0x00, 0x18, 0x00, 0x00], // 246
  [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x18, 0x0c], // 247
  [0x00, 0x38, 0x6c, 0x38, 0x00, 0x00, 0x00, 0x00], // 248
  [0x00, 0x66, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00], // 249
  [0x00, 0x00, 0x00, 0x18, 0x18, 0x00, 0x00, 0x00], // 250
  [0x00, 0x18, 0x38, 0x18, 0x18, 0x7e, 0x00, 0x00], // 251
  [0x00, 0x38, 0x08, 0x18, 0x08, 0x38, 0x00, 0x00], // 252
  [0x00, 0x38, 0x64, 0x08, 0x10, 0x3c, 0x00, 0x00], // 253
  [0x00, 0x00, 0x3c, 0x3c, 0x3c, 0x3c, 0x00, 0x00], // 254
  [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00] // 255
];

/**
 * Maps Unicode code points to 0..255 glyph index in FONT_8X8.
 */
function mapUnicodeToGlyphIndex(codePoint) {
  if (codePoint < 128) return codePoint;

  switch (codePoint) {
    // Portuguese / Latin accented letters
    case 0x00C7: return 128; // Ç
    case 0x00FC: return 129; // ü
    case 0x00E9: return 130; // é
    case 0x00E2: return 131; // â
    case 0x00E4: return 132; // ä
    case 0x00E0: return 133; // à
    case 0x00E5: return 134; // å
    case 0x00E7: return 135; // ç
    case 0x00EA: return 136; // ê
    case 0x00EB: return 137; // ë
    case 0x00E8: return 138; // è
    case 0x00EF: return 139; // ï
    case 0x00EE: return 140; // î
    case 0x00EC: return 141; // ì
    case 0x00C4: return 142; // Ä
    case 0x00C5: return 143; // Å
    case 0x00C9: return 144; // É
    case 0x00E6: return 145; // æ
    case 0x00C6: return 146; // Æ
    case 0x00F4: return 147; // ô
    case 0x00F6: return 148; // ö
    case 0x00F2: return 149; // ò
    case 0x00FB: return 150; // û
    case 0x00F9: return 151; // ù
    case 0x00FF: return 152; // ÿ
    case 0x00D6: return 153; // Ö
    case 0x00DC: return 154; // Ü
    case 0x00A2: return 155; // ¢
    case 0x00A3: return 156; // £
    case 0x00A5: return 157; // ¥
    case 0x20A7: return 158; // ₧
    case 0x0192: return 159; // ƒ
    case 0x00E1: return 160; // á
    case 0x00ED: return 161; // í
    case 0x00F3: return 162; // ó
    case 0x00FA: return 163; // ú
    case 0x00F1: return 164; // ñ
    case 0x00D1: return 165; // Ñ
    case 0x00AA: return 166; // ª
    case 0x00BA: return 167; // º
    case 0x00BF: return 168; // ¿
    case 0x2310: return 169; // ⌐
    case 0x00AC: return 170; // ¬
    case 0x00BD: return 171; // ½
    case 0x00BC: return 172; // ¼
    case 0x00A1: return 173; // ¡
    case 0x00AB: return 174; // «
    case 0x00BB: return 175; // »
    case 0x2591: return 176; // ░
    case 0x2592: return 177; // ▒
    case 0x2593: return 178; // ▓
    case 0x2502: return 179; // │
    case 0x2524: return 180; // ┤
    case 0x00C1: return 181; // Á
    case 0x00C2: return 182; // Â
    case 0x00C0: return 183; // À
    case 0x2563: return 185; // ╣
    case 0x2551: return 186; // ║
    case 0x2557: return 187; // ╗
    case 0x255D: return 188; // ╝
    case 0x2510: return 191; // ┐
    case 0x2514: return 192; // └
    case 0x2534: return 193; // ┴
    case 0x252C: return 194; // ┬
    case 0x251C: return 195; // ├
    case 0x2500: return 196; // ─
    case 0x253C: return 197; // ┼
    case 0x00E3: return 198; // ã
    case 0x00C3: return 199; // Ã
    case 0x255A: return 200; // ╚
    case 0x2554: return 201; // ╔
    case 0x2569: return 202; // ╩
    case 0x2566: return 203; // ╦
    case 0x2560: return 204; // ╠
    case 0x2550: return 205; // ═
    case 0x256C: return 206; // ╬
    case 0x00CA: return 210; // Ê
    case 0x00CB: return 211; // Ë
    case 0x00C8: return 212; // È
    case 0x00CD: return 214; // Í
    case 0x00CE: return 215; // Î
    case 0x00CF: return 216; // Ï
    case 0x2518: return 217; // ┘
    case 0x250C: return 218; // ┌
    case 0x2588: return 219; // █
    case 0x2584: return 220; // ▄
    case 0x258C: return 221; // ▌
    case 0x2590: return 222; // ▐
    case 0x2580: return 223; // ▀
    case 0x00D3: return 224; // Ó
    case 0x00DF: return 225; // ß
    case 0x00D4: return 226; // Ô
    case 0x00D2: return 227; // Ò
    case 0x00F5: return 228; // õ
    case 0x00D5: return 229; // Õ
    case 0x00B5: return 230; // µ
    case 0x00FE: return 231; // þ
    case 0x00DE: return 232; // Þ
    case 0x00DA: return 233; // Ú
    case 0x00DB: return 234; // Û
    case 0x00D9: return 235; // Ù
    case 0x00FD: return 236; // ý
    case 0x00DD: return 237; // Ý
    case 0x00AF: return 238; // ¯
    case 0x00B4: return 239; // ´
    case 0x2261: return 240; // ≡
    case 0x00B1: return 241; // ±
    case 0x00BE: return 243; // ¾
    case 0x00B6: return 244; // ¶
    case 0x00A7: return 245; // §
    case 0x00F7: return 246; // ÷
    case 0x00B8: return 247; // ¸
    case 0x00B0: return 248; // °
    case 0x00A8: return 249; // ¨
    case 0x00B7: return 250; // ·
    case 0x00B9: return 251; // ¹
    case 0x00B3: return 252; // ³
    case 0x00B2: return 253; // ²
    case 0x25A0: return 254; // ■
    case 0x00A0: return 255; // NBSP

    // Graphical symbols
    case 0x263A: return 1;  // ☺
    case 0x263B: return 2;  // ☻
    case 0x2665: return 3;  // ♥
    case 0x2666: return 4;  // ♦
    case 0x2663: return 5;  // ♣
    case 0x2660: return 6;  // ♠
    case 0x2022: return 7;  // •
    case 0x25D8: return 8;  // ◘
    case 0x25CB: return 9;  // ○
    case 0x25D9: return 10; // ◙
    case 0x2642: return 11; // ♂
    case 0x2640: return 12; // ♀
    case 0x266A: return 13; // ♪
    case 0x266B: return 14; // ♫
    case 0x263C: return 15; // ☼
    case 0x25BA: case 0x25B6: case 0x25B8: return 16; // ►, ▶, ▸
    case 0x25C4: case 0x25C0: case 0x25C2: return 17; // ◄, ◀, ◂
    case 0x2195: return 18; // ↕
    case 0x203C: return 19; // ‼
    case 0x2191: return 24; // ↑
    case 0x2193: return 25; // ↓
    case 0x2192: return 26; // →
    case 0x2190: return 27; // ←
    case 0x2194: return 29; // ↔
    case 0x25B2: return 30; // ▲
    case 0x25BC: return 31; // ▼
    case 0x2302: return 127; // ⌂

    default:
      if (codePoint >= 0 && codePoint < 256) return codePoint;
      return 63; // '?'
  }
}

// Pre-rendered 16x16 glyph atlas cache per color (eliminates 10,000s of fillRect per frame)
const _glyphAtlasCache = new Map();

function getGlyphAtlas(color) {
  let atlas = _glyphAtlasCache.get(color);
  if (atlas) return atlas;

  atlas = document.createElement("canvas");
  atlas.width = 128;
  atlas.height = 128;
  const actx = atlas.getContext("2d");
  actx.fillStyle = color;

  for (let idx = 0; idx < 256; idx++) {
    const glyph = FONT_8X8[idx];
    if (!glyph) continue;
    const gx = (idx % 16) * 8;
    const gy = Math.floor(idx / 16) * 8;
    for (let r = 0; r < 8; r++) {
      const rowBits = glyph[r];
      let startC = -1;
      for (let c = 0; c < 8; c++) {
        if (rowBits & (1 << (7 - c))) {
          if (startC === -1) startC = c;
        } else {
          if (startC !== -1) {
            actx.fillRect(gx + startC, gy + r, c - startC, 1);
            startC = -1;
          }
        }
      }
      if (startC !== -1) {
        actx.fillRect(gx + startC, gy + r, 8 - startC, 1);
      }
    }
  }

  _glyphAtlasCache.set(color, atlas);
  return atlas;
}

/**
 * Draws crisp text using high-performance GPU-accelerated glyph atlas.
 */
function drawText8x8(text, startX, startY, color = "#ffffff", scale = 1) {
  if (text === undefined || text === null) return;
  const str = String(text);
  const atlas = getGlyphAtlas(color);
  const dw = 8 * scale;
  const dh = 8 * scale;

  let cx = startX;
  let cy = startY;

  for (let i = 0; i < str.length; i++) {
    if (str[i] === "\n") {
      cx = startX;
      cy += 9 * scale;
      continue;
    }

    const codePoint = str.codePointAt(i);
    if (codePoint > 0xffff) {
      i++; // Account for surrogate pairs in JS string
    }

    const charIdx = mapUnicodeToGlyphIndex(codePoint);
    const gx = (charIdx % 16) * 8;
    const gy = Math.floor(charIdx / 16) * 8;

    ctx.drawImage(atlas, gx, gy, 8, 8, cx, cy, dw, dh);
    cx += dw;
  }
}

function wrapText8x8(text, maxCharsPerLine) {
  if (!text) return [];
  const words = text.split(" ");
  const lines = [];
  let currentLine = "";

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (testLine.length > maxCharsPerLine && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

function drawText8x8Centered(text, startY, color = "#ffffff", scale = 1, shadowColor = "#000000", shadowOffset = 2) {
  if (text === undefined || text === null) return;
  const str = String(text);
  const textWidth = str.length * 8 * scale;
  const startX = Math.floor((CANVAS_WIDTH - textWidth) / 2);
  if (shadowColor) {
    drawText8x8(str, startX + shadowOffset, startY + shadowOffset, shadowColor, scale);
  }
  drawText8x8(str, startX, startY, color, scale);
}

// ---------------------------------------------------------------------------
// Canvas & Simulation Setup
// ---------------------------------------------------------------------------

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

let CANVAS_WIDTH = window.innerWidth || 800;
let CANVAS_HEIGHT = window.innerHeight || 600;
canvas.width = CANVAS_WIDTH;
canvas.height = CANVAS_HEIGHT;

const FRAMEBUFFER_SIZE = CANVAS_WIDTH * CANVAS_HEIGHT * 4;

// Memory managed by JS
// Canvas 2D Native Rendering

let renderer = new Renderer(canvas);
const container3D = document.getElementById("container-3d");
let rctRenderer = null;
if (container3D) {
  rctRenderer = new RCT3DRenderer(container3D);
}
let is3DMode = true;

function toggle3DMode() {
  is3DMode = !is3DMode;
  if (is3DMode) {
    if (container3D) container3D.style.display = "block";
    if (rctRenderer) {
      rctRenderer.resize(CANVAS_WIDTH, CANVAS_HEIGHT);
      if (renderer) {
        rctRenderer.setCamera(renderer.getCameraX(), renderer.getCameraY(), renderer.getCameraZoom());
        rctRenderer.selectEntity(renderer.getSelectedId());
      }
    }
  } else {
    if (container3D) container3D.style.display = "none";
    if (renderer && rctRenderer) {
      renderer.setCamera(rctRenderer.getCameraX(), rctRenderer.getCameraY(), rctRenderer.getCameraZoom());
      renderer.selectEntity(rctRenderer.getSelectedId());
    }
  }
}

let world = null;
let entities = [];

// Simulation Speed & Time State
let isPaused = false;
let simSpeed = 1.0; // 0.5x, 1x, 2x, 4x, 8x, 16x, 32x
const SPEED_TIERS = [0.5, 1.0, 2.0, 4.0, 8.0, 16.0, 32.0];

function increaseSimSpeed() {
  const idx = SPEED_TIERS.indexOf(simSpeed);
  if (idx !== -1 && idx < SPEED_TIERS.length - 1) {
    simSpeed = SPEED_TIERS[idx + 1];
  } else if (idx === -1) {
    simSpeed = 1.0;
  }
  if (renderer) {
    renderer.setTps(Math.round(60 * simSpeed));
  }
  if (simWorker) simWorker.postMessage({ type: "SET_SPEED", simSpeed });
}

function decreaseSimSpeed() {
  const idx = SPEED_TIERS.indexOf(simSpeed);
  if (idx > 0) {
    simSpeed = SPEED_TIERS[idx - 1];
  } else if (idx === -1) {
    simSpeed = 1.0;
  }
  if (renderer) {
    renderer.setTps(Math.round(60 * simSpeed));
  }
  if (simWorker) simWorker.postMessage({ type: "SET_SPEED", simSpeed });
}

function cycleSimSpeed() {
  const idx = SPEED_TIERS.indexOf(simSpeed);
  simSpeed = SPEED_TIERS[(idx + 1) % SPEED_TIERS.length];
  if (renderer) {
    renderer.setTps(Math.round(60 * simSpeed));
  }
  if (simWorker) simWorker.postMessage({ type: "SET_SPEED", simSpeed });
}

let currentPreset = 0;
let lastSelectedId = -1;

// Performance
let lastTime = 0;
let fpsFrames = 0;
let currentFps = 60;
let currentTps = 0;
let tpsFrames = 0;
let lastFpsUpdate = performance.now();
let tpsCounter = 0;
let measuredTps = 60;
let lastTpsUpdate = performance.now();

// Active In-Game Screen Mode ("TITLE", "SCENARIOS", "MAP", "INSPECT", "ENTITIES", "GROUPS", "LOGS", "GENERATOR")
let currentMode = "TITLE";
let modalScroll = 0;
let inspectingLogEvent = null;
let inspectingBattle = null; // Currently inspected battle dossier
let inspectingRelationship = null; // Currently inspected two-character relationship summary
let inspectingGroup = null; // Currently inspected clan for full dossier/stockpile view
let groupDetailTab = "ZONES"; // Active tab in clan dossier: "ZONES", "STOCKPILE", "MEMBERS", "HISTORY"
let dossierTab = "OVERVIEW"; // Active tab in creature dossier: "OVERVIEW", "AFFINITIES", "OFFSPRING", "CHRONICLE"
let familyTreeZoom = 1.0; // Zoom factor for graphical family tree
let familyTreePanX = 0; // Pan offset X for family tree
let familyTreePanY = 0; // Pan offset Y for family tree
let inspectingFromCreature = false;
let visualizedGroupId = null; // ID of clan whose claimed territory is being highlighted on map
let isFollowMode = false; // Camera automatically follows and locks onto selected creature
let isCreatureVisionMode = false; // "See through creature's eyes" perception FOV & Fog of War
let hasActiveGame = false; // True if player has generated/started an active game world
let speciesFilter = ""; // Specific species filter for entities modal list

// High-Performance Modal Caches (eliminates per-frame scan bottleneck / 1fps lag)
const _dossierCache = {
  targetId: null,
  events: null,
  battles: null,
  familyTree: null,
  house: null,
  lastEventCount: -1,
  lastBattlesCount: 0,
  lastEventsCount: 0
};

const _clanDossierCache = {
  groupId: null,
  stockpile: null,
  history: null,
  lastStockpileUpdate: 0,
  lastEventCount: -1
};

const _logsFilterCache = {
  filter: null,
  eventCount: -1,
  list: []
};

const _entitiesFilterCache = {
  filter: null,
  speciesFilter: null,
  entityCount: -1,
  list: []
};

// Prefab Scenarios for Title Screen & Game Presets
const PREFAB_SCENARIOS = [
  {
    id: 0,
    preset: 0,
    name: "EMERALD ARCHIPELAGO",
    badge: "ISLANDS & SEAS",
    desc: "Lush tropical islands with calm beaches, crystal lagoons, and seaweed reefs.",
    seed: 482910,
    camX: 512,
    camY: 512,
    color: "#3cbcfc"
  },
  {
    id: 1,
    preset: 1,
    name: "WILD CONTINENT",
    badge: "FORESTS & RIVERS",
    desc: "Vast continental landmass covered in dense oak woodlands and fertile plains.",
    seed: 819234,
    camX: 512,
    camY: 512,
    color: "#58d854"
  },
  {
    id: 2,
    preset: 2,
    name: "ROCKY HIGHLANDS",
    badge: "MOUNTAINS & PEAKS",
    desc: "Towering craggy mountain ranges, stone ravines, and hardy alpine flora.",
    seed: 671203,
    camX: 512,
    camY: 512,
    color: "#f8b800"
  },
  {
    id: 3,
    preset: 0,
    name: "DESERT OASIS",
    badge: "DUNES & CACTI",
    desc: "Golden arid dunes dotted with ancient cacti and hidden freshwater oases.",
    seed: 334190,
    camX: 512,
    camY: 512,
    color: "#ff8800"
  },
  {
    id: 4,
    preset: 2,
    name: "PINE VALLEY",
    badge: "TEMPERATE WOODLAND",
    desc: "Sheltered alpine valleys, evergreen pine groves, and rich natural resources.",
    seed: 951478,
    camX: 512,
    camY: 512,
    color: "#33bb77"
  }
];

let selectedScenarioIdx = 0;
let titleCamTime = 0;
let titleAutoCycleTimer = 0;
let titleJumpTimer = 0;
let currentTitleCamX = 512;
let currentTitleCamY = 512;
let titleCamBaseX = 512;
let titleCamBaseY = 512;
let titleWorldLoading = false; // true while worker is generating the title background world
let isAudioMuted = false;

// Real-Time Floating Corner Map Editor State
let isEditorOpen = false; // Floating corner editor menu visibility
let editorTab = "TILES"; // "TILES", "CREATURES", "ITEMS", "TOOLS"
let editorSelectedTile = 0; // 0: Grass, 1: Mountain, 2: Water, 3: Sand, 4: Stone, 5: Void
let editorBrushSize = 1; // 1, 3, 5
let editorTool = null; // null when closed; "PAINT", "SPAWN", "BULLDOZER", "EYEDROPPER"
let editorActiveSpawner = null; // { label, fn }
let isPainting = false;
let editorPage = 0; // Pagination for mob/item lists in compact bar

const EDITOR_TILES = [
  { id: 0, label: "GRASS/SOIL", color: "#58d854", desc: "Fertile land / forest" },
  { id: 3, label: "DESERT SAND", color: "#f8b800", desc: "Arid desert dunes" },
  { id: 4, label: "FOOTHILLS", color: "#888888", desc: "Stone & mineral hills" },
  { id: 1, label: "MOUNTAIN", color: "#f8f8f8", desc: "High rocky terrain" },
  { id: 2, label: "OCEAN WATER", color: "#0078f8", desc: "Deep ocean water" },
  { id: 5, label: "VOID/ABYSS", color: "#222222", desc: "Impassable bedrock" },
  { id: 6, label: "DIRT ROAD", color: "#c88c50", desc: "Packed dirt road" },
  { id: 7, label: "SAND ROAD", color: "#e0c068", desc: "Sandstone path" },
  { id: 8, label: "STONE ROAD", color: "#a0a0b0", desc: "Cobblestone highway" }
];

const EDITOR_NATURE = [
  { id: "OAK_TREE", label: "OAK TREE" },
  { id: "PINE_TREE", label: "PINE TREE" },
  { id: "WILLOW_TREE", label: "WILLOW TREE" },
  { id: "CACTUS", label: "CACTUS" },
  { id: "SHRUB", label: "ALPINE SHRUB" },
  { id: "WATER_LILY", label: "WATER LILY" },
  { id: "SEAWEED", label: "SEAWEED" },
  { id: "WOOD_LOG", label: "WOOD LOG" },
  { id: "STONE_BLOCK", label: "STONE BLOCK" },
  { id: "OAK_SEED", label: "OAK SEED" },
  { id: "PINE_SEED", label: "PINE SEED" },
  { id: "WILLOW_SEED", label: "WILLOW SEED" },
  { id: "CACTUS_SEED", label: "CACTUS SEED" },
  { id: "FRUIT", label: "WILD FRUIT" }
];

const EDITOR_BUILDINGS = [
  { id: "STONE_WALL", label: "STONE WALL" },
  { id: "WOOD_WALL", label: "WOOD WALL" },
  { id: "DOOR", label: "WOODEN DOOR" },
  { id: "CAMPFIRE", label: "CAMPFIRE" },
  { id: "TORCH", label: "TORCH" },
  { id: "WAREHOUSE", label: "WAREHOUSE" },
  { id: "WATER_WELL", label: "WATER WELL" },
  { id: "KITCHEN", label: "KITCHEN" },
  { id: "SLAUGHTERHOUSE", label: "BUTCHERY" },
  { id: "HOUSE", label: "PRE-FAB HOUSE" }
];

const EDITOR_CREATURES = [
  // Humanoids & Settlers
  { id: "HUMAN", label: "HUMAN PIONEER" },
  { id: "BUILDER", label: "HUMAN BUILDER" },
  { id: "MINER", label: "HUMAN MINER" },
  { id: "FARMER", label: "HUMAN FARMER" },
  { id: "HUNTER", label: "HUMAN HUNTER" },
  { id: "COOK", label: "HUMAN COOK" },
  { id: "HAULER", label: "HUMAN HAULER" },
  { id: "ELF", label: "ELF ARCHER" },
  { id: "DWARF", label: "DWARF MINER" },
  { id: "ORC", label: "ORC WARRIOR" },
  { id: "GOBLIN", label: "GOBLIN SCOUT" },
  { id: "KOBOLD", label: "KOBOLD" },
  { id: "LIZARDFOLK", label: "LIZARDFOLK" },
  { id: "CATFOLK", label: "CATFOLK" },
  { id: "CENTAUR", label: "CENTAUR" },
  // Wildlife & Fauna
  { id: "BOAR", label: "WILD BOAR" },
  { id: "DEER", label: "DEER" },
  { id: "WOLF", label: "WOLF" },
  { id: "BEAR", label: "BEAR" },
  { id: "CAT", label: "CAT" },
  { id: "GOAT", label: "MOUNTAIN GOAT" },
  { id: "CAPYBARA", label: "CAPYBARA" },
  { id: "COW", label: "COW" },
  { id: "CHICKEN", label: "CHICKEN" },
  { id: "DUCK", label: "DUCK" },
  { id: "FROG", label: "FROG" },
  { id: "RABBIT", label: "RABBIT" },
  { id: "BAT", label: "BAT" },
  { id: "SPIDER", label: "SPIDER" },
  { id: "SCORPION", label: "SCORPION" },
  { id: "LIZARD", label: "LIZARD" },
  { id: "DRAGON", label: "FIRE DRAGON" },
  { id: "SERPENT", label: "SEA SERPENT" }
];

const EDITOR_ITEMS = [
  { id: "ROASTED_MEAT", label: "ROASTED MEAT" },
  { id: "GRILLED_VEGGIES", label: "GRILLED VEGGIES" },
  { id: "MEAT_BENTO", label: "MEAT BENTO" },
  { id: "VEGAN_BENTO", label: "VEGAN BENTO" },
  { id: "GOURMET_BENTO", label: "GOURMET BENTO" },
  { id: "BASKET_MED", label: "BASKET (MED)" },
  { id: "BASKET_LRG", label: "BASKET (LRG)" },
  { id: "BACKPACK", label: "BACKPACK" },
  { id: "EXPEDITION_PACK", label: "EXPEDITION PACK" }
];

function applyTileBrush(cx, cy, tileType, brushSize) {
  if (!world) return;
  const half = Math.floor(brushSize / 2);
  for (let dy = -half; dy <= half; dy++) {
    for (let dx = -half; dx <= half; dx++) {
      const tx = cx + dx;
      const ty = cy + dy;
      if (tx >= 0 && tx < (world.width || 512) && ty >= 0 && ty < (world.height || 512)) {
        world.setTile(tx, ty, tileType);
      }
    }
  }
}

function getEditorHoverTile() {
  if (is3DMode && rctRenderer) {
    return rctRenderer.getTileAtScreen(mouseClientX, mouseClientY, world);
  } else if (renderer) {
    const zoom = renderer.getCameraZoom();
    const tileSize = 16.0 * zoom;
    const cx = renderer.getCameraX();
    const cy = renderer.getCameraY();
    return {
      x: Math.floor(cx + (mouseX - CANVAS_WIDTH / 2) / tileSize),
      y: Math.floor(cy + (mouseY - CANVAS_HEIGHT / 2) / tileSize)
    };
  }
  return { x: 0, y: 0 };
}

function applyEditorActionAt(tileX, tileY) {
  if (!world || tileX < 0 || tileX >= (world.width || 512) || tileY < 0 || tileY >= (world.height || 512)) return;

  if (editorTool === "EYEDROPPER") {
    const sampled = world.getTile(tileX, tileY);
    editorSelectedTile = sampled;
    editorTool = "PAINT";
    return;
  }

  if (simWorker) {
    simWorker.postMessage({
      type: "APPLY_EDITOR_ACTION",
      tool: editorTool,
      tileX,
      tileY,
      selectedTile: editorSelectedTile,
      brushSize: editorBrushSize,
      spawnerId: editorActiveSpawner?.id || null,
      spawnerLabel: editorActiveSpawner?.label || null
    });
  }
}

function toggleFollowMode() {
  isFollowMode = !isFollowMode;
}

function toggleCreatureVisionMode() {
  isCreatureVisionMode = !isCreatureVisionMode;
}

function parseZoneCoords(zoneStr) {
  if (!zoneStr) return null;
  const parts = zoneStr.includes("_") ? zoneStr.split("_") : zoneStr.split(",");
  const zx = parseInt(parts[0], 10);
  const zy = parseInt(parts[1], 10);
  if (isNaN(zx) || isNaN(zy)) return null;
  const sz = getZoneSize();
  return {
    zx,
    zy,
    minX: zx * sz,
    minY: zy * sz,
    maxX: zx * sz + (sz - 1),
    maxY: zy * sz + (sz - 1),
    centerX: zx * sz + Math.floor(sz / 2),
    centerY: zy * sz + Math.floor(sz / 2)
  };
}

// Registry Filters & Selection
let entityFilter = "ALL";
let groupSelectedIdx = 0;
let logFilter = "ALL";

// Mouse & Input State
let mouseX = 0;
let mouseY = 0;
let mouseButtons = 0;
let isMouseDown = false;
let isDragging = false;
let dragStartClientX = 0;
let dragStartClientY = 0;
let dragCameraStartX = 0;
let dragCameraStartY = 0;
let dragStartGroundPos = null;

const keysDown = new Set();

// Clickable UI Regions
let activeUiRegions = [];

function registerClickableRegion(x, y, w, h, onClick, cursor = "pointer") {
  activeUiRegions.push({ x, y, w, h, onClick, cursor });
}

// ---------------------------------------------------------------------------
// Screen Resize & Aspect Ratio Fitting
// ---------------------------------------------------------------------------

function resizeCanvasToWindow() {
  const vv = window.visualViewport;
  CANVAS_WIDTH = Math.max(320, Math.floor(vv ? vv.width : window.innerWidth));
  CANVAS_HEIGHT = Math.max(240, Math.floor(vv ? vv.height : window.innerHeight));

  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  canvas.style.width = `${CANVAS_WIDTH}px`;
  canvas.style.height = `${CANVAS_HEIGHT}px`;

  if (rctRenderer) {
    rctRenderer.resize(CANVAS_WIDTH, CANVAS_HEIGHT);
  }
}

if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", resizeCanvasToWindow);
  window.visualViewport.addEventListener("scroll", resizeCanvasToWindow);
}

window.addEventListener("resize", resizeCanvasToWindow);
resizeCanvasToWindow();

function getCanvasCoords(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = CANVAS_WIDTH / (rect.width || 1);
  const scaleY = CANVAS_HEIGHT / (rect.height || 1);

  const cx = (clientX - rect.left) * scaleX;
  const cy = (clientY - rect.top) * scaleY;

  return {
    x: Math.max(0, Math.min(CANVAS_WIDTH, cx)),
    y: Math.max(0, Math.min(CANVAS_HEIGHT, cy)),
    inside: clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom
  };
}

// ---------------------------------------------------------------------------
// World Initialization
// ---------------------------------------------------------------------------

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


// Mobile Detection & Multi-Touch State
const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) || ("ontouchstart" in window);
let touchPinchDist = null;
let lastTouchTapTime = 0;
let touchStartX = 0;
let touchStartY = 0;

// World Generator & Configurator State
let genPreset = 0; // 0: ARCHIPELAGO, 1: CONTINENT, 2: HIGHLANDS
let genWidth = 256; // 64 to 1024 (Default: 256x256)
let genHeight = 256; // 64 to 1024 (Default: 256x256)
let genZoneSize = 8; // 4, 8, 16, 32, 64
let genSeed = Math.floor(Math.random() * 1000000) + 1;
let genCreatureDensity = "STANDARD"; // "NONE", "LOW", "STANDARD", "HIGH"
let genPlantDensity = "NORMAL"; // "SPARSE", "NORMAL", "DENSE"
let genSpawnPioneers = true;
let genEmbarkCount = Math.floor(Math.random() * 5) + 3; // Random 3 to 7 Embarks by default

function toggleAudio() {
  isAudioMuted = !isAudioMuted;
  if (audio && audio.isInitialized) {
    try {
      if (audio.masterBus) {
        audio.masterBus.setVolume(isAudioMuted ? 0.0 : 1.0);
      } else if (audio.setGlobalParameter) {
        audio.setGlobalParameter("Volume", isAudioMuted ? 0 : 1);
      }
    } catch (e) {
      console.warn("Audio toggle error:", e);
    }
  }
}

function initTitleWorld(scenarioIdx = 0) {
  const scen = PREFAB_SCENARIOS[scenarioIdx] || PREFAB_SCENARIOS[0];
  selectedScenarioIdx = scenarioIdx;
  currentPreset = scen.preset;
  genPreset = scen.preset;
  genSeed = scen.seed;
  titleCamBaseX = scen.camX || 512;
  titleCamBaseY = scen.camY || 512;

  currentMode = "TITLE";
  currentTitleCamX = titleCamBaseX;
  currentTitleCamY = titleCamBaseY;
  titleJumpTimer = 0;

  const zoomFactor = 1.8;
  if (renderer) renderer.setCamera(titleCamBaseX, titleCamBaseY, zoomFactor);
  if (rctRenderer) rctRenderer.setCamera(titleCamBaseX, titleCamBaseY, zoomFactor);

  // If world already exists, smoothly reposition camera to the new scene rather than blocking the main thread with a world regeneration
  if (world && world.map && world.map.length > 0 && !titleWorldLoading) {
    if (world.clock) {
      const times = [6.2, 12.0, 18.2, 0.0];
      const t = times[scenarioIdx % times.length];
      world.clock.hour = Math.floor(t);
      world.clock.minute = Math.floor((t % 1) * 60);
      world.clock.globalLight = (t >= 5 && t <= 19) ? 0.85 : 0.18;
    }
    return;
  }

  titleWorldLoading = true;
  if (simWorker) {
    simWorker.postMessage({
      type: "GENERATE_WORLD",
      preset: scen.preset,
      width: genWidth,
      height: genHeight,
      zoneSize: genZoneSize,
      seed: scen.seed,
      creatureDensity: "NONE",
      plantDensity: "NORMAL",
      spawnPioneers: false,
      embarkCount: 0,
      spawnRoads: false,
      isTitleScreen: true
    });
  } else {
    world.generate(scen.preset, scen.seed);
    titleWorldLoading = false;
  }

  resetEngineTicks();
  resetWorldEvents();
  entities = [];
  lastSelectedId = -1;
  modalScroll = 0;
  inspectingLogEvent = null;
}

function startNewGame(scenarioPreset = null, customSeed = null) {
  const preset = scenarioPreset !== null ? scenarioPreset : genPreset;
  const seed = customSeed !== null ? customSeed : (Math.floor(Math.random() * 1000000) + 1);
  genPreset = preset;
  genSeed = seed;
  genEmbarkCount = Math.floor(Math.random() * 5) + 3;
  hasActiveGame = true;

  if (simWorker) {
    simWorker.postMessage({
      type: "GENERATE_WORLD",
      preset: genPreset,
      width: genWidth,
      height: genHeight,
      zoneSize: genZoneSize,
      seed: genSeed,
      creatureDensity: genCreatureDensity,
      plantDensity: genPlantDensity,
      spawnPioneers: true,
      embarkCount: genEmbarkCount,
      spawnRoads: true,
      isTitleScreen: false
    });
  } else {
    world.generate(genPreset, genSeed);
  }

  resetEngineTicks();
  resetWorldEvents();
  if (world) world.refresh();
  entities = [];
  lastSelectedId = -1;
  modalScroll = 0;
  inspectingLogEvent = null;

  const zoomFactor = genWidth <= 128 ? 3.0 : genWidth <= 256 ? 2.0 : 1.5;
  const startX = 512;
  const startY = 512;
  if (renderer) renderer.setCamera(startX, startY, zoomFactor);
  if (rctRenderer) {
    rctRenderer.setCamera(startX, startY, zoomFactor);
    if (lastSelectedId > 0) rctRenderer.selectEntity(lastSelectedId);
  }
  currentMode = "MAP";

  // Stop menu theme with fade-out when transitioning to gameplay
  audio.stopInstance("menuTheme", false);
}

function returnToTitleScreen() {
  isEditorOpen = false;
  editorTool = null;
  inspectingLogEvent = null;
  inspectingGroup = null;
  currentMode = "TITLE";

  if (!hasActiveGame) {
    initTitleWorld(selectedScenarioIdx);
  }

  // Resume menu theme when going back to title
  if (audio.isInitialized && !audio.activeInstances.has("menuTheme")) {
    audio.createInstance("menuTheme", "event:/Musica/Menu", true);
  }
}

function generateConfiguredWorld() {
  hasActiveGame = true;
  if (simWorker) {
    simWorker.postMessage({
      type: "GENERATE_WORLD",
      preset: genPreset,
      width: genWidth,
      height: genHeight,
      zoneSize: genZoneSize,
      seed: genSeed,
      creatureDensity: genCreatureDensity,
      plantDensity: genPlantDensity,
      spawnPioneers: genSpawnPioneers,
      embarkCount: genEmbarkCount,
      spawnRoads: true,
      isTitleScreen: false
    });
  } else {
    world.generate(genPreset, genSeed);
  }

  resetEngineTicks();
  resetWorldEvents();
  if (world) world.refresh();
  entities = [];
  lastSelectedId = -1;
  modalScroll = 0;
  inspectingLogEvent = null;

  const zoomFactor = genWidth <= 128 ? 3.0 : genWidth <= 256 ? 2.0 : 1.5;
  const startX = 256;
  const startY = 256;
  renderer.setCamera(startX, startY, zoomFactor);
  if (rctRenderer) {
    rctRenderer.setCamera(startX, startY, zoomFactor);
    if (lastSelectedId > 0) rctRenderer.selectEntity(lastSelectedId);
  }
  currentMode = "MAP";
  audio.stopInstance("menuTheme", false);
}

function resetWorld(presetId = 0) {
  genPreset = presetId;
  const seed = Math.floor(Math.random() * 1000000) + 1;
  genSeed = seed;
  genEmbarkCount = Math.floor(Math.random() * 5) + 3; // Random 3 to 7 Embarks on map reset
  if (simWorker) {
    simWorker.postMessage({
      type: "GENERATE_WORLD",
      preset: genPreset,
      width: genWidth,
      height: genHeight,
      zoneSize: genZoneSize,
      seed,
      creatureDensity: genCreatureDensity,
      plantDensity: genPlantDensity,
      spawnPioneers: genSpawnPioneers,
      embarkCount: genEmbarkCount
    });
  } else {
    world.generate(genPreset, seed);
  }

  resetEngineTicks();
  resetWorldEvents();
  if (world) world.refresh();
  entities = [];
  lastSelectedId = -1;
  modalScroll = 0;
  inspectingLogEvent = null;

  const zoomFactor = genWidth <= 128 ? 3.0 : genWidth <= 256 ? 2.0 : 1.5;
  const startX = 256;
  const startY = 256;
  renderer.setCamera(startX, startY, zoomFactor);
  if (rctRenderer) {
    rctRenderer.setCamera(startX, startY, zoomFactor);
  }
  currentMode = "MAP";
}

function spawnEntityAtCamera(spawnerLabel) {
  if (!renderer || !world) return;
  const cx = Math.floor(renderer.getCameraX());
  const cy = Math.floor(renderer.getCameraY());
  if (simWorker) {
    simWorker.postMessage({ type: "SPAWN_ENTITY", spawnerLabel, x: cx, y: cy });
  }
}

function focusEntityAndFollow(ent) {
  if (!ent) return;
  lastSelectedId = ent.id;
  isFollowMode = true;
  if (renderer) {
    renderer.selectEntity(ent.id);
    renderer.setCamera(ent.x, ent.y, renderer.getCameraZoom());
  }
  if (rctRenderer) {
    rctRenderer.setCamera(ent.x, ent.y);
  }
  currentMode = "MAP";
  inspectingGroup = null;
  inspectingLogEvent = null;
  inspectingFromCreature = false;
}

function focusLocation(x, y, zoom = 1.5) {
  if (renderer) renderer.setCamera(x, y, zoom);
  if (rctRenderer) rctRenderer.setCamera(x, y, zoom);
  currentMode = "MAP";
  inspectingGroup = null;
  inspectingLogEvent = null;
  inspectingFromCreature = false;
}

function cycleNextLivingEntity() {
  if (entities.length === 0 || !renderer) return;
  const living = entities.filter(e => !e.destroyed && e.properties && e.properties.life);
  if (living.length === 0) return;

  const curIdx = living.findIndex(e => e.id === lastSelectedId);
  const nextIdx = (curIdx + 1) % living.length;
  const nextEnt = living[nextIdx];

  focusEntityAndFollow(nextEnt);
}

function centerCamera() {
  if (!renderer || !world) return;
  const sel = getEntityById(lastSelectedId);
  if (sel) {
    focusEntityAndFollow(sel);
  } else {
    focusLocation(256, 256, 1.0);
  }
}

function togglePause() {
  if (!renderer || !world) return;
  isPaused = !isPaused;
  renderer.setPaused(isPaused ? 1 : 0);
  if (simWorker) simWorker.postMessage({ type: "SET_PAUSED", isPaused });
}

// ---------------------------------------------------------------------------
// Mouse & Keyboard Input Dispatcher
// ---------------------------------------------------------------------------

canvas.addEventListener("contextmenu", (e) => {
  e.preventDefault();
});

window.addEventListener("mousedown", (e) => {
  // If recent touch occurred (within 600ms), ignore simulated mouse event from mobile browser
  if (Date.now() - lastTouchTapTime < 600) return;
  if (e.button !== 0 && e.button !== 1 && e.button !== 2) return;
  const coords = getCanvasCoords(e.clientX, e.clientY);
  mouseX = coords.x;
  mouseY = coords.y;
  mouseButtons = e.buttons;

  isMouseDown = true;
  isDragging = false;
  dragStartClientX = e.clientX;
  dragStartClientY = e.clientY;

  if (is3DMode && rctRenderer) {
    dragCameraStartX = rctRenderer.getCameraX();
    dragCameraStartY = rctRenderer.getCameraY();
  } else if (renderer) {
    dragCameraStartX = renderer.getCameraX();
    dragCameraStartY = renderer.getCameraY();
  }

  // Handle clickable UI regions first on left-click
  if (e.button === 0) {
    for (let i = activeUiRegions.length - 1; i >= 0; i--) {
      const reg = activeUiRegions[i];
      if (coords.x >= reg.x && coords.x <= reg.x + reg.w && coords.y >= reg.y && coords.y <= reg.y + reg.h) {
        reg.onClick();
        isMouseDown = false;
        return;
      }
    }

    // If Editor is active and clicked on map canvas (not over UI bars or corner menu)
    if (isEditorOpen && editorTool && coords.inside && coords.y > 32 && coords.y < CANVAS_HEIGHT - 36) {
      const tile = getEditorHoverTile();
      isPainting = true;
      applyEditorActionAt(tile.x, tile.y);
      return;
    }
  }
});

let mouseClientX = 0;
let mouseClientY = 0;

window.addEventListener("mousemove", (e) => {
  if (Date.now() - lastTouchTapTime < 600) return;
  mouseClientX = e.clientX;
  mouseClientY = e.clientY;
  const coords = getCanvasCoords(e.clientX, e.clientY);
  mouseX = coords.x;
  mouseY = coords.y;

  let isOverUi = false;
  for (const reg of activeUiRegions) {
    if (coords.x >= reg.x && coords.x <= reg.x + reg.w && coords.y >= reg.y && coords.y <= reg.y + reg.h) {
      canvas.style.cursor = reg.cursor || "pointer";
      isOverUi = true;
      break;
    }
  }
  if (!isOverUi) {
    canvas.style.cursor = (isEditorOpen && editorTool) ? "crosshair" : "default";
  }

  // Active Real-Time Painting Drag
  if (isEditorOpen && isPainting && isMouseDown && (editorTool === "PAINT" || editorTool === "BULLDOZER")) {
    if (coords.inside && coords.y > 32 && coords.y < CANVAS_HEIGHT - 36) {
      const tile = getEditorHoverTile();
      applyEditorActionAt(tile.x, tile.y);
      return;
    }
  }

  // Camera Drag (Right Click or Left Click Drag when not painting)
  if (isMouseDown && (renderer || rctRenderer) && !isPainting && currentMode === "MAP") {
    const totalDist = Math.hypot(e.clientX - dragStartClientX, e.clientY - dragStartClientY);
    if (totalDist > 2) {
      isDragging = true;
      isFollowMode = false;
      if (is3DMode && rctRenderer) {
        // Ultra-smooth 1:1 isometric closed-form pan
        const zoom = rctRenderer.getCameraZoom();
        const canvasRect = canvas.getBoundingClientRect();
        const scale = 56.0 / (zoom * Math.max(100, canvasRect.height));

        const sx = (e.clientX - dragStartClientX) * scale;
        const sy = (e.clientY - dragStartClientY) * scale;

        // Ground plane projection: X-screen = 45 deg, Y-screen = 35.264 deg pitch
        const moveX = -(sx * 0.70710678 + sy * 1.22474487);
        const moveY = -(-sx * 0.70710678 + sy * 1.22474487);

        if (!isNaN(moveX) && !isNaN(moveY)) {
          const targetX = dragCameraStartX + moveX;
          const targetY = dragCameraStartY + moveY;
          rctRenderer.setCamera(targetX, targetY, zoom);
          if (renderer) renderer.setCamera(targetX, targetY, zoom);
        }
      } else if (renderer) {
        const zoom = renderer.getCameraZoom();
        const rect = canvas.getBoundingClientRect();
        const pixelScale = rect.width / CANVAS_WIDTH;
        const tileSizeScreen = 16.0 * zoom * pixelScale;

        if (tileSizeScreen > 0.2) {
          const dx = (e.clientX - dragStartClientX) / tileSizeScreen;
          const dy = (e.clientY - dragStartClientY) / tileSizeScreen;
          renderer.setCamera(dragCameraStartX - dx, dragCameraStartY - dy, zoom);
          if (rctRenderer) rctRenderer.setCamera(dragCameraStartX - dx, dragCameraStartY - dy, zoom);
        }
      }
    }
  }
});

window.addEventListener("mouseup", (e) => {
  if (Date.now() - lastTouchTapTime < 600) return;
  if (isMouseDown && (renderer || rctRenderer) && currentMode === "MAP") {
    const totalDist = Math.hypot(e.clientX - dragStartClientX, e.clientY - dragStartClientY);
    if (!isDragging && !isPainting && totalDist <= 5) {
      const coords = getCanvasCoords(e.clientX, e.clientY);

      // Check if mouseup landed on any active UI region before selecting on map
      let isOverUi = false;
      for (let i = activeUiRegions.length - 1; i >= 0; i--) {
        const reg = activeUiRegions[i];
        if (coords.x >= reg.x && coords.x <= reg.x + reg.w && coords.y >= reg.y && coords.y <= reg.y + reg.h) {
          isOverUi = true;
          break;
        }
      }

      if (!isOverUi && coords.inside && coords.y > 32 && coords.y < CANVAS_HEIGHT - 36) {
        const foundId = (is3DMode && rctRenderer)
          ? rctRenderer.selectAt(e.clientX, e.clientY, entities)
          : renderer.selectAt(coords.x, coords.y, entities);
        lastSelectedId = foundId;
        if (is3DMode && rctRenderer) rctRenderer.selectEntity(foundId);
        if (renderer) renderer.selectEntity(foundId);
      }
    }
  }
  isMouseDown = false;
  isDragging = false;
  isPainting = false;
  mouseButtons = 0;
});

canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  if (currentMode !== "MAP") {
    if (e.deltaY < 0) modalScroll = Math.max(0, modalScroll - 2);
    else modalScroll += 2;
    return;
  }

  if (is3DMode && rctRenderer) {
    let zoom = rctRenderer.getCameraZoom();
    // Zoom range: 0.25 (highest orbit / normZoom 0.00) to 4.0 (closest ground / normZoom 1.00)
    zoom = (e.deltaY < 0) ? Math.min(4.0, zoom * 1.15) : Math.max(0.25, zoom / 1.15);
    rctRenderer.setCamera(rctRenderer.getCameraX(), rctRenderer.getCameraY(), zoom);
    if (renderer) renderer.setCamera(rctRenderer.getCameraX(), rctRenderer.getCameraY(), zoom);
  } else if (renderer) {
    let zoom = renderer.getCameraZoom();
    const cx = renderer.getCameraX();
    const cy = renderer.getCameraY();
    zoom = (e.deltaY < 0) ? Math.min(4.0, zoom * 1.15) : Math.max(0.25, zoom / 1.15);
    renderer.setCamera(cx, cy, zoom);
    if (rctRenderer) rctRenderer.setCamera(cx, cy, zoom);
  }
}, { passive: false });

window.addEventListener("keydown", (e) => {
  keysDown.add(e.code);

  if (currentMode === "TITLE") {
    if (e.code === "Space" || e.code === "Enter") {
      e.preventDefault();
      const curScen = PREFAB_SCENARIOS[selectedScenarioIdx] || PREFAB_SCENARIOS[0];
      startNewGame(curScen.preset, curScen.seed);
      return;
    }
  }

  if (e.code === "F3" || e.code === "KeyT") {
    e.preventDefault();
    toggle3DMode();
  } else if (e.code === "F4" && is3DMode && rctRenderer) {
    e.preventDefault();
    rctRenderer.toggleWireframe();
  } else if (e.code === "F6" && is3DMode && rctRenderer) {
    e.preventDefault();
    rctRenderer.toggleShadows();
  } else if (e.code === "F7" && is3DMode && rctRenderer) {
    e.preventDefault();
    rctRenderer.toggleResolution();
  } else if (e.code === "Space") {
    e.preventDefault();
    togglePause();
  } else if (e.code === "KeyR") {
    currentMode = currentMode === "GENERATOR" ? "MAP" : "GENERATOR";
    modalScroll = 0;
  } else if (e.code === "KeyC") {
    centerCamera();
  } else if (e.code === "KeyK") {
    if (lastSelectedId > 0) {
      if (simWorker) {
        simWorker.postMessage({ type: "KILL_ENTITY", entityId: lastSelectedId });
      }
      cycleNextLivingEntity();
    }
  } else if (e.code === "KeyF") {
    toggleFollowMode();
  } else if (e.code === "KeyV") {
    toggleCreatureVisionMode();
  } else if (e.code === "Tab") {
    e.preventDefault();
    cycleNextLivingEntity();
  } else if (e.code === "KeyI") {
    currentMode = currentMode === "INSPECT" ? "MAP" : "INSPECT";
    modalScroll = 0;
  } else if (e.code === "KeyE") {
    currentMode = currentMode === "ENTITIES" ? "MAP" : "ENTITIES";
    modalScroll = 0;
  } else if (e.code === "KeyG") {
    currentMode = currentMode === "GROUPS" ? "MAP" : "GROUPS";
    modalScroll = 0;
  } else if (e.code === "KeyL") {
    currentMode = currentMode === "LOGS" ? "MAP" : "LOGS";
    modalScroll = 0;
    inspectingLogEvent = null;
  } else if (e.code === "KeyM") {
    toggle3DMode();
  } else if (e.code === "KeyS") {
    isEditorOpen = !isEditorOpen;
    if (isEditorOpen) {
      if (!editorTool) editorTool = "PAINT";
    } else {
      editorTool = null;
      editorActiveSpawner = null;
      isPainting = false;
    }
  } else if (e.code === "Escape") {
    if (isEditorOpen) {
      isEditorOpen = false;
      editorTool = null;
      editorActiveSpawner = null;
      isPainting = false;
    } else if (inspectingBattle) {
      inspectingBattle = null;
    } else if (inspectingRelationship) {
      inspectingRelationship = null;
    } else if (inspectingLogEvent) {
      inspectingLogEvent = null;
    } else if (inspectingGroup) {
      inspectingGroup = null;
    } else if (currentMode === "TITLE") {
      if (hasActiveGame) {
        currentMode = "MAP";
      }
      audio.stopInstance("menuTheme", false);
    } else if (currentMode === "GENERATOR" || currentMode === "SCENARIOS" || currentMode === "OPTIONS") {
      currentMode = hasActiveGame ? "MAP" : "TITLE";
      if (hasActiveGame) audio.stopInstance("menuTheme", false);
    } else {
      currentMode = "MAP";
      if (hasActiveGame) audio.stopInstance("menuTheme", false);
    }
  } else if (e.code === "Equal" || e.code === "NumpadAdd" || e.code === "BracketRight") {
    increaseSimSpeed();
  } else if (e.code === "Minus" || e.code === "NumpadSubtract" || e.code === "BracketLeft") {
    decreaseSimSpeed();
  } else if (e.code === "Digit1") spawnEntityAtCamera("KNIGHT");
  else if (e.code === "Digit2") spawnEntityAtCamera("ARCHER");
  else if (e.code === "Digit3") spawnEntityAtCamera("WOLF");
  else if (e.code === "Digit4") spawnEntityAtCamera("BEAR");
  else if (e.code === "Digit5") spawnEntityAtCamera("CAT");
  else if (e.code === "Digit6") spawnEntityAtCamera("GOBLIN");
  else if (e.code === "Digit7") spawnEntityAtCamera("BAT");
  else if (e.code === "Digit8") spawnEntityAtCamera("SERPENT");
  else if (e.code === "Digit9") spawnEntityAtCamera("DRAGON");
});

window.addEventListener("keyup", (e) => {
  keysDown.delete(e.code);
});

function handleCameraKeys(dt) {
  // Disabled by user request: "setas e wasd estão completamente descalibrados, deixe amovimentação apenas via mouse/touch mesmo."
  return;
}

// ---------------------------------------------------------------------------
// Pure Rectangular NES Boxes & UI Helpers
// ---------------------------------------------------------------------------

function drawNESBox(x, y, w, h) {
  ctx.save();
  ctx.fillStyle = "#000000";
  ctx.fillRect(x, y, w, h);

  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  ctx.restore();
}

function drawNESButton(x, y, w, h, text, isSelected = false, isDanger = false) {
  const isHover = mouseX >= x && mouseX <= x + w && mouseY >= y && mouseY <= y + h;

  ctx.save();
  ctx.fillStyle = isDanger ? (isHover ? "#880000" : "#000000") : (isHover ? "#222222" : "#000000");
  ctx.fillRect(x, y, w, h);

  ctx.strokeStyle = isSelected ? "#f8b800" : (isHover ? "#ffffff" : (isDanger ? "#e40058" : "#7c7c7c"));
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);

  const textCol = isDanger ? "#ff6060" : (isSelected || isHover ? "#f8b800" : "#ffffff");
  const prefix = isSelected || isHover ? "▶" : "";
  const fullText = `${prefix}${text}`;
  const textWidth = fullText.length * 8;
  const tx = Math.floor(x + (w - textWidth) / 2);
  const ty = Math.floor(y + (h - 8) / 2);

  drawText8x8(fullText, tx, ty, textCol, 1);
  ctx.restore();
}

function drawNESProgressBar(x, y, w, h, val, max, label, color = "#58d854") {
  const pct = Math.max(0, Math.min(1, max > 0 ? val / max : 0));
  ctx.save();

  ctx.fillStyle = "#000000";
  ctx.fillRect(x, y, w, h);

  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);

  if (pct > 0) {
    ctx.fillStyle = color;
    ctx.fillRect(x + 3, y + 3, (w - 6) * pct, h - 6);
  }

  // Label in 8x8 font
  drawText8x8(label, x + 6, y + Math.floor((h - 8) / 2), "#ffffff", 1);

  const valStr = `${Math.round(val)}/${Math.round(max)}`;
  const valWidth = valStr.length * 8;
  drawText8x8(valStr, x + w - valWidth - 6, y + Math.floor((h - 8) / 2), "#f8b800", 1);

  ctx.restore();
}

// ---------------------------------------------------------------------------
// 1. Top HUD Bar & Bottom Action Toolbar (Embedded Font)
// ---------------------------------------------------------------------------

function renderTopHudBar() {
  if (!world) return;
  const clock = world.clock;
  const isMobile = CANVAS_WIDTH <= 680;

  drawNESBox(0, 0, CANVAS_WIDTH, 34);

  if (!isMobile) {
    // Desktop layout
    drawText8x8("BRUTOPOLIS CHRONICLES", 8, 13, "#f8b800", 1);

    const timeStr = `D${String(clock.day).padStart(2, "0")} ${String(clock.hour).padStart(2, "0")}:${String(clock.minute).padStart(2, "0")}`;
    drawText8x8(timeStr, 188, 13, "#ffffff", 1);

    drawText8x8(`${currentFps}FPS ${measuredTps}TPS`, 276, 13, "#bcbcbc", 1);

    // MENU / TITLE Button
    drawNESButton(CANVAS_WIDTH - 64, 5, 56, 24, "MENU", false, false);
    registerClickableRegion(CANVAS_WIDTH - 64, 5, 56, 24, returnToTitleScreen);

    // OPTIONS Button
    const isOptAct = currentMode === "OPTIONS";
    drawNESButton(CANVAS_WIDTH - 150, 5, 80, 24, "OPTIONS", isOptAct, false);
    registerClickableRegion(CANVAS_WIDTH - 150, 5, 80, 24, () => {
      currentMode = currentMode === "OPTIONS" ? "MAP" : "OPTIONS";
      modalScroll = 0;
    });

    if (is3DMode && rctRenderer) {
      const wireMode = rctRenderer.getWireframeModeName ? rctRenderer.getWireframeModeName() : (rctRenderer.isWireframe ? "ON" : "OFF");
      const wireTxt = "WIRE:" + wireMode;
      const isWireActive = wireMode !== "OFF";
      drawNESButton(CANVAS_WIDTH - 230, 5, 74, 24, wireTxt, isWireActive, false);
      registerClickableRegion(CANVAS_WIDTH - 230, 5, 74, 24, () => rctRenderer.toggleWireframe());
    }
  } else {
    // Mobile responsive top bar
    const timeStr = `D${clock.day} ${String(clock.hour).padStart(2, "0")}:${String(clock.minute).padStart(2, "0")}`;
    drawText8x8(timeStr, 8, 13, "#ffffff", 1);
    const rawZMob = is3DMode && rctRenderer ? rctRenderer.zoom : (renderer ? renderer.zoom : 1.0);
    const curNormZoomMob = is3DMode && rctRenderer
      ? Math.max(0.0, Math.min(1.0, (rawZMob - 0.08) / (5.0 - 0.08)))
      : Math.max(0.0, Math.min(1.0, (rawZMob - 0.3) / (2.5 - 0.3)));
    drawText8x8(`Z:${curNormZoomMob.toFixed(2)}`, 74, 13, "#a0e040", 1);
    drawText8x8(`${currentFps}F ${measuredTps}T`, 100, 13, "#888888", 1);

    let topBtnX = CANVAS_WIDTH - 44;
    drawNESButton(topBtnX, 5, 38, 24, "MENU", false, false);
    registerClickableRegion(topBtnX, 5, 38, 24, returnToTitleScreen);
    topBtnX -= 42;

    const modeTxt = is3DMode ? "3D" : "2D";
    drawNESButton(topBtnX, 5, 38, 24, modeTxt, is3DMode, false);
    registerClickableRegion(topBtnX, 5, 38, 24, toggle3DMode);
    topBtnX -= 42;

    const isOptAct = currentMode === "OPTIONS";
    drawNESButton(topBtnX, 5, 38, 24, "OPT", isOptAct, false);
    registerClickableRegion(topBtnX, 5, 38, 24, () => {
      currentMode = currentMode === "OPTIONS" ? "MAP" : "OPTIONS";
      modalScroll = 0;
    });
    topBtnX -= 46;

    if (is3DMode && rctRenderer) {
      const fullWorldActive = rctRenderer.isFullWorldMode ? rctRenderer.isFullWorldMode() : false;
      const fullTxt = fullWorldActive ? "FULL" : "CHUNK";
      drawNESButton(topBtnX, 5, 42, 24, fullTxt, fullWorldActive, false);
      registerClickableRegion(topBtnX, 5, 42, 24, () => rctRenderer.toggleFullWorld());
      topBtnX -= 46;

      const resMode = rctRenderer.getResolutionName ? rctRenderer.getResolutionName() : "100%";
      const isResActive = resMode !== "100%";
      drawNESButton(topBtnX, 5, 42, 24, resMode, isResActive, false);
      registerClickableRegion(topBtnX, 5, 42, 24, () => rctRenderer.toggleResolution());
      topBtnX -= 46;

      const wireMode = rctRenderer.getWireframeModeName ? rctRenderer.getWireframeModeName() : (rctRenderer.isWireframe ? "ON" : "OFF");
      const isWireActive = wireMode !== "OFF";
      drawNESButton(topBtnX, 5, 42, 24, "WIRE", isWireActive, false);
      registerClickableRegion(topBtnX, 5, 42, 24, () => rctRenderer.toggleWireframe());
    }
  }
}

function renderBottomToolbar() {
  const isMobile = CANVAS_WIDTH <= 680;
  const barH = isMobile ? 42 : 36;
  drawNESBox(0, CANVAS_HEIGHT - barH, CANVAS_WIDTH, barH);

  if (!isMobile) {
    const buttons = [
      { label: "DOSSIER", mode: "INSPECT" },
      { label: "ENTITIES", mode: "ENTITIES" },
      { label: "GROUPS", mode: "GROUPS" },
      { label: "LOGS", mode: "LOGS" },
      {
        label: "EDITOR",
        isEditorBtn: true,
        action: () => {
          isEditorOpen = !isEditorOpen;
          if (isEditorOpen) {
            if (!editorTool) editorTool = "PAINT";
          } else {
            editorTool = null;
            editorActiveSpawner = null;
            isPainting = false;
          }
        }
      },
      {
        label: "MAP",
        isMapBtn: true,
        action: () => {
          toggle3DMode();
        }
      }
    ];

    let btnX = 8;
    for (const b of buttons) {
      const isAct = b.isEditorBtn ? isEditorOpen : b.isMapBtn ? !is3DMode : currentMode === b.mode;
      const bw = b.label.length * 8 + 18;
      drawNESButton(btnX, CANVAS_HEIGHT - 30, bw, 24, b.label, isAct, false);

      const targetMode = b.mode;
      const targetAction = b.action;
      registerClickableRegion(btnX, CANVAS_HEIGHT - 30, bw, 24, () => {
        if (targetAction) {
          targetAction();
        } else if (targetMode) {
          currentMode = currentMode === targetMode ? "MAP" : targetMode;
          modalScroll = 0;
          inspectingLogEvent = null;
        }
      });

      btnX += bw + 6;
    }

    // Simulation Speed / Time Control Interface
    const timeCtlX = btnX + 16;
    drawNESButton(timeCtlX, CANVAS_HEIGHT - 30, 20, 24, "-", false, false);
    registerClickableRegion(timeCtlX, CANVAS_HEIGHT - 30, 20, 24, decreaseSimSpeed);

    const speedStr = `${simSpeed}X (${Math.round(60 * simSpeed)}TPS)`;
    drawText8x8(speedStr, timeCtlX + 26, CANVAS_HEIGHT - 22, "#f8b800", 1);
    registerClickableRegion(timeCtlX + 26, CANVAS_HEIGHT - 30, speedStr.length * 8 + 4, 24, cycleSimSpeed);

    const plusX = timeCtlX + 32 + speedStr.length * 8;
    drawNESButton(plusX, CANVAS_HEIGHT - 30, 20, 24, "+", false, false);
    registerClickableRegion(plusX, CANVAS_HEIGHT - 30, 20, 24, increaseSimSpeed);

    // RUN / PAUSE Button
    const pauseBtnX = plusX + 26;
    const pauseTxt = isPaused ? "PAUSE" : "RUN";
    drawNESButton(pauseBtnX, CANVAS_HEIGHT - 30, 56, 24, pauseTxt, !isPaused, isPaused);
    registerClickableRegion(pauseBtnX, CANVAS_HEIGHT - 30, 56, 24, togglePause);

    // Coordinates [X, Y] on bottom right
    if (world) {
      const hoverTile = getEditorHoverTile();
      const coordStr = `[${Math.floor(hoverTile.x)}, ${Math.floor(hoverTile.y)}]`;
      drawText8x8(coordStr, CANVAS_WIDTH - coordStr.length * 8 - 14, CANVAS_HEIGHT - 22, "#58d854", 1);
    }
  } else {
    // Mobile Navigation Bar (5 thumb-friendly tabs)
    const mobTabs = [
      { label: "DOSSIER", mode: "INSPECT" },
      { label: "ENTITIES", mode: "ENTITIES" },
      { label: "CLANS", mode: "GROUPS" },
      { label: "LOGS", mode: "LOGS" },
      {
        label: "EDIT",
        isEditorBtn: true,
        action: () => {
          isEditorOpen = !isEditorOpen;
          if (isEditorOpen) {
            if (!editorTool) editorTool = "PAINT";
          } else {
            editorTool = null;
            editorActiveSpawner = null;
            isPainting = false;
          }
        }
      }
    ];

    const tabCount = mobTabs.length;
    const tabW = Math.floor((CANVAS_WIDTH - 12 - (tabCount - 1) * 4) / tabCount);
    let curX = 6;

    for (const b of mobTabs) {
      const isAct = b.isEditorBtn ? isEditorOpen : currentMode === b.mode;
      drawNESButton(curX, CANVAS_HEIGHT - 36, tabW, 30, b.label, isAct, false);

      const targetMode = b.mode;
      const targetAction = b.action;
      registerClickableRegion(curX, CANVAS_HEIGHT - 36, tabW, 30, () => {
        if (targetAction) {
          targetAction();
        } else if (targetMode) {
          currentMode = currentMode === targetMode ? "MAP" : targetMode;
          modalScroll = 0;
          inspectingLogEvent = null;
        }
      });
      curX += tabW + 4;
    }

    // Floating mobile time speed pill (only when playing on map)
    if (currentMode === "MAP" && !isEditorOpen) {
      const pillW = 164;
      const pillX = CANVAS_WIDTH - pillW - 8;
      const pillY = CANVAS_HEIGHT - 74;
      drawNESBox(pillX, pillY, pillW, 28);

      drawNESButton(pillX + 4, pillY + 3, 22, 22, "-", false, false);
      registerClickableRegion(pillX + 4, pillY + 3, 22, 22, decreaseSimSpeed);

      const speedTxt = `${simSpeed}X`;
      drawText8x8(speedTxt, pillX + 32, pillY + 10, "#f8b800", 1);
      registerClickableRegion(pillX + 30, pillY + 3, 30, 22, cycleSimSpeed);

      drawNESButton(pillX + 62, pillY + 3, 22, 22, "+", false, false);
      registerClickableRegion(pillX + 62, pillY + 3, 22, 22, increaseSimSpeed);
      const pTxt = isPaused ? "PAUSE" : "RUN";
      drawNESButton(pillX + 90, pillY + 3, 68, 22, pTxt, !isPaused, isPaused);
      registerClickableRegion(pillX + 90, pillY + 3, 68, 22, togglePause);
    }
  }
}

function getHouseForEntity(entId) {
  if (!entId) return null;
  if (_dossierCache.targetId === entId && _dossierCache.house !== undefined && _dossierCache.house !== null) {
    return _dossierCache.house;
  }
  let found = null;
  for (const e of entities) {
    if (!e.destroyed && e.properties?.house && (e.properties.house.ownerId === entId || e.properties.house.partnerId === entId)) {
      found = e;
      break;
    }
  }
  if (!found && entityRegistry) {
    for (const e of entityRegistry.values()) {
      if (e.properties?.house && (e.properties.house.ownerId === entId || e.properties.house.partnerId === entId)) {
        found = e;
        break;
      }
    }
  }
  if (_dossierCache.targetId === entId) {
    _dossierCache.house = found;
  }
  return found;
}

function getFamilyTreeData(targetId) {
  if (_dossierCache.targetId === targetId && _dossierCache.familyTree) {
    return _dossierCache.familyTree;
  }
  const target = getEntityById(targetId) || (entityRegistry ? entityRegistry.get(targetId) : null);
  if (!target) return null;
  const props = target.properties || {};

  const getEnt = (id) => id ? (getEntityById(id) || (entityRegistry ? entityRegistry.get(id) : null)) : null;

  // Parents
  const fatherId = props.fatherId !== undefined ? props.fatherId : props.life?.fatherId;
  const motherId = props.motherId !== undefined ? props.motherId : props.life?.motherId;
  const father = getEnt(fatherId);
  const mother = getEnt(motherId);

  // Grandparents
  const fProps = father?.properties || {};
  const mProps = mother?.properties || {};
  const patGrandpa = getEnt(fProps.fatherId !== undefined ? fProps.fatherId : fProps.life?.fatherId);
  const patGrandma = getEnt(fProps.motherId !== undefined ? fProps.motherId : fProps.life?.motherId);
  const matGrandpa = getEnt(mProps.fatherId !== undefined ? mProps.fatherId : mProps.life?.fatherId);
  const matGrandma = getEnt(mProps.motherId !== undefined ? mProps.motherId : mProps.life?.motherId);

  // Partner
  const partnerId = props.monogamy?.partnerId;
  const partner = getEnt(partnerId);

  // Siblings (share either father or mother, excluding self)
  const siblings = [];
  const checkedSibIds = new Set([targetId]);
  if (entityRegistry) {
    for (const ent of entityRegistry.values()) {
      if (ent.id === targetId) continue;
      const eP = ent.properties || {};
      const eF = eP.fatherId !== undefined ? eP.fatherId : eP.life?.fatherId;
      const eM = eP.motherId !== undefined ? eP.motherId : eP.life?.motherId;
      if ((fatherId && eF === fatherId) || (motherId && eM === motherId)) {
        if (!checkedSibIds.has(ent.id)) {
          checkedSibIds.add(ent.id);
          siblings.push(ent);
        }
      }
    }
  }

  // Children
  const childrenIds = props.life?.childrenIds || [];
  const children = [];
  const checkedChildIds = new Set();
  for (const cid of childrenIds) {
    const c = getEnt(cid);
    if (c && !checkedChildIds.has(cid)) {
      checkedChildIds.add(cid);
      children.push(c);
    }
  }
  if (entityRegistry) {
    for (const ent of entityRegistry.values()) {
      if (checkedChildIds.has(ent.id)) continue;
      const eP = ent.properties || {};
      const eF = eP.fatherId !== undefined ? eP.fatherId : eP.life?.fatherId;
      const eM = eP.motherId !== undefined ? eP.motherId : eP.life?.motherId;
      if (eF === targetId || eM === targetId) {
        checkedChildIds.add(ent.id);
        children.push(ent);
      }
    }
  }

  // Grandchildren
  const grandchildren = [];
  const checkedGChildIds = new Set();
  for (const child of children) {
    const gIds = child.properties?.life?.childrenIds || [];
    for (const gid of gIds) {
      const gc = getEnt(gid);
      if (gc && !checkedGChildIds.has(gid)) {
        checkedGChildIds.add(gid);
        grandchildren.push({ entity: gc, parentName: child.properties?.name || `Child #${child.id}` });
      }
    }
  }

  const res = {
    target,
    father,
    mother,
    patGrandpa,
    patGrandma,
    matGrandpa,
    matGrandma,
    partner,
    siblings,
    children,
    grandchildren
  };
  if (_dossierCache.targetId === targetId) {
    _dossierCache.familyTree = res;
  }
  return res;
}

function renderFamilyTab(mx, my, mw, mh, target) {
  const treeData = getFamilyTreeData(target.id);
  if (!treeData) return;

  const contentY = my + 62;
  const contentH = (my + mh - 12) - contentY;
  drawNESBox(mx + 10, contentY, mw - 20, contentH);

  const sections = [];

  const currentPartner = treeData.partner;

  // 1. Marriage / Partnership
  const partnerList = [];
  if (currentPartner) {
    partnerList.push({ role: "CURRENT PARTNER / SPOUSE", ent: currentPartner });
  }
  if (partnerList.length > 0) {
    sections.push({ title: "MARRIAGE & PARTNERSHIP", members: partnerList });
  }

  // 2. Extramarital Affairs / Lovers
  const affairs = [];
  const knownAffs = Object.entries(target.properties?.brain?.affinities || {});
  for (const [oIdStr, val] of knownAffs) {
    const oId = parseInt(oIdStr, 10);
    if (currentPartner && oId === currentPartner.id) continue;
    if (val >= 60 && target.properties?.monogamy) {
      const oEnt = entityRegistry.get(oId);
      if (oEnt && !oEnt.destroyed) {
        affairs.push({ role: "LOVER / AFFAIR", ent: oEnt });
      }
    }
  }
  if (affairs.length > 0) {
    sections.push({ title: "EXTRAMARITAL AFFAIRS & LOVERS", members: affairs });
  }

  // 3. Ex-Partners / Separations
  const exPartners = [];
  if (exPartners.length > 0) {
    sections.push({ title: "EX-PARTNERS & SEPARATIONS", members: exPartners });
  }

  // 4. Children (Legitimate vs Bastards)
  const legitimate = [];
  const bastards = [];
  for (const child of treeData.children) {
    const fId = child.properties?.life?.fatherId;
    const mId = child.properties?.life?.motherId;

    if (currentPartner) {
      if (fId === currentPartner.id || mId === currentPartner.id) {
        legitimate.push({ role: "LEGITIMATE CHILD", ent: child });
      } else {
        bastards.push({ role: "BASTARD CHILD", ent: child });
      }
    } else {
      legitimate.push({ role: "CHILD", ent: child });
    }
  }

  if (legitimate.length > 0) {
    sections.push({ title: `LEGITIMATE OFFSPRING (${legitimate.length})`, members: legitimate });
  }
  if (bastards.length > 0) {
    sections.push({ title: `BASTARD CHILDREN (${bastards.length})`, members: bastards });
  }

  // 5. Parents
  const parents = [];
  if (treeData.father) parents.push({ role: "FATHER", ent: treeData.father });
  if (treeData.mother) parents.push({ role: "MOTHER", ent: treeData.mother });
  if (parents.length > 0) {
    sections.push({ title: "PARENTS (GENERATION -1)", members: parents });
  }

  // 6. Siblings
  const siblings = [];
  for (const sib of treeData.siblings) {
    siblings.push({ role: "SIBLING", ent: sib });
  }
  if (siblings.length > 0) {
    sections.push({ title: `SIBLINGS (${siblings.length})`, members: siblings });
  }

  // 7. Grandparents
  const grandparents = [];
  if (treeData.patGrandpa) grandparents.push({ role: "PATERNAL GRANDFATHER", ent: treeData.patGrandpa });
  if (treeData.patGrandma) grandparents.push({ role: "PATERNAL GRANDMOTHER", ent: treeData.patGrandma });
  if (treeData.matGrandpa) grandparents.push({ role: "MATERNAL GRANDFATHER", ent: treeData.matGrandpa });
  if (treeData.matGrandma) grandparents.push({ role: "MATERNAL GRANDMOTHER", ent: treeData.matGrandma });
  if (grandparents.length > 0) {
    sections.push({ title: "GRANDPARENTS (ANCESTORS - GEN -2)", members: grandparents });
  }

  // 8. Grandchildren
  if (treeData.grandchildren.length > 0) {
    const gEntries = treeData.grandchildren.map(gc => ({ role: `GRANDCHILD`, ent: gc.entity }));
    sections.push({ title: `GRANDCHILDREN (${treeData.grandchildren.length})`, members: gEntries });
  }

  // Flatten for scrolling
  const flatItems = [];
  for (const s of sections) {
    flatItems.push({ type: "HEADER", title: s.title });
    for (const m of s.members) {
      flatItems.push({ type: "MEMBER", data: m });
    }
  }

  const rowH = 26;
  const visibleRows = Math.floor((contentH - 24) / rowH);
  const maxScroll = Math.max(0, flatItems.length - visibleRows);
  modalScroll = Math.max(0, Math.min(maxScroll, modalScroll));

  let curY = contentY + 12;
  for (let i = modalScroll; i < Math.min(flatItems.length, modalScroll + visibleRows); i++) {
    const item = flatItems[i];
    if (item.type === "HEADER") {
      drawText8x8(`▼ ${item.title}`, mx + 20, curY + 6, "#ffd700", 1);
    } else {
      const m = item.data;
      const ent = m.ent;
      const isAlive = ent && !ent.destroyed && ent.properties?.life?.energy > 0;
      const statusBadge = isAlive ? "[ALIVE]" : "[DECEASED]";
      const statusCol = isAlive ? "#58d854" : "#9c5050";

      const clanName = (ent.properties?.group?.name || "SOLITARY").toUpperCase();
      const entName = (ent.properties?.name || `CREATURE #${ent.id}`).toUpperCase();
      const roleBadge = `[${m.role}]`;

      const isHover = mouseX >= mx + 16 && mouseX <= mx + mw - 16 && mouseY >= curY && mouseY <= curY + rowH;
      const isSelected = ent.id === target.id;

      if (isSelected || isHover) {
        ctx.fillStyle = isSelected ? "#222244" : "#181828";
        ctx.fillRect(mx + 16, curY, mw - 32, rowH - 2);
      }

      const cursorPrefix = isSelected || isHover ? "▶" : "•";
      const nameCol = isSelected ? "#ffd700" : (isAlive ? "#ffffff" : "#9c5050");

      const lineStr = `${cursorPrefix} ${roleBadge} ${entName} • CLAN: [${clanName}] • ${statusBadge}`;
      const actionWidth = isAlive ? 165 : 85;
      const maxChars = Math.floor((mw - 36 - actionWidth) / 8);
      drawText8x8(lineStr.slice(0, maxChars), mx + 24, curY + 6, nameCol, 1);

      const curId = ent.id;

      // INSPECT Button
      const inspectBtnX = isAlive ? mx + mw - 165 : mx + mw - 85;
      drawNESButton(inspectBtnX, curY + 1, 75, 20, "INSPECT", false, false);
      registerClickableRegion(inspectBtnX, curY + 1, 75, 20, () => {
        lastSelectedId = curId;
        dossierTab = "OVERVIEW";
        modalScroll = 0;
      });

      // FOCUS Button (for living members)
      if (isAlive) {
        drawNESButton(mx + mw - 85, curY + 1, 75, 20, "FOCUS", false, false);
        registerClickableRegion(mx + mw - 85, curY + 1, 75, 20, () => {
          focusEntityAndFollow(ent);
        });
      }

      // Click row to inspect directly
      registerClickableRegion(mx + 16, curY, mw - actionWidth - 20, rowH - 2, () => {
        lastSelectedId = curId;
        dossierTab = "OVERVIEW";
        modalScroll = 0;
      });
    }

    curY += rowH;
  }
}

/**
 * Graphical, interactive, visual family tree with hierarchical generational nodes and connectors
 */
function renderGraphicalFamilyTreeTab(mx, my, mw, mh, target) {
  const treeData = getFamilyTreeData(target.id);
  if (!treeData) return;

  const contentY = my + 62;
  const contentH = (my + mh - 12) - contentY;
  drawNESBox(mx + 10, contentY, mw - 20, contentH);

  drawText8x8("FAMILY PEDIGREE (CLICK NODE TO RE-CENTER):", mx + 20, contentY + 10, "#ffd700", 1);

  // Zoom Controls Bar at Top Right of Box
  const zoomPct = Math.round(familyTreeZoom * 100);
  drawNESButton(mx + mw - 235, contentY + 6, 36, 20, "[-]", false, false);
  registerClickableRegion(mx + mw - 235, contentY + 6, 36, 20, () => {
    familyTreeZoom = Math.max(0.4, Number((familyTreeZoom - 0.15).toFixed(2)));
  });

  drawNESButton(mx + mw - 195, contentY + 6, 36, 20, "[+]", false, false);
  registerClickableRegion(mx + mw - 195, contentY + 6, 36, 20, () => {
    familyTreeZoom = Math.min(2.5, Number((familyTreeZoom + 0.15).toFixed(2)));
  });

  drawNESButton(mx + mw - 155, contentY + 6, 125, 20, `RESET (${zoomPct}%)`, false, false);
  registerClickableRegion(mx + mw - 155, contentY + 6, 125, 20, () => {
    familyTreeZoom = 1.0;
    familyTreePanX = 0;
    familyTreePanY = 0;
  });

  const cardW = 160;
  const cardH = 50;
  const tierGap = 75;
  const startTierY = contentY + 45 - modalScroll * 25;
  const centerX = mx + mw / 2;

  // Clip view to inner box
  ctx.save();
  ctx.beginPath();
  ctx.rect(mx + 12, contentY + 28, mw - 24, contentH - 32);
  ctx.clip();

  // Apply Panning and Zooming Transform centered on the tree
  ctx.translate(centerX + familyTreePanX, contentY + 40 + familyTreePanY);
  ctx.scale(familyTreeZoom, familyTreeZoom);
  ctx.translate(-centerX, -(contentY + 40));

  const drawNodeCard = (cx, cy, ent, role, isTarget = false, isPartner = false) => {
    if (!ent) return;

    const isAlive = !ent.destroyed && ent.properties?.life?.energy > 0;

    // Transform coordinates back to screen space for hover and clicking
    const scrX = (centerX + familyTreePanX) + (cx - centerX) * familyTreeZoom;
    const scrY = (contentY + 40 + familyTreePanY) + (cy - (contentY + 40)) * familyTreeZoom;
    const scrW = cardW * familyTreeZoom;
    const scrH = cardH * familyTreeZoom;

    const isHover = mouseX >= scrX && mouseX <= scrX + scrW && mouseY >= scrY && mouseY <= scrY + scrH;

    ctx.save();
    ctx.fillStyle = isTarget ? "#1e1e38" : (isHover ? "#242440" : "#121220");
    ctx.fillRect(cx, cy, cardW, cardH);

    ctx.strokeStyle = isTarget ? "#ffd700" : (isPartner ? "#ff60a0" : (isHover ? "#3cbcfc" : (isAlive ? "#58d854" : "#9c5050")));
    ctx.lineWidth = isTarget || isHover ? 2 : 1;
    ctx.strokeRect(cx, cy, cardW, cardH);

    // Role Tag
    drawText8x8(`[${role}]`, cx + 6, cy + 6, isTarget ? "#ffd700" : (isPartner ? "#ff60a0" : "#3cbcfc"), 1);

    // Name (Red if deceased, White/Gold if alive)
    const nameCol = isTarget ? "#ffd700" : (isAlive ? "#ffffff" : "#9c5050");
    const nameStr = (ent.properties?.name || `CREATURE #${ent.id}`).toUpperCase();
    const maxChars = Math.floor((cardW - 12) / 8);
    drawText8x8(nameStr.slice(0, maxChars), cx + 6, cy + 20, nameCol, 1);

    // Clan & Status
    const statusBadge = isAlive ? "[ALIVE]" : "[DEAD]";
    const statusCol = isAlive ? "#58d854" : "#9c5050";
    drawText8x8(statusBadge, cx + 6, cy + 34, statusCol, 1);

    const clanStr = (ent.properties?.group?.name || "SOLITARY").slice(0, 8).toUpperCase();
    drawText8x8(`CLAN:${clanStr}`, cx + 58, cy + 34, "#bcbcbc", 1);

    ctx.restore();

    const curId = ent.id;
    // Register transformed clickable region on screen
    registerClickableRegion(scrX, scrY, scrW, scrH, () => {
      lastSelectedId = curId;
      modalScroll = 0;
    });
  };

  const drawConnectorLine = (x1, y1, x2, y2, color = "#606080") => {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    const midY = (y1 + y2) / 2;
    ctx.lineTo(x1, midY);
    ctx.lineTo(x2, midY);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.restore();
  };

  // 1. Tier -2: Grandparents
  const tierGPY = startTierY;
  const gpSlots = [
    { ent: treeData.patGrandpa, role: "PAT. GRANDFATHER" },
    { ent: treeData.patGrandma, role: "PAT. GRANDMOTHER" },
    { ent: treeData.matGrandpa, role: "MAT. GRANDFATHER" },
    { ent: treeData.matGrandma, role: "MAT. GRANDMOTHER" }
  ].filter(g => !!g.ent);

  if (gpSlots.length > 0) {
    const totalGPW = gpSlots.length * (cardW + 16) - 16;
    let curX = centerX - totalGPW / 2;
    for (const g of gpSlots) {
      drawNodeCard(curX, tierGPY, g.ent, g.role);
      curX += cardW + 16;
    }
  }

  // 2. Tier -1: Parents
  const tierParentsY = tierGPY + (gpSlots.length > 0 ? tierGap : 0);
  const pSlots = [
    { ent: treeData.father, role: "FATHER" },
    { ent: treeData.mother, role: "MOTHER" }
  ].filter(p => !!p.ent);

  const parentX1 = centerX - cardW - 16;
  const parentX2 = centerX + 16;

  if (treeData.father) {
    drawNodeCard(parentX1, tierParentsY, treeData.father, "FATHER");
  }
  if (treeData.mother) {
    drawNodeCard(parentX2, tierParentsY, treeData.mother, "MOTHER");
  }
  if (treeData.father && treeData.mother) {
    // Connector line between parents
    ctx.save();
    ctx.strokeStyle = "#ffd700";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(parentX1 + cardW, tierParentsY + cardH / 2);
    ctx.lineTo(parentX2, tierParentsY + cardH / 2);
    ctx.stroke();
    drawText8x8("❤️", centerX - 6, tierParentsY + cardH / 2 - 4, "#ff60a0", 1);
    ctx.restore();
  }

  // 3. Tier 0: Subject Generation (Subject, Spouse, Siblings)
  const tierSubjectY = tierParentsY + (pSlots.length > 0 ? tierGap : 0);

  // Line from parents down to Subject
  if (pSlots.length > 0) {
    drawConnectorLine(centerX, tierParentsY + cardH, centerX, tierSubjectY, "#ffd700");
  }

  const subjCards = [];
  subjCards.push({ ent: treeData.target, role: "SUBJECT", isTarget: true });
  if (treeData.partner) subjCards.push({ ent: treeData.partner, role: "SPOUSE", isPartner: true });
  for (const sib of treeData.siblings) {
    subjCards.push({ ent: sib, role: "SIBLING" });
  }

  const totalSubjW = subjCards.length * (cardW + 16) - 16;
  let curSubjX = centerX - totalSubjW / 2;
  for (const sc of subjCards) {
    drawNodeCard(curSubjX, tierSubjectY, sc.ent, sc.role, sc.isTarget, sc.isPartner);
    if (sc.isTarget && treeData.partner) {
      // Spouse link
      drawText8x8("💍", curSubjX + cardW + 2, tierSubjectY + cardH / 2 - 4, "#ffd700", 1);
    }
    curSubjX += cardW + 16;
  }

  // 4. Tier +1: Children
  if (treeData.children.length > 0) {
    const tierChildrenY = tierSubjectY + tierGap;
    const totalChildW = treeData.children.length * (cardW + 14) - 14;
    let curChildX = centerX - totalChildW / 2;

    drawConnectorLine(centerX, tierSubjectY + cardH, centerX, tierChildrenY, "#58d854");

    for (const c of treeData.children) {
      drawNodeCard(curChildX, tierChildrenY, c, "CHILD");
      curChildX += cardW + 14;
    }

    // 5. Tier +2: Grandchildren
    if (treeData.grandchildren.length > 0) {
      const tierGCY = tierChildrenY + tierGap;
      const totalGCW = treeData.grandchildren.length * (cardW + 12) - 12;
      let curGCX = centerX - totalGCW / 2;

      drawConnectorLine(centerX, tierChildrenY + cardH, centerX, tierGCY, "#3cbcfc");

      for (const gc of treeData.grandchildren) {
        drawNodeCard(curGCX, tierGCY, gc.entity, "GRANDCHILD");
        curGCX += cardW + 12;
      }
    }
  }

  ctx.restore();
}

/**
 * Dedicated Past Owners & Structure History Tab for Houses
 */
function renderPastOwnersTab(mx, my, mw, mh, target) {
  const props = target.properties || {};
  const house = props.house;
  if (!house) return;

  const contentY = my + 62;
  const contentH = (my + mh - 12) - contentY;
  drawNESBox(mx + 10, contentY, mw - 20, contentH);

  drawText8x8("PAST RESIDENTS & TENANCY CHRONICLE FOR THIS STRUCTURE:", mx + 20, contentY + 12, "#ffd700", 1);

  // Top Section: Current Floor Occupants
  const floors = house.floors || [];
  let curY = contentY + 32;

  drawText8x8("CURRENT RESIDENT FAMILIES (BY FLOOR):", mx + 20, curY, "#3cbcfc", 1);
  curY += 16;

  for (const fl of floors) {
    const flOwner = fl.ownerId ? (getEntityById(fl.ownerId) || entityRegistry?.get(fl.ownerId)) : null;
    const flPartner = fl.partnerId ? (getEntityById(fl.partnerId) || entityRegistry?.get(fl.partnerId)) : null;
    const oName = flOwner?.properties?.name ? flOwner.properties.name.toUpperCase() : (fl.ownerId ? `#${fl.ownerId}` : "VACANT");
    const pName = flPartner?.properties?.name ? ` & ${flPartner.properties.name.toUpperCase()}` : "";

    const flBadge = `[${fl.label || `FLOOR ${fl.floorNumber}`}]`;
    drawText8x8(`${flBadge}: ${oName}${pName}`, mx + 24, curY + 4, flOwner ? "#ffffff" : "#888888", 1);

    if (flOwner) {
      const oId = fl.ownerId;
      drawNESButton(mx + mw - 100, curY, 80, 18, "INSPECT", false, false);
      registerClickableRegion(mx + mw - 100, curY, 80, 18, () => {
        lastSelectedId = oId;
        dossierTab = "OVERVIEW";
        modalScroll = 0;
      });
    }

    curY += 22;
  }

  curY += 12;
  drawText8x8("HISTORICAL PAST OWNERS & FORMER RESIDENTS:", mx + 20, curY, "#ffd700", 1);
  curY += 16;

  const pastOwners = house.pastOwners || [];
  if (pastOwners.length === 0) {
    drawText8x8("NO FORMER RESIDENTS RECORDED. FOUNDED BY CURRENT OCCUPANTS.", mx + 24, curY + 10, "#bcbcbc", 1);
  } else {
    for (let i = modalScroll; i < pastOwners.length; i++) {
      if (curY > contentY + contentH - 24) break;
      const po = pastOwners[i];
      const pEnt = entityRegistry?.get(po.ownerId) || getEntityById(po.ownerId);
      const isAlive = pEnt && !pEnt.destroyed && pEnt.properties?.life?.energy > 0;
      const statusCol = isAlive ? "#58d854" : "#9c5050";

      const timeStr = `[D${po.startDay || 0} - D${po.endDay || "NOW"}]`;
      const nameStr = (po.ownerName || `OWNER #${po.ownerId}`).toUpperCase();
      const reasonStr = `(${po.reason || "DECEASED"})`;

      drawText8x8(timeStr, mx + 24, curY + 4, "#bcbcbc", 1);
      drawText8x8(nameStr, mx + 160, curY + 4, statusCol, 1);
      drawText8x8(reasonStr, mx + 380, curY + 4, "#d3869b", 1);

      if (po.ownerId) {
        const pId = po.ownerId;
        drawNESButton(mx + mw - 100, curY, 80, 18, "INSPECT", false, false);
        registerClickableRegion(mx + mw - 100, curY, 80, 18, () => {
          lastSelectedId = pId;
          dossierTab = "OVERVIEW";
          modalScroll = 0;
        });
      }

      curY += 22;
    }
  }
}

// ---------------------------------------------------------------------------
// 2. In-Engine Modal 1: Biological Dossier Screen ([I])
// ---------------------------------------------------------------------------

function renderDossierModal() {
  const isMobile = CANVAS_WIDTH <= 680;
  const mx = isMobile ? 6 : 40;
  const my = isMobile ? 36 : 40;
  const mw = isMobile ? CANVAS_WIDTH - 12 : CANVAS_WIDTH - 80;
  const mh = isMobile ? CANVAS_HEIGHT - 44 : CANVAS_HEIGHT - 86;

  ctx.save();
  ctx.fillStyle = "rgba(0, 0, 0, 0.9)";
  ctx.fillRect(0, 32, CANVAS_WIDTH, CANVAS_HEIGHT - 68);

  drawNESBox(mx, my, mw, mh);

  // Close X Button: Always returns to MAP
  drawNESButton(mx + mw - 32, my + 6, 26, 24, "X", false, true);
  registerClickableRegion(mx + mw - 32, my + 6, 26, 24, () => {
    currentMode = "MAP";
    inspectingLogEvent = null;
    inspectingGroup = null;
    inspectingFromCreature = false;
  });

  // Modal Sub-Views
  if (inspectingLogEvent) {
    renderLogDetailView(mx, my, mw, mh, inspectingLogEvent);
    ctx.restore();
    return;
  }

  if (inspectingBattle) {
    renderBattleDetailView(mx, my, mw, mh, inspectingBattle);
    ctx.restore();
    return;
  }

  if (inspectingRelationship) {
    renderRelationshipModal(mx, my, mw, mh, inspectingRelationship);
    ctx.restore();
    return;
  }

  const target = getEntityById(lastSelectedId) || entityRegistry.get(lastSelectedId);

  if (!target) {
    drawText8x8("NO CREATURE SELECTED", mx + 20, my + 30, "#f8b800", 1);
    drawText8x8("CLICK ON MAP OR PRESS [TAB] TO SELECT.", mx + 20, my + 50, "#ffffff", 1);
    ctx.restore();
    return;
  }

  const props = target.properties || {};
  const name = (props.name || `ENTITY #${target.id}`).toUpperCase();
  const species = (props.species || "UNKNOWN").toUpperCase();
  const groupName = (props.group?.name || "SOLITARY").toUpperCase();

  // Title
  drawText8x8(`DOSSIER: ${name} (#${target.id})`, mx + 16, my + 14, "#f8b800", 1);

  // Action Buttons
  if (!target.destroyed) {
    drawNESButton(mx + mw - 195, my + 6, 75, 24, "FOCUS", false, false);
    registerClickableRegion(mx + mw - 195, my + 6, 75, 24, () => {
      focusEntityAndFollow(target);
    });

    drawNESButton(mx + mw - 112, my + 6, 75, 24, "KILL", false, true);
    registerClickableRegion(mx + mw - 112, my + 6, 75, 24, () => {
      if (simWorker) {
        simWorker.postMessage({ type: "KILL_ENTITY", entityId: target.id });
      }
      cycleNextLivingEntity();
    });
  }

  // Invalidate cache fully if inspected target changed
  if (_dossierCache.targetId !== target.id) {
    _dossierCache.targetId = target.id;
    _dossierCache.events = null;
    _dossierCache.battles = null;
    _dossierCache.familyTree = null;
    _dossierCache.house = null;
    _dossierCache.lastEventCount = allEvents.length;
    _dossierCache.lastBattlesCount = 0;
    _dossierCache.lastEventsCount = 0;
  } else if (allEvents.length - _dossierCache.lastEventCount >= 100) {
    // Throttled refresh: only re-query battles/events every 100+ new world events
    _dossierCache.events = null;
    _dossierCache.battles = null;
    _dossierCache.lastEventCount = allEvents.length;
  }

  // Calculate Tab Counts (Lightweight & Cached)
  const isHouse = !!props.house;
  const isCreature = !!props.life || !!props.brain;
  const knownAffinities = Object.entries(props.brain?.affinities || {});

  // Modal Tabs Bar
  const tabs = [
    { id: "OVERVIEW", label: "OVERVIEW" },
    ...(isHouse ? [{ id: "PAST_OWNERS", label: `PAST OWNERS (${props.house.pastOwners?.length || 0})` }] : []),
    ...(isCreature ? [
      { id: "FAMILY", label: "FAMILY" },
      { id: "TREE", label: "FAMILY TREE" },
      { id: "AFFINITIES", label: `AFFINITIES (${knownAffinities.length})` },
      { id: "BATTLES", label: `BATTLES${_dossierCache.lastBattlesCount ? ` (${_dossierCache.lastBattlesCount})` : ""}` }
    ] : []),
    { id: "CHRONICLE", label: `CHRONICLE${_dossierCache.lastEventsCount ? ` (${_dossierCache.lastEventsCount})` : ""}` }
  ];

  let tabX = mx + 16;
  for (const t of tabs) {
    const isAct = dossierTab === t.id;
    const tabW = t.label.length * 8 + 14;
    drawNESButton(tabX, my + 36, tabW, 22, t.label, isAct, false);
    registerClickableRegion(tabX, my + 36, tabW, 22, () => {
      dossierTab = t.id;
      modalScroll = 0;
    });
    tabX += tabW + 6;
  }

  // ---------------------------------------------------------------------------
  // TAB 1: OVERVIEW
  // ---------------------------------------------------------------------------
  if (dossierTab === "OVERVIEW") {
    // 1. Top Summary Info Box
    const topBoxH = isHouse ? 86 : 66;
    drawNESBox(mx + 10, my + 62, mw - 20, topBoxH);

    // Interactive Clickable Species Link
    const speciesLabel = `SPECIES: [${species}]`;
    const isSpeciesHover = mouseX >= mx + 20 && mouseX <= mx + 20 + speciesLabel.length * 8 && mouseY >= my + 66 && mouseY <= my + 80;
    drawText8x8(speciesLabel, mx + 20, my + 70, isSpeciesHover ? "#58d854" : "#3cbcfc", 1);
    registerClickableRegion(mx + 20, my + 66, speciesLabel.length * 8, 14, () => {
      speciesFilter = (props.species || "").toLowerCase();
      entityFilter = "SPECIES";
      currentMode = "ENTITIES";
      modalScroll = 0;
    });

    // Interactive Clickable Clan Link
    const hasClan = !!props.group;
    const clanLabel = hasClan ? `CLAN: [${groupName}]` : `CLAN: ${groupName}`;
    const isClanHover = hasClan && mouseX >= mx + 240 && mouseX <= mx + 240 + clanLabel.length * 8 && mouseY >= my + 66 && mouseY <= my + 80;
    drawText8x8(clanLabel, mx + 240, my + 70, isClanHover ? "#ffd700" : "#d3869b", 1);
    if (hasClan) {
      registerClickableRegion(mx + 240, my + 66, clanLabel.length * 8, 14, () => {
        inspectingGroup = props.group;
        groupDetailTab = "ZONES";
        currentMode = "GROUPS";
        modalScroll = 0;
      });
    }

    drawText8x8(`POS: [${Math.floor(target.x)},${Math.floor(target.y)}]`, mx + 490, my + 70, "#f8b800", 1);

    const isAlive = !target.destroyed && props.life && props.life.energy > 0;
    const statusTxt = isHouse ? (props.house.isCompleted ? "STATUS: BUILT" : "STATUS: UNDER CONSTRUCTION") : (isAlive ? "STATUS: LIVE" : "STATUS: DECEASED");
    const statusCol = isHouse ? "#3cbcfc" : (isAlive ? "#58d854" : "#f83800");
    drawText8x8(statusTxt, mx + 20, my + 86, statusCol, 1);
    drawText8x8(`PROPERTIES: ${Object.keys(props).length}`, mx + 240, my + 86, "#bcbcbc", 1);

    const domains = [];
    if (props.terrestrial) domains.push("TERRESTRIAL");
    if (props.aquatic) domains.push("AQUATIC");
    if (props.flying) domains.push("FLYING");
    const domainStr = domains.length > 0 ? domains.join("+") : (isHouse ? "STRUCTURE" : "STATIC");
    drawText8x8(`DOMAIN: ${domainStr}`, mx + 440, my + 86, "#58d854", 1);

    // Row 3: House Link (for creatures) OR Architecture & Floor Summary (for houses/structures)
    if (isHouse) {
      const hFootprint = props.house.footprint || "2x1";
      const hFloorsCount = props.house.maxFloors || props.house.floors?.length || 2;
      const hYard = props.house.yard?.type || "Courtyard & Garden";
      drawText8x8(`ARCH: ${hFloorsCount}-STORY (${hFootprint}) | YARD: ${hYard.toUpperCase()}`, mx + 20, my + 102, "#ffd700", 1);

      // Floor 1 & 2 quick inspection tags
      const f1 = props.house.floors?.[0];
      const f2 = props.house.floors?.[1];
      const f1Owner = f1?.ownerId ? (getEntityById(f1.ownerId) || entityRegistry?.get(f1.ownerId)) : null;
      const f2Owner = f2?.ownerId ? (getEntityById(f2.ownerId) || entityRegistry?.get(f2.ownerId)) : null;

      const f1Name = f1Owner?.properties?.name ? `1F: ${f1Owner.properties.name.toUpperCase()}` : "1F: VACANT";
      const f2Name = f2Owner?.properties?.name ? `2F: ${f2Owner.properties.name.toUpperCase()}` : (hFloorsCount >= 2 ? "2F: VACANT" : "");

      drawText8x8(f1Name, mx + 20, my + 118, f1Owner ? "#58d854" : "#888888", 1);
      if (f1Owner) {
        registerClickableRegion(mx + 20, my + 116, f1Name.length * 8, 14, () => {
          lastSelectedId = f1.ownerId;
          dossierTab = "OVERVIEW";
          modalScroll = 0;
        });
      }

      if (f2Name) {
        drawText8x8(f2Name, mx + 240, my + 118, f2Owner ? "#58d854" : "#888888", 1);
        if (f2Owner) {
          registerClickableRegion(mx + 240, my + 116, f2Name.length * 8, 14, () => {
            lastSelectedId = f2.ownerId;
            dossierTab = "OVERVIEW";
            modalScroll = 0;
          });
        }
      }
    } else {
      // Inspecting a Creature: Look up Assigned Private House
      const house = getHouseForEntity(target.id);
      if (house) {
        const houseName = (house.properties?.name || "HOUSE").toUpperCase();
        const isOwner = house.properties?.house?.ownerId === target.id;
        const roleTag = isOwner ? "OWNER" : "RESIDENT";
        const housePos = `[X:${Math.floor(house.x)}, Y:${Math.floor(house.y)}]`;
        const houseLabel = `HOUSE: [${houseName} (${roleTag}) at ${housePos}]`;
        const isHHover = mouseX >= mx + 20 && mouseX <= mx + 20 + houseLabel.length * 8 && mouseY >= my + 100 && mouseY <= my + 116;

        drawText8x8(houseLabel, mx + 20, my + 102, isHHover ? "#ffd700" : "#58d854", 1);
        const hId = house.id;
        registerClickableRegion(mx + 20, my + 100, houseLabel.length * 8, 16, () => {
          lastSelectedId = hId;
          dossierTab = "OVERVIEW";
          modalScroll = 0;
        });
      } else {
        drawText8x8("HOUSE: NONE (HOMELESS / NOMAD)", mx + 20, my + 102, "#888888", 1);
      }
    }

    const lineageY = isHouse ? my + 154 : my + 132;
    drawNESBox(mx + 10, lineageY, mw - 20, 56);

    // Perks & Traits / Structure stats
    if (isHouse) {
      const struct = props.structure || {};
      drawText8x8("STRUCTURE METRICS & MATERIALS:", mx + 20, lineageY + 8, "#f8b800", 1);
      drawText8x8(`CONDITION: ${struct.condition || 0}/${struct.maxCondition || 10000}`, mx + 20, lineageY + 30, "#58d854", 1);
      drawText8x8(`DEFENSE: ${struct.defense || 80}`, mx + 260, lineageY + 30, "#3cbcfc", 1);
      drawText8x8(`STORAGE: ${props.house.foodStorage?.length || 0} FOOD ITEMS`, mx + 460, lineageY + 30, "#ffd700", 1);
    } else {
      const perks = [];
      if (props.skeptic) perks.push("SKEPTIC");
      if (props.gullible) perks.push("GULLIBLE");
      if (props.schizophrenic) perks.push("SCHIZOPHRENIC");
      if (props.liar) perks.push(props.liar.type === "believer" ? "BELIEVER" : "LIAR");

      const orientStr = props.homosexual ? "HOMOSEXUAL" : props.bisexual ? "BISEXUAL" : "HETEROSEXUAL";
      const orientCol = props.homosexual ? "#ff60a0" : props.bisexual ? "#d3869b" : "#3cbcfc";

      drawText8x8("FAMILY & LINEAGE:", mx + 20, lineageY + 8, "#f8b800", 1);
      drawText8x8(`ORIENTATION: ${orientStr}`, mx + 180, lineageY + 8, orientCol, 1);
      if (perks.length > 0) {
        drawText8x8(`PERKS: [${perks.join(" | ")}]`, mx + 420, lineageY + 8, "#ffd700", 1);
      }

      // Father
      const fatherId = props.fatherId !== undefined ? props.fatherId : props.life?.fatherId;
      if (fatherId !== null && fatherId !== undefined) {
        const father = entityRegistry.get(fatherId);
        const fName = (father?.properties?.name || `Entity #${fatherId}`).toUpperCase().slice(0, 14);
        drawText8x8("FATHER:", mx + 20, lineageY + 30, "#bcbcbc", 1);
        drawNESButton(mx + 80, lineageY + 24, 130, 22, fName, false, false);
        registerClickableRegion(mx + 80, lineageY + 24, 130, 22, () => {
          lastSelectedId = fatherId;
          modalScroll = 0;
        });
      } else {
        drawText8x8("FATHER: Deus ex machina", mx + 20, lineageY + 30, "#7c7c7c", 1);
      }

      // Mother
      const motherId = props.motherId !== undefined ? props.motherId : props.life?.motherId;
      if (motherId !== null && motherId !== undefined) {
        const mother = entityRegistry.get(motherId);
        const mName = (mother?.properties?.name || `Entity #${motherId}`).toUpperCase().slice(0, 14);
        drawText8x8("MOTHER:", mx + 230, lineageY + 30, "#bcbcbc", 1);
        drawNESButton(mx + 290, lineageY + 24, 130, 22, mName, false, false);
        registerClickableRegion(mx + 290, lineageY + 24, 130, 22, () => {
          lastSelectedId = motherId;
          modalScroll = 0;
        });
      } else {
        drawText8x8("MOTHER: Deus ex machina", mx + 230, lineageY + 30, "#7c7c7c", 1);
      }

      // Partner
      const partnerId = props.monogamy?.partnerId;
      if (partnerId) {
        const partner = entityRegistry.get(partnerId);
        const pName = (partner?.properties?.name || `Entity #${partnerId}`).toUpperCase().slice(0, 10);
        drawText8x8("PARTNER:", mx + 435, lineageY + 30, "#bcbcbc", 1);
        drawNESButton(mx + 498, lineageY + 24, 90, 22, pName, false, false);
        registerClickableRegion(mx + 498, lineageY + 24, 90, 22, () => {
          lastSelectedId = partnerId;
          modalScroll = 0;
        });
        drawNESButton(mx + 592, lineageY + 24, 75, 22, "RELATION", false, false);
        registerClickableRegion(mx + 592, lineageY + 24, 75, 22, () => {
          const rel = getRelationshipSummary(target.id, partnerId, entityRegistry);
          if (rel) {
            inspectingRelationship = rel;
          }
        });
      } else {
        drawText8x8("PARTNER: Single", mx + 435, lineageY + 30, "#7c7c7c", 1);
      }
    }

    // 3. Vital Gauges
    let gaugeY = lineageY + 62;
    if (props.brain && typeof props.brain.condition === "number") {
      drawNESProgressBar(mx + 10, gaugeY, mw - 20, 16, props.brain.condition, props.brain.maxCondition || 100, `VITAL HP (BRAIN INTEGRITY): ${Math.round(props.brain.condition)}/${props.brain.maxCondition || 100}`, "#f83800");
      gaugeY += 20;
    }

    if (props.life) {
      const isSleeping = props.life.isSleeping;
      const sleepTag = isSleeping ? " [ASLEEP - RECOVERING]" : "";
      drawNESProgressBar(mx + 10, gaugeY, mw - 20, 16, props.life.energy, props.life.max || 100, `METABOLIC ENERGY: ${Math.round(props.life.energy)}/${props.life.max || 100}${sleepTag}`, isSleeping ? "#3cbcfc" : "#58d854");
      gaugeY += 20;
    }

    if (props.stomach) {
      const fatUnits = props.stomach.fatUnits || 0;
      const maxFat = props.stomach.maxFatUnits || 6;
      drawNESProgressBar(mx + 10, gaugeY, mw - 20, 16, fatUnits, maxFat, `BODY FAT RESERVES: ${fatUnits}/${maxFat} UNITS (AWAKE BACKUP)`, "#e4c858");
      gaugeY += 20;
    }

    if (props.heart && typeof props.heart.condition === "number") {
      drawNESProgressBar(mx + 10, gaugeY, mw - 20, 16, props.heart.condition, props.heart.maxCondition || 100, `HEART CONDITION: ${Math.round(props.heart.condition)}%`, "#e6194b");
      gaugeY += 20;
    }

    if (props.liver && typeof props.liver.condition === "number") {
      drawNESProgressBar(mx + 10, gaugeY, mw - 20, 16, props.liver.condition, props.liver.maxCondition || 100, `LIVER CONDITION: ${Math.round(props.liver.condition)}%`, "#9a6324");
      gaugeY += 20;
    }

    if (props.bladder) {
      drawNESProgressBar(mx + 10, gaugeY, mw - 20, 16, props.bladder.water, props.bladder.maxWater, "WATER BLADDER", "#0078f8");
      gaugeY += 20;
    }

    if (props.brain && typeof props.brain.mood === "number") {
      const moodVal = props.brain.mood;
      const moodCol = moodVal >= 25 ? "#58d854" : moodVal >= -20 ? "#3cbcfc" : "#f83800";
      drawNESProgressBar(mx + 10, gaugeY, mw - 20, 16, moodVal + 100, 200, `MOOD: ${getMoodLabel(moodVal).toUpperCase()}`, moodCol);
      gaugeY += 20;
    }

    // 4. Raw Memory Property Dump Box
    const dumpY = gaugeY + 4;
    const dumpH = (my + mh - 12) - dumpY;
    drawNESBox(mx + 10, dumpY, mw - 20, dumpH);

    const lines = [];
    lines.push("--- RAW MEMORY PROPERTY BAG ---");

    for (const [k, v] of Object.entries(props)) {
      if (typeof v === "object" && v !== null) {
        lines.push(`+ [${k.toUpperCase()}]:`);
        for (const [subk, subv] of Object.entries(v)) {
          if (typeof subv === "function") lines.push(`   ${subk.toUpperCase()}: (FN)`);
          else if (Array.isArray(subv)) lines.push(`   ${subk.toUpperCase()}: [${subv.length}]`);
          else if (typeof subv === "object" && subv !== null) lines.push(`   ${subk.toUpperCase()}: (OBJ)`);
          else lines.push(`   ${subk.toUpperCase()}: ${subv}`);
        }
      } else {
        lines.push(`+ ${k.toUpperCase()}: ${v}`);
      }
    }

    const rowH = 16;
    const visibleLines = Math.floor((dumpH - 24) / rowH);
    const maxScroll = Math.max(0, lines.length - visibleLines);
    modalScroll = Math.max(0, Math.min(maxScroll, modalScroll));

    let curY = dumpY + 12;
    for (let i = modalScroll; i < Math.min(lines.length, modalScroll + visibleLines); i++) {
      const line = lines[i];
      const col = line.startsWith("+ [") ? "#ffd700" : line.startsWith("---") ? "#3cbcfc" : "#ffffff";
      drawText8x8(line.slice(0, Math.floor((mw - 36) / 8)), mx + 16, curY, col, 1);
      curY += rowH;
    }
  }

  // ---------------------------------------------------------------------------
  // TAB 2: PAST OWNERS (For Structure / House)
  // ---------------------------------------------------------------------------
  else if (dossierTab === "PAST_OWNERS") {
    renderPastOwnersTab(mx, my, mw, mh, target);
  }

  // ---------------------------------------------------------------------------
  // TAB 3: FAMILY (Pedigree List)
  // ---------------------------------------------------------------------------
  else if (dossierTab === "FAMILY") {
    renderFamilyTab(mx, my, mw, mh, target);
  }

  // ---------------------------------------------------------------------------
  // TAB 4: FAMILY TREE (Graphical Visual Tree)
  // ---------------------------------------------------------------------------
  else if (dossierTab === "TREE") {
    renderGraphicalFamilyTreeTab(mx, my, mw, mh, target);
  }

  // ---------------------------------------------------------------------------
  // TAB 5: AFFINITIES (Known living & deceased creatures)
  // ---------------------------------------------------------------------------
  else if (dossierTab === "AFFINITIES") {
    const listY = my + 62;
    const listH = mh - 72;
    drawNESBox(mx + 10, listY, mw - 20, listH);

    if (knownAffinities.length === 0) {
      drawText8x8("NO KNOWN CREATURE AFFINITIES IN MEMORY.", mx + 24, listY + 24, "#bcbcbc", 1);
    } else {
      const rowH = 26;
      const visibleRows = Math.floor((listH - 20) / rowH);
      const maxScroll = Math.max(0, knownAffinities.length - visibleRows);
      modalScroll = Math.max(0, Math.min(maxScroll, modalScroll));

      let curY = listY + 12;
      for (let i = modalScroll; i < Math.min(knownAffinities.length, modalScroll + visibleRows); i++) {
        const [otherIdStr, affVal] = knownAffinities[i];
        const otherId = parseInt(otherIdStr, 10);
        const other = entityRegistry.get(otherId);

        const isHover = mouseX >= mx + 12 && mouseX <= mx + mw - 12 && mouseY >= curY && mouseY <= curY + rowH;
        if (isHover) {
          ctx.fillStyle = "#181828";
          ctx.fillRect(mx + 12, curY, mw - 24, rowH);
        }

        const isOtherAlive = other && !other.destroyed && other.properties?.life?.energy > 0;
        const statusBadge = isOtherAlive ? "[ALIVE]" : "[DEAD]";
        const statusCol = isOtherAlive ? "#58d854" : "#9c5050";
        drawText8x8(statusBadge, mx + 20, curY + 6, statusCol, 1);

        const oName = (other?.properties?.name || `Entity #${otherId}`).slice(0, 20);
        drawText8x8(oName, mx + 85, curY + 6, isOtherAlive ? "#ffffff" : "#9c5050", 1);

        // Relationship badge
        const isPartner = props.monogamy?.partnerId === otherId;
        let relBadge = isPartner ? "LOVER" : affVal >= 60 ? "CLOSE FRIEND" : affVal >= 20 ? "FRIEND" : affVal <= -50 ? "ENEMY" : affVal <= -15 ? "RIVAL" : "NEUTRAL";
        let relCol = isPartner ? "#ff60a0" : affVal >= 20 ? "#58d854" : affVal <= -15 ? "#f83800" : "#bcbcbc";
        drawText8x8(relBadge, mx + 260, curY + 6, relCol, 1);

        // Affinity bar
        drawNESProgressBar(mx + 410, curY + 2, 160, 18, affVal + 100, 200, `AFF: ${Math.round(affVal)}`, relCol);

        // Inspect Creature Button
        drawNESButton(mx + mw - 175, curY + 2, 70, 20, "INSPECT", false, false);
        registerClickableRegion(mx + mw - 175, curY + 2, 70, 20, () => {
          lastSelectedId = otherId;
          dossierTab = "OVERVIEW";
          modalScroll = 0;
        });

        // Relationship Dossier Button (Opens in-depth mutual history & interactions between the two)
        drawNESButton(mx + mw - 100, curY + 2, 85, 20, "RELATION", false, false);
        registerClickableRegion(mx + mw - 100, curY + 2, 85, 20, () => {
          const rel = getRelationshipSummary(target.id, otherId, entityRegistry);
          if (rel) {
            inspectingRelationship = rel;
          }
        });

        // Click whole row to inspect target directly
        registerClickableRegion(mx + 12, curY, mw - 185, rowH, () => {
          lastSelectedId = otherId;
          dossierTab = "OVERVIEW";
          modalScroll = 0;
        });

        curY += rowH;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // TAB: BATTLES (Creature Personal Combat & War Dossier)
  // ---------------------------------------------------------------------------
  else if (dossierTab === "BATTLES") {
    if (!_dossierCache.battles) {
      _dossierCache.battles = isCreature ? getClusteredBattles({ entityId: target.id, limit: 100 }) : [];
      _dossierCache.lastBattlesCount = _dossierCache.battles.length;
    }
    const creatureBattles = _dossierCache.battles;

    const listY = my + 62;
    const listH = mh - 72;
    drawNESBox(mx + 10, listY, mw - 20, listH);

    if (creatureBattles.length === 0) {
      drawText8x8("NO COMBAT BATTLES OR SKIRMISHES RECORDED FOR THIS CREATURE.", mx + 24, listY + 24, "#bcbcbc", 1);
    } else {
      const rowH = 34;
      const visibleRows = Math.floor((listH - 20) / rowH);
      const maxScroll = Math.max(0, creatureBattles.length - visibleRows);
      modalScroll = Math.max(0, Math.min(maxScroll, modalScroll));

      let curY = listY + 12;
      for (let i = modalScroll; i < Math.min(creatureBattles.length, modalScroll + visibleRows); i++) {
        const battle = creatureBattles[i];
        const isHover = mouseX >= mx + 12 && mouseX <= mx + mw - 12 && mouseY >= curY && mouseY <= curY + rowH;
        if (isHover) {
          ctx.fillStyle = "#1e1828";
          ctx.fillRect(mx + 12, curY, mw - 24, rowH - 2);
        }

        const ts = battle.timestamp ? `D${battle.timestamp.day} ${String(battle.timestamp.hour).padStart(2, "0")}:${String(battle.timestamp.minute).padStart(2, "0")}` : `T${battle.startTick}`;
        drawText8x8(ts, mx + 18, curY + 5, "#bcbcbc", 1);
        drawText8x8(`[BATTLE #${battle.id}]`, mx + 110, curY + 5, "#f83800", 1);

        const battleHeader = `${battle.name} • [${battle.combatants.length} FIGHTERS • ${Math.round(battle.totalDamage)} DMG]`;
        drawText8x8(battleHeader.slice(0, Math.floor((mw - 380) / 8)), mx + 245, curY + 5, "#ffd700", 1);

        const causeShort = `TRIGGER: ${battle.triggerCause}`.slice(0, Math.floor((mw - 380) / 8));
        drawText8x8(causeShort, mx + 245, curY + 18, "#bcbcbc", 1);

        const curBattle = battle;
        // Click row to inspect battle
        registerClickableRegion(mx + 12, curY, mw - 110, rowH, () => {
          inspectingBattle = curBattle;
        });

        drawNESButton(mx + mw - 95, curY + 4, 75, 22, "DOSSIER", false, false);
        registerClickableRegion(mx + mw - 95, curY + 4, 75, 22, () => {
          inspectingBattle = curBattle;
        });

        registerClickableRegion(mx + 12, curY, mw - 110, rowH - 2, () => {
          inspectingBattle = curBattle;
        });

        curY += rowH;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // TAB 6: CHRONICLE (Creature Life Chronicle - Full Long Descriptions)
  // ---------------------------------------------------------------------------
  else if (dossierTab === "CHRONICLE") {
    if (!_dossierCache.events) {
      _dossierCache.events = getFullHistoryForEntity(target.id);
      _dossierCache.lastEventsCount = _dossierCache.events.length;
    }
    const creatureEvents = _dossierCache.events;

    const listY = my + 62;
    const listH = mh - 72;
    drawNESBox(mx + 10, listY, mw - 20, listH);

    if (creatureEvents.length === 0) {
      drawText8x8("NO WORLD EVENTS RECORDED INVOLVING THIS CREATURE.", mx + 24, listY + 24, "#bcbcbc", 1);
    } else {
      const rowH = 34; // Expanded row height for multi-line readable long descriptions
      const visibleRows = Math.floor((listH - 20) / rowH);
      const maxScroll = Math.max(0, creatureEvents.length - visibleRows);
      modalScroll = Math.max(0, Math.min(maxScroll, modalScroll));

      let curY = listY + 10;
      for (let i = modalScroll; i < Math.min(creatureEvents.length, modalScroll + visibleRows); i++) {
        const ev = creatureEvents[i];
        const isHover = mouseX >= mx + 12 && mouseX <= mx + mw - 12 && mouseY >= curY && mouseY <= curY + rowH;

        if (isHover) {
          ctx.fillStyle = "#181828";
          ctx.fillRect(mx + 12, curY, mw - 24, rowH);

          const actorId = ev.primaryEntityId !== null && ev.primaryEntityId !== undefined ? ev.primaryEntityId : (ev.metadata?.attackerId || ev.metadata?.killerId || ev.metadata?.primaryId);
          const targetId = ev.secondaryEntityId !== null && ev.secondaryEntityId !== undefined ? ev.secondaryEntityId : (ev.metadata?.targetId || ev.metadata?.victimId || ev.metadata?.secondaryId);
          const actorName = ev.metadata?.attackerName || ev.metadata?.primaryName || (actorId ? (entityRegistry?.get(actorId)?.properties?.name || `Entity #${actorId}`) : null);
          const targetName = ev.metadata?.targetName || ev.metadata?.victimName || ev.metadata?.secondaryName || (targetId ? (entityRegistry?.get(targetId)?.properties?.name || `Entity #${targetId}`) : null);

          const tipLines = [
            `Type: [${ev.type}] (Event #${ev.id})`,
            `Time: Day ${ev.timestamp?.day || 0} at ${String(ev.timestamp?.hour || 0).padStart(2, "0")}:${String(ev.timestamp?.minute || 0).padStart(2, "0")} (Tick ${ev.tick})`,
            ev.location ? `Coordinates: [X: ${Math.floor(ev.location.x)}, Y: ${Math.floor(ev.location.y)}]` : "Coordinates: Global / Ambient",
            actorName ? `Actor/Attacker: ${actorName}${actorId !== null && actorId !== undefined ? ` (ID: #${actorId})` : ""}` : (actorId !== null && actorId !== undefined ? `Actor ID: #${actorId}` : null),
            targetName ? `Target/Victim: ${targetName}${targetId !== null && targetId !== undefined ? ` (ID: #${targetId})` : ""}` : (targetId !== null && targetId !== undefined ? `Target ID: #${targetId}` : null),
            ev.metadata?.hitPartName ? `Hit: ${ev.metadata.hitPartName} (${Math.round(ev.metadata.totalDamage || ev.metadata.netDamage || 0)} DMG)` : null,
            ev.metadata?.causedByBattleId ? `Succumbed to Battle #${ev.metadata.causedByBattleId} Wounds` : null
          ].filter(Boolean);
          setHoverTooltip(`Creature Event #${ev.id}`, tipLines);
        }

        const ts = ev.timestamp ? `D${ev.timestamp.day} ${String(ev.timestamp.hour).padStart(2, "0")}:${String(ev.timestamp.minute).padStart(2, "0")}` : `T${ev.tick}`;
        drawText8x8(ts, mx + 18, curY + 6, "#bcbcbc", 1);

        const typeColor = ev.type === "KILL" ? "#ff2040" : ev.type === "DEATH" ? "#9c5050" : ev.type === "ATTACK" ? "#f8b800" : ev.type === "AMPUTATION" ? "#e40058" : ev.type === "RELATION" ? "#d3869b" : ev.type === "DIALOGUE" ? "#3cbcfc" : ev.type === "BIRTH" ? "#f8b800" : ev.type === "SPROUT" ? "#58d854" : ev.type === "POLITICS" ? "#9c5050" : "#ffffff";
        drawText8x8(`[${ev.type}]`, mx + 105, curY + 6, typeColor, 1);

        // Full Long Description without truncation
        const fullDesc = ev.description || "Event";
        const maxCharsPerLine = Math.floor((mw - 380) / 8);
        if (fullDesc.length <= maxCharsPerLine) {
          drawText8x8(fullDesc, mx + 200, curY + 11, "#ffffff", 1);
        } else {
          const line1 = fullDesc.slice(0, maxCharsPerLine);
          const line2 = fullDesc.slice(maxCharsPerLine, maxCharsPerLine * 2 + 10);
          drawText8x8(line1, mx + 200, curY + 4, "#ffffff", 1);
          drawText8x8(line2, mx + 200, curY + 17, "#d0d0e0", 1);
        }

        // Click row to inspect
        const curEv = ev;
        registerClickableRegion(mx + 12, curY, mw - 180, rowH, () => {
          inspectingLogEvent = curEv;
          inspectingFromCreature = true;
        });

        // MAP Jump
        if (ev.location) {
          drawNESButton(mx + mw - 165, curY + 6, 45, 20, "MAP", false, false);
          registerClickableRegion(mx + mw - 165, curY + 6, 45, 20, () => {
            if (renderer) {
              renderer.setCamera(ev.location.x, ev.location.y, renderer.getCameraZoom());
              currentMode = "MAP";
            }
          });
        }

        // INSPECT Detail
        drawNESButton(mx + mw - 110, curY + 6, 90, 20, "INSPECT", false, false);
        registerClickableRegion(mx + mw - 110, curY + 6, 90, 20, () => {
          inspectingLogEvent = curEv;
          inspectingFromCreature = true;
        });

        curY += rowH;
      }
    }
  }

  ctx.restore();
}

// ---------------------------------------------------------------------------
// 3. In-Engine Modal 2: Entities Registry Screen ([E])
// ---------------------------------------------------------------------------

function getFilteredEntities() {
  if (
    _entitiesFilterCache.filter === entityFilter &&
    _entitiesFilterCache.speciesFilter === speciesFilter &&
    _entitiesFilterCache.entityCount === entities.length
  ) {
    return _entitiesFilterCache.list;
  }

  const result = entities.filter(e => {
    if (e.destroyed) return false;
    if (entityFilter === "SPECIES") {
      return (e.properties?.species || "").toLowerCase() === speciesFilter.toLowerCase();
    }
    if (entityFilter === "COLONISTS") {
      return !e.properties.edible && e.properties.species !== "item" && !!e.properties.life && (
        !!e.properties.group || !!e.properties.role || !!e.properties.group_member || !!e.properties.surname ||
        e.properties.species === "human" || e.properties.species === "elf" || e.properties.species === "dwarf" || e.properties.species === "orc" || e.properties.species === "goblin"
      );
    }
    if (entityFilter === "BEASTS") {
      return !e.properties.edible && e.properties.species !== "item" && !!e.properties.life && !e.properties.group && (
        e.properties.species === "wolf" || e.properties.species === "bear" || e.properties.species === "boar" || e.properties.species === "deer" ||
        e.properties.species === "spider" || e.properties.species === "cat" || e.properties.species === "goat" || e.properties.species === "dragon" ||
        e.properties.species === "bat" || e.properties.species === "scorpion" || e.properties.species === "lizard" || e.properties.species === "serpent"
      );
    }
    if (entityFilter === "CORPSES") {
      return e.properties.species === "corpse" || !!e.properties.corpse || (e.properties.name?.includes("Corpo") || e.properties.name?.includes("Esqueleto"));
    }
    if (entityFilter === "BUILDINGS") {
      return e.properties.species === "structure" || !!e.properties.structure || !!e.properties.house || !!e.properties.warehouse || !!e.properties.slaughterhouse || !!e.properties.kitchen || !!e.properties.isWell || !!e.properties.well || !!e.properties.campfire || !!e.properties.door;
    }
    if (entityFilter === "FOOD & MEALS") {
      return !!e.properties.edible || e.properties.resourceType === "meat" || e.properties.resourceType === "food" || (e.properties.name?.includes("Marmita") || e.properties.name?.includes("Assada") || e.properties.name?.includes("Grelhado") || e.properties.name?.includes("Carne") || e.properties.name?.includes("Fruit"));
    }
    if (entityFilter === "EQUIP") {
      return e.properties.resourceType === "basket" || e.properties.resourceType === "backpack" || !!e.properties.container || !!e.properties.basket || !!e.properties.backpack || !!e.properties.attackBonus || !!e.properties.isWeapon || !!e.properties.torch;
    }
    if (entityFilter === "FLORA") {
      return !!e.properties.photosynthesis || !!e.properties.deep_root || e.properties.species === "oak" || e.properties.species === "willow" || e.properties.species === "pine" || e.properties.species === "cactus" || e.properties.species === "shrub" || e.properties.species === "water_lily" || e.properties.species === "seaweed";
    }
    if (entityFilter === "ITEMS") {
      return !!e.properties.resourceType || !!e.properties.germination || e.properties.species === "item" || (!e.properties.life && !e.properties.structure);
    }
    if (entityFilter === "LIVING") {
      return !!e.properties.life && e.properties.species !== "item" && e.properties.species !== "corpse";
    }
    return true;
  });

  _entitiesFilterCache.filter = entityFilter;
  _entitiesFilterCache.speciesFilter = speciesFilter;
  _entitiesFilterCache.entityCount = entities.length;
  _entitiesFilterCache.list = result;
  return result;
}

function renderEntitiesModal() {
  const isMobile = CANVAS_WIDTH <= 680;
  const mx = isMobile ? 6 : 30;
  const my = isMobile ? 36 : 40;
  const mw = isMobile ? CANVAS_WIDTH - 12 : CANVAS_WIDTH - 60;
  const mh = isMobile ? CANVAS_HEIGHT - 44 : CANVAS_HEIGHT - 86;

  ctx.save();
  ctx.fillStyle = "rgba(0, 0, 0, 0.9)";
  ctx.fillRect(0, 32, CANVAS_WIDTH, CANVAS_HEIGHT - 68);

  drawNESBox(mx, my, mw, mh);

  // Close X Button: Always returns to MAP
  drawNESButton(mx + mw - 32, my + 6, 26, 24, "X", false, true);
  registerClickableRegion(mx + mw - 32, my + 6, 26, 24, () => {
    currentMode = "MAP";
    inspectingLogEvent = null;
    inspectingGroup = null;
    inspectingFromCreature = false;
  });

  const list = getFilteredEntities();
  const titleStr = (entityFilter === "SPECIES" && speciesFilter)
    ? `ENTITIES: SPECIES [${speciesFilter.toUpperCase()}] (${list.length})`
    : `ENTITIES (${list.length})`;
  drawText8x8(titleStr, mx + 16, my + 14, "#f8b800", 1);

  // Expanded Filter Buttons
  const baseFilters = ["ALL", "COLONISTS", "BEASTS", "CORPSES", "BUILDINGS", "FOOD & MEALS", "EQUIP", "FLORA", "ITEMS"];
  const filters = (entityFilter === "SPECIES" && speciesFilter)
    ? [`SPECIES: ${speciesFilter.toUpperCase()}`, ...baseFilters]
    : baseFilters;

  let fx = mx + 16;
  for (const f of filters) {
    const isSpeciesTab = f.startsWith("SPECIES:");
    const isAct = isSpeciesTab ? (entityFilter === "SPECIES") : (entityFilter === f);
    const flabel = isMobile ? (isSpeciesTab ? speciesFilter.slice(0, 4).toUpperCase() : f.slice(0, 3)) : f;
    const btnW = isMobile ? Math.floor((mw - 32) / filters.length) : Math.max(52, flabel.length * 8 + 12);
    drawNESButton(fx, my + 36, btnW, 22, flabel, isAct, false);
    registerClickableRegion(fx, my + 36, btnW, 22, () => {
      if (!isSpeciesTab) {
        entityFilter = f;
        speciesFilter = "";
      }
      modalScroll = 0;
    });
    fx += btnW + (isMobile ? 2 : 4);
  }

  // Table Box
  const tableY = my + 64;
  const tableH = mh - 74;
  drawNESBox(mx + 10, tableY, mw - 20, tableH);

  // Column Headers
  if (!isMobile) {
    drawText8x8("ID", mx + 20, tableY + 12, "#f8b800", 1);
    drawText8x8("NAME", mx + 70, tableY + 12, "#f8b800", 1);
    drawText8x8("SPECIES", mx + 225, tableY + 12, "#f8b800", 1);
    drawText8x8("POS", mx + 315, tableY + 12, "#f8b800", 1);
    drawText8x8("HP", mx + 400, tableY + 12, "#f8b800", 1);
    drawText8x8("STATUS", mx + 455, tableY + 12, "#f8b800", 1);
    drawText8x8("CLAN", mx + 515, tableY + 12, "#f8b800", 1);
  } else {
    drawText8x8("ID", mx + 18, tableY + 12, "#f8b800", 1);
    drawText8x8("NAME", mx + 64, tableY + 12, "#f8b800", 1);
    drawText8x8("HP", mx + mw - 116, tableY + 12, "#f8b800", 1);
    drawText8x8("STATUS", mx + mw - 68, tableY + 12, "#f8b800", 1);
  }

  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(mx + 12, tableY + 24);
  ctx.lineTo(mx + mw - 12, tableY + 24);
  ctx.stroke();

  // Rows
  const rowH = 22;
  const visibleRows = Math.floor((tableH - 30) / rowH);
  const maxScroll = Math.max(0, list.length - visibleRows);
  modalScroll = Math.max(0, Math.min(maxScroll, modalScroll));

  let rowY = tableY + 32;
  for (let i = modalScroll; i < Math.min(list.length, modalScroll + visibleRows); i++) {
    const ent = list[i];
    const isSelected = ent.id === lastSelectedId;
    const isHover = mouseX >= mx + 12 && mouseX <= mx + mw - 12 && mouseY >= rowY - 4 && mouseY <= rowY + 16;

    if (isSelected || isHover) {
      ctx.fillStyle = isSelected ? "#222244" : "#181818";
      ctx.fillRect(mx + 12, rowY - 4, mw - 24, rowH);
    }

    const cursorPrefix = isSelected || isHover ? "▶" : " ";
    const brainHp = ent.properties.brain ? Math.round(ent.properties.brain.condition) : (ent.properties.life ? Math.round(ent.properties.life.energy) : "-");
    const isSleeping = ent.properties.life?.isSleeping;
    const statusStr = ent.properties.life ? (isSleeping ? "SLEEP" : (!ent.destroyed ? "LIVE" : "DEAD")) : "ITEM";
    const statusCol = ent.properties.life ? (isSleeping ? "#3cbcfc" : (!ent.destroyed ? "#58d854" : "#f83800")) : "#f8b800";

    const curEnt = ent;

    if (!isMobile) {
      drawText8x8(`${cursorPrefix}#${ent.id}`, mx + 16, rowY + 3, isSelected || isHover ? "#f8b800" : "#ffffff", 1);
      drawText8x8((ent.properties.name || "ENTITY").slice(0, 18).toUpperCase(), mx + 70, rowY + 3, "#ffffff", 1);
      drawText8x8((ent.properties.species || "-").slice(0, 10).toUpperCase(), mx + 225, rowY + 3, "#3cbcfc", 1);
      drawText8x8(`[${Math.floor(ent.x)},${Math.floor(ent.y)}]`, mx + 315, rowY + 3, "#bcbcbc", 1);
      drawText8x8(String(brainHp), mx + 400, rowY + 3, "#f83800", 1);
      drawText8x8(statusStr, mx + 455, rowY + 3, statusCol, 1);
      const maxClanChars = Math.max(6, Math.floor((mw - 670) / 8));
      drawText8x8((ent.properties.group?.name || "-").slice(0, maxClanChars).toUpperCase(), mx + 515, rowY + 3, "#d3869b", 1);

      // INSPECT Button
      const inspectBtnX = mx + mw - 145;
      drawNESButton(inspectBtnX, rowY - 1, 65, 18, "INSPECT", false, false);
      registerClickableRegion(inspectBtnX, rowY - 1, 65, 18, () => {
        lastSelectedId = curEnt.id;
        dossierTab = "OVERVIEW";
        currentMode = "INSPECT";
      });

      // FOCUS Button
      const focusBtnX = mx + mw - 75;
      drawNESButton(focusBtnX, rowY - 1, 60, 18, "FOCUS", false, false);
      registerClickableRegion(focusBtnX, rowY - 1, 60, 18, () => {
        focusEntityAndFollow(curEnt);
      });

      // Click row to inspect directly
      registerClickableRegion(mx + 12, rowY - 4, mw - 150, rowH, () => {
        lastSelectedId = curEnt.id;
        dossierTab = "OVERVIEW";
        currentMode = "INSPECT";
      });
    } else {
      drawText8x8(`${cursorPrefix}#${ent.id}`, mx + 16, rowY + 3, isSelected || isHover ? "#f8b800" : "#ffffff", 1);
      const maxMobileName = Math.max(8, Math.floor((mw - 190) / 8));
      drawText8x8((ent.properties.name || "ENTITY").slice(0, maxMobileName).toUpperCase(), mx + 64, rowY + 3, "#ffffff", 1);
      drawText8x8(String(brainHp), mx + mw - 116, rowY + 3, "#f83800", 1);
      drawText8x8(statusStr, mx + mw - 68, rowY + 3, statusCol, 1);

      registerClickableRegion(mx + 12, rowY - 4, mw - 24, rowH, () => {
        lastSelectedId = curEnt.id;
        dossierTab = "OVERVIEW";
        currentMode = "INSPECT";
      });
    }

    rowY += rowH;
  }

  ctx.restore();
}

// ---------------------------------------------------------------------------
// 4. In-Engine Modal 3: Groups Registry Screen ([G])
// ---------------------------------------------------------------------------

function getAllGroups() {
  const map = new Map();
  if (world && Array.isArray(world.groups)) {
    for (const g of world.groups) {
      if (g && g.id) map.set(g.id, g);
    }
  }
  for (const e of entities) {
    if (e.destroyed) continue;
    if (e.properties && e.properties.group) {
      const g = e.properties.group;
      if (!map.has(g.id)) {
        map.set(g.id, g);
      } else {
        const existing = map.get(g.id);
        // keep best populated fields
        if (g.govType && !existing.govType) existing.govType = g.govType;
        if (g.govGender && !existing.govGender) existing.govGender = g.govGender;
        if (g.diplomats && (!existing.diplomats || existing.diplomats.every(d => !d))) existing.diplomats = g.diplomats;
        if (g.leaderId && !existing.leaderId) existing.leaderId = g.leaderId;
        if (g.relations && Object.keys(g.relations).length > 0) existing.relations = g.relations;
        if (g.wars && g.wars.length > 0) existing.wars = g.wars;
      }
    }
  }
  return Array.from(map.values());
}

function getAllWorldGroups() {
  return getAllGroups();
}

function renderGroupsModal() {
  const isMobile = CANVAS_WIDTH <= 680;
  const mx = isMobile ? 6 : 30;
  const my = isMobile ? 36 : 36;
  const mw = isMobile ? CANVAS_WIDTH - 12 : CANVAS_WIDTH - 60;
  const mh = isMobile ? CANVAS_HEIGHT - 44 : CANVAS_HEIGHT - 72;

  ctx.save();
  ctx.fillStyle = "rgba(0, 0, 0, 0.94)";
  ctx.fillRect(0, 32, CANVAS_WIDTH, CANVAS_HEIGHT - 68);

  drawNESBox(mx, my, mw, mh);

  // Close X Button: Always returns to MAP
  drawNESButton(mx + mw - 32, my + 6, 26, 24, "X", false, true);
  registerClickableRegion(mx + mw - 32, my + 6, 26, 24, () => {
    currentMode = "MAP";
    inspectingLogEvent = null;
    inspectingGroup = null;
    inspectingFromCreature = false;
  });

  // Modal Sub-Views
  if (inspectingLogEvent) {
    renderLogDetailView(mx, my, mw, mh, inspectingLogEvent);
    ctx.restore();
    return;
  }

  if (inspectingBattle) {
    renderBattleDetailView(mx, my, mw, mh, inspectingBattle);
    ctx.restore();
    return;
  }

  if (inspectingRelationship) {
    renderRelationshipModal(mx, my, mw, mh, inspectingRelationship);
    ctx.restore();
    return;
  }

  // If viewing full Clan Dossier Detail
  if (inspectingGroup) {
    renderGroupDetailView(mx, my, mw, mh, inspectingGroup);
    ctx.restore();
    return;
  }

  const groups = getAllGroups();
  const titleStr = isMobile ? `CLANS (${groups.length})` : `CLANS & FACTIONS (${groups.length}) - SELECT TO INSPECT`;
  drawText8x8(titleStr, mx + 16, my + 14, "#f8b800", 1);

  if (groups.length === 0) {
    drawText8x8("NO FACTIONS FOUNDED YET.", mx + 20, my + 50, "#ffffff", 1);
    ctx.restore();
    return;
  }

  // Dynamic High-Density Grid Layout: 2 columns on desktop, 1 column on mobile, rows calculated dynamically to fill full height!
  const cols = isMobile ? 1 : 2;
  const cardW = Math.floor((mw - 32 - (cols - 1) * 8) / cols);
  const cardH = isMobile ? 84 : 76;
  const cardGap = 8;

  const availableH = (my + mh - 12) - (my + 38);
  const rows = Math.max(1, Math.floor((availableH + cardGap) / (cardH + cardGap)));
  const visibleClanCount = cols * rows;
  const maxScroll = Math.max(0, groups.length - visibleClanCount);
  modalScroll = Math.max(0, Math.min(maxScroll, modalScroll));

  for (let i = modalScroll; i < Math.min(groups.length, modalScroll + visibleClanCount); i++) {
    const g = groups[i];
    const itemIdx = i - modalScroll;
    const col = itemIdx % cols;
    const row = Math.floor(itemIdx / cols);

    const cardX = mx + 16 + col * (cardW + 8);
    const cardY = my + 38 + row * (cardH + cardGap);

    const livingMembers = g.members.filter(mid => {
      const m = getEntityById(mid);
      return m && !m.destroyed;
    }).length;
    const lEnt = getEntityById(g.members[0]);
    const leaderEnt = (lEnt && !lEnt.destroyed) ? lEnt : null;
    const stockpile = getGroupStockpile(g, entities);

    drawNESBox(cardX, cardY, cardW, cardH);

    // Render Clan Flag / Banner
    const flagTex = g.flagSkin ? findTexture(g.flagSkin) : null;
    const gFgColor = g.color ? `#${(g.color & 0xffffff).toString(16).padStart(6, "0")}` : "#f8b800";
    const gBgColor = g.backcolor ? `#${(g.backcolor & 0xffffff).toString(16).padStart(6, "0")}` : "#1e1e28";

    // Draw Flag Box
    ctx.fillStyle = gBgColor;
    ctx.fillRect(cardX + 8, cardY + 8, 16, 16);
    ctx.strokeStyle = gFgColor;
    ctx.lineWidth = 1;
    ctx.strokeRect(cardX + 8, cardY + 8, 16, 16);

    if (flagTex && flagTex.u8) {
      if (!flagTex.canvas) {
        const fc = document.createElement("canvas");
        fc.width = flagTex.width || 16;
        fc.height = flagTex.height || 16;
        const fctx = fc.getContext("2d");
        const fData = fctx.createImageData(fc.width, fc.height);
        fData.data.set(flagTex.u8);
        fctx.putImageData(fData, 0, 0);
        flagTex.canvas = fc;
      }
      if (flagTex.canvas) {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(flagTex.canvas, cardX + 8, cardY + 8, 16, 16);
      }
    }

    const maxClanChars = Math.max(8, Math.floor((cardW - 130) / 8));
    drawText8x8((g.name || "CLAN").slice(0, maxClanChars).toUpperCase(), cardX + 30, cardY + 12, gFgColor, 1);
    drawText8x8(`${livingMembers}/${g.members.length} ALIVE`, cardX + cardW - 90, cardY + 12, "#58d854", 1);

    const leaderName = leaderEnt ? leaderEnt.properties.name.slice(0, 16) : `#${g.members[0]}`;
    drawText8x8(`LEADER: ${leaderName.toUpperCase()}`, cardX + 8, cardY + 30, "#ffffff", 1);
    drawText8x8(`ZONES: ${g.claimedZones?.length || 0} | STOCK: ${stockpile.totalCount}`, cardX + 8, cardY + 44, "#bcbcbc", 1);

    // Action buttons inside card
    const btnW = Math.floor((cardW - 24) / 3);
    const curG = g;

    drawNESButton(cardX + 8, cardY + 56, btnW, 16, "DETAILS", false, false);
    registerClickableRegion(cardX + 8, cardY + 56, btnW, 16, () => {
      inspectingGroup = curG;
      groupDetailTab = "ZONES";
      modalScroll = 0;
    });

    const isViewing = visualizedGroupId === g.id;
    drawNESButton(cardX + 8 + btnW + 4, cardY + 56, btnW, 16, isViewing ? "ZONE*" : "ZONE", isViewing, false);
    registerClickableRegion(cardX + 8 + btnW + 4, cardY + 56, btnW, 16, () => {
      visualizedGroupId = (visualizedGroupId === g.id) ? null : g.id;
      if (visualizedGroupId !== null) {
        let sumX = 0, sumY = 0, count = 0;
        for (const zk of g.claimedZones || []) {
          const coords = parseZoneCoords(zk);
          if (coords) {
            sumX += coords.centerX;
            sumY += coords.centerY;
            count++;
          }
        }
        if (count > 0) focusLocation(sumX / count, sumY / count, 1.5);
        else currentMode = "MAP";
      }
    });

    drawNESButton(cardX + 8 + (btnW + 4) * 2, cardY + 56, btnW, 16, "LEADER", false, false);
    registerClickableRegion(cardX + 8 + (btnW + 4) * 2, cardY + 56, btnW, 16, () => {
      if (leaderEnt) focusEntityAndFollow(leaderEnt);
    });
  }

  ctx.restore();
}

/**
 * Full-screen Clan Dossier: divided into 3 dedicated tabs (ZONES, STOCKPILE, MEMBERS) + HISTORY.
 */
function renderGroupDetailView(mx, my, mw, mh, g) {
  const latestGroup = (world?.groups && world.groups.find(wg => wg.id === g.id)) || getAllGroups().find(wg => wg.id === g.id);
  if (latestGroup) g = latestGroup;

  const livingMembers = (g.members || []).filter(mid => {
    const m = getEntityById(mid);
    return m && !m.destroyed;
  });
  const leaderIdToFind = g.leaderId || g.members[0];
  const lEnt = getEntityById(leaderIdToFind);
  const leaderEnt = (lEnt && !lEnt.destroyed) ? lEnt : null;
  // Cache invalidation when group changes or new events occur
  if (_clanDossierCache.groupId !== g.id || _clanDossierCache.lastEventCount !== allEvents.length) {
    _clanDossierCache.groupId = g.id;
    _clanDossierCache.stockpile = null;
    _clanDossierCache.history = null;
    _clanDossierCache.lastStockpileUpdate = 0;
    _clanDossierCache.lastEventCount = allEvents.length;
  }

  // Only calculate stockpile on demand / throttled (max once per second)
  if (groupDetailTab === "STOCKPILE" || !_clanDossierCache.stockpile) {
    const now = performance.now();
    if (!_clanDossierCache.stockpile || now - _clanDossierCache.lastStockpileUpdate > 1000) {
      _clanDossierCache.stockpile = getGroupStockpile(g, entities);
      _clanDossierCache.lastStockpileUpdate = now;
    }
  }
  const stockpile = _clanDossierCache.stockpile || { totalCount: 0, items: {}, breakdown: { ground: 0, members: 0, storage: 0 } };

  // Only calculate group history when on HISTORY tab
  if (groupDetailTab === "HISTORY" && !_clanDossierCache.history) {
    _clanDossierCache.history = getFullHistoryForGroup(g);
  }
  const groupEvents = _clanDossierCache.history || [];

  const flagTex = g.flagSkin ? findTexture(g.flagSkin) : null;
  const gFgColor = g.color ? `#${(g.color & 0xffffff).toString(16).padStart(6, "0")}` : "#f8b800";
  const gBgColor = g.backcolor ? `#${(g.backcolor & 0xffffff).toString(16).padStart(6, "0")}` : "#1e1e28";

  // Flag Box in Dossier Header
  ctx.fillStyle = gBgColor;
  ctx.fillRect(mx + 16, my + 8, 20, 20);
  ctx.strokeStyle = gFgColor;
  ctx.lineWidth = 1;
  ctx.strokeRect(mx + 16, my + 8, 20, 20);

  if (flagTex && flagTex.u8) {
    if (!flagTex.canvas) {
      const fc = document.createElement("canvas");
      fc.width = flagTex.width || 16;
      fc.height = flagTex.height || 16;
      const fctx = fc.getContext("2d");
      const fData = fctx.createImageData(fc.width, fc.height);
      fData.data.set(flagTex.u8);
      fctx.putImageData(fData, 0, 0);
      flagTex.canvas = fc;
    }
    if (flagTex.canvas) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(flagTex.canvas, mx + 18, my + 10, 16, 16);
    }
  }

  drawText8x8(`CLAN DOSSIER: ${(g.name || "CLAN").toUpperCase()}`, mx + 44, my + 14, gFgColor, 1);

  // Close X Button: Always returns to MAP
  drawNESButton(mx + mw - 32, my + 6, 26, 24, "X", false, true);
  registerClickableRegion(mx + mw - 32, my + 6, 26, 24, () => {
    currentMode = "MAP";
    inspectingGroup = null;
    inspectingLogEvent = null;
    inspectingFromCreature = false;
  });

  // Top Tabs: [ZONES] [STOCKPILE] [MEMBERS] [POLITICS] [HISTORY]
  const tabs = [
    { id: "ZONES", label: `ZONES (${g.claimedZones?.length || 0})` },
    { id: "STOCKPILE", label: `STOCKPILE${_clanDossierCache.stockpile ? ` (${_clanDossierCache.stockpile.totalCount})` : ""}` },
    { id: "MEMBERS", label: `MEMBERS (${livingMembers.length}/${g.members.length})` },
    { id: "POLITICS", label: "POLITICS" },
    { id: "HISTORY", label: `HISTORY${_clanDossierCache.history ? ` (${_clanDossierCache.history.length})` : ""}` }
  ];

  let tabX = mx + 16;
  for (const t of tabs) {
    const isAct = groupDetailTab === t.id;
    const tabW = t.label.length * 8 + 14;
    drawNESButton(tabX, my + 32, tabW, 24, t.label, isAct, false);
    const tid = t.id;
    registerClickableRegion(tabX, my + 32, tabW, 24, () => {
      groupDetailTab = tid;
      modalScroll = 0;
    });
    tabX += tabW + 6;
  }

  // Top Action Buttons on the right
  drawNESButton(mx + mw - 240, my + 32, 105, 24, "MAP TERRITORY", false, false);
  registerClickableRegion(mx + mw - 240, my + 32, 105, 24, () => {
    visualizedGroupId = (visualizedGroupId === g.id) ? null : g.id;
    if (visualizedGroupId !== null) {
      let sumX = 0, sumY = 0, count = 0;
      for (const zk of g.claimedZones || []) {
        const coords = parseZoneCoords(zk);
        if (coords) {
          sumX += coords.centerX;
          sumY += coords.centerY;
          count++;
        }
      }
      if (count > 0) focusLocation(sumX / count, sumY / count, 1.5);
      else currentMode = "MAP";
    }
  });

  drawNESButton(mx + mw - 130, my + 32, 115, 24, "FOCUS LEADER", false, false);
  registerClickableRegion(mx + mw - 130, my + 32, 115, 24, () => {
    if (leaderEnt) focusEntityAndFollow(leaderEnt);
  });

  const contentY = my + 62;
  const contentH = (my + mh - 12) - contentY;

  // -------------------------------------------------------------------------
  // TAB 1: ZONES (Territory, Claimed Macro-Zones, Blueprints & Rooms)
  // -------------------------------------------------------------------------
  if (groupDetailTab === "ZONES") {
    drawNESBox(mx + 12, contentY, mw - 24, contentH);

    const totalTiles = (g.claimedZones?.length || 0) * 64;
    drawText8x8(`CLAIMED TERRITORY: ${g.claimedZones?.length || 0} ZONES (${totalTiles} TILES)`, mx + 20, contentY + 12, "#ffd700", 1);

    const zones = g.claimedZones || [];
    const rooms = g.rooms || [];
    const rowH = 26;
    const totalItems = zones.length + rooms.length;
    const visibleCount = Math.floor((contentH - 44) / rowH);
    const maxScroll = Math.max(0, totalItems - visibleCount);
    modalScroll = Math.max(0, Math.min(maxScroll, modalScroll));

    let curY = contentY + 34;

    for (let i = modalScroll; i < Math.min(totalItems, modalScroll + visibleCount); i++) {
      if (i < zones.length) {
        // Render Zone Card
        const zk = zones[i];
        const c = parseZoneCoords(zk);
        const zStr = c ? `ZONE ${zk} [X:${c.minX}..${c.maxX}, Y:${c.minY}..${c.maxY}] (CENTER: [${c.centerX}, ${c.centerY}])` : `ZONE ${zk}`;

        drawText8x8(`• ${zStr}`, mx + 20, curY + 6, "#ffffff", 1);

        if (c) {
          const curC = c;
          drawNESButton(mx + mw - 95, curY + 2, 70, 20, "FOCUS", false, false);
          registerClickableRegion(mx + mw - 95, curY + 2, 70, 20, () => {
            focusLocation(curC.centerX, curC.centerY, 2.0);
          });
        }
      } else {
        // Render Room / Blueprint Card
        const rm = rooms[i - zones.length];
        const rmName = (rm.name || rm.type || "ROOM").toUpperCase();
        const rmCoords = `[X:${Math.floor(rm.zx * 8 + 4)}, Y:${Math.floor(rm.zy * 8 + 4)}]`;
        const membersCount = rm.assignedMembers?.length || 0;

        drawText8x8(`🏠 ROOM: ${rmName} - ${rmCoords} (${membersCount} OCCUPANTS)`, mx + 20, curY + 6, "#3cbcfc", 1);

        drawNESButton(mx + mw - 95, curY + 2, 70, 20, "FOCUS", false, false);
        registerClickableRegion(mx + mw - 95, curY + 2, 70, 20, () => {
          focusLocation(rm.zx * 8 + 4, rm.zy * 8 + 4, 2.0);
        });
      }

      curY += rowH;
    }
  }

  // -------------------------------------------------------------------------
  // TAB 2: STOCKPILE (Itemized Resource Breakdown)
  // -------------------------------------------------------------------------
  else if (groupDetailTab === "STOCKPILE") {
    drawNESBox(mx + 12, contentY, mw - 24, contentH);

    drawText8x8(`TOTAL STOCKPILE (${stockpile.totalCount} ITEMS AVAILABLE):`, mx + 20, contentY + 12, "#ffd700", 1);
    drawText8x8(`BREAKDOWN: [TERRITORY GROUND: ${stockpile.breakdown.ground} | WITH MEMBERS: ${stockpile.breakdown.members} | IN STORAGE: ${stockpile.breakdown.storage}]`, mx + 20, contentY + 28, "#3cbcfc", 1);

    const stockEntries = Object.entries(stockpile.items);
    if (stockEntries.length === 0) {
      drawText8x8("NO RESOURCES OR ITEMS IN STOCKPILE CURRENTLY.", mx + 20, contentY + 54, "#bcbcbc", 1);
    } else {
      const rowH = 24;
      const visibleCount = Math.floor((contentH - 52) / rowH);
      const maxScroll = Math.max(0, stockEntries.length - visibleCount);
      modalScroll = Math.max(0, Math.min(maxScroll, modalScroll));

      let stockY = contentY + 48;
      for (let i = modalScroll; i < Math.min(stockEntries.length, modalScroll + visibleCount); i++) {
        const [itemName, count] = stockEntries[i];
        drawText8x8(`• ${count}x`, mx + 24, stockY + 4, "#58d854", 1);
        drawText8x8(itemName.toUpperCase(), mx + 80, stockY + 4, "#ffffff", 1);
        stockY += rowH;
      }
    }
  }

  // -------------------------------------------------------------------------
  // TAB 3: MEMBERS (Roster, Roles, HP, Hand Items, Inspect & Focus)
  // -------------------------------------------------------------------------
  else if (groupDetailTab === "MEMBERS") {
    drawNESBox(mx + 12, contentY, mw - 24, contentH);

    drawText8x8(`MEMBER ROSTER (${livingMembers.length}/${g.members.length} ALIVE):`, mx + 20, contentY + 12, "#ffd700", 1);

    const rowH = 26;
    const visibleCount = Math.floor((contentH - 36) / rowH);
    const maxScroll = Math.max(0, g.members.length - visibleCount);
    modalScroll = Math.max(0, Math.min(maxScroll, modalScroll));

    let rosterY = contentY + 30;
    for (let mi = modalScroll; mi < Math.min(g.members.length, modalScroll + visibleCount); mi++) {
      const mid = g.members[mi];
      const m = getEntityById(mid) || entityRegistry.get(mid);
      const isAlive = m && !m.destroyed && m.properties?.life?.energy > 0;
      const isSelected = mid === lastSelectedId;
      const actionWidth = isAlive ? 165 : 85;
      const isHover = mouseX >= mx + 12 && mouseX <= mx + mw - 12 && mouseY >= rosterY - 2 && mouseY <= rosterY + rowH - 4;

      if (isSelected || isHover) {
        ctx.fillStyle = isSelected ? "#222244" : "#181818";
        ctx.fillRect(mx + 12, rosterY - 2, mw - 24, rowH);
      }

      const isLeader = (m && m.id === g.leaderId);
      const leaderBadge = isLeader ? " [LEADER]" : "";
      const statusBadge = isAlive ? "" : " [DECEASED]";
      const mName = m?.properties?.name ? `${m.properties.name.toUpperCase()}${leaderBadge}${statusBadge}` : `MEMBER #${mid}${statusBadge}`;
      const mRole = m ? (m.properties.role || m.properties.species || "HUMAN").toUpperCase() : "-";
      const hpStr = isAlive && m?.properties.life ? `${Math.round(m.properties.life.energy)}HP` : (isAlive ? "LIVE" : "DEAD");
      const posStr = m && m.x !== undefined && m.y !== undefined ? `[${Math.floor(m.x)},${Math.floor(m.y)}]` : "-";

      // Held items
      let heldStr = "HANDS: EMPTY";
      if (m && isAlive) {
        const left = m.properties.arm_left?.heldItem;
        const right = m.properties.arm_right?.heldItem;
        const held = [];
        if (left) held.push(`L:${left.resourceType || left.name || "ITEM"}`);
        if (right) held.push(`R:${right.resourceType || right.name || "ITEM"}`);
        if (held.length > 0) heldStr = held.join(" | ").toUpperCase();
      }

      const cursorPrefix = isSelected || isHover ? "▶" : "•";
      const nameColor = isSelected ? "#f8b800" : (isAlive ? "#ffffff" : "#9c5050");
      const maxChars = Math.floor((mw - 36 - actionWidth) / 8);
      const mText = `${cursorPrefix} ${mName} [${mRole}] ${hpStr} ${posStr} | ${heldStr}`;
      drawText8x8(mText.slice(0, maxChars), mx + 20, rosterY + 5, nameColor, 1);

      const curMid = mid;
      const curM = m;

      // Click row to open inspection dossier directly
      registerClickableRegion(mx + 12, rosterY - 2, mw - actionWidth - 20, rowH, () => {
        lastSelectedId = curMid;
        dossierTab = "OVERVIEW";
        currentMode = "INSPECT";
      });

      // INSPECT Button (for all members, alive or deceased)
      const inspectBtnX = isAlive ? mx + mw - 165 : mx + mw - 85;
      drawNESButton(inspectBtnX, rosterY + 1, 75, 20, "INSPECT", false, false);
      registerClickableRegion(inspectBtnX, rosterY + 1, 75, 20, () => {
        lastSelectedId = curMid;
        dossierTab = "OVERVIEW";
        currentMode = "INSPECT";
      });

      // FOCUS Button (for living members)
      if (isAlive && curM) {
        drawNESButton(mx + mw - 85, rosterY + 1, 75, 20, "FOCUS", false, false);
        registerClickableRegion(mx + mw - 85, rosterY + 1, 75, 20, () => {
          focusEntityAndFollow(curM);
        });
      }

      rosterY += rowH;
    }
  }

  // -------------------------------------------------------------------------
  // TAB 4: POLITICS
  // -------------------------------------------------------------------------
  else if (groupDetailTab === "POLITICS") {
    // Retroactive UI-side init removed, worker handles it

    drawNESBox(mx + 12, contentY, mw - 24, contentH);
    const leaderEnt = g.leaderId ? getEntityById(g.leaderId) : null;
    const leaderStr = leaderEnt ? (leaderEnt.properties?.life?.isDead ? `(DECEASED) ${leaderEnt.properties.name}` : leaderEnt.properties.name) : "N/A";

    drawText8x8(`GOVERNMENT SYSTEM`, mx + 20, contentY + 12, "#ffd700", 1);
    drawText8x8(`Type:   ${g.govType || "UNKNOWN"}`, mx + 30, contentY + 28, "#3cbcfc", 1);
    drawText8x8(`Gender: ${g.govGender || "UNKNOWN"}`, mx + 30, contentY + 42, "#3cbcfc", 1);

    drawText8x8(`POLITICAL LEADERSHIP`, mx + 320, contentY + 12, "#ffd700", 1);
    drawText8x8(`High Leader: ${leaderStr}`, mx + 330, contentY + 28, "#58d854", 1);

    const dLabels = ["Trade", "War", "Alliances", "Interior", "Expansion", "Chief Diplomat"];
    let dipY = contentY + 44;
    for (let i = 0; i < 6; i++) {
      const dId = g.diplomats && g.diplomats.length > i ? g.diplomats[i] : null;
      const dEnt = dId ? getEntityById(dId) : null;
      const dStr = dEnt ? (dEnt.properties?.life?.isDead ? `[X] ${dEnt.properties.name}` : dEnt.properties.name) : "VACANT";
      const lbl = dLabels[i];
      drawText8x8(`Diplomat (${lbl}): ${dStr}`, mx + 330, dipY, "#d0d0e0", 1);
      dipY += 14;
    }

    drawText8x8(`DIPLOMATIC RELATIONS`, mx + 20, contentY + 70, "#ffd700", 1);
    let relY = contentY + 86;
    let foundRels = false;

    if (g.relations) {
      for (const [otherIdStr, score] of Object.entries(g.relations)) {
        const otherGrp = getAllWorldGroups().find(og => og.id === Number(otherIdStr));
        if (otherGrp) {
          foundRels = true;
          const isWar = g.wars && g.wars.includes(otherGrp.id);
          const color = isWar ? "#ff2040" : (score < -50 ? "#e40058" : (score > 50 ? "#58d854" : "#ffffff"));
          const st = isWar ? "AT WAR" : (score < -50 ? "HOSTILE" : (score > 50 ? "ALLIED" : "NEUTRAL"));
          drawText8x8(`${otherGrp.name}: ${Math.round(score)} / 100 [${st}]`, mx + 30, relY, color, 1);
          relY += 14;
        }
      }
    }
    if (!foundRels) {
      drawText8x8(`No known relations with other groups.`, mx + 30, relY, "#7b7b7b", 1);
    }
  }

  // -------------------------------------------------------------------------
  // TAB 5: HISTORY (Chronological Clan & Member Event Log)
  // -------------------------------------------------------------------------
  else if (groupDetailTab === "HISTORY") {
    drawNESBox(mx + 12, contentY, mw - 24, contentH);

    drawText8x8("CHRONOLOGICAL CLAN EVENT HISTORY & PARTICIPANTS LOG:", mx + 20, contentY + 12, "#ffd700", 1);

    if (groupEvents.length === 0) {
      drawText8x8("NO HISTORICAL EVENTS RECORDED FOR THIS CLAN YET.", mx + 20, contentY + 40, "#bcbcbc", 1);
    } else {
      const eventsReversed = groupEvents.slice().reverse();
      const rowHeight = 26;
      const visibleCount = Math.floor((contentH - 44) / rowHeight);
      const maxScroll = Math.max(0, eventsReversed.length - visibleCount);
      modalScroll = Math.max(0, Math.min(maxScroll, modalScroll));

      let logY = contentY + 34;
      for (let i = modalScroll; i < Math.min(eventsReversed.length, modalScroll + visibleCount); i++) {
        const ev = eventsReversed[i];
        const isHover = mouseX >= mx + 16 && mouseX <= mx + mw - 170 && mouseY >= logY - 2 && mouseY <= logY + 22;
        if (isHover) {
          ctx.fillStyle = "#181828";
          ctx.fillRect(mx + 16, logY - 2, mw - 186, 24);

          const actorId = ev.primaryEntityId !== null && ev.primaryEntityId !== undefined ? ev.primaryEntityId : (ev.metadata?.attackerId || ev.metadata?.killerId || ev.metadata?.primaryId);
          const targetId = ev.secondaryEntityId !== null && ev.secondaryEntityId !== undefined ? ev.secondaryEntityId : (ev.metadata?.targetId || ev.metadata?.victimId || ev.metadata?.secondaryId);
          const actorName = ev.metadata?.attackerName || ev.metadata?.primaryName || (actorId ? (entityRegistry?.get(actorId)?.properties?.name || `Entity #${actorId}`) : null);
          const targetName = ev.metadata?.targetName || ev.metadata?.victimName || ev.metadata?.secondaryName || (targetId ? (entityRegistry?.get(targetId)?.properties?.name || `Entity #${targetId}`) : null);

          const tipLines = [
            `Type: [${ev.type}] (Event #${ev.id})`,
            `Time: Day ${ev.timestamp?.day || 0} at ${String(ev.timestamp?.hour || 0).padStart(2, "0")}:${String(ev.timestamp?.minute || 0).padStart(2, "0")} (Tick ${ev.tick})`,
            ev.location ? `Coordinates: [X: ${Math.floor(ev.location.x)}, Y: ${Math.floor(ev.location.y)}]` : "Coordinates: Global / Ambient",
            actorName ? `Actor/Attacker: ${actorName}${actorId !== null && actorId !== undefined ? ` (ID: #${actorId})` : ""}` : (actorId !== null && actorId !== undefined ? `Actor ID: #${actorId}` : null),
            targetName ? `Target/Victim: ${targetName}${targetId !== null && targetId !== undefined ? ` (ID: #${targetId})` : ""}` : (targetId !== null && targetId !== undefined ? `Target ID: #${targetId}` : null),
            ev.metadata?.hitPartName ? `Hit: ${ev.metadata.hitPartName} (${Math.round(ev.metadata.totalDamage || ev.metadata.netDamage || 0)} DMG)` : null,
            ev.metadata?.causedByBattleId ? `Succumbed to Battle #${ev.metadata.causedByBattleId} Wounds` : null
          ].filter(Boolean);
          setHoverTooltip(`Clan Event #${ev.id}`, tipLines);
        }

        const typeCol = ev.type === "DEATH" ? "#f83800" : ev.type === "ATTACK" ? "#f8b800" : ev.type === "AMPUTATION" ? "#d3869b" : ev.type === "BIRTH" ? "#58d854" : ev.type === "RELATION" ? "#f878f8" : "#3cbcfc";
        const timeStr = `[D${ev.timestamp.day} ${String(ev.timestamp.hour).padStart(2, "0")}:${String(ev.timestamp.minute).padStart(2, "0")}]`;

        // Type badge & time
        drawText8x8(`[${ev.type}]`, mx + 20, logY + 4, typeCol, 1);
        drawText8x8(timeStr, mx + 110, logY + 4, "#bcbcbc", 1);

        // Description text
        const maxDescChars = Math.floor((mw - 360) / 8);
        const descShort = ev.description.length > maxDescChars ? ev.description.slice(0, maxDescChars - 3) + "..." : ev.description;
        drawText8x8(descShort, mx + 210, logY + 4, "#ffffff", 1);

        const curEv = ev;
        // Click row to inspect
        registerClickableRegion(mx + 16, logY - 2, mw - 186, 24, () => {
          inspectingLogEvent = curEv;
        });

        // Inspect Button
        drawNESButton(mx + mw - 160, logY - 1, 72, 20, "INSPECT", false, false);
        registerClickableRegion(mx + mw - 160, logY - 1, 72, 20, () => {
          inspectingLogEvent = curEv;
        });

        // Focus Location Button
        if (curEv.location) {
          drawNESButton(mx + mw - 80, logY - 1, 60, 20, "MAP", false, false);
          registerClickableRegion(mx + mw - 80, logY - 1, 60, 20, () => {
            focusLocation(curEv.location.x, curEv.location.y, 2.0);
          });
        }

        logY += rowHeight;
      }
    }
  }
}

/**
 * Renders glowing claimed territory overlay on the world map for the selected clan.
 */
function renderTerritoryOverlay() {
  if (!world || visualizedGroupId === null) return;
  const groups = getAllGroups();
  const g = groups.find(grp => grp.id === visualizedGroupId);
  if (!g) {
    visualizedGroupId = null;
    return;
  }

  ctx.save();

  // Draw Claimed Macro-Chunks on 2D Canvas when in Map Mode
  if (!is3DMode && renderer) {
    const zoom = renderer.getCameraZoom();
    const tileSize = 16.0 * zoom;
    const cx = renderer.getCameraX();
    const cy = renderer.getCameraY();
    const centerScreenX = CANVAS_WIDTH / 2;
    const centerScreenY = CANVAS_HEIGHT / 2;

    for (const zk of g.claimedZones || []) {
      const coords = parseZoneCoords(zk);
      if (!coords) continue;

      const sz = getZoneSize();
      const screenX = centerScreenX + (coords.minX - cx) * tileSize;
      const screenY = centerScreenY + (coords.minY - cy) * tileSize;
      const screenW = sz * tileSize;
      const screenH = sz * tileSize;

      // Only draw if on screen
      if (screenX + screenW < 0 || screenX > CANVAS_WIDTH || screenY + screenH < 0 || screenY > CANVAS_HEIGHT) continue;

      // Translucent Tinted Fill
      ctx.fillStyle = "rgba(248, 184, 0, 0.18)";
      ctx.fillRect(screenX, screenY, screenW, screenH);

      // Glowing Border
      ctx.strokeStyle = "#ffd700";
      ctx.lineWidth = 2;
      ctx.strokeRect(screenX, screenY, screenW, screenH);

      // Corner Accents
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(screenX, screenY, 4, 4);
      ctx.fillRect(screenX + screenW - 4, screenY, 4, 4);
      ctx.fillRect(screenX, screenY + screenH - 4, 4, 4);
      ctx.fillRect(screenX + screenW - 4, screenY + screenH - 4, 4, 4);

      // Zone Badge
      const zoneBadge = `ZONE [${coords.zx},${coords.zy}]`;
      drawText8x8(zoneBadge, screenX + 4, screenY + 4, "#ffd700", 1);
    }
  }

  // Floating Territory Banner on Top HUD area (Shown in both 3D and 2D)
  const bannerText = `TERRITORY: ${(g.name || "CLAN").toUpperCase()}`;
  const bannerW = bannerText.length * 8 + 80;
  const bannerX = Math.floor((CANVAS_WIDTH - bannerW) / 2);
  const bannerY = 38;

  drawNESBox(bannerX, bannerY, bannerW, 26);
  drawText8x8(bannerText, bannerX + 8, bannerY + 9, "#ffd700", 1);

  drawNESButton(bannerX + bannerW - 55, bannerY + 3, 50, 20, "HIDE", false, true);
  registerClickableRegion(bannerX + bannerW - 55, bannerY + 3, 50, 20, () => {
    visualizedGroupId = null;
  });

  ctx.restore();
}

// ---------------------------------------------------------------------------
// 5. In-Engine Modal 4: World Event Log Explorer Screen ([L])
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 5. In-Engine Modal 4: World Event Log Explorer Screen ([L]) & Battle Forensics
// ---------------------------------------------------------------------------

let activeHoverTooltip = null;

function setHoverTooltip(title, lines) {
  activeHoverTooltip = {
    title,
    lines: Array.isArray(lines) ? lines : [lines],
    x: mouseX,
    y: mouseY
  };
}

function renderActiveHoverTooltip() {
  if (!activeHoverTooltip) return;

  const { title, lines, x, y } = activeHoverTooltip;
  const lineH = 14;
  const padding = 8;
  const maxLineLen = Math.max(title.length, ...lines.map(l => (l || "").length));
  const tipW = Math.min(380, Math.max(160, maxLineLen * 8 + padding * 2 + 10));
  const tipH = (lines.length + 1) * lineH + padding * 2 + 6;

  // Position tooltip smartly to stay on screen
  let tx = x + 14;
  let ty = y + 14;
  if (tx + tipW > CANVAS_WIDTH - 8) tx = x - tipW - 10;
  if (ty + tipH > CANVAS_HEIGHT - 8) ty = y - tipH - 10;

  ctx.save();
  ctx.fillStyle = "rgba(10, 10, 20, 0.95)";
  ctx.fillRect(tx, ty, tipW, tipH);
  ctx.strokeStyle = "#ffd700";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(tx, ty, tipW, tipH);

  drawText8x8(title.toUpperCase(), tx + padding, ty + padding + 2, "#ffd700", 1);
  let curY = ty + padding + lineH + 4;
  for (const line of lines) {
    drawText8x8((line || "").slice(0, Math.floor((tipW - padding * 2) / 8)), tx + padding, curY, "#ffffff", 1);
    curY += lineH;
  }
  ctx.restore();

  activeHoverTooltip = null;
}

function getFilteredLogs() {
  if (_logsFilterCache.filter === logFilter && _logsFilterCache.eventCount === allEvents.length) {
    return _logsFilterCache.list;
  }
  let result = [];
  if (logFilter === "BATTLES") {
    result = getClusteredBattles({ limit: 100 });
  } else {
    const events = allEvents.slice().reverse();
    if (logFilter === "ALL") result = events;
    else result = events.filter(e => e.type === logFilter);
  }
  _logsFilterCache.filter = logFilter;
  _logsFilterCache.eventCount = allEvents.length;
  _logsFilterCache.list = result;
  return result;
}

function renderLogsModal() {
  const isMobile = CANVAS_WIDTH <= 680;
  const mx = isMobile ? 6 : 40;
  const my = isMobile ? 36 : 40;
  const mw = isMobile ? CANVAS_WIDTH - 12 : CANVAS_WIDTH - 80;
  const mh = isMobile ? CANVAS_HEIGHT - 44 : CANVAS_HEIGHT - 86;

  ctx.save();
  ctx.fillStyle = "rgba(0, 0, 0, 0.9)";
  ctx.fillRect(0, 32, CANVAS_WIDTH, CANVAS_HEIGHT - 68);

  drawNESBox(mx, my, mw, mh);

  // Close X Button: Always returns to MAP
  drawNESButton(mx + mw - 32, my + 6, 26, 24, "X", false, true);
  registerClickableRegion(mx + mw - 32, my + 6, 26, 24, () => {
    currentMode = "MAP";
    inspectingLogEvent = null;
    inspectingBattle = null;
    inspectingRelationship = null;
    inspectingGroup = null;
    inspectingFromCreature = false;
  });

  // Modal Sub-Views
  if (inspectingLogEvent) {
    renderLogDetailView(mx, my, mw, mh, inspectingLogEvent);
    ctx.restore();
    return;
  }

  if (inspectingBattle) {
    renderBattleDetailView(mx, my, mw, mh, inspectingBattle);
    ctx.restore();
    return;
  }

  if (inspectingRelationship) {
    renderRelationshipModal(mx, my, mw, mh, inspectingRelationship);
    ctx.restore();
    return;
  }

  const list = getFilteredLogs();
  const titleStr = logFilter === "BATTLES"
    ? `BATTLES & WAR FORENSICS (${list.length} BATTLES DETECTED)`
    : `WORLD CHRONICLE LOG (${list.length} EVENTS)`;
  drawText8x8(titleStr, mx + 16, my + 14, "#f8b800", 1);

  // Filter Buttons
  const filters = ["ALL", "BATTLES", "KILL", "ATTACK", "RELATION", "DIALOGUE", "AMPUTATION", "BIRTH", "DEATH", "BUILD"];
  let fx = mx + 16;
  for (const f of filters) {
    if (fx + 45 > mx + mw - 16) break;
    const isAct = logFilter === f;
    const flabel = isMobile ? f.slice(0, 4) : f;
    const fw = flabel.length * 8 + 14;
    drawNESButton(fx, my + 36, fw, 22, flabel, isAct, false);
    const filterKey = f;
    registerClickableRegion(fx, my + 36, fw, 22, () => {
      logFilter = filterKey;
      modalScroll = 0;
    });
    fx += fw + 4;
  }

  // Event / Battle List Container
  const tableY = my + 64;
  const tableH = mh - 74;
  drawNESBox(mx + 10, tableY, mw - 20, tableH);

  if (logFilter === "BATTLES") {
    // -------------------------------------------------------------------------
    // BATTLES & WARS LIST
    // -------------------------------------------------------------------------
    if (list.length === 0) {
      drawText8x8("NO COMBAT BATTLES OR SKIRMISHES RECORDED YET.", mx + 24, tableY + 24, "#bcbcbc", 1);
    } else {
      const rowH = 34;
      const visibleRows = Math.floor((tableH - 20) / rowH);
      const maxScroll = Math.max(0, list.length - visibleRows);
      modalScroll = Math.max(0, Math.min(maxScroll, modalScroll));

      let rowY = tableY + 12;
      for (let i = modalScroll; i < Math.min(list.length, modalScroll + visibleRows); i++) {
        const battle = list[i];
        const isHover = mouseX >= mx + 12 && mouseX <= mx + mw - 12 && mouseY >= rowY && mouseY <= rowY + rowH;

        if (isHover) {
          ctx.fillStyle = "#1e1828";
          ctx.fillRect(mx + 12, rowY, mw - 24, rowH - 2);

          const tipLines = [
            `Location: [X:${battle.location.x}, Y:${battle.location.y}]`,
            `Initiator: ${battle.initiator.name} (${battle.initiator.clan})`,
            `Defender: ${battle.defender.name} (${battle.defender.clan})`,
            `Trigger: ${battle.triggerCause}`,
            `Strikes: ${battle.attacksCount}x | Damage: ${Math.round(battle.totalDamage)} HP`,
            `Casualties: ${battle.amputations.length} amputations, ${battle.fatalities.length} fatalities`
          ];
          setHoverTooltip(`Battle #${battle.id}: ${battle.name}`, tipLines);
        }

        const ts = battle.timestamp ? `D${battle.timestamp.day} ${String(battle.timestamp.hour).padStart(2, "0")}:${String(battle.timestamp.minute).padStart(2, "0")}` : `T${battle.startTick}`;
        drawText8x8(ts, mx + 18, rowY + 5, "#bcbcbc", 1);
        drawText8x8(`[BATTLE #${battle.id}]`, mx + 110, rowY + 5, "#f83800", 1);

        const battleHeader = `${battle.name} • [${battle.combatants.length} FIGHTERS • ${Math.round(battle.totalDamage)} DMG]`;
        drawText8x8(battleHeader.slice(0, Math.floor((mw - 380) / 8)), mx + 245, rowY + 5, "#ffd700", 1);

        const causeShort = `TRIGGER: ${battle.triggerCause}`.slice(0, Math.floor((mw - 380) / 8));
        drawText8x8(causeShort, mx + 245, rowY + 18, "#bcbcbc", 1);

        const curBattle = battle;
        // Inspect Button
        drawNESButton(mx + mw - 170, rowY + 4, 80, 24, "INSPECT", false, false);
        registerClickableRegion(mx + mw - 170, rowY + 4, 80, 24, () => {
          inspectingBattle = curBattle;
        });

        // Map Button
        drawNESButton(mx + mw - 85, rowY + 4, 70, 24, "MAP", false, false);
        registerClickableRegion(mx + mw - 85, rowY + 4, 70, 24, () => {
          focusLocation(curBattle.location.x, curBattle.location.y, 2.0);
        });

        // Row Click to Inspect
        registerClickableRegion(mx + 12, rowY, mw - 180, rowH - 2, () => {
          inspectingBattle = curBattle;
        });

        rowY += rowH;
      }
    }
  } else {
    // -------------------------------------------------------------------------
    // STANDARD CHRONOLOGICAL LOGS
    // -------------------------------------------------------------------------
    const rowH = 24;
    const visibleRows = Math.floor((tableH - 16) / rowH);
    const maxScroll = Math.max(0, list.length - visibleRows);
    modalScroll = Math.max(0, Math.min(maxScroll, modalScroll));

    let rowY = tableY + 12;
    for (let i = modalScroll; i < Math.min(list.length, modalScroll + visibleRows); i++) {
      const ev = list[i];
      const isHover = mouseX >= mx + 12 && mouseX <= mx + mw - 12 && mouseY >= rowY - 2 && mouseY <= rowY + rowH - 2;

      if (isHover) {
        ctx.fillStyle = "#181828";
        ctx.fillRect(mx + 12, rowY - 2, mw - 24, rowH);

        const actorId = ev.primaryEntityId !== null && ev.primaryEntityId !== undefined ? ev.primaryEntityId : (ev.metadata?.attackerId || ev.metadata?.killerId || ev.metadata?.primaryId);
        const targetId = ev.secondaryEntityId !== null && ev.secondaryEntityId !== undefined ? ev.secondaryEntityId : (ev.metadata?.targetId || ev.metadata?.victimId || ev.metadata?.secondaryId);
        const actorName = ev.metadata?.attackerName || ev.metadata?.primaryName || (actorId ? (entityRegistry?.get(actorId)?.properties?.name || `Entity #${actorId}`) : null);
        const targetName = ev.metadata?.targetName || ev.metadata?.victimName || ev.metadata?.secondaryName || (targetId ? (entityRegistry?.get(targetId)?.properties?.name || `Entity #${targetId}`) : null);

        const tipLines = [
          `Type: [${ev.type}] (Event #${ev.id})`,
          `Time: Day ${ev.timestamp?.day || 0} at ${String(ev.timestamp?.hour || 0).padStart(2, "0")}:${String(ev.timestamp?.minute || 0).padStart(2, "0")} (Tick ${ev.tick})`,
          ev.location ? `Coordinates: [X: ${Math.floor(ev.location.x)}, Y: ${Math.floor(ev.location.y)}]` : "Coordinates: Global / Ambient",
          actorName ? `Actor/Attacker: ${actorName}${actorId !== null && actorId !== undefined ? ` (ID: #${actorId})` : ""}` : (actorId !== null && actorId !== undefined ? `Actor ID: #${actorId}` : null),
          targetName ? `Target/Victim: ${targetName}${targetId !== null && targetId !== undefined ? ` (ID: #${targetId})` : ""}` : (targetId !== null && targetId !== undefined ? `Target ID: #${targetId}` : null),
          ev.metadata?.hitPartName ? `Hit: ${ev.metadata.hitPartName} (${Math.round(ev.metadata.totalDamage || ev.metadata.netDamage || 0)} DMG)` : null,
          ev.metadata?.causedByBattleId ? `Succumbed to Battle #${ev.metadata.causedByBattleId} Wounds` : null
        ].filter(Boolean);
        setHoverTooltip(`Event #${ev.id}`, tipLines);
      }

      const ts = ev.timestamp ? `D${ev.timestamp.day} ${String(ev.timestamp.hour).padStart(2, "0")}:${String(ev.timestamp.minute).padStart(2, "0")}` : `T${ev.tick}`;
      drawText8x8(ts, mx + 18, rowY + 5, "#bcbcbc", 1);

      const typeColor = ev.type === "KILL" ? "#ff2040" : ev.type === "DEATH" ? "#9c5050" : ev.type === "ATTACK" ? "#f8b800" : ev.type === "AMPUTATION" ? "#e40058" : ev.type === "RELATION" ? "#d3869b" : ev.type === "DIALOGUE" ? "#3cbcfc" : ev.type === "BIRTH" ? "#58d854" : ev.type === "SPROUT" ? "#58d854" : "#ffffff";

      if (!isMobile) {
        drawText8x8(`[${ev.type}]`, mx + 115, rowY + 5, typeColor, 1);
        const locStr = ev.location ? `[${Math.floor(ev.location.x)},${Math.floor(ev.location.y)}] ` : "";
        const maxDescChars = Math.floor((mw - 260) / 8);
        const shortDesc = `${locStr}${ev.description}`.slice(0, maxDescChars).toUpperCase();
        drawText8x8(shortDesc, mx + 235, rowY + 5, "#ffffff", 1);
      } else {
        drawText8x8(`[${ev.type.slice(0, 4)}]`, mx + 86, rowY + 5, typeColor, 1);
        const maxDescChars = Math.max(8, Math.floor((mw - 156) / 8));
        const shortDesc = (ev.description || "").slice(0, maxDescChars).toUpperCase();
        drawText8x8(shortDesc, mx + 140, rowY + 5, "#ffffff", 1);
      }

      const curEv = ev;
      registerClickableRegion(mx + 12, rowY - 2, mw - 24, rowH, () => {
        inspectingLogEvent = curEv;
      });

      rowY += rowH;
    }
  }

  renderActiveHoverTooltip();
  ctx.restore();
}

function renderBattleDetailView(mx, my, mw, mh, battle) {
  drawText8x8(`BATTLE RECORD (#${battle.id}): ${battle.name}`, mx + 16, my + 14, "#f83800", 1);

  // Close / Back button
  drawNESButton(mx + mw - 32, my + 6, 26, 24, "X", false, true);
  registerClickableRegion(mx + mw - 32, my + 6, 26, 24, () => {
    inspectingBattle = null;
  });

  // Top Summary Box
  drawNESBox(mx + 14, my + 38, mw - 28, 92);

  const timeStr = `TIME: DAY ${battle.timestamp?.day || 0} (TICKS ${battle.startTick}..${battle.endTick})`;
  drawText8x8(timeStr, mx + 26, my + 48, "#ffffff", 1);
  drawText8x8(`LOCATION: [X: ${battle.location.x}, Y: ${battle.location.y}]`, mx + 340, my + 48, "#3cbcfc", 1);

  // Initiator link
  const initLabel = `INITIATOR: [${battle.initiator.name.toUpperCase()} (${battle.initiator.clan.toUpperCase()})]`;
  const isInitHover = mouseX >= mx + 26 && mouseX <= mx + 26 + initLabel.length * 8 && mouseY >= my + 64 && mouseY <= my + 78;
  drawText8x8(initLabel, mx + 26, my + 66, isInitHover ? "#ffd700" : "#58d854", 1);
  if (battle.initiator.id) {
    const initId = battle.initiator.id;
    registerClickableRegion(mx + 26, my + 64, initLabel.length * 8, 14, () => {
      lastSelectedId = initId;
      currentMode = "INSPECT";
      inspectingBattle = null;
    });
  }

  // Defender link
  const defLabel = `DEFENDER: [${battle.defender.name.toUpperCase()} (${battle.defender.clan.toUpperCase()})]`;
  const isDefHover = mouseX >= mx + 380 && mouseX <= mx + 380 + defLabel.length * 8 && mouseY >= my + 64 && mouseY <= my + 78;
  drawText8x8(defLabel, mx + 380, my + 66, isDefHover ? "#ffd700" : "#3cbcfc", 1);
  if (battle.defender.id) {
    const defId = battle.defender.id;
    registerClickableRegion(mx + 380, my + 64, defLabel.length * 8, 14, () => {
      lastSelectedId = defId;
      currentMode = "INSPECT";
      inspectingBattle = null;
    });
  }

  // Provocation / Estopim
  drawText8x8(`CAUSE / TRIGGER: ${battle.triggerCause}`, mx + 26, my + 84, "#ffd700", 1);
  drawText8x8(`TOTAL CASUALTIES: ${battle.amputations.length} AMPUTATIONS, ${battle.fatalities.length} FATALITIES • ${Math.round(battle.totalDamage)} TOTAL DAMAGE DEALT`, mx + 26, my + 102, "#f87858", 1);

  // Combatants Roster & Strikes Timeline Split
  const splitY = my + 136;
  const splitH = mh - 190;
  const halfW = Math.floor((mw - 34) / 2);
  const maxRows = Math.floor((splitH - 40) / 22);

  // Left Box: Combatants Roster
  drawNESBox(mx + 14, splitY, halfW, splitH);
  drawText8x8(`COMBATANTS PARTICIPATION (${battle.combatants.length}):`, mx + 24, splitY + 10, "#ffd700", 1);

  let cY = splitY + 28;
  const cStart = Math.min(modalScroll, Math.max(0, battle.combatants.length - maxRows));
  for (let i = cStart; i < battle.combatants.length; i++) {
    if (cY > splitY + splitH - 24) break;
    const c = battle.combatants[i];
    const isAlive = !c.isDead;
    const statusBadge = isAlive ? "[ALIVE]" : "[DEAD]";
    const statusCol = isAlive ? "#58d854" : "#f83800";

    drawText8x8(statusBadge, mx + 24, cY + 4, statusCol, 1);
    drawText8x8(`${c.name.slice(0, 16)} (${c.clan.slice(0, 10)})`, mx + 85, cY + 4, "#ffffff", 1);
    drawText8x8(`${c.hitsDealt} HITS (${Math.round(c.damageDealt)} DMG)`, mx + halfW - 130, cY + 4, "#bcbcbc", 1);

    const curC = c;
    drawNESButton(mx + halfW - 45, cY + 1, 40, 18, "VIEW", false, false);
    registerClickableRegion(mx + halfW - 45, cY + 1, 40, 18, () => {
      lastSelectedId = curC.id;
      currentMode = "INSPECT";
      inspectingBattle = null;
    });

    cY += 22;
  }

  // Right Box: Timeline of Battle Events
  drawNESBox(mx + 14 + halfW + 6, splitY, halfW, splitH);
  drawText8x8(`BATTLE TIMELINE (${battle.events.length} STRIKES/ACTIONS):`, mx + 24 + halfW + 6, splitY + 10, "#ffd700", 1);

  let eY = splitY + 28;
  const eStart = Math.min(modalScroll, Math.max(0, battle.events.length - maxRows));
  for (let i = eStart; i < battle.events.length; i++) {
    if (eY > splitY + splitH - 24) break;
    const ev = battle.events[i];
    const typeCol = ev.type === "DEATH" ? "#f83800" : ev.type === "AMPUTATION" ? "#e40058" : "#f8b800";
    drawText8x8(`[${ev.type}]`, mx + 24 + halfW + 6, eY + 4, typeCol, 1);

    const desc = (ev.description || "Strike").slice(0, Math.floor((halfW - 80) / 8));
    drawText8x8(desc, mx + 115 + halfW + 6, eY + 4, "#ffffff", 1);

    const curEv = ev;
    drawNESButton(mx + halfW + halfW - 45, eY + 1, 36, 18, "LOG", false, false);
    registerClickableRegion(mx + halfW + halfW - 45, eY + 1, 36, 18, () => {
      inspectingLogEvent = curEv;
    });

    eY += 22;
  }

  // Bottom Action Bar
  drawNESButton(mx + 20, my + mh - 44, 180, 28, "JUMP TO BATTLE MAP", false, false);
  registerClickableRegion(mx + 20, my + mh - 44, 180, 28, () => {
    focusLocation(battle.location.x, battle.location.y, 2.0);
  });

  drawNESButton(mx + mw - 150, my + mh - 44, 130, 28, "BACK TO LOGS", false, false);
  registerClickableRegion(mx + mw - 150, my + mh - 44, 130, 28, () => {
    inspectingBattle = null;
  });
}

function renderRelationshipModal(mx, my, mw, mh, rel) {
  drawText8x8(`RELATIONSHIP DOSSIER: ${rel.entA.name.toUpperCase()} & ${rel.entB.name.toUpperCase()}`, mx + 16, my + 14, "#f8b800", 1);

  // Close X Button
  drawNESButton(mx + mw - 32, my + 6, 26, 24, "X", false, true);
  registerClickableRegion(mx + mw - 32, my + 6, 26, 24, () => {
    inspectingRelationship = null;
  });

  // Top Status Box
  drawNESBox(mx + 14, my + 38, mw - 28, 80);

  drawText8x8(`SENTIMENT STATUS: ${rel.statusLabel}`, mx + 26, my + 50, rel.statusColor, 1);
  drawText8x8(`MUTUAL AFFINITY SCORE: ${rel.affinityScore > 0 ? "+" : ""}${rel.affinityScore}`, mx + 380, my + 50, "#ffd700", 1);

  const b = rel.breakdown;
  const breakStr = `KISSES: ${b.kisses} | HUGS: ${b.hugs} | PRAISES: ${b.praises} | INSULTS: ${b.insults} | ATTACKS: ${b.attacks} | FABRICATED LIES: ${b.lies}`;
  drawText8x8(breakStr, mx + 26, my + 72, "#3cbcfc", 1);

  // Chronological Mutual History Box
  const listY = my + 124;
  const listH = mh - 176;
  drawNESBox(mx + 14, listY, mw - 28, listH);
  drawText8x8(`SHARED INTERACTION CHRONICLE (${rel.events.length} TOTAL INTERACTIONS):`, mx + 24, listY + 10, "#ffd700", 1);

  if (rel.events.length === 0) {
    drawText8x8("NO DIRECT SOCIAL INTERACTIONS RECORDED BETWEEN THESE TWO CREATURES.", mx + 24, listY + 34, "#bcbcbc", 1);
  } else {
    let curY = listY + 30;
    for (let i = 0; i < rel.events.length; i++) {
      if (curY > listY + listH - 24) break;
      const ev = rel.events[i];
      const typeCol = ev.type === "KILL" ? "#ff2040" : ev.type === "DEATH" ? "#9c5050" : ev.type === "ATTACK" ? "#f8b800" : ev.type === "AMPUTATION" ? "#e40058" : ev.type === "RELATION" ? "#d3869b" : ev.type === "DIALOGUE" ? "#3cbcfc" : "#ffffff";
      const ts = ev.timestamp ? `D${ev.timestamp.day} ${String(ev.timestamp.hour).padStart(2, "0")}:${String(ev.timestamp.minute).padStart(2, "0")}` : `T${ev.tick}`;

      drawText8x8(ts, mx + 24, curY + 4, "#bcbcbc", 1);
      drawText8x8(`[${ev.type}]`, mx + 110, curY + 4, typeCol, 1);
      drawText8x8((ev.description || "").slice(0, Math.floor((mw - 220) / 8)), mx + 220, curY + 4, "#ffffff", 1);

      const curEv = ev;
      drawNESButton(mx + mw - 70, curY + 1, 48, 18, "INSPECT", false, false);
      registerClickableRegion(mx + mw - 70, curY + 1, 48, 18, () => {
        inspectingLogEvent = curEv;
      });

      // Click row to inspect
      registerClickableRegion(mx + 20, curY, mw - 100, 20, () => {
        inspectingLogEvent = curEv;
      });

      curY += 22;
    }
  }

  // Bottom Back Button
  drawNESButton(mx + mw - 180, my + mh - 44, 160, 28, "BACK TO EVENT", false, false);
  registerClickableRegion(mx + mw - 180, my + mh - 44, 160, 28, () => {
    inspectingRelationship = null;
  });
}

function renderLogDetailView(mx, my, mw, mh, ev) {
  const typeColor = ev.type === "KILL" ? "#ff2040" : ev.type === "DEATH" ? "#9c5050" : ev.type === "ATTACK" ? "#f8b800" : ev.type === "AMPUTATION" ? "#e40058" : ev.type === "RELATION" ? "#d3869b" : ev.type === "DIALOGUE" ? "#3cbcfc" : ev.type === "BIRTH" ? "#f8b800" : ev.type === "LIE" ? "#fa5078" : ev.type === "SPROUT" ? "#58d854" : "#ffffff";

  drawText8x8(`EVENT DETAIL (#${ev.id})`, mx + 16, my + 14, "#f8b800", 1);

  // Close X Button
  drawNESButton(mx + mw - 32, my + 6, 26, 24, "X", false, true);
  registerClickableRegion(mx + mw - 32, my + 6, 26, 24, () => {
    inspectingLogEvent = null;
  });

  const isLie = ev.opcode === 18 || ev.type === "LIE" || !!ev.metadata?.isLie;
  if (isLie) {
    drawText8x8("[FABRICATED LIE]", mx + 190, my + 14, "#fa5078", 1);
  }

  // Detail Container Box
  drawNESBox(mx + 14, my + 38, mw - 28, mh - 50);

  drawText8x8(`EVENT TYPE: [${ev.type}]`, mx + 30, my + 56, typeColor, 1);

  const ts = ev.timestamp ? `DAY ${ev.timestamp.day} ${String(ev.timestamp.hour).padStart(2, "0")}:${String(ev.timestamp.minute).padStart(2, "0")}` : `TICK ${ev.tick}`;
  drawText8x8(`TIME: ${ts}`, mx + 30, my + 76, "#ffffff", 1);

  if (ev.location) {
    drawText8x8(`COORDINATES: [X: ${Math.floor(ev.location.x)}, Y: ${Math.floor(ev.location.y)}]`, mx + 30, my + 96, "#bcbcbc", 1);
  }

  let entButtonX = mx + 30;
  if (ev.primaryEntityId !== null && ev.primaryEntityId !== undefined) {
    const pEnt = entityRegistry.get(ev.primaryEntityId);
    const pName = (pEnt?.properties?.name || `Entity #${ev.primaryEntityId}`).slice(0, 16);
    drawNESButton(entButtonX, my + 114, 180, 22, `ACTOR: ${pName.toUpperCase()}`, false, false);
    registerClickableRegion(entButtonX, my + 114, 180, 22, () => {
      lastSelectedId = ev.primaryEntityId;
      currentMode = "INSPECT";
      inspectingLogEvent = null;
    });
    entButtonX += 190;
  }

  if (ev.secondaryEntityId !== null && ev.secondaryEntityId !== undefined) {
    const sEnt = entityRegistry.get(ev.secondaryEntityId);
    const sName = (sEnt?.properties?.name || `Entity #${ev.secondaryEntityId}`).slice(0, 16);
    drawNESButton(entButtonX, my + 114, 180, 22, `TARGET: ${sName.toUpperCase()}`, false, false);
    registerClickableRegion(entButtonX, my + 114, 180, 22, () => {
      lastSelectedId = ev.secondaryEntityId;
      currentMode = "INSPECT";
      inspectingLogEvent = null;
    });
    entButtonX += 190;
  }

  // View Relationship Summary Button (if two entities are involved)
  if (ev.primaryEntityId && ev.secondaryEntityId && ev.primaryEntityId !== ev.secondaryEntityId) {
    const pId = ev.primaryEntityId;
    const sId = ev.secondaryEntityId;
    drawNESButton(entButtonX, my + 114, 180, 22, "RELATIONSHIP DOSSIER", false, false);
    registerClickableRegion(entButtonX, my + 114, 180, 22, () => {
      const rel = getRelationshipSummary(pId, sId, entityRegistry);
      if (rel) {
        inspectingRelationship = rel;
      }
    });
    entButtonX += 190;
  }

  // Linked / Cited Event Button or Linked Battle Record
  const citedId = ev.metadata?.referencedEventId || ev.metadata?.gossipedEventId || ev.metadata?.realEventId || ev.metadata?.citedEventId;
  if (citedId) {
    const citedEv = getEventById(citedId);
    const citedLabel = isLie ? `ORIGINAL TRUTH #${citedId}` : `GOSSIP TOPIC #${citedId}`;
    drawNESButton(entButtonX, my + 114, 180, 22, citedLabel, false, false);
    registerClickableRegion(entButtonX, my + 114, 180, 22, () => {
      if (citedEv) {
        inspectingLogEvent = citedEv;
      }
    });
  }

  // Citations / Chronicles List
  const citations = getCitationsForEvent(ev.id, 4);
  const hasCitations = citations.length > 0;
  const narrativeBoxH = hasCitations ? mh - 310 : mh - 230;

  // Full Unwrapped Narrative Box
  drawNESBox(mx + 30, my + 145, mw - 60, narrativeBoxH);
  drawText8x8("FULL NARRATIVE LOG:", mx + 42, my + 158, "#f8b800", 1);

  const maxCharsPerLine = Math.floor((mw - 84) / 8);
  const wrappedLines = wrapText8x8((ev.description || "NO DESCRIPTION RECORDED.").toUpperCase(), maxCharsPerLine);
  let narrativeY = my + 176;

  for (const wline of wrappedLines) {
    if (narrativeY > my + 145 + narrativeBoxH - 16) break;
    drawText8x8(wline, mx + 42, narrativeY, "#ffffff", 1);
    narrativeY += 14;
  }

  // Citations Box
  if (hasCitations) {
    const citeBoxY = my + 145 + narrativeBoxH + 10;
    const citeBoxH = 72;
    drawNESBox(mx + 30, citeBoxY, mw - 60, citeBoxH);
    drawText8x8(`CITATIONS & CHRONICLES (${citations.length}):`, mx + 42, citeBoxY + 8, "#f8b800", 1);

    let curCiteY = citeBoxY + 24;
    for (let i = 0; i < citations.length; i++) {
      const cev = citations[i];
      const ts = cev.timestamp ? `D${cev.timestamp.day} ${String(cev.timestamp.hour).padStart(2, "0")}:${String(cev.timestamp.minute).padStart(2, "0")}` : `T${cev.tick}`;
      const cTypeCol = cev.type === "LIE" ? "#fa5078" : cev.type === "KILL" ? "#ff2040" : cev.type === "DIALOGUE" ? "#3cbcfc" : "#f8b800";
      drawText8x8(`${ts} [${cev.type}]`, mx + 42, curCiteY + 4, cTypeCol, 1);

      const cdesc = (cev.description || "Event").slice(0, 44).toUpperCase();
      drawText8x8(cdesc, mx + 175, curCiteY + 4, "#bcbcbc", 1);

      const curCev = cev;
      drawNESButton(mx + mw - 140, curCiteY, 90, 18, "INSPECT", false, false);
      registerClickableRegion(mx + mw - 140, curCiteY, 90, 18, () => {
        inspectingLogEvent = curCev;
      });

      curCiteY += 22;
      if (curCiteY > citeBoxY + citeBoxH - 18) break;
    }
  }

  // Action Buttons inside Detail view
  if (ev.location) {
    drawNESButton(mx + 30, my + mh - 70, 200, 30, "JUMP TO LOCATION", false, false);
    registerClickableRegion(mx + 30, my + mh - 70, 200, 30, () => {
      focusLocation(ev.location.x, ev.location.y, 2.0);
    });
  }

  const backLabel = inspectingFromCreature ? "BACK TO CREATURE" : ((currentMode === "GROUPS" || inspectingGroup) ? "BACK TO CLAN" : "BACK TO LOGS");
  drawNESButton(mx + mw - 190, my + mh - 70, 160, 30, backLabel, false, false);
  registerClickableRegion(mx + mw - 190, my + mh - 70, 160, 30, () => {
    inspectingLogEvent = null;
    if (inspectingFromCreature) {
      currentMode = "INSPECT";
      inspectingFromCreature = false;
    }
  });
}

// ---------------------------------------------------------------------------
// 6. In-Engine Modal 5: Real-Time Map & World Editor ([S])
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 6. Real-Time Floating Corner Map & World Editor Bar ([S])
// ---------------------------------------------------------------------------

function renderCompactEditorPanel() {
  if (!isEditorOpen || currentMode !== "MAP") return;

  const isMobile = CANVAS_WIDTH <= 680;
  const pw = isMobile ? CANVAS_WIDTH - 16 : 288;
  const ph = isMobile ? 320 : 428;
  const px = isMobile ? 8 : CANVAS_WIDTH - pw - 10;
  const py = isMobile ? CANVAS_HEIGHT - ph - 48 : 38;

  // 1. Outer NES Window Box
  drawNESBox(px, py, pw, ph);

  // 2. Header Title & Close Button
  drawText8x8("MAP EDITOR", px + 10, py + 10, "#f8b800", 1);
  drawNESButton(px + pw - 22, py + 6, 16, 16, "X", false, true);
  registerClickableRegion(px + pw - 22, py + 6, 16, 16, () => {
    isEditorOpen = false;
    editorTool = null;
    editorActiveSpawner = null;
    isPainting = false;
  });

  // 3. Category Tabs: [TILE] [FLORA] [BUILD] [MOBS] [ITEM] [TOOL]
  const tabs = [
    { id: "TILES", label: "TILE" },
    { id: "NATURE", label: "FLORA" },
    { id: "BUILD", label: "BUILD" },
    { id: "CREATURES", label: "MOBS" },
    { id: "ITEMS", label: "ITEM" },
    { id: "TOOLS", label: "TOOL" }
  ];

  const tabW = Math.floor((pw - 24) / tabs.length);
  let tabX = px + 8;
  for (const t of tabs) {
    const isAct = editorTab === t.id;
    drawNESButton(tabX, py + 26, tabW, 20, t.label, isAct, false);
    const tabId = t.id;
    registerClickableRegion(tabX, py + 26, tabW, 20, () => {
      editorTab = tabId;
      editorPage = 0;
    });
    tabX += tabW + 2;
  }

  const contentY = py + 52;
  const contentH = ph - 114;

  // Inner NES Content Frame
  drawNESBox(px + 8, contentY, pw - 16, contentH);

  // TAB 1: TILES (Terrains & Roads)
  if (editorTab === "TILES") {
    drawText8x8("TERRAINS & ROADS:", px + 14, contentY + 8, "#3cbcfc", 1);

    const cols = 3;
    const colW = Math.floor((pw - 36) / cols);
    const itemH = 22;

    for (let i = 0; i < EDITOR_TILES.length; i++) {
      const tile = EDITOR_TILES[i];
      const col = i % cols;
      const row = Math.floor(i / cols);
      const bx = px + 14 + col * (colW + 4);
      const by = contentY + 22 + row * (itemH + 4);
      const isSel = editorTool === "PAINT" && editorSelectedTile === tile.id;

      drawNESButton(bx, by, colW, itemH, ` ${tile.label.slice(0, 6)}`, isSel, false);

      // Mini Color Swatch
      ctx.fillStyle = tile.color;
      ctx.fillRect(bx + 3, by + 5, 8, 8);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1;
      ctx.strokeRect(bx + 3, by + 5, 8, 8);

      const tileId = tile.id;
      registerClickableRegion(bx, by, colW, itemH, () => {
        editorSelectedTile = tileId;
        editorTool = "PAINT";
        editorActiveSpawner = null;
      });
    }

    // Brush Radius Selection
    const brushY = contentY + 114;
    drawText8x8("BRUSH RADIUS:", px + 14, brushY, "#f8b800", 1);
    const sizes = [1, 3, 5, 9];
    let bsizeX = px + 14;
    const bsizeW = Math.floor((pw - 36 - 12) / 4);
    for (const sz of sizes) {
      const isAct = editorBrushSize === sz;
      drawNESButton(bsizeX, brushY + 14, bsizeW, 22, `${sz}x${sz}`, isAct, false);
      const sizeVal = sz;
      registerClickableRegion(bsizeX, brushY + 14, bsizeW, 22, () => {
        editorBrushSize = sizeVal;
        editorTool = "PAINT";
      });
      bsizeX += bsizeW + 4;
    }
  }

  // Helper renderer for paginated item lists (FLORA, BUILD, MOBS, ITEMS)
  function renderPaginatedList(title, items, color) {
    const itemsPerPage = 10;
    const maxPages = Math.max(1, Math.ceil(items.length / itemsPerPage));
    drawText8x8(`${title} (P.${editorPage + 1}/${maxPages}):`, px + 14, contentY + 8, color, 1);

    const cols = 2;
    const colW = Math.floor((pw - 36) / cols);
    const itemH = 20;

    const startIdx = editorPage * itemsPerPage;
    const pageItems = items.slice(startIdx, startIdx + itemsPerPage);

    for (let i = 0; i < pageItems.length; i++) {
      const it = pageItems[i];
      const col = i % cols;
      const row = Math.floor(i / cols);
      const bx = px + 14 + col * (colW + 6);
      const by = contentY + 22 + row * (itemH + 3);
      const isSel = editorTool === "SPAWN" && (editorActiveSpawner?.id === it.id || editorActiveSpawner?.label === it.label);

      drawNESButton(bx, by, colW, itemH, `+${it.label.slice(0, 11)}`, isSel, false);

      const spawnerObj = it;
      registerClickableRegion(bx, by, colW, itemH, () => {
        editorActiveSpawner = spawnerObj;
        editorTool = "SPAWN";
      });
    }

    // Pagination buttons
    const pageY = contentY + 146;
    const halfBtnW = Math.floor((pw - 36) / 2);
    drawNESButton(px + 14, pageY, halfBtnW, 22, "◀ PREV", false, false);
    registerClickableRegion(px + 14, pageY, halfBtnW, 22, () => {
      editorPage = (editorPage - 1 + maxPages) % maxPages;
    });

    drawNESButton(px + 14 + halfBtnW + 6, pageY, halfBtnW, 22, "NEXT ▶", false, false);
    registerClickableRegion(px + 14 + halfBtnW + 6, pageY, halfBtnW, 22, () => {
      editorPage = (editorPage + 1) % maxPages;
    });
  }

  // TAB 2: NATURE & FLORA
  if (editorTab === "NATURE") {
    renderPaginatedList("FLORA & RESOURCES", EDITOR_NATURE, "#58d854");
  }

  // TAB 3: BUILDINGS & STRUCTURES
  else if (editorTab === "BUILD") {
    renderPaginatedList("STRUCTURES & WALLS", EDITOR_BUILDINGS, "#f8b800");
  }

  // TAB 4: CREATURES / MOBS
  else if (editorTab === "CREATURES") {
    renderPaginatedList("SPAWN MOBS", EDITOR_CREATURES, "#3cbcfc");
  }

  // TAB 5: ITEMS & DISHES
  else if (editorTab === "ITEMS") {
    renderPaginatedList("ITEMS & FOODS", EDITOR_ITEMS, "#f87858");
  }

  // TAB 6: TOOLS
  else if (editorTab === "TOOLS") {
    drawText8x8("MAP TOOLS:", px + 14, contentY + 8, "#3cbcfc", 1);

    const tools = [
      { id: "PAINT", label: "TERRAIN BRUSH" },
      { id: "EYEDROPPER", label: "EYEDROPPER (SAMPLE)" },
      { id: "BULLDOZER", label: "BULLDOZER (DEMOLISH)" }
    ];

    let toolY = contentY + 22;
    for (const t of tools) {
      const isAct = editorTool === t.id;
      drawNESButton(px + 14, toolY, pw - 28, 28, t.label, isAct, t.id === "BULLDOZER");

      const toolId = t.id;
      registerClickableRegion(px + 14, toolY, pw - 28, 28, () => {
        editorTool = toolId;
        if (toolId !== "SPAWN") editorActiveSpawner = null;
      });

      toolY += 36;
    }
  }

  // Bottom Quick Status & Instructions (NES Box)
  const footerY = py + ph - 54;
  drawNESBox(px + 8, footerY, pw - 16, 46);

  let activeStr = "NONE";
  if (editorTool === "PAINT") {
    const tileObj = EDITOR_TILES.find(t => t.id === editorSelectedTile);
    activeStr = `TILE: ${tileObj?.label || "TILE"} (${editorBrushSize}x${editorBrushSize})`;
  } else if (editorTool === "SPAWN") {
    activeStr = `SPAWN: ${editorActiveSpawner?.label || "MOB"}`;
  } else if (editorTool === "BULLDOZER") {
    activeStr = "BULLDOZER (DEMOLISH)";
  } else if (editorTool === "EYEDROPPER") {
    activeStr = "EYEDROPPER (SAMPLE)";
  }

  drawText8x8(`ACTIVE: ${activeStr.slice(0, 24)}`, px + 14, footerY + 7, "#f8b800", 1);
  drawText8x8("L-CLICK: APPLY / DRAG: PAINT", px + 14, footerY + 20, "#58d854", 1);
  drawText8x8("R-CLICK: PAN | ESC: CLOSE", px + 14, footerY + 32, "#bcbcbc", 1);
}

function renderMapEditorOverlay() {
  if (!world || !isEditorOpen || !editorTool) return;

  const hoverTile = getEditorHoverTile();
  const hoverTileX = hoverTile.x;
  const hoverTileY = hoverTile.y;

  const isMobile = CANVAS_WIDTH <= 680;
  const pw = isMobile ? CANVAS_WIDTH - 16 : 288;
  const ph = isMobile ? 320 : 428;
  const px = isMobile ? 8 : CANVAS_WIDTH - pw - 10;
  const py = isMobile ? CANVAS_HEIGHT - ph - 48 : 38;
  const isOverPanel = mouseX >= px && mouseX <= px + pw && mouseY >= py && mouseY <= py + ph;

  // If hovering over active map area and not over the docked corner panel
  if (!isOverPanel && mouseY > 32 && mouseY < CANVAS_HEIGHT - 36 && mouseX >= 0 && mouseX <= CANVAS_WIDTH) {
    ctx.save();
    const infoX = Math.min(CANVAS_WIDTH - 240, mouseX + 16);
    const infoY = Math.max(52, mouseY - 14);

    const tileObj = EDITOR_TILES.find(t => t.id === editorSelectedTile);

    if (editorTool === "PAINT") {
      const tileName = tileObj?.label || "TILE";
      const badge = `PAINT [${hoverTileX},${hoverTileY}] (${editorBrushSize}x${editorBrushSize}): ${tileName}`;
      drawText8x8(badge, infoX, infoY, tileObj?.color || "#f8b800", 1);
    } else if (editorTool === "SPAWN" && editorActiveSpawner) {
      drawText8x8(`SPAWN [${hoverTileX},${hoverTileY}]: ${editorActiveSpawner.label}`, infoX, infoY, "#58d854", 1);
    } else if (editorTool === "BULLDOZER") {
      drawText8x8(`DEMOLISH [${hoverTileX},${hoverTileY}]`, infoX, infoY, "#e40058", 1);
    } else if (editorTool === "EYEDROPPER") {
      drawText8x8(`SAMPLE [${hoverTileX},${hoverTileY}]`, infoX, infoY, "#3cbcfc", 1);
    }

    if (!is3DMode && renderer) {
      const zoom = renderer.getCameraZoom();
      const tileSize = 16.0 * zoom;
      const cx = renderer.getCameraX();
      const cy = renderer.getCameraY();
      const centerScreenX = CANVAS_WIDTH / 2;
      const centerScreenY = CANVAS_HEIGHT / 2;

      if (editorTool === "PAINT") {
        const half = Math.floor(editorBrushSize / 2);
        const startX = centerScreenX + (hoverTileX - half - cx) * tileSize;
        const startY = centerScreenY + (hoverTileY - half - cy) * tileSize;
        const boxSize = editorBrushSize * tileSize;

        ctx.strokeStyle = tileObj?.color || "#f8b800";
        ctx.lineWidth = 2;
        ctx.strokeRect(startX, startY, boxSize, boxSize);

        ctx.fillStyle = (tileObj?.color || "#f8b800") + "44";
        ctx.fillRect(startX, startY, boxSize, boxSize);
      } else {
        const startX = centerScreenX + (hoverTileX - cx) * tileSize;
        const startY = centerScreenY + (hoverTileY - cy) * tileSize;
        ctx.strokeStyle = (editorTool === "SPAWN") ? "#58d854" : (editorTool === "BULLDOZER" ? "#e40058" : "#3cbcfc");
        ctx.lineWidth = 2;
        ctx.strokeRect(startX, startY, tileSize, tileSize);
      }
    }
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// 7. Hover In-Game Floating Creature Tooltip (8x8 Font)
// ---------------------------------------------------------------------------

function renderHoverTooltip() {
  if (currentMode !== "MAP" || !world) return;
  if (mouseY < 36 || mouseY > CANVAS_HEIGHT - 40) return; // Don't show tooltip when hovering over HUD bars

  let hoveredEnt = null;

  if (is3DMode && rctRenderer) {
    const foundId = rctRenderer.getEntityAtScreen(mouseClientX, mouseClientY, entities);
    if (foundId > 0) {
      hoveredEnt = getEntityById(foundId);
    }
  } else if (renderer) {
    const zoom = renderer.getCameraZoom();
    const tileSize = 16.0 * zoom;
    const cx = renderer.getCameraX();
    const cy = renderer.getCameraY();
    const hoverTileX = Math.floor(cx + (mouseX - CANVAS_WIDTH / 2) / tileSize);
    const hoverTileY = Math.floor(cy + (mouseY - CANVAS_HEIGHT / 2) / tileSize);
    hoveredEnt = getEntityAtTile(hoverTileX, hoverTileY);
  }

  if (!hoveredEnt) return;

  const tw = 180;
  const th = 56;
  const tx = Math.min(CANVAS_WIDTH - tw - 12, mouseX + 16);
  const ty = Math.min(CANVAS_HEIGHT - th - 44, mouseY + 16);

  drawNESBox(tx, ty, tw, th);

  ctx.save();
  drawText8x8((hoveredEnt.properties.name || "ENTITY").slice(0, 18).toUpperCase(), tx + 8, ty + 10, "#f8b800", 1);
  drawText8x8(`SP:${(hoveredEnt.properties.species || "-").toUpperCase()}`, tx + 8, ty + 24, "#ffffff", 1);

  if (hoveredEnt.properties.life) {
    drawNESProgressBar(tx + 8, ty + 36, tw - 16, 12, hoveredEnt.properties.life.energy, hoveredEnt.properties.life.max || 100, "HP", "#58d854");
  } else {
    drawText8x8("ITEM / RESOURCE", tx + 8, ty + 38, "#3cbcfc", 1);
  }
  ctx.restore();
}

/**
 * Renders authentic creature perception vision ("Ver pelos olhos da criatura"):
 * - Active perception range: 100% full vibrant color
 * - Explored / Known zones: dimmed dark fog-of-war
 * - Unexplored / Unknown zones: pitch black
 */
function renderCreatureVisionOverlay() {
  if (currentMode !== "MAP" || !renderer || !world || !isCreatureVisionMode || lastSelectedId <= 0) return;
  const target = getEntityById(lastSelectedId);
  if (!target || target.destroyed) {
    isCreatureVisionMode = false;
    return;
  }

  const zoom = renderer.getCameraZoom();
  const tileSize = 16.0 * zoom;
  const camX = renderer.getCameraX();
  const camY = renderer.getCameraY();
  const centerScreenX = CANVAS_WIDTH / 2;
  const centerScreenY = CANVAS_HEIGHT / 2;

  const viewRange = target.properties.eye_left?.viewRange || target.properties.eye_right?.viewRange || 8;
  const creatureScreenX = centerScreenX + (target.x - camX) * tileSize + tileSize / 2;
  const creatureScreenY = centerScreenY + (target.y - camY) * tileSize + tileSize / 2;
  const visionRadiusPx = (viewRange + 0.6) * tileSize;

  const sz = getZoneSize();
  const curZx = Math.floor(target.x / sz);
  const curZy = Math.floor(target.y / sz);

  // In 3D Mode, do NOT draw 2D black rects over the 3D scene! Only draw the HUD badge text.
  if (is3DMode) {
    ctx.save();
    const badge = `[VISION: ${(target.properties.name || "CREATURE").toUpperCase()} | ZONE (${curZx},${curZy})]`;
    drawText8x8(badge, 8, CANVAS_HEIGHT - 48, "#ffd700", 1);
    ctx.restore();
    return;
  }

  // In 2D Mode: Draw pitch black on unknown zones and dark translucent on known explored zones
  const knownZones = new Set();
  knownZones.add(`${curZx}_${curZy}`);
  if (target.properties.brain?.geoMemory) {
    for (const k of Object.keys(target.properties.brain.geoMemory)) {
      knownZones.add(k);
    }
  }
  if (target.properties.group?.claimedZones) {
    for (const zk of target.properties.group.claimedZones) {
      const parts = zk.includes("_") ? zk.split("_") : zk.split(",");
      knownZones.add(`${parts[0]}_${parts[1]}`);
    }
  }

  const minTx = Math.floor(camX - (centerScreenX / tileSize) - 1);
  const maxTx = Math.ceil(camX + (centerScreenX / tileSize) + 1);
  const minTy = Math.floor(camY - (centerScreenY / tileSize) - 1);
  const maxTy = Math.ceil(camY + (centerScreenY / tileSize) + 1);

  const minZx = Math.floor(minTx / sz);
  const maxZx = Math.floor(maxTx / sz);
  const minZy = Math.floor(minTy / sz);
  const maxZy = Math.floor(maxTy / sz);

  ctx.save();

  for (let zy = minZy; zy <= maxZy; zy++) {
    for (let zx = minZx; zx <= maxZx; zx++) {
      const zk = `${zx}_${zy}`;
      const screenX = centerScreenX + (zx * sz - camX) * tileSize;
      const screenY = centerScreenY + (zy * sz - camY) * tileSize;
      const screenW = sz * tileSize;
      const screenH = sz * tileSize;

      if (!knownZones.has(zk)) {
        // UNKNOWN ZONE: Completely Solid Pitch Black
        ctx.fillStyle = "#000000";
        ctx.fillRect(screenX, screenY, screenW, screenH);
      } else if (zx === curZx && zy === curZy) {
        // CURRENT ACTIVE ZONE: 100% Full Bright Color
        continue;
      } else {
        // EXPLORED/KNOWN MEMORY ZONE: Dimmed Dark Translucent
        ctx.fillStyle = "rgba(0, 0, 0, 0.70)";
        ctx.fillRect(screenX, screenY, screenW, screenH);
      }
    }
  }

  // Draw clean subtle border around current zone
  const curScreenX = centerScreenX + (curZx * sz - camX) * tileSize;
  const curScreenY = centerScreenY + (curZy * sz - camY) * tileSize;
  const curScreenW = sz * tileSize;
  const curScreenH = sz * tileSize;
  ctx.strokeStyle = "rgba(255, 215, 0, 0.6)";
  ctx.lineWidth = 1;
  ctx.strokeRect(curScreenX, curScreenY, curScreenW, curScreenH);

  // Badge on screen
  const badge = `[VISION: ${(target.properties.name || "CREATURE").toUpperCase()} | ZONE (${curZx},${curZy})]`;
  drawText8x8(badge, 8, CANVAS_HEIGHT - 48, "#ffd700", 1);
  ctx.restore();
}

/**
 * Compact HUD Box with Summary Info and Quick Toggles for Selected Creature
 */
function renderCreatureSummaryBox() {
  if (currentMode !== "MAP" || lastSelectedId <= 0) return;
  const ent = getEntityById(lastSelectedId);
  if (!ent || ent.destroyed) return;

  const bx = 8;
  const by = 38;
  const bw = 240;
  const bh = 82;

  drawNESBox(bx, by, bw, bh);
  // Absorb clicks on summary box background so world selection is not triggered behind the HUD
  registerClickableRegion(bx, by, bw, bh, () => { });

  const nameStr = (ent.properties.name || `Entity #${ent.id}`).slice(0, 18).toUpperCase();
  drawText8x8(nameStr, bx + 8, by + 8, "#f8b800", 1);

  const isCreature = !!ent.properties.brain;
  const speciesStr = (ent.properties.species || (isCreature ? "Creature" : "Item")).toUpperCase();
  const clanStr = (ent.properties.group?.name || (isCreature ? "Solitary" : "Resource")).slice(0, 10).toUpperCase();
  drawText8x8(`${speciesStr} | ${clanStr}`, bx + 8, by + 20, "#3cbcfc", 1);

  if (ent.properties.life && isCreature) {
    drawNESProgressBar(bx + 8, by + 32, bw - 16, 12, ent.properties.life.energy, ent.properties.life.max || 100, "HP", "#58d854");
  } else {
    const info = ent.properties.edible ? `FOOD +${ent.properties.edible.nutrition}` : (ent.properties.resourceType ? `RESOURCE: ${ent.properties.resourceType.toUpperCase()}` : "ITEM / OBJECT");
    drawText8x8(info, bx + 8, by + 34, "#a0e0a0", 1);
  }

  // Toggles for Follow & Vision (Creatures only)
  if (isCreature) {
    const followTxt = isFollowMode ? "FOLLOW:ON" : "FOLLOW:OFF";
    drawNESButton(bx + 8, by + 50, 108, 24, followTxt, isFollowMode, false);
    registerClickableRegion(bx + 8, by + 50, 108, 24, () => {
      isFollowMode = !isFollowMode;
    });

    const visionTxt = isCreatureVisionMode ? "VISION:ON" : "VISION:OFF";
    drawNESButton(bx + 124, by + 50, 108, 24, visionTxt, isCreatureVisionMode, false);
    registerClickableRegion(bx + 124, by + 50, 108, 24, () => {
      isCreatureVisionMode = !isCreatureVisionMode;
    });
  }
}

/**
 * Bottom-Right Quadrant HUD Panel: Real-time specific Event Log for Selected Creature (No Coordinates)
 */
function renderCreatureEventLogPanel() {
  if (currentMode !== "MAP" || lastSelectedId <= 0 || inspectingLogEvent) return;
  const ent = getEntityById(lastSelectedId);
  if (!ent || ent.destroyed) return;

  const px = CANVAS_WIDTH - 386;
  const py = CANVAS_HEIGHT - 176;
  const pw = 378;
  const ph = 140;

  drawNESBox(px, py, pw, ph);
  // Absorb clicks so they don't click through to map
  registerClickableRegion(px, py, pw, ph, () => { });

  const nameStr = (ent.properties.name || `Entity #${ent.id}`).toUpperCase().slice(0, 16);
  drawText8x8(`* CHRONICLE: ${nameStr}`, px + 8, py + 8, "#ffd700", 1);

  // Full Log Button
  drawNESButton(px + pw - 88, py + 4, 80, 18, "FULL LOG", false, false);
  registerClickableRegion(px + pw - 88, py + 4, 80, 18, () => {
    inspectingFromCreature = "MAP";
    currentMode = "INSPECT";
    dossierTab = "CHRONICLE";
  });

  const creatureEvents = getEventsForEntity(ent.id, 5);
  if (creatureEvents.length === 0) {
    drawText8x8("NO HISTORICAL EVENTS RECORDED YET.", px + 10, py + 36, "#888888", 1);
    return;
  }

  let rowY = py + 26;
  for (let i = 0; i < creatureEvents.length; i++) {
    const ev = creatureEvents[i];
    const isHover = mouseX >= px + 6 && mouseX <= px + pw - 6 && mouseY >= rowY - 2 && mouseY <= rowY + 18;
    if (isHover) {
      ctx.fillStyle = "#202034";
      ctx.fillRect(px + 6, rowY - 2, pw - 12, 20);
    }

    const isLie = ev.opcode === 18 || ev.type === "LIE";
    const typeCol = isLie ? "#fa5078" : ev.type === "DEATH" ? "#f83800" : ev.type === "ATTACK" ? "#f8b800" : ev.type === "AMPUTATION" ? "#d3869b" : ev.type === "BIRTH" ? "#58d854" : ev.type === "RELATION" ? "#f878f8" : "#3cbcfc";
    const typeBadge = isLie ? "[LIE]" : `[${ev.type.slice(0, 4)}]`;

    // Strip location string coordinates (e.g. [X: 12, Y: 34] or [12,34]) as player is following creature
    const cleanDesc = (ev.description || "")
      .replace(/\s*\[X:\s*-?\d+,\s*Y:\s*-?\d+\]/gi, "")
      .replace(/\s*\[-?\d+,\s*-?\d+\]/gi, "")
      .trim()
      .toUpperCase();

    const maxChars = Math.floor((pw - 62) / 8);
    const shortDesc = cleanDesc.length > maxChars ? cleanDesc.slice(0, maxChars - 3) + "..." : cleanDesc;

    drawText8x8(typeBadge, px + 8, rowY + 2, typeCol, 1);
    drawText8x8(shortDesc, px + 54, rowY + 2, "#ffffff", 1);

    const curEv = ev;
    registerClickableRegion(px + 6, rowY - 2, pw - 12, 20, () => {
      inspectingLogEvent = curEv;
      inspectingFromCreature = "MAP";
    });

    rowY += 22;
  }
}

// ---------------------------------------------------------------------------
// 7. Options & Optimization Settings Modal
// ---------------------------------------------------------------------------

let optionsTab = "OPTIMIZATION"; // "OPTIMIZATION" | "GRAPHICS" | "SIMULATION"

const gameOptions = {
  maxWorldEvents: 0,        // 0 = Unlimited, 1000, 5000, 10000, 25000, 50000
  maxCreatureEvents: 0,     // 0 = Unlimited, 50, 100, 150, 250, 500
  max3DRenderDistance: 64,  // 0 = Full World, 24, 36, 48, 64, 96, 128
  targetFps: 60,            // 30, 60, 120, 0
  shadowQuality: 2048,      // 1024, 2048, 4096
  showBadges: true,
  showClanFlags: true,
};

function loadGameOptions() {
  try {
    const s = localStorage.getItem("brutopolis_options");
    if (s) {
      Object.assign(gameOptions, JSON.parse(s));
    }
  } catch (e) { }
  applyGameOptions();
}

function saveGameOptions() {
  try {
    localStorage.setItem("brutopolis_options", JSON.stringify(gameOptions));
  } catch (e) { }
  applyGameOptions();
}

function applyGameOptions() {
  setEventLogConfig({
    maxWorldEvents: gameOptions.maxWorldEvents,
    maxCreatureEvents: gameOptions.maxCreatureEvents
  });
  if (rctRenderer) {
    if (rctRenderer.setShadowQuality) rctRenderer.setShadowQuality(gameOptions.shadowQuality);
    if (rctRenderer.setOverheadBadgesVisible) rctRenderer.setOverheadBadgesVisible(gameOptions.showBadges);
  }
}

loadGameOptions();

function renderOptionsModal() {
  const isMobile = CANVAS_WIDTH <= 680;
  const mx = isMobile ? 6 : 30;
  const my = 36;
  const mw = isMobile ? CANVAS_WIDTH - 12 : CANVAS_WIDTH - 60;
  const mh = isMobile ? CANVAS_HEIGHT - 44 : CANVAS_HEIGHT - 72;

  ctx.save();
  ctx.fillStyle = "rgba(0, 0, 0, 0.94)";
  ctx.fillRect(0, 32, CANVAS_WIDTH, CANVAS_HEIGHT - 68);

  drawNESBox(mx, my, mw, mh);

  // Close Button
  drawNESButton(mx + mw - 32, my + 6, 26, 24, "X", false, true);
  registerClickableRegion(mx + mw - 32, my + 6, 26, 24, () => {
    if (hasActiveGame) {
      currentMode = "MAP";
      audio.stopInstance("menuTheme", false);
    } else {
      currentMode = "TITLE";
    }
  });

  drawText8x8("GAME SETTINGS & PERFORMANCE OPTIONS", mx + 16, my + 12, "#f8b800", 1);

  // Tabs
  let tabX = mx + 16;
  const tabY = my + 30;
  const tabs = [
    { id: "OPTIMIZATION", label: "OPTIMIZATION" },
    { id: "GRAPHICS", label: "GRAPHICS & 3D" },
    { id: "AUDIO", label: "AUDIO" }
  ];
  for (const t of tabs) {
    const isSel = optionsTab === t.id;
    const tw = isMobile ? 88 : 130;
    drawNESButton(tabX, tabY, tw, 22, t.label, isSel, false);
    const tid = t.id;
    registerClickableRegion(tabX, tabY, tw, 22, () => {
      optionsTab = tid;
    });
    tabX += tw + 6;
  }

  let curY = tabY + 34;

  if (optionsTab === "OPTIMIZATION") {
    // 1. Max World Chronicles / Events
    const curWorldLbl = gameOptions.maxWorldEvents === 0 ? "UNLIMITED" : `${gameOptions.maxWorldEvents.toLocaleString()}`;
    drawText8x8(`MAX WORLD CHRONICLES: [ ${curWorldLbl} ]`, mx + 16, curY, "#3cbcfc", 1);
    const worldLimits = [
      { val: 1000, label: "1,000" },
      { val: 5000, label: "5,000" },
      { val: 10000, label: "10,000" },
      { val: 25000, label: "25,000" },
      { val: 50000, label: "50,000" },
      { val: 0, label: "UNLIMITED" }
    ];
    let bx = mx + 16;
    for (const opt of worldLimits) {
      const isSel = gameOptions.maxWorldEvents === opt.val;
      const bw = isMobile ? 54 : 70;
      drawNESButton(bx, curY + 10, bw, 22, opt.label, isSel, false);
      const v = opt.val;
      registerClickableRegion(bx, curY + 10, bw, 22, () => {
        gameOptions.maxWorldEvents = v;
        saveGameOptions();
      });
      bx += bw + 4;
    }
    curY += 40;

    // 2. Max Chronicles Per Creature
    const curCreatureLbl = gameOptions.maxCreatureEvents === 0 ? "UNLIMITED" : `${gameOptions.maxCreatureEvents}`;
    drawText8x8(`MAX CHRONICLES PER CREATURE: [ ${curCreatureLbl} ]`, mx + 16, curY, "#3cbcfc", 1);
    const creatureLimits = [
      { val: 50, label: "50" },
      { val: 100, label: "100" },
      { val: 150, label: "150" },
      { val: 250, label: "250" },
      { val: 500, label: "500" },
      { val: 0, label: "UNLIMITED" }
    ];
    bx = mx + 16;
    for (const opt of creatureLimits) {
      const isSel = gameOptions.maxCreatureEvents === opt.val;
      const bw = isMobile ? 54 : 70;
      drawNESButton(bx, curY + 10, bw, 22, opt.label, isSel, false);
      const v = opt.val;
      registerClickableRegion(bx, curY + 10, bw, 22, () => {
        gameOptions.maxCreatureEvents = v;
        saveGameOptions();
      });
      bx += bw + 4;
    }
    curY += 40;

    // 3. 3D Render Distance (Chunk Radius in Tiles)
    const curDistLbl = gameOptions.max3DRenderDistance === 0 ? "FULL WORLD" : `${gameOptions.max3DRenderDistance} TILES`;
    drawText8x8(`3D CHUNK RENDER DISTANCE: [ ${curDistLbl} ]`, mx + 16, curY, "#3cbcfc", 1);
    const distOptions = [
      { val: 24, label: "24 T" },
      { val: 36, label: "36 T" },
      { val: 48, label: "48 T" },
      { val: 64, label: "64 T" },
      { val: 96, label: "96 T" },
      { val: 0, label: "FULL" }
    ];
    bx = mx + 16;
    for (const opt of distOptions) {
      const isSel = gameOptions.max3DRenderDistance === opt.val;
      const bw = isMobile ? 54 : 70;
      drawNESButton(bx, curY + 10, bw, 22, opt.label, isSel, false);
      const v = opt.val;
      registerClickableRegion(bx, curY + 10, bw, 22, () => {
        gameOptions.max3DRenderDistance = v;
        if (rctRenderer) {
          rctRenderer.max3DRenderDistance = v;
          if (rctRenderer.setFullWorld) {
            rctRenderer.setFullWorld(v === 0);
          }
          rctRenderer.lastBuiltCamTileX = -9999;
          rctRenderer.lastBuiltCamTileY = -9999;
        }
        saveGameOptions();
      });
      bx += bw + 4;
    }
    curY += 40;

    // 4. Target Framerate (FPS Cap)
    const curFpsLbl = gameOptions.targetFps === 0 ? "UNLIMITED" : `${gameOptions.targetFps} FPS`;
    drawText8x8(`TARGET FRAMERATE (FPS CAP): [ ${curFpsLbl} ]`, mx + 16, curY, "#3cbcfc", 1);
    const fpsOptions = [
      { val: 15, label: "15 FPS" },
      { val: 30, label: "30 FPS" },
      { val: 60, label: "60 FPS" }
    ];
    bx = mx + 16;
    for (const opt of fpsOptions) {
      const isSel = gameOptions.targetFps === opt.val;
      const bw = isMobile ? 64 : 80;
      drawNESButton(bx, curY + 10, bw, 22, opt.label, isSel, false);
      const v = opt.val;
      registerClickableRegion(bx, curY + 10, bw, 22, () => {
        gameOptions.targetFps = v;
        saveGameOptions();
      });
      bx += bw + 6;
    }
  } else if (optionsTab === "GRAPHICS") {
    // 1. Wireframe Mode
    const wireMode = rctRenderer?.getWireframeModeName ? rctRenderer.getWireframeModeName() : "OFF";
    drawText8x8(`WIREFRAME MODE: [ ${wireMode} ]`, mx + 16, curY, "#3cbcfc", 1);
    const wireOptions = [
      { id: 0, label: "OFF" },
      { id: 1, label: "GRID" },
      { id: 2, label: "FULL" }
    ];
    let bx = mx + 16;
    for (const wOpt of wireOptions) {
      const isSel = (rctRenderer?.wireframeMode || 0) === wOpt.id;
      const bw = isMobile ? 64 : 80;
      drawNESButton(bx, curY + 10, bw, 22, wOpt.label, isSel, false);
      const wid = wOpt.id;
      registerClickableRegion(bx, curY + 10, bw, 22, () => {
        if (rctRenderer) {
          rctRenderer.wireframeMode = wid;
          rctRenderer.applyWireframe();
        }
      });
      bx += bw + 6;
    }
    curY += 40;

    // 2. Resolution Scale
    const curRes = rctRenderer?.getResolutionName ? rctRenderer.getResolutionName() : "100%";
    drawText8x8(`RESOLUTION SCALE: [ ${curRes} ]`, mx + 16, curY, "#3cbcfc", 1);
    const resOptions = [
      { val: 0.25, label: "25%" },
      { val: 0.50, label: "50%" },
      { val: 0.75, label: "75%" },
      { val: 1.00, label: "100%" }
    ];
    bx = mx + 16;
    for (const opt of resOptions) {
      const isSel = (rctRenderer?.resolutionScale || 1.0) === opt.val;
      const bw = isMobile ? 54 : 70;
      drawNESButton(bx, curY + 10, bw, 22, opt.label, isSel, false);
      const v = opt.val;
      registerClickableRegion(bx, curY + 10, bw, 22, () => {
        if (rctRenderer?.setResolutionScale) rctRenderer.setResolutionScale(v);
        saveGameOptions();
      });
      bx += bw + 6;
    }
    curY += 40;

    // 3. Shadow Map & Quality
    const shdActive = rctRenderer?.isShadowsActive ? rctRenderer.isShadowsActive() : true;
    drawText8x8(`DIRECTIONAL SHADOWS: [ ${shdActive ? "ENABLED" : "DISABLED"} | ${gameOptions.shadowQuality}x${gameOptions.shadowQuality} ]`, mx + 16, curY, "#3cbcfc", 1);
    bx = mx + 16;
    drawNESButton(bx, curY + 10, 80, 22, shdActive ? "ON" : "OFF", shdActive, false);
    registerClickableRegion(bx, curY + 10, 80, 22, () => {
      if (rctRenderer?.toggleShadows) rctRenderer.toggleShadows();
    });
    bx += 88;

    const shdQualities = [
      { val: 1024, label: "1K (FAST)" },
      { val: 2048, label: "2K (HIGH)" },
      { val: 4096, label: "4K (ULTRA)" }
    ];
    for (const sq of shdQualities) {
      const isSel = gameOptions.shadowQuality === sq.val;
      const bw = 90;
      drawNESButton(bx, curY + 10, bw, 22, sq.label, isSel, false);
      const v = sq.val;
      registerClickableRegion(bx, curY + 10, bw, 22, () => {
        gameOptions.shadowQuality = v;
        if (rctRenderer?.setShadowQuality) rctRenderer.setShadowQuality(v);
        saveGameOptions();
      });
      bx += bw + 4;
    }
    curY += 40;

    // 4. Overhead Badges & Clan Flags
    drawText8x8(`OVERHEAD BILLBOARDS & BADGES:`, mx + 16, curY, "#3cbcfc", 1);
    bx = mx + 16;
    drawNESButton(bx, curY + 10, 130, 22, `BADGES: ${gameOptions.showBadges ? "ON" : "OFF"}`, gameOptions.showBadges, false);
    registerClickableRegion(bx, curY + 10, 130, 22, () => {
      gameOptions.showBadges = !gameOptions.showBadges;
      applyGameOptions();
      saveGameOptions();
    });
    bx += 138;
    drawNESButton(bx, curY + 10, 130, 22, `FLAGS: ${gameOptions.showClanFlags ? "ON" : "OFF"}`, gameOptions.showClanFlags, false);
    registerClickableRegion(bx, curY + 10, 130, 22, () => {
      gameOptions.showClanFlags = !gameOptions.showClanFlags;
      applyGameOptions();
      saveGameOptions();
    });
  } else if (optionsTab === "AUDIO") {
    // 1. Audio & Sound FX
    drawText8x8(`AUDIO & SOUND FX: [ ${isAudioMuted ? "MUTED" : "ENABLED"} ]`, mx + 16, curY, "#3cbcfc", 1);
    let bx = mx + 16;
    drawNESButton(bx, curY + 10, 140, 22, isAudioMuted ? "UNMUTE AUDIO" : "MUTE AUDIO", !isAudioMuted, false);
    registerClickableRegion(bx, curY + 10, 140, 22, toggleAudio);
  }

  // Footer: Back / Apply button
  const backLabel = hasActiveGame ? "BACK TO GAME" : "BACK TO MENU";
  drawNESButton(mx + mw - 140, my + mh - 30, 124, 24, backLabel, true, false);
  registerClickableRegion(mx + mw - 140, my + mh - 30, 124, 24, () => {
    if (hasActiveGame) {
      currentMode = "MAP";
      audio.stopInstance("menuTheme", false);
    } else {
      currentMode = "TITLE";
    }
  });

  ctx.restore();
}

// ---------------------------------------------------------------------------
// 8. World Generator & Map Configurator Modal
// ---------------------------------------------------------------------------

function renderGeneratorModal() {
  const isMobile = CANVAS_WIDTH <= 680;
  const mx = isMobile ? 6 : 30;
  const my = isMobile ? 36 : 36;
  const mw = isMobile ? CANVAS_WIDTH - 12 : CANVAS_WIDTH - 60;
  const mh = isMobile ? CANVAS_HEIGHT - 44 : CANVAS_HEIGHT - 72;

  ctx.save();
  ctx.fillStyle = "rgba(0, 0, 0, 0.94)";
  ctx.fillRect(0, 32, CANVAS_WIDTH, CANVAS_HEIGHT - 68);

  drawNESBox(mx, my, mw, mh);

  // Back to Title Menu
  drawNESButton(mx + mw - 145, my + 6, 138, 24, "BACK TO MENU", false, true);
  registerClickableRegion(mx + mw - 145, my + 6, 138, 24, () => {
    currentMode = hasActiveGame ? "MAP" : "TITLE";
  });

  drawText8x8("WORLD GENERATOR & CUSTOM CONFIGURATOR", mx + 16, my + 12, "#f8b800", 1);

  let curY = my + 32;

  // 1. World Preset
  drawText8x8("1. PRESET:", mx + 16, curY, "#3cbcfc", 1);
  const presets = [
    { id: 0, label: "ARCHIPELAGO" },
    { id: 1, label: "CONTINENT" },
    { id: 2, label: "HIGHLANDS" }
  ];
  let px = mx + 16;
  for (const p of presets) {
    const isSel = genPreset === p.id;
    const bw = 114;
    drawNESButton(px, curY + 10, bw, 22, p.label, isSel, false);
    const pid = p.id;
    registerClickableRegion(px, curY + 10, bw, 22, () => {
      genPreset = pid;
    });
    px += bw + 6;
  }

  curY += 38;

  // 2. Custom Dimensions (Width & Height)
  drawText8x8(`2. DIMENSIONS: [ ${genWidth} x ${genHeight} ]`, mx + 16, curY, "#3cbcfc", 1);

  // Quick size presets
  const quickSizes = [
    { w: 64, h: 64, label: "64x64" },
    { w: 128, h: 128, label: "128x128" },
    { w: 256, h: 256, label: "256x256" },
    { w: 512, h: 512, label: "512x512" },
    { w: 1024, h: 1024, label: "1024x1024" }
  ];
  let qx = mx + 16;
  for (const qs of quickSizes) {
    const isSel = genWidth === qs.w && genHeight === qs.h;
    const bw = 70;
    drawNESButton(qx, curY + 10, bw, 22, qs.label, isSel, false);
    const qw = qs.w;
    const qh = qs.h;
    registerClickableRegion(qx, curY + 10, bw, 22, () => {
      genWidth = qw;
      genHeight = qh;
    });
    qx += bw + 4;
  }

  // Fine Width / Height adjusters
  let adjX = qx + 8;
  drawText8x8("W:", adjX, curY + 14, "#ffffff", 1);
  drawNESButton(adjX + 18, curY + 10, 20, 22, "-", false, false);
  registerClickableRegion(adjX + 18, curY + 10, 20, 22, () => {
    genWidth = Math.max(64, genWidth - 64);
  });
  drawNESButton(adjX + 42, curY + 10, 20, 22, "+", false, false);
  registerClickableRegion(adjX + 42, curY + 10, 20, 22, () => {
    genWidth = Math.min(1024, genWidth + 64);
  });

  adjX += 74;
  drawText8x8("H:", adjX, curY + 14, "#ffffff", 1);
  drawNESButton(adjX + 18, curY + 10, 20, 22, "-", false, false);
  registerClickableRegion(adjX + 18, curY + 10, 20, 22, () => {
    genHeight = Math.max(64, genHeight - 64);
  });
  drawNESButton(adjX + 42, curY + 10, 20, 22, "+", false, false);
  registerClickableRegion(adjX + 42, curY + 10, 20, 22, () => {
    genHeight = Math.min(1024, genHeight + 64);
  });

  curY += 38;

  // 3. Macro-Chunk / Territory Zone Size
  drawText8x8(`3. MACRO-ZONE SIZE: [ ${genZoneSize}x${genZoneSize} TILES ]`, mx + 16, curY, "#3cbcfc", 1);
  const zoneSizes = [
    { sz: 4, label: "4x4 (MICRO)" },
    { sz: 8, label: "8x8 (NORMAL)" },
    { sz: 16, label: "16x16 (LARGE)" },
    { sz: 32, label: "32x32 (SECTOR)" }
  ];
  let zx = mx + 16;
  for (const zs of zoneSizes) {
    const isSel = genZoneSize === zs.sz;
    const bw = 120;
    drawNESButton(zx, curY + 10, bw, 22, zs.label, isSel, false);
    const zVal = zs.sz;
    registerClickableRegion(zx, curY + 10, bw, 22, () => {
      genZoneSize = zVal;
      setZoneSize(zVal);
    });
    zx += bw + 6;
  }

  curY += 38;

  // 4. Seed & Randomizer
  drawText8x8(`4. SEED: [ ${genSeed} ]`, mx + 16, curY, "#3cbcfc", 1);
  drawNESButton(mx + 16, curY + 10, 160, 22, "RANDOMIZE SEED", false, false);
  registerClickableRegion(mx + 16, curY + 10, 160, 22, () => {
    genSeed = Math.floor(Math.random() * 1000000) + 1;
  });

  curY += 38;

  // 5. Creature Population Density (Proportional)
  drawText8x8("5. WILD FAUNA (SCALED TO WORLD AREA):", mx + 16, curY, "#3cbcfc", 1);
  const cPops = ["NONE", "LOW", "STANDARD", "HIGH"];
  let cx = mx + 16;
  for (const cp of cPops) {
    const isSel = genCreatureDensity === cp;
    const bw = 95;
    drawNESButton(cx, curY + 10, bw, 22, cp, isSel, false);
    const cpVal = cp;
    registerClickableRegion(cx, curY + 10, bw, 22, () => {
      genCreatureDensity = cpVal;
    });
    cx += bw + 6;
  }

  curY += 38;

  // 6. Flora & Nature Density (Proportional)
  drawText8x8("6. FLORA & RESOURCES (SCALED TO WORLD AREA):", mx + 16, curY, "#3cbcfc", 1);
  const pDens = ["SPARSE", "NORMAL", "DENSE"];
  let plx = mx + 16;
  for (const pd of pDens) {
    const isSel = genPlantDensity === pd;
    const bw = 100;
    drawNESButton(plx, curY + 10, bw, 22, pd, isSel, false);
    const pdVal = pd;
    registerClickableRegion(plx, curY + 10, bw, 22, () => {
      genPlantDensity = pdVal;
    });
    plx += bw + 6;
  }

  curY += 38;

  // 7. Founding Pioneer Clans / Embarks (Freely selectable from 0 to 128+)
  drawText8x8(`7. EMBARKS / FOUNDING CLANS: [ ${genSpawnPioneers && genEmbarkCount > 0 ? genEmbarkCount + " CLANS" : "NONE"} ]`, mx + 16, curY, "#3cbcfc", 1);
  let ebx = mx + 16;

  // Stepper buttons [-10], [-1], [+1], [+10]
  const steppers = [
    { label: "-10", delta: -10 },
    { label: "-1", delta: -1 },
    { label: "+1", delta: 1 },
    { label: "+10", delta: 10 }
  ];
  for (const st of steppers) {
    const bw = 38;
    drawNESButton(ebx, curY + 10, bw, 22, st.label, false, false);
    const d = st.delta;
    registerClickableRegion(ebx, curY + 10, bw, 22, () => {
      let next = Math.max(0, Math.min(256, (genEmbarkCount || 0) + d));
      genEmbarkCount = next;
      genSpawnPioneers = next > 0;
    });
    ebx += bw + 4;
  }
  ebx += 8;

  // Quick Preset Buttons
  const presetEmbarks = [0, 1, 2, 3, 5, 8, 12, 16, 24, 32, 64];
  for (const cnt of presetEmbarks) {
    const isSel = genSpawnPioneers ? (genEmbarkCount === cnt) : (cnt === 0);
    const bw = cnt === 0 ? 56 : 30;
    const label = cnt === 0 ? "NONE" : String(cnt);
    drawNESButton(ebx, curY + 10, bw, 22, label, isSel, false);
    registerClickableRegion(ebx, curY + 10, bw, 22, () => {
      if (cnt === 0) {
        genSpawnPioneers = false;
        genEmbarkCount = 0;
      } else {
        genSpawnPioneers = true;
        genEmbarkCount = cnt;
      }
    });
    ebx += bw + 4;
  }

  // Return to Title Button
  drawNESButton(mx + mw - 180, my + 6, 140, 24, "TITLE MENU", false, false);
  registerClickableRegion(mx + mw - 180, my + 6, 140, 24, returnToTitleScreen);

  // Action Button at Bottom: [GENERATE WORLD]
  const genBtnW = 380;
  const genBtnX = mx + (mw - genBtnW) / 2;
  const genBtnY = my + mh - 36;
  const genBtnLabel = `GENERATE WORLD (${genWidth}x${genHeight} | ZONE ${genZoneSize}x${genZoneSize})`;
  drawNESButton(genBtnX, genBtnY, genBtnW, 28, genBtnLabel, true, false);
  registerClickableRegion(genBtnX, genBtnY, genBtnW, 28, () => {
    generateConfiguredWorld();
  });

  ctx.restore();
}

// ---------------------------------------------------------------------------
// 9. Title Screen & Prefab Scenarios Selector
// ---------------------------------------------------------------------------

function renderTitleScreen() {
  const isMobile = CANVAS_WIDTH <= 680;
  const isSmall = CANVAS_WIDTH < 920;

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  if ("mozImageSmoothingEnabled" in ctx) ctx.mozImageSmoothingEnabled = false;
  if ("webkitImageSmoothingEnabled" in ctx) ctx.webkitImageSmoothingEnabled = false;
  if ("msImageSmoothingEnabled" in ctx) ctx.msImageSmoothingEnabled = false;

  // Subtle dark gradient vignette for contrast and depth
  const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
  grad.addColorStop(0, "rgba(0, 0, 0, 0.65)");
  grad.addColorStop(0.35, "rgba(0, 0, 0, 0.15)");
  grad.addColorStop(0.70, "rgba(0, 0, 0, 0.35)");
  grad.addColorStop(1, "rgba(0, 0, 0, 0.85)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  // Logo Typography: BRUTOPOLIS CHRONICLES
  // "brutopolis" ~1/3 smaller than "chronicles", chronicles is yellow
  let chronScale = isMobile ? 3 : isSmall ? 5 : 6;
  let brutoScale = isMobile ? 2 : isSmall ? 3 : 4;

  const titleTopY = isMobile ? 28 : isSmall ? 48 : 64;
  const shadowOffset = isMobile ? 2 : 3;

  // 1. Draw "BRUTOPOLIS" in off-white with crisp dark shadow
  drawText8x8Centered("BRUTOPOLIS", titleTopY, "#ffffff", brutoScale, "#000000", shadowOffset);

  // 2. Draw "CHRONICLES" in vibrant NES Yellow with shadow
  const chronY = titleTopY + (brutoScale * 8) + (isMobile ? 6 : 10);
  drawText8x8Centered("CHRONICLES", chronY, "#fcee21", chronScale, "#000000", shadowOffset + 1);

  // 3. Subtitle / Tagline
  const subY = chronY + (chronScale * 8) + (isMobile ? 8 : 12);
  const subText = "\"" + BrutopolisVersionName + "\"";
  drawText8x8Centered(subText, subY, "#3cbcfc", 1, "#000000", 1);

  const curScen = PREFAB_SCENARIOS[selectedScenarioIdx] || PREFAB_SCENARIOS[0];

  // 4. Main Action Menu Box (Clean centered list)
  const menuBoxW = Math.min(420, CANVAS_WIDTH - 32);
  const menuBoxX = Math.floor((CANVAS_WIDTH - menuBoxW) / 2);
  let menuY = subY + (isMobile ? 18 : 28);

  // Button 0: CONTINUE GAME (if a gameplay world is active)
  if (hasActiveGame) {
    drawNESButton(menuBoxX, menuY, menuBoxW, 32, "CONTINUE GAME", true, false);
    registerClickableRegion(menuBoxX, menuY, menuBoxW, 32, () => {
      currentMode = "MAP";
      audio.stopInstance("menuTheme", false);
    });
    menuY += 38;
  }

  // Button 1: NEW WORLD / CUSTOM WORLD GENERATOR
  drawNESButton(menuBoxX, menuY, menuBoxW, 34, "NEW WORLD", !hasActiveGame, false);
  registerClickableRegion(menuBoxX, menuY, menuBoxW, 34, () => {
    currentMode = "GENERATOR";
    modalScroll = 0;
  });
  menuY += 42;

  // Button 3: OPTIONS & SETTINGS
  drawNESButton(menuBoxX, menuY, menuBoxW, 28, "OPTIONS & SETTINGS", false, false);
  registerClickableRegion(menuBoxX, menuY, menuBoxW, 28, () => {
    currentMode = "OPTIONS";
    modalScroll = 0;
  });
  menuY += 34;

  // Button 4: Quick Settings Row (2D/3D & Audio)
  const halfW = Math.floor((menuBoxW - 8) / 2);
  const view3DLabel = is3DMode ? "VIEW: 3D ISO" : "VIEW: 2D MAP";
  drawNESButton(menuBoxX, menuY, halfW, 28, view3DLabel, is3DMode, false);
  registerClickableRegion(menuBoxX, menuY, halfW, 28, toggle3DMode);

  const audioLabel = isAudioMuted ? "AUDIO: MUTED" : "AUDIO: ON";
  drawNESButton(menuBoxX + halfW + 8, menuY, halfW, 28, audioLabel, !isAudioMuted, false);
  registerClickableRegion(menuBoxX + halfW + 8, menuY, halfW, 28, toggleAudio);

  // Footer text
  const footY = CANVAS_HEIGHT - 18;
  const footText = "brutopolis chronicles v" + BrutopolisVersion;
  drawText8x8Centered(footText, footY, "#888888", 1, "#000000", 1);

  ctx.restore();
}

// ---------------------------------------------------------------------------
let lastRenderTime = 0;

function frame(time) {
  // Target FPS Limiter
  const targetFps = gameOptions?.targetFps || 0;
  if (targetFps > 0) {
    const minFrameInterval = 1000 / targetFps;
    if (time - lastRenderTime < minFrameInterval - 1.0) {
      requestAnimationFrame(frame);
      return;
    }
  }
  lastRenderTime = time;

  const dt = lastTime > 0 ? (time - lastTime) * 0.001 : 0.016;
  lastTime = time;

  // Enforce crisp nearest-neighbor pixel rendering (no bilinear filtering)
  ctx.imageSmoothingEnabled = false;
  if ("mozImageSmoothingEnabled" in ctx) ctx.mozImageSmoothingEnabled = false;
  if ("webkitImageSmoothingEnabled" in ctx) ctx.webkitImageSmoothingEnabled = false;
  if ("msImageSmoothingEnabled" in ctx) ctx.msImageSmoothingEnabled = false;

  // FPS Counter
  fpsFrames++;
  if (time - lastFpsUpdate >= 1000) {
    currentFps = fpsFrames;
    fpsFrames = 0;
    lastFpsUpdate = time;
  }

  handleCameraKeys(dt);
  activeUiRegions = [];

  // Automatic Camera Tracking / Follow Mode (2D and 3D)
  if (isFollowMode && lastSelectedId > 0 && currentMode === "MAP") {
    const target = getEntityById(lastSelectedId);
    if (target && !target.destroyed) {
      if (is3DMode && rctRenderer) {
        rctRenderer.setCamera(target.x, target.y);
      }
      if (renderer) {
        const curZoom = renderer.getCameraZoom();
        renderer.setCamera(target.x, target.y, curZoom);
      }
    } else {
      isFollowMode = false;
    }
  }

  // Title Screen auto-cycle removed as per user request to fix light flashing


  if (renderer && world) {
    // 1. Main-thread entity position lerp for 60 FPS smooth rendering independent of worker tick rate
    const lerpAlpha = Math.min(1.0, dt * 15.0);
    const zSize = getZoneSize();
    for (let i = 0; i < entities.length; i++) {
      const e = entities[i];
      if (!e || e.destroyed) continue;
      let moved = false;
      if (e.targetX !== undefined && Math.abs(e.targetX - e.x) > 0.001) {
        e.x += (e.targetX - e.x) * lerpAlpha;
        moved = true;
      }
      if (e.targetY !== undefined && Math.abs(e.targetY - e.y) > 0.001) {
        e.y += (e.targetY - e.y) * lerpAlpha;
        moved = true;
      }
      if (moved) {
        updateEntitySpatial(e, zSize);
      }
    }

    if (time - lastTpsUpdate >= 1000) {
      measuredTps = Math.round(tpsCounter * (1000 / Math.max(1, time - lastTpsUpdate)));
      tpsCounter = 0;
      lastTpsUpdate = time;
    }

    // 2. High-performance Frustum Culling & Rendering (2D or 3D RCT)
    // Skip rendering while a new title world is being generated to prevent lighting flash
    if (titleWorldLoading && currentMode === "TITLE") {
      // Fill both canvases with black while the new world loads
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      if (renderer && renderer.canvas) {
        const rc = renderer.canvas.getContext("2d");
        if (rc) { rc.fillStyle = "#000"; rc.fillRect(0, 0, renderer.canvas.width, renderer.canvas.height); }
      }
    } else if (currentMode !== "MAP" && currentMode !== "TITLE") {
      // Pause 2D/3D world rendering during full-screen modal view to maximize UI performance
      ctx.fillStyle = "#080c14";
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    } else if (is3DMode && rctRenderer) {
      rctRenderer.setPaused(isPaused);
      if (isEditorOpen && editorTool) {
        const hoverTile = getEditorHoverTile();
        let toolColorHex = 0xffe600;
        if (editorTool === "SPAWN") toolColorHex = 0x58d854;
        else if (editorTool === "BULLDOZER") toolColorHex = 0xe40058;
        else if (editorTool === "EYEDROPPER") toolColorHex = 0x3cbcfc;
        else if (editorTool === "PAINT") {
          const tileObj = EDITOR_TILES.find(t => t.id === editorSelectedTile);
          if (tileObj?.color) toolColorHex = parseInt(tileObj.color.replace("#", "0x"), 16);
        }
        rctRenderer.setEditorCursor(world, hoverTile.x, hoverTile.y, editorTool === "PAINT" ? editorBrushSize : 1, toolColorHex);
      } else {
        rctRenderer.hideEditorCursor();
      }
      const visionTarget = (isCreatureVisionMode && lastSelectedId > 0) ? getEntityById(lastSelectedId) : null;
      if (rctRenderer) {
        rctRenderer.max3DRenderDistance = gameOptions?.max3DRenderDistance;
      }
      rctRenderer.render(world, entities, time * 0.001, dt, isPaused ? 0.0 : simSpeed, visionTarget, visualizedGroupId);
      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    } else {
      renderer.render(world, entities, time * 0.001, dt, simSpeed);
    }

    // 3. Mode-specific UI Overlay Rendering
    if (currentMode === "TITLE") {
      renderTitleScreen();
    } else if (currentMode === "OPTIONS" && !hasActiveGame) {
      renderOptionsModal();
    } else {
      if (currentMode !== "MAP") {
        if (currentMode === "INSPECT") renderDossierModal();
        else if (currentMode === "ENTITIES") renderEntitiesModal();
        else if (currentMode === "GROUPS") renderGroupsModal();
        else if (currentMode === "LOGS") renderLogsModal();
        else if (currentMode === "GENERATOR") renderGeneratorModal();
        else if (currentMode === "OPTIONS") renderOptionsModal();

      } else {
        renderCreatureVisionOverlay();
        renderTerritoryOverlay();
        renderHoverTooltip();
        renderCreatureSummaryBox();
        renderCreatureEventLogPanel();
        renderMapEditorOverlay();
        renderCompactEditorPanel();

        if (inspectingLogEvent) {
          const mx = 30;
          const my = 36;
          const mw = CANVAS_WIDTH - 60;
          const mh = CANVAS_HEIGHT - 72;
          renderLogDetailView(mx, my, mw, mh, inspectingLogEvent);
        } else if (inspectingBattle) {
          const mx = 30;
          const my = 36;
          const mw = CANVAS_WIDTH - 60;
          const mh = CANVAS_HEIGHT - 72;
          renderBattleDetailView(mx, my, mw, mh, inspectingBattle);
        } else if (inspectingRelationship) {
          const mx = 30;
          const my = 36;
          const mw = CANVAS_WIDTH - 60;
          const mh = CANVAS_HEIGHT - 72;
          renderRelationshipModal(mx, my, mw, mh, inspectingRelationship);
        }
      }

      // Always render Top HUD bar and Bottom Navigation/Speed Toolbar on all in-game views
      renderTopHudBar();
      renderBottomToolbar();
      renderActiveHoverTooltip();
    }
  }

  // FMOD Studio per-frame update (complement to setInterval update for jank resistance)
  if (audio.isInitialized) {
    audio.update();

    let rawZoom = 1.0;
    if (is3DMode && rctRenderer) {
      rawZoom = rctRenderer.getCameraZoom ? rctRenderer.getCameraZoom() : 1.0;
    } else if (renderer) {
      rawZoom = renderer.getCameraZoom ? renderer.getCameraZoom() : 1.0;
    }

    // Dynamic zoom mapping:
    // rawZoom ranges from 0.25 (high orbit/satellite) to 4.0 (close ground)
    // normZoom: exactly 0.0 (high altitude sky) -> 1.0 (close ground)
    const normZoom = Math.max(0.0, Math.min(1.0, (rawZoom - 0.25) / (4.0 - 0.25)));

    if (currentMode === "MAP") {
      // 1. High Altitude Audio Layers:
      // - Vento: Atmospheric wind dispersion in the heights
      if (!audio.activeInstances.has("vento")) {
        audio.createInstance("vento", "event:/Ambiente/Vento", true);
      }

      // - Choir: Ethereal altitude choir/music
      if (!audio.activeInstances.has("choir")) {
        const c = audio.createInstance("choir", "event:/Ambiente/Choir", true);
        if (!c) audio.createInstance("choir", "event:/Ambiente/timeline1", true);
      }

      // 2. Ground Nature Layer:
      // - Passaros: Birds singing, trees, insects & cicadas near ground
      if (!audio.activeInstances.has("passaros")) {
        const p = audio.createInstance("passaros", "event:/Ambiente/Passaros", true);
        if (!p) audio.createInstance("passaros", "event:/Ambiente/Passaros_Natureza", true);
      }

      // 3. Scripting API Parameter & Dynamic Volume Synchronization:
      if (Math.abs((window._lastAudioZoom || -1) - normZoom) > 0.002) {
        window._lastAudioZoom = normZoom;

        // FMOD Parameter Zoom (0 = High Sky / Altitude, 1 = Close Ground)
        audio.setInstanceParameter("vento", "Zoom", normZoom);
        audio.setInstanceParameter("choir", "Zoom", normZoom);
        audio.setInstanceParameter("passaros", "Zoom", normZoom);
        audio.setGlobalParameter("Zoom", normZoom);

        // --- ALTITUDE CUTOFF & DISPERSION LOGIC ---
        // 1. Choir: Celestial high-stratosphere choir (normZoom < 0.20).
        const choirFactor = Math.max(0.0, (1.0 - normZoom / 0.20));
        const altitudeChoirVol = 0.16 * Math.pow(choirFactor, 1.8);
        audio.setInstanceVolume("choir", altitudeChoirVol);

        // 2. Vento: Strong presence in sky, peaks at ~0.4 zoom, softly recedes on ground.
        const windFactor = normZoom <= 0.4 ? 1.0 : Math.max(0.0, 1.0 - (normZoom - 0.4) / 0.6);
        const altitudeWindVol = 0.15 + 0.65 * Math.pow(windFactor, 1.2);
        audio.setInstanceVolume("vento", altitudeWindVol);

        // --- GROUND NATURE LOGIC ---
        // 3. Passaros (Birds during day / Crickets at night):
        // Only audible when camera is close to the ground (normZoom > 0.20), fades out smoothly with height, capped at moderate volume (0.28).
        const groundNatureFactor = Math.max(0.0, (normZoom - 0.20) / 0.80);
        const groundNatureVol = 0.28 * Math.pow(groundNatureFactor, 1.4);
        audio.setInstanceVolume("passaros", groundNatureVol);
      }

      // 4. FMOD 3D Spatial Audio Listener Sync (Camera position & height):
      let camX = 512, camY = 512;
      if (is3DMode && rctRenderer) {
        camX = rctRenderer.getCameraX();
        camY = rctRenderer.getCameraY();
      } else if (renderer) {
        camX = renderer.getCameraX();
        camY = renderer.getCameraY();
      }
      // Camera height in world space derived from zoom (close = low Z, zoom out = high Z)
      const listenerZ = 8.0 + (1.0 - normZoom) * 45.0;
      audio.setListenerPosition({ x: camX, y: camY, z: listenerZ });

      // 5. 3D Procedural Town & Entity Activity Audio (Footsteps, Construction & Human Chatter):
      if (!window._lastActivitySoundTimer) window._lastActivitySoundTimer = 0;
      const now = performance.now();
      if (now - window._lastActivitySoundTimer > 150 && entities && entities.length > 0 && normZoom > 0.35) {
        window._lastActivitySoundTimer = now;

        // Find entities close to camera view (within ~32 tiles radius)
        const visibleAudibleEntities = entities.filter(e => e && !e.destroyed && Math.hypot(e.x - camX, e.y - camY) < 32);
        if (visibleAudibleEntities.length > 0) {
          const pickedEntity = visibleAudibleEntities[Math.floor(Math.random() * visibleAudibleEntities.length)];
          const isWalking = pickedEntity.vx !== 0 || pickedEntity.vy !== 0 || pickedEntity.state === "WALK" || pickedEntity.isMoving;
          const isUnderConstruction = pickedEntity.isConstructed === false || (pickedEntity.properties?.house && !pickedEntity.properties.house.isCompleted) || (pickedEntity.properties?.warehouse && !pickedEntity.properties.warehouse.isCompleted);
          const isCitizen = pickedEntity.properties?.brain || pickedEntity.properties?.group || (pickedEntity.properties?.job && pickedEntity.properties.job !== "IDLE");

          const roll = Math.random();
          if (isUnderConstruction || (isCitizen && pickedEntity.properties?.job === "BUILD")) {
            // 3D Construction & Building hammer/tool sounds
            if (roll < 0.50) {
              audio.playOneShot("event:/SFX/Activity_Town", null, { x: pickedEntity.x, y: pickedEntity.y, z: 0 });
            }
          } else if (isWalking) {
            // 3D Spatial Footsteps on Grass
            if (roll < 0.45) {
              audio.playOneShot("event:/SFX/Footstep_Grass", null, { x: pickedEntity.x, y: pickedEntity.y, z: 0 });
            }
          } else if (isCitizen) {
            // 3D Human Mumbling / Grunting / Village Chatter
            if (roll < 0.25) {
              audio.playOneShot("event:/SFX/Mumble_Human", null, { x: pickedEntity.x, y: pickedEntity.y, z: 0 });
            } else if (roll < 0.45) {
              audio.playOneShot("event:/SFX/Activity_Town", null, { x: pickedEntity.x, y: pickedEntity.y, z: 0 });
            }
          }
        }
      }

      // Sync time of day ('tempo dos dias', 'Hora', 'DayNight', 'GlobalLight') for birds vs crickets
      if (world && world.clock) {
        const timeOfDay = world.clock.hour + (world.clock.minute / 60.0);
        if (Math.abs((window._lastAudioTod || -1) - timeOfDay) > 0.02) {
          window._lastAudioTod = timeOfDay;
          const isDay = timeOfDay >= 5.5 && timeOfDay <= 18.5;
          const light = world.clock.globalLight !== undefined ? world.clock.globalLight : (isDay ? 0.85 : 0.18);

          // Pass comprehensive TOD parameters so FMOD Studio routes diurnal birds vs nocturnal crickets correctly
          audio.setInstanceParameter("passaros", "tempo dos dias", timeOfDay);
          audio.setInstanceParameter("passaros", "Hora", timeOfDay);
          audio.setInstanceParameter("passaros", "Hour", timeOfDay);
          audio.setInstanceParameter("passaros", "GlobalLight", light);
          audio.setInstanceParameter("passaros", "DayNight", isDay ? 1.0 : 0.0);
          audio.setInstanceParameter("passaros", "Noite", isDay ? 0.0 : 1.0);
          audio.setInstanceParameter("passaros", "Night", isDay ? 0.0 : 1.0);

          audio.setInstanceParameter("choir", "tempo dos dias", timeOfDay);
          audio.setGlobalParameter("tempo dos dias", timeOfDay);
          audio.setGlobalParameter("Hora", timeOfDay);
          audio.setGlobalParameter("Hour", timeOfDay);
          audio.setGlobalParameter("GlobalLight", light);
          audio.setGlobalParameter("DayNight", isDay ? 1.0 : 0.0);
        }
      }
    } else {
      // Stop in-game ambiences when returning to menus or not in gameplay
      if (audio.activeInstances.has("vento")) {
        audio.stopInstance("vento", false);
      }
      if (audio.activeInstances.has("choir")) {
        audio.stopInstance("choir", false);
      }
      if (audio.activeInstances.has("passaros")) {
        audio.stopInstance("passaros", false);
      }
      if (audio.activeInstances.has("timeline1")) {
        audio.stopInstance("timeline1", false);
      }
      window._lastAudioZoom = -1;
      window._lastAudioTod = -1;
    }
  }

  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------------------
// Bootloader
// ---------------------------------------------------------------------------

async function init() {
  try {
    // Expose audio manager globally for debugging and console controls
    window.audio = audio;

    // Initialize FMOD Studio Audio Engine & Load Banks
    audio.init().then(async () => {
      try {
        console.log("[Audio] Loading FMOD Banks...");
        await audio.loadBank("assets/banks/Master.strings.bank");
        await audio.loadBank("assets/banks/Master.bank");
        console.log("[Audio] Banks loaded. Starting menu theme...");

        // Start menu theme - softened volume for pleasant ambiance
        audio.createInstance("menuTheme", "event:/Musica/Menu", true);
        audio.setInstanceVolume("menuTheme", 0.55);
      } catch (bankErr) {
        console.warn("[Audio] Error loading banks or starting menu theme:", bankErr);
      }
    }).catch(err => {
      console.warn("[Audio] FMOD initialization deferred or failed:", err);
    });

    renderer = new Renderer(canvas);
    await renderer.initPromise;
    const firstScen = PREFAB_SCENARIOS[0];
    world = new World(firstScen.preset, firstScen.seed);
    setActiveWorld(world);
    initSimWorker();
    simWorker.postMessage({
      type: "INIT_WORLD",
      preset: firstScen.preset,
      width: genWidth,
      height: genHeight,
      zoneSize: genZoneSize,
      seed: firstScen.seed,
      creatureDensity: "NONE",
      plantDensity: "NORMAL",
      spawnPioneers: false,
      embarkCount: 0,
      spawnRoads: false,
      isTitleScreen: true
    });
    console.log("[Title] Brutopolis Title Screen initialized successfully.");
    requestAnimationFrame(frame);
  } catch (err) {
    console.error("Failed to load Brutopolis:", err);
  }
}

init();


// ---------------------------------------------------------------------------
// Mobile Multi-Touch & Gesture Controls
// ---------------------------------------------------------------------------

let activeTouchId = null;
let touchMoved = false;
let touchScrollAccumulator = 0;
let lastTouchClientY = 0;

canvas.addEventListener("touchstart", (e) => {
  lastTouchTapTime = Date.now();

  if (e.touches.length === 1) {
    const t = e.touches[0];
    activeTouchId = t.identifier;
    touchMoved = false;

    const coords = getCanvasCoords(t.clientX, t.clientY);
    mouseX = coords.x;
    mouseY = coords.y;
    touchStartX = t.clientX;
    touchStartY = t.clientY;
    dragStartClientX = t.clientX;
    dragStartClientY = t.clientY;
    lastTouchClientY = t.clientY;
    touchScrollAccumulator = 0;

    if (is3DMode && rctRenderer) {
      dragCameraStartX = rctRenderer.camX;
      dragCameraStartY = rctRenderer.camY;
    } else if (renderer) {
      dragCameraStartX = renderer.getCameraX();
      dragCameraStartY = renderer.getCameraY();
    }

    // Touch Editor Painting
    if (isEditorOpen && editorTool && coords.inside && coords.y > 32 && coords.y < CANVAS_HEIGHT - 36) {
      let isOverUi = false;
      for (let i = activeUiRegions.length - 1; i >= 0; i--) {
        const reg = activeUiRegions[i];
        if (coords.x >= reg.x && coords.x <= reg.x + reg.w && coords.y >= reg.y && coords.y <= reg.y + reg.h) {
          isOverUi = true;
          break;
        }
      }
      if (!isOverUi) {
        mouseClientX = t.clientX;
        mouseClientY = t.clientY;
        const tile = getEditorHoverTile();
        isPainting = true;
        applyEditorActionAt(tile.x, tile.y);
      }
    }
  } else if (e.touches.length === 2) {
    // 2-Finger Pinch Zoom Initiation
    touchMoved = true;
    isPainting = false;
    const t1 = e.touches[0];
    const t2 = e.touches[1];
    touchPinchDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
  }
}, { passive: false });

canvas.addEventListener("touchmove", (e) => {
  e.preventDefault();
  lastTouchTapTime = Date.now();

  if (e.touches.length === 1) {
    const t = e.touches[0];
    const coords = getCanvasCoords(t.clientX, t.clientY);
    mouseX = coords.x;
    mouseY = coords.y;
    mouseClientX = t.clientX;
    mouseClientY = t.clientY;

    const totalDist = Math.hypot(t.clientX - touchStartX, t.clientY - touchStartY);
    if (totalDist > 8) {
      touchMoved = true;
    }

    if (isEditorOpen && isPainting && (editorTool === "PAINT" || editorTool === "BULLDOZER")) {
      if (coords.inside && coords.y > 32 && coords.y < CANVAS_HEIGHT - 36) {
        const tile = getEditorHoverTile();
        applyEditorActionAt(tile.x, tile.y);
        return;
      }
    }

    // Single-finger modal scroll (Lists, Logs, Dossier, Entities, Groups)
    if (currentMode !== "MAP" || inspectingLogEvent) {
      const deltaY = lastTouchClientY - t.clientY;
      lastTouchClientY = t.clientY;
      touchScrollAccumulator += deltaY;

      // Every 16px of finger drag scrolls 1 line smoothly
      const step = 16;
      if (Math.abs(touchScrollAccumulator) >= step) {
        const linesToScroll = Math.trunc(touchScrollAccumulator / step);
        modalScroll = Math.max(0, modalScroll + linesToScroll);
        touchScrollAccumulator -= linesToScroll * step;
      }
      return;
    }

    // Single-finger camera pan (Supports 2D and 3D)
    if (touchMoved && !isPainting && currentMode === "MAP") {
      if (is3DMode && rctRenderer) {
        const zoom = rctRenderer.zoom || 1.0;
        const canvasRect = canvas.getBoundingClientRect();
        const scale = 56.0 / (zoom * Math.max(100, canvasRect.height));

        const sx = (t.clientX - dragStartClientX) * scale;
        const sy = (t.clientY - dragStartClientY) * scale;

        // Ground plane projection matching desktop 3D camera pan:
        const moveX = -(sx * 0.70710678 + sy * 1.22474487);
        const moveY = -(-sx * 0.70710678 + sy * 1.22474487);

        if (!isNaN(moveX) && !isNaN(moveY)) {
          const targetX = dragCameraStartX + moveX;
          const targetY = dragCameraStartY + moveY;
          rctRenderer.setCamera(targetX, targetY, zoom);
          if (renderer) renderer.setCamera(targetX, targetY, zoom);
        }
      } else if (renderer) {
        const zoom = renderer.getCameraZoom();
        const rect = canvas.getBoundingClientRect();
        const pixelScale = rect.width / CANVAS_WIDTH;
        const tileSizeScreen = 16.0 * zoom * pixelScale;

        if (tileSizeScreen > 0.2) {
          const dx = (t.clientX - dragStartClientX) / tileSizeScreen;
          const dy = (t.clientY - dragStartClientY) / tileSizeScreen;
          renderer.setCamera(dragCameraStartX - dx, dragCameraStartY - dy, zoom);
        }
      }
    }
  } else if (e.touches.length === 2 && touchPinchDist) {
    // 2-Finger Pinch Zooming (Supports 2D and 3D)
    touchMoved = true;
    const t1 = e.touches[0];
    const t2 = e.touches[1];
    const newDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
    const factor = newDist / touchPinchDist;

    if (Math.abs(factor - 1.0) > 0.01) {
      if (is3DMode && rctRenderer) {
        let curZoom = rctRenderer.zoom;
        curZoom = Math.max(0.25, Math.min(6.0, curZoom * factor));
        rctRenderer.setCamera(rctRenderer.camX, rctRenderer.camY, curZoom);
      } else if (renderer) {
        let curZoom = renderer.getCameraZoom();
        curZoom = Math.max(0.15, Math.min(8.0, curZoom * factor));
        renderer.setCamera(renderer.getCameraX(), renderer.getCameraY(), curZoom);
      }
      touchPinchDist = newDist;
    }
  }
}, { passive: false });

canvas.addEventListener("touchend", (e) => {
  lastTouchTapTime = Date.now();

  if (e.touches.length === 0) {
    // Tap execution (only if finger did not drag/pan)
    if (!touchMoved && !isPainting) {
      const coords = getCanvasCoords(touchStartX, touchStartY);
      let clickedUi = false;

      // 1. Check UI Click
      for (let i = activeUiRegions.length - 1; i >= 0; i--) {
        const reg = activeUiRegions[i];
        if (coords.x >= reg.x && coords.x <= reg.x + reg.w && coords.y >= reg.y && coords.y <= reg.y + reg.h) {
          reg.onClick();
          clickedUi = true;
          break;
        }
      }

      // 2. Check Map Selection (2D & 3D)
      if (!clickedUi && currentMode === "MAP" && coords.inside && coords.y > 32 && coords.y < CANVAS_HEIGHT - 36) {
        let foundId = -1;
        if (is3DMode && rctRenderer) {
          foundId = rctRenderer.selectAt(touchStartX, touchStartY, entities, world);
        } else if (renderer) {
          foundId = renderer.selectAt(coords.x, coords.y, entities);
        }
        lastSelectedId = foundId;
      }
    }

    activeTouchId = null;
    touchMoved = false;
    isPainting = false;
    touchPinchDist = null;
  } else if (e.touches.length === 1) {
    touchPinchDist = null;
    const t = e.touches[0];
    dragStartClientX = t.clientX;
    dragStartClientY = t.clientY;
    if (is3DMode && rctRenderer) {
      dragCameraStartX = rctRenderer.camX;
      dragCameraStartY = rctRenderer.camY;
    } else if (renderer) {
      dragCameraStartX = renderer.getCameraX();
      dragCameraStartY = renderer.getCameraY();
    }
  }
});
