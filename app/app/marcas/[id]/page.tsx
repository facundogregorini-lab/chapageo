import Link from "next/link";
import { AnalysisDashboard, ConditionsPanel, JobsTable } from "@/components/analysis";
import { Methodology } from "@/components/Methodology";
import { Empty, SectionTitle } from "@/components/ui";
import { brandForCtx, listRuns } from "@/lib/access";
import { loadReport } from "@/lib/report";
import { STATUS_LABEL } from "@/lib/types";
import { fmtDate } from "@/components/ui";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ run?: string; motor?: string; categoria?: string; estado?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { ctx, brand } = await brandForCtx(id);
  const runs = await listRuns(ctx.workspace.id, id, 15);
  const report = await loadReport(brand, sp.run);
  const base = `/app/marcas/${id}`;
  if (!report) {
    return (
      <Empty title="Todavía no hay análisis para este cliente">
        Revisá y aprobá las preguntas y después iniciá el primer análisis.
        <div className="mt-4 flex justify-center gap-2">
          <Link href={`${base}/preguntas`} className="btn-ghost">Revisar preguntas</Link>
          <Link href={`${base}/analisis`} className="btn-primary">Nuevo análisis</Link>
        </div>
      </Empty>
    );
  }
  const run = report.m.run!;
  return (
    <div className="space-y-6">
      <form className="no-print flex flex-wrap items-center gap-2 text-sm" action={base}>
        <label className="text-mute" htmlFor="run">Análisis</label>
        <select id="run" name="run" defaultValue={run.id} className="input w-full min-w-0 py-1.5 sm:w-auto">
          {runs.map((r) => (
            <option key={r.id} value={r.id}>
              {fmtDate(r.created_at, true)} · {STATUS_LABEL[r.status]} · {r.total} ejecuciones{r.is_demo ? " · demo" : ""}
            </option>
          ))}
        </select>
        <button className="btn-ghost btn-sm">Ver</button>
        <span className="ml-auto flex flex-wrap gap-2">
          <Link href={`${base}/analisis/${run.id}`} className="btn-ghost btn-sm">Progreso y errores</Link>
          <a href={`/api/runs/${run.id}/export`} className="btn-ghost btn-sm">CSV</a>
          <Link href={`${base}/informe?run=${run.id}`} className="btn-ghost btn-sm">Informe imprimible</Link>
        </span>
      </form>
      <AnalysisDashboard brand={brand} m={report.m} opp={report.opp} previous={report.previous} linkBase={base} />
      <ConditionsPanel run={run} jobs={report.m.jobs} />
      <div>
        <SectionTitle title="Preguntas y ejecuciones">Cada fila es una pregunta × motor × repetición con su propio estado.</SectionTitle>
        <JobsTable jobs={report.m.jobs} base={base} filters={{ run: sp.run, motor: sp.motor, categoria: sp.categoria, estado: sp.estado }} linkBase={base} />
      </div>
      <Methodology />
    </div>
  );
}
