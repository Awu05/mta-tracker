import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchBoard, addStation, removeStation, setWeather, geocode } from '../src/api';

beforeEach(() => { window.history.replaceState({}, '', '/b/code123'); });

describe('web api (board-scoped)', () => {
  it('fetchBoard GETs /api/boards/:code', async () => {
    const f = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ stations: [] }) });
    vi.stubGlobal('fetch', f);
    await fetchBoard('code123');
    expect(f).toHaveBeenCalledWith('/api/boards/code123');
  });

  it('addStation POSTs to the board, returns false on 409', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 409 }));
    expect(await addStation('code123', { id: '127', type: 'subway' })).toBe(false);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 201, json: async () => ({}) }));
    expect(await addStation('code123', { id: '127', type: 'subway' })).toBe(true);
  });

  it('removeStation DELETEs the board station', async () => {
    const f = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal('fetch', f);
    await removeStation('code123', { id: '127', type: 'subway' });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('/api/boards/code123/stations');
    expect(init.method).toBe('DELETE');
  });

  it('setWeather PUTs lat/lon', async () => {
    const f = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal('fetch', f);
    await setWeather('code123', 41, -73.5);
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('/api/boards/code123/weather');
    expect(JSON.parse(init.body)).toEqual({ lat: 41, lon: -73.5 });
  });

  it('geocode GETs /api/geocode', async () => {
    const f = vi.fn().mockResolvedValue({ ok: true, json: async () => ([{ name: 'X', admin1: '', country: '', lat: 1, lon: 2 }]) });
    vi.stubGlobal('fetch', f);
    const out = await geocode('x');
    expect(f).toHaveBeenCalledWith('/api/geocode?q=x');
    expect(out[0].name).toBe('X');
  });
});
