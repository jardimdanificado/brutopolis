// =============================================================================
// Brutopolis - Hierarchical Property Bag Engine (Composite Entity Pattern)
// =============================================================================

const encoder = new TextEncoder();
let nextEntityId = 1;

// Central O(1) registry for all active entities in the universe
export const entityRegistry = new Map();

/**
 * Creates a pure JavaScript Entity with Property Bag and Child Entity support
 */
export function createEntity(properties = {}, x = undefined, y = undefined) {
  const entity = {
    id: nextEntityId++,
    x: x !== undefined ? Math.round(x) : undefined,
    y: y !== undefined ? Math.round(y) : undefined,
    properties: { ...properties },
    entities: [] // Child entities (parasites, organs, inventory items, celestial bodies, etc.)
  };

  // Non-enumerable parent pointer to prevent circular reference in JSON/iteration
  Object.defineProperty(entity, "parent", {
    value: null,
    writable: true,
    configurable: true,
    enumerable: false
  });

  // Non-enumerable helper methods attached directly to the entity
  Object.defineProperties(entity, {
    addChild: {
      value(child) {
        if (!child) return child;
        if (child.parent && child.parent !== this) {
          child.parent.removeChild(child);
        }
        child.parent = this;
        if (!this.entities.includes(child)) {
          this.entities.push(child);
        }
        return child;
      },
      enumerable: false
    },
    removeChild: {
      value(child) {
        if (!child) return;
        const idx = this.entities.indexOf(child);
        if (idx >= 0) {
          this.entities.splice(idx, 1);
        }
        if (child.parent === this) {
          child.parent = null;
        }
        return child;
      },
      enumerable: false
    },
    getRoot: {
      value() {
        let curr = this;
        while (curr.parent) {
          curr = curr.parent;
        }
        return curr;
      },
      enumerable: false
    },
    getWorldPos: {
      value() {
        let x = this.x !== undefined ? this.x : 0;
        let y = this.y !== undefined ? this.y : 0;
        let curr = this.parent;
        while (curr) {
          if (curr.x !== undefined) x += curr.x;
          if (curr.y !== undefined) y += curr.y;
          curr = curr.parent;
        }
        return { x, y };
      },
      enumerable: false
    },
    getPath: {
      value() {
        const path = [];
        let curr = this;
        while (curr) {
          const name = curr.properties?.name || (curr.id === 0 ? "Mundo" : `Entidade #${curr.id}`);
          path.unshift({ id: curr.id, name, entity: curr });
          curr = curr.parent;
        }
        return path;
      },
      enumerable: false
    },
    destroy: {
      value() {
        this.destroyed = true;
        entityRegistry.delete(this.id);
        if (this.parent) {
          this.parent.removeChild(this);
        }
        // Recursively destroy children
        for (const child of this.entities) {
          child.destroy();
        }
      },
      enumerable: false
    }
  });

  entityRegistry.set(entity.id, entity);
  return entity;
}

/**
 * Moves an entity from its current parent to a new parent container safely
 */
export function moveTo(child, newParent) {
  if (!child || !newParent) return;
  newParent.addChild(child);
}

/**
 * Finds any entity in the universe in O(1) by ID
 */
export function getEntityById(id) {
  return entityRegistry.get(id);
}

/**
 * Recursively ticks an entity and all its children
 */
export function tickRecursive(entity, dt, parent = null, root = null) {
  if (entity.destroyed) return;
  const rootEntity = root || entity;

  // 1. Process all properties of this entity
  const propEntries = Object.entries(entity.properties || {});
  for (let i = 0; i < propEntries.length; i++) {
    const [key, prop] = propEntries[i];
    if (!prop) continue;

    if (typeof prop.effect === "function") {
      if (prop.rate !== undefined && prop.rate > 0) {
        prop._timer = (prop._timer || 0) + dt;
        while (prop._timer >= prop.rate) {
          prop._timer -= prop.rate;
          prop.effect(entity, prop.rate, parent, rootEntity, prop);
        }
      } else {
        prop.effect(entity, dt, parent, rootEntity, prop);
      }
    }
  }

  // 2. Process all child entities recursively
  if (Array.isArray(entity.entities)) {
    for (let i = entity.entities.length - 1; i >= 0; i--) {
      const child = entity.entities[i];
      if (child.destroyed) {
        entity.entities.splice(i, 1);
        entityRegistry.delete(child.id);
      } else {
        tickRecursive(child, dt, entity, rootEntity);
      }
    }
  }

  // 3. Auto-destroy if health exists and drops to 0 or below
  if (entity.properties?.health && entity.properties.health.current <= 0) {
    entity.destroy();
  }
}

/**
 * Recursively collects and syncs all renderable entities into WASM memory
 */
export function syncRenderTreeToWasm(rootEntity, wasmMemory, wasmExports) {
  const entitiesPtr = wasmExports.wasm_get_entities_ptr();
  const maxEntities = wasmExports.wasm_get_max_entities();

  const memBuf = wasmMemory.buffer;
  const view = new DataView(memBuf);
  const u8 = new Uint8Array(memBuf);

  // Recursively collect all entities with 'render' property
  const renderList = [];
  function collectRenderables(node) {
    if (!node || node.destroyed) return;
    if (node.properties && node.properties.render) {
      renderList.push(node);
    }
    if (Array.isArray(node.entities)) {
      for (let i = 0; i < node.entities.length; i++) {
        collectRenderables(node.entities[i]);
      }
    }
  }

  collectRenderables(rootEntity);

  const STRUCT_SIZE = 108;
  for (let i = 0; i < maxEntities; i++) {
    const offset = entitiesPtr + i * STRUCT_SIZE;
    if (i < renderList.length) {
      const e = renderList[i];
      const r = e.properties.render;
      const pos = (e.x !== undefined && e.y !== undefined) ? { x: e.x, y: e.y } : e.getWorldPos();

      view.setInt32(offset + 0, 1, true); // active
      view.setInt32(offset + 4, e.id, true);
      view.setInt32(offset + 8, pos.x, true);
      view.setInt32(offset + 12, pos.y, true);
      view.setInt32(offset + 16, e.motor || 0, true);
      view.setUint32(offset + 20, r.color !== undefined ? r.color : 0xffffffff, true);
      view.setUint32(offset + 24, r.backcolor !== undefined ? r.backcolor : 0x00000000, true);

      // Health bar preview if entity has health property
      if (e.properties.health) {
        view.setFloat32(offset + 28, e.properties.health.current, true);
        view.setFloat32(offset + 32, e.properties.health.max || e.properties.health.current, true);
      } else {
        view.setFloat32(offset + 28, 0, true);
        view.setFloat32(offset + 32, 0, true);
      }

      view.setInt32(offset + 36, e.emote !== undefined ? e.emote : -1, true);
      view.setInt32(offset + 40, e.combatFlash > 0 ? 1 : 0, true);

      const skinStr = r.skin || "Actor_Knight.png";
      const skinBytes = encoder.encode(skinStr);
      const skinOffset = offset + 44;
      const copyLen = Math.min(63, skinBytes.length);
      u8.set(skinBytes.subarray(0, copyLen), skinOffset);
      u8[skinOffset + copyLen] = 0;
    } else {
      view.setInt32(offset + 0, 0, true); // inactive
    }
  }
}
