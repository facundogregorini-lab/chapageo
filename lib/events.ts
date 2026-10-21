import { id, now, run } from "./db";

/** Embudo de validación (PMF): visitas, checker, leads, registros, corridas. */
export async function logEvent(name: string, props: Record<string, unknown> = {}, visitor?: string | null) {
  try {
    await run("INSERT INTO events (id, name, props, visitor, created_at) VALUES (?, ?, ?, ?, ?)", [
      id("ev_"),
      name,
      JSON.stringify(props),
      visitor ?? null,
      now(),
    ]);
  } catch (e) {
    console.error("logEvent", e);
  }
}

export const FUNNEL: { name: string; label: string }[] = [
  { name: "landing_view", label: "Visitas a la landing" },
  { name: "checker_start", label: "Checker iniciado" },
  { name: "checker_done", label: "Checker con resultado" },
  { name: "lead_submit", label: "Leads (pidieron diagnóstico)" },
  { name: "pricing_click", label: "Clic en un plan" },
  { name: "signup", label: "Registros" },
  { name: "checkout_started", label: "Checkout de suscripción iniciado" },
  { name: "brand_created", label: "Marcas configuradas" },
  { name: "run_done", label: "Corridas completadas" },
  { name: "report_view", label: "Reportes compartidos vistos" },
];
