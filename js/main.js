// =============================================================================
// main.js — Render loop, camera, simulation, HUD, entity selection
// =============================================================================

var camX = 0, camY = 0, zoom = 1.0;
var lastMX = 0, lastMY = 0;
var selectedIdx = -1;
var isPaused = false;
var targetTps = 60;
var simAcc = 0.0;

// Key edge detection
var spaceWas = false, plusWas = false, minusWas = false, tabWas = false;

function setup() {
    var world = setupWorld();
    camX = world.cx; camY = world.cy;
}

function draw() {
    var dt = wagner.dt;
    if (dt > 0.1) dt = 0.1;

    // Space: toggle pause
    var spaceNow = wagner.keys[KEY_SPACE];
    if (spaceNow && !spaceWas) isPaused = !isPaused;
    spaceWas = spaceNow;

    // +/- TPS speed
    var plusNow = wagner.keys[KEY_KP_PLUS];
    if (plusNow && !plusWas) {
        if (targetTps < 60) targetTps += 15;
        else if (targetTps < 120) targetTps = 120;
        else if (targetTps < 240) targetTps = 240;
        else if (targetTps < 360) targetTps = 360;
    }
    plusWas = plusNow;

    var minusNow = wagner.keys[KEY_KP_MINUS];
    if (minusNow && !minusWas) {
        if (targetTps > 240) targetTps = 240;
        else if (targetTps > 120) targetTps = 120;
        else if (targetTps > 60) targetTps = 60;
        else if (targetTps > 15) targetTps -= 15;
        else if (targetTps > 1) targetTps = 1;
    }
    minusWas = minusNow;

    // Mouse wheel zoom (inverted)
    var wheel = wagner.mouseWheel;
    if (wheel > 0) zoom /= 1.12;
    else if (wheel < 0) zoom *= 1.12;

    // Q/E zoom
    if (wagner.keys[KEY_Q]) zoom /= (1.0 + 1.2 * dt);
    if (wagner.keys[KEY_E]) zoom *= (1.0 + 1.2 * dt);
    if (zoom < 0.2) zoom = 0.2;
    if (zoom > 3.0) zoom = 3.0;

    // Simulation
    if (!isPaused) {
        simAcc += dt;
        var stepDt = 1.0 / targetTps;
        var maxSteps = 30, steps = 0;
        while (simAcc >= stepDt && steps < maxSteps) {
            simAcc -= stepDt;
            steps++;
            var isFirst = true;
            for (var i = 0; i < MAX_ENTITIES; i++) {
                var e = entities[i];
                if (e && e.active) { updateEntity(e, stepDt, isFirst); isFirst = false; }
                else if (e && !e.active) { entities[i] = null; }
            }
        }
        if (steps >= maxSteps) simAcc = 0;
    }

    // Tile size
    var tileSize = Math.max(4, (8 * zoom) | 0);

    // Camera pan
    var camSpeed = 15.0 * dt;
    var movedManually = false;
    if (wagner.keys[KEY_W] || wagner.keys[KEY_UP])    { camY -= camSpeed; movedManually = true; }
    if (wagner.keys[KEY_S] || wagner.keys[KEY_DOWN])  { camY += camSpeed; movedManually = true; }
    if (wagner.keys[KEY_A] || wagner.keys[KEY_LEFT])  { camX -= camSpeed; movedManually = true; }
    if (wagner.keys[KEY_D] || wagner.keys[KEY_RIGHT]) { camX += camSpeed; movedManually = true; }

    var mdx = wagner.mouseX - lastMX, mdy = wagner.mouseY - lastMY;
    if (wagner.mouseDown && wagner.mouseY < 175) {
        if (mdx !== 0 || mdy !== 0) {
            camX -= mdx / tileSize; camY -= mdy / tileSize;
            if (mdx*mdx + mdy*mdy > 4) movedManually = true;
        }
    }
    lastMX = wagner.mouseX; lastMY = wagner.mouseY;
    if (movedManually) selectedIdx = -1;

    // Follow selected entity
    var sel = (selectedIdx >= 0 && selectedIdx < MAX_ENTITIES) ? entities[selectedIdx] : null;
    if (sel && sel.active) { camX = sel.x; camY = sel.y; }
    else { selectedIdx = -1; sel = null; }

    // Offset
    var startX = (320 >> 1) - ((camX + 0.5) * tileSize) | 0;
    var startY = (175 >> 1) - ((camY + 0.5) * tileSize) | 0;

    // Mouse click selection
    if (wagner.mousePressed && wagner.mouseY < 175) {
        var clickTX = ((wagner.mouseX - startX) / tileSize) | 0;
        var clickTY = ((wagner.mouseY - startY) / tileSize) | 0;
        selectedIdx = -1;
        for (var i = 0; i < MAX_ENTITIES; i++) {
            var e = entities[i];
            if (e && e.active && e.x === clickTX && e.y === clickTY) { selectedIdx = i; break; }
        }
    }

    // TAB: cycle entities
    var tabNow = wagner.keys[KEY_TAB];
    if (tabNow && !tabWas) {
        var start = selectedIdx < 0 ? 0 : selectedIdx;
        for (var step = 1; step <= MAX_ENTITIES; step++) {
            var ni = (start + step) % MAX_ENTITIES;
            if (entities[ni] && entities[ni].active) { selectedIdx = ni; camX = entities[ni].x; camY = entities[ni].y; break; }
        }
    }
    tabWas = tabNow;

    // -------------------------------------------------------------------------
    // RENDER: clear
    fill(0); clear();

    // -------------------------------------------------------------------------
    // RENDER: map
    var viewX0 = ((-startX) / tileSize) | 0, viewY0 = ((-startY) / tileSize) | 0;
    var viewX1 = ((320 - startX) / tileSize) + 1, viewY1 = ((175 - startY) / tileSize) + 1;
    if (viewX0 < 0) viewX0 = 0; if (viewY0 < 0) viewY0 = 0;
    if (viewX1 > MAP_WIDTH) viewX1 = MAP_WIDTH; if (viewY1 > MAP_HEIGHT) viewY1 = MAP_HEIGHT;

    for (var ty = viewY0; ty < viewY1; ty++) {
        for (var tx = viewX0; tx < viewX1; tx++) {
            var t = getTile(tx, ty);
            var col = tileColors[t];
            var dx = startX + tx * tileSize, dy = startY + ty * tileSize;
            drawSpriteColored(t===FLOOR?"Feature_Stone_A.png":t===MOUNTAIN?"Feature_Stone_C.png":"Feature_Waves.png", dx, dy, tileSize, tileSize, col.fg, col.bg);
        }
    }

    // RENDER: selected path
    if (sel && sel.path) {
        for (var p = sel.pathIdx; p < sel.path.length; p++) {
            var px = startX + sel.path[p].x * tileSize, py = startY + sel.path[p].y * tileSize;
            if (px+tileSize>0&&px<320&&py+tileSize>0&&py<175) {
                drawBox(px + (tileSize>>2), py + (tileSize>>2), tileSize>>1, tileSize>>1, YELLOW);
            }
        }
    }

    // RENDER: dropped items
    for (var i = 0; i < MAX_ITEMS; i++) {
        var di = droppedItems[i]; if (!di) continue;
        var dx = startX + di.x * tileSize, dy = startY + di.y * tileSize;
        if (dx+tileSize>0&&dx<320&&dy+tileSize>0&&dy<175) {
            var sz = Math.max(8, (tileSize*3/4)|0), off = (tileSize-sz)>>1;
            drawSpriteColored(di.spec.skin, dx+off, dy+off, sz, sz, di.spec.fg, di.spec.bg);
        }
    }

    // RENDER: entities
    for (var i = 0; i < MAX_ENTITIES; i++) {
        var e = entities[i]; if (!e || !e.active) continue;
        var dx = startX + e.x * tileSize, dy = startY + e.y * tileSize;
        if (dx+tileSize<=0||dx>=320||dy+tileSize<=0||dy>=175) continue;
        // selection border
        if (e.combatFlash > 0) drawBox(dx-1, dy-1, tileSize+2, tileSize+2, RED);
        else if (i === selectedIdx) drawBox(dx-1, dy-1, tileSize+2, tileSize+2, CYAN);
        // sprite
        var fg = e.hasFg ? e.fg : WHITE, bg = e.hasBg ? e.bg : BLACK;
        drawSpriteColored(e.skin, dx, dy, tileSize, tileSize, fg, bg);
        // emotes
        var emote = null;
        if (e.fatigue <= 25 || e.motor === MOTOR_SLEEP) emote = "Emote_Sleeping.png";
        else if (e.motor === MOTOR_ATTACK) emote = "Emote_Angry.png";
        else if (e.motor === MOTOR_FLEE) emote = "Emote_Upset.png";
        else if (e.health < 35) emote = "Emote_Hurt.png";
        else if (e.hunger <= 30 || e.thirst <= 30) emote = "Emote_Sick.png";
        else if (e.motor === MOTOR_SOCIALIZE) emote = "Emote_Happy.png";
        else if (e.motor === MOTOR_EAT || e.motor === MOTOR_DRINK) emote = "Emote_Excited.png";
        if (emote) { var esz = Math.max(8,(tileSize*3/4)|0); drawSprite(emote, dx+((tileSize-esz)>>1), dy-esz, esz, esz); }
    }

    // -------------------------------------------------------------------------
    // HUD: Inspector panel
    if (sel) {
        drawBox(0, 175, 320, 65, rgb(20,24,30));
        drawBox(0, 175, 320, 1, rgb(60,80,100));
        var fg = sel.hasFg ? sel.fg : WHITE, bg = sel.hasBg ? sel.bg : BLACK;
        drawSpriteColored(sel.skin, 6, 180, 28, 28, fg, bg);
        drawText(sel.name, 38, 180, WHITE);
        drawText("[" + sel.speciesTitle + "]", 38, 191, GREEN);
        var movS = sel.movement===MOVE_FLY?"Fly":sel.movement===MOVE_AQUATIC?"Aqua":sel.movement===MOVE_NONE?"Fixed":"Walk";
        var dieS = sel.diet===DIET_PHOTOSYNTHESIS?"Light":sel.diet===DIET_HERBIVORE?"Herb":sel.diet===DIET_CARNIVORE?"Carn":"Omni";
        var repS = sel.repro===REPRO_SEX?"Sex":sel.repro===REPRO_MITOSIS?"Mitosis":sel.repro===REPRO_SPORE?"Spore":"None";
        drawText(movS+"/"+dieS+"/"+repS, 38, 202, CYAN);
        drawText(sel.thought, 6, 226, YELLOW);

        // Stats
        var sx = 132;
        drawSprite("Other_Heart.png",  sx+24, 180, 10, 10); drawText(sel.health|0+"/"+sel.maxHealth|0, sx+42, 181, WHITE);
        drawSprite("Item_Bread.png",   sx+24, 191, 10, 10); drawText(sel.hunger|0+"/"+sel.maxHunger|0, sx+42, 192, WHITE);
        drawSprite("Other_Water.png",  sx+24, 202, 10, 10); drawText(sel.thirst|0+"/"+sel.maxThirst|0, sx+42, 203, WHITE);
        drawSprite("Other_Sleep.png",  sx+24, 213, 10, 10); drawText(sel.fatigue|0+"/"+sel.maxFatigue|0, sx+42, 214, WHITE);

        // Inventory
        drawText("Bag:", 245, 180, WHITE);
        for (var slot = 0; slot < 6; slot++) {
            var bx = 245 + (slot%3)*24, by = 192 + ((slot/3)|0)*22;
            drawBox(bx, by, 20, 20, rgb(40,50,60));
            if (slot < sel.inventory.length) {
                var inv = sel.inventory[slot];
                drawSpriteColored(inv.item.skin, bx+2, by+2, 16, 16, inv.item.fg, inv.item.bg);
                drawText(""+inv.count, bx+12, by+11, WHITE);
            }
        }
    }

    // -------------------------------------------------------------------------
    // HUD: Clock
    drawBox(4, 4, 145, 14, rgb(20,24,30));
    drawBox(4, 4, 145, 1, rgb(60,80,100));
    var hh = worldClock.hour, mm = worldClock.minute;
    var lp = (worldClock.globalLight * 100) | 0; if (lp > 99) lp = 99;
    var clockStr = "Day " + worldClock.day + " " + (hh<10?"0":"")+hh + ":" + (mm<10?"0":"")+mm + " L:" + lp + "%";
    drawText(clockStr, 8, 7, YELLOW);

    // HUD: Run/Pause
    if (isPaused) {
        drawBox(155, 4, 95, 14, rgb(40,20,20));
        drawBox(155, 4, 95, 1, RED);
        drawText("[ PAUSED ]", 165, 7, RED);
    } else {
        drawBox(155, 4, 140, 14, rgb(20,35,20));
        drawBox(155, 4, 140, 1, GREEN);
        drawText("[ RUN (" + targetTps + "tps) ]", 161, 7, GREEN);
    }
}
