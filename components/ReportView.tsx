import { AnalysisDashboard, ConditionsPanel } from "./analysis";
import { Methodology } from "./Methodology";
import { fmtDate } from "./ui";
import { collectorShort } from "@/lib/collectors/registry";
import { countryName } from "@/lib/config";
import type { Report } from "@/lib/report";
import { CATEGORY_LABEL, type Brand } from "@/lib/types";

/** Informe para compartir con el cliente. Se imprime a PDF desde el navegador. */
export function ReportView({ brand, report, agency, linkBase, accent }: { brand: Brand; report: Report; agency: string; linkBase: string | null; accent?: string }) {
  const { m } = report;
  const run = m.run!;
  return (
    <div className="space-y-6">
      <header className="border-b-4 pb-4" style={{ borderColor: accent ?? "var(--color-celeste)" }}>
        <div className="text-xs font-semibold uppercase tracking-wide text-mute">Informe de visibilidad en asistentes de IA · {agency}</div>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">{brand.name}</h1>
        <p className="mt-1 text-sm text-mute">
          {brand.domain} · {brand.category} · País objetivo: {countryName(brand.country)} · Análisis del {fmtDate(run.created_at, true)} · {m.valid} respuestas válidas de{" "}
          {m.requested} ejecuciones ({run.collectors.map(collectorShort).join(", ")})
        </p>
      </header>
      <AnalysisDashboard brand={brand} m={m} opp={report.opp} previous={report.previous} linkBase={linkBase} accent={accent} />
      <ConditionsPanel run={run} jobs={m.jobs} />
      <div className="card overflow-hidden">
        <div className="px-5 pt-4 text-base font-bold">Preguntas analizadas</div>
        <p className="px-5 text-sm text-mute">Cada celda: respuestas válidas que mencionan a {brand.name} / respuestas válidas (solicitadas).</p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-paper text-left text-xs text-mute">
              <tr>
                <th className="px-5 py-2 font-semibold">Pregunta</th>
                {m.collectors.map((c) => (
                  <th key={c} className="px-3 py-2 text-center font-semibold">{collectorShort(c)}</th>
                ))}
                <th className="px-5 py-2 font-semibold">Más nombrados</th>
              </tr>
            </thead>
            <tbody>
              {m.prompts.map((p) => (
                <tr key={p.promptId} className="border-t border-line">
                  <td className="px-5 py-2.5">
                    {p.text}
                    <div className="text-[11px] text-mute">{CATEGORY_LABEL[p.category]}</div>
                  </td>
                  {m.collectors.map((c) => {
                    const cell = p.cells[c];
                    return (
                      <td key={c} className="px-3 py-2.5 text-center text-xs">
                        {cell ? (cell.valid ? `${cell.mentioned}/${cell.valid}` : "sin válidas") : "—"}
                        {cell && cell.valid < cell.requested ? <span className="text-mute"> ({cell.requested})</span> : null}
                      </td>
                    );
                  })}
                  <td className="px-5 py-2.5 text-xs text-mute">{p.leaders.join(", ") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <Methodology />
      <p className="text-xs text-mute">
        Este informe describe una muestra de respuestas obtenida bajo las condiciones registradas. Las respuestas de los asistentes cambian con el tiempo,
        la cuenta y el contexto; no implica que todas las personas vean lo mismo ni garantiza resultados futuros.
      </p>
    </div>
  );
}
