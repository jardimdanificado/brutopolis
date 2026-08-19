import { createEntity, getEntityById, currentTick } from "./engine.js";
import { recordWorldEvent } from "./event_log.js";
import { vocabulario } from "./vocabulario.js";

// ---------------------------------------------------------------------------
// 0. Energy Cost Multipliers Based on Physical Condition & Color Similarity
// ---------------------------------------------------------------------------

export function getDamagedEnergyMultiplier(condition, maxCondition = 100) {
  if (condition >= maxCondition) return 1.0;
  const ratio = Math.max(0, condition) / Math.max(1, maxCondition);
  return 1.0 + 4.0 * Math.pow(1.0 - ratio, 2);
}

export function getColorSimilarityBoost(colorA, colorB) {
  if (colorA === undefined || colorB === undefined) return 1.0;
  const rA = (colorA >> 16) & 0xff;
  const gA = (colorA >> 8) & 0xff;
  const bA = colorA & 0xff;

  const rB = (colorB >> 16) & 0xff;
  const gB = (colorB >> 8) & 0xff;
  const bB = colorB & 0xff;

  const diff = Math.hypot(rA - rB, gA - gB, bA - bB);
  return diff < 80 ? 1.1 : 1.0;
}

export function generateRandomDietaryPreferences() {
  const parts = ["leg", "arm", "organ", "bone", "meat", "eye", "wings"];
  const speciesList = ["human", "wolf", "cat", "bear", "goblin", "bat", "serpent", "dragon", "oak", "willow", "pine"];

  const likes = [];
  const dislikes = [];

  const likedPart = parts[Math.floor(Math.random() * parts.length)];
  const likedSpecies = speciesList[Math.floor(Math.random() * speciesList.length)];
  likes.push({ type: "part", value: likedPart, bonus: 1.4 });
  likes.push({ type: "species", value: likedSpecies, bonus: 1.5 });

  const dislikedPart = parts[(parts.indexOf(likedPart) + 2) % parts.length];
  dislikes.push({ type: "part", value: dislikedPart, penalty: 0.6 });

  return { likes, dislikes };
}

// ---------------------------------------------------------------------------
// 1. Respiration & Vital Organs
// ---------------------------------------------------------------------------

/**
 * Terrestrial Property (Land Dweller / Walker)
 */
export function createTerrestrialProp() {
  return {
    type: "terrestrial",
    struggleTimer: 0,
    effect(ent, dt, world) {
      if (!ent.properties.life || !world) return;
      const isFlying = !!ent.properties.flying || ent.properties.wings?.flying === true;
      const isAquatic = !!ent.properties.aquatic;
      const inWater = world.getTile(ent.x, ent.y) === 2;

      // Terrestrial creatures in water suffer drowning / water exhaustion, but have a tiny chance to learn swimming!
      if (inWater && !isFlying && !isAquatic) {
        ent.properties.life.energy = Math.max(0, ent.properties.life.energy - dt * 25.0);
        ent.combatFlash = 1;

        // Minuscule chance to learn how to swim while in water!
        this.struggleTimer = (this.struggleTimer || 0) + dt;
        if (this.struggleTimer > 3.0 && Math.random() < 0.003 * dt) {
          ent.properties.aquatic = createAquaticProp();
          recordWorldEvent({
            type: "SPROUT",
            primaryEntityId: ent.id,
            location: { x: ent.x, y: ent.y },
            description: `${ent.properties.name} superou o pânico das águas e aprendeu a nadar com destreza!`,
            tick: currentTick,
            timestamp: world?.clock ? { day: world.clock.day, hour: world.clock.hour, minute: world.clock.minute } : null
          });
        }
      } else {
        this.struggleTimer = 0;
      }
    }
  };
}

/**
 * Mystic Grace (Proteção Mística Inicial que previne violência nos primeiros minutos)
 */
export function createMysticGraceProp(durationSeconds = 180) {
  return {
    name: "Graça Mística",
    duration: durationSeconds,
    current: 0,
    active: true,
    effect(ent, dt, world) {
      if (!this.active) return;
      this.current += dt;
      if (this.current >= this.duration) {
        this.active = false;
        delete ent.properties.mystic_grace;
        recordWorldEvent({
          type: "DIALOGUE",
          primaryEntityId: ent.id,
          location: { x: ent.x, y: ent.y },
          description: `A Graça Mística que protegia ${ent.properties.name} dissipou-se nos ares.`,
          tick: currentTick,
          timestamp: world?.clock ? { day: world.clock.day, hour: world.clock.hour, minute: world.clock.minute } : null
        });
      }
    }
  };
}

/**
 * Scatological Trait: Consumes feces with happiness, admires others who do the same
 */
export function createScatologicalProp() {
  return {
    name: "Escatológico",
    description: "Sente prazer ao consumir dejetos e admira criaturas com hábitos semelhantes.",
    effect(ent, dt) {}
  };
}

/**
 * Aquatic Property (Water Dweller / Swimmer)
 */
export function createAquaticProp() {
  return {
    type: "aquatic",
    effect(ent, dt, world) {
      if (!ent.properties.life || !world) return;
      const isFlying = !!ent.properties.flying || ent.properties.wings?.flying === true;
      const isTerrestrial = !!ent.properties.terrestrial;
      const inWater = world.getTile(ent.x, ent.y) === 2;

      // Pure aquatic creatures stranded on dry land suffer suffocation / desiccation
      if (!inWater && !isFlying && !isTerrestrial) {
        ent.properties.life.energy = Math.max(0, ent.properties.life.energy - dt * 60.0);
        ent.combatFlash = 2;
      }
    }
  };
}

/**
 * Flying Property (Aerial Mobility - passes over all terrain including water and mountains)
 */
export function createFlyingProp(speedBonus = 2.0) {
  return {
    type: "flying",
    flying: true,
    speedBonus,
    effect(ent, dt, world) {
      // Soars above all terrains effortlessly
    }
  };
}

/**
 * Life / Basal Metabolic Energy (Extended Duration & Slower Decay)
 */
export function createLifeProp(energy = 8000, max = 8000, basalRate = 0.25) {
  return {
    energy,
    max,
    basalRate,
    effect(ent, dt) {
      this.energy = Math.max(0, this.energy - dt * this.basalRate);
    }
  };
}

/**
 * Cellular / Tissue Body Regeneration (10 Energy : 1 Condition)
 */
export function createBodyRegenerationProp(rate = 1.0, maxRegenPerTick = 4, energyPerPoint = 10) {
  return {
    rate,
    energyPerPoint,
    maxRegenPerTick,
    effect(ent) {
      if (!ent.properties.life || ent.properties.life.energy < 300) return;

      for (const [key, prop] of Object.entries(ent.properties)) {
        if (prop && typeof prop.condition === "number" && typeof prop.maxCondition === "number") {
          if (prop.condition < prop.maxCondition) {
            const needed = prop.maxCondition - prop.condition;
            const toHeal = Math.min(needed, this.maxRegenPerTick);
            const energyCost = toHeal * this.energyPerPoint;

            if (ent.properties.life.energy >= energyCost + 200) {
              ent.properties.life.energy -= energyCost;
              prop.condition = Math.min(prop.maxCondition, prop.condition + toHeal);
            }
          }
        }
      }
    }
  };
}

/**
 * Stomach with Internal Capacity, Diet Efficiencies, and Excretion
 */
export function createStomachProp(capacity = 4, diet = { meat: 1.0, plant: 0.8, fruit: 1.2, organ: 1.1, bone: 0.3 }) {
  return {
    capacity,
    items: [],
    diet,
    waste: 0,
    wasteThreshold: 4500, // Requires digesting multiple meals before producing feces
    pendingSeeds: [],
    effect(ent, dt, world, entities) {
      if (!this.items || this.items.length === 0) return;

      for (let i = this.items.length - 1; i >= 0; i--) {
        const item = this.items[i];
        const efficiency = this.diet[item.foodType] !== undefined ? this.diet[item.foodType] : 0.5;
        const energyExtracted = (item.nutrition / item.totalTurns) * efficiency;

        if (ent.properties.life) {
          ent.properties.life.energy = Math.min(
            ent.properties.life.max,
            ent.properties.life.energy + energyExtracted * dt
          );
        }

        item.remainingTurns -= dt;

        if (item.remainingTurns <= 0) {
          const finishedItem = this.items.splice(i, 1)[0];
          this.waste = (this.waste || 0) + (finishedItem.nutrition || 1000);
          if (finishedItem.seed) {
            if (!this.pendingSeeds) this.pendingSeeds = [];
            this.pendingSeeds.push(finishedItem.seed);
          }

          if (this.waste >= (this.wasteThreshold || 4500)) {
            this.waste -= (this.wasteThreshold || 4500);
            if (entities && world) {
              const seedToPass = this.pendingSeeds && this.pendingSeeds.length > 0 ? this.pendingSeeds.shift() : null;
              const poop = createPoopEntity(ent.x, ent.y, seedToPass);
              entities.push(poop);
            }
          }
        }
      }
    }
  };
}

/**
 * Bladder (Water Storage)
 */
export function createBladderProp(water = 3000, maxWater = 3000) {
  return {
    water,
    maxWater
  };
}

/**
 * Kidney (Water consumption ratio per energy spent)
 */
export function createKidneyProp(ratio = 0.75) {
  return {
    ratio,
    condition: 100,
    maxCondition: 100,
    nutrition: 500,
    foodType: "organ",
    effect(ent, dt) {
      if (!ent.properties.bladder) return;

      const mult = getDamagedEnergyMultiplier(this.condition, this.maxCondition);
      const waterDrain = 1.0 * this.ratio * mult * dt;
      ent.properties.bladder.water = Math.max(0, ent.properties.bladder.water - waterDrain);

      if (ent.properties.bladder.water <= 0 && ent.properties.life) {
        ent.properties.life.energy = Math.max(0, ent.properties.life.energy - dt * 15.0);
      }
    }
  };
}

export function getMoodLabel(moodVal) {
  const m = typeof moodVal === "number" ? moodVal : 0;
  if (m >= 70) return `Euphoric (+${Math.round(m)})`;
  if (m >= 25) return `Happy (+${Math.round(m)})`;
  if (m >= -20) return `Serene (${Math.round(m)})`;
  if (m >= -60) return `Anxious (${Math.round(m)})`;
  return `Depressed (${Math.round(m)})`;
}

/**
 * Brain (Quality, Short/Long-Term Memory, 8x8 Geographic Zones & Territorial Affinities, Object Memory, Dietary Preferences)
 */
export function createBrainProp(maxPath = 16, personality = { bravery: 0.7, curiosity: 0.8, aggression: 0.3 }, quality = 1.0, isExplorer = false) {
  const shortCap = Math.max(4, Math.floor(quality * 10));
  const objCap = isExplorer ? Infinity : Math.max(4, Math.floor(quality * 8));

  return {
    quality,
    maxPath,
    path: [],
    mood: 35, // Numeric mood counter (-100 to +100)
    personality,
    affinities: {}, // { [targetEntityId]: number }
    preferences: generateRandomDietaryPreferences(),

    // Short-term perception buffer (overwrites oldest entries)
    shortTermMemory: [],
    shortTermCapacity: shortCap,

    // Long-term episodic memory (traumatic or joyful key events)
    longTermMemory: [],

    // 8x8 Geographic Zones Memory (Infinite)
    geoMemory: {}, // { [zoneKey]: { zx, zy, affinity, timeSpent, lastVisitedTick } }
    territoryZoneKey: null,

    // Object / Resource Memory
    objectMemory: [], // [{ entityId, name, foodType, nutrition, x, y, seenTick }]
    objectCapacity: objCap,

    addShortTerm(eventData) {
      this.shortTermMemory.push({ tick: currentTick, ...eventData });
      if (this.shortTermMemory.length > this.shortTermCapacity) {
        this.shortTermMemory.shift();
      }
    },

    addLongTerm(eventData) {
      if (!this.longTermMemory.some(e => e.type === eventData.type && e.desc === eventData.desc)) {
        this.longTermMemory.push({ tick: currentTick, ...eventData });
      }
    },

    rememberObject(item) {
      if (!item) return;
      const itemId = item.id !== undefined ? item.id : item.entityId;
      const idx = this.objectMemory.findIndex(m => (m.entityId === itemId || m.id === itemId));
      if (idx >= 0) {
        this.objectMemory[idx].x = item.x;
        this.objectMemory[idx].y = item.y;
        this.objectMemory[idx].seenTick = currentTick;
        return;
      }

      const rec = {
        entityId: itemId,
        id: itemId,
        name: item.properties?.name || item.name || "Object",
        species: item.properties?.species || item.species || "item",
        resourceType: item.properties?.resourceType || item.resourceType,
        foodType: item.properties?.edible?.foodType || item.foodType,
        nutrition: item.properties?.edible?.nutrition || item.nutrition || 0,
        x: item.x,
        y: item.y,
        seenTick: currentTick
      };

      this.objectMemory.push(rec);
      if (this.objectMemory.length > this.objectCapacity) {
        this.objectMemory.shift();
      }
    },

    forgetObject(entityId) {
      this.objectMemory = this.objectMemory.filter(m => (m.entityId !== entityId && m.id !== entityId));
    },

    condition: 100,
    maxCondition: 100,
    nutrition: 800,
    foodType: "organ",
    effect(ent, dt, world, entities) {
      if (ent.properties.life) {
        const mult = getDamagedEnergyMultiplier(this.condition, this.maxCondition);
        ent.properties.life.energy = Math.max(0, ent.properties.life.energy - dt * 5.0 * mult);
      }

      // 1. Geographic Zone Tracking (8x8 Area)
      const zx = Math.floor(ent.x / 8);
      const zy = Math.floor(ent.y / 8);
      const zoneKey = `${zx}_${zy}`;

      if (!this.geoMemory[zoneKey]) {
        this.geoMemory[zoneKey] = { zx, zy, affinity: 0, timeSpent: 0, lastVisitedTick: currentTick };
      }
      const geo = this.geoMemory[zoneKey];
      geo.timeSpent += dt;
      geo.lastVisitedTick = currentTick;
      geo.affinity = Math.min(100, geo.affinity + dt * 0.05);

      const viewRange = ent.properties.eye_left?.viewRange || ent.properties.eye_right?.viewRange || 8;
      const mySpecies = ent.properties.species || "creature";
      const myColor = ent.properties.render?.color;

      // 2. Scan Entities in Perception Range for Affinity, Memory & Object Memorization
      let allyAffinitySumInZone = 0;

      for (const other of entities) {
        if (other === ent || other.destroyed) continue;

        const dist = Math.abs(other.x - ent.x) + Math.abs(other.y - ent.y);
        if (dist > viewRange) continue;

        // Remember visible food items in Object Memory
        if (other.properties.edible) {
          this.rememberObject(other);
        }

        // Process Living Creatures: Species & Color Affinity
        if (other.properties.life) {
          const otherSpecies = other.properties.species || "creature";
          const isSameSpecies = otherSpecies === mySpecies;
          const otherColor = other.properties.render?.color;

          // Initial Encounter Affinity
          if (this.affinities[other.id] === undefined) {
            this.affinities[other.id] = isSameSpecies ? 30 : 0;
          }

          let currentAff = this.affinities[other.id];
          if (currentAff >= -50) {
            let gainRate = isSameSpecies ? (dt * 1.0) : (dt * 0.35);

            if (!isSameSpecies) {
              const colorBoost = getColorSimilarityBoost(myColor, otherColor);
              gainRate *= colorBoost;
            }

            this.affinities[other.id] = Math.min(100, currentAff + gainRate);
          }

          if (this.affinities[other.id] >= 30) {
            allyAffinitySumInZone += this.affinities[other.id];
          }
        }
      }

      // Boost Zone Affinity when accompanied by trusted allies in this zone
      if (allyAffinitySumInZone > 0) {
        geo.affinity = Math.min(100, geo.affinity + dt * 0.08 * (allyAffinitySumInZone / 100));
      }

      // 3. Territorial Zone Demarcation for Territorial Creatures
      const isTerritorial = (this.personality?.aggression || 0) >= 0.4 || ["wolf", "bear", "dragon", "goblin"].includes(mySpecies);
      if (isTerritorial && geo.affinity >= 20) {
        if (!this.territoryZoneKey || (this.geoMemory[this.territoryZoneKey]?.affinity || 0) < geo.affinity) {
          this.territoryZoneKey = zoneKey;
        }
      }

      // 4. Spontaneous Flashback from Long-Term Memory (Affects mood and affinities slightly)
      if (this.longTermMemory.length > 0 && Math.random() < 0.006) {
        const mem = this.longTermMemory[Math.floor(Math.random() * this.longTermMemory.length)];
        const memoryDesc = mem.desc || mem.description || `${mem.type} event`;

        if (mem.type === "AMPUTATION" || mem.type === "ATTACK" || mem.type === "DEATH" || mem.type === "KILL_WITNESS") {
          this.mood = Math.max(-100, this.mood - 18);
          if (mem.secondaryEntityId && this.affinities[mem.secondaryEntityId] !== undefined) {
            this.affinities[mem.secondaryEntityId] = Math.max(-100, this.affinities[mem.secondaryEntityId] - 2);
          }
        } else if (mem.type === "FEED" || mem.type === "BIRTH" || mem.type === "SPROUT" || mem.type === "KILL") {
          this.mood = Math.min(100, this.mood + 18);
          if (mem.secondaryEntityId && this.affinities[mem.secondaryEntityId] !== undefined) {
            this.affinities[mem.secondaryEntityId] = Math.min(100, this.affinities[mem.secondaryEntityId] + 2);
          }
        }

        const moodLabel = getMoodLabel(this.mood);
        recordWorldEvent({
          type: "DIALOGUE",
          primaryEntityId: ent.id,
          location: { x: ent.x, y: ent.y },
          description: `${ent.properties.name} quietly reminisced: "${memoryDesc}" [Mood: ${moodLabel}]`,
          tick: currentTick,
          timestamp: world?.clock ? { day: world.clock.day, hour: world.clock.hour, minute: world.clock.minute } : null
        });
      }

      // 5. Interpersonal Relationship Milestones (Friendship >= 50 or Hatred <= -50)
      if (!this.affinityMilestones) this.affinityMilestones = {};
      for (const [targetIdStr, affVal] of Object.entries(this.affinities)) {
        const tId = parseInt(targetIdStr, 10);
        const prevMilestone = this.affinityMilestones[tId] || "neutral";
        if (affVal >= 50 && prevMilestone !== "friend") {
          this.affinityMilestones[tId] = "friend";
          const friend = entities?.find(e => e.id === tId && !e.destroyed);
          const friendName = friend?.properties.name || `Entity #${tId}`;
          recordWorldEvent({
            type: "RELATION",
            primaryEntityId: ent.id,
            secondaryEntityId: tId,
            location: { x: ent.x, y: ent.y },
            description: `${ent.properties.name} developed a deep bond of friendship with ${friendName} (affinity +${Math.round(affVal)})!`,
            tick: currentTick
          });
        } else if (affVal <= -50 && prevMilestone !== "enemy") {
          this.affinityMilestones[tId] = "enemy";
          const enemy = entities?.find(e => e.id === tId && !e.destroyed);
          const enemyName = enemy?.properties.name || `Entity #${tId}`;
          recordWorldEvent({
            type: "RELATION",
            primaryEntityId: ent.id,
            secondaryEntityId: tId,
            location: { x: ent.x, y: ent.y },
            description: `${ent.properties.name} declared mortal hatred and rivalry against ${enemyName} (affinity ${Math.round(affVal)})!`,
            tick: currentTick
          });
        }
      }

      // 6. Knowledge Sharing Between Nearby Allies & Friends
      if (entities && Math.random() < 0.04) {
        for (const other of entities) {
          if (other !== ent && !other.destroyed && other.properties.brain && other.properties.life) {
            const dist = Math.abs(other.x - ent.x) + Math.abs(other.y - ent.y);
            if (dist <= 4) {
              const isClan = ent.properties.group && other.properties.group === ent.properties.group;
              const aff = this.affinities?.[other.id] || 0;
              if (isClan || aff >= 15) {
                if (this.objectMemory.length > 0) {
                  const randomObj = this.objectMemory[Math.floor(Math.random() * this.objectMemory.length)];
                  if (!other.properties.brain.objectMemory.some(o => o.entityId === randomObj.entityId || o.id === randomObj.id)) {
                    other.properties.brain.rememberObject(randomObj);
                    if (!this.affinities) this.affinities = {};
                    if (!other.properties.brain.affinities) other.properties.brain.affinities = {};
                    this.affinities[other.id] = Math.min(100, (this.affinities[other.id] || 0) + 12);
                    other.properties.brain.affinities[ent.id] = Math.min(100, (other.properties.brain.affinities[ent.id] || 0) + 12);

                    recordWorldEvent({
                      type: "DIALOGUE",
                      primaryEntityId: ent.id,
                      secondaryEntityId: other.id,
                      location: { x: ent.x, y: ent.y },
                      description: `${ent.properties.name} pointed out the location of ${randomObj.name} at [X: ${randomObj.x}, Y: ${randomObj.y}] to ${other.properties.name}, strengthening their bond!`,
                      tick: currentTick,
                      timestamp: world?.clock ? { day: world.clock.day, hour: world.clock.hour, minute: world.clock.minute } : null
                    });
                    break;
                  }
                }
              }
            }
          }
        }
      }

      // 6. Group Expulsion Check: Expelled if majority of group members dislike entity (affinity <= 0)
      if (ent.properties.group && entities) {
        const group = ent.properties.group;
        let hateCount = 0;
        let totalCount = 0;

        for (const mid of group.members) {
          if (mid !== ent.id) {
            const m = entities.find(e => e.id === mid && !e.destroyed);
            if (m && m.properties.brain) {
              totalCount++;
              if ((m.properties.brain.affinities?.[ent.id] || 0) <= 0) {
                hateCount++;
              }
            }
          }
        }

        if (totalCount >= 2 && hateCount > totalCount / 2) {
          // Expelled from the group!
          group.members = group.members.filter(id => id !== ent.id);
          delete ent.properties.group;

          recordWorldEvent({
            type: "RELATION",
            primaryEntityId: ent.id,
            secondaryEntityId: group.id,
            location: { x: ent.x, y: ent.y },
            description: `${ent.properties.name} was expelled from faction '${group.name}' by vote of the majority!`,
            tick: currentTick
          });
        }
      }
    }
  };
}

/**
 * Leg (Mobility for Bipeds/Humanoids, Attack with Kicks)
 */
export function createLegProp(side = "left", quality = 1.0, condition = 100, maxCondition = 100) {
  return {
    side,
    quality,
    condition,
    maxCondition,
    nutrition: 600,
    foodType: "meat",
    kickDamage: 250,
    effect(ent, dt) {
      if (ent.properties.life) {
        const mult = getDamagedEnergyMultiplier(this.condition, this.maxCondition);
        ent.properties.life.energy = Math.max(0, ent.properties.life.energy - dt * 1.0 * mult);
      }
    }
  };
}

/**
 * Paw (Limb for Beasts: locomotion + claws that boost attack and regrow over time, cannot hold items)
 */
export function createPawProp(side = "front_left", quality = 1.0, condition = 100, maxCondition = 100, clawsCount = 4, maxClaws = 4, clawDamage = 18) {
  return {
    side,
    quality,
    condition,
    maxCondition,
    clawsCount,
    maxClaws,
    clawDamage,
    clawRegrowTimer: 0,
    punchDamage: 12,
    nutrition: 500,
    foodType: "meat",
    effect(ent, dt) {
      if (ent.properties.life) {
        const mult = getDamagedEnergyMultiplier(this.condition, this.maxCondition);
        ent.properties.life.energy = Math.max(0, ent.properties.life.energy - dt * 0.7 * mult);

        // Claws regrowth if any were lost and creature has sufficient energy
        if (this.clawsCount < this.maxClaws && ent.properties.life.energy > 300) {
          this.clawRegrowTimer = (this.clawRegrowTimer || 0) + dt;
          if (this.clawRegrowTimer >= 20.0) { // Regrows 1 claw every 20s
            this.clawRegrowTimer = 0;
            this.clawsCount++;
            ent.properties.life.energy -= 40;
          }
        }
      }
    }
  };
}

/**
 * Wings (Flight & Aerial Locomotion)
 */
export function createWingsProp(quality = 1.0, condition = 100, maxCondition = 100, energyCost = 22.0) {
  return {
    quality,
    condition,
    maxCondition,
    flying: true,
    energyCost,
    nutrition: 800,
    foodType: "meat",
    effect(ent, dt) {
      if (this.condition >= 25 && ent.properties.life && ent.properties.life.energy > 50) {
        this.flying = true;
        const mult = getDamagedEnergyMultiplier(this.condition, this.maxCondition);
        ent.properties.life.energy = Math.max(0, ent.properties.life.energy - dt * this.energyCost * mult);
      } else {
        this.flying = false;
      }
    }
  };
}

/**
 * Arm & Hand (Used by Humanoids to hold weapons, tools, timber, stone, and food)
 */
export function createArmProp(side = "left", quality = 1.0, condition = 100, maxCondition = 100, heldItem = null) {
  return {
    side,
    quality,
    condition,
    maxCondition,
    heldItem,
    punchDamage: 180,
    nutrition: 500,
    foodType: "meat",
    effect(ent, dt) {
      if (ent.properties.life) {
        const mult = getDamagedEnergyMultiplier(this.condition, this.maxCondition);
        ent.properties.life.energy = Math.max(0, ent.properties.life.energy - dt * 0.8 * mult);
      }
    }
  };
}

// --- Unique Name & Lineage Generator via Vocabulário Library ---
const usedBabyNames = new Set();

export function getRandomVocabWord() {
  const words = vocabulario.palavras;
  if (!words || words.length === 0) return "Pioneiro";
  for (let i = 0; i < 60; i++) {
    const raw = words[Math.floor(Math.random() * words.length)];
    if (raw && typeof raw === "string") {
      const clean = raw.trim().replace(/[^a-zA-ZáéíóúâêôãõçÁÉÍÓÚÂÊÔÃÕÇ]/g, "");
      if (clean.length >= 3 && clean.length <= 12) {
        return clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase();
      }
    }
  }
  return "Pioneiro";
}

export function getMotherSurname(mother) {
  if (mother.properties?.surname) return mother.properties.surname;

  // Extract from name if name contains a surname
  const rawName = (mother.properties?.name || "").replace(/,\s*the\s+\w+/i, "").trim();
  const parts = rawName.split(/\s+/);
  if (parts.length >= 2 && !["Jr", "Jr.", "the", "Filho", "Filha", "Matriarch", "Explorer", "Builder", "Miner", "Hunter", "Farmer"].includes(parts[parts.length - 1])) {
    mother.properties.surname = parts[parts.length - 1];
    return mother.properties.surname;
  }

  // Otherwise assign a lineage surname from vocabulario
  const newSurname = getRandomVocabWord();
  if (mother.properties) mother.properties.surname = newSurname;
  return newSurname;
}

export function generateBabyName(mother, entities = []) {
  const motherSurname = getMotherSurname(mother);
  let firstName = "";
  let isTribute = false;
  let tributeTargetName = null;

  // Check if mother has high affinity (>= 60) with someone
  const affinities = mother.properties?.brain?.affinities || {};
  let bestPartner = null;
  let highestAff = 59;

  if (entities) {
    for (const other of entities) {
      if (other !== mother && !other.destroyed && other.properties?.name) {
        const aff = affinities[other.id] || 0;
        if (aff > highestAff) {
          highestAff = aff;
          bestPartner = other;
        }
      }
    }
  }

  // 35% chance to tribute high-affinity friend/partner if available
  if (bestPartner && Math.random() < 0.35) {
    const friendRaw = (bestPartner.properties.name || "Friend")
      .replace(/,\s*the\s+\w+/i, "")
      .replace(/\s+Jr\.?/i, "")
      .trim();
    const friendFirstName = friendRaw.split(/\s+/)[0];
    if (friendFirstName && friendFirstName.length >= 2) {
      firstName = `${friendFirstName} Jr.`;
      isTribute = true;
      tributeTargetName = bestPartner.properties.name;
    }
  }

  if (!firstName) {
    firstName = getRandomVocabWord();
  }

  let finalName = `${firstName} ${motherSurname}`.trim();

  // Guarantee global uniqueness
  let attempts = 0;
  while ((usedBabyNames.has(finalName) || (entities && entities.some(e => !e.destroyed && e.properties?.name === finalName))) && attempts < 25) {
    attempts++;
    const extraWord = getRandomVocabWord();
    if (isTribute) {
      finalName = `${firstName} ${extraWord} ${motherSurname}`.trim();
    } else {
      try {
        const combined = vocabulario.combinar(firstName, extraWord, 'eufonia');
        finalName = `${combined.charAt(0).toUpperCase() + combined.slice(1)} ${motherSurname}`;
      } catch (e) {
        finalName = `${firstName} ${extraWord} ${motherSurname}`.trim();
      }
    }
  }

  usedBabyNames.add(finalName);
  return { name: finalName, isTribute, tributeTo: tributeTargetName, surname: motherSurname };
}

const usedGlobalNames = new Set();
const usedWeaponNames = new Set();

export function generateUniqueCreatureName(roleTitle = "Creature", species = "human") {
  const firstName = getRandomVocabWord();
  const surname = getRandomVocabWord();
  let candidate = species === "human"
    ? `${firstName} ${surname}, the ${roleTitle}`
    : `${firstName} the ${roleTitle}`;

  let attempts = 0;
  while (usedGlobalNames.has(candidate) && attempts < 30) {
    attempts++;
    const extra = getRandomVocabWord();
    try {
      const combined = vocabulario.combinar(firstName, extra, 'eufonia');
      const cFirst = combined.charAt(0).toUpperCase() + combined.slice(1);
      candidate = species === "human"
        ? `${cFirst} ${surname}, the ${roleTitle}`
        : `${cFirst} the ${roleTitle}`;
    } catch (e) {
      candidate = `${firstName} ${extra} ${surname}, the ${roleTitle}`;
    }
  }

  usedGlobalNames.add(candidate);
  return { fullName: candidate, firstName, surname };
}

export function generateUniqueWeaponName(baseType = "Blade") {
  const epithet = getRandomVocabWord();
  let candidate = `${baseType} of ${epithet}`;

  let attempts = 0;
  while (usedWeaponNames.has(candidate) && attempts < 30) {
    attempts++;
    const epithet2 = getRandomVocabWord();
    try {
      const combined = vocabulario.combinar(epithet, epithet2, 'eufonia');
      const cEp = combined.charAt(0).toUpperCase() + combined.slice(1);
      candidate = `${baseType} of ${cEp}`;
    } catch (e) {
      candidate = `${baseType} of ${epithet} ${epithet2}`;
    }
  }

  usedWeaponNames.add(candidate);
  return candidate;
}

const usedFloraNames = new Set();

export function generateUniqueFloraName(baseTitle = "Oak", species = "oak") {
  const epithet = getRandomVocabWord();
  let candidate = `${baseTitle} of ${epithet}`;

  let attempts = 0;
  while (usedFloraNames.has(candidate) && attempts < 30) {
    attempts++;
    const extra = getRandomVocabWord();
    try {
      const combined = vocabulario.combinar(epithet, extra, 'eufonia');
      const cEp = combined.charAt(0).toUpperCase() + combined.slice(1);
      candidate = `${baseTitle} of ${cEp}`;
    } catch (e) {
      candidate = `${baseTitle} of ${epithet} ${extra}`;
    }
  }

  usedFloraNames.add(candidate);
  return candidate;
}

/**
 * Genitalia (Sex & Procreation with Birth Event Logs)
 */
export function createGenitaliaProp(type = "penis", isPregnant = false) {
  return {
    type,
    reproduction: "sexual",
    condition: 100,
    maxCondition: 100,
    pregnantTimer: isPregnant ? 15.0 : 0,
    isPregnant: !!isPregnant,
    matingCooldown: 0,
    nutrition: 300,
    foodType: "organ",
    effect(ent, dt, world, entities) {
      if (!ent.properties.life) return;
      const mult = getDamagedEnergyMultiplier(this.condition, this.maxCondition);
      ent.properties.life.energy = Math.max(0, ent.properties.life.energy - dt * 0.1 * mult);

      this.matingCooldown = Math.max(0, (this.matingCooldown || 0) - dt);

      // Pregnancy gestation and childbirth
      if (this.isPregnant) {
        this.pregnantTimer = (this.pregnantTimer || 0) + dt;
        if (this.pregnantTimer >= 40.0 && entities) { // Childbirth after 40s
          this.isPregnant = false;
          this.pregnantTimer = 0;
          this.matingCooldown = 120.0; // Postpartum recovery cooldown

          const babySpecies = ent.properties.species || "human";
          const babyGender = Math.random() < 0.5 ? "female" : "male";

          const nameInfo = generateBabyName(ent, entities);
          const babyName = nameInfo.name;

          const baby = createEntity(
            {
              name: babyName,
              species: babySpecies,
              render: { ...ent.properties.render },
              life: createLifeProp(Math.round(ent.properties.life.max * 0.6), Math.round(ent.properties.life.max * 0.6)),
              brain: createBrainProp(16, { bravery: 0.6, curiosity: 0.9, aggression: 0.1 }, 1.0),
              stomach: createStomachProp(3, { meat: 1.0, plant: 1.0, fruit: 1.0, organ: 0.8, bone: 0.1 }),
              bladder: createBladderProp(2000, 2000),
              kidney: createKidneyProp(0.75),
              body_regen: createBodyRegenerationProp(1.0, 4, 10),
              combat: createCombatProp(0.8, 1),
              locomotion: createLocomotionProp(),
              torso: { condition: 80, maxCondition: 80, nutrition: 1200, foodType: "meat" }
            },
            ent.x + (Math.floor(Math.random() * 3) - 1),
            ent.y + (Math.floor(Math.random() * 3) - 1)
          );

          // Store inherited lineage surname
          baby.properties.surname = nameInfo.surname;

          // Sensory & Vital Organs
          if (ent.properties.terrestrial) baby.properties.terrestrial = createTerrestrialProp();
          if (ent.properties.aquatic) baby.properties.aquatic = createAquaticProp();
          if (ent.properties.flying) baby.properties.flying = createFlyingProp();
          if (ent.properties.mouth) baby.properties.mouth = createMouthProp(20, 20);
          if (ent.properties.communication) baby.properties.communication = createCommunicationProp(1.8);
          baby.properties.eye_left = createEyeProp("left", 8);
          baby.properties.eye_right = createEyeProp("right", 8);

          // Physical Limbs: Legs / Paws / Arms
          const hasPaws = Object.keys(ent.properties).some(k => k.startsWith("paw"));
          if (hasPaws) {
            baby.properties.paw_front_left = createPawProp("front_left", 0.75, 60, 60, 3, 3, 12);
            baby.properties.paw_front_right = createPawProp("front_right", 0.75, 60, 60, 3, 3, 12);
            baby.properties.paw_back_left = createPawProp("back_left", 0.75, 60, 60, 3, 3, 12);
            baby.properties.paw_back_right = createPawProp("back_right", 0.75, 60, 60, 3, 3, 12);
          } else {
            // Humanoid Biped
            baby.properties.arm_left = createArmProp("left", 0.8, 70, 70);
            baby.properties.arm_right = createArmProp("right", 0.8, 70, 70);
            baby.properties.leg_left = createLegProp("left", 0.8, 70, 70);
            baby.properties.leg_right = createLegProp("right", 0.8, 70, 70);
          }

          if (ent.properties.wings) {
            baby.properties.wings = createWingsProp(80, 80);
          }

          baby.properties.genitalia = createGenitaliaProp(babyGender === "female" ? "vagina" : "penis", false);

          // Inherit mother's group
          if (!ent.properties.group) {
            ent.properties.group = createGroup(`Clan of ${ent.properties.name}`, ent);
          }
          baby.properties.group = ent.properties.group;
          ent.properties.group.members.push(baby.id);

          // Immediate high mother-child bond (+95)
          if (ent.properties.brain) {
            if (!ent.properties.brain.affinities) ent.properties.brain.affinities = {};
            ent.properties.brain.affinities[baby.id] = 95;
            ent.properties.brain.mood = 90;
          }
          if (baby.properties.brain) {
            baby.properties.brain.affinities[ent.id] = 95;
            baby.properties.brain.mood = 80;
          }

          entities.push(baby);

          let tributeNotice = "";
          if (nameInfo.isTribute && nameInfo.tributeTo) {
            tributeNotice = ` (named in honor of ${nameInfo.tributeTo})`;
          }

          recordWorldEvent({
            type: "BIRTH",
            primaryEntityId: ent.id,
            secondaryEntityId: baby.id,
            location: { x: baby.x, y: baby.y },
            description: `${ent.properties.name} gave birth to a healthy newborn: ${baby.properties.name}${tributeNotice}!`,
            tick: currentTick,
            timestamp: world?.clock ? { day: world.clock.day, hour: world.clock.hour, minute: world.clock.minute } : null
          });
        }
        return;
      }

      // Mating attempt (female / vagina seeking male / penis of same species with mutual affinity >= 50)
      if ((this.type === "vagina" || this.type === "female") && this.matingCooldown <= 0 && !this.isPregnant && ent.properties.life.energy > ent.properties.life.max * 0.7) {
        if (entities && Math.random() < 0.1) {
          for (const mate of entities) {
            if (mate !== ent && !mate.destroyed && mate.properties.genitalia && (mate.properties.genitalia.type === "penis" || mate.properties.genitalia.type === "male")) {
              if (mate.properties.species === ent.properties.species && (mate.properties.genitalia.matingCooldown || 0) <= 0) {
                const dist = Math.abs(mate.x - ent.x) + Math.abs(mate.y - ent.y);
                if (dist <= 1) {
                  const aff = ent.properties.brain?.affinities?.[mate.id] || 0;
                  const mateAff = mate.properties.brain?.affinities?.[ent.id] || 0;
                  if (aff >= 50 && mateAff >= 50) {
                    this.isPregnant = true;
                    this.pregnantTimer = 0;
                    this.matingCooldown = 180.0; // Cooldown while pregnant and post-birth
                    mate.properties.genitalia.matingCooldown = 90.0;

                    recordWorldEvent({
                      type: "RELATION",
                      primaryEntityId: ent.id,
                      secondaryEntityId: mate.id,
                      location: { x: ent.x, y: ent.y },
                      description: `${ent.properties.name} e ${mate.properties.name} acasalaram em harmonia!`,
                      tick: currentTick,
                      timestamp: world?.clock ? { day: world.clock.day, hour: world.clock.hour, minute: world.clock.minute } : null
                    });
                    break;
                  }
                }
              }
            }
          }
        }
      }
    }
  };
}

/**
 * Eye (Detection Range & Vision)
 */
export function createEyeProp(side = "left", viewRange = 9) {
  return {
    side,
    viewRange,
    condition: 100,
    maxCondition: 100,
    nutrition: 150,
    foodType: "organ",
    effect(ent, dt) {
      if (ent.properties.life) {
        const mult = getDamagedEnergyMultiplier(this.condition, this.maxCondition);
        ent.properties.life.energy = Math.max(0, ent.properties.life.energy - dt * 0.05 * mult);
      }
    }
  };
}

/**
 * Mouth (Bite Attack, Talk Radius Boost, Teeth Count & Non-Regenerative Teeth Loss, Nutrition Chewing Boost)
 */
export function createMouthProp(teethCount = 28, maxTeeth = 28) {
  return {
    teethCount,
    maxTeeth,
    condition: 100,
    maxCondition: 100,
    nutrition: 500,
    foodType: "organ",
    talkRadius: 8,
    biteDamage: 32, // scales with (teethCount / maxTeeth)

    loseTooth(ent, world, entities) {
      if (this.teethCount <= 0) return null;
      this.teethCount--;
      const tooth = createToothItem(
        ent.x + (Math.floor(Math.random() * 3) - 1),
        ent.y + (Math.floor(Math.random() * 3) - 1),
        ent.properties.name
      );
      if (entities) entities.push(tooth);
      return tooth;
    },

    effect(ent, dt) {
      if (ent.properties.life) {
        const mult = getDamagedEnergyMultiplier(this.condition, this.maxCondition);
        ent.properties.life.energy = Math.max(0, ent.properties.life.energy - dt * 0.15 * mult);
      }
    }
  };
}

/**
 * Temporary Bruise (Contusão / Machucado temporário)
 */
export function createBruiseProp(duration = 30.0, severity = 1) {
  return {
    duration,
    remaining: duration,
    severity,
    effect(ent, dt) {
      this.remaining -= dt;
      if (this.remaining <= 0) {
        delete ent.properties.bruise;
      }
    }
  };
}

/**
 * Temporary Concussion (Concussão cerebral temporária que debuffa cognição e humor)
 */
export function createConcussionProp(duration = 45.0) {
  return {
    duration,
    remaining: duration,
    effect(ent, dt) {
      this.remaining -= dt;
      if (this.remaining <= 0) {
        delete ent.properties.concussion;
      }
    }
  };
}

/**
 * Permanent Scar (Cicatriz permanente de batalha duradoura)
 */
export function createScarProp(location = "torso", name = "Blade Scar") {
  return {
    location,
    name,
    effect() {}
  };
}

/**
 * Group / Faction System (Same JS Object shared by reference between all group members)
 */
let nextGroupId = 1;

export function createGroup(name, founder, baseZone = null, claimedZones = null) {
  let founderId = typeof founder === "object" && founder !== null ? founder.id : founder;
  let zx = 32;
  let zy = 32;
  let groupColor = 0xffe6a032;

  if (typeof founder === "object" && founder !== null) {
    if (founder.x !== undefined) zx = Math.floor(founder.x / 8);
    if (founder.y !== undefined) zy = Math.floor(founder.y / 8);
    if (founder.properties?.render?.color) groupColor = founder.properties.render.color;
  } else if (baseZone && Array.isArray(baseZone)) {
    zx = baseZone[0] || 32;
    zy = baseZone[1] || 32;
  }

  const defaultZones = [`${zx}_${zy}`, `${zx + 1}_${zy}`];

  const group = {
    id: nextGroupId++,
    name: name || `Clan #${nextGroupId}`,
    members: founderId !== undefined && founderId !== null ? [founderId] : [],
    claimedZones: claimedZones || defaultZones,
    campfire: null, // { x, y }
    storage: [],
    createdTick: currentTick,
    color: groupColor
  };
  return group;
}

/**
 * Calculates the total stockpile of a group across its claimed territory,
 * members' hands/inventories, and clan storage array.
 */
export function getGroupStockpile(group, entities) {
  if (!group) return { totalCount: 0, items: {}, breakdown: { ground: 0, members: 0, storage: 0 } };

  const items = {};
  let groundCount = 0;
  let memberCount = 0;
  let storageCount = 0;

  function addItem(rawName, category) {
    if (!rawName) return;
    let name = rawName;
    if (typeof rawName === "object") {
      name = rawName.name || rawName.resourceType || rawName.type || "Item";
    }
    name = String(name).trim();
    if (name.toLowerCase() === "wood" || name.toLowerCase() === "madeira") name = "Wood";
    else if (name.toLowerCase() === "stone" || name.toLowerCase() === "pedra") name = "Stone";
    else if (name.toLowerCase() === "fruit" || name.toLowerCase() === "fruto") name = "Fruit";
    else if (name.toLowerCase() === "seed" || name.toLowerCase() === "semente") name = "Seed";
    else if (name.toLowerCase() === "meat" || name.toLowerCase() === "carne") name = "Meat";
    else if (name.toLowerCase() === "feces" || name.toLowerCase() === "fezes") name = "Feces";

    items[name] = (items[name] || 0) + 1;
    if (category === "ground") groundCount++;
    else if (category === "members") memberCount++;
    else if (category === "storage") storageCount++;
  }

  // 1. Clan Storage Array
  if (Array.isArray(group.storage)) {
    for (const it of group.storage) {
      addItem(it, "storage");
    }
  }

  // 2. Members' Held Items & Inventories
  const livingMemberIds = new Set(group.members || []);
  if (entities && Array.isArray(entities)) {
    for (const ent of entities) {
      if (ent.destroyed) continue;

      if (livingMemberIds.has(ent.id)) {
        // Check arms/hands
        for (const [k, p] of Object.entries(ent.properties || {})) {
          if (k.startsWith("arm") && p && p.heldItem) {
            const it = p.heldItem;
            addItem(it.name || it.resourceType || it.type || "Item", "members");
          }
        }
        // Check inventory arrays/bags if any
        if (Array.isArray(ent.properties?.inventory)) {
          for (const it of ent.properties.inventory) {
            addItem(it, "members");
          }
        }
      }

      // 3. Ground Items in Claimed Zones
      const isGroundItem = !ent.properties.life && (
        ent.properties.resourceType ||
        ent.properties.edible ||
        ent.properties.germination ||
        ent.properties.fertilizer ||
        ent.properties.species === "item" ||
        ent.properties.species === "resource" ||
        ent.properties.name?.includes("Madeira") ||
        ent.properties.name?.includes("Wood") ||
        ent.properties.name?.includes("Pedra") ||
        ent.properties.name?.includes("Stone") ||
        ent.properties.name?.includes("Fruto") ||
        ent.properties.name?.includes("Fruit") ||
        ent.properties.name?.includes("Semente") ||
        ent.properties.name?.includes("Seed")
      );

      if (isGroundItem && Array.isArray(group.claimedZones)) {
        const zx = Math.floor(ent.x / 8);
        const zy = Math.floor(ent.y / 8);
        const inZone = group.claimedZones.includes(`${zx}_${zy}`) || group.claimedZones.includes(`${zx},${zy}`);
        if (inZone) {
          addItem(ent.properties.name || ent.properties.resourceType || "Object", "ground");
        }
      }
    }
  }

  const totalCount = groundCount + memberCount + storageCount;
  return {
    totalCount,
    items,
    breakdown: { ground: groundCount, members: memberCount, storage: storageCount }
  };
}

export function tryJoinGroup(candidate, group, entities) {
  if (!candidate || !group || !candidate.properties.brain) return false;
  if (candidate.properties.group === group) return true;

  // 1. Calculate candidate's average affinity with living group members
  let sumAff = 0;
  let memberCount = 0;
  const livingMembers = [];

  for (const mid of group.members) {
    const mem = entities?.find(e => e.id === mid && !e.destroyed);
    if (mem && mem.properties.brain) {
      livingMembers.push(mem);
      const memAff = mem.properties.brain.affinities?.[candidate.id] || 0;
      sumAff += memAff;
      memberCount++;
    }
  }

  if (memberCount === 0) {
    group.members.push(candidate.id);
    candidate.properties.group = group;
    return true;
  }

  const avgAff = sumAff / memberCount;
  if (avgAff < 25) return false; // Need good average affinity to join

  // 2. Check if an existing member strongly hates the candidate (affinity <= -40)
  for (const mem of livingMembers) {
    const memAff = mem.properties.brain.affinities?.[candidate.id] || 0;
    if (memAff <= -40) {
      // Member leaves the group in outrage!
      group.members = group.members.filter(id => id !== mem.id);
      delete mem.properties.group;

      // Penalize affinity with other members who accepted the candidate
      for (const otherMem of livingMembers) {
        if (otherMem !== mem && otherMem.properties.brain) {
          mem.properties.brain.affinities[otherMem.id] = Math.max(-100, (mem.properties.brain.affinities[otherMem.id] || 0) - 35);
        }
      }

      recordWorldEvent({
        type: "ATTACK",
        primaryEntityId: mem.id,
        secondaryEntityId: candidate.id,
        location: { x: mem.x, y: mem.y },
        description: `${mem.properties.name} left '${group.name}' in outrage over ${candidate.properties.name} joining!`,
        tick: currentTick
      });
      break;
    }
  }

  group.members.push(candidate.id);
  candidate.properties.group = group;

  recordWorldEvent({
    type: "BIRTH",
    primaryEntityId: candidate.id,
    secondaryEntityId: group.id,
    location: { x: candidate.x, y: candidate.y },
    description: `${candidate.properties.name} joined the clan '${group.name}'!`,
    tick: currentTick
  });

  return true;
}

/**
 * Communication & Social Gossip Behavior
 */
export function createCommunicationProp(talkRate = 2.5) {
  return {
    talkTimer: 0,
    talkRate,
    effect(ent, dt, world, entities) {
      this.talkTimer = (this.talkTimer || 0) + dt;
      if (this.talkTimer < this.talkRate) return;
      this.talkTimer = 0;

      if (!ent.properties.brain || !entities) return;

      const mouth = ent.properties.mouth;
      const talkRange = mouth ? (mouth.talkRadius || 8) : 4;

      for (const other of entities) {
        if (other === ent || other.destroyed || !other.properties.brain) continue;

        const dist = Math.abs(other.x - ent.x) + Math.abs(other.y - ent.y);
        if (dist <= talkRange) {
          gossipBetweenCreatures(ent, other, world, entities);
          break;
        }
      }
    }
  };
}

export function gossipBetweenCreatures(speaker, listener, world, entities) {
  const spkBrain = speaker.properties.brain;
  const lisBrain = listener.properties.brain;
  if (!spkBrain || !lisBrain) return;

  const spkAffToLis = spkBrain.affinities[listener.id] || 0;
  const lisAffToSpk = lisBrain.affinities[listener.id] !== undefined ? lisBrain.affinities[speaker.id] : 0;

  // 1. Group Formation: If both have mutual affinity >= 60 and neither has a group
  if (spkAffToLis >= 60 && lisAffToSpk >= 60) {
    if (!speaker.properties.group && !listener.properties.group) {
      const newGrp = createGroup(`Clan of ${speaker.properties.name}`, speaker);
      newGrp.members.push(listener.id);
      speaker.properties.group = newGrp;
      listener.properties.group = newGrp;

      recordWorldEvent({
        type: "BIRTH",
        primaryEntityId: speaker.id,
        secondaryEntityId: listener.id,
        location: { x: speaker.x, y: speaker.y },
        description: `${speaker.properties.name} and ${listener.properties.name} founded the faction '${newGrp.name}'!`,
        tick: currentTick
      });
    } else if (speaker.properties.group && !listener.properties.group) {
      tryJoinGroup(listener, speaker.properties.group, entities);
    } else if (!speaker.properties.group && listener.properties.group) {
      tryJoinGroup(speaker, listener.properties.group, entities);
    }
  }

  // 2. Gossip about a third entity (C)
  const known = Object.keys(spkBrain.affinities);
  if (known.length > 1) {
    const thirdId = parseInt(known[Math.floor(Math.random() * known.length)], 10);
    if (thirdId !== speaker.id && thirdId !== listener.id) {
      const spkOpinion = spkBrain.affinities[thirdId] || 0;
      const lisOpinion = lisBrain.affinities[thirdId] !== undefined ? lisBrain.affinities[thirdId] : 0;

      // Listener is receptive if they like the speaker
      if (lisAffToSpk > 20) {
        if (spkOpinion < -30 && lisOpinion > 50) {
          // Listener defends close friend! Rebuffs speaker for talking bad about their friend!
          lisBrain.affinities[speaker.id] = Math.max(-100, (lisBrain.affinities[speaker.id] || 0) - 12);
        } else {
          // Speaker influences listener's opinion of third entity
          const influence = (spkOpinion - lisOpinion) * 0.18;
          lisBrain.affinities[thirdId] = Math.max(-100, Math.min(100, lisOpinion + influence));
        }
      }
    }
  }

  // 3. Share Significant Long-Term Memories (Rich Descriptive Gossip)
  if (spkBrain.longTermMemory.length > 0 && Math.random() < 0.35) {
    const mem = spkBrain.longTermMemory[Math.floor(Math.random() * spkBrain.longTermMemory.length)];
    const gossipDesc = mem.desc || mem.description || `${mem.type} event`;
    lisBrain.addShortTerm({
      type: "GOSSIP",
      desc: `Heard from ${speaker.properties.name}: "${gossipDesc}"`,
      location: { x: speaker.x, y: speaker.y }
    });

    recordWorldEvent({
      type: "DIALOGUE",
      primaryEntityId: speaker.id,
      secondaryEntityId: listener.id,
      location: { x: speaker.x, y: speaker.y },
      description: `${speaker.properties.name} spoke with ${listener.properties.name}: "Did you hear that ${gossipDesc}?"`,
      tick: currentTick,
      timestamp: world?.clock ? { day: world.clock.day, hour: world.clock.hour, minute: world.clock.minute } : null
    });
  }
}

/**
 * Hand Inventory Management (Strict: 1 item per arm)
 */
export function getFreeArm(ent) {
  if (ent.properties.arm_right && !ent.properties.arm_right.heldItem) return ent.properties.arm_right;
  if (ent.properties.arm_left && !ent.properties.arm_left.heldItem) return ent.properties.arm_left;
  return null;
}

export function isCarryingItem(ent, resourceType = null) {
  const checkArm = (arm) => arm?.heldItem && (!resourceType || arm.heldItem.resourceType === resourceType);
  return checkArm(ent.properties.arm_left) || checkArm(ent.properties.arm_right);
}

export function dropHeldItem(ent, entities, world) {
  for (const [k, p] of Object.entries(ent.properties)) {
    if (k.startsWith("arm") && p && p.heldItem && p.heldItem.resourceType) {
      const it = p.heldItem;
      p.heldItem = null;
      let spawned = null;
      if (it.resourceType === "stone") spawned = createStoneItem(ent.x, ent.y);
      else if (it.resourceType === "wood") spawned = createWoodItem(ent.x, ent.y);
      else if (it.resourceType === "seed") spawned = createSeedEntity(ent.x, ent.y, "large", it.seedSpecies || "oak");
      else if (it.resourceType === "fruit") spawned = createFruit(ent.x, ent.y, "large", "oak");
      if (spawned && entities) entities.push(spawned);
      return it;
    }
  }
  return null;
}

/**
 * Stone Wall Entity (Defensive Fortification)
 */
export function createStoneWallEntity(x, y, groupName = null) {
  return createEntity(
    {
      name: groupName ? `Stone Wall (${groupName})` : "Stone Wall",
      species: "structure",
      render: { skin: "Wall_NESW.png", color: 0xffdcdce6, backcolor: 0xff282832 },
      structure: { condition: 800, maxCondition: 800, defense: 50 },
      blocking: true,
      stoneCost: 1
    },
    x,
    y
  );
}

/**
 * Fluid Group Member Property:
 * Dynamically performs building, mining, crafting, farming, foraging, hunting, and hauling
 * based on current needs, opportunities, and held items without rigid role restrictions.
 */
export function createGroupMemberProp() {
  return {
    actionTimer: 0,
    effect(ent, dt, world, entities) {
      if (!ent.properties.group || !world || !entities) return;

      const group = ent.properties.group;
      const freeArm = getFreeArm(ent);
      const isCarryingMat = isCarryingItem(ent, "stone") || isCarryingItem(ent, "wood");
      const isCarryingSeed = isCarryingItem(ent, "seed");
      const isCarryingMeat = isCarryingItem(ent, "meat");

      const zx = Math.floor(ent.x / 8);
      const zy = Math.floor(ent.y / 8);
      const inClaimedZone = group.claimedZones?.includes(`${zx}_${zy}`) || group.claimedZones?.includes(`${zx},${zy}`);

      const firstZone = group.claimedZones?.[0] || "32_32";
      const parts = firstZone.includes("_") ? firstZone.split("_") : firstZone.split(",");
      const baseZx = parseInt(parts[0], 10) || 32;
      const baseZy = parseInt(parts[1], 10) || 32;
      const homeBaseX = baseZx * 8 + 4;
      const homeBaseY = baseZy * 8 + 4;
      const distToBase = Math.abs(ent.x - homeBaseX) + Math.abs(ent.y - homeBaseY);

      this.actionTimer = (this.actionTimer || 0) + dt;

      // ---------------------------------------------------------------------
      // 1. ACTIVE ACTIONS WITH HELD ITEMS
      // ---------------------------------------------------------------------

      // A. Building Fortifications (if holding Stone or Wood)
      if (isCarryingMat) {
        for (const zk of group.claimedZones || []) {
          const zp = zk.includes("_") ? zk.split("_") : zk.split(",");
          const pzx = parseInt(zp[0], 10);
          const pzy = parseInt(zp[1], 10);
          for (let ox = 0; ox < 8; ox++) {
            for (let oy = 0; oy < 8; oy++) {
              if (ox === 0 || ox === 7 || oy === 0 || oy === 7) {
                const isGateway = (oy === 0 && (ox === 3 || ox === 4)) ||
                                  (oy === 7 && (ox === 3 || ox === 4)) ||
                                  (ox === 0 && (oy === 3 || oy === 4)) ||
                                  (ox === 7 && (oy === 3 || oy === 4));
                if (isGateway) continue;

                const px = pzx * 8 + ox;
                const py = pzy * 8 + oy;
                const dist = Math.abs(px - ent.x) + Math.abs(py - ent.y);
                if (dist <= 1) {
                  const wallAlreadyThere = entities.some(e => !e.destroyed && e.properties.structure && e.x === px && e.y === py);
                  if (!wallAlreadyThere) {
                    if (this.actionTimer >= 0.5) {
                      this.actionTimer = 0;
                      // Consume stone or wood from hand
                      for (const [k, p] of Object.entries(ent.properties)) {
                        if (k.startsWith("arm") && p && (p.heldItem?.resourceType === "stone" || p.heldItem?.resourceType === "wood")) {
                          p.heldItem = null;
                          break;
                        }
                      }

                      const wall = createStoneWallEntity(px, py, group.name);
                      entities.push(wall);

                      recordWorldEvent({
                        type: "SPROUT",
                        primaryEntityId: ent.id,
                        location: { x: px, y: py },
                        description: `${ent.properties.name} erected a defensive Wall fortifying '${group.name}'!`,
                        tick: currentTick,
                        timestamp: world?.clock ? { day: world.clock.day, hour: world.clock.hour, minute: world.clock.minute } : null
                      });
                      return;
                    }
                  }
                }
              }
            }
          }
        }

        // If at base center and not building, deposit stone/wood in stockpile
        if ((inClaimedZone || distToBase <= 4) && distToBase <= 2) {
          for (const [k, p] of Object.entries(ent.properties)) {
            if (k.startsWith("arm") && p && (p.heldItem?.resourceType === "stone" || p.heldItem?.resourceType === "wood")) {
              const resType = p.heldItem.resourceType;
              p.heldItem = null;
              const spawned = resType === "stone" ? createStoneItem(ent.x, ent.y) : createWoodItem(ent.x, ent.y);
              entities.push(spawned);
              if (!group.storage) group.storage = [];
              group.storage.push(resType);
              break;
            }
          }
        }
      }

      // B. Farming / Cultivating (if holding Seed)
      if (isCarryingSeed && inClaimedZone) {
        let canPlant = false;
        let targetX = ent.x;
        let targetY = ent.y;

        for (const off of [{dx:0,dy:0}, {dx:1,dy:0}, {dx:-1,dy:0}, {dx:0,dy:1}, {dx:0,dy:-1}]) {
          const px = ent.x + off.dx;
          const py = ent.y + off.dy;
          const tile = world.getTile(px, py);
          const isLand = (tile !== 2 && tile !== 5 && tile !== 1 && tile !== 4);
          const hasNearbyPlant = entities.some(e => !e.destroyed && (e.properties.photosynthesis || e.properties.deep_root || e.properties.species === "oak" || e.properties.species === "willow" || e.properties.species === "cactus" || e.properties.species === "pine") && Math.abs(e.x - px) <= 3 && Math.abs(e.y - py) <= 3);
          if (isLand && !hasNearbyPlant) {
            targetX = px;
            targetY = py;
            canPlant = true;
            break;
          }
        }

        if (canPlant && this.actionTimer >= 0.8) {
          this.actionTimer = 0;
          let seedSpecies = "oak";
          for (const [k, p] of Object.entries(ent.properties)) {
            if (k.startsWith("arm") && p && p.heldItem?.resourceType === "seed") {
              seedSpecies = p.heldItem.seedSpecies || "oak";
              p.heldItem = null;
              break;
            }
          }

          let plantedTree = null;
          const plantTile = world.getTile(targetX, targetY);
          if (seedSpecies === "cactus" || plantTile === 3) plantedTree = createCactus(targetX, targetY);
          else if (seedSpecies === "willow") plantedTree = createWillowTree(targetX, targetY);
          else plantedTree = createOakTree(targetX, targetY);

          entities.push(plantedTree);

          recordWorldEvent({
            type: "SPROUT",
            primaryEntityId: ent.id,
            secondaryEntityId: plantedTree.id,
            location: { x: targetX, y: targetY },
            description: `${ent.properties.name} planted and cultivated a ${plantedTree.properties.name} for '${group.name}'!`,
            tick: currentTick,
            timestamp: world?.clock ? { day: world.clock.day, hour: world.clock.hour, minute: world.clock.minute } : null
          });
          return;
        }
      }

      // C. Stockpiling Food / Meat
      if (isCarryingMeat && (inClaimedZone || distToBase <= 4)) {
        for (const [k, p] of Object.entries(ent.properties)) {
          if (k.startsWith("arm") && p && p.heldItem?.resourceType === "meat") {
            p.heldItem = null;
            break;
          }
        }
        if (!group.storage) group.storage = [];
        group.storage.push("meat");
      }

      // ---------------------------------------------------------------------
      // 2. OPPORTUNITY ACTIONS WITH FREE HANDS
      // ---------------------------------------------------------------------
      if (freeArm && !isCarryingMat && !isCarryingSeed && !isCarryingMeat) {
        // A. Crafting weapons/tools from adjacent loose stone or wood
        const nearbyRes = entities.find(e => !e.destroyed && (e.properties.resourceType === "wood" || e.properties.resourceType === "stone") && Math.abs(e.x - ent.x) <= 2 && Math.abs(e.y - ent.y) <= 2);
        if (nearbyRes && this.actionTimer >= 2.0) {
          const isStone = nearbyRes.properties.resourceType === "stone";
          const weaponName = generateUniqueWeaponName(isStone ? "Pointed Stone Spear" : "Solid Wood Club");
          const dmg = isStone ? 48 : 34;
          const def = isStone ? 12 : 8;

          // Check if self or an ally needs a weapon
          let targetEnt = null;
          if (!ent.properties.arm_left?.heldItem || (ent.properties.arm_left.heldItem.damage || 0) < dmg) {
            targetEnt = ent;
          } else {
            for (const mid of group.members || []) {
              const ally = entities.find(e => e.id === mid && !e.destroyed && e.properties.life);
              if (ally && (!ally.properties.arm_left?.heldItem || (ally.properties.arm_left.heldItem.damage || 0) < dmg)) {
                targetEnt = ally;
                break;
              }
            }
          }

          if (targetEnt) {
            this.actionTimer = 0;
            nearbyRes.destroyed = true;
            if (targetEnt.properties.arm_right && !targetEnt.properties.arm_right.heldItem) {
              targetEnt.properties.arm_right.heldItem = { name: weaponName, damage: dmg, defense: def };
            } else if (targetEnt.properties.arm_left) {
              targetEnt.properties.arm_left.heldItem = { name: weaponName, damage: dmg, defense: def };
            }

            recordWorldEvent({
              type: "RELATION",
              primaryEntityId: ent.id,
              secondaryEntityId: targetEnt.id,
              location: { x: ent.x, y: ent.y },
              description: `${ent.properties.name} crafted a ${weaponName} for ${targetEnt === ent ? "themselves" : targetEnt.properties.name}!`,
              tick: currentTick,
              timestamp: world?.clock ? { day: world.clock.day, hour: world.clock.hour, minute: world.clock.minute } : null
            });
            return;
          }
        }

        // B. Mining Stone from adjacent rock/mountain
        const currentTile = world.getTile(ent.x, ent.y);
        let adjacentStone = (currentTile === 4 || currentTile === 1);
        if (!adjacentStone) {
          for (const off of [{dx:1,dy:0}, {dx:-1,dy:0}, {dx:0,dy:1}, {dx:0,dy:-1}]) {
            const at = world.getTile(ent.x + off.dx, ent.y + off.dy);
            if (at === 4 || at === 1) {
              adjacentStone = true;
              break;
            }
          }
        }

        if (adjacentStone && this.actionTimer >= 1.5) {
          this.actionTimer = 0;
          freeArm.heldItem = { name: "Stone Block", resourceType: "stone", weight: 1 };
          recordWorldEvent({
            type: "FEED",
            primaryEntityId: ent.id,
            location: { x: ent.x, y: ent.y },
            description: `${ent.properties.name} quarried 1 stone block from the mountain rock!`,
            tick: currentTick,
            timestamp: world?.clock ? { day: world.clock.day, hour: world.clock.hour, minute: world.clock.minute } : null
          });
          return;
        }

        // C. Grabbing building materials from storage if perimeter needs walls
        if (inClaimedZone && group.storage && (group.storage.includes("stone") || group.storage.includes("wood"))) {
          let hasUnbuiltWall = false;
          for (const zk of group.claimedZones || []) {
            const zp = zk.includes("_") ? zk.split("_") : zk.split(",");
            const pzx = parseInt(zp[0], 10);
            const pzy = parseInt(zp[1], 10);
            for (let ox = 0; ox < 8; ox++) {
              for (let oy = 0; oy < 8; oy++) {
                if (ox === 0 || ox === 7 || oy === 0 || oy === 7) {
                  const isGateway = (oy === 0 && (ox === 3 || ox === 4)) || (oy === 7 && (ox === 3 || ox === 4)) || (ox === 0 && (oy === 3 || oy === 4)) || (ox === 7 && (oy === 3 || oy === 4));
                  if (isGateway) continue;
                  const px = pzx * 8 + ox;
                  const py = pzy * 8 + oy;
                  if (!entities.some(e => !e.destroyed && e.properties.structure && e.x === px && e.y === py)) {
                    hasUnbuiltWall = true;
                    break;
                  }
                }
              }
              if (hasUnbuiltWall) break;
            }
            if (hasUnbuiltWall) break;
          }

          if (hasUnbuiltWall && distToBase <= 3) {
            const sIdx = group.storage.indexOf("stone") !== -1 ? group.storage.indexOf("stone") : group.storage.indexOf("wood");
            const matType = group.storage.splice(sIdx, 1)[0];
            freeArm.heldItem = { name: matType === "stone" ? "Stone Block" : "Wood Planks", resourceType: matType, weight: 1 };
            return;
          }
        }

        // D. Grabbing loose seeds nearby
        const looseSeed = entities.find(e => !e.destroyed && !e.properties.photosynthesis && !e.properties.deep_root && (e.properties.germination || e.properties.resourceType === "seed") && Math.abs(e.x - ent.x) <= 2 && Math.abs(e.y - ent.y) <= 2);
        if (looseSeed) {
          looseSeed.destroyed = true;
          freeArm.heldItem = {
            name: looseSeed.properties.name || "Fertile Seed",
            resourceType: "seed",
            seedSpecies: looseSeed.properties.germination?.species || "oak",
            weight: 1
          };
          return;
        }

        // E. Grabbing loose meat nearby
        const groundMeat = entities.find(e => !e.destroyed && (e.properties.edible?.foodType === "meat" || e.properties.resourceType === "meat") && Math.abs(e.x - ent.x) <= 1 && Math.abs(e.y - ent.y) <= 1);
        if (groundMeat) {
          groundMeat.destroyed = true;
          freeArm.heldItem = { name: "Fresh Game Meat", resourceType: "meat", weight: 1, nutrition: 2000 };
          return;
        }
      }
    }
  };
}

// Aliases for compatibility
export function createMinerProp() { return createGroupMemberProp(); }
export function createBuilderProp() { return createGroupMemberProp(); }
export function createCrafterProp() { return createGroupMemberProp(); }
export function createFarmerProp() { return createGroupMemberProp(); }
export function createHunterProp() { return createGroupMemberProp(); }

/**
 * Explorer Trait: Maps unknown regions with infinite memory and shares cartography with clan members
 */
export function createExplorerProp() {
  return {
    role: "explorer",
    exploreTimer: 0,
    effect(ent, dt, world, entities) {
      if (!ent.properties.brain || !world || !entities) return;

      this.exploreTimer = (this.exploreTimer || 0) + dt;
      if (this.exploreTimer < 1.0) return;
      this.exploreTimer = 0;

      const brain = ent.properties.brain;
      const viewRange = ent.properties.eye_left?.viewRange || ent.properties.eye_right?.viewRange || 14;

      // 1. Scan and map all entities and resources into infinite object memory
      for (const other of entities) {
        if (!other.destroyed && other !== ent) {
          const dist = Math.abs(other.x - ent.x) + Math.abs(other.y - ent.y);
          if (dist <= viewRange) {
            brain.rememberObject(other);
          }
        }
      }

      // 2. Share discoveries with nearby allies / clan members
      for (const other of entities) {
        if (!other.destroyed && other !== ent && other.properties.brain && other.properties.life) {
          const dist = Math.abs(other.x - ent.x) + Math.abs(other.y - ent.y);
          if (dist <= 6) {
            const isSameClan = ent.properties.group && other.properties.group === ent.properties.group;
            const currentAff = brain.affinities?.[other.id] || 0;

            if (isSameClan || currentAff >= 15) {
              let sharedCount = 0;
              for (let i = brain.objectMemory.length - 1; i >= 0 && sharedCount < 3; i--) {
                const mem = brain.objectMemory[i];
                if (!other.properties.brain.objectMemory.some(o => o.entityId === mem.entityId || o.id === mem.id)) {
                  other.properties.brain.rememberObject(mem);
                  sharedCount++;
                }
              }

              for (const [zk, zdata] of Object.entries(brain.geoMemory)) {
                if (!other.properties.brain.geoMemory[zk]) {
                  other.properties.brain.geoMemory[zk] = { ...zdata, affinity: 10 };
                }
              }

              if (sharedCount > 0 && Math.random() < 0.25) {
                if (!brain.affinities) brain.affinities = {};
                if (!other.properties.brain.affinities) other.properties.brain.affinities = {};
                brain.affinities[other.id] = Math.min(100, (brain.affinities[other.id] || 0) + 18);
                other.properties.brain.affinities[ent.id] = Math.min(100, (other.properties.brain.affinities[ent.id] || 0) + 18);

                recordWorldEvent({
                  type: "DIALOGUE",
                  primaryEntityId: ent.id,
                  secondaryEntityId: other.id,
                  location: { x: ent.x, y: ent.y },
                  description: `${ent.properties.name} shared map coordinates and discovered resources with ${other.properties.name}!`,
                  tick: currentTick,
                  timestamp: world?.clock ? { day: world.clock.day, hour: world.clock.hour, minute: world.clock.minute } : null
                });
              }
            }
          }
        }
      }
    }
  };
}

/**
 * Wood Item
 */
export function createWoodItem(x, y) {
  return createEntity(
    {
      name: "Wood Log",
      resourceType: "wood",
      render: { skin: "Item_Pole.png", color: 0xffa06e32, backcolor: 0x00000000 },
      edible: { nutrition: 200, foodType: "plant", digestDuration: 30 }
    },
    x,
    y
  );
}

/**
 * Stone Item
 */
export function createStoneItem(x, y) {
  return createEntity(
    {
      name: "Stone Block",
      resourceType: "stone",
      render: { skin: "Feature_Stone_A.png", color: 0xffc8c8c8, backcolor: 0x00000000 },
      edible: { nutrition: 50, foodType: "bone", digestDuration: 10 }
    },
    x,
    y
  );
}

/**
 * Tooth Item (Drop when mouth loses teeth)
 */
export function createToothItem(x, y, ownerName = "Creature") {
  return createEntity(
    {
      name: `Tooth of ${ownerName}`,
      render: { skin: "Item_Bone.png", color: 0xfff5f5f0, backcolor: 0x00000000 },
      edible: { nutrition: 150, foodType: "bone", digestDuration: 15, sourceName: ownerName }
    },
    x,
    y
  );
}

/**
 * Violent Trait (+25% Attack Damage, admires violence and gains affinity with creatures dealing damage nearby)
 */
export function createViolentProp() {
  return {
    name: "violent",
    damageMultiplier: 1.25,
    effect(ent, dt) {}
  };
}

/**
 * Pacifist Trait (-30% Attack Damage, flees combat, abhors violence and loses affinity with creatures dealing damage nearby)
 */
export function createPacifistProp() {
  return {
    name: "pacifist",
    damageMultiplier: 0.70,
    effect(ent, dt) {}
  };
}

// ---------------------------------------------------------------------------
// 2. Combat & Attack / Defense Behaviors
// ---------------------------------------------------------------------------

/**
 * Combat Behavior: Attacking with Arms, Paws/Claws, Mouth and Legs, Defending with Limbs/Shields
 */
export function createCombatProp(attackInterval = 1.2, aggroRange = 3) {
  return {
    attackTimer: 0,
    attackInterval,
    aggroRange,
    effect(ent, dt, world, entities) {
      if (!ent.properties.brain || !ent.properties.life || ent.properties.life.energy <= 100) return;

      // Mystic Grace prevents combat while active!
      if (ent.properties.mystic_grace?.active) return;

      this.attackTimer = (this.attackTimer || 0) + dt;
      if (this.attackTimer < this.attackInterval) return;

      const energyRatio = ent.properties.life.energy / ent.properties.life.max;
      const isDesperateHunger = energyRatio <= 0.25;

      // Find nearby combat target within attack range
      let combatTarget = null;
      for (const other of entities) {
        if (other !== ent && !other.destroyed && other.properties.life) {
          if (other.properties.mystic_grace?.active) continue;

          const dist = Math.abs(other.x - ent.x) + Math.abs(other.y - ent.y);
          if (dist === 1) {
            const affinity = ent.properties.brain.affinities?.[other.id] !== undefined ? ent.properties.brain.affinities[other.id] : 0;
            const isHostile = affinity < -20 || (ent.properties.brain.personality?.aggression || 0) > 0.4 || isDesperateHunger || ent.properties.violent;

            if (isHostile) {
              combatTarget = other;
              break;
            }
          }
        }
      }

      if (!combatTarget) return;
      this.attackTimer = 0;
      const target = combatTarget;
      // Free hands: if holding a non-weapon resource/food, drop to ground and remember location
      for (const [k, prop] of Object.entries(ent.properties)) {
        if (k.startsWith("arm") && prop && prop.heldItem && !prop.heldItem.damage && Math.random() < 0.75) {
          const droppedItem = prop.heldItem.entity || createWoodItem(ent.x, ent.y);
          if (entities) entities.push(droppedItem);
          if (ent.properties.brain?.rememberObject) ent.properties.brain.rememberObject(droppedItem);
          prop.heldItem = null;
        }
      }

      // 1. Determine Weapon / Limb Used for Attack
      let attackPower = 0;
      let usedLimbName = "body strike";
      let usedLimb = null;

      // 1.1 Check arms first (bipeds with weapons/fists)
      for (const [key, prop] of Object.entries(ent.properties)) {
        if (key.startsWith("arm") && prop && prop.condition > 10) {
          const limbFactor = (prop.condition / prop.maxCondition) * prop.quality;
          if (prop.heldItem && prop.heldItem.damage) {
            attackPower = (prop.heldItem.damage * 0.9) * limbFactor;
            usedLimbName = prop.heldItem.name || key;
          } else {
            attackPower = 28 * limbFactor;
            usedLimbName = `punch (${key})`;
          }
          usedLimb = prop;
          break;
        }
      }

      // 1.2 Check paws with claws (beasts & quadrupeds)
      if (!usedLimb) {
        for (const [key, prop] of Object.entries(ent.properties)) {
          if (key.startsWith("paw") && prop && prop.condition > 10) {
            const limbFactor = (prop.condition / prop.maxCondition) * prop.quality;
            if (prop.clawsCount > 0) {
              attackPower = (prop.clawDamage * prop.clawsCount * 0.6 + 15) * limbFactor;
              usedLimbName = `claw swipe (${key}, ${prop.clawsCount} claws)`;
            } else {
              attackPower = 8 * limbFactor;
              usedLimbName = `paw swipe (${key})`;
            }
            usedLimb = prop;
            break;
          }
        }
      }

      // 1.3 If no working arm/paw, try mouth bite!
      if (!usedLimb && ent.properties.mouth && ent.properties.mouth.teethCount > 0) {
        const teethRatio = ent.properties.mouth.teethCount / ent.properties.mouth.maxTeeth;
        attackPower = (ent.properties.mouth.biteDamage || 32) * teethRatio;
        usedLimbName = `bite (${ent.properties.mouth.teethCount} teeth)`;
        usedLimb = ent.properties.mouth;
      }

      // 1.4 If still no weapon, try kicking with legs!
      if (!usedLimb) {
        for (const [key, prop] of Object.entries(ent.properties)) {
          if (key.startsWith("leg") && prop && prop.condition > 15) {
            const limbFactor = (prop.condition / prop.maxCondition) * prop.quality;
            attackPower = 32 * limbFactor;
            usedLimbName = `kick (${key})`;
            usedLimb = prop;
            break;
          }
        }
      }

      // Trait Modifiers on Attack Power
      if (ent.properties.violent) {
        attackPower *= (ent.properties.violent.damageMultiplier || 1.25);
      }
      if (ent.properties.pacifist) {
        attackPower *= (ent.properties.pacifist.damageMultiplier || 0.70);
      }

      if (attackPower <= 0) return;

      // 2. Target Defense Calculation (Impact absorbed by shield, arms, paws or legs)
      let absorbedDamage = 0;
      let defendingLimb = null;

      for (const [key, prop] of Object.entries(target.properties)) {
        if ((key.startsWith("arm") || key.startsWith("paw") || key.startsWith("leg")) && prop && prop.condition > 10) {
          const limbFactor = (prop.condition / prop.maxCondition) * prop.quality;

          if (prop.heldItem && prop.heldItem.defense) {
            absorbedDamage = prop.heldItem.defense * 1.5 * limbFactor;
            prop.heldItem.defense = Math.max(0, prop.heldItem.defense - 1);
            defendingLimb = prop;
            break;
          } else if (!defendingLimb) {
            absorbedDamage = 10 * limbFactor;
            defendingLimb = prop;
          }
        }
      }

      if (defendingLimb && !defendingLimb.heldItem?.defense) {
        defendingLimb.condition = Math.max(0, defendingLimb.condition - Math.round(absorbedDamage * 0.6));
      }

      // 3. Apply Damage DIRECTLY to Target's Physical Body Parts
      const netDamage = Math.max(8, attackPower - absorbedDamage);
      target.combatFlash = 6;

      const physicalParts = [];
      for (const [pk, p] of Object.entries(target.properties)) {
        if (p && typeof p.condition === "number" && typeof p.maxCondition === "number" && p.condition > 0) {
          physicalParts.push({ key: pk, prop: p });
        }
      }

      let hitPartName = "body";
      if (physicalParts.length > 0) {
        // Pick primary target part for direct physical damage
        const primaryTarget = physicalParts[Math.floor(Math.random() * physicalParts.length)];
        const mainDamage = Math.round(netDamage * 0.75);
        primaryTarget.prop.condition = Math.max(0, primaryTarget.prop.condition - mainDamage);
        hitPartName = `${primaryTarget.key} (-${mainDamage} cond)`;

        // Tooth Loss: If mouth is hit, knock out tooth!
        if (primaryTarget.key === "mouth" && target.properties.mouth?.loseTooth) {
          target.properties.mouth.loseTooth(target, world, entities);
        }

        // Claw Break: If paw with claws suffers heavy hit, snap off a claw!
        if (primaryTarget.key.startsWith("paw") && primaryTarget.prop.clawsCount > 0 && Math.random() < 0.45) {
          primaryTarget.prop.clawsCount--;
        }

        // Secondary splash trauma to other body parts
        for (const pt of physicalParts) {
          if (pt !== primaryTarget && Math.random() < 0.45) {
            const splash = Math.round(Math.max(2, netDamage * 0.18));
            pt.prop.condition = Math.max(0, pt.prop.condition - splash);
          }
        }

        // Traumas: Bruises, Concussions and Scars
        if (Math.random() < 0.4) {
          target.properties.bruise = createBruiseProp(30.0, 1);
        }
        if (primaryTarget.key.includes("brain") || primaryTarget.key.includes("eye") || primaryTarget.key.includes("mouth")) {
          if (Math.random() < 0.5) target.properties.concussion = createConcussionProp(40.0);
        }
        if (mainDamage >= 35 && !target.properties.scar) {
          target.properties.scar = createScarProp(primaryTarget.key, `Scar on ${primaryTarget.key}`);
        }

        // Limb Amputation if Condition drops <= 0
        if (primaryTarget.prop.condition <= 0) {
          let limbSkin = "Item_Steak.png";
          let limbColor = 0xffdc5050;
          if (primaryTarget.key.startsWith("wing")) {
            limbSkin = "Item_Cloak.png";
            limbColor = 0xffe6e6f0;
          } else if (primaryTarget.key.startsWith("arm") || primaryTarget.key.startsWith("paw")) {
            limbSkin = "Creature_Hand_U.png";
            limbColor = 0xffdc5050;
          } else if (primaryTarget.key.startsWith("leg")) {
            limbSkin = "Item_Drumstick.png";
            limbColor = 0xffdc5050;
          }

          const severedLimb = createEntity(
            {
              name: `Limb (${primaryTarget.key}) of ${target.properties.name}`,
              render: { skin: limbSkin, color: limbColor, backcolor: 0x00000000 },
              edible: { nutrition: 800, foodType: "meat", digestDuration: 25, partKey: primaryTarget.key }
            },
            target.x + (Math.floor(Math.random() * 3) - 1),
            target.y + (Math.floor(Math.random() * 3) - 1)
          );
          if (entities) entities.push(severedLimb);

          delete target.properties[primaryTarget.key];
          target.properties[`amputated_${primaryTarget.key}`] = {
            part: primaryTarget.key,
            bleedRate: 4.0,
            effect(e, dt) {
              if (e.properties.life) {
                e.properties.life.energy = Math.max(0, e.properties.life.energy - dt * this.bleedRate);
              }
            }
          };

          recordWorldEvent({
            type: "AMPUTATION",
            primaryEntityId: target.id,
            secondaryEntityId: ent.id,
            location: { x: target.x, y: target.y },
            description: `${target.properties.name} had limb '${primaryTarget.key}' severed by the attack of ${ent.properties.name}!`,
            tick: currentTick,
            timestamp: world?.clock ? { day: world.clock.day, hour: world.clock.hour, minute: world.clock.minute } : null
          });
        }
      }

      // Minor direct shock to vital energy (~10% of physical blow)
      if (target.properties.life) {
        const energyShock = Math.max(10, Math.round(netDamage * 2.5));
        target.properties.life.energy = Math.max(0, target.properties.life.energy - energyShock);
      }

      // 4. Record indexed ATTACK event
      const attackerName = ent.properties.name || `Entity #${ent.id}`;
      const targetName = target.properties.name || `Entity #${target.id}`;
      const attackDesc = `${attackerName} struck ${targetName}'s ${hitPartName} with ${usedLimbName} at [X: ${ent.x}, Y: ${ent.y}]!`;

      // Track last attacker on victim for murder / kill causality determination
      target._lastAttacker = {
        id: ent.id,
        name: attackerName,
        species: ent.properties.species || "unknown",
        tick: currentTick,
        time: Date.now()
      };

      recordWorldEvent({
        type: "ATTACK",
        primaryEntityId: ent.id,
        secondaryEntityId: target.id,
        location: { x: ent.x, y: ent.y },
        description: attackDesc,
        tick: currentTick,
        timestamp: world?.clock ? { day: world.clock.day, hour: world.clock.hour, minute: world.clock.minute } : null,
        metadata: { attackerName, targetName, usedLimbName, hitPartName, netDamage, absorbed: absorbedDamage }
      });

      // 5. Affinity Dynamics upon Attack: Victim sets affinity with attacker to minimum (-100)!
      if (target.properties.brain) {
        if (!target.properties.brain.affinities) target.properties.brain.affinities = {};
        target.properties.brain.affinities[ent.id] = -100;
      }
      if (ent.properties.brain) {
        if (!ent.properties.brain.affinities) ent.properties.brain.affinities = {};
        ent.properties.brain.affinities[target.id] = Math.min(-30, (ent.properties.brain.affinities[target.id] || 0) - 50);
      }

      // 6. Bystander Reactions: Violent, Pacifist, Group Defense & Betrayal
      if (entities) {
        for (const spectator of entities) {
          if (spectator === ent || spectator === target || spectator.destroyed || !spectator.properties.brain) continue;

          const dist = Math.abs(spectator.x - ent.x) + Math.abs(spectator.y - ent.y);
          const specView = spectator.properties.eye_left?.viewRange || spectator.properties.eye_right?.viewRange || 10;
          if (dist <= specView) {
            // Violent Trait: Admires violence, gains affinity with the attacker!
            if (spectator.properties.violent) {
              const curAff = spectator.properties.brain.affinities?.[ent.id] || 0;
              spectator.properties.brain.affinities[ent.id] = Math.min(100, curAff + 15);
            }

            // Pacifist Trait: Abhors violence, loses affinity with the attacker!
            if (spectator.properties.pacifist) {
              const curAff = spectator.properties.brain.affinities?.[ent.id] || 0;
              spectator.properties.brain.affinities[ent.id] = Math.max(-100, curAff - 20);
            }

            // Group Defense: Ally comes to help victim!
            if (target.properties.group && spectator.properties.group === target.properties.group) {
              spectator.properties.brain.affinities[ent.id] = -90;
            }

            // Group Betrayal: If spectator is in attacker's group, but loves the victim!
            if (ent.properties.group && spectator.properties.group === ent.properties.group) {
              const loveForVictim = spectator.properties.brain?.affinities?.[target.id] || 0;
              if (loveForVictim >= 60) {
                const groupName = ent.properties.group.name || "Clan";
                if (ent.properties.group.members) {
                  ent.properties.group.members = ent.properties.group.members.filter(id => id !== spectator.id);
                }
                delete spectator.properties.group;
                if (!spectator.properties.brain.affinities) spectator.properties.brain.affinities = {};
                spectator.properties.brain.affinities[ent.id] = -100;

                if (target.properties?.group) {
                  tryJoinGroup(spectator, target.properties.group, entities);
                }

                recordWorldEvent({
                  type: "RELATION",
                  primaryEntityId: spectator.id,
                  secondaryEntityId: ent.id,
                  location: { x: spectator.x, y: spectator.y },
                  description: `${spectator.properties?.name || "Member"} severed ties with '${groupName}' to defend their friend ${target.properties?.name || "Friend"}!`,
                  tick: currentTick
                });
              }
            }
          }
        }
      }
    }
  };
}

/**
 * Locomotion / Motor Behavior (Intelligent Navigation: Memory, Hunger, Thirst, Predation, Wandering)
 */
export function createLocomotionProp() {
  return {
    stepTimer: 0,
    effect(ent, dt, world, entities) {
      if (!ent.properties.brain) return;

      const isFlying = !!ent.properties.flying || ent.properties.wings?.flying === true;
      const isAquatic = !!ent.properties.aquatic;
      const isTerrestrial = !!ent.properties.terrestrial || (!isAquatic && !isFlying);

      // Continuous ambient hydration: whenever on or adjacent to water, drink to max capacity
      if (ent.properties.bladder && world) {
        const offsets = [{ dx: 0, dy: 0 }, { dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 }];
        for (const off of offsets) {
          if (world.getTile(ent.x + off.dx, ent.y + off.dy) === 2) {
            ent.properties.bladder.water = ent.properties.bladder.maxWater;
            break;
          }
        }
      }

      let totalLegPower = 0;
      let legCount = 0;
      for (const [key, prop] of Object.entries(ent.properties)) {
        if ((key.startsWith("leg") || key.startsWith("paw")) && prop && prop.condition !== undefined) {
          totalLegPower += (prop.quality * (prop.condition / prop.maxCondition));
          legCount++;
        }
      }

      if (!isFlying && !isAquatic && (legCount === 0 || totalLegPower <= 0.05)) return; // Paralyzed walker

      const speedFactor = isFlying ? 2.5 : (isAquatic && legCount === 0 ? 1.8 : (totalLegPower / Math.max(1, legCount)));
      const moveInterval = Math.max(0.18, 0.9 / Math.max(0.1, speedFactor));

      this.stepTimer = (this.stepTimer || 0) + dt;
      if (this.stepTimer < moveInterval) return;
      this.stepTimer = 0;

      const energyRatio = ent.properties.life ? (ent.properties.life.energy / ent.properties.life.max) : 1.0;
      const waterRatio = ent.properties.bladder ? (ent.properties.bladder.water / ent.properties.bladder.maxWater) : 1.0;
      const viewRange = ent.properties.eye_left?.viewRange || ent.properties.eye_right?.viewRange || 10;

      let chosenDx = 0;
      let chosenDy = 0;
      let hasIntention = false;
      let targetInWater = false;
      let isFleeingHostile = false;

      const currentTile = world ? world.getTile(ent.x, ent.y) : 0;
      const inWater = currentTile === 2;

      // -----------------------------------------------------------------------
      // Priority 0: Terrestrial Creature Stranded in Water -> Escape to Dry Land!
      // -----------------------------------------------------------------------
      if (isTerrestrial && !isAquatic && !isFlying && inWater && world) {
        const landTarget = findNearestLandTile(world, ent.x, ent.y, 40);
        if (landTarget) {
          chosenDx = Math.sign(landTarget.x - ent.x);
          chosenDy = Math.sign(landTarget.y - ent.y);
          hasIntention = true;
        }
      }

      // -----------------------------------------------------------------------
      // Priority 1: Pacifist Escape (Flee from nearby threats/hostiles)
      // -----------------------------------------------------------------------
      if (!hasIntention && ent.properties.pacifist && entities) {
        let nearestHostile = null;
        let minThreatDist = 999;

        for (const other of entities) {
          if (other !== ent && !other.destroyed && other.properties.life) {
            const aff = ent.properties.brain?.affinities?.[other.id] ?? 0;
            const isAggro = other.properties.violent || (other.properties.brain?.personality?.aggression || 0) > 0.4 || aff < -10;
            if (isAggro) {
              const d = Math.abs(other.x - ent.x) + Math.abs(other.y - ent.y);
              if (d <= viewRange && d < minThreatDist) {
                minThreatDist = d;
                nearestHostile = other;
              }
            }
          }
        }

        if (nearestHostile) {
          chosenDx = -Math.sign(nearestHostile.x - ent.x);
          chosenDy = -Math.sign(nearestHostile.y - ent.y);
          hasIntention = true;
          isFleeingHostile = true;
        }
      }

      // -----------------------------------------------------------------------
      // Priority 2: Food Hauling Delivery (Return harvested meat/fruit to clan stockpile)
      // -----------------------------------------------------------------------
      const isCarryingFoodHaul = isCarryingItem(ent, "meat") || isCarryingItem(ent, "fruit");
      if (!hasIntention && isCarryingFoodHaul && ent.properties.group && energyRatio > 0.25 && waterRatio > 0.25) {
        const group = ent.properties.group;
        const firstZone = group.claimedZones?.[0] || "32_32";
        const parts = firstZone.includes("_") ? firstZone.split("_") : firstZone.split(",");
        const baseZx = parseInt(parts[0], 10) || 32;
        const baseZy = parseInt(parts[1], 10) || 32;
        const homeBaseX = baseZx * 8 + 4;
        const homeBaseY = baseZy * 8 + 4;

        chosenDx = Math.sign(homeBaseX - ent.x);
        chosenDy = Math.sign(homeBaseY - ent.y);
        hasIntention = true;
      }

      // -----------------------------------------------------------------------
      // Priority 3: Urgent Thirst (Water <= 35%) -> Drink from adjacent water or seek shore
      // -----------------------------------------------------------------------
      if (!hasIntention && waterRatio <= 0.35 && world) {
        let adjacentWater = false;
        for (const off of [{ dx: 0, dy: 0 }, { dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 }]) {
          if (world.getTile(ent.x + off.dx, ent.y + off.dy) === 2) {
            adjacentWater = true;
            if (ent.properties.bladder) ent.properties.bladder.water = ent.properties.bladder.maxWater;
            break;
          }
        }

        if (!adjacentWater) {
          const shoreTarget = isTerrestrial && !isAquatic
            ? findNearestShoreTile(world, ent.x, ent.y, 40)
            : findNearestWaterTile(world, ent.x, ent.y, 40);
          if (shoreTarget) {
            chosenDx = Math.sign(shoreTarget.x - ent.x);
            chosenDy = Math.sign(shoreTarget.y - ent.y);
            hasIntention = true;
          }
        }
      }

      // -----------------------------------------------------------------------
      // Priority 4: Hunger (Energy <= 35%) -> Seek Food in radius 35
      // -----------------------------------------------------------------------
      if (!hasIntention && energyRatio <= 0.35) {
        let bestFood = null;
        let highestFoodScore = -Infinity;

        for (const item of entities) {
          if (!item.destroyed && item.properties.edible) {
            const dist = Math.abs(item.x - ent.x) + Math.abs(item.y - ent.y);
            if (dist <= 35) {
              let score = 100 - dist * 3;
              const ed = item.properties.edible;

              // Feces is an absolute last resort during extreme starvation (energy <= 15%) unless scatological
              if (ed.foodType === "feces" && !ent.properties.scatological) {
                if (energyRatio > 0.15) {
                  score = -9999;
                } else {
                  score -= 300;
                }
              }

              const prefs = ent.properties.brain?.preferences;
              if (prefs) {
                if (prefs.likes.some(l => (l.type === "part" && ed.partKey?.includes(l.value)) || (l.type === "species" && ed.sourceSpecies === l.value))) {
                  score += 40;
                }
                if (prefs.dislikes.some(d => (d.type === "part" && ed.partKey?.includes(d.value)) || (d.type === "species" && ed.sourceSpecies === d.value))) {
                  score -= 30;
                }
              }

              if (score > highestFoodScore) {
                highestFoodScore = score;
                bestFood = item;
              }
            }
          }
        }

        if (bestFood) {
          chosenDx = Math.sign(bestFood.x - ent.x);
          chosenDy = Math.sign(bestFood.y - ent.y);
          hasIntention = true;
          if (world && world.getTile(bestFood.x, bestFood.y) === 2) {
            targetInWater = true;
          }
        }
      }

      // -----------------------------------------------------------------------
      // Priority 5: Desperate Hunger (Energy <= 25%) -> Hunt other creatures!
      // -----------------------------------------------------------------------
      if (!hasIntention && energyRatio <= 0.25) {
        let bestPrey = null;
        let highestPreyScore = -Infinity;

        for (const prey of entities) {
          if (prey !== ent && !prey.destroyed && prey.properties.life) {
            const dist = Math.abs(prey.x - ent.x) + Math.abs(prey.y - ent.y);
            if (dist <= viewRange + 6) {
              const preyAffinity = ent.properties.brain?.affinities?.[prey.id] !== undefined ? ent.properties.brain.affinities[prey.id] : 0;
              const preyEnergy = prey.properties.life.energy;
              const preyDefense = (prey.properties.arm_left?.heldItem?.defense || 0) + (prey.properties.arm_right?.heldItem?.defense || 0);

              let preyScore = 150 - (dist * 12) - (preyAffinity * 1.5) - (preyDefense * 2) - (preyEnergy * 0.01);
              if (preyScore > highestPreyScore) {
                highestPreyScore = preyScore;
                bestPrey = prey;
              }
            }
          }
        }

        if (bestPrey) {
          chosenDx = Math.sign(bestPrey.x - ent.x);
          chosenDy = Math.sign(bestPrey.y - ent.y);
          hasIntention = true;
          if (world && world.getTile(bestPrey.x, bestPrey.y) === 2) {
            targetInWater = true;
          }
        }
      }

      // -----------------------------------------------------------------------
      // Priority 6: Fluid Group Cooperation & Autonomous Tasks
      // -----------------------------------------------------------------------
      if (!hasIntention && ent.properties.group && entities && energyRatio > 0.25) {
        const group = ent.properties.group;
        const firstZone = group.claimedZones?.[0] || "32_32";
        const parts = firstZone.includes("_") ? firstZone.split("_") : firstZone.split(",");
        const baseZx = parseInt(parts[0], 10) || 32;
        const baseZy = parseInt(parts[1], 10) || 32;
        const homeBaseX = baseZx * 8 + 4;
        const homeBaseY = baseZy * 8 + 4;

        const isCarryingMat = isCarryingItem(ent, "stone") || isCarryingItem(ent, "wood");
        const isCarryingSeed = isCarryingItem(ent, "seed");
        const isCarryingMeat = isCarryingItem(ent, "meat");

        // 1. If carrying building materials (stone or wood): build perimeter walls or stockpile
        if (isCarryingMat) {
          let targetPerimeter = null;
          let minPerimDist = 9999;

          for (const zk of group.claimedZones || []) {
            const zp = zk.includes("_") ? zk.split("_") : zk.split(",");
            const zx = parseInt(zp[0], 10);
            const zy = parseInt(zp[1], 10);
            for (let ox = 0; ox < 8; ox++) {
              for (let oy = 0; oy < 8; oy++) {
                if (ox === 0 || ox === 7 || oy === 0 || oy === 7) {
                  const isGateway = (oy === 0 && (ox === 3 || ox === 4)) ||
                                    (oy === 7 && (ox === 3 || ox === 4)) ||
                                    (ox === 0 && (oy === 3 || oy === 4)) ||
                                    (ox === 7 && (oy === 3 || oy === 4));
                  if (isGateway) continue;

                  const px = zx * 8 + ox;
                  const py = zy * 8 + oy;
                  const hasWall = entities.some(e => !e.destroyed && e.properties.structure && e.x === px && e.y === py);
                  if (!hasWall) {
                    const dist = Math.abs(px - ent.x) + Math.abs(py - ent.y);
                    if (dist < minPerimDist) {
                      minPerimDist = dist;
                      targetPerimeter = { x: px, y: py };
                    }
                  }
                }
              }
            }
          }

          if (targetPerimeter) {
            if (minPerimDist <= 1) {
              chosenDx = 0;
              chosenDy = 0;
              hasIntention = true;
            } else {
              chosenDx = Math.sign(targetPerimeter.x - ent.x);
              chosenDy = Math.sign(targetPerimeter.y - ent.y);
              hasIntention = true;
            }
          } else {
            // Walls are fully built: haul material to clan base stockpile
            chosenDx = Math.sign(homeBaseX - ent.x);
            chosenDy = Math.sign(homeBaseY - ent.y);
            hasIntention = true;
          }
        }

        // 2. If carrying seed: cultivate and plant inside territory with spacing
        else if (isCarryingSeed) {
          let targetPlot = null;
          let minPlotDist = 9999;

          for (const zk of group.claimedZones || []) {
            const zp = zk.includes("_") ? zk.split("_") : zk.split(",");
            const zx = parseInt(zp[0], 10);
            const zy = parseInt(zp[1], 10);
            for (let ox = 1; ox < 7; ox++) {
              for (let oy = 1; oy < 7; oy++) {
                const px = zx * 8 + ox;
                const py = zy * 8 + oy;
                const t = world ? world.getTile(px, py) : 0;
                const isLand = (t !== 2 && t !== 5 && t !== 1 && t !== 4);
                if (isLand) {
                  const hasNearbyCrop = entities.some(e => !e.destroyed && (e.properties.photosynthesis || e.properties.deep_root || e.properties.species === "oak" || e.properties.species === "willow" || e.properties.species === "cactus" || e.properties.species === "pine") && Math.abs(e.x - px) <= 2 && Math.abs(e.y - py) <= 2);
                  if (!hasNearbyCrop) {
                    const dist = Math.abs(px - ent.x) + Math.abs(py - ent.y);
                    if (dist < minPlotDist) {
                      minPlotDist = dist;
                      targetPlot = { x: px, y: py };
                    }
                  }
                }
              }
            }
          }

          if (targetPlot) {
            chosenDx = Math.sign(targetPlot.x - ent.x);
            chosenDy = Math.sign(targetPlot.y - ent.y);
            hasIntention = true;
          } else {
            chosenDx = Math.sign(homeBaseX - ent.x);
            chosenDy = Math.sign(homeBaseY - ent.y);
            hasIntention = true;
          }
        }

        // 3. If carrying meat: deliver to base stockpile
        else if (isCarryingMeat) {
          chosenDx = Math.sign(homeBaseX - ent.x);
          chosenDy = Math.sign(homeBaseY - ent.y);
          hasIntention = true;
        }

        // 4. If hands are free: autonomously pick tasks based on clan needs and environment
        else if (!ent.properties.explorer) {
          // A. If perimeter needs walls and materials are in storage/territory: go get material
          let hasUnbuiltWall = false;
          for (const zk of group.claimedZones || []) {
            const zp = zk.includes("_") ? zk.split("_") : zk.split(",");
            const pzx = parseInt(zp[0], 10);
            const pzy = parseInt(zp[1], 10);
            for (let ox = 0; ox < 8; ox++) {
              for (let oy = 0; oy < 8; oy++) {
                if (ox === 0 || ox === 7 || oy === 0 || oy === 7) {
                  const isGateway = (oy === 0 && (ox === 3 || ox === 4)) || (oy === 7 && (ox === 3 || ox === 4)) || (ox === 0 && (oy === 3 || oy === 4)) || (ox === 7 && (oy === 3 || oy === 4));
                  if (isGateway) continue;
                  const px = pzx * 8 + ox;
                  const py = pzy * 8 + oy;
                  if (!entities.some(e => !e.destroyed && e.properties.structure && e.x === px && e.y === py)) {
                    hasUnbuiltWall = true;
                    break;
                  }
                }
              }
              if (hasUnbuiltWall) break;
            }
            if (hasUnbuiltWall) break;
          }

          if (hasUnbuiltWall && group.storage && (group.storage.includes("stone") || group.storage.includes("wood"))) {
            chosenDx = Math.sign(homeBaseX - ent.x);
            chosenDy = Math.sign(homeBaseY - ent.y);
            hasIntention = true;
          } else {
            // B. Check loose seeds to farm
            const nearbySeed = entities.find(e => !e.destroyed && !e.properties.photosynthesis && !e.properties.deep_root && (e.properties.germination || e.properties.resourceType === "seed" || e.properties.name?.includes("Seed") || e.properties.name?.includes("Semente")) && Math.abs(e.x - homeBaseX) <= 24 && Math.abs(e.y - homeBaseY) <= 24);
            if (nearbySeed) {
              chosenDx = Math.sign(nearbySeed.x - ent.x);
              chosenDy = Math.sign(nearbySeed.y - ent.y);
              hasIntention = true;
            } else {
              // C. Check stone/mountain to mine if clan needs stone
              const currentTile = world ? world.getTile(ent.x, ent.y) : 0;
              let adjacentStone = (currentTile === 4 || currentTile === 1);
              if (!adjacentStone && world) {
                for (const off of [{dx:1,dy:0}, {dx:-1,dy:0}, {dx:0,dy:1}, {dx:0,dy:-1}]) {
                  const at = world.getTile(ent.x + off.dx, ent.y + off.dy);
                  if (at === 4 || at === 1) {
                    adjacentStone = true;
                    break;
                  }
                }
              }

              if (adjacentStone) {
                chosenDx = 0;
                chosenDy = 0;
                hasIntention = true;
              } else {
                // Seek nearest stone/mountain tiles in radius
                let targetStone = null;
                let minDist = 9999;

                if (world) {
                  for (let r = 1; r <= 60; r++) {
                    for (let dy = -r; dy <= r; dy++) {
                      for (let dx = -r; dx <= r; dx++) {
                        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
                        const tx = ent.x + dx;
                        const ty = ent.y + dy;
                        if (tx >= 0 && tx < (world.width || 512) && ty >= 0 && ty < (world.height || 512)) {
                          const t = world.getTile(tx, ty);
                          if (t === 4 || t === 1) {
                            const dist = Math.abs(dx) + Math.abs(dy);
                            if (dist < minDist) {
                              minDist = dist;
                              targetStone = { x: tx, y: ty };
                            }
                          }
                        }
                      }
                    }
                    if (targetStone) break;
                  }
                }

                if (targetStone && Math.random() < 0.6) {
                  chosenDx = Math.sign(targetStone.x - ent.x);
                  chosenDy = Math.sign(targetStone.y - ent.y);
                  hasIntention = true;
                }
              }
            }
          }
        }

        // F. Explorer: Navigate towards unexplored or oldest-visited 8x8 zones
        else if (ent.properties.explorer) {
          const brain = ent.properties.brain;
          let bestZone = null;
          let oldestVisit = Infinity;

          const curZx = Math.floor(ent.x / 8);
          const curZy = Math.floor(ent.y / 8);

          for (let dzx = -4; dzx <= 4; dzx++) {
            for (let dzy = -4; dzy <= 4; dzy++) {
              const testZx = curZx + dzx;
              const testZy = curZy + dzy;
              if (testZx >= 0 && testZx < 64 && testZy >= 0 && testZy < 64) {
                const zk = `${testZx}_${testZy}`;
                const mem = brain.geoMemory[zk];
                const lastVisited = mem ? mem.lastVisitedTick : 0;
                if (lastVisited < oldestVisit) {
                  oldestVisit = lastVisited;
                  bestZone = { x: testZx * 8 + 4, y: testZy * 8 + 4 };
                }
              }
            }
          }

          if (bestZone) {
            chosenDx = Math.sign(bestZone.x - ent.x);
            chosenDy = Math.sign(bestZone.y - ent.y);
            hasIntention = true;
          }
        }
      }

      // -----------------------------------------------------------------------
      // Priority 5: Social Cohesion & Group Territory
      // -----------------------------------------------------------------------
      if (!hasIntention && ent.properties.group && entities) {
        const group = ent.properties.group;

        // Follow group leader or stay near members
        const leader = entities.find(e => e.id === group.leaderId && !e.destroyed);
        if (leader && leader !== ent) {
          const distToLeader = Math.abs(leader.x - ent.x) + Math.abs(leader.y - ent.y);
          if (distToLeader > 5 && distToLeader <= 18) {
            chosenDx = Math.sign(leader.x - ent.x);
            chosenDy = Math.sign(leader.y - ent.y);
            hasIntention = true;
          }
        }
      }

      // -----------------------------------------------------------------------
      // Priority 5: Wandering & Exploration (Territorial or Random)
      // -----------------------------------------------------------------------
      if (!hasIntention) {
        const territoryKey = ent.properties.brain?.territoryZoneKey;
        if (territoryKey && ent.properties.brain?.geoMemory[territoryKey]) {
          const tGeo = ent.properties.brain.geoMemory[territoryKey];
          const targetX = tGeo.zx * 8 + 4;
          const targetY = tGeo.zy * 8 + 4;
          const distToCenter = Math.abs(targetX - ent.x) + Math.abs(targetY - ent.y);

          if (distToCenter > 4) {
            chosenDx = Math.sign(targetX - ent.x);
            chosenDy = Math.sign(targetY - ent.y);
            hasIntention = true;
          }
        }
      }

      if (!hasIntention) {
        const dirs = [
          { dx: 0, dy: -1 },
          { dx: 0, dy: 1 },
          { dx: -1, dy: 0 },
          { dx: 1, dy: 0 },
          { dx: 0, dy: 0 }
        ];
        // Terrestrial creatures prefer land when wandering
        if (isTerrestrial && !isAquatic && world) {
          const landDirs = dirs.filter(d => {
            const t = world.getTile(ent.x + d.dx, ent.y + d.dy);
            return t !== 2 && t !== 5;
          });
          const pool = landDirs.length > 0 ? landDirs : dirs;
          const chosen = pool[Math.floor(Math.random() * pool.length)];
          chosenDx = chosen.dx;
          chosenDy = chosen.dy;
        } else {
          const chosen = dirs[Math.floor(Math.random() * dirs.length)];
          chosenDx = chosen.dx;
          chosenDy = chosen.dy;
        }
      }

      // Execute Movement with Land Priority, Contour Bypassing & Water Fallback
      const mapW = (world && world.width) ? world.width : 512;
      const mapH = (world && world.height) ? world.height : 512;

      let moved = false;
      const candidateMoves = [
        { dx: chosenDx, dy: chosenDy },
        { dx: chosenDx, dy: 0 },
        { dx: 0, dy: chosenDy },
        // Contour / tangent moves to skirt water edges along dry land
        { dx: chosenDy !== 0 ? chosenDy : 0, dy: chosenDx !== 0 ? -chosenDx : 0 },
        { dx: chosenDy !== 0 ? -chosenDy : 0, dy: chosenDx !== 0 ? chosenDx : 0 }
      ];

      // Pass 1: Prioritize Dry Land traversal
      for (const m of candidateMoves) {
        if (m.dx === 0 && m.dy === 0) continue;
        const tx = ent.x + m.dx;
        const ty = ent.y + m.dy;

        if (world && tx >= 0 && tx < mapW && ty >= 0 && ty < mapH) {
          const targetTile = world.getTile(tx, ty);
          if (targetTile !== 5) {
            let canTraverse = false;
            if (isFlying) {
              canTraverse = true;
            } else if (targetTile !== 2) {
              // Valid Land Tile (0, 1, 3, 4)
              canTraverse = true;
              if (isAquatic && !isTerrestrial) {
                this.stepTimer = -moveInterval * 3.0; // penalty for aquatic on land
              }
            } else if (inWater || isAquatic) {
              // Already in water or aquatic
              canTraverse = true;
              if (!isAquatic) {
                this.stepTimer = -moveInterval * 2.5;
              }
            }

            if (canTraverse) {
              ent.x = tx;
              ent.y = ty;
              moved = true;
              break;
            }
          }
        }
      }

      // Pass 2: Water Fallback (If no land move is available to fulfill an intention, cross water)
      if (!moved && hasIntention && isTerrestrial && !isAquatic && !isFlying) {
        for (const m of candidateMoves.slice(0, 3)) {
          if (m.dx === 0 && m.dy === 0) continue;
          const tx = ent.x + m.dx;
          const ty = ent.y + m.dy;

          if (world && tx >= 0 && tx < mapW && ty >= 0 && ty < mapH) {
            const targetTile = world.getTile(tx, ty);
            if (targetTile === 2) {
              // Cross water barrier towards destination
              ent.x = tx;
              ent.y = ty;
              this.stepTimer = -moveInterval * 3.0; // wading penalty
              moved = true;
              break;
            }
          }
        }
      }

      // Anti-Stuck Watchdog: If creature failed to move despite an intention, break lock
      if (!ent._locoTracker) ent._locoTracker = { lastX: ent.x, lastY: ent.y, stuckTicks: 0 };
      if (!moved && hasIntention) {
        ent._locoTracker.stuckTicks++;
        if (ent._locoTracker.stuckTicks >= 2) {
          ent._locoTracker.stuckTicks = 0;
          const randomDirs = [
            { dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 },
            { dx: 1, dy: 1 }, { dx: -1, dy: -1 }, { dx: 1, dy: -1 }, { dx: -1, dy: 1 }
          ].sort(() => Math.random() - 0.5);

          // Try land random dirs first
          for (const rd of randomDirs) {
            const rx = ent.x + rd.dx;
            const ry = ent.y + rd.dy;
            if (world && rx >= 0 && rx < mapW && ry >= 0 && ry < mapH) {
              const rt = world.getTile(rx, ry);
              if (rt !== 5 && rt !== 2) {
                ent.x = rx;
                ent.y = ry;
                moved = true;
                break;
              }
            }
          }

          // If completely blocked by water on a peninsula, allow water escape
          if (!moved) {
            for (const rd of randomDirs) {
              const rx = ent.x + rd.dx;
              const ry = ent.y + rd.dy;
              if (world && rx >= 0 && rx < mapW && ry >= 0 && ry < mapH) {
                const rt = world.getTile(rx, ry);
                if (rt !== 5) {
                  ent.x = rx;
                  ent.y = ry;
                  this.stepTimer = -moveInterval * 3.0;
                  moved = true;
                  break;
                }
              }
            }
          }
        }
      } else {
        ent._locoTracker.lastX = ent.x;
        ent._locoTracker.lastY = ent.y;
        ent._locoTracker.stuckTicks = 0;
      }

      // -----------------------------------------------------------------------
      // Item Pickup / Ingestion at Current Position
      // -----------------------------------------------------------------------
      if (entities) {
        for (const other of entities) {
          if (other !== ent && !other.destroyed && other.x === ent.x && other.y === ent.y) {
            // Food Consumption
            if (other.properties.edible && ent.properties.stomach && ent.properties.stomach.items.length < ent.properties.stomach.capacity) {
              const ed = other.properties.edible;

              // Never eat feces unless specifically Scatological OR in extreme starvation (vital energy <= 15%)
              if (ed.foodType === "feces" && !ent.properties.scatological && energyRatio > 0.15) {
                continue;
              }

              let mouthBoost = 1.0;
              if (ent.properties.mouth && ent.properties.mouth.teethCount > 0) {
                mouthBoost = 1.0 + (ent.properties.mouth.teethCount / ent.properties.mouth.maxTeeth) * 0.25;
              }

              let nutMultiplier = 1.0;
              const prefs = ent.properties.brain?.preferences;
              if (prefs) {
                if (prefs.likes.some(l => (l.type === "part" && ed.partKey?.includes(l.value)) || (l.type === "species" && ed.sourceSpecies === l.value))) {
                  nutMultiplier = 1.35;
                }
                if (prefs.dislikes.some(d => (d.type === "part" && ed.partKey?.includes(d.value)) || (d.type === "species" && ed.sourceSpecies === d.value))) {
                  nutMultiplier = 0.65;
                }
              }

              const finalNutrition = Math.round((ed.nutrition || 2000) * nutMultiplier * mouthBoost);

              ent.properties.stomach.items.push({
                name: other.properties.name || "Food Item",
                nutrition: finalNutrition,
                foodType: ed.foodType || "fruit",
                totalTurns: ed.digestDuration || 45,
                remainingTurns: ed.digestDuration || 45,
                seed: ed.seed?.type === "small" ? ed.seed : null
              });

              // Forget from memory
              if (ent.properties.brain?.forgetObject) {
                ent.properties.brain.forgetObject(other.id);
              }

              // Special: Feces Consumption Dynamics
              if (ed.foodType === "feces") {
                const isScato = !!ent.properties.scatological;
                if (isScato) {
                  if (ent.properties.brain) ent.properties.brain.mood = Math.min(100, (ent.properties.brain.mood || 0) + 35);
                } else {
                  if (ent.properties.brain) ent.properties.brain.mood = Math.max(-100, (ent.properties.brain.mood || 0) - 50);
                  if (Math.random() < 0.04) {
                    ent.properties.scatological = createScatologicalProp();
                    recordWorldEvent({
                      type: "SPROUT",
                      primaryEntityId: ent.id,
                      location: { x: ent.x, y: ent.y },
                      description: `${ent.properties.name} ate feces in desperation and acquired the bizarre Scatological trait!`,
                      tick: currentTick,
                      timestamp: world?.clock ? { day: world.clock.day, hour: world.clock.hour, minute: world.clock.minute } : null
                    });
                  }
                }

                // Spectators reaction to eating feces
                for (const spec of entities) {
                  if (spec !== ent && !spec.destroyed && spec.properties.brain) {
                    const dist = Math.abs(spec.x - ent.x) + Math.abs(spec.y - ent.y);
                    const view = spec.properties.eye_left?.viewRange || spec.properties.eye_right?.viewRange || 8;
                    if (dist <= view) {
                      if (!spec.properties.brain.affinities) spec.properties.brain.affinities = {};
                      if (spec.properties.scatological) {
                        spec.properties.brain.affinities[ent.id] = Math.min(100, (spec.properties.brain.affinities[ent.id] || 0) + 40);
                        recordWorldEvent({
                          type: "RELATION",
                          primaryEntityId: spec.id,
                          secondaryEntityId: ent.id,
                          location: { x: spec.x, y: spec.y },
                          description: `${spec.properties.name} looked upon ${ent.properties.name} with genuine admiration for savoring excrement!`,
                          tick: currentTick,
                          timestamp: world?.clock ? { day: world.clock.day, hour: world.clock.hour, minute: world.clock.minute } : null
                        });
                      } else {
                        spec.properties.brain.affinities[ent.id] = Math.max(-100, (spec.properties.brain.affinities[ent.id] || 0) - 50);
                        recordWorldEvent({
                          type: "RELATION",
                          primaryEntityId: spec.id,
                          secondaryEntityId: ent.id,
                          location: { x: spec.x, y: spec.y },
                          description: `${spec.properties.name} witnessed ${ent.properties.name} eating feces with utter disgust!`,
                          tick: currentTick,
                          timestamp: world?.clock ? { day: world.clock.day, hour: world.clock.hour, minute: world.clock.minute } : null
                        });
                      }
                    }
                  }
                }
              }

              // Build detailed feed provenance message
              const foodName = other.properties.name || "Food";
              const provenance = ed.sourceName ? `(from ${ed.sourceName})` : "";
              const feedMsg = `${ent.properties.name || `Entity #${ent.id}`} ate ${foodName} ${provenance} at [X: ${ent.x}, Y: ${ent.y}]!`;

              // Log indexed FEED event
              recordWorldEvent({
                type: "FEED",
                primaryEntityId: ent.id,
                secondaryEntityId: other.id,
                location: { x: ent.x, y: ent.y },
                description: feedMsg,
                tick: currentTick,
                timestamp: world?.clock ? { day: world.clock.day, hour: world.clock.hour, minute: world.clock.minute } : null,
                metadata: { foodName, nutrition: finalNutrition, sourceName: ed.sourceName, sourceSpecies: ed.sourceSpecies }
              });

              // Store in short-term perception memory
              if (ent.properties.brain?.addShortTerm) {
                ent.properties.brain.addShortTerm({
                  type: "FEED",
                  desc: `Ate ${foodName} ${provenance}`,
                  location: { x: ent.x, y: ent.y }
                });
              }

              other.destroyed = true;
              break;
            }
          }
        }

        // Social Gifting: If mood is positive (>= 25), give item/food to a friend nearby
        if (ent.properties.brain?.mood >= 25 && Math.random() < 0.08) {
          for (const [k, p] of Object.entries(ent.properties)) {
            if (k.startsWith("arm") && p && p.heldItem) {
              const friend = entities.find(e => e !== ent && !e.destroyed && e.properties.brain && Math.abs(e.x - ent.x) <= 2 && Math.abs(e.y - ent.y) <= 2 && (ent.properties.brain.affinities[e.id] || 0) >= 40);
              if (friend) {
                for (const [fk, fp] of Object.entries(friend.properties)) {
                  if (fk.startsWith("arm") && fp && !fp.heldItem) {
                    fp.heldItem = p.heldItem;
                    p.heldItem = null;
                    friend.properties.brain.affinities[ent.id] = Math.min(100, (friend.properties.brain.affinities[ent.id] || 0) + 25);
                    friend.properties.brain.mood = Math.min(100, (friend.properties.brain.mood || 0) + 20);

                    recordWorldEvent({
                      type: "FEED",
                      primaryEntityId: ent.id,
                      secondaryEntityId: friend.id,
                      location: { x: ent.x, y: ent.y },
                      description: `${ent.properties.name} presenteou ${friend.properties.name} com ${fp.heldItem.name || "um item"}!`,
                      tick: currentTick
                    });
                    break;
                  }
                }
              }
            }
          }
        }
      }
    }
  };
}

// ---------------------------------------------------------------------------
// 3. Plant Ecology: Water Dependency, Surface Roots, Seeds & Fruits
// ---------------------------------------------------------------------------

export function hasNearbyWater(world, startX, startY, maxRadius = 4) {
  if (!world) return false;
  const w = world.width || 512;
  const h = world.height || 512;
  for (let dy = -maxRadius; dy <= maxRadius; dy++) {
    for (let dx = -maxRadius; dx <= maxRadius; dx++) {
      const tx = startX + dx;
      const ty = startY + dy;
      if (tx >= 0 && tx < w && ty >= 0 && ty < h) {
        if (world.getTile(tx, ty) === 2) {
          return true;
        }
      }
    }
  }
  return false;
}

export function findNearestWaterTile(world, startX, startY, maxRadius = 14) {
  if (!world) return null;
  const w = world.width || 512;
  const h = world.height || 512;
  let closest = null;
  let minDist = Infinity;

  for (let r = 1; r <= maxRadius; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) === r || Math.abs(dy) === r) {
          const tx = startX + dx;
          const ty = startY + dy;
          if (tx >= 0 && tx < w && ty >= 0 && ty < h) {
            if (world.getTile(tx, ty) === 2) {
              const dist = Math.hypot(dx, dy);
              if (dist < minDist) {
                minDist = dist;
                closest = { x: tx, y: ty };
              }
            }
          }
        }
      }
    }
    if (closest) break;
  }
  return closest;
}

export function findNearestShoreTile(world, startX, startY, maxRadius = 40) {
  if (!world) return null;
  const w = world.width || 512;
  const h = world.height || 512;
  let closest = null;
  let minDist = Infinity;

  for (let r = 1; r <= maxRadius; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) === r || Math.abs(dy) === r) {
          const tx = startX + dx;
          const ty = startY + dy;
          if (tx >= 0 && tx < w && ty >= 0 && ty < h) {
            const tile = world.getTile(tx, ty);
            if (tile !== 2 && tile !== 5) {
              if (hasNearbyWater(world, tx, ty, 1)) {
                const dist = Math.hypot(dx, dy);
                if (dist < minDist) {
                  minDist = dist;
                  closest = { x: tx, y: ty };
                }
              }
            }
          }
        }
      }
    }
    if (closest) break;
  }
  return closest || findNearestWaterTile(world, startX, startY, maxRadius);
}

export function findNearestLandTile(world, startX, startY, maxRadius = 30) {
  if (!world) return null;
  const w = world.width || 512;
  const h = world.height || 512;
  let closest = null;
  let minDist = Infinity;

  for (let r = 1; r <= maxRadius; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) === r || Math.abs(dy) === r) {
          const tx = startX + dx;
          const ty = startY + dy;
          if (tx >= 0 && tx < w && ty >= 0 && ty < h) {
            const tile = world.getTile(tx, ty);
            if (tile !== 2 && tile !== 5) {
              const dist = Math.hypot(dx, dy);
              if (dist < minDist) {
                minDist = dist;
                closest = { x: tx, y: ty };
              }
            }
          }
        }
      }
    }
    if (closest) break;
  }
  return closest;
}

/**
 * Plant Life Prop (Robust Flora Metabolism)
 */
export function createPlantLifeProp(max = 10000, basalRate = 0.2) {
  return {
    energy: max * 0.8,
    max,
    basalRate,
    effect(ent, dt, world) {
      if (!world) return;
      this.energy = Math.max(0, this.energy - dt * this.basalRate);
    }
  };
}

/**
 * Photosynthesis (Daylight Energy Generation with Moisture Boost)
 */
export function createPhotosynthesisProp(rate = 0.5, energyPerSun = 18.0) {
  return {
    rate,
    energyPerSun,
    effect(ent, dt, world) {
      if (!world || !ent.properties.life) return;

      const sunFactor = world.sunlight !== undefined ? world.sunlight : 1.0;
      if (sunFactor > 0.05) {
        const hasWater = hasNearbyWater(world, ent.x, ent.y, 8);
        const waterBoost = hasWater ? 1.5 : 1.0;
        ent.properties.life.energy = Math.min(
          ent.properties.life.max,
          ent.properties.life.energy + dt * this.energyPerSun * sunFactor * waterBoost
        );
      }
    }
  };
}

/**
 * Deep Root (Desert & Arid adaptation)
 */
export function createDeepRootProp(waterGain = 20.0, energyGain = 12.0) {
  return {
    waterGain,
    energyGain,
    condition: 100,
    maxCondition: 100,
    nutrition: 1200,
    foodType: "plant",
    effect(ent, dt) {
      if (ent.properties.bladder) {
        ent.properties.bladder.water = Math.min(
          ent.properties.bladder.maxWater,
          ent.properties.bladder.water + dt * this.waterGain
        );
      }
      if (ent.properties.life) {
        ent.properties.life.energy = Math.min(
          ent.properties.life.max,
          ent.properties.life.energy + dt * this.energyGain
        );
      }
    }
  };
}

/**
 * Surface Roots: Deprecated / Disabled to preserve simulation performance
 */
export function createSurfaceRootProp() {
  return null;
}

/**
 * Fruiting (Generates Edible Fruits with Seeds at Low Frequency with Density Limit)
 */
export function createFruitingProp(interval = 180.0, seedType = "small", species = "oak", initialTimer = null) {
  return {
    interval,
    seedType,
    species,
    timer: initialTimer !== null ? initialTimer : Math.random() * (interval * 0.95),
    effect(ent, dt, world, entities) {
      if (!ent.properties.life || !entities || !world) return;
      if (ent.properties.life.energy < ent.properties.life.max * 0.35) return;

      this.timer = (this.timer || 0) + dt;
      if (this.timer >= this.interval) {
        this.timer = 0;

        // Density check: avoid fruiting if there are already fruits nearby
        let nearbyFruits = 0;
        for (let i = 0; i < entities.length; i++) {
          const e = entities[i];
          if (!e.destroyed && e.properties?.edible?.foodType === "fruit" && Math.abs(e.x - ent.x) <= 3 && Math.abs(e.y - ent.y) <= 3) {
            nearbyFruits++;
            if (nearbyFruits >= 2) break;
          }
        }
        if (nearbyFruits >= 2) return;

        const fx = Math.max(0, Math.min(world.width - 1, ent.x + (Math.floor(Math.random() * 3) - 1)));
        const fy = Math.max(0, Math.min(world.height - 1, ent.y + (Math.floor(Math.random() * 3) - 1)));

        const fruit = createEntity(
          {
            name: `Ripe Fruit of ${ent.properties.name}`,
            render: { skin: "Item_Fruit.png", color: 0xffff3250, backcolor: 0x00000000 },
            edible: {
              nutrition: 1200,
              foodType: "fruit",
              digestDuration: 20,
              sourceName: ent.properties.name,
              sourceSpecies: ent.properties.species,
              seed: { type: this.seedType, species: this.species }
            }
          },
          fx,
          fy
        );

        entities.push(fruit);
        ent.properties.life.energy -= 40;
      }
    }
  };
}

/**
 * Terrain Preference
 */
export function createTerrainPreferenceProp(preferred = [0], name = "Fertile Soil") {
  return {
    preferred,
    preferredName: name,
    effect(ent, dt, world) {
      if (!world) return;
      const currentTile = world.getTile(ent.x, ent.y);

      if (!this.preferred.includes(currentTile)) {
        if (ent.properties.life) {
          ent.properties.life.energy = Math.max(0, ent.properties.life.energy - dt * 30.0);
        }
      }
    }
  };
}

// ---------------------------------------------------------------------------
// 4. Auxiliary Properties
// ---------------------------------------------------------------------------

export function createParasitesProp(rate = 1.5, stomachDrain = 300, energyDrain = 15) {
  return {
    rate,
    effect(ent) {
      if (ent.properties.stomach && ent.properties.stomach.items.length > 0) {
        ent.properties.stomach.items[0].nutrition = Math.max(0, ent.properties.stomach.items[0].nutrition - stomachDrain);
      }
      if (ent.properties.life) {
        ent.properties.life.energy = Math.max(0, ent.properties.life.energy - energyDrain);
      }
    }
  };
}

export function createRegenerationProp(rate = 1.0, amount = 30) {
  return {
    rate,
    effect(ent) {
      if (ent.properties.life && ent.properties.life.energy < ent.properties.life.max) {
        ent.properties.life.energy = Math.min(
          ent.properties.life.max,
          ent.properties.life.energy + amount
        );
      }
    }
  };
}

export function createBurnProp(rate = 0.5, damage = 40) {
  return {
    rate,
    effect(ent) {
      if (ent.properties.life) {
        ent.properties.life.energy = Math.max(0, ent.properties.life.energy - damage);
      }
    }
  };
}

// ---------------------------------------------------------------------------
// 5. Entity Prefabs / Archetypes (Fauna with Paws & Claws, Humanoids with Arms)
// ---------------------------------------------------------------------------

export function createKnight(x, y, gender = "male") {
  const naming = generateUniqueCreatureName("Imperial Knight", "human");
  return createEntity(
    {
      name: naming.fullName,
      surname: naming.surname,
      species: "human",
      render: { skin: "Human_Knight_M.png", color: 0xffdcdce6, backcolor: 0xff1e283c },
      life: createLifeProp(6000, 6000),
      terrestrial: createTerrestrialProp(),
      mouth: createMouthProp(32, 32),
      communication: createCommunicationProp(2.0),
      brain: createBrainProp(16, { bravery: 0.9, curiosity: 0.5, aggression: 0.4 }, 1.2),
      stomach: createStomachProp(4, { meat: 1.0, plant: 0.8, fruit: 1.0, organ: 0.9, bone: 0.1 }),
      bladder: createBladderProp(3000, 3000),
      kidney: createKidneyProp(0.75),
      body_regen: createBodyRegenerationProp(1.0, 4, 10),
      combat: createCombatProp(1.2, 3),
      crafter: createCrafterProp(),
      builder: createBuilderProp(),
      arm_left: createArmProp("left", 1.0, 100, 100, { name: generateUniqueWeaponName("Iron Shield"), defense: 20 }),
      arm_right: createArmProp("right", 1.0, 100, 100, { name: generateUniqueWeaponName("Steel Sword"), damage: 35, isWeapon: true }),
      leg_left: createLegProp("left", 1.0, 100, 100),
      leg_right: createLegProp("right", 1.0, 100, 100),
      eye_left: createEyeProp("left", 9),
      eye_right: createEyeProp("right", 9),
      genitalia: createGenitaliaProp(gender === "male" ? "penis" : "vagina"),
      locomotion: createLocomotionProp(),
      torso: { condition: 100, maxCondition: 100, nutrition: 2500, foodType: "meat" }
    },
    x,
    y
  );
}

export function createArcher(x, y, gender = "female") {
  const naming = generateUniqueCreatureName("Forest Archer", "human");
  return createEntity(
    {
      name: naming.fullName,
      surname: naming.surname,
      species: "human",
      render: { skin: "Human_Archer_F.png", color: 0xffa0e678, backcolor: 0xff1e3214 },
      life: createLifeProp(5000, 5000),
      terrestrial: createTerrestrialProp(),
      mouth: createMouthProp(32, 32),
      communication: createCommunicationProp(2.0),
      brain: createBrainProp(16, { bravery: 0.6, curiosity: 0.8, aggression: 0.3 }, 1.1),
      stomach: createStomachProp(3, { meat: 0.9, plant: 1.0, fruit: 1.2, organ: 0.8, bone: 0.1 }),
      bladder: createBladderProp(2500, 2500),
      kidney: createKidneyProp(0.7),
      body_regen: createBodyRegenerationProp(1.0, 4, 10),
      combat: createCombatProp(1.0, 4),
      crafter: createCrafterProp(),
      arm_left: createArmProp("left", 1.0, 100, 100),
      arm_right: createArmProp("right", 1.0, 100, 100, { name: generateUniqueWeaponName("Recurve Bow"), damage: 40, isWeapon: true }),
      leg_left: createLegProp("left", 1.1, 100, 100),
      leg_right: createLegProp("right", 1.1, 100, 100),
      eye_left: createEyeProp("left", 14),
      eye_right: createEyeProp("right", 14),
      genitalia: createGenitaliaProp(gender === "male" ? "penis" : "vagina"),
      locomotion: createLocomotionProp(),
      flesh: { condition: 100, maxCondition: 100, nutrition: 2000, foodType: "meat" }
    },
    x,
    y
  );
}

export function createCat(x, y, infected = false) {
  const naming = generateUniqueCreatureName(infected ? "Infected Feline" : "Wild Feline", "cat");
  const cat = createEntity(
    {
      name: naming.fullName,
      surname: naming.surname,
      species: "cat",
      render: { skin: "Creature_Cat_U.png", color: 0xfff0b464, backcolor: 0xff321e0f },
      life: createLifeProp(3500, 3500),
      terrestrial: createTerrestrialProp(),
      mouth: createMouthProp(30, 30),
      communication: createCommunicationProp(3.0),
      brain: createBrainProp(12, { bravery: 0.4, curiosity: 0.9, aggression: 0.3 }, 1.0),
      stomach: createStomachProp(2, { meat: 1.3, plant: 0.2, fruit: 0.5, organ: 1.4, bone: 0.4 }),
      bladder: createBladderProp(1500, 1500),
      kidney: createKidneyProp(0.6),
      body_regen: createBodyRegenerationProp(1.0, 3, 8),
      combat: createCombatProp(1.0, 2),
      paw_front_left: createPawProp("front_left", 1.0, 100, 100, 4, 4, 14),
      paw_front_right: createPawProp("front_right", 1.0, 100, 100, 4, 4, 14),
      paw_back_left: createPawProp("back_left", 1.0, 100, 100, 4, 4, 14),
      paw_back_right: createPawProp("back_right", 1.0, 100, 100, 4, 4, 14),
      eye_left: createEyeProp("left", 10),
      eye_right: createEyeProp("right", 10),
      genitalia: createGenitaliaProp("vagina"),
      locomotion: createLocomotionProp(),
      flesh: { condition: 100, maxCondition: 100, nutrition: 1800, foodType: "meat" }
    },
    x,
    y
  );

  if (infected) {
    cat.properties.parasites = createParasitesProp(1.5);
  }

  return cat;
}

export function createWolf(x, y) {
  const naming = generateUniqueCreatureName("Dire Wolf", "wolf");
  return createEntity(
    {
      name: naming.fullName,
      surname: naming.surname,
      species: "wolf",
      render: { skin: "Creature_Wolf_U.png", color: 0xffc8c8dc, backcolor: 0xff28283c },
      life: createLifeProp(4500, 4500),
      terrestrial: createTerrestrialProp(),
      mouth: createMouthProp(42, 42),
      communication: createCommunicationProp(2.5),
      brain: createBrainProp(14, { bravery: 0.8, curiosity: 0.7, aggression: 0.7 }, 1.1),
      stomach: createStomachProp(3, { meat: 1.4, plant: 0.1, fruit: 0.3, organ: 1.3, bone: 0.6 }),
      bladder: createBladderProp(2000, 2000),
      kidney: createKidneyProp(0.7),
      body_regen: createBodyRegenerationProp(1.0, 4, 9),
      combat: createCombatProp(1.0, 3),
      paw_front_left: createPawProp("front_left", 1.1, 100, 100, 4, 4, 24),
      paw_front_right: createPawProp("front_right", 1.1, 100, 100, 4, 4, 24),
      paw_back_left: createPawProp("back_left", 1.1, 100, 100, 4, 4, 24),
      paw_back_right: createPawProp("back_right", 1.1, 100, 100, 4, 4, 24),
      eye_left: createEyeProp("left", 12),
      eye_right: createEyeProp("right", 12),
      genitalia: createGenitaliaProp("penis"),
      locomotion: createLocomotionProp(),
      flesh: { condition: 100, maxCondition: 100, nutrition: 2200, foodType: "meat" }
    },
    x,
    y
  );
}

export function createBear(x, y) {
  const naming = generateUniqueCreatureName("Grizzly Bear", "bear");
  return createEntity(
    {
      name: naming.fullName,
      surname: naming.surname,
      species: "bear",
      render: { skin: "Creature_Bear_U.png", color: 0xff965a28, backcolor: 0xff32190a },
      life: createLifeProp(12000, 12000),
      terrestrial: createTerrestrialProp(),
      aquatic: createAquaticProp(),
      mouth: createMouthProp(42, 42),
      communication: createCommunicationProp(3.0),
      brain: createBrainProp(16, { bravery: 0.9, curiosity: 0.6, aggression: 0.6 }, 1.3),
      stomach: createStomachProp(6, { meat: 1.3, plant: 0.9, fruit: 1.4, organ: 1.2, bone: 0.5 }),
      bladder: createBladderProp(5000, 5000),
      kidney: createKidneyProp(0.75),
      body_regen: createBodyRegenerationProp(1.0, 6, 11),
      combat: createCombatProp(1.2, 3),
      paw_front_left: createPawProp("front_left", 1.4, 100, 100, 5, 5, 32),
      paw_front_right: createPawProp("front_right", 1.4, 100, 100, 5, 5, 32),
      paw_back_left: createPawProp("back_left", 1.3, 100, 100, 5, 5, 32),
      paw_back_right: createPawProp("back_right", 1.3, 100, 100, 5, 5, 32),
      eye_left: createEyeProp("left", 10),
      eye_right: createEyeProp("right", 10),
      genitalia: createGenitaliaProp("penis"),
      locomotion: createLocomotionProp(),
      flesh: { condition: 100, maxCondition: 100, nutrition: 6000, foodType: "meat" }
    },
    x,
    y
  );
}

export function createGoblin(x, y) {
  const naming = generateUniqueCreatureName("Goblin Scavenger", "goblin");
  return createEntity(
    {
      name: naming.fullName,
      surname: naming.surname,
      species: "goblin",
      render: { skin: "Creature_Goblin_U.png", color: 0xff78d250, backcolor: 0xff283c14 },
      life: createLifeProp(3200, 3200),
      terrestrial: createTerrestrialProp(),
      mouth: createMouthProp(28, 28),
      communication: createCommunicationProp(2.0),
      brain: createBrainProp(12, { bravery: 0.3, curiosity: 0.9, aggression: 0.6 }, 0.9),
      stomach: createStomachProp(3, { meat: 1.0, plant: 1.0, fruit: 1.1, organ: 1.0, bone: 0.4 }),
      bladder: createBladderProp(1800, 1800),
      kidney: createKidneyProp(0.7),
      body_regen: createBodyRegenerationProp(1.0, 3, 8),
      combat: createCombatProp(0.9, 3),
      miner: createMinerProp(),
      builder: createBuilderProp(),
      arm_left: createArmProp("left", 0.9, 100, 100),
      arm_right: createArmProp("right", 0.9, 100, 100, { name: generateUniqueWeaponName("Rusty Dagger"), damage: 22, isWeapon: true }),
      leg_left: createLegProp("left", 1.0, 100, 100),
      leg_right: createLegProp("right", 1.0, 100, 100),
      eye_left: createEyeProp("left", 11),
      eye_right: createEyeProp("right", 11),
      genitalia: createGenitaliaProp("male"),
      locomotion: createLocomotionProp(),
      flesh: { condition: 100, maxCondition: 100, nutrition: 1400, foodType: "meat" }
    },
    x,
    y
  );
}

export function createBat(x, y) {
  const naming = generateUniqueCreatureName("Cave Bat", "bat");
  return createEntity(
    {
      name: naming.fullName,
      surname: naming.surname,
      species: "bat",
      render: { skin: "Creature_Bat_U.png", color: 0xffb496dc, backcolor: 0xff281e3c },
      life: createLifeProp(2000, 2000),
      flying: createFlyingProp(2.2),
      terrestrial: createTerrestrialProp(),
      mouth: createMouthProp(20, 20),
      communication: createCommunicationProp(2.5),
      wings: createWingsProp(1.0, 100, 100, 15.0),
      brain: createBrainProp(10, { bravery: 0.3, curiosity: 0.8, aggression: 0.2 }, 0.8),
      stomach: createStomachProp(2, { meat: 0.5, fruit: 1.4, organ: 1.0 }),
      bladder: createBladderProp(1000, 1000),
      kidney: createKidneyProp(0.6),
      paw_back_left: createPawProp("back_left", 0.9, 100, 100, 3, 3, 12),
      paw_back_right: createPawProp("back_right", 0.9, 100, 100, 3, 3, 12),
      eye_left: createEyeProp("left", 12),
      eye_right: createEyeProp("right", 12),
      genitalia: createGenitaliaProp("female"),
      locomotion: createLocomotionProp(),
      flesh: { condition: 100, maxCondition: 100, nutrition: 800, foodType: "meat" }
    },
    x,
    y
  );
}

export function createSeaSerpent(x, y) {
  const naming = generateUniqueCreatureName("Abyssal Serpent", "serpent");
  return createEntity(
    {
      name: naming.fullName,
      surname: naming.surname,
      species: "serpent",
      render: { skin: "Creature_Snake_U.png", color: 0xff32c8d2, backcolor: 0xff0a2832 },
      life: createLifeProp(8000, 8000),
      aquatic: createAquaticProp(),
      mouth: createMouthProp(60, 60),
      communication: createCommunicationProp(3.5),
      brain: createBrainProp(14, { bravery: 0.7, curiosity: 0.6, aggression: 0.7 }, 1.2),
      stomach: createStomachProp(4, { meat: 1.4, organ: 1.3, bone: 0.4 }),
      bladder: createBladderProp(4000, 4000),
      kidney: createKidneyProp(0.5),
      body_regen: createBodyRegenerationProp(1.0, 5, 9),
      combat: createCombatProp(1.1, 3),
      tail: { condition: 100, maxCondition: 100, nutrition: 3000, foodType: "meat" },
      eye_left: createEyeProp("left", 11),
      eye_right: createEyeProp("right", 11),
      genitalia: createGenitaliaProp("vagina"),
      locomotion: createLocomotionProp(),
      flesh: { condition: 100, maxCondition: 100, nutrition: 4000, foodType: "meat" }
    },
    x,
    y
  );
}

export function createDragon(x, y) {
  const naming = generateUniqueCreatureName("Ancient Wyrm", "dragon");
  return createEntity(
    {
      name: naming.fullName,
      surname: naming.surname,
      species: "dragon",
      render: { skin: "Creature_Dragon_U.png", color: 0xffff4646, backcolor: 0xff3c0f0f },
      life: createLifeProp(30000, 30000),
      flying: createFlyingProp(2.5),
      terrestrial: createTerrestrialProp(),
      mouth: createMouthProp(80, 80),
      communication: createCommunicationProp(2.0),
      brain: createBrainProp(24, { bravery: 1.0, curiosity: 0.4, aggression: 0.9 }, 1.8),
      stomach: createStomachProp(8, { meat: 1.5, plant: 0.1, fruit: 0.2, organ: 1.5, bone: 1.0 }),
      bladder: createBladderProp(12000, 12000),
      kidney: createKidneyProp(0.8),
      body_regen: createBodyRegenerationProp(1.0, 8, 12),
      combat: createCombatProp(1.0, 4),
      wings: createWingsProp(1.5, 100, 100, 22.0),
      paw_front_left: createPawProp("front_left", 1.5, 100, 100, 5, 5, 42),
      paw_front_right: createPawProp("front_right", 1.5, 100, 100, 5, 5, 42),
      paw_back_left: createPawProp("back_left", 1.5, 100, 100, 5, 5, 42),
      paw_back_right: createPawProp("back_right", 1.5, 100, 100, 5, 5, 42),
      eye_left: createEyeProp("left", 15),
      eye_right: createEyeProp("right", 15),
      genitalia: createGenitaliaProp("penis"),
      regeneration: createRegenerationProp(1.0, 35),
      locomotion: createLocomotionProp(),
      dragon_flesh: { condition: 100, maxCondition: 100, nutrition: 10000, foodType: "meat" }
    },
    x,
    y
  );
}

/**
 * Seed Germination (Slow natural germination with spatial spacing constraints)
 */
export function createSeedGerminationProp(species = "oak", checkInterval = 20.0, sproutChance = 0.04) {
  return {
    timer: 0,
    species,
    checkInterval,
    sproutChance,
    effect(ent, dt, world, entities) {
      if (ent.destroyed || !world || !entities) return;

      this.timer = (this.timer || 0) + dt;
      if (this.timer >= this.checkInterval) {
        this.timer = 0;

        // Density & Spacing Clearance: Do not sprout if another tree/plant is within 3 tiles
        for (let i = 0; i < entities.length; i++) {
          const e = entities[i];
          if (!e.destroyed && e.id !== ent.id && (e.properties?.photosynthesis || e.properties?.deep_root || e.properties?.plant_flesh || e.properties?.species === "oak" || e.properties?.species === "willow" || e.properties?.species === "cactus" || e.properties?.species === "pine" || e.properties?.species === "lichen")) {
            if (Math.abs(e.x - ent.x) <= 3 && Math.abs(e.y - ent.y) <= 3) {
              return; // Area already occupied by vegetation
            }
          }
        }

        const tile = world.getTile(ent.x, ent.y);
        const isSuitable =
          (this.species === "cactus" && (tile === 3 || tile === 0)) ||
          (this.species === "lichen" && (tile === 4 || tile === 1)) ||
          (this.species === "pine" && (tile === 0 || tile === 4 || tile === 1)) ||
          (tile === 0 || tile === 3);

        if (isSuitable && Math.random() < this.sproutChance) {
          let newPlant = null;
          if (this.species === "willow") {
            newPlant = createWillowTree(ent.x, ent.y);
          } else if (this.species === "pine") {
            newPlant = createPineTree(ent.x, ent.y);
          } else if (this.species === "cactus") {
            newPlant = createCactus(ent.x, ent.y);
          } else if (this.species === "lichen") {
            newPlant = createAlpineShrub(ent.x, ent.y);
          } else {
            newPlant = createOakTree(ent.x, ent.y);
          }

          ent.destroyed = true;
          if (entities && newPlant) {
            entities.push(newPlant);
            recordWorldEvent({
              type: "SPROUT",
              primaryEntityId: newPlant.id,
              secondaryEntityId: ent.id,
              location: { x: ent.x, y: ent.y },
              description: `A wild seed slowly germinated into ${newPlant.properties.name}!`,
              tick: currentTick,
              timestamp: world?.clock ? { day: world.clock.day, hour: world.clock.hour, minute: world.clock.minute } : null,
              metadata: { species: this.species }
            });
          }
        }
      }
    }
  };
}

// ---------------------------------------------------------------------------
// 6. Biome-Specific Flora and Fauna Prefabs
// ---------------------------------------------------------------------------

export function createCactus(x, y) {
  return createEntity(
    {
      name: generateUniqueFloraName("Desert Cactus", "cactus"),
      species: "cactus",
      render: { skin: "Feature_Tree_Pine.png", color: 0xff50c850, backcolor: 0xff28501e },
      life: createLifeProp(8000, 8000, 0.4),
      bladder: createBladderProp(12000, 12000),
      deep_root: createDeepRootProp(22.0, 14.0),
      photosynthesis: createPhotosynthesisProp(0.2, 38.0),
      fruiting: createFruitingProp(180.0, "large", "cactus"),
      terrain_pref: createTerrainPreferenceProp([3], "Arid Desert Sand"),
      plant_flesh: { nutrition: 1600, foodType: "plant" }
    },
    x,
    y
  );
}

export function createScorpion(x, y) {
  const naming = generateUniqueCreatureName("Dune Scorpion", "scorpion");
  return createEntity(
    {
      name: naming.fullName,
      surname: naming.surname,
      species: "scorpion",
      render: { skin: "Creature_Spider_U.png", color: 0xffe6b432, backcolor: 0xff3c2805 },
      life: createLifeProp(3800, 3800),
      terrestrial: createTerrestrialProp(),
      communication: createCommunicationProp(4.0),
      brain: createBrainProp(12, { bravery: 0.7, curiosity: 0.6, aggression: 0.8 }, 1.0),
      stomach: createStomachProp(2, { meat: 1.4, organ: 1.2, plant: 0.1 }),
      bladder: createBladderProp(1800, 1800),
      kidney: createKidneyProp(0.5),
      combat: createCombatProp(1.1, 2),
      arm_left: createArmProp("pincher", 1.1, 100, 100, { name: generateUniqueWeaponName("Crushing Pincer"), damage: 32 }),
      arm_right: createArmProp("stinger", 1.2, 100, 100, { name: generateUniqueWeaponName("Venomous Stinger"), damage: 46 }),
      leg_left: createLegProp("legs_left", 1.2, 100, 100),
      leg_right: createLegProp("legs_right", 1.2, 100, 100),
      terrain_pref: createTerrainPreferenceProp([3], "Desert Sand"),
      locomotion: createLocomotionProp(),
      carapace: { condition: 100, maxCondition: 100, defense: 25, nutrition: 800, foodType: "bone" },
      flesh: { condition: 100, maxCondition: 100, nutrition: 1500, foodType: "meat" }
    },
    x,
    y
  );
}

export function createLizard(x, y) {
  const naming = generateUniqueCreatureName("Sand Lizard", "lizard");
  return createEntity(
    {
      name: naming.fullName,
      surname: naming.surname,
      species: "lizard",
      render: { skin: "Creature_Snake_U.png", color: 0xffd2c850, backcolor: 0xff32280a },
      life: createLifeProp(2400, 2400),
      terrestrial: createTerrestrialProp(),
      mouth: createMouthProp(24, 24),
      communication: createCommunicationProp(3.5),
      brain: createBrainProp(10, { bravery: 0.3, curiosity: 0.8, aggression: 0.2 }, 0.9),
      stomach: createStomachProp(2, { meat: 1.1, fruit: 1.3, plant: 0.8 }),
      bladder: createBladderProp(1200, 1200),
      kidney: createKidneyProp(0.6),
      paw_front_left: createPawProp("front_left", 1.1, 100, 100, 3, 3, 12),
      paw_front_right: createPawProp("front_right", 1.1, 100, 100, 3, 3, 12),
      paw_back_left: createPawProp("back_left", 1.1, 100, 100, 3, 3, 12),
      paw_back_right: createPawProp("back_right", 1.1, 100, 100, 3, 3, 12),
      terrain_pref: createTerrainPreferenceProp([3, 0], "Sand and Soil"),
      locomotion: createLocomotionProp(),
      flesh: { condition: 100, maxCondition: 100, nutrition: 900, foodType: "meat" }
    },
    x,
    y
  );
}

export function createAlpineShrub(x, y) {
  return createEntity(
    {
      name: generateUniqueFloraName("Rock Lichen", "lichen"),
      species: "lichen",
      render: { skin: "Feature_Flower.png", color: 0xffb4c8a0, backcolor: 0xff283228 },
      life: createLifeProp(4500, 4500, 0.4),
      bladder: createBladderProp(2500, 2500),
      photosynthesis: createPhotosynthesisProp(0.25, 26.0),
      terrain_pref: createTerrainPreferenceProp([4, 1], "Rocky Ground and Mountain"),
      plant_flesh: { nutrition: 800, foodType: "plant" }
    },
    x,
    y
  );
}

export function createMountainGoat(x, y) {
  const naming = generateUniqueCreatureName("Mountain Goat", "goat");
  return createEntity(
    {
      name: naming.fullName,
      surname: naming.surname,
      species: "goat",
      render: { skin: "Creature_Bear_U.png", color: 0xffe6e6dc, backcolor: 0xff3c3c3c },
      life: createLifeProp(5200, 5200),
      terrestrial: createTerrestrialProp(),
      mouth: createMouthProp(32, 32),
      communication: createCommunicationProp(2.5),
      miner: createMinerProp(),
      brain: createBrainProp(14, { bravery: 0.6, curiosity: 0.7, aggression: 0.4 }, 1.1),
      stomach: createStomachProp(4, { plant: 1.4, fruit: 1.0, meat: 0.1 }),
      bladder: createBladderProp(2500, 2500),
      kidney: createKidneyProp(0.7),
      combat: createCombatProp(1.0, 3),
      horns: createArmProp("horns", 1.2, 100, 100, { name: generateUniqueWeaponName("Mountain Horns"), damage: 38 }),
      paw_front_left: createPawProp("front_left", 1.2, 100, 100, 0, 0, 0),
      paw_front_right: createPawProp("front_right", 1.2, 100, 100, 0, 0, 0),
      paw_back_left: createPawProp("back_left", 1.2, 100, 100, 0, 0, 0),
      paw_back_right: createPawProp("back_right", 1.2, 100, 100, 0, 0, 0),
      terrain_pref: createTerrainPreferenceProp([4, 1, 0], "Mountains and Crags"),
      locomotion: createLocomotionProp(),
      flesh: { condition: 100, maxCondition: 100, nutrition: 2600, foodType: "meat" }
    },
    x,
    y
  );
}

export function createOakTree(x, y) {
  return createEntity(
    {
      name: generateUniqueFloraName("Ancestral Oak", "oak"),
      species: "oak",
      render: { skin: "Feature_Tree_Full.png", color: 0xff78dc5a, backcolor: 0xff284619 },
      life: createLifeProp(12000, 12000, 1.2),
      bladder: createBladderProp(6000, 6000),
      deep_root: createDeepRootProp(20.0, 12.0),
      photosynthesis: createPhotosynthesisProp(0.3, 35.0),
      fruiting: createFruitingProp(220.0, "large", "oak"),
      terrain_pref: createTerrainPreferenceProp([0], "Fertile Land"),
      wood: { nutrition: 2000, foodType: "plant" }
    },
    x,
    y
  );
}

export function createWillowTree(x, y) {
  return createEntity(
    {
      name: generateUniqueFloraName("River Willow", "willow"),
      species: "willow",
      render: { skin: "Feature_Tree_Pine.png", color: 0xff64c850, backcolor: 0xff1e3c1e },
      life: createLifeProp(9000, 9000, 1.0),
      bladder: createBladderProp(4000, 4000),
      photosynthesis: createPhotosynthesisProp(0.3, 30.0),
      fruiting: createFruitingProp(180.0, "small", "willow"),
      terrain_pref: createTerrainPreferenceProp([0, 2], "Riverbank / Moist Soil"),
      wood: { nutrition: 1500, foodType: "plant" }
    },
    x,
    y
  );
}

export function createPineTree(x, y) {
  return createEntity(
    {
      name: generateUniqueFloraName("Highland Pine", "pine"),
      species: "pine",
      render: { skin: "Feature_Tree_Pine.png", color: 0xff3c8250, backcolor: 0xff0f2814 },
      life: createLifeProp(11000, 11000, 1.1),
      bladder: createBladderProp(5000, 5000),
      deep_root: createDeepRootProp(18.0, 14.0),
      photosynthesis: createPhotosynthesisProp(0.3, 32.0),
      fruiting: createFruitingProp(200.0, "large", "pine"),
      terrain_pref: createTerrainPreferenceProp([0, 1], "Soil and Mountain"),
      wood: { nutrition: 1800, foodType: "plant" }
    },
    x,
    y
  );
}

export function createWaterLily(x, y) {
  return createEntity(
    {
      name: generateUniqueFloraName("Aquatic Water Lily", "waterlily"),
      species: "waterlily",
      render: { skin: "Feature_Flower.png", color: 0xff50dca0, backcolor: 0xff0f3c28 },
      life: createLifeProp(5000, 5000, 0.6),
      bladder: createBladderProp(4000, 4000),
      deep_root: createDeepRootProp(20.0, 10.0),
      photosynthesis: createPhotosynthesisProp(0.2, 30.0),
      terrain_pref: createTerrainPreferenceProp([2], "Water Only"),
      plant_flesh: { nutrition: 900, foodType: "plant" }
    },
    x,
    y
  );
}

export function createSeaweed(x, y) {
  return createEntity(
    {
      name: generateUniqueFloraName("Underwater Seaweed", "seaweed"),
      species: "seaweed",
      render: { skin: "Item_Leaf.png", color: 0xff32b478, backcolor: 0xff0a321e },
      life: createLifeProp(4000, 4000, 0.5),
      bladder: createBladderProp(3000, 3000),
      photosynthesis: createPhotosynthesisProp(0.1, 25.0),
      terrain_pref: createTerrainPreferenceProp([2], "Ocean Water"),
      edible: { nutrition: 1200, foodType: "plant", digestDuration: 25 }
    },
    x,
    y
  );
}

export function createFruit(x, y, seedType = "large", species = "oak") {
  let fruitName = "Fruit";
  if (species === "cactus") fruitName = "Dragon Fruit / Cactus Pear";
  else if (species === "willow") fruitName = "Willow Fig";
  else if (species === "pine") fruitName = "Pine Cone Fruit";
  else fruitName = "Acorn / Oak Fruit";

  return createEntity(
    {
      name: fruitName,
      render: { skin: "Item_Fruit.png", color: species === "cactus" ? 0xfffa5078 : 0xfffaa03c, backcolor: 0xff46230a },
      edible: {
        nutrition: species === "cactus" ? 3000 : 2500,
        foodType: "fruit",
        digestDuration: 30,
        sourceName: species === "cactus" ? "Desert Cactus" : (species === "willow" ? "Willow" : (species === "pine" ? "Pine" : "Oak")),
        sourceSpecies: species,
        seed: { type: seedType, species }
      }
    },
    x,
    y
  );
}

export function createSeedEntity(x, y, seedType = "large", species = "oak") {
  let seedName = `${species} Seed`;
  let seedSkin = "Other_Water.png"; // Teardrop seed / acorn shape
  let seedColor = 0xffc88c50; // Acorn golden brown

  if (species === "cactus") {
    seedName = "Cactus Seed";
    seedSkin = "Feature_Pebbles.png";
    seedColor = 0xff50c850;
  } else if (species === "lichen") {
    seedName = "Lichen Spore";
    seedSkin = "Item_Herb.png";
    seedColor = 0xffa0dc78;
  } else if (species === "willow") {
    seedName = "Willow Seed";
    seedSkin = "Item_Leaf.png";
    seedColor = 0xff64b450;
  } else if (species === "pine") {
    seedName = "Pine Nut";
    seedSkin = "Feature_Pebbles.png";
    seedColor = 0xff966432;
  } else {
    seedName = "Oak Acorn";
    seedSkin = "Other_Water.png";
    seedColor = 0xffc88c50;
  }

  return createEntity(
    {
      name: seedName,
      render: { skin: seedSkin, color: seedColor, backcolor: 0x00000000 },
      germination: createSeedGerminationProp(species, 25.0, 0.03),
      edible: { nutrition: 600, foodType: "plant", digestDuration: 20 },
      lifespan: {
        current: 0,
        max: 2400,
        effect(s) {
          this.current++;
          if (this.current >= this.max) s.destroyed = true;
        }
      }
    },
    x,
    y
  );
}

export function createPoopEntity(x, y, seed = null) {
  const poop = createEntity(
    {
      name: seed ? `Feces with Seed (${seed.species})` : "Excrement / Feces",
      resourceType: "feces",
      render: { skin: "Item_Nugget.png", color: 0xff643c14, backcolor: 0x00000000 },
      fertilizer: { quality: 1.0 },
      edible: { nutrition: 900, foodType: "feces", digestDuration: 40 },
      lifespan: {
        current: 0,
        max: 2400,
        effect(p) {
          this.current++;
          if (this.current >= this.max) p.destroyed = true;
        }
      }
    },
    x,
    y
  );

  if (seed && seed.type === "small") {
    poop.properties.germination = createSeedGerminationProp(seed.species, 30.0, 0.02);
  }

  return poop;
}

// ---------------------------------------------------------------------------
// 6. Founding Human Archetypes (Miner, Builder, Crafter, Farmer, Matriarch, Hunter, Explorer)
// ---------------------------------------------------------------------------

export function createHumanMiner(x, y, name = null) {
  const naming = name ? { fullName: name, surname: name.split(" ")[1] || getRandomVocabWord() } : generateUniqueCreatureName("Miner", "human");
  usedGlobalNames.add(naming.fullName);
  return createEntity(
    {
      name: naming.fullName,
      surname: naming.surname,
      species: "human",
      render: { skin: "Human_Guard_U.png", color: 0xffdcdce6, backcolor: 0xff1e283c },
      life: createLifeProp(7000, 7000),
      terrestrial: createTerrestrialProp(),
      mouth: createMouthProp(32, 32),
      communication: createCommunicationProp(1.5),
      brain: createBrainProp(18, { bravery: 0.8, curiosity: 0.6, aggression: 0.2 }, 1.2),
      stomach: createStomachProp(4, { meat: 1.0, plant: 0.9, fruit: 1.0, organ: 0.8, bone: 0.1 }),
      bladder: createBladderProp(3500, 3500),
      kidney: createKidneyProp(0.75),
      body_regen: createBodyRegenerationProp(1.0, 4, 10),
      combat: createCombatProp(1.2, 3),
      group_member: createGroupMemberProp(),
      arm_left: createArmProp("left", 1.0, 100, 100, { name: generateUniqueWeaponName("Iron Pickaxe"), damage: 28, isTool: true }),
      arm_right: createArmProp("right", 1.0, 100, 100),
      leg_left: createLegProp("left", 1.0, 100, 100),
      leg_right: createLegProp("right", 1.0, 100, 100),
      eye_left: createEyeProp("left", 9),
      eye_right: createEyeProp("right", 9),
      genitalia: createGenitaliaProp("penis", false),
      locomotion: createLocomotionProp(),
      torso: { condition: 100, maxCondition: 100, nutrition: 2500, foodType: "meat" }
    },
    x,
    y
  );
}

export function createHumanBuilder(x, y, name = null) {
  const naming = name ? { fullName: name, surname: name.split(" ")[1] || getRandomVocabWord() } : generateUniqueCreatureName("Builder", "human");
  usedGlobalNames.add(naming.fullName);
  return createEntity(
    {
      name: naming.fullName,
      surname: naming.surname,
      species: "human",
      render: { skin: "Human_Normal_M.png", color: 0xfff0c878, backcolor: 0xff3c2814 },
      life: createLifeProp(6500, 6500),
      terrestrial: createTerrestrialProp(),
      mouth: createMouthProp(32, 32),
      communication: createCommunicationProp(1.5),
      brain: createBrainProp(18, { bravery: 0.7, curiosity: 0.7, aggression: 0.2 }, 1.1),
      stomach: createStomachProp(4, { meat: 1.0, plant: 0.9, fruit: 1.0, organ: 0.8, bone: 0.1 }),
      bladder: createBladderProp(3500, 3500),
      kidney: createKidneyProp(0.75),
      body_regen: createBodyRegenerationProp(1.0, 4, 10),
      combat: createCombatProp(1.1, 3),
      group_member: createGroupMemberProp(),
      arm_left: createArmProp("left", 1.0, 100, 100, { name: generateUniqueWeaponName("Carpenter Hammer"), damage: 22, isTool: true }),
      arm_right: createArmProp("right", 1.0, 100, 100),
      leg_left: createLegProp("left", 1.0, 100, 100),
      leg_right: createLegProp("right", 1.0, 100, 100),
      eye_left: createEyeProp("left", 9),
      eye_right: createEyeProp("right", 9),
      genitalia: createGenitaliaProp("penis", false),
      locomotion: createLocomotionProp(),
      torso: { condition: 100, maxCondition: 100, nutrition: 2500, foodType: "meat" }
    },
    x,
    y
  );
}

export function createHumanCrafter(x, y, name = null) {
  const naming = name ? { fullName: name, surname: name.split(" ")[1] || getRandomVocabWord() } : generateUniqueCreatureName("Crafter", "human");
  usedGlobalNames.add(naming.fullName);
  return createEntity(
    {
      name: naming.fullName,
      surname: naming.surname,
      species: "human",
      render: { skin: "Human_Normal_M.png", color: 0xffa0b4e6, backcolor: 0xff1e2846 },
      life: createLifeProp(6000, 6000),
      terrestrial: createTerrestrialProp(),
      mouth: createMouthProp(32, 32),
      communication: createCommunicationProp(1.5),
      brain: createBrainProp(20, { bravery: 0.6, curiosity: 0.9, aggression: 0.1 }, 1.3),
      stomach: createStomachProp(4, { meat: 1.0, plant: 0.9, fruit: 1.0, organ: 0.8, bone: 0.1 }),
      bladder: createBladderProp(3500, 3500),
      kidney: createKidneyProp(0.75),
      body_regen: createBodyRegenerationProp(1.0, 4, 10),
      combat: createCombatProp(1.0, 2),
      group_member: createGroupMemberProp(),
      arm_left: createArmProp("left", 1.0, 100, 100, { name: generateUniqueWeaponName("Carving Knife"), damage: 18, isTool: true }),
      arm_right: createArmProp("right", 1.0, 100, 100),
      leg_left: createLegProp("left", 1.0, 100, 100),
      leg_right: createLegProp("right", 1.0, 100, 100),
      eye_left: createEyeProp("left", 9),
      eye_right: createEyeProp("right", 9),
      genitalia: createGenitaliaProp("penis", false),
      locomotion: createLocomotionProp(),
      torso: { condition: 100, maxCondition: 100, nutrition: 2500, foodType: "meat" }
    },
    x,
    y
  );
}

export function createHumanFarmer(x, y, name = null) {
  const naming = name ? { fullName: name, surname: name.split(" ")[1] || getRandomVocabWord() } : generateUniqueCreatureName("Farmer", "human");
  usedGlobalNames.add(naming.fullName);
  return createEntity(
    {
      name: naming.fullName,
      surname: naming.surname,
      species: "human",
      render: { skin: "Human_Normal_M.png", color: 0xff82c878, backcolor: 0xff143c1e },
      life: createLifeProp(6500, 6500),
      terrestrial: createTerrestrialProp(),
      mouth: createMouthProp(32, 32),
      communication: createCommunicationProp(1.5),
      brain: createBrainProp(18, { bravery: 0.6, curiosity: 0.8, aggression: 0.1 }, 1.2),
      stomach: createStomachProp(4, { meat: 1.0, plant: 1.2, fruit: 1.3, organ: 0.8, bone: 0.1 }),
      bladder: createBladderProp(3500, 3500),
      kidney: createKidneyProp(0.75),
      body_regen: createBodyRegenerationProp(1.0, 4, 10),
      combat: createCombatProp(1.0, 2),
      group_member: createGroupMemberProp(),
      arm_left: createArmProp("left", 1.0, 100, 100, { name: generateUniqueWeaponName("Cultivation Hoe"), damage: 18, isTool: true, toolType: "hoe" }),
      arm_right: createArmProp("right", 1.0, 100, 100),
      leg_left: createLegProp("left", 1.0, 100, 100),
      leg_right: createLegProp("right", 1.0, 100, 100),
      eye_left: createEyeProp("left", 9),
      eye_right: createEyeProp("right", 9),
      genitalia: createGenitaliaProp("penis", false),
      locomotion: createLocomotionProp(),
      torso: { condition: 100, maxCondition: 100, nutrition: 2500, foodType: "meat" }
    },
    x,
    y
  );
}

export function createHumanMatriarch(x, y, name = null) {
  const naming = name ? { fullName: name, surname: name.split(" ")[1] || getRandomVocabWord() } : generateUniqueCreatureName("Matriarch", "human");
  usedGlobalNames.add(naming.fullName);
  return createEntity(
    {
      name: naming.fullName,
      surname: naming.surname,
      species: "human",
      render: { skin: "Human_Normal_F.png", color: 0xffffb4c8, backcolor: 0xff461e28 },
      life: createLifeProp(6500, 6500),
      terrestrial: createTerrestrialProp(),
      mouth: createMouthProp(32, 32),
      communication: createCommunicationProp(1.8),
      brain: createBrainProp(20, { bravery: 0.7, curiosity: 0.8, aggression: 0.1 }, 1.4),
      stomach: createStomachProp(4, { meat: 1.0, plant: 1.0, fruit: 1.0, organ: 0.9, bone: 0.1 }),
      bladder: createBladderProp(3500, 3500),
      kidney: createKidneyProp(0.75),
      body_regen: createBodyRegenerationProp(1.2, 4, 10),
      combat: createCombatProp(1.0, 2),
      group_member: createGroupMemberProp(),
      arm_left: createArmProp("left", 1.0, 100, 100),
      arm_right: createArmProp("right", 1.0, 100, 100),
      leg_left: createLegProp("left", 1.0, 100, 100),
      leg_right: createLegProp("right", 1.0, 100, 100),
      eye_left: createEyeProp("left", 9),
      eye_right: createEyeProp("right", 9),
      genitalia: createGenitaliaProp("vagina", true), // Start pregnant!
      locomotion: createLocomotionProp(),
      torso: { condition: 100, maxCondition: 100, nutrition: 2500, foodType: "meat" }
    },
    x,
    y
  );
}

export function createHumanHunter(x, y, name = null) {
  const naming = name ? { fullName: name, surname: name.split(" ")[1] || getRandomVocabWord() } : generateUniqueCreatureName("Hunter", "human");
  usedGlobalNames.add(naming.fullName);
  return createEntity(
    {
      name: naming.fullName,
      surname: naming.surname,
      species: "human",
      render: { skin: "Human_Guard_U.png", color: 0xffc87850, backcolor: 0xff3c140a },
      life: createLifeProp(7500, 7500),
      terrestrial: createTerrestrialProp(),
      mouth: createMouthProp(32, 32),
      communication: createCommunicationProp(1.6),
      brain: createBrainProp(22, { bravery: 0.95, curiosity: 0.7, aggression: 0.75 }, 1.4),
      stomach: createStomachProp(5, { meat: 1.4, plant: 0.7, fruit: 0.8, organ: 1.2, bone: 0.2 }),
      bladder: createBladderProp(4000, 4000),
      kidney: createKidneyProp(0.7),
      body_regen: createBodyRegenerationProp(1.0, 4, 10),
      combat: createCombatProp(1.3, 4),
      group_member: createGroupMemberProp(),
      arm_left: createArmProp("left", 1.0, 100, 100, { name: generateUniqueWeaponName("Hunting Spear"), damage: 45, isWeapon: true }),
      arm_right: createArmProp("right", 1.0, 100, 100),
      leg_left: createLegProp("left", 1.2, 100, 100),
      leg_right: createLegProp("right", 1.2, 100, 100),
      eye_left: createEyeProp("left", 12),
      eye_right: createEyeProp("right", 12),
      genitalia: createGenitaliaProp("penis", false),
      locomotion: createLocomotionProp(),
      torso: { condition: 100, maxCondition: 100, nutrition: 3000, foodType: "meat" }
    },
    x,
    y
  );
}

export function createHumanExplorer(x, y, name = null) {
  const naming = name ? { fullName: name, surname: name.split(" ")[1] || getRandomVocabWord() } : generateUniqueCreatureName("Explorer", "human");
  usedGlobalNames.add(naming.fullName);
  return createEntity(
    {
      name: naming.fullName,
      surname: naming.surname,
      species: "human",
      render: { skin: "Human_Normal_F.png", color: 0xff78dce6, backcolor: 0xff0a323c },
      life: createLifeProp(6800, 6800),
      terrestrial: createTerrestrialProp(),
      mouth: createMouthProp(32, 32),
      communication: createCommunicationProp(2.2),
      brain: createBrainProp(28, { bravery: 0.9, curiosity: 1.0, aggression: 0.1 }, 1.8, true), // Infinite object memory!
      stomach: createStomachProp(4, { meat: 1.0, plant: 1.1, fruit: 1.2, organ: 0.9, bone: 0.1 }),
      bladder: createBladderProp(4500, 4500),
      kidney: createKidneyProp(0.65),
      body_regen: createBodyRegenerationProp(1.2, 4, 10),
      combat: createCombatProp(1.0, 2),
      explorer: createExplorerProp(),
      arm_left: createArmProp("left", 1.0, 100, 100, { name: generateUniqueWeaponName("Explorer Staff"), damage: 20, isTool: true }),
      arm_right: createArmProp("right", 1.0, 100, 100),
      leg_left: createLegProp("left", 1.3, 100, 100),
      leg_right: createLegProp("right", 1.3, 100, 100),
      eye_left: createEyeProp("left", 14),
      eye_right: createEyeProp("right", 14),
      genitalia: createGenitaliaProp("vagina", false),
      locomotion: createLocomotionProp(),
      torso: { condition: 100, maxCondition: 100, nutrition: 2500, foodType: "meat" }
    },
    x,
    y
  );
}
