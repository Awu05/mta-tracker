/*
 * Regenerate src/data/stations.json from the official NYC subway GTFS static feed,
 * covering EVERY parent station (not just a curated subset) so any stop can be
 * configured as a home station.
 *
 * Algorithm:
 *  1) Parse stops.txt:
 *     - parents: stop_id -> stop_name, for rows with location_type === '1'
 *     - platformToParent: stop_id -> parent_station, for rows with a non-empty parent_station
 *  2) Parse trips.txt: tripToRoute: trip_id -> route_id
 *  3) Parse stop_times.txt: for each row, resolve the parent stop id (via
 *     platformToParent, falling back to stripping a trailing N/S suffix) and the
 *     route id (via tripToRoute), and record that route as serving that parent station.
 *  4) Parse routes.txt for route_sort_order, used to sort each station's route list
 *     (falls back to alphabetical for routes without a known sort order).
 *  5) Emit stations.json = { [parentId]: { name, lat, lon, routes } } for every parent
 *     station, including ones with zero observed routes. lat/lon are parsed from the
 *     parent station's own stop_lat/stop_lon in stops.txt.
 *
 * Usage:
 *   npx tsx scripts/build-stations.ts [path/to/gtfs_subway_dir]
 *   (defaults to ../gtfs_subway relative to this script if no path is given)
 *
 * The directory must contain stops.txt, trips.txt, stop_times.txt, and routes.txt.
 * Output is written to src/data/stations.json (UTF-8, no BOM).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

interface StationInfo {
  name: string;
  lat: number;
  lon: number;
  routes: string[];
}

/** Minimal CSV line splitter that handles quoted fields (routes.txt has quoted descriptions). */
function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      fields.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  fields.push(cur);
  return fields;
}

function parseCsv(text: string): { header: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  const header = splitCsvLine(lines[0]);
  const rows = lines.slice(1).map(splitCsvLine);
  return { header, rows };
}

function colIndex(header: string[], name: string): number {
  const idx = header.indexOf(name);
  if (idx === -1) throw new Error(`Column not found: ${name}`);
  return idx;
}

const gtfsDir = process.argv[2] ?? join(import.meta.dirname, '..', 'gtfs_subway');

console.log(`Reading GTFS static feed from: ${gtfsDir}`);

// --- 1) stops.txt: parents + platformToParent ---
const stopsText = readFileSync(join(gtfsDir, 'stops.txt'), 'utf8');
const stopsCsv = parseCsv(stopsText);
const sIdIdx = colIndex(stopsCsv.header, 'stop_id');
const sNameIdx = colIndex(stopsCsv.header, 'stop_name');
const sLatIdx = colIndex(stopsCsv.header, 'stop_lat');
const sLonIdx = colIndex(stopsCsv.header, 'stop_lon');
const sLocTypeIdx = colIndex(stopsCsv.header, 'location_type');
const sParentIdx = colIndex(stopsCsv.header, 'parent_station');

const parents: Record<string, { name: string; lat: number; lon: number }> = {};
const platformToParent: Record<string, string> = {};

for (const row of stopsCsv.rows) {
  const stopId = row[sIdIdx];
  const locType = row[sLocTypeIdx];
  const parentStation = row[sParentIdx];
  if (locType === '1') {
    parents[stopId] = {
      name: row[sNameIdx],
      lat: Number(row[sLatIdx]),
      lon: Number(row[sLonIdx]),
    };
  }
  if (parentStation) {
    platformToParent[stopId] = parentStation;
  }
}

console.log(`Parsed ${Object.keys(parents).length} parent stations from stops.txt`);

// --- 2) trips.txt: tripToRoute ---
const tripsText = readFileSync(join(gtfsDir, 'trips.txt'), 'utf8');
const tripsCsv = parseCsv(tripsText);
const tRouteIdx = colIndex(tripsCsv.header, 'route_id');
const tTripIdx = colIndex(tripsCsv.header, 'trip_id');

const tripToRoute: Record<string, string> = {};
for (const row of tripsCsv.rows) {
  tripToRoute[row[tTripIdx]] = row[tRouteIdx];
}

console.log(`Parsed ${Object.keys(tripToRoute).length} trips from trips.txt`);

// --- 3) stop_times.txt: stationRoutes ---
const stopTimesText = readFileSync(join(gtfsDir, 'stop_times.txt'), 'utf8');
const stopTimesCsv = parseCsv(stopTimesText);
const stTripIdx = colIndex(stopTimesCsv.header, 'trip_id');
const stStopIdx = colIndex(stopTimesCsv.header, 'stop_id');

const stationRoutes: Record<string, Set<string>> = {};

for (const row of stopTimesCsv.rows) {
  const tripId = row[stTripIdx];
  const stopId = row[stStopIdx];
  const route = tripToRoute[tripId];
  if (!route) continue;
  const parent = platformToParent[stopId] ?? stopId.replace(/[NS]$/, '');
  if (!parents[parent]) continue;
  (stationRoutes[parent] ??= new Set()).add(route);
}

console.log(`Parsed ${stopTimesCsv.rows.length} stop_times rows`);

// --- 4) routes.txt: route_sort_order ---
const routesText = readFileSync(join(gtfsDir, 'routes.txt'), 'utf8');
const routesCsv = parseCsv(routesText);
const rRouteIdIdx = colIndex(routesCsv.header, 'route_id');
const rSortIdx = colIndex(routesCsv.header, 'route_sort_order');

const routeSortOrder: Record<string, number> = {};
for (const row of routesCsv.rows) {
  const sort = Number(row[rSortIdx]);
  if (!Number.isNaN(sort)) {
    routeSortOrder[row[rRouteIdIdx]] = sort;
  }
}

function sortRoutes(routes: string[]): string[] {
  return [...routes].sort((a, b) => {
    const aSort = routeSortOrder[a];
    const bSort = routeSortOrder[b];
    if (aSort !== undefined && bSort !== undefined) return aSort - bSort;
    if (aSort !== undefined) return -1;
    if (bSort !== undefined) return 1;
    return a.localeCompare(b);
  });
}

// --- 5) Emit stations.json ---
const out: Record<string, StationInfo> = {};
for (const parentId of Object.keys(parents).sort()) {
  const routes = stationRoutes[parentId] ? sortRoutes([...stationRoutes[parentId]]) : [];
  const { name, lat, lon } = parents[parentId];
  out[parentId] = { name, lat, lon, routes };
}

const outPath = join(import.meta.dirname, '..', 'src', 'data', 'stations.json');
writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n', 'utf8');

console.log(`Wrote ${Object.keys(out).length} stations to ${outPath}`);

const allRoutes = new Set<string>();
for (const s of Object.values(out)) {
  for (const r of s.routes) allRoutes.add(r);
}
console.log(`Distinct routes observed across all stations: ${[...allRoutes].sort().join(', ')}`);
