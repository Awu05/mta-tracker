import { describe, it, expect } from 'vitest';
import { WeatherCache, roundCoord } from '../src/weatherCache';
import type { Weather } from '../src/types';

const W = (t: number): Weather => ({ tempF: t, condition: 'Clear', icon: 'clear', hourly: [], daily: [] });

describe('WeatherCache', () => {
  it('rounds coords to 3 decimals for the key', () => {
    expect(roundCoord(40.712812)).toBe(40.713);
    expect(roundCoord(-74.0061)).toBe(-74.006);
  });
  it('stores and retrieves by rounded location', () => {
    const c = new WeatherCache();
    c.set(40.7580, -73.9855, W(70));
    expect(c.get(40.75801, -73.98549)?.tempF).toBe(70); // same to 3dp
    expect(c.get(41, -73)).toBeNull();
  });

  it('retain() evicts locations not in the keep list', () => {
    const c = new WeatherCache();
    c.set(40.758, -73.985, W(70));
    c.set(41, -73.5, W(50));
    c.retain([{ lat: 40.758, lon: -73.985 }]);
    expect(c.get(40.758, -73.985)?.tempF).toBe(70);
    expect(c.get(41, -73.5)).toBeNull();
  });
});
