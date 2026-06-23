import { describe, it, expect } from 'vitest';
import { buildPollPlan } from '../src/boards/pollPlan';
import type { Board } from '../src/types';

const board = (over: Partial<Board>): Board => ({ code: 'c', entries: [], weatherLat: null, weatherLon: null, ...over });

describe('buildPollPlan', () => {
  it('dedupes subway ids, bus codes, and rounded locations across boards', () => {
    const plan = buildPollPlan([
      board({ entries: [{ id: '127', type: 'subway' }, { id: '401', type: 'bus' }], weatherLat: 40.7580, weatherLon: -73.9855 }),
      board({ entries: [{ id: '127', type: 'subway' }, { id: '635', type: 'subway' }], weatherLat: 40.75804, weatherLon: -73.98549 }),
      board({ entries: [{ id: '402', type: 'bus' }], weatherLat: 41.0, weatherLon: -73.5 }),
    ]);
    expect(plan.subwayIds.sort()).toEqual(['127', '635']);
    expect(plan.busCodes.sort()).toEqual(['401', '402']);
    // 40.7580/-73.9855 and 40.75804/-73.98549 collapse to one rounded location
    expect(plan.locations).toHaveLength(2);
    expect(plan.locations).toContainEqual({ lat: 40.758, lon: -73.985 });
    expect(plan.locations).toContainEqual({ lat: 41, lon: -73.5 });
  });

  it('returns empty arrays for no boards', () => {
    expect(buildPollPlan([])).toEqual({ subwayIds: [], busCodes: [], locations: [] });
  });

  it('a board with null coords contributes no location', () => {
    const plan = buildPollPlan([board({ entries: [{ id: '1', type: 'subway' }] })]);
    expect(plan.locations).toEqual([]);
    expect(plan.subwayIds).toEqual(['1']);
  });
});
