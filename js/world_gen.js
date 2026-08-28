// =============================================================================
// Brutopolis - Procedural World Generator (Pure JavaScript Port)
// =============================================================================

export const MAP_WIDTH = 1024;
export const MAP_HEIGHT = 1024;

export const TILE_FLOOR = 0;       // Fertile Soil / Grassland
export const TILE_MOUNTAIN = 1;    // Mountain Peak
export const TILE_WATER = 2;       // Ocean Water / Lakes
export const TILE_SAND = 3;        // Sand / Coastal Beach / Desert
export const TILE_STONE = 4;       // Rocky Ground / Mountain Foothill
export const TILE_VOID = 5;
export const TILE_ROAD_GRASS = 6;  // Dirt Road / Packed Soil Track (Grassland)
export const TILE_ROAD_SAND = 7;   // Sand Paved Track (Dunes / Beach)
export const TILE_ROAD_STONE = 8;  // Cobblestone Highway (Rocky Foothills / Mountain)

export const MAP_PRESET_ARCHIPELAGO = {
  seed: 0,
  noise_scale: 0.05,
  octaves: 4,
  num_islands: 6,
  min_island_radius: 90.0,
  max_island_radius: 170.0,
  water_threshold: 0.35,
  mountain_threshold: 0.70,
  ca_smooth_iterations: 3
};

export const MAP_PRESET_CONTINENT = {
  seed: 0,
  noise_scale: 0.035,
  octaves: 5,
  num_islands: 3,
  min_island_radius: 140.0,
  max_island_radius: 240.0,
  water_threshold: 0.33,
  mountain_threshold: 0.72,
  ca_smooth_iterations: 4
};

export const MAP_PRESET_HIGHLANDS = {
  seed: 0,
  noise_scale: 0.06,
  octaves: 4,
  num_islands: 4,
  min_island_radius: 100.0,
  max_island_radius: 180.0,
  water_threshold: 0.30,
  mountain_threshold: 0.65,
  ca_smooth_iterations: 2
};

let s_rand_seed = 123456789;

function wasm_rand() {
  s_rand_seed = (Math.imul(s_rand_seed, 1103515245) + 12345) & 0x7fffffff;
  return s_rand_seed;
}

function random_seed(seed) {
  if (!seed) seed = 123456789;
  s_rand_seed = seed >>> 0;
  const iters = (seed % 17) + 1;
  for (let i = 0; i < iters; i++) wasm_rand();
}

function random_int(min_val, max_val) {
  if (min_val >= max_val) return min_val;
  const range = (max_val - min_val + 1) >>> 0;
  return min_val + (wasm_rand() % range);
}

let s_noise_seed = 12345;

function hash2(x, y) {
  let h = (Math.imul(x, 1619) + Math.imul(y, 31337) + Math.imul(s_noise_seed, 6971)) >>> 0;
  h ^= h >>> 17;
  h = Math.imul(h, 0xbf324c81) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0x9a7ed521) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

function vnoise_at(x, y) {
  return (hash2(x, y) & 0xFFFF) / 65535.0;
}

function bilerp(a, b, c, d, tx, ty) {
  const ab = a + (b - a) * tx;
  const cd = c + (d - c) * tx;
  return ab + (cd - ab) * ty;
}

function smoothstep(t) {
  return t * t * (3.0 - 2.0 * t);
}

function vnoise(fx, fy) {
  let xi = Math.floor(fx);
  let yi = Math.floor(fy);
  const tx = smoothstep(fx - xi);
  const ty = smoothstep(fy - yi);
  const a = vnoise_at(xi, yi);
  const b = vnoise_at(xi + 1, yi);
  const c = vnoise_at(xi, yi + 1);
  const d = vnoise_at(xi + 1, yi + 1);
  return bilerp(a, b, c, d, tx, ty);
}

function fbm(fx, fy, octaves) {
  let value = 0.0;
  let amp = 0.5;
  let freq = 1.0;
  let max_v = 0.0;
  for (let i = 0; i < octaves; i++) {
    value += vnoise(fx * freq, fy * freq) * amp;
    max_v += amp;
    amp *= 0.5;
    freq *= 2.1;
  }
  return value / max_v;
}

function island_falloff(dx, dy, radius) {
  const d = dx * dx + dy * dy;
  const r = radius * radius;
  if (d >= r) return 0.0;
  const t = 1.0 - d / r;
  return t * t * (3.0 - 2.0 * t);
}

const s_hmap = new Float32Array(MAP_WIDTH * MAP_HEIGHT);
const tmp_ca = new Uint8Array(MAP_WIDTH * MAP_HEIGHT);

function ca_smooth(map, iterations) {
  for (let iter = 0; iter < iterations; iter++) {
    for (let y = 0; y < MAP_HEIGHT; y++) {
      const yOffset = y * MAP_WIDTH;
      for (let x = 0; x < MAP_WIDTH; x++) {
        let land = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= MAP_HEIGHT) continue;
          const nyOffset = ny * MAP_WIDTH;
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            if (nx < 0 || nx >= MAP_WIDTH) continue;
            if (map[nyOffset + nx] !== TILE_WATER) land++;
          }
        }
        const idx = yOffset + x;
        if (map[idx] !== TILE_WATER) {
          tmp_ca[idx] = land >= 4 ? map[idx] : TILE_WATER;
        } else {
          tmp_ca[idx] = land >= 6 ? TILE_FLOOR : TILE_WATER;
        }
      }
    }
    map.set(tmp_ca);
  }
}

export function world_gen_is_walkable(map, x, y, move_type = 1) {
  if (x < 0 || x >= MAP_WIDTH || y < 0 || y >= MAP_HEIGHT) return false;
  const t = map[y * MAP_WIDTH + x];
  if (t === TILE_VOID) return false;
  if (move_type === 3) return true; // Fly
  if (move_type === 2) return t === TILE_WATER; // Aquatic
  if (move_type === 1) return t === TILE_FLOOR || t === TILE_SAND || t === TILE_STONE || (t >= TILE_ROAD_GRASS && t <= TILE_ROAD_STONE); // Terrestrial (walks on land)
  return false;
}

export function world_gen_generate(map, config, outCenter = { x: 256, y: 256 }) {
  const cfg = Object.assign({}, MAP_PRESET_ARCHIPELAGO, config || {});

  random_seed(cfg.seed > 0 ? cfg.seed : 1337);
  s_noise_seed = wasm_rand();

  const MAX_ISLAND_CENTROIDS = 16;
  let n_islands = cfg.num_islands > 0 ? cfg.num_islands : 4;
  if (n_islands > MAX_ISLAND_CENTROIDS) n_islands = MAX_ISLAND_CENTROIDS;

  const islands = [];
  islands.push({
    cx: MAP_WIDTH / 2,
    cy: MAP_HEIGHT / 2,
    radius: cfg.max_island_radius
  });

  for (let i = 1; i < n_islands; i++) {
    const margin = 40.0;
    islands.push({
      cx: margin + random_int(0, Math.floor(MAP_WIDTH - 2 * margin)),
      cy: margin + random_int(0, Math.floor(MAP_HEIGHT - 2 * margin)),
      radius: cfg.min_island_radius + random_int(0, Math.floor(cfg.max_island_radius - cfg.min_island_radius + 1.0))
    });
  }

  for (let y = 0; y < MAP_HEIGHT; y++) {
    const yOffset = y * MAP_WIDTH;
    for (let x = 0; x < MAP_WIDTH; x++) {
      const nx = x * cfg.noise_scale;
      const ny = y * cfg.noise_scale;
      const n = fbm(nx, ny, cfg.octaves);

      let falloff = 0.0;
      for (let i = 0; i < n_islands; i++) {
        const dx = x - islands[i].cx;
        const dy = y - islands[i].cy;
        const f = island_falloff(dx, dy, islands[i].radius);
        if (f > falloff) falloff = f;
      }

      s_hmap[yOffset + x] = n * falloff;
    }
  }

  for (let y = 0; y < MAP_HEIGHT; y++) {
    const yOffset = y * MAP_WIDTH;
    for (let x = 0; x < MAP_WIDTH; x++) {
      const h = s_hmap[yOffset + x];
      const idx = yOffset + x;
      if (h > cfg.mountain_threshold) map[idx] = TILE_MOUNTAIN;
      else if (h > cfg.water_threshold) map[idx] = TILE_FLOOR;
      else map[idx] = TILE_WATER;
    }
  }

  if (cfg.ca_smooth_iterations > 0) {
    ca_smooth(map, cfg.ca_smooth_iterations);
  }

  // 2. Generate Random Desert Sand Bands (arid regions)
  for (let y = 0; y < MAP_HEIGHT; y++) {
    const yOffset = y * MAP_WIDTH;
    for (let x = 0; x < MAP_WIDTH; x++) {
      const idx = yOffset + x;
      if (map[idx] === TILE_FLOOR) {
        const nx = x * 0.015 + 42.0;
        const ny = y * 0.015 + 88.0;
        const desert_noise = fbm(nx, ny, 3);
        if (desert_noise > 0.62) {
          map[idx] = TILE_SAND;
        }
      }
    }
  }

  // 3. Post-process Biome Borders:
  // - Water edges -> Beach SAND
  // - Mountain edges -> Rocky STONE
  tmp_ca.set(map);

  for (let y = 1; y < MAP_HEIGHT - 1; y++) {
    const yOffset = y * MAP_WIDTH;
    for (let x = 1; x < MAP_WIDTH - 1; x++) {
      const cur = tmp_ca[yOffset + x];
      const idx = yOffset + x;
      if (cur === TILE_FLOOR || cur === TILE_STONE) {
        let near_water = false;
        for (let dy = -1; dy <= 1 && !near_water; dy++) {
          const nyOffset = (y + dy) * MAP_WIDTH;
          for (let dx = -1; dx <= 1; dx++) {
            if (tmp_ca[nyOffset + x + dx] === TILE_WATER) {
              near_water = true;
              break;
            }
          }
        }
        if (near_water) {
          map[idx] = TILE_SAND;
          continue;
        }
      }

      if (cur === TILE_FLOOR) {
        let near_mountain = false;
        for (let dy = -1; dy <= 1 && !near_mountain; dy++) {
          const nyOffset = (y + dy) * MAP_WIDTH;
          for (let dx = -1; dx <= 1; dx++) {
            if (tmp_ca[nyOffset + x + dx] === TILE_MOUNTAIN) {
              near_mountain = true;
              break;
            }
          }
        }
        if (near_mountain) {
          map[idx] = TILE_STONE;
        }
      }
    }
  }

  // Find center walkable spawn
  let center_x = Math.floor(MAP_WIDTH / 2);
  let center_y = Math.floor(MAP_HEIGHT / 2);
  for (let r = 0; r < 60; r++) {
    let found = false;
    for (let dy = -r; dy <= r && !found; dy++) {
      for (let dx = -r; dx <= r && !found; dx++) {
        if (world_gen_is_walkable(map, center_x + dx, center_y + dy, 1)) {
          center_x += dx;
          center_y += dy;
          found = true;
        }
      }
    }
    if (found) break;
  }

  outCenter.x = center_x;
  outCenter.y = center_y;
  return outCenter;
}
