local Effect = require("types.Effect");

local function Item(name, _type, position)
    local self = {};
    self.name = name;
    self.type = _type;
    self.creator = "unknown";
    self.owner = "unknown";
    
    self.position = {global = position.global or {x = 1, y = 1}, ["local"] = position["local"] or {x = 1, y = 1}}
        
    self.effect = Effect();
    
    self.liquidContainer = false;
    self.liquid = false;
    
    self.maxStorage = 0;
    self.items = {};
        
    return self;
end

return Item;