local Item = require("types.Item");
local items = {};
items.shit = Item("shit")
items.shit.buff.needs.decay.hygiene = -10;

return items;