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
  // Memoized with a short TTL so coincident poll cycles (arrivals/alerts/bus/weather)
  // share one repo read instead of each independently re-querying activeBoards().
  const PLAN_TTL_MS = 5000;
  let cachedPlan: ReturnType<typeof buildPollPlan> | null = null;
  let cachedPlanAtMs = 0;
  async function plan() {
    const now = Date.now();
    if (cachedPlan && now - cachedPlanAtMs < PLAN_TTL_MS) return cachedPlan;
    const boards = await repo.activeBoards(config.activeTtlMs);
    cachedPlan = buildPollPlan(boards);
    cachedPlanAtMs = now;
    return cachedPlan;
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
      // pollArrivalsCycle is the SINGLE owner of BoardCache membership: it is the only
      // cycle that calls cache.reconcile(), and it includes bus codes (not just subway)
      // so bus stations aren't evicted between bus polls. This must keep running at the
      // shortest feed interval (it ties with the bus cycle at FEED_REFRESH_SEC) so cache
      // membership stays current with active boards.
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
      weatherCache.retain(locations);
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
