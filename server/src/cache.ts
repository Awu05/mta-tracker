import type { Alert, Arrival, BoardEntry, BoardModel, DirectionGroup, StationBoard, Weather } from './types';

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
  // Insertion-ordered map of station id -> entry; Map preserves insertion order in JS.
  private readonly byId: Map<string, StationEntry>;

  constructor(
    stations: StationMeta[],
    private readonly staleThresholdSec: number,
  ) {
    this.byId = new Map(
      stations.map((meta) => [
        meta.id,
        {
          meta,
          name: meta.name,
          directions: [],
          arrivals: [],
          alerts: [],
          lastUpdatedMs: null,
        },
      ]),
    );
  }

  private entry(stationId: string): StationEntry {
    const e = this.byId.get(stationId);
    if (!e) throw new Error(`Unknown station id: ${stationId}`);
    return e;
  }

  addStation(meta: StationMeta): void {
    if (this.byId.has(meta.id)) return;
    this.byId.set(meta.id, {
      meta,
      name: meta.name,
      directions: [],
      arrivals: [],
      alerts: [],
      lastUpdatedMs: null,
    });
  }

  removeStation(id: string): void {
    this.byId.delete(id);
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

  has(id: string): boolean {
    return this.byId.has(id);
  }

  reconcile(metas: StationMeta[]): void {
    const wanted = new Set(metas.map((m) => m.id));
    for (const id of [...this.byId.keys()]) {
      if (!wanted.has(id)) this.byId.delete(id);
    }
    for (const m of metas) this.addStation(m);
  }

  private toStationBoard(e: StationEntry, nowMs: number): StationBoard {
    const stale =
      e.lastUpdatedMs === null || nowMs - e.lastUpdatedMs > this.staleThresholdSec * 1000;
    return {
      station: { id: e.meta.id, name: e.name },
      type: e.meta.type ?? 'subway',
      updatedAt: new Date(e.lastUpdatedMs ?? 0).toISOString(),
      stale,
      directions: e.directions,
      arrivals: e.arrivals,
      alerts: e.alerts,
    };
  }

  getBoardModel(entries: BoardEntry[], weather: Weather | null, nowMs: number): BoardModel {
    let maxLastUpdated: number | null = null;
    const stations: StationBoard[] = entries.map((entry) => {
      const e = this.byId.get(entry.id);
      if (!e) {
        return {
          station: { id: entry.id, name: entry.id },
          type: entry.type,
          updatedAt: new Date(0).toISOString(),
          stale: true,
          directions: [],
          arrivals: [],
          alerts: [],
        };
      }
      if (e.lastUpdatedMs !== null && (maxLastUpdated === null || e.lastUpdatedMs > maxLastUpdated)) {
        maxLastUpdated = e.lastUpdatedMs;
      }
      return this.toStationBoard(e, nowMs);
    });
    return {
      updatedAt: new Date(maxLastUpdated ?? 0).toISOString(),
      stale: stations.some((s) => s.stale),
      weather,
      stations,
    };
  }
}
