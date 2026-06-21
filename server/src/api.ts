import express, { type Express } from 'express';
import type { BoardCache } from './cache';

interface ApiOptions { displayMode: string; compact: boolean; }

export function createApp(
  cache: BoardCache,
  options: ApiOptions,
  staticDir?: string,
): Express {
  const app = express();

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/api/board', (_req, res) => {
    const board = cache.get(Date.now());
    res.json({ ...board, displayMode: options.displayMode, compact: options.compact });
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
