local Needs = require("types.Needs");
local Skills = require("types.Skills");
local Personality = require("types.Personality")
local Effect = require("types.Effect")

-- types:
-- solid 
-- liquid
-- pasty

local function Item(name, position, room)
    local self = {};

    self.type = "solid";
    self.position = position or {x = 1, y = 1};
    self.room = room or {x = 1, y = 1};

    self.name = name;
    
    self.creator = "unknown";
    self.owner = "unknown";

    self.health = 100;

    self.effect = Effect();

    self.consumed = Effect();
    
    self.items = {};
    
    return self;
end

return Item;