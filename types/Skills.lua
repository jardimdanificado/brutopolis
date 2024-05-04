local function Skills(defaultValue)
    local self = {};

    self.think = defaultValue or 1;
    self.hear = defaultValue or 1;

    self.crafting = defaultValue or 1;
    self.cooking = defaultValue or 1;

    self.unarmed = defaultValue or 1;
    self.lockpick = defaultValue or 1;
    return self;
end

return Skills;