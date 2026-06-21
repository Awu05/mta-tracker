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
