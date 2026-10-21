import { asksBubbles, editsDiagram, route, type Route } from "@/lib/server/jev";
import { llmJson } from "@/lib/server/llm";
import type { Diagram, Kind, Op } from "@/lib/diagram";

const DRAWABLE = 0.75;
const ASKED = 0.7; // Jev's probability that a "Bubbles, …" sentence really asks him for something, or asks for an edit

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
plus {"op":"set_title","title":"Short title"} and {"op":"set_caption","text":"a² + b² = c²"} (one short line shown under the diagram, e.g. a formula or key fact).
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
    if (ask) return send(await drawRequest(ask, said, current, send));

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
      console.info("diagram", JSON.stringify({ path: force ? "draw-this" : "auto", said: said.slice(-160), jev, kind, action }));
      send({ jev, action, kind, ops: Array.isArray(reply.ops) ? reply.ops : [] });
    } catch (e) {
      console.error("diagram llm failed", e);
      send({ jev, error: String(e) });
    }
  });
}

// The teacher said Bubbles' name: Jev checks it's really a request for a visual, whether it's about the
// diagram already on screen ("…underneath our drawing"), and picks the kind; only then does the client
// get "drawing" (and Bubbles start drawing). It adds to the diagram on screen, or draws a new one.
async function drawRequest(heard: string, said: string, current: Diagram | null, send: (line: object) => void) {
  // The speech model writes the name lowercase with no comma ("…theorem bubbles"), which Jev reads as the
  // word, not someone being addressed: 0.46 vs 0.98 for "…theorem, Bubbles." So write it as a name.
  const ask = heard.replace(/(\w)\s+bubbles?\b/gi, "$1, Bubbles").replace(/\bbubbles?\b/gi, "Bubbles");
  try {
    const [jev, asked, edits] = await Promise.all([
      route(ask, null),
      asksBubbles(ask),
      current ? editsDiagram(ask, said, describe(current)) : Promise.resolve(0),
    ]);
    // Bubbles answers any request (draw, show, explain…) with a diagram, but not thanks or mentions.
    if (asked < ASKED) {
      console.info("diagram", JSON.stringify({ path: "bubbles-ignored", ask, asked }));
      return { jev, action: "none", ignored: true }; // not a request (thanks, a mention): stay quiet
    }
    send({ jev, drawing: true });
    if (current && edits >= ASKED) {
      const user = `Current diagram:\n${JSON.stringify(compact(current))}\n\nThe teacher asked you, Bubbles, to change or add to this diagram: "${ask}"\nReturn action "update" with ops that add to it (use set_caption for a formula or line of text under it); use your own knowledge for the content.`;
      const reply = await llmJson<LlmReply>(SYSTEM(current.kind), user, 800);
      console.info("diagram", JSON.stringify({ path: "bubbles-edit", ask, asked, edits, kind: current.kind }));
      return { jev, action: "update", kind: current.kind, ops: Array.isArray(reply.ops) ? reply.ops : [] };
    }
    const kind: Kind = jev.kind !== "none" ? jev.kind : "flow";
    const user = `The teacher asked you, Bubbles, directly: "${ask}"\nDraw exactly what they asked for, even if they haven't explained it yet; use your own knowledge for the content.\nEarlier in the lesson: ${said}`;
    const reply = await llmJson<LlmReply>(SYSTEM(kind), user, 800);
    console.info("diagram", JSON.stringify({ path: "bubbles", ask, jev, asked, edits, kind }));
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

// "a graph titled 'Pythagoras theorem' showing: a, b, c, right angle", for Jev's edit check.
function describe(d: Diagram) {
  const labels = [
    ...d.nodes.map((n) => n.label), ...d.events.map((e) => e.label), ...d.curves.map((c) => c.label ?? ""),
    ...d.points.map((p) => p.label ?? ""), ...(d.segments ?? []).map((g) => g.label ?? ""), d.caption ?? "",
  ].filter(Boolean);
  return `a ${d.kind} titled '${d.title}'${labels.length ? ` showing: ${labels.slice(0, 12).join(", ")}` : ""}`;
}

function compact(d: Diagram) {
  return { title: d.title, nodes: d.nodes, edges: d.edges, events: d.events, axes: d.axes, curves: d.curves, points: d.points, segments: d.segments, smiles: d.smiles, caption: d.caption };
}
