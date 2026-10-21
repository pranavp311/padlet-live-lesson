import "server-only";

// Benchmarked 21 Oct vs claude-haiku-5.5: same tidy-up speed, faster diagrams (1.3 s vs 1.8 s median), half the input price.
const MODEL = "deepseek/deepseek-v4.1-flash";

async function chat(system: string, user: string, maxTokens: number, json = false): Promise<string> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      temperature: 0,
      // The model reasons by default on OpenRouter: slower, and some replies came back as
      // reasoning only with null content. These are short, mechanical tasks, so reasoning is off.
      reasoning: { effort: "none" },
      ...(json && { response_format: { type: "json_object" } }),
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const choice = (await res.json()).choices?.[0];
  const content: string | null = choice?.message?.content ?? null;
  if (!content) throw new Error(`Empty reply (finish_reason=${choice?.finish_reason}): ${JSON.stringify(choice).slice(0, 300)}`);
  return content.trim();
}

export const llmText = (system: string, user: string, maxTokens = 300) => chat(system, user, maxTokens);

// A chat call that must answer with one JSON object.
export async function llmJson<T>(system: string, user: string, maxTokens = 1200): Promise<T> {
  const text = await chat(`${system}\n\nReply with one JSON object and nothing else.`, user, maxTokens, true);
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error(`No JSON in reply: ${text.slice(0, 200)}`);
  try {
    return JSON.parse(text.slice(start, end + 1)) as T;
  } catch (e) {
    throw new Error(`${e} in reply: ${text.slice(0, 400)}`);
  }
}
