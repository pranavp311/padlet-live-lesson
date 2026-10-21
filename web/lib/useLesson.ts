"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { applyOps, emptyDiagram, isEmpty, type Diagram, type Kind, type Op } from "@/lib/diagram";
import { startMic, type Mic } from "@/lib/mic";
import { connectStt, warmStt, type Stt } from "@/lib/stt";
import { splitSettled, type Sentence } from "@/lib/transcript";
import type { LessonExport } from "@/app/api/export/route";
import type { Todo } from "@/lib/todo";
import type { Subject } from "@/lib/subject";
import { saveLesson } from "@/lib/history";

export type Phase = "ready" | "warming" | "live" | "ended";
// What went wrong, for the error notice: the microphone was refused or failed, or speech-to-text was
// unreachable while warming or dropped mid-lesson.
export type LessonError = "mic-blocked" | "mic-failed" | "stt-unreachable" | "stt-lost";

const DRAWABLE = 0.75;
const NEW_DIAGRAM_GAP_S = 20;
const DISMISS_S = 60;
const WAKE = /\bbubbles?\b/gi; // the mascot's name; the speech model writes it lowercase
const SUMMON_QUIET_MS = 1500; // once a request has been said, fire when the teacher pauses or goes quiet this long
const SUMMON_GIVE_UP_MS = 8000; // after "Bubbles", stop listening if no request follows within this long
// Words that don't make a request on their own ("Hey Bubbles", "Okay so Bubbles").
const FILLER = /\b(bubbles?|hey|hi|hello|okay|ok|so|um|uh|right|please)\b/gi;
// A request that's clearly not finished yet ("could you help me draw", "a diagram of the").
const UNFINISHED = /\b(draw|show|sketch|visuali[sz]e|diagram|help|me|us|with|of|for|about|a|an|the|and|to)\W*$/i;
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
  const [muted, setMuted] = useState(false);
  const [sentences, setSentences] = useState<Sentence[]>([]);
  const [pending, setPending] = useState("");
  const [current, setCurrent] = useState<Diagram | null>(null);
  const [archive, setArchive] = useState<Diagram[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [pinned, setPinned] = useState(false);
  const [subject, setSubject] = useState<Subject>("other");
  const [lessonExport, setLessonExport] = useState<LessonExport | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [error, setError] = useState<LessonError | null>(null);
  const [starting, setStarting] = useState(false); // waiting on the browser's microphone prompt
  const [ending, setEnding] = useState(false);
  // Bubbles heard his name, or Draw this was clicked: attentive, waiting to know if a diagram is coming.
  const [listening, setListening] = useState(false);
  // The server confirmed a diagram is being drawn (Jev decided): Bubbles draws, the board shows dots.
  const [drawing, setDrawing] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
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
    queued: null as null | { force: boolean; ask?: string },
    wakeSeen: 0, // how many times "Bubbles" has been heard so far
    abort: null as AbortController | null, // the diagram request in flight, so Stop can cancel it
    muted: false,
    summon: null as null | { start: number; timer?: ReturnType<typeof setTimeout> },
    streak: 0,
    lastCreatedAt: -Infinity,
    quietUntil: -Infinity,
    iconPicked: false,
    nextId: 1,
    lesson: 0, // bumped per lesson; async replies from an older lesson are dropped
    live: false, // between Start and End/Cancel; diagram checks only run while live
    ending: false,
    starting: false,
    endedAt: 0,
    subject: "other" as Subject,
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
    async (force = false, ask?: string) => {
      const s = r.current;
      if (s.inFlight) {
        s.queued = { force: force || !!s.queued?.force, ask: ask ?? s.queued?.ask };
        return;
      }
      if (!s.live || (s.pinned && !force)) return;
      const lesson = s.lesson;
      const t = now();
      const recent = s.sentences.slice(-3).map((x) => x.clean ?? x.raw);
      if (!recent.length && !ask) return;
      s.inFlight = true;
      if (force || ask) setListening(true);
      const abort = (s.abort = new AbortController());
      try {
        const allowCreate = s.streak >= 1 && t - s.lastCreatedAt >= NEW_DIAGRAM_GAP_S && t >= s.quietUntil;
        const res = await fetch("/api/diagram", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recent, current: s.current, allowCreate, force, ask }),
          signal: abort.signal,
        });
        // NDJSON: an early {"drawing": true} line (start the animation), then the result line.
        let reply: DiagramReply = {};
        let buf = "";
        const reader = res.body!.getReader();
        const dec = new TextDecoder();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let nl;
          while ((nl = buf.indexOf("\n")) >= 0) {
            const line = JSON.parse(buf.slice(0, nl));
            buf = buf.slice(nl + 1);
            if (line.drawing) {
              if (s.lesson === lesson && s.live && !(s.pinned && !force)) {
                setListening(false);
                setDrawing(true);
              }
            } else reply = line;
          }
        }
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
        if (!abort.signal.aborted) console.error("diagram request failed", e);
      } finally {
        setDrawing(false);
        setListening(!!s.summon); // still attentive if another "Bubbles, …" request is being heard
        s.abort = null;
        s.inFlight = false;
        const q = s.queued;
        s.queued = null;
        if (q) void checkDiagram(q.force, q.ask);
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
        if (subject && s.lesson === lesson) setSubject((s.subject = subject));
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
      // …and none while Bubbles is listening for a request: his request will draw instead.
      if (added.length && !s.catchingUp && !s.summon) void checkDiagram();
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

  // "Bubbles, draw …": the request is everything from the sentence where the name was heard up to the
  // teacher's next pause. It goes straight to the diagram step, skipping Jev's drawable check and pacing.
  // What the teacher has said since Bubbles' name, and whether it's a whole request yet.
  const summonText = () => {
    const s = r.current;
    return [...s.sentences.slice(s.summon!.start).map((x) => x.raw), s.pending].join(" ").trim();
  };
  const isRequest = (text: string) => {
    const words = text.replace(FILLER, " ").match(/[a-z0-9']+/gi) ?? [];
    return words.length >= 3 && !UNFINISHED.test(text);
  };

  const fireSummon = useCallback(() => {
    const s = r.current;
    if (!s.summon) return;
    clearTimeout(s.summon.timer);
    const { start } = s.summon;
    s.summon = null;
    settleRest();
    const ask = s.sentences.slice(start).map((x) => x.raw).join(" ");
    if (ask.trim()) void checkDiagram(true, ask);
    else setListening(false);
  }, [settleRest, checkDiagram]);

  // Bubbles heard his name but no request followed: stop listening.
  const giveUpSummon = useCallback(() => {
    const s = r.current;
    if (!s.summon) return;
    s.summon = null;
    setListening(false);
  }, []);

  // Called on every new piece of speech and at every pause while Bubbles is listening: fire once a whole
  // request has been said and the teacher pauses; otherwise keep listening ("Hey Bubbles." … "Could you …").
  const awaitRequest = useCallback(
    (paused: boolean) => {
      const s = r.current;
      if (!s.summon) return;
      clearTimeout(s.summon.timer);
      const ready = isRequest(summonText());
      if (ready && paused) return fireSummon();
      if (paused) settleRest();
      s.summon.timer = ready ? setTimeout(fireSummon, SUMMON_QUIET_MS) : setTimeout(giveUpSummon, SUMMON_GIVE_UP_MS);
    },
    [fireSummon, giveUpSummon, settleRest],
  );

  const listenForBubbles = useCallback(() => {
    const s = r.current;
    const heard = (s.sentences.map((x) => x.raw).join(" ") + " " + s.pending).match(WAKE)?.length ?? 0;
    if (heard > s.wakeSeen && !s.summon) {
      // Attentive the moment the name is heard; drawing only starts once the server confirms.
      const pendingHasName = WAKE.test(s.pending);
      WAKE.lastIndex = 0;
      s.summon = { start: pendingHasName ? s.sentences.length : Math.max(0, s.sentences.length - 1) };
      setListening(true);
    }
    s.wakeSeen = heard;
    awaitRequest(false);
  }, [awaitRequest]);
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
    const s = r.current;
    if (s.starting) return;
    // Ask for the microphone first, still on the start page, so a refusal never flashes the warming
    // screen or opens a speech connection.
    s.starting = true;
    setStarting(true);
    setError(null);
    let mic: Mic;
    try {
      mic = await startMic((pcm, lvl) => {
        // Muted: send silence instead, so the server's timeline (and sentence times) stay in step.
        s.stt?.send(s.muted ? new ArrayBuffer(pcm.byteLength) : pcm);
        setLevel(s.muted ? 0 : lvl);
      });
    } catch (e) {
      console.warn("mic unavailable", e); // expected (refused or missing), shown as a notice
      setError(e instanceof DOMException && e.name === "NotAllowedError" ? "mic-blocked" : "mic-failed");
      return;
    } finally {
      s.starting = false;
      setStarting(false);
    }

    setPhase("warming");
    const lesson = ++s.lesson;
    s.live = true;
    s.startedAt = Date.now();
    setStartedAt(s.startedAt);
    s.mic = mic;
    s.audioZero = now();
    Object.assign(s, { heard: 0, catchingUp: false, cleans: [] });
    setCatchUp(null);
    const mine = () => s.lesson === lesson && s.live; // ignore events from a cancelled lesson's socket
    if (title.trim()) pickIcon(title.trim());
    let gotReady = false;
    s.stt = connectStt({
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
        listenForBubbles();
      },
      onPause: () => {
        if (!mine()) return;
        if (s.summon) awaitRequest(true);
        else settleRest();
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
        setError(gotReady ? "stt-lost" : "stt-unreachable");
      },
    });
  }, [settle, settleRest, pickIcon, caughtUp, title, awaitRequest, listenForBubbles]);

  const cancel = useCallback(() => {
    stopAudio();
    r.current.live = false;
    r.current.cleans = [];
    r.current.stt?.close();
    setPhase("ready");
  }, []);

  // Saves the finished lesson to this browser's history; called again once the summary arrives.
  const save = useCallback(
    (summary: LessonExport | null) => {
      const s = r.current;
      const ok = saveLesson({
        id: `l${s.startedAt}`,
        title: title.trim() || summary?.title || "Lesson",
        subject: s.subject,
        startedAt: s.startedAt,
        endedAt: s.endedAt,
        sentences: s.sentences,
        archive: s.archive,
        todos: s.todos,
        lessonExport: summary,
      });
      setSaveFailed(!ok);
    },
    [title],
  );

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
      save(data);
    } catch (e) {
      console.error("export failed", e);
      if (s.lesson === lesson) setExportError("Couldn't build the summary.");
    }
  }, [title, save]);

  const end = useCallback(async () => {
    const s = r.current;
    if (!s.live || s.ending) return; // End clicked twice
    s.ending = true;
    setEnding(true);
    clearTimeout(s.summon?.timer);
    s.summon = null;
    setListening(false);
    setDrawing(false);
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
    s.endedAt = Date.now();
    setEndedAt(s.endedAt);
    fileAway(s.current);
    setCur(null);
    setPhase("ended");
    // Let the queued clean-ups land before building the summary (a backlog can leave several), up to 10 s.
    for (let waited = 0; waited < 10000 && s.lesson === lesson && (s.cleans.length || s.cleaning); waited += 250) {
      await new Promise((res) => setTimeout(res, 250));
    }
    if (s.lesson === lesson) save(null);
    if (s.lesson === lesson) await buildExport();
  }, [fileAway, settleRest, buildExport, save]);

  const drawThis = useCallback(() => void checkDiagram(true), [checkDiagram]);

  const toggleMute = useCallback(() => {
    r.current.muted = !r.current.muted;
    setMuted(r.current.muted);
  }, []);

  // Edits from the send review panel are kept with the lesson.
  const updateTargets = useCallback(
    (targets: LessonExport["targets"]) => {
      setLessonExport((e) => {
        if (!e) return e;
        const next = { ...e, targets };
        save(next);
        return next;
      });
    },
    [save],
  );

  // Stop: cancel the drawing in flight (and a Bubbles request still listening). The automatic trigger
  // then waits out the usual gap before offering a new diagram.
  const stopDrawing = useCallback(() => {
    const s = r.current;
    clearTimeout(s.summon?.timer);
    s.summon = null;
    s.queued = null;
    s.abort?.abort();
    s.lastCreatedAt = now();
    s.streak = 0;
    setDrawing(false);
    setListening(false);
  }, []);

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
    setMuted(false);
    Object.assign(r.current, {
      muted: false,
      live: false,
      ending: false,
      subject: "other",
      catchingUp: false, cleans: [],
      pending: "", sentences: [], current: null, archive: [], todos: [], pinned: false, streak: 0,
      lastCreatedAt: -Infinity, quietUntil: -Infinity, iconPicked: false, queued: null, wakeSeen: 0, summon: null,
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
    lessonExport, exportError, error, clearError: () => setError(null), starting, ending, listening, drawing, stopDrawing, muted, toggleMute, saveFailed, updateTargets, catchUp, landing, start, cancel, end, retryExport: buildExport, drawThis, togglePin, dismiss, reset,
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

// Same reminder said twice ("Worksheet due Friday" / "Photosynthesis worksheet due Friday"), but not two
// tasks that only share a due date or differ by a number ("Read chapter 5" / "Read chapter 6").
function sameTodo(a: Todo, b: Todo) {
  if (a.kind !== b.kind) return false;
  const words = (t: string) => new Set(t.toLowerCase().match(/[a-z0-9]+/g) ?? []);
  const wa = words(a.text);
  const wb = words(b.text);
  const nums = (w: Set<string>) => [...w].filter((x) => /\d/.test(x)).sort().join();
  if (nums(wa) !== nums(wb)) return false;
  const shared = [...wa].filter((w) => wb.has(w)).length;
  return shared / Math.min(wa.size, wb.size) >= 0.8;
}
