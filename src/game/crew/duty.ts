import type { PlantTypeId } from '../plants';
import type { GardenEvent } from '../types';
import type { HelperId, LeadId, PlotIndex, RobotId } from './ids';
import type { PlotLease } from './lease';

export type { PlotLease };

export type GardenActionKind = Exclude<GardenEvent['kind'], 'inspect'>;

export type GardenAction =
  | { kind: 'plant'; plotIndex: PlotIndex; plantType: PlantTypeId }
  | { kind: 'water'; plotIndex: PlotIndex; plantId: string }
  | { kind: 'harvest'; plotIndex: PlotIndex; plantId: string }
  | { kind: 'remove'; plotIndex: PlotIndex; plantId: string };

export interface ActiveTask {
  readonly lease: PlotLease;
  readonly action: GardenAction;
  readonly eventId: number;
  readonly label: string;
  readonly jobId: string | null;
}

export type AssignedDuty =
  | { readonly phase: 'travelling'; readonly task: ActiveTask }
  | { readonly phase: 'working'; readonly task: ActiveTask };

export type LeadDuty =
  | { readonly phase: 'tending' }
  | AssignedDuty
  | { readonly phase: 'goingHome' };

export type HelperDuty =
  | { readonly phase: 'docked' }
  | { readonly phase: 'emerging'; readonly startedAt: number; readonly token: number }
  | { readonly phase: 'ready' }
  | AssignedDuty
  | { readonly phase: 'merging'; readonly startedAt: number; readonly token: number };

export interface Robot<Id extends RobotId, Duty> {
  readonly id: Id;
  readonly duty: Duty;
}

export type Lead = Robot<LeadId, LeadDuty>;
export type Helper = Robot<HelperId, HelperDuty>;

export function isBusy(duty: LeadDuty | HelperDuty): boolean {
  return duty.phase === 'travelling' || duty.phase === 'working';
}

export function dutyPlot(duty: LeadDuty | HelperDuty): PlotIndex | null {
  if (duty.phase === 'travelling' || duty.phase === 'working') return duty.task.action.plotIndex;
  return null;
}

export function dutyTask(duty: LeadDuty | HelperDuty): ActiveTask | null {
  if (duty.phase === 'travelling' || duty.phase === 'working') return duty.task;
  return null;
}

export function isAssignedDuty(duty: LeadDuty | HelperDuty): duty is AssignedDuty {
  return duty.phase === 'travelling' || duty.phase === 'working';
}
