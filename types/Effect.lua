local Skills = require("types.Skills");
local Needs = require("types.Needs");
local Personality = require("types.Personality");

local function Effect()
    local self = {};
    self.skills = Skills(0);
    self.needs = Needs(0);
    self.personality = Personality();
    return self;
end

return Effect;