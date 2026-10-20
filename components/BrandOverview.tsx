import { ENGINES, type EngineId } from "@/lib/config";
import type { BrandMetrics, TrendPoint } from "@/lib/metrics";
import type { ActionRow, Brand } from "@/lib/types";
import { Badge, Bar, Empty, EngineBadge, Legend, LineChart, SectionTitle, SimulatedNotice, Stat, fmtDate, pct } from "./ui";

const KIND_LABEL: Record<string, string> = {
  contenido: "Contenido",
  fuente_externa: "Fuente externa",
  citabilidad: "Citabilidad",
  reputacion: "Reputación",
  tecnica: "Técnica",
  entidad: "Entidad",
};

export function BrandOverview({
  brand,
  m,
  trend,
  actions,
  accent = "var(--color-celeste)",
  publicView = false,
}: {
  brand: Brand;
  m: BrandMetrics;
  trend: TrendPoint[];
  actions: ActionRow[];
  accent?: string;
  publicView?: boolean;
}) {
  if (!m.run) {
    return (
      <Empty title="Todavía no hay mediciones">
        {publicView ? "Este reporte se completa cuando termine la primera medición." : "Tocá «Medir ahora» para correr la primera medición."}
      </Empty>
    );
  }
  const sentTotal = m.sentiment.positivo + m.sentiment.neutral + m.sentiment.negativo;
  const engines = m.byEngine.map((e) => e.engine);
  return (
    <div className="space-y-8">
      <SimulatedNotice count={m.simulated} total={m.valid} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Tasa de mención" value={pct(m.mention.rate)} ratio={m.mention} />
        <Stat label="Share of voice" value={pct(m.sov.rate)} hint={`${m.sov.num} de ${m.sov.den} menciones del conjunto de ${brand.competitors.length + 1} marcas`} />
        <Stat label="Posición promedio" value={m.avgPosition ? `#${m.avgPosition}` : "—"} hint="Entre las marcas seguidas, cuando aparece" />
        <Stat label="Citan tu sitio" value={pct(m.citation.rate)} ratio={m.citation} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="card p-5">
          <SectionTitle title="Evolución" action={<Legend items={[{ name: "Mención", color: accent }, { name: "Share of voice", color: "var(--color-sol)" }, { name: "Citas", color: "#94a3b8" }]} />} />
          {trend.length >= 2 ? (
            <LineChart
              labels={trend.map((t) => fmtDate(t.date))}
              series={[
                { name: "Mención", color: accent, values: trend.map((t) => t.mention) },
                { name: "Share of voice", color: "var(--color-sol)", values: trend.map((t) => t.sov) },
                { name: "Citas", color: "#94a3b8", values: trend.map((t) => t.citation) },
              ]}
            />
          ) : (
            <p className="py-10 text-center text-sm text-mute">Con dos cortes o más vas a ver la tendencia acá.</p>
          )}
        </div>
        <div className="card p-5">
          <SectionTitle title="Por motor" />
          <div className="space-y-4">
            {m.byEngine.map((e) => (
              <div key={e.engine}>
                <div className="flex items-center justify-between">
                  <EngineBadge engine={e.engine} simulated={e.simulated} />
                  <span className="text-sm font-semibold">{pct(e.mention.rate)}</span>
                </div>
                <Bar value={e.mention.rate} color={ENGINES[e.engine].color} className="mt-1.5" />
                <div className="mt-1 text-[11px] text-mute">
                  {e.mention.num}/{e.mention.den} respuestas · posición {e.avgPosition ? `#${e.avgPosition}` : "—"} · cita tu sitio {e.citation.num} veces
                </div>
              </div>
            ))}
          </div>
          <div className="mt-5 border-t border-line pt-4">
            <div className="text-xs font-semibold text-mute">Tono cuando te nombran</div>
            {sentTotal ? (
              <>
                <div className="mt-2 flex h-2.5 overflow-hidden rounded-full">
                  <div className="bg-ok" style={{ width: `${(m.sentiment.positivo / sentTotal) * 100}%` }} />
                  <div className="bg-[#cbd5e1]" style={{ width: `${(m.sentiment.neutral / sentTotal) * 100}%` }} />
                  <div className="bg-bad" style={{ width: `${(m.sentiment.negativo / sentTotal) * 100}%` }} />
                </div>
                <div className="mt-1.5 flex justify-between text-[11px] text-mute">
                  <span>{m.sentiment.positivo} positivas</span>
                  <span>{m.sentiment.neutral} neutras</span>
                  <span>{m.sentiment.negativo} negativas</span>
                </div>
              </>
            ) : (
              <p className="mt-1 text-xs text-mute">Sin menciones para evaluar.</p>
            )}
          </div>
        </div>
      </div>

      <div className="card p-5">
        <SectionTitle title="Tu marca vs. la competencia">Respuestas válidas en las que aparece cada marca del conjunto fijo.</SectionTitle>
        <div className="space-y-3">
          {m.competitors.map((c) => (
            <div key={c.name} className="grid grid-cols-[150px_1fr_auto] items-center gap-3 text-sm sm:grid-cols-[200px_1fr_140px]">
              <div className={`truncate ${c.own ? "font-bold" : ""}`}>{c.name}{c.own ? " (vos)" : ""}</div>
              <Bar value={c.mention.rate} color={c.own ? accent : "#cbd5e1"} />
              <div className="text-right text-xs text-mute">
                <span className="font-semibold text-ink">{pct(c.mention.rate)}</span> · SoV {pct(c.sov)} · {c.avgPosition ? `#${c.avgPosition}` : "—"}
              </div>
            </div>
          ))}
        </div>
        {m.otherBrands.length ? (
          <div className="mt-5 border-t border-line pt-4">
            <div className="text-xs font-semibold text-mute">Otras marcas que la IA nombra y no estás siguiendo</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {m.otherBrands.map((o) => (
                <Badge key={o.name}>{o.name} · {o.count}</Badge>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="card overflow-hidden">
        <div className="p-5 pb-3">
          <SectionTitle title="Pregunta por pregunta">Ordenadas de peor a mejor. Cada celda: respuestas que te nombran / respuestas válidas.</SectionTitle>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-paper text-left text-xs text-mute">
              <tr>
                <th className="px-5 py-2.5 font-semibold">Pregunta</th>
                {engines.map((e) => (
                  <th key={e} className="px-3 py-2.5 text-center font-semibold">{ENGINES[e as EngineId].label}</th>
                ))}
                <th className="px-5 py-2.5 font-semibold">Quién gana</th>
              </tr>
            </thead>
            <tbody>
              {m.prompts.map((p) => (
                <tr key={p.promptId} className="border-t border-line">
                  <td className="px-5 py-3">
                    <div>{p.text}</div>
                    <div className="mt-0.5 text-[11px] text-mute">{p.kind === "con_marca" ? "con marca" : "sin marca"}</div>
                  </td>
                  {engines.map((e) => {
                    const r = p.byEngine[e as EngineId];
                    const rate = r ? r.rate : 0;
                    return (
                      <td key={e} className="px-3 py-3 text-center">
                        {r ? (
                          <span
                            className="inline-block min-w-12 rounded-lg px-2 py-1 text-xs font-semibold"
                            style={{ background: rate === 0 ? "var(--color-bad-50)" : rate >= 0.67 ? "var(--color-ok-50)" : "var(--color-sol-50)", color: rate === 0 ? "var(--color-bad)" : rate >= 0.67 ? "var(--color-ok)" : "#8a5a00" }}
                          >
                            {r.num}/{r.den}
                          </span>
                        ) : (
                          <span className="text-mute">—</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-5 py-3 text-xs text-mute">{p.leaders.join(", ") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {actions.length ? (
        <div className="card p-5">
          <SectionTitle title="Próximas acciones recomendadas" />
          <ul className="divide-y divide-line">
            {actions.slice(0, publicView ? 6 : 4).map((a) => (
              <li key={a.id} className="flex items-start gap-3 py-3 text-sm">
                <Badge tone={a.priority === 1 ? "bad" : a.priority === 2 ? "sol" : "neutral"}>{a.priority === 1 ? "Alta" : a.priority === 2 ? "Media" : "Baja"}</Badge>
                <div>
                  <div className="font-semibold">{a.title}</div>
                  <div className="text-mute">{a.detail}</div>
                </div>
                <span className="ml-auto shrink-0 text-xs text-mute">{KIND_LABEL[a.kind]}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="text-xs leading-relaxed text-mute">
        Metodología: corte del {fmtDate(m.run.created_at, true)} · {m.valid} respuestas válidas{m.failed ? ` y ${m.failed} con error técnico (excluidas del denominador)` : ""} ·{" "}
        {brand.repetitions} {brand.repetitions === 1 ? "repetición" : "repeticiones"} por pregunta · preguntas sobre {brand.city ? `${brand.city}, ` : ""}
        {brand.country}. Las preguntas se eligieron por intención comercial; no son una muestra representativa del mercado. Las respuestas por API pueden
        diferir de lo que ve una persona en la app de cada motor.
      </p>
    </div>
  );
}

export { KIND_LABEL };
