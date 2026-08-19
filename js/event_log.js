// =============================================================================
// Brutopolis — Chronological & Compact Indexed World Event Log (Bytecode Architecture)
// =============================================================================

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
  [OP_HARVEST]: "HARVEST"
};

export const TYPE_TO_OPCODE = {
  "BIRTH": OP_BIRTH,
  "DEATH": OP_DEATH,
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
  "HARVEST": OP_HARVEST
};

let nextEventId = 1;
export const allEvents = [];
export const eventsById = new Map();
export const eventsByEntity = new Map();
export const eventsByType = new Map();
export const eventsByCitedEvent = new Map();

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
    case OP_BUILD:
      return `${pName} constructed a ${ev.metadata?.structureName || "Stone Wall"} fortification!${locStr}`;
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

  const event = {
    id: nextEventId++,
    opcode: resolvedOpcode,
    count: 1,
    tick,
    timestamp: timestamp || { day: 0, hour: 0, minute: 0 },
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
  if (primaryEntityId !== null && primaryEntityId !== undefined) {
    if (!eventsByEntity.has(primaryEntityId)) {
      eventsByEntity.set(primaryEntityId, []);
    }
    eventsByEntity.get(primaryEntityId).push(event.id);
  }

  // 2. Index by Secondary Entity
  if (secondaryEntityId !== null && secondaryEntityId !== undefined) {
    if (!eventsByEntity.has(secondaryEntityId)) {
      eventsByEntity.set(secondaryEntityId, []);
    }
    eventsByEntity.get(secondaryEntityId).push(event.id);
  }

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
  const ids = eventsByEntity.get(entityId);
  if (!ids || ids.length === 0) return [];
  const start = Math.max(0, ids.length - limit);
  return ids.slice(start).map(id => eventsById.get(id)).filter(Boolean);
}

/**
 * Retrieves events filtered by type
 */
export function getEventsByType(type, limit = 50) {
  const ids = eventsByType.get(type);
  if (!ids || ids.length === 0) return [];
  const start = Math.max(0, ids.length - limit);
  return ids.slice(start).map(id => eventsById.get(id)).filter(Boolean);
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
    const gEvents = eventsByEntity.get(groupId);
    if (gEvents) {
      for (const id of gEvents) eventIdSet.add(id);
    }
  }

  // 2. Events involving any member of the group (living or deceased)
  for (const mid of memberSet) {
    const mEvents = eventsByEntity.get(mid);
    if (mEvents) {
      for (const id of mEvents) eventIdSet.add(id);
    }
  }

  // 3. Collect, sort chronologically and limit
  const matched = Array.from(eventIdSet)
    .map(id => eventsById.get(id))
    .filter(Boolean)
    .sort((a, b) => a.id - b.id);

  const start = Math.max(0, matched.length - limit);
  return matched.slice(start);
}

/**
 * Retrieves the most recent world events
 */
export function getRecentWorldEvents(limit = 25) {
  const start = Math.max(0, allEvents.length - limit);
  return allEvents.slice(start).reverse();
}

/**
 * Compiles and exports the complete world chronicle archive into a structured JSON object
 */
export function exportWorldChronicleJSON(world, entities, currentTick = 0, entityRegistry = null) {
  // 1. Gather all groups/factions
  const groupMap = new Map();
  const allEnts = new Map();

  // Populate from active entities array
  if (entities && Array.isArray(entities)) {
    for (const e of entities) {
      if (!e) continue;
      allEnts.set(e.id, e);
      if (e.properties?.group) {
        groupMap.set(e.properties.group.id, e.properties.group);
      }
    }
  }

  // Populate from entity registry (includes deceased/historical creatures)
  if (entityRegistry && typeof entityRegistry.values === "function") {
    for (const e of entityRegistry.values()) {
      if (!e) continue;
      if (!allEnts.has(e.id)) allEnts.set(e.id, e);
      if (e.properties?.group) {
        groupMap.set(e.properties.group.id, e.properties.group);
      }
    }
  }

  // 2. Format groups cleanly
  const groupsList = Array.from(groupMap.values()).map(g => ({
    id: g.id,
    name: g.name,
    leaderId: g.members && g.members.length > 0 ? g.members[0] : null,
    members: g.members || [],
    claimedZones: g.claimedZones || [],
    stockpile: g.stockpile || {}
  }));

  // 3. Serialize all entities with intact relationships
  const entitiesList = Array.from(allEnts.values()).map(ent => {
    const props = ent.properties || {};
    const hasLife = !!props.life;
    const isAlive = !ent.destroyed && hasLife && props.life.energy > 0;

    const gender = props.gender || (props.vagina ? "female" : props.penis ? "male" : null);
    const orientation = props.homosexual ? "homosexual" : props.bisexual ? "bisexual" : "heterosexual";
    const perks = [];
    if (props.skeptic) perks.push("skeptic");
    if (props.gullible) perks.push("gullible");
    if (props.liar) perks.push(props.liar.type || "liar");

    const fatherId = props.fatherId !== undefined ? props.fatherId : props.life?.fatherId ?? null;
    const motherId = props.motherId !== undefined ? props.motherId : props.life?.motherId ?? null;
    const partnerId = props.monogamy?.partnerId ?? null;
    const childrenIds = props.life?.childrenIds || [];

    const affinities = props.brain?.affinities
      ? Object.fromEntries(Object.entries(props.brain.affinities).map(([k, v]) => [k, Math.round(v)]))
      : {};

    return {
      id: ent.id,
      name: props.name || `Entity #${ent.id}`,
      species: props.species || "creature",
      x: ent.x,
      y: ent.y,
      isAlive,
      hasLife,
      gender,
      orientation,
      perks,
      fatherId,
      motherId,
      partnerId,
      childrenIds,
      groupId: props.group?.id ?? null,
      groupName: props.group?.name ?? null,
      affinities,
      fatUnits: props.stomach?.fatUnits || 0,
      energy: props.life ? Math.round(props.life.energy) : null,
      maxEnergy: props.life?.max || null,
      mood: props.brain && typeof props.brain.mood === "number" ? Math.round(props.brain.mood) : null,
      heldItem: props.arm_right?.heldItem?.resourceType || props.arm_left?.heldItem?.resourceType || null
    };
  });

  // 4. Serialize all events
  const eventsList = allEvents.map(ev => ({
    id: ev.id,
    opcode: ev.opcode,
    type: ev.type,
    count: ev.count || 1,
    tick: ev.tick,
    timestamp: ev.timestamp || { day: 0, hour: 0, minute: 0 },
    primaryEntityId: ev.primaryEntityId,
    secondaryEntityId: ev.secondaryEntityId,
    location: ev.location ? { x: ev.location.x, y: ev.location.y } : null,
    description: ev.description,
    metadata: ev.metadata || {}
  }));

  return {
    version: "1.0",
    format: "brutopolis_chronicle",
    generatedAt: new Date().toISOString(),
    world: {
      width: world?.width || 512,
      height: world?.height || 512,
      clock: world?.clock ? { day: world.clock.day, hour: world.clock.hour, minute: world.clock.minute, totalSeconds: world.clock.totalSeconds } : null,
      tick: currentTick
    },
    stats: {
      totalTicks: currentTick,
      totalEvents: eventsList.length,
      totalEntities: entitiesList.length,
      totalGroups: groupsList.length
    },
    groups: groupsList,
    entities: entitiesList,
    events: eventsList
  };
}

/**
 * Triggers browser download of the chronicle JSON file
 */
export function downloadChronicleJSON(world, entities, currentTick = 0, entityRegistry = null) {
  const chronicle = exportWorldChronicleJSON(world, entities, currentTick, entityRegistry);
  const jsonStr = JSON.stringify(chronicle, null, 2);
  const blob = new Blob([jsonStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const day = world?.clock?.day || 0;
  const hour = world?.clock?.hour || 0;
  const filename = `brutopolis_chronicle_day${day}_hour${hour}_tick${currentTick}.json`;

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return filename;
}

