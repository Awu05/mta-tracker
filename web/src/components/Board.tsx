import { useState } from 'react';
import type { Board as BoardData } from '../types';
import { Header } from './Header';
import { Forecast } from './Forecast';
import { StationSection } from './StationSection';
import { EditPanel } from './EditPanel';

export function Board({
  board,
  compact,
  onToggleCompact,
  editMode,
  onToggleEdit,
  onRemove,
  onChanged,
  boardCode,
}: {
  board: BoardData;
  compact: boolean;
  onToggleCompact: () => void;
  editMode: boolean;
  onToggleEdit: () => void;
  onRemove: (entry: { id: string; type: 'subway' | 'bus' }) => void;
  onChanged: () => void;
  boardCode: string;
}) {
  const [forecastOpen, setForecastOpen] = useState(true);

  return (
    <div className="board">
      <Header
        weather={board.weather}
        stale={board.stale}
        compact={compact}
        onToggleCompact={onToggleCompact}
        editMode={editMode}
        onToggleEdit={onToggleEdit}
        forecastOpen={forecastOpen}
        onToggleForecast={() => setForecastOpen((o) => !o)}
      />
      {editMode && <EditPanel code={boardCode} onChanged={onChanged} />}
      {board.weather && <Forecast weather={board.weather} open={forecastOpen} />}
      {board.stations.map((s) => (
        <StationSection key={s.station.id} board={s} compact={compact} editMode={editMode} onRemove={onRemove} />
      ))}
      {board.stations.length === 0 && (
        <div className="board-empty">
          <p className="board-empty-title">Your board is empty</p>
          <p className="board-empty-hint">
            Add subway and bus stations and a weather location to get started — tap ✎ Edit above, or reload to reopen the welcome popup.
          </p>
        </div>
      )}
    </div>
  );
}
