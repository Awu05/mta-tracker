import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LineBullet } from '../src/components/LineBullet';
import { DirectionColumn } from '../src/components/DirectionColumn';
import { Alerts } from '../src/components/Alerts';
import type { DirectionGroup } from '../src/types';

describe('components', () => {
  it('LineBullet renders the route with its colors', () => {
    render(<LineBullet route="1" color="#ee352e" textColor="#fff" />);
    const el = screen.getByText('1');
    expect(el).toBeInTheDocument();
    expect(el).toHaveStyle({ backgroundColor: '#ee352e' });
  });

  it('DirectionColumn lists arrivals with minutes and destination', () => {
    const group: DirectionGroup = {
      direction: 'N', label: 'Uptown',
      arrivals: [{ route: '1', color: '#ee352e', textColor: '#fff', destination: 'Van Cortlandt Park', minutes: 2 }],
    };
    render(<DirectionColumn group={group} />);
    expect(screen.getByText('Uptown')).toBeInTheDocument();
    expect(screen.getByText('Van Cortlandt Park')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('DirectionColumn shows an empty state when no arrivals', () => {
    render(<DirectionColumn group={{ direction: 'S', label: 'Downtown', arrivals: [] }} />);
    expect(screen.getByText(/no trains/i)).toBeInTheDocument();
  });

  it('Alerts renders nothing when empty and a band when present', () => {
    const { container, rerender } = render(<Alerts alerts={[]} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<Alerts alerts={[{ routes: ['N', 'Q'], severity: 'delay', text: 'Delays near 57 St' }]} />);
    expect(screen.getByText(/Delays near 57 St/)).toBeInTheDocument();
  });
});
