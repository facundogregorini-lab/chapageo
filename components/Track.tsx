"use client";

import { useEffect } from "react";

function visitor(): string {
  try {
    let v = localStorage.getItem("cg_v");
    if (!v) {
      v = Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem("cg_v", v);
    }
    return v;
  } catch {
    return "anon";
  }
}

export function track(name: string, props: Record<string, unknown> = {}) {
  try {
    const body = JSON.stringify({ name, props, visitor: visitor() });
    if (navigator.sendBeacon) navigator.sendBeacon("/api/track", new Blob([body], { type: "application/json" }));
    else fetch("/api/track", { method: "POST", body, headers: { "content-type": "application/json" }, keepalive: true });
  } catch {
    /* sin tracking no se rompe nada */
  }
}

export function TrackView({ name, props }: { name: string; props?: Record<string, unknown> }) {
  useEffect(() => {
    track(name, { ...props, ref: document.referrer || null, path: location.pathname });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

export function TrackLink({ name, props, href, className, children, target }: { name: string; props?: Record<string, unknown>; href: string; className?: string; children: React.ReactNode; target?: string }) {
  return (
    <a href={href} className={className} target={target} rel={target ? "noopener noreferrer" : undefined} onClick={() => track(name, props)}>
      {children}
    </a>
  );
}
