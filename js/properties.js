// =============================================================================
// Brutopolis - Properties & Entity Prefabs / Behaviors
// =============================================================================

import { createEntity } from "./engine.js";

// ---------------------------------------------------------------------------
// 1. Reusable Property Factories
// ---------------------------------------------------------------------------

export function createHealthProp(current = 100, max = 100) {
  return {
    current,
    max
  };
}

export function createStomachProp(current = 100, max = 100, decaySpeed = 1.5) {
  return {
    current,
    max,
    effect(ent, dt) {
      this.current = Math.max(0, this.current - dt * decaySpeed);
    }
  };
}

export function createRandomWalkProp(rate = 0.8) {
  return {
    rate,
    effect(ent, dt, parent, root) {
      const worldRoot = root || ent.getRoot();
      const dx = Math.floor(Math.random() * 3) - 1;
      const dy = Math.floor(Math.random() * 3) - 1;
      if (dx === 0 && dy === 0) return;
      if (worldRoot.isWalkable && worldRoot.isWalkable(ent.x + dx, ent.y + dy)) {
        ent.x += dx;
        ent.y += dy;
      }
    }
  };
}

export function createPhotosynthesisProp(lightThreshold = 0.4, healRate = 4) {
  return {
    effect(ent, dt, parent, root) {
      const worldRoot = root || ent.getRoot();
      const light = worldRoot?.properties?.light || 1.0;
      if (light > lightThreshold) {
        if (ent.properties.health && ent.properties.health.current < ent.properties.health.max) {
          ent.properties.health.current = Math.min(
            ent.properties.health.max,
            ent.properties.health.current + dt * healRate
          );
        }
      }
    }
  };
}

export function createRegenerationProp(rate = 1.0, healAmount = 5) {
  return {
    rate,
    effect(ent) {
      if (ent.properties.health && ent.properties.health.current < ent.properties.health.max) {
        ent.properties.health.current = Math.min(
          ent.properties.health.max,
          ent.properties.health.current + healAmount
        );
      }
    }
  };
}

export function createBurnProp(rate = 0.5, damage = 6) {
  return {
    rate,
    effect(ent) {
      if (ent.properties.health) {
        ent.properties.health.current = Math.max(0, ent.properties.health.current - damage);
      }
    }
  };
}

export function createParasiteDrainProp(rate = 1.5, stomachDrain = 8, healthDrain = 4) {
  return {
    rate,
    effect(parasite, dt, host, root) {
      // 'host' is the parent entity containing this parasite
      if (host && host.properties.stomach) {
        host.properties.stomach.current = Math.max(0, host.properties.stomach.current - stomachDrain);
      }
      if (host && host.properties.health) {
        host.properties.health.current = Math.max(0, host.properties.health.current - healthDrain);
      }
    }
  };
}

// ---------------------------------------------------------------------------
// 2. Child Entity Factories (Internal Organisms / Sub-entities)
// ---------------------------------------------------------------------------

export function createParasiteChild(rate = 1.5) {
  return createEntity({
    name: "Tênia Parasitária (Filha)",
    parasite_drain: createParasiteDrainProp(rate)
  });
}

// ---------------------------------------------------------------------------
// 3. Entity Prefabs / Archetypes
// ---------------------------------------------------------------------------

export function createTree(x, y) {
  return createEntity(
    {
      name: "Carvalho Ancestral",
      render: { skin: "Feature_Tree_Full.png", color: 0xff78dc5a, backcolor: 0xff284619 },
      health: createHealthProp(200, 200),
      photosynthesis: createPhotosynthesisProp()
    },
    x,
    y
  );
}

export function createKnight(x, y) {
  return createEntity(
    {
      name: "Cavaleiro Imperial",
      render: { skin: "Human_Knight_M.png", color: 0xffdcdce6, backcolor: 0xff1e283c },
      health: createHealthProp(120, 120),
      stomach: createStomachProp(100, 100),
      random_walk: createRandomWalkProp(0.7)
    },
    x,
    y
  );
}

export function createParasiteHost(x, y) {
  const host = createEntity(
    {
      name: "Gato Silvestre (Infectado)",
      render: { skin: "Creature_Cat_U.png", color: 0xfff0b464, backcolor: 0xff321e0f },
      health: createHealthProp(80, 80),
      stomach: createStomachProp(100, 100),
      random_walk: createRandomWalkProp(0.6)
    },
    x,
    y
  );

  // Attach child parasite inside host
  host.addChild(createParasiteChild(1.5));
  return host;
}

export function createDragon(x, y) {
  return createEntity(
    {
      name: "Dragão Rubro",
      render: { skin: "Creature_Dragon_U.png", color: 0xffff4646, backcolor: 0xff3c0f0f },
      health: createHealthProp(300, 300),
      stomach: createStomachProp(100, 100),
      random_walk: createRandomWalkProp(0.5),
      regeneration: createRegenerationProp(1.0, 5)
    },
    x,
    y
  );
}

export function createFruit(x, y) {
  return createEntity(
    {
      name: "Fruto Silvestre",
      render: { skin: "Item_Fruit.png", color: 0xfffaa03c, backcolor: 0xff46230a },
      edible: { restoreAmount: 30 }
    },
    x,
    y
  );
}
