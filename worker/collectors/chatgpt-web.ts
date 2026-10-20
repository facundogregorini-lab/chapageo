// ChatGPT (chatgpt.com). Los selectores dependen de la interfaz pública y pueden cambiar:
// por eso el motor solo se habilita después de una prueba real exitosa (npm run worker:probe).

import type { WebChatSpec } from "./browser";

export function chatgptSpec(): WebChatSpec {
  return {
    collectorId: "chatgpt_web",
    engine: "chatgpt",
    // Con sesión iniciada conviene "?temporary-chat=true": no usa ni guarda memoria del usuario.
    url: process.env.CHATGPT_URL || "https://chatgpt.com/",
    ownHosts: /(^|\.)(chatgpt\.com|openai\.com|oaiusercontent\.com)$/i,
    composer: '#prompt-textarea, div[contenteditable="true"]#prompt-textarea, textarea[name="prompt-textarea"]',
    send: 'button[data-testid="send-button"], button#composer-submit-button',
    assistantMessage: '[data-message-author-role="assistant"]',
    content: ".markdown",
    generating: 'button[data-testid="stop-button"]',
    done: 'button[data-testid="copy-turn-action-button"]',
    // Bloques de razonamiento o de "pensando…" no forman parte de la respuesta final.
    exclude: ['[data-testid*="reasoning"]', '[class*="reasoning"]', "details", '[data-testid*="thinking"]'],
    model: 'button[data-testid="model-switcher-dropdown-button"]',
    loggedOutMarker: 'button[data-testid="login-button"]',
    searchMarkers: /(Searched the web|Buscó en la web|Searching the web|Buscando en la web|Fuentes|Sources)/i,
    rateLimitText: /(you('|’)ve (hit|reached) (your|the) (limit|usage)|usage cap|too many requests|demasiadas solicitudes|alcanzaste (el|tu) l[ií]mite|has alcanzado el l[ií]mite)/i,
    loginWallText: /(log in or sign up|inicia sesi[oó]n o reg[ií]strate|iniciá sesión|sign in to continue|inicia sesi[oó]n para continuar)/i,
  };
}
