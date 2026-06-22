import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Weather } from './Weather';
import type { Weather as WeatherModel } from '../types';

const NO_FORECAST: WeatherModel = { tempF: 72, condition: 'Clear', icon: 'clear', hourly: [], daily: [] };
const WITH_FORECAST: WeatherModel = {
  ...NO_FORECAST,
  hourly: [{ time: '2026-06-21T15:00', tempF: 72, icon: 'clear', precipPct: 0 }],
};

describe('Weather', () => {
  it('shows the current temp and condition', () => {
    const { container } = render(
      <Weather weather={NO_FORECAST} forecastOpen onToggle={() => {}} />
    );
    expect(screen.getByText('Clear')).toBeInTheDocument();
    expect(container.querySelector('.weather-current')?.textContent).toContain('72°');
  });

  it('is a plain (non-button) display when there is no forecast', () => {
    render(<Weather weather={NO_FORECAST} forecastOpen onToggle={() => {}} />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('toggles the forecast when clicked (when forecast data exists)', () => {
    const onToggle = vi.fn();
    render(<Weather weather={WITH_FORECAST} forecastOpen onToggle={onToggle} />);
    const btn = screen.getByRole('button', { name: /forecast/i });
    expect(btn).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(btn);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
