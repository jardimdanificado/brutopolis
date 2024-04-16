local Effect = require("types.Effect");

local Perk = function(name,description,effect)
    local self = {};
    self.name = name;
    self.description = description or "";
    self.effect = effect or Effect();
    return self;
end

return Perk;