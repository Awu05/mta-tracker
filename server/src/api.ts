import express, { type Express } from 'express';
import type { BoardCache } from './cache';
import type { BoardsRepo } from './boards/repo';
import type { WeatherCache } from './weatherCache';
import type { BoardEntry } from './types';
import { searchStations, getStation } from './staticGtfs';
import { fetchNearbyBusStops } from './feeds/bus';
import { geocodeLocation } from './weather';
import { generateCode, isValidCode } from './boards/code';

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

function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

const COOKIE_MAX_AGE = 'Max-Age=31536000; Path=/; SameSite=Lax';

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
      if (e.type === 'subway') {
        let info;
        try {
          info = getStation(e.id);
        } catch {
          continue;
        }
        cache.addStation({ id: e.id, name: info.name, type: 'subway' });
      } else {
        cache.addStation({ id: e.id, name: e.id, type: 'bus' });
      }
      added = true;
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
    const { id, type } = (req.body ?? {}) as { id?: string; type?: string };
    if (type !== 'subway' && type !== 'bus') {
      res.status(400).json({ error: 'type must be "subway" or "bus"' });
      return;
    }
    if (!id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }
    const removed = await repo.removeEntry(code, type, id);
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

  app.get('/', (req, res) => {
    const existing = readCookie(req.headers.cookie, 'board');
    const code = existing ?? generateCode();
    if (!existing) res.setHeader('Set-Cookie', `board=${code}; ${COOKIE_MAX_AGE}`);
    res.redirect(302, `/b/${code}`);
  });

  if (staticDir) {
    app.get('/b/:code', (req, res) => {
      if (!isValidCode(req.params.code)) {
        res.redirect(302, '/');
        return;
      }
      res.setHeader('Set-Cookie', `board=${encodeURIComponent(req.params.code)}; ${COOKIE_MAX_AGE}`);
      res.sendFile('index.html', { root: staticDir });
    });
    app.use(express.static(staticDir));
    app.get(/^(?!\/api).*/, (_req, res) => res.sendFile('index.html', { root: staticDir }));
  }

  return app;
}
