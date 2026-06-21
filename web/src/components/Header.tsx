import type { Weather } from '../types';
import { Clock } from './Clock';

interface Props {
  weather: Weather | null;
  stale: boolean;
  compact: boolean;
  onToggleCompact: () => void;
}

export function Header({ weather, stale, compact, onToggleCompact }: Props) {
  return (
    <div className="board-top">
      <div className="topbar-left">
        <div className="app-title">Departures</div>
        {stale && <span className="stale-badge">reconnecting…</span>}
        <button
          type="button"
          className="view-toggle"
          onClick={onToggleCompact}
          aria-pressed={compact}
          aria-label={compact ? 'Switch to full view' : 'Switch to compact view'}
          title={compact ? 'Switch to full view' : 'Switch to compact view'}
        >
          {compact ? '▦ Full' : '▤ Compact'}
        </button>
      </div>
      <div className="meta">
        <Clock />
        {weather && <div className="weather">{weather.tempF}°F · {weather.condition}</div>}
      </div>
    </div>
  );
}
