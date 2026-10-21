"use client";

import { useEffect, useRef } from "react";
import { Icon } from "@/components/Bits";
import { DiagramView } from "@/components/Diagram";
import { KIND_LABEL, type Diagram } from "@/lib/diagram";
import { downloadPng, downloadSvg, slug } from "@/lib/files";
import { formatClock } from "@/lib/transcript";

// Full-size view of one diagram, stepping through all of a lesson's diagrams (buttons or ← →).
export function DiagramViewer({
  diagrams, index, onIndex, onClose,
}: { diagrams: Diagram[]; index: number | null; onIndex: (i: number) => void; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const d = index === null ? null : diagrams[index];

  useEffect(() => {
    if (d) {
      if (!dialog.current?.open) dialog.current?.showModal();
    } else dialog.current?.close();
  }, [d]);

  const go = (step: number) => index !== null && onIndex((index + step + diagrams.length) % diagrams.length);
  const svg = () => body.current?.querySelector("svg") ?? null;
  const name = d ? slug(d.title) : "diagram";

  return (
    <dialog
      ref={dialog}
      className="dialog viewer"
      onClose={onClose}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") go(1);
        if (e.key === "ArrowLeft") go(-1);
      }}
    >
      {d && (
        <>
          <div className="dialog-head">
            <h2 className="h2">{d.title}</h2>
            <span className="chip tnum" style={{ background: "var(--grape-tint)", color: "#520085", marginRight: 8 }}>
              {KIND_LABEL[d.kind]} · {formatClock(d.t)}
            </span>
            <button className="btn btn-ghost btn-icon" aria-label="Close" onClick={onClose}>
              <Icon name="x" />
            </button>
          </div>
          <div ref={body} className="viewer-body">
            <DiagramView key={d.id} d={d} still />
          </div>
          <div className="viewer-foot">
            {diagrams.length > 1 && (
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <button className="btn btn-ghost btn-icon" aria-label="Previous diagram" onClick={() => go(-1)}>
                  <Icon name="left" />
                </button>
                <span className="t14 tnum">
                  {index! + 1} / {diagrams.length}
                </span>
                <button className="btn btn-ghost btn-icon" aria-label="Next diagram" onClick={() => go(1)}>
                  <Icon name="right" />
                </button>
              </div>
            )}
            <span className="spacer" />
            <button className="btn btn-soft" onClick={() => svg() && downloadSvg(svg()!, name)}>
              <Icon name="download" />
              SVG
            </button>
            <button className="btn btn-soft" onClick={() => svg() && void downloadPng(svg()!, name)}>
              <Icon name="download" />
              PNG
            </button>
          </div>
        </>
      )}
    </dialog>
  );
}
