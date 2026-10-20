// Firma y verificación del token de sesión. Sin dependencias de Node: lo usa también el middleware (edge).
import { jwtVerify, SignJWT } from "jose";

export const SESSION_COOKIE = "cg_session";

function secret() {
  const s = process.env.AUTH_SECRET || "chapageo-dev-secret-cambiame-en-produccion";
  return new TextEncoder().encode(s);
}

export async function signSession(userId: string): Promise<string> {
  return new SignJWT({ sub: userId }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("30d").sign(secret());
}

export async function verifySession(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}
