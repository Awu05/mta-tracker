import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import App from '../src/App';

const board = {
  updatedAt: '', stale: false, displayMode: 'kiosk',
  weather: { tempF: 72, condition: 'Clear', icon: 'clear' },
  stations: [
    { station: { id: '127', name: 'Times Sq–42 St' }, updatedAt: '', stale: false,
      directions: [{ direction: 'N', label: 'Uptown', arrivals: [{ route: '1', color: '#ee352e', textColor: '#fff', destination: 'Van Cortlandt Park', minutes: 2 }] }],
      alerts: [] },
  ],
};

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => board }));
});

describe('App', () => {
  it('fetches the board on mount and renders it', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText('Times Sq–42 St')).toBeInTheDocument());
    expect(screen.getByText('Van Cortlandt Park')).toBeInTheDocument();
  });

  it('shows a loading state before data arrives', () => {
    render(<App />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });
});
