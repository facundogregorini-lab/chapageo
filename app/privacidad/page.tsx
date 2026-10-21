import Link from "next/link";
import { LegalPage } from "@/components/LegalPage";

export const metadata = { title: "Política de privacidad" };

export default function Page() {
  return (
    <LegalPage eyebrow="Legal" title="Política de privacidad">
      <p>
        Esta política explica qué datos personales trata ChapaGEO, para qué, con quién se comparten y cómo podés ejercer tus derechos. Se rige por la Ley
        25.326 de Protección de Datos Personales de la República Argentina y su normativa complementaria.
      </p>

      <h2>1. Qué datos recolectamos</h2>
      <ul>
        <li>
          <strong>Cuenta:</strong> nombre, empresa, email y contraseña. La contraseña se guarda cifrada con un algoritmo de hash; nadie del equipo puede
          leerla.
        </li>
        <li>
          <strong>Ingreso con Google:</strong> si elegís «Continuar con Google», Google nos envía tu email, tu nombre y un identificador de tu cuenta de
          Google. No recibimos tu contraseña de Google ni accedemos a tu Gmail, Drive, contactos ni a otros servicios de Google.
        </li>
        <li>
          <strong>Contenido que cargás:</strong> datos de tus clientes y marcas (nombre, dominio, descripción, rubro, competidores), las preguntas que
          aprobás y la configuración de cada análisis.
        </li>
        <li>
          <strong>Resultados:</strong> las respuestas que devuelven los asistentes de IA, sus fuentes, capturas de pantalla y las condiciones de cada
          consulta.
        </li>
        <li>
          <strong>Formularios de contacto y checker gratis:</strong> nombre, email, empresa, teléfono, dominio y el mensaje que nos dejes; en el checker,
          el dominio y el rubro que ingresás.
        </li>
        <li>
          <strong>Uso del sitio:</strong> eventos de navegación propios (por ejemplo, qué páginas se visitan) asociados a un identificador aleatorio
          guardado en tu navegador, y un resumen cifrado (hash) de tu dirección IP para limitar el uso del checker gratis. No usamos herramientas de
          publicidad ni vendemos datos.
        </li>
      </ul>

      <h2>2. Para qué los usamos</h2>
      <ul>
        <li>Prestar el servicio: crear tu cuenta, correr los análisis y mostrarte los resultados e informes.</li>
        <li>Responder consultas y pedidos de diagnóstico.</li>
        <li>Mantener la seguridad del servicio y prevenir abusos.</li>
        <li>Medir de forma agregada cómo se usa el producto para mejorarlo.</li>
      </ul>

      <h2>3. Cookies y almacenamiento local</h2>
      <p>
        Usamos una cookie de sesión necesaria para mantenerte conectado (<code>cg_session</code>), una cookie temporal que protege el ingreso con Google
        y se borra al terminarlo (<code>cg_google</code>, dura como máximo 10 minutos) y un identificador aleatorio en el almacenamiento local
        del navegador para las estadísticas de uso propias. No usamos cookies de terceros con fines publicitarios.
      </p>

      <h2>4. Con quién se comparten</h2>
      <p>Para funcionar, ChapaGEO usa proveedores que tratan datos por nuestra cuenta:</p>
      <ul>
        <li>
          <strong>Alojamiento y base de datos:</strong> Vercel (hosting de la web) y Turso (base de datos). Los servidores pueden estar fuera de
          Argentina.
        </li>
        <li>
          <strong>Asistentes de IA:</strong> para medir visibilidad, enviamos las preguntas aprobadas a servicios como ChatGPT (OpenAI), Gemini
          (Google), Claude (Anthropic) o Perplexity, por su interfaz web o su API, directamente o a través de proveedores de captura web que actúan por nuestra cuenta. Las preguntas pueden incluir el nombre de tu cliente, su rubro y sus
          competidores. Para sugerir preguntas, también podemos enviar texto público del sitio de tu cliente. No enviamos tus datos de cuenta.
        </li>
        <li>
          <strong>Google:</strong> si usás el ingreso con Google, Google procesa ese inicio de sesión según su propia política de privacidad.
        </li>
        <li>
          <strong>Pagos:</strong> si contratás un plan, el pago se procesa en la plataforma de pago correspondiente (por ejemplo, Mercado Pago), con su
          propia política de privacidad. ChapaGEO no guarda datos de tarjetas.
        </li>
      </ul>
      <p>
        Los informes que compartís por link privado pueden verlos quienes tengan ese link. Podés cambiar el link desde la sección «Informe» del cliente para
        cortar el acceso.
      </p>
      <p>Fuera de estos casos, solo compartimos datos si una autoridad competente lo exige por ley.</p>

      <h2>5. Datos que recibimos de Google</h2>
      <p>
        Usamos los datos que nos da Google (email, nombre e identificador de la cuenta) solo para crear tu cuenta de ChapaGEO, vincularla con una cuenta
        que ya tenías con el mismo email y dejarte ingresar. No los compartimos con terceros, no los vendemos, no los usamos para publicidad ni para
        entrenar modelos de IA. El uso que hace ChapaGEO de la información recibida de las APIs de Google cumple la{" "}
        <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer">
          Política de datos del usuario de los servicios de las APIs de Google
        </a>
        , incluidos los requisitos de uso limitado. Podés quitarle el acceso a ChapaGEO cuando quieras desde{" "}
        <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer">
          la configuración de tu cuenta de Google
        </a>
        ; para borrar también los datos guardados en ChapaGEO, pedí la baja desde <Link href="/contacto">contacto</Link>.
      </p>

      <h2>6. Transferencia internacional</h2>
      <p>
        Algunos de los proveedores mencionados procesan datos fuera de Argentina. Al usar el servicio aceptás esa transferencia, que se hace con
        proveedores que aplican medidas de seguridad razonables.
      </p>

      <h2>7. Cuánto tiempo los guardamos</h2>
      <p>
        Mientras tu cuenta esté activa. Si pedís la baja, eliminamos tu cuenta, tus clientes, análisis y resultados en un plazo razonable, salvo lo que
        debamos conservar por obligación legal. Los datos de formularios de contacto se guardan mientras sean útiles para responder y hacer seguimiento
        comercial, o hasta que pidas su eliminación.
      </p>

      <h2>8. Seguridad</h2>
      <p>
        Los datos de cada agencia están aislados de los de las demás. Las sesiones de los asistentes de IA que usa ChapaGEO para medir quedan solo en
        nuestros servidores de recolección y nunca se exponen en la web. Ningún sistema es infalible: si detectamos un incidente que afecte tus datos,
        te avisamos.
      </p>

      <h2>9. Tus derechos</h2>
      <p>
        Podés pedir acceso, rectificación, actualización o supresión de tus datos personales escribiéndonos desde{" "}
        <Link href="/contacto">contacto</Link>. Respondemos dentro de los plazos de la Ley 25.326: 10 días corridos para el acceso y 5 días hábiles
        para la rectificación o supresión.
      </p>
      <p>
        El titular de los datos personales tiene la facultad de ejercer el derecho de acceso a los mismos en forma gratuita a intervalos no inferiores a
        seis meses, salvo que se acredite un interés legítimo al efecto conforme lo establecido en el artículo 14, inciso 3 de la Ley N° 25.326. La
        Agencia de Acceso a la Información Pública, en su carácter de Órgano de Control de la Ley N° 25.326, tiene la atribución de atender las
        denuncias y reclamos que interpongan quienes resulten afectados en sus derechos por incumplimiento de las normas vigentes en materia de
        protección de datos personales.
      </p>

      <h2>10. Datos de los clientes de las agencias</h2>
      <p>
        Cuando una agencia carga información de sus clientes, la agencia es responsable de contar con autorización para hacerlo. ChapaGEO trata esa
        información solo para prestar el servicio a la agencia.
      </p>

      <h2>11. Cambios</h2>
      <p>
        Si cambiamos esta política, actualizamos la fecha de arriba. Si el cambio es importante, te avisamos por email o dentro del producto. Ver también
        los <Link href="/terminos">términos y condiciones</Link>.
      </p>
    </LegalPage>
  );
}
