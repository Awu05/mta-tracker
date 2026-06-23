import { Pool } from 'pg';
import type { Board, BoardEntry } from '../types';
import type { BoardsRepo } from './repo';

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
    const { rows } = await this.pool.query<BoardRow>('SELECT entries FROM boards WHERE code = $1', [code]);
    if (rows.length === 0) return false;
    const entries = rows[0].entries;
    if (entries.some((e) => e.id === entry.id && e.type === entry.type)) return false;
    const next = [...entries, { id: entry.id, type: entry.type }];
    await this.pool.query('UPDATE boards SET entries = $2 WHERE code = $1', [code, JSON.stringify(next)]);
    return true;
  }

  async removeEntry(code: string, type: 'subway' | 'bus', id: string): Promise<boolean> {
    const { rows } = await this.pool.query<BoardRow>('SELECT entries FROM boards WHERE code = $1', [code]);
    if (rows.length === 0) return false;
    const next = rows[0].entries.filter((e) => !(e.id === id && e.type === type));
    if (next.length === rows[0].entries.length) return false;
    await this.pool.query('UPDATE boards SET entries = $2 WHERE code = $1', [code, JSON.stringify(next)]);
    return true;
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
