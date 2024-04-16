local br = require("bruter.bruter")
local Needs = require("types.Needs");
local Skills = require("types.Skills");
local Personality = require("types.Personality");
local Position = require("types.Position");

local Item = require("types.Item");

local function creaturePassTurn(creature)
    creature.needs.current.food = creature.needs.current.food + creature.needs.decay.food;
    creature.needs.current.water = creature.needs.current.water + creature.needs.decay.water;
    creature.needs.current.sleep = creature.needs.current.sleep + creature.needs.decay.sleep;
    creature.needs.current.social = creature.needs.current.social + creature.needs.decay.social;
    creature.needs.current.hygiene = creature.needs.current.hygiene + creature.needs.decay.hygiene;
    creature.needs.current.pee = creature.needs.current.pee + creature.needs.decay.pee;
    creature.needs.current.poo = creature.needs.current.poo + creature.needs.decay.poo;
end

local function creatureCheckNeeds(creature, world)
    if creature.needs.current.hygiene < 100 then
        if creature.needs.current.hygiene < 10 then
            print(creature.name .. " is disgusting");
        else
            print(creature.name .. " is dirty");
        end
    end

    if creature.needs.current.food < 100 then
        if creature.needs.current.food <= 0 then
            creature.health = creature.health - 10;
            print(creature.name .. " is starving to death");
            return;
        elseif creature.needs.current.food < 75 then
            print(creature.name .. " is starving");
        end
    end

    if creature.needs.current.water < 100 then
        if creature.needs.current.water <= 0 then
            creature.health = creature.health - 15;
            print(creature.name .. " is dehydrating to death");
            return;
        elseif creature.needs.current.water < 75 then
            print(creature.name .. " is dehydrated");
        end
    end

    if creature.needs.current.sleep <= 100 then
        if creature.needs.current.sleep <= 0 then
            creature.health = creature.health - 5;
            print(creature.name .. " is dying from lack of sleep");
        elseif creature.needs.current.sleep < 75 then
            print(creature.name .. " is exhausted");
        end
    end

    if creature.needs.current.pee >= 50 then
        if creature.needs.current.pee >= 100 then
            creature.needs.current.hygiene = creature.needs.current.hygiene - 100;
            creature.needs.current.pee = 0;
            table.insert(world.map[creature.position["global"].x][creature.position["global"].y].items, Item(creature.name .. "'s pee", "pee", creature.name, br.utils.table.clone(creature.position), br.utils.table.clone(creature.room)));
            print(creature.name .. " has wet itself");
        elseif creature.needs.current.water < 75 then
            print(creature.name .. " is bursting to pee");
        end
    end

    if creature.needs.current.poo >= 50 then
        if creature.needs.current.poo >= 100 then
            creature.needs.current.hygiene = creature.needs.current.hygiene - 100;
            creature.needs.current.poo = 0;
            table.insert(world.map[creature.position["global"].x][creature.position["global"].y].items, Item(creature.name .. "'s shit", "shit", creature.name, br.utils.table.clone(creature.position), br.utils.table.clone(creature.room)));
            print(creature.name .. " has soiled itself");
        else
            print(creature.name .. " is bursting to poo");
        end
    end

    if creature.needs.current.happiness < 100 then
        if creature.needs.current.happiness <= 0 then
            creature.health = creature.health - 10;
            print(creature.name .. " is dying inside");
        elseif creature.needs.current.happiness < 75 then
            print(creature.name .. " is sad");
        end
    end
end

local function creatureMove(creature, world, direction)
    local room = world.map[creature.position["global"].x][creature.position["global"].y];
    if direction == "up" then
        if room.map[creature.position["local"].x][creature.position["local"].y - 1] == 32 then
            creature.position["local"].y = creature.position["local"].y - 1;
        elseif room.map[creature.position["local"].x][creature.position["local"].y - 1] == 48 then
            if world.map[creature.position["global"].x][creature.position["global"].y - 1] then -- if room exists
                creature.position["global"].y = creature.position["global"].y - 1;
                creature.position["local"].y = #world.map[creature.position["global"].x][creature.position["global"].y][1];
                --find door in new room using the door list
                for x = 1, #world.map[creature.position["global"].x][creature.position["global"].y].doors do
                    if world.map[creature.position["global"].x][creature.position["global"].y].doors[x].direction == "down" then
                        creature.position["local"].x = world.map[creature.position["global"].x][creature.position["global"].y].doors[x].x;
                        creature.position["local"].y = world.map[creature.position["global"].x][creature.position["global"].y].doors[x].y;
                    end
                end
            end
        
        end
    elseif direction == "down" then
        if room.map[creature.position["local"].x][creature.position["local"].y + 1] == 32 then
            creature.position["local"].y = creature.position["local"].y + 1;
        elseif room.map[creature.position["local"].x][creature.position["local"].y + 1] == 48 then
            if world.map[creature.position["global"].x][creature.position["global"].y + 1] then -- if room exists
                creature.position["global"].y = creature.position["global"].y + 1;
                creature.position["local"].y = 1;
                --find door in new room using the door list
                for x = 1, #world.map[creature.position["global"].x][creature.position["global"].y].doors do
                    if world.map[creature.position["global"].x][creature.position["global"].y].doors[x].direction == "up" then
                        creature.position["local"].x = world.map[creature.position["global"].x][creature.position["global"].y].doors[x].x;
                        creature.position["local"].y = world.map[creature.position["global"].x][creature.position["global"].y].doors[x].y;
                    end
                end
            end
        end
    elseif direction == "left" then
        if room.map[creature.position["local"].x - 1][creature.position["local"].y] == 32 then
            creature.position["local"].x = creature.position["local"].x - 1;
        elseif room.map[creature.position["local"].x - 1][creature.position["local"].y] == 48 then
            if world.map[creature.position["global"].x - 1] and world.map[creature.position["global"].x - 1][creature.position["global"].y] then -- if room exists
                creature.position["global"].x = creature.position["global"].x - 1;
                creature.position["local"].x = #world.map[creature.position["global"].x][creature.position["global"].y];
                for x = 1, #world.map[creature.position["global"].x][creature.position["global"].y].doors do
                    if world.map[creature.position["global"].x][creature.position["global"].y].doors[x].direction == "right" then
                        creature.position["local"].x = world.map[creature.position["global"].x][creature.position["global"].y].doors[x].x;
                        creature.position["local"].y = world.map[creature.position["global"].x][creature.position["global"].y].doors[x].y;
                    end
                end
            end
        end
    elseif direction == "right" then
        if room.map[creature.position["local"].x + 1][creature.position["local"].y] == 32 then
            creature.position["local"].x = creature.position["local"].x + 1;
        elseif room.map[creature.position["local"].x + 1][creature.position["local"].y] == 48 then
            if world.map[creature.position["global"].x + 1] and world.map[creature.position["global"].x + 1][creature.position["global"].y] then -- if room exists
                creature.position["global"].x = creature.position["global"].x + 1;
                creature.position["local"].x = 1;
                for x = 1, #world.map[creature.position["global"].x][creature.position["global"].y].doors do
                    if world.map[creature.position["global"].x][creature.position["global"].y].doors[x].direction == "left" then
                        creature.position["local"].x = world.map[creature.position["global"].x][creature.position["global"].y].doors[x].x;
                        creature.position["local"].y = world.map[creature.position["global"].x][creature.position["global"].y].doors[x].y;
                    end
                end
            end
        end
    end
end

local creatureConsume = function(creature, item)
    if item.liquidContainer then
        if #item.items > 0 then
            for k,v in pairs(creature.needs.current) do
                print(k,v)
                creature.needs.current[k] = creature.needs.current[k] + item.items[1].effect.needs.current[k];
            end
            table.remove(item.items, 1);
        end
    else
        for k,v in pairs(creature.needs.current) do
            creature.needs.current[k] = creature.needs.current[k] + item.effect.needs.current[k];
        end
    end
end

local function Creature(name)
    local self = {};
    
    self.name = name;
    self.health = 100;

    self.memory = {}
    self.forgotten = {}

    self.position = Position();
    
    self.needs = Needs();
    self.personality = Personality();
    self.skills = Skills();

    self.perks = {};
    
    self.passTurn = creaturePassTurn;
    self.checkNeeds = creatureCheckNeeds;
    self.move = creatureMove;
    self.consume = creatureConsume;
    
    self.items = {};

    return self;
end

return Creature;