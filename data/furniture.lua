local Item = require("types.Item");

local furniture = {};

furniture.bed = function(position)
    local self = Item("bed", "furniture", position);
    self.effect.needs.current.hapiness = 5;
    self.effect.needs.current.social = 5;
    self.effect.needs.current.sanity = 5;
    self.effect.needs.current.hygiene = 5;
    self.effect.needs.current.sleep = 5;
    self.effect.needs.current.water = 5;
    self.effect.needs.current.food = 5;
    self.effect.needs.current.pee = 5;
    self.effect.needs.current.poo = 5;
    return self;
end