import { describe, it, expect } from 'vitest';
import { feedIdForRoute, feedUrl, feedsForRoutes, ALERTS_URL } from '../src/feeds/feedUrls';

describe('feedUrls', () => {
  it('maps routes to their feed id', () => {
    expect(feedIdForRoute('1')).toBe('123456s');
    expect(feedIdForRoute('A')).toBe('ace');
    expect(feedIdForRoute('N')).toBe('nqrw');
    expect(feedIdForRoute('L')).toBe('l');
  });

  it('maps express route variants to their base feed id', () => {
    expect(feedIdForRoute('6X')).toBe('123456s');
    expect(feedIdForRoute('7X')).toBe('123456s');
    expect(feedIdForRoute('FX')).toBe('bdfm');
  });

  it('builds a feed URL for a feed id', () => {
    expect(feedUrl('ace')).toContain('nyct%2Fgtfs-ace');
    expect(feedUrl('123456s')).toMatch(/nyct%2Fgtfs$/);
  });

  it('returns the unique set of feed ids for a list of routes', () => {
    expect(feedsForRoutes(['1', '2', '3', 'N']).sort()).toEqual(['123456s', 'nqrw']);
  });

  it('exposes the alerts feed url', () => {
    expect(ALERTS_URL).toContain('camsys%2Fsubway-alerts');
  });
});
