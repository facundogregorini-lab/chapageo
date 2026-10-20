import { NextResponse, type NextRequest } from "next/server";
import { sessionCookieOptions } from "@/lib/auth";
import { exchangeCode, findOrCreateGoogleUser, GOOGLE_STATE_COOKIE, googleConfig, openState, redirectUri, verifyIdToken } from "@/lib/google-auth";
import { SESSION_COOKIE, signSession } from "@/lib/session";

// Vuelta desde Google: valida estado, canjea el código, verifica el id_token y abre la sesión.
export async function GET(req: NextRequest) {
  const fail = (code: string) => {
    const res = NextResponse.redirect(new URL(`/ingresar?error=${code}`, req.url));
    res.cookies.delete({ name: GOOGLE_STATE_COOKIE, path: "/api/auth/google" });
    return res;
  };
  const cfg = googleConfig();
  if (!cfg) return fail("google_off");
  const params = req.nextUrl.searchParams;
  if (params.get("error")) return fail("google_cancelado");
  const state = await openState(req.cookies.get(GOOGLE_STATE_COOKIE)?.value);
  const code = params.get("code");
  if (!state || !code || params.get("state") !== state.state) return fail("google_estado");

  let userId: string;
  let created: boolean;
  try {
    const idToken = await exchangeCode(code, redirectUri(req.nextUrl.origin), state.verifier);
    const profile = await verifyIdToken(idToken, cfg.clientId, state.nonce);
    ({ userId, created } = await findOrCreateGoogleUser(profile));
  } catch (e) {
    console.error("google_callback", e instanceof Error ? e.message : e);
    return fail("google");
  }

  const res = NextResponse.redirect(new URL(created ? "/app/marcas/nueva" : state.next, req.url));
  res.cookies.delete({ name: GOOGLE_STATE_COOKIE, path: "/api/auth/google" });
  res.cookies.set(SESSION_COOKIE, await signSession(userId), sessionCookieOptions);
  return res;
}
