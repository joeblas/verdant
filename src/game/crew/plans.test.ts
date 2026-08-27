import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createGardenPlanPreview, startGardenPlan } from '../agentJobs';
import { useAgentStore } from '../../state/agentStore';
import { resetCrewStore, useCrewStore } from '../../state/crewStore';
import { useGardenStore } from '../../state/gardenStore';
import { resetDispatch } from './dispatch';
import { resetLeases } from './lease';
import { resetRoster, setCrew } from './roster';

vi.mock('../agentChoreography', () => ({
  BOT_ACTION_MS: 0,
  waitForBot: () => Promise.resolve(),
  waitForBotArrival: () => Promise.resolve(),
}));

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

describe('plan helper policy', () => {
  beforeEach(() => {
    resetWorld();
  });

  it('omitting helpers inherits the standing crew', () => {
    setCrew(2);
    const preview = createGardenPlanPreview(
      'Inherit rows',
      'Keep the helpers already out.',
      [{ plotIndex: 8, plantType: 'lettuce' }],
    );
    expect(preview.helpers).toBeUndefined();
    const job = startGardenPlan(preview.id);
    expect(job).not.toBeNull();
    expect(useCrewStore.getState().desiredHelpers).toBe(2);
  });

  it('a concrete helper count only spawns up', () => {
    setCrew(2);
    const preview = createGardenPlanPreview(
      'No recall',
      'A smaller ask must not dock anyone.',
      [{ plotIndex: 9, plantType: 'carrot' }],
      'none',
      1,
    );
    const job = startGardenPlan(preview.id);
    expect(job).not.toBeNull();
    expect(useCrewStore.getState().desiredHelpers).toBe(2);
  });

  it('a larger helper count spawns the extra bodies', () => {
    setCrew(1);
    const preview = createGardenPlanPreview(
      'Spawn up',
      'Need two more helpers.',
      [{ plotIndex: 10, plantType: 'tomato' }],
      'none',
      3,
    );
    const job = startGardenPlan(preview.id);
    expect(job).not.toBeNull();
    expect(useCrewStore.getState().desiredHelpers).toBe(3);
  });

  it('reconciles with a plan already approved in the app without starting it twice', () => {
    const preview = createGardenPlanPreview(
      'Shared approval',
      'The app and agent should agree on one execution.',
      [{ plotIndex: 11, plantType: 'lavender' }],
    );

    const startedInApp = startGardenPlan(preview.id, 'app');
    const rediscoveredByAgent = startGardenPlan(preview.id, 'webmcp');

    expect(startedInApp).not.toBeNull();
    expect(rediscoveredByAgent?.id).toBe(startedInApp?.id);
    expect(useAgentStore.getState().jobOrder).toEqual([startedInApp?.id]);
    expect(useAgentStore.getState().planExecutions[preview.id]).toMatchObject({
      planId: preview.id,
      planName: preview.name,
      jobId: startedInApp?.id,
      approvedVia: 'app',
    });
    expect(useGardenStore.getState().activity[0]).toMatchObject({
      actor: 'you',
      message: expect.stringContaining(`Approved “${preview.name}”`),
    });
  });
});
