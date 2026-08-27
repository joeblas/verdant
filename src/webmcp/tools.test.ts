import { describe, expect, it } from 'vitest';
import { gardenTools } from './tools';

describe('garden tool catalog', () => {
  it('registers 13 tools including set_crew', () => {
    expect(gardenTools).toHaveLength(13);
    expect(gardenTools.map((tool) => tool.name)).toContain('set_crew');
  });
});
