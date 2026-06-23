import type { AppConfig } from './types';

type Env = Record<string, string | undefined>;

function num(env: Env, key: string, def: number): number {
  const raw = env[key];
  if (raw === undefined || raw === '') return def;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`Invalid number for ${key}: ${raw}`);
  return n;
}

function bool(env: Env, key: string, def: boolean): boolean {
  const raw = env[key];
  if (raw === undefined || raw === '') return def;
  return ['1', 'true', 'yes', 'on'].includes(raw.trim().toLowerCase());
}

export function loadConfig(env: Env = process.env): AppConfig {
  const displayMode = (env.DISPLAY_MODE ?? 'auto') as AppConfig['displayMode'];
  if (!['kiosk', 'phone', 'auto'].includes(displayMode)) {
    throw new Error(`Invalid DISPLAY_MODE: ${displayMode} (expected kiosk|phone|auto)`);
  }

  return {
    displayMode,
    feedRefreshSec: num(env, 'FEED_REFRESH_SEC', 30),
    alertsRefreshSec: num(env, 'ALERTS_REFRESH_SEC', 120),
    weatherRefreshSec: num(env, 'WEATHER_REFRESH_SEC', 600),
    staleThresholdSec: num(env, 'STALE_THRESHOLD_SEC', 90),
    mtaApiKey: env.MTA_API_KEY ?? '',
    port: num(env, 'PORT', 8080),
    compact: bool(env, 'COMPACT', false),
    databaseUrl: env.DATABASE_URL ?? '',
    activeTtlMs: num(env, 'ACTIVE_TTL_DAYS', 7) * 24 * 60 * 60 * 1000,
  };
}
