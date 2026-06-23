import type { Weather } from './types';

export function roundCoord(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function key(lat: number, lon: number): string {
  return `${roundCoord(lat)},${roundCoord(lon)}`;
}

export class WeatherCache {
  private readonly byLoc = new Map<string, Weather>();
  set(lat: number, lon: number, weather: Weather): void {
    this.byLoc.set(key(lat, lon), weather);
  }
  get(lat: number, lon: number): Weather | null {
    return this.byLoc.get(key(lat, lon)) ?? null;
  }
  /** Drop any cached location not in `locations`, so weather for dropped board locations doesn't linger forever. */
  retain(locations: { lat: number; lon: number }[]): void {
    const keep = new Set(locations.map((l) => key(l.lat, l.lon)));
    for (const k of this.byLoc.keys()) {
      if (!keep.has(k)) this.byLoc.delete(k);
    }
  }
}
