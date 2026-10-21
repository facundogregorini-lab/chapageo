import { notFound } from "next/navigation";
import { CheckerReport } from "@/components/CheckerReport";
import { LeadForm } from "@/components/LeadForm";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { TrackView } from "@/components/Track";
import { AutoRefresh } from "@/components/AutoRefresh";
import { resumeChecker, type CheckerResult } from "@/lib/checker";
import { salesWhatsapp } from "@/lib/config";
import { isEphemeralDb, one, parseJson, run } from "@/lib/db";
import type { Workspace } from "@/lib/types";

export const metadata = { title: "Resultado del análisis", robots: { index: false } };

type AuditRow = { id: string; kind: string; result: string; workspace_id: string | null };

/**
 * El checker redirige acá apenas guarda. Si la base tiene réplicas de lectura, la fila puede tardar
 * un instante en aparecer: reintentamos unos segundos antes de dar 404.
 */
async function findAudit(token: string): Promise<AuditRow | null> {
  for (let i = 0; i < 5; i++) {
    const row = await one<AuditRow>("SELECT id, kind, result, workspace_id FROM audits WHERE share_token = ? AND kind IN ('checker','prospect')", [token]);
    if (row) return row;
    await new Promise((r) => setTimeout(r, 600));
  }
  return null;
}

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const row = await findAudit(token);
  if (!row) {
    console.error("auditoria no encontrada", { token, ephemeralDb: isEphemeralDb() });
    notFound();
  }
  let r = parseJson<CheckerResult | null>(row.result, null);
  if (!r) notFound();
  if (r.pending) {
    // Bright Data seguía respondiendo cuando se armó el chequeo: probamos completarlo.
    const done = await resumeChecker(r).catch(() => null);
    if (done) {
      await run("UPDATE audits SET result = ? WHERE id = ?", [JSON.stringify(done), row.id]);
      r = done;
    }
  }
  const refresh = r.pending ? <AutoRefresh seconds={8} /> : null;
  const ws = row.kind === "prospect" && row.workspace_id ? await one<Workspace>("SELECT * FROM workspaces WHERE id = ?", [row.workspace_id]) : null;

  if (ws) {
    // Informe de prospección con la marca de la agencia
    return (
      <main className="mx-auto max-w-5xl px-4 py-10">
        <TrackView name="report_view" props={{ kind: "prospect" }} />
        {refresh}
        <header className="mb-8 flex flex-wrap items-center justify-between gap-3 border-b-4 pb-4" style={{ borderColor: ws.brand_color }}>
          <div className="flex items-center gap-3">
            {ws.logo_url ? <img src={ws.logo_url} alt={ws.name} className="h-9 w-auto" /> : null}
            <div className="text-lg font-bold">{ws.name}</div>
          </div>
          <div className="text-right text-sm text-mute">
            Visibilidad en IA de <strong className="text-ink">{r.brandName}</strong>
          </div>
        </header>
        <CheckerReport r={r} />
        <footer className="mt-10 border-t border-line pt-4 text-xs text-mute">{ws.report_footer ?? `Preparado por ${ws.name}`}</footer>
      </main>
    );
  }

  const wa = salesWhatsapp(`Hola! Hice el checker para ${r.domain} y quiero el diagnóstico completo.`);
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-4 py-12">
        {refresh}
        <div className="eyebrow">Resultado del checker</div>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">
          {r.brandName} <span className="text-mute">· {r.domain}</span>
        </h1>
        <p className="mt-2 text-mute">Rubro: {r.category}</p>
        <div className="mt-8">
          <CheckerReport r={r} />
        </div>
        <section className="card mt-10 grid gap-8 p-6 md:grid-cols-[1fr_1.1fr] md:p-8">
          <div>
            <div className="eyebrow">Siguiente paso</div>
            <h2 className="mt-2 text-2xl font-bold">Diagnóstico completo en 48 horas</h2>
            <p className="mt-2 text-sm text-mute">
              20 preguntas acordadas con vos, ChatGPT y Gemini, 3 repeticiones, comparación con 3 competidores, fuentes que pesan y 3 mejoras
              redactadas. Más una sesión de 30 minutos para revisarlo juntos.
            </p>
            <div className="mt-4 text-3xl font-bold">US$149 <span className="text-sm font-normal text-mute">pago único</span></div>
          </div>
          <LeadForm source="checker" offer="diagnostico" domain={r.domain} auditId={row.id} compact cta="Quiero el diagnóstico" whatsapp={wa} />
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
