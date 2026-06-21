import { useState } from 'react';
import type { Alert } from '../types';

export function Alerts({ alerts, compact }: { alerts: Alert[]; compact?: boolean }) {
  const [expanded, setExpanded] = useState(false);

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
  const summaryText = summaryParts.join(' · ');

  if (expanded) {
    return (
      <div className="alerts">
        {alerts.map((a, i) => (
          <div key={i} className="alert-line">
            <b>⚠ {a.routes.join('/')}:</b> {a.text}
          </div>
        ))}
        <button type="button" className="alert-summary" aria-expanded={true} onClick={() => setExpanded(false)}>
          ▴ Show less
        </button>
      </div>
    );
  }

  return (
    <div className="alerts">
      {severe.slice(0, 3).map((a, i) => (
        <div key={i} className="alert-line">
          <b>⚠ {a.routes.join('/')}:</b> {a.text}
        </div>
      ))}
      {summaryParts.length > 0 && (
        <button type="button" className="alert-summary" aria-expanded={false} onClick={() => setExpanded(true)}>
          ⚠ {summaryText} ▾
        </button>
      )}
    </div>
  );
}
