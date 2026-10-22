// Turns the server's append-only text pieces into settled sentences plus the words still being said.
// A sentence settles once its . ? or ! is followed by more speech; the rest settles on End lesson.

// `edited`: the teacher corrected it, so the automatic tidy-up must never overwrite `clean`.
export type Sentence = { id: number; raw: string; clean?: string; t: number; edited?: boolean };

const BOUNDARY = /[.?!]["')\]]?\s+(?=\S)/g;
// A full stop after a title or inside a dotted abbreviation ("U.S.", "e.g.", "a.m.") isn't the end of a sentence. A
// lone letter is: "vitamin C." and "Solve for x." end sentences all the time in lessons.
const ABBREVIATION = /(\b(Mr|Mrs|Ms|Dr|Prof|St|Sr|Jr|vs|etc)|\b(?:[a-z]\.)+[a-z])\.$/i;

export function splitSettled(pending: string): { done: string[]; rest: string } {
  const done: string[] = [];
  let start = 0;
  for (const m of pending.matchAll(BOUNDARY)) {
    const end = m.index! + m[0].trimEnd().length;
    if (ABBREVIATION.test(pending.slice(start, end))) continue; // "Mr. Smith", "the U.S. today", "e.g. water"
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
