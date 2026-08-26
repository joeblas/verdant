import { PLANT_TYPE_LIST, PLANT_TYPES, isPlantTypeId } from '../game/plants';
import {
  agentJobSnapshot,
  createGardenPlanPreview,
  enqueueAgentJob,
  performAgentAction,
  startGardenPlan,
} from '../game/agentJobs';
import type { Plant } from '../game/types';
import type { GardenPlanAssignment } from '../state/agentStore';
import {
  DEMO_CARE_TIME_SCALE,
  DEMO_TIME_SCALE,
  PLOT_COUNT,
  useGardenStore,
} from '../state/gardenStore';

interface TextContent {
  type: 'text';
  text: string;
}

export interface GardenToolResult {
  content: TextContent[];
}

export interface GardenTool {
  name: string;
  description: string;
  inputSchema: object;
  annotations?: { readOnlyHint?: boolean };
  execute: (input: Record<string, unknown>) => Promise<GardenToolResult>;
}

function result(message: string, data?: unknown): GardenToolResult {
  const text = data === undefined ? message : `${message}\n\n${JSON.stringify(data, null, 2)}`;
  return { content: [{ type: 'text', text }] };
}

function summarizePlant(plant: Plant) {
  const type = PLANT_TYPES[plant.type];
  return {
    id: plant.id,
    type: plant.type,
    name: type.name,
    plotIndex: plant.plotIndex,
    stage: plant.stage,
    growthPercent: Math.round(plant.growth * 100),
    health: Math.round(plant.health),
    water: Math.round(plant.water),
    readyToHarvest: plant.readyToHarvest,
  };
}

function gardenSnapshot() {
  const state = useGardenStore.getState();
  state.tickAll();
  const after = useGardenStore.getState();
  const plants = Object.values(after.plants);
  const occupied = new Map(plants.map((p) => [p.plotIndex, p]));
  const plots = Array.from({ length: PLOT_COUNT }, (_, i) => {
    const plant = occupied.get(i);
    return plant ? { plotIndex: i, plant: summarizePlant(plant) } : { plotIndex: i, plant: null };
  });
  return {
    plots,
    emptyPlots: plots.filter((p) => p.plant === null).map((p) => p.plotIndex),
    basket: after.basket,
    plantCount: plants.length,
    demoMode: after.demoMode,
    timeScale: after.demoMode ? DEMO_TIME_SCALE : 1,
    careTimeScale: after.demoMode ? DEMO_CARE_TIME_SCALE : 1,
  };
}

function currentPlant(plantId: string): Plant | undefined {
  const state = useGardenStore.getState();
  state.tickAll();
  return useGardenStore.getState().plants[plantId];
}

const plantIdSchema = {
  type: 'object',
  properties: {
    plantId: {
      type: 'string',
      minLength: 1,
      description: 'Unique id of the plant, e.g. "plant-m4x8q2-a9f1". See get_garden_state.',
    },
  },
  required: ['plantId'],
  additionalProperties: false,
} as const;

const emptySchema = {
  type: 'object',
  properties: {},
  additionalProperties: false,
} as const;

const jobIdSchema = {
  type: 'object',
  properties: {
    jobId: {
      type: 'string',
      minLength: 1,
      description: 'Job id returned by a bulk action or run_garden_plan. Omit for the latest job.',
    },
  },
  additionalProperties: false,
} as const;

export const gardenTools: GardenTool[] = [
  {
    name: 'get_garden_state',
    description:
      'Get the full live state of the garden: every plot, every plant with its id, type, growth stage, health, water level, and whether it is ready to harvest, plus the harvest basket. Call this first to orient yourself.',
    inputSchema: emptySchema,
    annotations: { readOnlyHint: true },
    async execute() {
      useGardenStore.getState().signalAgentInspection();
      const snapshot = gardenSnapshot();
      return result(
        `Garden state: ${snapshot.plantCount} plant(s) across ${PLOT_COUNT} plots, ${snapshot.emptyPlots.length} empty.`,
        snapshot,
      );
    },
  },
  {
    name: 'list_plant_types',
    description:
      'List the seed catalog: every plant type the garden supports, with its kind (vegetable/flower/fruit), how long it takes to grow, how thirsty it is, and its harvest yield.',
    inputSchema: emptySchema,
    annotations: { readOnlyHint: true },
    async execute() {
      useGardenStore.getState().signalAgentInspection();
      const catalog = PLANT_TYPE_LIST.map((t) => ({
        id: t.id,
        name: t.name,
        kind: t.kind,
        description: t.description,
        growthSeconds: Math.round(t.growthMs / 1000),
        waterDrainPerMin: t.waterDrainPerMin,
        harvestYield: t.harvestYield,
      }));
      return result(`${catalog.length} plant types available.`, catalog);
    },
  },
  {
    name: 'get_care_recommendations',
    description:
      'Get a prioritized list of what needs attention in the garden right now: thirsty plants to water, plants ready to harvest, withered plants to clear, and empty plots to sow. Use this to plan your next actions.',
    inputSchema: emptySchema,
    annotations: { readOnlyHint: true },
    async execute() {
      useGardenStore.getState().signalAgentInspection();
      const snapshot = gardenSnapshot();
      const plants = snapshot.plots.flatMap((p) => (p.plant ? [p.plant] : []));
      const thirsty = plants.filter((p) => p.stage !== 'withered' && p.water < 35);
      const ready = plants.filter((p) => p.readyToHarvest);
      const withered = plants.filter((p) => p.stage === 'withered');

      const suggestions: string[] = [];
      if (ready.length > 0) {
        suggestions.push(
          `Harvest ready: ${ready.map((p) => `${p.name} (${p.id})`).join(', ')} — use harvest_plant or harvest_all_ready.`,
        );
      }
      if (thirsty.length > 0) {
        suggestions.push(
          `Thirsty: ${thirsty.map((p) => `${p.name} (${p.id}, water ${p.water}%)`).join(', ')} — use water_plant or water_all_thirsty.`,
        );
      }
      if (withered.length > 0) {
        suggestions.push(
          `Withered: ${withered.map((p) => `${p.name} (${p.id})`).join(', ')} — use remove_plant to clear the plot.`,
        );
      }
      if (snapshot.emptyPlots.length > 0) {
        suggestions.push(
          `Empty plots: ${snapshot.emptyPlots.join(', ')} — use plant_seed to sow something.`,
        );
      }
      if (suggestions.length === 0) {
        suggestions.push('Everything is healthy and tended. Check back in a little while.');
      }
      return result('Care recommendations:', {
        suggestions,
        thirsty: thirsty.map((p) => p.id),
        readyToHarvest: ready.map((p) => p.id),
        withered: withered.map((p) => p.id),
        emptyPlots: snapshot.emptyPlots,
      });
    },
  },
  {
    name: 'preview_garden_plan',
    description:
      'Stage a proposed planting layout as glowing ghost plants in the live garden without planting anything. Use this for collaborative design: explain the plan, let the person review it, and only call run_garden_plan after they approve. Calling this again replaces the previous preview.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          minLength: 1,
          maxLength: 60,
          description: 'A short human-friendly name for the layout.',
        },
        rationale: {
          type: 'string',
          minLength: 1,
          maxLength: 280,
          description: 'A concise explanation of the design choices.',
        },
        assignments: {
          type: 'array',
          minItems: 1,
          maxItems: PLOT_COUNT,
          description: 'The empty plots and plant types to show in the preview.',
          items: {
            type: 'object',
            properties: {
              plotIndex: { type: 'integer', minimum: 0, maximum: PLOT_COUNT - 1 },
              plantType: { type: 'string', enum: PLANT_TYPE_LIST.map((type) => type.id) },
            },
            required: ['plotIndex', 'plantType'],
            additionalProperties: false,
          },
        },
        aftercare: {
          type: 'string',
          enum: ['none', 'one_accelerated_day'],
          description:
            'Set to "one_accelerated_day" when the person asks you to keep the approved planting healthy afterward. The browser will own that 60-second demo-day care session, so it continues after your turn ends.',
        },
      },
      required: ['name', 'rationale', 'assignments'],
      additionalProperties: false,
    },
    async execute(input) {
      const name = typeof input.name === 'string' ? input.name.trim().slice(0, 60) : '';
      const rationale =
        typeof input.rationale === 'string' ? input.rationale.trim().slice(0, 280) : '';
      if (!name || !rationale || !Array.isArray(input.assignments)) {
        return result('A plan needs a name, rationale, and at least one plot assignment.');
      }
      if (input.assignments.length > PLOT_COUNT) {
        return result(`A plan can target at most ${PLOT_COUNT} plots.`);
      }

      const garden = useGardenStore.getState();
      garden.tickAll();
      const occupied = new Set(
        Object.values(useGardenStore.getState().plants).map((plant) => plant.plotIndex),
      );
      const seen = new Set<number>();
      const assignments: GardenPlanAssignment[] = [];
      for (const raw of input.assignments) {
        if (!raw || typeof raw !== 'object') return result('Every assignment must be an object.');
        const item = raw as Record<string, unknown>;
        if (
          typeof item.plotIndex !== 'number' ||
          !Number.isInteger(item.plotIndex) ||
          item.plotIndex < 0 ||
          item.plotIndex >= PLOT_COUNT ||
          !isPlantTypeId(item.plantType)
        ) {
          return result('Every assignment needs a valid plotIndex and plantType.');
        }
        if (seen.has(item.plotIndex)) return result(`Plot ${item.plotIndex} appears more than once.`);
        if (occupied.has(item.plotIndex)) return result(`Plot ${item.plotIndex} is already occupied.`);
        seen.add(item.plotIndex);
        assignments.push({ plotIndex: item.plotIndex, plantType: item.plantType });
      }
      if (assignments.length === 0) return result('The plan has no assignments to preview.');

      const aftercare =
        input.aftercare === 'one_accelerated_day' ? 'one_accelerated_day' : 'none';
      const preview = createGardenPlanPreview(name, rationale, assignments, aftercare);
      return result(
        `Previewing “${preview.name}” across ${assignments.length} plot${assignments.length === 1 ? '' : 's'}. Nothing has been planted yet.${aftercare === 'one_accelerated_day' ? ' After approval, the same background job will also keep the garden healthy through one accelerated day.' : ''}`,
        {
          plan: preview,
          nextStep: 'Ask the person to review the glowing plan, then call run_garden_plan with this planId after approval.',
        },
      );
    },
  },
  {
    name: 'run_garden_plan',
    description:
      'Execute the currently visible planting preview after the person approves it. Returns immediately with a job id while the browser plants each assignment and performs any aftercare included in the preview. Background aftercare continues even after your turn ends. Poll get_agent_job for progress.',
    inputSchema: {
      type: 'object',
      properties: {
        planId: {
          type: 'string',
          minLength: 1,
          description: 'The exact plan id returned by preview_garden_plan.',
        },
      },
      required: ['planId'],
      additionalProperties: false,
    },
    async execute(input) {
      const planId = String(input.planId ?? '');
      const job = startGardenPlan(planId);
      if (!job) {
        return result('That preview is missing, stale, or no longer targets empty plots. Create a fresh preview first.');
      }
      return result(
        `Started “${job.label}” as ${job.id}. The robot is working in the background.`,
        agentJobSnapshot(job.id),
      );
    },
  },
  {
    name: 'get_agent_job',
    description:
      'Get live progress for an asynchronous robot job started by a bulk action or approved garden plan. Omit jobId to inspect the active or most recent job.',
    inputSchema: jobIdSchema,
    annotations: { readOnlyHint: true },
    async execute(input) {
      const jobId = typeof input.jobId === 'string' ? input.jobId : undefined;
      const job = agentJobSnapshot(jobId);
      if (!job) return result(jobId ? `No agent job named "${jobId}".` : 'No agent jobs yet.');
      return result(
        `${job.label}: ${job.completedActions}/${job.totalActions} actions, ${job.status}.`,
        job,
      );
    },
  },
  {
    name: 'plant_seed',
    description:
      'Plant a seed in a garden plot. If plotIndex is omitted, the first empty plot is used. New plants start healthy with moderate water.',
    inputSchema: {
      type: 'object',
      properties: {
        plantType: {
          type: 'string',
          enum: PLANT_TYPE_LIST.map((t) => t.id),
          description: 'Which seed to plant. See list_plant_types.',
        },
        plotIndex: {
          type: 'integer',
          minimum: 0,
          maximum: PLOT_COUNT - 1,
          description: `Plot number 0-${PLOT_COUNT - 1}, row-major from the near-left corner. Must be empty.`,
        },
      },
      required: ['plantType'],
      additionalProperties: false,
    },
    async execute(input) {
      if (!isPlantTypeId(input.plantType)) {
        return result(
          `Unknown plantType "${String(input.plantType)}". Valid options: ${PLANT_TYPE_LIST.map((t) => t.id).join(', ')}.`,
        );
      }
      const plantType = input.plantType;
      const plotIndex =
        typeof input.plotIndex === 'number' ? Math.trunc(input.plotIndex) : null;
      const state = useGardenStore.getState();
      state.tickAll();
      const occupied = new Set(
        Object.values(useGardenStore.getState().plants).map((plant) => plant.plotIndex),
      );
      const target =
        plotIndex ??
        Array.from({ length: PLOT_COUNT }, (_, i) => i).find((i) => !occupied.has(i)) ??
        null;
      if (target === null || target < 0 || target >= PLOT_COUNT || occupied.has(target)) {
        const res = useGardenStore.getState().plantSeed(plantType, plotIndex, 'agent');
        return result(res.message);
      }
      const res = await performAgentAction({
        kind: 'plant',
        plotIndex: target,
        plantType,
        label: `Planting ${PLANT_TYPES[plantType].name} in plot ${target}`,
      });
      return res.ok ? result(res.message, gardenSnapshot()) : result(res.message);
    },
  },
  {
    name: 'water_plant',
    description:
      'Water one plant by id. Water decays over time; plants below ~15% water lose health and can wither. Avoid watering plants that are already near 100% — overwatering slowly harms them.',
    inputSchema: plantIdSchema,
    async execute(input) {
      const plantId = String(input.plantId ?? '');
      const plant = currentPlant(plantId);
      if (!plant || plant.stage === 'withered') {
        const res = useGardenStore.getState().waterPlant(plantId, 'agent');
        return result(res.message);
      }
      const res = await performAgentAction({
        kind: 'water',
        plotIndex: plant.plotIndex,
        plantId,
        label: `Watering ${PLANT_TYPES[plant.type].name} in plot ${plant.plotIndex}`,
      });
      return result(res.message);
    },
  },
  {
    name: 'water_all_thirsty',
    description: 'Water every plant whose water level is below 35%. Efficient routine care in one call.',
    inputSchema: emptySchema,
    async execute() {
      const state = useGardenStore.getState();
      state.tickAll();
      const thirsty = Object.values(useGardenStore.getState().plants).filter(
        (plant) => plant.stage !== 'withered' && plant.water < 35,
      );
      if (thirsty.length === 0) {
        return result(state.waterAllThirsty('agent').message);
      }
      const job = enqueueAgentJob(
        `Watering ${thirsty.length} thirsty plant${thirsty.length === 1 ? '' : 's'}`,
        thirsty.map((plant) => ({
          kind: 'water',
          plotIndex: plant.plotIndex,
          plantId: plant.id,
          label: `Watering ${PLANT_TYPES[plant.type].name} in plot ${plant.plotIndex}`,
        })),
      );
      return result(
        `Started ${job.id}. The robot will water ${thirsty.length} thirsty plant${thirsty.length === 1 ? '' : 's'} in the background.`,
        agentJobSnapshot(job.id),
      );
    },
  },
  {
    name: 'harvest_plant',
    description:
      'Harvest one plant by id. Only plants with readyToHarvest = true can be harvested; harvesting removes the plant, frees its plot, and adds produce to the basket.',
    inputSchema: plantIdSchema,
    async execute(input) {
      const plantId = String(input.plantId ?? '');
      const plant = currentPlant(plantId);
      if (!plant || plant.stage === 'withered' || !plant.readyToHarvest) {
        const res = useGardenStore.getState().harvestPlant(plantId, 'agent');
        return result(res.message);
      }
      const res = await performAgentAction({
        kind: 'harvest',
        plotIndex: plant.plotIndex,
        plantId,
        label: `Harvesting ${PLANT_TYPES[plant.type].name} from plot ${plant.plotIndex}`,
      });
      return res.ok ? result(res.message, gardenSnapshot()) : result(res.message);
    },
  },
  {
    name: 'harvest_all_ready',
    description: 'Harvest every plant that is currently ready. Frees those plots for replanting.',
    inputSchema: emptySchema,
    async execute() {
      const state = useGardenStore.getState();
      state.tickAll();
      const ready = Object.values(useGardenStore.getState().plants).filter(
        (plant) => plant.readyToHarvest,
      );
      if (ready.length === 0) {
        return result(state.harvestAllReady('agent').message);
      }
      const job = enqueueAgentJob(
        `Harvesting ${ready.length} mature plant${ready.length === 1 ? '' : 's'}`,
        ready.map((plant) => ({
          kind: 'harvest',
          plotIndex: plant.plotIndex,
          plantId: plant.id,
          label: `Harvesting ${PLANT_TYPES[plant.type].name} from plot ${plant.plotIndex}`,
        })),
      );
      return result(
        `Started ${job.id}. The robot will harvest ${ready.length} mature plant${ready.length === 1 ? '' : 's'} in the background.`,
        agentJobSnapshot(job.id),
      );
    },
  },
  {
    name: 'remove_plant',
    description:
      'Remove a withered plant by id to free its plot. Only withered plants can be removed — living plants are never destroyed by this tool.',
    inputSchema: plantIdSchema,
    async execute(input) {
      const plantId = String(input.plantId ?? '');
      const plant = currentPlant(plantId);
      if (!plant || plant.stage !== 'withered') {
        const res = useGardenStore.getState().removePlant(plantId, 'agent');
        return result(res.message);
      }
      const res = await performAgentAction({
        kind: 'remove',
        plotIndex: plant.plotIndex,
        plantId,
        label: `Clearing ${PLANT_TYPES[plant.type].name} from plot ${plant.plotIndex}`,
      });
      return result(res.message);
    },
  },
];
