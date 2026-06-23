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
  let cachedSubwayCtx: { id: string; name: string; routes: string[] }[] = [];
  let cachedPlanAtMs = 0;
  async function plan() {
    const now = Date.now();
    if (cachedPlan && now - cachedPlanAtMs < PLAN_TTL_MS) return cachedPlan;
    const boards = await repo.activeBoards(config.activeTtlMs);
    cachedPlan = buildPollPlan(boards);
    cachedSubwayCtx = subwayCtx(cachedPlan.subwayIds);
    cachedPlanAtMs = now;
    return cachedPlan;
  }

  function subwayCtx(ids: string[]): { id: string; name: string; routes: string[] }[] {
    return ids.flatMap((id) => {
      try {
        const info = getStation(id);
        return [{ id, name: info.name, routes: info.routes }];
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
      await plan();
      const subway: StationMeta[] = cachedSubwayCtx.map((c) => ({ id: c.id, name: c.name, type: 'subway' as const }));
      const bus: StationMeta[] = cachedPlan!.busCodes.map((id) => ({ id, name: id, type: 'bus' as const }));
      // pollArrivalsCycle is the SINGLE owner of BoardCache membership: it is the only
      // cycle that calls cache.reconcile(), and it includes bus codes (not just subway)
      // so bus stations aren't evicted between bus polls. This must keep running at the
      // shortest feed interval (it ties with the bus cycle at FEED_REFRESH_SEC) so cache
      // membership stays current with active boards.
      cache.reconcile([...subway, ...bus]);
      await pollArrivals(cache, cachedSubwayCtx, decode);
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
      await plan();
      await pollAlerts(cache, cachedSubwayCtx, decode);
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
    // Invalidate the memoized plan BEFORE triggering the immediate poll cycle below.
    // Without this, a board mutation (add/remove station) can race a still-fresh
    // memoized plan computed before the mutation landed in the repo snapshot, so the
    // immediate pollArrivalsCycle()/pollBusCycle() would reconcile() the cache against
    // a stale plan and evict the just-registered station until the next TTL/interval
    // recompute. Forcing a fresh plan() read here keeps "register so it appears
    // immediately" true while leaving the periodic TTL-based memoization intact.
    cachedPlan = null;
    if (entry?.type === 'bus') void pollBusCycle();
    else { void pollArrivalsCycle(); void pollAlertsCycle(); }
  }

  async function onWeatherChange(lat: number, lon: number) {
    // Invalidate the memo so the new location is in the next plan() (and the old
    // one gets retain()-evicted). Fetch its weather right now so the board shows
    // it on the client's immediate reload instead of waiting up to
    // WEATHER_REFRESH_SEC for the scheduled cycle.
    cachedPlan = null;
    try {
      weatherCache.set(lat, lon, await fetchWeather(lat, lon));
    } catch (err) {
      console.error('[index] immediate weather fetch failed for', { lat, lon }, err);
    }
  }

  const app = createApp({
    cache, repo, weatherCache,
    defaultLat: config.weatherLat, defaultLon: config.weatherLon,
    displayMode: config.displayMode, compact: config.compact,
    mtaApiKey: config.mtaApiKey, onBoardChange, onWeatherChange, staticDir,
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
