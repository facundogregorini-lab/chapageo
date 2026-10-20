// Conector de DEMOSTRACIÓN: genera respuestas simuladas sin red. Solo se habilita en
// espacios marcados como demo y todo lo que produce queda rotulado como "demo".

import type { EngineId } from "../config";
import { simulatedAnswer } from "../engines/simulated";
import type { CollectInput, CollectResult, Collector } from "./types";

export function demoCollector(id: string, engine: EngineId): Collector {
  return {
    id,
    engine,
    method: "demo",
    async collect(input: CollectInput): Promise<CollectResult> {
      const started = Date.now();
      // Solo para pruebas de la cola: simula la demora de una captura real.
      const delay = Number(process.env.DEMO_COLLECTOR_DELAY_MS || 0);
      if (delay > 0) await new Promise((r) => setTimeout(r, delay));
      const ctx = input.demoContext ?? { repetition: 1, brand: { name: "Marca", domain: "marca.com" }, competitors: [], branded: false };
      const res = simulatedAnswer(
        { prompt: input.prompt, country: input.requestedCountry, language: input.language },
        { engine, repetition: ctx.repetition, brand: ctx.brand, competitors: ctx.competitors, branded: ctx.branded },
      );
      return {
        status: "completed",
        answerText: res.answer,
        citations: res.sources,
        screenshotReference: null,
        collectedAt: new Date().toISOString(),
        engine,
        modelIfVisible: "simulado",
        collectionMethod: "demo",
        observedCountry: null,
        locationVerification: "no_aplica",
        searchMode: "simulado",
        sessionType: "simulada",
        duration: Date.now() - started,
        error: null,
        costUsd: 0,
      };
    },
  };
}
