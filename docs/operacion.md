# Operación de ChapaGEO

Guía para correr, desplegar y mantener la web y el worker. Todo lo que dice «operador» es el equipo de ChapaGEO, nunca la agencia: las agencias solo usan la web.

## 1. Arquitectura

```
 Navegador de la agencia ──► Web (Next.js, Vercel)
                                 │  crea el análisis y sus ejecuciones (no consulta motores)
                                 ▼
                        Base libSQL / Turso  ◄── cola persistente: tabla responses
                                 ▲
                                 │  toma ejecuciones, guarda resultados, heartbeat
                         Worker (Node + Playwright) ── local, VPS o contenedor
                                 │
                                 ▼
                ChatGPT / Gemini (captura web) · APIs oficiales (opcional) · demo
```

- La web nunca corre un análisis dentro de un request: solo encola. Se puede cerrar la pestaña.
- Cada ejecución (pregunta × conector × repetición) es una fila con id determinístico y estado propio: `pending`, `running`, `completed`, `partial`, `failed`, `requires_intervention`.
- El worker toma filas con un `UPDATE … RETURNING` atómico y un `lease_id`. Si se corta, otra instancia recupera las filas sin heartbeat después de `STALE_JOB_SECONDS` y el resultado del worker viejo se descarta (no hay duplicados).
- Errores transitorios se reintentan con backoff hasta `JOB_MAX_ATTEMPTS`. CAPTCHA, login requerido, bloqueo o límite de uso **no** se reintentan: la ejecución queda en `requires_intervention` y el conector se pausa.
- Un conector solo se puede elegir en la web cuando está en estado `available`, es decir, verificado con una consulta real (`worker:probe`) o con una ejecución exitosa.

## 2. Correr en local

```bash
cp .env.example .env.local      # completá AUTH_SECRET; el resto es opcional
npm install
npm run dev                     # web en http://localhost:3000
npm run worker                  # en otra terminal: worker contra la misma base
npm test                        # 38 pruebas
```

Sin `DATABASE_URL` las dos partes usan `data/chapageo.db`. Para que el worker trabaje sobre la base de producción, poné en su `.env.local` el mismo `DATABASE_URL` y `DATABASE_AUTH_TOKEN` que la web.

`/demo` entra a la agencia de demostración: clientes ficticios con los conectores `demo_chatgpt` y `demo_gemini`, que generan respuestas simuladas y rotuladas como tales. Los análisis demo no necesitan worker: como son simulados y no usan red, la página del análisis los avanza desde la web de a pocas ejecuciones mientras está abierta (`/api/runs/[id]/demo-step`, solo para análisis demo del espacio demo). Si se cierra la pestaña, siguen cuando se vuelve. Los análisis reales siempre los hace el worker.

## 3. Inicializar y renovar la sesión de un asistente web

Las cookies y perfiles viven solo en `WORKER_SESSION_DIR` (por defecto `.worker-sessions/`, excluido de Git y de la imagen Docker). Nunca se suben a la base ni a la web.

1. En una máquina con pantalla (o con escritorio remoto al servidor):
   ```bash
   WORKER_HEADLESS=0 npm run worker:login -- chatgpt_web
   ```
   Se abre Chromium con el perfil persistente. El operador inicia sesión o resuelve la verificación **a mano** y cierra la ventana. Usar una cuenta del operador dedicada a esto, nunca de una agencia.
2. Probar con una sola consulta neutral:
   ```bash
   npm run worker:probe -- chatgpt_web
   ```
   Imprime la respuesta, las citas, el modelo visible y guarda la captura en `probe-output/`. Revisala. Si salió bien, el conector queda `available` y la web lo ofrece.
3. Si un análisis quedó frenado por CAPTCHA o login, después de renovar la sesión:
   ```bash
   npm run worker:probe -- chatgpt_web --requeue
   ```
   Vuelve a poner en cola las ejecuciones en `requires_intervention` de ese conector.

Lo mismo para `gemini_web`. Sin sesión, ChatGPT puede responder como visitante (se registra `sesión: pública`).

Si copiás la carpeta de sesión a un servidor, copiala por un canal seguro (scp) y con permisos `700`. Si aparece una verificación repetidamente, no hay que forzarla: el sistema está hecho para frenar y avisar, no para evadirla.

## 4. Despliegue

### Web (ya existente)
- Vercel con Turso (`DATABASE_URL`/`TURSO_DATABASE_URL`, `DATABASE_AUTH_TOKEN`/`TURSO_AUTH_TOKEN`) y `AUTH_SECRET`.
- Las migraciones (`lib/migrations.ts`) corren solas al primer acceso a la base y quedan registradas en `schema_migrations`. También se pueden correr a mano con `npm run db:migrate`. La migración 002 agrega columnas y tablas y traduce estados viejos (`done`→`completed`, etc.); no borra datos.
- `vercel.json` ya no agenda crons: el procesamiento es del worker.

### Worker
Tiene que correr en algún lado para que un análisis avance. Opciones, de menor a mayor costo:

| Opción | Costo | Comentario |
|---|---|---|
| PC del operador (no de la agencia) con `npm run worker` | US$ 0 | La más simple para los primeros pilotos. IP residencial argentina, lo que reduce verificaciones y hace la ubicación declarable. Tiene que estar prendida mientras haya análisis. |
| VPS chico (ej. Hetzner CX22, DigitalOcean 1 GB) con `Dockerfile.worker` | ≈ US$ 5–7/mes | IP de datacenter fuera de Argentina: más probable que ChatGPT/Gemini pidan verificación, y el país de ejecución no es AR. |
| VPS o proxy con salida en Argentina | a cotizar | Necesario si se quiere declarar ejecución desde AR desde un servidor. |

```bash
docker build -f Dockerfile.worker -t chapageo-worker .
docker run -d --restart unless-stopped --env-file .env.worker \
  -v chapageo-sessions:/app/.worker-sessions chapageo-worker
```

**No se contrató ni desplegó nada pago.** Cada opción con costo necesita la aprobación de Facu.

### Costos pendientes de decidir

- Host del worker (tabla de arriba).
- APIs oficiales, solo si se habilitan (claves del operador, opcionales): una consulta con búsqueda web cuesta del orden de US$ 0,01–0,04 según motor y modelo. Un análisis de 12 preguntas × 1 motor × 2 repeticiones son 24 consultas. Verificar precios vigentes antes de activar.
- Turso: el plan gratuito alcanza para pilotos. Las capturas de pantalla se guardan en la base (≈ 100–300 KB cada una); con muchos análisis conviene moverlas a un bucket.
- Cuenta paga de ChatGPT/Gemini para el operador: opcional; con sesión gratuita o pública también funciona, con límites de uso más bajos.

## 5. Límites y protección

Configurables por variable de entorno (ver `.env.example`): ejecuciones por análisis (120), ejecuciones diarias por agencia (300), análisis activos por agencia (2), clientes por agencia (15), intentos por ejecución (3), concurrencia del worker (1, máximo 4) y pausa entre consultas al mismo asistente (8 s). Un mismo asistente web nunca se consulta en paralelo desde un worker.

## 6. Qué mirar cuando algo no avanza

- La página `Clientes` muestra si hay un worker enviando señal; `Ajustes` muestra el estado de cada conector y los límites.
- La página de cada análisis muestra cuántas ejecuciones hay en cada estado, el error de cada una y si el worker está enviando señal.
- `requires_intervention`: renovar sesión (sección 3) y `--requeue`.
- Todo en `pending` y ningún worker en línea: el worker está apagado.
