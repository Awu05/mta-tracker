import routesData from './data/routes.json' with { type: 'json' };
import stationsData from './data/stations.json' with { type: 'json' };

export interface RouteStyle { color: string; textColor: string; }
export interface StationInfo { name: string; routes: string[]; }

const routes = routesData as Record<string, RouteStyle>;
const stations = stationsData as Record<string, StationInfo>;

const DEFAULT_STYLE: RouteStyle = { color: '#666666', textColor: '#ffffff' };

export function getStation(id: string): StationInfo {
  const s = stations[id];
  if (!s) throw new Error(`Unknown station id: ${id}`);
  return s;
}

export function getRouteStyle(route: string): RouteStyle {
  return routes[route] ?? DEFAULT_STYLE;
}

/** Strip a trailing N/S direction suffix, then look up the station name. */
export function stopName(stopId: string): string {
  const base = /[NS]$/.test(stopId) ? stopId.slice(0, -1) : stopId;
  return stations[base]?.name ?? stopId;
}
