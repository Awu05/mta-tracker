import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config';

describe('loadConfig', () => {
  it('parses a complete env with defaults applied', () => {
    const cfg = loadConfig({ STATION: '127', WEATHER_LAT: '40.75', WEATHER_LON: '-73.98' });
    expect(cfg.station).toBe('127');
    expect(cfg.displayMode).toBe('auto');
    expect(cfg.weatherLat).toBe(40.75);
    expect(cfg.feedRefreshSec).toBe(30);
    expect(cfg.alertsRefreshSec).toBe(120);
    expect(cfg.port).toBe(8080);
  });

  it('throws when STATION is missing', () => {
    expect(() => loadConfig({})).toThrow(/STATION/);
  });

  it('throws on invalid displayMode', () => {
    expect(() => loadConfig({ STATION: '127', DISPLAY_MODE: 'bogus' })).toThrow(/DISPLAY_MODE/);
  });
});
