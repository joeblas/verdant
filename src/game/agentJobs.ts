import { PLANT_TYPES, type PlantTypeId } from './plants';
import { BOT_ACTION_MS, waitForBot, waitForBotArrival } from './agentChoreography';
import type { ActionResult } from './types';
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
const CARE_CHECK_MS = 1_000;

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
  useAgentStore.getState().setJobAction(
    jobId,
    'Keeping every plant healthy through one accelerated day',
    null,
  );

  while (Date.now() < endsAt) {
    const garden = useGardenStore.getState();
    garden.tickAll();
    const plants = Object.values(useGardenStore.getState().plants);
    const withered = plants.find((plant) => plant.stage === 'withered');
    if (withered) {
      throw new Error(`${PLANT_TYPES[withered.type].name} in plot ${withered.plotIndex} withered during aftercare.`);
    }
    if (plants.some((plant) => plant.water < 35)) {
      garden.waterAllThirsty('agent');
    }
    await waitForBot(Math.min(CARE_CHECK_MS, Math.max(0, endsAt - Date.now())));
  }

  const garden = useGardenStore.getState();
  garden.tickAll();
  const plants = Object.values(useGardenStore.getState().plants);
  const withered = plants.find((plant) => plant.stage === 'withered');
  if (withered) {
    throw new Error(`${PLANT_TYPES[withered.type].name} in plot ${withered.plotIndex} withered during aftercare.`);
  }
  for (const plant of plants) {
    if (plant.water < 45) garden.waterPlant(plant.id, 'agent');
  }
  useAgentStore.getState().completeJobAction(
    jobId,
    'Kept the garden healthy through one accelerated day.',
  );
}

export function enqueueAgentJob(
  label: string,
  actions: AgentJobAction[],
  aftercareMs = 0,
): AgentJob {
  const job: AgentJob = {
    id: makeId('job'),
    label,
    status: 'queued',
    totalActions: actions.length + (aftercareMs > 0 ? 1 : 0),
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

  const actions = plan.assignments.map((assignment) => ({
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
