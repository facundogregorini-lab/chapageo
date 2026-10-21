"use client";

import { useEffect } from "react";

// Efectos de la landing: nav al hacer scroll, barra de progreso, aparición de bloques,
// luz que sigue al cursor, inclinación del mock y la línea del ciclo.
export function LandingFx() {
  useEffect(() => {
    const root = document.documentElement;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const nav = document.querySelector<HTMLElement>(".lx-nav");
    const bar = document.querySelector<HTMLElement>(".lx-progress > div");
    const cursor = document.querySelector<HTMLElement>(".lx-cursor");
    const tilt = document.querySelector<HTMLElement>(".lx-tilt");

    const onScroll = () => {
      const y = window.scrollY;
      if (nav) nav.dataset.scrolled = y > 8 ? "1" : "0";
      const max = root.scrollHeight - window.innerHeight;
      if (bar) bar.style.transform = `scaleX(${max > 0 ? Math.min(1, y / max) : 0})`;
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const el = e.target as HTMLElement;
          if (el.hasAttribute("data-rv")) el.dataset.shown = "1";
          if (el.classList.contains("lx-loop")) el.dataset.fired = "1";
          io.unobserve(el);
        }
      },
      { rootMargin: "0px 0px -12% 0px" },
    );
    if (!reduce) {
      root.classList.add("lx-rv-ready");
      document.querySelectorAll("[data-rv]").forEach((el) => io.observe(el));
    }
    document.querySelectorAll<HTMLElement>(".lx-loop").forEach((el) => (reduce ? (el.dataset.fired = "1") : io.observe(el)));

    const onMove = (ev: PointerEvent) => {
      if (cursor) {
        cursor.style.opacity = "1";
        cursor.style.transform = `translate(${ev.clientX}px, ${ev.clientY}px)`;
      }
      const spot = (ev.target as HTMLElement | null)?.closest<HTMLElement>("[data-spot]");
      if (spot) {
        const r = spot.getBoundingClientRect();
        spot.style.setProperty("--mx", `${ev.clientX - r.left}px`);
        spot.style.setProperty("--my", `${ev.clientY - r.top}px`);
      }
      if (tilt && !reduce) {
        const r = tilt.getBoundingClientRect();
        const dx = (ev.clientX - (r.left + r.width / 2)) / window.innerWidth;
        const dy = (ev.clientY - (r.top + r.height / 2)) / window.innerHeight;
        tilt.style.transform = `rotateY(${dx * 8}deg) rotateX(${-dy * 8}deg)`;
      }
    };
    window.addEventListener("pointermove", onMove, { passive: true });

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pointermove", onMove);
      io.disconnect();
      root.classList.remove("lx-rv-ready");
    };
  }, []);
  return null;
}
