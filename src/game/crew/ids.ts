import { PLOT_COUNT } from '../../state/gardenStore';

export type LeadId = 'lead';
export type HelperId = 'helper-1' | 'helper-2' | 'helper-3';
export type RobotId = LeadId | HelperId;

export const HELPER_SLOTS: readonly HelperId[] = ['helper-1', 'helper-2', 'helper-3'];

export type HelperCount = 0 | 1 | 2 | 3;
export type CrewSize = 1 | 2 | 3 | 4;

declare const plotBrand: unique symbol;
export type PlotIndex = number & { readonly [plotBrand]: true };

export function helperSlotIndex(id: HelperId): 1 | 2 | 3 {
  if (id === 'helper-1') return 1;
  if (id === 'helper-2') return 2;
  return 3;
}

export function wantedHelpers(count: HelperCount): readonly HelperId[] {
  return HELPER_SLOTS.slice(0, count);
}

export function parsePlotIndex(value: unknown): PlotIndex | null {
  if (typeof value !== 'number' || !Number.isInteger(value)) return null;
  if (value < 0 || value >= PLOT_COUNT) return null;
  return value as PlotIndex;
}

export function parseHelperCount(value: unknown): HelperCount | null {
  if (typeof value !== 'number' || !Number.isInteger(value)) return null;
  if (value === 0 || value === 1 || value === 2 || value === 3) return value;
  return null;
}
