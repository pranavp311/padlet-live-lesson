import { useId } from "react";

// Bubbles, the mascot teachers can ask for a diagram ("Bubbles, draw the water cycle").
// A soap bubble whose film uses Padlet's palette. Idle it breathes and blinks; listening (it heard
// its name) it perks up and waits; drawing, a pencil scribbles beside it and sparkles pop round its head.
export type BubblesMood = "idle" | "listening" | "drawing";

const INK = "#2e1c5f";

export function Bubbles({
  size = 72,
  mood,
  drawing = false,
}: {
  size?: number;
  mood?: BubblesMood;
  /** @deprecated use mood="drawing" */
  drawing?: boolean;
}) {
  const m: BubblesMood = mood ?? (drawing ? "drawing" : "idle");
  // Several Bubbles can be on screen at once, so gradient ids must be unique per instance.
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const fill = `bb-fill-${id}`;
  const film = `bb-film-${id}`;
  // At pill size (28px) extra detail turns to noise: keep the face and the pencil, drop the rest.
  const small = size < 40;
  const listening = m === "listening";
  const eyeY = listening ? 56 : 58;

  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label="Bubbles" className={`bubbles bubbles-${m}`}>
      <defs>
        <radialGradient id={fill} cx="50%" cy="50%" r="55%">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.3" stopColor="#f5f0ff" />
          <stop offset="1" stopColor="#e0d4ff" />
        </radialGradient>
        <linearGradient id={film} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3992de" />
          <stop offset="0.4" stopColor="#9466e8" />
          <stop offset="0.72" stopColor="#ff4081" />
          <stop offset="1" stopColor="#ffd54f" />
        </linearGradient>
      </defs>

      {m === "drawing" && !small && (
        <g className="bubbles-sparkles">
          <path d="M86 2q.8 5.2 6 6q-5.2.8-6 6q-.8-5.2-6-6q5.2-.8 6-6z" fill="#ffd54f" />
          <path d="M12 8q.6 3.9 4.5 4.5q-3.9.6-4.5 4.5q-.6-3.9-4.5-4.5q3.9-.6 4.5-4.5z" fill="#ff4081" />
          <circle cx="70" cy="4" r="2.6" fill="none" stroke="#3992de" strokeWidth="1.6" />
          <circle cx="30" cy="3" r="1.9" fill="#9466e8" />
        </g>
      )}

      {listening && !small && (
        <g className="bubbles-dots" fill="#9466e8">
          <circle cx="76" cy="8" r="2.8" />
          <circle cx="84" cy="8" r="2.8" />
          <circle cx="92" cy="8" r="2.8" />
        </g>
      )}

      <g className="bubbles-body">
        <circle cx="50" cy="55" r="38" fill={`url(#${fill})`} stroke={`url(#${film})`} strokeWidth={small ? 5 : 4} />
        <path d="M24 44A28 28 0 0 1 38 30" fill="none" stroke="#fff" strokeWidth="5.5" strokeLinecap="round" />

        <g className="bubbles-eyes" fill={INK}>
          <ellipse cx="38" cy={eyeY} rx={small ? 6.4 : 5.4} ry={small ? 8 : listening ? 7.6 : 6.8} />
          <ellipse cx="62" cy={eyeY} rx={small ? 6.4 : 5.4} ry={small ? 8 : listening ? 7.6 : 6.8} />
          <circle cx="40" cy={eyeY - 3.2} r="2.1" fill="#fff" />
          <circle cx="64" cy={eyeY - 3.2} r="2.1" fill="#fff" />
        </g>
        <ellipse cx="27" cy="68" rx="5" ry="3" fill="#ff4081" opacity="0.22" />
        <ellipse cx="73" cy="68" rx="5" ry="3" fill="#ff4081" opacity="0.22" />
        {m === "drawing" ? (
          <path d="M45 67h10q-1 6-5 6t-5-6z" fill={INK} stroke={INK} strokeWidth="1.2" strokeLinejoin="round" />
        ) : listening ? (
          <ellipse cx="50" cy="70" rx="3.2" ry="3.8" fill={INK} />
        ) : (
          <path d="M45 68.5q5 4.5 10 0" fill="none" stroke={INK} strokeWidth={small ? 3.4 : 2.6} strokeLinecap="round" />
        )}
      </g>

      {m === "drawing" && (
        <>
          {!small && <path className="bubbles-scrawl" d="M60 98q4-5 8 0t8 0" pathLength={1} fill="none" stroke="#9466e8" strokeWidth="2.2" strokeLinecap="round" />}
          <g transform={small ? "translate(86 97) rotate(35) scale(1.3)" : "translate(86 95) rotate(35)"}>
            <g className="bubbles-pencil" stroke={INK} strokeWidth="1.5" strokeLinejoin="round">
              <rect x="-4" y="-25" width="8" height="5" rx="2" fill="#ff4081" />
              <rect x="-4" y="-20" width="8" height="14" fill="#ffd54f" />
              <path d="M-4-6L0 1.5L4-6z" fill="#ffe9c8" />
              <path d="M-1.4-1.2L0 1.5L1.4-1.2z" fill={INK} />
            </g>
          </g>
        </>
      )}
    </svg>
  );
}
