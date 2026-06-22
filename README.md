# MTA Display Tracker

A self-hosted **NYC subway departure board** for one or more home stations — built to run
on a Raspberry Pi Zero 2 W in Docker, but it runs anywhere Node + Docker do.

It pulls the **public MTA GTFS-realtime feeds** (no API key required for subway), **MTA Bus
Time** (SIRI; needs a free key) for buses, and **Open-Meteo** weather (no key), and serves a
clean, dark, glanceable board: live arrival countdowns, service alerts, colored line bullets,
a clock, and current weather. The backend exposes a small renderer-agnostic JSON API, so the
React board is just one possible front end.

The server is **multi-board**: every visitor gets their own board (a short code in the URL),
so one deployment can drive your kiosk, your phone, and a friend's display, each with its own
stations and weather — see [How it's hosted](#how-its-hosted--multi-board).

![board](docs/board-preview.png)

Click the weather in the top bar to expand a full-width forecast (next 12 hours + 5 days):

![board with forecast expanded](docs/board-preview-2.png)

## Features

- 🚇 **Live subway arrivals** for any station(s), split into Uptown / Downtown with minute countdowns.
- 🚌 **Live bus arrivals** (MTA Bus Time) for any stop(s) — a single soonest-first list per stop, with "approaching / N stops away" when there's no ETA.
- 🏙️ **Multiple stations/stops** at once, rendered as stacked sections.
- 🔎 **Add stations from the app** — an Edit mode lets you search a station by name and add it (no IDs), then pick from auto-suggested **nearby bus stops**. The list is saved on the server (per board) and shared by every display that opens that board's URL.
- ⚠️ **Service alerts** per station, with severity (delay / suspended / info) inferred from the feed. They start minimized (severe alerts + a count summary) and expand on click.
- 🎨 **Official line bullets** (correct MTA colors) for quick scanning.
- 🌤️ **Weather + clock** in a shared top bar — a condition icon with the current temp; click it to expand a **full-width forecast** (next 12 hours + next 5 days, with precip chance) styled like the departure tables.
- 🖥️ **Kiosk or phone** layouts via a single `DISPLAY_MODE` flag (responsive either way).
- 🧱 **Resilient**: failed feed fetches keep the last-good data and show a "stale" indicator instead of blanking; per-feed isolation; fetch timeouts.
- 🐳 **Dockerized**: multi-stage build, non-root runtime, healthcheck, `restart: unless-stopped`.
- 🗽 **All 496 subway stations bundled** — pick any stop as a home station.

## Quick start (Docker)

```bash
cp .env.example .env       # optional: set WEATHER_LAT/LON default, ACTIVE_TTL_DAYS, DISPLAY_MODE
docker compose up -d --build
# open http://<host-ip>:8080
```

Visiting the server for the first time creates **your own board** and redirects you to its
URL, `/b/<code>` (a short random code) — a cookie remembers it, so reopening the bare host URL
on the same device takes you back to the same board. Bookmark or share the `/b/<code>` URL
directly to come back to it from another device, or use the **🔗 Copy link** button in the
header. Then click **✎ Edit** to search & add stations (see
[Editing the board](#editing-the-board)).

That's it — one container serves both the JSON API and the built web app. Board configs are
stored in **Postgres** (the bundled `db` service), so they survive restarts and are shared by
every display that opens that board's URL.

## How it's hosted / multi-board

This isn't a single global board — every device that opens the site gets its **own board**,
identified by the code in `/b/<code>`:

- The first time a device hits `/`, the server mints a code, stores a `board` cookie, and
  redirects to `/b/<code>`. From then on the cookie brings that device back to the same board.
- Anyone with the `/b/<code>` URL can view and edit that board — there's no login. Codes are
  short random strings, not secret-strength, so treat the URL as **unguessable but
  unauthenticated**: don't rely on it to keep anything private.
- Each board has its own stations, bus stops, and weather location, all stored in Postgres.
- A kiosk or e-ink panel just needs to open one specific `/b/<code>` URL (e.g. via the kiosk
  browser flag below) — it'll keep showing that board on every refresh regardless of cookies.
- Boards that haven't been opened in a while (`ACTIVE_TTL_DAYS`, default 7) stop being polled
  in the background to save API calls; opening the URL again resumes polling immediately.
- If `DATABASE_URL` isn't set, the server falls back to an **in-memory** store — fine for local
  dev, but boards disappear on restart.

## Configuration

All configuration is environment variables (see [`.env.example`](.env.example)):

| Variable | Meaning |
|---|---|
| `DATABASE_URL` | Postgres connection string for board storage (e.g. `postgres://mta:mta@db:5432/mta`). `docker-compose.yml` sets this for the bundled `db` service automatically. If unset, boards are kept in memory only (not persisted). |
| `ACTIVE_TTL_DAYS` | Boards not opened within this many days stop being polled in the background (default `7`). They still work fine when reopened. |
| `DISPLAY_MODE` | `kiosk` (large type for a wall display) \| `phone` \| `auto` |
| `COMPACT` | Default compact view (`true`/`false`) — denser layout, fewer arrivals, severe-only alerts. Overridable per device via `?compact=1`/`?compact=0`. See [Compact view](#compact-view). |
| `WEATHER_LAT` / `WEATHER_LON` | **Default** weather location for newly created boards — each board can change its own location afterward via the location picker in Edit mode. |
| `FEED_REFRESH_SEC` | Arrival feed poll interval (default `30`) |
| `ALERTS_REFRESH_SEC` | Alerts feed poll interval (default `120` — alerts change slowly) |
| `WEATHER_REFRESH_SEC` | Weather poll interval (default `600`) |
| `STALE_THRESHOLD_SEC` | When to flag arrivals as stale (default `90`) |
| `MTA_API_KEY` | MTA Bus Time API key — required only for bus stops (subway needs no key). |
| `PORT` | HTTP port (default `8080`) |

### A note on station "complexes"

The official GTFS models large multi-line complexes as **separate parent stations**. For
example, Times Square is four ids:

| id | lines |
| --- | --- |
| `127` | 1 2 3 |
| `725` | 7 |
| `902` | 42 St Shuttle (S) |
| `R16` | N Q R W |

So to show *all* Times Sq trains, add all four ids via the Edit UI's station search. Most
stations are a single id (e.g. `R01` = Astoria-Ditmars Blvd, J/Z) — see
[Finding your station id](#finding-your-station-id) if you'd rather look ids up directly.

## Compact view

Compact mode is built for small or e-ink displays. It:

- shows fewer arrivals per direction (3 instead of 6),
- shows **only severe alerts** (delays / suspensions, capped at 3) plus a one-line
  count summary — the noisy "skip-stop" info notices are collapsed into the count,
- tightens spacing and type for denser, glanceable output.

Set the default with the `COMPACT` env var. Because one server can drive several
displays, any device can **override per-URL**:

- `http://<host>:8080/?compact=1` — force compact (e.g. your e-ink panel)
- `http://<host>:8080/?compact=0` — force full (e.g. a wall monitor)
- no param — use the server's `COMPACT` default

## Editing the board

Click **✎ Edit** in the top bar. While editing you can:

- **Search & add a station** — type a station name (no IDs to look up) and click a result to add it. Searching for a station that's **already on the board** just reopens its nearby-bus list, so you can come back later to add more stops.
- **Add / remove nearby buses** — right after adding a station, a checklist of the **closest bus stops** (with their routes and distance) appears. Click anywhere on a row to toggle it: a green check adds the stop, unchecking removes it. Bus lookups need `MTA_API_KEY`.
- **Remove** — each section shows an **×** to drop it from the board.
- **Set the weather location** — search a city/zip or click "Use my location" to set this
  board's weather, overriding the `WEATHER_LAT`/`WEATHER_LON` default.

Changes are saved on the **server** in Postgres, keyed to this board's code, and shared by
every display that opens the same `/b/<code>` URL — edit from your phone and the kiosk/e-ink
panel update on their next refresh. Click **✓ Done** to return to the clean board. A brand-new
board starts empty — click **✎ Edit** and search for a station to get going.

## Finding your station id

You usually don't need this anymore — just use the [Edit UI](#editing-the-board) to search by
name. But if you'd rather look an id up directly: station ids are GTFS parent stop ids. Every station is bundled in
[`server/src/data/stations.json`](server/src/data/stations.json) (id → name + routes), so you
can grep it for your stop:

```bash
grep -i "ditmars" server/src/data/stations.json   # -> "R01": { "name": "Astoria-Ditmars Blvd", "routes": ["J","Z"] }
```

### Refreshing the bundled data (optional)

The station data is generated from the MTA's official GTFS **static** feed. To refresh it:

1. Download the subway GTFS static zip from <https://www.mta.info/developers> and extract it.
2. Regenerate the two data files:

   ```bash
   cd server
   npx tsx scripts/build-stations.ts /path/to/extracted/gtfs   # -> src/data/stations.json (id -> {name, routes})
   npx tsx scripts/build-stops.ts    /path/to/extracted/gtfs/stops.txt   # -> src/data/stops.json (id -> name, for destinations)
   ```

- **`stations.json`** = every station with its route list; drives the search results in the Edit UI, which feeds to poll for added stations, and alert filtering.
- **`stops.json`** = complete stop-id → name map, used to label arrival **destinations**.

## Bus stops

Buses use **MTA Bus Time** (the SIRI API), which needs a free key:

1. Get a key at <https://bustime.mta.info/wiki/Developers/Index> and set `MTA_API_KEY`.
2. Add a subway station via the Edit UI — the **nearby-stop picker** that appears right after
   shows the closest bus stops (with routes and distance) so you can add them with a click. No
   need to look up bus stop codes by hand.

Each bus stop renders as its own section: a single soonest-first list of `route → destination →
minutes` (a bus-stop pole is one direction). When there's no live ETA the row shows the feed's
status instead ("approaching", "N stops away", "at stop"). Bus service alerts come from the same
feed and show under the stop, just like subway alerts. Bus route badges are rounded rectangles
(with an SBS variant) to distinguish them from the round subway bullets.

## API

`GET /api/boards/:code` returns that board as JSON (the renderer-agnostic contract); visiting
it also registers the board's stations for polling if they aren't cached yet. Each entry in
`stations` has a `type` of `"subway"` (uses `directions`, split N/S) or `"bus"` (uses a flat
`arrivals` list); `arrivals[].minutes` is `null` when there's no ETA, with a `note` string
(e.g. `"approaching"`) instead.

```jsonc
{
  "code": "ab12cd34",
  "updatedAt": "2026-06-21T14:02:11.000Z",
  "stale": false,
  "displayMode": "kiosk",
  "weather": {
    "tempF": 79, "condition": "Overcast", "icon": "cloudy",
    "hourly": [{ "time": "2026-06-21T15:00", "tempF": 79, "icon": "cloudy", "precipPct": 10 }],
    "daily":  [{ "date": "2026-06-21", "hiF": 82, "loF": 68, "icon": "cloudy", "precipPct": 20 }]
  },
  "stations": [
    {
      "station": { "id": "127", "name": "Times Sq-42 St" },
      "updatedAt": "2026-06-21T14:02:11.000Z",
      "stale": false,
      "directions": [
        { "direction": "N", "label": "Uptown", "arrivals": [
          { "route": "1", "color": "#ee352e", "textColor": "#ffffff",
            "destination": "Van Cortlandt Park-242 St", "minutes": 2 }
        ]},
        { "direction": "S", "label": "Downtown", "arrivals": [] }
      ],
      "alerts": [
        { "routes": ["2","3"], "severity": "delay", "text": "Southbound 2/3 trains are delayed." }
      ]
    }
  ]
}
```

`GET /api/health` returns `{ "status": "ok" }` (used by the Docker healthcheck).

Board editing (used by the Edit UI), all scoped to one board's `:code`:

- `GET /api/stations/search?q=` — subway search → `[{ id, name, routes }]`.
- `GET /api/nearby-buses?stationId=&code=` — nearby bus stops → `[{ code, name, routes, distanceMeters, alreadyAdded }]`.
- `POST /api/boards/:code/stations` `{ id, type }` — add a subway station or bus stop.
- `DELETE /api/boards/:code/stations` `{ id, type }` — remove one.
- `PUT /api/boards/:code/weather` `{ lat, lon }` — set this board's weather location.
- `GET /api/geocode?q=` — look up a place name → `[{ name, admin1, country, lat, lon }]`, used by the location picker.

## Kiosk display (HDMI)

Point a fullscreen browser at **that device's specific board URL** (visit the bare host once
to mint one, then use its `/b/<code>` link) so the kiosk always shows the same board regardless
of cookies, e.g. on a Pi driving a monitor:

```bash
chromium-browser --kiosk --noerrdialogs --disable-infobars http://localhost:8080/b/<code>
```

## Architecture

A single Node process does all the work and the browser just renders small JSON:

```text
┌──────────────────────── Docker (Node + TypeScript) ─────────────────────────┐
│  Arrivals poller  ── fetch station feed(s) every ~30s, decode protobuf,      │
│                       filter per station (split N/S), cache board model       │
│  Alerts poller    ── fetch the alerts feed every ~120s, filter per station   │
│  Bus poller       ── SIRI StopMonitoring per bus stop (~30s): arrivals+alerts │
│  Weather service  ── fetch Open-Meteo per board location every ~10 min       │
│  Postgres         ── stores each board's code, stations, weather location    │
│  Express          ── GET /api/boards/:code (JSON contract) + /api/health     │
│                      + serves the built React app                            │
└──────────────────────────────────────────────────────────────────────────────┘
        ▲ browser (kiosk fullscreen or phone) polls /api/boards/:code every ~10s
```

- Feeds are fetched **once per cycle** and fanned out to every *active* board's stations (no
  duplicate fetches when boards share stations/lines). All fetches have timeouts and per-feed
  isolation; a single bad feed never blanks a board.
- `/api/boards/:code` is mostly a cache read — the contract a future renderer (e.g. an LED/e-ink
  display) could consume instead of the web app — though the first request for a newly-added
  station registers it for polling.

See [`docs/superpowers/specs/`](docs/superpowers/specs/) and
[`docs/superpowers/plans/`](docs/superpowers/plans/) for the original design + implementation plan.

## Tech stack

- **Backend:** Node.js 20, TypeScript (compiled to CommonJS), Express, `gtfs-realtime-bindings`.
- **Frontend:** React 18 + Vite + TypeScript.
- **Tests:** Vitest (+ Supertest, Testing Library).
- **Container:** multi-stage Docker, `node:20-slim` (arm64/armv7-friendly).

## Development

```bash
# Backend (terminal 1)
cd server && npm install && npm run dev      # http://localhost:8080

# Frontend (terminal 2)
cd web && npm install && npm run dev         # http://localhost:5173 (proxies /api -> :8080)
```

## Tests

```bash
cd server && npm test    # unit + API tests
cd web && npm test       # component + app tests
```

## License

MIT
