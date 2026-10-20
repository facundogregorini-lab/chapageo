import Link from "next/link";
import type { ReactNode } from "react";
import { ENGINES, type EngineId } from "@/lib/config";
import type { Ratio } from "@/lib/metrics";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`flex items-center gap-2 font-bold tracking-tight ${className}`}>
      <span className="relative grid h-7 w-7 place-items-center rounded-lg bg-ink text-white">
        <span className="absolute h-2.5 w-2.5 rounded-full bg-sol" />
        <span className="absolute h-5 w-5 rounded-full border-2 border-celeste/80" />
      </span>
      <span>
        Chapa<span className="text-celeste">GEO</span>
      </span>
    </Link>
  );
}

export function Badge({ children, tone = "neutral", title }: { children: ReactNode; tone?: "neutral" | "ok" | "bad" | "sol" | "celeste"; title?: string }) {
  const tones = {
    neutral: "bg-paper text-mute border-line",
    ok: "bg-ok-50 text-ok border-ok/20",
    bad: "bg-bad-50 text-bad border-bad/20",
    sol: "bg-sol-50 text-[#8a5a00] border-sol/30",
    celeste: "bg-celeste-50 text-celeste-700 border-celeste/25",
  };
  return (
    <span title={title} className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function EngineBadge({ engine, simulated }: { engine: EngineId; simulated?: boolean }) {
  const e = ENGINES[engine];
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-line bg-white px-2 py-0.5 text-[11px] font-semibold">
      <span className="h-2 w-2 rounded-full" style={{ background: e.color }} />
      {e.label}
      {simulated ? <span className="text-[#8a5a00]">· simulado</span> : null}
    </span>
  );
}

export function SimulatedNotice({ count, total }: { count: number; total: number }) {
  if (!count) return null;
  return (
    <div className="rounded-xl border border-sol/40 bg-sol-50 px-4 py-3 text-sm text-[#6b4700]">
      <strong>Datos simulados:</strong> {count} de {total} respuestas salen del motor de demostración porque falta la clave de API de ese motor.
      Sirven para mostrar el flujo; no las uses como medición ni se las muestres a un cliente como reales.
    </div>
  );
}

export function Stat({ label, value, hint, ratio, tone }: { label: string; value: string; hint?: ReactNode; ratio?: Ratio; tone?: "ok" | "bad" }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-semibold text-mute">{label}</div>
      <div className={`mt-1 text-3xl font-bold tracking-tight ${tone === "ok" ? "text-ok" : tone === "bad" ? "text-bad" : ""}`}>{value}</div>
      {ratio ? (
        <div className="mt-1 text-xs text-mute">
          {ratio.num} de {ratio.den} respuestas válidas
        </div>
      ) : null}
      {hint ? <div className="mt-1 text-xs text-mute">{hint}</div> : null}
    </div>
  );
}

export function Bar({ value, color = "var(--color-celeste)", className = "" }: { value: number; color?: string; className?: string }) {
  return (
    <div className={`h-2 w-full overflow-hidden rounded-full bg-paper ${className}`}>
      <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%`, background: color }} />
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="card grid place-items-center px-6 py-14 text-center">
      <div className="max-w-md">
        <div className="text-base font-semibold">{title}</div>
        {children ? <div className="mt-2 text-sm text-mute">{children}</div> : null}
      </div>
    </div>
  );
}

export function SectionTitle({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 className="text-base font-bold">{title}</h2>
        {children ? <p className="text-sm text-mute">{children}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function LineChart({
  series,
  labels,
  height = 160,
}: {
  series: { name: string; color: string; values: number[] }[];
  labels: string[];
  height?: number;
}) {
  const w = 600;
  const h = height;
  const pad = { l: 34, r: 12, t: 12, b: 24 };
  const n = Math.max(1, labels.length - 1);
  const x = (i: number) => pad.l + (i / n) * (w - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - v) * (h - pad.t - pad.b);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-auto w-full" role="img" aria-label="Evolución">
      {[0, 0.25, 0.5, 0.75, 1].map((g) => (
        <g key={g}>
          <line x1={pad.l} x2={w - pad.r} y1={y(g)} y2={y(g)} stroke="var(--color-line)" />
          <text x={pad.l - 6} y={y(g) + 3} fontSize="10" textAnchor="end" fill="var(--color-mute)">
            {Math.round(g * 100)}%
          </text>
        </g>
      ))}
      {labels.map((l, i) => (
        <text key={i} x={x(i)} y={h - 6} fontSize="10" textAnchor="middle" fill="var(--color-mute)">
          {l}
        </text>
      ))}
      {series.map((s) => (
        <g key={s.name}>
          <polyline fill="none" stroke={s.color} strokeWidth="2.5" strokeLinejoin="round" points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ")} />
          {s.values.map((v, i) => (
            <circle key={i} cx={x(i)} cy={y(v)} r="3.5" fill="white" stroke={s.color} strokeWidth="2">
              <title>{`${s.name}: ${Math.round(v * 100)}%`}</title>
            </circle>
          ))}
        </g>
      ))}
    </svg>
  );
}

export function Legend({ items }: { items: { name: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap gap-3 text-xs text-mute">
      {items.map((i) => (
        <span key={i.name} className="inline-flex items-center gap-1.5">
          <span className="h-2 w-4 rounded-full" style={{ background: i.color }} />
          {i.name}
        </span>
      ))}
    </div>
  );
}

export function fmtDate(iso: string | null | undefined, withTime = false) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
    timeZone: "America/Argentina/Buenos_Aires",
  });
}

export function pct(x: number, digits = 0) {
  return `${(x * 100).toFixed(digits)}%`;
}

/** Resalta las menciones de marcas en una respuesta. */
export function Highlighted({ text: raw, own, others }: { text: string; own: string[]; others: string[] }) {
  // Sacamos el markdown de énfasis para leer la respuesta como texto plano.
  const text = raw.replace(/\*\*|__/g, "").replace(/^#{1,4}\s+/gm, "");
  const terms = [...own.map((t) => ({ t, own: true })), ...others.map((t) => ({ t, own: false }))].filter((x) => x.t.length >= 2);
  if (!terms.length) return <>{text}</>;
  const re = new RegExp(`(${terms.map((x) => x.t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  const parts = text.split(re);
  return (
    <>
      {parts.map((p, i) => {
        const hit = terms.find((x) => x.t.toLowerCase() === p.toLowerCase());
        if (!hit) return <span key={i}>{p}</span>;
        return (
          <mark key={i} className={`rounded px-0.5 ${hit.own ? "bg-celeste-100 text-celeste-700" : "bg-sol-50 text-[#8a5a00]"}`}>
            {p}
          </mark>
        );
      })}
    </>
  );
}
