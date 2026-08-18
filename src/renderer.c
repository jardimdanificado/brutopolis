#include "renderer.h"
#include "world_gen.h"
#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>

// Forward declaration of lodepng decode
unsigned lodepng_decode32(unsigned char** out, unsigned* w, unsigned* h,
                          const unsigned char* in, size_t insize);

#include "assets.h"

// ---------------------------------------------------------------------------
// Embedded 8x8 ASCII Font (Characters 32 ' ' through 126 '~')
// ---------------------------------------------------------------------------

static const uint8_t FONT_8X8[95][8] = {
    {0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00}, // ' ' (32)
    {0x18,0x3c,0x3c,0x18,0x18,0x00,0x18,0x00}, // '!'
    {0x66,0x66,0x24,0x00,0x00,0x00,0x00,0x00}, // '"'
    {0x6c,0x6c,0xfe,0x6c,0xfe,0x6c,0x6c,0x00}, // '#'
    {0x18,0x3e,0x60,0x3c,0x06,0x7c,0x18,0x00}, // '$'
    {0x00,0x66,0xa6,0xd4,0x2b,0x65,0x66,0x00}, // '%'
    {0x38,0x6c,0x38,0x76,0xdc,0xcc,0x76,0x00}, // '&'
    {0x18,0x18,0x30,0x00,0x00,0x00,0x00,0x00}, // '''
    {0x0c,0x18,0x30,0x30,0x30,0x18,0x0c,0x00}, // '('
    {0x30,0x18,0x0c,0x0c,0x0c,0x18,0x30,0x00}, // ')'
    {0x00,0x66,0x3c,0xff,0x3c,0x66,0x00,0x00}, // '*'
    {0x00,0x18,0x18,0x7e,0x18,0x18,0x00,0x00}, // '+'
    {0x00,0x00,0x00,0x00,0x00,0x18,0x18,0x30}, // ','
    {0x00,0x00,0x00,0x7e,0x00,0x00,0x00,0x00}, // '-'
    {0x00,0x00,0x00,0x00,0x00,0x18,0x18,0x00}, // '.'
    {0x06,0x0c,0x18,0x30,0x60,0xc0,0x80,0x00}, // '/'
    {0x3c,0x66,0x6e,0x76,0x66,0x66,0x3c,0x00}, // '0' (48)
    {0x18,0x38,0x18,0x18,0x18,0x18,0x7e,0x00}, // '1'
    {0x3c,0x66,0x06,0x1c,0x30,0x60,0x7e,0x00}, // '2'
    {0x3c,0x66,0x06,0x1c,0x06,0x66,0x3c,0x00}, // '3'
    {0x0c,0x1c,0x34,0x64,0x7e,0x04,0x0e,0x00}, // '4'
    {0x7e,0x60,0x7c,0x06,0x06,0x66,0x3c,0x00}, // '5'
    {0x1c,0x30,0x60,0x7c,0x66,0x66,0x3c,0x00}, // '6'
    {0x7e,0xc6,0x0c,0x18,0x30,0x30,0x30,0x00}, // '7'
    {0x3c,0x66,0x66,0x3c,0x66,0x66,0x3c,0x00}, // '8'
    {0x3c,0x66,0x66,0x3e,0x06,0x0c,0x38,0x00}, // '9'
    {0x00,0x18,0x18,0x00,0x00,0x18,0x18,0x00}, // ':'
    {0x00,0x18,0x18,0x00,0x00,0x18,0x18,0x30}, // ';'
    {0x0c,0x18,0x30,0x60,0x30,0x18,0x0c,0x00}, // '<'
    {0x00,0x00,0x7e,0x00,0x7e,0x00,0x00,0x00}, // '='
    {0x30,0x18,0x0c,0x06,0x0c,0x18,0x30,0x00}, // '>'
    {0x3c,0x66,0x06,0x0c,0x18,0x00,0x18,0x00}, // '?'
    {0x3c,0x66,0x6e,0x6e,0x60,0x62,0x3c,0x00}, // '@' (64)
    {0x18,0x3c,0x66,0x7e,0x66,0x66,0x66,0x00}, // 'A'
    {0x7c,0x66,0x66,0x7c,0x66,0x66,0x7c,0x00}, // 'B'
    {0x3c,0x66,0x60,0x60,0x60,0x66,0x3c,0x00}, // 'C'
    {0x78,0x6c,0x66,0x66,0x66,0x6c,0x78,0x00}, // 'D'
    {0x7e,0x60,0x60,0x7c,0x60,0x60,0x7e,0x00}, // 'E'
    {0x7e,0x60,0x60,0x7c,0x60,0x60,0x60,0x00}, // 'F'
    {0x3c,0x66,0x60,0x6e,0x66,0x66,0x3a,0x00}, // 'G'
    {0x66,0x66,0x66,0x7e,0x66,0x66,0x66,0x00}, // 'H'
    {0x3c,0x18,0x18,0x18,0x18,0x18,0x3c,0x00}, // 'I'
    {0x1e,0x0c,0x0c,0x0c,0x0c,0x6c,0x38,0x00}, // 'J'
    {0x66,0x6c,0x78,0x70,0x78,0x6c,0x66,0x00}, // 'K'
    {0x60,0x60,0x60,0x60,0x60,0x60,0x7e,0x00}, // 'L'
    {0x63,0x77,0x7f,0x6b,0x63,0x63,0x63,0x00}, // 'M'
    {0x66,0x76,0x7e,0x7e,0x6e,0x66,0x66,0x00}, // 'N'
    {0x3c,0x66,0x66,0x66,0x66,0x66,0x3c,0x00}, // 'O'
    {0x7c,0x66,0x66,0x7c,0x60,0x60,0x60,0x00}, // 'P'
    {0x3c,0x66,0x66,0x66,0x6a,0x6c,0x36,0x00}, // 'Q'
    {0x7c,0x66,0x66,0x7c,0x6c,0x66,0x66,0x00}, // 'R'
    {0x3c,0x66,0x60,0x3c,0x06,0x66,0x3c,0x00}, // 'S'
    {0x7e,0x18,0x18,0x18,0x18,0x18,0x18,0x00}, // 'T'
    {0x66,0x66,0x66,0x66,0x66,0x66,0x3c,0x00}, // 'U'
    {0x66,0x66,0x66,0x66,0x66,0x3c,0x18,0x00}, // 'V'
    {0x63,0x63,0x63,0x6b,0x7f,0x77,0x63,0x00}, // 'W'
    {0x66,0x66,0x3c,0x18,0x3c,0x66,0x66,0x00}, // 'X'
    {0x66,0x66,0x66,0x3c,0x18,0x18,0x18,0x00}, // 'Y'
    {0x7e,0x06,0x0c,0x18,0x30,0x60,0x7e,0x00}, // 'Z'
    {0x3c,0x30,0x30,0x30,0x30,0x30,0x3c,0x00}, // '['
    {0xc0,0x60,0x30,0x18,0x0c,0x06,0x02,0x00}, // '\'
    {0x3c,0x0c,0x0c,0x0c,0x0c,0x0c,0x3c,0x00}, // ']'
    {0x18,0x3c,0x66,0x00,0x00,0x00,0x00,0x00}, // '^'
    {0x00,0x00,0x00,0x00,0x00,0x00,0x00,0xff}, // '_'
    {0x30,0x18,0x0c,0x00,0x00,0x00,0x00,0x00}, // '`'
    {0x00,0x00,0x3c,0x06,0x3e,0x66,0x3e,0x00}, // 'a' (97)
    {0x60,0x60,0x7c,0x66,0x66,0x66,0x7c,0x00}, // 'b'
    {0x00,0x00,0x3c,0x66,0x60,0x66,0x3c,0x00}, // 'c'
    {0x06,0x06,0x3e,0x66,0x66,0x66,0x3e,0x00}, // 'd'
    {0x00,0x00,0x3c,0x66,0x7e,0x60,0x3c,0x00}, // 'e'
    {0x1c,0x30,0x78,0x30,0x30,0x30,0x30,0x00}, // 'f'
    {0x00,0x00,0x3e,0x66,0x66,0x3e,0x06,0x3c}, // 'g'
    {0x60,0x60,0x7c,0x66,0x66,0x66,0x66,0x00}, // 'h'
    {0x18,0x00,0x38,0x18,0x18,0x18,0x3c,0x00}, // 'i'
    {0x0c,0x00,0x1c,0x0c,0x0c,0x0c,0x6c,0x38}, // 'j'
    {0x60,0x60,0x66,0x6c,0x78,0x6c,0x66,0x00}, // 'k'
    {0x38,0x18,0x18,0x18,0x18,0x18,0x3c,0x00}, // 'l'
    {0x00,0x00,0x66,0x7f,0x7f,0x6b,0x63,0x00}, // 'm'
    {0x00,0x00,0x7c,0x66,0x66,0x66,0x66,0x00}, // 'n'
    {0x00,0x00,0x3c,0x66,0x66,0x66,0x3c,0x00}, // 'o'
    {0x00,0x00,0x7c,0x66,0x66,0x7c,0x60,0x60}, // 'p'
    {0x00,0x00,0x3e,0x66,0x66,0x3e,0x06,0x07}, // 'q'
    {0x00,0x00,0x7c,0x66,0x60,0x60,0x60,0x00}, // 'r'
    {0x00,0x00,0x3e,0x60,0x3c,0x06,0x7c,0x00}, // 's'
    {0x18,0x18,0x7e,0x18,0x18,0x18,0x0c,0x00}, // 't'
    {0x00,0x00,0x66,0x66,0x66,0x66,0x3e,0x00}, // 'u'
    {0x00,0x00,0x66,0x66,0x66,0x3c,0x18,0x00}, // 'v'
    {0x00,0x00,0x63,0x6b,0x7f,0x3e,0x36,0x00}, // 'w'
    {0x00,0x00,0x66,0x3c,0x18,0x3c,0x66,0x00}, // 'x'
    {0x00,0x00,0x66,0x66,0x66,0x3e,0x06,0x3c}, // 'y'
    {0x00,0x00,0x7e,0x0c,0x18,0x30,0x7e,0x00}, // 'z'
    {0x0e,0x18,0x18,0x70,0x18,0x18,0x0e,0x00}, // '{'
    {0x18,0x18,0x18,0x00,0x18,0x18,0x18,0x00}, // '|'
    {0x70,0x18,0x18,0x0e,0x18,0x18,0x70,0x00}, // '}'
    {0x76,0xdc,0x00,0x00,0x00,0x00,0x00,0x00}  // '~'
};

// ---------------------------------------------------------------------------
// Texture Cache & Asset Decoding
// ---------------------------------------------------------------------------

typedef struct {
    char path[64];
    Image img;
    bool loaded;
} TextureEntry;

#define MAX_TEX_CACHE 128
static TextureEntry s_tex_cache[MAX_TEX_CACHE];
static int s_tex_count = 0;

static inline char to_lower_char(char c) {
    if (c >= 'A' && c <= 'Z') return c + ('a' - 'A');
    return c;
}

static bool str_equals_ci(const char* a, const char* b) {
    if (!a || !b) return false;
    while (*a && *b) {
        if (to_lower_char(*a) != to_lower_char(*b)) return false;
        a++; b++;
    }
    return (*a == 0 && *b == 0);
}

static bool str_contains_ci(const char* haystack, const char* needle) {
    if (!haystack || !needle || *needle == 0) return false;
    for (int i = 0; haystack[i] != 0; i++) {
        int j = 0;
        while (needle[j] != 0 && haystack[i + j] != 0 &&
               to_lower_char(haystack[i + j]) == to_lower_char(needle[j])) {
            j++;
        }
        if (needle[j] == 0) return true;
    }
    return false;
}

static const WagnerAsset* find_wagner_asset(const char* path) {
    if (!path || path[0] == '\0') return NULL;

    // 1. Exact match
    for (int i = 0; i < WAGNER_ASSET_COUNT; i++) {
        const char* a = WAGNER_ASSETS[i].path;
        const char* b = path;
        while (*a && *b && *a == *b) { a++; b++; }
        if (*a == 0 && *b == 0) return &WAGNER_ASSETS[i];
    }

    // 2. Case-insensitive match
    for (int i = 0; i < WAGNER_ASSET_COUNT; i++) {
        if (str_equals_ci(WAGNER_ASSETS[i].path, path)) return &WAGNER_ASSETS[i];
    }

    // 3. Basename match
    const char* base = path;
    for (const char* p = path; *p; p++) {
        if (*p == '/' || *p == '\\') base = p + 1;
    }
    for (int i = 0; i < WAGNER_ASSET_COUNT; i++) {
        if (str_equals_ci(WAGNER_ASSETS[i].path, base)) return &WAGNER_ASSETS[i];
    }

    // 4. Substring / Keyword match (e.g. "dragon" matches "Creature_Dragon_U.png")
    char clean_name[64];
    int len = 0;
    while (len < 63 && base[len] != '\0') {
        clean_name[len] = base[len];
        len++;
    }
    clean_name[len] = '\0';
    if (len > 4 && str_equals_ci(&clean_name[len - 4], ".png")) {
        clean_name[len - 4] = '\0';
    }

    for (int i = 0; i < WAGNER_ASSET_COUNT; i++) {
        if (str_contains_ci(WAGNER_ASSETS[i].path, clean_name)) {
            return &WAGNER_ASSETS[i];
        }
    }

    return NULL;
}

Image load_image(const char* filename) {
    if (!filename || filename[0] == '\0') return (Image){0};
    
    // Check cache
    for (int i = 0; i < s_tex_count; i++) {
        const char* a = s_tex_cache[i].path;
        const char* b = filename;
        while (*a && *b && *a == *b) { a++; b++; }
        if (*a == 0 && *b == 0) return s_tex_cache[i].img;
    }

    // Load and decode from embedded WAGNER_ASSETS
    const WagnerAsset* asset = find_wagner_asset(filename);
    if (!asset) {
        if (s_tex_count < MAX_TEX_CACHE) {
            int k = 0;
            while (k < 63 && filename[k]) {
                s_tex_cache[s_tex_count].path[k] = filename[k];
                k++;
            }
            s_tex_cache[s_tex_count].path[k] = '\0';
            s_tex_cache[s_tex_count].img = (Image){0};
            s_tex_cache[s_tex_count].loaded = true;
            s_tex_count++;
        }
        return (Image){0};
    }

    unsigned char* decoded = NULL;
    unsigned w = 0, h = 0;
    if (lodepng_decode32(&decoded, &w, &h, asset->data, asset->size) != 0) {
        return (Image){0};
    }

    Image img = {
        .pixels = decoded,
        .width = (int)w,
        .height = (int)h,
        .stride = (int)w,
        .bpp = 32
    };

    if (s_tex_count < MAX_TEX_CACHE) {
        int k = 0;
        while (k < 63 && filename[k]) {
            s_tex_cache[s_tex_count].path[k] = filename[k];
            k++;
        }
        s_tex_cache[s_tex_count].path[k] = '\0';
        s_tex_cache[s_tex_count].img = img;
        s_tex_cache[s_tex_count].loaded = true;
        s_tex_count++;
    }

    return img;
}

// Cached common tiles & emotes
static Image img_tiles[NUM_TILES];
static Image img_emotes[12];

void renderer_init(void) {
    img_tiles[FLOOR] = load_image("Feature_Stone_A.png");
    img_tiles[MOUNTAIN] = load_image("Feature_Stone_C.png");
    img_tiles[WATER] = load_image("Feature_Waves.png");

    img_emotes[0] = load_image("Emote_Angry.png");
    img_emotes[1] = load_image("Emote_Excited.png");
    img_emotes[2] = load_image("Emote_Happy.png");
    img_emotes[3] = load_image("Emote_Hurt.png");
    img_emotes[4] = load_image("Emote_Nerd.png");
    img_emotes[5] = load_image("Emote_Sad.png");
    img_emotes[6] = load_image("Emote_Serious.png");
    img_emotes[7] = load_image("Emote_Sick.png");
    img_emotes[8] = load_image("Emote_Sleeping.png");
    img_emotes[9] = load_image("Emote_Smug.png");
    img_emotes[10] = load_image("Emote_Upset.png");
    img_emotes[11] = load_image("Emote_Yarr.png");
}

// ---------------------------------------------------------------------------
// Software Drawing Primitives (RGBA)
// ---------------------------------------------------------------------------

static inline void set_pixel_blend(uint8_t* fb, int fb_w, int fb_h, int x, int y, ColorRGBA c) {
    if (x < 0 || x >= fb_w || y < 0 || y >= fb_h) return;
    int idx = (y * fb_w + x) * 4;
    uint8_t sa = color_a(c);
    if (sa == 0) return;
    if (sa == 255) {
        fb[idx + 0] = color_r(c);
        fb[idx + 1] = color_g(c);
        fb[idx + 2] = color_b(c);
        fb[idx + 3] = 255;
    } else {
        uint8_t dr = fb[idx + 0];
        uint8_t dg = fb[idx + 1];
        uint8_t db = fb[idx + 2];
        float a = sa / 255.0f;
        float inv = 1.0f - a;
        fb[idx + 0] = (uint8_t)(color_r(c) * a + dr * inv);
        fb[idx + 1] = (uint8_t)(color_g(c) * a + dg * inv);
        fb[idx + 2] = (uint8_t)(color_b(c) * a + db * inv);
        fb[idx + 3] = 255;
    }
}

void draw_box(uint8_t* fb, int fb_w, int fb_h, int x, int y, int w, int h, ColorRGBA color) {
    if (w <= 0 || h <= 0) return;
    int x0 = x < 0 ? 0 : x;
    int y0 = y < 0 ? 0 : y;
    int x1 = (x + w) > fb_w ? fb_w : (x + w);
    int y1 = (y + h) > fb_h ? fb_h : (y + h);

    for (int py = y0; py < y1; py++) {
        for (int px = x0; px < x1; px++) {
            set_pixel_blend(fb, fb_w, fb_h, px, py, color);
        }
    }
}

void draw_box_outline(uint8_t* fb, int fb_w, int fb_h, int x, int y, int w, int h, ColorRGBA color) {
    draw_box(fb, fb_w, fb_h, x, y, w, 1, color);
    draw_box(fb, fb_w, fb_h, x, y + h - 1, w, 1, color);
    draw_box(fb, fb_w, fb_h, x, y, 1, h, color);
    draw_box(fb, fb_w, fb_h, x + w - 1, y, 1, h, color);
}

void draw_line(uint8_t* fb, int fb_w, int fb_h, int x0, int y0, int x1, int y1, ColorRGBA color) {
    int dx = x1 - x0; if (dx < 0) dx = -dx;
    int dy = y1 - y0; if (dy < 0) dy = -dy;
    int sx = x0 < x1 ? 1 : -1;
    int sy = y0 < y1 ? 1 : -1;
    int err = dx - dy;

    while (1) {
        set_pixel_blend(fb, fb_w, fb_h, x0, y0, color);
        if (x0 == x1 && y0 == y1) break;
        int e2 = 2 * err;
        if (e2 > -dy) { err -= dy; x0 += sx; }
        if (e2 < dx)  { err += dx; y0 += sy; }
    }
}

void draw_text(uint8_t* fb, int fb_w, int fb_h, const char* text, int x, int y, ColorRGBA color, int scale) {
    if (!text || scale <= 0) return;
    int cx = x;
    int cy = y;

    for (int i = 0; text[i] != '\0'; i++) {
        char ch = text[i];
        if (ch == '\n') {
            cx = x;
            cy += 9 * scale;
            continue;
        }
        if (ch < 32 || ch > 126) ch = '?';
        int char_idx = ch - 32;

        for (int row = 0; row < 8; row++) {
            uint8_t row_bits = FONT_8X8[char_idx][row];
            for (int col = 0; col < 8; col++) {
                if (row_bits & (1 << (7 - col))) {
                    if (scale == 1) {
                        set_pixel_blend(fb, fb_w, fb_h, cx + col, cy + row, color);
                    } else {
                        draw_box(fb, fb_w, fb_h, cx + col * scale, cy + row * scale, scale, scale, color);
                    }
                }
            }
        }
        cx += 8 * scale;
    }
}

static void draw_sprite_tinted(uint8_t* fb, int fb_w, int fb_h, Image img, int x, int y, int sx, int sy,
                               ColorRGBA fg, ColorRGBA bg, float light, bool is_tile) {
    if (!img.pixels || sx <= 0 || sy <= 0) return;
    int img_w = img.width;
    int img_h = img.height;

    for (int dy = 0; dy < sy; dy++) {
        int py = y + dy;
        if (py < 0 || py >= fb_h) continue;
        int iy = (dy * img_h) / sy;
        if (iy >= img_h) iy = img_h - 1;
        int row_offset = (iy * img.stride) * 4;

        for (int dx = 0; dx < sx; dx++) {
            int px = x + dx;
            if (px < 0 || px >= fb_w) continue;
            int ix = (dx * img_w) / sx;
            if (ix >= img_w) ix = img_w - 1;

            int p_idx = row_offset + (ix * 4);
            uint8_t pr = img.pixels[p_idx + 0];
            uint8_t pg = img.pixels[p_idx + 1];
            uint8_t pb = img.pixels[p_idx + 2];
            uint8_t pa = img.pixels[p_idx + 3];

            if (pa < 32) continue; // transparent in texture

            bool is_fg = (pr > 128 || pg > 128 || pb > 128);

            ColorRGBA draw_c = is_fg ? fg : bg;
            if (color_a(draw_c) == 0) {
                continue; // transparent background requested
            }

            if (light < 1.0f) {
                float min_light = 0.15f;
                float l = min_light + light * (1.0f - min_light);
                draw_c = color_scale(draw_c, l);
            }

            set_pixel_blend(fb, fb_w, fb_h, px, py, draw_c);
        }
    }
}

static Image get_tile_image(TileType t) {
    if (t == FLOOR) {
        if (!img_tiles[FLOOR].pixels) img_tiles[FLOOR] = load_image("Feature_Stone_A.png");
        return img_tiles[FLOOR];
    }
    if (t == MOUNTAIN) {
        if (!img_tiles[MOUNTAIN].pixels) img_tiles[MOUNTAIN] = load_image("Feature_Stone_C.png");
        return img_tiles[MOUNTAIN];
    }
    if (t == WATER) {
        if (!img_tiles[WATER].pixels) img_tiles[WATER] = load_image("Feature_Waves.png");
        return img_tiles[WATER];
    }
    if (t == SAND) {
        if (!img_tiles[SAND].pixels) img_tiles[SAND] = load_image("Feature_Stone_A.png");
        return img_tiles[SAND];
    }
    if (t == STONE) {
        if (!img_tiles[STONE].pixels) img_tiles[STONE] = load_image("Feature_Stone_C.png");
        return img_tiles[STONE];
    }
    return (Image){0};
}

int renderer_get_sprite_data(const char* name, uint32_t fg, uint32_t bg, uint8_t* out_pixels_16x16_rgba) {
    if (!name || !out_pixels_16x16_rgba) return 0;
    Image img = load_image(name);
    if (!img.pixels) return 0;

    for (int y = 0; y < 16; y++) {
        int iy = (y * img.height) / 16;
        int row = (iy * img.stride) * 4;
        for (int x = 0; x < 16; x++) {
            int ix = (x * img.width) / 16;
            int idx = row + (ix * 4);
            uint8_t pr = img.pixels[idx + 0];
            uint8_t pg = img.pixels[idx + 1];
            uint8_t pb = img.pixels[idx + 2];
            uint8_t pa = img.pixels[idx + 3];

            int out_idx = (y * 16 + x) * 4;
            if (pa < 32) {
                out_pixels_16x16_rgba[out_idx + 0] = 0;
                out_pixels_16x16_rgba[out_idx + 1] = 0;
                out_pixels_16x16_rgba[out_idx + 2] = 0;
                out_pixels_16x16_rgba[out_idx + 3] = 0;
            } else if (pr > 128 || pg > 128 || pb > 128) {
                out_pixels_16x16_rgba[out_idx + 0] = color_r(fg);
                out_pixels_16x16_rgba[out_idx + 1] = color_g(fg);
                out_pixels_16x16_rgba[out_idx + 2] = color_b(fg);
                out_pixels_16x16_rgba[out_idx + 3] = color_a(fg);
            } else {
                if (color_a(bg) > 0) {
                    out_pixels_16x16_rgba[out_idx + 0] = color_r(bg);
                    out_pixels_16x16_rgba[out_idx + 1] = color_g(bg);
                    out_pixels_16x16_rgba[out_idx + 2] = color_b(bg);
                    out_pixels_16x16_rgba[out_idx + 3] = color_a(bg);
                } else {
                    out_pixels_16x16_rgba[out_idx + 0] = 0;
                    out_pixels_16x16_rgba[out_idx + 1] = 0;
                    out_pixels_16x16_rgba[out_idx + 2] = 0;
                    out_pixels_16x16_rgba[out_idx + 3] = 0;
                }
            }
        }
    }
    return 1;
}

// ---------------------------------------------------------------------------
// Main Scene Renderer
// ---------------------------------------------------------------------------

void render_frame(uint8_t* framebuffer, int width, int height, float time, float dt,
                  const uint8_t map[MAP_HEIGHT][MAP_WIDTH],
                  const RenderEntity* entities, int max_entities,
                  const RenderItem* items, int max_items,
                  float cam_x, float cam_y, float zoom, int selected_entity_id,
                  int day, int hour, int minute, float global_light, float global_heat,
                  int pop_count, bool is_paused, int target_tps) {
    if (!framebuffer || width <= 0 || height <= 0) return;

    // Clear background (fast 32-bit word write)
    ColorRGBA bg_color = rgb(15, 18, 22);
    uint32_t* fb32 = (uint32_t*)framebuffer;
    int total_pixels = width * height;
    for (int i = 0; i < total_pixels; i++) {
        fb32[i] = bg_color;
    }

    int tile_size = (int)(16 * zoom);
    if (tile_size < 1) tile_size = 1;

    int center_screen_x = width / 2;
    int center_screen_y = height / 2;

    int min_tx = (int)(cam_x - (center_screen_x / (float)tile_size) - 1);
    int max_tx = (int)(cam_x + (center_screen_x / (float)tile_size) + 1);
    int min_ty = (int)(cam_y - (center_screen_y / (float)tile_size) - 1);
    int max_ty = (int)(cam_y + (center_screen_y / (float)tile_size) + 1);

    if (min_tx < 0) min_tx = 0;
    if (max_tx >= MAP_WIDTH) max_tx = MAP_WIDTH - 1;
    if (min_ty < 0) min_ty = 0;
    if (max_ty >= MAP_HEIGHT) max_ty = MAP_HEIGHT - 1;

    // 1. Render Terrain Tiles
    for (int ty = min_ty; ty <= max_ty; ty++) {
        int screen_y = center_screen_y + (int)((ty - cam_y) * tile_size);
        for (int tx = min_tx; tx <= max_tx; tx++) {
            int screen_x = center_screen_x + (int)((tx - cam_x) * tile_size);
            TileType t = (TileType)map[ty][tx];

            ColorRGBA fg = rgb(180, 180, 180);
            ColorRGBA bg = rgb(30, 30, 30);

            if (t == FLOOR) {
                fg = rgb(140, 200, 110);
                bg = rgb(35, 65, 30);
            } else if (t == MOUNTAIN) {
                fg = rgb(180, 175, 170);
                bg = rgb(70, 65, 65);
            } else if (t == WATER) {
                fg = rgb(80, 150, 240);
                bg = rgb(20, 45, 90);
                float wave = __builtin_sinf(time * 2.0f + tx * 0.5f + ty * 0.3f) * 0.1f;
                fg = color_scale(fg, 1.0f + wave);
            } else if (t == SAND) {
                fg = rgb(235, 205, 115);
                bg = rgb(95, 78, 35);
            } else if (t == STONE) {
                fg = rgb(165, 165, 175);
                bg = rgb(55, 55, 62);
            }

            Image tile_img = get_tile_image(t);
            if (tile_img.pixels) {
                draw_sprite_tinted(framebuffer, width, height, tile_img, screen_x, screen_y, tile_size, tile_size, fg, bg, global_light, true);
            } else {
                ColorRGBA c = color_scale(fg, global_light);
                draw_box(framebuffer, width, height, screen_x, screen_y, tile_size, tile_size, c);
            }
        }
    }

    // 2. Render Dropped Items
    if (items && max_items > 0) {
        for (int i = 0; i < max_items; i++) {
            const RenderItem* item = &items[i];
            if (!item->active) continue;
            if (item->x < min_tx || item->x > max_tx || item->y < min_ty || item->y > max_ty) continue;

            int sx = center_screen_x + (int)((item->x - cam_x) * tile_size);
            int sy_base = center_screen_y + (int)((item->y - cam_y) * tile_size);

            float bounce = __builtin_sinf(time * 4.0f + i) * (tile_size * 0.08f);
            int sy = sy_base + (int)bounce;

            ColorRGBA item_fg = item->fg ? (ColorRGBA)item->fg : rgb(255, 255, 255);
            ColorRGBA item_bg = item->bg ? (ColorRGBA)item->bg : rgb(40, 40, 40);

            Image item_img = load_image(item->skin);
            int item_draw_size = (tile_size * 3) / 4;
            if (item_draw_size < 4) item_draw_size = 4;
            int offset = (tile_size - item_draw_size) / 2;

            int shadow_h = item_draw_size / 4;
            if (shadow_h < 2) shadow_h = 2;
            int shadow_y = sy_base + tile_size - shadow_h - 1;
            draw_box(framebuffer, width, height, sx + offset, shadow_y, item_draw_size, shadow_h, rgba(0, 0, 0, 80));

            if (item_img.pixels) {
                draw_sprite_tinted(framebuffer, width, height, item_img, sx + offset, sy + offset, item_draw_size, item_draw_size, item_fg, item_bg, global_light, false);
            } else {
                draw_box(framebuffer, width, height, sx + offset, sy + offset, item_draw_size, item_draw_size, item_fg);
            }
        }
    }

    // 3. Render Entities / Creatures
    if (entities && max_entities > 0) {
        for (int i = 0; i < max_entities; i++) {
            const RenderEntity* e = &entities[i];
            if (!e->active) continue;
            if (e->x < min_tx - 1 || e->x > max_tx + 1 || e->y < min_ty - 1 || e->y > max_ty + 1) continue;

            int sx = center_screen_x + (int)((e->x - cam_x) * tile_size);
            int sy = center_screen_y + (int)((e->y - cam_y) * tile_size);

            ColorRGBA ent_fg = e->fg ? (ColorRGBA)e->fg : rgb(240, 240, 240);
            ColorRGBA ent_bg = e->bg ? (ColorRGBA)e->bg : rgb(20, 20, 20);

            if (e->combat_flash > 0) {
                ent_fg = rgb(255, 60, 60);
                ent_bg = rgb(255, 255, 255);
            }

            Image ent_img = load_image(e->skin);
            if (ent_img.pixels) {
                draw_sprite_tinted(framebuffer, width, height, ent_img, sx, sy, tile_size, tile_size, ent_fg, ent_bg, global_light, false);
            } else {
                draw_box(framebuffer, width, height, sx + 2, sy + 2, tile_size - 4, tile_size - 4, ent_fg);
            }

            // Health bar
            if (e->max_health > 0 && e->health < e->max_health && e->health > 0) {
                int bar_w = tile_size;
                int bar_h = tile_size > 16 ? 3 : 2;
                int bar_y = sy - bar_h - 2;
                draw_box(framebuffer, width, height, sx, bar_y, bar_w, bar_h, rgb(50, 10, 10));
                int fill_w = (int)((e->health / e->max_health) * bar_w);
                if (fill_w < 1) fill_w = 1;
                draw_box(framebuffer, width, height, sx, bar_y, fill_w, bar_h, rgb(80, 220, 80));
            }

            // Emote bubble
            Image emote_img = (Image){0};
            if (e->emote >= 0 && e->emote < 12) {
                emote_img = img_emotes[e->emote];
            } else if (e->motor == 5) emote_img = img_emotes[0]; // Attack -> Angry
            else if (e->motor == 4) emote_img = img_emotes[8]; // Sleep -> Sleeping
            else if (e->motor == 6) emote_img = img_emotes[10]; // Flee -> Upset
            else if (e->motor == 7) emote_img = img_emotes[2]; // Socialize -> Happy

            if (emote_img.pixels && tile_size >= 12) {
                int emote_size = tile_size / 2;
                draw_sprite_tinted(framebuffer, width, height, emote_img, sx + tile_size - emote_size, sy - emote_size, emote_size, emote_size, rgb(255, 240, 100), rgb(40, 30, 0), 1.0f, false);
            }

            // Selection Reticle
            if (e->id == selected_entity_id) {
                ColorRGBA select_color = rgb(255, 215, 0);
                draw_box_outline(framebuffer, width, height, sx - 2, sy - 2, tile_size + 4, tile_size + 4, select_color);
                draw_box_outline(framebuffer, width, height, sx - 3, sy - 3, tile_size + 6, tile_size + 6, select_color);
            }
        }
    }

    // 4. In-Game Mini HUD Overlay
    draw_box(framebuffer, width, height, 0, 0, width, 20, rgba(20, 24, 28, 210));
    draw_line(framebuffer, width, height, 0, 20, width, 20, rgb(60, 65, 75));

    char time_str[64];
    int t_idx = 0;
    time_str[t_idx++] = 'D'; time_str[t_idx++] = 'I'; time_str[t_idx++] = 'A'; time_str[t_idx++] = ' ';
    time_str[t_idx++] = '0' + (day / 10); time_str[t_idx++] = '0' + (day % 10);
    time_str[t_idx++] = ' '; time_str[t_idx++] = ' ';
    time_str[t_idx++] = '0' + (hour / 10); time_str[t_idx++] = '0' + (hour % 10);
    time_str[t_idx++] = ':';
    time_str[t_idx++] = '0' + (minute / 10); time_str[t_idx++] = '0' + (minute % 10);
    time_str[t_idx] = '\0';

    draw_text(framebuffer, width, height, time_str, 8, 6, rgb(240, 220, 140), 1);

    char pop_str[64];
    int p_idx = 0;
    pop_str[p_idx++] = 'P'; pop_str[p_idx++] = 'O'; pop_str[p_idx++] = 'P'; pop_str[p_idx++] = ':'; pop_str[p_idx++] = ' ';
    if (pop_count >= 100) pop_str[p_idx++] = '0' + (pop_count / 100);
    if (pop_count >= 10)  pop_str[p_idx++] = '0' + ((pop_count / 10) % 10);
    pop_str[p_idx++] = '0' + (pop_count % 10);
    pop_str[p_idx] = '\0';

    draw_text(framebuffer, width, height, pop_str, 120, 6, rgb(160, 240, 160), 1);

    if (is_paused) {
        draw_text(framebuffer, width, height, "[PAUSADO]", width - 90, 6, rgb(255, 90, 90), 1);
    } else {
        char tps_str[32];
        int s_idx = 0;
        if (target_tps >= 100) tps_str[s_idx++] = '0' + (target_tps / 100);
        if (target_tps >= 10)  tps_str[s_idx++] = '0' + ((target_tps / 10) % 10);
        tps_str[s_idx++] = '0' + (target_tps % 10);
        tps_str[s_idx++] = ' '; tps_str[s_idx++] = 'T'; tps_str[s_idx++] = 'P'; tps_str[s_idx++] = 'S';
        tps_str[s_idx] = '\0';
        draw_text(framebuffer, width, height, tps_str, width - 80, 6, rgb(160, 200, 240), 1);
    }
}
