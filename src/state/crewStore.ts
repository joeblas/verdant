import { create } from 'zustand';
import type { Helper, HelperDuty, Lead, LeadDuty } from '../game/crew/duty';
import { HELPER_SLOTS, type HelperCount, type HelperId, type RobotId } from '../game/crew/ids';

export interface CrewState {
  readonly desiredHelpers: HelperCount;
  readonly lead: Lead;
  readonly helpers: Partial<Record<HelperId, Helper>>;

  setDesiredHelpers: (count: HelperCount) => void;
  setLeadDuty: (duty: LeadDuty) => void;
  setHelperDuty: (id: HelperId, duty: HelperDuty) => void;
}

function dockedHelper(id: HelperId): Helper {
  return { id, duty: { phase: 'docked' } };
}

function initialHelpers(): Record<HelperId, Helper> {
  return {
    'helper-1': dockedHelper('helper-1'),
    'helper-2': dockedHelper('helper-2'),
    'helper-3': dockedHelper('helper-3'),
  };
}

export const useCrewStore = create<CrewState>()((set) => ({
  desiredHelpers: 0,
  lead: { id: 'lead', duty: { phase: 'tending' } },
  helpers: initialHelpers(),

  setDesiredHelpers: (desiredHelpers) => set({ desiredHelpers }),
  setLeadDuty: (duty) => set((state) => ({ lead: { ...state.lead, duty } })),
  setHelperDuty: (id, duty) =>
    set((state) => ({
      helpers: { ...state.helpers, [id]: { id, duty } },
    })),
}));

export function resetCrewStore(): void {
  useCrewStore.setState({
    desiredHelpers: 0,
    lead: { id: 'lead', duty: { phase: 'tending' } },
    helpers: initialHelpers(),
  });
}

export function selectRobot(id: RobotId): (state: CrewState) => Lead | Helper | undefined {
  return (state) => (id === 'lead' ? state.lead : state.helpers[id]);
}

export function allRobots(state: CrewState = useCrewStore.getState()): Array<Lead | Helper> {
  return [state.lead, ...HELPER_SLOTS.map((id) => state.helpers[id] ?? dockedHelper(id))];
}
