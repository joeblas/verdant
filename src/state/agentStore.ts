import { create } from 'zustand';
import type { HelperCount } from '../game/crew/ids';
import type { PlantTypeId } from '../game/plants';
import type { GardenEvent } from '../game/types';

export type AgentActionKind = Exclude<GardenEvent['kind'], 'inspect'>;
export type AgentJobStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface GardenPlanAssignment {
  plotIndex: number;
  plantType: PlantTypeId;
}

export interface GardenPlanPreview {
  id: string;
  name: string;
  rationale: string;
  assignments: GardenPlanAssignment[];
  aftercare: 'none' | 'one_accelerated_day';
  helpers?: HelperCount;
  createdAt: number;
}

export interface AgentJob {
  id: string;
  label: string;
  status: AgentJobStatus;
  totalActions: number;
  completedActions: number;
  currentAction: string | null;
  currentPlotIndex: number | null;
  results: string[];
  error: string | null;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
}

interface AgentState {
  planPreview: GardenPlanPreview | null;
  jobs: Record<string, AgentJob>;
  jobOrder: string[];
  activeJobId: string | null;

  setPlanPreview: (preview: GardenPlanPreview) => void;
  clearPlanPreview: (planId?: string) => void;
  createJob: (job: AgentJob) => void;
  startJob: (jobId: string) => void;
  setJobAction: (jobId: string, label: string, plotIndex: number | null) => void;
  completeJobAction: (jobId: string, message: string) => void;
  completeJob: (jobId: string) => void;
  failJob: (jobId: string, error: string) => void;
  dismissJob: (jobId: string) => void;
}

const MAX_JOBS = 12;

export const useAgentStore = create<AgentState>()((set) => ({
  planPreview: null,
  jobs: {},
  jobOrder: [],
  activeJobId: null,

  setPlanPreview: (planPreview) => set({ planPreview }),
  clearPlanPreview: (planId) =>
    set((state) =>
      !planId || state.planPreview?.id === planId ? { planPreview: null } : state,
    ),
  createJob: (job) =>
    set((state) => {
      const jobOrder = [job.id, ...state.jobOrder.filter((id) => id !== job.id)].slice(0, MAX_JOBS);
      const jobs = Object.fromEntries(
        jobOrder.map((id) => [id, id === job.id ? job : state.jobs[id]]),
      ) as Record<string, AgentJob>;
      return { jobs, jobOrder };
    }),
  startJob: (jobId) =>
    set((state) => ({
      activeJobId: jobId,
      jobs: {
        ...state.jobs,
        [jobId]: {
          ...state.jobs[jobId],
          status: 'running',
          startedAt: Date.now(),
        },
      },
    })),
  setJobAction: (jobId, currentAction, currentPlotIndex) =>
    set((state) => ({
      jobs: {
        ...state.jobs,
        [jobId]: {
          ...state.jobs[jobId],
          currentAction,
          currentPlotIndex,
        },
      },
    })),
  completeJobAction: (jobId, message) =>
    set((state) => ({
      jobs: {
        ...state.jobs,
        [jobId]: {
          ...state.jobs[jobId],
          completedActions: state.jobs[jobId].completedActions + 1,
          results: [...state.jobs[jobId].results, message],
        },
      },
    })),
  completeJob: (jobId) =>
    set((state) => ({
      activeJobId: state.activeJobId === jobId ? null : state.activeJobId,
      jobs: {
        ...state.jobs,
        [jobId]: {
          ...state.jobs[jobId],
          status: 'completed',
          currentAction: null,
          currentPlotIndex: null,
          finishedAt: Date.now(),
        },
      },
    })),
  failJob: (jobId, error) =>
    set((state) => ({
      activeJobId: state.activeJobId === jobId ? null : state.activeJobId,
      jobs: {
        ...state.jobs,
        [jobId]: {
          ...state.jobs[jobId],
          status: 'failed',
          currentAction: null,
          currentPlotIndex: null,
          error,
          finishedAt: Date.now(),
        },
      },
    })),
  dismissJob: (jobId) =>
    set((state) => {
      if (state.jobs[jobId]?.status === 'running') return state;
      const jobs = { ...state.jobs };
      delete jobs[jobId];
      return {
        jobs,
        jobOrder: state.jobOrder.filter((id) => id !== jobId),
      };
    }),
}));

export function latestAgentJob(): AgentJob | null {
  const state = useAgentStore.getState();
  const id = state.activeJobId ?? state.jobOrder[0];
  return id ? state.jobs[id] ?? null : null;
}
