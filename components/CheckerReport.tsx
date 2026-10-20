import type { CheckerResult } from "@/lib/checker";
import { countryName } from "@/lib/config";
import { Markdown } from "./Markdown";
import { SiteAuditView } from "./SiteAuditView";
import { Badge, Highlighted, fmtDate } from "./ui";

export function CheckerReport({ r }: { r: CheckerResult }) {
  const verdict =
    r.total === 0
      ? { tone: "bad" as const, text: "No pudimos obtener respuestas" }
      : r.mentioned === 0
        ? { tone: "bad" as const, text: "La IA no te recomendó en ninguna pregunta" }
        : r.mentioned / r.total < 0.5
          ? { tone: "sol" as const, text: "Aparecés, pero menos que tu competencia" }
          : { tone: "ok" as const, text: "La IA te tiene en cuenta" };
  return (
    <div className="space-y-8">
      {r.simulated ? (
        <div className="rounded-xl border border-sol/40 bg-sol-50 px-4 py-3 text-sm text-[#6b4700]">
          <strong>Resultado simulado.</strong> Este chequeo es antiguo y usó respuestas de demostración.
        </div>
      ) : !r.engine ? (
        <div className="rounded-xl border border-line bg-paper px-4 py-3 text-sm text-mute">
          Este chequeo incluye solo la revisión técnica: el servidor no tiene un motor de IA configurado para la vista previa.
        </div>
      ) : (
        <div className="rounded-xl border border-line bg-paper px-4 py-3 text-sm text-mute">
          Vista previa con la <strong>API oficial</strong> de {r.engineLabel.replace(" (API oficial)", "")}: puede diferir de lo que ve una persona en la app.
          El análisis completo captura la interfaz web y registra las condiciones de cada consulta.
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-[1.2fr_1fr_1fr]">
        <div className="card p-6">
          <div className="text-xs font-semibold text-mute">Puntaje de visibilidad</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-5xl font-bold tracking-tight">{r.score}</span>
            <span className="text-mute">/100</span>
          </div>
          <div className="mt-2">
            <Badge tone={verdict.tone}>{verdict.text}</Badge>
          </div>
          <p className="mt-3 text-xs text-mute">70% presencia en respuestas + 30% salud técnica. Es una foto rápida, no una medición completa.</p>
        </div>
        <div className="card p-6">
          <div className="text-xs font-semibold text-mute">Te mencionó</div>
          <div className="mt-1 text-4xl font-bold">
            {r.mentioned}
            <span className="text-xl text-mute"> de {r.total}</span>
          </div>
          <p className="mt-2 text-xs text-mute">preguntas en {r.engineLabel}{r.city ? `, ${r.city}` : ""}, {countryName(r.country)}</p>
        </div>
        <div className="card p-6">
          <div className="text-xs font-semibold text-mute">Citó tu sitio</div>
          <div className="mt-1 text-4xl font-bold">
            {r.cited}
            <span className="text-xl text-mute"> de {r.total}</span>
          </div>
          <p className="mt-2 text-xs text-mute">veces usó {r.domain} como fuente</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card p-5">
          <div className="text-sm font-semibold">Quién aparece en tu lugar</div>
          {r.topOthers.length ? (
            <ul className="mt-3 space-y-2 text-sm">
              {r.topOthers.map((o) => (
                <li key={o.name} className="flex items-center justify-between">
                  <span>{o.name}</span>
                  <span className="text-xs text-mute">{o.count} de {r.total}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-mute">No detectamos otras marcas listadas.</p>
          )}
        </div>
        <div className="card p-5">
          <div className="text-sm font-semibold">Fuentes que usó la IA</div>
          {r.topSources.length ? (
            <ul className="mt-3 space-y-2 text-sm">
              {r.topSources.map((s) => (
                <li key={s.domain} className="flex items-center justify-between">
                  <span className="truncate">{s.domain}</span>
                  <span className="text-xs text-mute">{s.count} resp.</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-mute">El motor no devolvió fuentes.</p>
          )}
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-bold">Las preguntas y lo que respondió {r.engineLabel}</h2>
        <div className="space-y-3">
          {r.questions.map((q, i) => (
            <details key={i} className="card group p-5" open={i === 0}>
              <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">«{q.text}»</span>
                {q.error ? (
                  <Badge tone="neutral">error técnico</Badge>
                ) : q.mentioned ? (
                  <Badge tone="ok">Te nombra{q.position ? ` · #${q.position}` : ""}</Badge>
                ) : (
                  <Badge tone="bad">No aparecés</Badge>
                )}
              </summary>
              {q.error ? (
                <p className="mt-3 text-sm text-mute">{q.error}</p>
              ) : (
                <div className="mt-4 space-y-3">
                  <div className="rounded-xl bg-paper p-4 text-sm leading-relaxed whitespace-pre-wrap">
                    <Highlighted text={q.answer} own={[r.brandName]} others={q.others} />
                  </div>
                  {q.sources.length ? (
                    <div className="flex flex-wrap gap-1.5">
                      {q.sources.map((s, j) => (
                        <a key={j} href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="rounded-full border border-line px-2 py-0.5 text-xs text-mute hover:text-ink">
                          {s.domain}
                        </a>
                      ))}
                    </div>
                  ) : null}
                </div>
              )}
            </details>
          ))}
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-bold">Revisión técnica del sitio</h2>
        <SiteAuditView audit={r.audit} />
      </div>
      <p className="text-xs text-mute">
        Análisis del {fmtDate(r.createdAt, true)}. Las respuestas de la IA varían entre consultas: este chequeo usa 1 motor y 1 repetición. El diagnóstico
        completo usa 20 preguntas, 2 motores y 3 repeticiones.
      </p>
    </div>
  );
}
