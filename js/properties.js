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

      // 4. Spontaneous Flashback from Long-Term Memory (Affects mood and affinities slightly)
      if (this.longTermMemory.length > 0 && Math.random() < 0.005) {
        const mem = this.longTermMemory[Math.floor(Math.random() * this.longTermMemory.length)];
        if (mem.type === "AMPUTATION" || mem.type === "ATTACK" || mem.type === "DEATH") {
          this.mood = "anxious";
          if (mem.secondaryEntityId && this.affinities[mem.secondaryEntityId] !== undefined) {
            this.affinities[mem.secondaryEntityId] = Math.max(-100, this.affinities[mem.secondaryEntityId] - 2);
          }
        } else if (mem.type === "FEED" || mem.type === "BIRTH" || mem.type === "SPROUT") {
          this.mood = "happy";
          if (mem.secondaryEntityId && this.affinities[mem.secondaryEntityId] !== undefined) {
            this.affinities[mem.secondaryEntityId] = Math.min(100, this.affinities[mem.secondaryEntityId] + 2);
          }
        }

        recordWorldEvent({
          type: "DIALOGUE",
          primaryEntityId: ent.id,
          location: { x: ent.x, y: ent.y },
          description: `${ent.properties.name} relembrou um evento marcante: "${mem.desc || mem.type}" [Humor: ${this.mood}]!`,
          tick: currentTick
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
          const friendName = friend?.properties.name || `Entidade #${tId}`;
          recordWorldEvent({
            type: "RELATION",
            primaryEntityId: ent.id,
            secondaryEntityId: tId,
            location: { x: ent.x, y: ent.y },
            description: `${ent.properties.name} desenvolveu grande laço de amizade com ${friendName} (afinidade +${Math.round(affVal)})!`,
            tick: currentTick
          });
        } else if (affVal <= -50 && prevMilestone !== "enemy") {
          this.affinityMilestones[tId] = "enemy";
          const enemy = entities?.find(e => e.id === tId && !e.destroyed);
          const enemyName = enemy?.properties.name || `Entidade #${tId}`;
          recordWorldEvent({
            type: "RELATION",
            primaryEntityId: ent.id,
            secondaryEntityId: tId,
            location: { x: ent.x, y: ent.y },
            description: `${ent.properties.name} declarou ódio e inimizade mortal contra ${enemyName} (afinidade ${Math.round(affVal)})!`,
            tick: currentTick
          });
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
            description: `${ent.properties.name} foi expulso da facção '${group.name}' pela maioria dos membros!`,
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

/**
 * Genitalia (Sex & Procreation with Birth Event Logs)
 */
export function createGenitaliaProp(type = "penis") {
  return {
    type,
    reproduction: "sexual",
    condition: 100,
    maxCondition: 100,
    pregnantTimer: 0,
    isPregnant: false,
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
        if (this.pregnantTimer >= 40.0 && entities) { // Birth after 40s
          this.isPregnant = false;
          this.pregnantTimer = 0;
          this.matingCooldown = 60.0;

          const babySpecies = ent.properties.species || "human";
          const baby = createEntity(
            {
              name: `Filhote de ${ent.properties.name || "Criatura"}`,
              species: babySpecies,
              render: { ...ent.properties.render },
              life: createLifeProp(Math.round(ent.properties.life.max * 0.5), Math.round(ent.properties.life.max * 0.5)),
              brain: createBrainProp(12, { bravery: 0.5, curiosity: 0.9, aggression: 0.2 }, 0.9),
              stomach: createStomachProp(2),
              bladder: createBladderProp(1500, 1500),
              locomotion: createLocomotionProp(),
              torso: { condition: 80, maxCondition: 80, nutrition: 800, foodType: "meat" }
            },
            ent.x + (Math.floor(Math.random() * 3) - 1),
            ent.y + (Math.floor(Math.random() * 3) - 1)
          );

          if (ent.properties.lungs) baby.properties.lungs = createLungsProp();
          if (ent.properties.gills) baby.properties.gills = createGillsProp();
          if (ent.properties.mouth) baby.properties.mouth = createMouthProp(16, 16);
          if (ent.properties.communication) baby.properties.communication = createCommunicationProp(2.0);

          // Inherit mother's group
          if (!ent.properties.group) {
            ent.properties.group = createGroup(`Clã de ${ent.properties.name}`, ent);
          }
          baby.properties.group = ent.properties.group;
          ent.properties.group.members.push(baby.id);

          entities.push(baby);

          recordWorldEvent({
            type: "BIRTH",
            primaryEntityId: ent.id,
            secondaryEntityId: baby.id,
            location: { x: baby.x, y: baby.y },
            description: `${ent.properties.name} deu à luz a um filhote (${baby.properties.name}) na posição [X: ${baby.x}, Y: ${baby.y}]!`,
            tick: currentTick,
            timestamp: world?.clock ? { day: world.clock.day, hour: world.clock.hour, minute: world.clock.minute } : null
          });
        }
        return;
      }

      // Mating attempt (female / vagina seeking male / penis of same species with mutual affinity >= 50)
      if ((this.type === "vagina" || this.type === "female") && this.matingCooldown <= 0 && ent.properties.life.energy > ent.properties.life.max * 0.6) {
        if (entities) {
          for (const mate of entities) {
            if (mate !== ent && !mate.destroyed && mate.properties.genitalia && (mate.properties.genitalia.type === "penis" || mate.properties.genitalia.type === "male")) {
              if (mate.properties.species === ent.properties.species) {
                const dist = Math.abs(mate.x - ent.x) + Math.abs(mate.y - ent.y);
                if (dist <= 1) {
                  const aff = ent.properties.brain?.affinities?.[mate.id] || 0;
                  const mateAff = mate.properties.brain?.affinities?.[ent.id] || 0;
                  if (aff >= 50 && mateAff >= 50) {
                    this.isPregnant = true;
                    this.pregnantTimer = 0;
                    mate.properties.genitalia.matingCooldown = 60.0;

                    recordWorldEvent({
                      type: "RELATION",
                      primaryEntityId: ent.id,
                      secondaryEntityId: mate.id,
                      location: { x: ent.x, y: ent.y },
                      description: `${ent.properties.name} e ${mate.properties.name} acasalaram em harmonia!`,
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
export function createScarProp(location = "torso", name = "Cicatriz de Lâmina") {
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

export function createGroup(name, founder) {
  const zx = Math.floor(founder.x / 8);
  const zy = Math.floor(founder.y / 8);
  const zoneKey1 = `${zx}_${zy}`;
  const zoneKey2 = `${zx + 1}_${zy}`;

  const group = {
    id: nextGroupId++,
    name: name || `Bando #${nextGroupId}`,
    members: [founder.id],
    claimedZones: [zoneKey1, zoneKey2],
    campfire: null, // { x, y }
    storage: [],
    createdTick: currentTick,
    color: founder.properties.render?.color || 0xffe6a032
  };
  return group;
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
        description: `${mem.properties.name} abandonou o grupo '${group.name}' furioso pela entrada de ${candidate.properties.name}!`,
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
    description: `${candidate.properties.name} juntou-se ao grupo '${group.name}'!`,
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
      const newGrp = createGroup(`Clã de ${speaker.properties.name}`, speaker);
      newGrp.members.push(listener.id);
      speaker.properties.group = newGrp;
      listener.properties.group = newGrp;

      recordWorldEvent({
        type: "BIRTH",
        primaryEntityId: speaker.id,
        secondaryEntityId: listener.id,
        location: { x: speaker.x, y: speaker.y },
        description: `${speaker.properties.name} e ${listener.properties.name} fundaram a facção '${newGrp.name}'!`,
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

  // 3. Share Significant Long-Term Memories
  if (spkBrain.longTermMemory.length > 0 && Math.random() < 0.25) {
    const mem = spkBrain.longTermMemory[Math.floor(Math.random() * spkBrain.longTermMemory.length)];
    lisBrain.addShortTerm({
      type: "GOSSIP",
      desc: `Ouviu de ${speaker.properties.name}: "${mem.desc}"`,
      location: { x: speaker.x, y: speaker.y }
    });
  }
}

/**
 * Crafter Trait: Uses Wood and Stone to craft melee weapons and tools
 */
export function createCrafterProp() {
  return {
    role: "crafter",
    craftTimer: 0,
    effect(ent, dt, world, entities) {
      this.craftTimer = (this.craftTimer || 0) + dt;
      if (this.craftTimer < 4.0) return;
      this.craftTimer = 0;

      if (!entities) return;

      // Check for available wood or stone at current tile or inventory
      const nearbyResources = entities.filter(e => !e.destroyed && (e.properties.resourceType === "wood" || e.properties.resourceType === "stone") && Math.abs(e.x - ent.x) <= 1 && Math.abs(e.y - ent.y) <= 1);
      if (nearbyResources.length >= 2) {
        const r1 = nearbyResources[0];
        const r2 = nearbyResources[1];
        r1.destroyed = true;
        r2.destroyed = true;

        // Craft weapon
        const weaponName = (r1.properties.resourceType === "stone" || r2.properties.resourceType === "stone") ? "Lança de Pedra Pontiaguda" : "Clava de Madeira Maciça";
        const dmg = (weaponName.includes("Lança")) ? 45 : 35;
        const def = (weaponName.includes("Lança")) ? 10 : 6;

        // Equip to first empty or weaker arm
        let equipped = false;
        for (const [k, p] of Object.entries(ent.properties)) {
          if (k.startsWith("arm") && p && (!p.heldItem || (p.heldItem.damage || 0) < dmg)) {
            p.heldItem = { name: weaponName, damage: dmg, defense: def };
            equipped = true;
            break;
          }
        }

        recordWorldEvent({
          type: "SPROUT",
          primaryEntityId: ent.id,
          secondaryEntityId: 0,
          location: { x: ent.x, y: ent.y },
          description: `${ent.properties.name} forjou uma ${weaponName}!`,
          tick: currentTick
        });
      }
    }
  };
}

/**
 * Miner Trait: Mines rocks and stone from mountains/stone tiles and hauls to group zone
 */
export function createMinerProp() {
  return {
    role: "miner",
    mineTimer: 0,
    carryingStone: false,
    effect(ent, dt, world, entities) {
      if (!ent.properties.group || !world || !entities) return;

      this.mineTimer = (this.mineTimer || 0) + dt;
      const toolBoost = (ent.properties.arm_left?.heldItem?.damage || ent.properties.arm_right?.heldItem?.damage || 15) / 20;
      const interval = Math.max(1.5, 4.0 / toolBoost);

      if (this.mineTimer >= interval) {
        this.mineTimer = 0;
        const currentTile = world.getTile(ent.x, ent.y);

        if ((currentTile === 4 || currentTile === 1) && !this.carryingStone) {
          // Mine a piece of stone
          this.carryingStone = true;
          recordWorldEvent({
            type: "FEED",
            primaryEntityId: ent.id,
            secondaryEntityId: 0,
            location: { x: ent.x, y: ent.y },
            description: `${ent.properties.name} extraiu uma rocha maciça!`,
            tick: currentTick
          });
        } else if (this.carryingStone) {
          // Drop stone in group claimed zone
          const stone = createStoneItem(ent.x, ent.y);
          entities.push(stone);
          this.carryingStone = false;
        }
      }
    }
  };
}

/**
 * Builder Trait: Encloses claimed zone with perimeter fortifications or barricades
 */
export function createBuilderProp() {
  return {
    role: "builder",
    buildTimer: 0,
    effect(ent, dt, world, entities) {
      if (!ent.properties.group || !world || !entities) return;

      this.buildTimer = (this.buildTimer || 0) + dt;
      if (this.buildTimer < 6.0) return;
      this.buildTimer = 0;

      // Erect barricades on perimeter of group claimed zone using wood if available
      const nearbyWood = entities.find(e => !e.destroyed && e.properties.resourceType === "wood" && Math.abs(e.x - ent.x) <= 2 && Math.abs(e.y - ent.y) <= 2);
      if (nearbyWood && Math.random() < 0.3) {
        nearbyWood.destroyed = true;
        recordWorldEvent({
          type: "SPROUT",
          primaryEntityId: ent.id,
          location: { x: ent.x, y: ent.y },
          description: `${ent.properties.name} ergueu uma paliçada defensiva para o clã '${ent.properties.group.name}'!`,
          tick: currentTick
        });
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
      name: "Toro de Madeira",
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
      name: "Pedra de Rocha Mineral",
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
export function createToothItem(x, y, ownerName = "Criatura") {
  return createEntity(
    {
      name: `Dente de ${ownerName}`,
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
            const isHostile = affinity < -20 || (ent.properties.brain.personality?.aggression || 0) > 0.4 || isDesperateHunger || ent.properties.violent;

            if (isHostile) {
              target = other;
              break;
            }
          }
        }
      }

      if (!target) return;
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
      let usedLimbName = "golpe corporal";
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
            usedLimbName = `soco (${key})`;
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
              usedLimbName = `patada com garras (${key}, ${prop.clawsCount} garras)`;
            } else {
              attackPower = 8 * limbFactor;
              usedLimbName = `patada sem garras (${key})`;
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
        usedLimbName = `mordida (${ent.properties.mouth.teethCount} dentes)`;
        usedLimb = ent.properties.mouth;
      }

      // 1.4 If still no weapon, try kicking with legs!
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

      let hitPartName = "corpo";
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
          target.properties.scar = createScarProp(primaryTarget.key, `Cicatriz em ${primaryTarget.key}`);
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
              name: `Membro (${primaryTarget.key}) de ${target.properties.name}`,
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
            description: `${target.properties.name} teve o membro '${primaryTarget.key}' decepado pelo ataque de ${ent.properties.name}!`,
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
      const attackerName = ent.properties.name || `Entidade #${ent.id}`;
      const targetName = target.properties.name || `Entidade #${target.id}`;
      const attackDesc = `${attackerName} atingiu ${hitPartName} de ${targetName} com ${usedLimbName} na posição [X: ${ent.x}, Y: ${ent.y}]!`;

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
              const loveForVictim = spectator.properties.brain.affinities[target.id] || 0;
              if (loveForVictim >= 60) {
                // Abandon attacker's group immediately!
                ent.properties.group.members = ent.properties.group.members.filter(id => id !== spectator.id);
                delete spectator.properties.group;
                spectator.properties.brain.affinities[ent.id] = -100;

                if (target.properties.group) {
                  tryJoinGroup(spectator, target.properties.group, entities);
                }

                recordWorldEvent({
                  type: "RELATION",
                  primaryEntityId: spectator.id,
                  secondaryEntityId: ent.id,
                  location: { x: spectator.x, y: spectator.y },
                  description: `${spectator.properties.name} rompeu com a facção '${ent.properties.group.name}' em defesa de seu amigo ${target.properties.name}!`,
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

      const isFlying = ent.properties.wings?.flying === true;

      let totalLegPower = 0;
      let legCount = 0;
      for (const [key, prop] of Object.entries(ent.properties)) {
        if ((key.startsWith("leg") || key.startsWith("paw")) && prop && prop.condition !== undefined) {
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
      // Priority 0: Pacifist Escape (Flee from nearby threats/hostiles)
      // -----------------------------------------------------------------------
      if (ent.properties.pacifist && entities) {
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
          // Flee in exact opposite direction
          chosenDx = -Math.sign(nearestHostile.x - ent.x);
          chosenDy = -Math.sign(nearestHostile.y - ent.y);
          hasIntention = true;
        }
      }

      // -----------------------------------------------------------------------
      // Priority 1: Thirst (Water <= 50%) -> Seek water to drink
      // -----------------------------------------------------------------------
      if (!hasIntention && waterRatio <= 0.50 && world) {
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
        }
      }

      // -----------------------------------------------------------------------
      // Priority 4: Social Cohesion & Group Territory
      // -----------------------------------------------------------------------
      if (!hasIntention && ent.properties.group && entities) {
        const group = ent.properties.group;

        // Follow group leader or stay near members
        const leader = entities.find(e => e.id === group.leaderId && !e.destroyed);
        if (leader && leader !== ent) {
          const distToLeader = Math.abs(leader.x - ent.x) + Math.abs(leader.y - ent.y);
          if (distToLeader > 4 && distToLeader <= 16) {
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
        const chosen = dirs[Math.floor(Math.random() * dirs.length)];
        chosenDx = chosen.dx;
        chosenDy = chosen.dy;
      }

      // Execute Movement
      const nextX = ent.x + chosenDx;
      const nextY = ent.y + chosenDy;
      const mapW = (world && world.width) ? world.width : 512;
      const mapH = (world && world.height) ? world.height : 512;

      if (world && nextX >= 0 && nextX < mapW && nextY >= 0 && nextY < mapH) {
        const tile = world.getTile(nextX, nextY);
        // Land creatures cannot walk into water tiles (2) or void (5) unless swimming or flying
        const canTraverse = (isFlying || ent.properties.gills || tile !== 2) && tile !== 5;

        if (canTraverse) {
          ent.x = nextX;
          ent.y = nextY;
        }
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

        // Social Gifting: If mood is happy/joyful, give item/food to a friend nearby
        if (ent.properties.brain?.mood === "happy" && Math.random() < 0.08) {
          for (const [k, p] of Object.entries(ent.properties)) {
            if (k.startsWith("arm") && p && p.heldItem) {
              const friend = entities.find(e => e !== ent && !e.destroyed && e.properties.brain && Math.abs(e.x - ent.x) <= 2 && Math.abs(e.y - ent.y) <= 2 && (ent.properties.brain.affinities[e.id] || 0) >= 40);
              if (friend) {
                for (const [fk, fp] of Object.entries(friend.properties)) {
                  if (fk.startsWith("arm") && fp && !fp.heldItem) {
                    fp.heldItem = p.heldItem;
                    p.heldItem = null;
                    friend.properties.brain.affinities[ent.id] = Math.min(100, (friend.properties.brain.affinities[ent.id] || 0) + 25);
                    friend.properties.brain.mood = "happy";

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

/**
 * Plant Life & Water Thirst: Without access to water, plants suffer extreme energy starvation
 */
export function createPlantLifeProp(max = 10000, basalRate = 0.6) {
  return {
    energy: max * 0.5,
    max,
    basalRate,
    effect(ent, dt, world) {
      if (!world) return;

      const hasWater = hasNearbyWater(world, ent.x, ent.y, 4);

      if (!hasWater) {
        // Severe desiccation energy consumption!
        this.energy = Math.max(0, this.energy - dt * 45.0);
        ent.combatFlash = 1;
      } else {
        this.energy = Math.max(0, this.energy - dt * this.basalRate);
      }
    }
  };
}

/**
 * Photosynthesis (Daylight Energy Generation, Disabled Without Nearby Water)
 */
export function createPhotosynthesisProp(rate = 0.5, energyPerSun = 18.0) {
  return {
    rate,
    energyPerSun,
    effect(ent, dt, world) {
      if (!world || !ent.properties.life) return;

      const hasWater = hasNearbyWater(world, ent.x, ent.y, 4);
      if (!hasWater) return; // Cannot photosynthesize when thirsty!

      const sunFactor = world.sunlight !== undefined ? world.sunlight : 1.0;
      if (sunFactor > 0.05) {
        ent.properties.life.energy = Math.min(
          ent.properties.life.max,
          ent.properties.life.energy + dt * this.energyPerSun * sunFactor
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
 * Surface Roots: Spreads physical root nodes (Non-living edible entities)
 */
export function createSurfaceRootProp(maxRoots = 6, spreadInterval = 8.0) {
  return {
    roots: [],
    maxRoots,
    spreadInterval,
    spreadTimer: 0,
    nutrition: 500,
    foodType: "plant",
    effect(ent, dt, world, entities) {
      if (!ent.properties.life || !entities || !world) return;

      const hasWater = hasNearbyWater(world, ent.x, ent.y, 4);
      if (!hasWater) return;

      this.spreadTimer = (this.spreadTimer || 0) + dt;
      if (this.spreadTimer < this.spreadInterval) return;
      this.spreadTimer = 0;

      // Filter out destroyed root nodes
      this.roots = this.roots.filter(r => !r.destroyed);

      if (this.roots.length < this.maxRoots && ent.properties.life.energy > 800) {
        const angle = Math.random() * Math.PI * 2;
        const dist = 1 + Math.floor(Math.random() * 2);
        const rx = Math.max(0, Math.min(world.width - 1, ent.x + Math.round(Math.cos(angle) * dist)));
        const ry = Math.max(0, Math.min(world.height - 1, ent.y + Math.round(Math.sin(angle) * dist)));

        const rootNode = createEntity(
          {
            name: `Raiz Superficial de ${ent.properties.name}`,
            render: { skin: "Item_Root.png", color: 0xff8c5a28, backcolor: 0x00000000 },
            edible: { nutrition: 350, foodType: "plant", digestDuration: 20, sourceName: ent.properties.name, sourceSpecies: ent.properties.species },
            parentTreeId: ent.id
          },
          rx,
          ry
        );

        this.roots.push(rootNode);
        entities.push(rootNode);
        ent.properties.life.energy -= 40;
      }
    }
  };
}

/**
 * Fruiting (Generates Edible Fruits with Seeds, Disabled without Nearby Water)
 */
export function createFruitingProp(interval = 14.0, seedType = "small", species = "oak") {
  return {
    interval,
    seedType,
    species,
    timer: 0,
    effect(ent, dt, world, entities) {
      if (!ent.properties.life || !entities || !world) return;

      const hasWater = hasNearbyWater(world, ent.x, ent.y, 4);
      if (!hasWater) return;

      if (ent.properties.life.energy < ent.properties.life.max * 0.4) return;

      this.timer = (this.timer || 0) + dt;
      if (this.timer >= this.interval) {
        this.timer = 0;

        const fx = Math.max(0, Math.min(world.width - 1, ent.x + (Math.floor(Math.random() * 3) - 1)));
        const fy = Math.max(0, Math.min(world.height - 1, ent.y + (Math.floor(Math.random() * 3) - 1)));

        const fruit = createEntity(
          {
            name: `Fruto Maduro de ${ent.properties.name}`,
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
        ent.properties.life.energy -= 60;
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
// 5. Entity Prefabs / Archetypes (Fauna with Paws & Claws, Humanoids with Arms)
// ---------------------------------------------------------------------------

export function createKnight(x, y, gender = "male") {
  return createEntity(
    {
      name: "Cavaleiro Imperial",
      species: "human",
      render: { skin: "Human_Knight_M.png", color: 0xffdcdce6, backcolor: 0xff1e283c },
      life: createLifeProp(6000, 6000),
      lungs: createLungsProp(),
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
  return createEntity(
    {
      name: "Lobo Alfa Feroz",
      species: "wolf",
      render: { skin: "Creature_Wolf_U.png", color: 0xffc8c8dc, backcolor: 0xff28283c },
      life: createLifeProp(4500, 4500),
      lungs: createLungsProp(),
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
  return createEntity(
    {
      name: "Urso Pardo Gigante",
      species: "bear",
      render: { skin: "Creature_Bear_U.png", color: 0xff965a28, backcolor: 0xff32190a },
      life: createLifeProp(12000, 12000),
      lungs: createLungsProp(),
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
  return createEntity(
    {
      name: "Goblin Saqueador",
      species: "goblin",
      render: { skin: "Creature_Goblin_U.png", color: 0xff78d250, backcolor: 0xff283c14 },
      life: createLifeProp(3200, 3200),
      lungs: createLungsProp(),
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
  return createEntity(
    {
      name: "Serpente das Profundezas",
      species: "serpent",
      render: { skin: "Creature_Snake_U.png", color: 0xff32c8d2, backcolor: 0xff0a2832 },
      life: createLifeProp(8000, 8000),
      gills: createGillsProp(),
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
  return createEntity(
    {
      name: "Dragão Ancião Alado",
      species: "dragon",
      render: { skin: "Creature_Dragon_U.png", color: 0xffff4646, backcolor: 0xff3c0f0f },
      life: createLifeProp(30000, 30000),
      lungs: createLungsProp(),
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
// 6. Biome-Specific Flora and Fauna Prefabs
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
      communication: createCommunicationProp(4.0),
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
      mouth: createMouthProp(32, 32),
      communication: createCommunicationProp(2.5),
      miner: createMinerProp(),
      brain: createBrainProp(14, { bravery: 0.6, curiosity: 0.7, aggression: 0.4 }, 1.1),
      stomach: createStomachProp(4, { plant: 1.4, fruit: 1.0, meat: 0.1 }),
      bladder: createBladderProp(2500, 2500),
      kidney: createKidneyProp(0.7),
      combat: createCombatProp(1.0, 3),
      horns: createArmProp("horns", 1.2, 100, 100, { name: "Chifres de Montanha", damage: 38 }),
      paw_front_left: createPawProp("front_left", 1.2, 100, 100, 0, 0, 0),
      paw_front_right: createPawProp("front_right", 1.2, 100, 100, 0, 0, 0),
      paw_back_left: createPawProp("back_left", 1.2, 100, 100, 0, 0, 0),
      paw_back_right: createPawProp("back_right", 1.2, 100, 100, 0, 0, 0),
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
      render: { skin: "Item_Leaf.png", color: 0xff32b478, backcolor: 0xff0a321e },
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
