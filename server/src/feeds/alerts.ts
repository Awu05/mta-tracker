import type { Alert } from '../types';

interface AlertEntity {
  alert?: {
    effect?: string | number | null;
    informedEntity?: Array<{ routeId?: string | null }> | null;
    headerText?: { translation?: Array<{ text?: string | null; language?: string | null }> | null } | null;
  } | null;
}

// transit_realtime.Alert.Effect enum -> our severity buckets
const EFFECT_SEVERITY: Record<number, string> = {
  1: 'suspended', // NO_SERVICE
  2: 'delay',     // REDUCED_SERVICE
  3: 'delay',     // SIGNIFICANT_DELAYS
};

function severityFromEffect(effect?: string | number | null): string | null {
  if (effect == null) return null;
  if (typeof effect === 'number') return EFFECT_SEVERITY[effect] ?? null;
  const e = effect.toUpperCase();
  if (e.includes('DELAY')) return 'delay';
  if (e.includes('NO_SERVICE') || e.includes('SUSPEND')) return 'suspended';
  return null;
}

// The real MTA subway-alerts feed sets effect = 8 (UNKNOWN_EFFECT) on every
// alert; the actual severity signal lives in the MTA "mercury" protobuf
// extension, which gtfs-realtime-bindings does not decode. The headerText is
// reliable, so we infer severity from it and only fall back to the numeric
// enum mapping above when the text gives us nothing.
export function severityFromText(text: string): string | null {
  const t = text.toLowerCase();
  if (
    t.includes('no service') ||
    /\bno\b[^.]*\btrain service\b/.test(t) ||
    t.includes('suspend') ||
    t.includes('not running')
  ) {
    return 'suspended';
  }
  if (t.includes('delay') || t.includes('longer wait') || t.includes('running slow') || t.includes('expect delays')) return 'delay';
  return null;
}

function severity(effect: string | number | null | undefined, text: string): string {
  return severityFromEffect(effect) ?? severityFromText(text) ?? 'info';
}

function headerText(a: NonNullable<AlertEntity['alert']>): string {
  const translations = a.headerText?.translation ?? [];
  const en = translations.find((t) => t.language === 'en') ?? translations[0];
  return (en?.text ?? '').trim();
}

interface StationRoutes { id: string; routes: string[]; }

/**
 * Single pass over all decoded alert entities, fanning each alert out to
 * every requested station whose routes it touches. Cost is O(entities ×
 * routesPerAlert + stations) regardless of how many stations are configured —
 * versus re-scanning the whole feed once per station. Returns a map keyed by
 * station id; every requested id is present (empty array if no alerts
 * matched).
 */
export function transformAlertsByStation(
  entities: AlertEntity[],
  stations: StationRoutes[],
): Map<string, Alert[]> {
  const stationsByRoute = new Map<string, string[]>();
  for (const s of stations) {
    for (const r of s.routes) {
      const ids = stationsByRoute.get(r);
      if (ids) ids.push(s.id);
      else stationsByRoute.set(r, [s.id]);
    }
  }

  const out = new Map<string, Alert[]>();
  for (const s of stations) out.set(s.id, []);

  for (const e of entities) {
    const a = e.alert;
    if (!a) continue;
    const alertRoutes = (a.informedEntity ?? [])
      .map((ie) => ie.routeId)
      .filter((r): r is string => !!r);
    if (alertRoutes.length === 0) continue;

    // Union of stations matching ANY of this alert's routes, deduped so an
    // alert touching 2+ of a station's routes isn't added to it twice.
    const matchedStations = new Set<string>();
    for (const r of alertRoutes) {
      for (const id of stationsByRoute.get(r) ?? []) matchedStations.add(id);
    }
    if (matchedStations.size === 0) continue;

    const text = headerText(a);
    if (!text) continue;
    const alert: Alert = { routes: [...new Set(alertRoutes)], severity: severity(a.effect, text), text };
    for (const id of matchedStations) out.get(id)!.push(alert);
  }

  return out;
}
