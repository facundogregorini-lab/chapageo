export function Methodology() {
  return (
    <details className="card p-5 text-sm">
      <summary className="cursor-pointer font-semibold">Cómo se calcula cada número</summary>
      <ul className="mt-3 list-disc space-y-1.5 pl-5 text-mute">
        <li><strong className="text-ink">Respuesta válida:</strong> ejecución completada con texto. Las fallidas, parciales, pendientes o bloqueadas (CAPTCHA, login, límite) no cuentan como ausencia: quedan fuera del denominador y se ven en la cobertura.</li>
        <li><strong className="text-ink">Presencia:</strong> respuestas válidas que mencionan la marca / respuestas válidas. Se detectan el nombre, los alias y el dominio con límites de palabra (no por fragmentos de otras palabras).</li>
        <li><strong className="text-ink">Cuota de menciones:</strong> respuestas que mencionan cada marca / suma de respuestas que mencionan a cada marca seguida. Cada marca cuenta como máximo una vez por respuesta.</li>
        <li><strong className="text-ink">Citaciones:</strong> respuestas válidas con al menos un enlace o fuente al dominio. Nombrar el dominio en el texto sin enlace no cuenta.</li>
        <li><strong className="text-ink">Fuentes:</strong> dominios y URLs enlazados en respuestas válidas, con su frecuencia.</li>
        <li><strong className="text-ink">Cobertura:</strong> ejecuciones válidas / ejecuciones solicitadas.</li>
        <li><strong className="text-ink">Tipos de pregunta:</strong> descubrimiento (sin marca ni competidores), comparación y alternativas, y sobre la marca. Nunca se suman entre sí: preguntar por la marca sesga la mención.</li>
        <li><strong className="text-ink">Agregado «Todos los motores»:</strong> suma las respuestas válidas de cada motor dentro del mismo tipo de pregunta; cada respuesta pesa igual, así que el motor con más respuestas válidas pesa más.</li>
        <li><strong className="text-ink">Orden de mención vs. puesto:</strong> el orden es en qué lugar aparece la marca entre las seguidas. El puesto solo existe si la respuesta trae una lista numerada y la marca está en un ítem.</li>
        <li><strong className="text-ink">Método:</strong> captura de interfaz web, API oficial y datos de demostración son mediciones distintas y se rotulan siempre. Una captura fallida nunca se reemplaza por una respuesta de API.</li>
      </ul>
    </details>
  );
}
