local br = require("bruter.bruter");
local config = require("data.config");

local function Creature(name)
    local self = {};
    
    self.position = {x = 0, y = 0};
    self.room = {x = 1, y = 1};
    self.name = name;
    self.needs = 
    {
        current = 
        {
            food = 0,
            water = 0,
            sleep = 0,
            social = 0,
            hygiene = 0,
            pee = 0,
            poo = 0
        },
        max = 
        {
            food = 100,
            water = 100,
            sleep = 100,
            social = 100,
            hygiene = 100,
            pee = 100,
            poo = 100
        }
    };
    self.body = 
    {
        current =
        {
            head = 0,
            torso = 0,
            leftArm = 0,
            rightArm = 0,
            leftLeg = 0,
            rightLeg = 0
        },
        max = 
        {
            head = 100,
            torso = 100,
            leftArm = 100,
            rightArm = 100,
            leftLeg = 100,
            rightLeg = 100
        }
    };
    self.skills = 
    {
        combat = 0,
        crafting = 0,
    };
    self.inventory = {};
    self.mods = {};
    return self;
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
end

br.world = world;
br.player = player;

br.move = move;

br.repl();

--br.help(world.map[1][1].map);
