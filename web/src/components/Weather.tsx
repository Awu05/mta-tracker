import type { Weather as WeatherModel } from '../types';
import { WeatherIcon } from './WeatherIcon';

export function Weather({
  weather,
  forecastOpen,
  onToggle,
}: {
  weather: WeatherModel;
  forecastOpen: boolean;
  onToggle: () => void;
}) {
  const hasForecast = weather.hourly.length > 0 || weather.daily.length > 0;

  const content = (
    <>
      <WeatherIcon icon={weather.icon} size={18} />
      <span className="weather-temp">{weather.tempF}°</span>
      <span className="weather-cond">{weather.condition}</span>
      {hasForecast && <span className="weather-caret">{forecastOpen ? '▴' : '▾'}</span>}
    </>
  );

  return (
    <div className="weather">
      {hasForecast ? (
        <button
          type="button"
          className="weather-current weather-toggle"
          aria-expanded={forecastOpen}
          aria-label={forecastOpen ? 'Hide forecast' : 'Show forecast'}
          onClick={onToggle}
        >
          {content}
        </button>
      ) : (
        <div className="weather-current">{content}</div>
      )}
    </div>
  );
}
