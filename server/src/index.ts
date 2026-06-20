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
const staticDir = path.resolve(__dirname, '../public');

const app = createApp(cache, { displayMode: config.displayMode }, staticDir);

void pollFeeds();
void pollWeather();
setInterval(pollFeeds, config.feedRefreshSec * 1000);
setInterval(pollWeather, config.weatherRefreshSec * 1000);

app.listen(config.port, () => {
  console.log(`MTA tracker listening on :${config.port} (station ${station.name})`);
});
