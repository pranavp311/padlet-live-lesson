"use client";

import "./lesson.css";
import { Ended, Live, Ready, Warming } from "@/components/Screens";
import { useLesson } from "@/lib/useLesson";

export default function Page() {
  const l = useLesson();
  if (l.phase === "warming") return <Warming l={l} />;
  if (l.phase === "live") return <Live l={l} />;
  if (l.phase === "ended") return <Ended l={l} />;
  return <Ready l={l} />;
}
