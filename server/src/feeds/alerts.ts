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

export function transformAlerts(entities: AlertEntity[], routes: string[]): Alert[] {
  const wanted = new Set(routes);
  const out: Alert[] = [];
  for (const e of entities) {
    const a = e.alert;
    if (!a) continue;
    const alertRoutes = (a.informedEntity ?? [])
      .map((ie) => ie.routeId)
      .filter((r): r is string => !!r);
    if (!alertRoutes.some((r) => wanted.has(r))) continue;
    const text = headerText(a);
    if (!text) continue;
    out.push({ routes: [...new Set(alertRoutes)], severity: severity(a.effect, text), text });
  }
  return out;
}
