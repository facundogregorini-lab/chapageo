"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginAction, registerAction } from "@/app/actions";

export function GoogleButton({ next, label }: { next?: string; label: string }) {
  const href = next ? `/api/auth/google?next=${encodeURIComponent(next)}` : "/api/auth/google";
  return (
    <>
      <a href={href} className="btn-ghost w-full gap-2">
        <svg aria-hidden="true" viewBox="0 0 48 48" className="h-5 w-5">
          <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
          <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
          <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
          <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
        </svg>
        {label}
      </a>
      <div className="my-5 flex items-center gap-3 text-xs text-mute">
        <span className="h-px flex-1 bg-line" />o con tu email<span className="h-px flex-1 bg-line" />
      </div>
    </>
  );
}

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(loginAction, undefined);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next ?? ""} />
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input id="email" name="email" type="email" required autoComplete="email" className="input" />
      </div>
      <div>
        <label className="label" htmlFor="password">Contraseña</label>
        <input id="password" name="password" type="password" required autoComplete="current-password" className="input" />
      </div>
      {state?.error ? <p className="text-sm text-bad">{state.error}</p> : null}
      <button className="btn-primary w-full" disabled={pending}>{pending ? "Ingresando…" : "Ingresar"}</button>
      <p className="text-center text-sm text-mute">
        ¿No tenés cuenta? <Link href="/registro" className="font-semibold text-ink underline">Creala gratis</Link>
      </p>
    </form>
  );
}

export function RegisterForm({ plan, planName }: { plan?: string; planName?: string }) {
  const [state, action, pending] = useActionState(registerAction, undefined);
  const next = plan ? `/app/plan/checkout?plan=${plan}` : undefined;
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="plan" value={plan ?? ""} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="name">Tu nombre</label>
          <input id="name" name="name" className="input" autoComplete="name" />
        </div>
        <div>
          <label className="label" htmlFor="company">Empresa o agencia</label>
          <input id="company" name="company" className="input" autoComplete="organization" />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="email">Email de trabajo</label>
        <input id="email" name="email" type="email" required className="input" autoComplete="email" />
      </div>
      <div>
        <label className="label" htmlFor="password">Contraseña</label>
        <input id="password" name="password" type="password" required minLength={8} className="input" autoComplete="new-password" />
      </div>
      {state?.error ? <p className="text-sm text-bad">{state.error}</p> : null}
      <button className="btn-primary w-full" disabled={pending}>{pending ? "Creando…" : planName ? "Crear cuenta y pagar" : "Crear cuenta gratis"}</button>
      <p className="text-center text-xs text-mute">
        {planName
          ? `Al crear la cuenta te llevamos a Mercado Pago para pagar el plan ${planName}. Se cancela cuando quieras.`
          : "Plan de prueba: 1 marca, 10 preguntas y 2 motores. Sin tarjeta."}
      </p>
      <p className="text-center text-xs text-mute">
        Al crear la cuenta aceptás los <Link href="/terminos" className="underline">términos</Link> y la{" "}
        <Link href="/privacidad" className="underline">política de privacidad</Link>.
      </p>
      <p className="text-center text-sm text-mute">
        ¿Ya tenés cuenta? <Link href={next ? `/ingresar?next=${encodeURIComponent(next)}` : "/ingresar"} className="font-semibold text-ink underline">Ingresá</Link>
      </p>
    </form>
  );
}
