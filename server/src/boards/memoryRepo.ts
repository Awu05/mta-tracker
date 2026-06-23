import type { Board, BoardEntry } from '../types';
import type { BoardsRepo } from './repo';

interface Row extends Board {
  lastSeenMs: number;
}

export class MemoryBoardsRepo implements BoardsRepo {
  private readonly rows = new Map<string, Row>();
  constructor(private readonly now: () => number = () => Date.now()) {}

  private snapshot(r: Row): Board {
    return { code: r.code, entries: r.entries.map((e) => ({ ...e })), weatherLat: r.weatherLat, weatherLon: r.weatherLon };
  }

  async getOrCreate(code: string): Promise<Board> {
    let r = this.rows.get(code);
    if (!r) {
      r = { code, entries: [], weatherLat: null, weatherLon: null, lastSeenMs: this.now() };
      this.rows.set(code, r);
    }
    return this.snapshot(r);
  }

  async touch(code: string): Promise<void> {
    const r = this.rows.get(code);
    if (r) r.lastSeenMs = this.now();
  }

  async addEntry(code: string, entry: BoardEntry): Promise<boolean> {
    const r = this.rows.get(code);
    if (!r) return false;
    if (r.entries.some((e) => e.id === entry.id && e.type === entry.type)) return false;
    r.entries.push({ id: entry.id, type: entry.type });
    return true;
  }

  async removeEntry(code: string, type: 'subway' | 'bus', id: string): Promise<boolean> {
    const r = this.rows.get(code);
    if (!r) return false;
    const before = r.entries.length;
    r.entries = r.entries.filter((e) => !(e.id === id && e.type === type));
    return r.entries.length !== before;
  }

  async setWeather(code: string, lat: number, lon: number): Promise<void> {
    const r = this.rows.get(code);
    if (r) { r.weatherLat = lat; r.weatherLon = lon; }
  }

  async activeBoards(ttlMs: number): Promise<Board[]> {
    const cutoff = this.now() - ttlMs;
    return [...this.rows.values()].filter((r) => r.lastSeenMs > cutoff).map((r) => this.snapshot(r));
  }

  async reorderEntries(code: string, order: BoardEntry[]): Promise<boolean> {
    const r = this.rows.get(code);
    if (!r) return false;
    const key = (e: BoardEntry) => `${e.type}:${e.id}`;
    const rank = new Map(order.map((e, i) => [key(e), i] as const));
    r.entries = [...r.entries].sort((a, b) =>
      (rank.get(key(a)) ?? Infinity) - (rank.get(key(b)) ?? Infinity));
    return true;
  }
}
