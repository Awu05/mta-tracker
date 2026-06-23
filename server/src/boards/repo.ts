import type { Board, BoardEntry } from '../types';

export interface BoardsRepo {
  /** Fetch a board; create an empty one (no weather location) if the code is unknown. */
  getOrCreate(code: string): Promise<Board>;
  /** Mark the board as recently seen. */
  touch(code: string): Promise<void>;
  /** Append the entry if absent; false if it was already present. */
  addEntry(code: string, entry: BoardEntry): Promise<boolean>;
  /** Remove the entry; false if it was not present. */
  removeEntry(code: string, type: 'subway' | 'bus', id: string): Promise<boolean>;
  /** Set the board's weather location. */
  setWeather(code: string, lat: number, lon: number): Promise<void>;
  /** Boards whose last_seen is within `ttlMs` of now. */
  activeBoards(ttlMs: number): Promise<Board[]>;
  /** Reorder the board's entries to match `order` (matched by id+type). Entries not
   *  present in `order` keep their relative order at the end. Returns false if the
   *  board doesn't exist. */
  reorderEntries(code: string, order: BoardEntry[]): Promise<boolean>;
}
