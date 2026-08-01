#ifndef GAME_H
#define GAME_H

#include "creature_system.h"

extern const MapGenConfig MAP_PRESET_ARCHIPELAGO;
extern const MapGenConfig MAP_PRESET_CONTINENT;
extern const MapGenConfig MAP_PRESET_HIGHLANDS;

extern const ItemSpec ITEM_BREAD_SPEC;
extern const ItemSpec ITEM_FRUIT_SPEC;
extern const ItemSpec ITEM_WATER_SPEC;
extern const ItemSpec ITEM_HERB_SPEC;
extern const ItemSpec ITEM_STEAK_SPEC;
extern const ItemSpec ITEM_SEED_SPEC;

void setup_game_species_and_world(int* out_center_x, int* out_center_y);

#endif // GAME_H
