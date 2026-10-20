"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { COUNTRIES } from "@/lib/config";

const STEPS = [
  "Leyendo tu sitio y tu robots.txt…",
  "Armando preguntas reales de tu rubro…",
  "Preguntándole a la IA con búsqueda web…",
  "Buscando tu marca en cada respuesta…",
  "Juntando las fuentes que cita…",
];

export function CheckerForm({ initialDomain = "", initialCategory = "", endpoint = "/api/checker", resultBase = "/auditoria", extra }: {
  initialDomain?: string;
  initialCategory?: string;
  endpoint?: string;
  resultBase?: string;
  extra?: Record<string, string>;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading) return;
    const t = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 4500);
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
        <p className="mt-1 text-sm text-mute">Tarda entre 20 y 50 segundos. No cierres esta pestaña.</p>
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
      {error ? <p className="rounded-xl bg-bad-50 px-3 py-2 text-sm text-bad">{error}</p> : null}
      <button className="btn-primary w-full">Analizar visibilidad</button>
    </form>
  );
}
