import type { Weather } from '../types';
import { Clock } from './Clock';

interface Props { weather: Weather | null; stale: boolean; }

export function Header({ weather, stale }: Props) {
  return (
    <div className="board-top">
      <div className="app-title">
        Departures
        {stale && <span className="stale-badge">reconnecting…</span>}
      </div>
      <div className="meta">
        <Clock />
        {weather && <div className="weather">{weather.tempF}°F · {weather.condition}</div>}
      </div>
    </div>
  );
}
