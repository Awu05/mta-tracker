import { describe, it, expect, vi } from 'vitest';
import { pollOnce } from '../src/feeds/poller';
import { BoardCache } from '../src/cache';

const station = { id: '127', name: 'Times Sq–42 St', routes: ['1', 'N'] };

function decoded(entities: unknown[]) {
  return { entity: entities };
}

describe('pollOnce', () => {
  const NOW = 1_700_000_000_000;

  it('fetches station feeds + alerts, transforms, and updates the cache', async () => {
    const cache = new BoardCache({ id: '127', name: 'Times Sq–42 St' }, 90);

    const tripEntities = [{
      tripUpdate: { trip: { routeId: '1' }, stopTimeUpdate: [{ stopId: '127N', arrival: { time: 1_700_000_120 } }] },
    }];
    const alertEntities = [{
      alert: { effect: 'SIGNIFICANT_DELAYS', informedEntity: [{ routeId: '1' }], headerText: { translation: [{ text: 'Delays', language: 'en' }] } },
    }];

    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(0),
    }) as unknown as typeof fetch;

    // decode returns trip entities for trip feeds, alert entities for the alerts feed
    const decode = vi.fn()
      .mockReturnValueOnce(decoded(tripEntities))   // 123456s feed
      .mockReturnValueOnce(decoded(tripEntities))   // nqrw feed
      .mockReturnValueOnce(decoded(alertEntities)); // alerts feed

    await pollOnce(cache, station, decode, fakeFetch, () => NOW);

    const board = cache.get(NOW);
    expect(board.stale).toBe(false);
    expect(board.directions.find((d) => d.direction === 'N')!.arrivals[0].minutes).toBe(2);
    expect(board.alerts[0].text).toBe('Delays');
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

    await pollOnce(cache, station, decode, fakeFetch, () => NOW);

    const board = cache.get(NOW);
    expect(board.stale).toBe(false); // still updated from surviving feeds
    expect(board.directions.find((d) => d.direction === 'S')!.arrivals.length).toBeGreaterThan(0);
  });
});
