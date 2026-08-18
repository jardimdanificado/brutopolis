#ifndef RENDERER_H
#define RENDERER_H

#include <stdint.h>
#include <stdbool.h>
#include "world_gen.h"
#include "wash_api.h"

#define MAX_RENDER_ENTITIES 4096
#define MAX_RENDER_ITEMS 1024

typedef struct {
    int32_t active;
    int32_t id;
    int32_t x;
    int32_t y;
    int32_t motor;
    uint32_t fg;
    uint32_t bg;
    float health;
    float max_health;
    int32_t emote;
    int32_t combat_flash;
    char skin[64];
} RenderEntity;

typedef struct {
    int32_t active;
    int32_t x;
    int32_t y;
    uint32_t fg;
    uint32_t bg;
    char skin[64];
} RenderItem;

void renderer_init(void);
Image load_image(const char* filename);

void render_frame(uint8_t* framebuffer, int width, int height, float time, float dt,
                  const uint8_t map[MAP_HEIGHT][MAP_WIDTH],
                  const RenderEntity* entities, int max_entities,
                  const RenderItem* items, int max_items,
                  float cam_x, float cam_y, float zoom, int selected_entity_id,
                  int day, int hour, int minute, float global_light, float global_heat,
                  int pop_count, bool is_paused, int target_tps);

int renderer_get_sprite_data(const char* name, uint32_t fg, uint32_t bg, uint8_t* out_pixels_16x16_rgba);

void draw_text(uint8_t* fb, int fb_w, int fb_h, const char* text, int x, int y, ColorRGBA color, int scale);
void draw_box(uint8_t* fb, int fb_w, int fb_h, int x, int y, int w, int h, ColorRGBA color);
void draw_box_outline(uint8_t* fb, int fb_w, int fb_h, int x, int y, int w, int h, ColorRGBA color);
void draw_line(uint8_t* fb, int fb_w, int fb_h, int x0, int y0, int x1, int y1, ColorRGBA color);

#endif // RENDERER_H
