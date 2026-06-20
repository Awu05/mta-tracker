import type { Board as BoardData } from '../types';
import { Header } from './Header';
import { DirectionColumn } from './DirectionColumn';
import { Alerts } from './Alerts';

export function Board({ board }: { board: BoardData }) {
  return (
    <div className="board">
      <Header stationName={board.station.name} weather={board.weather} stale={board.stale} />
      <div className="cols">
        {board.directions.map((g) => <DirectionColumn key={g.direction} group={g} />)}
      </div>
      <Alerts alerts={board.alerts} />
    </div>
  );
}
