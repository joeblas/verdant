import { describe, expect, it } from 'vitest';
import type { Plant } from './types';
import { advancePlant } from './tick';

const BASE_TIME = 1_000_000;

function lettuce(): Plant {
  return {
    id: 'plant-test',
    type: 'lettuce',
    plotIndex: 0,
    growth: 0,
    health: 100,
    water: 60,
    stage: 'seed',
    readyToHarvest: false,
    plantedAt: BASE_TIME,
    lastTickAt: BASE_TIME,
  };
}

describe('advancePlant', () => {
  it('accelerates the complete simulation in demo mode', () => {
    const normal = advancePlant(lettuce(), BASE_TIME + 1_000, 1);
    const demo = advancePlant(lettuce(), BASE_TIME + 1_000, 12);

    expect(demo.growth).toBeCloseTo(normal.growth * 12);
    expect(60 - demo.water).toBeCloseTo((60 - normal.water) * 12);
    expect(demo.lastTickAt).toBe(BASE_TIME + 1_000);
  });

  it('can balance accelerated growth against a physically tendable care rate', () => {
    const balanced = advancePlant(lettuce(), BASE_TIME + 1_000, 12, 6);
    const normal = advancePlant(lettuce(), BASE_TIME + 1_000, 1, 1);

    expect(balanced.growth).toBeCloseTo(normal.growth * 12);
    expect(60 - balanced.water).toBeCloseTo((60 - normal.water) * 6);
  });
});
