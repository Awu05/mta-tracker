import type { Weather } from '../types';
import { Clock } from './Clock';

interface Props {
  weather: Weather | null;
  stale: boolean;
  compact: boolean;
  onToggleCompact: () => void;
  editMode: boolean;
  onToggleEdit: () => void;
}

export function Header({ weather, stale, compact, onToggleCompact, editMode, onToggleEdit }: Props) {
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
        <button
          type="button"
          className="edit-toggle"
          onClick={onToggleEdit}
          aria-pressed={editMode}
          aria-label={editMode ? 'Done editing' : 'Edit stations'}
          title={editMode ? 'Done editing' : 'Edit stations'}
        >
          {editMode ? '✓ Done' : '✎ Edit'}
        </button>
      </div>
      <div className="meta">
        <Clock />
        {weather && <div className="weather">{weather.tempF}°F · {weather.condition}</div>}
      </div>
    </div>
  );
}
