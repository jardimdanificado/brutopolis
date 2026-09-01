import { createEntity, getEntityById, entityRegistry, currentTick, getEntitiesInRadius, findEntityInRadius, hasEntityInRadius, findClosestEntityInRadius, forEachEntityInRadius, countEntitiesInRadius, getEntityAtTile, getEntityAtTileByProp, setSpatialZoneSize, tileEntityMap, globalWallCoords, globalRoadCoords, getTileKey, registerEntitySpatial, dismemberCorpse, createCorpseEntity } from "./engine.js";
import { MAP_WIDTH, MAP_HEIGHT, TILE_FLOOR, TILE_MOUNTAIN, TILE_WATER, TILE_SAND, TILE_STONE, TILE_VOID, TILE_ROAD_GRASS, TILE_ROAD_SAND, TILE_ROAD_GRASS_STONE, TILE_HILL, TILE_PEAK, TILE_ROAD_SAND_STONE, TILE_ROAD_HILL, TILE_ROAD_HILL_STONE } from "./world_gen.js";
import {
  recordWorldEvent,
  allEvents,
  getEventById,
  OP_BIRTH,
  OP_DEATH,
  OP_ATTACK,
  OP_AMPUTATION,
  OP_FEED,
  OP_SPROUT,
  OP_RELATION,
  OP_DIALOGUE,
  OP_HUG,
  OP_KISS,
  OP_PRAISE,
  OP_INSULT,
  OP_SPIT,
  OP_SHOVE,
  OP_HUMILIATE,
  OP_PROPOSAL_ACCEPTED,
  OP_PROPOSAL_REJECTED,
  OP_LIE,
  OP_MINE,
  OP_CHOP,
  OP_BUILD,
  OP_PICKUP,
  OP_DROP,
  OP_CRAFT,
  OP_PLANT,
  OP_HARVEST,
  OP_FORGET
} from "./event_log.js";
import { vocabulario } from "./vocabulario.js";

export let activeWorld = null;
export function setActiveWorld(w) {
  activeWorld = w;
}

export function getSimWorld() {
  if (typeof world !== "undefined" && world) return world;
  if (typeof activeWorld !== "undefined" && activeWorld) return activeWorld;
  return null;
}

export function isLandTile(x, y) {
  const curW = getSimWorld();
  if (!curW) return false;
  const w = curW.width || MAP_WIDTH;
  const h = curW.height || MAP_HEIGHT;
  if (x < 0 || x >= w || y < 0 || y >= h) return false;
  const t = curW.getTile ? curW.getTile(x, y) : (curW.map ? curW.map[y * w + x] : 0);
  return t !== TILE_WATER && t !== TILE_VOID;
}

// Configurable macro-chunk zone size (tiles per zone side)
export let currentZoneSize = 8;
export function getZoneSize() {
  return currentZoneSize;
}
export function setZoneSize(sz) {
  currentZoneSize = Math.max(2, Math.min(64, parseInt(sz, 10) || 8));
  setSpatialZoneSize(currentZoneSize);
}

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

/**
 * Lifespan & Decay for items, food, severed parts, and excrement
 */
export function createLifespanProp(maxSeconds = 120.0) {
  return {
    age: 0,
    maxAge: maxSeconds,
    effect(ent, dt) {
      this.age += (dt !== undefined ? dt : 1.0);
      if (this.age >= this.maxAge) {
        ent.destroyed = true;
      }
    }
  };
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
 * Life / Basal Metabolic Energy, Age & Biological Lineage
 */
export function createLifeProp(energy = 4000, max = 4000, basalRate = 1.8, initialAge = 1440.0, fatherId = null, motherId = null) {
  return {
    energy,
    max,
    basalRate,
    age: initialAge,
    fatherId,
    motherId,
    childrenIds: [],
    isSleeping: false,
    effect(ent, dt, world, entities) {
      // Check if entity is currently inside their completed private home/house (O(1) Spatial Hash Lookup)
      let inOwnHouse = false;
      const tileEnts = tileEntityMap.get(getTileKey(ent.x, ent.y));
      if (tileEnts) {
        for (const e of tileEnts) {
          if (!e.destroyed && e.properties?.house?.isCompleted) {
            if (e.properties.house.ownerId === ent.id || e.properties.house.partnerId === ent.id) {
              inOwnHouse = true;
              break;
            }
          }
        }
      }

      this.age += (dt !== undefined ? dt : 1.0);

      // Biological Maturation: Babies grow to full adult capacity over time (~180s simulation)
      if (this.age >= 180.0 && !ent._isMature) {
        ent._isMature = true;
        if (this.max < 4000) {
          this.max = 4500;
          this.energy = Math.min(this.max, Math.max(this.energy, 2800));
        }
        const props = ent.properties;
        for (const k in props) {
          const p = props[k];
          if (p && typeof p.condition === "number" && typeof p.maxCondition === "number" && p.maxCondition < 100) {
            p.maxCondition = 100;
            p.condition = 100;
          }
        }
        if (ent.properties.stomach && ent.properties.stomach.capacity < 4) {
          ent.properties.stomach.capacity = 4;
        }
        recordWorldEvent({
          opcode: OP_SPROUT,
          type: "MATURATION",
          primaryEntityId: ent.id,
          location: { x: ent.x, y: ent.y },
          description: `${ent.properties.name} atingiu a idade adulta e agora participa ativamente da comunidade!`,
          tick: currentTick,
          timestamp: world?.clock ? { day: world.clock.day, hour: world.clock.hour, minute: world.clock.minute } : null
        });
      }

      // Bedtime & Fatigue Sleep Trigger (Only sleep if night-time or critically exhausted <= 15% energy)
      const isNight = world?.clock ? (world.clock.hour >= 21 || world.clock.hour < 5) : false;
      const isExhausted = this.energy <= this.max * 0.15;

      if (!this.isSleeping && (this.energy <= 10 || isExhausted || (isNight && (inOwnHouse || this.energy <= this.max * 0.60)))) {
        this.isSleeping = true;
        ent.emote = 8; // Emote_Sleeping.png
      }

      // Sleeping Restoration (Energy regenerates while sleeping)
      if (this.isSleeping) {
        ent.emote = 8; // Emote_Sleeping.png
        this._sleepTimer = (this._sleepTimer || 0) + dt;

        const stomach = ent.properties.stomach;
        const brain = ent.properties.brain;

        // Fonte 1: Comida no estômago (se tiver comida)
        if (stomach && stomach.items && stomach.items.length > 0) {
          const sleepDigestionSpeed = inOwnHouse ? 4.0 : 3.0;
          for (let i = stomach.items.length - 1; i >= 0; i--) {
            const item = stomach.items[i];
            const efficiency = (stomach.diet && stomach.diet[item.foodType] !== undefined) ? stomach.diet[item.foodType] : 1.0;
            const energyExtracted = ((item.nutrition / item.totalTurns) * efficiency) * sleepDigestionSpeed * dt * 2.5;
            this.energy = Math.min(this.max, this.energy + energyExtracted);

            // Surplus converted to fat when near max energy
            if (this.energy >= this.max * 0.90) {
              stomach.fatSurplus = (stomach.fatSurplus || 0) + energyExtracted * 0.3;
              if (stomach.fatSurplus >= 1500 && (stomach.fatUnits || 0) < (stomach.maxFatUnits || 6)) {
                stomach.fatSurplus -= 1500;
                stomach.fatUnits = (stomach.fatUnits || 0) + 1;
              }
            }

            item.remainingTurns -= dt * sleepDigestionSpeed;
            if (item.remainingTurns <= 0) {
              const finishedItem = stomach.items.splice(i, 1)[0];
              stomach.waste = (stomach.waste || 0) + (finishedItem.nutrition || 1000);
              if (finishedItem.seed) {
                if (!stomach.pendingSeeds) stomach.pendingSeeds = [];
                stomach.pendingSeeds.push(finishedItem.seed);
              }
              if (stomach.waste >= (stomach.wasteThreshold || 450)) {
                stomach.waste -= (stomach.wasteThreshold || 450);
                if (entities && world) {
                  const seedToPass = stomach.pendingSeeds && stomach.pendingSeeds.length > 0 ? stomach.pendingSeeds.shift() : null;
                  const poop = createPoopEntity(ent.x, ent.y, seedToPass);
                  entities.push(poop);
                }
              }
            }
          }
        }
        // Fonte 2: Gordura (se não tiver comida)
        else if (stomach && (stomach.fatUnits || 0) > 0) {
          if (!this._fatBurnTick || currentTick - this._fatBurnTick > 60) {
            stomach.fatUnits--;
            this._fatBurnTick = currentTick;
          }
          const burnRate = (this.max * 0.50) / 10.0;
          this.energy = Math.min(this.max, this.energy + burnRate * dt);
        }
        // Fonte 3: Descanso natural
        else {
          const naturalRestRate = (this.max / 10.0);
          this.energy = Math.min(this.max, this.energy + naturalRestRate * dt);
        }

        // Home healing benefit for brain when sleeping in own house (requires being fed)
        const isFed = (stomach && stomach.items && stomach.items.length > 0) || this.energy > this.max * 0.50;
        if (inOwnHouse && brain && isFed && brain.condition < brain.maxCondition) {
          brain.condition = Math.min(brain.maxCondition, brain.condition + dt * 0.8);
        }

        // Wake up naturally after becoming rested or when day breaks
        const isDayTime = world?.clock ? (world.clock.hour >= 6 && world.clock.hour < 20) : true;
        const wakeThreshold = (isDayTime && !inOwnHouse) ? this.max * 0.70 : this.max * 0.90;
        if ((this.energy >= wakeThreshold || (isDayTime && this.energy >= this.max * 0.50)) && (this._sleepTimer || 0) >= 6.0) {
          this.isSleeping = false;
          this._sleepTimer = 0;
          this._brainSacrificeDone = false;
          ent.emote = 2; // Happy
        }
      } else {
        this._sleepTimer = 0;
        this._brainSacrificeDone = false;
        // Normal awake basal metabolic drain (criatura NÃO regenera energia acordada)
        this.energy = Math.max(0, this.energy - (dt !== undefined ? dt : 1.0) * this.basalRate);
      }
    }
  };
}

/**
 * Monogamy & Romantic Pair Bonding Property
 */
export function createMonogamyProp(partnerId = null, autoOrientation = true) {
  return {
    partnerId,
    proposalCooldown: 0,
    bondTick: null,
    fidelity: 100,
    autoOrientation,
    effect(ent, dt) {
      if (this.autoOrientation) {
        if (!ent.properties.homosexual && !ent.properties.bisexual) {
          applyRandomSexualOrientation(ent);
        }
        if (!ent.properties.skeptic && !ent.properties.gullible) {
          applyRandomPersonalityPerks(ent);
        }
        this.autoOrientation = false;
      }
      if (this.proposalCooldown > 0) {
        this.proposalCooldown = Math.max(0, this.proposalCooldown - (dt !== undefined ? dt : 1.0));
      }
    }
  };
}

/**
 * Homosexuality & Bisexuality Orientation Traits for Monogamous Relations
 */
export function createHomosexualProp() {
  return {
    type: "homosexual",
    orientation: "homosexual"
  };
}

export function createBisexualProp() {
  return {
    type: "bisexual",
    orientation: "bisexual"
  };
}

export function getCreatureGender(ent) {
  if (!ent || !ent.properties) return "unknown";
  const genType = ent.properties.genitalia?.type;
  if (genType === "vagina" || genType === "female") return "female";
  if (genType === "penis" || genType === "male") return "male";
  if (ent.properties.render?.skin?.includes("_F.png")) return "female";
  if (ent.properties.render?.skin?.includes("_M.png")) return "male";
  return "unknown";
}

export function isSexuallyCompatible(proposer, recipient) {
  const pGender = getCreatureGender(proposer);
  const rGender = getCreatureGender(recipient);
  if (pGender === "unknown" || rGender === "unknown") return true;

  const isSameGender = (pGender === rGender);

  // Proposer check
  const pIsHomo = !!proposer.properties?.homosexual;
  const pIsBi = !!proposer.properties?.bisexual;

  if (pIsHomo && !isSameGender) return false;
  if (!pIsHomo && !pIsBi && isSameGender) return false; // Default heterosexual

  // Recipient check
  const rIsHomo = !!recipient.properties?.homosexual;
  const rIsBi = !!recipient.properties?.bisexual;

  if (rIsHomo && !isSameGender) return false;
  if (!rIsHomo && !rIsBi && isSameGender) return false; // Default heterosexual

  return true;
}

export function rollCreatureGender() {
  return Math.random() < 0.5 ? "female" : "male";
}

export function rollCreatureOrientation() {
  const r = Math.random();
  if (r < 0.82) return "heterosexual";
  if (r < 0.92) return "bisexual";
  return "homosexual";
}

export function rollCreatureTraits() {
  const traits = {};
  if (Math.random() < 0.10) traits.violent = true;
  else if (Math.random() < 0.10) traits.pacifist = true;

  if (Math.random() < 0.03) traits.scatological = true;
  if (Math.random() < 0.18) traits.industrious = true;
  if (Math.random() < 0.15) traits.brave = true;
  if (Math.random() < 0.20) traits.curious = true;
  if (Math.random() < 0.15) traits.creative = true;

  return traits;
}

export function getBirthDateData(world = null) {
  const day = (world?.clock?.day) || 1;
  const hour = (world?.clock?.hour !== undefined) ? world.clock.hour : Math.floor(Math.random() * 24);
  const minute = (world?.clock?.minute !== undefined) ? world.clock.minute : Math.floor(Math.random() * 60);
  return {
    day,
    hour,
    minute,
    tick: currentTick,
    year: Math.floor(day / 365) + 1
  };
}

export function rollRandomSexualOrientation() {
  return rollCreatureOrientation();
}

export function applyRandomSexualOrientation(ent) {
  if (!ent || !ent.properties) return;
  const orient = rollCreatureOrientation();
  if (orient === "bisexual") ent.properties.bisexual = createBisexualProp();
  else if (orient === "homosexual") ent.properties.homosexual = createHomosexualProp();
}

export const SPECIES_SPEED_MULTIPLIERS = {
  cat: 1.45,
  deer: 1.40,
  bat: 1.40,
  wolf: 1.35,
  dragon: 1.30,
  mountain_goat: 1.25,
  goat: 1.25,
  elf: 1.25,
  lizard: 1.20,
  spider: 1.20,
  goblin: 1.10,
  boar: 1.10,
  orc: 1.05,
  human: 1.0,
  dwarf: 0.90,
  scorpion: 0.90,
  bear: 0.85,
  serpent: 1.0 // dynamically adjusted: 1.4 in water, 0.55 on land
};

/**
 * Liar Trait (Dishonesty, Deception & Fabricated Rumors)
 * type: "manipulator" (deliberately deceives) | "believer" (misinformed victim spreading heard lie)
 */
export function createLiarProp(type = "manipulator", dishonesty = 0.85, originalLiarId = null) {
  return {
    type,
    dishonesty,
    lieCount: 0,
    originalLiarId,
    liesSpread: []
  };
}

/**
 * Skeptic Perk (High resistance to lies and unverified rumors)
 */
export function createSkepticProp(doubtBonus = 0.35) {
  return {
    type: "skeptic",
    doubtBonus
  };
}

/**
 * Gullible Perk (High susceptibility to lies and manipulative gossip)
 */
export function createGullibleProp(trustBonus = 0.35) {
  return {
    type: "gullible",
    trustBonus
  };
}
export function createTraitorProp() {
  return {
    name: "Traíra",
    type: "traitor",
    description: "Dissimulado e infiel. Tende a trair parceiros, furtar itens alheios e mentir sem culpa."
  };
}

export function createStressedProp() {
  return {
    name: "Estressado",
    type: "stressed",
    description: "Ansioso e impaciente. Reage negativamente a conflitos com maior perda de humor."
  };
}

export function createCalmProp() {
  return {
    name: "Calmo",
    type: "calm",
    description: "Sereno e amigável. Tem alta paciência, boa diplomacia e bônus em conversas."
  };
}

export function createDoorEntity(x, y, ownerIds = []) {
  return createEntity({
    name: "Clan Gate",
    structure: {
      condition: 1500,
      maxCondition: 1500,
      defense: 30
    },
    woodCost: 2,
    render: {
      skin: "Feature_Door_Closed.png",
      color: 0xffb48250,
      backcolor: 0xff322010
    },
    door: {
      isOpen: false,
      owners: [...ownerIds],
      autoCloseTimer: 0,
      open() {
        this.isOpen = true;
        this.autoCloseTimer = 10.0;
      },
      close() {
        this.isOpen = false;
        this.autoCloseTimer = 0;
      }
    },
    effect(ent, dt, world, entities) {
      if (this.door && this.door.isOpen) {
        this.door.autoCloseTimer -= dt;
        if (this.door.autoCloseTimer <= 0) {
          // 5% chance to remain forgotten open
          if (Math.random() > 0.05) {
            this.door.close();
          } else {
            this.door.autoCloseTimer = 15.0; // Forgot open
          }
        }
      }
    }
  }, x, y);
}

export function createTorchItem(ownerId = null) {
  return {
    name: "Torch",
    itemType: "torch",
    resourceType: "torch",
    skin: "Item_Torch.png",
    isTool: true,
    isTorch: true,
    isLit: true,
    fuel: 240, // Lasts 240s = 24 in-game night hours (~2 full nights)
    maxFuel: 240,
    ownerId: ownerId
  };
}

export function createTorchEntity(x, y, ownerId = null) {
  const sz = currentZoneSize || 8;
  const torchRadius = Math.max(2.0, sz * 0.25);
  return createEntity({
    name: "Standing Torch",
    structure: {
      condition: 800,
      maxCondition: 800,
      defense: 10
    },
    render: {
      skin: "Item_Torch.png",
      color: 0xffffffff,
      backcolor: 0x00000000
    },
    torch: {
      isLit: true,
      fuel: 480,
      maxFuel: 480,
      ownerId: ownerId,
      radius: torchRadius
    },
    effect(ent, dt, world, entities) {
      if (this.torch && this.torch.isLit) {
        const curHour = world?.clock ? (world.clock.hour + (world.clock.minute || 0) / 60) : 12;
        const isNight = (curHour >= 17.5 || curHour < 5.8);
        if (isNight) {
          this.torch.fuel = Math.max(0, (this.torch.fuel || 480) - dt);
          if (this.torch.fuel <= 0) {
            this.torch.isLit = false;
          }
        }
      }
    }
  }, x, y);
}

export function createCampfireEntity(x, y, ownerId = null) {
  const sz = currentZoneSize || 8;
  const campfireRadius = sz; // 1 full zone coverage
  return createEntity({
    name: "Campfire",
    structure: {
      condition: 1500,
      maxCondition: 1500,
      defense: 15
    },
    woodCost: 3,
    woodCurrent: 0,
    isConstructed: false,
    render: {
      skin: "Feature_Campfire.png",
      color: 0xffffffff,
      backcolor: 0x00000000
    },
    campfire: {
      isLit: false,
      style: "wood",
      fuel: 480, // Lasts 480s of night burning time (~4 nights)
      maxFuel: 480,
      radius: campfireRadius,
      ownerId: ownerId
    },
    effect(ent, dt, world, entities) {
      if (this.campfire && ent.isConstructed !== false) {
        const curHour = world?.clock ? (world.clock.hour + (world.clock.minute || 0) / 60) : 12;
        const isNight = (curHour >= 17.5 || curHour < 5.8);
        if (isNight && (this.campfire.fuel || 0) > 0) {
          this.campfire.isLit = true;
          this.campfire.fuel = Math.max(0, (this.campfire.fuel || 480) - dt);
          if (this.campfire.fuel <= 0) {
            this.campfire.isLit = false;
          }
        } else {
          this.campfire.isLit = false;
        }
      }
    }
  }, x, y);
}


export const HOUSE_STYLES = [
  // Multi-story Styles
  { id: "timber_cabin", label: "Timber Cabin", skin: "Overworld_House.png", color: 0xffcd853f, woodCost: 2, stoneCost: 1, condition: 10000, floorsCount: 2, footprint: "2x1", yardType: "Vegetable Garden & Tool Shed" },
  { id: "stone_cottage", label: "Stone Cottage", skin: "Overworld_House.png", color: 0xffc8c8c8, woodCost: 1, stoneCost: 2, condition: 16000, floorsCount: 2, footprint: "2x2", yardType: "Cobblestone Patio & Flowerbeds" },
  { id: "thatched_hut", label: "Thatched Hut", skin: "Overworld_House.png", color: 0xffe6c86e, woodCost: 2, stoneCost: 1, condition: 7500, floorsCount: 2, footprint: "1x1", yardType: "Rustic Herb Garden & Loft" },
  { id: "log_lodge", label: "Log Lodge", skin: "Overworld_House.png", color: 0xff8b5a2b, woodCost: 3, stoneCost: 1, condition: 12000, floorsCount: 3, footprint: "2x2", yardType: "Timber Yard & Smoker" },
  { id: "half_timbered", label: "Half-Timbered House", skin: "Overworld_House.png", color: 0xfff0e6d2, woodCost: 2, stoneCost: 2, condition: 14000, floorsCount: 2, footprint: "2x1", yardType: "Paved Courtyard & Well" },
  { id: "mud_brick_adobe", label: "Adobe Dwelling", skin: "Overworld_House.png", color: 0xffd2965a, woodCost: 1, stoneCost: 2, condition: 11000, floorsCount: 2, footprint: "2x2", yardType: "Clay Terrace & Grain Store" },
  { id: "mountain_stilt", label: "Alpine Stilt House", skin: "Overworld_House.png", color: 0xff968278, woodCost: 2, stoneCost: 2, condition: 11500, floorsCount: 3, footprint: "2x2", yardType: "Stilt Deck & Goat Corral" },
  { id: "longhouse", label: "Nordic Longhouse", skin: "Overworld_House.png", color: 0xffa06432, woodCost: 3, stoneCost: 1, condition: 15000, floorsCount: 3, footprint: "3x2", yardType: "Great Hall Yard & Hearth" },
  { id: "bone_ossuary", label: "Ancient Ossuary", skin: "Overworld_House.png", color: 0xfff5f5dc, woodCost: 1, stoneCost: 1, boneCost: 2, condition: 13000, floorsCount: 3, footprint: "2x2", yardType: "Sacred Bone Shrine & Garden" },
  { id: "manor_villa", label: "Manor Villa", skin: "Overworld_House.png", color: 0xffb47850, woodCost: 3, stoneCost: 3, condition: 22000, floorsCount: 4, footprint: "3x3", yardType: "Manor Courtyard & Estate Garden" },
  // Thin 1x1 Variations
  { id: "timber_tower_house", label: "Timber Tower House", skin: "Overworld_House.png", color: 0xffcd853f, woodCost: 2, stoneCost: 1, condition: 8500, floorsCount: 3, footprint: "1x1", yardType: "Slender Veranda & Loft" },
  { id: "stone_townhouse", label: "Stone Townhouse", skin: "Overworld_House.png", color: 0xffc8c8c8, woodCost: 1, stoneCost: 2, condition: 12500, floorsCount: 3, footprint: "1x1", yardType: "Cobblestone Yard & Alcove" },
  { id: "stilt_watch_shack", label: "Stilt Watch-Shack", skin: "Overworld_House.png", color: 0xff968278, woodCost: 1, stoneCost: 1, condition: 6000, floorsCount: 2, footprint: "1x1", yardType: "Lookout Deck & Ladder" },
  { id: "plaster_steeple_house", label: "Steeple Townhouse", skin: "Overworld_House.png", color: 0xfff0e6d2, woodCost: 2, stoneCost: 1, condition: 11000, floorsCount: 4, footprint: "1x1", yardType: "High Balcony & Garden" },
  // Single-Story (Térreas / Sem Segundo Andar) Variations
  { id: "single_cabin", label: "Rustic Timber Ranch", skin: "Overworld_House.png", color: 0xffcd853f, woodCost: 2, stoneCost: 1, condition: 7000, floorsCount: 1, footprint: "2x1", yardType: "Front Porch & Vegetable Garden" },
  { id: "single_stone_cottage", label: "Ground Stone Cottage", skin: "Overworld_House.png", color: 0xffc8c8c8, woodCost: 1, stoneCost: 2, condition: 9000, floorsCount: 1, footprint: "2x2", yardType: "Gravel Yard & Herb Garden" },
  { id: "fenced_ranch_compound", label: "Fenced Ranch Homestead", skin: "Overworld_House.png", color: 0xff8b5a2b, woodCost: 3, stoneCost: 1, condition: 14000, floorsCount: 1, footprint: "3x3", yardType: "Fenced Pasture, Corral & Wellside Land" },
  { id: "courtyard_hacienda", label: "Courtyard Hacienda Estate", skin: "Overworld_House.png", color: 0xfff0e6d2, woodCost: 3, stoneCost: 3, condition: 20000, floorsCount: 1, footprint: "4x4", yardType: "Quad Condominium Courtyard & Central Fountain" },
  { id: "adobe_rancho", label: "Single-Story Adobe Rancho", skin: "Overworld_House.png", color: 0xffd2965a, woodCost: 1, stoneCost: 2, condition: 8500, floorsCount: 1, footprint: "2x2", yardType: "Clay Patio, Clay Oven & Storage Plot" },
  { id: "ground_croft", label: "Ground Thatched Croft", skin: "Overworld_House.png", color: 0xffe6c86e, woodCost: 1, stoneCost: 1, condition: 5500, floorsCount: 1, footprint: "1x1", yardType: "Rustic Thatch Shed & Fence" }
];

export const LEADER_HOUSE_STYLES = [
  { id: "citadel_palace", label: "Citadel Palace", skin: "Overworld_House.png", color: 0xffc8c8c8, woodCost: 4, stoneCost: 6, condition: 55000, floorsCount: 7, footprint: "3x3", yardType: "Palatial Throne Courtyard & Royal Guard Post" },
  { id: "jarl_high_hall", label: "Jarl High Long-Hall", skin: "Overworld_House.png", color: 0xffa06432, woodCost: 6, stoneCost: 4, condition: 48000, floorsCount: 7, footprint: "3x3", yardType: "Great Clan Hearth & Trophy Grounds" },
  { id: "ziggurat_palace", label: "Ziggurat Throne Palace", skin: "Overworld_House.png", color: 0xffd2965a, woodCost: 3, stoneCost: 7, condition: 52000, floorsCount: 7, footprint: "3x3", yardType: "Terraced Royal Gardens & Sun Altar" },
  { id: "chieftain_pagoda", label: "Chieftain Pagoda Spire", skin: "Overworld_House.png", color: 0xff8b5a2b, woodCost: 6, stoneCost: 4, condition: 46000, floorsCount: 7, footprint: "3x3", yardType: "Tiered Pavilion Deck & Clan Banners" },
  { id: "sanctuary_fortress", label: "Sanctuary Cathedral Keep", skin: "Overworld_House.png", color: 0xfff0e6d2, woodCost: 4, stoneCost: 6, condition: 50000, floorsCount: 7, footprint: "3x3", yardType: "Monumental Cloister & High Spire" },
  { id: "monolith_castle", label: "Basalt Monolith Castle", skin: "Overworld_House.png", color: 0xff4a4a58, woodCost: 3, stoneCost: 7, condition: 60000, floorsCount: 7, footprint: "3x3", yardType: "Imposing Fortress Ramparts & Armory" },
  { id: "imperial_palace", label: "Imperial Pavilion Citadel", skin: "Overworld_House.png", color: 0xffb47850, woodCost: 5, stoneCost: 5, condition: 54000, floorsCount: 7, footprint: "3x3", yardType: "Grand Imperial Plaza & Royal Stables" }
];

export function pickWeightedHouseStyle(seed = Math.random()) {
  // Smaller and lower (single-story, small footprint) buildings have much higher chance
  const weights = HOUSE_STYLES.map(s => {
    const [w, h] = (s.footprint || "1x1").split("x").map(Number);
    const area = (w || 1) * (h || 1);
    const floors = s.floorsCount || 1;
    const vol = area * Math.pow(floors, 1.25);
    return Math.max(1, Math.round(1000 / vol));
  });
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let r = (Math.abs(seed) % 1) * totalWeight;
  for (let i = 0; i < weights.length; i++) {
    if (r < weights[i]) return i;
    r -= weights[i];
  }
  return 0;
}

export function createHouseEntity(x, y, style = "mixed", ownerId = null, ownerName = null, supportMaterial = "wood", forcedVariant = null, rotation = null) {
  const curW = getSimWorld();
  const isOverWater = curW ? (curW.getTile ? curW.getTile(x, y) === 2 : false) : false;

  // Determine architectural variant index with area-weighted distribution
  let variantIdx = 0;
  if (forcedVariant !== null) {
    variantIdx = Math.abs(forcedVariant) % HOUSE_STYLES.length;
  } else if (ownerId) {
    const seed = (Math.abs(ownerId) * 0.137 + Math.abs(x * 7 + y * 13) * 0.041) % 1.0;
    variantIdx = pickWeightedHouseStyle(seed);
  } else {
    const seed = (Math.abs(x * 17 + y * 31) * 0.073) % 1.0;
    variantIdx = pickWeightedHouseStyle(seed);
  }

  let hDef = HOUSE_STYLES[variantIdx] || HOUSE_STYLES[0];
  const [baseW, baseH] = (hDef.footprint || "2x1").split("x").map(Number);

  // 90° Cardinal Rotation (0 = 0°, 1 = 90°, 2 = 180°, 3 = 270°)
  let rot = rotation !== null ? (Math.abs(rotation) % 4) : ((Math.abs(x * 3 + y * 7 + (ownerId || 0)) % 4));
  let footprintW = (rot % 2 === 1) ? (baseH || 1) : (baseW || 1);
  let footprintH = (rot % 2 === 1) ? (baseW || 1) : (baseH || 1);

  // Check if footprint touches road tiles.
  // ONLY Alpine Stilt House (variant 6: "mountain_stilt" / Suspended House) is allowed over roads!
  let touchesRoad = false;
  for (let fx = 0; fx < footprintW; fx++) {
    for (let fy = 0; fy < footprintH; fy++) {
      if (isRoadTile(x + fx, y + fy)) {
        touchesRoad = true;
        break;
      }
    }
    if (touchesRoad) break;
  }

  if (touchesRoad) {
    if (variantIdx !== 6 && forcedVariant === null) {
      variantIdx = 6; // Automatically select Suspended Stilt House when over road
      hDef = HOUSE_STYLES[6];
      const [bW, bH] = (hDef.footprint || "2x2").split("x").map(Number);
      footprintW = (rot % 2 === 1) ? (bH || 1) : (bW || 1);
      footprintH = (rot % 2 === 1) ? (bW || 1) : (bH || 1);
    } else if (variantIdx !== 6) {
      return null; // Reject all other house styles over roads
    }
  }

  let woodCost = hDef.woodCost;
  let stoneCost = hDef.stoneCost;
  let boneCost = hDef.boneCost || 0;
  let condition = hDef.condition;
  let defense = 80 + variantIdx * 5;
  let houseTypeLabel = isOverWater ? "Palafita / Plataforma" : (touchesRoad ? "Casa Suspensa sobre Rua" : hDef.label);

  if (isOverWater) {
    if (supportMaterial === "stone") {
      stoneCost += 2;
      woodCost += 1;
      condition += 3000;
      houseTypeLabel = "Plataforma de Pedra";
    } else {
      woodCost += 2;
      stoneCost += 1;
      condition += 1500;
      houseTypeLabel = "Palafita de Madeira";
    }
  }

  const numFloors = hDef.floorsCount || 2;
  const floorsList = Array.from({ length: numFloors }, (_, i) => ({
    floorNumber: i + 1,
    label: i === 0 ? "1ST FLOOR (GROUND SUITE)" : i === 1 ? "2ND FLOOR (UPPER APARTMENT)" : i === 2 ? "3RD FLOOR (LOFT SUITE)" : `${i + 1}TH FLOOR (APARTMENT)`,
    ownerId: i === 0 ? ownerId : null,
    ownerName: i === 0 ? ownerName : null,
    partnerId: null,
    partnerName: null,
    childrenIds: []
  }));

  const houseTitle = ownerName ? `${houseTypeLabel} de ${ownerName}` : houseTypeLabel;
  return createEntity({
    name: houseTitle,
    species: "structure",
    structure: {
      condition: condition,
      maxCondition: condition,
      defense: defense
    },
    house: {
      style: hDef.id,
      houseVariant: variantIdx,
      rotation: rot,
      ownerId: ownerId,
      ownerName: ownerName,
      partnerId: null,
      partnerName: null,
      maxFloors: numFloors,
      footprint: `${footprintW}x${footprintH}`,
      baseFootprint: hDef.footprint || "2x1",
      footprintW: footprintW,
      footprintH: footprintH,
      floors: floorsList,
      yard: {
        hasYard: true,
        type: hDef.yardType || "Courtyard & Garden",
        fenced: true,
        amenities: ["Flowerbeds", "Tool Storage", "Bench", "Stone Patio"]
      },
      pastOwners: [],
      woodCost: woodCost,
      stoneCost: stoneCost,
      boneCost: boneCost,
      woodCurrent: 0,
      stoneCurrent: 0,
      boneCurrent: 0,
      isCompleted: false,
      isPlatform: !!isOverWater,
      supportMaterial: isOverWater ? supportMaterial : null,
      foodStorage: []
    },
    blocking: true,
    render: {
      skin: "Overworld_House.png",
      color: isOverWater ? (supportMaterial === "stone" ? 0xffc8c8c8 : 0xff8b5a2b) : hDef.color,
      backcolor: 0x00000000
    }
  }, x, y);
}

/**
 * Leader's House / Chieftain Palace (Strictly 1 per city/clan, 3x3 footprint, 7 floors tall, capacity: 1 family)
 */
export function createLeaderHouseEntity(x, y, group = null, leaderId = null, leaderName = null, forcedVariant = null, rotation = null) {
  const gName = group?.name || "Clan";
  const gColor = group?.color !== undefined ? group.color : 0xffd700;

  let variantIdx = 0;
  if (forcedVariant !== null) {
    variantIdx = Math.abs(forcedVariant) % LEADER_HOUSE_STYLES.length;
  } else if (group && group.id !== undefined) {
    const rawGid = typeof group.id === "string" ? group.id.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) : group.id;
    variantIdx = Math.abs(rawGid) % LEADER_HOUSE_STYLES.length;
  } else {
    variantIdx = Math.abs(x * 5 + y * 11) % LEADER_HOUSE_STYLES.length;
  }
  const def = LEADER_HOUSE_STYLES[variantIdx] || LEADER_HOUSE_STYLES[0];

  const rot = rotation !== null ? (Math.abs(rotation) % 4) : 0;
  const numFloors = 7;

  // Politics Tower: 6 Diplomats (Floors 1-6) and 1 Leader (Floor 7)
  const d = group && group.diplomats ? group.diplomats : [null, null, null, null, null, null];
  const floorsList = [
    { floorNumber: 1, label: "1ST FLOOR (DIPLOMAT OF TRADE)", ownerId: d[0], ownerName: null, partnerId: null, partnerName: null, childrenIds: [] },
    { floorNumber: 2, label: "2ND FLOOR (DIPLOMAT OF WAR)", ownerId: d[1], ownerName: null, partnerId: null, partnerName: null, childrenIds: [] },
    { floorNumber: 3, label: "3RD FLOOR (DIPLOMAT OF ALLIANCES)", ownerId: d[2], ownerName: null, partnerId: null, partnerName: null, childrenIds: [] },
    { floorNumber: 4, label: "4TH FLOOR (DIPLOMAT OF INTERIOR)", ownerId: d[3], ownerName: null, partnerId: null, partnerName: null, childrenIds: [] },
    { floorNumber: 5, label: "5TH FLOOR (DIPLOMAT OF EXPANSION)", ownerId: d[4], ownerName: null, partnerId: null, partnerName: null, childrenIds: [] },
    { floorNumber: 6, label: "6TH FLOOR (CHIEF DIPLOMAT)", ownerId: d[5], ownerName: null, partnerId: null, partnerName: null, childrenIds: [] },
    { floorNumber: 7, label: "7TH FLOOR (HIGH SPIRE SANCTUARY - LEADER)", ownerId: leaderId, ownerName: leaderName, partnerId: null, partnerName: null, childrenIds: [] }
  ];

  const label = leaderName ? `Palácio de ${leaderName} (${gName})` : `${def.label} de ${gName}`;

  return createEntity({
    name: label,
    species: "structure",
    structure: {
      condition: def.condition,
      maxCondition: def.condition,
      defense: 180
    },
    house: {
      isLeaderHouse: true,
      style: def.id,
      houseVariant: variantIdx,
      rotation: rot,
      ownerId: leaderId,
      ownerName: leaderName,
      partnerId: null,
      partnerName: null,
      maxFloors: numFloors,
      footprint: "3x3",
      baseFootprint: "3x3",
      footprintW: 3,
      footprintH: 3,
      floors: floorsList,
      yard: {
        hasYard: true,
        type: def.yardType,
        fenced: true,
        amenities: ["Throne Pedestal", "Royal Fountain", "Imperial Banners", "Stone Ramparts"]
      },
      pastOwners: [],
      woodCost: def.woodCost,
      stoneCost: def.stoneCost,
      boneCost: 0,
      woodCurrent: 0,
      stoneCurrent: 0,
      boneCurrent: 0,
      isCompleted: false,
      isPlatform: false,
      supportMaterial: null,
      foodStorage: []
    },
    leaderHouse: {
      groupId: group?.id || null,
      groupName: gName,
      leaderId: leaderId,
      variant: variantIdx
    },
    blocking: true,
    render: {
      skin: "Overworld_House.png",
      color: gColor,
      backcolor: 0x00000000
    }
  }, x, y);
}

/**
 * Warehouse / Central Clan Stockpile Building (Grand Warehouse)
 * 2 Variations: Timber Barn vs Stone Depot
 */
export function createWarehouseEntity(x, y, group = null, variant = 0) {
  const gName = group?.name || "Clan";
  const gId = group?.id || null;
  const label = variant === 1 ? `Masonry Depot of ${gName}` : `Grand Warehouse of ${gName}`;
  const ent = createEntity(
    {
      name: label,
      species: "structure",
      group: group,
      groupId: gId,
      warehouse: {
        groupId: gId,
        groupName: gName,
        variant: variant,
        items: [],
        maxCapacity: 40,
        woodCost: variant === 1 ? 3 : 5,
        stoneCost: variant === 1 ? 5 : 3,
        woodCurrent: 0,
        stoneCurrent: 0,
        isCompleted: false
      },
      structure: { condition: 15000, maxCondition: 15000, defense: 110 },
      render: { skin: "Feature_Wood.png", color: group?.color !== undefined ? group.color : (variant === 1 ? 0xffc8c8c8 : 0xffd4a373), backcolor: 0xff3b271a },
      blocking: true
    },
    x,
    y
  );
  return ent;
}

/**
 * Artisan Hut (Cabana do Artesão)
 */
export function createArtisanHutEntity(x, y, group = null) {
  const gName = group?.name || "Clan";
  const gId = group?.id || null;
  return createEntity(
    {
      name: `Cabana do Artesão de ${gName}`,
      species: "structure",
      group: group,
      groupId: gId,
      artisan_hut: {
        groupId: gId,
        woodCost: 6,
        stoneCost: 4,
        woodCurrent: 0,
        stoneCurrent: 0,
        isCompleted: false,
        footprint: "2x2",
        footprintW: 2,
        footprintH: 2
      },
      structure: { condition: 12000, maxCondition: 12000, defense: 90 },
      render: { skin: "Feature_Cauldron.png", color: group?.color !== undefined ? group.color : 0xffd4a373, backcolor: 0xff5c4033 },
      blocking: true
    },
    x,
    y
  );
}

/**
 * Slaughterhouse Structure (Village Abattoir)
 * 2 Variations: Timber Slaughterhouse vs Stone Abattoir
 */
export function createSlaughterhouseEntity(x, y, group = null, variant = 0) {
  const gName = group?.name || "Clan";
  const gId = group?.id || null;
  const label = variant === 1 ? `Stone Abattoir of ${gName}` : `Timber Slaughterhouse of ${gName}`;
  return createEntity(
    {
      name: label,
      species: "structure",
      group: group,
      groupId: gId,
      slaughterhouse: {
        groupId: gId,
        groupName: gName,
        variant: variant,
        woodCost: variant === 1 ? 4 : 6,
        stoneCost: variant === 1 ? 6 : 4,
        woodCurrent: 0,
        stoneCurrent: 0,
        isCompleted: false,
        carcasses: [],
        hangingMeat: []
      },
      structure: { condition: 14000, maxCondition: 14000, defense: 100 },
      render: { skin: "Feature_Cauldron.png", color: group?.color !== undefined ? group.color : 0xffe65a5a, backcolor: 0xff3b1a1a },
      blocking: true
    },
    x,
    y
  );
}

/**
 * Kitchen Structure (Village Kitchen)
 * 2 Variations: Brick Oven Kitchen vs Timber Smokery
 */
export function createKitchenEntity(x, y, group = null, variant = 0) {
  const gName = group?.name || "Clan";
  const gId = group?.id || null;
  const label = variant === 1 ? `Smokery & Kitchen of ${gName}` : `Bakery & Kitchen of ${gName}`;
  return createEntity(
    {
      name: label,
      species: "structure",
      group: group,
      groupId: gId,
      kitchen: {
        groupId: gId,
        groupName: gName,
        variant: variant,
        woodCost: variant === 1 ? 6 : 4,
        stoneCost: variant === 1 ? 4 : 6,
        woodCurrent: 0,
        stoneCurrent: 0,
        isCompleted: false,
        stoveFuel: 100,
        preparedMeals: []
      },
      structure: { condition: 12000, maxCondition: 12000, defense: 90 },
      render: { skin: "Feature_Cauldron.png", color: group?.color !== undefined ? group.color : 0xfffaa03c, backcolor: 0xff3b271a },
      blocking: true
    },
    x,
    y
  );
}

/**
 * Hand-Carried Baskets (Gathering & Transport Baskets)
 */
export function createBasketItem(x, y, size = "medium") {
  const cap = size === "small" ? 3 : (size === "large" ? 10 : 6);
  const name = size === "small" ? "Small Basket" : (size === "large" ? "Large Basket" : "Medium Basket");
  return createEntity(
    {
      name,
      resourceType: "basket",
      render: { skin: "Item_Cloak.png", color: 0xffc8a064, backcolor: 0x00000000 },
      container: {
        type: "basket",
        capacity: cap,
        items: []
      },
      weight: 1.0,
      lifespan: createLifespanProp(600.0)
    },
    x,
    y
  );
}

/**
 * Body-Worn Backpacks (Hauler Expedition Packs)
 */
export function createBackpackItem(x, y, size = "medium") {
  const cap = size === "small" ? 6 : (size === "large" ? 20 : 12);
  const name = size === "small" ? "Small Backpack" : (size === "large" ? "Large Expedition Pack" : "Medium Backpack");
  return createEntity(
    {
      name,
      resourceType: "backpack",
      render: { skin: "Item_Cloak.png", color: 0xff8b5a2b, backcolor: 0x00000000 },
      container: {
        type: "backpack",
        capacity: cap,
        items: []
      },
      weight: 2.0,
      lifespan: createLifespanProp(900.0)
    },
    x,
    y
  );
}

/**
 * Prepared Meals & Culinary Recipes
 */
export function createRoastedMeat(x, y, sourceName = "Game") {
  return createEntity(
    {
      name: `Roasted Meat (${sourceName})`,
      resourceType: "food",
      render: { skin: "Item_Steak.png", color: 0xffc85032, backcolor: 0x00000000 },
      edible: {
        nutrition: 2800,
        foodType: "meat",
        digestDuration: 40,
        moodBonus: 25,
        sourceName
      },
      lifespan: createLifespanProp(90.0)
    },
    x,
    y
  );
}

export function createGrilledVeggies(x, y) {
  return createEntity(
    {
      name: "Grilled Veggies",
      resourceType: "food",
      render: { skin: "Item_Vegetable.png", color: 0xff8cd232, backcolor: 0x00000000 },
      edible: {
        nutrition: 2200,
        foodType: "veg",
        digestDuration: 35,
        moodBonus: 20
      },
      lifespan: createLifespanProp(90.0)
    },
    x,
    y
  );
}

export function createMeatBento(x, y, sourceName = "Game") {
  return createEntity(
    {
      name: `Meat Bento (${sourceName})`,
      resourceType: "food",
      render: { skin: "Item_Drumstick.png", color: 0xffd26432, backcolor: 0x00000000 },
      edible: {
        nutrition: 4500,
        foodType: "meat",
        digestDuration: 50,
        moodBonus: 40,
        sourceName
      },
      lifespan: createLifespanProp(120.0)
    },
    x,
    y
  );
}

export function createVeganBento(x, y) {
  return createEntity(
    {
      name: "Vegan Bento",
      resourceType: "food",
      render: { skin: "Item_Fruit.png", color: 0xff50c850, backcolor: 0x00000000 },
      edible: {
        nutrition: 4000,
        foodType: "veg",
        digestDuration: 45,
        moodBonus: 35
      },
      lifespan: createLifespanProp(120.0)
    },
    x,
    y
  );
}

export function createGourmetBento(x, y, sourceName = "Game") {
  return createEntity(
    {
      name: `Gourmet Bento (${sourceName})`,
      resourceType: "food",
      render: { skin: "Item_Steak.png", color: 0xfff0a028, backcolor: 0x00000000 },
      edible: {
        nutrition: 5500,
        foodType: "meat",
        digestDuration: 60,
        moodBonus: 60,
        sourceName
      },
      lifespan: createLifespanProp(150.0)
    },
    x,
    y
  );
}

/**
 * Water Well Building Entity (Village Water Well)
 * Village infrastructure that provides fresh drinking water to settlers.
 */
export function createWaterWellEntity(x, y, group = null) {
  const gName = group?.name || "Clan";
  const gId = group?.id || null;
  return createEntity(
    {
      name: `Water Well of ${gName}`,
      species: "structure",
      group: group,
      groupId: gId,
      well: {
        groupId: gId,
        groupName: gName,
        stoneCost: 4,
        woodCost: 2,
        stoneCurrent: 0,
        woodCurrent: 0,
        isCompleted: false
      },
      isWell: true,
      structure: { condition: 8000, maxCondition: 8000, defense: 80 },
      render: { skin: "Feature_Cauldron.png", color: group?.color !== undefined ? group.color : 0xff3cbcfc, backcolor: 0xff284064 },
      blocking: true
    },
    x,
    y
  );
}

/**
 * Road / Paved Street / Bridge Construction
 */
export function isDirtRoadTile(t) {
  return t === TILE_ROAD_GRASS || t === TILE_ROAD_SAND || t === TILE_ROAD_HILL;
}

export function isStoneRoadTile(t) {
  return t === TILE_ROAD_GRASS_STONE || t === TILE_ROAD_SAND_STONE || t === TILE_ROAD_HILL_STONE;
}

export function isRoadTile(x, y) {
  const curW = getSimWorld();
  if (curW) {
    const t = curW.getTile ? curW.getTile(x, y) : (curW.map ? curW.map[y * (curW.width || MAP_WIDTH) + x] : 0);
    if (isDirtRoadTile(t) || isStoneRoadTile(t)) return true;
  }
  return globalRoadCoords.has(getTileKey(x, y));
}

export function isRoadEligibleTerrain(t) {
  return t === TILE_FLOOR || t === TILE_SAND || t === TILE_HILL ||
         isDirtRoadTile(t) || isStoneRoadTile(t);
}

export function getDirtRoadTileForTerrain(t) {
  if (t === TILE_SAND || t === TILE_ROAD_SAND || t === TILE_ROAD_SAND_STONE) return TILE_ROAD_SAND;
  if (t === TILE_HILL || t === TILE_ROAD_HILL || t === TILE_ROAD_HILL_STONE) return TILE_ROAD_HILL;
  if (t === TILE_FLOOR || t === TILE_ROAD_GRASS || t === TILE_ROAD_GRASS_STONE) return TILE_ROAD_GRASS;
  return null; // Mountain, Stone, Peak, Water, Void do NOT support roads!
}

export function getStoneRoadTileForTerrain(t) {
  if (t === TILE_SAND || t === TILE_ROAD_SAND || t === TILE_ROAD_SAND_STONE) return TILE_ROAD_SAND_STONE;
  if (t === TILE_HILL || t === TILE_ROAD_HILL || t === TILE_ROAD_HILL_STONE) return TILE_ROAD_HILL_STONE;
  if (t === TILE_FLOOR || t === TILE_ROAD_GRASS || t === TILE_ROAD_GRASS_STONE) return TILE_ROAD_GRASS_STONE;
  return null;
}

export function getNaturalTileForRoad(t) {
  if (t === TILE_ROAD_SAND || t === TILE_ROAD_SAND_STONE) return TILE_SAND;
  if (t === TILE_ROAD_HILL || t === TILE_ROAD_HILL_STONE) return TILE_HILL;
  if (t === TILE_ROAD_GRASS || t === TILE_ROAD_GRASS_STONE) return TILE_FLOOR;
  return TILE_FLOOR;
}

/**
 * Directly sets dirt road terrain tiles into world.map without creating entity overhead.
 */
export function createRoadEntity(x, y, group = null) {
  const curW = getSimWorld();
  if (curW) {
    const curTile = curW.getTile ? curW.getTile(x, y) : (curW.map ? curW.map[y * (curW.width || MAP_WIDTH) + x] : 0);
    if (!isRoadEligibleTerrain(curTile)) return null;

    const roadTile = getDirtRoadTileForTerrain(curTile);
    if (!roadTile) return null;

    if (curW.setTile) {
      curW.setTile(x, y, roadTile);
    } else if (curW.map) {
      curW.map[y * (curW.width || MAP_WIDTH) + x] = roadTile;
    }

    // Clear any plant, tree, wood or stone deposit currently on this tile
    for (const e of entityRegistry.values()) {
      if (!e.destroyed && e.x === x && e.y === y) {
        if (e.properties?.wood || e.properties?.photosynthesis || e.properties?.deep_root || e.properties?.plant_flesh || e.properties?.stone_deposit || e.properties?.item) {
          e.destroyed = true;
        }
      }
    }
  }

  globalRoadCoords.add(getTileKey(x, y));
  return null;
}

/**
 * Checks if an unbuilt road tile is on the active construction frontier.
 * A road tile is on the frontier if:
 * 1. It is inside the clan's claimed territory zones, OR
 * 2. It is directly adjacent (within 1 tile) to an already constructed paved road tile.
 * This guarantees that highways and roads are built sequentially tile-by-tile in an unbroken chain from borders outward!
 */
export function isRoadFrontierTile(x, y, group = null) {
  if (isRoadTile(x, y)) return false;

  const cardDirs = [
    { dx: 1, dy: 0 },
    { dx: -1, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: 0, dy: -1 }
  ];

  // 1. Directly adjacent to an already constructed road tile
  for (const d of cardDirs) {
    if (isRoadTile(x + d.dx, y + d.dy)) return true;
  }

  // 2. If no road has been built yet in an isolated village, allow building from the village center / plaza
  if (group && group._plannedRoads && group._plannedRoads.length > 0) {
    const isFirstTile = group._plannedRoads[0].x === x && group._plannedRoads[0].y === y;
    if (isFirstTile) return true;

    if (group._plaza) {
      for (const bKey of ["warehouse", "campfire", "well", "kitchen", "slaughterhouse"]) {
        const b = group._plaza[bKey];
        if (b && Math.abs(x - b.x) + Math.abs(y - b.y) <= 1) return true;
      }
    }
  }

  return false;
}

/**
 * Checks if the specified tile (x, y) is within maxDist of an ACTUAL constructed road tile.
 * Prevents planning or attempting houses in off-road wilderness areas.
 */
export function isNearNormalRoad(x, y, group = null, maxDist = 2) {
  for (let r = 1; r <= maxDist; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (isRoadTile(nx, ny)) return true;
        if (group && group._plannedRoads) {
           for (const pr of group._plannedRoads) {
              if (pr.x === nx && pr.y === ny) return true;
           }
        }
      }
    }
  }
  return false;
}

export function applyRandomPersonalityPerks(ent, isFemale = null) {
  if (!ent) return;
  const p = ent.properties || ent;
  const female = isFemale !== null ? isFemale : (getCreatureGender(ent) === "female");

  // Traíra: maior chance em homens
  const rTraitor = Math.random();
  if (!female ? (rTraitor < 0.30) : (rTraitor < 0.10)) {
    p.traira = createTraitorProp();
  }

  // Estressado / Calmo
  const rMood = Math.random();
  if (rMood < 0.16) {
    p.estressado = createStressedProp();
  } else if (rMood < 0.32) {
    p.calmo = createCalmProp();
  }

  // Outros traços preexistentes
  const rOther = Math.random();
  if (rOther < 0.15) p.skeptic = createSkepticProp();
  else if (rOther < 0.30) p.gullible = createGullibleProp();
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

      const props = ent.properties;
      for (const key in props) {
        const prop = props[key];
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
 * Stomach with Internal Capacity, Diet Efficiencies, Excretion, and Fat Reserves
 */
export function createStomachProp(capacity = 4, diet = { meat: 1.0, plant: 0.8, fruit: 1.2, organ: 1.1, bone: 0.3 }) {
  return {
    capacity,
    items: [],
    diet,
    waste: 0,
    wasteThreshold: 450, // Digesting 1-2 meals produces healthy feces / fertilizer
    pendingSeeds: [],
    fatUnits: 0,
    maxFatUnits: 6,
    fatSurplus: 0,
    effect(ent, dt, world, entities) {
      // Note: Energy restoration and fat burning are strictly handled during sleep in createLifeProp.
    }
  };
}

/**
 * Bladder (Water Storage)
 */
export function createBladderProp(water = 1000, maxWater = 1000) {
  return {
    water,
    maxWater
  };
}

/**
 * Kidney (Water consumption ratio per energy spent)
 */
export function createKidneyProp(ratio = 1.0) {
  return {
    ratio,
    rate: 0.5,
    condition: 100,
    maxCondition: 100,
    nutrition: 500,
    foodType: "organ",
    effect(ent, dt) {
      if (!ent.properties.bladder) return;

      const mult = getDamagedEnergyMultiplier(this.condition, this.maxCondition);
      let exertionMult = 1.0;
      if (ent.motor === 5 || ent.properties.combat?.inCombat) exertionMult += 0.8;
      if (ent.motor === 1) exertionMult += 0.25;

      const waterDrain = 1.35 * this.ratio * mult * exertionMult * dt;
      ent.properties.bladder.water = Math.max(0, ent.properties.bladder.water - waterDrain);

      if (ent.properties.bladder.water <= 0) {
        if (ent.properties.life) {
          ent.properties.life.energy = Math.max(0, ent.properties.life.energy - dt * 25.0);
        }
        if (ent.properties.brain) {
          ent.properties.brain.condition = Math.max(0, ent.properties.brain.condition - dt * 0.75);
        }
      }
    }
  };
}

/**
 * Heart (Pumps vital blood and oxygen to brain and organs)
 */
export function createHeartProp() {
  return {
    rate: 0.5,
    condition: 100,
    maxCondition: 100,
    nutrition: 900,
    foodType: "organ",
    effect(ent, dt) {
      if (!ent.properties.brain) return;
      if (this.condition < 40) {
        const dmg = (1.0 - (this.condition / 40)) * 2.0 * dt;
        ent.properties.brain.condition = Math.max(0, ent.properties.brain.condition - dmg);
      }
    }
  };
}

/**
 * Liver (Detoxifies and aids in metabolism and cellular repair)
 */
export function createLiverProp() {
  return {
    rate: 0.5,
    condition: 100,
    maxCondition: 100,
    nutrition: 800,
    foodType: "organ",
    effect(ent, dt) {
      const hasFood = ent.properties.stomach && ent.properties.stomach.items && ent.properties.stomach.items.length > 0;
      const isFed = hasFood || (ent.properties.life && ent.properties.life.energy > ent.properties.life.max * 0.40);
      if (this.condition >= 50 && isFed && ent.properties.brain && ent.properties.brain.condition < ent.properties.brain.maxCondition) {
        ent.properties.brain.condition = Math.min(ent.properties.brain.maxCondition, ent.properties.brain.condition + dt * 0.10);
      }
    }
  };
}

/**
 * Intestines (Nutrient absorption efficiency and digestion throughput)
 */
export function createIntestineProp() {
  return {
    condition: 100,
    maxCondition: 100,
    nutrition: 700,
    foodType: "organ"
  };
}

/**
 * Ear (Acoustic perception and hearing radius)
 */
export function createEarProp(side = "left") {
  return {
    side,
    hearingRadius: 10,
    condition: 100,
    maxCondition: 100,
    nutrition: 150,
    foodType: "organ"
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
    name: "Cérebro",
    isBrain: true,
    cannotAmputate: true,
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
        ent.properties.life.energy = Math.max(0, ent.properties.life.energy - dt * 2.0 * mult);
      }

      // 1. Geographic Zone Tracking
      const zx = Math.floor(ent.x / currentZoneSize);
      const zy = Math.floor(ent.y / currentZoneSize);
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

      // 2. Scan Entities in Perception Range for Affinity, Memory & Object Memorization (Staggered every 3 ticks)
      let allyAffinitySumInZone = 0;
      if ((currentTick + ent.id) % 3 === 0) {
        const nearbyVisible = getEntitiesInRadius(ent.x, ent.y, viewRange);

        for (let i = 0; i < nearbyVisible.length; i++) {
          const other = nearbyVisible[i];
          if (other === ent || other.destroyed) continue;

          const dist = Math.abs(other.x - ent.x) + Math.abs(other.y - ent.y);
          if (dist > viewRange) continue;

          // Remember visible food items in Object Memory
          if (other.properties.edible) {
            this.rememberObject(other);
          }

          // Process Living Creatures (Brain required): Species & Color Affinity
          if (other.properties.life && other.properties.brain) {
            const otherSpecies = other.properties.species || "creature";
            const isSameSpecies = otherSpecies === mySpecies;
            const otherColor = other.properties.render?.color;

            // Initial Encounter Affinity
            if (this.affinities[other.id] === undefined) {
              this.affinities[other.id] = isSameSpecies ? 15 : 0;
            }

            let currentAff = this.affinities[other.id];
            const isSameClan = ent.properties.group && other.properties.group && ent.properties.group === other.properties.group;
            const maxPassiveCap = isSameClan ? 75 : (isSameSpecies ? 55 : 40);

            if (currentAff >= -40 && currentAff < maxPassiveCap) {
              let gainRate = isSameClan ? (dt * 0.35) : (isSameSpecies ? (dt * 0.25) : (dt * 0.10));

              if (!isSameSpecies) {
                const colorBoost = getColorSimilarityBoost(myColor, otherColor);
                gainRate *= colorBoost;
              }

              this.affinities[other.id] = Math.min(maxPassiveCap, currentAff + gainRate);
            }

            if (this.affinities[other.id] >= 20) {
              allyAffinitySumInZone += this.affinities[other.id];
            }
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

      // 4. Spontaneous Flashback from Long-Term Memory (Internal psychological reflection - quiet)
      if (this.longTermMemory.length > 0 && Math.random() < 0.002) {
        const mem = this.longTermMemory[Math.floor(Math.random() * this.longTermMemory.length)];
        if (mem.type === "AMPUTATION" || mem.type === "ATTACK" || mem.type === "DEATH" || mem.type === "KILL_WITNESS") {
          this.mood = Math.max(-100, this.mood - 12);
          if (mem.secondaryEntityId && this.affinities[mem.secondaryEntityId] !== undefined) {
            this.affinities[mem.secondaryEntityId] = Math.max(-100, this.affinities[mem.secondaryEntityId] - 2);
          }
        } else if (mem.type === "FEED" || mem.type === "BIRTH" || mem.type === "SPROUT" || mem.type === "KILL") {
          this.mood = Math.min(100, this.mood + 12);
          if (mem.secondaryEntityId && this.affinities[mem.secondaryEntityId] !== undefined) {
            this.affinities[mem.secondaryEntityId] = Math.min(100, this.affinities[mem.secondaryEntityId] + 2);
          }
        }
      }

      // 5. Interpersonal Relationship Milestones (Friendship >= 65 or Hatred <= -65)
      if (!this.affinityMilestones) this.affinityMilestones = {};
      for (const [targetIdStr, affVal] of Object.entries(this.affinities)) {
        const tId = parseInt(targetIdStr, 10);
        const prevMilestone = this.affinityMilestones[tId] || "neutral";
        if (affVal >= 65 && prevMilestone !== "friend") {
          this.affinityMilestones[tId] = "friend";
          const friend = entities?.find(e => e.id === tId && !e.destroyed);
          if (friend && friend.properties.brain) {
            const friendName = friend.properties.name || `Entity #${tId}`;
            recordWorldEvent({
              type: "RELATION",
              primaryEntityId: ent.id,
              secondaryEntityId: tId,
              location: { x: ent.x, y: ent.y },
              description: `${ent.properties.name} developed a deep bond of friendship with ${friendName} (affinity +${Math.round(affVal)})!`,
              tick: currentTick
            });
          }
        } else if (affVal <= -65 && prevMilestone !== "enemy") {
          this.affinityMilestones[tId] = "enemy";
          const enemy = entities?.find(e => e.id === tId && !e.destroyed);
          if (enemy && enemy.properties.brain) {
            const enemyName = enemy.properties.name || `Entity #${tId}`;
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
      }

      // 6. Group Expulsion Check: Expelled if majority of group members dislike entity (affinity <= 0, evaluated every 120 ticks)
      if (ent.properties.group && entities && (currentTick % 120 === (ent.id % 120))) {
        const group = ent.properties.group;
        let hateCount = 0;
        let totalCount = 0;

        for (const mid of group.members) {
          if (mid !== ent.id) {
            const mEnt = getEntityById(mid);
            const m = (mEnt && !mEnt.destroyed) ? mEnt : null;
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

      // 7. Housing Dynamics (Teto Próprio, Bônus/Debuff de Moradia, Cura e Despensa de Alimentos)
      if (ent.properties.group && entities) {
        const ownHouse = getOwnHouse(ent.id, entities);
        const hasCompletedHome = ownHouse && ownHouse.properties.house?.isCompleted;

        // Periodic mood evaluation based on home ownership
        if (Math.random() < 0.05) {
          if (hasCompletedHome) {
            this.mood = Math.min(100, (this.mood || 0) + 0.8); // Roof bonus (+Humor/Felicidade de ter um teto)
          } else {
            this.mood = Math.max(-100, (this.mood || 0) - 1.2); // Homeless debuff (-Humor/Tristeza de estar sem teto)
          }
        }

        // Inside/At Home Perks (Cura acelerada e proteção dentro de casa)
        if (hasCompletedHome && Math.abs(ownHouse.x - ent.x) + Math.abs(ownHouse.y - ent.y) <= 1) {
          // Rapid Healing: Regenera partes feridas 3x mais rápido dentro do próprio teto
          if (ent.properties.life && ent.properties.life.isSleeping && ent.properties.life.energy < ent.properties.life.max) {
            ent.properties.life.energy = Math.min(ent.properties.life.max, ent.properties.life.energy + 2.5);
          }
          const props = ent.properties;
          for (const k in props) {
            const p = props[k];
            if (p && typeof p.condition === "number" && typeof p.maxCondition === "number" && p.condition < p.maxCondition) {
              p.condition = Math.min(p.maxCondition, p.condition + 1.5);
            }
          }

          // Pantry Management: Se estiver carregando comida e estiver em casa, guarda até 2 alimentos na despensa da casa
          if (!ownHouse.properties.house.pantry) ownHouse.properties.house.pantry = [];
          const pantry = ownHouse.properties.house.pantry;

          for (const k in props) {
            const p = props[k];
            if ((k.startsWith("arm") || k.startsWith("paw") || k.startsWith("fangs")) && p && p.heldItem && (p.heldItem.resourceType === "meat" || p.heldItem.resourceType === "fruit" || p.heldItem.foodType)) {
              if (pantry.length < 2) {
                pantry.push({
                  name: p.heldItem.name || "Food Reserve",
                  resourceType: p.heldItem.resourceType || "meat",
                  nutrition: p.heldItem.nutrition || 2000
                });
                p.heldItem = null;
                recordWorldEvent({
                  opcode: OP_DROP,
                  type: "DROP",
                  primaryEntityId: ent.id,
                  location: { x: ownHouse.x, y: ownHouse.y },
                  description: `${ent.properties.name} guardou uma reserva de alimento na despensa de sua casa!`,
                  tick: currentTick,
                  timestamp: world?.clock ? { day: world.clock.day, hour: world.clock.hour, minute: world.clock.minute } : null,
                  metadata: { itemName: "Reserva de Alimento", house: ownHouse.properties.name }
                });
                break;
              }
            }
          }

          // Se a criatura estiver com fome em casa e houver comida na despensa, consome a reserva
          const eRatio = ent.properties.life ? (ent.properties.life.energy / ent.properties.life.max) : 1.0;
          if (eRatio <= 0.45 && pantry.length > 0 && ent.properties.stomach && ent.properties.stomach.items.length < ent.properties.stomach.capacity) {
            const food = pantry.pop();
            ent.properties.stomach.items.push({
              name: food.name,
              nutrition: food.nutrition || 2500,
              foodType: food.resourceType === "fruit" ? "fruit" : "meat",
              totalTurns: 60,
              remainingTurns: 60
            });
            recordWorldEvent({
              opcode: OP_FEED,
              type: "FEED",
              primaryEntityId: ent.id,
              location: { x: ownHouse.x, y: ownHouse.y },
              description: `${ent.properties.name} comeu de sua despensa caseira em ${ownHouse.properties.name}!`,
              tick: currentTick,
              timestamp: world?.clock ? { day: world.clock.day, hour: world.clock.hour, minute: world.clock.minute } : null,
              metadata: { foodName: food.name }
            });
          }
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

export function generateBabyName(mother, father = null, babyGender = "male", entities = []) {
  const motherSurname = getMotherSurname(mother);
  let firstName = "";
  let isTribute = false;
  let tributeTargetName = null;
  let isFilho = false;
  let isFilha = false;

  // 1. Check special filho / filha inheritance (chance ~12%)
  if (babyGender === "male" && father && Math.random() < 0.12) {
    const fatherRaw = (father.properties.name || "Pai").replace(/,\s*the\s+\w+/i, "").replace(/\s+filho\b/i, "").replace(/\s+Jr\.?/i, "").trim();
    const fatherFirstName = fatherRaw.split(/\s+/)[0];
    const surname = father.properties.surname || motherSurname;
    if (fatherFirstName && fatherFirstName.length >= 2) {
      firstName = `${fatherFirstName} filho`;
      isFilho = true;
      tributeTargetName = father.properties.name;
    }
  } else if (babyGender === "female" && Math.random() < 0.12) {
    const motherRaw = (mother.properties.name || "Mae").replace(/,\s*the\s+\w+/i, "").replace(/\s+filha\b/i, "").replace(/\s+Jr\.?/i, "").trim();
    const motherFirstName = motherRaw.split(/\s+/)[0];
    const surname = motherSurname;
    if (motherFirstName && motherFirstName.length >= 2) {
      firstName = `${motherFirstName} filha`;
      isFilha = true;
      tributeTargetName = mother.properties.name;
    }
  }

  // 2. Tribute high-affinity friend/partner if available (and not filho/filha)
  if (!firstName) {
    const affinities = mother.properties?.brain?.affinities || {};
    let bestPartner = null;
    let highestAff = 59;

    for (const [otherIdStr, aff] of Object.entries(affinities)) {
      if (aff > highestAff) {
        const other = getEntityById(parseInt(otherIdStr, 10));
        if (other && other !== mother && !other.destroyed && other.properties?.name) {
          highestAff = aff;
          bestPartner = other;
        }
      }
    }

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
    if (isFilho || isFilha || isTribute) {
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
  return {
    name: finalName,
    isTribute: isTribute || isFilho || isFilha,
    isFilho,
    isFilha,
    tributeTo: tributeTargetName,
    surname: motherSurname
  };
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
    fatherId: null,
    matingCooldown: 0,
    nutrition: 300,
    foodType: "organ",
    effect(ent, dt, world, entities) {
      if (!ent.properties.life) return;
      const mult = getDamagedEnergyMultiplier(this.condition, this.maxCondition);
      ent.properties.life.energy = Math.max(0, ent.properties.life.energy - dt * 0.1 * mult);

      this.matingCooldown = Math.max(0, (this.matingCooldown || 0) - dt);

      // Pregnancy gestation and childbirth (Faster balanced birth rate)
      if (this.isPregnant) {
        this.pregnantTimer = (this.pregnantTimer || 0) + dt;
        if (this.pregnantTimer >= 30.0 && entities) {
          this.isPregnant = false;
          this.pregnantTimer = 0;
          this.matingCooldown = 60.0;

          const father = this.fatherId ? getEntityById(this.fatherId) : null;
          const babySpecies = ent.properties.species || "human";
          const babyGender = Math.random() < 0.5 ? "female" : "male";

          const nameInfo = generateBabyName(ent, father, babyGender, entities);
          const babyName = nameInfo.name;

          const baby = createEntity(
            {
              name: babyName,
              species: babySpecies,
              render: { ...ent.properties.render },
              life: createLifeProp(Math.round(ent.properties.life.max * 0.85), Math.round(ent.properties.life.max * 0.85), 0.05, 0, father?.id || null, ent.id),
              brain: createBrainProp(16, { bravery: 0.6, curiosity: 0.9, aggression: 0.1 }, 1.0),
              stomach: createStomachProp(3, { meat: 1.0, plant: 1.0, fruit: 1.0, organ: 1.0, bone: 0.1 }),
              bladder: createBladderProp(2500, 2500),
              kidney: createKidneyProp(0.75),
              body_regen: createBodyRegenerationProp(1.2, 4, 8),
              combat: createCombatProp(0.8, 1),
              locomotion: createLocomotionProp(),
              torso: { condition: 90, maxCondition: 90, nutrition: 1500, foodType: "meat" }
            },
            ent.x + (Math.floor(Math.random() * 3) - 1),
            ent.y + (Math.floor(Math.random() * 3) - 1)
          );

          // Register child in parents' lineage
          if (!ent.properties.life.childrenIds) ent.properties.life.childrenIds = [];
          ent.properties.life.childrenIds.push(baby.id);
          if (father?.properties?.life) {
            if (!father.properties.life.childrenIds) father.properties.life.childrenIds = [];
            father.properties.life.childrenIds.push(baby.id);
          }

          // Inherit monogamy property if parents are monogamous or humanoid
          if (ent.properties.monogamy || father?.properties?.monogamy || babySpecies === "human") {
            baby.properties.monogamy = createMonogamyProp();
            applyRandomSexualOrientation(baby);
            applyRandomPersonalityPerks(baby);
          }

          // Give newborn gentle starter milk/nutrition
          baby.properties.stomach.items.push({
            name: "Mother's Milk",
            nutrition: 3500,
            foodType: "organ",
            totalTurns: 90,
            remainingTurns: 90
          });

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

          // Physical Limbs
          let hasPaws = false; for (const k in ent.properties) { if (k.startsWith("paw")) { hasPaws = true; break; } }
          if (hasPaws) {
            baby.properties.paw_front_left = createPawProp("front_left", 0.8, 60, 60, 3, 3, 12);
            baby.properties.paw_front_right = createPawProp("front_right", 0.8, 60, 60, 3, 3, 12);
            baby.properties.paw_back_left = createPawProp("back_left", 0.8, 60, 60, 3, 3, 12);
            baby.properties.paw_back_right = createPawProp("back_right", 0.8, 60, 60, 3, 3, 12);
          } else {
            baby.properties.arm_left = createArmProp("left", 0.9, 80, 80);
            baby.properties.arm_right = createArmProp("right", 0.9, 80, 80);
            baby.properties.leg_left = createLegProp("left", 0.9, 80, 80);
            baby.properties.leg_right = createLegProp("right", 0.9, 80, 80);
          }

          if (ent.properties.wings) {
            baby.properties.wings = createWingsProp(80, 80);
          }

          baby.properties.genitalia = createGenitaliaProp(babyGender === "female" ? "vagina" : "penis", false);

          // Faction assignment rule:
          // 1. Faction Inheritance: Baby unconditionally enters the faction of the parents!
          const motherClan = ent.properties.group || (world?.groups || []).find(g => g.members?.includes(ent.id));
          const fatherClan = father?.properties?.group || (world?.groups || []).find(g => g.members?.includes(father?.id));
          
          let targetClan = motherClan || fatherClan;
          if (fatherClan && motherClan && fatherClan !== motherClan) {
            targetClan = nameInfo.isFilho ? fatherClan : motherClan;
          }

          if (!targetClan && entities) {
            for (const g of (world?.groups || [])) {
              if (isTileInClaimedZones(ent.x, ent.y, g.claimedZones)) {
                targetClan = g;
                break;
              }
            }
          }

          if (targetClan) {
            baby.properties.group = targetClan;
            baby.properties.group_member = createGroupMemberProp();
            if (!targetClan.members.includes(baby.id)) {
              targetClan.members.push(baby.id);
            }
            if (!ent.properties.group) {
              ent.properties.group = targetClan;
              ent.properties.group_member = createGroupMemberProp();
              if (!targetClan.members.includes(ent.id)) targetClan.members.push(ent.id);
            }
          }

          // Immediate family bonds
          if (ent.properties.brain) {
            if (!ent.properties.brain.affinities) ent.properties.brain.affinities = {};
            ent.properties.brain.affinities[baby.id] = 95;
            ent.properties.brain.mood = Math.min(100, ent.properties.brain.mood + 30);
          }
          if (father?.properties?.brain) {
            if (!father.properties.brain.affinities) father.properties.brain.affinities = {};
            father.properties.brain.affinities[baby.id] = 95;
            father.properties.brain.mood = Math.min(100, father.properties.brain.mood + 25);
          }
          if (baby.properties.brain) {
            baby.properties.brain.affinities[ent.id] = 95;
            if (father) baby.properties.brain.affinities[father.id] = 95;
            baby.properties.brain.mood = 80;
            if (targetClan) {
              for (const mid of targetClan.members) {
                if (mid !== baby.id) baby.properties.brain.affinities[mid] = 75;
              }
            }
          }

          entities.push(baby);

          recordWorldEvent({
            opcode: OP_BIRTH,
            primaryEntityId: ent.id,
            secondaryEntityId: baby.id,
            location: { x: baby.x, y: baby.y },
            description: `${ent.properties.name} gave birth to a healthy newborn: ${baby.properties.name}!`,
            tick: currentTick,
            timestamp: world?.clock ? { day: world.clock.day, hour: world.clock.hour, minute: world.clock.minute } : null,
            metadata: {
              primaryName: ent.properties.name,
              secondaryName: baby.properties.name,
              fatherId: father?.id || null,
              fatherName: father?.properties.name || null
            }
          });
        }
        return;
      }

      // Mating & Intimate Sexual Relations
      if (this.matingCooldown <= 0 && ent.properties.life.energy > ent.properties.life.max * 0.35 && Math.random() < 0.60) {
        const isMonogamous = !!ent.properties.monogamy;
        const partnerId = ent.properties.monogamy?.partnerId;
        const nearbyMates = getEntitiesInRadius(ent.x, ent.y, 1);

        for (const mate of nearbyMates) {
          if (mate === ent || mate.destroyed || !mate.properties?.life) continue;

          const aff = ent.properties.brain?.affinities?.[mate.id] || 0;
          const mateAff = mate.properties.brain?.affinities?.[ent.id] || 0;
          const mateCooldown = mate.properties.genitalia?.matingCooldown || 0;
          if (mateCooldown > 0) continue;

          let canMate = false;
          let causesPregnancy = false;

          // Enforce: Couples with a house MUST mate inside their house!
          if (isMonogamous && partnerId === mate.id) {
            const ownHouse = getOwnHouse(ent.id, entities);
            if (ownHouse) {
              const inHouse = Math.abs(ent.x - ownHouse.x) <= 2 && Math.abs(ent.y - ownHouse.y) <= 2;
              if (!inHouse) continue;
            }
          }

          if (isMonogamous) {
            // Monogamous creatures mate with their bonded partner
            if (partnerId === mate.id && aff >= 25 && mateAff >= 25) {
              canMate = true;
              const isFemale = (this.type === "vagina" || this.type === "female");
              const isMateMale = (mate.properties.genitalia?.type === "penis" || mate.properties.genitalia?.type === "male");
              if (isFemale && isMateMale && !this.isPregnant) {
                causesPregnancy = true;
              }
            }
          } else {
            // Non-monogamous creatures mate opportunistically
            const isFemale = (this.type === "vagina" || this.type === "female");
            const isMateMale = (mate.properties.genitalia?.type === "penis" || mate.properties.genitalia?.type === "male");
            if (isFemale && isMateMale && mate.properties.species === ent.properties.species && !this.isPregnant) {
              const isSameClan = ent.properties.group && mate.properties.group && ent.properties.group === mate.properties.group;
              if (isSameClan || (aff >= 15 && mateAff >= 15)) {
                canMate = true;
                causesPregnancy = true;
              }
            }
          }

          if (canMate) {
            // Civilization / Clan Housing Check & Population Limits
            if (causesPregnancy) {
              // Check living humanoid count rather than total entity count
              const livingCreaturesCount = (entities || []).reduce((acc, e) => (!e.destroyed && e.properties?.life && e.properties?.brain ? acc + 1 : acc), 0);
              if (livingCreaturesCount >= 220) {
                causesPregnancy = false;
              }

              if (causesPregnancy && ent.properties.group) {
                const group = ent.properties.group;
                const livingClanMembers = (group.members || []).map(id => getEntityById(id)).filter(e => e && !e.destroyed && e.properties.life);
                
                // Clan population balancing (Active natural reproduction)
                if (livingClanMembers.length >= 35) {
                  causesPregnancy = false;
                } else {
                  // Base capacity 14 starter members + 3 per completed house (max 35)
                  const completedHouses = entities.filter(e => !e.destroyed && e.properties.house?.isCompleted && isTileInClaimedZones(e.x, e.y, group.claimedZones)).length;
                  const maxAllowedPop = Math.min(35, 14 + (completedHouses * 3));
                  if (livingClanMembers.length >= maxAllowedPop) {
                    causesPregnancy = false; // Postpone pregnancy until the clan builds more houses!
                  }
                }
              }
            }

            // 1. Biological Pregnancy
            if (causesPregnancy) {
              this.isPregnant = true;
              this.pregnantTimer = 0;
              this.fatherId = mate.id;
            }

            // 2. Cooldowns
            this.matingCooldown = 45.0;
            if (mate.properties.genitalia) {
              mate.properties.genitalia.matingCooldown = 30.0;
            }

            // 3. Happiness / Mood Boost
            if (ent.properties.brain) {
              ent.properties.brain.mood = Math.min(100, (ent.properties.brain.mood || 0) + 40);
              if (!ent.properties.brain.affinities) ent.properties.brain.affinities = {};
              ent.properties.brain.affinities[mate.id] = Math.min(100, aff + 10);
            }
            if (mate.properties.brain) {
              mate.properties.brain.mood = Math.min(100, (mate.properties.brain.mood || 0) + 40);
              if (!ent.properties.brain.affinities) ent.properties.brain.affinities = {};
              ent.properties.brain.affinities[mate.id] = Math.min(100, aff + 10);
            }
            if (mate.properties.brain) {
              mate.properties.brain.mood = Math.min(100, (mate.properties.brain.mood || 0) + 40);
              if (!mate.properties.brain.affinities) mate.properties.brain.affinities = {};
              mate.properties.brain.affinities[ent.id] = Math.min(100, mateAff + 10);
            }

            // 4. Cherished Memories
            ent.properties.brain?.addShortTerm({
              type: "MATING",
              desc: `Shared intimate passion and mating joy with ${mate.properties.name}`,
              location: { x: ent.x, y: ent.y }
            });
            mate.properties.brain?.addShortTerm({
              type: "MATING",
              desc: `Shared intimate passion and mating joy with ${ent.properties.name}`,
              location: { x: mate.x, y: mate.y }
            });

            if (Math.random() < 0.50) {
              ent.properties.brain?.addLongTerm({
                type: "CHERISHED_MOMENT",
                desc: `Cherished a night of deep love and passion with ${mate.properties.name}`
              });
              mate.properties.brain?.addLongTerm({
                type: "CHERISHED_MOMENT",
                desc: `Cherished a night of deep love and passion with ${ent.properties.name}`
              });
            }

            // 6. World Event Log
            recordWorldEvent({
              opcode: OP_RELATION,
              primaryEntityId: ent.id,
              secondaryEntityId: mate.id,
              location: { x: ent.x, y: ent.y },
              description: `${ent.properties.name} and ${mate.properties.name} mated intimately with profound joy and passion!`,
              tick: currentTick,
              timestamp: world?.clock ? { day: world.clock.day, hour: world.clock.hour, minute: world.clock.minute } : null,
              metadata: {
                primaryName: ent.properties.name,
                secondaryName: mate.properties.name
              }
            });

            break;
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

import { ASSET_DATA } from "./assets_data.js";

/**
 * Generates two contrasting RGBA hex colors for group identity
 */
export function generateContrastingColors() {
  const brightHues = [
    { fg: 0xfff0c030, bg: 0xff1e1e28 }, // Gold on Dark Obsidian
    { fg: 0xff50dcfa, bg: 0xff14283c }, // Cyan on Dark Navy
    { fg: 0xfffa5078, bg: 0xff28141e }, // Crimson on Dark Wine
    { fg: 0xff64dc64, bg: 0xff142814 }, // Emerald on Dark Pine
    { fg: 0xfff08030, bg: 0xff281e14 }, // Amber Orange on Dark Bronze
    { fg: 0xffd28cfa, bg: 0xff281432 }, // Violet Purple on Deep Void
    { fg: 0xffffffff, bg: 0xff202028 }, // Pure White on Slate
    { fg: 0xfff0f060, bg: 0xff1e2846 }, // Bright Yellow on Royal Navy
    { fg: 0xff40f0c0, bg: 0xff1e3228 }, // Seafoam Turquoise on Deep Forest
    { fg: 0xffff96a0, bg: 0xff3c1420 }, // Rose Pink on Dark Maroon
    { fg: 0xff82b4ff, bg: 0xff142040 }  // Sky Blue on Midnight Blue
  ];
  return brightHues[Math.floor(Math.random() * brightHues.length)];
}

/**
 * Picks a random flag tile skin from all available assets
 */
export function getRandomFlagSkin() {
  if (ASSET_DATA && ASSET_DATA.length > 0) {
    const chosen = ASSET_DATA[Math.floor(Math.random() * ASSET_DATA.length)];
    return chosen.filename;
  }
  return "Feature_Flower.png";
}

/**
 * Generates group and faction names with optional prefixes ("Clã dos", "Irmandade da", etc.)
 * and authentic 1 or 2 real words directly from the Portuguese vocabulario database (no eufonia mangling).
 */
export function gerarNomeGrupo(founderName = null) {
  const PREFIXOS = [
    "Clã dos", "Clã das", "Clã do", "Clã da", "Clã de",
    "Irmandade dos", "Irmandade das", "Irmandade do", "Irmandade da", "Irmandade de",
    "Guilda dos", "Guilda das", "Guilda do", "Guilda da", "Guilda de",
    "Tribo dos", "Tribo das", "Tribo do", "Tribo da", "Tribo de",
    "Ordem dos", "Ordem das", "Ordem do", "Ordem da", "Ordem de",
    "Aliança dos", "Aliança das", "Aliança do", "Aliança da", "Aliança de",
    "Povo dos", "Povo das", "Povo do", "Povo da", "Povo de",
    "Vanguarda da", "Vanguarda do", "Vanguarda dos", "Vanguarda das",
    "Legião da", "Legião do", "Legião dos", "Legião das",
    "Bastião da", "Bastião do", "Bastião dos", "Bastião das",
    "Sociedade da", "Sociedade do", "Sociedade dos", "Sociedade das"
  ];

  const w1 = getRandomVocabWord();
  const w2 = getRandomVocabWord();

  const usePrefix = Math.random() < 0.70;
  const numWords = Math.random() < 0.50 ? 2 : 1;
  const baseWords = numWords === 2 ? `${w1} ${w2}` : w1;

  if (founderName && Math.random() < 0.25) {
    const p = ["Clã de", "Irmandade de", "Guilda de", "Povo de", "Ordem de", "Tribo de"][Math.floor(Math.random() * 6)];
    return `${p} ${founderName}`;
  }

  if (usePrefix) {
    const prefix = PREFIXOS[Math.floor(Math.random() * PREFIXOS.length)];
    return `${prefix} ${baseWords}`;
  }

  return baseWords;
}

/**
 * Group / Faction System (Same JS Object shared by reference between all group members)
 */
let nextGroupId = 1;

export function createGroup(name, founder, baseZone = null, claimedZones = null) {
  let founderId = typeof founder === "object" && founder !== null ? founder.id : founder;
  let zx = 32;
  let zy = 32;

  const palette = generateContrastingColors();
  let groupColor = palette.fg;
  let groupBackColor = palette.bg;
  const flagSkin = getRandomFlagSkin();

  if (typeof founder === "object" && founder !== null) {
    if (founder.x !== undefined) zx = Math.floor(founder.x / currentZoneSize);
    if (founder.y !== undefined) zy = Math.floor(founder.y / currentZoneSize);
  } else if (baseZone && Array.isArray(baseZone)) {
    zx = baseZone[0] || 32;
    zy = baseZone[1] || 32;
  }

  const sz = currentZoneSize;
  const maxZX = Math.max(1, Math.floor((activeWorld?.width || 512) / sz));
  const maxZY = Math.max(1, Math.floor((activeWorld?.height || 512) / sz));

  zx = Math.max(0, Math.min(maxZX - 1, zx));

  // Groups begin with 3 contiguous dry land zones
  const defaultZones = [`${zx}_${zy}`];
  const claimedSet = new Set(defaultZones);
  const candDirs = [
    { dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 },
    { dx: 1, dy: 1 }, { dx: -1, dy: -1 }, { dx: 1, dy: -1 }, { dx: -1, dy: 1 }
  ];

  for (const off of candDirs) {
    if (defaultZones.length >= 3) break;
    const nzx = zx + off.dx;
    const nzy = zy + off.dy;
    const nzk = `${nzx}_${nzy}`;
    if (nzx >= 0 && nzx < maxZX && nzy >= 0 && nzy < maxZY && !claimedSet.has(nzk)) {
      let hasLand = false;
      const curW = activeWorld || getSimWorld();
      if (curW && curW.getTile) {
        for (let ox = 0; ox < sz && !hasLand; ox += 2) {
          for (let oy = 0; oy < sz && !hasLand; oy += 2) {
            const t = curW.getTile(nzx * sz + ox, nzy * sz + oy);
            if (t !== 2 && t !== 5) hasLand = true;
          }
        }
      } else {
        hasLand = true;
      }
      if (hasLand) {
        claimedSet.add(nzk);
        defaultZones.push(nzk);
      }
    }
  }

  const govTypes = ["DEMOCRACY", "PSEUDOCRACY", "PRESIDENTIALISM", "COMMUNISM", "MONARCHY", "AUTOCRACY"];
  const govGenders = ["PATRIARCHAL", "MATRIARCHAL", "NEUTRAL", "MACHIST", "FEMIST"];
  const group = {
    id: nextGroupId++,
    name: name || gerarNomeGrupo(),
    leaderId: founderId !== undefined && founderId !== null ? founderId : null,
    govType: govTypes[Math.floor(Math.random() * govTypes.length)],
    govGender: govGenders[Math.floor(Math.random() * govGenders.length)],
    diplomats: [null, null, null, null, null, null],
    relations: {}, // Map of groupId -> relation score
    wars: [],      // Array of enemy group IDs
    leaderTermTicks: 0,
    diplomatTermTicks: [0, 0, 0, 0, 0, 0],
    members: founderId !== undefined && founderId !== null ? [founderId] : [],
    claimedZones: claimedZones || defaultZones,
    rooms: [
      { id: 1, type: "residential", zx, zy, name: "Quartos do Líder", assignedMembers: founderId !== undefined && founderId !== null ? [founderId] : [] },
      { id: 2, type: "storage", zx, zy, name: "Depósito de Recursos", assignedMembers: [] },
      { id: 3, type: "dining", zx, zy, name: "Refeitório do Clã", assignedMembers: [] },
      { id: 4, type: "meeting", zx, zy, name: "Sala de Reunião", assignedMembers: [] }
    ],
    membersPerZone: 10,
    // Tree planting quota ratio: between 1 tree per 3 citizens (0.33) and 3 trees per citizen (3.0)
    treesPerCitizen: 0.33 + Math.random() * (3.0 - 0.33),
    storage: [],
    createdTick: currentTick,
    color: groupColor,
    backcolor: groupBackColor,
    flagSkin: flagSkin,
    _plannedRoads: null,
    _plaza: null,
    _housePlots: {}
  };

  // Pre-initialize road network and central plaza (stockpile, well, campfire)
  initClanRoadNetwork(group);
  initClanPlaza(group);

  return group;
}

/**
 * Dynamically expands clan territory to accommodate growing population (at least 1 zone for every 5 citizens).
 * Contiguously claims adjacent land zones with highest natural resource availability and routes new streets into the annexed zone.
 */
export function expandClanTerritoryToPopulation(group, targetZoneCount, world, livingPop = 0) {
  if (!group || !group.claimedZones) return;
  const sz = currentZoneSize || 8;
  const maxZX = Math.max(1, Math.floor((world?.width || 512) / sz));
  const maxZY = Math.max(1, Math.floor((world?.height || 512) / sz));

  const claimedSet = new Set(group.claimedZones);

  while (group.claimedZones.length < targetZoneCount) {
    let bestCandidate = null;
    let bestScore = -999999;

    for (const zk of group.claimedZones) {
      const parts = zk.includes("_") ? zk.split("_") : zk.split(",");
      const zx = parseInt(parts[0], 10);
      const zy = parseInt(parts[1], 10);

      for (const off of [{dx: 1, dy: 0}, {dx: -1, dy: 0}, {dx: 0, dy: 1}, {dx: 0, dy: -1}]) {
        const czx = zx + off.dx;
        const czy = zy + off.dy;
        const czk = `${czx}_${czy}`;

        if (czx < 0 || czx >= maxZX || czy < 0 || czy >= maxZY) continue;
        if (claimedSet.has(czk)) continue;

        // Check land quality of this candidate zone
        let landTiles = 0;
        let resourceScore = 0;
        for (let ox = 0; ox < sz; ox++) {
          for (let oy = 0; oy < sz; oy++) {
            const tx = czx * sz + ox;
            const ty = czy * sz + oy;
            if (isLandTile(tx, ty)) {
              landTiles++;
              if (world && world.getTile) {
                const t = world.getTile(tx, ty);
                if (t === 4 || t === 1) resourceScore += 2; // Stone / Mountain ore
                else if (t === 0 || t === 3) resourceScore += 1; // Grass / Fertile soil
              }
            }
          }
        }

        if (landTiles < Math.floor((sz * sz) * 0.25)) continue; // Must have at least 25% dry land

        // Prefer zones with more land and resources
        const score = landTiles * 2 + resourceScore;
        if (score > bestScore) {
          bestScore = score;
          bestCandidate = { zx: czx, zy: czy, zk: czk };
        }
      }
    }

    if (!bestCandidate) break;

    claimedSet.add(bestCandidate.zk);
    group.claimedZones.push(bestCandidate.zk);
    group.claimedZones._fastIntVersion = group.claimedZones.length;



    recordWorldEvent({
      opcode: OP_RELATION,
      type: "EXPANSION",
      primaryEntityId: group.leaderId,
      location: { x: bestCandidate.zx * sz + Math.floor(sz / 2), y: bestCandidate.zy * sz + Math.floor(sz / 2) },
      description: `The clan '${group.name}' expanded territory to zone (${bestCandidate.zx}, ${bestCandidate.zy}) due to population growth (${livingPop || group.members?.length || 10} citizens)!`,
      tick: currentTick
    });
  }
}

/**
 * Fast terrain-aware land and bridge pathfinding.
 * Uses terrain cost grading to favor gentle terrain and natural curves around lakes and coasts,
 * while allowing flat wooden bridge deck crossings (TILE_ROAD_WATER) over water bodies.
 * Snaps onto existing roads to form natural trade routes and organic Y-forks.
 */
export function findOrganicLandPath(startX, startY, targetX, targetY, world, minX, maxX, minY, maxY, maxNodes = 1200) {
  if (!world) return null;
  const startTile = world.getTile(startX, startY);
  const targetTile = world.getTile(targetX, targetY);
  // STRICTLY 100% DRY LAND ONLY (No water, no void)
  if (startTile === 2 || startTile === 5 || targetTile === 2 || targetTile === 5) return null;

  const dist = Math.abs(targetX - startX) + Math.abs(targetY - startY);
  if (dist === 0) return [{ x: startX, y: startY }];

  function toKey(x, y) { return (x << 16) | (y & 0xffff); }

  const startKey = toKey(startX, startY);
  const openArray = [{ x: startX, y: startY, g: 0, f: dist, parent: null }];
  const gScores = new Map();
  gScores.set(startKey, 0);
  const closedSet = new Set();

  const dirs = [
    { dx: 1, dy: 0 },
    { dx: -1, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: 0, dy: -1 }
  ];

  let iterations = 0;
  let closestNode = openArray[0];
  let minH = dist;

  while (openArray.length > 0 && iterations < maxNodes) {
    iterations++;
    let bestIdx = 0;
    for (let i = 1; i < openArray.length; i++) {
      if (openArray[i].f < openArray[bestIdx].f) bestIdx = i;
    }
    const current = openArray[bestIdx];
    openArray[bestIdx] = openArray[openArray.length - 1];
    openArray.pop();

    if (current.x === targetX && current.y === targetY) {
      closestNode = current;
      minH = 0;
      break;
    }

    const curKey = toKey(current.x, current.y);
    closedSet.add(curKey);

    const h = Math.abs(targetX - current.x) + Math.abs(targetY - current.y);
    if (h < minH) {
      minH = h;
      closestNode = current;
    }

    for (const d of dirs) {
      const nx = current.x + d.dx;
      const ny = current.y + d.dy;
      if (nx < minX + 1 || nx >= maxX - 1 || ny < minY + 1 || ny >= maxY - 1) continue;

      const nKey = toKey(nx, ny);
      if (closedSet.has(nKey)) continue;

      const t = world.getTile(nx, ny);
      // Strictly avoid water, void, mountain, peak, and stone! Roads only on Plains, Sand, Hills
      if (t === 2 || t === 5 || t === 1 || t === 10 || t === 4) continue;

      let moveCost = 1.0;

      // Strong penalty for tiles touching or near water borders (steers roads far inland away from coasts/rivers)
      let waterDistPenalty = 0;
      for (let wdy = -2; wdy <= 2; wdy++) {
        for (let wdx = -2; wdx <= 2; wdx++) {
          const wt = world.getTile(nx + wdx, ny + wdy);
          if (wt === 2) {
            const wdist = Math.abs(wdx) + Math.abs(wdy);
            if (wdist <= 1) waterDistPenalty = Math.max(waterDistPenalty, 12.0);
            else if (wdist === 2) waterDistPenalty = Math.max(waterDistPenalty, 6.0);
          }
        }
      }
      moveCost += waterDistPenalty;

      // Existing road discount: seamlessly joins into existing road arteries!
      if (isRoadTile(nx, ny)) {
        moveCost *= 0.3;
      }

      const tentG = current.g + moveCost;
      const prevG = gScores.get(nKey);

      if (prevG === undefined || tentG < prevG) {
        gScores.set(nKey, tentG);
        const node = { x: nx, y: ny, g: tentG, f: tentG + (Math.abs(targetX - nx) + Math.abs(targetY - ny)), parent: current };
        openArray.push(node);
      }
    }
  }

  // Must reach destination cleanly
  if (closestNode.x !== targetX || closestNode.y !== targetY) {
    return null;
  }

  const path = [];
  let curr = closestNode;
  while (curr) {
    path.push({ x: curr.x, y: curr.y });
    curr = curr.parent;
  }
  return path.reverse();
}

/**
 * Procedurally generates an organic continental highway and road network directly into world.map.
 * Generates biome-specific road terrain tiles strictly on 100% DRY LAND:
 * - Fertile Grass: TILE_ROAD_GRASS (6) - Terra com estrada
 * - Sand Dunes: TILE_ROAD_SAND (7) - Areia com estrada
 * - Rocky / Mountain: TILE_ROAD_STONE (8) - Montanha com estrada
 * Zero bridges over water, 100% continuous connected tiles.
 */
export function generateWorldRoadNetwork(world, minX, maxX, minY, maxY, sz = 8, seed = 12345, entities = []) {
  if (!world) return [];
  const roadCoords = new Map();

  const spanX = maxX - minX;
  const spanY = maxY - minY;
  if (spanX < 32 || spanY < 32) return [];

  // 1. Identify Natural Regional Hubs across Landmasses
  const targetCellSize = Math.max(80, Math.min(140, Math.floor(spanX / 4)));
  const numDivs = Math.max(2, Math.min(8, Math.floor(spanX / targetCellSize)));
  const cellW = spanX / numDivs;
  const cellH = spanY / numDivs;
  const minHubDist = Math.max(30, Math.floor(spanX * 0.16));

  const hubNodes = [];

  for (let gy = 0; gy < numDivs; gy++) {
    for (let gx = 0; gx < numDivs; gx++) {
      const cellMinX = Math.floor(minX + gx * cellW);
      const cellMaxX = Math.floor(minX + (gx + 1) * cellW);
      const cellMinY = Math.floor(minY + gy * cellH);
      const cellMaxY = Math.floor(minY + (gy + 1) * cellH);

      let bestHub = null;
      let midX = Math.floor((cellMinX + cellMaxX) / 2);
      let midY = Math.floor((cellMinY + cellMaxY) / 2);

      for (let r = 0; r <= Math.max(cellW, cellH) / 2 && !bestHub; r += 2) {
        for (let dy = -r; dy <= r && !bestHub; dy += 2) {
          for (let dx = -r; dx <= r && !bestHub; dx += 2) {
            const hx = midX + dx;
            const hy = midY + dy;
            if (hx >= cellMinX + 2 && hx < cellMaxX - 2 && hy >= cellMinY + 2 && hy < cellMaxY - 2) {
              const t = world.getTile(hx, hy);
              if (t === 0 || t === 3 || t === 9) { // Plains, Sand, Hills only
                let tooClose = false;
                for (const existing of hubNodes) {
                  if (Math.abs(existing.x - hx) + Math.abs(existing.y - hy) < minHubDist) {
                    tooClose = true;
                    break;
                  }
                }
                if (!tooClose) {
                  bestHub = { x: hx, y: hy };
                }
              }
            }
          }
        }
      }
      if (bestHub) {
        // Measure landmass score (dry land tiles around hub)
        let landScore = 0;
        for (let dy = -10; dy <= 10; dy += 2) {
          for (let dx = -10; dx <= 10; dx += 2) {
            const tx = bestHub.x + dx;
            const ty = bestHub.y + dy;
            if (tx >= minX && tx < maxX && ty >= minY && ty < maxY) {
              const t = world.getTile(tx, ty);
              if (t === 0 || t === 3 || t === 9) landScore++;
            }
          }
        }
        bestHub.landScore = landScore;
        hubNodes.push(bestHub);
      }
    }
  }

  // Sort hubs so the largest continental landmass hub is root (index 0)
  hubNodes.sort((a, b) => (b.landScore || 0) - (a.landScore || 0));

  function addRoadTile(x, y) {
    if (x < minX || x >= maxX || y < minY || y >= maxY) return;
    const t = world.getTile ? world.getTile(x, y) : (world.map ? world.map[y * (world.width || 1024) + x] : 0);
    if (!isRoadEligibleTerrain(t)) return;

    if (entities && entities.length > 0) {
      for (let i = entities.length - 1; i >= 0; i--) {
        const e = entities[i];
        if (e && !e.destroyed && e.x === x && e.y === y) {
          if (e.properties?.wood || e.properties?.photosynthesis || e.properties?.deep_root || e.properties?.plant_flesh || e.properties?.stone_deposit || e.properties?.item) {
            e.destroyed = true;
          }
        }
      }
    }

    const roadTile = getDirtRoadTileForTerrain(t);
    if (!roadTile) return;
    world.setTile(x, y, roadTile);
    const tk = getTileKey(x, y);
    globalRoadCoords.add(tk);
    roadCoords.set(`${x}_${y}`, { x, y, tile: roadTile });
  }

  // 2. Connect Regional Continental Hubs into a Connected Land Spanning Network
  if (hubNodes.length > 0) {
    const connectedHubs = [hubNodes[0]];
    const unconnectedHubs = hubNodes.slice(1);

    addRoadTile(hubNodes[0].x, hubNodes[0].y);

    while (unconnectedHubs.length > 0) {
      let minCost = 999999;
      let bestPath = null;
      let bestUnconnectedIdx = -1;

      for (let u = 0; u < connectedHubs.length; u++) {
        const nodeA = connectedHubs[u];
        for (let v = 0; v < unconnectedHubs.length; v++) {
          const nodeB = unconnectedHubs[v];
          const dist = Math.abs(nodeA.x - nodeB.x) + Math.abs(nodeA.y - nodeB.y);
          if (dist < minCost) {
            const path = findOrganicLandPath(nodeA.x, nodeA.y, nodeB.x, nodeB.y, world, minX, maxX, minY, maxY, 4000);
            if (path && path.length > 0) {
              minCost = dist;
              bestPath = path;
              bestUnconnectedIdx = v;
            }
          }
        }
      }

      if (bestPath && bestUnconnectedIdx !== -1) {
        for (let s = 0; s < bestPath.length; s++) {
          const pt = bestPath[s];
          addRoadTile(pt.x, pt.y);
        }
        connectedHubs.push(unconnectedHubs[bestUnconnectedIdx]);
        unconnectedHubs.splice(bestUnconnectedIdx, 1);
      } else {
        // Discard unreachable isolated island hubs from the continental road network
        unconnectedHubs.splice(0, 1);
      }
    }

    // Add cross-connections for alternate loop routes on the same continental landmass
    for (let i = 0; i < connectedHubs.length; i++) {
      const nodeA = connectedHubs[i];
      const otherNodes = connectedHubs
        .filter((_, idx) => idx !== i)
        .map(other => ({ other, dist: Math.abs(other.x - nodeA.x) + Math.abs(other.y - nodeA.y) }))
        .sort((a, b) => a.dist - b.dist)
        .slice(0, 2);

      for (const { other: nodeB } of otherNodes) {
        const path = findOrganicLandPath(nodeA.x, nodeA.y, nodeB.x, nodeB.y, world, minX, maxX, minY, maxY, 3000);
        if (path && path.length > 0) {
          for (let s = 0; s < path.length; s++) {
            const pt = path[s];
            addRoadTile(pt.x, pt.y);
          }
        }
      }
    }
  }

  // 3. Flood Fill Verification: Guarantee Largest Continental Component is Preserved
  const allRoadsArray = Array.from(roadCoords.values());
  if (allRoadsArray.length > 0) {
    const visitedRoads = new Set();
    const components = [];
    const cardDirs = [{ dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 }];

    for (const r of allRoadsArray) {
      const rk = `${r.x}_${r.y}`;
      if (visitedRoads.has(rk)) continue;

      const comp = new Set();
      const queue = [r];
      comp.add(rk);
      visitedRoads.add(rk);

      while (queue.length > 0) {
        const curr = queue.shift();
        for (const d of cardDirs) {
          const nx = curr.x + d.dx;
          const ny = curr.y + d.dy;
          const nk = `${nx}_${ny}`;
          if (roadCoords.has(nk) && !comp.has(nk)) {
            comp.add(nk);
            visitedRoads.add(nk);
            queue.push(roadCoords.get(nk));
          }
        }
      }
      components.push(comp);
    }

    // Largest connected component is the continental highway network
    components.sort((a, b) => b.size - a.size);
    const mainComponent = components[0] || new Set();

    // Connect or clean any detached land road fragments
    for (const r of allRoadsArray) {
      const rk = `${r.x}_${r.y}`;
      if (!mainComponent.has(rk)) {
        let closestMain = null;
        let minD = 999999;
        for (const mk of mainComponent) {
          const parts = mk.split("_");
          const mx = parseInt(parts[0], 10);
          const my = parseInt(parts[1], 10);
          const d = Math.abs(mx - r.x) + Math.abs(my - r.y);
          if (d < minD) {
            minD = d;
            closestMain = { x: mx, y: my };
          }
        }
        let connected = false;
        if (closestMain) {
          const path = findOrganicLandPath(r.x, r.y, closestMain.x, closestMain.y, world, minX, maxX, minY, maxY, 3000);
          if (path && path.length > 0) {
            connected = true;
            for (const pt of path) {
              addRoadTile(pt.x, pt.y);
              mainComponent.add(`${pt.x}_${pt.y}`);
            }
          }
        }
        if (!connected) {
          // Revert orphan road tile to natural ground
          const curT = world.getTile(r.x, r.y);
          world.setTile(r.x, r.y, getTerrainTileForRoad(curT));
          globalRoadCoords.delete(getTileKey(r.x, r.y));
          roadCoords.delete(rk);
        }
      }
    }
  }

  return Array.from(roadCoords.values());
}

/**
 * Initializes distinct road network archetypes for clans, avoiding water and expanding until land is found.
 * Archetypes:
 * 0: Grid (Roman Castrum / Urban Blocks)
 * 1: Radial (Organic Spoke & Winding Lanes)
 * 2: Boulevard (Grand Avenue & Perpendicular Alleys)
 * 3: Plaza Ring (Concentric Square Loop & Garden Spokes)
 */
export function initClanRoadNetwork(group) {
  if (!group) return [];
  if (group._plannedRoads && group._plannedRoads.length > 0) {
    return group._plannedRoads;
  }

  const sz = currentZoneSize || 8;
  const planned = [];
  const roadMap = new Map();

  function setTile(x, y, isSnap) {
    const k = `${x}_${y}`;
    if (!roadMap.has(k)) {
      const entry = { x, y, type: "road", isSnapPoint: !!isSnap, groupId: group.id };
      roadMap.set(k, entry);
      planned.push(entry);
    } else {
      if (isSnap) {
        const entry = roadMap.get(k);
        entry.isSnapPoint = true;
      }
    }
  }

  function maybeClaimZone(x, y) {
    const zx = Math.floor(x / sz);
    const zy = Math.floor(y / sz);
    const zk = `${zx}_${zy}`;
    if (!group.claimedZones.includes(zk) && isLandTile(x, y)) {
      group.claimedZones.push(zk);
    }
  }

  // 1. Find a valid land tile in current claimed zones or expand outward until land is found
  function findLandInZones(zones) {
    for (const zk of zones) {
      const zp = zk.includes("_") ? zk.split("_") : zk.split(",");
      const zx = parseInt(zp[0], 10) || 32;
      const zy = parseInt(zp[1], 10) || 32;
      const cx = zx * sz + Math.floor(sz / 2);
      const cy = zy * sz + Math.floor(sz / 2);
      for (let r = 0; r < sz; r++) {
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
            const tx = cx + dx;
            const ty = cy + dy;
            if (tx >= zx * sz && tx < (zx + 1) * sz && ty >= zy * sz && ty < (zy + 1) * sz) {
              if (isLandTile(tx, ty)) {
                return { x: tx, y: ty, zx, zy, zk };
              }
            }
          }
        }
      }
    }
    return null;
  }

  let landStart = findLandInZones(group.claimedZones || ["32_32"]);

  // If no land in current claimed zones (e.g. started in ocean/lake): expand outward until finding land!
  if (!landStart) {
    const firstZone = group.claimedZones?.[0] || "32_32";
    const zp = firstZone.includes("_") ? firstZone.split("_") : firstZone.split(",");
    const startZx = parseInt(zp[0], 10) || 32;
    const startZy = parseInt(zp[1], 10) || 32;

    for (let r = 1; r <= 24; r++) {
      for (let dzy = -r; dzy <= r; dzy++) {
        for (let dzx = -r; dzx <= r; dzx++) {
          if (Math.abs(dzx) !== r && Math.abs(dzy) !== r) continue;
          const candidateZx = startZx + dzx;
          const candidateZy = startZy + dzy;
          const candidateZk = `${candidateZx}_${candidateZy}`;
          const found = findLandInZones([candidateZk]);
          if (found) {
            if (!group.claimedZones.includes(candidateZk)) {
              group.claimedZones.push(candidateZk);
            }
            landStart = found;
            break;
          }
        }
        if (landStart) break;
      }
      if (landStart) break;
    }
  }

  // 1. Find village anchor point (prefer existing continental road tile, or land center)
  let baseX = 32 * sz + 4;
  let baseY = 32 * sz + 4;
  let foundAnchor = false;

  for (const zk of (group.claimedZones || ["32_32"])) {
    const zp = zk.includes("_") ? zk.split("_") : zk.split(",");
    const zx = parseInt(zp[0], 10) || 32;
    const zy = parseInt(zp[1], 10) || 32;
    for (let oy = 0; oy < sz; oy++) {
      for (let ox = 0; ox < sz; ox++) {
        const tx = zx * sz + ox;
        const ty = zy * sz + oy;
        if (isRoadTile(tx, ty)) {
          baseX = tx;
          baseY = ty;
          foundAnchor = true;
          break;
        }
      }
      if (foundAnchor) break;
    }
    if (foundAnchor) break;
  }

  if (!foundAnchor) {
    const firstZone = group.claimedZones?.[0] || "32_32";
    const zp = firstZone.includes("_") ? firstZone.split("_") : firstZone.split(",");
    const zx = parseInt(zp[0], 10) || 32;
    const zy = parseInt(zp[1], 10) || 32;
    baseX = zx * sz + Math.floor(sz / 2);
    baseY = zy * sz + Math.floor(sz / 2);
  }

  // Anchor village center snap
  setTile(baseX, baseY, true);

  // 2. Structured Village Central Crossroads & Plaza Ring (Clean main streets connecting the village center)
  const plazaRadius = 5;
  // East-West Main Thoroughfare
  for (let dx = -plazaRadius; dx <= plazaRadius; dx++) {
    if (isLandTile(baseX + dx, baseY)) {
      setTile(baseX + dx, baseY, dx === -plazaRadius || dx === plazaRadius);
      maybeClaimZone(baseX + dx, baseY);
    }
  }
  // North-South Main Thoroughfare
  for (let dy = -plazaRadius; dy <= plazaRadius; dy++) {
    if (isLandTile(baseX, baseY + dy)) {
      setTile(baseX, baseY + dy, dy === -plazaRadius || dy === plazaRadius);
      maybeClaimZone(baseX, baseY + dy);
    }
  }

  // Connect Plaza Buildings if already established (connecting doorway adjacent tile to main thoroughfare)
  const plaza = group._plaza;
  if (plaza) {
    for (const bKey of ["warehouse", "well", "campfire", "kitchen", "slaughterhouse", "artisan_hut", "leader_house"]) {
      const b = plaza[bKey];
      if (b && isLandTile(b.x, b.y)) {
        // Find doorway tile right outside building footprint
        const fpW = (bKey === "leader_house" ? 3 : (bKey === "warehouse" || bKey === "slaughterhouse" || bKey === "kitchen" || bKey === "artisan_hut" ? 2 : 1));
        const fpH = fpW;
        const doorX = b.x + Math.floor(fpW / 2);
        const doorY = (b.y > baseY) ? (b.y - 1) : (b.y + fpH);
        
        const dx = Math.sign(baseX - doorX);
        const dy = Math.sign(baseY - doorY);
        let cx = doorX;
        let cy = doorY;
        for (let step = 0; step < 8; step++) {
          if (roadMap.has(`${cx}_${cy}`)) break;
          // Ensure connector doesn't cross the building footprint itself
          if (cx >= b.x && cx < b.x + fpW && cy >= b.y && cy < b.y + fpH) {
            if (cx !== baseX) cx += dx;
            else if (cy !== baseY) cy += dy;
            continue;
          }
          if (isLandTile(cx, cy)) {
            setTile(cx, cy);
            maybeClaimZone(cx, cy);
          }
          if (cx !== baseX) cx += dx;
          else if (cy !== baseY) cy += dy;
          else break;
        }
      }
    }
  }

  // 3. Connect Isolated Village to Continental Road Network (if a nearby road exists and is reachable)
  if (!foundAnchor) {
    const curW = getSimWorld();
    if (curW) {
      let nearestRoadTile = null;
      let minRoadDist = Infinity;
      const searchR = 60;
      for (let dy = -searchR; dy <= searchR; dy += 2) {
        for (let dx = -searchR; dx <= searchR; dx += 2) {
          const rx = baseX + dx;
          const ry = baseY + dy;
          if (rx >= 0 && rx < (curW.width || 1024) && ry >= 0 && ry < (curW.height || 1024)) {
            if (isRoadTile(rx, ry)) {
              const d = Math.abs(dx) + Math.abs(dy);
              if (d < minRoadDist) {
                minRoadDist = d;
                nearestRoadTile = { x: rx, y: ry };
              }
            }
          }
        }
      }

      if (nearestRoadTile && minRoadDist <= 55) {
        const connectorPath = findOrganicLandPath(
          baseX,
          baseY,
          nearestRoadTile.x,
          nearestRoadTile.y,
          curW,
          0,
          curW.width || 1024,
          0,
          curW.height || 1024,
          600
        );
        if (connectorPath && connectorPath.length > 0) {
          for (const pt of connectorPath) {
            setTile(pt.x, pt.y);
            maybeClaimZone(pt.x, pt.y);
          }
        }
      }
    }
  }

  group._plannedRoads = planned;
  return planned;
}

/**
 * Expands the clan road network by connecting candidate plots cleanly to the main thoroughfare.
 */
export function expandClanRoadNetwork(group, count = 2) {
  if (!group) return [];
  if (!group._plannedRoads || group._plannedRoads.length === 0) {
    return initClanRoadNetwork(group);
  }

  const planned = group._plannedRoads;
  const roadMap = new Map();
  for (const r of planned) {
    roadMap.set(`${r.x}_${r.y}`, r);
  }

  function setTile(x, y) {
    if (!isLandTile(x, y)) return;
    const k = `${x}_${y}`;
    if (!roadMap.has(k)) {
      const entry = { x, y, type: "road", groupId: group.id };
      roadMap.set(k, entry);
      planned.push(entry);
    }
  }

  // Extend main streets by 2 tiles in cardinal directions if land is available
  const extremes = [
    { dx: 1, dy: 0 },
    { dx: -1, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: 0, dy: -1 }
  ];

  for (const dir of extremes) {
    const matchingRoads = planned.filter(r => isLandTile(r.x + dir.dx, r.y + dir.dy) && !roadMap.has(`${r.x + dir.dx}_${r.y + dir.dy}`));
    if (matchingRoads.length > 0) {
      const endRoad = matchingRoads[0];
      for (let s = 1; s <= count; s++) {
        const nx = endRoad.x + dir.dx * s;
        const ny = endRoad.y + dir.dy * s;
        if (isLandTile(nx, ny)) {
          setTile(nx, ny);
        } else {
          break;
        }
      }
    }
  }

  return planned;
}

/**
 * Defines the central village square (Praça) consisting of:
 * 1. Estoque (Warehouse / Stockpile)
 * 2. Poço (Water Well)
 * 3. Fogueira (Campfire)
 * Spacing: Each structure is comfortably spaced out with at least 3 tiles distance between each other.
 */
export function initClanPlaza(group) {
  if (!group) return null;
  if (group._plaza && group._plaza.warehouse && group._plaza.campfire && group._plaza.well && group._plaza.slaughterhouse && group._plaza.kitchen && group._plaza.artisan_hut) {
    return group._plaza;
  }

  const sz = currentZoneSize || 8;
  let baseX = 32 * sz + 4;
  let baseY = 32 * sz + 4;
  if (group._plannedRoads && group._plannedRoads.length > 0) {
    baseX = group._plannedRoads[0].x;
    baseY = group._plannedRoads[0].y;
  } else {
    const firstZone = group.claimedZones?.[0] || "32_32";
    const zp = firstZone.includes("_") ? firstZone.split("_") : firstZone.split(",");
    const baseZx = parseInt(zp[0], 10) || 32;
    const baseZy = parseInt(zp[1], 10) || 32;
    baseX = baseZx * sz + Math.floor(sz / 2);
    baseY = baseZy * sz + Math.floor(sz / 2);
  }

  const plannedRoadSet = new Set((group._plannedRoads || []).map(r => `${r.x}_${r.y}`));

  let existingWh = null, existingCf = null, existingWell = null;
  for (const e of entityRegistry.values()) {
    if (!e.destroyed && isTileInClaimedZones(e.x, e.y, group.claimedZones)) {
      if (e.properties?.warehouse && !existingWh) existingWh = { x: e.x, y: e.y };
      if (e.properties?.campfire && !existingCf) existingCf = { x: e.x, y: e.y };
      if (e.properties?.well && !existingWell) existingWell = { x: e.x, y: e.y };
    }
  }

  const validTiles = [];
  for (let r = 2; r <= 20; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const tx = baseX + dx;
        const ty = baseY + dy;
        const tk = `${tx}_${ty}`;
        if (!isLandTile(tx, ty)) continue;
        if (!isTileInClaimedZones(tx, ty, group.claimedZones)) continue;
        if (plannedRoadSet.has(tk) || isRoadTile(tx, ty)) continue;
        validTiles.push({ x: tx, y: ty });
      }
    }
    if (validTiles.length >= 16) break;
  }

  if (validTiles.length < 6) {
    for (let ox = 1; ox < sz - 1; ox++) {
      for (let oy = 1; oy < sz - 1; oy++) {
        const tx = Math.floor(baseX / sz) * sz + ox;
        const ty = Math.floor(baseY / sz) * sz + oy;
        const tk = `${tx}_${ty}`;
        if (isLandTile(tx, ty) && !plannedRoadSet.has(tk) && !isRoadTile(tx, ty)) {
          if (!validTiles.some(t => t.x === tx && t.y === ty)) {
            validTiles.push({ x: tx, y: ty });
          }
        }
      }
    }
  }

  const plazaPicks = {};
  const occupiedPlazaTiles = new Set();

  function isAreaFree(px, py, pw, ph) {
    for (let dx = 0; dx < pw; dx++) {
      for (let dy = 0; dy < ph; dy++) {
        const x = px + dx;
        const y = py + dy;
        const tk = `${x}_${y}`;
        if (occupiedPlazaTiles.has(tk) || plannedRoadSet.has(tk) || isRoadTile(x, y) || !isLandTile(x, y) || !isTileInClaimedZones(x, y, group.claimedZones)) {
          return false;
        }
      }
    }
    return true;
  }

  function reserveArea(px, py, pw, ph) {
    for (let dx = 0; dx < pw; dx++) {
      for (let dy = 0; dy < ph; dy++) {
        occupiedPlazaTiles.add(`${px + dx}_${py + dy}`);
      }
    }
  }

  // Desired building sizes for the plaza
  const plazaDefs = [
    { key: "leader_house", w: 3, h: 3, preferredDx: -1, preferredDy: 2 },
    { key: "warehouse", w: 2, h: 2, preferredDx: -4, preferredDy: -3 },
    { key: "campfire", w: 1, h: 1, preferredDx: 2, preferredDy: -1 },
    { key: "well", w: 1, h: 1, preferredDx: 3, preferredDy: 2 },
    { key: "slaughterhouse", w: 2, h: 2, preferredDx: -4, preferredDy: 2 },
    { key: "kitchen", w: 2, h: 2, preferredDx: 2, preferredDy: -4 },
    { key: "artisan_hut", w: 2, h: 2, preferredDx: -1, preferredDy: -4 }
  ];

  for (const def of plazaDefs) {
    let placed = false;
    // 1. Try preferred position
    const pX = baseX + def.preferredDx;
    const pY = baseY + def.preferredDy;
    if (isAreaFree(pX, pY, def.w, def.h)) {
      plazaPicks[def.key] = { x: pX, y: pY };
      reserveArea(pX, pY, def.w, def.h);
      placed = true;
    } else {
      // 2. Search outwardly in spiral for a valid clear rectangle
      for (let r = 1; r <= 20 && !placed; r++) {
        for (let dy = -r; dy <= r && !placed; dy++) {
          for (let dx = -r; dx <= r && !placed; dx++) {
            const candX = baseX + dx;
            const candY = baseY + dy;
            if (isAreaFree(candX, candY, def.w, def.h)) {
              plazaPicks[def.key] = { x: candX, y: candY };
              reserveArea(candX, candY, def.w, def.h);
              placed = true;
            }
          }
        }
      }

      // 3. Fallback: Search across all tiles in all claimed zones to guarantee placement
      if (!placed) {
        for (const zk of group.claimedZones || []) {
          if (placed) break;
          const zp = zk.includes("_") ? zk.split("_") : zk.split(",");
          const czx = parseInt(zp[0], 10);
          const czy = parseInt(zp[1], 10);
          for (let ox = 0; ox <= sz - def.w && !placed; ox++) {
            for (let oy = 0; oy <= sz - def.h && !placed; oy++) {
              const cx = czx * sz + ox;
              const cy = czy * sz + oy;
              if (isAreaFree(cx, cy, def.w, def.h)) {
                plazaPicks[def.key] = { x: cx, y: cy };
                reserveArea(cx, cy, def.w, def.h);
                placed = true;
              }
            }
          }
        }
      }
    }
    if (!placed) {
      plazaPicks[def.key] = { x: pX, y: pY };
      reserveArea(pX, pY, def.w, def.h);
    }
  }

  group._plaza = {
    warehouse: existingWh || plazaPicks.warehouse,
    campfire: existingCf || plazaPicks.campfire,
    well: existingWell || plazaPicks.well,
    slaughterhouse: plazaPicks.slaughterhouse,
    kitchen: plazaPicks.kitchen,
    artisan_hut: plazaPicks.artisan_hut,
    leader_house: plazaPicks.leader_house
  };

  return group._plaza;
}

/**
 * Checks if the entire central village square (warehouse, campfire, and well) is completed.
 */
export function isPraçaCompleted(group) {
  if (!group || !group.claimedZones) return false;
  const plaza = group._plaza || initClanPlaza(group);
  if (!plaza) return false;

  let whDone = false;
  let cfDone = false;
  let wellDone = false;

  for (const e of entityRegistry.values()) {
    if (!e.destroyed && isTileInClaimedZones(e.x, e.y, group.claimedZones)) {
      if (e.properties?.warehouse && e.properties.warehouse.isCompleted) whDone = true;
      if (e.properties?.campfire && e.isConstructed !== false) cfDone = true;
      if (e.properties?.well && e.properties.well.isCompleted) wellDone = true;
    }
  }

  return whDone && cfDone && wellDone;
}

/**
 * Returns prioritized blueprint tiles for a clan:
 * 1. Praça First (Warehouse, Campfire, Well, Slaughterhouse, Kitchen).
 * 2. Demand-Driven Additional Warehouses if storage is >= 75% full.
 * 3. Houses along road borders.
 */
export function getClanBlueprintTiles(group) {
  if (!group || !group.claimedZones) return [];

  // Fast Memoization Check (60 ticks cache)
  const versionKey = `${group.claimedZones.join(",")}_${(group.members || []).length}_${group._plannedRoads?.length}`;
  if (group._cachedBlueprint && group._cachedBlueprintKey === versionKey && (currentTick - (group._cachedBlueprintTick || 0) < 60)) {
    return group._cachedBlueprint;
  }

  const tiles = [];
  const sz = currentZoneSize;
  const members = group.members || [];
  const occupiedTiles = new Set();

  initClanRoadNetwork(group);
  const plaza = initClanPlaza(group);

  let warehouseEnt = null;
  let campfireEnt = null;
  let wellEnt = null;
  let slaughterhouseEnt = null;
  let kitchenEnt = null;
  let artisanHutEnt = null;
  const existingWarehouses = [];

  for (const e of entityRegistry.values()) {
    if (!e.destroyed && isTileInClaimedZones(e.x, e.y, group.claimedZones)) {
      if (e.properties?.warehouse) {
        if (!warehouseEnt) warehouseEnt = e;
        existingWarehouses.push(e);
      }
      if (e.properties?.campfire && !campfireEnt) campfireEnt = e;
      if (e.properties?.well && !wellEnt) wellEnt = e;
      if (e.properties?.slaughterhouse && !slaughterhouseEnt) slaughterhouseEnt = e;
      if (e.properties?.kitchen && !kitchenEnt) kitchenEnt = e;
      if (e.properties?.artisan_hut && !artisanHutEnt) artisanHutEnt = e;
    }
  }

  const whX = warehouseEnt ? warehouseEnt.x : (plaza?.warehouse?.x ?? 0);
  const whY = warehouseEnt ? warehouseEnt.y : (plaza?.warehouse?.y ?? 0);

  const cfX = campfireEnt ? campfireEnt.x : (plaza?.campfire?.x ?? (whX - 2));
  const cfY = campfireEnt ? campfireEnt.y : (plaza?.campfire?.y ?? (whY + 2));
  const campfireX = campfireEnt ? campfireEnt.x : (plaza?.campfire?.x ?? (whX - 2));
  const campfireY = campfireEnt ? campfireEnt.y : (plaza?.campfire?.y ?? (whY + 2));
  const wellX = wellEnt ? wellEnt.x : (plaza?.well?.x ?? (whX + 2));
  const wellY = wellEnt ? wellEnt.y : (plaza?.well?.y ?? (whY - 2));

  function markOccupied(x, y, w = 1, h = 1, type = "building", extra = {}) {
    tiles.push({ x, y, type, footprintW: w, footprintH: h, ...extra });
    for (let fx = 0; fx < w; fx++) {
      for (let fy = 0; fy < h; fy++) {
        occupiedTiles.add(`${x + fx}_${y + fy}`);
      }
    }
  }

  // Register existing central plaza civic structures with full footprints
  const whFp = 2;
  markOccupied(whX, whY, whFp, whFp, "warehouse");

  if (wellX !== undefined && wellY !== undefined) markOccupied(wellX, wellY, 1, 1, "well");
  if (campfireX !== undefined && campfireY !== undefined) markOccupied(campfireX, campfireY, 1, 1, "campfire");

  const shX = slaughterhouseEnt ? slaughterhouseEnt.x : (plaza?.slaughterhouse?.x ?? (whX - 3));
  const shY = slaughterhouseEnt ? slaughterhouseEnt.y : (plaza?.slaughterhouse?.y ?? (whY - 2));
  markOccupied(shX, shY, 2, 2, "slaughterhouse");

  const kitX = kitchenEnt ? kitchenEnt.x : (plaza?.kitchen?.x ?? (whX + 3));
  const kitY = kitchenEnt ? kitchenEnt.y : (plaza?.kitchen?.y ?? (whY + 2));
  markOccupied(kitX, kitY, 2, 2, "kitchen");

  const artX = artisanHutEnt ? artisanHutEnt.x : (plaza?.artisan_hut?.x ?? (whX - 2));
  const artY = artisanHutEnt ? artisanHutEnt.y : (plaza?.artisan_hut?.y ?? (whY + 3));
  markOccupied(artX, artY, 2, 2, "artisan_hut");

  // Leader Palace in Plaza (3x3 Footprint) - Every village must have one!
  const leaderIdVal = group.leaderId || (members.length > 0 ? members[0] : null);
  if (plaza?.leader_house) {
    const lhX = plaza.leader_house.x;
    const lhY = plaza.leader_house.y;
    markOccupied(lhX, lhY, 3, 3, "leader_house", { ownerId: leaderIdVal, isLeaderHouse: true });
  }

  // Register existing entities in claimed zones with full multi-tile footprints
  for (const ent of entityRegistry.values()) {
    if (!ent.destroyed && ent.properties) {
      if (ent.properties.house || ent.properties.leaderHouse || ent.properties.warehouse || ent.properties.slaughterhouse || ent.properties.kitchen || ent.properties.artisan_hut || ent.properties.well) {
        const fpW = ent.properties.house?.footprintW || (ent.properties.leaderHouse ? 3 : (ent.properties.warehouse || ent.properties.slaughterhouse || ent.properties.kitchen || ent.properties.artisan_hut ? 2 : 1));
        const fpH = ent.properties.house?.footprintH || (ent.properties.leaderHouse ? 3 : (ent.properties.warehouse || ent.properties.slaughterhouse || ent.properties.kitchen || ent.properties.artisan_hut ? 2 : 1));
        markOccupied(ent.x, ent.y, fpW, fpH, ent.properties.leaderHouse ? "leader_house" : (ent.properties.house ? "house" : "building"), { ownerId: ent.properties.house?.ownerId });
      }
    }
  }

  let plannedRoadSet = new Set((group._plannedRoads || []).map(r => `${r.x}_${r.y}`));
  const candidatePlots = [];

  function collectCandidatePlots() {
    candidatePlots.length = 0;
    for (const zk of group.claimedZones) {
      const zp = zk.includes("_") ? zk.split("_") : zk.split(",");
      const zx = parseInt(zp[0], 10);
      const zy = parseInt(zp[1], 10);

      for (let ox = 0; ox < sz; ox++) {
        for (let oy = 0; oy < sz; oy++) {
          const px = zx * sz + ox;
          const py = zy * sz + oy;
          const tk = `${px}_${py}`;

          const curW = getSimWorld();
          const t = curW ? (curW.getTile ? curW.getTile(px, py) : 0) : 0;
          if (t === 5 || t === 2) continue;
          if (plannedRoadSet.has(tk) || isRoadTile(px, py)) continue;
          if (occupiedTiles.has(tk)) continue;

          if (!isNearNormalRoad(px, py, group, 2)) continue;

          candidatePlots.push({ x: px, y: py });
        }
      }
    }
  }

  collectCandidatePlots();

  candidatePlots.sort((a, b) => {
    const da = Math.abs(a.x - whX) + Math.abs(a.y - whY);
    const db = Math.abs(b.x - whX) + Math.abs(b.y - whY);
    return da - db;
  });

  // Demand-Driven Warehouse: If total storage is >= 75% capacity (>= 30 items per warehouse)
  const totalStoredItems = existingWarehouses.reduce((sum, w) => sum + (w.properties.warehouse?.items?.length || 0), 0);
  const totalCapacity = existingWarehouses.length * 40;
  if (existingWarehouses.length > 0 && (totalCapacity === 0 || totalStoredItems >= totalCapacity * 0.75)) {
    const extraPlot = candidatePlots.shift();
    if (extraPlot) {
      markOccupied(extraPlot.x, extraPlot.y, 2, 2, "warehouse");
    }
  }

  if (!group._housePlots) group._housePlots = {};
  const memberSet = new Set(members);

  function isFarEnoughFromBuildings(x, y, currentTiles, minDist = 1, newW = 1, newH = 1) {
    for (const t of currentTiles) {
      const tW = t.footprintW || (t.type === "leader_house" ? 3 : (t.type === "warehouse" || t.type === "slaughterhouse" || t.type === "kitchen" || t.type === "artisan_hut" ? 2 : 1));
      const tH = t.footprintH || (t.type === "leader_house" ? 3 : (t.type === "warehouse" || t.type === "slaughterhouse" || t.type === "kitchen" || t.type === "artisan_hut" ? 2 : 1));

      // Direct Box Overlap Check
      const xOverlap = !(x + newW <= t.x || x >= t.x + tW);
      const yOverlap = !(y + newH <= t.y || y >= t.y + tH);
      if (xOverlap && yOverlap) return false;

      const xDist = Math.max(0, Math.max(t.x - (x + newW - 1), x - (t.x + tW - 1)));
      const yDist = Math.max(0, Math.max(t.y - (y + newH - 1), y - (t.y + tH - 1)));
      if (Math.max(xDist, yDist) < minDist) return false;
    }
    return true;
  }

  // Prioritize the clan leader so the 3x3 Leader Palace is always planned first
  const orderedMembers = [...members].sort((a, b) => (a === group.leaderId ? -1 : (b === group.leaderId ? 1 : 0)));

  for (let mIdx = 0; mIdx < orderedMembers.length; mIdx++) {
    const ownerId = orderedMembers[mIdx];
    const isLeader = (ownerId === group.leaderId);
    const hasHouse = tiles.some(t => (isLeader ? t.type === "leader_house" : t.type === "house") && t.ownerId === ownerId);
    if (!hasHouse) {
      const vacantTile = tiles.find(t => (!t.ownerId || !memberSet.has(t.ownerId)) && (isLeader ? t.type === "leader_house" : t.type === "house"));
      if (vacantTile) {
        vacantTile.ownerId = ownerId;
        continue;
      }

      const needsLeaderPlot = isLeader && !tiles.some(t => t.type === "leader_house");
      let houseFpW = 1, houseFpH = 1, isLeaderPlot = false;

      if (needsLeaderPlot) {
        houseFpW = 3;
        houseFpH = 3;
        isLeaderPlot = true;
      } else {
        // Area-Weighted House Style Selection (larger footprint = lower probability)
        const seed = (Math.abs(ownerId) * 0.137 + Math.abs(mIdx * 7) * 0.041) % 1.0;
        const variantIdx = pickWeightedHouseStyle(seed);
        const hDef = HOUSE_STYLES[variantIdx] || HOUSE_STYLES[0];
        const [baseW, baseH] = (hDef.footprint || "2x1").split("x").map(Number);
        const rot = (Math.abs(mIdx * 3 + (ownerId || 0)) % 4);
        houseFpW = (rot % 2 === 1) ? (baseH || 1) : (baseW || 1);
        houseFpH = (rot % 2 === 1) ? (baseW || 1) : (baseH || 1);
      }

      let chosenPlot = null;
      if (group._housePlots[ownerId]) {
        const p = group._housePlots[ownerId];
        let validSaved = true;
        for (let fx = 0; fx < houseFpW; fx++) {
          for (let fy = 0; fy < houseFpH; fy++) {
            const tk = `${p.x + fx}_${p.y + fy}`;
            if (occupiedTiles.has(tk) || !isLandTile(p.x + fx, p.y + fy) || isRoadTile(p.x + fx, p.y + fy) || !isTileInClaimedZones(p.x + fx, p.y + fy, group.claimedZones)) {
              validSaved = false;
              break;
            }
          }
          if (!validSaved) break;
        }
        if (validSaved && isFarEnoughFromBuildings(p.x, p.y, tiles, 0, houseFpW, houseFpH)) {
          chosenPlot = p;
        }
      }

      if (!chosenPlot) {
        let bestCandidate = null;

        if (candidatePlots.length > 0) {
          let bestPlotIdx = -1;
          let bestScore = -99999;

          for (let i = 0; i < candidatePlots.length; i++) {
            const cp = candidatePlots[i];
            let allTilesFree = true;
            for (let fx = 0; fx < houseFpW; fx++) {
              for (let fy = 0; fy < houseFpH; fy++) {
                const tk = `${cp.x + fx}_${cp.y + fy}`;
                if (occupiedTiles.has(tk) || plannedRoadSet.has(tk) || !isLandTile(cp.x + fx, cp.y + fy) || isRoadTile(cp.x + fx, cp.y + fy)) {
                  allTilesFree = false;
                  break;
                }
                if (!isTileInClaimedZones(cp.x + fx, cp.y + fy, group.claimedZones)) {
                  allTilesFree = false;
                  break;
                }
              }
              if (!allTilesFree) break;
            }

            if (!allTilesFree) continue;
            if (!isFarEnoughFromBuildings(cp.x, cp.y, tiles, 0, houseFpW, houseFpH)) continue;

            // Calculate min distance to any other existing building
            let minBuildingDist = 999;
            for (const t of tiles) {
              const d = Math.hypot(cp.x - t.x, cp.y - t.y);
              if (d < minBuildingDist) minBuildingDist = d;
            }

            const distToPlaza = Math.hypot(cp.x - whX, cp.y - whY);
            const score = (minBuildingDist >= 1.0 ? 15 : 10) + Math.min(5, minBuildingDist) - (distToPlaza * 0.15);

            if (score > bestScore) {
              bestScore = score;
              bestCandidate = cp;
              bestPlotIdx = i;
            }
          }

          if (bestCandidate && bestPlotIdx >= 0) {
            candidatePlots.splice(bestPlotIdx, 1);
          }
        }

        // Fallback: search across all claimed zones with comfortable spacing
        if (!bestCandidate) {
          for (const zk of group.claimedZones) {
            if (bestCandidate) break;
            const zp = zk.includes("_") ? zk.split("_") : zk.split(",");
            const zx = parseInt(zp[0], 10);
            const zy = parseInt(zp[1], 10);

            for (let ox = 1; ox < sz - houseFpW; ox++) {
              if (bestCandidate) break;
              for (let oy = 1; oy < sz - houseFpH; oy++) {
                const px = zx * sz + ox;
                const py = zy * sz + oy;

                let allFree = true;
                for (let fx = 0; fx < houseFpW; fx++) {
                  for (let fy = 0; fy < houseFpH; fy++) {
                    const tk = `${px + fx}_${py + fy}`;
                    if (!isLandTile(px + fx, py + fy) || isRoadTile(px + fx, py + fy) || plannedRoadSet.has(tk) || occupiedTiles.has(tk)) {
                      allFree = false;
                      break;
                    }
                  }
                  if (!allFree) break;
                }

                if (!allFree) continue;
                if (!isFarEnoughFromBuildings(px, py, tiles, 0, houseFpW, houseFpH)) continue;

                bestCandidate = { x: px, y: py };
                break;
              }
            }
          }
        }

        if (bestCandidate) {
          chosenPlot = bestCandidate;
          group._housePlots[ownerId] = { x: chosenPlot.x, y: chosenPlot.y };
        }
      }

      if (chosenPlot) {
        markOccupied(chosenPlot.x, chosenPlot.y, houseFpW, houseFpH, isLeaderPlot ? "leader_house" : "house", { ownerId, isLeaderHouse: isLeaderPlot });

        // Connect house doorstep to nearest street with a short direct spur
        if (group._plannedRoads && group._plannedRoads.length > 0) {
          let nearestRoad = group._plannedRoads[0];
          let minD = 9999;
          for (const r of group._plannedRoads) {
            const d = Math.abs(r.x - chosenPlot.x) + Math.abs(r.y - chosenPlot.y);
            if (d < minD) {
              minD = d;
              nearestRoad = r;
            }
          }

          if (minD > 1 && minD <= 6) {
            const curW = getSimWorld();
            const roadExt = findOrganicLandPath(nearestRoad.x, nearestRoad.y, chosenPlot.x, chosenPlot.y, curW, 0, curW?.width || 1024, 0, curW?.height || 1024, 400);
            if (roadExt && roadExt.length > 0) {
              for (const pt of roadExt) {
                if (pt.x === chosenPlot.x && pt.y === chosenPlot.y) continue;
                const rtk = `${pt.x}_${pt.y}`;
                if (!plannedRoadSet.has(rtk) && !occupiedTiles.has(rtk) && isLandTile(pt.x, pt.y) && !isRoadTile(pt.x, pt.y)) {
                  plannedRoadSet.add(rtk);
                  group._plannedRoads.push({ x: pt.x, y: pt.y, type: "road", groupId: group.id });
                }
              }
            }
          }
        }
      }
    }
  }

  // 6. Perimeter Walls & Gates for luxury kingdoms (>= 16 zones & all houses completed), respecting !isAdjacentToSnapPoint
  const livingMemberIds = members.filter(id => {
    const m = entityRegistry.get(id);
    return m && !m.destroyed;
  });
  const housedMembers = new Set();
  for (const ent of entityRegistry.values()) {
    if (!ent.destroyed && ent.properties.house?.isCompleted && isTileInClaimedZones(ent.x, ent.y, group.claimedZones)) {
      if (ent.properties.house.ownerId) housedMembers.add(ent.properties.house.ownerId);
      if (ent.properties.house.partnerId) housedMembers.add(ent.properties.house.partnerId);
    }
  }
  const allMembersHoused = livingMemberIds.length > 0 && livingMemberIds.every(id => housedMembers.has(id));
  const isLuxuryKingdom = group.claimedZones && group.claimedZones.length >= 16;

  if (allMembersHoused && isLuxuryKingdom) {
    // 6.1 Find which zones actually contain buildings
    const builtZonesSet = new Set();
    for (const t of tiles) {
      if (t.type === "house" || t.type === "warehouse" || t.type === "kitchen" || t.type === "slaughterhouse" || t.type === "well" || t.type === "artisan_hut") {
        const zx = Math.floor(t.x / sz);
        const zy = Math.floor(t.y / sz);
        builtZonesSet.add(`${zx}_${zy}`);
      }
    }
    
    // Only wall the zones that are claimed AND near buildings
    const walledZones = group.claimedZones.filter(zk => builtZonesSet.has(zk));

    for (const zk of walledZones) {
      const zp = zk.includes("_") ? zk.split("_") : zk.split(",");
      const zx = parseInt(zp[0], 10);
      const zy = parseInt(zp[1], 10);

      for (let ox = 0; ox < sz; ox++) {
        for (let oy = 0; oy < sz; oy++) {
          const px = zx * sz + ox;
          const py = zy * sz + oy;
          const isPerim = isPerimeterEdge(zx, zy, ox, oy, walledZones);

          if (isPerim && isLandTile(px, py) && !isRoadTile(px, py) && !plannedRoadSet.has(`${px}_${py}`)) {
            const isGateway = (oy === 0 && (ox === 3 || ox === 4)) ||
                              (oy === sz - 1 && (ox === 3 || ox === 4)) ||
                              (ox === 0 && (oy === 3 || oy === 4)) ||
                              (ox === sz - 1 && (oy === 3 || oy === 4));
            if (isGateway) {
              tiles.push({ x: px, y: py, type: "gate" });
            } else {
              tiles.push({ x: px, y: py, type: "wall" });
            }
          }
        }
      }
    }
  }

  // Cleanup orphaned walls from old blueprints (fixes old saves where walls were generated far out)
  const validWallCoords = new Set(tiles.filter(t => t.type === "wall" || t.type === "gate").map(t => `${t.x}_${t.y}`));
  for (const ent of entityRegistry.values()) {
    if (!ent.destroyed && ent.properties.structure && (ent.properties.wallStyle || ent.properties.name?.includes("Muralha") || ent.properties.name?.includes("Wall"))) {
      if (ent.properties.name && group.name && ent.properties.name.includes(group.name)) {
        if (!validWallCoords.has(`${ent.x}_${ent.y}`)) {
          ent.destroyed = true; // Destroy the orphaned wall so builders stop targeting it
        }
      }
    }
  }

  group._cachedBlueprint = tiles;
  group._cachedBlueprintKey = versionKey;
  group._cachedBlueprintTick = currentTick;
  return tiles;
}

/**
 * Returns all active clans and groups across the world.
 */
export function getAllWorldGroups() {
  const groupsMap = new Map();
  const curW = getSimWorld();
  if (curW && Array.isArray(curW.groups)) {
    for (const g of curW.groups) {
      if (g && g.id) groupsMap.set(g.id, g);
    }
  }
  for (const e of entityRegistry.values()) {
    if (!e.destroyed && e.properties?.group?.id) {
      groupsMap.set(e.properties.group.id, e.properties.group);
    }
  }
  return Array.from(groupsMap.values());
}

/**
 * Checks diplomatic eligibility for building an inter-village highway between Group A and Group B.
 */
export function canBuildInterVillageRoad(groupA, groupB) {
  if (!groupA || !groupB || groupA.id === groupB.id) return false;
  if (groupA.wars?.includes(groupB.id) || groupB.wars?.includes(groupA.id)) return false;

  const membersA = groupA.members || [];
  const membersB = groupB.members || [];
  if (membersA.length === 0 || membersB.length === 0) return false;

  // Check if active hostility/war between members exists
  for (const idA of membersA) {
    const entA = entityRegistry.get(idA);
    if (!entA || entA.destroyed || !entA.properties?.brain?.affinities) continue;

    for (const idB of membersB) {
      const affAtoB = entA.properties.brain.affinities[idB];
      if (affAtoB !== undefined && affAtoB < -20) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Calculates a single deterministic canonical highway between two clans using organic terrain-aware pathfinding.
 * Strictly avoids water bodies and deep mountains.
 */
export function getCanonicalHighway(groupA, groupB, sz = 8) {
  if (!groupA || !groupB || groupA.id === groupB.id) return [];
  const g1 = (groupA.id < groupB.id) ? groupA : groupB;
  const g2 = (groupA.id < groupB.id) ? groupB : groupA;

  const firstZone1 = g1.claimedZones?.[0] || "32_32";
  const zp1 = firstZone1.includes("_") ? firstZone1.split("_") : firstZone1.split(",");
  const base1 = { x: (parseInt(zp1[0], 10) || 32) * sz + Math.floor(sz / 2), y: (parseInt(zp1[1], 10) || 32) * sz + Math.floor(sz / 2) };

  const firstZone2 = g2.claimedZones?.[0] || "32_32";
  const zp2 = firstZone2.includes("_") ? firstZone2.split("_") : firstZone2.split(",");
  const base2 = { x: (parseInt(zp2[0], 10) || 32) * sz + Math.floor(sz / 2), y: (parseInt(zp2[1], 10) || 32) * sz + Math.floor(sz / 2) };

  const snaps1 = (g1._plannedRoads || []).filter(r => r.isSnapPoint);
  const snaps2 = (g2._plannedRoads || []).filter(r => r.isSnapPoint);

  const cands1 = snaps1.length > 0 ? snaps1 : [base1];
  const cands2 = snaps2.length > 0 ? snaps2 : [base2];

  let startSnap = base1;
  let endSnap = base2;
  let minD = 999999;

  for (const s1 of cands1) {
    for (const s2 of cands2) {
      const d = Math.abs(s1.x - s2.x) + Math.abs(s1.y - s2.y);
      if (d < minD) {
        minD = d;
        startSnap = s1;
        endSnap = s2;
      }
    }
  }

  const curW = getSimWorld();
  if (!curW) return [];
  const path = findOrganicLandPath(startSnap.x, startSnap.y, endSnap.x, endSnap.y, curW, 0, curW.width || 1024, 0, curW.height || 1024, 800);
  if (!path || path.length === 0) return [];

  const highwayTiles = [];
  for (let s = 0; s < path.length; s++) {
    const pt = path[s];
    highwayTiles.push({
      x: pt.x,
      y: pt.y,
      type: "road",
      isSnapPoint: (s === 0 || s === path.length - 1 || s % 10 === 0),
      groupId: null,
      isHighway: true
    });
  }

  return highwayTiles;
}

/**
 * Generates local road network blueprints strictly for the clan's village (3 Initial Dirt Roads + House connections).
 * Inter-village travel uses the pre-existing continental world highways without creatures attempting long intercity construction.
 */
export function getClanRoadBlueprints(group, allGroups = null) {
  if (!group || !group.claimedZones || group.claimedZones.length === 0) return [];
  if (group._cachedRoadBlueprints && (currentTick - (group._cachedRoadBlueprintsTick || 0) < 60)) {
    return group._cachedRoadBlueprints;
  }

  if (!group._plannedRoads || group._plannedRoads.length === 0) {
    initClanRoadNetwork(group);
  }

  const result = group._plannedRoads ? [...group._plannedRoads] : [];
  group._cachedRoadBlueprints = result;
  group._cachedRoadBlueprintsTick = currentTick;
  return result;
}

/**
 * Precomputed Road Path lookup between two locations along the village road network.
 * Verifies that road tiles are physically present on the map to avoid heavy dynamic A* searching.
 */
export function getPrefabricatedRoadPath(fromX, fromY, toX, toY, group) {
  if (!group) return null;
  const startRoad = isRoadTile(fromX, fromY);
  const endRoad = isRoadTile(toX, toY);
  if (!startRoad && !endRoad) return null;

  const path = [];
  let cx = fromX;
  let cy = fromY;
  const maxSteps = 80;

  for (let s = 0; s < maxSteps; s++) {
    if (cx === toX && cy === toY) break;
    const dx = Math.sign(toX - cx);
    const dy = Math.sign(toY - cy);

    let nextX = cx;
    let nextY = cy;

    if (dx !== 0 && (isRoadTile(cx + dx, cy) || cx + dx === toX)) {
      nextX += dx;
    } else if (dy !== 0 && (isRoadTile(cx, cy + dy) || cy + dy === toY)) {
      nextY += dy;
    } else if (dx !== 0) {
      nextX += dx;
    } else if (dy !== 0) {
      nextY += dy;
    } else {
      break;
    }

    if (!isLandTile(nextX, nextY)) break;
    cx = nextX;
    cy = nextY;
    path.push({ x: cx, y: cy });
  }

  return path.length > 0 ? path : null;
}

// ---- Per-tick cached lookups to avoid O(N) entity scans in hot loops ----

const _warehouseCache = new Map(); // groupId -> { tick, entity }
const _ownHouseCache = new Map();  // entityId -> { tick, entity }

/**
 * Finds the completed warehouse for a group with per-tick caching (O(1) after first call per tick).
 */
export function getGroupWarehouse(group, entities) {
  if (!group) return null;
  const gid = group.id;
  const cached = _warehouseCache.get(gid);
  if (cached && cached.tick === currentTick && cached.entity && !cached.entity.destroyed) {
    return cached.entity;
  }
  for (const e of entityRegistry.values()) {
    if (!e.destroyed && e.properties.warehouse?.isCompleted && (e.properties.warehouse.groupId === gid || isTileInClaimedZones(e.x, e.y, group.claimedZones))) {
      _warehouseCache.set(gid, { tick: currentTick, entity: e });
      return e;
    }
  }
  _warehouseCache.set(gid, { tick: currentTick, entity: null });
  return null;
}

/**
 * Finds the own house for an entity with per-tick caching (O(1) after first call per tick).
 */
export function getOwnHouse(entId, entities) {
  const cached = _ownHouseCache.get(entId);
  if (cached && cached.tick === currentTick) {
    if (!cached.entity || !cached.entity.destroyed) return cached.entity;
  }
  for (const e of entityRegistry.values()) {
    if (!e.destroyed && e.properties.house && (e.properties.house.ownerId === entId || e.properties.house.partnerId === entId)) {
      _ownHouseCache.set(entId, { tick: currentTick, entity: e });
      return e;
    }
  }
  _ownHouseCache.set(entId, { tick: currentTick, entity: null });
  return null;
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

  // 1. Clan Storage Array & Completed Warehouse Items
  if (Array.isArray(group.storage)) {
    for (const it of group.storage) {
      addItem(it, "storage");
    }
  }

  const warehouse = getGroupWarehouse(group, entities);
  if (warehouse && warehouse.properties?.warehouse?.items) {
    for (const it of warehouse.properties.warehouse.items) {
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
          if ((k.startsWith("arm") || k.startsWith("paw") || k.startsWith("fangs")) && p && p.heldItem) {
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

export function tryJoinGroup(candidate, group, entities, sponsor = null) {
  if (!candidate || !group || !candidate.properties.brain) return false;
  if (candidate.properties.group === group) return true;

  // 1. Calculate candidate's relationship with group members
  let sumAff = 0;
  let knownMembersCount = 0;
  let hasHostileMember = false;
  let maxFriendAffinity = sponsor?.properties?.brain?.affinities?.[candidate.id] || 0;

  for (const mid of (group.members || [])) {
    const mem = entityRegistry.get(mid) || entities?.find(e => e.id === mid && !e.destroyed);
    if (mem && mem.properties?.brain?.affinities) {
      const memAff = mem.properties.brain.affinities[candidate.id];
      if (memAff !== undefined) {
        sumAff += memAff;
        knownMembersCount++;
        if (memAff > maxFriendAffinity) maxFriendAffinity = memAff;
        if (memAff < -15) {
          hasHostileMember = true; // Hostility/feud in the clan blocks joining
        }
      }
    }
  }

  // If clan has members with hatred against candidate, reject
  if (hasHostileMember) return false;

  // Eligibility:
  // - Sponsoring close friend with affinity >= 20
  // - OR known members average affinity >= 10
  // - OR group has no living members
  const canJoin = (maxFriendAffinity >= 20) || (knownMembersCount === 0) || (sumAff / Math.max(1, knownMembersCount) >= 10);
  if (!canJoin) return false;

  // 2. Add candidate to group
  if (!group.members.includes(candidate.id)) {
    group.members.push(candidate.id);
  }
  candidate.properties.group = group;
  candidate.properties.group_member = createGroupMemberProp();

  // Establish positive initial rapport with other clan members
  if (candidate.properties.brain?.affinities) {
    for (const mid of group.members) {
      if (mid !== candidate.id) {
        candidate.properties.brain.affinities[mid] = Math.max(25, candidate.properties.brain.affinities[mid] || 25);
      }
    }
  }

  recordWorldEvent({
    opcode: OP_RELATION,
    type: "JOIN_CLAN",
    primaryEntityId: candidate.id,
    secondaryEntityId: group.id,
    location: { x: candidate.x, y: candidate.y },
    description: `${candidate.properties.name} entrou para a facção '${group.name}' ao lado de seus amigos!`,
    tick: currentTick
  });

  return true;
}

/**
 * Communication & Social Gossip Behavior (Sporadic, Organic, and Meaningful)
 */
/**
 * Passive "Pass-By" Interaction (Full Real Interactions: Kisses, Hugs, Insults, Shoves, Praise, Rumors, Consolation)
 * Occurs organically with a very small chance when creatures cross paths within <= 1 tile,
 * triggering a full real interaction without interrupting the creature's active task priorities or locomotion goal.
 */
export function handlePassByInteraction(ent, other, world, entities) {
  if (!ent || !other || ent.destroyed || other.destroyed) return;
  if (!ent.properties?.brain || !other.properties?.brain) return;
  if (ent.properties.life?.isSleeping || other.properties.life?.isSleeping) return;

  if (!ent._lastSpokeWith) ent._lastSpokeWith = {};
  if (!other._lastSpokeWith) other._lastSpokeWith = {};

  // Check if one has a group and the other is factionless with good affinity
  if (ent.properties.group && !other.properties.group) {
    const aff = ent.properties.brain?.affinities?.[other.id] || 0;
    const otherAff = other.properties.brain?.affinities?.[ent.id] || 0;
    if (aff >= 20 || otherAff >= 20) {
      tryJoinGroup(other, ent.properties.group, entities, ent);
    }
  } else if (!ent.properties.group && other.properties.group) {
    const aff = ent.properties.brain?.affinities?.[other.id] || 0;
    const otherAff = other.properties.brain?.affinities?.[ent.id] || 0;
    if (aff >= 20 || otherAff >= 20) {
      tryJoinGroup(ent, other.properties.group, entities, other);
    }
  }

  // Pair cooldown of 60 ticks between interactions
  if (ent._lastSpokeWith[other.id] && (currentTick - ent._lastSpokeWith[other.id] < 60)) return;

  // Execute genuine interaction with full world events, mood impact, and dialogue/social consequences
  gossipBetweenCreatures(ent, other, world, entities);
}

/**
 * Communication & Social Gossip Behavior (Active Deliberate Conversations + Organic Passive Pass-By)
 */
export function createCommunicationProp(talkRate = 4.0) {
  const actualTalkRate = Math.max(2.0, (talkRate || 4.0));
  return {
    talkTimer: 0,
    passByTimer: 0,
    talkRate: actualTalkRate,
    effect(ent, dt, world, entities) {
      if (ent.properties.life?.isSleeping) return;

      // --- A. PASSIVE "PASS-BY" MICRO-INTERACTIONS (Organic chance per step within <= 1 tile) ---
      this.passByTimer = (this.passByTimer || 0) + dt;
      if (this.passByTimer >= 0.25) {
        this.passByTimer = 0;
        if (Math.random() < 0.12) {
          const adjacentTalkers = getEntitiesInRadius(ent.x, ent.y, 1);
          for (const other of adjacentTalkers) {
            if (other !== ent && !other.destroyed && other.properties?.brain && !other.properties.life?.isSleeping) {
              const dist = Math.abs(other.x - ent.x) + Math.abs(other.y - ent.y);
              if (dist <= 1) {
                handlePassByInteraction(ent, other, world, entities);
                break;
              }
            }
          }
        }
      }

      // --- B. ACTIVE DELIBERATE CONVERSATIONS & GOSSIP ---
      this.talkTimer = (this.talkTimer || 0) + dt;
      if (this.talkTimer < this.talkRate) return;
      this.talkTimer = 0;

      const isBusyWorking = isCarryingItem(ent, "stone") || isCarryingItem(ent, "wood") || isCarryingItem(ent, "seed") || isCarryingItem(ent, "meat") || ent._taskGoal;
      if (isBusyWorking) return; // Working citizens stay on task and only exchange passive pass-by greetings!

      // General talking cooldown: creature only engages in conversation once per 30 ticks
      if (ent._lastTalkTick && (currentTick - ent._lastTalkTick < 30)) return;

      const mouth = ent.properties.mouth;
      const talkRange = mouth ? (mouth.talkRadius || 6) : 4;
      const nearbyTalkers = getEntitiesInRadius(ent.x, ent.y, talkRange);

      for (const other of nearbyTalkers) {
        if (other === ent || other.destroyed || !other.properties.brain || other.properties.life?.isSleeping) continue;

        // Pair interaction cooldown (45 ticks between conversations with the same person)
        if (ent._lastSpokeWith && ent._lastSpokeWith[other.id] && (currentTick - ent._lastSpokeWith[other.id] < 45)) {
          continue;
        }

        const dist = Math.abs(other.x - ent.x) + Math.abs(other.y - ent.y);
        if (dist <= talkRange) {
          ent._lastTalkTick = currentTick;
          other._lastTalkTick = currentTick;
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

  // Register conversation cooldown between this specific pair
  if (!speaker._lastSpokeWith) speaker._lastSpokeWith = {};
  if (!listener._lastSpokeWith) listener._lastSpokeWith = {};
  speaker._lastSpokeWith[listener.id] = currentTick;
  listener._lastSpokeWith[speaker.id] = currentTick;

  const spkAffToLis = spkBrain.affinities[listener.id] || 0;
  const lisAffToSpk = lisBrain.affinities[speaker.id] !== undefined ? lisBrain.affinities[speaker.id] : 0;
  const dist = Math.abs(speaker.x - listener.x) + Math.abs(speaker.y - listener.y);

  // 1. Romantic Courtship & Couple Proposal (Namoro / Casamento)
  const spkMono = speaker.properties.monogamy;
  const lisMono = listener.properties.monogamy;
  if (spkMono && lisMono && !spkMono.partnerId && !lisMono.partnerId && dist <= 2) {
    const isCompatible = isSexuallyCompatible(speaker, listener);
    if (isCompatible && spkAffToLis >= 45 && spkMono.proposalCooldown <= 0 && Math.random() < 0.20) {
      const acceptProb = Math.max(0.0, Math.min(1.0, (lisAffToSpk - 20) / 35));
      if (Math.random() < acceptProb && lisAffToSpk >= 30) {
        // ACCEPTED!
        spkMono.partnerId = listener.id;
        lisMono.partnerId = speaker.id;
        spkBrain.affinities[listener.id] = 95;
        lisBrain.affinities[speaker.id] = 95;
        spkBrain.mood = Math.min(100, spkBrain.mood + 50);
        lisBrain.mood = Math.min(100, lisBrain.mood + 50);

        speaker.emote = 1; // Excited
        listener.emote = 2; // Happy

        spkBrain.addLongTerm({ type: "BOND", desc: `Formed a romantic couple bond with ${listener.properties.name}` });
        lisBrain.addLongTerm({ type: "BOND", desc: `Formed a romantic couple bond with ${speaker.properties.name}` });

        // Couple Home & Room Sharing (Married couples live together in one shared house)
        if (entities) {
          const spkHouse = entities.find(e => !e.destroyed && e.properties.house && (e.properties.house.ownerId === speaker.id || e.properties.house.partnerId === speaker.id));
          const lisHouse = entities.find(e => !e.destroyed && e.properties.house && (e.properties.house.ownerId === listener.id || e.properties.house.partnerId === listener.id));
          if (spkHouse && lisHouse && spkHouse !== lisHouse) {
            // Merge into speaker's house; free listener's house for future clan members
            spkHouse.properties.house.partnerId = listener.id;
            spkHouse.properties.house.partnerName = listener.properties.name;
            spkHouse.properties.name = `Casa de ${speaker.properties.name} & ${listener.properties.name}`;
            lisHouse.properties.house.ownerId = null;
            lisHouse.properties.house.ownerName = null;
            lisHouse.properties.house.partnerId = null;
            lisHouse.properties.house.partnerName = null;
            lisHouse.properties.name = "Casa Vaga";
          } else if (spkHouse) {
            spkHouse.properties.house.partnerId = listener.id;
            spkHouse.properties.house.partnerName = listener.properties.name;
            spkHouse.properties.name = `Casa de ${speaker.properties.name} & ${listener.properties.name}`;
          } else if (lisHouse) {
            lisHouse.properties.house.partnerId = speaker.id;
            lisHouse.properties.house.partnerName = speaker.properties.name;
            lisHouse.properties.name = `Casa de ${listener.properties.name} & ${speaker.properties.name}`;
          }
        }

        recordWorldEvent({
          opcode: OP_PROPOSAL_ACCEPTED,
          primaryEntityId: speaker.id,
          secondaryEntityId: listener.id,
          location: { x: speaker.x, y: speaker.y },
          tick: currentTick,
          timestamp: world?.clock ? { day: world.clock.day, hour: world.clock.hour, minute: world.clock.minute } : null,
          metadata: { primaryName: speaker.properties.name, secondaryName: listener.properties.name }
        });
        return;
      } else {
        // REJECTED (Heartbreak!)
        spkMono.proposalCooldown = 600.0;
        spkBrain.mood = Math.max(-100, spkBrain.mood - 50);
        spkBrain.affinities[listener.id] = Math.max(-100, spkAffToLis - 35);
        lisBrain.affinities[speaker.id] = Math.max(-100, lisAffToSpk - 20);

        speaker.emote = 5; // Sad
        listener.emote = 10; // Upset

        spkBrain.addLongTerm({ type: "HEARTBREAK", desc: `Was painfully rejected when proposing to ${listener.properties.name}` });

        recordWorldEvent({
          opcode: OP_PROPOSAL_REJECTED,
          primaryEntityId: speaker.id,
          secondaryEntityId: listener.id,
          location: { x: speaker.x, y: speaker.y },
          tick: currentTick,
          timestamp: world?.clock ? { day: world.clock.day, hour: world.clock.hour, minute: world.clock.minute } : null,
          metadata: { primaryName: speaker.properties.name, secondaryName: listener.properties.name }
        });
        return;
      }
    }
  }

  // 2. Physical & Emotional Social Interactions (Only occasional, picked exclusively)
  if (dist <= 1) {
    // Check Traitor / Infidelity vs Monogamy
    const spkPartnerId = spkMono?.partnerId;
    const isCheating = spkPartnerId && spkPartnerId !== listener.id;

    // A. Kiss (Beijar)
    if (spkAffToLis >= 55 && (spkMono?.partnerId === listener.id || Math.random() < 0.18)) {
      if (lisAffToSpk >= 45 || lisMono?.partnerId === speaker.id) {
        spkBrain.affinities[listener.id] = Math.min(100, spkAffToLis + 3);
        lisBrain.affinities[speaker.id] = Math.min(100, lisAffToSpk + 3);
        spkBrain.mood = Math.min(100, spkBrain.mood + 12);
        lisBrain.mood = Math.min(100, lisBrain.mood + 12);
        speaker.emote = 2; // Happy
        listener.emote = 2; // Happy

        // Infidelity reaction
        if (isCheating && entities) {
          if (!speaker.properties.traira) {
            spkBrain.mood = Math.max(-100, spkBrain.mood - 25); // Guilt
          }
          const pEnt = getEntityById(spkPartnerId);
          const partner = (pEnt && !pEnt.destroyed) ? pEnt : null;
          if (partner && Math.abs(partner.x - speaker.x) <= 12 && Math.abs(partner.y - speaker.y) <= 12) {
            partner.properties.brain.mood = Math.max(-100, (partner.properties.brain?.mood || 0) - 40);
            partner.properties.brain.affinities[speaker.id] = Math.max(-100, (partner.properties.brain.affinities[speaker.id] || 0) - 40);
            partner.emote = 5; // Sad
          }
        }

        recordWorldEvent({
          opcode: OP_KISS,
          primaryEntityId: speaker.id,
          secondaryEntityId: listener.id,
          location: { x: speaker.x, y: speaker.y },
          tick: currentTick,
          timestamp: world?.clock ? { day: world.clock.day, hour: world.clock.hour, minute: world.clock.minute } : null,
          metadata: { primaryName: speaker.properties.name, secondaryName: listener.properties.name, rejected: false }
        });
        return;
      }
    }

    // B. Hug (Abraçar)
    if (spkAffToLis >= 35 && Math.random() < 0.18) {
      if (lisAffToSpk >= 15 && lisBrain.mood > -25) {
        spkBrain.affinities[listener.id] = Math.min(100, spkAffToLis + 2.0);
        lisBrain.affinities[speaker.id] = Math.min(100, lisAffToSpk + 2.0);
        spkBrain.mood = Math.min(100, spkBrain.mood + 6);
        lisBrain.mood = Math.min(100, lisBrain.mood + 6);
        speaker.emote = 2; // Happy
        listener.emote = 2; // Happy

        recordWorldEvent({
          opcode: OP_HUG,
          primaryEntityId: speaker.id,
          secondaryEntityId: listener.id,
          location: { x: speaker.x, y: speaker.y },
          tick: currentTick,
          timestamp: world?.clock ? { day: world.clock.day, hour: world.clock.hour, minute: world.clock.minute } : null,
          metadata: { primaryName: speaker.properties.name, secondaryName: listener.properties.name, rejected: false }
        });
        return;
      }
    }

    // C. Praise (Elogiar)
    if (spkAffToLis >= 25 && Math.random() < 0.20) {
      if (lisAffToSpk > -15) {
        spkBrain.affinities[listener.id] = Math.min(100, spkAffToLis + 1.5);
        lisBrain.affinities[speaker.id] = Math.min(100, lisAffToSpk + 1.5);
        spkBrain.mood = Math.min(100, spkBrain.mood + 4);
        lisBrain.mood = Math.min(100, lisBrain.mood + 5);
        speaker.emote = 2; // Happy
        listener.emote = 9; // Smug

        recordWorldEvent({
          opcode: OP_PRAISE,
          primaryEntityId: speaker.id,
          secondaryEntityId: listener.id,
          location: { x: speaker.x, y: speaker.y },
          tick: currentTick,
          timestamp: world?.clock ? { day: world.clock.day, hour: world.clock.hour, minute: world.clock.minute } : null,
          metadata: { primaryName: speaker.properties.name, secondaryName: listener.properties.name, rejected: false }
        });
        return;
      }
    }

    // D. Spit (Cuspir)
    if (spkAffToLis <= -45 && speaker.properties.mouth && Math.random() < 0.18) {
      lisBrain.affinities[speaker.id] = Math.max(-100, lisAffToSpk - 6);
      lisBrain.mood = Math.max(-100, lisBrain.mood - 12);
      speaker.emote = 0; // Angry
      listener.emote = 10; // Upset

      recordWorldEvent({
        opcode: OP_SPIT,
        primaryEntityId: speaker.id,
        secondaryEntityId: listener.id,
        location: { x: speaker.x, y: speaker.y },
        tick: currentTick,
        timestamp: world?.clock ? { day: world.clock.day, hour: world.clock.hour, minute: world.clock.minute } : null,
        metadata: { primaryName: speaker.properties.name, secondaryName: listener.properties.name }
      });
      return;
    }

    // E. Shove / Push (Empurrar)
    if (spkAffToLis <= -30 && Math.random() < 0.18) {
      const pdx = Math.sign(listener.x - speaker.x) || (Math.random() < 0.5 ? 1 : -1);
      const pdy = Math.sign(listener.y - speaker.y);
      const targetX = listener.x + pdx;
      const targetY = listener.y + pdy;

      const mapW = (world && world.width) ? world.width : 512;
      const mapH = (world && world.height) ? world.height : 512;
      if (world && targetX >= 0 && targetX < mapW && targetY >= 0 && targetY < mapH) {
        const t = world.getTile(targetX, targetY);
        const isWall = !!getEntityAtTileByProp(targetX, targetY, "structure");
        if (t !== 5 && !isWall) {
          listener.x = targetX;
          listener.y = targetY;
        }
      }

      lisBrain.affinities[speaker.id] = Math.max(-100, lisAffToSpk - 4);
      lisBrain.mood = Math.max(-100, lisBrain.mood - 10);
      speaker.emote = 0; // Angry
      listener.emote = 3; // Hurt

      recordWorldEvent({
        opcode: OP_SHOVE,
        primaryEntityId: speaker.id,
        secondaryEntityId: listener.id,
        location: { x: speaker.x, y: speaker.y },
        tick: currentTick,
        timestamp: world?.clock ? { day: world.clock.day, hour: world.clock.hour, minute: world.clock.minute } : null,
        metadata: { primaryName: speaker.properties.name, secondaryName: listener.properties.name }
      });
      return;
    }

    // F. Humiliate / Mock (Humilhar)
    if (spkAffToLis <= -30 && (spkBrain.bravery || 0.5) >= (lisBrain.bravery || 0.5) && Math.random() < 0.18) {
      lisBrain.mood = Math.max(-100, lisBrain.mood - 15);
      lisBrain.affinities[speaker.id] = Math.max(-100, lisAffToSpk - 5);
      lisBrain.addLongTerm({ type: "TRAUMA", desc: `Was publicly mocked and humiliated by ${speaker.properties.name}` });
      speaker.emote = 9; // Smug
      listener.emote = 5; // Sad

      recordWorldEvent({
        opcode: OP_HUMILIATE,
        primaryEntityId: speaker.id,
        secondaryEntityId: listener.id,
        location: { x: speaker.x, y: speaker.y },
        tick: currentTick,
        timestamp: world?.clock ? { day: world.clock.day, hour: world.clock.hour, minute: world.clock.minute } : null,
        metadata: { primaryName: speaker.properties.name, secondaryName: listener.properties.name }
      });
      return;
    }

    // G. Insult (Xingar) - Occasional impulse when aggrieved
    if ((spkAffToLis <= -20 || spkBrain.mood < -40) && Math.random() < 0.18) {
      lisBrain.affinities[speaker.id] = Math.max(-100, lisAffToSpk - 2.5);
      lisBrain.mood = Math.max(-100, lisBrain.mood - 6);
      speaker.emote = 0; // Angry
      listener.emote = 10; // Upset

      recordWorldEvent({
        opcode: OP_INSULT,
        primaryEntityId: speaker.id,
        secondaryEntityId: listener.id,
        location: { x: speaker.x, y: speaker.y },
        tick: currentTick,
        timestamp: world?.clock ? { day: world.clock.day, hour: world.clock.hour, minute: world.clock.minute } : null,
        metadata: { primaryName: speaker.properties.name, secondaryName: listener.properties.name }
      });
      return;
    }
  }

  // Same clan mutual affinity boost (+0.2 per positive interaction)
  if (speaker.properties.group && listener.properties.group && speaker.properties.group === listener.properties.group) {
    spkBrain.affinities[listener.id] = Math.min(100, (spkBrain.affinities[listener.id] || 0) + 0.2);
    lisBrain.affinities[speaker.id] = Math.min(100, (lisBrain.affinities[speaker.id] || 0) + 0.2);
  }

  // 3. Group Recruitment & Joining Friends
  if (speaker.properties.group && !listener.properties.group) {
    if (spkAffToLis >= 20 || lisAffToSpk >= 20) {
      tryJoinGroup(listener, speaker.properties.group, entities, speaker);
    }
  } else if (!speaker.properties.group && listener.properties.group) {
    if (spkAffToLis >= 20 || lisAffToSpk >= 20) {
      tryJoinGroup(speaker, listener.properties.group, entities, listener);
    }
  }

  // 4. Group Formation: If both have mutual affinity >= 45 and neither has a group
  if (!speaker.properties.group && !listener.properties.group && spkAffToLis >= 45 && lisAffToSpk >= 45 && Math.random() < 0.25) {
    const zx0 = Math.floor(speaker.x / currentZoneSize);
    const zy0 = Math.floor(speaker.y / currentZoneSize);
    const newGrp = createGroup(gerarNomeGrupo(speaker.properties.name), speaker, [zx0, zy0]);
    newGrp.members.push(listener.id);
    speaker.properties.group = newGrp;
    speaker.properties.group_member = createGroupMemberProp();
    listener.properties.group = newGrp;
    listener.properties.group_member = createGroupMemberProp();

    recordWorldEvent({
      opcode: OP_RELATION,
      primaryEntityId: speaker.id,
      secondaryEntityId: listener.id,
      location: { x: speaker.x, y: speaker.y },
      description: `${speaker.properties.name} e ${listener.properties.name} uniram laços e fundaram a facção '${newGrp.name}'!`,
      tick: currentTick,
      timestamp: world?.clock ? { day: world.clock.day, hour: world.clock.hour, minute: world.clock.minute } : null,
      metadata: { primaryName: speaker.properties.name, secondaryName: listener.properties.name }
    });
    return;
  }

  // 4. Deep Social & Romantic Interactions (Admiration, Flattery, Jealousy, Consolation, Gossip, Territory Sharing)
  const spkPartnerId = spkMono?.partnerId;
  const lisPartnerId = lisMono?.partnerId;
  const isCheating = spkPartnerId && spkPartnerId !== listener.id;

  // A. Jealousy & Rivalry Confrontation (Ciúmes / Traição / Conflito Amoroso)
  if (spkPartnerId && !isCheating && lisPartnerId === spkPartnerId && speaker.id !== listener.id) {
    // Both are attached or pursuing the same partner!
    spkBrain.affinities[listener.id] = Math.max(-100, spkAffToLis - 30);
    lisBrain.affinities[speaker.id] = Math.max(-100, lisAffToSpk - 30);
    speaker.emote = 0; // Angry
    listener.emote = 10; // Upset
    const pEnt = getEntityById(spkPartnerId);
    const pName = pEnt?.properties?.name || "their partner";

    recordWorldEvent({
      opcode: OP_DIALOGUE,
      type: "DIALOGUE",
      primaryEntityId: speaker.id,
      secondaryEntityId: listener.id,
      location: { x: speaker.x, y: speaker.y },
      description: `${speaker.properties.name} confronted ${listener.properties.name} with intense jealousy over their rivalry for ${pName}!`,
      tick: currentTick,
      timestamp: world?.clock ? { day: world.clock.day, hour: world.clock.hour, minute: world.clock.minute } : null,
      metadata: { primaryName: speaker.properties.name, secondaryName: listener.properties.name, topic: "jealousy" }
    });
    return;
  }

  // B. Sharing Geographic & Territory Knowledge (Troca de Conhecimento sobre o Mundo e Zonas)
  if (Math.random() < 0.25 && spkBrain.geoMemory) {
    const knownZones = Object.entries(spkBrain.geoMemory).filter(([k, z]) => z && z.affinity > 10);
    if (knownZones.length > 0) {
      const [zk, zInfo] = knownZones[Math.floor(Math.random() * knownZones.length)];
      if (!lisBrain.geoMemory[zk]) {
        lisBrain.geoMemory[zk] = { zx: zInfo.zx, zy: zInfo.zy, affinity: Math.round(zInfo.affinity * 0.5), timeSpent: 0, lastVisitedTick: currentTick };
      } else {
        lisBrain.geoMemory[zk].affinity = Math.min(100, lisBrain.geoMemory[zk].affinity + 5);
      }
      spkBrain.affinities[listener.id] = Math.min(100, spkAffToLis + 1.0);
      lisBrain.affinities[speaker.id] = Math.min(100, lisAffToSpk + 1.0);

      recordWorldEvent({
        opcode: OP_DIALOGUE,
        type: "DIALOGUE",
        primaryEntityId: speaker.id,
        secondaryEntityId: listener.id,
        location: { x: speaker.x, y: speaker.y },
        description: `${speaker.properties.name} shared geographic knowledge with ${listener.properties.name} about territory zone [${zInfo.zx}, ${zInfo.zy}]!`,
        tick: currentTick,
        timestamp: world?.clock ? { day: world.clock.day, hour: world.clock.hour, minute: world.clock.minute } : null,
        metadata: { primaryName: speaker.properties.name, secondaryName: listener.properties.name, zone: zk }
      });
      return;
    }
  }

  // C. Consolation / Moral Support in hard times (Apoio Mútuo quando alguém está triste/traumatizado)
  if (lisBrain.mood < -20 && spkAffToLis > 15 && Math.random() < 0.35) {
    lisBrain.mood = Math.min(100, lisBrain.mood + 18);
    spkBrain.mood = Math.min(100, spkBrain.mood + 6);
    lisBrain.affinities[speaker.id] = Math.min(100, lisAffToSpk + 4);
    speaker.emote = 2; // Happy
    listener.emote = 2; // Relieved

    recordWorldEvent({
      opcode: OP_DIALOGUE,
      type: "DIALOGUE",
      primaryEntityId: speaker.id,
      secondaryEntityId: listener.id,
      location: { x: speaker.x, y: speaker.y },
      description: `${speaker.properties.name} offered warm comfort and moral support to ${listener.properties.name} during difficult times!`,
      tick: currentTick,
      timestamp: world?.clock ? { day: world.clock.day, hour: world.clock.hour, minute: world.clock.minute } : null,
      metadata: { primaryName: speaker.properties.name, secondaryName: listener.properties.name, topic: "consolation" }
    });
    return;
  }

  // D. Birthdate / Age - Rare occasional mention (only ~3% chance)
  if (Math.random() < 0.03 && speaker.properties.birthDate) {
    const b = speaker.properties.birthDate;
    const currentDay = world?.clock?.day || b.day;
    const ageDays = Math.max(0, currentDay - b.day);
    const birthDesc = `${speaker.properties.name} shared with ${listener.properties.name}: "I was born on Day ${b.day} (${ageDays} days ago)!"`;

    lisBrain.addShortTerm({
      type: "BIRTHDATE_HEARD",
      desc: `Learned that ${speaker.properties.name} was born on Day ${b.day}`,
      targetId: speaker.id
    });

    recordWorldEvent({
      opcode: OP_DIALOGUE,
      type: "DIALOGUE",
      primaryEntityId: speaker.id,
      secondaryEntityId: listener.id,
      location: { x: speaker.x, y: speaker.y },
      description: birthDesc,
      tick: currentTick,
      timestamp: world?.clock ? { day: world.clock.day, hour: world.clock.hour, minute: world.clock.minute } : null,
      metadata: { primaryName: speaker.properties.name, secondaryName: listener.properties.name, birthDay: b.day, ageDays }
    });
    return;
  }

  // E. Casual World & Weather Observation
  if (Math.random() < 0.10) {
    const timeOfDay = (world?.clock?.globalLight ?? 1) >= 0.5 ? "day" : "night";
    const casualPhrases = [
      `complained about the endless ${timeOfDay}.`,
      `remarked how beautiful the ${timeOfDay} is today.`,
      `wondered if it will rain soon.`,
      `said the air smells strange today.`,
      `talked about the stars and the moon.`,
      `wished the sun was warmer.`,
      `shared a strange dream they had last night.`,
      `mentioned their feet were hurting from all the walking.`,
      `asked ${listener.properties.name} if they heard a strange noise in the woods.`,
      `complained about being incredibly hungry.`,
      `talked about their favorite type of roasted meat.`
    ];
    const phrase = casualPhrases[Math.floor(Math.random() * casualPhrases.length)];
    recordWorldEvent({
      opcode: OP_DIALOGUE,
      type: "DIALOGUE",
      primaryEntityId: speaker.id,
      secondaryEntityId: listener.id,
      location: { x: speaker.x, y: speaker.y },
      description: `${speaker.properties.name} ${phrase}`,
      tick: currentTick,
      timestamp: world?.clock ? { day: world.clock.day, hour: world.clock.hour, minute: world.clock.minute } : null,
      metadata: { primaryName: speaker.properties.name, secondaryName: listener.properties.name, topic: "casual" }
    });
    return;
  }

  // 5. Truthful Organic Memory Sharing & Strategic Slander
  const isLiar = !!speaker.properties.liar;
  const lieChance = isLiar ? (speaker.properties.liar.type === "manipulator" ? 0.35 : 0.20) : 0.06;
  const wantsToLie = Math.random() < lieChance;

  if (wantsToLie) {
    createAndTransmitLie(speaker, listener, world, entities);
  } else if (spkBrain.longTermMemory.length > 0) {
    transmitTruthfulGossip(speaker, listener, world, entities);
  } else if (spkBrain.shortTermMemory.length > 0) {
    // If no long term memories yet, share recent short-term observations organically!
    const recentMem = spkBrain.shortTermMemory[Math.floor(Math.random() * spkBrain.shortTermMemory.length)];
    if (recentMem && recentMem.desc) {
      recordWorldEvent({
        opcode: OP_DIALOGUE,
        type: "DIALOGUE",
        primaryEntityId: speaker.id,
        secondaryEntityId: listener.id,
        location: { x: speaker.x, y: speaker.y },
        description: `${speaker.properties.name} told ${listener.properties.name}: "I recently witnessed ${recentMem.desc}!"`,
        tick: currentTick,
        timestamp: world?.clock ? { day: world.clock.day, hour: world.clock.hour, minute: world.clock.minute } : null,
        metadata: { primaryName: speaker.properties.name, secondaryName: listener.properties.name }
      });
    }
  }

  // 5. Bystander / Eavesdropping Perception (Nearby witnesses observe interaction)
  if (entities) {
    for (const witness of entities) {
      if (witness === speaker || witness === listener || witness.destroyed || !witness.properties?.brain) continue;
      const wdist = Math.abs(witness.x - speaker.x) + Math.abs(witness.y - speaker.y);
      if (wdist <= 3 && Math.random() < 0.20) {
        witness.properties.brain.addShortTerm({
          type: "OBSERVED_DIALOGUE",
          desc: `Saw ${speaker.properties.name} and ${listener.properties.name} exchanging whispers`,
          location: { x: speaker.x, y: speaker.y }
        });
      }
    }
  }
}

export function createAndTransmitLie(speaker, listener, world, entities) {
  const spkBrain = speaker.properties.brain;
  const lisBrain = listener.properties.brain;
  if (!spkBrain || !lisBrain) return;

  const isLiarTrait = !!speaker.properties.liar;

  // Check if speaker already knows a lie in memory to re-spread
  const knownLieMem = spkBrain.longTermMemory.find(m => m && m.isLie && m.lieEventId) ||
                      spkBrain.shortTermMemory.find(m => m && m.isLie && m.lieEventId);

  let lieEvent = null;
  let accusedTarget = null;
  let narrative = "";
  let realEventId = null;
  let lieType = "FRAME_JOB";
  let speakerBelievesLie = false;
  let originalLiarId = speaker.properties.liar?.originalLiarId || (knownLieMem ? knownLieMem.originalLiarId : null);

  if (knownLieMem && Math.random() < 0.55) {
    const existingEv = getEventById(knownLieMem.lieEventId);
    if (existingEv) {
      lieEvent = existingEv;
      realEventId = existingEv.metadata?.realEventId || null;
      lieType = existingEv.metadata?.lieType || "RUMOR";
      accusedTarget = existingEv.secondaryEntityId ? entities?.find(e => e.id === existingEv.secondaryEntityId) : null;
      narrative = `${speaker.properties.name} repeated the rumor to ${listener.properties.name}: "${existingEv.description}"`;
      if (!originalLiarId) originalLiarId = existingEv.primaryEntityId;
      speakerBelievesLie = true;
    }
  }

  if (!lieEvent) {
    // Gather entities known to the speaker (through affinities, memories, clan, or partner)
    const knownIds = new Set();
    if (spkBrain.affinities) {
      for (const idStr of Object.keys(spkBrain.affinities)) {
        const nid = parseInt(idStr, 10);
        if (nid && nid !== speaker.id && nid !== listener.id) knownIds.add(nid);
      }
    }
    for (const mem of (spkBrain.longTermMemory || [])) {
      if (mem && mem.targetId && mem.targetId !== speaker.id && mem.targetId !== listener.id) knownIds.add(mem.targetId);
      if (mem && mem.primaryEntityId && mem.primaryEntityId !== speaker.id && mem.primaryEntityId !== listener.id) knownIds.add(mem.primaryEntityId);
    }
    for (const mem of (spkBrain.shortTermMemory || [])) {
      if (mem && mem.targetId && mem.targetId !== speaker.id && mem.targetId !== listener.id) knownIds.add(mem.targetId);
    }
    if (speaker.properties.group?.members) {
      for (const mid of speaker.properties.group.members) {
        if (mid !== speaker.id && mid !== listener.id) knownIds.add(mid);
      }
    }
    if (speaker.properties.monogamy?.partnerId && speaker.properties.monogamy.partnerId !== listener.id) {
      knownIds.add(speaker.properties.monogamy.partnerId);
    }

    // Filter candidate targets: MUST be known living creatures
    const candidateLivingKnown = [];
    for (const id of knownIds) {
      const e = getEntityById(id);
      if (e && !e.destroyed && e.properties?.life && e.properties?.brain && e.properties?.species !== "item" && e.properties?.name) {
        candidateLivingKnown.push(e);
      }
    }

    if (!isLiarTrait) {
      // NORMAL CREATURE: Lies must be purposeful based on affinities (slander enemy or exalt friend/self)
      if (candidateLivingKnown.length === 0) return; // No known people to talk about!

      // Check for an enemy to diminish / slander (affinity < -15)
      const enemies = candidateLivingKnown.filter(e => (spkBrain.affinities[e.id] || 0) < -15);
      // Check for a friend or self to praise / exalt (affinity > 20)
      const friends = candidateLivingKnown.filter(e => (spkBrain.affinities[e.id] || 0) > 20);

      if (enemies.length > 0 && (friends.length === 0 || Math.random() < 0.65)) {
        // Purpose: Slander / Diminish an enemy
        accusedTarget = enemies[Math.floor(Math.random() * enemies.length)];
        const targetName = accusedTarget.properties.name;
        lieType = "PURPOSEFUL_SLANDER";
        const slanderTemplates = [
          `spread the malicious rumor that ${targetName} committed treason and stole clan resources!`,
          `falsely accused ${targetName} of fleeing in panic and acting like a vile coward!`,
          `slandered ${targetName}, claiming they were humiliated and easily defeated in battle!`,
          `whispered that ${targetName} eats dirt when no one is looking!`,
          `claimed ${targetName} secretly worships forbidden entities in the dark!`,
          `started a rumor that ${targetName} sleeps during their guard shifts!`
        ];
        narrative = `${speaker.properties.name} ${slanderTemplates[Math.floor(Math.random() * slanderTemplates.length)]}`;
      } else if (friends.length > 0 || Math.random() < 0.50) {
        // Purpose: Exalt / Glorify a friend or self
        const exaltSelf = Math.random() < 0.40 || friends.length === 0;
        accusedTarget = exaltSelf ? speaker : friends[Math.floor(Math.random() * friends.length)];
        const targetName = accusedTarget.properties.name;
        lieType = "PURPOSEFUL_EXALT";
        const exaltTemplates = [
          `boasted that ${targetName} single-handedly vanquished a monstrous beast in heroic combat!`,
          `fabricated a legend that ${targetName} discovered a blessed sacred relic!`,
          `swore they saw ${targetName} lift a boulder with one hand!`,
          `claimed ${targetName} has the wisdom of ancient kings!`,
          `spread a tall tale that ${targetName} can communicate with the wind!`,
          `told everyone that ${targetName} never misses a strike in battle!`
        ];
        narrative = `${speaker.properties.name} ${exaltTemplates[Math.floor(Math.random() * exaltTemplates.length)]}`;
      } else {
        return; // No purposeful emotional motive to fabricate a lie
      }
    } else {
      // CAREER LIAR (MANIPULATOR): Can fabricate purposeful or chaotic lies, but only against known living creatures
      accusedTarget = candidateLivingKnown.length > 0 ? candidateLivingKnown[Math.floor(Math.random() * candidateLivingKnown.length)] : null;
      if (!accusedTarget) accusedTarget = listener; // default to conversation partner if no other known

      const targetName = accusedTarget.properties?.name || "a traveler";
      const recentRealEvents = allEvents.slice(-40).filter(e => e.opcode === OP_ATTACK || e.opcode === OP_DEATH || e.opcode === OP_AMPUTATION || e.opcode === OP_INSULT);
      const realEv = recentRealEvents.length > 0 ? recentRealEvents[Math.floor(Math.random() * recentRealEvents.length)] : null;

      if (realEv && Math.random() < 0.50) {
        lieType = "FRAME_JOB";
        realEventId = realEv.id;
        narrative = `${speaker.properties.name} falsely accused ${targetName} of being the culprit in event #${realEv.id} (${realEv.description})!`;
      } else {
        const manipulatorLies = [
          { type: "FABRICATED_MURDER", text: `falsely claimed that ${targetName} murdered an innocent in cold blood!` },
          { type: "FABRICATED_DEATH", text: `spread a fake rumor that ${targetName} was slain in the wilderness!` },
          { type: "FABRICATED_BIRTH", text: `gossiped that ${targetName} had a secret illegitimate child!` },
          { type: "FABRICATED_ATTACK", text: `claimed that ${targetName} secretly betrayed the clan!` },
          { type: "FABRICATED_STEAL", text: `swore they saw ${targetName} stealing food from the warehouse in the dead of night!` },
          { type: "FABRICATED_CURSE", text: `told everyone that ${targetName} is cursed and brings bad luck to the village!` }
        ];
        const chosen = manipulatorLies[Math.floor(Math.random() * manipulatorLies.length)];
        lieType = chosen.type;
        narrative = `${speaker.properties.name} ${chosen.text}`;
      }
    }

    lieEvent = recordWorldEvent({
      opcode: OP_LIE,
      primaryEntityId: speaker.id,
      secondaryEntityId: accusedTarget?.id || null,
      location: { x: speaker.x, y: speaker.y },
      tick: currentTick,
      timestamp: world?.clock ? { day: world.clock.day, hour: world.clock.hour, minute: world.clock.minute } : null,
      metadata: {
        primaryName: speaker.properties.name,
        secondaryName: accusedTarget?.properties?.name || "Target",
        lieType,
        realEventId,
        citedEventId: realEventId,
        narrative,
        believedBy: speakerBelievesLie ? [speaker.id] : [],
        disbelievedBy: []
      }
    });
  }

  // Check if someone present knows the true version of this event (Witness / Truth Knower)
  let truthKnower = null;
  if (realEventId && entities) {
    for (const ent of entities) {
      if (ent.destroyed || !ent.properties?.brain) continue;
      const distToConversation = Math.abs(ent.x - speaker.x) + Math.abs(ent.y - speaker.y);
      if (distToConversation <= 3) {
        const knowsTruth = ent.properties.brain.longTermMemory.some(m => m.eventId === realEventId) ||
                           ent.properties.brain.shortTermMemory.some(m => m.eventId === realEventId);
        if (knowsTruth && ent !== speaker) {
          truthKnower = ent;
          break;
        }
      }
    }
  }

  // If a truth-knower is present, they immediately lose affinity with the speaker and may confront them!
  if (truthKnower) {
    truthKnower.properties.brain.affinities[speaker.id] = Math.max(-100, (truthKnower.properties.brain.affinities[speaker.id] || 0) - 8);
    const willConfront = Math.random() < 0.70;

    if (willConfront) {
      const realEvObj = getEventById(realEventId);
      const truthDesc = realEvObj ? realEvObj.description : "the true facts of the event";

      // If speaker was just a believer or schizo, they were misinformed or delusional
      if (speaker.properties.liar?.type === "believer" || speakerBelievesLie || (knownLieMem && originalLiarId && originalLiarId !== speaker.id)) {
        const victimLiarId = originalLiarId || speaker.properties.liar?.originalLiarId;
        if (victimLiarId && victimLiarId !== speaker.id) {
          spkBrain.affinities[victimLiarId] = Math.max(-100, (spkBrain.affinities[victimLiarId] || 0) - 35);
          spkBrain.mood = Math.max(-100, spkBrain.mood - 20);
          const origLiarEnt = entities?.find(e => e.id === victimLiarId);
          const origName = origLiarEnt?.properties?.name || `Entity #${victimLiarId}`;
          spkBrain.addLongTerm({
            type: "BETRAYAL",
            desc: `Realized ${origName} maliciously deceived me with a fake lie about ${accusedTarget?.properties?.name || 'an innocent'}!`
          });
        }
        if (speaker.properties.liar?.type === "believer") speaker.properties.liar = null;
        speaker.emote = 10; // Shocked/Upset
      } else {
        // Speaker was a deliberate manipulator caught red-handed!
        spkBrain.affinities[truthKnower.id] = Math.max(-100, (spkBrain.affinities[truthKnower.id] || 0) - 15);
        spkBrain.mood = Math.max(-100, spkBrain.mood - 15);
        speaker.emote = 5; // Caught
      }

      truthKnower.emote = 0; // Angry

      recordWorldEvent({
        opcode: OP_DIALOGUE,
        primaryEntityId: truthKnower.id,
        secondaryEntityId: speaker.id,
        location: { x: speaker.x, y: speaker.y },
        description: `${truthKnower.properties.name} publicly confronted ${speaker.properties.name}, correcting their false rumor with the truth: "${truthDesc}"!`,
        tick: currentTick,
        timestamp: world?.clock ? { day: world.clock.day, hour: world.clock.hour, minute: world.clock.minute } : null,
        metadata: {
          primaryName: truthKnower.properties.name,
          secondaryName: speaker.properties.name,
          referencedEventId: realEventId,
          citedEventId: realEventId,
          text: `${truthKnower.properties.name} publicly confronted ${speaker.properties.name} with the truth!`
        }
      });

      // Listener decides whether to believe the truthKnower or speaker
      const lisAffToKnower = lisBrain.affinities[truthKnower.id] || 0;
      const lisAffToSpeaker = lisBrain.affinities[speaker.id] || 0;
      if (lisAffToKnower >= lisAffToSpeaker - 10) {
        lisBrain.affinities[speaker.id] = Math.max(-100, lisAffToSpeaker - 10);
        lisBrain.affinities[truthKnower.id] = Math.min(100, lisAffToKnower + 3);
        listener.emote = 9;
        return;
      }
    }
  }

  // Calculate Belief vs Skepticism:
  const lisAffToSpk = lisBrain.affinities[speaker.id] || 0;
  const lisAffToTarget = accusedTarget ? (lisBrain.affinities[accusedTarget.id] || 0) : 0;

  const baseTrust = 0.50;
  const trustMod = (lisAffToSpk / 100) * 0.25;
  let confirmationMod = 0;
  if (accusedTarget) {
    if (lisAffToTarget < 0) {
      confirmationMod = (Math.abs(lisAffToTarget) / 100) * 0.20; // confirmation bias against enemy
    } else if (lisAffToTarget > 0) {
      confirmationMod = -(lisAffToTarget / 100) * 0.30; // skepticism protecting friend
    }
  }

  let perkMod = 0;
  if (listener.properties.skeptic) perkMod -= 0.35;
  if (listener.properties.gullible) perkMod += 0.35;

  const beliefProb = Math.max(0.05, Math.min(0.95, baseTrust + trustMod + confirmationMod + perkMod));
  const didBelieve = Math.random() < beliefProb;

  if (didBelieve) {
    // Believed!
    lisBrain.addShortTerm({
      type: "RUMOR",
      isLie: true,
      lieEventId: lieEvent.id,
      originalLiarId: speaker.id,
      desc: `Believed rumor from ${speaker.properties.name}: "${narrative}"`,
      location: { x: speaker.x, y: speaker.y }
    });
    if (Math.random() < 0.35) {
      lisBrain.addLongTerm({
        type: "RUMOR",
        isLie: true,
        lieEventId: lieEvent.id,
        originalLiarId: speaker.id,
        desc: `Recalls rumor from ${speaker.properties.name}: "${narrative}"`
      });
    }

    if (accusedTarget && accusedTarget.id !== speaker.id) {
      lisBrain.affinities[accusedTarget.id] = Math.max(-100, lisAffToTarget - 12);
    }
    lisBrain.affinities[speaker.id] = Math.min(100, lisAffToSpk + 2);
    spkBrain.mood = Math.min(100, spkBrain.mood + 6);
    if (speaker.properties.liar) speaker.properties.liar.lieCount = (speaker.properties.liar.lieCount || 0) + 1;

    speaker.emote = 9; // Smug
    listener.emote = 10; // Shocked/Upset

    if (lieEvent.metadata && Array.isArray(lieEvent.metadata.believedBy)) {
      if (!lieEvent.metadata.believedBy.includes(listener.id)) lieEvent.metadata.believedBy.push(listener.id);
    }
  } else {
    // Disbelieved (Caught in a lie!)
    lisBrain.addShortTerm({
      type: "DISHONESTY",
      desc: `Caught ${speaker.properties.name} telling a false rumor about ${accusedTarget?.properties?.name || 'someone'}`,
      location: { x: speaker.x, y: speaker.y }
    });
    lisBrain.addLongTerm({
      type: "DISHONESTY",
      desc: `Knows ${speaker.properties.name} is a dishonest person who spreads rumors`
    });

    lisBrain.affinities[speaker.id] = Math.max(-100, lisAffToSpk - 15);
    lisBrain.mood = Math.max(-100, lisBrain.mood - 8);
    spkBrain.mood = Math.max(-100, spkBrain.mood - 10);

    speaker.emote = 5; // Sad/Caught
    listener.emote = 0; // Angry

    if (lieEvent.metadata && Array.isArray(lieEvent.metadata.disbelievedBy)) {
      if (!lieEvent.metadata.disbelievedBy.includes(listener.id)) lieEvent.metadata.disbelievedBy.push(listener.id);
    }
  }
}

export function transmitTruthfulGossip(speaker, listener, world, entities) {
  const spkBrain = speaker.properties.brain;
  const lisBrain = listener.properties.brain;
  if (!spkBrain || !lisBrain) return;

  if (spkBrain.longTermMemory.length === 0) return;
  const mem = spkBrain.longTermMemory[Math.floor(Math.random() * spkBrain.longTermMemory.length)];

  // If the memory happens to be a believed lie, the believer shares it genuinely as truth!
  if (mem.isLie) {
    createAndTransmitLie(speaker, listener, world, entities);
    return;
  }

  const gossipDesc = mem.desc || mem.description || `${mem.type} event`;

  // Third-party affinity influence
  if (mem.targetId) {
    const curTargetAff = lisBrain.affinities[mem.targetId] || 0;
    if (mem.type === "ATTACK" || mem.type === "AMPUTATION" || mem.type === "INSULT" || mem.type === "TRAUMA") {
      lisBrain.affinities[mem.targetId] = Math.max(-100, curTargetAff - 15);
    } else if (mem.type === "BOND" || mem.type === "MATING" || mem.type === "BIRTH" || mem.type === "PRAISE") {
      lisBrain.affinities[mem.targetId] = Math.min(100, curTargetAff + 12);
    }
  }

  lisBrain.addShortTerm({
    type: "GOSSIP",
    desc: `Heard from ${speaker.properties.name}: "${gossipDesc}"`,
    location: { x: speaker.x, y: speaker.y }
  });

  const citedEventId = mem.eventId || mem.lieEventId || null;

  const dialogueTemplates = [
    `${speaker.properties.name} spoke with ${listener.properties.name}: "Did you hear that ${gossipDesc}?"`,
    `${speaker.properties.name} whispered to ${listener.properties.name}: "I couldn't believe it, but ${gossipDesc}!"`,
    `${speaker.properties.name} recounted to ${listener.properties.name}: "It's the talk of the town that ${gossipDesc}."`,
    `${speaker.properties.name} shared a rumor with ${listener.properties.name}: "Don't tell anyone, but ${gossipDesc}..."`,
    `${speaker.properties.name} discussed with ${listener.properties.name}: "What do you think about the fact that ${gossipDesc}?"`,
    `${speaker.properties.name} excitedly told ${listener.properties.name}: "You won't believe this... ${gossipDesc}!"`
  ];
  
  const chosenDialogue = dialogueTemplates[Math.floor(Math.random() * dialogueTemplates.length)];

  recordWorldEvent({
    opcode: OP_DIALOGUE,
    primaryEntityId: speaker.id,
    secondaryEntityId: listener.id,
    location: { x: speaker.x, y: speaker.y },
    description: chosenDialogue,
    tick: currentTick,
    timestamp: world?.clock ? { day: world.clock.day, hour: world.clock.hour, minute: world.clock.minute } : null,
    metadata: {
      primaryName: speaker.properties.name,
      secondaryName: listener.properties.name,
      text: chosenDialogue,
      gossipedEventId: citedEventId,
      referencedEventId: citedEventId,
      citedEventId: citedEventId
    }
  });
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
  for (const k in ent.properties) { const p = ent.properties[k];
    if ((k.startsWith("arm") || k.startsWith("paw") || k.startsWith("fangs")) && p && p.heldItem && p.heldItem.resourceType) {
      const it = p.heldItem;
      p.heldItem = null;
      let spawned = null;
      if (it.resourceType === "stone") spawned = createStoneItem(ent.x, ent.y);
      else if (it.resourceType === "wood") spawned = createWoodItem(ent.x, ent.y);
      else if (it.resourceType === "seed") spawned = createSeedEntity(ent.x, ent.y, "large", it.seedSpecies || "oak");
      else if (it.resourceType === "fruit") spawned = createFruit(ent.x, ent.y, "large", "oak");
      else if (it.resourceType === "feces") spawned = createPoopEntity(ent.x, ent.y);
      else if (it.resourceType === "meat") {
        spawned = createEntity(
          {
            name: "Game Meat",
            resourceType: "meat",
            render: { skin: "Item_Steak.png", color: 0xffdc5050, backcolor: 0x00000000 },
            edible: { nutrition: 2000, foodType: "meat", digestDuration: 60 },
            lifespan: createLifespanProp(45.0)
          },
          ent.x,
          ent.y
        );
      }
      if (spawned && entities) entities.push(spawned);
      return it;
    }
  }
  return null;
}

/**
 * Wall Entity with Material Variants (Stone, Wood, Mixed)
 */
export function createWallEntity(x, y, groupName = null, style = "stone", boneOwnerName = null) {
  const name = groupName ? `Stone Wall (${groupName})` : "Stone Wall";
  const condition = 6000;
  const defense = 90;
  const woodCost = 0;
  const stoneCost = 2;
  const boneCost = 0;
  const color = 0xfff0f0f8;

  return createEntity(
    {
      name: name,
      species: "structure",
      wallStyle: "stone",
      render: { skin: "Wall_NESW.png", color: color, backcolor: 0x00000000 },
      structure: { condition: condition, maxCondition: condition, defense: defense },
      blocking: true,
      woodCost: woodCost,
      stoneCost: stoneCost,
      boneCost: boneCost,
      woodCurrent: 0,
      stoneCurrent: 0,
      boneCurrent: 0
    },
    x,
    y
  );
}

export function createStoneWallEntity(x, y, groupName = null) {
  return createWallEntity(x, y, groupName, "stone");
}

export function isTileInClaimedZones(x, y, claimedZones) {
  if (!claimedZones || !Array.isArray(claimedZones) || claimedZones.length === 0) return false;
  const zx = Math.floor(x / currentZoneSize);
  const zy = Math.floor(y / currentZoneSize);
  const intKey = (zx << 16) | (zy & 0xffff);

  let fastIntSet = claimedZones._fastIntSet;
  if (!fastIntSet || claimedZones._fastIntVersion !== claimedZones.length) {
    fastIntSet = new Set();
    for (let i = 0; i < claimedZones.length; i++) {
      const k = claimedZones[i];
      if (typeof k === "number") {
        fastIntSet.add(k);
      } else {
        const parts = k.includes("_") ? k.split("_") : k.split(",");
        const cx = parseInt(parts[0], 10) || 0;
        const cy = parseInt(parts[1], 10) || 0;
        fastIntSet.add((cx << 16) | (cy & 0xffff));
      }
    }
    claimedZones._fastIntSet = fastIntSet;
    claimedZones._fastIntVersion = claimedZones.length;
  }

  return fastIntSet.has(intKey);
}

export function isPerimeterEdge(zx, zy, ox, oy, claimedZones) {
  if (!claimedZones || !Array.isArray(claimedZones)) return false;
  const sz = currentZoneSize;
  
  if (oy === 0 && !isTileInClaimedZones(zx * sz, (zy - 1) * sz, claimedZones)) return true;
  if (oy === (sz - 1) && !isTileInClaimedZones(zx * sz, (zy + 1) * sz, claimedZones)) return true;
  if (ox === 0 && !isTileInClaimedZones((zx - 1) * sz, zy * sz, claimedZones)) return true;
  if (ox === (sz - 1) && !isTileInClaimedZones((zx + 1) * sz, zy * sz, claimedZones)) return true;

  return false;
}

export function isLooseGroundItemInTerritory(e, claimedZones) {
  if (!e || e.destroyed) return false;
  if (e.properties?.photosynthesis || e.properties?.deep_root || e.properties?.structure || e.properties?.house || e.properties?.door || e.properties?.warehouse || e.properties?.life || e.properties?.torch || e.properties?.campfire) return false;
  if (!isTileInClaimedZones(e.x, e.y, claimedZones)) return false;
  return !!e.properties?.edible || !!e.properties?.resourceType || !!e.properties?.germination || e.properties?.species === "item" || !!e.properties?.attackBonus || !!e.properties?.isWeapon || !!e.properties?.artifact;
}

// ---------------------------------------------------------------------------
// Creature Torch Management (Standing Furniture Torch & Night Offhand Torch)
// ---------------------------------------------------------------------------

export function manageCreatureTorches(ent, group, world, entities, dt = 0.1) {
  if (!ent || ent.destroyed || !ent.properties?.life || !group) return;

  const curHour = world?.clock ? (world.clock.hour + (world.clock.minute || 0) / 60) : 12;
  const isNight = (curHour >= 17.5 || curHour < 5.8);
  const sz = currentZoneSize || 8;
  const campfireRadius = sz; // 1 full zone coverage
  const torchRadius = Math.max(2, Math.round(sz * 0.25)); // 1/4 zone coverage

  // 1. Gather all active light sources and completed houses in clan territory
  const activeCampfires = [];
  const activeTorches = [];
  const groupHouses = [];

  for (const e of entityRegistry.values()) {
    if (e.destroyed) continue;
    if (isTileInClaimedZones(e.x, e.y, group.claimedZones)) {
      if (e.properties?.campfire && (e.properties.campfire.fuel || 0) > 0) {
        activeCampfires.push(e);
      } else if (e.properties?.torch && (e.properties.torch.fuel || 0) > 0) {
        activeTorches.push(e);
      } else if (e.properties?.house && e.properties.house.isCompleted !== false) {
        groupHouses.push(e);
      }
    }
  }

  // Refuel nearby expired torches if creature is nearby
  for (const t of activeTorches) {
    if ((t.properties.torch.fuel || 0) <= 0 || !t.properties.torch.isLit) {
      if (Math.abs(t.x - ent.x) <= 3 && Math.abs(t.y - ent.y) <= 3) {
        t.properties.torch.fuel = t.properties.torch.maxFuel || 480;
        t.properties.torch.isLit = true;
      }
    }
  }

  // 2. Identify unlit houses (houses lacking light access from either campfire or standing torch)
  const unlitHouses = groupHouses.filter(h => {
    // Check if within campfire radius (1 full zone)
    for (const cf of activeCampfires) {
      const dist = Math.abs(cf.x - h.x) + Math.abs(cf.y - h.y);
      if (dist <= campfireRadius) return false;
    }
    // Check if within existing torch radius (1/4 zone)
    for (const st of activeTorches) {
      const dist = Math.abs(st.x - h.x) + Math.abs(st.y - h.y);
      if (dist <= torchRadius) return false;
    }
    return true;
  });

  // 3. If there are unlit houses, find an optimal placement that illuminates as many unlit houses as possible!
  if (unlitHouses.length > 0 && Math.random() < 0.08) {
    let bestCandidate = null;
    let maxIlluminatedCount = 0;
    let bestDistanceScore = 9999;

    const evaluatedTiles = new Set();

    for (const uh of unlitHouses) {
      // Look for placement 2 to 4 blocks away (not glued to house walls)
      for (let dx = -4; dx <= 4; dx++) {
        for (let dy = -4; dy <= 4; dy++) {
          const manhattan = Math.abs(dx) + Math.abs(dy);
          if (manhattan < 2 || manhattan > 5) continue;

          const tx = uh.x + dx;
          const ty = uh.y + dy;
          const key = `${tx}_${ty}`;
          if (evaluatedTiles.has(key)) continue;
          evaluatedTiles.add(key);

          if (tx < 0 || ty < 0 || (world && (tx >= world.width || ty >= world.height))) continue;
          if (!isTileInClaimedZones(tx, ty, group.claimedZones)) continue;
          if (world && world.getTile(tx, ty) === TILE_WATER) continue;

          // Check if tile is clear of obstacles
          let isOccupied = false;
          for (const e of entityRegistry.values()) {
            if (!e.destroyed && e.x === tx && e.y === ty && (e.properties?.structure || e.properties?.house || e.properties?.tree || e.properties?.cactus || e.properties?.torch || e.properties?.campfire || e.properties?.door)) {
              isOccupied = true;
              break;
            }
          }
          if (isOccupied) continue;

          // Count how many unlit houses this position would illuminate (within torchRadius)
          let illuminatedCount = 0;
          let totalDist = 0;
          for (const targetHouse of unlitHouses) {
            const d = Math.abs(targetHouse.x - tx) + Math.abs(targetHouse.y - ty);
            if (d <= torchRadius) {
              illuminatedCount++;
              totalDist += d;
            }
          }

          if (illuminatedCount > maxIlluminatedCount || (illuminatedCount === maxIlluminatedCount && totalDist < bestDistanceScore)) {
            maxIlluminatedCount = illuminatedCount;
            bestDistanceScore = totalDist;
            bestCandidate = { x: tx, y: ty };
          }
        }
      }
    }

    if (bestCandidate && maxIlluminatedCount > 0) {
      const torchEnt = createTorchEntity(bestCandidate.x, bestCandidate.y, group.id);
      entities.push(torchEnt);
      registerEntitySpatial(torchEnt);
      recordWorldEvent({
        type: "BUILD",
        primaryEntityId: ent.id,
        location: { x: bestCandidate.x, y: bestCandidate.y },
        description: `${ent.properties.name} fincou uma tocha de poste a alguns blocos das casas, iluminando ${maxIlluminatedCount} residências no distrito!`,
        tick: currentTick,
        timestamp: world?.clock ? { day: world.clock.day, hour: world.clock.hour, minute: world.clock.minute } : null
      });
    }
  }

  // 5. Campfire Refueling (Keep active campfires replenished with wood)
  for (const cf of activeCampfires) {
    if (Math.abs(cf.x - ent.x) <= 4 && Math.abs(cf.y - ent.y) <= 4 && ((cf.properties.campfire.fuel || 0) < 250 || !cf.properties.campfire.isLit)) {
      cf.properties.campfire.fuel = cf.properties.campfire.maxFuel || 480;
      break;
    }
  }

  // 6. Offhand Handheld Torch Management for Night/Day & Fuel Burn Rate
  const leftArm = ent.properties.arm_left;
  const rightArm = ent.properties.arm_right;

  const isHoldingTorch = (
    leftArm?.heldItem?.resourceType === "torch" ||
    rightArm?.heldItem?.resourceType === "torch" ||
    ent.properties.heldItem?.resourceType === "torch"
  );

  if (isNight) {
    if (!isHoldingTorch) {
      if (leftArm && !leftArm.heldItem) {
        leftArm.heldItem = createTorchItem(ent.id);
      } else if (rightArm && !rightArm.heldItem) {
        rightArm.heldItem = createTorchItem(ent.id);
      }
    } else {
      // Burn torch fuel while equipped and lit at night
      if (leftArm?.heldItem?.resourceType === "torch") {
        leftArm.heldItem.fuel = Math.max(0, (leftArm.heldItem.fuel || 240) - dt);
        if (leftArm.heldItem.fuel <= 0) {
          leftArm.heldItem = null; // Depleted torch breaks/destroyed
        }
      }
      if (rightArm?.heldItem?.resourceType === "torch") {
        rightArm.heldItem.fuel = Math.max(0, (rightArm.heldItem.fuel || 240) - dt);
        if (rightArm.heldItem.fuel <= 0) {
          rightArm.heldItem = null; // Depleted torch breaks/destroyed
        }
      }
    }
  } else {
    // Extinguish and pack away handheld night torches during daytime
    if (leftArm?.heldItem?.resourceType === "torch" || leftArm?.heldItem?.isTorch) {
      leftArm.heldItem = null;
    }
    if (rightArm?.heldItem?.resourceType === "torch" || rightArm?.heldItem?.isTorch) {
      rightArm.heldItem = null;
    }
  }
}

/**
 * Fluid Group Member Property:
 * Dynamically performs building, mining, crafting, farming, foraging, hunting, hauling,
 * cleaning territory, defending during war, and expanding clan borders without rigid roles.
 */
export function createGroupMemberProp() {
  return {
    actionTimer: 0,
    effect(ent, dt, world, entities) {
      if (!ent.properties.group || !world || !entities) return;

      const group = ent.properties.group;
      manageCreatureTorches(ent, group, world, entities, dt);

      const freeArm = getFreeArm(ent);
      const isCarryingMat = isCarryingItem(ent, "stone") || isCarryingItem(ent, "wood") || isCarryingItem(ent, "bone");
      const isCarryingSeed = isCarryingItem(ent, "seed");
      const isCarryingMeat = isCarryingItem(ent, "meat");
      const isCarryingFeces = isCarryingItem(ent, "feces");
      const isCarryingFood = isCarryingMeat || isCarryingItem(ent, "food") || isCarryingItem(ent, "fruit") || isCarryingItem(ent, "organ") || isCarryingItem(ent, "crop");

      const zx = Math.floor(ent.x / currentZoneSize);
      const zy = Math.floor(ent.y / currentZoneSize);
      const inClaimedZone = isTileInClaimedZones(ent.x, ent.y, group.claimedZones);

      const firstZone = group.claimedZones?.[0] || "32_32";
      const parts = firstZone.includes("_") ? firstZone.split("_") : firstZone.split(",");
      const baseZx = isNaN(parseInt(parts[0], 10)) ? 32 : parseInt(parts[0], 10);
      const baseZy = isNaN(parseInt(parts[1], 10)) ? 32 : parseInt(parts[1], 10);
      const homeBaseX = baseZx * currentZoneSize + Math.floor(currentZoneSize / 2);
      const homeBaseY = baseZy * currentZoneSize + Math.floor(currentZoneSize / 2);
      const distToBase = Math.abs(ent.x - homeBaseX) + Math.abs(ent.y - homeBaseY);

      this.actionTimer = (this.actionTimer || 0) + dt;

      // ---------------------------------------------------------------------
      // 0. CLAN DOMAIN EXPANSION & WAR RESOLUTION EVALUATION (Throttled to Leader once per 25 ticks)
      // ---------------------------------------------------------------------
      if ((ent.id === group.leaderId || !group.leaderId) && (currentTick % 25 === (group.id % 25))) {
        const livingMems = (group.members || []).map(id => {
          const e = getEntityById(id);
          return (e && !e.destroyed && e.properties.life) ? e : null;
        }).filter(Boolean);
        group.maxMembersEver = Math.max(group.maxMembersEver || 0, livingMems.length);

        // Leadership check: prioritize senior living member with highest group affinity/age
        const curL = getEntityById(group.leaderId);
        const isCurLeaderAlive = (curL && !curL.destroyed && curL.properties.life);
        if (!group.leaderId || !isCurLeaderAlive) {
          if (livingMems.length > 0) {
            livingMems.sort((a, b) => (b.properties.life?.age || 0) - (a.properties.life?.age || 0));
            group.leaderId = livingMems[0].id;
            livingMems[0].properties.role = "Leader";
            recordWorldEvent({
              opcode: OP_RELATION,
              type: "SUCCESSION",
              primaryEntityId: livingMems[0].id,
              secondaryEntityId: group.id,
              location: { x: livingMems[0].x, y: livingMems[0].y },
              description: `${livingMems[0].properties.name} assumiu a liderança de '${group.name}' em sucessão honrosa!`,
              tick: currentTick,
              timestamp: world?.clock ? { day: world.clock.day, hour: world.clock.hour, minute: world.clock.minute } : null
            });
          }
        }
        
        // Evaluate clan needs and allocate dynamic profession roles
        evaluateAndAssignClanRoles(group, entities, world);

        // Evaluate Active Wars: Victory when enemy Leader is dead AND > 50% casualties
        if (group.wars && group.wars.length > 0) {
          const allWorldGrps = getAllWorldGroups();
          for (let i = group.wars.length - 1; i >= 0; i--) {
            const enemyGrpId = group.wars[i];
            const enemyGroup = allWorldGrps.find(g => g.id === enemyGrpId);

            if (enemyGroup) {
              const enemyLiving = (enemyGroup.members || []).map(id => {
                const e = getEntityById(id);
                return (e && !e.destroyed && e.properties.life) ? e : null;
              }).filter(Boolean);
              const enemyLeaderDead = !enemyGroup.leaderId || !enemyLiving.some(e => e.id === enemyGroup.leaderId);
              const enemy50PercentCasualties = enemyLiving.length <= Math.floor((enemyGroup.warInitialPop || 4) / 2);

              if (enemyLeaderDead && enemy50PercentCasualties) {
                // Decisive Victory: Annex all territory from the defeated clan
                group.claimedZones = [...new Set([...group.claimedZones, ...enemyGroup.claimedZones])];
                group.wars.splice(i, 1);
                enemyGroup.wars = (enemyGroup.wars || []).filter(id => id !== group.id);

                // Defeated clan disbands permanently and remaining members scatter
                for (const surv of enemyLiving) {
                  delete surv.properties.group;
                  delete surv.properties.group_member;
                }

                recordWorldEvent({
                  type: "KILL",
                  primaryEntityId: ent.id,
                  location: { x: ent.x, y: ent.y },
                  description: `VITÓRIA DECISIVA DE GUERRA! '${group.name}' esmagou '${enemyGroup.name}'! O líder inimigo caiu e suas forças foram reduzidas pela metade. O clã derrotado foi dissolvido e '${group.name}' anexou todo o seu território!`,
                  tick: currentTick,
                  timestamp: world?.clock ? { day: world.clock.day, hour: world.clock.hour, minute: world.clock.minute } : null
                });
              }
            } else {
              group.wars.splice(i, 1);
            }
          }
        }
      }

      // ---------------------------------------------------------------------
      // 1. CLAN COMMUNAL NOURISHMENT (Eat from warehouse or group storage if hungry)
      // ---------------------------------------------------------------------
      const energyRatio = ent.properties.life ? (ent.properties.life.energy / ent.properties.life.max) : 1.0;
      if (energyRatio <= 0.65 && ent.properties.stomach && ent.properties.stomach.items.length < ent.properties.stomach.capacity) {
        const warehouse = getGroupWarehouse(group, entities);
        const distWh = warehouse ? Math.max(Math.abs(warehouse.x - ent.x), Math.abs(warehouse.y - ent.y)) : 999;
        
        if (warehouse && warehouse.properties.warehouse?.isCompleted && distWh <= 2 && warehouse.properties.warehouse.items?.length > 0) {
          const whItems = warehouse.properties.warehouse.items;
          const foodIdx = whItems.findIndex(item => item.foodType || item.edible || item.resourceType === "meat" || item.resourceType === "fruit" || item.name?.includes("Meat") || item.name?.includes("Fruit") || item.name?.includes("Berry") || item.name?.includes("Carne") || item.name?.includes("Fruta") || item.name?.includes("Crop"));
          if (foodIdx !== -1) {
            const consumedFood = whItems.splice(foodIdx, 1)[0];
            const nutrition = consumedFood.nutrition || consumedFood.edible?.nutrition || 3500;
            const fType = consumedFood.foodType || consumedFood.edible?.foodType || (consumedFood.resourceType === "meat" ? "meat" : "fruit");
            ent.properties.stomach.items.push({
              name: consumedFood.name || `Clan Stockpile ${fType}`,
              nutrition: nutrition,
              foodType: fType,
              totalTurns: 80,
              remainingTurns: 80
            });
            recordWorldEvent({
              opcode: OP_FEED,
              type: "FEED",
              primaryEntityId: ent.id,
              location: { x: ent.x, y: ent.y },
              description: `${ent.properties.name} alimentou-se de ${consumedFood.name || fType} do Grande Armazém de '${group.name}'!`,
              tick: currentTick,
              timestamp: world?.clock ? { day: world.clock.day, hour: world.clock.hour, minute: world.clock.minute } : null
            });
          }
        } else if ((inClaimedZone || distToBase <= 4) && group.storage && group.storage.length > 0) {
          const foodIdx = group.storage.findIndex(item => item === "meat" || item === "fruit" || item === "food");
          if (foodIdx !== -1) {
            const consumedFood = group.storage.splice(foodIdx, 1)[0];
            ent.properties.stomach.items.push({
              name: `Clan Stockpile ${consumedFood}`,
              nutrition: consumedFood === "meat" ? 4500 : 3500,
              foodType: consumedFood === "meat" ? "meat" : "fruit",
              totalTurns: 80,
              remainingTurns: 80
            });
            recordWorldEvent({
              opcode: OP_FEED,
              type: "FEED",
              primaryEntityId: ent.id,
              location: { x: ent.x, y: ent.y },
              description: `${ent.properties.name} comeu uma porção de ${consumedFood} do estoque comunal de '${group.name}'!`,
              tick: currentTick,
              timestamp: world?.clock ? { day: world.clock.day, hour: world.clock.hour, minute: world.clock.minute } : null
            });
          }
        }
      }

      // A1. Universal Warehouse & Stockpile Deposit for Any Carried Item (excluding tools, weapons, and equipped torches)
      const warehouse = getGroupWarehouse(group, entities);
      const distWh = warehouse ? Math.max(Math.abs(warehouse.x - ent.x), Math.abs(warehouse.y - ent.y)) : 999;
      if (warehouse && warehouse.properties.warehouse?.isCompleted) {
        // Clean up any rogue torches from warehouse storage
        if (warehouse.properties.warehouse.items && warehouse.properties.warehouse.items.length > 0) {
          warehouse.properties.warehouse.items = warehouse.properties.warehouse.items.filter(it => it && it.resourceType !== "torch" && !it.isTorch && !it.name?.includes("Torch") && !it.name?.includes("Tocha"));
        }
        if (distWh <= 1 && this.actionTimer >= 0.20) {
          for (const k in ent.properties) { const p = ent.properties[k];
            if ((k.startsWith("arm") || k.startsWith("paw") || k.startsWith("fangs")) && p && p.heldItem && !p.heldItem.isWeapon && !p.heldItem.isTool && !p.heldItem.isTorch && p.heldItem.resourceType !== "torch" && !p.heldItem.name?.includes("Torch") && !p.heldItem.name?.includes("Tocha")) {
              if (!warehouse.properties.warehouse.items) warehouse.properties.warehouse.items = [];
              warehouse.properties.warehouse.items.push(p.heldItem);
              p.heldItem = null;
              this.actionTimer = 0;
              ent.emote = 2; // Happy
              break;
            }
          }
        }
      } else if (distToBase <= 2 && this.actionTimer >= 0.20) {
        if (group.storage && group.storage.length > 0) {
          group.storage = group.storage.filter(it => it !== "torch" && it !== "tocha");
        }
        for (const k in ent.properties) { const p = ent.properties[k];
          if ((k.startsWith("arm") || k.startsWith("paw") || k.startsWith("fangs")) && p && p.heldItem && !p.heldItem.isWeapon && !p.heldItem.isTool && !p.heldItem.isTorch && p.heldItem.resourceType !== "torch" && !p.heldItem.name?.includes("Torch") && !p.heldItem.name?.includes("Tocha")) {
            if (!group.storage) group.storage = [];
            group.storage.push(p.heldItem.resourceType || "item");
            p.heldItem = null;
            this.actionTimer = 0;
            ent.emote = 2;
            break;
          }
        }
      }

      // A2. Withdraw Needed Construction Materials from Warehouse if hands are free
      if (!isCarryingMat && warehouse && warehouse.properties.warehouse?.isCompleted && distWh <= 1 && this.actionTimer >= 0.20) {
        let freeArm = null; for (const k in ent.properties) { const p = ent.properties[k]; if ((k.startsWith("arm") || k.startsWith("paw") || k.startsWith("fangs")) && p && !p.heldItem) { freeArm = [k, p]; break; } }
        if (freeArm && warehouse.properties.warehouse.items && warehouse.properties.warehouse.items.length > 0) {
          const blueprint = getClanBlueprintTiles(group);
          let needsWood = false;
          let needsStone = false;
          for (const bp of blueprint) {
            if (bp.type === "campfire") {
              const cf = getEntityAtTileByProp(bp.x, bp.y, "campfire");
              if (!cf || cf.isConstructed === false) needsWood = true;
            } else if (bp.type === "well") {
              const wl = getEntityAtTileByProp(bp.x, bp.y, "well");
              if (!wl || !wl.properties.well?.isCompleted) { needsWood = true; needsStone = true; }
            } else if (bp.type === "house" || bp.type === "leader_house") {
              const h = getEntityAtTileByProp(bp.x, bp.y, "house");
              if (!h || !h.properties.house?.isCompleted) { needsWood = true; needsStone = true; }
            } else if (bp.type === "wall") {
              const w = getEntityAtTileByProp(bp.x, bp.y, "structure");
              if (!w || !w.isConstructed) needsStone = true;
            } else if (bp.type === "gate") {
              const g = getEntityAtTileByProp(bp.x, bp.y, "door");
              if (!g || !g.isConstructed) needsWood = true;
            }
          }
          if (needsWood || needsStone) {
            const itemIdx = warehouse.properties.warehouse.items.findIndex(i => (needsWood && (i.resourceType === "wood" || i.name?.includes("Wood") || i.name?.includes("Madeira"))) || (needsStone && (i.resourceType === "stone" || i.resourceType === "bone" || i.name?.includes("Stone") || i.name?.includes("Pedra"))));
            if (itemIdx >= 0) {
              const item = warehouse.properties.warehouse.items.splice(itemIdx, 1)[0];
              freeArm[1].heldItem = item;
              this.actionTimer = 0;
              ent.emote = 2;
            }
          }
        }
      }

      // B. Road & Street Digging (Immediate dirt road digging when adjacent to unbuilt road blueprint on the frontier)
      const curW = getSimWorld();
      const allGroups = curW?.groups || (activeWorld?.groups || []);
      const roadBlueprints = getClanRoadBlueprints(group, allGroups);
      const unbuiltRoadNear = roadBlueprints.find(bp => !isRoadTile(bp.x, bp.y) && isRoadFrontierTile(bp.x, bp.y, group) && (Math.abs(bp.x - ent.x) + Math.abs(bp.y - ent.y) <= 1));
      if (unbuiltRoadNear && this.actionTimer >= 0.25) {
        this.actionTimer = 0;
        createRoadEntity(unbuiltRoadNear.x, unbuiltRoadNear.y, unbuiltRoadNear.groupId ? group : null, unbuiltRoadNear.isSnapPoint);
        ent.emote = 2;
        return;
      }

      // C. Building Blueprint Warehouse, Walls, Kingdom Gates & Houses (if holding Stone, Wood or Bone)
      if (isCarryingMat) {
        const blueprint = getClanBlueprintTiles(group);
        let bp = null;
        if (ent._buildTarget) {
          const tFpW = ent._buildTarget.footprintW || (ent._buildTarget.type === "leader_house" ? 3 : (ent._buildTarget.type === "warehouse" || ent._buildTarget.type === "slaughterhouse" || ent._buildTarget.type === "kitchen" || ent._buildTarget.type === "artisan_hut" ? 2 : 1));
          const tFpH = ent._buildTarget.footprintH || (ent._buildTarget.type === "leader_house" ? 3 : (ent._buildTarget.type === "warehouse" || ent._buildTarget.type === "slaughterhouse" || ent._buildTarget.type === "kitchen" || ent._buildTarget.type === "artisan_hut" ? 2 : 1));
          const dx = Math.max(0, Math.max(ent._buildTarget.x - ent.x, ent.x - (ent._buildTarget.x + tFpW - 1)));
          const dy = Math.max(0, Math.max(ent._buildTarget.y - ent.y, ent.y - (ent._buildTarget.y + tFpH - 1)));
          if (Math.max(dx, dy) <= 1) {
            bp = ent._buildTarget;
          }
        }
        if (!bp) {
          for (const b of blueprint) {
            const bFpW = b.footprintW || (b.type === "leader_house" ? 3 : (b.type === "warehouse" || b.type === "slaughterhouse" || b.type === "kitchen" || b.type === "artisan_hut" ? 2 : 1));
            const bFpH = b.footprintH || (b.type === "leader_house" ? 3 : (b.type === "warehouse" || b.type === "slaughterhouse" || b.type === "kitchen" || b.type === "artisan_hut" ? 2 : 1));
            const dx = Math.max(0, Math.max(b.x - ent.x, ent.x - (b.x + bFpW - 1)));
            const dy = Math.max(0, Math.max(b.y - ent.y, ent.y - (b.y + bFpH - 1)));
            if (Math.max(dx, dy) <= 1) {
              bp = b;
              break;
            }
          }
        }
        if (!bp) {
          const nearbyUnfinished = findEntityInRadius(ent.x, ent.y, 2, e =>
            !e.destroyed &&
            ((e.properties.warehouse && !e.properties.warehouse.isCompleted) ||
             (e.properties.campfire && e.isConstructed === false) ||
             (e.properties.well && !e.properties.well.isCompleted) ||
             (e.properties.house && !e.properties.house.isCompleted) ||
             (e.properties.door && !e.isConstructed) ||
             (e.properties.structure && !e.isConstructed))
          );
          if (nearbyUnfinished) {
            let type = "structure";
            if (nearbyUnfinished.properties.warehouse) type = "warehouse";
            else if (nearbyUnfinished.properties.campfire) type = "campfire";
            else if (nearbyUnfinished.properties.well) type = "well";
            else if (nearbyUnfinished.properties.house) type = "house";
            else if (nearbyUnfinished.properties.door) type = "gate";
            bp = { x: nearbyUnfinished.x, y: nearbyUnfinished.y, type, ownerId: nearbyUnfinished.properties.house?.ownerId };
          }
        }

        if (bp) {
          const bpFpW = bp.footprintW || (bp.type === "leader_house" ? 3 : (bp.type === "warehouse" || bp.type === "slaughterhouse" || bp.type === "kitchen" || bp.type === "artisan_hut" ? 2 : 1));
          const bpFpH = bp.footprintH || (bp.type === "leader_house" ? 3 : (bp.type === "warehouse" || bp.type === "slaughterhouse" || bp.type === "kitchen" || bp.type === "artisan_hut" ? 2 : 1));
          const distDx = Math.max(0, Math.max(bp.x - ent.x, ent.x - (bp.x + bpFpW - 1)));
          const distDy = Math.max(0, Math.max(bp.y - ent.y, ent.y - (bp.y + bpFpH - 1)));
          const dist = Math.max(distDx, distDy);

          if (bp.type === "warehouse") {
            const warehouseEntity = getEntityAtTileByProp(bp.x, bp.y, "warehouse");
            if (!warehouseEntity && dist <= 1 && this.actionTimer >= 0.20) {
              let resType = null;
              for (const k in ent.properties) { const p = ent.properties[k];
                if ((k.startsWith("arm") || k.startsWith("paw") || k.startsWith("fangs")) && p && (p.heldItem?.resourceType === "stone" || p.heldItem?.resourceType === "wood" || p.heldItem?.resourceType === "bone")) {
                  resType = p.heldItem.resourceType;
                  p.heldItem = null;
                  break;
                }
              }
              this.actionTimer = 0;
              const warehouse = createWarehouseEntity(bp.x, bp.y, group);
              warehouse.properties.warehouse.woodCurrent = resType === "wood" ? 1 : 0;
              warehouse.properties.warehouse.stoneCurrent = (resType === "stone" || resType === "bone") ? 1 : 0;
              warehouse.properties.warehouse.isCompleted = (warehouse.properties.warehouse.woodCurrent >= warehouse.properties.warehouse.woodCost && warehouse.properties.warehouse.stoneCurrent >= warehouse.properties.warehouse.stoneCost);
              entities.push(warehouse);
              registerEntitySpatial(warehouse);
              return;
            } else if (warehouseEntity && !warehouseEntity.properties.warehouse?.isCompleted && dist <= 1 && this.actionTimer >= 0.20) {
              const wh = warehouseEntity.properties.warehouse;
              let contributed = false;
              for (const k in ent.properties) { const p = ent.properties[k];
                if ((k.startsWith("arm") || k.startsWith("paw") || k.startsWith("fangs")) && p && p.heldItem) {
                  if (p.heldItem.resourceType === "wood" && wh.woodCurrent < wh.woodCost) {
                    wh.woodCurrent++;
                    p.heldItem = null;
                    contributed = true;
                    break;
                  } else if ((p.heldItem.resourceType === "stone" || p.heldItem.resourceType === "bone") && wh.stoneCurrent < wh.stoneCost) {
                    wh.stoneCurrent++;
                    p.heldItem = null;
                    contributed = true;
                    break;
                  }
                }
              }
              if (contributed) {
                this.actionTimer = 0;
                if (wh.woodCurrent >= wh.woodCost && wh.stoneCurrent >= wh.stoneCost) {
                  wh.isCompleted = true;
                  recordWorldEvent({
                    opcode: OP_BUILD,
                    type: "BUILD",
                    primaryEntityId: ent.id,
                    location: { x: bp.x, y: bp.y },
                    description: `${ent.properties.name} concluiu o ${warehouseEntity.properties.name || "Grande Armazém"} do reino '${group.name}'!`,
                    tick: currentTick,
                    timestamp: world?.clock ? { day: world.clock.day, hour: world.clock.hour, minute: world.clock.minute } : null,
                    metadata: { structureName: warehouseEntity.properties.name, clan: group.name }
                  });
                }
                return;
              }
            } else if (warehouseEntity && warehouseEntity.properties.warehouse?.isCompleted && dist <= 1 && this.actionTimer >= 0.20) {
              const hasUnbuiltHouse = blueprint.some(b => b.type === "house" && (!getEntityAtTileByProp(b.x, b.y, "house") || !getEntityAtTileByProp(b.x, b.y, "house")?.properties.house?.isCompleted));
              let isHoldingBuildingMat = false; for (const k in ent.properties) { const p = ent.properties[k]; if (p && (p.heldItem?.resourceType === "wood" || p.heldItem?.resourceType === "stone" || p.heldItem?.resourceType === "bone")) { isHoldingBuildingMat = true; break; } }
              if (!warehouseEntity.properties.warehouse.items) warehouseEntity.properties.warehouse.items = [];
              const whItems = warehouseEntity.properties.warehouse.items;
              const isHauler = ent.properties.role === "Hauler" || ent.properties.role === "Pioneer";

              // 1. Unload items from held basket
              for (const k in ent.properties) { const p = ent.properties[k];
                if ((k.startsWith("arm") || k.startsWith("paw") || k.startsWith("fangs")) && p && p.heldItem?.container?.type === "basket") {
                  const bItems = p.heldItem.container.items;
                  while (bItems.length > 0) {
                    whItems.push(bItems.pop());
                  }
                }
              }

              // 2. Unload items from body backpack
              if (ent.properties.backpack && ent.properties.backpack.items) {
                while (ent.properties.backpack.items.length > 0) {
                  whItems.push(ent.properties.backpack.items.pop());
                }
              }

              // 3. Deposit directly held items in hands (unless holding a working basket)
              if (!hasUnbuiltHouse || !isHoldingBuildingMat) {
                for (const k in ent.properties) { const p = ent.properties[k];
                  if ((k.startsWith("arm") || k.startsWith("paw") || k.startsWith("fangs")) && p && p.heldItem && p.heldItem.resourceType && p.heldItem.resourceType !== "basket") {
                    whItems.push(p.heldItem);
                    p.heldItem = null;
                  }
                }
              }

              // 4. Equip Backpack if not equipped (Haulers take large backpack, others take any)
              if (!ent.properties.backpack) {
                const bpIdx = whItems.findIndex(i => i.resourceType === "backpack" || i.name?.includes("Mochila") || i.name?.includes("Backpack") || i.name?.includes("Bolsa"));
                if (bpIdx >= 0) {
                  const bpItem = whItems.splice(bpIdx, 1)[0];
                  ent.properties.backpack = {
                    type: "backpack",
                    size: isHauler ? "large" : (bpItem.size || "medium"),
                    capacity: isHauler ? 20 : (bpItem.container?.capacity || 12),
                    items: []
                  };
                }
              }

              // 5. Hauler Hand Basket Equipping: Ensure Haulers hold 1 Basket in hand!
              if (isHauler) {
                let hasBasket = false; for (const k in ent.properties) { const p = ent.properties[k]; if (p && (p.heldItem?.resourceType === "basket" || p.heldItem?.container?.type === "basket")) { hasBasket = true; break; } }
                if (!hasBasket) {
                  const bIdx = whItems.findIndex(i => i.resourceType === "basket" || i.name?.includes("Cesto") || i.name?.includes("Basket"));
                  let freeArm = null; for (const k in ent.properties) { const p = ent.properties[k]; if ((k.startsWith("arm") || k.startsWith("paw") || k.startsWith("fangs")) && p && !p.heldItem) { freeArm = [k, p]; break; } }
                  if (bIdx >= 0 && freeArm) {
                    const bItem = whItems.splice(bIdx, 1)[0];
                    freeArm[1].heldItem = {
                      name: bItem.name || "Cesto de Transporte",
                      resourceType: "basket",
                      container: { type: "basket", capacity: 10, items: [] },
                      weight: 1.0
                    };
                  }
                }
              }

              // 6. Quota Crafting: Maintain 2.5x Baskets and 1.5x Backpacks per citizen in Stockpile
              const livingPop = (group.members || []).length || 5;
              const targetBaskets = Math.ceil(livingPop * 2.5);
              const targetBackpacks = Math.ceil(livingPop * 1.5);
              let currBaskets = whItems.filter(i => i.resourceType === "basket" || i.name?.includes("Cesto")).length;
              let currBackpacks = whItems.filter(i => i.resourceType === "backpack" || i.name?.includes("Mochila") || i.name?.includes("Bolsa")).length;

              const woodCount = whItems.filter(i => i.resourceType === "wood" || i.name?.includes("Wood")).length;
              if (currBaskets < targetBaskets && woodCount >= 2) {
                const w1 = whItems.findIndex(i => i.resourceType === "wood" || i.name?.includes("Wood"));
                if (w1 >= 0) whItems.splice(w1, 1);
                whItems.push({
                  name: "Cesto de Vime",
                  resourceType: "basket",
                  container: { type: "basket", capacity: 8, items: [] },
                  weight: 1.0
                });
              }
              if (currBackpacks < targetBackpacks && woodCount >= 2) {
                const w1 = whItems.findIndex(i => i.resourceType === "wood" || i.name?.includes("Wood"));
                if (w1 >= 0) whItems.splice(w1, 1);
                whItems.push({
                  name: "Mochila de Expedição",
                  resourceType: "backpack",
                  container: { type: "backpack", capacity: 14, items: [] },
                  weight: 2.0
                });
              }

              // 7. Withdraw needed resource to build structures
              const needsWood = blueprint.some(b => (!getEntityAtTileByProp(b.x, b.y, "house") || !getEntityAtTileByProp(b.x, b.y, "house")?.properties.house?.isCompleted) || (!getEntityAtTileByProp(b.x, b.y, "wall") && b.type === "wall"));
              const needsStone = blueprint.some(b => (!getEntityAtTileByProp(b.x, b.y, "well") || !getEntityAtTileByProp(b.x, b.y, "well")?.properties.well?.isCompleted) || b.type === "campfire" || (b.type === "wall" && !getEntityAtTileByProp(b.x, b.y, "wall")));
let freeArm = null; for (const k in ent.properties) { const p = ent.properties[k]; if ((k.startsWith("arm") || k.startsWith("paw") || k.startsWith("fangs")) && p && !p.heldItem) { freeArm = [k, p]; break; } }
              if (freeArm && whItems.length > 0) {
                const itemIdx = whItems.findIndex(i => (needsWood && (i.resourceType === "wood" || i.name?.includes("Wood"))) || (needsStone && (i.resourceType === "stone" || i.resourceType === "bone" || i.name?.includes("Stone"))));
                if (itemIdx >= 0) {
                  const item = whItems.splice(itemIdx, 1)[0];
                  freeArm.heldItem = item;
                  this.actionTimer = 0;
                }
              }
              
              // Feed logic
              if (ent.properties.stomach && ent.properties.stomach.items.length < ent.properties.stomach.capacity) {
                const foodIdx = whItems.findIndex(i => i.nutrition || i.resourceType === "food" || i.resourceType === "fruit" || i.resourceType === "meat");
                if (foodIdx !== -1) {
                  const consumedFood = whItems.splice(foodIdx, 1)[0];
                  ent.properties.stomach.items.push({
                    name: consumedFood.name || "Pantry Food",
                    foodType: consumedFood.foodType || "fruit",
                    nutrition: consumedFood.nutrition || 600,
                    totalTurns: consumedFood.digestDuration || 25,
                    remainingTurns: consumedFood.digestDuration || 25
                  });
                  recordWorldEvent({
                    opcode: OP_FEED,
                    type: "FEED",
                    primaryEntityId: ent.id,
                    location: { x: ent.x, y: ent.y },
                    description: `${ent.properties.name} ate ${consumedFood.name || "food"} from the Grand Warehouse of '${group.name}'!`,
                    tick: currentTick,
                    timestamp: world?.clock ? { day: world.clock.day, hour: world.clock.hour, minute: world.clock.minute } : null
                  });
                }
              }
            }
          } else if (bp.type === "campfire") {
            const campfireEntity = getEntityAtTileByProp(bp.x, bp.y, "campfire");
            if (!campfireEntity && dist <= 1 && this.actionTimer >= 0.20) {
              let resType = null;
              for (const k in ent.properties) { const p = ent.properties[k];
                if ((k.startsWith("arm") || k.startsWith("paw") || k.startsWith("fangs")) && p && (p.heldItem?.resourceType === "wood" || p.heldItem?.resourceType === "stone" || p.heldItem?.resourceType === "bone")) {
                  resType = p.heldItem.resourceType;
                  p.heldItem = null;
                  break;
                }
              }
              this.actionTimer = 0;
              const cf = createCampfireEntity(bp.x, bp.y, group.id);
              cf.woodCurrent = (resType === "wood" ? 1 : 0);
              cf.woodCost = 2;
              cf.isConstructed = cf.woodCurrent >= cf.woodCost;
              if (cf.isConstructed) cf.properties.campfire.isLit = true;
              entities.push(cf);
              registerEntitySpatial(cf);
              return;
            } else if (campfireEntity && !campfireEntity.isConstructed && dist <= 1 && this.actionTimer >= 0.20) {
              let contributed = false;
              for (const k in ent.properties) { const p = ent.properties[k];
                if ((k.startsWith("arm") || k.startsWith("paw") || k.startsWith("fangs")) && p && p.heldItem?.resourceType === "wood") {
                  p.heldItem = null;
                  campfireEntity.woodCurrent = (campfireEntity.woodCurrent || 1) + 1;
                  contributed = true;
                  break;
                }
              }
              if (contributed) {
                this.actionTimer = 0;
                if (campfireEntity.woodCurrent >= (campfireEntity.woodCost || 2)) {
                  campfireEntity.isConstructed = true;
                  campfireEntity.properties.campfire.isLit = true;
                  recordWorldEvent({
                    opcode: OP_BUILD,
                    type: "BUILD",
                    primaryEntityId: ent.id,
                    location: { x: bp.x, y: bp.y },
                    description: `${ent.properties.name} built the Central Hearth for '${group.name}'!`,
                    tick: currentTick,
                    timestamp: world?.clock ? { day: world.clock.day, hour: world.clock.hour, minute: world.clock.minute } : null,
                    metadata: { structureName: "Central Hearth", clan: group.name }
                  });
                }
                return;
              }
            }
          } else if (bp.type === "well") {
            const wellEntity = getEntityAtTileByProp(bp.x, bp.y, "well");
            if (!wellEntity && dist <= 1 && this.actionTimer >= 0.20) {
              let resType = null;
              for (const k in ent.properties) { const p = ent.properties[k];
                if ((k.startsWith("arm") || k.startsWith("paw") || k.startsWith("fangs")) && p && (p.heldItem?.resourceType === "stone" || p.heldItem?.resourceType === "wood" || p.heldItem?.resourceType === "bone")) {
                  resType = p.heldItem.resourceType;
                  p.heldItem = null;
                  break;
                }
              }
              this.actionTimer = 0;
              const well = createWaterWellEntity(bp.x, bp.y, group);
              well.properties.well.woodCurrent = resType === "wood" ? 1 : 0;
              well.properties.well.stoneCurrent = (resType === "stone" || resType === "bone") ? 1 : 0;
              well.properties.well.isCompleted = (well.properties.well.woodCurrent >= well.properties.well.woodCost && well.properties.well.stoneCurrent >= well.properties.well.stoneCost);
              entities.push(well);
              registerEntitySpatial(well);
              return;
            } else if (wellEntity && !wellEntity.properties.well?.isCompleted && dist <= 1 && this.actionTimer >= 0.20) {
              const wl = wellEntity.properties.well;
              let contributed = false;
              for (const k in ent.properties) { const p = ent.properties[k];
                if ((k.startsWith("arm") || k.startsWith("paw") || k.startsWith("fangs")) && p && p.heldItem) {
                  if (p.heldItem.resourceType === "wood" && wl.woodCurrent < wl.woodCost) {
                    wl.woodCurrent++;
                    p.heldItem = null;
                    contributed = true;
                    break;
                  } else if ((p.heldItem.resourceType === "stone" || p.heldItem.resourceType === "bone") && wl.stoneCurrent < wl.stoneCost) {
                    wl.stoneCurrent++;
                    p.heldItem = null;
                    contributed = true;
                    break;
                  }
                }
              }
              if (contributed) {
                this.actionTimer = 0;
                if (wl.woodCurrent >= wl.woodCost && wl.stoneCurrent >= wl.stoneCost) {
                  wl.isCompleted = true;
                  recordWorldEvent({
                    opcode: OP_BUILD,
                    type: "BUILD",
                    primaryEntityId: ent.id,
                    location: { x: bp.x, y: bp.y },
                    description: `${ent.properties.name} completed ${wellEntity.properties.name || "Water Well"} for '${group.name}'!`,
                    tick: currentTick,
                    timestamp: world?.clock ? { day: world.clock.day, hour: world.clock.hour, minute: world.clock.minute } : null,
                    metadata: { structureName: wellEntity.properties.name, clan: group.name }
                  });
                }
                return;
              }
            }
          } else if (bp.type === "slaughterhouse") {
            const shEntity = getEntityAtTileByProp(bp.x, bp.y, "slaughterhouse");
            if (!shEntity && dist <= 1 && this.actionTimer >= 0.20) {
              let resType = null;
              for (const k in ent.properties) { const p = ent.properties[k];
                if ((k.startsWith("arm") || k.startsWith("paw") || k.startsWith("fangs")) && p && (p.heldItem?.resourceType === "stone" || p.heldItem?.resourceType === "wood" || p.heldItem?.resourceType === "bone")) {
                  resType = p.heldItem.resourceType;
                  p.heldItem = null;
                  break;
                }
              }
              this.actionTimer = 0;
              const variant = (Math.abs(bp.x * 11 + bp.y * 19)) % 2;
              const sh = createSlaughterhouseEntity(bp.x, bp.y, group, variant);
              sh.properties.slaughterhouse.woodCurrent = resType === "wood" ? 1 : 0;
              sh.properties.slaughterhouse.stoneCurrent = (resType === "stone" || resType === "bone") ? 1 : 0;
              sh.properties.slaughterhouse.isCompleted = (sh.properties.slaughterhouse.woodCurrent >= sh.properties.slaughterhouse.woodCost && sh.properties.slaughterhouse.stoneCurrent >= sh.properties.slaughterhouse.stoneCost);
              entities.push(sh);
              registerEntitySpatial(sh);
              return;
            } else if (shEntity && !shEntity.properties.slaughterhouse?.isCompleted && dist <= 1 && this.actionTimer >= 0.20) {
              const sh = shEntity.properties.slaughterhouse;
              let contributed = false;
              for (const k in ent.properties) { const p = ent.properties[k];
                if ((k.startsWith("arm") || k.startsWith("paw") || k.startsWith("fangs")) && p && p.heldItem) {
                  if (p.heldItem.resourceType === "wood" && sh.woodCurrent < sh.woodCost) {
                    sh.woodCurrent++;
                    p.heldItem = null;
                    contributed = true;
                    break;
                  } else if ((p.heldItem.resourceType === "stone" || p.heldItem.resourceType === "bone") && sh.stoneCurrent < sh.stoneCost) {
                    sh.stoneCurrent++;
                    p.heldItem = null;
                    contributed = true;
                    break;
                  }
                }
              }
              if (contributed) {
                this.actionTimer = 0;
                if (sh.woodCurrent >= sh.woodCost && sh.stoneCurrent >= sh.stoneCost) {
                  sh.isCompleted = true;
                  recordWorldEvent({
                    opcode: OP_BUILD,
                    type: "BUILD",
                    primaryEntityId: ent.id,
                    location: { x: bp.x, y: bp.y },
                    description: `${ent.properties.name} completed ${shEntity.properties.name || "Slaughterhouse"} for '${group.name}'!`,
                    tick: currentTick,
                    timestamp: world?.clock ? { day: world.clock.day, hour: world.clock.hour, minute: world.clock.minute } : null,
                    metadata: { structureName: shEntity.properties.name, clan: group.name }
                  });
                }
                return;
              }
            }
          } else if (bp.type === "kitchen") {
            const kitEntity = getEntityAtTileByProp(bp.x, bp.y, "kitchen");
            if (!kitEntity && dist <= 1 && this.actionTimer >= 0.20) {
              let resType = null;
              for (const k in ent.properties) { const p = ent.properties[k];
                if ((k.startsWith("arm") || k.startsWith("paw") || k.startsWith("fangs")) && p && (p.heldItem?.resourceType === "stone" || p.heldItem?.resourceType === "wood" || p.heldItem?.resourceType === "bone")) {
                  resType = p.heldItem.resourceType;
                  p.heldItem = null;
                  break;
                }
              }
              this.actionTimer = 0;
              const variant = (Math.abs(bp.x * 7 + bp.y * 23)) % 2;
              const kit = createKitchenEntity(bp.x, bp.y, group, variant);
              kit.properties.kitchen.woodCurrent = resType === "wood" ? 1 : 0;
              kit.properties.kitchen.stoneCurrent = (resType === "stone" || resType === "bone") ? 1 : 0;
              kit.properties.kitchen.isCompleted = (kit.properties.kitchen.woodCurrent >= kit.properties.kitchen.woodCost && kit.properties.kitchen.stoneCurrent >= kit.properties.kitchen.stoneCost);
              entities.push(kit);
              registerEntitySpatial(kit);
              return;
            } else if (kitEntity && !kitEntity.properties.kitchen?.isCompleted && dist <= 1 && this.actionTimer >= 0.20) {
              const kit = kitEntity.properties.kitchen;
              let contributed = false;
              for (const k in ent.properties) { const p = ent.properties[k];
                if ((k.startsWith("arm") || k.startsWith("paw") || k.startsWith("fangs")) && p && p.heldItem) {
                  if (p.heldItem.resourceType === "wood" && kit.woodCurrent < kit.woodCost) {
                    kit.woodCurrent++;
                    p.heldItem = null;
                    contributed = true;
                    break;
                  } else if ((p.heldItem.resourceType === "stone" || p.heldItem.resourceType === "bone") && kit.stoneCurrent < kit.stoneCost) {
                    kit.stoneCurrent++;
                    p.heldItem = null;
                    contributed = true;
                    break;
                  }
                }
              }
              if (contributed) {
                this.actionTimer = 0;
                if (kit.woodCurrent >= kit.woodCost && kit.stoneCurrent >= kit.stoneCost) {
                  kit.isCompleted = true;
                  recordWorldEvent({
                    opcode: OP_BUILD,
                    type: "BUILD",
                    primaryEntityId: ent.id,
                    location: { x: bp.x, y: bp.y },
                    description: `${ent.properties.name} completed ${kitEntity.properties.name || "Kitchen"} for '${group.name}'!`,
                    tick: currentTick,
                    timestamp: world?.clock ? { day: world.clock.day, hour: world.clock.hour, minute: world.clock.minute } : null,
                    metadata: { structureName: kitEntity.properties.name, clan: group.name }
                  });
                }
                return;
              }
            }
          } else if (bp.type === "artisan_hut") {
            const artEntity = getEntityAtTileByProp(bp.x, bp.y, "artisan_hut");
            if (!artEntity && dist <= 1 && this.actionTimer >= 0.20) {
              let resType = null;
              for (const k in ent.properties) { const p = ent.properties[k];
                if ((k.startsWith("arm") || k.startsWith("paw") || k.startsWith("fangs")) && p && (p.heldItem?.resourceType === "stone" || p.heldItem?.resourceType === "wood" || p.heldItem?.resourceType === "bone")) {
                  resType = p.heldItem.resourceType;
                  p.heldItem = null;
                  break;
                }
              }
              this.actionTimer = 0;
              const art = createArtisanHutEntity(bp.x, bp.y, group);
              art.properties.artisan_hut.woodCurrent = resType === "wood" ? 1 : 0;
              art.properties.artisan_hut.stoneCurrent = (resType === "stone" || resType === "bone") ? 1 : 0;
              art.properties.artisan_hut.isCompleted = (art.properties.artisan_hut.woodCurrent >= art.properties.artisan_hut.woodCost && art.properties.artisan_hut.stoneCurrent >= art.properties.artisan_hut.stoneCost);
              entities.push(art);
              registerEntitySpatial(art);
              return;
            } else if (artEntity && !artEntity.properties.artisan_hut?.isCompleted && dist <= 1 && this.actionTimer >= 0.20) {
              const art = artEntity.properties.artisan_hut;
              let contributed = false;
              for (const k in ent.properties) { const p = ent.properties[k];
                if ((k.startsWith("arm") || k.startsWith("paw") || k.startsWith("fangs")) && p && p.heldItem) {
                  if (p.heldItem.resourceType === "wood" && art.woodCurrent < art.woodCost) {
                    art.woodCurrent++;
                    p.heldItem = null;
                    contributed = true;
                    break;
                  } else if ((p.heldItem.resourceType === "stone" || p.heldItem.resourceType === "bone") && art.stoneCurrent < art.stoneCost) {
                    art.stoneCurrent++;
                    p.heldItem = null;
                    contributed = true;
                    break;
                  }
                }
              }
              if (contributed) {
                this.actionTimer = 0;
                if (art.woodCurrent >= art.woodCost && art.stoneCurrent >= art.stoneCost) {
                  art.isCompleted = true;
                  recordWorldEvent({
                    opcode: OP_BUILD,
                    type: "BUILD",
                    primaryEntityId: ent.id,
                    location: { x: bp.x, y: bp.y },
                    description: `${ent.properties.name} completed ${artEntity.properties.name || "Artisan Hut"} for '${group.name}'!`,
                    tick: currentTick,
                    timestamp: world?.clock ? { day: world.clock.day, hour: world.clock.hour, minute: world.clock.minute } : null,
                    metadata: { structureName: artEntity.properties.name, clan: group.name }
                  });
                }
                return;
              }
            }
          } else if (bp.type === "gate" || bp.type === "door") {
            const gateEntity = getEntityAtTileByProp(bp.x, bp.y, "door");
            if (!gateEntity && dist <= 1 && this.actionTimer >= 0.20) {
              let resType = null;
              for (const k in ent.properties) { const p = ent.properties[k];
                if ((k.startsWith("arm") || k.startsWith("paw") || k.startsWith("fangs")) && p && (p.heldItem?.resourceType === "wood" || p.heldItem?.resourceType === "stone" || p.heldItem?.resourceType === "bone")) {
                  resType = p.heldItem.resourceType;
                  p.heldItem = null;
                  break;
                }
              }
              this.actionTimer = 0;
              const gate = createDoorEntity(bp.x, bp.y, group.members);
              gate.woodCurrent = (resType === "wood" ? 1 : 0);
              gate.woodCost = 2;
              gate.isConstructed = gate.woodCurrent >= gate.woodCost;
              entities.push(gate);
              return;
            } else if (gateEntity && !gateEntity.isConstructed && dist <= 1 && this.actionTimer >= 0.20) {
              let contributed = false;
              for (const k in ent.properties) { const p = ent.properties[k];
                if ((k.startsWith("arm") || k.startsWith("paw") || k.startsWith("fangs")) && p && p.heldItem?.resourceType === "wood") {
                  p.heldItem = null;
                  gateEntity.woodCurrent = (gateEntity.woodCurrent || 1) + 1;
                  contributed = true;
                  break;
                }
              }
              if (contributed) {
                this.actionTimer = 0;
                if (gateEntity.woodCurrent >= (gateEntity.woodCost || 2)) {
                  gateEntity.isConstructed = true;
                  recordWorldEvent({
                    opcode: OP_BUILD,
                    type: "BUILD",
                    primaryEntityId: ent.id,
                    location: { x: bp.x, y: bp.y },
                    description: `${ent.properties.name} completed the Fortified Gate for '${group.name}'!`,
                    tick: currentTick,
                    timestamp: world?.clock ? { day: world.clock.day, hour: world.clock.hour, minute: world.clock.minute } : null,
                    metadata: { structureName: "Fortified Gate", clan: group.name }
                  });
                }
                return;
              }
            }
          } else if (bp.type === "house" || bp.type === "leader_house") {
            const houseEntity = getEntityAtTileByProp(bp.x, bp.y, "house");
            if (!houseEntity && dist <= 1 && this.actionTimer >= 0.20) {
              // Initiate new house construction site
              let resType = null;
              let boneOwner = null;
              for (const k in ent.properties) { const p = ent.properties[k];
                if ((k.startsWith("arm") || k.startsWith("paw") || k.startsWith("fangs")) && p && (p.heldItem?.resourceType === "stone" || p.heldItem?.resourceType === "wood" || p.heldItem?.resourceType === "bone")) {
                  resType = p.heldItem.resourceType;
                  boneOwner = p.heldItem.ownerName || p.heldItem.sourceName || null;
                  p.heldItem = null;
                  break;
                }
              }
              this.actionTimer = 0;
              let houseOwnerId = bp.ownerId;
              if (!houseOwnerId) {
                const existingHouses = entities.filter(e => !e.destroyed && e.properties.house && isTileInClaimedZones(e.x, e.y, group.claimedZones));
                const housedIds = new Set(existingHouses.map(h => h.properties.house.ownerId).filter(Boolean));
                const unhousedMember = (group.members || []).find(mid => !housedIds.has(mid));
                houseOwnerId = unhousedMember || ent.id;
              }
              const owner = getEntityById(houseOwnerId);
              const ownerName = owner?.properties?.name || (houseOwnerId ? `Member #${houseOwnerId}` : ent.properties.name);

              // Select house style: Mixed houses are PREFERRED whenever both wood and stone are accessible!
              const clanStock = getGroupStockpile(group, entities);
              const woodAvail = (clanStock.items["wood"] || 0) + (clanStock.items["Wood"] || 0);
              const stoneAvail = (clanStock.items["stone"] || 0) + (clanStock.items["Stone"] || 0);
              const boneAvail = (clanStock.items["bone"] || 0) + (clanStock.items["Bone"] || 0);

              const hasWoodAccess = (woodAvail > 0) || hasEntityInRadius(bp.x, bp.y, 24, e => !e.destroyed && (e.properties.photosynthesis || e.properties.deep_root || e.properties.species === "oak" || e.properties.species === "willow" || e.properties.species === "pine" || e.properties.species === "tree"));
              let hasStoneAccess = (stoneAvail > 0);
              if (!hasStoneAccess && world) {
                for (let r = 1; r <= 20; r += 2) {
                  for (const off of [{dx: r, dy: 0}, {dx: -r, dy: 0}, {dx: 0, dy: r}, {dx: 0, dy: -r}, {dx: r, dy: r}, {dx: -r, dy: -r}]) {
                    const tx = Math.max(0, Math.min((world.width || 512) - 1, bp.x + off.dx));
                    const ty = Math.max(0, Math.min((world.height || 512) - 1, bp.y + off.dy));
                    const t = world.getTile(tx, ty);
                    if (t === 4 || t === 1) {
                      hasStoneAccess = true;
                      break;
                    }
                  }
                  if (hasStoneAccess) break;
                }
              }

              let style = "mixed";
              if (resType === "bone" && boneAvail >= 6) {
                style = "bone";
              } else if (hasWoodAccess && hasStoneAccess) {
                // Preferred style: Mixed Wood & Stone House!
                style = "mixed";
              } else if (hasStoneAccess && !hasWoodAccess) {
                style = "stone";
              } else if (hasWoodAccess && !hasStoneAccess) {
                style = "wood";
              } else {
                style = "mixed";
              }

              const isLeaderPlot = bp.isLeaderHouse || bp.type === "leader_house";
              const newHouse = isLeaderPlot
                ? createLeaderHouseEntity(bp.x, bp.y, group, houseOwnerId, ownerName)
                : createHouseEntity(bp.x, bp.y, style, houseOwnerId, ownerName, "wood");
              if (newHouse) {
                newHouse.properties.group = group;
                newHouse.properties.groupId = group.id;
                newHouse.properties.house.ownerId = houseOwnerId;
                newHouse.properties.house.ownerName = ownerName;
                newHouse.properties.house.woodCurrent = resType === "wood" ? 1 : 0;
                newHouse.properties.house.stoneCurrent = resType === "stone" ? 1 : 0;
                newHouse.properties.house.boneCurrent = resType === "bone" ? 1 : 0;
                newHouse.properties.house.isCompleted = (newHouse.properties.house.woodCurrent >= (newHouse.properties.house.woodCost ?? 2) && newHouse.properties.house.stoneCurrent >= (newHouse.properties.house.stoneCost ?? 2) && (newHouse.properties.house.boneCurrent || 0) >= (newHouse.properties.house.boneCost ?? 0));
                entities.push(newHouse);
                registerEntitySpatial(newHouse);
              }
              return;
            } else if (houseEntity && !houseEntity.properties.house?.isCompleted && dist <= 1 && this.actionTimer >= 0.20) {
              const h = houseEntity.properties.house;
              let contributed = false;
              const wCost = h.woodCost ?? 2;
              const sCost = h.stoneCost ?? 2;
              const bCost = h.boneCost ?? 0;
              for (const k in ent.properties) { const p = ent.properties[k];
                if ((k.startsWith("arm") || k.startsWith("paw") || k.startsWith("fangs")) && p && p.heldItem) {
                  const rType = p.heldItem.resourceType;
                  if (rType === "wood" && h.woodCurrent < wCost) {
                    h.woodCurrent++;
                    p.heldItem = null;
                    contributed = true;
                    break;
                  } else if (rType === "stone" && h.stoneCurrent < sCost) {
                    h.stoneCurrent++;
                    p.heldItem = null;
                    contributed = true;
                    break;
                  } else if (rType === "bone" && (h.boneCurrent || 0) < bCost) {
                    h.boneCurrent = (h.boneCurrent || 0) + 1;
                    p.heldItem = null;
                    contributed = true;
                    break;
                  } else if (h.woodCurrent < wCost || h.stoneCurrent < sCost || (h.boneCurrent || 0) < bCost) {
                    if (h.woodCurrent < wCost) h.woodCurrent++;
                    else if (h.stoneCurrent < sCost) h.stoneCurrent++;
                    else h.boneCurrent = (h.boneCurrent || 0) + 1;
                    p.heldItem = null;
                    contributed = true;
                    break;
                  }
                }
              }
              if (contributed) {
                this.actionTimer = 0;
                if (h.woodCurrent >= wCost && h.stoneCurrent >= sCost && (h.boneCurrent || 0) >= bCost) {
                  h.isCompleted = true;
                  if (!h.ownerId || !getEntityById(h.ownerId) || getEntityById(h.ownerId).destroyed) {
                    const existingHouses = entities.filter(e => !e.destroyed && e.properties.house?.ownerId && e !== houseEntity);
                    const housedIds = new Set(existingHouses.map(e => e.properties.house.ownerId));
                    const isLeaderHouse = !!h.isLeaderHouse;
                    const homeless = (group.members || []).map(id => getEntityById(id)).find(m => {
                      if (!m || m.destroyed || !m.properties.life || housedIds.has(m.id)) return false;
                      if (isLeaderHouse) return m.id === group.leaderId;
                      return m.id !== group.leaderId;
                    });
                    if (homeless) {
                      h.ownerId = homeless.id;
                      h.ownerName = homeless.properties.name;
                      houseEntity.properties.name = isLeaderHouse ? `Grand Palace of ${homeless.properties.name}` : `Cottage of ${homeless.properties.name}`;
                    }
                  }
                  recordWorldEvent({
                    opcode: OP_BUILD,
                    type: "BUILD",
                    primaryEntityId: ent.id,
                    location: { x: bp.x, y: bp.y },
                    description: `${ent.properties.name} completed construction of '${houseEntity.properties.name || "Cottage"}'!`,
                    tick: currentTick,
                    timestamp: world?.clock ? { day: world.clock.day, hour: world.clock.hour, minute: world.clock.minute } : null,
                    metadata: { structureName: houseEntity.properties.name, clan: group.name }
                  });
                }
                return;
              }
            }
          } else {
            const wallEntity = getEntityAtTileByProp(bp.x, bp.y, "structure");
            if (!wallEntity && dist <= 1 && this.actionTimer >= 0.20) {
              let resType = null;
              for (const k in ent.properties) { const p = ent.properties[k];
                if ((k.startsWith("arm") || k.startsWith("paw") || k.startsWith("fangs")) && p && (p.heldItem?.resourceType === "stone" || p.heldItem?.resourceType === "bone")) {
                  resType = p.heldItem.resourceType;
                  p.heldItem = null;
                  break;
                }
              }
              this.actionTimer = 0;
              const wall = createWallEntity(bp.x, bp.y, group.name, "stone");
              wall.stoneCurrent = 1;
              wall.isConstructed = (wall.stoneCurrent >= (wall.stoneCost ?? 2));
              entities.push(wall);
              return;
            } else if (wallEntity && !wallEntity.isConstructed && dist <= 1 && this.actionTimer >= 0.20) {
              let contributed = false;
              for (const k in ent.properties) { const p = ent.properties[k];
                if ((k.startsWith("arm") || k.startsWith("paw") || k.startsWith("fangs")) && p && p.heldItem) {
                  if ((p.heldItem.resourceType === "stone" || p.heldItem.resourceType === "bone") && (wallEntity.stoneCurrent || 0) < (wallEntity.stoneCost ?? 2)) {
                    wallEntity.stoneCurrent = (wallEntity.stoneCurrent || 0) + 1;
                    p.heldItem = null;
                    contributed = true;
                    break;
                  }
                }
              }
              if (contributed) {
                this.actionTimer = 0;
                if ((wallEntity.stoneCurrent || 0) >= (wallEntity.stoneCost ?? 2)) {
                  wallEntity.isConstructed = true;
                  recordWorldEvent({
                    opcode: OP_BUILD,
                    type: "BUILD",
                    primaryEntityId: ent.id,
                    location: { x: bp.x, y: bp.y },
                    description: `${ent.properties.name} erected a Stone Wall for '${group.name}'!`,
                    tick: currentTick,
                    timestamp: world?.clock ? { day: world.clock.day, hour: world.clock.hour, minute: world.clock.minute } : null,
                    metadata: { structureName: wallEntity.properties.name, clan: group.name }
                  });
                }
                return;
              }
            }
          }
        }

        // Only drop material if hands are holding an unneeded material and 100% of ALL clan blueprints are completed
        const hasAnyUnbuiltBlueprint = blueprint.some(bp => {
          if (bp.type === "warehouse") {
            const wh = getEntityAtTileByProp(bp.x, bp.y, "warehouse");
            return !wh || !wh.properties.warehouse?.isCompleted;
          } else if (bp.type === "campfire") {
            const cf = getEntityAtTileByProp(bp.x, bp.y, "campfire");
            return !cf || cf.isConstructed === false;
          } else if (bp.type === "well") {
            const wl = getEntityAtTileByProp(bp.x, bp.y, "well");
            return !wl || !wl.properties.well?.isCompleted;
          } else if (bp.type === "gate" || bp.type === "door") {
            const g = getEntityAtTileByProp(bp.x, bp.y, "door");
            return !g || !g.isConstructed;
          } else if (bp.type === "house" || bp.type === "leader_house") {
            const h = getEntityAtTileByProp(bp.x, bp.y, "house");
            return !h || !h.properties.house?.isCompleted;
          } else if (bp.type === "wall") {
            const w = getEntityAtTileByProp(bp.x, bp.y, "structure");
            return !w || !w.isConstructed;
          }
          return false;
        });

        // Store unneeded materials in Clan Warehouse if present, or ground
        if (!hasAnyUnbuiltBlueprint && (inClaimedZone || distToBase <= 4) && distToBase <= 2) {
          const warehouse = getGroupWarehouse(group, entities);
          if (warehouse) {
            for (const k in ent.properties) { const p = ent.properties[k];
              if ((k.startsWith("arm") || k.startsWith("paw") || k.startsWith("fangs")) && p && p.heldItem) {
                warehouse.properties.warehouse.items.push(p.heldItem);
                p.heldItem = null;
              }
            }
          } else {
            dropHeldItem(ent, entities, world);
          }
        }
      }

      // B. Crafter Bone Sculpting (Crafting weapons and artifacts from bones)
      let carryingBone = null;
      let boneArmKey = null;
      for (const k in ent.properties) { const p = ent.properties[k];
        if ((k.startsWith("arm") || k.startsWith("paw") || k.startsWith("fangs")) && p && p.heldItem && (p.heldItem.resourceType === "bone" || p.heldItem.name?.includes("Osso") || p.heldItem.name?.includes("Dente"))) {
          carryingBone = p.heldItem;
          boneArmKey = k;
          break;
        }
      }

      if (carryingBone && inClaimedZone) {
        const artisanHut = findEntityInRadius(ent.x, ent.y, 2, e => !e.destroyed && e.properties.artisan_hut?.isCompleted);
        if (artisanHut && this.actionTimer >= 1.0) {
          this.actionTimer = 0;
          const ownerName = carryingBone.ownerName || carryingBone.sourceName || "Herói Ancestral";
          const isWeapon = Math.random() < 0.55;
          let craftedItem = null;

        if (isWeapon) {
          const weaponTypes = [
            { name: `Lança de Fêmur de ${ownerName}`, damage: 38, skin: "Item_Spear.png" },
            { name: `Adaga de Osso de ${ownerName}`, damage: 28, skin: "Item_Dagger.png" },
            { name: `Clava de Crânio de ${ownerName}`, damage: 35, skin: "Item_Club.png" },
            { name: `Arco de Costela de ${ownerName}`, damage: 32, skin: "Item_Bow.png" },
            { name: `Glaive de Espinha de ${ownerName}`, damage: 40, skin: "Item_Spear.png" }
          ];
          const chosen = weaponTypes[Math.floor(Math.random() * weaponTypes.length)];
          craftedItem = {
            name: chosen.name,
            damage: chosen.damage,
            isWeapon: true,
            weight: 1,
            ownerName: ownerName,
            render: { skin: chosen.skin, color: 0xfff4f1e8, backcolor: 0x00000000 }
          };
        } else {
          const artifactTypes = [
            { name: `Cálice de Crânio de ${ownerName}`, value: 150, skin: "Item_Cup.png" },
            { name: `Flauta de Tíbia de ${ownerName}`, value: 120, skin: "Item_Staff.png" },
            { name: `Totem Sagrado de ${ownerName}`, value: 200, skin: "Item_Totem.png" },
            { name: `Estatueta Macabra de ${ownerName}`, value: 95, skin: "Item_Figurine.png" },
            { name: `Amuleto da Sorte de ${ownerName}`, value: 110, skin: "Item_Amulet.png" }
          ];
          const chosen = artifactTypes[Math.floor(Math.random() * artifactTypes.length)];
          craftedItem = {
            name: chosen.name,
            value: chosen.value,
            isArtifact: true,
            weight: 1,
            ownerName: ownerName,
            render: { skin: chosen.skin, color: 0xfff4f1e8, backcolor: 0x00000000 }
          };
        }

        ent.properties[boneArmKey].heldItem = craftedItem;
        recordWorldEvent({
          opcode: OP_BUILD,
          type: "CRAFT",
          primaryEntityId: ent.id,
          location: { x: ent.x, y: ent.y },
          description: `${ent.properties.name} esculpiu habilmente um(a) '${craftedItem.name}' a partir dos ossos de ${ownerName}!`,
          tick: currentTick,
          timestamp: world?.clock ? { day: world.clock.day, hour: world.clock.hour, minute: world.clock.minute } : null,
          metadata: { craftedName: craftedItem.name, ownerName: ownerName }
        });
        return;
      }
      }

      // C. Home Food Pantry / Storing & Eating at Home
      const ownHouse = getOwnHouse(ent.id, entities);
      if (ownHouse) {
        const distToHouse = Math.abs(ownHouse.x - ent.x) + Math.abs(ownHouse.y - ent.y);
        // Storing food when not starving
        if (isCarryingFood && distToHouse <= 1 && ent.properties.life?.energy >= (ent.properties.life?.max || 5000) * 0.60) {
          for (const k in ent.properties) { const p = ent.properties[k];
            if ((k.startsWith("arm") || k.startsWith("paw") || k.startsWith("fangs")) && p && p.heldItem && (p.heldItem.nutrition || p.heldItem.resourceType === "food" || p.heldItem.resourceType === "fruit" || p.heldItem.resourceType === "meat")) {
              if (!ownHouse.properties.house.foodStorage) ownHouse.properties.house.foodStorage = [];
              if (ownHouse.properties.house.foodStorage.length < 6) {
                ownHouse.properties.house.foodStorage.push(p.heldItem);
                p.heldItem = null;
                break;
              }
            }
          }
        }

        // Eating from pantry when at home / before sleep
        if (distToHouse <= 1 && ent.properties.life?.energy < (ent.properties.life?.max || 5000) * 0.85) {
          if (ownHouse.properties.house.foodStorage && ownHouse.properties.house.foodStorage.length > 0 && ent.properties.stomach) {
            if (ent.properties.stomach.items.length < ent.properties.stomach.capacity) {
              const food = ownHouse.properties.house.foodStorage.shift();
              ent.properties.stomach.items.push({
                name: food.name || "Comida Caseira",
                foodType: food.foodType || "fruit",
                nutrition: food.nutrition || 600,
                totalTurns: food.digestDuration || 25,
                remainingTurns: food.digestDuration || 25
              });
            }
          }
        }
      }

      // D. Storing Surplus & Withdrawing Needed Building Materials from Clan Warehouse
      const completedWarehouse = getGroupWarehouse(group, entities);
      if (completedWarehouse) {
        const distToWh = Math.abs(completedWarehouse.x - ent.x) + Math.abs(completedWarehouse.y - ent.y);
        if (distToWh <= 1) {
          const blueprint = getClanBlueprintTiles(group);
          let needsWood = false;
          let needsStone = false;
          for (const bp of blueprint) {
            if (bp.type === "campfire") {
              const cf = getEntityAtTileByProp(bp.x, bp.y, "campfire");
              if (!cf || cf.isConstructed === false) needsWood = true;
            } else if (bp.type === "well") {
              const wl = getEntityAtTileByProp(bp.x, bp.y, "well");
              if (!wl || !wl.properties.well?.isCompleted) { needsWood = true; needsStone = true; }
            } else if (bp.type === "house" || bp.type === "leader_house") {
              const hs = getEntityAtTileByProp(bp.x, bp.y, "house");
              if (!hs || !hs.properties.house?.isCompleted) { needsWood = true; needsStone = true; }
            }
          }

          // Deposit surplus items only (when hands hold items not immediately needed)
          for (const k in ent.properties) { const p = ent.properties[k];
            if ((k.startsWith("arm") || k.startsWith("paw") || k.startsWith("fangs")) && p && p.heldItem && p.heldItem.resourceType !== "torch" && p.heldItem.resourceType !== "seed") {
              const rType = p.heldItem.resourceType;
              const isNeededNow = (rType === "wood" && needsWood) || ((rType === "stone" || rType === "bone") && needsStone);
              if (!isNeededNow) {
                completedWarehouse.properties.warehouse.items = completedWarehouse.properties.warehouse.items || [];
                completedWarehouse.properties.warehouse.items.push(p.heldItem);
                p.heldItem = null;
              }
            }
          }

          // Withdraw needed materials if hands are free
          if (freeArm && !freeArm.heldItem && (needsWood || needsStone)) {
            const whItems = completedWarehouse.properties.warehouse.items || [];
            const matIdx = whItems.findIndex(i => (needsWood && (i.resourceType === "wood" || i.name?.includes("Wood"))) || (needsStone && (i.resourceType === "stone" || i.resourceType === "bone" || i.name?.includes("Stone"))));
            if (matIdx !== -1) {
              const takenItem = whItems.splice(matIdx, 1)[0];
              freeArm.heldItem = takenItem;
            }
          }
        }
      }

      // B. Farming / Cultivating (if holding Seed)
      if (isCarryingSeed && inClaimedZone) {
        // Enforce Group Tree Planting Quota (between 1 tree per 3 citizens and 3 trees per citizen)
        if (group.treesPerCitizen === undefined) {
          group.treesPerCitizen = 0.33 + Math.random() * (3.0 - 0.33);
        }
        const memberCount = Math.max(1, (group.members || []).length);
        const maxAllowedTrees = Math.max(1, Math.round(memberCount * group.treesPerCitizen));

        // Count living cultivated trees/flora in clan territory
        let currentTreeCount = 0;
        for (let i = 0; i < entities.length; i++) {
          const e = entities[i];
          if (!e.destroyed && (e.properties?.photosynthesis || e.properties?.deep_root || e.properties?.tree || e.properties?.species === "tree" || e.properties?.species === "oak" || e.properties?.species === "pine" || e.properties?.species === "willow" || e.properties?.species === "cactus")) {
            if (isTileInClaimedZones(e.x, e.y, group.claimedZones)) {
              currentTreeCount++;
            }
          }
        }

        if (currentTreeCount >= maxAllowedTrees) {
          // Quota reached: deposit seed into clan storage or drop it instead of over-planting
          for (const k in ent.properties) { const p = ent.properties[k];
            if ((k.startsWith("arm") || k.startsWith("paw") || k.startsWith("fangs")) && p && p.heldItem?.resourceType === "seed") {
              if (!group.storage) group.storage = [];
              if (group.storage.length < 40) {
                group.storage.push(p.heldItem.name || "Seed");
              }
              p.heldItem = null;
              break;
            }
          }
        } else {
          let canPlant = false;
          let targetX = ent.x;
          let targetY = ent.y;

          for (const off of [{dx:0,dy:0}, {dx:1,dy:0}, {dx:-1,dy:0}, {dx:0,dy:1}, {dx:0,dy:-1}]) {
            const px = ent.x + off.dx;
            const py = ent.y + off.dy;
            const tile = world.getTile(px, py);
            const isLand = (tile !== 2 && tile !== 5 && tile !== 1 && tile !== 4);
            const hasNearbyPlant = hasEntityInRadius(px, py, 4, e => !e.destroyed && (e.properties.photosynthesis || e.properties.deep_root || e.properties.tree || e.properties.species === "tree" || e.properties.species === "oak" || e.properties.species === "pine" || e.properties.species === "willow" || e.properties.species === "cactus"));
            if (isLand && !isRoadTile(px, py) && !hasNearbyPlant) {
              targetX = px;
              targetY = py;
              canPlant = true;
              break;
            }
          }

          if (canPlant && this.actionTimer >= 0.5) {
            this.actionTimer = 0;
            let seedSpecies = "oak";
            for (const k in ent.properties) { const p = ent.properties[k];
              if ((k.startsWith("arm") || k.startsWith("paw") || k.startsWith("fangs")) && p && p.heldItem?.resourceType === "seed") {
                seedSpecies = p.heldItem.seedSpecies || "oak";
                p.heldItem = null;
                break;
              }
            }

            let plantedTree = null;
            const plantTile = world.getTile(targetX, targetY);
            if (seedSpecies === "cactus" || plantTile === 3) plantedTree = createCactus(targetX, targetY);
            else if (seedSpecies === "willow") plantedTree = createWillowTree(targetX, targetY);
            else if (seedSpecies === "pine") plantedTree = createPineTree(targetX, targetY);
            else if (seedSpecies === "berry") plantedTree = createBerryBush(targetX, targetY);
            else plantedTree = createOakTree(targetX, targetY);

            entities.push(plantedTree);
            registerEntitySpatial(plantedTree);
            ent.emote = 2;
            return;
          }
        }
      }

      // C. Stockpiling Food / Meat
      if (isCarryingMeat && (inClaimedZone || distToBase <= 4)) {
        for (const k in ent.properties) { const p = ent.properties[k];
          if ((k.startsWith("arm") || k.startsWith("paw") || k.startsWith("fangs")) && p && p.heldItem?.resourceType === "meat") {
            p.heldItem = null;
            break;
          }
        }
        if (!group.storage) group.storage = [];
        group.storage.push("meat");
      }

      // D. Dropping Feces Outside Territory (Cleaning Task)
      if (isCarryingFeces && !inClaimedZone) {
        dropHeldItem(ent, entities, world);
      }

      // ---------------------------------------------------------------------
      // 3. OPPORTUNITY ACTIONS WITH FREE HANDS (Just-in-Time Material Pickup & Mining)
      // ---------------------------------------------------------------------
      if (freeArm && !isCarryingMat && !isCarryingSeed && !isCarryingMeat && !isCarryingFeces) {
        // A. Faxina: Pick up feces inside claimed zones to discard outside
        const nearbyFecesInBase = findEntityInRadius(ent.x, ent.y, 1, e => !e.destroyed && (e.properties.resourceType === "feces" || e.properties.edible?.foodType === "feces") && isTileInClaimedZones(e.x, e.y, group.claimedZones));
        if (nearbyFecesInBase && energyRatio > 0.40) {
          nearbyFecesInBase.destroyed = true;
          freeArm.heldItem = { name: "Excrement / Feces", resourceType: "feces", weight: 1 };
          return;
        }

        // B. Butchering / Dismembering Corpses for Meat & Bones (Desmembrar e Comer)
        const nearbyCorpse = findEntityInRadius(ent.x, ent.y, 1, e => !e.destroyed && e.properties.corpse && (e.properties.corpse.remainingMeatCuts > 0 || e.properties.corpse.remainingBones > 0));
        if (nearbyCorpse) {
          const cut = dismemberCorpse(ent, nearbyCorpse);
          if (cut) {
            freeArm.heldItem = cut;
            ent.emote = 2;
            recordWorldEvent({
              opcode: OP_FEED,
              type: "HARVEST",
              primaryEntityId: ent.id,
              secondaryEntityId: nearbyCorpse.id,
              location: { x: ent.x, y: ent.y },
              description: `${ent.properties.name} desmembrou ${cut.name} de um corpo para alimentação e suprimentos!`,
              tick: currentTick
            });
            return;
          }
        }

        // Calculate exact resource needs for Houses -> Walls -> Gates
        const blueprint = getClanBlueprintTiles(group);
        let totalWoodNeeded = 0;
        let totalStoneNeeded = 0;

        for (const bp of blueprint) {
          if (bp.type === "warehouse") {
            const wh = getEntityAtTileByProp(bp.x, bp.y, "warehouse");
            if (!wh) { totalWoodNeeded += 4; totalStoneNeeded += 4; }
            else if (!wh.properties.warehouse?.isCompleted) {
              const w = wh.properties.warehouse;
              totalWoodNeeded += Math.max(0, (w.woodCost ?? 4) - (w.woodCurrent || 0));
              totalStoneNeeded += Math.max(0, (w.stoneCost ?? 4) - (w.stoneCurrent || 0));
            }
          } else if (bp.type === "campfire") {
            const cf = getEntityAtTileByProp(bp.x, bp.y, "campfire");
            if (!cf) { totalWoodNeeded += 3; }
            else if (cf.isConstructed === false) {
              totalWoodNeeded += Math.max(0, (cf.woodCost ?? 3) - (cf.woodCurrent || 0));
            }
          } else if (bp.type === "well") {
            const wl = getEntityAtTileByProp(bp.x, bp.y, "well");
            if (!wl) { totalWoodNeeded += 2; totalStoneNeeded += 4; }
            else if (!wl.properties.well?.isCompleted) {
              const w = wl.properties.well;
              totalWoodNeeded += Math.max(0, (w.woodCost ?? 2) - (w.woodCurrent || 0));
              totalStoneNeeded += Math.max(0, (w.stoneCost ?? 4) - (w.stoneCurrent || 0));
            }
          } else if (bp.type === "house" || bp.type === "leader_house") {
            const h = getEntityAtTileByProp(bp.x, bp.y, "house");
            if (!h) { totalWoodNeeded += 3; totalStoneNeeded += 2; }
            else if (!h.properties.house?.isCompleted) {
              const hp = h.properties.house;
              totalWoodNeeded += Math.max(0, (hp.woodCost ?? 3) - (hp.woodCurrent || 0));
              totalStoneNeeded += Math.max(0, (hp.stoneCost ?? 2) - (hp.stoneCurrent || 0));
            }
          } else if (bp.type === "gate" || bp.type === "door") {
            const g = getEntityAtTileByProp(bp.x, bp.y, "door");
            if (!g || !g.isConstructed) totalWoodNeeded += 2;
          } else if (bp.type === "wall") {
            const w = getEntityAtTileByProp(bp.x, bp.y, "structure");
            if (!w || !w.isConstructed) totalStoneNeeded += 2;
          }
        }

        const needsWood = totalWoodNeeded > 0;
        const needsStone = totalStoneNeeded > 0;
        const hasUnbuiltStruct = needsWood || needsStone;

        // B. Just-In-Time Resource Pickup (ONLY if unbuilt structure exists)
        if (hasUnbuiltStruct) {
          const nearbyRes = findEntityInRadius(ent.x, ent.y, 16, e => !e.destroyed && ((e.properties.resourceType === "wood" && needsWood) || (e.properties.resourceType === "stone" && needsStone)));
          if (nearbyRes) {
            const dist = Math.max(Math.abs(nearbyRes.x - ent.x), Math.abs(nearbyRes.y - ent.y));
            if (dist <= 1) {
              const isStone = nearbyRes.properties.resourceType === "stone";
              const resName = isStone ? "Stone Block" : "Wood Log";
              nearbyRes.destroyed = true;
              freeArm.heldItem = { name: resName, resourceType: isStone ? "stone" : "wood", weight: 1 };
              return;
            } else {
              ent._buildTarget = nearbyRes;
            }
          }

          // C. Just-In-Time Tree Chopping (Strict quota: halts once needed wood is available)
          if (needsWood) {
            const nearbyTree = getEntitiesInRadius(ent.x, ent.y, 2).find(e => !e.destroyed && Math.max(Math.abs(e.x - ent.x), Math.abs(e.y - ent.y)) <= 1 && (e.properties.photosynthesis || e.properties.deep_root || e.properties.species === "oak" || e.properties.species === "willow" || e.properties.species === "pine" || e.properties.species === "tree"));

            if (nearbyTree && this.actionTimer >= 0.4) {
              this.actionTimer = 0;
              const treeSpecies = nearbyTree.properties.species || "oak";
              const treeX = nearbyTree.x;
              const treeY = nearbyTree.y;
              nearbyTree.destroyed = true;

              // Pick up 1 wood log directly
              freeArm.heldItem = { name: "Wood Log", resourceType: "wood", weight: 1 };

              // Drop 1 fertile seed for replanting
              if (entities) {
                const seedEntity = createEntity(
                  {
                    name: `Seed (${treeSpecies})`,
                    resourceType: "seed",
                    render: { skin: "Item_Egg.png", color: 0xffa0783c, backcolor: 0x00000000 },
                    germination: createSeedGerminationProp(treeSpecies, 8.0, 0.15)
                  },
                  treeX,
                  treeY
                );
                entities.push(seedEntity);
              }
              return;
            }
          }

          // D. Just-In-Time Mining from adjacent rock (Quarrying stone)
          if (needsStone && world) {
            const currentTile = world.getTile(ent.x, ent.y);
            let adjacentStone = (currentTile === 4 || currentTile === 1);
            if (!adjacentStone) {
              const offsets = [
                {dx:1,dy:0}, {dx:-1,dy:0}, {dx:0,dy:1}, {dx:0,dy:-1},
                {dx:1,dy:1}, {dx:1,dy:-1}, {dx:-1,dy:1}, {dx:-1,dy:-1}
              ];
              for (const off of offsets) {
                const at = world.getTile(ent.x + off.dx, ent.y + off.dy);
                if (at === 4 || at === 1) {
                  adjacentStone = true;
                  break;
                }
              }
            }

            if (adjacentStone && this.actionTimer >= 0.4) {
              this.actionTimer = 0;
              freeArm.heldItem = { name: "Stone Block", resourceType: "stone", weight: 1 };
              return;
            }
          }
        }

        // E. Territory Ground Cleaning & Hauling to Warehouse/Pantry with Basket Support
        if (inClaimedZone) {
          const nearbyGroundItem = findEntityInRadius(ent.x, ent.y, 2, e =>
            !e.destroyed &&
            !e.properties.photosynthesis &&
            !e.properties.deep_root &&
            !e.properties.structure &&
            !e.properties.house &&
            !e.properties.door &&
            !e.properties.life &&
            !e.properties.torch &&
            !e.properties.campfire &&
            isTileInClaimedZones(e.x, e.y, group.claimedZones) &&
            (!!e.properties.edible || !!e.properties.resourceType || !!e.properties.germination || e.properties.species === "item" || !!e.properties.attackBonus || !!e.properties.isWeapon || !!e.properties.artifact)
          );
          if (nearbyGroundItem) {
            nearbyGroundItem.destroyed = true;
            const resType = nearbyGroundItem.properties.resourceType || (nearbyGroundItem.properties.edible ? (nearbyGroundItem.properties.edible.foodType || "food") : "item");
            const itemObj = {
              name: nearbyGroundItem.properties.name || (nearbyGroundItem.properties.resourceType ? `${nearbyGroundItem.properties.resourceType}` : "Item"),
              resourceType: resType,
              nutrition: nearbyGroundItem.properties.edible?.nutrition || 600,
              weight: 1
            };

            // Check if any held basket has available space
            let storedInBasket = false;
            for (const k in ent.properties) { const p = ent.properties[k];
              if ((k.startsWith("arm") || k.startsWith("paw") || k.startsWith("fangs")) && p && p.heldItem?.container?.type === "basket") {
                const bCont = p.heldItem.container;
                if (bCont.items.length < bCont.capacity) {
                  bCont.items.push(itemObj);
                  storedInBasket = true;
                  ent.emote = 2;
                  break;
                }
              }
            }

            if (!storedInBasket && freeArm && !freeArm.heldItem) {
              freeArm.heldItem = itemObj;
            }
            return;
          }
        }

        // F. Culinary Cooking at Kitchen (Cook Role or Farmer/Pioneer)
        const nearbyKitchen = findEntityInRadius(ent.x, ent.y, 2, e => !e.destroyed && e.properties.kitchen?.isCompleted);
        if (nearbyKitchen && (ent.properties.role === "Cook" || ent.properties.role === "Farmer" || ent.properties.role === "Pioneer") && this.actionTimer >= 0.40) {
          const completedWarehouse = getGroupWarehouse(group, entities);
          if (completedWarehouse && completedWarehouse.properties.warehouse?.items?.length >= 2) {
            const whItems = completedWarehouse.properties.warehouse.items;
            const meatIndices = [];
            const vegIndices = [];
            const seedIndices = [];
            for (let idx = 0; idx < whItems.length; idx++) {
              const it = whItems[idx];
              if (it.resourceType === "meat" || it.foodType === "meat") meatIndices.push(idx);
              else if (it.resourceType === "seed" || it.foodType === "seed") seedIndices.push(idx);
              else if (it.edible || it.resourceType === "food" || it.foodType === "fruit" || it.foodType === "veg") vegIndices.push(idx);
            }

            let preparedDish = null;
            if (meatIndices.length >= 1 && vegIndices.length >= 1 && seedIndices.length >= 1) {
              // Gourmet Bento
              whItems.splice(seedIndices[0], 1);
              whItems.splice(vegIndices[0], 1);
              whItems.splice(meatIndices[0], 1);
              preparedDish = createGourmetBento(nearbyKitchen.x, nearbyKitchen.y, group.name);
            } else if (meatIndices.length >= 2) {
              // Meat Bento
              whItems.splice(meatIndices[1], 1);
              whItems.splice(meatIndices[0], 1);
              preparedDish = createMeatBento(nearbyKitchen.x, nearbyKitchen.y, group.name);
            } else if (vegIndices.length >= 2 && seedIndices.length >= 1) {
              // Vegan Bento
              whItems.splice(seedIndices[0], 1);
              whItems.splice(vegIndices[1], 1);
              whItems.splice(vegIndices[0], 1);
              preparedDish = createVeganBento(nearbyKitchen.x, nearbyKitchen.y);
            } else if (meatIndices.length >= 1) {
              // Roasted Meat
              whItems.splice(meatIndices[0], 1);
              preparedDish = createRoastedMeat(nearbyKitchen.x, nearbyKitchen.y, group.name);
            } else if (vegIndices.length >= 1) {
              // Grilled Veggies
              whItems.splice(vegIndices[0], 1);
              preparedDish = createGrilledVeggies(nearbyKitchen.x, nearbyKitchen.y);
            }

            if (preparedDish) {
              this.actionTimer = 0;
              entities.push(preparedDish);
              registerEntitySpatial(preparedDish);
              ent.emote = 2;

              // DIRECT WAREHOUSE STOCKPILE DEPOSIT: Store cooked meal in warehouse items so citizens can eat and stock reflects gourmet meals!
              if (completedWarehouse.properties.warehouse?.items) {
                completedWarehouse.properties.warehouse.items.push({
                  name: preparedDish.properties.name,
                  resourceType: "food",
                  foodType: "prepared",
                  edible: {
                    nutrition: preparedDish.properties.edible?.nutrition || 3000,
                    foodType: preparedDish.properties.edible?.foodType || "prepared",
                    moodBonus: preparedDish.properties.edible?.moodBonus || 25
                  },
                  weight: 1
                });
              }

              recordWorldEvent({
                opcode: OP_CRAFT,
                type: "CRAFT",
                primaryEntityId: ent.id,
                location: { x: nearbyKitchen.x, y: nearbyKitchen.y },
                description: `${ent.properties.name} prepared a delicious '${preparedDish.properties.name}' and stored it in the warehouse of '${group.name}'!`,
                tick: currentTick
              });
              return;
            }
          }
        }
      }
    }
  };
}

// Aliases for compatibility
export function createMinerProp() { return createGroupMemberProp(); }
export function createBuilderProp() { return createGroupMemberProp(); }
export function createCrafterProp() { return createGroupMemberProp(); }
export function createButcherProp() { return createGroupMemberProp(); }
export function createCookProp() { return createGroupMemberProp(); }
export function createHaulerProp() { return createGroupMemberProp(); }
export function createFarmerProp() { return createGroupMemberProp(); }
export function createHunterProp() { return createGroupMemberProp(); }
export function createExplorerProp() { return createGroupMemberProp(); }

/**
 * Wood Item
 */
export function createWoodItem(x, y) {
  return createEntity(
    {
      name: "Wood Log",
      resourceType: "wood",
      render: { skin: "Item_Wood.png", color: 0xffa06e32, backcolor: 0x00000000 },
      lifespan: createLifespanProp(90.0) // Decomposes after 1.5 minutes if ignored in the wild
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
      render: { skin: "Feature_Boulders.png", color: 0xffc8c8c8, backcolor: 0x00000000 },
      lifespan: createLifespanProp(90.0) // Sinks into earth after 1.5 minutes if ignored in the wild
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
      name: `Dente de ${ownerName}`,
      resourceType: "bone",
      ownerName: ownerName,
      render: { skin: "Item_Bone.png", color: 0xfff5f5f0, backcolor: 0x00000000 },
      edible: { nutrition: 150, foodType: "bone", digestDuration: 15, sourceName: ownerName },
      lifespan: createLifespanProp(60.0)
    },
    x,
    y
  );
}

/**
 * Bone Item (Raw bone drop carrying original owner name for crafting weapons, artifacts & structures)
 */
export function createBoneItem(x, y, ownerName = "Creature") {
  return createEntity(
    {
      name: `Osso de ${ownerName}`,
      resourceType: "bone",
      ownerName: ownerName,
      render: { skin: "Item_Bone.png", color: 0xfff4f1e8, backcolor: 0x00000000 },
      edible: { nutrition: 120, foodType: "bone", digestDuration: 20, sourceName: ownerName },
      lifespan: createLifespanProp(60.0)
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
 * - Hunger Hunt: Targets specific edible limbs to sever, take food, and disengage/eat without needing to kill.
 * - Hatred/War: Focuses lethal strikes on vitals with the intent to slay the enemy.
 */
export function createCombatProp(attackInterval = 1.2, aggroRange = 3) {
  return {
    attackTimer: 0,
    attackInterval,
    aggroRange,
    effect(ent, dt, world, entities) {
      if (!ent.properties.brain || !ent.properties.life || ent.properties.life.energy <= 100) return;

      // Mystic Grace prevents combat while active!
      // Disengagement cooldown after securing food from predation
      if (ent._combatDisengageUntil && currentTick < ent._combatDisengageUntil) return;

      this.attackTimer = (this.attackTimer || 0) + dt;
      if (this.attackTimer < this.attackInterval) return;

      const energyRatio = ent.properties.life.energy / ent.properties.life.max;
      const isDesperateHunger = energyRatio <= 0.28;

      // Find nearby combat target within attack range
      let combatTarget = null;
      let targetIsHate = false;
      let targetIsHunger = false;

      const nearbyCombatants = getEntitiesInRadius(ent.x, ent.y, 1);

      for (const other of nearbyCombatants) {
        if (other !== ent && !other.destroyed && other.properties.life) {
          // Never attack members of the same group/clan!
          if (ent.properties.group && other.properties.group && ent.properties.group === other.properties.group) {
            continue;
          }

          const dist = Math.abs(other.x - ent.x) + Math.abs(other.y - ent.y);
          if (dist === 1) {
            const isAtWar = ent.properties.group?.wars && other.properties.group && ent.properties.group.wars.includes(other.properties.group.id);
            const affinity = ent.properties.brain.affinities?.[other.id] !== undefined ? ent.properties.brain.affinities[other.id] : 0;
            const isPersonalFeud = affinity < -80 && Math.random() < 0.02; // Very rare to attack just based on hate without war
            const isHateOrWar = isAtWar || isPersonalFeud || (ent.properties.violent && !isDesperateHunger);
            const isHunger = isDesperateHunger && !isHateOrWar;

            if (isHateOrWar || isHunger || (ent.properties.brain.personality?.aggression || 0) > 0.8) {
              combatTarget = other;
              targetIsHate = isHateOrWar;
              targetIsHunger = isHunger;
              break;
            }
          }
        }
      }

      // Structure Attacking: If no living creature to attack, attack adjacent enemy structures (walls, gates, houses) during war or hostility
      if (!combatTarget) {
        for (const other of nearbyCombatants) {
          if (other !== ent && !other.destroyed && other.properties.structure) {
            const dist = Math.abs(other.x - ent.x) + Math.abs(other.y - ent.y);
            if (dist === 1) {
              const isOwnGroup = ent.properties.group && other.properties.house?.ownerId && ent.properties.group.members?.includes(other.properties.house.ownerId);
              const isOwnGate = ent.properties.door?.owners && ent.properties.door.owners.includes(ent.id);
              if (!isOwnGroup && !isOwnGate) {
                let isAtWarWithTarget = false;
                if (ent.properties.group?.wars && other.properties.groupId) {
                  isAtWarWithTarget = ent.properties.group.wars.includes(other.properties.groupId);
                } else if (ent.properties.group?.wars && other.properties.house?.groupId) {
                  isAtWarWithTarget = ent.properties.group.wars.includes(other.properties.house.groupId);
                }
                
                const isViolentOrWar = ent.properties.violent || isAtWarWithTarget || (ent.properties.brain.personality?.aggression || 0) > 0.8;
                if (isViolentOrWar) {
                  combatTarget = other;
                  targetIsHate = true;
                  break;
                }
              }
            }
          }
        }
      }

      if (!combatTarget) return;
      this.attackTimer = 0;
      const target = combatTarget;

      // If target is a structure (House, Wall, Gate): apply direct siege damage
      if (target.properties.structure) {
        let siegePower = 35;
        if (ent.properties.violent) siegePower *= 1.35;
        for (const k in ent.properties) {
          const prop = ent.properties[k];
          if ((k.startsWith("arm") || k.startsWith("paw") || k.startsWith("fangs")) && prop && prop.heldItem?.damage) {
            siegePower += prop.heldItem.damage * 0.8;
            break;
          }
        }
        const struct = typeof target.properties.structure === "object" ? target.properties.structure : { condition: 500, maxCondition: 500, defense: 20 };
        target.properties.structure = struct;
        const defense = struct.defense || 20;
        const netDmg = Math.max(5, Math.round(siegePower - defense * 0.5));
        struct.condition = Math.max(0, (struct.condition || struct.maxCondition || 500) - netDmg);
        target.combatFlash = 6;

        if (struct.condition <= 0) {
          target.destroyed = true;
          recordWorldEvent({
            opcode: OP_DEATH,
            type: "DEATH",
            primaryEntityId: ent.id,
            secondaryEntityId: target.id,
            location: { x: target.x, y: target.y },
            description: `${ent.properties.name} atacou e destruiu completamente '${target.properties.name}'!`,
            tick: currentTick,
            timestamp: world?.clock ? { day: world.clock.day, hour: world.clock.hour, minute: world.clock.minute } : null,
            metadata: { victimName: target.properties.name, killerName: ent.properties.name }
          });
        }
        return;
      }

      // Free hands: if holding a non-weapon resource/food, drop to ground and remember location
      for (const k in ent.properties) {
        const prop = ent.properties[k];
        if ((k.startsWith("arm") || k.startsWith("paw") || k.startsWith("fangs")) && prop && prop.heldItem && !prop.heldItem.damage && Math.random() < 0.75) {
          dropHeldItem(ent, entities, world);
        }
      }

      // 1. Determine Weapon / Limb Used for Attack
      let attackPower = 25; // Base punch/strike
      let usedLimbName = "strike";
      
      const wArmL = ent.properties.arm_left;
      const wArmR = ent.properties.arm_right;
      const wPaw = ent.properties.paw_front_left || ent.properties.paw_front_right;
      const wMouth = ent.properties.mouth;

      if (wArmR?.heldItem?.damage) {
        attackPower = wArmR.heldItem.damage;
        usedLimbName = wArmR.heldItem.name;
      } else if (wArmL?.heldItem?.damage) {
        attackPower = wArmL.heldItem.damage;
        usedLimbName = wArmL.heldItem.name;
      } else if (wPaw && wPaw.clawsCount > 0) {
        attackPower = 35;
        usedLimbName = "claw swipe";
      } else if (wMouth && wMouth.teethCount > 0) {
        attackPower = wMouth.biteDamage || 32;
        usedLimbName = "bite";
      } else if (ent.properties.horns || ent.properties.tusks) {
        attackPower = 38;
        usedLimbName = "horns/tusks";
      } else if (ent.properties.stinger || ent.properties.pincher) {
        attackPower = 42;
        usedLimbName = "stinger/pincher";
      }

      // Trait Modifiers
      if (ent.properties.violent) attackPower *= (ent.properties.violent.damageMultiplier || 1.25);
      if (ent.properties.pacifist) attackPower *= (ent.properties.pacifist.damageMultiplier || 0.70);

      if (attackPower <= 0) return;

      // 2. Target Defense Calculation
      let absorbedDamage = 10; // Base defense
      if (target.properties.arm_left?.heldItem?.defense) {
        absorbedDamage += target.properties.arm_left.heldItem.defense * 1.5;
        target.properties.arm_left.heldItem.defense = Math.max(0, target.properties.arm_left.heldItem.defense - 1);
      }
      if (target.properties.arm_right?.heldItem?.defense) {
        absorbedDamage += target.properties.arm_right.heldItem.defense * 1.5;
        target.properties.arm_right.heldItem.defense = Math.max(0, target.properties.arm_right.heldItem.defense - 1);
      }

      const netDamage = Math.max(8, attackPower - absorbedDamage);
      target.combatFlash = 6;
      let hitPartName = "body";

      // 3. Apply Direct Damage to HP / Brain
      if (target.properties.brain) {
        target.properties.brain.condition = Math.max(0, target.properties.brain.condition - Math.round(netDamage * 0.45));
      }
      if (target.properties.health) {
        target.properties.health.current -= netDamage;
      }

      // Fast, simplified amputation (only check 4 main limbs to avoid object iterations)
      const vulnerableLimbs = ["arm_left", "arm_right", "leg_left", "leg_right", "paw_front_left", "paw_front_right"];
      let severedLimbEntity = null;

      if (Math.random() < 0.25) { // 25% chance to hit a specific limb
        const randLimbKey = vulnerableLimbs[Math.floor(Math.random() * vulnerableLimbs.length)];
        const targetLimb = target.properties[randLimbKey];

        if (targetLimb && !targetLimb.cannotAmputate) {
          hitPartName = `${randLimbKey}`;

          // Traumas
          if (Math.random() < 0.4 && !target.properties.bruise) {
            target.properties.bruise = createBruiseProp(30.0, 1);
          }

          // Immediate Amputation based on damage threshold or critical chance
          if (netDamage > 45 || Math.random() < 0.10) {
            const limbSkin = randLimbKey.startsWith("leg") ? "Item_Drumstick.png" : "Item_Steak.png";
            severedLimbEntity = createEntity(
              {
                name: `Limb (${randLimbKey}) of ${target.properties.name}`,
                species: "item",
                render: { skin: limbSkin, color: 0xffdc5050, backcolor: 0x00000000 },
                edible: { nutrition: 1200, foodType: "meat", digestDuration: 25, partKey: randLimbKey },
                lifespan: createLifespanProp(45.0)
              },
              target.x + (Math.floor(Math.random() * 3) - 1),
              target.y + (Math.floor(Math.random() * 3) - 1)
            );
          if (entities) entities.push(severedLimbEntity);

          delete target.properties[randLimbKey];
          target.properties[`amputated_${randLimbKey}`] = {
            part: randLimbKey,
            bleedRate: 4.0,
            effect(e, dt) {
              if (e.properties.life) {
                e.properties.life.energy = Math.max(0, e.properties.life.energy - dt * this.bleedRate);
              }
              if (e.properties.brain) {
                e.properties.brain.condition = Math.max(0, e.properties.brain.condition - dt * (this.bleedRate * 0.2));
              }
            }
          };

          recordWorldEvent({
            type: "AMPUTATION",
            primaryEntityId: target.id,
            secondaryEntityId: ent.id,
            location: { x: target.x, y: target.y },
            description: `${target.properties.name} had limb '${randLimbKey}' severed by the attack of ${ent.properties.name}!`,
            tick: currentTick,
            timestamp: world?.clock ? { day: world.clock.day, hour: world.clock.hour, minute: world.clock.minute } : null
          });

          // PREDATION SUCCESS: Hungry predator takes the limb, disengages from victim without killing!
          if (targetIsHunger && severedLimbEntity) {
            ent._huntingLimbTarget = severedLimbEntity;
            ent._combatDisengageUntil = currentTick + 150; // Cease attacking victim
            ent.emote = 2; // Happy with food secured
          }
        }
      }
    }

      // Direct shock to vital energy: Hatred/War delivers lethal shock, Hunger focuses on taking limb
      if (target.properties.life) {
        const shockFactor = targetIsHate ? 5.5 : 1.8;
        const energyShock = Math.max(8, Math.round(netDamage * shockFactor));
        target.properties.life.energy = Math.max(0, target.properties.life.energy - energyShock);
      }

      // 4. Record indexed ATTACK event
      const attackerName = ent.properties.name || `Entity #${ent.id}`;
      const targetName = target.properties.name || `Entity #${target.id}`;
      const intentLabel = targetIsHunger ? " [Hunting For Food]" : (targetIsHate ? " [Lethal Hatred Strike]" : "");
      const attackDesc = `${attackerName} struck ${targetName}'s ${hitPartName} with ${usedLimbName}${intentLabel} at [X: ${ent.x}, Y: ${ent.y}]!`;

      target._lastAttacker = {
        id: ent.id,
        name: attackerName,
        species: ent.properties.species || "unknown",
        tick: currentTick,
        time: Date.now()
      };

      // 4. Record indexed ATTACK event (Only for conscious/living beings, never for trees or flora)
      const targetIsFloraOrInanimate = !target.properties.brain || !target.properties.life || target.properties.photosynthesis || target.properties.deep_root || target.properties.species === "oak" || target.properties.species === "willow" || target.properties.species === "pine" || target.properties.species === "tree" || target.properties.species === "cactus";
      if (!targetIsFloraOrInanimate) {
        recordWorldEvent({
          type: "ATTACK",
          primaryEntityId: ent.id,
          secondaryEntityId: target.id,
          location: { x: ent.x, y: ent.y },
          description: attackDesc,
          tick: currentTick,
          timestamp: world?.clock ? { day: world.clock.day, hour: world.clock.hour, minute: world.clock.minute } : null,
          metadata: { attackerName, targetName, usedLimbName, hitPartName, netDamage, absorbed: absorbedDamage, motive: targetIsHate ? "hatred" : (targetIsHunger ? "hunger" : "combat") }
        });
      }

      // 5. Affinity Dynamics upon Attack
      if (target.properties.brain) {
        if (!target.properties.brain.affinities) target.properties.brain.affinities = {};
        target.properties.brain.affinities[ent.id] = -100;
      }
      if (ent.properties.brain) {
        if (!ent.properties.brain.affinities) ent.properties.brain.affinities = {};
        if (targetIsHate) {
          ent.properties.brain.affinities[target.id] = Math.min(-50, (ent.properties.brain.affinities[target.id] || 0) - 50);
        }
      }

      // 6. Bystander Reactions
      if (entities) {
        for (const spectator of entities) {
          if (spectator === ent || spectator === target || spectator.destroyed || !spectator.properties.brain) continue;

          const dist = Math.abs(spectator.x - ent.x) + Math.abs(spectator.y - ent.y);
          const specView = spectator.properties.eye_left?.viewRange || spectator.properties.eye_right?.viewRange || 10;
          if (dist <= specView) {
            if (spectator.properties.violent) {
              const curAff = spectator.properties.brain.affinities?.[ent.id] || 0;
              spectator.properties.brain.affinities[ent.id] = Math.min(100, curAff + 15);
            }

            if (spectator.properties.pacifist) {
              const curAff = spectator.properties.brain.affinities?.[ent.id] || 0;
              spectator.properties.brain.affinities[ent.id] = Math.max(-100, curAff - 20);
            }

            if (target.properties.group && spectator.properties.group === target.properties.group) {
              spectator.properties.brain.affinities[ent.id] = -90;
            }

            if (ent.properties.group && spectator.properties.group === ent.properties.group && target.properties.group && target.properties.group !== ent.properties.group) {
              const loveForVictim = spectator.properties.brain?.affinities?.[target.id] || 0;
              if (loveForVictim >= 85) {
                const groupName = ent.properties.group.name || "Clan";
                if (ent.properties.group.members) {
                  ent.properties.group.members = ent.properties.group.members.filter(id => id !== spectator.id);
                }
                delete spectator.properties.group;
                if (!spectator.properties.brain.affinities) spectator.properties.brain.affinities = {};
                spectator.properties.brain.affinities[ent.id] = -100;

                tryJoinGroup(spectator, target.properties.group, entities);

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

      // 7. Factionless Creature Joining Nearby Close Friends' Clan
      if (!ent.properties.group && ent.properties.brain?.affinities && entities && Math.random() < 0.12) {
        const nearbyEntities = getEntitiesInRadius(ent.x, ent.y, 8);
        for (const friend of nearbyEntities) {
          if (friend !== ent && !friend.destroyed && friend.properties?.group && friend.properties?.brain) {
            const aff = ent.properties.brain.affinities[friend.id] || 0;
            const friendAff = friend.properties.brain.affinities?.[ent.id] || 0;
            if (aff >= 20 || friendAff >= 20) {
              const joined = tryJoinGroup(ent, friend.properties.group, entities, friend);
              if (joined) break;
            }
          }
        }
      }
    }
  };
}

/**
 * High-Performance Local A* Pathfinding (up to 24 tiles distance)
 * Handles terrain costs, walls, and locked/open doors with O(1) node lookups.
 */
export function findPathAStarLocal(startX, startY, targetX, targetY, world, ent, maxNodes = 120, maxDist = 24) {
  if (!world) return null;
  const dist = Math.abs(targetX - startX) + Math.abs(targetY - startY);
  if (dist === 0) return [];
  if (dist > maxDist) {
    const ratio = maxDist / dist;
    targetX = startX + Math.round((targetX - startX) * ratio);
    targetY = startY + Math.round((targetY - startY) * ratio);
  }

  const mapW = world.width || 512;
  const mapH = world.height || 512;
  const isFlying = !!ent?.properties?.flying || ent?.properties?.wings?.flying === true;
  const isAquatic = !!ent?.properties?.aquatic;
  const isTerrestrial = !!ent?.properties?.terrestrial || (!isAquatic && !isFlying);

  function toKey(x, y) { return (x << 16) | (y & 0xffff); }

  const startKey = toKey(startX, startY);
  
  if (!globalThis.astarOpenMap) {
    globalThis.astarOpenMap = new Map();
    globalThis.astarClosedSet = new Set();
    globalThis.astarGScores = new Map();
    globalThis.astarOpenArray = [];
  }
  const openMap = globalThis.astarOpenMap;
  const closedSet = globalThis.astarClosedSet;
  const gScores = globalThis.astarGScores;
  const openArray = globalThis.astarOpenArray;
  
  openMap.clear();
  closedSet.clear();
  gScores.clear();
  openArray.length = 0;

  function pushHeap(node) {
    openArray.push(node);
    let idx = openArray.length - 1;
    while (idx > 0) {
      const pIdx = (idx - 1) >> 1;
      if (openArray[idx].f < openArray[pIdx].f) {
        const tmp = openArray[idx];
        openArray[idx] = openArray[pIdx];
        openArray[pIdx] = tmp;
        idx = pIdx;
      } else break;
    }
  }

  function popHeap() {
    const top = openArray[0];
    const bottom = openArray.pop();
    if (openArray.length > 0) {
      openArray[0] = bottom;
      let idx = 0;
      const len = openArray.length;
      while (true) {
        let left = (idx << 1) + 1;
        let right = left + 1;
        let smallest = idx;
        if (left < len && openArray[left].f < openArray[smallest].f) smallest = left;
        if (right < len && openArray[right].f < openArray[smallest].f) smallest = right;
        if (smallest !== idx) {
          const tmp = openArray[idx];
          openArray[idx] = openArray[smallest];
          openArray[smallest] = tmp;
          idx = smallest;
        } else break;
      }
    }
    return top;
  }

  const startNode = { x: startX, y: startY, g: 0, f: dist, parent: null };
  pushHeap(startNode);
  openMap.set(startKey, startNode);

  gScores.set(startKey, 0);

  let iterations = 0;
  let closestNode = startNode;
  let minH = dist;

  while (openArray.length > 0 && iterations < maxNodes) {
    iterations++;
    const current = popHeap();
    if (!current) break;

    const curKey = toKey(current.x, current.y);
    openMap.delete(curKey);

    if (current.x === targetX && current.y === targetY) {
      const path = [];
      let curr = current;
      while (curr.parent) {
        path.push({ x: curr.x, y: curr.y });
        curr = curr.parent;
      }
      path.reverse();
      return path;
    }

    closedSet.add(curKey);

    const h = Math.abs(targetX - current.x) + Math.abs(targetY - current.y);
    if (h < minH) {
      minH = h;
      closestNode = current;
    }

    const neighbors = [
      { x: current.x + 1, y: current.y },
      { x: current.x - 1, y: current.y },
      { x: current.x, y: current.y + 1 },
      { x: current.x, y: current.y - 1 }
    ];

    for (let i = 0; i < 4; i++) {
      const nb = neighbors[i];
      const nx = nb.x;
      const ny = nb.y;
      if (nx < 0 || nx >= mapW || ny < 0 || ny >= mapH) continue;

      const nbKey = toKey(nx, ny);
      if (closedSet.has(nbKey)) continue;

      const tTile = world.getTile(nx, ny);
      if (tTile === 5) continue; // Unwalkable deep mountain

      let stepCost = 1.0;
      if (isRoadTile(nx, ny)) {
        stepCost = 0.5; // Significant path preference for paved roads, streets, and avenues!
      } else if (tTile === 2) {
        if (isFlying) stepCost = 1.0;
        else if (isAquatic) stepCost = 0.8;
        else stepCost = 4.0;
      } else if (isAquatic && !isTerrestrial && !isFlying) {
        stepCost = 4.0;
      }

      // Check structure collision (walls & doors)
      if (globalWallCoords.has(`${nx},${ny}`)) {
        const occ = getEntityAtTile(nx, ny);
        if (occ && occ.properties.structure) {
          if (occ.properties.door) {
            const door = occ.properties.door;
            if (door.isOpen || !door.owners || door.owners.length === 0 || (ent && door.owners.includes(ent.id))) {
              stepCost += 1.2;
            } else {
              continue; // Locked door
            }
          } else {
            continue; // Solid wall
          }
        }
      }

      const tentativeG = current.g + stepCost;
      const existingG = gScores.get(nbKey);

      if (existingG === undefined || tentativeG < existingG) {
        gScores.set(nbKey, tentativeG);
        const neighborH = Math.abs(targetX - nx) + Math.abs(targetY - ny);
        const neighborNode = {
          x: nx,
          y: ny,
          g: tentativeG,
          f: tentativeG + neighborH * 1.05,
          parent: current
        };

        const existingNode = openMap.get(nbKey);
        if (existingNode) {
          existingNode.g = tentativeG;
          existingNode.f = neighborNode.f;
          existingNode.parent = current;
        } else {
          openMap.set(nbKey, neighborNode);
          pushHeap(neighborNode);
        }
      }
    }
  }

  if (closestNode && closestNode.parent) {
    const path = [];
    let curr = closestNode;
    while (curr.parent) {
      path.push({ x: curr.x, y: curr.y });
      curr = curr.parent;
    }
    path.reverse();
    return path.length > 0 ? path : null;
  }

  return null;
}

/**
 * Evaluates the current state and urgent shortages of a Clan,
 * dynamically assigning the most appropriate profession roles to living members.
 */
export function evaluateAndAssignClanRoles(group, entities, world) {
  if (!group || !entities) return;

  const livingMembers = (group.members || []).map(id => {
    const e = getEntityById(id);
    return (e && !e.destroyed && e.properties.life) ? e : null;
  }).filter(Boolean);

  if (livingMembers.length === 0) return;

  // 0. Population-Driven Dynamic Territory Expansion:
  // Every kingdom needs at least 1 zone base + 1 additional zone for every 5 citizens!
  const minRequiredZones = Math.max(1, 1 + Math.floor(livingMembers.length / 5));
  if (group.claimedZones && group.claimedZones.length < minRequiredZones) {
    expandClanTerritoryToPopulation(group, minRequiredZones, world || getSimWorld(), livingMembers.length);
  }

  // 1. Analyze Food Stockpile (Storage + Ground in claimed zones)
  let foodCount = (group.storage || []).filter(it => it === "meat" || it === "fruit" || it === "food").length;
  let stoneCount = (group.storage || []).filter(it => it === "stone").length;
  let woodCount = (group.storage || []).filter(it => it === "wood").length;

  for (const zk of group.claimedZones || []) {
    const zp = zk.includes("_") ? zk.split("_") : zk.split(",");
    const zx = parseInt(zp[0], 10);
    const zy = parseInt(zp[1], 10);
    const zoneEntities = getEntitiesInRadius(zx * 8 + 4, zy * 8 + 4, 6);
    for (const e of zoneEntities) {
      if (!e.destroyed) {
        if (e.properties.edible) foodCount++;
        if (e.properties.resourceType === "stone") stoneCount++;
        if (e.properties.resourceType === "wood") woodCount++;
      }
    }
  }

  // 2. Analyze Defensive Perimeter & Housing Needs
  const blueprint = getClanBlueprintTiles(group);
  let unbuiltCount = 0;
  for (const bp of blueprint) {
    if (bp.type === "warehouse") {
      const wh = getEntityAtTileByProp(bp.x, bp.y, "warehouse");
      if (!wh || !wh.properties.warehouse?.isCompleted) unbuiltCount++;
    } else if (bp.type === "campfire") {
      const cf = getEntityAtTileByProp(bp.x, bp.y, "campfire");
      if (!cf || cf.isConstructed === false) unbuiltCount++;
    } else if (bp.type === "well") {
      const wl = getEntityAtTileByProp(bp.x, bp.y, "well");
      if (!wl || !wl.properties.well?.isCompleted) unbuiltCount++;
    } else if (bp.type === "gate" || bp.type === "door") {
      const hasDoor = !!getEntityAtTileByProp(bp.x, bp.y, "door");
      if (!hasDoor) unbuiltCount++;
    } else if (bp.type === "house" || bp.type === "leader_house") {
      const h = getEntityAtTileByProp(bp.x, bp.y, "house");
      if (!h || !h.properties.house?.isCompleted) unbuiltCount++;
    } else {
      const hasWall = !!getEntityAtTileByProp(bp.x, bp.y, "structure");
      if (!hasWall) unbuiltCount++;
    }
  }

  // 3. Analyze Threats (Enemies / active wars / predators nearby)
  let threatLevel = (group.wars && group.wars.length > 0) ? 2 : 0;
  const firstZone = group.claimedZones?.[0] || "32_32";
  const parts = firstZone.includes("_") ? firstZone.split("_") : firstZone.split(",");
  const baseZx = isNaN(parseInt(parts[0], 10)) ? 32 : parseInt(parts[0], 10);
  const baseZy = isNaN(parseInt(parts[1], 10)) ? 32 : parseInt(parts[1], 10);
  const homeBaseX = baseZx * 8 + 4;
  const homeBaseY = baseZy * 8 + 4;

  const threatsCount = countEntitiesInRadius(homeBaseX, homeBaseY, 24, e =>
    e && !e.destroyed && e.properties.life && (!e.properties.group || e.properties.group.id !== group.id) &&
    (e.properties.violent || (group.wars && group.wars.includes(e.properties.group?.id)))
  );
  if (threatsCount > 0) threatLevel += threatsCount;

  // 4. Determine Dynamic Role Quotas with Flexible Multi-Role Support
  const totalPop = livingMembers.length;

  // Small group (<= 3 members) -> Everyone is a Pioneer / Multi-Role Generalist
  if (totalPop <= 3) {
    for (const m of livingMembers) {
      m.properties.role = (m.id === group.leaderId) ? "Leader" : "Pioneer";
    }
    return;
  }

  // Larger groups (4+ members) -> Dynamic role distribution with fallbacks
  let cooksNeeded = totalPop >= 4 ? 1 : 0;
  let butchersNeeded = totalPop >= 5 ? 1 : 0;
  let craftersNeeded = totalPop >= 6 ? 1 : 0;
  let diplomatsNeeded = totalPop >= 12 ? 1 : 0;
  let explorersNeeded = totalPop >= 10 ? 1 : 0;
  let haulersNeeded = totalPop >= 4 ? Math.max(1, Math.ceil(totalPop * 0.20)) : 0;
  let buildersNeeded = unbuiltCount > 0 ? Math.max(1, Math.ceil(totalPop * 0.25)) : 1;
  let farmersNeeded = foodCount < totalPop * 2 ? Math.max(1, Math.ceil(totalPop * 0.20)) : 1;
  let foragersNeeded = (stoneCount + woodCount < 8) ? Math.max(1, Math.ceil(totalPop * 0.15)) : 1;
  let guardsNeeded = threatLevel > 0 ? Math.min(Math.ceil(totalPop * 0.25), threatLevel + 1) : (totalPop >= 6 ? 1 : 0);

  for (const m of livingMembers) {
    if (m.id === group.leaderId) {
      m.properties.role = "Leader";
      continue;
    }

    const hasWeapon = (m.properties.arm_left?.heldItem?.attackBonus > 8 || m.properties.arm_right?.heldItem?.attackBonus > 8);
    const isViolent = !!m.properties.violent || (m.properties.brain?.personality?.aggression || 0) > 0.3;

    if (threatLevel > 0 && guardsNeeded > 0 && (hasWeapon || isViolent)) {
      m.properties.role = "Guard";
      guardsNeeded--;
    } else if (cooksNeeded > 0) {
      m.properties.role = "Cook";
      cooksNeeded--;
    } else if (butchersNeeded > 0) {
      m.properties.role = "Butcher";
      butchersNeeded--;
    } else if (diplomatsNeeded > 0) {
      m.properties.role = "Diplomat";
      diplomatsNeeded--;
    } else if (explorersNeeded > 0) {
      m.properties.role = "Explorer";
      explorersNeeded--;
    } else if (craftersNeeded > 0) {
      m.properties.role = "Crafter";
      craftersNeeded--;
    } else if (haulersNeeded > 0) {
      m.properties.role = "Hauler";
      haulersNeeded--;
      if (!m.properties.backpack) {
        m.properties.backpack = { type: "backpack", size: "large", capacity: 20, items: [] };
      }
      if (!m.properties.arm_left) m.properties.arm_left = createArmProp("Braço Esquerdo", "left");
      if (!m.properties.arm_left.heldItem || m.properties.arm_left.heldItem.resourceType !== "basket") {
        m.properties.arm_left.heldItem = {
          name: "Cesto de Transporte",
          resourceType: "basket",
          skin: "Item_Bag.png",
          container: { type: "basket", capacity: 10, items: [] },
          weight: 1.0
        };
      }
    } else if (unbuiltCount > 0 && buildersNeeded > 0) {
      m.properties.role = "Builder";
      buildersNeeded--;
    } else if (farmersNeeded > 0) {
      m.properties.role = (m.properties.species === "orc" || isViolent) ? "Hunter" : "Farmer";
      farmersNeeded--;
    } else if (foragersNeeded > 0) {
      m.properties.role = "Forager";
      foragersNeeded--;
    } else {
      m.properties.role = "Pioneer"; // Fallback role for extra pops
    }

    // Ensure all citizens have backpacks for personal storage
    if (!m.properties.backpack) {
      m.properties.backpack = { type: "backpack", size: "medium", capacity: 12, items: [] };
    }
  }

  // 5. Politics Cabinet & Diplomat Assignment (Floors 1-6 of Politics Tower)
  if (!group.diplomats) group.diplomats = [null, null, null, null, null, null];
  const candidates = livingMembers.filter(m => m.id !== group.leaderId);
  for (let i = 0; i < 6; i++) {
    const curDiplomatId = group.diplomats[i];
    const curEnt = curDiplomatId ? getEntityById(curDiplomatId) : null;
    if (!curEnt || curEnt.destroyed || curEnt.properties?.health <= 0) {
      const available = candidates.find(c => !group.diplomats.includes(c.id));
      if (available) {
        group.diplomats[i] = available.id;
        if (i === 3) available.properties.diplomatRole = "Interior";
      } else {
        group.diplomats[i] = null;
      }
    }
  }

  // 6. Public Works: Queue Stone Street Paving Projects in Claimed Zones
  const interiorDiplomatId = group.diplomats?.[3];
  const interiorEnt = interiorDiplomatId ? getEntityById(interiorDiplomatId) : null;
  const hasInteriorDiplomat = (interiorEnt && !interiorEnt.destroyed && (interiorEnt.properties?.health ?? 1) > 0) ||
    livingMembers.some(m => m.properties.diplomatRole === "Interior" || (m.properties.role === "Diplomat" && livingMembers.length >= 6));
  const canPlanStoneRoads = (group.resources?.stone > 0) || livingMembers.length >= 3 || hasInteriorDiplomat;

  if (canPlanStoneRoads) {
    const curW = world || getSimWorld();
    if (curW && group.claimedZones && group.claimedZones.length > 0) {
      const sz = currentZoneSize || 8;
      if (!group._plannedStoneRoads) group._plannedStoneRoads = [];

      // Clean invalid / already paved tiles from queue
      group._plannedStoneRoads = group._plannedStoneRoads.filter(r => {
        const curT = curW.getTile ? curW.getTile(r.x, r.y) : (curW.map ? curW.map[r.y * (curW.width || MAP_WIDTH) + r.x] : 0);
        return isDirtRoadTile(curT);
      });

      // If queue needs candidates, scan claimed zones for dirt roads
      if (group._plannedStoneRoads.length < 8) {
        for (const zk of group.claimedZones) {
          const zp = zk.includes("_") ? zk.split("_") : zk.split(",");
          const zx = parseInt(zp[0], 10);
          const zy = parseInt(zp[1], 10);
          if (isNaN(zx) || isNaN(zy)) continue;

          const startX = zx * sz;
          const startY = zy * sz;

          for (let dy = 0; dy < sz; dy++) {
            for (let dx = 0; dx < sz; dx++) {
              const tx = startX + dx;
              const ty = startY + dy;
              if (tx < 0 || tx >= (curW.width || MAP_WIDTH) || ty < 0 || ty >= (curW.height || MAP_HEIGHT)) continue;

              const t = curW.getTile ? curW.getTile(tx, ty) : (curW.map ? curW.map[ty * (curW.width || MAP_WIDTH) + tx] : 0);
              if (isDirtRoadTile(t)) {
                if (!group._plannedStoneRoads.some(r => r.x === tx && r.y === ty)) {
                  group._plannedStoneRoads.push({ x: tx, y: ty });
                }
              }
              if (group._plannedStoneRoads.length >= 16) break;
            }
            if (group._plannedStoneRoads.length >= 16) break;
          }
          if (group._plannedStoneRoads.length >= 16) break;
        }
      }
    }
  }
}

/**
 * Locomotion / Motor Behavior (Intelligent Navigation: Species Agility, Memory, Hunger, Thirst, Predation, Wandering)
 */
export function createLocomotionProp() {
  return {
    stepTimer: 0,
    effect(ent, dt, world, entities) {
      if (!ent.properties.brain || ent.destroyed) return;

      const isFlying = !!ent.properties.flying || ent.properties.wings?.flying === true;
      const isAquatic = !!ent.properties.aquatic;
      const isTerrestrial = !!ent.properties.terrestrial || (!isAquatic && !isFlying);

      // Active Drinking State: creature pauses to drink and replenish bladder
      if (ent._drinkingTimer && ent._drinkingTimer > 0) {
        ent._drinkingTimer -= dt;
        if (ent.properties.bladder) {
          ent.properties.bladder.water = Math.min(ent.properties.bladder.maxWater, ent.properties.bladder.water + dt * 350);
        }
        ent.emote = 2; // Happy / Drinking satisfaction
        if (!ent.properties.bladder || ent.properties.bladder.water >= ent.properties.bladder.maxWater || ent._drinkingTimer <= 0) {
          ent._drinkingTimer = 0;
          ent._waterGoal = null;
        }
        return; // Halt movement while actively drinking
      }

      let totalLegPower = 0;
      let legCount = 0;
      for (const key in ent.properties) {
        const prop = ent.properties[key];
        if ((key.startsWith("leg") || key.startsWith("paw")) && prop && prop.condition !== undefined) {
          totalLegPower += (prop.quality * (prop.condition / prop.maxCondition));
          legCount++;
        }
      }

      if (!isFlying && !isAquatic && (legCount === 0 || totalLegPower <= 0.05)) return; // Paralyzed walker

      const currentTile = world ? world.getTile(ent.x, ent.y) : 0;
      const inWater = currentTile === 2;

      // Sleeping creatures cannot move and remain helpless while resting
      if (ent.properties.life?.isSleeping) return;

      // Species-specific Locomotion Speed:
      const species = ent.properties.species || "human";
      let speciesSpeed = SPECIES_SPEED_MULTIPLIERS[species] || 1.0;
      if (species === "serpent") {
        speciesSpeed = inWater ? 1.40 : 0.55;
      }
      if (ent.properties.locomotion?.speedBonus) {
        speciesSpeed *= ent.properties.locomotion.speedBonus;
      }
      // Speed boost on paved street / road network
      if (isRoadTile(ent.x, ent.y)) {
        speciesSpeed *= 1.45;
      }

      const waterRatio = ent.properties.bladder ? (ent.properties.bladder.water / ent.properties.bladder.maxWater) : 1.0;
      let speedFactor = (isFlying ? 2.2 : (isAquatic && legCount === 0 ? 1.6 : (totalLegPower / Math.max(1, legCount)))) * speciesSpeed;
      if (waterRatio <= 0.15) {
        speedFactor *= 0.65; // Sluggish / fatigued when severely dehydrated
      }

      // Dynamic Weight Encumbrance: Calculate load from held items, baskets, and backpacks
      let totalCarriedWeight = 0;
      for (const k in ent.properties) {
        const p = ent.properties[k];
        if (!p) continue;
        if ((k.startsWith("arm") || k.startsWith("paw") || k.startsWith("fangs")) && p.heldItem) {
          totalCarriedWeight += (p.heldItem.weight || 1.0);
          if (p.heldItem.container && p.heldItem.container.items) {
            totalCarriedWeight += p.heldItem.container.items.length * 0.5;
          }
        }
        if (p.container && p.container.items) {
          totalCarriedWeight += p.container.items.length * 0.4;
        }
      }
      const encumbranceMult = 1.0 / (1.0 + totalCarriedWeight * 0.08);
      speedFactor *= encumbranceMult;

      const moveInterval = Math.max(0.10, 0.85 / Math.max(0.1, speedFactor));

      this.stepTimer = (this.stepTimer || 0) + dt;
      if (this.stepTimer < moveInterval) return;
      this.stepTimer = 0;

      const energyRatio = ent.properties.life ? (ent.properties.life.energy / ent.properties.life.max) : 1.0;
      const viewRange = ent.properties.eye_left?.viewRange || ent.properties.eye_right?.viewRange || 10;

      let chosenDx = 0;
      let chosenDy = 0;
      let hasIntention = false;
      let targetInWater = false;
      let isFleeingHostile = false;

      // -----------------------------------------------------------------------
      // Priority 0: Terrestrial Creature Stranded in Water -> Escape to Dry Land!
      // -----------------------------------------------------------------------
      if (isTerrestrial && !isAquatic && !isFlying && inWater && world) {
        const landTarget = findNearestLandTile(world, ent.x, ent.y, 40);
        if (landTarget) {
          chosenDx = Math.sign(landTarget.x - ent.x);
          chosenDy = Math.sign(landTarget.y - ent.y);
          hasIntention = true;
          ent._navGoal = null;
          ent._taskGoal = null;
        }
      }

      // -----------------------------------------------------------------------
      // Priority 1: Fatigue & Bedtime (Night time with house or critical exhaustion <= 15%)
      // -----------------------------------------------------------------------
      const isNightLoco = world?.clock ? (world.clock.hour >= 21 || world.clock.hour < 5) : false;
      const isTiredLoco = energyRatio <= 0.15 || (isNightLoco && energyRatio <= 0.60);

      if (!hasIntention && isTiredLoco && entities) {
        const ownHouse = getOwnHouse(ent.id, entities);
        if (ownHouse) {
          const distToHouse = Math.abs(ownHouse.x - ent.x) + Math.abs(ownHouse.y - ent.y);
          if (distToHouse > 0) {
            chosenDx = Math.sign(ownHouse.x - ent.x);
            chosenDy = Math.sign(ownHouse.y - ent.y);
            hasIntention = true;
            ent._navGoal = null;
            ent._taskGoal = null;
          } else {
            // Arrived home: go to sleep safely!
            ent.properties.life.isSleeping = true;
            ent.emote = 8; // Emote_Sleeping.png
            return;
          }
        } else if (energyRatio <= 0.15 || isNightLoco) {
          // Outdoors rest (settlers without house yet or wild animals)
          ent.properties.life.isSleeping = true;
          ent.emote = 8; // Emote_Sleeping.png
          return;
        }
      }

      // -----------------------------------------------------------------------
      // Priority 1.5: Pacifist / Hostile Escape (Flee towards home or away from threats)
      // -----------------------------------------------------------------------
      if (!hasIntention && ent.properties.pacifist) {
        let nearestHostile = null;
        let minThreatDist = 999;
        const nearbyHostiles = getEntitiesInRadius(ent.x, ent.y, viewRange);

        for (const other of nearbyHostiles) {
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
          const ownHouse = entities?.find(e => !e.destroyed && e.properties.house?.isCompleted && (e.properties.house.ownerId === ent.id || e.properties.house.partnerId === ent.id));
          if (ownHouse) {
            chosenDx = Math.sign(ownHouse.x - ent.x);
            chosenDy = Math.sign(ownHouse.y - ent.y);
          } else {
            chosenDx = -Math.sign(nearestHostile.x - ent.x);
            chosenDy = -Math.sign(nearestHostile.y - ent.y);
          }
          hasIntention = true;
          isFleeingHostile = true;
          ent._navGoal = null;
          ent._taskGoal = null;
        }
      }

      // -----------------------------------------------------------------------
      // Priority 2: Secured Severed Limb / Meat Consumption & Seclusion
      // -----------------------------------------------------------------------
      // If creature secured a severed limb from predation, move to eat it on spot or retreat safely
      if (!hasIntention && ent._huntingLimbTarget && !ent._huntingLimbTarget.destroyed) {
        const limb = ent._huntingLimbTarget;
        const ldist = Math.abs(limb.x - ent.x) + Math.abs(limb.y - ent.y);

        if (ldist <= 1) {
          // Reached the severed limb! Ingest or feed on it
          if (ent.properties.stomach) {
            ent.properties.stomach.items.push({
              name: limb.properties.name,
              nutrition: limb.properties.edible?.nutrition || 1000,
              foodType: "meat",
              totalTurns: 20,
              remainingTurns: 20
            });
            limb.destroyed = true;
            ent._huntingLimbTarget = null;
            ent.emote = 2; // Happy
          }
        } else {
          chosenDx = Math.sign(limb.x - ent.x);
          chosenDy = Math.sign(limb.y - ent.y);
          hasIntention = true;
        }
      }

      // -----------------------------------------------------------------------
      // Priority 3: Food Hauling Delivery (Return harvested meat/fruit to clan warehouse/stockpile)
      // -----------------------------------------------------------------------
      const isCarryingFoodHaul = isCarryingItem(ent, "meat") || isCarryingItem(ent, "fruit") || isCarryingItem(ent, "food") || isCarryingItem(ent, "crop");
      if (!hasIntention && isCarryingFoodHaul && ent.properties.group && energyRatio > 0.35 && waterRatio > 0.25) {
        const group = ent.properties.group;
        const warehouse = getGroupWarehouse(group, entities);
        if (warehouse) {
          chosenDx = Math.sign(warehouse.x - ent.x);
          chosenDy = Math.sign(warehouse.y - ent.y);
        } else {
          const firstZone = group.claimedZones?.[0] || "32_32";
          const parts = firstZone.includes("_") ? firstZone.split("_") : firstZone.split(",");
          const baseZx = isNaN(parseInt(parts[0], 10)) ? 32 : parseInt(parts[0], 10);
          const baseZy = isNaN(parseInt(parts[1], 10)) ? 32 : parseInt(parts[1], 10);
          const homeBaseX = baseZx * 8 + 4;
          const homeBaseY = baseZy * 8 + 4;
          chosenDx = Math.sign(homeBaseX - ent.x);
          chosenDy = Math.sign(homeBaseY - ent.y);
        }
        hasIntention = true;
      }

      // -----------------------------------------------------------------------
      // Priority 3.5: Active Navigation Intent Goal (Explicit Actionable Target)
      // -----------------------------------------------------------------------
      if (!hasIntention && ent._navGoal) {
        const goal = ent._navGoal;
        goal.ttl = (goal.ttl || 30) - 1;
        const gdist = Math.abs(goal.x - ent.x) + Math.abs(goal.y - ent.y);
        if (goal.ttl <= 0 || gdist <= 1) {
          ent._navGoal = null;
        } else {
          chosenDx = Math.sign(goal.x - ent.x);
          chosenDy = Math.sign(goal.y - ent.y);
          hasIntention = true;
        }
      }

      // -----------------------------------------------------------------------
      // Priority 4: Thirst & Hydration (Preventive at <= 50%, Urgent at <= 25%)
      // -----------------------------------------------------------------------
      if (!hasIntention && waterRatio <= 0.50 && world) {
        let isNearWaterSource = false;
        
        // 1. Check adjacent water tiles
        for (const off of [{ dx: 0, dy: 0 }, { dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 }]) {
          if (world.getTile(ent.x + off.dx, ent.y + off.dy) === 2) {
            isNearWaterSource = true;
            break;
          }
        }

        // 2. Check adjacent completed wells
        if (!isNearWaterSource && entities) {
          for (const e of entities) {
            if (!e.destroyed && (e.properties?.well?.isCompleted || e.properties?.isWell) && (Math.abs(e.x - ent.x) + Math.abs(e.y - ent.y) <= 1)) {
              isNearWaterSource = true;
              break;
            }
          }
        }

        if (isNearWaterSource) {
          // Initiate active drinking action!
          ent._drinkingTimer = 3.0;
          ent.emote = 2; // Happy
          ent._waterGoal = null;
          return;
        }

        // Not adjacent yet -> seek nearest well in territory or nearest shore/water tile!
        if (!ent._waterGoal || Math.abs(ent._waterGoal.x - ent.x) + Math.abs(ent._waterGoal.y - ent.y) > 40) {
          let bestWell = null;
          let minWellDist = 999;
          if (entities) {
            for (const e of entities) {
              if (!e.destroyed && (e.properties?.well?.isCompleted || e.properties?.isWell)) {
                const wd = Math.abs(e.x - ent.x) + Math.abs(e.y - ent.y);
                if (wd < minWellDist && wd <= 35) {
                  minWellDist = wd;
                  bestWell = e;
                }
              }
            }
          }

          if (bestWell) {
            ent._waterGoal = { x: bestWell.x, y: bestWell.y };
          } else {
            const shoreTarget = isTerrestrial && !isAquatic
              ? findNearestShoreTile(world, ent.x, ent.y, 40)
              : findNearestWaterTile(world, ent.x, ent.y, 40);
            if (shoreTarget) {
              ent._waterGoal = { x: shoreTarget.x, y: shoreTarget.y };
            }
          }
        }

        if (ent._waterGoal) {
          chosenDx = Math.sign(ent._waterGoal.x - ent.x);
          chosenDy = Math.sign(ent._waterGoal.y - ent.y);
          hasIntention = true;
        }
      } else if (waterRatio > 0.65) {
        ent._waterGoal = null;
      }

      // -----------------------------------------------------------------------
      // Priority 5: Hunger (Energy <= 35% or empty stomach with energy <= 45%) -> Seek Food from Warehouse, Stockpile, or Wild
      // -----------------------------------------------------------------------
      if (!hasIntention && (energyRatio <= 0.35 || (ent.properties.stomach && ent.properties.stomach.items.length === 0 && energyRatio <= 0.45))) {
        const warehouse = ent.properties.group ? getGroupWarehouse(ent.properties.group, entities) : null;
        const hasWhFood = warehouse?.properties?.warehouse?.items?.some(it => it.foodType || it.edible || it.resourceType === "meat" || it.resourceType === "fruit" || it.name?.includes("Meat") || it.name?.includes("Fruit") || it.name?.includes("Berry") || it.name?.includes("Carne") || it.name?.includes("Fruta") || it.name?.includes("Crop"));
        const hasGroupFood = ent.properties.group?.storage?.some(it => it === "meat" || it === "fruit" || it === "food");

        if (hasWhFood && warehouse) {
          chosenDx = Math.sign(warehouse.x - ent.x);
          chosenDy = Math.sign(warehouse.y - ent.y);
          hasIntention = true;
        } else if (hasGroupFood) {
          const firstZone = ent.properties.group.claimedZones?.[0] || "32_32";
          const parts = firstZone.includes("_") ? firstZone.split("_") : firstZone.split(",");
          const baseZx = isNaN(parseInt(parts[0], 10)) ? 32 : parseInt(parts[0], 10);
          const baseZy = isNaN(parseInt(parts[1], 10)) ? 32 : parseInt(parts[1], 10);
          const homeBaseX = baseZx * 8 + 4;
          const homeBaseY = baseZy * 8 + 4;
          chosenDx = Math.sign(homeBaseX - ent.x);
          chosenDy = Math.sign(homeBaseY - ent.y);
          hasIntention = true;
        } else {
          // Check if current locked food target is still valid
          let foodTarget = null;
          if (ent._foodGoalTargetId) {
            const lFood = getEntityById(ent._foodGoalTargetId);
            const locked = (lFood && !lFood.destroyed && lFood.properties.edible) ? lFood : null;
            if (locked && (Math.abs(locked.x - ent.x) + Math.abs(locked.y - ent.y)) <= 55) {
              foodTarget = locked;
            } else {
              ent._foodGoalTargetId = null;
            }
          }

          if (!foodTarget) {
            let highestFoodScore = -Infinity;
            const nearbyEdibles = getEntitiesInRadius(ent.x, ent.y, 20);
            for (const item of nearbyEdibles) {
              if (!item.destroyed && item.properties.edible) {
                const dist = Math.abs(item.x - ent.x) + Math.abs(item.y - ent.y);
                let score = 100 - dist * 2;
                const ed = item.properties.edible;

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
                  foodTarget = item;
                }
              }
            }
            if (foodTarget) {
              ent._foodGoalTargetId = foodTarget.id;
            }
          }

          if (foodTarget) {
            chosenDx = Math.sign(foodTarget.x - ent.x);
            chosenDy = Math.sign(foodTarget.y - ent.y);
            hasIntention = true;
            if (world && world.getTile(foodTarget.x, foodTarget.y) === 2) {
              targetInWater = true;
            }
          }
        }
      } else if (energyRatio > 0.40) {
        ent._foodGoalTargetId = null;
      }

      // -----------------------------------------------------------------------
      // Priority 6: Desperate Hunger Predation (Energy <= 20%) -> Hunt limbs of prey!
      // -----------------------------------------------------------------------
      if (!hasIntention && energyRatio <= 0.20) {
        let bestPrey = null;
        let highestPreyScore = -Infinity;
        const nearbyPreyCandidates = getEntitiesInRadius(ent.x, ent.y, viewRange + 6);

        for (const prey of nearbyPreyCandidates) {
          if (prey !== ent && !prey.destroyed && prey.properties.life) {
            const dist = Math.abs(prey.x - ent.x) + Math.abs(prey.y - ent.y);
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
      // Priority 7: Fluid Group Cooperation & Autonomous Tasks
      // -----------------------------------------------------------------------
      if (!hasIntention && ent.properties.group && entities && energyRatio > 0.25) {
        const group = ent.properties.group;
        const firstZone = group.claimedZones?.[0] || "32_32";
        const parts = firstZone.includes("_") ? firstZone.split("_") : firstZone.split(",");
        const baseZx = isNaN(parseInt(parts[0], 10)) ? 32 : parseInt(parts[0], 10);
        const baseZy = isNaN(parseInt(parts[1], 10)) ? 32 : parseInt(parts[1], 10);
        const homeBaseX = baseZx * 8 + 4;
        const homeBaseY = baseZy * 8 + 4;

        let heldResType = null;
        for (const k in ent.properties) { const p = ent.properties[k];
          if ((k.startsWith("arm") || k.startsWith("paw") || k.startsWith("fangs")) && p && (p.heldItem?.resourceType === "stone" || p.heldItem?.resourceType === "wood" || p.heldItem?.resourceType === "bone")) {
            heldResType = p.heldItem.resourceType;
            break;
          }
        }
        
        const isCarryingMat = isCarryingItem(ent, "stone") || isCarryingItem(ent, "wood");
        const isCarryingSeed = isCarryingItem(ent, "seed");
        const isCarryingMeat = isCarryingItem(ent, "meat");
        const isCarryingFeces = isCarryingItem(ent, "feces");
        let hasUnbuiltStruct = false;

        // 0. Active War: Intercept and attack enemy clan members within range!
        if (group.wars && group.wars.length > 0) {
          let nearestEnemy = null;
          let minEnemyDist = 9999;
          const nearbyEnemies = getEntitiesInRadius(ent.x, ent.y, viewRange + 12);
          for (const other of nearbyEnemies) {
            if (other !== ent && !other.destroyed && other.properties.life && other.properties.group && group.wars.includes(other.properties.group.id)) {
              const edist = Math.abs(other.x - ent.x) + Math.abs(other.y - ent.y);
              if (edist < minEnemyDist) {
                minEnemyDist = edist;
                nearestEnemy = other;
              }
            }
          }
          if (nearestEnemy) {
            chosenDx = Math.sign(nearestEnemy.x - ent.x);
            chosenDy = Math.sign(nearestEnemy.y - ent.y);
            hasIntention = true;
          }
        }

        // 1. If carrying seed: cultivate and plant inside territory with spacing
        if (!hasIntention && isCarryingSeed) {
          let targetPlot = null;
          for (let r = 1; r <= 10; r++) {
            for (let dy = -r; dy <= r; dy++) {
              for (let dx = -r; dx <= r; dx++) {
                if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
                const px = ent.x + dx;
                const py = ent.y + dy;
                if (isTileInClaimedZones(px, py, group.claimedZones) && isLandTile(px, py) && !isRoadTile(px, py)) {
                  targetPlot = { x: px, y: py };
                  break;
                }
              }
              if (targetPlot) break;
            }
            if (targetPlot) break;
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

        // 2. If carrying building materials (stone or wood): deliver strictly to structures that need that resource!
        else if (!hasIntention && isCarryingMat) {
          const blueprint = getClanBlueprintTiles(group);
          let targetBuild = null;
          let minBuildDist = 9999;


          const livingClanMembers = (group.members || []).filter(mid => {
            const m = getEntityById(mid);
            return m && !m.destroyed;
          });

          const completedHousesCount = entities.filter(e => !e.destroyed && e.properties.house?.isCompleted && (group.members?.includes(e.properties.house.ownerId) || group.members?.includes(e.properties.house.partnerId))).length;
          const allMembersHoused = completedHousesCount >= Math.max(1, livingClanMembers.length);

          // Priority 2.0: Own House (Top Personal Priority) -> Other Houses -> Settlement Infrastructure
          for (const bp of blueprint) {
            if (bp.type === "house" || bp.type === "leader_house") {
              const houseEnt = getEntityAtTileByProp(bp.x, bp.y, "house");
              let needsThisMat = false;
              if (!houseEnt) {
                needsThisMat = true;
              } else if (!houseEnt.properties.house?.isCompleted) {
                const h = houseEnt.properties.house;
                const wCost = h.woodCost ?? 3;
                const sCost = h.stoneCost ?? 2;
                const bCost = h.boneCost ?? 0;
                if (heldResType === "wood" && (h.woodCurrent || 0) < wCost) needsThisMat = true;
                if (heldResType === "stone" && (h.stoneCurrent || 0) < sCost) needsThisMat = true;
                if (heldResType === "bone" && (h.boneCurrent || 0) < bCost) needsThisMat = true;
                if (!needsThisMat && ((h.woodCurrent || 0) < wCost || (h.stoneCurrent || 0) < sCost || (h.boneCurrent || 0) < bCost)) needsThisMat = true;
              }

              if (needsThisMat) {
                const dist = Math.abs(bp.x - ent.x) + Math.abs(bp.y - ent.y);
                const isOwnHouse = (bp.ownerId === ent.id);
                const isLeaderPlot = bp.isLeaderHouse || bp.type === "leader_house";
                const weightDist = isLeaderPlot ? dist * 0.02 : (isOwnHouse ? dist * 0.05 : dist * 0.25);
                if (weightDist < minBuildDist) {
                  minBuildDist = weightDist;
                  targetBuild = { x: bp.x, y: bp.y, type: bp.type, isLeaderHouse: isLeaderPlot, footprintW: isLeaderPlot ? 3 : (bp.footprintW || 1), footprintH: isLeaderPlot ? 3 : (bp.footprintH || 1), ownerId: bp.ownerId };
                }
              }
            } else if (bp.type === "warehouse") {
              const wh = getEntityAtTileByProp(bp.x, bp.y, "warehouse");
              let needsThisMat = false;
              if (!wh) {
                needsThisMat = true;
              } else if (!wh.properties.warehouse?.isCompleted) {
                const w = wh.properties.warehouse;
                const wCost = w.woodCost ?? 2;
                const sCost = w.stoneCost ?? 2;
                if (heldResType === "wood" && (w.woodCurrent || 0) < wCost) needsThisMat = true;
                if ((heldResType === "stone" || heldResType === "bone") && (w.stoneCurrent || 0) < sCost) needsThisMat = true;
              }

              if (needsThisMat) {
                const dist = Math.abs(bp.x - ent.x) + Math.abs(bp.y - ent.y);
                const weightDist = dist * 0.50;
                if (weightDist < minBuildDist) {
                  minBuildDist = weightDist;
                  targetBuild = { x: bp.x, y: bp.y, type: "warehouse" };
                }
              }
            } else if (bp.type === "campfire") {
              const cf = getEntityAtTileByProp(bp.x, bp.y, "campfire");
              let needsThisMat = false;
              if (!cf) {
                if (heldResType === "wood") needsThisMat = true;
              } else if (cf.isConstructed === false) {
                const wCost = cf.woodCost ?? 3;
                if (heldResType === "wood" && (cf.woodCurrent || 0) < wCost) needsThisMat = true;
              }

              if (needsThisMat) {
                const dist = Math.abs(bp.x - ent.x) + Math.abs(bp.y - ent.y);
                const weightDist = dist * 0.60;
                if (weightDist < minBuildDist) {
                  minBuildDist = weightDist;
                  targetBuild = { x: bp.x, y: bp.y, type: "campfire" };
                }
              }
            } else if (bp.type === "well") {
              const wl = getEntityAtTileByProp(bp.x, bp.y, "well");
              let needsThisMat = false;
              if (!wl) {
                needsThisMat = true;
              } else if (!wl.properties.well?.isCompleted) {
                const w = wl.properties.well;
                const wCost = w.woodCost ?? 2;
                const sCost = w.stoneCost ?? 4;
                if (heldResType === "wood" && (w.woodCurrent || 0) < wCost) needsThisMat = true;
                if ((heldResType === "stone" || heldResType === "bone") && (w.stoneCurrent || 0) < sCost) needsThisMat = true;
              }

              if (needsThisMat) {
                const dist = Math.abs(bp.x - ent.x) + Math.abs(bp.y - ent.y);
                const weightDist = dist * 0.60;
                if (weightDist < minBuildDist) {
                  minBuildDist = weightDist;
                  targetBuild = { x: bp.x, y: bp.y, type: "well" };
                }
              }
            } else if (bp.type === "slaughterhouse") {
              const sh = getEntityAtTileByProp(bp.x, bp.y, "slaughterhouse");
              let needsThisMat = false;
              if (!sh) {
                needsThisMat = true;
              } else if (!sh.properties.slaughterhouse?.isCompleted) {
                const s = sh.properties.slaughterhouse;
                const wCost = s.woodCost ?? 3;
                const sCost = s.stoneCost ?? 2;
                if (heldResType === "wood" && (s.woodCurrent || 0) < wCost) needsThisMat = true;
                if ((heldResType === "stone" || heldResType === "bone") && (s.stoneCurrent || 0) < sCost) needsThisMat = true;
              }

              if (needsThisMat) {
                const dist = Math.abs(bp.x - ent.x) + Math.abs(bp.y - ent.y);
                const weightDist = dist * 0.70;
                if (weightDist < minBuildDist) {
                  minBuildDist = weightDist;
                  targetBuild = { x: bp.x, y: bp.y, type: "slaughterhouse" };
                }
              }
            } else if (bp.type === "kitchen") {
              const kit = getEntityAtTileByProp(bp.x, bp.y, "kitchen");
              let needsThisMat = false;
              if (!kit) {
                needsThisMat = true;
              } else if (!kit.properties.kitchen?.isCompleted) {
                const k = kit.properties.kitchen;
                const wCost = k.woodCost ?? 2;
                const sCost = k.stoneCost ?? 3;
                if (heldResType === "wood" && (k.woodCurrent || 0) < wCost) needsThisMat = true;
                if ((heldResType === "stone" || heldResType === "bone") && (k.stoneCurrent || 0) < sCost) needsThisMat = true;
              }

              if (needsThisMat) {
                const dist = Math.abs(bp.x - ent.x) + Math.abs(bp.y - ent.y);
                const weightDist = dist * 0.70;
                if (weightDist < minBuildDist) {
                  minBuildDist = weightDist;
                  targetBuild = { x: bp.x, y: bp.y, type: "kitchen" };
                }
              }
            } else if (bp.type === "artisan_hut") {
              const art = getEntityAtTileByProp(bp.x, bp.y, "artisan_hut");
              let needsThisMat = false;
              if (!art) {
                needsThisMat = true;
              } else if (!art.properties.artisan_hut?.isCompleted) {
                const a = art.properties.artisan_hut;
                const wCost = a.woodCost ?? 6;
                const sCost = a.stoneCost ?? 4;
                if (heldResType === "wood" && (a.woodCurrent || 0) < wCost) needsThisMat = true;
                if ((heldResType === "stone" || heldResType === "bone") && (a.stoneCurrent || 0) < sCost) needsThisMat = true;
              }

              if (needsThisMat) {
                const dist = Math.abs(bp.x - ent.x) + Math.abs(bp.y - ent.y);
                const weightDist = dist * 0.70;
                if (weightDist < minBuildDist) {
                  minBuildDist = weightDist;
                  targetBuild = { x: bp.x, y: bp.y, type: "artisan_hut" };
                }
              }
            }
          }

          // Check any existing unfinished house in territory
          for (const e of entities) {
            if (!e.destroyed && e.properties.house && !e.properties.house.isCompleted && isTileInClaimedZones(e.x, e.y, group.claimedZones)) {
              const h = e.properties.house;
              const wCost = h.woodCost ?? 3;
              const sCost = h.stoneCost ?? 2;
              const bCost = h.boneCost ?? 0;
              let needsThisMat = false;
              if (heldResType === "wood" && (h.woodCurrent || 0) < wCost) needsThisMat = true;
              if (heldResType === "stone" && (h.stoneCurrent || 0) < sCost) needsThisMat = true;
              if (heldResType === "bone" && (h.boneCurrent || 0) < bCost) needsThisMat = true;
              if (!needsThisMat && ((h.woodCurrent || 0) < wCost || (h.stoneCurrent || 0) < sCost || (h.boneCurrent || 0) < bCost)) needsThisMat = true;

              if (needsThisMat) {
                const dist = Math.abs(e.x - ent.x) + Math.abs(e.y - ent.y);
                const isOwn = (h.ownerId === ent.id || h.partnerId === ent.id);
                const weightDist = isOwn ? dist * 0.05 : dist * 0.25;
                if (weightDist < minBuildDist) {
                  minBuildDist = weightDist;
                  targetBuild = { x: e.x, y: e.y, type: "house" };
                }
              }
            }
          }

          // Priority 2.2: Defensive Walls (Stone only, after all members have completed houses)
          if (!targetBuild && allMembersHoused && heldResType === "stone") {
            for (let i = 0; i < blueprint.length; i++) {
              const bp = blueprint[i];
              if (bp.type === "wall") {
                const wallAtTile = globalWallCoords.has(`${bp.x},${bp.y}`);
                if (!wallAtTile) {
                  const dist = Math.abs(bp.x - ent.x) + Math.abs(bp.y - ent.y);
                  if (dist < minBuildDist) {
                    minBuildDist = dist;
                    targetBuild = { x: bp.x, y: bp.y, type: "wall" };
                  }
                }
              }
            }
          }

          // Priority 2.3: Gates (Wood only, after houses and walls)
          if (!targetBuild && allMembersHoused && heldResType === "wood") {
            for (const bp of blueprint) {
              if (bp.type === "gate" || bp.type === "door") {
                const hasGate = !!getEntityAtTileByProp(bp.x, bp.y, "door");
                if (!hasGate) {
                  const dist = Math.abs(bp.x - ent.x) + Math.abs(bp.y - ent.y);
                  if (dist < minBuildDist) {
                    minBuildDist = dist;
                    targetBuild = { x: bp.x, y: bp.y, type: "gate" };
                  }
                }
              }
            }
          }

          if (targetBuild) {
            ent._buildTarget = { x: targetBuild.x, y: targetBuild.y, type: targetBuild.type, isLeaderHouse: targetBuild.isLeaderHouse, footprintW: targetBuild.footprintW, footprintH: targetBuild.footprintH, ownerId: targetBuild.ownerId };
            const buildChebDist = Math.max(Math.abs(targetBuild.x - ent.x), Math.abs(targetBuild.y - ent.y));
            if (buildChebDist <= 1) {
              chosenDx = 0;
              chosenDy = 0;
              hasIntention = true;
            } else {
              chosenDx = Math.sign(targetBuild.x - ent.x);
              chosenDy = Math.sign(targetBuild.y - ent.y);
              hasIntention = true;
            }
          } else {
            ent._buildTarget = null;
            // Held material/item is not needed by any active construction site: haul it to Warehouse/Stockpile!
            const warehouse = getGroupWarehouse(group, entities);
            if (warehouse) {
              chosenDx = Math.sign(warehouse.x - ent.x);
              chosenDy = Math.sign(warehouse.y - ent.y);
              hasIntention = true;
            } else {
              chosenDx = Math.sign(homeBaseX - ent.x);
              chosenDy = Math.sign(homeBaseY - ent.y);
              hasIntention = true;
            }
          }
        }

        // 2.5 If carrying bone: Crafter should move to Artisan Hut
        else if (!hasIntention && heldResType === "bone") {
          const artisanHut = findEntityInRadius(homeBaseX, homeBaseY, 30, e => !e.destroyed && e.properties.artisan_hut?.isCompleted && e.properties.artisan_hut.groupId === group.id);
          if (artisanHut) {
            chosenDx = Math.sign(artisanHut.x - ent.x);
            chosenDy = Math.sign(artisanHut.y - ent.y);
            hasIntention = true;
          }
        }

        // 3. If carrying meat or food: deliver to own house pantry (up to 2 reserves) or clan stockpile
        else if (!hasIntention && isCarryingMeat) {
          const ownHouse = getOwnHouse(ent.id, entities);
          const needsPantryStock = ownHouse && (ownHouse.properties.house.pantry?.length || 0) < 2;
          if (needsPantryStock) {
            chosenDx = Math.sign(ownHouse.x - ent.x);
            chosenDy = Math.sign(ownHouse.y - ent.y);
          } else {
            chosenDx = Math.sign(homeBaseX - ent.x);
            chosenDy = Math.sign(homeBaseY - ent.y);
          }
          hasIntention = true;
        }

        // 4. If carrying feces: haul it outside the clan territory borders to dump!
        else if (!hasIntention && isCarryingFeces) {
          if (isTileInClaimedZones(ent.x, ent.y, group.claimedZones)) {
            chosenDx = Math.sign(ent.x - homeBaseX) || 1;
            chosenDy = Math.sign(ent.y - homeBaseY) || 1;
            hasIntention = true;
          }
        }

        // 5. If hands are free: role-driven tasks with universal multi-role generalist support
        else if (!hasIntention) {
          const myRole = ent.properties.role || "Pioneer";
          const isPioneer = myRole === "Pioneer";
          const isLeader = myRole === "Leader";
          const isHauler = myRole === "Hauler" || isPioneer;
          const isHunter = myRole === "Hunter" || isPioneer;
          const isButcher = myRole === "Butcher" || isHunter;
          const isCook = myRole === "Cook" || myRole === "Farmer";
          const isFarmer = myRole === "Farmer" || isHunter || isPioneer || isLeader;
          const isBuilder = myRole === "Builder" || isPioneer || isLeader;
          const isForager = myRole === "Forager" || myRole === "Miner" || isPioneer || isLeader;
          const isExplorer = myRole === "Explorer" || isPioneer || isLeader;
          const isCrafter = myRole === "Crafter" || isBuilder || isPioneer || isLeader;
          const isDiplomat = myRole === "Diplomat";
          const isGuard = myRole === "Guard";

          // Calculate exact resource needs for Houses -> Walls -> Gates
          const blueprint = getClanBlueprintTiles(group);
          let totalWoodNeeded = 0;
          let totalStoneNeeded = 0;

          for (const bp of blueprint) {
            if (bp.type === "warehouse") {
              const wh = getEntityAtTileByProp(bp.x, bp.y, "warehouse");
              if (!wh) { totalWoodNeeded += 4; totalStoneNeeded += 4; }
              else if (!wh.properties.warehouse?.isCompleted) {
                const w = wh.properties.warehouse;
                totalWoodNeeded += Math.max(0, (w.woodCost ?? 4) - (w.woodCurrent || 0));
                totalStoneNeeded += Math.max(0, (w.stoneCost ?? 4) - (w.stoneCurrent || 0));
              }
            } else if (bp.type === "campfire") {
              const cf = getEntityAtTileByProp(bp.x, bp.y, "campfire");
              if (!cf) { totalWoodNeeded += 3; }
              else if (cf.isConstructed === false) {
                totalWoodNeeded += Math.max(0, (cf.woodCost ?? 3) - (cf.woodCurrent || 0));
              }
            } else if (bp.type === "well") {
              const wl = getEntityAtTileByProp(bp.x, bp.y, "well");
              if (!wl) { totalWoodNeeded += 2; totalStoneNeeded += 4; }
              else if (!wl.properties.well?.isCompleted) {
                const w = wl.properties.well;
                totalWoodNeeded += Math.max(0, (w.woodCost ?? 2) - (w.woodCurrent || 0));
                totalStoneNeeded += Math.max(0, (w.stoneCost ?? 4) - (w.stoneCurrent || 0));
              }
            } else if (bp.type === "house" || bp.type === "leader_house") {
              const h = getEntityAtTileByProp(bp.x, bp.y, "house");
              if (!h) { totalWoodNeeded += 3; totalStoneNeeded += 2; }
              else if (!h.properties.house?.isCompleted) {
                const hp = h.properties.house;
                totalWoodNeeded += Math.max(0, (hp.woodCost ?? 3) - (hp.woodCurrent || 0));
                totalStoneNeeded += Math.max(0, (hp.stoneCost ?? 2) - (hp.stoneCurrent || 0));
              }
            } else if (bp.type === "gate" || bp.type === "door") {
              const g = getEntityAtTileByProp(bp.x, bp.y, "door");
              if (!g || !g.isConstructed) totalWoodNeeded += 2;
            } else if (bp.type === "wall") {
              const w = getEntityAtTileByProp(bp.x, bp.y, "structure");
              if (!w || !w.isConstructed) totalStoneNeeded += 2;
            }
          }

          const warehouse = getGroupWarehouse(group, entities);
          const needsWood = totalWoodNeeded > 0;
          const needsStone = totalStoneNeeded > 0;
          const hasUnbuiltStruct = needsWood || needsStone;

          // --- 5.1 Construction & Resource Gathering (PRIORITY: Complete houses, warehouse & well first!) ---
          if ((isBuilder || isForager || isPioneer || hasUnbuiltStruct) && !hasIntention && (needsWood || needsStone)) {
            let nearestLooseMat = null;
            let minMatDist = 9999;

            // Check if Warehouse already has needed materials stored
            if (warehouse && warehouse.properties.warehouse?.items) {
              const whItems = warehouse.properties.warehouse.items;
              const hasWhMat = whItems.some(i => (needsWood && (i.resourceType === "wood" || i.name?.includes("Wood"))) || (needsStone && (i.resourceType === "stone" || i.resourceType === "bone" || i.name?.includes("Stone"))));
              if (hasWhMat) {
                const distToWh = Math.abs(warehouse.x - ent.x) + Math.abs(warehouse.y - ent.y);
                if (distToWh < minMatDist) {
                  minMatDist = distToWh;
                  nearestLooseMat = warehouse;
                }
              }
            }

            const nearbyMats = getEntitiesInRadius(ent.x, ent.y, 22);
            for (const e of nearbyMats) {
              if (!e.destroyed) {
                if ((e.properties.resourceType === "wood" && needsWood) || (e.properties.resourceType === "stone" && needsStone)) {
                  const dist = Math.abs(e.x - ent.x) + Math.abs(e.y - ent.y);
                  if (dist < minMatDist) {
                    minMatDist = dist;
                    nearestLooseMat = e;
                  }
                }
              }
            }

            if (nearestLooseMat) {
              chosenDx = Math.sign(nearestLooseMat.x - ent.x);
              chosenDy = Math.sign(nearestLooseMat.y - ent.y);
              hasIntention = true;
            } else if (needsStone && (!needsWood || ent.id % 2 === 0) && world) {
              // Mining stone
              const currentTile = world.getTile(ent.x, ent.y);
              let adjacentStone = (currentTile === 4 || currentTile === 1);
              if (!adjacentStone) {
                for (const off of [{dx:1,dy:0}, {dx:-1,dy:0}, {dx:0,dy:1}, {dx:0,dy:-1}, {dx:1,dy:1}, {dx:1,dy:-1}, {dx:-1,dy:1}, {dx:-1,dy:-1}]) {
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
                ent._taskGoal = null;
              } else {
                let targetStone = null;
                if (ent._taskGoal && ent._taskGoal.type === "mine_stone") {
                  const t = world.getTile(ent._taskGoal.x, ent._taskGoal.y);
                  if (t === 4 || t === 1) {
                    targetStone = { x: ent._taskGoal.x, y: ent._taskGoal.y };
                  } else {
                    ent._taskGoal = null;
                  }
                }

                if (!targetStone) {
                  let minDist = 9999;
                  const maxRad = isExplorer ? 250 : ((world && world.clock && world.clock.minute < 5 && (isPioneer || isBuilder)) ? 150 : 20);
                  for (let r = 1; r <= maxRad; r++) {
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
                  if (targetStone) {
                    ent._taskGoal = { type: "mine_stone", x: targetStone.x, y: targetStone.y };
                  }
                }

                if (targetStone) {
                  chosenDx = Math.sign(targetStone.x - ent.x);
                  chosenDy = Math.sign(targetStone.y - ent.y);
                  hasIntention = true;
                }
              }
            } else if (needsWood) {
              // Felling wild trees (Strict: only when wood is genuinely needed)
              const treePred = e => !e.destroyed && (e.properties.photosynthesis || e.properties.deep_root || e.properties.species === "oak" || e.properties.species === "willow" || e.properties.species === "pine" || e.properties.species === "tree");
              let nearbyTree = null;
              if (world && world.clock && world.clock.minute < 5 && (isPioneer || isBuilder)) {
                let minD = 99999;
                for (let i = 0; i < entities.length; i++) {
                  const e = entities[i];
                  if (treePred(e) && !isTileInClaimedZones(e.x, e.y, group.claimedZones)) {
                    const d = Math.abs(e.x - ent.x) + Math.abs(e.y - ent.y);
                    if (d < minD) { minD = d; nearbyTree = e; }
                  }
                }
              }
              if (!nearbyTree) {
                nearbyTree = findEntityInRadius(ent.x, ent.y, 20, e => treePred(e) && !isTileInClaimedZones(e.x, e.y, group.claimedZones)) || findEntityInRadius(ent.x, ent.y, 20, treePred);
              }

              if (nearbyTree) {
                chosenDx = Math.sign(nearbyTree.x - ent.x);
                chosenDy = Math.sign(nearbyTree.y - ent.y);
                hasIntention = true;
              }
            }
          }

          // --- 5.2 Road & Street Construction (Builders, Pioneers, Leaders & Explorers advance highways & roads without getting distracted) ---
          const curW = getSimWorld();
          const allGroups = curW?.groups || (activeWorld?.groups || []);
          const roadBlueprints = getClanRoadBlueprints(group, allGroups);
          const unbuiltRoads = roadBlueprints.filter(bp => !isRoadTile(bp.x, bp.y) && isRoadFrontierTile(bp.x, bp.y, group));

          if (unbuiltRoads.length > 0 && !hasIntention && (isBuilder || isPioneer || isExplorer || (myRole === "Leader") || !hasUnbuiltStruct || energyRatio > 0.35)) {
            let closestRoad = null;
            let minRDist = 9999;
            for (const rbp of unbuiltRoads) {
              const rd = Math.abs(rbp.x - ent.x) + Math.abs(rbp.y - ent.y);
              if (rd < minRDist) {
                minRDist = rd;
                closestRoad = rbp;
              }
            }

            if (closestRoad) {
              if (minRDist <= 1) {
                createRoadEntity(closestRoad.x, closestRoad.y, closestRoad.groupId ? group : null, closestRoad.isSnapPoint);
                ent.emote = 2;
                chosenDx = 0;
                chosenDy = 0;
                hasIntention = true;
              } else {
                if (!ent._cachedRoadPath || ent._cachedRoadPath.length === 0 || ent._cachedRoadTargetX !== closestRoad.x || ent._cachedRoadTargetY !== closestRoad.y) {
                  ent._cachedRoadPath = findPathAStarLocal(ent.x, ent.y, closestRoad.x, closestRoad.y, world || curW, ent, 120, 32);
                  ent._cachedRoadTargetX = closestRoad.x;
                  ent._cachedRoadTargetY = closestRoad.y;
                }
                if (ent._cachedRoadPath && ent._cachedRoadPath.length > 0) {
                  if (ent._cachedRoadPath[0].x === ent.x && ent._cachedRoadPath[0].y === ent.y) {
                    ent._cachedRoadPath.shift();
                  }
                  if (ent._cachedRoadPath.length > 0) {
                    const step = ent._cachedRoadPath[0];
                    chosenDx = Math.sign(step.x - ent.x);
                    chosenDy = Math.sign(step.y - ent.y);
                  } else {
                    chosenDx = Math.sign(closestRoad.x - ent.x);
                    chosenDy = Math.sign(closestRoad.y - ent.y);
                  }
                } else {
                  chosenDx = Math.sign(closestRoad.x - ent.x);
                  chosenDy = Math.sign(closestRoad.y - ent.y);
                }
                hasIntention = true;
              }
            }
          }

          // --- 5.25 Stone Street Paving Projects (Civic Public Works) ---
          const canPave = group._plannedStoneRoads && group._plannedStoneRoads.length > 0 && energyRatio > 0.35 && waterRatio > 0.35 && !ent.properties.injured;
          if (!hasIntention && canPave) {
            const hasHeldStone = (ent.properties.arm_left?.heldItem?.resourceType === "stone" || ent.properties.arm_right?.heldItem?.resourceType === "stone" || ent.properties.heldItem?.resourceType === "stone");
            const hasBackpackStone = (ent.properties.backpack?.items || []).some(it => it.resourceType === "stone" || it.name?.includes("Pedra") || it.name?.includes("Stone"));

            if (hasHeldStone || hasBackpackStone) {
              let targetStoneRoad = null;
              let minDist = 9999;
              for (let sIdx = 0; sIdx < group._plannedStoneRoads.length; sIdx++) {
                const sr = group._plannedStoneRoads[sIdx];
                const curT = curW ? (curW.getTile ? curW.getTile(sr.x, sr.y) : (curW.map ? curW.map[sr.y * (curW.width || MAP_WIDTH) + sr.x] : 0)) : 0;
                if (!isDirtRoadTile(curT)) {
                  group._plannedStoneRoads.splice(sIdx, 1);
                  sIdx--;
                  continue;
                }
                const d = Math.abs(sr.x - ent.x) + Math.abs(sr.y - ent.y);
                if (d < minDist) {
                  minDist = d;
                  targetStoneRoad = sr;
                }
              }

              if (targetStoneRoad) {
                if (minDist <= 1) {
                  // Consume 1 stone and pave the road
                  if (hasHeldStone) {
                    if (ent.properties.arm_left?.heldItem?.resourceType === "stone") ent.properties.arm_left.heldItem = null;
                    else if (ent.properties.arm_right?.heldItem?.resourceType === "stone") ent.properties.arm_right.heldItem = null;
                    else if (ent.properties.heldItem?.resourceType === "stone") ent.properties.heldItem = null;
                  } else if (hasBackpackStone && ent.properties.backpack?.items) {
                    const idx = ent.properties.backpack.items.findIndex(it => it.resourceType === "stone" || it.name?.includes("Pedra"));
                    if (idx !== -1) ent.properties.backpack.items.splice(idx, 1);
                  }

                  const curT = curW ? (curW.getTile ? curW.getTile(targetStoneRoad.x, targetStoneRoad.y) : (curW.map ? curW.map[targetStoneRoad.y * (curW.width || MAP_WIDTH) + targetStoneRoad.x] : 0)) : 0;
                  const stoneTile = getStoneRoadTileForTerrain(curT);
                  if (stoneTile) {
                    if (curW.setTile) curW.setTile(targetStoneRoad.x, targetStoneRoad.y, stoneTile);
                    else if (curW.map) curW.map[targetStoneRoad.y * (curW.width || MAP_WIDTH) + targetStoneRoad.x] = stoneTile;
                  }
                  ent.emote = 2; // Happy
                  chosenDx = 0;
                  chosenDy = 0;
                  hasIntention = true;
                } else {
                  chosenDx = Math.sign(targetStoneRoad.x - ent.x);
                  chosenDy = Math.sign(targetStoneRoad.y - ent.y);
                  hasIntention = true;
                }
              }
            } else if (group.resources && group.resources.stone >= 1) {
              // Withdraw 1 stone from clan stockpile
              group.resources.stone -= 1;
              if (!ent.properties.arm_left) ent.properties.arm_left = createArmProp("Braço Esquerdo", "left");
              ent.properties.arm_left.heldItem = { name: "Pedra de Pavimentação", resourceType: "stone", weight: 2.0 };
              chosenDx = 0;
              chosenDy = 0;
              hasIntention = true;
            } else {
              // Find loose stone in territory or nearby radius
              const closestStone = findClosestEntityInRadius(ent.x, ent.y, 35, e =>
                !e.destroyed && e.properties?.resourceType === "stone"
              );
              if (closestStone) {
                const d = Math.abs(closestStone.x - ent.x) + Math.abs(closestStone.y - ent.y);
                if (d <= 1) {
                  closestStone.destroyed = true;
                  if (!ent.properties.arm_left) ent.properties.arm_left = createArmProp("Braço Esquerdo", "left");
                  ent.properties.arm_left.heldItem = { name: "Pedra de Pavimentação", resourceType: "stone", weight: 2.0 };
                  chosenDx = 0;
                  chosenDy = 0;
                  hasIntention = true;
                } else {
                  chosenDx = Math.sign(closestStone.x - ent.x);
                  chosenDy = Math.sign(closestStone.y - ent.y);
                  hasIntention = true;
                }
              }
            }
          }

          // --- 5.3 Territory Ground Cleaning & Hauling to Warehouse/Stockpile ---
          if (!hasIntention) {
            const closestItem = findClosestEntityInRadius(ent.x, ent.y, 20, e =>
              !e.destroyed &&
              !e.properties.photosynthesis &&
              !e.properties.deep_root &&
              !e.properties.structure &&
              !e.properties.house &&
              !e.properties.door &&
              !e.properties.life &&
              !e.properties.torch &&
              !e.properties.campfire &&
              isTileInClaimedZones(e.x, e.y, group.claimedZones) &&
              (!!e.properties.edible || !!e.properties.resourceType || !!e.properties.germination || e.properties.species === "item" || !!e.properties.attackBonus || !!e.properties.isWeapon || !!e.properties.artifact)
            );
            if (closestItem) {
              chosenDx = Math.sign(closestItem.x - ent.x);
              chosenDy = Math.sign(closestItem.y - ent.y);
              hasIntention = true;
            }
          }

          // --- 5.37 Culinary Duty & Kitchen Navigation (Cooks) ---
          if (isCook && !hasIntention) {
            const completedKitchen = entities.find(e => !e.destroyed && e.properties.kitchen?.isCompleted && isTileInClaimedZones(e.x, e.y, group.claimedZones));
            if (completedKitchen) {
              const distToKit = Math.abs(completedKitchen.x - ent.x) + Math.abs(completedKitchen.y - ent.y);
              if (distToKit > 1) {
                chosenDx = Math.sign(completedKitchen.x - ent.x);
                chosenDy = Math.sign(completedKitchen.y - ent.y);
                hasIntention = true;
              }
            }
          }

          // --- 5.38 Corpse Butchering & Feeding (Butchers, Hunters, and Foragers) ---
          if (!hasIntention && (isButcher || isHunter || energyRatio < 0.65)) {
            const closestCorpse = findClosestEntityInRadius(ent.x, ent.y, 24, e =>
              !e.destroyed && e.properties.corpse && (e.properties.corpse.remainingMeatCuts > 0 || e.properties.corpse.remainingBones > 0)
            );
            if (closestCorpse) {
              chosenDx = Math.sign(closestCorpse.x - ent.x);
              chosenDy = Math.sign(closestCorpse.y - ent.y);
              hasIntention = true;
            }
          }

          // --- 5.4 Guard Patrol Duty ---
          if (isGuard && !hasIntention) {
            const distToBase = Math.abs(ent.x - homeBaseX) + Math.abs(ent.y - homeBaseY);
            if (distToBase > 14) {
              chosenDx = Math.sign(homeBaseX - ent.x);
              chosenDy = Math.sign(homeBaseY - ent.y);
              hasIntention = true;
            }
          }

          // --- 5.5 Agriculture / Farming (Farmers, Pioneers, Foragers, Leaders, and Free Settlers) ---
          if ((isFarmer || (!hasUnbuiltStruct && (isForager || isPioneer || energyRatio > 0.40))) && !hasIntention) {
            // Check clan tree quota before actively foraging/seeking seeds to plant
            let underTreeQuota = true;
            if (group) {
              if (group.treesPerCitizen === undefined) {
                group.treesPerCitizen = 0.33 + Math.random() * (3.0 - 0.33);
              }
              const memberCount = Math.max(1, (group.members || []).length);
              const maxAllowedTrees = Math.max(1, Math.round(memberCount * group.treesPerCitizen));
              let currentTreeCount = 0;
              for (let i = 0; i < entities.length; i++) {
                const e = entities[i];
                if (!e.destroyed && (e.properties?.photosynthesis || e.properties?.deep_root || e.properties?.tree || e.properties?.species === "tree" || e.properties?.species === "oak" || e.properties?.species === "pine" || e.properties?.species === "willow" || e.properties?.species === "cactus")) {
                  if (isTileInClaimedZones(e.x, e.y, group.claimedZones)) {
                    currentTreeCount++;
                  }
                }
              }
              if (currentTreeCount >= maxAllowedTrees) {
                underTreeQuota = false;
              }
            }

            if (underTreeQuota) {
              let seedTarget = null;
              if (ent._taskGoal && ent._taskGoal.type === "get_seed") {
                const lSeed = getEntityById(ent._taskGoal.id);
                const lockedSeed = (lSeed && !lSeed.destroyed && !lSeed.properties.photosynthesis && !lSeed.properties.deep_root) ? lSeed : null;
                if (lockedSeed) {
                  seedTarget = lockedSeed;
                } else {
                  ent._taskGoal = null;
                }
              }

              if (!seedTarget) {
                seedTarget = findClosestEntityInRadius(ent.x, ent.y, 22, e =>
                  !e.destroyed && !e.properties.photosynthesis && !e.properties.deep_root && (e.properties.germination || e.properties.resourceType === "seed" || e.properties.name?.includes("Seed") || e.properties.name?.includes("Semente") || (e.properties.edible?.foodType === "fruit" && e.properties.edible.seed))
                );
                if (seedTarget) {
                  ent._taskGoal = { type: "get_seed", id: seedTarget.id };
                }
              }

              if (seedTarget) {
                chosenDx = Math.sign(seedTarget.x - ent.x);
                chosenDy = Math.sign(seedTarget.y - ent.y);
                hasIntention = true;
              }
            }
          }

          // --- 5.55 Idle Courtship & Romantic Partner Seeking (STRICTLY when completely idle and has zero tasks) ---
          if (!hasIntention && !hasUnbuiltStruct && ent.properties.genitalia && (ent.properties.genitalia.matingCooldown || 0) <= 0 && energyRatio > 0.45) {
            const partnerId = ent.properties.monogamy?.partnerId;
            let targetPartner = partnerId ? getEntityById(partnerId) : null;
            if (!targetPartner || targetPartner.destroyed || !targetPartner.properties?.life) {
              targetPartner = findEntityInRadius(ent.x, ent.y, 6, other =>
                other !== ent && !other.destroyed && other.properties?.life && other.properties?.genitalia &&
                (other.properties.genitalia.matingCooldown || 0) <= 0 &&
                isSexuallyCompatible(ent, other)
              );
            }
            if (targetPartner && !targetPartner.destroyed) {
              const pDist = Math.abs(targetPartner.x - ent.x) + Math.abs(targetPartner.y - ent.y);
              if (pDist > 1 && pDist <= 8) {
                chosenDx = Math.sign(targetPartner.x - ent.x);
                chosenDy = Math.sign(targetPartner.y - ent.y);
                hasIntention = true;
              }
            }
          }

          // --- 5.6 Sanitation: Clean Feces Inside Territory ---
          if (!hasIntention && energyRatio > 0.40) {
            let fecesTarget = null;
            if (ent._taskGoal && ent._taskGoal.type === "clean_feces") {
              const lFeces = getEntityById(ent._taskGoal.id);
              const lockedFeces = (lFeces && !lFeces.destroyed) ? lFeces : null;
              if (lockedFeces && isTileInClaimedZones(lockedFeces.x, lockedFeces.y, group.claimedZones)) {
                fecesTarget = lockedFeces;
              } else {
                ent._taskGoal = null;
              }
            }

            if (!fecesTarget) {
              fecesTarget = findClosestEntityInRadius(ent.x, ent.y, 16, e =>
                !e.destroyed && (e.properties.resourceType === "feces" || e.properties.edible?.foodType === "feces") && isTileInClaimedZones(e.x, e.y, group.claimedZones)
              );
              if (fecesTarget) {
                ent._taskGoal = { type: "clean_feces", id: fecesTarget.id };
              }
            }

            if (fecesTarget) {
              chosenDx = Math.sign(fecesTarget.x - ent.x);
              chosenDy = Math.sign(fecesTarget.y - ent.y);
              hasIntention = true;
            }
          }

          // --- 5.7 Civic & Idle Settler Tasks (Foraging in border zones & social visits) ---
          if (!hasIntention && energyRatio > 0.35) {
                // 1. Road & Street Construction (3 Initial Dirt Roads, Expansion Lanes, Inter-Village Highways)
                const curW = getSimWorld();
                const allGroups = curW?.groups || (activeWorld?.groups || []);
                const roadBlueprints = getClanRoadBlueprints(group, allGroups);
                const unbuiltRoads = roadBlueprints.filter(bp => !isRoadTile(bp.x, bp.y) && isRoadFrontierTile(bp.x, bp.y, group));

                if (unbuiltRoads.length > 0) {
                  let closestRoad = null;
                  let minRDist = 9999;
                  for (const rbp of unbuiltRoads) {
                    const rd = Math.abs(rbp.x - ent.x) + Math.abs(rbp.y - ent.y);
                    if (rd < minRDist) {
                      minRDist = rd;
                      closestRoad = rbp;
                    }
                  }

                  if (closestRoad) {
                    if (minRDist <= 1) {
                      createRoadEntity(closestRoad.x, closestRoad.y, closestRoad.groupId ? group : null, closestRoad.isSnapPoint);

                      if (closestRoad.isHighway) {
                        const nearbyAllies = getEntitiesInRadius(ent.x, ent.y, 3).filter(o =>
                          o !== ent && !o.destroyed && o.properties?.group && o.properties.group.id !== group.id
                        );
                        for (const ally of nearbyAllies) {
                          if (ent.properties?.brain?.affinities) {
                            ent.properties.brain.affinities[ally.id] = (ent.properties.brain.affinities[ally.id] || 0) + 2;
                          }
                          if (ally.properties?.brain?.affinities) {
                            ally.properties.brain.affinities[ent.id] = (ally.properties.brain.affinities[ent.id] || 0) + 2;
                          }
                          ent.emote = 2;
                          ally.emote = 2;
                        }
                      }
                    } else {
                      chosenDx = Math.sign(closestRoad.x - ent.x);
                      chosenDy = Math.sign(closestRoad.y - ent.y);
                      hasIntention = true;
                    }
                  }
                }

                // 2. Foraging in Neighboring Unowned Zones (Adjacent zones not claimed by any clan)
                if (!hasIntention && getFreeArm(ent)) {
                  const allClaimedZones = new Set();
                  for (const g of (world?.groups || [])) {
                    for (const zk of (g.claimedZones || [])) allClaimedZones.add(zk);
                  }

                  const neighborUnownedZones = [];
                  for (const zk of (group.claimedZones || [])) {
                    const [zx, zy] = zk.split("_").map(n => parseInt(n, 10));
                    for (const off of [{dx:1,dy:0}, {dx:-1,dy:0}, {dx:0,dy:1}, {dx:0,dy:-1}]) {
                      const nzk = `${zx + off.dx}_${zy + off.dy}`;
                      if (!allClaimedZones.has(nzk) && !neighborUnownedZones.includes(nzk)) {
                        neighborUnownedZones.push(nzk);
                      }
                    }
                  }

                  if (neighborUnownedZones.length > 0 && Math.random() < 0.25) {
                    const wildItem = findEntityInRadius(ent.x, ent.y, 16, e =>
                      !e.destroyed &&
                      !e.properties.structure &&
                      !e.properties.house &&
                      !e.properties.life &&
                      isTileInClaimedZones(e.x, e.y, neighborUnownedZones) &&
                      (!!e.properties.edible || !!e.properties.resourceType || !!e.properties.germination || e.properties.species === "item")
                    );
                    if (wildItem) {
                      chosenDx = Math.sign(wildItem.x - ent.x);
                      chosenDy = Math.sign(wildItem.y - ent.y);
                      hasIntention = true;
                    }
                  }
                }

                // 4. Idle Social Visits to Friendly Neighboring Villages & Diplomatic Missions
                if (!hasIntention && (isDiplomat || ((world?.clock?.globalLight ?? 1) >= 0.50 && energyRatio > 0.60 && waterRatio > 0.50))) {
                  for (const otherGroup of (world?.groups || [])) {
                    if (otherGroup.id !== group.id && (isDiplomat || canBuildInterVillageRoad(group, otherGroup))) {
                      const otherWh = entities.find(e =>
                        !e.destroyed && e.properties.warehouse?.isCompleted && isTileInClaimedZones(e.x, e.y, otherGroup.claimedZones)
                      );
                      if (otherWh) {
                        const distToOtherWh = Math.abs(otherWh.x - ent.x) + Math.abs(otherWh.y - ent.y);
                        // Diplomats will travel infinitely far, others only 50 tiles
                        if (distToOtherWh > 3 && (isDiplomat || distToOtherWh <= 50)) {
                          const roadPath = getPrefabricatedRoadPath(ent.x, ent.y, otherWh.x, otherWh.y, group);
                          if (roadPath && roadPath.length > 0) {
                            chosenDx = Math.sign(roadPath[0].x - ent.x);
                            chosenDy = Math.sign(roadPath[0].y - ent.y);
                          } else {
                            chosenDx = Math.sign(otherWh.x - ent.x);
                            chosenDy = Math.sign(otherWh.y - ent.y);
                          }
                          hasIntention = true;
                          break;
                        } else if (distToOtherWh <= 3) {
                          const foreignFriend = findEntityInRadius(ent.x, ent.y, 6, o => 
                            o !== ent && !o.destroyed && o.properties?.group?.id === otherGroup.id
                          );
                          if (foreignFriend) {
                            const deltaAff = isDiplomat ? 4 : ((Math.random() < 0.85) ? 2 : -1);
                            if (ent.properties?.brain?.affinities) {
                              ent.properties.brain.affinities[foreignFriend.id] = (ent.properties.brain.affinities[foreignFriend.id] || 0) + deltaAff;
                            }
                            if (foreignFriend.properties?.brain?.affinities) {
                              foreignFriend.properties.brain.affinities[ent.id] = (foreignFriend.properties.brain.affinities[ent.id] || 0) + deltaAff;
                            }
                            ent.emote = deltaAff > 0 ? 2 : 3;
                            foreignFriend.emote = deltaAff > 0 ? 2 : 3;
                            hasIntention = true;
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }

      // -----------------------------------------------------------------------
      // Priority 7: Clan Base Cohesion & Territory Tether (With Hysteresis)
      // -----------------------------------------------------------------------
      if (!hasIntention && ent.properties.group && entities) {
        const group = ent.properties.group;
        const firstZone = group.claimedZones?.[0] || "32_32";
        const parts = firstZone.includes("_") ? firstZone.split("_") : firstZone.split(",");
        const baseZx = isNaN(parseInt(parts[0], 10)) ? 32 : parseInt(parts[0], 10);
        const baseZy = isNaN(parseInt(parts[1], 10)) ? 32 : parseInt(parts[1], 10);
        const homeBaseX = baseZx * 8 + 4;
        const homeBaseY = baseZy * 8 + 4;
        const distToBase = Math.abs(ent.x - homeBaseX) + Math.abs(ent.y - homeBaseY);
        const inClanTerritory = isTileInClaimedZones(ent.x, ent.y, group.claimedZones);

        // Ensure living leaderId is tracked or auto-elected
        const curLeaderEnt = getEntityById(group.leaderId);
        const isLeaderLiving = (curLeaderEnt && !curLeaderEnt.destroyed);
        if (!group.leaderId || !isLeaderLiving) {
          const livingMems = (group.members || []).map(id => {
            const e = getEntityById(id);
            return (e && !e.destroyed) ? e : null;
          }).filter(Boolean);
          if (livingMems.length > 0) {
            group.leaderId = livingMems[0].id;
          }
        }

        // Hysteresis leash: Only trigger returning home if outside territory OR > 14 tiles away
        if (!ent._returningClanBase) {
          if (!inClanTerritory || distToBase > 14) {
            ent._returningClanBase = true;
          }
        } else {
          // Keep returning until safely inside base core (<= 4 tiles)
          if (distToBase <= 4) {
            ent._returningClanBase = false;
          }
        }

        if (ent._returningClanBase) {
          chosenDx = Math.sign(homeBaseX - ent.x);
          chosenDy = Math.sign(homeBaseY - ent.y);
          hasIntention = true;
        }
      }

      // -----------------------------------------------------------------------
      // Priority 7.5: Romantic Partner Tethering (One-way with Hysteresis)
      // -----------------------------------------------------------------------
      if (!hasIntention && ent.properties.monogamy?.partnerId && entities && energyRatio > 0.35 && waterRatio > 0.35) {
        const p = getEntityById(ent.properties.monogamy.partnerId);
        const partner = (p && !p.destroyed) ? p : null;
        // Asymmetric follow to prevent mutual orbit
        if (partner && ent.id < partner.id) {
          const pdist = Math.abs(partner.x - ent.x) + Math.abs(partner.y - ent.y);
          if (!ent._followingPartner) {
            if (pdist > 8 && pdist <= 25) {
              ent._followingPartner = true;
            }
          } else {
            if (pdist <= 3 || pdist > 28) {
              ent._followingPartner = false;
            }
          }

          if (ent._followingPartner) {
            chosenDx = Math.sign(partner.x - ent.x);
            chosenDy = Math.sign(partner.y - ent.y);
            hasIntention = true;
          }
        }
      }

      // -----------------------------------------------------------------------
      // Priority 8: Wandering & Territory Demarcation (With Hysteresis)
      // -----------------------------------------------------------------------
      if (!hasIntention) {
        const territoryKey = ent.properties.brain?.territoryZoneKey;
        if (territoryKey && ent.properties.brain?.geoMemory[territoryKey]) {
          const tGeo = ent.properties.brain.geoMemory[territoryKey];
          const targetX = tGeo.zx * 8 + 4;
          const targetY = tGeo.zy * 8 + 4;
          const distToCenter = Math.abs(targetX - ent.x) + Math.abs(targetY - ent.y);

          if (!ent._returningTerritory) {
            if (distToCenter > 8) {
              ent._returningTerritory = true;
            }
          } else {
            if (distToCenter <= 3) {
              ent._returningTerritory = false;
            }
          }

          if (ent._returningTerritory) {
            chosenDx = Math.sign(targetX - ent.x);
            chosenDy = Math.sign(targetY - ent.y);
            hasIntention = true;
          }
        }
      }

      if (!hasIntention) {
        // Wandering Momentum: commit to moving in the same direction for 8-16 steps
        if (!ent._wanderHeading || ent._wanderHeading.steps <= 0) {
          const dirs = [
            { dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 },
            { dx: 1, dy: -1 }, { dx: 1, dy: 1 }, { dx: -1, dy: -1 }, { dx: -1, dy: 1 }
          ];
          let pool = dirs;
          if (isTerrestrial && !isAquatic && world) {
            const roadDirs = dirs.filter(d => isRoadTile(ent.x + d.dx, ent.y + d.dy));
            if (roadDirs.length > 0 && Math.random() < 0.75) {
              pool = roadDirs; // 75% preference to stroll along road network!
            } else {
              const landDirs = dirs.filter(d => {
                const t = world.getTile(ent.x + d.dx, ent.y + d.dy);
                return t !== 2 && t !== 5;
              });
              if (landDirs.length > 0) pool = landDirs;
            }
          }
          const chosen = pool[Math.floor(Math.random() * pool.length)];
          ent._wanderHeading = {
            dx: chosen.dx,
            dy: chosen.dy,
            steps: Math.floor(Math.random() * 9) + 8
          };
        }

        ent._wanderHeading.steps--;
        chosenDx = ent._wanderHeading.dx;
        chosenDy = ent._wanderHeading.dy;
      }

      // Execute Movement with Land Priority, Road Highway Affinity & Water Fallback
      const mapW = (world && world.width) ? world.width : 512;
      const mapH = (world && world.height) ? world.height : 512;

      let moved = false;
      const candidateMoves = [];
      if (chosenDx !== 0 && chosenDy !== 0) {
        candidateMoves.push({ dx: chosenDx, dy: chosenDy });
        candidateMoves.push({ dx: chosenDx, dy: 0 });
        candidateMoves.push({ dx: 0, dy: chosenDy });
        candidateMoves.push({ dx: chosenDy, dy: -chosenDx });
        candidateMoves.push({ dx: -chosenDy, dy: chosenDx });
      } else if (chosenDx !== 0) {
        candidateMoves.push({ dx: chosenDx, dy: 0 });
        candidateMoves.push({ dx: chosenDx, dy: 1 });
        candidateMoves.push({ dx: chosenDx, dy: -1 });
        candidateMoves.push({ dx: 0, dy: 1 });
        candidateMoves.push({ dx: 0, dy: -1 });
      } else if (chosenDy !== 0) {
        candidateMoves.push({ dx: 0, dy: chosenDy });
        candidateMoves.push({ dx: 1, dy: chosenDy });
        candidateMoves.push({ dx: -1, dy: chosenDy });
        candidateMoves.push({ dx: 1, dy: 0 });
        candidateMoves.push({ dx: -1, dy: 0 });
      }

      if (!ent._recentPositions) ent._recentPositions = [];

      // Sort candidate moves: alignment with target, highway road attraction, with penalty for recently visited tiles
      candidateMoves.sort((a, b) => {
        const ax = ent.x + a.dx;
        const ay = ent.y + a.dy;
        const bx = ent.x + b.dx;
        const by = ent.y + b.dy;

        // Alignment with chosen intention
        let aScore = (a.dx * chosenDx + a.dy * chosenDy);
        let bScore = (b.dx * chosenDx + b.dy * chosenDy);

        // Road highway attraction bonus
        if (isRoadTile(ax, ay)) aScore += 4.5;
        if (isRoadTile(bx, by)) bScore += 4.5;

        // Penalize tiles in recent history (index 0 is oldest, last is most recent)
        const aRecIdx = ent._recentPositions.findIndex(p => p.x === ax && p.y === ay);
        if (aRecIdx !== -1) {
          aScore -= (aRecIdx + 1) * 12.0;
        }

        const bRecIdx = ent._recentPositions.findIndex(p => p.x === bx && p.y === by);
        if (bRecIdx !== -1) {
          bScore -= (bRecIdx + 1) * 12.0;
        }

        return bScore - aScore;
      });

      // Pass 1: Prioritize Dry Land traversal
      if (!moved) {
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
                // Valid Land Tile (0, 1, 3, 4, 6, 7, 8, 9, 10, 11, 12, 13)
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
                const occ = getEntityAtTile(tx, ty);
                if (occ && occ.properties.structure) {
                  if (occ.properties.door) {
                    if (occ.properties.door.isOpen) {
                      // Open door can be traversed
                    } else if (!occ.properties.door.owners || occ.properties.door.owners.length === 0 || occ.properties.door.owners.includes(ent.id)) {
                      occ.properties.door.open();
                    } else {
                      canTraverse = false; // Locked for non-owner
                    }
                  } else {
                    canTraverse = false; // Solid wall
                  }
                }
              }

              if (canTraverse) {
                ent._recentPositions.push({ x: ent.x, y: ent.y });
                if (ent._recentPositions.length > 6) ent._recentPositions.shift();
                ent.x = tx;
                ent.y = ty;

                // Move speed buff: Stone brick roads give higher boost (+55%) than dirt roads (+25%)
                if (isStoneRoadTile(targetTile)) {
                  this.stepTimer += moveInterval * 0.55;
                } else if (isDirtRoadTile(targetTile) || isRoadTile(tx, ty)) {
                  this.stepTimer += moveInterval * 0.25;
                }

                moved = true;
                break;
              }
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
              ent._recentPositions.push({ x: ent.x, y: ent.y });
              if (ent._recentPositions.length > 6) ent._recentPositions.shift();
              ent.x = tx;
              ent.y = ty;
              this.stepTimer = -moveInterval * 3.0; // wading penalty
              moved = true;
              break;
            }
          }
        }
      }

      // If creature was wandering and hit an obstacle, smoothly deflect heading
      if (!moved && ent._wanderHeading) {
        const prevDx = ent._wanderHeading.dx;
        const prevDy = ent._wanderHeading.dy;
        const perpDirs = [
          { dx: -prevDy, dy: prevDx },
          { dx: prevDy, dy: -prevDx },
          { dx: -prevDx, dy: -prevDy }
        ];
        let defChosen = perpDirs[0];
        if (world) {
          for (const pd of perpDirs) {
            const pTile = world.getTile(ent.x + pd.dx, ent.y + pd.dy);
            if (pTile !== 5 && (isFlying || isAquatic || pTile !== 2)) {
              defChosen = pd;
              break;
            }
          }
        }
        ent._wanderHeading = {
          dx: defChosen.dx,
          dy: defChosen.dy,
          steps: Math.floor(Math.random() * 6) + 6
        };
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
                ent._recentPositions.push({ x: ent.x, y: ent.y });
                if (ent._recentPositions.length > 6) ent._recentPositions.shift();
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
                  ent._recentPositions.push({ x: ent.x, y: ent.y });
                  if (ent._recentPositions.length > 6) ent._recentPositions.shift();
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

      // Opportunistic Hydration: initiate active drinking when passing near water or well
      if (ent.properties.bladder && ent.properties.bladder.water < ent.properties.bladder.maxWater * 0.70 && world) {
        let isNearWaterSource = false;
        for (const off of [{dx:0,dy:0}, {dx:1,dy:0}, {dx:-1,dy:0}, {dx:0,dy:1}, {dx:0,dy:-1}]) {
          if (world.getTile(ent.x + off.dx, ent.y + off.dy) === 2) {
            isNearWaterSource = true;
            break;
          }
        }
        if (!isNearWaterSource && entities) {
          for (const e of entities) {
            if (!e.destroyed && (e.properties?.well?.isCompleted || e.properties?.isWell) && (Math.abs(e.x - ent.x) + Math.abs(e.y - ent.y) <= 1)) {
              isNearWaterSource = true;
              break;
            }
          }
        }
        if (isNearWaterSource) {
          ent._drinkingTimer = 2.5;
          ent.emote = 2; // Happy
          ent._waterGoal = null;
        }
      }

      // -----------------------------------------------------------------------
      // Item Pickup / Ingestion at Current Position
      // -----------------------------------------------------------------------
      const tileItems = getEntitiesInRadius(ent.x, ent.y, 0);
      for (const other of tileItems) {
        if (other !== ent && !other.destroyed && other.x === ent.x && other.y === ent.y) {
            // Food Consumption (Only eat if hungry, not when already full or digesting)
            if (other.properties.edible && ent.properties.stomach && ent.properties.stomach.items.length < ent.properties.stomach.capacity) {
              const stomachHasFood = ent.properties.stomach.items.length > 0;
              if (energyRatio > 0.65 && stomachHasFood) {
                continue; // Satiated, digesting existing meal
              }
              if (energyRatio > 0.85) {
                continue; // Full energy, skip food
              }

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

              // Dietary Hydration: juicy fruits and succulent plants hydrate the creature directly!
              if (ent.properties.bladder && (ed.foodType === "fruit" || ed.foodType === "plant")) {
                const waterGain = ed.foodType === "fruit" ? 220 : 100;
                ent.properties.bladder.water = Math.min(ent.properties.bladder.maxWater, ent.properties.bladder.water + waterGain);
              }

              // Extract and save viable seed for agriculture
              if (ed.seed) {
                const freeArm = getFreeArm(ent);
                if (freeArm && ent.properties.group) {
                  freeArm.heldItem = {
                    name: `Semente de ${ed.seed.species || "Planta"}`,
                    resourceType: "seed",
                    seedType: ed.seed.type || "small",
                    seedSpecies: ed.seed.species || "oak",
                    ownerId: ent.id
                  };
                } else if (Math.random() < 0.75) {
                  const seedEnt = createSeedEntity(ent.x, ent.y, ed.seed.type || "small", ed.seed.species || "oak");
                  entities.push(seedEnt);
                  registerEntitySpatial(seedEnt);
                }
              }

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

        // Social Gifting: If mood is positive (>= 30), occasionally gift surplus food or non-equipped item to a close friend
        if (ent.properties.brain?.mood >= 30 && Math.random() < 0.04) {
          for (const k in ent.properties) { const p = ent.properties[k];
            if ((k.startsWith("arm") || k.startsWith("paw") || k.startsWith("fangs")) && p && p.heldItem) {
              // Avoid giving away essential equipped profession tools
              const itemType = p.heldItem.resourceType || p.heldItem.type;
              const isEssentialTool = (p.heldItem.attackBonus > 10 || p.heldItem.miningPower || p.heldItem.constructionPower);
              if (isEssentialTool) continue;

              const nearbyFriends = getEntitiesInRadius(ent.x, ent.y, 2);
              const friend = nearbyFriends.find(e => {
                if (e === ent || e.destroyed || !e.properties.brain) return false;
                if ((ent.properties.brain.affinities[e.id] || 0) < 45) return false;
                // Bilateral gifting cooldown check
                if (ent._socialCooldowns?.[e.id] && currentTick < ent._socialCooldowns[e.id]) return false;
                return true;
              });

              if (friend) {
                for (const [fk, fp] of Object.entries(friend.properties)) {
                  if ((fk.startsWith("arm") || fk.startsWith("paw") || fk.startsWith("fangs")) && fp && !fp.heldItem) {
                    fp.heldItem = p.heldItem;
                    p.heldItem = null;

                    // Set bilateral cooldown of 300 ticks (prevents ping-pong item exchange)
                    if (!ent._socialCooldowns) ent._socialCooldowns = {};
                    if (!friend._socialCooldowns) friend._socialCooldowns = {};
                    ent._socialCooldowns[friend.id] = currentTick + 300;
                    friend._socialCooldowns[ent.id] = currentTick + 300;

                    const affinityBoost = 20;
                    friend.properties.brain.affinities[ent.id] = Math.min(100, (friend.properties.brain.affinities[ent.id] || 0) + affinityBoost);
                    friend.properties.brain.mood = Math.min(100, (friend.properties.brain.mood || 0) + 15);
                    ent.properties.brain.mood = Math.min(100, (ent.properties.brain.mood || 0) + 15);

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

      let sunFactor = 0.0;
      if (world.clock) {
        const h = (world.clock.hour || 0) + (world.clock.minute || 0) / 60;
        if (h >= 5.5 && h <= 18.5) {
          sunFactor = Math.sin(((h - 5.5) / 13) * Math.PI);
        }
      } else {
        sunFactor = 1.0;
      }

      if (sunFactor > 0.02) {
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
export function createFruitingProp(interval = 90.0, seedType = "small", species = "oak", initialTimer = null) {
  return {
    interval,
    seedType,
    species,
    timer: initialTimer !== null ? initialTimer : Math.random() * (interval * 0.95),
    effect(ent, dt, world, entities) {
      if (!ent.properties.life || !entities || !world) return;
      if (ent.properties.life.energy < ent.properties.life.max * 0.20) return;

      this.timer = (this.timer || 0) + dt;
      if (this.timer >= this.interval) {
        this.timer = 0;

        // Density check: strict limit of 1 unpicked fruit per tree area to prevent item clutter
        let nearbyFruits = 0;
        for (let i = 0; i < entities.length; i++) {
          const e = entities[i];
          if (!e.destroyed && e.properties?.edible?.foodType === "fruit" && Math.abs(e.x - ent.x) <= 3 && Math.abs(e.y - ent.y) <= 3) {
            nearbyFruits++;
            if (nearbyFruits >= 1) break;
          }
        }
        if (nearbyFruits >= 1) return;

        const fx = Math.max(0, Math.min(world.width - 1, ent.x + (Math.floor(Math.random() * 3) - 1)));
        const fy = Math.max(0, Math.min(world.height - 1, ent.y + (Math.floor(Math.random() * 3) - 1)));

        const fruit = createEntity(
          {
            name: `Ripe Fruit of ${ent.properties.name}`,
            render: { skin: "Item_Fruit.png", color: 0xffff3250, backcolor: 0x00000000 },
            edible: {
              nutrition: 3500,
              foodType: "fruit",
              digestDuration: 90,
              sourceName: ent.properties.name,
              sourceSpecies: ent.properties.species,
              seed: { type: this.seedType, species: this.species }
            },
            lifespan: createLifespanProp(120.0) // Decomposes after 2 minutes if left uncollected in the wild
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
      if (ent.properties.brain) {
        ent.properties.brain.condition = Math.max(0, ent.properties.brain.condition - Math.round(energyDrain * 0.3));
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
      if (ent.properties.brain) {
        ent.properties.brain.condition = Math.max(0, ent.properties.brain.condition - Math.round(damage * 0.35));
      }
    }
  };
}

// ---------------------------------------------------------------------------
// 5. Procedural Creature & Species Archetype System
// ---------------------------------------------------------------------------

export function createCreatureFromArchetype(speciesKey, x, y, customOpts = {}) {
  const normKey = (speciesKey || "human").toLowerCase();
  const gender = customOpts.gender || rollCreatureGender();
  const orientation = customOpts.orientation || rollCreatureOrientation();
  const traits = customOpts.traits || rollCreatureTraits();
  const birthDate = customOpts.birthDate || getBirthDateData(customOpts.world || null);

  const isFemale = gender === "female";
  const genitaliaType = isFemale ? "vagina" : "penis";

  let entProps = {};
  let naming = null;

  // 1. HUMANOID SPECIES (Human, Elf, Dwarf, Orc, Goblin, Kobold, Lizardfolk, Catfolk, Centaur)
  if (normKey === "human" || normKey === "elf" || normKey === "dwarf" || normKey === "orc" || normKey === "goblin" || normKey === "kobold" || normKey === "lizardfolk" || normKey === "catfolk" || normKey === "centaur") {
    const roles = ["Builder", "Miner", "Farmer", "Crafter", "Hunter", "Explorer", "Guard", "Scholar"];
    const chosenRole = customOpts.role || roles[Math.floor(Math.random() * roles.length)];
    const customName = customOpts.name;

    naming = customName ? { fullName: customName, surname: customName.split(" ")[1] || getRandomVocabWord() } : generateUniqueCreatureName(chosenRole, normKey);
    usedGlobalNames.add(naming.fullName);

    let skin = isFemale ? "Human_Normal_F.png" : "Human_Normal_M.png";
    let color = 0xfff0c878;
    let backcolor = 0xff3c2814;
    let maxLife = 6500;
    let iq = 18;
    let viewRange = 9;
    let heldWeapon = null;

    if (normKey === "elf") {
      skin = isFemale ? "Human_Archer_F.png" : "Human_Archer_M.png";
      color = 0xffa0e678;
      backcolor = 0xff143c14;
      maxLife = 5800;
      iq = 24;
      viewRange = 12; // Keen perception
      heldWeapon = { name: generateUniqueWeaponName("Elven Longbow"), damage: 38, isWeapon: true };
    } else if (normKey === "dwarf") {
      skin = "Human_Guard_U.png";
      color = 0xffd29664;
      backcolor = 0xff3c1e0a;
      maxLife = 8500; // High resilience
      iq = 18;
      viewRange = 8;
      heldWeapon = { name: generateUniqueWeaponName("Dwarven Pickaxe"), damage: 34, isTool: true };
    } else if (normKey === "orc") {
      skin = "Creature_Orc_U.png";
      color = 0xff78b450;
      backcolor = 0xff1e3c14;
      maxLife = 9200; // Brute strength
      iq = 14;
      viewRange = 9;
      heldWeapon = { name: generateUniqueWeaponName("Heavy Battleaxe"), damage: 45, isWeapon: true };
    } else if (normKey === "goblin") {
      skin = "Creature_Goblin_U.png";
      color = 0xff78d250;
      backcolor = 0xff283c14;
      maxLife = 3500;
      iq = 13;
      viewRange = 10;
      heldWeapon = { name: generateUniqueWeaponName("Scavenger Dagger"), damage: 24, isWeapon: true };
    } else if (normKey === "kobold") {
      skin = "Creature_Goblin_U.png";
      color = 0xffe66446;
      backcolor = 0xff3c140a;
      maxLife = 3200;
      iq = 14;
      viewRange = 10;
      heldWeapon = { name: generateUniqueWeaponName("Kobold Mining Pick"), damage: 26, isTool: true };
    } else if (normKey === "lizardfolk") {
      skin = "Creature_Snake_U.png";
      color = 0xff46a064;
      backcolor = 0xff0a3219;
      maxLife = 7500;
      iq = 15;
      viewRange = 11;
      heldWeapon = { name: generateUniqueWeaponName("Tribal Trident Spear"), damage: 40, isWeapon: true };
    } else if (normKey === "catfolk") {
      skin = isFemale ? "Creature_Cat_U.png" : "Creature_Cat_U.png";
      color = 0xfff0be64;
      backcolor = 0xff3c280a;
      maxLife = 5200;
      iq = 18;
      viewRange = 12;
      heldWeapon = { name: generateUniqueWeaponName("Feline Curved Dagger"), damage: 32, isWeapon: true };
    } else if (normKey === "centaur") {
      skin = "Creature_Horse_U.png";
      color = 0xffb47846;
      backcolor = 0xff28190a;
      maxLife = 9000;
      iq = 19;
      viewRange = 13;
      heldWeapon = { name: generateUniqueWeaponName("Centaur Heavy Composite Bow"), damage: 44, isWeapon: true };
    } else {
      // Human role gear
      if (chosenRole === "Miner") {
        skin = "Human_Guard_U.png";
        color = 0xffdcdce6;
        heldWeapon = { name: generateUniqueWeaponName("Iron Pickaxe"), damage: 28, isTool: true };
      } else if (chosenRole === "Builder") {
        color = 0xfff0c878;
        heldWeapon = { name: generateUniqueWeaponName("Carpenter Hammer"), damage: 22, isTool: true };
      } else if (chosenRole === "Farmer") {
        color = 0xff82c878;
        heldWeapon = { name: generateUniqueWeaponName("Cultivation Hoe"), damage: 18, isTool: true, toolType: "hoe" };
      } else if (chosenRole === "Hunter" || chosenRole === "Guard") {
        skin = isFemale ? "Human_Knight_F.png" : "Human_Knight_M.png";
        color = 0xffc87850;
        heldWeapon = { name: generateUniqueWeaponName("Hunting Spear"), damage: 42, isWeapon: true };
      } else if (chosenRole === "Explorer" || chosenRole === "Scholar") {
        skin = isFemale ? "Human_Wizard_F.png" : "Human_Wizard_M.png";
        color = 0xff78dce6;
        heldWeapon = { name: generateUniqueWeaponName("Walking Staff"), damage: 20, isTool: true };
      }
    }

    entProps = {
      name: naming.fullName,
      surname: naming.surname,
      species: normKey,
      birthDate,
      render: { skin, color, backcolor },
      life: createLifeProp(maxLife, maxLife),
      monogamy: createMonogamyProp(),
      terrestrial: createTerrestrialProp(),
      mouth: createMouthProp(32, 32),
      communication: createCommunicationProp(1.6),
      brain: createBrainProp(iq, { bravery: 0.7, curiosity: 0.7, aggression: normKey === "orc" ? 0.7 : 0.2 }, 1.2),
      heart: createHeartProp(),
      liver: createLiverProp(),
      intestines: createIntestineProp(),
      ear_left: createEarProp("left"),
      ear_right: createEarProp("right"),
      stomach: createStomachProp(4, { meat: 1.0, plant: 1.0, fruit: 1.1, organ: 0.9, bone: 0.2 }),
      bladder: createBladderProp(1200, 1200),
      kidney: createKidneyProp(0.75),
      body_regen: createBodyRegenerationProp(1.0, 4, 10),
      combat: createCombatProp(1.1, 3),
      arm_left: createArmProp("left", 1.0, 100, 100, heldWeapon),
      arm_right: createArmProp("right", 1.0, 100, 100),
      leg_left: createLegProp("left", 1.0, 100, 100),
      leg_right: createLegProp("right", 1.0, 100, 100),
      eye_left: createEyeProp("left", viewRange),
      eye_right: createEyeProp("right", viewRange),
      genitalia: createGenitaliaProp(genitaliaType, false),
      locomotion: createLocomotionProp(),
      torso: { condition: 100, maxCondition: 100, nutrition: 2500, foodType: "meat" }
    };
  }

  // 2. WILD FAUNA & BEAST SPECIES
  else if (normKey === "boar") {
    naming = generateUniqueCreatureName("Wild Boar", "boar");
    entProps = {
      name: naming.fullName,
      surname: naming.surname,
      species: "boar",
      birthDate,
      render: { skin: "Creature_Horse_U.png", color: 0xff8c5028, backcolor: 0xff28140a },
      life: createLifeProp(5500, 5500),
      terrestrial: createTerrestrialProp(),
      mouth: createMouthProp(36, 36),
      communication: createCommunicationProp(2.5),
      brain: createBrainProp(11, { bravery: 0.7, curiosity: 0.6, aggression: 0.4 }, 1.0),
      heart: createHeartProp(),
      liver: createLiverProp(),
      intestines: createIntestineProp(),
      ear_left: createEarProp("left"),
      ear_right: createEarProp("right"),
      stomach: createStomachProp(5, { plant: 1.4, fruit: 1.3, meat: 0.5, organ: 0.8 }),
      bladder: createBladderProp(1400, 1400),
      kidney: createKidneyProp(0.7),
      combat: createCombatProp(1.1, 3),
      tusks: createArmProp("tusks", 1.2, 100, 100, { name: generateUniqueWeaponName("Boar Tusks"), damage: 32 }),
      paw_front_left: createPawProp("front_left", 1.1, 100, 100, 0, 0, 0),
      paw_front_right: createPawProp("front_right", 1.1, 100, 100, 0, 0, 0),
      paw_back_left: createPawProp("back_left", 1.1, 100, 100, 0, 0, 0),
      paw_back_right: createPawProp("back_right", 1.1, 100, 100, 0, 0, 0),
      eye_left: createEyeProp("left", 9),
      eye_right: createEyeProp("right", 9),
      genitalia: createGenitaliaProp(genitaliaType),
      locomotion: createLocomotionProp(),
      flesh: { condition: 100, maxCondition: 100, nutrition: 3500, foodType: "meat" }
    };
  } else if (normKey === "deer") {
    naming = generateUniqueCreatureName("Forest Deer", "deer");
    entProps = {
      name: naming.fullName,
      surname: naming.surname,
      species: "deer",
      birthDate,
      render: { skin: "Creature_Horse_U.png", color: 0xffc89650, backcolor: 0xff3c280f },
      life: createLifeProp(4200, 4200),
      terrestrial: createTerrestrialProp(),
      mouth: createMouthProp(30, 30),
      communication: createCommunicationProp(3.0),
      brain: createBrainProp(13, { bravery: 0.2, curiosity: 0.9, aggression: 0.05 }, 1.1),
      heart: createHeartProp(),
      liver: createLiverProp(),
      intestines: createIntestineProp(),
      ear_left: createEarProp("left"),
      ear_right: createEarProp("right"),
      stomach: createStomachProp(4, { plant: 1.5, fruit: 1.4, meat: 0.0 }),
      bladder: createBladderProp(1100, 1100),
      kidney: createKidneyProp(0.7),
      combat: createCombatProp(0.8, 2),
      paw_front_left: createPawProp("front_left", 1.3, 100, 100, 0, 0, 0),
      paw_front_right: createPawProp("front_right", 1.3, 100, 100, 0, 0, 0),
      paw_back_left: createPawProp("back_left", 1.3, 100, 100, 0, 0, 0),
      paw_back_right: createPawProp("back_right", 1.3, 100, 100, 0, 0, 0),
      eye_left: createEyeProp("left", 11),
      eye_right: createEyeProp("right", 11),
      genitalia: createGenitaliaProp(genitaliaType),
      locomotion: createLocomotionProp(),
      flesh: { condition: 100, maxCondition: 100, nutrition: 2600, foodType: "meat" }
    };
  } else if (normKey === "spider") {
    naming = generateUniqueCreatureName("Giant Spider", "spider");
    entProps = {
      name: naming.fullName,
      surname: naming.surname,
      species: "spider",
      birthDate,
      render: { skin: "Creature_Spider_U.png", color: 0xff3c3c46, backcolor: 0xff141419 },
      life: createLifeProp(3600, 3600),
      terrestrial: createTerrestrialProp(),
      mouth: createMouthProp(30, 30),
      communication: createCommunicationProp(4.0),
      brain: createBrainProp(11, { bravery: 0.8, curiosity: 0.5, aggression: 0.85 }, 0.9),
      heart: createHeartProp(),
      intestines: createIntestineProp(),
      stomach: createStomachProp(2, { meat: 1.5, organ: 1.4 }),
      bladder: createBladderProp(700, 700),
      kidney: createKidneyProp(0.6),
      combat: createCombatProp(1.2, 2),
      fangs: createArmProp("fangs", 1.2, 100, 100, { name: generateUniqueWeaponName("Venomous Fangs"), damage: 38 }),
      leg_left: createLegProp("legs_left", 1.2, 100, 100),
      leg_right: createLegProp("legs_right", 1.2, 100, 100),
      eye_left: createEyeProp("left", 11),
      eye_right: createEyeProp("right", 11),
      genitalia: createGenitaliaProp(genitaliaType),
      locomotion: createLocomotionProp(),
      flesh: { condition: 100, maxCondition: 100, nutrition: 1500, foodType: "meat" }
    };
  } else if (normKey === "wolf") {
    naming = generateUniqueCreatureName("Dire Wolf", "wolf");
    entProps = {
      name: naming.fullName,
      surname: naming.surname,
      species: "wolf",
      birthDate,
      render: { skin: "Creature_Wolf_U.png", color: 0xffc8c8dc, backcolor: 0xff28283c },
      life: createLifeProp(4500, 4500),
      terrestrial: createTerrestrialProp(),
      mouth: createMouthProp(42, 42),
      communication: createCommunicationProp(2.5),
      brain: createBrainProp(14, { bravery: 0.8, curiosity: 0.7, aggression: 0.7 }, 1.1),
      heart: createHeartProp(),
      liver: createLiverProp(),
      intestines: createIntestineProp(),
      ear_left: createEarProp("left"),
      ear_right: createEarProp("right"),
      stomach: createStomachProp(3, { meat: 1.4, plant: 0.1, fruit: 0.3, organ: 1.3, bone: 0.6 }),
      bladder: createBladderProp(1000, 1000),
      kidney: createKidneyProp(0.7),
      body_regen: createBodyRegenerationProp(1.0, 4, 9),
      combat: createCombatProp(1.0, 3),
      paw_front_left: createPawProp("front_left", 1.1, 100, 100, 4, 4, 24),
      paw_front_right: createPawProp("front_right", 1.1, 100, 100, 4, 4, 24),
      paw_back_left: createPawProp("back_left", 1.1, 100, 100, 4, 4, 24),
      paw_back_right: createPawProp("back_right", 1.1, 100, 100, 4, 4, 24),
      eye_left: createEyeProp("left", 12),
      eye_right: createEyeProp("right", 12),
      genitalia: createGenitaliaProp(genitaliaType),
      locomotion: createLocomotionProp(),
      flesh: { condition: 100, maxCondition: 100, nutrition: 2200, foodType: "meat" }
    };
  } else if (normKey === "bear") {
    naming = generateUniqueCreatureName("Grizzly Bear", "bear");
    entProps = {
      name: naming.fullName,
      surname: naming.surname,
      species: "bear",
      birthDate,
      render: { skin: "Creature_Bear_U.png", color: 0xff965a28, backcolor: 0xff32190a },
      life: createLifeProp(12000, 12000),
      terrestrial: createTerrestrialProp(),
      aquatic: createAquaticProp(),
      mouth: createMouthProp(42, 42),
      communication: createCommunicationProp(3.0),
      brain: createBrainProp(16, { bravery: 0.9, curiosity: 0.6, aggression: 0.6 }, 1.3),
      heart: createHeartProp(),
      liver: createLiverProp(),
      intestines: createIntestineProp(),
      ear_left: createEarProp("left"),
      ear_right: createEarProp("right"),
      stomach: createStomachProp(6, { meat: 1.3, plant: 0.9, fruit: 1.4, organ: 1.2, bone: 0.5 }),
      bladder: createBladderProp(2200, 2200),
      kidney: createKidneyProp(0.75),
      body_regen: createBodyRegenerationProp(1.0, 6, 11),
      combat: createCombatProp(1.2, 3),
      paw_front_left: createPawProp("front_left", 1.4, 100, 100, 5, 5, 32),
      paw_front_right: createPawProp("front_right", 1.4, 100, 100, 5, 5, 32),
      paw_back_left: createPawProp("back_left", 1.3, 100, 100, 5, 5, 32),
      paw_back_right: createPawProp("back_right", 1.3, 100, 100, 5, 5, 32),
      eye_left: createEyeProp("left", 10),
      eye_right: createEyeProp("right", 10),
      genitalia: createGenitaliaProp(genitaliaType),
      locomotion: createLocomotionProp(),
      flesh: { condition: 100, maxCondition: 100, nutrition: 6000, foodType: "meat" }
    };
  } else if (normKey === "cat") {
    naming = generateUniqueCreatureName("Wild Feline", "cat");
    entProps = {
      name: naming.fullName,
      surname: naming.surname,
      species: "cat",
      birthDate,
      render: { skin: "Creature_Cat_U.png", color: 0xfff0b464, backcolor: 0xff321e0f },
      life: createLifeProp(3500, 3500),
      terrestrial: createTerrestrialProp(),
      mouth: createMouthProp(30, 30),
      communication: createCommunicationProp(3.0),
      brain: createBrainProp(12, { bravery: 0.4, curiosity: 0.9, aggression: 0.3 }, 1.0),
      stomach: createStomachProp(2, { meat: 1.3, plant: 0.2, fruit: 0.5, organ: 1.4, bone: 0.4 }),
      bladder: createBladderProp(600, 600),
      kidney: createKidneyProp(0.6),
      body_regen: createBodyRegenerationProp(1.0, 3, 8),
      combat: createCombatProp(1.0, 2),
      paw_front_left: createPawProp("front_left", 1.0, 100, 100, 4, 4, 14),
      paw_front_right: createPawProp("front_right", 1.0, 100, 100, 4, 4, 14),
      paw_back_left: createPawProp("back_left", 1.0, 100, 100, 4, 4, 14),
      paw_back_right: createPawProp("back_right", 1.0, 100, 100, 4, 4, 14),
      eye_left: createEyeProp("left", 10),
      eye_right: createEyeProp("right", 10),
      genitalia: createGenitaliaProp(genitaliaType),
      locomotion: createLocomotionProp(),
      flesh: { condition: 100, maxCondition: 100, nutrition: 1800, foodType: "meat" }
    };
    if (customOpts.infected) {
      entProps.parasites = createParasitesProp(1.5);
    }
  } else if (normKey === "bat") {
    naming = generateUniqueCreatureName("Cave Bat", "bat");
    entProps = {
      name: naming.fullName,
      surname: naming.surname,
      species: "bat",
      birthDate,
      render: { skin: "Creature_Bat_U.png", color: 0xffb496dc, backcolor: 0xff281e3c },
      life: createLifeProp(2000, 2000),
      flying: createFlyingProp(2.2),
      terrestrial: createTerrestrialProp(),
      mouth: createMouthProp(20, 20),
      communication: createCommunicationProp(2.5),
      wings: createWingsProp(1.0, 100, 100, 15.0),
      brain: createBrainProp(10, { bravery: 0.3, curiosity: 0.8, aggression: 0.2 }, 0.8),
      stomach: createStomachProp(2, { meat: 0.5, fruit: 1.4, organ: 1.0 }),
      bladder: createBladderProp(450, 450),
      kidney: createKidneyProp(0.6),
      paw_back_left: createPawProp("back_left", 0.9, 100, 100, 3, 3, 12),
      paw_back_right: createPawProp("back_right", 0.9, 100, 100, 3, 3, 12),
      eye_left: createEyeProp("left", 12),
      eye_right: createEyeProp("right", 12),
      genitalia: createGenitaliaProp(genitaliaType),
      locomotion: createLocomotionProp(),
      flesh: { condition: 100, maxCondition: 100, nutrition: 800, foodType: "meat" }
    };
  } else if (normKey === "serpent") {
    naming = generateUniqueCreatureName("Abyssal Serpent", "serpent");
    entProps = {
      name: naming.fullName,
      surname: naming.surname,
      species: "serpent",
      birthDate,
      render: { skin: "Creature_Snake_U.png", color: 0xff32c8d2, backcolor: 0xff0a2832 },
      life: createLifeProp(8000, 8000),
      aquatic: createAquaticProp(),
      mouth: createMouthProp(60, 60),
      communication: createCommunicationProp(3.5),
      brain: createBrainProp(14, { bravery: 0.7, curiosity: 0.6, aggression: 0.7 }, 1.2),
      stomach: createStomachProp(4, { meat: 1.4, organ: 1.3, bone: 0.4 }),
      bladder: createBladderProp(2000, 2000),
      kidney: createKidneyProp(0.5),
      body_regen: createBodyRegenerationProp(1.0, 5, 9),
      combat: createCombatProp(1.1, 3),
      tail: { condition: 100, maxCondition: 100, nutrition: 3000, foodType: "meat" },
      eye_left: createEyeProp("left", 11),
      eye_right: createEyeProp("right", 11),
      genitalia: createGenitaliaProp(genitaliaType),
      locomotion: createLocomotionProp(),
      flesh: { condition: 100, maxCondition: 100, nutrition: 4000, foodType: "meat" }
    };
  } else if (normKey === "dragon") {
    naming = generateUniqueCreatureName("Ancient Wyrm", "dragon");
    entProps = {
      name: naming.fullName,
      surname: naming.surname,
      species: "dragon",
      birthDate,
      render: { skin: "Creature_Dragon_U.png", color: 0xffff4646, backcolor: 0xff3c0f0f },
      life: createLifeProp(30000, 30000),
      flying: createFlyingProp(2.5),
      terrestrial: createTerrestrialProp(),
      mouth: createMouthProp(80, 80),
      communication: createCommunicationProp(2.0),
      brain: createBrainProp(24, { bravery: 1.0, curiosity: 0.4, aggression: 0.9 }, 1.8),
      stomach: createStomachProp(8, { meat: 1.5, plant: 0.1, fruit: 0.2, organ: 1.5, bone: 1.0 }),
      bladder: createBladderProp(3500, 3500),
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
      genitalia: createGenitaliaProp(genitaliaType),
      regeneration: createRegenerationProp(1.0, 35),
      locomotion: createLocomotionProp(),
      dragon_flesh: { condition: 100, maxCondition: 100, nutrition: 10000, foodType: "meat" }
    };
  } else if (normKey === "capybara") {
    naming = generateUniqueCreatureName("Capivara Mansa", "capybara");
    entProps = {
      name: naming.fullName,
      surname: naming.surname,
      species: "capybara",
      birthDate,
      render: { skin: "Creature_Horse_U.png", color: 0xffa57846, backcolor: 0xff28190a },
      life: createLifeProp(3800, 3800),
      terrestrial: createTerrestrialProp(),
      aquatic: createAquaticProp(),
      mouth: createMouthProp(28, 28),
      communication: createCommunicationProp(4.0),
      brain: createBrainProp(8, { bravery: 0.2, curiosity: 0.9, aggression: 0.02 }, 1.0),
      stomach: createStomachProp(4, { plant: 1.6, fruit: 1.4, meat: 0.0 }),
      bladder: createBladderProp(1200, 1200),
      kidney: createKidneyProp(0.7),
      paw_front_left: createPawProp("front_left", 1.0, 100, 100, 0, 0, 0),
      paw_front_right: createPawProp("front_right", 1.0, 100, 100, 0, 0, 0),
      paw_back_left: createPawProp("back_left", 1.0, 100, 100, 0, 0, 0),
      paw_back_right: createPawProp("back_right", 1.0, 100, 100, 0, 0, 0),
      eye_left: createEyeProp("left", 9),
      eye_right: createEyeProp("right", 9),
      genitalia: createGenitaliaProp(genitaliaType),
      locomotion: createLocomotionProp(),
      flesh: { condition: 100, maxCondition: 100, nutrition: 3200, foodType: "meat" }
    };
  } else if (normKey === "cow") {
    naming = generateUniqueCreatureName("Vaca Leiteira", "cow");
    entProps = {
      name: naming.fullName,
      surname: naming.surname,
      species: "cow",
      birthDate,
      render: { skin: "Creature_Horse_U.png", color: 0xffe6e6dc, backcolor: 0xff1e1e28 },
      life: createLifeProp(6000, 6000),
      terrestrial: createTerrestrialProp(),
      mouth: createMouthProp(32, 32),
      communication: createCommunicationProp(3.5),
      brain: createBrainProp(7, { bravery: 0.2, curiosity: 0.4, aggression: 0.05 }, 0.9),
      stomach: createStomachProp(6, { plant: 1.8, fruit: 1.2, meat: 0.0 }),
      bladder: createBladderProp(2500, 2500),
      kidney: createKidneyProp(0.7),
      paw_front_left: createPawProp("front_left", 1.2, 100, 100, 0, 0, 0),
      paw_front_right: createPawProp("front_right", 1.2, 100, 100, 0, 0, 0),
      paw_back_left: createPawProp("back_left", 1.2, 100, 100, 0, 0, 0),
      paw_back_right: createPawProp("back_right", 1.2, 100, 100, 0, 0, 0),
      eye_left: createEyeProp("left", 8),
      eye_right: createEyeProp("right", 8),
      genitalia: createGenitaliaProp(genitaliaType),
      locomotion: createLocomotionProp(),
      flesh: { condition: 100, maxCondition: 100, nutrition: 4500, foodType: "meat" }
    };
  } else if (normKey === "chicken") {
    naming = generateUniqueCreatureName("Galinha Caipira", "chicken");
    entProps = {
      name: naming.fullName,
      surname: naming.surname,
      species: "chicken",
      birthDate,
      render: { skin: "Creature_Bat_U.png", color: 0xfff0c832, backcolor: 0xff64280a },
      life: createLifeProp(1200, 1200),
      terrestrial: createTerrestrialProp(),
      mouth: createMouthProp(16, 16),
      communication: createCommunicationProp(2.0),
      brain: createBrainProp(6, { bravery: 0.1, curiosity: 0.9, aggression: 0.05 }, 0.8),
      stomach: createStomachProp(2, { plant: 1.4, fruit: 1.5, meat: 0.2 }),
      bladder: createBladderProp(400, 400),
      kidney: createKidneyProp(0.5),
      beak: createArmProp("beak", 0.6, 100, 100, { name: "Bico", damage: 6 }),
      paw_back_left: createPawProp("back_left", 0.7, 100, 100, 2, 2, 6),
      paw_back_right: createPawProp("back_right", 0.7, 100, 100, 2, 2, 6),
      eye_left: createEyeProp("left", 9),
      eye_right: createEyeProp("right", 9),
      genitalia: createGenitaliaProp(genitaliaType),
      locomotion: createLocomotionProp(),
      flesh: { condition: 100, maxCondition: 100, nutrition: 800, foodType: "meat" }
    };
  } else if (normKey === "duck") {
    naming = generateUniqueCreatureName("Pato Selvagem", "duck");
    entProps = {
      name: naming.fullName,
      surname: naming.surname,
      species: "duck",
      birthDate,
      render: { skin: "Creature_Bat_U.png", color: 0xff46aa78, backcolor: 0xff143c28 },
      life: createLifeProp(1500, 1500),
      terrestrial: createTerrestrialProp(),
      aquatic: createAquaticProp(),
      mouth: createMouthProp(16, 16),
      communication: createCommunicationProp(2.5),
      brain: createBrainProp(6, { bravery: 0.2, curiosity: 0.9, aggression: 0.02 }, 0.9),
      stomach: createStomachProp(2, { plant: 1.5, fruit: 1.4, meat: 0.4 }),
      bladder: createBladderProp(500, 500),
      kidney: createKidneyProp(0.5),
      paw_back_left: createPawProp("back_left", 0.7, 100, 100, 2, 2, 6),
      paw_back_right: createPawProp("back_right", 0.7, 100, 100, 2, 2, 6),
      eye_left: createEyeProp("left", 10),
      eye_right: createEyeProp("right", 10),
      genitalia: createGenitaliaProp(genitaliaType),
      locomotion: createLocomotionProp(),
      flesh: { condition: 100, maxCondition: 100, nutrition: 900, foodType: "meat" }
    };
  } else if (normKey === "frog") {
    naming = generateUniqueCreatureName("Sapo Cururu", "frog");
    entProps = {
      name: naming.fullName,
      surname: naming.surname,
      species: "frog",
      birthDate,
      render: { skin: "Creature_Snake_U.png", color: 0xff50c850, backcolor: 0xff143c14 },
      life: createLifeProp(1400, 1400),
      terrestrial: createTerrestrialProp(),
      aquatic: createAquaticProp(),
      mouth: createMouthProp(18, 18),
      communication: createCommunicationProp(3.0),
      brain: createBrainProp(6, { bravery: 0.1, curiosity: 0.8, aggression: 0.05 }, 0.8),
      stomach: createStomachProp(2, { meat: 1.2, plant: 0.8, fruit: 0.5 }),
      bladder: createBladderProp(450, 450),
      kidney: createKidneyProp(0.5),
      paw_front_left: createPawProp("front_left", 0.7, 100, 100, 0, 0, 0),
      paw_front_right: createPawProp("front_right", 0.7, 100, 100, 0, 0, 0),
      paw_back_left: createPawProp("back_left", 1.0, 100, 100, 0, 0, 0),
      paw_back_right: createPawProp("back_right", 1.0, 100, 100, 0, 0, 0),
      eye_left: createEyeProp("left", 10),
      eye_right: createEyeProp("right", 10),
      genitalia: createGenitaliaProp(genitaliaType),
      locomotion: createLocomotionProp(),
      flesh: { condition: 100, maxCondition: 100, nutrition: 600, foodType: "meat" }
    };
  } else if (normKey === "rabbit") {
    naming = generateUniqueCreatureName("Coelho Veloz", "rabbit");
    entProps = {
      name: naming.fullName,
      surname: naming.surname,
      species: "rabbit",
      birthDate,
      render: { skin: "Creature_Cat_U.png", color: 0xffeae0d0, backcolor: 0xff3c281e },
      life: createLifeProp(1800, 1800),
      terrestrial: createTerrestrialProp(),
      mouth: createMouthProp(20, 20),
      communication: createCommunicationProp(3.5),
      brain: createBrainProp(8, { bravery: 0.1, curiosity: 0.95, aggression: 0.01 }, 1.3),
      stomach: createStomachProp(2, { plant: 1.6, fruit: 1.5, meat: 0.0 }),
      bladder: createBladderProp(450, 450),
      kidney: createKidneyProp(0.6),
      paw_front_left: createPawProp("front_left", 0.8, 100, 100, 0, 0, 0),
      paw_front_right: createPawProp("front_right", 0.8, 100, 100, 0, 0, 0),
      paw_back_left: createPawProp("back_left", 1.2, 100, 100, 0, 0, 0),
      paw_back_right: createPawProp("back_right", 1.2, 100, 100, 0, 0, 0),
      eye_left: createEyeProp("left", 11),
      eye_right: createEyeProp("right", 11),
      genitalia: createGenitaliaProp(genitaliaType),
      locomotion: createLocomotionProp(),
      flesh: { condition: 100, maxCondition: 100, nutrition: 1100, foodType: "meat" }
    };
  } else {
    naming = generateUniqueCreatureName("Creature", normKey);
    entProps = {
      name: naming.fullName,
      surname: naming.surname,
      species: normKey,
      birthDate,
      render: { skin: "Human_Normal_M.png", color: 0xffdcdce6, backcolor: 0xff1e283c },
      life: createLifeProp(5000, 5000),
      terrestrial: createTerrestrialProp(),
      mouth: createMouthProp(30, 30),
      communication: createCommunicationProp(1.5),
      brain: createBrainProp(15, { bravery: 0.5, curiosity: 0.5, aggression: 0.3 }, 1.0),
      stomach: createStomachProp(4, { meat: 1.0, plant: 1.0, fruit: 1.0, organ: 1.0 }),
      bladder: createBladderProp(3000, 3000),
      kidney: createKidneyProp(0.7),
      eye_left: createEyeProp("left", 8),
      eye_right: createEyeProp("right", 8),
      genitalia: createGenitaliaProp(genitaliaType),
      locomotion: createLocomotionProp(),
      flesh: { condition: 100, maxCondition: 100, nutrition: 2000, foodType: "meat" }
    };
  }

  // Apply procedural sexual orientation
  if (orientation === "bisexual") entProps.bisexual = createBisexualProp();
  else if (orientation === "homosexual") entProps.homosexual = createHomosexualProp();

  // Apply procedural traits
  for (const [tKey, tVal] of Object.entries(traits)) {
    if (tVal) entProps[tKey] = true;
  }

  // Apply randomized personality perks
  if (entProps.life) {
    applyRandomPersonalityPerks(entProps, isFemale);
  }

  return createEntity(entProps, x, y);
}

export function createElf(x, y, opts = {}) {
  return createCreatureFromArchetype("elf", x, y, opts);
}

export function createDwarf(x, y, opts = {}) {
  return createCreatureFromArchetype("dwarf", x, y, opts);
}

export function createOrc(x, y, opts = {}) {
  return createCreatureFromArchetype("orc", x, y, opts);
}

export function createBoar(x, y, opts = {}) {
  return createCreatureFromArchetype("boar", x, y, opts);
}

export function createDeer(x, y, opts = {}) {
  return createCreatureFromArchetype("deer", x, y, opts);
}

export function createSpider(x, y, opts = {}) {
  return createCreatureFromArchetype("spider", x, y, opts);
}

export function createHuman(x, y, opts = {}) {
  return createCreatureFromArchetype("human", x, y, opts);
}

export function createKnight(x, y, gender = null) {
  return createCreatureFromArchetype("human", x, y, { role: "Guard", gender });
}

export function createArcher(x, y, gender = null) {
  return createCreatureFromArchetype("elf", x, y, { role: "Hunter", gender });
}

export function createCat(x, y, infected = false) {
  return createCreatureFromArchetype("cat", x, y, { infected });
}

export function createWolf(x, y) {
  return createCreatureFromArchetype("wolf", x, y);
}

export function createBear(x, y) {
  return createCreatureFromArchetype("bear", x, y);
}

export function createGoblin(x, y) {
  return createCreatureFromArchetype("goblin", x, y);
}

export function createBat(x, y) {
  return createCreatureFromArchetype("bat", x, y);
}

export function createSeaSerpent(x, y) {
  return createCreatureFromArchetype("serpent", x, y);
}

export function createDragon(x, y) {
  return createCreatureFromArchetype("dragon", x, y);
}

export function createCapybara(x, y, opts = {}) {
  return createCreatureFromArchetype("capybara", x, y, opts);
}

export function createCow(x, y, opts = {}) {
  return createCreatureFromArchetype("cow", x, y, opts);
}

export function createChicken(x, y, opts = {}) {
  return createCreatureFromArchetype("chicken", x, y, opts);
}

export function createDuck(x, y, opts = {}) {
  return createCreatureFromArchetype("duck", x, y, opts);
}

export function createFrog(x, y, opts = {}) {
  return createCreatureFromArchetype("frog", x, y, opts);
}

export function createRabbit(x, y, opts = {}) {
  return createCreatureFromArchetype("rabbit", x, y, opts);
}

export function createKobold(x, y, opts = {}) {
  return createCreatureFromArchetype("kobold", x, y, opts);
}

export function createLizardfolk(x, y, opts = {}) {
  return createCreatureFromArchetype("lizardfolk", x, y, opts);
}

export function createCatfolk(x, y, opts = {}) {
  return createCreatureFromArchetype("catfolk", x, y, opts);
}

export function createCentaur(x, y, opts = {}) {
  return createCreatureFromArchetype("centaur", x, y, opts);
}

/**
 * Seed Germination (Slow natural germination with spatial spacing constraints)
 */
export function createSeedGerminationProp(species = "oak", checkInterval = 2.0, sproutChance = 0.55) {
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

        // Density & Spacing Clearance: Allow plant growth if no tree on exact tile
        for (let i = 0; i < entities.length; i++) {
          const e = entities[i];
          if (!e.destroyed && e.id !== ent.id && (e.properties?.photosynthesis || e.properties?.deep_root || e.properties?.species === "oak" || e.properties?.species === "willow" || e.properties?.species === "cactus" || e.properties?.species === "pine" || e.properties?.species === "berry" || e.properties?.species === "lichen")) {
            if (e.x === ent.x && e.y === ent.y) {
              return; // Exact tile occupied
            }
          }
        }

        const tile = world.getTile(ent.x, ent.y);
        const isSuitable =
          (this.species === "cactus" && (tile === 3 || tile === 0)) ||
          (this.species === "lichen" && (tile === 4 || tile === 1)) ||
          (this.species === "pine" && (tile === 0 || tile === 4 || tile === 1)) ||
          (tile === 0 || tile === 3);

        if (isSuitable && !isRoadTile(ent.x, ent.y) && Math.random() < this.sproutChance) {
          let newPlant = null;
          if (this.species === "willow") {
            newPlant = createWillowTree(ent.x, ent.y);
          } else if (this.species === "pine") {
            newPlant = createPineTree(ent.x, ent.y);
          } else if (this.species === "cactus") {
            newPlant = createCactus(ent.x, ent.y);
          } else if (this.species === "berry") {
            newPlant = createBerryBush(ent.x, ent.y);
          } else if (this.species === "lichen") {
            newPlant = createAlpineShrub(ent.x, ent.y);
          } else {
            newPlant = createOakTree(ent.x, ent.y);
          }

          ent.destroyed = true;
          if (entities && newPlant) {
            entities.push(newPlant);
            registerEntitySpatial(newPlant);
            recordWorldEvent({
              type: "SPROUT",
              primaryEntityId: newPlant.id,
              secondaryEntityId: ent.id,
              location: { x: ent.x, y: ent.y },
              description: `A wild seed germinated into ${newPlant.properties.name}!`,
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
      life: createLifeProp(8000, 8000, 0.04),
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
      life: createLifeProp(4500, 4500, 0.04),
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
      life: createLifeProp(12000, 12000, 0.08),
      bladder: createBladderProp(6000, 6000),
      deep_root: createDeepRootProp(20.0, 12.0),
      photosynthesis: createPhotosynthesisProp(0.3, 35.0),
      fruiting: createFruitingProp(35.0, "large", "oak"),
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
      life: createLifeProp(9000, 9000, 0.08),
      bladder: createBladderProp(4000, 4000),
      photosynthesis: createPhotosynthesisProp(0.3, 30.0),
      fruiting: createFruitingProp(30.0, "small", "willow"),
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
      life: createLifeProp(11000, 11000, 0.08),
      bladder: createBladderProp(5000, 5000),
      deep_root: createDeepRootProp(18.0, 14.0),
      photosynthesis: createPhotosynthesisProp(0.3, 32.0),
      fruiting: createFruitingProp(32.0, "large", "pine"),
      terrain_pref: createTerrainPreferenceProp([0, 1], "Soil and Mountain"),
      wood: { nutrition: 1800, foodType: "plant" }
    },
    x,
    y
  );
}

export function createCherryBlossomTree(x, y) {
  return createEntity(
    {
      name: generateUniqueFloraName("Cerejeira Ancestral", "cherry_blossom"),
      species: "cherry_blossom",
      render: { skin: "Feature_Tree_Full.png", color: 0xffffb7c5, backcolor: 0xff3e1824 },
      life: createLifeProp(11000, 11000, 0.08),
      bladder: createBladderProp(5500, 5500),
      deep_root: createDeepRootProp(18.0, 12.0),
      photosynthesis: createPhotosynthesisProp(0.3, 34.0),
      fruiting: createFruitingProp(34.0, "large", "cherry"),
      terrain_pref: createTerrainPreferenceProp([0, 9], "Plains and Hills"),
      wood: { nutrition: 1900, foodType: "plant" }
    },
    x,
    y
  );
}

export function createBirchTree(x, y) {
  return createEntity(
    {
      name: generateUniqueFloraName("Bétula Dourada", "birch"),
      species: "birch",
      render: { skin: "Feature_Tree_Full.png", color: 0xffd4e668, backcolor: 0xff3a4812 },
      life: createLifeProp(10000, 10000, 0.08),
      bladder: createBladderProp(4800, 4800),
      deep_root: createDeepRootProp(16.0, 10.0),
      photosynthesis: createPhotosynthesisProp(0.3, 32.0),
      fruiting: createFruitingProp(30.0, "large", "birch"),
      terrain_pref: createTerrainPreferenceProp([0, 9], "Lowlands and Hills"),
      wood: { nutrition: 1700, foodType: "plant" }
    },
    x,
    y
  );
}

export function createMapleTree(x, y) {
  return createEntity(
    {
      name: generateUniqueFloraName("Bordo Carmesim", "maple"),
      species: "maple",
      render: { skin: "Feature_Tree_Full.png", color: 0xffe85226, backcolor: 0xff481608 },
      life: createLifeProp(12500, 12500, 0.08),
      bladder: createBladderProp(6000, 6000),
      deep_root: createDeepRootProp(22.0, 14.0),
      photosynthesis: createPhotosynthesisProp(0.3, 36.0),
      fruiting: createFruitingProp(36.0, "large", "maple"),
      terrain_pref: createTerrainPreferenceProp([0, 9, 4], "Hills and Foothills"),
      wood: { nutrition: 2100, foodType: "plant" }
    },
    x,
    y
  );
}

export function createBerryBush(x, y) {
  return createEntity(
    {
      name: generateUniqueFloraName("Arbusto de Amoras", "berry"),
      species: "berry",
      render: { skin: "Feature_Bush.png", color: 0xff48c85a, backcolor: 0xff143c14 },
      life: createLifeProp(5000, 5000, 0.08),
      bladder: createBladderProp(3000, 3000),
      deep_root: createDeepRootProp(12.0, 8.0),
      photosynthesis: createPhotosynthesisProp(0.3, 28.0),
      fruiting: createFruitingProp(22.0, "small", "berry"),
      terrain_pref: createTerrainPreferenceProp([0, 9], "Fertile Soil and Hills"),
      wood: { nutrition: 800, foodType: "plant" }
    },
    x,
    y
  );
}

export function createRoseBush(x, y) {
  return createEntity(
    {
      name: generateUniqueFloraName("Arbusto Florido", "rose_bush"),
      species: "rose_bush",
      render: { skin: "Feature_Bush.png", color: 0xffff4c70, backcolor: 0xff301018 },
      life: createLifeProp(5500, 5500, 0.08),
      bladder: createBladderProp(3200, 3200),
      deep_root: createDeepRootProp(14.0, 8.0),
      photosynthesis: createPhotosynthesisProp(0.3, 26.0),
      fruiting: createFruitingProp(24.0, "small", "rose"),
      terrain_pref: createTerrainPreferenceProp([0, 9], "Fertile Plains and Hills"),
      plant_flesh: { nutrition: 750, foodType: "plant" }
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
      life: createLifeProp(5000, 5000, 0.05),
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
      life: createLifeProp(4000, 4000, 0.05),
      bladder: createBladderProp(3000, 3000),
      photosynthesis: createPhotosynthesisProp(0.1, 25.0),
      terrain_pref: createTerrainPreferenceProp([2], "Ocean Water"),
      edible: { nutrition: 3000, foodType: "plant", digestDuration: 80 }
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
        nutrition: species === "cactus" ? 4500 : 3800,
        foodType: "fruit",
        digestDuration: 90,
        sourceName: species === "cactus" ? "Desert Cactus" : (species === "willow" ? "Willow" : (species === "pine" ? "Pine" : "Oak")),
        sourceSpecies: species,
        seed: { type: seedType, species }
      },
      lifespan: createLifespanProp(60.0) // Natural decomposition after 1 minute if left in wild
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
      germination: createSeedGerminationProp(species, 5.0, 0.40),
      edible: { nutrition: 600, foodType: "plant", digestDuration: 20 },
      lifespan: createLifespanProp(60.0) // Sprouts or decomposes after 1 minute if uncollected
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
      lifespan: createLifespanProp(seed ? 15.0 : 6.0) // Quickly decays (6s normal, 15s with seed)
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
  const ent = createCreatureFromArchetype("human", x, y, { role: "Miner", name });
  ent.properties.group_member = createGroupMemberProp();
  return ent;
}

export function createHumanBuilder(x, y, name = null) {
  const ent = createCreatureFromArchetype("human", x, y, { role: "Builder", name });
  ent.properties.group_member = createGroupMemberProp();
  return ent;
}

export function createHumanCrafter(x, y, name = null) {
  const ent = createCreatureFromArchetype("human", x, y, { role: "Crafter", name });
  ent.properties.group_member = createGroupMemberProp();
  return ent;
}

export function createHumanFarmer(x, y, name = null) {
  const ent = createCreatureFromArchetype("human", x, y, { role: "Farmer", name });
  ent.properties.group_member = createGroupMemberProp();
  return ent;
}

export function createHumanMatriarch(x, y, name = null) {
  const ent = createCreatureFromArchetype("human", x, y, { role: "Matriarch", gender: "female", name });
  ent.properties.group_member = createGroupMemberProp();
  return ent;
}

export function createHumanHunter(x, y, name = null) {
  const ent = createCreatureFromArchetype("human", x, y, { role: "Hunter", name });
  ent.properties.group_member = createGroupMemberProp();
  return ent;
}

export function createHumanExplorer(x, y, name = null) {
  const ent = createCreatureFromArchetype("human", x, y, { role: "Explorer", name });
  ent.properties.group_member = createGroupMemberProp();
  return ent;
}

/**
 * Spawns an Embark Party of 7 intelligent settlers belonging to a newly formed Clan,
 * equipped with starter supplies, mutual clan affinity, and claims.
 * Supports diverse species themes: Dwarven, Elven, Orcish, Goblin, Lizardfolk, Multi-Species, etc.
 */
export function createEmbarkParty(centerX, centerY, world, entities, customOpts = {}) {
  const THEMES = [
    "diverse", "dwarf", "elf", "orc", "goblin", "lizardfolk", "human", "catfolk", "centaur", "random"
  ];
  const theme = customOpts.theme || THEMES[Math.floor(Math.random() * THEMES.length)];
  let clanName = customOpts.name || gerarNomeGrupo();

  const allSpecies = ["human", "dwarf", "elf", "orc", "goblin", "kobold", "lizardfolk", "catfolk", "centaur"];
  const roles = ["Builder", "Miner", "Farmer", "Crafter", "Hunter", "Matriarch", "Guard"];

  let partyPlan = [];

  if (theme === "dwarf") {
    clanName = clanName.replace(/Clã|Tribo/g, "Clã Anão").replace(/Reino/g, "Bastião dos Anões");
    partyPlan = [
      { species: "dwarf", role: "Miner" },
      { species: "dwarf", role: "Builder" },
      { species: "dwarf", role: "Crafter" },
      { species: "dwarf", role: "Guard" },
      { species: "dwarf", role: "Farmer" },
      { species: "dwarf", role: "Matriarch", gender: "female" },
      { species: "dwarf", role: "Hunter" }
    ];
  } else if (theme === "elf") {
    clanName = clanName.replace(/Clã|Tribo/g, "Bosque Élfico").replace(/Reino/g, "Santuário Élfico");
    partyPlan = [
      { species: "elf", role: "Farmer" },
      { species: "elf", role: "Hunter" },
      { species: "elf", role: "Builder" },
      { species: "elf", role: "Guard" },
      { species: "elf", role: "Crafter" },
      { species: "elf", role: "Matriarch", gender: "female" },
      { species: "elf", role: "Explorer" }
    ];
  } else if (theme === "orc") {
    clanName = clanName.replace(/Clã|Tribo/g, "Horda Orc").replace(/Reino/g, "Fortaleza Orc");
    partyPlan = [
      { species: "orc", role: "Hunter" },
      { species: "orc", role: "Guard" },
      { species: "orc", role: "Builder" },
      { species: "orc", role: "Miner" },
      { species: "orc", role: "Crafter" },
      { species: "orc", role: "Matriarch", gender: "female" },
      { species: "orc", role: "Farmer" }
    ];
  } else if (theme === "goblin") {
    clanName = clanName.replace(/Clã|Tribo/g, "Bando Goblin").replace(/Reino/g, "Toca Goblin");
    partyPlan = [
      { species: "goblin", role: "Crafter" },
      { species: "kobold", role: "Miner" },
      { species: "goblin", role: "Builder" },
      { species: "goblin", role: "Hunter" },
      { species: "kobold", role: "Farmer" },
      { species: "goblin", role: "Matriarch", gender: "female" },
      { species: "goblin", role: "Guard" }
    ];
  } else if (theme === "lizardfolk") {
    clanName = clanName.replace(/Clã|Tribo/g, "Tribo dos Homens-Lagarto");
    partyPlan = [
      { species: "lizardfolk", role: "Hunter" },
      { species: "lizardfolk", role: "Farmer" },
      { species: "lizardfolk", role: "Builder" },
      { species: "lizardfolk", role: "Guard" },
      { species: "lizardfolk", role: "Crafter" },
      { species: "lizardfolk", role: "Matriarch", gender: "female" },
      { species: "lizardfolk", role: "Miner" }
    ];
  } else if (theme === "catfolk") {
    clanName = clanName.replace(/Clã|Tribo/g, "Orgulho Felino");
    partyPlan = [
      { species: "catfolk", role: "Hunter" },
      { species: "catfolk", role: "Explorer" },
      { species: "catfolk", role: "Builder" },
      { species: "catfolk", role: "Crafter" },
      { species: "catfolk", role: "Farmer" },
      { species: "catfolk", role: "Matriarch", gender: "female" },
      { species: "catfolk", role: "Guard" }
    ];
  } else if (theme === "centaur") {
    clanName = clanName.replace(/Clã|Tribo/g, "Nômades Centauros");
    partyPlan = [
      { species: "centaur", role: "Hunter" },
      { species: "centaur", role: "Explorer" },
      { species: "centaur", role: "Builder" },
      { species: "elf", role: "Farmer" },
      { species: "centaur", role: "Guard" },
      { species: "centaur", role: "Matriarch", gender: "female" },
      { species: "elf", role: "Crafter" }
    ];
  } else if (theme === "random") {
    clanName = `Expedição ${gerarNomeGrupo()}`;
    partyPlan = roles.map(r => ({
      species: allSpecies[Math.floor(Math.random() * allSpecies.length)],
      role: r,
      gender: r === "Matriarch" ? "female" : (Math.random() < 0.5 ? "male" : "female")
    }));
  } else {
    // Multi-Species Cosmopolitan Expedition
    partyPlan = [
      { species: "human", role: "Builder" },
      { species: "dwarf", role: "Miner" },
      { species: "elf", role: "Farmer" },
      { species: "catfolk", role: "Crafter" },
      { species: "orc", role: "Hunter" },
      { species: "human", role: "Matriarch", gender: "female" },
      { species: "lizardfolk", role: "Guard" }
    ];
  }

  const SURNAMES = ["Silveira", "Rocha", "Barros", "Prado", "Montes", "Ramos", "Torres", "Valente", "Carvalho", "Alba", "Ferreira", "Macedo", "Gouveia", "Freitas", "Machado", "Fontes", "Martelo-de-Ferro", "Folha-Verde", "Presa-de-Lobo", "Canto-da-Lua", "Pedra-Funda"];
  const surname = SURNAMES[Math.floor(Math.random() * SURNAMES.length)];

  const members = [];
  const offsets = [
    { dx: 0, dy: 0 },
    { dx: 1, dy: 0 },
    { dx: -1, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: 0, dy: -1 },
    { dx: 1, dy: 1 },
    { dx: -1, dy: 1 }
  ];

  for (let i = 0; i < partyPlan.length; i++) {
    const off = offsets[i] || { dx: 0, dy: 0 };
    let px = centerX + off.dx;
    let py = centerY + off.dy;
    if (world && !world.isWalkable(px, py)) {
      px = centerX;
      py = centerY;
    }
    const plan = partyPlan[i];
    const ent = createCreatureFromArchetype(plan.species, px, py, { role: plan.role, gender: plan.gender, world });
    ent.properties.surname = surname;
    members.push(ent);
    if (entities && !entities.includes(ent)) entities.push(ent);
  }

  // Create new unique Clan
  const founder = members[0];
  const zx0 = Math.floor(centerX / currentZoneSize);
  const zy0 = Math.floor(centerY / currentZoneSize);
  const clan = createGroup(clanName, founder, [zx0, zy0]);
  clan.members = members.map(m => m.id);

  for (const m of members) {
    m.properties.group = clan;
    m.properties.group_member = createGroupMemberProp();
    if (m.properties.brain) {
      if (!m.properties.brain.affinities) m.properties.brain.affinities = {};
      for (const peer of members) {
        if (peer.id !== m.id) {
          m.properties.brain.affinities[peer.id] = 40;
        }
      }
    }
  }

  // Spawn Clan Plaza Leader Palace & Central Hearth directly on embark for every clan!
  if (entities) {
    const plaza = clan._plaza || initClanPlaza(clan);

    if (plaza?.campfire) {
      const cf = createCampfireEntity(plaza.campfire.x, plaza.campfire.y);
      if (cf) {
        cf.isConstructed = true;
        if (cf.properties?.campfire) cf.properties.campfire.isLit = true;
        entities.push(cf);
        registerEntitySpatial(cf);
      }
    }

    const starterItems = [
      createWoodItem(centerX + 1, centerY - 1),
      createStoneItem(centerX - 1, centerY - 1),
      createSeedEntity(centerX, centerY + 2, "large", "oak"),
      createFruit(centerX + 1, centerY + 2, "large", "oak")
    ];
    for (const item of starterItems) {
      entities.push(item);
      registerEntitySpatial(item);
    }
  }

  // Record World Events for all founding settlers
  recordWorldEvent({
    type: "BIRTH",
    primaryEntityId: founder.id,
    location: { x: centerX, y: centerY },
    description: `O clã "${clanName}" desembarcou e estabeleceu seu assentamento em [X: ${centerX}, Y: ${centerY}]!`,
    tick: currentTick,
    timestamp: world?.clock ? { day: world.clock.day, hour: world.clock.hour, minute: world.clock.minute } : null
  });

  for (const m of members) {
    if (m !== founder) {
      recordWorldEvent({
        type: "BIRTH",
        primaryEntityId: m.id,
        location: { x: m.x, y: m.y },
        description: `${m.properties.name} juntou-se à expedição pioneira do clã "${clanName}"!`,
        tick: currentTick,
        timestamp: world?.clock ? { day: world.clock.day, hour: world.clock.hour, minute: world.clock.minute } : null
      });
    }
  }

  return { clan, members };
}

/**
 * Rebinds simulation effect methods on an entity deserialized from a save file
 */
export function rebindEntityMethods(ent) {
  if (!ent || !ent.properties) return ent;
  const p = ent.properties;

  if (p.life) {
    const dummy = createLifeProp(p.life.max || 100, p.life.energy || 100);
    for (const [k, fn] of Object.entries(dummy)) {
      if (typeof fn === "function") p.life[k] = fn;
    }
  }
  if (p.lifespan) {
    if (p.resourceType === "feces" || p.edible?.foodType === "feces") {
      if (!p.lifespan.maxAge || p.lifespan.maxAge > 15.0) {
        p.lifespan.maxAge = p.germination ? 15.0 : 6.0;
      }
    }
    const dummy = createLifespanProp(p.lifespan.maxAge || 120.0);
    for (const [k, fn] of Object.entries(dummy)) {
      if (typeof fn === "function") p.lifespan[k] = fn;
    }
  }
  if (p.stomach) {
    const dummy = createStomachProp(p.stomach.capacity || 4, p.stomach.preferences || {});
    for (const [k, fn] of Object.entries(dummy)) {
      if (typeof fn === "function") p.stomach[k] = fn;
    }
  }
  if (p.brain) {
    const dummy = createBrainProp(p.brain.iq || 25, p.brain.personality || {});
    for (const [k, fn] of Object.entries(dummy)) {
      if (typeof fn === "function") p.brain[k] = fn;
    }
    if (!p.brain.objectMemory) p.brain.objectMemory = [];
    if (!p.brain.memories) p.brain.memories = [];
    if (!p.brain.affinities) p.brain.affinities = {};
    if (!p.brain.geoMemory) p.brain.geoMemory = {};
  }
  if (p.locomotion) {
    const dummy = createLocomotionProp();
    for (const [k, fn] of Object.entries(dummy)) {
      if (typeof fn === "function") p.locomotion[k] = fn;
    }
  }
  if (p.combat) {
    const dummy = createCombatProp();
    for (const [k, fn] of Object.entries(dummy)) {
      if (typeof fn === "function") p.combat[k] = fn;
    }
  }
  if (p.communication) {
    const dummy = createCommunicationProp();
    for (const [k, fn] of Object.entries(dummy)) {
      if (typeof fn === "function") p.communication[k] = fn;
    }
  }
  if (p.body_regen) {
    const dummy = createBodyRegenerationProp();
    for (const [k, fn] of Object.entries(dummy)) {
      if (typeof fn === "function") p.body_regen[k] = fn;
    }
  }
  if (p.tree) {
    const dummy = createOakTree(0, 0).properties.tree;
    if (dummy) {
      for (const [k, fn] of Object.entries(dummy)) {
        if (typeof fn === "function") p.tree[k] = fn;
      }
    }
  }
  if (p.group_member) {
    const dummy = createGroupMemberProp();
    for (const [k, fn] of Object.entries(dummy)) {
      if (typeof fn === "function") p.group_member[k] = fn;
    }
  }
  if (p.door) {
    const dummy = createDoorEntity(0, 0).properties.door;
    for (const [k, fn] of Object.entries(dummy)) {
      if (typeof fn === "function") p.door[k] = fn;
    }
  }
  if (p.door) {
    p.door.open = function() {
      this.isOpen = true;
      this.autoCloseTimer = 10.0;
    };
    p.door.close = function() {
      this.isOpen = false;
      this.autoCloseTimer = 0;
    };
  }

  // Rebind amputated limb stump bleed effects
  for (const [k, v] of Object.entries(p)) {
    if (k.startsWith("amputated_") && v && !v.effect) {
      v.effect = function(e, dt) {
        if (e.properties.life) {
          e.properties.life.energy = Math.max(0, e.properties.life.energy - dt * (this.bleedRate || 18.0));
        }
        if (e.properties.brain) {
          e.properties.brain.condition = Math.max(0, e.properties.brain.condition - dt * ((this.bleedRate || 18.0) * 0.2));
        }
      };
    }
  }

  return ent;
}
