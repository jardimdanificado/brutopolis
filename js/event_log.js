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
  [OP_PROPOSAL_REJECTED]: "RELATION"
};

export const TYPE_TO_OPCODE = {
  "BIRTH": OP_BIRTH,
  "DEATH": OP_DEATH,
  "ATTACK": OP_ATTACK,
  "AMPUTATION": OP_AMPUTATION,
  "FEED": OP_FEED,
  "SPROUT": OP_SPROUT,
  "RELATION": OP_RELATION,
  "DIALOGUE": OP_DIALOGUE
};

let nextEventId = 1;
export const allEvents = [];
export const eventsById = new Map();
export const eventsByEntity = new Map();
export const eventsByType = new Map();

/**
 * Formats a human-readable event description dynamically from its bytecode / opcode payload
 */
export function formatEventDescription(ev) {
  if (ev._rawDescription) return ev._rawDescription;

  const pName = ev.metadata?.primaryName || (ev.primaryEntityId ? `Entity #${ev.primaryEntityId}` : "World");
  const sName = ev.metadata?.secondaryName || (ev.secondaryEntityId ? `Entity #${ev.secondaryEntityId}` : "");
  const locStr = ev.location ? ` [X: ${ev.location.x}, Y: ${ev.location.y}]` : "";

  switch (ev.opcode) {
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

