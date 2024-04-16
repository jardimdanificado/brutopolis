local Needs = require("types.Needs");
local Skills = require("types.Skills");
local Personality = require("types.Personality")

local function Item(name, needs, skills)
    local self = {};
    self.name = name;
    self.health = 0;
    self.effect = 
    {
        needs = Needs(0,0,0),
        skills = Skills(0),
        personality = Personality()
    }

    self.consumed = 
    {
        needs = Needs(0,0,0),
        skills = Skills(0),
        personality = Personality()
    }
    
    self.items = {};
    
    return self;
end

return Item;