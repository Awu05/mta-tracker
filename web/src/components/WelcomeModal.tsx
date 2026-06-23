import { useEffect } from 'react';
import { EditPanel } from './EditPanel';

/**
 * First-run popup shown over an empty board. Reuses EditPanel so the station
 * search and weather-location picker behave identically to the inline editor.
 * Dismissible via the × button, the "Skip"/"Done" button, Escape, or a
 * backdrop click — adding stations does not force it closed, so the user can
 * add several stops and a location before finishing.
 */
export function WelcomeModal({
  code,
  onChanged,
  onClose,
  hasStations,
}: {
  code: string;
  onChanged: () => void;
  onClose: () => void;
  hasStations: boolean;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

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
        <EditPanel code={code} onChanged={onChanged} />
        <button type="button" className="modal-skip" onClick={onClose}>
          {hasStations ? 'Done' : 'Skip for now'}
        </button>
      </div>
    </div>
  );
}
