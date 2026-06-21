import type { Weather, HourForecast, DayForecast } from './types';

// Minimal WMO weather-code mapping -> (condition, icon slug).
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

function codeToParts(code: number): { condition: string; icon: string } {
  const [condition, icon] = CODES[code] ?? ['Unknown', 'cloudy'];
  return { condition, icon };
}

interface OMResponse {
  current: { time: string; temperature_2m: number; weather_code: number };
  hourly?: {
    time: string[];
    temperature_2m: number[];
    weather_code: number[];
    precipitation_probability: number[];
  };
  daily?: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_probability_max: number[];
  };
}

const MAX_HOURS = 12;
const MAX_DAYS = 5;

// Keep the current hour onward (compare on "YYYY-MM-DDTHH"), soonest first, capped.
export function buildHourly(om: OMResponse): HourForecast[] {
  const h = om.hourly;
  if (!h) return [];
  const nowHour = om.current.time.slice(0, 13);
  const out: HourForecast[] = [];
  for (let i = 0; i < h.time.length && out.length < MAX_HOURS; i++) {
    if (h.time[i].slice(0, 13) < nowHour) continue;
    out.push({
      time: h.time[i],
      tempF: Math.round(h.temperature_2m[i]),
      icon: codeToParts(h.weather_code[i]).icon,
      precipPct: Math.round(h.precipitation_probability?.[i] ?? 0),
    });
  }
  return out;
}

// Today onward, soonest first, capped.
export function buildDaily(om: OMResponse): DayForecast[] {
  const d = om.daily;
  if (!d) return [];
  const out: DayForecast[] = [];
  for (let i = 0; i < d.time.length && out.length < MAX_DAYS; i++) {
    out.push({
      date: d.time[i],
      hiF: Math.round(d.temperature_2m_max[i]),
      loF: Math.round(d.temperature_2m_min[i]),
      icon: codeToParts(d.weather_code[i]).icon,
      precipPct: Math.round(d.precipitation_probability_max?.[i] ?? 0),
    });
  }
  return out;
}

const WEATHER_TIMEOUT_MS = 12_000;

export async function fetchWeather(
  lat: number,
  lon: number,
  fetchFn: typeof fetch = fetch,
): Promise<Weather> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,weather_code` +
    `&hourly=temperature_2m,weather_code,precipitation_probability` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
    `&temperature_unit=fahrenheit&timezone=auto`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WEATHER_TIMEOUT_MS);
  try {
    const res = await fetchFn(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`Weather fetch failed: ${res.status}`);
    const data = (await res.json()) as OMResponse;
    const { condition, icon } = codeToParts(data.current.weather_code);
    return {
      tempF: Math.round(data.current.temperature_2m),
      condition,
      icon,
      hourly: buildHourly(data),
      daily: buildDaily(data),
    };
  } finally {
    clearTimeout(timer);
  }
}
