import type { Arrival } from '../types';
import { LineBullet } from './LineBullet';

export function ArrivalRow({ arrival, bus }: { arrival: Arrival; bus?: boolean }) {
  return (
    <div className="arr">
      <LineBullet route={arrival.route} color={arrival.color} textColor={arrival.textColor} bus={bus} />
      <span className="dest">{arrival.destination}</span>
      {arrival.minutes !== null
        ? <span className="mins">{arrival.minutes}<small> min</small></span>
        : <span className="note">{arrival.note || 'due'}</span>}
    </div>
  );
}
