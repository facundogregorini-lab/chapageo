import Link from "next/link";
import { CheckerForm } from "@/components/CheckerForm";
import { Badge, fmtDate } from "@/components/ui";
import { prospectsThisMonth } from "@/lib/access";
import { requireCtx } from "@/lib/auth";
import type { CheckerResult } from "@/lib/checker";
import { all, parseJson } from "@/lib/db";

export const metadata = { title: "Prospección" };

export default async function Page() {
  const ctx = await requireCtx();
  const used = await prospectsThisMonth(ctx.workspace.id);
  const rows = await all<{ share_token: string; domain: string; result: string; created_at: string }>(
    "SELECT share_token, domain, result, created_at FROM audits WHERE workspace_id = ? AND kind = 'prospect' ORDER BY created_at DESC LIMIT 30",
    [ctx.workspace.id],
  );
  const left = Math.max(0, ctx.plan.prospectsPerMonth - used);
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Prospección</h1>
      <p className="text-sm text-mute">
        Auditá en un minuto la visibilidad en IA de una marca que todavía no es cliente y mandale el informe con tu marca. Te quedan {left} de{" "}
        {ctx.plan.prospectsPerMonth} este mes.
      </p>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        {left > 0 ? (
          <CheckerForm endpoint="/api/prospect" resultBase="/auditoria" extra={{ mode: "prospect" }} />
        ) : (
          <div className="card p-6 text-sm">
            Usaste todas las auditorías de este mes. <Link href="/precios" className="font-semibold underline">Pasá al plan Agencia</Link> para tener 15 por mes.
          </div>
        )}
        <div className="card overflow-hidden">
          <div className="border-b border-line px-5 py-3 text-sm font-semibold">Auditorías recientes</div>
          {rows.length ? (
            <ul className="divide-y divide-line">
              {rows.map((r) => {
                const res = parseJson<CheckerResult | null>(r.result, null);
                return (
                  <li key={r.share_token} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                    <div>
                      <div className="font-semibold">{res?.brandName ?? r.domain}</div>
                      <div className="text-xs text-mute">{r.domain} · {fmtDate(r.created_at, true)}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {res ? <Badge tone={res.mentioned ? "sol" : "bad"}>{res.mentioned}/{res.total}</Badge> : null}
                      <Link href={`/auditoria/${r.share_token}`} target="_blank" className="btn-ghost btn-sm">Abrir</Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="px-5 py-8 text-center text-sm text-mute">Todavía no auditaste prospectos.</p>
          )}
        </div>
      </div>
    </div>
  );
}
