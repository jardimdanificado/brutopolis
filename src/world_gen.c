#include "world_gen.h"
#include <stddef.h>

const MapGenConfig MAP_PRESET_ARCHIPELAGO = {
    .seed = 0,
    .noise_scale = 0.05f,
    .octaves = 4,
    .num_islands = 6,
    .min_island_radius = 90.0f,
    .max_island_radius = 170.0f,
    .water_threshold = 0.35f,
    .mountain_threshold = 0.70f,
    .ca_smooth_iterations = 3
};

const MapGenConfig MAP_PRESET_CONTINENT = {
    .seed = 0,
    .noise_scale = 0.035f,
    .octaves = 5,
    .num_islands = 3,
    .min_island_radius = 140.0f,
    .max_island_radius = 240.0f,
    .water_threshold = 0.33f,
    .mountain_threshold = 0.72f,
    .ca_smooth_iterations = 4
};

const MapGenConfig MAP_PRESET_HIGHLANDS = {
    .seed = 0,
    .noise_scale = 0.06f,
    .octaves = 4,
    .num_islands = 4,
    .min_island_radius = 100.0f,
    .max_island_radius = 180.0f,
    .water_threshold = 0.30f,
    .mountain_threshold = 0.65f,
    .ca_smooth_iterations = 2
};

static uint32_t s_rand_seed = 123456789;
static inline uint32_t wasm_rand(void) {
    s_rand_seed = (s_rand_seed * 1103515245 + 12345) & 0x7fffffff;
    return s_rand_seed;
}

static inline void random_seed(uint32_t seed) {
    if (seed == 0) seed = 123456789;
    s_rand_seed = seed;
    for (int i = 0; i < (int)(seed % 17 + 1); i++) wasm_rand();
}

static inline int random_int(int min_val, int max_val) {
    if (min_val >= max_val) return min_val;
    uint32_t range = (uint32_t)(max_val - min_val + 1);
    return min_val + (int)(wasm_rand() % range);
}

static uint32_t s_noise_seed = 12345;

static inline uint32_t hash2(int x, int y) {
    uint32_t h = (uint32_t)(x * 1619 + y * 31337 + s_noise_seed * 6971);
    h ^= h >> 17;
    h *= 0xbf324c81u;
    h ^= h >> 13;
    h *= 0x9a7ed521u;
    h ^= h >> 16;
    return h;
}

static inline float vnoise_at(int x, int y) {
    return (float)(hash2(x, y) & 0xFFFF) / 65535.0f;
}

static inline float bilerp(float a, float b, float c, float d, float tx, float ty) {
    float ab = a + (b - a) * tx;
    float cd = c + (d - c) * tx;
    return ab + (cd - ab) * ty;
}

static inline float smoothstep(float t) { return t * t * (3.0f - 2.0f * t); }

static float vnoise(float fx, float fy) {
    int xi = (int)fx; if (fx < 0) xi--;
    int yi = (int)fy; if (fy < 0) yi--;
    float tx = smoothstep(fx - (float)xi);
    float ty = smoothstep(fy - (float)yi);
    float a = vnoise_at(xi,   yi);
    float b = vnoise_at(xi+1, yi);
    float c = vnoise_at(xi,   yi+1);
    float d = vnoise_at(xi+1, yi+1);
    return bilerp(a, b, c, d, tx, ty);
}

static float fbm(float fx, float fy, int octaves) {
    float value = 0.0f;
    float amp   = 0.5f;
    float freq  = 1.0f;
    float max_v = 0.0f;
    for (int i = 0; i < octaves; i++) {
        value += vnoise(fx * freq, fy * freq) * amp;
        max_v += amp;
        amp  *= 0.5f;
        freq *= 2.1f;
    }
    return value / max_v;
}

static inline float island_falloff(float dx, float dy, float radius) {
    float d = dx*dx + dy*dy;
    float r = radius * radius;
    if (d >= r) return 0.0f;
    float t = 1.0f - d / r;
    return t * t * (3.0f - 2.0f * t);
}

static float s_hmap[MAP_HEIGHT][MAP_WIDTH];

static void ca_smooth(uint8_t map[MAP_HEIGHT][MAP_WIDTH], int iterations) {
    static uint8_t tmp[MAP_HEIGHT][MAP_WIDTH];
    for (int iter = 0; iter < iterations; iter++) {
        for (int y = 0; y < MAP_HEIGHT; y++) {
            for (int x = 0; x < MAP_WIDTH; x++) {
                int land = 0;
                for (int dy = -1; dy <= 1; dy++) {
                    for (int dx = -1; dx <= 1; dx++) {
                        int nx = x + dx, ny = y + dy;
                        if (nx < 0 || nx >= MAP_WIDTH || ny < 0 || ny >= MAP_HEIGHT)
                            continue;
                        if (map[ny][nx] != WATER) land++;
                    }
                }
                if (map[y][x] != WATER) {
                    tmp[y][x] = (land >= 4) ? map[y][x] : WATER;
                } else {
                    tmp[y][x] = (land >= 6) ? FLOOR : WATER;
                }
            }
        }
        for (int y = 0; y < MAP_HEIGHT; y++) {
            for (int x = 0; x < MAP_WIDTH; x++) {
                map[y][x] = tmp[y][x];
            }
        }
    }
}

bool world_gen_is_walkable(const uint8_t map[MAP_HEIGHT][MAP_WIDTH], int x, int y, int move_type) {
    if (x < 0 || x >= MAP_WIDTH || y < 0 || y >= MAP_HEIGHT) return false;
    uint8_t t = map[y][x];
    if (t == VOID_TILE) return false;
    if (move_type == 3) return true; // Fly
    if (move_type == 2) return (t == WATER); // Aquatic
    if (move_type == 1) return (t == FLOOR || t == SAND || t == STONE); // Terrestrial / Walk
    return false; // Static
}

void world_gen_generate(uint8_t map[MAP_HEIGHT][MAP_WIDTH], const MapGenConfig* config, int* out_center_x, int* out_center_y) {
    MapGenConfig cfg = {
        .seed = 0,
        .noise_scale = 0.05f,
        .octaves = 4,
        .num_islands = 6,
        .min_island_radius = 90.0f,
        .max_island_radius = 170.0f,
        .water_threshold = 0.35f,
        .mountain_threshold = 0.70f,
        .ca_smooth_iterations = 3
    };
    if (config) cfg = *config;

    random_seed(cfg.seed > 0 ? cfg.seed : 1337);
    s_noise_seed = wasm_rand();

    #define MAX_ISLAND_CENTROIDS 16
    int n_islands = cfg.num_islands > 0 ? cfg.num_islands : 4;
    if (n_islands > MAX_ISLAND_CENTROIDS) n_islands = MAX_ISLAND_CENTROIDS;

    typedef struct { float cx, cy, radius; } IslandSeed;
    IslandSeed islands[MAX_ISLAND_CENTROIDS];

    islands[0].cx = (float)(MAP_WIDTH / 2);
    islands[0].cy = (float)(MAP_HEIGHT / 2);
    islands[0].radius = cfg.max_island_radius;

    for (int i = 1; i < n_islands; i++) {
        float margin = 40.0f;
        islands[i].cx     = margin + (float)random_int(0, (int)(MAP_WIDTH  - 2*margin));
        islands[i].cy     = margin + (float)random_int(0, (int)(MAP_HEIGHT - 2*margin));
        islands[i].radius = cfg.min_island_radius + (float)random_int(0, (int)(cfg.max_island_radius - cfg.min_island_radius + 1.0f));
    }

    for (int y = 0; y < MAP_HEIGHT; y++) {
        for (int x = 0; x < MAP_WIDTH; x++) {
            float nx = x * cfg.noise_scale;
            float ny = y * cfg.noise_scale;
            float n = fbm(nx, ny, cfg.octaves);

            float falloff = 0.0f;
            for (int i = 0; i < n_islands; i++) {
                float dx = (float)x - islands[i].cx;
                float dy = (float)y - islands[i].cy;
                float f  = island_falloff(dx, dy, islands[i].radius);
                if (f > falloff) falloff = f;
            }

            s_hmap[y][x] = n * falloff;
        }
    }

    for (int y = 0; y < MAP_HEIGHT; y++) {
        for (int x = 0; x < MAP_WIDTH; x++) {
            float h = s_hmap[y][x];
            if      (h > cfg.mountain_threshold) map[y][x] = MOUNTAIN;
            else if (h > cfg.water_threshold)    map[y][x] = FLOOR;
            else                                 map[y][x] = WATER;
        }
    }

    if (cfg.ca_smooth_iterations > 0) {
        ca_smooth(map, cfg.ca_smooth_iterations);
    }

    // 2. Generate Random Desert Sand Bands (arid regions)
    for (int y = 0; y < MAP_HEIGHT; y++) {
        for (int x = 0; x < MAP_WIDTH; x++) {
            if (map[y][x] == FLOOR) {
                float nx = x * 0.015f + 42.0f;
                float ny = y * 0.015f + 88.0f;
                float desert_noise = fbm(nx, ny, 3);
                if (desert_noise > 0.62f) {
                    map[y][x] = SAND;
                }
            }
        }
    }

    // 3. Post-process Biome Borders:
    // - Water edges -> Beach SAND
    // - Mountain edges -> Rocky STONE
    uint8_t temp_map[MAP_HEIGHT][MAP_WIDTH];
    for (int y = 0; y < MAP_HEIGHT; y++) {
        for (int x = 0; x < MAP_WIDTH; x++) {
            temp_map[y][x] = map[y][x];
        }
    }

    for (int y = 1; y < MAP_HEIGHT - 1; y++) {
        for (int x = 1; x < MAP_WIDTH - 1; x++) {
            uint8_t cur = temp_map[y][x];
            if (cur == FLOOR || cur == STONE) {
                // Check if adjacent to water -> Beach Sand
                bool near_water = false;
                for (int dy = -1; dy <= 1 && !near_water; dy++) {
                    for (int dx = -1; dx <= 1; dx++) {
                        if (temp_map[y + dy][x + dx] == WATER) {
                            near_water = true;
                            break;
                        }
                    }
                }
                if (near_water) {
                    map[y][x] = SAND;
                    continue;
                }
            }

            if (cur == FLOOR) {
                // Check if adjacent to mountain -> Rocky Stone Ground
                bool near_mountain = false;
                for (int dy = -1; dy <= 1 && !near_mountain; dy++) {
                    for (int dx = -1; dx <= 1; dx++) {
                        if (temp_map[y + dy][x + dx] == MOUNTAIN) {
                            near_mountain = true;
                            break;
                        }
                    }
                }
                if (near_mountain) {
                    map[y][x] = STONE;
                }
            }
        }
    }

    // Find center walkable spawn
    int center_x = MAP_WIDTH / 2;
    int center_y = MAP_HEIGHT / 2;
    for (int r = 0; r < 60; r++) {
        bool f = false;
        for (int dy = -r; dy <= r && !f; dy++) {
            for (int dx = -r; dx <= r && !f; dx++) {
                if (world_gen_is_walkable(map, center_x + dx, center_y + dy, 1)) {
                    center_x += dx;
                    center_y += dy;
                    f = true;
                }
            }
        }
        if (f) break;
    }

    if (out_center_x) *out_center_x = center_x;
    if (out_center_y) *out_center_y = center_y;
}
