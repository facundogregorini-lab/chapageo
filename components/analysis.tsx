import Link from "next/link";
import { COLLECTORS, collectorShort, isCollectorId, METHOD_LABEL } from "@/lib/collectors/registry";
import { countryName } from "@/lib/config";
import { headlineSlice, isValid, pct, slice, sliceLabel, type AnalysisMetrics, type Ratio, type SliceMetrics } from "@/lib/metrics";
import type { OpportunityReport } from "@/lib/opportunities";
import { CATEGORY_LABEL, STATUS_LABEL, type Brand, type JobStatus, type PromptCategory, type ResponseRow, type Run } from "@/lib/types";
import { Badge, Bar, SectionTitle, fmtDate } from "./ui";

const STATUS_TONE: Record<JobStatus, "neutral" | "ok" | "bad" | "sol" | "celeste"> = {
  pending: "neutral",
  running: "celeste",
  completed: "ok",
  partial: "sol",
  failed: "bad",
  requires_intervention: "sol",
};

export function StatusBadge({ status }: { status: JobStatus }) {
  return <Badge tone={STATUS_TONE[status] ?? "neutral"}>{STATUS_LABEL[status] ?? status}</Badge>;
}

export function MethodBadge({ method }: { method: string }) {
  if (method === "demo") return <Badge tone="sol">Demo · simulado</Badge>;
  if (method === "official_api") return <Badge tone="neutral">API oficial</Badge>;
  if (method === "web_capture") return <Badge tone="celeste">Captura web</Badge>;
  return <Badge>{method}</Badge>;
}

export function RatioText({ r, unit = "respuestas válidas" }: { r: Ratio; unit?: string }) {
  return (
    <span className="text-xs text-mute">
      {r.num} de {r.den} {unit}
    </span>
  );
}

export const LOCATION_LABEL: Record<string, string> = {
  verificada: "verificada",
  declarada_por_operador: "declarada por el operador (no verificada)",
  no_verificada: "desconocida / no verificada",
  no_aplica: "no aplica (API o demo)",
};
const SESSION_LABEL: Record<string, string> = { autenticada: "sesión iniciada", publica: "sin sesión (pública)", api: "API", simulada: "simulada" };
const SEARCH_LABEL: Record<string, string> = {
  busqueda_web_observada: "búsqueda web observada",
  sin_busqueda_observada: "sin búsqueda observada",
  api_web_search: "herramienta de búsqueda de la API",
  no_observable: "no observable",
  simulado: "simulado",
};

function tally(values: (string | null | undefined)[], labels: Record<string, string> = {}) {
  const m = new Map<string, number>();
  for (const v of values) {
    const k = v ? labels[v] ?? v : "sin dato";
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].map(([k, n]) => `${k} (${n})`).join(", ") || "—";
}

/** Condiciones de captura registradas: es una muestra bajo estas condiciones, no la experiencia de cada usuario. */
export function ConditionsPanel({ run, jobs }: { run: Run; jobs: ResponseRow[] }) {
  const done = jobs.filter((j) => j.executed_at);
  const dates = done.map((j) => j.executed_at!).sort();
  return (
    <div className="card p-5">
      <SectionTitle title="Condiciones de captura">Lo que se registró al ejecutar. Los resultados son una muestra obtenida bajo estas condiciones.</SectionTitle>
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <Cond label="Método">{[...new Set(jobs.map((j) => METHOD_LABEL[j.collection_method as keyof typeof METHOD_LABEL] ?? j.collection_method))].join(" · ")}</Cond>
        <Cond label="Motores">{run.collectors.map(collectorShort).join(", ")}</Cond>
        <Cond label="País solicitado">{countryName(run.requested_country)} (para quién son las preguntas)</Cond>
        <Cond label="Ubicación de ejecución">{tally(done.map((j) => (j.observed_country ? `${j.observed_country} · ${LOCATION_LABEL[j.location_verification ?? ""] ?? j.location_verification}` : LOCATION_LABEL[j.location_verification ?? ""] ?? j.location_verification)))}</Cond>
        <Cond label="Idioma">{run.language}</Cond>
        <Cond label="Sesión">{tally(done.map((j) => j.session_type), SESSION_LABEL)}</Cond>
        <Cond label="Modo de búsqueda">{tally(done.map((j) => j.search_mode), SEARCH_LABEL)}</Cond>
        <Cond label="Modelo visible">{tally(done.map((j) => j.model))}</Cond>
        <Cond label="Repeticiones">{run.repetitions} por pregunta y motor</Cond>
        <Cond label="Período">{dates.length ? `${fmtDate(dates[0], true)} → ${fmtDate(dates[dates.length - 1], true)}` : "—"}</Cond>
      </dl>
      <p className="mt-3 text-xs text-mute">
        Escribir «Argentina» en una pregunta, el idioma o la zona horaria del navegador no prueban que la consulta saliera desde Argentina. Las respuestas
        pueden variar según la cuenta, el historial y el momento; no reproducimos la personalización de cada usuario.
      </p>
    </div>
  );
}

function Cond({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold text-mute">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function PresenceCell({ s }: { s?: SliceMetrics }) {
  if (!s) return <span className="text-mute">—</span>;
  if (!s.valid) return <span className="text-xs text-mute">sin válidas ({s.requested})</span>;
  return (
    <div>
      <div className="font-semibold">{pct(s.own.presence.rate)}</div>
      <RatioText r={s.own.presence} unit="válidas" />
      {s.valid < s.requested ? <div className="text-[11px] text-[#8a5a00]">cobertura {s.valid}/{s.requested}</div> : null}
    </div>
  );
}

function BrandTable({ s, accent }: { s: SliceMetrics; accent: string }) {
  const anyRank = s.brands.some((b) => b.ranked > 0);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm">
        <thead className="text-left text-xs text-mute">
          <tr>
            <th className="py-2 pr-3 font-semibold">Marca</th>
            <th className="py-2 pr-3 font-semibold">Presencia</th>
            <th className="py-2 pr-3 font-semibold">Cuota de menciones</th>
            <th className="py-2 pr-3 font-semibold">Enlaza a su dominio</th>
            <th className="py-2 pr-3 font-semibold" title="Promedio del orden en que se nombra entre las marcas seguidas. No es un ranking.">Orden de mención</th>
            {anyRank ? <th className="py-2 font-semibold" title="Solo cuando la respuesta trae una lista numerada.">Puesto en lista numerada</th> : null}
          </tr>
        </thead>
        <tbody>
          {s.brands.map((b) => (
            <tr key={b.name} className="border-t border-line align-top">
              <td className={`py-2.5 pr-3 ${b.own ? "font-bold" : ""}`}>{b.name}{b.own ? " (cliente)" : ""}</td>
              <td className="py-2.5 pr-3">
                <div className="flex items-center gap-2">
                  <span className="w-10 font-semibold">{pct(b.presence.rate)}</span>
                  <Bar value={b.presence.rate} color={b.own ? accent : "#cbd5e1"} className="w-24" />
                </div>
                <RatioText r={b.presence} unit="" />
              </td>
              <td className="py-2.5 pr-3">
                <div className="font-semibold">{pct(b.share.rate)}</div>
                <RatioText r={b.share} unit="menciones" />
              </td>
              <td className="py-2.5 pr-3">
                {b.domain ? (
                  <>
                    <div className="font-semibold">{pct(b.citation.rate)}</div>
                    <RatioText r={b.citation} unit="" />
                  </>
                ) : (
                  <span className="text-xs text-mute">sin dominio</span>
                )}
              </td>
              <td className="py-2.5 pr-3">{b.avgOrder != null ? `${b.avgOrder}º` : "—"}</td>
              {anyRank ? <td className="py-2.5">{b.avgRank != null ? `#${b.avgRank} (en ${b.ranked})` : "—"}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AnalysisDashboard({
  brand,
  m,
  opp,
  previous,
  linkBase,
  accent = "var(--color-celeste)",
}: {
  brand: Brand;
  m: AnalysisMetrics;
  opp: OpportunityReport;
  previous: { run: Run; discovery: Ratio | null }[];
  /** Base para enlazar el detalle de cada ejecución (null en la vista pública). */
  linkBase: string | null;
  accent?: string;
}) {
  const run = m.run!;
  const disc = headlineSlice(m, "descubrimiento");
  const isDemo = m.methods.includes("demo");
  const cols = m.collectors.length > 1 ? ["todos", ...m.collectors] : m.collectors;
  const jobLink = (id: string) => (linkBase ? `${linkBase}/respuestas/${id}` : null);
  const validTotal = m.jobs.filter(isValid).length;

  return (
    <div className="space-y-6">
      {isDemo ? (
        <div className="rounded-xl border border-sol/40 bg-sol-50 px-4 py-3 text-sm text-[#6b4700]">
          <strong>Datos simulados de demostración.</strong> Sirven para recorrer el producto; no son mediciones reales de ningún asistente.
        </div>
      ) : null}
      {run.status !== "completed" ? (
        <div className="rounded-xl border border-line bg-white px-4 py-3 text-sm">
          Estado del análisis: <StatusBadge status={run.status} /> {run.status_detail ? <span className="text-mute">· {run.status_detail}</span> : null}
          {m.coverage.rate < 1 ? <span className="text-mute"> · Las métricas usan solo las {m.valid} ejecuciones válidas de {m.requested}.</span> : null}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Presencia en descubrimiento"
          value={disc && disc.valid ? pct(disc.own.presence.rate) : "—"}
          sub={disc ? <RatioText r={disc.own.presence} /> : "Sin preguntas de descubrimiento"}
          hint={m.collectors.length > 1 ? "Todos los motores; cada respuesta válida pesa igual." : sliceLabel(m.collectors[0] ?? "")}
        />
        <Kpi
          label="Cuota de menciones (descubrimiento)"
          value={disc && disc.own.share.den ? pct(disc.own.share.rate) : "—"}
          sub={disc ? <RatioText r={disc.own.share} unit="menciones de marcas seguidas" /> : null}
          hint="Cada marca cuenta una vez por respuesta."
        />
        <Kpi
          label="Citaciones al dominio (descubrimiento)"
          value={disc && disc.valid ? pct(disc.own.citation.rate) : "—"}
          sub={disc ? <RatioText r={disc.own.citation} /> : null}
          hint={`Respuestas que enlazan a ${brand.domain}.`}
        />
        <Kpi label="Cobertura" value={pct(m.coverage.rate)} sub={<RatioText r={m.coverage} unit="ejecuciones válidas" />} hint="Errores y bloqueos no cuentan como ausencia." />
      </div>

      <div className="card p-5">
        <SectionTitle title="Presencia de la marca por motor y tipo de pregunta">
          Respuestas válidas que mencionan a {brand.name} / respuestas válidas. Los tipos de pregunta no se mezclan.
        </SectionTitle>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="text-left text-xs text-mute">
              <tr>
                <th className="py-2 pr-3 font-semibold">Tipo de pregunta</th>
                {cols.map((c) => (
                  <th key={c} className="py-2 pr-3 font-semibold">{sliceLabel(c)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {m.categories.map((cat) => (
                <tr key={cat} className="border-t border-line align-top">
                  <td className="py-2.5 pr-3 font-medium">
                    {CATEGORY_LABEL[cat]}
                    {cat === "marca" ? <div className="text-[11px] font-normal text-mute">Sesgada: la pregunta nombra a la marca.</div> : null}
                  </td>
                  {cols.map((c) => (
                    <td key={c} className="py-2.5 pr-3"><PresenceCell s={slice(m, cat, c)} /></td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card p-5">
        <SectionTitle title="Comparación con competidores">Mismo cálculo para cada marca seguida, separado por tipo de pregunta.</SectionTitle>
        <div className="space-y-6">
          {m.categories.filter((c) => c !== "marca").map((cat) => {
            const s = headlineSlice(m, cat);
            return s ? (
              <div key={cat}>
                <div className="mb-1 text-sm font-semibold">
                  {CATEGORY_LABEL[cat]} · {sliceLabel(s.collector)} <span className="font-normal text-mute">· {s.valid} respuestas válidas</span>
                </div>
                <BrandTable s={s} accent={accent} />
              </div>
            ) : null;
          })}
        </div>
        {m.otherBrands.length ? (
          <div className="mt-5 border-t border-line pt-4">
            <div className="text-xs font-semibold text-mute">Otras marcas nombradas en listas que no se siguen (detección automática, revisar)</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {m.otherBrands.map((o) => (
                <Badge key={o.name}>{o.name} · {o.count}</Badge>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {previous.length ? (
        <div className="card p-5">
          <SectionTitle title="Comparación con análisis anteriores comparables">Mismas preguntas y mismos motores. Presencia en descubrimiento.</SectionTitle>
          <ul className="space-y-1 text-sm">
            <li className="flex justify-between gap-3">
              <span className="font-semibold">Este análisis · {fmtDate(run.created_at, true)}</span>
              <span>{disc ? `${pct(disc.own.presence.rate)} (${disc.own.presence.num}/${disc.own.presence.den})` : "—"}</span>
            </li>
            {previous.map((p) => (
              <li key={p.run.id} className="flex justify-between gap-3 text-mute">
                <span>{linkBase ? <Link className="underline" href={`${linkBase}?run=${p.run.id}`}>{fmtDate(p.run.created_at, true)}</Link> : fmtDate(p.run.created_at, true)}</span>
                <span>{p.discovery ? `${pct(p.discovery.rate)} (${p.discovery.num}/${p.discovery.den})` : "—"}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-mute">Diferencias chicas con muestras chicas pueden ser variación normal de las respuestas.</p>
        </div>
      ) : (
        <p className="text-xs text-mute">No hay análisis anteriores comparables (mismas preguntas y motores): no mostramos tendencia.</p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <SectionTitle title="Fuentes más citadas">Dominios enlazados en respuestas válidas ({validTotal}). Cada dominio cuenta una vez por respuesta.</SectionTitle>
          {m.sources.length ? (
            <ul className="divide-y divide-line text-sm">
              {m.sources.slice(0, 12).map((s) => (
                <li key={s.domain} className="py-2">
                  <details>
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
                      <span className="truncate">{s.domain} <span className="text-xs text-mute">· {s.cls}</span></span>
                      <span className="shrink-0 text-xs text-mute">{s.responses} resp.</span>
                    </summary>
                    <ul className="mt-1 space-y-0.5 pl-3 text-xs">
                      {s.urls.slice(0, 8).map((u) => (
                        <li key={u.url} className="truncate">
                          <a href={u.url} target="_blank" rel="noopener noreferrer nofollow ugc" className="text-celeste-700 hover:underline">{u.url}</a> · {u.count}
                        </li>
                      ))}
                    </ul>
                  </details>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-mute">Las respuestas válidas no incluyeron enlaces.</p>
          )}
        </div>
        <div className="card p-5">
          <SectionTitle title="Tres oportunidades de mejora">Derivadas de la evidencia de este análisis. No garantizan cambios de visibilidad.</SectionTitle>
          {opp.items.length ? (
            <ol className="space-y-4 text-sm">
              {opp.items.map((o, i) => (
                <li key={o.id}>
                  <div className="font-semibold">{i + 1}. {o.title}</div>
                  <div className="mt-0.5"><span className="text-mute">Observado:</span> {o.observed}</div>
                  <div className="mt-0.5"><span className="text-mute">Qué probar:</span> {o.suggestion}</div>
                  <div className="mt-1 flex flex-wrap gap-1 text-xs">
                    <span className="text-mute">Evidencia:</span>
                    {o.jobIds.slice(0, 6).map((jid, k) => {
                      const href = jobLink(jid);
                      return href ? (
                        <Link key={jid} href={href} className="rounded-full border border-line px-2 text-celeste-700 hover:border-celeste">resp. {k + 1}</Link>
                      ) : (
                        <span key={jid} className="rounded-full border border-line px-2">resp. {k + 1}</span>
                      );
                    })}
                    {o.jobIds.length > 6 ? <span className="text-mute">+{o.jobIds.length - 6}</span> : null}
                  </div>
                </li>
              ))}
            </ol>
          ) : null}
          {opp.note ? <p className="mt-3 text-xs text-mute">{opp.note}</p> : null}
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, hint }: { label: string; value: string; sub?: React.ReactNode; hint?: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-semibold text-mute">{label}</div>
      <div className="mt-1 text-3xl font-bold tracking-tight">{value}</div>
      {sub ? <div className="mt-0.5">{sub}</div> : null}
      {hint ? <div className="mt-1 text-[11px] text-mute">{hint}</div> : null}
    </div>
  );
}

export const FILTER_KEYS = ["motor", "categoria", "estado"] as const;

/** Tabla de ejecuciones con filtros por motor, tipo de pregunta y estado (vía query string). */
export function JobsTable({
  jobs,
  base,
  filters,
  linkBase,
}: {
  jobs: ResponseRow[];
  base: string;
  /** motor / categoria / estado filtran; cualquier otra clave (ej. run) se conserva en los links. */
  filters: { motor?: string; categoria?: string; estado?: string; [k: string]: string | undefined };
  linkBase: string | null;
}) {
  let rows = jobs;
  if (filters.motor) rows = rows.filter((r) => r.collector === filters.motor);
  if (filters.categoria) rows = rows.filter((r) => r.prompt_category === filters.categoria);
  if (filters.estado) rows = rows.filter((r) => r.status === filters.estado);
  const href = (patch: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...filters, ...patch })) if (v) q.set(k, v);
    const s = q.toString();
    return s ? `${base}?${s}` : base;
  };
  const collectors = [...new Set(jobs.map((j) => j.collector))];
  const statuses = [...new Set(jobs.map((j) => j.status))];
  const cats = [...new Set(jobs.map((j) => j.prompt_category))] as PromptCategory[];
  const chip = (active: boolean) => `btn-sm ${active ? "btn-primary" : "btn-ghost"}`;
  return (
    <div className="card overflow-hidden">
      <div className="space-y-2 border-b border-line p-4 text-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="w-16 font-semibold text-mute">Motor</span>
          <Link scroll={false} href={href({ motor: undefined })} className={chip(!filters.motor)}>Todos</Link>
          {collectors.map((c) => (
            <Link scroll={false} key={c} href={href({ motor: c })} className={chip(filters.motor === c)}>{collectorShort(c)}</Link>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="w-16 font-semibold text-mute">Tipo</span>
          <Link scroll={false} href={href({ categoria: undefined })} className={chip(!filters.categoria)}>Todos</Link>
          {cats.map((c) => (
            <Link scroll={false} key={c} href={href({ categoria: c })} className={chip(filters.categoria === c)}>{CATEGORY_LABEL[c]}</Link>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="w-16 font-semibold text-mute">Estado</span>
          <Link scroll={false} href={href({ estado: undefined })} className={chip(!filters.estado)}>Todos</Link>
          {statuses.map((s) => (
            <Link scroll={false} key={s} href={href({ estado: s })} className={chip(filters.estado === s)}>{STATUS_LABEL[s]} ({jobs.filter((j) => j.status === s).length})</Link>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-paper text-left text-xs text-mute">
            <tr>
              <th className="px-4 py-2.5 font-semibold">Pregunta</th>
              <th className="px-3 py-2.5 font-semibold">Motor</th>
              <th className="px-3 py-2.5 font-semibold">Rep.</th>
              <th className="px-3 py-2.5 font-semibold">Estado</th>
              <th className="px-3 py-2.5 font-semibold">Resultado</th>
              <th className="px-4 py-2.5 font-semibold"></th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 400).map((r) => (
              <tr key={r.id} className="border-t border-line align-top">
                <td className="px-4 py-2.5">
                  <div>{r.prompt_text}</div>
                  <div className="text-[11px] text-mute">{CATEGORY_LABEL[r.prompt_category]}</div>
                </td>
                <td className="px-3 py-2.5 text-xs">{collectorShort(r.collector)}</td>
                <td className="px-3 py-2.5 text-xs">{r.repetition}</td>
                <td className="px-3 py-2.5">
                  <StatusBadge status={r.status} />
                  {r.attempts > 1 ? <div className="text-[11px] text-mute">intento {r.attempts}/{r.max_attempts}</div> : null}
                </td>
                <td className="px-3 py-2.5 text-xs">
                  {isValid(r) ? (
                    <div className="flex flex-wrap gap-1">
                      {r.brand_mentioned ? <Badge tone="ok">menciona a la marca</Badge> : <Badge tone="bad">no la menciona</Badge>}
                      {r.own_cited ? <Badge tone="celeste">enlaza al sitio</Badge> : null}
                      <span className="text-mute">{r.sources.length} fuentes</span>
                    </div>
                  ) : r.error ? (
                    <span className="text-mute" title={r.error}>{r.error_code ? `${r.error_code}: ` : ""}{r.error.slice(0, 90)}</span>
                  ) : (
                    <span className="text-mute">—</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right">
                  {linkBase && (r.answer || r.error || r.screenshot_id) ? (
                    <Link href={`${linkBase}/respuestas/${r.id}`} className="text-xs font-semibold text-celeste-700 hover:underline">Ver</Link>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length ? <p className="px-4 py-8 text-center text-sm text-mute">No hay ejecuciones con estos filtros.</p> : null}
      </div>
    </div>
  );
}

export function collectorLabel(id: string) {
  return isCollectorId(id) ? COLLECTORS[id].label : id;
}
