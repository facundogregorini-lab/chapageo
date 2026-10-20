# ChapaGEO

MVP de GEO (Generative Engine Optimization) para Argentina: mide cuándo ChatGPT, Gemini, Perplexity y Claude recomiendan a una marca o a su competencia, muestra la evidencia y propone acciones concretas. Está pensado para testear product-market fit con marcas y agencias argentinas.

Es un copycat funcional de [Lumen AI](https://getlumen.lat) (benchmark local) con la UX de reporte de gaps de [Peec AI](https://peec.ai) (líder global), recortado según las conclusiones del benchmark de Astra (pestaña «GEO AEO Benchmark»). El detalle de la investigación está en [`docs/investigacion.md`](docs/investigacion.md).

## Qué incluye

**Sitio público (es-AR, voseo)**
- Landing con propuesta, cómo funciona, metodología, agencias, precios y FAQ.
- **Checker gratis** sin registro: 5 preguntas sin marca × 1 motor con búsqueda web + auditoría de robots.txt y home. Termina en un formulario para pedir el diagnóstico (lead).
- Precios con las ofertas de Astra: Diagnóstico 48 h US$149, Monitoreo US$99/mes, Agencia US$299/mes. Los botones van a links de pago (Mercado Pago) si están configurados, o a un formulario de contacto.

**Panel (`/app`)**
- Cartera multi-marca con tasa de mención, share of voice, posición, variación y acciones abiertas.
- Onboarding en 5 pasos: lee el sitio, competidores (sugeridos con IA si hay modelo), preguntas sugeridas (con/sin marca, intención), motores y frecuencia.
- Mediciones: preguntas × motores × repeticiones, procesadas en una cola sobre la base (funciona en serverless). Corte semanal por cron.
- Resumen: KPIs con numerador/denominador, evolución, por motor, sentimiento, marca vs. competencia, marcas no seguidas que la IA nombra, matriz pregunta × motor.
- Respuestas: texto original con menciones resaltadas, fuentes, modelo, fecha, costo, filtros y CSV.
- Fuentes: dominios citados clasificados (propio, competidor, reseñas, medio, comunidad…) y brechas.
- Acciones: backlog priorizado con evidencia, estado, responsable y borrador generado (IA o plantilla).
- Auditoría técnica: 14 bots de IA en robots.txt + chequeos de la home.
- Reporte compartible por link privado, white-label en plan Agencia, imprimible a PDF.
- Prospección: auditorías rápidas de prospectos con la marca de la agencia.
- Validación (PMF): embudo de eventos, leads con etapa y monto cobrado, y el criterio continuar / iterar / frenar.

**Demo**: `/demo` entra a un espacio con dos marcas ficticias (Pampa CRM y Café Malbec) y tres cortes semanales simulados.

## Datos reales vs. simulados

Cada motor usa su API con búsqueda web y ubicación aproximada:

| Motor | Variable | API |
|---|---|---|
| ChatGPT | `OPENAI_API_KEY` | Responses API + `web_search` |
| Gemini | `GEMINI_API_KEY` | `generateContent` + `google_search` |
| Perplexity | `PERPLEXITY_API_KEY` | `sonar` |
| Claude | `ANTHROPIC_API_KEY` | Messages API + `web_search_20260209` |

Si falta la clave de un motor, ese motor corre **simulado**: respuestas determinísticas para mostrar el flujo, marcadas como simuladas en la base, en el panel, en los reportes y en el CSV. Con una sola clave (por ejemplo Gemini) el checker ya mide en serio.

Como advierte Astra, la respuesta por API no es exactamente lo que ve un usuario en la app de cada motor; el panel lo aclara en la metodología. Para capturar la interfaz real, el siguiente paso es sumar un adaptador de DataForSEO LLM Scraper en `lib/engines/`.

## Correr local

```bash
cp .env.example .env.local   # completá las claves que tengas
npm install
npm run dev                  # http://localhost:3000
npm test                     # tests de extracción y robots.txt
```

Sin `DATABASE_URL` usa SQLite en `data/chapageo.db` y carga la demo la primera vez.

## Deploy (Vercel + Turso)

1. Creá una base en [Turso](https://turso.tech) y configurá `DATABASE_URL` (`libsql://…`) y `DATABASE_AUTH_TOKEN`.
2. Configurá `AUTH_SECRET`, `CRON_SECRET` y las claves de los motores.
3. Opcional: `PAY_LINK_*` (links de Mercado Pago), `SALES_WHATSAPP`, `ADMIN_EMAILS` (quién ve Validación).
4. `vercel.json` agenda `/api/cron` todos los días a las 11 UTC; crea los cortes semanales vencidos y avanza las corridas abiertas.

Sin Turso, en Vercel la base vive en `/tmp` (se pierde): sirve solo para mostrar la demo, y el panel lo avisa.

## Arquitectura

- Next.js 15 (App Router, server actions) + Tailwind 4.
- libSQL (`@libsql/client`): SQLite local o Turso. Esquema en `lib/db.ts`.
- `lib/engines/*`: un adaptador por motor + simulado.
- `lib/analyze.ts`: extracción determinística (menciones, posición, citas, sentimiento, marcas listadas, clasificación de fuentes).
- `lib/runner.ts`: cola por filas (`pending → processing → ok/error`) con reclamo atómico y reintento de filas colgadas.
- `lib/metrics.ts`: tasa de mención, cita propia y share of voice con numerador y denominador; los errores técnicos quedan fuera del denominador.
- `lib/actions.ts`: reglas que generan acciones con evidencia + redacción de borradores.
- `lib/audit.ts`: robots.txt para bots de IA y chequeos de la home.

## Qué no promete

Nada de «primer puesto en ChatGPT», indexación garantizada ni llms.txt como palanca demostrada. El producto mide, muestra evidencia y propone mejoras; después se vuelve a medir con el mismo panel.
