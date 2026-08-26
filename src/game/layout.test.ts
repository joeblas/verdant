import { describe, expect, it } from 'vitest';
import {
  PLOT_SPACING,
  botAisleRoute,
  botHomePosition,
  plotApproachPosition,
  type GardenPosition,
} from './layout';

function isAisleCoordinate(value: number): boolean {
  return Math.abs(value / PLOT_SPACING - Math.round(value / PLOT_SPACING)) < 0.001;
}

describe('bot aisle routing', () => {
  it('keeps every leg on a widened aisle', () => {
    const stops = [botHomePosition(), ...Array.from({ length: 16 }, (_, index) => plotApproachPosition(index))];

    for (const from of stops) {
      for (const target of stops) {
        const points: GardenPosition[] = [from, ...botAisleRoute(from, target)];
        expect(points.at(-1)).toEqual(target);

        for (let index = 1; index < points.length; index++) {
          const previous = points[index - 1];
          const current = points[index];
          if (
            Math.abs(previous[0] - current[0]) < 0.001 &&
            Math.abs(previous[2] - current[2]) < 0.001
          ) continue;
          const vertical = Math.abs(previous[0] - current[0]) < 0.001;
          const horizontal = Math.abs(previous[2] - current[2]) < 0.001;
          expect(vertical || horizontal).toBe(true);
          if (vertical) expect(isAisleCoordinate(current[0])).toBe(true);
          if (horizontal) expect(isAisleCoordinate(current[2])).toBe(true);
        }
      }
    }
  });
});
