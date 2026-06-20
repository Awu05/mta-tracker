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
    const cache = new BoardCache([{ id: '127', name: 'Times Sq–42 St' }], 90);

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

    await pollArrivals(cache, [station], decode, fakeFetch, () => NOW);

    const board = cache.get(NOW).stations[0];
    expect(board.stale).toBe(false);
    expect(board.directions.find((d) => d.direction === 'N')!.arrivals[0].minutes).toBe(2);
  });

  it('isolates a failing feed and still updates from the others', async () => {
    const cache = new BoardCache([{ id: '127', name: 'Times Sq–42 St' }], 90);
    const tripEntities = [{
      tripUpdate: { trip: { routeId: 'N' }, stopTimeUpdate: [{ stopId: '127S', arrival: { time: 1_700_000_120 } }] },
    }];

    const fakeFetch = vi.fn()
      .mockRejectedValueOnce(new Error('feed down'))                       // 123456s fails
      .mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) }); // others ok

    const decode = vi.fn().mockReturnValue(decoded(tripEntities));

    await pollArrivals(cache, [station], decode, fakeFetch, () => NOW);

    const board = cache.get(NOW).stations[0];
    expect(board.stale).toBe(false); // still updated from surviving feeds
    expect(board.directions.find((d) => d.direction === 'S')!.arrivals.length).toBeGreaterThan(0);
  });

  it('keeps the last-good board when all trip feeds fail', async () => {
    const cache = new BoardCache([{ id: '127', name: 'Times Sq–42 St' }], 90);

    const fakeFetch = vi.fn().mockRejectedValue(new Error('all down')) as unknown as typeof fetch;
    const decode = vi.fn();

    await pollArrivals(cache, [station], decode, fakeFetch, () => NOW);

    const board = cache.get(NOW).stations[0];
    expect(board.stale).toBe(true); // never updated, so still stale
    expect(board.directions).toEqual([]);
  });

  it('fans out a single fetched feed set to populate multiple stations', async () => {
    const stationA = { id: '127', name: 'Times Sq–42 St', routes: ['1'] };
    const stationB = { id: '635', name: '14 St–Union Sq', routes: ['L'] };
    const cache = new BoardCache(
      [{ id: '127', name: 'Times Sq–42 St' }, { id: '635', name: '14 St–Union Sq' }],
      90,
    );

    // 123456s feed carries a trip stopping at 127N; l feed carries a trip stopping at 635S.
    const tripEntitiesA = [{
      tripUpdate: { trip: { routeId: '1' }, stopTimeUpdate: [{ stopId: '127N', arrival: { time: 1_700_000_120 } }] },
    }];
    const tripEntitiesB = [{
      tripUpdate: { trip: { routeId: 'L' }, stopTimeUpdate: [{ stopId: '635S', arrival: { time: 1_700_000_180 } }] },
    }];

    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(0),
    }) as unknown as typeof fetch;

    // Union of feeds for routes ['1'] and ['L'] = ['123456s', 'l'] (fetched once each).
    const decode = vi.fn()
      .mockReturnValueOnce(decoded(tripEntitiesA))  // 123456s feed
      .mockReturnValueOnce(decoded(tripEntitiesB)); // l feed

    await pollArrivals(cache, [stationA, stationB], decode, fakeFetch, () => NOW);

    expect(fakeFetch).toHaveBeenCalledTimes(2); // each underlying feed fetched only once

    const board = cache.get(NOW);
    expect(board.stations[0].directions.find((d) => d.direction === 'N')!.arrivals.length).toBeGreaterThan(0);
    expect(board.stations[1].directions.find((d) => d.direction === 'S')!.arrivals.length).toBeGreaterThan(0);
  });
});

describe('pollAlerts', () => {
  it('fetches the alerts feed, transforms, and updates the cache', async () => {
    const cache = new BoardCache([{ id: '127', name: 'Times Sq–42 St' }], 90);

    const alertEntities = [{
      alert: { effect: 'SIGNIFICANT_DELAYS', informedEntity: [{ routeId: '1' }], headerText: { translation: [{ text: 'Delays', language: 'en' }] } },
    }];

    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(0),
    }) as unknown as typeof fetch;

    const decode = vi.fn().mockReturnValue(decoded(alertEntities));

    await pollAlerts(cache, [station], decode, fakeFetch);

    const board = cache.get(1_700_000_000_000);
    expect(board.stations[0].alerts[0].text).toBe('Delays');
  });

  it('keeps last-good alerts when the alerts fetch fails', async () => {
    const cache = new BoardCache([{ id: '127', name: 'Times Sq–42 St' }], 90);

    const alertEntities = [{
      alert: { effect: 'SIGNIFICANT_DELAYS', informedEntity: [{ routeId: '1' }], headerText: { translation: [{ text: 'Delays', language: 'en' }] } },
    }];

    const okFetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(0),
    }) as unknown as typeof fetch;
    const decode = vi.fn().mockReturnValue(decoded(alertEntities));

    // Seed alerts with a first successful poll.
    await pollAlerts(cache, [station], decode, okFetch);
    expect(cache.get(1_700_000_000_000).stations[0].alerts[0].text).toBe('Delays');

    // Second poll: fetch rejects, alerts should remain unchanged.
    const failingFetch = vi.fn().mockRejectedValue(new Error('alerts down')) as unknown as typeof fetch;
    await pollAlerts(cache, [station], decode, failingFetch);

    const board = cache.get(1_700_000_000_000);
    expect(board.stations[0].alerts[0].text).toBe('Delays'); // unchanged, not cleared
  });
});
