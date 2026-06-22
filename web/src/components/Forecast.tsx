import type { Weather as WeatherModel } from '../types';
import { WeatherIcon } from './WeatherIcon';

function hourLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric' });
}

function dayLabel(iso: string): string {
  return new Date(`${iso}T00:00`).toLocaleDateString([], { weekday: 'short' });
}

export function Forecast({ weather, open }: { weather: WeatherModel; open: boolean }) {
  const { hourly, daily } = weather;
  if (!open || (hourly.length === 0 && daily.length === 0)) return null;

  return (
    <div className="forecast" data-testid="forecast">
      {hourly.length > 0 && (
        <>
          <div className="dir-label">Next 12 hours</div>
          <div className="forecast-hourly">
            {hourly.map((h) => (
              <div className="fc-hour" data-testid="fc-hour" key={h.time}>
                <div className="fc-label">{hourLabel(h.time)}</div>
                <WeatherIcon icon={h.icon} size={16} />
                <div className="fc-temp">{h.tempF}°</div>
                <div className="fc-precip">{h.precipPct > 0 ? `${h.precipPct}%` : ''}</div>
              </div>
            ))}
          </div>
        </>
      )}
      {daily.length > 0 && (
        <>
          <div className="dir-label">Next 5 days</div>
          <div className="forecast-daily">
            {daily.map((d) => (
              <div className="fc-day" data-testid="fc-day" key={d.date}>
                <span className="fc-dayname">{dayLabel(d.date)}</span>
                <WeatherIcon icon={d.icon} size={18} />
                <span className="fc-hilo">
                  <span className="fc-hi">{d.hiF}°</span> <span className="fc-lo">{d.loF}°</span>
                </span>
                <span className="fc-precip">{d.precipPct > 0 ? `${d.precipPct}%` : ''}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
