import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config';

describe('loadConfig', () => {
  it('applies defaults with an empty environment', () => {
    const c = loadConfig({});
    expect(c.displayMode).toBe('auto');
    expect(c.port).toBe(8080);
    expect(c.databaseUrl).toBe('');
    expect(c.activeTtlMs).toBe(7 * 24 * 60 * 60 * 1000);
    expect(c.mtaApiKey).toBe('');
    expect(c.compact).toBe(false);
  });

  it('reads DATABASE_URL and ACTIVE_TTL_DAYS', () => {
    const c = loadConfig({ DATABASE_URL: 'postgres://x', ACTIVE_TTL_DAYS: '2' });
    expect(c.databaseUrl).toBe('postgres://x');
    expect(c.activeTtlMs).toBe(2 * 24 * 60 * 60 * 1000);
  });

  it('rejects an invalid DISPLAY_MODE', () => {
    expect(() => loadConfig({ DISPLAY_MODE: 'wall' })).toThrow(/DISPLAY_MODE/);
  });
});
