import { PLANT_TYPES, type PlantTypeId } from '../plants';
import { BOT_ACTION_MS, waitForBot, waitForBotArrival } from '../agentChoreography';
import { plotApproachPosition, type GardenPosition } from '../layout';
import type { ActionResult, Plant } from '../types';
import { type AgentJob, useAgentStore } from '../../state/agentStore';
import { allRobots, useCrewStore } from '../../state/crewStore';
import { useGardenStore } from '../../state/gardenStore';
import { readAnchor } from './anchors';
import { isAssignedDuty, type GardenAction, type HelperDuty, type LeadDuty } from './duty';
import { parsePlotIndex, wantedHelpers, type PlotIndex, type RobotId } from './ids';
import { isLeased, mintLease, releaseLease, resetLeases, type PlotLease } from './lease';
import { beginMerge, helperWanted } from './roster';

export type Aftercare = 'none' | 'one_accelerated_day';

export interface TaskRequest {
  readonly action: GardenAction;
  readonly label: string;
}

export interface CrewJobSpec {
  readonly label: string;
  readonly tasks: readonly TaskRequest[];
  readonly aftercare: Aftercare;
  readonly staffing: 'lead' | 'crew';
}

export interface AgentJobAction {
  kind: GardenAction['kind'];
  plotIndex: number;
  label: string;
  plantId?: string;
  plantType?: PlantTypeId;
}

interface TaskPool {
  readonly pending: TaskRequest[];
  readonly jobId: string;
  readonly staffing: 'lead' | 'crew';
  readonly countActions: boolean;
}

interface QueuedJob {
  id: string;
  spec: CrewJobSpec;
  lastResult: ActionResult | null;
}

export const ACCELERATED_DAY_MS = 60_000;
const CARE_CHECK_MS = 500;
const CARE_WATER_THRESHOLD = 65;

const queue: QueuedJob[] = [];
let draining = false;
let sequence = 0;
let leadLane: Promise<void> = Promise.resolve();

function runOnLead<T>(work: () => Promise<T>): Promise<T> {
  const run = leadLane.then(work, work);
  leadLane = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function makeId(prefix: string): string {
  sequence += 1;
  return `${prefix}-${Date.now().toString(36)}-${sequence.toString(36)}`;
}

export function toGardenAction(action: AgentJobAction): GardenAction | null {
  const plotIndex = parsePlotIndex(action.plotIndex);
  if (plotIndex === null) return null;
  switch (action.kind) {
    case 'plant':
      if (!action.plantType) return null;
      return { kind: 'plant', plotIndex, plantType: action.plantType };
    case 'water':
      if (!action.plantId) return null;
      return { kind: 'water', plotIndex, plantId: action.plantId };
    case 'harvest':
      if (!action.plantId) return null;
      return { kind: 'harvest', plotIndex, plantId: action.plantId };
    case 'remove':
      if (!action.plantId) return null;
      return { kind: 'remove', plotIndex, plantId: action.plantId };
  }
}

function executeAction(action: GardenAction): ActionResult {
  const garden = useGardenStore.getState();
  switch (action.kind) {
    case 'plant':
      return garden.plantSeed(action.plantType, action.plotIndex, 'agent');
    case 'water':
      return garden.waterPlant(action.plantId, 'agent');
    case 'harvest':
      return garden.harvestPlant(action.plantId, 'agent');
    case 'remove':
      return garden.removePlant(action.plantId, 'agent');
  }
}

function setRobotDuty(id: RobotId, duty: LeadDuty | HelperDuty): void {
  if (id === 'lead') {
    useCrewStore.getState().setLeadDuty(duty as LeadDuty);
    return;
  }
  useCrewStore.getState().setHelperDuty(id, duty as HelperDuty);
}

function settleRobot(id: RobotId): void {
  if (id === 'lead') {
    useCrewStore.getState().setLeadDuty({ phase: 'tending' });
    return;
  }
  if (helperWanted(id)) {
    useCrewStore.getState().setHelperDuty(id, { phase: 'ready' });
    return;
  }
  beginMerge(id);
}

function workers(staffing: 'lead' | 'crew'): RobotId[] {
  if (staffing === 'lead') return ['lead'];
  return ['lead', ...wantedHelpers(useCrewStore.getState().desiredHelpers)];
}

function plotDistance(from: GardenPosition, plotIndex: PlotIndex): number {
  const to = plotApproachPosition(plotIndex);
  const dx = from[0] - to[0];
  const dz = from[2] - to[2];
  return dx * dx + dz * dz;
}

function claimNext(id: RobotId, pool: TaskPool): { task: TaskRequest; lease: PlotLease } | null {
  if (pool.staffing === 'lead' && id !== 'lead') return null;
  if (id !== 'lead' && !helperWanted(id)) return null;

  const origin = readAnchor(id);
  let bestAt = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let i = 0; i < pool.pending.length; i++) {
    const candidate = pool.pending[i];
    if (isLeased(candidate.action.plotIndex)) continue;
    const distance = plotDistance(origin, candidate.action.plotIndex);
    if (distance < bestDistance) {
      bestAt = i;
      bestDistance = distance;
    }
  }

  if (bestAt === -1) return null;
  const task = pool.pending[bestAt];
  const lease = mintLease(task.action.plotIndex, id);
  if (!lease) return claimNext(id, pool);
  pool.pending.splice(bestAt, 1);
  return { task, lease };
}

async function runTask(
  id: RobotId,
  jobId: string | null,
  claimed: { task: TaskRequest; lease: PlotLease },
  countAction: boolean,
): Promise<ActionResult> {
  const { task, lease } = claimed;
  const eventId = useGardenStore.getState().signalAgentAction(task.action.kind, task.action.plotIndex);
  const active = { lease, action: task.action, eventId, label: task.label, jobId };
  try {
    setRobotDuty(id, { phase: 'travelling', task: active });
    if (jobId) useAgentStore.getState().setJobAction(jobId, task.label, task.action.plotIndex);
    await waitForBotArrival(eventId);
    setRobotDuty(id, { phase: 'working', task: active });
    const outcome = executeAction(task.action);
    await waitForBot(BOT_ACTION_MS);
    if (jobId && countAction) useAgentStore.getState().completeJobAction(jobId, outcome.message);
    return outcome;
  } finally {
    releaseLease(lease);
    settleRobot(id);
  }
}

async function runLane(id: RobotId, pool: TaskPool): Promise<ActionResult[]> {
  const results: ActionResult[] = [];
  while (true) {
    const step = async (): Promise<ActionResult | null> => {
      const claimed = claimNext(id, pool);
      if (!claimed) return null;
      return runTask(id, pool.jobId, claimed, pool.countActions);
    };
    const outcome = id === 'lead' ? await runOnLead(step) : await step();
    if (!outcome) break;
    results.push(outcome);
    if (!outcome.ok) throw new Error(outcome.message);
  }
  return results;
}

async function runPool(jobId: string, spec: Pick<CrewJobSpec, 'staffing'>, tasks: TaskRequest[], countActions: boolean): Promise<ActionResult[]> {
  const pool: TaskPool = {
    pending: [...tasks],
    jobId,
    staffing: spec.staffing,
    countActions,
  };
  const lanes = workers(spec.staffing).map((id) => runLane(id, pool));
  const nested = await Promise.all(lanes);
  return nested.flat();
}

function waterTask(plant: Plant, labelPrefix: string): TaskRequest | null {
  const plotIndex = parsePlotIndex(plant.plotIndex);
  if (plotIndex === null) return null;
  return {
    action: { kind: 'water', plotIndex, plantId: plant.id },
    label: `${labelPrefix} ${PLANT_TYPES[plant.type].name} in plot ${plant.plotIndex}`,
  };
}

function thirstyCareTasks(): TaskRequest[] {
  return Object.values(useGardenStore.getState().plants)
    .filter((plant) => plant.stage !== 'withered' && plant.water < CARE_WATER_THRESHOLD)
    .flatMap((plant) => {
      const task = waterTask(plant, 'Watering');
      return task ? [task] : [];
    });
}

function allLivingWaterTasks(): TaskRequest[] {
  return Object.values(useGardenStore.getState().plants)
    .filter((plant) => plant.stage !== 'withered')
    .flatMap((plant) => {
      const task = waterTask(plant, 'Final watering for');
      return task ? [task] : [];
    });
}

function throwIfWithered(): void {
  const withered = Object.values(useGardenStore.getState().plants).find((plant) => plant.stage === 'withered');
  if (!withered) return;
  throw new Error(
    `${PLANT_TYPES[withered.type].name} in plot ${withered.plotIndex} withered during aftercare.`,
  );
}

async function careSweep(jobId: string, durationMs: number): Promise<void> {
  const endsAt = Date.now() + durationMs;
  useAgentStore.getState().setJobAction(
    jobId,
    'Keeping every plant healthy through one accelerated day',
    null,
  );

  while (true) {
    useGardenStore.getState().tickAll();
    throwIfWithered();
    if (Date.now() >= endsAt) break;

    const thirsty = thirstyCareTasks();
    if (thirsty.length === 0) {
      await waitForBot(Math.min(CARE_CHECK_MS, Math.max(0, endsAt - Date.now())));
      continue;
    }
    await runPool(jobId, { staffing: 'crew' }, thirsty, false);
  }

  useGardenStore.getState().tickAll();
  throwIfWithered();
  const closing = allLivingWaterTasks();
  if (closing.length > 0) await runPool(jobId, { staffing: 'crew' }, closing, false);

  useAgentStore.getState().setJobAction(jobId, 'Finished visible care through one accelerated day', null);
  useAgentStore.getState().completeJobAction(
    jobId,
    'The robot kept the garden healthy through one accelerated day.',
  );
}

function plantWaterFollowups(planted: Plant[]): TaskRequest[] {
  return planted.flatMap((plant) => {
    const task = waterTask(plant, 'Watering newly planted');
    return task ? [task] : [];
  });
}

async function runQueuedJob(queued: QueuedJob): Promise<void> {
  const agent = useAgentStore.getState();
  agent.startJob(queued.id);
  try {
    const results = await runPool(queued.id, queued.spec, [...queued.spec.tasks], true);
    queued.lastResult = results[results.length - 1] ?? { ok: true, message: queued.spec.label };

    if (queued.spec.aftercare === 'one_accelerated_day') {
      const plantedPlots = queued.spec.tasks
        .filter((task) => task.action.kind === 'plant')
        .map((task) => task.action.plotIndex);
      const planted = Object.values(useGardenStore.getState().plants).filter((plant) =>
        plantedPlots.some((plotIndex) => plotIndex === plant.plotIndex),
      );
      if (planted.length > 0) {
        await runPool(queued.id, queued.spec, plantWaterFollowups(planted), true);
      }
      await careSweep(queued.id, ACCELERATED_DAY_MS);
    }

    useAgentStore.getState().completeJob(queued.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    useAgentStore.getState().failJob(queued.id, message);
  }
}

async function drainQueue(): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    while (queue.length > 0) {
      const queued = queue.shift();
      if (!queued) break;
      await runQueuedJob(queued);
    }
  } finally {
    draining = false;
  }
}

export function enqueueCrewJob(spec: CrewJobSpec): AgentJob {
  const initialCareActions =
    spec.aftercare === 'one_accelerated_day'
      ? spec.tasks.filter((task) => task.action.kind === 'plant').length
      : 0;
  const job: AgentJob = {
    id: makeId('job'),
    label: spec.label,
    status: 'queued',
    totalActions: spec.tasks.length + initialCareActions + (spec.aftercare === 'one_accelerated_day' ? 1 : 0),
    completedActions: 0,
    currentAction: null,
    currentPlotIndex: null,
    results: [],
    error: null,
    createdAt: Date.now(),
    startedAt: null,
    finishedAt: null,
  };
  useAgentStore.getState().createJob(job);
  queue.push({ id: job.id, spec, lastResult: null });
  void drainQueue();
  return job;
}

export function performAgentAction(action: AgentJobAction): Promise<ActionResult> {
  const gardenAction = toGardenAction(action);
  if (!gardenAction) {
    return Promise.resolve({ ok: false, message: 'That action is missing a valid plot or plant.' });
  }
  return runOnLead(async () => {
    const lease = mintLease(gardenAction.plotIndex, 'lead');
    if (!lease) {
      return { ok: false, message: `Plot ${gardenAction.plotIndex} is already being tended.` };
    }
    return runTask('lead', null, { task: { action: gardenAction, label: action.label }, lease }, false);
  });
}

export function enqueueAgentJob(
  label: string,
  actions: AgentJobAction[],
  aftercareMs = 0,
): AgentJob {
  const tasks: TaskRequest[] = [];
  for (const action of actions) {
    const gardenAction = toGardenAction(action);
    if (!gardenAction) continue;
    tasks.push({ action: gardenAction, label: action.label });
  }
  return enqueueCrewJob({
    label,
    tasks,
    aftercare: aftercareMs > 0 ? 'one_accelerated_day' : 'none',
    staffing: 'crew',
  });
}

function mergedJobView(job: AgentJob): AgentJob {
  const assigned = allRobots()
    .map((robot) => robot.duty)
    .filter(isAssignedDuty)
    .filter((duty) => duty.task.jobId === job.id);
  if (assigned.length === 0) return job;
  return {
    ...job,
    currentAction: assigned.map((duty) => duty.task.label).join(' · '),
    currentPlotIndex: assigned.length === 1 ? assigned[0].task.action.plotIndex : null,
  };
}

export function agentJobSnapshot(jobId?: string): AgentJob | null {
  const state = useAgentStore.getState();
  const id = jobId ?? state.activeJobId ?? state.jobOrder[0];
  const job = id ? state.jobs[id] ?? null : null;
  return job ? mergedJobView(job) : null;
}

export function resetDispatch(): void {
  queue.length = 0;
  draining = false;
  sequence = 0;
  leadLane = Promise.resolve();
  resetLeases();
}
