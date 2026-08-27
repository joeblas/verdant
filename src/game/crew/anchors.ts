import { botHomePosition, type GardenPosition } from '../layout';
import type { HelperId, RobotId } from './ids';
import { helperSlotIndex } from './ids';

export const EMERGE_MS = 620;
export const MERGE_MS = 620;

const anchors = new Map<RobotId, GardenPosition>();

export function publishAnchor(id: RobotId, position: GardenPosition): void {
  anchors.set(id, position);
}

export function readAnchor(id: RobotId): GardenPosition {
  return anchors.get(id) ?? botHomePosition();
}

export function dockOffset(id: HelperId): GardenPosition {
  const slot = helperSlotIndex(id);
  if (slot === 1) return [0.58, 0.92, 0.22];
  if (slot === 2) return [-0.58, 0.92, 0.22];
  return [0, 1.18, -0.38];
}

export function resetAnchors(): void {
  anchors.clear();
}
