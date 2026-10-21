"use server";

import { redirect } from "next/navigation";
import { checkPassword, endSession, hashPassword, startSession } from "@/lib/auth";
import { isSubscriptionPlan } from "@/lib/config";
import { id, now, one, run } from "@/lib/db";
import { logEvent } from "@/lib/events";

export type FormState = { error?: string; ok?: boolean } | undefined;

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function loginAction(_: FormState, form: FormData): Promise<FormState> {
  const email = str(form, "email").toLowerCase();
  const password = str(form, "password");
  const user = await one<{ id: string; password_hash: string }>("SELECT id, password_hash FROM users WHERE email = ?", [email]);
  if (user && !user.password_hash) return { error: "Esta cuenta se creó con Google. Ingresá con «Continuar con Google»." };
  if (!user || !(await checkPassword(password, user.password_hash))) return { error: "Email o contraseña incorrectos." };
  await startSession(user.id);
  const next = str(form, "next");
  redirect(next.startsWith("/app") && !next.startsWith("//") ? next : "/app");
}

export async function registerAction(_: FormState, form: FormData): Promise<FormState> {
  const email = str(form, "email").toLowerCase();
  const password = str(form, "password");
  const name = str(form, "name");
  const company = str(form, "company") || "Mi equipo";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Revisá el email." };
  if (password.length < 8) return { error: "La contraseña necesita al menos 8 caracteres." };
  if (await one("SELECT id FROM users WHERE email = ?", [email])) return { error: "Ya existe una cuenta con ese email. Ingresá desde «Ingresar» (con tu contraseña o con Google)." };
  const wsId = id("ws_");
  const userId = id("usr_");
  const ts = now();
  await run("INSERT INTO workspaces (id, name, plan, created_at) VALUES (?, ?, 'prueba', ?)", [wsId, company, ts]);
  await run("INSERT INTO users (id, email, name, password_hash, workspace_id, created_at) VALUES (?, ?, ?, ?, ?, ?)", [
    userId,
    email,
    name || null,
    await hashPassword(password),
    wsId,
    ts,
  ]);
  const plan = str(form, "plan");
  await logEvent("signup", { email, company, plan: plan || null });
  await startSession(userId);
  // Si vino eligiendo un plan pago, sigue directo al checkout; si no, arranca con el plan de prueba.
  redirect(isSubscriptionPlan(plan) ? `/app/plan?plan=${plan}` : "/app/marcas/nueva");
}

export async function logoutAction() {
  await endSession();
  redirect("/");
}

export async function leadAction(_: FormState, form: FormData): Promise<FormState> {
  const email = str(form, "email").toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Necesitamos un email válido para contactarte." };
  const offer = str(form, "offer") || null;
  const source = str(form, "source") || "contacto";
  await run(
    "INSERT INTO leads (id, email, name, company, phone, domain, source, offer, note, audit_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [id("lead_"), email, str(form, "name") || null, str(form, "company") || null, str(form, "phone") || null, str(form, "domain") || null, source, offer, str(form, "note") || null, str(form, "audit_id") || null, now()],
  );
  await logEvent("lead_submit", { source, offer, domain: str(form, "domain") || null });
  return { ok: true };
}
