"use client";

import { useEffect, useRef } from "react";
import { Icon } from "@/components/Bits";
import { TARGET_LOOK, type Target } from "@/components/SendPage";

// The demo isn't connected to Padlet's private API, so it says so instead of pretending.
export const demoNote = (t: Target) =>
  `In Padlet this would create the ${TARGET_LOOK[t].thing} through Padlet's API and open it. This demo isn't connected, so nothing was created.`;

const CONFETTI = ["#9466e8", "#ffd54f", "#ff4081", "#3992de", "#53e047", "#ff833e"];

// Celebration after Create: a check pops in with a ring burst and confetti, then the demo note.
export function Created({ target, onGo, onDone }: { target: Target | null; onGo: () => void; onDone: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (target) {
      if (!dialog.current?.open) dialog.current?.showModal();
    } else dialog.current?.close();
  }, [target]);
  const look = target && TARGET_LOOK[target];

  return (
    <dialog ref={dialog} className="dialog created" onClose={onDone} onClick={(e) => e.target === e.currentTarget && onDone()}>
      {look && target && (
        <div className="created-body">
          <div className="burst" aria-hidden="true">
            {CONFETTI.flatMap((c, i) => [0, 1].map((k) => (
              <span key={`${i}${k}`} className="confetti" style={{ background: c, ["--a" as string]: `${(i * 2 + k) * 30}deg`, animationDelay: `${k * 60}ms` }} />
            )))}
            <span className="ring" />
            <span className="check">
              <Icon name="check" size={34} />
            </span>
          </div>
          <h2 className="h1">{look.thing[0].toUpperCase() + look.thing.slice(1)} created</h2>
          <p className="muted created-note">{demoNote(target)}</p>
          <div className="created-actions">
            <button className="btn btn-soft" onClick={onDone}>
              Done
            </button>
            <button className="btn btn-dark" onClick={onGo}>
              Go to {look.name}
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}

// A small notification at the bottom of the screen; disappears on its own.
export function Toast({ text, onHide }: { text: string | null; onHide: () => void }) {
  useEffect(() => {
    if (!text) return;
    const id = setTimeout(onHide, 6000);
    return () => clearTimeout(id);
  }, [text, onHide]);
  if (!text) return null;
  return (
    <div className="toast" role="status">
      <span className="toast-tag">Demo</span>
      {text}
      <button className="btn btn-ghost btn-icon" aria-label="Dismiss" onClick={onHide}>
        <Icon name="x" size={16} />
      </button>
    </div>
  );
}
