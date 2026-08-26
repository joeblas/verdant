import { beforeEach, describe, expect, it } from 'vitest';
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
      jobs: {},
      jobOrder: [],
      activeJobId: null,
      botIntent: null,
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
});
