// Diagram spec and the typed changes ("ops") the LLM returns. The model never writes drawing code:
// it adds parts by id, and our renderers decide layout, colour and motion.

export const KINDS = ["flow", "cycle", "timeline", "graph", "molecule", "venn", "letters", "table", "numberline", "chart", "fraction", "tree", "web", "parts", "math", "map"] as const;
export type Kind = (typeof KINDS)[number];
export type Role = "input" | "process" | "output" | "other";

export type Diagram = {
  id: string;
  kind: Kind;
  title: string;
  t: number; // lesson clock (s) when it first appeared
  nodes: { id: string; label: string; role: Role }[];
  edges: { id: string; from: string; to: string; label?: string }[];
  events: { id: string; when: string; label: string }[];
  axes?: { x: [number, number]; y: [number, number] };
  curves: { id: string; expr: string; label?: string }[];
  points: { id: string; x: number; y: number; label?: string }[];
  segments: { id: string; from: [number, number]; to: [number, number]; label?: string }[];
  smiles?: string;
  // Venn: up to four sets; each item sits in the region of the sets it belongs to (none: outside them all). Sets
  // overlap unless one is `apart` (it shares nothing with the other main sets) or `inside` another (a subset).
  sets?: { id: string; label: string; inside?: string; apart?: boolean; colour?: number }[];
  items?: { id: string; label: string; sets: string[] }[];
  // Letters and sounds: "Mm" drawn as bubble letters, with its sound ("/m/") and an example word ("moon").
  letters?: { id: string; text: string; sound?: string; word?: string }[];
  // Table: columns across, rows down; a cell is found by its row and column ids.
  columns?: { id: string; label: string }[];
  rows?: { id: string; label?: string }[];
  cells?: { row: string; col: string; text: string }[];
  // Number line: a range with numbered ticks, marked values, and jumps drawn as arcs ("start at 3, jump 4").
  line?: { min: number; max: number; step: number };
  marks?: { id: string; value: number; label?: string }[];
  jumps?: { id: string; from: number; to: number; label?: string }[];
  // Chart: one bar per category; as a pictograph each bar is a row of its icon.
  bars?: { id: string; label: string; value: number; icon?: string }[];
  chart?: { style: "bar" | "pictograph"; axis?: string };
  // Fractions as shaded equal parts of a bar or circle; bars stack so equivalent fractions line up.
  fractions?: { id: string; num: number; den: number; shape: "bar" | "circle"; label?: string }[];
  // Tree (top to bottom) and mind map (radial) share one shape: branches hanging off a parent; the root has none.
  branches?: { id: string; label: string; parent?: string; edge?: string }[];
  // Words split into parts ("but-ter-fly") under the letters, as syllables, sounds or word parts.
  words?: { id: string; parts: string[]; mode: "syllables" | "sounds" | "parts" }[];
  // Labelled parts of one thing (a plant cell, the heart): its outline, parts inside or on the edge, labels around it.
  subject?: { label: string; shape: "cell" | "circle" | "oval" | "layers" };
  parts?: { id: string; label: string; inside: boolean; fills?: boolean }[];
  // Worked steps (algebra, a balanced equation), lined up on their "=" or arrow.
  steps?: { id: string; text: string; note?: string }[];
  // Map: real places by latitude and longitude, and routes between them (a river's course, a journey, trade).
  places?: { id: string; label: string; lat: number; lon: number }[];
  routes?: { id: string; from: string; to: string; label?: string }[];
  view?: { lat: number; lon: number; span: number }; // set when the teacher asks to zoom: centre and degrees of longitude
  caption?: string; // a line under the diagram, e.g. a formula
  fresh: string[]; // ids added by the latest change, drawn highlighted
};

export type Op =
  | { op: "set_title"; title: string }
  | { op: "add_node"; id: string; label: string; role?: Role }
  | { op: "relabel"; id: string; label: string }
  | { op: "add_edge"; id?: string; from: string; to: string; label?: string }
  | { op: "add_event"; id: string; when: string; label: string }
  | { op: "set_axes"; x: [number, number]; y: [number, number] }
  | { op: "add_curve"; id: string; expr: string; label?: string }
  | { op: "add_point"; id: string; x: number; y: number; label?: string }
  | { op: "add_segment"; id: string; from: [number, number]; to: [number, number]; label?: string }
  | { op: "set_smiles"; smiles: string }
  | { op: "add_set"; id: string; label: string; inside?: string; apart?: boolean }
  | { op: "add_item"; id: string; label: string; sets: string[] }
  | { op: "add_letter"; id: string; text: string; sound?: string; word?: string }
  | { op: "set_caption"; text: string }
  | { op: "remove"; id: string }
  | { op: "add_column"; id: string; label: string }
  | { op: "add_row"; id: string; label?: string }
  | { op: "set_cell"; row: string; col: string; text: string }
  | { op: "set_range"; min: number; max: number; step: number }
  | { op: "add_mark"; id: string; value: number; label?: string }
  | { op: "add_jump"; id: string; from: number; to: number; label?: string }
  | { op: "add_bar"; id: string; label: string; value: number; icon?: string }
  | { op: "set_chart"; style?: "bar" | "pictograph"; axis?: string }
  | { op: "add_fraction"; id: string; num: number; den: number; shape?: "bar" | "circle"; label?: string }
  | { op: "add_branch"; id: string; label: string; parent?: string; edge?: string }
  | { op: "add_word"; id: string; parts: string[]; mode?: "syllables" | "sounds" | "parts" }
  | { op: "set_subject"; label: string; shape?: "cell" | "circle" | "oval" | "layers" }
  | { op: "add_part"; id: string; label: string; inside?: boolean; fills?: boolean }
  | { op: "add_step"; id: string; text: string; note?: string }
  | { op: "add_place"; id: string; label: string; lat: number; lon: number }
  | { op: "set_view"; lat: number; lon: number; span: number }
  | { op: "add_route"; id: string; from: string; to: string; label?: string };

export function emptyDiagram(kind: Kind, t: number): Diagram {
  return {
    id: `d${Math.round(t * 1000)}`,
    kind,
    title: "",
    t,
    nodes: [],
    edges: [],
    events: [],
    curves: [],
    points: [],
    segments: [],
    fresh: [],
  };
}

const str = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const optStr = (v: unknown) => v === undefined || typeof v === "string";
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const range = (v: unknown): v is [number, number] => Array.isArray(v) && v.length === 2 && num(v[0]) && num(v[1]) && v[0] < v[1];
// Numbers a classroom diagram can use: big enough for populations and years, small enough to count ticks with.
const sane = (v: unknown): v is number => num(v) && Math.abs(v) <= 1e9;
const pair = (v: unknown): v is [number, number] => Array.isArray(v) && v.length === 2 && num(v[0]) && num(v[1]);
const ROLES = ["input", "process", "output", "other"];

// Models often write a year or an id as a number ("when": 1914); those are text here, not a reason to drop the op.
function textFields(o: unknown): unknown {
  if (!o || typeof o !== "object") return o;
  const v = { ...(o as Record<string, unknown>) };
  // An arrow's or route's ends are ids; a jump's ends are numbers on the line and stay numbers.
  const ends = v.op === "add_edge" || v.op === "add_route" ? ["from", "to"] : [];
  for (const k of ["id", "label", "when", "title", "row", "col", "parent", "text", "note", "edge", "sound", "word", "axis", ...ends]) {
    if (num(v[k])) v[k] = String(v[k]);
  }
  if (Array.isArray(v.sets)) v.sets = v.sets.map((x) => (num(x) ? String(x) : x));
  const max = v.op === "set_caption" ? 140 : 80;
  for (const k of ["label", "text", "note", "title", "when", "edge", "word"]) {
    if (typeof v[k] === "string" && (v[k] as string).length > max) v[k] = (v[k] as string).slice(0, max - 1) + "…";
  }
  return v;
}

// LLM output is untrusted: drop any op whose fields have the wrong shape, so the renderers never see them.
export function validOp(o: unknown): o is Op {
  if (!o || typeof o !== "object") return false;
  const v = o as Record<string, unknown>;
  switch (v.op) {
    case "set_title": return str(v.title);
    case "add_node": return str(v.id) && str(v.label); // an unknown role ("pool") is drawn as "other", not dropped
    case "relabel": return str(v.id) && str(v.label);
    case "add_edge": return str(v.from) && str(v.to) && (v.id === undefined || str(v.id)) && (v.label === undefined || typeof v.label === "string");
    case "add_event": return str(v.id) && str(v.when) && str(v.label);
    case "set_axes":
      return range(v.x) && range(v.y) && [...v.x, ...v.y].every(sane) && v.x[1] - v.x[0] >= 1e-6 && v.y[1] - v.y[0] >= 1e-6;
    case "add_curve": return str(v.id) && str(v.expr) && (v.label === undefined || typeof v.label === "string");
    case "add_point": return str(v.id) && num(v.x) && num(v.y) && (v.label === undefined || typeof v.label === "string");
    case "add_segment": return str(v.id) && pair(v.from) && pair(v.to) && (v.label === undefined || typeof v.label === "string");
    case "set_smiles": return str(v.smiles);
    case "add_set": return str(v.id) && str(v.label) && optStr(v.inside) && (v.apart === undefined || typeof v.apart === "boolean");
    case "add_item": return str(v.id) && str(v.label) && Array.isArray(v.sets) && v.sets.every((x) => typeof x === "string");
    case "add_letter":
      return str(v.id) && str(v.text) && v.text.trim().length <= 4 && optStr(v.sound) && optStr(v.word);
    case "set_caption": return str(v.text);
    case "remove": return str(v.id);
    case "add_column": return str(v.id) && str(v.label);
    case "add_row": return str(v.id) && optStr(v.label);
    case "set_cell": return str(v.row) && str(v.col) && typeof v.text === "string";
    case "set_range":
      return sane(v.min) && sane(v.max) && num(v.step) && v.min < v.max && v.step >= 0.001 && (v.max - v.min) / v.step <= 40;
    case "add_mark": return str(v.id) && sane(v.value) && optStr(v.label);
    case "add_jump": return str(v.id) && sane(v.from) && sane(v.to) && v.from !== v.to && optStr(v.label);
    case "add_bar": return str(v.id) && str(v.label) && sane(v.value) && v.value >= 0 && optStr(v.icon);
    case "add_branch": return str(v.id) && str(v.label) && optStr(v.parent) && optStr(v.edge);
    case "add_word":
      return (
        str(v.id) && Array.isArray(v.parts) && v.parts.length >= 1 && v.parts.length <= 8 && v.parts.every((x) => str(x)) &&
        (v.mode === undefined || v.mode === "syllables" || v.mode === "sounds" || v.mode === "parts")
      );
    case "set_subject": return str(v.label) && (v.shape === undefined || ["cell", "circle", "oval", "layers"].includes(v.shape as string));
    case "add_part":
      return str(v.id) && str(v.label) && (v.inside === undefined || typeof v.inside === "boolean") && (v.fills === undefined || typeof v.fills === "boolean");
    case "add_step": return str(v.id) && str(v.text) && optStr(v.note);
    case "add_place":
      return str(v.id) && str(v.label) && num(v.lat) && num(v.lon) && Math.abs(v.lat) <= 90 && Math.abs(v.lon) <= 180;
    case "add_route": return str(v.id) && str(v.from) && str(v.to) && optStr(v.label);
    case "set_view":
      return num(v.lat) && num(v.lon) && num(v.span) && Math.abs(v.lat) <= 85 && Math.abs(v.lon) <= 180 && v.span >= 0.05 && v.span <= 360;
    case "set_chart": return (v.style === undefined || v.style === "bar" || v.style === "pictograph") && optStr(v.axis);
    case "add_fraction":
      return (
        str(v.id) && Number.isInteger(v.num) && Number.isInteger(v.den) && (v.den as number) >= 1 && (v.den as number) <= 24 &&
        (v.num as number) >= 0 && (v.num as number) <= (v.den as number) && (v.shape === undefined || v.shape === "bar" || v.shape === "circle") && optStr(v.label)
      );
    default: return false;
  }
}

// Puts each add_branch after its parent's when both are in the batch, keeping everything else where it was.
function parentsFirst(ops: Op[]) {
  const branches = ops.filter((o): o is Extract<Op, { op: "add_branch" }> => o.op === "add_branch");
  const pending = new Map(branches.map((b) => [b.id, b]));
  const ordered: Op[] = [];
  while (pending.size) {
    const ready = [...pending.values()].filter((b) => !b.parent || b.parent === b.id || !pending.has(b.parent));
    for (const b of ready.length ? ready : [...pending.values()]) {
      ordered.push(b);
      pending.delete(b.id);
    }
  }
  let k = 0;
  return ops.map((o) => (o.op === "add_branch" ? ordered[k++] : o));
}

// Applies ops without mutating `d`. Malformed ops, and ops that point at missing parts, are skipped.
export function applyOps(d: Diagram, raw: unknown[]): Diagram {
  // Ops that make something come before ops that refer to it, so an item sent before its Venn set (or a cell before
  // its row, a route before its place) isn't dropped. The sort is stable: order within each group is kept.
  // A subset's set comes after the set it's inside, and before the items in it.
  const refers = new Set(["add_item", "set_cell", "add_route", "add_edge"]);
  const late = (o: Op) => (refers.has(o.op) ? 2 : o.op === "add_set" && o.inside ? 1 : 0);
  const ops = parentsFirst(
    raw
      .map(textFields)
      .filter(validOp)
      .sort((a, b) => late(a) - late(b)),
  );
  const next: Diagram = {
    ...d,
    nodes: [...d.nodes],
    edges: [...d.edges],
    events: [...d.events],
    curves: [...d.curves],
    points: [...d.points],
    segments: [...(d.segments ?? [])], // lessons saved before segments existed have none
    sets: [...(d.sets ?? [])],
    items: [...(d.items ?? [])],
    letters: [...(d.letters ?? [])],
    columns: [...(d.columns ?? [])],
    rows: [...(d.rows ?? [])],
    cells: [...(d.cells ?? [])],
    marks: [...(d.marks ?? [])],
    jumps: [...(d.jumps ?? [])],
    bars: [...(d.bars ?? [])],
    fractions: [...(d.fractions ?? [])],
    branches: [...(d.branches ?? [])],
    words: [...(d.words ?? [])],
    parts: [...(d.parts ?? [])],
    steps: [...(d.steps ?? [])],
    places: [...(d.places ?? [])],
    routes: [...(d.routes ?? [])],
    fresh: [],
  };
  const has = (id: string) => next.nodes.some((n) => n.id === id);
  // Adds a part, or replaces the one with the same id ("actually 9 chose soccer"); a new part only while under the cap.
  const put = <T extends { id: string }>(xs: T[], x: T, cap = Infinity) => {
    const i = xs.findIndex((y) => y.id === x.id);
    if (i >= 0) xs[i] = x;
    else if (xs.length < cap) xs.push(x);
    else return;
    next.fresh.push(x.id);
  };
  for (const o of ops) {
    switch (o.op) {
      case "set_title":
        next.title = o.title;
        break;
      case "add_node":
        if (!has(o.id)) {
          next.nodes.push({ id: o.id, label: o.label, role: o.role && ROLES.includes(o.role) ? o.role : "other" });
          next.fresh.push(o.id);
        }
        break;
      case "relabel":
        next.nodes = next.nodes.map((n) => (n.id === o.id ? { ...n, label: o.label } : n));
        break;
      case "add_edge": {
        const id = o.id ?? `${o.from}>${o.to}`;
        if (has(o.from) && has(o.to) && !next.edges.some((e) => e.id === id)) {
          next.edges.push({ id, from: o.from, to: o.to, label: o.label });
          next.fresh.push(id);
        }
        break;
      }
      case "add_event":
        if (!next.events.some((e) => e.id === o.id)) {
          next.events.push({ id: o.id, when: o.when, label: o.label });
          next.fresh.push(o.id);
        }
        break;
      case "set_axes":
        next.axes = { x: o.x, y: o.y };
        break;
      case "add_curve":
        if (!next.curves.some((c) => c.id === o.id)) {
          next.curves.push({ id: o.id, expr: o.expr, label: o.label });
          next.fresh.push(o.id);
        }
        break;
      case "add_point":
        if (!next.points.some((p) => p.id === o.id)) {
          next.points.push({ id: o.id, x: o.x, y: o.y, label: o.label });
          next.fresh.push(o.id);
        }
        break;
      case "add_segment":
        if (!next.segments.some((x) => x.id === o.id)) {
          next.segments.push({ id: o.id, from: o.from, to: o.to, label: o.label });
          next.fresh.push(o.id);
        }
        break;
      case "remove": {
        // "Take that off": the part with this id, and any arrows to or from it.
        const keep = <T extends { id: string }>(xs: T[]) => xs.filter((x) => x.id !== o.id);
        next.nodes = keep(next.nodes);
        next.edges = next.edges.filter((e) => e.id !== o.id && e.from !== o.id && e.to !== o.id);
        next.events = keep(next.events);
        next.curves = keep(next.curves);
        next.points = keep(next.points);
        next.segments = keep(next.segments);
        next.sets = keep(next.sets!).map((x) => (x.inside === o.id ? { ...x, inside: undefined } : x)); // its subsets stay, as sets of their own
        next.items = keep(next.items!)
          .filter((x) => !(x.sets.length === 1 && x.sets[0] === o.id))
          .map((x) => ({ ...x, sets: x.sets.filter((id) => id !== o.id) }));
        next.letters = keep(next.letters!);
        next.columns = keep(next.columns!);
        next.rows = keep(next.rows!);
        next.cells = next.cells!.filter((c) => c.row !== o.id && c.col !== o.id);
        next.marks = keep(next.marks!);
        next.jumps = keep(next.jumps!);
        next.bars = keep(next.bars!);
        next.fractions = keep(next.fractions!);
        // Taking a branch off takes everything hanging from it too.
        const gone = new Set([o.id]);
        for (let grew = true; grew; ) {
          grew = false;
          for (const b of next.branches!) {
            if (b.parent && gone.has(b.parent) && !gone.has(b.id)) {
              gone.add(b.id);
              grew = true;
            }
          }
        }
        next.branches = next.branches!.filter((b) => !gone.has(b.id));
        next.words = keep(next.words!);
        next.parts = keep(next.parts!);
        next.steps = keep(next.steps!);
        next.places = keep(next.places!);
        if (o.id === "view") next.view = undefined; // back to fitting the places
        next.routes = next.routes!.filter((r) => r.id !== o.id && r.from !== o.id && r.to !== o.id);
        if (o.id === "caption") next.caption = undefined;
        break;
      }
      case "add_column":
        put(next.columns!, { id: o.id, label: o.label }, 5);
        break;
      case "add_row":
        put(next.rows!, { id: o.id, label: o.label }, 6);
        break;
      case "set_cell":
        // Cells for a row or column that doesn't exist (or was capped off) are dropped; a filled cell can be rewritten.
        if (next.rows!.some((x) => x.id === o.row) && next.columns!.some((x) => x.id === o.col)) {
          next.cells = [...next.cells!.filter((c) => !(c.row === o.row && c.col === o.col)), { row: o.row, col: o.col, text: o.text }];
          next.fresh.push(`${o.row}:${o.col}`);
        }
        break;
      case "add_bar":
        put(next.bars!, { id: o.id, label: o.label, value: o.value, icon: o.icon }, 8);
        break;
      case "set_chart":
        next.chart = { style: o.style ?? next.chart?.style ?? "bar", axis: o.axis ?? next.chart?.axis };
        break;
      case "add_branch":
        // A branch needs its parent drawn first (or no parent: the root); a second root becomes a branch of the first.
        {
          const existing = next.branches!.find((b) => b.id === o.id);
          const below = new Set([o.id]);
          for (let grew = true; grew; ) {
            grew = false;
            for (const b of next.branches!) {
              if (b.parent && below.has(b.parent) && !below.has(b.id)) {
                below.add(b.id);
                grew = true;
              }
            }
          }
          const root = next.branches!.find((b) => !b.parent && b.id !== o.id);
          const parent =
            existing && !existing.parent
              ? undefined
              : o.parent && !below.has(o.parent) && next.branches!.some((b) => b.id === o.parent)
                ? o.parent
                : (existing?.parent ?? root?.id);
          put(next.branches!, { id: o.id, label: o.label, parent, edge: o.edge }, 15);
        }
        break;
      case "set_subject":
        next.subject = { label: o.label, shape: o.shape ?? next.subject?.shape ?? "cell" };
        next.fresh.push("subject");
        break;
      case "add_part":
        put(next.parts!, { id: o.id, label: o.label, inside: o.inside ?? true, fills: o.fills }, 10);
        break;
      case "add_place":
        put(next.places!, { id: o.id, label: o.label, lat: o.lat, lon: o.lon }, 10);
        // A place outside a zoomed view would be off the map: go back to fitting all the places.
        if (next.view) {
          const dLon = Math.abs(((o.lon - next.view.lon + 540) % 360) - 180);
          if (dLon > next.view.span / 2 || Math.abs(o.lat - next.view.lat) > next.view.span * 0.3) next.view = undefined;
        }
        break;
      case "set_view":
        next.view = { lat: o.lat, lon: o.lon, span: o.span };
        next.fresh.push("view");
        break;
      case "add_route":
        if (next.places!.some((x) => x.id === o.from) && next.places!.some((x) => x.id === o.to)) {
          put(next.routes!, { id: o.id, from: o.from, to: o.to, label: o.label });
        }
        break;
      case "add_step":
        put(next.steps!, { id: o.id, text: o.text, note: o.note }, 7);
        break;
      case "add_word":
        put(next.words!, { id: o.id, parts: o.parts.map((p) => p.trim()), mode: o.mode ?? "syllables" }, 4);
        break;
      case "add_fraction":
        put(next.fractions!, { id: o.id, num: o.num, den: o.den, shape: o.shape ?? "bar", label: o.label }, 4);
        break;
      case "set_range":
        next.line = { min: o.min, max: o.max, step: o.step };
        break;
      case "add_mark":
        put(next.marks!, { id: o.id, value: o.value, label: o.label }, 20);
        break;
      case "add_jump":
        put(next.jumps!, { id: o.id, from: o.from, to: o.to, label: o.label }, 10);
        break;
      case "set_caption":
        next.caption = o.text;
        next.fresh.push("caption");
        break;
      case "set_smiles":
        next.smiles = o.smiles;
        next.fresh.push("smiles");
        break;
      case "add_set": {
        // Inside a set that exists and isn't itself inside this one (a loop would leave both nowhere to be drawn).
        const within = (id: string | undefined): boolean => !!id && (id === o.id || within(next.sets!.find((x) => x.id === id)?.inside));
        // Sent again without them (a new label), a set keeps its relations; "inside":"" or "apart":false undoes them.
        const was = next.sets!.find((x) => x.id === o.id);
        const want = o.inside === undefined ? was?.inside : o.inside || undefined;
        const inside = want && next.sets!.some((x) => x.id === want) && !within(want) ? want : undefined;
        // Its colour stays with it, so removing another set doesn't recolour the rest.
        // (A set saved before colours were kept shows the colour of its place in the list.)
        const shown = next.sets!.map((x, i) => x.colour ?? i);
        const colour = was ? shown[next.sets!.indexOf(was)] : [0, 1, 2, 3].find((c) => !shown.includes(c));
        put(next.sets!, { id: o.id, label: o.label, inside, apart: (o.apart ?? was?.apart) || undefined, colour }, 4);
        break;
      }
      case "add_item":
        put(next.items!, { id: o.id, label: o.label, sets: o.sets.filter((id) => next.sets!.some((x) => x.id === id)) }, 16); // unknown sets: outside
        break;
      case "add_letter":
        put(next.letters!, { id: o.id, text: o.text.trim(), sound: o.sound, word: o.word }, 4);
        break;
    }
  }
  // Separate main sets share nothing: an item listed in two of them (a slip, or kept from before they were made
  // separate) stays in the first only, rather than being drawn in the gap between them.
  if (next.sets!.length && separate(next.sets!)) {
    const root = (id: string) => {
      for (let s = next.sets!.find((x) => x.id === id), n = 0; s && n < 4; s = next.sets!.find((x) => x.id === s!.inside), n++) {
        if (!s.inside) return s.id;
      }
      return id;
    };
    next.items = next.items!.map((it) => {
      const first = it.sets.length ? root(it.sets[0]) : null;
      const sets = it.sets.filter((id) => root(id) === first);
      return sets.length === it.sets.length ? it : { ...it, sets };
    });
  }
  return next;
}

// Whether a Venn's main sets are drawn apart, sharing nothing: when one is marked apart, or there are four (four
// circles can't all overlap legibly).
export const separate = (sets: { inside?: string; apart?: boolean }[]) => {
  const top = sets.filter((x) => !x.inside);
  return top.length > 3 || top.some((x) => x.apart);
};

export function isEmpty(d: Diagram) {
  return (
    !d.nodes.length && !d.events.length && !d.curves.length && !d.points.length && !d.segments?.length && !d.smiles &&
    !d.sets?.length && !d.letters?.length && !d.columns?.length && !d.marks?.length && !d.jumps?.length && !d.bars?.length && !d.fractions?.length && !d.branches?.length && !d.words?.length && !d.parts?.length && !d.steps?.length && !d.places?.length &&
    !d.line && !d.subject && !d.rows?.length
  );
}

export const KIND_LABEL: Record<Kind, string> = {
  flow: "Flow",
  cycle: "Cycle",
  timeline: "Timeline",
  graph: "Graph",
  molecule: "Molecule",
  venn: "Venn",
  letters: "Letters",
  table: "Table",
  numberline: "Number line",
  chart: "Chart",
  fraction: "Fractions",
  tree: "Tree",
  web: "Mind map",
  parts: "Labelled parts",
  math: "Steps",
  map: "Map",
};
