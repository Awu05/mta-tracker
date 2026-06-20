import type { Arrival } from '../types';
import { LineBullet } from './LineBullet';

export function ArrivalRow({ arrival }: { arrival: Arrival }) {
  return (
    <div className="arr">
      <LineBullet route={arrival.route} color={arrival.color} textColor={arrival.textColor} />
      <span className="dest">{arrival.destination}</span>
      <span className="mins">{arrival.minutes}<small> min</small></span>
    </div>
  );
}
