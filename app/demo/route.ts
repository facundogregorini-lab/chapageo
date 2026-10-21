import { NextResponse } from "next/server";
import { startSession } from "@/lib/auth";
import { one } from "@/lib/db";
import { logEvent } from "@/lib/events";
import { DEMO_EMAIL } from "@/lib/seed";

// Entra directo al espacio de demostración (datos ficticios y simulados).
export async function GET(req: Request) {
  // Una precarga del router de Next no es un clic: no abre la sesión demo (pisaría la sesión real).
  if (req.headers.get("next-router-prefetch") || req.headers.get("purpose") === "prefetch") return new NextResponse(null, { status: 204 });
  const user = await one<{ id: string }>("SELECT id FROM users WHERE email = ?", [DEMO_EMAIL]);
  if (!user) return NextResponse.redirect(new URL("/registro", req.url));
  await startSession(user.id);
  await logEvent("demo_click", {});
  return NextResponse.redirect(new URL("/app", req.url));
}
