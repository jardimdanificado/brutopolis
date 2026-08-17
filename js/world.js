// =============================================================================
// Brutopolis - World as Root Entity
// =============================================================================

import { createEntity } from "./engine.js";

export const MAP_WIDTH = 512;
export const MAP_HEIGHT = 512;

/**
 * Creates the Root World Entity with map buffer and celestial bodies
 */
export function createWorld(wasmMemory, wasmExports) {
  const ptr = wasmExports.wasm_get_map_ptr();
  const mapBuffer = new Uint8Array(wasmMemory.buffer, ptr, MAP_WIDTH * MAP_HEIGHT);

  const world = createEntity({
    name: "Mundo",
    light: 1.0,
    heat: 0.8,
    clock: {
      day: 0,
      hour: 10,
      minute: 0,
      rate: 1.0, // 1 game minute per real second
      effect(worldEnt, dt) {
        this.minute++;
        if (this.minute >= 60) {
          this.minute = 0;
          this.hour++;
          if (this.hour >= 24) {
            this.hour = 0;
            this.day++;
          }
        }
      }
    }
  });

  // Attach map access methods directly to the world entity
  Object.defineProperties(world, {
    map: {
      value: mapBuffer,
      writable: true,
      enumerable: false
    },
    refreshMap: {
      value() {
        const newPtr = wasmExports.wasm_get_map_ptr();
        this.map = new Uint8Array(wasmMemory.buffer, newPtr, MAP_WIDTH * MAP_HEIGHT);
      },
      enumerable: false
    },
    getTile: {
      value(x, y) {
        if (x < 0 || x >= MAP_WIDTH || y < 0 || y >= MAP_HEIGHT) return 3; // VOID
        return this.map[y * MAP_WIDTH + x];
      },
      enumerable: false
    },
    setTile: {
      value(x, y, tile) {
        if (x < 0 || x >= MAP_WIDTH || y < 0 || y >= MAP_HEIGHT) return;
        this.map[y * MAP_WIDTH + x] = tile;
        wasmExports.wasm_set_tile(x, y, tile);
      },
      enumerable: false
    },
    isWalkable: {
      value(x, y) {
        if (x < 0 || x >= MAP_WIDTH || y < 0 || y >= MAP_HEIGHT) return false;
        return this.map[y * MAP_WIDTH + x] === 0; // 0 = FLOOR
      },
      enumerable: false
    }
  });

  // Create the Sun as a child entity of the World!
  const sun = createEntity({
    name: "Sol",
    celestial_cycle: {
      effect(sunEnt, dt, parent) {
        if (!parent || !parent.properties.clock) return;
        const clock = parent.properties.clock;
        const timeOfDay = clock.hour + clock.minute / 60.0;

        // Daylight calculation: sinusoidal curve between 5h and 19h
        let light = 0.18;
        if (timeOfDay >= 5.0 && timeOfDay <= 19.0) {
          const sunAngle = ((timeOfDay - 5.0) / 14.0) * Math.PI;
          light = 0.18 + 0.82 * Math.pow(Math.sin(sunAngle), 0.85);
        }
        parent.properties.light = Math.max(0.18, Math.min(1.0, light));

        // Ambient temperature: peak at 14h, lowest at 4h
        const heatAngle = (((timeOfDay + 20) % 24) / 24.0) * Math.PI * 2;
        parent.properties.heat = 0.4 + 0.4 * (0.5 + 0.5 * Math.sin(heatAngle));
      }
    }
  });

  world.addChild(sun);

  return world;
}
