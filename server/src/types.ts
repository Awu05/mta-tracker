export type Direction = 'N' | 'S';

export interface Arrival {
  route: string;        // e.g. "1", "N"
  color: string;        // hex, e.g. "#ee352e"
  textColor: string;    // hex for text on the bullet
  destination: string;  // human station name of trip's last stop
  minutes: number | null; // whole minutes until arrival (>= 0); null when no ETA is available
  note?: string;         // e.g. "approaching" / "3 stops away" when minutes is null
}

export interface DirectionGroup {
  direction: Direction;
  label: string;        // "Uptown" | "Downtown"
  arrivals: Arrival[];  // soonest first
}

export interface Alert {
  routes: string[];
  severity: string;     // e.g. "delay" | "info"
  text: string;
}

export interface HourForecast {
  time: string;       // Open-Meteo local ISO hour, e.g. "2026-06-21T15:00"
  tempF: number;      // whole °F
  icon: string;       // slug
  precipPct: number;  // 0-100
}

export interface DayForecast {
  date: string;       // local ISO date, e.g. "2026-06-21"
  hiF: number;        // whole °F
  loF: number;        // whole °F
  icon: string;       // slug
  precipPct: number;  // 0-100 (daily max)
}

export interface Weather {
  tempF: number;
  condition: string;
  icon: string;
  hourly: HourForecast[]; // up to 12, soonest first
  daily: DayForecast[];   // up to 5, soonest first
}

export interface StationBoard {
  station: { id: string; name: string };
  type: 'subway' | 'bus';
  updatedAt: string;    // ISO timestamp of last successful feed update for this station
  stale: boolean;
  directions: DirectionGroup[]; // subway: populated; bus: []
  arrivals: Arrival[];          // bus: flat, soonest first; subway: []
  alerts: Alert[];
}

export interface BoardModel {
  updatedAt: string;        // most recent station update across stations (epoch ISO if none yet)
  stale: boolean;           // true if ANY station is stale
  weather: Weather | null;  // shared across stations
  stations: StationBoard[]; // in configured order
}

export interface AppConfig {
  displayMode: 'kiosk' | 'phone' | 'auto';
  weatherLat: number;
  weatherLon: number;
  feedRefreshSec: number;
  alertsRefreshSec: number;
  weatherRefreshSec: number;
  staleThresholdSec: number;
  mtaApiKey: string;
  port: number;
  compact: boolean;
  databaseUrl: string;
  activeTtlMs: number;
}

export interface BoardEntry { id: string; type: 'subway' | 'bus'; }

export interface Board {
  code: string;
  entries: BoardEntry[];
  weatherLat: number;
  weatherLon: number;
}
