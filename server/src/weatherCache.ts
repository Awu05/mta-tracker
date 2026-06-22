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
}
