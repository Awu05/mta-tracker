import { useEffect, useRef, useState } from 'react';
import type { Board as BoardData } from './types';
import { fetchBoard } from './api';
import { Board } from './components/Board';

const POLL_MS = 10_000;

export default function App() {
  const [board, setBoard] = useState<BoardData | null>(null);
  const [error, setError] = useState(false);
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
  return (
    <div className={`app mode-${board.displayMode}`}>
      <Board board={display} />
    </div>
  );
}
