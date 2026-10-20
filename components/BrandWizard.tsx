"use client";

import { useState, useTransition } from "react";
import { createBrandAction } from "@/app/app/marcas/actions";

type Competitor = { name: string; domain: string };
type Category = "descubrimiento" | "comparacion" | "marca";
type P = { text: string; category: Category; intent: "informativa" | "comercial" | "transaccional"; topic: string; approved: boolean; source: "ia" | "plantilla" | "manual" };

const CATEGORIES: { id: Category; label: string; hint: string }[] = [
  { id: "descubrimiento", label: "Descubrimiento", hint: "No nombran a la marca ni a competidores. Son la base de la métrica de presencia." },
  { id: "comparacion", label: "Comparación y alternativas", hint: "Comparan opciones o piden alternativas. Pueden nombrar competidores, nunca a la marca." },
  { id: "marca", label: "Sobre la marca", hint: "Nombran a la marca. Se miden aparte porque preguntar por ella sesga la mención." },
];

const STEPS = ["Cliente", "Competidores", "Preguntas", "Confirmar"];

type Props = {
  countries: { code: string; name: string }[];
  helper: boolean;
  minPrompts: number;
  maxPrompts: number;
  maxCompetitors: number;
};

export function BrandWizard({ countries, helper, minPrompts, maxPrompts, maxCompetitors }: Props) {
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [domain, setDomain] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [country, setCountry] = useState("AR");
  const [language, setLanguage] = useState("es");
  const [aliases, setAliases] = useState("");
  const [competitors, setCompetitors] = useState<Competitor[]>([{ name: "", domain: "" }]);
  const [prompts, setPrompts] = useState<P[]>([]);
  const [promptSource, setPromptSource] = useState<string | null>(null);
  const [custom, setCustom] = useState("");
  const [customCat, setCustomCat] = useState<Category>("descubrimiento");

  const comps = competitors.filter((c) => c.name.trim());
  const approved = prompts.filter((p) => p.approved);

  async function analyzeSite() {
    setError(null);
    setBusy("Leyendo el sitio…");
    try {
      const r = await fetch("/api/onboarding/analyze", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ domain }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setDomain(d.domain);
      if (!name) setName(d.name);
      if (!description) setDescription(d.description);
      if (!d.reachable) setError("No pudimos leer el sitio. Podés seguir y completar los datos a mano.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function suggestCompetitors() {
    setBusy("Buscando competidores…");
    setError(null);
    try {
      const r = await fetch("/api/onboarding/suggest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ what: "competitors", name, domain, category, description, country }),
      });
      const d = await r.json();
      const found: Competitor[] = (d.competitors ?? []).map((c: Competitor) => ({ name: c.name, domain: c.domain ?? "" }));
      if (!found.length) setError("No encontramos sugerencias confiables. Cargalos a mano: la agencia conoce mejor al mercado.");
      else setCompetitors([...comps, ...found.filter((f) => !comps.some((c) => c.name.toLowerCase() === f.name.toLowerCase()))].slice(0, maxCompetitors));
    } finally {
      setBusy(null);
    }
  }

  async function loadPrompts() {
    setBusy("Leyendo páginas públicas del sitio y armando preguntas…");
    setError(null);
    try {
      const r = await fetch("/api/onboarding/suggest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ what: "prompts", name, domain, category, description, country, aliases: splitAliases(), competitors: comps, count: 15 }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Error");
      setPromptSource(d.source);
      setNote(d.note ?? null);
      let left = maxPrompts;
      setPrompts(
        (d.prompts ?? []).map((p: Omit<P, "approved" | "source">) => ({ ...p, source: d.source, approved: left-- > 0 })),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function splitAliases() {
    return aliases.split(",").map((s) => s.trim()).filter(Boolean);
  }

  function next() {
    setError(null);
    if (step === 0 && (!domain || !name || !category)) return setError("Completá dominio, nombre y categoría.");
    if (step === 1 && prompts.length === 0) void loadPrompts();
    if (step === 2) {
      if (approved.length < minPrompts) return setError(`Aprobá al menos ${minPrompts} preguntas.`);
      if (approved.length > maxPrompts) return setError(`Podés aprobar hasta ${maxPrompts} preguntas. Desmarcá ${approved.length - maxPrompts}.`);
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await createBrandAction({
        name,
        domain,
        description,
        category,
        country,
        language,
        aliases: splitAliases(),
        competitors: comps,
        prompts: prompts.map((p) => ({ text: p.text, category: p.category, intent: p.intent, topic: p.topic, approved: p.approved, source: p.source })),
      });
      if (res?.error) setError(res.error);
    });
  }

  const update = (i: number, patch: Partial<P>) => setPrompts(prompts.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return (
    <div className="grid gap-8 lg:grid-cols-[200px_1fr]">
      <ol className="flex gap-1 overflow-x-auto text-sm lg:block lg:space-y-1">
        {STEPS.map((s, i) => (
          <li key={s} className={`flex shrink-0 items-center gap-3 rounded-lg px-3 py-2 ${i === step ? "bg-white font-semibold shadow-sm" : "text-mute"}`}>
            <span className={`grid h-6 w-6 place-items-center rounded-full text-xs font-bold ${i < step ? "bg-ok text-white" : i === step ? "bg-ink text-white" : "bg-line"}`}>
              {i < step ? "✓" : i + 1}
            </span>
            {s}
          </li>
        ))}
      </ol>

      <div className="card min-w-0 p-5 sm:p-6">
        {step === 0 ? (
          <div className="space-y-4">
            <h2 className="text-lg font-bold">¿Qué cliente vamos a analizar?</h2>
            <div>
              <label className="label">Dominio</label>
              <div className="flex gap-2">
                <input className="input" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="cliente.com.ar" onBlur={() => domain && !name && analyzeSite()} />
                <button type="button" className="btn-ghost" onClick={analyzeSite} disabled={!domain || !!busy}>Leer sitio</button>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label">Nombre de la marca</label>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <label className="label">Categoría</label>
                <input className="input" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Ej: software de gestión para pymes" />
              </div>
            </div>
            <div>
              <label className="label">Descripción del negocio</label>
              <textarea className="input" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="label">País objetivo</label>
                <select className="input" value={country} onChange={(e) => setCountry(e.target.value)}>
                  {countries.map((c) => (
                    <option key={c.code} value={c.code}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Idioma</label>
                <select className="input" value={language} onChange={(e) => setLanguage(e.target.value)}>
                  <option value="es">Español</option>
                  <option value="pt">Portugués</option>
                  <option value="en">Inglés</option>
                </select>
              </div>
              <div>
                <label className="label">Otros nombres o variantes</label>
                <input className="input" value={aliases} onChange={(e) => setAliases(e.target.value)} placeholder="Separados por coma" />
              </div>
            </div>
            <p className="text-xs text-mute">
              El país objetivo es para quién son las preguntas. No garantiza desde dónde se ejecuta la consulta: eso se registra aparte en cada resultado.
            </p>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-bold">Competidores</h2>
                <p className="text-sm text-mute">Hasta {maxCompetitors}. Se comparan siempre contra este conjunto fijo.</p>
              </div>
              {helper ? <button type="button" className="btn-ghost btn-sm" onClick={suggestCompetitors} disabled={!!busy}>Sugerir con IA</button> : null}
            </div>
            {competitors.map((c, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                <input className="input" placeholder="Nombre" value={c.name} onChange={(e) => setCompetitors(competitors.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                <input className="input" placeholder="dominio.com" value={c.domain} onChange={(e) => setCompetitors(competitors.map((x, j) => (j === i ? { ...x, domain: e.target.value } : x)))} />
                <button type="button" className="btn-ghost btn-sm" onClick={() => setCompetitors(competitors.filter((_, j) => j !== i))}>Quitar</button>
              </div>
            ))}
            {competitors.length < maxCompetitors ? (
              <button type="button" className="text-sm font-semibold text-celeste-700" onClick={() => setCompetitors([...competitors, { name: "", domain: "" }])}>
                + Agregar competidor
              </button>
            ) : null}
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-lg font-bold">Preguntas que harían sus clientes</h2>
                <p className="text-sm text-mute">
                  Editá y aprobá entre {minPrompts} y {maxPrompts}. Aprobadas: <strong className="text-ink">{approved.length}</strong>
                  {promptSource === "plantilla" ? " · sugeridas con plantillas editables" : promptSource === "ia" ? " · sugeridas con IA a partir del sitio" : ""}
                </p>
                {note ? <p className="text-xs text-mute">{note}</p> : null}
              </div>
              <button type="button" className="btn-ghost btn-sm" onClick={loadPrompts} disabled={!!busy}>Volver a sugerir</button>
            </div>
            {CATEGORIES.map((cat) => {
              const items = prompts.map((p, i) => ({ p, i })).filter(({ p }) => p.category === cat.id);
              return (
                <div key={cat.id}>
                  <div className="text-sm font-semibold">{cat.label} <span className="font-normal text-mute">· {items.filter((x) => x.p.approved).length} aprobadas</span></div>
                  <p className="mb-2 text-xs text-mute">{cat.hint}</p>
                  <div className="space-y-1.5">
                    {items.map(({ p, i }) => (
                      <div key={i} className={`flex flex-col gap-2 rounded-xl border px-3 py-2 sm:flex-row sm:items-center ${p.approved ? "border-celeste/50 bg-celeste-50/50" : "border-line"}`}>
                        <label className="flex items-center gap-2 text-xs font-semibold">
                          <input type="checkbox" checked={p.approved} onChange={() => update(i, { approved: !p.approved })} />
                          Aprobar
                        </label>
                        <input className="input flex-1 py-1.5" value={p.text} onChange={(e) => update(i, { text: e.target.value })} />
                        <select className="input w-auto py-1.5 text-xs" value={p.category} onChange={(e) => update(i, { category: e.target.value as Category })}>
                          {CATEGORIES.map((c) => (
                            <option key={c.id} value={c.id}>{c.label}</option>
                          ))}
                        </select>
                        <button type="button" className="text-xs font-semibold text-bad" onClick={() => setPrompts(prompts.filter((_, j) => j !== i))}>Quitar</button>
                      </div>
                    ))}
                    {!items.length ? <p className="text-xs text-mute">Sin preguntas en este grupo.</p> : null}
                  </div>
                </div>
              );
            })}
            <div className="flex flex-col gap-2 sm:flex-row">
              <input className="input" placeholder="Agregá una pregunta propia" value={custom} onChange={(e) => setCustom(e.target.value)} />
              <select className="input sm:w-auto" value={customCat} onChange={(e) => setCustomCat(e.target.value as Category)}>
                {CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  if (custom.trim().length < 8) return;
                  setPrompts([...prompts, { text: custom.trim(), category: customCat, intent: "comercial", topic: "Propia", approved: approved.length < maxPrompts, source: "manual" }]);
                  setCustom("");
                }}
              >
                Agregar
              </button>
            </div>
            <p className="text-xs text-mute">Al guardar verificamos el grupo: si una pregunta nombra a la marca pasa a «Sobre la marca»; si nombra a un competidor, a «Comparación».</p>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="space-y-4">
            <h2 className="text-lg font-bold">Revisá y guardá</h2>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div className="rounded-xl bg-paper p-3"><dt className="text-xs text-mute">Cliente</dt><dd className="font-semibold">{name} · {domain}</dd></div>
              <div className="rounded-xl bg-paper p-3"><dt className="text-xs text-mute">Categoría</dt><dd className="font-semibold">{category}</dd></div>
              <div className="rounded-xl bg-paper p-3"><dt className="text-xs text-mute">Competidores</dt><dd className="font-semibold">{comps.map((c) => c.name).join(", ") || "—"}</dd></div>
              <div className="rounded-xl bg-paper p-3">
                <dt className="text-xs text-mute">Preguntas aprobadas</dt>
                <dd className="font-semibold">
                  {CATEGORIES.map((c) => `${approved.filter((p) => p.category === c.id).length} ${c.label.toLowerCase()}`).join(" · ")}
                </dd>
              </div>
            </dl>
            <p className="text-sm text-mute">Después vas a elegir los motores disponibles y las repeticiones, y vas a ver el total de ejecuciones antes de iniciar.</p>
          </div>
        ) : null}

        {busy ? <p className="mt-4 text-sm text-celeste-700">{busy}</p> : null}
        {error ? <p className="mt-4 rounded-xl bg-bad-50 px-3 py-2 text-sm text-bad">{error}</p> : null}

        <div className="mt-6 flex justify-between border-t border-line pt-5">
          <button type="button" className="btn-ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>Atrás</button>
          {step < STEPS.length - 1 ? (
            <button type="button" className="btn-primary" onClick={next} disabled={!!busy}>Siguiente</button>
          ) : (
            <button type="button" className="btn-celeste" onClick={submit} disabled={pending}>{pending ? "Guardando…" : "Guardar cliente"}</button>
          )}
        </div>
      </div>
    </div>
  );
}
