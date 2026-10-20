import { NextResponse } from "next/server";
import { logEvent } from "@/lib/events";

const ALLOWED = new Set(["landing_view", "checker_start", "pricing_click", "pricing_view", "report_view", "whatsapp_click", "demo_click"]);

export async function POST(req: Request) {
  try {
    const { name, props, visitor } = await req.json();
    if (typeof name === "string" && ALLOWED.has(name)) {
      await logEvent(name, typeof props === "object" && props ? props : {}, typeof visitor === "string" ? visitor.slice(0, 64) : null);
    }
  } catch {
    /* ignorar */
  }
  return new NextResponse(null, { status: 204 });
}
