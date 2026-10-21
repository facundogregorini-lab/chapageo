import { randomUUID } from "node:crypto";
import Link from "next/link";
import { StatusBadge } from "@/components/analysis";
import { NewAnalysisForm } from "@/components/NewAnalysisForm";
import { fmtDate } from "@/components/ui";
import { brandForCtx, listRuns } from "@/lib/access";
import { collectorShort } from "@/lib/collectors/registry";
import { workerEnabled } from "@/lib/config";
import { analysisCaps } from "@/lib/billing";
import { LIMITS } from "@/lib/limits";
import { approvedPrompts, collectorAvailability, workers } from "@/lib/queue";

export const metadata = { title: "Análisis" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx, brand } = await brandForCtx(id);
  const isDemo = Number(ctx.workspace.is_demo ?? 0) === 1;
  const [runs, options, prompts, ws] = await Promise.all([listRuns(ctx.workspace.id, id, 30), collectorAvailability(isDemo), approvedPrompts(id), workers()]);
  const base = `/app/marcas/${id}`;
  const caps = analysisCaps(ctx);
  return (
    <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
      <div className="space-y-3">
        <h2 className="text-lg font-bold">Nuevo análisis para {brand.name}</h2>
        <NewAnalysisForm
          brandId={id}
          options={options}
          approved={prompts.length}
          maxExecutions={LIMITS.maxExecutionsPerAnalysis}
          maxReps={caps.maxReps}
          maxEngines={caps.maxEngines}
          planName={caps.planName}
          minPrompts={LIMITS.minPrompts}
          maxPrompts={caps.maxPrompts}
          promptsHref={`${base}/preguntas`}
          anyWorkerOnline={isDemo || ws.some((w) => w.online)}
          showWorker={!isDemo && workerEnabled()}
          idem={randomUUID()}
        />
        <p className="text-xs text-mute">
          ¿Querés cambiar las preguntas? <Link href={`${base}/preguntas`} className="font-semibold underline">Editalas y aprobalas acá</Link>.
        </p>
      </div>
      <div className="card h-fit overflow-hidden">
        <div className="border-b border-line px-5 py-3 text-sm font-semibold">Análisis anteriores</div>
        {runs.length ? (
          <ul className="divide-y divide-line">
            {runs.map((r) => (
              <li key={r.id}>
                <Link href={`${base}/analisis/${r.id}`} className="flex items-center justify-between gap-3 px-5 py-3 text-sm hover:bg-paper">
                  <div>
                    <div className="font-semibold">{fmtDate(r.created_at, true)}</div>
                    <div className="text-xs text-mute">
                      {r.collectors.map(collectorShort).join(", ") || "—"} · {r.done_count}/{r.total} válidas
                    </div>
                  </div>
                  <StatusBadge status={r.status} />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 py-8 text-center text-sm text-mute">Todavía no hay análisis.</p>
        )}
      </div>
    </div>
  );
}
