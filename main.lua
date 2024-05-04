local br = require("bruter.bruter");
br.vm.oneliner = true;

if not package.cpath then -- if on fengari(any)
    br.global.br = br;
end

local config = require("data.config");

local Needs = require("types.Needs");
local Skills = require("types.Skills");

local Item = require("types.Item");
local Room = require("types.Room");

local Creature = require("types.Creature");

local items = require("data.items");

local function checkPlayer()
    if br.player.needs.current.health <= 0 then
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

    local text = "";
    for y = 1, #temproom[1] do
        for x = 1, #temproom do
            text = text ..string.char(temproom[x][y]);
        end
        text = text .. "\n";
    end

    print(string.sub(text, 1, #text-1));-- print map without the last \n
end


local world = {};
world.creatures = {};
world.map = createMap(config.mapSize.x, config.mapSize.y);

br.updatefluids = function()
    for x = 1, #world.map do
        for y = 1, #world.map[1] do
            -- map all fluids and verify if there are two of more fluids in the same tile, if some, move one to a adjacent tile that exists and not a wall "#" or 32, the new tile must have less water than the original
            for i = 1, #world.map[x][y].items do 
                if world.map[x][y].items[i].liquid then 
                    for j = 1, #world.map[x][y].items do
                        if world.map[x][y].items[j].liquid 
                        and i ~= j
                        and world.map[x][y].items[i] ~= world.map[x][y].items[j] 
                        and world.map[x][y].items[i].position["local"].x == world.map[x][y].items[j].position["local"].x 
                        and world.map[x][y].items[i].position["local"].y == world.map[x][y].items[j].position["local"].y then
                            local item = world.map[x][y].items[j];
                            local newx = item.position["local"].x + br.utils.random(-1,1);
                            local newy = item.position["local"].y + br.utils.random(-1,1);
                            if newx > 0 and newx < #world.map[x][y].map and newy > 0 and newy < #world.map[x][y].map[1] and world.map[x][y].map[newx][newy] ~= 35 then
                                item.position["local"].x = newx;
                                item.position["local"].y = newy; 
                            end
                        end
                    end
                end
            end
        end
    end
end

br.spawn = function(creature, gx, gy, lx, ly)
    local c = Creature(creature);
    print(creature .. " spawned at " .. gx .. "," .. gy .. " local " .. lx .. "," .. ly)
    c.position.global = {x = gx, y = gy};
    c.position["local"] = {x = lx, y = ly};
    table.insert(world.creatures, c);
    table.insert(world.map[gx][gy].creatures, c);
    return c;
end

br.getitem = function(creature, itemid, filledwith)
    local item = items[itemid](creature.position);
    if filledwith then
        for x = 1, item.maxStorage do
            table.insert(item.items, items[filledwith](creature.position));
        end
    end
    table.insert(creature.items, item);
    return item;
end

local player = br.spawn("epaminondas", 1, 1, 3, 3);
printRoom(world,1,1);

br.redraw = function()
    printRoom(world,player.position.global.x,player.position.global.y);
end

local function move(direction)
    local creature = player;
    creature.plan("move", {direction});
    world.passTurn();
end

br.use = function(itemid)
    if itemid == nil then
        print("use <itemid>");
        return;
    end
    print(player.name .. " used " .. player.items[itemid].name);
    player.plan("consume", {itemid});
    world.passTurn();
end

br.pee = function(...)
    player.plan("pee", {...});
    world.passTurn();
end

br.poo = function(...)
    player.plan("poo", {...});
    world.passTurn();
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

world.passTurn = function()
    for x = 1, #world.creatures do
        if #world.creatures[x].planned > 0 then
            world.creatures[x].act(world)
        end
        world.creatures[x]:passTurn();
        world.creatures[x]:checkNeeds(world);
    end
    br.updatefluids();
    checkPlayer();
    br.redraw();
end

br.player = player;
br.getitem(player, "bottle", "water");
br.getitem(player, "smallbox", "bread")

br.inventory = br.player.items;

br.needs = function()
    br.help(br.player.needs.current);
end

br.skills = function()
    br.help(br.player.skills);
end

br.drop = function(itemid)
    if itemid == nil then
        print("drop <itemid>");
        return;
    end
    player.plan("drop", {itemid});
    world.passTurn();
end

br.pick = function(direction)
    player.plan("pick", {direction});
    world.passTurn();
end

br.items = function()
    for x = 1, #br.player.items do
        local text = x .. ". ";
        if br.player.items[x].maxStorage > 0 then
            local content = {}
            for y = 1, #br.player.items[x].items do
                if content[br.player.items[x].items[y].name] == nil then
                    content[br.player.items[x].items[y].name] = 1;
                else
                    content[br.player.items[x].items[y].name] = content[br.player.items[x].items[y].name] + 1;
                end
            end
            text = text .. br.player.items[x].name .. " containing ";
            if br.player.items[x].liquidContainer then
                local txt = "";
                for k,v in pairs(content) do
                    txt = txt .. v*100 .. "ml of " .. k .. ", ";
                end
                --remove the last , and space
                text = text .. txt:sub(1, -3);
            else
                for k,v in pairs(content) do
                    text = text .. v .. " " .. k .. "s";
                end
            end
        else
            text = text .. br.player.items[x].name;
        end
        print(text);
    end
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

if io then -- if not on fengari-web(only works on nodejs fengari and lua)
    br.repl();
else
    return br;
end