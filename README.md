# ChapaGEO

Medición de visibilidad en asistentes de IA (GEO/AEO) para agencias de marketing argentinas. La agencia carga a su cliente y sus competidores, aprueba las preguntas y lanza un análisis. Un worker consulta los motores habilitados y la agencia ve qué responde cada asistente, a quién nombra, qué fuentes cita y con qué evidencia.

Las agencias no necesitan claves de API, cuentas de asistentes, extensiones ni dejar su computadora prendida: los análisis corren en el worker del operador.

- **Estado, pruebas y limitaciones:** [`docs/estado-mvp.md`](docs/estado-mvp.md) (incluye los pasos para la primera agencia).
- **Correr, desplegar, sesiones y costos:** [`docs/operacion.md`](docs/operacion.md).
- Investigación de mercado previa: [`docs/investigacion.md`](docs/investigacion.md).

## Partes

| Parte | Dónde | Qué hace |
|---|---|---|
| Web | `app/`, `components/` (Next.js 15, Vercel) | Agencias, clientes, preguntas, análisis, resultados, informe, CSV. Solo encola. |
| Base y cola | `lib/db.ts`, `lib/migrations.ts`, `lib/queue.ts` (libSQL/Turso) | Datos de cada agencia y la cola persistente de ejecuciones. |
| Worker | `worker/` (Node + Playwright) | Toma ejecuciones, consulta, guarda respuesta, citas, evidencia y condiciones. |

Conectores en `lib/collectors/` y `worker/collectors/`: captura web propia (`chatgpt_web`, `gemini_web`), API oficial opcional del operador (`*_api`) y demo simulada (`demo_*`, solo en el espacio demo). Una métrica nunca mezcla captura web, API y demo sin rotularlas.

## Inicio rápido

```bash
cp .env.example .env.local   # completá AUTH_SECRET
npm install
npm run dev                  # web: http://localhost:3000  (demo en /demo)
npm run worker               # worker, en otra terminal
npm test
```

Para habilitar ChatGPT con captura web:

```bash
WORKER_HEADLESS=0 npm run worker:login -- chatgpt_web   # el operador inicia sesión a mano
npm run worker:probe -- chatgpt_web                     # una consulta real de verificación
```

Hasta que la prueba sale bien, el conector figura como «sin verificar» y no se puede elegir.

## Otras secciones del producto

Landing pública, checker gratuito (usa la API de un motor solo si hay clave; si no, no mide), auditoría técnica de robots.txt para bots de IA, prospección y panel de validación comercial.

## Qué no promete

Nada de «primer puesto en ChatGPT» ni relaciones causales. Los resultados son una muestra tomada bajo condiciones registradas (motor, método, país solicitado y de ejecución, idioma, sesión, fecha) y las oportunidades se apoyan en respuestas concretas que se pueden abrir.
