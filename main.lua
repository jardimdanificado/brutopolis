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

br.redraw = function()
    printRoom(world,player.room.x,player.room.y);
end

local function move(direction)
    local creature = player;

    creature:move(world, direction);

    for x = 1, #world.creatures do
        creature:passTurn();
        creature:checkNeeds(world);
    end

    checkPlayer();
    br.redraw();
end

br.mv = function(direction)
    if direction == 8 or direction == 'u' then
        move("up");
    elseif direction == 2 or direction == 'd' then
        move("down");
    elseif direction == 4 or direction == 'l' then
        move("left");
    elseif direction == 6 or direction == 'r' then
        move("right");
    end
end

br.mvu = function()
    move("up");
end

br.mvd = function()
    move("down");
end

br.mvl = function()
    move("left");
end

br.mvr = function()
    move("right");
end

br.world = world;
br.player = player;

br.move = move;

br.repl();

--br.help(world.map[1][1].map);
