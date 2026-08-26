import { PLANT_TYPES } from './plants';
import type { GrowthStage, Plant } from './types';

const THIRST_THRESHOLD = 15;
const OVERWATER_THRESHOLD = 95;
const THIRST_DAMAGE_PER_MIN = 8;
const OVERWATER_DAMAGE_PER_MIN = 3;
const REGEN_PER_MIN = 2;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function stageForGrowth(growth: number): GrowthStage {
  if (growth < 0.1) return 'seed';
  if (growth < 0.45) return 'sprout';
  if (growth < 1) return 'growing';
  return 'mature';
}

/**
 * Advances a plant using wall-clock elapsed time, so the garden keeps
 * growing while the tab is closed. Pure: returns a new plant object.
 */
export function advancePlant(plant: Plant, now: number, timeScale = 1): Plant {
  if (plant.stage === 'withered') {
    return plant.lastTickAt === now ? plant : { ...plant, lastTickAt: now };
  }

  const type = PLANT_TYPES[plant.type];
  const elapsedMs = Math.max(0, now - plant.lastTickAt) * timeScale;
  const elapsedMin = elapsedMs / 60_000;

  let { water, health, growth } = plant;

  water = clamp(water - type.waterDrainPerMin * elapsedMin, 0, 100);

  if (water <= THIRST_THRESHOLD) {
    health -= THIRST_DAMAGE_PER_MIN * elapsedMin;
  } else if (water >= OVERWATER_THRESHOLD) {
    health -= OVERWATER_DAMAGE_PER_MIN * elapsedMin;
  } else {
    health += REGEN_PER_MIN * elapsedMin;
  }
  health = clamp(health, 0, 100);

  if (health <= 0) {
    return {
      ...plant,
      water,
      health: 0,
      stage: 'withered',
      readyToHarvest: false,
      lastTickAt: now,
    };
  }

  if (growth < 1 && water > THIRST_THRESHOLD) {
    const rate = health < 30 ? 0.5 : 1;
    growth = clamp(growth + (elapsedMs / type.growthMs) * rate, 0, 1);
  }

  const stage = stageForGrowth(growth);
  return {
    ...plant,
    water,
    health,
    growth,
    stage,
    readyToHarvest: stage === 'mature',
    lastTickAt: now,
  };
}
