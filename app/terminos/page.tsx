import Link from "next/link";
import { LegalPage } from "@/components/LegalPage";

export const metadata = { title: "Términos y condiciones" };

export default function Page() {
  return (
    <LegalPage title="Términos y condiciones" updated="21 de octubre de 2026">
      <p>
        Estos términos rigen el uso de ChapaGEO (chapageo.vercel.app). Al crear una cuenta o usar el servicio, los aceptás. El
        tratamiento de datos personales se explica en la <Link href="/privacidad">política de privacidad</Link>.
      </p>

      <h2>Qué es ChapaGEO</h2>
      <p>
        Una herramienta que consulta asistentes de IA con preguntas sobre un rubro y registra si una marca aparece, en qué orden y
        con qué fuentes. Sirve para medir y comparar; no modifica tu sitio ni el de nadie.
      </p>

      <h2>Qué mide y qué no</h2>
      <ul>
        <li>Cada análisis es una muestra: las respuestas de los asistentes cambian según el momento, la cuenta, la ubicación y el modelo. Los resultados describen lo observado bajo las condiciones registradas en cada respuesta.</li>
        <li>No garantizamos que una marca aparezca, suba de posición ni consiga ventas por seguir las recomendaciones.</li>
        <li>Los asistentes de IA son de terceros. Si cambian o dejan de responder, un análisis puede quedar incompleto.</li>
      </ul>

      <h2>Tu cuenta</h2>
      <ul>
        <li>Tenés que dar datos verdaderos y cuidar el acceso a tu cuenta, ya sea con contraseña o con Google.</li>
        <li>Sos responsable de lo que se haga desde tu cuenta y de tener derecho a analizar las marcas y dominios que cargás.</li>
        <li>Podés dejar de usar el servicio y pedir que borremos tu cuenta cuando quieras desde <Link href="/contacto">contacto</Link>.</li>
      </ul>

      <h2>Uso permitido</h2>
      <p>No está permitido:</p>
      <ul>
        <li>usar el servicio para algo ilegal o para dañar a terceros;</li>
        <li>intentar acceder a datos de otras agencias, saltear los límites del plan o sobrecargar el servicio;</li>
        <li>revender el acceso sin un acuerdo con nosotros.</li>
      </ul>
      <p>Si se incumplen estas reglas, podemos suspender la cuenta.</p>

      <h2>Planes y pagos</h2>
      <p>
        El plan de prueba es gratis y tiene límites. Los planes pagos, sus precios y lo que incluyen están en{" "}
        <Link href="/precios">precios</Link>. Los pagos se hacen por Mercado Pago, con sus propias condiciones.
      </p>

      <h2>Tus datos y tus informes</h2>
      <p>
        Lo que cargás y los informes que se generan son tuyos y podés exportarlos. Nos das permiso para procesarlos solo en la
        medida necesaria para prestarte el servicio.
      </p>

      <h2>Disponibilidad y responsabilidad</h2>
      <p>
        Hacemos lo posible para que el servicio funcione sin cortes, pero puede haber interrupciones por mantenimiento o por fallas
        de terceros. En la medida que lo permita la ley, nuestra responsabilidad se limita a lo que hayas pagado en los últimos 3
        meses. Nada de esto limita los derechos que te da la Ley 24.240 de Defensa del Consumidor.
      </p>

      <h2>Cambios</h2>
      <p>
        Si cambiamos estos términos, actualizamos la fecha de arriba y, si el cambio es importante, te avisamos por email antes de
        que entre en vigencia.
      </p>

      <h2>Ley aplicable</h2>
      <p>Se rigen por las leyes de la República Argentina.</p>

      <h2>Contacto</h2>
      <p>
        Cualquier consulta sobre estos términos, escribinos desde <Link href="/contacto">la página de contacto</Link>.
      </p>
    </LegalPage>
  );
}
