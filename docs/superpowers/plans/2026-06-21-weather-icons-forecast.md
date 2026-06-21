# Weather Icons + Expandable Forecast Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render a weather icon for the current condition and add a click-to-expand panel showing the next 12 hours and next 5 days.

**Architecture:** The server extends its existing Open-Meteo fetch to also pull hourly + daily arrays, slices them with pure helpers, and attaches them to the existing `Weather` object on `BoardModel.weather` (no new endpoint, no new poll loop). The web app renders the current condition with a new inline-SVG `WeatherIcon` and a new `Weather` component whose collapsed form is a button that toggles a forecast panel.

**Tech Stack:** Node.js 20 + TypeScript (CommonJS), Express, Vitest/Supertest (server); React 18 + Vite + TypeScript, Vitest + Testing Library + jsdom (web).

## Global Constraints

- Server compiles to **CommonJS** — no ESM-only syntax; plain JSON imports; `__dirname` not `import.meta.url`.
- The renderer-agnostic contract uses icon **slugs** (`clear`, `cloudy`, `rain`, `snow`, `fog`, `storm`), never raw WMO codes.
- The six valid slugs are exactly: `clear`, `cloudy`, `rain`, `snow`, `fog`, `storm`. Unknown WMO code → `['Unknown', 'cloudy']`; unknown slug in the UI → renders the `cloudy` icon.
- Temperatures are whole numbers (°F), rounded with `Math.round`.
- Hourly is capped at **12** entries (current hour onward); daily at **5** entries (today onward); both soonest-first.
- Keep existing behavior intact: the current-condition top-bar output and the existing `fetchWeather` tests must still pass.
- Web component/test conventions follow the existing `Alerts.tsx` expandable pattern and CSS variables in `web/src/styles.css` (`--panel`, `--divider`, `--muted`, `--dim`, `--text`).

---

### Task 1: Server — forecast types, slicing helpers, and extended fetch

**Files:**
- Modify: `server/src/types.ts` (add `HourForecast`, `DayForecast`; extend `Weather`)
- Modify: `server/src/weather.ts` (extend query, add `buildHourly`/`buildDaily`, attach to result)
- Test: `server/tests/weather.test.ts` (extend)

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `interface HourForecast { time: string; tempF: number; icon: string; precipPct: number }`
  - `interface DayForecast { date: string; hiF: number; loF: number; icon: string; precipPct: number }`
  - `Weather` gains `hourly: HourForecast[]` and `daily: DayForecast[]`.
  - `export function buildHourly(om: OMResponse): HourForecast[]`
  - `export function buildDaily(om: OMResponse): DayForecast[]`
  - `fetchWeather(lat, lon, fetchFn?)` now returns the extended `Weather`.

- [ ] **Step 1: Extend the `Weather` type and add forecast types**

In `server/src/types.ts`, replace the existing `Weather` interface (lines 24-28) with:

```ts
export interface HourForecast {
  time: string;       // Open-Meteo local ISO hour, e.g. "2026-06-21T15:00"
  tempF: number;      // whole °F
  icon: string;       // slug
  precipPct: number;  // 0-100
}

export interface DayForecast {
  date: string;       // local ISO date, e.g. "2026-06-21"
  hiF: number;        // whole °F
  loF: number;        // whole °F
  icon: string;       // slug
  precipPct: number;  // 0-100 (daily max)
}

export interface Weather {
  tempF: number;
  condition: string;
  icon: string;
  hourly: HourForecast[]; // up to 12, soonest first
  daily: DayForecast[];   // up to 5, soonest first
}
```

- [ ] **Step 2: Write failing tests for the slicing helpers and extended fetch**

Replace the contents of `server/tests/weather.test.ts` with:

```ts
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
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd server && npx vitest run tests/weather.test.ts`
Expected: FAIL — `buildHourly`/`buildDaily` are not exported, and `fetchWeather` returns no `hourly`/`daily`.

- [ ] **Step 4: Implement the extended weather module**

Replace the contents of `server/src/weather.ts` with:

```ts
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
      precipPct: Math.round(h.precipitation_probability[i] ?? 0),
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
      precipPct: Math.round(d.precipitation_probability_max[i] ?? 0),
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
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd server && npx vitest run tests/weather.test.ts`
Expected: PASS (all cases).

- [ ] **Step 6: Typecheck the whole server**

Run: `cd server && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add server/src/types.ts server/src/weather.ts server/tests/weather.test.ts
git commit -m "feat(weather): fetch + slice hourly (12) and daily (5) forecast"
```

---

### Task 2: Web — `WeatherIcon` inline-SVG component

**Files:**
- Create: `web/src/components/WeatherIcon.tsx`
- Modify: `web/src/types.ts` (mirror server `Weather` + add forecast types)
- Test: `web/src/components/WeatherIcon.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: `export function WeatherIcon({ icon, size }: { icon: string; size?: number }): JSX.Element` — renders an `<svg data-icon={resolvedSlug} aria-label={resolvedSlug}>`; unknown slug resolves to `cloudy`.

- [ ] **Step 1: Mirror the forecast types in the web app**

In `web/src/types.ts`, replace the existing `Weather` interface (lines 24-28) with:

```ts
export interface HourForecast {
  time: string;
  tempF: number;
  icon: string;
  precipPct: number;
}

export interface DayForecast {
  date: string;
  hiF: number;
  loF: number;
  icon: string;
  precipPct: number;
}

export interface Weather {
  tempF: number;
  condition: string;
  icon: string;
  hourly: HourForecast[];
  daily: DayForecast[];
}
```

- [ ] **Step 2: Write the failing test**

Create `web/src/components/WeatherIcon.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { WeatherIcon } from './WeatherIcon';

describe('WeatherIcon', () => {
  it('renders an svg with the slug as data-icon for each known slug', () => {
    for (const slug of ['clear', 'cloudy', 'rain', 'snow', 'fog', 'storm']) {
      const { container } = render(<WeatherIcon icon={slug} />);
      const svg = container.querySelector('svg');
      expect(svg).not.toBeNull();
      expect(svg?.getAttribute('data-icon')).toBe(slug);
    }
  });

  it('falls back to the cloudy icon for an unknown slug', () => {
    const { container } = render(<WeatherIcon icon="meteor-shower" />);
    expect(container.querySelector('svg')?.getAttribute('data-icon')).toBe('cloudy');
  });

  it('applies the size prop to width and height', () => {
    const { container } = render(<WeatherIcon icon="clear" size={32} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('32');
    expect(svg?.getAttribute('height')).toBe('32');
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd web && npx vitest run src/components/WeatherIcon.test.tsx`
Expected: FAIL — `./WeatherIcon` does not exist.

- [ ] **Step 4: Implement `WeatherIcon`**

Create `web/src/components/WeatherIcon.tsx`:

```tsx
import type { ReactNode } from 'react';

const CLOUD = 'M7 18h9a4 4 0 0 0 .5-7.97 6 6 0 0 0-11.5 1.5A3.5 3.5 0 0 0 7 18z';
const CLOUD_HI = 'M7 15h9a4 4 0 0 0 .5-7.97 6 6 0 0 0-11.5 1.5A3.5 3.5 0 0 0 7 15z';

const SHAPES: Record<string, ReactNode> = {
  clear: (
    <>
      <circle cx="12" cy="12" r="4" />
      <line x1="12" y1="2" x2="12" y2="4.5" />
      <line x1="12" y1="19.5" x2="12" y2="22" />
      <line x1="2" y1="12" x2="4.5" y2="12" />
      <line x1="19.5" y1="12" x2="22" y2="12" />
      <line x1="4.9" y1="4.9" x2="6.7" y2="6.7" />
      <line x1="17.3" y1="17.3" x2="19.1" y2="19.1" />
      <line x1="4.9" y1="19.1" x2="6.7" y2="17.3" />
      <line x1="17.3" y1="6.7" x2="19.1" y2="4.9" />
    </>
  ),
  cloudy: <path d={CLOUD} />,
  rain: (
    <>
      <path d={CLOUD_HI} />
      <line x1="8" y1="18" x2="8" y2="21" />
      <line x1="12" y1="18" x2="12" y2="21" />
      <line x1="16" y1="18" x2="16" y2="21" />
    </>
  ),
  snow: (
    <>
      <path d={CLOUD_HI} />
      <line x1="8" y1="19" x2="8" y2="19" />
      <line x1="12" y1="20" x2="12" y2="20" />
      <line x1="16" y1="19" x2="16" y2="19" />
    </>
  ),
  fog: (
    <>
      <line x1="3" y1="8" x2="21" y2="8" />
      <line x1="5" y1="12" x2="19" y2="12" />
      <line x1="3" y1="16" x2="17" y2="16" />
      <line x1="19" y1="16" x2="21" y2="16" />
    </>
  ),
  storm: (
    <>
      <path d={CLOUD_HI} />
      <polyline points="13 17 10 21 12.5 21 10.5 24" />
    </>
  ),
};

export function WeatherIcon({ icon, size = 24 }: { icon: string; size?: number }) {
  const slug = SHAPES[icon] ? icon : 'cloudy';
  return (
    <svg
      className="wx-icon"
      data-icon={slug}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label={slug}
    >
      {SHAPES[slug]}
    </svg>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd web && npx vitest run src/components/WeatherIcon.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/src/types.ts web/src/components/WeatherIcon.tsx web/src/components/WeatherIcon.test.tsx
git commit -m "feat(web): inline-SVG WeatherIcon + mirror forecast types"
```

---

### Task 3: Web — `Weather` component (collapsed + expandable forecast) wired into the header

**Files:**
- Create: `web/src/components/Weather.tsx`
- Modify: `web/src/components/Header.tsx` (use `Weather` instead of the inline text)
- Modify: `web/src/styles.css` (append weather/forecast styles)
- Test: `web/src/components/Weather.test.tsx`

**Interfaces:**
- Consumes: `WeatherIcon` (Task 2); `Weather`, `HourForecast`, `DayForecast` types (Task 2).
- Produces: `export function Weather({ weather }: { weather: WeatherModel }): JSX.Element` — collapsed button toggles a `.forecast` panel.

- [ ] **Step 1: Write the failing test**

Create `web/src/components/Weather.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { Weather } from './Weather';
import type { Weather as WeatherModel } from '../types';

const W: WeatherModel = {
  tempF: 72,
  condition: 'Clear',
  icon: 'clear',
  hourly: [
    { time: '2026-06-21T15:00', tempF: 72, icon: 'clear', precipPct: 0 },
    { time: '2026-06-21T16:00', tempF: 73, icon: 'rain', precipPct: 40 },
  ],
  daily: [
    { date: '2026-06-21', hiF: 80, loF: 61, icon: 'clear', precipPct: 0 },
    { date: '2026-06-22', hiF: 78, loF: 60, icon: 'rain', precipPct: 20 },
    { date: '2026-06-23', hiF: 75, loF: 59, icon: 'rain', precipPct: 80 },
  ],
};

describe('Weather', () => {
  it('shows the current temp and condition collapsed by default', () => {
    render(<Weather weather={W} />);
    expect(screen.getByText(/72°/)).toBeInTheDocument();
    expect(screen.getByText('Clear')).toBeInTheDocument();
    expect(screen.queryByTestId('forecast')).toBeNull();
  });

  it('toggles the forecast panel and renders the hourly + daily counts', () => {
    render(<Weather weather={W} />);
    const btn = screen.getByRole('button', { name: /forecast/i });
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(btn);
    expect(btn).toHaveAttribute('aria-expanded', 'true');
    const panel = screen.getByTestId('forecast');
    expect(within(panel).getAllByTestId('fc-hour')).toHaveLength(2);
    expect(within(panel).getAllByTestId('fc-day')).toHaveLength(3);
    fireEvent.click(btn);
    expect(screen.queryByTestId('forecast')).toBeNull();
  });

  it('does not expand when there is no forecast data', () => {
    render(<Weather weather={{ ...W, hourly: [], daily: [] }} />);
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(screen.queryByTestId('forecast')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd web && npx vitest run src/components/Weather.test.tsx`
Expected: FAIL — `./Weather` does not exist.

- [ ] **Step 3: Implement the `Weather` component**

Create `web/src/components/Weather.tsx`:

```tsx
import { useState } from 'react';
import type { Weather as WeatherModel } from '../types';
import { WeatherIcon } from './WeatherIcon';

function hourLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric' });
}

function dayLabel(iso: string): string {
  return new Date(`${iso}T00:00`).toLocaleDateString([], { weekday: 'short' });
}

export function Weather({ weather }: { weather: WeatherModel }) {
  const [open, setOpen] = useState(false);
  const hasForecast = weather.hourly.length > 0 || weather.daily.length > 0;

  return (
    <div className="weather">
      <button
        type="button"
        className="weather-current"
        aria-expanded={open}
        disabled={!hasForecast}
        title={hasForecast ? 'Show forecast' : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        <WeatherIcon icon={weather.icon} size={18} />
        <span className="weather-temp">{weather.tempF}°</span>
        <span className="weather-cond">{weather.condition}</span>
        {hasForecast && <span className="weather-caret">{open ? '▴' : '▾'}</span>}
      </button>

      {open && hasForecast && (
        <div className="forecast" data-testid="forecast">
          {weather.hourly.length > 0 && (
            <div className="forecast-hourly">
              {weather.hourly.map((h) => (
                <div className="fc-hour" data-testid="fc-hour" key={h.time}>
                  <div className="fc-label">{hourLabel(h.time)}</div>
                  <WeatherIcon icon={h.icon} size={18} />
                  <div className="fc-temp">{h.tempF}°</div>
                  <div className="fc-precip">{h.precipPct > 0 ? `${h.precipPct}%` : ''}</div>
                </div>
              ))}
            </div>
          )}
          {weather.daily.length > 0 && (
            <div className="forecast-daily">
              {weather.daily.map((d) => (
                <div className="fc-day" data-testid="fc-day" key={d.date}>
                  <div className="fc-label">{dayLabel(d.date)}</div>
                  <WeatherIcon icon={d.icon} size={18} />
                  <div className="fc-hilo">
                    <span className="fc-hi">{d.hiF}°</span> <span className="fc-lo">{d.loF}°</span>
                  </div>
                  <div className="fc-precip">{d.precipPct > 0 ? `${d.precipPct}%` : ''}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd web && npx vitest run src/components/Weather.test.tsx`
Expected: PASS.

- [ ] **Step 5: Wire the `Weather` component into the header**

In `web/src/components/Header.tsx`:

Add an import after the `Clock` import (line 2):

```tsx
import { Weather } from './Weather';
```

Replace the weather line (line 42):

```tsx
        {weather && <div className="weather">{weather.tempF}°F · {weather.condition}</div>}
```

with:

```tsx
        {weather && <Weather weather={weather} />}
```

- [ ] **Step 6: Append the styles**

Append to the end of `web/src/styles.css`:

```css
/* Weather + forecast */
.weather { position: relative; }
.weather-current {
  display: inline-flex; align-items: center; gap: 6px;
  background: none; border: none; padding: 0; margin: 0;
  color: var(--dim); font: inherit; font-size: 15px; cursor: pointer;
}
.weather-current:disabled { cursor: default; }
.weather-temp { color: var(--text); font-weight: 600; }
.weather-caret { font-size: 11px; color: var(--muted); }
.wx-icon { display: block; }

.forecast {
  position: absolute; right: 0; top: calc(100% + 8px); z-index: 30;
  background: var(--panel); border: 1px solid var(--divider); border-radius: 10px;
  padding: 12px; text-align: center; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.55);
  max-width: min(92vw, 460px);
}
.forecast-hourly { display: flex; gap: 12px; overflow-x: auto; padding-bottom: 6px; }
.fc-hour {
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  min-width: 40px; font-size: 12px; color: var(--dim);
}
.fc-temp { color: var(--text); font-weight: 600; }
.forecast-daily {
  display: flex; flex-direction: column; gap: 8px; margin-top: 10px;
  border-top: 1px solid var(--divider); padding-top: 10px;
}
.fc-day {
  display: grid; grid-template-columns: 42px 22px 1fr auto;
  align-items: center; gap: 12px; font-size: 13px; text-align: left;
}
.fc-label { color: var(--dim); }
.fc-hi { color: var(--text); font-weight: 600; }
.fc-lo { color: var(--muted); }
.fc-precip { color: #5bb8ff; font-size: 11px; min-height: 13px; }
```

- [ ] **Step 7: Run the full web test suite + typecheck + build**

Run: `cd web && npx vitest run && npx tsc --noEmit && npm run build`
Expected: all tests PASS, no type errors, build succeeds.

- [ ] **Step 8: Commit**

```bash
git add web/src/components/Weather.tsx web/src/components/Weather.test.tsx web/src/components/Header.tsx web/src/styles.css
git commit -m "feat(web): weather icon + click-to-expand hourly/daily forecast"
```

---

### Task 4: Docs

**Files:**
- Modify: `README.md` (Features bullet for weather; API JSON example)

**Interfaces:**
- Consumes: the shipped behavior from Tasks 1-3.
- Produces: nothing code-facing.

- [ ] **Step 1: Update the weather feature bullet**

In `README.md`, replace the line (line 22):

```markdown
- 🌤️ **Weather + clock** in a shared top bar.
```

with:

```markdown
- 🌤️ **Weather + clock** in a shared top bar — a condition icon with the current temp; click it for a **click-to-expand forecast** (next 12 hours + next 5 days, with precip chance).
```

- [ ] **Step 2: Update the API example to show the forecast arrays**

In `README.md`, replace the weather line in the JSON example (line 161):

```jsonc
  "weather": { "tempF": 79, "condition": "Overcast", "icon": "cloudy" },
```

with:

```jsonc
  "weather": {
    "tempF": 79, "condition": "Overcast", "icon": "cloudy",
    "hourly": [{ "time": "2026-06-21T15:00", "tempF": 79, "icon": "cloudy", "precipPct": 10 }],
    "daily":  [{ "date": "2026-06-21", "hiF": 82, "loF": 68, "icon": "cloudy", "precipPct": 20 }]
  },
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document weather icon + expandable forecast"
```

---

## Self-Review

**Spec coverage:**
- Draw a weather icon → Task 2 (`WeatherIcon`) + Task 3 (wired into header). ✓
- Click-to-expand forecast → Task 3 (`Weather` component, panel toggle). ✓
- Next 12 hours hourly → Task 1 `buildHourly` (cap 12, current hour onward). ✓
- Next 5 days daily → Task 1 `buildDaily` (cap 5, today onward). ✓
- Inline SVG, `currentColor`, e-ink friendly → Task 2. ✓
- Slug-based contract → CODES table maps codes to slugs; UI consumes slugs only. ✓
- Per-entry icon/temp/precip; daily hi/lo → types + builders + UI. ✓
- Rides on existing `BoardModel.weather`, no new endpoint/poll → Task 1 (only `weather.ts`/`types.ts` touched server-side). ✓
- Tests (server slicing + web icon/panel) → Tasks 1-3. ✓
- Docs → Task 4. ✓

**Placeholder scan:** No TBD/TODO; every code step has complete code; no "similar to" references. ✓

**Type consistency:** `HourForecast`/`DayForecast`/`Weather` identical in `server/src/types.ts` and `web/src/types.ts`. `buildHourly`/`buildDaily` signatures match their call sites and tests. `WeatherIcon` prop `{ icon, size }` matches all usages. `Weather` component prop `{ weather }` matches the Header wiring. The web `Weather` component name is aliased from the `Weather` type via `Weather as WeatherModel` to avoid the name clash. ✓
