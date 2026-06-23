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
  displayMode: string;
  compact: boolean;
  mtaApiKey: string;
  onBoardChange?: (entry?: BoardEntry) => void;
  /** Called after a board's weather location changes so the new location's
   *  weather can be fetched/cached immediately (awaited) rather than waiting
   *  for the next scheduled weather poll. */
  onWeatherChange?: (lat: number, lon: number) => Promise<void> | void;
  fetchFn?: typeof fetch;
  staticDir?: string;
}

function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) {
      // A malformed percent-encoding (e.g. a tampered "board=%") would otherwise
      // throw URIError and 500 the landing page; treat it as no cookie.
      try { return decodeURIComponent(v.join('=')); } catch { return null; }
    }
  }
  return null;
}

const COOKIE_MAX_AGE = 'Max-Age=31536000; Path=/; SameSite=Lax';

export function createApp(deps: AppDeps): Express {
  const { cache, repo, weatherCache, displayMode, compact, mtaApiKey, onBoardChange, onWeatherChange, fetchFn, staticDir } = deps;

  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

  // Reject malformed board codes on every /api/boards/:code route up front, so a
  // crawler hitting random paths can't lazily create (and keep "active") unbounded
  // junk board rows. The HTML /b/:code route does its own validation + redirect.
  app.use('/api/boards/:code', (req, res, next) => {
    if (!isValidCode(req.params.code)) {
      res.status(400).json({ error: 'invalid board code' });
      return;
    }
    next();
  });

  app.get('/api/boards/:code', async (req, res) => {
    const code = req.params.code;
    const board = await repo.getOrCreate(code);
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
        // The friendly stop name only arrives with the first SIRI poll; show a
        // recognizable "Bus <code>" placeholder until then instead of a bare id.
        cache.addStation({ id: e.id, name: `Bus ${e.id}`, type: 'bus' });
      }
      added = true;
    }
    if (added) onBoardChange?.();
    const loc = board.weatherLat !== null && board.weatherLon !== null
      ? { lat: board.weatherLat, lon: board.weatherLon }
      : null;
    const weather = loc ? weatherCache.get(loc.lat, loc.lon) : null;
    // Self-heal: a set location with no cached weather (cold start, or a warm
    // that failed) would otherwise show a permanent gap. Kick a fetch so the
    // next poll/reload fills it rather than relying on the write path alone.
    if (loc && weather === null) void onWeatherChange?.(loc.lat, loc.lon);
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
    // Validate + resolve a subway station name up front; buses get a
    // "Bus <code>" placeholder until their first poll resolves the real name.
    let name = type === 'bus' ? `Bus ${id}` : id;
    if (type === 'subway') {
      try {
        name = getStation(id).name;
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
        return;
      }
    }
    await repo.getOrCreate(code);
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

  app.put('/api/boards/:code/stations/order', async (req, res) => {
    const code = req.params.code;
    const { order } = (req.body ?? {}) as { order?: unknown };
    if (!Array.isArray(order) ||
        !order.every((e) => e && typeof (e as any).id === 'string' && ((e as any).type === 'subway' || (e as any).type === 'bus'))) {
      res.status(400).json({ error: 'order must be an array of { id, type }' });
      return;
    }
    await repo.getOrCreate(code);
    await repo.reorderEntries(code, order as BoardEntry[]);
    res.json({ ok: true });
  });

  app.put('/api/boards/:code/weather', async (req, res) => {
    const code = req.params.code;
    const { lat, lon } = (req.body ?? {}) as { lat?: number; lon?: number };
    if (typeof lat !== 'number' || typeof lon !== 'number' || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      res.status(400).json({ error: 'lat/lon out of range' });
      return;
    }
    await repo.getOrCreate(code);
    await repo.setWeather(code, lat, lon);
    // Warm the cache for the new location before responding so the client's
    // immediate reload shows weather instead of a gap until the next poll.
    await onWeatherChange?.(lat, lon);
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
      const board = code && isValidCode(code) ? await repo.getOrCreate(code) : null;
      const busIds = new Set((board?.entries ?? []).filter((e) => e.type === 'bus').map((e) => e.id));
      res.json(stops.map((s) => ({ ...s, alreadyAdded: busIds.has(s.code) })));
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get('/', (req, res) => {
    const existing = readCookie(req.headers.cookie, 'board');
    // Only reuse the cookie if it holds a valid code. A stale/tampered cookie
    // would otherwise redirect to /b/<bad>, which redirects back to / — an
    // infinite loop, since /b/:code doesn't clear the bad cookie. Minting a
    // fresh code (and overwriting the cookie) breaks that loop.
    const valid = existing !== null && isValidCode(existing);
    const code = valid ? existing : generateCode();
    if (!valid) res.setHeader('Set-Cookie', `board=${code}; ${COOKIE_MAX_AGE}`);
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
