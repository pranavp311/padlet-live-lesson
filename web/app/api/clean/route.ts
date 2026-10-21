import { reminder } from "@/lib/server/jev";
import { llmJson, llmText } from "@/lib/server/llm";
import { TODO_KINDS, type Todo } from "@/lib/todo";

// Runs once per settled sentence: tidies it, and asks Jev whether it's a reminder for students.
// Only when Jev says yes does an LLM pull out the to-do item.

const REMINDER = 0.7;

const CLEAN = `You tidy one sentence of a live classroom transcript.
Remove filler words (um, uh, you know, like) and false starts. Fix punctuation and obvious mis-hearings of subject terms, using the earlier sentences as context.
Never add, explain or summarise, and never swap one real word for another ("Hey" stays "Hey"). Keep the teacher's wording. Reply with the tidied sentence only.`;

const TODO = `A teacher just told students about something to do or remember after class.
Return {"todo": {"kind": one of ${TODO_KINDS.join(", ")}, "text": short student-facing note, at most 7 words, naming what it is when the teacher says so, e.g. "Photosynthesis worksheet due Friday" or "Biology exam next week", "due": when, as the teacher said it, or omit}} .
If it's already in the existing list, or it isn't really a task for students, return {"todo": null}.`;

type Body = { sentence: string; context: string[]; todos?: Todo[] };

export async function POST(req: Request) {
  const { sentence, context, todos = [] } = (await req.json()) as Body;
  const [clean, isReminder] = await Promise.allSettled([
    llmText(CLEAN, `Earlier: ${context.join(" ") || "(none)"}\n\nSentence: ${sentence}`),
    reminder([...context.slice(-1), sentence].join(" ")),
  ]);
  if (clean.status === "rejected") console.error("clean failed", clean.reason);
  if (isReminder.status === "rejected") console.error("reminder check failed", isReminder.reason);
  const text = clean.status === "fulfilled" ? clean.value : undefined;

  let todo: Todo | null = null;
  if (isReminder.status === "fulfilled" && isReminder.value >= REMINDER) {
    try {
      const existing = todos.map((t) => t.text).join("; ") || "(empty)";
      const reply = await llmJson<{ todo: Omit<Todo, "id"> | null }>(
        TODO,
        `Existing list: ${existing}\n\nTeacher said: ${[...context.slice(-1), text ?? sentence].join(" ")}`,
        200,
      );
      const t = reply.todo;
      if (t && typeof t.text === "string" && t.text.trim()) {
        todo = {
          id: "", // the client assigns ids
          kind: TODO_KINDS.includes(t.kind) ? t.kind : "other",
          text: t.text.trim(),
          ...(typeof t.due === "string" && t.due && { due: t.due }),
        };
      }
    } catch (e) {
      console.error("todo extraction failed", e);
    }
  }
  return Response.json({ text, todo });
}
