import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import App from '../src/App';

const board = {
  updatedAt: '', stale: false, displayMode: 'kiosk', compact: false,
  weather: { tempF: 72, condition: 'Clear', icon: 'clear', hourly: [], daily: [] },
  stations: [
    { station: { id: '127', name: 'Times Sq–42 St' }, type: 'subway', updatedAt: '', stale: false,
      directions: [{ direction: 'N', label: 'Uptown', arrivals: [{ route: '1', color: '#ee352e', textColor: '#fff', destination: 'Van Cortlandt Park', minutes: 2 }] }],
      arrivals: [],
      alerts: [] },
  ],
};

beforeEach(() => {
  window.history.replaceState({}, '', '/b/testcode');
  vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
    if (typeof url === 'string' && url.startsWith('/api/boards/')) {
      return Promise.resolve({ ok: true, json: async () => board });
    }
    return Promise.resolve({ ok: true, json: async () => [] });
  }));
});

afterEach(() => {
  window.history.replaceState({}, '', '/');
  localStorage.clear();
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

  it('applies compact mode from the server flag, hiding info alerts', async () => {
    const compactBoard = {
      ...board,
      compact: true,
      stations: [
        {
          ...board.stations[0],
          alerts: [
            { routes: ['2', '3'], severity: 'delay', text: 'Severe delays reported' },
            { routes: ['1'], severity: 'info', text: '1 skips 50 St' },
          ],
        },
      ],
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => compactBoard }));
    render(<App />);
    await waitFor(() => expect(screen.getByText(/Severe delays reported/)).toBeInTheDocument());
    expect(screen.queryByText(/1 skips 50 St/)).not.toBeInTheDocument();
    expect(document.querySelector('.app.compact')).toBeInTheDocument();
  });

  it('a saved compact preference overrides a non-compact server flag', async () => {
    localStorage.setItem('mta:compact', '1');
    render(<App />);
    await waitFor(() => expect(screen.getByText('Times Sq–42 St')).toBeInTheDocument());
    expect(document.querySelector('.app.compact')).toBeInTheDocument();
  });

  it('a saved full preference overrides a compact server flag', async () => {
    localStorage.setItem('mta:compact', '0');
    const compactBoard = { ...board, compact: true };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => compactBoard }));
    render(<App />);
    await waitFor(() => expect(screen.getByText('Times Sq–42 St')).toBeInTheDocument());
    expect(document.querySelector('.app.compact')).not.toBeInTheDocument();
  });

  it('toggle button flips compact state, remembers it, and leaves the URL clean', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText('Times Sq–42 St')).toBeInTheDocument());

    // Starts in full view: no compact class, button offers to switch to compact.
    expect(document.querySelector('.app.compact')).not.toBeInTheDocument();
    const toggleButton = screen.getByRole('button', { name: /compact/i });

    fireEvent.click(toggleButton);

    expect(document.querySelector('.app.compact')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /full/i })).toBeInTheDocument();
    // Remembered in the browser, with no ?compact junk added to the URL.
    expect(localStorage.getItem('mta:compact')).toBe('1');
    expect(window.location.search).toBe('');
  });

  it('Edit toggle reveals the search box for adding stations', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText('Times Sq–42 St')).toBeInTheDocument());

    const editButton = screen.getByRole('button', { name: /edit/i });
    fireEvent.click(editButton);

    expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument();
  });

  it('does not show the welcome popup when the board already has stations', async () => {
    render(<App />); // default fixture has a station
    await waitFor(() => expect(screen.getByText('Times Sq–42 St')).toBeInTheDocument());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows the welcome popup on an empty board with station and location inputs', async () => {
    const emptyBoard = { ...board, stations: [] };
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.startsWith('/api/boards/')) {
        return Promise.resolve({ ok: true, json: async () => emptyBoard });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    }));
    render(<App />);
    await waitFor(() =>
      expect(screen.getByRole('dialog', { name: /set up your board/i })).toBeInTheDocument(),
    );
    expect(screen.getByPlaceholderText(/search for a station/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/city or zip/i)).toBeInTheDocument();
  });

  it('dismisses the welcome popup via the skip button', async () => {
    const emptyBoard = { ...board, stations: [] };
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.startsWith('/api/boards/')) {
        return Promise.resolve({ ok: true, json: async () => emptyBoard });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    }));
    render(<App />);
    await screen.findByRole('dialog', { name: /set up your board/i });
    fireEvent.click(screen.getByRole('button', { name: /skip for now/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('shows the board-empty placeholder when the board has no stations', async () => {
    const emptyBoard = { ...board, stations: [] };
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.startsWith('/api/boards/')) {
        return Promise.resolve({ ok: true, json: async () => emptyBoard });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    }));
    render(<App />);
    // The welcome popup overlay also renders over the board, but the placeholder is in
    // the DOM behind it — query by text searches the whole DOM regardless of overlay.
    await waitFor(() => expect(screen.getByText(/your board is empty/i)).toBeInTheDocument());
  });
});
