import type { Arrival, DirectionGroup, Direction } from '../types';

// GTFS-rt int64 fields decode to Long objects; accept number or {toNumber}.
type GtfsTime = number | { toNumber(): number } | Long | null | undefined;
interface Long { toNumber(): number; }

interface StopTimeUpdate { stopId?: string | null; arrival?: { time?: GtfsTime } | null; }
interface Entity {
  tripUpdate?: {
    trip?: { routeId?: string | null } | null;
    stopTimeUpdate?: StopTimeUpdate[] | null;
  } | null;
}

interface TransformLookups {
  stopName(stopId: string): string;
  routeStyle(route: string): { color: string; textColor: string };
}

function toSeconds(time: GtfsTime): number | null {
  if (time == null) return null;
  if (typeof time === 'number') return time;
  if (typeof (time as Long).toNumber === 'function') return (time as Long).toNumber();
  return null;
}

const LABEL: Record<Direction, string> = { N: 'Uptown', S: 'Downtown' };

function finalizeGroups(byDir: Record<Direction, Arrival[]>): DirectionGroup[] {
  (['N', 'S'] as Direction[]).forEach((d) =>
    byDir[d].sort((a, b) => (a.minutes as number) - (b.minutes as number)),
  );
  return (['N', 'S'] as Direction[]).map((d) => ({ direction: d, label: LABEL[d], arrivals: byDir[d] }));
}

/**
 * Single pass over all decoded feed entities, grouping arrivals for every
 * configured station at once. Cost is O(entities × stopsPerTrip) regardless of
 * how many stations are configured — versus re-scanning the whole feed once per
 * station — and each trip's destination/route style is resolved at most once,
 * only when a stop actually qualifies. Returns a map keyed by station id; every
 * requested id is present (empty Uptown/Downtown groups if it had no arrivals).
 */
export function transformArrivalsByStation(
  entities: Entity[],
  stationIds: string[],
  nowMs: number,
  lookups: TransformLookups,
): Map<string, DirectionGroup[]> {
  const byStation = new Map<string, Record<Direction, Arrival[]>>();
  for (const id of stationIds) byStation.set(id, { N: [], S: [] });

  for (const e of entities) {
    const tu = e.tripUpdate;
    const route = tu?.trip?.routeId;
    const stops = tu?.stopTimeUpdate;
    if (!route || !stops || stops.length === 0) continue;

    // Resolved lazily on the first qualifying stop, then reused for the trip.
    let destination: string | null = null;
    let style: { color: string; textColor: string } | null = null;

    for (const stu of stops) {
      const sid = stu.stopId ?? '';
      const dir = sid.slice(-1);
      if (dir !== 'N' && dir !== 'S') continue;
      const groups = byStation.get(sid.slice(0, -1));
      if (!groups) continue; // stop isn't at a configured station
      const sec = toSeconds(stu.arrival?.time);
      if (sec == null) continue;
      const minutes = Math.floor((sec * 1000 - nowMs) / 60000);
      if (minutes < 0) continue;
      if (destination === null) destination = lookups.stopName(stops[stops.length - 1]?.stopId ?? '');
      if (style === null) style = lookups.routeStyle(route);
      groups[dir].push({ route, color: style.color, textColor: style.textColor, destination, minutes });
    }
  }

  const result = new Map<string, DirectionGroup[]>();
  for (const [id, byDir] of byStation) result.set(id, finalizeGroups(byDir));
  return result;
}

/** Convenience wrapper for a single station. */
export function transformArrivals(
  entities: Entity[],
  stationId: string,
  nowMs: number,
  lookups: TransformLookups,
): DirectionGroup[] {
  return transformArrivalsByStation(entities, [stationId], nowMs, lookups).get(stationId)!;
}
