import { useState } from 'react';
import { DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import type { Board as BoardData } from '../types';
import { Header } from './Header';
import { Forecast } from './Forecast';
import { StationSection } from './StationSection';
import { SortableStationSection } from './SortableStationSection';
import { EditPanel } from './EditPanel';

export function Board({
  board,
  compact,
  onToggleCompact,
  editMode,
  onToggleEdit,
  onRemove,
  onReorder,
  onChanged,
  boardCode,
}: {
  board: BoardData;
  compact: boolean;
  onToggleCompact: () => void;
  editMode: boolean;
  onToggleEdit: () => void;
  onRemove: (entry: { id: string; type: 'subway' | 'bus' }) => void;
  onReorder: (order: { id: string; type: 'subway' | 'bus' }[]) => void;
  onChanged: () => void;
  boardCode: string;
}) {
  const [forecastOpen, setForecastOpen] = useState(true);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = board.stations.map((s) => `${s.type}:${s.station.id}`);

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(board.stations, oldIndex, newIndex);
    onReorder(next.map((s) => ({ id: s.station.id, type: s.type })));
  }

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
      {editMode ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            {board.stations.map((s) => (
              <SortableStationSection key={`${s.type}:${s.station.id}`} id={`${s.type}:${s.station.id}`}
                board={s} compact={compact} editMode={editMode} onRemove={onRemove} />
            ))}
          </SortableContext>
        </DndContext>
      ) : (
        board.stations.map((s) => (
          <StationSection key={`${s.type}:${s.station.id}`} board={s} compact={compact} editMode={editMode} onRemove={onRemove} />
        ))
      )}
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
