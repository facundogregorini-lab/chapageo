import Link from "next/link";
import "./landing.css";
import { LandingAmbient, LandingFooter, LandingNav } from "@/components/landing/LandingChrome";
import { LandingFx } from "@/components/landing/LandingFx";
import { TrackLink, TrackView } from "@/components/Track";
import { ENGINES, ENGINE_IDS, formatArs, isSubscriptionPlan, PLANS, payLink, planPriceArs, type PlanId } from "@/lib/config";

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

const GAP = [
  ["Top 3", "Respuestas, no resultados", "El asistente arma una recomendación corta con dos o tres marcas. Quedar cuarto es casi como no aparecer."],
  ["≠ SEO", "Tu ranking no se traslada solo", "Los motores combinan búsqueda, reseñas, foros y medios. Estar primero en Google ayuda, pero no alcanza."],
  ["1.º", "Casi nadie lo mide todavía", "La mayoría de las marcas argentinas no sabe qué dice la IA de ellas. Medirlo primero es ventaja."],
];

const LOOP = [
  ["Elegimos las preguntas", "20 preguntas que haría tu cliente, con y sin tu marca. Las sugerimos con IA y las aprobás vos."],
  ["Las corremos en cada motor", "Con búsqueda web y contexto de Argentina, 3 veces cada una para ver la variación."],
  ["Ves la evidencia", "Tasa de mención, share of voice, posición, sentimiento y las fuentes que cita cada motor."],
  ["Ejecutás las mejoras", "Un backlog priorizado con borradores listos: páginas, FAQ, fuentes externas y ajustes técnicos."],
];

const FEATS = [
  ["Panel multi-cliente", "Todas tus marcas en un solo lugar, con su tasa de mención y su última corrida."],
  ["Auditorías de prospección", "Ingresás el dominio de un prospecto y en un minuto tenés un informe para mandarle."],
  ["Reportes white-label", "Link privado con tu logo y tus colores, listo para imprimir o exportar en CSV."],
  ["Backlog para el equipo", "Cada acción con responsable, estado, evidencia y borrador para producir."],
  ["Competidores y share of voice", "Mirá quién gana cada pregunta de tu rubro, en qué posición y con qué tono."],
  ["Fuentes que pesan", "Descubrí qué sitios, reseñas y foros usa la IA para recomendar a tu competencia."],
  ["Auditoría técnica", "Revisamos si tu robots.txt bloquea a los bots de ChatGPT, Perplexity o Claude, y qué le falta a tu home."],
];

const BRAND_POINTS = [
  "Tasa de mención y share of voice frente a tus competidores",
  "Las respuestas originales y las fuentes que cita cada motor",
  "Backlog de mejoras con borradores listos para publicar",
  "Revisión de robots.txt para los bots de IA",
  "Empezá con la prueba gratis o con el diagnóstico de 48 h",
];

const PLAN_ORDER: PlanId[] = ["diagnostico", "marca", "agencia"];
const PLAN_CTA: Record<string, string> = {
  diagnostico: "Quiero mi diagnóstico",
  marca: "Suscribirme",
  agencia: "Empezar como agencia",
};

export default function Home() {
  const engines = ENGINE_IDS.map((id) => ENGINES[id]);
  const marquee = [...engines, ...engines, ...engines, ...engines];
  const trial = PLANS.prueba;
  return (
    <div className="lx">
      <TrackView name="landing_view" />
      <LandingFx />
      <LandingAmbient />
      <LandingNav />

      <main>
        {/* HERO: checker gratis */}
        <section className="lx-hero lx-wrap" id="top">
          <div>
            <div className="lx-badge lx-mono">
              <span className="lx-dot" />
              GEO · AEO para Argentina
            </div>
            <h1 className="lx-h1">
              ¿La IA te recomienda a vos o a tu <span className="lx-sweep">competencia?</span>
            </h1>
            <p className="lx-hero-lead">
              ChapaGEO mide qué responden ChatGPT, Gemini, Perplexity y Claude sobre tu mercado, con las respuestas originales a la vista, y te dice
              qué cambiar para aparecer. Probalo ahora con tu dominio.
            </p>
            <form action="/checker" className="lx-checkform">
              <input name="d" required placeholder="tumarca.com.ar" aria-label="Dominio de tu marca" autoComplete="url" />
              <input name="c" required placeholder="Rubro (ej: estudio contable)" aria-label="Rubro" />
              <button className="lx-btn lx-btn-primary">Medir gratis</button>
            </form>
            <div className="lx-micro lx-mono">Sin registro · Resultado en menos de un minuto · 5 preguntas reales de tu rubro</div>
            <div className="lx-hero-links">
              <a href="/demo" className="lx-brand-link">
                Ver el panel con datos de ejemplo <span aria-hidden>→</span>
              </a>
              <Link href="/precios" className="lx-plain-link">
                Diagnóstico 48 h por US${PLANS.diagnostico.priceUsd}
              </Link>
            </div>
            <div className="lx-definition">
              <p>
                ChapaGEO es la herramienta de GEO para marcas y agencias de Argentina: corre preguntas reales de tu rubro en cada asistente, guarda
                lo que responde y te muestra a quién nombra y qué fuentes cita.
              </p>
              <p>
                GEO / AEO (Generative Engine Optimization / Answer Engine Optimization) es trabajar para que tu marca aparezca dentro de las
                respuestas de la IA, no solo en la lista de resultados de Google.
              </p>
            </div>
          </div>

          <div className="lx-mock-wrap" aria-hidden>
            <div className="lx-tilt">
              <div className="lx-mock">
                <div className="lx-mock-side">
                  <div className="lx-mock-side-brand">
                    <span className="lx-logo-mark" />
                    ChapaGEO
                  </div>
                  <div className="is-active">Panel</div>
                  <div>Preguntas</div>
                  <div>Share of voice</div>
                  <div>Fuentes</div>
                  <div>Acciones</div>
                </div>
                <div className="lx-mock-main">
                  <div className="lx-mock-title">
                    <div>Tasa de mención</div>
                    <div className="lx-mono">Pampa CRM · ejemplo</div>
                  </div>
                  <div className="lx-mock-big">
                    <span>43%</span>
                    <span className="lx-mono">47 de 108 respuestas</span>
                  </div>
                  <svg className="lx-mock-chart" viewBox="0 0 400 110" fill="none">
                    <line x1="0" y1="20" x2="400" y2="20" stroke="#ffffff0d" />
                    <line x1="0" y1="55" x2="400" y2="55" stroke="#ffffff0d" />
                    <line x1="0" y1="90" x2="400" y2="90" stroke="#ffffff0d" />
                    <polyline className="l1" points="0,30 50,34 100,28 150,36 200,30 250,33 300,26 350,30 400,28" stroke="#ffffff38" strokeWidth="1.5" />
                    <polyline className="l2" points="0,62 50,58 100,66 150,60 200,64 250,58 300,62 350,56 400,58" stroke="#ffffff26" strokeWidth="1.5" />
                    <polyline className="l3" points="0,98 50,96 100,92 150,90 200,80 250,70 300,58 350,46 400,36" stroke="#2dd4bf" strokeWidth="2.5" />
                    <circle cx="400" cy="36" r="4" fill="#2dd4bf" />
                  </svg>
                  <div className="lx-mock-kpis">
                    <div>
                      <div>Share of voice</div>
                      <div>18%</div>
                      <div>vs. 3 competidores</div>
                    </div>
                    <div>
                      <div>Te citan</div>
                      <div>19</div>
                      <div>respuestas</div>
                    </div>
                    <div className="is-accent">
                      <div>Acciones</div>
                      <div>6</div>
                      <div>con evidencia</div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="lx-chip-pos lx-chip-a">
                <div className="lx-chip">
                  <span className="lx-dot" />
                  <div>
                    <div className="lx-chip-title">Gemini te nombra</div>
                    <div className="lx-chip-sub lx-mono">Posición #2</div>
                  </div>
                </div>
              </div>
              <div className="lx-chip-pos lx-chip-b">
                <div className="lx-chip">
                  <div className="lx-chip-title">Acción sugerida</div>
                  <div className="lx-chip-sub lx-mono">Conseguí presencia en g2.com</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* MOTORES */}
        <div className="lx-engines">
          <p className="lx-engines-label lx-mono">Medimos en los asistentes que más se usan</p>
          <div className="lx-engines-track">
            <ul className="lx-engines-row">
              {marquee.map((e, i) => (
                <li key={i} aria-hidden={i >= engines.length}>
                  <span className="lx-dot" style={{ background: e.color }} />
                  {e.label}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* LA BRECHA */}
        <section className="lx-section lx-wrap">
          <div className="lx-head-row" data-rv>
            <div>
              <div className="lx-eyebrow lx-mono">La brecha</div>
              <h2 className="lx-h2">La IA no te muestra diez links. Nombra a dos o tres marcas.</h2>
            </div>
            <p className="lx-lead">
              Cada vez más gente le pide recomendaciones a un asistente antes de comprar. Si no estás en esa respuesta, no estás en la conversación,
              aunque tengas buen SEO.
            </p>
          </div>
          <div className="lx-stats">
            {GAP.map(([v, t, d], i) => (
              <div key={t} className="lx-card lx-card-hover lx-stat" data-spot data-rv style={{ ["--rv-delay" as string]: `${i * 0.1}s` }}>
                <div className="lx-spl" />
                <div className="lx-stat-rule" />
                <div className="lx-stat-value">{v}</div>
                <h3>{t}</h3>
                <p>{d}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CÓMO FUNCIONA */}
        <section id="como-funciona" className="lx-section lx-wrap">
          <div className="lx-head-row" data-rv>
            <div>
              <div className="lx-eyebrow lx-mono">Cómo funciona</div>
              <h2 className="lx-h2">Medir, entender, mejorar y volver a medir</h2>
            </div>
            <p className="lx-lead">
              Un panel fijo de preguntas para comparar antes y después de cada cambio. Ves qué responde cada motor, a quién nombra y por qué.
            </p>
          </div>
          <div className="lx-loop">
            <div className="lx-loop-track" />
            <div className="lx-loop-line" />
            <ol className="lx-loop-list">
              {LOOP.map(([t, d], i) => (
                <li key={t} data-rv style={{ ["--rv-delay" as string]: `${i * 0.12}s` }}>
                  <div className="lx-node" />
                  <div className="lx-loop-n lx-mono">0{i + 1}</div>
                  <h3>{t}</h3>
                  <p>{d}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* AGENCIAS */}
        <section id="agencias" className="lx-section lx-wrap">
          <div className="lx-head-row" data-rv>
            <div>
              <div className="lx-eyebrow lx-mono">Para agencias</div>
              <h2 className="lx-h2">Sumá GEO a tu propuesta sin armar un equipo nuevo</h2>
            </div>
            <p className="lx-lead">
              Tus clientes ya te preguntan por ChatGPT. Llegá a la reunión con datos de su marca y de su competencia, y entregá reportes con tu
              identidad.
            </p>
          </div>
          <div className="lx-feats">
            {FEATS.map(([t, d], i) => (
              <div key={t} className="lx-card lx-card-hover lx-feat" data-spot data-rv style={{ ["--rv-delay" as string]: `${(i % 4) * 0.08}s` }}>
                <div className="lx-spl" />
                <div className="lx-feat-n lx-mono">0{i + 1}</div>
                <h3>{t}</h3>
                <p>{d}</p>
              </div>
            ))}
          </div>
          <div className="lx-duo" id="metodologia">
            <div className="lx-proof" data-rv>
              <div className="lx-proof-n">
                47<small>/108</small>
              </div>
              <div>
                <p className="lx-panel-title">Números que podés auditar</p>
                <p className="lx-panel-text">
                  Sin “score mágico”: cada métrica muestra cuántas respuestas te nombran sobre cuántas medimos, con el texto original, la fecha, el
                  motor y el modelo.
                </p>
              </div>
            </div>
            <div className="lx-panel" data-rv>
              <p className="lx-panel-title">Hecho para Argentina</p>
              <p className="lx-panel-text">
                Preguntas en español rioplatense, por país y ciudad. Pagás en pesos con Mercado Pago. Y el diagnóstico incluye una sesión con alguien
                que entiende de contenido y SEO, no solo un PDF.
              </p>
            </div>
          </div>
          <div className="lx-bar" data-rv>
            <div>
              <b>¿Tenés una agencia?</b>
              <span>Probalo con un cliente real y llevá el informe a la próxima reunión.</span>
            </div>
            <Link href="/contacto?oferta=agencia">Quiero probarlo con mi agencia →</Link>
          </div>
        </section>

        {/* MARCAS */}
        <section id="marcas" className="lx-section lx-wrap">
          <div className="lx-head-row" data-rv>
            <div>
              <div className="lx-eyebrow lx-mono">Para marcas y empresas</div>
              <h2 className="lx-h2">Que la IA te nombre cuando preguntan por tu rubro</h2>
            </div>
            <p className="lx-lead">Para equipos de marketing que quieren saber qué dicen ChatGPT, Gemini, Perplexity y Claude de su marca, y cambiarlo.</p>
          </div>
          <div className="lx-brands">
            <div className="lx-card" data-spot data-rv>
              <div className="lx-spl" />
              <p className="lx-card-title">Para marcas</p>
              <ul className="lx-checklist">
                {BRAND_POINTS.map((f) => (
                  <li key={f}>
                    <span className="lx-dot" />
                    {f}
                  </li>
                ))}
              </ul>
              <div className="lx-actions">
                <Link href="/contacto?oferta=diagnostico" className="lx-btn lx-btn-primary lx-btn-lg">
                  Pedir el diagnóstico
                </Link>
                <a href="/demo" className="lx-btn lx-btn-ghost lx-btn-lg">
                  Ver la demo →
                </a>
              </div>
            </div>
            <div className="lx-card lx-checker" data-spot data-rv>
              <div className="lx-spl" />
              <div>
                <h3 className="lx-card-h">Checker de visibilidad IA gratis</h3>
                <p className="lx-card-text">Ingresá tu dominio y tu rubro, y mirá en menos de un minuto si la IA nombra a tu marca o a otra. Sin registro.</p>
                <div className="lx-answer">
                  <div className="lx-answer-q">¿Cuál es el mejor CRM para pymes en Argentina?</div>
                  <ol>
                    <li>
                      <span className="lx-pos">1</span>Andes CRM
                    </li>
                    <li>
                      <span className="lx-pos">2</span>Ceibo Soft
                    </li>
                    <li className="is-you">
                      <span className="lx-pos">3</span>Pampa CRM<span className="lx-answer-badge lx-mono">Tu marca</span>
                    </li>
                  </ol>
                  <p className="lx-answer-cap lx-mono">Ejemplo con marcas ficticias</p>
                </div>
              </div>
              <div className="lx-actions">
                <Link href="/checker" className="lx-btn lx-btn-ghost lx-btn-lg">
                  Probar el checker →
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* PRECIOS */}
        <section id="precios" className="lx-section lx-wrap">
          <div className="lx-center" data-rv>
            <div className="lx-eyebrow lx-mono">Precios</div>
            <h2 className="lx-h2">Empezá con un diagnóstico. Seguí si te sirve.</h2>
            <p className="lx-lead">Suscripción mensual en pesos con Mercado Pago, alta en minutos. Sin permanencia.</p>
          </div>
          <div className="lx-plans">
            {PLAN_ORDER.map((pid, i) => {
              const p = PLANS[pid];
              const ars = planPriceArs(p);
              const href = isSubscriptionPlan(p.id) ? `/registro?plan=${p.id}` : (payLink(p) ?? `/contacto?oferta=${p.id}`);
              return (
                <div key={p.id} className="lx-plan-wrap" data-rv style={{ ["--rv-delay" as string]: `${i * 0.1}s` }}>
                  {p.highlight ? (
                    <div className="lx-plan-ring" aria-hidden>
                      <div />
                    </div>
                  ) : null}
                  <div className={`lx-plan${p.highlight ? " is-hot" : ""}`}>
                    {p.highlight ? <span className="lx-plan-badge lx-mono">Empezá por acá</span> : null}
                    <h3>{p.name}</h3>
                    <p className="lx-plan-desc">{p.tagline}</p>
                    <div className="lx-plan-price">
                      <span>{ars ? formatArs(ars) : `US$${p.priceUsd}`}</span>
                      <span className="lx-plan-per lx-mono">{p.period === "mes" ? (ars ? "ARS / mes" : "USD / mes") : "pago único"}</span>
                    </div>
                    <TrackLink
                      name="pricing_click"
                      props={{ plan: p.id }}
                      href={href}
                      className={`lx-btn lx-plan-cta ${p.highlight ? "lx-btn-primary" : "lx-btn-ghost"}`}
                    >
                      {PLAN_CTA[p.id]}
                    </TrackLink>
                    <ul className="lx-plan-feats">
                      {p.features.map((f) => (
                        <li key={f}>
                          <span className="lx-dot" />
                          {f}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="lx-bar">
            <div>
              <b>Probalo sin pagar</b>
              <span>
                {trial.features.join(" · ")}. Creás la cuenta y medís tu marca.
              </span>
            </div>
            <Link href="/registro">Crear cuenta gratis →</Link>
          </div>
          <div className="lx-bar">
            <div>
              <b>¿Necesitás algo diferente?</b>
              <span>Armamos un plan a medida según la cantidad de marcas, motores y frecuencia.</span>
            </div>
            <Link href="/contacto">Consultar plan a medida →</Link>
          </div>
          <div className="lx-footnotes lx-mono">
            <span>El diagnóstico es un pago único. El monitoreo se cancela cuando quieras.</span>
            <Link href="/precios">Ver la comparación completa →</Link>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="lx-section lx-wrap">
          <div className="lx-center" data-rv>
            <div className="lx-eyebrow lx-mono">Preguntas frecuentes</div>
            <h2 className="lx-h2">Todo lo que necesitás saber</h2>
          </div>
          <div className="lx-faq">
            {FAQ.map((f, i) => (
              <details key={f.q} open={i === 0}>
                <summary>
                  <h3>{f.q}</h3>
                </summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* CTA FINAL */}
        <section className="lx-section lx-wrap">
          <div className="lx-cta" data-spot data-rv>
            <div className="lx-cta-glow" />
            <div className="lx-spl" />
            <h2>La IA ya está hablando de tu rubro. Fijate si habla de vos.</h2>
            <p className="lx-cta-sub">Ingresá tu dominio y en menos de un minuto ves qué responde la IA cuando un cliente pregunta por tu mercado.</p>
            <div className="lx-cta-btns">
              <Link href="/checker" className="lx-btn lx-btn-primary lx-btn-lg">
                Medir mi marca gratis
              </Link>
              <Link href="/contacto?oferta=diagnostico" className="lx-btn lx-btn-ghost lx-btn-lg">
                Pedir el diagnóstico de 48 h
              </Link>
            </div>
            <div className="lx-micro lx-mono">Sin registro · Sin tarjeta · Respuestas completas, no solo un puntaje</div>
          </div>
        </section>
      </main>

      <LandingFooter />
    </div>
  );
}
