"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginAction, registerAction } from "@/app/actions";

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

export function RegisterForm() {
  const [state, action, pending] = useActionState(registerAction, undefined);
  return (
    <form action={action} className="space-y-4">
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
      <button className="btn-primary w-full" disabled={pending}>{pending ? "Creando…" : "Crear cuenta gratis"}</button>
      <p className="text-center text-xs text-mute">Plan de prueba: 1 marca, 10 preguntas y 2 motores. Sin tarjeta.</p>
      <p className="text-center text-sm text-mute">
        ¿Ya tenés cuenta? <Link href="/ingresar" className="font-semibold text-ink underline">Ingresá</Link>
      </p>
    </form>
  );
}
