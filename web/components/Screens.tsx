"use client";

import { useEffect, useRef, useState } from "react";
import { DiagramView } from "@/components/Diagram";
import { Brand, Icon, MicBars, SubjectTile, TodoItem } from "@/components/Bits";
import { KIND_LABEL, type Diagram } from "@/lib/diagram";
import { formatClock, type Sentence } from "@/lib/transcript";
import type { useLesson } from "@/lib/useLesson";

type L = ReturnType<typeof useLesson>;

const today = () => new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short" });

export function Ready({ l }: { l: L }) {
  return (
    <div className="wall">
      <header className="hdr">
        <Brand />
      </header>
      <main className="center">
        <form
          className="panel"
          onSubmit={(e) => {
            e.preventDefault();
            void l.start();
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span className="tile" style={{ background: "var(--grape-tint)", color: "#520085" }}>
              <Icon name="lesson" size={26} />
            </span>
            <h1 className="h1">Live lesson</h1>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <input className="input" aria-label="Lesson title" placeholder="Lesson title" value={l.title} onChange={(e) => l.setTitle(e.target.value)} />
            <button className="cta" type="submit">
              <Icon name="mic" size={22} />
              Start lesson
            </button>
            {l.error && <p className="err">{l.error}</p>}
          </div>
        </form>
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
            {l.error ? <p className="err">{l.error}</p> : <p className="muted">Getting ready… start talking anytime.</p>}
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
        <button className="btn btn-dark" onClick={() => void l.end()}>
          End lesson
        </button>
      </header>
      <div className="lesson-head">
        <SubjectTile subject={l.subject} />
        <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
          {l.error ? <span className="eyebrow err">{l.error}</span> : <span className="eyebrow">Live lesson · {today()}</span>}
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
      <main className="live">
        <section className="transcript" aria-label="Transcript" aria-live="polite">
          {shown.slice(-8).map((b, k, arr) => {
            const idx = shown.length - arr.length + k;
            if (b.kind === "diagram") return <Thumb key={b.d.id} d={b.d} />;
            const age = paras.filter((p) => p.i > idx).length;
            const isNow = idx === nowIdx;
            const text = b.sentences.map((s) => s.clean ?? s.raw).join(" ");
            return (
              <p key={b.sentences[0]?.id ?? "now"} className={`para ${isNow ? "now" : age === 1 ? "old1" : "old2"}`}>
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
          {!l.sentences.length && !l.pending && <p className="hint">Start talking. Your words appear here.</p>}
        </section>

        <section className="dpanel" aria-label="Diagram">
          <div className="dpanel-head">
            <h2 className="h2">{d?.title ?? ""}</h2>
            <button className="btn btn-ghost" onClick={l.drawThis} disabled={!l.sentences.length}>
              <Icon name="pen" />
              Draw this
            </button>
            {d && (
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
          {d ? (
            <>
              <div className="dpanel-body">
                <DiagramView d={d} />
              </div>
              <div>
                <span className="chip tnum" style={{ background: "var(--grape-tint)", color: "#520085" }}>
                  {KIND_LABEL[d.kind]} · {formatClock(d.t)}
                </span>
              </div>
            </>
          ) : (
            <div className="dpanel-empty">Diagrams appear here as you explain.</div>
          )}
        </section>
      </main>
    </div>
  );
}

function Thumb({ d }: { d: Diagram }) {
  return (
    <div className="thumb">
      <span className="thumb-img">
        <DiagramView d={d} still />
      </span>
      <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span className="thumb-title">{d.title}</span>
        <span className="thumb-time tnum">{formatClock(d.t)}</span>
      </span>
    </div>
  );
}

type Target = "board" | "arcade" | "sandbox";

export function Ended({ l }: { l: L }) {
  const e = l.lessonExport;
  const mins = Math.max(1, Math.round((l.endedAt - l.startedAt) / 60000));
  const [sent, setSent] = useState<Partial<Record<Target, boolean>>>({});
  const [viewing, setViewing] = useState<Target | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (viewing) dialog.current?.showModal();
    else dialog.current?.close();
  }, [viewing]);

  const lesson = e && {
    ...e,
    duration_s: Math.round((l.endedAt - l.startedAt) / 1000),
    diagrams: l.archive.map((d) => ({ ...d, fresh: undefined })),
    todos: l.todos.map((t) => ({ kind: t.kind, text: t.text, due: t.due })),
    transcript: l.sentences.map((s) => ({ t: Math.round(s.t), text: s.clean ?? s.raw })),
  };

  const download = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(lesson, null, 2)], { type: "application/json" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: "lesson.json" });
    a.click();
    URL.revokeObjectURL(url);
  };

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
        <button className="btn btn-dark" onClick={l.reset}>
          New lesson
        </button>
      </header>
      <div className="lesson-head">
        <SubjectTile subject={l.subject} />
        <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
          <span className="eyebrow tnum">
            {today()} · {mins} min
          </span>
          <h1 className="h1">{l.title || e?.title || "Lesson"}</h1>
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
                <button className="btn btn-dark" disabled={!e} onClick={() => setSent((s) => ({ ...s, [t.key]: true }))}>
                  Send
                </button>
              )}
            </div>
          ))}
          <div className="card target" style={{ boxShadow: "inset 0 0 0 1px #ebecef" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <span className="target-tile" style={{ background: "var(--surface)" }}>
                <Icon name="json" size={22} />
              </span>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span className="t17">lesson.json</span>
                <span className="t14">All three payloads</span>
              </div>
            </div>
            <button className="btn btn-soft" disabled={!e} onClick={download}>
              <Icon name="download" />
              Download
            </button>
          </div>
        </div>
        {l.exportError && <p className="err">{l.exportError}</p>}

        {l.archive.length > 0 && (
          <section style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <h2 className="h2">Diagrams</h2>
            <div className="grid">
              {l.archive.map((d) => (
                <div key={d.id} className="card gal">
                  <span className="gal-img">
                    <DiagramView d={d} still />
                  </span>
                  <span className="gal-meta">
                    <span className="t17">{d.title}</span>
                    <span className="t14 tnum" style={{ lineHeight: "24px" }}>
                      {formatClock(d.t)}
                    </span>
                  </span>
                </div>
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
