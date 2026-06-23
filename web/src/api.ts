import type { Board } from './types';

export interface SearchResult { id: string; name: string; routes: string[] }
export interface NearbyStop { code: string; name: string; routes: string[]; distanceMeters: number; alreadyAdded: boolean }
export interface GeoResult { name: string; admin1: string; country: string; lat: number; lon: number }

// Same alphabet/length as server/src/boards/code.ts — keep these in sync.
const CODE_ALPHABET = '23456789abcdefghijkmnpqrstuvwxyz';
const CODE_LENGTH = 8;
const CODE_PATH_RE = new RegExp(`^/b/([${CODE_ALPHABET}]{${CODE_LENGTH}})`);

function mintCode(): string {
  let out = '';
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
    for (let i = 0; i < CODE_LENGTH; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  } else {
    for (let i = 0; i < CODE_LENGTH; i++) out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

// Read the board code from /b/:code; in dev (or a bare load) mint one and update the URL.
export function getBoardCode(): string {
  const m = window.location.pathname.match(CODE_PATH_RE);
  if (m) return m[1];
  const code = mintCode();
  window.history.replaceState(null, '', `/b/${code}`);
  return code;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

// Single fetch wrapper: throw a labeled error on a non-ok response. Callers that
// need the body use requestJson; void calls (mutations) use request directly.
async function request(label: string, url: string, init?: RequestInit): Promise<Response> {
  const res = init ? await fetch(url, init) : await fetch(url);
  if (!res.ok) throw new Error(`${label} failed: ${res.status}`);
  return res;
}

async function requestJson<T>(label: string, url: string, init?: RequestInit): Promise<T> {
  return (await request(label, url, init)).json() as Promise<T>;
}

export function fetchBoard(code: string): Promise<Board> {
  return requestJson('Board fetch', `/api/boards/${code}`);
}

export function searchStations(q: string): Promise<SearchResult[]> {
  if (!q) return Promise.resolve([]);
  return requestJson('Station search', `/api/stations/search?q=${encodeURIComponent(q)}`);
}

export function fetchNearbyBuses(code: string, stationId: string): Promise<NearbyStop[]> {
  return requestJson('Nearby buses fetch', `/api/nearby-buses?stationId=${encodeURIComponent(stationId)}&code=${encodeURIComponent(code)}`);
}

export async function addStation(code: string, entry: { id: string; type: 'subway' | 'bus' }): Promise<boolean> {
  // Not via request(): a 409 (already added) is an expected result, not an error.
  const res = await fetch(`/api/boards/${code}/stations`, {
    method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(entry),
  });
  if (res.status === 409) return false;
  if (!res.ok) throw new Error(`Add station failed: ${res.status}`);
  return true;
}

export async function removeStation(code: string, entry: { id: string; type: 'subway' | 'bus' }): Promise<void> {
  await request('Remove station', `/api/boards/${code}/stations`, {
    method: 'DELETE', headers: JSON_HEADERS, body: JSON.stringify(entry),
  });
}

export async function reorderStations(code: string, order: { id: string; type: 'subway' | 'bus' }[]): Promise<void> {
  await request('Reorder', `/api/boards/${code}/stations/order`, {
    method: 'PUT', headers: JSON_HEADERS, body: JSON.stringify({ order }),
  });
}

export async function setWeather(code: string, lat: number, lon: number): Promise<void> {
  await request('Set weather', `/api/boards/${code}/weather`, {
    method: 'PUT', headers: JSON_HEADERS, body: JSON.stringify({ lat, lon }),
  });
}

export function geocode(q: string): Promise<GeoResult[]> {
  return requestJson('Geocode', `/api/geocode?q=${encodeURIComponent(q)}`);
}
