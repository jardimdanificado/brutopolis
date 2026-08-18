// =============================================================================
// Brutopolis — Chronological & Indexed World Event Log System
// =============================================================================

let nextEventId = 1;
export const allEvents = [];
export const eventsById = new Map();
export const eventsByEntity = new Map();
export const eventsByType = new Map();

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
  type,
  primaryEntityId,
  secondaryEntityId = null,
  location = { x: 0, y: 0 },
  description = "",
  tick = 0,
  timestamp = null,
  metadata = {}
}) {
  const event = {
    id: nextEventId++,
    tick,
    timestamp: timestamp || { day: 0, hour: 0, minute: 0 },
    type, // "BIRTH", "DEATH", "ATTACK", "AMPUTATION", "FEED", "SPROUT"
    primaryEntityId,
    secondaryEntityId,
    location: { x: Math.round(location.x), y: Math.round(location.y) },
    description,
    metadata
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
  if (!eventsByType.has(type)) {
    eventsByType.set(type, []);
  }
  eventsByType.get(type).push(event.id);

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
 * Retrieves the most recent world events
 */
export function getRecentWorldEvents(limit = 25) {
  const start = Math.max(0, allEvents.length - limit);
  return allEvents.slice(start).reverse();
}
