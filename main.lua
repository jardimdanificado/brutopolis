local br = require("bruter.bruter");
local config = require("data.config");

local Needs = require("types.Needs");
local Skills = require("types.Skills");

local Item = require("types.Item");
local Room = require("types.Room");

local Creature = require("types.Creature");

local function checkPlayer()
    --creatureCheckNeeds(br.player);
    if br.player.health <= 0 then
        print("Game Over");
        os.exit();
    end
end

local function createMap(sizex,sizey)
    local map = {};
    for x = 1, sizex do
        map[x] = {};
        for y = 1, sizey do
            map[x][y] = Room(config.minRoomSize, config.maxRoomSize);
            map[x][y].position = {x = x, y = y};
        end
    end
    return map;
end

local function printRoom(world,roomx,roomy)
    local room = world.map[roomx][roomy];
    local temproom = br.utils.table.clone(room.map);

    for x = 1, #world.creatures do
        if world.creatures[x].room.x == roomx and world.creatures[x].room.y == roomy then
            temproom[world.creatures[x].position.x][world.creatures[x].position.y] = 64;
        end
    end

    for y = 1, #temproom[1] do
        for x = 1, #temproom do
            io.write(string.char(temproom[x][y]));
        end
        io.write("\n");
    end
end

local world = {};
world.creatures = {};
world.map = createMap(config.mapSize.x, config.mapSize.y);

local player = Creature("player");
player.position = {x = 3, y = 3};
table.insert(world.creatures, player);
printRoom(world,1,1);

local function move(creatureName, direction)
    local creature = nil;

    for x = 1, #world.creatures do
        if world.creatures[x].name == creatureName then
            creature = world.creatures[x];
        end
    end
    if creature == nil then
        print("Creature not found");
        return;
    end

    local room = world.map[creature.room.x][creature.room.y];

    local x = creature.position.x;
    local y = creature.position.y;

    if direction == "up" then
        if room.map[x][y - 1] == 32 then
            creature.position.y = y - 1;
        end
    elseif direction == "down" then
        if room.map[x][y + 1] == 32 then
            creature.position.y = y + 1;
        end
    elseif direction == "left" then
        if room.map[x - 1][y] == 32 then
            creature.position.x = x - 1;
        end
    elseif direction == "right" then
        if room.map[x + 1][y] == 32 then
            creature.position.x = x + 1;
        end
    end

    printRoom(world,creature.room.x,creature.room.y);
    for x = 1, #world.creatures do
        creature:passTurn();
        creature:checkNeeds(world);
    end
    checkPlayer();
end

br.world = world;
br.player = player;

br.move = move;

br.repl();

--br.help(world.map[1][1].map);
