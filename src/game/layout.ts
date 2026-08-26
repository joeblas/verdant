export const PLOT_SPACING = 3.2;

export type GardenPosition = [number, number, number];

export function plotPosition(index: number): [number, number, number] {
  const row = Math.floor(index / 4);
  const col = index % 4;
  return [(col - 1.5) * PLOT_SPACING, 0, (row - 1.5) * PLOT_SPACING];
}

/** The robot works from the center of the aisle immediately left of a plot. */
export function plotApproachPosition(index: number): GardenPosition {
  const [x, , z] = plotPosition(index);
  return [x - PLOT_SPACING / 2, 0.08, z];
}

export function botHomePosition(): GardenPosition {
  const edge = PLOT_SPACING * 2;
  return [-edge, 0.08, -edge];
}

function onCrossAisle(value: number): boolean {
  const normalized = value / PLOT_SPACING;
  return Math.abs(normalized - Math.round(normalized)) < 0.001;
}

function samePoint(a: GardenPosition, b: GardenPosition): boolean {
  return Math.abs(a[0] - b[0]) < 0.001 && Math.abs(a[2] - b[2]) < 0.001;
}

/**
 * Builds a Manhattan route along the widened aisles. Endpoints sit on vertical
 * aisles; turns happen only on the horizontal cross aisles between plot rows.
 */
export function botAisleRoute(
  from: GardenPosition,
  target: GardenPosition,
): GardenPosition[] {
  if (samePoint(from, target)) return [target];
  if (Math.abs(from[0] - target[0]) < 0.001) return [target];

  let turnZ: number;
  if (onCrossAisle(from[2])) {
    turnZ = from[2];
  } else if (onCrossAisle(target[2])) {
    turnZ = target[2];
  } else if (Math.abs(from[2] - target[2]) < 0.001) {
    turnZ = from[2] - PLOT_SPACING / 2;
  } else {
    turnZ = from[2] + Math.sign(target[2] - from[2]) * PLOT_SPACING / 2;
  }

  const candidates: GardenPosition[] = [
    [from[0], 0.08, turnZ],
    [target[0], 0.08, turnZ],
    target,
  ];
  const route: GardenPosition[] = [];
  let previous = from;
  for (const point of candidates) {
    if (!samePoint(previous, point)) route.push(point);
    previous = point;
  }
  return route;
}
