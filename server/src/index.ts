import path from 'node:path';
import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import { loadConfig } from './config';
import { BoardCache } from './cache';
import { createApp } from './api';
import { pollArrivals, pollAlerts, type DecodeFn } from './feeds/poller';
import { getStation } from './staticGtfs';
import { fetchWeather } from './weather';

const config = loadConfig();
const stations = config.stations.map((id) => {
  const info = getStation(id);
  return { id, name: info.name, routes: info.routes };
});

const cache = new BoardCache(
  stations.map((s) => ({ id: s.id, name: s.name })),
  config.staleThresholdSec,
);

const decode: DecodeFn = (bytes) =>
  GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(bytes) as { entity?: unknown[] };

let arrivalsInFlight = false;
async function pollArrivalsCycle() {
  if (arrivalsInFlight) return;
  arrivalsInFlight = true;
  try {
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
    await pollAlerts(cache, stations, decode);
  } catch (err) {
    console.error('[index] alerts poll cycle error:', err);
  } finally {
    alertsInFlight = false;
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

const app = createApp(cache, { displayMode: config.displayMode }, staticDir);

void pollArrivalsCycle();
void pollAlertsCycle();
void pollWeatherCycle();
setInterval(pollArrivalsCycle, config.feedRefreshSec * 1000);
setInterval(pollAlertsCycle, config.alertsRefreshSec * 1000);
setInterval(pollWeatherCycle, config.weatherRefreshSec * 1000);

app.listen(config.port, () => {
  const stationNames = stations.map((s) => s.name).join(', ');
  console.log(`MTA tracker listening on :${config.port} (${stations.length} station${stations.length === 1 ? '' : 's'}: ${stationNames})`);
});
