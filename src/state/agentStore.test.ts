import { beforeEach, describe, expect, it } from 'vitest';
import { createGardenPlanPreview } from '../game/agentJobs';
import { latestAgentJob, type AgentJob, useAgentStore } from './agentStore';

function queuedJob(): AgentJob {
  return {
    id: 'job-test',
    label: 'Tending the test garden',
    status: 'queued',
    totalActions: 2,
    completedActions: 0,
    currentAction: null,
    currentPlotIndex: null,
    results: [],
    error: null,
    createdAt: 1,
    startedAt: null,
    finishedAt: null,
  };
}

describe('agent job progress', () => {
  beforeEach(() => {
    useAgentStore.setState({
      planPreview: null,
      planExecutions: {},
      jobs: {},
      jobOrder: [],
      activeJobId: null,
    });
  });

  it('exposes queued, running, and completed progress', () => {
    const store = useAgentStore.getState();
    store.createJob(queuedJob());
    expect(latestAgentJob()?.status).toBe('queued');

    store.startJob('job-test');
    store.setJobAction('job-test', 'Watering lettuce', 3);
    store.completeJobAction('job-test', 'Watered lettuce.');
    expect(latestAgentJob()).toMatchObject({
      status: 'running',
      completedActions: 1,
      currentPlotIndex: 3,
    });

    store.completeJob('job-test');
    expect(latestAgentJob()).toMatchObject({
      status: 'completed',
      completedActions: 1,
      currentAction: null,
    });
  });

  it('keeps an approved plan\'s aftercare commitment with the preview', () => {
    const preview = createGardenPlanPreview(
      'Pollinator mosaic',
      'Diverse neighboring plants.',
      [{ plotIndex: 0, plantType: 'lavender' }],
      'one_accelerated_day',
    );

    expect(preview.aftercare).toBe('one_accelerated_day');
    expect(useAgentStore.getState().planPreview?.aftercare).toBe('one_accelerated_day');
    expect(preview.helpers).toBeUndefined();
  });

  it('stores an explicit helper count on the preview', () => {
    const preview = createGardenPlanPreview(
      'Crew rows',
      'Two helpers peel off the lead.',
      [{ plotIndex: 1, plantType: 'lettuce' }],
      'none',
      2,
    );
    expect(preview.helpers).toBe(2);
    expect(useAgentStore.getState().planPreview?.helpers).toBe(2);
  });
});
