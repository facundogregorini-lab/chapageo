import Link from "next/link";

export function LandingLogo() {
  return (
    <Link href="/" className="lx-logo" aria-label="ChapaGEO, inicio">
      <span className="lx-logo-mark" aria-hidden />
      ChapaGEO
    </Link>
  );
}

export function LandingAmbient() {
  return (
    <>
      <div className="lx-progress" aria-hidden>
        <div />
      </div>
      <div className="lx-ambient" aria-hidden>
        <div className="lx-orb lx-orb-1" />
        <div className="lx-orb lx-orb-2" />
        <div className="lx-grid" />
        <div className="lx-cursor" />
      </div>
    </>
  );
}

export function LandingNav() {
  return (
    <header className="lx-nav">
      <LandingLogo />
      <nav className="lx-pill" aria-label="Secciones">
        <a href="#como-funciona">Cómo funciona</a>
        <a href="#agencias">Para agencias</a>
        <a href="#marcas">Para marcas</a>
        <a href="#precios">Precios</a>
        <a href="#faq">Preguntas</a>
      </nav>
      <div className="lx-nav-right">
        <Link href="/ingresar" className="lx-nav-login">
          Ingresar
        </Link>
        <Link href="/demo" className="lx-btn lx-btn-primary lx-btn-sm">
          Ver la demo
        </Link>
      </div>
    </header>
  );
}

export function LandingFooter() {
  return (
    <footer className="lx-footer">
      <div className="lx-wrap">
        <div className="lx-footer-top">
          <div className="lx-footer-brand">
            <LandingLogo />
            <p>Medición de visibilidad en respuestas de IA para marcas y agencias de Argentina. Hecho en Buenos Aires.</p>
          </div>
          <div className="lx-footer-cols">
            <div className="lx-footer-col">
              <p className="lx-mono">Producto</p>
              <ul>
                <li><Link href="/checker">Checker gratis</Link></li>
                <li><Link href="/precios">Precios</Link></li>
                <li><Link href="/demo">Demo</Link></li>
                <li><Link href="/registro">Crear cuenta</Link></li>
                <li><Link href="/ingresar">Ingresar</Link></li>
              </ul>
            </div>
            <div className="lx-footer-col">
              <p className="lx-mono">Recursos</p>
              <ul>
                <li><a href="#como-funciona">Cómo funciona</a></li>
                <li><a href="#metodologia">Metodología</a></li>
                <li><a href="#faq">Preguntas frecuentes</a></li>
              </ul>
            </div>
            <div className="lx-footer-col">
              <p className="lx-mono">Empresa</p>
              <ul>
                <li><Link href="/contacto">Contacto</Link></li>
                <li><Link href="/privacidad">Privacidad</Link></li>
                <li><Link href="/terminos">Términos</Link></li>
              </ul>
            </div>
          </div>
        </div>
        <div className="lx-footer-bottom lx-mono">© {new Date().getFullYear()} ChapaGEO. Todos los derechos reservados.</div>
      </div>
    </footer>
  );
}
