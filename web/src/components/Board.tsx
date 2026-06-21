import type { Board as BoardData } from '../types';
import { Header } from './Header';
import { StationSection } from './StationSection';

export function Board({ board, compact }: { board: BoardData; compact: boolean }) {
  return (
    <div className="board">
      <Header weather={board.weather} stale={board.stale} />
      {board.stations.map((s) => <StationSection key={s.station.id} board={s} compact={compact} />)}
    </div>
  );
}
