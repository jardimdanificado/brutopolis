local br = require("bruter.bruter")
local Needs = require("types.Needs");
local Skills = require("types.Skills");
local Personality = require("types.Personality");
local Interests = require("types.Interests");
local Opinions = require("types.Opinions");

local Position = require("types.Position");

local Item = require("types.Item");

local items = require("data.items");

local function creaturePassTurn(creature)
    creature.needs.current.food = creature.needs.current.food + creature.needs.decay.food;
    creature.needs.current.water = creature.needs.current.water + creature.needs.decay.water;
    creature.needs.current.sleep = creature.needs.current.sleep + creature.needs.decay.sleep;
    creature.needs.current.social = creature.needs.current.social + creature.needs.decay.social;
    creature.needs.current.hygiene = creature.needs.current.hygiene + creature.needs.decay.hygiene;
    creature.needs.current.pee = creature.needs.current.pee + creature.needs.decay.pee;
    creature.needs.current.poo = creature.needs.current.poo + creature.needs.decay.poo;
    creature.needs.current.happiness = creature.needs.current.happiness + creature.needs.decay.happiness;
    creature.needs.current.sanity = creature.needs.current.sanity + creature.needs.decay.sanity;
    creature.needs.current.health = creature.needs.current.health + creature.needs.decay.health;
end

local function creatureCheckNeeds(creature, world)
    if creature.needs.current.hygiene < creature.needs.max.hygiene then
        if creature.needs.current.hygiene < (creature.needs.max.hygiene/10) then
            print(creature.name .. " is disgusting(hygiene: " .. creature.needs.current.hygiene .. ")");
        elseif creature.needs.current.hygiene < (creature.needs.max.hygiene/2) then
            print(creature.name .. " is dirty(hygiene: " .. creature.needs.current.hygiene .. ")");
        end
    elseif creature.needs.current.hygiene > creature.needs.max.hygiene then
        creature.needs.current.hygiene = creature.needs.max.hygiene;
    end

    if creature.needs.current.food < creature.needs.max.food then
        if creature.needs.current.food <= 0 then
            creature.needs.current.health = creature.needs.current.health - 10;
            print(creature.name .. " is starving to death(food: " .. creature.needs.current.food .. ")");
        elseif creature.needs.current.food < (creature.needs.max.food/3) then
            print(creature.name .. " is starving(food: " .. creature.needs.current.food .. ")");
        end
    elseif creature.needs.current.food > (creature.needs.max.food/2) then
        creature.needs.current.health = creature.needs.current.health - 5;
        print(creature.name .. " is too full(food: " .. creature.needs.current.food .. ")");
    end

    if creature.needs.current.water < creature.needs.max.water then
        if creature.needs.current.water <= 0 then
            creature.needs.current.health = creature.needs.current.health - 15;
            print(creature.name .. " is dehydrating to death(water: " .. creature.needs.current.water .. ")");
        elseif creature.needs.current.water < (creature.needs.max.water/2) then
            print(creature.name .. " is dehydrated(water: " .. creature.needs.current.water .. ")");
        end
    elseif creature.needs.current.water > (creature.needs.max.water*1.5) then
        creature.needs.current.health = creature.needs.current.health - 10;
        print(creature.name .. " is drowning(water: " .. creature.needs.current.water .. ")");
    end

    if creature.needs.current.sleep <= creature.needs.max.sleep then
        if creature.needs.current.sleep <= 0 then
            creature.needs.current.health = creature.needs.current.health - 5;
            print(creature.name .. " is dying from lack of sleep(sleep: " .. creature.needs.current.sleep .. ")");
        elseif creature.needs.current.sleep < ((creature.needs.max.sleep/4)*3) then
            print(creature.name .. " is exhausted(sleep: " .. creature.needs.current.sleep .. ")");
        end
    elseif creature.needs.current.sleep > creature.needs.max.sleep then
        creature.needs.current.sleep = creature.needs.max.sleep;
    end

    if creature.needs.current.pee >= creature.needs.max.pee then
        creature.needs.current.hygiene = creature.needs.current.hygiene - creature.needs.max.hygiene;
        
        creature.actions.pee(creature, world);

        print(creature.name .. " has wet itself");
    elseif creature.needs.current.pee > (creature.needs.max.pee/4)*3 then
        print(creature.name .. " is bursting to pee(pee: " .. creature.needs.current.pee .. ")");
    end

    if creature.needs.current.poo >= creature.needs.max.poo/2 then
        if creature.needs.current.poo >= creature.needs.max.poo then
            creature.needs.current.hygiene = creature.needs.current.hygiene - creature.needs.max.hygiene;
            creature.needs.current.poo = 0;
            creature.actions.poo(creature, world);
            print(creature.name .. " has soiled itself");
        else
            print(creature.name .. " is bursting to poo(poo: " .. creature.needs.current.poo .. ")");
        end
    end

    if creature.needs.current.happiness < creature.needs.current.happiness then
        if creature.needs.current.happiness <= 0 then
            creature.needs.current.health = creature.needs.current.health - 10;
            print(creature.name .. " is dying inside(happiness: " .. creature.needs.current.happiness .. ")");
        elseif creature.needs.current.happiness < ((creature.needs.current.happiness/4)*3) then
            print(creature.name .. " is sad(happiness: " .. creature.needs.current.happiness .. ")");
        end
    elseif creature.needs.current.happiness > creature.needs.max.happiness then
        creature.needs.current.happiness = creature.needs.max.happiness;
    end

    if creature.needs.current.sanity < creature.needs.max.sanity then
        if creature.needs.current.sanity <= 0 then
            creature.needs.current.health = creature.needs.current.health - 10;
            print(creature.name .. " is going insane(sanity: " .. creature.needs.current.sanity .. ")");
        elseif creature.needs.current.sanity < ((creature.needs.current.sanity/4)*3) then
            print(creature.name .. " is losing it(sanity: " .. creature.needs.current.sanity .. ")");
        end
    elseif creature.needs.current.sanity > creature.needs.max.sanity then
        creature.needs.current.sanity = creature.needs.max.sanity;
    end

    if creature.needs.current.health <= creature.needs.max.health then
        if creature.needs.current.health <= 0 then
            print(creature.name .. " has died");
            return;
        elseif creature.needs.current.health < (creature.needs.max.health/10) then 
            print(creature.name .. " is mortally wounded(health: " .. creature.needs.current.health .. ")");
        elseif creature.needs.current.health < ((creature.needs.max.health/4)*3) then
            print(creature.name .. " is dying(health: " .. creature.needs.current.health .. ")");
        elseif creature.needs.current.health < ((creature.needs.max.health/4)*2) then
            print(creature.name .. " is hurt(health: " .. creature.needs.current.health .. ")");
        elseif creature.needs.current.health < ((creature.needs.max.health/4)) then
            print(creature.name .. " is injured(health: " .. creature.needs.current.health .. ")");
        end
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

    if room.map[creature.position["local"].x + direction.x][creature.position["local"].y + direction.y] == 48 then
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
    elseif room.map[creature.position["local"].x + direction.x][creature.position["local"].y + direction.y] ~= 35 then 
        if br.utils.roleta(1, 1, 1, 1, 1, 1, 2) == 2 then
            for k,v in pairs(room.items) do
                if v.position["local"].x == creature.position["local"].x + direction.x and v.position["local"].y == creature.position["local"].y + direction.y then
                    room.items[k].position["local"].x = creature.position["local"].x;
                    room.items[k].position["local"].y = creature.position["local"].y;
                end
            end
        end
        creature.position["local"].x = creature.position["local"].x + direction.x;
        creature.position["local"].y = creature.position["local"].y + direction.y;
    end
end

local creatureConsume = function(creature, world, itemid)
    local item = creature.items[itemid];
    if item.liquidContainer then
        if #item.items > 0 then
            local _item = table.remove(item.items, 1);
            
            print(creature.name .. " is consuming 100ml of " .. _item.name .. " from " .. item.name);

            for k,v in pairs(creature.needs.current) do
                creature.needs.current[k] = creature.needs.current[k] + _item.effect.needs.current[k];
                if _item.effect.needs.current[k] ~= 0 then
                    print(creature.name .. " " .. k ..  " changed by " .. _item.effect.needs.current[k] .. " to " .. creature.needs.current[k]);
                end
                creature.needs.max[k] = creature.needs.max[k] + _item.effect.needs.max[k];
                if _item.effect.needs.max[k] ~= 0 then
                    print(creature.name .. " " .. k ..  " changed by " .. _item.effect.needs.max[k] .. " to " .. creature.needs.max[k]);
                end
                creature.needs.decay[k] = creature.needs.decay[k] + _item.effect.needs.decay[k];
                if _item.effect.needs.decay[k] ~= 0 then
                    print(creature.name .. " " .. k ..  " changed by " .. _item.effect.needs.decay[k] .. " to " .. creature.needs.decay[k]);
                end
            end

            for k,v in pairs(creature.personality) do
                creature.personality[k] = creature.personality[k] + _item.effect.personality[k];
                if _item.effect.personality[k] ~= 0 then
                    print(creature.name .. " " .. k ..  " changed by " .. _item.effect.personality[k] .. " to " .. creature.personality[k]);
                end
            end

            for k,v in pairs(creature.interests) do
                creature.interests[k] = creature.interests[k] + _item.effect.interests[k];
                if _item.effect.interests[k] ~= 0 then
                    print(creature.name .. " " .. k ..  " changed by " .. _item.effect.interests[k] .. " to " .. creature.interests[k]);
                end
            end

            for k,v in pairs(creature.skills) do
                creature.skills[k] = creature.skills[k] + _item.effect.skills[k];
                if _item.effect.skills[k] ~= 0 then
                    print(creature.name .. " " .. k ..  " changed by " .. _item.effect.skills[k] .. " to " .. creature.skills[k]);
                end
            end

            print (creature.name .. "'s " .. item.name .. " has " .. #item.items*100 .. "ml left");
        end
    else
        for k,v in pairs(creature.needs.current) do
            creature.needs.current[k] = creature.needs.current[k] + item.effect.needs.current[k];
            if item.effect.needs.current[k] ~= 0 then
                print(creature.name .. " " .. k ..  " changed by " .. item.effect.needs.current[k] .. " to " .. creature.needs.current[k]);
            end
            creature.needs.max[k] = creature.needs.max[k] + item.effect.needs.max[k];
            if item.effect.needs.max[k] ~= 0 then
                print(creature.name .. " " .. k ..  " changed by " .. item.effect.needs.max[k] .. " to " .. creature.needs.max[k]);
            end
            creature.needs.decay[k] = creature.needs.decay[k] + item.effect.needs.decay[k];
            if item.effect.needs.decay[k] ~= 0 then
                print(creature.name .. " " .. k ..  " changed by " .. item.effect.needs.decay[k] .. " to " .. creature.needs.decay[k]);
            end
        end
        for k,v in pairs(creature.personality) do
            creature.personality[k] = creature.personality[k] + item.effect.personality[k];
            if item.effect.personality[k] ~= 0 then
                print(creature.name .. " " .. k ..  " changed by " .. item.effect.personality[k] .. " to " .. creature.personality[k]);
            end
        end
        for k,v in pairs(creature.interests) do
            creature.interests[k] = creature.interests[k] + item.effect.interests[k];
            if item.effect.interests[k] ~= 0 then
                print(creature.name .. " " .. k ..  " changed by " .. item.effect.interests[k] .. " to " .. creature.interests[k]);
            end
        end
        for k,v in pairs(creature.skills) do
            creature.skills[k] = creature.skills[k] + item.effect.skills[k];
            if item.effect.skills[k] ~= 0 then
                print(creature.name .. " " .. k ..  " changed by " .. item.effect.skills[k] .. " to " .. creature.skills[k]);
            end
        end
    end
end

local creaturePee = function(creature, world, inside, itemid)    
    if inside then
        if inside == "inside" and itemid and creature.items[itemid] and creature.items[itemid].liquidContainer then 
            local maxamount = math.ceil(creature.needs.current.pee/10)
            local amount = 0;
            for x = 1, maxamount, 1 do
                if #creature.items[itemid].items >= creature.items[itemid].maxStorage then
                    break;
                end
                local pee = items.pee(creature.position, creature.name);
                table.insert(creature.items[itemid].items, 1, pee);
                creature.needs.current.pee = creature.needs.current.pee - 10;
                amount = amount + 1;
            end
            print (creature.name .. " peed " .. amount*100 .. "ml in " .. creature.items[itemid].name);
        else
            print(creature.name .. " can't pee on that");
        end
    else
        for k,v in pairs(world.map[creature.position["global"].x][creature.position["global"].y].furniture) do
            if v.position["local"].x == creature.position["local"].x and v.position["local"].y == creature.position["local"].y then
                if v.liquidContainer then
                    local maxamount = math.ceil(creature.needs.current.pee/10)
                    local amount = 0;
                    for x = 1, maxamount, 1 do
                        if #v.items >= v.maxStorage then
                            break;
                        end
                        local pee = items.pee(creature.position, creature.name);
                        table.insert(v.items, 1, pee);
                        creature.needs.current.pee = creature.needs.current.pee - 10;
                        amount = amount + 1;
                    end
                    print (creature.name .. " peed " .. amount*100 .. "ml in " .. v.name);
                    goto skip;
                end
            end
        end
        for x = 1, math.ceil(creature.needs.current.pee/10), 1 do
            local pee = items.pee(br.utils.table.clone(creature.position), creature.name);
            -- try to change te position of the pee to a adjacent tile
            local direction = {x = br.utils.random(-1, 1), y = br.utils.random(-1, 1)};
            
            -- checks if the tile is not a wall
            if world.map[creature.position["global"].x][creature.position["global"].y].map[creature.position["local"].x + direction.x] 
            
            and world.map[creature.position["global"].x][creature.position["global"].y].map[creature.position["local"].x + direction.x][creature.position["local"].y + direction.y] 
            
            and world.map[creature.position["global"].x][creature.position["global"].y].map[creature.position["local"].x + direction.x][creature.position["local"].y + direction.y] ~= 35 then
                pee.position["local"].x = creature.position["local"].x + direction.x;
                pee.position["local"].y = creature.position["local"].y + direction.y;
            end

            table.insert(world.map[creature.position["global"].x][creature.position["global"].y].items, pee);
            creature.needs.current.pee = creature.needs.current.pee - 10;
        end
    end
    ::skip::
    if creature.needs.current.pee < 0 then
        creature.needs.current.pee = 0;
    end
end

local creaturePoo = function(creature, world)    
    for x = 1, math.ceil(creature.needs.current.poo/20), 1 do
        local poo = items.poo(br.utils.table.clone(creature.position), creature.name);
        table.insert(world.map[creature.position["global"].x][creature.position["global"].y].items, poo);
        creature.needs.current.poo = creature.needs.current.poo - 20;
    end

    if creature.needs.current.poo < 0 then
        creature.needs.current.poo = 0;
    end
end

local creatureSleep = function(creature, world)
    for k,v in pairs(world.map[creature.position["global"].x][creature.position["global"].y].furniture) do
        if v.position["local"].x == creature.position["local"].x and v.position["local"].y == creature.position["local"].y then
            if v.kind == "confort" then
                creature.needs.current.sleep = creature.needs.current.sleep + 10;
            end
        end
    end
    creature.needs.current.sleep = creature.needs.current.sleep + 10;
end

local creatureDrop = function(creature, world, itemid)
    local item;
    if creature.items[itemid] then
        item = table.remove(creature.items, itemid);
        item.position["global"] = br.utils.table.clone(creature.position["global"]);
        item.position["local"] = br.utils.table.clone(creature.position["local"]);
        table.insert(world.map[creature.position["global"].x][creature.position["global"].y].items, item);
        print(creature.name .. " dropped " .. item.name);
    end
end

local creaturePick = function(creature, world, direction)
    local room = world.map[creature.position["global"].x][creature.position["global"].y];

    if direction == "up" then
        direction = {x = 0, y = -1};
    elseif direction == "down" then
        direction = {x = 0, y = 1};
    elseif direction == "left" then
        direction = {x = -1, y = 0};
    elseif direction == "right" then
        direction = {x = 1, y = 0};
    else
        direction = {x = 0, y = 0};
    end

    for k,v in pairs(room.items) do
        if v.position["local"].x == creature.position["local"].x + direction.x and v.position["local"].y == creature.position["local"].y + direction.y then
            local item = table.remove(room.items, k);
            item.position = creature.position;
            table.insert(creature.items, v);
            print(creature.name .. " picked " .. item.name);
            break;
        end
    end
end

local function Creature(name)
    local self = {};
    
    self.name = name;

    self.planned = {};

    self.act = function(world)
        if #self.planned > 0 then
            local action = table.remove(self.planned, 1);
            self.actions[action.action](self, world, br.utils.table.unpack(action.args));
        end
    end

    self.actions = 
    {
        move = creatureMove,
        consume = creatureConsume,
        pee = creaturePee,
        poo = creaturePoo,
        sleep = creatureSleep,
        drop = creatureDrop,
        pick = creaturePick
    };

    self.plan = function(action, args, index)
        if index then
            table.insert(self.planned, index, {action = action, args = args});
        else
            table.insert(self.planned, {action = action, args = args});
        end
    end

    self.memory = {};

    self.position = Position();
    
    self.needs = Needs();
    self.personality = Personality();
    self.interests = Interests();
    self.skills = Skills();
    self.opinions = Opinions();
    
    self.passTurn = creaturePassTurn;
    self.checkNeeds = creatureCheckNeeds;
    
    self.items = {};

    return self;
end

return Creature;