local Memory = function(actor, victim, action, what, when, where, effect, fact)
    local self = {};
    self.actor = actor;
    self.victim = victim;
    self.action = action;
    self.what = what;
    self.when = when;
    self.where = where;
    self.effect = effect;
    self.fact = fact or true;
    return self;
end

return Memory;