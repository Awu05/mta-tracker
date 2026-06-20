import type { Alert } from '../types';

interface AlertEntity {
  alert?: {
    effect?: string | null;
    informedEntity?: Array<{ routeId?: string | null }> | null;
    headerText?: { translation?: Array<{ text?: string | null; language?: string | null }> | null } | null;
  } | null;
}

function severityFromEffect(effect?: string | null): string {
  if (!effect) return 'info';
  const e = effect.toUpperCase();
  if (e.includes('DELAY')) return 'delay';
  if (e.includes('NO_SERVICE') || e.includes('SUSPEND')) return 'suspended';
  return 'info';
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
    out.push({ routes: [...new Set(alertRoutes)], severity: severityFromEffect(a.effect), text });
  }
  return out;
}
