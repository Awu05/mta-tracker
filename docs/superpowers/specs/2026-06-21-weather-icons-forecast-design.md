# Weather Icons + Expandable Forecast — Design

## Goal

Two additions to the existing weather feature:

1. **Draw a weather icon** for the current condition (today the server computes an
   `icon` slug but the UI only renders text).
2. **Show a detailed forecast** — the next 12 hours (hourly) and the next 5 days
   (daily) — surfaced via a click-to-expand panel so the glanceable board stays clean
   on kiosk / phone / e-ink.

## Decisions

- **Forecast UX:** click-to-expand. The top bar stays minimal (icon + temp +
  condition); clicking the weather opens a panel with hourly + daily. Mirrors the
  existing expandable-alerts / view-toggle patterns and keeps compact/e-ink clean.
- **Icon rendering:** inline SVG line icons using `currentColor`. Crisp at any size,
  theme-aware, identical across kiosk/phone/e-ink, no dependency, no network. Best for
  the e-ink target (clean monochrome-friendly strokes).
- **Forecast range:** next **12 hours** hourly + next **5 days** daily.
- **Contract stays slug-based:** the API exposes the six icon **slugs**
  (`clear`, `cloudy`, `rain`, `snow`, `fog`, `storm`), not raw WMO codes, so a future
  LED/e-ink renderer maps the same slugs the web app does (renderer-agnostic).

## Data (server)

Extend the Open-Meteo fetch in `server/src/weather.ts`:

- Add to the query string:
  - `hourly=temperature_2m,weather_code,precipitation_probability`
  - `daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max`
  - `timezone=auto` (so returned `time`/`date` strings are local and align with the
    `current.time` used for slicing)
- A **pure helper** slices the response:
  - **Hourly:** keep entries whose `time` is at/after `current.time`, take the next 12.
  - **Daily:** take the next 5 entries from the daily arrays.
  - Each entry maps its `weather_code` through the existing `CODES` table to
    `[condition, icon]` and rounds temperatures to whole °F.
- The current condition (top-bar temp/condition/icon) keeps using the `current` block
  exactly as today.

No new endpoint and no new poll loop — the arrays ride along on the existing
`BoardModel.weather`, which already refreshes every ~10 minutes.

### Type changes (`server/src/types.ts` and mirrored in `web/src/types.ts`)

```ts
interface HourForecast { time: string; tempF: number; icon: string; precipPct: number }
interface DayForecast  { date: string; hiF: number; loF: number; icon: string; precipPct: number }

interface Weather {
  tempF: number;
  condition: string;
  icon: string;
  hourly: HourForecast[];   // up to 12, soonest first
  daily: DayForecast[];     // up to 5, soonest first
}
```

`time` is the Open-Meteo ISO-local hour string; `date` is the ISO date string. The web
formats them for display (hour label, weekday) at render time.

## Icons (web)

New `WeatherIcon` component: an `<svg>` switch over the six slugs, drawn with
`stroke="currentColor"` (and `fill="none"` for line style), sized via a `size` prop.
Unknown slug falls back to the cloud icon. No color baked in, so it inherits the theme
and reads well on dark and e-ink.

## Top bar + expandable panel (web)

Replace the plain `{weather.tempF}°F · {weather.condition}` in `Header.tsx` with a new
`Weather` component:

- **Collapsed (default):** `[icon] 79° Overcast` rendered as a button with
  `aria-expanded`; roughly the same footprint as today.
- **Expanded:** a panel drops down with two parts:
  - **Hourly strip** — up to 12 cells, each: hour label (e.g. `3 PM`), small icon,
    temp, and precip% when `precipPct > 0`.
  - **Daily list** — up to 5 rows, each: weekday (e.g. `Mon`), icon, hi/lo, precip%.
- Local component state, mirroring the expandable-alerts pattern; closes on re-click.
- Same behavior in compact/e-ink — collapsed by default keeps it clean; tap for detail.

## Tests

- **Server** (`server/tests/weather.test.ts`): extend the fixture with hourly/daily
  arrays. Assert: next-12 hourly slice relative to `current.time`, next-5 daily slice,
  count caps, °F rounding, and code→icon/condition mapping. Keep the existing
  current-condition assertions.
- **Web:** `WeatherIcon` renders the expected `<svg>` per slug (and falls back for an
  unknown slug). `Weather` toggles the panel on click and renders the right number of
  hourly/daily entries with formatted labels.

## Out of scope (YAGNI)

Day/night icon variants, "feels like" / wind / humidity, hourly precip amounts (vs
probability). Each is an easy additive follow-up if wanted later.
