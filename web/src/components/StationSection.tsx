import type { StationBoard } from '../types';
import { DirectionColumn } from './DirectionColumn';
import { Alerts } from './Alerts';

export function StationSection({ board, compact }: { board: StationBoard; compact: boolean }) {
  return (
    <div className="station-section">
      <div className="station-head">
        <div className="station">{board.station.name}</div>
        {board.stale && <span className="stale-badge">delayed data</span>}
      </div>
      <div className="cols">
        {board.directions.map((g) => <DirectionColumn key={g.direction} group={g} compact={compact} />)}
      </div>
      <Alerts alerts={board.alerts} compact={compact} />
    </div>
  );
}
