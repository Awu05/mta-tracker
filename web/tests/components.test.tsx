import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LineBullet } from '../src/components/LineBullet';
import { DirectionColumn } from '../src/components/DirectionColumn';
import { Alerts } from '../src/components/Alerts';
import { StationSection } from '../src/components/StationSection';
import { Header } from '../src/components/Header';
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

  it('DirectionColumn caps arrivals at 3 in compact mode', () => {
    const group: DirectionGroup = {
      direction: 'N', label: 'Uptown',
      arrivals: [1, 2, 3, 4, 5].map((n) => ({
        route: '1', color: '#ee352e', textColor: '#fff', destination: `Stop ${n}`, minutes: n,
      })),
    };
    const { container } = render(<DirectionColumn group={group} compact />);
    expect(container.querySelectorAll('.arr')).toHaveLength(3);
    expect(screen.queryByText('Stop 4')).not.toBeInTheDocument();
  });

  it('Alerts renders nothing when empty and a band when present', () => {
    const { container, rerender } = render(<Alerts alerts={[]} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<Alerts alerts={[{ routes: ['N', 'Q'], severity: 'delay', text: 'Delays near 57 St' }]} />);
    expect(screen.getByText(/Delays near 57 St/)).toBeInTheDocument();
  });

  it('Alerts in compact mode shows only severe alerts plus a muted summary', () => {
    render(
      <Alerts
        compact
        alerts={[
          { routes: ['2', '3'], severity: 'delay', text: 'Severe delays' },
          { routes: ['1'], severity: 'suspended', text: 'No 1 service' },
          { routes: ['1'], severity: 'info', text: '1 skips 50 St' },
        ]}
      />
    );
    expect(screen.getByText(/Severe delays/)).toBeInTheDocument();
    expect(screen.queryByText(/1 skips 50 St/)).not.toBeInTheDocument();
    expect(screen.getByText(/1 info/)).toBeInTheDocument();
  });

  it('Alerts in compact mode expands to show info alerts and collapses again', () => {
    render(
      <Alerts
        compact
        alerts={[
          { routes: ['2'], severity: 'delay', text: 'Severe delays' },
          { routes: ['1'], severity: 'info', text: '1 skips 50 St' },
        ]}
      />
    );
    expect(screen.getByText(/Severe delays/)).toBeInTheDocument();
    expect(screen.queryByText(/1 skips 50 St/)).not.toBeInTheDocument();
    const summaryButton = screen.getByRole('button', { name: /info/ });
    expect(summaryButton).toBeInTheDocument();

    fireEvent.click(summaryButton);
    expect(screen.getByText(/1 skips 50 St/)).toBeInTheDocument();

    const collapseButton = screen.getByRole('button', { name: /show less/i });
    fireEvent.click(collapseButton);
    expect(screen.queryByText(/1 skips 50 St/)).not.toBeInTheDocument();
  });

  it('Header toggle button switches compact/full labels and fires the callback', () => {
    const onToggleCompact = vi.fn();
    const { rerender } = render(
      <Header weather={null} stale={false} compact={false} onToggleCompact={onToggleCompact} />
    );
    const toggleButton = screen.getByRole('button', { name: /compact/i });
    fireEvent.click(toggleButton);
    expect(onToggleCompact).toHaveBeenCalledTimes(1);

    rerender(<Header weather={null} stale={false} compact={true} onToggleCompact={onToggleCompact} />);
    expect(screen.getByRole('button', { name: /full/i })).toBeInTheDocument();
  });

  it('StationSection renders the station name, direction, destination, and minutes', () => {
    render(
      <StationSection
        compact={false}
        board={{
          station: { id: '127', name: 'Times Sq–42 St' },
          updatedAt: '',
          stale: false,
          directions: [
            { direction: 'N', label: 'Uptown', arrivals: [{ route: '1', color: '#ee352e', textColor: '#fff', destination: 'Van Cortlandt Park', minutes: 2 }] },
          ],
          alerts: [],
        }}
      />
    );
    expect(screen.getByText('Times Sq–42 St')).toBeInTheDocument();
    expect(screen.getByText('Uptown')).toBeInTheDocument();
    expect(screen.getByText('Van Cortlandt Park')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });
});
