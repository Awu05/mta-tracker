import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/api';
import { BoardCache } from '../src/cache';

describe('API', () => {
  const cache = new BoardCache({ id: '127', name: 'Times Sq–42 St' }, 90);
  const app = createApp(cache, { displayMode: 'kiosk' }, undefined);

  it('GET /api/health returns ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('GET /api/board returns the cached board with displayMode', async () => {
    const res = await request(app).get('/api/board');
    expect(res.status).toBe(200);
    expect(res.body.station.id).toBe('127');
    expect(res.body.displayMode).toBe('kiosk');
    expect(Array.isArray(res.body.directions)).toBe(true);
  });
});
