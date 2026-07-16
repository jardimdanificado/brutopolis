#include "wagner.h"

static Canvas img_floor;
static Canvas img_player;
static Canvas img_npc;

static float player_x = 0;
static float player_y = 0;

static float cam_x = 0;
static float cam_y = 0;
static float zoom = 1.0f;
static int last_mx = 0;
static int last_my = 0;

typedef struct {
    float x;
    float y;
    float target_x;
    float target_y;
    float wait_time;
} NPC;


void preload() {
    load_image(&img_floor, "Feature_Stone_A.png");
    load_image(&img_player, "Creature_Cat_U.png");
}

void draw() {
    // Determine actual scale based on floor tile rounding
    float actual_scale = zoom;
    int tile_size = 0;
    if (img_floor.pixels) {
        tile_size = (int)(img_floor.width * zoom);
        if (tile_size > 0) actual_scale = (float)tile_size / img_floor.width;
    }
    
    if (wagner.keys[20]) zoom -= 1.0f * wagner.delta_time; // Q
    if (wagner.keys[8])  zoom += 1.0f * wagner.delta_time; // E
    if (zoom < 0.1f) zoom = 0.1f;
    
    // Player grid movement
    float tile_size_world = 32.0f;
    if (img_floor.pixels) {
        tile_size_world = img_floor.width;
    }

    static float move_cooldown = 0.0f;
    if (move_cooldown > 0.0f) {
        move_cooldown -= wagner.delta_time;
    } else {
        if (img_floor.pixels) {
            bool moved = false;
            if (wagner.keys[82] || wagner.keys[26]) { player_y -= tile_size_world; moved = true; } // Up / W
            else if (wagner.keys[81] || wagner.keys[22]) { player_y += tile_size_world; moved = true; } // Down / S
            else if (wagner.keys[80] || wagner.keys[4])  { player_x -= tile_size_world; moved = true; } // Left / A
            else if (wagner.keys[79] || wagner.keys[7])  { player_x += tile_size_world; moved = true; } // Right / D
            
            if (moved) {
                move_cooldown = 0.15f; // Cooldown duration for grid steps
            }
        }
    }
    
    // Process Mouse for Camera drag
    if (wagner.mouse_down && actual_scale > 0) {
        cam_x -= (wagner.mouse.x - last_mx) / actual_scale;
        cam_y -= (wagner.mouse.y - last_my) / actual_scale;
    }
    last_mx = wagner.mouse.x;
    last_my = wagner.mouse.y;

    push(); fill(WHITE); clear(); pop();
    
    if (img_floor.pixels && tile_size > 0) {
        int map_w = 10;
        int map_h = 10;
        
        int start_x = wagner.width / 2 - (int)(cam_x * actual_scale);
        int start_y = wagner.height / 2 - (int)(cam_y * actual_scale);
        
        // Desenha o mapa (chão)
        for (int y = 0; y < map_h; y++) {
            for (int x = 0; x < map_w; x++) {
                int draw_x = start_x + x * tile_size;
                int draw_y = start_y + y * tile_size;
                
                if (draw_x + tile_size > 0 && draw_x < wagner.width && 
                    draw_y + tile_size > 0 && draw_y < wagner.height) {
                    push();
                    translate(draw_x, draw_y);
                    scale(tile_size, tile_size);
                    texture(&img_floor);
                    rect();
                    pop();
                }
            }
        }
        
        // Desenha o jogador com o mesmo tamanho do chão
        if (img_player.pixels) {
            int p_draw_x = start_x + (int)(player_x * actual_scale);
            int p_draw_y = start_y + (int)(player_y * actual_scale);
            
            push();
            translate(p_draw_x, p_draw_y);
            scale(tile_size, tile_size);
            texture(&img_player);
            rect();
            pop();
        }
    }
    
    push();
    translate(10, 10);
    fill(WHITE);
    text("brutopolis");
    pop();
}
