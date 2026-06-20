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
