"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "@/components/Bits";
import type { LessonExport } from "@/app/api/export/route";
import type { Diagram } from "@/lib/diagram";

// Review what goes to Arcade, Sandbox or Board before sending. Kept quiet on purpose: settings are one
// row of pills and items are one line each; clicking an item opens just that one for editing.
// Shapes and limits follow padlet-integration-brief.md; the send itself is still mocked.

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
  const [open, setOpen] = useState<number | null>(null); // the one item being edited

  useEffect(() => {
    if (target) {
      setDraft(structuredClone(targets));
      setOpen(null);
      if (!dialog.current?.open) dialog.current?.showModal();
    } else dialog.current?.close();
  }, [target, targets]);

  const a = draft.arcade;
  const gameType = a.gameType ?? "multiple-choice-v2";
  const setArcade = (p: Partial<Targets["arcade"]>) => setDraft((d) => ({ ...d, arcade: { ...d.arcade, ...p } }));
  const cards = draft.sandbox.cards;
  const setCards = (next: typeof cards) => setDraft((d) => ({ ...d, sandbox: { cards: next } }));
  const posts = draft.board.posts;
  const setPosts = (next: typeof posts) => setDraft((d) => ({ ...d, board: { ...d.board, posts: next } }));

  // Shared list operations, so each target only says how a row reads and how it's edited.
  function list<T>(items: T[], set: (next: T[]) => void) {
    return {
      remove: (i: number) => {
        set(items.filter((_, j) => j !== i));
        setOpen(null);
      },
      move: (i: number, by: number) => {
        const next = [...items];
        const [x] = next.splice(i, 1);
        next.splice(i + by, 0, x);
        set(next);
        setOpen(i + by);
      },
      patch: (i: number, p: Partial<T>) => set(items.map((x, j) => (j === i ? { ...x, ...p } : x))),
      add: (blank: T) => {
        set([...items, blank]);
        setOpen(items.length);
      },
    };
  }
  const q = list(a.questions, (questions) => setArcade({ questions }));
  const c = list(cards, setCards);
  const p = list(posts, setPosts);

  const n = target === "arcade" ? a.questions.length : target === "sandbox" ? cards.length : posts.length;
  const noun = target === "arcade" ? "question" : target === "sandbox" ? "card" : "post";
  const tooMany = target === "sandbox" && cards.length > SANDBOX_CARD_LIMIT;
  const name = target === "arcade" ? "Arcade" : target === "sandbox" ? "Sandbox" : "Board";

  return (
    <dialog ref={dialog} className="side" onClose={onClose} onClick={(e) => e.target === e.currentTarget && onClose()}>
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
                <input className="topic" aria-label="Topic" value={a.prompt} onChange={(e) => setArcade({ prompt: e.target.value })} />
                <div className="pills">
                  <PillSelect label="Game" value={gameType} options={GAME_TYPES} onChange={(v) => setArcade({ gameType: v })} />
                  <PillSelect label="Grade" value={a.grade ?? "any"} options={GRADES} onChange={(v) => setArcade({ grade: v })} />
                  <button
                    type="button"
                    className="pill-toggle"
                    aria-pressed={a.attachTranscript ?? true}
                    onClick={() => setArcade({ attachTranscript: !(a.attachTranscript ?? true) })}
                  >
                    {(a.attachTranscript ?? true) && <Icon name="check" size={14} />}
                    Transcript
                  </button>
                </div>
                <ListLabel label="Questions" count={a.questions.length} />
                <div className="rows">
                  {a.questions.map((x, i) => (
                    <Row
                      key={i}
                      n={i + 1}
                      open={open === i}
                      onOpen={() => setOpen(i)}
                      onClose={() => setOpen(null)}
                      onRemove={() => q.remove(i)}
                      primary={x.q}
                      secondary={x.answer}
                      placeholder="New question"
                    >
                      <textarea rows={2} aria-label={`Question ${i + 1}`} placeholder="Question" value={x.q} autoFocus onChange={(e) => q.patch(i, { q: e.target.value })} />
                      <input aria-label={`Answer ${i + 1}`} placeholder="Answer" value={x.answer} onChange={(e) => q.patch(i, { answer: e.target.value })} />
                      {USES_WRONG_ANSWERS.has(gameType) && (
                        <input
                          aria-label={`Wrong answers ${i + 1}`}
                          placeholder="Wrong answers, separated by commas"
                          value={x.distractors.join(", ")}
                          onChange={(e) => q.patch(i, { distractors: e.target.value.split(",").map((s) => s.trimStart()) })}
                        />
                      )}
                    </Row>
                  ))}
                </div>
                <button type="button" className="add" onClick={() => q.add({ q: "", answer: "", distractors: ["", "", ""] })}>
                  <Icon name="plus" size={16} />
                  Add question
                </button>
              </>
            )}

            {target === "sandbox" && (
              <>
                <ListLabel
                  label="Cards"
                  count={cards.length}
                  note={tooMany ? `The free plan allows ${SANDBOX_CARD_LIMIT}` : `of ${SANDBOX_CARD_LIMIT}`}
                  warn={tooMany}
                />
                <div className="rows">
                  {cards.map((x, i) => {
                    const d = diagrams.find((g) => g.id === x.diagram_id);
                    return (
                      <Row
                        key={i}
                        n={i + 1}
                        open={open === i}
                        onOpen={() => setOpen(i)}
                        onClose={() => setOpen(null)}
                        onRemove={() => c.remove(i)}
                        onUp={i > 0 ? () => c.move(i, -1) : undefined}
                        onDown={i < cards.length - 1 ? () => c.move(i, 1) : undefined}
                        primary={x.title}
                        secondary={d ? `Diagram: ${d.title}` : x.body}
                        placeholder="New card"
                      >
                        <input aria-label={`Card ${i + 1} title`} placeholder="Title" value={x.title} autoFocus onChange={(e) => c.patch(i, { title: e.target.value })} />
                        <textarea rows={3} aria-label={`Card ${i + 1} text`} placeholder="Text" value={x.body} onChange={(e) => c.patch(i, { body: e.target.value })} />
                        {d && (
                          <span className="row-attach">
                            Diagram: {d.title}
                            <button type="button" className="link" onClick={() => c.patch(i, { diagram_id: undefined })}>
                              Remove
                            </button>
                          </span>
                        )}
                      </Row>
                    );
                  })}
                </div>
                <button type="button" className="add" onClick={() => c.add({ title: "", body: "" })}>
                  <Icon name="plus" size={16} />
                  Add card
                </button>
              </>
            )}

            {target === "board" && (
              <>
                <div className="segmented" role="radiogroup" aria-label="Layout">
                  {LAYOUTS.map(([v, l]) => (
                    <button
                      type="button"
                      key={v}
                      role="radio"
                      aria-checked={(draft.board.layout ?? "wall") === v}
                      onClick={() => setDraft((d) => ({ ...d, board: { ...d.board, layout: v } }))}
                    >
                      {l}
                    </button>
                  ))}
                </div>
                <ListLabel label="Posts" count={posts.length} />
                <div className="rows">
                  {posts.map((x, i) => (
                    <Row
                      key={i}
                      n={i + 1}
                      open={open === i}
                      onOpen={() => setOpen(i)}
                      onClose={() => setOpen(null)}
                      onRemove={() => p.remove(i)}
                      onUp={i > 0 ? () => p.move(i, -1) : undefined}
                      onDown={i < posts.length - 1 ? () => p.move(i, 1) : undefined}
                      primary={x.subject}
                      secondary={x.body}
                      placeholder="New post"
                    >
                      <input aria-label={`Post ${i + 1} subject`} placeholder="Subject" value={x.subject} autoFocus onChange={(e) => p.patch(i, { subject: e.target.value })} />
                      <textarea rows={2} aria-label={`Post ${i + 1} text`} placeholder="Text" value={x.body} onChange={(e) => p.patch(i, { body: e.target.value })} />
                    </Row>
                  ))}
                </div>
                <button type="button" className="add" onClick={() => p.add({ subject: "", body: "" })}>
                  <Icon name="plus" size={16} />
                  Add post
                </button>
              </>
            )}
          </div>

          <div className="side-foot">
            <button type="button" className="btn btn-soft" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-dark" disabled={!n || tooMany}>
              Send {n} {noun}
              {n === 1 ? "" : "s"}
            </button>
          </div>
        </form>
      )}
    </dialog>
  );
}

function PillSelect({ label, value, options, onChange }: { label: string; value: string; options: string[][]; onChange: (v: string) => void }) {
  return (
    <label className="pill-select">
      <span className="sr">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

function ListLabel({ label, count, note, warn }: { label: string; count: number; note?: string; warn?: boolean }) {
  return (
    <div className="list-label">
      {label}
      <span className={`tnum${warn ? " err" : ""}`}>
        {count} {note}
      </span>
    </div>
  );
}

// One item: a single quiet line until clicked, then just that item's fields.
function Row({
  n, open, onOpen, onClose, onRemove, onUp, onDown, primary, secondary, placeholder, children,
}: {
  n: number;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onRemove: () => void;
  onUp?: () => void;
  onDown?: () => void;
  primary: string;
  secondary?: string;
  placeholder: string;
  children: ReactNode;
}) {
  if (open) {
    return (
      <div className="row row-open">
        {children}
        <div className="row-actions">
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
          <button type="button" className="link" onClick={onRemove}>
            Remove
          </button>
          <span className="spacer" />
          <button type="button" className="btn btn-soft" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="row">
      <button type="button" className="row-main" onClick={onOpen}>
        <span className="row-n tnum">{n}</span>
        <span className="row-text">
          <span className={primary ? "row-1" : "row-1 row-empty"}>{primary || placeholder}</span>
          {secondary && <span className="row-2">{secondary}</span>}
        </span>
      </button>
      <button type="button" className="icon-btn row-x" aria-label={`Remove ${n}`} onClick={onRemove}>
        <Icon name="x" size={16} />
      </button>
    </div>
  );
}
