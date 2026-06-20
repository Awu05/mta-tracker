# MTA Display Tracker — Design Spec

**Date:** 2026-06-20
**Status:** Approved (pending written-spec review)

## Summary

A self-hosted NYC subway "departure board" that runs on a Raspberry Pi Zero 2 W.
It polls the MTA's public GTFS-realtime feeds, filters arrivals to a single configured
home station, and serves a React departure-board UI plus a renderer-agnostic JSON API.
The board shows upcoming arrivals (countdowns) split by direction, service alerts, line
bullets, current time, and local weather.

## Goals

- Show live upcoming arrivals for **one configured home subway station**, split by direction.
- Display service alerts affecting that station's lines.
- Show colored MTA line bullets, a live clock, and current weather.
- Run on a **Pi Zero 2 W** in **Docker**, lightweight and always-on.
- Backend exposes a **renderer-agnostic JSON API** so a future LED/e-ink renderer can reuse it.
- Support multiple viewing contexts (HDMI kiosk, phone/laptop) via a `mode` flag.

## Non-Goals (YAGNI)

- No multi-station search/picker (single configured station only).
- No bus / commuter-rail support now — but the config wires in an optional `MTA_API_KEY`
  so bus (SIRI) support can be added later.
- No physical LED/e-ink renderer now — only the API contract that would enable it.
- No historical data, trip planning, or accounts.

## Tech Stack

- **Backend:** Node.js + TypeScript.
- **Frontend:** React + TypeScript (built to static assets, served by the backend).
- **Feed decoding:** `gtfs-realtime-bindings` (protobuf).
- **Weather:** Open-Meteo (free, no API key; lat/lon from config).
- **Container:** Single Docker image, multi-stage build, `arm64`/`armv7` (Pi Zero 2 W).

## Architecture

Single container, single Node process (Option A):

```
┌─────────────── Pi Zero 2 W (Docker) ───────────────┐
│  Node + TypeScript process                          │
│   ├─ Poller:   fetch MTA GTFS-rt feeds (~30s),      │
│   │            decode protobuf, filter to station,  │
│   │            compute countdowns, cache in memory  │
│   ├─ Weather:  fetch Open-Meteo (~10 min), cache    │
│   ├─ API:      GET /api/board → JSON (the contract) │
│   └─ Static:   serve built React app                │
└─────────────────────────────────────────────────────┘
   ▲ browser (HDMI kiosk fullscreen OR phone) polls /api/board (~10s)
```

The backend does all heavy lifting (decode, filter, countdown math) once per poll cycle
and caches the result. Clients fetch small JSON only, keeping both the Pi and clients light.

### Components & responsibilities

- **Feed poller** — knows which feed URL(s) serve the configured station, fetches them on
  an interval, decodes protobuf, hands raw entities to the filter. Per-feed failures are
  isolated (one bad feed does not break the others).
- **Arrival filter / transformer** — pure functions: given decoded feed entities + station
  config + "now", produce a normalized board model (arrivals grouped by direction → route,
  soonest-first, with minutes-away). Easily unit-testable from fixtures.
- **Static GTFS lookup** — bundled generated JSON mapping station → stop ID, name, served
  routes → feed; plus route → color/bullet style (official MTA colors).
- **Weather service** — fetches Open-Meteo on its own interval, caches latest.
- **Cache / state** — holds last-good board model + weather + `lastUpdated` timestamps.
- **API layer** — `GET /api/board` returns the cached model (never blocks on a live fetch);
  `GET /api/health` for liveness.
- **Static server** — serves the built React app.
- **Frontend** — polls `/api/board`, renders the split-column board (layout A), shows a
  stale/reconnecting indicator when data is old, renders the live clock client-side.

## Data Flow

1. Poller fetches station's feed(s) every ~30s → decode protobuf.
2. Filter `stopTimeUpdate`s to the station's directional stop IDs (e.g. `127N`/`127S`),
   compute `arrival − now` minutes, group by direction → route, sort soonest-first.
3. Merge in service alerts affecting the station's routes.
4. Store normalized board model + `lastUpdated` in cache.
5. Weather service independently refreshes weather (~10 min) into cache.
6. `GET /api/board` returns `{ station, updatedAt, directions: [...], alerts: [...], weather }`.
7. Frontend polls `/api/board` (~10s) and re-renders; clock ticks client-side every second.

### `/api/board` response shape (the renderer-agnostic contract)

```jsonc
{
  "station": { "id": "127", "name": "Times Sq–42 St" },
  "updatedAt": "2026-06-20T13:41:02Z",
  "stale": false,
  "directions": [
    {
      "label": "Uptown", "direction": "N",
      "arrivals": [
        { "route": "1", "color": "#ee352e", "destination": "Van Cortlandt Park", "minutes": 2 }
      ]
    },
    { "label": "Downtown", "direction": "S", "arrivals": [ /* ... */ ] }
  ],
  "alerts": [
    { "routes": ["N","Q"], "severity": "delay", "text": "Northbound delays near 57 St." }
  ],
  "weather": { "tempF": 72, "condition": "Clear", "icon": "clear" }
}
```

## UI / Layout (Approved: Layout A — split columns)

- **Header:** station name (left); clock + weather (right).
- **Body:** two columns — **↑ Uptown** and **↓ Downtown** — each a list of
  `bullet • destination • minutes`. Columns **stack vertically on narrow screens** (phone).
- **Alerts:** strip across the bottom, styled as a warning band; hidden when none.
- **Dark theme**, large type, official MTA line-bullet colors. Optimized for glanceability.
- **Stale indicator:** subtle badge when `stale: true` (data older than threshold).

## Configuration (env vars / `.env`, read at startup)

| Variable | Purpose | Example |
|---|---|---|
| `STATION` | Home station stop ID (parent) | `127` |
| `DISPLAY_MODE` | `kiosk` \| `phone` \| `auto` | `kiosk` |
| `WEATHER_LAT` / `WEATHER_LON` | Weather location | `40.7580` / `-73.9855` |
| `FEED_REFRESH_SEC` | MTA poll interval | `30` |
| `WEATHER_REFRESH_SEC` | Weather poll interval | `600` |
| `STALE_THRESHOLD_SEC` | When to flag data stale | `90` |
| `MTA_API_KEY` | Unused for subway; reserved for future bus | *(empty)* |
| `PORT` | HTTP port | `8080` |

## Error Handling / Resilience

- Feed fetch/decode failure → keep serving **last-good cached data**; update `stale` flag
  based on `updatedAt` vs `STALE_THRESHOLD_SEC`.
- Per-feed isolation: one failing feed does not affect others.
- Weather failure → keep last weather; never blocks the board.
- Frontend: if `/api/board` fails, keep last data on screen and show a reconnecting badge.
- API never blocks on a live upstream fetch — it always returns cached state immediately.

## Testing Strategy

- **Unit (core):** arrival filter/transformer and countdown math against saved feed
  fixtures — the highest-value, fully deterministic tests.
- **Unit:** static GTFS lookup (station → feeds/routes), config parsing/validation.
- **Integration:** `/api/board` and `/api/health` with the poller mocked.
- **Frontend:** board component renders directions/alerts/stale state from sample JSON.
- **Build smoke:** Docker image builds and container serves the app + API.

## Containerization

- **Multi-stage Dockerfile:** stage 1 builds the React app and compiles TS; stage 2 is a
  slim Node runtime with only production deps + build artifacts + bundled static GTFS JSON.
- Targets `arm64`/`armv7` (Pi Zero 2 W). Standard Node base images apply.
- Run via `docker run` (single image); a `docker-compose.yml` is included for convenience
  (env file, restart policy, port mapping).
- `restart: unless-stopped` for always-on behavior.

## Open Questions / Future

- Exact station selection ergonomics (stop ID vs friendly name) — start with stop ID +
  bundled name lookup.
- Per-mode layout switch (kiosk columns vs phone stacked) is supported by responsive CSS;
  the `DISPLAY_MODE` flag can later force a specific layout if desired.
- Future: bus (SIRI) support via `MTA_API_KEY`; physical LED/e-ink renderer consuming
  `/api/board`.
