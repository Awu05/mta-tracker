import type { Alert } from '../types';

export function Alerts({ alerts, compact }: { alerts: Alert[]; compact?: boolean }) {
  if (alerts.length === 0) return null;

  if (!compact) {
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

  const severe = alerts.filter((a) => a.severity === 'delay' || a.severity === 'suspended');
  const delays = alerts.filter((a) => a.severity === 'delay').length;
  const suspended = alerts.filter((a) => a.severity === 'suspended').length;
  const info = alerts.filter((a) => a.severity !== 'delay' && a.severity !== 'suspended').length;

  const summaryParts: string[] = [];
  if (delays > 0) summaryParts.push(`${delays} delays`);
  if (suspended > 0) summaryParts.push(`${suspended} suspended`);
  if (info > 0) summaryParts.push(`${info} info`);

  return (
    <div className="alerts">
      {severe.slice(0, 3).map((a, i) => (
        <div key={i} className="alert-line">
          <b>⚠ {a.routes.join('/')}:</b> {a.text}
        </div>
      ))}
      {summaryParts.length > 0 && (
        <div className="alert-summary">⚠ {summaryParts.join(' · ')}</div>
      )}
    </div>
  );
}
