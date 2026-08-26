import { PLANT_TYPE_LIST, PLANT_TYPES, isPlantTypeId } from '../game/plants';
import type { Plant } from '../game/types';
import { PLOT_COUNT, useGardenStore } from '../state/gardenStore';

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
  };
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

export const gardenTools: GardenTool[] = [
  {
    name: 'get_garden_state',
    description:
      'Get the full live state of the garden: every plot, every plant with its id, type, growth stage, health, water level, and whether it is ready to harvest, plus the harvest basket. Call this first to orient yourself.',
    inputSchema: emptySchema,
    annotations: { readOnlyHint: true },
    async execute() {
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
      const plotIndex =
        typeof input.plotIndex === 'number' ? Math.trunc(input.plotIndex) : null;
      const res = useGardenStore
        .getState()
        .plantSeed(input.plantType, plotIndex, 'agent');
      return res.ok ? result(res.message, gardenSnapshot()) : result(res.message);
    },
  },
  {
    name: 'water_plant',
    description:
      'Water one plant by id. Water decays over time; plants below ~15% water lose health and can wither. Avoid watering plants that are already near 100% — overwatering slowly harms them.',
    inputSchema: plantIdSchema,
    async execute(input) {
      const res = useGardenStore.getState().waterPlant(String(input.plantId ?? ''), 'agent');
      return result(res.message);
    },
  },
  {
    name: 'water_all_thirsty',
    description: 'Water every plant whose water level is below 35%. Efficient routine care in one call.',
    inputSchema: emptySchema,
    async execute() {
      const res = useGardenStore.getState().waterAllThirsty('agent');
      return result(res.message);
    },
  },
  {
    name: 'harvest_plant',
    description:
      'Harvest one plant by id. Only plants with readyToHarvest = true can be harvested; harvesting removes the plant, frees its plot, and adds produce to the basket.',
    inputSchema: plantIdSchema,
    async execute(input) {
      const res = useGardenStore.getState().harvestPlant(String(input.plantId ?? ''), 'agent');
      return res.ok ? result(res.message, gardenSnapshot()) : result(res.message);
    },
  },
  {
    name: 'harvest_all_ready',
    description: 'Harvest every plant that is currently ready. Frees those plots for replanting.',
    inputSchema: emptySchema,
    async execute() {
      const res = useGardenStore.getState().harvestAllReady('agent');
      return res.ok ? result(res.message, gardenSnapshot()) : result(res.message);
    },
  },
  {
    name: 'remove_plant',
    description:
      'Remove a withered plant by id to free its plot. Only withered plants can be removed — living plants are never destroyed by this tool.',
    inputSchema: plantIdSchema,
    async execute(input) {
      const res = useGardenStore.getState().removePlant(String(input.plantId ?? ''), 'agent');
      return result(res.message);
    },
  },
];
