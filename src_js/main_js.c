// =============================================================================
//  main_js.c — C host for brutopolis JS variant
//
//  Embeds MicroQuickJS (same pattern as mquickjs_wagner), loads game.js
//  from assets, and bridges C drawing/input to JavaScript.
// =============================================================================

#include <stdint.h>
#include <string.h>
#include <stdlib.h>

// ---------------------------------------------------------------------------
// Assets — Wagner-compatible aliases for the assets_js.h format
// ---------------------------------------------------------------------------
#include "../assets_js.h"

// ---------------------------------------------------------------------------
// Wagner config
// ---------------------------------------------------------------------------
#define WAGNER_TITLE "brutopolis-js"
#define WAGNER_CFG_W    320
#define WAGNER_CFG_H    240
#define WAGNER_CFG_BPP  8
#define WAGNER_CFG_SCALE 1
#define WAGNER_CFG_R_BITS 3
#define WAGNER_CFG_R_SHIFT 5
#define WAGNER_CFG_G_BITS 3
#define WAGNER_CFG_G_SHIFT 2
#define WAGNER_CFG_B_BITS 2
#define WAGNER_CFG_B_SHIFT 0
#define WAGNER_CFG_A_BITS 0
#define WAGNER_CFG_A_SHIFT 0
#define WAGNER_NO_AUDIO_DECODE
#define LODEPNG_NO_COMPILE_DISK
#define LODEPNG_NO_COMPILE_ENCODER
#define LODEPNG_NO_COMPILE_ANCILLARY_CHUNKS
#define LODEPNG_NO_COMPILE_ERROR_TEXT
#define WAGNER_IMPLEMENTATION
#include "../wagner.h"

// ---------------------------------------------------------------------------
// MicroQuickJS
// ---------------------------------------------------------------------------
#include "mquickjs.h"

/* C-owned terrain/state used by the hybrid runtime.  The JavaScript side
 * will own the simulation, while these routines keep map generation and
 * rendering-facing data in the native engine. */
#include "native_world.h"

/* Stubs for JS stdlib optional functions */
JSValue js_date_constructor(JSContext *ctx, JSValue *tv, int argc, JSValue *argv) { return JS_NewDate(ctx, 0); }
JSValue js_date_now(JSContext *ctx, JSValue *tv, int argc, JSValue *argv) { return JS_NewInt64(ctx, 0); }
JSValue js_performance_now(JSContext *ctx, JSValue *tv, int argc, JSValue *argv) { return JS_NewInt64(ctx, 0); }
JSValue js_print(JSContext *ctx, JSValue *tv, int argc, JSValue *argv) { return JS_UNDEFINED; }
JSValue js_gc(JSContext *ctx, JSValue *tv, int argc, JSValue *argv) { JS_GC(ctx); return JS_UNDEFINED; }
JSValue js_load(JSContext *ctx, JSValue *tv, int argc, JSValue *argv) { return JS_UNDEFINED; }
JSValue js_setTimeout(JSContext *ctx, JSValue *tv, int argc, JSValue *argv) { return JS_NewInt32(ctx, 0); }
JSValue js_clearTimeout(JSContext *ctx, JSValue *tv, int argc, JSValue *argv) { return JS_UNDEFINED; }
JSValue js_set_pixel(JSContext *ctx, JSValue *tv, int argc, JSValue *argv) { return JS_UNDEFINED; }
JSValue js_fill(JSContext *ctx, JSValue *tv, int argc, JSValue *argv);
JSValue js_clear(JSContext *ctx, JSValue *tv, int argc, JSValue *argv);
JSValue js_rect(JSContext *ctx, JSValue *tv, int argc, JSValue *argv);
JSValue js_text(JSContext *ctx, JSValue *tv, int argc, JSValue *argv);
JSValue js_rgb(JSContext *ctx, JSValue *tv, int argc, JSValue *argv);
JSValue js_draw_sprite(JSContext *ctx, JSValue *tv, int argc, JSValue *argv);
JSValue js_draw_sprite_colored(JSContext *ctx, JSValue *tv, int argc, JSValue *argv);
JSValue js_native_map_generate(JSContext *ctx, JSValue *tv, int argc, JSValue *argv);
JSValue js_native_map_width(JSContext *ctx, JSValue *tv, int argc, JSValue *argv);
JSValue js_native_map_height(JSContext *ctx, JSValue *tv, int argc, JSValue *argv);
JSValue js_native_map_tile(JSContext *ctx, JSValue *tv, int argc, JSValue *argv);
JSValue js_native_map_walkable(JSContext *ctx, JSValue *tv, int argc, JSValue *argv);
JSValue js_native_find_water(JSContext *ctx, JSValue *tv, int argc, JSValue *argv);
JSValue js_native_find_path(JSContext *ctx, JSValue *tv, int argc, JSValue *argv);
JSValue js_native_render_entity(JSContext *ctx, JSValue *tv, int argc, JSValue *argv);
JSValue js_native_render_item(JSContext *ctx, JSValue *tv, int argc, JSValue *argv);
JSValue js_native_is_paused(JSContext *ctx, JSValue *tv, int argc, JSValue *argv);
JSValue js_native_target_tps(JSContext *ctx, JSValue *tv, int argc, JSValue *argv);
JSValue js_native_selected_entity(JSContext *ctx, JSValue *tv, int argc, JSValue *argv);
JSValue js_native_render_entity_meta(JSContext *ctx, JSValue *tv, int argc, JSValue *argv);
JSValue js_native_render_inventory(JSContext *ctx, JSValue *tv, int argc, JSValue *argv);
JSValue js_native_render_clock(JSContext *ctx, JSValue *tv, int argc, JSValue *argv);
JSValue js_native_render_clear(JSContext *ctx, JSValue *tv, int argc, JSValue *argv);

/*
 * mqjs_stdlib.h is generated for the full Wagner JavaScript API and therefore
 * references native bindings that this compact host does not expose. The
 * game uses the smaller camelCase API registered below; keep the optional
 * legacy names defined so the generated stdlib remains linkable.
 */
#define JS_OPTIONAL_STUB(name) \
    JSValue name(JSContext *ctx, JSValue *tv, int argc, JSValue *argv) { return JS_UNDEFINED; }
JS_OPTIONAL_STUB(js_push)
JS_OPTIONAL_STUB(js_pop)
JS_OPTIONAL_STUB(js_translate)
JS_OPTIONAL_STUB(js_scale)
JS_OPTIONAL_STUB(js_rotate)
JS_OPTIONAL_STUB(js_no_fill)
JS_OPTIONAL_STUB(js_stroke)
JS_OPTIONAL_STUB(js_no_stroke)
JS_OPTIONAL_STUB(js_circle)
JS_OPTIONAL_STUB(js_triangle)
JS_OPTIONAL_STUB(js_line)
JS_OPTIONAL_STUB(js_pixel)
JS_OPTIONAL_STUB(js_rgba)
JS_OPTIONAL_STUB(js_play_tone)
JS_OPTIONAL_STUB(js_play_noise)
JS_OPTIONAL_STUB(js_load_image)
#undef JS_OPTIONAL_STUB

#include "mqjs_stdlib.h"

// ---------------------------------------------------------------------------
// JS heap and context
// ---------------------------------------------------------------------------
// The map generator keeps the world plus two 512x512 temporary arrays alive
// during setup. With MicroQuickJS arrays represented as boxed JS values, the
// three maps alone exceed four megabytes.
static uint8_t js_heap[16 * 1024 * 1024];
static JSContext *ctx = NULL;
static JSValue js_wagner_obj = JS_UNDEFINED;

static void report_exception(JSContext *ctx, JSValue res) {
    if (JS_IsException(res)) {
        JSValue exc = JS_GetException(ctx);
        JSCStringBuf buf;
        const char *str = JS_ToCString(ctx, exc, &buf);
        if (str) {
            strncpy(_wagner_rom.state.title, "JS ERROR: ", sizeof(_wagner_rom.state.title) - 1);
            strncpy(_wagner_rom.state.title + 10, str,
                    sizeof(_wagner_rom.state.title) - 11);
            _wagner_rom.state.title[sizeof(_wagner_rom.state.title) - 1] = '\0';
            Canvas c = _wagner_get_target();
            _wagner_fill(c, rgb(30, 0, 0));
            _wagner_text(c, "JS ERROR:", 4, 4, 1, rgb(255, 80, 80));
            _wagner_text(c, str, 4, 15, 1, rgb(255, 220, 0));
        }
    }
}

// ---------------------------------------------------------------------------
// Sprite cache
// ---------------------------------------------------------------------------
#define SPRITE_CACHE_SIZE 128
static struct { char name[64]; Image img; } sprite_cache[SPRITE_CACHE_SIZE];
static int sprite_cache_count = 0;

static Image get_sprite(const char *name) {
    for (int i = 0; i < sprite_cache_count; i++) {
        if (strcmp(sprite_cache[i].name, name) == 0) return sprite_cache[i].img;
    }
    Image img = load_image(name);
    if (img.pixels && sprite_cache_count < SPRITE_CACHE_SIZE) {
        strncpy(sprite_cache[sprite_cache_count].name, name, 63);
        sprite_cache[sprite_cache_count].name[63] = '\0';
        sprite_cache[sprite_cache_count].img = img;
        sprite_cache_count++;
    }
    return img;
}

// ---------------------------------------------------------------------------
// Color-substituted sprite draw (white→fg, black→bg)
// ---------------------------------------------------------------------------
static void draw_sprite_colored_impl(Canvas dst, Image img, int dx, int dy, int dw, int dh, pixel_t fg, pixel_t bg) {
    if (!img.pixels || dw <= 0 || dh <= 0) return;
    for (int row = 0; row < dh; row++) {
        for (int col = 0; col < dw; col++) {
            int sx = col * (int)img.width  / dw;
            int sy = row * (int)img.height / dh;
            Color src = _pixel_to_rgba(img, sy * img.stride + sx);
            if (src.a < 64) continue;
            int lum = (int)src.r + (int)src.g + (int)src.b;
            _wagner_set_pixel_raw(dst, dx + col, dy + row, (lum >= 384) ? fg : bg);
        }
    }
}

// ---------------------------------------------------------------------------
// JS C-function declarations
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// JS C-function implementations
// ---------------------------------------------------------------------------
JSValue js_draw_sprite(JSContext *ctx, JSValue *tv, int argc, JSValue *argv) {
    if (argc < 5) return JS_UNDEFINED;
    JSCStringBuf sb; const char *name = JS_ToCString(ctx, argv[0], &sb);
    int x=0,y=0,w=0,h=0;
    JS_ToInt32(ctx,&x,argv[1]); JS_ToInt32(ctx,&y,argv[2]);
    JS_ToInt32(ctx,&w,argv[3]); JS_ToInt32(ctx,&h,argv[4]);
    Image img = get_sprite(name ? name : "");
    Canvas c = _wagner_get_target();
    if (img.pixels) draw_sprite_colored_impl(c, img, x, y, w, h, rgb(255,255,255), rgb(0,0,0));
    return JS_UNDEFINED;
}

JSValue js_draw_sprite_colored(JSContext *ctx, JSValue *tv, int argc, JSValue *argv) {
    if (argc < 7) return JS_UNDEFINED;
    JSCStringBuf sb; const char *name = JS_ToCString(ctx, argv[0], &sb);
    int x=0,y=0,w=0,h=0,fg=0,bg=0;
    JS_ToInt32(ctx,&x,argv[1]); JS_ToInt32(ctx,&y,argv[2]);
    JS_ToInt32(ctx,&w,argv[3]); JS_ToInt32(ctx,&h,argv[4]);
    JS_ToInt32(ctx,&fg,argv[5]); JS_ToInt32(ctx,&bg,argv[6]);
    Image img = get_sprite(name ? name : "");
    Canvas c = _wagner_get_target();
    if (img.pixels) draw_sprite_colored_impl(c, img, x, y, w, h, (pixel_t)fg, (pixel_t)bg);
    return JS_UNDEFINED;
}

JSValue js_rect(JSContext *ctx, JSValue *tv, int argc, JSValue *argv) {
    if (argc < 5) return JS_UNDEFINED;
    int x=0,y=0,w=0,h=0,col=0;
    JS_ToInt32(ctx,&x,argv[0]); JS_ToInt32(ctx,&y,argv[1]);
    JS_ToInt32(ctx,&w,argv[2]); JS_ToInt32(ctx,&h,argv[3]);
    JS_ToInt32(ctx,&col,argv[4]);
    Canvas c = _wagner_get_target();
    _wagner_rect(c, x, y, w, h, (pixel_t)col);
    return JS_UNDEFINED;
}

JSValue js_text(JSContext *ctx, JSValue *tv, int argc, JSValue *argv) {
    if (argc < 4) return JS_UNDEFINED;
    JSCStringBuf sb; const char *text = JS_ToCString(ctx, argv[0], &sb);
    int x=0,y=0,col=0;
    JS_ToInt32(ctx,&x,argv[1]); JS_ToInt32(ctx,&y,argv[2]);
    JS_ToInt32(ctx,&col,argv[3]);
    Canvas c = _wagner_get_target();
    if (text) _wagner_text(c, text, x, y, 1, (pixel_t)col);
    return JS_UNDEFINED;
}

JSValue js_fill(JSContext *ctx, JSValue *tv, int argc, JSValue *argv) {
    int col = 0;
    if (argc > 0) JS_ToInt32(ctx, &col, argv[0]);
    Canvas c = _wagner_get_target();
    _wagner_fill(c, (pixel_t)col);
    return JS_UNDEFINED;
}

JSValue js_clear(JSContext *ctx, JSValue *tv, int argc, JSValue *argv) {
    Canvas c = _wagner_get_target();
    _wagner_fill(c, rgb(0, 0, 0));
    return JS_UNDEFINED;
}

JSValue js_rgb(JSContext *ctx, JSValue *tv, int argc, JSValue *argv) {
    int r=0,g=0,b=0;
    if (argc>0) JS_ToInt32(ctx,&r,argv[0]);
    if (argc>1) JS_ToInt32(ctx,&g,argv[1]);
    if (argc>2) JS_ToInt32(ctx,&b,argv[2]);
    return JS_NewInt32(ctx, (int32_t)rgb(r,g,b));
}

typedef struct {
    int active, x, y, motor;
    int fg, bg;
    float health, hunger, thirst, fatigue;
    char skin[64];
    char name[32], title[32], thought[64];
    int movement, diet, repro;
    int max_health, max_hunger, max_thirst, max_fatigue;
    int combat_flash;
} JSRenderEntity;

static JSRenderEntity js_render_entities[MAX_ENTITIES];
typedef struct {
    int active, x, y, fg, bg, count;
    char skin[64];
} JSRenderItem;
static JSRenderItem js_render_items[MAX_DROPPED_ITEMS];
typedef struct {
    int active, fg, bg, count;
    char skin[64];
} JSRenderInventory;
static JSRenderInventory js_render_inventory[MAX_ENTITIES][6];
typedef struct { int day, hour, minute, light; } JSRenderClock;
static JSRenderClock js_render_clock;

/* The renderer is the original C renderer, compiled into this host. */
#include "c_renderer.c"

JSValue js_native_map_generate(JSContext *ctx, JSValue *tv, int argc, JSValue *argv) {
    native_world_generate();
    return JS_UNDEFINED;
}

JSValue js_native_map_width(JSContext *ctx, JSValue *tv, int argc, JSValue *argv) {
    return JS_NewInt32(ctx, MAP_WIDTH);
}

JSValue js_native_map_height(JSContext *ctx, JSValue *tv, int argc, JSValue *argv) {
    return JS_NewInt32(ctx, MAP_HEIGHT);
}

JSValue js_native_map_tile(JSContext *ctx, JSValue *tv, int argc, JSValue *argv) {
    int x = -1, y = -1;
    if (argc > 0) JS_ToInt32(ctx, &x, argv[0]);
    if (argc > 1) JS_ToInt32(ctx, &y, argv[1]);
    if (x < 0 || x >= MAP_WIDTH || y < 0 || y >= MAP_HEIGHT)
        return JS_NewInt32(ctx, VOID_TILE);
    return JS_NewInt32(ctx, native_world_tile(x, y));
}

JSValue js_native_map_walkable(JSContext *ctx, JSValue *tv, int argc, JSValue *argv) {
    int x = 0, y = 0, movement = MOVE_WALK;
    if (argc > 0) JS_ToInt32(ctx, &x, argv[0]);
    if (argc > 1) JS_ToInt32(ctx, &y, argv[1]);
    if (argc > 2) JS_ToInt32(ctx, &movement, argv[2]);
    return JS_NewBool(native_world_walkable(x, y, movement));
}

JSValue js_native_find_path(JSContext *ctx, JSValue *tv, int argc, JSValue *argv) {
    int sx = 0, sy = 0, gx = 0, gy = 0, movement = MOVE_WALK;
    if (argc > 0) JS_ToInt32(ctx, &sx, argv[0]);
    if (argc > 1) JS_ToInt32(ctx, &sy, argv[1]);
    if (argc > 2) JS_ToInt32(ctx, &gx, argv[2]);
    if (argc > 3) JS_ToInt32(ctx, &gy, argv[3]);
    if (argc > 4) JS_ToInt32(ctx, &movement, argv[4]);
    NativeGridPos path[NATIVE_MAX_PATH];
    int count = native_world_find_path(sx, sy, gx, gy, movement,
                                       path, NATIVE_MAX_PATH);
    JSValue result = JS_NewArray(ctx, (uint32_t)(count > 0 ? count : 0));
    for (int i = 0; i < count; i++) {
        JSValue node = JS_NewObject(ctx);
        JS_SetPropertyStr(ctx, node, "x", JS_NewInt32(ctx, path[i].x));
        JS_SetPropertyStr(ctx, node, "y", JS_NewInt32(ctx, path[i].y));
        JS_SetPropertyUint32(ctx, result, (uint32_t)i, node);
    }
    return result;
}

JSValue js_native_find_water(JSContext *ctx, JSValue *tv, int argc, JSValue *argv) {
    int sx = 0, sy = 0, movement = MOVE_WALK, radius = 30;
    if (argc > 0) JS_ToInt32(ctx, &sx, argv[0]);
    if (argc > 1) JS_ToInt32(ctx, &sy, argv[1]);
    if (argc > 2) JS_ToInt32(ctx, &movement, argv[2]);
    if (argc > 3) JS_ToInt32(ctx, &radius, argv[3]);
    NativeGridPos pos;
    if (!native_world_find_water(sx, sy, movement, radius, &pos)) return JS_NULL;
    JSValue result = JS_NewObject(ctx);
    JS_SetPropertyStr(ctx, result, "x", JS_NewInt32(ctx, pos.x));
    JS_SetPropertyStr(ctx, result, "y", JS_NewInt32(ctx, pos.y));
    return result;
}

JSValue js_native_render_clear(JSContext *ctx, JSValue *tv, int argc, JSValue *argv) {
    memset(js_render_entities, 0, sizeof(js_render_entities));
    memset(js_render_items, 0, sizeof(js_render_items));
    memset(js_render_inventory, 0, sizeof(js_render_inventory));
    memset(&js_render_clock, 0, sizeof(js_render_clock));
    return JS_UNDEFINED;
}

JSValue js_native_render_item(JSContext *ctx, JSValue *tv, int argc, JSValue *argv) {
    if (argc < 8) return JS_UNDEFINED;
    int index = -1;
    JS_ToInt32(ctx, &index, argv[0]);
    if (index < 0 || index >= MAX_DROPPED_ITEMS) return JS_UNDEFINED;
    JSRenderItem *item = &js_render_items[index];
    JS_ToInt32(ctx, &item->active, argv[1]);
    JS_ToInt32(ctx, &item->x, argv[2]);
    JS_ToInt32(ctx, &item->y, argv[3]);
    JS_ToInt32(ctx, &item->fg, argv[4]);
    JS_ToInt32(ctx, &item->bg, argv[5]);
    JS_ToInt32(ctx, &item->count, argv[6]);
    JSCStringBuf sb;
    const char *skin = JS_ToCString(ctx, argv[7], &sb);
    if (skin) strncpy(item->skin, skin, sizeof(item->skin) - 1);
    item->skin[sizeof(item->skin) - 1] = '\0';
    return JS_UNDEFINED;
}

JSValue js_native_render_entity_meta(JSContext *ctx, JSValue *tv, int argc, JSValue *argv) {
    if (argc < 12) return JS_UNDEFINED;
    int index = -1;
    JS_ToInt32(ctx, &index, argv[0]);
    if (index < 0 || index >= MAX_ENTITIES) return JS_UNDEFINED;
    JSRenderEntity *e = &js_render_entities[index];
    JSCStringBuf a, b, c;
    const char *name = JS_ToCString(ctx, argv[1], &a);
    const char *title = JS_ToCString(ctx, argv[2], &b);
    const char *thought = JS_ToCString(ctx, argv[3], &c);
    if (name) strncpy(e->name, name, sizeof(e->name) - 1);
    if (title) strncpy(e->title, title, sizeof(e->title) - 1);
    if (thought) strncpy(e->thought, thought, sizeof(e->thought) - 1);
    JS_ToInt32(ctx, &e->movement, argv[4]);
    JS_ToInt32(ctx, &e->diet, argv[5]);
    JS_ToInt32(ctx, &e->repro, argv[6]);
    int value = 0;
    JS_ToInt32(ctx, &value, argv[7]); e->max_health = value;
    JS_ToInt32(ctx, &value, argv[8]); e->max_hunger = value;
    JS_ToInt32(ctx, &value, argv[9]); e->max_thirst = value;
    JS_ToInt32(ctx, &value, argv[10]); e->max_fatigue = value;
    JS_ToInt32(ctx, &e->combat_flash, argv[11]);
    return JS_UNDEFINED;
}

JSValue js_native_render_inventory(JSContext *ctx, JSValue *tv, int argc, JSValue *argv) {
    if (argc < 7) return JS_UNDEFINED;
    int index = -1, slot = -1;
    JS_ToInt32(ctx, &index, argv[0]);
    JS_ToInt32(ctx, &slot, argv[1]);
    if (index < 0 || index >= MAX_ENTITIES || slot < 0 || slot >= 6) return JS_UNDEFINED;
    JSRenderInventory *item = &js_render_inventory[index][slot];
    JS_ToInt32(ctx, &item->active, argv[2]);
    JS_ToInt32(ctx, &item->fg, argv[3]);
    JS_ToInt32(ctx, &item->bg, argv[4]);
    JS_ToInt32(ctx, &item->count, argv[5]);
    JSCStringBuf sb;
    const char *skin = JS_ToCString(ctx, argv[6], &sb);
    if (skin) strncpy(item->skin, skin, sizeof(item->skin) - 1);
    item->skin[sizeof(item->skin) - 1] = '\0';
    return JS_UNDEFINED;
}

JSValue js_native_render_clock(JSContext *ctx, JSValue *tv, int argc, JSValue *argv) {
    if (argc < 4) return JS_UNDEFINED;
    JS_ToInt32(ctx, &js_render_clock.day, argv[0]);
    JS_ToInt32(ctx, &js_render_clock.hour, argv[1]);
    JS_ToInt32(ctx, &js_render_clock.minute, argv[2]);
    JS_ToInt32(ctx, &js_render_clock.light, argv[3]);
    return JS_UNDEFINED;
}

JSValue js_native_is_paused(JSContext *ctx, JSValue *tv, int argc, JSValue *argv) {
    return JS_NewBool(c_renderer_is_paused());
}

JSValue js_native_target_tps(JSContext *ctx, JSValue *tv, int argc, JSValue *argv) {
    return JS_NewInt32(ctx, c_renderer_target_tps());
}

JSValue js_native_selected_entity(JSContext *ctx, JSValue *tv, int argc, JSValue *argv) {
    return JS_NewInt32(ctx, c_renderer_selected_entity());
}

JSValue js_native_render_entity(JSContext *ctx, JSValue *tv, int argc, JSValue *argv) {
    if (argc < 12) return JS_UNDEFINED;
    int index = -1;
    JS_ToInt32(ctx, &index, argv[0]);
    if (index < 0 || index >= MAX_ENTITIES) return JS_UNDEFINED;
    JSRenderEntity *e = &js_render_entities[index];
    JS_ToInt32(ctx, &e->active, argv[1]);
    JS_ToInt32(ctx, &e->x, argv[2]);
    JS_ToInt32(ctx, &e->y, argv[3]);
    JS_ToInt32(ctx, &e->motor, argv[4]);
    JS_ToInt32(ctx, &e->fg, argv[5]);
    JS_ToInt32(ctx, &e->bg, argv[6]);
    int stat = 0;
    JS_ToInt32(ctx, &stat, argv[7]); e->health = (float)stat;
    JS_ToInt32(ctx, &stat, argv[8]); e->hunger = (float)stat;
    JS_ToInt32(ctx, &stat, argv[9]); e->thirst = (float)stat;
    JS_ToInt32(ctx, &stat, argv[10]); e->fatigue = (float)stat;
    JSCStringBuf sb;
    const char *skin = JS_ToCString(ctx, argv[11], &sb);
    if (skin) strncpy(e->skin, skin, sizeof(e->skin) - 1);
    e->skin[sizeof(e->skin) - 1] = '\0';

    return JS_UNDEFINED;
}

// ---------------------------------------------------------------------------
// Setup: initialize JS, load game.js, call JS setup()
// ---------------------------------------------------------------------------
static bool _prev_mouse_down = false;

void setup() {
    w_setup(&_wagner_rom.state, WAGNER_TITLE, WAGNER_CFG_W, WAGNER_CFG_H, WAGNER_CFG_BPP, WAGNER_CFG_SCALE);
    c_renderer_preload();

    ctx = JS_NewContext(js_heap, sizeof(js_heap), &js_stdlib);
    if (!ctx) return;

    JSValue global = JS_GetGlobalObject(ctx);

    // Color constants (pre-computed with pixel())
#define REG_COLOR(name, r, g, b) JS_SetPropertyStr(ctx, global, name, JS_NewInt32(ctx, (int32_t)rgb(r,g,b)))
    REG_COLOR("WHITE",   255,255,255); REG_COLOR("BLACK",   0,0,0);
    REG_COLOR("RED",     255,0,0);     REG_COLOR("GREEN",   0,200,0);
    REG_COLOR("BLUE",    0,0,255);     REG_COLOR("YELLOW",  255,255,0);
    REG_COLOR("CYAN",    0,255,255);   REG_COLOR("MAGENTA", 255,0,255);
    REG_COLOR("ORANGE",  255,128,0);   REG_COLOR("GRAY",    128,128,128);
    REG_COLOR("PURPLE",  128,0,200);   REG_COLOR("LIME",    128,255,0);
#undef REG_COLOR

    // Key constants
#define REG_KEY(name, val) JS_SetPropertyStr(ctx, global, name, JS_NewInt32(ctx, val))
    REG_KEY("KEY_A", KEY_A); REG_KEY("KEY_B", KEY_B);
    REG_KEY("KEY_C", KEY_C); REG_KEY("KEY_D", KEY_D);
    REG_KEY("KEY_E", KEY_E); REG_KEY("KEY_Q", KEY_Q);
    REG_KEY("KEY_R", KEY_R); REG_KEY("KEY_S", KEY_S);
    REG_KEY("KEY_W", KEY_W); REG_KEY("KEY_TAB", KEY_TAB);
    REG_KEY("KEY_SPACE", KEY_SPACE);
    REG_KEY("KEY_UP", KEY_UP); REG_KEY("KEY_DOWN", KEY_DOWN);
    REG_KEY("KEY_LEFT", KEY_LEFT); REG_KEY("KEY_RIGHT", KEY_RIGHT);
    REG_KEY("KEY_KP_PLUS", KEY_KP_PLUS);
    REG_KEY("KEY_KP_MINUS", KEY_KP_MINUS);
#undef REG_KEY

    // wagner object (input state, updated each frame in draw())
    js_wagner_obj = JS_NewObject(ctx);
    JS_SetPropertyStr(ctx, js_wagner_obj, "width",       JS_NewInt32(ctx, (int)w_width));
    JS_SetPropertyStr(ctx, js_wagner_obj, "height",      JS_NewInt32(ctx, (int)w_height));
    JS_SetPropertyStr(ctx, js_wagner_obj, "dt",          JS_NewFloat64(ctx, 0.0));
    JS_SetPropertyStr(ctx, js_wagner_obj, "mouseX",      JS_NewInt32(ctx, 0));
    JS_SetPropertyStr(ctx, js_wagner_obj, "mouseY",      JS_NewInt32(ctx, 0));
    JS_SetPropertyStr(ctx, js_wagner_obj, "mouseDown",   JS_NewBool(0));
    JS_SetPropertyStr(ctx, js_wagner_obj, "mousePressed",JS_NewBool(0));
    JS_SetPropertyStr(ctx, js_wagner_obj, "mouseWheel",  JS_NewInt32(ctx, 0));
    JS_SetPropertyStr(ctx, js_wagner_obj, "frameCount",  JS_NewInt32(ctx, 0));
    // keys array
    JSValue keys = JS_NewArray(ctx, 256);
    for (int i = 0; i < 256; i++) JS_SetPropertyUint32(ctx, keys, i, JS_NewBool(0));
    JS_SetPropertyStr(ctx, js_wagner_obj, "keys", keys);
    JS_SetPropertyStr(ctx, global, "wagner", js_wagner_obj);

    // Load game.js from embedded assets
    const char *code = NULL; unsigned int code_len = 0;
    for (int i = 0; i < WAGNER_ASSET_COUNT; i++) {
        if (strcmp(WAGNER_ASSETS[i].path, "game.js") == 0) {
            code     = (const char *)WAGNER_ASSETS[i].data;
            code_len = WAGNER_ASSETS[i].size > 0 ? WAGNER_ASSETS[i].size - 1 : 0;
            break;
        }
    }
    if (code) {
        JSValue res = JS_Eval(ctx, code, code_len, "game.js", 0);
        report_exception(ctx, res);
    }

    // Call JS setup()
    JSValue fn = JS_GetPropertyStr(ctx, global, "setup");
    if (JS_IsFunction(ctx, fn) && !JS_StackCheck(ctx, 2)) {
        JS_PushArg(ctx, fn);
        JS_PushArg(ctx, JS_NULL);
        JSValue res = JS_Call(ctx, 0);
        report_exception(ctx, res);
        c_renderer_draw();
    }
}

// ---------------------------------------------------------------------------
// Draw: update input state, call JS draw()
// ---------------------------------------------------------------------------
void draw() {
    if (!ctx) return;

    bool cur_down = W_MOUSE_LEFT(&_wagner_rom.state);
    bool pressed  = cur_down && !_prev_mouse_down;
    _prev_mouse_down = cur_down;

    JSValue global = JS_GetGlobalObject(ctx);
    JSValue wag = JS_GetPropertyStr(ctx, global, "wagner");

    JS_SetPropertyStr(ctx, wag, "dt",           JS_NewFloat64(ctx, 1.0/60.0));
    JS_SetPropertyStr(ctx, wag, "mouseX",       JS_NewInt32(ctx, (int)_wagner_rom.state.mouse_x));
    JS_SetPropertyStr(ctx, wag, "mouseY",       JS_NewInt32(ctx, (int)_wagner_rom.state.mouse_y));
    JS_SetPropertyStr(ctx, wag, "mouseDown",    JS_NewBool(cur_down ? 1 : 0));
    JS_SetPropertyStr(ctx, wag, "mousePressed", JS_NewBool(pressed  ? 1 : 0));
    JS_SetPropertyStr(ctx, wag, "mouseWheel",   JS_NewInt32(ctx, (int8_t)_wagner_rom.state.mouse_wheel));
    JS_SetPropertyStr(ctx, wag, "frameCount",   JS_NewInt32(ctx, (int)w_ticks));

    JSValue keys = JS_GetPropertyStr(ctx, wag, "keys");
    for (int i = 0; i < 256; i++) {
        JS_SetPropertyUint32(ctx, keys, i, JS_NewBool(_wagner_rom.state.keys[i] ? 1 : 0));
    }

    JSValue fn = JS_GetPropertyStr(ctx, global, "tick");
    if (JS_IsFunction(ctx, fn) && !JS_StackCheck(ctx, 2)) {
        JS_PushArg(ctx, fn);
        JS_PushArg(ctx, JS_NULL);
        JSValue res = JS_Call(ctx, 0);
        report_exception(ctx, res);
        c_renderer_draw();
    }
}
