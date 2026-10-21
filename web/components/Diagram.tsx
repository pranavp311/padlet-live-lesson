"use client";

import dagre from "@dagrejs/dagre";
import { compile } from "mathjs";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Diagram, Role } from "@/lib/diagram";

// Every kind renders to one SVG with a viewBox, so the same component works live,
// as a transcript thumbnail and in the end-of-lesson gallery. `still` turns off motion.

const ROLE_FILL: Record<Role, string> = {
  input: "var(--canary-tint)",
  process: "var(--grape-tint)",
  output: "var(--park-tint)",
  other: "var(--surface)",
};
const EDGE = "#b2b4b9";
const NODE_H = 56;
const nodeW = (label: string) => Math.max(140, Math.min(240, label.length * 9.5 + 40));

export function DiagramView({ d, still = false }: { d: Diagram; still?: boolean }) {
  if (!d.caption) return <Drawing d={d} still={still} />;
  return (
    <span className="diagram-with-caption">
      {/* On top, under the title: it reads first and never sits under Bubbles in the corner. */}
      <span className="diagram-caption" style={d.fresh.includes("caption") && !still ? { animation: "ll-fade 500ms var(--ease) both" } : undefined}>
        {d.caption}
      </span>
      <span className="diagram-art">
        <Drawing d={d} still={still} />
      </span>
    </span>
  );
}

function Drawing({ d, still }: { d: Diagram; still: boolean }) {
  switch (d.kind) {
    case "flow":
      return <Flow d={d} still={still} />;
    case "cycle":
      return <Cycle d={d} still={still} />;
    case "timeline":
      return <Timeline d={d} still={still} />;
    case "graph":
      return <Graph d={d} still={still} />;
    case "molecule":
      return <Molecule d={d} still={still} />;
    case "venn":
      return <Venn d={d} still={still} />;
    case "letters":
      return <Letters d={d} still={still} />;
    case "table":
      return <Table d={d} still={still} />;
    case "numberline":
      return <NumberLine d={d} still={still} />;
    case "chart":
      return d.chart?.style === "pictograph" ? <Pictograph d={d} still={still} /> : <BarChart d={d} still={still} />;
    case "fraction":
      return <Fractions d={d} still={still} />;
  }
}

function Defs({ id }: { id: string }) {
  return (
    <defs>
      {[
        ["a", EDGE],
        ["af", "var(--grape)"],
      ].map(([k, c]) => (
        <marker key={k} id={`${id}-${k}`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
          <path d="M0 0 L8 4 L0 8 Z" fill={c} />
        </marker>
      ))}
      <filter id={`${id}-sh`} x="-10%" y="-10%" width="120%" height="140%">
        <feDropShadow dx="0" dy="0.5" stdDeviation="0.5" floodOpacity="0.2" />
      </filter>
      <filter id={`${id}-shf`} x="-20%" y="-20%" width="140%" height="160%">
        <feDropShadow dx="0" dy="8" stdDeviation="8" floodOpacity="0.16" />
      </filter>
    </defs>
  );
}

function Node({
  x, y, w, label, role, fresh, still, sid,
}: { x: number; y: number; w: number; label: string; role: Role; fresh: boolean; still: boolean; sid: string }) {
  const hot = fresh && !still;
  return (
    <g style={hot ? { transformBox: "fill-box", transformOrigin: "center", animation: "ll-in 600ms var(--ease) both" } : undefined}>
      <rect
        x={x - w / 2}
        y={y - NODE_H / 2}
        width={w}
        height={NODE_H}
        rx={12}
        fill={ROLE_FILL[role] ?? ROLE_FILL.other}
        stroke={hot ? "var(--grape)" : "none"}
        strokeWidth={2}
        filter={`url(#${sid}-${hot ? "shf" : "sh"})`}
      />
      <Lines x={x} y={y} lines={wrap(label, Math.floor((w - 24) / 9.5))} size={17} weight={600} fill="#111" />
    </g>
  );
}

// Splits a label into at most `max` lines of about `width` characters, ending in "…" if it doesn't fit.
export function wrap(text: string, width: number, max = 2) {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    if (line && (line + " " + word).length > width) {
      lines.push(line);
      line = word;
    } else line = line ? line + " " + word : word;
  }
  if (line) lines.push(line);
  if (lines.length > max) lines.splice(max - 1, lines.length, lines.slice(max - 1).join(" ").slice(0, width - 1) + "…");
  return lines;
}

// Lines of text centred on (x, y).
function Lines({
  x, y, lines, size, weight, fill, lh = size * 1.2,
}: { x: number; y: number; lines: string[]; size: number; weight?: number; fill: string; lh?: number }) {
  return (
    <text x={x} textAnchor="middle" fontSize={size} fontWeight={weight} fill={fill}>
      {lines.map((l, i) => (
        <tspan key={i} x={x} y={y + (i - (lines.length - 1) / 2) * lh} dominantBaseline="central">
          {l}
        </tspan>
      ))}
    </text>
  );
}

// Diagrams scale down to fit, but never blow up past 1.25× their natural size (a two-node flow stays small).
const cap = (w: number, h: number) => ({ maxWidth: w * 1.25, maxHeight: h * 1.25 });

function useSid() {
  return useMemo(() => `s${Math.random().toString(36).slice(2, 8)}`, []);
}

function Flow({ d, still }: { d: Diagram; still: boolean }) {
  const sid = useSid();
  const layout = useMemo(() => {
    const g = new dagre.graphlib.Graph({ multigraph: true });
    g.setGraph({ rankdir: "TB", nodesep: 24, ranksep: 64, marginx: 20, marginy: 20 });
    g.setDefaultEdgeLabel(() => ({}));
    d.nodes.forEach((n) => g.setNode(n.id, { width: nodeW(n.label), height: NODE_H }));
    d.edges.forEach((e) =>
      g.setEdge(e.from, e.to, e.label ? { label: e.label, width: e.label.length * 7.5 + 20, height: 24, labelpos: "c" } : {}, e.id),
    );
    dagre.layout(g);
    return g;
  }, [d.nodes, d.edges]);
  const { width = 0, height = 0 } = layout.graph();
  const fresh = new Set(d.fresh);

  return (
    <svg viewBox={`0 0 ${Math.max(width, 1)} ${Math.max(height, 1)}`} width="100%" height="100%" style={cap(width, height)} role="img" aria-label={d.title}>
      <Defs id={sid} />
      {d.edges.map((e) => {
        const pts = layout.edge(e.from, e.to, e.id)?.points;
        if (!pts) return null;
        const hot = fresh.has(e.id) && !still;
        const lab = layout.edge(e.from, e.to, e.id);
        return (
          <g key={e.id} style={hot ? { animation: "ll-fade 500ms var(--ease) both" } : undefined}>
            <path
              d={pts.map((p: { x: number; y: number }, i: number) => `${i ? "L" : "M"}${p.x} ${p.y}`).join(" ")}
              fill="none"
              stroke={hot ? "var(--grape)" : EDGE}
              strokeWidth={2}
              strokeLinejoin="round"
              markerEnd={`url(#${sid}-${hot ? "af" : "a"})`}
            />
            {e.label && (
              <text x={lab.x} y={lab.y} textAnchor="middle" dominantBaseline="central" fontSize={13} fill="rgba(0,0,0,.54)" stroke="#fff" strokeWidth={5} paintOrder="stroke">
                {e.label}
              </text>
            )}
          </g>
        );
      })}
      {d.nodes.map((n) => {
        const p = layout.node(n.id);
        return <Node key={n.id} sid={sid} x={p.x} y={p.y} w={p.width} label={n.label} role={n.role} fresh={fresh.has(n.id)} still={still} />;
      })}
    </svg>
  );
}

function Cycle({ d, still }: { d: Diagram; still: boolean }) {
  const sid = useSid();
  const n = d.nodes.length;
  const r = Math.max(120, n * 42);
  const w = Math.max(...d.nodes.map((x) => nodeW(x.label)), 140);
  const cx = r + w / 2 + 10;
  const cy = r + NODE_H / 2 + 10;
  const pos = new Map(d.nodes.map((x, i) => [x.id, { x: cx + r * Math.sin((2 * Math.PI * i) / n), y: cy - r * Math.cos((2 * Math.PI * i) / n) }]));
  // Edges in order if the model gave none.
  const edges = d.edges.length ? d.edges : d.nodes.map((x, i) => ({ id: `c${i}`, from: x.id, to: d.nodes[(i + 1) % n].id, label: undefined }));
  const fresh = new Set(d.fresh);

  return (
    <svg viewBox={`0 0 ${cx * 2} ${cy * 2}`} width="100%" height="100%" style={cap(cx * 2, cy * 2)} role="img" aria-label={d.title}>
      <Defs id={sid} />
      {n > 1 &&
        edges.map((e) => {
          const a = pos.get(e.from);
          const b = pos.get(e.to);
          if (!a || !b) return null;
          // Arc along the circle, trimmed so it starts and ends outside the notes.
          const ang = (p: { x: number; y: number }) => Math.atan2(p.y - cy, p.x - cx);
          let a0 = ang(a);
          let a1 = ang(b);
          if (a1 <= a0) a1 += 2 * Math.PI;
          const trim = Math.min(0.45, (a1 - a0) / 3);
          a0 += trim;
          a1 -= trim;
          const p0 = { x: cx + r * Math.cos(a0), y: cy + r * Math.sin(a0) };
          const p1 = { x: cx + r * Math.cos(a1), y: cy + r * Math.sin(a1) };
          const hot = fresh.has(e.id) && !still;
          return (
            <path
              key={e.id}
              d={`M${p0.x} ${p0.y} A${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${p1.x} ${p1.y}`}
              fill="none"
              stroke={hot ? "var(--grape)" : EDGE}
              strokeWidth={2}
              markerEnd={`url(#${sid}-${hot ? "af" : "a"})`}
            />
          );
        })}
      {d.nodes.map((x) => {
        const p = pos.get(x.id)!;
        return <Node key={x.id} sid={sid} x={p.x} y={p.y} w={nodeW(x.label)} label={x.label} role={x.role === "other" ? "process" : x.role} fresh={fresh.has(x.id)} still={still} />;
      })}
    </svg>
  );
}

function Timeline({ d, still }: { d: Diagram; still: boolean }) {
  const sid = useSid();
  const step = 190;
  const W = Math.max(1, d.events.length) * step + 40;
  const H = 300;
  const mid = H / 2;
  const fresh = new Set(d.fresh);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" style={cap(W, H)} role="img" aria-label={d.title}>
      <Defs id={sid} />
      <line x1={20} y1={mid} x2={W - 20} y2={mid} stroke={EDGE} strokeWidth={2} markerEnd={`url(#${sid}-a)`} />
      {byDate(d.events).map((e, i) => {
        const x = 20 + step / 2 + i * step;
        const up = i % 2 === 0;
        const hot = fresh.has(e.id) && !still;
        const cardY = up ? mid - 112 : mid + 28;
        return (
          <g key={e.id} style={hot ? { transformBox: "fill-box", transformOrigin: "center", animation: "ll-in 600ms var(--ease) both" } : undefined}>
            <line x1={x} y1={up ? cardY + 84 : mid} x2={x} y2={up ? mid : cardY} stroke={EDGE} strokeWidth={2} />
            <circle cx={x} cy={mid} r={7} fill={hot ? "var(--grape)" : "#fff"} stroke={hot ? "var(--grape)" : EDGE} strokeWidth={2} />
            <rect x={x - 80} y={cardY} width={160} height={84} rx={12} fill="var(--canary-tint)" stroke={hot ? "var(--grape)" : "none"} strokeWidth={2} filter={`url(#${sid}-sh)`} />
            <text x={x} y={cardY + 30} textAnchor="middle" fontSize={20} fontWeight={600} fill="#111">{e.when}</text>
            <Lines x={x} y={cardY + 57} lines={wrap(e.label, 18)} size={15} lh={17} fill="rgba(0,0,0,.6)" />
          </g>
        );
      })}
    </svg>
  );
}

// Events in date order when every date reads as a year ("1914", "1914–1918", "500 BC"); otherwise as added.
function byDate<T extends { when: string }>(events: T[]) {
  const year = (w: string) => {
    const m = w.match(/-?\d+/);
    if (!m) return null;
    return /\b(BC|BCE)\b/i.test(w) ? -Math.abs(+m[0]) : +m[0];
  };
  const years = events.map((e) => year(e.when));
  if (years.some((y) => y === null)) return events;
  return events.map((e, i) => ({ e, y: years[i]! })).sort((a, b) => a.y - b.y).map((x) => x.e);
}

const CURVE_COLOURS = ["#111", "#8b00f9", "#3992de", "#ff4081"];

function Graph({ d, still }: { d: Diagram; still: boolean }) {
  const pad = 28;
  const ax = d.axes ?? { x: [-5, 5] as [number, number], y: [-5, 5] as [number, number] };
  const spanX = ax.x[1] - ax.x[0];
  const spanY = ax.y[1] - ax.y[0];
  // One unit across must equal one unit up, or a square draws as a rectangle. Geometry always gets equal
  // units; a function graph does too unless its ranges are so different that it would be unreadable.
  const equal = (d.segments?.length ?? 0) > 0 || (spanY / spanX <= 2.5 && spanX / spanY <= 2.5);
  const unit = Math.min(464 / spanX, 464 / spanY);
  const W = equal ? spanX * unit + 2 * pad : 520;
  const H = equal ? spanY * unit + 2 * pad : 400;
  const sx = (x: number) => pad + ((x - ax.x[0]) / spanX) * (W - 2 * pad);
  const sy = (y: number) => H - pad - ((y - ax.y[0]) / spanY) * (H - 2 * pad);
  const fresh = new Set(d.fresh);
  // With equal units both axes share one grid step, so the cells are square.
  const shared = Math.max(1, Math.round(Math.max(spanX, spanY) / 10));
  const ticks = (lo: number, hi: number) => {
    const out: number[] = [];
    const s = equal ? shared : Math.max(1, Math.round((hi - lo) / 10));
    for (let v = Math.ceil(lo / s) * s; v <= hi; v += s) out.push(v);
    return out;
  };

  const paths = d.curves.map((c) => {
    let f: ((x: number) => number) | null = null;
    try {
      const code = compile(c.expr.replace(/^\s*y\s*=/, ""));
      // evaluate can still throw (e.g. "m*x + b": undefined symbols), so a bad point becomes a gap.
      f = (x) => {
        try {
          return Number(code.evaluate({ x, ln: Math.log })); // mathjs calls the natural log "log"
        } catch {
          return NaN;
        }
      };
    } catch {
      return { c, path: "" }; // unparseable expression: skip the curve, keep the rest of the diagram
    }
    let path = "";
    let pen = false;
    for (let i = 0; i <= 240; i++) {
      const x = ax.x[0] + ((ax.x[1] - ax.x[0]) * i) / 240;
      const y = f(x);
      const ok = Number.isFinite(y) && y >= ax.y[0] - 50 && y <= ax.y[1] + 50;
      if (ok) path += `${pen ? "L" : "M"}${sx(x).toFixed(1)} ${sy(y).toFixed(1)}`;
      pen = ok;
    }
    return { c, path };
  });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" role="img" aria-label={d.title}>
      <clipPath id={`clip-${d.id}`}>
        <rect x={pad} y={pad} width={W - 2 * pad} height={H - 2 * pad} />
      </clipPath>
      {ticks(ax.x[0], ax.x[1]).map((v) => (
        <line key={`x${v}`} x1={sx(v)} x2={sx(v)} y1={pad} y2={H - pad} stroke="#ebecef" />
      ))}
      {ticks(ax.y[0], ax.y[1]).map((v) => (
        <line key={`y${v}`} y1={sy(v)} y2={sy(v)} x1={pad} x2={W - pad} stroke="#ebecef" />
      ))}
      {/* Numbers along the axes (or the edges when an axis is off screen), leaving out 0 where the axes cross. */}
      {ticks(ax.x[0], ax.x[1])
        .filter((v) => v !== 0 || !(ax.y[0] <= 0 && ax.y[1] >= 0))
        .map((v) => (
          <text key={`nx${v}`} x={sx(v)} y={(ax.y[0] <= 0 && ax.y[1] >= 0 ? sy(0) : H - pad) + 16} textAnchor="middle" fontSize={12} fill="#6b6f76">
            {v}
          </text>
        ))}
      {ticks(ax.y[0], ax.y[1])
        .filter((v) => v !== 0)
        .map((v) => (
          <text key={`ny${v}`} x={(ax.x[0] <= 0 && ax.x[1] >= 0 ? sx(0) : pad) - 6} y={sy(v)} textAnchor="end" dominantBaseline="central" fontSize={12} fill="#6b6f76">
            {v}
          </text>
        ))}
      {ax.x[0] <= 0 && ax.x[1] >= 0 && <line x1={sx(0)} x2={sx(0)} y1={pad} y2={H - pad} stroke="#94969b" strokeWidth={1.5} />}
      {ax.y[0] <= 0 && ax.y[1] >= 0 && <line y1={sy(0)} y2={sy(0)} x1={pad} x2={W - pad} stroke="#94969b" strokeWidth={1.5} />}
      <g clipPath={`url(#clip-${d.id})`}>
        {paths.map(({ c, path }, i) => (
          <path
            key={c.id}
            d={path}
            fill="none"
            stroke={CURVE_COLOURS[i % CURVE_COLOURS.length]}
            strokeWidth={3}
            strokeLinecap="round"
            pathLength={1}
            style={fresh.has(c.id) && !still ? { strokeDasharray: 1, animation: "ll-draw 900ms var(--ease) both" } : undefined}
          />
        ))}
      </g>
      {/* A legend in the top-left corner: labels at the curves' ends collide where curves leave the grid together. */}
      {paths.some(({ c }) => c.label) && (
        <g>
          <rect
            x={pad + 8}
            y={pad + 8}
            width={Math.max(...paths.map(({ c }) => (c.label ?? "").length)) * 8.5 + 44}
            height={paths.filter(({ c }) => c.label).length * 24 + 10}
            rx={8}
            fill="#fff"
            fillOpacity={0.92}
            stroke="#ebecef"
          />
          {paths
            .map(({ c }, i) => ({ c, colour: CURVE_COLOURS[i % CURVE_COLOURS.length] }))
            .filter(({ c }) => c.label)
            .map(({ c, colour }, k) => (
              <g key={`l${c.id}`}>
                <line x1={pad + 18} x2={pad + 36} y1={pad + 25 + k * 24} y2={pad + 25 + k * 24} stroke={colour} strokeWidth={3} strokeLinecap="round" />
                <text x={pad + 44} y={pad + 25 + k * 24} dominantBaseline="central" fontSize={14} fontWeight={600} fill={colour}>
                  {c.label}
                </text>
              </g>
            ))}
        </g>
      )}
      {(d.segments ?? []).map((g, _, all) => {
        const hot = fresh.has(g.id) && !still;
        const [x1, y1, x2, y2] = [sx(g.from[0]), sy(g.from[1]), sx(g.to[0]), sy(g.to[1])];
        // Put the label beside its side, on the side away from the middle of the shape.
        const cx = all.reduce((t, x) => t + sx(x.from[0]) + sx(x.to[0]), 0) / (2 * all.length);
        const cy = all.reduce((t, x) => t + sy(x.from[1]) + sy(x.to[1]), 0) / (2 * all.length);
        const [mx, my] = [(x1 + x2) / 2, (y1 + y2) / 2];
        const len = Math.hypot(x2 - x1, y2 - y1) || 1;
        let [nx, ny] = [(y1 - y2) / len, (x2 - x1) / len];
        if (nx * (mx - cx) + ny * (my - cy) < 0) [nx, ny] = [-nx, -ny];
        const [lx, ly] = [mx + nx * 16, my + ny * 16];
        return (
          <g key={g.id} style={hot ? { animation: "ll-fade 500ms var(--ease) both" } : undefined}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={hot ? "var(--grape)" : "#111"} strokeWidth={3} strokeLinecap="round" />
            {g.label && (
              <text x={lx} y={ly} textAnchor="middle" dominantBaseline="central" fontSize={15} fontWeight={600} fill="#111" stroke="#fff" strokeWidth={5} paintOrder="stroke">
                {g.label}
              </text>
            )}
          </g>
        );
      })}
      {d.points.map((p) => {
        const hot = fresh.has(p.id) && !still;
        return (
          <g key={p.id} style={hot ? { transformBox: "fill-box", transformOrigin: "center", animation: "ll-in 600ms var(--ease) both" } : undefined}>
            <circle cx={sx(p.x)} cy={sy(p.y)} r={hot ? 8 : 6} fill="var(--grape)" stroke="#fff" strokeWidth={2} />
            {p.label && (
              <text x={sx(p.x)} y={sy(p.y) + (Math.abs(sy(p.y) - sy(0)) < 4 ? -14 : 26)} textAnchor="middle" fontSize={14} fontWeight={600} fill="#111" stroke="#fff" strokeWidth={5} paintOrder="stroke">
                {p.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function Molecule({ d, still }: { d: Diagram; still: boolean }) {
  const ref = useRef<SVGSVGElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!d.smiles || !ref.current) return;
    setFailed(false);
    let live = true;
    import("smiles-drawer").then(({ default: SD }) => {
      if (!live || !ref.current) return;
      try {
        const tree = SD.Parser.parse(d.smiles!);
        ref.current.innerHTML = "";
        new SD.SvgDrawer({ width: 480, height: 400, bondThickness: 1.6, fontSizeLarge: 14, fontSizeSmall: 9, padding: 24 }).draw(tree, ref.current, "light");
        ref.current.setAttribute("width", "100%");
        ref.current.setAttribute("height", "100%");
        setFailed(false);
      } catch (e) {
        console.error("SMILES parse failed", d.smiles, e);
        setFailed(true);
      }
    });
    return () => {
      live = false;
    };
  }, [d.smiles]);

  if (failed || !d.smiles)
    return (
      <svg viewBox="0 0 480 160" width="100%" height="100%" role="img" aria-label={d.title}>
        <Lines x={240} y={80} lines={wrap(d.title || "Molecule", 24)} size={30} weight={700} fill="#111" />
      </svg>
    );
  return (
    <svg
      ref={ref}
      viewBox="0 0 480 400"
      width="100%"
      height="100%"
      role="img"
      aria-label={d.title}
      style={!still && d.fresh.includes("smiles") ? { animation: "ll-fade 600ms var(--ease) both" } : undefined}
    />
  );
}

// Padlet's palette as bubble-letter paint: light top, brighter base, and a dark outline of the same hue.
const BUBBLE = [
  { light: "#f6ecff", mid: "#b98cff", ink: "#3d1a78" },
  { light: "#e6f3ff", mid: "#6fb3f2", ink: "#0c3b6e" },
  { light: "#ffe8ee", mid: "#ff7aa8", ink: "#7a0f35" },
  { light: "#ecffe9", mid: "#78d96f", ink: "#1d5a17" },
  { light: "#fff8dc", mid: "#ffd54f", ink: "#6b4e00" },
];
const BUBBLE_FONT = { fontFamily: "var(--font-bubble), ui-rounded, system-ui, sans-serif" };

// Letters and the sounds they make: each letter (or letter group, "sh") in a fat bubble font, its sound in a pill,
// and an example word with the letter picked out.
function Letters({ d, still }: { d: Diagram; still: boolean }) {
  const sid = useSid();
  const letters = d.letters ?? [];
  const size = 200;
  const fresh = new Set(d.fresh);
  // The font is drawn, not measured, so widths are estimates: generous enough that neighbours never touch.
  const widths = letters.map((l) => Math.max(260, [...l.text].reduce((w, ch) => w + (ch === ch.toUpperCase() ? 0.68 : 0.56) * size, 0) + 70));
  const W = Math.max(1, widths.reduce((a, b) => a + b, 0)) + 40;
  const H = 400;
  let x = 20;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" style={cap(W, H)} role="img" aria-label={d.title}>
      <defs>
        {BUBBLE.map((c, i) => (
          <linearGradient key={i} id={`${sid}-g${i}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0.15" stopColor={c.light} />
            <stop offset="0.85" stopColor={c.mid} />
          </linearGradient>
        ))}
        <linearGradient id={`${sid}-shine`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity={0.7} />
          <stop offset="0.45" stopColor="#fff" stopOpacity={0} />
        </linearGradient>
      </defs>
      {letters.map((l, i) => {
        const c = BUBBLE[i % BUBBLE.length];
        const cx = x + widths[i] / 2;
        x += widths[i];
        const hot = fresh.has(l.id) && !still;
        const base = { x: cx, y: 225, textAnchor: "middle" as const, fontSize: size, fontWeight: 700, style: BUBBLE_FONT };
        return (
          <g key={l.id} style={hot ? { transformBox: "fill-box", transformOrigin: "center", animation: "ll-in 600ms var(--ease) both" } : undefined}>
            <text {...base} transform="translate(0 8)" fill={c.ink} opacity={0.16} stroke={c.ink} strokeWidth={18} strokeLinejoin="round">
              {l.text}
            </text>
            <text {...base} fill={c.ink} stroke={c.ink} strokeWidth={18} strokeLinejoin="round">
              {l.text}
            </text>
            <text {...base} fill="#fff" stroke="#fff" strokeWidth={8} strokeLinejoin="round">
              {l.text}
            </text>
            <text {...base} fill={`url(#${sid}-g${i % BUBBLE.length})`}>{l.text}</text>
            {/* A gloss on the top of each letter, like light on a soap bubble. */}
            <text {...base} fill={`url(#${sid}-shine)`}>
              {l.text}
            </text>
            {l.sound && (
              <g>
                <rect x={cx - 56} y={262} width={112} height={44} rx={22} fill={c.light} stroke={c.mid} strokeWidth={2} />
                <text x={cx} y={292} textAnchor="middle" fontSize={26} fontWeight={700} fill={c.ink} style={BUBBLE_FONT}>
                  {l.sound}
                </text>
              </g>
            )}
            {l.word && (
              <text x={cx} y={l.sound ? 352 : 300} textAnchor="middle" fontSize={34} fontWeight={600} fill="#111" style={BUBBLE_FONT}>
                {pickOut(l.word, l.text).map((part, k) => (
                  <tspan key={k} fill={part.hit ? c.ink : undefined} fontWeight={part.hit ? 700 : undefined} textDecoration={part.hit ? "underline" : undefined}>
                    {part.text}
                  </tspan>
                ))}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// "moon" with "Mm" → [m]oon: the first place the letter (either case) or letter group appears in the word.
function pickOut(word: string, letters: string) {
  const forms = [...new Set([letters, letters.toLowerCase(), letters.slice(-1), letters[0]?.toLowerCase()])].filter(Boolean);
  for (const f of forms) {
    const at = word.toLowerCase().indexOf(f.toLowerCase());
    if (at >= 0) return [{ text: word.slice(0, at) }, { text: word.slice(at, at + f.length), hit: true }, { text: word.slice(at + f.length) }];
  }
  return [{ text: word }];
}

// Two or three overlapping circles; each item is written in the region of the sets it belongs to, and items in
// none of them are listed underneath.
const VENN_COLOURS = [
  { fill: "var(--grape-tint)", line: "#b98cff", ink: "#3d1a78" },
  { fill: "var(--oceanic-tint)", line: "#6fb3f2", ink: "#0c3b6e" },
  { fill: "var(--canary-tint)", line: "#ffd54f", ink: "#6b4e00" },
];
const VENN_LAYOUT = {
  1: { W: 460, H: 440, r: 180, c: [[230, 250]], label: [[230, 40]] },
  2: { W: 680, H: 460, r: 180, c: [[240, 250], [440, 250]], label: [[170, 40], [510, 40]] },
  3: { W: 700, H: 640, r: 165, c: [[260, 225], [440, 225], [350, 380]], label: [[150, 36], [550, 36], [350, 620]] },
} as const;

function Venn({ d, still }: { d: Diagram; still: boolean }) {
  const sets = (d.sets ?? []).slice(0, 3);
  const n = Math.max(1, sets.length) as 1 | 2 | 3;
  const L = VENN_LAYOUT[n];
  const fresh = new Set(d.fresh);
  const outside = (d.items ?? []).filter((it) => !it.sets.length);
  const H = L.H + (outside.length ? 60 : 0);
  // Where each combination of sets is drawn: the average of their centres, pushed away from the others.
  const spot = (memberOf: string[]) => {
    const inIdx = sets.map((x, i) => (memberOf.includes(x.id) ? i : -1)).filter((i) => i >= 0);
    const avg = (pts: number[][]) => [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];
    const mid = avg(L.c.map((p) => [...p]));
    const here = avg(inIdx.map((i) => [...L.c[i]]));
    if (inIdx.length === sets.length) return here; // in every set: the centre
    const push = inIdx.length === 1 ? 0.55 : 0.35;
    return [here[0] + (here[0] - mid[0]) * push, here[1] + (here[1] - mid[1]) * push];
  };
  const regions = new Map<string, { at: number[]; items: { id: string; label: string }[] }>();
  for (const it of d.items ?? []) {
    if (!it.sets.length) continue;
    const key = [...it.sets].sort().join("|");
    if (!regions.has(key)) regions.set(key, { at: spot(it.sets), items: [] });
    regions.get(key)!.items.push(it);
  }
  return (
    <svg viewBox={`0 0 ${L.W} ${H}`} width="100%" height="100%" style={cap(L.W, H)} role="img" aria-label={d.title}>
      {sets.map((x, i) => {
        const hot = fresh.has(x.id) && !still;
        return (
          <g key={x.id} style={hot ? { animation: "ll-fade 600ms var(--ease) both" } : undefined}>
            <circle cx={L.c[i][0]} cy={L.c[i][1]} r={L.r} fill={VENN_COLOURS[i].fill} fillOpacity={0.8} stroke={VENN_COLOURS[i].line} strokeWidth={3} style={{ mixBlendMode: "multiply" }} />
            <text x={L.label[i][0]} y={L.label[i][1]} textAnchor="middle" fontSize={24} fontWeight={700} fill={VENN_COLOURS[i].ink}>
              {x.label}
            </text>
          </g>
        );
      })}
      {[...regions.values()].map(({ at, items }) =>
        items.slice(0, 5).map((it, k) => (
          <text
            key={it.id}
            x={at[0]}
            y={at[1] + (k - (Math.min(items.length, 5) - 1) / 2) * 28}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={21}
            fontWeight={600}
            fill="#111"
            style={fresh.has(it.id) && !still ? { animation: "ll-fade 500ms var(--ease) both" } : undefined}
          >
            {it.label}
          </text>
        )),
      )}
      {outside.length > 0 && (
        <text x={L.W / 2} y={H - 22} textAnchor="middle" fontSize={17} fill="rgba(0,0,0,.6)">
          Neither: {outside.map((it) => it.label).join(", ")}
        </text>
      )}
    </svg>
  );
}

// A table: pastel header row across the top, row labels (when there are any) down the left, wrapped cell text.
function Table({ d, still }: { d: Diagram; still: boolean }) {
  const cols = d.columns ?? [];
  const rows = d.rows ?? [];
  const fresh = new Set(d.fresh);
  const labelled = rows.some((r) => r.label);
  const cell = (r: string, c: string) => (d.cells ?? []).find((x) => x.row === r && x.col === c)?.text ?? "";
  // Columns as wide as their longest text needs, within limits, so short tables don't look stretched.
  const colW = cols.map((c) => Math.min(240, Math.max(130, ...[c.label, ...rows.map((r) => cell(r.id, c.id))].map((t) => Math.min(t.length, 26) * 8.5 + 32))));
  const labelW = labelled ? Math.min(200, Math.max(110, ...rows.map((r) => (r.label ?? "").length * 8.5 + 32))) : 0;
  const headH = 56;
  const rowH = 68;
  const W = labelW + colW.reduce((a, b) => a + b, 0) || 1;
  const H = headH + Math.max(1, rows.length) * rowH;
  const x0 = (i: number) => labelW + colW.slice(0, i).reduce((a, b) => a + b, 0);
  const anim = (id: string) => (fresh.has(id) && !still ? { animation: "ll-fade 500ms var(--ease) both" } : undefined);
  return (
    <svg viewBox={`-2 -2 ${W + 4} ${H + 4}`} width="100%" height="100%" style={cap(W, H)} role="img" aria-label={d.title}>
      <rect x={0} y={0} width={W} height={H} rx={14} fill="#fff" stroke="#e3e4e8" />
      <path d={`M14 0H${W - 14}a14 14 0 0 1 14 14V${headH}H0V14a14 14 0 0 1 14-14z`} fill="var(--grape-tint)" />
      {labelled && <rect x={0} y={headH} width={labelW} height={H - headH} fill="var(--canary-tint)" />}
      {cols.map((c, i) => (
        <g key={c.id} style={anim(c.id)}>
          <Lines x={x0(i) + colW[i] / 2} y={headH / 2} lines={wrap(c.label, Math.floor(colW[i] / 9.5), 2)} size={17} weight={700} fill="#3d1a78" lh={19} />
        </g>
      ))}
      {rows.map((r, j) => (
        <g key={r.id} style={anim(r.id)}>
          {j > 0 && <line x1={0} x2={W} y1={headH + j * rowH} y2={headH + j * rowH} stroke="#ebecef" />}
          {labelled && <Lines x={labelW / 2} y={headH + j * rowH + rowH / 2} lines={wrap(r.label ?? "", Math.floor(labelW / 9), 2)} size={16} weight={700} fill="#6b4e00" lh={18} />}
          {cols.map((c, i) => (
            <g key={c.id} style={anim(`${r.id}:${c.id}`)}>
              <Lines x={x0(i) + colW[i] / 2} y={headH + j * rowH + rowH / 2} lines={wrap(cell(r.id, c.id), Math.floor(colW[i] / 8.5), 3)} size={15} fill="#111" lh={18} />
            </g>
          ))}
        </g>
      ))}
      {cols.slice(1).map((c, i) => (
        <line key={c.id} x1={x0(i + 1)} x2={x0(i + 1)} y1={0} y2={H} stroke="#ebecef" />
      ))}
      {labelled && <line x1={labelW} x2={labelW} y1={0} y2={H} stroke="#ebecef" />}
    </svg>
  );
}

// "3/4" for 0.75 when the line counts in quarters; whole numbers as they are.
function tickLabel(v: number, step: number) {
  const n = Math.round(1 / step);
  if (step >= 1 || Math.abs(1 / step - n) > 1e-6 || n > 12) return String(+v.toFixed(2));
  const k = Math.round(v * n);
  if (k % n === 0) return String(k / n);
  const g = (a: number, b: number): number => (b ? g(b, a % b) : a);
  const div = g(Math.abs(k), n);
  return `${k / div}/${n / div}`;
}

// A number line: numbered ticks, marked values as dots, and jumps as arcs above the line ("start at 3, jump 4").
function NumberLine({ d, still }: { d: Diagram; still: boolean }) {
  const sid = useSid();
  const marks = d.marks ?? [];
  const jumps = d.jumps ?? [];
  const values = [...marks.map((m) => m.value), ...jumps.flatMap((j) => [j.from, j.to])];
  const lo = Math.min(0, ...values);
  const hi = Math.max(10, ...values);
  const line = d.line ?? { min: Math.floor(lo), max: Math.ceil(hi), step: Math.max(1, Math.ceil((hi - lo) / 20)) };
  const W = 720;
  const pad = 40;
  const sxRaw = (v: number) => pad + ((v - line.min) / (line.max - line.min)) * (W - 2 * pad);
  const arc = (j: { from: number; to: number }) => Math.min(140, Math.max(50, Math.abs(sxRaw(j.to) - sxRaw(j.from)) * 0.45));
  // Only as tall as what's drawn: room above the line for the highest jump and its label, below for labels.
  const top = jumps.length ? Math.max(...jumps.map(arc)) + 54 : 30;
  const y = top;
  const H = top + (marks.some((m) => m.label) ? 96 : 60);
  const sx = sxRaw;
  const ticks: number[] = [];
  for (let v = line.min; v <= line.max + 1e-9; v += line.step) ticks.push(+v.toFixed(6));
  const fresh = new Set(d.fresh);
  const anim = (id: string, pop = false) =>
    fresh.has(id) && !still ? (pop ? { transformBox: "fill-box" as const, transformOrigin: "center", animation: "ll-in 600ms var(--ease) both" } : { animation: "ll-fade 600ms var(--ease) both" }) : undefined;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" style={cap(W, H)} role="img" aria-label={d.title}>
      <Defs id={sid} />
      <line x1={pad - 24} x2={W - pad + 24} y1={y} y2={y} stroke="#6b6f76" strokeWidth={3} strokeLinecap="round" />
      {ticks.map((v) => (
        <g key={v}>
          <line x1={sx(v)} x2={sx(v)} y1={y - 10} y2={y + 10} stroke="#6b6f76" strokeWidth={2} />
          {ticks.length <= 21 || Math.round((v - line.min) / line.step) % 2 === 0 ? (
            <text x={sx(v)} y={y + 38} textAnchor="middle" fontSize={22} fontWeight={600} fill="#111">
              {tickLabel(v, line.step)}
            </text>
          ) : null}
        </g>
      ))}
      {jumps.map((j) => {
        const [x1, x2] = [sx(j.from), sx(j.to)];
        const h = arc(j);
        return (
          <g key={j.id} style={anim(j.id)}>
            <path d={`M${x1} ${y - 6} C${x1} ${y - h}, ${x2} ${y - h}, ${x2} ${y - 6}`} fill="none" stroke="var(--grape)" strokeWidth={3} markerEnd={`url(#${sid}-af)`} />
            {j.label && (
              <text x={(x1 + x2) / 2} y={y - h * 0.75 - 14} textAnchor="middle" fontSize={26} fontWeight={700} fill="var(--grape-strong)" stroke="#fff" strokeWidth={5} paintOrder="stroke">
                {j.label}
              </text>
            )}
          </g>
        );
      })}
      {marks.map((m) => (
        <g key={m.id} style={anim(m.id, true)}>
          <circle cx={sx(m.value)} cy={y} r={10} fill="var(--grape)" stroke="#fff" strokeWidth={3} />
          {m.label && (
            <text x={sx(m.value)} y={y + 74} textAnchor="middle" fontSize={20} fontWeight={600} fill="#3d1a78">
              {m.label}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}

// Round steps for an axis: 1, 2, 5, 10, 20, 50… so there are about five gridlines.
function niceStep(max: number) {
  const raw = Math.max(1, max) / 5;
  const pow = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw)!;
}

const PASTEL_BARS = ["#b98cff", "#6fb3f2", "#ff7aa8", "#78d96f", "#ffd54f", "#ff9b5e", "#5fd4c4", "#c9a7ff"];

// A bar chart: one rounded pastel bar per category with its value on top, a numbered axis and gridlines.
function BarChart({ d, still }: { d: Diagram; still: boolean }) {
  const bars = d.bars ?? [];
  const fresh = new Set(d.fresh);
  const max = Math.max(1, ...bars.map((b) => b.value));
  const step = niceStep(max);
  const top = Math.ceil(max / step) * step;
  const left = 64;
  const slot = 110;
  const W = left + Math.max(1, bars.length) * slot + 24;
  const plotTop = d.chart?.axis ? 48 : 24;
  const plotH = 300;
  const H = plotTop + plotH + 70;
  const sy = (v: number) => plotTop + plotH - (v / top) * plotH;
  const grid: number[] = [];
  for (let v = 0; v <= top + 1e-9; v += step) grid.push(+v.toFixed(6));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" style={cap(W, H)} role="img" aria-label={d.title}>
      {d.chart?.axis && (
        <text x={left - 40} y={22} fontSize={15} fontWeight={600} fill="#6b6f76">
          {d.chart.axis}
        </text>
      )}
      {grid.map((v) => (
        <g key={v}>
          <line x1={left} x2={W - 16} y1={sy(v)} y2={sy(v)} stroke={v === 0 ? "#94969b" : "#ebecef"} strokeWidth={v === 0 ? 2 : 1} />
          <text x={left - 10} y={sy(v)} textAnchor="end" dominantBaseline="central" fontSize={15} fill="#6b6f76">
            {v}
          </text>
        </g>
      ))}
      {bars.map((b, i) => {
        const x = left + i * slot + 22;
        const w = slot - 44;
        const hot = fresh.has(b.id) && !still;
        return (
          <g key={b.id} style={hot ? { transformBox: "fill-box", transformOrigin: "bottom", animation: "ll-grow 700ms var(--ease) both" } : undefined}>
            <rect x={x} y={sy(b.value)} width={w} height={Math.max(0, sy(0) - sy(b.value))} rx={10} fill={PASTEL_BARS[i % PASTEL_BARS.length]} />
            <rect x={x} y={sy(0) - 10} width={w} height={10} fill={PASTEL_BARS[i % PASTEL_BARS.length]} />
            <text x={x + w / 2} y={sy(b.value) - 10} textAnchor="middle" fontSize={18} fontWeight={700} fill="#111">
              {+b.value.toFixed(2)}
            </text>
            <Lines x={x + w / 2} y={sy(0) + 30} lines={wrap(b.label, 12)} size={15} weight={600} fill="#111" lh={17} />
          </g>
        );
      })}
    </svg>
  );
}

// A pictograph: each category is a row of its icon; with big numbers each icon stands for several, shown in a key.
function Pictograph({ d, still }: { d: Diagram; still: boolean }) {
  const bars = d.bars ?? [];
  const fresh = new Set(d.fresh);
  const max = Math.max(1, ...bars.map((b) => b.value));
  const per = max <= 10 ? 1 : niceStep(max / 2); // at most about ten icons in a row
  const labelW = 150;
  const icon = 40;
  const rowH = 58;
  const W = labelW + Math.ceil(max / per) * icon + 40;
  const H = bars.length * rowH + (per > 1 ? 60 : 24);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" style={cap(W, H)} role="img" aria-label={d.title}>
      {bars.map((b, i) => {
        const y = 12 + i * rowH + rowH / 2;
        const whole = Math.floor(b.value / per);
        const part = b.value / per - whole; // a half icon for a remainder, cut off on the right
        const hot = fresh.has(b.id) && !still;
        return (
          <g key={b.id} style={hot ? { animation: "ll-fade 600ms var(--ease) both" } : undefined}>
            <rect x={4} y={y - rowH / 2 + 4} width={W - 8} height={rowH - 8} rx={12} fill={i % 2 ? "#fff" : "var(--canary-tint)"} />
            <text x={20} y={y} dominantBaseline="central" fontSize={18} fontWeight={700} fill="#111">
              {b.label}
            </text>
            {Array.from({ length: whole + (part > 0.05 ? 1 : 0) }, (_, k) => (
              <text key={k} x={labelW + k * icon + icon / 2} y={y} textAnchor="middle" dominantBaseline="central" fontSize={30} style={k === whole ? { clipPath: `inset(0 ${(1 - part) * 100}% 0 0)` } : undefined}>
                {b.icon ?? "●"}
              </text>
            ))}
          </g>
        );
      })}
      {per > 1 && (
        <text x={20} y={H - 22} fontSize={16} fontWeight={600} fill="#6b6f76">
          Each picture = {per}
        </text>
      )}
    </svg>
  );
}

// Fractions as equal parts with the shaded ones coloured: bars stacked full width (so 1/2 and 2/4 line up), or circles.
function Fractions({ d, still }: { d: Diagram; still: boolean }) {
  const fr = d.fractions ?? [];
  const fresh = new Set(d.fresh);
  const circles = fr.length > 0 && fr.every((f) => f.shape === "circle");
  const colours = ["#b98cff", "#6fb3f2", "#ff7aa8", "#78d96f"];
  const written = (f: { num: number; den: number }, x: number, y: number, size: number) => (
    <g>
      <text x={x} y={y - size * 0.18} textAnchor="middle" fontSize={size} fontWeight={700} fill="#111">{f.num}</text>
      <line x1={x - size * 0.5} x2={x + size * 0.5} y1={y + size * 0.05} y2={y + size * 0.05} stroke="#111" strokeWidth={3} strokeLinecap="round" />
      <text x={x} y={y + size * 0.95} textAnchor="middle" fontSize={size} fontWeight={700} fill="#111">{f.den}</text>
    </g>
  );
  const anim = (id: string) => (fresh.has(id) && !still ? { animation: "ll-fade 600ms var(--ease) both" } : undefined);
  if (circles) {
    const r = 110;
    const slot = 2 * r + 60;
    const W = fr.length * slot;
    const H = 2 * r + 150;
    return (
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" style={cap(W, H)} role="img" aria-label={d.title}>
        {fr.map((f, i) => {
          const cx = i * slot + slot / 2;
          const cy = r + 20;
          const pt = (k: number) => [cx + r * Math.sin((2 * Math.PI * k) / f.den), cy - r * Math.cos((2 * Math.PI * k) / f.den)];
          return (
            <g key={f.id} style={anim(f.id)}>
              {Array.from({ length: f.den }, (_, k) => {
                const [x1, y1] = pt(k);
                const [x2, y2] = pt(k + 1);
                const shade = k < f.num ? colours[i % colours.length] : "#fff";
                return f.den === 1 ? (
                  <circle key={k} cx={cx} cy={cy} r={r} fill={shade} stroke="#3d1a78" strokeWidth={2.5} />
                ) : (
                  <path key={k} d={`M${cx} ${cy}L${x1} ${y1}A${r} ${r} 0 0 1 ${x2} ${y2}Z`} fill={shade} stroke="#3d1a78" strokeWidth={2.5} strokeLinejoin="round" />
                );
              })}
              {written(f, cx, 2 * r + 70, 34)}
              {f.label && <text x={cx} y={2 * r + 140} textAnchor="middle" fontSize={16} fill="#6b6f76">{f.label}</text>}
            </g>
          );
        })}
      </svg>
    );
  }
  const left = 110;
  const barW = 560;
  const rowH = 110;
  const W = left + barW + 20;
  const H = Math.max(1, fr.length) * rowH + 10;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" style={cap(W, H)} role="img" aria-label={d.title}>
      {fr.map((f, i) => {
        const y = 14 + i * rowH;
        const part = barW / f.den;
        return (
          <g key={f.id} style={anim(f.id)}>
            {written(f, 50, y + 30, 30)}
            {Array.from({ length: f.den }, (_, k) => (
              <rect key={k} x={left + k * part} y={y} width={part} height={64} fill={k < f.num ? colours[i % colours.length] : "#fff"} stroke="#3d1a78" strokeWidth={2.5} />
            ))}
            {f.label && <text x={left} y={y + 88} fontSize={16} fill="#6b6f76">{f.label}</text>}
          </g>
        );
      })}
    </svg>
  );
}

