export type PlantTypeId =
  | 'carrot'
  | 'tomato'
  | 'lettuce'
  | 'pumpkin'
  | 'sunflower'
  | 'lavender';

export interface PlantType {
  id: PlantTypeId;
  name: string;
  kind: 'vegetable' | 'flower' | 'fruit';
  description: string;
  /** Milliseconds from seed to mature. Short on purpose: the full care loop
   * should be visible within a few relaxed minutes. */
  growthMs: number;
  /** Water points lost per minute. */
  waterDrainPerMin: number;
  /** Water restored by one watering. */
  waterPerWatering: number;
  /** Items added to the basket on harvest. */
  harvestYield: number;
  /** Accent color for UI chips and the harvestable part of the plant. */
  color: string;
  foliageColor: string;
}

export const PLANT_TYPES: Record<PlantTypeId, PlantType> = {
  lettuce: {
    id: 'lettuce',
    name: 'Lettuce',
    kind: 'vegetable',
    description: 'Quick and easy. A crisp head of lettuce, ready in about 90 seconds.',
    growthMs: 90_000,
    waterDrainPerMin: 10,
    waterPerWatering: 45,
    harvestYield: 1,
    color: '#8fd14f',
    foliageColor: '#7cc24a',
  },
  carrot: {
    id: 'carrot',
    name: 'Carrot',
    kind: 'vegetable',
    description: 'Sweet roots with feathery tops. Ready in about 2 minutes.',
    growthMs: 120_000,
    waterDrainPerMin: 8,
    waterPerWatering: 45,
    harvestYield: 2,
    color: '#f08c28',
    foliageColor: '#4f9e3f',
  },
  tomato: {
    id: 'tomato',
    name: 'Tomato',
    kind: 'fruit',
    description: 'A leafy bush heavy with fruit. Ready in about 3 minutes.',
    growthMs: 180_000,
    waterDrainPerMin: 9,
    waterPerWatering: 45,
    harvestYield: 3,
    color: '#e0503c',
    foliageColor: '#3f8f3a',
  },
  lavender: {
    id: 'lavender',
    name: 'Lavender',
    kind: 'flower',
    description: 'Calming purple spikes. Drought-tolerant. Ready in about 3.5 minutes.',
    growthMs: 210_000,
    waterDrainPerMin: 5,
    waterPerWatering: 45,
    harvestYield: 2,
    color: '#9b7ede',
    foliageColor: '#6b8e5a',
  },
  sunflower: {
    id: 'sunflower',
    name: 'Sunflower',
    kind: 'flower',
    description: 'A tall, cheerful face that tracks the light. Ready in about 4 minutes.',
    growthMs: 240_000,
    waterDrainPerMin: 8,
    waterPerWatering: 45,
    harvestYield: 2,
    color: '#f5c542',
    foliageColor: '#4a8f3c',
  },
  pumpkin: {
    id: 'pumpkin',
    name: 'Pumpkin',
    kind: 'vegetable',
    description: 'Slow and steady, worth the wait. Ready in about 5 minutes.',
    growthMs: 300_000,
    waterDrainPerMin: 6,
    waterPerWatering: 45,
    harvestYield: 1,
    color: '#e8821e',
    foliageColor: '#557f35',
  },
};

export const PLANT_TYPE_LIST: PlantType[] = Object.values(PLANT_TYPES);

export function isPlantTypeId(value: unknown): value is PlantTypeId {
  return typeof value === 'string' && value in PLANT_TYPES;
}
