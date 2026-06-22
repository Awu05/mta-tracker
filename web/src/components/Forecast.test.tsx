import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { Forecast } from './Forecast';
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

describe('Forecast', () => {
  it('renders the hourly and daily entries when open', () => {
    render(<Forecast weather={W} open />);
    const panel = screen.getByTestId('forecast');
    expect(within(panel).getAllByTestId('fc-hour')).toHaveLength(2);
    expect(within(panel).getAllByTestId('fc-day')).toHaveLength(3);
  });

  it('renders nothing when collapsed', () => {
    const { container } = render(<Forecast weather={W} open={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when there is no forecast data', () => {
    const { container } = render(<Forecast weather={{ ...W, hourly: [], daily: [] }} open />);
    expect(container.firstChild).toBeNull();
  });
});
