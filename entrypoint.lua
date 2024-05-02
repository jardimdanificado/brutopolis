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
window.brout.player.x = br.player.position["local"].x
window.brout.player.y = br.player.position["local"].y

function window._redraw()
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
    window.brout.player.x = br.player.position["local"].x
    window.brout.player.y = br.player.position["local"].y
end