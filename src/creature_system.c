#include "creature_system.h"

World world = {0};

WorldClock world_clock = { .day = 0, .hour = 0, .minute = 0, .total_ticks = 0, .time_accumulator = 0.0f, .global_light = 0.0f, .global_heat = 0.2f };
WorldModifier world_mod = { .light_mode = WORLD_LIGHT_STANDARD, .sunrise_hour = 6, .sunset_hour = 18, .max_light_level = 1.0f };

const uint8_t tile_collision[] = {
    [FLOOR] = 0,
    [MOUNTAIN] = 1,
    [WATER] = 1,
};

// ---------------------------------------------------------------------------
// World Time, Light & Heat Simulation
// ---------------------------------------------------------------------------

void update_world_clock(float dt) {
    world_clock.time_accumulator += dt;
    while (world_clock.time_accumulator >= 1.0f) {
        world_clock.time_accumulator -= 1.0f;
        world_clock.minute++;
        world_clock.total_ticks++;

        if (world_clock.minute >= 60) {
            world_clock.minute = 0;
            world_clock.hour++;
            if (world_clock.hour >= 24) {
                world_clock.hour = 0;
                world_clock.day++;
            }
        }
    }

    if (world_mod.light_mode == WORLD_LIGHT_PERMA_DARK) {
        world_clock.global_light = 0.15f;
        world_clock.global_heat = 0.10f;
    } else if (world_mod.light_mode == WORLD_LIGHT_PERMA_BRIGHT) {
        world_clock.global_light = 1.0f;
        world_clock.global_heat = 0.90f;
    } else {
        float hour_float = (float)world_clock.hour + (float)world_clock.minute / 60.0f;
        int sr = world_mod.sunrise_hour > 0 ? world_mod.sunrise_hour : 6;
        int ss = world_mod.sunset_hour > 0 ? world_mod.sunset_hour : 18;

        if (hour_float >= (float)sr && hour_float <= (float)ss) {
            float day_progress = (hour_float - (float)sr) / (float)(ss - sr);
            if (day_progress <= 0.5f) {
                world_clock.global_light = day_progress * 2.0f;
            } else {
                world_clock.global_light = (1.0f - day_progress) * 2.0f;
            }
            if (world_clock.global_light < 0.2f) world_clock.global_light = 0.2f;
        } else {
            world_clock.global_light = 0.05f;
        }
        world_clock.global_heat = 0.15f + world_clock.global_light * 0.70f;
    }
}

float get_tile_light_level(int x, int y) {
    if (x < 0 || x >= MAP_WIDTH || y < 0 || y >= MAP_HEIGHT) return 0.0f;
    float light = world_clock.global_light;
    if (world.map[y][x] == MOUNTAIN) light *= 1.2f;
    else if (world.map[y][x] == WATER) light *= 0.9f;
    if (light > 1.0f) light = 1.0f;
    return light;
}

// ---------------------------------------------------------------------------
// Modifier Helper Constructors
// ---------------------------------------------------------------------------

Modifier mod_data(const char* name, const char* title, const char* group) {
    Modifier m = {0};
    m.type = MOD_TYPE_DATA;
    for (int i = 0; i < 31 && "dados"[i]; i++) m.mod_name[i] = "dados"[i];
    if (name)  for (int i = 0; i < 31 && name[i];  i++) m.as.data.name[i] = name[i];
    if (title) for (int i = 0; i < 31 && title[i]; i++) m.as.data.title[i] = title[i];
    if (group) for (int i = 0; i < 31 && group[i]; i++) m.as.data.group[i] = group[i];
    return m;
}

Modifier mod_skin(const char* filename) {
    Modifier m = {0};
    m.type = MOD_TYPE_SKIN;
    for (int i = 0; i < 31 && "skin"[i]; i++) m.mod_name[i] = "skin"[i];
    if (filename) for (int i = 0; i < 63 && filename[i]; i++) m.as.skin.filename[i] = filename[i];
    return m;
}

Modifier mod_movement(const char* mod_name, MovementType type) {
    Modifier m = {0};
    m.type = MOD_TYPE_MOVEMENT;
    const char* tag = mod_name ? mod_name : "movimento";
    for (int i = 0; i < 31 && tag[i]; i++) m.mod_name[i] = tag[i];
    m.as.movement.movement = type;
    return m;
}

Modifier mod_diet(const char* mod_name, DietType diet) {
    Modifier m = {0};
    m.type = MOD_TYPE_DIET;
    const char* tag = mod_name ? mod_name : "dieta";
    for (int i = 0; i < 31 && tag[i]; i++) m.mod_name[i] = tag[i];
    m.as.diet.diet = diet;
    return m;
}

Modifier mod_repro(const char* mod_name, ReproType repro) {
    Modifier m = {0};
    m.type = MOD_TYPE_REPRODUCTION;
    const char* tag = mod_name ? mod_name : "reproducao";
    for (int i = 0; i < 31 && tag[i]; i++) m.mod_name[i] = tag[i];
    m.as.repro.repro = repro;
    return m;
}

Modifier mod_stats(const char* mod_name, float hp, float hunger, float thirst) {
    Modifier m = {0};
    m.type = MOD_TYPE_STATS;
    const char* tag = mod_name ? mod_name : "status";
    for (int i = 0; i < 31 && tag[i]; i++) m.mod_name[i] = tag[i];
    m.as.stats.max_hp = hp;
    m.as.stats.max_hunger = hunger;
    m.as.stats.max_thirst = thirst;
    return m;
}

Modifier mod_combat(const char* mod_name, float atk, float def, float aggro) {
    Modifier m = {0};
    m.type = MOD_TYPE_COMBAT;
    const char* tag = mod_name ? mod_name : "combate";
    for (int i = 0; i < 31 && tag[i]; i++) m.mod_name[i] = tag[i];
    m.as.combat.attack = atk;
    m.as.combat.defense = def;
    m.as.combat.aggro_range = aggro;
    return m;
}

Modifier mod_personality(const char* mod_name, int bravery, int gluttony, int sociability, int curiosity) {
    Modifier m = {0};
    m.type = MOD_TYPE_PERSONALITY;
    const char* tag = mod_name ? mod_name : "personalidade";
    for (int i = 0; i < 31 && tag[i]; i++) m.mod_name[i] = tag[i];
    m.as.personality.bravery = bravery;
    m.as.personality.gluttony = gluttony;
    m.as.personality.sociability = sociability;
    m.as.personality.curiosity = curiosity;
    return m;
}

Modifier mod_loot(const char* mod_name, const ItemSpec* spec, int min_c, int max_c, float chance) {
    Modifier m = {0};
    m.type = MOD_TYPE_LOOT;
    const char* tag = mod_name ? mod_name : "loot";
    for (int i = 0; i < 31 && tag[i]; i++) m.mod_name[i] = tag[i];
    if (spec) m.as.loot.spec = *spec;
    m.as.loot.min_count = min_c;
    m.as.loot.max_count = max_c;
    m.as.loot.chance = chance;
    return m;
}

Modifier mod_behavior(const char* mod_name, BehaviorType behavior) {
    Modifier m = {0};
    m.type = MOD_TYPE_BEHAVIOR;
    const char* tag = mod_name ? mod_name : "comportamento";
    for (int i = 0; i < 31 && tag[i]; i++) m.mod_name[i] = tag[i];
    m.as.behavior.behavior = behavior;
    return m;
}

Modifier mod_ability(const char* mod_name, AbilityType ability, float power) {
    Modifier m = {0};
    m.type = MOD_TYPE_SPECIAL_ABILITY;
    const char* tag = mod_name ? mod_name : "habilidade";
    for (int i = 0; i < 31 && tag[i]; i++) m.mod_name[i] = tag[i];
    m.as.ability.ability = ability;
    m.as.ability.power = power;
    return m;
}

Modifier mod_metabolism(const char* mod_name, MetabolismType meta) {
    Modifier m = {0};
    m.type = MOD_TYPE_METABOLISM;
    const char* tag = mod_name ? mod_name : "metabolismo";
    for (int i = 0; i < 31 && tag[i]; i++) m.mod_name[i] = tag[i];
    m.as.metabolism.type = meta;
    return m;
}

Modifier mod_preferences(const char* mod_name, int terrain, const char* p_food, const char* p_spec, const char* h_spec, float bonus) {
    Modifier m = {0};
    m.type = MOD_TYPE_PREFERENCES;
    const char* tag = mod_name ? mod_name : "preferencias";
    for (int i = 0; i < 31 && tag[i]; i++) m.mod_name[i] = tag[i];
    m.as.preferences.preferred_terrain = terrain;
    if (p_food) for (int i = 0; i < 31 && p_food[i]; i++) m.as.preferences.preferred_food_mod[i] = p_food[i];
    if (p_spec) for (int i = 0; i < 31 && p_spec[i]; i++) m.as.preferences.preferred_species[i] = p_spec[i];
    if (h_spec) for (int i = 0; i < 31 && h_spec[i]; i++) m.as.preferences.hated_species[i] = h_spec[i];
    m.as.preferences.bonus_multiplier = bonus > 0.0f ? bonus : 1.25f;
    return m;
}

Modifier mod_plant(const char* mod_name, bool sunlight, bool produces_fruit, float interval, const char* fruit_id) {
    Modifier m = {0};
    m.type = MOD_TYPE_PLANT;
    const char* tag = mod_name ? mod_name : "planta";
    for (int i = 0; i < 31 && tag[i]; i++) m.mod_name[i] = tag[i];
    m.as.plant.requires_sunlight = sunlight;
    m.as.plant.produces_fruit = produces_fruit;
    m.as.plant.fruit_spawn_interval = interval > 0.0f ? interval : 20.0f;
    m.as.plant.fruit_spawn_timer = 0.0f;
    if (fruit_id) for (int i = 0; i < 31 && fruit_id[i]; i++) m.as.plant.fruit_item_id[i] = fruit_id[i];
    return m;
}

// ---------------------------------------------------------------------------
// Modifier Application Engine
// ---------------------------------------------------------------------------

void apply_entity_modifiers(Entity* e, const Modifier* modifiers, int count) {
    if (!e || !modifiers || count <= 0) return;

    for (int i = 0; i < count; i++) {
        const Modifier* m = &modifiers[i];
        if (e->active_modifier_count < 12) {
            e->active_modifiers[e->active_modifier_count++] = *m;
        }

        switch (m->type) {
            case MOD_TYPE_DATA:
                for (int k = 0; k < 31; k++) e->name[k] = m->as.data.name[k];
                for (int k = 0; k < 31; k++) e->species_title[k] = m->as.data.title[k];
                for (int k = 0; k < 31; k++) e->group_tag[k] = m->as.data.group[k];
                break;
            case MOD_TYPE_SKIN:
                for (int k = 0; k < 63; k++) e->skin_filename[k] = m->as.skin.filename[k];
                break;
            case MOD_TYPE_MOVEMENT:
                e->movement = m->as.movement.movement;
                break;
            case MOD_TYPE_DIET:
                e->diet = m->as.diet.diet;
                break;
            case MOD_TYPE_REPRODUCTION:
                e->repro = m->as.repro.repro;
                break;
            case MOD_TYPE_STATS:
                e->max_health = m->as.stats.max_hp > 0 ? m->as.stats.max_hp : 100.0f;
                e->health = e->max_health;
                e->max_hunger = m->as.stats.max_hunger > 0 ? m->as.stats.max_hunger : 100.0f;
                e->hunger = e->max_hunger;
                e->max_thirst = m->as.stats.max_thirst > 0 ? m->as.stats.max_thirst : 100.0f;
                e->thirst = e->max_thirst;
                break;
            case MOD_TYPE_COMBAT:
                e->attack_power = m->as.combat.attack;
                e->defense = m->as.combat.defense;
                e->aggro_range = m->as.combat.aggro_range;
                break;
            case MOD_TYPE_PERSONALITY:
                e->brain.bravery = m->as.personality.bravery;
                e->brain.gluttony = m->as.personality.gluttony;
                e->brain.sociability = m->as.personality.sociability;
                e->brain.curiosity = m->as.personality.curiosity;
                break;
            case MOD_TYPE_LOOT:
                if (e->loot_count < 4) {
                    e->loot_table[e->loot_count++] = m->as.loot;
                }
                break;
            case MOD_TYPE_BEHAVIOR:
                e->behavior = m->as.behavior.behavior;
                break;
            case MOD_TYPE_SPECIAL_ABILITY:
                e->ability = m->as.ability.ability;
                e->ability_power = m->as.ability.power;
                break;
            case MOD_TYPE_METABOLISM:
                e->metabolism = m->as.metabolism.type;
                break;
            case MOD_TYPE_PREFERENCES:
                e->preferences = m->as.preferences;
                break;
            case MOD_TYPE_PLANT:
                e->is_plant = true;
                e->plant = m->as.plant;
                break;
        }
    }
}

Entity* spawn_entity_from_spec(const CreatureSpec* spec, int x, int y) {
    for (int i = 0; i < MAX_ENTITIES; i++) {
        if (!world.entities[i].active) {
            Entity* e = &world.entities[i];
            for (int k = 0; k < sizeof(Entity); k++) ((char*)e)[k] = 0;
            
            e->id = i + 1;
            e->x = x;
            e->y = y;
            e->home_x = x;
            e->home_y = y;
            e->active = true;
            e->max_health = 100.0f; e->health = 100.0f;
            e->max_hunger = 100.0f; e->hunger = (float)random_int(75, 100);
            e->max_thirst = 100.0f; e->thirst = (float)random_int(75, 100);
            e->max_fatigue = 100.0f; e->fatigue = (float)random_int(80, 100);
            e->attack_speed = 1.0f;
            e->target_entity_id = -1;
            e->movement = MOVE_WALK;
            e->diet = DIET_OMNIVORE;
            e->repro = REPRO_NONE;
            e->preferences.preferred_terrain = -1;
            
            apply_entity_modifiers(e, spec->modifiers, spec->modifier_count);
            return e;
        }
    }
    return NULL;
}

// ---------------------------------------------------------------------------
// Item & Data-Driven Inventory Helpers
// ---------------------------------------------------------------------------

const char* get_item_skin_filename(const ItemSpec* spec) {
    if (!spec) return "";
    for (int i = 0; i < spec->modifier_count; i++) {
        if (spec->modifiers[i].type == ITEM_MOD_SKIN) {
            return spec->modifiers[i].as.skin.filename;
        }
    }
    return "";
}

static bool strings_equal(const char* a, const char* b) {
    if (!a || !b) return false;
    int i = 0;
    while (a[i] && b[i]) {
        if (a[i] != b[i]) return false;
        i++;
    }
    return a[i] == b[i];
}

static bool item_specs_equal(const ItemSpec* a, const ItemSpec* b) {
    if (!a || !b) return false;
    return strings_equal(a->item_id, b->item_id);
}

bool entity_add_item_spec(Entity* e, const ItemSpec* spec, int count) {
    if (!spec || count <= 0) return false;
    for (int i = 0; i < 6; i++) {
        if (e->inventory[i].spec.item_id[0] != '\0' && item_specs_equal(&e->inventory[i].spec, spec)) {
            e->inventory[i].count += count;
            return true;
        }
    }
    for (int i = 0; i < 6; i++) {
        if (e->inventory[i].spec.item_id[0] == '\0') {
            e->inventory[i].spec = *spec;
            e->inventory[i].count = count;
            return true;
        }
    }
    return false;
}

bool entity_consume_food_spec(Entity* e) {
    if (e->diet == DIET_NONE || e->diet == DIET_PHOTOSYNTHESIS) return true;

    for (int i = 0; i < 6; i++) {
        if (e->inventory[i].spec.item_id[0] == '\0') continue;
        const ItemSpec* spec = &e->inventory[i].spec;

        for (int m = 0; m < spec->modifier_count; m++) {
            if (spec->modifiers[m].type == ITEM_MOD_CONSUMABLE) {
                float r_hunger = spec->modifiers[m].as.consumable.restore_hunger;
                float r_health = spec->modifiers[m].as.consumable.restore_health;

                if (r_hunger > 0.0f || r_health > 0.0f) {
                    e->hunger += r_hunger;
                    if (e->hunger > e->max_hunger) e->hunger = e->max_hunger;
                    e->health += r_health;
                    if (e->health > e->max_health) e->health = e->max_health;

                    e->inventory[i].count--;
                    if (e->inventory[i].count <= 0) e->inventory[i].spec.item_id[0] = '\0';
                    return true;
                }
            }
        }
    }
    return false;
}

bool entity_consume_water_spec(Entity* e) {
    for (int i = 0; i < 6; i++) {
        if (e->inventory[i].spec.item_id[0] == '\0') continue;
        const ItemSpec* spec = &e->inventory[i].spec;

        for (int m = 0; m < spec->modifier_count; m++) {
            if (spec->modifiers[m].type == ITEM_MOD_CONSUMABLE) {
                float r_thirst = spec->modifiers[m].as.consumable.restore_thirst;
                if (r_thirst > 0.0f) {
                    e->thirst += r_thirst;
                    if (e->thirst > e->max_thirst) e->thirst = e->max_thirst;

                    e->inventory[i].count--;
                    if (e->inventory[i].count <= 0) e->inventory[i].spec.item_id[0] = '\0';
                    return true;
                }
            }
        }
    }
    return false;
}

bool is_tile_occupied_by_item(int x, int y) {
    if (x < 0 || x >= MAP_WIDTH || y < 0 || y >= MAP_HEIGHT) return true;
    for (int i = 0; i < MAX_DROPPED_ITEMS; i++) {
        if (world.items[i].active && world.items[i].x == x && world.items[i].y == y) {
            return true;
        }
    }
    return false;
}

void spawn_dropped_item_spec(int x, int y, const ItemSpec* spec, int count) {
    if (!spec || count <= 0) return;
    for (int i = 0; i < MAX_DROPPED_ITEMS; i++) {
        if (!world.items[i].active) {
            world.items[i].x = x;
            world.items[i].y = y;
            world.items[i].spec = *spec;
            world.items[i].count = count;
            world.items[i].active = true;
            break;
        }
    }
}

void spawn_dropped_item_scatter(int origin_x, int origin_y, const ItemSpec* spec, int count) {
    if (!spec || count <= 0) return;

    int target_x = origin_x;
    int target_y = origin_y;
    bool found_tile = false;

    for (int r = 0; r <= 8 && !found_tile; r++) {
        if (r == 0) {
            if (!is_tile_occupied_by_item(origin_x, origin_y) && is_tile_walkable_for(origin_x, origin_y, MOVE_WALK)) {
                target_x = origin_x;
                target_y = origin_y;
                found_tile = true;
            }
        } else {
            for (int dy = -r; dy <= r && !found_tile; dy++) {
                for (int dx = -r; dx <= r && !found_tile; dx++) {
                    if (dx*dx + dy*dy <= r*r && (dx*dx + dy*dy) > (r-1)*(r-1)) {
                        int tx = origin_x + dx;
                        int ty = origin_y + dy;
                        if (!is_tile_occupied_by_item(tx, ty) && is_tile_walkable_for(tx, ty, MOVE_WALK)) {
                            target_x = tx;
                            target_y = ty;
                            found_tile = true;
                        }
                    }
                }
            }
        }
    }

    if (!found_tile) {
        target_x = origin_x;
        target_y = origin_y;
    }

    spawn_dropped_item_spec(target_x, target_y, spec, count);
}

void trigger_entity_loot_drop(Entity* e) {
    // Drop 100% of all items in inventory scattered in all directions (no 2 items on same tile!)
    for (int i = 0; i < 6; i++) {
        if (e->inventory[i].spec.item_id[0] != '\0' && e->inventory[i].count > 0) {
            spawn_dropped_item_scatter(e->x, e->y, &e->inventory[i].spec, e->inventory[i].count);
            e->inventory[i].spec.item_id[0] = '\0';
            e->inventory[i].count = 0;
        }
    }
    // Drop extra loot from entity's loot table scattered outwards
    for (int d = 0; d < e->loot_count; d++) {
        LootDrop* lt = &e->loot_table[d];
        if (lt->spec.item_id[0] != '\0') {
            float roll = (float)random_int(0, 100) / 100.0f;
            if (roll <= lt->chance) {
                int amount = random_int(lt->min_count, lt->max_count);
                spawn_dropped_item_scatter(e->x, e->y, &lt->spec, amount);
            }
        }
    }
}

void entity_pickup_at(Entity* e, int x, int y) {
    for (int i = 0; i < MAX_DROPPED_ITEMS; i++) {
        if (world.items[i].active && world.items[i].x == x && world.items[i].y == y) {
            if (entity_add_item_spec(e, &world.items[i].spec, world.items[i].count)) {
                world.items[i].active = false;
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Pathfinding & Movement Validation
// ---------------------------------------------------------------------------

#define BFS_RADIUS 40
#define BFS_GRID_SIZE (BFS_RADIUS * 2 + 1)

bool is_tile_walkable_for(int x, int y, MovementType movement) {
    if (x < 0 || x >= MAP_WIDTH || y < 0 || y >= MAP_HEIGHT) return false;
    if (movement == MOVE_NONE) return false;
    if (movement == MOVE_FLY) return true;
    if (movement == MOVE_AQUATIC) return world.map[y][x] == WATER;
    return tile_collision[world.map[y][x]] == 0;
}

int find_path_for(int sx, int sy, int gx, int gy, MovementType movement, GridPos* out_path, int max_out) {
    if (sx == gx && sy == gy) return 0;
    if (movement == MOVE_NONE) return 0;
    
    if (!is_tile_walkable_for(gx, gy, movement)) {
        int best_nx = gx, best_ny = gy;
        float min_d = 999999.0f;
        int dx_opts[] = {0, 0, -1, 1, -1, 1, -1, 1};
        int dy_opts[] = {-1, 1, 0, 0, -1, -1, 1, 1};
        bool found_adj = false;
        for (int i = 0; i < 8; i++) {
            int nx = gx + dx_opts[i];
            int ny = gy + dy_opts[i];
            if (is_tile_walkable_for(nx, ny, movement)) {
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
                if (!visited[ly][lx] && is_tile_walkable_for(nx, ny, movement)) {
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

// ---------------------------------------------------------------------------
// LAYER 1: BASE CAPABILITIES & SENSORS API
// ---------------------------------------------------------------------------

bool brain_perceive_item_by_modifier_name(Entity* self, const char* target_mod_name, int* out_x, int* out_y) {
    if (!target_mod_name || target_mod_name[0] == '\0') return false;
    float min_dist = 999999.0f;
    int best_x = -1, best_y = -1;

    for (int i = 0; i < MAX_DROPPED_ITEMS; i++) {
        if (!world.items[i].active) continue;
        const ItemSpec* spec = &world.items[i].spec;
        bool has_mod = false;

        for (int m = 0; m < spec->modifier_count; m++) {
            if (strings_equal(spec->modifiers[m].mod_name, target_mod_name)) {
                has_mod = true;
                break;
            }
        }

        if (has_mod) {
            float d = (float)((world.items[i].x - self->x)*(world.items[i].x - self->x) + (world.items[i].y - self->y)*(world.items[i].y - self->y));
            if (d < min_dist) {
                min_dist = d;
                best_x = world.items[i].x;
                best_y = world.items[i].y;
            }
        }
    }
    if (best_x != -1) {
        if (out_x) *out_x = best_x;
        if (out_y) *out_y = best_y;
        return true;
    }
    return false;
}

Entity* brain_perceive_creature_by_modifier_name(Entity* self, const char* target_mod_name) {
    if (!target_mod_name || target_mod_name[0] == '\0') return NULL;
    float min_dist = 999999.0f;
    Entity* best = NULL;

    for (int i = 0; i < MAX_ENTITIES; i++) {
        Entity* other = &world.entities[i];
        if (!other->active || other->id == self->id) continue;

        bool has_mod = false;
        for (int m = 0; m < other->active_modifier_count; m++) {
            if (strings_equal(other->active_modifiers[m].mod_name, target_mod_name)) {
                has_mod = true;
                break;
            }
        }

        if (has_mod) {
            float d = (float)((other->x - self->x)*(other->x - self->x) + (other->y - self->y)*(other->y - self->y));
            if (d < min_dist) {
                min_dist = d;
                best = other;
            }
        }
    }
    return best;
}

void add_or_update_negative_preference(Entity* victim, Entity* attacker) {
    if (!victim || !attacker || victim->id == attacker->id) return;

    bool found = false;
    for (int i = 0; i < victim->active_modifier_count; i++) {
        if (victim->active_modifiers[i].type == MOD_TYPE_PREFERENCES) {
            PreferenceData* p = &victim->active_modifiers[i].as.preferences;
            if (strings_equal(p->hated_species, attacker->species_title) || p->hated_unit_id == attacker->id) {
                p->species_affinity -= 0.30f;
                p->hated_unit_id = attacker->id;
                victim->preferences.species_affinity = p->species_affinity;
                victim->preferences.hated_unit_id = attacker->id;
                found = true;
                break;
            }
        }
    }

    if (!found) {
        Modifier m = mod_preferences("grudge", -1, NULL, NULL, attacker->species_title, 1.25f);
        m.as.preferences.hated_unit_id = attacker->id;
        m.as.preferences.species_affinity = -0.75f;
        if (victim->active_modifier_count < 12) {
            victim->active_modifiers[victim->active_modifier_count++] = m;
        }
        victim->preferences = m.as.preferences;
    }
}

Entity* brain_perceive_closest_threat(Entity* self) {
    float min_score = (self->aggro_range * self->aggro_range) * 1.5f;
    Entity* best = NULL;

    for (int i = 0; i < MAX_ENTITIES; i++) {
        Entity* other = &world.entities[i];
        if (!other->active || other->id == self->id) continue;
        
        bool is_hostile = false;
        float hostility_weight = 1.0f;

        if (self->group_tag[0] != '\0' && other->group_tag[0] != '\0' && !strings_equal(self->group_tag, other->group_tag)) {
            is_hostile = true;
        }

        if (self->preferences.hated_species[0] != '\0' && strings_equal(self->preferences.hated_species, other->species_title)) {
            is_hostile = true;
            hostility_weight += 2.0f - self->preferences.species_affinity;
        }
        if (self->preferences.hated_unit_id == other->id) {
            is_hostile = true;
            hostility_weight += 4.0f;
        }

        float effective_aggro = self->aggro_range;
        if (other->ability == ABILITY_CAMOUFLAGE) effective_aggro *= 0.5f;

        if (is_hostile) {
            float dist_sq = (float)((other->x - self->x)*(other->x - self->x) + (other->y - self->y)*(other->y - self->y));
            if (dist_sq <= effective_aggro * effective_aggro * 2.2f) {
                float score = dist_sq / hostility_weight;
                if (score < min_score) {
                    min_score = score;
                    best = other;
                }
            }
        }
    }
    return best;
}

Entity* brain_perceive_closest_ally(Entity* self) {
    if (self->group_tag[0] == '\0') return NULL;
    float min_dist = (self->aggro_range * 1.5f) * (self->aggro_range * 1.5f);
    Entity* best = NULL;

    for (int i = 0; i < MAX_ENTITIES; i++) {
        Entity* other = &world.entities[i];
        if (!other->active || other->id == self->id) continue;
        
        if (strings_equal(self->group_tag, other->group_tag)) {
            float dist = (float)((other->x - self->x)*(other->x - self->x) + (other->y - self->y)*(other->y - self->y));
            if (dist <= min_dist) {
                min_dist = dist;
                best = other;
            }
        }
    }
    return best;
}

Entity* brain_perceive_closest_mate(Entity* self) {
    if (self->repro != REPRO_SEX) return NULL;
    float min_dist = (self->aggro_range * 2.0f) * (self->aggro_range * 2.0f);
    Entity* best = NULL;

    for (int i = 0; i < MAX_ENTITIES; i++) {
        Entity* other = &world.entities[i];
        if (!other->active || other->id == self->id) continue;
        
        if (other->repro == REPRO_SEX && strings_equal(self->species_title, other->species_title)) {
            if (other->health > other->max_health * 0.7f && other->hunger > other->max_hunger * 0.6f && other->fatigue > 50.0f) {
                float dist = (float)((other->x - self->x)*(other->x - self->x) + (other->y - self->y)*(other->y - self->y));
                if (dist <= min_dist) {
                    min_dist = dist;
                    best = other;
                }
            }
        }
    }
    return best;
}

bool brain_perceive_food(Entity* self, int* out_x, int* out_y) {
    if (self->diet == DIET_NONE || self->diet == DIET_PHOTOSYNTHESIS) return false;
    
    float min_score = 999999.0f;
    int best_x = -1, best_y = -1;

    for (int i = 0; i < MAX_DROPPED_ITEMS; i++) {
        if (!world.items[i].active) continue;
        const ItemSpec* spec = &world.items[i].spec;
        bool is_food = false;

        for (int m = 0; m < spec->modifier_count; m++) {
            if (strings_equal(spec->modifiers[m].mod_name, "comida")) {
                is_food = true;
                break;
            }
        }

        if (is_food) {
            float dist_sq = (float)((world.items[i].x - self->x)*(world.items[i].x - self->x) + (world.items[i].y - self->y)*(world.items[i].y - self->y));
            float weight = 1.0f;

            if (self->preferences.preferred_food_mod[0] != '\0' && strings_equal(spec->item_id, self->preferences.preferred_food_mod)) {
                weight = self->preferences.food_affinity > 0.0f ? self->preferences.food_affinity : 2.5f;
            }

            float score = dist_sq / weight;
            if (score < min_score) {
                min_score = score;
                best_x = world.items[i].x;
                best_y = world.items[i].y;
            }
        }
    }

    if (best_x != -1) {
        if (out_x) *out_x = best_x;
        if (out_y) *out_y = best_y;
        return true;
    }
    return false;
}

bool brain_perceive_water(Entity* self, int* out_x, int* out_y) {
    float min_dist = 999999.0f;
    int best_x = -1, best_y = -1;
    
    for (int dy = -30; dy <= 30; dy++) {
        for (int dx = -30; dx <= 30; dx++) {
            int tx = self->x + dx;
            int ty = self->y + dy;
            if (tx >= 0 && tx < MAP_WIDTH && ty >= 0 && ty < MAP_HEIGHT) {
                if (world.map[ty][tx] == WATER) {
                    int adx[] = {0, 0, -1, 1};
                    int ady[] = {-1, 1, 0, 0};
                    for (int k = 0; k < 4; k++) {
                        int wx = tx + adx[k];
                        int wy = ty + ady[k];
                        if (is_tile_walkable_for(wx, wy, self->movement)) {
                            float d = (float)((wx - self->x)*(wx - self->x) + (wy - self->y)*(wy - self->y));
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
        if (out_x) *out_x = best_x;
        if (out_y) *out_y = best_y;
        return true;
    }
    return false;
}

bool brain_perceive_water_source(Entity* self, int* out_x, int* out_y) {
    int item_x = -1, item_y = -1;
    bool has_item = brain_perceive_item_by_modifier_name(self, "bebida", &item_x, &item_y);

    int shore_x = -1, shore_y = -1;
    bool has_shore = brain_perceive_water(self, &shore_x, &shore_y);

    if (has_item && has_shore) {
        float dist_item = (float)((item_x - self->x)*(item_x - self->x) + (item_y - self->y)*(item_y - self->y));
        float dist_shore = (float)((shore_x - self->x)*(shore_x - self->x) + (shore_y - self->y)*(shore_y - self->y));
        if (dist_item <= dist_shore) {
            if (out_x) *out_x = item_x;
            if (out_y) *out_y = item_y;
            return true;
        } else {
            if (out_x) *out_x = shore_x;
            if (out_y) *out_y = shore_y;
            return true;
        }
    } else if (has_item) {
        if (out_x) *out_x = item_x;
        if (out_y) *out_y = item_y;
        return true;
    } else if (has_shore) {
        if (out_x) *out_x = shore_x;
        if (out_y) *out_y = shore_y;
        return true;
    }
    return false;
}

void brain_do_move_to(Entity* self, int target_x, int target_y) {
    if (self->movement == MOVE_NONE) return;
    self->current_motor = MOTOR_MOVE;

    bool target_changed = false;
    if (self->path_len > 0) {
        GridPos last_node = self->path[self->path_len - 1];
        if (last_node.x != target_x || last_node.y != target_y) {
            target_changed = true;
        }
    }

    if (self->path_len == 0 || self->path_idx >= self->path_len || target_changed) {
        self->path_len = find_path_for(self->x, self->y, target_x, target_y, self->movement, self->path, MAX_PATH_NODES);
        self->path_idx = 0;
    }
}

bool brain_do_eat(Entity* self) {
    if (entity_consume_food_spec(self)) {
        self->current_motor = MOTOR_EAT;
        for (int k = 0; k < 63 && "Eating food item"; k++) self->brain.current_thought[k] = "Eating food item"[k];
        self->path_len = 0;
        return true;
    }

    int fx, fy;
    if (brain_perceive_food(self, &fx, &fy)) {
        self->current_motor = MOTOR_EAT;
        for (int k = 0; k < 63 && "Seeking food"; k++) self->brain.current_thought[k] = "Seeking food"[k];
        brain_do_move_to(self, fx, fy);
        return true;
    }

    return false;
}

bool brain_do_drink(Entity* self) {
    // Priority 1: Drink from inventory item if held
    if (entity_consume_water_spec(self)) {
        self->current_motor = MOTOR_DRINK;
        for (int k = 0; k < 63 && "Drinking water item"; k++) self->brain.current_thought[k] = "Drinking water item"[k];
        self->path_len = 0;
        return true;
    }

    // Priority 2: Check if standing on shore adjacent to natural water
    bool near_water = false;
    int dx[] = {0, 0, -1, 1};
    int dy[] = {-1, 1, 0, 0};
    for (int k = 0; k < 4; k++) {
        int nx = self->x + dx[k];
        int ny = self->y + dy[k];
        if (nx >= 0 && nx < MAP_WIDTH && ny >= 0 && ny < MAP_HEIGHT && world.map[ny][nx] == WATER) {
            near_water = true;
            break;
        }
    }

    if (near_water) {
        self->current_motor = MOTOR_DRINK;
        for (int k = 0; k < 63 && "Drinking at shore"; k++) self->brain.current_thought[k] = "Drinking at shore"[k];
        self->thirst += 60.0f;
        if (self->thirst > self->max_thirst) self->thirst = self->max_thirst;
        self->path_len = 0;
        return true;
    }

    // Priority 3: Navigate to closest water source (dropped item OR lake shore)
    int wx, wy;
    if (brain_perceive_water_source(self, &wx, &wy)) {
        self->current_motor = MOTOR_DRINK;
        for (int k = 0; k < 63 && "Seeking water"; k++) self->brain.current_thought[k] = "Seeking water"[k];
        brain_do_move_to(self, wx, wy);
        return true;
    }

    return false;
}

void brain_do_sleep(Entity* self) {
    self->current_motor = MOTOR_SLEEP;
    self->path_len = 0;
}

void brain_do_attack(Entity* self, Entity* target) {
    if (!target || !target->active) return;
    self->current_motor = MOTOR_ATTACK;
    self->target_entity_id = target->id;

    // Register combat grudge/negative preference on victim
    add_or_update_negative_preference(target, self);

    float dist_sq = (float)((target->x - self->x)*(target->x - self->x) + (target->y - self->y)*(target->y - self->y));
    if (dist_sq <= 2.2f) {
        if (self->attack_cooldown <= 0.0f) {
            self->attack_cooldown = self->attack_speed;
            float dmg = self->attack_power - target->defense;
            if (dmg < 2.0f) dmg = 2.0f;
            target->health -= dmg;
            target->combat_flash_timer = 0.3f;

            if (self->ability == ABILITY_VAMPIRISM) {
                self->health += dmg * 0.35f;
                if (self->health > self->max_health) self->health = self->max_health;
            }
            if (self->ability == ABILITY_VENOM) {
                target->poison_timer = 5.0f;
            }
        }
        self->path_len = 0;
    } else {
        brain_do_move_to(self, target->x, target->y);
    }
}

void brain_do_flee(Entity* self, Entity* threat) {
    if (!threat || !threat->active) return;
    self->current_motor = MOTOR_FLEE;

    int dx = self->x - threat->x;
    int dy = self->y - threat->y;
    if (dx == 0 && dy == 0) dx = 1;

    int flee_x = self->x + (dx > 0 ? 8 : -8);
    int flee_y = self->y + (dy > 0 ? 8 : -8);
    brain_do_move_to(self, flee_x, flee_y);
}

void brain_do_socialize(Entity* self, Entity* ally) {
    if (!ally || !ally->active) return;
    self->current_motor = MOTOR_SOCIALIZE;
    float dist_sq = (float)((ally->x - self->x)*(ally->x - self->x) + (ally->y - self->y)*(ally->y - self->y));
    if (dist_sq > 4.0f) {
        brain_do_move_to(self, ally->x, ally->y);
    } else {
        self->path_len = 0;
    }
}

void brain_do_explore(Entity* self) {
    if (self->movement == MOVE_NONE) {
        self->current_motor = MOTOR_IDLE;
        return;
    }
    self->current_motor = MOTOR_EXPLORE;
    if (self->path_len == 0 || self->path_idx >= self->path_len) {
        int tx = self->x + random_int(-12, 12);
        int ty = self->y + random_int(-12, 12);
        if (is_tile_walkable_for(tx, ty, self->movement)) {
            brain_do_move_to(self, tx, ty);
        }
    }
}

void brain_do_idle(Entity* self) {
    self->current_motor = MOTOR_IDLE;
    self->path_len = 0;
}

// ---------------------------------------------------------------------------
// LAYER 2: HIGH-LEVEL DEVELOPER BRAIN HOOK
// ---------------------------------------------------------------------------

void entity_brain_think(Entity* self) {
    Entity* threat = brain_perceive_closest_threat(self);
    Entity* ally = brain_perceive_closest_ally(self);
    Entity* mate = brain_perceive_closest_mate(self);

    if (threat && self->attack_power > 0.0f) {
        if (self->behavior == BEHAVIOR_PACIFIST || self->brain.bravery < 40) {
            for (int k = 0; k < 63 && "Fleeing in panic!"; k++) self->brain.current_thought[k] = "Fleeing in panic!"[k];
            brain_do_flee(self, threat);
            return;
        } else {
            for (int k = 0; k < 63 && "Attacking threat!"; k++) self->brain.current_thought[k] = "Attacking threat!"[k];
            brain_do_attack(self, threat);
            return;
        }
    }

    if (self->fatigue <= 20.0f || (self->current_motor == MOTOR_SLEEP && self->fatigue < self->max_fatigue)) {
        for (int k = 0; k < 63 && "Sleeping..."; k++) self->brain.current_thought[k] = "Sleeping..."[k];
        brain_do_sleep(self);
        return;
    }

    if (self->thirst <= 45.0f) {
        if (brain_do_drink(self)) {
            return;
        }
        for (int k = 0; k < 63 && "Thirsty (No water on map)"; k++) self->brain.current_thought[k] = "Thirsty (No water on map)"[k];
    }

    if (self->diet != DIET_NONE && self->diet != DIET_PHOTOSYNTHESIS) {
        float hunger_threshold = (self->brain.gluttony > 60) ? 65.0f : 35.0f;
        if (self->hunger <= hunger_threshold) {
            if (brain_do_eat(self)) {
                return;
            }
            for (int k = 0; k < 63 && "Hungry (No food on map)"; k++) self->brain.current_thought[k] = "Hungry (No food on map)"[k];

            // Starvation Cannibalism Dynamic Acquisition
            if (self->hunger <= 25.0f) {
                if (self->behavior != BEHAVIOR_CANNIBALISM && (random_int(0, 100) < 5)) {
                    self->behavior = BEHAVIOR_CANNIBALISM;
                }
                if (self->behavior == BEHAVIOR_CANNIBALISM) {
                    for (int i = 0; i < MAX_ENTITIES; i++) {
                        Entity* prey = &world.entities[i];
                        if (prey->active && prey->id != self->id && strings_equal(prey->species_title, self->species_title)) {
                            for (int k = 0; k < 63 && "Starving: Cannibal hunting!"; k++) self->brain.current_thought[k] = "Starving: Cannibal hunting!"[k];
                            brain_do_attack(self, prey);
                            return;
                        }
                    }
                }
            }
        }
    }

    // Scavenger behavior: Pick up dropped items if idle/exploring
    if (self->behavior == BEHAVIOR_SCAVENGER && self->path_len == 0) {
        for (int i = 0; i < MAX_DROPPED_ITEMS; i++) {
            if (world.items[i].active) {
                float dist = (float)((world.items[i].x - self->x)*(world.items[i].x - self->x) + (world.items[i].y - self->y)*(world.items[i].y - self->y));
                if (dist <= 144.0f) {
                    for (int k = 0; k < 63 && "Collecting dropped item"; k++) self->brain.current_thought[k] = "Collecting dropped item"[k];
                    brain_do_move_to(self, world.items[i].x, world.items[i].y);
                    return;
                }
            }
        }
    }

    if (mate && self->repro == REPRO_SEX && self->repro_timer > 30.0f) {
        for (int k = 0; k < 63 && "Seeking partner (Mating)"; k++) self->brain.current_thought[k] = "Seeking partner (Mating)"[k];
        float dist_sq = (float)((mate->x - self->x)*(mate->x - self->x) + (mate->y - self->y)*(mate->y - self->y));
        if (dist_sq <= 2.2f) {
            self->repro_timer = 0.0f;
            mate->repro_timer = 0.0f;
            
            int dx[] = {0, 0, -1, 1};
            int dy[] = {-1, 1, 0, 0};
            for (int k = 0; k < 4; k++) {
                int nx = self->x + dx[k];
                int ny = self->y + dy[k];
                if (is_tile_walkable_for(nx, ny, self->movement)) {
                    CreatureSpec baby_spec = {0};
                    for (int s = 0; s < 31 && self->species_title[s]; s++) baby_spec.species_name[s] = self->species_title[s];
                    baby_spec.modifiers[0] = mod_data(self->name, self->species_title, self->group_tag);
                    baby_spec.modifiers[1] = mod_skin(self->skin_filename);
                    baby_spec.modifiers[2] = mod_movement("movimento", self->movement);
                    baby_spec.modifiers[3] = mod_diet("dieta", self->diet);
                    baby_spec.modifiers[4] = mod_repro("reproducao", self->repro);
                    baby_spec.modifiers[5] = mod_stats("status", self->max_health, self->max_hunger, self->max_thirst);
                    baby_spec.modifiers[6] = mod_combat("combate", self->attack_power, self->defense, self->aggro_range);
                    baby_spec.modifiers[7] = mod_personality("personalidade", self->brain.bravery, self->brain.gluttony, self->brain.sociability, self->brain.curiosity);
                    baby_spec.modifier_count = 8;
                    spawn_entity_from_spec(&baby_spec, nx, ny);
                    break;
                }
            }
        } else {
            brain_do_move_to(self, mate->x, mate->y);
            return;
        }
    }

    if (self->brain.sociability >= 60 && ally) {
        for (int k = 0; k < 63 && "Socializing with ally"; k++) self->brain.current_thought[k] = "Socializing with ally"[k];
        brain_do_socialize(self, ally);
        return;
    }

    if (self->brain.curiosity >= 50 && self->movement != MOVE_NONE) {
        for (int k = 0; k < 63 && "Exploring map"; k++) self->brain.current_thought[k] = "Exploring map"[k];
        brain_do_explore(self);
        return;
    }

    for (int k = 0; k < 63 && "Resting..."; k++) self->brain.current_thought[k] = "Resting..."[k];
    brain_do_idle(self);
}

// ---------------------------------------------------------------------------
// Configurable Map Generation
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

void gen_map_custom(const MapGenConfig* config) {
    MapGenConfig cfg = {
        .seed = 12345,
        .noise_scale = 0.05f,
        .octaves = 4,
        .num_islands = 6,
        .min_island_radius = 90.0f,
        .max_island_radius = 170.0f,
        .water_threshold = 0.35f,
        .mountain_threshold = 0.70f,
        .ca_smooth_iterations = 3
    };
    if (config) cfg = *config;

    random_seed(cfg.seed > 0 ? cfg.seed : w_unique);
    noise_seed = (uint32_t)random(0, 0x7FFFFFFF);

    #define MAX_ISLAND_CENTROIDS 16
    int n_islands = cfg.num_islands > 0 ? cfg.num_islands : 4;
    if (n_islands > MAX_ISLAND_CENTROIDS) n_islands = MAX_ISLAND_CENTROIDS;

    typedef struct { float cx, cy, radius; } IslandSeed;
    IslandSeed islands[MAX_ISLAND_CENTROIDS];

    islands[0].cx = (float)(MAP_WIDTH / 2);
    islands[0].cy = (float)(MAP_HEIGHT / 2);
    islands[0].radius = cfg.max_island_radius;

    for (int i = 1; i < n_islands; i++) {
        float margin = 40.0f;
        islands[i].cx     = margin + (float)random_int(0, (int)(MAP_WIDTH  - 2*margin));
        islands[i].cy     = margin + (float)random_int(0, (int)(MAP_HEIGHT - 2*margin));
        islands[i].radius = cfg.min_island_radius + (float)random_int(0, (int)(cfg.max_island_radius - cfg.min_island_radius + 1.0f));
    }

    for (int y = 0; y < MAP_HEIGHT; y++) {
        for (int x = 0; x < MAP_WIDTH; x++) {
            float nx = x * cfg.noise_scale;
            float ny = y * cfg.noise_scale;
            float n = fbm(nx, ny, cfg.octaves);

            float falloff = 0.0f;
            for (int i = 0; i < n_islands; i++) {
                float dx = (float)x - islands[i].cx;
                float dy = (float)y - islands[i].cy;
                float f  = island_falloff(dx, dy, islands[i].radius);
                if (f > falloff) falloff = f;
            }

            hmap[y][x] = n * falloff;
        }
    }

    for (int y = 0; y < MAP_HEIGHT; y++) {
        for (int x = 0; x < MAP_WIDTH; x++) {
            float h = hmap[y][x];
            if      (h > cfg.mountain_threshold) world.map[y][x] = MOUNTAIN;
            else if (h > cfg.water_threshold)    world.map[y][x] = FLOOR;
            else                                 world.map[y][x] = WATER;
        }
    }

    if (cfg.ca_smooth_iterations > 0) {
        ca_smooth(cfg.ca_smooth_iterations);
    }
}

void init_creature_system_custom(const MapGenConfig* config, int* out_center_x, int* out_center_y) {
    gen_map_custom(config);

    int center_x = MAP_WIDTH / 2;
    int center_y = MAP_HEIGHT / 2;
    for (int r = 0; r < 50; r++) {
        bool f = false;
        for (int dy = -r; dy <= r && !f; dy++) {
            for (int dx = -r; dx <= r && !f; dx++) {
                if (is_tile_walkable_for(center_x + dx, center_y + dy, MOVE_WALK)) {
                    center_x += dx;
                    center_y += dy;
                    f = true;
                }
            }
        }
        if (f) break;
    }

    if (out_center_x) *out_center_x = center_x;
    if (out_center_y) *out_center_y = center_y;
}

void update_entity_simulation(Entity* e, float dt) {
    if (!e->active) return;

    if (e->id == 1) {
        update_world_clock(dt);
    }

    if (e->combat_flash_timer > 0.0f) e->combat_flash_timer -= dt;
    if (e->attack_cooldown > 0.0f) e->attack_cooldown -= dt;
    if (e->poison_timer > 0.0f) {
        e->poison_timer -= dt;
        e->health -= 3.0f * dt;
    }

    e->repro_timer += dt;

    // Plant Fruit / Herb Periodic Spawn System
    if (e->is_plant) {
        if (e->plant.produces_fruit) {
            e->plant.fruit_spawn_timer += dt;
            if (e->plant.fruit_spawn_timer >= e->plant.fruit_spawn_interval) {
                e->plant.fruit_spawn_timer = 0.0f;
                // Spawn fruit/herb item in an adjacent walkable tile
                int adx[] = {0, 0, -1, 1};
                int ady[] = {-1, 1, 0, 0};
                for (int k = 0; k < 4; k++) {
                    int nx = e->x + adx[k];
                    int ny = e->y + ady[k];
                    if (is_tile_walkable_for(nx, ny, MOVE_WALK)) {
                        extern const ItemSpec ITEM_FRUIT_SPEC;
                        extern const ItemSpec ITEM_HERB_SPEC;
                        const ItemSpec* p_spec = &ITEM_FRUIT_SPEC;
                        if (e->plant.fruit_item_id[0] != '\0') {
                            if (strings_equal(e->plant.fruit_item_id, "item_herb")) p_spec = &ITEM_HERB_SPEC;
                        }
                        spawn_dropped_item_scatter(nx, ny, p_spec, 1);
                        break;
                    }
                }
            }
        }
    }

    // Metabolism Rate Multiplier
    float meta_rate = (e->metabolism == METABOLISM_FAST) ? 1.50f : ((e->metabolism == METABOLISM_SLOW) ? 0.60f : 1.0f);

    // Active Regeneration Ability (Restores HP but costs 3x nutrients)
    bool is_regenerating = false;
    if (e->ability == ABILITY_REGENERATION && e->health < e->max_health) {
        is_regenerating = true;
        e->health += 6.0f * dt;
        if (e->health > e->max_health) e->health = e->max_health;
        meta_rate *= 3.0f; // 3x metabolic cost during active regeneration!
    }

    // Sleep Healing Bonus (Sleeping creatures recover extra HP)
    if (e->current_motor == MOTOR_SLEEP) {
        e->health += 2.0f * dt;
        if (e->health > e->max_health) e->health = e->max_health;
    }

    // Nutrient Decay (Photosynthesis vs Meat/Herb Diet)
    if (e->diet == DIET_PHOTOSYNTHESIS) {
        float tile_light = get_tile_light_level(e->x, e->y);
        e->hunger += 3.0f * tile_light * dt;
        if (e->hunger > e->max_hunger) e->hunger = e->max_hunger;
    } else if (e->diet != DIET_NONE) {
        e->hunger -= 0.8f * meta_rate * dt;
        if (e->hunger < 0.0f) e->hunger = 0.0f;
    }

    e->thirst -= 1.2f * meta_rate * dt;
    if (e->thirst < 0.0f) e->thirst = 0.0f;

    if (e->current_motor == MOTOR_SLEEP) {
        e->fatigue += 8.0f * dt;
        if (e->fatigue >= e->max_fatigue) e->fatigue = e->max_fatigue;
    } else {
        e->fatigue -= 0.4f * meta_rate * dt;
        if (e->fatigue < 0.0f) e->fatigue = 0.0f;
    }

    // Reproduction Check
    if (e->health > e->max_health * 0.8f && e->hunger > e->max_hunger * 0.7f && e->repro_timer > 40.0f) {
        int dx[] = {0, 0, -1, 1};
        int dy[] = {-1, 1, 0, 0};
        for (int k = 0; k < 4; k++) {
            int nx = e->x + dx[k];
            int ny = e->y + dy[k];
            if (is_tile_walkable_for(nx, ny, e->movement)) {
                if (e->repro == REPRO_MITOSIS_SPLIT) {
                    e->repro_timer = 0.0f;
                    CreatureSpec clone_spec = {0};
                    for (int s = 0; s < 31 && e->species_title[s]; s++) clone_spec.species_name[s] = e->species_title[s];
                    clone_spec.modifiers[0] = mod_data(e->name, e->species_title, e->group_tag);
                    clone_spec.modifiers[1] = mod_skin(e->skin_filename);
                    clone_spec.modifiers[2] = mod_movement("movimento", e->movement);
                    clone_spec.modifiers[3] = mod_diet("dieta", e->diet);
                    clone_spec.modifiers[4] = mod_repro("reproducao", e->repro);
                    clone_spec.modifiers[5] = mod_stats("status", e->max_health, e->max_hunger, e->max_thirst);
                    clone_spec.modifiers[6] = mod_combat("combate", e->attack_power, e->defense, e->aggro_range);
                    clone_spec.modifiers[7] = mod_personality("personalidade", e->brain.bravery, e->brain.gluttony, e->brain.sociability, e->brain.curiosity);
                    clone_spec.modifier_count = 8;
                    spawn_entity_from_spec(&clone_spec, nx, ny);
                    break;
                }
            }
        }
    }

    // Starvation & Passive Healing
    if (e->hunger <= 10.0f || e->thirst <= 10.0f || e->fatigue <= 5.0f) {
        e->health -= 2.0f * dt;
    } else if (e->hunger > 70.0f && e->thirst > 70.0f && e->fatigue > 70.0f && e->health < e->max_health && !is_regenerating) {
        e->health += 1.0f * dt;
    }

    if (e->health <= 0.0f) {
        e->health = 0.0f;
        e->active = false;
        trigger_entity_loot_drop(e);
        return;
    }

    entity_brain_think(e);

    // Movement & Step Speed Calculation
    if (e->path_len > 0 && e->path_idx < e->path_len) {
        e->move_timer += dt;
        float step_delay = (e->current_motor == MOTOR_ATTACK || e->current_motor == MOTOR_FLEE) ? 0.22f : 0.40f;
        if (e->metabolism == METABOLISM_FAST) step_delay *= 0.80f; // +25% speed bonus
        else if (e->metabolism == METABOLISM_SLOW) step_delay *= 1.15f;

        // Terrain Preference Speed Bonus
        if (e->preferences.preferred_terrain >= 0 && world.map[e->y][e->x] == e->preferences.preferred_terrain) {
            float b_mult = e->preferences.bonus_multiplier > 0.0f ? e->preferences.bonus_multiplier : 1.25f;
            step_delay /= b_mult; // Faster step on preferred terrain!
        }

        if (e->move_timer >= step_delay) {
            e->move_timer = 0.0f;
            e->x = e->path[e->path_idx].x;
            e->y = e->path[e->path_idx].y;
            e->path_idx++;

            entity_pickup_at(e, e->x, e->y);

            if (e->path_idx >= e->path_len) {
                e->path_len = 0;
                e->path_idx = 0;
            }
        }
    }
}
