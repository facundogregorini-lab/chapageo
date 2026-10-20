import Link from "next/link";
import { StatusBadge } from "@/components/analysis";
import { Badge, Empty, fmtDate } from "@/components/ui";
import { workspaceBrands } from "@/lib/access";
import { requireCtx } from "@/lib/auth";
import { countryName } from "@/lib/config";
import { analysisMetrics, headlineSlice, latestRun, pct } from "@/lib/metrics";
import { collectorAvailability, workers } from "@/lib/queue";

export const metadata = { title: "Clientes" };

const AVAIL_TONE = { available: "ok", unverified: "neutral", requires_intervention: "sol", unavailable: "bad", not_configured: "neutral" } as const;
const AVAIL_TEXT = { available: "disponible", unverified: "sin verificar", requires_intervention: "requiere intervención", unavailable: "no disponible", not_configured: "no habilitado" } as const;

export default async function Clientes() {
  const ctx = await requireCtx();
  const isDemo = Number(ctx.workspace.is_demo ?? 0) === 1;
  const [brands, ws, avail] = await Promise.all([workspaceBrands(ctx.workspace.id), workers(), collectorAvailability(isDemo)]);
  const rows = await Promise.all(
    brands.map(async (b) => {
      const last = await latestRun(ctx.workspace.id, b.id);
      const done = await latestRun(ctx.workspace.id, b.id, { terminalOnly: true });
      const m = done ? await analysisMetrics(b, done) : null;
      return { b, last, done, disc: m ? headlineSlice(m, "descubrimiento") : null, coverage: m?.coverage ?? null };
    }),
  );
  const online = ws.filter((w) => w.online);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Clientes</h1>
          <p className="text-sm text-mute">{brands.length} cliente{brands.length === 1 ? "" : "s"} de {ctx.workspace.name}</p>
        </div>
        <Link href="/app/marcas/nueva" className="btn-primary">+ Nuevo cliente</Link>
      </div>

      <div className="card p-4 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">Recolección:</span>
          {online.length ? <Badge tone="ok">worker activo · señal {fmtDate(online[0].heartbeat_at, true)}</Badge> : <Badge tone="sol">worker sin señal: los análisis quedan en cola</Badge>}
          {avail.map((a) => (
            <Badge key={a.id} tone={AVAIL_TONE[a.status]} title={a.reason ?? undefined}>
              {a.label}: {AVAIL_TEXT[a.status]}
            </Badge>
          ))}
        </div>
      </div>

      {brands.length === 0 ? (
        <Empty title="Todavía no cargaste clientes">
          Cargá el sitio, la categoría y hasta tres competidores: te sugerimos preguntas, las aprobás y lanzás el análisis.
          <div className="mt-4">
            <Link href="/app/marcas/nueva" className="btn-primary">Cargar el primer cliente</Link>
          </div>
        </Empty>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-paper text-left text-xs font-semibold text-mute">
              <tr>
                <th className="px-5 py-3">Cliente</th>
                <th className="px-3 py-3">Último análisis</th>
                <th className="px-3 py-3">Presencia en descubrimiento</th>
                <th className="px-3 py-3">Cobertura</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ b, last, done, disc, coverage }) => (
                <tr key={b.id} className="border-t border-line hover:bg-paper/50">
                  <td className="px-5 py-4">
                    <Link href={`/app/marcas/${b.id}`} className="font-semibold hover:underline">{b.name}</Link>
                    <div className="text-xs text-mute">{b.domain} · {countryName(b.country)}</div>
                  </td>
                  <td className="px-3 py-4">
                    {last ? (
                      <div className="space-y-1">
                        <StatusBadge status={last.status} />
                        <div className="text-xs text-mute">{fmtDate(last.created_at, true)}</div>
                      </div>
                    ) : (
                      <span className="text-mute">Sin análisis</span>
                    )}
                  </td>
                  <td className="px-3 py-4">
                    {disc && disc.valid ? (
                      <>
                        <div className="font-semibold">{pct(disc.own.presence.rate)}</div>
                        <div className="text-xs text-mute">{disc.own.presence.num}/{disc.own.presence.den} válidas{done && done.id !== last?.id ? ` · análisis del ${fmtDate(done.created_at)}` : ""}</div>
                      </>
                    ) : (
                      <span className="text-mute">—</span>
                    )}
                  </td>
                  <td className="px-3 py-4 text-xs text-mute">{coverage ? `${coverage.num}/${coverage.den}` : "—"}</td>
                  <td className="px-5 py-4 text-right">
                    <Link href={`/app/marcas/${b.id}`} className="btn-ghost btn-sm">Abrir</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
