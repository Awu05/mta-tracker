import express, { type Express } from 'express';
import type { BoardCache } from './cache';
import type { BoardStore } from './boardStore';
import type { BoardEntry } from './types';
import { searchStations, getStation } from './staticGtfs';
import { fetchNearbyBusStops } from './feeds/bus';

export interface AppDeps {
  cache: BoardCache;
  store: BoardStore;
  displayMode: string;
  compact: boolean;
  mtaApiKey: string;
  onBoardChange?: (entry?: BoardEntry) => void; // fire-and-forget hook to trigger an immediate poll after an add
  fetchFn?: typeof fetch; // for nearby-buses (default: global fetch)
  staticDir?: string;
}

export function createApp(deps: AppDeps): Express {
  const { cache, store, displayMode, compact, mtaApiKey, onBoardChange, fetchFn, staticDir } = deps;

  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/api/board', (_req, res) => {
    const board = cache.get(Date.now());
    res.json({ ...board, displayMode, compact });
  });

  app.get('/api/stations/search', (req, res) => {
    const results = searchStations(String(req.query.q ?? ''));
    res.json(results);
  });

  app.get('/api/nearby-buses', async (req, res) => {
    const stationId = String(req.query.stationId ?? '');
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
      const busIds = new Set(store.busEntries().map((e) => e.id));
      res.json(stops.map((s) => ({ ...s, alreadyAdded: busIds.has(s.code) })));
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post('/api/board/stations', (req, res) => {
    const { id, type } = (req.body ?? {}) as { id?: string; type?: string };

    if (type !== 'subway' && type !== 'bus') {
      res.status(400).json({ error: 'type must be "subway" or "bus"' });
      return;
    }

    if (type === 'bus') {
      if (!mtaApiKey) {
        res.status(400).json({ error: 'MTA_API_KEY required for bus lookup' });
        return;
      }
      if (!id) {
        res.status(400).json({ error: 'id is required' });
        return;
      }
    }

    let added: boolean;
    try {
      added = store.addEntry({ id: id ?? '', type });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      return;
    }

    if (!added) {
      res.status(409).json({ error: 'already added' });
      return;
    }

    onBoardChange?.({ id: id ?? '', type });
    res.status(201).json({ ok: true, entries: store.entries() });
  });

  app.delete('/api/board/stations', (req, res) => {
    const { id, type } = (req.body ?? {}) as { id?: string; type?: 'subway' | 'bus' };
    const removed = store.removeEntry(type as 'subway' | 'bus', id ?? '');
    if (!removed) {
      res.status(404).json({ error: 'not found' });
      return;
    }
    res.json({ ok: true, entries: store.entries() });
  });

  if (staticDir) {
    app.use(express.static(staticDir));
    // SPA fallback for non-API routes
    app.get(/^(?!\/api).*/, (_req, res) => {
      res.sendFile('index.html', { root: staticDir });
    });
  }

  return app;
}
