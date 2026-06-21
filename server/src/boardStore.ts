import { BoardCache, type StationMeta } from './cache';
import type { BoardEntry } from './types';
import { loadEntries, saveEntries } from './boardConfig';
import { getStation } from './staticGtfs';

function metaFor(entry: BoardEntry): StationMeta {
  if (entry.type === 'subway') {
    return { id: entry.id, name: getStation(entry.id).name, type: 'subway' };
  }
  return { id: entry.id, name: `Bus ${entry.id}`, type: 'bus' };
}

export class BoardStore {
  private list: BoardEntry[] = [];

  constructor(
    private readonly cache: BoardCache,
    private readonly dataDir: string,
  ) {}

  init(seed: BoardEntry[]): void {
    const loaded = loadEntries(this.dataDir);
    const list = loaded ?? seed;

    const valid: BoardEntry[] = [];
    let droppedAny = false;
    for (const entry of list) {
      try {
        const meta = metaFor(entry);
        this.cache.addStation(meta);
        valid.push(entry);
      } catch (err) {
        droppedAny = true;
        console.warn(`[boardStore] skipping unknown ${entry.type} id "${entry.id}":`, err);
      }
    }

    this.list = valid;

    if (!loaded || droppedAny) {
      saveEntries(this.dataDir, this.list);
    }
  }

  entries(): BoardEntry[] {
    return [...this.list];
  }

  subwayEntries(): BoardEntry[] {
    return this.list.filter((e) => e.type === 'subway');
  }

  busEntries(): BoardEntry[] {
    return this.list.filter((e) => e.type === 'bus');
  }

  addEntry(entry: BoardEntry): boolean {
    if (this.list.some((e) => e.type === entry.type && e.id === entry.id)) return false;
    const meta = metaFor(entry); // let unknown subway ids throw here; caller can 400
    this.list.push(entry);
    saveEntries(this.dataDir, this.list);
    this.cache.addStation(meta);
    return true;
  }

  removeEntry(type: 'subway' | 'bus', id: string): boolean {
    const idx = this.list.findIndex((e) => e.type === type && e.id === id);
    if (idx === -1) return false;
    this.list.splice(idx, 1);
    saveEntries(this.dataDir, this.list);
    this.cache.removeStation(id);
    return true;
  }
}
