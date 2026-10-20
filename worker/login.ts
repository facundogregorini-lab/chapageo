// Inicializa o renueva la sesión de un asistente web con intervención MANUAL del operador:
//   npm run worker:login -- chatgpt_web
// Abre un navegador visible con el perfil persistente del worker (WORKER_SESSION_DIR/<conector>).
// El operador inicia sesión o resuelve la verificación a mano y cierra la ventana.
// Las cookies quedan solo en el disco del worker (carpeta excluida de Git); nunca van a la web.

import "./env";
import { COLLECTORS, isCollectorId } from "../lib/collectors/registry";
import { setCollectorStatus } from "../lib/queue";
import { browserOptionsFromEnv, getContext } from "./collectors/browser";
import { chatgptSpec } from "./collectors/chatgpt-web";
import { geminiSpec } from "./collectors/gemini-web";

async function main() {
  const id = process.argv[2];
  if (!id || !isCollectorId(id) || COLLECTORS[id].method !== "web_capture") {
    console.error("Uso: npm run worker:login -- chatgpt_web | gemini_web");
    process.exit(1);
  }
  const spec = id === "chatgpt_web" ? chatgptSpec() : geminiSpec();
  const opts = browserOptionsFromEnv();
  console.log(`Abriendo ${spec.url} con el perfil ${opts.sessionDir}/${id}`);
  console.log("Iniciá sesión o resolvé la verificación a mano. Cuando termines, cerrá la ventana del navegador.");
  const ctx = await getContext(id, opts, false);
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  await page.goto(spec.url, { waitUntil: "domcontentloaded" }).catch(() => undefined);
  await new Promise<void>((resolve) => ctx.on("close", () => resolve()));
  await setCollectorStatus(id, "unverified", "Sesión renovada: falta una prueba real (npm run worker:probe -- " + id + ")", null);
  console.log("Sesión guardada. Ahora corré: npm run worker:probe -- " + id);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
