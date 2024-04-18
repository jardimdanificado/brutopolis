local Item = require("types.Item");
local items = {};

items.shit = function(position,creator)
    local self = Item("shit",position);
    self.creator = creator or "unknown";
    self.effect.needs.current.hapiness = -10;
    self.effect.needs.current.sanity = -10;
    self.effect.needs.current.food = 10;
    self.effect.needs.current.water = -5;
    self.effect.personality.aggressiveness = -2;
    self.effect.personality.positivity = -5;
    return self;
end

items.water = function(position)
    local self = Item("water", "drink",position);
    self.liquid = true;
    self.creator = "god";
    self.effect.needs.current.hapiness = 1;
    self.effect.needs.current.sanity = 1;
    self.effect.needs.current.water = 10;
    return self;
end

items.pee = function(position,creator)
    local self = Item("pee", "pee", position);
    self.liquid = true;
    self.creator = creator or "unknown";
    self.effect.needs.current.hapiness = -5;
    self.effect.needs.current.sanity = -10;
    self.effect.needs.current.water = 10;

    self.effect.personality.aggressiveness = 1;
    self.effect.personality.tolerant = 1;
    self.effect.personality.humorous = -5;

    return self;
end

items.bottle = function(position,content)
    local self = Item("bottle", "liquidContainer", position);
    self.liquidContainer = true;
    self.creator = "unknown";
    self.maxStorage = 5;
    self.items = content;
    return self;
end

return items;