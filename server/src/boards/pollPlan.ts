import type { Board } from '../types';
import { roundCoord } from '../weatherCache';

interface PollPlan {
  subwayIds: string[];
  busCodes: string[];
  locations: { lat: number; lon: number }[];
}

export function buildPollPlan(boards: Board[]): PollPlan {
  const subway = new Set<string>();
  const bus = new Set<string>();
  const locs = new Map<string, { lat: number; lon: number }>();

  for (const b of boards) {
    for (const e of b.entries) {
      if (e.type === 'subway') subway.add(e.id);
      else bus.add(e.id);
    }
    if (b.weatherLat !== null && b.weatherLon !== null) {
      const lat = roundCoord(b.weatherLat);
      const lon = roundCoord(b.weatherLon);
      locs.set(`${lat},${lon}`, { lat, lon });
    }
  }

  return { subwayIds: [...subway], busCodes: [...bus], locations: [...locs.values()] };
}
