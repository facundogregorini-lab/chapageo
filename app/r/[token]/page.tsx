import { notFound } from "next/navigation";
import { BrandOverview } from "@/components/BrandOverview";
import { PrintButton } from "@/components/PrintButton";
import { TrackView } from "@/components/Track";
import { Logo, fmtDate } from "@/components/ui";
import { listActions } from "@/lib/actions";
import { PLANS, countryName } from "@/lib/config";
import { one } from "@/lib/db";
import { brandMetrics, brandTrend } from "@/lib/metrics";
import { toBrand, type Workspace } from "@/lib/types";

export const metadata = { title: "Reporte de visibilidad en IA", robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const row = await one("SELECT * FROM brands WHERE share_token = ?", [token]);
  if (!row) notFound();
  const brand = toBrand(row as Record<string, unknown>);
  const ws = (await one<Workspace>("SELECT * FROM workspaces WHERE id = ?", [brand.workspace_id]))!;
  const white = PLANS[ws.plan]?.whiteLabel;
  const [m, trend, actions] = await Promise.all([brandMetrics(brand), brandTrend(brand), listActions(brand.id)]);
  const accent = white ? ws.brand_color : "#3b9fe0";
  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <TrackView name="report_view" props={{ kind: "brand" }} />
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b-4 pb-5" style={{ borderColor: accent }}>
        <div>
          {white ? (
            <div className="flex items-center gap-3">
              {ws.logo_url ? <img src={ws.logo_url} alt={ws.name} className="h-9 w-auto" /> : null}
              <span className="text-lg font-bold">{ws.name}</span>
            </div>
          ) : (
            <Logo />
          )}
          <h1 className="mt-4 text-3xl font-bold tracking-tight">Visibilidad en IA · {brand.name}</h1>
          <p className="mt-1 text-sm text-mute">
            {brand.domain} · {brand.category} · {brand.city ? `${brand.city}, ` : ""}{countryName(brand.country)} · corte del {fmtDate(m.run?.created_at, true)}
          </p>
        </div>
        <div className="no-print flex gap-2">
          <PrintButton />
          <a href={`/api/brands/${brand.id}/export?t=${token}`} className="btn-ghost btn-sm">CSV</a>
        </div>
      </header>
      <BrandOverview brand={brand} m={m} trend={trend} actions={actions.filter((a) => a.status !== "descartada")} accent={accent} publicView />
      <footer className="mt-10 border-t border-line pt-4 text-xs text-mute">
        {white ? ws.report_footer ?? `Preparado por ${ws.name}` : "Reporte generado con ChapaGEO · chapageo.lat"}
      </footer>
    </main>
  );
}
