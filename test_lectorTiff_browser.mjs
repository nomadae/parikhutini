#!/usr/bin/env node
// E2E de lectorTiff.html con Brave headless vía CDP (sin dependencias nuevas:
// WebSocket y fetch globales de Node 24).
// Levanta vite (npm start), navega a la página, carga data/mde/nt/mde_nt.tif
// en el input de archivo y verifica metadatos, render y ausencia de errores.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const BRAVE = "/opt/brave.com/brave/brave-browser";
const PORT = 9222;
const TIF = path.join(ROOT, "data/mde/nt/mde_nt.tif"); // Int16 en tiles con 228982 NoData: ejercita el enmascarado
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "brave-cdp-"));

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

let failures = 0;
const check = (cond, msg) => {
    if (cond) console.log(`  ok    ${msg}`);
    else { failures++; console.error(`  FALLO ${msg}`); }
};

// 1) Servir la raíz del repo con vite
const vite = spawn("npm", ["start"], { cwd: ROOT, stdio: "ignore", detached: true });
let served = false;
for (let i = 0; i < 30; i++) {
    try { const r = await fetch("http://localhost:5173/lectorTiff.html"); if (r.ok) { served = true; break; } } catch {}
    await sleep(500);
}
if (!served) {
    console.error("vite no sirvió lectorTiff.html en http://localhost:5173");
    try { process.kill(-vite.pid); } catch {}
    process.exit(1);
}

// 2) Brave headless
let brave;
async function launch(extraFlags = []) {
    brave = spawn(BRAVE, [
        "--headless=new", `--remote-debugging-port=${PORT}`,
        "--remote-debugging-address=127.0.0.1", "--no-first-run", "--no-default-browser-check",
        "--disable-gpu", "--disable-dev-shm-usage", `--user-data-dir=${userDataDir}`,
        ...extraFlags, "about:blank",
    ], { stdio: "ignore" });
}
await launch();
let endpoint = null;
for (let i = 0; i < 30 && !endpoint; i++) {
    await sleep(500);
    try { endpoint = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); }
    catch { if (i === 15) { brave.kill(); await sleep(500); await launch(["--no-sandbox"]); } }
}
if (!endpoint) {
    console.error("Brave no levantó el endpoint CDP");
    try { process.kill(-vite.pid); } catch {}
    process.exit(1);
}

// 3) WebSocket CDP
const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
const page = targets.find(t => t.type === "page");
if (!page) {
    console.error("no hay target de página en CDP");
    brave.kill();
    try { process.kill(-vite.pid); } catch {}
    process.exit(1);
}
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

let msgId = 0;
const pending = new Map();
const problems = [];
ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    else if (m.method === "Runtime.exceptionThrown")
        problems.push("excepción: " + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
    else if (m.method === "Log.entryAdded" && m.params.entry.level === "error") {
        // El 404 del favicon.ico (la página no tiene favicon) es ruido, no un error de la página
        if ((m.params.entry.url || "").includes("favicon.ico")) return;
        problems.push("log error: " + m.params.entry.text + " " + (m.params.entry.url || ""));
    }
    else if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error")
        problems.push("console.error: " + m.params.args.map(a => a.value ?? a.description).join(" "));
};
const send = (method, params = {}) => new Promise((resolve) => {
    const id = ++msgId;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, returnByValue: true });
    if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.text);
    return r.result.result.value;
};

// 4) Secuencia CDP
await send("Runtime.enable");
await send("Page.enable");
await send("Log.enable");
await send("DOM.enable");
await send("Page.navigate", { url: "http://localhost:5173/lectorTiff.html" });

// 5) Esperar carga (verifica también el orden de los scripts: UTIF antes del inline)
let loaded = false;
for (let i = 0; i < 40; i++) {
    if (await evaluate(`document.readyState === "complete" && typeof UTIF !== "undefined"`)) { loaded = true; break; }
    await sleep(500);
}
check(loaded, "página cargada con UTIF disponible antes del script inline");

// 6) Seleccionar el DEM en input#tiffFile (dispara el evento change)
const doc = await send("DOM.getDocument");
const q = await send("DOM.querySelector", { nodeId: doc.result.root.nodeId, selector: "input#tiffFile" });
await send("DOM.setFileInputFiles", { nodeId: q.result.nodeId, files: [TIF] });

// 7) Esperar el procesamiento
let fileName = "", fileInfo = "";
for (let i = 0; i < 60; i++) {                                  // hasta 30 s
    fileName = await evaluate(`document.getElementById("fileName").textContent`);
    fileInfo = await evaluate(`document.getElementById("fileInfo").textContent`);
    if (fileName.startsWith("Archivo:") && !fileInfo.includes("Procesando")) break;
    await sleep(500);
}

// 8) Leer estado de la página (metadata/elevationData son `let` de ámbito global)
const state = JSON.parse(await evaluate(`JSON.stringify({
    fileName: document.getElementById("fileName").textContent,
    fileInfo: document.getElementById("fileInfo").textContent,
    width: metadata.width, height: metadata.height,
    min: metadata.minElevation, max: metadata.maxElevation,
    dataType: metadata.dataType, noData: metadata.noData,
    len: elevationData.length,
    ctor: elevationData.constructor.name,
    canvasW: document.getElementById("elevationCanvas").width,
    canvasH: document.getElementById("elevationCanvas").height
})`));

// 9) Píxeles transparentes == píxeles NoData (verifica visualizeElevation)
const alpha = JSON.parse(await evaluate(`(() => {
    const c = document.getElementById("elevationCanvas");
    const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    let a0 = 0, a255 = 0;
    for (let i = 3; i < d.length; i += 4) { if (d[i] === 0) a0++; else if (d[i] === 255) a255++; }
    return JSON.stringify({ a0, a255, total: c.width * c.height });
})()`));

// 10) Ejercitar el botón de orientación (aspect) y leer su resultado
const aspectText = await evaluate(`(function() {
    calculateAspect();
    return document.getElementById("analysisResults").textContent;
})()`);

// 11) Captura de pantalla
const shot = await send("Page.captureScreenshot", { format: "png" });
fs.writeFileSync(path.join(ROOT, "lectorTiff_browser.png"), Buffer.from(shot.result.data, "base64"));

// 12) Verificaciones
check(state.fileName.startsWith("Archivo: mde_nt.tif"), "nombre de archivo mostrado: " + state.fileName);
check(!state.fileInfo.includes("Error"), "sin errores en fileInfo: " + state.fileInfo.slice(0, 80));
check(state.width === 2249 && state.height === 2177, `dimensiones ${state.width}x${state.height}`);
check(state.min === 1918 && state.max === 4646, `min/max sin NoData: ${state.min}/${state.max}`);
check(state.dataType === "Int16", "dataType Int16");
check(state.noData === -32768, "NoData -32768 detectado");
check(state.len === 2249 * 2177, `elevationData.length ${state.len}`);
check(state.ctor === "Int16Array", "elevationData es Int16Array");
check(state.canvasW === 2249 && state.canvasH === 2177, "canvas a tamaño del ráster");
check(alpha.a0 === 228982 && alpha.a255 === alpha.total - 228982,
    `NoData transparentes: alpha0=${alpha.a0} alpha255=${alpha.a255}`);
check(aspectText.includes("Orientación media") && aspectText.includes("dominante"),
    "aspect calculado: " + aspectText.slice(0, 80));
check(problems.length === 0, "sin excepciones ni errores de consola" + (problems.length ? ": " + problems.join(" | ") : ""));

// 13) Limpieza
try { process.kill(-vite.pid); } catch {}
brave.kill();
fs.rmSync(userDataDir, { recursive: true, force: true });
console.log(failures === 0 ? "TODO OK" : `${failures} comprobaciones fallidas`);
process.exit(failures === 0 ? 0 : 1);
