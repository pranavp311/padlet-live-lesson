"use client";

import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { DiagramView } from "@/components/Diagram";
import { DiagramViewer } from "@/components/DiagramViewer";
import { Bubbles } from "@/components/Bubbles";
import { SendPage, TARGET_LOOK, type Target } from "@/components/SendPage";
import { Created, Toast, demoNote } from "@/components/Created";
import type { LessonExport } from "@/app/api/export/route";
import { Brand, Icon, MicBars, Notice, SubjectTile, TodoItem } from "@/components/Bits";
import { KIND_LABEL, type Diagram } from "@/lib/diagram";
import { formatClock, type Sentence } from "@/lib/transcript";
import { downloadBlob, slug, transcriptText } from "@/lib/files";
import type { LessonSummary } from "@/lib/history";
import type { useLesson } from "@/lib/useLesson";

type L = ReturnType<typeof useLesson>;

const today = () => new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short" });

// Start page: every saved lesson as a card, newest first. "New lesson" opens a small dialog for the title; a card's
// trash button asks before deleting it.
export function Ready({
  l, lessons, onOpen, onDelete,
}: { l: L; lessons: LessonSummary[] | null; onOpen: (id: string) => void; onDelete: (id: string) => boolean }) {
  const [asking, setAsking] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const [doomed, setDoomed] = useState<LessonSummary | null>(null);
  const [deleteFailed, setDeleteFailed] = useState(false);
  const confirm = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (doomed) confirm.current?.showModal();
    else confirm.current?.close();
    setDeleteFailed(false);
  }, [doomed]);
  const deleteDoomed = () => {
    if (!doomed) return;
    // The browser can refuse (storage blocked): say so and leave the lesson where it is.
    if (!onDelete(doomed.id)) return setDeleteFailed(true);
    setDoomed(null);
    // The trash button that opened the dialog is gone; keep keyboard focus on the dashboard, not the page top.
    requestAnimationFrame(() => (document.querySelector<HTMLElement>(".lesson-card") ?? document.querySelector<HTMLElement>(".new-lesson"))?.focus());
  };
  const open = () => {
    l.clearError();
    setAsking(true);
  };
  useEffect(() => {
    if (asking) dialog.current?.showModal();
    else dialog.current?.close();
  }, [asking]);
  const newLesson = (
    <button className="btn new-lesson" onClick={open}>
      <Icon name="plus" />
      New lesson
    </button>
  );

  return (
    <div className="wall">
      <header className="hdr">
        <Brand />
        <span className="spacer" />
        {!!lessons?.length && newLesson}
      </header>
      <main className="dash">
        {lessons === null ? null : lessons.length ? (
          <>
            <div className="dash-head">
              <h1 className="h1">Lessons</h1>
              <span className="t14 tnum">{lessons.length}</span>
            </div>
            <div className="lesson-grid">
              {lessons.map((x) => (
                <LessonCard key={x.id} x={x} onOpen={() => onOpen(x.id)} onDelete={() => setDoomed(x)} />
              ))}
            </div>
          </>
        ) : (
          <div className="dash-empty">
            <Bubbles size={120} />
            <h1 className="h1">No lessons here yet</h1>
            <p className="muted">Start a lesson with Bubbles.</p>
            {newLesson}
          </div>
        )}
      </main>

      <dialog ref={dialog} className="dialog new-dialog" onClose={() => setAsking(false)} onClick={(e) => e.target === e.currentTarget && setAsking(false)}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void l.start();
          }}
        >
          <div className="dialog-head">
            <h2 className="h2">New lesson</h2>
            <button type="button" className="btn btn-ghost btn-icon" aria-label="Close" onClick={() => setAsking(false)}>
              <Icon name="x" />
            </button>
          </div>
          <div className="new-body">
            <input className="input" aria-label="Lesson title" placeholder="Lesson title (optional)" autoFocus value={l.title} onChange={(e) => l.setTitle(e.target.value)} />
            {l.error && <Notice error={l.error} />}
            <button className="cta" type="submit" disabled={l.starting}>
              <Icon name="mic" size={22} />
              {l.starting ? "Waiting for microphone…" : l.error ? "Try again" : "Start lesson"}
            </button>
          </div>
        </form>
      </dialog>

      <dialog ref={confirm} className="dialog confirm-dialog" onClose={() => setDoomed(null)} onClick={(e) => e.target === e.currentTarget && setDoomed(null)}>
        {doomed && (
          <div className="confirm-body">
            <span className="confirm-icon" aria-hidden="true">
              <Icon name="trash" size={26} />
            </span>
            <h2 className="h2">Delete this lesson?</h2>
            <p className="muted">
              <strong>{doomed.title}</strong> will be removed from this browser, with its transcript, diagrams and to-dos. This can’t be undone.
            </p>
            {deleteFailed && (
              <p className="confirm-error" role="alert">
                This browser wouldn’t delete it. Its storage may be blocked.
              </p>
            )}
            <div className="confirm-actions">
              <button className="btn btn-soft" autoFocus onClick={() => setDoomed(null)}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={deleteDoomed}>
                Delete
              </button>
            </div>
          </div>
        )}
      </dialog>
    </div>
  );
}

function LessonCard({ x, onOpen, onDelete }: { x: LessonSummary; onOpen: () => void; onDelete: () => void }) {
  const mins = Math.max(1, Math.round((x.endedAt - x.startedAt) / 60000));
  const date = new Date(x.startedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return (
    <div className="lesson-wrap">
      <button className="lesson-card" onClick={onOpen}>
        <span className="lesson-cover">
          {x.cover ? <DiagramView d={x.cover} still /> : <SubjectTile subject={x.subject} size={64} />}
        </span>
        <span className="lesson-info">
          <span className="lesson-title">
            <SubjectTile subject={x.subject} size={28} />
            <span className="t17">{x.title}</span>
          </span>
          <span className="t14 tnum">
            {date} · {mins} min
          </span>
          {(x.diagrams > 0 || (x.todos ?? 0) > 0) && (
            <span className="lesson-tags">
              {x.diagrams > 0 && <span className="tag">{x.diagrams} diagram{x.diagrams > 1 ? "s" : ""}</span>}
              {(x.todos ?? 0) > 0 && <span className="tag">{x.todos} to-do{x.todos! > 1 ? "s" : ""}</span>}
            </span>
          )}
        </span>
      </button>
      {/* A sibling of the card, not inside it: a button can't hold another button. */}
      <button className="lesson-delete" aria-label={`Delete ${x.title}`} title="Delete lesson" onClick={onDelete}>
        <Icon name="trash" size={18} />
      </button>
    </div>
  );
}

export function Warming({ l }: { l: L }) {
  return (
    <div className="wall">
      <header className="hdr">
        <Brand />
        <span className="spacer" />
        <button className="btn btn-tint" onClick={l.cancel}>
          Cancel
        </button>
      </header>
      <main className="center">
        <div className="panel warm">
          <SubjectTile subject={l.subject} size={56} />
          <h1 className="warm-title">{l.title || "Live lesson"}</h1>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
            <MicBars level={l.level} big />
            <div className="progress">
              <div />
            </div>
            {l.error ? <Notice error={l.error} action="Back" onAction={l.cancel} /> : <p className="muted">Getting ready… start talking anytime.</p>}
          </div>
        </div>
      </main>
    </div>
  );
}

function useClock(from: number, running: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);
  return (now - from) / 1000;
}

type Block = { kind: "para"; sentences: Sentence[] } | { kind: "diagram"; d: Diagram };

// Sentences grouped into paragraphs of up to 3, broken wherever a filed diagram appeared or the teacher went quiet.
// A paragraph closes after three sentences, or sooner once it's long: long sentences would otherwise grow the live
// card past the top of the screen.
const PARA_CHARS = 240;
// Counted on what was heard, not the tidied text, so paragraphs don't reflow when a tidy-up lands.
const full = (para: Sentence[]) => para.length >= 3 || para.reduce((n, x) => n + x.raw.length, 0) >= PARA_CHARS;

function blocks(sentences: Sentence[], archive: Diagram[], ends: number[]): Block[] {
  const out: Block[] = [];
  const marks = [...archive].sort((a, b) => a.t - b.t);
  let para: Sentence[] = [];
  const flush = () => {
    if (para.length) out.push({ kind: "para", sentences: para });
    para = [];
  };
  for (const s of sentences) {
    while (marks.length && marks[0].t <= s.t) {
      flush();
      out.push({ kind: "diagram", d: marks.shift()! });
    }
    if (full(para)) flush();
    para.push(s);
    if (ends.includes(s.id)) flush();
  }
  flush();
  marks.forEach((d) => out.push({ kind: "diagram", d }));
  return out;
}

export function Live({ l }: { l: L }) {
  const secs = useClock(l.startedAt, true);
  const all = blocks(l.sentences, l.archive, l.paraEnds);
  const last = all[all.length - 1];
  // The words still being said join the latest paragraph, or start a new one. The live card is always the last thing
  // in the transcript: after a diagram, or once the teacher has gone quiet, the paragraph before it is settled and a
  // fresh live card opens below.
  const closed = last?.kind === "para" && l.paraEnds.includes(last.sentences[last.sentences.length - 1].id);
  const latestOpen = last?.kind === "para" && !full(last.sentences) && !closed;
  const newCard = !!l.pending.trim() || ((last?.kind === "diagram" || closed) && l.sentences.length > 0);
  const shown: Block[] = latestOpen || !newCard ? all : [...all, { kind: "para", sentences: [] }];
  const paras = shown.map((b, i) => ({ b, i })).filter(({ b }) => b.kind === "para");
  const nowIdx = paras.length ? paras[paras.length - 1].i : -1;
  const landedFrom = Math.max(0, shown.findIndex((b) => b.kind === "para" && l.landing !== null && (b.sentences[0]?.id ?? 0) < l.landing));
  const d = l.current;

  // The sentence the teacher is correcting, and what they've typed so far: kept here so the text survives
  // its card regrouping (a new paragraph or diagram re-splits the cards) while they type.
  const [editing, setEditing] = useState<number | null>(null);
  const draft = useRef<{ id: number; text: string } | null>(null);
  const editingAtPress = useRef(false);
  // Where the caret lands in the sentence being opened: the end, or the start when arrowing into the next one.
  const caretAt = useRef<"start" | "end">("end");
  const stopEditing = (id: number, value: string | null) => {
    if (value !== null) l.editSentence(id, value);
    draft.current = null;
    caretAt.current = "end";
    setEditing((e) => (e === id ? null : e));
  };
  const editAt = (id: number, where: "start" | "end") => {
    caretAt.current = where;
    setEditing(id);
  };
  // A sentence that left the transcript while being corrected (hidden by a catch-up): keep what was typed, stop editing.
  const editingShown =
    editing === null || (l.catchUp === null && shown.some((b) => b.kind === "para" && b.sentences.some((x) => x.id === editing)));

  // The whole transcript scrolls. While the teacher is at the bottom it follows the latest words; once they scroll up
  // (to reread or correct something) it stays put, and "Jump to latest" brings them back.
  const scroller = useRef<HTMLElement>(null);
  const follow = useRef(true);
  const [behind, setBehind] = useState(false);
  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    setBehind(!follow.current);
  };
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (follow.current) el.scrollTop = el.scrollHeight;
    else setBehind(true);
  }, [l.sentences, l.pending, l.archive, l.catchUp]);
  const toLatest = () => {
    follow.current = true;
    setBehind(false);
    // Instant: a smooth scroll's own scroll events would read as "scrolled up" while speech keeps arriving.
    if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
  };
  useEffect(() => {
    if (editingShown || editing === null) return;
    stopEditing(editing, draft.current?.id === editing ? draft.current.text : null);
  });

  // The panel shows the live diagram unless the teacher steps back (‹ ›) through earlier ones.
  const list = useMemo(() => (d ? [...l.archive, d] : l.archive), [d, l.archive]);
  const [view, setView] = useState<number | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  // Pinned: the panel rests on the pinned diagram instead of the newest one.
  const pinnedIdx = l.pinnedId ? list.findIndex((x) => x.id === l.pinnedId) : -1;
  const pinned = pinnedIdx >= 0;
  useEffect(() => {
    if (!l.pinnedId) setView(null); // a new diagram brings the panel back to live, unless one is pinned
  }, [d?.id, l.pinnedId]);
  const home = pinned ? pinnedIdx : d ? list.length - 1 : null;
  const shownIdx = view ?? home;
  const panelD = shownIdx === null ? null : list[shownIdx];
  const isLive = view === null && !!d && !pinned;
  const step = (by: number) => {
    const next = Math.min(list.length - 1, Math.max(0, (shownIdx ?? list.length) + by));
    setView(next === home ? null : next);
  };

  // Diagrams drawn while pinned that haven't been looked at yet, for the green badge.
  const [seen, setSeen] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    // Not pinned: the panel follows the newest diagram, so everything counts as seen.
    // Only set state when something is actually new, or this effect (which depends on `seen`) loops.
    if (!pinned) {
      if (list.some((x) => !seen.has(x.id))) setSeen(new Set(list.map((x) => x.id)));
    } else if (panelD && !seen.has(panelD.id)) setSeen((s) => new Set(s).add(panelD.id));
  }, [pinned, list, panelD, seen]);
  const unseen = pinned ? list.filter((x) => !seen.has(x.id)) : [];

  return (
    <div className="wall" style={{ height: "100vh", overflow: "hidden" }}>
      <header className="hdr">
        <Brand />
        <span className="spacer" />
        <div className="pill">
          <span className="rec" style={l.muted ? { background: "#b5b5b5" } : undefined} />
          <span className="tnum">{formatClock(secs)}</span>
          <MicBars level={l.level} />
        </div>
        <button className="btn btn-dark" onClick={() => void l.end()} disabled={l.ending}>
          {l.ending ? "Ending…" : "End lesson"}
        </button>
      </header>
      <div className="lesson-head">
        <SubjectTile subject={l.subject} />
        <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
          <span className="eyebrow">Live lesson · {today()}</span>
          <h1 className="h1">{l.title || d?.title || "Live lesson"}</h1>
        </div>
        {l.todos.length > 0 && (
          <div className="todos" aria-label="To do">
            {l.todos.map((t) => (
              <TodoItem key={t.id} todo={t} />
            ))}
          </div>
        )}
      </div>
      {l.error && (
        <div className="live-notice">
          <Notice error={l.error} action="End lesson" onAction={() => void l.end()} />
        </div>
      )}
      <main className="live">
        <div className="transcript-wrap">
          <section ref={scroller} className="transcript" aria-label="Transcript" aria-live="polite" onScroll={onScroll}>
            {/* Speech held during a cold start is written up out of sight, then lands in one go. */}
            {l.catchUp !== null && (
              <div className="catchup">
                <span>Catching up…</span>
                <div className="meter" role="progressbar" aria-label="Catching up" aria-valuenow={Math.round(l.catchUp * 100)}>
                  <div style={{ width: `${Math.max(4, l.catchUp * 100)}%` }} />
                </div>
              </div>
            )}
            {l.catchUp === null && shown.map((b, idx) => {
              if (b.kind === "diagram") return <Thumb key={b.d.id} d={b.d} onOpen={() => setOpen(list.indexOf(b.d))} />;
              const age = paras.filter((p) => p.i > idx).length;
              const isNow = idx === nowIdx;
              const text = b.sentences.map((s) => s.clean ?? s.raw).join(" ");
              const landed = l.landing !== null && (b.sentences[0]?.id ?? 0) < l.landing; // part of the caught-up chunk
              // Its place in that chunk, which settles in oldest first; capped so a long backlog's last cards (the ones
              // on screen) finish within the landing time instead of popping in late.
              const k = Math.min(idx - landedFrom, 7);
              const startPending = () => {
                const id = l.editPending();
                if (id !== null) setEditing(id);
              };
              // A click anywhere on a card edits its last sentence (the rough words on the live card), except
              // the strip beside the mute button.
              const editCard = (e: MouseEvent<HTMLParagraphElement>) => {
                const t = e.target as HTMLElement;
                // A press that ended an edit (its blur saved it) only saves; it doesn't open another.
                if (editingAtPress.current || t.closest(".editable, .editing, .mute")) return;
                if (isNow) {
                  const pad = parseFloat(getComputedStyle(e.currentTarget).paddingRight);
                  if (e.clientX > e.currentTarget.getBoundingClientRect().right - pad) return;
                }
                if (isNow && l.pending.trim()) startPending();
                else if (b.sentences.length) setEditing(b.sentences[b.sentences.length - 1].id);
              };
              return (
                <p
                  key={b.sentences[0]?.id ?? "now"}
                  className={`para ${isNow ? "now" : age === 1 ? "old1" : "old2"}${landed ? " landed" : ""}`}
                  style={landed ? ({ "--i": k } as CSSProperties) : undefined}
                  onPointerDown={() => (editingAtPress.current = editing !== null)}
                  onClick={editCard}
                >
                  {b.sentences[0] && (
                    <time className="para-time tnum" aria-hidden="true">
                      {formatClock(b.sentences[0].t)}
                    </time>
                  )}
                  {b.sentences.map((x, j) => (
                    <Fragment key={x.id}>
                      {j > 0 && " "}
                      <EditableText
                        text={x.clean ?? x.raw}
                        draft={draft.current?.id === x.id ? draft.current.text : undefined}
                        editing={editing === x.id}
                        caret={caretAt.current}
                        onStart={() => setEditing(x.id)}
                        onType={(text) => (draft.current = { id: x.id, text })}
                        onDone={(v) => stopEditing(x.id, v)}
                        onEnter={isNow ? l.closeCard : undefined}
                        // The arrow keys carry on into the card's other sentences, and from its last into the words
                        // still arriving.
                        onPrev={j > 0 ? () => editAt(b.sentences[j - 1].id, "end") : undefined}
                        onNext={
                          j < b.sentences.length - 1
                            ? () => editAt(b.sentences[j + 1].id, "start")
                            : isNow && /[\p{L}\p{N}]/u.test(l.pending) // a lone closing mark joins the sentence, leaving nothing to edit
                              ? () => {
                                  const id = l.editPending();
                                  if (id !== null) editAt(id, "start");
                                }
                              : undefined
                        }
                      />
                    </Fragment>
                  ))}
                  {isNow && (
                    <>
                      {text && l.pending ? " " : ""}
                      {l.pending.trim() && (
                        <span
                          className="rough editable"
                          role="button"
                          tabIndex={0}
                          title="Click to correct"
                          onClick={startPending}
                          onKeyDown={(e) => e.key === "Enter" && startPending()}
                        >
                          {l.pending.trim()}
                        </span>
                      )}
                      {!l.muted && editing === null && <span className="caret" aria-hidden="true" />}
                      <MuteButton muted={l.muted} onToggle={l.toggleMute} />
                    </>
                  )}
                </p>
              );
            })}
            {l.catchUp === null && !l.sentences.length && !l.pending && (
              <p className="para now hint">
                {l.muted ? "Muted." : "Start talking. Your words appear here."}
                <MuteButton muted={l.muted} onToggle={l.toggleMute} />
              </p>
            )}
          </section>
          {behind && (
            <button className="to-latest" onClick={toLatest}>
              <Icon name="down" size={16} />
              Jump to latest
            </button>
          )}
        </div>

        <section className="dpanel" aria-label="Diagram">
          {/* Bubbles lives in the corner for the whole lesson: breathing when idle, scribbling while drawing. */}
          <div className="drawing-corner" role={l.drawing || l.listening ? "status" : undefined}>
            {l.drawing ? (
              <>
                <span className="drawing-caption">Drawing…</span>
                <StopButton onStop={l.stopDrawing} />
              </>
            ) : l.listening ? (
              <>
                <span className="drawing-caption">Listening…</span>
                {l.asking && <StopButton onStop={l.stopDrawing} />}
              </>
            ) : (
              l.bubblesNote && <span className="bubbles-note">{l.bubblesNote}</span>
            )}
            <Bubbles size={92} mood={l.drawing ? "drawing" : l.listening ? "listening" : "idle"} />
          </div>
          <div className="dpanel-head">
            {list.length > 1 && (
              <>
                <button className="btn btn-ghost btn-icon" aria-label="Previous diagram" onClick={() => step(-1)} disabled={shownIdx === 0}>
                  <Icon name="left" />
                </button>
                <button className="btn btn-ghost btn-icon" aria-label="Next diagram" onClick={() => step(1)} disabled={isLive || shownIdx === list.length - 1}>
                  <Icon name="right" />
                </button>
              </>
            )}
            <h2 className="h2">{panelD?.title ?? ""}</h2>
            {view !== null && d && (
              <button className="btn btn-ghost" onClick={() => setView(null)}>
                {pinned ? "Back to pinned" : "Back to live"}
              </button>
            )}
            <button className="btn btn-ghost" onClick={l.drawThis} disabled={!l.sentences.length || l.drawing}>
              <Icon name="pen" />
              Draw this
            </button>
            {panelD && (
              <button
                className="btn btn-ghost"
                aria-pressed={panelD.id === l.pinnedId}
                onClick={() => {
                  setView(null);
                  l.togglePin(panelD.id);
                }}
              >
                <Icon name="pin" />
                {panelD.id === l.pinnedId ? "Pinned" : "Pin"}
              </button>
            )}
            {isLive && (
              <button className="btn btn-ghost btn-icon" aria-label="Dismiss" onClick={l.dismiss}>
                <Icon name="x" />
              </button>
            )}
            {unseen.length > 0 && (
              <button
                className="unseen"
                aria-label={`${unseen.length} new diagram${unseen.length > 1 ? "s" : ""} while pinned`}
                title="New while pinned"
                onClick={() => setView(list.indexOf(unseen[0]))}
              >
                {unseen.length}
              </button>
            )}
          </div>
          {panelD ? (
            <>
              <button className="dpanel-body clickable" style={{ background: "none" }} aria-label={`Open ${panelD.title}`} onClick={() => setOpen(shownIdx)}>
                <DiagramView d={panelD} still={!isLive} />
              </button>
              <div>
                <span className="chip tnum" style={{ background: "var(--grape-tint)", color: "#520085" }}>
                  {KIND_LABEL[panelD.kind]} · {formatClock(panelD.t)}
                </span>
              </div>
            </>
          ) : l.drawing ? (
            <div className="drawing" aria-hidden="true">
              <span className="dot" />
              <span className="dot" />
              <span className="dot" />
            </div>
          ) : (
            <div className="dpanel-empty">
              Diagrams appear here as you explain.
              <span style={{ fontSize: 15 }}>Or ask: “Bubbles, draw the water cycle.”</span>
            </div>
          )}
        </section>
      </main>
      <DiagramViewer diagrams={list} index={open} onIndex={setOpen} onClose={() => setOpen(null)} />
    </div>
  );
}

// Mute sits in the card with the words being said: muted, the mic is ignored and nothing is transcribed.
function MuteButton({ muted, onToggle }: { muted: boolean; onToggle: () => void }) {
  return (
    <button className={muted ? "mute mute-on" : "mute"} aria-pressed={muted} aria-label={muted ? "Unmute" : "Mute"} title={muted ? "Unmute" : "Mute"} onClick={onToggle}>
      <Icon name={muted ? "micOff" : "mic"} size={22} />
      {muted && "Muted"}
    </button>
  );
}

// Where the caret is in a box being edited: at its start or end, and on its first or last line. Null with a selection.
function caretPlace(el: HTMLElement) {
  const sel = window.getSelection();
  if (!sel?.rangeCount || !sel.isCollapsed) return null;
  const range = sel.getRangeAt(0);
  const before = document.createRange();
  before.selectNodeContents(el);
  before.setEnd(range.endContainer, range.endOffset);
  const offset = before.toString().length;
  const start = offset === 0;
  const end = offset === (el.textContent ?? "").length;
  const lines = el.getClientRects();
  // A collapsed caret often has no box (at the end of the text, say), so measure the character beside it. The caret
  // can sit on the box itself, before or after its text, rather than in the text.
  let node = range.endContainer;
  let i = range.endOffset;
  if (node.nodeType !== Node.TEXT_NODE) {
    const [prev, next] = [node.childNodes[i - 1], node.childNodes[i]];
    if (prev?.nodeType === Node.TEXT_NODE) [node, i] = [prev, (prev.textContent ?? "").length];
    else if (next?.nodeType === Node.TEXT_NODE) [node, i] = [next, 0];
  }
  const probe = document.createRange();
  if (node.nodeType === Node.TEXT_NODE && (i > 0 || i < (node.textContent ?? "").length)) {
    probe.setStart(node, i > 0 ? i - 1 : i);
    probe.setEnd(node, i > 0 ? i : i + 1);
  }
  const rects = probe.collapsed ? range.getClientRects() : probe.getClientRects();
  const at = rects[rects.length - 1];
  if (!at || !lines.length) return { start, end, firstLine: start, lastLine: end };
  const mid = (at.top + at.bottom) / 2;
  return { start, end, firstLine: mid < lines[0].bottom, lastLine: mid > lines[lines.length - 1].top };
}

// What's in a box being edited, as one line: a line break (pasted, or put in by a dictation app) becomes a space
// rather than vanishing and joining two words.
const typed = (el: HTMLElement) => el.innerText.replace(/\s+/g, " ");

// Transcript text the teacher can correct in place: click to edit; Enter or clicking away saves, Escape
// cancels (onDone gets null). Saving an empty sentence removes it. At its edges, the arrow keys (and Backspace and
// Delete) save it and move on to the sentence before or after (onPrev, onNext).
function EditableText({
  text, draft, editing, caret = "end", onStart, onType, onDone, onPrev, onNext, onEnter,
}: {
  text: string;
  draft?: string; // typed before this box remounted
  editing: boolean;
  caret?: "start" | "end";
  onStart: () => void;
  onType: (text: string) => void;
  onDone: (value: string | null) => void;
  onPrev?: () => void;
  onNext?: () => void;
  onEnter?: () => void; // saved with Enter, rather than by clicking away or arrowing on
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const done = useRef(false);
  // Frozen while editing, so a tidy-up landing mid-edit can't replace the text under the cursor.
  const [frozen, setFrozen] = useState<string | null>(null);
  if (editing && frozen === null) setFrozen(draft ?? text);
  if (!editing && frozen !== null) setFrozen(null);
  useEffect(() => {
    if (!editing || !ref.current) return;
    done.current = false;
    ref.current.focus();
    // Caret at the end, ready to type (or at the start, arriving from the sentence before).
    const range = document.createRange();
    range.selectNodeContents(ref.current);
    range.collapse(caret === "start");
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }, [editing, caret]);
  const finish = (value: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(value);
  };
  const enter = (el: HTMLElement) => {
    if (done.current) return;
    finish(typed(el));
    onEnter?.();
  };
  if (!editing) {
    return (
      <span className="editable" role="button" tabIndex={0} title="Click to correct" onClick={onStart} onKeyDown={(e) => e.key === "Enter" && onStart()}>
        {text}
      </span>
    );
  }
  return (
    <>
    <span
      ref={ref}
      className="editing"
      contentEditable
      spellCheck={false}
      suppressContentEditableWarning
      role="textbox"
      aria-label="Correct transcript"
      data-placeholder="Type the correction"
      onInput={(e) => {
        // A sentence is one line: a line break that got past onKeyDown (Shift+Enter, a dictation app, an input method)
        // saves it, like Enter.
        const { inputType, data } = e.nativeEvent as InputEvent;
        if (inputType === "insertParagraph" || inputType === "insertLineBreak" || data?.includes("\n")) return enter(e.currentTarget);
        // Keep :empty working for the placeholder once everything is deleted.
        if (!e.currentTarget.textContent) e.currentTarget.innerHTML = "";
        onType(typed(e.currentTarget));
      }}
      onKeyDown={(e) => {
        const el = e.currentTarget;
        // Shift (selecting), Alt/Cmd/Ctrl (word and line jumps) and typing with an input method keep their usual meaning.
        const plain = !(e.shiftKey || e.altKey || e.metaKey || e.ctrlKey || e.nativeEvent.isComposing);
        const at = plain ? caretPlace(el) : null;
        const back = at && ((at.start && (e.key === "ArrowLeft" || e.key === "Backspace")) || (at.firstLine && e.key === "ArrowUp"));
        const on = at && ((at.end && (e.key === "ArrowRight" || e.key === "Delete")) || (at.lastLine && e.key === "ArrowDown"));
        const move = back ? onPrev : on ? onNext : undefined;
        // Not the Enter that picks an input method's word (Safari sends it after composing ends, as key code 229).
        if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) {
          e.preventDefault();
          enter(el);
        } else if (e.key === "Escape") finish(null);
        else if (move) {
          e.preventDefault();
          finish(typed(el));
          move();
        }
      }}
      onBlur={(e) => finish(typed(e.currentTarget))}
    >
      {frozen ?? text}
    </span>
    <span className="edit-hint" aria-hidden="true">
      <kbd>↵</kbd> to save · <kbd>Esc</kbd> to cancel
    </span>
    </>
  );
}

function StopButton({ onStop }: { onStop: () => void }) {
  return (
    <button className="btn btn-stop" onClick={onStop}>
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
        <rect width="12" height="12" rx="2.5" fill="currentColor" />
      </svg>
      Stop
    </button>
  );
}

function Thumb({ d, onOpen }: { d: Diagram; onOpen: () => void }) {
  return (
    <button className="thumb clickable" onClick={onOpen} aria-label={`Open ${d.title}`}>
      <span className="thumb-img">
        <DiagramView d={d} still />
      </span>
      <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span className="thumb-title">{d.title}</span>
        <span className="thumb-time tnum">{formatClock(d.t)}</span>
      </span>
    </button>
  );
}


// Everything the summary screen needs; the live lesson hook and a saved lesson both provide it.
export type EndedData = Pick<L, "title" | "subject" | "startedAt" | "endedAt" | "sentences" | "archive" | "todos" | "lessonExport"> & {
  exportError?: string | null;
  saveFailed?: boolean;
  retryExport?: () => Promise<void>;
  updateTargets?: (next: LessonExport["targets"]) => void; // saves the teacher's edits from the send review
};

const GALLERY_START = 8;

export function Ended({ l, onDone, doneLabel = "New lesson" }: { l: EndedData; onDone: () => void; doneLabel?: string }) {
  const e = l.lessonExport;
  const [openDiagram, setOpenDiagram] = useState<number | null>(null);
  const [allDiagrams, setAllDiagrams] = useState(false);
  const title = l.title || e?.title || "Lesson";
  const mins = Math.max(1, Math.round((l.endedAt - l.startedAt) / 60000));
  const [created, setCreated] = useState<Partial<Record<Target, boolean>>>({});
  const [reviewing, setReviewing] = useState<Target | null>(null);
  const [celebrating, setCelebrating] = useState<Target | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const hideToast = useCallback(() => setToast(null), []);

  const downloadTranscript = () =>
    downloadBlob(new Blob([transcriptText(title, l.startedAt, l.sentences)], { type: "text/plain" }), `${slug(title)}-transcript.txt`);

  const targets: { key: Target; name: string; icon: "board" | "game" | "cards"; bg: string; fg: string; count?: string }[] = [
    { key: "board", name: "Board", icon: "board", bg: "var(--canary-tint)", fg: "#913d00", count: e ? `${e.targets.board.posts.length} posts` : undefined },
    { key: "arcade", name: "Arcade", icon: "game", bg: "var(--scarlet-tint)", fg: "#7c0000", count: e ? `${e.targets.arcade.questions.length} questions` : undefined },
    { key: "sandbox", name: "Sandbox", icon: "cards", bg: "var(--park-tint)", fg: "#004e00", count: e ? `${e.targets.sandbox.cards.length} cards` : undefined },
  ];

  if (reviewing && e) {
    return (
      <SendPage
        target={reviewing}
        lessonTitle={title}
        sections={e.sections}
        targets={e.targets}
        diagrams={l.archive}
        onBack={() => setReviewing(null)}
        onSend={(next) => {
          l.updateTargets?.(next);
          setCreated((s) => ({ ...s, [reviewing]: true }));
          setCelebrating(reviewing);
          setReviewing(null);
        }}
      />
    );
  }

  return (
    <div className="wall">
      <header className="hdr">
        <Brand />
        <span className="spacer" />
        <button className="btn btn-dark" onClick={onDone}>
          {doneLabel}
        </button>
      </header>
      <div className="lesson-head">
        <SubjectTile subject={l.subject} />
        <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
          <span className="eyebrow tnum">
            {today()} · {mins} min
          </span>
          <h1 className="h1">{title}</h1>
        </div>
      </div>

      <main className="ended">
        <div className="grid">
          {targets.map((t) => (
            <div key={t.key} className="card target">
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <span className="target-tile" style={{ background: t.bg, color: t.fg }}>
                  <Icon name={t.icon} size={22} />
                </span>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span className="t17">{t.name}</span>
                  {t.count ? <span className="t14">{t.count}</span> : <span className="skel" style={{ height: 14, width: 72, marginTop: 3 }} />}
                </div>
              </div>
              {created[t.key] ? (
                <div style={{ height: 40, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span className="sent">
                    <Icon name="check" />
                    Created
                  </span>
                  <button className="btn btn-soft" onClick={() => setToast(demoNote(t.key))}>
                    Go to {TARGET_LOOK[t.key].name}
                  </button>
                </div>
              ) : (
                <button className="btn btn-dark" disabled={!e} onClick={() => setReviewing(t.key)}>
                  Create
                </button>
              )}
            </div>
          ))}
          <div className="card target" style={{ boxShadow: "inset 0 0 0 1px #ebecef" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <span className="target-tile" style={{ background: "var(--surface)" }}>
                <Icon name="text" size={22} />
              </span>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span className="t17">Transcript</span>
                <span className="t14">{l.sentences.length} sentences</span>
              </div>
            </div>
            <button className="btn btn-soft" onClick={downloadTranscript}>
              <Icon name="download" />
              Download
            </button>
          </div>
        </div>
        {l.saveFailed && <p className="err">This browser didn&apos;t save the lesson. Download it to keep a copy.</p>}
        {l.exportError && l.retryExport && (
          <p className="err" style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {l.exportError}
            <button className="btn btn-soft" onClick={() => void l.retryExport?.()}>
              Try again
            </button>
          </p>
        )}

        {l.archive.length > 0 && (
          <section style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div className="dash-head">
              <h2 className="h2" style={{ flex: "none" }}>Diagrams</h2>
              <span className="t14 tnum">{l.archive.length}</span>
            </div>
            <div className="grid">
              {/* Two rows to start with; a long lesson's diagrams shouldn't push the rest of the summary far down. */}
              {(allDiagrams ? l.archive : l.archive.slice(0, GALLERY_START)).map((d, i) => (
                <button key={d.id} className="card gal clickable" onClick={() => setOpenDiagram(i)} aria-label={`Open ${d.title}`}>
                  <span className="gal-img">
                    <DiagramView d={d} still />
                  </span>
                  <span className="gal-meta">
                    <span className="t17">{d.title}</span>
                    <span className="t14 tnum" style={{ lineHeight: "24px" }}>
                      {formatClock(d.t)}
                    </span>
                  </span>
                </button>
              ))}
            </div>
            {l.archive.length > GALLERY_START && (
              <button className="btn btn-soft" style={{ alignSelf: "center" }} onClick={() => setAllDiagrams((v) => !v)}>
                {allDiagrams ? "Show fewer" : `Show all ${l.archive.length}`}
              </button>
            )}
          </section>
        )}

        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: 16 }}>
          <section className="sections">
            <h2 className="h2">Sections</h2>
            <div className="scroll-list">
            {e
              ? e.sections.map((s) => (
                  <div key={s.heading} className="sec">
                    <span className="sec-time tnum">{formatClock(s.start_s)}</span>
                    <div>
                      <div className="t17">{s.heading}</div>
                      <p>{s.summary}</p>
                    </div>
                  </div>
                ))
              : [0, 1, 2].map((i) => <span key={i} className="skel" style={{ height: 64 }} />)}
            </div>
          </section>
          <div style={{ flex: "1 1 280px", display: "flex", flexDirection: "column", gap: 16 }}>
          {l.todos.length > 0 && (
            <section className="sections" style={{ flex: "none", gap: 20 }}>
              <h2 className="h2">To do</h2>
              <div className="todo-list">
                {l.todos.map((t) => (
                  <TodoItem key={t.id} todo={t} size={36} />
                ))}
              </div>
            </section>
          )}
          <section className="terms">
            <h2 className="h2">Key terms</h2>
            {e ? (
              <dl className="scroll-list">
                {e.key_terms.map((k) => (
                  <div key={k.term}>
                    <dt>{k.term}</dt>
                    <dd>{k.definition}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              [0, 1, 2, 3].map((i) => <span key={i} className="skel" style={{ height: 40 }} />)
            )}
          </section>
          </div>
        </div>
      </main>

      <DiagramViewer diagrams={l.archive} index={openDiagram} onIndex={setOpenDiagram} onClose={() => setOpenDiagram(null)} />
      <Created
        target={celebrating}
        onDone={() => setCelebrating(null)}
        onGo={() => {
          setToast(demoNote(celebrating!));
          setCelebrating(null);
        }}
      />
      <Toast text={toast} onHide={hideToast} />
    </div>
  );
}
