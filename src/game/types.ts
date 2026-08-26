import type { PlantTypeId } from './plants';

export type GrowthStage = 'seed' | 'sprout' | 'growing' | 'mature' | 'withered';

export type Actor = 'you' | 'agent';

export interface Plant {
  /** Unique id, e.g. "plant-m4x8q2-a9f1" */
  id: string;
  type: PlantTypeId;
  plotIndex: number;
  /** 0..1 — 1 means fully grown */
  growth: number;
  /** 0..100 — withers at 0 */
  health: number;
  /** 0..100 — decays over time */
  water: number;
  stage: GrowthStage;
  readyToHarvest: boolean;
  plantedAt: number;
  lastTickAt: number;
}

export interface ActionResult {
  ok: boolean;
  message: string;
}

export interface ActivityEntry {
  id: string;
  at: number;
  actor: Actor;
  message: string;
}

export interface GardenEvent {
  id: number;
  kind: 'plant' | 'water' | 'harvest';
  plotIndex: number;
  at: number;
}
