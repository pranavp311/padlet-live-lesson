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
  molecule: `{"op":"set_smiles","smiles":"OC[C@H]1OC(O)[C@H](O)[C@@H](O)[C@@H]1O"} (one valid SMILES for one compound; never a reaction with ">>": for a reaction draw the main product and put the equation in set_caption)`,
  venn: `{"op":"add_set","id":"mammals","label":"Mammals"} (2 or 3 sets), then {"op":"add_item","id":"whale","label":"Whale","sets":["mammals","sea"]} (an item in several sets sits in their overlap; "sets":[] puts it outside all of them); at most 4 items per region; put what the sets share in the overlap`,
  table: `{"op":"add_column","id":"athens","label":"Athens"} (2-5 columns), {"op":"add_row","id":"gov","label":"Government"} (up to 6 rows; leave out label for a plain list), {"op":"set_cell","row":"gov","col":"athens","text":"Democracy"} (cell text 1-6 words). For a T-chart or KWL use columns with no row labels; for place value use columns "Hundreds","Tens","Ones"`,
  numberline: `{"op":"set_range","min":0,"max":10,"step":1} (at most 40 steps; use step 0.25 for quarters), {"op":"add_mark","id":"start","value":3,"label":"start"}, {"op":"add_jump","id":"j1","from":3,"to":7,"label":"+4"} (a jump back has from > to). Mark where you start and land`,
  chart: `{"op":"add_bar","id":"apples","label":"Apples","value":12,"icon":"🍎"} (one per category, at most 8; icon is one emoji, needed for a pictograph), {"op":"set_chart","style":"bar"|"pictograph","axis":"Number of children"}. Use pictograph for young children counting objects`,
  fraction: `{"op":"add_fraction","id":"f1","num":3,"den":4,"shape":"bar"|"circle","label":"three quarters"} (whole numbers, num at most den, den at most 24, at most 4 fractions). For equivalent fractions add one per fraction with the same shape, e.g. 1/2 and 2/4`,
  tree: `{"op":"add_branch","id":"start","label":"Start"} for the root (no parent), then {"op":"add_branch","id":"h","label":"Heads","parent":"start","edge":"1/2"} (edge: optional label on the link, e.g. a probability or a yes/no answer in a key); at most 15 branches; add parents before their children`,
  web: `{"op":"add_branch","id":"main","label":"Plants"} for the main idea in the middle (no parent), then {"op":"add_branch","id":"roots","label":"Roots","parent":"main"} for ideas around it, and details under those (parent: their idea); at most 15 branches, 1-3 words each`,
  parts: `{"op":"set_subject","label":"Plant cell","shape":"cell"|"circle"|"oval"|"layers"} (layers: something made of layers inside one another, like the Earth, the atmosphere or skin; list its parts from the outside in), then {"op":"add_part","id":"nucleus","label":"Nucleus","inside":true} for each part (inside: true for parts within it, false for its outer layers like the cell wall or skin; the large central part, like the nucleus, first; "fills":true for what fills the inside, like cytoplasm); at most 10 parts, labels 1-3 words`,
  math: `{"op":"add_step","id":"s1","text":"2x + 3 = 11","note":"subtract 3"} one per line of working, in order (at most 7); write maths with Unicode: x², √, ×, ÷, ½, H₂O, →; each step on one line, e.g. "2H₂ + O₂ → 2H₂O"; note is a short reason for that step`,
  map: `{"op":"add_place","id":"cairo","label":"Cairo","lat":30.0,"lon":31.2} for each real place (at most 10; real latitude and longitude in degrees), {"op":"add_route","id":"r1","from":"khartoum","to":"cairo","label":"Nile flows north"} between places (a river's course, a journey, a trade route); add places before routes that use them`,
  letters: `{"op":"add_letter","id":"m","text":"Mm","sound":"/m/","word":"moon"}: text is the letter in upper and lower case ("Ss"), or a letter group as written ("sh", "ai"); sound is the sound between slashes; word is a short example word that contains it. One add_letter per letter or sound the teacher is talking about (at most 4). "What letter makes the sound s?" draws "Ss". To split a word up, {"op":"add_word","id":"butterfly","parts":["but","ter","fly"],"mode":"syllables"|"sounds"|"parts"} (sounds: "c","a","t"; parts: prefix, root, suffix "un","help","ful"); add_word needs no add_letter`,
};

const SYSTEM = (kind: Kind) => `You draw a ${kind} diagram live while a teacher talks, for a projected classroom screen.
You never write drawing code. You return changes to the diagram as ops:
${OPS[kind]}
plus {"op":"set_title","title":"Short title"} and {"op":"set_caption","text":"a² + b² = c²"} (one short line shown under the diagram, e.g. a formula or key fact).
To take a part off when the teacher asks ("no, remove that"), use {"op":"remove","id":"…"} with its id ("caption" removes the caption).
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
  const ask = asName(heard);
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
    // The diagram on screen goes in too: a request that only adds a line of text to it ("write the formula") should
    // come back as just set_caption, which is applied to it below, rather than a redraw.
    const onScreen = current ? `\nOn screen now: ${JSON.stringify(compact(current))}\nIf the request only adds a line of text to that diagram, return only set_caption.` : "";
    const user = `The teacher asked you, Bubbles, directly: "${ask}"\nDraw exactly what they asked for, even if they haven't explained it yet; use your own knowledge for the content.\nEarlier in the lesson: ${said}${onScreen}`;
    const reply = await llmJson<LlmReply>(SYSTEM(kind), user, 800);
    const ops = Array.isArray(reply.ops) ? reply.ops : [];
    // Only a line of text ("write the formula underneath") is an edit Jev scored low: it goes under the diagram on screen.
    if (current && ops.length && ops.every((o) => o?.op === "set_caption")) {
      console.info("diagram", JSON.stringify({ path: "bubbles-caption", ask, asked, edits }));
      return { jev, action: "update", kind: current.kind, ops };
    }
    console.info("diagram", JSON.stringify({ path: "bubbles", ask, jev, asked, edits, kind }));
    return { jev, action: "new_topic", kind, ops };
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
// The speech model writes the name lowercase with no commas, which Jev reads as the word, not someone being
// addressed: "…theorem bubbles" 0.46 vs "…theorem, Bubbles" 0.98; "Bubbles draw the water cycle" 0.29 vs
// "Bubbles, draw…" 0.97. Write it as a name, except where it's the ordinary word ("air bubbles", "bubble sort").
const NOT_NAME_BEFORE = /^(the|a|an|air|soap|gas|water|of|these|those|some|tiny|small|big|little|many|blow|blowing|in|with)$/i;
const NOT_NAME_AFTER = /^\s+(sort|tea|wrap|gum|chart|bath|rise|rises|form|forms|pop|pops|burst|bursts)\b/i;
function asName(text: string) {
  return text.replace(/(\b\w+\s+)?\bbubbles?\b/gi, (m, before: string | undefined, at: number, all: string) => {
    const next = all.slice(at + m.length);
    if ((before && NOT_NAME_BEFORE.test(before.trim())) || NOT_NAME_AFTER.test(next)) return m;
    // "…theorem, Bubbles" after a word; "Bubbles, draw…" when it opens a sentence and words follow.
    if (before) return `${before.trimEnd()}, Bubbles`;
    return /^\s+[a-z]/i.test(next) ? "Bubbles," : "Bubbles";
  });
}

function describe(d: Diagram) {
  const labels = [
    ...d.nodes.map((n) => n.label), ...d.events.map((e) => e.label), ...d.curves.map((c) => c.label ?? ""),
    ...d.points.map((p) => p.label ?? ""), ...(d.segments ?? []).map((g) => g.label ?? ""),
    ...(d.sets ?? []).map((x) => x.label), ...(d.items ?? []).map((x) => x.label), ...(d.letters ?? []).map((x) => x.text),
    ...(d.columns ?? []).map((x) => x.label), ...(d.rows ?? []).map((x) => x.label ?? ""), ...(d.marks ?? []).map((x) => x.label ?? ""),
    ...(d.jumps ?? []).map((x) => x.label ?? ""), ...(d.bars ?? []).map((x) => x.label),
    ...(d.fractions ?? []).map((x) => `${x.num}/${x.den}`), ...(d.branches ?? []).map((x) => x.label),
    ...(d.words ?? []).map((x) => x.parts.join("-")), d.subject?.label ?? "", ...(d.parts ?? []).map((x) => x.label),
    ...(d.steps ?? []).map((x) => x.text), ...(d.places ?? []).map((x) => x.label), d.caption ?? "",
  ].filter(Boolean);
  return `a ${d.kind} titled '${d.title}'${labels.length ? ` showing: ${labels.slice(0, 12).join(", ")}` : ""}`;
}

function compact(d: Diagram) {
  return { title: d.title, nodes: d.nodes, edges: d.edges, events: d.events, axes: d.axes, curves: d.curves, points: d.points, segments: d.segments, smiles: d.smiles, sets: d.sets, items: d.items, letters: d.letters,
    columns: d.columns, rows: d.rows, cells: d.cells, line: d.line, marks: d.marks, jumps: d.jumps,
    bars: d.bars, chart: d.chart, fractions: d.fractions, branches: d.branches, words: d.words,
    subject: d.subject, parts: d.parts, steps: d.steps, places: d.places, routes: d.routes, caption: d.caption };
}
