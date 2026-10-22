// The mascot's name, told apart from the ordinary word ("air bubbles", "bubble sort", "the bubbles rise"). Used by the
// page to decide when Bubbles is being addressed, and by the server to write the name as a name before asking Jev.

const NOT_NAME_BEFORE = /^(the|a|an|air|soap|gas|water|of|these|those|some|tiny|small|big|little|many|blow|blowing|in|with)$/i;
const NOT_NAME_AFTER = /^\s+(sort|tea|wrap|gum|chart|bath|rise|rises|form|forms|pop|pops|burst|bursts)\b/i;
const MENTION = /(\b\w+\s+)?\bbubbles?\b/gi;

const isName = (before: string | undefined, next: string) => !(before && NOT_NAME_BEFORE.test(before.trim())) && !NOT_NAME_AFTER.test(next);

// How many times the name is said in `text`. With `waitForNext`, a mention that is the last thing in the text isn't
// counted yet: speech arrives a word at a time, and "bubble" + "sort" is the ordinary word.
export function countName(text: string, waitForNext = false) {
  let n = 0;
  for (const m of text.matchAll(MENTION)) {
    const next = text.slice(m.index + m[0].length);
    if (waitForNext && !next.trim()) continue;
    if (isName(m[1], next)) n++;
  }
  return n;
}

// The speech model writes the name lowercase with no commas, which Jev reads as the word, not someone being
// addressed: "…theorem bubbles" 0.46 vs "…theorem, Bubbles" 0.98; "Bubbles draw the water cycle" 0.29 vs
// "Bubbles, draw…" 0.97. Write it as a name, except where it's the ordinary word.
export function asName(text: string) {
  return text.replace(MENTION, (m, before: string | undefined, at: number, all: string) => {
    const next = all.slice(at + m.length);
    if (!isName(before, next)) return m;
    // "…theorem, Bubbles" after a word; "Bubbles, draw…" when it opens a sentence and words follow.
    if (before) return `${before.trimEnd()}, Bubbles`;
    return /^\s+[a-z]/i.test(next) ? "Bubbles," : "Bubbles";
  });
}
