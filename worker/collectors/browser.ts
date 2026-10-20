// Recolector propio con Playwright, común a los asistentes web (ChatGPT, Gemini).
//
// Para cada consulta: abre una conversación nueva, envía el prompt aprobado, espera a que la
// respuesta termine (indicador de generación + texto estable + timeout configurable, nunca solo
// una espera fija), extrae SOLO el último mensaje del asistente (sin navegación, mensajes previos
// ni razonamiento intermedio), sus enlaces, una captura de evidencia y las condiciones observables.
//
// Ante CAPTCHA, login obligatorio, bloqueo o límite de uso: corta y devuelve
// "requires_intervention". No hay evasión de controles, rotación de cuentas ni reintentos acá.

import { mkdirSync } from "node:fs";
import path from "node:path";
import type { BrowserContext, Page } from "playwright-core";
import { dedupeSources, domainOf } from "../../lib/analyze";
import type { EngineId } from "../../lib/config";
import { DOM_TO_MARKDOWN, inPage, LINKS_IN } from "./in-page";

const toMarkdown = inPage<string[], string>(DOM_TO_MARKDOWN);
const linksOf = inPage<null, { url: string; title: string }[]>(LINKS_IN);
import { CollectFailure, type Citation, type CollectContext, type CollectError, type CollectInput, type CollectResult, type Collector } from "../../lib/collectors/types";

export type WebChatSpec = {
  collectorId: string;
  engine: EngineId;
  url: string;
  /** Hosts propios del asistente: sus links no son citas. */
  ownHosts: RegExp;
  composer: string;
  send?: string;
  assistantMessage: string;
  content: string;
  /** Visible mientras se genera la respuesta. */
  generating: string;
  /** Opcional: aparece cuando el mensaje terminó (ej. botón copiar). */
  done?: string;
  /** Nodos a excluir del texto (razonamiento, "pensando…", botones). */
  exclude: string[];
  model?: string;
  /** Visible cuando NO hay sesión iniciada. */
  loggedOutMarker?: string;
  searchMarkers?: RegExp;
  rateLimitText: RegExp;
  loginWallText: RegExp;
};

export type BrowserOptions = {
  sessionDir: string;
  headless: boolean;
  locale: string;
  timezoneId: string;
  navTimeoutMs: number;
  responseTimeoutMs: number;
  stableMs: number;
  egressCountry: string | null;
  executablePath?: string;
};

export function browserOptionsFromEnv(): BrowserOptions {
  return {
    sessionDir: path.resolve(process.env.WORKER_SESSION_DIR || ".worker-sessions"),
    headless: process.env.WORKER_HEADLESS !== "0",
    locale: process.env.WORKER_BROWSER_LOCALE || "es-AR",
    timezoneId: process.env.WORKER_BROWSER_TIMEZONE || "America/Argentina/Buenos_Aires",
    navTimeoutMs: Number(process.env.WORKER_NAV_TIMEOUT_MS || 45_000),
    responseTimeoutMs: Number(process.env.WORKER_RESPONSE_TIMEOUT_MS || 150_000),
    stableMs: Number(process.env.WORKER_STABLE_MS || 3_000),
    egressCountry: process.env.WORKER_EGRESS_COUNTRY?.trim().toUpperCase() || null,
    executablePath: process.env.WORKER_CHROMIUM_PATH || undefined,
  };
}

const CHALLENGE = {
  selectors: ['iframe[src*="challenges.cloudflare.com"]', "#challenge-form", "#cf-challenge-running", 'iframe[src*="recaptcha"]', 'iframe[title*="captcha" i]'],
  text: /(verify you are human|verific(a|á) que (sos|eres) humano|just a moment|un momento|unusual traffic|tr[aá]fico inusual|are you a robot|no soy un robot|captcha)/i,
};

/** Busca señales de bloqueo en la página. No intenta resolverlas. */
export async function detectBlocker(page: Page, spec: WebChatSpec, composerVisible: boolean): Promise<CollectError | null> {
  const url = page.url();
  if (/\/sorry\/|\/cdn-cgi\/challenge/.test(url)) return { code: "captcha", message: `Verificación anti-bots en ${new URL(url).host}`, transient: false };
  for (const sel of CHALLENGE.selectors) {
    if (await page.locator(sel).first().isVisible().catch(() => false)) return { code: "captcha", message: "La página pidió un CAPTCHA o verificación humana", transient: false };
  }
  const title = await page.title().catch(() => "");
  const body = (await page.locator("body").innerText({ timeout: 2000 }).catch(() => "")).slice(0, 6000);
  if (CHALLENGE.text.test(title) || (!composerVisible && CHALLENGE.text.test(body))) {
    return { code: "captcha", message: "La página pidió una verificación humana", transient: false };
  }
  if (spec.rateLimitText.test(body)) return { code: "limite_de_uso", message: "El asistente informó un límite de uso", transient: false };
  if (/accounts\.google\.com|\/auth\/login|\/login/.test(url) || (!composerVisible && spec.loginWallText.test(body))) {
    return { code: "login_requerido", message: "El asistente pide iniciar sesión", transient: false };
  }
  if (/access denied|acceso denegado|403 forbidden/i.test(title + " " + body.slice(0, 500)) && !composerVisible) {
    return { code: "bloqueado", message: "El sitio bloqueó el acceso", transient: false };
  }
  return null;
}

export function cleanCitationUrl(raw: string): string {
  try {
    const u = new URL(raw);
    for (const k of [...u.searchParams.keys()]) if (/^utm_/i.test(k)) u.searchParams.delete(k);
    return u.toString();
  } catch {
    return raw;
  }
}

export function toCitations(links: { url: string; title: string }[], ownHosts: RegExp): Citation[] {
  return dedupeSources(
    links
      .filter((l) => !ownHosts.test(new URL(l.url).hostname))
      .map((l) => {
        const url = cleanCitationUrl(l.url);
        return { url, title: l.title || undefined, domain: domainOf(url) };
      }),
  );
}

const contexts = new Map<string, Promise<BrowserContext>>();

export async function getContext(collectorId: string, opts: BrowserOptions, headlessOverride?: boolean): Promise<BrowserContext> {
  const key = `${collectorId}:${headlessOverride ?? opts.headless}`;
  let p = contexts.get(key);
  if (!p) {
    p = (async () => {
      const { chromium } = await import("playwright-core");
      const dir = path.join(opts.sessionDir, collectorId);
      mkdirSync(dir, { recursive: true });
      const ctx = await chromium.launchPersistentContext(dir, {
        headless: headlessOverride ?? opts.headless,
        locale: opts.locale,
        timezoneId: opts.timezoneId,
        viewport: { width: 1280, height: 900 },
        executablePath: opts.executablePath,
      });
      ctx.on("close", () => contexts.delete(key));
      return ctx;
    })();
    contexts.set(key, p);
    p.catch(() => contexts.delete(key));
  }
  return p;
}

export async function closeContexts() {
  const all = [...contexts.values()];
  contexts.clear();
  await Promise.all(all.map(async (p) => (await p.catch(() => null))?.close().catch(() => undefined)));
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new CollectFailure({ code: "interrumpido", message: "Ejecución cancelada", transient: true }));
    });
  });

async function visible(page: Page, sel: string) {
  return page.locator(sel).first().isVisible().catch(() => false);
}

/** Ejecuta una consulta en un asistente web. La página se cierra siempre al final. */
export async function runWebChat(spec: WebChatSpec, input: CollectInput, ctx: CollectContext, opts: BrowserOptions): Promise<CollectResult> {
  const started = Date.now();
  const base = {
    engine: spec.engine,
    collectionMethod: "web_capture" as const,
    observedCountry: opts.egressCountry,
    locationVerification: (opts.egressCountry ? "declarada_por_operador" : "no_verificada") as CollectResult["locationVerification"],
  };
  let page: Page | null = null;
  let sessionType: CollectResult["sessionType"] = "publica";
  let screenshotReference: string | null = null;

  const shot = async (target?: { screenshot: (o: object) => Promise<Buffer> }) => {
    if (!page) return;
    try {
      const buf = target
        ? await target.screenshot({ type: "jpeg", quality: 55, timeout: 8000 })
        : await page.screenshot({ type: "jpeg", quality: 50, timeout: 8000 });
      screenshotReference = await ctx.saveEvidence(buf, "image/jpeg");
    } catch (e) {
      ctx.log(`no se pudo guardar evidencia: ${(e as Error).message}`);
    }
  };
  const fail = (status: CollectResult["status"], error: CollectError, extra: Partial<CollectResult> = {}): CollectResult => ({
    ...base,
    status,
    answerText: null,
    citations: [],
    screenshotReference,
    collectedAt: new Date().toISOString(),
    modelIfVisible: null,
    searchMode: "no_observable",
    sessionType,
    duration: Date.now() - started,
    error,
    ...extra,
  });

  try {
    const context = await getContext(spec.collectorId, opts);
    page = await context.newPage();
    page.setDefaultTimeout(15_000);
    await page.goto(spec.url, { waitUntil: "domcontentloaded", timeout: opts.navTimeoutMs });

    // 1) Esperar el cuadro de texto o un bloqueo.
    const readyBy = Date.now() + opts.navTimeoutMs;
    let composerReady = false;
    while (Date.now() < readyBy) {
      composerReady = await visible(page, spec.composer);
      const blocker = await detectBlocker(page, spec, composerReady);
      if (blocker) {
        await shot();
        return fail("requires_intervention", blocker);
      }
      if (composerReady) break;
      await sleep(700, ctx.signal);
    }
    if (!composerReady) {
      await shot();
      return fail("failed", { code: "selector_no_encontrado", message: "No apareció el cuadro de texto del asistente (¿cambió la interfaz?)", transient: true });
    }
    if (spec.loggedOutMarker) sessionType = (await visible(page, spec.loggedOutMarker)) ? "publica" : "autenticada";

    // 2) Conversación nueva: no debería haber mensajes previos del asistente.
    const before = await page.locator(spec.assistantMessage).count();

    // 3) Enviar el prompt aprobado, tal cual.
    const composer = page.locator(spec.composer).first();
    await composer.click();
    await page.keyboard.insertText(input.prompt);
    await sleep(300, ctx.signal);
    if (spec.send && (await visible(page, spec.send))) await page.locator(spec.send).first().click();
    else await page.keyboard.press("Enter");

    // 4) Detectar fin de respuesta: aparece el mensaje nuevo, deja de generarse y el texto se estabiliza.
    const deadline = Date.now() + opts.responseTimeoutMs;
    let lastText = "";
    let stableSince = 0;
    let finished = false;
    let sawMessage = false;
    while (Date.now() < deadline) {
      await sleep(800, ctx.signal);
      const count = await page.locator(spec.assistantMessage).count();
      if (count <= before) {
        const blocker = await detectBlocker(page, spec, true);
        if (blocker) {
          await shot();
          return fail("requires_intervention", blocker);
        }
        continue;
      }
      sawMessage = true;
      const msg = page.locator(spec.assistantMessage).nth(count - 1);
      const content = msg.locator(spec.content).last();
      const text = ((await content.count()) ? await content.evaluate(toMarkdown, spec.exclude).catch(() => "") : "").trim();
      const generating = await visible(page, spec.generating);
      const doneMarker = spec.done ? await msg.locator(spec.done).first().isVisible().catch(() => false) : false;
      if (text && text === lastText) {
        if (!stableSince) stableSince = Date.now();
      } else {
        stableSince = 0;
        lastText = text;
      }
      if (text && !generating && (doneMarker || (stableSince && Date.now() - stableSince >= opts.stableMs))) {
        finished = true;
        break;
      }
      if (!text) {
        const blocker = await detectBlocker(page, spec, true);
        if (blocker) {
          await shot();
          return fail("requires_intervention", blocker);
        }
      }
    }

    const count = await page.locator(spec.assistantMessage).count();
    const msg = count > before ? page.locator(spec.assistantMessage).nth(count - 1) : null;
    const content = msg ? msg.locator(spec.content).last() : null;
    const answer = content && (await content.count()) ? (await content.evaluate(toMarkdown, spec.exclude).catch(() => "")).trim() : "";
    const links = content && (await content.count()) ? await content.evaluate(linksOf, null).catch(() => []) : [];
    const citations = toCitations(links, spec.ownHosts);
    const model = spec.model ? ((await page.locator(spec.model).first().innerText({ timeout: 1500 }).catch(() => "")).trim() || null) : null;
    const pageText = spec.searchMarkers ? await page.locator("body").innerText({ timeout: 2000 }).catch(() => "") : "";
    const searchMode = citations.length || (spec.searchMarkers && spec.searchMarkers.test(pageText)) ? "busqueda_web_observada" : "sin_busqueda_observada";
    await shot(msg ?? undefined);

    if (!answer) {
      return fail("failed", {
        code: sawMessage ? "respuesta_vacia" : "timeout",
        message: sawMessage ? "El asistente no devolvió texto" : `No llegó respuesta en ${Math.round(opts.responseTimeoutMs / 1000)} s`,
        transient: true,
      });
    }
    return {
      ...base,
      status: finished ? "completed" : "partial",
      answerText: answer,
      citations,
      screenshotReference,
      collectedAt: new Date().toISOString(),
      modelIfVisible: model,
      searchMode,
      sessionType,
      duration: Date.now() - started,
      error: finished ? null : { code: "timeout", message: "La respuesta no terminó dentro del tiempo límite: se guardó lo visible como parcial", transient: false },
    };
  } catch (e) {
    if (e instanceof CollectFailure) return fail("failed", e.info);
    const msg = String((e as Error).message ?? e).slice(0, 300);
    const timeout = /timeout/i.test(msg);
    return fail("failed", { code: timeout ? "timeout" : /net::|ERR_/.test(msg) ? "red" : "desconocido", message: msg, transient: true });
  } finally {
    await page?.close().catch(() => undefined);
  }
}

export function webCollector(spec: WebChatSpec, opts: BrowserOptions): Collector {
  return {
    id: spec.collectorId,
    engine: spec.engine,
    method: "web_capture",
    collect: (input, ctx) => runWebChat(spec, input, ctx, opts),
    close: closeContexts,
  };
}
