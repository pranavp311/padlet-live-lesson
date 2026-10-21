"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from "react";
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

// Start page: every saved lesson as a card, newest first. "New lesson" opens a small dialog for the title.
export function Ready({ l, lessons, onOpen }: { l: L; lessons: LessonSummary[] | null; onOpen: (id: string) => void }) {
  const [asking, setAsking] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
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
                <LessonCard key={x.id} x={x} onOpen={() => onOpen(x.id)} />
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
    </div>
  );
}

function LessonCard({ x, onOpen }: { x: LessonSummary; onOpen: () => void }) {
  const mins = Math.max(1, Math.round((x.endedAt - x.startedAt) / 60000));
  const date = new Date(x.startedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return (
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

// Sentences grouped into paragraphs of up to 3, broken wherever a filed diagram appeared.
function blocks(sentences: Sentence[], archive: Diagram[]): Block[] {
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
    if (para.length === 3) flush();
    para.push(s);
  }
  flush();
  marks.forEach((d) => out.push({ kind: "diagram", d }));
  return out;
}

export function Live({ l }: { l: L }) {
  const secs = useClock(l.startedAt, true);
  const all = blocks(l.sentences, l.archive);
  const last = all[all.length - 1];
  // The words still being said join the latest paragraph, or start a new one.
  const latestOpen = last?.kind === "para" && last.sentences.length < 3;
  const shown: Block[] = latestOpen || !l.pending.trim() ? all : [...all, { kind: "para", sentences: [] }];
  const paras = shown.map((b, i) => ({ b, i })).filter(({ b }) => b.kind === "para");
  const nowIdx = paras.length ? paras[paras.length - 1].i : -1;
  const d = l.current;

  // Which bit of the transcript the teacher is correcting: a sentence id, the words still arriving, or none.
  const [editing, setEditing] = useState<number | "pending" | null>(null);
  const [pendingDraft, setPendingDraft] = useState("");

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
        <section className="transcript" aria-label="Transcript" aria-live="polite">
          {/* Speech held during a cold start is written up out of sight, then lands in one go. */}
          {l.catchUp !== null && (
            <div className="catchup">
              <span>Catching up…</span>
              <div className="meter" role="progressbar" aria-label="Catching up" aria-valuenow={Math.round(l.catchUp * 100)}>
                <div style={{ width: `${Math.max(4, l.catchUp * 100)}%` }} />
              </div>
            </div>
          )}
          {l.catchUp === null && shown.slice(-8).map((b, k, arr) => {
            const idx = shown.length - arr.length + k;
            if (b.kind === "diagram") return <Thumb key={b.d.id} d={b.d} onOpen={() => setOpen(list.indexOf(b.d))} />;
            const age = paras.filter((p) => p.i > idx).length;
            const isNow = idx === nowIdx;
            const text = b.sentences.map((s) => s.clean ?? s.raw).join(" ");
            const landed = l.landing !== null && (b.sentences[0]?.id ?? 0) < l.landing; // part of the caught-up chunk
            const startPending = () => {
              if (editing === "pending") return;
              setPendingDraft(l.beginEditPending());
              setEditing("pending");
            };
            // A click anywhere on a card edits its last sentence (the rough words on the live card), except
            // the strip beside the mute button.
            const editCard = (e: MouseEvent<HTMLParagraphElement>) => {
              const t = e.target as HTMLElement;
              if (editing !== null || t.closest(".editable, .editing, .mute")) return;
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
                      editing={editing === x.id}
                      onStart={() => setEditing(x.id)}
                      onDone={(v) => {
                        if (v !== null) l.editSentence(x.id, v);
                        setEditing(null);
                      }}
                    />
                  </Fragment>
                ))}
                {isNow && (
                  <>
                    {text && (l.pending || editing === "pending") ? " " : ""}
                    {editing === "pending" && (
                      <EditableText
                        text={pendingDraft}
                        editing
                        onStart={() => {}}
                        onDone={(v) => {
                          l.finishEditPending(v);
                          setEditing(null);
                        }}
                      />
                    )}
                    {editing === "pending" && l.pending ? " " : ""}
                    {l.pending.trim() && (
                      <span
                        className="rough editable"
                        role="button"
                        tabIndex={0}
                        title="Click to correct"
                        onClick={startPending}
                      >
                        {l.pending.trim()}
                      </span>
                    )}
                    {!l.muted && editing !== "pending" && <span className="caret" aria-hidden="true" />}
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

        <section className="dpanel" aria-label="Diagram">
          {/* Bubbles lives in the corner for the whole lesson: breathing when idle, scribbling while drawing. */}
          <div className="drawing-corner" role={l.drawing || l.listening ? "status" : undefined}>
            {l.drawing ? (
              <>
                <span className="drawing-caption">Drawing…</span>
                <StopButton onStop={l.stopDrawing} />
              </>
            ) : l.listening ? (
              <span className="drawing-caption">Listening…</span>
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

// Transcript text the teacher can correct in place: click to edit; Enter or clicking away saves, Escape
// cancels (onDone gets null). Saving an empty sentence removes it.
function EditableText({
  text, editing, onStart, onDone,
}: { text: string; editing: boolean; onStart: () => void; onDone: (value: string | null) => void }) {
  const ref = useRef<HTMLSpanElement>(null);
  const done = useRef(false);
  // Frozen while editing, so a tidy-up landing mid-edit can't replace the text under the cursor.
  const [frozen, setFrozen] = useState<string | null>(null);
  if (editing && frozen === null) setFrozen(text);
  if (!editing && frozen !== null) setFrozen(null);
  useEffect(() => {
    if (!editing || !ref.current) return;
    done.current = false;
    ref.current.focus();
    // Caret at the end, ready to type.
    const range = document.createRange();
    range.selectNodeContents(ref.current);
    range.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }, [editing]);
  const finish = (value: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(value);
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
      suppressContentEditableWarning
      role="textbox"
      aria-label="Correct transcript"
      data-placeholder="Type the correction"
      onInput={(e) => {
        // Keep :empty working for the placeholder once everything is deleted.
        if (!e.currentTarget.textContent) e.currentTarget.innerHTML = "";
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          finish(e.currentTarget.textContent ?? "");
        } else if (e.key === "Escape") finish(null);
      }}
      onBlur={(e) => finish(e.currentTarget.textContent ?? "")}
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

export function Ended({ l, onDone, doneLabel = "New lesson" }: { l: EndedData; onDone: () => void; doneLabel?: string }) {
  const e = l.lessonExport;
  const [openDiagram, setOpenDiagram] = useState<number | null>(null);
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
            <h2 className="h2">Diagrams</h2>
            <div className="grid">
              {l.archive.map((d, i) => (
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
          </section>
        )}

        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: 16 }}>
          <section className="sections">
            <h2 className="h2">Sections</h2>
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
              <dl>
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
