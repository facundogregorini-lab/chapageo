// Funciones que corren DENTRO del navegador. Van como texto (no como funciones de TypeScript)
// para que el compilador no les inyecte helpers que no existen en la página.

/** Convierte el mensaje del asistente a Markdown liviano (conserva listas numeradas y links). */
export const DOM_TO_MARKDOWN = String.raw`(root, exclude) => {
  const NL = String.fromCharCode(10);
  const TICK = String.fromCharCode(96);
  const clone = root.cloneNode(true);
  for (const sel of exclude) clone.querySelectorAll(sel).forEach((n) => n.remove());
  clone.querySelectorAll("button, svg, style, script, [aria-hidden='true']").forEach((n) => n.remove());
  const walk = (node) => {
    if (node.nodeType === 3) return (node.textContent || "").replace(/\s+/g, " ");
    if (node.nodeType !== 1) return "";
    const el = node;
    const tag = el.tagName.toLowerCase();
    const kids = () => Array.from(el.childNodes).map(walk).join("");
    switch (tag) {
      case "h1": case "h2": case "h3": case "h4": case "h5": case "h6":
        return NL + NL + "#".repeat(Math.min(4, Number(tag[1]))) + " " + kids().trim() + NL + NL;
      case "p": return NL + NL + kids().trim() + NL + NL;
      case "br": return NL;
      case "strong": case "b": { const t = kids().trim(); return t ? "**" + t + "**" : ""; }
      case "em": case "i": { const t = kids().trim(); return t ? "*" + t + "*" : ""; }
      case "code": return el.closest("pre") ? kids() : TICK + kids() + TICK;
      case "pre": return NL + NL + TICK + TICK + TICK + NL + (el.textContent || "").trim() + NL + TICK + TICK + TICK + NL + NL;
      case "a": {
        const href = el.href;
        const t = kids().trim();
        return /^https?:/.test(href) && t ? "[" + t + "](" + href + ")" : t;
      }
      case "ol": case "ul": {
        let i = Number(el.getAttribute("start") || 1);
        const items = Array.from(el.children)
          .filter((c) => c.tagName.toLowerCase() === "li")
          .map((li) => {
            const body = Array.from(li.childNodes).map(walk).join("").trim().split(NL).filter((x) => x.trim()).join(NL);
            return tag === "ol" ? (i++) + ". " + body : "- " + body;
          });
        return NL + NL + items.join(NL) + NL + NL;
      }
      case "table": {
        const rows = Array.from(el.querySelectorAll("tr")).map((tr) => "| " + Array.from(tr.children).map((td) => (td.textContent || "").trim().split("|").join("/")).join(" | ") + " |");
        if (rows.length > 1) rows.splice(1, 0, "| " + rows[0].split("|").slice(1, -1).map(() => "---").join(" | ") + " |");
        return NL + NL + rows.join(NL) + NL + NL;
      }
      case "blockquote": return NL + NL + "> " + kids().trim() + NL + NL;
      default: return kids();
    }
  };
  return walk(clone).split(NL).map((l) => l.replace(/[ \t]+$/, "")).join(NL).replace(/\n{3,}/g, NL + NL).trim();
}`;

/** Links http(s) dentro del mensaje. */
export const LINKS_IN = String.raw`(root) => Array.from(root.querySelectorAll("a[href]"))
  .map((a) => ({ url: a.href, title: (a.textContent || "").trim().slice(0, 200) }))
  .filter((l) => /^https?:\/\//.test(l.url))`;

/**
 * Convierte el texto en una función que Playwright serializa tal cual (fn.toString()).
 * No usa eval dentro de la página, así que no choca con la CSP del sitio.
 */
export function inPage<A, R>(src: string): (el: Element, arg: A) => R {
  return new Function("el", "arg", `return (${src})(el, arg);`) as (el: Element, arg: A) => R;
}
