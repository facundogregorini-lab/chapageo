import Link from "next/link";
import { notFound } from "next/navigation";
import { LOCATION_LABEL, MethodBadge, StatusBadge } from "@/components/analysis";
import { Markdown } from "@/components/Markdown";
import { Badge, fmtDate } from "@/components/ui";
import { brandForCtx, getJobInWorkspace } from "@/lib/access";
import { collectorShort } from "@/lib/collectors/registry";
import { countryName } from "@/lib/config";
import { parseJson } from "@/lib/db";
import { CATEGORY_LABEL } from "@/lib/types";

export const metadata = { title: "Respuesta" };

export default async function Page({ params }: { params: Promise<{ id: string; jobId: string }> }) {
  const { id, jobId } = await params;
  const { ctx, brand } = await brandForCtx(id);
  const job = await getJobInWorkspace(ctx.workspace.id, jobId);
  if (!job || job.brand_id !== brand.id) notFound();
  const cond = parseJson<Record<string, unknown>>((job as unknown as { conditions?: string }).conditions, {});
  const base = `/app/marcas/${id}`;
  return (
    <div className="space-y-5">
      <Link href={`${base}/analisis/${job.run_id}`} className="text-sm text-mute hover:text-ink">← Volver al análisis</Link>
      <div className="card p-5">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={job.status} />
          <MethodBadge method={job.collection_method} />
          <Badge>{collectorShort(job.collector)}</Badge>
          <Badge>{CATEGORY_LABEL[job.prompt_category]}</Badge>
          <span className="text-xs text-mute">repetición {job.repetition} · intento {job.attempts}/{job.max_attempts}</span>
        </div>
        <h2 className="mt-3 text-lg font-bold">«{job.prompt_text}»</h2>
        <dl className="mt-3 grid gap-x-6 gap-y-1 text-xs text-mute sm:grid-cols-3">
          <div>Capturado: <span className="text-ink">{fmtDate(job.executed_at, true)}</span></div>
          <div>Duración: <span className="text-ink">{job.latency_ms ? `${(job.latency_ms / 1000).toFixed(1)} s` : "—"}</span></div>
          <div>Modelo visible: <span className="text-ink">{job.model ?? "no observable"}</span></div>
          <div>País solicitado: <span className="text-ink">{countryName(job.country ?? "AR")}</span></div>
          <div>Ubicación de ejecución: <span className="text-ink">{job.observed_country ? `${job.observed_country} · ` : ""}{LOCATION_LABEL[job.location_verification ?? ""] ?? "no registrada"}</span></div>
          <div>Idioma: <span className="text-ink">{job.language}</span></div>
          <div>Sesión: <span className="text-ink">{job.session_type ?? "—"}</span></div>
          <div>Modo de búsqueda: <span className="text-ink">{job.search_mode ?? "—"}</span></div>
          <div>Costo estimado: <span className="text-ink">{job.cost_usd ? `US$${job.cost_usd.toFixed(4)}` : "—"}</span></div>
        </dl>
        {job.error ? <p className="mt-3 rounded-xl bg-bad-50 px-3 py-2 text-sm text-bad">{job.error_code ? `${job.error_code}: ` : ""}{job.error}</p> : null}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <div className="card min-w-0 p-5">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-semibold">Respuesta original</h3>
            <span className="text-xs text-mute">Contenido externo: se muestra como texto, sin ejecutar nada.</span>
          </div>
          {job.answer ? (
            <>
              <Markdown text={job.answer} />
              <details className="mt-4">
                <summary className="cursor-pointer text-xs font-semibold text-mute">Ver texto plano exacto guardado</summary>
                <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap rounded-xl bg-paper p-3 text-xs">{job.answer}</pre>
              </details>
            </>
          ) : (
            <p className="text-sm text-mute">No hay texto de respuesta para esta ejecución.</p>
          )}
        </div>
        <div className="space-y-5">
          <div className="card p-5 text-sm">
            <h3 className="font-semibold">Marcas detectadas</h3>
            {job.mentions.length ? (
              <ul className="mt-2 space-y-2">
                {job.mentions.map((m) => (
                  <li key={m.name}>
                    <div className={m.own ? "font-bold" : "font-medium"}>
                      {m.position}º en orden de mención · {m.name}
                      {m.explicitRank != null ? <span className="text-xs text-mute"> · puesto #{m.explicitRank} en lista numerada</span> : null}
                    </div>
                    <div className="text-xs text-mute">«{m.snippet}»</div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-mute">{job.answer ? "Ninguna de las marcas seguidas." : "—"}</p>
            )}
          </div>
          <div className="card p-5 text-sm">
            <h3 className="font-semibold">Fuentes y enlaces ({job.sources.length})</h3>
            {job.sources.length ? (
              <ol className="mt-2 list-decimal space-y-1 pl-5">
                {job.sources.map((s) => (
                  <li key={s.url} className="break-all">
                    <a href={s.url} target="_blank" rel="noopener noreferrer nofollow ugc" className="text-celeste-700 hover:underline">{s.title || s.domain}</a>
                    <div className="text-xs text-mute">{s.url}</div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-1 text-mute">La respuesta no incluyó enlaces.</p>
            )}
            <p className="mt-2 text-xs text-mute">Enlaza al dominio del cliente: <strong className="text-ink">{job.own_cited ? "sí" : "no"}</strong></p>
          </div>
        </div>
      </div>

      <div className="card p-5">
        <h3 className="font-semibold">Evidencia visual</h3>
        {job.screenshot_id ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/evidence/${job.screenshot_id}`} alt="Captura de pantalla de la respuesta" className="mt-3 max-w-full rounded-xl border border-line" />
        ) : (
          <p className="mt-1 text-sm text-mute">
            {job.collection_method === "web_capture" ? "No se guardó captura para esta ejecución." : "No aplica: no es una captura de interfaz web."}
          </p>
        )}
      </div>

      <details className="card p-5 text-xs">
        <summary className="cursor-pointer font-semibold">Condiciones registradas (JSON)</summary>
        <pre className="mt-2 overflow-auto rounded-xl bg-paper p-3">{JSON.stringify(cond, null, 2)}</pre>
      </details>
    </div>
  );
}
