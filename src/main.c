#include "wash_api.h"
#include "world_gen.h"
#include "renderer.h"

// ---------------------------------------------------------------------------
// Global Shared Memory State
// ---------------------------------------------------------------------------

static bool s_initialized = false;
static uint8_t s_map[MAP_HEIGHT][MAP_WIDTH];
static RenderEntity s_entities[MAX_RENDER_ENTITIES];
static RenderItem s_items[MAX_RENDER_ITEMS];

static float s_cam_x = 256.0f;
static float s_cam_y = 256.0f;
static float s_zoom = 1.0f;

static int s_day = 0;
static int s_hour = 10;
static int s_minute = 0;
static float s_light = 1.0f;
static float s_heat = 0.8f;
static int s_pop_count = 0;

static int s_selected_id = -1;
static bool s_is_paused = false;
static int s_target_tps = 60;

// ---------------------------------------------------------------------------
// Initialization & Map Generation
// ---------------------------------------------------------------------------

__attribute__((export_name("wasm_init")))
void wasm_init(uint32_t preset_id) {
    renderer_init();

    int cx = 256, cy = 256;
    if (preset_id == 1) {
        world_gen_generate(s_map, &MAP_PRESET_CONTINENT, &cx, &cy);
    } else if (preset_id == 2) {
        world_gen_generate(s_map, &MAP_PRESET_HIGHLANDS, &cx, &cy);
    } else {
        world_gen_generate(s_map, &MAP_PRESET_ARCHIPELAGO, &cx, &cy);
    }

    // Clear render entities & items
    for (int i = 0; i < MAX_RENDER_ENTITIES; i++) s_entities[i].active = 0;
    for (int i = 0; i < MAX_RENDER_ITEMS; i++) s_items[i].active = 0;

    s_cam_x = (float)cx;
    s_cam_y = (float)cy;
    s_zoom = 1.0f;
    s_selected_id = -1;
    s_initialized = true;
}

// ---------------------------------------------------------------------------
// Shared Memory Buffers & Map API
// ---------------------------------------------------------------------------

__attribute__((export_name("wasm_get_map_ptr")))
uint32_t wasm_get_map_ptr(void) {
    return (uint32_t)&s_map[0][0];
}

__attribute__((export_name("wasm_get_entities_ptr")))
uint32_t wasm_get_entities_ptr(void) {
    return (uint32_t)&s_entities[0];
}

__attribute__((export_name("wasm_get_max_entities")))
uint32_t wasm_get_max_entities(void) {
    return MAX_RENDER_ENTITIES;
}

__attribute__((export_name("wasm_get_items_ptr")))
uint32_t wasm_get_items_ptr(void) {
    return (uint32_t)&s_items[0];
}

__attribute__((export_name("wasm_get_max_items")))
uint32_t wasm_get_max_items(void) {
    return MAX_RENDER_ITEMS;
}

__attribute__((export_name("wasm_get_tile")))
uint32_t wasm_get_tile(int x, int y) {
    if (x < 0 || x >= MAP_WIDTH || y < 0 || y >= MAP_HEIGHT) return VOID_TILE;
    return s_map[y][x];
}

__attribute__((export_name("wasm_set_tile")))
void wasm_set_tile(int x, int y, uint32_t tile) {
    if (x < 0 || x >= MAP_WIDTH || y < 0 || y >= MAP_HEIGHT) return;
    s_map[y][x] = (uint8_t)tile;
}

// ---------------------------------------------------------------------------
// Camera & World Clock API
// ---------------------------------------------------------------------------

__attribute__((export_name("wasm_set_camera")))
void wasm_set_camera(float cx, float cy, float zoom) {
    s_cam_x = cx;
    s_cam_y = cy;
    if (zoom < 0.2f) zoom = 0.2f;
    if (zoom > 4.0f) zoom = 4.0f;
    s_zoom = zoom;
}

__attribute__((export_name("wasm_get_camera_x")))
float wasm_get_camera_x(void) { return s_cam_x; }

__attribute__((export_name("wasm_get_camera_y")))
float wasm_get_camera_y(void) { return s_cam_y; }

__attribute__((export_name("wasm_get_camera_zoom")))
float wasm_get_camera_zoom(void) { return s_zoom; }

__attribute__((export_name("wasm_set_clock")))
void wasm_set_clock(int day, int hour, int minute, float light, float heat, int pop) {
    s_day = day;
    s_hour = hour;
    s_minute = minute;
    s_light = light;
    s_heat = heat;
    s_pop_count = pop;
}

__attribute__((export_name("wasm_get_selected_id")))
int wasm_get_selected_id(void) { return s_selected_id; }

__attribute__((export_name("wasm_select_entity")))
void wasm_select_entity(int id) { s_selected_id = id; }

__attribute__((export_name("wasm_set_paused")))
void wasm_set_paused(uint32_t paused) { s_is_paused = (paused != 0); }

__attribute__((export_name("wasm_is_paused")))
uint32_t wasm_is_paused(void) { return s_is_paused ? 1 : 0; }

__attribute__((export_name("wasm_set_tps")))
void wasm_set_tps(uint32_t tps) {
    if (tps < 1) tps = 1;
    if (tps > 360) tps = 360;
    s_target_tps = (int)tps;
}

__attribute__((export_name("wasm_get_tps")))
uint32_t wasm_get_tps(void) { return (uint32_t)s_target_tps; }

__attribute__((export_name("wasm_select_at")))
int wasm_select_at(float screen_x, float screen_y, uint32_t screen_w, uint32_t screen_h) {
    if (screen_w == 0 || screen_h == 0) return -1;
    int tile_size = (int)(16 * s_zoom);
    if (tile_size < 1) tile_size = 1;

    int center_x = screen_w / 2;
    int center_y = screen_h / 2;

    float fx = s_cam_x + (screen_x - center_x) / (float)tile_size;
    float fy = s_cam_y + (screen_y - center_y) / (float)tile_size;

    int found_id = -1;

    // Pass 1: exact tile hit (cursor is squarely inside entity tile bounds)
    for (int i = 0; i < MAX_RENDER_ENTITIES; i++) {
        RenderEntity* e = &s_entities[i];
        if (!e->active) continue;
        if (fx >= (float)e->x && fx < (float)(e->x + 1) &&
            fy >= (float)e->y && fy < (float)(e->y + 1)) {
            found_id = e->id;
            s_selected_id = found_id;
            return found_id;
        }
    }

    // Pass 2: nearest entity center within a tight 1.5-tile radius
    float closest_dist = 1.5f;
    for (int i = 0; i < MAX_RENDER_ENTITIES; i++) {
        RenderEntity* e = &s_entities[i];
        if (!e->active) continue;
        float dx = ((float)e->x + 0.5f) - fx;
        float dy = ((float)e->y + 0.5f) - fy;
        float d = f_abs(dx) + f_abs(dy);
        if (d < closest_dist) {
            closest_dist = d;
            found_id = e->id;
        }
    }

    s_selected_id = found_id;
    return found_id;
}

__attribute__((export_name("wasm_get_sprite_data")))
int wasm_get_sprite_data(const char* name, uint32_t fg, uint32_t bg, uint8_t* out_pixels_16x16_rgba) {
    return renderer_get_sprite_data(name, fg, bg, out_pixels_16x16_rgba);
}

// ---------------------------------------------------------------------------
// Wash Compute & Frame Entrypoint
// ---------------------------------------------------------------------------

__attribute__((export_name("_start")))
void* _start(uint8_t* pixels, uint32_t width, uint32_t height, float time, float mouse_x, float mouse_y, uint32_t buttons, float dt) {
    if (!s_initialized) {
        wasm_init(0);
    }

    if (width == 0 || height == 0) return (void*)0;

    render_frame(pixels, (int)width, (int)height, time, dt,
                 s_map,
                 s_entities, MAX_RENDER_ENTITIES,
                 s_items, MAX_RENDER_ITEMS,
                 s_cam_x, s_cam_y, s_zoom, s_selected_id,
                 s_day, s_hour, s_minute, s_light, s_heat,
                 s_pop_count, s_is_paused, s_target_tps);

    return (void*)0;
}
