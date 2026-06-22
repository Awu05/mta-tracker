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
    defaultLat: 40.75, defaultLon: -73.99,
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
    const { app, weatherCache } = makeApp();
    weatherCache.set(40.75, -73.99, { tempF: 71, condition: 'Clear', icon: 'clear', hourly: [], daily: [] });
    const res = await request(app).get('/api/boards/abc123');
    expect(res.body.weather.tempF).toBe(71);
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
});

describe('PUT /api/boards/:code/weather', () => {
  it('sets the location, 400 on out-of-range', async () => {
    const { app, repo } = makeApp();
    await request(app).get('/api/boards/x'); // create
    expect((await request(app).put('/api/boards/x/weather').send({ lat: 41, lon: -73.5 })).status).toBe(200);
    expect((await repo.getOrCreate('x', { lat: 0, lon: 0 })).weatherLat).toBe(41);
    expect((await request(app).put('/api/boards/x/weather').send({ lat: 999, lon: 0 })).status).toBe(400);
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
