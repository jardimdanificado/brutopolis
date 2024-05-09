local Event = function(actor, victim, action, duration, effect, callback)
    local self = {};
    self.actor = actor;
    self.victim = victim;
    self.action = action;
    self.duration = duration;
    self.callback = callback or function() end;
    self.effect = effect;
    return self;
end

return Event;