// =============================================================================
// Brutopolis - World & Environment System (Pure JS Engine)
// =============================================================================

import {
  MAP_WIDTH,
  MAP_HEIGHT,
  TILE_FLOOR,
  TILE_MOUNTAIN,
  TILE_WATER,
  TILE_SAND,
  TILE_STONE,
  TILE_VOID,
  TILE_ROAD_GRASS,
  TILE_ROAD_SAND,
  TILE_ROAD_STONE,
  MAP_PRESET_ARCHIPELAGO,
  MAP_PRESET_CONTINENT,
  MAP_PRESET_HIGHLANDS,
  world_gen_generate,
  world_gen_is_walkable
} from "./world_gen.js";

export {
  MAP_WIDTH,
  MAP_HEIGHT,
  TILE_FLOOR,
  TILE_MOUNTAIN,
  TILE_WATER,
  TILE_SAND,
  TILE_STONE,
  TILE_VOID,
  TILE_ROAD_GRASS,
  TILE_ROAD_SAND,
  TILE_ROAD_STONE
};

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
  constructor(presetId = 0, seed = 1337) {
    this.width = MAP_WIDTH;
    this.height = MAP_HEIGHT;
    this.clock = new WorldClock();
    this.map = new Uint8Array(MAP_WIDTH * MAP_HEIGHT);
    this.generate(presetId, seed);
  }

  generate(presetId = 0, seed = 1337) {
    let cfg = MAP_PRESET_ARCHIPELAGO;
    if (presetId === 1) cfg = MAP_PRESET_CONTINENT;
    else if (presetId === 2) cfg = MAP_PRESET_HIGHLANDS;

    const outCenter = { x: 256, y: 256 };
    world_gen_generate(this.map, { ...cfg, seed }, outCenter);
    this.spawnCenter = outCenter;
    this.clock.reset();
    return outCenter;
  }

  refresh() {
    this.clock.reset();
  }

  getTile(x, y) {
    if (x < 0 || x >= MAP_WIDTH || y < 0 || y >= MAP_HEIGHT) return TILE_VOID;
    return this.map[y * MAP_WIDTH + x];
  }

  getTileName(t) {
    switch (t) {
      case TILE_FLOOR: return "Fertile Soil / Forest";
      case TILE_MOUNTAIN: return "Mountain Peak";
      case TILE_WATER: return "Ocean Water";
      case TILE_SAND: return "Sand Dunes / Desert";
      case TILE_STONE: return "Rocky Foothills / Stone";
      case TILE_ROAD_GRASS: return "Terra com Estrada";
      case TILE_ROAD_SAND: return "Areia com Estrada";
      case TILE_ROAD_STONE: return "Montanha com Estrada";
      default: return "Void";
    }
  }

  setTile(x, y, tile) {
    if (x < 0 || x >= MAP_WIDTH || y < 0 || y >= MAP_HEIGHT) return;
    this.map[y * MAP_WIDTH + x] = tile;
  }

  isWalkable(x, y, moveType = 1) {
    return world_gen_is_walkable(this.map, x, y, moveType);
  }
}
