// =============================================================================
// Brutopolis - Flat Property Bag Engine (Zero Nesting)
// =============================================================================

import { recordWorldEvent, OP_DEATH } from "./event_log.js";

let nextEntityId = 1;

// Global simulation tick counter
export let currentTick = 0;

// Current active World instance reference for global time queries
export let currentWorld = null;
export function setCurrentWorld(w) {
  currentWorld = w;
}

// Central O(1) registry for all entities in the universe (living and deceased)
export const entityRegistry = new Map();

// Global persistent wall coordinates for zero-GC autotiling
export const globalWallCoords = new Set();

// Spatial Hash Grid partitioning for ultra-fast O(1) zone and radius queries
export const spatialGrid = new Map(); // zoneKey ("zx_zy") -> Set<Entity>
export const tileEntityMap = new Map(); // tileKey ("x_y") -> Set<Entity>
let activeZoneSize = 8;

export function setSpatialZoneSize(sz) {
  if (sz > 0) activeZoneSize = sz;
}

export function getSpatialZoneSize() {
  return activeZoneSize;
}

export function getSpatialZoneKey(x, y, zoneSize = activeZoneSize) {
  const zx = Math.floor(x / zoneSize);
  const zy = Math.floor(y / zoneSize);
  return `${zx}_${zy}`;
}

export function registerEntitySpatial(entity, zoneSize = activeZoneSize) {
  if (!entity || entity.destroyed) return;
  const zk = getSpatialZoneKey(entity.x, entity.y, zoneSize);
  let bucket = spatialGrid.get(zk);
  if (!bucket) {
    bucket = new Set();
    spatialGrid.set(zk, bucket);
  }
  bucket.add(entity);
  entity._lastSpatialZone = zk;
  entity._lastSpatialX = entity.x;
  entity._lastSpatialY = entity.y;

  const tk = `${entity.x}_${entity.y}`;
  let tileBucket = tileEntityMap.get(tk);
  if (!tileBucket) {
    tileBucket = new Set();
    tileEntityMap.set(tk, tileBucket);
  }
  tileBucket.add(entity);

  const isWall = (entity.properties?.render?.skin?.startsWith("Wall_") || entity.properties?.name?.includes("Muralha") || entity.properties?.name?.includes("Wall") || (entity.properties?.structure && !entity.properties?.door && !entity.properties?.house));
  if (isWall) {
    globalWallCoords.add(`${entity.x},${entity.y}`);
  }
}

export function unregisterEntitySpatial(entity, zoneSize = activeZoneSize) {
  if (!entity) return;
  const zk = entity._lastSpatialZone || getSpatialZoneKey(entity.x, entity.y, zoneSize);
  const bucket = spatialGrid.get(zk);
  if (bucket) {
    bucket.delete(entity);
    if (bucket.size === 0) spatialGrid.delete(zk);
  }

  const lastX = entity._lastSpatialX !== undefined ? entity._lastSpatialX : entity.x;
  const lastY = entity._lastSpatialY !== undefined ? entity._lastSpatialY : entity.y;
  const tk = `${lastX}_${lastY}`;
  const tileBucket = tileEntityMap.get(tk);
  if (tileBucket) {
    tileBucket.delete(entity);
    if (tileBucket.size === 0) tileEntityMap.delete(tk);
  }

  const isWall = (entity.properties?.render?.skin?.startsWith("Wall_") || entity.properties?.name?.includes("Muralha") || entity.properties?.name?.includes("Wall") || (entity.properties?.structure && !entity.properties?.door && !entity.properties?.house));
  if (isWall) {
    globalWallCoords.delete(`${lastX},${lastY}`);
  }
}

export function updateEntitySpatial(entity, zoneSize = activeZoneSize) {
  if (!entity || entity.destroyed) return;
  if (entity.x === entity._lastSpatialX && entity.y === entity._lastSpatialY) return;

  // Tile map update
  if (entity._lastSpatialX !== undefined && entity._lastSpatialY !== undefined) {
    const oldTk = `${entity._lastSpatialX}_${entity._lastSpatialY}`;
    const oldTileBucket = tileEntityMap.get(oldTk);
    if (oldTileBucket) {
      oldTileBucket.delete(entity);
      if (oldTileBucket.size === 0) tileEntityMap.delete(oldTk);
    }
  }
  const newTk = `${entity.x}_${entity.y}`;
  let newTileBucket = tileEntityMap.get(newTk);
  if (!newTileBucket) {
    newTileBucket = new Set();
    tileEntityMap.set(newTk, newTileBucket);
  }
  newTileBucket.add(entity);

  // Zone bucket update
  const newZk = getSpatialZoneKey(entity.x, entity.y, zoneSize);
  if (newZk !== entity._lastSpatialZone) {
    if (entity._lastSpatialZone) {
      const oldBucket = spatialGrid.get(entity._lastSpatialZone);
      if (oldBucket) {
        oldBucket.delete(entity);
        if (oldBucket.size === 0) spatialGrid.delete(entity._lastSpatialZone);
      }
    }
    let newBucket = spatialGrid.get(newZk);
    if (!newBucket) {
      newBucket = new Set();
      spatialGrid.set(newZk, newBucket);
    }
    newBucket.add(entity);
    entity._lastSpatialZone = newZk;
  }

  entity._lastSpatialX = entity.x;
  entity._lastSpatialY = entity.y;
}

export function getEntitiesInRadius(centerX, centerY, radiusTiles, zoneSize = activeZoneSize) {
  const minZx = Math.floor((centerX - radiusTiles) / zoneSize);
  const maxZx = Math.floor((centerX + radiusTiles) / zoneSize);
  const minZy = Math.floor((centerY - radiusTiles) / zoneSize);
  const maxZy = Math.floor((centerY + radiusTiles) / zoneSize);

  const results = [];
  const rSq = radiusTiles * radiusTiles;

  for (let zy = minZy; zy <= maxZy; zy++) {
    for (let zx = minZx; zx <= maxZx; zx++) {
      const zk = `${zx}_${zy}`;
      const bucket = spatialGrid.get(zk);
      if (bucket) {
        for (const ent of bucket) {
          if (!ent.destroyed) {
            const dx = ent.x - centerX;
            const dy = ent.y - centerY;
            if (dx * dx + dy * dy <= rSq) {
              results.push(ent);
            }
          }
        }
      }
    }
  }
  return results;
}

export function getEntitiesInViewport(minX, maxX, minY, maxY, zoneSize = activeZoneSize) {
  const minZx = Math.floor(minX / zoneSize);
  const maxZx = Math.floor(maxX / zoneSize);
  const minZy = Math.floor(minY / zoneSize);
  const maxZy = Math.floor(maxY / zoneSize);

  const results = [];
  for (let zy = minZy; zy <= maxZy; zy++) {
    for (let zx = minZx; zx <= maxZx; zx++) {
      const zk = `${zx}_${zy}`;
      const bucket = spatialGrid.get(zk);
      if (bucket) {
        for (const ent of bucket) {
          if (!ent.destroyed && ent.x >= minX && ent.x <= maxX && ent.y >= minY && ent.y <= maxY) {
            results.push(ent);
          }
        }
      }
    }
  }
  return results;
}

export function getEntityAtTile(x, y) {
  const tk = `${x}_${y}`;
  const bucket = tileEntityMap.get(tk);
  if (!bucket || bucket.size === 0) return null;
  for (const ent of bucket) {
    if (!ent.destroyed) return ent;
  }
  return null;
}

export function rebuildSpatialGrid(entities, zoneSize = activeZoneSize) {
  spatialGrid.clear();
  tileEntityMap.clear();
  globalWallCoords.clear();
  activeZoneSize = zoneSize;
  for (let i = 0; i < entities.length; i++) {
    const e = entities[i];
    if (!e.destroyed) {
      registerEntitySpatial(e, zoneSize);
    }
  }
}

export function resetEngineTicks() {
  currentTick = 0;
  nextEntityId = 1;
  entityRegistry.clear();
  spatialGrid.clear();
  tileEntityMap.clear();
  globalWallCoords.clear();
}

export function incrementEngineTick() {
  currentTick++;
}

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
  registerEntitySpatial(entity);
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
  unregisterEntitySpatial(entity);

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
      name: `Severed ${partName} of ${entity.properties.name || "Creature"}`,
      species: "item",
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
    description: `${entity.properties.name || `Entity #${entity.id}`} had their '${partName}' severed!`,
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
  const entityName = entity.properties.name || `Creature #${entity.id}`;
  const species = entity.properties.species || "unknown";

  for (const [key, prop] of Object.entries(entity.properties)) {
    if (prop && prop.nutrition && prop.foodType) {
      let skin = "Item_Steak.png";
      let color = 0xffe65a5a;
      let name = `Meat of ${entityName} (${key})`;

      if (key.includes("wing")) {
        skin = "Item_Cloak.png";
        color = 0xffe6e6f0;
        name = `Wing (${key}) of ${entityName}`;
      } else if (key.includes("arm") || key.includes("paw")) {
        skin = "Creature_Hand_U.png";
        color = 0xffe65a5a;
        name = `Paw/Hand (${key}) of ${entityName}`;
      } else if (key.includes("leg")) {
        skin = "Item_Drumstick.png";
        color = 0xffe65a5a;
        name = `Leg/Limb (${key}) of ${entityName}`;
      } else if (key.includes("eye")) {
        skin = "Item_Eyeball.png";
        color = 0xff58c8f8;
        name = `Eye (${key}) of ${entityName}`;
      } else if (prop.foodType === "meat") {
        skin = "Item_Steak.png";
        color = 0xffe65a5a;
        name = `Meat Chunk (${key}) of ${entityName}`;
      } else if (prop.foodType === "bone") {
        skin = "Item_Bone.png";
        color = 0xffe6e6d2;
        name = `Bone (${key}) of ${entityName}`;
      } else if (prop.foodType === "plant" || prop.foodType === "veg") {
        skin = "Item_Vegetable.png";
        color = 0xff78dc50;
        name = `Vegetable (${key}) of ${entityName}`;
      } else if (prop.foodType === "fruit") {
        skin = "Item_Fruit.png";
        color = 0xfffaa03c;
        name = `Fruit (${key}) of ${entityName}`;
      } else if (prop.foodType === "organ") {
        skin = "Other_Heart.png";
        color = 0xffc83232;
        name = `Viscera (${key}) of ${entityName}`;
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

  // Drop remaining body fat reserve units as animal fat items
  const fatUnits = entity.properties.stomach?.fatUnits || 0;
  for (let f = 0; f < fatUnits; f++) {
    const fatItem = createEntity(
      {
        name: `Animal Fat / Blubber of ${entityName}`,
        render: { skin: "Item_Nugget.png", color: 0xfff0e6aa, backcolor: 0x00000000 },
        edible: {
          nutrition: 750,
          foodType: "meat",
          digestDuration: 30,
          sourceEntityId: entity.id,
          sourceName: entityName,
          sourceSpecies: species,
          partKey: "fat_unit"
        },
        lifespan: { age: 0, maxAge: 1800.0 }
      },
      ex + (Math.floor(Math.random() * 3) - 1),
      ey + (Math.floor(Math.random() * 3) - 1)
    );
    if (entitiesArray) entitiesArray.push(fatItem);
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
    const killerName = entity._lastAttacker.name || `Creature #${killerId}`;
    let killDesc = "";

    if (severelyDamaged || hasAmputations) {
      killDesc = `${killerName} killed ${entityName} as a result of severe wounds and blood loss at [X: ${ex}, Y: ${ey}]!`;
    } else {
      killDesc = `${killerName} slain ${entityName} in combat at [X: ${ex}, Y: ${ey}]!`;
    }

    recordWorldEvent({
      opcode: OP_DEATH,
      type: "DEATH",
      primaryEntityId: entity.id,
      secondaryEntityId: killerId,
      location: { x: ex, y: ey },
      description: killDesc,
      tick: currentTick,
      timestamp: world?.clock ? { day: world.clock.day, hour: world.clock.hour, minute: world.clock.minute } : null,
      metadata: { killerId, killerName, victimName: entityName, species, reason: severelyDamaged || hasAmputations ? "wounds" : "combat" }
    });

    // Notify killer's brain long term memory and victim's clan/friends
    if (entitiesArray) {
      const killerEnt = entitiesArray.find(e => e.id === killerId && !e.destroyed);
      const timeStr = world?.clock ? `Day ${world.clock.day} at ${String(world.clock.hour).padStart(2,"0")}:${String(world.clock.minute).padStart(2,"0")}` : `Tick ${currentTick}`;

      if (killerEnt && killerEnt.properties.brain) {
        if (!killerEnt.properties.brain.longTermMemory) killerEnt.properties.brain.longTermMemory = [];
        killerEnt.properties.brain.longTermMemory.push({
          id: currentTick,
          tick: currentTick,
          type: "KILL",
          killerName,
          victimName: entityName,
          location: { x: ex, y: ey },
          desc: `Slain ${entityName} in combat at [${ex},${ey}] on ${timeStr}`,
          emotion: killerEnt.properties.violent ? 50 : -35
        });
      }

      // Witnessing tragedy: only notify nearby entities within spatial perception radius (24 tiles) in O(1)
      const nearbyWitnesses = getEntitiesInRadius(ex, ey, 24);
      for (const friend of nearbyWitnesses) {
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
            desc: `${killerName} brutally murdered ${entityName} at [${ex},${ey}] on ${timeStr}`,
            emotion: -80
          });
        }
      }
    }
  } else {
    // Natural / Exhaustion / Untended Wound Death
    let deathDesc = "";
    if (severelyDamaged || hasAmputations) {
      deathDesc = `${entityName} succumbed and died from untended wounds and blood loss at [X: ${ex}, Y: ${ey}]!`;
    } else {
      deathDesc = `${entityName} died from vital energy exhaustion and starvation at [X: ${ex}, Y: ${ey}]!`;
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
  if (world) currentWorld = world;
  for (let i = entities.length - 1; i >= 0; i--) {
    const entity = entities[i];
    if (entity.destroyed) {
      entities.splice(i, 1);
      unregisterEntitySpatial(entity);
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

    // Synchronize spatial hash grid if entity coordinates changed
    updateEntitySpatial(entity);

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
      unregisterEntitySpatial(entity);
    }
  }
}

export function resolveWallSkin(x, y, wallCoords = globalWallCoords) {
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

