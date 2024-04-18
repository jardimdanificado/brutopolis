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
    
    for x = 1, #room.items do
        temproom[room.items[x].position["local"].x][room.items[x].position["local"].y] = 42;
    end

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

br.spawn = function(creature, gx, gy, lx, ly)
    local c = Creature(creature);
    c.position.global = {x = gx, y = gy};
    c.position["local"] = {x = lx, y = ly};
    table.insert(world.creatures, c);
    table.insert(world.map[gx][gy].creatures, c);
    return c;
end

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

br.use = function(itemid)
    player:consume(itemid);
end

br.pee = function(...)
    player:pee(world, ...);
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

br.needs = function()
    br.help(br.player.needs.current);
end

br.skills = function()
    br.help(br.player.skills);
end

br.items = function()
    br.help(br.player.items);
end

br.personality = function()
    br.help(br.player.personality);
end

br.interests = function()
    br.help(br.player.interests);
end

br.knowledges = function()
    br.help(br.player.knowledges);
end

br.move = move;

br.repl();