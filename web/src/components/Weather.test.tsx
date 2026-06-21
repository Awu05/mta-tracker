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
