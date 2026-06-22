import type { Weather } from '../types';
import { Clock } from './Clock';
import { Weather as WeatherWidget } from './Weather';

interface Props {
  weather: Weather | null;
  stale: boolean;
  compact: boolean;
  onToggleCompact: () => void;
  editMode: boolean;
  onToggleEdit: () => void;
  forecastOpen?: boolean;
  onToggleForecast?: () => void;
  boardCode?: string;
}

export function Header({
  weather,
  stale,
  compact,
  onToggleCompact,
  editMode,
  onToggleEdit,
  forecastOpen = true,
  onToggleForecast = () => {},
  boardCode,
}: Props) {
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
        <button
          type="button"
          className="view-toggle"
          onClick={() => { void navigator.clipboard?.writeText(window.location.href); }}
          title="Copy this board's link"
          aria-label="Copy board link"
        >
          🔗 Copy link
        </button>
      </div>
      <div className="meta">
        <Clock />
        {weather && (
          <WeatherWidget weather={weather} forecastOpen={forecastOpen} onToggle={onToggleForecast} />
        )}
      </div>
    </div>
  );
}
