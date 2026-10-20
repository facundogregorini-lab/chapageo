# Investigación: Lumen, Peec y benchmark de Astra

Revisión del 20-oct-2026. Fuentes: sitio público de getlumen.lat (landing, /checker, /pricing), peec.ai/pricing y la planilla «GL - Research», pestaña «GEO AEO Benchmark».

## Lumen AI (getlumen.lat): benchmark local

**Posicionamiento.** «La plataforma líder de GEO · AEO para Latinoamérica». Foco principal en **agencias** («Ofrecé GEO antes que tu competencia») y secundario en marcas («Monitoreá la tuya gratis»). Español, portugués e inglés.

**Ciclo de producto.** Monitorea → detecta gaps → genera contenido (FAQ, artículos) → «ejecuta automático» (notifica IndexNow, Bing y Google al publicar).

**Para agencias.** Panel multi-cliente, prospección (auditorías automáticas), reportes white-label PDF/CSV, acciones GEO con ejecución, competidores y share of voice, sentimiento y «authority sources», multi-ubicación por cliente. Dice tener «+30 agencias probando».

**Motores.** ChatGPT, Gemini, Google AI Overviews, Claude, Perplexity y Copilot (según plan).

**Precios agencias (USD/mes, pago en moneda local con Mercado Pago, anual con 2 meses gratis):**

| Plan | Precio | Pool de prompts | Prospecciones | Implementaciones | Motores |
|---|---|---|---|---|---|
| Starter | 50 | 20 | 2 | 8 | ChatGPT + Gemini |
| Agencia | 100 | 50 | 5 | 45 | ChatGPT + Gemini |
| Plus | 199 | 100 | 10 | 60 | + 1 a elección, white-label |
| Cobertura total | 499 | 150 | 20 | 90 | Los 6 |

Packs: +10 prospecciones US$25, +20 implementaciones US$29, white-label US$40. Marcas desde gratis / US$29.

**Checker gratis.** Sitio + país + ciudad + qué querés saber (visibilidad, reputación o ambas). Genera preguntas del rubro, las corre en **Gemini con búsqueda web** y analiza si aparecés, posición y tono. Sin registro.

**Stack observado (inspección del front con el enfoque de REA para apps JavaScript).** Next.js con Turbopack, un endpoint `/api/checker`, referencias a Gemini y Resend en los bundles, scripts de analítica servidos desde el propio dominio (patrón de Vercel). No se probó el producto pago.

**Marketing.** Usa estadísticas de terceros (Ahrefs, Visa/Morning Consult, Capgemini), páginas comparativas «Lumen vs Semrush / Ahrefs / Profound / Otterly / Peec / GEO Metrics», blog, guías, glosario e informe LATAM.

## Peec AI: líder global

- Precios: Starter US$95 (50 prompts, 3 modelos, diario, 1 proyecto), Pro US$245 (150 prompts, 2 proyectos), Advanced US$495 (350 prompts, 5 proyectos, multi-país, Looker Studio), Enterprise a medida (hasta 13 modelos, API, SSO). Usuarios ilimitados en todos los planes. «3500+ marcas y agencias».
- Tracción según Astra: US$10M ARR reportado (mayo-2026), Serie A de US$21M.
- Funciones a destacar: clasificación de prompts con/sin marca e intención, visibilidad/posición/sentimiento/share of voice diarios, clasificación de fuentes (competidor, editorial, referencia, UGC), **gap analysis** de fuentes, acciones recomendadas «earned vs owned», auditoría de crawlability (40+ bots), referidos desde IA, fact-checking de afirmaciones sobre la marca, AI Shopping.
- Lo que se copió: onboarding con sugerencias, branded/non-branded, clasificación de fuentes y gaps, acciones con evidencia, auditoría de bots.

## Conclusiones de Astra aplicadas al MVP

- **GO condicionado**: diagnóstico + acciones para agencias SEO/growth con clientes B2B. Sencillez de Otterly/Peec, acciones de Athena, entrega operada tipo Buba.
- **No hay mercado vacío**: Lumen ya cubre LatAm + español + Mercado Pago + agencias. Diferenciarse por nicho B2B, evidencia reproducible, rapidez y ejecución humana acotada.
- **Oferta**: diagnóstico 48 h US$149 (o US$299 por 3 marcas para agencias) → monitoreo US$99/mes por marca (20 preguntas × 2 motores × 3 repeticiones × 4 cortes).
- **Medición**: tasa de mención con numerador y denominador; errores fuera del denominador; share of voice contra conjunto fijo; tasa de cita propia; panel fijo para antes/después; no llamar «usuarios argentinos» a preguntas sobre Argentina.
- **Qué no prometer**: primer puesto en ChatGPT, indexación garantizada, llms.txt como palanca.
- **Validación**: 3 compradores independientes o 2 agencias pagas; frenar tras 10 conversaciones y 20 propuestas sin pagos.

## Cómo se refleja en ChapaGEO

| Decisión | Dónde |
|---|---|
| Checker gratis como Lumen, con lead hacia el diagnóstico | `/checker`, `/auditoria/[token]` |
| Ofertas y precios de Astra | `lib/config.ts`, `/precios` |
| Agencias: cartera, prospección, white-label | `/app`, `/app/prospeccion`, `/r/[token]` |
| Métricas con numerador/denominador y metodología visible | `lib/metrics.ts`, `components/BrandOverview.tsx` |
| Gaps de fuentes y acciones con evidencia (Peec/Athena) | `/fuentes`, `/acciones`, `lib/actions.ts` |
| Auditoría de bots de IA (Peec) | `lib/audit.ts` |
| Embudo y criterio continuar/iterar/frenar | `/app/validacion` |
| Fuera del MVP: 6+ motores, scraping propio, publicación automática, IndexNow | Pendiente |
