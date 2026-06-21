import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import type { BoardEntry } from './types';

export function boardFilePath(dataDir: string): string {
  return path.join(dataDir, 'board.json');
}

export function loadEntries(dataDir: string): BoardEntry[] | null {
  try {
    const file = boardFilePath(dataDir);
    if (!existsSync(file)) return null;
    const raw = readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw) as { stations?: unknown };
    if (!Array.isArray(parsed.stations)) return null;
    return parsed.stations as BoardEntry[];
  } catch {
    return null;
  }
}

export function saveEntries(dataDir: string, entries: BoardEntry[]): void {
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(boardFilePath(dataDir), JSON.stringify({ stations: entries }, null, 2));
}
