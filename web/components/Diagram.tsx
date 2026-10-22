"use client";

import dagre from "@dagrejs/dagre";
import { compile } from "mathjs";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Diagram, Role } from "@/lib/diagram";
import { separate } from "@/lib/diagram";

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
    case "tree":
      return <Tree d={d} still={still} />;
    case "web":
      return <MindMap d={d} still={still} />;
    case "parts":
      return <Parts d={d} still={still} />;
    case "math":
      return <Steps d={d} still={still} />;
    case "map":
      return <MapView d={d} still={still} />;
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

// Events alternate above and below the line, so neighbours can sit closer than a card is wide; past five events the
// line carries on in a second row (a single long row would shrink the writing until it can't be read).
function Timeline({ d, still }: { d: Diagram; still: boolean }) {
  const sid = useSid();
  const n = Math.max(1, d.events.length);
  const perRow = Math.ceil(n / Math.ceil(n / 5));
  const step = 100;
  const rowH = 300;
  const W = 40 + 160 + (perRow - 1) * step + 30;
  const H = Math.ceil(n / perRow) * rowH;
  const fresh = new Set(d.fresh);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" style={cap(W, H)} role="img" aria-label={d.title}>
      <Defs id={sid} />
      {Array.from({ length: Math.ceil(n / perRow) }, (_, r) => (
        <line key={r} x1={20} y1={r * rowH + rowH / 2} x2={W - 10} y2={r * rowH + rowH / 2} stroke={EDGE} strokeWidth={2} markerEnd={`url(#${sid}-a)`} />
      ))}
      {byDate(d.events).map((e, k) => {
        const i = k % perRow;
        const mid = Math.floor(k / perRow) * rowH + rowH / 2;
        const x = 20 + 80 + i * step;
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

// Events in date order when every date reads as a plain year ("1914", "1914–1918", "500 BC", "28 June 1914");
// otherwise (deep time, "10,000 BC") in the order the model sent them, which the prompt asks to be date order.
function byDate<T extends { when: string }>(events: T[]) {
  const year = (w: string) => {
    const m = w.match(/-?\d{3,4}/) ?? w.match(/-?\d+/); // the year, not the day in "28 June 1914"
    if (!m) return null;
    return /\b(BC|BCE)\b/i.test(w) ? -Math.abs(+m[0]) : +m[0];
  };
  if (events.some((e) => /ago|million|billion|thousand|\d{5,}|\d,\d{3}/i.test(e.when))) return events;
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
  const geometry = (d.segments?.length ?? 0) > 0;
  const onAxisY = !geometry && ax.y[0] <= 0 && ax.y[1] >= 0; // x numbers sit on the x axis
  const onAxisX = !geometry && ax.x[0] <= 0 && ax.x[1] >= 0; // y numbers sit beside the y axis
  const sy = (y: number) => H - pad - ((y - ax.y[0]) / spanY) * (H - 2 * pad);
  const fresh = new Set(d.fresh);
  // With equal units both axes share one grid step, so the cells are square.
  const shared = Math.max(1, Math.round(Math.max(spanX, spanY) / 10));
  const ticks = (lo: number, hi: number) => {
    const out: number[] = [];
    const s = equal ? shared : Math.max(1, Math.round((hi - lo) / 10));
    const first = Math.ceil(lo / s);
    for (let i = 0; i <= Math.floor(hi / s) - first && i <= 200; i++) out.push((first + i) * s);
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
      return { c, path: "", pts: [] as [number, number][] }; // unparseable expression: skip the curve, keep the rest of the diagram
    }
    let path = "";
    let pen = false;
    const pts: [number, number][] = []; // drawn points inside the grid, to keep the legend off the curves
    for (let i = 0; i <= 240; i++) {
      const x = ax.x[0] + ((ax.x[1] - ax.x[0]) * i) / 240;
      const y = f(x);
      const ok = Number.isFinite(y) && y >= ax.y[0] - 50 && y <= ax.y[1] + 50;
      if (ok) path += `${pen ? "L" : "M"}${sx(x).toFixed(1)} ${sy(y).toFixed(1)}`;
      if (ok && y >= ax.y[0] && y <= ax.y[1]) pts.push([sx(x), sy(y)]);
      pen = ok;
    }
    return { c, path, pts };
  });
  // The legend goes in whichever corner of the grid the curves pass through least.
  const legend = paths.filter(({ c }) => c.label);
  const lw = Math.max(0, ...legend.map(({ c }) => (c.label ?? "").length)) * 8.5 + 44;
  const lh = legend.length * 24 + 10;
  const corners: [number, number][] = [
    [pad + 8, pad + 8],
    [W - pad - 8 - lw, pad + 8],
    [pad + 8, H - pad - 8 - lh],
    [W - pad - 8 - lw, H - pad - 8 - lh],
  ];
  // …and off the numbers along the axes, which it would hide (counted as worse than any amount of curve).
  const over = (x: number, y: number, x0: number, y0: number, x1: number, y1: number) => x < x1 && x + lw > x0 && y < y1 && y + lh > y0;
  const onNumbers = (x: number, y: number) =>
    (onAxisX && over(x, y, sx(0) - 34, pad, sx(0) + 2, H - pad)) || (onAxisY && over(x, y, pad, sy(0) - 2, W - pad, sy(0) + 24));
  const crossing = ([x, y]: [number, number]) =>
    (onNumbers(x, y) ? 1e6 : 0) + paths.reduce((n, p) => n + p.pts.filter(([px, py]) => px >= x && px <= x + lw && py >= y && py <= y + lh).length, 0);
  const [lx, ly] = corners.reduce((best, c) => (crossing(c) < crossing(best) ? c : best), corners[0]);

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
      {/* Numbers along the axes, leaving out 0 where they cross. On the grid's edges instead when an axis is off screen,
          or for geometry, whose sides often lie on an axis with their own labels. */}
      {ticks(ax.x[0], ax.x[1])
        .filter((v) => v !== 0 || !onAxisY)
        .map((v) => (
          <text key={`nx${v}`} x={sx(v)} y={(onAxisY ? sy(0) : H - pad) + 16} textAnchor="middle" fontSize={12} fill="#6b6f76">
            {v}
          </text>
        ))}
      {ticks(ax.y[0], ax.y[1])
        .filter((v) => v !== 0 || !onAxisX)
        .map((v) => (
          <text key={`ny${v}`} x={(onAxisX ? sx(0) : pad) - 6} y={sy(v)} textAnchor="end" dominantBaseline="central" fontSize={12} fill="#6b6f76">
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
      {/* A legend: labels at the curves' ends collide where curves leave the grid together. */}
      {legend.length > 0 && (
        <g transform={`translate(${lx} ${ly})`}>
          <rect
            x={0}
            y={0}
            width={lw}
            height={lh}
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
                <line x1={10} x2={28} y1={17 + k * 24} y2={17 + k * 24} stroke={colour} strokeWidth={3} strokeLinecap="round" />
                <text x={36} y={17 + k * 24} dominantBaseline="central" fontSize={14} fontWeight={600} fill={colour}>
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

// A molecule of up to three heavy atoms with its hydrogens written out: "O" → "O([H])([H])", "C=O" → "C([H])([H])=O".
// Anything else (rings, aromatic or bracketed atoms, larger molecules) is returned as it is.
const VALENCE: Record<string, number> = { B: 3, C: 4, N: 3, O: 2, P: 3, S: 2, F: 1, Cl: 1, Br: 1, I: 1 };
function withHydrogens(smiles: string) {
  const tokens = smiles.match(/Cl|Br|[BCNOPSFI]|[-=#()]|./g) ?? [];
  if (tokens.some((t) => !(t in VALENCE) && !"-=#()".includes(t))) return smiles;
  const atoms = tokens.filter((t) => t in VALENCE);
  if (atoms.length > 3) return smiles;
  // Bond orders around each atom, following branches.
  const used = atoms.map(() => 0);
  const order = { "-": 1, "=": 2, "#": 3 } as Record<string, number>;
  const stack: number[] = [];
  let prev = -1;
  let bond = 1;
  let k = 0;
  for (const t of tokens) {
    if (t === "(") stack.push(prev);
    else if (t === ")") prev = stack.pop() ?? -1;
    else if (t in order) bond = order[t];
    else {
      if (prev >= 0) {
        used[prev] += bond;
        used[k] += bond;
      }
      prev = k++;
      bond = 1;
    }
  }
  k = 0;
  return tokens.map((t) => (t in VALENCE ? t + "([H])".repeat(Math.max(0, VALENCE[t] - used[k++])) : t)).join("");
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
        // A small molecule is about its hydrogens (water's bent H–O–H, methane's four C–H): they're drawn as atoms with
        // bonds, rather than "OH2" as one label.
        // With its hydrogens written out, every carbon is labelled too (methane's C at the centre of its four H).
        const smiles = withHydrogens(d.smiles!);
        const tree = SD.Parser.parse(smiles);
        ref.current.innerHTML = "";
        const showCarbons = smiles === d.smiles ? "default" : "all";
        new SD.SvgDrawer({ width: 480, height: 400, bondThickness: 1.6, fontSizeLarge: 14, fontSizeSmall: 9, padding: 24, showCarbons }).draw(tree, ref.current, "light");
        // The drawer fits the view tightly round the molecule, so water would fill the panel: keep the view at least
        // a few bond lengths across, so small molecules stay a natural size.
        const [x, y, w, h] = (ref.current.getAttribute("viewBox") ?? "").split(/\s+/).map(Number);
        const side = Math.max(w, h, 150);
        if ([x, y, w, h].every(Number.isFinite)) ref.current.setAttribute("viewBox", `${x + w / 2 - side / 2} ${y + h / 2 - side / 2} ${side} ${side}`);
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
  const words = d.words ?? [];
  const wordsW = Math.max(0, ...words.map((w) => w.parts.reduce((t, p) => t + Math.max(90, p.length * 30 + 44), 0) + (w.parts.length - 1) * 14 + 40));
  const W = Math.max(widths.reduce((a, b) => a + b, 0) + 40, wordsW, 1);
  const lettersH = letters.length ? 400 : 0;
  const H = lettersH + words.length * 170 || 1;
  let x = (W - widths.reduce((a, b) => a + b, 0)) / 2;
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
      {words.map((w, k) => (
        <SplitWord key={w.id} w={w} cx={W / 2} y={lettersH + k * 170 + 30} hot={fresh.has(w.id) && !still} />
      ))}
    </svg>
  );
}

// A word split into parts: one bubbly chip per part, with a clap dot under each syllable.
function SplitWord({ w, cx, y, hot }: { w: { parts: string[]; mode: string }; cx: number; y: number; hot: boolean }) {
  const ws = w.parts.map((p) => Math.max(90, p.length * 30 + 44));
  const gap = 14;
  let x = cx - (ws.reduce((a, b) => a + b, 0) + gap * (ws.length - 1)) / 2;
  return (
    <g>
      {w.parts.map((p, i) => {
        const c = BUBBLE[i % BUBBLE.length];
        const x0 = x;
        x += ws[i] + gap;
        return (
          <g key={i} style={hot ? { transformBox: "fill-box", transformOrigin: "center", animation: `ll-in 500ms var(--ease) ${i * 120}ms both` } : undefined}>
            <rect x={x0} y={y} width={ws[i]} height={84} rx={22} fill={c.light} stroke={c.mid} strokeWidth={3} />
            <text x={x0 + ws[i] / 2} y={y + 56} textAnchor="middle" fontSize={46} fontWeight={700} fill={c.ink} style={BUBBLE_FONT}>
              {p}
            </text>
            {w.mode === "syllables" && <circle cx={x0 + ws[i] / 2} cy={y + 112} r={9} fill={c.mid} />}
          </g>
        );
      })}
    </g>
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

// Sets as circles; each item is written in the region of the sets it belongs to, and items in none of them are listed
// underneath. The main sets overlap (two or three), or stand side by side when one is marked apart (they share
// nothing: rational and irrational numbers). A subset is a smaller circle inside its parent, toward the bottom.
const VENN_COLOURS = [
  { fill: "var(--grape-tint)", line: "#b98cff", ink: "#3d1a78" },
  { fill: "var(--oceanic-tint)", line: "#6fb3f2", ink: "#0c3b6e" },
  { fill: "var(--canary-tint)", line: "#ffd54f", ink: "#6b4e00" },
  { fill: "var(--park-tint)", line: "#7fd47a", ink: "#1f5c1c" },
];
const VENN_LAYOUT = {
  1: { W: 460, H: 440, r: 180, c: [[230, 250]], label: [[230, 40]] },
  2: { W: 680, H: 460, r: 180, c: [[240, 250], [440, 250]], label: [[170, 40], [510, 40]] },
  3: { W: 700, H: 640, r: 165, c: [[260, 225], [440, 225], [350, 380]], label: [[150, 36], [550, 36], [350, 620]] },
} as const;

// One line of at most n characters, shortened with "…" (a long single word too).
const clip = (s: string, n: number) => (s.length <= n ? s : s.slice(0, Math.max(1, n - 1)).trimEnd() + "…");

function Venn({ d, still }: { d: Diagram; still: boolean }) {
  const sets = (d.sets ?? []).slice(0, 4);
  const fresh = new Set(d.fresh);
  const parentOf = (id: string) => sets.find((x) => x.id === id)?.inside;
  const top = sets.filter((x) => !x.inside);
  const apart = separate(sets);
  // Where each set's circle and name go.
  const circles = new Map<string, { cx: number; cy: number; r: number; i: number; label: number[]; small: boolean }>();
  let W: number;
  let H: number;
  const avg = (pts: number[][]) => [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];
  const L = VENN_LAYOUT[Math.min(3, Math.max(1, top.length)) as 1 | 2 | 3];
  if (apart) {
    // In a row, or two rows of two for four sets (a row of four would shrink the writing too far).
    const perRow = top.length === 4 ? 2 : top.length;
    const r = perRow <= 2 ? 160 : 120;
    const gap = 40;
    const rowH = 2 * r + 80;
    W = perRow * 2 * r + (perRow - 1) * gap + 60;
    H = Math.ceil(top.length / perRow) * rowH + 30;
    top.forEach((x, k) => {
      const cx = 30 + r + (k % perRow) * (2 * r + gap);
      const cy = Math.floor(k / perRow) * rowH + r + 80;
      circles.set(x.id, { cx, cy, r, i: sets.indexOf(x), label: [cx, cy - r - 40], small: false });
    });
  } else {
    W = L.W;
    H = L.H;
    top.forEach((x, k) => circles.set(x.id, { cx: L.c[k][0], cy: L.c[k][1], r: L.r, i: sets.indexOf(x), label: [...L.label[k]], small: false }));
  }
  // Subsets, a level at a time. With the main sets apart (or only one), one subset fills the lower part of its parent
  // and several sit side by side across it. Where main sets overlap, a subset has to stay out of the overlap, or it
  // would look like it's in the other sets too: it goes at the first spot, turning out from the side of its parent
  // that faces away from them, that's clear of every other circle (and of the subsets already placed).
  const mid = avg(L.c.map((p) => [...p]));
  const overlaps = (p: { small: boolean }) => !apart && !p.small && top.length > 1;
  const turns = [0, 20, -20, 40, -40, 60, -60, 80, -80, 100, -100, 120, -120].map((a) => (a * Math.PI) / 180);
  const away = (p: { cx: number; cy: number }) => Math.atan2(p.cy - mid[1], p.cx - mid[0]);
  const clearance = (x: number, y: number, r: number, p: object) =>
    Math.min(...[...circles.values()].filter((o) => o !== p).map((o) => Math.hypot(x - o.cx, y - o.cy) - o.r - r));
  for (let placed = true; placed; ) {
    placed = false;
    for (const [id, p] of [...circles]) {
      const kids = sets.filter((x) => x.inside === id && !circles.has(x.id));
      if (!kids.length) continue;
      placed = true;
      if (overlaps(p)) {
        const r = p.r * (kids.length === 1 ? 0.4 : kids.length === 2 ? 0.32 : 0.26);
        for (const x of kids) {
          const reach = p.r - r - 8;
          const tries = [reach, reach * 0.7].flatMap((dist) => turns.map((t) => [Math.cos(away(p) + t) * dist, Math.sin(away(p) + t) * dist]));
          const [dx, dy] = tries.find(([dx, dy]) => clearance(p.cx + dx, p.cy + dy, r, p) >= 6) ?? tries[0];
          const [cx, cy] = [p.cx + dx, p.cy + dy];
          circles.set(x.id, { cx, cy, r, i: sets.indexOf(x), label: [cx, cy - r + 22], small: true });
        }
        continue;
      }
      // Two subsets that share an item (cats and dogs both have fur) overlap, a little larger, so it has room to go.
      const shared = kids.length === 2 && (d.items ?? []).some((it) => kids.every((x) => it.sets.includes(x.id)));
      const r = p.r * (kids.length === 1 ? 0.55 : shared ? 0.48 : kids.length === 2 ? 0.42 : 0.28);
      kids.forEach((x, k) => {
        const cx = p.cx + (k - (kids.length - 1) / 2) * (shared ? 1.15 * r : 2 * r + p.r * 0.06);
        const cy = p.cy + p.r * (kids.length === 1 ? 0.35 : kids.length === 2 ? 0.3 : 0.2);
        circles.set(x.id, { cx, cy, r, i: sets.indexOf(x), label: [cx, cy - r + 22], small: true });
      });
    }
  }
  // Where a set's own items go when it has subsets (items in it but in none of them): in its upper part; where main
  // sets overlap, the spot in it with the most room between the other circles and its subsets.
  const home = (p: { cx: number; cy: number; r: number; small: boolean }) => {
    if (!overlaps(p)) return [p.cx, p.cy - p.r * 0.6];
    const tries = [0.55, 0.4].flatMap((k) => turns.map((t) => [p.cx + Math.cos(away(p) + t) * p.r * k, p.cy + Math.sin(away(p) + t) * p.r * k]));
    // Scored across the width of a line of writing: its ends must stay inside the set and clear of the rest.
    const room = ([x, y]: number[]) =>
      Math.min(...[-50, 0, 50].map((dx) => Math.min(clearance(x + dx, y, 0, p), p.r - Math.hypot(x + dx - p.cx, y - p.cy))));
    return tries.reduce((best, pt) => (room(pt) > room(best) ? pt : best));
  };
  // Where an item goes: in the innermost of its sets (being in "fractions" means being in "rational" too). In one
  // main set of overlapping ones: away from the others; in several: their overlap. In a set that has subsets but
  // in none of them: above them.
  const ancestors = (id: string): string[] => {
    const up = parentOf(id);
    return up ? [up, ...ancestors(up)] : [];
  };
  const spot = (memberOf: string[]) => {
    const inner = memberOf.filter((id) => circles.has(id) && !memberOf.some((o) => ancestors(o).includes(id)));
    const cs = inner.map((id) => circles.get(id)!);
    let at = avg(cs.map((c) => [c.cx, c.cy]));
    if (!apart && inner.every((id) => !parentOf(id)) && inner.length < top.length) {
      const push = inner.length === 1 ? 0.55 : 0.35;
      at = [at[0] + (at[0] - mid[0]) * push, at[1] + (at[1] - mid[1]) * push];
    }
    if (cs.length === 1 && cs[0].small) {
      at = [at[0], at[1] + 12]; // below the subset's name
      // Only in this subset, which overlaps another: away from their overlap.
      for (const o of circles.values()) {
        const dist = Math.hypot(o.cx - cs[0].cx, o.cy - cs[0].cy);
        if (o !== cs[0] && o.small && dist < o.r + cs[0].r) at = [at[0] + ((cs[0].cx - o.cx) / dist) * cs[0].r * 0.4, at[1]];
      }
    }
    if (inner.length === 1 && sets.some((x) => x.inside === inner[0])) at = home(cs[0]);
    // Writing sized to a small circle: about as many characters as fit across it.
    // In the overlap of two subsets: as wide as the overlap is.
    const lens = cs.length === 2 && cs.every((c) => c.small);
    const width = lens ? cs[0].r + cs[1].r - Math.hypot(cs[0].cx - cs[1].cx, cs[0].cy - cs[1].cy) : 0;
    const r = cs.length === 1 && cs[0].small ? cs[0].r : 180;
    if (lens) return { key: [...inner].sort().join("|"), at, size: 14, chars: Math.max(4, Math.floor(width / 7.2)) };
    return { key: [...inner].sort().join("|"), at, size: r < 90 ? 16 : 21, chars: Math.max(6, Math.floor((r * 1.6) / (r < 90 ? 9 : 11.5))) };
  };
  const regions = new Map<string, { at: number[]; size: number; chars: number; items: { id: string; label: string }[] }>();
  const outside: { id: string; label: string }[] = [];
  for (const it of d.items ?? []) {
    const { key, at, size, chars } = spot(it.sets);
    if (!key) {
      outside.push(it);
      continue;
    }
    if (!regions.has(key)) regions.set(key, { at, size, chars, items: [] });
    regions.get(key)!.items.push(it);
  }
  if (outside.length) H += 60;
  const drawn = [...circles].sort(([, a], [, b]) => Number(a.small) - Number(b.small)); // subsets on top
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" style={cap(W, H)} role="img" aria-label={d.title}>
      {drawn.map(([id, c]) => {
        const x = sets[c.i];
        const colour = VENN_COLOURS[(x.colour ?? c.i) % VENN_COLOURS.length]; // lessons saved before colours were kept: by order
        const hot = fresh.has(id) && !still;
        return (
          <g key={id} style={hot ? { animation: "ll-fade 600ms var(--ease) both" } : undefined}>
            <circle cx={c.cx} cy={c.cy} r={c.r} fill={colour.fill} fillOpacity={0.8} stroke={colour.line} strokeWidth={3} style={{ mixBlendMode: "multiply" }} />
            <text x={c.label[0]} y={c.label[1]} textAnchor="middle" fontSize={c.small ? 18 : 24} fontWeight={700} fill={colour.ink}>
              {c.small ? clip(x.label, Math.floor((c.r * 1.6) / 10)) : x.label}
            </text>
          </g>
        );
      })}
      {[...regions.values()].map(({ at, size, chars, items }) =>
        items.slice(0, 5).map((it, k) => (
          <text
            key={it.id}
            x={at[0]}
            y={at[1] + (k - (Math.min(items.length, 5) - 1) / 2) * (size + 7)}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={size}
            fontWeight={600}
            fill="#111"
            style={fresh.has(it.id) && !still ? { animation: "ll-fade 500ms var(--ease) both" } : undefined}
          >
            {clip(it.label, chars) /* a region is narrow: one line, shortened with "…" */}
          </text>
        )),
      )}
      {outside.length > 0 && (
        <text x={W / 2} y={H - 22} textAnchor="middle" fontSize={17} fill="rgba(0,0,0,.6)">
          Neither: {outside.map((it) => it.label).join(", ")}
        </text>
      )}
    </svg>
  );
}

// A table: pastel header row across the top, row labels (when there are any) down the left, wrapped cell text.
function Table({ d, still }: { d: Diagram; still: boolean }) {
  const given = d.rows ?? [];
  const fresh = new Set(d.fresh);
  const labelled = given.some((r) => r.label);
  const at = (r: string, c: string) => (d.cells ?? []).find((x) => x.row === r && x.col === c)?.text ?? "";
  // Rows named down the left and an empty first column while the rest are filled in ("Planet" over Mercury, Venus…):
  // that column is the row names again, so its heading goes above them instead of an empty column. A table still to
  // be filled in (every cell empty) keeps its columns.
  const filled = (c: { id: string }) => given.some((r) => at(r.id, c.id));
  const all = d.columns ?? [];
  const corner = labelled && all.length > 1 && !filled(all[0]) && all.slice(1).some(filled) ? all[0] : null;
  // Wide and short (four kinds of energy across, pros and cons down) is turned on its side: in the tall panel a wide
  // table's writing shrinks until it can't be read. Only when the rows are named, so the names can head columns; and
  // decided by the table's shape alone, so it doesn't turn over as its cells are filled in.
  const flip = labelled && all.length >= 3 && all.length > given.length;
  const across = corner ? all.slice(1) : all;
  const rows = flip ? across.map((c) => ({ id: c.id, label: c.label })) : given;
  const cols = flip ? given.map((r) => ({ id: r.id, label: r.label ?? "" })) : across;
  const cell = (r: string, c: string) => (flip ? at(c, r) : at(r, c));
  const cellId = (r: string, c: string) => (flip ? `${c}:${r}` : `${r}:${c}`); // as applyOps marks it fresh
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
      {corner && !flip && (
        <g style={anim(corner.id)}>
          <Lines x={labelW / 2} y={headH / 2} lines={wrap(corner.label, Math.floor(labelW / 9.5), 2)} size={17} weight={700} fill="#3d1a78" lh={19} />
        </g>
      )}
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
            <g key={c.id} style={anim(cellId(r.id, c.id))}>
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
  if (!values.length) values.push(0);
  const auto = { min: Math.floor(lo), max: Math.ceil(hi), step: Math.max(1, Math.ceil((hi - lo) / 20)) };
  // The range stretches to take in every mark and jump ("now jump to 15" on a 0 to 10 line), never cutting one off.
  const line = d.line
    ? { min: Math.min(d.line.min, Math.floor(Math.min(...values, d.line.min))), max: Math.max(d.line.max, Math.ceil(Math.max(...values, d.line.max))), step: d.line.step }
    : auto;
  if ((line.max - line.min) / line.step > 40) line.step = Math.ceil((line.max - line.min) / 20);
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
  for (let i = 0; i <= Math.min(80, Math.round((line.max - line.min) / line.step)); i++) ticks.push(+(line.min + i * line.step).toFixed(6));
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
  for (let i = 0; i <= Math.min(50, Math.round(top / step)); i++) grid.push(+(i * step).toFixed(6));
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

const BRANCH_COLOURS = ["#b98cff", "#6fb3f2", "#ff7aa8", "#78d96f", "#ffd54f", "#ff9b5e"];
const pillW = (label: string, size: number) => Math.min(220, Math.max(70, label.length * size * 0.56 + 32));

// A tree, top to bottom: compact pills, labels on the links (probabilities, yes/no in a key), end results in yellow.
function Tree({ d, still }: { d: Diagram; still: boolean }) {
  const branches = useMemo(() => d.branches ?? [], [d.branches]);
  const fresh = new Set(d.fresh);
  const layout = useMemo(() => {
    const g = new dagre.graphlib.Graph();
    g.setGraph({ rankdir: "TB", nodesep: 18, ranksep: 70, marginx: 16, marginy: 16 });
    g.setDefaultEdgeLabel(() => ({}));
    branches.forEach((b) => g.setNode(b.id, { width: pillW(b.label, 16), height: 44 }));
    // A link's label gets its own room in the layout, so two labels under one parent ("no backbone", "have
    // backbone") are spaced apart instead of written over each other.
    branches.forEach((b) => b.parent && g.setEdge(b.parent, b.id, b.edge ? { width: b.edge.length * 8.6 + 16, height: 22, labelpos: "c" } : {}));
    dagre.layout(g);
    return g;
  }, [branches]);
  const { width = 1, height = 1 } = layout.graph();
  const leaf = (id: string) => !branches.some((b) => b.parent === id);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="100%" style={cap(width, height)} role="img" aria-label={d.title}>
      {branches.map((b) => {
        if (!b.parent) return null;
        const p = layout.node(b.parent);
        const n = layout.node(b.id);
        if (!p || !n) return null;
        const [x1, y1, x2, y2] = [p.x, p.y + 22, n.x, n.y - 22];
        // Through the spot the layout kept for the label, if it has one.
        const at = b.edge ? layout.edge(b.parent, b.id) : undefined;
        const [lx, ly] = at && Number.isFinite(at.x) ? [at.x, at.y] : [(x1 + x2) / 2, (y1 + y2) / 2];
        const curve = (ax: number, ay: number, bx: number, by: number) => `C${ax} ${(ay + by) / 2}, ${bx} ${(ay + by) / 2}, ${bx} ${by}`;
        return (
          <g key={`e${b.id}`} style={fresh.has(b.id) && !still ? { animation: "ll-fade 500ms var(--ease) both" } : undefined}>
            <path d={`M${x1} ${y1}${b.edge ? curve(x1, y1, lx, ly) + curve(lx, ly, x2, y2) : curve(x1, y1, x2, y2)}`} fill="none" stroke={EDGE} strokeWidth={2} />
            {b.edge && (
              <text x={lx} y={ly} textAnchor="middle" dominantBaseline="central" fontSize={15} fontWeight={700} fill="var(--grape-strong)" stroke="#fff" strokeWidth={5} paintOrder="stroke">
                {b.edge}
              </text>
            )}
          </g>
        );
      })}
      {branches.map((b) => {
        const n = layout.node(b.id);
        if (!n) return null;
        const hot = fresh.has(b.id) && !still;
        const w = pillW(b.label, 16);
        return (
          <g key={b.id} style={hot ? { transformBox: "fill-box", transformOrigin: "center", animation: "ll-in 600ms var(--ease) both" } : undefined}>
            <rect x={n.x - w / 2} y={n.y - 22} width={w} height={44} rx={22} fill={!b.parent ? "var(--grape-tint)" : leaf(b.id) ? "var(--canary-tint)" : "#f3f4f6"} stroke={hot ? "var(--grape)" : "none"} strokeWidth={2} />
            <Lines x={n.x} y={n.y} lines={wrap(b.label, Math.floor((w - 20) / 9))} size={16} weight={600} fill="#111" lh={18} />
          </g>
        );
      })}
    </svg>
  );
}

// A mind map: the main idea in the middle, its ideas in a ring around it (each in its own colour), and their
// details fanned out beyond them.
function MindMap({ d, still }: { d: Diagram; still: boolean }) {
  const branches = d.branches ?? [];
  const fresh = new Set(d.fresh);
  const root = branches.find((b) => !b.parent);
  const first = branches.filter((b) => b.parent && b.parent === root?.id);
  const kids = (id: string) => branches.filter((b) => b.parent === id);
  const R1 = 170;
  const R2 = 300;
  // An even number of ideas sits on the diagonals, so the map comes out square rather than a wide cross.
  const turn = first.length % 2 === 0 ? Math.PI / Math.max(1, first.length) : 0;
  const pos = new Map<string, { x: number; y: number; colour: string }>();
  if (root) pos.set(root.id, { x: 0, y: 0, colour: "var(--grape-strong)" });
  first.forEach((b, i) => {
    const a = -Math.PI / 2 + turn + (2 * Math.PI * i) / Math.max(1, first.length);
    const colour = BRANCH_COLOURS[i % BRANCH_COLOURS.length];
    pos.set(b.id, { x: R1 * Math.cos(a), y: R1 * Math.sin(a), colour });
    const ks = kids(b.id);
    const spread = Math.min(0.9, (2 * Math.PI) / Math.max(1, first.length) * 0.8);
    ks.forEach((k, j) => {
      const ak = a + (ks.length > 1 ? (j / (ks.length - 1) - 0.5) * spread : 0);
      pos.set(k.id, { x: R2 * Math.cos(ak), y: R2 * Math.sin(ak), colour });
    });
  });
  const placed = branches.filter((b) => pos.has(b.id));
  const xs = placed.map((b) => pos.get(b.id)!.x);
  const ys = placed.map((b) => pos.get(b.id)!.y);
  const minX = Math.min(0, ...xs) - 120;
  const maxX = Math.max(0, ...xs) + 120;
  const minY = Math.min(0, ...ys) - 40;
  const maxY = Math.max(0, ...ys) + 40;
  const [W, H] = [maxX - minX, maxY - minY];
  return (
    <svg viewBox={`${minX} ${minY} ${W} ${H}`} width="100%" height="100%" style={cap(W, H)} role="img" aria-label={d.title}>
      {placed.map((b) => {
        if (!b.parent || !pos.has(b.parent)) return null;
        const [p, n] = [pos.get(b.parent)!, pos.get(b.id)!];
        return <line key={`e${b.id}`} x1={p.x} y1={p.y} x2={n.x} y2={n.y} stroke={n.colour} strokeWidth={b.parent === root?.id ? 5 : 3} strokeLinecap="round" opacity={0.7} />;
      })}
      {placed.map((b) => {
        const n = pos.get(b.id)!;
        const isRoot = b.id === root?.id;
        const size = isRoot ? 28 : b.parent === root?.id ? 22 : 18;
        const w = pillW(b.label, size) + (isRoot ? 20 : 0);
        const h = isRoot ? 72 : b.parent === root?.id ? 54 : 46;
        const hot = fresh.has(b.id) && !still;
        return (
          <g key={b.id} style={hot ? { transformBox: "fill-box", transformOrigin: "center", animation: "ll-in 600ms var(--ease) both" } : undefined}>
            <rect x={n.x - w / 2} y={n.y - h / 2} width={w} height={h} rx={h / 2} fill={isRoot ? "var(--grape-strong)" : "#fff"} stroke={n.colour} strokeWidth={isRoot ? 0 : 3} />
            <Lines x={n.x} y={n.y} lines={wrap(b.label, Math.floor((w - 20) / (size * 0.56)))} size={size} weight={700} fill={isRoot ? "#fff" : "#111"} lh={size * 1.15} />
          </g>
        );
      })}
    </svg>
  );
}

// Labelled parts: the thing's outline with its name, inside parts as coloured blobs within it, and every part's
// label outside with a leader line, alternating left and right.
function Parts({ d, still }: { d: Diagram; still: boolean }) {
  const parts = d.parts ?? [];
  const fresh = new Set(d.fresh);
  const shape = d.subject?.shape ?? "cell";
  const anchor = new Map<string, [number, number]>();
  const [cx, cy] = [400, 260];
  const [rx, ry] = shape === "circle" || shape === "layers" ? [190, 190] : shape === "oval" ? [240, 160] : [230, 175];
  // What fills the inside (cytoplasm) is the outline's own colour, so it gets no blob: its label points at a gap.
  const inside = parts.filter((p) => p.inside && !p.fills);
  parts.filter((p) => p.inside && p.fills).forEach((p, i) => anchor.set(p.id, [cx - rx * 0.62 + i * 30, cy + ry * 0.5]));
  const edge = parts.filter((p) => !p.inside);
  // Inside parts spread on a smaller ring (the first one in the middle, like a nucleus); edge parts sit on the outline.
  inside.forEach((p, i) => {
    if (i === 0) return anchor.set(p.id, [cx, cy]);
    const a = (2 * Math.PI * (i - 1)) / Math.max(1, inside.length - 1) - Math.PI / 3;
    anchor.set(p.id, [cx + rx * 0.58 * Math.cos(a), cy + ry * 0.58 * Math.sin(a)]);
  });
  edge.forEach((p, i) => {
    // The outermost layer at the outline, each next one a little inside it (cell wall, then membrane).
    const a = (2 * Math.PI * i) / Math.max(1, edge.length) + Math.PI / 5;
    anchor.set(p.id, [cx + (rx - i * 12) * Math.cos(a), cy + (ry - i * 12) * Math.sin(a)]);
  });
  // Free: each part drawn where the model placed it in a 100 x 100 box over the drawing area, and labelled from its middle.
  const free = shape === "free";
  const box = (p: (typeof parts)[number]) => {
    const [x, y, w, h] = p.at ?? [40, 40, 20, 20];
    return [cx - rx + (x / 100) * 2 * rx, cy - ry + (y / 100) * 2 * ry, (w / 100) * 2 * rx, (h / 100) * 2 * ry];
  };
  if (free) {
    parts.forEach((p) => {
      const [x, y, w, h] = box(p);
      anchor.set(p.id, p.form === "line" ? [x + w * 0.6, y + h * 0.6] : [x + w / 2, y + h / 2]);
    });
  }
  // Layers: rings inside one another, outside first; each label points into its own band.
  const layers = shape === "layers";
  const ring = (i: number) => rx * (1 - i / Math.max(1, parts.length));
  if (layers) parts.forEach((p, i) => anchor.set(p.id, [cx + (ring(i) - (ring(i) - ring(i + 1)) / 2) * Math.cos(-Math.PI / 4 + i * 0.35), cy + (ring(i) - (ring(i) - ring(i + 1)) / 2) * Math.sin(-Math.PI / 4 + i * 0.35)]));
  // Labels in two columns, each on the side its part is on, spread evenly down the side.
  // Labels go on the side their part is on, sorted top to bottom by where they point, so leader lines don't cross.
  const byY = (a: (typeof parts)[number], b: (typeof parts)[number]) => anchor.get(a.id)![1] - anchor.get(b.id)![1];
  const left = layers ? [] : parts.filter((p) => anchor.get(p.id)![0] < cx || (anchor.get(p.id)![0] === cx && parts.indexOf(p) % 2 === 0)).sort(byY);
  const right = parts.filter((p) => !left.includes(p)).sort(byY);
  const labelY = (k: number, n: number) => cy - ry + 10 + ((2 * ry - 20) * (k + 0.5)) / Math.max(1, n);
  const W = 800;
  const H = 2 * cy;
  const colour = (i: number) => BUBBLE[i % BUBBLE.length];
  const hot = (id: string) => fresh.has(id) && !still;
  const label = (p: (typeof parts)[number], side: "l" | "r", k: number, n: number) => {
    const [ax, ay] = anchor.get(p.id)!;
    const ly = labelY(k, n);
    const lx = side === "l" ? 80 : W - 80;
    const i = parts.indexOf(p);
    return (
      <g key={p.id} style={hot(p.id) ? { animation: "ll-fade 600ms var(--ease) both" } : undefined}>
        <polyline points={`${ax},${ay} ${side === "l" ? lx + 84 : lx - 84},${ly} ${lx + (side === "l" ? 74 : -74)},${ly}`} fill="none" stroke="#3d1a78" strokeWidth={1.8} />
        <circle cx={ax} cy={ay} r={4} fill="#3d1a78" />
        <rect x={lx - 74} y={ly - 21} width={148} height={42} rx={21} fill={colour(i).light} stroke={colour(i).mid} strokeWidth={2} />
        <Lines x={lx} y={ly} lines={wrap(p.label, 14)} size={17} weight={700} fill={colour(i).ink} lh={18} />
      </g>
    );
  };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" style={cap(W, H)} role="img" aria-label={d.title}>
      {free ? (
        // Bars and lines first, so stems and roots run behind the petals and chambers they meet.
        [...parts].sort((a, b) => Number(a.form === "blob" || !a.form) - Number(b.form === "blob" || !b.form)).map((p) => {
          const [x, y, w, h] = box(p);
          const c = colour(parts.indexOf(p));
          const style = hot(p.id) ? { animation: "ll-fade 600ms var(--ease) both" } : undefined;
          if (p.form === "line") return <line key={`f${p.id}`} x1={x} y1={y} x2={x + w} y2={y + h} stroke={c.ink} strokeOpacity={0.7} strokeWidth={5} strokeLinecap="round" style={style} />;
          if (p.form === "bar") return <rect key={`f${p.id}`} x={x} y={y} width={Math.max(8, w)} height={Math.max(8, h)} rx={Math.min(w, h) / 2} fill={c.mid} fillOpacity={0.75} stroke={c.ink} strokeWidth={2} style={style} />;
          return <ellipse key={`f${p.id}`} cx={x + w / 2} cy={y + h / 2} rx={Math.max(6, w / 2)} ry={Math.max(6, h / 2)} fill={c.mid} fillOpacity={0.6} stroke={c.ink} strokeWidth={2} style={style} />;
        })
      ) : layers ? (
        parts.map((p, i) => (
          <circle key={`r${p.id}`} cx={cx} cy={cy} r={ring(i)} fill={colour(i).mid} fillOpacity={0.75} stroke="#fff" strokeWidth={3} style={hot(p.id) ? { animation: "ll-fade 600ms var(--ease) both" } : undefined} />
        ))
      ) : (
        <>
          <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="var(--park-tint)" stroke="#78d96f" strokeWidth={shape === "cell" ? 10 : 4} style={hot("subject") ? { animation: "ll-fade 600ms var(--ease) both" } : undefined} />
          {shape === "cell" && <ellipse cx={cx} cy={cy} rx={rx - 12} ry={ry - 12} fill="none" stroke="#a8e8a2" strokeWidth={3} />}
        </>
      )}
      {!layers && !free && inside.map((p) => {
        const [x, y] = anchor.get(p.id)!;
        const c = colour(parts.indexOf(p));
        const r = p === inside[0] ? 46 : 26;
        return (
          <g key={`b${p.id}`} style={hot(p.id) ? { transformBox: "fill-box", transformOrigin: "center", animation: "ll-in 600ms var(--ease) both" } : undefined}>
            <ellipse cx={x} cy={y} rx={r * 1.25} ry={r} fill={c.mid} fillOpacity={0.55} stroke={c.ink} strokeWidth={2} />
          </g>
        );
      })}
      {left.map((p, k) => label(p, "l", k, left.length))}
      {right.map((p, k) => label(p, "r", k, right.length))}
      {d.subject && (
        <text x={cx} y={cy + ry + 34} textAnchor="middle" fontSize={20} fontWeight={700} fill="#1d5a17">
          {d.subject.label}
        </text>
      )}
    </svg>
  );
}

// Worked steps, one per line, lined up on their "=" (or arrow) so the working reads down the page; notes on the right.
function Steps({ d, still }: { d: Diagram; still: boolean }) {
  const steps = d.steps ?? [];
  const fresh = new Set(d.fresh);
  const size = 34;
  const ch = size * 0.56; // average character width at this size
  const split = (t: string) => {
    const m = t.match(/\s*(=|→|⇒|<|>|≤|≥)\s*/);
    return m ? [t.slice(0, m.index), m[1], t.slice(m.index! + m[0].length)] : [t, "", ""];
  };
  const rows = steps.map((s) => ({ s, parts: split(s.text) }));
  const leftW = Math.max(60, ...rows.map((r) => r.parts[0].length * ch));
  const rightW = Math.max(60, ...rows.map((r) => r.parts[2].length * ch));
  const noteW = Math.max(0, ...steps.map((s) => (s.note ? s.note.length * 9 + 40 : 0)));
  const mid = 30 + leftW + 30;
  const W = mid + 30 + rightW + 30 + noteW;
  const rowH = 70;
  const H = Math.max(1, steps.length) * rowH + 20;
  const last = steps[steps.length - 1]?.id;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" style={cap(W, H)} role="img" aria-label={d.title}>
      {rows.map(({ s, parts: [l, op, r] }, i) => {
        const y = 10 + i * rowH + rowH / 2;
        const hot = fresh.has(s.id) && !still;
        const gap = op === "=" ? 18 : 30; // an arrow is wider than "="
        return (
          <g key={s.id} style={hot ? { animation: "ll-fade 600ms var(--ease) both" } : undefined}>
            {s.id === last && steps.length > 1 && <rect x={10} y={y - rowH / 2 + 6} width={mid + 30 + rightW + 10} height={rowH - 12} rx={14} fill="var(--grape-tint)" />}
            <text x={op ? mid - gap : 30} y={y} textAnchor={op ? "end" : "start"} dominantBaseline="central" fontSize={size} fontWeight={600} fill="#111">
              {l}
            </text>
            {op && (
              <>
                <text x={mid} y={y} textAnchor="middle" dominantBaseline="central" fontSize={size} fontWeight={600} fill="var(--grape-strong)">
                  {op}
                </text>
                <text x={mid + gap} y={y} dominantBaseline="central" fontSize={size} fontWeight={600} fill="#111">
                  {r}
                </text>
              </>
            )}
            {s.note && (
              <text x={mid + 30 + rightW + 40} y={y} dominantBaseline="central" fontSize={17} fill="#6b6f76">
                {s.note}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// Coastlines (Natural Earth land, public domain) as rings of [lon, lat], fetched once each, only when a map needs them:
// 1:110m (65 KB) for the world or a continent, 1:50m (0.9 MB) for a region, and for a close-up (a city, an island) the
// 1:10m coastline cut into 30-degree tiles (land-10m/<lonTile>_<latTile>.json, up to 0.4 MB each), of which only the
// tiles under the view are fetched. A tile that's all sea has no file.
const LAND_REGION_SPAN = 25;
const LAND_CLOSE_SPAN = 8;
const TILE = 30;
const lands = new Map<string, Promise<[number, number][][]>>();
const loadLand = (file: string) => {
  if (!lands.has(file)) {
    lands.set(
      file,
      fetch(`/maps/${file}`)
        .then((r) => (r.ok ? r.json() : r.status === 404 && file.startsWith("land-10m/") ? [] : Promise.reject(new Error(`${file} ${r.status}`))))
        .catch((e) => {
          lands.delete(file); // try again next time a map is drawn
          throw e;
        }),
    );
  }
  return lands.get(file)!;
};

// A round distance for the scale bar: 1, 2, 5, 10, 20, 50… km.
const niceKm = (km: number) => {
  const pow = 10 ** Math.floor(Math.log10(km));
  return [1, 2, 5, 10].map((m) => m * pow).filter((x) => x <= km).pop() ?? pow;
};

// A map: the land around the places mentioned, pins with labels, and routes as dashed arrows between them.
function MapView({ d, still }: { d: Diagram; still: boolean }) {
  const sid = useSid();
  const [rings, setRings] = useState<[number, number][][]>([]);
  const places = d.places ?? [];
  const fresh = new Set(d.fresh);
  // The view: the one the teacher asked for (zoom), else around the places with a margin, never narrower than a city
  // (about 0.4 by 0.3 degrees); the whole world if there are no places.
  // Places on both sides of the 180° line (Siberia to Alaska), or a zoomed view over it, are seen across the Pacific,
  // not round the world.
  const across =
    (places.length > 1 && Math.max(...places.map((p) => p.lon)) - Math.min(...places.map((p) => p.lon)) > 180) ||
    (!!d.view && Math.abs(d.view.lon) + d.view.span / 2 > 180);
  const lonOf = (lon: number) => (across && lon < 0 ? lon + 360 : lon);
  const lons = places.map((p) => lonOf(p.lon));
  const lats = places.map((p) => p.lat);
  let [lon0, lon1] = places.length ? [Math.min(...lons), Math.max(...lons)] : [-170, 190];
  let [lat0, lat1] = places.length ? [Math.min(...lats), Math.max(...lats)] : [-58, 82];
  const view = d.view;
  const grow = (a: number, b: number, min: number, margin: number): [number, number] => {
    const span = Math.max(min, (b - a) * (1 + 2 * margin));
    const mid = (a + b) / 2;
    return [mid - span / 2, mid + span / 2];
  };
  if (view) {
    const vlon = lonOf(view.lon);
    [lon0, lon1] = [vlon - view.span / 2, vlon + view.span / 2];
    [lat0, lat1] = [view.lat - view.span * 0.3, view.lat + view.span * 0.3];
  } else if (places.length) {
    [lon0, lon1] = grow(lon0, lon1, 0.4, 0.35);
    [lat0, lat1] = grow(lat0, lat1, 0.3, 0.35);
  }
  const k = Math.cos((((lat0 + lat1) / 2) * Math.PI) / 180); // a degree of longitude shrinks away from the equator
  const W = 720;
  let s = W / ((lon1 - lon0) * k);
  let H = (lat1 - lat0) * s;
  // Keep the shape between landscape and portrait: show more latitude when it's too flat, more longitude when
  // it's too tall (a river running north), never cutting off a place.
  if (H < 380) {
    [lat0, lat1] = grow(lat0, lat1, 380 / s, 0);
    H = 380;
  } else if (H > 640) {
    H = 640;
    s = H / (lat1 - lat0);
    [lon0, lon1] = grow(lon0, lon1, W / (s * k), 0);
  }
  // Which coastline files this (final) view needs, by its larger side (a river running north is narrow but long). A
  // close-up across the 180° line, or of Antarctica (not in the tiles), uses 1:50m.
  const extent = Math.max(lon1 - lon0, lat1 - lat0);
  const close = extent < LAND_CLOSE_SPAN && !across && lat0 > -60;
  const files: string[] = [];
  if (close) {
    const tileOf = (v: number) => Math.floor(v / TILE);
    for (let tx = tileOf(lon0); tx <= tileOf(lon1); tx++) {
      for (let ty = tileOf(lat0); ty <= tileOf(lat1); ty++) files.push(`land-10m/${tx}_${ty}.json`);
    }
  } else files.push(extent < LAND_REGION_SPAN ? "land-50m.json" : "land.json");
  const filesKey = files.join(",");
  useEffect(() => {
    let live = true;
    Promise.all(filesKey.split(",").map(loadLand))
      .then((all) => live && setRings(all.flat()))
      .catch((e) => console.error("map outline failed", e));
    return () => {
      live = false;
    };
  }, [filesKey]);
  const px = (lon: number) => (lon - lon0) * k * s;
  const py = (lat: number) => (lat1 - lat) * s;
  // A scale bar on regional and city maps: a degree of longitude is 111.32 km at the equator, k times that here.
  const kmPerPx = 111.32 / s;
  const barKm = niceKm(kmPerPx * 140);
  const barPx = barKm / kmPerPx;
  // Coastlines that cross the 180° line are stored continuous (running a little past ±180), so the land is drawn once
  // for each 360° shift that reaches the view: both shores of the Pacific show, with no gap at the line.
  let minLon = Infinity;
  let maxLon = -Infinity;
  for (const r of rings) for (const [lon] of r) [minLon, maxLon] = [Math.min(minLon, lon), Math.max(maxLon, lon)];
  const shifts = [-360, 0, 360].filter((sh) => minLon + sh < lon1 && maxLon + sh > lon0);
  const landPath = shifts
    .flatMap((shift) =>
      rings.map((r) => r.map(([lon, lat], i) => `${i && Math.abs(lon - r[i - 1][0]) <= 180 ? "L" : "M"}${px(lon + shift).toFixed(1)} ${py(lat).toFixed(1)}`).join("")),
    )
    .join("");
  // A place by id, its longitude already moved across the Pacific when the view wraps.
  const at = (id: string) => {
    const p = places.find((x) => x.id === id);
    return p && { ...p, lon: lonOf(p.lon) };
  };
  // Each place's label goes above its pin, else below, right or left: the first spot inside the frame and clear of the
  // pins and the labels already placed. A place outside a zoomed view gets no pin or label.
  type Box = [number, number, number, number];
  const shown = places.map((p) => {
    const [x, y] = [px(lonOf(p.lon)), py(p.lat)];
    return x >= 0 && x <= W && y >= 0 && y <= H;
  });
  const taken: Box[] = places.filter((_, i) => shown[i]).map((p) => [px(lonOf(p.lon)) - 11, py(p.lat) - 11, 22, 22]); // the pins
  const hits = ([ax, ay, aw, ah]: Box) => taken.some(([bx, by, bw, bh]) => ax < bx + bw && bx < ax + aw && ay < by + bh && by < ay + ah);
  const inFrame = ([x, y, w, h]: Box) => x >= 4 && y >= 4 && x + w <= W - 4 && y + h <= H - 4;
  const labelBox = places.map((p, i) => {
    if (!shown[i]) return null;
    const [x, y] = [px(lonOf(p.lon)), py(p.lat)];
    const w = p.label.length * 9 + 24;
    const spots: Box[] = [[x - w / 2, y - 46, w, 30], [x - w / 2, y + 16, w, 30], [x + 16, y - 15, w, 30], [x - 16 - w, y - 15, w, 30]];
    const box = spots.find((b) => inFrame(b) && !hits(b)) ?? spots.find(inFrame) ?? spots[0];
    taken.push(box);
    return box;
  });
  // Routes: legs that join end to start (Lake Victoria to Juba, Juba to Khartoum…) are one journey, drawn as one
  // smooth dashed line with a single arrowhead, stopping short of the pins; a lone leg is a gentle curve bowed to the
  // left of travel. Each name on a journey ("White Nile") is written once, on its longest stretch, at a point that's
  // in view and clear of the place labels; with no such point it's left off rather than drawn over them.
  const journeys: NonNullable<Diagram["routes"]>[] = [];
  for (const r of d.routes ?? []) {
    if (!at(r.from) || !at(r.to)) continue;
    const after = journeys.find((j) => j[j.length - 1].to === r.from);
    const before = journeys.find((j) => j[0].from === r.to);
    if (after && before && after !== before) {
      // The leg bridges two journeys: they become one.
      after.push(r, ...before);
      journeys.splice(journeys.indexOf(before), 1);
    } else if (after) after.push(r);
    else if (before) before.unshift(r);
    else journeys.push([r]);
  }
  const written = new Set<string>(); // a name is written once on the map, even if two journeys share it
  const routes = journeys.map((legs) => {
    const pts = [legs[0].from, ...legs.map((r) => r.to)].map((id) => {
      const p = at(id)!;
      return [px(p.lon), py(p.lat)];
    });
    const n = pts.length - 1;
    // Stop short of the first and last pins (less on a very short leg).
    const trim = (from: number[], to: number[], by: number) => {
      const len = Math.hypot(to[0] - from[0], to[1] - from[1]) || 1;
      const k = Math.min(by, len / 3) / len;
      return [from[0] + (to[0] - from[0]) * k, from[1] + (to[1] - from[1]) * k];
    };
    pts[0] = trim(pts[0], pts[1], 14);
    pts[n] = trim(pts[n], pts[n - 1], 16);
    // Each leg as a cubic curve [start, control, control, end].
    const segs = pts.slice(0, -1).map((p0, i) => {
      const p1 = pts[i + 1];
      if (n === 1) {
        const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
        const [ux, uy] = [(p1[0] - p0[0]) / (len || 1), (p1[1] - p0[1]) / (len || 1)];
        const q = [(p0[0] + p1[0]) / 2 + uy * len * 0.18, (p0[1] + p1[1]) / 2 - ux * len * 0.18];
        return [p0, [p0[0] + ((q[0] - p0[0]) * 2) / 3, p0[1] + ((q[1] - p0[1]) * 2) / 3], [p1[0] + ((q[0] - p1[0]) * 2) / 3, p1[1] + ((q[1] - p1[1]) * 2) / 3], p1];
      }
      // Through the points (Catmull-Rom), so the line bends smoothly at each stop. Each handle is kept within a third of
      // its own leg, or a short leg beside a long one would loop.
      const [pa, pb] = [pts[Math.max(0, i - 1)], pts[Math.min(n, i + 2)]];
      const reach = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) / 3;
      const handle = (from: number[], dx: number, dy: number) => {
        const k = Math.min(1, reach / (Math.hypot(dx, dy) || 1));
        return [from[0] + dx * k, from[1] + dy * k];
      };
      return [p0, handle(p0, (p1[0] - pa[0]) / 6, (p1[1] - pa[1]) / 6), handle(p1, -(pb[0] - p0[0]) / 6, -(pb[1] - p0[1]) / 6), p1];
    });
    const path = `M${segs[0][0].join(" ")}` + segs.map(([, c1, c2, e]) => `C${c1.join(" ")} ${c2.join(" ")} ${e.join(" ")}`).join("");
    const pointAt = ([s0, c1, c2, e]: number[][], t: number) =>
      [0, 1].map((k) => (1 - t) ** 3 * s0[k] + 3 * (1 - t) ** 2 * t * c1[k] + 3 * (1 - t) * t ** 2 * c2[k] + t ** 3 * e[k]);
    // When the last leg is too short for its arrowhead to show beside the pins, the direction goes on the longest leg,
    // past its middle where a name may be written; the name then keeps clear of it.
    const lens = segs.map((seg) => Math.hypot(seg[3][0] - seg[0][0], seg[3][1] - seg[0][1]));
    const longest = segs[lens.indexOf(Math.max(...lens))];
    const arrow = lens[n - 1] < 48 && n > 1 ? `M${pointAt(longest, 0.75).join(" ")}L${pointAt(longest, 0.8).join(" ")}` : null;
    if (arrow) {
      const [ax, ay] = pointAt(longest, 0.8);
      taken.push([ax - 12, ay - 12, 24, 24]);
    }
    const labels: { text: string; x: number; y: number }[] = [];
    // A name that's also a place's ("Bering Strait" on the route and on a pin) is already on the map.
    const placeNames = new Set(places.map((p) => p.label.trim().toLowerCase()));
    for (const text of new Set(legs.map((r) => r.label).filter((x): x is string => !!x && !written.has(x) && !placeNames.has(x.trim().toLowerCase())))) {
      const w = text.length * 9.5 + 10;
      const longestFirst = segs
        .map((seg, i) => ({ seg, i, len: Math.hypot(seg[3][0] - seg[0][0], seg[3][1] - seg[0][1]) }))
        .filter(({ i }) => legs[i].label === text)
        .sort((x, y) => y.len - x.len);
      const spot = longestFirst
        .flatMap(({ seg }) => [0.5, 0.35, 0.65, 0.2, 0.8].map((t): Box => {
          const [x, y] = pointAt(seg, t);
          return [x - w / 2, y - 26, w, 22];
        }))
        .find((bx) => inFrame(bx) && !hits([bx[0] - 4, bx[1] - 4, bx[2] + 8, bx[3] + 8])); // with a little room around it
      if (spot) {
        taken.push(spot);
        written.add(text);
        labels.push({ text, x: spot[0] + w / 2, y: spot[1] + 16 });
      }
    }
    return { legs, path, labels, arrow };
  });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" style={cap(W, H)} role="img" aria-label={d.title}>
      <Defs id={sid} />
      <clipPath id={`${sid}-view`}>
        <rect x={0} y={0} width={W} height={H} rx={16} />
      </clipPath>
      <g clipPath={`url(#${sid}-view)`}>
        <rect x={0} y={0} width={W} height={H} fill="var(--oceanic-tint)" />
        {/* Tiles are cut along straight lines, so a close-up's land is drawn as fill only: an outline would show the cuts. */}
        <path d={landPath} fill="#eef9e8" stroke={close ? "none" : "#a9d9a0"} strokeWidth={1.5} strokeLinejoin="round" fillRule="evenodd" />
        {lon1 - lon0 < 60 && (
          <g transform={`translate(18 ${H - 26})`}>
            <rect x={-8} y={-22} width={barPx + 16} height={34} rx={8} fill="#fff" fillOpacity={0.85} />
            <line x1={0} x2={barPx} y1={0} y2={0} stroke="#3f3f46" strokeWidth={3} strokeLinecap="round" />
            <line x1={0} x2={0} y1={-5} y2={5} stroke="#3f3f46" strokeWidth={2} />
            <line x1={barPx} x2={barPx} y1={-5} y2={5} stroke="#3f3f46" strokeWidth={2} />
            <text x={barPx / 2} y={-8} textAnchor="middle" fontSize={13} fontWeight={600} fill="#3f3f46">
              {barKm >= 1 ? `${barKm} km` : `${barKm * 1000} m`}
            </text>
          </g>
        )}
      </g>
      {/* Pins and routes stay inside the map's frame: a place outside a zoomed view isn't drawn over the panel. */}
      <g clipPath={`url(#${sid}-view)`}>
      {routes.map(({ legs, path, labels, arrow }) => {
        // A new journey fades in; one that grows a leg doesn't flash again. Keyed by a leg that stays in it.
        const hot = legs.every((r) => fresh.has(r.id)) && !still;
        return (
          <g key={legs.map((r) => r.id).sort()[0]} style={hot ? { animation: "ll-fade 600ms var(--ease) both" } : undefined}>
            <path d={path} fill="none" stroke="var(--grape-strong)" strokeWidth={3} strokeDasharray="8 7" strokeLinecap="round" strokeLinejoin="round" markerEnd={arrow ? undefined : `url(#${sid}-af)`} />
            {arrow && <path d={arrow} fill="none" stroke="transparent" strokeWidth={3} markerEnd={`url(#${sid}-af)`} />}
            {labels.map((l) => (
              <text key={l.text} x={l.x} y={l.y} textAnchor="middle" fontSize={16} fontWeight={700} fill="var(--grape-strong)" stroke="#fff" strokeWidth={5} paintOrder="stroke">
                {l.text}
              </text>
            ))}
          </g>
        );
      })}
      {places.map((p, i) => {
        const [x, y] = [px(lonOf(p.lon)), py(p.lat)];
        const hot = fresh.has(p.id) && !still;
        const box = labelBox[i];
        if (!box) return null;
        const [bx, by, w] = box;
        return (
          <g key={p.id} style={hot ? { transformBox: "fill-box", transformOrigin: "center", animation: "ll-in 600ms var(--ease) both" } : undefined}>
            <circle cx={x} cy={y} r={9} fill={BUBBLE[i % BUBBLE.length].mid} stroke="#fff" strokeWidth={3} />
            <rect x={bx} y={by} width={w} height={30} rx={15} fill="#fff" stroke={BUBBLE[i % BUBBLE.length].mid} strokeWidth={2} />
            <text x={bx + w / 2} y={by + 15} textAnchor="middle" dominantBaseline="central" fontSize={15} fontWeight={700} fill="#111">
              {p.label}
            </text>
          </g>
        );
      })}
      </g>
    </svg>
  );
}

