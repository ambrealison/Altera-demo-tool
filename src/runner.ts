import { useCallback, useEffect, useRef, useState } from "react";

/** One thing that happens during a run, at a time in milliseconds from its start. */
export interface Event {
  at: number;
  /** A line for the engine log. */
  log?: { tag: string; text: string; warn?: boolean };
  /** Something the screen should reveal, e.g. a table row filled in. */
  mark?: string;
}

export interface Line { id: number; ts: string; tag: string; text: string; warn?: boolean }

/**
 * Plays a script of timed events, as if the engine were working: log lines stream in,
 * marks arrive one by one, and a progress value runs from 0 to 1.
 */
export function useRunner() {
  const [lines, setLines] = useState<Line[]>([]);
  const [marks, setMarks] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const timers = useRef<number[]>([]);
  const start = useRef(0);
  const seq = useRef(0);
  const clock = useRef(Date.now());

  const clear = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  useEffect(() => clear, []);

  const stamp = () => {
    const s = Math.floor((Date.now() - clock.current) / 1000);
    return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  };

  const say = useCallback((tag: string, text: string, warn?: boolean) => {
    setLines((ls) => [...ls, { id: seq.current++, ts: stamp(), tag, text, warn }]);
  }, []);

  const play = useCallback((events: Event[], total: number, onDone: () => void) => {
    clear();
    setBusy(true);
    setProgress(0);
    start.current = Date.now();
    for (const e of events) {
      timers.current.push(window.setTimeout(() => {
        if (e.log) say(e.log.tag, e.log.text, e.log.warn);
        if (e.mark) setMarks((m) => new Set(m).add(e.mark!));
      }, e.at));
    }
    const tick = () => {
      const p = Math.min(1, (Date.now() - start.current) / total);
      setProgress(p);
      if (p < 1) timers.current.push(window.setTimeout(tick, 120));
    };
    tick();
    timers.current.push(window.setTimeout(() => { setBusy(false); setProgress(1); onDone(); }, total + 60));
  }, [say]);

  const mark = useCallback((m: string) => setMarks((s) => new Set(s).add(m)), []);

  const reset = useCallback(() => {
    clear();
    setLines([]); setMarks(new Set()); setProgress(0); setBusy(false);
    clock.current = Date.now();
  }, []);

  return { lines, marks, progress, busy, play, say, mark, reset };
}

/** Spread n items evenly between two times, with a little jitter so it does not look mechanical. */
export function spread(n: number, from: number, to: number, seed = 1): number[] {
  let x = seed;
  const rnd = () => { x = (x * 9301 + 49297) % 233280; return x / 233280; };
  const step = (to - from) / Math.max(1, n);
  return Array.from({ length: n }, (_, i) => Math.round(from + step * i + rnd() * step * 0.6));
}
