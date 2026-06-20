# MTA Display Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Dockerized NYC subway departure board that polls public MTA GTFS-realtime feeds, filters to one configured home station, and serves a React board UI plus a renderer-agnostic JSON API, running on a Raspberry Pi Zero 2 W.

**Architecture:** Single Node + TypeScript process. A poller fetches/decodes MTA GTFS-rt feeds on an interval, a pure transform converts decoded entities into a normalized board model, an in-memory cache holds last-good state, and an Express layer serves `GET /api/board` (the renderer-agnostic contract) plus the built React app. A separate weather service polls Open-Meteo. The React frontend polls `/api/board` and renders a split-column board (Layout A). See `docs/superpowers/specs/2026-06-20-mta-tracker-design.md`.

**Tech Stack:** Node.js 20, TypeScript, Express, `gtfs-realtime-bindings`, Vitest + Supertest (server tests), React 18 + Vite, Vitest + @testing-library/react (web tests), Docker multi-stage build.

---

## File Structure

```
mta-tracker/
├── Dockerfile                     # multi-stage: build web + server, slim runtime
├── docker-compose.yml             # convenience run config
├── .env.example                   # documented config template
├── .dockerignore
├── README.md
├── server/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vitest.config.ts
│   ├── src/
│   │   ├── types.ts               # shared domain types (BoardModel, Arrival, etc.)
│   │   ├── config.ts              # env parsing + validation
│   │   ├── data/
│   │   │   ├── routes.json        # route id -> color/textColor (bundled)
│   │   │   └── stations.json      # station id -> {name, routes} (bundled/generated)
│   │   ├── staticGtfs.ts          # station/route/stop lookups over the bundled JSON
│   │   ├── feeds/
│   │   │   ├── feedUrls.ts        # feed id -> URL, route -> feed id
│   │   │   ├── transform.ts       # PURE: decoded entities -> BoardModel directions
│   │   │   ├── alerts.ts          # PURE: decoded alert entities -> Alert[]
│   │   │   └── poller.ts          # fetch + decode loop, per-feed isolation
│   │   ├── weather.ts             # Open-Meteo fetch -> Weather
│   │   ├── cache.ts               # in-memory board + weather state, staleness
│   │   ├── api.ts                 # Express app factory (routes + static)
│   │   └── index.ts               # entry: wire config, poller, weather, server
│   ├── scripts/
│   │   └── build-stations.ts      # regenerate stations.json from a stops.txt
│   └── tests/
│       ├── fixtures/              # sample decoded entities, feed bytes, weather json
│       └── *.test.ts
└── web/
    ├── package.json
    ├── tsconfig.json
    ├── vite.config.ts
    ├── vitest.config.ts
    ├── index.html
    └── src/
        ├── main.tsx
        ├── App.tsx                # polling + stale handling
        ├── api.ts                 # fetchBoard()
        ├── types.ts               # mirrors server BoardModel shape
        ├── styles.css             # dark theme, Layout A, responsive
        └── components/
            ├── LineBullet.tsx
            ├── ArrivalRow.tsx
            ├── DirectionColumn.tsx
            ├── Alerts.tsx
            ├── Clock.tsx
            ├── Header.tsx
            └── Board.tsx
```

**Design notes:**
- `transform.ts` and `alerts.ts` are **pure functions** taking already-decoded entities + injected lookups + a `nowMs` argument — the highest-value tests, fully deterministic, no network.
- The poller injects `fetch` so it is testable with a stub.
- The web `types.ts` mirrors the server contract; the contract lives in the spec.

---

## Task 0: Repo scaffold

**Files:**
- Create: `server/package.json`, `server/tsconfig.json`, `server/vitest.config.ts`
- Create: `web/package.json`, `web/tsconfig.json`, `web/vite.config.ts`, `web/vitest.config.ts`, `web/index.html`, `web/src/main.tsx`, `web/src/App.tsx`
- Create: `.dockerignore`

- [ ] **Step 1: Create `server/package.json`**

```json
{
  "name": "mta-tracker-server",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsx watch src/index.ts",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "express": "^4.19.2",
    "gtfs-realtime-bindings": "^1.1.1"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/node": "^20.14.0",
    "@types/supertest": "^6.0.2",
    "supertest": "^7.0.0",
    "tsx": "^4.16.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Create `server/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `server/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
```

- [ ] **Step 4: Create `web/package.json`**

```json
{
  "name": "mta-tracker-web",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test": "vitest run"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.4.6",
    "@testing-library/react": "^16.0.0",
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "jsdom": "^24.1.0",
    "typescript": "^5.5.0",
    "vite": "^5.3.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 5: Create `web/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src"]
}
```

- [ ] **Step 6: Create `web/vite.config.ts`**

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:8080' } },
  build: { outDir: 'dist' },
});
```

- [ ] **Step 7: Create `web/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: { environment: 'jsdom', globals: true, setupFiles: ['./src/test-setup.ts'] },
});
```

- [ ] **Step 8: Create `web/src/test-setup.ts`**

```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 9: Create `web/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>MTA Tracker</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 10: Create `web/src/main.tsx`**

```tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

- [ ] **Step 11: Create placeholder `web/src/App.tsx`** (replaced in Task 11)

```tsx
export default function App() {
  return <div>MTA Tracker</div>;
}
```

- [ ] **Step 12: Create placeholder `web/src/styles.css`** (replaced in Task 12)

```css
/* replaced in Task 12 */
```

- [ ] **Step 13: Create `.dockerignore`**

```
**/node_modules
**/dist
.git
.superpowers
docs
*.log
.env
```

- [ ] **Step 14: Install deps and verify both projects build/test tooling runs**

Run: `cd server && npm install && cd ../web && npm install`
Expected: both install without errors.

- [ ] **Step 15: Commit**

```bash
git add server web .dockerignore
git commit -m "chore: scaffold server and web projects"
```

---

## Task 1: Domain types + config

**Files:**
- Create: `server/src/types.ts`
- Create: `server/src/config.ts`
- Test: `server/tests/config.test.ts`

- [ ] **Step 1: Create `server/src/types.ts`**

```ts
export type Direction = 'N' | 'S';

export interface Arrival {
  route: string;        // e.g. "1", "N"
  color: string;        // hex, e.g. "#ee352e"
  textColor: string;    // hex for text on the bullet
  destination: string;  // human station name of trip's last stop
  minutes: number;      // whole minutes until arrival (>= 0)
}

export interface DirectionGroup {
  direction: Direction;
  label: string;        // "Uptown" | "Downtown"
  arrivals: Arrival[];  // soonest first
}

export interface Alert {
  routes: string[];
  severity: string;     // e.g. "delay" | "info"
  text: string;
}

export interface Weather {
  tempF: number;
  condition: string;
  icon: string;
}

export interface BoardModel {
  station: { id: string; name: string };
  updatedAt: string;    // ISO timestamp of last successful feed update
  stale: boolean;
  directions: DirectionGroup[];
  alerts: Alert[];
  weather: Weather | null;
}

export interface AppConfig {
  station: string;
  displayMode: 'kiosk' | 'phone' | 'auto';
  weatherLat: number;
  weatherLon: number;
  feedRefreshSec: number;
  weatherRefreshSec: number;
  staleThresholdSec: number;
  mtaApiKey: string;
  port: number;
}
```

- [ ] **Step 2: Write failing test `server/tests/config.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config';

describe('loadConfig', () => {
  it('parses a complete env with defaults applied', () => {
    const cfg = loadConfig({ STATION: '127', WEATHER_LAT: '40.75', WEATHER_LON: '-73.98' });
    expect(cfg.station).toBe('127');
    expect(cfg.displayMode).toBe('auto');
    expect(cfg.weatherLat).toBe(40.75);
    expect(cfg.feedRefreshSec).toBe(30);
    expect(cfg.port).toBe(8080);
  });

  it('throws when STATION is missing', () => {
    expect(() => loadConfig({})).toThrow(/STATION/);
  });

  it('throws on invalid displayMode', () => {
    expect(() => loadConfig({ STATION: '127', DISPLAY_MODE: 'bogus' })).toThrow(/DISPLAY_MODE/);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd server && npx vitest run tests/config.test.ts`
Expected: FAIL — cannot find module `../src/config`.

- [ ] **Step 4: Create `server/src/config.ts`**

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

export function loadConfig(env: Env = process.env): AppConfig {
  const station = env.STATION;
  if (!station) throw new Error('Missing required env STATION (your home station stop id)');

  const displayMode = (env.DISPLAY_MODE ?? 'auto') as AppConfig['displayMode'];
  if (!['kiosk', 'phone', 'auto'].includes(displayMode)) {
    throw new Error(`Invalid DISPLAY_MODE: ${displayMode} (expected kiosk|phone|auto)`);
  }

  return {
    station,
    displayMode,
    weatherLat: num(env, 'WEATHER_LAT', 40.7128),
    weatherLon: num(env, 'WEATHER_LON', -74.006),
    feedRefreshSec: num(env, 'FEED_REFRESH_SEC', 30),
    weatherRefreshSec: num(env, 'WEATHER_REFRESH_SEC', 600),
    staleThresholdSec: num(env, 'STALE_THRESHOLD_SEC', 90),
    mtaApiKey: env.MTA_API_KEY ?? '',
    port: num(env, 'PORT', 8080),
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd server && npx vitest run tests/config.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add server/src/types.ts server/src/config.ts server/tests/config.test.ts
git commit -m "feat: add domain types and config loader"
```

---

## Task 2: Static GTFS lookup (routes + stations)

**Files:**
- Create: `server/src/data/routes.json`
- Create: `server/src/data/stations.json`
- Create: `server/src/staticGtfs.ts`
- Create: `server/scripts/build-stations.ts`
- Test: `server/tests/staticGtfs.test.ts`

- [ ] **Step 1: Create `server/src/data/routes.json`** (official MTA line colors)

```json
{
  "1": { "color": "#ee352e", "textColor": "#ffffff" },
  "2": { "color": "#ee352e", "textColor": "#ffffff" },
  "3": { "color": "#ee352e", "textColor": "#ffffff" },
  "4": { "color": "#00933c", "textColor": "#ffffff" },
  "5": { "color": "#00933c", "textColor": "#ffffff" },
  "6": { "color": "#00933c", "textColor": "#ffffff" },
  "7": { "color": "#b933ad", "textColor": "#ffffff" },
  "A": { "color": "#0039a6", "textColor": "#ffffff" },
  "C": { "color": "#0039a6", "textColor": "#ffffff" },
  "E": { "color": "#0039a6", "textColor": "#ffffff" },
  "B": { "color": "#ff6319", "textColor": "#ffffff" },
  "D": { "color": "#ff6319", "textColor": "#ffffff" },
  "F": { "color": "#ff6319", "textColor": "#ffffff" },
  "M": { "color": "#ff6319", "textColor": "#ffffff" },
  "G": { "color": "#6cbe45", "textColor": "#ffffff" },
  "J": { "color": "#996633", "textColor": "#ffffff" },
  "Z": { "color": "#996633", "textColor": "#ffffff" },
  "L": { "color": "#a7a9ac", "textColor": "#ffffff" },
  "N": { "color": "#fccc0a", "textColor": "#000000" },
  "Q": { "color": "#fccc0a", "textColor": "#000000" },
  "R": { "color": "#fccc0a", "textColor": "#000000" },
  "W": { "color": "#fccc0a", "textColor": "#000000" },
  "S": { "color": "#808183", "textColor": "#ffffff" },
  "SI": { "color": "#0039a6", "textColor": "#ffffff" }
}
```

- [ ] **Step 2: Create `server/src/data/stations.json`** (curated initial set; regenerate via build-stations script)

```json
{
  "127": { "name": "Times Sq–42 St", "routes": ["1", "2", "3", "7", "N", "Q", "R", "W", "S"] },
  "631": { "name": "Grand Central–42 St", "routes": ["4", "5", "6", "7", "S"] },
  "635": { "name": "14 St–Union Sq", "routes": ["4", "5", "6", "L", "N", "Q", "R", "W"] },
  "A32": { "name": "W 4 St–Wash Sq", "routes": ["A", "C", "E", "B", "D", "F", "M"] },
  "R31": { "name": "Atlantic Av–Barclays Ctr", "routes": ["B", "D", "N", "Q", "R", "2", "3", "4", "5"] }
}
```

- [ ] **Step 3: Write failing test `server/tests/staticGtfs.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { getStation, getRouteStyle, stopName } from '../src/staticGtfs';

describe('staticGtfs', () => {
  it('returns a station by id', () => {
    const s = getStation('127');
    expect(s.name).toBe('Times Sq–42 St');
    expect(s.routes).toContain('1');
  });

  it('throws for an unknown station', () => {
    expect(() => getStation('ZZZ')).toThrow(/ZZZ/);
  });

  it('returns route style with a fallback for unknown routes', () => {
    expect(getRouteStyle('1').color).toBe('#ee352e');
    expect(getRouteStyle('???')).toEqual({ color: '#666666', textColor: '#ffffff' });
  });

  it('resolves a stop name, stripping the N/S suffix', () => {
    expect(stopName('127N')).toBe('Times Sq–42 St');
    expect(stopName('127')).toBe('Times Sq–42 St');
    expect(stopName('999X')).toBe('999X'); // unknown -> echo id
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd server && npx vitest run tests/staticGtfs.test.ts`
Expected: FAIL — cannot find module `../src/staticGtfs`.

- [ ] **Step 5: Create `server/src/staticGtfs.ts`**

```ts
import routesData from './data/routes.json' with { type: 'json' };
import stationsData from './data/stations.json' with { type: 'json' };

export interface RouteStyle { color: string; textColor: string; }
export interface StationInfo { name: string; routes: string[]; }

const routes = routesData as Record<string, RouteStyle>;
const stations = stationsData as Record<string, StationInfo>;

const DEFAULT_STYLE: RouteStyle = { color: '#666666', textColor: '#ffffff' };

export function getStation(id: string): StationInfo {
  const s = stations[id];
  if (!s) throw new Error(`Unknown station id: ${id}`);
  return s;
}

export function getRouteStyle(route: string): RouteStyle {
  return routes[route] ?? DEFAULT_STYLE;
}

/** Strip a trailing N/S direction suffix, then look up the station name. */
export function stopName(stopId: string): string {
  const base = /[NS]$/.test(stopId) ? stopId.slice(0, -1) : stopId;
  return stations[base]?.name ?? stopId;
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd server && npx vitest run tests/staticGtfs.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 7: Create `server/scripts/build-stations.ts`** (regeneration helper; documented, not run in CI)

```ts
/*
 * Regenerate src/data/stations.json from an official GTFS static stops.txt.
 * Usage:
 *   1) Download the NYC subway GTFS static zip from
 *      https://www.mta.info/developers (subway) and extract stops.txt.
 *   2) Run: npx tsx scripts/build-stations.ts path/to/stops.txt path/to/routes-by-station.json
 *
 * stops.txt has parent stations (location_type=1) with stop_id + stop_name.
 * Route membership is not in stops.txt; supply a routes-by-station map (station id -> route[])
 * derived from your needs, or hand-curate. This script merges names + routes.
 */
import { readFileSync, writeFileSync } from 'node:fs';

function parseCsv(text: string): Record<string, string>[] {
  const [header, ...lines] = text.trim().split(/\r?\n/);
  const cols = header.split(',');
  return lines.map((line) => {
    const vals = line.split(',');
    return Object.fromEntries(cols.map((c, i) => [c, vals[i]]));
  });
}

const [, , stopsPath, routesPath] = process.argv;
if (!stopsPath) {
  console.error('Usage: tsx build-stations.ts <stops.txt> [routes-by-station.json]');
  process.exit(1);
}

const rows = parseCsv(readFileSync(stopsPath, 'utf8'));
const routesByStation: Record<string, string[]> = routesPath
  ? JSON.parse(readFileSync(routesPath, 'utf8'))
  : {};

const out: Record<string, { name: string; routes: string[] }> = {};
for (const r of rows) {
  if (r.location_type === '1') {
    out[r.stop_id] = { name: r.stop_name, routes: routesByStation[r.stop_id] ?? [] };
  }
}

writeFileSync(
  new URL('../src/data/stations.json', import.meta.url),
  JSON.stringify(out, null, 2),
);
console.log(`Wrote ${Object.keys(out).length} stations`);
```

- [ ] **Step 8: Commit**

```bash
git add server/src/data server/src/staticGtfs.ts server/scripts/build-stations.ts server/tests/staticGtfs.test.ts
git commit -m "feat: bundled route/station data and static lookups"
```

---

## Task 3: Feed URL / route-to-feed mapping

**Files:**
- Create: `server/src/feeds/feedUrls.ts`
- Test: `server/tests/feedUrls.test.ts`

- [ ] **Step 1: Write failing test `server/tests/feedUrls.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { feedIdForRoute, feedUrl, feedsForRoutes, ALERTS_URL } from '../src/feeds/feedUrls';

describe('feedUrls', () => {
  it('maps routes to their feed id', () => {
    expect(feedIdForRoute('1')).toBe('123456s');
    expect(feedIdForRoute('A')).toBe('ace');
    expect(feedIdForRoute('N')).toBe('nqrw');
    expect(feedIdForRoute('L')).toBe('l');
  });

  it('builds a feed URL for a feed id', () => {
    expect(feedUrl('ace')).toContain('nyct%2Fgtfs-ace');
    expect(feedUrl('123456s')).toMatch(/nyct%2Fgtfs$/);
  });

  it('returns the unique set of feed ids for a list of routes', () => {
    expect(feedsForRoutes(['1', '2', '3', 'N']).sort()).toEqual(['123456s', 'nqrw']);
  });

  it('exposes the alerts feed url', () => {
    expect(ALERTS_URL).toContain('camsys%2Fsubway-alerts');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run tests/feedUrls.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Create `server/src/feeds/feedUrls.ts`**

```ts
const BASE = 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds';

// feed id -> URL path suffix (the "123456s" feed uses the bare nyct%2Fgtfs path)
const FEED_PATHS: Record<string, string> = {
  '123456s': 'nyct%2Fgtfs',
  ace: 'nyct%2Fgtfs-ace',
  bdfm: 'nyct%2Fgtfs-bdfm',
  g: 'nyct%2Fgtfs-g',
  jz: 'nyct%2Fgtfs-jz',
  nqrw: 'nyct%2Fgtfs-nqrw',
  l: 'nyct%2Fgtfs-l',
  si: 'nyct%2Fgtfs-si',
};

const ROUTE_TO_FEED: Record<string, string> = {
  '1': '123456s', '2': '123456s', '3': '123456s', '4': '123456s',
  '5': '123456s', '6': '123456s', '7': '123456s', S: '123456s', GS: '123456s',
  A: 'ace', C: 'ace', E: 'ace', H: 'ace', FS: 'ace',
  B: 'bdfm', D: 'bdfm', F: 'bdfm', M: 'bdfm',
  G: 'g',
  J: 'jz', Z: 'jz',
  N: 'nqrw', Q: 'nqrw', R: 'nqrw', W: 'nqrw',
  L: 'l',
  SI: 'si', SIR: 'si',
};

export const ALERTS_URL = `${BASE}/camsys%2Fsubway-alerts`;

export function feedIdForRoute(route: string): string {
  const id = ROUTE_TO_FEED[route];
  if (!id) throw new Error(`No feed mapping for route: ${route}`);
  return id;
}

export function feedUrl(feedId: string): string {
  const path = FEED_PATHS[feedId];
  if (!path) throw new Error(`Unknown feed id: ${feedId}`);
  return `${BASE}/${path}`;
}

export function feedsForRoutes(routes: string[]): string[] {
  return [...new Set(routes.map(feedIdForRoute))];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run tests/feedUrls.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/feeds/feedUrls.ts server/tests/feedUrls.test.ts
git commit -m "feat: feed url and route-to-feed mapping"
```

---

## Task 4: Arrivals transform (pure)

**Files:**
- Create: `server/src/feeds/transform.ts`
- Test: `server/tests/transform.test.ts`

This is the core logic. `transform` takes an array of decoded GTFS-rt entities (plain objects in tests), the station id, a `nowMs`, and injected lookups, and produces `DirectionGroup[]`.

- [ ] **Step 1: Write failing test `server/tests/transform.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { transformArrivals } from '../src/feeds/transform';

// Minimal decoded-entity shape the transform consumes.
function tripUpdate(routeId: string, stops: Array<[string, number]>) {
  return {
    tripUpdate: {
      trip: { routeId },
      stopTimeUpdate: stops.map(([stopId, time]) => ({ stopId, arrival: { time } })),
    },
  };
}

const lookups = {
  stopName: (id: string) => (id.startsWith('127') ? 'Times Sq–42 St' : id.startsWith('142') ? 'South Ferry' : id),
  routeStyle: (r: string) => ({ color: r === '1' ? '#ee352e' : '#fccc0a', textColor: '#fff' }),
};

describe('transformArrivals', () => {
  const NOW = 1_700_000_000_000; // ms

  it('groups arrivals by direction and sorts soonest first', () => {
    const entities = [
      tripUpdate('1', [['127N', 1_700_000_120], ['101N', 1_700_000_600]]), // +2 min uptown
      tripUpdate('1', [['127S', 1_700_000_060], ['142S', 1_700_000_400]]), // +1 min downtown
      tripUpdate('1', [['127N', 1_700_000_420]]),                          // +7 min uptown
    ];
    const groups = transformArrivals(entities, '127', NOW, lookups);

    const uptown = groups.find((g) => g.direction === 'N')!;
    const downtown = groups.find((g) => g.direction === 'S')!;
    expect(uptown.label).toBe('Uptown');
    expect(uptown.arrivals.map((a) => a.minutes)).toEqual([2, 7]);
    expect(downtown.arrivals.map((a) => a.minutes)).toEqual([1]);
    expect(uptown.arrivals[0].route).toBe('1');
    expect(uptown.arrivals[0].color).toBe('#ee352e');
  });

  it('derives destination from the last stop of the trip', () => {
    const entities = [tripUpdate('1', [['127S', 1_700_000_060], ['142S', 1_700_000_400]])];
    const groups = transformArrivals(entities, '127', NOW, lookups);
    expect(groups.find((g) => g.direction === 'S')!.arrivals[0].destination).toBe('South Ferry');
  });

  it('ignores stops for other stations and already-departed trains', () => {
    const entities = [
      tripUpdate('1', [['999N', 1_700_000_120]]),  // different station
      tripUpdate('1', [['127N', 1_699_999_900]]),  // in the past
    ];
    const groups = transformArrivals(entities, '127', NOW, lookups);
    expect(groups.every((g) => g.arrivals.length === 0)).toBe(true);
  });

  it('handles Long-style time objects with a toNumber method', () => {
    const entities = [{
      tripUpdate: {
        trip: { routeId: '1' },
        stopTimeUpdate: [{ stopId: '127N', arrival: { time: { toNumber: () => 1_700_000_120 } } }],
      },
    }];
    const groups = transformArrivals(entities, '127', NOW, lookups);
    expect(groups.find((g) => g.direction === 'N')!.arrivals[0].minutes).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run tests/transform.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Create `server/src/feeds/transform.ts`**

```ts
import type { Arrival, DirectionGroup, Direction } from '../types';

// GTFS-rt int64 fields decode to Long objects; accept number or {toNumber}.
type GtfsTime = number | { toNumber(): number } | Long | null | undefined;
interface Long { toNumber(): number; }

interface StopTimeUpdate { stopId?: string | null; arrival?: { time?: GtfsTime } | null; }
interface Entity {
  tripUpdate?: {
    trip?: { routeId?: string | null } | null;
    stopTimeUpdate?: StopTimeUpdate[] | null;
  } | null;
}

export interface TransformLookups {
  stopName(stopId: string): string;
  routeStyle(route: string): { color: string; textColor: string };
}

function toSeconds(time: GtfsTime): number | null {
  if (time == null) return null;
  if (typeof time === 'number') return time;
  if (typeof (time as Long).toNumber === 'function') return (time as Long).toNumber();
  return null;
}

const LABEL: Record<Direction, string> = { N: 'Uptown', S: 'Downtown' };

export function transformArrivals(
  entities: Entity[],
  stationId: string,
  nowMs: number,
  lookups: TransformLookups,
): DirectionGroup[] {
  const byDir: Record<Direction, Arrival[]> = { N: [], S: [] };

  for (const e of entities) {
    const tu = e.tripUpdate;
    const route = tu?.trip?.routeId;
    const stops = tu?.stopTimeUpdate;
    if (!route || !stops || stops.length === 0) continue;

    // Destination = last stop in the trip's remaining schedule.
    const lastStopId = stops[stops.length - 1]?.stopId ?? '';
    const destination = lookups.stopName(lastStopId);

    for (const stu of stops) {
      const sid = stu.stopId ?? '';
      if (sid !== `${stationId}N` && sid !== `${stationId}S`) continue;
      const dir = sid.slice(-1) as Direction;
      const sec = toSeconds(stu.arrival?.time);
      if (sec == null) continue;
      const minutes = Math.floor((sec * 1000 - nowMs) / 60000);
      if (minutes < 0) continue;
      const style = lookups.routeStyle(route);
      byDir[dir].push({ route, color: style.color, textColor: style.textColor, destination, minutes });
    }
  }

  (['N', 'S'] as Direction[]).forEach((d) => byDir[d].sort((a, b) => a.minutes - b.minutes));

  return (['N', 'S'] as Direction[]).map((d) => ({ direction: d, label: LABEL[d], arrivals: byDir[d] }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run tests/transform.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/feeds/transform.ts server/tests/transform.test.ts
git commit -m "feat: pure arrivals transform"
```

---

## Task 5: Alerts transform (pure)

**Files:**
- Create: `server/src/feeds/alerts.ts`
- Test: `server/tests/alerts.test.ts`

- [ ] **Step 1: Write failing test `server/tests/alerts.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { transformAlerts } from '../src/feeds/alerts';

function alertEntity(routes: string[], header: string, effect?: string) {
  return {
    alert: {
      effect,
      informedEntity: routes.map((routeId) => ({ routeId })),
      headerText: { translation: [{ text: header, language: 'en' }] },
    },
  };
}

describe('transformAlerts', () => {
  it('keeps only alerts touching the given routes', () => {
    const entities = [
      alertEntity(['N', 'Q'], 'Northbound delays near 57 St', 'SIGNIFICANT_DELAYS'),
      alertEntity(['L'], 'L train planned work'),
    ];
    const alerts = transformAlerts(entities, ['1', 'N']);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].routes).toEqual(['N', 'Q']);
    expect(alerts[0].text).toBe('Northbound delays near 57 St');
    expect(alerts[0].severity).toBe('delay');
  });

  it('returns an empty array when nothing matches', () => {
    const entities = [alertEntity(['L'], 'L train work')];
    expect(transformAlerts(entities, ['1'])).toEqual([]);
  });

  it('falls back to "info" severity and skips empty headers', () => {
    const entities = [
      alertEntity(['1'], 'Elevator out at station'),
      alertEntity(['1'], ''),
    ];
    const alerts = transformAlerts(entities, ['1']);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].severity).toBe('info');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run tests/alerts.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Create `server/src/feeds/alerts.ts`**

```ts
import type { Alert } from '../types';

interface AlertEntity {
  alert?: {
    effect?: string | null;
    informedEntity?: Array<{ routeId?: string | null }> | null;
    headerText?: { translation?: Array<{ text?: string | null; language?: string | null }> | null } | null;
  } | null;
}

function severityFromEffect(effect?: string | null): string {
  if (!effect) return 'info';
  const e = effect.toUpperCase();
  if (e.includes('DELAY')) return 'delay';
  if (e.includes('NO_SERVICE') || e.includes('SUSPEND')) return 'suspended';
  return 'info';
}

function headerText(a: NonNullable<AlertEntity['alert']>): string {
  const translations = a.headerText?.translation ?? [];
  const en = translations.find((t) => t.language === 'en') ?? translations[0];
  return (en?.text ?? '').trim();
}

export function transformAlerts(entities: AlertEntity[], routes: string[]): Alert[] {
  const wanted = new Set(routes);
  const out: Alert[] = [];
  for (const e of entities) {
    const a = e.alert;
    if (!a) continue;
    const alertRoutes = (a.informedEntity ?? [])
      .map((ie) => ie.routeId)
      .filter((r): r is string => !!r);
    if (!alertRoutes.some((r) => wanted.has(r))) continue;
    const text = headerText(a);
    if (!text) continue;
    out.push({ routes: [...new Set(alertRoutes)], severity: severityFromEffect(a.effect), text });
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run tests/alerts.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/feeds/alerts.ts server/tests/alerts.test.ts
git commit -m "feat: pure alerts transform"
```

---

## Task 6: Weather service

**Files:**
- Create: `server/src/weather.ts`
- Test: `server/tests/weather.test.ts`

- [ ] **Step 1: Write failing test `server/tests/weather.test.ts`**

```ts
import { describe, it, expect, vi } from 'vitest';
import { fetchWeather } from '../src/weather';

const SAMPLE = {
  current: { temperature_2m: 71.6, weather_code: 0 },
};

describe('fetchWeather', () => {
  it('maps Open-Meteo current weather to the Weather model', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => SAMPLE,
    }) as unknown as typeof fetch;

    const w = await fetchWeather(40.75, -73.98, fakeFetch);
    expect(w.tempF).toBe(72);            // rounded
    expect(w.condition).toBe('Clear');   // code 0
    expect(w.icon).toBe('clear');
    const calledUrl = (fakeFetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(calledUrl).toContain('latitude=40.75');
    expect(calledUrl).toContain('temperature_unit=fahrenheit');
  });

  it('throws on a non-ok response', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({ ok: false, status: 503 }) as unknown as typeof fetch;
    await expect(fetchWeather(1, 2, fakeFetch)).rejects.toThrow(/503/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run tests/weather.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Create `server/src/weather.ts`**

```ts
import type { Weather } from './types';

// Minimal WMO weather-code mapping -> (condition, icon).
const CODES: Record<number, [string, string]> = {
  0: ['Clear', 'clear'],
  1: ['Mainly Clear', 'clear'], 2: ['Partly Cloudy', 'cloudy'], 3: ['Overcast', 'cloudy'],
  45: ['Fog', 'fog'], 48: ['Fog', 'fog'],
  51: ['Drizzle', 'rain'], 53: ['Drizzle', 'rain'], 55: ['Drizzle', 'rain'],
  61: ['Rain', 'rain'], 63: ['Rain', 'rain'], 65: ['Heavy Rain', 'rain'],
  71: ['Snow', 'snow'], 73: ['Snow', 'snow'], 75: ['Heavy Snow', 'snow'],
  80: ['Showers', 'rain'], 81: ['Showers', 'rain'], 82: ['Showers', 'rain'],
  95: ['Thunderstorm', 'storm'], 96: ['Thunderstorm', 'storm'], 99: ['Thunderstorm', 'storm'],
};

export async function fetchWeather(
  lat: number,
  lon: number,
  fetchFn: typeof fetch = fetch,
): Promise<Weather> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,weather_code&temperature_unit=fahrenheit`;
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`Weather fetch failed: ${res.status}`);
  const data = (await res.json()) as { current: { temperature_2m: number; weather_code: number } };
  const [condition, icon] = CODES[data.current.weather_code] ?? ['Unknown', 'cloudy'];
  return { tempF: Math.round(data.current.temperature_2m), condition, icon };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run tests/weather.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/weather.ts server/tests/weather.test.ts
git commit -m "feat: open-meteo weather service"
```

---

## Task 7: In-memory cache

**Files:**
- Create: `server/src/cache.ts`
- Test: `server/tests/cache.test.ts`

- [ ] **Step 1: Write failing test `server/tests/cache.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { BoardCache } from '../src/cache';
import type { DirectionGroup } from '../src/types';

const station = { id: '127', name: 'Times Sq–42 St' };
const dirs: DirectionGroup[] = [{ direction: 'N', label: 'Uptown', arrivals: [] }];

describe('BoardCache', () => {
  it('starts empty with stale=true and null weather', () => {
    const c = new BoardCache(station, 90);
    const b = c.get(1_700_000_000_000);
    expect(b.stale).toBe(true);
    expect(b.weather).toBeNull();
    expect(b.directions).toEqual([]);
  });

  it('marks fresh right after an update and stale after the threshold', () => {
    const c = new BoardCache(station, 90);
    c.setBoard(dirs, [], 1_700_000_000_000);
    expect(c.get(1_700_000_030_000).stale).toBe(false); // +30s
    expect(c.get(1_700_000_100_000).stale).toBe(true);  // +100s > 90s
  });

  it('stores weather independently of board updates', () => {
    const c = new BoardCache(station, 90);
    c.setWeather({ tempF: 72, condition: 'Clear', icon: 'clear' });
    expect(c.get(1_700_000_000_000).weather?.tempF).toBe(72);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run tests/cache.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Create `server/src/cache.ts`**

```ts
import type { Alert, BoardModel, DirectionGroup, Weather } from './types';

export class BoardCache {
  private directions: DirectionGroup[] = [];
  private alerts: Alert[] = [];
  private weather: Weather | null = null;
  private lastUpdatedMs: number | null = null;

  constructor(
    private readonly station: { id: string; name: string },
    private readonly staleThresholdSec: number,
  ) {}

  setBoard(directions: DirectionGroup[], alerts: Alert[], nowMs: number): void {
    this.directions = directions;
    this.alerts = alerts;
    this.lastUpdatedMs = nowMs;
  }

  setWeather(weather: Weather): void {
    this.weather = weather;
  }

  get(nowMs: number): BoardModel {
    const stale =
      this.lastUpdatedMs === null ||
      nowMs - this.lastUpdatedMs > this.staleThresholdSec * 1000;
    return {
      station: this.station,
      updatedAt: this.lastUpdatedMs ? new Date(this.lastUpdatedMs).toISOString() : new Date(0).toISOString(),
      stale,
      directions: this.directions,
      alerts: this.alerts,
      weather: this.weather,
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run tests/cache.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/cache.ts server/tests/cache.test.ts
git commit -m "feat: in-memory board cache with staleness"
```

---

## Task 8: Poller

**Files:**
- Create: `server/src/feeds/poller.ts`
- Test: `server/tests/poller.test.ts`

The poller fetches the station's trip-update feed(s) + the alerts feed, decodes them, runs the transforms, and writes to the cache. It injects `fetch`, `decode`, and a `nowMs` provider for testability, and isolates per-feed failures.

- [ ] **Step 1: Write failing test `server/tests/poller.test.ts`**

```ts
import { describe, it, expect, vi } from 'vitest';
import { pollOnce } from '../src/feeds/poller';
import { BoardCache } from '../src/cache';

const station = { id: '127', name: 'Times Sq–42 St', routes: ['1', 'N'] };

function decoded(entities: unknown[]) {
  return { entity: entities };
}

describe('pollOnce', () => {
  const NOW = 1_700_000_000_000;

  it('fetches station feeds + alerts, transforms, and updates the cache', async () => {
    const cache = new BoardCache({ id: '127', name: 'Times Sq–42 St' }, 90);

    const tripEntities = [{
      tripUpdate: { trip: { routeId: '1' }, stopTimeUpdate: [{ stopId: '127N', arrival: { time: 1_700_000_120 } }] },
    }];
    const alertEntities = [{
      alert: { effect: 'SIGNIFICANT_DELAYS', informedEntity: [{ routeId: '1' }], headerText: { translation: [{ text: 'Delays', language: 'en' }] } },
    }];

    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(0),
    }) as unknown as typeof fetch;

    // decode returns trip entities for trip feeds, alert entities for the alerts feed
    const decode = vi.fn()
      .mockReturnValueOnce(decoded(tripEntities))   // 123456s feed
      .mockReturnValueOnce(decoded(tripEntities))   // nqrw feed
      .mockReturnValueOnce(decoded(alertEntities)); // alerts feed

    await pollOnce(cache, station, decode, fakeFetch, () => NOW);

    const board = cache.get(NOW);
    expect(board.stale).toBe(false);
    expect(board.directions.find((d) => d.direction === 'N')!.arrivals[0].minutes).toBe(2);
    expect(board.alerts[0].text).toBe('Delays');
  });

  it('isolates a failing feed and still updates from the others', async () => {
    const cache = new BoardCache({ id: '127', name: 'Times Sq–42 St' }, 90);
    const tripEntities = [{
      tripUpdate: { trip: { routeId: 'N' }, stopTimeUpdate: [{ stopId: '127S', arrival: { time: 1_700_000_120 } }] },
    }];

    const fakeFetch = vi.fn()
      .mockRejectedValueOnce(new Error('feed down'))                       // 123456s fails
      .mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) }); // others ok

    const decode = vi.fn().mockReturnValue(decoded(tripEntities));

    await pollOnce(cache, station, decode, fakeFetch, () => NOW);

    const board = cache.get(NOW);
    expect(board.stale).toBe(false); // still updated from surviving feeds
    expect(board.directions.find((d) => d.direction === 'S')!.arrivals.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run tests/poller.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Create `server/src/feeds/poller.ts`**

```ts
import type { BoardCache } from '../cache';
import type { Alert, DirectionGroup } from '../types';
import { feedsForRoutes, feedUrl, ALERTS_URL } from './feedUrls';
import { transformArrivals } from './transform';
import { transformAlerts } from './alerts';
import { getRouteStyle, stopName } from '../staticGtfs';

export type DecodeFn = (bytes: Uint8Array) => { entity?: unknown[] };
type NowFn = () => number;

interface StationCtx { id: string; name: string; routes: string[]; }

async function fetchEntities(
  url: string,
  decode: DecodeFn,
  fetchFn: typeof fetch,
): Promise<unknown[]> {
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`Feed ${url} returned ${res.status}`);
  const buf = await res.arrayBuffer();
  const msg = decode(new Uint8Array(buf));
  return msg.entity ?? [];
}

export async function pollOnce(
  cache: BoardCache,
  station: StationCtx,
  decode: DecodeFn,
  fetchFn: typeof fetch = fetch,
  now: NowFn = () => Date.now(),
): Promise<void> {
  const feedIds = feedsForRoutes(station.routes);
  const tripUrls = feedIds.map(feedUrl);

  // Trip feeds (per-feed isolation: failures resolve to []).
  const tripResults = await Promise.allSettled(
    tripUrls.map((u) => fetchEntities(u, decode, fetchFn)),
  );
  const tripEntities: unknown[] = [];
  let anyTripOk = false;
  for (const r of tripResults) {
    if (r.status === 'fulfilled') { tripEntities.push(...r.value); anyTripOk = true; }
    else console.error('[poller] trip feed failed:', r.reason);
  }

  // Alerts feed (independent; failure -> empty alerts).
  let alertEntities: unknown[] = [];
  try {
    alertEntities = await fetchEntities(ALERTS_URL, decode, fetchFn);
  } catch (err) {
    console.error('[poller] alerts feed failed:', err);
  }

  if (!anyTripOk) {
    console.error('[poller] all trip feeds failed; keeping last-good board');
    return; // do not overwrite cache; staleness will flag it
  }

  const nowMs = now();
  const directions: DirectionGroup[] = transformArrivals(
    tripEntities as never[],
    station.id,
    nowMs,
    { stopName, routeStyle: getRouteStyle },
  );
  const alerts: Alert[] = transformAlerts(alertEntities as never[], station.routes);
  cache.setBoard(directions, alerts, nowMs);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run tests/poller.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/feeds/poller.ts server/tests/poller.test.ts
git commit -m "feat: feed poller with per-feed isolation"
```

---

## Task 9: API + entry point

**Files:**
- Create: `server/src/api.ts`
- Create: `server/src/index.ts`
- Test: `server/tests/api.test.ts`

- [ ] **Step 1: Write failing test `server/tests/api.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/api';
import { BoardCache } from '../src/cache';

describe('API', () => {
  const cache = new BoardCache({ id: '127', name: 'Times Sq–42 St' }, 90);
  const app = createApp(cache, { displayMode: 'kiosk' }, undefined);

  it('GET /api/health returns ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('GET /api/board returns the cached board with displayMode', async () => {
    const res = await request(app).get('/api/board');
    expect(res.status).toBe(200);
    expect(res.body.station.id).toBe('127');
    expect(res.body.displayMode).toBe('kiosk');
    expect(Array.isArray(res.body.directions)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run tests/api.test.ts`
Expected: FAIL — cannot find module `../src/api`.

- [ ] **Step 3: Create `server/src/api.ts`**

```ts
import express, { type Express } from 'express';
import type { BoardCache } from './cache';

interface ApiOptions { displayMode: string; }

export function createApp(
  cache: BoardCache,
  options: ApiOptions,
  staticDir?: string,
): Express {
  const app = express();

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/api/board', (_req, res) => {
    const board = cache.get(Date.now());
    res.json({ ...board, displayMode: options.displayMode });
  });

  if (staticDir) {
    app.use(express.static(staticDir));
    // SPA fallback for non-API routes
    app.get(/^(?!\/api).*/, (_req, res) => {
      res.sendFile('index.html', { root: staticDir });
    });
  }

  return app;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run tests/api.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Create `server/src/index.ts`** (entry point — wires everything; not unit-tested, exercised by the Docker smoke test)

```ts
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import { loadConfig } from './config';
import { BoardCache } from './cache';
import { createApp } from './api';
import { pollOnce, type DecodeFn } from './feeds/poller';
import { getStation } from './staticGtfs';
import { fetchWeather } from './weather';

const config = loadConfig();
const stationInfo = getStation(config.station);
const station = { id: config.station, name: stationInfo.name, routes: stationInfo.routes };

const cache = new BoardCache({ id: station.id, name: station.name }, config.staleThresholdSec);

const decode: DecodeFn = (bytes) =>
  GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(bytes) as { entity?: unknown[] };

async function pollFeeds() {
  try {
    await pollOnce(cache, station, decode);
  } catch (err) {
    console.error('[index] poll cycle error:', err);
  }
}

async function pollWeather() {
  try {
    cache.setWeather(await fetchWeather(config.weatherLat, config.weatherLon));
  } catch (err) {
    console.error('[index] weather error:', err);
  }
}

// Static dir: built web app copied next to dist in the Docker image.
const here = path.dirname(fileURLToPath(import.meta.url));
const staticDir = path.resolve(here, '../public');

const app = createApp(cache, { displayMode: config.displayMode }, staticDir);

void pollFeeds();
void pollWeather();
setInterval(pollFeeds, config.feedRefreshSec * 1000);
setInterval(pollWeather, config.weatherRefreshSec * 1000);

app.listen(config.port, () => {
  console.log(`MTA tracker listening on :${config.port} (station ${station.name})`);
});
```

- [ ] **Step 6: Verify the server compiles**

Run: `cd server && npx tsc --noEmit`
Expected: no type errors.

- [ ] **Step 7: Commit**

```bash
git add server/src/api.ts server/src/index.ts server/tests/api.test.ts
git commit -m "feat: express api and server entry point"
```

---

## Task 10: Web API client + types

**Files:**
- Create: `web/src/types.ts`
- Create: `web/src/api.ts`
- Test: `web/tests/api.test.ts`

- [ ] **Step 1: Create `web/src/types.ts`** (mirrors the server contract + `displayMode`)

```ts
export type Direction = 'N' | 'S';

export interface Arrival {
  route: string;
  color: string;
  textColor: string;
  destination: string;
  minutes: number;
}

export interface DirectionGroup {
  direction: Direction;
  label: string;
  arrivals: Arrival[];
}

export interface Alert {
  routes: string[];
  severity: string;
  text: string;
}

export interface Weather {
  tempF: number;
  condition: string;
  icon: string;
}

export interface Board {
  station: { id: string; name: string };
  updatedAt: string;
  stale: boolean;
  directions: DirectionGroup[];
  alerts: Alert[];
  weather: Weather | null;
  displayMode: 'kiosk' | 'phone' | 'auto';
}
```

- [ ] **Step 2: Write failing test `web/tests/api.test.ts`**

```ts
import { describe, it, expect, vi } from 'vitest';
import { fetchBoard } from '../src/api';

describe('fetchBoard', () => {
  it('GETs /api/board and returns the parsed board', async () => {
    const board = { station: { id: '127', name: 'Times Sq' }, directions: [], alerts: [], weather: null, stale: false, updatedAt: '', displayMode: 'kiosk' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => board }));
    const result = await fetchBoard();
    expect(result.station.id).toBe('127');
    expect(fetch).toHaveBeenCalledWith('/api/board');
  });

  it('throws on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    await expect(fetchBoard()).rejects.toThrow(/500/);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd web && npx vitest run tests/api.test.ts`
Expected: FAIL — cannot find module `../src/api`.

- [ ] **Step 4: Create `web/src/api.ts`**

```ts
import type { Board } from './types';

export async function fetchBoard(): Promise<Board> {
  const res = await fetch('/api/board');
  if (!res.ok) throw new Error(`Board fetch failed: ${res.status}`);
  return (await res.json()) as Board;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd web && npx vitest run tests/api.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add web/src/types.ts web/src/api.ts web/tests/api.test.ts
git commit -m "feat: web api client and types"
```

---

## Task 11: React components

**Files:**
- Create: `web/src/components/LineBullet.tsx`, `ArrivalRow.tsx`, `DirectionColumn.tsx`, `Alerts.tsx`, `Clock.tsx`, `Header.tsx`, `Board.tsx`
- Replace: `web/src/App.tsx`
- Test: `web/tests/components.test.tsx`, `web/tests/App.test.tsx`

- [ ] **Step 1: Write failing test `web/tests/components.test.tsx`**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LineBullet } from '../src/components/LineBullet';
import { DirectionColumn } from '../src/components/DirectionColumn';
import { Alerts } from '../src/components/Alerts';
import type { DirectionGroup } from '../src/types';

describe('components', () => {
  it('LineBullet renders the route with its colors', () => {
    render(<LineBullet route="1" color="#ee352e" textColor="#fff" />);
    const el = screen.getByText('1');
    expect(el).toBeInTheDocument();
    expect(el).toHaveStyle({ backgroundColor: '#ee352e' });
  });

  it('DirectionColumn lists arrivals with minutes and destination', () => {
    const group: DirectionGroup = {
      direction: 'N', label: 'Uptown',
      arrivals: [{ route: '1', color: '#ee352e', textColor: '#fff', destination: 'Van Cortlandt Park', minutes: 2 }],
    };
    render(<DirectionColumn group={group} />);
    expect(screen.getByText('Uptown')).toBeInTheDocument();
    expect(screen.getByText('Van Cortlandt Park')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('DirectionColumn shows an empty state when no arrivals', () => {
    render(<DirectionColumn group={{ direction: 'S', label: 'Downtown', arrivals: [] }} />);
    expect(screen.getByText(/no trains/i)).toBeInTheDocument();
  });

  it('Alerts renders nothing when empty and a band when present', () => {
    const { container, rerender } = render(<Alerts alerts={[]} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<Alerts alerts={[{ routes: ['N', 'Q'], severity: 'delay', text: 'Delays near 57 St' }]} />);
    expect(screen.getByText(/Delays near 57 St/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run tests/components.test.tsx`
Expected: FAIL — cannot find modules.

- [ ] **Step 3: Create `web/src/components/LineBullet.tsx`**

```tsx
interface Props { route: string; color: string; textColor: string; }

export function LineBullet({ route, color, textColor }: Props) {
  return (
    <span className="bullet" style={{ backgroundColor: color, color: textColor }}>
      {route}
    </span>
  );
}
```

- [ ] **Step 4: Create `web/src/components/ArrivalRow.tsx`**

```tsx
import type { Arrival } from '../types';
import { LineBullet } from './LineBullet';

export function ArrivalRow({ arrival }: { arrival: Arrival }) {
  return (
    <div className="arr">
      <LineBullet route={arrival.route} color={arrival.color} textColor={arrival.textColor} />
      <span className="dest">{arrival.destination}</span>
      <span className="mins">{arrival.minutes}<small> min</small></span>
    </div>
  );
}
```

- [ ] **Step 5: Create `web/src/components/DirectionColumn.tsx`**

```tsx
import type { DirectionGroup } from '../types';
import { ArrivalRow } from './ArrivalRow';

export function DirectionColumn({ group }: { group: DirectionGroup }) {
  const arrow = group.direction === 'N' ? '↑' : '↓';
  return (
    <div className="col">
      <div className="dir-label">{arrow} {group.label}</div>
      {group.arrivals.length === 0
        ? <div className="empty">No trains scheduled</div>
        : group.arrivals.slice(0, 6).map((a, i) => <ArrivalRow key={i} arrival={a} />)}
    </div>
  );
}
```

- [ ] **Step 6: Create `web/src/components/Alerts.tsx`**

```tsx
import type { Alert } from '../types';

export function Alerts({ alerts }: { alerts: Alert[] }) {
  if (alerts.length === 0) return null;
  return (
    <div className="alerts">
      {alerts.map((a, i) => (
        <div key={i} className="alert-line">
          <b>⚠ {a.routes.join('/')}:</b> {a.text}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 7: Create `web/src/components/Clock.tsx`**

```tsx
import { useEffect, useState } from 'react';

export function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const time = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return <div className="clock">{time}</div>;
}
```

- [ ] **Step 8: Create `web/src/components/Header.tsx`**

```tsx
import type { Weather } from '../types';
import { Clock } from './Clock';

interface Props { stationName: string; weather: Weather | null; stale: boolean; }

export function Header({ stationName, weather, stale }: Props) {
  return (
    <div className="board-top">
      <div className="station">
        {stationName}
        {stale && <span className="stale-badge">reconnecting…</span>}
      </div>
      <div className="meta">
        <Clock />
        {weather && <div className="weather">{weather.tempF}°F · {weather.condition}</div>}
      </div>
    </div>
  );
}
```

- [ ] **Step 9: Create `web/src/components/Board.tsx`**

```tsx
import type { Board as BoardData } from '../types';
import { Header } from './Header';
import { DirectionColumn } from './DirectionColumn';
import { Alerts } from './Alerts';

export function Board({ board }: { board: BoardData }) {
  return (
    <div className="board">
      <Header stationName={board.station.name} weather={board.weather} stale={board.stale} />
      <div className="cols">
        {board.directions.map((g) => <DirectionColumn key={g.direction} group={g} />)}
      </div>
      <Alerts alerts={board.alerts} />
    </div>
  );
}
```

- [ ] **Step 10: Run component test to verify it passes**

Run: `cd web && npx vitest run tests/components.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 11: Write failing test `web/tests/App.test.tsx`**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import App from '../src/App';

const board = {
  station: { id: '127', name: 'Times Sq–42 St' },
  updatedAt: '', stale: false, displayMode: 'kiosk',
  directions: [{ direction: 'N', label: 'Uptown', arrivals: [{ route: '1', color: '#ee352e', textColor: '#fff', destination: 'Van Cortlandt Park', minutes: 2 }] }],
  alerts: [], weather: { tempF: 72, condition: 'Clear', icon: 'clear' },
};

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => board }));
});

describe('App', () => {
  it('fetches the board on mount and renders it', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText('Times Sq–42 St')).toBeInTheDocument());
    expect(screen.getByText('Van Cortlandt Park')).toBeInTheDocument();
  });

  it('shows a loading state before data arrives', () => {
    render(<App />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 12: Run test to verify it fails**

Run: `cd web && npx vitest run tests/App.test.tsx`
Expected: FAIL — current placeholder App renders only static text.

- [ ] **Step 13: Replace `web/src/App.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react';
import type { Board as BoardData } from './types';
import { fetchBoard } from './api';
import { Board } from './components/Board';

const POLL_MS = 10_000;

export default function App() {
  const [board, setBoard] = useState<BoardData | null>(null);
  const [error, setError] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const data = await fetchBoard();
        if (active) { setBoard(data); setError(false); }
      } catch {
        if (active) setError(true); // keep last board on screen
      }
    }
    void load();
    timer.current = window.setInterval(load, POLL_MS);
    return () => { active = false; if (timer.current) window.clearInterval(timer.current); };
  }, []);

  if (!board) {
    return <div className="loading">{error ? 'Cannot reach server…' : 'Loading…'}</div>;
  }
  const display = error ? { ...board, stale: true } : board;
  return (
    <div className={`app mode-${board.displayMode}`}>
      <Board board={display} />
    </div>
  );
}
```

- [ ] **Step 14: Run App test to verify it passes**

Run: `cd web && npx vitest run tests/App.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 15: Commit**

```bash
git add web/src/components web/src/App.tsx web/tests/components.test.tsx web/tests/App.test.tsx
git commit -m "feat: react board components and polling app"
```

---

## Task 12: Styling (Layout A, dark theme, responsive)

**Files:**
- Replace: `web/src/styles.css`

- [ ] **Step 1: Replace `web/src/styles.css`**

```css
:root {
  --bg: #0b0b0d;
  --panel: #141417;
  --divider: #2a2a2e;
  --row-divider: #1b1b1f;
  --text: #ffffff;
  --muted: #8a8f98;
  --dim: #cfd2d6;
}

* { box-sizing: border-box; }

html, body, #root { margin: 0; height: 100%; }

body {
  background: var(--bg);
  color: var(--text);
  font-family: 'Helvetica Neue', Arial, sans-serif;
}

.app { min-height: 100vh; padding: 16px; }

.loading {
  min-height: 100vh; display: flex; align-items: center; justify-content: center;
  color: var(--muted); font-size: 20px;
}

.board { max-width: 1100px; margin: 0 auto; }

.board-top {
  display: flex; justify-content: space-between; align-items: flex-start;
  border-bottom: 1px solid var(--divider); padding-bottom: 12px; margin-bottom: 18px;
}

.station { font-size: 26px; font-weight: 700; letter-spacing: .3px; }

.stale-badge {
  margin-left: 12px; font-size: 12px; font-weight: 600; color: #f5c542;
  border: 1px solid #5c4408; border-radius: 6px; padding: 2px 8px; vertical-align: middle;
}

.meta { text-align: right; color: var(--dim); }
.clock { font-size: 30px; font-weight: 700; color: var(--text); line-height: 1.1; }
.weather { font-size: 15px; margin-top: 2px; }

.dir-label {
  font-size: 13px; text-transform: uppercase; letter-spacing: 1.5px;
  color: var(--muted); margin-bottom: 10px;
}

.cols { display: flex; gap: 32px; }
.col { flex: 1; }

.arr {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 0; border-bottom: 1px solid var(--row-divider);
}
.arr:last-child { border-bottom: none; }

.bullet {
  width: 34px; height: 34px; border-radius: 50%;
  display: inline-flex; align-items: center; justify-content: center;
  font-weight: 700; font-size: 18px; flex: 0 0 auto;
}

.dest { flex: 1; font-size: 18px; color: #e8eaed; }
.mins { font-weight: 700; font-size: 22px; }
.mins small { font-size: 13px; font-weight: 400; color: var(--muted); }

.empty { color: var(--muted); font-size: 15px; padding: 10px 0; }

.alerts {
  margin-top: 18px; background: #1a1206; border: 1px solid #5c4408;
  border-radius: 8px; padding: 10px 14px; font-size: 14px; color: #f5c542;
}
.alert-line { padding: 2px 0; }
.alert-line b { color: #ffd866; }

/* Kiosk mode: bigger type for a wall display */
.mode-kiosk .station { font-size: 34px; }
.mode-kiosk .clock { font-size: 40px; }
.mode-kiosk .dest { font-size: 22px; }
.mode-kiosk .mins { font-size: 28px; }
.mode-kiosk .bullet { width: 42px; height: 42px; font-size: 22px; }

/* Responsive: stack columns on narrow screens (phone) */
@media (max-width: 700px) {
  .cols { flex-direction: column; gap: 20px; }
  .station { font-size: 22px; }
  .clock { font-size: 26px; }
}
```

- [ ] **Step 2: Verify the web build succeeds**

Run: `cd web && npm run build`
Expected: TypeScript passes and Vite writes `dist/`.

- [ ] **Step 3: Commit**

```bash
git add web/src/styles.css
git commit -m "feat: departure board styling (layout A, responsive)"
```

---

## Task 13: Docker + compose + env template

**Files:**
- Create: `Dockerfile`
- Create: `docker-compose.yml`
- Create: `.env.example`

- [ ] **Step 1: Create `Dockerfile`** (multi-stage: build web, build server, slim runtime)

```dockerfile
# syntax=docker/dockerfile:1

# --- Stage 1: build web ---
FROM node:20-slim AS web-build
WORKDIR /web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# --- Stage 2: build server ---
FROM node:20-slim AS server-build
WORKDIR /server
COPY server/package*.json ./
RUN npm ci
COPY server/ ./
RUN npm run build

# --- Stage 3: runtime ---
FROM node:20-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY server/package*.json ./
RUN npm ci --omit=dev
COPY --from=server-build /server/dist ./dist
# bundled JSON data is imported at runtime; copy it next to dist
COPY --from=server-build /server/src/data ./dist/data
COPY --from=web-build /web/dist ./public
EXPOSE 8080
CMD ["node", "dist/index.js"]
```

> Note: `resolveJsonModule` inlines `routes.json`/`stations.json` into the compiled JS at build time, so the data is already in `dist`. The explicit `COPY ... ./dist/data` is a safety net in case the import is changed to a runtime read later. Keep it.

- [ ] **Step 2: Create `docker-compose.yml`**

```yaml
services:
  mta-tracker:
    build: .
    image: mta-tracker
    restart: unless-stopped
    ports:
      - "8080:8080"
    env_file:
      - .env
```

- [ ] **Step 3: Create `.env.example`**

```bash
# Your home subway station's GTFS parent stop id (see server/src/data/stations.json)
STATION=127

# kiosk | phone | auto
DISPLAY_MODE=kiosk

# Weather location (Open-Meteo, no API key needed)
WEATHER_LAT=40.7580
WEATHER_LON=-73.9855

# Poll intervals / staleness (seconds)
FEED_REFRESH_SEC=30
WEATHER_REFRESH_SEC=600
STALE_THRESHOLD_SEC=90

# Unused for subway; reserved for future bus (SIRI) support
MTA_API_KEY=

# HTTP port
PORT=8080
```

- [ ] **Step 4: Build the image (smoke test)**

Run: `docker build -t mta-tracker .`
Expected: image builds through all stages with no error.

- [ ] **Step 5: Run and verify the API + app respond**

Run:
```bash
cp .env.example .env
docker run --rm -d --name mta -p 8080:8080 --env-file .env mta-tracker
sleep 5
curl -s localhost:8080/api/health
curl -s localhost:8080/api/board | head -c 200
docker stop mta
```
Expected: `/api/health` returns `{"status":"ok"}`; `/api/board` returns JSON with `station.id` = `127` (arrivals may be empty if run when feeds are quiet, that's fine).

- [ ] **Step 6: Commit**

```bash
git add Dockerfile docker-compose.yml .env.example
git commit -m "feat: dockerization (multi-stage build + compose)"
```

---

## Task 14: README + final verification

**Files:**
- Create: `README.md`

- [ ] **Step 1: Create `README.md`**

````markdown
# MTA Display Tracker

A self-hosted NYC subway departure board for a single home station. Runs on a
Raspberry Pi Zero 2 W in Docker. Node + TypeScript backend, React frontend.
Pulls public MTA GTFS-realtime feeds (no API key required for subway) and
Open-Meteo weather (no key). See `docs/superpowers/specs/` and
`docs/superpowers/plans/` for the design and implementation plan.

## Quick start (Docker)

```bash
cp .env.example .env       # edit STATION, WEATHER_LAT/LON, DISPLAY_MODE
docker compose up -d --build
# open http://<pi-ip>:8080
```

## Configuration

All config is via env vars (see `.env.example`):

| Variable | Meaning |
|---|---|
| `STATION` | Your home station's GTFS parent stop id (see `server/src/data/stations.json`) |
| `DISPLAY_MODE` | `kiosk` (wall display) \| `phone` \| `auto` |
| `WEATHER_LAT` / `WEATHER_LON` | Weather location |
| `FEED_REFRESH_SEC` / `WEATHER_REFRESH_SEC` / `STALE_THRESHOLD_SEC` | Polling + staleness |
| `MTA_API_KEY` | Unused for subway; reserved for future bus support |
| `PORT` | HTTP port (default 8080) |

## Finding your station id

Station ids are GTFS parent stop ids (e.g. `127` = Times Sq–42 St). The bundled
`server/src/data/stations.json` includes a starter set. To add or refresh
stations from the official GTFS static feed:

1. Download the subway GTFS static zip from https://www.mta.info/developers and extract `stops.txt`.
2. `cd server && npx tsx scripts/build-stations.ts path/to/stops.txt [routes-by-station.json]`

## Kiosk display (HDMI)

Run a fullscreen browser pointed at the Pi, e.g. on the Pi itself:

```bash
chromium-browser --kiosk --noerrdialogs --disable-infobars http://localhost:8080
```

## Development

```bash
# Backend (terminal 1)
cd server && npm install && npm run dev      # http://localhost:8080

# Frontend (terminal 2)
cd web && npm install && npm run dev         # http://localhost:5173 (proxies /api to :8080)
```

## Tests

```bash
cd server && npm test
cd web && npm test
```
````

- [ ] **Step 2: Run the full server test suite**

Run: `cd server && npm test`
Expected: all suites pass (config, staticGtfs, feedUrls, transform, alerts, weather, cache, poller, api).

- [ ] **Step 3: Run the full web test suite**

Run: `cd web && npm test`
Expected: all suites pass (api, components, App).

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: add project README"
```

---

## Self-Review notes (for the implementer)

- **Spec coverage:** single-station board ✓ (config + staticGtfs + transform), direction split ✓ (transform groups N/S), countdowns ✓ (transform minutes), alerts ✓ (alerts transform + Alerts component), line bullets ✓ (routes.json + LineBullet), weather ✓ (weather service + Header), clock ✓ (Clock), kiosk/phone flag ✓ (DISPLAY_MODE → api → App className + CSS), renderer-agnostic API ✓ (`/api/board`), resilience/last-good + stale ✓ (cache + poller isolation + App), Docker multi-stage + compose ✓, Pi Zero 2 W arm64 ✓ (standard node:20-slim is multi-arch).
- **Type consistency:** `BoardModel`/`Board` fields match across `server/src/types.ts`, the `/api/board` response (adds `displayMode`), and `web/src/types.ts`. `transformArrivals` signature matches its call in `poller.ts`. `BoardCache.setBoard/setWeather/get` match usages in poller/index/api.
- **Direction caveat:** N/S maps to Uptown/Downtown, which is correct for most Manhattan trunk lines; some lines/areas use N/S differently (e.g. Brooklyn). Acceptable for a single home station; revisit if you pick a station where N/S labels read oddly.
