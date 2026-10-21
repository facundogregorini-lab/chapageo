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

export type Ctx = { user: User; workspace: Workspace; plan: Plan; isAdmin: boolean };

/** Plan vigente: el guardado en el workspace, salvo que su período pago haya vencido. */
export function effectivePlan(ws: Pick<Workspace, "plan" | "plan_expires_at">, at = new Date()): Plan {
  const plan = PLANS[ws.plan] ?? PLANS.prueba;
  if (plan.id !== "prueba" && ws.plan_expires_at && new Date(ws.plan_expires_at) <= at) return PLANS.prueba;
  return plan;
}

export async function getCtx(): Promise<Ctx | null> {
  const userId = await verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!userId) return null;
  const user = await one<User>("SELECT id, email, name, workspace_id FROM users WHERE id = ?", [userId]);
  if (!user) return null;
  const workspace = await one<Workspace>("SELECT * FROM workspaces WHERE id = ?", [user.workspace_id]);
  if (!workspace) return null;
  const admins = (process.env.ADMIN_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return { user, workspace, plan: effectivePlan(workspace), isAdmin: admins.length === 0 || admins.includes(user.email.toLowerCase()) };
}

export async function requireCtx(): Promise<Ctx> {
  const ctx = await getCtx();
  if (!ctx) redirect("/ingresar");
  return ctx;
}
