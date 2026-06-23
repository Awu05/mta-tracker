import { useCallback, useEffect, useRef, useState } from 'react';
import type { Board as BoardData } from './types';
import { fetchBoard, removeStation, getBoardCode } from './api';
import { Board } from './components/Board';
import { WelcomeModal } from './components/WelcomeModal';

const POLL_MS = 10_000;
const COMPACT_KEY = 'mta:compact';

// Per-device compact preference, remembered in the browser (not the URL, not the
// server) so each display keeps its own density without affecting other devices
// viewing the same board. null = no preference yet (fall back to the server default).
function readCompactPref(): boolean | null {
  try {
    const v = localStorage.getItem(COMPACT_KEY);
    if (v === '1') return true;
    if (v === '0') return false;
  } catch { /* localStorage unavailable — fall back to server default */ }
  return null;
}

function saveCompactPref(v: boolean): void {
  try { localStorage.setItem(COMPACT_KEY, v ? '1' : '0'); } catch { /* ignore */ }
}

export default function App() {
  const [board, setBoard] = useState<BoardData | null>(null);
  const [error, setError] = useState(false);
  const [override, setOverride] = useState<boolean | null>(() => readCompactPref());
  const [editMode, setEditMode] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const timer = useRef<number | null>(null);
  const active = useRef(true);
  const code = useRef(getBoardCode());
  const welcomeChecked = useRef(false);

  const reload = useCallback(async () => {
    try {
      const data = await fetchBoard(code.current);
      if (active.current) { setBoard(data); setError(false); }
    } catch {
      if (active.current) setError(true); // keep last board on screen
    }
  }, []);

  useEffect(() => {
    active.current = true;
    void reload();
    timer.current = window.setInterval(reload, POLL_MS);
    return () => { active.current = false; if (timer.current) window.clearInterval(timer.current); };
  }, [reload]);

  // On the first board load of this session, open the welcome popup if the
  // board is empty. Checked once so dismissing it doesn't reopen mid-session;
  // a fresh page load re-checks (so an empty board prompts again).
  useEffect(() => {
    if (!board || welcomeChecked.current) return;
    welcomeChecked.current = true;
    if (board.stations.length === 0) setWelcomeOpen(true);
  }, [board]);

  if (!board) {
    return <div className="loading">{error ? 'Cannot reach server…' : 'Loading…'}</div>;
  }
  const display = error ? { ...board, stale: true } : board;
  const compact = override !== null ? override : board.compact;

  function toggleCompact() {
    const next = !compact;
    setOverride(next);
    saveCompactPref(next);
  }

  function toggleEdit() {
    setEditMode((v) => !v);
  }

  async function onRemove(entry: { id: string; type: 'subway' | 'bus' }) {
    await removeStation(code.current, entry);
    await reload();
  }

  return (
    <div className={`app mode-${board.displayMode}${compact ? ' compact' : ''}`}>
      <Board
        board={display}
        compact={compact}
        onToggleCompact={toggleCompact}
        editMode={editMode}
        onToggleEdit={toggleEdit}
        onRemove={onRemove}
        onChanged={reload}
        boardCode={code.current}
      />
      {welcomeOpen && (
        <WelcomeModal
          code={code.current}
          stations={board.stations}
          weather={board.weather}
          onChanged={reload}
          onClose={() => setWelcomeOpen(false)}
        />
      )}
    </div>
  );
}
