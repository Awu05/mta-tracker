import { useState, useRef } from 'react';
import type { SearchResult, NearbyStop, GeoResult } from '../api';
import { searchStations, fetchNearbyBuses, addStation, removeStation, setWeather, geocode } from '../api';

export function EditPanel({ code, onChanged }: { code: string; onChanged: () => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [justAdded, setJustAdded] = useState<{ id: string; name: string } | null>(null);
  const [nearby, setNearby] = useState<NearbyStop[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchSeq = useRef(0);

  const [place, setPlace] = useState('');
  const [places, setPlaces] = useState<GeoResult[]>([]);
  const placeSeq = useRef(0);

  async function onQueryChange(q: string) {
    setQuery(q);
    // Bump the sequence on every change so a slower, older in-flight response
    // can't overwrite the results of a newer query (out-of-order responses).
    const seq = ++searchSeq.current;
    if (!q.trim()) {
      setResults([]);
      return;
    }
    try {
      setError(null);
      const found = await searchStations(q);
      if (seq !== searchSeq.current) return;
      setResults(found);
    } catch {
      if (seq !== searchSeq.current) return;
      setError('Search failed. Try again.');
    }
  }

  async function onPickStation(station: SearchResult) {
    try {
      setBusy(true);
      setError(null);
      const added = await addStation(code, { id: station.id, type: 'subway' });
      if (added) onChanged();
      setJustAdded({ id: station.id, name: station.name });
      setQuery('');
      setResults([]);
      const stops = await fetchNearbyBuses(code, station.id);
      setNearby(stops);
    } catch {
      setError('Could not add that station. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function onPickBus(stop: NearbyStop) {
    const adding = !stop.alreadyAdded;
    try {
      setBusy(true);
      setError(null);
      if (adding) {
        await addStation(code, { id: stop.code, type: 'bus' });
      } else {
        await removeStation(code, { id: stop.code, type: 'bus' });
      }
      onChanged();
      setNearby((prev) => prev.map((s) => (s.code === stop.code ? { ...s, alreadyAdded: adding } : s)));
    } catch {
      setError(adding ? 'Could not add that bus stop. Try again.' : 'Could not remove that bus stop. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function onPlaceChange(q: string) {
    setPlace(q);
    const seq = ++placeSeq.current;
    if (!q.trim()) {
      setPlaces([]);
      return;
    }
    try {
      const found = await geocode(q);
      if (seq !== placeSeq.current) return;
      setPlaces(found);
    } catch {
      /* ignore */
    }
  }

  async function onPickPlace(p: GeoResult) {
    try {
      setBusy(true);
      setError(null);
      await setWeather(code, p.lat, p.lon);
      onChanged();
      setPlace('');
      setPlaces([]);
    } catch {
      setError('Could not set location.');
    } finally {
      setBusy(false);
    }
  }

  function useMyLocation() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      void onPickPlace({ name: 'Current location', admin1: '', country: '', lat: pos.coords.latitude, lon: pos.coords.longitude });
    });
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
            <label key={stop.code} className="nearby-item">
              <input
                type="checkbox"
                checked={stop.alreadyAdded}
                disabled={busy}
                onChange={() => onPickBus(stop)}
                aria-label={`${stop.alreadyAdded ? 'Remove' : 'Add'} ${stop.name}`}
              />
              <span className="nearby-name">{stop.name}</span>
              <span className="nearby-routes">{stop.routes.join(', ')}</span>
              <span className="nearby-distance">{Math.round(stop.distanceMeters)} m</span>
            </label>
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

          <div className="edit-section">
            <div className="edit-section-title">Weather location</div>
            <div className="weather-loc-row">
              <input
                type="text"
                className="search-box"
                placeholder="City or zip…"
                value={place}
                onChange={(e) => onPlaceChange(e.target.value)}
              />
              <button type="button" className="edit-done" onClick={useMyLocation}>Use my location</button>
            </div>
            {places.length > 0 && (
              <div className="search-results">
                {places.map((p, i) => (
                  <button type="button" key={i} className="search-result" onClick={() => onPickPlace(p)} disabled={busy}>
                    <span className="search-result-name">{p.name}</span>
                    <span className="search-result-routes">{[p.admin1, p.country].filter(Boolean).join(', ')}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
