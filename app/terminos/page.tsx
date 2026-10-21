import Link from "next/link";
import { LegalPage } from "@/components/LegalPage";

export const metadata = { title: "Términos y condiciones" };

export default function Page() {
  return (
    <LegalPage eyebrow="Legal" title="Términos y condiciones">
      <p>
        Estos términos regulan el uso de ChapaGEO (el «servicio»), una herramienta para medir cómo aparecen las marcas en las respuestas de asistentes de
        inteligencia artificial. Al crear una cuenta o usar el servicio aceptás estos términos y la <Link href="/privacidad">política de privacidad</Link>.
      </p>

      <h2>1. Qué hace el servicio</h2>
      <p>
        ChapaGEO envía preguntas a asistentes de IA (por ejemplo ChatGPT, Gemini, Claude o Perplexity), guarda sus respuestas, fuentes y evidencia, y las
        resume en métricas, informes y sugerencias de mejora. Cada resultado indica con qué método se obtuvo (captura web, API oficial o datos de
        demostración) y bajo qué condiciones.
      </p>

      <h2>2. Qué no garantiza</h2>
      <ul>
        <li>
          Las respuestas de los asistentes de IA cambian con el tiempo, la cuenta, el país, el idioma y otros factores. Los resultados son una muestra
          tomada en un momento y bajo condiciones registradas, no una medición exacta de lo que ve cada usuario.
        </li>
        <li>
          Las oportunidades de mejora son sugerencias basadas en la evidencia recolectada. No garantizamos que una marca aparezca, suba de posición o
          mantenga su visibilidad en ningún asistente.
        </li>
        <li>
          ChapaGEO no está afiliado a OpenAI, Google, Anthropic, Perplexity ni otros proveedores de IA. Sus servicios pueden cambiar o dejar de estar
          disponibles, y eso puede afectar a una parte o a la totalidad de las mediciones.
        </li>
        <li>Los datos de demostración son simulados y están rotulados como tales; no representan respuestas reales.</li>
      </ul>

      <h2>3. Tu cuenta</h2>
      <ul>
        <li>Tenés que dar datos verdaderos y mantener tu contraseña en reserva. Sos responsable de lo que se haga desde tu cuenta.</li>
        <li>Si sos una agencia, sos responsable de contar con autorización de tus clientes para cargar su información y analizar sus marcas.</li>
      </ul>

      <h2>4. Uso aceptable</h2>
      <p>No podés usar el servicio para:</p>
      <ul>
        <li>Cargar contenido ilegal, que infrinja derechos de terceros o datos personales sin autorización.</li>
        <li>Intentar acceder a datos de otras cuentas, vulnerar la seguridad o sobrecargar el servicio.</li>
        <li>Revender el acceso o automatizar consultas por fuera de los límites de tu plan.</li>
      </ul>
      <p>Podemos suspender cuentas que incumplan estos puntos.</p>

      <h2>5. Límites de uso</h2>
      <p>
        Cada plan tiene límites de clientes, preguntas, motores y ejecuciones. Los límites vigentes se muestran en la sección de ajustes de tu cuenta y
        en la página de <Link href="/precios">precios</Link>. Un análisis puede quedar parcial si algún asistente no responde o pide una verificación;
        en ese caso lo indicamos y no lo contamos como ausencia de la marca.
      </p>

      <h2>6. Planes y pagos</h2>
      <p>
        Los precios figuran en la página de <Link href="/precios">precios</Link>. Los pagos se procesan en plataformas de terceros. Salvo que se acuerde
        otra cosa por escrito, los planes mensuales se renuevan solos cada mes y se pueden cancelar en cualquier momento desde «Plan y pago»: no se
        vuelve a cobrar y conservás el plan hasta el fin del período pagado. El consumidor tiene derecho a revocar la contratación dentro de los 10
        días corridos desde que contrató, según la Ley 24.240 de Defensa del Consumidor, desde el{" "}
        <Link href="/arrepentimiento">botón de arrepentimiento</Link>.
      </p>

      <h2>7. Propiedad de los datos</h2>
      <p>
        Los datos que cargás y los informes generados para tus clientes son tuyos: podés exportarlos en CSV o imprimirlos. ChapaGEO conserva los
        derechos sobre el software, la marca y la metodología. Podemos usar estadísticas agregadas y anónimas sobre el uso del servicio para mejorarlo.
      </p>

      <h2>8. Disponibilidad y responsabilidad</h2>
      <p>
        Trabajamos para que el servicio esté disponible y funcione bien, pero se ofrece «tal como está»: puede tener interrupciones, errores o cambios.
        En la medida que lo permita la ley, ChapaGEO no responde por decisiones comerciales tomadas a partir de los resultados ni por daños indirectos o
        lucro cesante. Nada en estos términos limita los derechos que te otorga la ley de defensa del consumidor.
      </p>

      <h2>9. Baja</h2>
      <p>
        Podés pedir la baja de tu cuenta en cualquier momento desde <Link href="/contacto">contacto</Link>. Antes de darla de baja podés exportar tus
        datos.
      </p>

      <h2>10. Cambios a estos términos</h2>
      <p>
        Si cambiamos estos términos, actualizamos la fecha de arriba y, si el cambio es importante, te avisamos con anticipación. Si seguís usando el
        servicio después del cambio, se entiende que lo aceptás.
      </p>

      <h2>11. Ley aplicable</h2>
      <p>
        Estos términos se rigen por las leyes de la República Argentina. Ante un conflicto, son competentes los tribunales ordinarios de la Ciudad
        Autónoma de Buenos Aires, sin perjuicio de los derechos del consumidor a litigar en su domicilio.
      </p>
    </LegalPage>
  );
}
