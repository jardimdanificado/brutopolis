
local function Needs(defaultCurrent, defaultMax, defaultDecay)
    local self = {};
    self.current = 
    {
        food = defaultCurrent or 100,
        water = defaultCurrent or 100,
        sleep = defaultCurrent or 100,
        social = defaultCurrent or 100,
        hygiene = defaultCurrent or 100,
        pee = defaultCurrent or 0,
        poo = defaultCurrent or 0,
        happiness = defaultCurrent or 100,
        sanity = defaultCurrent or 100,
        health = defaultCurrent or 100
    };
    self.max = 
    {
        food = defaultMax or 100,
        water = defaultMax or 100,
        sleep = defaultMax or 100,
        social = defaultMax or 100,
        hygiene = defaultMax or 100,
        pee = defaultMax or 100,
        poo = defaultMax or 100,
        happiness = defaultMax or 100,
        sanity = defaultMax or 100,
        health = defaultMax or 100
    };
    self.decay = 
    {
        food = defaultDecay or -1,
        water = defaultDecay or -3,
        sleep = defaultDecay or -1,
        social = defaultDecay or -0.2,
        hygiene = defaultDecay or -2,
        pee = defaultDecay or 3,
        poo = defaultDecay or 0.5,
        happiness = defaultDecay or -0.5,
        sanity = defaultDecay or -0.5,
        health = defaultDecay or 0
    };
    return self;
end

return Needs;