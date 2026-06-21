import type { Alert, Arrival, BoardModel, DirectionGroup, StationBoard, Weather } from './types';

export interface StationMeta { id: string; name: string; type?: 'subway' | 'bus'; }

interface StationEntry {
  meta: StationMeta;
  name: string;
  directions: DirectionGroup[];
  arrivals: Arrival[];
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
      name: meta.name,
      directions: [],
      arrivals: [],
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

  setBusArrivals(stationId: string, arrivals: Arrival[], nowMs: number, name?: string): void {
    const e = this.entry(stationId);
    e.arrivals = arrivals;
    e.lastUpdatedMs = nowMs;
    if (name) e.name = name;
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
        station: { id: e.meta.id, name: e.name },
        type: e.meta.type ?? 'subway',
        updatedAt: new Date(e.lastUpdatedMs ?? 0).toISOString(),
        stale,
        directions: e.directions,
        arrivals: e.arrivals,
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
