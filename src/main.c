#include "wagner.h"

#define MAP_WIDTH 512
#define MAP_HEIGHT 512
#define MAX_CREATURES 32
#define MAX_DROPPED_ITEMS 128
#define MAX_PATH_NODES 64

typedef enum {
    ITEM_NONE = 0,
    ITEM_BREAD,
    ITEM_FRUIT,
    ITEM_JUG_WATER,
    ITEM_HERB,
    ITEM_STEAK,
    ITEM_TYPE_COUNT
} ItemType;

typedef struct {
    ItemType type;
    int count;
} ItemStack;

typedef struct {
    int x;
    int y;
    ItemType type;
    int count;
    bool active;
} DroppedItem;

typedef enum {
    ACTION_IDLE = 0,
    ACTION_WANDER,
    ACTION_SEEK_WATER,
    ACTION_SEEK_FOOD,
    ACTION_SLEEP,
    ACTION_MANUAL_MOVE
} CreatureAction;

typedef enum {
    SPECIES_CAT = 0,
    SPECIES_DOG,
    SPECIES_HUMAN,
    SPECIES_KNIGHT,
    SPECIES_GOBLIN,
    SPECIES_BEAR,
    SPECIES_COUNT
} SpeciesType;

typedef struct {
    int x;
    int y;
} GridPos;

typedef struct {
    char name[32];
    int birth;
    int x;
    int y;
    
    float health;   // 0 to 100
    float hunger;   // 0 (full) to 100 (starving)
    float thirst;   // 0 (hydrated) to 100 (dehydrated)
    float fatigue;  // 0 (rested) to 100 (exhausted)
    
    CreatureAction action;
    SpeciesType species;
    
    GridPos path[MAX_PATH_NODES];
    int path_len;
    int path_idx;
    
    ItemStack inventory[6];
    float move_timer;
    bool active;
} Creature;

typedef struct {
    Creature creatures[MAX_CREATURES];
    DroppedItem items[MAX_DROPPED_ITEMS];
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

static Image img_tiles[3];
static Image img_species[SPECIES_COUNT];
static Image img_items[ITEM_TYPE_COUNT];

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

static float cam_x = 0;
static float cam_y = 0;
static float zoom = 1.0f;
static int last_mx = 0;
static int last_my = 0;

static int selected_creature_idx = 0;
static World world = {0};
static float tick_accumulator = 0.0f;

static inline void draw_sprite(Image image, int x, int y, int sx, int sy) {
    if (!image.pixels) return;
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

static inline void draw_box(int x, int y, int w, int h, int color) {
    push();
    translate(x, y);
    scale(w, h);
    fill(color);
    rect();
    pop();
}

static inline void draw_bar(int x, int y, int w, int h, float val, float max_val, int fg_color, int bg_color) {
    draw_box(x, y, w, h, bg_color);
    float pct = val / max_val;
    if (pct < 0.0f) pct = 0.0f;
    if (pct > 1.0f) pct = 1.0f;
    int fill_w = (int)(w * pct);
    if (fill_w > 0) {
        draw_box(x, y, fill_w, h, fg_color);
    }
}

// ---------------------------------------------------------------------------
// Item & Inventory Helpers
// ---------------------------------------------------------------------------

static bool creature_add_item(Creature* c, ItemType type, int count) {
    if (type == ITEM_NONE || count <= 0) return false;
    for (int i = 0; i < 6; i++) {
        if (c->inventory[i].type == type) {
            c->inventory[i].count += count;
            return true;
        }
    }
    for (int i = 0; i < 6; i++) {
        if (c->inventory[i].type == ITEM_NONE) {
            c->inventory[i].type = type;
            c->inventory[i].count = count;
            return true;
        }
    }
    return false;
}

static bool creature_consume_inventory_food(Creature* c) {
    for (int i = 0; i < 6; i++) {
        ItemType t = c->inventory[i].type;
        if (t == ITEM_BREAD || t == ITEM_FRUIT || t == ITEM_STEAK || t == ITEM_HERB) {
            c->inventory[i].count--;
            if (c->inventory[i].count <= 0) c->inventory[i].type = ITEM_NONE;
            
            c->hunger -= 40.0f;
            if (c->hunger < 0) c->hunger = 0;
            return true;
        }
    }
    return false;
}

static bool creature_consume_inventory_water(Creature* c) {
    for (int i = 0; i < 6; i++) {
        if (c->inventory[i].type == ITEM_JUG_WATER) {
            c->inventory[i].count--;
            if (c->inventory[i].count <= 0) c->inventory[i].type = ITEM_NONE;
            
            c->thirst -= 50.0f;
            if (c->thirst < 0) c->thirst = 0;
            return true;
        }
    }
    return false;
}

static void spawn_dropped_item(int x, int y, ItemType type, int count) {
    for (int i = 0; i < MAX_DROPPED_ITEMS; i++) {
        if (!world.items[i].active) {
            world.items[i].x = x;
            world.items[i].y = y;
            world.items[i].type = type;
            world.items[i].count = count;
            world.items[i].active = true;
            break;
        }
    }
}

static void creature_pickup_at(Creature* c, int x, int y) {
    for (int i = 0; i < MAX_DROPPED_ITEMS; i++) {
        if (world.items[i].active && world.items[i].x == x && world.items[i].y == y) {
            if (creature_add_item(c, world.items[i].type, world.items[i].count)) {
                world.items[i].active = false;
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Pathfinding (BFS Grid Bounded)
// ---------------------------------------------------------------------------

#define BFS_RADIUS 40
#define BFS_GRID_SIZE (BFS_RADIUS * 2 + 1)

static inline bool is_tile_walkable(int x, int y) {
    if (x < 0 || x >= MAP_WIDTH || y < 0 || y >= MAP_HEIGHT) return false;
    return tile_collision[world.map[y][x]] == 0;
}

static int find_path(int sx, int sy, int gx, int gy, GridPos* out_path, int max_out) {
    if (sx == gx && sy == gy) return 0;
    
    // If target tile is non-walkable (e.g. water tile), find nearest walkable neighbor
    if (!is_tile_walkable(gx, gy)) {
        int best_nx = gx, best_ny = gy;
        float min_d = 999999.0f;
        int dx_opts[] = {0, 0, -1, 1, -1, 1, -1, 1};
        int dy_opts[] = {-1, 1, 0, 0, -1, -1, 1, 1};
        bool found_adj = false;
        for (int i = 0; i < 8; i++) {
            int nx = gx + dx_opts[i];
            int ny = gy + dy_opts[i];
            if (is_tile_walkable(nx, ny)) {
                float dist = (float)((nx - sx)*(nx - sx) + (ny - sy)*(ny - sy));
                if (dist < min_d) {
                    min_d = dist;
                    best_nx = nx;
                    best_ny = ny;
                    found_adj = true;
                }
            }
        }
        if (!found_adj) return 0;
        gx = best_nx;
        gy = best_ny;
        if (sx == gx && sy == gy) return 0;
    }

    static int16_t qx[BFS_GRID_SIZE * BFS_GRID_SIZE];
    static int16_t qy[BFS_GRID_SIZE * BFS_GRID_SIZE];
    static int16_t px[BFS_GRID_SIZE][BFS_GRID_SIZE];
    static int16_t py[BFS_GRID_SIZE][BFS_GRID_SIZE];
    static bool visited[BFS_GRID_SIZE][BFS_GRID_SIZE];

    for (int y = 0; y < BFS_GRID_SIZE; y++) {
        for (int x = 0; x < BFS_GRID_SIZE; x++) {
            visited[y][x] = false;
        }
    }

    int head = 0, tail = 0;
    
    visited[BFS_RADIUS][BFS_RADIUS] = true;
    qx[tail] = (int16_t)sx;
    qy[tail] = (int16_t)sy;
    tail++;

    bool found = false;
    int dx[] = {0, 0, -1, 1};
    int dy[] = {-1, 1, 0, 0};

    while (head < tail) {
        int cx = qx[head];
        int cy = qy[head];
        head++;

        if (cx == gx && cy == gy) {
            found = true;
            break;
        }

        for (int i = 0; i < 4; i++) {
            int nx = cx + dx[i];
            int ny = cy + dy[i];

            int lx = nx - sx + BFS_RADIUS;
            int ly = ny - sy + BFS_RADIUS;

            if (lx >= 0 && lx < BFS_GRID_SIZE && ly >= 0 && ly < BFS_GRID_SIZE) {
                if (!visited[ly][lx] && is_tile_walkable(nx, ny)) {
                    visited[ly][lx] = true;
                    px[ly][lx] = (int16_t)cx;
                    py[ly][lx] = (int16_t)cy;
                    qx[tail] = (int16_t)nx;
                    qy[tail] = (int16_t)ny;
                    tail++;
                }
            }
        }
    }

    if (!found) return 0;

    static GridPos temp_path[BFS_GRID_SIZE * BFS_GRID_SIZE];
    int count = 0;
    int curr_x = gx;
    int curr_y = gy;

    while (curr_x != sx || curr_y != sy) {
        if (count >= max_out * 4) break;
        temp_path[count].x = curr_x;
        temp_path[count].y = curr_y;
        count++;

        int lx = curr_x - sx + BFS_RADIUS;
        int ly = curr_y - sy + BFS_RADIUS;
        int prev_x = px[ly][lx];
        int prev_y = py[ly][lx];
        curr_x = prev_x;
        curr_y = prev_y;
    }

    int final_count = 0;
    for (int i = count - 1; i >= 0 && final_count < max_out; i--) {
        out_path[final_count++] = temp_path[i];
    }

    return final_count;
}

static bool find_nearest_water_access(int cx, int cy, int* out_x, int* out_y) {
    float min_dist = 999999.0f;
    int best_x = -1, best_y = -1;
    
    for (int dy = -20; dy <= 20; dy++) {
        for (int dx = -20; dx <= 20; dx++) {
            int tx = cx + dx;
            int ty = cy + dy;
            if (tx >= 0 && tx < MAP_WIDTH && ty >= 0 && ty < MAP_HEIGHT) {
                if (world.map[ty][tx] == WATER) {
                    int adx[] = {0, 0, -1, 1};
                    int ady[] = {-1, 1, 0, 0};
                    for (int k = 0; k < 4; k++) {
                        int wx = tx + adx[k];
                        int wy = ty + ady[k];
                        if (is_tile_walkable(wx, wy)) {
                            float d = (float)((wx - cx)*(wx - cx) + (wy - cy)*(wy - cy));
                            if (d < min_dist) {
                                min_dist = d;
                                best_x = wx;
                                best_y = wy;
                            }
                        }
                    }
                }
            }
        }
    }
    if (best_x != -1) {
        *out_x = best_x;
        *out_y = best_y;
        return true;
    }
    return false;
}

static bool find_nearest_food_item(int cx, int cy, int* out_x, int* out_y) {
    float min_dist = 999999.0f;
    int best_x = -1, best_y = -1;
    
    for (int i = 0; i < MAX_DROPPED_ITEMS; i++) {
        if (!world.items[i].active) continue;
        ItemType t = world.items[i].type;
        if (t == ITEM_BREAD || t == ITEM_FRUIT || t == ITEM_STEAK || t == ITEM_HERB) {
            float d = (float)((world.items[i].x - cx)*(world.items[i].x - cx) + (world.items[i].y - cy)*(world.items[i].y - cy));
            if (d < min_dist) {
                min_dist = d;
                best_x = world.items[i].x;
                best_y = world.items[i].y;
            }
        }
    }
    if (best_x != -1) {
        *out_x = best_x;
        *out_y = best_y;
        return true;
    }
    return false;
}

// ---------------------------------------------------------------------------
// Archipelago map generation
// ---------------------------------------------------------------------------

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

static float hmap[MAP_HEIGHT][MAP_WIDTH];

static void ca_smooth(int iterations) {
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

void gen_map() {
    random_seed(w_unique);
    noise_seed = (uint32_t)random(0, 0x7FFFFFFF);

    #define MAX_ISLANDS 6
    typedef struct { float cx, cy, radius; } IslandSeed;

    int num_islands = 3 + random_int(0, MAX_ISLANDS - 3);
    IslandSeed islands[MAX_ISLANDS];
    for (int i = 0; i < num_islands; i++) {
        float margin = 12.0f;
        islands[i].cx     = margin + (float)random_int(0, (int)(MAP_WIDTH  - 2*margin));
        islands[i].cy     = margin + (float)random_int(0, (int)(MAP_HEIGHT - 2*margin));
        islands[i].radius = 10.0f + (float)random_int(0, 20);
    }

    float noise_scale = 0.07f;
    for (int y = 0; y < MAP_HEIGHT; y++) {
        for (int x = 0; x < MAP_WIDTH; x++) {
            float nx = x * noise_scale;
            float ny = y * noise_scale;
            float n = fbm(nx, ny, 4);

            float falloff = 0.0f;
            for (int i = 0; i < num_islands; i++) {
                float dx = (float)x - islands[i].cx;
                float dy = (float)y - islands[i].cy;
                float f  = island_falloff(dx, dy, islands[i].radius);
                if (f > falloff) falloff = f;
            }

            hmap[y][x] = n * 0.5f + falloff * 0.6f;
        }
    }

    for (int y = 0; y < MAP_HEIGHT; y++) {
        for (int x = 0; x < MAP_WIDTH; x++) {
            float h = hmap[y][x];
            if      (h > 0.60f) world.map[y][x] = MOUNTAIN;
            else if (h > 0.35f) world.map[y][x] = FLOOR;
            else                world.map[y][x] = WATER;
        }
    }

    ca_smooth(3);
}

void preload() {
    img_species[SPECIES_CAT] = load_image("Creature_Cat_U.png");
    img_species[SPECIES_DOG] = load_image("Creature_Dog_U.png");
    img_species[SPECIES_HUMAN] = load_image("Human_Normal_M.png");
    img_species[SPECIES_KNIGHT] = load_image("Human_Knight_M.png");
    img_species[SPECIES_GOBLIN] = load_image("Creature_Goblin_U.png");
    img_species[SPECIES_BEAR] = load_image("Creature_Bear_U.png");

    img_items[ITEM_NONE] = (Image){0};
    img_items[ITEM_BREAD] = load_image("Item_Bread.png");
    img_items[ITEM_FRUIT] = load_image("Item_Fruit.png");
    img_items[ITEM_JUG_WATER] = load_image("Item_Jug.png");
    img_items[ITEM_HERB] = load_image("Item_Herb.png");
    img_items[ITEM_STEAK] = load_image("Item_Steak.png");

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
}

void setup() {
    gen_map();

    // Find center land tile
    int center_x = MAP_WIDTH / 2;
    int center_y = MAP_HEIGHT / 2;
    for (int r = 0; r < 50; r++) {
        bool f = false;
        for (int dy = -r; dy <= r && !f; dy++) {
            for (int dx = -r; dx <= r && !f; dx++) {
                if (is_tile_walkable(center_x + dx, center_y + dy)) {
                    center_x += dx;
                    center_y += dy;
                    f = true;
                }
            }
        }
        if (f) break;
    }

    cam_x = (float)center_x;
    cam_y = (float)center_y;

    // Spawn Creatures
    const char* names[] = {
        "Gato Felix", "Cao Rex", "Humano Alex", "Cavaleiro Arthur",
        "Goblin Bob", "Urso Baloo", "Gato Garfield", "Cao Spike",
        "Guerreira Eowyn", "Goblin Snark", "Urso Koda", "Gato Mia"
    };
    SpeciesType species_list[] = {
        SPECIES_CAT, SPECIES_DOG, SPECIES_HUMAN, SPECIES_KNIGHT,
        SPECIES_GOBLIN, SPECIES_BEAR, SPECIES_CAT, SPECIES_DOG,
        SPECIES_HUMAN, SPECIES_GOBLIN, SPECIES_BEAR, SPECIES_CAT
    };

    int spawned = 0;
    for (int i = 0; i < 12; i++) {
        int rx = center_x + random_int(-15, 15);
        int ry = center_y + random_int(-15, 15);
        if (is_tile_walkable(rx, ry)) {
            Creature* c = &world.creatures[spawned];
            for (int k = 0; k < 31 && names[i][k]; k++) c->name[k] = names[i][k];
            c->x = rx;
            c->y = ry;
            c->species = species_list[i];
            c->health = 100.0f;
            c->hunger = (float)random_int(10, 40);
            c->thirst = (float)random_int(10, 40);
            c->fatigue = (float)random_int(0, 30);
            c->action = ACTION_IDLE;
            c->active = true;

            // Initial Inventory
            creature_add_item(c, ITEM_BREAD, random_int(1, 2));
            creature_add_item(c, ITEM_JUG_WATER, 1);
            spawned++;
        }
    }

    // Spawn Dropped Items around
    for (int i = 0; i < 25; i++) {
        int rx = center_x + random_int(-25, 25);
        int ry = center_y + random_int(-25, 25);
        if (is_tile_walkable(rx, ry)) {
            ItemType t = (ItemType)(1 + random_int(0, ITEM_TYPE_COUNT - 2));
            spawn_dropped_item(rx, ry, t, random_int(1, 3));
        }
    }
}

// ---------------------------------------------------------------------------
// Simulation Update
// ---------------------------------------------------------------------------

static void update_creature_ai(Creature* c, float dt) {
    if (!c->active) return;

    // Survival Decay
    c->hunger += 0.8f * dt;
    c->thirst += 1.2f * dt;

    if (c->action == ACTION_SLEEP) {
        c->fatigue -= 8.0f * dt;
        if (c->fatigue <= 0.0f) {
            c->fatigue = 0.0f;
            c->action = ACTION_IDLE;
        }
    } else {
        c->fatigue += 0.4f * dt;
    }

    // Health effects
    if (c->hunger >= 90.0f || c->thirst >= 90.0f) {
        c->health -= 2.0f * dt;
    } else if (c->hunger < 30.0f && c->thirst < 30.0f && c->health < 100.0f) {
        c->health += 1.0f * dt;
    }

    if (c->health <= 0.0f) {
        c->health = 0.0f;
        c->active = false; // creature died
        return;
    }

    // AI Decision Making (if not manual movement or sleeping)
    if (c->action != ACTION_SLEEP && c->action != ACTION_MANUAL_MOVE) {
        // Priority 1: Sleep if exhausted
        if (c->fatigue >= 85.0f) {
            c->action = ACTION_SLEEP;
            c->path_len = 0;
        }
        // Priority 2: Seek Water if thirsty
        else if (c->thirst >= 60.0f) {
            if (creature_consume_inventory_water(c)) {
                // Drank from inventory!
            } else {
                c->action = ACTION_SEEK_WATER;
                if (c->path_len == 0 || c->path_idx >= c->path_len) {
                    int wx, wy;
                    if (find_nearest_water_access(c->x, c->y, &wx, &wy)) {
                        c->path_len = find_path(c->x, c->y, wx, wy, c->path, MAX_PATH_NODES);
                        c->path_idx = 0;
                    }
                }
            }
        }
        // Priority 3: Seek Food if hungry
        else if (c->hunger >= 60.0f) {
            if (creature_consume_inventory_food(c)) {
                // Ate from inventory!
            } else {
                c->action = ACTION_SEEK_FOOD;
                if (c->path_len == 0 || c->path_idx >= c->path_len) {
                    int fx, fy;
                    if (find_nearest_food_item(c->x, c->y, &fx, &fy)) {
                        c->path_len = find_path(c->x, c->y, fx, fy, c->path, MAX_PATH_NODES);
                        c->path_idx = 0;
                    }
                }
            }
        }
        // Priority 4: Wander around
        else {
            c->action = ACTION_WANDER;
            if (c->path_len == 0 || c->path_idx >= c->path_len) {
                if (random_int(0, 100) < 15) { // 15% chance to pick new wander destination
                    int target_x = c->x + random_int(-8, 8);
                    int target_y = c->y + random_int(-8, 8);
                    if (is_tile_walkable(target_x, target_y)) {
                        c->path_len = find_path(c->x, c->y, target_x, target_y, c->path, MAX_PATH_NODES);
                        c->path_idx = 0;
                    }
                }
            }
        }
    }

    // Path Movement Execution
    if (c->path_len > 0 && c->path_idx < c->path_len) {
        c->move_timer += dt;
        float step_delay = (c->action == ACTION_SEEK_FOOD || c->action == ACTION_SEEK_WATER) ? 0.25f : 0.45f;
        if (c->move_timer >= step_delay) {
            c->move_timer = 0.0f;
            c->x = c->path[c->path_idx].x;
            c->y = c->path[c->path_idx].y;
            c->path_idx++;

            // Auto-pickup items on tile
            creature_pickup_at(c, c->x, c->y);

            // Check if arrived at water tile access
            if (c->action == ACTION_SEEK_WATER) {
                int dx[] = {0, 0, -1, 1};
                int dy[] = {-1, 1, 0, 0};
                for (int k = 0; k < 4; k++) {
                    int tx = c->x + dx[k];
                    int ty = c->y + dy[k];
                    if (tx >= 0 && tx < MAP_WIDTH && ty >= 0 && ty < MAP_HEIGHT && world.map[ty][tx] == WATER) {
                        c->thirst -= 60.0f;
                        if (c->thirst < 0) c->thirst = 0;
                        c->action = ACTION_IDLE;
                        c->path_len = 0;
                        break;
                    }
                }
            }

            if (c->path_idx >= c->path_len) {
                c->path_len = 0;
                c->path_idx = 0;
                if (c->action == ACTION_MANUAL_MOVE) c->action = ACTION_IDLE;
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Draw & UI Rendering
// ---------------------------------------------------------------------------

void draw() {
    float dt = wagner.delta_time;
    if (dt > 0.1f) dt = 0.1f;

    // Run AI Simulation Update
    for (int i = 0; i < MAX_CREATURES; i++) {
        update_creature_ai(&world.creatures[i], dt);
    }

    // Camera Controls
    float actual_scale = zoom;
    int tile_size = 0;
    if (img_tiles[FLOOR].pixels) {
        tile_size = (int)(img_tiles[FLOOR].width * zoom);
        if (tile_size < 4) tile_size = 4;
        actual_scale = (float)tile_size / img_tiles[FLOOR].width;
    }

    if (wagner.keys[KEY_Q] || wagner.keys[KEY_KP_MINUS]) zoom -= 1.0f * dt;
    if (wagner.keys[KEY_E] || wagner.keys[KEY_KP_PLUS])  zoom += 1.0f * dt;
    if (zoom < 0.2f) zoom = 0.2f;
    if (zoom > 3.0f) zoom = 3.0f;

    // Pan with WASD / Arrow keys
    float cam_speed = 15.0f * dt;
    if (wagner.keys[KEY_W] || wagner.keys[KEY_UP])    cam_y -= cam_speed;
    if (wagner.keys[KEY_S] || wagner.keys[KEY_DOWN])  cam_y += cam_speed;
    if (wagner.keys[KEY_A] || wagner.keys[KEY_LEFT])  cam_x -= cam_speed;
    if (wagner.keys[KEY_D] || wagner.keys[KEY_RIGHT]) cam_x += cam_speed;

    // Camera drag by mouse
    if (wagner.mouse_down && actual_scale > 0 && wagner.mouse.y < 170) {
        cam_x -= (wagner.mouse.x - last_mx) / actual_scale;
        cam_y -= (wagner.mouse.y - last_my) / actual_scale;
    }
    last_mx = wagner.mouse.x;
    last_my = wagner.mouse.y;

    int start_x = (wagner.width - MAP_WIDTH * tile_size) / 2 - (int)(cam_x * actual_scale);
    int start_y = (wagner.height - MAP_HEIGHT * tile_size) / 2 - (int)(cam_y * actual_scale);

    // Click Detection on Map / Creature Selection
    if (wagner.mouse_pressed) {
        int mx = wagner.mouse.x;
        int my = wagner.mouse.y;

        // If clicked on upper playfield (not HUD bar)
        if (my < 175) {
            int clicked_tile_x = (int)(((float)(mx - start_x)) / tile_size);
            int clicked_tile_y = (int)(((float)(my - start_y)) / tile_size);

            bool creature_clicked = false;
            for (int i = 0; i < MAX_CREATURES; i++) {
                if (world.creatures[i].active && world.creatures[i].x == clicked_tile_x && world.creatures[i].y == clicked_tile_y) {
                    selected_creature_idx = i;
                    creature_clicked = true;
                    break;
                }
            }

            // Command selected creature to move to target tile if ground clicked
            if (!creature_clicked && selected_creature_idx >= 0 && world.creatures[selected_creature_idx].active) {
                Creature* sc = &world.creatures[selected_creature_idx];
                if (is_tile_walkable(clicked_tile_x, clicked_tile_y)) {
                    sc->path_len = find_path(sc->x, sc->y, clicked_tile_x, clicked_tile_y, sc->path, MAX_PATH_NODES);
                    sc->path_idx = 0;
                    sc->action = ACTION_MANUAL_MOVE;
                }
            }
        }
    }

    // Keyboard Shortcuts for Selected Creature & Cycling
    static bool tab_was_down = false;
    if (wagner.keys[KEY_TAB]) {
        if (!tab_was_down) {
            tab_was_down = true;
            for (int step = 1; step <= MAX_CREATURES; step++) {
                int next_idx = (selected_creature_idx + step) % MAX_CREATURES;
                if (world.creatures[next_idx].active) {
                    selected_creature_idx = next_idx;
                    cam_x = (float)world.creatures[next_idx].x;
                    cam_y = (float)world.creatures[next_idx].y;
                    break;
                }
            }
        }
    } else {
        tab_was_down = false;
    }

    if (selected_creature_idx >= 0 && world.creatures[selected_creature_idx].active) {
        Creature* sc = &world.creatures[selected_creature_idx];
        if (wagner.keys[KEY_1]) creature_consume_inventory_food(sc);
        if (wagner.keys[KEY_2]) creature_consume_inventory_water(sc);
        if (wagner.keys[KEY_3]) {
            sc->action = (sc->action == ACTION_SLEEP) ? ACTION_IDLE : ACTION_SLEEP;
            sc->path_len = 0;
        }
    }

    // Render Map
    push(); fill(rgb(0, 0, 0)); clear(); pop();

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

    // Render Path of Selected Creature
    if (selected_creature_idx >= 0 && world.creatures[selected_creature_idx].active) {
        Creature* sc = &world.creatures[selected_creature_idx];
        for (int p = sc->path_idx; p < sc->path_len; p++) {
            int px = start_x + sc->path[p].x * tile_size;
            int py = start_y + sc->path[p].y * tile_size;
            if (px + tile_size > 0 && px < wagner.width && py + tile_size > 0 && py < wagner.height) {
                draw_box(px + tile_size / 4, py + tile_size / 4, tile_size / 2, tile_size / 2, YELLOW);
            }
        }
    }

    // Render Dropped Items
    for (int i = 0; i < MAX_DROPPED_ITEMS; i++) {
        if (!world.items[i].active) continue;
        int draw_x = start_x + world.items[i].x * tile_size;
        int draw_y = start_y + world.items[i].y * tile_size;

        if (draw_x + tile_size > 0 && draw_x < wagner.width && 
            draw_y + tile_size > 0 && draw_y < wagner.height) {
            draw_sprite(img_items[world.items[i].type], draw_x, draw_y, tile_size, tile_size);
        }
    }

    // Render Creatures
    for (int i = 0; i < MAX_CREATURES; i++) {
        Creature* c = &world.creatures[i];
        if (!c->active) continue;

        int draw_x = start_x + c->x * tile_size;
        int draw_y = start_y + c->y * tile_size;

        if (draw_x + tile_size > 0 && draw_x < wagner.width && 
            draw_y + tile_size > 0 && draw_y < wagner.height) {
            
            // Draw Selection Highlight
            if (i == selected_creature_idx) {
                draw_box(draw_x - 1, draw_y - 1, tile_size + 2, tile_size + 2, CYAN);
            }

            // Creature Sprite
            draw_sprite(img_species[c->species], draw_x, draw_y, tile_size, tile_size);

            // Overhead Emotes
            Image emote = (Image){0};
            if (c->fatigue >= 80.0f || c->action == ACTION_SLEEP) emote = img_emote_sleeping;
            else if (c->health < 35.0f) emote = img_emote_hurt;
            else if (c->hunger >= 70.0f) emote = img_emote_sick;
            else if (c->thirst >= 70.0f) emote = img_emote_upset;
            else if (c->action == ACTION_SEEK_FOOD || c->action == ACTION_SEEK_WATER) emote = img_emote_excited;
            else if (c->hunger < 25.0f && c->thirst < 25.0f) emote = img_emote_happy;

            if (emote.pixels) {
                int emote_size = tile_size * 3 / 4;
                if (emote_size < 8) emote_size = 8;
                draw_sprite(emote, draw_x + (tile_size - emote_size)/2, draw_y - emote_size, emote_size, emote_size);
            }
        }
    }

    // ---------------------------------------------------------------------------
    // HUD & Creature Inspector (Bottom Panel)
    // ---------------------------------------------------------------------------
    draw_box(0, 175, 320, 65, rgb(20, 24, 30));
    draw_box(0, 175, 320, 1, rgb(60, 80, 100)); // border top

    if (selected_creature_idx >= 0 && world.creatures[selected_creature_idx].active) {
        Creature* sc = &world.creatures[selected_creature_idx];

        // Column 1: Portrait & Info
        draw_sprite(img_species[sc->species], 6, 180, 28, 28);
        draw_text(sc->name, 38, 180, WHITE, 0);

        char action_str[32] = "Acao: Livre";
        if (sc->action == ACTION_SEEK_WATER)  draw_text("Buscando Agua", 38, 192, CYAN, 0);
        else if (sc->action == ACTION_SEEK_FOOD) draw_text("Buscando Comida", 38, 192, ORANGE, 0);
        else if (sc->action == ACTION_SLEEP)     draw_text("Dormindo...", 38, 192, YELLOW, 0);
        else if (sc->action == ACTION_MANUAL_MOVE) draw_text("Mover (Manual)", 38, 192, GREEN, 0);
        else draw_text("Vagando...", 38, 192, GRAY, 0);

        draw_text("1:Comer 2:Beber 3:Dormir", 6, 226, rgb(160, 180, 200), 0);

        // Column 2: Status Bars
        int bar_x = 135;
        int bar_w = 75;
        
        draw_text("HP", bar_x, 180, GREEN, 0);
        draw_bar(bar_x + 24, 181, bar_w, 6, sc->health, 100.0f, GREEN, rgb(50,0,0));

        draw_text("Fome", bar_x, 191, ORANGE, 0);
        draw_bar(bar_x + 24, 192, bar_w, 6, sc->hunger, 100.0f, ORANGE, rgb(30,30,30));

        draw_text("Sede", bar_x, 202, CYAN, 0);
        draw_bar(bar_x + 24, 203, bar_w, 6, sc->thirst, 100.0f, CYAN, rgb(30,30,30));

        draw_text("Sono", bar_x, 213, YELLOW, 0);
        draw_bar(bar_x + 24, 214, bar_w, 6, sc->fatigue, 100.0f, YELLOW, rgb(30,30,30));

        // Column 3: Inventory Grid
        draw_text("Bolsa:", 245, 180, WHITE, 0);
        for (int slot = 0; slot < 6; slot++) {
            int sx = 245 + (slot % 3) * 24;
            int sy = 192 + (slot / 3) * 22;
            draw_box(sx, sy, 20, 20, rgb(40, 50, 60));

            if (sc->inventory[slot].type != ITEM_NONE) {
                draw_sprite(img_items[sc->inventory[slot].type], sx + 2, sy + 2, 16, 16);
                char num[4];
                num[0] = '0' + (sc->inventory[slot].count % 10);
                num[1] = '\0';
                draw_text(num, sx + 12, sy + 11, WHITE, 0);
            }
        }
    } else {
        draw_text("Clique em uma criatura para inspecionar", 20, 200, WHITE, 0);
    }
}
