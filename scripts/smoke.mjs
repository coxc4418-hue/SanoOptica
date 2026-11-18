// SanoÓptica — Recorrido rápido: todas las pantallas + demo + portales públicos (emulador)
import puppeteer from 'puppeteer-core';
import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const ORIGIN = process.argv[2] || 'http://127.0.0.1:5191';
const OUT = path.resolve(here, 'shots-smoke'); mkdirSync(OUT, { recursive: true });
const acc = JSON.parse(readFileSync(path.join(here, '.accounts-emu.json'), 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errs = [];
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
async function newPage(w = 1366, h = 860) {
  const ctx = await browser.createBrowserContext(); const p = await ctx.newPage(); await p.setViewport({ width: w, height: h });
  p.on('pageerror', (e) => errs.push(`[${p.url().slice(ORIGIN.length)}] ${e.message} @ ${(e.stack || '').split('\n').slice(1, 3).join(' ').trim()}`));
  p.on('console', (m) => { if (m.type() === 'error') errs.push(`[console ${p.url().slice(ORIGIN.length)}] ${m.text()}`); });
  p.on('dialog', (d) => d.accept());
  return { ctx, p };
}
const ROUTES = ['inicio', 'agenda', 'examenes', 'ordenes', 'venta', 'pacientes', 'recordatorios', 'inventario', 'laboratorios', 'cobranza', 'caja', 'gastos', 'reportes', 'ajustes'];
const lastModalBtn = (p, sel) => p.evaluate((s) => [...document.querySelectorAll(`.modal ${s}`)].pop()?.click(), sel);
async function tourRoutes(p, tag, pin) {
  for (const r of ROUTES) {
    await p.evaluate((x) => { location.hash = '#/' + x; }, r); await sleep(1300);
    const h = await p.$('.modal [data-pin]');
    if (h) { await p.type('.modal [data-pin]', pin); await lastModalBtn(p, '[data-ok]'); await sleep(1200); }
    await p.screenshot({ path: path.join(OUT, `${tag}-${r}.png`) });
    const empty = await p.evaluate(() => (document.querySelector('#view')?.innerText || '').trim().length);
    console.log(`  ${tag} ${r}: ${empty} chars`);
  }
}
try {
  console.log('1) sede01');
  let { ctx, p } = await newPage();
  await p.goto(ORIGIN + '/?emu=1', { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#lg-user');
  await p.screenshot({ path: path.join(OUT, '00-login.png') });
  await p.type('#lg-user', 'sede01'); await p.type('#lg-pass', acc.sede01.password); await p.click('#lg-btn');
  await p.waitForSelector('.country-grid [data-c="VE"], .sb-nav', { timeout: 60000 });
  if (await p.$('.country-grid [data-c="VE"]')) { await p.click('.country-grid [data-c="VE"]'); await sleep(250); await lastModalBtn(p, '[data-ok]'); }
  await sleep(2500);
  await p.evaluate(async () => (await import('/js/tour.js')).stopTour());
  await tourRoutes(p, 's1', acc.sede01.pin);
  await ctx.close();

  console.log('2) demo');
  ({ ctx, p } = await newPage());
  await p.goto(ORIGIN + '/?emu=1', { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#lg-demo'); await p.click('#lg-demo');
  const cg = await p.waitForSelector('.country-grid [data-c="VE"]', { timeout: 30000 }).catch(() => null);
  if (cg) { await p.click('.country-grid [data-c="VE"]'); await sleep(250); await lastModalBtn(p, '[data-ok]'); }
  const t0 = Date.now();
  await p.waitForSelector('.sb-nav', { timeout: 180000 });
  await p.waitForFunction(async () => { const { store } = await import('/js/store.js'); return store.orders?.length > 20 && (store.inbox?.length || 0) > 0 && !document.querySelector('#boot:not(.hide):not([hidden])'); }, { timeout: 240000, polling: 1000 });
  console.log('  demo sembrada en', Math.round((Date.now() - t0) / 1000), 's');
  await sleep(3000);
  await p.evaluate(async () => (await import('/js/tour.js')).stopTour());
  const info = await p.evaluate(async () => { const { store } = await import('/js/store.js'); const pt = store.patients.find((x) => store.ordersOf(x.id).some((o) => o.kind !== 'venta' && !['entregada', 'anulada'].includes(o.status))); return { pacientes: store.patients.length, examenes: store.exams.length, ordenes: store.workOrders.length, pagos: store.payments.length, inbox: store.inbox?.length, st: pt?.portalCode, rx: store.exams[0]?.verify, bk: store.settings.bookingCode }; });
  console.log('  ', JSON.stringify(info));
  await tourRoutes(p, 'demo', '1234');
  await p.evaluate(async () => { const o = await import('/js/ops.js'); await o.publishPortals(); await new Promise((r) => setTimeout(r, 800)); await o.publishPortals(); });
  await sleep(3000); // publicación de portales
  for (const [tag, url] of [['paciente', '/paciente/' + info.st], ['formula', '/formula/' + info.rx], ['cita', '/cita/' + info.bk]]) {
    const q = await newPage(390, 844);
    await q.p.goto(ORIGIN + url + '?emu=1', { waitUntil: 'domcontentloaded' }); await sleep(2500);
    await q.p.screenshot({ path: path.join(OUT, `pub-${tag}.png`), fullPage: true });
    const tabs = await q.p.$$('.portal-tabs [data-t]');
    for (let i = 1; i < tabs.length; i++) { await q.p.evaluate((k) => document.querySelectorAll('.portal-tabs [data-t]')[k].click(), i); await sleep(500); await q.p.screenshot({ path: path.join(OUT, `pub-${tag}-${i}.png`), fullPage: true }); }
    console.log(`  ${tag}: ${(await q.p.evaluate(() => document.body.innerText)).slice(0, 90).replace(/\n/g, ' | ')}`);
    await q.ctx.close();
  }
  await ctx.close();
} catch (e) { console.error('FALLO', e); errs.push('FALLO ' + e.message); }
console.log('\nErrores:', errs.length); errs.slice(0, 40).forEach((e) => console.log(' -', e.slice(0, 400)));
await browser.close();
process.exit(0);
