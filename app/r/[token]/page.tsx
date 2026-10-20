import { notFound } from "next/navigation";
import { PrintButton } from "@/components/PrintButton";
import { ReportView } from "@/components/ReportView";
import { TrackView } from "@/components/Track";
import { PLANS } from "@/lib/config";
import { one } from "@/lib/db";
import { loadReport } from "@/lib/report";
import { toBrand, type Workspace } from "@/lib/types";

export const metadata = { title: "Informe de visibilidad en IA", robots: { index: false } };

export default async function Page({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ run?: string }> }) {
  const { token } = await params;
  const { run } = await searchParams;
  const row = await one("SELECT * FROM brands WHERE share_token = ?", [token]);
  if (!row) notFound();
  const brand = toBrand(row as Record<string, unknown>);
  const ws = (await one<Workspace>("SELECT * FROM workspaces WHERE id = ?", [brand.workspace_id]))!;
  const report = await loadReport(brand, run);
  if (!report) notFound();
  const white = PLANS[ws.plan]?.whiteLabel;
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <TrackView name="report_view" props={{ kind: "brand" }} />
      <div className="no-print mb-4 flex justify-end gap-2">
        <PrintButton />
        <a href={`/api/runs/${report.m.run!.id}/export?t=${encodeURIComponent(token)}`} className="btn-ghost btn-sm">CSV</a>
      </div>
      <ReportView brand={brand} report={report} agency={ws.name} linkBase={null} accent={white ? ws.brand_color : undefined} />
      <footer className="mt-10 border-t border-line pt-4 text-xs text-mute">{white ? ws.report_footer ?? `Preparado por ${ws.name}` : `Preparado por ${ws.name} con ChapaGEO`}</footer>
    </main>
  );
}
