import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { busStopUrl, transformBusStop, nearbyBusStopsUrl, transformNearbyStops } from '../src/feeds/bus';

const fixture = JSON.parse(
  readFileSync(path.join(__dirname, 'fixtures/siri-stop-monitoring.json'), 'utf-8'),
);

const obaFixture = JSON.parse(
  readFileSync(path.join(__dirname, 'fixtures/oba-stops-for-location.json'), 'utf-8'),
);

describe('busStopUrl', () => {
  it('builds a SIRI stop-monitoring URL with the stop code, version, and key', () => {
    const url = busStopUrl('401687', 'TESTKEY123');
    expect(url).toContain('MonitoringRef=401687');
    expect(url).toContain('version=2');
    expect(url).toContain('key=TESTKEY123');
    expect(url).toBe(
      'https://bustime.mta.info/api/siri/stop-monitoring.json?key=TESTKEY123&version=2&MonitoringRef=401687',
    );
  });
});

describe('transformBusStop', () => {
  // Fixture's first visit: ExpectedArrivalTime = 2026-06-21T12:21:12.297-04:00
  // -04:00 means UTC = local + 4h -> 2026-06-21T16:21:12.297Z
  const ETA_MS = Date.parse('2026-06-21T12:21:12.297-04:00');
  const NOW = ETA_MS - 5 * 60_000; // exactly 5 minutes before the first visit's ETA

  it('computes minutes from ExpectedArrivalTime using a fixed nowMs', () => {
    const { arrivals } = transformBusStop(fixture, NOW);
    const m15 = arrivals.find((a) => a.route === 'M15' && a.destination.includes('EAST HARLEM'));
    expect(m15).toBeDefined();
    expect(m15!.minutes).toBe(5);
    expect(m15!.note).toBeUndefined();
  });

  it('falls back to a note + null minutes when there is no ETA', () => {
    const { arrivals } = transformBusStop(fixture, NOW);
    const noEta = arrivals.find((a) => a.minutes === null);
    expect(noEta).toBeDefined();
    expect(noEta!.note).toBeTruthy();
    expect(typeof noEta!.note).toBe('string');
  });

  it('selects SBS styling for SBS routes and local styling otherwise', () => {
    const { arrivals } = transformBusStop(fixture, NOW);
    const sbs = arrivals.find((a) => a.route === 'M15-SBS');
    const local = arrivals.find((a) => a.route === 'M15');
    expect(sbs).toBeDefined();
    expect(sbs!.color).toBe('#00467F');
    expect(sbs!.textColor).toBe('#ffffff');
    expect(local).toBeDefined();
    expect(local!.color).toBe('#1E5BA8');
    expect(local!.textColor).toBe('#ffffff');
  });

  it('extracts the stop name from the first visit MonitoredCall.StopPointName', () => {
    const { name } = transformBusStop(fixture, NOW);
    expect(name).toBe('1 AV/E 14 ST');
  });

  it('sorts numeric-minute arrivals ascending before note-only arrivals', () => {
    const { arrivals } = transformBusStop(fixture, NOW);
    const numericIdx = arrivals.map((a, i) => (a.minutes !== null ? i : -1)).filter((i) => i >= 0);
    const noteIdx = arrivals.map((a, i) => (a.minutes === null ? i : -1)).filter((i) => i >= 0);
    // all numeric-minute arrivals come before all note-only arrivals
    expect(Math.max(...numericIdx)).toBeLessThan(Math.min(...noteIdx));
    // numeric ones ascending
    const numericMinutes = arrivals.filter((a) => a.minutes !== null).map((a) => a.minutes as number);
    const sorted = [...numericMinutes].sort((a, b) => a - b);
    expect(numericMinutes).toEqual(sorted);
  });

  it('produces at least one alert with non-empty text from the situation', () => {
    const { alerts } = transformBusStop(fixture, NOW);
    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts[0].text.length).toBeGreaterThan(0);
    expect(alerts[0].routes.length).toBeGreaterThan(0);
  });

  it('returns null name and empty arrivals/alerts for an empty delivery', () => {
    const empty = {
      Siri: { ServiceDelivery: { StopMonitoringDelivery: [{ MonitoredStopVisit: [] }] } },
    };
    const result = transformBusStop(empty, NOW);
    expect(result.name).toBeNull();
    expect(result.arrivals).toEqual([]);
    expect(result.alerts).toEqual([]);
  });
});

describe('nearbyBusStopsUrl', () => {
  it('builds an OBA stops-for-location URL with lat, lon, radius, and key', () => {
    const url = nearbyBusStopsUrl(40.75529, -73.987495, 'TESTKEY123');
    expect(url).toContain('lat=40.75529');
    expect(url).toContain('lon=-73.987495');
    expect(url).toContain('radius=400');
    expect(url).toContain('key=TESTKEY123');
    expect(url).toContain('version=2');
  });

  it('honors a custom radius', () => {
    const url = nearbyBusStopsUrl(40.75529, -73.987495, 'TESTKEY123', 800);
    expect(url).toContain('radius=800');
  });
});

describe('transformNearbyStops', () => {
  // Times Sq coords used to fetch the fixture
  const FROM_LAT = 40.75529;
  const FROM_LON = -73.987495;

  it('returns stops sorted ascending by distanceMeters', () => {
    const stops = transformNearbyStops(obaFixture, FROM_LAT, FROM_LON);
    expect(stops.length).toBeGreaterThan(0);
    for (const s of stops) {
      expect(typeof s.distanceMeters).toBe('number');
      expect(Number.isFinite(s.distanceMeters)).toBe(true);
    }
    const distances = stops.map((s) => s.distanceMeters);
    const sorted = [...distances].sort((a, b) => a - b);
    expect(distances).toEqual(sorted);
  });

  it('derives code from the numeric part of the stop id after the last underscore', () => {
    const stops = transformNearbyStops(obaFixture, FROM_LAT, FROM_LON);
    const codes = stops.map((s) => s.code);
    expect(codes).toContain('400936');
    expect(codes).toContain('401232');
  });

  it('resolves routeIds to non-empty deduped short names', () => {
    const stops = transformNearbyStops(obaFixture, FROM_LAT, FROM_LON);
    const stop = stops.find((s) => s.code === '400936');
    expect(stop).toBeDefined();
    expect(stop!.routes).toEqual(expect.arrayContaining(['M5', 'M7', 'M55']));
    expect(stop!.routes.length).toBe(new Set(stop!.routes).size);
  });

  it('returns an empty array for a malformed/empty response', () => {
    expect(transformNearbyStops({}, FROM_LAT, FROM_LON)).toEqual([]);
    expect(transformNearbyStops(null, FROM_LAT, FROM_LON)).toEqual([]);
    expect(transformNearbyStops(undefined, FROM_LAT, FROM_LON)).toEqual([]);
  });
});
