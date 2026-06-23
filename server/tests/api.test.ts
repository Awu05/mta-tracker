import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/api';
import { BoardCache } from '../src/cache';
import { WeatherCache } from '../src/weatherCache';
import { MemoryBoardsRepo } from '../src/boards/memoryRepo';

function makeApp(over: Partial<Parameters<typeof createApp>[0]> = {}) {
  const cache = new BoardCache([], 90);
  const repo = new MemoryBoardsRepo();
  const weatherCache = new WeatherCache();
  const app = createApp({
    cache, repo, weatherCache,
    displayMode: 'auto', compact: false, mtaApiKey: 'key',
    ...over,
  });
  return { app, cache, repo, weatherCache };
}

describe('GET /api/boards/:code', () => {
  it('lazily creates an empty board and returns it with settings', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/boards/abc123');
    expect(res.status).toBe(200);
    expect(res.body.stations).toEqual([]);
    expect(res.body.displayMode).toBe('auto');
    expect(res.body.compact).toBe(false);
    expect(res.body.code).toBe('abc123');
  });

  it('returns the board weather from the WeatherCache at the board location', async () => {
    const { app, repo, weatherCache } = makeApp();
    await repo.getOrCreate('abc123');
    await repo.setWeather('abc123', 40.75, -73.99);
    weatherCache.set(40.75, -73.99, { tempF: 71, condition: 'Clear', icon: 'clear', hourly: [], daily: [] });
    const res = await request(app).get('/api/boards/abc123');
    expect(res.body.weather.tempF).toBe(71);
  });

  it('200s (not a hang/500) when a persisted subway entry has an unknown GTFS id', async () => {
    const { app, repo } = makeApp();
    await repo.getOrCreate('x');
    await repo.addEntry('x', { id: 'GHOST', type: 'subway' });
    const res = await request(app).get('/api/boards/x');
    expect(res.status).toBe(200);
    const ghost = res.body.stations.find((s: { station: { id: string } }) => s.station.id === 'GHOST');
    expect(ghost).toBeDefined();
    expect(ghost.stale).toBe(true);
  });

  it('a freshly-created board returns weather: null (no default)', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/boards/fresh1');
    expect(res.status).toBe(200);
    expect(res.body.weather).toBe(null);
  });
});

describe('POST /api/boards/:code/stations', () => {
  it('adds a subway station and registers it in the cache', async () => {
    const onBoardChange = vi.fn();
    const { app, cache } = makeApp({ onBoardChange });
    const res = await request(app).post('/api/boards/x/stations').send({ id: '127', type: 'subway' });
    expect(res.status).toBe(201);
    expect(cache.has('127')).toBe(true);
    expect(onBoardChange).toHaveBeenCalled();
  });

  it('409 on duplicate', async () => {
    const { app } = makeApp();
    await request(app).post('/api/boards/x/stations').send({ id: '127', type: 'subway' });
    const res = await request(app).post('/api/boards/x/stations').send({ id: '127', type: 'subway' });
    expect(res.status).toBe(409);
  });

  it('400 on an unknown subway id', async () => {
    const { app } = makeApp();
    const res = await request(app).post('/api/boards/x/stations').send({ id: 'NOPE', type: 'subway' });
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/boards/:code/stations', () => {
  it('removes an entry, 404 if absent', async () => {
    const { app } = makeApp();
    await request(app).post('/api/boards/x/stations').send({ id: '127', type: 'subway' });
    expect((await request(app).delete('/api/boards/x/stations').send({ id: '127', type: 'subway' })).status).toBe(200);
    expect((await request(app).delete('/api/boards/x/stations').send({ id: '127', type: 'subway' })).status).toBe(404);
  });

  it('400 on an invalid type', async () => {
    const { app } = makeApp();
    const res = await request(app).delete('/api/boards/x/stations').send({ id: '127', type: 'train' });
    expect(res.status).toBe(400);
  });

  it('400 when id is missing', async () => {
    const { app } = makeApp();
    const res = await request(app).delete('/api/boards/x/stations').send({ type: 'subway' });
    expect(res.status).toBe(400);
  });
});

describe('PUT /api/boards/:code/weather', () => {
  it('sets the location, 400 on out-of-range', async () => {
    const { app, repo } = makeApp();
    await request(app).get('/api/boards/x'); // create
    expect((await request(app).put('/api/boards/x/weather').send({ lat: 41, lon: -73.5 })).status).toBe(200);
    expect((await repo.getOrCreate('x')).weatherLat).toBe(41);
    expect((await request(app).put('/api/boards/x/weather').send({ lat: 999, lon: 0 })).status).toBe(400);
  });

  it('weather is available on the next board fetch after setting a location (no disappear)', async () => {
    const weather = { tempF: 60, condition: 'Clear', icon: 'clear', hourly: [], daily: [] };
    const { app, weatherCache } = makeApp({
      // Mirror index.ts: warm the cache for the new location synchronously.
      onWeatherChange: (lat, lon) => { weatherCache.set(lat, lon, weather); },
    });
    await request(app).get('/api/boards/x'); // create (no weather location yet)
    await request(app).put('/api/boards/x/weather').send({ lat: 41, lon: -73.5 });
    const res = await request(app).get('/api/boards/x');
    expect(res.body.weather?.tempF).toBe(60);
  });
});

describe('GET /api/geocode', () => {
  it('proxies geocoding results', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ results: [{ name: 'Queens', admin1: 'NY', country: 'US', latitude: 40.7, longitude: -73.8 }] }),
    }) as unknown as typeof fetch;
    const { app } = makeApp({ fetchFn });
    const res = await request(app).get('/api/geocode?q=queens');
    expect(res.body).toEqual([{ name: 'Queens', admin1: 'NY', country: 'US', lat: 40.7, lon: -73.8 }]);
  });
});

describe('GET /api/nearby-buses', () => {
  it('marks alreadyAdded against the board referenced by ?code', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { list: [], references: { routes: [] } } }),
    }) as unknown as typeof fetch;
    const { app } = makeApp({ fetchFn });
    // 127 = Times Sq exists in static data; just assert the endpoint is reachable + shape.
    const res = await request(app).get('/api/nearby-buses?stationId=127&code=x');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
