import { useEffect, useRef, useState } from 'react';
import type { Board as BoardData } from './types';
import { fetchBoard } from './api';
import { Board } from './components/Board';

const POLL_MS = 10_000;

function compactOverride(): boolean | null {
  const params = new URLSearchParams(window.location.search);
  if (!params.has('compact')) return null;
  const v = (params.get('compact') ?? '').trim().toLowerCase();
  if (v === '' || ['1', 'true', 'yes', 'on'].includes(v)) return true;
  return false; // '0','false','no','off', or anything else
}

export default function App() {
  const [board, setBoard] = useState<BoardData | null>(null);
  const [error, setError] = useState(false);
  const [override, setOverride] = useState<boolean | null>(() => compactOverride());
  const timer = useRef<number | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const data = await fetchBoard();
        if (active) { setBoard(data); setError(false); }
      } catch {
        if (active) setError(true); // keep last board on screen
      }
    }
    void load();
    timer.current = window.setInterval(load, POLL_MS);
    return () => { active = false; if (timer.current) window.clearInterval(timer.current); };
  }, []);

  if (!board) {
    return <div className="loading">{error ? 'Cannot reach server…' : 'Loading…'}</div>;
  }
  const display = error ? { ...board, stale: true } : board;
  const compact = override !== null ? override : board.compact;

  function toggleCompact() {
    const next = !compact;
    setOverride(next);
    const params = new URLSearchParams(window.location.search);
    params.set('compact', next ? '1' : '0');
    window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
  }

  return (
    <div className={`app mode-${board.displayMode}${compact ? ' compact' : ''}`}>
      <Board board={display} compact={compact} onToggleCompact={toggleCompact} />
    </div>
  );
}
