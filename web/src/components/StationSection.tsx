import type { StationBoard } from '../types';
import { DirectionColumn } from './DirectionColumn';
import { ArrivalRow } from './ArrivalRow';
import { Alerts } from './Alerts';

export function StationSection({ board, compact }: { board: StationBoard; compact: boolean }) {
  return (
    <div className="station-section">
      <div className="station-head">
        <div className="station">{board.station.name}</div>
        {board.stale && <span className="stale-badge">delayed data</span>}
      </div>
      {board.type === 'bus' ? (
        <>
          <div className="cols">
            <div className="col">
              {board.arrivals.length === 0
                ? <div className="empty">No buses</div>
                : board.arrivals.slice(0, compact ? 3 : 6).map((a, i) => <ArrivalRow key={i} arrival={a} bus />)}
            </div>
          </div>
          <Alerts alerts={board.alerts} compact={compact} />
        </>
      ) : (
        <>
          <div className="cols">
            {board.directions.map((g) => <DirectionColumn key={g.direction} group={g} compact={compact} />)}
          </div>
          <Alerts alerts={board.alerts} compact={compact} />
        </>
      )}
    </div>
  );
}
