import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config';

describe('loadConfig', () => {
  it('parses a complete env with defaults applied', () => {
    const cfg = loadConfig({ STATION: '127', WEATHER_LAT: '40.75', WEATHER_LON: '-73.98' });
    expect(cfg.stations).toEqual(['127']);
    expect(cfg.displayMode).toBe('auto');
    expect(cfg.weatherLat).toBe(40.75);
    expect(cfg.feedRefreshSec).toBe(30);
    expect(cfg.alertsRefreshSec).toBe(120);
    expect(cfg.port).toBe(8080);
    expect(cfg.compact).toBe(false);
  });

  it('parses COMPACT as a boolean flag', () => {
    expect(loadConfig({ STATION: '127', COMPACT: '1' }).compact).toBe(true);
    expect(loadConfig({ STATION: '127', COMPACT: 'true' }).compact).toBe(true);
    expect(loadConfig({ STATION: '127', COMPACT: 'nope' }).compact).toBe(false);
  });

  it('parses a comma-separated STATION list, trimming whitespace', () => {
    const cfg = loadConfig({ STATION: '127, 635 ,A32' });
    expect(cfg.stations).toEqual(['127', '635', 'A32']);
  });

  it('throws when STATION is missing', () => {
    expect(() => loadConfig({})).toThrow(/STATION/);
  });

  it('throws when STATION is empty or whitespace', () => {
    expect(() => loadConfig({ STATION: '' })).toThrow(/STATION/);
    expect(() => loadConfig({ STATION: '   ' })).toThrow(/STATION/);
    expect(() => loadConfig({ STATION: ' , , ' })).toThrow(/STATION/);
  });

  it('throws on invalid displayMode', () => {
    expect(() => loadConfig({ STATION: '127', DISPLAY_MODE: 'bogus' })).toThrow(/DISPLAY_MODE/);
  });

  it('defaults busStops to an empty array', () => {
    expect(loadConfig({ STATION: '127' }).busStops).toEqual([]);
  });

  it('parses a comma-separated BUS_STOPS list, trimming whitespace', () => {
    const cfg = loadConfig({
      STATION: '127',
      BUS_STOPS: '400080, 404947',
      MTA_API_KEY: 'x'.repeat(36),
    });
    expect(cfg.busStops).toEqual(['400080', '404947']);
  });

  it('throws when BUS_STOPS is set without MTA_API_KEY', () => {
    expect(() => loadConfig({ STATION: '127', BUS_STOPS: '400080' })).toThrow(/MTA_API_KEY/);
    expect(() => loadConfig({ STATION: '127', BUS_STOPS: '400080' })).toThrow(/BUS_STOPS/);
  });
});
