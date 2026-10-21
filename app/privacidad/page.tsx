import Link from "next/link";
import { LegalPage } from "@/components/LegalPage";

export const metadata = { title: "Política de privacidad" };

export default function Page() {
  return (
    <LegalPage title="Política de privacidad" updated="21 de octubre de 2026">
      <p>
        Esta política explica qué datos personales recolecta ChapaGEO (chapageo.vercel.app), para qué los usa y qué podés hacer
        con ellos. ChapaGEO mide cómo aparecen las marcas en las respuestas de asistentes de IA; para eso no necesita más datos
        personales que los de la cuenta.
      </p>

      <h2>Qué datos recolectamos</h2>
      <ul>
        <li><strong>Cuenta:</strong> email, nombre (si lo cargás), nombre de la empresa o agencia y la contraseña, que guardamos cifrada con un hash irreversible.</li>
        <li><strong>Ingreso con Google:</strong> si elegís «Continuar con Google», recibimos de Google tu email, tu nombre y un identificador de tu cuenta de Google. No recibimos tu contraseña de Google ni accedemos a tu Gmail, Drive, contactos ni a ningún otro servicio.</li>
        <li><strong>Contacto:</strong> lo que completes en los formularios de contacto o diagnóstico (email, nombre, empresa, teléfono, dominio y mensaje).</li>
        <li><strong>Datos del servicio:</strong> las marcas, dominios, competidores y preguntas que cargues, y los resultados de los análisis.</li>
        <li><strong>Uso del sitio:</strong> eventos básicos de navegación (por ejemplo, que se vio la página de precios), asociados a un identificador aleatorio guardado en tu navegador, no a tu nombre.</li>
      </ul>

      <h2>Para qué los usamos</h2>
      <ul>
        <li>Crear tu cuenta, dejarte ingresar y mantener separado el espacio de cada agencia.</li>
        <li>Prestar el servicio: correr los análisis que pedís y mostrarte los resultados.</li>
        <li>Responder tus consultas y, si lo pediste, contactarte por el plan o el diagnóstico.</li>
        <li>Entender, en conjunto, qué partes del sitio se usan, para mejorarlo.</li>
      </ul>
      <p>No vendemos datos personales ni los usamos para publicidad.</p>

      <h2>Datos de Google</h2>
      <p>
        Usamos los datos que nos da Google (email, nombre e identificador) solo para crear tu cuenta o vincularla a una que ya
        tenías con el mismo email, y para que puedas ingresar. No los compartimos con terceros, no los usamos para publicidad ni
        para entrenar modelos de IA. El uso que hace ChapaGEO de la información recibida de las APIs de Google cumple la{" "}
        <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer">
          Política de datos del usuario de los servicios de las APIs de Google
        </a>
        , incluidos los requisitos de uso limitado. Podés quitarle el acceso a ChapaGEO cuando quieras desde{" "}
        <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer">la configuración de tu cuenta de Google</a>.
      </p>

      <h2>Con quién se comparten</h2>
      <p>Solo con los proveedores que necesitamos para que el servicio funcione:</p>
      <ul>
        <li><strong>Vercel</strong>, que aloja la web, y <strong>Turso</strong>, que aloja la base de datos.</li>
        <li><strong>Google</strong>, si usás el ingreso con Google.</li>
        <li>
          <strong>Asistentes de IA</strong> (ChatGPT, Gemini, Claude o Perplexity, según el análisis): les enviamos las preguntas
          sobre las marcas, no tus datos personales.
        </li>
        <li><strong>Mercado Pago</strong>, si pagás un plan: el pago se hace en su sitio y con sus condiciones.</li>
      </ul>
      <p>También podemos entregar datos si una autoridad competente lo exige por ley.</p>

      <h2>Cookies y almacenamiento</h2>
      <ul>
        <li><code>cg_session</code>: mantiene tu sesión iniciada durante 30 días.</li>
        <li><code>cg_google</code>: protege el ingreso con Google y se borra al terminar (dura como máximo 10 minutos).</li>
        <li><code>cg_v</code> (almacenamiento local del navegador): el identificador aleatorio de las estadísticas de uso.</li>
      </ul>
      <p>No usamos cookies de publicidad.</p>

      <h2>Cuánto tiempo los guardamos</h2>
      <p>
        Mientras tu cuenta esté activa. Si pedís que la borremos, eliminamos la cuenta y los datos de tu espacio, salvo lo que
        tengamos que conservar por obligación legal.
      </p>

      <h2>Tus derechos</h2>
      <p>
        Podés pedir acceso, rectificación o supresión de tus datos en cualquier momento escribiéndonos desde{" "}
        <Link href="/contacto">la página de contacto</Link>. Te respondemos dentro de los plazos de la Ley 25.326 de Protección de
        los Datos Personales. Si no quedás conforme con la respuesta, podés reclamar ante la Agencia de Acceso a la Información
        Pública (AAIP), autoridad de control de esa ley.
      </p>

      <h2>Seguridad</h2>
      <p>
        Las conexiones van cifradas (HTTPS), las contraseñas se guardan con hash y cada agencia solo puede ver los datos de su
        propio espacio. Ningún sistema es infalible, pero si detectamos un incidente que afecte tus datos, te avisamos.
      </p>

      <h2>Cambios</h2>
      <p>Si cambiamos esta política, actualizamos la fecha de arriba y, si el cambio es importante, te avisamos por email.</p>
    </LegalPage>
  );
}
