import type { Alert, Arrival } from '../types';
import type { BoardCache } from '../cache';
import { severityFromText } from './alerts';

const FETCH_TIMEOUT_MS = 12_000;

const SBS_STYLE = { color: '#00467F', textColor: '#ffffff' };
const LOCAL_STYLE = { color: '#1E5BA8', textColor: '#ffffff' };

export function busStopUrl(stopCode: string, key: string): string {
  return `https://bustime.mta.info/api/siri/stop-monitoring.json?key=${key}&version=2&MonitoringRef=${stopCode}`;
}

export interface NearbyStop {
  code: string;
  name: string;
  routes: string[];
  distanceMeters: number;
}

export function nearbyBusStopsUrl(lat: number, lon: number, key: string, radius = 400): string {
  return `https://bustime.mta.info/api/where/stops-for-location.json?key=${key}&lat=${lat}&lon=${lon}&radius=${radius}&version=2`;
}

/** Great-circle distance between two lat/lon points, in meters. */
function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const EARTH_RADIUS_M = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_M * c;
}

interface ObaStop {
  id?: string;
  code?: string;
  name?: string;
  lat?: number;
  lon?: number;
  routeIds?: string[];
}

interface ObaRoute {
  id?: string;
  shortName?: string;
}

export function transformNearbyStops(oba: unknown, fromLat: number, fromLon: number): NearbyStop[] {
  const root = (oba ?? {}) as {
    data?: {
      list?: ObaStop[];
      references?: { routes?: ObaRoute[] };
    };
  };

  const list = Array.isArray(root.data?.list) ? (root.data!.list as ObaStop[]) : [];
  const routeRefs = Array.isArray(root.data?.references?.routes)
    ? (root.data!.references!.routes as ObaRoute[])
    : [];

  const routeShortNameById = new Map<string, string>();
  for (const r of routeRefs) {
    if (r.id && r.shortName) routeShortNameById.set(r.id, r.shortName);
  }

  const stops: NearbyStop[] = [];
  for (const s of list) {
    const lat = s.lat;
    const lon = s.lon;
    if (typeof lat !== 'number' || typeof lon !== 'number') continue;

    const rawId = s.id ?? s.code ?? '';
    const idx = rawId.lastIndexOf('_');
    const code = (idx >= 0 ? rawId.slice(idx + 1) : rawId) || (s.code ?? '');
    if (!code) continue;

    const routeIds = Array.isArray(s.routeIds) ? s.routeIds : [];
    const routes = [...new Set(routeIds.map((id) => routeShortNameById.get(id)).filter((r): r is string => !!r))];

    stops.push({
      code,
      name: s.name ?? '',
      routes,
      distanceMeters: haversineMeters(fromLat, fromLon, lat, lon),
    });
  }

  stops.sort((a, b) => a.distanceMeters - b.distanceMeters);
  return stops;
}

export async function fetchNearbyBusStops(
  lat: number,
  lon: number,
  key: string,
  fetchFn: typeof fetch = fetch,
  radius = 400,
): Promise<NearbyStop[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const url = nearbyBusStopsUrl(lat, lon, key, radius);
    const res = await fetchFn(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`Nearby bus stops lookup returned ${res.status}`);
    const json = await res.json();
    return transformNearbyStops(json, lat, lon);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * MTA SIRI JSON frequently wraps string fields in single-element arrays
 * (and occasionally arrays of {value}/{Value} objects). Defensively unwrap.
 */
function firstStr(x: unknown): string {
  if (typeof x === 'string') return x;
  if (Array.isArray(x)) {
    const first = x[0];
    if (typeof first === 'string') return first;
    if (first && typeof first === 'object') {
      const obj = first as Record<string, unknown>;
      if (typeof obj.value === 'string') return obj.value;
      if (typeof obj.Value === 'string') return obj.Value;
    }
  }
  return '';
}

function isSbs(route: string, lineRef: string): boolean {
  return route.includes('+') || route.toUpperCase().includes('SBS') || lineRef.includes('SBS') || lineRef.includes('+');
}

interface MonitoredCall {
  ExpectedArrivalTime?: string;
  ExpectedDepartureTime?: string;
  StopPointName?: unknown;
  ArrivalProximityText?: unknown;
  Extensions?: { Distances?: { PresentableDistance?: unknown } };
}

interface MonitoredVehicleJourney {
  PublishedLineName?: unknown;
  DestinationName?: unknown;
  LineRef?: string;
  MonitoredCall?: MonitoredCall;
}

interface MonitoredStopVisit {
  MonitoredVehicleJourney?: MonitoredVehicleJourney;
}

interface PtSituationElement {
  Summary?: unknown;
  Description?: unknown;
  Affects?: {
    VehicleJourneys?: {
      AffectedVehicleJourney?: Array<{ LineRef?: string }> | { LineRef?: string };
    };
  };
}

function presentableDistance(mc: MonitoredCall): string {
  const ext = firstStr(mc.Extensions?.Distances?.PresentableDistance);
  if (ext) return ext;
  return firstStr(mc.ArrivalProximityText);
}

function affectedRouteShortNames(situation: PtSituationElement): string[] {
  const ajRaw = situation.Affects?.VehicleJourneys?.AffectedVehicleJourney;
  const aj = ajRaw == null ? [] : Array.isArray(ajRaw) ? ajRaw : [ajRaw];
  const names = aj
    .map((j) => j.LineRef ?? '')
    .filter((r): r is string => !!r)
    .map((r) => {
      const idx = r.lastIndexOf('_');
      return (idx >= 0 ? r.slice(idx + 1) : r).trim();
    })
    .filter((r) => r.length > 0);
  return [...new Set(names)];
}

export function transformBusStop(
  siri: unknown,
  nowMs: number,
): { name: string | null; arrivals: Arrival[]; alerts: Alert[] } {
  const root = (siri ?? {}) as {
    Siri?: {
      ServiceDelivery?: {
        StopMonitoringDelivery?: Array<{ MonitoredStopVisit?: MonitoredStopVisit[] }>;
        SituationExchangeDelivery?: Array<{ Situations?: { PtSituationElement?: PtSituationElement[] } }>;
      };
    };
  };

  const delivery = root.Siri?.ServiceDelivery;
  const visits = delivery?.StopMonitoringDelivery?.[0]?.MonitoredStopVisit ?? [];

  const numeric: Arrival[] = [];
  const noteOnly: Arrival[] = [];
  let name: string | null = null;

  for (const visit of visits) {
    const mvj = visit.MonitoredVehicleJourney;
    if (!mvj) continue;
    const mc = mvj.MonitoredCall ?? {};

    if (name === null) {
      const stopName = firstStr(mc.StopPointName);
      if (stopName) name = stopName;
    }

    const route = firstStr(mvj.PublishedLineName);
    const destination = firstStr(mvj.DestinationName);
    const lineRef = mvj.LineRef ?? '';
    const style = isSbs(route, lineRef) ? SBS_STYLE : LOCAL_STYLE;

    const etaStr = mc.ExpectedArrivalTime || mc.ExpectedDepartureTime;
    let minutes: number | null = null;
    let note: string | undefined;
    if (etaStr) {
      minutes = Math.max(0, Math.floor((Date.parse(etaStr) - nowMs) / 60_000));
    } else {
      note = presentableDistance(mc) || 'due';
    }

    const arrival: Arrival = {
      route,
      color: style.color,
      textColor: style.textColor,
      destination,
      minutes,
      ...(note !== undefined ? { note } : {}),
    };

    if (minutes !== null) numeric.push(arrival);
    else noteOnly.push(arrival);
  }

  numeric.sort((a, b) => (a.minutes as number) - (b.minutes as number));
  const arrivals = [...numeric, ...noteOnly];

  const routesSeen = [...new Set(arrivals.map((a) => a.route).filter((r) => r.length > 0))];

  const situations = delivery?.SituationExchangeDelivery?.[0]?.Situations?.PtSituationElement ?? [];
  const alerts: Alert[] = [];
  for (const situation of situations) {
    const text = firstStr(situation.Summary) || firstStr(situation.Description);
    if (!text) continue;
    const affectedRoutes = affectedRouteShortNames(situation);
    const routes = affectedRoutes.length > 0 ? affectedRoutes : routesSeen;
    alerts.push({ routes, severity: severityFromText(text) ?? 'info', text });
  }

  return { name, arrivals, alerts };
}

export async function fetchBusStop(
  stopCode: string,
  key: string,
  fetchFn: typeof fetch = fetch,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const url = busStopUrl(stopCode, key);
    const res = await fetchFn(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`Bus stop ${stopCode} returned ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function pollBusStops(
  cache: BoardCache,
  busStops: string[],
  key: string,
  fetchFn: typeof fetch = fetch,
  now: () => number = () => Date.now(),
): Promise<void> {
  await Promise.all(
    busStops.map(async (code) => {
      try {
        const siri = await fetchBusStop(code, key, fetchFn);
        const { name, arrivals, alerts } = transformBusStop(siri, now());
        cache.setBusArrivals(code, arrivals, now(), name ?? undefined);
        cache.setAlerts(code, alerts);
      } catch (err) {
        console.error(`[bus] poll failed for stop ${code}; keeping last-good data:`, err);
      }
    }),
  );
}
