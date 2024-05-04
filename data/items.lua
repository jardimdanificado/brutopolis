local Item = require("types.Item");
local items = {};

items.water = function(position)
    local self = Item("water", "drink", position);
    self.liquid = true;
    self.creator = "god";
    self.effect.needs.current.hapiness = 1;
    self.effect.needs.current.sanity = 1;
    self.effect.needs.current.water = 10;
    self.effect.needs.current.pee = 10;
    return self;
end

items.poo = function(position,creator)
    local self = Item("poo", "poo", position);
    self.creator = creator or "unknown";
    self.effect.needs.current.hapiness = -10;
    self.effect.needs.current.sanity = -10;
    self.effect.needs.current.food = 10;
    self.effect.needs.current.water = -5;
    self.effect.needs.current.hygiene = -100;
    self.effect.personality.aggressiveness = 2.5;
    self.effect.personality.positivity = -5;
    self.effect.personality.humanity = -0.5;
    self.effect.personality.funny = -5;
    return self;
end

items.pee = function(position,creator)
    local self = Item("pee", "pee", position);
    self.liquid = true;
    self.creator = creator or "unknown";
    self.effect.needs.current.hapiness = -5;
    self.effect.needs.current.sanity = -10;
    self.effect.needs.current.hygiene = -50;
    self.effect.needs.current.water = 10;

    self.effect.personality.aggressiveness = 1.2;
    self.effect.personality.poisitivity = -2;
    self.effect.personality.humanity = -0.5;
    self.effect.personality.funny = -2.1;

    return self;
end

items.bottle = function(position,content)-- 2.5 liters
    local self = Item("bottle", "liquidContainer", position);
    self.liquidContainer = true;
    self.creator = "unknown";
    self.maxStorage = 25;-- 1 liquid unit = 100ml
    self.items = content or {};
    return self;
end

items.smallbox = function(position, content)
    local self = Item("smallbox", "container", position);
    self.creator = "unknown";
    self.maxStorage = 12;
    self.items = content or {};
    return self;
end

items.corn = function(position)
    local self = Item("corn", "food", position);
    self.creator = "god";
    self.effect.needs.current.hapiness = 0.5;
    self.effect.needs.current.sanity = 0.5;
    self.effect.needs.current.food = 10;
    self.effect.needs.current.water = -2;
    self.effect.personality.aggressiveness = -2;
    self.effect.personality.positivity = 0.01;
    self.effect.personality.humanity = 0.1;
    return self;
end

items.banana = function(position)
    local self = Item("banana", "food", position);
    self.creator = "god";
    self.effect.needs.current.hapiness = 0.5;
    self.effect.needs.current.sanity = 0.5;
    self.effect.needs.current.food = 8;
    self.effect.needs.current.water = -3;
    self.effect.personality.aggressiveness = -2;
    self.effect.personality.positivity = 0.1;
    self.effect.personality.humanity = 0.1;
    return self;
end

items.bread = function(position, creator)
    local self = Item("bread", "food", position);
    self.creator = creator or "god";
    self.effect.needs.current.hapiness = 1;
    self.effect.needs.current.sanity = 1;
    self.effect.needs.current.food = 15;
    self.effect.needs.current.water = -4.5;
    self.effect.personality.aggressiveness = -0.5;
    self.effect.personality.positivity = 0.1;
    self.effect.personality.humanity = 0.1;
    return self;
end

items.apple = function(position)
    local self = Item("apple", "food", position);
    self.creator = "god";
    self.effect.needs.current.hapiness = 0.5;
    self.effect.needs.current.sanity = 0.5;
    self.effect.needs.current.food = 5;
    self.effect.needs.current.water = -2;
    self.effect.personality.aggressiveness = -0.2;
    self.effect.personality.positivity = 0.1;
    self.effect.personality.humanity = 0.1;
    return self;
end

return items;