import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import { BlockedUrlError, createSafeFetch, isBlockedIp, safeFetch } from "../lib/safe-fetch";

test("bloquea IPs privadas, locales, de metadatos y equivalentes IPv6", () => {
  for (const ip of [
    "127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.100.100.200", "0.0.0.0", "224.0.0.1",
    "::1", "::", "fe80::1", "fd00:ec2::254", "fc00::1", "::ffff:127.0.0.1", "::ffff:169.254.169.254", "64:ff9b::a9fe:a9fe", "2002:7f00:1::1",
  ]) assert.equal(isBlockedIp(ip), true, ip);
  for (const ip of ["8.8.8.8", "200.45.1.1", "2800:3f0:4002:80b::200e"]) assert.equal(isBlockedIp(ip), false, ip);
});

test("rechaza destinos internos antes de conectar", async () => {
  for (const url of [
    "http://127.0.0.1/",
    "http://localhost/",
    "http://169.254.169.254/latest/meta-data/",
    "http://[::1]/",
    "http://0x7f000001/",
    "http://2130706433/",
    "http://metadata.google.internal/",
    "file:///etc/passwd",
    "ftp://example.com/",
    "http://user:pass@example.com/",
    "http://example.com:8080/",
  ]) {
    await assert.rejects(safeFetch(url), BlockedUrlError, url);
  }
});

test("rechaza dominios que resuelven a redes privadas (incluido DNS mixto)", async () => {
  const f = createSafeFetch({
    lookup: async (h) => (h === "mixto.test" ? [{ address: "8.8.8.8", family: 4 }, { address: "10.0.0.5", family: 4 }] : [{ address: "192.168.0.10", family: 4 }]),
  });
  await assert.rejects(f("http://interno.test/"), /red privada/);
  await assert.rejects(f("http://mixto.test/"), /red privada/);
});

let server: http.Server;
let port = 0;
before(async () => {
  server = http.createServer((req, res) => {
    if (req.url === "/a-metadata") return res.writeHead(302, { location: "http://169.254.169.254/latest/meta-data/" }).end();
    if (req.url === "/a-dns-privado") return res.writeHead(301, { location: "http://interno.test/" }).end();
    if (req.url === "/loop") return res.writeHead(302, { location: "/loop" }).end();
    if (req.url === "/grande") {
      res.writeHead(200, { "content-type": "text/html" });
      return res.end("x".repeat(50_000));
    }
    if (req.url === "/lento") return setTimeout(() => res.end("tarde"), 3000);
    res.writeHead(200, { "content-type": "text/html" }).end("<title>ok</title>");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  port = (server.address() as AddressInfo).port;
});
after(() => server.close());

// Para probar redirects necesitamos permitir SOLO el servidor de prueba (loopback) en el primer salto.
const testFetch = () =>
  createSafeFetch({
    allowedPorts: [80, 443, port],
    isBlockedAddress: (ip) => (ip === "127.0.0.1" ? false : isBlockedIp(ip)),
    lookup: async (h) => (h === "interno.test" ? [{ address: "10.0.0.7", family: 4 }] : [{ address: "127.0.0.1", family: 4 }]),
  });

test("vuelve a validar cada redirect", async () => {
  const f = testFetch();
  const ok = await f(`http://127.0.0.1:${port}/`);
  assert.equal(ok.status, 200);
  await assert.rejects(f(`http://127.0.0.1:${port}/a-metadata`), BlockedUrlError);
  await assert.rejects(f(`http://127.0.0.1:${port}/a-dns-privado`), BlockedUrlError);
  await assert.rejects(f(`http://127.0.0.1:${port}/loop`), /Demasiados redirects/);
});

test("respeta límites de tamaño y tiempo", async () => {
  const f = testFetch();
  const big = await f(`http://127.0.0.1:${port}/grande`, { maxBytes: 1000 });
  assert.equal(big.truncated, true);
  assert.equal(big.body.length, 1000);
  await assert.rejects(f(`http://127.0.0.1:${port}/lento`, { timeoutMs: 300 }), /Tiempo agotado|socket hang up|aborted/);
});
