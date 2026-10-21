import Link from "next/link";
import { notFound } from "next/navigation";
import { closeAnalysisAction } from "@/app/app/marcas/actions";
import { AutoRefresh } from "@/components/AutoRefresh";
import { ConditionsPanel, JobsTable, StatusBadge } from "@/components/analysis";
import { fmtDate } from "@/components/ui";
import { brandForCtx, getRunInWorkspace } from "@/lib/access";
import { isBrightDataId } from "@/lib/collectors/brightdata";
import { collectorShort } from "@/lib/collectors/registry";
import { runJobs } from "@/lib/metrics";
import { collectorAvailability, runProgress, workers } from "@/lib/queue";
import { STATUS_LABEL, type JobStatus } from "@/lib/types";

export const metadata = { title: "Análisis" };

const ORDER: JobStatus[] = ["completed", "partial", "running", "pending", "requires_intervention", "failed"];
const COLORS: Record<JobStatus, string> = {
  completed: "var(--color-ok)",
  partial: "var(--color-sol)",
  running: "var(--color-celeste)",
  pending: "#cbd5e1",
  requires_intervention: "#b45309",
  failed: "var(--color-bad)",
};

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; runId: string }>;
  searchParams: Promise<{ motor?: string; categoria?: string; estado?: string }>;
}) {
  const { id, runId } = await params;
  const sp = await searchParams;
  const { ctx, brand } = await brandForCtx(id);
  const run = await getRunInWorkspace(ctx.workspace.id, runId);
  if (!run || run.brand_id !== brand.id) notFound();
  const [jobs, progress, ws, avail] = await Promise.all([
    runJobs(ctx.workspace.id, runId),
    runProgress(runId),
    workers(),
    collectorAvailability(Number(ctx.workspace.is_demo ?? 0) === 1),
  ]);
  const open = run.status === "pending" || run.status === "running";
  // En la demo las respuestas simuladas se generan desde la web: no hace falta worker.
  const demoInWeb = Number(run.is_demo) === 1 && Number(ctx.workspace.is_demo ?? 0) === 1;
  // Bright Data también avanza desde la web; si hay otros motores, esos siguen siendo del worker.
  const viaBrightData = run.collectors.some(isBrightDataId);
  const needsWorker = run.collectors.some((c) => !isBrightDataId(c) && !c.startsWith("demo_"));
  const online = ws.some((w) => w.online);
  const base = `/app/marcas/${id}`;
  const blocked = avail.filter((a) => run.collectors.includes(a.id) && a.status === "requires_intervention");
  const errors = jobs.filter((j) => j.status === "failed" || j.status === "requires_intervention" || j.status === "partial");
  const errorSummary = new Map<string, number>();
  for (const j of errors) errorSummary.set(`${collectorShort(j.collector)} · ${j.error_code ?? j.status}`, (errorSummary.get(`${collectorShort(j.collector)} · ${j.error_code ?? j.status}`) ?? 0) + 1);

  return (
    <div className="space-y-6">
      {open || run.status === "requires_intervention" ? <AutoRefresh seconds={demoInWeb ? 3 : 8} stepUrl={(demoInWeb || viaBrightData) && open ? `/api/runs/${run.id}/step` : undefined} /> : null}
      <div className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold">Análisis del {fmtDate(run.created_at, true)}</h2>
              <StatusBadge status={run.status} />
            </div>
            <p className="text-sm text-mute">
              {run.collectors.map(collectorShort).join(", ")} · {run.repetitions} repetición(es) · {progress.total} ejecuciones
              {run.finished_at ? ` · terminó ${fmtDate(run.finished_at, true)}` : ""}
            </p>
            {run.status_detail ? <p className="mt-1 text-sm text-[#8a5a00]">{run.status_detail}</p> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`${base}?run=${run.id}`} className="btn-ghost btn-sm">Ver resultados</Link>
            <a href={`/api/runs/${run.id}/export`} className="btn-ghost btn-sm">CSV</a>
            {open || run.status === "requires_intervention" ? (
              <form action={closeAnalysisAction.bind(null, id, run.id)}>
                <button className="btn-ghost btn-sm" title="Lo pendiente pasa a fallido (cancelado) y el análisis queda parcial">Cerrar con lo obtenido</button>
              </form>
            ) : null}
          </div>
        </div>
        <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-paper">
          {ORDER.map((s) => (progress[s] ? <div key={s} style={{ width: `${(progress[s] / progress.total) * 100}%`, background: COLORS[s] }} title={`${STATUS_LABEL[s]}: ${progress[s]}`} /> : null))}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-mute">
          {ORDER.map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: COLORS[s] }} />
              {STATUS_LABEL[s]}: <strong className="text-ink">{progress[s]}</strong>
            </span>
          ))}
        </div>
        {open ? (
          <p className="mt-3 text-xs text-mute">
            {demoInWeb
              ? "Demo: las respuestas simuladas se generan desde la web mientras esta página está abierta. Si la cerrás, el análisis sigue cuando vuelvas. Los análisis reales los hace el worker y avanzan aunque cierres la pestaña."
              : `${viaBrightData ? "Estamos haciendo las preguntas en cada asistente: suele tardar unos minutos. " : ""}${needsWorker ? (online ? "El worker está procesando la cola. " : "El worker no está enviando señal: las ejecuciones de captura propia o API siguen en cola y continúan cuando vuelva. ") : ""}Podés cerrar esta pestaña; los resultados se guardan cuando vuelvas.`}
          </p>
        ) : null}
        {blocked.length ? (
          <div className="mt-3 rounded-xl border border-sol/40 bg-sol-50 px-3 py-2 text-sm text-[#6b4700]">
            {blocked.map((b) => (
              <div key={b.id}>
                <strong>{b.label}</strong> requiere intervención del operador{b.reason ? `: ${b.reason}` : ""}. Las ejecuciones de ese motor quedan en pausa (no se reintentan solas).
              </div>
            ))}
          </div>
        ) : null}
        {errorSummary.size ? (
          <div className="mt-3 text-xs text-mute">
            Errores: {[...errorSummary.entries()].map(([k, n]) => `${k} (${n})`).join(" · ")}
          </div>
        ) : null}
      </div>
      <JobsTable jobs={jobs} base={`${base}/analisis/${run.id}`} filters={sp} linkBase={base} />
      {jobs.some((j) => j.executed_at) ? <ConditionsPanel run={run} jobs={jobs} /> : null}
    </div>
  );
}
