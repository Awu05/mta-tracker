export type Direction = 'N' | 'S';

export interface Arrival {
  route: string;        // e.g. "1", "N"
  color: string;        // hex, e.g. "#ee352e"
  textColor: string;    // hex for text on the bullet
  destination: string;  // human station name of trip's last stop
  minutes: number;      // whole minutes until arrival (>= 0)
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

export interface Weather {
  tempF: number;
  condition: string;
  icon: string;
}

export interface BoardModel {
  station: { id: string; name: string };
  updatedAt: string;    // ISO timestamp of last successful feed update
  stale: boolean;
  directions: DirectionGroup[];
  alerts: Alert[];
  weather: Weather | null;
}

export interface AppConfig {
  station: string;
  displayMode: 'kiosk' | 'phone' | 'auto';
  weatherLat: number;
  weatherLon: number;
  feedRefreshSec: number;
  weatherRefreshSec: number;
  staleThresholdSec: number;
  mtaApiKey: string;
  port: number;
}
