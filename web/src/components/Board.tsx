import type { Board as BoardData } from '../types';
import { Header } from './Header';
import { StationSection } from './StationSection';

export function Board({ board }: { board: BoardData }) {
  return (
    <div className="board">
      <Header weather={board.weather} stale={board.stale} />
      {board.stations.map((s) => <StationSection key={s.station.id} board={s} />)}
    </div>
  );
}
