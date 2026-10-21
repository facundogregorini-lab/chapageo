import Link from "next/link";
import { PlanCheckoutForm } from "@/components/PlanCheckoutForm";
import { Badge, fmtDate } from "@/components/ui";
import { requireCtx } from "@/lib/auth";
import { listSubscriptions, priceLabel, refreshWorkspaceSubscriptions, type Subscription } from "@/lib/billing";
import { PLANS, SUBSCRIPTION_PLANS, type PlanId } from "@/lib/config";
import { mpConfigured, mpTestMode } from "@/lib/mercadopago";
import { cancelSubscriptionAction } from "./actions";

export const metadata = { title: "Plan y pago" };
export const dynamic = "force-dynamic";

const STATUS: Record<string, { label: string; tone: "ok" | "bad" | "sol" | "neutral" }> = {
  authorized: { label: "activa", tone: "ok" },
  pending: { label: "esperando pago", tone: "sol" },
  creating: { label: "iniciando", tone: "neutral" },
  paused: { label: "pausada", tone: "sol" },
  cancelled: { label: "cancelada", tone: "neutral" },
  failed: { label: "no se pudo crear", tone: "bad" },
};

const ORDER: PlanId[] = ["prueba", ...SUBSCRIPTION_PLANS];

export default async function Page({ searchParams }: { searchParams: Promise<{ plan?: string; retorno?: string; baja?: string; error?: string }> }) {
  const sp = await searchParams;
  let ctx = await requireCtx();
  if (!Number(ctx.workspace.is_demo ?? 0)) {
    await refreshWorkspaceSubscriptions(ctx.workspace.id);
    ctx = await requireCtx(); // el plan pudo cambiar con la sincronización
  }
  const subs = await listSubscriptions(ctx.workspace.id);
  const active = subs.find((s) => s.status === "authorized") ?? null;
  const returned = sp.retorno ? subs.find((s) => s.id === sp.retorno) : undefined;
  const isDemo = Number(ctx.workspace.is_demo ?? 0) === 1;
  const enabled = mpConfigured() && !isDemo;
  const wanted = sp.plan && (SUBSCRIPTION_PLANS as string[]).includes(sp.plan) ? sp.plan : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Plan y pago</h1>
        <p className="text-sm text-mute">Suscripción mensual en pesos con Mercado Pago. Se renueva sola y la podés cancelar cuando quieras desde acá.</p>
      </div>

      <Notice sub={returned} baja={Boolean(sp.baja)} error={sp.error} until={ctx.workspace.plan_expires_at ?? null} />
      {mpTestMode() && enabled ? (
        <p className="rounded-xl border border-sol/40 bg-sol-50 px-4 py-2 text-sm text-[#6b4700]">
          Modo de prueba de Mercado Pago: usá un usuario comprador de prueba y tarjetas de prueba. No se cobra dinero real.
        </p>
      ) : null}
      {isDemo ? (
        <p className="rounded-xl border border-line bg-paper px-4 py-3 text-sm">
          Estás en el espacio de demostración. <Link href="/registro" className="font-semibold underline">Creá tu cuenta</Link> para suscribirte.
        </p>
      ) : !mpConfigured() ? (
        <p className="rounded-xl border border-line bg-paper px-4 py-3 text-sm">
          El pago online todavía no está habilitado. <Link href="/contacto?oferta=agencia" className="font-semibold underline">Escribinos</Link> y te damos de alta.
        </p>
      ) : null}

      <div className="card flex flex-wrap items-center justify-between gap-4 p-6">
        <div>
          <div className="text-sm text-mute">Plan actual</div>
          <div className="text-xl font-bold">{ctx.plan.name}</div>
          <div className="mt-1 text-sm text-mute">
            {active
              ? `Suscripción activa · ${priceLabel(active.plan) ?? ""}${active.next_payment_at ? ` · próximo cobro ${fmtDate(active.next_payment_at)}` : ""}`
              : ctx.plan.id !== "prueba" && ctx.workspace.plan_expires_at
                ? `Acceso hasta ${fmtDate(ctx.workspace.plan_expires_at)}`
                : ctx.plan.id === "prueba"
                  ? "Gratis, con límites de prueba."
                  : "Asignado por el equipo de ChapaGEO."}
          </div>
        </div>
        {active ? (
          <form action={cancelSubscriptionAction}>
            <input type="hidden" name="sub" value={active.id} />
            <button className="btn-ghost btn-sm">Cancelar suscripción</button>
          </form>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {ORDER.map((pid) => {
          const p = PLANS[pid];
          const current = ctx.plan.id === pid;
          const price = priceLabel(pid);
          const hot = wanted ? wanted === pid : Boolean(p.id === "marca");
          return (
            <div key={pid} className={`card flex flex-col p-6 ${hot ? "border-ink" : ""}`}>
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-mute">{p.name}</div>
                {current ? <Badge tone="ok">tu plan</Badge> : null}
              </div>
              <div className="mt-2 text-3xl font-bold tracking-tight">{pid === "prueba" ? "Gratis" : price}</div>
              <p className="mt-2 text-sm text-mute">{p.tagline}</p>
              <ul className="mt-4 flex-1 space-y-2 text-sm">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-celeste" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              {pid !== "prueba" && enabled && active?.plan !== pid ? (
                <PlanCheckoutForm plan={pid} email={ctx.user.email} primary={hot} label={active ? `Cambiar a ${p.name}` : `Suscribirme a ${p.name}`} />
              ) : null}
            </div>
          );
        })}
      </div>
      <p className="text-xs text-mute">
        Precios finales en pesos argentinos, por mes. Al cambiar de plan, la suscripción anterior se cancela sola cuando se activa la nueva.
        Si cancelás, conservás el plan hasta el fin del período pagado.
      </p>

      {subs.length ? (
        <div className="card overflow-hidden">
          <div className="border-b border-line px-5 py-3 text-sm font-semibold">Historial</div>
          <ul className="divide-y divide-line text-sm">
            {subs.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <span>
                  {PLANS[s.plan]?.name ?? s.plan} · {fmtDate(s.created_at)}
                  {s.paid_until && s.status !== "authorized" ? <span className="text-mute"> · acceso hasta {fmtDate(s.paid_until)}</span> : null}
                </span>
                <span className="flex items-center gap-3">
                  {s.status === "pending" && s.checkout_url ? (
                    <a href={s.checkout_url} className="font-semibold text-celeste-700 underline">Completar pago</a>
                  ) : null}
                  <Badge tone={STATUS[s.status]?.tone ?? "neutral"}>{STATUS[s.status]?.label ?? s.status}</Badge>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function Notice({ sub, baja, error, until }: { sub?: Subscription; baja: boolean; error?: string; until: string | null }) {
  if (error) return <p className="rounded-xl bg-bad-50 px-4 py-3 text-sm text-bad">{error}</p>;
  if (baja)
    return (
      <p className="rounded-xl bg-paper px-4 py-3 text-sm">
        Cancelamos tu suscripción. {until ? `Seguís con tu plan hasta el ${fmtDate(until)}.` : "Volviste al plan de prueba."}
      </p>
    );
  if (!sub) return null;
  if (sub.status === "authorized")
    return (
      <p className="rounded-xl bg-ok-50 px-4 py-3 text-sm text-ok">
        ¡Listo! Tu plan {PLANS[sub.plan]?.name} ya está activo. <Link href="/app/marcas/nueva" className="font-semibold underline">Cargá un cliente</Link>.
      </p>
    );
  return (
    <p className="rounded-xl bg-sol-50 px-4 py-3 text-sm text-[#6b4700]">
      Mercado Pago todavía no confirmó el pago. Suele tardar unos segundos: recargá la página en un momento. Si no lo completaste, podés retomarlo desde el historial.
    </p>
  );
}
