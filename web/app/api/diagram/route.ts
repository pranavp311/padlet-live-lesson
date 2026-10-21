import { route, type Route } from "@/lib/server/jev";
import { llmJson } from "@/lib/server/llm";
import type { Diagram, Kind, Op } from "@/lib/diagram";

const DRAWABLE = 0.75;

const OPS: Record<Kind, string> = {
  flow: `{"op":"add_node","id":"sun","label":"Sunlight","role":"input|process|output|other"}, {"op":"add_edge","from":"sun","to":"leaf","label":"optional"}, {"op":"relabel","id":"sun","label":"..."}`,
  cycle: `{"op":"add_node","id":"evap","label":"Evaporation","role":"process"} in cycle order, {"op":"add_edge","from":"evap","to":"cond"}; close the loop with an edge back to the first node`,
  timeline: `{"op":"add_event","id":"e1","when":"1914","label":"War begins"} in date order`,
  graph: `{"op":"set_axes","x":[-5,5],"y":[-2,10]}, {"op":"add_curve","id":"f","expr":"x^2 - 2x + 1","label":"y = x² − 2x + 1"} (expr in mathjs syntax using x), {"op":"add_point","id":"v","x":1,"y":0,"label":"vertex"}`,
  molecule: `{"op":"set_smiles","smiles":"OC[C@H]1OC(O)[C@H](O)[C@@H](O)[C@@H]1O"} (valid SMILES)`,
};

const SYSTEM = (kind: Kind) => `You draw a ${kind} diagram live while a teacher talks, for a projected classroom screen.
You never write drawing code. You return changes to the diagram as ops:
${OPS[kind]}
plus {"op":"set_title","title":"Short title"}.
Rules: labels are 1-3 words; at most 8 nodes or events in total; only add what the teacher has actually said; reuse existing ids; never repeat existing parts.
Return {"action":"update"|"new_topic"|"none","ops":[...]}. Use "new_topic" only when the teacher has clearly moved to a different topic than the current diagram; then ops describe the new diagram. Use "none" when nothing new is worth drawing.`;

type Body = { recent: string[]; current: Diagram | null; allowCreate: boolean; force?: boolean };
type LlmReply = { action: "update" | "new_topic" | "none"; ops: Op[] };

export async function POST(req: Request) {
  const { recent, current, allowCreate, force } = (await req.json()) as Body;
  const said = recent.join(" ");

  let jev: Route;
  try {
    jev = await route(said, current?.title || null);
  } catch (e) {
    console.error("jev failed", e);
    return Response.json({ error: String(e) }, { status: 502 });
  }

  const kind: Kind | null = jev.kind !== "none" ? jev.kind : force ? (current?.kind ?? "flow") : null;
  const wantsDrawing = force || (jev.drawable >= DRAWABLE && kind);
  if (!wantsDrawing || !kind) return Response.json({ jev, action: "none" });

  // Update the diagram on screen only if Jev says the topic hasn't moved on and the kind still fits.
  const sameTopic = !!current && current.kind === kind && (jev.sameTopic ?? 0) >= 0.5;
  if (!sameTopic && !allowCreate && !force) return Response.json({ jev, action: "none" });

  const target = sameTopic ? current : null;
  const user = `${target ? `Current diagram:\n${JSON.stringify(compact(target))}` : "No diagram yet."}\n\nTeacher just said: ${said}`;
  try {
    const reply = await llmJson<LlmReply>(SYSTEM(kind), user, 800);
    let action = !target ? (reply.action === "none" ? "none" : "new_topic") : reply.action;
    // A topic change found while updating still has to respect the client's pacing rules.
    if (target && action === "new_topic" && !allowCreate && !force) action = "none";
    return Response.json({ jev, action, kind, ops: Array.isArray(reply.ops) ? reply.ops : [] });
  } catch (e) {
    console.error("diagram llm failed", e);
    return Response.json({ jev, error: String(e) }, { status: 502 });
  }
}

function compact(d: Diagram) {
  return { title: d.title, nodes: d.nodes, edges: d.edges, events: d.events, axes: d.axes, curves: d.curves, points: d.points, smiles: d.smiles };
}
