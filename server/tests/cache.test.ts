import { describe, it, expect } from 'vitest';
import { BoardCache } from '../src/cache';
import type { Weather } from '../src/types';

const WEATHER: Weather = { tempF: 70, condition: 'Clear', icon: 'clear', hourly: [], daily: [] };

describe('BoardCache.getBoardModel', () => {
  it('returns only the requested entries, in order, with weather attached', () => {
    const cache = new BoardCache([], 90);
    cache.addStation({ id: '127', name: 'Times Sq', type: 'subway' });
    cache.addStation({ id: '635', name: 'Union Sq', type: 'subway' });
    cache.setDirections('127', [{ direction: 'N', label: 'Uptown', arrivals: [] }], 1000);

    const model = cache.getBoardModel([{ id: '635', type: 'subway' }, { id: '127', type: 'subway' }], WEATHER, 1000);
    expect(model.stations.map((s) => s.station.id)).toEqual(['635', '127']);
    expect(model.weather?.tempF).toBe(70);
  });

  it('synthesizes an empty, stale board for an entry not in the cache', () => {
    const cache = new BoardCache([], 90);
    const model = cache.getBoardModel([{ id: 'R01', type: 'subway' }], null, 1000);
    expect(model.stations[0].station.id).toBe('R01');
    expect(model.stations[0].stale).toBe(true);
    expect(model.stations[0].directions).toEqual([]);
  });
});

describe('BoardCache.reconcile', () => {
  it('adds new stations and drops ones no longer referenced', () => {
    const cache = new BoardCache([], 90);
    cache.addStation({ id: '127', name: 'Times Sq', type: 'subway' });
    cache.reconcile([{ id: '635', name: 'Union Sq', type: 'subway' }]);
    expect(cache.has('635')).toBe(true);
    expect(cache.has('127')).toBe(false);
  });
});
