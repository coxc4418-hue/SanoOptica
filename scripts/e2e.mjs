// SanoÓptica — Prueba de punta a punta contra los emuladores (datos creados por test-emu.sh)
// Uso: node e2e.mjs [url=http://127.0.0.1:5191] [carpeta de capturas]
import puppeteer from 'puppeteer-core';
import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ORIGIN = process.argv[2] || 'http://127.0.0.1:5191';
const BASE = ORIGIN + '/?emu=1';
const OUT = path.resolve(here, process.argv[3] || 'shots');
mkdirSync(OUT, { recursive: true });
const acc = JSON.parse(readFileSync(path.join(here, '.accounts-emu.json'), 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; let passed = 0;
const ok = (name, cond, extra = '') => { console.log(cond ? '  ✔' : '  ✘', name, extra); if (cond) passed++; else fails++; };
const errs = [];
const logs = [];
const near = (a, b, tol = 0.02) => Math.abs(Number(a) - Number(b)) <= tol;

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
async function newPage(w = 1366, h = 860) {
  const ctx = await browser.createBrowserContext();
  const p = await ctx.newPage();
  await p.setViewport({ width: w, height: h });
  p.on('pageerror', (e) => errs.push(`${e.message} @ ${(e.stack || '').split(String.fromCharCode(10)).slice(1, 3).join(' ').trim()}`));
  p.on('dialog', (d) => d.accept());
  p.on('console', (m) => { if (['error', 'warn', 'warning'].includes(m.type())) logs.push(m.text()); });
  return { ctx, p };
}
// Ejecuta una función con acceso a los módulos de la app
const run = (p, fn, arg = null) => p.evaluate(async (src, a) => {
  const M = { store: (await import('/js/store.js')).store, ops: await import('/js/ops.js'), utils: await import('/js/utils.js'), opt: await import('/js/optica.js'), f: await import('/js/firebase.js') };
  M.wait = async (f, ms = 8000) => { for (let i = 0; i < ms / 100; i++) { const v = f(); if (v) return v; await new Promise((r) => setTimeout(r, 100)); } return f(); };
  return (0, eval)(src)(M, a);
}, fn.toString(), arg);
const go = async (p, route) => { await p.evaluate((r) => { location.hash = '#/' + r; }, route); await sleep(1100); };
const lastModalBtn = (p, sel) => p.evaluate((s) => [...document.querySelectorAll(`.modal ${s}`)].pop()?.click(), sel);
const maybePin = async (p, value = acc.sede01.pin) => {
  const h = await p.waitForSelector('.modal [data-pin]', { timeout: 2500 }).catch(() => null);
  if (!h) return;
  await p.type('.modal [data-pin]', value);
  await lastModalBtn(p, '[data-ok]');
  await sleep(900);
};
const pickCountry = async (p, code) => {
  await p.waitForSelector(`.country-grid [data-c="${code}"]`, { timeout: 60000 });
  await p.click(`.country-grid [data-c="${code}"]`); await sleep(250);
  await lastModalBtn(p, '[data-ok]');
  await sleep(1500);
};
const login = async (p, user, pass) => {
  await p.goto(BASE, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#login-form', { timeout: 30000 });
  await p.type('#lg-user', user); await p.type('#lg-pass', pass); await p.click('#lg-btn');
};
// Página pública (portal, fórmula, agenda) sin sesión, tamaño teléfono
const publicPage = async (url) => {
  const q = await newPage(390, 844);
  await q.p.goto(ORIGIN + url + '?emu=1', { waitUntil: 'domcontentloaded' });
  await sleep(2500);
  return q;
};
const VIEWS = ['inicio', 'agenda', 'examenes', 'ordenes', 'venta', 'pacientes', 'recordatorios', 'inventario', 'laboratorios', 'cobranza', 'caja', 'gastos', 'reportes', 'ajustes'];
const err = (fn) => fn().then(() => '').catch((e) => e.message);

try {
  // ==================================================================
  console.log('1) Inicio de sesión y país');
  const A = await newPage();
  const p = A.p;
  await p.goto(BASE, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#login-form');
  await sleep(600);
  await p.screenshot({ path: path.join(OUT, '01-login.png') });
  await p.type('#lg-user', 'sede01'); await p.type('#lg-pass', acc.sede01.password); await p.click('#lg-btn');
  await pickCountry(p, 'VE');
  await p.waitForSelector('.sb-nav', { timeout: 30000 });
  await p.evaluate(async () => (await import('/js/tour.js')).stopTour());
  const r1 = await run(p, ({ store }) => ({ c: store.settings.country, cur: store.settings.currency, name: store.businessName, lenses: store.lensCatalog.length, tr: store.treatments.length }));
  ok('sede01 entra con su usuario y elige Venezuela', r1.c === 'VE', JSON.stringify(r1));
  ok('Trae la lista de precios de cristales y tratamientos', r1.lenses >= 5 && r1.tr >= 4, `${r1.lenses} cristales · ${r1.tr} tratamientos`);
  await sleep(800);
  await p.screenshot({ path: path.join(OUT, '02-inicio-vacio.png') });

  // ==================================================================
  console.log('2) Configuración, laboratorio, inventario y pacientes');
  const r2 = await run(p, async ({ store, ops, wait }) => {
    await store.saveSettings({ businessName: 'Óptica Mirada Clara', optometrist: 'Lcda. Ana Ruiz', license: 'COV-1234', minDepositPct: 50, warrantyDays: 90, controlMonths: 12,
      fx: { enabled: true, sym: 'Bs', name: 'Bolívares', rate: 40, updatedAt: new Date().toISOString() },
      banks: [{ id: 'k1', type: 'pagomovil', bank: 'Banesco', phone: '04141234567', idDoc: 'J-1234', holder: 'Óptica Mirada Clara', active: true }],
      portal: { enabled: true, reports: true, rx: true, booking: true } });
    const lab = await ops.saveLab({ name: 'Laboratorio Visión', days: 5, phone: '04141112233' });
    const fr = await ops.saveProduct({ cat: 'montura', brand: 'Ray-Ban', model: 'RB5154', color: 'Negro', code: 'RB5154', price: 120, cost: 60, stock: 2, min: 1 });
    const sun = await ops.saveProduct({ cat: 'sol', brand: 'Oakley', model: 'Holbrook', code: 'OK-HB', price: 150, cost: 80, stock: 3, min: 1 });
    const sol = await ops.saveProduct({ cat: 'solucion', name: 'Solución multipropósito 360 ml', code: 'SOL360', price: 9, cost: 4, stock: 10, min: 3 });
    const dupCode = await (async () => { try { await ops.saveProduct({ cat: 'montura', brand: 'X', model: 'Y', code: 'rb5154', price: 1 }); return ''; } catch (e) { return e.message; } })();
    const p1 = await ops.savePatient({ name: 'Carlos Méndez', idDoc: 'V-12345678', phone: '0414-5550001', birthDate: '1975-04-10' });
    const dupId = await (async () => { try { await ops.savePatient({ name: 'Otro Carlos', idDoc: 'v12345678' }); return ''; } catch (e) { return e.message; } })();
    const p2 = await ops.savePatient({ name: 'Lucía Rojas', idDoc: 'V-20111222', phone: '0424-5550002', birthDate: '2001-08-15' });
    await wait(() => store.patients.length >= 2 && store.products.length >= 3 && store.labs.length >= 1);
    return { lab: lab.id, fr: fr.id, sun: sun.id, sol: sol.id, p1: p1.id, p2: p2.id, dupCode, dupId, codes: store.patients.map((x) => x.code).sort(), portal: store.patient(p1.id).portalCode };
  });
  ok('Código de producto repetido rechazado', /en uso/.test(r2.dupCode), r2.dupCode);
  ok('Cédula repetida rechazada', /Ya existe/.test(r2.dupId), r2.dupId);
  ok('Historias correlativas y portal con código', r2.codes.length === 2 && !!r2.codes[0] && /^[A-Z0-9]{8}$/.test(r2.portal || ''), r2.codes.join(',') + ' ' + r2.portal);
  const IDS = r2;

  // ==================================================================
  console.log('3) Examen visual: validación, transposición y sugerencias');
  const r3 = await run(p, async ({ store, ops, opt, wait }, I) => {
    const bad1 = await (async () => { try { await ops.saveExam({ patientId: I.p1, rx: { od: { sph: -1, cyl: -0.75 } } }); return ''; } catch (e) { return e.message; } })();
    const bad2 = await (async () => { try { await ops.saveExam({ patientId: I.p1, rx: { od: { sph: -45 } } }); return ''; } catch (e) { return e.message; } })();
    const bad3 = await (async () => { try { await ops.saveExam({ patientId: I.p1, rx: {} }); return ''; } catch (e) { return e.message; } })();
    const rx = { od: { sph: -2.25, cyl: -0.75, axis: 180, add: 2 }, oi: { sph: -2, cyl: -0.5, axis: 175, add: 2 }, dp: 63 };
    const diag = opt.suggestDiagnosis(rx, 51); const type = opt.suggestLensType(rx, 51); const mat = opt.suggestMaterial(rx);
    const ex = await ops.saveExam({ patientId: I.p1, rx, diagnosis: diag, lensType: type, material: mat, reason: 'Ve borroso de cerca', av: { od: { sc: '20/50', cc: '20/20' } } });
    const ex2 = await ops.saveExam({ patientId: I.p2, rx: { od: { sph: -4.5 }, oi: { sph: -4.25, cyl: -1, axis: 90 } }, lensType: 'monofocal', material: opt.suggestMaterial({ od: { sph: -4.5 } }) });
    await wait(() => store.exams.length >= 2 && store.patient(I.p1).nextControl);
    const plus = opt.toMinusCyl({ sph: -1, cyl: 1, axis: 90 });
    return { bad1, bad2, bad3, diag, type, mat, ex: ex.id, ex2: ex2.id, num: ex.number, verify: ex.verify, next: store.patient(I.p1).nextControl, plus, parse: [opt.parseDiop('-1,30'), opt.parseDiop('plano'), String(opt.parseDiop('abc'))] };
  }, IDS);
  ok('Con cilindro exige el eje', /eje/.test(r3.bad1), r3.bad1);
  ok('Esfera fuera de rango rechazada', /esfera/.test(r3.bad2), r3.bad2);
  ok('Sin graduación no guarda', /graduación/.test(r3.bad3), r3.bad3);
  ok('Sugiere miopía + astigmatismo + presbicia, progresivo y policarbonato (meridiano de 3,00)', ['miopia', 'astigmatismo', 'presbicia'].every((k) => r3.diag.includes(k)) && r3.type === 'progresivo' && r3.mat === 'poli', `${r3.diag} ${r3.type} ${r3.mat}`);
  ok('Transpone el cilindro positivo a negativo', r3.plus.sph === 0 && r3.plus.cyl === -1 && r3.plus.axis === 180, JSON.stringify(r3.plus));
  ok('Redondea a 0,25 y entiende "plano"', r3.parse[0] === -1.25 && r3.parse[1] === 0 && r3.parse[2] === 'NaN', JSON.stringify(r3.parse));
  ok('Fórmula numerada con QR y control anual', /^F-?0*1$|F/.test(r3.num) && /^[A-Z0-9]{8}$/.test(r3.verify) && r3.next > '2026', `${r3.num} ${r3.verify} ${r3.next}`);
  Object.assign(IDS, { ex: r3.ex, ex2: r3.ex2, verify: r3.verify });
  await go(p, 'examenes'); await sleep(500);
  ok('La lista de exámenes muestra las fórmulas', (await p.$$('.exam-card')).length >= 2);
  await p.screenshot({ path: path.join(OUT, '03-examenes.png') });
  await p.click('#e-new'); await sleep(800);
  await p.evaluate(() => [...document.querySelectorAll('.modal .pick-list .list-item')].find((x) => /Carlos/.test(x.textContent))?.click()); await sleep(1000);
  ok('Abre el formulario del examen con la tabla OD/OI', !!(await p.$('.modal .rx-table .rx-in')));
  await p.screenshot({ path: path.join(OUT, '04-examen-form.png') });
  await p.evaluate(() => document.querySelectorAll('.modal [data-close]').forEach((b) => b.click()));
  await sleep(700);

  // ==================================================================
  console.log('4) Orden de trabajo: stock, abono, laboratorio y entrega');
  const r4 = await run(p, async ({ store, ops, opt, wait }, I) => {
    const fr = store.product(I.fr); const lens = store.lensCatalog.find((l) => l.type === 'progresivo') || store.lensCatalog[0]; const tr = store.treatments[0];
    const items = [{ kind: 'montura', productId: fr.id, name: 'Montura Ray-Ban RB5154', price: fr.price, cost: fr.cost }, { kind: 'cristal', lensId: lens.id, name: lens.name, price: lens.price, cost: lens.cost || 0 }, { kind: 'tratamiento', treatmentId: tr.id, name: tr.name, price: tr.price, cost: tr.cost || 0 }];
    const total = items.reduce((a, i) => a + i.price, 0);
    const tooMuch = await (async () => { try { await ops.createOrder({ patientId: I.p1, items, deposit: { amount: total + 10 } }); return ''; } catch (e) { return e.message; } })();
    const noStock = await (async () => { try { await ops.createOrder({ patientId: I.p1, items: [{ ...items[0], qty: 5 }] }); return ''; } catch (e) { return e.message; } })();
    const { order, payment } = await ops.createOrder({ patientId: I.p1, examId: I.ex, items, frame: { productId: fr.id, name: 'Ray-Ban RB5154' }, lens: { type: 'progresivo', material: 'cr39', lensId: lens.id, treatments: [tr.id] }, discount: 10, discountMode: 'pct', deposit: { amount: 60, method: 'efectivo' }, promised: opt.promiseDate(5) });
    await wait(() => store.order(order.id) && store.product(fr.id).stock === 1 && store.payments.length >= 1);
    let o = store.order(order.id);
    const noLab = await (async () => { try { await ops.setOrderStatus(o, 'laboratorio'); return ''; } catch (e) { return e.message; } })();
    await ops.updateOrder(o, { labId: I.lab, labCost: 35 });
    await wait(() => store.order(order.id).labId);
    o = store.order(order.id); await ops.setOrderStatus(o, 'laboratorio'); await wait(() => store.order(order.id).status === 'laboratorio');
    o = store.order(order.id); await ops.setOrderStatus(o, 'recibida'); await wait(() => store.order(order.id).status === 'recibida');
    o = store.order(order.id); await ops.setOrderStatus(o, 'lista'); await wait(() => store.order(order.id).status === 'lista');
    o = store.order(order.id);
    const unpaid = await (async () => { try { await ops.setOrderStatus(o, 'entregada'); return ''; } catch (e) { return e.message; } })();
    const overPay = await (async () => { try { await ops.registerPayment({ orderId: o.id, amount: 9999, method: 'efectivo' }); return ''; } catch (e) { return e.message; } })();
    const bal = opt.orderBalance(o);
    const half = Math.round(bal / 2 * 100) / 100;
    await ops.registerPayment({ orderId: o.id, amount: half, method: 'pagomovil', reference: '778899', bank: 'Banesco' });
    await wait(() => (store.order(o.id).paid || 0) > 60.5);
    const dupRef = await (async () => { try { await ops.registerPayment({ orderId: o.id, amount: half, method: 'pagomovil', reference: '778899' }); return ''; } catch (e) { return e.message; } })();
    o = store.order(order.id);
    const rest = opt.orderBalance(o);
    return { id: order.id, number: order.number, total: order.total, sub: order.subtotal, open: order.open, payNum: payment?.number, tooMuch, noStock, noLab, unpaid, overPay, dupRef, rest, stock: store.product(fr.id).stock, moves: store.moves.length, labDays: store.lab(I.lab).days, promised: order.promised };
  }, IDS);
  ok('Abono mayor que el total rechazado', /mayor que el total/.test(r4.tooMuch), r4.tooMuch);
  ok('Sin existencia suficiente no deja vender', /existencia/.test(r4.noStock), r4.noStock);
  ok('Descuento del 10 % aplicado', near(r4.total, r4.sub * 0.9), `${r4.sub} → ${r4.total}`);
  ok('Orden numerada, abono con recibo, stock descontado y movimiento', /^OT/.test(r4.number) && /^R/.test(r4.payNum || '') && r4.stock === 1 && r4.moves >= 1, `${r4.number} ${r4.payNum} stock ${r4.stock}`);
  ok('Fecha prometida calculada', /^\d{4}-\d{2}-\d{2}$/.test(r4.promised || ''), r4.promised);
  ok('No envía al laboratorio sin indicar cuál', /laboratorio/.test(r4.noLab), r4.noLab);
  ok('No entrega con saldo pendiente', /saldo pendiente/.test(r4.unpaid), r4.unpaid);
  ok('Pago mayor que el saldo rechazado', /supera el saldo/.test(r4.overPay), r4.overPay);
  ok('Referencia duplicada rechazada', /referencia/.test(r4.dupRef), r4.dupRef);
  IDS.o1 = r4.id;
  await go(p, 'ordenes'); await sleep(600);
  ok('El tablero muestra la orden en «Lista»', (await p.$$('.k-card')).length >= 1);
  await p.screenshot({ path: path.join(OUT, '05-ordenes.png') });
  await p.evaluate(() => document.querySelector('.k-card')?.click()); await sleep(1000);
  ok('La ficha de la orden muestra los pasos', (await p.$$('.o-step')).length === 5);
  await p.screenshot({ path: path.join(OUT, '06-orden-ficha.png') });
  await p.click('.modal .o-close'); await sleep(500);
  ok('La ficha se cierra con la X', !(await p.$('.modal')));
  await sleep(600);
  await p.click('#o-new').catch(() => {}); await sleep(800);
  await p.evaluate(() => [...document.querySelectorAll('.modal .pick-list .list-item')].find((x) => /Carlos/.test(x.textContent))?.click()); await sleep(1200);
  ok('Abre el armador de la orden', !!(await p.$('.order-builder')));
  await p.screenshot({ path: path.join(OUT, '07-orden-nueva.png') });
  await p.evaluate(() => document.querySelector('.modal .frame-pick')?.click()); await sleep(300);
  await p.evaluate(() => document.querySelector('.modal .lens-opt')?.click()); await sleep(400);
  await p.screenshot({ path: path.join(OUT, '07b-orden-armada.png') });
  await p.evaluate(() => document.querySelectorAll('.modal [data-close]').forEach((b) => b.click())); await sleep(500);

  const r4b = await run(p, async ({ store, ops, opt, wait }, I) => {
    let o = store.order(I.o1);
    await ops.registerPayment({ orderId: o.id, amount: opt.orderBalance(o), method: 'efectivo' });
    await wait(() => opt.orderBalance(store.order(I.o1)) < 0.01);
    o = store.order(I.o1); await ops.setOrderStatus(o, 'entregada'); await wait(() => store.order(I.o1).status === 'entregada');
    o = store.order(I.o1);
    const delivered = { open: o.open, warranty: o.warrantyUntil, at: !!o.deliveredAt };
    const noReason = await (async () => { try { await ops.warrantyOrder(o, ''); return ''; } catch (e) { return e.message; } })();
    await ops.warrantyOrder(o, 'Raya en el cristal izquierdo'); await wait(() => store.order(I.o1).status === 'garantia');
    o = store.order(I.o1);
    const next = opt.nextStatus(o.status);
    const voidPaid = await (async () => { try { await ops.voidOrder(o, 'x'); return ''; } catch (e) { return e.message; } })();
    // Orden sin abonos que se anula y devuelve el stock
    const fr = store.product(I.fr);
    const { order: o2 } = await ops.createOrder({ patientId: I.p2, examId: I.ex2, items: [{ kind: 'montura', productId: fr.id, name: 'Montura', price: 100 }, { kind: 'cristal', name: 'Monofocal', price: 40 }] });
    await wait(() => store.product(I.fr).stock === 0);
    const after = store.product(I.fr).stock;
    await ops.voidOrder(store.order(o2.id), 'Cliente desistió'); await wait(() => store.product(I.fr).stock === 1);
    return { delivered, noReason, warranty: o.status, count: o.warrantyCount, next, voidPaid, after, back: store.product(I.fr).stock, debt: store.balanceOf(I.p1) };
  }, IDS);
  ok('Entregada: cerrada, con garantía y fecha', r4b.delivered.open === false && /^\d{4}-/.test(r4b.delivered.warranty) && r4b.delivered.at, JSON.stringify(r4b.delivered));
  ok('Garantía exige motivo y vuelve al flujo', /motivo/.test(r4b.noReason) && r4b.warranty === 'garantia' && r4b.count === 1 && r4b.next === 'recibida', `${r4b.warranty} → ${r4b.next}`);
  ok('No anula una orden con abonos', /abonos/.test(r4b.voidPaid), r4b.voidPaid);
  ok('Anular devuelve la montura al inventario', r4b.after === 0 && r4b.back === 1, `${r4b.after} → ${r4b.back}`);
  ok('El paciente queda sin deuda', near(r4b.debt, 0), r4b.debt);

  // ==================================================================
  console.log('5) Venta de mostrador');
  await go(p, 'venta'); await sleep(500);
  await p.evaluate(() => { const b = [...document.querySelectorAll('.prod')].find((x) => /Solución/.test(x.textContent)); b?.click(); b?.click(); });
  await sleep(500);
  ok('El carrito suma dos soluciones', (await p.$$eval('.cart-line', (l) => l.length)) === 1 && /2/.test(await p.$eval('.qty span', (s) => s.textContent).catch(() => '')));
  await p.screenshot({ path: path.join(OUT, '08-venta.png') });
  const r5 = await run(p, async ({ store, ops, wait }, I) => {
    const pr = store.product(I.sun);
    const { order } = await ops.createOrder({ kind: 'venta', items: [{ kind: 'producto', productId: pr.id, name: 'Oakley Holbrook', price: pr.price, cost: pr.cost }], deposit: { amount: pr.price, method: 'punto' } });
    await wait(() => store.order(order.id) && store.product(I.sun).stock === 2);
    const o = store.order(order.id);
    return { n: o.number, st: o.status, open: o.open, stock: store.product(I.sun).stock };
  }, IDS);
  ok('Venta: numerada V, entregada, pagada y descuenta stock', /^V/.test(r5.n) && r5.st === 'entregada' && r5.open === false && r5.stock === 2, JSON.stringify(r5));

  // ==================================================================
  console.log('6) Portal del paciente: ver lentes y reportar un pago');
  const r6 = await run(p, async ({ store, ops, opt, wait }, I) => {
    const fr = store.product(I.fr);
    const { order } = await ops.createOrder({ patientId: I.p2, examId: I.ex2, items: [{ kind: 'montura', productId: fr.id, name: 'Montura Ray-Ban', price: 120 }, { kind: 'cristal', name: 'Monofocal policarbonato', price: 60 }], deposit: { amount: 80, method: 'efectivo' } });
    await wait(() => store.order(order.id));
    await ops.setOrderStatus(store.order(order.id), 'laboratorio', { force: true });
    await wait(() => store.order(order.id).status === 'laboratorio');
    await ops.publishPortals(); await new Promise((r) => setTimeout(r, 600)); await ops.publishPortals();
    await wait(() => !!store.settings.bookingCode);
    await ops.publishPortals();
    return { o: order.id, num: order.number, code: store.patient(I.p2).portalCode, bal: opt.orderBalance(store.order(order.id)), booking: store.settings.bookingCode };
  }, IDS);
  IDS.o3 = r6.o;
  let q = await publicPage('/paciente/' + r6.code);
  ok('El portal muestra la orden y su estado', /En el laboratorio|laboratorio/i.test(await q.p.evaluate(() => document.body.innerText)) && !!(await q.p.$('.p-steps')), r6.num);
  await q.p.screenshot({ path: path.join(OUT, '10-portal-lentes.png'), fullPage: true });
  await q.p.click('[data-rep]'); await sleep(500);
  await q.p.type('.p-sheet [name=reference]', '445566'); await q.p.type('.p-sheet [name=bank]', 'Mercantil');
  await q.p.screenshot({ path: path.join(OUT, '11-portal-reporte.png') });
  await q.p.click('.p-sheet [data-ok]'); await sleep(2000);
  ok('El paciente reporta su pago', !(await q.p.$('.p-sheet')));
  await q.p.click('[data-t="formula"]').catch(() => {}); await sleep(500);
  ok('El portal muestra su fórmula', !!(await q.p.$('.rx-table')));
  await q.p.screenshot({ path: path.join(OUT, '12-portal-formula.png'), fullPage: true });
  await q.ctx.close();
  const r6b = await run(p, async ({ store, ops, opt, wait }, I) => {
    await wait(() => store.reportedPayments.length >= 1, 10000);
    const it = store.reportedPayments[0];
    if (!it) return { n: 0 };
    await ops.registerPayment({ orderId: it.orderId, amount: it.amount, method: it.method, reference: it.reference, bank: it.bank, inboxId: it.id });
    await wait(() => store.reportedPayments.length === 0 && opt.orderBalance(store.order(I.o3)) < 0.01);
    return { n: 1, amount: it.amount, bal: opt.orderBalance(store.order(I.o3)), src: store.payments.find((x) => x.inboxId === it.id)?.source };
  }, IDS);
  ok('La óptica confirma el pago reportado y salda la orden', r6b.n === 1 && near(r6b.amount, r6.bal) && near(r6b.bal, 0) && r6b.src === 'portal', JSON.stringify(r6b));
  q = await publicPage('/paciente/ZZZZZZZZ');
  ok('Código de portal inválido muestra aviso', /no encontr|no existe|inválid/i.test(await q.p.evaluate(() => document.body.innerText)));
  await q.ctx.close();

  // ==================================================================
  console.log('7) Verificación de la fórmula por QR');
  q = await publicPage('/formula/' + IDS.verify);
  const vtxt = await q.p.evaluate(() => document.body.innerText);
  ok('La fórmula se verifica con su código', /Carlos/.test(vtxt) && !!(await q.p.$('.rx-table')), IDS.verify);
  await q.p.screenshot({ path: path.join(OUT, '13-formula-verificada.png'), fullPage: true });
  await q.ctx.close();

  // ==================================================================
  console.log('8) Agenda en línea');
  q = await newPage(390, 844);
  await q.p.goto(`${ORIGIN}/cita/${r6.booking}?emu=1`, { waitUntil: 'domcontentloaded' }); await sleep(2500);
  const slot = await q.p.$eval('.slot', (s) => s.dataset.h).catch(() => '');
  ok('La agenda pública muestra horas libres', !!slot, slot);
  await q.p.click('.slot'); await sleep(500);
  await q.p.type('[name=name]', 'Pedro Gómez'); await q.p.type('[name=phone]', '04121234567'); await q.p.type('[name=note]', 'Veo borroso de lejos');
  await q.p.screenshot({ path: path.join(OUT, '14-cita-publica.png'), fullPage: true });
  await q.p.click('[data-ok]'); await sleep(2200);
  ok('La cita se solicita', /Cita solicitada/.test(await q.p.evaluate(() => document.body.innerText)));
  await q.p.screenshot({ path: path.join(OUT, '15-cita-ok.png') });
  await q.ctx.close();
  const r8 = await run(p, async ({ store, ops, wait }) => {
    await wait(() => store.newBookings.length >= 1, 10000);
    const it = store.newBookings[0]; if (!it) return { n: 0 };
    await ops.acceptBooking(it);
    await wait(() => store.appointments.some((a) => a.date === it.date && a.time === it.time) && store.patients.some((x) => /Pedro/.test(x.name)));
    const taken = await (async () => { try { await ops.saveAppointment({ name: 'Otra Persona', date: it.date, time: it.time }); return ''; } catch (e) { return e.message; } })();
    return { n: 1, appts: store.appointments.length, patient: store.patients.some((x) => /Pedro/.test(x.name)), taken, pending: store.newBookings.length, date: it.date };
  });
  ok('Aceptar la cita crea el paciente y la agenda', r8.n === 1 && r8.patient && r8.appts >= 1 && r8.pending === 0, JSON.stringify(r8));
  ok('Hora ocupada no se puede volver a dar', /ocupada/.test(r8.taken), r8.taken);
  await go(p, 'agenda'); await sleep(500);
  await p.screenshot({ path: path.join(OUT, '16-agenda.png') });

  // ==================================================================
  console.log('9) Gastos y cierre de caja');
  const r9 = await run(p, async ({ store, ops, utils, wait }) => {
    await ops.saveExpense({ concept: 'Café y limpieza', amount: 10, category: 'otros', method: 'efectivo' });
    await wait(() => store.expenses.length >= 1);
    const today = utils.todayKey();
    const s = ops.cashSummary(today);
    const cash = (s.byMethod.efectivo?.amount || 0) - 10;
    await ops.closeCash(today, { counted: { efectivo: cash - 5 } });
    await wait(() => store.closing(today));
    return { total: s.total, methods: Object.keys(s.byMethod), diff: store.closing(today).diff, exp: store.expensesOn(today) };
  });
  ok('La caja separa por forma de pago', r9.methods.includes('efectivo') && r9.methods.includes('pagomovil') && r9.methods.includes('punto'), r9.methods.join(','));
  ok('El cierre detecta el faltante de 5', near(r9.diff, -5), r9.diff);
  await go(p, 'caja'); await sleep(500);
  await p.screenshot({ path: path.join(OUT, '17-caja.png') });

  // ==================================================================
  console.log('10) PIN y reportes');
  await go(p, 'reportes');
  const pinAsked = !!(await p.waitForSelector('.modal [data-pin]', { timeout: 3000 }).catch(() => null));
  await maybePin(p);
  await sleep(800);
  const rtxt = await p.evaluate(() => document.getElementById('r-body')?.innerText || '');
  ok('Reportes piden el PIN y muestran ventas', pinAsked && /Vendido|vendido/.test(rtxt), pinAsked ? '' : 'sin PIN');
  await p.screenshot({ path: path.join(OUT, '18-reportes.png') });

  // ==================================================================
  console.log('11) Aislamiento entre sedes');
  const B = await newPage();
  await login(B.p, 'sede02', acc.sede02.password);
  await pickCountry(B.p, 'CO');
  await B.p.waitForSelector('.sb-nav', { timeout: 30000 });
  const iso = await B.p.evaluate(async (u) => {
    const f = await import('/js/firebase.js');
    const r = {};
    r.read = await f.getDocs(f.collection(f.db, 'tenants', u, 'patients')).then(() => 'ok').catch((e) => e.code);
    r.write = await f.setDoc(f.doc(f.db, 'tenants', u, 'patients', 'x'), { name: 'intruso' }).then(() => 'ok').catch((e) => e.code);
    r.inbox = await f.getDocs(f.query(f.collection(f.db, 'inbox'), f.where('tenantId', '==', u))).then(() => 'ok').catch((e) => e.code);
    r.fake = await f.addDoc(f.collection(f.db, 'inbox'), { type: 'pago', tenantId: u, code: 'ZZZZZZZZ', status: 'nueva', createdAt: new Date().toISOString(), orderId: 'x', amount: 5, reference: '123456' }).then(() => 'ok').catch((e) => e.code);
    const { store } = await import('/js/store.js');
    r.mine = store.patients.length; r.cur = store.settings.currency;
    return r;
  }, acc.sede01.uid);
  ok('sede02 no ve ni escribe datos de sede01', iso.read === 'permission-denied' && iso.write === 'permission-denied' && iso.inbox === 'permission-denied' && iso.mine === 0, JSON.stringify(iso));
  ok('No se puede reportar un pago con un portal falso', iso.fake === 'permission-denied', iso.fake);
  ok('sede02 trabaja en pesos colombianos', iso.cur === 'COP', iso.cur);
  await B.ctx.close();

  // ==================================================================
  console.log('12) Todas las pantallas sin errores (escritorio y teléfono)');
  const b0 = errs.length;
  for (const v of VIEWS) { await go(p, v); await maybePin(p); await p.screenshot({ path: path.join(OUT, `20-${v}.png`) }); }
  await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true }); await sleep(500);
  let maxOvf = 0; let worst = '';
  for (const v of VIEWS) {
    await go(p, v); await maybePin(p); await p.screenshot({ path: path.join(OUT, `21-movil-${v}.png`) });
    const o = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth); if (o > maxOvf) { maxOvf = o; worst = v; }
  }
  ok('Pantallas sin errores', errs.length === b0, errs.slice(b0).join(' | '));
  ok('Sin desborde horizontal en el teléfono', maxOvf <= 1, `${maxOvf}px ${worst}`);
  await A.ctx.close();

  // ==================================================================
  console.log('13) Demo');
  let D = await newPage();
  await D.p.goto(BASE, { waitUntil: 'domcontentloaded' });
  await D.p.waitForSelector('#lg-demo', { timeout: 60000 }); await D.p.click('#lg-demo');
  await pickCountry(D.p, 'VE');
  await D.p.waitForFunction(() => document.body.innerText.includes('Modo demo') && !document.getElementById('boot'), { timeout: 240000 });
  await sleep(3000);
  const d = await run(D.p, async ({ store, opt }) => ({
    patients: store.patients.length, exams: store.exams.length, orders: store.workOrders.length, sales: store.orders.filter((o) => o.kind === 'venta').length, products: store.products.length, labs: store.labs.length,
    pays: store.payments.length, appts: store.appointments.length, exp: store.expenses.length, closings: store.closings.length, reported: store.reportedPayments.length, bookings: store.newBookings.length,
    statuses: [...new Set(store.workOrders.map((o) => o.status))], ready: store.readyOrders.length, debt: store.totalDebt,
    consistent: store.orders.every((o) => o.status === 'anulada' || Math.abs(store.payments.filter((x) => x.orderId === o.id && x.status === 'confirmado').reduce((a, x) => a + x.amount, 0) - (o.paid || 0)) < 0.05),
    neg: store.products.filter((x) => Number(x.stock) < 0).length, overpaid: store.orders.filter((o) => opt.orderBalance(o) < -0.01).length
  }));
  ok('Demo: pacientes, exámenes, órdenes, ventas, inventario y laboratorios', d.patients >= 40 && d.exams >= 30 && d.orders >= 25 && d.sales >= 10 && d.products >= 20 && d.labs === 3, JSON.stringify({ p: d.patients, e: d.exams, o: d.orders, v: d.sales, pr: d.products, l: d.labs }));
  ok('Demo: órdenes en todos los estados', ['registrada', 'laboratorio', 'recibida', 'lista', 'entregada'].every((s) => d.statuses.includes(s)), d.statuses.join(','));
  ok('Demo: pagos, citas, gastos, cierre, reportes y solicitudes', d.pays >= 30 && d.appts >= 5 && d.exp >= 8 && d.closings >= 1 && d.reported >= 2 && d.bookings >= 2, JSON.stringify(d));
  ok('Demo: pagos cuadran con las órdenes, sin stock negativo ni sobrepagos', d.consistent && !d.neg && !d.overpaid, `neg ${d.neg} over ${d.overpaid}`);
  ok('Recorrido guiado abierto al entrar', !!(await D.p.waitForSelector('.tour-tip', { timeout: 20000 }).catch(() => null)));
  await D.p.screenshot({ path: path.join(OUT, '30-demo-tour.png') });
  await D.p.evaluate(async () => (await import('/js/tour.js')).stopTour());
  const b2 = errs.length;
  for (const v of VIEWS) { await go(D.p, v); await maybePin(D.p, '1234'); await D.p.screenshot({ path: path.join(OUT, `31-demo-${v}.png`) }); }
  ok('Pantallas de la demo sin errores', errs.length === b2, errs.slice(b2).join(' | '));
  await D.p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true }); await sleep(400);
  let dOvf = 0; let dWorst = '';
  for (const v of VIEWS) {
    await go(D.p, v); await maybePin(D.p, '1234'); await D.p.screenshot({ path: path.join(OUT, `32-demo-movil-${v}.png`) });
    const o = await D.p.evaluate(() => document.documentElement.scrollWidth - innerWidth); if (o > dOvf) { dOvf = o; dWorst = v; }
  }
  ok('Demo en el teléfono sin desborde', dOvf <= 1, `${dOvf}px ${dWorst}`);
  await D.p.setViewport({ width: 1366, height: 860 }); await sleep(400);
  await run(D.p, async ({ ops }) => { await ops.publishPortals(); await new Promise((r) => setTimeout(r, 800)); await ops.publishPortals(); });
  await sleep(2500);
  const codes = await run(D.p, ({ store }) => {
    const withOrder = store.patients.find((x) => store.ordersOf(x.id).some((o) => o.kind !== 'venta' && o.status !== 'entregada' && o.status !== 'anulada'));
    return { pt: store.patients.map((s) => s.portalCode).filter(Boolean), one: withOrder?.portalCode, rx: store.exams.map((e) => e.verify).filter(Boolean), bk: store.settings.bookingCode };
  });
  const pubd = await D.p.evaluate(async (c) => { const f = await import('/js/firebase.js'); const ex = async (col, id) => (await f.getDoc(f.doc(f.db, col, id))).exists(); return (await ex('portals', c.one)) && (await ex('rx', c.rx[0])) && (await ex('bookings', c.bk)); }, codes);
  ok('La demo publica portales, fórmulas y agenda', pubd);
  for (const [tag, url] of [['paciente', '/paciente/' + codes.one], ['formula', '/formula/' + codes.rx[0]], ['cita', '/cita/' + codes.bk]]) {
    q = await publicPage(url);
    await q.p.screenshot({ path: path.join(OUT, `33-demo-${tag}.png`), fullPage: true });
    await q.ctx.close();
  }
  const uid = await D.p.evaluate(async () => (await import('/js/firebase.js')).auth.currentUser.uid);
  await D.p.evaluate(() => document.getElementById('demo-end').click());
  await D.p.waitForSelector('.modal [data-yes]'); await D.p.click('.modal [data-yes]');
  let back = false;
  for (let i = 0; i < 90 && !back; i++) { await sleep(1000); back = await D.p.$('#login-form').then((h) => !!h).catch(() => false); }
  if (!back) { await D.p.screenshot({ path: path.join(OUT, '39-demo-fin.png') }); console.log('LOGS', logs.slice(-15).join(' || ')); }
  ok('Terminar la demo vuelve al login', back);
  await D.ctx.close();

  // ==================================================================
  console.log('14) Administrador general');
  D = await newPage();
  await login(D.p, 'admin', acc.admin.password);
  await D.p.waitForSelector('[data-enter]', { timeout: 30000 }); await sleep(2000);
  ok('Admin ve las sedes', (await D.p.$$('[data-enter]')).length === 3);
  await D.p.screenshot({ path: path.join(OUT, '40-admin.png') });
  const gone = await D.p.evaluate(async (u, c) => {
    const f = await import('/js/firebase.js');
    const ex = async (col, id) => (await f.getDoc(f.doc(f.db, col, id))).exists();
    const ib = await f.getDocs(f.query(f.collection(f.db, 'inbox'), f.where('tenantId', '==', u)));
    return !(await ex('tenants', u)) && !(await ex('portals', c.one)) && !(await ex('rx', c.rx[0])) && !(await ex('bookings', c.bk)) && ib.empty;
  }, uid, codes);
  ok('La demo, sus portales, fórmulas, agenda y bandeja se borraron', gone);
  await D.ctx.close();
} catch (e) { console.log('ERROR', e.stack || e.message); fails++; }
await browser.close();
console.log('Errores de página:', errs.length ? errs.join(' | ') : 'ninguno');
console.log(`${passed} OK · ${fails} fallas`);
process.exit(fails ? 1 : 0);
