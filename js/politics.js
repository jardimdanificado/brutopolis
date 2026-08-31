import {
  recordWorldEvent,
  OP_LEADER_CHANGED,
  OP_DIPLOMAT_CHANGED,
  OP_WAR_DECLARED,
  OP_DIPLOMATIC_MISSION,
  OP_ELECTION_HELD
} from "./event_log.js";
import { getEntityById, getCurrentWorld } from "./engine.js";

const POLITICS_TICK_RATE = 100; // Check politics every 100 ticks
let lastPoliticsTick = -9999;
let nextElectionId = 1;
let nextPolEventId = 1;

export const DIPLOMAT_TITLES = [
  "Trade",
  "War",
  "Alliances",
  "Interior",
  "Expansion",
  "Chief Diplomat"
];

function getAllGroups() {
  const world = getCurrentWorld();
  if (!world || !world.groups) return [];
  return world.groups;
}

export function getEntityGender(e) {
  if (!e || !e.properties) return "male";
  if (e.properties.gender) return e.properties.gender;
  if (e.properties.life?.gender) return e.properties.life.gender;
  if (e.properties.genitalia?.genitaliaType === "vagina") return "female";
  if (e.properties.genitalia?.genitaliaType === "penis") return "male";
  if (e.properties.render?.skin && e.properties.render.skin.includes("_F.")) return "female";
  if (e.properties.render?.skin && e.properties.render.skin.includes("_M.")) return "male";
  return "male";
}

function isAlive(id) {
  if (!id) return false;
  const e = getEntityById(id);
  return e && !e.destroyed && e.properties && e.properties.life && !e.properties.life.isDead;
}

function isEligibleCandidate(group, e) {
  if (!e || e.destroyed || !e.properties?.life || e.properties.life.isDead) return false;
  const gender = getEntityGender(e);
  if ((group.govGender === "PATRIARCHAL" || group.govGender === "MACHIST") && gender === "female") return false;
  if ((group.govGender === "MATRIARCHAL" || group.govGender === "FEMIST") && gender === "male") return false;
  return true;
}

function isEligibleVoter(group, e) {
  if (!e || e.destroyed || !e.properties?.life || e.properties.life.isDead) return false;
  const gender = getEntityGender(e);
  // Machist: only males can vote
  if (group.govGender === "MACHIST" && gender !== "male") return false;
  // Femist: only females can vote
  if (group.govGender === "FEMIST" && gender !== "female") return false;
  // Others: all clan members can vote
  return true;
}

function getValidCandidates(group, excludeIds = []) {
  const excludeSet = new Set(excludeIds.filter(Boolean));
  const living = (group.members || []).filter(id => !excludeSet.has(id) && isAlive(id));
  if (living.length === 0) return [];

  const genderFiltered = living.filter(id => {
    const e = getEntityById(id);
    return isEligibleCandidate(group, e);
  });

  // Strict gender regimes (MACHIST, FEMIST): never fall back to opposite gender
  if (group.govGender === "MACHIST" || group.govGender === "FEMIST") {
    return genderFiltered;
  }

  // Soft gender regimes (PATRIARCHAL, MATRIARCHAL, NEUTRAL):
  // Prefer matching gender; if all matching are assigned, use remaining living members
  if (genderFiltered.length > 0) {
    return genderFiltered;
  }
  return living;
}

function getVoterMood(e) {
  if (!e || !e.properties) return 0;
  let mood = 0;
  const life = e.properties.life;
  if (life) {
    const hpRatio = (life.hp || 1) / (life.maxHp || 1);
    if (hpRatio < 0.4) mood -= 35;
    else if (hpRatio > 0.8) mood += 15;

    const energy = life.energy || 2000;
    if (energy < 800) mood -= 35;
    else if (energy > 3000) mood += 20;
  }
  const bladder = e.properties.bladder;
  if (bladder && bladder.level > 1000) mood -= 20;

  if (e.emote === 1) mood -= 40; // Angry
  if (e.emote === 0) mood -= 25; // Sad
  if (e.emote === 2) mood += 30; // Happy

  if (e.properties.aggressive) mood -= 15;
  if (e.properties.brave) mood += 10;

  return Math.max(-100, Math.min(100, mood));
}

function addPoliticalHistoryEntry(group, entry) {
  if (!group.politicalHistory) group.politicalHistory = [];
  group.politicalHistory.unshift({
    id: nextPolEventId++,
    ...entry
  });
  if (group.politicalHistory.length > 80) group.politicalHistory.pop();
}

/**
 * Conducts a full democratic election with mood evaluation, justifications and candidate rankings.
 */
function runElectionSimulation(group, roleType, roleIndex = -1, candidatePool, tick) {
  const eligibleVoterIds = (group.members || []).filter(mId => isEligibleVoter(group, getEntityById(mId)));
  const roleTitle = roleType === "LEADER" ? "High Leader" : `Diplomat (${DIPLOMAT_TITLES[roleIndex] || "General"})`;
  const incumbentId = roleType === "LEADER" ? group.leaderId : (group.diplomats ? group.diplomats[roleIndex] : null);

  if (candidatePool.length === 0 || eligibleVoterIds.length === 0) {
    return null;
  }

  const voteCounts = new Map();
  for (const cid of candidatePool) {
    voteCounts.set(cid, 0);
  }

  const voterDetails = [];
  let blankCount = 0;
  let abstainCount = 0;

  for (const vId of eligibleVoterIds) {
    const voter = getEntityById(vId);
    if (!voter) continue;

    const mood = getVoterMood(voter);
    const voterName = voter.properties?.name || `Citizen #${vId}`;
    const voterSurname = voter.properties?.surname || "";

    // Score all candidates
    const candidateScores = candidatePool.map(cId => {
      const cand = getEntityById(cId);
      if (!cand) return { id: cId, score: -999, isIncumbent: false, cand };

      let score = voter.properties?.brain?.affinities?.[cId] || 0;
      const candSurname = cand.properties?.surname || "";
      const isIncumbent = (cId === incumbentId);

      // Self ambition bonus
      if (cId === vId) score += 45;

      // Family/dynasty bonus
      if (candSurname && candSurname === voterSurname) score += 35;

      // Romantic partner bonus
      if (voter.properties?.partnerId === cId || voter.properties?.spouseId === cId) score += 60;

      // Bad mood spite against incumbent
      if (isIncumbent && mood < -15) {
        score -= Math.abs(mood) * 1.6;
      }

      // Age respect / experience
      const age = cand.properties?.life?.age || 0;
      score += Math.min(25, Math.floor(age / 500));

      return { id: cId, score, isIncumbent, cand, name: cand.properties?.name || `Candidate #${cId}` };
    });

    candidateScores.sort((a, b) => b.score - a.score);
    const top = candidateScores[0];

    // Abstain / Blank check
    if (top.score < -25) {
      if (Math.random() < 0.5) {
        blankCount++;
        voterDetails.push({
          voterId: vId,
          voterName,
          votedForId: null,
          votedForName: "VOTO EM BRANCO",
          isBlank: true,
          isAbstain: false,
          voterMood: mood,
          justification: `Votou em branco por rejeição e descontentamento com todos os candidatos disponíveis.`
        });
      } else {
        abstainCount++;
        voterDetails.push({
          voterId: vId,
          voterName,
          votedForId: null,
          votedForName: "ABSTENÇÃO",
          isBlank: false,
          isAbstain: true,
          voterMood: mood,
          justification: `Absteve-se de votar por apatia política e indiferença com a eleição.`
        });
      }
    } else {
      // Casts vote for top candidate
      voteCounts.set(top.id, (voteCounts.get(top.id) || 0) + 1);
      const chosenCand = top.cand;
      const chosenName = top.name;
      const aff = voter.properties?.brain?.affinities?.[top.id] || 0;
      let reason = "";

      if (top.isIncumbent && mood < -15) {
        reason = `Votou em ${chosenName} mesmo com mau humor (${Math.round(mood)}), pois ainda era a melhor alternativa.`;
      } else if (incumbentId && top.id !== incumbentId && mood < -15) {
        reason = `Votou em ${chosenName} por birra e mau humor (${Math.round(mood)}), votando contra a liderança atual!`;
      } else if (top.id === vId) {
        reason = `Votou em si mesmo(a) por ambição política e confiança na própria capacidade de governo.`;
      } else if (voter.properties?.partnerId === top.id || voter.properties?.spouseId === top.id) {
        reason = `Votou em ${chosenName} por amor, devoção e lealdade conjugal.`;
      } else if (chosenCand?.properties?.surname && chosenCand.properties.surname === voterSurname) {
        reason = `Votou em ${chosenName} por laços familiares e lealdade à linhagem ${voterSurname}.`;
      } else if (aff >= 30) {
        reason = `Votou em ${chosenName} por profunda amizade e alta afinidade pessoal (+${Math.round(aff)} afinidade).`;
      } else if (aff > 0) {
        reason = `Votou em ${chosenName} por considerá-lo(a) um(a) aliado(a) confiável (+${Math.round(aff)} afinidade).`;
      } else {
        reason = `Votou em ${chosenName} como a opção mais equilibrada entre os concorrentes.`;
      }

      voterDetails.push({
        voterId: vId,
        voterName,
        votedForId: top.id,
        votedForName: chosenName,
        isBlank: false,
        isAbstain: false,
        voterMood: mood,
        justification: reason
      });
    }
  }

  // Tally & Ranking
  const totalVotesCast = eligibleVoterIds.length - abstainCount - blankCount;
  const ranking = candidatePool.map(cId => {
    const cand = getEntityById(cId);
    const vCount = voteCounts.get(cId) || 0;
    const pct = totalVotesCast > 0 ? Math.round((vCount / totalVotesCast) * 100) : 0;
    return {
      id: cId,
      name: cand?.properties?.name || `Candidato #${cId}`,
      votes: vCount,
      percent: pct,
      age: cand?.properties?.life?.age || 0
    };
  });

  ranking.sort((a, b) => {
    if (b.votes !== a.votes) return b.votes - a.votes;
    return b.age - a.age; // Tie-breaker by age
  });

  const winner = ranking[0] || null;

  const electionRecord = {
    id: nextElectionId++,
    groupId: group.id,
    groupName: group.name,
    tick,
    roleType,
    roleIndex,
    roleTitle,
    govType: group.govType,
    govGender: group.govGender,
    winnerId: winner ? winner.id : null,
    winnerName: winner ? winner.name : "Ninguém",
    winnerVotes: winner ? winner.votes : 0,
    winnerPercent: winner ? winner.percent : 0,
    ranking,
    totalEligible: eligibleVoterIds.length,
    totalVotesCast,
    blankVotes: blankCount,
    abstentions: abstainCount,
    voterDetails
  };

  if (!group.elections) group.elections = [];
  group.elections.unshift(electionRecord);
  if (group.elections.length > 50) group.elections.pop();

  return electionRecord;
}

function getBestCandidate(candidates) {
  if (candidates.length === 0) return null;
  return candidates.sort((a, b) => {
    const ea = getEntityById(a);
    const eb = getEntityById(b);
    return (eb?.properties?.life?.age || 0) - (ea?.properties?.life?.age || 0);
  })[0];
}

function holdElection(group, type, index = -1, tick) {
  if (type === "LEADER") {
    const candidates = getValidCandidates(group);
    if (candidates.length === 0) return;

    // Monarchy & Autocracy inherit or take oldest, Democracy/Pseudocracy/Presidentialism hold voting
    if (group.govType === "DEMOCRACY" || group.govType === "PSEUDOCRACY" || group.govType === "PRESIDENTIALISM") {
      const elec = runElectionSimulation(group, "LEADER", -1, candidates, tick);
      if (elec && elec.winnerId) {
        group.leaderId = elec.winnerId;
        group.leaderTermTicks = 0;
        const wEnt = getEntityById(elec.winnerId);
        if (wEnt) {
          recordWorldEvent({
            opcode: OP_ELECTION_HELD,
            primaryEntityId: elec.winnerId,
            location: { x: wEnt.x, y: wEnt.y },
            description: `${elec.winnerName} venceu a eleição com ${elec.winnerVotes} votos e assumiu como Líder de ${group.name}.`,
            tick,
            metadata: { groupName: group.name, roleTitle: "High Leader", electionId: elec.id }
          });
          addPoliticalHistoryEntry(group, {
            type: "ELECTION",
            electionId: elec.id,
            title: `Eleição de Alto Líder`,
            description: `${elec.winnerName} eleito(a) com ${elec.winnerVotes} votos (${elec.winnerPercent}% dos válidos).`,
            winnerId: elec.winnerId,
            winnerName: elec.winnerName
          });
        }
        updateTowerOwner(group, 7, elec.winnerId);
      }
    } else {
      // Direct succession (Monarchy/Autocracy/Communism)
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
            description: `${wEnt.properties?.name || "Novo Líder"} assumiu o comando de ${group.name} (${group.govType}).`,
            tick,
            metadata: { groupName: group.name }
          });
          addPoliticalHistoryEntry(group, {
            type: "LEADER_CHANGE",
            title: `Sucessão de Liderança`,
            description: `${wEnt.properties?.name || "Líder"} assumiu a liderança (${group.govType}).`,
            winnerId: winner,
            winnerName: wEnt.properties?.name
          });
        }
        updateTowerOwner(group, 7, winner);
      }
    }
  } else if (type === "DIPLOMAT") {
    const otherDips = (group.diplomats || []).filter((d, i) => i !== index && d);
    const dipCandidates = getValidCandidates(group, [group.leaderId, ...otherDips]);
    if (dipCandidates.length === 0) return;

    if (group.govType === "DEMOCRACY" || group.govType === "PSEUDOCRACY") {
      const elec = runElectionSimulation(group, "DIPLOMAT", index, dipCandidates, tick);
      if (elec && elec.winnerId) {
        group.diplomats[index] = elec.winnerId;
        group.diplomatTermTicks[index] = 0;
        const wEnt = getEntityById(elec.winnerId);
        if (wEnt) {
          recordWorldEvent({
            opcode: OP_ELECTION_HELD,
            primaryEntityId: elec.winnerId,
            location: { x: wEnt.x, y: wEnt.y },
            description: `${elec.winnerName} foi eleito(a) como Diplomata (${DIPLOMAT_TITLES[index]}) de ${group.name}.`,
            tick,
            metadata: { groupName: group.name, roleTitle: `Diplomata (${DIPLOMAT_TITLES[index]})`, electionId: elec.id }
          });
          addPoliticalHistoryEntry(group, {
            type: "ELECTION",
            electionId: elec.id,
            title: `Eleição de Diplomata (${DIPLOMAT_TITLES[index]})`,
            description: `${elec.winnerName} eleito(a) para o posto de diplomacia com ${elec.winnerVotes} votos.`,
            winnerId: elec.winnerId,
            winnerName: elec.winnerName
          });
        }
        updateTowerOwner(group, index + 1, elec.winnerId);
      }
    } else if (group.govType === "PRESIDENTIALISM" || group.govType === "COMMUNISM" || group.govType === "MONARCHY") {
      fillVacantDiplomat(group, index, tick);
    }
  }
}

function fillVacantDiplomat(group, index, tick) {
  const otherDips = (group.diplomats || []).filter((d, i) => i !== index && d);
  const candidates = getValidCandidates(group, [group.leaderId, ...otherDips]);
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
        description: `${wEnt.properties?.name || "Diplomata"} foi nomeado(a) como Diplomata (${DIPLOMAT_TITLES[index]}) de ${group.name}.`,
        tick,
        metadata: { groupName: group.name }
      });
      addPoliticalHistoryEntry(group, {
        type: "DIPLOMAT_CHANGE",
        title: `Nomeação de Diplomata`,
        description: `${wEnt.properties?.name || "Diplomata"} nomeado(a) para ${DIPLOMAT_TITLES[index]}.`,
        winnerId: winner,
        winnerName: wEnt.properties?.name
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
    // Democracy / Pseudocracy / Presidentialism hold emergency succession election
    holdElection(group, "LEADER", -1, tick);
    return;
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
        description: `${e.properties?.name || "Novo Líder"} assumiu a liderança de ${group.name} após a morte do líder anterior.`,
        tick,
        metadata: { groupName: group.name }
      });
      addPoliticalHistoryEntry(group, {
        type: "LEADER_DEATH",
        title: `Morte do Líder & Sucessão`,
        description: `${e.properties?.name || "Novo Líder"} ascendeu ao poder após a morte do líder anterior.`,
        winnerId: newLeader,
        winnerName: e.properties?.name
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
      if (Array.isArray(e.properties.house.floors)) {
        const floor = e.properties.house.floors.find(f => f.floorNumber === floorNum);
        if (floor) {
          floor.ownerId = newOwnerId;
          const owner = getEntityById(newOwnerId);
          floor.ownerName = owner?.properties?.name || null;
        }
      }
      break;
    }
  }
}

function processDiplomaticMissions(group, tick) {
  let activeDiplomats = (group.diplomats || []).filter(d => d && isAlive(d));
  if (group.govType === "AUTOCRACY" && group.leaderId && isAlive(group.leaderId) && !activeDiplomats.includes(group.leaderId)) {
    activeDiplomats = [group.leaderId, ...activeDiplomats];
  }
  if (!group.relations) group.relations = {};
  
  for (const dipId of activeDiplomats) {
    if (!dipId || !isAlive(dipId)) continue;
    
    if (Math.random() < 0.01) {
      const allGroups = getAllGroups().filter(g => g.id !== group.id && g.members && g.members.length > 0);
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
        const desc = `${dipEnt.properties?.name || "Diplomata"} realizou uma missão diplomática melhorando a relação com ${targetGroup.name}.`;
        recordWorldEvent({
          opcode: OP_DIPLOMATIC_MISSION,
          primaryEntityId: dipId,
          location: { x: dipEnt.x, y: dipEnt.y },
          description: desc,
          tick,
          metadata: { groupName: group.name, targetName: targetGroup.name }
        });
        addPoliticalHistoryEntry(group, {
          type: "DIPLOMATIC_MISSION",
          title: `Missão Diplomática`,
          description: desc,
          targetGroupId: targetGroup.id,
          targetGroupName: targetGroup.name
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
          
          const desc = `As tensões explodiram! ${group.name} declarou GUERRA contra ${targetGroup.name}.`;
          recordWorldEvent({
            opcode: OP_WAR_DECLARED,
            primaryEntityId: group.leaderId,
            secondaryEntityId: targetGroup.leaderId,
            location: { x: 0, y: 0 },
            description: desc,
            tick,
            metadata: { groupName: group.name, targetName: targetGroup.name }
          });
          addPoliticalHistoryEntry(group, {
            type: "WAR_DECLARED",
            title: `Declaração de Guerra`,
            description: desc,
            targetGroupId: targetGroup.id,
            targetGroupName: targetGroup.name
          });
        }
      }
    }
  }
}

function annexRuins(group, tick) {
  const world = getCurrentWorld();
  if (!world || !world.ruinedZones || world.ruinedZones.length === 0) return;

  for (const mId of (group.members || [])) {
    const e = getEntityById(mId);
    if (!e || e.destroyed || e.properties?.life?.isDead) continue;
    
    const currentZone = `${Math.floor(e.x / 8)}_${Math.floor(e.y / 8)}`;
    const ruinIdx = world.ruinedZones.indexOf(currentZone);
    if (ruinIdx !== -1) {
      world.ruinedZones.splice(ruinIdx, 1);
      if (!group.claimedZones) group.claimedZones = [];
      if (!group.claimedZones.includes(currentZone)) {
        group.claimedZones.push(currentZone);
        
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
        
        const desc = `O clã ${group.name} encontrou ruínas antigas e anexou a zona [${currentZone}] ao seu território!`;
        recordWorldEvent({
          opcode: OP_DIPLOMATIC_MISSION,
          primaryEntityId: e.id,
          location: { x: e.x, y: e.y },
          description: desc,
          tick,
          metadata: { groupName: group.name }
        });
        addPoliticalHistoryEntry(group, {
          type: "RUINS_ANNEXED",
          title: `Território Anexado`,
          description: desc
        });
      }
    }
  }
}

function handleGroupDissolution(group, tick) {
  group.dissolved = true;
  const world = getCurrentWorld();

  const wasAtWar = group.wars && group.wars.length > 0;
  
  if (!wasAtWar && world) {
    if (!world.ruinedZones) world.ruinedZones = [];
    world.ruinedZones.push(...(group.claimedZones || []));
    
    if (world.entities) {
      for (const e of world.entities) {
        if (e && !e.destroyed && e.properties?.groupId === group.id) {
          if (e.properties.house?.isLeaderHouse) {
            e.properties.name = "Escombros do Palácio";
            if (e.properties.structure) e.properties.structure.condition = 0;
            if (e.properties.render) {
              e.properties.render.skin = "Feature_Rocks_Small.png";
            }
          }
        }
      }
    }

    const desc = `O clã ${group.name} foi totalmente dizimado por causas naturais e suas terras agora são RUÍNAS. A Torre da Política desmoronou em escombros.`;
    recordWorldEvent({
      opcode: OP_LEADER_CHANGED,
      primaryEntityId: group.leaderId,
      location: { x: 0, y: 0 },
      description: desc,
      tick,
      metadata: { groupName: group.name }
    });
    addPoliticalHistoryEntry(group, {
      type: "DISSOLUTION",
      title: `Dissolução do Clã`,
      description: desc
    });
  }
}

export function updatePolitics(dt, globalTick) {
  if (globalTick - lastPoliticsTick < POLITICS_TICK_RATE) return;
  lastPoliticsTick = globalTick;

  const groups = getAllGroups();
  if (!groups || groups.length === 0) return;

  for (const group of groups) {
    // 0. Retroactive Initialization for Old Saves (EVEN IF DISSOLVED)
    if (!group.govType) {
      const govTypes = ["DEMOCRACY", "PSEUDOCRACY", "PRESIDENTIALISM", "COMMUNISM", "MONARCHY", "AUTOCRACY"];
      group.govType = govTypes[Math.floor(Math.random() * govTypes.length)];
    }
    if (!group.govGender) {
      const govGenders = ["PATRIARCHAL", "MATRIARCHAL", "NEUTRAL", "MACHIST", "FEMIST"];
      group.govGender = govGenders[Math.floor(Math.random() * govGenders.length)];
    }
    if (!group.diplomats) group.diplomats = [null, null, null, null, null, null];
    if (!group.relations) group.relations = {};
    if (!group.wars) group.wars = [];
    if (group.leaderTermTicks === undefined) group.leaderTermTicks = 0;
    if (!group.diplomatTermTicks) group.diplomatTermTicks = [0, 0, 0, 0, 0, 0];
    if (!group.elections) group.elections = [];
    if (!group.politicalHistory) group.politicalHistory = [];

    if (group.dissolved) continue;

    const livingCount = (group.members || []).filter(m => isAlive(m)).length;
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

    if (group.govType === "AUTOCRACY") {
      group.diplomats = [group.leaderId, group.leaderId, group.leaderId, group.leaderId, group.leaderId, group.leaderId];
    }

    for (let i = 0; i < 6; i++) {
      group.diplomatTermTicks[i] += POLITICS_TICK_RATE;
      
      if (group.govType === "AUTOCRACY") {
        group.diplomats[i] = group.leaderId;
      } else {
        // 7 days = 7 * 2400 ticks = 16800 ticks (Scheduled elections)
        if (group.govType === "DEMOCRACY" || group.govType === "PSEUDOCRACY") {
          if (group.diplomatTermTicks[i] >= 16800) {
            group.diplomatTermTicks[i] = 0;
            holdElection(group, "DIPLOMAT", i, globalTick);
          }
        }

        // Vacate on death and hold emergency election if candidates exist
        if (!group.diplomats[i] || !isAlive(group.diplomats[i])) {
          group.diplomats[i] = null;
          const otherDips = (group.diplomats || []).filter((d, idx) => idx !== i && d);
          const availableCandidates = getValidCandidates(group, [group.leaderId, ...otherDips]);

          if (availableCandidates.length > 0) {
            if (group.govType === "DEMOCRACY" || group.govType === "PSEUDOCRACY") {
              holdElection(group, "DIPLOMAT", i, globalTick);
            } else {
              fillVacantDiplomat(group, i, globalTick);
            }
          }
        }
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
