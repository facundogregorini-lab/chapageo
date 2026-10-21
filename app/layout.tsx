import type { Metadata } from "next";
import { Hanken_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const sans = Hanken_Grotesk({ subsets: ["latin"], weight: ["300", "400", "500", "600", "700"], variable: "--font-lx-sans", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-lx-mono", display: "swap" });

export const metadata: Metadata = {
  title: { default: "ChapaGEO · Visibilidad de tu marca en ChatGPT, Gemini y más", template: "%s · ChapaGEO" },
  description:
    "Medí cuándo ChatGPT, Gemini, Perplexity y Claude recomiendan a tu marca o a tu competencia en Argentina. Respuestas verificables, share of voice y acciones concretas.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR" className={`${sans.variable} ${mono.variable}`}>
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
