import { PLANT_TYPES, type PlantTypeId } from './plants';
import { BOT_ACTION_MS, waitForBot, waitForBotArrival } from './agentChoreography';
import type { ActionResult, Plant } from './types';
import {
  type AgentActionKind,
  type AgentJob,
  type GardenPlanPreview,
  useAgentStore,
} from '../state/agentStore';
import { useGardenStore } from '../state/gardenStore';

export interface AgentJobAction {
  kind: AgentActionKind;
  plotIndex: number;
  label: string;
  plantId?: string;
  plantType?: PlantTypeId;
}

interface QueuedJob {
  id: string;
  actions: AgentJobAction[];
  aftercareMs: number;
}

const queue: QueuedJob[] = [];
let draining = false;
let sequence = 0;
let actionTail: Promise<void> = Promise.resolve();

/** A deliberately short, observable "day" for the accelerated judging demo. */
export const ACCELERATED_DAY_MS = 60_000;
const CARE_CHECK_MS = 500;
const CARE_WATER_THRESHOLD = 65;
/** A closed loop of adjacent plots so repeated care never teleports across the garden. */
const CARE_ROUTE = [0, 1, 2, 3, 7, 11, 15, 14, 13, 12, 8, 9, 10, 6, 5, 4];

function makeId(prefix: string): string {
  sequence++;
  return `${prefix}-${Date.now().toString(36)}-${sequence.toString(36)}`;
}

function executeAction(action: AgentJobAction): ActionResult {
  const garden = useGardenStore.getState();
  switch (action.kind) {
    case 'plant':
      return garden.plantSeed(action.plantType!, action.plotIndex, 'agent');
    case 'water':
      return garden.waterPlant(action.plantId!, 'agent');
    case 'harvest':
      return garden.harvestPlant(action.plantId!, 'agent');
    case 'remove':
      return garden.removePlant(action.plantId!, 'agent');
  }
}

async function performAgentActionNow(action: AgentJobAction): Promise<ActionResult> {
  useAgentStore.getState().setBotIntent({
    label: action.label,
    phase: 'queued',
    kind: action.kind,
    plotIndex: action.plotIndex,
  });
  const eventId = useGardenStore.getState().signalAgentAction(action.kind, action.plotIndex);
  await waitForBotArrival(eventId);
  const outcome = executeAction(action);
  await waitForBot(BOT_ACTION_MS);
  useAgentStore.getState().setBotIntent(null);
  return outcome;
}

/** Keep all MCP actions in one physical robot lane, including one-off tool calls. */
export function performAgentAction(action: AgentJobAction): Promise<ActionResult> {
  const run = actionTail.then(() => performAgentActionNow(action));
  actionTail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function drainQueue(): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    while (queue.length > 0) {
      const queued = queue.shift()!;
      const agent = useAgentStore.getState();
      agent.startJob(queued.id);
      try {
        for (const action of queued.actions) {
          useAgentStore.getState().setJobAction(queued.id, action.label, action.plotIndex);
          const outcome = await performAgentAction(action);
          if (!outcome.ok) throw new Error(outcome.message);
          useAgentStore.getState().completeJobAction(queued.id, outcome.message);
          if (queued.aftercareMs > 0 && action.kind === 'plant') {
            const planted = Object.values(useGardenStore.getState().plants).find(
              (plant) => plant.plotIndex === action.plotIndex,
            );
            if (!planted) throw new Error(`The new plant in plot ${action.plotIndex} disappeared.`);
            const waterLabel = `Watering newly planted ${PLANT_TYPES[planted.type].name} in plot ${planted.plotIndex}`;
            useAgentStore.getState().setJobAction(queued.id, waterLabel, planted.plotIndex);
            const waterOutcome = await performAgentAction({
              kind: 'water',
              plotIndex: planted.plotIndex,
              plantId: planted.id,
              label: waterLabel,
            });
            if (!waterOutcome.ok) throw new Error(waterOutcome.message);
            useAgentStore.getState().completeJobAction(queued.id, waterOutcome.message);
          }
        }
        if (queued.aftercareMs > 0) {
          await maintainGarden(queued.id, queued.aftercareMs);
        }
        useAgentStore.getState().completeJob(queued.id);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        useAgentStore.getState().setBotIntent(null);
        useAgentStore.getState().failJob(queued.id, message);
      }
    }
  } finally {
    draining = false;
  }
}

async function maintainGarden(jobId: string, durationMs: number): Promise<void> {
  const endsAt = Date.now() + durationMs;
  let routeCursor = 0;
  useAgentStore.getState().setJobAction(
    jobId,
    'Keeping every plant healthy through one accelerated day',
    null,
  );

  while (true) {
    const garden = useGardenStore.getState();
    garden.tickAll();
    const plants = Object.values(useGardenStore.getState().plants);
    const withered = plants.find((plant) => plant.stage === 'withered');
    if (withered) {
      throw new Error(
        `${PLANT_TYPES[withered.type].name} in plot ${withered.plotIndex} withered during aftercare.`,
      );
    }

    if (Date.now() >= endsAt) break;
    const plantsByPlot = new Map(plants.map((plant) => [plant.plotIndex, plant]));
    let plantToWater: Plant | undefined;
    for (let offset = 0; offset < CARE_ROUTE.length; offset++) {
      const routeIndex = (routeCursor + offset) % CARE_ROUTE.length;
      const plant = plantsByPlot.get(CARE_ROUTE[routeIndex]);
      if (plant && plant.water < CARE_WATER_THRESHOLD) {
        plantToWater = plant;
        routeCursor = (routeIndex + 1) % CARE_ROUTE.length;
        break;
      }
    }

    if (!plantToWater) {
      await waitForBot(Math.min(CARE_CHECK_MS, Math.max(0, endsAt - Date.now())));
      continue;
    }

    const label = `Watering ${PLANT_TYPES[plantToWater.type].name} in plot ${plantToWater.plotIndex}`;
    useAgentStore.getState().setJobAction(jobId, label, plantToWater.plotIndex);
    const outcome = await performAgentAction({
      kind: 'water',
      plotIndex: plantToWater.plotIndex,
      plantId: plantToWater.id,
      label,
    });
    if (!outcome.ok && useGardenStore.getState().plants[plantToWater.id]) {
      throw new Error(outcome.message);
    }
  }

  for (const plotIndex of CARE_ROUTE) {
    const garden = useGardenStore.getState();
    garden.tickAll();
    const plant = Object.values(useGardenStore.getState().plants).find(
      (candidate) => candidate.plotIndex === plotIndex,
    );
    if (!plant) continue;
    if (plant.stage === 'withered') {
      throw new Error(
        `${PLANT_TYPES[plant.type].name} in plot ${plant.plotIndex} withered during aftercare.`,
      );
    }
    const label = `Final watering for ${PLANT_TYPES[plant.type].name} in plot ${plant.plotIndex}`;
    useAgentStore.getState().setJobAction(jobId, label, plant.plotIndex);
    const outcome = await performAgentAction({
      kind: 'water',
      plotIndex: plant.plotIndex,
      plantId: plant.id,
      label,
    });
    if (!outcome.ok && useGardenStore.getState().plants[plant.id]) {
      throw new Error(outcome.message);
    }
  }

  useAgentStore.getState().setJobAction(
    jobId,
    'Finished visible care through one accelerated day',
    null,
  );
  useAgentStore.getState().completeJobAction(
    jobId,
    'The robot kept the garden healthy through one accelerated day.',
  );
}

export function enqueueAgentJob(
  label: string,
  actions: AgentJobAction[],
  aftercareMs = 0,
): AgentJob {
  const initialCareActions = aftercareMs > 0
    ? actions.filter((action) => action.kind === 'plant').length
    : 0;
  const job: AgentJob = {
    id: makeId('job'),
    label,
    status: 'queued',
    totalActions: actions.length + initialCareActions + (aftercareMs > 0 ? 1 : 0),
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
  queue.push({ id: job.id, actions, aftercareMs });
  void drainQueue();
  return job;
}

export function createGardenPlanPreview(
  name: string,
  rationale: string,
  assignments: GardenPlanPreview['assignments'],
  aftercare: GardenPlanPreview['aftercare'] = 'none',
): GardenPlanPreview {
  const preview: GardenPlanPreview = {
    id: makeId('plan'),
    name,
    rationale,
    assignments,
    aftercare,
    createdAt: Date.now(),
  };
  useAgentStore.getState().setPlanPreview(preview);
  return preview;
}

export function startGardenPlan(planId: string): AgentJob | null {
  const agent = useAgentStore.getState();
  const plan = agent.planPreview;
  if (!plan || plan.id !== planId) return null;

  const occupied = new Set(
    Object.values(useGardenStore.getState().plants).map((plant) => plant.plotIndex),
  );
  if (plan.assignments.some((assignment) => occupied.has(assignment.plotIndex))) return null;

  const routeOrder = new Map(CARE_ROUTE.map((plotIndex, index) => [plotIndex, index]));
  const assignments = [...plan.assignments].sort(
    (a, b) => routeOrder.get(a.plotIndex)! - routeOrder.get(b.plotIndex)!,
  );
  const actions = assignments.map((assignment) => ({
    kind: 'plant' as const,
    plotIndex: assignment.plotIndex,
    plantType: assignment.plantType,
    label: `Planting ${PLANT_TYPES[assignment.plantType].name} in plot ${assignment.plotIndex}`,
  }));
  if (actions.length === 0) return null;

  agent.clearPlanPreview(plan.id);
  const aftercareMs = plan.aftercare === 'one_accelerated_day' ? ACCELERATED_DAY_MS : 0;
  return enqueueAgentJob(
    aftercareMs > 0 ? `Planting and tending “${plan.name}”` : `Planting “${plan.name}”`,
    actions,
    aftercareMs,
  );
}

export function agentJobSnapshot(jobId?: string): AgentJob | null {
  const state = useAgentStore.getState();
  const id = jobId ?? state.activeJobId ?? state.jobOrder[0];
  return id ? state.jobs[id] ?? null : null;
}
