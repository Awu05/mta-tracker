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

  it('maps numeric protobuf enum effects to severity', () => {
    const numericAlert = (routes: string[], header: string, effect: number) => ({
      alert: {
        effect,
        informedEntity: routes.map((routeId) => ({ routeId })),
        headerText: { translation: [{ text: header, language: 'en' }] },
      },
    });
    expect(transformAlerts([numericAlert(['1'], 'Big delays', 3)], ['1'])[0].severity).toBe('delay');
    expect(transformAlerts([numericAlert(['1'], 'No trains', 1)], ['1'])[0].severity).toBe('suspended');
    expect(transformAlerts([numericAlert(['1'], 'Detour', 4)], ['1'])[0].severity).toBe('info');
  });

  it('does not throw on a numeric effect (real-feed shape)', () => {
    const numericAlert = { alert: { effect: 3, informedEntity: [{ routeId: '1' }], headerText: { translation: [{ text: 'x', language: 'en' }] } } };
    expect(() => transformAlerts([numericAlert], ['1'])).not.toThrow();
  });

  it('infers severity from header text when effect is unknown (real-feed shape)', () => {
    const a = (text: string, effect = 8) => ({
      alert: { effect, informedEntity: [{ routeId: '1' }], headerText: { translation: [{ text, language: 'en' }] } },
    });
    expect(transformAlerts([a('Southbound [1] trains are delayed')], ['1'])[0].severity).toBe('delay');
    expect(transformAlerts([a('No [1] train service in both directions')], ['1'])[0].severity).toBe('suspended');
    expect(transformAlerts([a('[1] trains are running with longer wait times')], ['1'])[0].severity).toBe('delay');
    expect(transformAlerts([a('Elevator at station is out of service')], ['1'])[0].severity).toBe('info');
  });
});
