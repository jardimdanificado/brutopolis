#include "game.h"

void setup_game_species_and_world(int* out_center_x, int* out_center_y) {
    int cx, cy;
    init_creature_system(&cx, &cy);
    if (out_center_x) *out_center_x = cx;
    if (out_center_y) *out_center_y = cy;

    // ---------------------------------------------------------------------------
    // User-Defined Example Species Specs (ISO C99 Designated Initializers)
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
            { .type = MOD_TYPE_LOOT, .as.loot = { ITEM_FRUIT, 1, 3, 1.0f } }
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
            { .type = MOD_TYPE_LOOT, .as.loot = { ITEM_STEAK, 2, 4, 1.0f } }
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
            { .type = MOD_TYPE_LOOT, .as.loot = { ITEM_BREAD, 1, 2, 0.9f } }
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
            { .type = MOD_TYPE_LOOT, .as.loot = { ITEM_FRUIT, 1, 2, 0.8f } }
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
            { .type = MOD_TYPE_LOOT, .as.loot = { ITEM_HERB, 1, 2, 0.6f } }
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
                entity_add_item(e, ITEM_BREAD, random_int(1, 2));
                entity_add_item(e, ITEM_JUG_WATER, 1);
            }
        }
    }

    // Populate Dropped World Items
    for (int i = 0; i < 25; i++) {
        int rx = cx + random_int(-25, 25);
        int ry = cy + random_int(-25, 25);
        if (is_tile_walkable_for(rx, ry, MOVE_WALK)) {
            ItemType t = (ItemType)(1 + random_int(0, ITEM_TYPE_COUNT - 2));
            spawn_dropped_item(rx, ry, t, random_int(1, 3));
        }
    }
}
