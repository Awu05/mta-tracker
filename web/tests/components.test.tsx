import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LineBullet } from '../src/components/LineBullet';
import { DirectionColumn } from '../src/components/DirectionColumn';
import { Alerts } from '../src/components/Alerts';
import { StationSection } from '../src/components/StationSection';
import { SortableStationSection } from '../src/components/SortableStationSection';
import { DndContext } from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';
import { ArrivalRow } from '../src/components/ArrivalRow';
import { Header } from '../src/components/Header';
import { EditPanel } from '../src/components/EditPanel';
import { WelcomeModal } from '../src/components/WelcomeModal';
import type { DirectionGroup, StationBoard, Weather } from '../src/types';

afterEach(() => {
  vi.unstubAllGlobals();
});

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

  it('Alerts start minimized: only severe alerts plus a muted summary', () => {
    render(
      <Alerts
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

  it('Alerts expand to show info alerts and collapse again', () => {
    render(
      <Alerts
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
    const onToggleEdit = vi.fn();
    const { rerender } = render(
      <Header weather={null} stale={false} compact={false} onToggleCompact={onToggleCompact} editMode={false} onToggleEdit={onToggleEdit} />
    );
    const toggleButton = screen.getByRole('button', { name: /compact/i });
    fireEvent.click(toggleButton);
    expect(onToggleCompact).toHaveBeenCalledTimes(1);

    rerender(<Header weather={null} stale={false} compact={true} onToggleCompact={onToggleCompact} editMode={false} onToggleEdit={onToggleEdit} />);
    expect(screen.getByRole('button', { name: /full/i })).toBeInTheDocument();
  });

  it('Header edit toggle button switches edit/done labels and fires the callback', () => {
    const onToggleCompact = vi.fn();
    const onToggleEdit = vi.fn();
    const { rerender } = render(
      <Header weather={null} stale={false} compact={false} onToggleCompact={onToggleCompact} editMode={false} onToggleEdit={onToggleEdit} />
    );
    const editButton = screen.getByRole('button', { name: /edit/i });
    fireEvent.click(editButton);
    expect(onToggleEdit).toHaveBeenCalledTimes(1);

    rerender(<Header weather={null} stale={false} compact={false} onToggleCompact={onToggleCompact} editMode={true} onToggleEdit={onToggleEdit} />);
    expect(screen.getByRole('button', { name: /done/i })).toBeInTheDocument();
  });

  it('StationSection renders the station name, direction, destination, and minutes', () => {
    render(
      <StationSection
        compact={false}
        board={{
          station: { id: '127', name: 'Times Sq–42 St' },
          type: 'subway',
          updatedAt: '',
          stale: false,
          directions: [
            { direction: 'N', label: 'Uptown', arrivals: [{ route: '1', color: '#ee352e', textColor: '#fff', destination: 'Van Cortlandt Park', minutes: 2 }] },
          ],
          arrivals: [],
          alerts: [],
        }}
      />
    );
    expect(screen.getByText('Times Sq–42 St')).toBeInTheDocument();
    expect(screen.getByText('Uptown')).toBeInTheDocument();
    expect(screen.getByText('Van Cortlandt Park')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('StationSection renders a bus stop as a single list with no direction labels', () => {
    render(
      <StationSection
        compact={false}
        board={{
          station: { id: '401687', name: '1 AV/E 14 ST' },
          type: 'bus',
          updatedAt: '',
          stale: false,
          directions: [],
          arrivals: [
            { route: 'M15', color: '#1E5BA8', textColor: '#fff', destination: 'SOUTH FERRY', minutes: 11 },
            { route: 'M15+', color: '#00467F', textColor: '#fff', destination: 'EAST HARLEM', minutes: null, note: '2 stops away' },
          ],
          alerts: [],
        }}
      />
    );
    expect(screen.getByText('1 AV/E 14 ST')).toBeInTheDocument();
    expect(screen.getByText('SOUTH FERRY')).toBeInTheDocument();
    expect(screen.getByText('11')).toBeInTheDocument();
    expect(screen.getByText('2 stops away')).toBeInTheDocument();
    expect(screen.queryByText(/uptown/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/downtown/i)).not.toBeInTheDocument();
  });

  it('ArrivalRow renders a note instead of minutes when minutes is null', () => {
    render(
      <ArrivalRow
        arrival={{ route: 'M15', color: '#1E5BA8', textColor: '#fff', destination: 'SOUTH FERRY', minutes: null, note: 'approaching' }}
      />
    );
    expect(screen.getByText('approaching')).toBeInTheDocument();
    expect(screen.queryByText(/min/)).not.toBeInTheDocument();
  });

  it('StationSection in edit mode renders a remove button that calls onRemove with the entry', () => {
    const onRemove = vi.fn();
    render(
      <StationSection
        compact={false}
        editMode
        onRemove={onRemove}
        board={{
          station: { id: '127', name: 'Times Sq–42 St' },
          type: 'subway',
          updatedAt: '',
          stale: false,
          directions: [
            { direction: 'N', label: 'Uptown', arrivals: [{ route: '1', color: '#ee352e', textColor: '#fff', destination: 'Van Cortlandt Park', minutes: 2 }] },
          ],
          arrivals: [],
          alerts: [],
        }}
      />
    );
    const removeButton = screen.getByRole('button', { name: /remove/i });
    fireEvent.click(removeButton);
    expect(onRemove).toHaveBeenCalledWith({ id: '127', type: 'subway' });
  });

  it('StationSection without edit mode does not render a remove button', () => {
    render(
      <StationSection
        compact={false}
        board={{
          station: { id: '127', name: 'Times Sq–42 St' },
          type: 'subway',
          updatedAt: '',
          stale: false,
          directions: [
            { direction: 'N', label: 'Uptown', arrivals: [{ route: '1', color: '#ee352e', textColor: '#fff', destination: 'Van Cortlandt Park', minutes: 2 }] },
          ],
          arrivals: [],
          alerts: [],
        }}
      />
    );
    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument();
  });

  it('SortableStationSection renders a drag handle plus the wrapped StationSection content', () => {
    render(
      <DndContext>
        <SortableContext items={['subway:127']}>
          <SortableStationSection
            id="subway:127"
            compact={false}
            editMode
            onRemove={vi.fn()}
            board={{
              station: { id: '127', name: 'Times Sq–42 St' },
              type: 'subway',
              updatedAt: '',
              stale: false,
              directions: [],
              arrivals: [],
              alerts: [],
            }}
          />
        </SortableContext>
      </DndContext>
    );
    expect(screen.getByLabelText(/drag to reorder Times Sq–42 St/i)).toBeInTheDocument();
    expect(screen.getByText('Times Sq–42 St')).toBeInTheDocument();
  });

  it('EditPanel searches, lists results, and adds a station then shows nearby buses', async () => {
    const onChanged = vi.fn();
    const searchResults = [{ id: '635', name: '14 St-Union Sq', routes: ['4', '5', '6'] }];
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (typeof url === 'string' && url.startsWith('/api/stations/search')) {
        return Promise.resolve({ ok: true, json: async () => searchResults });
      }
      if (typeof url === 'string' && url.startsWith('/api/nearby-buses')) {
        return Promise.resolve({ ok: true, json: async () => [] });
      }
      if (typeof url === 'string' && url.startsWith('/api/boards/c1/stations') && init?.method === 'POST') {
        return Promise.resolve({ ok: true, status: 201, json: async () => ({ ok: true, entries: [] }) });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<EditPanel code="c1" onChanged={onChanged} />);

    const input = screen.getByPlaceholderText(/search/i);
    fireEvent.change(input, { target: { value: 'union' } });

    await waitFor(() => expect(screen.getByText('14 St-Union Sq')).toBeInTheDocument());

    fireEvent.click(screen.getByText('14 St-Union Sq'));

    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    const postCall = fetchMock.mock.calls.find(
      ([url, init]) => typeof url === 'string' && url.startsWith('/api/boards/c1/stations') && init?.method === 'POST'
    );
    expect(postCall).toBeTruthy();
    const body = JSON.parse((postCall![1] as RequestInit).body as string);
    expect(body).toEqual({ id: '635', type: 'subway' });
  });

  it('EditPanel sets weather from a geocode search result', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.startsWith('/api/geocode')) {
        return Promise.resolve({ ok: true, json: async () => ([{ name: 'Brooklyn', admin1: 'NY', country: 'US', lat: 40.68, lon: -73.94 }]) });
      }
      if (url.includes('/weather') && init?.method === 'PUT') {
        return Promise.resolve({ ok: true, json: async () => ({}) });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<EditPanel code="c1" onChanged={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/city or zip/i), { target: { value: 'brooklyn' } });
    await waitFor(() => expect(screen.getByText(/Brooklyn/)).toBeInTheDocument());
    fireEvent.click(screen.getByText(/Brooklyn/));

    await waitFor(() => {
      const put = fetchMock.mock.calls.find(([u, i]) => typeof u === 'string' && u.includes('/weather') && i?.method === 'PUT');
      expect(put).toBeTruthy();
      expect(JSON.parse((put![1] as RequestInit).body as string)).toEqual({ lat: 40.68, lon: -73.94 });
    });
  });

  it('WelcomeModal lists the stations and weather already added', () => {
    const stations: StationBoard[] = [
      { station: { id: '127', name: 'Times Sq–42 St' }, type: 'subway', updatedAt: '', stale: false, directions: [], arrivals: [], alerts: [] },
      { station: { id: 'MTA_404123', name: 'Bus Stop 404123' }, type: 'bus', updatedAt: '', stale: false, directions: [], arrivals: [], alerts: [] },
    ];
    const weather: Weather = { tempF: 71.6, condition: 'Cloudy', icon: 'cloudy', hourly: [], daily: [] };
    render(<WelcomeModal code="c1" stations={stations} weather={weather} onChanged={() => {}} onClose={() => {}} />);

    // Added items show up in the running "On your board" summary.
    expect(screen.getByText('On your board')).toBeInTheDocument();
    expect(screen.getByText('Times Sq–42 St')).toBeInTheDocument();
    expect(screen.getByText('Bus Stop 404123')).toBeInTheDocument();
    expect(screen.getByText('72° Cloudy')).toBeInTheDocument(); // rounded
    // Once something's added, the dismiss button reads "Done".
    expect(screen.getByRole('button', { name: /done/i })).toBeInTheDocument();
  });

  it('WelcomeModal shows a placeholder summary when nothing has been added yet', () => {
    render(<WelcomeModal code="c1" stations={[]} weather={null} onChanged={() => {}} onClose={() => {}} />);
    expect(screen.getByText('On your board')).toBeInTheDocument();
    expect(screen.getByText(/nothing yet/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /skip for now/i })).toBeInTheDocument();
  });

  it('WelcomeModal disables its big Done button while the nearby-bus checklist is open', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.startsWith('/api/stations/search')) {
        return Promise.resolve({ ok: true, json: async () => [{ id: '127', name: 'Times Sq', routes: ['1'] }] });
      }
      if (url.includes('/stations') && init?.method === 'POST') {
        return Promise.resolve({ ok: true, status: 201, json: async () => ({}) });
      }
      if (url.startsWith('/api/nearby-buses')) {
        return Promise.resolve({ ok: true, json: async () => [{ code: 'B1', name: 'Bus stop 1', routes: ['B62'], distanceMeters: 80, alreadyAdded: false }] });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<WelcomeModal code="c1" stations={[]} weather={null} onChanged={() => {}} onClose={() => {}} />);
    expect(screen.getByRole('button', { name: /skip for now/i })).not.toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText(/search for a station/i), { target: { value: 'times' } });
    fireEvent.click(await screen.findByText('Times Sq'));
    await screen.findByText(/nearby bus stops/i);

    // The big modal button is disabled while picking buses; the in-list "Done" finishes.
    expect(screen.getByRole('button', { name: /skip for now/i })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /^done$/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /skip for now/i })).not.toBeDisabled());
  });

  it('Header shows the weather placeholder when weather is null and calls onToggleEdit on click', () => {
    const onToggleCompact = vi.fn();
    const onToggleEdit = vi.fn();
    render(
      <Header weather={null} stale={false} compact={false} onToggleCompact={onToggleCompact} editMode={false} onToggleEdit={onToggleEdit} />
    );
    const placeholder = screen.getByRole('button', { name: /weather/i });
    expect(placeholder).toBeInTheDocument();
    fireEvent.click(placeholder);
    expect(onToggleEdit).toHaveBeenCalledTimes(1);
  });

  it('Header shows the weather widget (no placeholder) when weather is present', () => {
    const onToggleCompact = vi.fn();
    const onToggleEdit = vi.fn();
    const weather: Weather = { tempF: 72, condition: 'Cloudy', icon: 'cloudy', hourly: [], daily: [] };
    render(
      <Header weather={weather} stale={false} compact={false} onToggleCompact={onToggleCompact} editMode={false} onToggleEdit={onToggleEdit} />
    );
    expect(screen.queryByRole('button', { name: /^＋ Weather$/i })).not.toBeInTheDocument();
    expect(screen.getByText('72°')).toBeInTheDocument();
  });
});
