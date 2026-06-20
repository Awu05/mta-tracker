import type { Alert, BoardModel, DirectionGroup, StationBoard, Weather } from './types';

export interface StationMeta { id: string; name: string; }

interface StationEntry {
  meta: StationMeta;
  directions: DirectionGroup[];
  alerts: Alert[];
  lastUpdatedMs: number | null;
}

export class BoardCache {
  private readonly entries: StationEntry[];
  private readonly byId: Map<string, StationEntry>;
  private weather: Weather | null = null;

  constructor(
    stations: StationMeta[],
    private readonly staleThresholdSec: number,
  ) {
    this.entries = stations.map((meta) => ({
      meta,
      directions: [],
      alerts: [],
      lastUpdatedMs: null,
    }));
    this.byId = new Map(this.entries.map((e) => [e.meta.id, e]));
  }

  private entry(stationId: string): StationEntry {
    const e = this.byId.get(stationId);
    if (!e) throw new Error(`Unknown station id: ${stationId}`);
    return e;
  }

  setDirections(stationId: string, directions: DirectionGroup[], nowMs: number): void {
    const e = this.entry(stationId);
    e.directions = directions;
    e.lastUpdatedMs = nowMs;
  }

  setAlerts(stationId: string, alerts: Alert[]): void {
    const e = this.entry(stationId);
    e.alerts = alerts;
  }

  setWeather(weather: Weather): void {
    this.weather = weather;
  }

  get(nowMs: number): BoardModel {
    let maxLastUpdated: number | null = null;
    const stations: StationBoard[] = this.entries.map((e) => {
      const stale =
        e.lastUpdatedMs === null ||
        nowMs - e.lastUpdatedMs > this.staleThresholdSec * 1000;
      if (e.lastUpdatedMs !== null && (maxLastUpdated === null || e.lastUpdatedMs > maxLastUpdated)) {
        maxLastUpdated = e.lastUpdatedMs;
      }
      return {
        station: e.meta,
        updatedAt: new Date(e.lastUpdatedMs ?? 0).toISOString(),
        stale,
        directions: e.directions,
        alerts: e.alerts,
      };
    });

    return {
      updatedAt: new Date(maxLastUpdated ?? 0).toISOString(),
      stale: stations.some((s) => s.stale),
      weather: this.weather,
      stations,
    };
  }
}
