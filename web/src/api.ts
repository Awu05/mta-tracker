import type { Board } from './types';

export async function fetchBoard(): Promise<Board> {
  const res = await fetch('/api/board');
  if (!res.ok) throw new Error(`Board fetch failed: ${res.status}`);
  return (await res.json()) as Board;
}

export interface SearchResult { id: string; name: string; routes: string[]; }
export interface NearbyStop { code: string; name: string; routes: string[]; distanceMeters: number; alreadyAdded: boolean; }

export async function searchStations(q: string): Promise<SearchResult[]> {
  if (!q) return [];
  const res = await fetch(`/api/stations/search?q=${encodeURIComponent(q)}`);
  if (!res.ok) throw new Error(`Station search failed: ${res.status}`);
  return (await res.json()) as SearchResult[];
}

export async function fetchNearbyBuses(stationId: string): Promise<NearbyStop[]> {
  const res = await fetch(`/api/nearby-buses?stationId=${encodeURIComponent(stationId)}`);
  if (!res.ok) throw new Error(`Nearby buses fetch failed: ${res.status}`);
  return (await res.json()) as NearbyStop[];
}

export async function addStation(entry: { id: string; type: 'subway' | 'bus' }): Promise<void> {
  const res = await fetch('/api/board/stations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry),
  });
  if (!res.ok) throw new Error(`Add station failed: ${res.status}`);
}

export async function removeStation(entry: { id: string; type: 'subway' | 'bus' }): Promise<void> {
  const res = await fetch('/api/board/stations', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry),
  });
  if (!res.ok) throw new Error(`Remove station failed: ${res.status}`);
}
