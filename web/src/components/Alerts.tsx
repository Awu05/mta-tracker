import type { Alert } from '../types';

export function Alerts({ alerts }: { alerts: Alert[] }) {
  if (alerts.length === 0) return null;
  return (
    <div className="alerts">
      {alerts.map((a, i) => (
        <div key={i} className="alert-line">
          <b>⚠ {a.routes.join('/')}:</b> {a.text}
        </div>
      ))}
    </div>
  );
}
