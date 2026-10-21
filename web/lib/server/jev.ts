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
        true: "A process, sequence, cycle, structure, events in time, a function, a molecule, a comparison of groups, or letters and the sounds they make is being explained or asked about",
        false: "Small talk, classroom management, or a definition with nothing to draw",
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
        venn: "Comparing two or three groups: what they share and what belongs to only one",
        letters: "Letters, the sounds letters make (phonics), spelling or the alphabet",
        table: "Comparing things across several features in rows and columns, or a chart to fill in (T-chart, KW-L chart, place value, Punnett square)",
        numberline: "Counting on or back, adding or subtracting along a line, negative numbers, rounding, or placing numbers or fractions in order on a line",
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

// Probability that the teacher is actually asking Bubbles for something (Bubbles answers with a diagram),
// not thanking him or talking about him. Measured: "Bubbles, could you explain/draw …" 0.93–0.97;
// "Thank you Bubbles… as Bubbles drew here…" 0.35; "Bubbles is a funny name" 0.05.
export async function asksBubbles(text: string): Promise<number> {
  const a = await ask(text, {
    asked: {
      type: "noul",
      instructions: "The teacher is asking Bubbles, the class's drawing helper, to draw, show, explain, write or add something, or asking Bubbles a question it can answer with a picture",
      criteria: {
        true: "A direct request or question to Bubbles, e.g. 'Bubbles, could you draw…', 'Bubbles, explain…', 'Help me visualise X, Bubbles', 'Hey Bubbles. Show us…' or 'Bubbles, what letter makes the sound s?'",
        false: "Thanking Bubbles, talking about Bubbles or what it drew, or a request to the students",
      },
    },
  });
  return a.asked.noul;
}

// Probability that a request to Bubbles is about changing or adding to the diagram already on screen
// ("write the formula underneath our drawing") rather than asking for a new one.
// `context` is the last few sentences and `onScreen` describes the diagram's title and labels, so "these
// letters" or "it" can be matched to what's on screen. Measured: "show these letters on the board" 0.85,
// "write the formula underneath our drawing" 0.91; new topics 0.03–0.31.
export async function editsDiagram(request: string, context: string, onScreen: string): Promise<number> {
  const a = await ask(`Earlier: ${context}\nRequest: ${request}`, {
    edits: {
      type: "noul",
      instructions: `The request is about the diagram already on screen: it refers to things on it (its labels, 'these', 'it', 'our drawing') or asks to add, label, highlight or show something on it, rather than asking for a different topic. On screen: ${onScreen}.`,
    },
  });
  return a.edits.noul;
}

// Picks the lesson's subject (and so its icon) from the title, or the first sentences if there's no title.
export async function pickSubject(text: string): Promise<Subject> {
  const a = await ask(text, {
    subject: { type: "choice", instructions: "The school subject this lesson is about", criteria: SUBJECTS },
  });
  return a.subject.choice;
}
