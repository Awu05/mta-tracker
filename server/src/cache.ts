import type { Alert, BoardModel, DirectionGroup, Weather } from './types';

export class BoardCache {
  private directions: DirectionGroup[] = [];
  private alerts: Alert[] = [];
  private weather: Weather | null = null;
  private lastUpdatedMs: number | null = null;

  constructor(
    private readonly station: { id: string; name: string },
    private readonly staleThresholdSec: number,
  ) {}

  setDirections(directions: DirectionGroup[], nowMs: number): void {
    this.directions = directions;
    this.lastUpdatedMs = nowMs;
  }

  setAlerts(alerts: Alert[]): void {
    this.alerts = alerts;
  }

  setWeather(weather: Weather): void {
    this.weather = weather;
  }

  get(nowMs: number): BoardModel {
    const stale =
      this.lastUpdatedMs === null ||
      nowMs - this.lastUpdatedMs > this.staleThresholdSec * 1000;
    return {
      station: this.station,
      updatedAt: this.lastUpdatedMs ? new Date(this.lastUpdatedMs).toISOString() : new Date(0).toISOString(),
      stale,
      directions: this.directions,
      alerts: this.alerts,
      weather: this.weather,
    };
  }
}
