import type { AppConfig } from './types';

type Env = Record<string, string | undefined>;

function num(env: Env, key: string, def: number): number {
  const raw = env[key];
  if (raw === undefined || raw === '') return def;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`Invalid number for ${key}: ${raw}`);
  return n;
}

export function loadConfig(env: Env = process.env): AppConfig {
  const stations = (env.STATION ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (stations.length === 0) {
    throw new Error('Missing required env STATION (comma-separated list of station stop ids)');
  }

  const displayMode = (env.DISPLAY_MODE ?? 'auto') as AppConfig['displayMode'];
  if (!['kiosk', 'phone', 'auto'].includes(displayMode)) {
    throw new Error(`Invalid DISPLAY_MODE: ${displayMode} (expected kiosk|phone|auto)`);
  }

  return {
    stations,
    displayMode,
    weatherLat: num(env, 'WEATHER_LAT', 40.7128),
    weatherLon: num(env, 'WEATHER_LON', -74.006),
    feedRefreshSec: num(env, 'FEED_REFRESH_SEC', 30),
    alertsRefreshSec: num(env, 'ALERTS_REFRESH_SEC', 120),
    weatherRefreshSec: num(env, 'WEATHER_REFRESH_SEC', 600),
    staleThresholdSec: num(env, 'STALE_THRESHOLD_SEC', 90),
    mtaApiKey: env.MTA_API_KEY ?? '',
    port: num(env, 'PORT', 8080),
  };
}
