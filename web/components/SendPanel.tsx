"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Bits";
import type { LessonExport } from "@/app/api/export/route";
import type { Diagram } from "@/lib/diagram";

// Review and edit what goes to Arcade, Sandbox or Board before sending. Shapes and limits follow
// padlet-integration-brief.md; the send itself is still mocked.

export type Target = "board" | "arcade" | "sandbox";
type Targets = LessonExport["targets"];

const GRADES = [
  ["any", "Any grade"], ["k", "Kindergarten"], ...Array.from({ length: 12 }, (_, i) => [`${i + 1}`, `Grade ${i + 1}`]), ["higher_ed", "Higher ed"],
];
const GAME_TYPES = [
  ["multiple-choice-v2", "Multiple choice"], ["flashcards", "Flashcards"], ["matching", "Matching"], ["sequencing", "Sequencing"],
  ["sorting", "Sorting"], ["fill-in-the-blank", "Fill in the blank"], ["short-answer", "Short answer"], ["memory-tiles", "Memory tiles"],
  ["word-search", "Word search"], ["crossword", "Crossword"],
];
const USES_WRONG_ANSWERS = new Set(["multiple-choice-v2"]);
const SANDBOX_CARD_LIMIT = 20; // Neon plan; paid plans allow 100
const LAYOUTS = [["wall", "Wall"], ["columns", "Columns"], ["timeline", "Timeline"]] as const;

export function SendPanel({
  target, targets, diagrams, onClose, onSend,
}: {
  target: Target | null;
  targets: Targets;
  diagrams: Diagram[];
  onClose: () => void;
  onSend: (next: Targets) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState<Targets>(targets);

  useEffect(() => {
    if (target) {
      setDraft(structuredClone(targets));
      if (!dialog.current?.open) dialog.current?.showModal();
    } else dialog.current?.close();
  }, [target, targets]);

  const a = draft.arcade;
  const gameType = a.gameType ?? "multiple-choice-v2";
  const setArcade = (p: Partial<Targets["arcade"]>) => setDraft((d) => ({ ...d, arcade: { ...d.arcade, ...p } }));
  const setQ = (i: number, p: Partial<Targets["arcade"]["questions"][number]>) =>
    setArcade({ questions: a.questions.map((q, j) => (j === i ? { ...q, ...p } : q)) });
  const cards = draft.sandbox.cards;
  const setCards = (next: typeof cards) => setDraft((d) => ({ ...d, sandbox: { cards: next } }));
  const posts = draft.board.posts;
  const setPosts = (next: typeof posts) => setDraft((d) => ({ ...d, board: { ...d.board, posts: next } }));
  const move = <T,>(list: T[], i: number, by: number) => {
    const next = [...list];
    const [x] = next.splice(i, 1);
    next.splice(Math.max(0, Math.min(list.length - 1, i + by)), 0, x);
    return next;
  };

  const count =
    target === "arcade" ? `${a.questions.length} question${a.questions.length === 1 ? "" : "s"}`
    : target === "sandbox" ? `${cards.length} card${cards.length === 1 ? "" : "s"}`
    : `${posts.length} post${posts.length === 1 ? "" : "s"}`;
  const tooMany = target === "sandbox" && cards.length > SANDBOX_CARD_LIMIT;
  const empty = target === "arcade" ? !a.questions.length : target === "sandbox" ? !cards.length : !posts.length;
  const name = target === "arcade" ? "Arcade" : target === "sandbox" ? "Sandbox" : "Board";

  return (
    <dialog ref={dialog} className="side" onClose={onClose}>
      {target && (
        <form
          className="side-inner"
          onSubmit={(e) => {
            e.preventDefault();
            onSend(draft);
          }}
        >
          <div className="side-head">
            <h2 className="h2">Send to {name}</h2>
            <button type="button" className="btn btn-ghost btn-icon" aria-label="Close" onClick={onClose}>
              <Icon name="x" />
            </button>
          </div>

          <div className="side-body">
            {target === "arcade" && (
              <>
                <label className="field">
                  <span>Topic</span>
                  <textarea rows={3} value={a.prompt} onChange={(e) => setArcade({ prompt: e.target.value })} />
                </label>
                <label className="field">
                  <span>Grade</span>
                  <select value={a.grade ?? "any"} onChange={(e) => setArcade({ grade: e.target.value })}>
                    {GRADES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </label>
                <div className="field">
                  <span>Game</span>
                  <div className="chips">
                    {GAME_TYPES.map(([v, l]) => (
                      <button type="button" key={v} className="chip-btn" aria-pressed={gameType === v} onClick={() => setArcade({ gameType: v })}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
                <label className="toggle">
                  <input type="checkbox" checked={a.attachTranscript ?? true} onChange={(e) => setArcade({ attachTranscript: e.target.checked })} />
                  Attach the lesson transcript
                </label>
                <ListHead label="Questions" count={a.questions.length} onAdd={() => setArcade({ questions: [...a.questions, { q: "", answer: "", distractors: ["", "", ""] }] })} />
                {a.questions.map((q, i) => (
                  <div key={i} className="item">
                    <ItemTools n={i + 1} onRemove={() => setArcade({ questions: a.questions.filter((_, j) => j !== i) })} />
                    <textarea rows={2} aria-label={`Question ${i + 1}`} placeholder="Question" value={q.q} onChange={(e) => setQ(i, { q: e.target.value })} />
                    <input aria-label={`Answer ${i + 1}`} placeholder="Answer" value={q.answer} onChange={(e) => setQ(i, { answer: e.target.value })} />
                    {USES_WRONG_ANSWERS.has(gameType) && (
                      <input
                        aria-label={`Wrong answers ${i + 1}`}
                        placeholder="Wrong answers, separated by commas"
                        value={q.distractors.join(", ")}
                        onChange={(e) => setQ(i, { distractors: e.target.value.split(",").map((x) => x.trimStart()) })}
                      />
                    )}
                  </div>
                ))}
              </>
            )}

            {target === "sandbox" && (
              <>
                <ListHead
                  label="Cards"
                  count={cards.length}
                  note={tooMany ? `Sandbox allows ${SANDBOX_CARD_LIMIT} cards on the free plan` : `of ${SANDBOX_CARD_LIMIT}`}
                  warn={tooMany}
                  onAdd={() => setCards([...cards, { title: "", body: "" }])}
                />
                {cards.map((c, i) => {
                  const d = diagrams.find((x) => x.id === c.diagram_id);
                  return (
                    <div key={i} className="item">
                      <ItemTools
                        n={i + 1}
                        onUp={i > 0 ? () => setCards(move(cards, i, -1)) : undefined}
                        onDown={i < cards.length - 1 ? () => setCards(move(cards, i, 1)) : undefined}
                        onRemove={() => setCards(cards.filter((_, j) => j !== i))}
                      />
                      <input aria-label={`Card ${i + 1} title`} placeholder="Title" value={c.title} onChange={(e) => setCards(cards.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
                      <textarea rows={3} aria-label={`Card ${i + 1} text`} placeholder="Text" value={c.body} onChange={(e) => setCards(cards.map((x, j) => (j === i ? { ...x, body: e.target.value } : x)))} />
                      {d && (
                        <span className="item-attach">
                          Diagram: {d.title}
                          <button type="button" className="link" onClick={() => setCards(cards.map((x, j) => (j === i ? { ...x, diagram_id: undefined } : x)))}>
                            Remove
                          </button>
                        </span>
                      )}
                    </div>
                  );
                })}
              </>
            )}

            {target === "board" && (
              <>
                <div className="field">
                  <span>Layout</span>
                  <div className="chips">
                    {LAYOUTS.map(([v, l]) => (
                      <button type="button" key={v} className="chip-btn" aria-pressed={(draft.board.layout ?? "wall") === v} onClick={() => setDraft((d) => ({ ...d, board: { ...d.board, layout: v } }))}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
                <ListHead label="Posts" count={posts.length} onAdd={() => setPosts([...posts, { subject: "", body: "" }])} />
                {posts.map((p, i) => (
                  <div key={i} className="item">
                    <ItemTools
                      n={i + 1}
                      onUp={i > 0 ? () => setPosts(move(posts, i, -1)) : undefined}
                      onDown={i < posts.length - 1 ? () => setPosts(move(posts, i, 1)) : undefined}
                      onRemove={() => setPosts(posts.filter((_, j) => j !== i))}
                    />
                    <input aria-label={`Post ${i + 1} subject`} placeholder="Subject" value={p.subject} onChange={(e) => setPosts(posts.map((x, j) => (j === i ? { ...x, subject: e.target.value } : x)))} />
                    <textarea rows={2} aria-label={`Post ${i + 1} text`} placeholder="Text" value={p.body} onChange={(e) => setPosts(posts.map((x, j) => (j === i ? { ...x, body: e.target.value } : x)))} />
                  </div>
                ))}
              </>
            )}
          </div>

          <div className="side-foot">
            <button type="button" className="btn btn-soft" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-dark" disabled={empty || tooMany}>
              Send {count}
            </button>
          </div>
        </form>
      )}
    </dialog>
  );
}

function ListHead({ label, count, note, warn, onAdd }: { label: string; count: number; note?: string; warn?: boolean; onAdd: () => void }) {
  return (
    <div className="list-head">
      <span className="t17">{label}</span>
      <span className={`t14 tnum${warn ? " err" : ""}`}>
        {count} {note}
      </span>
      <span className="spacer" />
      <button type="button" className="btn btn-ghost" onClick={onAdd}>
        + Add
      </button>
    </div>
  );
}

function ItemTools({ n, onUp, onDown, onRemove }: { n: number; onUp?: () => void; onDown?: () => void; onRemove: () => void }) {
  return (
    <div className="item-tools">
      <span className="t14 tnum">{n}</span>
      <span className="spacer" />
      {onUp && (
        <button type="button" className="icon-btn" aria-label={`Move ${n} up`} onClick={onUp}>
          ↑
        </button>
      )}
      {onDown && (
        <button type="button" className="icon-btn" aria-label={`Move ${n} down`} onClick={onDown}>
          ↓
        </button>
      )}
      <button type="button" className="icon-btn" aria-label={`Remove ${n}`} onClick={onRemove}>
        <Icon name="x" size={16} />
      </button>
    </div>
  );
}
