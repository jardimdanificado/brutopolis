#ifndef CREATURE_SYSTEM_H
#define CREATURE_SYSTEM_H

#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>

#define MAP_WIDTH 512
#define MAP_HEIGHT 512
#define MAX_ENTITIES 96
#define MAX_DROPPED_ITEMS 128
#define MAX_PATH_NODES 64

// ---------------------------------------------------------------------------
// Item Definitions
// ---------------------------------------------------------------------------

typedef enum {
    ITEM_NONE = 0,
    ITEM_BREAD,
    ITEM_FRUIT,
    ITEM_JUG_WATER,
    ITEM_HERB,
    ITEM_STEAK,
    ITEM_TYPE_COUNT
} ItemType;

typedef struct {
    ItemType type;
    int count;
} ItemStack;

typedef struct {
    int x;
    int y;
    ItemType type;
    int count;
    bool active;
} DroppedItem;

typedef struct {
    ItemType type;
    int min_count;
    int max_count;
    float chance;
} LootDrop;

// ---------------------------------------------------------------------------
// Biological & Trait Enums
// ---------------------------------------------------------------------------

typedef enum {
    MOVE_NONE = 0,
    MOVE_WALK,
    MOVE_AQUATIC,
    MOVE_FLY
} MovementType;

typedef enum {
    DIET_NONE = 0,
    DIET_PHOTOSYNTHESIS,
    DIET_HERBIVORE,
    DIET_CARNIVORE,
    DIET_OMNIVORE
} DietType;

typedef enum {
    REPRO_NONE = 0,
    REPRO_MITOSIS_SPLIT,
    REPRO_SPORE_SEED,
    REPRO_SEX
} ReproType;

typedef enum {
    MOTOR_IDLE = 0,
    MOTOR_MOVE,
    MOTOR_EAT,
    MOTOR_DRINK,
    MOTOR_SLEEP,
    MOTOR_ATTACK,
    MOTOR_FLEE,
    MOTOR_SOCIALIZE,
    MOTOR_EXPLORE
} MotorCapability;

typedef struct {
    int x;
    int y;
} GridPos;

// ---------------------------------------------------------------------------
// Modifiers System Definitions
// ---------------------------------------------------------------------------

typedef enum {
    MOD_TYPE_DATA = 0,      // Name, Title, Group Tag
    MOD_TYPE_SKIN,          // Texture Asset Filename
    MOD_TYPE_MOVEMENT,      // MOVE_NONE, MOVE_WALK, MOVE_AQUATIC, MOVE_FLY
    MOD_TYPE_DIET,          // DIET_PHOTOSYNTHESIS, HERBIVORE, CARNIVORE...
    MOD_TYPE_REPRODUCTION,  // REPRO_MITOSIS_SPLIT, SPORE_SEED, REPRO_SEX...
    MOD_TYPE_STATS,         // Max HP, Max Hunger, Max Thirst
    MOD_TYPE_COMBAT,        // Attack Power, Defense, Aggro Range
    MOD_TYPE_PERSONALITY,   // Bravery, Gluttony, Sociability, Curiosity
    MOD_TYPE_LOOT           // Item Type, Min, Max, Chance
} ModifierType;

typedef struct {
    ModifierType type;
    union {
        struct { char name[32]; char title[32]; char group[32]; } data;
        struct { char filename[64]; } skin;
        struct { MovementType movement; } movement;
        struct { DietType diet; } diet;
        struct { ReproType repro; } repro;
        struct { float max_hp; float max_hunger; float max_thirst; } stats;
        struct { float attack; float defense; float aggro_range; } combat;
        struct { int bravery; int gluttony; int sociability; int curiosity; } personality;
        LootDrop loot;
    } as;
} Modifier;

typedef struct {
    char species_name[32];
    Modifier modifiers[12];
    int modifier_count;
} CreatureSpec;

// ---------------------------------------------------------------------------
// Layer 2 Developer Brain Profile
// ---------------------------------------------------------------------------

typedef struct {
    int bravery;     // 0-100
    int gluttony;    // 0-100
    int sociability; // 0-100
    int curiosity;   // 0-100
    
    char current_thought[64];
} BrainProfile;

typedef struct Entity Entity;

struct Entity {
    int id;
    char name[32];
    char species_title[32];
    char group_tag[32];
    char skin_filename[64];
    int x;
    int y;
    
    // Biological Traits (User Defined via Modifiers)
    MovementType movement;
    DietType diet;
    ReproType repro;
    float repro_timer;
    
    // Stats Component
    float health, max_health;
    float hunger, max_hunger;
    float thirst, max_thirst;
    float fatigue, max_fatigue;
    
    // Combat Component
    float attack_power;
    float defense;
    float attack_speed;
    float attack_cooldown;
    float aggro_range;
    int target_entity_id;
    float combat_flash_timer;
    
    // Layer 1 Motor Actuators & Pathfinding State
    MotorCapability current_motor;
    GridPos path[MAX_PATH_NODES];
    int path_len;
    int path_idx;
    float move_timer;
    
    // Layer 2 High Level Brain Profile
    BrainProfile brain;
    
    // Dynamic Loot Table
    LootDrop loot_table[4];
    int loot_count;
    
    // Inventory Component
    ItemStack inventory[6];
    bool active;
};

typedef struct {
    Entity entities[MAX_ENTITIES];
    DroppedItem items[MAX_DROPPED_ITEMS];
    uint8_t map[MAP_HEIGHT][MAP_WIDTH];
} World;

typedef enum {
    FLOOR,
    MOUNTAIN,
    WATER,
} Tile;

extern const uint8_t tile_collision[];
extern World world;

// ---------------------------------------------------------------------------
// Modifier Creation Helpers
// ---------------------------------------------------------------------------

Modifier mod_data(const char* name, const char* title, const char* group);
Modifier mod_skin(const char* filename);
Modifier mod_movement(MovementType type);
Modifier mod_diet(DietType diet);
Modifier mod_repro(ReproType repro);
Modifier mod_stats(float hp, float hunger, float thirst);
Modifier mod_combat(float atk, float def, float aggro);
Modifier mod_personality(int bravery, int gluttony, int sociability, int curiosity);
Modifier mod_loot(ItemType item, int min_c, int max_c, float chance);

// ---------------------------------------------------------------------------
// Function Prototypes
// ---------------------------------------------------------------------------

void gen_map(void);
void init_creature_system(int* out_center_x, int* out_center_y);
void update_entity_simulation(Entity* e, float dt);
Entity* spawn_entity_from_spec(const CreatureSpec* spec, int x, int y);
void apply_entity_modifiers(Entity* e, const Modifier* modifiers, int count);

// Item & Inventory Helpers
bool entity_add_item(Entity* e, ItemType type, int count);
bool entity_consume_food(Entity* e);
bool entity_consume_water(Entity* e);
void spawn_dropped_item(int x, int y, ItemType type, int count);
void trigger_entity_loot_drop(Entity* e);
void entity_pickup_at(Entity* e, int x, int y);

// Pathfinding & Movement Validation
bool is_tile_walkable_for(int x, int y, MovementType movement);
int find_path_for(int sx, int sy, int gx, int gy, MovementType movement, GridPos* out_path, int max_out);

// Layer 1 Perception / Sensors
Entity* brain_perceive_closest_threat(Entity* self);
Entity* brain_perceive_closest_ally(Entity* self);
Entity* brain_perceive_closest_mate(Entity* self);
bool brain_perceive_food(Entity* self, int* out_x, int* out_y);
bool brain_perceive_water(Entity* self, int* out_x, int* out_y);

// Layer 1 Motor Actuators
void brain_do_move_to(Entity* self, int target_x, int target_y);
void brain_do_eat(Entity* self);
void brain_do_drink(Entity* self);
void brain_do_sleep(Entity* self);
void brain_do_attack(Entity* self, Entity* target);
void brain_do_flee(Entity* self, Entity* threat);
void brain_do_socialize(Entity* self, Entity* ally);
void brain_do_explore(Entity* self);
void brain_do_idle(Entity* self);

// Layer 2 Developer High Level Brain Hook
void entity_brain_think(Entity* self);

#endif // CREATURE_SYSTEM_H
