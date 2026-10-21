// Diagram spec and the typed changes ("ops") the LLM returns. The model never writes drawing code:
// it adds parts by id, and our renderers decide layout, colour and motion.

export const KINDS = ["flow", "cycle", "timeline", "graph", "molecule", "venn", "letters", "table", "numberline", "chart", "fraction", "tree", "web"] as const;
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
  // Venn: two or three sets; each item sits in the region of the sets it belongs to (none: outside them all).
  sets?: { id: string; label: string }[];
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
  | { op: "add_set"; id: string; label: string }
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
  | { op: "add_word"; id: string; parts: string[]; mode?: "syllables" | "sounds" | "parts" };

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
const pair = (v: unknown): v is [number, number] => Array.isArray(v) && v.length === 2 && num(v[0]) && num(v[1]);
const ROLES = ["input", "process", "output", "other"];

// Models often write a year or an id as a number ("when": 1914); those are text here, not a reason to drop the op.
function textFields(o: unknown): unknown {
  if (!o || typeof o !== "object") return o;
  const v = { ...(o as Record<string, unknown>) };
  // An arrow's ends are node ids; a jump's ends are numbers on the line and stay numbers.
  for (const k of ["id", "label", "when", "title", ...(v.op === "add_edge" ? ["from", "to"] : [])]) if (num(v[k])) v[k] = String(v[k]);
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
    case "set_axes": return range(v.x) && range(v.y);
    case "add_curve": return str(v.id) && str(v.expr) && (v.label === undefined || typeof v.label === "string");
    case "add_point": return str(v.id) && num(v.x) && num(v.y) && (v.label === undefined || typeof v.label === "string");
    case "add_segment": return str(v.id) && pair(v.from) && pair(v.to) && (v.label === undefined || typeof v.label === "string");
    case "set_smiles": return str(v.smiles);
    case "add_set": return str(v.id) && str(v.label);
    case "add_item": return str(v.id) && str(v.label) && Array.isArray(v.sets) && v.sets.every((x) => typeof x === "string");
    case "add_letter":
      return str(v.id) && str(v.text) && v.text.trim().length <= 4 && optStr(v.sound) && optStr(v.word);
    case "set_caption": return str(v.text);
    case "remove": return str(v.id);
    case "add_column": return str(v.id) && str(v.label);
    case "add_row": return str(v.id) && optStr(v.label);
    case "set_cell": return str(v.row) && str(v.col) && typeof v.text === "string";
    case "set_range": return num(v.min) && num(v.max) && num(v.step) && v.min < v.max && v.step > 0 && (v.max - v.min) / v.step <= 40;
    case "add_mark": return str(v.id) && num(v.value) && optStr(v.label);
    case "add_jump": return str(v.id) && num(v.from) && num(v.to) && v.from !== v.to && optStr(v.label);
    case "add_bar": return str(v.id) && str(v.label) && num(v.value) && v.value >= 0 && optStr(v.icon);
    case "add_branch": return str(v.id) && str(v.label) && optStr(v.parent) && optStr(v.edge);
    case "add_word":
      return (
        str(v.id) && Array.isArray(v.parts) && v.parts.length >= 1 && v.parts.length <= 8 && v.parts.every((x) => str(x)) &&
        (v.mode === undefined || v.mode === "syllables" || v.mode === "sounds" || v.mode === "parts")
      );
    case "set_chart": return (v.style === undefined || v.style === "bar" || v.style === "pictograph") && optStr(v.axis);
    case "add_fraction":
      return (
        str(v.id) && Number.isInteger(v.num) && Number.isInteger(v.den) && (v.den as number) >= 1 && (v.den as number) <= 24 &&
        (v.num as number) >= 0 && (v.num as number) <= (v.den as number) && (v.shape === undefined || v.shape === "bar" || v.shape === "circle") && optStr(v.label)
      );
    default: return false;
  }
}

// Applies ops without mutating `d`. Malformed ops, and ops that point at missing parts, are skipped.
export function applyOps(d: Diagram, raw: unknown[]): Diagram {
  const ops = raw.map(textFields).filter(validOp);
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
    fresh: [],
  };
  const has = (id: string) => next.nodes.some((n) => n.id === id);
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
        next.sets = keep(next.sets!);
        next.items = keep(next.items!).map((x) => ({ ...x, sets: x.sets.filter((id) => id !== o.id) }));
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
        if (o.id === "caption") next.caption = undefined;
        break;
      }
      case "add_column":
        if (next.columns!.length < 5 && !next.columns!.some((x) => x.id === o.id)) {
          next.columns!.push({ id: o.id, label: o.label });
          next.fresh.push(o.id);
        }
        break;
      case "add_row":
        if (next.rows!.length < 6 && !next.rows!.some((x) => x.id === o.id)) {
          next.rows!.push({ id: o.id, label: o.label });
          next.fresh.push(o.id);
        }
        break;
      case "set_cell":
        // Cells for a row or column that doesn't exist (or was capped off) are dropped; a filled cell can be rewritten.
        if (next.rows!.some((x) => x.id === o.row) && next.columns!.some((x) => x.id === o.col)) {
          next.cells = [...next.cells!.filter((c) => !(c.row === o.row && c.col === o.col)), { row: o.row, col: o.col, text: o.text }];
          next.fresh.push(`${o.row}:${o.col}`);
        }
        break;
      case "add_bar":
        if (next.bars!.length < 8 && !next.bars!.some((x) => x.id === o.id)) {
          next.bars!.push({ id: o.id, label: o.label, value: o.value, icon: o.icon });
          next.fresh.push(o.id);
        }
        break;
      case "set_chart":
        next.chart = { style: o.style ?? next.chart?.style ?? "bar", axis: o.axis ?? next.chart?.axis };
        break;
      case "add_branch":
        // A branch needs its parent drawn first (or no parent: the root); a second root becomes a branch of the first.
        if (next.branches!.length < 15 && !next.branches!.some((x) => x.id === o.id)) {
          const root = next.branches!.find((b) => !b.parent);
          const parent = o.parent && next.branches!.some((b) => b.id === o.parent) ? o.parent : root?.id;
          next.branches!.push({ id: o.id, label: o.label, parent, edge: o.edge });
          next.fresh.push(o.id);
        }
        break;
      case "add_word":
        if (next.words!.length < 4 && !next.words!.some((x) => x.id === o.id)) {
          next.words!.push({ id: o.id, parts: o.parts.map((p) => p.trim()), mode: o.mode ?? "syllables" });
          next.fresh.push(o.id);
        }
        break;
      case "add_fraction":
        if (next.fractions!.length < 4 && !next.fractions!.some((x) => x.id === o.id)) {
          next.fractions!.push({ id: o.id, num: o.num, den: o.den, shape: o.shape ?? "bar", label: o.label });
          next.fresh.push(o.id);
        }
        break;
      case "set_range":
        next.line = { min: o.min, max: o.max, step: o.step };
        break;
      case "add_mark":
        if (!next.marks!.some((x) => x.id === o.id)) {
          next.marks!.push({ id: o.id, value: o.value, label: o.label });
          next.fresh.push(o.id);
        }
        break;
      case "add_jump":
        if (!next.jumps!.some((x) => x.id === o.id)) {
          next.jumps!.push({ id: o.id, from: o.from, to: o.to, label: o.label });
          next.fresh.push(o.id);
        }
        break;
      case "set_caption":
        next.caption = o.text;
        next.fresh.push("caption");
        break;
      case "set_smiles":
        next.smiles = o.smiles;
        next.fresh.push("smiles");
        break;
      case "add_set":
        // Three circles is the most a Venn diagram stays readable with.
        if (next.sets!.length < 3 && !next.sets!.some((x) => x.id === o.id)) {
          next.sets!.push({ id: o.id, label: o.label });
          next.fresh.push(o.id);
        }
        break;
      case "add_item":
        if (!next.items!.some((x) => x.id === o.id)) {
          const sets = o.sets.filter((id) => next.sets!.some((x) => x.id === id)); // unknown sets: outside
          next.items!.push({ id: o.id, label: o.label, sets });
          next.fresh.push(o.id);
        }
        break;
      case "add_letter":
        if (!next.letters!.some((x) => x.id === o.id)) {
          next.letters!.push({ id: o.id, text: o.text.trim(), sound: o.sound, word: o.word });
          next.fresh.push(o.id);
        }
        break;
    }
  }
  return next;
}

export function isEmpty(d: Diagram) {
  return (
    !d.nodes.length && !d.events.length && !d.curves.length && !d.points.length && !d.segments?.length && !d.smiles &&
    !d.sets?.length && !d.letters?.length && !d.columns?.length && !d.marks?.length && !d.jumps?.length && !d.bars?.length && !d.fractions?.length && !d.branches?.length && !d.words?.length
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
};
