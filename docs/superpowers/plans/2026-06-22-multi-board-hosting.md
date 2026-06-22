# Multi-Board Hosting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the single-shared-board app into a multi-tenant one where every device gets its own board (stations + weather location) addressed by an unguessable code in the URL (`/b/:code`), with board configs persisted in Postgres.

**Architecture:** Per-station arrival/alert data stays in one shared in-memory `BoardCache`; weather lives in a new in-memory `WeatherCache` keyed by location. Board configs (`code → {entries, weatherLat, weatherLon, lastSeen}`) persist in Postgres via a `BoardsRepo` (Postgres impl in prod, in-memory impl for dev/tests). Pollers run over the union of *active* boards each cycle.

**Tech Stack:** Node 20 + TypeScript (CommonJS), Express, `pg` (node-postgres), Vitest/Supertest; React 18 + Vite; Postgres 16; Docker Compose.

## Global Constraints

- Server compiles to **CommonJS** — no ESM-only syntax; `__dirname`; plain JSON imports.
- Persistence is **Postgres** via the pure-JS `pg` driver (no native modules). If `DATABASE_URL` is unset, the server uses `MemoryBoardsRepo` (so dev/tests need no DB).
- Board code: **8 chars** from the alphabet `23456789abcdefghijkmnpqrstuvwxyz` (no ambiguous 0/o/1/l), generated with `crypto.randomBytes`.
- Icon/condition slugs and all existing feed behavior are unchanged.
- Drop entirely: `STATION`, `BUS_STOPS`, `DATA_DIR`, `board.json`, `BoardStore`, `boardConfig`, and the global `GET /api/board` + `/api/board/stations` routes.
- `ACTIVE_TTL_DAYS` default **7**. Weather location dedup rounds lat/lon to **3 decimals**.
- Temperatures whole °F; existing weather forecast shape unchanged.
- Tests must pass with **no database** (use `MemoryBoardsRepo`); the one Postgres integration test **skips when `DATABASE_URL` is unset**.

---

### Task 1: Config + Board type (drop single-board env, add DB/TTL)

**Files:**
- Modify: `server/src/types.ts`
- Modify: `server/src/config.ts`
- Test: `server/tests/config.test.ts`

**Interfaces:**
- Produces: `interface Board { code: string; entries: BoardEntry[]; weatherLat: number; weatherLon: number }`
- Produces: `AppConfig` now `{ displayMode, weatherLat, weatherLon, feedRefreshSec, alertsRefreshSec, weatherRefreshSec, staleThresholdSec, mtaApiKey, port, compact, databaseUrl: string, activeTtlMs: number }` (no `stations`/`busStops`/`dataDir`).

- [ ] **Step 1: Update the types**

In `server/src/types.ts`, replace the `AppConfig` interface and add `Board`:

```ts
export interface Board {
  code: string;
  entries: BoardEntry[];
  weatherLat: number;
  weatherLon: number;
}

export interface AppConfig {
  displayMode: 'kiosk' | 'phone' | 'auto';
  weatherLat: number;
  weatherLon: number;
  feedRefreshSec: number;
  alertsRefreshSec: number;
  weatherRefreshSec: number;
  staleThresholdSec: number;
  mtaApiKey: string;
  port: number;
  compact: boolean;
  databaseUrl: string;
  activeTtlMs: number;
}
```

Leave `BoardEntry`, `Arrival`, `Alert`, `Weather`, `StationBoard`, `BoardModel`, etc. unchanged.

- [ ] **Step 2: Rewrite the config tests**

Replace `server/tests/config.test.ts` with:

```ts
import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config';

describe('loadConfig', () => {
  it('applies defaults with an empty environment', () => {
    const c = loadConfig({});
    expect(c.displayMode).toBe('auto');
    expect(c.port).toBe(8080);
    expect(c.weatherLat).toBeCloseTo(40.7128);
    expect(c.databaseUrl).toBe('');
    expect(c.activeTtlMs).toBe(7 * 24 * 60 * 60 * 1000);
    expect(c.mtaApiKey).toBe('');
    expect(c.compact).toBe(false);
  });

  it('reads DATABASE_URL and ACTIVE_TTL_DAYS', () => {
    const c = loadConfig({ DATABASE_URL: 'postgres://x', ACTIVE_TTL_DAYS: '2' });
    expect(c.databaseUrl).toBe('postgres://x');
    expect(c.activeTtlMs).toBe(2 * 24 * 60 * 60 * 1000);
  });

  it('rejects an invalid DISPLAY_MODE', () => {
    expect(() => loadConfig({ DISPLAY_MODE: 'wall' })).toThrow(/DISPLAY_MODE/);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd server && npx vitest run tests/config.test.ts`
Expected: FAIL (config still requires `STATION`, has no `databaseUrl`/`activeTtlMs`).

- [ ] **Step 4: Rewrite `config.ts`**

Replace `server/src/config.ts` with:

```ts
import type { AppConfig } from './types';

type Env = Record<string, string | undefined>;

function num(env: Env, key: string, def: number): number {
  const raw = env[key];
  if (raw === undefined || raw === '') return def;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`Invalid number for ${key}: ${raw}`);
  return n;
}

function bool(env: Env, key: string, def: boolean): boolean {
  const raw = env[key];
  if (raw === undefined || raw === '') return def;
  return ['1', 'true', 'yes', 'on'].includes(raw.trim().toLowerCase());
}

export function loadConfig(env: Env = process.env): AppConfig {
  const displayMode = (env.DISPLAY_MODE ?? 'auto') as AppConfig['displayMode'];
  if (!['kiosk', 'phone', 'auto'].includes(displayMode)) {
    throw new Error(`Invalid DISPLAY_MODE: ${displayMode} (expected kiosk|phone|auto)`);
  }

  return {
    displayMode,
    weatherLat: num(env, 'WEATHER_LAT', 40.7128),
    weatherLon: num(env, 'WEATHER_LON', -74.006),
    feedRefreshSec: num(env, 'FEED_REFRESH_SEC', 30),
    alertsRefreshSec: num(env, 'ALERTS_REFRESH_SEC', 120),
    weatherRefreshSec: num(env, 'WEATHER_REFRESH_SEC', 600),
    staleThresholdSec: num(env, 'STALE_THRESHOLD_SEC', 90),
    mtaApiKey: env.MTA_API_KEY ?? '',
    port: num(env, 'PORT', 8080),
    compact: bool(env, 'COMPACT', false),
    databaseUrl: env.DATABASE_URL ?? '',
    activeTtlMs: num(env, 'ACTIVE_TTL_DAYS', 7) * 24 * 60 * 60 * 1000,
  };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd server && npx vitest run tests/config.test.ts`
Expected: PASS. (Other server files won't compile yet — that's fine until their tasks.)

- [ ] **Step 6: Commit**

```bash
git add server/src/types.ts server/src/config.ts server/tests/config.test.ts
git commit -m "feat(server): config for multi-board (DB url, active TTL); drop single-board env"
```

---

### Task 2: Board code generator + `BoardsRepo` interface + `MemoryBoardsRepo`

**Files:**
- Create: `server/src/boards/code.ts`
- Create: `server/src/boards/repo.ts`
- Create: `server/src/boards/memoryRepo.ts`
- Test: `server/tests/boards.test.ts`

**Interfaces:**
- Consumes: `Board`, `BoardEntry` (Task 1).
- Produces: `generateCode(): string`.
- Produces:
  ```ts
  interface BoardsRepo {
    getOrCreate(code: string, defaults: { lat: number; lon: number }): Promise<Board>;
    touch(code: string): Promise<void>;
    addEntry(code: string, entry: BoardEntry): Promise<boolean>;
    removeEntry(code: string, type: 'subway' | 'bus', id: string): Promise<boolean>;
    setWeather(code: string, lat: number, lon: number): Promise<void>;
    activeBoards(ttlMs: number): Promise<Board[]>;
  }
  ```
- Produces: `class MemoryBoardsRepo implements BoardsRepo` with constructor `(now?: () => number)`.

- [ ] **Step 1: Write the failing tests**

Create `server/tests/boards.test.ts`:

```ts
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
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd server && npx vitest run tests/boards.test.ts`
Expected: FAIL (modules don't exist).

- [ ] **Step 3: Implement `code.ts`**

Create `server/src/boards/code.ts`:

```ts
import { randomBytes } from 'node:crypto';

const ALPHABET = '23456789abcdefghijkmnpqrstuvwxyz'; // 32 chars, no ambiguous 0/o/1/l
const LENGTH = 8;

export function generateCode(): string {
  const bytes = randomBytes(LENGTH);
  let out = '';
  for (let i = 0; i < LENGTH; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}
```

- [ ] **Step 4: Implement `repo.ts` (interface only)**

Create `server/src/boards/repo.ts`:

```ts
import type { Board, BoardEntry } from '../types';

export interface BoardsRepo {
  /** Fetch a board; create an empty one at `defaults` if the code is unknown. */
  getOrCreate(code: string, defaults: { lat: number; lon: number }): Promise<Board>;
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
}
```

- [ ] **Step 5: Implement `memoryRepo.ts`**

Create `server/src/boards/memoryRepo.ts`:

```ts
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

  async getOrCreate(code: string, defaults: { lat: number; lon: number }): Promise<Board> {
    let r = this.rows.get(code);
    if (!r) {
      r = { code, entries: [], weatherLat: defaults.lat, weatherLon: defaults.lon, lastSeenMs: this.now() };
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
}
```

- [ ] **Step 6: Run to verify pass + typecheck the new files**

Run: `cd server && npx vitest run tests/boards.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add server/src/boards/code.ts server/src/boards/repo.ts server/src/boards/memoryRepo.ts server/tests/boards.test.ts
git commit -m "feat(server): board code generator, BoardsRepo interface, in-memory repo"
```

---

### Task 3: `WeatherCache` + `geocodeLocation`

**Files:**
- Create: `server/src/weatherCache.ts`
- Modify: `server/src/weather.ts` (add `geocodeLocation`)
- Test: `server/tests/weatherCache.test.ts`
- Test: extend `server/tests/weather.test.ts`

**Interfaces:**
- Produces: `roundCoord(n: number): number` (3 decimals), `class WeatherCache { set(lat,lon,w:Weather):void; get(lat,lon):Weather|null }`.
- Produces: `geocodeLocation(q: string, fetchFn?): Promise<GeoResult[]>` where `interface GeoResult { name: string; admin1: string; country: string; lat: number; lon: number }` (exported from `weather.ts`).

- [ ] **Step 1: Write the failing tests**

Create `server/tests/weatherCache.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { WeatherCache, roundCoord } from '../src/weatherCache';
import type { Weather } from '../src/types';

const W = (t: number): Weather => ({ tempF: t, condition: 'Clear', icon: 'clear', hourly: [], daily: [] });

describe('WeatherCache', () => {
  it('rounds coords to 3 decimals for the key', () => {
    expect(roundCoord(40.712812)).toBe(40.713);
    expect(roundCoord(-74.0061)).toBe(-74.006);
  });
  it('stores and retrieves by rounded location', () => {
    const c = new WeatherCache();
    c.set(40.7580, -73.9855, W(70));
    expect(c.get(40.75801, -73.98549)?.tempF).toBe(70); // same to 3dp
    expect(c.get(41, -73)).toBeNull();
  });
});
```

Add to `server/tests/weather.test.ts` (new describe block at the end):

```ts
import { geocodeLocation } from '../src/weather';

describe('geocodeLocation', () => {
  it('maps Open-Meteo geocoding results', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          { name: 'Brooklyn', admin1: 'New York', country: 'United States', latitude: 40.6782, longitude: -73.9442 },
        ],
      }),
    }) as unknown as typeof fetch;
    const out = await geocodeLocation('brooklyn', fakeFetch);
    expect(out).toEqual([
      { name: 'Brooklyn', admin1: 'New York', country: 'United States', lat: 40.6782, lon: -73.9442 },
    ]);
    const url = (fakeFetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain('geocoding-api.open-meteo.com');
    expect(url).toContain('name=brooklyn');
  });

  it('returns [] when there are no results', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }) as unknown as typeof fetch;
    expect(await geocodeLocation('zzz', fakeFetch)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `cd server && npx vitest run tests/weatherCache.test.ts tests/weather.test.ts`
Expected: FAIL (`weatherCache` missing; `geocodeLocation` missing).

- [ ] **Step 3: Implement `weatherCache.ts`**

Create `server/src/weatherCache.ts`:

```ts
import type { Weather } from './types';

export function roundCoord(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function key(lat: number, lon: number): string {
  return `${roundCoord(lat)},${roundCoord(lon)}`;
}

export class WeatherCache {
  private readonly byLoc = new Map<string, Weather>();
  set(lat: number, lon: number, weather: Weather): void {
    this.byLoc.set(key(lat, lon), weather);
  }
  get(lat: number, lon: number): Weather | null {
    return this.byLoc.get(key(lat, lon)) ?? null;
  }
}
```

- [ ] **Step 4: Add `geocodeLocation` to `weather.ts`**

Append to `server/src/weather.ts`:

```ts
export interface GeoResult { name: string; admin1: string; country: string; lat: number; lon: number }

interface OMGeo { results?: Array<{ name: string; admin1?: string; country?: string; latitude: number; longitude: number }> }

export async function geocodeLocation(q: string, fetchFn: typeof fetch = fetch): Promise<GeoResult[]> {
  const url =
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=5&language=en&format=json`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WEATHER_TIMEOUT_MS);
  try {
    const res = await fetchFn(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`Geocode failed: ${res.status}`);
    const data = (await res.json()) as OMGeo;
    return (data.results ?? []).map((r) => ({
      name: r.name,
      admin1: r.admin1 ?? '',
      country: r.country ?? '',
      lat: r.latitude,
      lon: r.longitude,
    }));
  } finally {
    clearTimeout(timer);
  }
}
```

(`WEATHER_TIMEOUT_MS` already exists in `weather.ts`.)

- [ ] **Step 5: Run to verify pass**

Run: `cd server && npx vitest run tests/weatherCache.test.ts tests/weather.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/src/weatherCache.ts server/src/weather.ts server/tests/weatherCache.test.ts server/tests/weather.test.ts
git commit -m "feat(server): per-location WeatherCache and Open-Meteo geocoding"
```

---

### Task 4: `BoardCache.getBoardModel` + `reconcile` + `has`; drop global weather/get

**Files:**
- Modify: `server/src/cache.ts`
- Test: `server/tests/cache.test.ts`

**Interfaces:**
- Consumes: `BoardEntry`, `Weather`, `BoardModel`, `StationMeta` (existing).
- Produces on `BoardCache`: `has(id: string): boolean`, `reconcile(metas: StationMeta[]): void`, `getBoardModel(entries: BoardEntry[], weather: Weather | null, nowMs: number): BoardModel`. **Removed:** `setWeather`, the private `weather` field, and `get(nowMs)`.

- [ ] **Step 1: Write the failing tests**

Replace `server/tests/cache.test.ts` with:

```ts
import { describe, it, expect } from 'vitest';
import { BoardCache } from '../src/cache';
import type { Weather } from '../src/types';

const WEATHER: Weather = { tempF: 70, condition: 'Clear', icon: 'clear', hourly: [], daily: [] };

describe('BoardCache.getBoardModel', () => {
  it('returns only the requested entries, in order, with weather attached', () => {
    const cache = new BoardCache([], 90);
    cache.addStation({ id: '127', name: 'Times Sq', type: 'subway' });
    cache.addStation({ id: '635', name: 'Union Sq', type: 'subway' });
    cache.setDirections('127', [{ direction: 'N', label: 'Uptown', arrivals: [] }], 1000);

    const model = cache.getBoardModel([{ id: '635', type: 'subway' }, { id: '127', type: 'subway' }], WEATHER, 1000);
    expect(model.stations.map((s) => s.station.id)).toEqual(['635', '127']);
    expect(model.weather?.tempF).toBe(70);
  });

  it('synthesizes an empty, stale board for an entry not in the cache', () => {
    const cache = new BoardCache([], 90);
    const model = cache.getBoardModel([{ id: 'R01', type: 'subway' }], null, 1000);
    expect(model.stations[0].station.id).toBe('R01');
    expect(model.stations[0].stale).toBe(true);
    expect(model.stations[0].directions).toEqual([]);
  });
});

describe('BoardCache.reconcile', () => {
  it('adds new stations and drops ones no longer referenced', () => {
    const cache = new BoardCache([], 90);
    cache.addStation({ id: '127', name: 'Times Sq', type: 'subway' });
    cache.reconcile([{ id: '635', name: 'Union Sq', type: 'subway' }]);
    expect(cache.has('635')).toBe(true);
    expect(cache.has('127')).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `cd server && npx vitest run tests/cache.test.ts`
Expected: FAIL (`getBoardModel`/`reconcile`/`has` missing).

- [ ] **Step 3: Edit `cache.ts`**

In `server/src/cache.ts`:

(a) Remove the global weather field and method — delete the line `private weather: Weather | null = null;` and the entire `setWeather(weather: Weather): void { ... }` method, and remove `Weather` from the import if now unused (keep it — `getBoardModel` needs it).

(b) Delete the existing `get(nowMs: number): BoardModel { ... }` method entirely.

(c) Add these methods inside the class (e.g. after `setBusArrivals`):

```ts
  has(id: string): boolean {
    return this.byId.has(id);
  }

  reconcile(metas: StationMeta[]): void {
    const wanted = new Set(metas.map((m) => m.id));
    for (const id of [...this.byId.keys()]) {
      if (!wanted.has(id)) this.byId.delete(id);
    }
    for (const m of metas) this.addStation(m);
  }

  private toStationBoard(e: StationEntry, nowMs: number): StationBoard {
    const stale =
      e.lastUpdatedMs === null || nowMs - e.lastUpdatedMs > this.staleThresholdSec * 1000;
    return {
      station: { id: e.meta.id, name: e.name },
      type: e.meta.type ?? 'subway',
      updatedAt: new Date(e.lastUpdatedMs ?? 0).toISOString(),
      stale,
      directions: e.directions,
      arrivals: e.arrivals,
      alerts: e.alerts,
    };
  }

  getBoardModel(entries: BoardEntry[], weather: Weather | null, nowMs: number): BoardModel {
    let maxLastUpdated: number | null = null;
    const stations: StationBoard[] = entries.map((entry) => {
      const e = this.byId.get(entry.id);
      if (!e) {
        return {
          station: { id: entry.id, name: entry.id },
          type: entry.type,
          updatedAt: new Date(0).toISOString(),
          stale: true,
          directions: [],
          arrivals: [],
          alerts: [],
        };
      }
      if (e.lastUpdatedMs !== null && (maxLastUpdated === null || e.lastUpdatedMs > maxLastUpdated)) {
        maxLastUpdated = e.lastUpdatedMs;
      }
      return this.toStationBoard(e, nowMs);
    });
    return {
      updatedAt: new Date(maxLastUpdated ?? 0).toISOString(),
      stale: stations.some((s) => s.stale),
      weather,
      stations,
    };
  }
```

(d) Add `BoardEntry` to the import from `./types`:
`import type { Alert, Arrival, BoardEntry, BoardModel, DirectionGroup, StationBoard, Weather } from './types';`

- [ ] **Step 4: Run to verify pass**

Run: `cd server && npx vitest run tests/cache.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/cache.ts server/tests/cache.test.ts
git commit -m "feat(server): BoardCache per-board model (getBoardModel) + reconcile; drop global board/weather"
```

---

### Task 5: `buildPollPlan` (union across active boards)

**Files:**
- Create: `server/src/boards/pollPlan.ts`
- Test: `server/tests/pollPlan.test.ts`

**Interfaces:**
- Consumes: `Board` (Task 1).
- Produces: `interface PollPlan { subwayIds: string[]; busCodes: string[]; locations: { lat: number; lon: number }[] }` and `buildPollPlan(boards: Board[]): PollPlan`.

- [ ] **Step 1: Write the failing test**

Create `server/tests/pollPlan.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildPollPlan } from '../src/boards/pollPlan';
import type { Board } from '../src/types';

const board = (over: Partial<Board>): Board => ({ code: 'c', entries: [], weatherLat: 40.75, weatherLon: -73.99, ...over });

describe('buildPollPlan', () => {
  it('dedupes subway ids, bus codes, and rounded locations across boards', () => {
    const plan = buildPollPlan([
      board({ entries: [{ id: '127', type: 'subway' }, { id: '401', type: 'bus' }], weatherLat: 40.7580, weatherLon: -73.9855 }),
      board({ entries: [{ id: '127', type: 'subway' }, { id: '635', type: 'subway' }], weatherLat: 40.75801, weatherLon: -73.98551 }),
      board({ entries: [{ id: '402', type: 'bus' }], weatherLat: 41.0, weatherLon: -73.5 }),
    ]);
    expect(plan.subwayIds.sort()).toEqual(['127', '635']);
    expect(plan.busCodes.sort()).toEqual(['401', '402']);
    // 40.7580/-73.9855 and 40.75801/-73.98551 collapse to one rounded location
    expect(plan.locations).toHaveLength(2);
    expect(plan.locations).toContainEqual({ lat: 40.758, lon: -73.986 });
    expect(plan.locations).toContainEqual({ lat: 41, lon: -73.5 });
  });

  it('returns empty arrays for no boards', () => {
    expect(buildPollPlan([])).toEqual({ subwayIds: [], busCodes: [], locations: [] });
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `cd server && npx vitest run tests/pollPlan.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement `pollPlan.ts`**

Create `server/src/boards/pollPlan.ts`:

```ts
import type { Board } from '../types';
import { roundCoord } from '../weatherCache';

export interface PollPlan {
  subwayIds: string[];
  busCodes: string[];
  locations: { lat: number; lon: number }[];
}

export function buildPollPlan(boards: Board[]): PollPlan {
  const subway = new Set<string>();
  const bus = new Set<string>();
  const locs = new Map<string, { lat: number; lon: number }>();

  for (const b of boards) {
    for (const e of b.entries) {
      if (e.type === 'subway') subway.add(e.id);
      else bus.add(e.id);
    }
    const lat = roundCoord(b.weatherLat);
    const lon = roundCoord(b.weatherLon);
    locs.set(`${lat},${lon}`, { lat, lon });
  }

  return { subwayIds: [...subway], busCodes: [...bus], locations: [...locs.values()] };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd server && npx vitest run tests/pollPlan.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/boards/pollPlan.ts server/tests/pollPlan.test.ts
git commit -m "feat(server): buildPollPlan to union stations/stops/locations across boards"
```

---

### Task 6: `PgBoardsRepo` (+ `pg` dependency, skip-if-no-DB integration test)

**Files:**
- Modify: `server/package.json` (add `pg`; dev `@types/pg`)
- Create: `server/src/boards/pgRepo.ts`
- Test: `server/tests/pgRepo.test.ts`

**Interfaces:**
- Consumes: `BoardsRepo` (Task 2), `Board`, `BoardEntry`.
- Produces: `class PgBoardsRepo implements BoardsRepo` with constructor `(pool: import('pg').Pool)` and `async init(): Promise<void>` (creates the table). Plus `createPgRepo(databaseUrl: string): Promise<PgBoardsRepo>` helper that builds a pool, retries the first connection, runs `init`.

- [ ] **Step 1: Add the dependency**

Run:
```bash
cd server && npm install pg && npm install -D @types/pg
```
Expected: `pg` in `dependencies`, `@types/pg` in `devDependencies`; `package-lock.json` updated.

- [ ] **Step 2: Write the integration test (skips without a DB)**

Create `server/tests/pgRepo.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createPgRepo } from '../src/boards/pgRepo';

const url = process.env.DATABASE_URL;
const maybe = url ? describe : describe.skip;

maybe('PgBoardsRepo (integration, needs DATABASE_URL)', () => {
  it('persists boards, entries, weather, and TTL filtering', async () => {
    const repo = await createPgRepo(url as string);
    const code = `test_${Date.now()}`;
    const b = await repo.getOrCreate(code, { lat: 40.75, lon: -73.99 });
    expect(b.entries).toEqual([]);
    expect(await repo.addEntry(code, { id: '127', type: 'subway' })).toBe(true);
    expect(await repo.addEntry(code, { id: '127', type: 'subway' })).toBe(false);
    await repo.setWeather(code, 41.0, -73.5);
    const again = await repo.getOrCreate(code, { lat: 0, lon: 0 });
    expect(again.entries).toEqual([{ id: '127', type: 'subway' }]);
    expect([again.weatherLat, again.weatherLon]).toEqual([41, -73.5]);
    await repo.touch(code);
    const active = await repo.activeBoards(60_000);
    expect(active.some((x) => x.code === code)).toBe(true);
    expect(await repo.removeEntry(code, 'subway', '127')).toBe(true);
  });
});
```

- [ ] **Step 3: Run to verify it SKIPS (no DATABASE_URL locally)**

Run: `cd server && npx vitest run tests/pgRepo.test.ts`
Expected: PASS with the suite **skipped** (0 tests run). This is correct — it only runs in the Docker smoke test.

- [ ] **Step 4: Implement `pgRepo.ts`**

Create `server/src/boards/pgRepo.ts`:

```ts
import { Pool } from 'pg';
import type { Board, BoardEntry } from '../types';
import type { BoardsRepo } from './repo';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS boards (
  code        TEXT PRIMARY KEY,
  entries     JSONB NOT NULL DEFAULT '[]',
  weather_lat DOUBLE PRECISION NOT NULL,
  weather_lon DOUBLE PRECISION NOT NULL,
  last_seen   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS boards_last_seen_idx ON boards (last_seen);
`;

interface BoardRow { code: string; entries: BoardEntry[]; weather_lat: number; weather_lon: number }

function toBoard(r: BoardRow): Board {
  return { code: r.code, entries: r.entries, weatherLat: r.weather_lat, weatherLon: r.weather_lon };
}

export class PgBoardsRepo implements BoardsRepo {
  constructor(private readonly pool: Pool) {}

  async init(): Promise<void> {
    await this.pool.query(SCHEMA);
  }

  async getOrCreate(code: string, defaults: { lat: number; lon: number }): Promise<Board> {
    const { rows } = await this.pool.query<BoardRow>(
      `INSERT INTO boards (code, weather_lat, weather_lon)
       VALUES ($1, $2, $3)
       ON CONFLICT (code) DO UPDATE SET code = EXCLUDED.code
       RETURNING code, entries, weather_lat, weather_lon`,
      [code, defaults.lat, defaults.lon],
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
  throw new Error(`Could not connect to Postgres after retries: ${String(lastErr)}`);
}
```

- [ ] **Step 5: Typecheck**

Run: `cd server && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add server/package.json server/package-lock.json server/src/boards/pgRepo.ts server/tests/pgRepo.test.ts
git commit -m "feat(server): Postgres BoardsRepo (pg) with schema init and connect retry"
```

---

### Task 7: API — board-by-code endpoints (createApp uses repo + weatherCache)

**Files:**
- Modify: `server/src/api.ts`
- Test: `server/tests/api.test.ts`

**Interfaces:**
- Consumes: `BoardsRepo` (Task 2), `WeatherCache` (Task 3), `BoardCache.getBoardModel`/`addStation`/`has` (Task 4), `geocodeLocation` (Task 3), `getStation`/`searchStations`/`fetchNearbyBusStops` (existing).
- Produces: `createApp(deps: AppDeps)` where
  ```ts
  interface AppDeps {
    cache: BoardCache; repo: BoardsRepo; weatherCache: WeatherCache;
    defaultLat: number; defaultLon: number;
    displayMode: string; compact: boolean; mtaApiKey: string;
    onBoardChange?: (entry?: BoardEntry) => void;
    fetchFn?: typeof fetch; staticDir?: string;
  }
  ```
  Routes: `GET /api/boards/:code`, `POST /api/boards/:code/stations`, `DELETE /api/boards/:code/stations`, `PUT /api/boards/:code/weather`, `GET /api/geocode`, `GET /api/stations/search`, `GET /api/nearby-buses`, `GET /api/health`. (Routing/cookie + static come in Task 8.)

- [ ] **Step 1: Write the failing API tests**

Replace `server/tests/api.test.ts` with:

```ts
import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/api';
import { BoardCache } from '../src/cache';
import { WeatherCache } from '../src/weatherCache';
import { MemoryBoardsRepo } from '../src/boards/memoryRepo';

function makeApp(over: Partial<Parameters<typeof createApp>[0]> = {}) {
  const cache = new BoardCache([], 90);
  const repo = new MemoryBoardsRepo();
  const weatherCache = new WeatherCache();
  const app = createApp({
    cache, repo, weatherCache,
    defaultLat: 40.75, defaultLon: -73.99,
    displayMode: 'auto', compact: false, mtaApiKey: 'key',
    ...over,
  });
  return { app, cache, repo, weatherCache };
}

describe('GET /api/boards/:code', () => {
  it('lazily creates an empty board and returns it with settings', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/boards/abc123');
    expect(res.status).toBe(200);
    expect(res.body.stations).toEqual([]);
    expect(res.body.displayMode).toBe('auto');
    expect(res.body.compact).toBe(false);
    expect(res.body.code).toBe('abc123');
  });

  it('returns the board weather from the WeatherCache at the board location', async () => {
    const { app, weatherCache } = makeApp();
    weatherCache.set(40.75, -73.99, { tempF: 71, condition: 'Clear', icon: 'clear', hourly: [], daily: [] });
    const res = await request(app).get('/api/boards/abc123');
    expect(res.body.weather.tempF).toBe(71);
  });
});

describe('POST /api/boards/:code/stations', () => {
  it('adds a subway station and registers it in the cache', async () => {
    const onBoardChange = vi.fn();
    const { app, cache } = makeApp({ onBoardChange });
    const res = await request(app).post('/api/boards/x/stations').send({ id: '127', type: 'subway' });
    expect(res.status).toBe(201);
    expect(cache.has('127')).toBe(true);
    expect(onBoardChange).toHaveBeenCalled();
  });

  it('409 on duplicate', async () => {
    const { app } = makeApp();
    await request(app).post('/api/boards/x/stations').send({ id: '127', type: 'subway' });
    const res = await request(app).post('/api/boards/x/stations').send({ id: '127', type: 'subway' });
    expect(res.status).toBe(409);
  });

  it('400 on an unknown subway id', async () => {
    const { app } = makeApp();
    const res = await request(app).post('/api/boards/x/stations').send({ id: 'NOPE', type: 'subway' });
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/boards/:code/stations', () => {
  it('removes an entry, 404 if absent', async () => {
    const { app } = makeApp();
    await request(app).post('/api/boards/x/stations').send({ id: '127', type: 'subway' });
    expect((await request(app).delete('/api/boards/x/stations').send({ id: '127', type: 'subway' })).status).toBe(200);
    expect((await request(app).delete('/api/boards/x/stations').send({ id: '127', type: 'subway' })).status).toBe(404);
  });
});

describe('PUT /api/boards/:code/weather', () => {
  it('sets the location, 400 on out-of-range', async () => {
    const { app, repo } = makeApp();
    await request(app).get('/api/boards/x'); // create
    expect((await request(app).put('/api/boards/x/weather').send({ lat: 41, lon: -73.5 })).status).toBe(200);
    expect((await repo.getOrCreate('x', { lat: 0, lon: 0 })).weatherLat).toBe(41);
    expect((await request(app).put('/api/boards/x/weather').send({ lat: 999, lon: 0 })).status).toBe(400);
  });
});

describe('GET /api/geocode', () => {
  it('proxies geocoding results', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ results: [{ name: 'Queens', admin1: 'NY', country: 'US', latitude: 40.7, longitude: -73.8 }] }),
    }) as unknown as typeof fetch;
    const { app } = makeApp({ fetchFn });
    const res = await request(app).get('/api/geocode?q=queens');
    expect(res.body).toEqual([{ name: 'Queens', admin1: 'NY', country: 'US', lat: 40.7, lon: -73.8 }]);
  });
});

describe('GET /api/nearby-buses', () => {
  it('marks alreadyAdded against the board referenced by ?code', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { list: [], references: { routes: [] } } }),
    }) as unknown as typeof fetch;
    const { app } = makeApp({ fetchFn });
    // 127 = Times Sq exists in static data; just assert the endpoint is reachable + shape.
    const res = await request(app).get('/api/nearby-buses?stationId=127&code=x');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `cd server && npx vitest run tests/api.test.ts`
Expected: FAIL (createApp still takes `store`, old routes).

- [ ] **Step 3: Rewrite `api.ts`** (this task adds API routes; Task 8 adds routing/cookie/static)

Replace `server/src/api.ts` with:

```ts
import express, { type Express } from 'express';
import type { BoardCache } from './cache';
import type { BoardsRepo } from './boards/repo';
import type { WeatherCache } from './weatherCache';
import type { BoardEntry } from './types';
import { searchStations, getStation } from './staticGtfs';
import { fetchNearbyBusStops } from './feeds/bus';
import { geocodeLocation } from './weather';

export interface AppDeps {
  cache: BoardCache;
  repo: BoardsRepo;
  weatherCache: WeatherCache;
  defaultLat: number;
  defaultLon: number;
  displayMode: string;
  compact: boolean;
  mtaApiKey: string;
  onBoardChange?: (entry?: BoardEntry) => void;
  fetchFn?: typeof fetch;
  staticDir?: string;
}

export function createApp(deps: AppDeps): Express {
  const { cache, repo, weatherCache, defaultLat, defaultLon, displayMode, compact, mtaApiKey, onBoardChange, fetchFn, staticDir } = deps;
  const defaults = { lat: defaultLat, lon: defaultLon };

  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

  app.get('/api/boards/:code', async (req, res) => {
    const code = req.params.code;
    const board = await repo.getOrCreate(code, defaults);
    await repo.touch(code);
    // Register stations so they appear immediately; poll fills data within a cycle.
    let added = false;
    for (const e of board.entries) {
      if (cache.has(e.id)) continue;
      added = true;
      if (e.type === 'subway') {
        const info = getStation(e.id);
        cache.addStation({ id: e.id, name: info.name, type: 'subway' });
      } else {
        cache.addStation({ id: e.id, name: e.id, type: 'bus' });
      }
    }
    if (added) onBoardChange?.();
    const weather = weatherCache.get(board.weatherLat, board.weatherLon);
    const model = cache.getBoardModel(board.entries, weather, Date.now());
    res.json({ ...model, displayMode, compact, code });
  });

  app.post('/api/boards/:code/stations', async (req, res) => {
    const code = req.params.code;
    const { id, type } = (req.body ?? {}) as { id?: string; type?: string };
    if (type !== 'subway' && type !== 'bus') {
      res.status(400).json({ error: 'type must be "subway" or "bus"' });
      return;
    }
    if (type === 'bus' && !mtaApiKey) {
      res.status(400).json({ error: 'MTA_API_KEY required for bus lookup' });
      return;
    }
    if (!id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }
    // Validate + resolve a subway station name up front.
    let name = id;
    if (type === 'subway') {
      try {
        name = getStation(id).name;
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
        return;
      }
    }
    await repo.getOrCreate(code, defaults);
    const added = await repo.addEntry(code, { id, type });
    if (!added) {
      res.status(409).json({ error: 'already added' });
      return;
    }
    cache.addStation({ id, name, type });
    onBoardChange?.({ id, type });
    res.status(201).json({ ok: true });
  });

  app.delete('/api/boards/:code/stations', async (req, res) => {
    const code = req.params.code;
    const { id, type } = (req.body ?? {}) as { id?: string; type?: 'subway' | 'bus' };
    const removed = await repo.removeEntry(code, type as 'subway' | 'bus', id ?? '');
    if (!removed) {
      res.status(404).json({ error: 'not found' });
      return;
    }
    res.json({ ok: true });
  });

  app.put('/api/boards/:code/weather', async (req, res) => {
    const code = req.params.code;
    const { lat, lon } = (req.body ?? {}) as { lat?: number; lon?: number };
    if (typeof lat !== 'number' || typeof lon !== 'number' || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      res.status(400).json({ error: 'lat/lon out of range' });
      return;
    }
    await repo.getOrCreate(code, defaults);
    await repo.setWeather(code, lat, lon);
    res.json({ ok: true });
  });

  app.get('/api/geocode', async (req, res) => {
    try {
      res.json(await geocodeLocation(String(req.query.q ?? ''), fetchFn));
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get('/api/stations/search', (req, res) => {
    res.json(searchStations(String(req.query.q ?? '')));
  });

  app.get('/api/nearby-buses', async (req, res) => {
    const stationId = String(req.query.stationId ?? '');
    const code = String(req.query.code ?? '');
    let info;
    try {
      info = getStation(stationId);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      return;
    }
    if (!mtaApiKey) {
      res.status(400).json({ error: 'MTA_API_KEY required for bus lookup' });
      return;
    }
    try {
      const stops = await fetchNearbyBusStops(info.lat, info.lon, mtaApiKey, fetchFn);
      const board = code ? await repo.getOrCreate(code, defaults) : null;
      const busIds = new Set((board?.entries ?? []).filter((e) => e.type === 'bus').map((e) => e.id));
      res.json(stops.map((s) => ({ ...s, alreadyAdded: busIds.has(s.code) })));
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // (Task 8 inserts routing + static here.)

  return app;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd server && npx vitest run tests/api.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/api.ts server/tests/api.test.ts
git commit -m "feat(server): per-board API (boards/:code CRUD, weather, geocode)"
```

---

### Task 8: API routing — `/`, `/b/:code`, cookie, SPA static

**Files:**
- Modify: `server/src/api.ts`
- Test: `server/tests/routing.test.ts`

**Interfaces:**
- Consumes: `generateCode` (Task 2), the app from Task 7.
- Produces: `GET /` → 302 redirect (cookie or new code); `GET /b/:code` → sets cookie, serves SPA; static + SPA fallback after API routes.

- [ ] **Step 1: Write the failing tests**

Create `server/tests/routing.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/api';
import { BoardCache } from '../src/cache';
import { WeatherCache } from '../src/weatherCache';
import { MemoryBoardsRepo } from '../src/boards/memoryRepo';

function makeApp() {
  return createApp({
    cache: new BoardCache([], 90), repo: new MemoryBoardsRepo(), weatherCache: new WeatherCache(),
    defaultLat: 40.75, defaultLon: -73.99, displayMode: 'auto', compact: false, mtaApiKey: '',
  });
}

describe('routing', () => {
  it('GET / mints a code, sets a cookie, redirects to /b/<code>', async () => {
    const res = await request(makeApp()).get('/');
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/^\/b\/[23456789abcdefghijkmnpqrstuvwxyz]{8}$/);
    expect(res.headers['set-cookie']?.[0]).toMatch(/^board=/);
  });

  it('GET / with a board cookie redirects to that board', async () => {
    const res = await request(makeApp()).get('/').set('Cookie', 'board=mycode12');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/b/mycode12');
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `cd server && npx vitest run tests/routing.test.ts`
Expected: FAIL (no `/` route → 404).

- [ ] **Step 3: Add routing to `api.ts`**

In `server/src/api.ts`: add the import at the top:

```ts
import { generateCode } from './boards/code';
```

Add a cookie-parse helper above `createApp`:

```ts
function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

const COOKIE_MAX_AGE = 'Max-Age=31536000; Path=/; SameSite=Lax';
```

Replace the `// (Task 8 inserts routing + static here.)` comment with:

```ts
  app.get('/', (req, res) => {
    const existing = readCookie(req.headers.cookie, 'board');
    const code = existing ?? generateCode();
    if (!existing) res.setHeader('Set-Cookie', `board=${code}; ${COOKIE_MAX_AGE}`);
    res.redirect(302, `/b/${code}`);
  });

  if (staticDir) {
    app.get('/b/:code', (req, res) => {
      res.setHeader('Set-Cookie', `board=${encodeURIComponent(req.params.code)}; ${COOKIE_MAX_AGE}`);
      res.sendFile('index.html', { root: staticDir });
    });
    app.use(express.static(staticDir));
    app.get(/^(?!\/api).*/, (_req, res) => res.sendFile('index.html', { root: staticDir }));
  }
```

(`/` is registered regardless of `staticDir` so the redirect/cookie tests pass without a static dir.)

- [ ] **Step 4: Run to verify pass**

Run: `cd server && npx vitest run tests/routing.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/api.ts server/tests/routing.test.ts
git commit -m "feat(server): / and /b/:code routing with board cookie + SPA serving"
```

---

### Task 9: `index.ts` wiring (repo selection + union pollers + weather cache)

**Files:**
- Modify: `server/src/index.ts`
- Delete: `server/src/boardStore.ts`, `server/src/boardConfig.ts`
- Delete: `server/tests/boardStore.test.ts`, `server/tests/boardConfig.test.ts` (if present)

**Interfaces:**
- Consumes: everything above. No new exports (this is the composition root).

- [ ] **Step 1: Delete the obsolete single-board store + its tests**

Run:
```bash
cd server && git rm src/boardStore.ts src/boardConfig.ts
git rm -f tests/boardStore.test.ts tests/boardConfig.test.ts 2>/dev/null || true
```
(If those test files don't exist, the `|| true` keeps the step from failing.)

- [ ] **Step 2: Rewrite `index.ts`**

Replace `server/src/index.ts` with:

```ts
import path from 'node:path';
import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import { loadConfig } from './config';
import { BoardCache } from './cache';
import { WeatherCache } from './weatherCache';
import { createApp } from './api';
import { pollArrivals, pollAlerts, type DecodeFn } from './feeds/poller';
import { pollBusStops } from './feeds/bus';
import { getStation } from './staticGtfs';
import { fetchWeather } from './weather';
import { buildPollPlan } from './boards/pollPlan';
import { MemoryBoardsRepo } from './boards/memoryRepo';
import { createPgRepo } from './boards/pgRepo';
import type { BoardsRepo } from './boards/repo';
import type { StationMeta } from './cache';

async function main() {
  const config = loadConfig();
  const cache = new BoardCache([], config.staleThresholdSec);
  const weatherCache = new WeatherCache();
  const defaults = { lat: config.weatherLat, lon: config.weatherLon };

  const repo: BoardsRepo = config.databaseUrl
    ? await createPgRepo(config.databaseUrl)
    : new MemoryBoardsRepo();
  if (!config.databaseUrl) {
    console.warn('[index] DATABASE_URL not set — using in-memory board store (not persisted)');
  }

  const decode: DecodeFn = (bytes) =>
    GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(bytes) as { entity?: unknown[] };

  // Build the union poll plan from active boards and reconcile the shared cache.
  async function plan() {
    const boards = await repo.activeBoards(config.activeTtlMs);
    return buildPollPlan(boards);
  }

  function subwayMetas(ids: string[]): StationMeta[] {
    return ids.flatMap((id) => {
      try {
        const info = getStation(id);
        return [{ id, name: info.name, type: 'subway' as const }];
      } catch {
        return [];
      }
    });
  }

  let arrivalsInFlight = false;
  async function pollArrivalsCycle() {
    if (arrivalsInFlight) return;
    arrivalsInFlight = true;
    try {
      const p = await plan();
      const subway = subwayMetas(p.subwayIds);
      const bus: StationMeta[] = p.busCodes.map((id) => ({ id, name: id, type: 'bus' as const }));
      cache.reconcile([...subway, ...bus]);
      const stations = subway.map((m) => ({ id: m.id, name: m.name, routes: getStation(m.id).routes }));
      await pollArrivals(cache, stations, decode);
    } catch (err) {
      console.error('[index] arrivals poll cycle error:', err);
    } finally {
      arrivalsInFlight = false;
    }
  }

  let alertsInFlight = false;
  async function pollAlertsCycle() {
    if (alertsInFlight) return;
    alertsInFlight = true;
    try {
      const p = await plan();
      const stations = subwayMetas(p.subwayIds).map((m) => ({ id: m.id, name: m.name, routes: getStation(m.id).routes }));
      await pollAlerts(cache, stations, decode);
    } catch (err) {
      console.error('[index] alerts poll cycle error:', err);
    } finally {
      alertsInFlight = false;
    }
  }

  let busInFlight = false;
  async function pollBusCycle() {
    if (busInFlight) return;
    busInFlight = true;
    try {
      const p = await plan();
      await pollBusStops(cache, p.busCodes, config.mtaApiKey);
    } catch (err) {
      console.error('[index] bus poll cycle error:', err);
    } finally {
      busInFlight = false;
    }
  }

  let weatherInFlight = false;
  async function pollWeatherCycle() {
    if (weatherInFlight) return;
    weatherInFlight = true;
    try {
      const p = await plan();
      const locations = p.locations.length > 0 ? p.locations : [defaults];
      await Promise.all(
        locations.map(async (loc) => {
          try {
            weatherCache.set(loc.lat, loc.lon, await fetchWeather(loc.lat, loc.lon));
          } catch (err) {
            console.error('[index] weather error for', loc, err);
          }
        }),
      );
    } catch (err) {
      console.error('[index] weather poll cycle error:', err);
    } finally {
      weatherInFlight = false;
    }
  }

  const staticDir = path.resolve(__dirname, '../public');

  function onBoardChange(entry?: { id: string; type: 'subway' | 'bus' }) {
    if (entry?.type === 'bus') void pollBusCycle();
    else { void pollArrivalsCycle(); void pollAlertsCycle(); }
  }

  const app = createApp({
    cache, repo, weatherCache,
    defaultLat: config.weatherLat, defaultLon: config.weatherLon,
    displayMode: config.displayMode, compact: config.compact,
    mtaApiKey: config.mtaApiKey, onBoardChange, staticDir,
  });

  void pollArrivalsCycle();
  void pollAlertsCycle();
  void pollWeatherCycle();
  setInterval(pollArrivalsCycle, config.feedRefreshSec * 1000);
  setInterval(pollAlertsCycle, config.alertsRefreshSec * 1000);
  setInterval(pollWeatherCycle, config.weatherRefreshSec * 1000);
  if (config.mtaApiKey !== '') {
    void pollBusCycle();
    setInterval(pollBusCycle, config.feedRefreshSec * 1000);
  }

  app.listen(config.port, () => {
    console.log(`MTA tracker listening on :${config.port} (store=${config.databaseUrl ? 'postgres' : 'memory'})`);
  });
}

void main();
```

- [ ] **Step 3: Typecheck + full server suite**

Run: `cd server && npx tsc --noEmit && npx vitest run`
Expected: tsc clean; all suites pass (pgRepo skipped).

- [ ] **Step 4: Commit**

```bash
git add server/src/index.ts
git commit -m "feat(server): wire multi-board pollers (union over active boards) + repo selection"
```

---

### Task 10: Web — code-from-path + code-threaded API client

**Files:**
- Modify: `web/src/api.ts`
- Modify: `web/src/App.tsx`
- Test: `web/tests/api.test.ts`
- Test: `web/tests/App.test.tsx`

**Interfaces:**
- Produces (web `api.ts`): `getBoardCode(): string`, `fetchBoard(code)`, `addStation(code, entry)`, `removeStation(code, entry)`, `fetchNearbyBuses(code, stationId)`, `searchStations(q)`, `setWeather(code, lat, lon)`, `geocode(q)`; `interface GeoResult { name; admin1; country; lat; lon }`.

- [ ] **Step 1: Update the web API tests**

Replace `web/tests/api.test.ts` with:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchBoard, addStation, removeStation, setWeather, geocode } from '../src/api';

beforeEach(() => { window.history.replaceState({}, '', '/b/code123'); });

describe('web api (board-scoped)', () => {
  it('fetchBoard GETs /api/boards/:code', async () => {
    const f = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ stations: [] }) });
    vi.stubGlobal('fetch', f);
    await fetchBoard('code123');
    expect(f).toHaveBeenCalledWith('/api/boards/code123');
  });

  it('addStation POSTs to the board, returns false on 409', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 409 }));
    expect(await addStation('code123', { id: '127', type: 'subway' })).toBe(false);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 201, json: async () => ({}) }));
    expect(await addStation('code123', { id: '127', type: 'subway' })).toBe(true);
  });

  it('removeStation DELETEs the board station', async () => {
    const f = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal('fetch', f);
    await removeStation('code123', { id: '127', type: 'subway' });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('/api/boards/code123/stations');
    expect(init.method).toBe('DELETE');
  });

  it('setWeather PUTs lat/lon', async () => {
    const f = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal('fetch', f);
    await setWeather('code123', 41, -73.5);
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('/api/boards/code123/weather');
    expect(JSON.parse(init.body)).toEqual({ lat: 41, lon: -73.5 });
  });

  it('geocode GETs /api/geocode', async () => {
    const f = vi.fn().mockResolvedValue({ ok: true, json: async () => ([{ name: 'X', admin1: '', country: '', lat: 1, lon: 2 }]) });
    vi.stubGlobal('fetch', f);
    const out = await geocode('x');
    expect(f).toHaveBeenCalledWith('/api/geocode?q=x');
    expect(out[0].name).toBe('X');
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `cd web && npx vitest run tests/api.test.ts`
Expected: FAIL (functions take no `code` yet; `setWeather`/`geocode` missing).

- [ ] **Step 3: Rewrite `web/src/api.ts`**

Replace `web/src/api.ts` with:

```ts
import type { Board } from './types';

export interface SearchResult { id: string; name: string; routes: string[] }
export interface NearbyStop { code: string; name: string; routes: string[]; distanceMeters: number; alreadyAdded: boolean }
export interface GeoResult { name: string; admin1: string; country: string; lat: number; lon: number }

// Read the board code from /b/:code; in dev (or a bare load) mint one and update the URL.
export function getBoardCode(): string {
  const m = window.location.pathname.match(/^\/b\/([A-Za-z0-9_-]+)/);
  if (m) return m[1];
  const code = Math.random().toString(36).slice(2, 10);
  window.history.replaceState(null, '', `/b/${code}`);
  return code;
}

export async function fetchBoard(code: string): Promise<Board> {
  const res = await fetch(`/api/boards/${code}`);
  if (!res.ok) throw new Error(`Board fetch failed: ${res.status}`);
  return (await res.json()) as Board;
}

export async function searchStations(q: string): Promise<SearchResult[]> {
  if (!q) return [];
  const res = await fetch(`/api/stations/search?q=${encodeURIComponent(q)}`);
  if (!res.ok) throw new Error(`Station search failed: ${res.status}`);
  return (await res.json()) as SearchResult[];
}

export async function fetchNearbyBuses(code: string, stationId: string): Promise<NearbyStop[]> {
  const res = await fetch(`/api/nearby-buses?stationId=${encodeURIComponent(stationId)}&code=${encodeURIComponent(code)}`);
  if (!res.ok) throw new Error(`Nearby buses fetch failed: ${res.status}`);
  return (await res.json()) as NearbyStop[];
}

export async function addStation(code: string, entry: { id: string; type: 'subway' | 'bus' }): Promise<boolean> {
  const res = await fetch(`/api/boards/${code}/stations`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entry),
  });
  if (res.status === 409) return false;
  if (!res.ok) throw new Error(`Add station failed: ${res.status}`);
  return true;
}

export async function removeStation(code: string, entry: { id: string; type: 'subway' | 'bus' }): Promise<void> {
  const res = await fetch(`/api/boards/${code}/stations`, {
    method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entry),
  });
  if (!res.ok) throw new Error(`Remove station failed: ${res.status}`);
}

export async function setWeather(code: string, lat: number, lon: number): Promise<void> {
  const res = await fetch(`/api/boards/${code}/weather`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lat, lon }),
  });
  if (!res.ok) throw new Error(`Set weather failed: ${res.status}`);
}

export async function geocode(q: string): Promise<GeoResult[]> {
  const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
  if (!res.ok) throw new Error(`Geocode failed: ${res.status}`);
  return (await res.json()) as GeoResult[];
}
```

- [ ] **Step 4: Update `App.tsx` to thread the code**

In `web/src/App.tsx`:

Change the imports:
```ts
import { fetchBoard, removeStation, getBoardCode } from './api';
```

Add a code ref near the other refs (after `const active = useRef(true);`):
```ts
  const code = useRef(getBoardCode());
```

Change `reload` to use it:
```ts
  const reload = useCallback(async () => {
    try {
      const data = await fetchBoard(code.current);
      if (active.current) { setBoard(data); setError(false); }
    } catch {
      if (active.current) setError(true);
    }
  }, []);
```

Change `onRemove`:
```ts
  async function onRemove(entry: { id: string; type: 'subway' | 'bus' }) {
    await removeStation(code.current, entry);
    await reload();
  }
```

Pass the code down to `Board` (used by EditPanel in Task 11) — add `boardCode={code.current}` to the `<Board ... />` props.

- [ ] **Step 5: Update `App.test.tsx`**

In `web/tests/App.test.tsx`, the fetch mock matches `/api/board`. Update the URL check and ensure a board code path. At the top of the mock (the `if (url.startsWith('/api/board'))` branch) change it to `'/api/boards/'`, and in `beforeEach` set the path:

```ts
beforeEach(() => {
  window.history.replaceState({}, '', '/b/testcode');
  vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
    if (typeof url === 'string' && url.startsWith('/api/boards/')) {
      return Promise.resolve({ ok: true, json: async () => board });
    }
    return Promise.resolve({ ok: true, json: async () => [] });
  }));
});
```

(Keep the existing `board` fixture and the rest of the tests; the compact-toggle test still asserts via `.app.compact` and the URL `?compact=1` — note the path is now `/b/testcode`, so update that test's `window.location.search` assertion to remain `?compact=1` and its pathname expectation if any.)

- [ ] **Step 6: Run web tests + typecheck**

Run: `cd web && npx vitest run tests/api.test.ts tests/App.test.tsx && npx tsc --noEmit`
Expected: PASS, clean. (Board/EditPanel prop types updated in Task 11; if `boardCode` prop errors here, add it as optional in `Board`'s props in this step.)

- [ ] **Step 7: Commit**

```bash
git add web/src/api.ts web/src/App.tsx web/tests/api.test.ts web/tests/App.test.tsx
git commit -m "feat(web): board-code-scoped API client and App wiring"
```

---

### Task 11: Web — weather location picker, copy-link, board code through Board/EditPanel

**Files:**
- Modify: `web/src/components/Board.tsx`
- Modify: `web/src/components/Header.tsx`
- Modify: `web/src/components/EditPanel.tsx`
- Modify: `web/src/styles.css`
- Test: `web/tests/components.test.tsx`

**Interfaces:**
- Consumes: `setWeather`, `geocode`, `addStation`, `fetchNearbyBuses` (Task 10).
- `Board` gains prop `boardCode: string`, forwarded to `EditPanel` (`code`) and to `Header` (for copy-link).
- `EditPanel` props become `{ code: string; onChanged: () => void }`.

- [ ] **Step 1: Write the failing test**

Add to `web/tests/components.test.tsx` (new test inside the existing top-level `describe`):

```ts
import { EditPanel } from '../src/components/EditPanel';

it('EditPanel sets weather from a geocode search result', async () => {
  const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    if (url.startsWith('/api/geocode')) {
      return Promise.resolve({ ok: true, json: async () => ([{ name: 'Brooklyn', admin1: 'NY', country: 'US', lat: 40.68, lon: -73.94 }]) });
    }
    if (url.includes('/weather') && init?.method === 'PUT') {
      return Promise.resolve({ ok: true, json: async () => ({}) });
    }
    return Promise.resolve({ ok: true, json: async () => [] });
  });
  vi.stubGlobal('fetch', fetchMock);

  render(<EditPanel code="c1" onChanged={() => {}} />);
  fireEvent.change(screen.getByPlaceholderText(/city or zip/i), { target: { value: 'brooklyn' } });
  await waitFor(() => expect(screen.getByText(/Brooklyn/)).toBeInTheDocument());
  fireEvent.click(screen.getByText(/Brooklyn/));

  await waitFor(() => {
    const put = fetchMock.mock.calls.find(([u, i]) => typeof u === 'string' && u.includes('/weather') && i?.method === 'PUT');
    expect(put).toBeTruthy();
    expect(JSON.parse((put![1] as RequestInit).body as string)).toEqual({ lat: 40.68, lon: -73.94 });
  });
});
```

(Ensure `fireEvent`, `waitFor`, `screen`, `render` are imported at the top of the file — they already are for the existing EditPanel test.)

- [ ] **Step 2: Run to verify fail**

Run: `cd web && npx vitest run tests/components.test.tsx`
Expected: FAIL (EditPanel takes `compact`/old props, no location picker, no `code`).

- [ ] **Step 3: Update `EditPanel.tsx`**

Rewrite `web/src/components/EditPanel.tsx` to take `{ code, onChanged }`, thread `code` into `addStation`/`removeStation`/`fetchNearbyBuses`, and add a weather-location section:

```tsx
import { useState, useRef } from 'react';
import type { SearchResult, NearbyStop, GeoResult } from '../api';
import { searchStations, fetchNearbyBuses, addStation, removeStation, setWeather, geocode } from '../api';

export function EditPanel({ code, onChanged }: { code: string; onChanged: () => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [justAdded, setJustAdded] = useState<{ id: string; name: string } | null>(null);
  const [nearby, setNearby] = useState<NearbyStop[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchSeq = useRef(0);

  const [place, setPlace] = useState('');
  const [places, setPlaces] = useState<GeoResult[]>([]);
  const placeSeq = useRef(0);

  async function onQueryChange(q: string) {
    setQuery(q);
    const seq = ++searchSeq.current;
    if (!q.trim()) { setResults([]); return; }
    try {
      setError(null);
      const found = await searchStations(q);
      if (seq !== searchSeq.current) return;
      setResults(found);
    } catch {
      if (seq !== searchSeq.current) return;
      setError('Search failed. Try again.');
    }
  }

  async function onPickStation(station: SearchResult) {
    try {
      setBusy(true); setError(null);
      const added = await addStation(code, { id: station.id, type: 'subway' });
      if (added) onChanged();
      setJustAdded({ id: station.id, name: station.name });
      setQuery(''); setResults([]);
      setNearby(await fetchNearbyBuses(code, station.id));
    } catch {
      setError('Could not add that station. Try again.');
    } finally { setBusy(false); }
  }

  async function onPickBus(stop: NearbyStop) {
    const adding = !stop.alreadyAdded;
    try {
      setBusy(true); setError(null);
      if (adding) await addStation(code, { id: stop.code, type: 'bus' });
      else await removeStation(code, { id: stop.code, type: 'bus' });
      onChanged();
      setNearby((prev) => prev.map((s) => (s.code === stop.code ? { ...s, alreadyAdded: adding } : s)));
    } catch {
      setError(adding ? 'Could not add that bus stop.' : 'Could not remove that bus stop.');
    } finally { setBusy(false); }
  }

  async function onPlaceChange(q: string) {
    setPlace(q);
    const seq = ++placeSeq.current;
    if (!q.trim()) { setPlaces([]); return; }
    try {
      const found = await geocode(q);
      if (seq !== placeSeq.current) return;
      setPlaces(found);
    } catch { /* ignore */ }
  }

  async function onPickPlace(p: GeoResult) {
    try {
      setBusy(true); setError(null);
      await setWeather(code, p.lat, p.lon);
      onChanged();
      setPlace(''); setPlaces([]);
    } catch {
      setError('Could not set location.');
    } finally { setBusy(false); }
  }

  function useMyLocation() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      void onPickPlace({ name: 'Current location', admin1: '', country: '', lat: pos.coords.latitude, lon: pos.coords.longitude });
    });
  }

  function onDone() { setJustAdded(null); setNearby([]); }

  return (
    <div className="edit-panel">
      {error && <div className="edit-error">{error}</div>}

      {justAdded && nearby.length > 0 ? (
        <div className="nearby-list">
          <div className="nearby-title">Nearby bus stops for {justAdded.name}</div>
          {nearby.map((stop) => (
            <label key={stop.code} className="nearby-item">
              <input type="checkbox" checked={stop.alreadyAdded} disabled={busy}
                onChange={() => onPickBus(stop)} aria-label={`${stop.alreadyAdded ? 'Remove' : 'Add'} ${stop.name}`} />
              <span className="nearby-name">{stop.name}</span>
              <span className="nearby-routes">{stop.routes.join(', ')}</span>
              <span className="nearby-distance">{Math.round(stop.distanceMeters)} m</span>
            </label>
          ))}
          <button type="button" className="edit-done" onClick={onDone}>Done</button>
        </div>
      ) : (
        <>
          <input type="text" className="search-box" placeholder="Search for a station…"
            value={query} onChange={(e) => onQueryChange(e.target.value)} />
          {results.length > 0 && (
            <div className="search-results">
              {results.map((r) => (
                <button type="button" key={r.id} className="search-result" onClick={() => onPickStation(r)} disabled={busy}>
                  <span className="search-result-name">{r.name}</span>
                  <span className="search-result-routes">{r.routes.join(', ')}</span>
                </button>
              ))}
            </div>
          )}
          {justAdded && (
            <div className="edit-added-note">
              Added {justAdded.name}. <button type="button" className="edit-done" onClick={onDone}>Done</button>
            </div>
          )}

          <div className="edit-section">
            <div className="edit-section-title">Weather location</div>
            <div className="weather-loc-row">
              <input type="text" className="search-box" placeholder="City or zip…"
                value={place} onChange={(e) => onPlaceChange(e.target.value)} />
              <button type="button" className="edit-done" onClick={useMyLocation}>Use my location</button>
            </div>
            {places.length > 0 && (
              <div className="search-results">
                {places.map((p, i) => (
                  <button type="button" key={i} className="search-result" onClick={() => onPickPlace(p)} disabled={busy}>
                    <span className="search-result-name">{p.name}</span>
                    <span className="search-result-routes">{[p.admin1, p.country].filter(Boolean).join(', ')}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Thread `boardCode` through `Board.tsx` and add copy-link in `Header.tsx`**

In `web/src/components/Board.tsx`: add `boardCode: string` to the props type, accept it, pass `code={boardCode}` to `<EditPanel ... />` (replace `onChanged={onChanged}` call to `<EditPanel code={boardCode} onChanged={onChanged} />`), and pass `boardCode={boardCode}` to `<Header ... />`.

In `web/src/components/Header.tsx`: add optional `boardCode?: string` to `Props` and a copy-link button in `.topbar-left` (after the edit button):

```tsx
        <button
          type="button"
          className="view-toggle"
          onClick={() => { void navigator.clipboard?.writeText(window.location.href); }}
          title="Copy this board's link"
          aria-label="Copy board link"
        >
          🔗 Copy link
        </button>
```

(Accept `boardCode` in the destructure even if only used for clarity; the button copies `window.location.href`.)

- [ ] **Step 5: Add styles**

Append to `web/src/styles.css`:

```css
.edit-section { margin-top: 16px; border-top: 1px solid var(--divider); padding-top: 12px; }
.edit-section-title { font-size: 13px; color: var(--dim); margin-bottom: 8px; }
.weather-loc-row { display: flex; gap: 8px; align-items: center; }
.weather-loc-row .search-box { flex: 1; }
```

- [ ] **Step 6: Run web tests + typecheck + build**

Run: `cd web && npx vitest run && npx tsc --noEmit && npm run build`
Expected: all pass, clean, build OK. (Update the existing EditPanel test that rendered `<EditPanel onChanged=...>` to pass `code="x"`.)

- [ ] **Step 7: Commit**

```bash
git add web/src/components/Board.tsx web/src/components/Header.tsx web/src/components/EditPanel.tsx web/src/styles.css web/tests/components.test.tsx
git commit -m "feat(web): weather location picker, copy-link, board code through Board/EditPanel"
```

---

### Task 12: Infra + docs (Postgres compose, Dockerfile, .env.example, README)

**Files:**
- Modify: `docker-compose.yml`
- Modify: `Dockerfile`
- Modify: `.env.example`
- Modify: `README.md`

**Interfaces:** none (deployment + docs).

- [ ] **Step 1: docker-compose with Postgres**

Replace `docker-compose.yml` with:

```yaml
services:
  mta-tracker:
    image: awu05/mta-tracker:latest
    build: .
    restart: unless-stopped
    ports:
      - "8080:8080"
    env_file:
      - .env
    environment:
      DATABASE_URL: postgres://mta:mta@db:5432/mta
    depends_on:
      db:
        condition: service_healthy

  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: mta
      POSTGRES_PASSWORD: mta
      POSTGRES_DB: mta
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U mta"]
      interval: 5s
      timeout: 5s
      retries: 10

volumes:
  pgdata:
```

- [ ] **Step 2: Dockerfile — drop the data dir / DATA_DIR**

In `Dockerfile`, remove the line `RUN mkdir -p /app/data && chown node:node /app/data` and the line `ENV DATA_DIR=/app/data` (keep `USER node`, the healthcheck, and everything else).

- [ ] **Step 3: `.env.example`**

Replace `.env.example` with:

```bash
# Postgres connection (compose sets this automatically for the bundled db service).
# If unset, the server falls back to an in-memory store (not persisted) — handy for local dev.
DATABASE_URL=postgres://mta:mta@db:5432/mta

# Boards not opened within this many days stop being polled (still work when reopened).
ACTIVE_TTL_DAYS=7

# kiosk | phone | auto
DISPLAY_MODE=auto

# Default weather location for NEW boards (users can change it per board in the UI).
WEATHER_LAT=40.7580
WEATHER_LON=-73.9855

# Compact view default (per-device override via ?compact=1/0)
COMPACT=false

# Poll intervals / staleness (seconds)
FEED_REFRESH_SEC=30
ALERTS_REFRESH_SEC=120
WEATHER_REFRESH_SEC=600
STALE_THRESHOLD_SEC=90

# MTA Bus Time API key — required for bus stops.
MTA_API_KEY=

# HTTP port
PORT=8080
```

- [ ] **Step 4: README**

Update `README.md`:
- Replace the "Quick start" and "Editing the board" framing to describe per-board codes: visiting the server creates your own board at `/b/<code>`; bookmark/share the URL; "Copy link" in the header.
- Add a **"How it's hosted / multi-board"** section: each device gets its own board code; Postgres stores board configs; the kiosk just opens a specific `/b/<code>` URL.
- Add **Postgres** to the config table (`DATABASE_URL`, `ACTIVE_TTL_DAYS`); remove `STATION`, `BUS_STOPS`, `DATA_DIR`.
- Note weather is now per-board (set via the location picker), `WEATHER_LAT/LON` is just the default for new boards.

Make the edits to reflect the above (prose; match the existing README's section structure and tone).

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml Dockerfile .env.example README.md
git commit -m "feat: Postgres compose + docs for multi-board hosting"
```

---

## Self-Review

**Spec coverage:**
- Board model + code → Tasks 1, 2. ✓
- Identity/routing/cookie → Task 8. ✓
- API (boards/:code CRUD, weather, geocode, nearby-buses code param) → Tasks 7, 8. ✓
- Polling union over active boards + cache reconcile → Tasks 4, 5, 9. ✓
- Postgres storage + Memory fallback + skip-if-no-DB test → Tasks 2, 6, 9. ✓
- WeatherCache + per-board weather + geocoding → Tasks 3, 7, 9, 11. ✓
- Web: code from path, picker, copy-link, empty-board add prompt (existing EditPanel auto-shows in edit mode) → Tasks 10, 11. ✓
- Drop single-board/env/DATA_DIR → Tasks 1, 9, 12. ✓
- Docker/compose Postgres + docs → Task 12. ✓

**Placeholder scan:** No TBD/TODO; every code step has complete code. Task 12 Step 4 (README) is prose-described rather than full text — acceptable for a docs edit, with explicit bullet points of every required change.

**Type consistency:** `BoardsRepo` method names identical across repo.ts/memoryRepo.ts/pgRepo.ts/api.ts/index.ts. `getBoardModel(entries, weather, nowMs)`, `reconcile(metas)`, `has(id)` match between Task 4 and Tasks 7/9. `AppDeps` shape in Task 7 matches `createApp` call in Task 9. Web api signatures (`code` first arg) match App (Task 10) and EditPanel (Task 11). `GeoResult` shape identical server (`weather.ts`) and web (`api.ts`). `buildPollPlan` return shape matches its use in Task 9.

**Note on an existing-test ripple:** `App.test.tsx` and the existing EditPanel test in `components.test.tsx` assumed the old global board/props; Tasks 10–11 explicitly update them. The compact-toggle App test still asserts `?compact=1` + `.app.compact` (unchanged behavior), only the path is now `/b/...`.
