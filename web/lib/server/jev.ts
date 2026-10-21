import "server-only";
import type { Kind } from "@/lib/diagram";
import { SUBJECTS, type Subject } from "@/lib/subject";

// Jev (TypeSafe's System One model): typed answers with calibrated probabilities, no text.
// Docs: https://docs.typesafe.ai/api/system-one

export type Route = { drawable: number; kind: Kind | "none"; kindConfidence: number; sameTopic: number | null };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ask(state: string, questions: object): Promise<any> {
  const res = await fetch("https://api.typesafe.ai/v1/systemone", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.TYPESAFE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: "jev-latest", state, questions }),
  });
  if (!res.ok) throw new Error(`Jev ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()).answers;
}

// Probability that this sentence gives students something to remember or do after class.
export async function reminder(sentence: string): Promise<number> {
  const a = await ask(sentence, {
    reminder: {
      type: "noul",
      instructions: "The teacher is telling students about something they need to do or remember after class",
      criteria: {
        true: "Homework, an upcoming exam or quiz, a deadline, or something to bring",
        false: "Teaching content, questions to the class, or classroom management",
      },
    },
  });
  return a.reminder.noul;
}

// `onScreen` is the current diagram's title; it goes in a question, not the state, so it can't bias the kind.
export async function route(said: string, onScreen: string | null): Promise<Route> {
  const a = await ask(said, {
    drawable: {
      type: "noul",
      instructions: "The teacher is explaining something that a simple diagram would make clearer right now",
      criteria: {
        true: "A process, sequence, cycle, structure, events in time, a function or a molecule is being explained",
        false: "Small talk, classroom management, a definition with nothing to draw, or a question to students",
      },
    },
    kind: {
      type: "choice",
      instructions: "The best diagram for what the teacher is explaining",
      criteria: {
        flow: "Steps, inputs and outputs, or cause and effect",
        cycle: "A process that repeats and returns to its start",
        timeline: "Events placed in date order",
        graph: "A math function, data on axes, or a geometry figure (triangles, angles, lengths)",
        molecule: "The structure of a specific chemical compound",
        none: "Nothing to draw",
      },
    },
    ...(onScreen && {
      same_topic: {
        type: "noul",
        instructions: `The teacher is still explaining the same topic as the diagram "${onScreen}"`,
      },
    }),
  });
  return {
    drawable: a.drawable.noul,
    kind: a.kind.choice,
    kindConfidence: a.kind.confidence,
    sameTopic: a.same_topic?.noul ?? null,
  };
}

// Picks the lesson's subject (and so its icon) from the title, or the first sentences if there's no title.
export async function pickSubject(text: string): Promise<Subject> {
  const a = await ask(text, {
    subject: { type: "choice", instructions: "The school subject this lesson is about", criteria: SUBJECTS },
  });
  return a.subject.choice;
}
