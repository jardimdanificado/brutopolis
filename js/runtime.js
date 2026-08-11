// runtime.js — simulation callback for the hybrid C/JavaScript build.
// Rendering, camera, input presentation and map generation are native.

var isPaused = false;
var targetTps = 60;
var simAcc = 0.0;

function setup() {
    setupWorld();
}

function syncRenderState() {
    native_render_clear();
    for (var i = 0; i < MAX_ENTITIES; i++) {
        var e = entities[i];
        if (!e) continue;
        native_render_entity(i, e.active ? 1 : 0, e.x|0, e.y|0, e.motor|0,
            e.hasFg ? e.fg|0 : WHITE, e.hasBg ? e.bg|0 : BLACK,
            e.health|0, e.hunger|0, e.thirst|0, e.fatigue|0, e.skin);
        native_render_entity_meta(i, e.name, e.speciesTitle, e.thought,
            e.movement|0, e.diet|0, e.repro|0, e.maxHealth|0,
            e.maxHunger|0, e.maxThirst|0, e.maxFatigue|0, e.combatFlash|0);
        for (var slot = 0; slot < 6; slot++) {
            var inv = e.inventory[slot];
            if (inv) native_render_inventory(i, slot, 1, inv.item.fg|0,
                inv.item.bg|0, inv.count|0, inv.item.skin);
        }
    }
    for (var j = 0; j < MAX_ITEMS; j++) {
        var item = droppedItems[j];
        if (!item) continue;
        native_render_item(j, 1, item.x|0, item.y|0,
            item.spec.fg|0, item.spec.bg|0, item.count|0, item.spec.skin);
    }
    native_render_clock(worldClock.day|0, worldClock.hour|0,
        worldClock.minute|0, (worldClock.globalLight * 100)|0);
}

function tick() {
    var dt = wagner.dt;
    if (dt > 0.1) dt = 0.1;
    isPaused = native_is_paused();
    targetTps = native_target_tps();
    wagner.selectedEntity = native_selected_entity();

    if (!isPaused) {
        simAcc += dt;
        var stepDt = 1.0 / targetTps, steps = 0;
        while (simAcc >= stepDt && steps < 30) {
            simAcc -= stepDt;
            steps++;
            for (var i = 0; i < MAX_ENTITIES; i++) {
                var e = entities[i];
                if (e && e.active) updateEntity(e, stepDt, i === 0);
            }
        }
        if (steps >= 30) simAcc = 0;
    }

    syncRenderState();
}
