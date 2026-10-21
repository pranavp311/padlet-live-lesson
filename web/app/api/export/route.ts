import { llmJson } from "@/lib/server/llm";

export type LessonExport = {
  title: string;
  sections: { heading: string; start_s: number; summary: string }[];
  key_terms: { term: string; definition: string }[];
  targets: {
    board: { posts: { subject: string; body: string }[] };
    arcade: { prompt: string; questions: { q: string; answer: string; distractors: string[] }[] };
    sandbox: { cards: { title: string; body: string; diagram_id?: string }[] };
  };
};

const SYSTEM = `You turn a classroom lesson transcript into material for students to revise with in Padlet.
Return:
{"title": short lesson title,
 "sections": [{"heading", "start_s" (seconds, from the transcript times), "summary" (1-2 clear sentences)}] in order,
 "key_terms": [{"term", "definition" (under 12 words)}] (4-8),
 "targets": {
   "board": {"posts": [{"subject", "body"}]}  (one discussion prompt per section, phrased as a question to students),
   "arcade": {"prompt": one sentence describing the quiz game for Padlet Arcade's game generator,
              "questions": [{"q", "answer", "distractors": [3 plausible wrong answers]}] (6-10)},
   "sandbox": {"cards": [{"title", "body" (2-3 sentences), "diagram_id" (optional, from the diagrams list)}]} (one revision card per section)
 }}
Only use what the teacher said. Write for students at the lesson's level.`;

type Body = {
  title: string;
  sentences: { t: number; text: string }[];
  diagrams: { id: string; kind: string; title: string; t: number }[];
};

export async function POST(req: Request) {
  const { title, sentences, diagrams } = (await req.json()) as Body;
  const transcript = sentences.map((s) => `[${Math.round(s.t)}s] ${s.text}`).join("\n");
  const user = `Teacher's title: ${title || "(none)"}\n\nDiagrams: ${JSON.stringify(diagrams)}\n\nTranscript:\n${transcript}`;
  try {
    const e = await llmJson<LessonExport>(SYSTEM, user, 4000);
    const ok =
      Array.isArray(e.sections) && Array.isArray(e.key_terms) &&
      Array.isArray(e.targets?.board?.posts) && Array.isArray(e.targets?.arcade?.questions) && Array.isArray(e.targets?.sandbox?.cards);
    if (!ok) throw new Error(`Summary is missing fields: ${JSON.stringify(e).slice(0, 300)}`);
    return Response.json(e);
  } catch (e) {
    console.error("export failed", e);
    return Response.json({ error: String(e) }, { status: 502 });
  }
}
