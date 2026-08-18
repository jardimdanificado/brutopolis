import { createEntity, getEntityById, currentTick } from "./engine.js";
import { recordWorldEvent } from "./event_log.js";

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
 * Lungs for Terrestrial & Aerial Animals (Severe drowning in water)
 */
export function createLungsProp() {
  return {
    condition: 100,
    maxCondition: 100,
    nutrition: 400,
    foodType: "organ",
    effect(ent, dt, world) {
      if (!ent.properties.life) return;

      const isFlying = ent.properties.wings?.flying === true;
      const inWater = world && world.getTile(ent.x, ent.y) === 2;

      if (inWater && !isFlying) {
        ent.properties.life.energy = Math.max(0, ent.properties.life.energy - dt * 90.0);
        this.condition = Math.max(0, this.condition - dt * 12.0);
        ent.combatFlash = 2;
      } else {
        const mult = getDamagedEnergyMultiplier(this.condition, this.maxCondition);
        ent.properties.life.energy = Math.max(0, ent.properties.life.energy - dt * 0.2 * mult);
      }
    }
  };
}

/**
 * Gills for Aquatic Creatures (Severe suffocation out of water)
 */
export function createGillsProp() {
  return {
    condition: 100,
    maxCondition: 100,
    nutrition: 300,
    foodType: "organ",
    effect(ent, dt, world) {
      if (!ent.properties.life) return;

      const inWater = world && world.getTile(ent.x, ent.y) === 2;

      if (!inWater) {
        ent.properties.life.energy = Math.max(0, ent.properties.life.energy - dt * 90.0);
        this.condition = Math.max(0, this.condition - dt * 15.0);
        ent.combatFlash = 2;
      } else {
        const mult = getDamagedEnergyMultiplier(this.condition, this.maxCondition);
        ent.properties.life.energy = Math.max(0, ent.properties.life.energy - dt * 0.2 * mult);
      }
    }
  };
}

/**
 * Life / Basal Metabolic Energy
 */
export function createLifeProp(energy = 6000, max = 6000, basalRate = 0.5) {
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

          if (entities && world) {
            const poop = createPoopEntity(ent.x, ent.y, finishedItem.seed);
            entities.push(poop);
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

/**
 * Brain (Quality, Short/Long-Term Memory, 8x8 Geographic Zones & Territorial Affinities, Object Memory, Dietary Preferences)
 */
export function createBrainProp(maxPath = 16, personality = { bravery: 0.7, curiosity: 0.8, aggression: 0.3 }, quality = 1.0) {
  const shortCap = Math.max(4, Math.floor(quality * 10));
  const objCap = Math.max(3, Math.floor(quality * 6));

  return {
    quality,
    maxPath,
    path: [],
    mood: "calm",
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
      const idx = this.objectMemory.findIndex(m => m.entityId === item.id);
      if (idx >= 0) {
        this.objectMemory[idx].x = item.x;
        this.objectMemory[idx].y = item.y;
        this.objectMemory[idx].seenTick = currentTick;
        return;
      }

      const rec = {
        entityId: item.id,
        name: item.properties.name || "Objeto",
        foodType: item.properties.edible?.foodType || "food",
        nutrition: item.properties.edible?.nutrition || 1000,
        x: item.x,
        y: item.y,
        seenTick: currentTick
      };

      if (this.objectMemory.length < this.objectCapacity) {
        this.objectMemory.push(rec);
      } else {
        let replaceIdx = 0;
        let oldestTick = Infinity;
        for (let i = 0; i < this.objectMemory.length; i++) {
          if (this.objectMemory[i].seenTick < oldestTick) {
            oldestTick = this.objectMemory[i].seenTick;
            replaceIdx = i;
          }
        }
        this.objectMemory[replaceIdx] = rec;
      }
    },

    forgetObject(entityId) {
      this.objectMemory = this.objectMemory.filter(m => m.entityId !== entityId);
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
    }
  };
}

/**
 * Leg (Mobility, Attack with Kicks, Condition, Quality)
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
 * Arm & Hand (Combat, Defense, Item Holding)
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

/**
 * Genitalia (Sex & Reproduction)
 */
export function createGenitaliaProp(type = "penis") {
  return {
    type,
    reproduction: "sexual",
    condition: 100,
    maxCondition: 100,
    nutrition: 300,
    foodType: "organ",
    effect(ent, dt) {
      if (ent.properties.life) {
        const mult = getDamagedEnergyMultiplier(this.condition, this.maxCondition);
        ent.properties.life.energy = Math.max(0, ent.properties.life.energy - dt * 0.1 * mult);
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

// ---------------------------------------------------------------------------
// 2. Combat & Attack / Defense Behaviors
// ---------------------------------------------------------------------------

/**
 * Combat Behavior: Attacking with Arms and Legs, Defending with Limbs/Shields, Splash Damage
 */
export function createCombatProp(attackInterval = 1.2, aggroRange = 3) {
  return {
    attackTimer: 0,
    attackInterval,
    aggroRange,
    effect(ent, dt, world, entities) {
      if (!ent.properties.brain || !ent.properties.life || ent.properties.life.energy <= 100) return;

      this.attackTimer = (this.attackTimer || 0) + dt;
      if (this.attackTimer < this.attackInterval) return;

      const energyRatio = ent.properties.life.energy / ent.properties.life.max;
      const isDesperateHunger = energyRatio <= 0.25;

      // Find nearby target within attack range
      let target = null;
      for (const other of entities) {
        if (other !== ent && !other.destroyed && other.properties.life) {
          const dist = Math.abs(other.x - ent.x) + Math.abs(other.y - ent.y);
          if (dist === 1) {
            const affinity = ent.properties.brain.affinities?.[other.id] !== undefined ? ent.properties.brain.affinities[other.id] : 0;
            const isHostile = affinity < -20 || (ent.properties.brain.personality?.aggression || 0) > 0.4 || isDesperateHunger;

            if (isHostile) {
              target = other;
              break;
            }
          }
        }
      }

      if (!target) return;
      this.attackTimer = 0;

      // 1. Determine Weapon / Limb Used for Attack
      let attackPower = 0;
      let usedLimbName = "golpe corporal";
      let usedLimb = null;

      // Check arms first
      for (const [key, prop] of Object.entries(ent.properties)) {
        if (key.startsWith("arm") && prop && prop.condition > 10) {
          const limbFactor = (prop.condition / prop.maxCondition) * prop.quality;
          if (prop.heldItem && prop.heldItem.damage) {
            attackPower = (prop.heldItem.damage * 0.9) * limbFactor;
            usedLimbName = prop.heldItem.name || key;
          } else {
            attackPower = 28 * limbFactor;
            usedLimbName = `braço (${key})`;
          }
          usedLimb = prop;
          break;
        }
      }

      // If no working arm, try kicking with legs!
      if (!usedLimb) {
        for (const [key, prop] of Object.entries(ent.properties)) {
          if (key.startsWith("leg") && prop && prop.condition > 15) {
            const limbFactor = (prop.condition / prop.maxCondition) * prop.quality;
            attackPower = 32 * limbFactor;
            usedLimbName = `chute (${key})`;
            usedLimb = prop;
            break;
          }
        }
      }

      if (attackPower <= 0) return;

      // 2. Target Defense Calculation (Impact absorbed by shield or defending limb)
      let absorbedDamage = 0;
      let defendingLimb = null;

      for (const [key, prop] of Object.entries(target.properties)) {
        if ((key.startsWith("arm") || key.startsWith("leg")) && prop && prop.condition > 10) {
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

      let hitPartName = "corpo";
      if (physicalParts.length > 0) {
        // Pick primary target part for direct physical damage
        const primaryTarget = physicalParts[Math.floor(Math.random() * physicalParts.length)];
        const mainDamage = Math.round(netDamage * 0.75);
        primaryTarget.prop.condition = Math.max(0, primaryTarget.prop.condition - mainDamage);
        hitPartName = `${primaryTarget.key} (-${mainDamage} cond)`;

        // Secondary splash trauma to other body parts
        for (const pt of physicalParts) {
          if (pt !== primaryTarget && Math.random() < 0.45) {
            const splash = Math.round(Math.max(2, netDamage * 0.18));
            pt.prop.condition = Math.max(0, pt.prop.condition - splash);
          }
        }
      }

      // Minor direct shock to vital energy (~10% of physical blow)
      if (target.properties.life) {
        const energyShock = Math.max(10, Math.round(netDamage * 2.5));
        target.properties.life.energy = Math.max(0, target.properties.life.energy - energyShock);
      }

      // 4. Record indexed ATTACK event
      const attackDesc = `${ent.properties.name || `Entidade #${ent.id}`} atingiu ${hitPartName} de ${target.properties.name || `Entidade #${target.id}`} com ${usedLimbName} na posição [X: ${ent.x}, Y: ${ent.y}]!`;

      recordWorldEvent({
        type: "ATTACK",
        primaryEntityId: ent.id,
        secondaryEntityId: target.id,
        location: { x: ent.x, y: ent.y },
        description: attackDesc,
        tick: currentTick,
        timestamp: world?.clock ? { day: world.clock.day, hour: world.clock.hour, minute: world.clock.minute } : null,
        metadata: { usedLimbName, hitPartName, netDamage, absorbed: absorbedDamage }
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

      const isFlying = ent.properties.wings?.flying === true;

      let totalLegPower = 0;
      let legCount = 0;
      for (const [key, prop] of Object.entries(ent.properties)) {
        if (key.startsWith("leg") && prop && prop.condition !== undefined) {
          totalLegPower += (prop.quality * (prop.condition / prop.maxCondition));
          legCount++;
        }
      }

      if (!isFlying && (legCount === 0 || totalLegPower <= 0.05)) return; // Paralyzed

      const speedFactor = isFlying ? 2.5 : (totalLegPower / Math.max(1, legCount));
      const moveInterval = Math.max(0.18, 0.9 / speedFactor);

      this.stepTimer = (this.stepTimer || 0) + dt;
      if (this.stepTimer < moveInterval) return;
      this.stepTimer = 0;

      const energyRatio = ent.properties.life ? (ent.properties.life.energy / ent.properties.life.max) : 1.0;
      const waterRatio = ent.properties.bladder ? (ent.properties.bladder.water / ent.properties.bladder.maxWater) : 1.0;
      const viewRange = ent.properties.eye_left?.viewRange || ent.properties.eye_right?.viewRange || 9;

      let chosenDx = 0;
      let chosenDy = 0;
      let hasIntention = false;

      // -----------------------------------------------------------------------
      // Priority 1: Thirst (Water <= 50%) -> Seek water to drink
      // -----------------------------------------------------------------------
      if (waterRatio <= 0.50 && world) {
        const cardinalOffsets = [{ dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 }];
        let drank = false;
        for (const off of cardinalOffsets) {
          if (world.getTile(ent.x + off.dx, ent.y + off.dy) === 2) {
            if (ent.properties.bladder) {
              ent.properties.bladder.water = Math.min(ent.properties.bladder.maxWater, ent.properties.bladder.water + 600);
            }
            drank = true;
            break;
          }
        }

        if (!drank) {
          const waterTarget = findNearestWaterTile(world, ent.x, ent.y, viewRange);
          if (waterTarget) {
            chosenDx = Math.sign(waterTarget.x - ent.x);
            chosenDy = Math.sign(waterTarget.y - ent.y);
            hasIntention = true;
          }
        }
      }

      // -----------------------------------------------------------------------
      // Priority 2: Hunger (Energy <= 50% or Empty Stomach) -> Seek Food in view OR from Object Memory
      // -----------------------------------------------------------------------
      if (!hasIntention && (energyRatio <= 0.50 || (ent.properties.stomach?.items.length === 0))) {
        let bestFood = null;
        let highestFoodScore = -Infinity;

        // 1. Scan visible food in perception range
        for (const item of entities) {
          if (!item.destroyed && item.properties.edible) {
            const dist = Math.abs(item.x - ent.x) + Math.abs(item.y - ent.y);
            if (dist <= viewRange) {
              let score = 100 - dist * 5;
              const ed = item.properties.edible;

              // Factor in dietary preferences
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

        // 2. If no food in immediate view, navigate to memorized food in Object Memory!
        if (!bestFood && ent.properties.brain?.objectMemory?.length > 0) {
          for (let i = ent.properties.brain.objectMemory.length - 1; i >= 0; i--) {
            const memObj = ent.properties.brain.objectMemory[i];
            const dist = Math.abs(memObj.x - ent.x) + Math.abs(memObj.y - ent.y);

            // If we arrived at the memorized spot and the item is gone, forget it!
            if (dist === 0) {
              const stillThere = entities.some(e => !e.destroyed && e.id === memObj.entityId);
              if (!stillThere) {
                ent.properties.brain.objectMemory.splice(i, 1);
                continue;
              }
            }

            bestFood = { x: memObj.x, y: memObj.y };
            break;
          }
        }

        if (bestFood) {
          chosenDx = Math.sign(bestFood.x - ent.x);
          chosenDy = Math.sign(bestFood.y - ent.y);
          hasIntention = true;
        }
      }

      // -----------------------------------------------------------------------
      // Priority 3: Desperate Hunger (Energy <= 25%) -> Hunt other creatures!
      // -----------------------------------------------------------------------
      if (!hasIntention && energyRatio <= 0.25) {
        let bestPrey = null;
        let highestPreyScore = -Infinity;

        for (const prey of entities) {
          if (prey !== ent && !prey.destroyed && prey.properties.life) {
            const dist = Math.abs(prey.x - ent.x) + Math.abs(prey.y - ent.y);
            if (dist <= viewRange) {
              const affinity = ent.properties.brain?.affinities?.[prey.id] !== undefined ? ent.properties.brain.affinities[prey.id] : 0;
              if (affinity < 50) {
                const preyEnergy = prey.properties.life.energy || 1000;
                const preyScore = (100 - affinity) - (preyEnergy * 0.01) - (dist * 8);
                if (preyScore > highestPreyScore) {
                  highestPreyScore = preyScore;
                  bestPrey = prey;
                }
              }
            }
          }
        }

        if (bestPrey) {
          chosenDx = Math.sign(bestPrey.x - ent.x);
          chosenDy = Math.sign(bestPrey.y - ent.y);
          hasIntention = true;
        }
      }

      // -----------------------------------------------------------------------
      // Priority 4: Calm Wandering or Social Affection (Approach Allies)
      // -----------------------------------------------------------------------
      if (!hasIntention) {
        let bestFriend = null;
        for (const other of entities) {
          if (other !== ent && !other.destroyed && other.properties.life) {
            const aff = ent.properties.brain?.affinities?.[other.id] || 0;
            if (aff >= 60) {
              const dist = Math.abs(other.x - ent.x) + Math.abs(other.y - ent.y);
              if (dist <= viewRange && dist > 1) {
                bestFriend = other;
                break;
              }
            }
          }
        }

        if (bestFriend && Math.random() < 0.5) {
          chosenDx = Math.sign(bestFriend.x - ent.x);
          chosenDy = Math.sign(bestFriend.y - ent.y);
        } else {
          chosenDx = Math.floor(Math.random() * 3) - 1;
          chosenDy = Math.floor(Math.random() * 3) - 1;
        }
      }

      // Apply Movement Step
      if (chosenDx === 0 && chosenDy === 0) return;

      const targetX = ent.x + chosenDx;
      const targetY = ent.y + chosenDy;

      const canMove = isFlying
        ? (targetX >= 0 && targetX < 512 && targetY >= 0 && targetY < 512)
        : world?.isWalkable(targetX, targetY);

      if (canMove) {
        ent.x = targetX;
        ent.y = targetY;

        // Ingest food when standing on it
        if (ent.properties.stomach && ent.properties.stomach.items.length < ent.properties.stomach.capacity) {
          for (let i = entities.length - 1; i >= 0; i--) {
            const other = entities[i];
            if (other !== ent && !other.destroyed && other.x === ent.x && other.y === ent.y && other.properties.edible) {
              const ed = other.properties.edible;

              // Large Seed: spit out onto the ground immediately upon eating
              if (ed.seed && ed.seed.type === "large") {
                const seedEnt = createSeedEntity(ent.x, ent.y, "large", ed.seed.species);
                entities.push(seedEnt);
              }

              // Calculate preference nutrition modifier
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

              const finalNutrition = Math.round((ed.nutrition || 2000) * nutMultiplier);

              ent.properties.stomach.items.push({
                name: other.properties.name || "Alimento",
                nutrition: finalNutrition,
                foodType: ed.foodType || "fruit",
                totalTurns: ed.digestDuration || 30,
                remainingTurns: ed.digestDuration || 30,
                seed: ed.seed?.type === "small" ? ed.seed : null
              });

              // Forget from memory
              if (ent.properties.brain?.forgetObject) {
                ent.properties.brain.forgetObject(other.id);
              }

              // Build detailed feed provenance message
              const foodName = other.properties.name || "Alimento";
              const provenance = ed.sourceName ? `(proveniente de ${ed.sourceName})` : "";
              const feedMsg = `${ent.properties.name || `Entidade #${ent.id}`} comeu ${foodName} ${provenance} na posição [X: ${ent.x}, Y: ${ent.y}]!`;

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
                  desc: `Comeu ${foodName} ${provenance}`,
                  location: { x: ent.x, y: ent.y }
                });
              }

              other.destroyed = true;
              break;
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

function findNearestWaterTile(world, startX, startY, maxRadius = 14) {
  if (!world) return null;
  let closest = null;
  let minDist = Infinity;

  for (let r = 1; r <= maxRadius; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) === r || Math.abs(dy) === r) {
          const tx = startX + dx;
          const ty = startY + dy;
          if (tx >= 0 && tx < 512 && ty >= 0 && ty < 512) {
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

/**
 * Surface Rooting with Water Pathfinding
 */
export function createSurfaceRootProp(maxSpreadDistance = 8) {
  return {
    depth: "surface",
    maxSpreadDistance,
    rootEntityIds: [],
    spreadTimer: 0,
    nutrition: 600,
    foodType: "plant",
    effect(ent, dt, world, entities) {
      this.rootEntityIds = this.rootEntityIds.filter(id => {
        const rootEnt = getEntityById(id);
        return rootEnt && !rootEnt.destroyed;
      });

      let touchingWater = false;
      for (const id of this.rootEntityIds) {
        const rootEnt = getEntityById(id);
        if (rootEnt && world && world.getTile(rootEnt.x, rootEnt.y) === 2) {
          touchingWater = true;
          break;
        }
      }

      if (touchingWater) {
        if (ent.properties.bladder) {
          ent.properties.bladder.water = Math.min(
            ent.properties.bladder.maxWater,
            ent.properties.bladder.water + dt * 35.0
          );
        }
        if (ent.properties.life) {
          ent.properties.life.energy = Math.min(
            ent.properties.life.max,
            ent.properties.life.energy + dt * 15.0
          );
        }
      }

      // Expand towards nearest water
      this.spreadTimer = (this.spreadTimer || 0) + dt;
      if (this.spreadTimer >= 2.0 && !touchingWater) {
        this.spreadTimer = 0;

        const currentCount = this.rootEntityIds.length;
        const minRegenThreshold = Math.max(1, Math.floor(this.maxSpreadDistance / 10));

        if (currentCount < this.maxSpreadDistance && (currentCount >= minRegenThreshold || (ent.properties.life?.energy > 200))) {
          let tipX = ent.x;
          let tipY = ent.y;

          if (this.rootEntityIds.length > 0) {
            const lastRoot = getEntityById(this.rootEntityIds[this.rootEntityIds.length - 1]);
            if (lastRoot) {
              tipX = lastRoot.x;
              tipY = lastRoot.y;
            }
          }

          const waterTarget = findNearestWaterTile(world, tipX, tipY, 14);

          let stepX = tipX;
          let stepY = tipY;

          if (waterTarget) {
            const dirX = Math.sign(waterTarget.x - tipX);
            const dirY = Math.sign(waterTarget.y - tipY);

            if (dirX !== 0 && (Math.random() < 0.6 || dirY === 0)) {
              stepX += dirX;
            } else if (dirY !== 0) {
              stepY += dirY;
            }
          } else {
            stepX += Math.floor(Math.random() * 3) - 1;
            stepY += Math.floor(Math.random() * 3) - 1;
          }

          const dist = Math.abs(stepX - ent.x) + Math.abs(stepY - ent.y);
          if (dist > 0 && dist <= this.maxSpreadDistance && (stepX !== tipX || stepY !== tipY)) {
            const rootNode = createEntity(
              {
                name: `Raiz de ${ent.properties.name || "Planta"}`,
                render: { skin: "Item_Root.png", color: 0xff8c643c, backcolor: 0x00000000 },
                parentPlantId: ent.id,
                edible: {
                  nutrition: 500,
                  foodType: "plant",
                  digestDuration: 20
                },
                life: createLifeProp(600, 600)
              },
              stepX,
              stepY
            );

            this.rootEntityIds.push(rootNode.id);
            if (entities) entities.push(rootNode);
          }
        }
      }
    }
  };
}

/**
 * Deep Rooting (Draws subterranean water and minerals directly)
 */
export function createDeepRootProp(waterPullRate = 20.0, mineralEnergyRate = 12.0) {
  return {
    depth: "deep",
    nutrition: 1200,
    foodType: "plant",
    effect(ent, dt) {
      if (ent.properties.bladder) {
        ent.properties.bladder.water = Math.min(
          ent.properties.bladder.maxWater,
          ent.properties.bladder.water + dt * waterPullRate
        );
      }
      if (ent.properties.life) {
        ent.properties.life.energy = Math.min(
          ent.properties.life.max,
          ent.properties.life.energy + dt * mineralEnergyRate
        );
      }
    }
  };
}

/**
 * Photosynthesis (Requires water in bladder to produce energy; suffers severe drying out if waterless)
 */
export function createPhotosynthesisProp(lightThreshold = 0.3, energyGainRate = 40.0) {
  return {
    nutrition: 1000,
    foodType: "plant",
    effect(ent, dt, world) {
      const light = world?.clock?.globalLight || 1.0;
      const hasWater = (ent.properties.bladder?.water || 0) > 20;

      if (!hasWater) {
        // Severe drying out without water: high energy loss!
        if (ent.properties.life) {
          ent.properties.life.energy = Math.max(0, ent.properties.life.energy - dt * 60.0);
        }
        return;
      }

      if (light > lightThreshold && ent.properties.life) {
        // Photosynthesize using sun and water
        ent.properties.life.energy = Math.min(
          ent.properties.life.max,
          ent.properties.life.energy + dt * energyGainRate
        );
        if (ent.properties.bladder) {
          ent.properties.bladder.water = Math.max(0, ent.properties.bladder.water - dt * 2.0);
        }
      }
    }
  };
}

/**
 * Fruiting Behavior: Drops Fruits within max 2 tiles distance (Requires water and energy)
 */
export function createFruitingProp(fruitInterval = 25.0, seedType = "large", species = "oak") {
  return {
    fruitTimer: 0,
    fruitInterval,
    seedType,
    species,
    effect(ent, dt, world, entities) {
      const hasWater = (ent.properties.bladder?.water || 0) > 100;
      if (!hasWater || !ent.properties.life || ent.properties.life.energy < 2500) return;

      this.fruitTimer = (this.fruitTimer || 0) + dt;
      if (this.fruitTimer >= this.fruitInterval) {
        this.fruitTimer = 0;

        const dx = Math.floor(Math.random() * 5) - 2;
        const dy = Math.floor(Math.random() * 5) - 2;
        const fx = ent.x + dx;
        const fy = ent.y + dy;

        if (world && world.isWalkable(fx, fy)) {
          const fruit = createFruit(fx, fy, this.seedType, this.species);
          if (entities) entities.push(fruit);
        }
      }
    }
  };
}


/**
 * Terrain Preference
 */
export function createTerrainPreferenceProp(preferred = [0], name = "Solo Fértil") {
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
// 5. Entity Prefabs / Archetypes (All starting with empty stomachs!)
// ---------------------------------------------------------------------------

export function createKnight(x, y, gender = "male") {
  return createEntity(
    {
      name: "Cavaleiro Imperial",
      species: "human",
      render: { skin: "Human_Knight_M.png", color: 0xffdcdce6, backcolor: 0xff1e283c },
      life: createLifeProp(6000, 6000),
      lungs: createLungsProp(),
      brain: createBrainProp(16, { bravery: 0.9, curiosity: 0.5, aggression: 0.4 }, 1.2),
      stomach: createStomachProp(4, { meat: 1.0, plant: 0.8, fruit: 1.0, organ: 0.9, bone: 0.1 }),
      bladder: createBladderProp(3000, 3000),
      kidney: createKidneyProp(0.75),
      body_regen: createBodyRegenerationProp(1.0, 4, 10),
      combat: createCombatProp(1.2, 3),
      arm_left: createArmProp("left", 1.0, 100, 100, { name: "Escudo de Ferro", defense: 20 }),
      arm_right: createArmProp("right", 1.0, 100, 100, { name: "Espada de Aço", damage: 35 }),
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
  return createEntity(
    {
      name: "Arqueira da Floresta",
      species: "human",
      render: { skin: "Human_Archer_F.png", color: 0xffa0e678, backcolor: 0xff1e3214 },
      life: createLifeProp(5000, 5000),
      lungs: createLungsProp(),
      brain: createBrainProp(16, { bravery: 0.6, curiosity: 0.8, aggression: 0.3 }, 1.1),
      stomach: createStomachProp(3, { meat: 0.9, plant: 1.0, fruit: 1.2, organ: 0.8, bone: 0.1 }),
      bladder: createBladderProp(2500, 2500),
      kidney: createKidneyProp(0.7),
      body_regen: createBodyRegenerationProp(1.0, 4, 10),
      combat: createCombatProp(1.0, 4),
      arm_left: createArmProp("left", 1.0, 100, 100),
      arm_right: createArmProp("right", 1.0, 100, 100, { name: "Arco Longo", damage: 40 }),
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
  const cat = createEntity(
    {
      name: infected ? "Gato Silvestre (Infectado)" : "Gato Silvestre",
      species: "cat",
      render: { skin: "Creature_Cat_U.png", color: 0xfff0b464, backcolor: 0xff321e0f },
      life: createLifeProp(3500, 3500),
      lungs: createLungsProp(),
      brain: createBrainProp(12, { bravery: 0.4, curiosity: 0.9, aggression: 0.3 }, 1.0),
      stomach: createStomachProp(2, { meat: 1.3, plant: 0.2, fruit: 0.5, organ: 1.4, bone: 0.4 }),
      bladder: createBladderProp(1500, 1500),
      kidney: createKidneyProp(0.6),
      body_regen: createBodyRegenerationProp(1.0, 3, 8),
      combat: createCombatProp(1.0, 2),
      leg_front_left: createLegProp("front_left", 1.0, 100, 100),
      leg_front_right: createLegProp("front_right", 1.0, 100, 100),
      leg_back_left: createLegProp("back_left", 1.0, 100, 100),
      leg_back_right: createLegProp("back_right", 1.0, 100, 100),
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
  return createEntity(
    {
      name: "Lobo Alfa Feroz",
      species: "wolf",
      render: { skin: "Creature_Wolf_U.png", color: 0xffc8c8dc, backcolor: 0xff28283c },
      life: createLifeProp(4500, 4500),
      lungs: createLungsProp(),
      brain: createBrainProp(14, { bravery: 0.8, curiosity: 0.7, aggression: 0.7 }, 1.1),
      stomach: createStomachProp(3, { meat: 1.4, plant: 0.1, fruit: 0.3, organ: 1.3, bone: 0.6 }),
      bladder: createBladderProp(2000, 2000),
      kidney: createKidneyProp(0.7),
      body_regen: createBodyRegenerationProp(1.0, 4, 9),
      combat: createCombatProp(1.0, 3),
      arm_left: createArmProp("left", 1.0, 100, 100, { name: "Mordida Poderosa", damage: 40 }),
      leg_left: createLegProp("left", 1.2, 100, 100),
      leg_right: createLegProp("right", 1.2, 100, 100),
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
  return createEntity(
    {
      name: "Urso Pardo Gigante",
      species: "bear",
      render: { skin: "Creature_Bear_U.png", color: 0xff965a28, backcolor: 0xff32190a },
      life: createLifeProp(12000, 12000),
      lungs: createLungsProp(),
      brain: createBrainProp(16, { bravery: 0.9, curiosity: 0.6, aggression: 0.6 }, 1.3),
      stomach: createStomachProp(6, { meat: 1.3, plant: 0.9, fruit: 1.4, organ: 1.2, bone: 0.5 }),
      bladder: createBladderProp(5000, 5000),
      kidney: createKidneyProp(0.75),
      body_regen: createBodyRegenerationProp(1.0, 6, 11),
      combat: createCombatProp(1.2, 3),
      arm_left: createArmProp("left", 1.4, 100, 100, { name: "Garras Esmagadoras", damage: 55 }),
      arm_right: createArmProp("right", 1.4, 100, 100, { name: "Garras Esmagadoras", damage: 55 }),
      leg_left: createLegProp("left", 1.2, 100, 100),
      leg_right: createLegProp("right", 1.2, 100, 100),
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
  return createEntity(
    {
      name: "Goblin Saqueador",
      species: "goblin",
      render: { skin: "Creature_Goblin_U.png", color: 0xff78d250, backcolor: 0xff283c14 },
      life: createLifeProp(3200, 3200),
      lungs: createLungsProp(),
      brain: createBrainProp(12, { bravery: 0.3, curiosity: 0.9, aggression: 0.6 }, 0.9),
      stomach: createStomachProp(3, { meat: 1.0, plant: 1.0, fruit: 1.1, organ: 1.0, bone: 0.4 }),
      bladder: createBladderProp(1800, 1800),
      kidney: createKidneyProp(0.7),
      body_regen: createBodyRegenerationProp(1.0, 3, 8),
      combat: createCombatProp(0.9, 3),
      arm_left: createArmProp("left", 0.9, 100, 100),
      arm_right: createArmProp("right", 0.9, 100, 100, { name: "Adaga Enferrujada", damage: 22 }),
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
  return createEntity(
    {
      name: "Morcego Noturno",
      species: "bat",
      render: { skin: "Creature_Bat_U.png", color: 0xffb496dc, backcolor: 0xff281e3c },
      life: createLifeProp(2000, 2000),
      lungs: createLungsProp(),
      wings: createWingsProp(1.0, 100, 100, 15.0),
      brain: createBrainProp(10, { bravery: 0.3, curiosity: 0.8, aggression: 0.2 }, 0.8),
      stomach: createStomachProp(2, { meat: 0.5, fruit: 1.4, organ: 1.0 }),
      bladder: createBladderProp(1000, 1000),
      kidney: createKidneyProp(0.6),
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
  return createEntity(
    {
      name: "Serpente das Profundezas",
      species: "serpent",
      render: { skin: "Creature_Snake_U.png", color: 0xff32c8d2, backcolor: 0xff0a2832 },
      life: createLifeProp(8000, 8000),
      gills: createGillsProp(),
      brain: createBrainProp(14, { bravery: 0.7, curiosity: 0.6, aggression: 0.7 }, 1.2),
      stomach: createStomachProp(4, { meat: 1.4, organ: 1.3, bone: 0.4 }),
      bladder: createBladderProp(4000, 4000),
      kidney: createKidneyProp(0.5),
      body_regen: createBodyRegenerationProp(1.0, 5, 9),
      combat: createCombatProp(1.1, 3),
      arm_right: createArmProp("mouth", 1.2, 100, 100, { name: "Presas Venenosas", damage: 45 }),
      leg_left: createLegProp("tail", 1.4, 100, 100),
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
  return createEntity(
    {
      name: "Dragão Ancião Alado",
      species: "dragon",
      render: { skin: "Creature_Dragon_U.png", color: 0xffff4646, backcolor: 0xff3c0f0f },
      life: createLifeProp(30000, 30000),
      lungs: createLungsProp(),
      brain: createBrainProp(24, { bravery: 1.0, curiosity: 0.4, aggression: 0.9 }, 1.8),
      stomach: createStomachProp(8, { meat: 1.5, plant: 0.1, fruit: 0.2, organ: 1.5, bone: 1.0 }),
      bladder: createBladderProp(12000, 12000),
      kidney: createKidneyProp(0.8),
      body_regen: createBodyRegenerationProp(1.0, 8, 12),
      combat: createCombatProp(1.0, 4),
      wings: createWingsProp(1.5, 100, 100, 22.0),
      arm_left: createArmProp("left", 1.5, 100, 100, { name: "Garras de Dragão", damage: 60 }),
      arm_right: createArmProp("right", 1.5, 100, 100, { name: "Garras de Dragão", damage: 60 }),
      leg_left: createLegProp("left", 1.5, 100, 100),
      leg_right: createLegProp("right", 1.5, 100, 100),
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
 * Seed Germination (Low chance for seeds or feces to sprout into a tree/plant)
 */
export function createSeedGerminationProp(species = "oak", checkInterval = 6.0, sproutChance = 0.012) {
  return {
    timer: 0,
    species,
    checkInterval,
    sproutChance,
    effect(ent, dt, world, entities) {
      this.timer = (this.timer || 0) + dt;
      if (this.timer >= this.checkInterval) {
        this.timer = 0;

        if (world) {
          const tile = world.getTile(ent.x, ent.y);
          const isSuitable =
            (this.species === "cactus" && tile === 3) ||
            (this.species === "lichen" && (tile === 4 || tile === 1)) ||
            (this.species === "pine" && (tile === 0 || tile === 4 || tile === 1)) ||
            (tile === 0);

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
                description: `Uma semente germinou gerando ${newPlant.properties.name}!`,
                tick: currentTick,
                timestamp: world?.clock ? { day: world.clock.day, hour: world.clock.hour, minute: world.clock.minute } : null,
                metadata: { species: this.species }
              });
            }
          }
        }
      }
    }
  };
}

// ---------------------------------------------------------------------------
// 4. Biome-Specific Flora and Fauna Prefabs
// ---------------------------------------------------------------------------

export function createCactus(x, y) {
  return createEntity(
    {
      name: "Cacto do Deserto (Semente de Cacto)",
      species: "cactus",
      render: { skin: "Feature_Tree_Pine.png", color: 0xff50c850, backcolor: 0xff28501e },
      life: createLifeProp(8000, 8000, 0.4),
      bladder: createBladderProp(12000, 12000),
      deep_root: createDeepRootProp(22.0, 14.0),
      photosynthesis: createPhotosynthesisProp(0.2, 38.0),
      fruiting: createFruitingProp(20.0, "large", "cactus"),
      terrain_pref: createTerrainPreferenceProp([3], "Areia / Deserto Árido"),
      plant_flesh: { nutrition: 1600, foodType: "plant" }
    },
    x,
    y
  );
}

export function createScorpion(x, y) {
  return createEntity(
    {
      name: "Escorpião das Dunas",
      species: "scorpion",
      render: { skin: "Creature_Spider_U.png", color: 0xffe6b432, backcolor: 0xff3c2805 },
      life: createLifeProp(3800, 3800),
      lungs: createLungsProp(),
      brain: createBrainProp(12, { bravery: 0.7, curiosity: 0.6, aggression: 0.8 }, 1.0),
      stomach: createStomachProp(2, { meat: 1.4, organ: 1.2, plant: 0.1 }),
      bladder: createBladderProp(1800, 1800),
      kidney: createKidneyProp(0.5),
      combat: createCombatProp(1.1, 2),
      arm_left: createArmProp("pincher", 1.1, 100, 100, { name: "Pinça Esmagadora", damage: 32 }),
      arm_right: createArmProp("stinger", 1.2, 100, 100, { name: "Ferrão Venenoso", damage: 46 }),
      leg_left: createLegProp("legs_left", 1.2, 100, 100),
      leg_right: createLegProp("legs_right", 1.2, 100, 100),
      terrain_pref: createTerrainPreferenceProp([3], "Areia do Deserto"),
      locomotion: createLocomotionProp(),
      carapace: { condition: 100, maxCondition: 100, defense: 25, nutrition: 800, foodType: "bone" },
      flesh: { condition: 100, maxCondition: 100, nutrition: 1500, foodType: "meat" }
    },
    x,
    y
  );
}

export function createLizard(x, y) {
  return createEntity(
    {
      name: "Lagarto das Areias",
      species: "lizard",
      render: { skin: "Creature_Snake_U.png", color: 0xffd2c850, backcolor: 0xff32280a },
      life: createLifeProp(2400, 2400),
      lungs: createLungsProp(),
      brain: createBrainProp(10, { bravery: 0.3, curiosity: 0.8, aggression: 0.2 }, 0.9),
      stomach: createStomachProp(2, { meat: 1.1, fruit: 1.3, plant: 0.8 }),
      bladder: createBladderProp(1200, 1200),
      kidney: createKidneyProp(0.6),
      leg_front: createLegProp("front", 1.2, 100, 100),
      leg_back: createLegProp("back", 1.2, 100, 100),
      terrain_pref: createTerrainPreferenceProp([3, 0], "Areia e Solo"),
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
      name: "Líquen das Rochas (Arbusto)",
      species: "lichen",
      render: { skin: "Feature_Flower.png", color: 0xffb4c8a0, backcolor: 0xff283228 },
      life: createLifeProp(4500, 4500, 0.4),
      bladder: createBladderProp(2500, 2500),
      surface_root: createSurfaceRootProp(6),
      photosynthesis: createPhotosynthesisProp(0.25, 26.0),
      terrain_pref: createTerrainPreferenceProp([4, 1], "Chão Rochoso e Montanha"),
      plant_flesh: { nutrition: 800, foodType: "plant" }
    },
    x,
    y
  );
}

export function createMountainGoat(x, y) {
  return createEntity(
    {
      name: "Bode Montanhês",
      species: "goat",
      render: { skin: "Creature_Bear_U.png", color: 0xffe6e6dc, backcolor: 0xff3c3c3c },
      life: createLifeProp(5200, 5200),
      lungs: createLungsProp(),
      brain: createBrainProp(14, { bravery: 0.6, curiosity: 0.7, aggression: 0.4 }, 1.1),
      stomach: createStomachProp(4, { plant: 1.4, fruit: 1.0, meat: 0.1 }),
      bladder: createBladderProp(2500, 2500),
      kidney: createKidneyProp(0.7),
      combat: createCombatProp(1.0, 3),
      arm_head: createArmProp("horns", 1.2, 100, 100, { name: "Chifres de Montanha", damage: 38 }),
      leg_front: createLegProp("front", 1.3, 100, 100),
      leg_back: createLegProp("back", 1.3, 100, 100),
      terrain_pref: createTerrainPreferenceProp([4, 1, 0], "Montanhas e Pedregulhos"),
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
      name: "Carvalho Ancestral (Semente Grande)",
      species: "oak",
      render: { skin: "Feature_Tree_Full.png", color: 0xff78dc5a, backcolor: 0xff284619 },
      life: createLifeProp(12000, 12000, 1.2),
      bladder: createBladderProp(6000, 6000),
      deep_root: createDeepRootProp(20.0, 12.0),
      photosynthesis: createPhotosynthesisProp(0.3, 35.0),
      fruiting: createFruitingProp(25.0, "large", "oak"),
      terrain_pref: createTerrainPreferenceProp([0], "Solo Terrestre Fértil"),
      wood: { nutrition: 2000, foodType: "plant" }
    },
    x,
    y
  );
}

export function createWillowTree(x, y) {
  return createEntity(
    {
      name: "Salgueiro Ribeirinho (Semente Pequena)",
      species: "willow",
      render: { skin: "Feature_Tree_Pine.png", color: 0xff64c850, backcolor: 0xff1e3c1e },
      life: createLifeProp(9000, 9000, 1.0),
      bladder: createBladderProp(4000, 4000),
      surface_root: createSurfaceRootProp(8),
      photosynthesis: createPhotosynthesisProp(0.3, 30.0),
      fruiting: createFruitingProp(20.0, "small", "willow"),
      terrain_pref: createTerrainPreferenceProp([0, 2], "Margem / Terreno Úmido"),
      wood: { nutrition: 1500, foodType: "plant" }
    },
    x,
    y
  );
}

export function createPineTree(x, y) {
  return createEntity(
    {
      name: "Pinheiro das Terras Altas",
      species: "pine",
      render: { skin: "Feature_Tree_Pine.png", color: 0xff3c8250, backcolor: 0xff0f2814 },
      life: createLifeProp(11000, 11000, 1.1),
      bladder: createBladderProp(5000, 5000),
      deep_root: createDeepRootProp(18.0, 14.0),
      photosynthesis: createPhotosynthesisProp(0.3, 32.0),
      fruiting: createFruitingProp(22.0, "large", "pine"),
      terrain_pref: createTerrainPreferenceProp([0, 1], "Solo e Montanha"),
      wood: { nutrition: 1800, foodType: "plant" }
    },
    x,
    y
  );
}

export function createWaterLily(x, y) {
  return createEntity(
    {
      name: "Vitória-Régia Aquática",
      species: "waterlily",
      render: { skin: "Feature_Flower.png", color: 0xff50dca0, backcolor: 0xff0f3c28 },
      life: createLifeProp(5000, 5000, 0.6),
      bladder: createBladderProp(4000, 4000),
      deep_root: createDeepRootProp(20.0, 10.0),
      photosynthesis: createPhotosynthesisProp(0.2, 30.0),
      terrain_pref: createTerrainPreferenceProp([2], "Água Exclusiva"),
      plant_flesh: { nutrition: 900, foodType: "plant" }
    },
    x,
    y
  );
}

export function createSeaweed(x, y) {
  return createEntity(
    {
      name: "Alga Marinha Subaquática",
      species: "seaweed",
      render: { skin: "Feature_Foliage.png", color: 0xff32b478, backcolor: 0xff0a321e },
      life: createLifeProp(4000, 4000, 0.5),
      bladder: createBladderProp(3000, 3000),
      photosynthesis: createPhotosynthesisProp(0.1, 25.0),
      terrain_pref: createTerrainPreferenceProp([2], "Água Oceânica"),
      edible: { nutrition: 1200, foodType: "plant", digestDuration: 25 }
    },
    x,
    y
  );
}

export function createFruit(x, y, seedType = "large", species = "oak") {
  let fruitName = "Fruto";
  if (species === "cactus") fruitName = "Pitaia / Fruto do Cacto";
  else if (species === "willow") fruitName = "Fruto de Salgueiro";
  else if (species === "pine") fruitName = "Pinha / Fruto do Pinheiro";
  else fruitName = "Bolota / Fruto de Carvalho";

  return createEntity(
    {
      name: fruitName,
      render: { skin: "Item_Fruit.png", color: species === "cactus" ? 0xfffa5078 : 0xfffaa03c, backcolor: 0xff46230a },
      edible: {
        nutrition: species === "cactus" ? 3000 : 2500,
        foodType: "fruit",
        digestDuration: 30,
        sourceName: species === "cactus" ? "Cacto do Deserto" : (species === "willow" ? "Salgueiro" : (species === "pine" ? "Pinheiro" : "Carvalho")),
        sourceSpecies: species,
        seed: { type: seedType, species }
      }
    },
    x,
    y
  );
}

export function createSeedEntity(x, y, seedType = "large", species = "oak") {
  let seedName = `Semente de ${species}`;
  if (species === "cactus") seedName = "Semente de Cacto";
  else if (species === "lichen") seedName = "Esporo de Líquen";
  else if (species === "willow") seedName = "Semente de Salgueiro";
  else if (species === "pine") seedName = "Pinhão";
  else seedName = "Bolota de Carvalho";

  return createEntity(
    {
      name: seedName,
      render: { skin: "Item_Nut.png", color: species === "cactus" ? 0xff50c850 : 0xffc88c50, backcolor: 0x00000000 },
      germination: createSeedGerminationProp(species, 6.0, 0.02),
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
      name: seed ? `Fezes com Semente Pequena (${seed.species})` : "Fezes / Excremento",
      render: { skin: "Item_Nugget.png", color: 0xff643c14, backcolor: 0x00000000 },
      fertilizer: { quality: 1.0 },
      lifespan: {
        current: 0,
        max: 1800,
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
    poop.properties.germination = createSeedGerminationProp(seed.species, 8.0, 0.018);
  }

  return poop;
}
