import { NextResponse, type NextRequest } from "next/server";
import { authorizationUrl, GOOGLE_STATE_COOKIE, googleConfig, newGoogleState, redirectUri, sealState } from "@/lib/google-auth";

// Inicio del ingreso con Google: guarda el estado firmado y manda a la pantalla de Google.
export async function GET(req: NextRequest) {
  const cfg = googleConfig();
  if (!cfg) return NextResponse.redirect(new URL("/ingresar?error=google_off", req.url));
  const state = newGoogleState(req.nextUrl.searchParams.get("next"));
  const res = NextResponse.redirect(authorizationUrl(cfg.clientId, redirectUri(req.nextUrl.origin), state));
  res.cookies.set(GOOGLE_STATE_COOKIE, await sealState(state), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/auth/google",
    maxAge: 600,
  });
  return res;
}
