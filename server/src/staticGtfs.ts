import routesData from './data/routes.json';
import stationsData from './data/stations.json';
import stopsData from './data/stops.json';

export interface RouteStyle { color: string; textColor: string; }
export interface StationInfo { name: string; lat: number; lon: number; routes: string[]; }
export interface StationSearchResult { id: string; name: string; routes: string[]; }

const routes = routesData as Record<string, RouteStyle>;
const stations = stationsData as Record<string, StationInfo>;
const stops = stopsData as Record<string, string>;

const DEFAULT_STYLE: RouteStyle = { color: '#666666', textColor: '#ffffff' };

export function getStation(id: string): StationInfo {
  const s = stations[id];
  if (!s) throw new Error(`Unknown station id: ${id}`);
  return s;
}

export function getRouteStyle(route: string): RouteStyle {
  return routes[route] ?? DEFAULT_STYLE;
}

/**
 * Search stations by (case-insensitive, substring) name match. Stations whose name
 * starts with the query rank above stations that merely contain it; ties within each
 * group are broken alphabetically by name.
 */
export function searchStations(query: string, limit = 10): StationSearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const startsWith: StationSearchResult[] = [];
  const contains: StationSearchResult[] = [];

  for (const [id, s] of Object.entries(stations)) {
    const name = s.name.toLowerCase();
    if (name.startsWith(q)) {
      startsWith.push({ id, name: s.name, routes: s.routes });
    } else if (name.includes(q)) {
      contains.push({ id, name: s.name, routes: s.routes });
    }
  }

  const byName = (a: StationSearchResult, b: StationSearchResult) => a.name.localeCompare(b.name);
  startsWith.sort(byName);
  contains.sort(byName);

  return [...startsWith, ...contains].slice(0, limit);
}

/** Strip a trailing N/S direction suffix, then look up the station name. */
export function stopName(stopId: string): string {
  const base = /[NS]$/.test(stopId) ? stopId.slice(0, -1) : stopId;
  return stops[base] ?? stations[base]?.name ?? stopId;
}
