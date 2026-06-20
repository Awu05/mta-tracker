import { describe, it, expect, vi } from 'vitest';
import { fetchBoard } from '../src/api';

describe('fetchBoard', () => {
  it('GETs /api/board and returns the parsed board', async () => {
    const board = { station: { id: '127', name: 'Times Sq' }, directions: [], alerts: [], weather: null, stale: false, updatedAt: '', displayMode: 'kiosk' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => board }));
    const result = await fetchBoard();
    expect(result.station.id).toBe('127');
    expect(fetch).toHaveBeenCalledWith('/api/board');
  });

  it('throws on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    await expect(fetchBoard()).rejects.toThrow(/500/);
  });
});
