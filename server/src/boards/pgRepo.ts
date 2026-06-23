import { Pool } from 'pg';
import type { Board, BoardEntry } from '../types';
import { applyOrder, type BoardsRepo } from './repo';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS boards (
  code        TEXT PRIMARY KEY,
  entries     JSONB NOT NULL DEFAULT '[]',
  weather_lat DOUBLE PRECISION,
  weather_lon DOUBLE PRECISION,
  last_seen   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS boards_last_seen_idx ON boards (last_seen);
ALTER TABLE boards ALTER COLUMN weather_lat DROP NOT NULL;
ALTER TABLE boards ALTER COLUMN weather_lon DROP NOT NULL;
`;

interface BoardRow { code: string; entries: BoardEntry[]; weather_lat: number | null; weather_lon: number | null }

function toBoard(r: BoardRow): Board {
  return { code: r.code, entries: r.entries, weatherLat: r.weather_lat, weatherLon: r.weather_lon };
}

export class PgBoardsRepo implements BoardsRepo {
  constructor(private readonly pool: Pool) {}

  async init(): Promise<void> {
    await this.pool.query(SCHEMA);
  }

  async getOrCreate(code: string): Promise<Board> {
    const { rows } = await this.pool.query<BoardRow>(
      `INSERT INTO boards (code)
       VALUES ($1)
       ON CONFLICT (code) DO UPDATE SET code = EXCLUDED.code
       RETURNING code, entries, weather_lat, weather_lon`,
      [code],
    );
    return toBoard(rows[0]);
  }

  async touch(code: string): Promise<void> {
    await this.pool.query('UPDATE boards SET last_seen = now() WHERE code = $1', [code]);
  }

  async addEntry(code: string, entry: BoardEntry): Promise<boolean> {
    // Append in a single statement so concurrent adds to the same board can't
    // lose each other's writes (the old SELECT-then-UPDATE was racy). The NOT
    // EXISTS guard makes it a no-op (0 rows) when the entry is already present,
    // matching the "false if duplicate or missing board" contract.
    const { rowCount } = await this.pool.query(
      `UPDATE boards SET entries = entries || $2::jsonb
       WHERE code = $1
         AND NOT EXISTS (
           SELECT 1 FROM jsonb_array_elements(entries) e
           WHERE e->>'id' = $3 AND e->>'type' = $4)`,
      [code, JSON.stringify([{ id: entry.id, type: entry.type }]), entry.id, entry.type],
    );
    return (rowCount ?? 0) > 0;
  }

  async removeEntry(code: string, type: 'subway' | 'bus', id: string): Promise<boolean> {
    // Filter in a single statement (atomic w.r.t. concurrent writers). The
    // EXISTS guard yields 0 rows when the entry isn't present, so we still
    // return false in that case.
    const { rowCount } = await this.pool.query(
      `UPDATE boards
       SET entries = COALESCE(
         (SELECT jsonb_agg(e) FROM jsonb_array_elements(entries) e
          WHERE NOT (e->>'id' = $2 AND e->>'type' = $3)),
         '[]'::jsonb)
       WHERE code = $1
         AND EXISTS (
           SELECT 1 FROM jsonb_array_elements(entries) e
           WHERE e->>'id' = $2 AND e->>'type' = $3)`,
      [code, id, type],
    );
    return (rowCount ?? 0) > 0;
  }

  async setWeather(code: string, lat: number, lon: number): Promise<void> {
    await this.pool.query('UPDATE boards SET weather_lat = $2, weather_lon = $3 WHERE code = $1', [code, lat, lon]);
  }

  async activeBoards(ttlMs: number): Promise<Board[]> {
    const { rows } = await this.pool.query<BoardRow>(
      `SELECT code, entries, weather_lat, weather_lon FROM boards
       WHERE last_seen > now() - ($1::double precision * interval '1 millisecond')`,
      [ttlMs],
    );
    return rows.map(toBoard);
  }

  async reorderEntries(code: string, order: BoardEntry[]): Promise<boolean> {
    // Reorder needs to read the current entries, sort them in JS, then write
    // back — so lock the row FOR UPDATE inside a transaction. Without the lock a
    // concurrent addEntry could land between our read and write and be dropped
    // by the stale snapshot we write back.
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query<BoardRow>('SELECT entries FROM boards WHERE code = $1 FOR UPDATE', [code]);
      if (rows.length === 0) {
        await client.query('ROLLBACK');
        return false;
      }
      const next = applyOrder(rows[0].entries, order);
      await client.query('UPDATE boards SET entries = $2 WHERE code = $1', [code, JSON.stringify(next)]);
      await client.query('COMMIT');
      return true;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

export async function createPgRepo(databaseUrl: string): Promise<PgBoardsRepo> {
  const pool = new Pool({ connectionString: databaseUrl });
  // Retry the first connection so we tolerate Postgres still starting up.
  let lastErr: unknown;
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      await pool.query('SELECT 1');
      const repo = new PgBoardsRepo(pool);
      await repo.init();
      return repo;
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  await pool.end();
  throw new Error(`Could not connect to Postgres after retries: ${String(lastErr)}`);
}
