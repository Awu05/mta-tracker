import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { createApp, type AppDeps } from '../src/api';
import { BoardCache } from '../src/cache';
import { BoardStore } from '../src/boardStore';

const obaFixture = JSON.parse(
  readFileSync(path.join(__dirname, 'fixtures/oba-stops-for-location.json'), 'utf-8'),
);

describe('API', () => {
  let dataDir: string;
  let cache: BoardCache;
  let store: BoardStore;
  let onBoardChange: ReturnType<typeof vi.fn>;
  let fetchFn: ReturnType<typeof vi.fn>;

  function buildApp(overrides: Partial<AppDeps> = {}) {
    return createApp({
      cache,
      store,
      displayMode: 'kiosk',
      compact: false,
      mtaApiKey: 'TESTKEY',
      onBoardChange,
      fetchFn,
      ...overrides,
    });
  }

  beforeEach(() => {
    dataDir = mkdtempSync(path.join(tmpdir(), 'mta-tracker-api-test-'));
    cache = new BoardCache([], 90);
    store = new BoardStore(cache, dataDir);
    store.init([{ id: '127', type: 'subway' }]);
    onBoardChange = vi.fn();
    fetchFn = vi.fn(async () => ({
      ok: true,
      json: async () => obaFixture,
    })) as unknown as ReturnType<typeof vi.fn>;
  });

  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('GET /api/health returns ok', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('GET /api/board returns the cached multi-station board with displayMode and compact', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/board');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.stations)).toBe(true);
    expect(res.body.displayMode).toBe('kiosk');
    expect(res.body.compact).toBe(false);
  });

  it('GET /api/stations/search?q=times returns matches', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/stations/search').query({ q: 'times' });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body.some((r: { name: string }) => /times/i.test(r.name))).toBe(true);
  });

  describe('POST /api/board/stations', () => {
    it('adds a subway entry, returns 201 with entries, and fires onBoardChange', async () => {
      const app = buildApp();
      const res = await request(app).post('/api/board/stations').send({ id: '635', type: 'subway' });
      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
      expect(res.body.entries.some((e: { id: string }) => e.id === '635')).toBe(true);
      expect(onBoardChange).toHaveBeenCalledTimes(1);
    });

    it('returns 409 when adding the same entry twice', async () => {
      const app = buildApp();
      await request(app).post('/api/board/stations').send({ id: '635', type: 'subway' });
      const res = await request(app).post('/api/board/stations').send({ id: '635', type: 'subway' });
      expect(res.status).toBe(409);
    });

    it('returns 400 for an unknown subway id', async () => {
      const app = buildApp();
      const res = await request(app).post('/api/board/stations').send({ id: 'ZZZ', type: 'subway' });
      expect(res.status).toBe(400);
    });

    it('returns 400 for a bogus type', async () => {
      const app = buildApp();
      const res = await request(app).post('/api/board/stations').send({ id: 'x', type: 'bogus' });
      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /api/board/stations', () => {
    it('removes an existing entry', async () => {
      const app = buildApp();
      await request(app).post('/api/board/stations').send({ id: '635', type: 'subway' });
      const res = await request(app).delete('/api/board/stations').send({ id: '635', type: 'subway' });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('returns 404 when removing a non-existent entry', async () => {
      const app = buildApp();
      const res = await request(app).delete('/api/board/stations').send({ id: '635', type: 'subway' });
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/nearby-buses', () => {
    it('returns nearby stops with alreadyAdded flag', async () => {
      const app = buildApp();
      const res = await request(app).get('/api/nearby-buses').query({ stationId: '127' });
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
      for (const item of res.body) {
        expect(typeof item.code).toBe('string');
        expect(typeof item.name).toBe('string');
        expect(Array.isArray(item.routes)).toBe(true);
        expect(typeof item.distanceMeters).toBe('number');
        expect(typeof item.alreadyAdded).toBe('boolean');
      }
    });

    it('returns 400 when mtaApiKey is empty', async () => {
      const app = buildApp({ mtaApiKey: '' });
      const res = await request(app).get('/api/nearby-buses').query({ stationId: '127' });
      expect(res.status).toBe(400);
    });
  });
});
