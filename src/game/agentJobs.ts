import { PLANT_TYPES } from './plants';
import type { AgentJob, GardenPlanPreview } from '../state/agentStore';
import { useAgentStore } from '../state/agentStore';
import { useCrewStore } from '../state/crewStore';
import { useGardenStore } from '../state/gardenStore';
import {
  ACCELERATED_DAY_MS,
  enqueueAgentJob,
  enqueueCrewJob,
  performAgentAction,
  agentJobSnapshot,
  type Aftercare,
  type AgentJobAction,
} from './crew/dispatch';
import { parsePlotIndex, type HelperCount } from './crew/ids';
import { setCrew } from './crew/roster';

export {
  ACCELERATED_DAY_MS,
  agentJobSnapshot,
  enqueueAgentJob,
  enqueueCrewJob,
  performAgentAction,
};
export type { Aftercare, AgentJobAction };

const CARE_ROUTE = [0, 1, 2, 3, 7, 11, 15, 14, 13, 12, 8, 9, 10, 6, 5, 4];
let sequence = 0;

function makeId(prefix: string): string {
  sequence += 1;
  return `${prefix}-${Date.now().toString(36)}-${sequence.toString(36)}`;
}

function applyPlanHelpers(requested?: HelperCount): void {
  if (requested === undefined) return;
  const standing = useCrewStore.getState().desiredHelpers;
  if (requested > standing) setCrew(requested);
}

export function createGardenPlanPreview(
  name: string,
  rationale: string,
  assignments: GardenPlanPreview['assignments'],
  aftercare: GardenPlanPreview['aftercare'] = 'none',
  helpers?: HelperCount,
): GardenPlanPreview {
  const preview: GardenPlanPreview = {
    id: makeId('plan'),
    name,
    rationale,
    assignments,
    aftercare,
    helpers,
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
  const tasks = assignments.flatMap((assignment) => {
    const plotIndex = parsePlotIndex(assignment.plotIndex);
    if (plotIndex === null) return [];
    return [
      {
        action: {
          kind: 'plant' as const,
          plotIndex,
          plantType: assignment.plantType,
        },
        label: `Planting ${PLANT_TYPES[assignment.plantType].name} in plot ${assignment.plotIndex}`,
      },
    ];
  });
  if (tasks.length === 0) return null;

  applyPlanHelpers(plan.helpers);
  agent.clearPlanPreview(plan.id);
  return enqueueCrewJob({
    label:
      plan.aftercare === 'one_accelerated_day'
        ? `Planting and tending “${plan.name}”`
        : `Planting “${plan.name}”`,
    tasks,
    aftercare: plan.aftercare,
    staffing: 'crew',
  });
}
