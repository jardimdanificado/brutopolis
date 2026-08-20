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
export const OP_SLEEP = 27;
export const OP_WAKE = 28;
export const OP_THEFT = 29;
export const OP_TROPHY = 30;
export const OP_SUCCESSION = 31;
export const OP_FORGET = 32;
export const OP_JEALOUSY = 33;

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
  [OP_SLEEP]: "SLEEP",
  [OP_WAKE]: "WAKE",
  [OP_THEFT]: "THEFT",
  [OP_TROPHY]: "TROPHY",
  [OP_SUCCESSION]: "SUCCESSION",
  [OP_FORGET]: "FORGET",
  [OP_JEALOUSY]: "JEALOUSY"
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
  "SLEEP": OP_SLEEP,
  "WAKE": OP_WAKE,
  "THEFT": OP_THEFT,
  "TROPHY": OP_TROPHY,
  "SUCCESSION": OP_SUCCESSION,
  "FORGET": OP_FORGET,
  "JEALOUSY": OP_JEALOUSY
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
    case OP_SLEEP:
      return `${pName} fell asleep peacefully ${ev.metadata?.inBed ? "in a cozy bed" : "on the ground"} to restore vital energy.${locStr}`;
    case OP_WAKE:
      return `${pName} woke up well-rested and energized!${locStr}`;
    case OP_THEFT:
      return `${pName} stole ${ev.metadata?.itemName || "a valued possession"} belonging to ${sName}!${locStr}`;
    case OP_TROPHY:
      return `${pName} claimed ${ev.metadata?.trophyName || "a battle trophy"} from ${sName}!${locStr}`;
    case OP_SUCCESSION:
      return `${pName} ascended as the new clan leader following the succession of '${ev.metadata?.groupName || "the clan"}'!${locStr}`;
    case OP_FORGET:
      return `${pName} experienced memory loss due to cognitive decline (${ev.metadata?.forgottenType || "memories"}).${locStr}`;
    case OP_JEALOUSY:
      return `${pName} was consumed by intense jealousy regarding ${sName}!${locStr}`;
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

  // 3. Serialize all entities with intact relationships and body parts
  const BODY_PART_KEYS = [
    "arm_left", "arm_right", "leg_left", "leg_right",
    "eye_left", "eye_right", "mouth", "ear_left", "ear_right",
    "hand_left", "hand_right", "wing_left", "wing_right",
    "tail", "head", "torso", "abdomen"
  ];

  const entitiesList = Array.from(allEnts.values()).map(ent => {
    const props = ent.properties || {};
    const hasLife = !!props.life;
    const isAlive = !ent.destroyed && hasLife && props.life.energy > 0;

    const gender = props.gender || (props.vagina ? "female" : props.penis ? "male" : null);
    const orientation = props.homosexual ? "homosexual" : props.bisexual ? "bisexual" : "heterosexual";
    const perks = [];
    if (props.skeptic) perks.push("skeptic");
    if (props.gullible) perks.push("gullible");
    if (props.schizophrenic) perks.push("schizophrenic");
    if (props.liar) perks.push(props.liar.type || "liar");

    const fatherId = props.fatherId !== undefined ? props.fatherId : props.life?.fatherId ?? null;
    const motherId = props.motherId !== undefined ? props.motherId : props.life?.motherId ?? null;
    const partnerId = props.monogamy?.partnerId ?? null;
    const childrenIds = props.life?.childrenIds || [];

    const affinities = props.brain?.affinities
      ? Object.fromEntries(Object.entries(props.brain.affinities).map(([k, v]) => [k, Math.round(v)]))
      : {};

    // Serialize body parts
    const bodyParts = {};
    for (const key of BODY_PART_KEYS) {
      if (!props[key]) continue;
      const part = props[key];
      const serialized = {};
      for (const [pk, pv] of Object.entries(part)) {
        if (typeof pv === "function") continue;
        if (pk === "heldItem" && pv && typeof pv === "object") {
          serialized.heldItem = {
            name: pv.name || null,
            resourceType: pv.resourceType || null,
            species: pv.species || null
          };
        } else if (typeof pv !== "object" || pv === null) {
          serialized[pk] = pv;
        }
      }
      bodyParts[key] = serialized;
    }

    // Serialize geo memory (known zones)
    const geoMemory = props.brain?.geoMemory ? Object.keys(props.brain.geoMemory) : [];

    // Serialize recent memories (last 10)
    const memories = [];
    if (props.brain?.memories && Array.isArray(props.brain.memories)) {
      const memSlice = props.brain.memories.slice(-10);
      for (const m of memSlice) {
        if (!m) continue;
        memories.push({
          eventId: m.eventId || null,
          type: m.type || null,
          tick: m.tick || null,
          isLie: m.isLie || false,
          actorId: m.actorId || null,
          targetId: m.targetId || null,
          description: m.description || null
        });
      }
    }

    return {
      id: ent.id,
      name: props.name || `Entity #${ent.id}`,
      species: props.species || "creature",
      role: props.role || null,
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
      geoMemory,
      memories,
      bodyParts,
      fatUnits: props.stomach?.fatUnits || 0,
      energy: props.life ? Math.round(props.life.energy) : null,
      maxEnergy: props.life?.max || null,
      mood: props.brain && typeof props.brain.mood === "number" ? Math.round(props.brain.mood) : null,
      viewRange: props.eye_left?.viewRange || props.eye_right?.viewRange || null,
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

  // 5. Serialize terrain tile map as Base64
  let terrainBase64 = null;
  if (world && world.map && world.map instanceof Uint8Array) {
    const bytes = world.map.slice(0, world.width * world.height);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    terrainBase64 = btoa(binary);
  }

  return {
    version: "2.0",
    format: "brutopolis_chronicle",
    generatedAt: new Date().toISOString(),
    world: {
      width: world?.width || 512,
      height: world?.height || 512,
      clock: world?.clock ? { day: world.clock.day, hour: world.clock.hour, minute: world.clock.minute, totalSeconds: world.clock.totalSeconds } : null,
      tick: currentTick,
      terrain: terrainBase64
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
 * Serializes the complete live simulation state for full persistence & seamless resume
 */
export function exportWorldSaveJSON(world, entities, currentTick = 0, entityRegistry = null, groups = [], camera = null, seed = 0, preset = 0) {
  let terrainBase64 = null;
  if (world && world.map && world.map instanceof Uint8Array) {
    const bytes = world.map.slice(0, world.width * world.height);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    terrainBase64 = btoa(binary);
  }

  // Clone entities properties cleanly (stripping functions)
  function serializeEntity(ent) {
    if (!ent) return null;
    const cleanProps = {};
    for (const [k, v] of Object.entries(ent.properties || {})) {
      if (typeof v === "function") continue;
      try {
        cleanProps[k] = JSON.parse(JSON.stringify(v, (key, val) => typeof val === "function" ? undefined : val));
      } catch (e) {
        // Fallback for circular references
      }
    }
    return {
      id: ent.id,
      x: ent.x,
      y: ent.y,
      birthTick: ent.birthTick,
      deathTick: ent.deathTick,
      destroyed: !!ent.destroyed,
      renderable: ent.renderable || null,
      properties: cleanProps
    };
  }

  const activeEntities = entities.map(serializeEntity);
  const registryEntities = [];
  if (entityRegistry) {
    for (const [id, ent] of entityRegistry.entries()) {
      if (!entities.some(e => e.id === id)) {
        registryEntities.push(serializeEntity(ent));
      }
    }
  }

  // Serialize all events
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
    version: "2.1",
    format: "brutopolis_full_save",
    savedAt: new Date().toISOString(),
    world: {
      width: world?.width || 512,
      height: world?.height || 512,
      preset,
      seed,
      clock: world?.clock ? {
        day: world.clock.day,
        hour: world.clock.hour,
        minute: world.clock.minute,
        globalLight: world.clock.globalLight,
        totalSeconds: world.clock.totalSeconds
      } : null,
      tick: currentTick,
      terrain: terrainBase64
    },
    camera: camera || { x: 256, y: 256, zoom: 1.0 },
    groups: groups || [],
    entities: activeEntities,
    registry: registryEntities,
    events: eventsList
  };
}

/**
 * Triggers browser download of the full simulation save JSON file
 */
export function downloadWorldSaveJSON(world, entities, currentTick = 0, entityRegistry = null, groups = [], camera = null, seed = 0, preset = 0) {
  const saveObj = exportWorldSaveJSON(world, entities, currentTick, entityRegistry, groups, camera, seed, preset);
  const jsonStr = JSON.stringify(saveObj);
  const blob = new Blob([jsonStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const day = world?.clock?.day || 0;
  const hour = world?.clock?.hour || 0;
  const filename = `brutopolis_save_d${day}_h${hour}_t${currentTick}.json`;

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return filename;
}

/**
 * Restores world events from a save or imported chronicle
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

    if (ev.primaryEntityId !== null && ev.primaryEntityId !== undefined) {
      if (!eventsByEntity.has(ev.primaryEntityId)) eventsByEntity.set(ev.primaryEntityId, []);
      eventsByEntity.get(ev.primaryEntityId).push(ev.id);
    }
    if (ev.secondaryEntityId !== null && ev.secondaryEntityId !== undefined) {
      if (!eventsByEntity.has(ev.secondaryEntityId)) eventsByEntity.set(ev.secondaryEntityId, []);
      eventsByEntity.get(ev.secondaryEntityId).push(ev.id);
    }
    if (ev.opcode) {
      if (!eventsByType.has(ev.opcode)) eventsByType.set(ev.opcode, []);
      eventsByType.get(ev.opcode).push(ev.id);
    }
    if (ev.metadata?.citedEventId) {
      if (!eventsByCitedEvent.has(ev.metadata.citedEventId)) eventsByCitedEvent.set(ev.metadata.citedEventId, []);
      eventsByCitedEvent.get(ev.metadata.citedEventId).push(ev.id);
    }
    if (ev.id > maxId) maxId = ev.id;
  }
  nextEventId = maxId + 1;
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

