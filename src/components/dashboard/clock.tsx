"use client";

import { useEffect, useState } from "react";
import { fmt, capitalize } from "@/lib/dates";

/** Reloj analógico + hora digital (24 h), como el widget de la referencia. */
export function Clock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const h = now ? now.getHours() % 12 : 10;
  const m = now ? now.getMinutes() : 10;
  const s = now ? now.getSeconds() : 30;
  const hourDeg = h * 30 + m * 0.5;
  const minDeg = m * 6 + s * 0.1;
  const secDeg = s * 6;

  return (
    <div className="glass flex items-center gap-4 p-4">
      <svg viewBox="0 0 100 100" className="size-[88px] shrink-0" aria-hidden>
        {Array.from({ length: 12 }).map((_, i) => (
          <line
            key={i}
            x1="50" y1={i % 3 === 0 ? 7 : 9} x2="50" y2={i % 3 === 0 ? 14 : 12}
            stroke="var(--text-muted)" strokeWidth={i % 3 === 0 ? 2 : 1.2} strokeLinecap="round"
            transform={`rotate(${i * 30} 50 50)`}
          />
        ))}
        <line x1="50" y1="50" x2="50" y2="28" stroke="var(--text)" strokeWidth="3" strokeLinecap="round" transform={`rotate(${hourDeg} 50 50)`} />
        <line x1="50" y1="50" x2="50" y2="18" stroke="var(--text)" strokeWidth="2" strokeLinecap="round" transform={`rotate(${minDeg} 50 50)`} />
        <line x1="50" y1="56" x2="50" y2="15" stroke="var(--today)" strokeWidth="1" strokeLinecap="round" transform={`rotate(${secDeg} 50 50)`} />
        <circle cx="50" cy="50" r="2.4" fill="var(--text)" />
      </svg>
      <div className="leading-tight">
        <div className="text-[28px] font-normal tabular-nums tracking-tight" suppressHydrationWarning>
          {now ? fmt(now, "HH:mm") : "--:--"}
        </div>
        <div className="mt-1 text-[13px] text-muted" suppressHydrationWarning>
          {now ? capitalize(fmt(now, "EEEE d 'de' MMMM")) : " "}
        </div>
      </div>
    </div>
  );
}
