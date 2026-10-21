# Estado del MVP para agencias

## Qué está implementado

**Flujo de la agencia (web, en español)**
- Registro e ingreso con email y contraseña, o con Google si están `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` (ver `docs/operacion.md`). Cada agencia es un espacio aislado: todas las consultas, archivos (capturas) y endpoints filtran por `workspace_id`.
- Alta de cliente en 4 pasos: datos (marca, dominio, descripción, rubro, país AR y idioma es por defecto), hasta 3 competidores con nombre y dominio, preguntas, confirmación.
- Preguntas sugeridas desde la descripción, el rubro y el sitio (IA si hay clave configurada en la web; si no, plantillas). Se editan, se aprueban y se separan en tres grupos que nunca se mezclan en las métricas: descubrimiento, comparación/alternativas y sobre la marca. Entre 5 y 20 preguntas aprobadas por análisis.
- Lectura del sitio del cliente: home y hasta 3 páginas relevantes, con límite de tamaño, de tiempo y de redirects, y protección SSRF (bloquea redes privadas, loopback, metadatos de nube, IPv6 equivalentes; revalida cada redirect y conecta a la IP validada).
- Nuevo análisis: solo se pueden elegir los conectores verificados; 1 a 3 repeticiones; muestra el total de ejecuciones antes de empezar. Se puede cerrar la pestaña.
- Página del análisis con progreso por estado, errores, resultados parciales y opción de cerrarlo con lo obtenido.
- Resumen: presencia, cuota de menciones, citación del dominio, cobertura, siempre con numerador y denominador, separado por motor y por tipo de pregunta. Orden de mención separado del puesto en una lista numerada. Comparación con competidores, fuentes más citadas con frecuencia, condiciones de captura y tabla de preguntas con filtros por motor, tipo y estado.
- Detalle de cada respuesta: texto original renderizado de forma segura, texto plano exacto, marcas detectadas con contexto, fuentes, captura de pantalla (si es captura web) y condiciones registradas.
- Tres oportunidades de mejora con enlaces a las respuestas que las sostienen; si no hay evidencia suficiente, lo dice. Sin promesas ni afirmaciones causales.
- Informe imprimible (y link privado para compartir con el cliente) y exportación CSV.
- Comparación temporal solo entre análisis comparables (mismas preguntas y mismos conectores); con una sola medición no se muestran tendencias.

**Cola y worker**
- Web, base con cola persistente y worker separados. El worker corre local, en un servidor o en el contenedor `Dockerfile.worker`.
- Ids idempotentes por pregunta × conector × repetición, heartbeat del worker y de cada ejecución, recuperación de ejecuciones interrumpidas, reintentos acotados con backoff, sin duplicados.
- Límites por análisis, por agencia y por día; concurrencia baja y pausa entre consultas.

**Conectores** (interfaz única `collect(...)` en `lib/collectors/types.ts`)
- `chatgpt_web` y `gemini_web`: captura propia con Playwright. Conversación nueva por consulta, detección de fin por estabilidad del texto con timeout configurable, extracción solo de la respuesta final con sus links, captura de pantalla del mensaje, cierre de recursos. Ante CAPTCHA, login requerido, bloqueo o límite de uso se detiene y marca `requires_intervention`.
- `chatgpt_api`, `gemini_api`, `claude_api`, `perplexity_api`: solo si el operador configura la clave en el worker; se muestran como «API oficial», nunca como captura web. Una captura fallida nunca se reemplaza con una respuesta de API.
- `demo_chatgpt` y `demo_gemini`: solo dentro del espacio demo, rotulados como simulados en toda la UI, el informe y el CSV. Avanzan desde la web mientras la página del análisis está abierta, así que la demo funciona sin worker.
- La interfaz admite agregar Bright Data o DataForSEO como `third_party_capture` más adelante. No hay integraciones falsas.

**Ubicación y condiciones**: cada ejecución guarda país solicitado, país observado (si lo hay), tipo de verificación (`verificada`, `declarada_por_operador`, `no_verificada`, `no_aplica`), idioma, tipo de sesión, modo de búsqueda observado y modelo visible. Los resultados se presentan como una muestra bajo esas condiciones.

## Qué se probó

`npm test`: 47 pruebas, todas pasan.
- Aislamiento entre agencias (análisis, ejecuciones, evidencia, cierre).
- Métricas: denominadores, errores fuera del denominador, cuota contando una vez por respuesta, grupos separados, alias y límites de palabra, orden de mención vs. puesto en lista, el falso positivo de títulos en negrita («Muy fuerte en stock»).
- Cola: idempotencia, validaciones, reintentos sin duplicados, lease perdido, CAPTCHA → intervención → reencolado.
- Worker real en proceso aparte, cortado con SIGKILL a mitad de un análisis y recuperado por otro worker: 20 de 20 completas, sin duplicados.
- SSRF: IPs privadas y metadatos, DNS a red privada, redirect a red interna, límites de tamaño y redirects.
- Seguridad de render: XSS en Markdown, links, fórmulas en CSV.
- Ingreso con Google: firma, audiencia, emisor, nonce y email verificado del `id_token`; estado adulterado; `next` solo interno; alta de agencia nueva y vinculación por email sin perder la contraseña.
- Conector de navegador contra una página de chat local que imita la interfaz: extracción, citas, captura, timeout parcial, CAPTCHA y login.
- Cadena completa captura → base → métricas → CSV/HTML, comprobando que cada cita mostrada corresponda a la respuesta.
- Recorrido de la app compilada con Chromium (desktop y móvil, sin errores de consola): demo, alta de análisis, progreso en vivo con el worker, detalle de respuesta, informe.

## Limitaciones conocidas (importante)

1. **La captura real de ChatGPT y Gemini no está verificada.** El entorno donde se construyó bloquea la salida a chatgpt.com y gemini.google.com, así que el conector se probó contra una página local que imita la interfaz, no contra los sitios reales. Los selectores pueden necesitar ajustes en la primera prueba real. Por diseño, estos conectores quedan «sin verificar» y no se pueden elegir hasta que `npm run worker:probe -- chatgpt_web` funcione.
2. Las interfaces de ChatGPT y Gemini cambian seguido y sus términos de uso restringen el acceso automatizado. Es un riesgo de operación y de cumplimiento a evaluar. El sistema no evade verificaciones ni rota cuentas: si aparece una, frena y avisa.
3. La ubicación de ejecución no se verifica sola: con un worker en una IP argentina, el operador la declara con `WORKER_EGRESS_COUNTRY=AR` y queda registrada como «declarada por el operador».
4. Sin un worker prendido, los análisis reales quedan en cola (la web lo avisa). La demo no lo necesita.
5. Las capturas se guardan en la base; con volumen conviene moverlas a un bucket.
6. Fuera de alcance en esta versión: facturación, white-label avanzado y cambios automáticos en las webs de los clientes.

## Pasos exactos para la primera agencia

Antes (operador, una vez):
1. Mergear el PR. Vercel despliega y la base de producción migra sola en el primer acceso.
2. En una PC del operador: clonar el repo, `npm install`, crear `.env.local` con el `DATABASE_URL` y `DATABASE_AUTH_TOKEN` de producción y `WORKER_WEB_COLLECTORS=chatgpt_web`, `WORKER_EGRESS_COUNTRY=AR` si la conexión es argentina.
3. `WORKER_HEADLESS=0 npm run worker:login -- chatgpt_web`, iniciar sesión con la cuenta del operador y cerrar la ventana.
4. `npm run worker:probe -- chatgpt_web` y revisar la captura en `probe-output/`. Si falla, pasar la salida para ajustar los selectores. Repetir con `gemini_web` si se quiere ofrecer Gemini.
5. `npm run worker` y dejarlo corriendo mientras haya análisis.

Con la agencia (≈ 20 minutos):
1. La agencia se registra en https://chapageo.vercel.app y crea su primer cliente: datos, competidores y preguntas sugeridas.
2. Revisa las preguntas por grupo, edita las que no suenen naturales y aprueba entre 10 y 15.
3. En «Análisis» elige ChatGPT (el único verificado al principio) y 2 repeticiones: ≈ 24–30 ejecuciones, unos 10–15 minutos con la pausa entre consultas.
4. Cierra la pestaña; vuelve más tarde y revisa el resumen, las respuestas originales y las tres oportunidades.
5. Descarga el CSV o comparte el informe imprimible con su cliente.
6. Para medir avance, repetir el análisis más adelante con las mismas preguntas y el mismo motor: solo así aparece la comparación.
