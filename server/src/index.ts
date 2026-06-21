import path from 'node:path';
import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import { loadConfig } from './config';
import { BoardCache } from './cache';
import { BoardStore } from './boardStore';
import { createApp } from './api';
import { pollArrivals, pollAlerts, type DecodeFn } from './feeds/poller';
import { pollBusStops } from './feeds/bus';
import { getStation } from './staticGtfs';
import { fetchWeather } from './weather';
import type { BoardEntry } from './types';

const config = loadConfig();

const cache = new BoardCache([], config.staleThresholdSec);

const seed: BoardEntry[] = [
  ...config.stations.map((id) => ({ id, type: 'subway' as const })),
  ...config.busStops.map((id) => ({ id, type: 'bus' as const })),
];

const store = new BoardStore(cache, config.dataDir);
store.init(seed);

const decode: DecodeFn = (bytes) =>
  GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(bytes) as { entity?: unknown[] };

let arrivalsInFlight = false;
async function pollArrivalsCycle() {
  if (arrivalsInFlight) return;
  arrivalsInFlight = true;
  try {
    const stations = store.subwayEntries().map((e) => {
      const info = getStation(e.id);
      return { id: e.id, name: info.name, routes: info.routes };
    });
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
    const stations = store.subwayEntries().map((e) => {
      const info = getStation(e.id);
      return { id: e.id, name: info.name, routes: info.routes };
    });
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
    const codes = store.busEntries().map((e) => e.id);
    await pollBusStops(cache, codes, config.mtaApiKey);
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
    cache.setWeather(await fetchWeather(config.weatherLat, config.weatherLon));
  } catch (err) {
    console.error('[index] weather error:', err);
  } finally {
    weatherInFlight = false;
  }
}

// Static dir: built web app copied next to dist in the Docker image.
const staticDir = path.resolve(__dirname, '../public');

const app = createApp(cache, { displayMode: config.displayMode, compact: config.compact }, staticDir);

void pollArrivalsCycle();
void pollAlertsCycle();
void pollWeatherCycle();
setInterval(pollArrivalsCycle, config.feedRefreshSec * 1000);
setInterval(pollAlertsCycle, config.alertsRefreshSec * 1000);
setInterval(pollWeatherCycle, config.weatherRefreshSec * 1000);

if (config.mtaApiKey !== '') {
  // Started whenever a key is present; pollBusStops no-ops on an empty code list,
  // so bus stops added later (via the store) are picked up on the next tick.
  void pollBusCycle();
  setInterval(pollBusCycle, config.feedRefreshSec * 1000);
}

app.listen(config.port, () => {
  const entries = store.entries();
  console.log(
    `MTA tracker listening on :${config.port} (loaded ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'} from store: ${store.subwayEntries().length} subway, ${store.busEntries().length} bus; dataDir=${config.dataDir})`,
  );
});
