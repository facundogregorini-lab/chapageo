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
npm test                        # pruebas automáticas
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

### Suscripciones con Mercado Pago (alta autogestionable)
Flujo: `/precios` → «Suscribirme» → `/registro?plan=…` → `/app/plan` → checkout de Mercado Pago → vuelve a `/app/plan` y el plan queda activo. Cada alta crea un plan de suscripción (`POST /preapproval_plan`, en pesos, mensual) y manda a su checkout: la persona entra con su cuenta de Mercado Pago, sin que ChapaGEO le pida el email. La suscripción resultante trae `preapproval_plan_id` y así se asocia al workspace. Sin `MP_ACCESS_TOKEN` la página de planes deriva a contacto.

**Cómo queda el plan vigente** (`lib/billing.ts`): `workspaces.plan` + `workspaces.plan_expires_at` se recalculan desde la tabla `subscriptions` cada vez que Mercado Pago avisa algo o la agencia abre «Plan y pago».
- `authorized` con cobro: acceso hasta 1 mes después del último cobro + 3 días de gracia. Sin cobro todavía: 3 días provisorios.
- `paused` o `cancelled`: conserva lo ya pagado hasta el fin del período; después vuelve a «Prueba».
- `pending`: sin acceso. Al pasar a otro plan, cuando la nueva se autoriza se cancela la anterior en Mercado Pago.
- Un workspace sin suscripciones conserva el plan que se le haya puesto a mano (`UPDATE workspaces SET plan = 'agencia'`).
- Límites que se aplican por plan: clientes, preguntas, motores y repeticiones por análisis, análisis por mes (Prueba: 1), prospecciones y white-label. El espacio demo no tiene topes de plan.

**Pruebas (sandbox), sin cobrar dinero real:**
1. En [Tus integraciones](https://www.mercadopago.com.ar/developers/panel/app) creá una aplicación (producto: «Suscripciones»).
2. En la app → «Cuentas de prueba», creá dos usuarios de prueba de Argentina: **vendedor** y **comprador**. Anotá usuario y contraseña de cada uno.
3. Entrá a Mercado Pago Developers con el usuario **vendedor de prueba**, creá una app ahí y copiá sus «Credenciales de producción» (`APP_USR-…`): en suscripciones, las pruebas se hacen con las credenciales del vendedor de prueba. Ese valor va en `MP_ACCESS_TOKEN` y poné `MP_TEST_MODE=1`.
4. En esa app → «Webhooks» → «Configurar notificaciones», modo productivo, URL `https://chapageo.vercel.app/api/mercadopago/webhook`, eventos **«Planes y suscripciones»** (`subscription_preapproval` y `subscription_authorized_payment`). Guardá y copiá la **clave secreta** a `MP_WEBHOOK_SECRET`.
5. En Vercel → Settings → Environment Variables (Preview y/o Production): `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`, `MP_TEST_MODE=1`, `APP_URL=https://chapageo.vercel.app`. Redeploy.
6. Registrate en la web con cualquier email, elegí un plan y en el checkout iniciá sesión con ese comprador y pagá con una [tarjeta de prueba](https://www.mercadopago.com.ar/developers/es/docs/subscriptions/additional-content/your-integrations/test/cards) (titular `APRO`).
7. Al volver, `/app/plan` muestra el plan activo. Los avisos quedan en la tabla `billing_events`.

**Producción:** repetir 1 y 4 con la cuenta real de Mercado Pago (credenciales de producción de la cuenta real), sacar `MP_TEST_MODE` y ajustar los precios con `PLAN_PRICE_ARS_MARCA` / `PLAN_PRICE_ARS_AGENCIA`.

### Ingreso con Google (opcional)
Sin estas variables la web funciona igual, solo con email y contraseña.

1. En [Google Cloud Console](https://console.cloud.google.com/) → «APIs y servicios» → «Pantalla de consentimiento de OAuth»: tipo **Externo**, nombre «ChapaGEO», email de soporte, y el dominio `chapageo.vercel.app` (o el propio). Scopes: solo `openid`, `email` y `profile`, que no requieren revisión de Google. Publicar la app (estado «En producción»); si queda «En prueba», solo entran los usuarios de prueba cargados ahí.
2. «Credenciales» → «Crear credenciales» → «ID de cliente de OAuth» → **Aplicación web**.
   - Orígenes autorizados: `https://chapageo.vercel.app` (y `http://localhost:3000` para probar local).
   - URI de redirección autorizados: `https://chapageo.vercel.app/api/auth/google/callback` (y `http://localhost:3000/api/auth/google/callback`).
3. En Vercel → Settings → Environment Variables (Production): `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` y `APP_URL=https://chapageo.vercel.app`. Redeploy.

Cómo se comporta:
- Flujo de código con PKCE, `state` y `nonce` en una cookie firmada de 10 minutos; el `id_token` se verifica contra las claves públicas de Google (emisor, audiencia, vencimiento y email verificado).
- Si el email ya tenía cuenta, se vincula esa cuenta (la contraseña sigue sirviendo). Si no, se crea una agencia nueva en plan de prueba, igual que el registro, y va a «Nueva marca».
- Las cuentas creadas con Google no tienen contraseña: si intentan entrar con email y contraseña, la web les indica usar Google.

### Bright Data (captura sin worker)

Bright Data abre ChatGPT, Gemini o Perplexity con su infraestructura y nos devuelve la respuesta visible con sus fuentes. Corre desde la web: no hace falta worker.

1. Crear la cuenta en brightdata.com y copiar la API key (Account settings → API key).
2. En Vercel → Settings → Environment Variables: `BRIGHTDATA_API_KEY` = esa key (también se acepta `BRIGHTDATA_API_TOKEN`). Redeploy.
3. Los ids de los scrapers ya vienen cargados: ChatGPT `gd_m7aof0k82r803d5bjm`, Gemini `gd_mbz66arm2mf9cu856y`, Perplexity `gd_m7dhdot1vw9a7gc1n`. Solo hace falta `BRIGHTDATA_DATASET_*` si Bright Data los cambia.
4. En la app: Ajustes → «Probar conexión» en cada motor. Hace UNA consulta real (≈ USD 0,0015) y, si vuelve texto, el motor queda disponible para los análisis.

Cómo funciona:

- **Consulta suelta** (prueba de conexión, worker): `POST /datasets/v3/scrape` (sincrónico). Si Bright Data tarda más de ~1 minuto contesta 202 con un `snapshot_id`, y seguimos por `/progress` y `/snapshot` sin volver a pedir (no se cobra dos veces). En código: `queryBrightData(proveedor, pregunta)` en `lib/collectors/brightdata.ts` devuelve texto, fuentes (URLs), proveedor, fecha, modelo y el registro crudo.
- **Análisis**: al crear el análisis se manda un lote por motor (`POST /datasets/v3/trigger`). Las respuestas se guardan cuando alguien abre el análisis o el panel. Si se cierra la pestaña, Bright Data sigue trabajando y se guarda todo al volver.
- Entradas: las del panel de cada scraper. ChatGPT `{url, prompt, country, web_search, additional_prompt}`, Gemini `{url, prompt, index}`, Perplexity `{url, prompt}`. Solo ChatGPT recibe el país.
- Salida: los campos cambian entre scrapers, así que se leen de forma defensiva (texto en `answer_text`/`answer_text_markdown`/`answer`; fuentes en `citations`, `sources`, `search_sources`, `links_attached`). El registro crudo queda guardado en `responses.raw_json` para revisar cómo se leyó.
- Errores: cada pedido tiene timeout. Los GET se reintentan hasta 2 veces (red, 429, 5xx). Los POST, una sola vez y solo con 429/502/503, que indican que Bright Data no procesó el pedido; un POST que pudo haberse procesado no se repite. 401/403 deja el motor no disponible hasta corregir la key.
- Cada ejecución queda como «Captura web · Bright Data», con el país pedido al proveedor (no verificado por nosotros), el modelo y si hubo búsqueda web.

- **Checker gratis de la home (y prospección)**: el visitante elige los motores (ChatGPT por defecto, también Gemini y Perplexity). Son 5 preguntas por motor, un lote asíncrono (`/trigger`) por motor. El chequeo se guarda enseguida como pendiente (con la revisión técnica lista) y la página del resultado consulta los snapshots cada 8 s y completa la misma fila a medida que cada motor responde. Usa el mismo tope diario de registros que los análisis y además `CHECKER_BRIGHTDATA_MAX_PER_DAY` (40 consultas a un motor por día: un chequeo con 3 motores cuenta 3). Si el cupo no alcanza para todos los motores elegidos, se consultan los primeros que entran. Sin cupo o con error en todos, cae a la API oficial si hay clave, o muestra solo la revisión técnica.
- **Prueba local del checker de punta a punta** (sin gastar consultas): `node scripts/fake-brightdata.mjs` y, en otra terminal, `BRIGHTDATA_API_KEY=x BRIGHTDATA_API_BASE=http://127.0.0.1:4567 npm run dev`. Correr el checker: el resultado abre con «ChatGPT está respondiendo…»; `curl 127.0.0.1:4567/ready` y en unos segundos se completa solo.
- Los motores de Bright Data se pueden elegir apenas está cargada la key, sin la prueba de Ajustes. Solo se bloquean si Bright Data rechaza la key (401/403); la prueba de Ajustes los vuelve a habilitar.
- Sin `WORKER_ENABLED=1` no se muestran los conectores del worker ni sus avisos.

Costos y topes: ≈ USD 1,50 cada 1.000 registros. `BRIGHTDATA_MAX_RECORDS_PER_DAY` (300 por defecto) corta los envíos del día aunque haya otro error. Los errores vuelven a la cola con el tope de intentos normal.

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
