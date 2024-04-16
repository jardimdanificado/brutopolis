local Position = function()
    local self = {};
    self["local"] = {x = 1, y = 1};
    self.global = {x = 1, y = 1};
    return self;
end

return Position;