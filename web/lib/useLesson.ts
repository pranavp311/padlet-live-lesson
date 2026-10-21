"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { applyOps, emptyDiagram, isEmpty, type Diagram, type Kind, type Op } from "@/lib/diagram";
import { startMic, type Mic } from "@/lib/mic";
import { connectStt, warmStt, type Stt } from "@/lib/stt";
import { splitSettled, type Sentence } from "@/lib/transcript";
import type { LessonExport } from "@/app/api/export/route";
import type { Todo } from "@/lib/todo";
import type { Subject } from "@/lib/subject";

export type Phase = "ready" | "warming" | "live" | "ended";

const DRAWABLE = 0.75;
const NEW_DIAGRAM_GAP_S = 20;
const DISMISS_S = 60;
const CLEANS_AT_ONCE = 2; // a cold start's backlog settles many sentences at once; don't fire them all together
const LAND_MS = 1500; // how long the caught-up chunk's settle-in animation runs

type DiagramReply = {
  jev?: { drawable: number };
  action?: "none" | "update" | "new_topic";
  kind?: Kind;
  ops?: Op[];
  error?: string;
};

export function useLesson() {
  const [phase, setPhase] = useState<Phase>("ready");
  const [title, setTitle] = useState("");
  const [startedAt, setStartedAt] = useState(0);
  const [endedAt, setEndedAt] = useState(0);
  const [level, setLevel] = useState(0);
  const [sentences, setSentences] = useState<Sentence[]>([]);
  const [pending, setPending] = useState("");
  const [current, setCurrent] = useState<Diagram | null>(null);
  const [archive, setArchive] = useState<Diagram[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [pinned, setPinned] = useState(false);
  const [subject, setSubject] = useState<Subject>("other");
  const [lessonExport, setLessonExport] = useState<LessonExport | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ending, setEnding] = useState(false);
  // Catching up on speech held during a cold start: progress 0–1, or null. While set, the transcript is hidden.
  const [catchUp, setCatchUp] = useState<number | null>(null);
  // The caught-up chunk just appeared: sentences with ids below this are part of it. Null otherwise.
  const [landing, setLanding] = useState<number | null>(null);

  // Refs mirror state that async callbacks read, so they never see stale values.
  const r = useRef({
    mic: null as Mic | null,
    stt: null as Stt | null,
    startedAt: 0,
    audioZero: 0, // lesson clock (s) when the mic started capturing
    heard: 0, // lesson clock (s) of the latest text piece, from the audio the server has processed
    catchingUp: false,
    cleans: [] as (() => Promise<void>)[],
    cleaning: 0,
    pending: "",
    sentences: [] as Sentence[],
    current: null as Diagram | null,
    archive: [] as Diagram[],
    todos: [] as Todo[],
    pinned: false,
    inFlight: false,
    queued: null as null | { force: boolean },
    streak: 0,
    lastCreatedAt: -Infinity,
    quietUntil: -Infinity,
    iconPicked: false,
    nextId: 1,
    lesson: 0, // bumped per lesson; async replies from an older lesson are dropped
    live: false, // between Start and End/Cancel; diagram checks only run while live
    ending: false,
  });

  useEffect(() => warmStt(), []);

  const now = () => (Date.now() - r.current.startedAt) / 1000;

  const setCur = (d: Diagram | null) => {
    r.current.current = d;
    setCurrent(d);
  };

  const fileAway = useCallback((d: Diagram | null) => {
    if (!d || isEmpty(d)) return;
    r.current.archive = [...r.current.archive, { ...d, fresh: [] }];
    setArchive(r.current.archive);
  }, []);

  const checkDiagram = useCallback(
    async (force = false) => {
      const s = r.current;
      if (s.inFlight) {
        s.queued = { force: force || !!s.queued?.force };
        return;
      }
      if (!s.live || (s.pinned && !force)) return;
      const lesson = s.lesson;
      const t = now();
      const recent = s.sentences.slice(-3).map((x) => x.clean ?? x.raw);
      if (!recent.length) return;
      s.inFlight = true;
      try {
        const allowCreate = s.streak >= 1 && t - s.lastCreatedAt >= NEW_DIAGRAM_GAP_S && t >= s.quietUntil;
        const res = await fetch("/api/diagram", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recent, current: s.current, allowCreate, force }),
        });
        const reply: DiagramReply = await res.json();
        if (reply.error) console.error("diagram", reply.error);
        if (s.lesson !== lesson || !s.live) return;
        if (reply.jev) {
          s.streak = reply.jev.drawable >= DRAWABLE ? s.streak + 1 : 0;
        }
        if (s.pinned && !force) return;
        if (reply.action === "update" && s.current && reply.ops?.length) {
          setCur(applyOps(s.current, reply.ops));
        } else if (reply.action === "new_topic" && reply.kind && reply.ops?.length) {
          const next = applyOps(emptyDiagram(reply.kind, t), reply.ops);
          // A diagram needs a title: Jev's same-topic check and the transcript thumbnail both use it.
          next.title ||= next.nodes[0]?.label ?? next.events[0]?.label ?? next.curves[0]?.label ?? "Diagram";
          if (!isEmpty(next)) {
            fileAway(s.current);
            setCur(next);
            s.lastCreatedAt = t;
            setPinned((s.pinned = false));
          }
        }
      } catch (e) {
        console.error("diagram request failed", e);
      } finally {
        s.inFlight = false;
        const q = s.queued;
        s.queued = null;
        if (q) void checkDiagram(q.force);
      }
    },
    [fileAway],
  );

  // Jev picks the lesson's subject, and so its icon, once: from the title at Start, or from the first sentences.
  const pickIcon = useCallback((text: string) => {
    const s = r.current;
    s.iconPicked = true;
    const lesson = s.lesson;
    fetch("/api/subject", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) })
      .then((res) => res.json())
      .then(({ subject }: { subject?: Subject }) => {
        if (subject && s.lesson === lesson) setSubject(subject);
      })
      .catch((e) => console.error("subject failed", e));
  }, []);

  const settle = useCallback(
    (texts: string[]) => {
      const s = r.current;
      // Stamped with when it was said, not when it settled: a cold start's backlog settles all at once.
      const added: Sentence[] = texts.map((raw) => ({ id: s.nextId++, raw, t: s.heard }));
      const before = s.sentences;
      s.sentences = [...before, ...added];
      setSentences(s.sentences);
      const lesson = s.lesson;
      for (const [i, sentence] of added.entries()) {
        const context = [...before, ...added.slice(0, i)].slice(-3).map((x) => x.clean ?? x.raw);
        s.cleans.push(() =>
          fetch("/api/clean", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sentence: sentence.raw, context, todos: s.todos }),
            signal: AbortSignal.timeout(15000), // a hung call would hold a queue slot for the rest of the lesson
          })
            .then((res) => res.json())
            .then(({ text, todo }: { text?: string; todo?: Todo | null }) => {
              if (s.lesson !== lesson) return;
              if (text) {
                s.sentences = s.sentences.map((x) => (x.id === sentence.id ? { ...x, clean: text } : x));
                setSentences(s.sentences);
              }
              if (todo && !s.todos.some((t) => sameTodo(t, todo))) {
                s.todos = [...s.todos, { ...todo, id: `t${s.nextId++}` }];
                setTodos(s.todos);
              }
            })
            .catch((e) => console.error("clean failed", e)),
        );
      }
      runCleans(s);
      if (!s.iconPicked && s.sentences.length >= 2) pickIcon(s.sentences.map((x) => x.raw).join(" "));
      // A backlog gets one diagram check once it's caught up, not one per sentence.
      if (added.length && !s.catchingUp) void checkDiagram();
    },
    [checkDiagram, pickIcon],
  );

  // Settles whatever is still pending. A lone closing mark (sent at the start of the next phrase)
  // belongs to the last sentence rather than becoming a sentence of its own.
  const settleRest = useCallback(() => {
    const s = r.current;
    const rest = s.pending.trim();
    s.pending = "";
    setPending("");
    if (!rest) return;
    if (/^[.?!]+$/.test(rest)) {
      const last = s.sentences[s.sentences.length - 1];
      if (last && !/[.?!]$/.test(last.raw)) {
        s.sentences = s.sentences.map((x) => (x === last ? { ...x, raw: x.raw + rest } : x));
        setSentences(s.sentences);
      }
      return;
    }
    settle([rest]);
  }, [settle]);

  // The held speech is all in: show it in one go, then run the diagram check its sentences skipped.
  const caughtUp = useCallback(() => {
    const s = r.current;
    if (!s.catchingUp) return;
    s.catchingUp = false;
    setCatchUp(null);
    setLanding(s.nextId);
    const lesson = s.lesson;
    setTimeout(() => s.lesson === lesson && setLanding(null), LAND_MS);
    void checkDiagram();
  }, [checkDiagram]);

  const stopAudio = () => {
    r.current.mic?.stop();
    r.current.mic = null;
  };

  const start = useCallback(async () => {
    setError(null);
    setPhase("warming");
    const s = r.current;
    const lesson = ++s.lesson;
    s.live = true;
    s.startedAt = Date.now();
    setStartedAt(s.startedAt);
    Object.assign(s, { heard: 0, catchingUp: false, cleans: [] });
    setCatchUp(null);
    const mine = () => s.lesson === lesson && s.live; // ignore events from a cancelled lesson's socket
    if (title.trim()) pickIcon(title.trim());
    let gotReady = false;
    const stt = (s.stt = connectStt({
      onReady: () => {
        gotReady = true;
        if (mine()) setPhase((p) => (p === "warming" ? "live" : p));
      },
      onText: (piece, audioSecs) => {
        if (!mine()) return;
        s.heard = s.audioZero + audioSecs;
        // A phrase after a pause can open with the previous one's comma; it has nothing to attach to.
        s.pending = s.pending ? s.pending + piece : piece.replace(/^\s*[,;:]+/, "");
        // After a pause the model sends the closing punctuation at the start of the next phrase (". Let's").
        const lead = s.pending.match(/^\s*([.?!]+)(?=\s*\S)/)?.[1];
        const last = s.sentences[s.sentences.length - 1];
        if (lead && last && !/[.?!]$/.test(last.raw)) {
          s.pending = s.pending.replace(/^\s*[.?!]+/, "");
          s.sentences = s.sentences.map((x) => (x === last ? { ...x, raw: x.raw + lead } : x));
          setSentences(s.sentences);
        }
        const { done, rest } = splitSettled(s.pending);
        s.pending = rest;
        setPending(rest);
        if (done.length) settle(done);
      },
      onPause: () => {
        if (mine()) settleRest();
      },
      onCatchUp: (progress) => {
        if (!mine()) return;
        if (progress < 1) {
          s.catchingUp = true;
          setCatchUp(progress);
        } else caughtUp();
      },
      onClose: (err) => {
        if (!err || !mine()) return;
        caughtUp(); // show what arrived before the connection dropped
        setError(
          gotReady
            ? "Lost the connection to speech-to-text. End the lesson to keep what you have."
            : "Couldn't reach speech-to-text. Cancel and try again.",
        );
      },
    }));
    try {
      const mic = await startMic((pcm, lvl) => {
        s.stt?.send(pcm);
        setLevel(lvl);
      });
      if (!mine()) return mic.stop(); // cancelled while the permission prompt was open
      s.mic = mic;
      s.audioZero = now();
    } catch (e) {
      console.error("mic failed", e);
      if (!mine()) return; // a cancelled lesson's prompt; the current lesson isn't affected
      s.live = false;
      stt.close();
      setError(
        e instanceof DOMException && e.name === "NotAllowedError"
          ? "Microphone blocked. Allow it in the address bar and try again."
          : "Couldn't start the microphone.",
      );
      setPhase("ready");
    }
  }, [settle, settleRest, pickIcon, caughtUp, title]);

  const cancel = useCallback(() => {
    stopAudio();
    r.current.live = false;
    r.current.cleans = [];
    r.current.stt?.close();
    setPhase("ready");
  }, []);

  const buildExport = useCallback(async () => {
    const s = r.current;
    const lesson = s.lesson;
    setExportError(null);
    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          sentences: s.sentences.map((x) => ({ t: x.t, text: x.clean ?? x.raw })),
          diagrams: s.archive.map((d) => ({ id: d.id, kind: d.kind, title: d.title, t: d.t })),
        }),
      });
      const data = await res.json();
      if (s.lesson !== lesson) return;
      if (data.error) throw new Error(data.error);
      setLessonExport(data);
    } catch (e) {
      console.error("export failed", e);
      if (s.lesson === lesson) setExportError("Couldn't build the summary.");
    }
  }, [title]);

  const end = useCallback(async () => {
    const s = r.current;
    if (!s.live || s.ending) return; // End clicked twice
    s.ending = true;
    setEnding(true);
    const lesson = s.lesson;
    stopAudio();
    await s.stt?.end(); // the last words still arrive during this wait, so stay live until it returns
    s.live = false;
    s.ending = false;
    setEnding(false);
    if (s.lesson !== lesson) return;
    s.catchingUp = false;
    setCatchUp(null);
    settleRest();
    setEndedAt(Date.now());
    fileAway(s.current);
    setCur(null);
    setPhase("ended");
    // Let the queued clean-ups land before building the summary (a backlog can leave several), up to 10 s.
    for (let waited = 0; waited < 10000 && s.lesson === lesson && (s.cleans.length || s.cleaning); waited += 250) {
      await new Promise((res) => setTimeout(res, 250));
    }
    if (s.lesson === lesson) await buildExport();
  }, [fileAway, settleRest, buildExport]);

  const drawThis = useCallback(() => void checkDiagram(true), [checkDiagram]);

  const togglePin = useCallback(() => {
    r.current.pinned = !r.current.pinned;
    setPinned(r.current.pinned);
  }, []);

  const dismiss = useCallback(() => {
    fileAway(r.current.current);
    setCur(null);
    r.current.pinned = false;
    setPinned(false);
    r.current.quietUntil = now() + DISMISS_S;
  }, [fileAway]);

  const reset = useCallback(() => {
    r.current.lesson++;
    Object.assign(r.current, {
      live: false,
      ending: false,
      catchingUp: false, cleans: [],
      pending: "", sentences: [], current: null, archive: [], todos: [], pinned: false, streak: 0,
      lastCreatedAt: -Infinity, quietUntil: -Infinity, iconPicked: false, queued: null,
    });
    setCatchUp(null);
    setLanding(null);
    setSentences([]);
    setPending("");
    setCurrent(null);
    setArchive([]);
    setTodos([]);
    setPinned(false);
    setSubject("other");
    setLessonExport(null);
    setExportError(null);
    setError(null);
    setTitle("");
    setPhase("ready");
    warmStt();
  }, []);

  return {
    phase, title, setTitle, startedAt, endedAt, level, sentences, pending, current, archive, todos, pinned, subject,
    lessonExport, exportError, error, ending, catchUp, landing, start, cancel, end, retryExport: buildExport, drawThis, togglePin, dismiss, reset,
  };
}

// Runs queued /api/clean calls, at most CLEANS_AT_ONCE in flight.
function runCleans(s: { cleans: (() => Promise<void>)[]; cleaning: number }) {
  while (s.cleaning < CLEANS_AT_ONCE && s.cleans.length) {
    s.cleaning++;
    void s.cleans.shift()!().finally(() => {
      s.cleaning--;
      runCleans(s);
    });
  }
}

// Same reminder said twice ("Worksheet due Friday" / "Photosynthesis worksheet due Friday").
function sameTodo(a: Todo, b: Todo) {
  if (a.kind !== b.kind) return false;
  if (a.due && b.due && a.due.toLowerCase() === b.due.toLowerCase()) return true;
  const words = (t: string) => new Set(t.toLowerCase().match(/[a-z0-9]+/g) ?? []);
  const wa = words(a.text);
  const wb = words(b.text);
  const shared = [...wa].filter((w) => wb.has(w)).length;
  return shared / Math.min(wa.size, wb.size) >= 0.6;
}
