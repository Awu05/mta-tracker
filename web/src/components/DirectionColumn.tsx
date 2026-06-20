import type { DirectionGroup } from '../types';
import { ArrivalRow } from './ArrivalRow';

export function DirectionColumn({ group }: { group: DirectionGroup }) {
  const arrow = group.direction === 'N' ? '↑' : '↓';
  return (
    <div className="col">
      <div className="dir-label"><span className="dir-arrow">{arrow}</span> {group.label}</div>
      {group.arrivals.length === 0
        ? <div className="empty">No trains scheduled</div>
        : group.arrivals.slice(0, 6).map((a, i) => <ArrivalRow key={i} arrival={a} />)}
    </div>
  );
}
