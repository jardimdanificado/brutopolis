#ifndef BRUTOPOLIS_NATIVE_WORLD_H
#define BRUTOPOLIS_NATIVE_WORLD_H

#include <stdint.h>

#define NATIVE_MAP_WIDTH 512
#define NATIVE_MAP_HEIGHT 512
#define NATIVE_MAX_PATH 64
#define MAP_WIDTH NATIVE_MAP_WIDTH
#define MAP_HEIGHT NATIVE_MAP_HEIGHT
#define MAX_ENTITIES 96
#define MAX_DROPPED_ITEMS 128
#define FLOOR NATIVE_FLOOR
#define MOUNTAIN NATIVE_MOUNTAIN
#define WATER NATIVE_WATER
#define VOID_TILE NATIVE_VOID
#define MOVE_NONE NATIVE_MOVE_NONE
#define MOVE_WALK NATIVE_MOVE_WALK
#define MOVE_AQUATIC NATIVE_MOVE_AQUATIC
#define MOVE_FLY NATIVE_MOVE_FLY
#define MOTOR_SLEEP NATIVE_MOTOR_SLEEP
#define MOTOR_ATTACK NATIVE_MOTOR_ATTACK
#define MOTOR_FLEE NATIVE_MOTOR_FLEE
#define MOTOR_SOCIALIZE NATIVE_MOTOR_SOCIALIZE
#define MOTOR_EAT NATIVE_MOTOR_EAT
#define MOTOR_DRINK NATIVE_MOTOR_DRINK

enum { NATIVE_FLOOR = 0, NATIVE_MOUNTAIN = 1, NATIVE_WATER = 2, NATIVE_VOID = 3 };
enum { NATIVE_MOVE_NONE = 0, NATIVE_MOVE_WALK = 1, NATIVE_MOVE_AQUATIC = 2, NATIVE_MOVE_FLY = 3 };
enum { NATIVE_MOTOR_IDLE = 0, NATIVE_MOTOR_MOVE, NATIVE_MOTOR_EAT, NATIVE_MOTOR_DRINK,
       NATIVE_MOTOR_SLEEP, NATIVE_MOTOR_ATTACK, NATIVE_MOTOR_FLEE,
       NATIVE_MOTOR_SOCIALIZE, NATIVE_MOTOR_EXPLORE };

typedef struct { int x, y; } NativeGridPos;

void native_world_generate(void);
int native_world_tile(int x, int y);
int native_world_walkable(int x, int y, int movement);
int native_world_find_water(int sx, int sy, int movement, int radius,
                            NativeGridPos *out_pos);
int native_world_find_path(int sx, int sy, int gx, int gy, int movement,
                           NativeGridPos *out_path, int max_path);

#endif
