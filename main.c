#include "wagner.h"

static Image img_floor;
static Image img_player;
static Image img_water;

static float player_x = 0;
static float player_y = 0;

static float cam_x = 0;
static float cam_y = 0;
static float zoom = 1.0f;
static int last_mx = 0;
static int last_my = 0;

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

void preload() {
    img_floor = load_image("Feature_Stone_A.png");
    img_player = load_image("Creature_Cat_U.png");
    img_water = load_image("Feature_Waves.png");
}

void draw() {
    // Determine actual scale based on floor tile rounding
    float actual_scale = zoom;
    int tile_size = 0;
    if (img_floor.pixels) {
        tile_size = (int)(img_floor.width * zoom);
        if (tile_size > 0) actual_scale = (float)tile_size / img_floor.width;
    }
    
    if (wagner.keys[KEY_Q]) zoom -= 1.0f * wagner.delta_time;
    if (wagner.keys[KEY_E])  zoom += 1.0f * wagner.delta_time;
    if (zoom < 0.1f) zoom = 0.1f;
    
    // Player grid movement
    float tile_size_world = 32.0f;
    if (img_floor.pixels) {
        tile_size_world = img_floor.width;
    }

    // Process Mouse for Camera drag
    if (wagner.mouse_down && actual_scale > 0) {
        cam_x -= (wagner.mouse.x - last_mx) / actual_scale;
        cam_y -= (wagner.mouse.y - last_my) / actual_scale;
    }
    last_mx = wagner.mouse.x;
    last_my = wagner.mouse.y;

    push(); fill(rgb(0, 0, 0)); clear(); pop();
    
    if (img_floor.pixels && tile_size > 0) {
        int map_w = 10;
        int map_h = 10;
        
        int start_x = (wagner.width - map_w * tile_size) / 2 - (int)(cam_x * actual_scale);
        int start_y = (wagner.height - map_h * tile_size) / 2 - (int)(cam_y * actual_scale);
        
        // Desenha o mapa (chão)
        for (int y = 0; y < map_h; y++) {
            for (int x = 0; x < map_w; x++) {
                int draw_x = start_x + x * tile_size;
                int draw_y = start_y + y * tile_size;
                
                if (draw_x + tile_size > 0 && draw_x < wagner.width && 
                    draw_y + tile_size > 0 && draw_y < wagner.height) {
                    draw_sprite(img_floor, draw_x, draw_y, tile_size, tile_size);
                }
            }
        }
        
        // Desenha o jogador com o mesmo tamanho do chão
        if (img_player.pixels) {
            int p_draw_x = start_x + (int)(player_x * actual_scale);
            int p_draw_y = start_y + (int)(player_y * actual_scale);
            
            draw_sprite(img_player, p_draw_x, p_draw_y, tile_size, tile_size);
        }
    }
    
    
    draw_text("brutopolis", 10, 10, WHITE, 0);
}
