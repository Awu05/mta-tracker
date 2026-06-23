import { describe, it, expect } from 'vitest';
import { createPgRepo } from '../src/boards/pgRepo';

const url = process.env.DATABASE_URL;
const maybe = url ? describe : describe.skip;

maybe('PgBoardsRepo (integration, needs DATABASE_URL)', () => {
  it('persists boards, entries, weather, and TTL filtering', async () => {
    const repo = await createPgRepo(url as string);
    const code = `test_${Date.now()}`;
    const b = await repo.getOrCreate(code);
    expect(b.entries).toEqual([]);
    expect(b.weatherLat).toBe(null);
    expect(b.weatherLon).toBe(null);
    expect(await repo.addEntry(code, { id: '127', type: 'subway' })).toBe(true);
    expect(await repo.addEntry(code, { id: '127', type: 'subway' })).toBe(false);
    await repo.setWeather(code, 41.0, -73.5);
    const again = await repo.getOrCreate(code);
    expect(again.entries).toEqual([{ id: '127', type: 'subway' }]);
    expect([again.weatherLat, again.weatherLon]).toEqual([41, -73.5]);
    await repo.touch(code);
    const active = await repo.activeBoards(60_000);
    expect(active.some((x) => x.code === code)).toBe(true);
    expect(await repo.removeEntry(code, 'subway', '127')).toBe(true);
  });
});
