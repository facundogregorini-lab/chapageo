import { headers } from "next/headers";

/** Origen público del request actual (detrás del proxy de Vercel). */
export async function requestOrigin(): Promise<string | undefined> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return undefined;
  return `${h.get("x-forwarded-proto") ?? "https"}://${host}`;
}
