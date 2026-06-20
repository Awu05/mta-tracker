/*
 * Regenerate src/data/stops.json from an official GTFS static stops.txt.
 *
 * This produces a COMPLETE parent-stop id -> name map (all location_type=1 rows),
 * used by staticGtfs.ts's stopName() to resolve trip destination labels.
 * Unlike stations.json (a curated subset with route info for the configured
 * home station), this file covers every NYC subway parent station.
 *
 * Usage:
 *   1) Download the NYC subway GTFS static zip, e.g.
 *      https://rrgtfsfeeds.s3.amazonaws.com/gtfs_subway.zip
 *      and extract stops.txt.
 *   2) Run: npx tsx scripts/build-stops.ts path/to/stops.txt
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

const [, , stopsPath] = process.argv;
if (!stopsPath) {
  console.error('Usage: tsx build-stops.ts <stops.txt>');
  process.exit(1);
}

const rows = parseCsv(readFileSync(stopsPath, 'utf8'));

const out: Record<string, string> = {};
for (const r of rows) {
  if (r.location_type === '1') {
    out[r.stop_id] = r.stop_name;
  }
}

const sorted: Record<string, string> = {};
for (const key of Object.keys(out).sort()) {
  sorted[key] = out[key];
}

writeFileSync(new URL('../src/data/stops.json', import.meta.url), JSON.stringify(sorted, null, 2));
console.log(`Wrote ${Object.keys(sorted).length} stops`);
