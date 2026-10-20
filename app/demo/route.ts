import { NextResponse } from "next/server";
import { startSession } from "@/lib/auth";
import { one } from "@/lib/db";
import { logEvent } from "@/lib/events";
import { DEMO_EMAIL } from "@/lib/seed";

// Entra directo al espacio de demostración (datos ficticios y simulados).
export async function GET(req: Request) {
  const user = await one<{ id: string }>("SELECT id FROM users WHERE email = ?", [DEMO_EMAIL]);
  if (!user) return NextResponse.redirect(new URL("/registro", req.url));
  await startSession(user.id);
  await logEvent("demo_click", {});
  return NextResponse.redirect(new URL("/app", req.url));
}
