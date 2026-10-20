import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "ChapaGEO · Visibilidad de tu marca en ChatGPT, Gemini y más", template: "%s · ChapaGEO" },
  description:
    "Medí cuándo ChatGPT, Gemini, Perplexity y Claude recomiendan a tu marca o a tu competencia en Argentina. Respuestas verificables, share of voice y acciones concretas.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR">
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
