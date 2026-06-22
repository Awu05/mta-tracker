import type { BoardCache } from '../cache';
import type { Alert } from '../types';
import { feedsForRoutes, feedUrl, ALERTS_URL } from './feedUrls';
import { transformArrivalsByStation } from './transform';
import { transformAlerts } from './alerts';
import { getRouteStyle, stopName } from '../staticGtfs';

export type DecodeFn = (bytes: Uint8Array) => { entity?: unknown[] };
type NowFn = () => number;

interface StationCtx { id: string; name: string; routes: string[]; }

const FETCH_TIMEOUT_MS = 12_000;

async function fetchEntities(
  url: string,
  decode: DecodeFn,
  fetchFn: typeof fetch,
): Promise<unknown[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetchFn(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`Feed ${url} returned ${res.status}`);
    const buf = await res.arrayBuffer();
    const msg = decode(new Uint8Array(buf));
    return msg.entity ?? [];
  } finally {
    clearTimeout(timer);
  }
}

export async function pollArrivals(
  cache: BoardCache,
  stations: StationCtx[],
  decode: DecodeFn,
  fetchFn: typeof fetch = fetch,
  now: NowFn = () => Date.now(),
): Promise<void> {
  const feedIds = [...new Set(stations.flatMap((s) => feedsForRoutes(s.routes)))];
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

  if (!anyTripOk) {
    console.error('[poller] all trip feeds failed; keeping last-good board');
    return; // do not overwrite cache; staleness will flag it
  }

  const nowMs = now();
  const byStation = transformArrivalsByStation(
    tripEntities as never[],
    stations.map((s) => s.id),
    nowMs,
    { stopName, routeStyle: getRouteStyle },
  );
  for (const station of stations) {
    cache.setDirections(station.id, byStation.get(station.id) ?? [], nowMs);
  }
}

export async function pollAlerts(
  cache: BoardCache,
  stations: StationCtx[],
  decode: DecodeFn,
  fetchFn: typeof fetch = fetch,
): Promise<void> {
  let alertEntities: unknown[];
  try {
    alertEntities = await fetchEntities(ALERTS_URL, decode, fetchFn);
  } catch (err) {
    console.error('[poller] alerts feed failed; keeping last-good alerts:', err);
    return; // do not overwrite cache; keep last-good alerts
  }

  for (const station of stations) {
    const alerts: Alert[] = transformAlerts(alertEntities as never[], station.routes);
    cache.setAlerts(station.id, alerts);
  }
}
