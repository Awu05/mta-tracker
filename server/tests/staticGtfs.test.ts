import { describe, it, expect } from 'vitest';
import { getStation, getRouteStyle, stopName } from '../src/staticGtfs';

describe('staticGtfs', () => {
  it('returns a station by id', () => {
    const s = getStation('127');
    expect(s.name).toBe('Times Sq–42 St');
    expect(s.routes).toContain('1');
  });

  it('throws for an unknown station', () => {
    expect(() => getStation('ZZZ')).toThrow(/ZZZ/);
  });

  it('returns route style with a fallback for unknown routes', () => {
    expect(getRouteStyle('1').color).toBe('#ee352e');
    expect(getRouteStyle('???')).toEqual({ color: '#666666', textColor: '#ffffff' });
  });

  it('resolves a stop name, stripping the N/S suffix', () => {
    expect(stopName('127N')).toMatch(/Times Sq/);
    expect(stopName('127')).toMatch(/Times Sq/);
    expect(stopName('999X')).toBe('999X'); // unknown -> echo id
    expect(stopName('D01N')).toMatch(/Norwood/); // resolved from complete stops.json, not the curated 5
  });
});
