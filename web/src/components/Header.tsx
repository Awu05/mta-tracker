import type { Weather } from '../types';
import { Clock } from './Clock';

interface Props { stationName: string; weather: Weather | null; stale: boolean; }

export function Header({ stationName, weather, stale }: Props) {
  return (
    <div className="board-top">
      <div className="station">
        {stationName}
        {stale && <span className="stale-badge">reconnecting…</span>}
      </div>
      <div className="meta">
        <Clock />
        {weather && <div className="weather">{weather.tempF}°F · {weather.condition}</div>}
      </div>
    </div>
  );
}
