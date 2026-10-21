import { CheckerForm } from "@/components/CheckerForm";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { checkerUsesBrightData, pickCheckerEngine } from "@/lib/checker";
import { ENGINES } from "@/lib/config";

export const metadata = { title: "Checker de visibilidad en IA" };
export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ d?: string; c?: string }> }) {
  const { d, c } = await searchParams;
  const engine = pickCheckerEngine();
  const viaWeb = checkerUsesBrightData();
  return (
    <>
      <SiteHeader />
      <main className="mx-auto grid max-w-6xl gap-12 px-4 py-16 lg:grid-cols-[1fr_0.9fr]">
        <div>
          <div className="eyebrow">Checker gratis</div>
          <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">¿La IA recomienda tu marca?</h1>
          <p className="mt-4 max-w-lg text-lg text-mute">
            {viaWeb
              ? "Ingresá tu sitio y tu rubro. Armamos 5 preguntas que haría un cliente, se las hacemos a ChatGPT como lo haría una persona y te mostramos si aparecés, quién aparece en tu lugar y qué fuentes usa."
              : engine
              ? `Ingresá tu sitio y tu rubro. Armamos 5 preguntas que haría un cliente, se las hacemos a la API oficial de ${ENGINES[engine].label} con búsqueda web y te mostramos si aparecés, quién aparece en tu lugar y qué fuentes usa.`
              : "Ingresá tu sitio y tu rubro. Revisamos si los bots de IA pueden leerlo y te mostramos las preguntas que conviene medir."}
          </p>
          <ul className="mt-6 space-y-2 text-sm text-mute">
            <li>✓ Sin registro y sin tarjeta</li>
            <li>✓ Respuestas completas, no solo un puntaje</li>
            <li>✓ Revisión de robots.txt para bots de IA</li>
          </ul>
          {engine && !viaWeb ? (
            <p className="mt-6 text-xs text-mute">Es una vista previa por API: puede diferir de lo que ve una persona en la app. El análisis completo captura la interfaz web.</p>
          ) : null}
        </div>
        <CheckerForm initialDomain={d} initialCategory={c} />
      </main>
      <SiteFooter />
    </>
  );
}
