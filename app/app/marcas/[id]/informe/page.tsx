import { headers } from "next/headers";
import Link from "next/link";
import { rotateShareToken } from "@/app/app/marcas/actions";
import { CopyField } from "@/components/CopyField";
import { PrintButton } from "@/components/PrintButton";
import { ReportView } from "@/components/ReportView";
import { Empty } from "@/components/ui";
import { brandForCtx } from "@/lib/access";
import { loadReport } from "@/lib/report";

export const metadata = { title: "Informe" };

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ run?: string }> }) {
  const { id } = await params;
  const { run } = await searchParams;
  const { ctx, brand } = await brandForCtx(id);
  const report = await loadReport(brand, run);
  if (!report) return <Empty title="Todavía no hay un análisis para informar" />;
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const share = `${origin}/r/${brand.share_token}?run=${report.m.run!.id}`;
  return (
    <div className="space-y-6">
      <div className="no-print card space-y-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-bold">Compartir con el cliente</h2>
          <div className="flex flex-wrap gap-2">
            <PrintButton />
            <a href={`/api/runs/${report.m.run!.id}/export`} className="btn-ghost btn-sm">Descargar CSV</a>
            <form action={rotateShareToken.bind(null, id)}>
              <button className="btn-ghost btn-sm">Revocar link y generar otro</button>
            </form>
          </div>
        </div>
        <p className="text-sm text-mute">El link privado muestra este informe sin acceso al panel ni a las capturas. Para PDF usá «Imprimir» y «Guardar como PDF».</p>
        <CopyField value={share} />
        <Link href={`/r/${brand.share_token}?run=${report.m.run!.id}`} target="_blank" className="text-sm font-semibold underline">Abrir vista pública</Link>
      </div>
      <ReportView brand={brand} report={report} agency={ctx.workspace.name} linkBase={`/app/marcas/${id}`} />
    </div>
  );
}
