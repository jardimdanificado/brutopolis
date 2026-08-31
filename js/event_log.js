// =============================================================================
// Brutopolis — Chronological & Compact Indexed World Event Log (Bytecode Architecture)
// =============================================================================

import { currentWorld } from "./engine.js";

// Opcode constants for ultra-compact event representation
export const OP_BIRTH = 1;
export const OP_DEATH = 2;
export const OP_ATTACK = 3;
export const OP_AMPUTATION = 4;
export const OP_FEED = 5;
export const OP_SPROUT = 6;
export const OP_RELATION = 7;
export const OP_DIALOGUE = 8;
export const OP_HUG = 9;
export const OP_KISS = 10;
export const OP_PRAISE = 11;
export const OP_INSULT = 12;
export const OP_SPIT = 13;
export const OP_SHOVE = 14;
export const OP_HUMILIATE = 15;
export const OP_PROPOSAL_ACCEPTED = 16;
export const OP_PROPOSAL_REJECTED = 17;
export const OP_LIE = 18;
export const OP_MINE = 19;
export const OP_CHOP = 20;
export const OP_BUILD = 21;
export const OP_PICKUP = 22;
export const OP_DROP = 23;
export const OP_CRAFT = 24;
export const OP_PLANT = 25;
export const OP_HARVEST = 26;
export const OP_FORGET = 27;

export const OPCODE_TO_TYPE = {
  [OP_BIRTH]: "BIRTH",
  [OP_DEATH]: "DEATH",
  [OP_ATTACK]: "ATTACK",
  [OP_AMPUTATION]: "AMPUTATION",
  [OP_FEED]: "FEED",
  [OP_SPROUT]: "SPROUT",
  [OP_RELATION]: "RELATION",
  [OP_DIALOGUE]: "DIALOGUE",
  [OP_HUG]: "RELATION",
  [OP_KISS]: "RELATION",
  [OP_PRAISE]: "DIALOGUE",
  [OP_INSULT]: "DIALOGUE",
  [OP_SPIT]: "ATTACK",
  [OP_SHOVE]: "ATTACK",
  [OP_HUMILIATE]: "DIALOGUE",
  [OP_PROPOSAL_ACCEPTED]: "RELATION",
  [OP_PROPOSAL_REJECTED]: "RELATION",
  [OP_LIE]: "LIE",
  [OP_MINE]: "MINE",
  [OP_CHOP]: "CHOP",
  [OP_BUILD]: "BUILD",
  [OP_PICKUP]: "PICKUP",
  [OP_DROP]: "DROP",
  [OP_CRAFT]: "CRAFT",
  [OP_PLANT]: "PLANT",
  [OP_HARVEST]: "HARVEST",
  [OP_FORGET]: "FORGET"
};

export const TYPE_TO_OPCODE = {
  "BIRTH": OP_BIRTH,
  "DEATH": OP_DEATH,
  "KILL": OP_DEATH,
  "ATTACK": OP_ATTACK,
  "AMPUTATION": OP_AMPUTATION,
  "FEED": OP_FEED,
  "SPROUT": OP_SPROUT,
  "RELATION": OP_RELATION,
  "DIALOGUE": OP_DIALOGUE,
  "LIE": OP_LIE,
  "MINE": OP_MINE,
  "CHOP": OP_CHOP,
  "BUILD": OP_BUILD,
  "PICKUP": OP_PICKUP,
  "DROP": OP_DROP,
  "CRAFT": OP_CRAFT,
  "PLANT": OP_PLANT,
  "HARVEST": OP_HARVEST,
  "FORGET": OP_FORGET
};

export let eventLogConfig = {
  maxWorldEvents: 0, // 0 = Unlimited
  maxCreatureEvents: 0 // 0 = Unlimited
};

export function setEventLogConfig(cfg) {
  if (cfg) Object.assign(eventLogConfig, cfg);
}

let nextEventId = 1;
export const allEvents = [];
export const eventsById = new Map();
export const eventsByEntity = new Map();
export const eventsByType = new Map();
export const eventsByCitedEvent = new Map();

export function indexEntityEvent(entId, eventId) {
  if (entId === null || entId === undefined) return;
  const n = Number(entId);
  if (!isNaN(n)) {
    if (!eventsByEntity.has(n)) eventsByEntity.set(n, []);
    const list = eventsByEntity.get(n);
    list.push(eventId);
    if (eventLogConfig.maxCreatureEvents > 0 && list.length > eventLogConfig.maxCreatureEvents * 1.5) {
      list.splice(0, list.length - eventLogConfig.maxCreatureEvents);
    }
  }
  const s = String(entId);
  if (s !== String(n) || isNaN(n)) {
    if (!eventsByEntity.has(s)) eventsByEntity.set(s, []);
    eventsByEntity.get(s).push(eventId);
  }
}

/**
 * Formats a human-readable event description dynamically from its bytecode / opcode payload
 */
export function formatEventDescription(ev) {
  if (ev._rawDescription) return ev._rawDescription;

  const pName = ev.metadata?.primaryName || (ev.primaryEntityId ? `Entity #${ev.primaryEntityId}` : "World");
  const sName = ev.metadata?.secondaryName || (ev.secondaryEntityId ? `Entity #${ev.secondaryEntityId}` : "");
  const locStr = ev.location ? ` [X: ${ev.location.x}, Y: ${ev.location.y}]` : "";

  switch (ev.opcode) {
    case OP_LIE: {
      if (ev.metadata?.narrative) return `${ev.metadata.narrative}${locStr}`;
      const lieType = ev.metadata?.lieType;
      const act = ev.metadata?.actionDesc || "committed a grave deed";
      if (lieType === "FRAME_JOB") {
        return `${pName} fabricated a lie framing ${sName} for ${act}!${locStr}`;
      } else if (lieType === "FABRICATED_MURDER") {
        return `${pName} falsely accused ${sName} of murder!${locStr}`;
      } else if (lieType === "FABRICATED_DEATH") {
        return `${pName} spread a false rumor claiming that ${sName} had died!${locStr}`;
      } else if (lieType === "FABRICATED_BIRTH") {
        return `${pName} spread a rumor that a secret child was born to ${sName}!${locStr}`;
      } else if (lieType === "FABRICATED_ATTACK") {
        return `${pName} falsely claimed that ${sName} attacked them in secret!${locStr}`;
      }
      return `${pName} told a fabricated lie about ${sName}!${locStr}`;
    }
    case OP_HUG:
      return ev.metadata?.rejected
        ? `${pName} attempted to hug ${sName}, but was pushed away and rejected!${locStr}`
        : `${pName} hugged ${sName}, sharing a warm embrace!${locStr}`;
    case OP_KISS:
      return ev.metadata?.rejected
        ? `${pName} leaned in to kiss ${sName}, but was firmly rejected!${locStr}`
        : `${pName} kissed ${sName} tenderly, deepening their romantic bond!${locStr}`;
    case OP_PRAISE:
      return ev.metadata?.rejected
        ? `${pName} praised ${sName}, but the compliment was dismissed with skepticism!${locStr}`
        : `${pName} praised and complimented ${sName}, boosting their spirits!${locStr}`;
    case OP_INSULT:
      return `${pName} hurled harsh insults and curses at ${sName}!${locStr}`;
    case OP_SPIT:
      return `${pName} spat disrespectfully in the face of ${sName}!${locStr}`;
    case OP_SHOVE:
      return `${pName} aggressively shoved ${sName} backward!${locStr}`;
    case OP_HUMILIATE:
      return `${pName} publicly humiliated and mocked ${sName}, leaving them distraught!${locStr}`;
    case OP_PROPOSAL_ACCEPTED:
      return `${pName} proposed a courtship to ${sName}, and they joyfully became a bonded couple! ❤️${locStr}`;
    case OP_PROPOSAL_REJECTED:
      return `${pName} confessed love and proposed to ${sName}, but was painfully rejected and left heartbroken!${locStr}`;
    case OP_BIRTH:
      return `${pName} gave birth to a healthy newborn: ${sName}!${locStr}`;
    case OP_DEATH:
      return `${pName} succumbed to wounds and perished.${locStr}`;
    case OP_AMPUTATION:
      return `${pName}'s ${ev.metadata?.partName || "limb"} was severed in combat by ${sName}!${locStr}`;
    case OP_ATTACK: {
      const countStr = ev.count > 1 ? ` (${ev.count}x)` : "";
      const dmgStr = ev.metadata?.totalDamage ? ` dealing ${Math.round(ev.metadata.totalDamage)} damage` : "";
      const hitPart = ev.metadata?.hitPartName ? ` hitting ${ev.metadata.hitPartName}` : "";
      return `${pName} attacked ${sName}${countStr}${hitPart}${dmgStr}!${locStr}`;
    }
    case OP_MINE:
      return `${pName} mined stone from a rocky boulder!${locStr}`;
    case OP_CHOP:
      return `${pName} felled a tree and harvested timber!${locStr}`;
    case OP_BUILD: {
      const struct = ev.metadata?.structureName || "Stone Wall";
      if (struct.toLowerCase().includes("house") || struct.toLowerCase().includes("casa")) {
        return `${pName} constructed a private home (${struct})!${locStr}`;
      } else if (struct.toLowerCase().includes("gate") || struct.toLowerCase().includes("portão") || struct.toLowerCase().includes("door")) {
        return `${pName} constructed a protective ${struct}!${locStr}`;
      }
      return `${pName} constructed a ${struct} fortification!${locStr}`;
    }
    case OP_PICKUP:
      return `${pName} picked up ${ev.metadata?.itemName || "an item"} from the ground.${locStr}`;
    case OP_DROP:
      return `${pName} hauled and placed ${ev.metadata?.itemName || "an item"} down.${locStr}`;
    case OP_CRAFT:
      return `${pName} crafted ${ev.metadata?.craftedItem || "a new tool/item"}!${locStr}`;
    case OP_PLANT:
      return `${pName} planted a ${ev.metadata?.seedSpecies || "flora"} seed in fertile soil.${locStr}`;
    case OP_HARVEST:
      return `${pName} harvested fresh ${ev.metadata?.cropName || "fruit"} from the wild.${locStr}`;
    case OP_FORGET:
      return `${pName} experienced memory loss due to cognitive decline (${ev.metadata?.forgottenType || "memories"}).${locStr}`;
    case OP_DIALOGUE: {
      if (ev.metadata?.text) return `${ev.metadata.text}${locStr}`;
      return `${pName} conversed with ${sName}.${locStr}`;
    }
    default:
      return ev.metadata?.text || `${pName} participated in ${ev.type} event.${locStr}`;
  }
}

/**
 * Resets event logs and indexes (e.g. on new world generation)
 */
export function resetWorldEvents() {
  nextEventId = 1;
  allEvents.length = 0;
  eventsById.clear();
  eventsByEntity.clear();
  eventsByType.clear();
  eventsByCitedEvent.clear();
}

/**
 * Retrieves all events that cite, discuss, or stem from a specific event ID
 */
export function getCitationsForEvent(eventId, limit = 50) {
  if (!eventId) return [];
  const ids = eventsByCitedEvent.get(eventId) || [];
  const res = [];
  for (let i = ids.length - 1; i >= 0 && res.length < limit; i--) {
    const ev = eventsById.get(ids[i]);
    if (ev) res.push(ev);
  }
  return res;
}

/**
 * Records and indexes a significant world event
 */
export function recordWorldEvent({
  opcode = null,
  type = "EVENT",
  primaryEntityId = null,
  secondaryEntityId = null,
  location = { x: 0, y: 0 },
  description = "",
  tick = 0,
  timestamp = null,
  metadata = {}
}) {
  // Resolve opcode and event type
  const resolvedOpcode = opcode || TYPE_TO_OPCODE[type] || OP_RELATION;
  const resolvedType = OPCODE_TO_TYPE[resolvedOpcode] || type;

  // Aggregate repeated attacks between same attacker and target
  if (resolvedType === "ATTACK" && allEvents.length > 0) {
    const last = allEvents[allEvents.length - 1];
    if (
      last &&
      last.type === "ATTACK" &&
      last.primaryEntityId === primaryEntityId &&
      last.secondaryEntityId === secondaryEntityId &&
      Math.abs(tick - last.tick) < 180
    ) {
      last.count = (last.count || 1) + 1;
      last.tick = tick;
      last.timestamp = timestamp || last.timestamp;
      last.location = { x: Math.round(location.x), y: Math.round(location.y) };

      const prevDmg = last.metadata?.totalDamage || last.metadata?.netDamage || 0;
      const newDmg = metadata?.netDamage || 0;
      const totalDmg = prevDmg + newDmg;
      last.metadata.totalDamage = totalDmg;

      const pName = metadata?.attackerName || `Entity #${primaryEntityId}`;
      const tPart = metadata?.hitPartName || "body";
      const tName = metadata?.targetName || `Entity #${secondaryEntityId}`;

      last._rawDescription = `${pName} attacked ${tName} (${last.count}x) hitting ${tPart}, dealing ${Math.round(totalDmg)} total damage [X: ${last.location.x}, Y: ${last.location.y}]!`;
      return last;
    }
  }

  const resolvedTimestamp = timestamp || (currentWorld?.clock ? { day: currentWorld.clock.day, hour: currentWorld.clock.hour, minute: currentWorld.clock.minute } : { day: 0, hour: 0, minute: 0 });

  const event = {
    id: nextEventId++,
    opcode: resolvedOpcode,
    count: 1,
    tick,
    timestamp: resolvedTimestamp,
    type: resolvedType,
    primaryEntityId,
    secondaryEntityId,
    location: { x: Math.round(location.x), y: Math.round(location.y) },
    _rawDescription: description || "",
    metadata,
    get description() {
      return formatEventDescription(this);
    },
    set description(val) {
      this._rawDescription = val;
    }
  };

  allEvents.push(event);
  eventsById.set(event.id, event);

  // 1. Index by Primary Entity
  indexEntityEvent(primaryEntityId, event.id);

  // 2. Index by Secondary Entity
  indexEntityEvent(secondaryEntityId, event.id);

  // 3. Index by Event Type
  if (!eventsByType.has(resolvedType)) {
    eventsByType.set(resolvedType, []);
  }
  eventsByType.get(resolvedType).push(event.id);

  // 4. Index by Cited / Referenced Event ID
  const citedId = metadata?.referencedEventId || metadata?.gossipedEventId || metadata?.realEventId || metadata?.citedEventId;
  if (citedId !== null && citedId !== undefined) {
    if (!eventsByCitedEvent.has(citedId)) {
      eventsByCitedEvent.set(citedId, []);
    }
    eventsByCitedEvent.get(citedId).push(event.id);
  }

  return event;
}

/**
 * Retrieves an event by its unique ID in O(1)
 */
export function getEventById(id) {
  return eventsById.get(id);
}

/**
 * Retrieves all events involving a specific entity (living or deceased)
 */
export function getEventsForEntity(entityId, limit = 50) {
  const full = getFullHistoryForEntity(entityId);
  return full.slice(0, limit);
}

/**
 * Retrieves events filtered by type
 */
export function getEventsByType(type, limit = 50) {
  const ids = eventsByType.get(type);
  if (!ids || ids.length === 0) return [];
  const start = Math.max(0, ids.length - limit);
  return ids.slice(start).map(id => eventsById.get(id)).filter(Boolean).reverse();
}

/**
 * Retrieves events occurring within a spatial radius
 */
export function getEventsNear(x, y, radius = 8, limit = 30) {
  const matched = [];
  for (let i = allEvents.length - 1; i >= 0; i--) {
    const ev = allEvents[i];
    const dx = Math.abs(ev.location.x - x);
    const dy = Math.abs(ev.location.y - y);
    if (dx <= radius && dy <= radius) {
      matched.push(ev);
      if (matched.length >= limit) break;
    }
  }
  return matched;
}

/**
 * Retrieves all chronological events involving a group/clan and all its participants (past & present)
 */
export function getEventsForGroup(group, limit = 50) {
  if (!group) return [];
  const memberSet = new Set(group.members || []);
  const groupId = group.id;
  const eventIdSet = new Set();

  // 1. Events directly referencing the group ID (e.g. founding, joining, expulsion)
  if (groupId !== undefined && groupId !== null) {
    const gEvents = eventsByEntity.get(groupId) || eventsByEntity.get(Number(groupId));
    if (gEvents) {
      for (const id of gEvents) eventIdSet.add(id);
    }
  }

  // 2. Events involving any member of the group (living or deceased)
  for (const mid of memberSet) {
    const mEvents = eventsByEntity.get(mid) || eventsByEntity.get(Number(mid));
    if (mEvents) {
      for (const id of mEvents) eventIdSet.add(id);
    }
  }

  // 3. Collect, sort chronologically and limit
  const matched = Array.from(eventIdSet)
    .map(id => eventsById.get(id))
    .filter(Boolean)
    .sort((a, b) => b.id - a.id);

  return matched.slice(0, limit);
}

/**
 * Retrieves the most recent world events
 */
export function getRecentWorldEvents(limit = 25) {
  const start = Math.max(0, allEvents.length - limit);
  return allEvents.slice(start).reverse();
}

/**
 * Retrieves the full chronological events list involving an entity without truncation
 */
export function getFullHistoryForEntity(entityId) {
  if (entityId === null || entityId === undefined) return [];
  const numId = Number(entityId);
  const strId = String(entityId);

  const resultSet = new Set();
  const numEvents = !isNaN(numId) ? eventsByEntity.get(numId) : null;
  if (numEvents) {
    for (const id of numEvents) resultSet.add(id);
  }
  const strEvents = eventsByEntity.get(strId);
  if (strEvents) {
    for (const id of strEvents) resultSet.add(id);
  }

  // Fallback comprehensive scan across allEvents to catch any missed metadata or un-indexed links
  if (resultSet.size === 0) {
    for (let i = 0; i < allEvents.length; i++) {
      const ev = allEvents[i];
      if (ev.primaryEntityId == numId || ev.secondaryEntityId == numId ||
          ev.primaryEntityId == strId || ev.secondaryEntityId == strId ||
          ev.metadata?.killerId == numId || ev.metadata?.victimId == numId ||
          ev.metadata?.targetId == numId || ev.metadata?.attackerId == numId ||
          ev.metadata?.ownerId == numId || ev.metadata?.partnerId == numId) {
        resultSet.add(ev.id);
      }
    }
  }

  return Array.from(resultSet)
    .map(id => eventsById.get(id))
    .filter(Boolean)
    .sort((a, b) => b.id - a.id);
}

/**
 * Retrieves the full chronological events list involving a group without truncation
 */
export function getFullHistoryForGroup(group) {
  if (!group) return [];
  const memberSet = new Set(group.members || []);
  const groupId = group.id;
  const eventIdSet = new Set();

  if (groupId !== undefined && groupId !== null) {
    const gEvents = eventsByEntity.get(groupId);
    if (gEvents) {
      for (const id of gEvents) eventIdSet.add(id);
    }
  }

  for (const mid of memberSet) {
    const mEvents = eventsByEntity.get(mid);
    if (mEvents) {
      for (const id of mEvents) eventIdSet.add(id);
    }
  }

  return Array.from(eventIdSet)
    .map(id => eventsById.get(id))
    .filter(Boolean)
    .sort((a, b) => b.id - a.id);
}

/**
 * Clusters combat events into cohesive battles/skirmishes with complete forensics:
 * - Initiator / instigator
 * - Cause / provocation
 * - Full combatants list and clan involvement
 * - Detailed strikes, hit body parts, amputations
 * - Direct & delayed fatal casualties (died in battle or later from wounds)
 */
let _lastClusteredEventCount = 0;
let _cachedGlobalBattles = [];
let _globalBattlesGen = 0;
let _entityBattleFilterCache = { entityId: null, groupId: null, gen: 0, limit: 0, result: null };

// Incremental clustering persistent state
let _incCombat = [];      // Combat events, appended incrementally
let _incPreCombat = [];   // Non-combat events for provocation detection
let _incClusters = [];    // Raw clusters (arrays of combat events)
let _incCombatProcessed = 0;
let _incBattleId = 1;

// Binary search: find rightmost index in sorted-by-tick array where tick <= target
function _upperBoundTick(arr, tick) {
  let lo = 0, hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid].tick <= tick) lo = mid + 1;
    else hi = mid;
  }
  return lo - 1;
}

// Build a rich battle record from a cluster of combat events
function _buildBattleFromCluster(cluster, id) {
  const firstEv = cluster[0];
  const lastEv = cluster[cluster.length - 1];

  const combatantsMap = new Map();
  const clansSet = new Set();
  let totalDamage = 0;
  let attacksCount = 0;
  const amputations = [];
  const fatalities = [];

  const getOrAddCombatant = (cId, name, clan) => {
    if (!cId) return null;
    if (!combatantsMap.has(cId)) {
      combatantsMap.set(cId, {
        id: cId,
        name: name || `Entity #${cId}`,
        clan: clan || "Solitary",
        hitsDealt: 0, hitsTaken: 0,
        damageDealt: 0, damageTaken: 0,
        amputationsDealt: 0, amputationsSuffered: 0,
        isDead: false
      });
    }
    return combatantsMap.get(cId);
  };

  for (const ev of cluster) {
    const pId = ev.primaryEntityId;
    const sId = ev.secondaryEntityId;
    const pName = ev.metadata?.primaryName || ev.metadata?.attackerName;
    const sName = ev.metadata?.secondaryName || ev.metadata?.targetName;
    const pClan = ev.metadata?.attackerClan || ev.metadata?.primaryClan;
    const sClan = ev.metadata?.targetClan || ev.metadata?.secondaryClan;

    const pCombatant = getOrAddCombatant(pId, pName, pClan);
    const sCombatant = getOrAddCombatant(sId, sName, sClan);

    if (pClan) clansSet.add(pClan);
    if (sClan) clansSet.add(sClan);

    if (ev.type === "ATTACK") {
      const dmg = ev.metadata?.totalDamage || ev.metadata?.netDamage || 10;
      totalDamage += dmg;
      attacksCount += (ev.count || 1);
      if (pCombatant) {
        pCombatant.hitsDealt += (ev.count || 1);
        pCombatant.damageDealt += dmg;
      }
      if (sCombatant) {
        sCombatant.hitsTaken += (ev.count || 1);
        sCombatant.damageTaken += dmg;
      }
    } else if (ev.type === "AMPUTATION") {
      if (pCombatant) pCombatant.amputationsDealt++;
      if (sCombatant) pCombatant.amputationsSuffered++;
      amputations.push({
        attackerId: pId, attackerName: pName,
        victimId: sId, victimName: sName,
        partName: ev.metadata?.partName || "limb",
        tick: ev.tick
      });
    } else if (ev.type === "DEATH") {
      const victimId = pId || sId;
      const victim = combatantsMap.get(victimId);
      if (victim) victim.isDead = true;
      fatalities.push({
        victimId: victimId,
        victimName: pName || sName,
        killerId: ev.metadata?.attackerId || ev.metadata?.fatalAttackerId || pId,
        killerName: ev.metadata?.attackerName,
        tick: ev.tick
      });
    }
  }

  const initiatorId = firstEv.primaryEntityId;
  const initiatorName = firstEv.metadata?.primaryName || firstEv.metadata?.attackerName || `Entity #${initiatorId}`;
  const initiatorClan = firstEv.metadata?.primaryClan || firstEv.metadata?.attackerClan || "Solitary";
  const defenderId = firstEv.secondaryEntityId;
  const defenderName = firstEv.metadata?.secondaryName || firstEv.metadata?.targetName || `Entity #${defenderId}`;
  const defenderClan = firstEv.metadata?.secondaryClan || firstEv.metadata?.targetClan || "Solitary";

  // Deduce Provocation: binary-search into narrow tick window
  let triggerCause = "Territorial tension / Hostile encounter";
  const minTick = firstEv.tick - 1800;
  const maxTick = firstEv.tick;
  const provStart = _upperBoundTick(_incPreCombat, maxTick);
  for (let pi = provStart; pi >= 0; pi--) {
    const pEv = _incPreCombat[pi];
    if (pEv.tick < minTick) break;
    const involves = (
      (pEv.primaryEntityId === initiatorId && pEv.secondaryEntityId === defenderId) ||
      (pEv.primaryEntityId === defenderId && pEv.secondaryEntityId === initiatorId)
    );
    if (!involves) continue;
    if (pEv.opcode === OP_INSULT || pEv.opcode === OP_HUMILIATE || pEv.opcode === OP_SPIT || pEv.opcode === OP_SHOVE) {
      triggerCause = `Provoked by prior hostile confrontation (${pEv.description})`;
      break;
    } else if (pEv.opcode === OP_LIE) {
      triggerCause = `Sparked by fabricated lie/accusation (${pEv.metadata?.narrative || pEv.description})`;
      break;
    } else if (pEv.opcode === OP_PROPOSAL_REJECTED) {
      triggerCause = `Emotional fallout following courtship rejection`;
      break;
    }
  }

  const battleName = clansSet.size >= 2
    ? `CLASH OF ${Array.from(clansSet).join(" vs ").toUpperCase()}`
    : `SKIRMISH AT [X:${firstEv.location.x}, Y:${firstEv.location.y}]`;

  return {
    id,
    name: battleName,
    startTick: firstEv.tick,
    endTick: lastEv.tick,
    timestamp: firstEv.timestamp,
    location: firstEv.location,
    initiator: { id: initiatorId, name: initiatorName, clan: initiatorClan },
    defender: { id: defenderId, name: defenderName, clan: defenderClan },
    triggerCause,
    combatants: Array.from(combatantsMap.values()),
    clansInvolved: Array.from(clansSet),
    totalDamage,
    attacksCount,
    amputations,
    fatalities,
    events: cluster
  };
}

export function getClusteredBattles({ entityId = null, groupId = null, limit = 50 } = {}) {
  // Detect log reset (e.g. new game started)
  if (allEvents.length < _lastClusteredEventCount) {
    _incCombat = [];
    _incPreCombat = [];
    _incClusters = [];
    _incCombatProcessed = 0;
    _incBattleId = 1;
    _cachedGlobalBattles = [];
    _lastClusteredEventCount = 0;
    _globalBattlesGen++;
  }

  // Incrementally process only NEW events since last call
  if (_lastClusteredEventCount !== allEvents.length) {
    const prevCount = _lastClusteredEventCount;
    _lastClusteredEventCount = allEvents.length;

    // Step 1: Filter only NEW events into persistent arrays (O(new_events) instead of O(all_events))
    for (let i = prevCount; i < allEvents.length; i++) {
      const ev = allEvents[i];
      if (ev.type === "ATTACK" || ev.type === "AMPUTATION" ||
          (ev.type === "DEATH" && (ev.metadata?.attackerId || ev.metadata?.fatalAttackerId || ev.metadata?.causedByBattleId))) {
        _incCombat.push(ev);
      } else {
        _incPreCombat.push(ev);
      }
    }

    // Step 2: Cluster only new (unprocessed) combat events (O(new_combat) instead of O(all_combat))
    if (_incCombatProcessed < _incCombat.length) {
      const prevClusterCount = _incClusters.length;

      for (let i = _incCombatProcessed; i < _incCombat.length; i++) {
        const ev = _incCombat[i];

        if (_incClusters.length > 0) {
          const lastCluster = _incClusters[_incClusters.length - 1];
          const prev = lastCluster[lastCluster.length - 1];
          if (Math.abs(ev.tick - prev.tick) <= 360 &&
              Math.hypot(ev.location.x - prev.location.x, ev.location.y - prev.location.y) <= 20) {
            lastCluster.push(ev);
            continue;
          }
        }
        _incClusters.push([ev]);
      }

      _incCombatProcessed = _incCombat.length;

      // Step 3: Rebuild only affected battle records (the possibly-extended last cluster + new clusters)
      const rebuildFrom = prevClusterCount > 0 ? prevClusterCount - 1 : 0;
      for (let i = rebuildFrom; i < _incClusters.length; i++) {
        if (i < _cachedGlobalBattles.length) {
          // Rebuild existing (possibly extended) battle — preserve its ID
          _cachedGlobalBattles[i] = _buildBattleFromCluster(_incClusters[i], _cachedGlobalBattles[i].id);
        } else {
          // New battle
          _cachedGlobalBattles.push(_buildBattleFromCluster(_incClusters[i], _incBattleId++));
        }
      }

      _globalBattlesGen++;
    }
  }

  // Use entity/group filter cache to avoid re-filtering every call
  const cacheKey_eId = entityId ?? null;
  const cacheKey_gId = groupId ?? null;
  const fc = _entityBattleFilterCache;
  if (fc.entityId === cacheKey_eId && fc.groupId === cacheKey_gId && fc.gen === _globalBattlesGen && fc.limit === limit) {
    return fc.result;
  }

  let filtered = _cachedGlobalBattles;
  if (entityId !== null && entityId !== undefined) {
    filtered = filtered.filter(b => b.combatants.some(c => c.id === entityId));
  }
  if (groupId !== null && groupId !== undefined) {
    filtered = filtered.filter(b => b.combatants.some(c => c.clan === groupId || c.clan?.toLowerCase() === String(groupId).toLowerCase()));
  }

  const result = filtered.slice(Math.max(0, filtered.length - limit)).reverse();
  _entityBattleFilterCache = { entityId: cacheKey_eId, groupId: cacheKey_gId, gen: _globalBattlesGen, limit, result };
  return result;
}

/**
 * Retrieves a battle record by its cluster ID
 */
export function getBattleById(battleId) {
  const battles = getClusteredBattles({ limit: 500 });
  return battles.find(b => b.id === battleId) || null;
}

/**
 * Generates an in-depth relationship summary between two entities
 */
export function getRelationshipSummary(entA_Id, entB_Id, entityRegistry = null) {
  if (!entA_Id || !entB_Id) return null;

  const getEnt = (id) => entityRegistry?.get(id) || null;
  const entA = getEnt(entA_Id);
  const entB = getEnt(entB_Id);
  const nameA = entA?.properties?.name || `Entity #${entA_Id}`;
  const nameB = entB?.properties?.name || `Entity #${entB_Id}`;

  const mutualEvents = allEvents.filter(ev => {
    return (ev.primaryEntityId === entA_Id && ev.secondaryEntityId === entB_Id) ||
           (ev.primaryEntityId === entB_Id && ev.secondaryEntityId === entA_Id);
  }).sort((a, b) => a.tick - b.tick);

  let positiveCount = 0;
  let hostileCount = 0;
  let kisses = 0;
  let hugs = 0;
  let praises = 0;
  let insults = 0;
  let attacks = 0;
  let lies = 0;
  let bondedProposal = false;
  let rejectedProposal = false;

  for (const ev of mutualEvents) {
    if (ev.opcode === OP_KISS) { kisses++; if (!ev.metadata?.rejected) positiveCount += 2; else hostileCount++; }
    else if (ev.opcode === OP_HUG) { hugs++; if (!ev.metadata?.rejected) positiveCount++; else hostileCount++; }
    else if (ev.opcode === OP_PRAISE) { praises++; if (!ev.metadata?.rejected) positiveCount++; }
    else if (ev.opcode === OP_INSULT || ev.opcode === OP_HUMILIATE || ev.opcode === OP_SPIT || ev.opcode === OP_SHOVE) { insults++; hostileCount += 2; }
    else if (ev.opcode === OP_ATTACK || ev.opcode === OP_AMPUTATION) { attacks += (ev.count || 1); hostileCount += 3; }
    else if (ev.opcode === OP_LIE) { lies++; hostileCount += 2; }
    else if (ev.opcode === OP_PROPOSAL_ACCEPTED) { bondedProposal = true; positiveCount += 5; }
    else if (ev.opcode === OP_PROPOSAL_REJECTED) { rejectedProposal = true; hostileCount += 2; }
  }

  const affinityAtoB = entA?.properties?.brain?.affinities?.[entB_Id];
  const score = typeof affinityAtoB === "object" ? (affinityAtoB.score || 0) : (typeof affinityAtoB === "number" ? affinityAtoB : 0);

  let statusLabel = "STRANGERS / ACQUAINTANCES";
  let statusColor = "#bcbcbc";

  if (bondedProposal || (entA?.properties?.monogamy?.partnerId === entB_Id)) {
    statusLabel = "BONDED COUPLE ❤️";
    statusColor = "#ff60a0";
  } else if (score >= 60 || positiveCount >= 6) {
    statusLabel = "CHERISHED ALLIES / CLOSE FRIENDS";
    statusColor = "#58d854";
  } else if (score <= -40 || hostileCount >= 6) {
    statusLabel = "BITTER BLOOD RIVALS ⚔️";
    statusColor = "#f83800";
  } else if (rejectedProposal) {
    statusLabel = "UNREQUITED / ESTRANGED";
    statusColor = "#d3869b";
  }

  return {
    entA: { id: entA_Id, name: nameA },
    entB: { id: entB_Id, name: nameB },
    statusLabel,
    statusColor,
    affinityScore: score,
    totalEvents: mutualEvents.length,
    positiveCount,
    hostileCount,
    breakdown: { kisses, hugs, praises, insults, attacks, lies, bondedProposal, rejectedProposal },
    events: mutualEvents
  };
}

/**
 * Restores world events stream received from worker during full world init
 */
export function restoreWorldEvents(eventsList = []) {
  resetWorldEvents();
  let maxId = 0;
  for (const raw of eventsList) {
    if (!raw) continue;
    const ev = {
      id: raw.id,
      opcode: raw.opcode || TYPE_TO_OPCODE[raw.type] || OP_RELATION,
      count: raw.count || 1,
      tick: raw.tick || 0,
      timestamp: raw.timestamp || { day: 0, hour: 0, minute: 0 },
      type: raw.type || OPCODE_TO_TYPE[raw.opcode] || "EVENT",
      primaryEntityId: raw.primaryEntityId ?? null,
      secondaryEntityId: raw.secondaryEntityId ?? null,
      location: raw.location ? { x: Math.round(raw.location.x), y: Math.round(raw.location.y) } : { x: 0, y: 0 },
      _rawDescription: raw.description || raw._rawDescription || "",
      metadata: raw.metadata || {},
      get description() {
        return formatEventDescription(this);
      },
      set description(val) {
        this._rawDescription = val;
      }
    };

    allEvents.push(ev);
    eventsById.set(ev.id, ev);

    indexEntityEvent(ev.primaryEntityId, ev.id);
    indexEntityEvent(ev.secondaryEntityId, ev.id);

    if (ev.type) {
      if (!eventsByType.has(ev.type)) eventsByType.set(ev.type, []);
      eventsByType.get(ev.type).push(ev.id);
    }
    if (ev.opcode) {
      if (!eventsByType.has(ev.opcode)) eventsByType.set(ev.opcode, []);
      eventsByType.get(ev.opcode).push(ev.id);
    }
    const citedId = ev.metadata?.referencedEventId || ev.metadata?.gossipedEventId || ev.metadata?.realEventId || ev.metadata?.citedEventId;
    if (citedId !== null && citedId !== undefined) {
      if (!eventsByCitedEvent.has(citedId)) eventsByCitedEvent.set(citedId, []);
      eventsByCitedEvent.get(citedId).push(ev.id);
    }
    if (ev.id > maxId) maxId = ev.id;
  }
  nextEventId = maxId + 1;
}

/**
 * Ingests a continuous batch of new world events streamed from the simulation worker
 */
export function appendWorldEvents(eventsList = []) {
  if (!Array.isArray(eventsList) || eventsList.length === 0) return;
  for (const raw of eventsList) {
    if (!raw) continue;

    if (eventsById.has(raw.id)) {
      const existing = eventsById.get(raw.id);
      existing.count = raw.count || existing.count;
      existing.tick = raw.tick || existing.tick;
      existing.timestamp = raw.timestamp || existing.timestamp;
      existing.location = raw.location || existing.location;
      existing._rawDescription = raw.description || raw._rawDescription || existing._rawDescription;
      existing.metadata = raw.metadata || existing.metadata;
      continue;
    }

    const ev = {
      id: raw.id,
      opcode: raw.opcode || TYPE_TO_OPCODE[raw.type] || OP_RELATION,
      count: raw.count || 1,
      tick: raw.tick || 0,
      timestamp: raw.timestamp || { day: 0, hour: 0, minute: 0 },
      type: raw.type || OPCODE_TO_TYPE[raw.opcode] || "EVENT",
      primaryEntityId: raw.primaryEntityId ?? null,
      secondaryEntityId: raw.secondaryEntityId ?? null,
      location: raw.location ? { x: Math.round(raw.location.x), y: Math.round(raw.location.y) } : { x: 0, y: 0 },
      _rawDescription: raw.description || raw._rawDescription || "",
      metadata: raw.metadata || {},
      get description() {
        return this._rawDescription || formatEventDescription(this);
      },
      set description(val) {
        this._rawDescription = val;
      }
    };

    allEvents.push(ev);
    eventsById.set(ev.id, ev);

    indexEntityEvent(ev.primaryEntityId, ev.id);
    indexEntityEvent(ev.secondaryEntityId, ev.id);

    if (ev.type) {
      if (!eventsByType.has(ev.type)) eventsByType.set(ev.type, []);
      eventsByType.get(ev.type).push(ev.id);
    }
    if (ev.opcode) {
      if (!eventsByType.has(ev.opcode)) eventsByType.set(ev.opcode, []);
      eventsByType.get(ev.opcode).push(ev.id);
    }
    const citedId = ev.metadata?.referencedEventId || ev.metadata?.gossipedEventId || ev.metadata?.realEventId || ev.metadata?.citedEventId;
    if (citedId !== null && citedId !== undefined) {
      if (!eventsByCitedEvent.has(citedId)) eventsByCitedEvent.set(citedId, []);
      eventsByCitedEvent.get(citedId).push(ev.id);
    }
    if (ev.id >= nextEventId) nextEventId = ev.id + 1;
  }

  if (eventLogConfig.maxWorldEvents > 0 && allEvents.length > eventLogConfig.maxWorldEvents * 1.2) {
    const toRemove = allEvents.splice(0, allEvents.length - eventLogConfig.maxWorldEvents);
    for (let i = 0; i < toRemove.length; i++) {
      eventsById.delete(toRemove[i].id);
    }
  }
}
