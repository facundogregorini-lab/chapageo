import assert from "node:assert/strict";
import { before, test } from "node:test";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { useTempDb } from "./helpers";

useTempDb();
process.env.GOOGLE_CLIENT_ID = "cliente-test.apps.googleusercontent.com";
process.env.GOOGLE_CLIENT_SECRET = "secreto-test";
type G = typeof import("../lib/google-auth");
type D = typeof import("../lib/db");
let g: G, dbm: D;

before(async () => {
  dbm = await import("../lib/db");
  g = await import("../lib/google-auth");
  await dbm.db();
});

async function keys() {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = { ...(await exportJWK(publicKey)), kid: "k1", alg: "RS256" };
  const sign = (claims: Record<string, unknown>, over: { iss?: string; aud?: string } = {}) =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: "RS256", kid: "k1" })
      .setIssuer(over.iss ?? "https://accounts.google.com")
      .setAudience(over.aud ?? process.env.GOOGLE_CLIENT_ID!)
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);
  return { set: createLocalJWKSet({ keys: [jwk] }), sign };
}

test("next solo acepta rutas del panel", () => {
  assert.equal(g.safeNext("/app/marcas"), "/app/marcas");
  assert.equal(g.safeNext("https://malo.com"), "/app");
  assert.equal(g.safeNext("//malo.com/app"), "/app");
  assert.equal(g.safeNext(undefined), "/app");
});

test("estado firmado: ida y vuelta, y rechaza adulterados", async () => {
  const s = g.newGoogleState("/app/ajustes");
  const sealed = await g.sealState(s);
  assert.deepEqual(await g.openState(sealed), s);
  assert.equal(await g.openState(sealed.slice(0, -2) + "xx"), null);
  assert.equal(await g.openState(undefined), null);
});

test("URL de autorización con PKCE, nonce y state", () => {
  const s = g.newGoogleState(null);
  const u = new URL(g.authorizationUrl("cid", "https://chapageo.vercel.app/api/auth/google/callback", s));
  assert.equal(u.origin, "https://accounts.google.com");
  assert.equal(u.searchParams.get("state"), s.state);
  assert.equal(u.searchParams.get("nonce"), s.nonce);
  assert.equal(u.searchParams.get("code_challenge_method"), "S256");
  assert.notEqual(u.searchParams.get("code_challenge"), s.verifier);
  assert.equal(u.searchParams.get("scope"), "openid email profile");
});

test("redirect_uri usa APP_URL si está", () => {
  assert.equal(g.redirectUri("http://localhost:3000"), "http://localhost:3000/api/auth/google/callback");
  process.env.APP_URL = "https://chapageo.com/";
  assert.equal(g.redirectUri("http://localhost:3000"), "https://chapageo.com/api/auth/google/callback");
  delete process.env.APP_URL;
});

test("canje de código manda verifier y devuelve el id_token", async () => {
  let body = "";
  const fake = (async (_u: unknown, init?: RequestInit) => {
    body = String(init?.body);
    return new Response(JSON.stringify({ id_token: "tok" }), { status: 200 });
  }) as typeof fetch;
  assert.equal(await g.exchangeCode("c1", "https://x/cb", "ver", fake), "tok");
  assert.match(body, /code_verifier=ver/);
  assert.match(body, /grant_type=authorization_code/);
  const bad = (async () => new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 })) as typeof fetch;
  await assert.rejects(() => g.exchangeCode("c1", "https://x/cb", "ver", bad), /invalid_grant/);
});

test("id_token: valida firma, audiencia, emisor, nonce y email verificado", async () => {
  const k = await keys();
  const cid = process.env.GOOGLE_CLIENT_ID!;
  const ok = await k.sign({ sub: "g-1", email: "Ana@Agencia.com", email_verified: true, name: "Ana", nonce: "n1" });
  assert.deepEqual(await g.verifyIdToken(ok, cid, "n1", k.set), { sub: "g-1", email: "ana@agencia.com", name: "Ana" });
  await assert.rejects(() => g.verifyIdToken(ok, cid, "otro", k.set), /nonce/);
  await assert.rejects(async () => g.verifyIdToken(await k.sign({ sub: "g", email: "a@b.c", email_verified: true, nonce: "n1" }, { aud: "otra-app" }), cid, "n1", k.set));
  await assert.rejects(async () => g.verifyIdToken(await k.sign({ sub: "g", email: "a@b.c", email_verified: true, nonce: "n1" }, { iss: "https://malo.com" }), cid, "n1", k.set));
  await assert.rejects(async () => g.verifyIdToken(await k.sign({ sub: "g", email: "a@b.c", email_verified: false, nonce: "n1" }), cid, "n1", k.set), /verificado/);
  const ajena = await keys();
  await assert.rejects(async () => g.verifyIdToken(await ajena.sign({ sub: "g", email: "a@b.c", email_verified: true, nonce: "n1" }), cid, "n1", k.set));
});

test("crea agencia nueva, vincula por email y reconoce por sub", async () => {
  const nuevo = await g.findOrCreateGoogleUser({ sub: "g-nuevo", email: "nuevo@agencia.com", name: "Nuevo" });
  assert.equal(nuevo.created, true);
  const u = await dbm.one<{ workspace_id: string; password_hash: string }>("SELECT workspace_id, password_hash FROM users WHERE id = ?", [nuevo.userId]);
  assert.equal(u?.password_hash, "");
  assert.ok(await dbm.one("SELECT id FROM workspaces WHERE id = ? AND plan = 'prueba'", [u!.workspace_id]));
  assert.deepEqual(await g.findOrCreateGoogleUser({ sub: "g-nuevo", email: "nuevo@agencia.com", name: null }), { userId: nuevo.userId, created: false });

  const { checkPassword, hashPassword } = await import("../lib/auth-hash");
  await dbm.run("INSERT INTO workspaces (id, name, plan, created_at) VALUES ('ws_x', 'X', 'prueba', ?)", [dbm.now()]);
  await dbm.run("INSERT INTO users (id, email, name, password_hash, workspace_id, created_at) VALUES ('usr_x', 'vieja@agencia.com', null, ?, 'ws_x', ?)", [await hashPassword("clave-larga"), dbm.now()]);
  assert.deepEqual(await g.findOrCreateGoogleUser({ sub: "g-vieja", email: "vieja@agencia.com", name: null }), { userId: "usr_x", created: false });
  const vieja = await dbm.one<{ google_sub: string; password_hash: string }>("SELECT google_sub, password_hash FROM users WHERE id = 'usr_x'");
  assert.equal(vieja?.google_sub, "g-vieja");
  assert.ok(await checkPassword("clave-larga", vieja!.password_hash), "la contraseña sigue sirviendo");
});
