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
  const hourly = weather.hourly ?? [];
  const daily = weather.daily ?? [];
  const hasForecast = hourly.length > 0 || daily.length > 0;

  return (
    <div className="weather">
      <button
        type="button"
        className="weather-current"
        aria-expanded={open}
        aria-label={hasForecast ? 'Show forecast' : 'Weather'}
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
          {hourly.length > 0 && (
            <div className="forecast-hourly">
              {hourly.map((h) => (
                <div className="fc-hour" data-testid="fc-hour" key={h.time}>
                  <div className="fc-label">{hourLabel(h.time)}</div>
                  <WeatherIcon icon={h.icon} size={18} />
                  <div className="fc-temp">{h.tempF}°</div>
                  <div className="fc-precip">{h.precipPct > 0 ? `${h.precipPct}%` : ''}</div>
                </div>
              ))}
            </div>
          )}
          {daily.length > 0 && (
            <div className="forecast-daily">
              {daily.map((d) => (
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
