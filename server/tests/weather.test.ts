import { describe, it, expect, vi } from 'vitest';
import { fetchWeather } from '../src/weather';

const SAMPLE = {
  current: { temperature_2m: 71.6, weather_code: 0 },
};

describe('fetchWeather', () => {
  it('maps Open-Meteo current weather to the Weather model', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => SAMPLE,
    }) as unknown as typeof fetch;

    const w = await fetchWeather(40.75, -73.98, fakeFetch);
    expect(w.tempF).toBe(72);            // rounded
    expect(w.condition).toBe('Clear');   // code 0
    expect(w.icon).toBe('clear');
    const calledUrl = (fakeFetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(calledUrl).toContain('latitude=40.75');
    expect(calledUrl).toContain('temperature_unit=fahrenheit');
  });

  it('throws on a non-ok response', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({ ok: false, status: 503 }) as unknown as typeof fetch;
    await expect(fetchWeather(1, 2, fakeFetch)).rejects.toThrow(/503/);
  });
});
