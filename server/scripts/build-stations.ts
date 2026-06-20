/*
 * Regenerate src/data/stations.json from an official GTFS static stops.txt.
 * Usage:
 *   1) Download the NYC subway GTFS static zip from
 *      https://www.mta.info/developers (subway) and extract stops.txt.
 *   2) Run: npx tsx scripts/build-stations.ts path/to/stops.txt path/to/routes-by-station.json
 *
 * stops.txt has parent stations (location_type=1) with stop_id + stop_name.
 * Route membership is not in stops.txt; supply a routes-by-station map (station id -> route[])
 * derived from your needs, or hand-curate. This script merges names + routes.
 */
import { readFileSync, writeFileSync } from 'node:fs';

function parseCsv(text: string): Record<string, string>[] {
  const [header, ...lines] = text.trim().split(/\r?\n/);
  const cols = header.split(',');
  return lines.map((line) => {
    const vals = line.split(',');
    return Object.fromEntries(cols.map((c, i) => [c, vals[i]]));
  });
}

const [, , stopsPath, routesPath] = process.argv;
if (!stopsPath) {
  console.error('Usage: tsx build-stations.ts <stops.txt> [routes-by-station.json]');
  process.exit(1);
}

const rows = parseCsv(readFileSync(stopsPath, 'utf8'));
const routesByStation: Record<string, string[]> = routesPath
  ? JSON.parse(readFileSync(routesPath, 'utf8'))
  : {};

const out: Record<string, { name: string; routes: string[] }> = {};
for (const r of rows) {
  if (r.location_type === '1') {
    out[r.stop_id] = { name: r.stop_name, routes: routesByStation[r.stop_id] ?? [] };
  }
}

writeFileSync(
  new URL('../src/data/stations.json', import.meta.url),
  JSON.stringify(out, null, 2),
);
console.log(`Wrote ${Object.keys(out).length} stations`);
