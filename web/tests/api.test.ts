import { describe, it, expect, vi } from 'vitest';
import { fetchBoard, searchStations, fetchNearbyBuses, addStation, removeStation } from '../src/api';

describe('fetchBoard', () => {
  it('GETs /api/board and returns the parsed board', async () => {
    const board = { stations: [], weather: null, stale: false, updatedAt: '', displayMode: 'kiosk', compact: false };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => board }));
    const result = await fetchBoard();
    expect(result.stations).toEqual([]);
    expect(fetch).toHaveBeenCalledWith('/api/board');
  });

  it('throws on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    await expect(fetchBoard()).rejects.toThrow(/500/);
  });
});

describe('searchStations', () => {
  it('GETs /api/stations/search with an encoded query and returns the parsed array', async () => {
    const results = [{ id: '127', name: 'Times Sq-42 St', routes: ['1', '2', '3'] }];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => results }));
    const result = await searchStations('times');
    expect(result).toEqual(results);
    expect(fetch).toHaveBeenCalledWith('/api/stations/search?q=times');
  });

  it('returns [] without calling fetch for an empty query', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const result = await searchStations('');
    expect(result).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    await expect(searchStations('times')).rejects.toThrow(/500/);
  });
});

describe('fetchNearbyBuses', () => {
  it('GETs /api/nearby-buses with the encoded stationId', async () => {
    const stops = [{ code: '401687', name: '1 AV/E 14 ST', routes: ['M14'], distanceMeters: 80, alreadyAdded: false }];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => stops }));
    const result = await fetchNearbyBuses('127');
    expect(result).toEqual(stops);
    expect(fetch).toHaveBeenCalledWith('/api/nearby-buses?stationId=127');
  });
});

describe('addStation', () => {
  it('POSTs to /api/board/stations with a JSON body and Content-Type header', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 201, json: async () => ({ ok: true, entries: [] }) });
    vi.stubGlobal('fetch', fetchMock);
    await addStation({ id: '635', type: 'subway' });
    expect(fetchMock).toHaveBeenCalledWith('/api/board/stations', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
    }));
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toEqual({ id: '635', type: 'subway' });
  });

  it('resolves false when the station is already on the board (409)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 409 }));
    await expect(addStation({ id: '635', type: 'subway' })).resolves.toBe(false);
  });

  it('resolves true when newly added (201)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 201, json: async () => ({ ok: true }) }));
    await expect(addStation({ id: '635', type: 'subway' })).resolves.toBe(true);
  });

  it('throws on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    await expect(addStation({ id: '635', type: 'subway' })).rejects.toThrow(/500/);
  });
});

describe('removeStation', () => {
  it('DELETEs to /api/board/stations with a JSON body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true, entries: [] }) });
    vi.stubGlobal('fetch', fetchMock);
    await removeStation({ id: '635', type: 'subway' });
    expect(fetchMock).toHaveBeenCalledWith('/api/board/stations', expect.objectContaining({
      method: 'DELETE',
      headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
    }));
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toEqual({ id: '635', type: 'subway' });
  });

  it('throws on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    await expect(removeStation({ id: '635', type: 'subway' })).rejects.toThrow(/404/);
  });
});
