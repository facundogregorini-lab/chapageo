import Link from "next/link";
import { Badge, Empty, EngineBadge, Highlighted, fmtDate } from "@/components/ui";
import { brandForCtx } from "@/lib/access";
import { ENGINES, type EngineId } from "@/lib/config";
import { brandMetrics } from "@/lib/metrics";

export const metadata = { title: "Respuestas" };

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ motor?: string; filtro?: string; q?: string; pregunta?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { brand } = await brandForCtx(id);
  const m = await brandMetrics(brand);
  if (!m.run) return <Empty title="Todavía no hay respuestas">Corré una medición para ver qué responde cada motor.</Empty>;

  let rows = m.responses;
  if (sp.motor) rows = rows.filter((r) => r.engine === sp.motor);
  if (sp.pregunta) rows = rows.filter((r) => r.prompt_id === sp.pregunta);
  if (sp.filtro === "sin") rows = rows.filter((r) => r.status === "ok" && !r.brand_mentioned);
  if (sp.filtro === "con") rows = rows.filter((r) => r.brand_mentioned);
  if (sp.filtro === "negativo") rows = rows.filter((r) => r.sentiment === "negativo");
  if (sp.filtro === "error") rows = rows.filter((r) => r.status === "error");
  if (sp.q) rows = rows.filter((r) => (r.answer ?? "").toLowerCase().includes(sp.q!.toLowerCase()) || r.prompt_text.toLowerCase().includes(sp.q!.toLowerCase()));

  const base = `/app/marcas/${id}/respuestas`;
  const link = (patch: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    const merged = { ...sp, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) q.set(k, v);
    return `${base}?${q.toString()}`;
  };
  const competitorNames = brand.competitors.map((c) => c.name);
  const engines = [...new Set(m.responses.map((r) => r.engine))];

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <Link href={link({ motor: undefined })} className={`btn-sm ${!sp.motor ? "btn-primary" : "btn-ghost"}`}>Todos</Link>
        {engines.map((e) => (
          <Link key={e} href={link({ motor: e })} className={`btn-sm ${sp.motor === e ? "btn-primary" : "btn-ghost"}`}>{ENGINES[e as EngineId].label}</Link>
        ))}
        <span className="mx-2 h-5 w-px bg-line" />
        {[
          [undefined, "Todas"],
          ["sin", "No te nombra"],
          ["con", "Te nombra"],
          ["negativo", "Tono negativo"],
          ["error", "Errores"],
        ].map(([v, l]) => (
          <Link key={l} href={link({ filtro: v })} className={`btn-sm ${sp.filtro === v ? "btn-primary" : "btn-ghost"}`}>{l}</Link>
        ))}
        <form className="ml-auto flex gap-2" action={base}>
          {sp.motor ? <input type="hidden" name="motor" value={sp.motor} /> : null}
          {sp.filtro ? <input type="hidden" name="filtro" value={sp.filtro} /> : null}
          <input name="q" defaultValue={sp.q} placeholder="Buscar en respuestas" className="input w-56 py-1.5" />
        </form>
      </div>
      <p className="mt-3 text-sm text-mute">
        {rows.length} respuestas del corte del {fmtDate(m.run.created_at, true)}.{" "}
        <a href={`/api/brands/${id}/export`} className="font-semibold text-ink underline">Descargar CSV completo</a>
      </p>
      <div className="mt-4 space-y-3">
        {rows.slice(0, 200).map((r) => (
          <details key={r.id} className="card group p-4">
            <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2">
              <EngineBadge engine={r.engine} simulated={!!r.simulated} />
              <span className="font-medium">«{r.prompt_text}»</span>
              <span className="text-xs text-mute">rep. {r.repetition}</span>
              <span className="ml-auto flex gap-1.5">
                {r.status === "error" ? (
                  <Badge>error</Badge>
                ) : r.brand_mentioned ? (
                  <Badge tone="ok">#{r.brand_position} de {r.mentions.length}</Badge>
                ) : (
                  <Badge tone="bad">no aparece</Badge>
                )}
                {r.own_cited ? <Badge tone="celeste">cita tu sitio</Badge> : null}
                {r.sentiment === "negativo" ? <Badge tone="bad">tono negativo</Badge> : r.sentiment === "positivo" ? <Badge tone="ok">tono positivo</Badge> : null}
              </span>
            </summary>
            <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_260px]">
              <div className="rounded-xl bg-paper p-4 text-sm leading-relaxed whitespace-pre-wrap">
                {r.status === "error" ? <span className="text-bad">{r.error}</span> : <Highlighted text={r.answer ?? ""} own={[brand.name, ...brand.aliases]} others={competitorNames} />}
              </div>
              <div className="space-y-3 text-xs">
                <div>
                  <div className="font-semibold text-mute">Marcas en orden</div>
                  <ol className="mt-1 space-y-0.5">
                    {r.mentions.length ? r.mentions.map((x) => <li key={x.name} className={x.own ? "font-bold" : ""}>{x.position}. {x.name}</li>) : <li className="text-mute">Ninguna del conjunto</li>}
                  </ol>
                </div>
                <div>
                  <div className="font-semibold text-mute">Fuentes ({r.sources.length})</div>
                  <ul className="mt-1 space-y-0.5">
                    {r.sources.slice(0, 10).map((s, i) => (
                      <li key={i} className="truncate"><a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="text-celeste-700 hover:underline">{s.domain}</a></li>
                    ))}
                  </ul>
                </div>
                <div className="text-mute">
                  {r.model} · {fmtDate(r.executed_at, true)} · {r.latency_ms ? `${(r.latency_ms / 1000).toFixed(1)} s` : ""} {r.cost_usd ? `· US$${r.cost_usd.toFixed(3)}` : ""}
                </div>
              </div>
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
