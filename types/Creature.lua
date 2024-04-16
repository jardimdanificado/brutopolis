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
end

local function creatureMove(creature, direction)
    if direction == "up" then
        creature.position.y = creature.position.y - 1;
    elseif direction == "down" then
        creature.position.y = creature.position.y + 1;
    elseif direction == "left" then
        creature.position.x = creature.position.x - 1;
    elseif direction == "right" then
        creature.position.x = creature.position.x + 1;
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
    
    self.items = {};

    return self;
end

return Creature;