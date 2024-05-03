-- Entry point if the game is run in a browser using fengari + p5js
local js = require "js"
local window = js.global
local document = window.document
local br = require "main"

function window.setup()
    window:createCanvas(400, 400)
end

window.brout = window:Object();
window.brout.room = window:Array()

local currentRoom = br.world.map[br.player.position["global"].x][br.player.position["global"].y]

for x = 0, #currentRoom.map-1 do
    window.brout.room:push(window:Array());
    for y = 0, #currentRoom.map[x+1]-1 do
        window.brout.room[x]:push(currentRoom.map[x+1][y+1])
    end
end

window.brout.player = window:Object()
window.brout.player.position = window:Object()

window.brout.player.position["local"] = window:Object()
window.brout.player.position["local"].x = br.player.position["local"].x -1
window.brout.player.position["local"].y = br.player.position["local"].y -1

window.brout.player.position["global"] = window:Object()
window.brout.player.position["global"].x = br.player.position["global"].x -1
window.brout.player.position["global"].y = br.player.position["global"].y -1

function br.redraw()
    window.brout = window:Object();
    window.brout.room = window:Array()

    local currentRoom = br.world.map[br.player.position["global"].x][br.player.position["global"].y]

    for x = 0, #currentRoom.map-1 do
        window.brout.room:push(window:Array());
        for y = 0, #currentRoom.map[x+1]-1 do
            window.brout.room[x]:push(currentRoom.map[x+1][y+1])
        end
    end

    window.brout.player = window:Object()
    window.brout.player.position = window:Object()
    
    window.brout.player.position["local"] = window:Object()
    window.brout.player.position["local"].x = br.player.position["local"].x -1 
    window.brout.player.position["local"].y = br.player.position["local"].y -1
    
    window.brout.player.position["global"] = window:Object()
    window.brout.player.position["global"].x = br.player.position["global"].x -1
    window.brout.player.position["global"].y = br.player.position["global"].y -1

    window:resizeCanvas((11 * #currentRoom.map) + 2, (11 * #currentRoom.map[1]) + 2)
end