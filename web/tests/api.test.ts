import { describe, it, expect, vi } from 'vitest';
import { fetchBoard } from '../src/api';

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
