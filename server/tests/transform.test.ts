import { describe, it, expect } from 'vitest';
import { transformArrivals } from '../src/feeds/transform';

// Minimal decoded-entity shape the transform consumes.
function tripUpdate(routeId: string, stops: Array<[string, number]>) {
  return {
    tripUpdate: {
      trip: { routeId },
      stopTimeUpdate: stops.map(([stopId, time]) => ({ stopId, arrival: { time } })),
    },
  };
}

const lookups = {
  stopName: (id: string) => (id.startsWith('127') ? 'Times Sq–42 St' : id.startsWith('142') ? 'South Ferry' : id),
  routeStyle: (r: string) => ({ color: r === '1' ? '#ee352e' : '#fccc0a', textColor: '#fff' }),
};

describe('transformArrivals', () => {
  const NOW = 1_700_000_000_000; // ms

  it('groups arrivals by direction and sorts soonest first', () => {
    const entities = [
      tripUpdate('1', [['127N', 1_700_000_120], ['101N', 1_700_000_600]]), // +2 min uptown
      tripUpdate('1', [['127S', 1_700_000_060], ['142S', 1_700_000_400]]), // +1 min downtown
      tripUpdate('1', [['127N', 1_700_000_420]]),                          // +7 min uptown
    ];
    const groups = transformArrivals(entities, '127', NOW, lookups);

    const uptown = groups.find((g) => g.direction === 'N')!;
    const downtown = groups.find((g) => g.direction === 'S')!;
    expect(uptown.label).toBe('Uptown');
    expect(uptown.arrivals.map((a) => a.minutes)).toEqual([2, 7]);
    expect(downtown.arrivals.map((a) => a.minutes)).toEqual([1]);
    expect(uptown.arrivals[0].route).toBe('1');
    expect(uptown.arrivals[0].color).toBe('#ee352e');
  });

  it('derives destination from the last stop of the trip', () => {
    const entities = [tripUpdate('1', [['127S', 1_700_000_060], ['142S', 1_700_000_400]])];
    const groups = transformArrivals(entities, '127', NOW, lookups);
    expect(groups.find((g) => g.direction === 'S')!.arrivals[0].destination).toBe('South Ferry');
  });

  it('ignores stops for other stations and already-departed trains', () => {
    const entities = [
      tripUpdate('1', [['999N', 1_700_000_120]]),  // different station
      tripUpdate('1', [['127N', 1_699_999_900]]),  // in the past
    ];
    const groups = transformArrivals(entities, '127', NOW, lookups);
    expect(groups.every((g) => g.arrivals.length === 0)).toBe(true);
  });

  it('handles Long-style time objects with a toNumber method', () => {
    const entities = [{
      tripUpdate: {
        trip: { routeId: '1' },
        stopTimeUpdate: [{ stopId: '127N', arrival: { time: { toNumber: () => 1_700_000_120 } } }],
      },
    }];
    const groups = transformArrivals(entities, '127', NOW, lookups);
    expect(groups.find((g) => g.direction === 'N')!.arrivals[0].minutes).toBe(2);
  });
});
