local Needs = require("types.Needs");
local Skills = require("types.Skills");
local Personality = require("types.Personality");

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
            creature.status = "dead";
            print(creature.name .. " has starved to death");
            return;
        elseif creature.needs.current.food < 75 then
            print(creature.name .. " is starving");
        end
    end

    if creature.needs.current.water < 100 then
        if creature.needs.current.water <= 0 then
            creature.status = "dead";
            print(creature.name .. " has died from dehydration");
            return;
        elseif creature.needs.current.water < 75 then
            print(creature.name .. " is dehydrated");
        end
    end

    if creature.needs.current.sleep <= 100 then
        if creature.needs.current.sleep <= 0 then
            creature.status = "dead";
            print(creature.name .. " has died from lack of sleep");
            return;
        elseif creature.needs.current.sleep < 75 then
            print(creature.name .. " is exhausted");
        end
    end

    if creature.needs.current.pee >= 50 then
        if creature.needs.current.pee >= 100 then
            creature.needs.current.hygiene = creature.needs.current.hygiene - 100;
            creature.needs.current.pee = 0;
            print(creature.name .. " has wet itself");
        elseif creature.needs.current.water < 75 then
            print(creature.name .. " is bursting to pee");
        end
    end

    if creature.needs.current.poo >= 50 then
        if creature.needs.current.poo >= 100 then
            creature.needs.current.hygiene = creature.needs.current.hygiene - 100;
            creature.needs.current.poo = 0;
            table.insert(world.map[creature.room.x][creature.room.y].items, Item("poo"));
            print(creature.name .. " has soiled itself");
        else
            print(creature.name .. " is bursting to poo");
        end
    end

    if creature.needs.current.happiness < 100 then
        if creature.needs.current.happiness <= 0 then
            creature.status = "dead";
            print(creature.name .. " has died from sadness");
            return;
        elseif creature.needs.current.happiness < 75 then
            print(creature.name .. " is sad");
        end
    end
end

local function creatureMove(creature, world, direction)
    local room = world.map[creature.room.x][creature.room.y];
    if direction == "up" then
        if room.map[creature.position.x][creature.position.y - 1] == 32 then
            creature.position.y = creature.position.y - 1;
        elseif room.map[creature.position.x][creature.position.y - 1] == 48 then
            if world.map[creature.room.x][creature.room.y - 1] then -- if room exists
                creature.room.y = creature.room.y - 1;
                creature.position.y = #world.map[creature.room.x][creature.room.y][1];
                --find door in new room using the door list
                for x = 1, #world.map[creature.room.x][creature.room.y].doors do
                    if world.map[creature.room.x][creature.room.y].doors[x].direction == "down" then
                        creature.position.x = world.map[creature.room.x][creature.room.y].doors[x].x;
                        creature.position.y = world.map[creature.room.x][creature.room.y].doors[x].y;
                    end
                end
            end
        
        end
    elseif direction == "down" then
        if room.map[creature.position.x][creature.position.y + 1] == 32 then
            creature.position.y = creature.position.y + 1;
        elseif room.map[creature.position.x][creature.position.y + 1] == 48 then
            if world.map[creature.room.x][creature.room.y + 1] then -- if room exists
                creature.room.y = creature.room.y + 1;
                creature.position.y = 1;
                --find door in new room using the door list
                for x = 1, #world.map[creature.room.x][creature.room.y].doors do
                    if world.map[creature.room.x][creature.room.y].doors[x].direction == "up" then
                        creature.position.x = world.map[creature.room.x][creature.room.y].doors[x].x;
                        creature.position.y = world.map[creature.room.x][creature.room.y].doors[x].y;
                    end
                end
            end
        end
    elseif direction == "left" then
        if room.map[creature.position.x - 1][creature.position.y] == 32 then
            creature.position.x = creature.position.x - 1;
        elseif room.map[creature.position.x - 1][creature.position.y] == 48 then
            if world.map[creature.room.x - 1][creature.room.y] then -- if room exists
                creature.room.x = creature.room.x - 1;
                creature.position.x = #world.map[creature.room.x][creature.room.y];
                for x = 1, #world.map[creature.room.x][creature.room.y].doors do
                    if world.map[creature.room.x][creature.room.y].doors[x].direction == "right" then
                        creature.position.x = world.map[creature.room.x][creature.room.y].doors[x].x;
                        creature.position.y = world.map[creature.room.x][creature.room.y].doors[x].y;
                    end
                end
            end
        end
    elseif direction == "right" then
        if room.map[creature.position.x + 1][creature.position.y] == 32 then
            creature.position.x = creature.position.x + 1;
        elseif room.map[creature.position.x + 1][creature.position.y] == 48 then
            if world.map[creature.room.x + 1][creature.room.y] then -- if room exists
                creature.room.x = creature.room.x + 1;
                creature.position.x = 1;
                for x = 1, #world.map[creature.room.x][creature.room.y].doors do
                    if world.map[creature.room.x][creature.room.y].doors[x].direction == "left" then
                        creature.position.x = world.map[creature.room.x][creature.room.y].doors[x].x;
                        creature.position.y = world.map[creature.room.x][creature.room.y].doors[x].y;
                    end
                end
            end
        end
    end
end

local function Creature(name)
    local self = {};
    
    self.name = name;
    self.health = 100;

    self.memory = {}
    self.forgotten = {}

    self.position = {x = 1, y = 1};
    self.room = {x = 1, y = 1};
    
    self.needs = Needs();
    self.personality = Personality();
    self.skills = Skills();
    
    self.experience = Skills(0);
    
    self.perks = {};
    
    self.passTurn = creaturePassTurn;
    self.checkNeeds = creatureCheckNeeds;
    self.move = creatureMove;
    
    self.items = {};

    return self;
end

return Creature;