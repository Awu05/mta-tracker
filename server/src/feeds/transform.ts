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

export interface TransformLookups {
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

export function transformArrivals(
  entities: Entity[],
  stationId: string,
  nowMs: number,
  lookups: TransformLookups,
): DirectionGroup[] {
  const byDir: Record<Direction, Arrival[]> = { N: [], S: [] };

  for (const e of entities) {
    const tu = e.tripUpdate;
    const route = tu?.trip?.routeId;
    const stops = tu?.stopTimeUpdate;
    if (!route || !stops || stops.length === 0) continue;

    // Destination = last stop in the trip's remaining schedule.
    const lastStopId = stops[stops.length - 1]?.stopId ?? '';
    const destination = lookups.stopName(lastStopId);

    for (const stu of stops) {
      const sid = stu.stopId ?? '';
      if (sid !== `${stationId}N` && sid !== `${stationId}S`) continue;
      const dir = sid.slice(-1) as Direction;
      const sec = toSeconds(stu.arrival?.time);
      if (sec == null) continue;
      const minutes = Math.floor((sec * 1000 - nowMs) / 60000);
      if (minutes < 0) continue;
      const style = lookups.routeStyle(route);
      byDir[dir].push({ route, color: style.color, textColor: style.textColor, destination, minutes });
    }
  }

  (['N', 'S'] as Direction[]).forEach((d) => byDir[d].sort((a, b) => a.minutes - b.minutes));

  return (['N', 'S'] as Direction[]).map((d) => ({ direction: d, label: LABEL[d], arrivals: byDir[d] }));
}
