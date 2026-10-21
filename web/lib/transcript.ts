// Turns the server's append-only text pieces into settled sentences plus the words still being said.
// A sentence settles once its . ? or ! is followed by more speech; the rest settles on End lesson.

export type Sentence = { id: number; raw: string; clean?: string; t: number };

const BOUNDARY = /[.?!]["')\]]?\s+(?=\S)/g;

export function splitSettled(pending: string): { done: string[]; rest: string } {
  const done: string[] = [];
  let start = 0;
  for (const m of pending.matchAll(BOUNDARY)) {
    const end = m.index! + m[0].trimEnd().length;
    const s = pending.slice(start, end).trim();
    if (s) done.push(s);
    start = m.index! + m[0].length;
  }
  return { done, rest: pending.slice(start) };
}

export function formatClock(secs: number) {
  const s = Math.max(0, Math.floor(secs));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
