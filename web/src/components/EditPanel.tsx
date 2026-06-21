import { useState } from 'react';
import type { SearchResult, NearbyStop } from '../api';
import { searchStations, fetchNearbyBuses, addStation } from '../api';

export function EditPanel({ onChanged }: { onChanged: () => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [justAdded, setJustAdded] = useState<{ id: string; name: string } | null>(null);
  const [nearby, setNearby] = useState<NearbyStop[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onQueryChange(q: string) {
    setQuery(q);
    if (!q.trim()) {
      setResults([]);
      return;
    }
    try {
      setError(null);
      const found = await searchStations(q);
      setResults(found);
    } catch {
      setError('Search failed. Try again.');
    }
  }

  async function onPickStation(station: SearchResult) {
    try {
      setBusy(true);
      setError(null);
      await addStation({ id: station.id, type: 'subway' });
      onChanged();
      setJustAdded({ id: station.id, name: station.name });
      setQuery('');
      setResults([]);
      const stops = await fetchNearbyBuses(station.id);
      setNearby(stops);
    } catch {
      setError('Could not add that station. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function onPickBus(stop: NearbyStop) {
    if (stop.alreadyAdded) return;
    try {
      setBusy(true);
      setError(null);
      await addStation({ id: stop.code, type: 'bus' });
      onChanged();
      setNearby((prev) => prev.map((s) => (s.code === stop.code ? { ...s, alreadyAdded: true } : s)));
    } catch {
      setError('Could not add that bus stop. Try again.');
    } finally {
      setBusy(false);
    }
  }

  function onDone() {
    setJustAdded(null);
    setNearby([]);
  }

  return (
    <div className="edit-panel">
      {error && <div className="edit-error">{error}</div>}

      {justAdded && nearby.length > 0 ? (
        <div className="nearby-list">
          <div className="nearby-title">Nearby bus stops for {justAdded.name}</div>
          {nearby.map((stop) => (
            <div key={stop.code} className="nearby-item">
              <input
                type="checkbox"
                checked={stop.alreadyAdded}
                disabled={stop.alreadyAdded || busy}
                onChange={() => onPickBus(stop)}
                aria-label={`Add ${stop.name}`}
              />
              <span className="nearby-name">{stop.name}</span>
              <span className="nearby-routes">{stop.routes.join(', ')}</span>
              <span className="nearby-distance">{Math.round(stop.distanceMeters)} m</span>
            </div>
          ))}
          <button type="button" className="edit-done" onClick={onDone}>Done</button>
        </div>
      ) : (
        <>
          <input
            type="text"
            className="search-box"
            placeholder="Search for a station…"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
          />
          {results.length > 0 && (
            <div className="search-results">
              {results.map((r) => (
                <button
                  type="button"
                  key={r.id}
                  className="search-result"
                  onClick={() => onPickStation(r)}
                  disabled={busy}
                >
                  <span className="search-result-name">{r.name}</span>
                  <span className="search-result-routes">{r.routes.join(', ')}</span>
                </button>
              ))}
            </div>
          )}
          {justAdded && (
            <div className="edit-added-note">
              Added {justAdded.name}. <button type="button" className="edit-done" onClick={onDone}>Done</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
