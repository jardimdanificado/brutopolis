#include "wagner.h"
#include "creature_system.h"
#include "creature_system.c"
#include "game.h"
#include "game.c"

// ---------------------------------------------------------------------------
// Dynamic Texture Cache & Game Visual Assets
// ---------------------------------------------------------------------------

typedef struct {
    char filename[64];
    Image image;
} TextureCacheEntry;

static TextureCacheEntry tex_cache[16];
static int tex_cache_count = 0;

static Image get_or_load_texture(const char* filename) {
    if (!filename || filename[0] == '\0') return (Image){0};
    for (int i = 0; i < tex_cache_count; i++) {
        bool match = true;
        for (int k = 0; k < 63; k++) {
            if (tex_cache[i].filename[k] != filename[k]) { match = false; break; }
            if (filename[k] == '\0') break;
        }
        if (match) return tex_cache[i].image;
    }
    if (tex_cache_count < 16) {
        for (int k = 0; k < 63 && filename[k]; k++) tex_cache[tex_cache_count].filename[k] = filename[k];
        tex_cache[tex_cache_count].image = load_image(filename);
        Image loaded = tex_cache[tex_cache_count].image;
        tex_cache_count++;
        return loaded;
    }
    return (Image){0};
}

static Image img_tiles[3];

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

static Image img_icon_heart;
static Image img_icon_food;
static Image img_icon_water;
static Image img_icon_sleep;

static float cam_x = 0;
static float cam_y = 0;
static float zoom = 1.0f;
static int last_mx = 0;
static int last_my = 0;

static int selected_entity_idx = -1;
static bool is_paused = false;
static int target_tps = 60;
static float sim_accumulator = 0.0f;

// ---------------------------------------------------------------------------
// Drawing & Formatting Helpers
// ---------------------------------------------------------------------------

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
    if (size != 0) scale(size, size);
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

static inline void format_stat_str(char* buf, int val, int max_val) {
    int idx = 0;
    if (val >= 100) buf[idx++] = '0' + (val / 100);
    if (val >= 10)  buf[idx++] = '0' + ((val / 10) % 10);
    buf[idx++] = '0' + (val % 10);
    buf[idx++] = '/';
    if (max_val >= 100) buf[idx++] = '0' + (max_val / 100);
    if (max_val >= 10)  buf[idx++] = '0' + ((max_val / 10) % 10);
    buf[idx++] = '0' + (max_val % 10);
    buf[idx] = '\0';
}

// ---------------------------------------------------------------------------
// Engine Setup Initialization
// ---------------------------------------------------------------------------

void preload() {
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

    img_icon_heart = load_image("Other_Heart.png");
    img_icon_food = load_image("Item_Bread.png");
    img_icon_water = load_image("Other_Water.png");
    img_icon_sleep = load_image("Other_Sleep.png");
}

void setup() {
    int cx = 0, cy = 0;
    setup_game_species_and_world(&cx, &cy);
    cam_x = (float)cx;
    cam_y = (float)cy;
}

// ---------------------------------------------------------------------------
// Main Game Loop & Renderer
// ---------------------------------------------------------------------------

void draw() {
    float dt = wagner.delta_time;
    if (dt > 0.1f) dt = 0.1f;

    // Space Key: Toggle Pause / Unpause
    static bool space_was_down = false;
    if (wagner.keys[KEY_SPACE]) {
        if (!space_was_down) {
            space_was_down = true;
            is_paused = !is_paused;
        }
    } else {
        space_was_down = false;
    }

    // + / - Keys: Adjust Simulation Time Speed (1 to 360 TPS)
    static bool plus_was_down = false;
    static bool minus_was_down = false;
    if (wagner.keys[KEY_KP_PLUS]) {
        if (!plus_was_down) {
            plus_was_down = true;
            if (target_tps < 60) target_tps += 15;
            else if (target_tps < 120) target_tps = 120;
            else if (target_tps < 240) target_tps = 240;
            else if (target_tps < 360) target_tps = 360;
        }
    } else {
        plus_was_down = false;
    }

    if (wagner.keys[KEY_KP_MINUS]) {
        if (!minus_was_down) {
            minus_was_down = true;
            if (target_tps > 240) target_tps = 240;
            else if (target_tps > 120) target_tps = 120;
            else if (target_tps > 60) target_tps = 60;
            else if (target_tps > 15) target_tps -= 15;
            else if (target_tps > 1) target_tps = 1;
        }
    } else {
        minus_was_down = false;
    }

    // Inverted Mouse Wheel Zoom
    int32_t wheel = _wagner_rom.state.mouse_wheel;
    if (wheel > 0) zoom /= 1.12f;
    else if (wheel < 0) zoom *= 1.12f;

    // Q / E Keys: Manual Zoom In & Out
    if (wagner.keys[KEY_Q]) zoom *= (1.0f + 1.2f * dt);
    if (wagner.keys[KEY_E]) zoom /= (1.0f + 1.2f * dt);
    if (zoom < 0.2f) zoom = 0.2f;
    if (zoom > 3.0f) zoom = 3.0f;

    // Run Engine Simulation (TPS Speed Stepping, capped per frame)
    if (!is_paused) {
        sim_accumulator += dt;
        float step_dt = 1.0f / (float)target_tps;
        int max_steps_per_frame = 30;
        int steps = 0;
        while (sim_accumulator >= step_dt && steps < max_steps_per_frame) {
            sim_accumulator -= step_dt;
            steps++;
            for (int i = 0; i < MAX_ENTITIES; i++) {
                update_entity_simulation(&world.entities[i], step_dt);
            }
        }
        if (steps >= max_steps_per_frame) sim_accumulator = 0.0f;
    }

    float actual_scale = zoom;
    int tile_size = 0;
    if (img_tiles[FLOOR].pixels) {
        tile_size = (int)(img_tiles[FLOOR].width * zoom);
        if (tile_size < 4) tile_size = 4;
        actual_scale = (float)tile_size / img_tiles[FLOOR].width;
    }

    // Manual Camera Pan (WASD / Arrow Keys / Mouse Drag)
    bool moved_cam_manually = false;
    float cam_speed = 15.0f * dt;
    if (wagner.keys[KEY_W] || wagner.keys[KEY_UP])    { cam_y -= cam_speed; moved_cam_manually = true; }
    if (wagner.keys[KEY_S] || wagner.keys[KEY_DOWN])  { cam_y += cam_speed; moved_cam_manually = true; }
    if (wagner.keys[KEY_A] || wagner.keys[KEY_LEFT])  { cam_x -= cam_speed; moved_cam_manually = true; }
    if (wagner.keys[KEY_D] || wagner.keys[KEY_RIGHT]) { cam_x += cam_speed; moved_cam_manually = true; }

    int mouse_dx = wagner.mouse.x - last_mx;
    int mouse_dy = wagner.mouse.y - last_my;

    if (wagner.mouse_down && tile_size > 0 && wagner.mouse.y < 175) {
        if (mouse_dx != 0 || mouse_dy != 0) {
            cam_x -= (float)mouse_dx / tile_size;
            cam_y -= (float)mouse_dy / tile_size;
            // Only set moved_cam_manually if actual drag distance is greater than 2px (prevents click deselect!)
            if (mouse_dx * mouse_dx + mouse_dy * mouse_dy > 4) {
                moved_cam_manually = true;
            }
        }
    }
    last_mx = wagner.mouse.x;
    last_my = wagner.mouse.y;

    // Manual camera pan cancels unit selection & returns to Freecam
    if (moved_cam_manually) {
        selected_entity_idx = -1;
    }

    // Automatic Camera Following: Follow selected unit if valid
    if (selected_entity_idx >= 0 && selected_entity_idx < MAX_ENTITIES && world.entities[selected_entity_idx].active) {
        cam_x = (float)world.entities[selected_entity_idx].x;
        cam_y = (float)world.entities[selected_entity_idx].y;
    } else {
        selected_entity_idx = -1;
    }

    // Playfield Center Camera Offset Calculation
    int start_x = wagner.width / 2 - (int)((cam_x + 0.5f) * tile_size);
    int start_y = 175 / 2 - (int)((cam_y + 0.5f) * tile_size);

    // Mouse Selection & Deselection
    if (wagner.mouse_pressed) {
        int mx = wagner.mouse.x;
        int my = wagner.mouse.y;

        if (my < 175) {
            int clicked_tile_x = (int)(((float)(mx - start_x)) / tile_size);
            int clicked_tile_y = (int)(((float)(my - start_y)) / tile_size);

            int found_idx = -1;
            for (int i = 0; i < MAX_ENTITIES; i++) {
                if (world.entities[i].active && world.entities[i].x == clicked_tile_x && world.entities[i].y == clicked_tile_y) {
                    found_idx = i;
                    break;
                }
            }
            selected_entity_idx = found_idx;
        }
    }

    // TAB Key Cycling
    static bool tab_was_down = false;
    if (wagner.keys[KEY_TAB]) {
        if (!tab_was_down) {
            tab_was_down = true;
            int start_from = (selected_entity_idx < 0) ? 0 : selected_entity_idx;
            for (int step = 1; step <= MAX_ENTITIES; step++) {
                int next_idx = (start_from + step) % MAX_ENTITIES;
                if (world.entities[next_idx].active) {
                    selected_entity_idx = next_idx;
                    cam_x = (float)world.entities[next_idx].x;
                    cam_y = (float)world.entities[next_idx].y;
                    break;
                }
            }
        }
    } else {
        tab_was_down = false;
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

    // Render Path of Selected Entity
    if (selected_entity_idx >= 0 && world.entities[selected_entity_idx].active) {
        Entity* se = &world.entities[selected_entity_idx];
        for (int p = se->path_idx; p < se->path_len; p++) {
            int px = start_x + se->path[p].x * tile_size;
            int py = start_y + se->path[p].y * tile_size;
            if (px + tile_size > 0 && px < wagner.width && py + tile_size > 0 && py < wagner.height) {
                draw_box(px + tile_size / 4, py + tile_size / 4, tile_size / 2, tile_size / 2, YELLOW);
            }
        }
    }

    // Render Dropped Items
    for (int i = 0; i < MAX_DROPPED_ITEMS; i++) {
        if (world.items[i].active) {
            int draw_x = start_x + world.items[i].x * tile_size;
            int draw_y = start_y + world.items[i].y * tile_size;

            if (draw_x + tile_size > 0 && draw_x < wagner.width && 
                draw_y + tile_size > 0 && draw_y < wagner.height) {
                const char* skin_name = get_item_skin_filename(&world.items[i].spec);
                Image item_img = get_or_load_texture(skin_name);
                int item_draw_size = tile_size * 3 / 4;
                if (item_draw_size < 8) item_draw_size = 8;
                int offset = (tile_size - item_draw_size) / 2;
                draw_sprite(item_img, draw_x + offset, draw_y + offset, item_draw_size, item_draw_size);
            }
        }
    }

    // Render Entities & Selection Indicators
    for (int i = 0; i < MAX_ENTITIES; i++) {
        Entity* e = &world.entities[i];
        if (e->active) {
            int draw_x = start_x + e->x * tile_size;
            int draw_y = start_y + e->y * tile_size;

            if (draw_x + tile_size <= 0 || draw_x >= wagner.width || 
                draw_y + tile_size <= 0 || draw_y >= wagner.height) {
                continue;
            }
            
            if (e->combat_flash_timer > 0.0f) {
                draw_box(draw_x - 1, draw_y - 1, tile_size + 2, tile_size + 2, RED);
            } else if (i == selected_entity_idx) {
                draw_box(draw_x - 1, draw_y - 1, tile_size + 2, tile_size + 2, CYAN);
            }

            Image e_skin = get_or_load_texture(e->skin_filename);
            draw_sprite(e_skin, draw_x, draw_y, tile_size, tile_size);

            // Overhead Emotes
            Image emote = (Image){0};
            if (e->fatigue <= 25.0f || e->current_motor == MOTOR_SLEEP) emote = img_emote_sleeping;
            else if (e->current_motor == MOTOR_ATTACK) emote = img_emote_angry;
            else if (e->current_motor == MOTOR_FLEE) emote = img_emote_upset;
            else if (e->health < 35.0f) emote = img_emote_hurt;
            else if (e->hunger <= 30.0f || e->thirst <= 30.0f) emote = img_emote_sick;
            else if (e->current_motor == MOTOR_SOCIALIZE) emote = img_emote_happy;
            else if (e->current_motor == MOTOR_EAT || e->current_motor == MOTOR_DRINK) emote = img_emote_excited;

            if (emote.pixels) {
                int emote_size = tile_size * 3 / 4;
                if (emote_size < 8) emote_size = 8;
                draw_sprite(emote, draw_x + (tile_size - emote_size)/2, draw_y - emote_size, emote_size, emote_size);
            }
        }
    }

    // ---------------------------------------------------------------------------
    // Biological HUD Inspector Panel (Only displayed when a creature is selected)
    // ---------------------------------------------------------------------------
    if (selected_entity_idx >= 0 && selected_entity_idx < MAX_ENTITIES && world.entities[selected_entity_idx].active) {
        draw_box(0, 175, 320, 65, rgb(20, 24, 30));
        draw_box(0, 175, 320, 1, rgb(60, 80, 100));

        Entity* se = &world.entities[selected_entity_idx];

        // Column 1: Info, Species & Biological Traits
        Image se_skin = get_or_load_texture(se->skin_filename);
        draw_sprite(se_skin, 6, 180, 28, 28);
        draw_text(se->name, 38, 180, WHITE, 0);

        char title_str[36];
        title_str[0] = '[';
        int k = 0;
        while (se->species_title[k] && k < 28) { title_str[k+1] = se->species_title[k]; k++; }
        title_str[k+1] = ']'; title_str[k+2] = '\0';
        draw_text(title_str, 38, 191, GREEN, 0);

        char bio_str[32];
        const char* mov_str = (se->movement == MOVE_FLY) ? "Fly" : (se->movement == MOVE_AQUATIC ? "Aqua" : (se->movement == MOVE_NONE ? "Fixed" : "Walk"));
        const char* diet_str = (se->diet == DIET_PHOTOSYNTHESIS) ? "Light" : (se->diet == DIET_HERBIVORE ? "Herb" : (se->diet == DIET_CARNIVORE ? "Carn" : "Omni"));
        const char* repro_str = (se->repro == REPRO_SEX) ? "Sex" : (se->repro == REPRO_MITOSIS_SPLIT ? "Mitosis" : (se->repro == REPRO_SPORE_SEED ? "Spore" : "None"));

        int b_idx = 0;
        for (int i = 0; mov_str[i]; i++) bio_str[b_idx++] = mov_str[i];
        bio_str[b_idx++] = '/';
        for (int i = 0; diet_str[i]; i++) bio_str[b_idx++] = diet_str[i];
        bio_str[b_idx++] = '/';
        for (int i = 0; repro_str[i]; i++) bio_str[b_idx++] = repro_str[i];
        bio_str[b_idx] = '\0';

        draw_text(bio_str, 38, 202, CYAN, 0);
        draw_text(se->brain.current_thought, 6, 226, YELLOW, 0);

        // Column 2: Status Icons & White Text Numbers (Current / Max)
        int stat_x = 132;
        char num_buf[16];

        // 1. HP
        draw_sprite(img_icon_heart, stat_x + 24, 180, 10, 10);
        format_stat_str(num_buf, (int)se->health, (int)se->max_health);
        draw_text(num_buf, stat_x + 42, 181, WHITE, 0);

        // 2. Hunger
        draw_sprite(img_icon_food, stat_x + 24, 191, 10, 10);
        format_stat_str(num_buf, (int)se->hunger, (int)se->max_hunger);
        draw_text(num_buf, stat_x + 42, 192, WHITE, 0);

        // 3. Thirst
        draw_sprite(img_icon_water, stat_x + 24, 202, 10, 10);
        format_stat_str(num_buf, (int)se->thirst, (int)se->max_thirst);
        draw_text(num_buf, stat_x + 42, 203, WHITE, 0);

        // 4. Energy / Fatigue
        draw_sprite(img_icon_sleep, stat_x + 24, 213, 10, 10);
        format_stat_str(num_buf, (int)se->fatigue, (int)se->max_fatigue);
        draw_text(num_buf, stat_x + 42, 214, WHITE, 0);

        // Column 3: Inventory Grid
        draw_text("Bag:", 245, 180, WHITE, 0);
        for (int slot = 0; slot < 6; slot++) {
            int sx = 245 + (slot % 3) * 24;
            int sy = 192 + (slot / 3) * 22;
            draw_box(sx, sy, 20, 20, rgb(40, 50, 60));

            if (se->inventory[slot].spec.item_id[0] != '\0') {
                const char* skin_name = get_item_skin_filename(&se->inventory[slot].spec);
                Image item_img = get_or_load_texture(skin_name);
                draw_sprite(item_img, sx + 2, sy + 2, 16, 16);
                char num[4];
                num[0] = '0' + (se->inventory[slot].count % 10);
                num[1] = '\0';
                draw_text(num, sx + 12, sy + 11, WHITE, 0);
            }
        }
    }

    // World Clock & Climate HUD Overlay
    draw_box(4, 4, 145, 14, rgb(20, 24, 30));
    draw_box(4, 4, 145, 1, rgb(60, 80, 100));
    char clock_buf[32];
    int d_idx = 0;
    clock_buf[d_idx++] = 'D'; clock_buf[d_idx++] = 'a'; clock_buf[d_idx++] = 'y'; clock_buf[d_idx++] = ' ';
    if (world_clock.day >= 10) clock_buf[d_idx++] = '0' + (world_clock.day / 10);
    clock_buf[d_idx++] = '0' + (world_clock.day % 10);
    clock_buf[d_idx++] = ' ';
    clock_buf[d_idx++] = '0' + (world_clock.hour / 10);
    clock_buf[d_idx++] = '0' + (world_clock.hour % 10);
    clock_buf[d_idx++] = ':';
    clock_buf[d_idx++] = '0' + (world_clock.minute / 10);
    clock_buf[d_idx++] = '0' + (world_clock.minute % 10);
    clock_buf[d_idx++] = ' ';
    clock_buf[d_idx++] = 'L';
    clock_buf[d_idx++] = ':';
    int light_pct = (int)(world_clock.global_light * 100.0f);
    if (light_pct > 99) light_pct = 99;
    if (light_pct >= 10) clock_buf[d_idx++] = '0' + (light_pct / 10);
    clock_buf[d_idx++] = '0' + (light_pct % 10);
    clock_buf[d_idx++] = '%';
    clock_buf[d_idx] = '\0';
    draw_text(clock_buf, 8, 7, YELLOW, 0);

    // Time Speed & Pause Status Overlay
    if (is_paused) {
        draw_box(155, 4, 95, 14, rgb(40, 20, 20));
        draw_box(155, 4, 95, 1, RED);
        draw_text("[ PAUSED ]", 165, 7, RED, 0);
    } else {
        draw_box(155, 4, 140, 14, rgb(20, 35, 20));
        draw_box(155, 4, 140, 1, GREEN);
        char speed_buf[32];
        int s_idx = 0;
        speed_buf[s_idx++] = '['; speed_buf[s_idx++] = ' '; speed_buf[s_idx++] = 'R'; speed_buf[s_idx++] = 'U'; speed_buf[s_idx++] = 'N'; speed_buf[s_idx++] = ' ';
        speed_buf[s_idx++] = '(';
        if (target_tps >= 10) speed_buf[s_idx++] = '0' + (target_tps / 10);
        speed_buf[s_idx++] = '0' + (target_tps % 10);
        speed_buf[s_idx++] = 't'; speed_buf[s_idx++] = 'p'; speed_buf[s_idx++] = 's'; speed_buf[s_idx++] = ')';
        speed_buf[s_idx++] = ' '; speed_buf[s_idx++] = ']'; speed_buf[s_idx] = '\0';
        draw_text(speed_buf, 161, 7, GREEN, 0);
    }
}
