"use client";

import "./lesson.css";
import { useCallback, useEffect, useState } from "react";
import { Ended, Live, Ready, Warming } from "@/components/Screens";
import { deleteLesson, listLessons, loadLesson, saveLesson, type LessonRecord, type LessonSummary } from "@/lib/history";
import { summarise } from "@/lib/summary";
import { useLesson } from "@/lib/useLesson";

export default function Page() {
  const l = useLesson();
  // null until read from localStorage, so the first render never claims there are no lessons.
  const [lessons, setLessons] = useState<LessonSummary[] | null>(null);
  const [past, setPast] = useState<LessonRecord | null>(null);
  // A failed summary, for the lesson it failed for (a late failure mustn't show on another lesson).
  const [pastError, setPastError] = useState<{ id: string; message: string } | null>(null);

  // Saved lessons live in localStorage, so read them after mount (the server render has none).
  useEffect(() => {
    if (l.phase === "ready") setLessons(listLessons());
  }, [l.phase]);

  // A saved lesson without its summary yet: still being built (the teacher left before it arrived), or lost (the page
  // was reloaded meanwhile). Either way wait for it, starting it again if need be, and show it when it lands.
  const pastId = past && !past.lessonExport ? past.id : null;
  const summarisePast = useCallback(() => {
    const p = pastId ? loadLesson(pastId) : null;
    if (!p) return Promise.resolve();
    // It may have landed since the lesson was opened: show it rather than asking again.
    if (p.lessonExport) {
      setPast((now) => (now?.id === p.id ? { ...now, lessonExport: p.lessonExport } : now));
      return Promise.resolve();
    }
    setPastError(null);
    return summarise(p)
      .then((lessonExport) => setPast((now) => (now?.id === p.id ? { ...now, lessonExport } : now)))
      .catch((e) => {
        console.error("export failed", e);
        setPastError({ id: p.id, message: "Couldn't build the summary." });
      });
  }, [pastId]);
  useEffect(() => {
    if (pastId) void summarisePast();
  }, [pastId, summarisePast]);

  if (l.phase === "warming") return <Warming l={l} />;
  if (l.phase === "live") return <Live l={l} />;
  if (l.phase === "ended") return <Ended l={l} onDone={l.reset} doneLabel="Done" />;
  if (past) {
    const updateTargets = (targets: NonNullable<LessonRecord["lessonExport"]>["targets"]) => {
      const next = { ...past, lessonExport: past.lessonExport && { ...past.lessonExport, targets } };
      saveLesson(next);
      setPast(next);
    };
    const exportError = pastError?.id === past.id && !past.lessonExport ? pastError.message : null;
    return <Ended l={{ ...past, updateTargets, exportError, retryExport: summarisePast }} onDone={() => setPast(null)} doneLabel="All lessons" />;
  }
  const remove = (id: string) => {
    const ok = deleteLesson(id);
    setLessons(listLessons());
    return ok;
  };
  return <Ready l={l} lessons={lessons} onOpen={(id) => setPast(loadLesson(id))} onDelete={remove} />;
}
