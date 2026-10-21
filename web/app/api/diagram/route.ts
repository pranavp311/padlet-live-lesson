import { route, type Route } from "@/lib/server/jev";
import { llmJson } from "@/lib/server/llm";
import type { Diagram, Kind, Op } from "@/lib/diagram";

const DRAWABLE = 0.75;

const OPS: Record<Kind, string> = {
  flow: `{"op":"add_node","id":"sun","label":"Sunlight","role":"input|process|output|other"}, {"op":"add_edge","from":"sun","to":"leaf","label":"optional"}, {"op":"relabel","id":"sun","label":"..."}`,
  cycle: `{"op":"add_node","id":"evap","label":"Evaporation","role":"process"} in cycle order, {"op":"add_edge","from":"evap","to":"cond"}; close the loop with an edge back to the first node`,
  timeline: `{"op":"add_event","id":"e1","when":"1914","label":"War begins"} in date order`,
  graph: `{"op":"set_axes","x":[-5,5],"y":[-2,10]}, {"op":"add_curve","id":"f","expr":"x^2 - 2x + 1","label":"y = x² − 2x + 1"} (expr in mathjs syntax using x), {"op":"add_point","id":"v","x":1,"y":0,"label":"vertex"}, and for geometry {"op":"add_segment","id":"a","from":[0,0],"to":[3,0],"label":"a = 3"} (shapes are made of segments; set axes so the shape fits with a margin)`,
  molecule: `{"op":"set_smiles","smiles":"OC[C@H]1OC(O)[C@H](O)[C@@H](O)[C@@H]1O"} (valid SMILES)`,
};

const SYSTEM = (kind: Kind) => `You draw a ${kind} diagram live while a teacher talks, for a projected classroom screen.
You never write drawing code. You return changes to the diagram as ops:
${OPS[kind]}
plus {"op":"set_title","title":"Short title"}.
Rules: labels are 1-3 words; at most 8 nodes or events in total; only add what the teacher has actually said; reuse existing ids; never repeat existing parts.
Return {"action":"update"|"new_topic"|"none","ops":[...]}. Use "new_topic" only when the teacher has clearly moved to a different topic than the current diagram; then ops describe the new diagram. Use "none" when nothing new is worth drawing.`;

type Body = { recent: string[]; current: Diagram | null; allowCreate: boolean; force?: boolean; ask?: string };
type LlmReply = { action: "update" | "new_topic" | "none"; ops: Op[] };

// Replies as NDJSON in up to two lines, so the client can start the drawing animation (with a Stop
// button) as soon as Jev has decided, before the slower LLM step:
//   {"jev": …, "drawing": true}                 drawing is coming
//   {"jev"?: …, "action", "kind"?, "ops"?, "error"?}   the result (always the last line)
export async function POST(req: Request) {
  const { recent, current, allowCreate, force, ask } = (await req.json()) as Body;
  const said = recent.join(" ");
  return ndjson(async (send) => {
    if (ask) return send(await drawRequest(ask, said, send));

    let jev: Route;
    try {
      jev = await route(said, current?.title || null);
    } catch (e) {
      console.error("jev failed", e);
      return send({ error: String(e) });
    }

    const kind: Kind | null = jev.kind !== "none" ? jev.kind : force ? (current?.kind ?? "flow") : null;
    const wantsDrawing = force || (jev.drawable >= DRAWABLE && kind);
    if (!wantsDrawing || !kind) return send({ jev, action: "none" });

    // Update the diagram on screen only if Jev says the topic hasn't moved on and the kind still fits.
    const sameTopic = !!current && current.kind === kind && (jev.sameTopic ?? 0) >= 0.5;
    if (!sameTopic && !allowCreate && !force) return send({ jev, action: "none" });

    send({ jev, drawing: true });
    const target = sameTopic ? current : null;
    const user = `${target ? `Current diagram:\n${JSON.stringify(compact(target))}` : "No diagram yet."}\n\nTeacher just said: ${said}`;
    try {
      const reply = await llmJson<LlmReply>(SYSTEM(kind), user, 800);
      let action = !target ? (reply.action === "none" ? "none" : "new_topic") : reply.action;
      // A topic change found while updating still has to respect the client's pacing rules.
      if (target && action === "new_topic" && !allowCreate && !force) action = "none";
      send({ jev, action, kind, ops: Array.isArray(reply.ops) ? reply.ops : [] });
    } catch (e) {
      console.error("diagram llm failed", e);
      send({ jev, error: String(e) });
    }
  });
}

// The teacher asked Bubbles for a diagram by name: Jev only picks the kind, and it's always a new diagram.
async function drawRequest(ask: string, said: string, send: (line: object) => void) {
  send({ drawing: true });
  try {
    const jev = await route(ask, null);
    const kind: Kind = jev.kind !== "none" ? jev.kind : "flow";
    const user = `The teacher asked you, Bubbles, directly: "${ask}"\nDraw exactly what they asked for, even if they haven't explained it yet; use your own knowledge for the content.\nEarlier in the lesson: ${said}`;
    const reply = await llmJson<LlmReply>(SYSTEM(kind), user, 800);
    return { jev, action: "new_topic", kind, ops: Array.isArray(reply.ops) ? reply.ops : [] };
  } catch (e) {
    console.error("bubbles request failed", e);
    return { error: String(e) };
  }
}

function ndjson(run: (send: (line: object) => void) => Promise<unknown>) {
  const enc = new TextEncoder();
  const body = new ReadableStream({
    async start(c) {
      await run((line) => c.enqueue(enc.encode(JSON.stringify(line) + "\n")));
      c.close();
    },
  });
  return new Response(body, { headers: { "Content-Type": "application/x-ndjson" } });
}

function compact(d: Diagram) {
  return { title: d.title, nodes: d.nodes, edges: d.edges, events: d.events, axes: d.axes, curves: d.curves, points: d.points, segments: d.segments, smiles: d.smiles };
}
