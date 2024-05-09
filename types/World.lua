local Room = require("types.Room");
local Creature = require("types.Creature");

local items = require("data.items");

local function createMap(config)
    local map = {};
    for x = 1, config.mapSize.x do
        map[x] = {};
        for y = 1, config.mapSize.y do
            map[x][y] = Room(config.minRoomSize, config.maxRoomSize);
            map[x][y].position = {x = x, y = y};
        end
    end
    return map;
end

local function checkPlayer(player)
    if player.needs.current.health <= 0 then
        print("Game Over");
        os.exit();
    end
end


local function World(config, br)
    br = br or require("bruter.bruter");
    local world = {};
    world.creatures = {};
    world.map = createMap(config);

    world.updatefluids = function()
        for x = 1, #world.map do
            for y = 1, #world.map[1] do
                -- map all fluids and verify if there are two of more fluids in the same tile, if some, move one to a adjacent tile that exists and not a wall "#" or 32, the new tile must have less water than the original
                for i = 1, #world.map[x][y].items do 
                    if world.map[x][y].items[i].liquid then 
                        for j = 1, #world.map[x][y].items do
                            if world.map[x][y].items[j].liquid 
                            and i ~= j
                            and world.map[x][y].items[i] ~= world.map[x][y].items[j] 
                            and world.map[x][y].items[i].position["local"].x == world.map[x][y].items[j].position["local"].x 
                            and world.map[x][y].items[i].position["local"].y == world.map[x][y].items[j].position["local"].y then
                                local item = world.map[x][y].items[j];
                                local newx = item.position["local"].x + br.utils.random(-1,1);
                                local newy = item.position["local"].y + br.utils.random(-1,1);
                                if newx > 0 and newx < #world.map[x][y].map and newy > 0 and newy < #world.map[x][y].map[1] and world.map[x][y].map[newx][newy] ~= 35 then
                                    item.position["local"].x = newx;
                                    item.position["local"].y = newy; 
                                end
                            end
                        end
                    end
                end
            end
        end
    end
    
    world.passTurn = function(_callback)
        for x = 1, #world.creatures do
            if #world.creatures[x].planned > 0 then
                world.creatures[x].act(world)
            end
            
            for y = 1, #world.creatures[x].items do
                if world.creatures[x].items[y].liquid then 
                    world.creatures[x].actions.drop(world.creatures[x], world, y);
                end
            end
            
            world.creatures[x]:passTurn();
            world.creatures[x]:checkNeeds(world);
        end
        world.updatefluids();
        checkPlayer(world.player);
        _callback();
    end

    world.spawn = function(creature, gx, gy, lx, ly)
        local c = Creature(creature);
        print(creature .. " spawned at " .. gx .. "," .. gy .. " local " .. lx .. "," .. ly)
        c.position.global = {x = gx, y = gy};
        c.position["local"] = {x = lx, y = ly};
        table.insert(world.creatures, c);
        table.insert(world.map[gx][gy].creatures, c);
        return c;
    end

    world.getitem = function(creature, itemid, filledwith)
        local item = items[itemid](creature.position);
        if filledwith then
            for x = 1, item.maxStorage do
                table.insert(item.items, items[filledwith](creature.position));
            end
        end
        table.insert(creature.items, item);
        return item;
    end

    return world;
end

return World;