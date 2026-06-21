import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { BoardStore } from '../src/boardStore';
import { BoardCache } from '../src/cache';
import { loadEntries } from '../src/boardConfig';

const tmpDirs: string[] = [];

function makeTmpDir(name: string): string {
  const dir = path.join(os.tmpdir(), `mta-test-boardStore-${name}`);
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop()!;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('BoardStore', () => {
  it('init with a seed creates board.json and registers the seed into the cache when no file exists', () => {
    const dir = makeTmpDir('seed-init');
    const cache = new BoardCache([], 90);
    const store = new BoardStore(cache, dir);

    store.init([{ id: '127', type: 'subway' }]);

    const loaded = loadEntries(dir);
    expect(loaded).toEqual([{ id: '127', type: 'subway' }]);

    const board = cache.get(Date.now());
    const station127 = board.stations.find((s) => s.station.id === '127');
    expect(station127).toBeDefined();
    expect(station127!.type).toBe('subway');
    expect(station127!.station.name.length).toBeGreaterThan(0);
  });

  it('addEntry appends, persists, and registers in cache; duplicate add returns false', () => {
    const dir = makeTmpDir('add-entry');
    const cache = new BoardCache([], 90);
    const store = new BoardStore(cache, dir);
    store.init([{ id: '127', type: 'subway' }]);

    const added = store.addEntry({ id: '635', type: 'subway' });
    expect(added).toBe(true);
    expect(store.entries()).toHaveLength(2);

    const loaded = loadEntries(dir);
    expect(loaded).toEqual([
      { id: '127', type: 'subway' },
      { id: '635', type: 'subway' },
    ]);

    const board = cache.get(Date.now());
    expect(board.stations.find((s) => s.station.id === '635')).toBeDefined();

    const dup = store.addEntry({ id: '635', type: 'subway' });
    expect(dup).toBe(false);
    expect(store.entries()).toHaveLength(2);
  });

  it('addEntry for a bus stop registers a placeholder name and shows up in busEntries()', () => {
    const dir = makeTmpDir('add-bus');
    const cache = new BoardCache([], 90);
    const store = new BoardStore(cache, dir);
    store.init([{ id: '127', type: 'subway' }]);

    const added = store.addEntry({ id: '401687', type: 'bus' });
    expect(added).toBe(true);
    expect(store.busEntries()).toEqual([{ id: '401687', type: 'bus' }]);

    const board = cache.get(Date.now());
    const busStation = board.stations.find((s) => s.station.id === '401687');
    expect(busStation).toBeDefined();
    expect(busStation!.type).toBe('bus');
    expect(busStation!.station.name).toBe('Bus 401687');
  });

  it('removeEntry removes from entries, persists, and removes from cache', () => {
    const dir = makeTmpDir('remove-entry');
    const cache = new BoardCache([], 90);
    const store = new BoardStore(cache, dir);
    store.init([{ id: '127', type: 'subway' }]);
    store.addEntry({ id: '635', type: 'subway' });

    const removed = store.removeEntry('subway', '127');
    expect(removed).toBe(true);
    expect(store.entries()).toEqual([{ id: '635', type: 'subway' }]);

    const loaded = loadEntries(dir);
    expect(loaded).toEqual([{ id: '635', type: 'subway' }]);

    const board = cache.get(Date.now());
    expect(board.stations.find((s) => s.station.id === '127')).toBeUndefined();

    const removedAgain = store.removeEntry('subway', '127');
    expect(removedAgain).toBe(false);
  });

  it('a fresh BoardStore loads the persisted entries instead of reseeding when the file already exists', () => {
    const dir = makeTmpDir('reload');
    const cache1 = new BoardCache([], 90);
    const store1 = new BoardStore(cache1, dir);
    store1.init([{ id: '127', type: 'subway' }]);
    store1.addEntry({ id: '635', type: 'subway' });

    const cache2 = new BoardCache([], 90);
    const store2 = new BoardStore(cache2, dir);
    store2.init([]);

    expect(store2.entries()).toEqual([
      { id: '127', type: 'subway' },
      { id: '635', type: 'subway' },
    ]);

    const board = cache2.get(Date.now());
    expect(board.stations.find((s) => s.station.id === '127')).toBeDefined();
    expect(board.stations.find((s) => s.station.id === '635')).toBeDefined();
  });

  it('subwayEntries() and busEntries() filter by type', () => {
    const dir = makeTmpDir('filters');
    const cache = new BoardCache([], 90);
    const store = new BoardStore(cache, dir);
    store.init([{ id: '127', type: 'subway' }]);
    store.addEntry({ id: '401687', type: 'bus' });

    expect(store.subwayEntries()).toEqual([{ id: '127', type: 'subway' }]);
    expect(store.busEntries()).toEqual([{ id: '401687', type: 'bus' }]);
  });

  it('init skips unknown subway ids with a warning instead of crashing, and persists the cleaned list', () => {
    const dir = makeTmpDir('unknown-id');
    const cache = new BoardCache([], 90);
    const store = new BoardStore(cache, dir);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(() =>
      store.init([
        { id: '127', type: 'subway' },
        { id: 'NOT-A-REAL-STATION', type: 'subway' },
      ]),
    ).not.toThrow();

    expect(warnSpy).toHaveBeenCalled();
    const board = cache.get(Date.now());
    expect(board.stations.find((s) => s.station.id === '127')).toBeDefined();
    expect(board.stations.find((s) => s.station.id === 'NOT-A-REAL-STATION')).toBeUndefined();

    warnSpy.mockRestore();
  });
});
