import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { describe, it, expect, afterEach } from 'vitest';
import { boardFilePath, loadEntries, saveEntries } from '../src/boardConfig';
import type { BoardEntry } from '../src/types';

const tmpDirs: string[] = [];

function makeTmpDir(name: string): string {
  const dir = path.join(os.tmpdir(), `mta-test-boardConfig-${name}`);
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop()!;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('boardFilePath', () => {
  it('joins dataDir with board.json', () => {
    expect(boardFilePath('/some/dir')).toBe(path.join('/some/dir', 'board.json'));
  });
});

describe('saveEntries / loadEntries', () => {
  it('round-trips an array of entries', () => {
    const dir = makeTmpDir('roundtrip');
    const entries: BoardEntry[] = [
      { id: '127', type: 'subway' },
      { id: '400080', type: 'bus' },
    ];
    saveEntries(dir, entries);
    expect(loadEntries(dir)).toEqual(entries);
  });

  it('returns null when the directory/file does not exist', () => {
    const dir = makeTmpDir('missing');
    expect(loadEntries(dir)).toBeNull();
  });

  it('creates the data dir if missing when saving', () => {
    const dir = makeTmpDir('create-dir');
    expect(fs.existsSync(dir)).toBe(false);
    saveEntries(dir, [{ id: '127', type: 'subway' }]);
    expect(fs.existsSync(dir)).toBe(true);
    expect(fs.existsSync(boardFilePath(dir))).toBe(true);
  });

  it('returns null when the file contains invalid JSON', () => {
    const dir = makeTmpDir('invalid-json');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(boardFilePath(dir), 'not valid json{{{', 'utf8');
    expect(loadEntries(dir)).toBeNull();
  });

  it('returns null when the JSON shape is wrong (stations not an array)', () => {
    const dir = makeTmpDir('wrong-shape');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(boardFilePath(dir), JSON.stringify({ stations: 'nope' }), 'utf8');
    expect(loadEntries(dir)).toBeNull();
  });
});
