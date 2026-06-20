import type { Board } from './types';

export async function fetchBoard(): Promise<Board> {
  const res = await fetch('/api/board');
  if (!res.ok) throw new Error(`Board fetch failed: ${res.status}`);
  return (await res.json()) as Board;
}
