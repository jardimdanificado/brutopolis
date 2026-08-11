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

// Keep the simulation map large enough for exploration while fitting the
// JavaScript runtime budget on the embedded MicroQuickJS target.
var MAP_WIDTH = 128, MAP_HEIGHT = 128;
var MAX_ENTITIES = 96, MAX_ITEMS = 128, MAX_PATH = 64;
var BFS_RADIUS = 40;

// ---------------------------------------------------------------------------
// World state (flat typed arrays for memory efficiency)
// ---------------------------------------------------------------------------
var worldMap = new Array(MAP_WIDTH * MAP_HEIGHT);  // uint8
for (var _i = 0; _i < worldMap.length; _i++) worldMap[_i] = WATER;

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
    return worldMap[y * MAP_WIDTH + x];
}
function setTile(x, y, t) {
    if (x < 0 || x >= MAP_WIDTH || y < 0 || y >= MAP_HEIGHT) return;
    worldMap[y * MAP_WIDTH + x] = t;
}
function tileCollision(t) {
    if (t === WATER) return TILE_WATER;
    if (t === MOUNTAIN) return TILE_MOUNTAIN;
    if (t === VOID_TILE) return TILE_VOID;
    return TILE_LAND;
}
function isTileWalkable(x, y, movement) {
    if (x < 0 || x >= MAP_WIDTH || y < 0 || y >= MAP_HEIGHT) return false;
    if (movement === MOVE_NONE) return false;
    var col = tileCollision(getTile(x, y));
    if (col === TILE_VOID) return false;
    if (movement === MOVE_FLY) return true;
    if (movement === MOVE_AQUATIC) return col === TILE_WATER;
    return col === TILE_LAND;
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

// ---------------------------------------------------------------------------
// Map generation (noise + islands + CA smoothing)
// ---------------------------------------------------------------------------
var _noiseSeed = 0;
function hash2(x, y) {
    var h = ((x * 1619 + y * 31337 + _noiseSeed * 6971) >>> 0);
    h ^= h >>> 17; h = (h * 0xbf324c81) >>> 0;
    h ^= h >>> 13; h = (h * 0x9a7ed521) >>> 0;
    h ^= h >>> 16;
    return h;
}
function vnoiseAt(x, y) { return (hash2(x, y) & 0xFFFF) / 65535.0; }
function smoothstep(t) { return t * t * (3.0 - 2.0 * t); }
function bilerp(a, b, c, d, tx, ty) { return (a + (b-a)*tx) + ((c + (d-c)*tx) - (a + (b-a)*tx))*ty; }
function vnoise(fx, fy) {
    var xi = Math.floor(fx), yi = Math.floor(fy);
    var tx = smoothstep(fx - xi), ty = smoothstep(fy - yi);
    return bilerp(vnoiseAt(xi, yi), vnoiseAt(xi+1, yi), vnoiseAt(xi, yi+1), vnoiseAt(xi+1, yi+1), tx, ty);
}
function fbm(fx, fy, octaves) {
    var val = 0.0, amp = 0.5, freq = 1.0, maxV = 0.0;
    for (var i = 0; i < octaves; i++) {
        val += vnoise(fx * freq, fy * freq) * amp;
        maxV += amp; amp *= 0.5; freq *= 2.1;
    }
    return val / maxV;
}
function islandFalloff(dx, dy, radius) {
    var d = dx*dx + dy*dy, r = radius*radius;
    if (d >= r) return 0.0;
    var t = 1.0 - d / r;
    return t * t * (3.0 - 2.0 * t);
}

function genMap(cfg) {
    if (!cfg) cfg = {};
    var seed         = cfg.seed         || 0;
    var noiseScale   = cfg.noiseScale   || 0.05;
    var octaves      = cfg.octaves      || 4;
    var numIslands   = cfg.numIslands   || 6;
    var minRadius    = cfg.minRadius    || 90.0;
    var maxRadius    = cfg.maxRadius    || 170.0;
    var waterThresh  = cfg.waterThresh  || 0.35;
    var mountThresh  = cfg.mountThresh  || 0.70;
    var caIter       = cfg.caIter       || 3;

    rngSeed(seed > 0 ? seed : (wagner.frameCount + 1));
    _noiseSeed = rngInt(0, 0x7FFFFFFF);

    var islands = [];
    islands.push({ cx: MAP_WIDTH/2, cy: MAP_HEIGHT/2, r: maxRadius });
    for (var i = 1; i < numIslands; i++) {
        var m = 40;
        islands.push({ cx: m + rngInt(0, MAP_WIDTH - 2*m), cy: m + rngInt(0, MAP_HEIGHT - 2*m), r: minRadius + rngInt(0, (maxRadius - minRadius + 1)|0) });
    }

    var hmap = new Array(MAP_WIDTH * MAP_HEIGHT);
    for (var y = 0; y < MAP_HEIGHT; y++) {
        for (var x = 0; x < MAP_WIDTH; x++) {
            var n = fbm(x * noiseScale, y * noiseScale, octaves);
            var falloff = 0.0;
            for (var k = 0; k < islands.length; k++) {
                var f = islandFalloff(x - islands[k].cx, y - islands[k].cy, islands[k].r);
                if (f > falloff) falloff = f;
            }
            hmap[y * MAP_WIDTH + x] = n * falloff;
        }
    }

    for (var y = 0; y < MAP_HEIGHT; y++) {
        for (var x = 0; x < MAP_WIDTH; x++) {
            var h = hmap[y * MAP_WIDTH + x];
            worldMap[y * MAP_WIDTH + x] = (h > mountThresh) ? MOUNTAIN : (h > waterThresh) ? FLOOR : WATER;
        }
    }

    // CA smoothing
    var tmp = new Array(MAP_WIDTH * MAP_HEIGHT);
    for (var iter = 0; iter < caIter; iter++) {
        for (var y = 0; y < MAP_HEIGHT; y++) {
            for (var x = 0; x < MAP_WIDTH; x++) {
                var land = 0;
                for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
                    var nx = x+dx, ny = y+dy;
                    if (nx>=0 && nx<MAP_WIDTH && ny>=0 && ny<MAP_HEIGHT && worldMap[ny*MAP_WIDTH+nx] !== WATER) land++;
                }
                var cur = worldMap[y * MAP_WIDTH + x];
                tmp[y * MAP_WIDTH + x] = (cur !== WATER) ? (land >= 4 ? cur : WATER) : (land >= 6 ? FLOOR : WATER);
            }
        }
        for (var i = 0; i < tmp.length; i++) worldMap[i] = tmp[i];
    }
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

// ---------------------------------------------------------------------------
// BFS Pathfinding
// ---------------------------------------------------------------------------
function findPath(sx, sy, gx, gy, movement) {
    if (sx === gx && sy === gy) return [];
    if (movement === MOVE_NONE) return [];
    if (!isTileWalkable(gx, gy, movement)) {
        var dxs = [0,0,-1,1,-1,1,-1,1], dys = [-1,1,0,0,-1,-1,1,1];
        var best = null, bestD = 1e9;
        for (var i = 0; i < 8; i++) {
            var nx = gx+dxs[i], ny = gy+dys[i];
            if (isTileWalkable(nx, ny, movement)) {
                var d = (nx-sx)*(nx-sx)+(ny-sy)*(ny-sy);
                if (d < bestD) { bestD = d; best = {x:nx,y:ny}; }
            }
        }
        if (!best) return [];
        gx = best.x; gy = best.y;
        if (sx===gx && sy===gy) return [];
    }

    var GS = BFS_RADIUS * 2 + 1;
    var visited = new Array(GS * GS); for (var i=0;i<visited.length;i++) visited[i]=false;
    var prevX   = new Array(GS * GS); var prevY = new Array(GS * GS);
    var qx = [], qy = [];
    visited[BFS_RADIUS * GS + BFS_RADIUS] = true;
    qx.push(sx); qy.push(sy);
    var found = false;
    var DX = [0,0,-1,1], DY = [-1,1,0,0];

    for (var head = 0; head < qx.length; head++) {
        var cx = qx[head], cy = qy[head];
        if (cx===gx && cy===gy) { found=true; break; }
        for (var i = 0; i < 4; i++) {
            var nx = cx+DX[i], ny = cy+DY[i];
            var lx = nx-sx+BFS_RADIUS, ly = ny-sy+BFS_RADIUS;
            if (lx>=0&&lx<GS&&ly>=0&&ly<GS&&!visited[ly*GS+lx]&&isTileWalkable(nx,ny,movement)) {
                visited[ly*GS+lx]=true;
                prevX[ly*GS+lx]=cx; prevY[ly*GS+lx]=cy;
                qx.push(nx); qy.push(ny);
            }
        }
    }
    if (!found) return [];

    var path = [];
    var curX = gx, curY = gy;
    while (curX!==sx||curY!==sy) {
        path.push({x:curX,y:curY});
        var lx=curX-sx+BFS_RADIUS, ly=curY-sy+BFS_RADIUS;
        var px=prevX[ly*GS+lx], py=prevY[ly*GS+lx];
        curX=px; curY=py;
        if (path.length > MAX_PATH * 4) break;
    }
    path.reverse();
    if (path.length > MAX_PATH) path = path.slice(0, MAX_PATH);
    return path;
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
