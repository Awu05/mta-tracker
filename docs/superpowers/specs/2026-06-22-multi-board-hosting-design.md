# Multi-Board Hosting (Shareable Board Codes) — Design

## Goal

Turn the single-shared-board app into a multi-tenant one that can be hosted on a
server: every device that connects gets **its own board** (the stations/buses it
tracks plus its weather location), identified by an unguessable **board code** in
the URL (`/b/:code`). Codes are bookmarkable and shareable, so the same board can be
reopened on another device. No accounts/login.

## Key insight (why this scales)

The per-station arrivals/alerts data lives in a **shared in-memory cache** keyed by
station id, and the subway poller fetches each GTFS **feed** once (~8 feeds total)
and fans out. So subway polling cost is near-constant regardless of how many boards
or stations exist. Only **bus** stops scale per-stop (one SIRI call each, needs
`MTA_API_KEY`) and **weather** scales per distinct location. What's actually
per-board is tiny: a list of `{id,type}` entries and a lat/lon.

## What is and isn't persisted

- **In-memory only (rebuilt from feeds every cycle, never persisted):** the
  arrivals/alerts cache (per station) and the weather cache (per location).
- **Persisted in Postgres:** board configs only — `code → { entries, weatherLat,
  weatherLon, lastSeen }`.

## Decisions

- **Identity:** anonymous, shareable **board code** in the URL. No accounts. Anyone
  with a code can view/edit it (acceptable — transit data, no secrets).
- **New board:** starts **empty** and the web app auto-opens the add-station UI.
- **No single-board/kiosk special-casing:** drop `board.json`, the single
  `BoardStore`, and `STATION`/`BUS_STOPS` env seeding. The Pi kiosk just opens a
  board-code URL like any other device.
- **Weather:** **per-board** lat/lon (default from server env), set via a location
  picker backed by Open-Meteo's keyless **geocoding** API.
- **Display density:** `compact` and responsive layout stay **per-device** (the
  `?compact` URL override + `DISPLAY_MODE`), not per-board, since one shared board is
  viewed on both a wall and a phone.
- **Persistence:** **Postgres** via the pure-JS `pg` driver (keeps the multi-arch
  Docker build clean).

## Architecture

```text
Browser /b/:code ──GET /api/boards/:code──> Express
                                              │
   ┌──────────────────────────────────────────┼─────────────────────────────┐
   │ Shared in-memory caches (rebuilt from feeds, not persisted)             │
   │   • BoardCache: per-station arrivals/alerts (keyed by station id)        │
   │   • WeatherCache: per-location weather+forecast (keyed by rounded lat/lon)│
   ├──────────────────────────────────────────┼─────────────────────────────┤
   │ Pollers (every cycle): query active boards from Postgres, poll the UNION │
   │   • subway feeds (≈8, near-constant) • bus stops • weather locations      │
   ├──────────────────────────────────────────┼─────────────────────────────┤
   │ Postgres: boards(code, entries jsonb, weather_lat, weather_lon, last_seen)│
   └───────────────────────────────────────────────────────────────────────┘
```

`GET /api/boards/:code` reads the board's `entries` from Postgres, slices the
matching station data out of the shared `BoardCache`, attaches the weather for the
board's location from `WeatherCache`, and stamps `last_seen`.

## Data model (Postgres)

```sql
CREATE TABLE IF NOT EXISTS boards (
  code        TEXT PRIMARY KEY,
  entries     JSONB NOT NULL DEFAULT '[]',   -- ordered [{ "id": "...", "type": "subway"|"bus" }]
  weather_lat DOUBLE PRECISION NOT NULL,
  weather_lon DOUBLE PRECISION NOT NULL,
  last_seen   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS boards_last_seen_idx ON boards (last_seen);
```

Schema is created idempotently on startup (no migration framework for v1).

## Components

### `BoardsRepo` (interface) + two implementations
Methods (all async):
- `getOrCreate(code, defaults: { lat; lon }): Promise<Board>` — fetch a board; if the
  code is unknown, insert an empty board with the default location. Stamps nothing.
- `touch(code): Promise<void>` — set `last_seen = now()`.
- `addEntry(code, entry: BoardEntry): Promise<boolean>` — append if not present;
  returns false if it was already there. Throws on an unknown subway id.
- `removeEntry(code, type, id): Promise<boolean>` — returns false if not present.
- `setWeather(code, lat, lon): Promise<void>`.
- `activeBoards(ttlMs): Promise<Board[]>` — boards with `last_seen > now() - ttlMs`.

`Board = { code: string; entries: BoardEntry[]; weatherLat: number; weatherLon: number }`.

- **`PgBoardsRepo`** — production; wraps a `pg.Pool`; runs schema init on construct;
  reads/writes the `boards` table. Entry mutations use a single `UPDATE ... SET
  entries = $json` after computing the new array (read-modify-write inside one
  statement via `jsonb` is fine at this scale; concurrent edits to the *same* board
  are rare and last-writer-wins is acceptable).
- **`MemoryBoardsRepo`** — a `Map<string, Board>`; identical behaviour; used by tests
  and as the zero-setup fallback when `DATABASE_URL` is unset (local `npm run dev`).

### `WeatherCache`
- Keyed by a rounded `lat,lon` string (e.g. 3 decimals). Holds the existing `Weather`
  object (current + hourly + daily) plus `updatedAt`.
- `set(lat, lon, weather)`, `get(lat, lon): Weather | null`.

### `BoardCache` (existing, lightly adjusted)
- Still holds per-station arrivals/alerts keyed by station id. New: a method to build a
  board model for an arbitrary list of entries + a weather value, rather than the
  single global board: `getBoardModel(entries: BoardEntry[], weather: Weather | null,
  nowMs): BoardModel`. The poller registers the **union** of active stations so the
  cache has data for any entry a board references.

### Codes
- `generateCode(): string` — 8 chars from a URL-safe alphabet via `crypto.randomBytes`
  (unguessable; ~40 bits). Collision check against the repo on create.

## API

- `GET /b/:code` and `GET /` — SPA serving + redirects (see Routing).
- `GET /api/boards/:code` → `{ ...boardModelForThisBoard, displayMode, compact }`.
  Lazily creates the board (with default weather location) if the code is new; stamps
  `last_seen`.
- `POST /api/boards/:code/stations` `{ id, type }` → add. 201, or 409 if already
  present (the web treats 409 as success, as it does today), 400 on unknown subway id.
- `DELETE /api/boards/:code/stations` `{ id, type }` → remove. 404 if not present.
- `PUT /api/boards/:code/weather` `{ lat, lon }` → set location; 400 on invalid range.
- `GET /api/geocode?q=` → proxy Open-Meteo geocoding
  (`https://geocoding-api.open-meteo.com/v1/search?name=<q>&count=5`); returns
  `[{ name, admin1, country, lat, lon }]`.
- `GET /api/stations/search?q=`, `GET /api/nearby-buses?stationId=` — unchanged
  (global helpers). `nearby-buses` "alreadyAdded" is computed against the **board's**
  entries when a `code` query param is supplied.
- `GET /api/health` — unchanged.
- The old global `GET /api/board` and `/api/board/stations` routes are removed.

### Routing / cookie
- `GET /` → if a `board` cookie is set, 302 to `/b/<cookie>`; else `generateCode()`,
  set cookie `board=<code>` (long-lived, `SameSite=Lax`), 302 to `/b/<code>`.
- `GET /b/:code` → set/refresh the `board` cookie to `:code`, serve `index.html`.
- SPA history fallback: unknown non-API GETs serve `index.html` (the client reads the
  code from `location.pathname`).

## Polling (union over active boards)

Each cycle:
1. `boards = repo.activeBoards(ACTIVE_TTL_MS)` (default 7 days).
2. **Subway:** union of subway ids across boards → register into `BoardCache` →
   union of routes → feeds → existing `pollArrivals`/`pollAlerts` (single-pass
   transform over the union of ids).
3. **Bus:** union of distinct bus stop codes → `pollBusStops` (one SIRI call each;
   only runs if `MTA_API_KEY` set).
4. **Weather:** union of distinct rounded locations → fetch each → `WeatherCache`.

Inactive boards (not seen within the TTL) are skipped by the pollers but remain in
Postgres, so reopening the code works (its first `GET` stamps `last_seen` and the next
cycle starts polling it). `ACTIVE_TTL_DAYS` is configurable via env (default 7).

Each cycle **reconciles** the `BoardCache` with the current union: stations newly
referenced are added, and cached stations no longer referenced by any active board are
dropped, so cache memory stays bounded to what active boards actually track. (A board
`GET` for a not-yet-cached station returns it with empty arrivals until the next poll
populates it — same "no data yet" path as a freshly added station today.)

## Web

- App reads the code from `location.pathname` (`/b/:code`); all board API calls
  include the code. `/` is handled server-side (redirect), so the app always has a
  code.
- **Empty board** → auto-open the add-station UI (existing `EditPanel`), with a hint.
- **Copy link** affordance in the header to copy the current `/b/:code` URL.
- **Weather location picker** (in Edit / settings): a city/zip search box calling
  `/api/geocode`, results list → selecting one calls `PUT .../weather`. Optional "use
  my location" button via `navigator.geolocation` → `PUT .../weather` with the
  returned coords. Shows the current location name.
- `compact` stays a per-device `?compact` URL override; `displayMode` stays the
  server `DISPLAY_MODE` default.

## Config / env

- New: `DATABASE_URL` (Postgres; if unset, server uses `MemoryBoardsRepo`).
- New: `ACTIVE_TTL_DAYS` (default 7).
- Kept: `WEATHER_LAT`/`WEATHER_LON` (now the **default** location for new boards),
  `DISPLAY_MODE`, `COMPACT`, refresh intervals, `STALE_THRESHOLD_SEC`, `MTA_API_KEY`,
  `PORT`.
- Removed: `STATION`, `BUS_STOPS`, `DATA_DIR` (no more file persistence).

## docker-compose

- Add a `db` service: `postgres:16-alpine`, env `POSTGRES_USER/PASSWORD/DB`, volume
  `pgdata:/var/lib/postgresql/data`, a `pg_isready` healthcheck.
- App service: `DATABASE_URL=postgres://…@db:5432/…`, `depends_on: { db: { condition:
  service_healthy } }`. The app also retries the initial connection a few times so it
  tolerates the DB starting up. Remove the `mta-data` volume.

## Testing

- **Unit:** `generateCode` (length/charset/uniqueness), `MemoryBoardsRepo` (CRUD,
  add/remove/dedup, `activeBoards` TTL filtering), `WeatherCache` (round/get/set),
  `BoardCache.getBoardModel` (slices the right entries, attaches weather).
- **API (Supertest) against `MemoryBoardsRepo` — no DB needed:** lazy board creation,
  add/remove/409/404, `PUT weather`, geocode proxy (mock fetch), `nearby-buses`
  alreadyAdded vs a board's entries, `/` and `/b/:code` redirect/cookie behaviour.
- **Polling:** union assembly across multiple active boards; inactive boards excluded.
- **`PgBoardsRepo` integration test that SKIPS when `DATABASE_URL` is unset** — runs
  in the Docker smoke test where Postgres is up; verifies real persistence + a
  restart-survival check.
- **Web:** code read from path; empty-board auto-prompt; weather location picker
  (search → select → PUT); copy-link button. Update existing tests that assumed the
  global `/api/board`.

## Out of scope (YAGNI)

Accounts/login, board deletion/rename UI, labels, per-board display density, admin
dashboards, rate-limit metrics. Codes are unguessable but unauthenticated.

## Migration

Per the chosen approach, the old `board.json` / `STATION` / `BUS_STOPS` are dropped
with no automated migration: re-add your stops once in the UI, then pin the kiosk to
that board's `/b/:code`.
