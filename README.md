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

## Architecture

Single Node process: a poller fetches the configured station's MTA GTFS-realtime
feed(s) every ~30s, decodes the protobuf, filters arrivals to your station
(split by direction), and caches a normalized board model in memory. A weather
service polls Open-Meteo separately. Express serves `GET /api/board` (a
renderer-agnostic JSON contract) and the built React app, which polls the API
every ~10s and renders the split-column departure board. Failed feed fetches
keep the last-good data and surface a "stale" indicator instead of blanking.
