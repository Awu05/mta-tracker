import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/api';
import { BoardCache } from '../src/cache';
import { WeatherCache } from '../src/weatherCache';
import { MemoryBoardsRepo } from '../src/boards/memoryRepo';

function makeApp(over: Partial<Parameters<typeof createApp>[0]> = {}) {
  return createApp({
    cache: new BoardCache([], 90), repo: new MemoryBoardsRepo(), weatherCache: new WeatherCache(),
    displayMode: 'auto', compact: false, mtaApiKey: '',
    ...over,
  });
}

describe('routing', () => {
  it('GET / mints a code, sets a cookie, redirects to /b/<code>', async () => {
    const res = await request(makeApp()).get('/');
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/^\/b\/[23456789abcdefghijkmnpqrstuvwxyz]{8}$/);
    expect(res.headers['set-cookie']?.[0]).toMatch(/^board=/);
  });

  it('GET / with a valid board cookie redirects to that board', async () => {
    const res = await request(makeApp()).get('/').set('Cookie', 'board=abcdefgh');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/b/abcdefgh');
  });

  it('GET / with an invalid cookie mints a fresh code instead of looping', async () => {
    const res = await request(makeApp()).get('/').set('Cookie', 'board=not-valid');
    expect(res.status).toBe(302);
    // A fresh valid code, not the bad one (which would ping-pong with /b/:code).
    expect(res.headers.location).toMatch(/^\/b\/[23456789abcdefghijkmnpqrstuvwxyz]{8}$/);
    expect(res.headers.location).not.toBe('/b/not-valid');
    expect(res.headers['set-cookie']?.[0]).toMatch(/^board=/);
  });

  it('GET / with a malformed-percent cookie does not 500', async () => {
    const res = await request(makeApp()).get('/').set('Cookie', 'board=%');
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/^\/b\/[23456789abcdefghijkmnpqrstuvwxyz]{8}$/);
  });

  it('GET /b/<invalid code> redirects to / without persisting a junk cookie', async () => {
    const res = await request(makeApp({ staticDir: __dirname })).get('/b/INVALID!!');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/');
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('GET /b/<valid code> sets the cookie and serves the app', async () => {
    const res = await request(makeApp({ staticDir: __dirname })).get('/b/abcdefgh');
    expect(res.headers['set-cookie']?.[0]).toMatch(/^board=abcdefgh/);
  });
});
