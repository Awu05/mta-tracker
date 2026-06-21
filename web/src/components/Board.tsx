import type { Board as BoardData } from '../types';
import { Header } from './Header';
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
}: {
  board: BoardData;
  compact: boolean;
  onToggleCompact: () => void;
  editMode: boolean;
  onToggleEdit: () => void;
  onRemove: (entry: { id: string; type: 'subway' | 'bus' }) => void;
  onChanged: () => void;
}) {
  return (
    <div className="board">
      <Header
        weather={board.weather}
        stale={board.stale}
        compact={compact}
        onToggleCompact={onToggleCompact}
        editMode={editMode}
        onToggleEdit={onToggleEdit}
      />
      {editMode && <EditPanel onChanged={onChanged} />}
      {board.stations.map((s) => (
        <StationSection key={s.station.id} board={s} compact={compact} editMode={editMode} onRemove={onRemove} />
      ))}
    </div>
  );
}
