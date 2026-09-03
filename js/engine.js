// =============================================================================
// Brutopolis - Flat Property Bag Engine (Zero Nesting)
// =============================================================================

import { recordWorldEvent, OP_DEATH } from "./event_log.js";
import { updatePolitics } from "./politics.js";

let nextEntityId = 1;

// Global simulation tick counter
export let currentTick = 0;

export let currentWorld = null;
export function setCurrentWorld(w) {
  currentWorld = w;
}
export function getCurrentWorld() {
  return currentWorld;
}

// Central O(1) registry for all entities in the universe (living and deceased)
export const entityRegistry = new Map();

// Global persistent wall coordinates for zero-GC autotiling
export const globalWallCoords = new Set();

// Global persistent road coordinates for instant O(1) road tile lookup
export const globalRoadCoords = new Set();

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
  return ((zx & 0xFFFF) << 16) | (zy & 0xFFFF);
}

export function getTileKey(x, y) {
  return ((Math.floor(x) & 0xFFFF) << 16) | (Math.floor(y) & 0xFFFF);
}

export function getEntityFootprint(ent) {
  if (!ent || !ent.properties) return { w: 1, h: 1, isPassable: true };
  const p = ent.properties;

  // Door is passable if open or owned
  if (p.door) return { w: 1, h: 1, isPassable: true };

  // Roads, torches, campfires, items, plants, creatures are passable
  if (p.road || p.torch || p.campfire || p.germination || p.photosynthesis || p.deep_root || p.life || p.species === "item" || p.species === "corpse") {
    return { w: 1, h: 1, isPassable: true };
  }

  // Houses
  if (p.house) {
    const isSuspended = p.house.houseVariant === 6 || p.house.style === "mountain_stilt" || (p.house.yard && p.house.yard.type === "Suspended Stilt House");
    const w = p.house.footprintW || (p.house.footprint ? Number(p.house.footprint.split("x")[0]) : 1) || 1;
    const h = p.house.footprintH || (p.house.footprint ? Number(p.house.footprint.split("x")[1]) : 1) || 1;
    return { w, h, isPassable: isSuspended };
  }

  // Chieftain / Leader Palace (3x3)
  if (p.leaderHouse) {
    return { w: 3, h: 3, isPassable: false };
  }

  // Clan production & storage buildings (2x2)
  if (p.warehouse || p.slaughterhouse || p.kitchen || p.artisan_hut) {
    return { w: 2, h: 2, isPassable: false };
  }

  // Water Well (1x1 solid obstacle)
  if (p.well) {
    return { w: 1, h: 1, isPassable: false };
  }

  // Stone Walls / Palisades / Fortifications
  const isWall = p.render?.skin?.startsWith("Wall_") || p.name?.includes("Muralha") || p.name?.includes("Wall") || (p.structure && !p.resourceType && !p.edible);
  if (isWall) {
    return { w: 1, h: 1, isPassable: false };
  }

  // Default blocking flag
  if (p.blocking) {
    return { w: 1, h: 1, isPassable: false };
  }

  return { w: 1, h: 1, isPassable: true };
}

export function isBuildingObstacleAt(x, y, forEntity = null) {
  const tk = getTileKey(x, y);
  const bucket = tileEntityMap.get(tk);
  if (!bucket || bucket.size === 0) return false;

  for (const ent of bucket) {
    if (ent.destroyed) continue;
    const p = ent.properties;
    if (!p) continue;

    // Doors can be passed if open or owned
    if (p.door) {
      if (p.door.isOpen) continue;
      if (!p.door.owners || p.door.owners.length === 0 || (forEntity && p.door.owners.includes(forEntity.id))) {
        continue;
      }
      return true; // Locked door
    }

    // Suspended stilt house over road: walkable
    if (p.house && (p.house.houseVariant === 6 || p.house.style === "mountain_stilt")) {
      continue;
    }

    // Resident entering or residing inside their own home to interact with personal belongings/sleep
    if (forEntity) {
      if (p.house && (p.house.ownerId === forEntity.id || p.house.partnerId === forEntity.id)) {
        if (forEntity.insideHouse || forEntity._enteringHome || forEntity.properties?.life?.isSleeping || forEntity.properties?.life?.insideHouse) {
          continue; // Allow resident into their own house
        }
      }
      if (p.leaderHouse && (p.leaderHouse.leaderId === forEntity.id || p.leaderHouse.partnerId === forEntity.id)) {
        if (forEntity.insideHouse || forEntity._enteringHome || forEntity.properties?.life?.isSleeping || forEntity.properties?.life?.insideHouse) {
          continue; // Allow leader into chieftain palace
        }
      }
    }

    // Solid buildings and structures
    if (
      p.house ||
      p.leaderHouse ||
      p.warehouse ||
      p.slaughterhouse ||
      p.kitchen ||
      p.artisan_hut ||
      p.well ||
      p.blocking ||
      (p.structure && (p.render?.skin?.startsWith("Wall_") || p.name?.includes("Muralha") || p.name?.includes("Wall") || (!p.road && !p.campfire && !p.torch && !p.resourceType && !p.edible)))
    ) {
      return true;
    }
  }
  return false;
}

export function registerEntitySpatial(entity, zoneSize = activeZoneSize) {
  if (!entity || entity.destroyed) return;
  const { w, h, isPassable } = getEntityFootprint(entity);

  entity._lastSpatialFootprintW = w;
  entity._lastSpatialFootprintH = h;
  entity._lastSpatialX = entity.x;
  entity._lastSpatialY = entity.y;

  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const tx = Math.floor(entity.x + dx);
      const ty = Math.floor(entity.y + dy);

      const zk = getSpatialZoneKey(tx, ty, zoneSize);
      let bucket = spatialGrid.get(zk);
      if (!bucket) {
        bucket = new Set();
        spatialGrid.set(zk, bucket);
      }
      bucket.add(entity);

      const tk = getTileKey(tx, ty);
      let tileBucket = tileEntityMap.get(tk);
      if (!tileBucket) {
        tileBucket = new Set();
        tileEntityMap.set(tk, tileBucket);
      }
      tileBucket.add(entity);

      if (!isPassable) {
        globalWallCoords.add(tk);
      }
    }
  }

  if (entity.properties?.road) {
    globalRoadCoords.add(getTileKey(entity.x, entity.y));
  }
}

export function unregisterEntitySpatial(entity, zoneSize = activeZoneSize) {
  if (!entity) return;
  const lastX = entity._lastSpatialX !== undefined ? entity._lastSpatialX : entity.x;
  const lastY = entity._lastSpatialY !== undefined ? entity._lastSpatialY : entity.y;
  const w = entity._lastSpatialFootprintW || 1;
  const h = entity._lastSpatialFootprintH || 1;

  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const tx = Math.floor(lastX + dx);
      const ty = Math.floor(lastY + dy);

      const zk = getSpatialZoneKey(tx, ty, zoneSize);
      const bucket = spatialGrid.get(zk);
      if (bucket) {
        bucket.delete(entity);
        if (bucket.size === 0) spatialGrid.delete(zk);
      }

      const tk = getTileKey(tx, ty);
      const tileBucket = tileEntityMap.get(tk);
      if (tileBucket) {
        tileBucket.delete(entity);
        if (tileBucket.size === 0) tileEntityMap.delete(tk);
      }

      globalWallCoords.delete(tk);
    }
  }

  if (entity.properties?.road) {
    globalRoadCoords.delete(getTileKey(lastX, lastY));
  }
}

export function updateEntitySpatial(entity, zoneSize = activeZoneSize) {
  if (!entity || entity.destroyed) return;
  const curTileX = Math.floor(entity.x);
  const curTileY = Math.floor(entity.y);
  const lastTileX = entity._lastSpatialTileX;
  const lastTileY = entity._lastSpatialTileY;

  if (curTileX === lastTileX && curTileY === lastTileY) return;

  // Tile map update
  if (lastTileX !== undefined && lastTileY !== undefined) {
    const oldTk = ((lastTileX & 0xFFFF) << 16) | (lastTileY & 0xFFFF);
    const oldTileBucket = tileEntityMap.get(oldTk);
    if (oldTileBucket) {
      oldTileBucket.delete(entity);
      if (oldTileBucket.size === 0) tileEntityMap.delete(oldTk);
    }
  }
  const newTk = ((curTileX & 0xFFFF) << 16) | (curTileY & 0xFFFF);
  let newTileBucket = tileEntityMap.get(newTk);
  if (!newTileBucket) {
    newTileBucket = new Set();
    tileEntityMap.set(newTk, newTileBucket);
  }
  newTileBucket.add(entity);

  entity._lastSpatialTileX = curTileX;
  entity._lastSpatialTileY = curTileY;

  // Zone bucket update
  const newZk = getSpatialZoneKey(entity.x, entity.y, zoneSize);
  if (newZk !== entity._lastSpatialZone) {
    if (entity._lastSpatialZone !== undefined) {
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
  if (radiusTiles === 0) {
    const tk = getTileKey(centerX, centerY);
    const bucket = tileEntityMap.get(tk);
    if (!bucket) return [];
    const res = [];
    for (const ent of bucket) {
      if (!ent.destroyed) res.push(ent);
    }
    return res;
  }

  // Fast direct tile lookup for small radii (95% of AI checks)
  if (radiusTiles === 1) {
    const results = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const tk = getTileKey(centerX + dx, centerY + dy);
        const bucket = tileEntityMap.get(tk);
        if (bucket) {
          for (const ent of bucket) {
            if (!ent.destroyed) results.push(ent);
          }
        }
      }
    }
    return results;
  }

  if (radiusTiles === 2) {
    const results = [];
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (dx * dx + dy * dy <= 4) {
          const tk = getTileKey(centerX + dx, centerY + dy);
          const bucket = tileEntityMap.get(tk);
          if (bucket) {
            for (const ent of bucket) {
              if (!ent.destroyed) results.push(ent);
            }
          }
        }
      }
    }
    return results;
  }

  const minZx = Math.floor((centerX - radiusTiles) / zoneSize);
  const maxZx = Math.floor((centerX + radiusTiles) / zoneSize);
  const minZy = Math.floor((centerY - radiusTiles) / zoneSize);
  const maxZy = Math.floor((centerY + radiusTiles) / zoneSize);

  const results = [];
  const rSq = radiusTiles * radiusTiles;

  for (let zy = minZy; zy <= maxZy; zy++) {
    const zyPart = (zy & 0xFFFF);
    for (let zx = minZx; zx <= maxZx; zx++) {
      const zk = ((zx & 0xFFFF) << 16) | zyPart;
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

export function findEntityInRadius(centerX, centerY, radiusTiles, predicate, zoneSize = activeZoneSize) {
  if (radiusTiles === 0) {
    const tk = getTileKey(centerX, centerY);
    const bucket = tileEntityMap.get(tk);
    if (!bucket) return null;
    for (const ent of bucket) {
      if (!ent.destroyed && (!predicate || predicate(ent))) return ent;
    }
    return null;
  }

  if (radiusTiles <= 2) {
    const rSq = radiusTiles * radiusTiles;
    for (let dy = -radiusTiles; dy <= radiusTiles; dy++) {
      for (let dx = -radiusTiles; dx <= radiusTiles; dx++) {
        if (dx * dx + dy * dy <= rSq) {
          const tk = getTileKey(centerX + dx, centerY + dy);
          const bucket = tileEntityMap.get(tk);
          if (bucket) {
            for (const ent of bucket) {
              if (!ent.destroyed && (!predicate || predicate(ent))) return ent;
            }
          }
        }
      }
    }
    return null;
  }

  const minZx = Math.floor((centerX - radiusTiles) / zoneSize);
  const maxZx = Math.floor((centerX + radiusTiles) / zoneSize);
  const minZy = Math.floor((centerY - radiusTiles) / zoneSize);
  const maxZy = Math.floor((centerY + radiusTiles) / zoneSize);
  const rSq = radiusTiles * radiusTiles;

  for (let zy = minZy; zy <= maxZy; zy++) {
    const zyPart = (zy & 0xFFFF);
    for (let zx = minZx; zx <= maxZx; zx++) {
      const zk = ((zx & 0xFFFF) << 16) | zyPart;
      const bucket = spatialGrid.get(zk);
      if (bucket) {
        for (const ent of bucket) {
          if (!ent.destroyed) {
            const dx = ent.x - centerX;
            const dy = ent.y - centerY;
            if (dx * dx + dy * dy <= rSq && (!predicate || predicate(ent))) {
              return ent;
            }
          }
        }
      }
    }
  }
  return null;
}

export function hasEntityInRadius(centerX, centerY, radiusTiles, predicate, zoneSize = activeZoneSize) {
  return findEntityInRadius(centerX, centerY, radiusTiles, predicate, zoneSize) !== null;
}

export function findClosestEntityInRadius(centerX, centerY, radiusTiles, predicate, zoneSize = activeZoneSize) {
  let closest = null;
  let minDistSq = (radiusTiles * radiusTiles) + 1;

  if (radiusTiles <= 2) {
    for (let dy = -radiusTiles; dy <= radiusTiles; dy++) {
      for (let dx = -radiusTiles; dx <= radiusTiles; dx++) {
        const dSq = dx * dx + dy * dy;
        if (dSq < minDistSq) {
          const tk = getTileKey(centerX + dx, centerY + dy);
          const bucket = tileEntityMap.get(tk);
          if (bucket) {
            for (const ent of bucket) {
              if (!ent.destroyed && (!predicate || predicate(ent))) {
                minDistSq = dSq;
                closest = ent;
              }
            }
          }
        }
      }
    }
    return closest;
  }

  const minZx = Math.floor((centerX - radiusTiles) / zoneSize);
  const maxZx = Math.floor((centerX + radiusTiles) / zoneSize);
  const minZy = Math.floor((centerY - radiusTiles) / zoneSize);
  const maxZy = Math.floor((centerY + radiusTiles) / zoneSize);

  for (let zy = minZy; zy <= maxZy; zy++) {
    const zyPart = (zy & 0xFFFF);
    for (let zx = minZx; zx <= maxZx; zx++) {
      const zk = ((zx & 0xFFFF) << 16) | zyPart;
      const bucket = spatialGrid.get(zk);
      if (bucket) {
        for (const ent of bucket) {
          if (!ent.destroyed) {
            const dx = ent.x - centerX;
            const dy = ent.y - centerY;
            const dSq = dx * dx + dy * dy;
            if (dSq < minDistSq && (!predicate || predicate(ent))) {
              minDistSq = dSq;
              closest = ent;
            }
          }
        }
      }
    }
  }
  return closest;
}

export function forEachEntityInRadius(centerX, centerY, radiusTiles, callback, zoneSize = activeZoneSize) {
  if (radiusTiles === 0) {
    const tk = getTileKey(centerX, centerY);
    const bucket = tileEntityMap.get(tk);
    if (!bucket) return;
    for (const ent of bucket) {
      if (!ent.destroyed) callback(ent);
    }
    return;
  }

  const rSq = radiusTiles * radiusTiles;
  if (radiusTiles <= 2) {
    for (let dy = -radiusTiles; dy <= radiusTiles; dy++) {
      for (let dx = -radiusTiles; dx <= radiusTiles; dx++) {
        if (dx * dx + dy * dy <= rSq) {
          const tk = getTileKey(centerX + dx, centerY + dy);
          const bucket = tileEntityMap.get(tk);
          if (bucket) {
            for (const ent of bucket) {
              if (!ent.destroyed) callback(ent);
            }
          }
        }
      }
    }
    return;
  }

  const minZx = Math.floor((centerX - radiusTiles) / zoneSize);
  const maxZx = Math.floor((centerX + radiusTiles) / zoneSize);
  const minZy = Math.floor((centerY - radiusTiles) / zoneSize);
  const maxZy = Math.floor((centerY + radiusTiles) / zoneSize);

  for (let zy = minZy; zy <= maxZy; zy++) {
    const zyPart = (zy & 0xFFFF);
    for (let zx = minZx; zx <= maxZx; zx++) {
      const zk = ((zx & 0xFFFF) << 16) | zyPart;
      const bucket = spatialGrid.get(zk);
      if (bucket) {
        for (const ent of bucket) {
          if (!ent.destroyed) {
            const dx = ent.x - centerX;
            const dy = ent.y - centerY;
            if (dx * dx + dy * dy <= rSq) {
              callback(ent);
            }
          }
        }
      }
    }
  }
}

export function countEntitiesInRadius(centerX, centerY, radiusTiles, predicate, zoneSize = activeZoneSize) {
  let count = 0;
  forEachEntityInRadius(centerX, centerY, radiusTiles, ent => {
    if (!predicate || predicate(ent)) count++;
  }, zoneSize);
  return count;
}

export function getEntitiesInViewport(minX, maxX, minY, maxY, zoneSize = activeZoneSize, outArray = null) {
  const minZx = Math.floor(minX / zoneSize);
  const maxZx = Math.floor(maxX / zoneSize);
  const minZy = Math.floor(minY / zoneSize);
  const maxZy = Math.floor(maxY / zoneSize);

  const results = outArray || [];
  if (outArray) results.length = 0;

  for (let zy = minZy; zy <= maxZy; zy++) {
    const zyPart = (zy & 0xFFFF);
    for (let zx = minZx; zx <= maxZx; zx++) {
      const zk = ((zx & 0xFFFF) << 16) | zyPart;
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
  const tk = getTileKey(x, y);
  const bucket = tileEntityMap.get(tk);
  if (!bucket || bucket.size === 0) return null;
  for (const ent of bucket) {
    if (!ent.destroyed && !(ent.properties && ent.properties.species === "effect")) return ent;
  }
  return null;
}

/**
 * Returns all non-destroyed entities at tile (x, y) using the O(1) spatial hash map.
 */
export function getEntitiesAtTile(x, y) {
  const tk = getTileKey(x, y);
  const bucket = tileEntityMap.get(tk);
  if (!bucket || bucket.size === 0) return [];
  const result = [];
  for (const ent of bucket) {
    if (!ent.destroyed) result.push(ent);
  }
  return result;
}

/**
 * Finds a specific entity at tile (x, y) that has a given property key (O(1) spatial lookup).
 * Replaces slow `entities.find(e => !e.destroyed && e.properties[propKey] && e.x === x && e.y === y)` patterns.
 */
export function getEntityAtTileByProp(x, y, propKey) {
  const tk = getTileKey(x, y);
  const bucket = tileEntityMap.get(tk);
  if (!bucket || bucket.size === 0) return null;
  for (const ent of bucket) {
    if (!ent.destroyed && ent.properties && ent.properties[propKey]) return ent;
  }
  return null;
}

export function rebuildSpatialGrid(entities, zoneSize = activeZoneSize) {
  spatialGrid.clear();
  tileEntityMap.clear();
  globalWallCoords.clear();
  globalRoadCoords.clear();
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
  globalRoadCoords.clear();
}

export function incrementEngineTick() {
  currentTick++;
}

export function setEngineTick(t) {
  currentTick = t;
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
  if (propKey === "brain" || propKey.includes("brain") || prop?.cannotAmputate || prop?.isBrain) return;

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
    skin = "Item_Steak.png";
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
 * Creates an intact whole Corpse on creature death that can be butchered/dismembered for meat & bones
 */
export function createCorpseEntity(entity, x = entity.x, y = entity.y) {
  const entityName = entity.properties?.name || `Creature #${entity.id}`;
  const species = entity.properties?.species || "creature";
  const isHuman = species === "human";

  let totalMeatCuts = 4;
  let totalBones = 2;
  if (species === "boar" || species === "bear" || species === "wolf") {
    totalMeatCuts = 6;
    totalBones = 3;
  } else if (species === "chicken" || species === "rabbit") {
    totalMeatCuts = 2;
    totalBones = 1;
  }

  const corpse = createEntity(
    {
      name: `Corpo de ${entityName}`,
      species: "corpse",
      render: {
        skin: isHuman ? "Other_Grave.png" : "Item_Skull.png",
        color: isHuman ? 0xffc8c8c8 : 0xffe6e6d2,
        backcolor: 0x00000000
      },
      corpse: {
        sourceEntityId: entity.id,
        sourceName: entityName,
        species: species,
        isHuman: isHuman,
        remainingMeatCuts: totalMeatCuts,
        remainingBones: totalBones,
        nutritionPerCut: isHuman ? 1800 : 2200
      },
      edible: {
        nutrition: totalMeatCuts * 1800,
        foodType: "meat",
        digestDuration: 35,
        sourceName: entityName
      },
      lifespan: {
        age: 0,
        maxAge: 300.0,
        effect(ent, dt) {
          this.age = (this.age || 0) + (dt !== undefined ? dt : 1.0);
          if (this.age >= this.maxAge) {
            ent.destroyed = true;
          }
        }
      }
    },
    x,
    y
  );

  return corpse;
}

/**
 * Dismembers / carves a piece of meat or bone from an intact corpse.
 * Yields a fresh food item and reduces remaining meat cuts on the corpse.
 */
export function dismemberCorpse(creature, corpseEntity) {
  if (!corpseEntity || !corpseEntity.properties?.corpse) return null;
  const cData = corpseEntity.properties.corpse;

  if (cData.remainingMeatCuts > 0) {
    cData.remainingMeatCuts--;
    const cutName = `Carne de ${cData.sourceName}`;
    const meatCut = {
      name: cutName,
      resourceType: "meat",
      nutrition: cData.nutritionPerCut || 1800,
      foodType: "meat",
      digestDuration: 30,
      weight: 1
    };

    if (cData.remainingMeatCuts === 0) {
      // All meat harvested: corpse becomes skeleton / bone
      corpseEntity.properties.name = `Esqueleto de ${cData.sourceName}`;
      corpseEntity.properties.resourceType = "bone";
      if (corpseEntity.properties.render) {
        corpseEntity.properties.render.skin = "Item_Bone.png";
        corpseEntity.properties.render.color = 0xfff4f1e8;
      }
    }

    return meatCut;
  } else if (cData.remainingBones > 0) {
    cData.remainingBones--;
    const boneCut = {
      name: `Osso de ${cData.sourceName}`,
      resourceType: "bone",
      nutrition: 300,
      foodType: "bone",
      digestDuration: 20,
      weight: 1
    };

    if (cData.remainingBones === 0) {
      corpseEntity.destroyed = true;
    }

    return boneCut;
  }

  corpseEntity.destroyed = true;
  return null;
}

/**
 * Handles death: spawns an intact corpse instead of scattering separate food explosions
 */
export function explodeEntityOnDeath(entity, entitiesArray, world) {
  if (!entity || !entity.properties) return;

  const ex = entity.x || 0;
  const ey = entity.y || 0;
  const entityName = entity.properties.name || `Creature #${entity.id}`;
  const species = entity.properties.species || "unknown";

  // Living creatures & humanoids leave a whole intact corpse
  if (entity.properties.life || entity.properties.brain) {
    const corpse = createCorpseEntity(entity, ex, ey);
    if (entitiesArray) {
      entitiesArray.push(corpse);
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

export function compileEntityEffects(entity) {
  const props = entity.properties || {};
  const effects = [];
  const degradable = [];
  let isSlow = true;

  for (const key in props) {
    const prop = props[key];
    if (!prop) continue;
    if (typeof prop.effect === "function") {
      effects.push(prop);
      // If ANY effect runs faster than 0.5s or has no rate, it's NOT slow
      if (prop.rate === undefined || prop.rate < 0.5) {
        isSlow = false;
      }
    }
  }
  
  let lodInterval = 1;
  if (!entity.properties.brain && !entity.properties.motor) {
    if (entity.properties.lifespan) {
      lodInterval = 1; // Decaying entities tick every frame without delay
    } else if (entity.properties.photosynthesis || entity.properties.tree || entity.properties.deep_root || entity.properties.species === "pine" || entity.properties.species === "oak" || entity.properties.species === "willow") {
      lodInterval = 120; // Flora
    } else if (entity.properties.species === "item" || entity.properties.species === "corpse") {
      lodInterval = 60; // Dropped items decay/tick very slowly
    } else {
      lodInterval = 30; // Other static entities
    }
  } else if (entity.properties.brain && entity.properties.motor) {
    if (!entity.properties.group && entity.properties.species !== "human") {
      lodInterval = 12; // Wild animals tick every 12 frames (smoothly interpolated by UI)
    } else {
      lodInterval = 1; // Colonists tick every frame for responsive AI
    }
  }
  
  // High-priority combat override
  if (entity.combatFlash > 0 || entity.emote === 8 || entity.properties.health?.current < entity.properties.health?.max) {
    lodInterval = 1; 
  }

  entity._activeEffects = effects;
  entity._lodInterval = lodInterval;
  entity._effectsVersion = entity._propsVersion || 0;
}

let activeCameraViewport = null;

export function setCameraViewport(viewport) {
  activeCameraViewport = viewport;
}

export function getCameraViewport() {
  return activeCameraViewport;
}

/**
 * Flat simulation tick over all active entities
 */
export function tickEntities(entities, dt, world) {
  if (world) currentWorld = world;
  
  updatePolitics(dt, currentTick);
  
  const initialLen = entities.length;
  let hasDead = false;

  for (let i = 0; i < initialLen; i++) {
    const entity = entities[i];
    if (!entity || entity.destroyed) {
      hasDead = true;
      continue;
    }

    // 1. Run effects via fast compiled array (skips scanning static properties)
    let effects = entity._activeEffects;
    if (!effects || entity._effectsVersion !== entity._propsVersion) {
      compileEntityEffects(entity);
      effects = entity._activeEffects;
    }

    let entityDt = dt;
    let lod = entity._lodInterval || 1;

    // Dynamic Camera Viewport Simulation LOD (active in 2D and 3D Isometric modes)
    if (activeCameraViewport) {
      const margin = activeCameraViewport.margin !== undefined ? activeCameraViewport.margin : 6;
      const inView = (
        entity.x >= activeCameraViewport.minTx - margin &&
        entity.x <= activeCameraViewport.maxTx + margin &&
        entity.y >= activeCameraViewport.minTy - margin &&
        entity.y <= activeCameraViewport.maxTy + margin
      );

      if (!inView) {
        const isCombatOrDying = entity.combatFlash > 0 || entity.emote === 8 || (entity.properties?.health?.current < entity.properties?.health?.max) || (entity.properties?.lifespan);
        if (!isCombatOrDying) {
          if (lod <= 1) {
            lod = 8;
          } else {
            lod = Math.min(240, lod * 3);
          }
        }
      }
    }

    if (lod > 1) {
      if ((currentTick + entity.id) % lod !== 0) continue;
      entityDt = dt * lod;
    }

    if (effects && effects.length > 0) {
      for (let j = 0; j < effects.length; j++) {
        const prop = effects[j];
        if (prop.rate !== undefined && prop.rate > 0) {
          prop._timer = (prop._timer || 0) + entityDt;
          if (prop._timer >= prop.rate) {
            // Analytical Macro Step: if speed is high, run at most 2 aggregated passes instead of dozens of micro-ticks
            const triggers = Math.floor(prop._timer / prop.rate);
            prop._timer %= prop.rate;
            if (triggers > 1) {
              prop.effect(entity, triggers * prop.rate, world, entities, prop);
            } else {
              prop.effect(entity, prop.rate, world, entities, prop);
            }
          }
        } else {
          prop.effect(entity, entityDt, world, entities, prop);
        }
      }
    }

    // Synchronize spatial hash grid if entity coordinates changed
    updateEntitySpatial(entity);

    // 2.5 Auto-clear emotes after 3 seconds (unless constantly refreshed)
    if (entity.emote !== entity._lastEmote) {
      entity._lastEmote = entity.emote;
      entity.emoteTimer = 0;
    }
    if (entity.emote !== undefined) {
      entity.emoteTimer = (entity.emoteTimer || 0) + entityDt;
      if (entity.emoteTimer > 3.0) {
        entity.emote = undefined;
        entity._lastEmote = undefined;
        entity.emoteTimer = 0;
      }
    }

    // 3. Check Vital HP (Death Condition: Brain condition <= 0, or plant life with no roots/energy)
    const props = entity.properties;
    let isDead = false;
    let explosionReason = null;
    if (props.brain && props.brain.condition <= 0) {
      isDead = true;
      explosionReason = "BRAIN_COLLAPSE";
    } else if (!props.brain && props.life && props.life.energy <= 0) {
      // Plants/Flora without brains die when energy runs out
      isDead = true;
    } else if (props.health && props.health.current <= 0) {
      isDead = true;
    }

    if (isDead || entity.destroyed) {
      entity.destroyed = true;
      if (!entity.deathTick) entity.deathTick = currentTick;
      hasDead = true;
      if (explosionReason === "BRAIN_COLLAPSE") {
        recordWorldEvent({
          type: "EXPLOSION",
          primaryEntityId: entity.id,
          location: { x: entity.x, y: entity.y },
          description: `${entity.properties.name || `Entity #${entity.id}`} suffered total brain collapse (condition 0) and violently exploded!`,
          tick: currentTick,
          timestamp: world?.clock ? { day: world.clock.day, hour: world.clock.hour, minute: world.clock.minute } : null
        });
      }
      if (isDead) {
        explodeEntityOnDeath(entity, entities, world);
      }
      unregisterEntitySpatial(entity);
    }
  }

  // Fast in-place compaction (O(N) single-pass without array splice shifting)
  if (hasDead) {
    let writeIdx = 0;
    const totalLen = entities.length;
    for (let i = 0; i < totalLen; i++) {
      const e = entities[i];
      if (e && !e.destroyed) {
        entities[writeIdx++] = e;
      }
    }
    entities.length = writeIdx;
  }
}

export function resolveWallSkin(x, y, wallCoords = globalWallCoords) {
  const kN = getTileKey(x, y - 1);
  const kS = getTileKey(x, y + 1);
  const kE = getTileKey(x + 1, y);
  const kW = getTileKey(x - 1, y);

  const hasN = wallCoords.has(kN) || wallCoords.has(`${x},${y - 1}`);
  const hasS = wallCoords.has(kS) || wallCoords.has(`${x},${y + 1}`);
  const hasE = wallCoords.has(kE) || wallCoords.has(`${x + 1},${y}`);
  const hasW = wallCoords.has(kW) || wallCoords.has(`${x - 1},${y}`);

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

