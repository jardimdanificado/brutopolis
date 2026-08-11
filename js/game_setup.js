// =============================================================================
// game_setup.js — Species definitions, world initialization
// =============================================================================

function setupWorld() {
    // Generate map
    genMap({ seed:0, noiseScale:0.05, octaves:4, numIslands:6, minRadius:90, maxRadius:170, waterThresh:0.35, mountThresh:0.70, caIter:3 });
    var center = findLandCenter();
    var cx = center.x, cy = center.y;

    // -------------------------------------------------------------------------
    // Species Specs
    // -------------------------------------------------------------------------
    var specs = [
        // 1. Árvore Anciã
        { name:"Carvalho",  title:"Arvore Ancia",        group:"Natureza", skin:"Feature_Tree_Full.png",
          movement:MOVE_NONE, diet:DIET_PHOTOSYNTHESIS, repro:REPRO_SPORE, hp:200, hunger:100, thirst:100,
          attack:0, defense:0, aggro:0, isPlant:true, plantFruit:true, fruitInterval:20.0, fruitItemId:"item_herb",
          ability:ABILITY_REGEN, abilityPower:1.0, loot:{item:ITEM_FRUIT,min:1,max:3,chance:1.0},
          fg:rgb(90,220,90), bg:rgb(20,50,20) },

        // 2. Dragão Alado
        { name:"Smaug",     title:"Dragao Alado",        group:"Dracones", skin:"Creature_Dragon_U.png",
          movement:MOVE_FLY, diet:DIET_CARNIVORE, repro:REPRO_SEX, hp:180, hunger:100, thirst:100,
          attack:30, defense:12, aggro:12,
          bravery:90, gluttony:80, sociability:20, curiosity:80,
          behavior:BEHAVIOR_TERRITORIAL, ability:ABILITY_VAMPIRISM, abilityPower:1.0, metabolism:METABOLISM_FAST,
          loot:{item:ITEM_STEAK,min:2,max:4,chance:1.0},
          fg:rgb(255,100,80), bg:rgb(60,10,10) },

        // 3. Cavaleiro Imperial
        { name:"Arthur",    title:"Cavaleiro Imperial",  group:"Reino",    skin:"Human_Knight_M.png",
          movement:MOVE_WALK, diet:DIET_OMNIVORE, repro:REPRO_SEX, hp:150, hunger:100, thirst:100,
          attack:22, defense:8, aggro:10,
          bravery:85, gluttony:40, sociability:70, curiosity:50,
          behavior:BEHAVIOR_HERDING, prefFood:"item_bread", prefSpecies:"Cavaleiro Imperial", hatedSpecies:"Goblin Ladrao",
          prefTerrain:FLOOR, bonusMultiplier:1.3,
          loot:{item:ITEM_BREAD,min:1,max:2,chance:0.9},
          fg:rgb(220,220,255), bg:rgb(30,40,70) },

        // 4. Goblin Ladrão
        { name:"Snark",     title:"Goblin Ladrao",       group:"Tribo",    skin:"Creature_Goblin_U.png",
          movement:MOVE_WALK, diet:DIET_OMNIVORE, repro:REPRO_MITOSIS, hp:90, hunger:100, thirst:100,
          attack:14, defense:2, aggro:8,
          bravery:30, gluttony:85, sociability:20, curiosity:90,
          behavior:BEHAVIOR_SCAVENGER, ability:ABILITY_CAMOUFLAGE, abilityPower:1.0, metabolism:METABOLISM_FAST,
          loot:{item:ITEM_FRUIT,min:1,max:2,chance:0.8},
          fg:rgb(120,230,100), bg:rgb(20,50,15) },

        // 5. Gato Místico
        { name:"Felix",     title:"Gato Mistico",        group:"Natureza", skin:"Creature_Cat_U.png",
          movement:MOVE_WALK, diet:DIET_HERBIVORE, repro:REPRO_MITOSIS, hp:80, hunger:100, thirst:100,
          attack:6, defense:1, aggro:6,
          bravery:40, gluttony:50, sociability:60, curiosity:80,
          behavior:BEHAVIOR_PACIFIST, ability:ABILITY_VENOM, abilityPower:1.0, metabolism:METABOLISM_SLOW,
          loot:{item:ITEM_HERB,min:1,max:2,chance:0.6},
          fg:rgb(200,150,255), bg:rgb(40,20,60) },

        // 6. Planta Carnívora
        { name:"Gaia",      title:"Planta Carnivora",    group:"Flora",    skin:"Feature_Tree_Full.png",
          movement:MOVE_NONE, diet:DIET_PHOTOSYNTHESIS, repro:REPRO_SPORE, hp:160, hunger:100, thirst:100,
          isPlant:true, plantFruit:true, fruitInterval:15.0, fruitItemId:"item_fruit",
          ability:ABILITY_REGEN, abilityPower:1.0, loot:{item:ITEM_FRUIT,min:1,max:3,chance:1.0},
          fg:rgb(255,120,180), bg:rgb(50,15,30) }
    ];

    // Spawn 24 entities
    for (var i = 0; i < 24; i++) {
        var spec = specs[i % specs.length];
        var rx = cx + rngInt(-25, 25), ry = cy + rngInt(-25, 25);
        var mov = spec.movement !== undefined ? spec.movement : MOVE_WALK;
        if (mov === MOVE_NONE || isTileWalkable(rx, ry, mov)) {
            var e = spawnEntity(rx, ry, spec);
            if (e) {
                entityAddItem(e, ITEM_BREAD, rngInt(1,3));
                entityAddItem(e, ITEM_WATER, rngInt(1,2));
            }
        }
    }

    // Spawn dropped world items
    var worldItems = [ITEM_BREAD, ITEM_FRUIT, ITEM_WATER, ITEM_HERB, ITEM_STEAK];
    for (var i = 0; i < 25; i++) {
        var rx = cx + rngInt(-25,25), ry = cy + rngInt(-25,25);
        if (isTileWalkable(rx, ry, MOVE_WALK)) {
            spawnDroppedItem(rx, ry, worldItems[i % worldItems.length], rngInt(1,3));
        }
    }

    return { cx: cx, cy: cy };
}
