export type Direction = 'N' | 'S';

export interface Arrival {
  route: string;
  color: string;
  textColor: string;
  destination: string;
  minutes: number | null;
  note?: string;
}

export interface DirectionGroup {
  direction: Direction;
  label: string;
  arrivals: Arrival[];
}

export interface Alert {
  routes: string[];
  severity: string;
  text: string;
}

export interface Weather {
  tempF: number;
  condition: string;
  icon: string;
}

export interface StationBoard {
  station: { id: string; name: string };
  type: 'subway' | 'bus';
  updatedAt: string;
  stale: boolean;
  directions: DirectionGroup[];
  arrivals: Arrival[];
  alerts: Alert[];
}

export interface Board {
  updatedAt: string;
  stale: boolean;
  weather: Weather | null;
  stations: StationBoard[];
  displayMode: 'kiosk' | 'phone' | 'auto';
  compact: boolean;
}
