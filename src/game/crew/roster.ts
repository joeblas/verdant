import { allRobots, useCrewStore } from '../../state/crewStore';
import { dutyPlot, isBusy, type HelperDuty } from './duty';
import {
  HELPER_SLOTS,
  wantedHelpers,
  type CrewSize,
  type HelperCount,
  type HelperId,
  type RobotId,
} from './ids';

export type RobotStatus = HelperDuty['phase'] | 'tending' | 'goingHome';

export interface RobotSummary {
  readonly id: RobotId;
  readonly role: 'lead' | 'helper';
  readonly status: RobotStatus;
  readonly plotIndex: number | null;
  readonly doing: string | null;
}

export interface CrewSnapshot {
  readonly helpers: HelperCount;
  readonly desiredHelpers: HelperCount;
  readonly size: CrewSize;
  readonly converged: boolean;
  readonly maxHelpers: 3;
  readonly robots: readonly RobotSummary[];
}

let transitionToken = 0;

function nextToken(): number {
  transitionToken += 1;
  return transitionToken;
}

function helperOf(id: HelperId) {
  return useCrewStore.getState().helpers[id] ?? { id, duty: { phase: 'docked' } as const };
}

function standingCount(desiredHelpers: HelperCount, robots: readonly RobotSummary[]): CrewSize {
  const out = 1 + robots.filter((robot) => robot.role === 'helper' && robot.status !== 'docked').length;
  if (out === 1 || out === 2 || out === 3 || out === 4) return out;
  return (1 + desiredHelpers) as CrewSize;
}

function isConverged(desired: HelperCount): boolean {
  const wanted = new Set(wantedHelpers(desired));
  for (const id of HELPER_SLOTS) {
    const phase = helperOf(id).duty.phase;
    if (wanted.has(id)) {
      if (phase === 'docked' || phase === 'emerging' || phase === 'merging') return false;
    } else if (phase !== 'docked') {
      return false;
    }
  }
  return true;
}

function summarize(): RobotSummary[] {
  return allRobots().map((robot) => {
    const duty = robot.duty;
    const task = duty.phase === 'travelling' || duty.phase === 'working' ? duty.task : null;
    return {
      id: robot.id,
      role: robot.id === 'lead' ? 'lead' : 'helper',
      status: duty.phase,
      plotIndex: dutyPlot(duty),
      doing: task?.label ?? null,
    };
  });
}

export function crewSnapshot(): CrewSnapshot {
  const desiredHelpers = useCrewStore.getState().desiredHelpers;
  const robots = summarize();
  const standingHelpers = robots.filter(
    (robot) => robot.role === 'helper' && robot.status !== 'docked',
  ).length;
  const helpers = (
    standingHelpers === 0 || standingHelpers === 1 || standingHelpers === 2 || standingHelpers === 3
      ? standingHelpers
      : desiredHelpers
  ) as HelperCount;
  return {
    helpers,
    desiredHelpers,
    size: standingCount(desiredHelpers, robots),
    converged: isConverged(desiredHelpers),
    maxHelpers: 3,
    robots,
  };
}

function sameStanding(desired: HelperCount): boolean {
  if (useCrewStore.getState().desiredHelpers !== desired) return false;
  return isConverged(desired);
}

export function setCrew(helpers: HelperCount): CrewSnapshot {
  if (sameStanding(helpers)) return crewSnapshot();

  const store = useCrewStore.getState();
  store.setDesiredHelpers(helpers);
  const wanted = new Set(wantedHelpers(helpers));

  for (const id of HELPER_SLOTS) {
    const helper = helperOf(id);
    const phase = helper.duty.phase;
    if (wanted.has(id)) {
      if (phase === 'docked' || phase === 'merging') {
        store.setHelperDuty(id, { phase: 'emerging', startedAt: Date.now(), token: nextToken() });
      }
    } else if (phase !== 'docked' && !isBusy(helper.duty) && phase !== 'merging') {
      store.setHelperDuty(id, { phase: 'merging', startedAt: Date.now(), token: nextToken() });
    }
  }

  return crewSnapshot();
}

export function completeEmerge(id: HelperId, token: number): void {
  const helper = helperOf(id);
  if (helper.duty.phase !== 'emerging' || helper.duty.token !== token) return;
  useCrewStore.getState().setHelperDuty(id, { phase: 'ready' });
}

export function completeMerge(id: HelperId, token: number): void {
  const helper = helperOf(id);
  if (helper.duty.phase !== 'merging' || helper.duty.token !== token) return;
  useCrewStore.getState().setHelperDuty(id, { phase: 'docked' });
}

export function resetRoster(): void {
  transitionToken = 0;
}

export function helperWanted(id: HelperId, desired = useCrewStore.getState().desiredHelpers): boolean {
  return wantedHelpers(desired).includes(id);
}

export function beginMerge(id: HelperId): void {
  const helper = helperOf(id);
  if (helper.duty.phase === 'docked' || helper.duty.phase === 'merging' || isBusy(helper.duty)) return;
  useCrewStore.getState().setHelperDuty(id, {
    phase: 'merging',
    startedAt: Date.now(),
    token: nextToken(),
  });
}

export function completeGoingHome(): void {
  if (useCrewStore.getState().lead.duty.phase !== 'goingHome') return;
  useCrewStore.getState().setLeadDuty({ phase: 'tending' });
}

export function requestLeadInspection(): void {
  const lead = useCrewStore.getState().lead;
  if (isBusy(lead.duty)) return;
  useCrewStore.getState().setLeadDuty({ phase: 'goingHome' });
}
