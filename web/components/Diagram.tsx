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
      <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize={17} fontWeight={600} fill="#111">
        {label}
      </text>
    </g>
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
      {d.events.map((e, i) => {
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
            <text x={x} y={cardY + 58} textAnchor="middle" fontSize={15} fill="rgba(0,0,0,.6)">{e.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

function Graph({ d, still }: { d: Diagram; still: boolean }) {
  const W = 520;
  const H = 400;
  const pad = 28;
  const ax = d.axes ?? { x: [-5, 5] as [number, number], y: [-5, 5] as [number, number] };
  const sx = (x: number) => pad + ((x - ax.x[0]) / (ax.x[1] - ax.x[0])) * (W - 2 * pad);
  const sy = (y: number) => H - pad - ((y - ax.y[0]) / (ax.y[1] - ax.y[0])) * (H - 2 * pad);
  const fresh = new Set(d.fresh);
  const ticks = (lo: number, hi: number) => {
    const out: number[] = [];
    const s = Math.max(1, Math.round((hi - lo) / 10));
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
          return Number(code.evaluate({ x }));
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
      {ax.x[0] <= 0 && ax.x[1] >= 0 && <line x1={sx(0)} x2={sx(0)} y1={pad} y2={H - pad} stroke="#94969b" strokeWidth={1.5} />}
      {ax.y[0] <= 0 && ax.y[1] >= 0 && <line y1={sy(0)} y2={sy(0)} x1={pad} x2={W - pad} stroke="#94969b" strokeWidth={1.5} />}
      <g clipPath={`url(#clip-${d.id})`}>
        {paths.map(({ c, path }) => (
          <path
            key={c.id}
            d={path}
            fill="none"
            stroke="#111"
            strokeWidth={3}
            strokeLinecap="round"
            pathLength={1}
            style={fresh.has(c.id) && !still ? { strokeDasharray: 1, animation: "ll-draw 900ms var(--ease) both" } : undefined}
          />
        ))}
      </g>
      {(d.segments ?? []).map((g) => {
        const hot = fresh.has(g.id) && !still;
        const [x1, y1, x2, y2] = [sx(g.from[0]), sy(g.from[1]), sx(g.to[0]), sy(g.to[1])];
        return (
          <g key={g.id} style={hot ? { animation: "ll-fade 500ms var(--ease) both" } : undefined}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={hot ? "var(--grape)" : "#111"} strokeWidth={3} strokeLinecap="round" />
            {g.label && (
              <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 10} textAnchor="middle" fontSize={15} fontWeight={600} fill="#111" stroke="#fff" strokeWidth={5} paintOrder="stroke">
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
              <text x={sx(p.x)} y={sy(p.y) + 26} textAnchor="middle" fontSize={14} fontWeight={600} fill="#111" stroke="#fff" strokeWidth={5} paintOrder="stroke">
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

  return (
    <svg
      ref={ref}
      visibility={failed ? "hidden" : undefined}
      viewBox="0 0 480 400"
      width="100%"
      height="100%"
      role="img"
      aria-label={d.title}
      style={!still && d.fresh.includes("smiles") ? { animation: "ll-fade 600ms var(--ease) both" } : undefined}
    />
  );
}
