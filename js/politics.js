import { recordWorldEvent, OP_LEADER_CHANGED, OP_DIPLOMAT_CHANGED, OP_WAR_DECLARED, OP_DIPLOMATIC_MISSION } from "./event_log.js";
import { getEntityById, getCurrentWorld } from "./engine.js";

const POLITICS_TICK_RATE = 100; // Check politics every 100 ticks
let lastPoliticsTick = -9999;

function getAllGroups() {
  const world = getCurrentWorld();
  if (!world || !world.groups) return [];
  return world.groups;
}

export function updatePolitics(dt, globalTick) {
  if (globalTick - lastPoliticsTick < POLITICS_TICK_RATE) return;
  lastPoliticsTick = globalTick;

  const groups = getAllGroups();
  if (!groups || groups.length === 0) {
    // Record event to show we found no groups
    recordWorldEvent({ opcode: 999, tick: globalTick, description: "POLITICS: No groups found!" });
    return;
  }
  
  for (const group of groups) {
    // 0. Retroactive Initialization for Old Saves (EVEN IF DISSOLVED)
    if (!group.govType) {
      const govTypes = ["DEMOCRACY", "PSEUDOCRACY", "PRESIDENTIALISM", "COMMUNISM", "MONARCHY", "AUTOCRACY"];
      group.govType = govTypes[Math.floor(Math.random() * govTypes.length)];
      recordWorldEvent({ opcode: 999, tick: globalTick, description: `POLITICS: Initialized govType for ${group.name} to ${group.govType}` });
    }
    if (!group.govGender) {
      const govGenders = ["PATRIARCHAL", "MATRIARCHAL", "NEUTRAL"];
      group.govGender = govGenders[Math.floor(Math.random() * govGenders.length)];
    }
    if (!group.diplomats) group.diplomats = [null, null, null, null, null, null];
    if (!group.relations) group.relations = {};
    if (!group.wars) group.wars = [];
    if (group.leaderTermTicks === undefined) group.leaderTermTicks = 0;
    if (!group.diplomatTermTicks) group.diplomatTermTicks = [0, 0, 0, 0, 0, 0];

    if (group.dissolved) continue;

    const livingCount = group.members.filter(m => isAlive(m)).length;
    if (livingCount === 0) {
      handleGroupDissolution(group, globalTick);
      continue;
    }

    // 1. Process terms
    group.leaderTermTicks += POLITICS_TICK_RATE;
    if (group.govType !== "COMMUNISM" && group.govType !== "MONARCHY" && group.govType !== "AUTOCRACY") {
      // 14 days = 14 * 2400 ticks = 33600 ticks
      if (group.leaderTermTicks >= 33600) {
        group.leaderTermTicks = 0;
        holdElection(group, "LEADER", -1, globalTick);
      }
    }

    for (let i = 0; i < 6; i++) {
      group.diplomatTermTicks[i] += POLITICS_TICK_RATE;
      
      // 7 days = 7 * 2400 ticks = 16800 ticks
      if (group.govType !== "COMMUNISM" && group.govType !== "MONARCHY" && group.govType !== "AUTOCRACY") {
        if (group.diplomatTermTicks[i] >= 16800) {
          group.diplomatTermTicks[i] = 0;
          holdElection(group, "DIPLOMAT", i, globalTick);
        }
      }

      // Fill empty spots if autocracy doesn't apply
      if (group.govType !== "AUTOCRACY" && (!group.diplomats[i] || !isAlive(group.diplomats[i]))) {
        fillVacantDiplomat(group, i, globalTick);
      }
    }

    if (!isAlive(group.leaderId)) {
      handleLeaderDeath(group, globalTick);
    }

    // 2. Diplomatic Missions (Increase relations)
    processDiplomaticMissions(group, globalTick);

    // 3. War Declaration (Estopim)
    processWarDeclarations(group, groups, globalTick);

    // 4. Annex Ruins
    annexRuins(group, globalTick);
  }
}

function annexRuins(group, tick) {
  const world = getCurrentWorld();
  if (!world || !world.ruinedZones || world.ruinedZones.length === 0) return;

  for (const mId of group.members) {
    const e = getEntityById(mId);
    if (!e || e.destroyed || e.properties?.life?.isDead) continue;
    
    const currentZone = `${Math.floor(e.x / 8)}_${Math.floor(e.y / 8)}`;
    const ruinIdx = world.ruinedZones.indexOf(currentZone);
    if (ruinIdx !== -1) {
      world.ruinedZones.splice(ruinIdx, 1);
      if (!group.claimedZones) group.claimedZones = [];
      if (!group.claimedZones.includes(currentZone)) {
        group.claimedZones.push(currentZone);
        
        // Re-assign buildings in this zone to the new group
        if (world.entities) {
          for (const ent of world.entities) {
            if (ent && !ent.destroyed && ent.properties && ent.properties.groupId) {
              const ez = `${Math.floor(ent.x / 8)}_${Math.floor(ent.y / 8)}`;
              if (ez === currentZone && ent.properties.groupId !== group.id) {
                ent.properties.groupId = group.id;
                if (ent.properties.render) {
                  ent.properties.render.color = group.color;
                  ent.properties.render.backcolor = group.backcolor;
                }
              }
            }
          }
        }
        
        recordWorldEvent({
          opcode: OP_DIPLOMATIC_MISSION,
          primaryEntityId: e.id,
          location: { x: e.x, y: e.y },
          description: `O clã ${group.name} encontrou ruínas antigas e anexou a zona [${currentZone}] ao seu território!`,
          tick,
          metadata: { groupName: group.name }
        });
      }
    }
  }
}

function isAlive(id) {
  if (!id) return false;
  const e = getEntityById(id);
  return e && e.properties && e.properties.life && !e.properties.life.isDead;
}

function getValidCandidates(group) {
  let candidates = group.members.filter(id => {
    const e = getEntityById(id);
    return e && e.properties && e.properties.life && !e.properties.life.isDead;
  });

  // Try to enforce gender rule
  const genderFiltered = candidates.filter(id => {
    const e = getEntityById(id);
    if (group.govGender === "PATRIARCHAL" && e.properties.life.gender === "female") return false;
    if (group.govGender === "MATRIARCHAL" && e.properties.life.gender === "male") return false;
    return true;
  });

  if (genderFiltered.length > 0) {
    candidates = genderFiltered;
  }

  return candidates;
}

function getBestCandidate(candidates) {
  if (candidates.length === 0) return null;
  // Simplified election: pick the oldest valid candidate for now
  return candidates.sort((a, b) => {
    const ea = getEntityById(a);
    const eb = getEntityById(b);
    return eb.properties.life.age - ea.properties.life.age;
  })[0];
}

function holdElection(group, type, index = -1, tick) {
  const candidates = getValidCandidates(group);
  if (candidates.length === 0) return;

  if (type === "LEADER") {
    const winner = getBestCandidate(candidates);
    if (winner && winner !== group.leaderId) {
      group.leaderId = winner;
      group.leaderTermTicks = 0;
      const wEnt = getEntityById(winner);
      if (wEnt) {
        recordWorldEvent({
          opcode: OP_LEADER_CHANGED,
          primaryEntityId: winner,
          location: { x: wEnt.x, y: wEnt.y },
          description: `${wEnt.name} foi eleito(a) como novo(a) Líder de ${group.name}.`,
          tick,
          metadata: { groupName: group.name }
        });
      }
      updateTowerOwner(group, 7, winner);
    }
  } else if (type === "DIPLOMAT") {
    if (group.govType === "DEMOCRACY" || group.govType === "PSEUDOCRACY") {
      const winner = getBestCandidate(candidates.filter(c => c !== group.leaderId && !group.diplomats.includes(c)));
      if (winner) {
        group.diplomats[index] = winner;
        group.diplomatTermTicks[index] = 0;
        const wEnt = getEntityById(winner);
        if (wEnt) {
          recordWorldEvent({
            opcode: OP_DIPLOMAT_CHANGED,
            primaryEntityId: winner,
            location: { x: wEnt.x, y: wEnt.y },
            description: `${wEnt.name} foi eleito(a) como Diplomata de ${group.name}.`,
            tick,
            metadata: { groupName: group.name }
          });
        }
        updateTowerOwner(group, index + 1, winner);
      }
    } else if (group.govType === "PRESIDENTIALISM") {
      fillVacantDiplomat(group, index, tick);
    }
  }
}

function fillVacantDiplomat(group, index, tick) {
  const candidates = getValidCandidates(group).filter(c => c !== group.leaderId && !group.diplomats.includes(c));
  if (candidates.length === 0) return;

  const winner = getBestCandidate(candidates);
  group.diplomats[index] = winner;
  group.diplomatTermTicks[index] = 0;
  
  if (winner) {
    const wEnt = getEntityById(winner);
    if (wEnt) {
      recordWorldEvent({
        opcode: OP_DIPLOMAT_CHANGED,
        primaryEntityId: winner,
        location: { x: wEnt.x, y: wEnt.y },
        description: `${wEnt.name} foi nomeado(a) como Diplomata de ${group.name}.`,
        tick,
        metadata: { groupName: group.name }
      });
    }
    updateTowerOwner(group, index + 1, winner);
  }
}

function handleLeaderDeath(group, tick) {
  const candidates = getValidCandidates(group);
  if (candidates.length === 0) return; 

  let newLeader = null;

  if (group.govType === "MONARCHY") {
    newLeader = group.diplomats[5] || getBestCandidate(candidates);
  } else if (group.govType === "AUTOCRACY") {
    newLeader = getBestCandidate(candidates);
  } else if (group.govType === "COMMUNISM") {
    newLeader = group.diplomats[5] || getBestCandidate(candidates);
    for (let i = 5; i > 0; i--) {
      group.diplomats[i] = group.diplomats[i - 1];
      if (group.diplomats[i]) updateTowerOwner(group, i + 1, group.diplomats[i]);
    }
    group.diplomats[0] = null;
    fillVacantDiplomat(group, 0, tick);
  } else {
    newLeader = getBestCandidate(candidates);
  }

  if (newLeader) {
    group.leaderId = newLeader;
    group.leaderTermTicks = 0;
    const e = getEntityById(newLeader);
    if (e) {
      recordWorldEvent({
        opcode: OP_LEADER_CHANGED,
        primaryEntityId: newLeader,
        location: { x: e.x, y: e.y },
        description: `${e.name} assumiu a liderança de ${group.name} após a morte do líder anterior.`,
        tick,
        metadata: { groupName: group.name }
      });
      updateTowerOwner(group, 7, newLeader);
    }
  }
}

function updateTowerOwner(group, floorNum, newOwnerId) {
  const world = getCurrentWorld();
  if (!world || !world.entities) return;

  for (const e of world.entities) {
    if (e && e.properties && e.properties.house && e.properties.house.isLeaderHouse && e.properties.groupId === group.id) {
      const floor = e.properties.house.floors.find(f => f.floorNumber === floorNum);
      if (floor) {
        floor.ownerId = newOwnerId;
        const owner = getEntityById(newOwnerId);
        floor.ownerName = owner ? owner.name : null;
      }
      break;
    }
  }
}

function processDiplomaticMissions(group, tick) {
  let activeDiplomats = group.govType === "AUTOCRACY" ? [group.leaderId] : group.diplomats;
  if (!group.relations) group.relations = {};
  
  for (const dipId of activeDiplomats) {
    if (!dipId || !isAlive(dipId)) continue;
    
    if (Math.random() < 0.01) {
      const allGroups = getAllGroups().filter(g => g.id !== group.id && g.members.length > 0);
      if (allGroups.length === 0) continue;

      const targetGroup = allGroups[Math.floor(Math.random() * allGroups.length)];
      
      let currentRel = group.relations[targetGroup.id] || 0;
      currentRel += Math.floor(Math.random() * 10) + 5;
      currentRel = Math.min(100, currentRel);
      group.relations[targetGroup.id] = currentRel;
      
      if (!targetGroup.relations) targetGroup.relations = {};
      targetGroup.relations[group.id] = (targetGroup.relations[group.id] || 0) + 5;
      
      const dipEnt = getEntityById(dipId);
      if (dipEnt) {
        recordWorldEvent({
          opcode: OP_DIPLOMATIC_MISSION,
          primaryEntityId: dipId,
          location: { x: dipEnt.x, y: dipEnt.y },
          description: `${dipEnt.name} realizou uma missão diplomática melhorando a relação com ${targetGroup.name}.`,
          tick,
          metadata: { groupName: group.name, targetName: targetGroup.name }
        });
      }
    }
  }
}

function processWarDeclarations(group, allGroups, tick) {
  if (!group.relations) return;
  if (!group.wars) group.wars = [];

  for (const [targetId, score] of Object.entries(group.relations)) {
    const tid = Number(targetId);
    if (score < -50 && !group.wars.includes(tid)) {
      if (Math.random() < 0.005) {
        group.wars.push(tid);
        const targetGroup = allGroups.find(g => g.id === tid);
        if (targetGroup) {
          if (!targetGroup.wars) targetGroup.wars = [];
          if (!targetGroup.wars.includes(group.id)) targetGroup.wars.push(group.id);
          
          recordWorldEvent({
            opcode: OP_WAR_DECLARED,
            primaryEntityId: group.leaderId,
            secondaryEntityId: targetGroup.leaderId,
            location: { x: 0, y: 0 },
            description: `As tensões explodiram! ${group.name} declarou GUERRA contra ${targetGroup.name}.`,
            tick,
            metadata: { groupName: group.name, targetName: targetGroup.name }
          });
        }
      }
    }
  }
}

function handleGroupDissolution(group, tick) {
  group.dissolved = true;
  const world = getCurrentWorld();

  // Determine if dissolved due to war (already handled by engine, but just in case)
  // Or dissolved naturally (starvation, etc.)
  // The user says: "se um grupo se dissolver sem estar em guerra com ninguem, as zonas e estruturas deles devem entrar em um modo "ruina""
  
  const wasAtWar = group.wars && group.wars.length > 0;
  
  if (!wasAtWar) {
    if (!world.ruinedZones) world.ruinedZones = [];
    world.ruinedZones.push(...(group.claimedZones || []));
    
    // Convert Leader Tower to Rubble
    if (world.entities) {
      for (const e of world.entities) {
        if (e && !e.destroyed && e.properties?.groupId === group.id) {
          if (e.properties.house?.isLeaderHouse) {
            e.properties.name = "Escombros do Palácio";
            e.properties.structure.condition = 0;
            if (e.properties.render) {
              e.properties.render.skin = "Feature_Rocks_Small.png";
            }
          }
        }
      }
    }

    recordWorldEvent({
      opcode: OP_LEADER_CHANGED,
      primaryEntityId: group.leaderId,
      location: { x: 0, y: 0 },
      description: `O clã ${group.name} foi totalmente dizimado por causas naturais e suas terras agora são RUÍNAS. A Torre da Política desmoronou em escombros.`,
      tick,
      metadata: { groupName: group.name }
    });
  }
}
