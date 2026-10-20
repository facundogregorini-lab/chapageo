import Link from "next/link";
import { PricingCards } from "@/components/PricingCards";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { TrackView } from "@/components/Track";
import { Bar, EngineBadge } from "@/components/ui";

const FAQ = [
  {
    q: "¿Qué es GEO y en qué se diferencia del SEO?",
    a: "SEO es aparecer en la lista de resultados de Google. GEO (Generative Engine Optimization, también llamado AEO) es aparecer dentro de la respuesta cuando alguien le pregunta a ChatGPT, Gemini, Perplexity o Claude. Se complementan: el buen contenido y un sitio indexable siguen siendo la base, pero la IA nombra solo a unas pocas marcas por respuesta.",
  },
  {
    q: "¿Cómo miden la visibilidad?",
    a: "Acordamos con vos un panel fijo de preguntas reales del rubro, las corremos en cada motor con búsqueda web activada y ubicación en Argentina, y repetimos cada pregunta varias veces porque las respuestas varían. Guardamos la respuesta completa, las fuentes, la fecha y el modelo. Cada porcentaje del panel muestra su numerador y denominador.",
  },
  {
    q: "¿Garantizan que la IA me recomiende?",
    a: "No. Nadie puede garantizarlo y desconfiá de quien lo prometa. Lo que sí hacemos es mostrarte con evidencia dónde aparecés, dónde gana tu competencia y qué fuentes usa la IA, y proponerte mejoras concretas. Después medimos con el mismo panel para ver si algo cambió.",
  },
  {
    q: "¿Las preguntas son de usuarios argentinos reales?",
    a: "Son preguntas que un comprador argentino haría, elegidas con vos, y las ejecutamos pidiendo contexto de Argentina (y de tu ciudad, si aplica). No es un panel de usuarios: lo decimos así en cada reporte para no inflar conclusiones.",
  },
  {
    q: "Soy agencia, ¿lo puedo revender?",
    a: "Sí. El plan Agencia te da varias marcas, auditorías de prospección para llevar a reuniones y reportes con tu logo y tus colores en un link privado para cada cliente.",
  },
  {
    q: "¿Cómo pago?",
    a: "En pesos con Mercado Pago o en dólares con tarjeta. El diagnóstico es un pago único; el monitoreo es mensual y lo cancelás cuando quieras.",
  },
];

export default function Home() {
  return (
    <>
      <TrackView name="landing_view" />
      <SiteHeader />
      <main>
        {/* HERO */}
        <section className="relative overflow-hidden">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_75%_0%,rgba(59,159,224,0.18),transparent_70%),radial-gradient(40%_40%_at_10%_30%,rgba(242,169,0,0.10),transparent_70%)]" />
          <div className="relative mx-auto grid max-w-6xl gap-12 px-4 pb-20 pt-16 lg:grid-cols-[1.05fr_0.95fr] lg:pt-24">
            <div>
              <div className="eyebrow">GEO · AEO para Argentina</div>
              <h1 className="mt-4 text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
                Cuando le preguntan a la IA por tu rubro, <span className="text-celeste">¿te nombra a vos</span> o a tu competencia?
              </h1>
              <p className="mt-5 max-w-xl text-lg text-mute">
                ChapaGEO mide qué responden ChatGPT, Gemini, Perplexity y Claude sobre tu mercado, con las respuestas originales a la vista, y te dice
                qué cambiar para aparecer.
              </p>
              <form action="/checker" className="mt-8 flex max-w-xl flex-col gap-2 rounded-2xl border border-line bg-white p-2 shadow-sm sm:flex-row">
                <input name="d" required placeholder="tumarca.com.ar" className="input flex-1 border-0 focus:ring-0" aria-label="Dominio de tu marca" />
                <input name="c" required placeholder="Rubro (ej: estudio contable)" className="input flex-1 border-0 focus:ring-0 sm:border-l sm:border-line" aria-label="Rubro" />
                <button className="btn-primary">Medir gratis</button>
              </form>
              <p className="mt-3 text-xs text-mute">Sin registro · Resultado en menos de un minuto · 5 preguntas reales de tu rubro</p>
              <div className="mt-6 flex flex-wrap items-center gap-4 text-sm">
                <Link href="/demo" className="font-semibold text-ink underline decoration-celeste decoration-2 underline-offset-4">
                  Ver el panel con datos de ejemplo →
                </Link>
                <Link href="/precios" className="font-semibold text-mute hover:text-ink">
                  Diagnóstico 48 h por US$149
                </Link>
              </div>
            </div>

            {/* Mock del panel */}
            <div className="relative">
              <div className="card overflow-hidden shadow-[0_30px_80px_-30px_rgba(11,18,32,0.35)]">
                <div className="flex items-center justify-between border-b border-line px-5 py-3">
                  <div className="text-sm font-semibold">Pampa CRM · Argentina</div>
                  <span className="text-xs text-mute">Corte semanal · 108 respuestas</span>
                </div>
                <div className="grid grid-cols-3 gap-px bg-line">
                  {[
                    ["Tasa de mención", "43%", "47 de 108"],
                    ["Share of voice", "18%", "vs. 3 competidores"],
                    ["Te citan", "18%", "19 respuestas"],
                  ].map(([l, v, h]) => (
                    <div key={l} className="bg-white p-4">
                      <div className="text-[11px] font-semibold text-mute">{l}</div>
                      <div className="mt-1 text-2xl font-bold">{v}</div>
                      <div className="text-[11px] text-mute">{h}</div>
                    </div>
                  ))}
                </div>
                <div className="space-y-3 p-5">
                  {[
                    ["gemini", 0.64],
                    ["perplexity", 0.39],
                    ["chatgpt", 0.28],
                  ].map(([e, v]) => (
                    <div key={e as string} className="flex items-center gap-3">
                      <div className="w-28">
                        <EngineBadge engine={e as "gemini"} />
                      </div>
                      <Bar value={v as number} />
                      <div className="w-10 text-right text-xs font-semibold">{Math.round((v as number) * 100)}%</div>
                    </div>
                  ))}
                </div>
                <div className="border-t border-line bg-paper/60 p-5">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-mute">ChatGPT · «¿Cuál es el mejor CRM para pymes en Argentina?»</div>
                  <p className="mt-2 text-sm leading-relaxed">
                    1. <mark className="rounded bg-sol-50 px-0.5 text-[#8a5a00]">Andes CRM</mark>: muy recomendada por su facilidad de uso. 2.{" "}
                    <mark className="rounded bg-sol-50 px-0.5 text-[#8a5a00]">Ceibo Soft</mark>: reconocida en el mercado local. 3.{" "}
                    <mark className="rounded bg-celeste-100 px-0.5 text-celeste-700">Pampa CRM</mark>: una alternativa a considerar…
                  </p>
                </div>
              </div>
              <div className="absolute -bottom-5 -left-4 hidden rounded-xl border border-line bg-white px-4 py-3 text-sm shadow-lg sm:block">
                <div className="text-[11px] font-semibold text-mute">Acción sugerida</div>
                <div className="font-semibold">Conseguí presencia en g2.com</div>
              </div>
            </div>
          </div>
        </section>

        {/* MOTORES */}
        <section className="border-y border-line bg-white">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-10 gap-y-3 px-4 py-6 text-sm font-semibold text-mute">
            <span className="text-xs uppercase tracking-[0.14em]">Medimos en</span>
            <EngineBadge engine="chatgpt" />
            <EngineBadge engine="gemini" />
            <EngineBadge engine="perplexity" />
            <EngineBadge engine="claude" />
          </div>
        </section>

        {/* POR QUÉ */}
        <section className="mx-auto max-w-6xl px-4 py-20">
          <div className="max-w-2xl">
            <div className="eyebrow">La brecha</div>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">La IA no te muestra diez links. Nombra a dos o tres marcas.</h2>
            <p className="mt-4 text-mute">
              Cada vez más gente le pide recomendaciones a un asistente antes de comprar. Si no estás en esa respuesta, no estás en la conversación,
              aunque tengas buen SEO.
            </p>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {[
              ["Respuestas, no resultados", "El asistente arma una recomendación corta. Quedar cuarto es casi como no aparecer."],
              ["Tu ranking no se traslada solo", "Los motores combinan búsqueda, reseñas, foros y medios. Estar primero en Google ayuda, pero no alcanza."],
              ["Casi nadie lo mide todavía", "La mayoría de las marcas argentinas no sabe qué dice la IA de ellas. Medirlo primero es ventaja."],
            ].map(([t, d]) => (
              <div key={t} className="card p-6">
                <div className="text-lg font-bold">{t}</div>
                <p className="mt-2 text-sm text-mute">{d}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CÓMO FUNCIONA */}
        <section id="como-funciona" className="bg-ink text-white">
          <div className="mx-auto max-w-6xl px-4 py-20">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-celeste">Cómo funciona</div>
            <h2 className="mt-3 max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">Medir, entender, mejorar y volver a medir.</h2>
            <div className="mt-12 grid gap-8 md:grid-cols-4">
              {[
                ["01", "Elegimos las preguntas", "20 preguntas que haría tu cliente, con y sin tu marca. Las sugerimos con IA y las aprobás vos."],
                ["02", "Las corremos en cada motor", "Con búsqueda web y contexto de Argentina, 3 veces cada una para ver la variación."],
                ["03", "Ves la evidencia", "Tasa de mención, share of voice, posición, sentimiento y las fuentes que cita cada motor."],
                ["04", "Ejecutás las mejoras", "Un backlog priorizado con borradores listos: páginas, FAQ, fuentes externas y ajustes técnicos."],
              ].map(([n, t, d]) => (
                <div key={n}>
                  <div className="text-sm font-bold text-sol">{n}</div>
                  <div className="mt-2 text-lg font-bold">{t}</div>
                  <p className="mt-2 text-sm text-white/70">{d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* METODOLOGÍA / DIFERENCIAL */}
        <section id="metodologia" className="mx-auto max-w-6xl px-4 py-20">
          <div className="grid gap-12 lg:grid-cols-2">
            <div>
              <div className="eyebrow">Sin humo</div>
              <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Números que podés auditar.</h2>
              <p className="mt-4 text-mute">
                Las respuestas de IA cambian de una consulta a otra. Por eso no te damos un “score mágico”: te mostramos cuántas respuestas te
                nombran sobre cuántas medimos, en qué motor, con qué fuentes y el texto exacto.
              </p>
              <ul className="mt-6 space-y-3 text-sm">
                {[
                  "Cada métrica con numerador y denominador. Los errores técnicos se informan aparte.",
                  "Respuesta original, fecha UTC, motor y modelo guardados por cada corrida.",
                  "Panel de preguntas fijo para comparar antes y después de cada cambio.",
                  "No prometemos el primer puesto en ChatGPT ni “indexación garantizada”.",
                ].map((t) => (
                  <li key={t} className="flex gap-3">
                    <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-ok-50 text-xs font-bold text-ok">✓</span>
                    {t}
                  </li>
                ))}
              </ul>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                ["Hecho para Argentina", "Preguntas en español rioplatense, por país y ciudad. Pagás en pesos con Mercado Pago."],
                ["Software + criterio", "El diagnóstico incluye una sesión con alguien que entiende de contenido y SEO, no solo un PDF."],
                ["Fuentes que pesan", "Descubrí qué sitios, reseñas y foros usa la IA para recomendar a tu competencia."],
                ["Auditoría técnica", "Revisamos si tu robots.txt bloquea a los bots de ChatGPT, Perplexity o Claude, y qué le falta a tu home."],
              ].map(([t, d]) => (
                <div key={t} className="card p-5">
                  <div className="font-bold">{t}</div>
                  <p className="mt-1.5 text-sm text-mute">{d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* AGENCIAS */}
        <section id="agencias" className="border-y border-line bg-white">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 lg:grid-cols-[0.9fr_1.1fr]">
            <div>
              <div className="eyebrow">Para agencias</div>
              <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Sumá GEO a tu propuesta sin armar un equipo nuevo.</h2>
              <p className="mt-4 text-mute">
                Tus clientes ya te preguntan por ChatGPT. Llegá a la reunión con datos de su marca y de su competencia, y entregá reportes con tu
                identidad.
              </p>
              <Link href="/contacto?oferta=agencia" className="btn-primary mt-6">
                Quiero probarlo con mi agencia
              </Link>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                ["Panel multi-cliente", "Todas tus marcas en un solo lugar, con su tasa de mención y su última corrida."],
                ["Auditorías de prospección", "Ingresás el dominio de un prospecto y en un minuto tenés un informe para mandarle."],
                ["Reportes white-label", "Link privado con tu logo y tus colores, listo para imprimir o exportar en CSV."],
                ["Backlog para el equipo", "Cada acción con responsable, estado, evidencia y borrador para producir."],
              ].map(([t, d]) => (
                <div key={t} className="rounded-2xl border border-line p-5">
                  <div className="font-bold">{t}</div>
                  <p className="mt-1.5 text-sm text-mute">{d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* PRECIOS */}
        <section id="precios" className="mx-auto max-w-6xl px-4 py-20">
          <div className="mx-auto max-w-2xl text-center">
            <div className="eyebrow">Precios</div>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Empezá con un diagnóstico. Seguí si te sirve.</h2>
            <p className="mt-3 text-mute">Pagás en pesos con Mercado Pago o en dólares con tarjeta. Sin permanencia.</p>
          </div>
          <div className="mt-12">
            <PricingCards />
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="border-t border-line bg-white">
          <div className="mx-auto max-w-3xl px-4 py-20">
            <h2 className="text-3xl font-bold tracking-tight">Preguntas frecuentes</h2>
            <div className="mt-8 divide-y divide-line">
              {FAQ.map((f) => (
                <details key={f.q} className="group py-4">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">
                    {f.q}
                    <span className="text-mute transition group-open:rotate-45">+</span>
                  </summary>
                  <p className="mt-3 text-sm leading-relaxed text-mute">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* CTA FINAL */}
        <section className="mx-auto max-w-6xl px-4 py-20">
          <div className="relative overflow-hidden rounded-3xl bg-ink px-8 py-14 text-white sm:px-14">
            <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-celeste/30 blur-3xl" />
            <h2 className="relative max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">La IA ya está hablando de tu rubro. Fijate si habla de vos.</h2>
            <div className="relative mt-8 flex flex-wrap gap-3">
              <Link href="/checker" className="btn bg-white text-ink hover:bg-paper">
                Medir mi marca gratis
              </Link>
              <Link href="/contacto?oferta=diagnostico" className="btn border border-white/30 text-white hover:bg-white/10">
                Pedir el diagnóstico de 48 h
              </Link>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
