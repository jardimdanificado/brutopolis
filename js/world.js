// =============================================================================
// Brutopolis - World & Environment System
// =============================================================================

export const MAP_WIDTH = 512;
export const MAP_HEIGHT = 512;

export class WorldClock {
  constructor() {
    this.day = 0;
    this.hour = 10;
    this.minute = 0;
    this.globalLight = 1.0;
    this.minuteTimer = 0;
  }

  reset() {
    this.day = 0;
    this.hour = 10;
    this.minute = 0;
    this.globalLight = 1.0;
    this.minuteTimer = 0;
  }

  tick(dt) {
    this.minuteTimer += dt;
    // 1 real second = 1 game minute
    if (this.minuteTimer >= 1.0) {
      this.minuteTimer -= 1.0;
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

    const timeOfDay = this.hour + this.minute / 60.0;

    // Daylight curve between 5h and 19h
    if (timeOfDay >= 5.0 && timeOfDay <= 19.0) {
      const sunAngle = ((timeOfDay - 5.0) / 14.0) * Math.PI;
      this.globalLight = 0.18 + 0.82 * Math.pow(Math.sin(sunAngle), 0.85);
    } else {
      this.globalLight = 0.18;
    }
  }
}

export class World {
  constructor(wasmMemory, wasmExports) {
    this.mem = wasmMemory;
    this.wasm = wasmExports;
    this.width = MAP_WIDTH;
    this.height = MAP_HEIGHT;
    this.clock = new WorldClock();
    this.refresh();
  }

  refresh() {
    this.width = MAP_WIDTH;
    this.height = MAP_HEIGHT;
    const ptr = this.wasm.wasm_get_map_ptr();
    this.map = new Uint8Array(this.mem.buffer, ptr, MAP_WIDTH * MAP_HEIGHT);
    this.clock.reset();
  }

  getTile(x, y) {
    if (x < 0 || x >= MAP_WIDTH || y < 0 || y >= MAP_HEIGHT) return 5; // VOID
    return this.map[y * MAP_WIDTH + x];
  }

  getTileName(t) {
    switch (t) {
      case 0: return "Fertile Soil / Forest";
      case 1: return "Mountain Peak";
      case 2: return "Ocean Water";
      case 3: return "Sand Dunes / Desert";
      case 4: return "Rocky Foothills / Stone";
      default: return "Void";
    }
  }

  setTile(x, y, tile) {
    if (x < 0 || x >= MAP_WIDTH || y < 0 || y >= MAP_HEIGHT) return;
    this.map[y * MAP_WIDTH + x] = tile;
    this.wasm.wasm_set_tile(x, y, tile);
  }

  isWalkable(x, y) {
    if (x < 0 || x >= MAP_WIDTH || y < 0 || y >= MAP_HEIGHT) return false;
    const t = this.map[y * MAP_WIDTH + x];
    return t !== 5; // All tiles except bedrock/abyss (5) are traversable
  }
}
