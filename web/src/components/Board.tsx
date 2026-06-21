import type { Board as BoardData } from '../types';
import { Header } from './Header';
import { StationSection } from './StationSection';

export function Board({
  board,
  compact,
  onToggleCompact,
}: {
  board: BoardData;
  compact: boolean;
  onToggleCompact: () => void;
}) {
  return (
    <div className="board">
      <Header weather={board.weather} stale={board.stale} compact={compact} onToggleCompact={onToggleCompact} />
      {board.stations.map((s) => <StationSection key={s.station.id} board={s} compact={compact} />)}
    </div>
  );
}
