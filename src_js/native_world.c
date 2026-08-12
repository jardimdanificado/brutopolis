#include "native_world.h"

#include <stdbool.h>

static uint8_t map_data[NATIVE_MAP_HEIGHT][NATIVE_MAP_WIDTH];
static uint32_t rng_state = 12345u, noise_seed = 12345u;
static float height_map[NATIVE_MAP_HEIGHT][NATIVE_MAP_WIDTH];

static uint32_t rng_next(void) { rng_state = rng_state * 1664525u + 1013904223u; return rng_state; }
static uint32_t hash2(int x, int y) {
    uint32_t h = (uint32_t)(x * 1619 + y * 31337 + noise_seed * 6971);
    h ^= h >> 17; h *= 0xbf324c81u; h ^= h >> 13; h *= 0x9a7ed521u; h ^= h >> 16;
    return h;
}
static float vnoise_at(int x, int y) { return (float)(hash2(x, y) & 0xffffu) / 65535.0f; }
static float smoothstep(float t) { return t * t * (3.0f - 2.0f * t); }
static float bilerp(float a, float b, float c, float d, float tx, float ty) {
    float ab = a + (b - a) * tx, cd = c + (d - c) * tx;
    return ab + (cd - ab) * ty;
}
static float vnoise(float fx, float fy) {
    int xi = (int)fx; if (fx < 0) xi--;
    int yi = (int)fy; if (fy < 0) yi--;
    float tx = smoothstep(fx - xi), ty = smoothstep(fy - yi);
    return bilerp(vnoise_at(xi, yi), vnoise_at(xi+1, yi),
                  vnoise_at(xi, yi+1), vnoise_at(xi+1, yi+1), tx, ty);
}
static float fbm(float x, float y, int octaves) {
    float value = 0, amp = 0.5f, freq = 1, max = 0;
    for (int i = 0; i < octaves; i++) { value += vnoise(x*freq, y*freq)*amp; max += amp; amp*=0.5f; freq*=2.1f; }
    return value / max;
}
static float island_falloff(float dx, float dy, float radius) {
    float d = dx*dx + dy*dy, r = radius*radius;
    if (d >= r) return 0; float t = 1.0f - d/r; return t*t*(3.0f-2.0f*t);
}

void native_world_generate(void) {
    rng_state = 12345u;
    noise_seed = rng_next();
    typedef struct { float cx, cy, radius; } Island;
    Island islands[6];
    islands[0] = (Island){256, 256, 170};
    for (int i = 1; i < 6; i++) {
        islands[i].cx = 40.0f + (float)(rng_next() % 432u);
        islands[i].cy = 40.0f + (float)(rng_next() % 432u);
        islands[i].radius = 90.0f + (float)(rng_next() % 81u);
    }
    for (int y = 0; y < NATIVE_MAP_HEIGHT; y++) {
        for (int x = 0; x < NATIVE_MAP_WIDTH; x++) {
            float falloff = 0;
            for (int i = 0; i < 6; i++) {
                float f = island_falloff((float)x-islands[i].cx, (float)y-islands[i].cy, islands[i].radius);
                if (f > falloff) falloff = f;
            }
            height_map[y][x] = fbm(x * 0.05f, y * 0.05f, 4) * falloff;
            float h = height_map[y][x];
            map_data[y][x] = h > 0.70f ? NATIVE_MOUNTAIN : (h > 0.35f ? NATIVE_FLOOR : NATIVE_WATER);
        }
    }
    static uint8_t tmp[NATIVE_MAP_HEIGHT][NATIVE_MAP_WIDTH];
    for (int iter = 0; iter < 3; iter++) {
        for (int y = 0; y < NATIVE_MAP_HEIGHT; y++) for (int x = 0; x < NATIVE_MAP_WIDTH; x++) {
            int land = 0;
            for (int dy=-1; dy<=1; dy++) for (int dx=-1; dx<=1; dx++) {
                int nx=x+dx, ny=y+dy;
                if (nx>=0&&nx<NATIVE_MAP_WIDTH&&ny>=0&&ny<NATIVE_MAP_HEIGHT&&map_data[ny][nx]!=NATIVE_WATER) land++;
            }
            tmp[y][x] = map_data[y][x] != NATIVE_WATER ? (land>=4 ? map_data[y][x] : NATIVE_WATER) : (land>=6 ? NATIVE_FLOOR : NATIVE_WATER);
        }
        for (int y=0;y<NATIVE_MAP_HEIGHT;y++) for (int x=0;x<NATIVE_MAP_WIDTH;x++) map_data[y][x]=tmp[y][x];
    }
}

int native_world_tile(int x, int y) {
    if (x < 0 || x >= NATIVE_MAP_WIDTH || y < 0 || y >= NATIVE_MAP_HEIGHT)
        return NATIVE_VOID;
    return map_data[y][x];
}

int native_world_walkable(int x, int y, int movement) {
    int tile = native_world_tile(x, y);
    if (tile == NATIVE_VOID || movement == NATIVE_MOVE_NONE) return 0;
    if (movement == NATIVE_MOVE_FLY) return 1;
    if (movement == NATIVE_MOVE_AQUATIC) return tile == NATIVE_WATER;
    return tile == NATIVE_FLOOR;
}

int native_world_find_water(int sx, int sy, int movement, int radius,
                            NativeGridPos *out_pos) {
    if (!out_pos || radius < 0) return 0;
    int best_dist = 0x7fffffff;
    int best_x = 0, best_y = 0;
    int min_x = sx - radius, max_x = sx + radius;
    int min_y = sy - radius, max_y = sy + radius;
    for (int y = min_y; y <= max_y; y++) {
        for (int x = min_x; x <= max_x; x++) {
            if (native_world_tile(x, y) != NATIVE_WATER) continue;
            static const int dx[4] = {0, 0, -1, 1};
            static const int dy[4] = {-1, 1, 0, 0};
            for (int k = 0; k < 4; k++) {
                int wx = x + dx[k], wy = y + dy[k];
                if (!native_world_walkable(wx, wy, movement)) continue;
                int ddx = wx - sx, ddy = wy - sy;
                int dist = ddx * ddx + ddy * ddy;
                if (dist < best_dist) {
                    best_dist = dist;
                    best_x = wx;
                    best_y = wy;
                }
            }
        }
    }
    if (best_dist == 0x7fffffff) return 0;
    out_pos->x = best_x;
    out_pos->y = best_y;
    return 1;
}

int native_world_find_path(int sx, int sy, int gx, int gy, int movement,
                           NativeGridPos *out_path, int max_path) {
    if (!out_path || max_path <= 0 || !native_world_walkable(sx, sy, movement)) return 0;
    /* Match the original creature system: a creature may target an occupied
       or otherwise blocked tile, but walks to the nearest reachable neighbor. */
    if (!native_world_walkable(gx, gy, movement)) {
        static const int target_dx[8] = {0, 0, -1, 1, -1, 1, -1, 1};
        static const int target_dy[8] = {-1, 1, 0, 0, -1, -1, 1, 1};
        int best_x = gx, best_y = gy, best_dist = 0x7fffffff;
        int found_neighbor = 0;
        for (int i = 0; i < 8; i++) {
            int nx = gx + target_dx[i], ny = gy + target_dy[i];
            if (!native_world_walkable(nx, ny, movement)) continue;
            int ddx = nx - sx, ddy = ny - sy;
            int dist = ddx * ddx + ddy * ddy;
            if (dist < best_dist) {
                best_dist = dist;
                best_x = nx;
                best_y = ny;
                found_neighbor = 1;
            }
        }
        if (!found_neighbor) return 0;
        gx = best_x;
        gy = best_y;
        if (sx == gx && sy == gy) return 0;
    }
    enum { R = 40, S = 81 };
    static uint8_t seen[S * S];
    static int prev[S * S];
    static NativeGridPos queue[S * S];
    for (int i = 0; i < S * S; i++) { seen[i] = 0; prev[i] = -1; }
    int start = R * S + R;
    int head = 0, tail = 0;
    queue[tail++] = (NativeGridPos){sx, sy}; seen[start] = 1;
    int found = -1;
    static const int dx[4] = {0, 0, -1, 1};
    static const int dy[4] = {-1, 1, 0, 0};
    while (head < tail) {
        NativeGridPos p = queue[head];
        int pi = head++;
        if (p.x == gx && p.y == gy) { found = pi; break; }
        for (int k = 0; k < 4; k++) {
            int nx = p.x + dx[k], ny = p.y + dy[k];
            int lx = nx - sx + R, ly = ny - sy + R;
            if (lx < 0 || lx >= S || ly < 0 || ly >= S || !native_world_walkable(nx, ny, movement)) continue;
            int ni = ly * S + lx;
            if (seen[ni]) continue;
            seen[ni] = 1; prev[ni] = pi; queue[tail++] = (NativeGridPos){nx, ny};
        }
    }
    if (found < 0) return 0;
    NativeGridPos reverse[NATIVE_MAX_PATH]; int count = 0, cur = found;
    while (cur >= 0 && count < NATIVE_MAX_PATH) {
        NativeGridPos p = queue[cur];
        if (p.x == sx && p.y == sy) break;
        reverse[count++] = p;
        cur = prev[(p.y - sy + R) * S + (p.x - sx + R)];
    }
    int result = count < max_path ? count : max_path;
    for (int i = 0; i < result; i++) out_path[i] = reverse[count - 1 - i];
    return result;
}
