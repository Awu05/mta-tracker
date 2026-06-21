const BASE = 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds';

// feed id -> URL path suffix (the "123456s" feed uses the bare nyct%2Fgtfs path)
const FEED_PATHS: Record<string, string> = {
  '123456s': 'nyct%2Fgtfs',
  ace: 'nyct%2Fgtfs-ace',
  bdfm: 'nyct%2Fgtfs-bdfm',
  g: 'nyct%2Fgtfs-g',
  jz: 'nyct%2Fgtfs-jz',
  nqrw: 'nyct%2Fgtfs-nqrw',
  l: 'nyct%2Fgtfs-l',
  si: 'nyct%2Fgtfs-si',
};

const ROUTE_TO_FEED: Record<string, string> = {
  '1': '123456s', '2': '123456s', '3': '123456s', '4': '123456s',
  '5': '123456s', '6': '123456s', '7': '123456s', S: '123456s', GS: '123456s',
  '6X': '123456s', '7X': '123456s',
  A: 'ace', C: 'ace', E: 'ace', H: 'ace', FS: 'ace',
  B: 'bdfm', D: 'bdfm', F: 'bdfm', M: 'bdfm', FX: 'bdfm',
  G: 'g',
  J: 'jz', Z: 'jz',
  N: 'nqrw', Q: 'nqrw', R: 'nqrw', W: 'nqrw',
  L: 'l',
  SI: 'si', SIR: 'si',
};

export const ALERTS_URL = `${BASE}/camsys%2Fsubway-alerts`;

export function feedIdForRoute(route: string): string {
  const id = ROUTE_TO_FEED[route];
  if (!id) throw new Error(`No feed mapping for route: ${route}`);
  return id;
}

export function feedUrl(feedId: string): string {
  const path = FEED_PATHS[feedId];
  if (!path) throw new Error(`Unknown feed id: ${feedId}`);
  return `${BASE}/${path}`;
}

export function feedsForRoutes(routes: string[]): string[] {
  return [...new Set(routes.map(feedIdForRoute))];
}
