import { describe, it, expect, vi } from 'vitest';
import { fetchWeather, buildHourly, buildDaily } from '../src/weather';

const CURRENT_ONLY = {
  current: { time: '2026-06-21T15:00', temperature_2m: 71.6, weather_code: 0 },
};

const FULL = {
  current: { time: '2026-06-21T15:20', temperature_2m: 71.6, weather_code: 0 },
  hourly: {
    // two past hours, then 13 future hours (to prove the 12-cap + past filter)
    time: [
      '2026-06-21T13:00', '2026-06-21T14:00',
      '2026-06-21T15:00', '2026-06-21T16:00', '2026-06-21T17:00', '2026-06-21T18:00',
      '2026-06-21T19:00', '2026-06-21T20:00', '2026-06-21T21:00', '2026-06-21T22:00',
      '2026-06-21T23:00', '2026-06-22T00:00', '2026-06-22T01:00', '2026-06-22T02:00',
      '2026-06-22T03:00',
    ],
    temperature_2m: [60, 61, 71.6, 72, 73, 70, 68, 66, 65, 64, 63, 62, 61, 60, 59],
    weather_code: [3, 3, 0, 1, 2, 3, 61, 61, 71, 95, 45, 0, 0, 0, 0],
    precipitation_probability: [0, 0, 0, 10, 20, 30, 80, 80, 40, 90, 5, 0, 0, 0, 0],
  },
  daily: {
    time: ['2026-06-21', '2026-06-22', '2026-06-23', '2026-06-24', '2026-06-25', '2026-06-26'],
    weather_code: [0, 3, 61, 95, 71, 0],
    temperature_2m_max: [80.4, 78, 75, 70, 60, 82],
    temperature_2m_min: [60.6, 61, 59, 55, 40, 63],
    precipitation_probability_max: [0, 20, 80, 95, 60, 0],
  },
};

describe('fetchWeather', () => {
  it('maps Open-Meteo current weather to the Weather model', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({ ok: true, json: async () => CURRENT_ONLY }) as unknown as typeof fetch;
    const w = await fetchWeather(40.75, -73.98, fakeFetch);
    expect(w.tempF).toBe(72);
    expect(w.condition).toBe('Clear');
    expect(w.icon).toBe('clear');
    expect(w.hourly).toEqual([]);
    expect(w.daily).toEqual([]);
    const calledUrl = (fakeFetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(calledUrl).toContain('latitude=40.75');
    expect(calledUrl).toContain('temperature_unit=fahrenheit');
    expect(calledUrl).toContain('hourly=temperature_2m,weather_code,precipitation_probability');
    expect(calledUrl).toContain('daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max');
    expect(calledUrl).toContain('timezone=auto');
  });

  it('attaches sliced hourly and daily forecasts', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({ ok: true, json: async () => FULL }) as unknown as typeof fetch;
    const w = await fetchWeather(1, 2, fakeFetch);
    expect(w.hourly).toHaveLength(12);
    expect(w.daily).toHaveLength(5);
  });

  it('throws on a non-ok response', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({ ok: false, status: 503 }) as unknown as typeof fetch;
    await expect(fetchWeather(1, 2, fakeFetch)).rejects.toThrow(/503/);
  });
});

describe('buildHourly', () => {
  it('drops past hours, keeps the current hour onward, caps at 12, soonest first', () => {
    const h = buildHourly(FULL as never);
    expect(h).toHaveLength(12);
    expect(h[0].time).toBe('2026-06-21T15:00'); // current hour kept (current.time is 15:20)
    expect(h[0].tempF).toBe(72);                // 71.6 rounded
    expect(h[0].icon).toBe('clear');            // code 0
    expect(h[4].icon).toBe('rain');             // code 61
    expect(h[4].precipPct).toBe(80);
  });

  it('returns [] when no hourly block is present', () => {
    expect(buildHourly(CURRENT_ONLY as never)).toEqual([]);
  });
});

describe('buildDaily', () => {
  it('caps at 5 days, soonest first, maps hi/lo/icon/precip', () => {
    const d = buildDaily(FULL as never);
    expect(d).toHaveLength(5);
    expect(d[0].date).toBe('2026-06-21');
    expect(d[0].hiF).toBe(80);   // 80.4 rounded
    expect(d[0].loF).toBe(61);   // 60.6 rounded
    expect(d[0].icon).toBe('clear');
    expect(d[2].icon).toBe('rain'); // code 61
    expect(d[2].precipPct).toBe(80);
  });

  it('returns [] when no daily block is present', () => {
    expect(buildDaily(CURRENT_ONLY as never)).toEqual([]);
  });
});
