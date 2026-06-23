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

export async function fetchBoard(code: string): Promise<Board> {
  const res = await fetch(`/api/boards/${code}`);
  if (!res.ok) throw new Error(`Board fetch failed: ${res.status}`);
  return (await res.json()) as Board;
}

export async function searchStations(q: string): Promise<SearchResult[]> {
  if (!q) return [];
  const res = await fetch(`/api/stations/search?q=${encodeURIComponent(q)}`);
  if (!res.ok) throw new Error(`Station search failed: ${res.status}`);
  return (await res.json()) as SearchResult[];
}

export async function fetchNearbyBuses(code: string, stationId: string): Promise<NearbyStop[]> {
  const res = await fetch(`/api/nearby-buses?stationId=${encodeURIComponent(stationId)}&code=${encodeURIComponent(code)}`);
  if (!res.ok) throw new Error(`Nearby buses fetch failed: ${res.status}`);
  return (await res.json()) as NearbyStop[];
}

export async function addStation(code: string, entry: { id: string; type: 'subway' | 'bus' }): Promise<boolean> {
  const res = await fetch(`/api/boards/${code}/stations`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entry),
  });
  if (res.status === 409) return false;
  if (!res.ok) throw new Error(`Add station failed: ${res.status}`);
  return true;
}

export async function removeStation(code: string, entry: { id: string; type: 'subway' | 'bus' }): Promise<void> {
  const res = await fetch(`/api/boards/${code}/stations`, {
    method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entry),
  });
  if (!res.ok) throw new Error(`Remove station failed: ${res.status}`);
}

export async function setWeather(code: string, lat: number, lon: number): Promise<void> {
  const res = await fetch(`/api/boards/${code}/weather`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lat, lon }),
  });
  if (!res.ok) throw new Error(`Set weather failed: ${res.status}`);
}

export async function geocode(q: string): Promise<GeoResult[]> {
  const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
  if (!res.ok) throw new Error(`Geocode failed: ${res.status}`);
  return (await res.json()) as GeoResult[];
}
