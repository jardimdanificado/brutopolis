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
#include "mquickjs/mquickjs.h"

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

#include "mquickjs/mqjs_stdlib.h"

// ---------------------------------------------------------------------------
// JS heap and context
// ---------------------------------------------------------------------------
static uint8_t js_heap[1024 * 1024]; // 1MB heap for JS
static JSContext *ctx = NULL;
static JSValue js_wagner_obj = JS_UNDEFINED;

static void report_exception(JSContext *ctx, JSValue res) {
    if (JS_IsException(res)) {
        JSValue exc = JS_GetException(ctx);
        JSCStringBuf buf;
        const char *str = JS_ToCString(ctx, exc, &buf);
        if (str) {
            Canvas c = canvas(w_vram, w_width, w_height, w_bpp);
            olivec_fill(c, pixel(30, 0, 0));
            draw_text(c, "JS ERROR:", 4, 4, pixel(255, 80, 80));
            draw_text(c, str, 4, 15, pixel(255, 220, 0));
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
            uint32_t px32 = ((uint32_t *)img.pixels)[sy * img.width + sx];
            uint8_t r = (px32 >>  0) & 0xFF;
            uint8_t g = (px32 >>  8) & 0xFF;
            uint8_t b = (px32 >> 16) & 0xFF;
            uint8_t a = (px32 >> 24) & 0xFF;
            if (a < 64) continue;
            int lum = (int)r + (int)g + (int)b;
            olivec_pixel(dst, dx + col, dy + row, (lum >= 384) ? fg : bg);
        }
    }
}

// ---------------------------------------------------------------------------
// JS C-function declarations
// ---------------------------------------------------------------------------
JSValue js_drawSprite(JSContext *ctx, JSValue *tv, int argc, JSValue *argv);
JSValue js_drawSpriteColored(JSContext *ctx, JSValue *tv, int argc, JSValue *argv);
JSValue js_drawBox(JSContext *ctx, JSValue *tv, int argc, JSValue *argv);
JSValue js_drawText(JSContext *ctx, JSValue *tv, int argc, JSValue *argv);
JSValue js_fill(JSContext *ctx, JSValue *tv, int argc, JSValue *argv);
JSValue js_rgb_fn(JSContext *ctx, JSValue *tv, int argc, JSValue *argv);

// ---------------------------------------------------------------------------
// JS C-function implementations
// ---------------------------------------------------------------------------
JSValue js_drawSprite(JSContext *ctx, JSValue *tv, int argc, JSValue *argv) {
    if (argc < 5) return JS_UNDEFINED;
    JSCStringBuf sb; const char *name = JS_ToCString(ctx, argv[0], &sb);
    int x=0,y=0,w=0,h=0;
    JS_ToInt32(ctx,&x,argv[1]); JS_ToInt32(ctx,&y,argv[2]);
    JS_ToInt32(ctx,&w,argv[3]); JS_ToInt32(ctx,&h,argv[4]);
    Image img = get_sprite(name ? name : "");
    Canvas c = canvas(w_vram, w_width, w_height, w_bpp);
    if (img.pixels) draw_sprite_colored_impl(c, img, x, y, w, h, pixel(255,255,255), pixel(0,0,0));
    return JS_UNDEFINED;
}

JSValue js_drawSpriteColored(JSContext *ctx, JSValue *tv, int argc, JSValue *argv) {
    if (argc < 7) return JS_UNDEFINED;
    JSCStringBuf sb; const char *name = JS_ToCString(ctx, argv[0], &sb);
    int x=0,y=0,w=0,h=0,fg=0,bg=0;
    JS_ToInt32(ctx,&x,argv[1]); JS_ToInt32(ctx,&y,argv[2]);
    JS_ToInt32(ctx,&w,argv[3]); JS_ToInt32(ctx,&h,argv[4]);
    JS_ToInt32(ctx,&fg,argv[5]); JS_ToInt32(ctx,&bg,argv[6]);
    Image img = get_sprite(name ? name : "");
    Canvas c = canvas(w_vram, w_width, w_height, w_bpp);
    if (img.pixels) draw_sprite_colored_impl(c, img, x, y, w, h, (pixel_t)fg, (pixel_t)bg);
    return JS_UNDEFINED;
}

JSValue js_drawBox(JSContext *ctx, JSValue *tv, int argc, JSValue *argv) {
    if (argc < 5) return JS_UNDEFINED;
    int x=0,y=0,w=0,h=0,col=0;
    JS_ToInt32(ctx,&x,argv[0]); JS_ToInt32(ctx,&y,argv[1]);
    JS_ToInt32(ctx,&w,argv[2]); JS_ToInt32(ctx,&h,argv[3]);
    JS_ToInt32(ctx,&col,argv[4]);
    Canvas c = canvas(w_vram, w_width, w_height, w_bpp);
    olivec_rect(c, x, y, w, h, (pixel_t)col);
    return JS_UNDEFINED;
}

JSValue js_drawText(JSContext *ctx, JSValue *tv, int argc, JSValue *argv) {
    if (argc < 4) return JS_UNDEFINED;
    JSCStringBuf sb; const char *text = JS_ToCString(ctx, argv[0], &sb);
    int x=0,y=0,col=0;
    JS_ToInt32(ctx,&x,argv[1]); JS_ToInt32(ctx,&y,argv[2]);
    JS_ToInt32(ctx,&col,argv[3]);
    Canvas c = canvas(w_vram, w_width, w_height, w_bpp);
    if (text) draw_text(c, text, x, y, (pixel_t)col);
    return JS_UNDEFINED;
}

JSValue js_fill(JSContext *ctx, JSValue *tv, int argc, JSValue *argv) {
    int col = 0;
    if (argc > 0) JS_ToInt32(ctx, &col, argv[0]);
    Canvas c = canvas(w_vram, w_width, w_height, w_bpp);
    olivec_fill(c, (pixel_t)col);
    return JS_UNDEFINED;
}

JSValue js_rgb_fn(JSContext *ctx, JSValue *tv, int argc, JSValue *argv) {
    int r=0,g=0,b=0;
    if (argc>0) JS_ToInt32(ctx,&r,argv[0]);
    if (argc>1) JS_ToInt32(ctx,&g,argv[1]);
    if (argc>2) JS_ToInt32(ctx,&b,argv[2]);
    return JS_NewInt32(ctx, (int32_t)pixel(r,g,b));
}

// ---------------------------------------------------------------------------
// Setup: initialize JS, load game.js, call JS setup()
// ---------------------------------------------------------------------------
static bool _prev_mouse_down = false;

void setup() {
    w_setup(&_wagner_rom.state, WAGNER_TITLE, WAGNER_CFG_W, WAGNER_CFG_H, WAGNER_CFG_BPP, WAGNER_CFG_SCALE);

    ctx = JS_NewContext(js_heap, sizeof(js_heap), &js_stdlib);
    if (!ctx) return;

    JSValue global = JS_GetGlobalObject(ctx);

    // Color constants (pre-computed with pixel())
#define REG_COLOR(name, r, g, b) JS_SetPropertyStr(ctx, global, name, JS_NewInt32(ctx, (int32_t)pixel(r,g,b)))
    REG_COLOR("WHITE",   255,255,255); REG_COLOR("BLACK",   0,0,0);
    REG_COLOR("RED",     255,0,0);     REG_COLOR("GREEN",   0,200,0);
    REG_COLOR("BLUE",    0,0,255);     REG_COLOR("YELLOW",  255,255,0);
    REG_COLOR("CYAN",    0,255,255);   REG_COLOR("MAGENTA", 255,0,255);
    REG_COLOR("ORANGE",  255,128,0);   REG_COLOR("GRAY",    128,128,128);
    REG_COLOR("PURPLE",  128,0,200);   REG_COLOR("LIME",    128,255,0);
#undef REG_COLOR

    // Key constants
#define REG_KEY(name, val) JS_SetPropertyStr(ctx, global, name, JS_NewInt32(ctx, val))
    REG_KEY("KEY_A", W_SCANCODE_A); REG_KEY("KEY_B", W_SCANCODE_B);
    REG_KEY("KEY_C", W_SCANCODE_C); REG_KEY("KEY_D", W_SCANCODE_D);
    REG_KEY("KEY_E", W_SCANCODE_E); REG_KEY("KEY_Q", W_SCANCODE_Q);
    REG_KEY("KEY_R", W_SCANCODE_R); REG_KEY("KEY_S", W_SCANCODE_S);
    REG_KEY("KEY_W", W_SCANCODE_W); REG_KEY("KEY_TAB",   W_SCANCODE_TAB);
    REG_KEY("KEY_SPACE", W_SCANCODE_SPACE);
    REG_KEY("KEY_UP",    W_SCANCODE_UP);    REG_KEY("KEY_DOWN",  W_SCANCODE_DOWN);
    REG_KEY("KEY_LEFT",  W_SCANCODE_LEFT);  REG_KEY("KEY_RIGHT", W_SCANCODE_RIGHT);
    REG_KEY("KEY_KP_PLUS",  W_SCANCODE_KP_PLUS);
    REG_KEY("KEY_KP_MINUS", W_SCANCODE_KP_MINUS);
#undef REG_KEY

    // C functions exposed to JS
#define REG_FN(name, fn, nargs) JS_SetPropertyStr(ctx, global, name, JS_NewCFunction(ctx, (JSCFunctionType)fn, name, nargs))
    REG_FN("drawSprite",        js_drawSprite,        5);
    REG_FN("drawSpriteColored", js_drawSpriteColored, 7);
    REG_FN("drawBox",           js_drawBox,           5);
    REG_FN("drawText",          js_drawText,          4);
    REG_FN("fill",              js_fill,              1);
    REG_FN("clear",             js_fill,              0);
    REG_FN("rgb",               js_rgb_fn,            3);
#undef REG_FN

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
    JSValue keys = JS_NewArray(ctx);
    for (int i = 0; i < 256; i++) JS_SetPropertyUint32(ctx, keys, i, JS_NewBool(0));
    JS_SetPropertyStr(ctx, js_wagner_obj, "keys", keys);
    JS_SetPropertyStr(ctx, global, "wagner", js_wagner_obj);

    // Load game.js from embedded assets
    const char *code = NULL; unsigned int code_len = 0;
    for (int i = 0; i < WAGNER_ASSET_COUNT; i++) {
        if (strcmp(WAGNER_ASSETS[i].path, "game.js") == 0) {
            code     = (const char *)WAGNER_ASSETS[i].data;
            code_len = WAGNER_ASSETS[i].size;
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
    JS_SetPropertyStr(ctx, wag, "mouseWheel",   JS_NewInt32(ctx, (int8_t)_wagner_rom.state.mouse_wheel_delta));
    JS_SetPropertyStr(ctx, wag, "frameCount",   JS_NewInt32(ctx, (int)w_ticks));

    JSValue keys = JS_GetPropertyStr(ctx, wag, "keys");
    for (int i = 0; i < 256; i++) {
        JS_SetPropertyUint32(ctx, keys, i, JS_NewBool(_wagner_rom.state.keys[i] ? 1 : 0));
    }
    JS_FreeValue(ctx, keys);
    JS_FreeValue(ctx, wag);

    JSValue fn = JS_GetPropertyStr(ctx, global, "draw");
    if (JS_IsFunction(ctx, fn) && !JS_StackCheck(ctx, 2)) {
        JS_PushArg(ctx, fn);
        JS_PushArg(ctx, JS_NULL);
        JSValue res = JS_Call(ctx, 0);
        report_exception(ctx, res);
    }
}
