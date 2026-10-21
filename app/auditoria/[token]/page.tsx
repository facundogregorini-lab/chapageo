import { notFound } from "next/navigation";
import { CheckerReport } from "@/components/CheckerReport";
import { LeadForm } from "@/components/LeadForm";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { TrackView } from "@/components/Track";
import { AutoRefresh } from "@/components/AutoRefresh";
import { loadCheckerAudit } from "@/lib/checker";
import { salesWhatsapp } from "@/lib/config";
import { dbFingerprint, isEphemeralDb, one } from "@/lib/db";
import type { Workspace } from "@/lib/types";

export const metadata = { title: "Resultado del análisis", robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const audit = await loadCheckerAudit(token);
  if (!audit) {
    console.error("auditoria no encontrada", { token, ephemeralDb: isEphemeralDb(), db: dbFingerprint() });
    notFound();
  }
  const row = { id: audit.id, kind: audit.kind, workspace_id: audit.workspaceId };
  const r = audit.result;
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
