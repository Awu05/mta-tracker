import { describe, it, expect } from 'vitest';
import { getStation, getRouteStyle, stopName, searchStations } from '../src/staticGtfs';

describe('staticGtfs', () => {
  it('returns a station by id', () => {
    const s = getStation('127');
    expect(s.name).toMatch(/Times Sq/);
    expect(s.routes).toContain('1');
  });

  it('includes finite numeric coordinates for a station', () => {
    const s = getStation('127');
    expect(typeof s.lat).toBe('number');
    expect(typeof s.lon).toBe('number');
    expect(Number.isFinite(s.lat)).toBe(true);
    expect(Number.isFinite(s.lon)).toBe(true);
    expect(s.lat).toBeCloseTo(40.7557, 1);
    expect(s.lon).toBeCloseTo(-73.9876, 1);
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

  it('searches stations by name, case-insensitively', () => {
    const results = searchStations('times sq');
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.name).toMatch(/Times Sq/i);
      expect(typeof r.id).toBe('string');
    }
  });

  it('returns no results for an empty query', () => {
    expect(searchStations('')).toEqual([]);
    expect(searchStations('   ')).toEqual([]);
  });

  it('caps results at the given limit', () => {
    const results = searchStations('st', 3);
    expect(results.length).toBeLessThanOrEqual(3);
  });

  it('ranks names starting with the query before names that merely contain it', () => {
    const results = searchStations('park');
    expect(results.length).toBeGreaterThan(1);
    expect(results[0].name.toLowerCase().startsWith('park')).toBe(true);
  });
});
