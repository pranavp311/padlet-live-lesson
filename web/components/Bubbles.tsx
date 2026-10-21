// Bubbles, the mascot teachers can ask for a diagram ("Bubbles, draw the water cycle").
// A soap bubble with a face: floats when idle, bobs and blows little bubbles while drawing.
export function Bubbles({ size = 72, drawing = false }: { size?: number; drawing?: boolean }) {
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
        <radialGradient id="bb-body" cx="38%" cy="32%" r="75%">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.55" stopColor="#e6f3ff" />
          <stop offset="0.85" stopColor="#d9c7ff" />
          <stop offset="1" stopColor="#b79cf5" />
        </radialGradient>
        <linearGradient id="bb-rim" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7cc4ff" />
          <stop offset="0.5" stopColor="#9466e8" />
          <stop offset="1" stopColor="#ff7fb0" />
        </linearGradient>
      </defs>
      {drawing && (
        <g className="bubbles-trail" fill="#fff" stroke="#b79cf5" strokeWidth="1.2">
          <circle cx="84" cy="30" r="5" />
          <circle cx="92" cy="16" r="3.2" />
          <circle cx="78" cy="10" r="2.2" />
        </g>
      )}
      <circle cx="48" cy="54" r="38" fill="url(#bb-body)" stroke="url(#bb-rim)" strokeWidth="3" />
      <path d="M26 40a24 24 0 0 1 16-14" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" opacity="0.95" />
      <circle cx="24" cy="50" r="2.6" fill="#fff" opacity="0.9" />
      <g className="bubbles-eyes">
        <ellipse cx="38" cy="54" rx="4.4" ry="6" fill="#2b1a4f" />
        <ellipse cx="60" cy="54" rx="4.4" ry="6" fill="#2b1a4f" />
        <circle cx="39.6" cy="51.4" r="1.6" fill="#fff" />
        <circle cx="61.6" cy="51.4" r="1.6" fill="#fff" />
      </g>
      <ellipse cx="30" cy="64" rx="4.5" ry="2.6" fill="#ff8fb8" opacity="0.55" />
      <ellipse cx="68" cy="64" rx="4.5" ry="2.6" fill="#ff8fb8" opacity="0.55" />
      <path d={drawing ? "M43 65q6 6 12 0" : "M43 66q6 4 12 0"} fill="none" stroke="#2b1a4f" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}
