local br = require("bruter.bruter")
local Needs = require("types.Needs");
local Skills = require("types.Skills");
local Personality = require("types.Personality");
local Interests = require("types.Interests");
local Knowledges = require("types.Knowledges");

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
    if creature.needs.current.hygiene < creature.needs.max.hygiene then
        if creature.needs.current.hygiene < (creature.needs.max.hygiene/10) then
            print(creature.name .. " is disgusting");
        elseif creature.needs.current.hygiene < (creature.needs.max.hygiene/2) then
            print(creature.name .. " is dirty");
        end
    elseif creature.needs.current.hygiene > creature.needs.max.hygiene then
        creature.needs.current.hygiene = creature.needs.max.hygiene;
    end

    if creature.needs.current.food < creature.needs.max.food then
        if creature.needs.current.food <= 0 then
            creature.health = creature.health - 10;
            print(creature.name .. " is starving to death");
        elseif creature.needs.current.food < (creature.needs.max.food/3) then
            print(creature.name .. " is starving");
        end
    elseif creature.needs.current.food > (creature.needs.max.food/2) then
        creature.health = creature.health - 5;
        print(creature.name .. " is to full");
    end

    if creature.needs.current.water < creature.needs.max.water then
        if creature.needs.current.water <= 0 then
            creature.health = creature.health - 15;
            print(creature.name .. " is dehydrating to death");
        elseif creature.needs.current.water < (creature.needs.max.water/2) then
            print(creature.name .. " is dehydrated");
        end
    elseif creature.needs.current.water > (creature.needs.max.water*1.5) then
        creature.health = creature.health - 10;
        print(creature.name .. " is drowning");
    end

    if creature.needs.current.sleep <= creature.needs.max.sleep then
        if creature.needs.current.sleep <= 0 then
            creature.health = creature.health - 5;
            print(creature.name .. " is dying from lack of sleep");
        elseif creature.needs.current.sleep < ((creature.needs.max.sleep/4)*3) then
            print(creature.name .. " is exhausted");
        end
    elseif creature.needs.current.sleep > creature.needs.max.sleep then
        creature.needs.current.sleep = creature.needs.max.sleep;
    end

    if creature.needs.current.pee >= creature.needs.max.pee then
        creature.needs.current.hygiene = creature.needs.current.hygiene - creature.needs.max.hygiene;
        
        creature.pee(creature, world);

        print(creature.name .. " has wet itself");
    elseif creature.needs.current.pee > (creature.needs.max.pee/4)*3 then
        print(creature.name .. " is bursting to pee");
    end

    if creature.needs.current.poo >= creature.needs.max.poo/2 then
        if creature.needs.current.poo >= creature.needs.max.poo then
            creature.needs.current.hygiene = creature.needs.current.hygiene - creature.needs.max.hygiene;
            creature.needs.current.poo = 0;
            local poo = Item("poo", "poo", br.utils.table.clone(creature.position));
            table.insert(world.map[creature.position["global"].x][creature.position["global"].y].items, poo);
            print(creature.name .. " has soiled itself");
        else
            print(creature.name .. " is bursting to poo");
        end
    end

    if creature.needs.current.happiness < creature.needs.current.happiness then
        if creature.needs.current.happiness <= 0 then
            creature.health = creature.health - 10;
            print(creature.name .. " is dying inside");
        elseif creature.needs.current.happiness < ((creature.needs.current.happiness/4)*3) then
            print(creature.name .. " is sad");
        end
    elseif creature.needs.current.happiness > creature.needs.max.happiness then
        creature.needs.current.happiness = creature.needs.max.happiness;
    end
end

local function creatureMove(creature, world, direction)
    local room = world.map[creature.position["global"].x][creature.position["global"].y];

    if room.map[creature.position["local"].x][creature.position["local"].y] == 48 then -- if creature is on a door
        for x = 1, #room.doors do
            if room.doors[x].x == creature.position["local"].x and room.doors[x].y == creature.position["local"].y then
                if room.doors[x].direction == "up" and direction == "up" then
                    creature.position["local"].x = room.doors[x].x;
                    creature.position["local"].y = room.doors[x].y+1;
                elseif room.doors[x].direction == "down" and direction == "down" then
                    creature.position["local"].x = room.doors[x].x;
                    creature.position["local"].y = room.doors[x].y-1;
                elseif room.doors[x].direction == "left" and direction == "left" then
                    creature.position["local"].x = room.doors[x].x+1;
                    creature.position["local"].y = room.doors[x].y;
                elseif room.doors[x].direction == "right" and direction == "right" then
                    creature.position["local"].x = room.doors[x].x-1;
                    creature.position["local"].y = room.doors[x].y;
                end
            end
        end
    end

    local reverseDirection = direction;

    if direction == "up" then
        direction = {x = 0, y = -1};
        reverseDirection = "down";
    elseif direction == "down" then
        direction = {x = 0, y = 1};
        reverseDirection = "up";
    elseif direction == "left" then
        direction = {x = -1, y = 0};
        reverseDirection = "right";
    elseif direction == "right" then
        direction = {x = 1, y = 0};
        reverseDirection = "left";
    end

    if room.map[creature.position["local"].x + direction.x][creature.position["local"].y + direction.y] == 32 then 
        creature.position["local"].x = creature.position["local"].x + direction.x;
        creature.position["local"].y = creature.position["local"].y + direction.y;
    elseif room.map[creature.position["local"].x + direction.x][creature.position["local"].y + direction.y] == 48 then
        if world.map[creature.position["global"].x + direction.x] and world.map[creature.position["global"].x + direction.x][creature.position["global"].y + direction.y] then -- if room exists
            local index = br.utils.table.find(world.map[creature.position["global"].x][creature.position["global"].y].creatures, creature);
            table.remove(world.map[creature.position["global"].x][creature.position["global"].y].creatures, index);
            creature.position["global"].x = creature.position["global"].x + direction.x;
            creature.position["global"].y = creature.position["global"].y + direction.y;
            creature.position["local"].x = 1;
            creature.position["local"].y = 1;
            table.insert(world.map[creature.position["global"].x][creature.position["global"].y].creatures, creature);
            for x = 1, #world.map[creature.position["global"].x][creature.position["global"].y].doors do
                if world.map[creature.position["global"].x][creature.position["global"].y].doors[x].direction == reverseDirection then
                    creature.position["local"].x = world.map[creature.position["global"].x][creature.position["global"].y].doors[x].x;
                    creature.position["local"].y = world.map[creature.position["global"].x][creature.position["global"].y].doors[x].y;
                end
            end
        end
    end


end

local creatureConsume = function(creature, itemid)
    local item = creature.items[itemid];
    if item.liquidContainer then
        if #item.items > 0 then
            item = table.remove(item.items, 1);
            
            for k,v in pairs(creature.needs.current) do
                creature.needs.current[k] = creature.needs.current[k] + item.effect.needs.current[k];
                creature.needs.max[k] = creature.needs.max[k] + item.effect.needs.max[k];
                creature.needs.decay[k] = creature.needs.decay[k] + item.effect.needs.decay[k];
            end

            for k,v in pairs(creature.personality) do
                creature.personality[k] = creature.personality[k] + item.effect.personality[k];
            end

            for k,v in pairs(creature.interests) do
                creature.interests[k] = creature.interests[k] + item.effect.interests[k];
            end

            for k,v in pairs(creature.skills) do
                creature.skills[k] = creature.skills[k] + item.effect.skills[k];
            end
        end
    else
        for k,v in pairs(creature.needs.current) do
            creature.needs.current[k] = creature.needs.current[k] + item.effect.needs.current[k];
            creature.needs.max[k] = creature.needs.max[k] + item.effect.needs.max[k];
            creature.needs.decay[k] = creature.needs.decay[k] + item.effect.needs.decay[k];
        end
        for k,v in pairs(creature.personality) do
            creature.personality[k] = creature.personality[k] + item.effect.personality[k];
        end
        for k,v in pairs(creature.interests) do
            creature.interests[k] = creature.interests[k] + item.effect.interests[k];
        end
        for k,v in pairs(creature.skills) do
            creature.skills[k] = creature.skills[k] + item.effect.skills[k];
        end
    end
end

local creaturePee = function(creature, world, inside, itemid)    
    if inside then
        if inside == "inside" and itemid and creature.items[itemid] then 
            if creature.items[itemid].liquidContainer then
                for x = 1, math.ceil(creature.needs.current.pee/10), 1 do
                    if #creature.items[itemid].items >= creature.items[itemid].maxStorage then
                        break;
                    end
                    local pee = Item("pee", "pee", creature.position);
                    table.insert(creature.items[itemid].items, pee);
                    creature.needs.current.pee = creature.needs.current.pee - 10;
                end
            else
                print("You can't pee on that");
            end
        else
            for x = 1, math.ceil(creature.needs.current.pee/10), 1 do
                local pee = Item("pee", "pee", br.utils.table.clone(creature.position));
                -- try to change te position of the pee to a adjacent tile
                local direction = {x = br.utils.random(-1, 1), y = br.utils.random(-1, 1)};
                if world.map[creature.position["global"].x] and world.map[creature.position["global"].x][creature.position["global"].y] then
                    if world.map[creature.position["global"].x][creature.position["global"].y].map[creature.position["local"].x + direction.x] and world.map[creature.position["global"].x][creature.position["global"].y].map[creature.position["local"].x + direction.x][creature.position["local"].y + direction.y] and world.map[creature.position["global"].x][creature.position["global"].y].map[creature.position["local"].x + direction.x][creature.position["local"].y + direction.y] ~= 35 then
                        pee.position = br.utils.table.clone(creature.position);
                        table.insert(world.map[creature.position["global"].x][creature.position["global"].y].items, pee);
                    end
                end
                table.insert(world.map[creature.position["global"].x][creature.position["global"].y].items, pee);
                creature.needs.current.pee = creature.needs.current.pee - 10;
            end
        end
    else
        for x = 1, math.ceil(creature.needs.current.pee/10), 1 do
            local pee = Item("pee", "pee", br.utils.table.clone(creature.position));
            -- try to change te position of the pee to a adjacent tile
            local direction = {x = br.utils.random(-1, 1), y = br.utils.random(-1, 1)};
            
            -- checks if the tile is not a wall
            if world.map[creature.position["global"].x][creature.position["global"].y].map[creature.position["local"].x + direction.x] 
            
            and world.map[creature.position["global"].x][creature.position["global"].y].map[creature.position["local"].x + direction.x][creature.position["local"].y + direction.y] 
            
            and world.map[creature.position["global"].x][creature.position["global"].y].map[creature.position["local"].x + direction.x][creature.position["local"].y + direction.y] ~= 35 then
                pee.position["local"].x = creature.position["local"].x + direction.x;
                pee.position["local"].y = creature.position["local"].y + direction.y;
                table.insert(world.map[creature.position["global"].x][creature.position["global"].y].items, pee);
            end

            table.insert(world.map[creature.position["global"].x][creature.position["global"].y].items, pee);
            creature.needs.current.pee = creature.needs.current.pee - 10;
        end
    end
    if creature.needs.current.pee < 0 then
        creature.needs.current.pee = 0;
    end
end

local creaturePoo = function(creature, world)    
    for x = 1, math.ceil(creature.needs.current.poo/20), 1 do
        local poo = Item("poo", "poo", br.utils.table.clone(creature.position));
        table.insert(world.map[creature.position["global"].x][creature.position["global"].y].items, poo);
        creature.needs.current.poo = creature.needs.current.poo - 20;
    end

    if creature.needs.current.poo < 0 then
        creature.needs.current.poo = 0;
    end
end

local function Creature(name)
    local self = {};
    
    self.name = name;
    self.health = 100;

    self.memory = {};

    self.position = Position();
    
    self.needs = Needs();
    self.personality = Personality();
    self.interests = Interests();
    self.skills = Skills();
    self.knowledges = Knowledges();
    
    self.passTurn = creaturePassTurn;
    self.checkNeeds = creatureCheckNeeds;
    self.move = creatureMove;
    self.consume = creatureConsume;
    self.pee = creaturePee;
    self.poo = creaturePoo;
    
    self.items = {};

    return self;
end

return Creature;