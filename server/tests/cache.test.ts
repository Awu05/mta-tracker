import { describe, it, expect } from 'vitest';
import { BoardCache } from '../src/cache';
import type { DirectionGroup } from '../src/types';

const station = { id: '127', name: 'Times Sq–42 St' };
const dirs: DirectionGroup[] = [{ direction: 'N', label: 'Uptown', arrivals: [] }];

describe('BoardCache', () => {
  it('starts empty with stale=true and null weather', () => {
    const c = new BoardCache(station, 90);
    const b = c.get(1_700_000_000_000);
    expect(b.stale).toBe(true);
    expect(b.weather).toBeNull();
    expect(b.directions).toEqual([]);
  });

  it('marks fresh right after an update and stale after the threshold', () => {
    const c = new BoardCache(station, 90);
    c.setBoard(dirs, [], 1_700_000_000_000);
    expect(c.get(1_700_000_030_000).stale).toBe(false); // +30s
    expect(c.get(1_700_000_100_000).stale).toBe(true);  // +100s > 90s
  });

  it('stores weather independently of board updates', () => {
    const c = new BoardCache(station, 90);
    c.setWeather({ tempF: 72, condition: 'Clear', icon: 'clear' });
    expect(c.get(1_700_000_000_000).weather?.tempF).toBe(72);
  });
});
