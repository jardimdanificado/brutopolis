local function Skills(defaultValue)
    local self = {};
    self.walk = defaultValue or 1;
    self.eat = defaultValue or 1;
    self.drink = defaultValue or 1;
    self.sleep = defaultValue or 1;
    self.talk = defaultValue or 1;
    self.think = defaultValue or 1;
    self.hear = defaultValue or 1;
    self.see = defaultValue or 1;
    self.smell = defaultValue or 1;
    self.taste = defaultValue or 1;

    self.unarmed = defaultValue or 1;
    self.lockpick = defaultValue or 1;
    return self;
end

return Skills;