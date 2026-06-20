import type { Weather } from './types';

// Minimal WMO weather-code mapping -> (condition, icon).
const CODES: Record<number, [string, string]> = {
  0: ['Clear', 'clear'],
  1: ['Mainly Clear', 'clear'], 2: ['Partly Cloudy', 'cloudy'], 3: ['Overcast', 'cloudy'],
  45: ['Fog', 'fog'], 48: ['Fog', 'fog'],
  51: ['Drizzle', 'rain'], 53: ['Drizzle', 'rain'], 55: ['Drizzle', 'rain'],
  61: ['Rain', 'rain'], 63: ['Rain', 'rain'], 65: ['Heavy Rain', 'rain'],
  71: ['Snow', 'snow'], 73: ['Snow', 'snow'], 75: ['Heavy Snow', 'snow'],
  80: ['Showers', 'rain'], 81: ['Showers', 'rain'], 82: ['Showers', 'rain'],
  95: ['Thunderstorm', 'storm'], 96: ['Thunderstorm', 'storm'], 99: ['Thunderstorm', 'storm'],
};

export async function fetchWeather(
  lat: number,
  lon: number,
  fetchFn: typeof fetch = fetch,
): Promise<Weather> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,weather_code&temperature_unit=fahrenheit`;
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`Weather fetch failed: ${res.status}`);
  const data = (await res.json()) as { current: { temperature_2m: number; weather_code: number } };
  const [condition, icon] = CODES[data.current.weather_code] ?? ['Unknown', 'cloudy'];
  return { tempF: Math.round(data.current.temperature_2m), condition, icon };
}
