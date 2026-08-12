// =============================================================================
// world.js — World state, map generation, clock, pathfinding, RNG
// =============================================================================

// ---------------------------------------------------------------------------
// Enums / Constants
// ---------------------------------------------------------------------------
var FLOOR = 0, MOUNTAIN = 1, WATER = 2, VOID_TILE = 3;
var TILE_LAND = 0, TILE_WATER = 1, TILE_MOUNTAIN = 2, TILE_VOID = 3;
var MOVE_NONE = 0, MOVE_WALK = 1, MOVE_AQUATIC = 2, MOVE_FLY = 3;
var DIET_NONE = 0, DIET_PHOTOSYNTHESIS = 1, DIET_HERBIVORE = 2, DIET_CARNIVORE = 3, DIET_OMNIVORE = 4;
var REPRO_NONE = 0, REPRO_MITOSIS = 1, REPRO_SPORE = 2, REPRO_SEX = 3;
var MOTOR_IDLE = 0, MOTOR_MOVE = 1, MOTOR_EAT = 2, MOTOR_DRINK = 3,
    MOTOR_SLEEP = 4, MOTOR_ATTACK = 5, MOTOR_FLEE = 6, MOTOR_SOCIALIZE = 7, MOTOR_EXPLORE = 8;
var BEHAVIOR_NONE = 0, BEHAVIOR_SCAVENGER = 1, BEHAVIOR_TERRITORIAL = 2,
    BEHAVIOR_PACIFIST = 3, BEHAVIOR_HERDING = 4, BEHAVIOR_CANNIBALISM = 5;
var ABILITY_NONE = 0, ABILITY_REGEN = 1, ABILITY_VAMPIRISM = 2, ABILITY_VENOM = 3, ABILITY_CAMOUFLAGE = 4;
var METABOLISM_NORMAL = 0, METABOLISM_FAST = 1, METABOLISM_SLOW = 2;

// Terrain dimensions and storage belong to the native engine.
var MAP_WIDTH = native_map_width(), MAP_HEIGHT = native_map_height();
var MAX_ENTITIES = 96, MAX_ITEMS = 128, MAX_PATH = 64;
var BFS_RADIUS = 40;

// ---------------------------------------------------------------------------
// World state (flat typed arrays for memory efficiency)
// ---------------------------------------------------------------------------
var worldMap = null;

var entities = [];   // array of entity objects, up to MAX_ENTITIES slots
var droppedItems = []; // array of dropped item objects
var nextEntityId = 1;

for (var _i = 0; _i < MAX_ENTITIES; _i++) entities.push(null);
for (var _i = 0; _i < MAX_ITEMS; _i++) droppedItems.push(null);

// ---------------------------------------------------------------------------
// Tile helpers
// ---------------------------------------------------------------------------
var tileColors = [
    { fg: rgb(170,170,170), bg: rgb(90,50,25)   },  // FLOOR
    { fg: rgb(180,190,200), bg: rgb(50,55,65)   },  // MOUNTAIN
    { fg: rgb(70,160,240),  bg: rgb(15,35,70)   },  // WATER
    { fg: rgb(160,60,220),  bg: rgb(20,10,30)   },  // VOID
];

function getTile(x, y) {
    if (x < 0 || x >= MAP_WIDTH || y < 0 || y >= MAP_HEIGHT) return VOID_TILE;
    return native_map_tile(x, y);
}
function setTile(x, y, t) {
    // Native terrain mutation will be exposed when destructible terrain is migrated.
}
function tileCollision(t) {
    if (t === WATER) return TILE_WATER;
    if (t === MOUNTAIN) return TILE_MOUNTAIN;
    if (t === VOID_TILE) return TILE_VOID;
    return TILE_LAND;
}
function isTileWalkable(x, y, movement) {
    if (x < 0 || x >= MAP_WIDTH || y < 0 || y >= MAP_HEIGHT) return false;
    return native_map_walkable(x, y, movement);
}

// ---------------------------------------------------------------------------
// World clock
// ---------------------------------------------------------------------------
var worldClock = { day: 0, hour: 0, minute: 0, totalTicks: 0, acc: 0.0, globalLight: 0.0, globalHeat: 0.2 };

function updateWorldClock(dt) {
    worldClock.acc += dt;
    while (worldClock.acc >= 1.0) {
        worldClock.acc -= 1.0;
        worldClock.minute++;
        worldClock.totalTicks++;
        if (worldClock.minute >= 60) {
            worldClock.minute = 0;
            worldClock.hour++;
            if (worldClock.hour >= 24) { worldClock.hour = 0; worldClock.day++; }
        }
    }
    var h = worldClock.hour + worldClock.minute / 60.0;
    var sr = 6, ss = 18;
    if (h >= sr && h <= ss) {
        var p = (h - sr) / (ss - sr);
        worldClock.globalLight = p <= 0.5 ? p * 2.0 : (1.0 - p) * 2.0;
        if (worldClock.globalLight < 0.2) worldClock.globalLight = 0.2;
    } else {
        worldClock.globalLight = 0.05;
    }
    worldClock.globalHeat = 0.15 + worldClock.globalLight * 0.70;
}

function getTileLight(x, y) {
    var t = getTile(x, y);
    var l = worldClock.globalLight;
    if (t === MOUNTAIN) l *= 1.2;
    else if (t === WATER) l *= 0.9;
    if (l > 1.0) l = 1.0;
    return l;
}

// ---------------------------------------------------------------------------
// Simple LCG RNG (deterministic)
// ---------------------------------------------------------------------------
var _rngState = 12345;
function rngSeed(s) { _rngState = (s >>> 0) || 12345; }
function rngNext() {
    _rngState = ((_rngState * 1664525 + 1013904223) >>> 0);
    return _rngState;
}
function rngFloat() { return (rngNext() & 0x7FFFFFFF) / 2147483647.0; }
function rngInt(lo, hi) { return lo + ((rngNext() >>> 0) % (hi - lo + 1)); }

function genMap(cfg) {
    native_map_generate();
}

function findLandCenter() {
    var cx = MAP_WIDTH >> 1, cy = MAP_HEIGHT >> 1;
    for (var r = 0; r < 50; r++) {
        var found = false;
        for (var dy = -r; dy <= r && !found; dy++) for (var dx = -r; dx <= r && !found; dx++) {
            if (isTileWalkable(cx+dx, cy+dy, MOVE_WALK)) { cx += dx; cy += dy; found = true; }
        }
        if (found) break;
    }
    return { x: cx, y: cy };
}

// Native pathfinding boundary. C owns the search and JS receives only the
// resulting path; the simulation still owns how that path is used.
function findPath(sx, sy, gx, gy, movement) {
    if (sx === gx && sy === gy || movement === MOVE_NONE) return [];
    return native_find_path(sx, sy, gx, gy, movement);
}

// ---------------------------------------------------------------------------
// Dropped Items
// ---------------------------------------------------------------------------
function spawnDroppedItem(x, y, spec, count) {
    for (var i = 0; i < MAX_ITEMS; i++) {
        if (!droppedItems[i]) {
            droppedItems[i] = { x:x, y:y, spec:spec, count:count, germinateTimer:0.0 };
            return;
        }
    }
}

function spawnDroppedItemScatter(ox, oy, spec, count) {
    var tx = ox, ty = oy, found = false;
    for (var r = 0; r <= 8 && !found; r++) {
        if (r === 0) {
            if (!isItemAtTile(ox, oy) && isTileWalkable(ox, oy, MOVE_WALK)) { tx=ox; ty=oy; found=true; }
        } else {
            for (var dy=-r; dy<=r&&!found; dy++) for (var dx=-r; dx<=r&&!found; dx++) {
                if (dx*dx+dy*dy<=r*r && dx*dx+dy*dy>(r-1)*(r-1)) {
                    var nx=ox+dx, ny=oy+dy;
                    if (!isItemAtTile(nx,ny) && isTileWalkable(nx,ny,MOVE_WALK)) { tx=nx; ty=ny; found=true; }
                }
            }
        }
    }
    spawnDroppedItem(tx, ty, spec, count);
}

function isItemAtTile(x, y) {
    for (var i = 0; i < MAX_ITEMS; i++) if (droppedItems[i] && droppedItems[i].x===x && droppedItems[i].y===y) return true;
    return false;
}
