#ifndef WORLD_GEN_H
#define WORLD_GEN_H

#include <stdint.h>
#include <stdbool.h>

#define MAP_WIDTH 512
#define MAP_HEIGHT 512

typedef enum {
    FLOOR = 0,       // Solo Fértil / Gramado
    MOUNTAIN = 1,    // Pico de Montanha (Intransponível)
    WATER = 2,       // Água Oceânica / Lagos
    SAND = 3,        // Areia / Praia Costeira / Deserto
    STONE = 4,       // Chão Rochoso / Sopé de Montanha
    VOID_TILE = 5,
    NUM_TILES = 6
} TileType;

typedef struct {
    uint32_t seed;
    float noise_scale;
    int octaves;
    int num_islands;
    float min_island_radius;
    float max_island_radius;
    float water_threshold;
    float mountain_threshold;
    int ca_smooth_iterations;
} MapGenConfig;

extern const MapGenConfig MAP_PRESET_ARCHIPELAGO;
extern const MapGenConfig MAP_PRESET_CONTINENT;
extern const MapGenConfig MAP_PRESET_HIGHLANDS;

void world_gen_generate(uint8_t map[MAP_HEIGHT][MAP_WIDTH], const MapGenConfig* config, int* out_center_x, int* out_center_y);
bool world_gen_is_walkable(const uint8_t map[MAP_HEIGHT][MAP_WIDTH], int x, int y, int move_type);

#endif // WORLD_GEN_H
