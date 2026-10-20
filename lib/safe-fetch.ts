// Descarga de páginas públicas con protección SSRF.
//
// - Solo http/https, sin credenciales en la URL y en puertos estándar.
// - Resuelve el DNS nosotros y valida TODAS las IPs: bloquea redes privadas, loopback,
//   link-local (incluye 169.254.169.254, metadatos de nube), CGNAT, multicast, reservadas,
//   y sus equivalentes IPv6 (incluidas IPv4 mapeadas/embebidas).
// - La conexión usa la IP ya validada (lookup propio), así un DNS que cambia entre la
//   validación y la conexión no sirve para saltear el control.
// - Los redirects se siguen a mano y cada salto se vuelve a validar.
// - Límites de tamaño, de tiempo total y de cantidad de redirects.

import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";

export class BlockedUrlError extends Error {}

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((a, o) => (a << 8) + Number(o), 0) >>> 0;
}

const V4_BLOCKS: [string, number][] = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

function inV4(ip: string, base: string, bits: number) {
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(base) & mask);
}

function expandV6(ip: string): number[] | null {
  let s = ip.toLowerCase().split("%")[0];
  // IPv4 al final (::ffff:1.2.3.4)
  const v4 = s.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (v4) {
    const n = ipv4ToInt(v4[1]);
    s = s.slice(0, -v4[1].length) + ((n >>> 16) & 0xffff).toString(16) + ":" + (n & 0xffff).toString(16);
  }
  const [head, tail] = s.split("::");
  const h = head ? head.split(":") : [];
  const t = tail !== undefined ? (tail ? tail.split(":") : []) : [];
  if (tail === undefined && h.length !== 8) return null;
  const fill = 8 - h.length - t.length;
  if (fill < 0) return null;
  const parts = [...h, ...Array(tail !== undefined ? fill : 0).fill("0"), ...t].map((x) => parseInt(x || "0", 16));
  return parts.length === 8 && parts.every((x) => Number.isFinite(x)) ? parts : null;
}

function embeddedV4(p: number[]): string {
  return `${p[6] >> 8}.${p[6] & 255}.${p[7] >> 8}.${p[7] & 255}`;
}

export function isBlockedIp(ip: string): boolean {
  if (net.isIPv4(ip)) return V4_BLOCKS.some(([b, bits]) => inV4(ip, b, bits)) || ip === "255.255.255.255";
  if (!net.isIPv6(ip)) return true;
  const p = expandV6(ip);
  if (!p) return true;
  const allZeroPrefix = p.slice(0, 5).every((x) => x === 0);
  if (p.every((x) => x === 0)) return true; // ::
  if (allZeroPrefix && p[5] === 0 && p[6] === 0 && p[7] === 1) return true; // ::1
  if (allZeroPrefix && (p[5] === 0xffff || p[5] === 0)) return isBlockedIp(embeddedV4(p)); // ::ffff:a.b.c.d y ::a.b.c.d
  if (p[0] === 0x64 && p[1] === 0xff9b) return isBlockedIp(embeddedV4(p)); // NAT64
  if (p[0] === 0x2002) return isBlockedIp(`${p[1] >> 8}.${p[1] & 255}.${p[2] >> 8}.${p[2] & 255}`); // 6to4
  if ((p[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 (incluye fd00:ec2::254)
  if ((p[0] & 0xffc0) === 0xfe80) return true; // link-local
  if ((p[0] & 0xff00) === 0xff00) return true; // multicast
  if (p[0] === 0x2001 && p[1] === 0x0db8) return true; // documentación
  if (p[0] === 0x0100 && p[1] === 0 && p[2] === 0 && p[3] === 0) return true; // discard
  return false;
}

const BLOCKED_HOSTS = [/^localhost$/i, /\.localhost$/i, /\.local$/i, /\.internal$/i, /^metadata$/i, /^metadata\.google\.internal$/i, /\.home\.arpa$/i];

type LookupFn = (hostname: string) => Promise<{ address: string; family: number }[]>;

const systemLookup: LookupFn = (hostname) => dns.promises.lookup(hostname, { all: true, verbatim: true });

export type SafeFetchOptions = {
  maxBytes?: number;
  timeoutMs?: number;
  maxRedirects?: number;
  accept?: string;
};

export type SafeResponse = { status: number; url: string; contentType: string; body: string; truncated: boolean; redirects: number };

export type SafeFetchConfig = {
  lookup?: LookupFn;
  isBlockedAddress?: (ip: string) => boolean;
  allowedPorts?: number[];
  userAgent?: string;
};

export function createSafeFetch(cfg: SafeFetchConfig = {}) {
  const lookup = cfg.lookup ?? systemLookup;
  const blocked = cfg.isBlockedAddress ?? isBlockedIp;
  const ports = cfg.allowedPorts ?? [80, 443];
  const ua = cfg.userAgent ?? "Mozilla/5.0 (compatible; ChapaGEO-Lector/0.2; +https://chapageo.vercel.app)";

  async function validate(raw: string): Promise<{ url: URL; address: string; family: number }> {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw new BlockedUrlError("URL inválida");
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new BlockedUrlError("Solo se permiten URLs http/https");
    if (url.username || url.password) throw new BlockedUrlError("La URL no puede incluir credenciales");
    const port = url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80;
    if (!ports.includes(port)) throw new BlockedUrlError("Puerto no permitido");
    const host = url.hostname.replace(/^\[|\]$/g, "");
    if (BLOCKED_HOSTS.some((re) => re.test(host))) throw new BlockedUrlError("Destino interno bloqueado");
    if (net.isIP(host)) {
      if (blocked(host)) throw new BlockedUrlError("Destino privado o reservado bloqueado");
      return { url, address: host, family: net.isIPv6(host) ? 6 : 4 };
    }
    const addrs = await lookup(host);
    if (!addrs.length) throw new BlockedUrlError("El dominio no resuelve");
    // Si ALGUNA IP es privada, se bloquea: evita respuestas DNS mixtas.
    if (addrs.some((a) => blocked(a.address))) throw new BlockedUrlError("El dominio resuelve a una red privada o reservada");
    return { url, address: addrs[0].address, family: addrs[0].family };
  }

  function once(target: { url: URL; address: string; family: number }, opts: Required<SafeFetchOptions>, deadline: number) {
    return new Promise<{ status: number; location: string | null; contentType: string; body: string; truncated: boolean }>((resolve, reject) => {
      const mod = target.url.protocol === "https:" ? https : http;
      const remaining = deadline - Date.now();
      if (remaining <= 0) return reject(new Error("Tiempo agotado"));
      const req = mod.request(
        target.url,
        {
          method: "GET",
          headers: { "user-agent": ua, accept: opts.accept, "accept-language": "es-AR,es;q=0.9" },
          // Conectamos a la IP validada; el SNI y el Host siguen siendo el dominio.
          lookup: ((_h: string, o: { all?: boolean }, cb: (...args: unknown[]) => void) => {
            if (o?.all) cb(null, [{ address: target.address, family: target.family }]);
            else cb(null, target.address, target.family);
          }) as unknown as net.LookupFunction,
          agent: false,
        },
        (res) => {
          const status = res.statusCode ?? 0;
          const location = status >= 300 && status < 400 ? (res.headers.location ?? null) : null;
          const contentType = String(res.headers["content-type"] ?? "");
          if (location) {
            res.resume();
            return resolve({ status, location, contentType, body: "", truncated: false });
          }
          const chunks: Buffer[] = [];
          let size = 0;
          let truncated = false;
          res.on("data", (c: Buffer) => {
            if (truncated) return;
            size += c.length;
            if (size > opts.maxBytes) {
              truncated = true;
              chunks.push(c.subarray(0, c.length - (size - opts.maxBytes)));
              req.destroy();
              resolve({ status, location: null, contentType, body: Buffer.concat(chunks).toString("utf8"), truncated });
              return;
            }
            chunks.push(c);
          });
          res.on("end", () => resolve({ status, location: null, contentType, body: Buffer.concat(chunks).toString("utf8"), truncated }));
          res.on("error", reject);
        },
      );
      req.setTimeout(remaining, () => req.destroy(new Error("Tiempo agotado")));
      req.on("error", reject);
      req.end();
    });
  }

  return async function safeFetch(rawUrl: string, options: SafeFetchOptions = {}): Promise<SafeResponse> {
    const opts: Required<SafeFetchOptions> = {
      maxBytes: options.maxBytes ?? 1_000_000,
      timeoutMs: options.timeoutMs ?? 8000,
      maxRedirects: options.maxRedirects ?? 3,
      accept: options.accept ?? "text/html,text/plain;q=0.9,*/*;q=0.1",
    };
    const deadline = Date.now() + opts.timeoutMs;
    let current = rawUrl;
    for (let hop = 0; hop <= opts.maxRedirects; hop++) {
      const target = await validate(current);
      const r = await once(target, opts, deadline);
      if (r.location) {
        current = new URL(r.location, target.url).toString();
        continue;
      }
      return { status: r.status, url: target.url.toString(), contentType: r.contentType, body: r.body, truncated: r.truncated, redirects: hop };
    }
    throw new BlockedUrlError("Demasiados redirects");
  };
}

export const safeFetch = createSafeFetch();
