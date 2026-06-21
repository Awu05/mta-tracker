import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/api';
import { BoardCache } from '../src/cache';

describe('API', () => {
  const cache = new BoardCache([{ id: '127', name: 'Times Sq–42 St' }], 90);
  const app = createApp(cache, { displayMode: 'kiosk', compact: false }, undefined);

  it('GET /api/health returns ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('GET /api/board returns the cached multi-station board with displayMode', async () => {
    const res = await request(app).get('/api/board');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.stations)).toBe(true);
    expect(res.body.stations[0].station.id).toBe('127');
    expect(res.body.stations[0].type).toBe('subway');
    expect(Array.isArray(res.body.stations[0].arrivals)).toBe(true);
    expect(res.body.displayMode).toBe('kiosk');
    expect(res.body.compact).toBe(false);
    expect('weather' in res.body).toBe(true);
  });
});
