// Configuración de producto: motores, planes y ofertas.
// Precios y límites salen del benchmark de Astra (pestaña "GEO AEO Benchmark"):
// son hipótesis a validar, no precios de mercado demostrados.

export type EngineId = "chatgpt" | "gemini" | "perplexity" | "claude";

export const ENGINES: Record<
  EngineId,
  { label: string; envKey: string; color: string; vendor: string }
> = {
  chatgpt: { label: "ChatGPT", envKey: "OPENAI_API_KEY", color: "#10a37f", vendor: "OpenAI" },
  gemini: { label: "Gemini", envKey: "GEMINI_API_KEY", color: "#4f7cff", vendor: "Google" },
  perplexity: { label: "Perplexity", envKey: "PERPLEXITY_API_KEY", color: "#20808d", vendor: "Perplexity" },
  claude: { label: "Claude", envKey: "ANTHROPIC_API_KEY", color: "#d97757", vendor: "Anthropic" },
};

export const ENGINE_IDS = Object.keys(ENGINES) as EngineId[];

export function engineConfigured(id: EngineId): boolean {
  return Boolean(process.env[ENGINES[id].envKey]);
}

export type PlanId = "prueba" | "diagnostico" | "marca" | "agencia";

export type Plan = {
  id: PlanId;
  name: string;
  priceUsd: number;
  period: "único" | "mes" | null;
  tagline: string;
  maxBrands: number;
  promptPool: number;
  maxEngines: number;
  repetitions: number;
  prospectsPerMonth: number;
  whiteLabel: boolean;
  features: string[];
  payEnv?: string;
  highlight?: boolean;
};

export const PLANS: Record<PlanId, Plan> = {
  prueba: {
    id: "prueba",
    name: "Prueba",
    priceUsd: 0,
    period: null,
    tagline: "Para ver el producto con tu marca",
    maxBrands: 1,
    promptPool: 10,
    maxEngines: 2,
    repetitions: 1,
    prospectsPerMonth: 2,
    whiteLabel: false,
    features: ["1 marca", "10 preguntas", "2 motores", "1 repetición por corrida"],
  },
  diagnostico: {
    id: "diagnostico",
    name: "Diagnóstico 48 h",
    priceUsd: 149,
    period: "único",
    tagline: "Sabé en 48 horas cuándo la IA recomienda a tu competencia",
    maxBrands: 1,
    promptPool: 20,
    maxEngines: 2,
    repetitions: 3,
    prospectsPerMonth: 0,
    whiteLabel: false,
    features: [
      "1 marca, 1 país, 3 competidores",
      "20 preguntas comerciales acordadas con vos",
      "ChatGPT + Gemini, 3 repeticiones (120 respuestas)",
      "Respuestas originales y fuentes verificables",
      "3 mejoras redactadas, listas para implementar",
      "Sesión de 30 minutos para revisar el reporte",
    ],
    payEnv: "PAY_LINK_DIAGNOSTICO",
    highlight: true,
  },
  marca: {
    id: "marca",
    name: "Monitoreo",
    priceUsd: 99,
    period: "mes",
    tagline: "Seguimiento semanal para una marca",
    maxBrands: 1,
    promptPool: 20,
    maxEngines: 2,
    repetitions: 3,
    prospectsPerMonth: 0,
    whiteLabel: false,
    features: [
      "20 preguntas × 2 motores × 3 repeticiones",
      "4 cortes por mes (480 respuestas)",
      "Share of voice, citas y sentimiento",
      "Backlog de acciones con evidencia",
      "Reporte mensual + revisión breve",
    ],
    payEnv: "PAY_LINK_MARCA",
  },
  agencia: {
    id: "agencia",
    name: "Agencia",
    priceUsd: 299,
    period: "mes",
    tagline: "Vendé GEO a tu cartera con tu marca",
    maxBrands: 10,
    promptPool: 60,
    maxEngines: 4,
    repetitions: 3,
    prospectsPerMonth: 15,
    whiteLabel: true,
    features: [
      "Pool de 60 preguntas para repartir entre clientes",
      "Clientes ilimitados hasta 10 marcas activas",
      "Los 4 motores: ChatGPT, Gemini, Perplexity y Claude",
      "15 auditorías de prospección por mes",
      "Reportes white-label con tu logo y colores",
      "Exportación CSV y links privados para clientes",
    ],
    payEnv: "PAY_LINK_AGENCIA",
  },
};

export const COUNTRIES = [
  { code: "AR", name: "Argentina" },
  { code: "UY", name: "Uruguay" },
  { code: "CL", name: "Chile" },
  { code: "MX", name: "México" },
  { code: "CO", name: "Colombia" },
  { code: "PE", name: "Perú" },
  { code: "ES", name: "España" },
] as const;

export function countryName(code: string) {
  return COUNTRIES.find((c) => c.code === code)?.name ?? code;
}

export function payLink(plan: Plan): string | null {
  return plan.payEnv ? process.env[plan.payEnv] || null : null;
}

export function salesWhatsapp(text: string): string | null {
  const n = process.env.SALES_WHATSAPP;
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : null;
}

export const APP_NAME = "ChapaGEO";
