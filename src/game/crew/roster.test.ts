import { beforeEach, describe, expect, it } from 'vitest';
import { resetCrewStore } from '../../state/crewStore';
import { resetRoster, setCrew } from './roster';

describe('setCrew', () => {
  beforeEach(() => {
    resetCrewStore();
    resetRoster();
  });

  it('a second setCrew(2) does not create four helpers', () => {
    const first = setCrew(2);
    expect(first.desiredHelpers).toBe(2);
    expect(first.robots.filter((robot) => robot.role === 'helper' && robot.status !== 'docked')).toHaveLength(2);

    const second = setCrew(2);
    const out = second.robots.filter((robot) => robot.role === 'helper' && robot.status !== 'docked');
    expect(out.map((robot) => robot.id)).toEqual(['helper-1', 'helper-2']);
    expect(out).toHaveLength(2);
    expect(second.robots.filter((robot) => robot.id === 'helper-3')[0]?.status).toBe('docked');
  });

  it('helpers: 0 recalls idle helpers', () => {
    setCrew(2);
    const recalled = setCrew(0);
    expect(recalled.desiredHelpers).toBe(0);
    const helpers = recalled.robots.filter((robot) => robot.role === 'helper');
    expect(helpers.every((robot) => robot.status === 'docked' || robot.status === 'merging')).toBe(true);
  });

  it('reports unconverged while helpers are still emerging', () => {
    const snap = setCrew(1);
    expect(snap.converged).toBe(false);
    expect(snap.robots.find((robot) => robot.id === 'helper-1')?.status).toBe('emerging');
  });
});
