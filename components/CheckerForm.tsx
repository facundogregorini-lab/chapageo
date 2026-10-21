"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { COUNTRIES } from "@/lib/config";

const STEPS = [
  "Leyendo tu sitio y tu robots.txt…",
  "Armando preguntas reales de tu rubro…",
  "Haciéndole las preguntas a la IA…",
  "Buscando tu marca en cada respuesta…",
  "Juntando las fuentes que cita…",
];

export function CheckerForm({ initialDomain = "", initialCategory = "", endpoint = "/api/checker", resultBase = "/auditoria", extra, engineOptions = [] }: {
  initialDomain?: string;
  initialCategory?: string;
  endpoint?: string;
  resultBase?: string;
  extra?: Record<string, string>;
  /** Motores que se pueden elegir. Vacío: el servidor decide (sin selector). */
  engineOptions?: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [engines, setEngines] = useState<string[]>(() => engineOptions.slice(0, 1).map((o) => o.id));
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading) return;
    const t = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 9000);
    return () => clearInterval(t);
  }, [loading]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setLoading(true);
    setStep(0);
    setError(null);
    let visitor = "anon";
    try {
      visitor = localStorage.getItem("cg_v") ?? "anon";
    } catch {}
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          domain: f.get("domain"),
          category: f.get("category"),
          country: f.get("country"),
          city: f.get("city") || null,
          brandName: f.get("brandName") || null,
          visitor,
          ...(engineOptions.length ? { engines } : {}),
          ...extra,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error inesperado");
      router.push(`${resultBase}/${data.token}`);
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="card p-8 text-center">
        <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-celeste-100 border-t-celeste" />
        <div className="mt-5 font-semibold">{STEPS[step]}</div>
        <p className="mt-1 text-sm text-mute">Tarda alrededor de un minuto. No cierres esta pestaña.</p>
        <div className="mx-auto mt-5 flex max-w-xs gap-1">
          {STEPS.map((_, i) => (
            <div key={i} className={`h-1 flex-1 rounded-full ${i <= step ? "bg-celeste" : "bg-line"}`} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-4 p-6">
      <div>
        <label className="label" htmlFor="domain">Sitio web de la marca</label>
        <input id="domain" name="domain" required defaultValue={initialDomain} placeholder="tumarca.com.ar" className="input" />
      </div>
      <div>
        <label className="label" htmlFor="category">¿A qué se dedica?</label>
        <input id="category" name="category" required defaultValue={initialCategory} placeholder="Ej: estudio contable para pymes, inmobiliaria, cervecería artesanal" className="input" />
      </div>
      {extra ? (
        <div>
          <label className="label" htmlFor="brandName">Nombre de la marca (opcional)</label>
          <input id="brandName" name="brandName" className="input" placeholder="Lo detectamos del sitio si lo dejás vacío" />
        </div>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="country">País</label>
          <select id="country" name="country" className="input" defaultValue="AR">
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="city">Ciudad (opcional)</label>
          <input id="city" name="city" placeholder="Ej: Córdoba" className="input" />
        </div>
      </div>
      {engineOptions.length > 1 ? (
        <div>
          <div className="label">Motores</div>
          <p className="mb-2 text-xs text-mute">Le hacemos las 5 preguntas a cada motor que elijas, en su interfaz web, como lo haría una persona.</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {engineOptions.map((o) => {
              const on = engines.includes(o.id);
              return (
                <label key={o.id} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 text-sm ${on ? "border-ink bg-white shadow-sm" : "border-line"}`}>
                  <input
                    type="checkbox"
                    name="engines"
                    value={o.id}
                    checked={on}
                    // Siempre queda al menos uno elegido.
                    onChange={() => setEngines(on ? (engines.length > 1 ? engines.filter((x) => x !== o.id) : engines) : [...engines, o.id])}
                  />
                  <span className="font-semibold">{o.label}</span>
                </label>
              );
            })}
          </div>
        </div>
      ) : null}
      {error ? <p className="rounded-xl bg-bad-50 px-3 py-2 text-sm text-bad">{error}</p> : null}
      <button className="btn-primary w-full">Analizar visibilidad</button>
    </form>
  );
}
