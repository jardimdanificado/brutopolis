#include "creature_system.h"

World world = {0};

const uint8_t tile_collision[] = {
    [FLOOR] = 0,
    [MOUNTAIN] = 1,
    [WATER] = 1,
};

// ---------------------------------------------------------------------------
// Modifier Helper Constructors
// ---------------------------------------------------------------------------

Modifier mod_data(const char* name, const char* title, const char* group) {
    Modifier m = {0};
    m.type = MOD_TYPE_DATA;
    if (name)  for (int i = 0; i < 31 && name[i];  i++) m.as.data.name[i] = name[i];
    if (title) for (int i = 0; i < 31 && title[i]; i++) m.as.data.title[i] = title[i];
    if (group) for (int i = 0; i < 31 && group[i]; i++) m.as.data.group[i] = group[i];
    return m;
}

Modifier mod_skin(const char* filename) {
    Modifier m = {0};
    m.type = MOD_TYPE_SKIN;
    if (filename) for (int i = 0; i < 63 && filename[i]; i++) m.as.skin.filename[i] = filename[i];
    return m;
}

Modifier mod_movement(MovementType type) {
    Modifier m = {0};
    m.type = MOD_TYPE_MOVEMENT;
    m.as.movement.movement = type;
    return m;
}

Modifier mod_diet(DietType diet) {
    Modifier m = {0};
    m.type = MOD_TYPE_DIET;
    m.as.diet.diet = diet;
    return m;
}

Modifier mod_repro(ReproType repro) {
    Modifier m = {0};
    m.type = MOD_TYPE_REPRODUCTION;
    m.as.repro.repro = repro;
    return m;
}

Modifier mod_stats(float hp, float hunger, float thirst) {
    Modifier m = {0};
    m.type = MOD_TYPE_STATS;
    m.as.stats.max_hp = hp;
    m.as.stats.max_hunger = hunger;
    m.as.stats.max_thirst = thirst;
    return m;
}

Modifier mod_combat(float atk, float def, float aggro) {
    Modifier m = {0};
    m.type = MOD_TYPE_COMBAT;
    m.as.combat.attack = atk;
    m.as.combat.defense = def;
    m.as.combat.aggro_range = aggro;
    return m;
}

Modifier mod_personality(int bravery, int gluttony, int sociability, int curiosity) {
    Modifier m = {0};
    m.type = MOD_TYPE_PERSONALITY;
    m.as.personality.bravery = bravery;
    m.as.personality.gluttony = gluttony;
    m.as.personality.sociability = sociability;
    m.as.personality.curiosity = curiosity;
    return m;
}

Modifier mod_loot(ItemType item, int min_c, int max_c, float chance) {
    Modifier m = {0};
    m.type = MOD_TYPE_LOOT;
    m.as.loot.type = item;
    m.as.loot.min_count = min_c;
    m.as.loot.max_count = max_c;
    m.as.loot.chance = chance;
    return m;
}

// ---------------------------------------------------------------------------
// Modifier Application Engine
// ---------------------------------------------------------------------------

void apply_entity_modifiers(Entity* e, const Modifier* modifiers, int count) {
    if (!e || !modifiers || count <= 0) return;

    for (int i = 0; i < count; i++) {
        const Modifier* m = &modifiers[i];
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
            
            apply_entity_modifiers(e, spec->modifiers, spec->modifier_count);
            return e;
        }
    }
    return NULL;
}

// ---------------------------------------------------------------------------
// Item & Inventory Helpers
// ---------------------------------------------------------------------------

bool entity_add_item(Entity* e, ItemType type, int count) {
    if (type == ITEM_NONE || count <= 0) return false;
    for (int i = 0; i < 6; i++) {
        if (e->inventory[i].type == type) {
            e->inventory[i].count += count;
            return true;
        }
    }
    for (int i = 0; i < 6; i++) {
        if (e->inventory[i].type == ITEM_NONE) {
            e->inventory[i].type = type;
            e->inventory[i].count = count;
            return true;
        }
    }
    return false;
}

bool entity_consume_food(Entity* e) {
    if (e->diet == DIET_NONE || e->diet == DIET_PHOTOSYNTHESIS) return true;

    for (int i = 0; i < 6; i++) {
        ItemType t = e->inventory[i].type;
        bool valid_diet_item = false;
        if (e->diet == DIET_HERBIVORE && (t == ITEM_BREAD || t == ITEM_FRUIT || t == ITEM_HERB)) valid_diet_item = true;
        else if (e->diet == DIET_CARNIVORE && t == ITEM_STEAK) valid_diet_item = true;
        else if (e->diet == DIET_OMNIVORE && (t == ITEM_BREAD || t == ITEM_FRUIT || t == ITEM_STEAK || t == ITEM_HERB)) valid_diet_item = true;

        if (valid_diet_item) {
            e->inventory[i].count--;
            if (e->inventory[i].count <= 0) e->inventory[i].type = ITEM_NONE;
            
            e->hunger += 45.0f;
            if (e->hunger > e->max_hunger) e->hunger = e->max_hunger;
            return true;
        }
    }
    return false;
}

bool entity_consume_water(Entity* e) {
    for (int i = 0; i < 6; i++) {
        if (e->inventory[i].type == ITEM_JUG_WATER) {
            e->inventory[i].count--;
            if (e->inventory[i].count <= 0) e->inventory[i].type = ITEM_NONE;
            
            e->thirst += 55.0f;
            if (e->thirst > e->max_thirst) e->thirst = e->max_thirst;
            return true;
        }
    }
    return false;
}

void spawn_dropped_item(int x, int y, ItemType type, int count) {
    if (type == ITEM_NONE || count <= 0) return;
    for (int i = 0; i < MAX_DROPPED_ITEMS; i++) {
        if (!world.items[i].active) {
            world.items[i].x = x;
            world.items[i].y = y;
            world.items[i].type = type;
            world.items[i].count = count;
            world.items[i].active = true;
            break;
        }
    }
}

void trigger_entity_loot_drop(Entity* e) {
    for (int i = 0; i < 6; i++) {
        if (e->inventory[i].type != ITEM_NONE) {
            spawn_dropped_item(e->x, e->y, e->inventory[i].type, e->inventory[i].count);
            e->inventory[i].type = ITEM_NONE;
        }
    }
    for (int d = 0; d < e->loot_count; d++) {
        LootDrop* lt = &e->loot_table[d];
        if (lt->type != ITEM_NONE) {
            float roll = (float)random_int(0, 100) / 100.0f;
            if (roll <= lt->chance) {
                int amount = random_int(lt->min_count, lt->max_count);
                spawn_dropped_item(e->x, e->y, lt->type, amount);
            }
        }
    }
}

void entity_pickup_at(Entity* e, int x, int y) {
    for (int i = 0; i < MAX_DROPPED_ITEMS; i++) {
        if (world.items[i].active && world.items[i].x == x && world.items[i].y == y) {
            if (entity_add_item(e, world.items[i].type, world.items[i].count)) {
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

static bool strings_equal(const char* a, const char* b) {
    if (!a || !b) return false;
    int i = 0;
    while (a[i] && b[i]) {
        if (a[i] != b[i]) return false;
        i++;
    }
    return a[i] == b[i];
}

Entity* brain_perceive_closest_threat(Entity* self) {
    if (self->group_tag[0] == '\0') return NULL;
    float min_dist = self->aggro_range * self->aggro_range;
    Entity* best = NULL;

    for (int i = 0; i < MAX_ENTITIES; i++) {
        Entity* other = &world.entities[i];
        if (!other->active || other->id == self->id || other->group_tag[0] == '\0') continue;
        
        if (!strings_equal(self->group_tag, other->group_tag)) {
            float dist = (float)((other->x - self->x)*(other->x - self->x) + (other->y - self->y)*(other->y - self->y));
            if (dist <= min_dist) {
                min_dist = dist;
                best = other;
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
    float min_dist = 999999.0f;
    int best_x = -1, best_y = -1;
    
    for (int i = 0; i < MAX_DROPPED_ITEMS; i++) {
        if (!world.items[i].active) continue;
        ItemType t = world.items[i].type;
        bool valid_diet = false;
        if (self->diet == DIET_HERBIVORE && (t == ITEM_BREAD || t == ITEM_FRUIT || t == ITEM_HERB)) valid_diet = true;
        else if (self->diet == DIET_CARNIVORE && t == ITEM_STEAK) valid_diet = true;
        else if (self->diet == DIET_OMNIVORE && (t == ITEM_BREAD || t == ITEM_FRUIT || t == ITEM_STEAK || t == ITEM_HERB)) valid_diet = true;

        if (valid_diet) {
            float d = (float)((world.items[i].x - self->x)*(world.items[i].x - self->x) + (world.items[i].y - self->y)*(world.items[i].y - self->y));
            if (d < min_dist) {
                min_dist = d;
                best_x = world.items[i].x;
                best_y = world.items[i].y;
            }
        }
    }
    if (best_x != -1) {
        *out_x = best_x;
        *out_y = best_y;
        return true;
    }
    return false;
}

bool brain_perceive_water(Entity* self, int* out_x, int* out_y) {
    float min_dist = 999999.0f;
    int best_x = -1, best_y = -1;
    
    for (int dy = -20; dy <= 20; dy++) {
        for (int dx = -20; dx <= 20; dx++) {
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
        *out_x = best_x;
        *out_y = best_y;
        return true;
    }
    return false;
}

void brain_do_move_to(Entity* self, int target_x, int target_y) {
    if (self->movement == MOVE_NONE) return;
    self->current_motor = MOTOR_MOVE;
    if (self->path_len == 0 || self->path_idx >= self->path_len) {
        self->path_len = find_path_for(self->x, self->y, target_x, target_y, self->movement, self->path, MAX_PATH_NODES);
        self->path_idx = 0;
    }
}

void brain_do_eat(Entity* self) {
    self->current_motor = MOTOR_EAT;
    if (!entity_consume_food(self)) {
        int fx, fy;
        if (brain_perceive_food(self, &fx, &fy)) {
            brain_do_move_to(self, fx, fy);
        }
    } else {
        self->path_len = 0;
    }
}

void brain_do_drink(Entity* self) {
    self->current_motor = MOTOR_DRINK;
    if (!entity_consume_water(self)) {
        int wx, wy;
        if (brain_perceive_water(self, &wx, &wy)) {
            brain_do_move_to(self, wx, wy);
        }
    } else {
        self->path_len = 0;
    }
}

void brain_do_sleep(Entity* self) {
    self->current_motor = MOTOR_SLEEP;
    self->path_len = 0;
}

void brain_do_attack(Entity* self, Entity* target) {
    if (!target || !target->active) return;
    self->current_motor = MOTOR_ATTACK;
    self->target_entity_id = target->id;

    float dist_sq = (float)((target->x - self->x)*(target->x - self->x) + (target->y - self->y)*(target->y - self->y));
    if (dist_sq <= 2.2f) {
        if (self->attack_cooldown <= 0.0f) {
            self->attack_cooldown = self->attack_speed;
            float dmg = self->attack_power - target->defense;
            if (dmg < 2.0f) dmg = 2.0f;
            target->health -= dmg;
            target->combat_flash_timer = 0.3f;
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
        if (self->brain.bravery < 40) {
            for (int k = 0; k < 63 && "Fugindo em panico!"; k++) self->brain.current_thought[k] = "Fugindo em panico!"[k];
            brain_do_flee(self, threat);
            return;
        } else {
            for (int k = 0; k < 63 && "Atacando ameaca!"; k++) self->brain.current_thought[k] = "Atacando ameaca!"[k];
            brain_do_attack(self, threat);
            return;
        }
    }

    // Sleep / Energy Logic (100 = Full Energy, <= 20 = Exhausted)
    if (self->fatigue <= 20.0f || (self->current_motor == MOTOR_SLEEP && self->fatigue < self->max_fatigue)) {
        for (int k = 0; k < 63 && "Dormindo..."; k++) self->brain.current_thought[k] = "Dormindo..."[k];
        brain_do_sleep(self);
        return;
    }

    // Thirst / Hydration Logic (100 = Hydrated, <= 45 = Thirsty)
    if (self->thirst <= 45.0f) {
        for (int k = 0; k < 63 && "Buscando agua"; k++) self->brain.current_thought[k] = "Buscando agua"[k];
        brain_do_drink(self);
        return;
    }

    // Hunger / Nutrition Logic (100 = Satiated, <= 45 = Hungry)
    if (self->diet != DIET_NONE && self->diet != DIET_PHOTOSYNTHESIS) {
        float hunger_threshold = (self->brain.gluttony > 60) ? 65.0f : 35.0f;
        if (self->hunger <= hunger_threshold) {
            for (int k = 0; k < 63 && "Buscando alimento"; k++) self->brain.current_thought[k] = "Buscando alimento"[k];
            brain_do_eat(self);
            return;
        }
    }

    // Sexual Reproduction Behavior
    if (mate && self->repro == REPRO_SEX && self->repro_timer > 30.0f) {
        for (int k = 0; k < 63 && "Buscando parceiro (Acasalamento)"; k++) self->brain.current_thought[k] = "Buscando parceiro (Acasalamento)"[k];
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
                    baby_spec.modifiers[2] = mod_movement(self->movement);
                    baby_spec.modifiers[3] = mod_diet(self->diet);
                    baby_spec.modifiers[4] = mod_repro(self->repro);
                    baby_spec.modifiers[5] = mod_stats(self->max_health, self->max_hunger, self->max_thirst);
                    baby_spec.modifiers[6] = mod_combat(self->attack_power, self->defense, self->aggro_range);
                    baby_spec.modifiers[7] = mod_personality(self->brain.bravery, self->brain.gluttony, self->brain.sociability, self->brain.curiosity);
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
        for (int k = 0; k < 63 && "Socializando com aliado"; k++) self->brain.current_thought[k] = "Socializando com aliado"[k];
        brain_do_socialize(self, ally);
        return;
    }

    if (self->brain.curiosity >= 50 && self->movement != MOVE_NONE) {
        for (int k = 0; k < 63 && "Explorando o mapa"; k++) self->brain.current_thought[k] = "Explorando o mapa"[k];
        brain_do_explore(self);
        return;
    }

    for (int k = 0; k < 63 && "Em repouso"; k++) self->brain.current_thought[k] = "Em repouso"[k];
    brain_do_idle(self);
}

// ---------------------------------------------------------------------------
// Map Generation & System Init
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

void gen_map(void) {
    random_seed(w_unique);
    noise_seed = (uint32_t)random(0, 0x7FFFFFFF);

    #define MAX_ISLANDS 6
    typedef struct { float cx, cy, radius; } IslandSeed;

    int num_islands = 3 + random_int(0, MAX_ISLANDS - 3);
    IslandSeed islands[MAX_ISLANDS];
    for (int i = 0; i < num_islands; i++) {
        float margin = 12.0f;
        islands[i].cx     = margin + (float)random_int(0, (int)(MAP_WIDTH  - 2*margin));
        islands[i].cy     = margin + (float)random_int(0, (int)(MAP_HEIGHT - 2*margin));
        islands[i].radius = 10.0f + (float)random_int(0, 20);
    }

    float noise_scale = 0.07f;
    for (int y = 0; y < MAP_HEIGHT; y++) {
        for (int x = 0; x < MAP_WIDTH; x++) {
            float nx = x * noise_scale;
            float ny = y * noise_scale;
            float n = fbm(nx, ny, 4);

            float falloff = 0.0f;
            for (int i = 0; i < num_islands; i++) {
                float dx = (float)x - islands[i].cx;
                float dy = (float)y - islands[i].cy;
                float f  = island_falloff(dx, dy, islands[i].radius);
                if (f > falloff) falloff = f;
            }

            hmap[y][x] = n * 0.5f + falloff * 0.6f;
        }
    }

    for (int y = 0; y < MAP_HEIGHT; y++) {
        for (int x = 0; x < MAP_WIDTH; x++) {
            float h = hmap[y][x];
            if      (h > 0.60f) world.map[y][x] = MOUNTAIN;
            else if (h > 0.35f) world.map[y][x] = FLOOR;
            else                world.map[y][x] = WATER;
        }
    }

    ca_smooth(3);
}

void init_creature_system(int* out_center_x, int* out_center_y) {
    gen_map();

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

    if (e->combat_flash_timer > 0.0f) e->combat_flash_timer -= dt;
    if (e->attack_cooldown > 0.0f) e->attack_cooldown -= dt;

    e->repro_timer += dt;

    // Photosynthesis & Hunger Decay (100 = Full/Good, 0 = Empty/Bad)
    if (e->diet == DIET_PHOTOSYNTHESIS) {
        e->hunger += 2.0f * dt;
        if (e->hunger > e->max_hunger) e->hunger = e->max_hunger;
    } else if (e->diet != DIET_NONE) {
        e->hunger -= 0.8f * dt;
        if (e->hunger < 0.0f) e->hunger = 0.0f;
    }

    // Thirst Decay (100 = Hydrated/Good, 0 = Dehydrated/Bad)
    e->thirst -= 1.2f * dt;
    if (e->thirst < 0.0f) e->thirst = 0.0f;

    // Energy / Fatigue (100 = Rested/Good, 0 = Exhausted/Bad)
    if (e->current_motor == MOTOR_SLEEP) {
        e->fatigue += 8.0f * dt;
        if (e->fatigue >= e->max_fatigue) e->fatigue = e->max_fatigue;
    } else {
        e->fatigue -= 0.4f * dt;
        if (e->fatigue < 0.0f) e->fatigue = 0.0f;
    }

    // Mitosis Split & Spore Reproduction Execution
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
                    clone_spec.modifiers[2] = mod_movement(e->movement);
                    clone_spec.modifiers[3] = mod_diet(e->diet);
                    clone_spec.modifiers[4] = mod_repro(e->repro);
                    clone_spec.modifiers[5] = mod_stats(e->max_health, e->max_hunger, e->max_thirst);
                    clone_spec.modifiers[6] = mod_combat(e->attack_power, e->defense, e->aggro_range);
                    clone_spec.modifiers[7] = mod_personality(e->brain.bravery, e->brain.gluttony, e->brain.sociability, e->brain.curiosity);
                    clone_spec.modifier_count = 8;
                    spawn_entity_from_spec(&clone_spec, nx, ny);
                    break;
                } else if (e->repro == REPRO_SPORE_SEED) {
                    e->repro_timer = 0.0f;
                    spawn_dropped_item(nx, ny, ITEM_FRUIT, 2);
                    break;
                }
            }
        }
    }

    // Damage on Starvation / Dehydration / Exhaustion
    if (e->hunger <= 10.0f || e->thirst <= 10.0f || e->fatigue <= 5.0f) {
        e->health -= 2.0f * dt;
    } else if (e->hunger > 70.0f && e->thirst > 70.0f && e->fatigue > 70.0f && e->health < e->max_health) {
        e->health += 1.0f * dt;
    }

    if (e->health <= 0.0f) {
        e->health = 0.0f;
        e->active = false;
        trigger_entity_loot_drop(e);
        return;
    }

    entity_brain_think(e);

    if (e->path_len > 0 && e->path_idx < e->path_len) {
        e->move_timer += dt;
        float step_delay = (e->current_motor == MOTOR_ATTACK || e->current_motor == MOTOR_FLEE) ? 0.22f : 0.40f;
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
