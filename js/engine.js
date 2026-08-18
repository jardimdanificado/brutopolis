// =============================================================================
// Brutopolis - Flat Property Bag Engine (Zero Nesting)
// =============================================================================

import { recordWorldEvent } from "./event_log.js";

const encoder = new TextEncoder();
let nextEntityId = 1;

// Global simulation tick counter
export let currentTick = 0;

export function resetEngineTicks() {
  currentTick = 0;
  nextEntityId = 1;
  entityRegistry.clear();
}

export function incrementEngineTick() {
  currentTick++;
}

// Central O(1) registry for all entities in the universe (living and deceased)
export const entityRegistry = new Map();

/**
 * Creates a pure JavaScript Entity with a flat Property Bag
 */
export function createEntity(properties = {}, x = 0, y = 0) {
  const entity = {
    id: nextEntityId++,
    birthTick: currentTick,
    deathTick: null,
    destroyed: false,
    x: Math.round(x),
    y: Math.round(y),
    properties: { ...properties }
  };

  entityRegistry.set(entity.id, entity);
  return entity;
}

/**
 * Finds any entity in O(1) by ID (both living and deceased entities remain available)
 */
export function getEntityById(id) {
  return entityRegistry.get(id);
}

/**
 * Destroys an active entity in the world (retains entity in entityRegistry for future references)
 */
export function destroyEntity(entity, entitiesArray = null) {
  if (!entity) return;
  entity.destroyed = true;
  entity.deathTick = currentTick;

  // Retain in entityRegistry permanently!
  if (entitiesArray) {
    const idx = entitiesArray.indexOf(entity);
    if (idx >= 0) entitiesArray.splice(idx, 1);
  }
}

/**
 * Amputates a physical limb whose condition reached <= 0
 */
export function amputateLimb(entity, propKey, prop, entitiesArray, world) {
  if (!entity || !entity.properties[propKey]) return;

  const partName = prop.name || propKey;
  delete entity.properties[propKey];

  // Add amputated stump property with heavy bleed and trauma energy drain
  entity.properties[`amputated_${propKey}`] = {
    originalPart: propKey,
    bleedRate: 18.0,
    nutrition: 0,
    effect(ent, dt) {
      if (ent.properties.life) {
        ent.properties.life.energy = Math.max(0, ent.properties.life.energy - dt * this.bleedRate);
      }
    }
  };

  // Find adjacent walkable tile for severed limb to fall
  let dropX = entity.x;
  let dropY = entity.y;
  const offsets = [
    { dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 },
    { dx: 1, dy: 1 }, { dx: -1, dy: -1 }, { dx: 1, dy: -1 }, { dx: -1, dy: 1 }
  ];

  for (const off of offsets) {
    const tx = entity.x + off.dx;
    const ty = entity.y + off.dy;
    if (world && world.isWalkable(tx, ty)) {
      dropX = tx;
      dropY = ty;
      break;
    }
  }

  // Create severed food item with dedicated authentic sprites
  let skin = "Item_Steak.png";
  let color = 0xffe65a5a;
  if (propKey.includes("wing")) {
    skin = "Item_Cloak.png";
    color = 0xffe6e6f0;
  } else if (propKey.includes("arm") || propKey.includes("paw")) {
    skin = "Creature_Hand_U.png";
    color = 0xffe65a5a;
  } else if (propKey.includes("leg")) {
    skin = "Item_Drumstick.png";
    color = 0xffe65a5a;
  } else if (propKey.includes("eye")) {
    skin = "Item_Eyeball.png";
    color = 0xff58c8f8;
  } else if (prop.foodType === "organ") {
    skin = "Other_Heart.png";
    color = 0xffc83232;
  } else if (prop.foodType === "bone") {
    skin = "Item_Bone.png";
    color = 0xfff5f5f0;
  } else if (prop.foodType === "plant") {
    skin = "Item_Root.png";
    color = 0xff8c643c;
  }

  const severedFood = createEntity(
    {
      name: `${partName} Decepado de ${entity.properties.name || "Criatura"}`,
      render: { skin, color, backcolor: 0x00000000 },
      edible: {
        nutrition: prop.nutrition || 1200,
        foodType: prop.foodType || "meat",
        digestDuration: 25
      }
    },
    dropX,
    dropY
  );

  if (entitiesArray) entitiesArray.push(severedFood);

  // Record indexed world event
  recordWorldEvent({
    type: "AMPUTATION",
    primaryEntityId: entity.id,
    secondaryEntityId: severedFood.id,
    location: { x: entity.x, y: entity.y },
    description: `${entity.properties.name || `Entidade #${entity.id}`} teve o membro '${partName}' amputado!`,
    tick: currentTick,
    timestamp: world?.clock ? { day: world.clock.day, hour: world.clock.hour, minute: world.clock.minute } : null,
    metadata: { part: propKey, dropX, dropY }
  });
}

/**
 * Helper to drop nutritional properties as food items on death
 */
export function explodeEntityOnDeath(entity, entitiesArray, world) {
  if (!entity || !entity.properties) return;

  const ex = entity.x || 0;
  const ey = entity.y || 0;
  const entityName = entity.properties.name || `Criatura #${entity.id}`;
  const species = entity.properties.species || "desconhecida";

  for (const [key, prop] of Object.entries(entity.properties)) {
    if (prop && prop.nutrition && prop.foodType) {
      let skin = "Item_Steak.png";
      let color = 0xffe65a5a;
      let name = `Carne de ${entityName} (${key})`;

      if (key.includes("wing")) {
        skin = "Item_Cloak.png";
        color = 0xffe6e6f0;
        name = `Asa (${key}) de ${entityName}`;
      } else if (key.includes("arm") || key.includes("paw")) {
        skin = "Creature_Hand_U.png";
        color = 0xffe65a5a;
        name = `Pata/Mão (${key}) de ${entityName}`;
      } else if (key.includes("leg")) {
        skin = "Item_Drumstick.png";
        color = 0xffe65a5a;
        name = `Coxa/Perna (${key}) de ${entityName}`;
      } else if (key.includes("eye")) {
        skin = "Item_Eyeball.png";
        color = 0xff58c8f8;
        name = `Olho (${key}) de ${entityName}`;
      } else if (prop.foodType === "meat") {
        skin = "Item_Steak.png";
        color = 0xffe65a5a;
        name = `Pedaço de Carne (${key}) de ${entityName}`;
      } else if (prop.foodType === "bone") {
        skin = "Item_Bone.png";
        color = 0xffe6e6d2;
        name = `Osso (${key}) de ${entityName}`;
      } else if (prop.foodType === "plant" || prop.foodType === "veg") {
        skin = "Item_Vegetable.png";
        color = 0xff78dc50;
        name = `Vegetal (${key}) de ${entityName}`;
      } else if (prop.foodType === "fruit") {
        skin = "Item_Fruit.png";
        color = 0xfffaa03c;
        name = `Fruto (${key}) de ${entityName}`;
      } else if (prop.foodType === "organ") {
        skin = "Other_Heart.png";
        color = 0xffc83232;
        name = `Víscera (${key}) de ${entityName}`;
      }

      const foodItem = createEntity(
        {
          name,
          render: { skin, color, backcolor: 0x00000000 },
          edible: {
            nutrition: prop.nutrition,
            foodType: prop.foodType,
            digestDuration: prop.digestDuration || 20,
            sourceEntityId: entity.id,
            sourceName: entityName,
            sourceSpecies: species,
            partKey: key
          }
        },
        ex + (Math.floor(Math.random() * 3) - 1),
        ey + (Math.floor(Math.random() * 3) - 1)
      );

      if (entitiesArray) {
        entitiesArray.push(foodItem);
      }
    }
  }

  // Check for severe physical wounds and amputations
  const severelyDamaged = Object.values(entity.properties).some(
    p => p && typeof p.condition === "number" && typeof p.maxCondition === "number" && (p.condition / p.maxCondition) <= 0.35
  );
  const hasAmputations = Object.keys(entity.properties).some(k => k.startsWith("amputated_"));

  // Check if attacked within the last 600 ticks (~60-120 seconds of simulation)
  const isRecentAttack = entity._lastAttacker && (currentTick - (entity._lastAttacker.tick || 0)) <= 600;

  if (isRecentAttack) {
    const killerId = entity._lastAttacker.id;
    const killerName = entity._lastAttacker.name || `Criatura #${killerId}`;
    let killDesc = "";

    if (severelyDamaged || hasAmputations) {
      killDesc = `${killerName} matou ${entityName} em decorrência de ferimentos graves e hemorragia na posição [X: ${ex}, Y: ${ey}]!`;
    } else {
      killDesc = `${killerName} assassinou ${entityName} em combate na posição [X: ${ex}, Y: ${ey}]!`;
    }

    recordWorldEvent({
      type: "KILL",
      primaryEntityId: killerId,
      secondaryEntityId: entity.id,
      location: { x: ex, y: ey },
      description: killDesc,
      tick: currentTick,
      timestamp: world?.clock ? { day: world.clock.day, hour: world.clock.hour, minute: world.clock.minute } : null,
      metadata: { killerId, killerName, victimName: entityName, species, reason: severelyDamaged || hasAmputations ? "wounds" : "combat" }
    });

    // Notify killer's brain long term memory and victim's clan/friends
    if (entitiesArray) {
      const killerEnt = entitiesArray.find(e => e.id === killerId && !e.destroyed);
      const timeStr = world?.clock ? `Dia ${world.clock.day} às ${String(world.clock.hour).padStart(2,"0")}:${String(world.clock.minute).padStart(2,"0")}` : `Tick ${currentTick}`;

      if (killerEnt && killerEnt.properties.brain) {
        if (!killerEnt.properties.brain.longTermMemory) killerEnt.properties.brain.longTermMemory = [];
        killerEnt.properties.brain.longTermMemory.push({
          id: currentTick,
          tick: currentTick,
          type: "KILL",
          killerName,
          victimName: entityName,
          location: { x: ex, y: ey },
          desc: `Assassinei ${entityName} em combate na posição [${ex},${ey}] no ${timeStr}`,
          emotion: killerEnt.properties.violent ? 50 : -35
        });
      }

      // Clan and friends of victim remember the tragedy and set hatred for killer
      for (const friend of entitiesArray) {
        if (friend.destroyed || !friend.properties.brain) continue;
        const isClan = entity.properties.group && friend.properties.group === entity.properties.group;
        const isFriend = (friend.properties.brain.affinities?.[entity.id] || 0) >= 30;

        if (isClan || isFriend) {
          if (!friend.properties.brain.affinities) friend.properties.brain.affinities = {};
          friend.properties.brain.affinities[killerId] = -100;

          if (!friend.properties.brain.longTermMemory) friend.properties.brain.longTermMemory = [];
          friend.properties.brain.longTermMemory.push({
            id: currentTick,
            tick: currentTick,
            type: "KILL_WITNESS",
            killerName,
            victimName: entityName,
            location: { x: ex, y: ey },
            desc: `${killerName} assassinou brutalmente ${entityName} em [${ex},${ey}] no ${timeStr}`,
            emotion: -80
          });
        }
      }
    }
  } else {
    // Natural / Exhaustion / Untended Wound Death
    let deathDesc = "";
    if (severelyDamaged || hasAmputations) {
      deathDesc = `${entityName} sucumbiu e morreu em decorrência de ferimentos graves e hemorragia na posição [X: ${ex}, Y: ${ey}]!`;
    } else {
      deathDesc = `${entityName} morreu por exaustão de energia vital e inanição na posição [X: ${ex}, Y: ${ey}]!`;
    }

    recordWorldEvent({
      type: "DEATH",
      primaryEntityId: entity.id,
      location: { x: ex, y: ey },
      description: deathDesc,
      tick: currentTick,
      timestamp: world?.clock ? { day: world.clock.day, hour: world.clock.hour, minute: world.clock.minute } : null,
      metadata: { name: entityName, species, reason: severelyDamaged || hasAmputations ? "wounds" : "starvation" }
    });
  }
}

/**
 * Flat simulation tick over all active entities
 */
export function tickEntities(entities, dt, world) {
  for (let i = entities.length - 1; i >= 0; i--) {
    const entity = entities[i];
    if (entity.destroyed) {
      entities.splice(i, 1);
      // Retain in entityRegistry permanently!
      continue;
    }

    // 1. Run effects for all properties in the entity's property bag
    for (const [key, prop] of Object.entries(entity.properties)) {
      if (!prop) continue;

      if (typeof prop.effect === "function") {
        if (prop.rate !== undefined && prop.rate > 0) {
          prop._timer = (prop._timer || 0) + dt;
          while (prop._timer >= prop.rate) {
            prop._timer -= prop.rate;
            prop.effect(entity, prop.rate, world, entities, prop);
          }
        } else {
          prop.effect(entity, dt, world, entities, prop);
        }
      }
    }

    // 2. Check for limb condition degradation & automatic amputation (condition <= 0)
    for (const [key, prop] of Object.entries(entity.properties)) {
      if (
        prop &&
        typeof prop.condition === "number" &&
        typeof prop.maxCondition === "number" &&
        !key.startsWith("amputated_")
      ) {
        if (prop.condition <= 0) {
          amputateLimb(entity, key, prop, entities, world);
        }
      }
    }

    // 3. Check life energy (death condition)
    let isDead = false;
    if (entity.properties.life && entity.properties.life.energy <= 0) {
      isDead = true;
    } else if (entity.properties.health && entity.properties.health.current <= 0) {
      isDead = true;
    }

    if (isDead) {
      entity.destroyed = true;
      entity.deathTick = currentTick;
      explodeEntityOnDeath(entity, entities, world);
      entities.splice(i, 1);
      // Retain in entityRegistry permanently!
    }
  }
}

const skinCache = new Map();
function getSkinBytes(skinStr) {
  let cached = skinCache.get(skinStr);
  if (!cached) {
    cached = encoder.encode(skinStr);
    skinCache.set(skinStr, cached);
  }
  return cached;
}

export function resolveWallSkin(x, y, wallCoords) {
  const hasN = wallCoords.has(`${x},${y - 1}`);
  const hasS = wallCoords.has(`${x},${y + 1}`);
  const hasE = wallCoords.has(`${x + 1},${y}`);
  const hasW = wallCoords.has(`${x - 1},${y}`);

  // 4 directions (crossroads)
  if (hasN && hasE && hasS && hasW) return "Wall_NESW.png";

  // 3 directions (T-junctions)
  if (hasN && hasE && hasS) return "Wall_NES.png";
  if (hasN && hasS && hasW) return "Wall_NSW.png";
  if (hasN && hasE && hasW) return "Wall_NEW.png";
  if (hasE && hasS && hasW) return "Wall_ESW.png";

  // 2 directions (bends & straights)
  if (hasN && hasS) return "Wall_NS.png";
  if (hasE && hasW) return "Wall_EW.png";
  if (hasN && hasE) return "Wall_NE.png";
  if (hasN && hasW) return "Wall_NW.png";
  if (hasE && hasS) return "Wall_ES.png";
  if (hasS && hasW) return "Wall_SW.png";

  // 1 direction (end-caps)
  if (hasN || hasS) return "Wall_NS.png";
  if (hasE || hasW) return "Wall_EW.png";

  // 0 directions (isolated wall)
  return "Wall_NESW.png";
}

/**
 * Directly syncs renderable entities into WASM shared memory
 */
export function syncRenderToWasm(entities, wasmMemory, wasmExports) {
  const entitiesPtr = wasmExports.wasm_get_entities_ptr();
  const maxEntities = wasmExports.wasm_get_max_entities();

  const memBuf = wasmMemory.buffer;
  const view = new DataView(memBuf);
  const u8 = new Uint8Array(memBuf);

  // Pre-calculate wall coordinates for dynamic autotiling
  const wallCoords = new Set();
  for (let i = 0; i < entities.length; i++) {
    const e = entities[i];
    if (!e.destroyed && (e.properties?.structure || e.properties?.render?.skin?.startsWith("Wall_") || e.properties?.name?.includes("Muralha") || e.properties?.name?.includes("Wall"))) {
      wallCoords.add(`${e.x},${e.y}`);
    }
  }

  const STRUCT_SIZE = 108;
  let renderIdx = 0;

  for (let i = 0; i < entities.length; i++) {
    const e = entities[i];
    if (e.destroyed || !e.properties || !e.properties.render) continue;
    if (renderIdx >= maxEntities) break;

    const r = e.properties.render;
    const offset = entitiesPtr + renderIdx * STRUCT_SIZE;

    view.setInt32(offset + 0, 1, true); // active
    view.setInt32(offset + 4, e.id, true);
    view.setInt32(offset + 8, e.x || 0, true);
    view.setInt32(offset + 12, e.y || 0, true);
    view.setInt32(offset + 16, e.motor || 0, true);
    view.setUint32(offset + 20, r.color !== undefined ? r.color : 0xffffffff, true);
    view.setUint32(offset + 24, r.backcolor !== undefined ? r.backcolor : 0x00000000, true);

    // Energy / Health bar preview
    if (e.properties.life) {
      view.setFloat32(offset + 28, Math.max(0, e.properties.life.energy), true);
      view.setFloat32(offset + 32, e.properties.life.max || 100, true);
    } else if (e.properties.health) {
      view.setFloat32(offset + 28, Math.max(0, e.properties.health.current), true);
      view.setFloat32(offset + 32, e.properties.health.max || 100, true);
    } else {
      view.setFloat32(offset + 28, 0, true);
      view.setFloat32(offset + 32, 0, true);
    }

    view.setInt32(offset + 36, e.emote !== undefined ? e.emote : -1, true);
    view.setInt32(offset + 40, e.combatFlash > 0 ? 1 : 0, true);

    let skinStr = r.skin || "Human_Knight_M.png";
    if (e.properties.structure || skinStr.startsWith("Wall_") || e.properties.name?.includes("Muralha") || e.properties.name?.includes("Wall")) {
      skinStr = resolveWallSkin(e.x, e.y, wallCoords);
      r.skin = skinStr;
    }

    const skinBytes = getSkinBytes(skinStr);
    const skinOffset = offset + 44;
    const copyLen = Math.min(63, skinBytes.length);
    u8.set(skinBytes.subarray(0, copyLen), skinOffset);
    u8[skinOffset + copyLen] = 0;

    renderIdx++;
  }

  // Clear remaining slots in WASM buffer
  for (let i = renderIdx; i < maxEntities; i++) {
    const offset = entitiesPtr + i * STRUCT_SIZE;
    view.setInt32(offset + 0, 0, true); // inactive
  }
}
