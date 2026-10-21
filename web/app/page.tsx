"use client";

import "./lesson.css";
import { useEffect, useState } from "react";
import { Ended, Live, Ready, Warming } from "@/components/Screens";
import { listLessons, loadLesson, type LessonRecord, type LessonSummary } from "@/lib/history";
import { useLesson } from "@/lib/useLesson";

export default function Page() {
  const l = useLesson();
  const [lessons, setLessons] = useState<LessonSummary[]>([]);
  const [past, setPast] = useState<LessonRecord | null>(null);

  // Saved lessons live in localStorage, so read them after mount (the server render has none).
  useEffect(() => {
    if (l.phase === "ready") setLessons(listLessons());
  }, [l.phase]);

  if (l.phase === "warming") return <Warming l={l} />;
  if (l.phase === "live") return <Live l={l} />;
  if (l.phase === "ended") return <Ended l={l} onDone={l.reset} doneLabel="Done" />;
  if (past) return <Ended l={past} onDone={() => setPast(null)} doneLabel="All lessons" />;
  return <Ready l={l} lessons={lessons} onOpen={(id) => setPast(loadLesson(id))} />;
}
