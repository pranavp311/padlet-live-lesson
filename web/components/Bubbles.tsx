import { useId } from "react";

// Bubbles, the mascot teachers can ask for a diagram ("Bubbles, draw the water cycle").
// A soap bubble with little arms, whose rainbow film uses Padlet's palette. Idle it breathes (body
// swells, arms rise), floats and blinks; drawing, it scribbles hard with a pencil and throws off sparkles.
const INK = "#2e1c5f";
const ARM = "#c9b4f7"; // a shade of the bubble's lavender
const HAND = "#f6f0ff";

export function Bubbles({ size = 72, drawing = false }: { size?: number; drawing?: boolean }) {
  // Several Bubbles can be on screen at once, so gradient ids must be unique per instance.
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const fill = `bb-fill-${id}`;
  const film = `bb-film-${id}`;
  // At pill size (28px) extra detail turns to noise: drop the sparkles, scrawl and second reflection.
  const small = size < 40;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label="Bubbles"
      className={drawing ? "bubbles bubbles-drawing" : "bubbles"}
    >
      <defs>
        <radialGradient id={fill} cx="40%" cy="34%" r="72%">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.55" stopColor="#f6f0ff" />
          <stop offset="0.85" stopColor="#e6dbff" />
          <stop offset="1" stopColor="#d4e9ff" />
        </radialGradient>
        <linearGradient id={film} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3992de" />
          <stop offset="0.4" stopColor="#9466e8" />
          <stop offset="0.72" stopColor="#ff4081" />
          <stop offset="1" stopColor="#ffd54f" />
        </linearGradient>
      </defs>

      {drawing && !small && (
        <g className="bubbles-sparkles">
          <path d="M88 10q.8 5.2 6 6q-5.2.8-6 6q-.8-5.2-6-6q5.2-.8 6-6z" fill="#ffd54f" stroke="#ff833e" strokeWidth="1" strokeLinejoin="round" />
          <path d="M10 14q.6 3.9 4.5 4.5q-3.9.6-4.5 4.5q-.6-3.9-4.5-4.5q3.9-.6 4.5-4.5z" fill="#ff4081" />
          <circle cx="76" cy="6" r="2.6" fill="#fff" stroke="#3992de" strokeWidth="1.2" />
        </g>
      )}

      {/* Arms sit behind the body so they look like they come out of its sides; an ink outline keeps them
          readable on white (drawn as a wider ink stroke under the lavender one). */}
      <g strokeLinecap="round" fill="none">
        <g className="bubbles-arm-left">
          <path d="M16 68q-8 4-11 13" stroke={INK} strokeWidth={small ? 10 : 9} />
          <path d="M16 68q-8 4-11 13" stroke={ARM} strokeWidth={small ? 7 : 6} />
          <circle cx="5" cy="82" r="5" fill={HAND} stroke={INK} strokeWidth="1.8" />
        </g>
        {!drawing && (
          <g className="bubbles-arm-right">
            <path d="M84 68q8 4 11 13" stroke={INK} strokeWidth={small ? 10 : 9} />
            <path d="M84 68q8 4 11 13" stroke={ARM} strokeWidth={small ? 7 : 6} />
            <circle cx="95" cy="82" r="5" fill={HAND} stroke={INK} strokeWidth="1.8" />
          </g>
        )}
      </g>

      <g className="bubbles-body">
        <ellipse cx="50" cy="55" rx="39" ry="37" fill={`url(#${fill})`} stroke={`url(#${film})`} strokeWidth={small ? 5 : 4} />
        <path d="M21.8 45.4A30 28 0 0 1 37.3 29.6" fill="none" stroke="#fff" strokeWidth="5.5" strokeLinecap="round" />
        <circle cx="44" cy="27.4" r="2.6" fill="#fff" />
        {!small && <path d="M38.7 84.1A33 31 0 0 0 81.9 63" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" opacity="0.9" />}

        <ellipse cx="27" cy="68" rx="5.5" ry="3.2" fill="#ff4081" opacity="0.28" />
        <ellipse cx="73" cy="68" rx="5.5" ry="3.2" fill="#ff4081" opacity="0.28" />
        <g className="bubbles-eyes" fill={INK}>
          <ellipse cx="38" cy="58" rx={small ? 6.4 : 5.4} ry={small ? 8 : 6.8} />
          <ellipse cx="62" cy="58" rx={small ? 6.4 : 5.4} ry={small ? 8 : 6.8} />
          <circle cx="40" cy="55.2" r="2.1" fill="#fff" />
          <circle cx="64" cy="55.2" r="2.1" fill="#fff" />
          {!small && <circle cx="36.4" cy="61" r="1" fill="#fff" />}
          {!small && <circle cx="60.4" cy="61" r="1" fill="#fff" />}
        </g>
        {drawing ? (
          <>
            <path d="M44.5 67h11q-1 6.5-5.5 6.5t-5.5-6.5z" fill={INK} stroke={INK} strokeWidth="1.2" strokeLinejoin="round" />
            <path d="M47 71.4q3-2.4 6 0q-1.2 1.9-3 1.9t-3-1.9z" fill="#ff7aa8" />
          </>
        ) : (
          <path d="M45 68.5q5 4.5 10 0" fill="none" stroke={INK} strokeWidth={small ? 3.4 : 2.6} strokeLinecap="round" />
        )}
      </g>

      {drawing && (
        <>
          {!small && <path className="bubbles-scrawl" d="M58 97q4-5 8 0t8 0" pathLength={1} fill="none" stroke="#9466e8" strokeWidth="2.2" strokeLinecap="round" />}
          {/* Drawing arm: shoulder at the bubble's right side, hand gripping the pencil; the whole arm scribbles. */}
          <g className="bubbles-hand">
            <path d="M84 67q6 8 5 17" fill="none" stroke={INK} strokeWidth={small ? 10 : 9} strokeLinecap="round" />
            <path d="M84 67q6 8 5 17" fill="none" stroke={ARM} strokeWidth={small ? 7 : 6} strokeLinecap="round" />
            <g transform={small ? "translate(86 97) rotate(35) scale(1.3)" : "translate(85 95) rotate(35)"}>
              <g stroke={INK} strokeWidth="1.5" strokeLinejoin="round">
                <rect x="-4" y="-25" width="8" height="5" rx="2" fill="#ff4081" />
                <rect x="-4" y="-20" width="8" height="3" fill="#ced0d4" />
                <rect x="-4" y="-17" width="8" height="11" fill="#ffd54f" />
                <path d="M-4-6L0 1.5L4-6z" fill="#ffe9c8" />
                <path d="M-1.4-1.2L0 1.5L1.4-1.2z" fill={INK} />
              </g>
            </g>
            <circle cx="89" cy="85" r="5" fill={HAND} stroke={INK} strokeWidth="1.8" />
          </g>
        </>
      )}
    </svg>
  );
}
