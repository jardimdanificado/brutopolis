// =============================================================================
// Brutopolis — Pure Canvas Simulation Engine (Embedded 8x8 Engine Font)
// =============================================================================

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
  exportWorldChronicleJSON,
  downloadChronicleJSON,
  exportWorldSaveJSON,
  downloadWorldSaveJSON,
  restoreWorldEvents,
  appendWorldEvents,
  recordWorldEvent,
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

      case "SAVE_DATA_READY": {
        if (data.saveData) {
          const customWorld = data.saveData.world;
          const filename = downloadWorldSaveJSON(customWorld, entities, currentTick, entityRegistry, world.groups || [], data.saveData.camera, genSeed, currentPreset);
          try {
            localStorage.setItem("brutopolis_quicksave", JSON.stringify(data.saveData));
          } catch (e) {
            console.warn("Could not save to localStorage:", e);
          }
        }
        break;
      }
    }
  };
}

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
      ent.properties = regData.properties || {};
    }
  }

  if (Array.isArray(entitiesData)) {
    const curEntities = [];
    const zSize = getZoneSize();
    const receivedIds = new Set();
    
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
      ent.properties = entData.properties || {};

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

/**
 * Draws crisp text using the embedded 8x8 engine font directly to Canvas.
 */
function drawText8x8(text, startX, startY, color = "#ffffff", scale = 1) {
  if (text === undefined || text === null) return;
  const str = String(text);
  ctx.save();
  ctx.fillStyle = color;

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
    const glyph = FONT_8X8[charIdx] || FONT_8X8[63];

    for (let r = 0; r < 8; r++) {
      const rowBits = glyph[r];
      for (let c = 0; c < 8; c++) {
        if (rowBits & (1 << (7 - c))) {
          ctx.fillRect(cx + c * scale, cy + r * scale, scale, scale);
        }
      }
    }
    cx += 8 * scale;
  }
  ctx.restore();
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
let lastFpsUpdate = performance.now();
let tpsCounter = 0;
let measuredTps = 60;
let lastTpsUpdate = performance.now();

// Active In-Game Screen Mode ("TITLE", "SCENARIOS", "MAP", "INSPECT", "ENTITIES", "GROUPS", "LOGS", "GENERATOR")
let currentMode = "TITLE";
let modalScroll = 0;
let inspectingLogEvent = null;
let inspectingGroup = null; // Currently inspected clan for full dossier/stockpile view
let groupDetailTab = "OVERVIEW"; // Active tab in clan dossier: "OVERVIEW" or "HISTORY"
let dossierTab = "OVERVIEW"; // Active tab in creature dossier: "OVERVIEW", "AFFINITIES", "OFFSPRING", "CHRONICLE"
let inspectingFromCreature = false;
let visualizedGroupId = null; // ID of clan whose claimed territory is being highlighted on map
let isFollowMode = false; // Camera automatically follows and locks onto selected creature
let isCreatureVisionMode = false; // "See through creature's eyes" perception FOV & Fog of War

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
  { id: 0, label: "GRASS / SOIL", color: "#58d854", desc: "Fertile land / forest" },
  { id: 1, label: "MOUNTAIN PEAK", color: "#f8f8f8", desc: "High rocky terrain" },
  { id: 2, label: "OCEAN WATER", color: "#0078f8", desc: "Deep / ocean water" },
  { id: 3, label: "DESERT SAND", color: "#f8b800", desc: "Arid desert dunes" },
  { id: 4, label: "FOOTHILLS", color: "#888888", desc: "Stone & mineral hills" },
  { id: 5, label: "VOID / ABYSS", color: "#222222", desc: "Impassable bedrock" }
];

const EDITOR_CREATURES = [
  // Humanoids & Clan Settlers
  { label: "HUMAN PIONEER", fn: (x, y) => createHuman(x, y) },
  {
    label: "HUMAN HAULER", fn: (x, y) => {
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
    }
  },
  { label: "HUMAN BUILDER", fn: (x, y) => createCreatureFromArchetype("human", x, y, { role: "Builder" }) },
  { label: "HUMAN BUTCHER", fn: (x, y) => createCreatureFromArchetype("human", x, y, { role: "Butcher" }) },
  { label: "HUMAN COOK", fn: (x, y) => createCreatureFromArchetype("human", x, y, { role: "Cook" }) },
  { label: "ELF ARCHER", fn: (x, y) => createElf(x, y) },
  { label: "DWARF MINER", fn: (x, y) => createDwarf(x, y) },
  { label: "ORC WARRIOR", fn: (x, y) => createOrc(x, y) },
  { label: "GOBLIN SCOUT", fn: (x, y) => createGoblin(x, y) },
  { label: "EMBARK CLAN", fn: (x, y) => { const res = createEmbarkParty(x, y, world, entities); return res.members[0]; } },
  // Fauna & Wild Beasts
  { label: "BOAR", fn: (x, y) => createBoar(x, y) },
  { label: "DEER", fn: (x, y) => createDeer(x, y) },
  { label: "WOLF", fn: (x, y) => createWolf(x, y) },
  { label: "BEAR", fn: (x, y) => createBear(x, y) },
  { label: "CAT", fn: (x, y) => createCat(x, y) },
  { label: "GOAT", fn: (x, y) => createMountainGoat(x, y) },
  { label: "BAT", fn: (x, y) => createBat(x, y) },
  { label: "SPIDER", fn: (x, y) => createSpider(x, y) },
  { label: "SCORPION", fn: (x, y) => createScorpion(x, y) },
  { label: "LIZARD", fn: (x, y) => createLizard(x, y) },
  { label: "DRAGON", fn: (x, y) => createDragon(x, y) },
  { label: "SERPENT", fn: (x, y) => createSeaSerpent(x, y) }
];

const EDITOR_ITEMS = [
  // Buildings & Structures
  { label: "WAREHOUSE", fn: (x, y) => createWarehouseEntity(x, y) },
  { label: "SLAUGHTERHOUSE", fn: (x, y) => createSlaughterhouseEntity(x, y) },
  { label: "KITCHEN", fn: (x, y) => createKitchenEntity(x, y) },
  { label: "WATER WELL", fn: (x, y) => createWaterWellEntity(x, y) },
  { label: "STONE WALL", fn: (x, y) => createStoneWallEntity(x, y) },
  { label: "DIRT ROAD", fn: (x, y) => createRoadEntity(x, y, null, false) },
  // Containers & Equipment
  { label: "BASKET (MED)", fn: (x, y) => createBasketItem(x, y, "medium") },
  { label: "BASKET (LRG)", fn: (x, y) => createBasketItem(x, y, "large") },
  { label: "BACKPACK", fn: (x, y) => createBackpackItem(x, y, "medium") },
  { label: "EXPEDITION PACK", fn: (x, y) => createBackpackItem(x, y, "large") },
  // Prepared Meals & Foods
  { label: "MEAT BENTO", fn: (x, y) => createMeatBento(x, y) },
  { label: "VEGAN BENTO", fn: (x, y) => createVeganBento(x, y) },
  { label: "GOURMET BENTO", fn: (x, y) => createGourmetBento(x, y) },
  { label: "ROASTED MEAT", fn: (x, y) => createRoastedMeat(x, y) },
  { label: "GRILLED VEGGIES", fn: (x, y) => createGrilledVeggies(x, y) },
  // Raw Resources & Flora
  { label: "WOOD LOG", fn: (x, y) => createWoodItem(x, y) },
  { label: "STONE BLOCK", fn: (x, y) => createStoneItem(x, y) },
  { label: "OAK SEED", fn: (x, y) => createSeedEntity(x, y, "large", "oak") },
  { label: "OAK TREE", fn: (x, y) => createOakTree(x, y) },
  { label: "PINE TREE", fn: (x, y) => createPineTree(x, y) },
  { label: "WILLOW TREE", fn: (x, y) => createWillowTree(x, y) },
  { label: "CACTUS", fn: (x, y) => createCactus(x, y) },
  { label: "SHRUB", fn: (x, y) => createAlpineShrub(x, y) },
  { label: "WATER LILY", fn: (x, y) => createWaterLily(x, y) },
  { label: "SEAWEED", fn: (x, y) => createSeaweed(x, y) }
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

  if (simWorker) {
    let spawnerKey = null;
    if (editorTool === "SPAWN" && editorActiveSpawner?.label) {
      const lbl = editorActiveSpawner.label.toUpperCase();
      if (lbl.includes("HUMAN")) spawnerKey = "HUMAN";
      else if (lbl.includes("ELF")) spawnerKey = "ELF";
      else if (lbl.includes("DWARF")) spawnerKey = "DWARF";
      else if (lbl.includes("ORC")) spawnerKey = "ORC";
      else if (lbl.includes("GOBLIN")) spawnerKey = "GOBLIN";
      else if (lbl.includes("BOAR")) spawnerKey = "BOAR";
      else if (lbl.includes("DEER")) spawnerKey = "DEER";
      else if (lbl.includes("SPIDER")) spawnerKey = "SPIDER";
      else if (lbl.includes("WOLF")) spawnerKey = "WOLF";
      else if (lbl.includes("BEAR")) spawnerKey = "BEAR";
      else if (lbl.includes("CAT")) spawnerKey = "CAT";
      else if (lbl.includes("GOAT")) spawnerKey = "GOAT";
      else if (lbl.includes("BAT")) spawnerKey = "BAT";
      else if (lbl.includes("SCORPION")) spawnerKey = "SCORPION";
      else if (lbl.includes("LIZARD")) spawnerKey = "LIZARD";
      else if (lbl.includes("DRAGON")) spawnerKey = "DRAGON";
      else if (lbl.includes("SERPENT")) spawnerKey = "SERPENT";
      else if (lbl.includes("TREE") || lbl.includes("OAK")) spawnerKey = "OAK_TREE";
      else if (lbl.includes("PINE")) spawnerKey = "PINE_TREE";
      else if (lbl.includes("WILLOW")) spawnerKey = "WILLOW_TREE";
      else if (lbl.includes("CACTUS")) spawnerKey = "CACTUS";
      else if (lbl.includes("SHRUB")) spawnerKey = "SHRUB";
      else if (lbl.includes("LILY")) spawnerKey = "LILY";
      else if (lbl.includes("SEAWEED")) spawnerKey = "SEAWEED";
      else if (lbl.includes("WOOD")) spawnerKey = "LOG";
      else if (lbl.includes("STONE WALL")) spawnerKey = "WALL";
      else if (lbl.includes("STONE")) spawnerKey = "STONE";
      else if (lbl.includes("WELL")) spawnerKey = "WELL";
      else if (lbl.includes("SEED")) spawnerKey = "SEED";
      else if (lbl.includes("FRUIT")) spawnerKey = "FRUIT";
      else spawnerKey = "HUMAN";
    }

    if (editorTool === "EYEDROPPER") {
      const sampled = world.getTile(tileX, tileY);
      editorSelectedTile = sampled;
      editorTool = "PAINT";
      return;
    }

    simWorker.postMessage({
      type: "APPLY_EDITOR_ACTION",
      tool: editorTool,
      tileX,
      tileY,
      selectedTile: editorSelectedTile,
      brushSize: editorBrushSize,
      spawnerLabel: spawnerKey
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
  initTitleWorld(selectedScenarioIdx);

  // Resume menu theme when going back to title
  if (audio.isInitialized && !audio.activeInstances.has("menuTheme")) {
    audio.createInstance("menuTheme", "event:/Musica/Menu", true);
  }
}

function generateConfiguredWorld() {
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

function saveWorldState() {
  if (!world || !renderer) return;
  const cx = renderer.getCameraX();
  const cy = renderer.getCameraY();
  const zoom = renderer.getCameraZoom();
  const camera = { x: cx, y: cy, zoom };

  if (simWorker) {
    simWorker.postMessage({ type: "SAVE_WORLD", camera });
  } else {
    const customWorld = {
      width: genWidth,
      height: genHeight,
      zoneSize: getZoneSize(),
      map: world.map,
      clock: world.clock
    };
    const filename = downloadWorldSaveJSON(customWorld, entities, currentTick, entityRegistry, world.groups || [], camera, genSeed, currentPreset);
    try {
      const saveObj = exportWorldSaveJSON(customWorld, entities, currentTick, entityRegistry, world.groups || [], camera, genSeed, currentPreset);
      localStorage.setItem("brutopolis_quicksave", JSON.stringify(saveObj));
    } catch (e) {
      console.warn("Could not save to localStorage:", e);
    }
  }
}

function loadWorldState(saveData) {
  if (!saveData) {
    alert("Invalid save file!");
    return;
  }
  if (simWorker) {
    simWorker.postMessage({ type: "LOAD_WORLD", saveData });
  }
}

function openSaveFilePicker() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json,application/json";
  input.style.display = "none";
  input.onchange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        loadWorldState(parsed);
      } catch (err) {
        alert("Failed to parse JSON file: " + err.message);
      }
    };
    reader.readAsText(file);
  };
  document.body.appendChild(input);
  input.click();
  document.body.removeChild(input);
}

function spawnEntityAtCamera(spawnerLabel) {
  if (!renderer || !world) return;
  const cx = Math.floor(renderer.getCameraX());
  const cy = Math.floor(renderer.getCameraY());
  if (simWorker) {
    simWorker.postMessage({ type: "SPAWN_ENTITY", spawnerLabel, x: cx, y: cy });
  }
}

function cycleNextLivingEntity() {
  if (entities.length === 0 || !renderer) return;
  const living = entities.filter(e => !e.destroyed && e.properties && e.properties.life);
  if (living.length === 0) return;

  const curIdx = living.findIndex(e => e.id === lastSelectedId);
  const nextIdx = (curIdx + 1) % living.length;
  const nextEnt = living[nextIdx];

  lastSelectedId = nextEnt.id;
  renderer.selectEntity(nextEnt.id);
  renderer.setCamera(nextEnt.x, nextEnt.y, renderer.getCameraZoom());
}

function centerCamera() {
  if (!renderer || !world) return;
  const sel = getEntityById(lastSelectedId);
  if (sel) {
    renderer.setCamera(sel.x, sel.y, renderer.getCameraZoom());
  } else {
    renderer.setCamera(256, 256, 1.0);
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
    } else if (inspectingLogEvent) {
      inspectingLogEvent = null;
    } else if (inspectingGroup) {
      inspectingGroup = null;
    } else if (currentMode === "GENERATOR" || currentMode === "SCENARIOS") {
      currentMode = "TITLE";
    } else {
      currentMode = "MAP";
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
  if (currentMode !== "MAP") return;
  const activeRenderer = (is3DMode && rctRenderer) ? rctRenderer : renderer;
  if (!activeRenderer) return;

  let cx = activeRenderer.getCameraX();
  let cy = activeRenderer.getCameraY();
  let zoom = activeRenderer.getCameraZoom();

  const speed = (200.0 / zoom) * dt;
  let mx = 0, my = 0;

  if (keysDown.has("ArrowUp") || keysDown.has("KeyW")) my -= speed;
  if (keysDown.has("ArrowDown") || keysDown.has("KeyS")) my += speed;
  if (keysDown.has("ArrowLeft") || keysDown.has("KeyA")) mx -= speed;
  if (keysDown.has("ArrowRight") || keysDown.has("KeyD")) mx += speed;

  if (mx !== 0 || my !== 0) {
    if (is3DMode) {
      const rot = Math.PI / 4;
      const moveX = mx * Math.cos(rot) - my * Math.sin(rot);
      const moveY = mx * Math.sin(rot) + my * Math.cos(rot);
      cx += moveX;
      cy += moveY;
    } else {
      cx += mx;
      cy += my;
    }
    activeRenderer.setCamera(cx, cy, zoom);
    if (renderer) renderer.setCamera(cx, cy, zoom);
    if (rctRenderer) rctRenderer.setCamera(cx, cy, zoom);
  }
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
    drawText8x8(`SUN:${Math.round(clock.globalLight * 100)}%`, 276, 13, "#3cbcfc", 1);

    drawText8x8(`${currentFps}FPS`, 360, 13, "#bcbcbc", 1);

    // MENU / TITLE Button
    drawNESButton(CANVAS_WIDTH - 64, 5, 56, 24, "MENU", false, false);
    registerClickableRegion(CANVAS_WIDTH - 64, 5, 56, 24, returnToTitleScreen);

    // NEW WORLD Generator Button
    const isGenAct = currentMode === "GENERATOR";
    drawNESButton(CANVAS_WIDTH - 164, 5, 94, 24, "NEW WORLD", isGenAct, false);
    registerClickableRegion(CANVAS_WIDTH - 164, 5, 94, 24, () => {
      currentMode = currentMode === "GENERATOR" ? "MAP" : "GENERATOR";
      modalScroll = 0;
    });

    // LOAD Button
    drawNESButton(CANVAS_WIDTH - 222, 5, 52, 24, "LOAD", false, false);
    registerClickableRegion(CANVAS_WIDTH - 222, 5, 52, 24, openSaveFilePicker);

    // SAVE Button
    drawNESButton(CANVAS_WIDTH - 280, 5, 52, 24, "SAVE", false, false);
    registerClickableRegion(CANVAS_WIDTH - 280, 5, 52, 24, saveWorldState);

    if (is3DMode && rctRenderer) {
      const fullWorldActive = rctRenderer.isFullWorldMode ? rctRenderer.isFullWorldMode() : false;
      const fullTxt = fullWorldActive ? "FULL 3D" : "CHUNK 3D";
      drawNESButton(CANVAS_WIDTH - 592, 5, 78, 24, fullTxt, fullWorldActive, false);
      registerClickableRegion(CANVAS_WIDTH - 592, 5, 78, 24, () => rctRenderer.toggleFullWorld());

      const shdMode = rctRenderer.getShadowsModeName ? rctRenderer.getShadowsModeName() : (rctRenderer.shadowsEnabled ? "ON" : "OFF");
      const shdTxt = "SHD:" + shdMode;
      const isShdActive = shdMode === "ON";
      drawNESButton(CANVAS_WIDTH - 508, 5, 68, 24, shdTxt, isShdActive, false);
      registerClickableRegion(CANVAS_WIDTH - 508, 5, 68, 24, () => rctRenderer.toggleShadows());

      const resMode = rctRenderer.getResolutionName ? rctRenderer.getResolutionName() : "100%";
      const resTxt = "RES:" + resMode;
      drawNESButton(CANVAS_WIDTH - 436, 5, 72, 24, resTxt, resMode !== "100%", false);
      registerClickableRegion(CANVAS_WIDTH - 436, 5, 72, 24, () => rctRenderer.toggleResolution());

      const wireMode = rctRenderer.getWireframeModeName ? rctRenderer.getWireframeModeName() : (rctRenderer.isWireframe ? "ON" : "OFF");
      const wireTxt = "WIRE:" + wireMode;
      const isWireActive = wireMode !== "OFF";
      drawNESButton(CANVAS_WIDTH - 358, 5, 72, 24, wireTxt, isWireActive, false);
      registerClickableRegion(CANVAS_WIDTH - 358, 5, 72, 24, () => rctRenderer.toggleWireframe());
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
    drawText8x8(`${currentFps}F`, 126, 13, "#888888", 1);

    let topBtnX = CANVAS_WIDTH - 44;
    drawNESButton(topBtnX, 5, 38, 24, "MENU", false, false);
    registerClickableRegion(topBtnX, 5, 38, 24, returnToTitleScreen);
    topBtnX -= 42;

    const modeTxt = is3DMode ? "3D" : "2D";
    drawNESButton(topBtnX, 5, 38, 24, modeTxt, is3DMode, false);
    registerClickableRegion(topBtnX, 5, 38, 24, toggle3DMode);
    topBtnX -= 42;

    const isGenAct = currentMode === "GENERATOR";
    drawNESButton(topBtnX, 5, 38, 24, "GEN", isGenAct, false);
    registerClickableRegion(topBtnX, 5, 38, 24, () => {
      currentMode = currentMode === "GENERATOR" ? "MAP" : "GENERATOR";
      modalScroll = 0;
    });
    topBtnX -= 46;

    drawNESButton(topBtnX, 5, 42, 24, "SAVE", false, false);
    registerClickableRegion(topBtnX, 5, 42, 24, saveWorldState);
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
      const coordStr = `[${hoverTile.x}, ${hoverTile.y}]`;
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

  drawNESButton(mx + mw - 32, my + 6, 26, 24, "X", false, true);
  registerClickableRegion(mx + mw - 32, my + 6, 26, 24, () => {
    if (inspectingLogEvent) inspectingLogEvent = null;
    else currentMode = "MAP";
  });

  // If viewing a specific event detail from creature chronicle:
  if (inspectingLogEvent) {
    renderLogDetailView(mx, my, mw, mh, inspectingLogEvent);
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
    registerClickableRegion(mx + mw - 195, my + 6, 75, 24, centerCamera);

    drawNESButton(mx + mw - 112, my + 6, 75, 24, "KILL", false, true);
    registerClickableRegion(mx + mw - 112, my + 6, 75, 24, () => {
      if (simWorker) {
        simWorker.postMessage({ type: "KILL_ENTITY", entityId: target.id });
      }
      cycleNextLivingEntity();
    });
  }

  // Calculate Tab Counts
  const knownAffinities = Object.entries(props.brain?.affinities || {});
  const offspringList = props.life?.childrenIds || [];
  const creatureEvents = getEventsForEntity(target.id, 60);

  // Modal Tabs Bar
  const tabs = [
    { id: "OVERVIEW", label: "OVERVIEW" },
    { id: "AFFINITIES", label: `AFFINITIES (${knownAffinities.length})` },
    { id: "OFFSPRING", label: `OFFSPRING (${offspringList.length})` },
    { id: "CHRONICLE", label: `CHRONICLE (${creatureEvents.length})` }
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
    drawNESBox(mx + 10, my + 62, mw - 20, 48);
    drawText8x8(`SPECIES: ${species}`, mx + 20, my + 70, "#3cbcfc", 1);
    drawText8x8(`CLAN: ${groupName}`, mx + 240, my + 70, "#d3869b", 1);
    drawText8x8(`POS: [${target.x},${target.y}]`, mx + 490, my + 70, "#f8b800", 1);

    const isAlive = !target.destroyed && props.life && props.life.energy > 0;
    const statusTxt = isAlive ? "STATUS: LIVE" : "STATUS: DECEASED";
    const statusCol = isAlive ? "#58d854" : "#f83800";
    drawText8x8(statusTxt, mx + 20, my + 88, statusCol, 1);
    drawText8x8(`PROPERTIES: ${Object.keys(props).length}`, mx + 240, my + 88, "#bcbcbc", 1);

    const domains = [];
    if (props.terrestrial) domains.push("TERRESTRIAL");
    if (props.aquatic) domains.push("AQUATIC");
    if (props.flying) domains.push("FLYING");
    const domainStr = domains.length > 0 ? domains.join("+") : "STATIC";
    drawText8x8(`DOMAIN: ${domainStr}`, mx + 440, my + 88, "#58d854", 1);

    const lineageY = my + 114;
    drawNESBox(mx + 10, lineageY, mw - 20, 56);

    // Perks & Traits
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
      const pName = (partner?.properties?.name || `Entity #${partnerId}`).toUpperCase().slice(0, 14);
      drawText8x8("PARTNER:", mx + 440, lineageY + 30, "#bcbcbc", 1);
      drawNESButton(mx + 510, lineageY + 24, 140, 22, `${pName} [PARTNER]`, false, false);
      registerClickableRegion(mx + 510, lineageY + 24, 140, 22, () => {
        lastSelectedId = partnerId;
        modalScroll = 0;
      });
    } else {
      drawText8x8("PARTNER: Single", mx + 440, lineageY + 30, "#7c7c7c", 1);
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

    const maxScroll = Math.max(0, lines.length - Math.floor(dumpH / 14));
    modalScroll = Math.max(0, Math.min(maxScroll, modalScroll));

    let textY = dumpY + 12;
    const visibleCount = Math.floor((dumpH - 12) / 14);

    for (let i = modalScroll; i < Math.min(lines.length, modalScroll + visibleCount); i++) {
      const line = lines[i];
      const col = line.startsWith("---") ? "#f8b800" : line.startsWith("+ [") ? "#3cbcfc" : "#ffffff";
      drawText8x8(line.slice(0, 76), mx + 20, textY, col, 1);
      textY += 14;
    }
  }

  // ---------------------------------------------------------------------------
  // TAB 2: AFFINITIES (Known living & deceased creatures)
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
        drawText8x8(oName, mx + 85, curY + 6, "#ffffff", 1);

        // Relationship badge
        const isPartner = props.monogamy?.partnerId === otherId;
        let relBadge = isPartner ? "LOVER" : affVal >= 60 ? "CLOSE FRIEND" : affVal >= 20 ? "FRIEND" : affVal <= -50 ? "ENEMY" : affVal <= -15 ? "RIVAL" : "NEUTRAL";
        let relCol = isPartner ? "#ff60a0" : affVal >= 20 ? "#58d854" : affVal <= -15 ? "#f83800" : "#bcbcbc";
        drawText8x8(relBadge, mx + 260, curY + 6, relCol, 1);

        // Affinity bar
        drawNESProgressBar(mx + 410, curY + 2, 160, 18, affVal + 100, 200, `AFF: ${Math.round(affVal)}`, relCol);

        // Inspect Button
        drawNESButton(mx + mw - 95, curY + 2, 75, 20, "INSPECT", false, false);
        registerClickableRegion(mx + mw - 95, curY + 2, 75, 20, () => {
          lastSelectedId = otherId;
          modalScroll = 0;
        });

        curY += rowH;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // TAB 3: OFFSPRING (Children lineage)
  // ---------------------------------------------------------------------------
  else if (dossierTab === "OFFSPRING") {
    const listY = my + 62;
    const listH = mh - 72;
    drawNESBox(mx + 10, listY, mw - 20, listH);

    if (offspringList.length === 0) {
      drawText8x8("NO OFFSPRING RECORDED FOR THIS CREATURE.", mx + 24, listY + 24, "#bcbcbc", 1);
    } else {
      const rowH = 26;
      const visibleRows = Math.floor((listH - 20) / rowH);
      const maxScroll = Math.max(0, offspringList.length - visibleRows);
      modalScroll = Math.max(0, Math.min(maxScroll, modalScroll));

      let curY = listY + 12;
      for (let i = modalScroll; i < Math.min(offspringList.length, modalScroll + visibleRows); i++) {
        const childId = offspringList[i];
        const child = entityRegistry.get(childId);

        const isHover = mouseX >= mx + 12 && mouseX <= mx + mw - 12 && mouseY >= curY && mouseY <= curY + rowH;
        if (isHover) {
          ctx.fillStyle = "#181828";
          ctx.fillRect(mx + 12, curY, mw - 24, rowH);
        }

        const isChildAlive = child && !child.destroyed && child.properties?.life?.energy > 0;
        const statusBadge = isChildAlive ? "[ALIVE]" : "[DEAD]";
        const statusCol = isChildAlive ? "#58d854" : "#9c5050";
        drawText8x8(statusBadge, mx + 20, curY + 6, statusCol, 1);

        const cName = (child?.properties?.name || `Child #${childId}`).slice(0, 24);
        drawText8x8(cName, mx + 85, curY + 6, "#ffffff", 1);

        const gender = child?.properties?.genitalia?.type === "vagina" || child?.properties?.genitalia?.type === "female" ? "FEMALE" : "MALE";
        drawText8x8(`[${gender}]`, mx + 310, curY + 6, gender === "FEMALE" ? "#ffb4c8" : "#3cbcfc", 1);

        const clanStr = (child?.properties?.group?.name || "SOLITARY").slice(0, 14);
        drawText8x8(`CLAN: ${clanStr}`, mx + 410, curY + 6, "#d3869b", 1);

        // Inspect Button
        drawNESButton(mx + mw - 95, curY + 2, 75, 20, "INSPECT", false, false);
        registerClickableRegion(mx + mw - 95, curY + 2, 75, 20, () => {
          lastSelectedId = childId;
          modalScroll = 0;
        });

        curY += rowH;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // TAB 4: CHRONICLE (Creature Life Chronicle)
  // ---------------------------------------------------------------------------
  else if (dossierTab === "CHRONICLE") {
    const listY = my + 62;
    const listH = mh - 72;
    drawNESBox(mx + 10, listY, mw - 20, listH);

    if (creatureEvents.length === 0) {
      drawText8x8("NO WORLD EVENTS RECORDED INVOLVING THIS CREATURE.", mx + 24, listY + 24, "#bcbcbc", 1);
    } else {
      const rowH = 26;
      const visibleRows = Math.floor((listH - 20) / rowH);
      const maxScroll = Math.max(0, creatureEvents.length - visibleRows);
      modalScroll = Math.max(0, Math.min(maxScroll, modalScroll));

      let curY = listY + 12;
      for (let i = modalScroll; i < Math.min(creatureEvents.length, modalScroll + visibleRows); i++) {
        const ev = creatureEvents[i];
        const isHover = mouseX >= mx + 12 && mouseX <= mx + mw - 12 && mouseY >= curY && mouseY <= curY + rowH;

        if (isHover) {
          ctx.fillStyle = "#181828";
          ctx.fillRect(mx + 12, curY, mw - 24, rowH);
        }

        const ts = ev.timestamp ? `D${ev.timestamp.day} ${String(ev.timestamp.hour).padStart(2, "0")}:${String(ev.timestamp.minute).padStart(2, "0")}` : `T${ev.tick}`;
        drawText8x8(ts, mx + 18, curY + 7, "#bcbcbc", 1);

        const typeColor = ev.type === "KILL" ? "#ff2040" : ev.type === "DEATH" ? "#9c5050" : ev.type === "ATTACK" ? "#f8b800" : ev.type === "AMPUTATION" ? "#e40058" : ev.type === "RELATION" ? "#d3869b" : ev.type === "DIALOGUE" ? "#3cbcfc" : ev.type === "BIRTH" ? "#f8b800" : ev.type === "SPROUT" ? "#58d854" : "#ffffff";
        drawText8x8(`[${ev.type}]`, mx + 110, curY + 7, typeColor, 1);

        const desc = (ev.description || "Event").slice(0, 48);
        drawText8x8(desc, mx + 225, curY + 7, "#ffffff", 1);

        // Click row to inspect
        const curEv = ev;
        registerClickableRegion(mx + 12, curY, mw - 180, rowH, () => {
          inspectingLogEvent = curEv;
          inspectingFromCreature = true;
        });

        // MAP Jump
        if (ev.location) {
          drawNESButton(mx + mw - 165, curY + 2, 45, 20, "MAP", false, false);
          registerClickableRegion(mx + mw - 165, curY + 2, 45, 20, () => {
            if (renderer) {
              renderer.setCamera(ev.location.x, ev.location.y, renderer.getCameraZoom());
              currentMode = "MAP";
            }
          });
        }

        // INSPECT Detail
        drawNESButton(mx + mw - 110, curY + 2, 90, 20, "INSPECT", false, false);
        registerClickableRegion(mx + mw - 110, curY + 2, 90, 20, () => {
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
  return entities.filter(e => {
    if (e.destroyed) return false;
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

  drawNESButton(mx + mw - 32, my + 6, 26, 24, "X", false, true);
  registerClickableRegion(mx + mw - 32, my + 6, 26, 24, () => { currentMode = "MAP"; });

  const list = getFilteredEntities();
  drawText8x8(`ENTITIES (${list.length})`, mx + 16, my + 14, "#f8b800", 1);

  // Expanded Filter Buttons
  const filters = ["ALL", "COLONISTS", "BEASTS", "CORPSES", "BUILDINGS", "FOOD & MEALS", "EQUIP", "FLORA", "ITEMS"];
  let fx = mx + 16;
  const fw = isMobile ? Math.floor((mw - 32) / filters.length) : 74;
  for (const f of filters) {
    const isAct = entityFilter === f;
    const flabel = isMobile ? f.slice(0, 3) : f;
    const btnW = isMobile ? fw : Math.max(52, f.length * 8 + 12);
    drawNESButton(fx, my + 36, btnW, 22, flabel, isAct, false);
    registerClickableRegion(fx, my + 36, btnW, 22, () => {
      entityFilter = f;
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
    drawText8x8("NAME", mx + 75, tableY + 12, "#f8b800", 1);
    drawText8x8("SPECIES", mx + 275, tableY + 12, "#f8b800", 1);
    drawText8x8("POS", mx + 400, tableY + 12, "#f8b800", 1);
    drawText8x8("HP", mx + 500, tableY + 12, "#f8b800", 1);
    drawText8x8("STATUS", mx + 580, tableY + 12, "#f8b800", 1);
    drawText8x8("CLAN", mx + 665, tableY + 12, "#f8b800", 1);
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

    if (!isMobile) {
      drawText8x8(`${cursorPrefix}#${ent.id}`, mx + 16, rowY + 3, isSelected || isHover ? "#f8b800" : "#ffffff", 1);
      drawText8x8((ent.properties.name || "ENTITY").slice(0, 22).toUpperCase(), mx + 75, rowY + 3, "#ffffff", 1);
      drawText8x8((ent.properties.species || "-").slice(0, 12).toUpperCase(), mx + 275, rowY + 3, "#3cbcfc", 1);
      drawText8x8(`[${ent.x},${ent.y}]`, mx + 400, rowY + 3, "#bcbcbc", 1);
      drawText8x8(String(brainHp), mx + 500, rowY + 3, "#f83800", 1);
      drawText8x8(statusStr, mx + 580, rowY + 3, statusCol, 1);
      const maxClanChars = Math.max(10, Math.floor((mw - 700) / 8));
      drawText8x8((ent.properties.group?.name || "-").slice(0, maxClanChars).toUpperCase(), mx + 665, rowY + 3, "#d3869b", 1);
    } else {
      drawText8x8(`${cursorPrefix}#${ent.id}`, mx + 16, rowY + 3, isSelected || isHover ? "#f8b800" : "#ffffff", 1);
      const maxMobileName = Math.max(8, Math.floor((mw - 190) / 8));
      drawText8x8((ent.properties.name || "ENTITY").slice(0, maxMobileName).toUpperCase(), mx + 64, rowY + 3, "#ffffff", 1);
      drawText8x8(String(brainHp), mx + mw - 116, rowY + 3, "#f83800", 1);
      drawText8x8(statusStr, mx + mw - 68, rowY + 3, statusCol, 1);
    }

    const curEnt = ent;
    registerClickableRegion(mx + 12, rowY - 4, mw - 24, rowH, () => {
      lastSelectedId = curEnt.id;
      if (renderer) {
        renderer.selectEntity(curEnt.id);
        renderer.setCamera(curEnt.x, curEnt.y, renderer.getCameraZoom());
      }
      currentMode = "INSPECT";
    });

    rowY += rowH;
  }

  ctx.restore();
}

// ---------------------------------------------------------------------------
// 4. In-Engine Modal 3: Groups Registry Screen ([G])
// ---------------------------------------------------------------------------

function getAllGroups() {
  const map = new Map();
  for (const e of entities) {
    if (e.destroyed) continue;
    if (e.properties && e.properties.group) {
      const g = e.properties.group;
      if (!map.has(g.id)) map.set(g.id, g);
    }
  }
  return Array.from(map.values());
}

function renderGroupsModal() {
  const isMobile = CANVAS_WIDTH <= 680;
  const mx = isMobile ? 6 : 40;
  const my = isMobile ? 36 : 40;
  const mw = isMobile ? CANVAS_WIDTH - 12 : CANVAS_WIDTH - 80;
  const mh = isMobile ? CANVAS_HEIGHT - 44 : CANVAS_HEIGHT - 86;

  ctx.save();
  ctx.fillStyle = "rgba(0, 0, 0, 0.9)";
  ctx.fillRect(0, 32, CANVAS_WIDTH, CANVAS_HEIGHT - 68);

  drawNESBox(mx, my, mw, mh);

  drawNESButton(mx + mw - 32, my + 6, 26, 24, "X", false, true);
  registerClickableRegion(mx + mw - 32, my + 6, 26, 24, () => {
    if (inspectingLogEvent) inspectingLogEvent = null;
    else if (inspectingGroup) inspectingGroup = null;
    else currentMode = "MAP";
  });

  // If viewing a specific event detail from clan history:
  if (inspectingLogEvent) {
    renderLogDetailView(mx, my, mw, mh, inspectingLogEvent);
    ctx.restore();
    return;
  }

  // If viewing full Clan Dossier / Stockpile Detail
  if (inspectingGroup) {
    renderGroupDetailView(mx, my, mw, mh, inspectingGroup);
    ctx.restore();
    return;
  }

  const groups = getAllGroups();
  const titleStr = isMobile ? `CLANS (${groups.length})` : `CLANS & FACTIONS (${groups.length}) - CLICK DETAILS TO INSPECT`;
  drawText8x8(titleStr, mx + 16, my + 14, "#f8b800", 1);

  if (groups.length === 0) {
    drawText8x8("NO FACTIONS FOUNDED YET.", mx + 20, my + 50, "#ffffff", 1);
    ctx.restore();
    return;
  }

  const cardW = mw - 24;
  const cardH = isMobile ? 120 : 98;
  const cardGap = 8;
  let cardY = my + 38;

  const visibleClanCount = isMobile ? 2 : 3;
  const maxScroll = Math.max(0, groups.length - visibleClanCount);
  modalScroll = Math.max(0, Math.min(maxScroll, modalScroll));

  for (let i = modalScroll; i < Math.min(groups.length, modalScroll + visibleClanCount); i++) {
    const g = groups[i];
    const livingMembers = g.members.filter(mid => {
      const m = getEntityById(mid);
      return m && !m.destroyed;
    }).length;
    const lEnt = getEntityById(g.members[0]);
    const leaderEnt = (lEnt && !lEnt.destroyed) ? lEnt : null;
    const stockpile = getGroupStockpile(g, entities);

    drawNESBox(mx + 12, cardY, cardW, cardH);

    // Render Clan Flag / Banner
    const flagTex = g.flagSkin ? findTexture(g.flagSkin) : null;
    const gFgColor = g.color ? `#${(g.color & 0xffffff).toString(16).padStart(6, "0")}` : "#f8b800";
    const gBgColor = g.backcolor ? `#${(g.backcolor & 0xffffff).toString(16).padStart(6, "0")}` : "#1e1e28";

    // Draw Flag Box
    ctx.fillStyle = gBgColor;
    ctx.fillRect(mx + 22, cardY + 8, 20, 20);
    ctx.strokeStyle = gFgColor;
    ctx.lineWidth = 1;
    ctx.strokeRect(mx + 22, cardY + 8, 20, 20);

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
        ctx.drawImage(flagTex.canvas, mx + 24, cardY + 10, 16, 16);
      }
    }

    const maxClanTitle = isMobile ? Math.max(10, Math.floor((cardW - 140) / 8)) : 30;
    drawText8x8(`* ${(g.name || "CLAN").slice(0, maxClanTitle).toUpperCase()}`, mx + 50, cardY + 14, gFgColor, 1);
    drawText8x8(`${livingMembers}/${g.members.length} ALIVE`, mx + cardW - (isMobile ? 110 : 335), cardY + 14, "#58d854", 1);

    drawText8x8(`LEADER: ${leaderEnt ? leaderEnt.properties.name.slice(0, 18).toUpperCase() : `MEMBER #${g.members[0]}`}`, mx + 24, cardY + 34, "#ffffff", 1);
    drawText8x8(`TERRITORY: ${g.claimedZones?.join(", ") || "NONE"} (${(g.claimedZones?.length || 0) * 64} TILES)`, mx + 24, cardY + 50, "#bcbcbc", 1);

    // Stockpile Summary
    const stockEntries = Object.entries(stockpile.items);
    let stockStr = "EMPTY";
    if (stockEntries.length > 0) {
      stockStr = stockEntries.map(([name, count]) => `${name}: x${count}`).join(" | ");
    }
    const maxStockLen = Math.floor((cardW - 40) / 8);
    if (stockStr.length > maxStockLen) {
      stockStr = stockStr.slice(0, maxStockLen - 3) + "...";
    }

    drawText8x8(`STOCKPILE (${stockpile.totalCount} ITEMS): ${stockStr.toUpperCase()}`, mx + 24, cardY + 66, "#ffd700", 1);

    if (!isMobile) {
      drawText8x8(`LOCATION: [GROUND: ${stockpile.breakdown.ground} | MEMBERS: ${stockpile.breakdown.members} | STORAGE: ${stockpile.breakdown.storage}]`, mx + 24, cardY + 82, "#3cbcfc", 1);

      // Desktop Buttons on top-right of card
      const curG = g;
      drawNESButton(mx + cardW - 255, cardY + 24, 80, 22, "DETAILS", false, false);
      registerClickableRegion(mx + cardW - 255, cardY + 24, 80, 22, () => {
        inspectingGroup = curG;
        groupDetailTab = "OVERVIEW";
        modalScroll = 0;
      });

      const isViewing = visualizedGroupId === g.id;
      drawNESButton(mx + cardW - 170, cardY + 24, 80, 22, isViewing ? "ZONE*" : "ZONE", isViewing, false);
      registerClickableRegion(mx + cardW - 170, cardY + 24, 80, 22, () => {
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
          if (count > 0) {
            if (renderer) renderer.setCamera(sumX / count, sumY / count, 1.5);
            if (rctRenderer) rctRenderer.setCamera(sumX / count, sumY / count, 1.5);
          }
          currentMode = "MAP";
        }
      });

      drawNESButton(mx + cardW - 85, cardY + 24, 75, 22, "LEADER", false, false);
      registerClickableRegion(mx + cardW - 85, cardY + 24, 75, 22, () => {
        if (leaderEnt && renderer) {
          lastSelectedId = leaderEnt.id;
          renderer.selectEntity(leaderEnt.id);
          renderer.setCamera(leaderEnt.x, leaderEnt.y, renderer.getCameraZoom());
          currentMode = "MAP";
        }
      });
    } else {
      // Mobile Buttons row on bottom of card
      const btnW = Math.floor((cardW - 48) / 3);
      const curG = g;
      drawNESButton(mx + 20, cardY + 86, btnW, 24, "DETAILS", false, false);
      registerClickableRegion(mx + 20, cardY + 86, btnW, 24, () => {
        inspectingGroup = curG;
        groupDetailTab = "OVERVIEW";
        modalScroll = 0;
      });

      const isViewing = visualizedGroupId === g.id;
      drawNESButton(mx + 20 + btnW + 4, cardY + 86, btnW, 24, isViewing ? "ZONE*" : "ZONE", isViewing, false);
      registerClickableRegion(mx + 20 + btnW + 4, cardY + 86, btnW, 24, () => {
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
          if (count > 0) {
            if (renderer) renderer.setCamera(sumX / count, sumY / count, 1.5);
            if (rctRenderer) rctRenderer.setCamera(sumX / count, sumY / count, 1.5);
          }
          currentMode = "MAP";
        }
      });

      drawNESButton(mx + 20 + (btnW + 4) * 2, cardY + 86, btnW, 24, "LEADER", false, false);
      registerClickableRegion(mx + 20 + (btnW + 4) * 2, cardY + 86, btnW, 24, () => {
        if (leaderEnt && renderer) {
          lastSelectedId = leaderEnt.id;
          renderer.selectEntity(leaderEnt.id);
          renderer.setCamera(leaderEnt.x, leaderEnt.y, renderer.getCameraZoom());
          currentMode = "MAP";
        }
      });
    }

    cardY += cardH + cardGap;
  }

  ctx.restore();
}

/**
 * Full-screen Clan Dossier: detailed territory, itemized stockpile, member roster, and complete history.
 */
function renderGroupDetailView(mx, my, mw, mh, g) {
  const livingMembers = g.members.filter(mid => {
    const m = getEntityById(mid);
    return m && !m.destroyed;
  });
  const leaderIdToFind = g.leaderId || g.members[0];
  const lEnt = getEntityById(leaderIdToFind);
  const leaderEnt = (lEnt && !lEnt.destroyed) ? lEnt : null;
  const stockpile = getGroupStockpile(g, entities);
  const groupEvents = getEventsForGroup(g, 100);

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

  // Close X Button
  drawNESButton(mx + mw - 32, my + 6, 26, 24, "X", false, true);
  registerClickableRegion(mx + mw - 32, my + 6, 26, 24, () => {
    inspectingGroup = null;
  });

  // Top Tabs
  const isOverview = groupDetailTab === "OVERVIEW";
  drawNESButton(mx + 16, my + 32, 100, 24, "OVERVIEW", isOverview, false);
  registerClickableRegion(mx + 16, my + 32, 100, 24, () => {
    groupDetailTab = "OVERVIEW";
    modalScroll = 0;
  });

  const isHistory = groupDetailTab === "HISTORY";
  const histTabLabel = `HISTORY (${groupEvents.length})`;
  const histTabWidth = histTabLabel.length * 8 + 20;
  drawNESButton(mx + 122, my + 32, histTabWidth, 24, histTabLabel, isHistory, false);
  registerClickableRegion(mx + 122, my + 32, histTabWidth, 24, () => {
    groupDetailTab = "HISTORY";
    modalScroll = 0;
  });

  // Top Action Buttons
  drawNESButton(mx + mw - 230, my + 32, 100, 24, "TERRITORY", false, false);
  registerClickableRegion(mx + mw - 230, my + 32, 100, 24, () => {
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
      if (count > 0) {
        if (renderer) renderer.setCamera(sumX / count, sumY / count, 1.5);
        if (rctRenderer) rctRenderer.setCamera(sumX / count, sumY / count, 1.5);
      }
      currentMode = "MAP";
    }
  });

  drawNESButton(mx + mw - 124, my + 32, 110, 24, "FOCUS LEADER", false, false);
  registerClickableRegion(mx + mw - 124, my + 32, 110, 24, () => {
    if (leaderEnt && renderer) {
      lastSelectedId = leaderEnt.id;
      renderer.selectEntity(leaderEnt.id);
      renderer.setCamera(leaderEnt.x, leaderEnt.y, renderer.getCameraZoom());
      currentMode = "MAP";
    }
  });

  // -------------------------------------------------------------------------
  // TAB 1: OVERVIEW (Territory, Stockpile, Member Roster)
  // -------------------------------------------------------------------------
  if (isOverview) {
    // 1. Territory & Base Box
    const box1Y = my + 62;
    const box1H = 50;
    drawNESBox(mx + 12, box1Y, mw - 24, box1H);
    drawText8x8("TERRITORY & CLAIMED ZONES:", mx + 20, box1Y + 10, "#ffd700", 1);
    const zoneListStr = (g.claimedZones || []).map(zk => {
      const c = parseZoneCoords(zk);
      return c ? `${zk} [X:${c.minX}..${c.maxX}, Y:${c.minY}..${c.maxY}]` : zk;
    }).join(" | ");
    drawText8x8(zoneListStr || "NO CLAIMED ZONES", mx + 20, box1Y + 28, "#ffffff", 1);

    // 2. Complete Itemized Stockpile Box
    const box2Y = box1Y + box1H + 6;
    const box2H = 96;
    drawNESBox(mx + 12, box2Y, mw - 24, box2H);
    drawText8x8(`TOTAL STOCKPILE (${stockpile.totalCount} ITEMS AVAILABLE):`, mx + 20, box2Y + 10, "#ffd700", 1);
    drawText8x8(`BREAKDOWN: [ON TERRITORY GROUND: ${stockpile.breakdown.ground} | WITH MEMBERS: ${stockpile.breakdown.members} | IN CLAN STORAGE: ${stockpile.breakdown.storage}]`, mx + 20, box2Y + 26, "#3cbcfc", 1);

    const stockEntries = Object.entries(stockpile.items);
    let stockLinesY = box2Y + 44;
    if (stockEntries.length === 0) {
      drawText8x8("NO RESOURCES OR ITEMS IN STOCKPILE CURRENTLY.", mx + 20, stockLinesY, "#bcbcbc", 1);
    } else {
      const maxCharsPerLine = Math.floor((mw - 60) / 8);
      const stockFormatted = stockEntries.map(([name, count]) => `• ${name}: ${count} units`).join("   ");
      const wrappedStock = wrapText8x8(stockFormatted.toUpperCase(), maxCharsPerLine);
      for (const sLine of wrappedStock.slice(0, 3)) {
        drawText8x8(sLine, mx + 20, stockLinesY, "#58d854", 1);
        stockLinesY += 16;
      }
    }

    // 3. Member Roster & Hand Inventories Box
    const box3Y = box2Y + box2H + 6;
    const box3H = (my + mh - 12) - box3Y;
    drawNESBox(mx + 12, box3Y, mw - 24, box3H);
    drawText8x8(`MEMBER ROSTER (${livingMembers.length}/${g.members.length} ALIVE):`, mx + 20, box3Y + 10, "#ffd700", 1);

    let rosterY = box3Y + 28;
    for (let mi = 0; mi < g.members.length; mi++) {
      if (rosterY + 22 > box3Y + box3H) break;
      const mid = g.members[mi];
      const m = getEntityById(mid);
      const mEnt = (m && !m.destroyed) ? m : null;

      const isAlive = !!mEnt;
      const isLeader = (mEnt && mEnt.id === g.leaderId);
      const leaderBadge = isLeader ? " [LEADER]" : "";
      const mName = mEnt ? `${mEnt.properties.name.toUpperCase()}${leaderBadge}` : `MEMBER #${mid} (DEAD)`;
      const mRole = mEnt ? (mEnt.properties.role || mEnt.properties.species || "HUMAN").toUpperCase() : "-";
      const hpStr = mEnt?.properties.life ? `${Math.round(mEnt.properties.life.energy)}HP` : "-";

      // Held items
      let heldStr = "HANDS: EMPTY";
      if (mEnt) {
        const left = mEnt.properties.arm_left?.heldItem;
        const right = mEnt.properties.arm_right?.heldItem;
        const held = [];
        if (left) held.push(`L:${left.resourceType || left.name || "ITEM"}`);
        if (right) held.push(`R:${right.resourceType || right.name || "ITEM"}`);
        if (held.length > 0) heldStr = held.join(" | ").toUpperCase();
      }

      const mText = `• ${mName} [${mRole}] - ${hpStr} | ${heldStr}`;
      drawText8x8(mText.slice(0, Math.floor((mw - 140) / 8)), mx + 20, rosterY + 4, isAlive ? "#ffffff" : "#9c5050", 1);

      if (mEnt) {
        const curM = mEnt;
        drawNESButton(mx + mw - 100, rosterY - 2, 70, 20, "FOCUS", false, false);
        registerClickableRegion(mx + mw - 100, rosterY - 2, 70, 20, () => {
          lastSelectedId = curM.id;
          if (renderer) {
            renderer.selectEntity(curM.id);
            renderer.setCamera(curM.x, curM.y, renderer.getCameraZoom());
          }
          currentMode = "MAP";
        });
      }

      rosterY += 22;
    }
  }

  // -------------------------------------------------------------------------
  // TAB 2: HISTORY (Chronological Clan & Member Event Log)
  // -------------------------------------------------------------------------
  else if (isHistory) {
    const histBoxY = my + 62;
    const histBoxH = (my + mh - 12) - histBoxY;
    drawNESBox(mx + 12, histBoxY, mw - 24, histBoxH);

    drawText8x8("CHRONOLOGICAL CLAN EVENT HISTORY & PARTICIPANTS LOG:", mx + 20, histBoxY + 12, "#ffd700", 1);
    drawText8x8(`TRACKING ALL RECORDED EVENTS FOR ${(g.name || "CLAN").toUpperCase()} AND ALL ITS PARTICIPANTS`, mx + 20, histBoxY + 28, "#3cbcfc", 1);

    if (groupEvents.length === 0) {
      drawText8x8("NO HISTORICAL EVENTS RECORDED FOR THIS CLAN YET.", mx + 20, histBoxY + 54, "#bcbcbc", 1);
    } else {
      const eventsReversed = groupEvents.slice().reverse();
      const rowHeight = 26;
      const visibleCount = Math.floor((histBoxH - 52) / rowHeight);
      const maxScroll = Math.max(0, eventsReversed.length - visibleCount);
      modalScroll = Math.max(0, Math.min(maxScroll, modalScroll));

      let logY = histBoxY + 48;
      for (let i = modalScroll; i < Math.min(eventsReversed.length, modalScroll + visibleCount); i++) {
        const ev = eventsReversed[i];
        const isHover = mouseX >= mx + 16 && mouseX <= mx + mw - 170 && mouseY >= logY - 2 && mouseY <= logY + 22;
        if (isHover) {
          ctx.fillStyle = "#181828";
          ctx.fillRect(mx + 16, logY - 2, mw - 186, 24);
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

        // Locate Button
        drawNESButton(mx + mw - 80, logY - 1, 60, 20, "MAP", false, false);
        registerClickableRegion(mx + mw - 80, logY - 1, 60, 20, () => {
          if (renderer && curEv.location) {
            renderer.setCamera(curEv.location.x, curEv.location.y, 2.0);
          }
          currentMode = "MAP";
        });

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

function getFilteredLogs() {
  const events = allEvents.slice().reverse();
  if (logFilter === "ALL") return events;
  return events.filter(e => e.type === logFilter);
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

  drawNESButton(mx + mw - 32, my + 6, 26, 24, "X", false, true);
  registerClickableRegion(mx + mw - 32, my + 6, 26, 24, () => {
    if (inspectingLogEvent) inspectingLogEvent = null;
    else currentMode = "MAP";
  });

  // If viewing a specific event detail:
  if (inspectingLogEvent) {
    renderLogDetailView(mx, my, mw, mh, inspectingLogEvent);
    ctx.restore();
    return;
  }

  const list = getFilteredLogs();
  const titleStr = isMobile ? `WORLD LOG (${list.length})` : `WORLD LOG (${list.length}) - CLICK EVENT TO INSPECT`;
  drawText8x8(titleStr, mx + 16, my + 14, "#f8b800", 1);

  // Filter Buttons
  const filters = ["ALL", "KILL", "ATTACK", "RELATION", "DIALOGUE", "AMPUTATION", "BIRTH", "DEATH", "SPROUT", "MINE", "BUILD"];
  let fx = mx + 16;
  for (const f of filters) {
    if (fx + 40 > mx + mw - 16) break; // Don't overflow filters off screen
    const isAct = logFilter === f;
    const flabel = isMobile ? f.slice(0, 4) : f;
    const fw = flabel.length * 8 + 12;
    drawNESButton(fx, my + 36, fw, 22, flabel, isAct, false);
    const filterKey = f;
    registerClickableRegion(fx, my + 36, fw, 22, () => {
      logFilter = filterKey;
      modalScroll = 0;
    });
    fx += fw + 4;
  }

  // Event List Box
  const tableY = my + 64;
  const tableH = mh - 74;
  drawNESBox(mx + 10, tableY, mw - 20, tableH);

  const rowH = 22;
  const visibleRows = Math.floor((tableH - 16) / rowH);
  const maxScroll = Math.max(0, list.length - visibleRows);
  modalScroll = Math.max(0, Math.min(maxScroll, modalScroll));

  let rowY = tableY + 16;
  for (let i = modalScroll; i < Math.min(list.length, modalScroll + visibleRows); i++) {
    const ev = list[i];
    const isHover = mouseX >= mx + 12 && mouseX <= mx + mw - 12 && mouseY >= rowY - 4 && mouseY <= rowY + 16;

    if (isHover) {
      ctx.fillStyle = "#181828";
      ctx.fillRect(mx + 12, rowY - 4, mw - 24, rowH);
    }

    const ts = ev.timestamp ? `D${ev.timestamp.day} ${String(ev.timestamp.hour).padStart(2, "0")}:${String(ev.timestamp.minute).padStart(2, "0")}` : `T${ev.tick}`;
    drawText8x8(ts, mx + 18, rowY + 3, "#bcbcbc", 1);

    const typeColor = ev.type === "KILL" ? "#ff2040" : ev.type === "DEATH" ? "#9c5050" : ev.type === "ATTACK" ? "#f8b800" : ev.type === "AMPUTATION" ? "#e40058" : ev.type === "RELATION" ? "#d3869b" : ev.type === "DIALOGUE" ? "#3cbcfc" : ev.type === "BIRTH" ? "#f8b800" : ev.type === "SPROUT" ? "#58d854" : "#ffffff";

    if (!isMobile) {
      drawText8x8(`[${ev.type}]`, mx + 115, rowY + 3, typeColor, 1);
      const locStr = ev.location ? `[${ev.location.x},${ev.location.y}] ` : "";
      const maxDescChars = Math.floor((mw - 260) / 8);
      const shortDesc = `${locStr}${ev.description}`.slice(0, maxDescChars).toUpperCase();
      drawText8x8(shortDesc, mx + 235, rowY + 3, "#ffffff", 1);
    } else {
      drawText8x8(`[${ev.type.slice(0, 4)}]`, mx + 86, rowY + 3, typeColor, 1);
      const maxDescChars = Math.max(8, Math.floor((mw - 156) / 8));
      const shortDesc = (ev.description || "").slice(0, maxDescChars).toUpperCase();
      drawText8x8(shortDesc, mx + 140, rowY + 3, "#ffffff", 1);
    }

    // Detail click
    const curEv = ev;
    registerClickableRegion(mx + 12, rowY - 4, mw - 24, rowH, () => {
      inspectingLogEvent = curEv;
    });

    rowY += rowH;
  }

  ctx.restore();
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
    drawText8x8(`COORDINATES: [X: ${ev.location.x}, Y: ${ev.location.y}]`, mx + 30, my + 96, "#bcbcbc", 1);
  }

  let entButtonX = mx + 30;
  if (ev.primaryEntityId !== null && ev.primaryEntityId !== undefined) {
    const pEnt = entityRegistry.get(ev.primaryEntityId);
    const pName = (pEnt?.properties?.name || `Entity #${ev.primaryEntityId}`).slice(0, 16);
    drawNESButton(entButtonX, my + 114, 200, 22, `ACTOR: ${pName.toUpperCase()}`, false, false);
    registerClickableRegion(entButtonX, my + 114, 200, 22, () => {
      lastSelectedId = ev.primaryEntityId;
      currentMode = "INSPECT";
      inspectingLogEvent = null;
    });
    entButtonX += 210;
  }

  if (ev.secondaryEntityId !== null && ev.secondaryEntityId !== undefined) {
    const sEnt = entityRegistry.get(ev.secondaryEntityId);
    const sName = (sEnt?.properties?.name || `Entity #${ev.secondaryEntityId}`).slice(0, 16);
    drawNESButton(entButtonX, my + 114, 200, 22, `TARGET: ${sName.toUpperCase()}`, false, false);
    registerClickableRegion(entButtonX, my + 114, 200, 22, () => {
      lastSelectedId = ev.secondaryEntityId;
      currentMode = "INSPECT";
      inspectingLogEvent = null;
    });
    entButtonX += 210;
  }

  // Linked / Cited Event Button
  const citedId = ev.metadata?.referencedEventId || ev.metadata?.gossipedEventId || ev.metadata?.realEventId || ev.metadata?.citedEventId;
  if (citedId) {
    const citedEv = getEventById(citedId);
    const citedLabel = isLie ? `ORIGINAL TRUTH #${citedId}` : `GOSSIP TOPIC #${citedId}`;
    drawNESButton(entButtonX, my + 114, 210, 22, citedLabel, false, false);
    registerClickableRegion(entButtonX, my + 114, 210, 22, () => {
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
      if (renderer) {
        renderer.setCamera(ev.location.x, ev.location.y, renderer.getCameraZoom());
        currentMode = "MAP";
      }
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
  const pw = isMobile ? CANVAS_WIDTH - 16 : 232;
  const ph = isMobile ? 260 : 362;
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

  // 3. Category Tabs: [TILE] [MOB] [ITEM] [TOOL]
  const tabs = [
    { id: "TILES", label: "TILE" },
    { id: "CREATURES", label: "MOB" },
    { id: "ITEMS", label: "ITEM" },
    { id: "TOOLS", label: "TOOL" }
  ];

  const tabW = Math.floor((pw - 28) / 4);
  let tabX = px + 8;
  for (const t of tabs) {
    const isAct = editorTab === t.id;
    drawNESButton(tabX, py + 26, tabW, 20, t.label, isAct, false);
    const tabId = t.id;
    registerClickableRegion(tabX, py + 26, tabW, 20, () => {
      editorTab = tabId;
      editorPage = 0;
    });
    tabX += tabW + 4;
  }

  const contentY = py + 52;
  const contentH = ph - 114;

  // Inner NES Content Frame
  drawNESBox(px + 8, contentY, pw - 16, contentH);

  // TAB 1: TILES
  if (editorTab === "TILES") {
    drawText8x8("TERRAIN TILES:", px + 14, contentY + 8, "#3cbcfc", 1);

    const cols = 2;
    const colW = Math.floor((pw - 36) / cols);
    const itemH = 22;

    for (let i = 0; i < EDITOR_TILES.length; i++) {
      const tile = EDITOR_TILES[i];
      const col = i % cols;
      const row = Math.floor(i / cols);
      const bx = px + 14 + col * (colW + 6);
      const by = contentY + 22 + row * (itemH + 4);
      const isSel = editorTool === "PAINT" && editorSelectedTile === tile.id;

      drawNESButton(bx, by, colW, itemH, ` ${tile.label.slice(0, 7)}`, isSel, false);

      // Mini Color Swatch
      ctx.fillStyle = tile.color;
      ctx.fillRect(bx + 4, by + 5, 10, 10);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1;
      ctx.strokeRect(bx + 4, by + 5, 10, 10);

      const tileId = tile.id;
      registerClickableRegion(bx, by, colW, itemH, () => {
        editorSelectedTile = tileId;
        editorTool = "PAINT";
        editorActiveSpawner = null;
      });
    }

    // Brush Sizes
    const brushY = contentY + 118;
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

  // TAB 2: CREATURES (Paginated: 8 per page)
  else if (editorTab === "CREATURES") {
    const itemsPerPage = 8;
    const maxPages = Math.ceil(EDITOR_CREATURES.length / itemsPerPage);
    drawText8x8(`SPAWN MOB (P.${editorPage + 1}/${maxPages}):`, px + 14, contentY + 8, "#3cbcfc", 1);

    const cols = 2;
    const colW = Math.floor((pw - 36) / cols);
    const itemH = 22;

    const startIdx = editorPage * itemsPerPage;
    const pageItems = EDITOR_CREATURES.slice(startIdx, startIdx + itemsPerPage);

    for (let i = 0; i < pageItems.length; i++) {
      const c = pageItems[i];
      const col = i % cols;
      const row = Math.floor(i / cols);
      const bx = px + 14 + col * (colW + 6);
      const by = contentY + 22 + row * (itemH + 4);
      const isSel = editorTool === "SPAWN" && editorActiveSpawner?.label === c.label;

      drawNESButton(bx, by, colW, itemH, `+${c.label.slice(0, 8)}`, isSel, false);

      const spawnerObj = c;
      registerClickableRegion(bx, by, colW, itemH, () => {
        editorActiveSpawner = spawnerObj;
        editorTool = "SPAWN";
      });
    }

    // Pagination buttons
    const pageY = contentY + 146;
    drawNESButton(px + 14, pageY, 96, 22, "◀ PREV", false, false);
    registerClickableRegion(px + 14, pageY, 96, 22, () => {
      editorPage = (editorPage - 1 + maxPages) % maxPages;
    });

    drawNESButton(px + pw - 110, pageY, 96, 22, "NEXT ▶", false, false);
    registerClickableRegion(px + pw - 110, pageY, 96, 22, () => {
      editorPage = (editorPage + 1) % maxPages;
    });
  }

  // TAB 3: NATURE & ITEMS (Paginated)
  else if (editorTab === "ITEMS") {
    const itemsPerPage = 8;
    const maxPages = Math.ceil(EDITOR_ITEMS.length / itemsPerPage);
    drawText8x8(`ITEMS/NATURE (P.${editorPage + 1}/${maxPages}):`, px + 14, contentY + 8, "#3cbcfc", 1);

    const cols = 2;
    const colW = Math.floor((pw - 36) / cols);
    const itemH = 22;

    const startIdx = editorPage * itemsPerPage;
    const pageItems = EDITOR_ITEMS.slice(startIdx, startIdx + itemsPerPage);

    for (let i = 0; i < pageItems.length; i++) {
      const it = pageItems[i];
      const col = i % cols;
      const row = Math.floor(i / cols);
      const bx = px + 14 + col * (colW + 6);
      const by = contentY + 22 + row * (itemH + 4);
      const isSel = editorTool === "SPAWN" && editorActiveSpawner?.label === it.label;

      drawNESButton(bx, by, colW, itemH, `+${it.label.slice(0, 8)}`, isSel, false);

      const spawnerObj = it;
      registerClickableRegion(bx, by, colW, itemH, () => {
        editorActiveSpawner = spawnerObj;
        editorTool = "SPAWN";
      });
    }

    // Pagination buttons
    const pageY = contentY + 146;
    drawNESButton(px + 14, pageY, 96, 22, "◀ PREV", false, false);
    registerClickableRegion(px + 14, pageY, 96, 22, () => {
      editorPage = (editorPage - 1 + maxPages) % maxPages;
    });

    drawNESButton(px + pw - 110, pageY, 96, 22, "NEXT ▶", false, false);
    registerClickableRegion(px + pw - 110, pageY, 96, 22, () => {
      editorPage = (editorPage + 1) % maxPages;
    });
  }

  // TAB 4: TOOLS
  else if (editorTab === "TOOLS") {
    drawText8x8("MAP TOOLS:", px + 14, contentY + 8, "#3cbcfc", 1);

    const tools = [
      { id: "PAINT", label: "TERRAIN BRUSH" },
      { id: "EYEDROPPER", label: "EYEDROPPER" },
      { id: "BULLDOZER", label: "BULLDOZER (DEL)" }
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
  if (editorTool === "PAINT") activeStr = `TILE: ${EDITOR_TILES[editorSelectedTile]?.label.slice(0, 8)}`;
  else if (editorTool === "SPAWN") activeStr = `MOB: ${editorActiveSpawner?.label.slice(0, 9)}`;
  else if (editorTool === "BULLDOZER") activeStr = "BULLDOZER";
  else if (editorTool === "EYEDROPPER") activeStr = "EYEDROPPER";

  drawText8x8(`ACTIVE: ${activeStr}`, px + 14, footerY + 7, "#f8b800", 1);
  drawText8x8("L-CLICK MAP: APPLY", px + 14, footerY + 20, "#58d854", 1);
  drawText8x8("R-CLICK: PAN | ESC: EXIT", px + 14, footerY + 32, "#bcbcbc", 1);
}

function renderMapEditorOverlay() {
  if (!world || !isEditorOpen || !editorTool) return;

  const hoverTile = getEditorHoverTile();
  const hoverTileX = hoverTile.x;
  const hoverTileY = hoverTile.y;

  const panelX = CANVAS_WIDTH - 226;
  const isOverPanel = mouseX >= panelX && mouseY >= 36 && mouseY <= 420;

  // If hovering over active map area and not over the docked corner panel
  if (!isOverPanel && mouseY > 32 && mouseY < CANVAS_HEIGHT - 36 && mouseX >= 0 && mouseX <= CANVAS_WIDTH) {
    ctx.save();
    const infoX = Math.min(CANVAS_WIDTH - 230, mouseX + 16);
    const infoY = Math.max(52, mouseY - 14);

    if (editorTool === "PAINT") {
      const tileName = EDITOR_TILES[editorSelectedTile]?.label || "TILE";
      const badge = `PAINT [${hoverTileX},${hoverTileY}] (${editorBrushSize}x${editorBrushSize}): ${tileName}`;
      drawText8x8(badge, infoX, infoY, EDITOR_TILES[editorSelectedTile]?.color || "#f8b800", 1);
    } else if (editorTool === "SPAWN" && editorActiveSpawner) {
      drawText8x8(`SPAWN [${hoverTileX},${hoverTileY}]: ${editorActiveSpawner.label}`, infoX, infoY, "#58d854", 1);
    } else if (editorTool === "BULLDOZER") {
      drawText8x8(`ERASE [${hoverTileX},${hoverTileY}]`, infoX, infoY, "#e40058", 1);
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

        ctx.strokeStyle = EDITOR_TILES[editorSelectedTile]?.color || "#f8b800";
        ctx.lineWidth = 2;
        ctx.strokeRect(startX, startY, boxSize, boxSize);

        ctx.fillStyle = (EDITOR_TILES[editorSelectedTile]?.color || "#f8b800") + "44";
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

  // Close Button
  drawNESButton(mx + mw - 32, my + 6, 26, 24, "X", false, true);
  registerClickableRegion(mx + mw - 32, my + 6, 26, 24, () => {
    currentMode = "MAP";
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

  // 7. Founding Pioneer Clans / Embarks
  drawText8x8(`7. EMBARKS / FOUNDING CLANS: [ ${genSpawnPioneers ? genEmbarkCount + " CLANS" : "NONE"} ]`, mx + 16, curY, "#3cbcfc", 1);
  const embarkOptions = [
    { count: 0, label: "NONE" },
    { count: 1, label: "1 CLAN" },
    { count: 2, label: "2 CLANS" },
    { count: 3, label: "3 CLANS (DEF)" },
    { count: 4, label: "4 CLANS" },
    { count: 5, label: "5 CLANS" }
  ];
  let ebx = mx + 16;
  for (const opt of embarkOptions) {
    const isSel = genSpawnPioneers ? (genEmbarkCount === opt.count) : (opt.count === 0);
    const bw = opt.count === 3 ? 128 : 88;
    drawNESButton(ebx, curY + 10, bw, 22, opt.label, isSel, false);
    const cnt = opt.count;
    registerClickableRegion(ebx, curY + 10, bw, 22, () => {
      if (cnt === 0) {
        genSpawnPioneers = false;
        genEmbarkCount = 0;
      } else {
        genSpawnPioneers = true;
        genEmbarkCount = cnt;
      }
    });
    ebx += bw + 6;
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
  const subText = "Chronicles of Brutopolis";
  drawText8x8Centered(subText, subY, "#3cbcfc", 1, "#000000", 1);

  const curScen = PREFAB_SCENARIOS[selectedScenarioIdx] || PREFAB_SCENARIOS[0];

  // 4. Main Action Menu Box (Clean centered list)
  const menuBoxW = Math.min(420, CANVAS_WIDTH - 32);
  const menuBoxX = Math.floor((CANVAS_WIDTH - menuBoxW) / 2);
  let menuY = subY + (isMobile ? 24 : 36);

  // Button 1: NEW WORLD (Highlighted)
  drawNESButton(menuBoxX, menuY, menuBoxW, 32, "NEW WORLD", true, false);
  registerClickableRegion(menuBoxX, menuY, menuBoxW, 32, () => {
    startNewGame(curScen.preset, curScen.seed);
  });
  menuY += 40;

  // Button 2: CUSTOM GENERATOR
  drawNESButton(menuBoxX, menuY, menuBoxW, 28, "CUSTOM WORLD GENERATOR", false, false);
  registerClickableRegion(menuBoxX, menuY, menuBoxW, 28, () => {
    currentMode = "GENERATOR";
    modalScroll = 0;
  });
  menuY += 34;

  // Button 3: CONTINUE (Quicksave)
  const hasSave = !!localStorage.getItem("brutopolis_quicksave");
  const saveLabel = hasSave ? "CONTINUE SAVED GAME" : "CONTINUE (NO SAVE FOUND)";
  drawNESButton(menuBoxX, menuY, menuBoxW, 28, saveLabel, hasSave, false);
  if (hasSave) {
    registerClickableRegion(menuBoxX, menuY, menuBoxW, 28, () => {
      try {
        const raw = localStorage.getItem("brutopolis_quicksave");
        if (raw) {
          const saveObj = JSON.parse(raw);
          loadWorldState(saveObj);
        }
      } catch (err) {
        console.error("Error loading quicksave:", err);
      }
    });
  }
  menuY += 34;

  // Button 4: LOAD JSON FILE
  drawNESButton(menuBoxX, menuY, menuBoxW, 28, "LOAD .JSON SAVE FILE", false, false);
  registerClickableRegion(menuBoxX, menuY, menuBoxW, 28, openSaveFilePicker);
  menuY += 34;

  // Button 5: Quick Settings Row (2D/3D & Audio)
  const halfW = Math.floor((menuBoxW - 8) / 2);
  const view3DLabel = is3DMode ? "VIEW: 3D ISO" : "VIEW: 2D MAP";
  drawNESButton(menuBoxX, menuY, halfW, 28, view3DLabel, is3DMode, false);
  registerClickableRegion(menuBoxX, menuY, halfW, 28, toggle3DMode);

  const audioLabel = isAudioMuted ? "AUDIO: MUTED" : "AUDIO: ON";
  drawNESButton(menuBoxX + halfW + 8, menuY, halfW, 28, audioLabel, !isAudioMuted, false);
  registerClickableRegion(menuBoxX + halfW + 8, menuY, halfW, 28, toggleAudio);

  // Footer text
  const footY = CANVAS_HEIGHT - 18;
  const footText = "a game by jardimdanificado and kayoa";
  drawText8x8Centered(footText, footY, "#888888", 1, "#000000", 1);

  ctx.restore();
}

// ---------------------------------------------------------------------------
// Main Animation Frame Loop
// ---------------------------------------------------------------------------

function frame(time) {
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

  // Title Screen: Scenario auto-cycle every 15 seconds, static camera per scenario
  if (currentMode === "TITLE") {
    titleAutoCycleTimer += dt;
    if (titleAutoCycleTimer >= 15.0) {
      titleAutoCycleTimer = 0;
      selectedScenarioIdx = (selectedScenarioIdx + 1) % PREFAB_SCENARIOS.length;
      initTitleWorld(selectedScenarioIdx);
    }
  }

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

    tpsCounter++;

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
    } else if (is3DMode && rctRenderer) {
      rctRenderer.setPaused(isPaused);
      if (isEditorOpen && editorTool) {
        const hoverTile = getEditorHoverTile();
        let toolColorHex = 0xffe600;
        if (editorTool === "SPAWN") toolColorHex = 0x58d854;
        else if (editorTool === "BULLDOZER") toolColorHex = 0xe40058;
        else if (editorTool === "EYEDROPPER") toolColorHex = 0x3cbcfc;
        else if (editorTool === "PAINT" && EDITOR_TILES[editorSelectedTile]?.color) {
          toolColorHex = parseInt(EDITOR_TILES[editorSelectedTile].color.replace("#", "0x"), 16);
        }
        rctRenderer.setEditorCursor(world, hoverTile.x, hoverTile.y, editorTool === "PAINT" ? editorBrushSize : 1, toolColorHex);
      } else {
        rctRenderer.hideEditorCursor();
      }
      const visionTarget = (isCreatureVisionMode && lastSelectedId > 0) ? getEntityById(lastSelectedId) : null;
      rctRenderer.render(world, entities, time * 0.001, dt, isPaused ? 0.0 : simSpeed, visionTarget, visualizedGroupId);
      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    } else {
      renderer.render(world, entities, time * 0.001, dt, simSpeed);
    }

    // 3. Mode-specific UI Overlay Rendering
    if (currentMode === "TITLE") {
      renderTitleScreen();
    } else {
      renderCreatureVisionOverlay();
      renderTerritoryOverlay();
      renderTopHudBar();
      renderBottomToolbar();
      renderHoverTooltip();
      renderCreatureSummaryBox();
      renderCreatureEventLogPanel();
      renderMapEditorOverlay();
      renderCompactEditorPanel();

      if (inspectingLogEvent) {
        const mx = 30;
        const my = 30;
        const mw = CANVAS_WIDTH - 60;
        const mh = CANVAS_HEIGHT - 60;
        renderLogDetailView(mx, my, mw, mh, inspectingLogEvent);
      } else if (currentMode === "INSPECT") renderDossierModal();
      else if (currentMode === "ENTITIES") renderEntitiesModal();
      else if (currentMode === "GROUPS") renderGroupsModal();
      else if (currentMode === "LOGS") renderLogsModal();
      else if (currentMode === "GENERATOR") renderGeneratorModal();
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
        // 3. Passaros: Long-range reach, starts resonating from high distance (0.45 vol at high altitude) and reaches 1.0 on ground
        const groundNatureVol = 0.45 + 0.55 * Math.pow(normZoom, 0.6);
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
      if (now - window._lastActivitySoundTimer > 150 && entities && entities.length > 0 && normZoom > 0.25) {
        window._lastActivitySoundTimer = now;

        // Find entities close to camera view (within ~40 tiles radius)
        const visibleAudibleEntities = entities.filter(e => e && !e.destroyed && Math.hypot(e.x - camX, e.y - camY) < 38);
        if (visibleAudibleEntities.length > 0) {
          const pickedEntity = visibleAudibleEntities[Math.floor(Math.random() * visibleAudibleEntities.length)];
          const isWalking = pickedEntity.vx !== 0 || pickedEntity.vy !== 0 || pickedEntity.state === "WALK" || pickedEntity.isMoving;
          const isUnderConstruction = pickedEntity.isConstructed === false || (pickedEntity.properties?.house && !pickedEntity.properties.house.isCompleted) || (pickedEntity.properties?.warehouse && !pickedEntity.properties.warehouse.isCompleted);
          const isCitizen = pickedEntity.properties?.brain || pickedEntity.properties?.group || (pickedEntity.properties?.job && pickedEntity.properties.job !== "IDLE");

          const roll = Math.random();
          if (isUnderConstruction || (isCitizen && pickedEntity.properties?.job === "BUILD")) {
            // 3D Construction & Building hammer/tool sounds
            if (roll < 0.60) {
              audio.playOneShot("event:/SFX/Activity_Town", null, { x: pickedEntity.x, y: pickedEntity.y, z: 0 });
            }
          } else if (isWalking) {
            // 3D Spatial Footsteps on Grass
            if (roll < 0.55) {
              audio.playOneShot("event:/SFX/Footstep_Grass", null, { x: pickedEntity.x, y: pickedEntity.y, z: 0 });
            }
          } else if (isCitizen) {
            // 3D Human Mumbling / Grunting / Village Chatter
            if (roll < 0.35) {
              audio.playOneShot("event:/SFX/Mumble_Human", null, { x: pickedEntity.x, y: pickedEntity.y, z: 0 });
            } else if (roll < 0.60) {
              audio.playOneShot("event:/SFX/Activity_Town", null, { x: pickedEntity.x, y: pickedEntity.y, z: 0 });
            }
          }
        }
      }

      // Sync time of day ('tempo dos dias' parameter: 0 to 24h) for birds/insects/cicadas
      if (world && world.clock) {
        const timeOfDay = world.clock.hour + (world.clock.minute / 60.0);
        if (Math.abs((window._lastAudioTod || -1) - timeOfDay) > 0.05) {
          window._lastAudioTod = timeOfDay;
          audio.setInstanceParameter("passaros", "tempo dos dias", timeOfDay);
          audio.setInstanceParameter("choir", "tempo dos dias", timeOfDay);
          audio.setGlobalParameter("tempo dos dias", timeOfDay);
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
