import { AuditButton } from "@/components/AuditButton";
import { SiteAuditView } from "@/components/SiteAuditView";
import { Empty, fmtDate } from "@/components/ui";
import { brandForCtx } from "@/lib/access";
import type { SiteAudit } from "@/lib/audit";
import { one, parseJson } from "@/lib/db";

export const metadata = { title: "Auditoría técnica" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { brand } = await brandForCtx(id);
  const row = await one<{ result: string; created_at: string }>(
    "SELECT result, created_at FROM audits WHERE brand_id = ? AND kind = 'crawl' ORDER BY created_at DESC LIMIT 1",
    [id],
  );
  const audit = row ? parseJson<SiteAudit | null>(row.result, null) : null;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-bold">¿Los motores pueden leer {brand.domain}?</h2>
          <p className="text-sm text-mute">Revisamos robots.txt para 14 bots de IA y lo básico de la home. {row ? `Última revisión: ${fmtDate(row.created_at, true)}.` : ""}</p>
        </div>
        <AuditButton brandId={id} label={audit ? "Volver a revisar" : "Revisar ahora"} />
      </div>
      {audit ? <SiteAuditView audit={audit} /> : <Empty title="Sin revisión todavía">Tarda unos segundos.</Empty>}
    </div>
  );
}
