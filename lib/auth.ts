import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PLANS, type Plan } from "./config";
import { one } from "./db";
import { SESSION_COOKIE, signSession, verifySession } from "./session";
import type { User, Workspace } from "./types";

export { checkPassword, hashPassword } from "./auth-hash";

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 30,
} as const;

export async function startSession(userId: string) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, await signSession(userId), sessionCookieOptions);
}

export async function endSession() {
  (await cookies()).delete(SESSION_COOKIE);
}

/**
 * Equipo de ChapaGEO (ve leads y el embudo, prueba conectores pagos). Solo los emails de ADMIN_EMAILS;
 * sin la variable no hay administradores en producción (en local, todos, para poder probar). Nunca la demo.
 */
export function isAdminEmail(email: string, isDemo: boolean, env: NodeJS.ProcessEnv = process.env): boolean {
  if (isDemo) return false;
  const admins = (env.ADMIN_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!admins.length) return env.NODE_ENV !== "production";
  return admins.includes(email.toLowerCase());
}

export type Ctx = { user: User; workspace: Workspace; plan: Plan; isAdmin: boolean };

/** Plan vigente: el guardado en el workspace, salvo que su período pago haya vencido. */
export function effectivePlan(ws: Pick<Workspace, "plan" | "plan_expires_at">, at = new Date()): Plan {
  const plan = PLANS[ws.plan] ?? PLANS.prueba;
  if (plan.id !== "prueba" && ws.plan_expires_at && new Date(ws.plan_expires_at) <= at) return PLANS.prueba;
  return plan;
}

export async function getCtx(): Promise<Ctx | null> {
  const userId = await verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  return userId ? ctxForUser(userId) : null;
}

export async function ctxForUser(userId: string): Promise<Ctx | null> {
  const user = await one<User>("SELECT id, email, name, workspace_id FROM users WHERE id = ?", [userId]);
  if (!user) return null;
  const workspace = await one<Workspace>("SELECT * FROM workspaces WHERE id = ?", [user.workspace_id]);
  if (!workspace) return null;
  return { user, workspace, plan: effectivePlan(workspace), isAdmin: isAdminEmail(user.email, Number(workspace.is_demo ?? 0) === 1) };
}

/** La demo es un espacio compartido por todos los visitantes: se mira y se corren análisis simulados, pero no se edita. */
export const isDemoCtx = (ctx: Pick<Ctx, "workspace">) => Number(ctx.workspace.is_demo ?? 0) === 1;
export const DEMO_READONLY = "La demo es compartida y de solo lectura. Creá tu cuenta gratis para cargar y editar tus propios clientes.";

export async function requireCtx(): Promise<Ctx> {
  const ctx = await getCtx();
  if (!ctx) redirect("/ingresar");
  return ctx;
}
