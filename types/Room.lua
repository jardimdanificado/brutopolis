local br = require "bruter.bruter";

local generateDoors = function(room) -- one door at each wall
    local doors = {};
    table.insert(doors, {x = 1, y = br.utils.random(2, #room[1] - 1), direction = "left"});
    table.insert(doors, {x = #room, y = br.utils.random(2, #room[1] - 1), direction = "right"});
    table.insert(doors, {x = br.utils.random(2, #room - 1), y = 1, direction = "up"});
    table.insert(doors, {x = br.utils.random(2, #room - 1), y = #room[1], direction = "down"});
    for x = 1, #doors do
        room[doors[x].x][doors[x].y] = 48;--"0";
    end
    return doors;
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

local function Room(minSize, maxSize)
    local self = {};
    self.size = 
    {
        x = br.utils.random(minSize.x, maxSize.x),
        y = br.utils.random(minSize.y, maxSize.y)
    };
    self.map = createWalls(br.utils.matrix.new(self.size.x, self.size.y, 32));
    self.doors = generateDoors(self.map);
    self.creatures = {};
    self.items = {};
    self.furniture = {};
    return self;
end

return Room;