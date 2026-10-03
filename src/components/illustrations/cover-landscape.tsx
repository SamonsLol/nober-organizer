/**
 * Portada del espacio de trabajo: paisaje de montaña al atardecer,
 * ilustración propia en SVG (sin assets externos).
 */

function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function pine(x: number, base: number, h: number, w: number) {
  // Pino de 4 niveles
  const tiers = 4;
  let d = "";
  for (let i = 0; i < tiers; i++) {
    const top = base - h + (h * i) / (tiers + 1.2);
    const bottom = top + h / 2.4;
    const half = (w / 2) * (0.45 + (i / tiers) * 0.7);
    d += `M${x} ${top} L${x - half} ${bottom} L${x + half} ${bottom} Z `;
  }
  d += `M${x - w * 0.05} ${base - h * 0.12} h${w * 0.1} v${h * 0.14} h${-w * 0.1} Z`;
  return d;
}

function forest(seed: number, count: number, base: number, hMin: number, hMax: number, jitter: number) {
  const r = rng(seed);
  let d = "";
  for (let i = 0; i < count; i++) {
    const x = (i / count) * 1700 - 50 + r() * 40;
    const h = hMin + r() * (hMax - hMin);
    d += pine(x, base + r() * jitter, h, h * 0.42);
  }
  return d;
}

const ridge = (seed: number, y: number, amp: number, step: number) => {
  const r = rng(seed);
  let d = `M0 400 L0 ${y}`;
  for (let x = 0; x <= 1600; x += step) {
    d += ` L${x} ${y - r() * amp - Math.sin(x / 260 + seed) * amp * 0.5}`;
  }
  return d + " L1600 400 Z";
};

export function CoverLandscape({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 1600 360"
      preserveAspectRatio="xMidYMid slice"
      className={className}
      aria-hidden
    >
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3c4a5c" />
          <stop offset="0.55" stopColor="#8a8a8f" />
          <stop offset="0.85" stopColor="#d9b48f" />
          <stop offset="1" stopColor="#e8c49c" />
        </linearGradient>
        <radialGradient id="sun" cx="0.7" cy="0.52" r="0.32">
          <stop offset="0" stopColor="#fbe3c0" stopOpacity="0.95" />
          <stop offset="0.35" stopColor="#f2c99a" stopOpacity="0.35" />
          <stop offset="1" stopColor="#f2c99a" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="mist" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e9d3ba" stopOpacity="0" />
          <stop offset="0.6" stopColor="#e9d3ba" stopOpacity="0.45" />
          <stop offset="1" stopColor="#e9d3ba" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="1600" height="360" fill="url(#sky)" />
      <rect width="1600" height="360" fill="url(#sun)" />
      {/* cordilleras lejanas */}
      <path d={ridge(3, 215, 80, 40)} fill="#7d7f8c" opacity="0.55" />
      <path d={ridge(7, 250, 60, 32)} fill="#5f6573" opacity="0.7" />
      <rect y="215" width="1600" height="90" fill="url(#mist)" />
      <path d={ridge(11, 285, 40, 26)} fill="#434a55" />
      {/* bosque */}
      <path d={forest(5, 80, 318, 40, 70, 14)} fill="#2f363c" />
      <rect y="305" width="1600" height="30" fill="url(#mist)" opacity="0.5" />
      <path d={forest(9, 52, 372, 70, 120, 16)} fill="#1d2226" />
      <path d={forest(13, 26, 392, 110, 160, 10)} fill="#15191b" />
    </svg>
  );
}
