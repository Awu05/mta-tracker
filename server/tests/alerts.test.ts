import { describe, it, expect } from 'vitest';
import { transformAlerts } from '../src/feeds/alerts';

function alertEntity(routes: string[], header: string, effect?: string) {
  return {
    alert: {
      effect,
      informedEntity: routes.map((routeId) => ({ routeId })),
      headerText: { translation: [{ text: header, language: 'en' }] },
    },
  };
}

describe('transformAlerts', () => {
  it('keeps only alerts touching the given routes', () => {
    const entities = [
      alertEntity(['N', 'Q'], 'Northbound delays near 57 St', 'SIGNIFICANT_DELAYS'),
      alertEntity(['L'], 'L train planned work'),
    ];
    const alerts = transformAlerts(entities, ['1', 'N']);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].routes).toEqual(['N', 'Q']);
    expect(alerts[0].text).toBe('Northbound delays near 57 St');
    expect(alerts[0].severity).toBe('delay');
  });

  it('returns an empty array when nothing matches', () => {
    const entities = [alertEntity(['L'], 'L train work')];
    expect(transformAlerts(entities, ['1'])).toEqual([]);
  });

  it('falls back to "info" severity and skips empty headers', () => {
    const entities = [
      alertEntity(['1'], 'Elevator out at station'),
      alertEntity(['1'], ''),
    ];
    const alerts = transformAlerts(entities, ['1']);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].severity).toBe('info');
  });
});
