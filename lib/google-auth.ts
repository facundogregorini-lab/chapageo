// Ingreso con Google (OAuth 2.0 / OpenID Connect, flujo de código con PKCE).
// Sin librerías extra: jose verifica el id_token contra las claves públicas de Google.
// Se habilita solo si están GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET.

import { createHash, randomBytes } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, SignJWT, type JWTVerifyGetKey } from "jose";
import { id, now, one, run } from "./db";
import { logEvent } from "./events";

export const GOOGLE_STATE_COOKIE = "cg_google";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

let jwks: JWTVerifyGetKey | null = null;
const googleKeys = () => (jwks ??= createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs")));

export function googleConfig(): { clientId: string; clientSecret: string } | null {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export const googleEnabled = () => googleConfig() !== null;

/** Origen público de la web. APP_URL manda si está (dominio propio detrás de Vercel). */
export function redirectUri(requestOrigin: string): string {
  const base = (process.env.APP_URL?.trim() || requestOrigin).replace(/\/+$/, "");
  return `${base}/api/auth/google/callback`;
}

/** Solo rutas internas del panel: nunca redirigir a otro sitio. */
export function safeNext(next: string | null | undefined): string {
  return next && next.startsWith("/app") && !next.startsWith("//") ? next : "/app";
}

const b64url = (b: Buffer) => b.toString("base64url");
const stateSecret = () => new TextEncoder().encode(process.env.AUTH_SECRET || "chapageo-dev-secret-cambiame-en-produccion");

export type GoogleState = { state: string; nonce: string; verifier: string; next: string };

export function newGoogleState(next: string | null | undefined): GoogleState {
  return { state: b64url(randomBytes(24)), nonce: b64url(randomBytes(24)), verifier: b64url(randomBytes(48)), next: safeNext(next) };
}

/** El estado viaja firmado en una cookie corta, así no hace falta guardarlo en la base. */
export async function sealState(s: GoogleState): Promise<string> {
  return new SignJWT({ ...s, purpose: "google_oauth" }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("10m").sign(stateSecret());
}

export async function openState(token: string | undefined): Promise<GoogleState | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, stateSecret());
    const { state, nonce, verifier, next, purpose } = payload as Record<string, unknown>;
    if (purpose !== "google_oauth" || typeof state !== "string" || typeof nonce !== "string" || typeof verifier !== "string") return null;
    return { state, nonce, verifier, next: safeNext(typeof next === "string" ? next : null) };
  } catch {
    return null;
  }
}

export function authorizationUrl(clientId: string, redirect: string, s: GoogleState): string {
  const u = new URL(AUTH_URL);
  u.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirect,
    response_type: "code",
    scope: "openid email profile",
    state: s.state,
    nonce: s.nonce,
    code_challenge: b64url(createHash("sha256").update(s.verifier).digest()),
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  return u.toString();
}

export async function exchangeCode(code: string, redirect: string, verifier: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  const cfg = googleConfig();
  if (!cfg) throw new Error("google_no_configurado");
  const res = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: redirect,
      grant_type: "authorization_code",
      code_verifier: verifier,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as { id_token?: string; error?: string };
  if (!res.ok || !data.id_token) throw new Error(`google_token: ${data.error ?? res.status}`);
  return data.id_token;
}

export type GoogleProfile = { sub: string; email: string; name: string | null };

export async function verifyIdToken(idToken: string, clientId: string, nonce: string, keys: JWTVerifyGetKey = googleKeys()): Promise<GoogleProfile> {
  const { payload } = await jwtVerify(idToken, keys, { issuer: ISSUERS, audience: clientId });
  if (payload.nonce !== nonce) throw new Error("google_nonce");
  if (payload.email_verified !== true || typeof payload.email !== "string" || typeof payload.sub !== "string") throw new Error("google_email_no_verificado");
  return { sub: payload.sub, email: payload.email.toLowerCase(), name: typeof payload.name === "string" ? payload.name : null };
}

/**
 * Devuelve el usuario de esa cuenta de Google. Si ya había una cuenta con el mismo email
 * (verificado por Google), la vincula; si no, crea la agencia y el usuario como el registro.
 */
export async function findOrCreateGoogleUser(p: GoogleProfile): Promise<{ userId: string; created: boolean }> {
  const bySub = await one<{ id: string }>("SELECT id FROM users WHERE google_sub = ?", [p.sub]);
  if (bySub) return { userId: bySub.id, created: false };
  const byEmail = await one<{ id: string }>("SELECT id FROM users WHERE email = ?", [p.email]);
  if (byEmail) {
    await run("UPDATE users SET google_sub = ? WHERE id = ?", [p.sub, byEmail.id]);
    return { userId: byEmail.id, created: false };
  }
  const wsId = id("ws_");
  const userId = id("usr_");
  const ts = now();
  await run("INSERT INTO workspaces (id, name, plan, created_at) VALUES (?, ?, 'prueba', ?)", [wsId, "Mi equipo", ts]);
  await run("INSERT INTO users (id, email, name, password_hash, google_sub, workspace_id, created_at) VALUES (?, ?, ?, '', ?, ?, ?)", [
    userId,
    p.email,
    p.name,
    p.sub,
    wsId,
    ts,
  ]);
  await logEvent("signup", { email: p.email, company: null, method: "google" });
  return { userId, created: true };
}
