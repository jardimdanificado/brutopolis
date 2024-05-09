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

local World = require("types.World");

local items = require("data.items");
local furnitures = require("data.furnitures");

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


local world = World(config, br);
local player = world.spawn("epaminondas", 1, 1, 3, 3);

br.spawn = world.spawn;
br.getitem = world.getitem;

br.redraw = function()
    printRoom(world,player.position.global.x,player.position.global.y);
end
br.redraw();

local function move(direction)
    local creature = player;
    creature.plan("move", {direction});
    world.passTurn(br.redraw);
end

br.use = function(itemid)
    if itemid == nil then
        print("use <itemid>");
        return;
    end
    print(player.name .. " used " .. player.items[itemid].name);
    player.plan("consume", {itemid});
    world.passTurn(br.redraw);
end

br.pee = function(...)
    player.plan("pee", {...});
    world.passTurn(br.redraw);
end

br.poo = function(...)
    player.plan("poo", {...});
    world.passTurn(br.redraw);
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
br.world.player = player;

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
    world.passTurn(br.redraw);
end

br.pick = function(direction)
    player.plan("pick", {direction});
    world.passTurn(br.redraw);
end

br.put = function(itemid, containerid, other)
    if containerid == "in" or containerid == "inside" then
        containerid = other;
    end
    player.plan("put", {itemid, containerid});
    world.passTurn(br.redraw);
end

br.remove = function(itemid, containerid, other)
    if containerid == "from" then
        containerid = other;
    end
    player.plan("remove", {itemid, containerid});
    world.passTurn(br.redraw);
end

br.sleep = function()
    player.plan("sleep",{});
    world.passTurn(br.redraw);
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
                    text = text .. v .. " " .. k .. "s, ";
                end
                --remove the last , and space
                text = text:sub(1, -3);
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