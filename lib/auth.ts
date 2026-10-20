import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PLANS } from "./config";
import { one } from "./db";
import { SESSION_COOKIE, signSession, verifySession } from "./session";
import type { User, Workspace } from "./types";

export { checkPassword, hashPassword } from "./auth-hash";

export async function startSession(userId: string) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, await signSession(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function endSession() {
  (await cookies()).delete(SESSION_COOKIE);
}

export type Ctx = { user: User; workspace: Workspace; plan: (typeof PLANS)[keyof typeof PLANS]; isAdmin: boolean };

export async function getCtx(): Promise<Ctx | null> {
  const userId = await verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!userId) return null;
  const user = await one<User>("SELECT id, email, name, workspace_id FROM users WHERE id = ?", [userId]);
  if (!user) return null;
  const workspace = await one<Workspace>("SELECT * FROM workspaces WHERE id = ?", [user.workspace_id]);
  if (!workspace) return null;
  const admins = (process.env.ADMIN_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return { user, workspace, plan: PLANS[workspace.plan] ?? PLANS.prueba, isAdmin: admins.length === 0 || admins.includes(user.email.toLowerCase()) };
}

export async function requireCtx(): Promise<Ctx> {
  const ctx = await getCtx();
  if (!ctx) redirect("/ingresar");
  return ctx;
}
