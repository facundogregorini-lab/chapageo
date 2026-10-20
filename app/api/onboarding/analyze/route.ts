import { NextResponse } from "next/server";
import { cleanDomain } from "@/lib/analyze";
import { getCtx } from "@/lib/auth";
import { fetchHome } from "@/lib/audit";
import { guessBrandName } from "@/lib/suggest";

export const maxDuration = 30;

export async function POST(req: Request) {
  if (!(await getCtx())) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { domain } = await req.json();
  const d = cleanDomain(String(domain ?? ""));
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d)) return NextResponse.json({ error: "Ese dominio no parece válido." }, { status: 400 });
  const home = await fetchHome(d);
  return NextResponse.json({
    domain: d,
    reachable: home.reachable,
    name: guessBrandName(home.title, home.siteName, d),
    description: home.description ?? home.h1 ?? "",
  });
}
