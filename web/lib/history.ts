import type { Diagram } from "@/lib/diagram";
import type { Subject } from "@/lib/subject";
import type { Todo } from "@/lib/todo";
import type { Sentence } from "@/lib/transcript";
import type { LessonExport } from "@/app/api/export/route";

// Finished lessons, kept in this browser's localStorage (demo storage: one browser, no sign-in).
// At Padlet scale this becomes a server-side lessons store; see architecture-scale.excalidraw.

export type LessonRecord = {
  id: string;
  title: string;
  subject: Subject;
  startedAt: number;
  endedAt: number;
  sentences: Sentence[];
  archive: Diagram[];
  todos: Todo[];
  lessonExport: LessonExport | null;
};

export type LessonSummary = Pick<LessonRecord, "id" | "title" | "subject" | "startedAt" | "endedAt"> & {
  diagrams: number;
  todos?: number; // older saved lessons don't have these two
  cover?: Diagram; // the first diagram, shown on the dashboard card
};

const INDEX = "live-lesson:index";
const KEY = (id: string) => `live-lesson:lesson:${id}`;

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null; // storage blocked (private window) or corrupt: treat as empty
  }
}

export function listLessons(): LessonSummary[] {
  return read<LessonSummary[]>(INDEX) ?? [];
}

export function loadLesson(id: string): LessonRecord | null {
  return read<LessonRecord>(KEY(id));
}

// Returns false when the browser refuses (storage full or blocked), so the caller can say so.
export function saveLesson(l: LessonRecord): boolean {
  try {
    localStorage.setItem(KEY(l.id), JSON.stringify({ ...l, archive: l.archive.map((d) => ({ ...d, fresh: [] })) }));
    const summary: LessonSummary = {
      id: l.id, title: l.title, subject: l.subject, startedAt: l.startedAt, endedAt: l.endedAt, diagrams: l.archive.length,
      todos: l.todos.length, cover: l.archive[0] && { ...l.archive[0], fresh: [] },
    };
    localStorage.setItem(INDEX, JSON.stringify([summary, ...listLessons().filter((x) => x.id !== l.id)]));
    return true;
  } catch (e) {
    console.error("couldn't save lesson", e);
    return false;
  }
}
