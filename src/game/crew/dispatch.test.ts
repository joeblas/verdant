import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAgentStore } from '../../state/agentStore';
import { resetCrewStore, useCrewStore } from '../../state/crewStore';
import { useGardenStore } from '../../state/gardenStore';
import { dutyPlot } from './duty';
import { parsePlotIndex } from './ids';
import { isLeased, resetLeases } from './lease';
import { resetRoster, setCrew } from './roster';
import {
  enqueueCrewJob,
  performAgentAction,
  resetDispatch,
  type TaskRequest,
} from './dispatch';

vi.mock('../agentChoreography', () => ({
  BOT_ACTION_MS: 0,
  waitForBot: () => Promise.resolve(),
  waitForBotArrival: () => Promise.resolve(),
}));

async function settle(jobId: string) {
  const started = Date.now();
  while (Date.now() - started < 2000) {
    const job = useAgentStore.getState().jobs[jobId];
    if (job && (job.status === 'completed' || job.status === 'failed')) return job;
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error(`Job ${jobId} did not settle`);
}

function waterTask(plot: number, plantId: string): TaskRequest {
  const plotIndex = parsePlotIndex(plot);
  if (plotIndex === null) throw new Error(`bad plot ${plot}`);
  return {
    action: { kind: 'water', plotIndex, plantId },
    label: `Watering plot ${plot}`,
  };
}

function plantAsYou(plot: number, type: 'lettuce' | 'carrot' = 'lettuce') {
  const result = useGardenStore.getState().plantSeed(type, plot, 'you');
  if (!result.ok) throw new Error(result.message);
}

function resetWorld() {
  resetDispatch();
  resetLeases();
  resetCrewStore();
  resetRoster();
  useGardenStore.getState().resetGarden();
  useAgentStore.setState({
    planPreview: null,
    planExecutions: {},
    jobs: {},
    jobOrder: [],
    activeJobId: null,
  });
}

describe('crew dispatcher', () => {
  beforeEach(() => {
    resetWorld();
  });

  afterEach(() => {
    resetWorld();
  });

  it('never lets two robots hold the same plot', async () => {
    plantAsYou(0);
    plantAsYou(1);
    plantAsYou(2);
    plantAsYou(3);
    setCrew(3);

    const clashes: number[] = [];
    const unsubscribe = useCrewStore.subscribe((state) => {
      const holders = new Map<number, string>();
      const robots = [state.lead, ...Object.values(state.helpers)];
      for (const robot of robots) {
        if (!robot) continue;
        const plot = dutyPlot(robot.duty);
        if (plot === null) continue;
        const prior = holders.get(plot);
        if (prior && prior !== robot.id) clashes.push(plot);
        holders.set(plot, robot.id);
      }
    });

    const plants = Object.values(useGardenStore.getState().plants);
    const job = enqueueCrewJob({
      label: 'Watering four plots',
      tasks: plants.map((plant) => waterTask(plant.plotIndex, plant.id)),
      aftercare: 'none',
      staffing: 'crew',
    });
    await settle(job.id);
    unsubscribe();

    expect(clashes).toEqual([]);
    const waterIntents = useGardenStore
      .getState()
      .lastEvents.filter((event) => event.actor === 'agent' && event.phase === 'intent' && event.kind === 'water');
    expect(new Set(waterIntents.map((event) => event.plotIndex)).size).toBe(4);
    expect(useAgentStore.getState().jobs[job.id]?.status).toBe('completed');
  });

  it('releases a lease when a task fails', async () => {
    const plot = parsePlotIndex(4);
    if (plot === null) throw new Error('plot');
    const job = enqueueCrewJob({
      label: 'Watering a ghost',
      tasks: [{ action: { kind: 'water', plotIndex: plot, plantId: 'missing' }, label: 'Watering nothing' }],
      aftercare: 'none',
      staffing: 'lead',
    });
    const finished = await settle(job.id);
    expect(finished.status).toBe('failed');
    expect(isLeased(plot)).toBe(false);

    const planted = await performAgentAction({
      kind: 'plant',
      plotIndex: 4,
      plantType: 'lettuce',
      label: 'Planting lettuce in plot 4',
    });
    expect(planted.ok).toBe(true);
  });

  it('keeps one-off actions on the lead', async () => {
    const planted = await performAgentAction({
      kind: 'plant',
      plotIndex: 7,
      plantType: 'carrot',
      label: 'Planting carrot in plot 7',
    });
    expect(planted.ok).toBe(true);
    expect(useCrewStore.getState().lead.duty.phase).toBe('tending');
    const plant = Object.values(useGardenStore.getState().plants).find((item) => item.plotIndex === 7);
    expect(plant?.type).toBe('carrot');
  });
});
