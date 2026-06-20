export type Direction = 'N' | 'S';

export interface Arrival {
  route: string;
  color: string;
  textColor: string;
  destination: string;
  minutes: number;
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

export interface Board {
  station: { id: string; name: string };
  updatedAt: string;
  stale: boolean;
  directions: DirectionGroup[];
  alerts: Alert[];
  weather: Weather | null;
  displayMode: 'kiosk' | 'phone' | 'auto';
}
