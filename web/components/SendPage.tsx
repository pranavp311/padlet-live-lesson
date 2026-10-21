"use client";

import { useState, type ReactNode } from "react";
import { Icon } from "@/components/Bits";
import { DiagramView } from "@/components/Diagram";
import type { LessonExport } from "@/app/api/export/route";
import type { Diagram } from "@/lib/diagram";
import { formatClock } from "@/lib/transcript";

// A page per target for reviewing what goes to Board, Arcade or Sandbox. Choices are pictures, items
// are shown as they'll look, and editing stays hidden until an item is clicked.
// Shapes and limits follow padlet-integration-brief.md; the send itself is still mocked.

export type Target = "board" | "arcade" | "sandbox";
type Targets = LessonExport["targets"];
type Layout = NonNullable<Targets["board"]["layout"]>;

const GRADES = [
  ["any", "Any grade"], ["k", "Kindergarten"], ...Array.from({ length: 12 }, (_, i) => [`${i + 1}`, `Grade ${i + 1}`]), ["higher_ed", "Higher ed"],
];
const USES_WRONG_ANSWERS = new Set(["multiple-choice-v2"]);
const SANDBOX_CARD_LIMIT = 20; // Neon plan; paid plans allow 100

export function SendPage({
  target, lessonTitle, sections, targets, diagrams, onBack, onSend,
}: {
  target: Target;
  lessonTitle: string;
  sections: LessonExport["sections"];
  targets: Targets;
  diagrams: Diagram[];
  onBack: () => void;
  onSend: (next: Targets) => void;
}) {
  const [draft, setDraft] = useState<Targets>(() => structuredClone(targets));
  const [open, setOpen] = useState<number | null>(null); // the one item being edited

  const a = draft.arcade;
  const gameType = a.gameType ?? "multiple-choice-v2";
  const setArcade = (p: Partial<Targets["arcade"]>) => setDraft((d) => ({ ...d, arcade: { ...d.arcade, ...p } }));
  const layout: Layout = draft.board.layout ?? "wall";

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
      },
      patch: (i: number, p: Partial<T>) => set(items.map((x, j) => (j === i ? { ...x, ...p } : x))),
      add: (blank: T) => {
        set([...items, blank]);
        setOpen(items.length);
      },
    };
  }
  const q = list(a.questions, (questions) => setArcade({ questions }));
  const c = list(draft.sandbox.cards, (cards) => setDraft((d) => ({ ...d, sandbox: { cards } })));
  const p = list(draft.board.posts, (posts) => setDraft((d) => ({ ...d, board: { ...d.board, posts } })));

  const n = target === "arcade" ? a.questions.length : target === "sandbox" ? draft.sandbox.cards.length : draft.board.posts.length;
  const noun = target === "arcade" ? "question" : target === "sandbox" ? "card" : "post";
  const tooMany = target === "sandbox" && n > SANDBOX_CARD_LIMIT;
  const look = TARGET_LOOK[target];

  // One post, question or card: shown as it'll look; clicked, it becomes its own small editor.
  const editable = (i: number, view: ReactNode, editor: ReactNode, remove: () => void, extra?: ReactNode) =>
    open === i ? (
      <div className="edit-card" key={i}>
        {editor}
        <div className="row-actions">
          {extra}
          <button type="button" className="link" onClick={remove}>
            Remove
          </button>
          <span className="spacer" />
          <button type="button" className="btn btn-soft" onClick={() => setOpen(null)}>
            Done
          </button>
        </div>
      </div>
    ) : (
      <button type="button" key={i} className="view-card" onClick={() => setOpen(i)} aria-label={`Edit ${noun} ${i + 1}`}>
        {view}
      </button>
    );
  const addCard = (label: string, onAdd: () => void) => (
    <button type="button" className="add-card" onClick={onAdd}>
      <Icon name="plus" />
      {label}
    </button>
  );

  return (
    <div className="wall">
      <header className="hdr">
        <button className="btn btn-tint" onClick={onBack}>
          <Icon name="left" />
          {lessonTitle}
        </button>
        <span className="spacer" />
        <button className="btn btn-create" disabled={!n || tooMany} onClick={() => onSend(draft)}>
          Create {look.thing}
        </button>
      </header>

      <main className="send-page">
        <div className="send-title">
          <span className="target-tile" style={{ background: look.bg, color: look.fg }}>
            <Icon name={look.icon} size={22} />
          </span>
          <h1 className="h1">New {look.thing}</h1>
        </div>

        {target === "board" && (
          <>
            <section className="send-section">
              <h2 className="send-h">Layout</h2>
              <div className="pick-grid three">
                {LAYOUTS.map(([v, label, hint, Art]) => (
                  <button
                    key={v}
                    type="button"
                    className="pick"
                    aria-pressed={layout === v}
                    onClick={() => setDraft((d) => ({ ...d, board: { ...d.board, layout: v } }))}
                  >
                    <span className="pick-art">
                      <Art />
                    </span>
                    <span className="t17">{label}</span>
                    <span className="t14">{hint}</span>
                  </button>
                ))}
              </div>
            </section>
            <section className="send-section">
              <h2 className="send-h">
                Posts <span className="tnum">{draft.board.posts.length}</span>
              </h2>
              <BoardPreview
                layout={layout}
                posts={draft.board.posts}
                labels={draft.board.posts.map((_, i) =>
                  layout === "timeline"
                    ? (sections[i] ? formatClock(sections[i].start_s) : `Post ${i + 1}`)
                    : (sections[i]?.heading ?? `Column ${i + 1}`),
                )}
                render={(post, i) =>
                  editable(
                    i,
                    <>
                      <span className="post-subject">{post.subject || "Untitled"}</span>
                      {post.body && <span className="post-body">{post.body}</span>}
                    </>,
                    <>
                      <input aria-label={`Post ${i + 1} subject`} placeholder="Subject" value={post.subject} autoFocus onChange={(e) => p.patch(i, { subject: e.target.value })} />
                      <textarea rows={3} aria-label={`Post ${i + 1} text`} placeholder="Text" value={post.body} onChange={(e) => p.patch(i, { body: e.target.value })} />
                    </>,
                    () => p.remove(i),
                  )
                }
                add={addCard("Add post", () => p.add({ subject: "", body: "" }))}
              />
            </section>
          </>
        )}

        {target === "arcade" && (
          <>
            <section className="send-section">
              <h2 className="send-h">Game</h2>
              <div className="pick-grid five">
                {GAMES.map(([v, label, art]) => (
                  <button key={v} type="button" className="pick pick-small" aria-pressed={gameType === v} onClick={() => setArcade({ gameType: v })}>
                    <span className="pick-art">{art}</span>
                    <span className="t14 pick-label">{label}</span>
                  </button>
                ))}
              </div>
            </section>
            <section className="send-section">
              <h2 className="send-h">About</h2>
              <div className="about">
                <input className="input" aria-label="Topic" value={a.prompt} onChange={(e) => setArcade({ prompt: e.target.value })} />
                <label className="pill-select">
                  <span className="sr">Grade</span>
                  <select value={a.grade ?? "any"} onChange={(e) => setArcade({ grade: e.target.value })}>
                    {GRADES.map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="button" className="pill-toggle" aria-pressed={a.attachTranscript ?? true} onClick={() => setArcade({ attachTranscript: !(a.attachTranscript ?? true) })}>
                  {(a.attachTranscript ?? true) && <Icon name="check" size={14} />}
                  Transcript
                </button>
              </div>
            </section>
            <section className="send-section">
              <h2 className="send-h">
                Questions <span className="tnum">{a.questions.length}</span>
              </h2>
              <div className="card-grid">
                {a.questions.map((x, i) =>
                  editable(
                    i,
                    <>
                      <span className="q-n tnum">{i + 1}</span>
                      <span className="post-subject">{x.q || "New question"}</span>
                      <span className="chips-row">
                        {x.answer && <span className="answer-chip">{x.answer}</span>}
                        {USES_WRONG_ANSWERS.has(gameType) &&
                          x.distractors.filter(Boolean).map((d) => (
                            <span key={d} className="wrong-chip">
                              {d}
                            </span>
                          ))}
                      </span>
                    </>,
                    <>
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
                    </>,
                    () => q.remove(i),
                  ),
                )}
                {addCard("Add question", () => q.add({ q: "", answer: "", distractors: ["", "", ""] }))}
              </div>
            </section>
          </>
        )}

        {target === "sandbox" && (
          <section className="send-section">
            <h2 className="send-h">
              Cards{" "}
              <span className={`tnum${tooMany ? " err" : ""}`}>
                {n} of {SANDBOX_CARD_LIMIT}
                {tooMany && " · the free plan allows 20"}
              </span>
            </h2>
            <div className="deck">
              {draft.sandbox.cards.map((x, i) => {
                const d = diagrams.find((g) => g.id === x.diagram_id);
                return editable(
                  i,
                  <span className="slide">
                    <span className="slide-n tnum">{i + 1}</span>
                    <span className="post-subject">{x.title || "New card"}</span>
                    {d ? (
                      <span className="slide-art">
                        <DiagramView d={d} still />
                      </span>
                    ) : (
                      <span className="post-body">{x.body}</span>
                    )}
                  </span>,
                  <>
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
                  </>,
                  () => c.remove(i),
                  <>
                    {i > 0 && (
                      <button type="button" className="icon-btn" aria-label={`Move card ${i + 1} earlier`} onClick={() => { c.move(i, -1); setOpen(i - 1); }}>
                        <Icon name="left" size={16} />
                      </button>
                    )}
                    {i < draft.sandbox.cards.length - 1 && (
                      <button type="button" className="icon-btn" aria-label={`Move card ${i + 1} later`} onClick={() => { c.move(i, 1); setOpen(i + 1); }}>
                        <Icon name="right" size={16} />
                      </button>
                    )}
                  </>,
                );
              })}
              {addCard("Add card", () => c.add({ title: "", body: "" }))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

export const TARGET_LOOK = {
  board: { name: "Board", thing: "board", icon: "board", bg: "var(--canary-tint)", fg: "#913d00" },
  arcade: { name: "Arcade", thing: "game", icon: "game", bg: "var(--scarlet-tint)", fg: "#7c0000" },
  sandbox: { name: "Sandbox", thing: "sandbox", icon: "cards", bg: "var(--park-tint)", fg: "#004e00" },
} as const;

// Posts laid out the way the chosen Padlet layout would show them.
function BoardPreview<T>({
  layout, posts, labels, render, add,
}: { layout: Layout; posts: T[]; labels: string[]; render: (post: T, i: number) => ReactNode; add: ReactNode }) {
  if (layout === "columns") {
    return (
      <div className="lay-columns">
        {posts.map((post, i) => (
          <div key={i} className="lay-col">
            <span className="lay-col-head">{labels[i]}</span>
            {render(post, i)}
          </div>
        ))}
        <div className="lay-col">{add}</div>
      </div>
    );
  }
  if (layout === "timeline") {
    return (
      <div className="lay-timeline">
        {posts.map((post, i) => (
          <div key={i} className="lay-tl-item">
            <span className="lay-tl-label tnum">{labels[i]}</span>
            {render(post, i)}
          </div>
        ))}
        <div className="lay-tl-item">
          <span className="lay-tl-label">&nbsp;</span>
          {add}
        </div>
      </div>
    );
  }
  return (
    <div className="lay-wall">
      {posts.map((post, i) => (
        <div key={i} className="lay-wall-item">
          {render(post, i)}
        </div>
      ))}
      <div className="lay-wall-item">{add}</div>
    </div>
  );
}

// Small pictures for the choices. Posts are white cards on a tinted board, like Padlet's format picker.
const POST = { fill: "#fff", stroke: "rgba(0,0,0,.12)" };
const WallArt = () => (
  <svg viewBox="0 0 120 80" aria-hidden="true">
    {[[8, 8, 30], [8, 42, 30], [45, 8, 20], [45, 32, 40], [82, 8, 40], [82, 52, 20]].map(([x, y, h], i) => (
      <rect key={i} x={x} y={y} width="30" height={h} rx="4" {...POST} />
    ))}
  </svg>
);
const ColumnsArt = () => (
  <svg viewBox="0 0 120 80" aria-hidden="true">
    {[8, 45, 82].map((x) => (
      <g key={x}>
        <rect x={x} y="6" width="30" height="8" rx="3" fill="rgba(120,72,16,.18)" />
        <rect x={x} y="18" width="30" height="18" rx="4" {...POST} />
        <rect x={x} y="40" width="30" height="14" rx="4" {...POST} />
      </g>
    ))}
  </svg>
);
const TimelineArt = () => (
  <svg viewBox="0 0 120 80" aria-hidden="true">
    <line x1="6" y1="40" x2="114" y2="40" stroke="rgba(0,0,0,.25)" strokeWidth="2" />
    {[14, 50, 86].map((x, i) => (
      <g key={x}>
        <circle cx={x + 10} cy="40" r="3" fill="#9466e8" />
        <rect x={x} y={i % 2 ? 46 : 10} width="20" height="24" rx="4" {...POST} />
      </g>
    ))}
  </svg>
);
const LAYOUTS: [Layout, string, string, () => ReactNode][] = [
  ["wall", "Wall", "Posts in a tidy brick layout", WallArt],
  ["columns", "Columns", "A column for each section", ColumnsArt],
  ["timeline", "Timeline", "Posts along a line, in order", TimelineArt],
];

const g = (children: ReactNode) => (
  <svg viewBox="0 0 48 32" aria-hidden="true" fill="none" stroke="#5c3a10" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);
const GAMES: [string, string, ReactNode][] = [
  ["multiple-choice-v2", "Multiple choice", g(<>{[8, 16, 24].map((y) => <g key={y}><circle cx="14" cy={y} r="2.5" fill={y === 16 ? "#9466e8" : "none"} stroke={y === 16 ? "#9466e8" : "#5c3a10"} /><path d={`M20 ${y}h16`} /></g>)}</>)],
  ["flashcards", "Flashcards", g(<><rect x="12" y="6" width="22" height="16" rx="3" fill="#fff" /><rect x="16" y="10" width="22" height="16" rx="3" fill="#fff4ce" /></>)],
  ["matching", "Matching", g(<>{[9, 23].map((y) => <rect key={"l" + y} x="8" y={y - 4} width="10" height="8" rx="2" fill="#fff" />)}{[9, 23].map((y) => <rect key={"r" + y} x="30" y={y - 4} width="10" height="8" rx="2" fill="#deffdd" />)}<path d="M18 9l12 14M18 23l12-14" stroke="#9466e8" /></>)],
  ["sequencing", "Sequencing", g(<>{[8, 20, 32].map((x, i) => <g key={x}><rect x={x - 4} y="11" width="9" height="10" rx="2" fill="#fff" /><text x={x + 0.5} y="19" fontSize="7" textAnchor="middle" fill="#5c3a10" stroke="none">{i + 1}</text></g>)}<path d="M15 16h3M27 16h3" /></>)],
  ["sorting", "Sorting", g(<><path d="M10 14v12h12V14M26 14v12h12V14" /><rect x="12" y="5" width="8" height="6" rx="2" fill="#fff4ce" /><rect x="28" y="5" width="8" height="6" rx="2" fill="#deffdd" /></>)],
  ["fill-in-the-blank", "Fill in the blank", g(<><path d="M6 12h12M30 12h12M6 22h14" /><path d="M20 12h8" stroke="#9466e8" strokeDasharray="2 2" /></>)],
  ["short-answer", "Short answer", g(<><path d="M8 10h22M8 18h30" /><path d="M8 26h14" stroke="#9466e8" /></>)],
  ["memory-tiles", "Memory tiles", g(<>{[[10, 5], [26, 5], [10, 18], [26, 18]].map(([x, y], i) => <rect key={i} x={x} y={y} width="12" height="10" rx="2" fill={i === 1 ? "#eed8ff" : "#fff"} />)}</>)],
  ["word-search", "Word search", g(<><rect x="10" y="4" width="28" height="24" rx="3" fill="#fff" /><path d="M14 12h20M14 20h20" stroke="rgba(0,0,0,.15)" /><path d="M14 12h14" stroke="#9466e8" strokeWidth="4" opacity=".5" /></>)],
  ["crossword", "Crossword", g(<>{[[10, 12], [18, 12], [26, 12], [34, 12], [18, 4], [18, 20]].map(([x, y], i) => <rect key={i} x={x} y={y} width="8" height="8" fill="#fff" />)}</>)],
];
