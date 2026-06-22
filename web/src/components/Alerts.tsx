import { useState } from 'react';
import type { Alert } from '../types';

function AlertLine({ alert }: { alert: Alert }) {
  return (
    <div className="alert-line">
      <b>⚠ {alert.routes.join('/')}:</b> {alert.text}
    </div>
  );
}

// Alerts start minimized in every view: severe alerts (delays/suspensions) are
// shown up to 3, with a one-line count summary; clicking it expands to all.
export function Alerts({ alerts }: { alerts: Alert[] }) {
  const [expanded, setExpanded] = useState(false);

  if (alerts.length === 0) return null;

  const severe = alerts.filter((a) => a.severity === 'delay' || a.severity === 'suspended');
  const delays = alerts.filter((a) => a.severity === 'delay').length;
  const suspended = alerts.filter((a) => a.severity === 'suspended').length;
  const info = alerts.length - delays - suspended;

  const summaryParts: string[] = [];
  if (delays > 0) summaryParts.push(`${delays} delays`);
  if (suspended > 0) summaryParts.push(`${suspended} suspended`);
  if (info > 0) summaryParts.push(`${info} info`);
  const summaryText = summaryParts.join(' · ');

  if (expanded) {
    return (
      <div className="alerts">
        {alerts.map((a, i) => <AlertLine key={i} alert={a} />)}
        <button type="button" className="alert-summary" aria-expanded={true} onClick={() => setExpanded(false)}>
          ▴ Show less
        </button>
      </div>
    );
  }

  return (
    <div className="alerts">
      {severe.slice(0, 3).map((a, i) => <AlertLine key={i} alert={a} />)}
      {summaryParts.length > 0 && (
        <button type="button" className="alert-summary" aria-expanded={false} onClick={() => setExpanded(true)}>
          ⚠ {summaryText} ▾
        </button>
      )}
    </div>
  );
}
