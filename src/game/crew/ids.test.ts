import { describe, expect, it } from 'vitest';
import { parseHelperCount, parsePlotIndex, wantedHelpers } from './ids';

describe('parsePlotIndex', () => {
  it('accepts in-range integers', () => {
    expect(parsePlotIndex(0)).toBe(0);
    expect(parsePlotIndex(15)).toBe(15);
  });

  it('rejects 16, -1, 2.5, strings, and null', () => {
    expect(parsePlotIndex(16)).toBeNull();
    expect(parsePlotIndex(-1)).toBeNull();
    expect(parsePlotIndex(2.5)).toBeNull();
    expect(parsePlotIndex('3')).toBeNull();
    expect(parsePlotIndex(null)).toBeNull();
  });
});

describe('parseHelperCount', () => {
  it('accepts 0 through 3', () => {
    expect(parseHelperCount(0)).toBe(0);
    expect(parseHelperCount(2)).toBe(2);
    expect(parseHelperCount(3)).toBe(3);
  });

  it('rejects 4, -1, and 1.5', () => {
    expect(parseHelperCount(4)).toBeNull();
    expect(parseHelperCount(-1)).toBeNull();
    expect(parseHelperCount(1.5)).toBeNull();
  });
});

describe('wantedHelpers', () => {
  it('derives slot ids from the count', () => {
    expect(wantedHelpers(0)).toEqual([]);
    expect(wantedHelpers(2)).toEqual(['helper-1', 'helper-2']);
    expect(wantedHelpers(3)).toEqual(['helper-1', 'helper-2', 'helper-3']);
  });
});
