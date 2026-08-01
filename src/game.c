#include "game.h"

// ---------------------------------------------------------------------------
// Configurable Map Generation Presets
// ---------------------------------------------------------------------------

const MapGenConfig MAP_PRESET_ARCHIPELAGO = {
    .seed = 0,
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
    .seed = 0,
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
    .seed = 0,
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
// Data-Driven Item Specs Defined via String-Named ItemModifiers
// ---------------------------------------------------------------------------

const ItemSpec ITEM_BREAD_SPEC = {
    .item_id = "item_bread",
    .modifiers = {
        { .type = ITEM_MOD_DATA, .mod_name = "dados", .as.data = { "Pao Caseiro", "Pao de trigo macio e nutritivo" } },
        { .type = ITEM_MOD_SKIN, .mod_name = "skin", .as.skin = { "Item_Bread.png" } },
        { .type = ITEM_MOD_CONSUMABLE, .mod_name = "comida", .as.consumable = { .restore_hunger = 45.0f } },
        { .type = ITEM_MOD_STACK, .mod_name = "stack", .as.stack = { .max_stack = 10 } },
        { .type = ITEM_MOD_COLOR, .mod_name = "cor", .as.color = { .color = 0xFEF2A6, .backcolor = 0x3C280A } }
    },
    .modifier_count = 5
};

const ItemSpec ITEM_FRUIT_SPEC = {
    .item_id = "item_fruit",
    .modifiers = {
        { .type = ITEM_MOD_DATA, .mod_name = "dados", .as.data = { "Fruta Suculenta", "Fruta fresca que cura e alimenta" } },
        { .type = ITEM_MOD_SKIN, .mod_name = "skin", .as.skin = { "Item_Fruit.png" } },
        { .type = ITEM_MOD_CONSUMABLE, .mod_name = "comida", .as.consumable = { .restore_hunger = 35.0f, .restore_health = 10.0f } },
        { .type = ITEM_MOD_STACK, .mod_name = "stack", .as.stack = { .max_stack = 15 } },
        { .type = ITEM_MOD_COLOR, .mod_name = "cor", .as.color = { .color = 0xF55064, .backcolor = 0x460F14 } }
    },
    .modifier_count = 5
};

const ItemSpec ITEM_WATER_SPEC = {
    .item_id = "item_water",
    .modifiers = {
        { .type = ITEM_MOD_DATA, .mod_name = "dados", .as.data = { "Jarra d'Agua", "Agua fresca de nascente" } },
        { .type = ITEM_MOD_SKIN, .mod_name = "skin", .as.skin = { "Item_Jug.png" } },
        { .type = ITEM_MOD_CONSUMABLE, .mod_name = "bebida", .as.consumable = { .restore_thirst = 55.0f } },
        { .type = ITEM_MOD_STACK, .mod_name = "stack", .as.stack = { .max_stack = 5 } },
        { .type = ITEM_MOD_COLOR, .mod_name = "cor", .as.color = { .color = 0x64C8FF, .backcolor = 0x143250 } }
    },
    .modifier_count = 5
};

const ItemSpec ITEM_HERB_SPEC = {
    .item_id = "item_herb",
    .modifiers = {
        { .type = ITEM_MOD_DATA, .mod_name = "dados", .as.data = { "Erva Medicinal", "Planta raras com forte poder curativo" } },
        { .type = ITEM_MOD_SKIN, .mod_name = "skin", .as.skin = { "Item_Herb.png" } },
        { .type = ITEM_MOD_CONSUMABLE, .mod_name = "cura", .as.consumable = { .restore_health = 35.0f } },
        { .type = ITEM_MOD_STACK, .mod_name = "stack", .as.stack = { .max_stack = 20 } },
        { .type = ITEM_MOD_COLOR, .mod_name = "cor", .as.color = { .color = 0x64F08C, .backcolor = 0x0F3C19 } }
    },
    .modifier_count = 5
};

const ItemSpec ITEM_STEAK_SPEC = {
    .item_id = "item_steak",
    .modifiers = {
        { .type = ITEM_MOD_DATA, .mod_name = "dados", .as.data = { "Bife Assado", "Carne Suculenta altamente energetica" } },
        { .type = ITEM_MOD_SKIN, .mod_name = "skin", .as.skin = { "Item_Steak.png" } },
        { .type = ITEM_MOD_CONSUMABLE, .mod_name = "comida", .as.consumable = { .restore_hunger = 60.0f, .restore_health = 15.0f } },
        { .type = ITEM_MOD_STACK, .mod_name = "stack", .as.stack = { .max_stack = 5 } },
        { .type = ITEM_MOD_COLOR, .mod_name = "cor", .as.color = { .color = 0xDC5A46, .backcolor = 0x3C140F } }
    },
    .modifier_count = 5
};

const ItemSpec ITEM_SEED_SPEC = {
    .item_id = "item_seed",
    .modifiers = {
        { .type = ITEM_MOD_DATA, .mod_name = "dados", .as.data = { "Semente de Planta", "Semente fertil que germina no solo" } },
        { .type = ITEM_MOD_SKIN, .mod_name = "skin", .as.skin = { "Item_Herb.png" } },
        { .type = ITEM_MOD_CONSUMABLE, .mod_name = "comida", .as.consumable = { .restore_hunger = 10.0f } },
        { .type = ITEM_MOD_STACK, .mod_name = "stack", .as.stack = { .max_stack = 20 } },
        { .type = ITEM_MOD_COLOR, .mod_name = "cor", .as.color = { .color = 0x90EE90, .backcolor = 0x2E8B57 } }
    },
    .modifier_count = 5
};

// ---------------------------------------------------------------------------
// Game Setup & Content Spawning
// ---------------------------------------------------------------------------

void setup_game_species_and_world(int* out_center_x, int* out_center_y) {
    int cx, cy;
    init_creature_system_custom(&MAP_PRESET_ARCHIPELAGO, &cx, &cy);
    if (out_center_x) *out_center_x = cx;
    if (out_center_y) *out_center_y = cy;

    // ---------------------------------------------------------------------------
    // Setup Terrain Block Modifiers (Collision & Colors)
    // ---------------------------------------------------------------------------
    tile_specs[FLOOR].modifiers[0] = tile_mod_collision(TILE_COLLISION_LAND);
    tile_specs[FLOOR].modifiers[1] = tile_mod_color(rgb(170, 170, 170), rgb(90, 50, 25));
    tile_specs[FLOOR].modifier_count = 2;

    tile_specs[MOUNTAIN].modifiers[0] = tile_mod_collision(TILE_COLLISION_MOUNTAIN);
    tile_specs[MOUNTAIN].modifiers[1] = tile_mod_color(rgb(180, 190, 200), rgb(50, 55, 65));
    tile_specs[MOUNTAIN].modifier_count = 2;

    tile_specs[WATER].modifiers[0] = tile_mod_collision(TILE_COLLISION_WATER);
    tile_specs[WATER].modifiers[1] = tile_mod_color(rgb(70, 160, 240), rgb(15, 35, 70));
    tile_specs[WATER].modifier_count = 2;

    tile_specs[VOID_TILE].modifiers[0] = tile_mod_collision(TILE_COLLISION_VOID);
    tile_specs[VOID_TILE].modifiers[1] = tile_mod_color(rgb(160, 60, 220), rgb(20, 10, 30));
    tile_specs[VOID_TILE].modifier_count = 2;

    // ---------------------------------------------------------------------------
    // User-Defined Species Specs with Behavior, Ability, Metabolism, Preferences & Colors
    // ---------------------------------------------------------------------------

    // 1. Árvore Anciã (Plant, Photosynthesis, Spores, Regeneration)
    CreatureSpec tree_spec = {
        .species_name = "Arvore Ancia",
        .modifiers = {
            mod_data("Carvalho", "Arvore Ancia", "Natureza"),
            mod_skin("Feature_Tree_Full.png"),
            mod_movement("estatico", MOVE_NONE),
            mod_diet("fotossintese", DIET_PHOTOSYNTHESIS),
            mod_repro("esporeamento", REPRO_SPORE_SEED),
            mod_stats("status", 200.0f, 100.0f, 100.0f),
            mod_plant("planta", true, true, 20.0f, "item_herb"),
            mod_ability("regeneracao", ABILITY_REGENERATION, 1.0f),
            mod_loot("loot_fruta", &ITEM_FRUIT_SPEC, 1, 3, 1.0f),
            mod_color("cor", rgb(90, 220, 90), rgb(20, 50, 20))
        },
        .modifier_count = 10
    };

    // 2. Dragão Alado (Flying, Carnivore, Territorial, Vampirism, Fast Metabolism)
    CreatureSpec dragon_spec = {
        .species_name = "Dragao Alado",
        .modifiers = {
            mod_data("Smaug", "Dragao Alado", "Dracones"),
            mod_skin("Creature_Dragon_U.png"),
            mod_movement("voo", MOVE_FLY),
            mod_diet("carnivoro", DIET_CARNIVORE),
            mod_repro("acasalamento", REPRO_SEX),
            mod_stats("status", 180.0f, 100.0f, 100.0f),
            mod_combat("combate_dragao", 30.0f, 12.0f, 12.0f),
            mod_personality("personalidade", 90, 80, 20, 80),
            mod_behavior("territorial", BEHAVIOR_TERRITORIAL),
            mod_ability("vampirismo", ABILITY_VAMPIRISM, 1.0f),
            mod_metabolism("metabolismo", METABOLISM_FAST),
            mod_loot("loot_bife", &ITEM_STEAK_SPEC, 2, 4, 1.0f),
            mod_color("cor", rgb(255, 100, 80), rgb(60, 10, 10))
        },
        .modifier_count = 13
    };

    // 3. Cavaleiro Imperial (Walking, Omnivore, Herding, Terrain Preference)
    CreatureSpec knight_spec = {
        .species_name = "Cavaleiro Imperial",
        .modifiers = {
            mod_data("Arthur", "Cavaleiro Imperial", "Reino"),
            mod_skin("Human_Knight_M.png"),
            mod_movement("terrestre", MOVE_WALK),
            mod_diet("onivoro", DIET_OMNIVORE),
            mod_repro("acasalamento", REPRO_SEX),
            mod_stats("status", 150.0f, 100.0f, 100.0f),
            mod_combat("combate_imperial", 22.0f, 8.0f, 10.0f),
            mod_personality("personalidade", 85, 40, 70, 50),
            mod_behavior("bando", BEHAVIOR_HERDING),
            mod_preferences("preferencias", FLOOR, "item_bread", "Cavaleiro Imperial", "Goblin Ladrao", 1.3f),
            mod_loot("loot_pao", &ITEM_BREAD_SPEC, 1, 2, 0.9f),
            mod_color("cor", rgb(220, 220, 255), rgb(30, 40, 70))
        },
        .modifier_count = 12
    };

    // 4. Goblin Ladrão (Walking, Scavenger, Camouflage, Fast Metabolism)
    CreatureSpec goblin_spec = {
        .species_name = "Goblin Ladrao",
        .modifiers = {
            mod_data("Snark", "Goblin Ladrao", "Tribo"),
            mod_skin("Creature_Goblin_U.png"),
            mod_movement("terrestre", MOVE_WALK),
            mod_diet("onivoro", DIET_OMNIVORE),
            mod_repro("mitose", REPRO_MITOSIS_SPLIT),
            mod_stats("status", 90.0f, 100.0f, 100.0f),
            mod_combat("combate_furtivo", 14.0f, 2.0f, 8.0f),
            mod_personality("personalidade", 30, 85, 20, 90),
            mod_behavior("carniceiro", BEHAVIOR_SCAVENGER),
            mod_ability("camuflagem", ABILITY_CAMOUFLAGE, 1.0f),
            mod_metabolism("metabolismo", METABOLISM_FAST),
            mod_loot("loot_fruta", &ITEM_FRUIT_SPEC, 1, 2, 0.8f),
            mod_color("cor", rgb(120, 230, 100), rgb(20, 50, 15))
        },
        .modifier_count = 13
    };

    // 5. Gato Místico (Walking, Herbivore, Pacifist, Venom, Slow Metabolism)
    CreatureSpec cat_spec = {
        .species_name = "Gato Mistico",
        .modifiers = {
            mod_data("Felix", "Gato Mistico", "Natureza"),
            mod_skin("Creature_Cat_U.png"),
            mod_movement("terrestre", MOVE_WALK),
            mod_diet("herbivoro", DIET_HERBIVORE),
            mod_repro("mitose", REPRO_MITOSIS_SPLIT),
            mod_stats("status", 80.0f, 100.0f, 100.0f),
            mod_combat("combate_agil", 6.0f, 1.0f, 6.0f),
            mod_personality("personalidade", 40, 50, 60, 80),
            mod_behavior("pacifista", BEHAVIOR_PACIFIST),
            mod_ability("veneno", ABILITY_VENOM, 1.0f),
            mod_metabolism("metabolismo", METABOLISM_SLOW),
            mod_loot("loot_erva", &ITEM_HERB_SPEC, 1, 2, 0.6f),
            mod_color("cor", rgb(200, 150, 255), rgb(40, 20, 60))
        },
        .modifier_count = 13
    };

    // 6. Planta Carnívora de Gaia (Plant Spec, Fruit Producer, Regeneration)
    CreatureSpec plant_spec = {
        .species_name = "Planta Carnivora",
        .modifiers = {
            mod_data("Gaia", "Planta Carnivora", "Flora"),
            mod_skin("Feature_Tree_Full.png"),
            mod_movement("estatico", MOVE_NONE),
            mod_diet("fotossintese", DIET_PHOTOSYNTHESIS),
            mod_repro("esporeamento", REPRO_SPORE_SEED),
            mod_stats("status", 160.0f, 100.0f, 100.0f),
            mod_plant("planta", true, true, 15.0f, "item_fruit"),
            mod_ability("regeneracao", ABILITY_REGENERATION, 1.0f),
            mod_loot("loot_fruta", &ITEM_FRUIT_SPEC, 1, 3, 1.0f),
            mod_color("cor", rgb(255, 120, 180), rgb(50, 15, 30))
        },
        .modifier_count = 10
    };

    const CreatureSpec* specs[] = {
        &tree_spec, &dragon_spec, &knight_spec, &goblin_spec, &cat_spec, &plant_spec
    };

    // Populate Entities in Game World
    for (int i = 0; i < 24; i++) {
        int rx = cx + random_int(-25, 25);
        int ry = cy + random_int(-25, 25);
        const CreatureSpec* spec = specs[i % 6];
        MovementType mtype = MOVE_WALK;
        for (int m = 0; m < spec->modifier_count; m++) {
            if (spec->modifiers[m].type == MOD_TYPE_MOVEMENT) {
                mtype = spec->modifiers[m].as.movement.movement;
                break;
            }
        }
        if (mtype == MOVE_NONE || is_tile_walkable_for(rx, ry, mtype)) {
            Entity* e = spawn_entity_from_spec(spec, rx, ry);
            if (e) {
                entity_add_item_spec(e, &ITEM_BREAD_SPEC, random_int(1, 3));
                entity_add_item_spec(e, &ITEM_WATER_SPEC, random_int(1, 2));
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
