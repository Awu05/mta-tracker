import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { StationBoard } from '../types';
import { StationSection } from './StationSection';

export function SortableStationSection({
  id, board, compact, editMode, onRemove,
}: {
  id: string;
  board: StationBoard;
  compact: boolean;
  editMode?: boolean;
  onRemove?: (entry: { id: string; type: 'subway' | 'bus' }) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 };
  return (
    <div ref={setNodeRef} style={style} className="sortable-station">
      <button
        type="button"
        className="drag-handle"
        aria-label={`Drag to reorder ${board.station.name}`}
        {...attributes}
        {...listeners}
      >
        ⠿
      </button>
      <StationSection board={board} compact={compact} editMode={editMode} onRemove={onRemove} />
    </div>
  );
}
