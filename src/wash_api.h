#ifndef WASH_API_H
#define WASH_API_H

#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>

#ifndef NULL
#define NULL ((void*)0)
#endif

// ---------------------------------------------------------------------------
// 32-bit RGBA Color Utilities (Little-Endian: R in byte 0, G in 1, B in 2, A in 3)
// ---------------------------------------------------------------------------

typedef uint32_t ColorRGBA;

static inline ColorRGBA rgba(uint8_t r, uint8_t g, uint8_t b, uint8_t a) {
    return ((uint32_t)a << 24) | ((uint32_t)b << 16) | ((uint32_t)g << 8) | (uint32_t)r;
}

#define RGB(r, g, b) ((ColorRGBA)(((uint32_t)255 << 24) | ((uint32_t)(b) << 16) | ((uint32_t)(g) << 8) | (uint32_t)(r)))

static inline ColorRGBA rgb(uint8_t r, uint8_t g, uint8_t b) {
    return rgba(r, g, b, 255);
}

static inline uint8_t color_r(ColorRGBA c) { return (uint8_t)(c & 0xFF); }
static inline uint8_t color_g(ColorRGBA c) { return (uint8_t)((c >> 8) & 0xFF); }
static inline uint8_t color_b(ColorRGBA c) { return (uint8_t)((c >> 16) & 0xFF); }
static inline uint8_t color_a(ColorRGBA c) { return (uint8_t)((c >> 24) & 0xFF); }

static inline ColorRGBA color_lerp(ColorRGBA c1, ColorRGBA c2, float t) {
    if (t <= 0.0f) return c1;
    if (t >= 1.0f) return c2;
    int r = (int)(color_r(c1) + (color_r(c2) - color_r(c1)) * t);
    int g = (int)(color_g(c1) + (color_g(c2) - color_g(c1)) * t);
    int b = (int)(color_b(c1) + (color_b(c2) - color_b(c1)) * t);
    int a = (int)(color_a(c1) + (color_a(c2) - color_a(c1)) * t);
    return rgba((uint8_t)(r < 0 ? 0 : (r > 255 ? 255 : r)),
                (uint8_t)(g < 0 ? 0 : (g > 255 ? 255 : g)),
                (uint8_t)(b < 0 ? 0 : (b > 255 ? 255 : b)),
                (uint8_t)(a < 0 ? 0 : (a > 255 ? 255 : a)));
}

static inline ColorRGBA color_scale(ColorRGBA c, float s) {
    if (s <= 0.0f) return rgba(0, 0, 0, color_a(c));
    int r = (int)(color_r(c) * s);
    int g = (int)(color_g(c) * s);
    int b = (int)(color_b(c) * s);
    return rgba((uint8_t)(r > 255 ? 255 : r),
                (uint8_t)(g > 255 ? 255 : g),
                (uint8_t)(b > 255 ? 255 : b),
                color_a(c));
}

// ---------------------------------------------------------------------------
// Image / Texture Structure
// ---------------------------------------------------------------------------

typedef struct {
    uint8_t* pixels; // RGBA buffer (4 bytes per pixel)
    int width;
    int height;
    int stride;      // in pixels
    int bpp;         // 32
} Image;

// ---------------------------------------------------------------------------
// Fast Math Helpers
// ---------------------------------------------------------------------------

#define CLAMP(v, min_v, max_v) ((v) < (min_v) ? (min_v) : ((v) > (max_v) ? (max_v) : (v)))
#define MIN(a, b) ((a) < (b) ? (a) : (b))
#define MAX(a, b) ((a) > (b) ? (a) : (b))

static inline float f_abs(float x) { return x < 0.0f ? -x : x; }
static inline float f_clamp(float x, float a, float b) { return x < a ? a : (x > b ? b : x); }

#endif // WASH_API_H
