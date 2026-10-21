import Link from "next/link";
import { Logo } from "./ui";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-line/70 bg-paper/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <Logo />
        <nav className="hidden items-center gap-6 text-sm font-medium text-mute md:flex">
          <Link href="/#como-funciona" className="hover:text-ink">Cómo funciona</Link>
          <Link href="/#agencias" className="hover:text-ink">Para agencias</Link>
          <Link href="/precios" className="hover:text-ink">Precios</Link>
          <Link href="/checker" className="hover:text-ink">Checker gratis</Link>
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/ingresar" className="hidden text-sm font-semibold text-mute hover:text-ink sm:block">
            Ingresar
          </Link>
          <Link href="/demo" className="btn-primary btn-sm">
            Ver la demo
          </Link>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-white">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-4">
        <div className="sm:col-span-2">
          <Logo />
          <p className="mt-3 max-w-sm text-sm text-mute">
            Medición de visibilidad en respuestas de IA para marcas y agencias de Argentina. Hecho en Buenos Aires.
          </p>
        </div>
        <div className="text-sm">
          <div className="mb-2 font-semibold">Producto</div>
          <ul className="space-y-1.5 text-mute">
            <li><Link href="/checker" className="hover:text-ink">Checker gratis</Link></li>
            <li><Link href="/precios" className="hover:text-ink">Precios</Link></li>
            <li><Link href="/demo" className="hover:text-ink">Demo</Link></li>
            <li><Link href="/registro" className="hover:text-ink">Crear cuenta</Link></li>
          </ul>
        </div>
        <div className="text-sm">
          <div className="mb-2 font-semibold">Empresa</div>
          <ul className="space-y-1.5 text-mute">
            <li><Link href="/contacto" className="hover:text-ink">Contacto</Link></li>
            <li><Link href="/#metodologia" className="hover:text-ink">Metodología</Link></li>
            <li><Link href="/#faq" className="hover:text-ink">Preguntas frecuentes</Link></li>
            <li><Link href="/privacidad" className="hover:text-ink">Privacidad</Link></li>
            <li><Link href="/terminos" className="hover:text-ink">Términos</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-line py-4 text-center text-xs text-mute">© {new Date().getFullYear()} ChapaGEO</div>
    </footer>
  );
}
