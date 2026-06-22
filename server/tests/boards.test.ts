import { describe, it, expect } from 'vitest';
import { generateCode } from '../src/boards/code';
import { MemoryBoardsRepo } from '../src/boards/memoryRepo';

describe('generateCode', () => {
  it('is 8 chars from the unambiguous alphabet', () => {
    for (let i = 0; i < 50; i++) {
      const c = generateCode();
      expect(c).toHaveLength(8);
      expect(c).toMatch(/^[23456789abcdefghijkmnpqrstuvwxyz]{8}$/);
    }
  });
  it('is effectively unique across many calls', () => {
    const seen = new Set(Array.from({ length: 1000 }, () => generateCode()));
    expect(seen.size).toBe(1000);
  });
});

describe('MemoryBoardsRepo', () => {
  const DEFAULTS = { lat: 40.75, lon: -73.99 };

  it('getOrCreate creates an empty board with the default location, then returns it', async () => {
    const repo = new MemoryBoardsRepo();
    const a = await repo.getOrCreate('abc', DEFAULTS);
    expect(a).toEqual({ code: 'abc', entries: [], weatherLat: 40.75, weatherLon: -73.99 });
    await repo.addEntry('abc', { id: '127', type: 'subway' });
    const b = await repo.getOrCreate('abc', { lat: 0, lon: 0 }); // existing: defaults ignored
    expect(b.entries).toEqual([{ id: '127', type: 'subway' }]);
    expect(b.weatherLat).toBe(40.75);
  });

  it('addEntry appends, dedupes (returns false), removeEntry removes', async () => {
    const repo = new MemoryBoardsRepo();
    await repo.getOrCreate('x', DEFAULTS);
    expect(await repo.addEntry('x', { id: '127', type: 'subway' })).toBe(true);
    expect(await repo.addEntry('x', { id: '127', type: 'subway' })).toBe(false);
    expect(await repo.addEntry('x', { id: '127', type: 'bus' })).toBe(true); // same id, diff type
    expect(await repo.removeEntry('x', 'subway', '127')).toBe(true);
    expect(await repo.removeEntry('x', 'subway', '127')).toBe(false);
    expect((await repo.getOrCreate('x', DEFAULTS)).entries).toEqual([{ id: '127', type: 'bus' }]);
  });

  it('setWeather updates location', async () => {
    const repo = new MemoryBoardsRepo();
    await repo.getOrCreate('x', DEFAULTS);
    await repo.setWeather('x', 41.1, -73.5);
    const b = await repo.getOrCreate('x', DEFAULTS);
    expect([b.weatherLat, b.weatherLon]).toEqual([41.1, -73.5]);
  });

  it('activeBoards returns only boards touched within the TTL', async () => {
    let t = 1_000_000;
    const repo = new MemoryBoardsRepo(() => t);
    await repo.getOrCreate('old', DEFAULTS); // touched at t
    t += 10_000;
    await repo.getOrCreate('new', DEFAULTS); // touched at t
    const active = await repo.activeBoards(5_000); // last 5s
    expect(active.map((b) => b.code)).toEqual(['new']);
  });
});
