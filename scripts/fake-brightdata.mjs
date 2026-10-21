// Bright Data simulado para probar el checker de punta a punta en local (sin gastar consultas).
// Uso: node scripts/fake-brightdata.mjs  y levantar la web con BRIGHTDATA_API_BASE=http://127.0.0.1:4567
// GET /ready marca el snapshot como listo.
import http from "node:http";
let inputs = [], ready = false;
http.createServer((req, res) => {
  let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => {
    const u = new URL(req.url, "http://x"); const send = (s, d) => { res.writeHead(s, { "content-type": "application/json" }); res.end(JSON.stringify(d)); };
    console.log(req.method, u.pathname);
    if (u.pathname === "/ready") { ready = true; return send(200, {}); }
    if (u.pathname === "/datasets/v3/trigger") { inputs = JSON.parse(b).input; return send(200, { snapshot_id: "s_e2e" }); }
    if (u.pathname.startsWith("/datasets/v3/progress/")) return send(200, { status: ready ? "ready" : "running" });
    if (u.pathname.startsWith("/datasets/v3/snapshot/")) return ready ? send(200, inputs.map((i) => ({ prompt: i.prompt, answer_text: "Recomiendo Tucan y Rival.", citations: [{ url: "https://tucan.la/x" }] }))) : send(202, { status: "building" });
    send(404, {});
  });
}).listen(4567);
