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

  it('preserves data for a retained station while adding new ones', () => {
    const cache = new BoardCache([], 90);
    cache.addStation({ id: '127', name: 'Times Sq', type: 'subway' });
    cache.setDirections('127', [{ direction: 'N', label: 'Uptown', arrivals: [] }], 1000);
    cache.reconcile([{ id: '127', name: 'Times Sq', type: 'subway' }, { id: '635', name: 'Union Sq', type: 'subway' }]);

    const model = cache.getBoardModel(
      [{ id: '127', type: 'subway' }, { id: '635', type: 'subway' }],
      null,
      1000,
    );
    const times = model.stations.find((s) => s.station.id === '127');
    expect(times?.directions).toEqual([{ direction: 'N', label: 'Uptown', arrivals: [] }]);
    expect(times?.stale).toBe(false);
    expect(cache.has('635')).toBe(true);
  });
});

describe('BoardCache.removeStation', () => {
  it('removes a known station', () => {
    const cache = new BoardCache([], 90);
    cache.addStation({ id: '127', name: 'Times Sq', type: 'subway' });
    cache.removeStation('127');
    expect(cache.has('127')).toBe(false);
  });

  it('is a no-op for an unknown id', () => {
    const cache = new BoardCache([], 90);
    expect(() => cache.removeStation('NOPE')).not.toThrow();
    expect(cache.has('NOPE')).toBe(false);
  });
});

describe('BoardCache.addStation', () => {
  it('is idempotent: adding the same id twice does not duplicate or reset it', () => {
    const cache = new BoardCache([], 90);
    cache.addStation({ id: '127', name: 'Times Sq', type: 'subway' });
    cache.setDirections('127', [{ direction: 'N', label: 'Uptown', arrivals: [] }], 1000);
    cache.addStation({ id: '127', name: 'Times Sq (renamed)', type: 'subway' });

    const model = cache.getBoardModel([{ id: '127', type: 'subway' }], null, 1000);
    expect(model.stations).toHaveLength(1);
    expect(model.stations[0].directions).toEqual([{ direction: 'N', label: 'Uptown', arrivals: [] }]);
    expect(model.stations[0].station.name).toBe('Times Sq'); // unchanged by the second addStation
  });
});
