import type { PlotIndex, RobotId } from './ids';

const leaseBrand = Symbol('plot-lease');

export interface PlotLease {
  readonly [leaseBrand]: true;
  readonly plotIndex: PlotIndex;
  readonly holder: RobotId;
}

const liveLeases = new Map<PlotIndex, PlotLease>();

export function mintLease(plotIndex: PlotIndex, holder: RobotId): PlotLease | null {
  if (liveLeases.has(plotIndex)) return null;
  const lease: PlotLease = { [leaseBrand]: true, plotIndex, holder };
  liveLeases.set(plotIndex, lease);
  return lease;
}

export function releaseLease(lease: PlotLease): void {
  const current = liveLeases.get(lease.plotIndex);
  if (current === lease) liveLeases.delete(lease.plotIndex);
}

export function isLeased(plotIndex: PlotIndex): boolean {
  return liveLeases.has(plotIndex);
}

export function resetLeases(): void {
  liveLeases.clear();
}
