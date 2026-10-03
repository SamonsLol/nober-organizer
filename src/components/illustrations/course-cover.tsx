import type { CoverKind, TagColor } from "@/lib/types";

/**
 * Portadas de materia: dibujos de línea sobre papel, como apuntes a mano.
 * Tinta oscura sobre el color pastel de la materia, en ambos temas.
 */

const ink = { fill: "none", stroke: "var(--ink)", strokeWidth: 1.3, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
const thin = { ...ink, strokeWidth: 0.9, opacity: 0.55 };
const hand = { fill: "var(--ink)", fontFamily: "Georgia, serif", fontStyle: "italic" as const };

function Grid({ dots = false }: { dots?: boolean }) {
  const lines = [];
  if (dots) {
    for (let x = 10; x < 280; x += 14)
      for (let y = 8; y < 120; y += 14) lines.push(<circle key={`${x}-${y}`} cx={x} cy={y} r={0.7} fill="var(--ink)" opacity={0.18} />);
  } else {
    for (let x = 0; x <= 280; x += 14) lines.push(<line key={`v${x}`} x1={x} y1={0} x2={x} y2={120} stroke="var(--ink)" strokeWidth={0.4} opacity={0.1} />);
    for (let y = 0; y <= 120; y += 14) lines.push(<line key={`h${y}`} x1={0} y1={y} x2={280} y2={y} stroke="var(--ink)" strokeWidth={0.4} opacity={0.1} />);
  }
  return <g>{lines}</g>;
}

const art: Record<CoverKind, React.ReactNode> = {
  math: (
    <>
      <Grid />
      <g {...ink}>
        <path d="M40 98 H150 M50 106 V22" />
        <path d="M48 24 l2 -4 l2 4 M148 96 l4 2 l-4 2" />
        <path d="M52 92 C75 90 90 30 108 42 S132 88 146 30" />
        <path d="M190 88 L232 88 L190 42 Z" />
        <path d="M190 80 h8 v8" />
      </g>
      <g {...thin}>
        <path d="M60 60 H140 M70 40 V98" strokeDasharray="2 3" />
        <circle cx="236" cy="36" r="14" />
      </g>
      <text x="170" y="30" fontSize="15" {...hand}>∫ x² dx</text>
      <text x="206" y="108" fontSize="11" {...hand}>a² + b² = c²</text>
      <text x="14" y="30" fontSize="16" {...hand}>π</text>
      <text x="236" y="40" fontSize="11" textAnchor="middle" {...hand}>√2</text>
    </>
  ),
  physics: (
    <>
      <Grid dots />
      <g {...ink}>
        <ellipse cx="140" cy="60" rx="46" ry="16" />
        <ellipse cx="140" cy="60" rx="46" ry="16" transform="rotate(60 140 60)" />
        <ellipse cx="140" cy="60" rx="46" ry="16" transform="rotate(-60 140 60)" />
        <circle cx="140" cy="60" r="4" fill="var(--ink)" />
        <path d="M18 92 q10 -20 20 0 t20 0 t20 0 t20 0" />
        <path d="M222 16 v58 M222 16 h30" />
        <path d="M222 16 L244 64" strokeDasharray="1 0" />
        <circle cx="246" cy="69" r="6" />
      </g>
      <g {...thin}>
        <path d="M222 30 a14 14 0 0 1 6 -2" />
        <path d="M18 60 h40 M50 56 l8 4 l-8 4" />
      </g>
      <text x="16" y="32" fontSize="14" {...hand}>F = m·a</text>
      <text x="196" y="108" fontSize="12" {...hand}>T = 2π√(L/g)</text>
    </>
  ),
  chemistry: (
    <>
      <Grid dots />
      <g {...ink}>
        <path d="M60 40 l18 -10 l18 10 v20 l-18 10 l-18 -10 Z" />
        <path d="M66 44 v12 M78 36 l12 7 M78 64 l12 -7" opacity="0.7" />
        <path d="M96 40 l14 -8 M96 60 l14 8" />
        <path d="M170 20 h20 M174 20 v26 l-16 40 a6 6 0 0 0 5 8 h34 a6 6 0 0 0 5 -8 l-16 -40 v-26" />
        <path d="M162 76 h36" opacity="0.6" />
        <circle cx="176" cy="84" r="2.2" />
        <circle cx="186" cy="80" r="1.6" />
        <circle cx="230" cy="40" r="5" />
        <circle cx="248" cy="30" r="3.5" />
        <circle cx="248" cy="50" r="3.5" />
        <path d="M234 37 l10 -5 M234 43 l10 5" />
      </g>
      <text x="20" y="104" fontSize="14" {...hand}>2H₂ + O₂ → 2H₂O</text>
      <text x="222" y="100" fontSize="13" {...hand}>PV = nRT</text>
    </>
  ),
  english: (
    <>
      <Grid dots />
      <g {...ink}>
        <path d="M24 22 h84 a8 8 0 0 1 8 8 v26 a8 8 0 0 1 -8 8 h-60 l-14 12 v-12 h-10 a8 8 0 0 1 -8 -8 v-26 a8 8 0 0 1 8 -8 Z" />
        <path d="M150 50 h90 a8 8 0 0 1 8 8 v22 a8 8 0 0 1 -8 8 h-12 v12 l-14 -12 h-64 a8 8 0 0 1 -8 -8 v-22 a8 8 0 0 1 8 -8 Z" />
        <path d="M150 20 h18 M150 28 h30 M150 36 h24" opacity="0.6" />
      </g>
      <text x="34" y="48" fontSize="16" {...hand}>Hello!</text>
      <text x="158" y="75" fontSize="12" {...hand}>If I had known…</text>
      <text x="30" y="108" fontSize="11" {...hand}>/ˈlæŋ.ɡwɪdʒ/</text>
    </>
  ),
  history: (
    <>
      <Grid dots />
      <g {...ink}>
        <path d="M40 34 L80 16 L120 34 Z M44 38 h72 M46 94 h68 M42 100 h76" />
        <path d="M52 40 v52 M64 40 v52 M76 40 v52 M88 40 v52 M100 40 v52 M110 40 v52" opacity="0.85" />
        <path d="M160 28 h80 a8 8 0 0 1 0 16 h-80 a8 8 0 0 1 0 -16 Z M160 44 v44 a8 8 0 0 0 8 8 h72 v-44" />
        <path d="M172 58 h56 M172 66 h48 M172 74 h52" opacity="0.6" />
      </g>
      <text x="226" y="112" fontSize="13" {...hand}>1810</text>
      <text x="138" y="20" fontSize="11" {...hand}>1991</text>
    </>
  ),
  literature: (
    <>
      <Grid dots />
      <g {...ink}>
        <path d="M80 92 c20 -8 40 -8 60 0 v-58 c-20 -8 -40 -8 -60 0 Z" />
        <path d="M140 92 c20 -8 40 -8 60 0 v-58 c-20 -8 -40 -8 -60 0" />
        <path d="M90 44 h40 M90 52 h36 M90 60 h40 M150 44 h40 M150 52 h32 M150 60 h38" opacity="0.5" />
        <path d="M236 18 c-10 10 -18 30 -20 52 l4 -2 c4 -20 10 -36 18 -48 Z" />
        <path d="M218 70 l-4 16" />
        <path d="M26 30 c6 -6 14 -6 18 0 c-4 6 -12 6 -18 0 Z M44 30 c6 -6 14 -6 18 0 c-4 6 -12 6 -18 0 Z" opacity="0.8" />
      </g>
      <text x="22" y="100" fontSize="22" {...hand}>¶</text>
      <text x="228" y="108" fontSize="11" {...hand}>Macondo</text>
    </>
  ),
  biology: (
    <>
      <Grid dots />
      <g {...ink}>
        <path d="M40 14 C70 34 70 54 40 74 S10 114 40 118" />
        <path d="M70 14 C40 34 40 54 70 74 S100 114 70 118" />
        <path d="M46 24 h18 M50 34 h10 M46 64 h18 M50 86 h10 M46 102 h18" opacity="0.6" />
        <circle cx="160" cy="60" r="34" />
        <circle cx="166" cy="56" r="11" />
        <path d="M138 70 c6 4 10 -2 16 2 M170 82 c4 -4 10 0 12 -4" opacity="0.6" />
        <path d="M220 96 c0 -30 14 -52 40 -62 c-4 30 -18 52 -40 62 Z M220 96 l30 -50" />
      </g>
      <text x="206" y="30" fontSize="12" {...hand}>Aa × Aa</text>
    </>
  ),
  philosophy: (
    <>
      <Grid dots />
      <g {...ink}>
        <path d="M128 96 c-14 0 -22 -10 -22 -24 c0 -18 12 -34 30 -34 c16 0 26 12 26 28 c0 6 -4 10 -8 12 l4 10 h-10 v8 h-20 Z" />
        <path d="M150 58 c2 2 2 4 0 6" opacity="0.6" />
        <circle cx="60" cy="50" r="22" />
        <path d="M60 28 v44 M38 50 h44" opacity="0.4" />
        <path d="M200 30 c16 0 22 22 6 28 c-6 2 -6 8 -6 12 M200 84 v2" />
      </g>
      <text x="26" y="104" fontSize="13" {...hand}>cogito, ergo sum</text>
      <text x="222" y="104" fontSize="11" {...hand}>a priori</text>
    </>
  ),
};

export function CourseCover({ kind, tint, className }: { kind: CoverKind; tint?: TagColor; className?: string }) {
  return (
    <svg viewBox="0 0 280 120" preserveAspectRatio="xMidYMid slice" className={className} aria-hidden>
      <rect width="280" height="120" fill={tint ? `var(--pastel-${tint})` : "var(--paper)"} />
      {art[kind]}
    </svg>
  );
}
