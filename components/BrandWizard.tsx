"use client";

import { useState, useTransition } from "react";
import { createBrandAction } from "@/app/app/marcas/actions";
import type { EngineId } from "@/lib/config";

type Competitor = { name: string; domain: string };
type P = { text: string; kind: "sin_marca" | "con_marca"; intent: "informativa" | "comercial" | "transaccional"; topic: string; on: boolean };

type Props = {
  engines: { id: EngineId; label: string; color: string; configured: boolean }[];
  countries: { code: string; name: string }[];
  maxEngines: number;
  maxReps: number;
  poolLeft: number;
  helper: boolean;
};

const STEPS = ["Sitio", "Competidores", "Preguntas", "Motores", "Confirmar"];

export function BrandWizard({ engines, countries, maxEngines, maxReps, poolLeft, helper }: Props) {
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [domain, setDomain] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [country, setCountry] = useState("AR");
  const [city, setCity] = useState("");
  const [aliases, setAliases] = useState("");
  const [competitors, setCompetitors] = useState<Competitor[]>([{ name: "", domain: "" }]);
  const [prompts, setPrompts] = useState<P[]>([]);
  const [promptSource, setPromptSource] = useState<string | null>(null);
  const [custom, setCustom] = useState("");
  const [selEngines, setSelEngines] = useState<EngineId[]>(() => {
    const configured = engines.filter((e) => e.configured).map((e) => e.id);
    const base: EngineId[] = configured.length ? configured : ["chatgpt", "gemini"];
    return base.slice(0, maxEngines);
  });
  const [reps, setReps] = useState(Math.min(3, maxReps));
  const [schedule, setSchedule] = useState<"weekly" | "manual">("weekly");

  const comps = competitors.filter((c) => c.name.trim());
  const chosen = prompts.filter((p) => p.on);

  async function analyzeSite() {
    setError(null);
    setBusy("Leyendo tu sitio…");
    try {
      const r = await fetch("/api/onboarding/analyze", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ domain }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setDomain(d.domain);
      if (!name) setName(d.name);
      if (!description) setDescription(d.description);
      if (!d.reachable) setError("No pudimos cargar el sitio. Podés seguir igual y completar los datos a mano.");
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
        body: JSON.stringify({ what: "competitors", name, domain, category, description, country, city }),
      });
      const d = await r.json();
      const found: Competitor[] = (d.competitors ?? []).map((c: Competitor) => ({ name: c.name, domain: c.domain ?? "" }));
      if (!found.length) setError("No encontramos sugerencias confiables. Cargalos a mano: vos conocés mejor a tu competencia.");
      else setCompetitors([...comps, ...found.filter((f) => !comps.some((c) => c.name.toLowerCase() === f.name.toLowerCase()))].slice(0, 6));
    } finally {
      setBusy(null);
    }
  }

  async function loadPrompts() {
    setBusy("Armando las preguntas que haría tu cliente…");
    setError(null);
    try {
      const r = await fetch("/api/onboarding/suggest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ what: "prompts", name, domain, category, description, country, city, competitors: comps, count: Math.min(20, Math.max(poolLeft, 5)) }),
      });
      const d = await r.json();
      setPromptSource(d.source);
      setPrompts((d.prompts ?? []).map((p: Omit<P, "on">, i: number) => ({ ...p, on: i < poolLeft })));
    } finally {
      setBusy(null);
    }
  }

  function next() {
    setError(null);
    if (step === 0) {
      if (!domain || !name || !category) return setError("Completá sitio, nombre y rubro.");
    }
    if (step === 1 && prompts.length === 0) void loadPrompts();
    if (step === 2) {
      if (!chosen.length) return setError("Elegí al menos una pregunta.");
      if (chosen.length > poolLeft) return setError(`Tu plan te deja ${poolLeft} preguntas más. Destildá ${chosen.length - poolLeft}.`);
    }
    if (step === 3 && !selEngines.length) return setError("Elegí al menos un motor.");
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
        city,
        aliases: aliases.split(",").map((s) => s.trim()).filter(Boolean),
        competitors: comps,
        prompts: chosen.map(({ on: _on, ...p }) => p),
        engines: selEngines,
        repetitions: reps,
        schedule,
      });
      if (res?.error) setError(res.error);
    });
  }

  const totalCalls = chosen.length * selEngines.length * reps;

  return (
    <div className="grid gap-8 lg:grid-cols-[220px_1fr]">
      <ol className="space-y-1 text-sm">
        {STEPS.map((s, i) => (
          <li key={s} className={`flex items-center gap-3 rounded-lg px-3 py-2 ${i === step ? "bg-white font-semibold shadow-sm" : "text-mute"}`}>
            <span className={`grid h-6 w-6 place-items-center rounded-full text-xs font-bold ${i < step ? "bg-ok text-white" : i === step ? "bg-ink text-white" : "bg-line"}`}>
              {i < step ? "✓" : i + 1}
            </span>
            {s}
          </li>
        ))}
      </ol>

      <div className="card p-6">
        {step === 0 ? (
          <div className="space-y-4">
            <h2 className="text-lg font-bold">¿Qué marca vamos a medir?</h2>
            <div>
              <label className="label">Sitio web</label>
              <div className="flex gap-2">
                <input className="input" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="tumarca.com.ar" onBlur={() => domain && !name && analyzeSite()} />
                <button type="button" className="btn-ghost" onClick={analyzeSite} disabled={!domain || !!busy}>Leer sitio</button>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label">Nombre de la marca</label>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <label className="label">Rubro / categoría</label>
                <input className="input" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Ej: software de gestión para pymes" />
              </div>
            </div>
            <div>
              <label className="label">Descripción</label>
              <textarea className="input" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="label">País</label>
                <select className="input" value={country} onChange={(e) => setCountry(e.target.value)}>
                  {countries.map((c) => (
                    <option key={c.code} value={c.code}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Ciudad (opcional)</label>
                <input className="input" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Si es un negocio local" />
              </div>
              <div>
                <label className="label">Otros nombres</label>
                <input className="input" value={aliases} onChange={(e) => setAliases(e.target.value)} placeholder="Separados por coma" />
              </div>
            </div>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-bold">¿Contra quién competís?</h2>
                <p className="text-sm text-mute">Hasta 6. Medimos el share of voice contra este conjunto fijo.</p>
              </div>
              {helper ? (
                <button type="button" className="btn-ghost btn-sm" onClick={suggestCompetitors} disabled={!!busy}>Sugerir con IA</button>
              ) : null}
            </div>
            {competitors.map((c, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                <input className="input" placeholder="Nombre" value={c.name} onChange={(e) => setCompetitors(competitors.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                <input className="input" placeholder="dominio.com (opcional)" value={c.domain} onChange={(e) => setCompetitors(competitors.map((x, j) => (j === i ? { ...x, domain: e.target.value } : x)))} />
                <button type="button" className="btn-ghost btn-sm" onClick={() => setCompetitors(competitors.filter((_, j) => j !== i))}>Quitar</button>
              </div>
            ))}
            {competitors.length < 6 ? (
              <button type="button" className="text-sm font-semibold text-celeste-700" onClick={() => setCompetitors([...competitors, { name: "", domain: "" }])}>
                + Agregar competidor
              </button>
            ) : null}
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-bold">Preguntas a medir</h2>
                <p className="text-sm text-mute">
                  {chosen.length} elegidas · te quedan {poolLeft} en el pool de tu plan
                  {promptSource === "plantilla" ? " · sugeridas con plantilla (sin modelo configurado)" : promptSource === "ia" ? " · sugeridas con IA" : ""}
                </p>
              </div>
              <button type="button" className="btn-ghost btn-sm" onClick={loadPrompts} disabled={!!busy}>Volver a sugerir</button>
            </div>
            <div className="max-h-[420px] space-y-1.5 overflow-y-auto pr-1">
              {prompts.map((p, i) => (
                <label key={i} className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 text-sm ${p.on ? "border-celeste/50 bg-celeste-50/50" : "border-line"}`}>
                  <input type="checkbox" className="mt-1" checked={p.on} onChange={() => setPrompts(prompts.map((x, j) => (j === i ? { ...x, on: !x.on } : x)))} />
                  <span className="flex-1">{p.text}</span>
                  <span className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        setPrompts(prompts.map((x, j) => (j === i ? { ...x, kind: x.kind === "sin_marca" ? "con_marca" : "sin_marca" } : x)));
                      }}
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${p.kind === "sin_marca" ? "bg-paper text-mute" : "bg-sol-50 text-[#8a5a00]"}`}
                    >
                      {p.kind === "sin_marca" ? "sin marca" : "con marca"}
                    </button>
                    <span className="rounded-full bg-paper px-2 py-0.5 text-[11px] font-semibold text-mute">{p.intent}</span>
                  </span>
                </label>
              ))}
            </div>
            <div className="flex gap-2">
              <input className="input" placeholder="Agregá una pregunta propia" value={custom} onChange={(e) => setCustom(e.target.value)} />
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  if (custom.trim().length < 5) return;
                  setPrompts([{ text: custom.trim(), kind: name && custom.toLowerCase().includes(name.toLowerCase()) ? "con_marca" : "sin_marca", intent: "comercial", topic: "Propia", on: true }, ...prompts]);
                  setCustom("");
                }}
              >
                Agregar
              </button>
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-bold">Motores y frecuencia</h2>
              <p className="text-sm text-mute">Tu plan permite hasta {maxEngines} motores y {maxReps} repeticiones por pregunta.</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {engines.map((e) => {
                const on = selEngines.includes(e.id);
                return (
                  <button
                    type="button"
                    key={e.id}
                    onClick={() => setSelEngines(on ? selEngines.filter((x) => x !== e.id) : selEngines.length < maxEngines ? [...selEngines, e.id] : selEngines)}
                    className={`flex items-center justify-between rounded-xl border px-4 py-3 text-left text-sm ${on ? "border-ink bg-white shadow-sm" : "border-line text-mute"}`}
                  >
                    <span className="flex items-center gap-2 font-semibold">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: e.color }} />
                      {e.label}
                    </span>
                    <span className="text-xs">{e.configured ? "con búsqueda web" : "simulado (sin clave)"}</span>
                  </button>
                );
              })}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label">Repeticiones por pregunta</label>
                <select className="input" value={reps} onChange={(e) => setReps(Number(e.target.value))}>
                  {Array.from({ length: maxReps }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>{n} {n === 3 ? "(recomendado)" : ""}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Frecuencia</label>
                <select className="input" value={schedule} onChange={(e) => setSchedule(e.target.value as "weekly" | "manual")}>
                  <option value="weekly">Semanal automática</option>
                  <option value="manual">Solo cuando la corro yo</option>
                </select>
              </div>
            </div>
          </div>
        ) : null}

        {step === 4 ? (
          <div className="space-y-4">
            <h2 className="text-lg font-bold">Todo listo</h2>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div className="rounded-xl bg-paper p-3"><dt className="text-xs text-mute">Marca</dt><dd className="font-semibold">{name} · {domain}</dd></div>
              <div className="rounded-xl bg-paper p-3"><dt className="text-xs text-mute">Rubro</dt><dd className="font-semibold">{category}</dd></div>
              <div className="rounded-xl bg-paper p-3"><dt className="text-xs text-mute">Competidores</dt><dd className="font-semibold">{comps.map((c) => c.name).join(", ") || "—"}</dd></div>
              <div className="rounded-xl bg-paper p-3"><dt className="text-xs text-mute">Por corrida</dt><dd className="font-semibold">{chosen.length} preguntas × {selEngines.length} motores × {reps} = {totalCalls} respuestas</dd></div>
            </dl>
            <p className="text-sm text-mute">Al confirmar revisamos tu robots.txt y arrancamos la primera medición. Tarda entre 1 y 4 minutos.</p>
          </div>
        ) : null}

        {busy ? <p className="mt-4 text-sm text-celeste-700">{busy}</p> : null}
        {error ? <p className="mt-4 rounded-xl bg-bad-50 px-3 py-2 text-sm text-bad">{error}</p> : null}

        <div className="mt-6 flex justify-between border-t border-line pt-5">
          <button type="button" className="btn-ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>Atrás</button>
          {step < STEPS.length - 1 ? (
            <button type="button" className="btn-primary" onClick={next} disabled={!!busy}>Siguiente</button>
          ) : (
            <button type="button" className="btn-celeste" onClick={submit} disabled={pending}>{pending ? "Creando…" : "Crear y medir ahora"}</button>
          )}
        </div>
      </div>
    </div>
  );
}
