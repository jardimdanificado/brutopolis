// =============================================================================
// creatures.js — Entity system, AI brain, combat, reproduction, items
// =============================================================================

// ---------------------------------------------------------------------------
// Item specs (data-driven)
// ---------------------------------------------------------------------------
var ITEM_BREAD  = { id:"item_bread",  name:"Pao Caseiro",       skin:"Item_Bread.png",  modName:"comida", hunger:45, thirst:0,  health:0,  fg:rgb(254,242,166), bg:rgb(60,40,10) };
var ITEM_FRUIT  = { id:"item_fruit",  name:"Fruta Suculenta",   skin:"Item_Fruit.png",  modName:"comida", hunger:35, thirst:0,  health:10, fg:rgb(245,80,100),  bg:rgb(70,15,20) };
var ITEM_WATER  = { id:"item_water",  name:"Jarra d'Agua",      skin:"Item_Jug.png",    modName:"bebida", hunger:0,  thirst:55, health:0,  fg:rgb(100,200,255), bg:rgb(20,50,80) };
var ITEM_HERB   = { id:"item_herb",   name:"Erva Medicinal",    skin:"Item_Herb.png",   modName:"cura",   hunger:0,  thirst:0,  health:35, fg:rgb(100,240,140), bg:rgb(15,60,25) };
var ITEM_STEAK  = { id:"item_steak",  name:"Bife Assado",       skin:"Item_Steak.png",  modName:"comida", hunger:60, thirst:0,  health:15, fg:rgb(220,90,70),   bg:rgb(60,20,15) };
var ITEM_SEED   = { id:"item_seed",   name:"Semente de Planta", skin:"Item_Herb.png",   modName:"comida", hunger:10, thirst:0,  health:0,  fg:rgb(144,238,144), bg:rgb(46,139,87) };
var ALL_ITEMS   = [ITEM_BREAD, ITEM_FRUIT, ITEM_WATER, ITEM_HERB, ITEM_STEAK, ITEM_SEED];

function itemIsMeat(item) { return item.id === "item_steak"; }
function itemIsPlantFood(item) { return item.id==="item_fruit"||item.id==="item_herb"||item.id==="item_bread"||item.id==="item_seed"; }
function isFoodForDiet(diet, item) {
    if (!item || diet===DIET_NONE || diet===DIET_PHOTOSYNTHESIS) return false;
    if (diet===DIET_OMNIVORE) return true;
    if (diet===DIET_CARNIVORE) return !itemIsPlantFood(item);
    if (diet===DIET_HERBIVORE) return !itemIsMeat(item);
    return true;
}

// ---------------------------------------------------------------------------
// Entity factory
// ---------------------------------------------------------------------------
function makeEntity(id, x, y) {
    return {
        id: id, active: true, x: x, y: y, homeX: x, homeY: y,
        name: "?", speciesTitle: "", groupTag: "", skin: "",
        fg: WHITE, bg: BLACK, hasFg: false, hasBg: false,
        movement: MOVE_WALK, diet: DIET_OMNIVORE, repro: REPRO_NONE, reproTimer: 0.0,
        health: 100, maxHealth: 100, hunger: 100, maxHunger: 100,
        thirst: 100, maxThirst: 100, fatigue: 100, maxFatigue: 100,
        attack: 0.0, defense: 0.0, attackSpeed: 1.0, attackCooldown: 0.0, aggroRange: 0.0,
        targetId: -1, combatFlash: 0.0,
        motor: MOTOR_IDLE, path: [], pathIdx: 0, moveTimer: 0.0,
        bravery: 50, gluttony: 50, sociability: 50, curiosity: 50, thought: "...",
        behavior: BEHAVIOR_NONE, ability: ABILITY_NONE, abilityPower: 0.0,
        metabolism: METABOLISM_NORMAL,
        prefTerrain: -1, prefFood: "", prefSpecies: "", hatedSpecies: "", hatedId: -1,
        foodAffinity: 1.0, speciesAffinity: 0.0, bonusMultiplier: 1.25,
        poisonTimer: 0.0, isPlant: false,
        plantFruit: false, fruitInterval: 20.0, fruitTimer: 0.0, fruitItemId: "item_fruit",
        lootTable: [],   // [{item, min, max, chance}]
        inventory: []    // [{item, count}]
    };
}

function spawnEntity(x, y, spec) {
    for (var i = 0; i < MAX_ENTITIES; i++) {
        if (!entities[i]) {
            var e = makeEntity(nextEntityId++, x, y);
            e.hunger = rngInt(75, 100); e.thirst = rngInt(75, 100); e.fatigue = rngInt(80, 100);
            applySpec(e, spec);
            entities[i] = e;
            return e;
        }
    }
    return null;
}

function applySpec(e, spec) {
    if (spec.name)     e.name = spec.name;
    if (spec.title)    e.speciesTitle = spec.title;
    if (spec.group)    e.groupTag = spec.group;
    if (spec.skin)     e.skin = spec.skin;
    if (spec.movement !== undefined) e.movement = spec.movement;
    if (spec.diet !== undefined)     e.diet = spec.diet;
    if (spec.repro !== undefined)    e.repro = spec.repro;
    if (spec.hp)      { e.maxHealth = spec.hp;     e.health = spec.hp; }
    if (spec.hunger)  { e.maxHunger = spec.hunger; }
    if (spec.thirst)  { e.maxThirst = spec.thirst; }
    if (spec.attack !== undefined)   e.attack = spec.attack;
    if (spec.defense !== undefined)  e.defense = spec.defense;
    if (spec.aggro !== undefined)    e.aggroRange = spec.aggro;
    if (spec.bravery !== undefined)  e.bravery = spec.bravery;
    if (spec.gluttony !== undefined) e.gluttony = spec.gluttony;
    if (spec.sociability !== undefined) e.sociability = spec.sociability;
    if (spec.curiosity !== undefined)   e.curiosity = spec.curiosity;
    if (spec.behavior !== undefined)    e.behavior = spec.behavior;
    if (spec.ability !== undefined)     e.ability = spec.ability;
    if (spec.abilityPower !== undefined) e.abilityPower = spec.abilityPower;
    if (spec.metabolism !== undefined)  e.metabolism = spec.metabolism;
    if (spec.prefTerrain !== undefined) e.prefTerrain = spec.prefTerrain;
    if (spec.prefFood)    e.prefFood = spec.prefFood;
    if (spec.prefSpecies) e.prefSpecies = spec.prefSpecies;
    if (spec.hatedSpecies) e.hatedSpecies = spec.hatedSpecies;
    if (spec.bonusMultiplier) e.bonusMultiplier = spec.bonusMultiplier;
    if (spec.isPlant)     e.isPlant = spec.isPlant;
    if (spec.plantFruit !== undefined)  e.plantFruit = spec.plantFruit;
    if (spec.fruitInterval) e.fruitInterval = spec.fruitInterval;
    if (spec.fruitItemId)   e.fruitItemId = spec.fruitItemId;
    if (spec.loot)   e.lootTable.push(spec.loot);
    if (spec.fg)     { e.fg = spec.fg; e.hasFg = true; }
    if (spec.bg)     { e.bg = spec.bg; e.hasBg = true; }
}

// ---------------------------------------------------------------------------
// Inventory helpers
// ---------------------------------------------------------------------------
function entityAddItem(e, item, count) {
    for (var i = 0; i < e.inventory.length; i++) {
        if (e.inventory[i].item.id === item.id) { e.inventory[i].count += count; return true; }
    }
    if (e.inventory.length < 6) { e.inventory.push({item:item, count:count}); return true; }
    return false;
}
function entityConsumeFood(e) {
    if (e.diet===DIET_NONE||e.diet===DIET_PHOTOSYNTHESIS) return true;
    for (var i = 0; i < e.inventory.length; i++) {
        var slot = e.inventory[i];
        if ((slot.item.hunger > 0 || slot.item.health > 0) && isFoodForDiet(e.diet, slot.item)) {
            e.hunger = Math.min(e.maxHunger, e.hunger + slot.item.hunger);
            e.health = Math.min(e.maxHealth, e.health + slot.item.health);
            if (slot.item.id==="item_fruit"||slot.item.id==="item_herb") spawnDroppedItemScatter(e.x, e.y, ITEM_SEED, 1);
            slot.count--;
            if (slot.count <= 0) e.inventory.splice(i, 1);
            return true;
        }
    }
    return false;
}
function entityConsumeWater(e) {
    for (var i = 0; i < e.inventory.length; i++) {
        var slot = e.inventory[i];
        if (slot.item.thirst > 0) {
            e.thirst = Math.min(e.maxThirst, e.thirst + slot.item.thirst);
            slot.count--;
            if (slot.count <= 0) e.inventory.splice(i, 1);
            return true;
        }
    }
    return false;
}
function entityTriggerLoot(e) {
    for (var i = 0; i < e.inventory.length; i++) {
        spawnDroppedItemScatter(e.x, e.y, e.inventory[i].item, e.inventory[i].count);
    }
    e.inventory = [];
    for (var i = 0; i < e.lootTable.length; i++) {
        var lt = e.lootTable[i];
        if (rngFloat() <= lt.chance) {
            spawnDroppedItemScatter(e.x, e.y, lt.item, rngInt(lt.min, lt.max));
        }
    }
}
function entityPickupAt(e, x, y) {
    for (var i = 0; i < MAX_ITEMS; i++) {
        if (droppedItems[i] && droppedItems[i].x===x && droppedItems[i].y===y) {
            var di = droppedItems[i];
            if (!isFoodForDiet(e.diet, di.spec)) continue;
            entityAddItem(e, di.spec, di.count);
            droppedItems[i] = null;
        }
    }
}

// ---------------------------------------------------------------------------
// Perception (sensors)
// ---------------------------------------------------------------------------
function perceiveThreat(self) {
    var best = null, minScore = (self.aggroRange*self.aggroRange)*1.5;
    for (var i = 0; i < MAX_ENTITIES; i++) {
        var other = entities[i];
        if (!other||other.id===self.id||other.isPlant||other.movement===MOVE_NONE) continue;
        if (other.speciesTitle===self.speciesTitle) continue;
        var hostile = false, hw = 1.0;
        if (self.groupTag&&other.groupTag&&self.groupTag!==other.groupTag) { hostile=true; }
        if (self.hatedSpecies&&self.hatedSpecies===other.speciesTitle) { hostile=true; hw+=2.0-self.speciesAffinity; }
        if (self.hatedId===other.id) { hostile=true; hw+=4.0; }
        var ea = self.aggroRange * (other.ability===ABILITY_CAMOUFLAGE ? 0.5 : 1.0);
        if (hostile) {
            var d = (other.x-self.x)*(other.x-self.x)+(other.y-self.y)*(other.y-self.y);
            if (d <= ea*ea*2.2) { var sc=d/hw; if(sc<minScore){minScore=sc;best=other;} }
        }
    }
    return best;
}
function perceiveAlly(self) {
    if (!self.groupTag) return null;
    var best=null, minD=(self.aggroRange*1.5)*(self.aggroRange*1.5);
    for (var i=0;i<MAX_ENTITIES;i++) { var o=entities[i]; if(!o||o.id===self.id||o.groupTag!==self.groupTag) continue; var d=(o.x-self.x)*(o.x-self.x)+(o.y-self.y)*(o.y-self.y); if(d<=minD){minD=d;best=o;} }
    return best;
}
function perceiveMate(self) {
    if (self.repro!==REPRO_SEX) return null;
    var best=null, minD=(self.aggroRange*2)*(self.aggroRange*2);
    for (var i=0;i<MAX_ENTITIES;i++) {
        var o=entities[i]; if(!o||o.id===self.id||o.repro!==REPRO_SEX||o.speciesTitle!==self.speciesTitle) continue;
        if (o.health>o.maxHealth*0.5&&o.hunger>o.maxHunger*0.35&&o.fatigue>30) {
            var d=(o.x-self.x)*(o.x-self.x)+(o.y-self.y)*(o.y-self.y); if(d<=minD){minD=d;best=o;}
        }
    }
    return best;
}
function perceiveFood(self) {
    if (self.diet===DIET_NONE||self.diet===DIET_PHOTOSYNTHESIS) return null;
    var best=null, minScore=1e9;
    for (var i=0;i<MAX_ITEMS;i++) {
        var di=droppedItems[i]; if(!di) continue;
        if (di.spec.hunger<=0&&di.spec.health<=0) continue;
        if (!isFoodForDiet(self.diet, di.spec)) continue;
        var d=(di.x-self.x)*(di.x-self.x)+(di.y-self.y)*(di.y-self.y);
        var w=1.0; if(self.prefFood&&self.prefFood===di.spec.id) w=self.foodAffinity>0?self.foodAffinity:2.5;
        var sc=d/w; if(sc<minScore){minScore=sc;best={x:di.x,y:di.y};}
    }
    return best;
}
function perceiveWaterTile(self) {
    var bestD=1e9, best=null;
    for (var dy=-30;dy<=30;dy++) for (var dx=-30;dx<=30;dx++) {
        var tx=self.x+dx, ty=self.y+dy;
        if (getTile(tx,ty)===WATER) {
            var adx=[0,0,-1,1],ady=[-1,1,0,0];
            for (var k=0;k<4;k++) { var wx=tx+adx[k],wy=ty+ady[k]; if(isTileWalkable(wx,wy,self.movement)){var d=(wx-self.x)*(wx-self.x)+(wy-self.y)*(wy-self.y);if(d<bestD){bestD=d;best={x:wx,y:wy};}}}
        }
    }
    return best;
}
function perceiveWaterSource(self) {
    var itemWater=null, minDI=1e9;
    for (var i=0;i<MAX_ITEMS;i++){var di=droppedItems[i];if(!di||di.spec.thirst<=0)continue;var d=(di.x-self.x)*(di.x-self.x)+(di.y-self.y)*(di.y-self.y);if(d<minDI){minDI=d;itemWater={x:di.x,y:di.y};}}
    var shore=perceiveWaterTile(self);
    if (itemWater&&shore) { var dI=(itemWater.x-self.x)*(itemWater.x-self.x)+(itemWater.y-self.y)*(itemWater.y-self.y); var dS=(shore.x-self.x)*(shore.x-self.x)+(shore.y-self.y)*(shore.y-self.y); return dI<=dS?itemWater:shore; }
    return itemWater||shore;
}
function isNearWater(self) {
    var dx=[0,0,-1,1],dy=[-1,1,0,0];
    for(var k=0;k<4;k++){if(getTile(self.x+dx[k],self.y+dy[k])===WATER)return true;}
    return false;
}

// ---------------------------------------------------------------------------
// Motor actuators
// ---------------------------------------------------------------------------
function doMoveTo(self, tx, ty) {
    self.motor = MOTOR_MOVE;
    var targetChanged = self.path.length > 0 && (self.path[self.path.length-1].x!==tx||self.path[self.path.length-1].y!==ty);
    if (self.path.length===0||self.pathIdx>=self.path.length||targetChanged) {
        self.path = findPath(self.x, self.y, tx, ty, self.movement);
        self.pathIdx = 0;
    }
}
function doEat(self) {
    if (entityConsumeFood(self)) { self.motor=MOTOR_EAT; self.thought="Eating food item"; self.path=[]; return true; }
    var fp=perceiveFood(self);
    if (fp) { self.motor=MOTOR_EAT; self.thought="Seeking food"; doMoveTo(self,fp.x,fp.y); return true; }
    if (self.diet===DIET_CARNIVORE||self.diet===DIET_OMNIVORE) {
        var best=null,minD=1e9;
        for(var i=0;i<MAX_ENTITIES;i++){var pr=entities[i];if(!pr||pr.id===self.id||pr.isPlant||pr.movement===MOVE_NONE||pr.speciesTitle===self.speciesTitle)continue;var d=(pr.x-self.x)*(pr.x-self.x)+(pr.y-self.y)*(pr.y-self.y);if(d<=self.aggroRange*self.aggroRange*4&&d<minD){minD=d;best=pr;}}
        if(best){self.thought="Hunting prey for food!";doAttack(self,best);return true;}
    }
    return false;
}
function doDrink(self) {
    if (entityConsumeWater(self)) { self.motor=MOTOR_DRINK; self.thought="Drinking water item"; self.path=[]; return true; }
    if (isNearWater(self)) { self.motor=MOTOR_DRINK; self.thought="Drinking at shore"; self.thirst=Math.min(self.maxThirst,self.thirst+60); self.path=[]; return true; }
    var wp=perceiveWaterSource(self);
    if (wp) { self.motor=MOTOR_DRINK; self.thought="Seeking water"; doMoveTo(self,wp.x,wp.y); return true; }
    return false;
}
function doSleep(self) { self.motor=MOTOR_SLEEP; self.path=[]; }
function doAttack(self, target) {
    if (!target) return;
    self.motor=MOTOR_ATTACK; self.targetId=target.id;
    // grudge
    if (target.hatedId!==self.id){target.hatedId=self.id;target.hatedSpecies=self.speciesTitle;target.speciesAffinity=Math.max(-1,target.speciesAffinity-0.3);}
    var d=(target.x-self.x)*(target.x-self.x)+(target.y-self.y)*(target.y-self.y);
    if (d<=2.2) {
        if (self.attackCooldown<=0) {
            self.attackCooldown=self.attackSpeed;
            var dmg=Math.max(2,self.attack-target.defense);
            target.health-=dmg; target.combatFlash=0.3;
            if (self.ability===ABILITY_VAMPIRISM){self.health=Math.min(self.maxHealth,self.health+dmg*0.35);}
            if (self.ability===ABILITY_VENOM){target.poisonTimer=5.0;}
        }
        self.path=[];
    } else { doMoveTo(self,target.x,target.y); }
}
function doFlee(self, threat) {
    self.motor=MOTOR_FLEE;
    var dx=self.x-threat.x||1, dy=self.y-threat.y;
    doMoveTo(self, self.x+(dx>0?8:-8), self.y+(dy>0?8:-8));
}
function doSocialize(self, ally) {
    self.motor=MOTOR_SOCIALIZE;
    var d=(ally.x-self.x)*(ally.x-self.x)+(ally.y-self.y)*(ally.y-self.y);
    if (d>4) doMoveTo(self,ally.x,ally.y); else self.path=[];
}
function doExplore(self) {
    if (self.movement===MOVE_NONE){self.motor=MOTOR_IDLE;return;}
    self.motor=MOTOR_EXPLORE;
    if (self.path.length===0||self.pathIdx>=self.path.length) {
        var tx=self.x+rngInt(-12,12), ty=self.y+rngInt(-12,12);
        if (isTileWalkable(tx,ty,self.movement)) doMoveTo(self,tx,ty);
    }
}
function doIdle(self) { self.motor=MOTOR_IDLE; self.path=[]; }

// ---------------------------------------------------------------------------
// Layer 2: High-level brain
// ---------------------------------------------------------------------------
function brainThink(self) {
    var threat=perceiveThreat(self), ally=perceiveAlly(self), mate=perceiveMate(self);
    if (threat&&self.attack>0) {
        if (self.behavior===BEHAVIOR_PACIFIST||self.bravery<40){self.thought="Fleeing in panic!";doFlee(self,threat);return;}
        else{self.thought="Attacking threat!";doAttack(self,threat);return;}
    }
    if (self.fatigue<=20||(self.motor===MOTOR_SLEEP&&self.fatigue<self.maxFatigue)){self.thought="Sleeping...";doSleep(self);return;}
    if (self.thirst<=45){if(doDrink(self))return;self.thought="Thirsty (No water)";}
    if (self.diet!==DIET_NONE&&self.diet!==DIET_PHOTOSYNTHESIS){
        var ht=self.gluttony>60?65:35;
        if(self.hunger<=ht){if(doEat(self))return;self.thought="Hungry (No food)";
            if(self.hunger<=25){
                if(self.behavior!==BEHAVIOR_CANNIBALISM&&rngInt(0,100)<5)self.behavior=BEHAVIOR_CANNIBALISM;
                if(self.behavior===BEHAVIOR_CANNIBALISM){for(var i=0;i<MAX_ENTITIES;i++){var pr=entities[i];if(pr&&pr.id!==self.id&&pr.speciesTitle===self.speciesTitle){self.thought="Starving: Cannibal!";doAttack(self,pr);return;}}}
            }
        }
    }
    if (self.behavior===BEHAVIOR_SCAVENGER&&self.path.length===0){
        for(var i=0;i<MAX_ITEMS;i++){var di=droppedItems[i];if(!di)continue;var d=(di.x-self.x)*(di.x-self.x)+(di.y-self.y)*(di.y-self.y);if(d<=144){self.thought="Collecting item";doMoveTo(self,di.x,di.y);return;}}
    }
    if (mate&&self.repro===REPRO_SEX&&self.reproTimer>30){
        self.thought="Seeking partner";
        var md=(mate.x-self.x)*(mate.x-self.x)+(mate.y-self.y)*(mate.y-self.y);
        if (md<=2.2) {
            self.reproTimer=0; mate.reproTimer=0;
            var adxs=[0,0,-1,1],adys=[-1,1,0,0];
            for(var k=0;k<4;k++){var nx=self.x+adxs[k],ny=self.y+adys[k];if(isTileWalkable(nx,ny,self.movement)){spawnEntity(nx,ny,{name:self.name,title:self.speciesTitle,group:self.groupTag,skin:self.skin,movement:self.movement,diet:self.diet,repro:self.repro,hp:self.maxHealth,hunger:self.maxHunger,thirst:self.maxThirst,attack:self.attack,defense:self.defense,aggro:self.aggroRange,bravery:self.bravery,gluttony:self.gluttony,sociability:self.sociability,curiosity:self.curiosity,fg:self.fg,bg:self.bg,hasFg:self.hasFg,hasBg:self.hasBg});break;}}
        } else { doMoveTo(self,mate.x,mate.y); return; }
    }
    if (self.sociability>=60&&ally){self.thought="Socializing with ally";doSocialize(self,ally);return;}
    if (self.curiosity>=50&&self.movement!==MOVE_NONE){self.thought="Exploring map";doExplore(self);return;}
    self.thought="Resting..."; doIdle(self);
}

// ---------------------------------------------------------------------------
// Entity simulation update (called each tick)
// ---------------------------------------------------------------------------
function updateEntity(e, dt, isFirst) {
    if (!e) return;

    // World clock & seed germination on first entity
    if (isFirst) {
        updateWorldClock(dt);
        for (var i=0;i<MAX_ITEMS;i++) {
            var di=droppedItems[i];
            if (!di||di.spec.id!=="item_seed") continue;
            di.germinateTimer+=dt;
            if (di.germinateTimer>=12.0&&getTile(di.x,di.y)===FLOOR) {
                droppedItems[i]=null;
                spawnEntity(di.x, di.y, {name:"Gaia",title:"Planta Carnivora",group:"Flora",skin:"Feature_Tree_Full.png",movement:MOVE_NONE,diet:DIET_PHOTOSYNTHESIS,repro:REPRO_SPORE,hp:160,hunger:100,thirst:100,isPlant:true,plantFruit:true,fruitInterval:15.0,fruitItemId:"item_fruit",ability:ABILITY_REGEN,abilityPower:1.0,loot:{item:ITEM_FRUIT,min:1,max:3,chance:1.0},fg:rgb(255,120,180),bg:rgb(50,15,30)});
            }
        }
    }

    // Inventory audit: drop unsuitable food
    for (var i=e.inventory.length-1;i>=0;i--) {
        if (!isFoodForDiet(e.diet,e.inventory[i].item)) {
            spawnDroppedItemScatter(e.x,e.y,e.inventory[i].item,e.inventory[i].count);
            e.inventory.splice(i,1);
        }
    }

    // Timers
    if (e.combatFlash>0) e.combatFlash-=dt;
    if (e.attackCooldown>0) e.attackCooldown-=dt;
    if (e.poisonTimer>0){e.poisonTimer-=dt;e.health-=3.0*dt;}
    e.reproTimer+=dt;

    // Plant fruit spawning
    if (e.isPlant&&e.plantFruit){
        e.fruitTimer+=dt;
        if (e.fruitTimer>=e.fruitInterval){
            e.fruitTimer=0;
            var adxs=[0,0,-1,1],adys=[-1,1,0,0];
            for(var k=0;k<4;k++){var nx=e.x+adxs[k],ny=e.y+adys[k];if(isTileWalkable(nx,ny,MOVE_WALK)){var pItem=e.fruitItemId==="item_herb"?ITEM_HERB:ITEM_FRUIT;spawnDroppedItemScatter(nx,ny,pItem,1);break;}}
        }
    }

    // Metabolism multiplier
    var meta = (e.metabolism===METABOLISM_FAST)?1.5:(e.metabolism===METABOLISM_SLOW?0.6:1.0);

    // Regeneration ability
    var isRegen=false;
    if (e.ability===ABILITY_REGEN&&e.health<e.maxHealth){isRegen=true;e.health=Math.min(e.maxHealth,e.health+6*dt);meta*=3;}

    // Sleep healing
    if (e.motor===MOTOR_SLEEP) e.health=Math.min(e.maxHealth,e.health+2*dt);

    // Nutrient decay
    if (e.diet===DIET_PHOTOSYNTHESIS){var tl=getTileLight(e.x,e.y);e.hunger=Math.min(e.maxHunger,e.hunger+3*tl*dt);}
    else if(e.diet!==DIET_NONE){e.hunger=Math.max(0,e.hunger-0.8*meta*dt);}
    e.thirst=Math.max(0,e.thirst-1.2*meta*dt);
    if (e.motor===MOTOR_SLEEP){e.fatigue=Math.min(e.maxFatigue,e.fatigue+8*dt);}
    else{e.fatigue=Math.max(0,e.fatigue-0.4*meta*dt);}

    // Reproduction check (mitosis/spore)
    if (e.health>e.maxHealth*0.8&&e.hunger>e.maxHunger*0.7&&e.reproTimer>40&&(e.repro===REPRO_MITOSIS||e.repro===REPRO_SPORE)){
        var adxs=[0,0,-1,1],adys=[-1,1,0,0];
        for(var k=0;k<4;k++){var nx=e.x+adxs[k],ny=e.y+adys[k];if(isTileWalkable(nx,ny,e.movement)){e.reproTimer=0;spawnEntity(nx,ny,{name:e.name,title:e.speciesTitle,group:e.groupTag,skin:e.skin,movement:e.movement,diet:e.diet,repro:e.repro,hp:e.maxHealth,hunger:e.maxHunger,thirst:e.maxThirst,attack:e.attack,defense:e.defense,aggro:e.aggroRange,bravery:e.bravery,gluttony:e.gluttony,sociability:e.sociability,curiosity:e.curiosity,isPlant:e.isPlant,plantFruit:e.plantFruit,fruitInterval:e.fruitInterval,fruitItemId:e.fruitItemId,ability:e.ability,abilityPower:e.abilityPower,lootTable:e.lootTable.slice(),fg:e.fg,bg:e.bg});break;}}
    }

    // Starvation / passive healing
    if(e.hunger<=10||e.thirst<=10||e.fatigue<=5){e.health-=2*dt;}
    else if(e.hunger>70&&e.thirst>70&&e.fatigue>70&&e.health<e.maxHealth&&!isRegen){e.health+=1*dt;}

    if (e.health<=0){e.active=false;e.health=0;entityTriggerLoot(e);return;}

    brainThink(e);

    // Movement step
    if (e.path.length>0&&e.pathIdx<e.path.length){
        e.moveTimer+=dt;
        var stepDelay=(e.motor===MOTOR_ATTACK||e.motor===MOTOR_FLEE)?0.22:0.40;
        if(e.metabolism===METABOLISM_FAST)stepDelay*=0.8;
        else if(e.metabolism===METABOLISM_SLOW)stepDelay*=1.15;
        if(e.prefTerrain>=0&&getTile(e.x,e.y)===e.prefTerrain)stepDelay/=e.bonusMultiplier;
        if (e.moveTimer>=stepDelay){
            e.moveTimer=0;
            e.x=e.path[e.pathIdx].x; e.y=e.path[e.pathIdx].y;
            e.pathIdx++;
            entityPickupAt(e,e.x,e.y);
            if(e.pathIdx>=e.path.length){e.path=[];e.pathIdx=0;}
        }
    }
}
