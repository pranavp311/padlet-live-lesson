"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { DiagramView } from "@/components/Diagram";
import { DiagramViewer } from "@/components/DiagramViewer";
import { Bubbles } from "@/components/Bubbles";
import { SendPanel, type Target } from "@/components/SendPanel";
import type { LessonExport } from "@/app/api/export/route";
import { Brand, Icon, MicBars, Notice, SubjectTile, TodoItem } from "@/components/Bits";
import { KIND_LABEL, type Diagram } from "@/lib/diagram";
import { formatClock, type Sentence } from "@/lib/transcript";
import { downloadBlob, slug, transcriptText } from "@/lib/files";
import type { LessonSummary } from "@/lib/history";
import type { useLesson } from "@/lib/useLesson";

type L = ReturnType<typeof useLesson>;

const today = () => new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short" });

// Start page: every saved lesson, newest first, with a new-lesson row on top.
export function Ready({ l, lessons, onOpen }: { l: L; lessons: LessonSummary[]; onOpen: (id: string) => void }) {
  return (
    <div className="wall">
      <header className="hdr">
        <Brand />
      </header>
      <main className="dash">
        <form
          className="dash-start"
          onSubmit={(e) => {
            e.preventDefault();
            void l.start();
          }}
        >
          <input className="input" aria-label="Lesson title" placeholder="Lesson title" value={l.title} onChange={(e) => l.setTitle(e.target.value)} />
          <button className="cta" type="submit" disabled={l.starting}>
            <Icon name="mic" size={22} />
            {l.starting ? "Waiting for microphone…" : "Start lesson"}
          </button>
        </form>
        {l.error && <Notice error={l.error} action="Try again" onAction={() => void l.start()} onDismiss={l.clearError} />}
        <section style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <h1 className="h1">Lessons</h1>
          {lessons.length ? (
            <div className="grid">
              {lessons.map((x) => (
                <button key={x.id} className="card lesson-card clickable" onClick={() => onOpen(x.id)}>
                  <SubjectTile subject={x.subject} size={44} />
                  <span className="t17">{x.title}</span>
                  <span className="t14 tnum">
                    {new Date(x.startedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} ·{" "}
                    {Math.max(1, Math.round((x.endedAt - x.startedAt) / 60000))} min
                    {x.diagrams > 0 && ` · ${x.diagrams} diagram${x.diagrams > 1 ? "s" : ""}`}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="muted">Your lessons appear here once you&apos;ve taught one.</p>
          )}
        </section>
      </main>
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

  // The panel shows the live diagram unless the teacher steps back (‹ ›) through earlier ones.
  const list = d ? [...l.archive, d] : l.archive;
  const [view, setView] = useState<number | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  useEffect(() => setView(null), [d?.id]); // a new diagram brings the panel back to live
  const shownIdx = view ?? (d ? list.length - 1 : null);
  const panelD = shownIdx === null ? null : list[shownIdx];
  const isLive = view === null && !!d;
  const step = (by: number) => {
    const next = Math.min(list.length - 1, Math.max(0, (shownIdx ?? list.length) + by));
    setView(d && next === list.length - 1 ? null : next);
  };

  return (
    <div className="wall" style={{ height: "100vh", overflow: "hidden" }}>
      <header className="hdr">
        <Brand />
        <span className="spacer" />
        <div className="pill">
          <span className="rec" />
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
            return (
              <p
                key={b.sentences[0]?.id ?? "now"}
                className={`para ${isNow ? "now" : age === 1 ? "old1" : "old2"}${landed ? " landed" : ""}`}
                style={landed ? ({ "--i": k } as CSSProperties) : undefined}
              >
                {text}
                {isNow && (
                  <>
                    {text && l.pending ? " " : ""}
                    <span className="rough">{l.pending.trim()}</span>
                    <span className="caret" aria-hidden="true" />
                  </>
                )}
              </p>
            );
          })}
          {l.catchUp === null && !l.sentences.length && !l.pending && <p className="hint">Start talking. Your words appear here.</p>}
        </section>

        <section className="dpanel" aria-label="Diagram">
          {/* Bubbles lives in the corner for the whole lesson: breathing when idle, scribbling while drawing. */}
          <div className="drawing-corner" role={l.drawing ? "status" : undefined}>
            {l.drawing && (
              <>
                <span className="drawing-caption">{l.summoned ? "Bubbles is drawing…" : "Drawing…"}</span>
                <StopButton onStop={l.stopDrawing} />
              </>
            )}
            <Bubbles size={92} drawing={l.drawing} />
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
                Back to live
              </button>
            )}
            <button className="btn btn-ghost" onClick={l.drawThis} disabled={!l.sentences.length || l.drawing}>
              <Icon name="pen" />
              Draw this
            </button>
            {isLive && (
              <>
                <button className="btn btn-ghost" aria-pressed={l.pinned} onClick={l.togglePin}>
                  <Icon name="pin" />
                  {l.pinned ? "Pinned" : "Pin"}
                </button>
                <button className="btn btn-ghost btn-icon" aria-label="Dismiss" onClick={l.dismiss}>
                  <Icon name="x" />
                </button>
              </>
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
  const [sent, setSent] = useState<Partial<Record<Target, boolean>>>({});
  const [reviewing, setReviewing] = useState<Target | null>(null);
  const [viewing, setViewing] = useState<Target | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (viewing) dialog.current?.showModal();
    else dialog.current?.close();
  }, [viewing]);

  const downloadTranscript = () =>
    downloadBlob(new Blob([transcriptText(title, l.startedAt, l.sentences)], { type: "text/plain" }), `${slug(title)}-transcript.txt`);

  const targets: { key: Target; name: string; icon: "board" | "game" | "cards"; bg: string; fg: string; count?: string }[] = [
    { key: "board", name: "Board", icon: "board", bg: "var(--canary-tint)", fg: "#913d00", count: e ? `${e.targets.board.posts.length} posts` : undefined },
    { key: "arcade", name: "Arcade", icon: "game", bg: "var(--scarlet-tint)", fg: "#7c0000", count: e ? `${e.targets.arcade.questions.length} questions` : undefined },
    { key: "sandbox", name: "Sandbox", icon: "cards", bg: "var(--park-tint)", fg: "#004e00", count: e ? `${e.targets.sandbox.cards.length} cards` : undefined },
  ];

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
              {sent[t.key] ? (
                <div style={{ height: 40, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span className="sent">
                    <Icon name="check" />
                    Sent
                  </span>
                  <button className="link" onClick={() => setViewing(t.key)}>
                    View payload
                  </button>
                </div>
              ) : (
                <button className="btn btn-dark" disabled={!e} onClick={() => setReviewing(t.key)}>
                  Send
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
      {e && (
        <SendPanel
          target={reviewing}
          targets={e.targets}
          diagrams={l.archive}
          onClose={() => setReviewing(null)}
          onSend={(next) => {
            l.updateTargets?.(next);
            setSent((s) => ({ ...s, [reviewing!]: true }));
            setReviewing(null);
          }}
        />
      )}
      <dialog ref={dialog} className="dialog" onClose={() => setViewing(null)}>
        <div className="dialog-head">
          <h2 className="h2">{viewing && targets.find((t) => t.key === viewing)?.name} payload</h2>
          <button className="btn btn-ghost btn-icon" aria-label="Close" onClick={() => setViewing(null)}>
            <Icon name="x" />
          </button>
        </div>
        <pre>{viewing && e && JSON.stringify(e.targets[viewing], null, 2)}</pre>
      </dialog>
    </div>
  );
}
