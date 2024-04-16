local br = require("bruter.bruter");
br.vm.oneliner = true;


local config = require("data.config");

local Needs = require("types.Needs");
local Skills = require("types.Skills");

local Item = require("types.Item");
local Room = require("types.Room");

local Creature = require("types.Creature");

local items = require("data.items");

local function checkPlayer()
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
        if world.creatures[x].position.global.x == roomx and world.creatures[x].position.global.y == roomy then
            temproom[world.creatures[x].position["local"].x][world.creatures[x].position["local"].y] = 64;
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
player.position["local"] = {x = 3, y = 3};
table.insert(world.creatures, player);
printRoom(world,1,1);

br.redraw = function()
    printRoom(world,player.position.global.x,player.position.global.y);
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

br.consume = function(item)
    player:consume(item);
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

br.w = function()
    move("up");
end

br.s = function()
    move("down");
end

br.a = function()
    move("left");
end

br.d = function()
    move("right");
end

br.world = world;
br.player = player;
br.player.items[1] = items.bottle(br.player.position, {
    items.water(br.player.position), 
    items.water(br.player.position),
    items.water(br.player.position),
    items.water(br.player.position),
    items.water(br.player.position)}
);

br.inventory = br.player.items;

br.move = move;

br.repl();