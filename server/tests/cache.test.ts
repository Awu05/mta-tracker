import { describe, it, expect } from 'vitest';
import { BoardCache } from '../src/cache';
import type { DirectionGroup } from '../src/types';

const stations = [
  { id: '127', name: 'Times Sq–42 St' },
  { id: '635', name: '14 St–Union Sq' },
];
const dirs: DirectionGroup[] = [{ direction: 'N', label: 'Uptown', arrivals: [] }];

describe('BoardCache', () => {
  it('starts with both stations present, stale, empty directions/alerts, and null weather', () => {
    const c = new BoardCache(stations, 90);
    const b = c.get(1_700_000_000_000);
    expect(b.stations).toHaveLength(2);
    expect(b.stations[0].station).toEqual({ id: '127', name: 'Times Sq–42 St' });
    expect(b.stations[1].station).toEqual({ id: '635', name: '14 St–Union Sq' });
    expect(b.stations[0].stale).toBe(true);
    expect(b.stations[1].stale).toBe(true);
    expect(b.stations[0].directions).toEqual([]);
    expect(b.stations[0].alerts).toEqual([]);
    expect(b.weather).toBeNull();
    expect(b.stale).toBe(true);
  });

  it('tracks per-station freshness and aggregates top-level staleness', () => {
    const c = new BoardCache(stations, 90);
    const T0 = 1_700_000_000_000;

    c.setDirections('127', dirs, T0);
    let b = c.get(T0 + 30_000);
    expect(b.stations[0].stale).toBe(false); // 127 fresh
    expect(b.stations[1].stale).toBe(true);  // 635 never updated
    expect(b.stale).toBe(true);              // top-level: any station stale

    c.setDirections('635', dirs, T0);
    b = c.get(T0 + 30_000);
    expect(b.stations[0].stale).toBe(false);
    expect(b.stations[1].stale).toBe(false);
    expect(b.stale).toBe(false);

    // Advance past the threshold: both go stale again.
    b = c.get(T0 + 100_000);
    expect(b.stations[0].stale).toBe(true);
    expect(b.stations[1].stale).toBe(true);
    expect(b.stale).toBe(true);
  });

  it('setAlerts populates only the targeted station without affecting staleness', () => {
    const c = new BoardCache(stations, 90);
    const T0 = 1_700_000_000_000;
    c.setDirections('127', dirs, T0);

    c.setAlerts('127', [{ routes: ['N'], severity: 'delay', text: 'Delays' }]);

    const b = c.get(T0 + 30_000);
    expect(b.stations[0].alerts[0].text).toBe('Delays');
    expect(b.stations[1].alerts).toEqual([]);
    expect(b.stations[0].stale).toBe(false); // setAlerts doesn't touch lastUpdated
  });

  it('setWeather populates shared weather visible on the model', () => {
    const c = new BoardCache(stations, 90);
    c.setWeather({ tempF: 72, condition: 'Clear', icon: 'clear' });
    expect(c.get(1_700_000_000_000).weather?.tempF).toBe(72);
  });

  it('throws when setting directions/alerts for an unknown station id', () => {
    const c = new BoardCache(stations, 90);
    expect(() => c.setDirections('999', dirs, 1_700_000_000_000)).toThrow(/999/);
    expect(() => c.setAlerts('999', [])).toThrow(/999/);
  });

  it('defaults type to subway when meta omits it', () => {
    const c = new BoardCache(stations, 90);
    const b = c.get(1_700_000_000_000);
    expect(b.stations[0].type).toBe('subway');
    expect(b.stations[0].arrivals).toEqual([]);
  });

  it('supports bus stations via setBusArrivals: type, arrivals, name update, freshness', () => {
    const busStations = [
      ...stations,
      { id: '400080', name: 'Bus 400080', type: 'bus' as const },
    ];
    const c = new BoardCache(busStations, 90);
    const T0 = 1_700_000_000_000;
    const busArrival = {
      route: 'M15',
      color: '#1E5BA8',
      textColor: '#ffffff',
      destination: 'EAST HARLEM 125 ST',
      minutes: 7,
    };

    c.setBusArrivals('400080', [busArrival], T0, 'Main St/1 Av');

    const b = c.get(T0);
    const busBoard = b.stations.find((s) => s.station.id === '400080')!;
    expect(busBoard.type).toBe('bus');
    expect(busBoard.arrivals).toEqual([busArrival]);
    expect(busBoard.station.name).toBe('Main St/1 Av');
    expect(busBoard.stale).toBe(false);
    expect(busBoard.directions).toEqual([]);

    // subway station in the same cache is unaffected and still reports subway.
    const subwayBoard = b.stations.find((s) => s.station.id === '127')!;
    expect(subwayBoard.type).toBe('subway');
  });

  it('throws when setBusArrivals targets an unknown station id', () => {
    const c = new BoardCache(stations, 90);
    expect(() => c.setBusArrivals('999', [], 1_700_000_000_000)).toThrow(/999/);
  });
});
