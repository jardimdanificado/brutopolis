#include "wagner.h"

#define MAP_WIDTH 128
#define MAP_HEIGHT 128

typedef struct {
    char* name;
    int birth;
    int x;
    int y;
} Creature;

typedef struct {
    Creature creatures[256];
    uint8_t map[MAP_HEIGHT][MAP_WIDTH];
} World;

typedef enum {
    FLOOR,
    MOUNTAIN,
    WATER,
} Tile;

const uint8_t tile_collision[] = {
    [FLOOR] = 0,
    [MOUNTAIN] = 1,
    [WATER] = 1,
};

Image img_tiles[3];

static Image img_cat;

static Image img_emote_angry;
static Image img_emote_excited;
static Image img_emote_happy;
static Image img_emote_hurt;
static Image img_emote_nerd;
static Image img_emote_sad;
static Image img_emote_serious;
static Image img_emote_sick;
static Image img_emote_sleeping;
static Image img_emote_smug;
static Image img_emote_upset;
static Image img_emote_yarr;

static Image img_wall_es;
static Image img_wall_esw;
static Image img_wall_ew;
static Image img_wall_ne;
static Image img_wall_nes;
static Image img_wall_nesw;
static Image img_wall_new;
static Image img_wall_ns;
static Image img_wall_nsw;
static Image img_wall_nw;
static Image img_wall_sw;

static Image img_wall_nw;

static float cam_x = 0;
static float cam_y = 0;
static float zoom = 1.0f;
static int last_mx = 0;
static int last_my = 0;

static World world = {.creatures = {0}, .map = {0}};

static inline void draw_sprite(Image image, int x, int y, int sx, int sy) {
    push();
    translate(x, y);
    scale(sx, sy);
    texture(image);
    rect();
    pop();
}

static inline void draw_text(char* _text, int x, int y, int _color, float size) {
    push();
    translate(x, y);
    scale(size, size);
    fill(_color);
    text(_text);
    pop();
}

// ---------------------------------------------------------------------------
// Archipelago map generation
// ---------------------------------------------------------------------------

// --- Value noise hash (no external dependencies) ---------------------------
static uint32_t noise_seed = 12345;

static inline uint32_t hash2(int x, int y) {
    uint32_t h = (uint32_t)(x * 1619 + y * 31337 + noise_seed * 6971);
    h ^= h >> 17;
    h *= 0xbf324c81u;
    h ^= h >> 13;
    h *= 0x9a7ed521u;
    h ^= h >> 16;
    return h;
}

// value in [0,1] at integer grid point
static inline float vnoise_at(int x, int y) {
    return (float)(hash2(x, y) & 0xFFFF) / 65535.0f;
}

// bilinear interpolation helper
static inline float bilerp(float a, float b, float c, float d, float tx, float ty) {
    float ab = a + (b - a) * tx;
    float cd = c + (d - c) * tx;
    return ab + (cd - ab) * ty;
}

// smooth step
static inline float smoothstep(float t) { return t * t * (3.0f - 2.0f * t); }

// value noise sampled at fractional (fx,fy)
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

// fractional brownian motion — sums multiple octaves
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

// smooth radial falloff — returns 1.0 at center, 0.0 beyond radius
static inline float island_falloff(float dx, float dy, float radius) {
    float d = dx*dx + dy*dy;
    float r = radius * radius;
    if (d >= r) return 0.0f;
    float t = 1.0f - d / r;
    return t * t * (3.0f - 2.0f * t);
}

// temporary heightmap (float) for generation passes
static float hmap[MAP_HEIGHT][MAP_WIDTH];

// cellular automaton smoothing pass
static void ca_smooth(int iterations) {
    static uint8_t tmp[MAP_HEIGHT][MAP_WIDTH];
    for (int iter = 0; iter < iterations; iter++) {
        for (int y = 0; y < MAP_HEIGHT; y++) {
            for (int x = 0; x < MAP_WIDTH; x++) {
                // count land neighbors (including self) in 3x3
                int land = 0;
                for (int dy = -1; dy <= 1; dy++) {
                    for (int dx = -1; dx <= 1; dx++) {
                        int nx = x + dx, ny = y + dy;
                        if (nx < 0 || nx >= MAP_WIDTH || ny < 0 || ny >= MAP_HEIGHT)
                            continue;
                        if (world.map[ny][nx] != WATER) land++;
                    }
                }
                if (world.map[y][x] != WATER) {
                    tmp[y][x] = (land >= 4) ? world.map[y][x] : WATER;
                } else {
                    tmp[y][x] = (land >= 6) ? FLOOR : WATER;
                }
            }
        }
        for (int y = 0; y < MAP_HEIGHT; y++)
            for (int x = 0; x < MAP_WIDTH; x++)
                world.map[y][x] = tmp[y][x];
    }
}

// main archipelago generation
void gen_map() {
    random_seed(w_unique);
    noise_seed = (uint32_t)random(0, 0x7FFFFFFF);

    // --- island seed points (archipelago centers) --------------------------
    #define MAX_ISLANDS 6
    typedef struct { float cx, cy, radius; } IslandSeed;

    // pick between 3 and MAX_ISLANDS islands scattered across the map
    int num_islands = 3 + random_int(0, MAX_ISLANDS - 3);
    IslandSeed islands[MAX_ISLANDS];
    for (int i = 0; i < num_islands; i++) {
        // keep islands somewhat inset from borders
        float margin = 12.0f;
        islands[i].cx     = margin + (float)random_int(0, (int)(MAP_WIDTH  - 2*margin));
        islands[i].cy     = margin + (float)random_int(0, (int)(MAP_HEIGHT - 2*margin));
        islands[i].radius = 10.0f + (float)random_int(0, 20);
    }

    // --- build heightmap from FBM + island falloff masks -------------------
    float noise_scale = 0.07f;   // spatial frequency of noise
    for (int y = 0; y < MAP_HEIGHT; y++) {
        for (int x = 0; x < MAP_WIDTH; x++) {
            float nx = x * noise_scale;
            float ny = y * noise_scale;

            // base noise (4 octaves gives good coastline detail)
            float n = fbm(nx, ny, 4);

            // accumulate island falloff — any island can claim this tile
            float falloff = 0.0f;
            for (int i = 0; i < num_islands; i++) {
                float dx = (float)x - islands[i].cx;
                float dy = (float)y - islands[i].cy;
                float f  = island_falloff(dx, dy, islands[i].radius);
                if (f > falloff) falloff = f;
            }

            // blend noise with falloff: noise lifts land near island centers
            // and suppresses it far away → natural-looking island shapes
            hmap[y][x] = n * 0.5f + falloff * 0.6f;
        }
    }

    // --- threshold heightmap into tiles ------------------------------------
    // heights:  < 0.35 → deep water
    //  0.35–0.52 → coast/floor (FLOOR)
    //  > 0.52    → highland rock (MOUNTAIN)
    for (int y = 0; y < MAP_HEIGHT; y++) {
        for (int x = 0; x < MAP_WIDTH; x++) {
            float h = hmap[y][x];
            if      (h > 0.60f) world.map[y][x] = MOUNTAIN;   // rocky highlands
            else if (h > 0.35f) world.map[y][x] = FLOOR;  // land
            else                world.map[y][x] = WATER;   // ocean
        }
    }

    // --- cellular automaton smoothing to round coastlines ------------------
    ca_smooth(3);

    // place player on first FLOOR tile found near map center
    for (int r = 0; r < MAP_WIDTH / 2; r++) {
        int found = 0;
        for (int dy = -r; dy <= r && !found; dy++) {
            for (int dx = -r; dx <= r && !found; dx++) {
                int tx = MAP_WIDTH/2 + dx, ty = MAP_HEIGHT/2 + dy;
                if (tx >= 0 && tx < MAP_WIDTH && ty >= 0 && ty < MAP_HEIGHT
                    && world.map[ty][tx] == FLOOR) {
                    world.creatures[0].x = tx;
                    world.creatures[0].y = ty;
                    found = 1;
                }
            }
        }
        if (found) break;
    }
}

void preload() {
    img_cat = load_image("Creature_Cat_U.png");

    img_tiles[FLOOR] = load_image("Feature_Stone_A.png");
    img_tiles[MOUNTAIN] = load_image("Feature_Stone_C.png");
    img_tiles[WATER] = load_image("Feature_Waves.png");

    img_emote_angry = load_image("Emote_Angry.png");
    img_emote_excited = load_image("Emote_Excited.png");
    img_emote_happy = load_image("Emote_Happy.png");
    img_emote_hurt = load_image("Emote_Hurt.png");
    img_emote_nerd = load_image("Emote_Nerd.png");
    img_emote_sad = load_image("Emote_Sad.png");
    img_emote_serious = load_image("Emote_Serious.png");
    img_emote_sick = load_image("Emote_Sick.png");
    img_emote_sleeping = load_image("Emote_Sleeping.png");
    img_emote_smug = load_image("Emote_Smug.png");
    img_emote_upset = load_image("Emote_Upset.png");
    img_emote_yarr = load_image("Emote_Yarr.png");

    img_wall_es = load_image("Wall_ES.png");
    img_wall_esw = load_image("Wall_ESW.png");
    img_wall_ew = load_image("Wall_EW.png");
    img_wall_ne = load_image("Wall_NE.png");
    img_wall_nes = load_image("Wall_NES.png");
    img_wall_nesw = load_image("Wall_NESW.png");
    img_wall_new = load_image("Wall_NEW.png");
    img_wall_ns = load_image("Wall_NS.png");
    img_wall_nsw = load_image("Wall_NSW.png");
    img_wall_nw = load_image("Wall_NW.png");
    img_wall_sw = load_image("Wall_SW.png");
}

void setup()
{
    world.creatures[0].name = "player";
    world.creatures[0].birth = 0;
    world.creatures[0].x = 5;
    world.creatures[0].y = 5;

    world.creatures[1].name = "enemy";
    world.creatures[1].birth = 0;
    world.creatures[1].x = 10;
    world.creatures[1].y = 10;

    gen_map();
}

void draw() {
    // determine actual scale based on floor tile rounding
    float actual_scale = zoom;
    int tile_size = 0;
    if (img_tiles[FLOOR].pixels) {
        tile_size = (int)(img_tiles[FLOOR].width * zoom);
        if (tile_size > 0) actual_scale = (float)tile_size / img_tiles[FLOOR].width;
    }
    
    if (wagner.keys[KEY_Q]) zoom -= 1.0f * wagner.delta_time;
    if (wagner.keys[KEY_E])  zoom += 1.0f * wagner.delta_time;
    if (zoom < 0.1f) zoom = 0.1f;
    
    // camera drag by mouse
    if (wagner.mouse_down && actual_scale > 0) {
        cam_x -= (wagner.mouse.x - last_mx) / actual_scale;
        cam_y -= (wagner.mouse.y - last_my) / actual_scale;
    }
    last_mx = wagner.mouse.x;
    last_my = wagner.mouse.y;

    push(); fill(rgb(0, 0, 0)); clear(); pop();
    
    int start_x = (wagner.width - MAP_WIDTH * tile_size) / 2 - (int)(cam_x * actual_scale);
    int start_y = (wagner.height - MAP_HEIGHT * tile_size) / 2 - (int)(cam_y * actual_scale);
    
    // draw map
    for (int y = 0; y < MAP_HEIGHT; y++) {
        for (int x = 0; x < MAP_WIDTH; x++) {
            int draw_x = start_x + x * tile_size;
            int draw_y = start_y + y * tile_size;
            
            if (draw_x + tile_size > 0 && draw_x < wagner.width && 
                draw_y + tile_size > 0 && draw_y < wagner.height) {
                draw_sprite(img_tiles[world.map[y][x]], draw_x, draw_y, tile_size, tile_size);
            }
        }
    }
    
    // draw creatures
    for (int i = 0; i < 256; i++) {
        Creature* creature = &world.creatures[i];
        if (!creature->name) break;

        int draw_x = start_x + creature->x * tile_size;
        int draw_y = start_y + creature->y * tile_size;

        if (draw_x + tile_size > 0 && draw_x < wagner.width && 
            draw_y + tile_size > 0 && draw_y < wagner.height) {
            draw_sprite(img_cat, draw_x, draw_y, tile_size, tile_size);
        }
    }

    
    
    draw_text("brutopolis", 10, 10, WHITE, 0);
}
