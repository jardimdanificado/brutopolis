local Furniture = require("types.Furniture");

local furnitures = {};

furnitures.bed = function(position)
    local self = Furniture("bed", position);
    self.kind = "confort";
    self.effect.needs.current.happines = 1;
    self.effect.needs.current.social = -2;
    self.effect.needs.current.sanity = -1;
    self.effect.needs.current.hygiene = -5;
    self.effect.needs.current.sleep = 7;
    self.effect.needs.current.water = -1;
    self.effect.needs.current.food = -0.5;
    self.effect.needs.current.pee = 5;
    self.effect.needs.current.poo = 5;
    return self;
end

furnitures.bucket = function(position)
    local self = Furniture("bucket", position);

    self.maxStorage = 100;
    self.liquidContainer = true;
    return self;
end

return furnitures;