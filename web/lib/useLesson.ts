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
// What the teacher said, with their corrections.
const said = (x: Sentence) => (x.edited ? x.clean! : x.raw);
// How many times the name has been said so far.
const countWake = (s: { sentences: Sentence[]; pending: string }) =>
  (s.sentences.map(said).join(" ") + " " + s.pending).match(WAKE)?.length ?? 0;
const SUMMON_QUIET_MS = 1500; // once a request has been said, fire when the teacher pauses or goes quiet this long
// A pause mid-thought isn't the end of a sentence: the words still arriving settle (and get tidied, with a full
// stop) only after this long without speech. While the teacher talks, sentences settle at the model's own
// punctuation, with what was said before them as context.
const SETTLE_AFTER_PAUSE_MS = 10000;
const SUMMON_GIVE_UP_MS = 8000; // after "Bubbles", stop waiting for more of the request after this long without speech
const DIAGRAM_TIMEOUT_MS = 30000; // a diagram request that hasn't answered by now has failed
// Words that don't make a request on their own ("Hey Bubbles", "Okay so Bubbles").
const FILLER = /\b(bubbles?|hey|hi|hello|okay|ok|so|um|uh|right|please|can|could|would|will|you)\b/gi;
// A request that's clearly not finished yet ("could you help me draw", "show us", "a diagram of the"). "me" and
// "us" only count straight after a verb: "draw the water cycle for me" is a whole request.
const UNFINISHED = /\b((draw|show|help|give|tell|make) (me|us)|draw|show|sketch|visuali[sz]e|help|diagram|picture|with|of|for|about|a|an|the|and|or|but|to|then|that|how|between|into|in|on|from|like)\W*$/i;
const CLEANS_AT_ONCE = 2; // a cold start's backlog settles many sentences at once; don't fire them all together
const LAND_MS = 1500; // how long the caught-up chunk's settle-in animation runs

type DiagramReply = {
  jev?: { drawable: number };
  action?: "none" | "update" | "new_topic";
  kind?: Kind;
  ops?: Op[];
  error?: string;
  ignored?: boolean; // a "Bubbles" mention that wasn't a request
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
  // The pinned diagram stays on screen; new diagrams are still drawn and added behind it.
  const [pinnedId, setPinnedId] = useState<string | null>(null);
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
  // Shown by Bubbles for a few seconds when a request to him produced nothing.
  const [bubblesNote, setBubblesNote] = useState<string | null>(null);
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
    pinnedId: null as string | null,
    inFlight: false,
    queued: null as null | { force: boolean; ask?: string },
    wakeSeen: 0, // how many times "Bubbles" has been heard so far
    abort: null as AbortController | null, // the diagram request in flight, so Stop can cancel it
    muted: false,
    summon: null as null | { start: number; timer?: ReturnType<typeof setTimeout> },
    settleTimer: undefined as ReturnType<typeof setTimeout> | undefined,
    beforePause: "", // the words still arriving as of the last pause: a finished thought, not part of a request after it
    noteTimer: undefined as ReturnType<typeof setTimeout> | undefined,
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

  const findDiagram = (id: string | null) => {
    const s = r.current;
    return id ? (s.current?.id === id ? s.current : s.archive.find((x) => x.id === id)) ?? null : null;
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
        const asks = [s.queued?.ask, ask].filter(Boolean).join(" "); // two requests while busy: send both
        s.queued = { force: force || !!s.queued?.force, ask: asks || undefined };
        return;
      }
      if (!s.live) return;
      const lesson = s.lesson;
      const t = now();
      const recent = s.sentences.slice(-3).map((x) => x.clean ?? x.raw);
      if (!recent.length && !ask) return;
      s.inFlight = true;
      if (force || ask) setListening(true);
      const abort = (s.abort = new AbortController());
      // A "Bubbles, …" request is about the diagram on screen, which is the pinned one while pinned. The reply
      // applies to that diagram even if the pin moves while it's being drawn.
      const about = (ask && findDiagram(s.pinnedId)) || s.current;
      // A hung call would hold every later check and request behind it.
      const timeout = setTimeout(() => abort.abort("timeout"), DIAGRAM_TIMEOUT_MS);
      let drew = false;
      // A request to Bubbles that changes nothing on screen shouldn't fail silently.
      const tellTeacher = (failed: boolean) => {
        if (!ask || drew || s.lesson !== lesson || !s.live) return;
        setBubblesNote(failed ? "I couldn't draw that just now. Try again?" : "I wasn't sure what to draw. Try naming it.");
        clearTimeout(s.noteTimer);
        s.noteTimer = setTimeout(() => setBubblesNote(null), 4500);
      };
      try {
        const allowCreate = s.streak >= 1 && t - s.lastCreatedAt >= NEW_DIAGRAM_GAP_S && t >= s.quietUntil;
        const res = await fetch("/api/diagram", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // A "Bubbles, …" request is about the diagram on screen, which is the pinned one while pinned.
          body: JSON.stringify({ recent, current: about, allowCreate, force, ask }),
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
              if (s.lesson === lesson && s.live) {
                setListening(false);
                setDrawing(true);
              }
            } else reply = line;
          }
        }
        if (reply.error) console.error("diagram", reply.error);
        if (s.lesson !== lesson || !s.live) return;
        if (reply.jev && !ask) { // a word to Bubbles ("thanks, Bubbles") says nothing about the lesson's pace
          s.streak = reply.jev.drawable >= DRAWABLE ? s.streak + 1 : 0;
        }
        if (reply.action === "update" && reply.ops?.length) {
          const target = findDiagram(about?.id ?? null);
          // The pinned diagram is frozen, except when the teacher asks Bubbles to change it.
          if (target && (target.id !== s.pinnedId || ask)) {
            const next = applyOps(target, reply.ops);
            drew = JSON.stringify({ ...next, fresh: [] }) !== JSON.stringify({ ...target, fresh: [] });
            if (target.id === s.current?.id) setCur(next);
            else {
              s.archive = s.archive.map((x) => (x.id === target.id ? { ...next, fresh: [] } : x));
              setArchive(s.archive);
            }
          }
        } else if (reply.action === "new_topic" && reply.kind && reply.ops?.length) {
          const next = applyOps(emptyDiagram(reply.kind, t), reply.ops);
          // A diagram needs a title: Jev's same-topic check and the transcript thumbnail both use it.
          next.title ||=
            next.nodes[0]?.label ?? next.events[0]?.label ?? next.curves[0]?.label ?? next.letters?.[0]?.text ?? next.columns?.[0]?.label ?? next.bars?.[0]?.label ??
            (next.sets?.length ? next.sets.map((x) => x.label).join(" and ") : "Diagram");
          if (!isEmpty(next)) {
            drew = true;
            fileAway(s.current);
            setCur(next);
            s.lastCreatedAt = t;
          }
        }
        if (!reply.ignored) tellTeacher(!!reply.error);
        // Not a request after all ("thanks, Bubbles"): the sentences it held back get their automatic check.
        else s.queued ??= { force: false };
      } catch (e) {
        if (abort.signal.reason === "timeout" || !abort.signal.aborted) {
          console.error("diagram request failed", e);
          tellTeacher(true);
        }
      } finally {
        clearTimeout(timeout);
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
    (texts: string[], nameJustHeard = false) => {
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
                s.sentences = s.sentences.map((x) => (x.id === sentence.id && !x.edited ? { ...x, clean: text } : x));
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
      if (added.length && !s.catchingUp && !s.summon && !nameJustHeard) void checkDiagram();
    },
    [checkDiagram, pickIcon],
  );

  // Settles whatever is still pending. A lone closing mark (sent at the start of the next phrase)
  // belongs to the last sentence rather than becoming a sentence of its own.
  const settleRest = useCallback(() => {
    const s = r.current;
    const rest = s.pending.trim();
    s.pending = "";
    s.beforePause = "";
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
  const settleLater = useCallback(() => {
    const s = r.current;
    clearTimeout(s.settleTimer);
    s.settleTimer = setTimeout(settleRest, SETTLE_AFTER_PAUSE_MS);
  }, [settleRest]);

  // "Bubbles, draw …": the request is everything from the sentence where the name was heard up to the
  // teacher's next pause. It goes straight to the diagram step, skipping Jev's drawable check and pacing.
  // What the teacher has said since Bubbles' name, and whether it's a whole request yet.
  const summonText = () => {
    const s = r.current;
    return [...s.sentences.slice(s.summon!.start).map(said), s.pending].join(" ").trim();
  };
  const isRequest = (text: string) => {
    const words = text.replace(FILLER, " ").match(/[a-z0-9']+/gi) ?? [];
    return words.length >= 2 && !UNFINISHED.test(text);
  };

  const fireSummon = useCallback(() => {
    const s = r.current;
    if (!s.summon) return;
    clearTimeout(s.summon.timer);
    settleRest(); // while still listening, so the request's last words don't start an automatic check
    const { start } = s.summon;
    s.summon = null;
    const ask = s.sentences.slice(start).map(said).join(" ");
    if (ask.trim()) void checkDiagram(true, ask);
    else setListening(false);
  }, [settleRest, checkDiagram]);

  // The window ran out. Anything said after the name goes to Jev, which knows a request from a remark better
  // than these word rules; only a bare "Hey Bubbles" is dropped.
  const giveUpSummon = useCallback(() => {
    const s = r.current;
    if (!s.summon) return;
    if (/[a-z0-9]/i.test(summonText().replace(FILLER, " "))) return fireSummon();
    s.summon = null;
    setListening(false);
    settleLater();
  }, [fireSummon, settleLater]);

  // Called on every new piece of speech and at every pause while Bubbles is listening: fire once a whole
  // request has been said and the teacher pauses; otherwise keep listening ("Hey Bubbles." … "Could you …").
  const awaitRequest = useCallback(
    (paused: boolean) => {
      const s = r.current;
      if (!s.summon) return;
      clearTimeout(s.summon.timer);
      const ready = isRequest(summonText());
      if (ready && paused) return fireSummon();
      if (paused) settleLater();
      s.summon.timer = ready ? setTimeout(fireSummon, SUMMON_QUIET_MS) : setTimeout(giveUpSummon, SUMMON_GIVE_UP_MS);
    },
    [fireSummon, giveUpSummon, settleLater],
  );

  const listenForBubbles = useCallback(() => {
    const s = r.current;
    const heard = countWake(s);
    if (heard > s.wakeSeen) {
      // "The sun heats the ocean" [pause] "bubbles, draw the water cycle": the words before the pause are lecture,
      // not part of the request (Jev ignores a request buried in them), so they settle as their own sentence.
      const held = s.beforePause;
      if (held.trim() && s.pending.startsWith(held) && !WAKE.test(held)) {
        s.pending = s.pending.slice(held.length).replace(/^\s*[,;:]+/, "");
        setPending(s.pending);
        settle([held.trim()], true);
      }
      WAKE.lastIndex = 0;
      // Attentive the moment the name is heard; drawing only starts once the server confirms. Each new
      // mention restarts the window at its own sentence, so "Thank you, Bubbles… Okay Bubbles, draw…"
      // asks only for what follows the latest mention.
      const pendingHasName = WAKE.test(s.pending);
      WAKE.lastIndex = 0;
      const start = pendingHasName ? s.sentences.length : Math.max(0, s.sentences.length - 1);
      if (s.summon) {
        clearTimeout(s.summon.timer);
        s.summon.start = start;
      } else s.summon = { start };
      setListening(true);
    }
    s.wakeSeen = heard;
    awaitRequest(false);
  }, [awaitRequest, settle]);
  // The held speech is all in: show it in one go, then run the diagram check its sentences skipped.
  const caughtUp = useCallback(() => {
    const s = r.current;
    if (!s.catchingUp) return;
    s.catchingUp = false;
    setCatchUp(null);
    setLanding(s.nextId);
    const lesson = s.lesson;
    setTimeout(() => s.lesson === lesson && setLanding(null), LAND_MS);
    if (!s.summon) void checkDiagram();
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
        clearTimeout(s.settleTimer);
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
        // The name often arrives as the words that close the previous sentence: Bubbles' request comes next.
        // Counted before splitting, so a name inside the sentence that settles now counts too.
        const named = countWake(s) > s.wakeSeen;
        const { done, rest } = splitSettled(s.pending);
        s.pending = rest;
        setPending(rest);
        if (done.length) settle(done, named);
        if (!s.ending) listenForBubbles(); // a "Bubbles" heard while End drains the last words starts nothing
      },
      onPause: () => {
        if (!mine() || s.ending) return; // End settles the last words itself
        s.beforePause = s.pending;
        if (s.summon) awaitRequest(true);
        else settleLater();
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
  }, [settle, settleLater, pickIcon, caughtUp, title, awaitRequest, listenForBubbles]);

  const cancel = useCallback(() => {
    const s = r.current;
    stopAudio();
    s.live = false;
    s.stt?.close();
    // Nothing from the cancelled start carries into the next one.
    clearTimeout(s.summon?.timer);
    clearTimeout(s.settleTimer);
    s.abort?.abort();
    Object.assign(s, { cleans: [], pending: "", beforePause: "", sentences: [], muted: false, summon: null, wakeSeen: 0, queued: null });
    setPending("");
    setSentences([]);
    setMuted(false);
    setListening(false);
    setDrawing(false);
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
    clearTimeout(s.settleTimer);
    s.summon = null;
    s.queued = null;
    s.abort?.abort();
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

  // The teacher corrects a settled sentence. Kept as written: the tidy-up won't overwrite it.
  const editSentence = useCallback((id: number, text: string) => {
    const s = r.current;
    const clean = text.trim();
    const i = s.sentences.findIndex((x) => x.id === id);
    if (i < 0 || clean === (s.sentences[i].clean ?? s.sentences[i].raw)) return; // unchanged: still due its tidy-up
    if (clean) s.sentences = s.sentences.map((x) => (x.id === id ? { ...x, clean, edited: true } : x));
    else {
      s.sentences = s.sentences.filter((x) => x.id !== id);
      if (s.summon && s.summon.start > i) s.summon.start--; // his request starts at a sentence index
    }
    // Keep Bubbles' count in step, so a name edited out or deleted doesn't hide the next one (or vice versa).
    s.wakeSeen = countWake(s);
    setSentences(s.sentences);
  }, []);

  // The teacher corrects the words still arriving: they settle as a sentence now, keeping their place and
  // time, so words said meanwhile continue after them. Returns the sentence to edit.
  const editPending = useCallback(() => {
    const s = r.current;
    const id = s.nextId;
    settleRest();
    return s.sentences.some((x) => x.id === id) ? id : null;
  }, [settleRest]);

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

  // Pins diagram `id` (default: the newest); clicking Pin on the pinned diagram unpins it, and on
  // another diagram moves the pin there.
  const togglePin = useCallback((id?: string) => {
    const s = r.current;
    const target = id ?? s.current?.id ?? null;
    s.pinnedId = s.pinnedId === target ? null : target;
    setPinnedId(s.pinnedId);
  }, []);

  const dismiss = useCallback(() => {
    fileAway(r.current.current);
    setCur(null);
    r.current.pinnedId = null;
    setPinnedId(null);
    r.current.quietUntil = now() + DISMISS_S;
  }, [fileAway]);

  const reset = useCallback(() => {
    r.current.lesson++;
    clearTimeout(r.current.settleTimer);
    clearTimeout(r.current.summon?.timer);
    r.current.abort?.abort();
    setMuted(false);
    Object.assign(r.current, {
      muted: false,
      live: false,
      ending: false,
      subject: "other",
      catchingUp: false, cleans: [],
      pending: "", sentences: [], current: null, archive: [], todos: [], pinnedId: null, streak: 0,
      lastCreatedAt: -Infinity, quietUntil: -Infinity, iconPicked: false, queued: null, wakeSeen: 0, summon: null, beforePause: "",
    });
    setCatchUp(null);
    setLanding(null);
    setListening(false);
    setDrawing(false);
    setSentences([]);
    setPending("");
    setCurrent(null);
    setArchive([]);
    setTodos([]);
    setPinnedId(null);
    setSubject("other");
    setLessonExport(null);
    setExportError(null);
    setError(null);
    setTitle("");
    setPhase("ready");
    warmStt();
  }, []);

  return {
    phase, title, setTitle, startedAt, endedAt, level, sentences, pending, current, archive, todos, pinnedId, subject,
    lessonExport, exportError, error, clearError: () => setError(null), starting, ending, listening, drawing, bubblesNote, stopDrawing, editSentence, editPending, muted, toggleMute, saveFailed, updateTargets, catchUp, landing, start, cancel, end, retryExport: buildExport, drawThis, togglePin, dismiss, reset,
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
