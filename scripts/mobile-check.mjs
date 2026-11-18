// SanoÓptica — Revisión visual en varios tamaños de pantalla (teléfono pequeño, teléfono, teléfono acostado, tablet, portátil)
// Uso: node mobile-check.mjs [url=http://127.0.0.1:5191/?emu=1] [carpeta]
// Entra a la demo y recorre todas las pantallas y el portal: detecta desbordes horizontales, tablas cortadas,
// textos que se salen de su caja y errores de JavaScript.
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const URL_ = process.argv[2] || 'http://127.0.0.1:5191/?emu=1';
const OUT = path.resolve(process.argv[3] || 'shots-mobile');
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SIZES = [['320', 320, 640, true], ['360', 360, 760, true], ['390', 390, 844, true], ['acostado', 844, 390, true], ['tablet', 820, 1180, true], ['portatil', 1280, 720, false]];
const VIEWS = ['inicio', 'agenda', 'examenes', 'ordenes', 'venta', 'pacientes', 'recordatorios', 'inventario', 'laboratorios', 'cobranza', 'caja', 'gastos', 'reportes', 'ajustes'];
const errs = []; const problems = [];

const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const ctx = await b.createBrowserContext();
const p = await ctx.newPage();
p.on('pageerror', (e) => errs.push(e.message));
p.on('dialog', (d) => d.accept());
await p.setViewport({ width: 1280, height: 800 });
await p.goto(URL_, { waitUntil: 'domcontentloaded', timeout: 60000 }); await p.waitForSelector('#lg-demo', { timeout: 60000 });
await p.click('#lg-demo');
await p.waitForSelector('.country-grid [data-c="VE"]', { timeout: 60000 });
await p.click('.country-grid [data-c="VE"]'); await sleep(300);
await p.evaluate(() => [...document.querySelectorAll('.modal [data-ok]')].pop().click());
await p.waitForFunction(() => document.body.innerText.includes('Modo demo') && !document.getElementById('boot'), { timeout: 180000 });
await sleep(1500);
await p.evaluate(async () => (await import('/js/tour.js')).stopTour());
// PIN de la demo para los reportes (una vez por sesión)
await p.evaluate(async () => { const o = await import('/js/ops.js'); await o.publishPortals(); await new Promise((r) => setTimeout(r, 800)); await o.publishPortals(); });
await sleep(2000);
const { code, rxc, bk } = await p.evaluate(async () => { const { store } = await import('/js/store.js'); const pt = store.patients.find((x) => store.ordersOf(x.id).some((o) => o.kind !== 'venta' && !['entregada', 'anulada'].includes(o.status))); return { code: pt?.portalCode, rxc: store.exams[0]?.verify, bk: store.settings.bookingCode }; });

const audit = () => p.evaluate(() => {
  const out = [];
  const vw = window.innerWidth;
  if (document.documentElement.scrollWidth > vw + 1) out.push(`página +${document.documentElement.scrollWidth - vw}px`);
  document.querySelectorAll('.table-wrap').forEach((t) => { if (t.offsetParent && t.scrollWidth > t.clientWidth + 2) out.push(`tabla cortada +${t.scrollWidth - t.clientWidth}px`); });
  document.querySelectorAll('.btn, .badge, .chip, .kpi-value, .card-title, .tb-title, .view-title').forEach((el) => {
    if (!el.offsetParent) return;
    // dentro de una franja con desplazamiento (chips, pestañas) es intencional
    for (let x = el.parentElement; x && x !== document.body; x = x.parentElement) { const ov = getComputedStyle(x).overflowX; if ((ov === 'auto' || ov === 'scroll') && x.scrollWidth > x.clientWidth) return; }
    const r = el.getBoundingClientRect();
    if (r.right > vw + 1 || r.left < -1) out.push(`fuera de pantalla: ${el.className.split(' ')[0]} «${el.innerText.trim().slice(0, 24)}»`);
  });
  return [...new Set(out)].slice(0, 6);
});

for (const [name, w, h, mobile] of SIZES) {
  await p.setViewport({ width: w, height: h, isMobile: mobile, hasTouch: mobile });
  for (const v of VIEWS) {
    await p.evaluate((r) => { location.hash = '#/' + r; }, v); await sleep(900);
    const pin = await p.$('.modal [data-pin]');
    if (pin) { await pin.type('1234'); await p.evaluate(() => [...document.querySelectorAll('.modal [data-ok]')].pop().click()); await sleep(900); }
    const a = await audit();
    if (a.length) problems.push(`${name} / ${v}: ${a.join(' · ')}`);
    await p.screenshot({ path: path.join(OUT, `${name}-${v}.png`) });
  }
  // Ficha de un paciente y de una orden
  await p.evaluate(async () => (await import('/js/patient.js')).openPatient(((await import('/js/store.js')).store.debtors[0] || (await import('/js/store.js')).store.patients[0]).id)); await sleep(700);
  const a = await audit(); if (a.length) problems.push(`${name} / ficha: ${a.join(' · ')}`);
  await p.screenshot({ path: path.join(OUT, `${name}-ficha.png`) });
  await p.evaluate(async () => (await import('/js/utils.js')).closeAllModals()); await sleep(300);
  await p.evaluate(async () => (await import('/js/order.js')).openOrder((await import('/js/store.js')).store.activeOrders[0].id)); await sleep(700);
  const a2 = await audit(); if (a2.length) problems.push(`${name} / orden: ${a2.join(' · ')}`);
  await p.screenshot({ path: path.join(OUT, `${name}-orden.png`) });
  await p.evaluate(async () => (await import('/js/utils.js')).closeAllModals()); await sleep(300);
}
// Portal del paciente, fórmula y agenda (páginas públicas) en teléfono pequeño y grande
const q = await (await b.createBrowserContext()).newPage();
q.on('pageerror', (e) => errs.push('portal: ' + e.message));
for (const [name, w, h] of [['320', 320, 640], ['390', 390, 844], ['tablet', 820, 1180]]) {
  await q.setViewport({ width: w, height: h, isMobile: true, hasTouch: true });
  await q.goto(URL_.replace(/\/(\?.*)?$/, `/paciente/${code}$1`), { waitUntil: 'domcontentloaded', timeout: 60000 });
  await q.waitForSelector('.portal-hero', { timeout: 20000 });
  for (const t of ['lentes', 'formula', 'pagos', 'citas']) {
    const has = await q.$(`[data-t="${t}"]`); if (!has) continue;
    await q.evaluate((x) => document.querySelector(`.portal-tabs [data-t="${x}"]`)?.click(), t); await sleep(500);
    const a = await q.evaluate(() => { const vw = innerWidth; return document.documentElement.scrollWidth > vw + 1 ? [`página +${document.documentElement.scrollWidth - vw}px`] : []; });
    if (a.length) problems.push(`portal ${name} / ${t}: ${a.join(' · ')}`);
    await q.screenshot({ path: path.join(OUT, `portal-${name}-${t}.png`), fullPage: true });
  }
  for (const [tag, url] of [['formula', `/formula/${rxc}`], ['cita', `/cita/${bk}`]]) {
    await q.goto(URL_.replace(/\/(\?.*)?$/, `${url}$1`), { waitUntil: 'domcontentloaded', timeout: 60000 }); await sleep(2200);
    const a = await q.evaluate(() => { const vw = innerWidth; return document.documentElement.scrollWidth > vw + 1 ? [`página +${document.documentElement.scrollWidth - vw}px`] : []; });
    if (a.length) problems.push(`${tag} ${name}: ${a.join(' · ')}`);
    await q.screenshot({ path: path.join(OUT, `${tag}-${name}.png`), fullPage: true });
  }
}
await p.evaluate(() => document.getElementById('demo-end')?.click());
await p.waitForSelector('.modal [data-yes]').then(() => p.click('.modal [data-yes]')).catch(() => {});
await p.waitForSelector('#login-form', { timeout: 90000 }).catch(() => {});
await b.close();
console.log(problems.length ? 'PROBLEMAS:\n  ' + problems.join('\n  ') : 'Sin problemas de diseño en ' + SIZES.length + ' tamaños');
console.log('Errores de JavaScript:', errs.length ? [...new Set(errs)].join(' | ') : 'ninguno');
process.exit(problems.length || errs.length ? 1 : 0);
