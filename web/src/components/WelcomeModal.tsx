import { useEffect } from 'react';
import type { StationBoard, Weather } from '../types';
import { EditPanel } from './EditPanel';

/**
 * First-run popup shown over an empty board. Reuses EditPanel so the station
 * search and weather-location picker behave identically to the inline editor,
 * and shows a running summary of what's already been added so the user can see
 * their board fill in as they go. Dismissible via the × button, the
 * "Skip"/"Done" button, Escape, or a backdrop click.
 */
export function WelcomeModal({
  code,
  stations,
  weather,
  onChanged,
  onClose,
}: {
  code: string;
  stations: StationBoard[];
  weather: Weather | null;
  onChanged: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const hasStations = stations.length > 0;
  const hasAnything = hasStations || weather !== null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-label="Set up your board"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <h2 className="modal-title">Welcome to your board</h2>
        <p className="modal-hint">
          Add the subway and bus stops you want to track, and set your weather location. This board
          lives at its own link — bookmark it or use “Copy link” to reopen it here or on another device.
        </p>

        <div className="welcome-summary">
          <div className="welcome-summary-title">On your board</div>
          {hasAnything ? (
            <ul className="welcome-added">
              {stations.map((s) => (
                <li key={`${s.type}:${s.station.id}`} className="welcome-added-item">
                  <span className={`welcome-tag welcome-tag-${s.type}`}>
                    {s.type === 'bus' ? 'Bus' : 'Subway'}
                  </span>
                  <span className="welcome-added-name">{s.station.name}</span>
                </li>
              ))}
              {weather && (
                <li className="welcome-added-item">
                  <span className="welcome-tag welcome-tag-weather">Weather</span>
                  <span className="welcome-added-name">
                    {Math.round(weather.tempF)}° {weather.condition}
                  </span>
                </li>
              )}
            </ul>
          ) : (
            <p className="welcome-empty">Nothing yet — add stations and a weather location and they’ll appear here.</p>
          )}
        </div>

        <EditPanel code={code} onChanged={onChanged} />
        <button type="button" className="modal-skip" onClick={onClose}>
          {hasStations ? 'Done' : 'Skip for now'}
        </button>
      </div>
    </div>
  );
}
