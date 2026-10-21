// Diagram spec and the typed changes ("ops") the LLM returns. The model never writes drawing code:
// it adds parts by id, and our renderers decide layout, colour and motion.

export const KINDS = ["flow", "cycle", "timeline", "graph", "molecule"] as const;
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
  | { op: "set_caption"; text: string };

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
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const range = (v: unknown): v is [number, number] => Array.isArray(v) && v.length === 2 && num(v[0]) && num(v[1]) && v[0] < v[1];
const pair = (v: unknown): v is [number, number] => Array.isArray(v) && v.length === 2 && num(v[0]) && num(v[1]);
const ROLES = ["input", "process", "output", "other"];

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
    case "set_caption": return str(v.text);
    default: return false;
  }
}

// Applies ops without mutating `d`. Malformed ops, and ops that point at missing parts, are skipped.
export function applyOps(d: Diagram, raw: unknown[]): Diagram {
  const ops = raw.filter(validOp);
  const next: Diagram = {
    ...d,
    nodes: [...d.nodes],
    edges: [...d.edges],
    events: [...d.events],
    curves: [...d.curves],
    points: [...d.points],
    segments: [...(d.segments ?? [])], // lessons saved before segments existed have none
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
      case "set_caption":
        next.caption = o.text;
        next.fresh.push("caption");
        break;
      case "set_smiles":
        next.smiles = o.smiles;
        next.fresh.push("smiles");
        break;
    }
  }
  return next;
}

export function isEmpty(d: Diagram) {
  return !d.nodes.length && !d.events.length && !d.curves.length && !d.points.length && !d.segments?.length && !d.smiles;
}

export const KIND_LABEL: Record<Kind, string> = {
  flow: "Flow",
  cycle: "Cycle",
  timeline: "Timeline",
  graph: "Graph",
  molecule: "Molecule",
};
