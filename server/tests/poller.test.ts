import { describe, it, expect, vi } from 'vitest';
import { pollArrivals, pollAlerts } from '../src/feeds/poller';
import { BoardCache } from '../src/cache';

const station = { id: '127', name: 'Times Sq–42 St', routes: ['1', 'N'] };

function decoded(entities: unknown[]) {
  return { entity: entities };
}

describe('pollArrivals', () => {
  const NOW = 1_700_000_000_000;

  it('fetches station trip feeds, transforms, and updates the cache', async () => {
    const cache = new BoardCache({ id: '127', name: 'Times Sq–42 St' }, 90);

    const tripEntities = [{
      tripUpdate: { trip: { routeId: '1' }, stopTimeUpdate: [{ stopId: '127N', arrival: { time: 1_700_000_120 } }] },
    }];

    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(0),
    }) as unknown as typeof fetch;

    // decode returns trip entities for each trip feed (123456s, nqrw)
    const decode = vi.fn()
      .mockReturnValueOnce(decoded(tripEntities))   // 123456s feed
      .mockReturnValueOnce(decoded(tripEntities));  // nqrw feed

    await pollArrivals(cache, station, decode, fakeFetch, () => NOW);

    const board = cache.get(NOW);
    expect(board.stale).toBe(false);
    expect(board.directions.find((d) => d.direction === 'N')!.arrivals[0].minutes).toBe(2);
  });

  it('isolates a failing feed and still updates from the others', async () => {
    const cache = new BoardCache({ id: '127', name: 'Times Sq–42 St' }, 90);
    const tripEntities = [{
      tripUpdate: { trip: { routeId: 'N' }, stopTimeUpdate: [{ stopId: '127S', arrival: { time: 1_700_000_120 } }] },
    }];

    const fakeFetch = vi.fn()
      .mockRejectedValueOnce(new Error('feed down'))                       // 123456s fails
      .mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) }); // others ok

    const decode = vi.fn().mockReturnValue(decoded(tripEntities));

    await pollArrivals(cache, station, decode, fakeFetch, () => NOW);

    const board = cache.get(NOW);
    expect(board.stale).toBe(false); // still updated from surviving feeds
    expect(board.directions.find((d) => d.direction === 'S')!.arrivals.length).toBeGreaterThan(0);
  });

  it('keeps the last-good board when all trip feeds fail', async () => {
    const cache = new BoardCache({ id: '127', name: 'Times Sq–42 St' }, 90);

    const fakeFetch = vi.fn().mockRejectedValue(new Error('all down')) as unknown as typeof fetch;
    const decode = vi.fn();

    await pollArrivals(cache, station, decode, fakeFetch, () => NOW);

    const board = cache.get(NOW);
    expect(board.stale).toBe(true); // never updated, so still stale
    expect(board.directions).toEqual([]);
  });
});

describe('pollAlerts', () => {
  it('fetches the alerts feed, transforms, and updates the cache', async () => {
    const cache = new BoardCache({ id: '127', name: 'Times Sq–42 St' }, 90);

    const alertEntities = [{
      alert: { effect: 'SIGNIFICANT_DELAYS', informedEntity: [{ routeId: '1' }], headerText: { translation: [{ text: 'Delays', language: 'en' }] } },
    }];

    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(0),
    }) as unknown as typeof fetch;

    const decode = vi.fn().mockReturnValue(decoded(alertEntities));

    await pollAlerts(cache, station, decode, fakeFetch);

    const board = cache.get(1_700_000_000_000);
    expect(board.alerts[0].text).toBe('Delays');
  });

  it('keeps last-good alerts when the alerts fetch fails', async () => {
    const cache = new BoardCache({ id: '127', name: 'Times Sq–42 St' }, 90);

    const alertEntities = [{
      alert: { effect: 'SIGNIFICANT_DELAYS', informedEntity: [{ routeId: '1' }], headerText: { translation: [{ text: 'Delays', language: 'en' }] } },
    }];

    const okFetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(0),
    }) as unknown as typeof fetch;
    const decode = vi.fn().mockReturnValue(decoded(alertEntities));

    // Seed alerts with a first successful poll.
    await pollAlerts(cache, station, decode, okFetch);
    expect(cache.get(1_700_000_000_000).alerts[0].text).toBe('Delays');

    // Second poll: fetch rejects, alerts should remain unchanged.
    const failingFetch = vi.fn().mockRejectedValue(new Error('alerts down')) as unknown as typeof fetch;
    await pollAlerts(cache, station, decode, failingFetch);

    const board = cache.get(1_700_000_000_000);
    expect(board.alerts[0].text).toBe('Delays'); // unchanged, not cleared
  });
});
