// Gemini (gemini.google.com). Igual que ChatGPT: selectores frágiles, se habilita solo tras una prueba real.

import type { WebChatSpec } from "./browser";

export function geminiSpec(): WebChatSpec {
  return {
    collectorId: "gemini_web",
    engine: "gemini",
    url: process.env.GEMINI_URL || "https://gemini.google.com/app?hl=es-419",
    ownHosts: /(^|\.)(gemini\.google\.com|accounts\.google\.com|support\.google\.com|policies\.google\.com|myactivity\.google\.com)$/i,
    composer: 'rich-textarea div[contenteditable="true"], div.ql-editor[contenteditable="true"]',
    send: 'button.send-button, button[aria-label*="Send" i], button[aria-label*="Enviar" i]',
    assistantMessage: "model-response",
    content: "message-content .markdown, .model-response-text",
    generating: 'button[aria-label*="Stop" i], button[aria-label*="Detener" i], .stop-icon',
    exclude: ["model-thoughts", ".thoughts-container", '[class*="thinking"]'],
    model: 'bard-mode-switcher button, [data-test-id="bard-mode-menu-button"]',
    loggedOutMarker: 'a[href*="accounts.google.com/ServiceLogin"], a[aria-label*="Sign in" i], a[aria-label*="Acceder" i]',
    searchMarkers: /(Fuentes|Sources|Búsqueda de Google|Google Search)/i,
    rateLimitText: /(reached your limit|alcanzaste el l[ií]mite|has alcanzado el l[ií]mite|try again later|vuelve a intentarlo m[aá]s tarde|demasiadas solicitudes)/i,
    loginWallText: /(sign in to (continue|use)|inicia sesi[oó]n para (continuar|usar)|acceder para continuar)/i,
  };
}
