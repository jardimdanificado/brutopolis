local Item = require("types.Item");

--furniture kinds:
--default
--wall
--confort

local function Furniture(name, position)
    local self = Item(name, "furniture", position);

    self.liquidContainer = false;
    self.maxStorage = 0;
    self.kind = "default"
    
    return self;
end

return Furniture;