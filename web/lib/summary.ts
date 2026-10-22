import type { LessonExport } from "@/app/api/export/route";
import { loadLesson, saveLesson, type LessonRecord } from "@/lib/history";

// Building a lesson's summary (sections, key terms, what to send to Padlet) takes a while, so it carries on when the
// teacher leaves the summary screen: when it arrives it's written into the saved lesson, whoever is looking. One
// request per lesson: opening the lesson again while it's being built waits for the same one.
const building = new Map<string, Promise<LessonExport>>();

export function summarise(l: Pick<LessonRecord, "id" | "title" | "sentences" | "archive">): Promise<LessonExport> {
  let job = building.get(l.id);
  if (!job) {
    job = fetch("/api/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: l.title,
        sentences: l.sentences.map((x) => ({ t: x.t, text: x.clean ?? x.raw })),
        diagrams: l.archive.map((d) => ({ id: d.id, kind: d.kind, title: d.title, t: d.t })),
      }),
    })
      .then((res) => res.json())
      .then((data: LessonExport & { error?: string }) => {
        if (data.error) throw new Error(data.error);
        const saved = loadLesson(l.id);
        if (saved) saveLesson({ ...saved, lessonExport: data });
        return data;
      })
      .finally(() => building.delete(l.id));
    building.set(l.id, job);
  }
  return job;
}
