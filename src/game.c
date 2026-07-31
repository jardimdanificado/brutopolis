#include "game.h"

// ---------------------------------------------------------------------------
// Configurable Map Generation Presets
// ---------------------------------------------------------------------------

const MapGenConfig MAP_PRESET_ARCHIPELAGO = {
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

const MapGenConfig MAP_PRESET_CONTINENT = {
    .seed = 9999,
    .noise_scale = 0.035f,
    .octaves = 5,
    .num_islands = 3,
    .min_island_radius = 140.0f,
    .max_island_radius = 240.0f,
    .water_threshold = 0.33f,
    .mountain_threshold = 0.72f,
    .ca_smooth_iterations = 4
};

const MapGenConfig MAP_PRESET_HIGHLANDS = {
    .seed = 5555,
    .noise_scale = 0.06f,
    .octaves = 4,
    .num_islands = 4,
    .min_island_radius = 100.0f,
    .max_island_radius = 180.0f,
    .water_threshold = 0.30f,
    .mountain_threshold = 0.65f,
    .ca_smooth_iterations = 2
};

// ---------------------------------------------------------------------------
// Data-Driven Item Specs Defined via ItemModifiers
// ---------------------------------------------------------------------------

const ItemSpec ITEM_BREAD_SPEC = {
    .item_id = "item_bread",
    .modifiers = {
        { .type = ITEM_MOD_DATA, .as.data = { "Pao Caseiro", "Pao de trigo macio e nutritivo" } },
        { .type = ITEM_MOD_SKIN, .as.skin = { "Item_Bread.png" } },
        { .type = ITEM_MOD_CONSUMABLE, .as.consumable = { .restore_hunger = 45.0f } },
        { .type = ITEM_MOD_STACK, .as.stack = { .max_stack = 10 } }
    },
    .modifier_count = 4
};

const ItemSpec ITEM_FRUIT_SPEC = {
    .item_id = "item_fruit",
    .modifiers = {
        { .type = ITEM_MOD_DATA, .as.data = { "Fruta Suculenta", "Fruta fresca que cura e alimenta" } },
        { .type = ITEM_MOD_SKIN, .as.skin = { "Item_Fruit.png" } },
        { .type = ITEM_MOD_CONSUMABLE, .as.consumable = { .restore_hunger = 35.0f, .restore_health = 10.0f } },
        { .type = ITEM_MOD_STACK, .as.stack = { .max_stack = 15 } }
    },
    .modifier_count = 4
};

const ItemSpec ITEM_WATER_SPEC = {
    .item_id = "item_water",
    .modifiers = {
        { .type = ITEM_MOD_DATA, .as.data = { "Jarra d'Agua", "Agua fresca de nascente" } },
        { .type = ITEM_MOD_SKIN, .as.skin = { "Item_Jug.png" } },
        { .type = ITEM_MOD_CONSUMABLE, .as.consumable = { .restore_thirst = 55.0f } },
        { .type = ITEM_MOD_STACK, .as.stack = { .max_stack = 5 } }
    },
    .modifier_count = 4
};

const ItemSpec ITEM_HERB_SPEC = {
    .item_id = "item_herb",
    .modifiers = {
        { .type = ITEM_MOD_DATA, .as.data = { "Erva Medicinal", "Planta raras com forte poder curativo" } },
        { .type = ITEM_MOD_SKIN, .as.skin = { "Item_Herb.png" } },
        { .type = ITEM_MOD_CONSUMABLE, .as.consumable = { .restore_health = 35.0f } },
        { .type = ITEM_MOD_STACK, .as.stack = { .max_stack = 20 } }
    },
    .modifier_count = 4
};

const ItemSpec ITEM_STEAK_SPEC = {
    .item_id = "item_steak",
    .modifiers = {
        { .type = ITEM_MOD_DATA, .as.data = { "Bife Assado", "Carne Suculenta altamente energetica" } },
        { .type = ITEM_MOD_SKIN, .as.skin = { "Item_Steak.png" } },
        { .type = ITEM_MOD_CONSUMABLE, .as.consumable = { .restore_hunger = 60.0f, .restore_health = 15.0f } },
        { .type = ITEM_MOD_STACK, .as.stack = { .max_stack = 5 } }
    },
    .modifier_count = 4
};

// ---------------------------------------------------------------------------
// Game Setup & Content Spawning
// ---------------------------------------------------------------------------

void setup_game_species_and_world(int* out_center_x, int* out_center_y) {
    int cx, cy;
    init_creature_system_custom(&MAP_PRESET_CONTINENT, &cx, &cy);
    if (out_center_x) *out_center_x = cx;
    if (out_center_y) *out_center_y = cy;

    // ---------------------------------------------------------------------------
    // User-Defined Example Species Specs
    // ---------------------------------------------------------------------------

    // 1. Árvore Anciã (Plant, Photosynthesis, Spores, Stationary)
    CreatureSpec tree_spec = {
        .species_name = "Arvore Ancia",
        .modifiers = {
            { .type = MOD_TYPE_DATA, .as.data = { "Carvalho", "Arvore Ancia", "Natureza" } },
            { .type = MOD_TYPE_SKIN, .as.skin = { "Feature_Tree_Full.png" } },
            { .type = MOD_TYPE_MOVEMENT, .as.movement = { MOVE_NONE } },
            { .type = MOD_TYPE_DIET, .as.diet = { DIET_PHOTOSYNTHESIS } },
            { .type = MOD_TYPE_REPRODUCTION, .as.repro = { REPRO_SPORE_SEED } },
            { .type = MOD_TYPE_STATS, .as.stats = { 200.0f, 100.0f, 100.0f } },
            { .type = MOD_TYPE_LOOT, .as.loot = { ITEM_FRUIT_SPEC, 1, 3, 1.0f } }
        },
        .modifier_count = 7
    };

    // 2. Dragão Alado (Flying, Carnivore, Sexual Reproduction)
    CreatureSpec dragon_spec = {
        .species_name = "Dragao Alado",
        .modifiers = {
            { .type = MOD_TYPE_DATA, .as.data = { "Smaug", "Dragao Alado", "Dracones" } },
            { .type = MOD_TYPE_SKIN, .as.skin = { "Creature_Dragon_U.png" } },
            { .type = MOD_TYPE_MOVEMENT, .as.movement = { MOVE_FLY } },
            { .type = MOD_TYPE_DIET, .as.diet = { DIET_CARNIVORE } },
            { .type = MOD_TYPE_REPRODUCTION, .as.repro = { REPRO_SEX } },
            { .type = MOD_TYPE_STATS, .as.stats = { 180.0f, 100.0f, 100.0f } },
            { .type = MOD_TYPE_COMBAT, .as.combat = { 30.0f, 12.0f, 12.0f } },
            { .type = MOD_TYPE_PERSONALITY, .as.personality = { 90, 80, 20, 80 } },
            { .type = MOD_TYPE_LOOT, .as.loot = { ITEM_STEAK_SPEC, 2, 4, 1.0f } }
        },
        .modifier_count = 9
    };

    // 3. Cavaleiro Imperial (Walking, Omnivore, Sexual Reproduction)
    CreatureSpec knight_spec = {
        .species_name = "Cavaleiro Imperial",
        .modifiers = {
            { .type = MOD_TYPE_DATA, .as.data = { "Arthur", "Cavaleiro Imperial", "Reino" } },
            { .type = MOD_TYPE_SKIN, .as.skin = { "Human_Knight_M.png" } },
            { .type = MOD_TYPE_MOVEMENT, .as.movement = { MOVE_WALK } },
            { .type = MOD_TYPE_DIET, .as.diet = { DIET_OMNIVORE } },
            { .type = MOD_TYPE_REPRODUCTION, .as.repro = { REPRO_SEX } },
            { .type = MOD_TYPE_STATS, .as.stats = { 150.0f, 100.0f, 100.0f } },
            { .type = MOD_TYPE_COMBAT, .as.combat = { 22.0f, 8.0f, 10.0f } },
            { .type = MOD_TYPE_PERSONALITY, .as.personality = { 85, 40, 70, 50 } },
            { .type = MOD_TYPE_LOOT, .as.loot = { ITEM_BREAD_SPEC, 1, 2, 0.9f } }
        },
        .modifier_count = 9
    };

    // 4. Goblin Ladrão (Walking, Mitosis Split, Omnivore)
    CreatureSpec goblin_spec = {
        .species_name = "Goblin Ladrao",
        .modifiers = {
            { .type = MOD_TYPE_DATA, .as.data = { "Snark", "Goblin Ladrao", "Tribo" } },
            { .type = MOD_TYPE_SKIN, .as.skin = { "Creature_Goblin_U.png" } },
            { .type = MOD_TYPE_MOVEMENT, .as.movement = { MOVE_WALK } },
            { .type = MOD_TYPE_DIET, .as.diet = { DIET_OMNIVORE } },
            { .type = MOD_TYPE_REPRODUCTION, .as.repro = { REPRO_MITOSIS_SPLIT } },
            { .type = MOD_TYPE_STATS, .as.stats = { 90.0f, 100.0f, 100.0f } },
            { .type = MOD_TYPE_COMBAT, .as.combat = { 14.0f, 2.0f, 8.0f } },
            { .type = MOD_TYPE_PERSONALITY, .as.personality = { 30, 85, 20, 90 } },
            { .type = MOD_TYPE_LOOT, .as.loot = { ITEM_FRUIT_SPEC, 1, 2, 0.8f } }
        },
        .modifier_count = 9
    };

    // 5. Gato Místico (Walking, Herbivore, Mitosis Split)
    CreatureSpec cat_spec = {
        .species_name = "Gato Mistico",
        .modifiers = {
            { .type = MOD_TYPE_DATA, .as.data = { "Felix", "Gato Mistico", "Natureza" } },
            { .type = MOD_TYPE_SKIN, .as.skin = { "Creature_Cat_U.png" } },
            { .type = MOD_TYPE_MOVEMENT, .as.movement = { MOVE_WALK } },
            { .type = MOD_TYPE_DIET, .as.diet = { DIET_HERBIVORE } },
            { .type = MOD_TYPE_REPRODUCTION, .as.repro = { REPRO_MITOSIS_SPLIT } },
            { .type = MOD_TYPE_STATS, .as.stats = { 80.0f, 100.0f, 100.0f } },
            { .type = MOD_TYPE_COMBAT, .as.combat = { 6.0f, 1.0f, 6.0f } },
            { .type = MOD_TYPE_PERSONALITY, .as.personality = { 40, 50, 60, 80 } },
            { .type = MOD_TYPE_LOOT, .as.loot = { ITEM_HERB_SPEC, 1, 2, 0.6f } }
        },
        .modifier_count = 9
    };

    const CreatureSpec* specs[] = {
        &tree_spec, &dragon_spec, &knight_spec, &goblin_spec, &cat_spec
    };

    // Populate Entities in Game World
    for (int i = 0; i < 15; i++) {
        int rx = cx + random_int(-20, 20);
        int ry = cy + random_int(-20, 20);
        const CreatureSpec* spec = specs[i % 5];
        if (is_tile_walkable_for(rx, ry, spec->modifiers[2].as.movement.movement)) {
            Entity* e = spawn_entity_from_spec(spec, rx, ry);
            if (e) {
                entity_add_item_spec(e, &ITEM_BREAD_SPEC, random_int(1, 2));
                entity_add_item_spec(e, &ITEM_WATER_SPEC, 1);
            }
        }
    }

    // Populate Dropped World Items
    const ItemSpec* item_specs[] = {
        &ITEM_BREAD_SPEC, &ITEM_FRUIT_SPEC, &ITEM_WATER_SPEC, &ITEM_HERB_SPEC, &ITEM_STEAK_SPEC
    };

    for (int i = 0; i < 25; i++) {
        int rx = cx + random_int(-25, 25);
        int ry = cy + random_int(-25, 25);
        if (is_tile_walkable_for(rx, ry, MOVE_WALK)) {
            const ItemSpec* it_spec = item_specs[i % 5];
            spawn_dropped_item_spec(rx, ry, it_spec, random_int(1, 3));
        }
    }
}
