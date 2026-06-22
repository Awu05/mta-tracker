import express, { type Express } from 'express';
import type { BoardCache } from './cache';
import type { BoardsRepo } from './boards/repo';
import type { WeatherCache } from './weatherCache';
import type { BoardEntry } from './types';
import { searchStations, getStation } from './staticGtfs';
import { fetchNearbyBusStops } from './feeds/bus';
import { geocodeLocation } from './weather';

export interface AppDeps {
  cache: BoardCache;
  repo: BoardsRepo;
  weatherCache: WeatherCache;
  defaultLat: number;
  defaultLon: number;
  displayMode: string;
  compact: boolean;
  mtaApiKey: string;
  onBoardChange?: (entry?: BoardEntry) => void;
  fetchFn?: typeof fetch;
  staticDir?: string;
}

export function createApp(deps: AppDeps): Express {
  const { cache, repo, weatherCache, defaultLat, defaultLon, displayMode, compact, mtaApiKey, onBoardChange, fetchFn, staticDir } = deps;
  const defaults = { lat: defaultLat, lon: defaultLon };

  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

  app.get('/api/boards/:code', async (req, res) => {
    const code = req.params.code;
    const board = await repo.getOrCreate(code, defaults);
    await repo.touch(code);
    // Register stations so they appear immediately; poll fills data within a cycle.
    let added = false;
    for (const e of board.entries) {
      if (cache.has(e.id)) continue;
      added = true;
      if (e.type === 'subway') {
        const info = getStation(e.id);
        cache.addStation({ id: e.id, name: info.name, type: 'subway' });
      } else {
        cache.addStation({ id: e.id, name: e.id, type: 'bus' });
      }
    }
    if (added) onBoardChange?.();
    const weather = weatherCache.get(board.weatherLat, board.weatherLon);
    const model = cache.getBoardModel(board.entries, weather, Date.now());
    res.json({ ...model, displayMode, compact, code });
  });

  app.post('/api/boards/:code/stations', async (req, res) => {
    const code = req.params.code;
    const { id, type } = (req.body ?? {}) as { id?: string; type?: string };
    if (type !== 'subway' && type !== 'bus') {
      res.status(400).json({ error: 'type must be "subway" or "bus"' });
      return;
    }
    if (type === 'bus' && !mtaApiKey) {
      res.status(400).json({ error: 'MTA_API_KEY required for bus lookup' });
      return;
    }
    if (!id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }
    // Validate + resolve a subway station name up front.
    let name = id;
    if (type === 'subway') {
      try {
        name = getStation(id).name;
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
        return;
      }
    }
    await repo.getOrCreate(code, defaults);
    const added = await repo.addEntry(code, { id, type });
    if (!added) {
      res.status(409).json({ error: 'already added' });
      return;
    }
    cache.addStation({ id, name, type });
    onBoardChange?.({ id, type });
    res.status(201).json({ ok: true });
  });

  app.delete('/api/boards/:code/stations', async (req, res) => {
    const code = req.params.code;
    const { id, type } = (req.body ?? {}) as { id?: string; type?: 'subway' | 'bus' };
    const removed = await repo.removeEntry(code, type as 'subway' | 'bus', id ?? '');
    if (!removed) {
      res.status(404).json({ error: 'not found' });
      return;
    }
    res.json({ ok: true });
  });

  app.put('/api/boards/:code/weather', async (req, res) => {
    const code = req.params.code;
    const { lat, lon } = (req.body ?? {}) as { lat?: number; lon?: number };
    if (typeof lat !== 'number' || typeof lon !== 'number' || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      res.status(400).json({ error: 'lat/lon out of range' });
      return;
    }
    await repo.getOrCreate(code, defaults);
    await repo.setWeather(code, lat, lon);
    res.json({ ok: true });
  });

  app.get('/api/geocode', async (req, res) => {
    try {
      res.json(await geocodeLocation(String(req.query.q ?? ''), fetchFn));
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get('/api/stations/search', (req, res) => {
    res.json(searchStations(String(req.query.q ?? '')));
  });

  app.get('/api/nearby-buses', async (req, res) => {
    const stationId = String(req.query.stationId ?? '');
    const code = String(req.query.code ?? '');
    let info;
    try {
      info = getStation(stationId);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      return;
    }
    if (!mtaApiKey) {
      res.status(400).json({ error: 'MTA_API_KEY required for bus lookup' });
      return;
    }
    try {
      const stops = await fetchNearbyBusStops(info.lat, info.lon, mtaApiKey, fetchFn);
      const board = code ? await repo.getOrCreate(code, defaults) : null;
      const busIds = new Set((board?.entries ?? []).filter((e) => e.type === 'bus').map((e) => e.id));
      res.json(stops.map((s) => ({ ...s, alreadyAdded: busIds.has(s.code) })));
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // (Task 8 inserts routing + static here.)

  return app;
}
