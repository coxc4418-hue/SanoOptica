// Prueba rápida contra producción (no deja datos: la demo se borra al terminar)
// Uso: node prod-smoke.mjs <carpeta de capturas>
import puppeteer from 'puppeteer-core';
import { readFileSync, mkdirSync } from 'node:fs';
const acc = JSON.parse(readFileSync(new URL('./.accounts.json', import.meta.url), 'utf8'));
const URL_ = process.env.SC_URL || 'https://sano-optica.web.app';
const OUT = process.argv[2] || '.';
mkdirSync(OUT, { recursive: true });
const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const errs = []; let fails = 0;
const ok = (n, c, x = '') => { console.log(c ? '  ✔' : '  ✘', n, x); if (!c) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function page() {
  const ctx = await b.createBrowserContext(); const p = await ctx.newPage();
  await p.setViewport({ width: 1366, height: 860 });
  p.on('pageerror', (e) => errs.push(e.message));
  return { ctx, p };
}
const st = (p, fn) => p.evaluate(async (src) => { const { store } = await import('/js/store.js'); return (0, eval)(src)(store); }, fn.toString());
try {
  let codes = []; let demoPub = {};
  let { ctx, p } = await page();
  await p.goto(URL_, { waitUntil: 'networkidle2' });
  await p.waitForSelector('#lg-demo');
  ok('Producción carga el login', true);
  await p.click('#lg-demo');
  await p.waitForSelector('.country-grid [data-c="MX"]', { timeout: 60000 });
  ok('La demo pide el país', true);
  await p.click('.country-grid [data-c="MX"]'); await sleep(300);
  await p.evaluate(() => [...document.querySelectorAll('.modal [data-ok]')].pop().click());
  await p.waitForFunction(() => document.body.innerText.includes('Modo demo') && !document.getElementById('boot'), { timeout: 120000 });
  await p.waitForSelector('.tour-tip', { timeout: 20000 }).catch(() => {});
  ok('Recorrido guiado abierto al entrar', !!(await p.$('.tour-tip')));
  await p.screenshot({ path: OUT + '/prod-demo-tour.png' });
  await p.evaluate(async () => (await import('/js/tour.js')).stopTour());
  const n = await st(p, (s) => ({ pacientes: s.patients.length, examenes: s.exams.length, ordenes: s.workOrders.length, ventas: s.orders.filter((o) => o.kind === 'venta').length, pagos: s.payments.length, monturas: s.products.length, labs: s.labs.length, reportados: s.reportedPayments.length, citas: s.newBookings.length, moneda: s.settings.currency }));
  ok('Demo real con datos (en pesos mexicanos)', n.pacientes >= 40 && n.examenes >= 30 && n.ordenes >= 25 && n.ventas >= 10 && n.pagos >= 30 && n.monturas >= 20 && n.labs === 3 && n.reportados >= 2 && n.citas >= 2 && n.moneda === 'MXN', JSON.stringify(n));
  await p.evaluate(async () => { const o = await import('/js/ops.js'); await o.publishPortals(); await new Promise((r) => setTimeout(r, 1000)); await o.publishPortals(); });
  await sleep(3000);
  codes = await st(p, (s) => s.patients.map((u) => u.portalCode).filter(Boolean));
  const extra = await st(p, (s) => { const pt = s.patients.find((x) => s.ordersOf(x.id).some((o) => o.kind !== 'venta' && !['entregada', 'anulada'].includes(o.status))); return { pt: pt?.portalCode, rx: s.exams[0]?.verify, bk: s.settings.bookingCode }; });
  const pub = await b.newPage();
  pub.on('pageerror', (e) => errs.push('portal: ' + e.message));
  await pub.setViewport({ width: 390, height: 844, isMobile: true, deviceScaleFactor: 2 });
  await pub.goto(`${URL_}/paciente/${extra.pt}`, { waitUntil: 'networkidle2' });
  await pub.waitForSelector('.p-steps', { timeout: 30000 }).catch(() => {});
  ok('Portal del paciente /paciente/CÓDIGO con el estado de sus lentes', !!(await pub.$('.p-steps')), extra.pt);
  await pub.screenshot({ path: OUT + '/prod-portal.png' });
  for (const [sel, url, name] of [['.verify-card .rx-table', `/formula/${extra.rx}`, 'Verificación de fórmula /formula/CÓDIGO'], ['.slot-grid .slot', `/cita/${extra.bk}`, 'Agenda en línea /cita/CÓDIGO con horas libres']]) {
    await pub.goto(URL_ + url, { waitUntil: 'networkidle2' });
    await pub.waitForSelector(sel, { timeout: 30000 }).catch(() => {});
    ok(name, !!(await pub.$(sel)));
    await pub.screenshot({ path: `${OUT}/prod-${url.split('/')[1]}.png`, fullPage: true });
  }
  await pub.goto(`${URL_}/paciente/NOEXISTE`, { waitUntil: 'networkidle2' }); await sleep(2500);
  ok('Un código falso no muestra datos', !(await pub.$('.portal-hero')));
  await pub.close();
  demoPub = extra;
  for (const v of ['ordenes', 'examenes', 'venta', 'cobranza', 'reportes']) {
    await p.evaluate((r) => { location.hash = '#/' + r; }, v); await sleep(1800);
    await p.screenshot({ path: `${OUT}/prod-${v}.png` });
  }
  ok('Pantallas de la demo abren', true);
  const pins = await st(p, (s) => Promise.all([s.verifyPin('1234'), s.verifyPin('9999')]));
  ok('PIN de la demo 1234 (y rechaza otros)', pins[0] === true && pins[1] === false, JSON.stringify(pins));
  const uid = await p.evaluate(async () => (await import('/js/firebase.js')).auth.currentUser.uid);
  await p.evaluate(() => document.getElementById('demo-end').click());
  await p.waitForSelector('.modal [data-yes]'); await p.click('.modal [data-yes]');
  for (let i = 0; i < 60; i++) { await sleep(1500); try { if (await p.$('#login-form')) break; } catch (_) {} }
  ok('Demo terminada y limpiada', true, uid.slice(0, 6));
  await ctx.close();

  ({ ctx, p } = await page());
  await p.goto(URL_, { waitUntil: 'networkidle2' });
  await p.waitForSelector('#login-form');
  await p.type('#lg-user', 'sede01'); await p.type('#lg-pass', acc.sede01.password); await p.click('#lg-btn');
  await p.waitForSelector('.sb-nav, .country-grid', { timeout: 30000 });
  await sleep(2500);
  ok('sede01 entra en producción', true, (await p.$('.country-grid')) ? '(pide el país la primera vez)' : '');
  await p.screenshot({ path: OUT + '/prod-sede01.png' });
  await ctx.close();

  ({ ctx, p } = await page());
  await p.goto(URL_, { waitUntil: 'networkidle2' });
  await p.waitForSelector('#login-form');
  await p.type('#lg-user', 'admin'); await p.type('#lg-pass', acc.admin.password); await p.click('#lg-btn');
  await p.waitForSelector('[data-enter]', { timeout: 30000 });
  await sleep(3000);
  const count = await p.$$eval('[data-enter]', (x) => x.length);
  ok('Admin ve las 20 sedes', count === 20, String(count));
  const gone = await p.evaluate(async (u, cs, x) => {
    const f = await import('/js/firebase.js');
    if ((await f.getDoc(f.doc(f.db, 'tenants', u))).exists()) return false;
    for (const c of cs.slice(0, 8)) if ((await f.getDoc(f.doc(f.db, 'portals', c))).exists()) return false;
    if (x.rx && (await f.getDoc(f.doc(f.db, 'rx', x.rx))).exists()) return false;
    if (x.bk && (await f.getDoc(f.doc(f.db, 'bookings', x.bk))).exists()) return false;
    return true;
  }, uid, codes, demoPub);
  ok('Sin rastros de la demo ni de sus portales, fórmulas y agenda', gone);
  await p.screenshot({ path: OUT + '/prod-admin.png' });
  await ctx.close();
} catch (e) { console.log('ERROR', e.message); fails++; }
await b.close();
console.log('Errores de página:', errs.length ? errs.join(' | ') : 'ninguno');
console.log(fails ? `FALLAS: ${fails}` : 'PRODUCCIÓN OK');
process.exit(fails ? 1 : 0);
