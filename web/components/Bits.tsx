import type { Todo, TodoKind } from "@/lib/todo";
import type { Subject } from "@/lib/subject";

// Small shared pieces: logo, icons, subject tile, mic level.

export function Brand() {
  return (
    <span className="brand">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/crane.svg" width={24} height={24} alt="" />
      Padlet
    </span>
  );
}

const PATHS: Record<string, string[]> = {
  mic: ["M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z", "M19 10v2a7 7 0 0 1-14 0v-2", "M12 19v3"],
  pen: ["M12 20h9", "M16.4 3.6a2.1 2.1 0 0 1 3 3L7.4 18.6a2 2 0 0 1-.9.5l-2.9.8.8-2.9a2 2 0 0 1 .5-.9z"],
  pin: ["M12 17v5", "M9 10.8a2 2 0 0 1-1.1 1.8l-1.8.9A2 2 0 0 0 5 15.2v.8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.8a2 2 0 0 0-1.1-1.8l-1.8-.9A2 2 0 0 1 15 10.8V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"],
  x: ["M18 6 6 18", "m6 6 12 12"],
  check: ["M20 6 9 17l-5-5"],
  download: ["M12 15V3", "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4", "m7 10 5 5 5-5"],
  board: ["M3 3h7v7H3z", "M14 3h7v7h-7z", "M14 14h7v7h-7z", "M3 14h7v7H3z"],
  game: ["M6 12h4", "M8 10v4", "M15 13h.01", "M18 11h.01", "M17.3 5H6.7a4 4 0 0 0-4 3.6L2 15a3 3 0 0 0 5.4 1.8L9 15h6l1.6 1.8A3 3 0 0 0 22 15l-.7-6.4A4 4 0 0 0 17.3 5z"],
  cards: ["M8.3 10a.7.7 0 0 1-.6-1.1l3.7-6a.7.7 0 0 1 1.2 0l3.7 6a.7.7 0 0 1-.6 1.1z", "M3 14h7v7H3z", "M17.5 21a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z"],
  leaf: ["M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z", "M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"],
  flask: ["M10 2v7.5L4.6 18.4A2 2 0 0 0 6.3 21h11.4a2 2 0 0 0 1.7-2.6L14 9.5V2", "M8.5 2h7", "M7 16h10"],
  sigma: ["M18 7V4H6l6 8-6 8h12v-3"],
  atom: ["M12 12h.01", "M20.2 20.2c2-2-.4-7.6-5.4-12.6S4.1 1.8 2.2 3.8s.4 7.6 5.4 12.6 10.6 6.8 12.6 4.8z", "M15.7 15.7c5-5 7.4-10.6 5.4-12.6s-7.6.4-12.6 5.4-7.4 10.6-5.4 12.6 7.6-.4 12.6-5.4z"],
  landmark: ["M3 22h18", "M6 18v-7", "M10 18v-7", "M14 18v-7", "M18 18v-7", "M12 2 20 7H4z"],
  globe: ["M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z", "M2 12h20", "M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"],
  book: ["M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"],
  exam: ["M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2", "M15 2H9a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1z", "m9 14 2 2 4-4"],
  homework: ["M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4", "M2 6h4", "M2 10h4", "M2 14h4", "M2 18h4", "M21.378 5.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z"],
  bring: ["M4 10a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z", "M8 10h8", "M8 18h8", "M8 22v-6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v6", "M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"],
  deadline: ["M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3.5", "M16 2v4", "M8 2v4", "M3 10h5", "M17.5 17.5 16 16.3V14", "M22 16a6 6 0 1 1-12 0 6 6 0 0 1 12 0z"],
  palette: ["M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z", "M13.5 6.5h.01", "M17.5 10.5h.01", "M6.5 12.5h.01", "M8.5 7.5h.01"],
  music: ["M9 18V5l12-2v13", "M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0z", "M21 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z"],
  code: ["m16 18 6-6-6-6", "m8 6-6 6 6 6"],
  languages: ["m5 8 6 6", "m4 14 6-6 2-3", "M2 5h12", "M7 2h1", "m22 22-5-10-5 10", "M14 18h6"],
  left: ["m15 18-6-6 6-6"],
  right: ["m9 18 6-6-6-6"],
  history: ["M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8", "M3 3v5h5", "M12 7v5l4 2"],
  text: ["M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z", "M14 2v6h6", "M16 13H8", "M16 17H8", "M10 9H8"],
  lesson: ["M2 3h20", "M21 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3", "m7 21 5-5 5 5", "M7 12l3-3 2 2 4-4"],
};

export function Icon({ name, size = 18 }: { name: keyof typeof PATHS; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

const SUBJECT: Record<Subject, { icon: keyof typeof PATHS; bg: string; fg: string }> = {
  biology: { icon: "leaf", bg: "var(--park-tint)", fg: "#004e00" },
  chemistry: { icon: "flask", bg: "var(--oceanic-tint)", fg: "#003f7c" },
  math: { icon: "sigma", bg: "var(--grape-tint)", fg: "#520085" },
  physics: { icon: "atom", bg: "var(--grape-tint)", fg: "#520085" },
  history: { icon: "landmark", bg: "var(--canary-tint)", fg: "#913d00" },
  geography: { icon: "globe", bg: "var(--oceanic-tint)", fg: "#003f7c" },
  literature: { icon: "book", bg: "var(--canary-tint)", fg: "#913d00" },
  languages: { icon: "languages", bg: "var(--scarlet-tint)", fg: "#7c0000" },
  art: { icon: "palette", bg: "var(--scarlet-tint)", fg: "#7c0000" },
  music: { icon: "music", bg: "var(--grape-tint)", fg: "#520085" },
  computing: { icon: "code", bg: "var(--oceanic-tint)", fg: "#003f7c" },
  other: { icon: "lesson", bg: "var(--grape-tint)", fg: "#520085" },
};

export function SubjectTile({ subject, size = 48 }: { subject: Subject; size?: number }) {
  const s = SUBJECT[subject];
  return (
    <span className="tile" style={{ width: size, height: size, background: s.bg, color: s.fg, borderRadius: size * 0.29 }}>
      <Icon name={s.icon} size={size * 0.54} />
    </span>
  );
}

// Live mic meter: bar heights follow the real input level.
export function MicBars({ level, big = false }: { level: number; big?: boolean }) {
  const shape = big ? [0.4, 0.7, 1, 0.6, 0.35] : [0.4, 0.75, 1, 0.6];
  const max = big ? 32 : 16;
  const v = Math.min(1, level * 8);
  return (
    <div className="bars" role="img" aria-label="Mic level" style={{ height: max, gap: big ? 4 : 2 }}>
      {shape.map((k, i) => (
        <span
          key={i}
          style={{ width: big ? 4 : 3, height: Math.max(3, max * k * (0.25 + 0.75 * v)), background: big ? "var(--grape-strong)" : "var(--wall-ink)" }}
        />
      ))}
    </div>
  );
}

const TODO_LOOK: Record<TodoKind, { icon: keyof typeof PATHS; bg: string; fg: string }> = {
  exam: { icon: "exam", bg: "var(--scarlet-tint)", fg: "#7c0000" },
  homework: { icon: "homework", bg: "var(--canary-tint)", fg: "#913d00" },
  bring: { icon: "bring", bg: "var(--park-tint)", fg: "#004e00" },
  deadline: { icon: "deadline", bg: "var(--oceanic-tint)", fg: "#003f7c" },
  other: { icon: "check", bg: "var(--surface)", fg: "#111" },
};

// One student to-do: kind icon in a tinted square, then the note.
export function TodoItem({ todo, size = 28 }: { todo: Todo; size?: number }) {
  const look = TODO_LOOK[todo.kind] ?? TODO_LOOK.other;
  return (
    <span className="todo">
      <span className="todo-icon" style={{ width: size, height: size, background: look.bg, color: look.fg }}>
        <Icon name={look.icon} size={size * 0.58} />
      </span>
      {todo.text}
    </span>
  );
}
