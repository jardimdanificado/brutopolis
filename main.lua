local br = require("bruter.bruter");
local config = require("data.config");

local function Needs(defaultCurrent, defaultMax, defaultDecay)
    local self = {};
    self.current = 
    {
        food = defaultCurrent or 100,
        water = defaultCurrent or 100,
        sleep = defaultCurrent or 100,
        social = defaultCurrent or 100,
        hygiene = defaultCurrent or 100,
        pee = defaultCurrent or 100,
        poo = defaultCurrent or 100
    };
    self.max = 
    {
        food = defaultMax or 100,
        water = defaultMax or 100,
        sleep = defaultMax or 100,
        social = defaultMax or 100,
        hygiene = defaultMax or 100,
        pee = defaultMax or 100,
        poo = defaultMax or 100
    };
    self.decay = 
    {
        food = defaultDecay or -1,
        water = defaultDecay or -3,
        sleep = defaultDecay or -1,
        social = defaultDecay or -0.2,
        hygiene = defaultDecay or -2,
        pee = defaultDecay or 3,
        poo = defaultDecay or 0.5
    };
    return self;
end

local function Body(defaultCurrent, defaultMax, defaultDecay)
    local self = {};
    self.current =
    {
        head = defaultCurrent or 100,
        torso = defaultCurrent or 100,
        leftArm = defaultCurrent or 100,
        rightArm = defaultCurrent or 100,
        leftLeg = defaultCurrent or 100,
        rightLeg = defaultCurrent or 100
    };
    self.max = 
    {
        head = defaultMax or 100,
        torso = defaultMax or 100,
        leftArm = defaultMax or 100,
        rightArm = defaultMax or 100,
        leftLeg = defaultMax or 100,
        rightLeg = defaultMax or 100
    };
    self.decay = 
    {
        head = defaultDecay or 0,
        torso = defaultDecay or 0,
        leftArm = defaultDecay or 0,
        rightArm = defaultDecay or 0,
        leftLeg = defaultDecay or 0,
        rightLeg = defaultDecay or 0
    };
    return self;
end

local function Skills()
    local self = {};
    self.unarmed = 1;
    self.lockpick = 1;
    return self;
end

local Modification = function(name, value, skills, needs, body)
    local self = {};
    self.name = name;
    self.value = value;
    self.skills = skills or Skills(0,0,0);
    self.needs = needs or Needs(0,0,0);
    self.body = body or Body(0,0,0);
    return self;
end

local function Item(name, amount, quality, condition, needs, body)
    local self = {};
    self.name = name;
    self.amount = amount or 1;
    self.quality = quality or 100;
    self.condition = condition or 100;
    self.needs = needs or Needs(0,0,0);
    self.body = body or Body(0,0,0);
    self.skills = Skills(0,0);
    self.items = {};
    self.mods = {};
    return self;
end

local items = 
{
    poo = Item("poo", 1, 100, 100, Needs(0,0,0), Body(0,0,0)),
    pee = Item("pee", 1, 100, 100, Needs(0,0,0), Body(0,0,0)),
};
items.poo.needs.decay.hygiene = -10;

local function Creature(name)
    local self = {};
    
    self.status = "alive";
    self.position = {x = 0, y = 0};
    self.room = {x = 1, y = 1};
    self.name = name;
    self.needs = Needs();
    self.body = Body();
    self.skills = Skills();
    self.items = {};
    return self;
end

local function addMod(creature, mod)
    table.insert(creature.mods, mod);
    creature.needs.max.food = creature.needs.max.food + mod.needs.max.food;
    creature.needs.max.water = creature.needs.max.water + mod.needs.max.water;
    creature.needs.max.sleep = creature.needs.max.sleep + mod.needs.max.sleep;
    creature.needs.max.social = creature.needs.max.social + mod.needs.max.social;
    creature.needs.max.hygiene = creature.needs.max.hygiene + mod.needs.max.hygiene;
    
    creature.body.max.head = creature.body.max.head + mod.body.max.head;
    creature.body.max.torso = creature.body.max.torso + mod.body.max.torso;
    creature.body.max.leftArm = creature.body.max.leftArm + mod.body.max.leftArm;
    creature.body.max.rightArm = creature.body.max.rightArm + mod.body.max.rightArm;
    creature.body.max.leftLeg = creature.body.max.leftLeg + mod.body.max.leftLeg;
    creature.body.max.rightLeg = creature.body.max.rightLeg + mod.body.max.rightLeg;

    creature.skills.unarmed = creature.skills.unarmed + mod.skills.unarmed;
    creature.skills.lockpick = creature.skills.lockpick + mod.skills.lockpick;

    creature.needs.decay.food = creature.needs.decay.food + mod.needs.decay.food;
    creature.needs.decay.water = creature.needs.decay.water + mod.needs.decay.water;
    creature.needs.decay.sleep = creature.needs.decay.sleep + mod.needs.decay.sleep;
    creature.needs.decay.social = creature.needs.decay.social + mod.needs.decay.social;
    creature.needs.decay.hygiene = creature.needs.decay.hygiene + mod.needs.decay.hygiene;
    creature.needs.decay.pee = creature.needs.decay.pee + mod.needs.decay.pee;
    creature.needs.decay.poo = creature.needs.decay.poo + mod.needs.decay.poo;
end

local function removeMod(creature, mod)
    for x = 1, #creature.mods do
        if creature.mods[x].name == mod.name then
            table.remove(creature.mods, x);
            creature.needs.max.food = creature.needs.max.food - mod.needs.max.food;
            creature.needs.max.water = creature.needs.max.water - mod.needs.max.water;
            creature.needs.max.sleep = creature.needs.max.sleep - mod.needs.max.sleep;
            creature.needs.max.social = creature.needs.max.social - mod.needs.max.social;
            creature.needs.max.hygiene = creature.needs.max.hygiene - mod.needs.max.hygiene;
            
            creature.body.max.head = creature.body.max.head - mod.body.max.head;
            creature.body.max.torso = creature.body.max.torso - mod.body.max.torso;
            creature.body.max.leftArm = creature.body.max.leftArm - mod.body.max.leftArm;
            creature.body.max.rightArm = creature.body.max.rightArm - mod.body.max.rightArm;
            creature.body.max.leftLeg = creature.body.max.leftLeg - mod.body.max.leftLeg;
            creature.body.max.rightLeg = creature.body.max.rightLeg - mod.body.max.rightLeg;

            creature.skills.unarmed = creature.skills.unarmed - mod.skills.unarmed;
            creature.skills.lockpick = creature.skills.lockpick - mod.skills.lockpick;

            creature.needs.decay.food = creature.needs.decay.food - mod.needs.decay.food;
            creature.needs.decay.water = creature.needs.decay.water - mod.needs.decay.water;
            creature.needs.decay.sleep = creature.needs.decay.sleep - mod.needs.decay.sleep;
            creature.needs.decay.social = creature.needs.decay.social - mod.needs.decay.social;
            creature.needs.decay.hygiene = creature.needs.decay.hygiene - mod.needs.decay.hygiene;
            creature.needs.decay.pee = creature.needs.decay.pee - mod.needs.decay.pee;
            creature.needs.decay.poo = creature.needs.decay.poo - mod.needs.decay.poo;
            return;
        end
    end
end

local function creaturePassTurn(creature)
    creature.needs.current.food = creature.needs.current.food + creature.needs.decay.food;
    creature.needs.current.water = creature.needs.current.water + creature.needs.decay.water;
    creature.needs.current.sleep = creature.needs.current.sleep + creature.needs.decay.sleep;
    creature.needs.current.social = creature.needs.current.social + creature.needs.decay.social;
    creature.needs.current.hygiene = creature.needs.current.hygiene + creature.needs.decay.hygiene;
    creature.needs.current.pee = creature.needs.current.pee + creature.needs.decay.pee;
    creature.needs.current.poo = creature.needs.current.poo + creature.needs.decay.poo;
end

local function creatureCheckNeeds(world, creature)
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

    if creature.needs.current.social <= 100 then
        if creature.needs.current.social <= 0 then
            creature.status = "dead";
            print(creature.name .. " has died of loneliness");
            return;
        else
            print(creature.name .. " is feeling lonely");
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

local function checkPlayer()
    --creatureCheckNeeds(br.player);
    if br.player.status == "dead" then
        print("Game Over");
        os.exit();
    end
end

local function createWalls(room)
    for x = 1, #room do
        for y = 1, #room[1] do
            if x == 1 or x == #room or y == 1 or y == #room[1] then
                room[x][y] = 35;--"#";
            end
        end
    end
    return room;
end

local Door = function()
    local self = {};
    self.x = 0;
    self.y = 0;
    self.direction = "left";
    self.closed = true;
    self.locked = false;
    self.lockLevel = 0;
    return self;
end

local generateDoors = function(room) -- one door at each wall
    local doors = {};
    table.insert(doors, {x = 1, y = br.utils.random(2, #room[1] - 1), direction = "left", closed = false, locked = false});
    table.insert(doors, {x = #room, y = br.utils.random(2, #room[1] - 1), direction = "right"});
    table.insert(doors, {x = br.utils.random(2, #room - 1), y = 1, direction = "up"});
    table.insert(doors, {x = br.utils.random(2, #room - 1), y = #room[1], direction = "down"});
    for x = 1, #doors do
        room[doors[x].x][doors[x].y] = 48;
    end
    return doors;
end

local function Room(minSize, maxSize)
    local self = {};
    self.size = 
    {
        x = br.utils.random(minSize.x, maxSize.x),
        y = br.utils.random(minSize.y, maxSize.y)
    };
    self.map = createWalls(br.utils.matrix.new(self.size.x, self.size.y, 32));
    self.doors = generateDoors(self.map);
    self.items = {};
    return self;
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

local function move(creatureName, direction)
    local creature = nil;

    for x = 1, #world.creatures do
        if world.creatures[x].name == creatureName then
            creature = world.creatures[x];
        end
    end
    if creature == nil then
        print("Creature not found");
        return;
    end

    local room = world.map[creature.room.x][creature.room.y];

    local x = creature.position.x;
    local y = creature.position.y;

    if direction == "up" then
        if room.map[x][y - 1] == 32 then
            creature.position.y = y - 1;
        end
    elseif direction == "down" then
        if room.map[x][y + 1] == 32 then
            creature.position.y = y + 1;
        end
    elseif direction == "left" then
        if room.map[x - 1][y] == 32 then
            creature.position.x = x - 1;
        end
    elseif direction == "right" then
        if room.map[x + 1][y] == 32 then
            creature.position.x = x + 1;
        end
    end

    printRoom(world,creature.room.x,creature.room.y);
    for x = 1, #world.creatures do
        creaturePassTurn(world.creatures[x]);
        creatureCheckNeeds(world, world.creatures[x]);
    end
    checkPlayer();
end

br.world = world;
br.player = player;

br.move = move;

br.repl();

--br.help(world.map[1][1].map);
