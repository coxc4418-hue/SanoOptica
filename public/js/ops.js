// SanoÓptica — Operaciones: pacientes, exámenes, órdenes de trabajo, ventas, cobros, inventario, laboratorios, citas, caja y portales
import { auth } from './firebase.js';
import { store } from './store.js';
import { round2, nowISO, todayKey, dayKey, addDays, fmtDate, normalize, toast, num } from './utils.js';
import {
  orderBalance, orderTotals, isOpenOrder, addMonthsKey, ORDER_STATUS, eyeErrors, hasRx, itemsText, daySlots, toMin, APPT_REASONS, LENS_TYPES, LENS_MATERIALS, productLabel, currentPeriod
} from './optica.js';

export const APP_URL = 'https://sano-optica.web.app';
export const by = () => (auth.currentUser?.isAnonymous ? 'demo' : (auth.currentUser?.email || '').split('@')[0] || '—');
const CODE_ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function genCode(n = 8) { return Array.from(crypto.getRandomValues(new Uint32Array(n)), (x) => CODE_ALPHA[x % CODE_ALPHA.length]).join(''); }
export const portalUrl = (code) => `${APP_URL}/paciente/${code}`;
export const rxUrl = (code) => `${APP_URL}/formula/${code}`;
export const bookingUrl = (code) => `${APP_URL}/cita/${code}`;
export const fmtSeq = (prefix, n, len = 5) => `${prefix}-${String(n).padStart(len, '0')}`;
export function slugify(s) { return normalize(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'optica'; }
const clean = (o) => { const out = {}; for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = v; return out; };
const str = (v, max = 200) => String(v ?? '').trim().slice(0, max);
const n2 = (v) => round2(Number(String(v ?? '').replace(',', '.')) || 0);

/** Escribe en varios lotes (Firestore admite 500 operaciones por lote) */
export async function chunked(ops, size = 70) {
  for (let i = 0; i < ops.length; i += size) {
    const b = store.batch();
    ops.slice(i, i + size).forEach((fn) => fn(b));
    await store.commit(b);
  }
}

// ======================================================================
// PACIENTES
// ======================================================================
export function cleanPatient(d) {
  return clean({
    name: str(d.name, 90), idDoc: str(d.idDoc, 20), birthDate: str(d.birthDate, 10), sex: str(d.sex, 1), phone: str(d.phone, 20), email: str(d.email, 80).toLowerCase(),
    address: str(d.address, 160), occupation: str(d.occupation, 80), howFound: str(d.howFound, 60), guardianName: str(d.guardianName, 80), guardianPhone: str(d.guardianPhone, 20),
    conditions: Array.isArray(d.conditions) ? d.conditions.slice(0, 12).map((x) => str(x, 40)) : undefined, allergies: str(d.allergies, 160), notes: str(d.notes, 600),
    photo: d.photo !== undefined ? String(d.photo || '') : undefined, insurance: str(d.insurance, 60)
  });
}
export async function savePatient(data, id = null) {
  const d = cleanPatient(data);
  if (!d.name || d.name.length < 3) throw new Error('Escribe el nombre completo del paciente.');
  if (d.idDoc && store.patients.some((p) => p.id !== id && p.idDoc && normalize(p.idDoc).replace(/\W/g, '') === normalize(d.idDoc).replace(/\W/g, ''))) throw new Error(`Ya existe un paciente con el documento ${d.idDoc}.`);
  const b = store.batch();
  if (id) {
    b.set(store.ref('patients', id), { ...d, updatedAt: nowISO() }, { merge: true });
    await store.commit(b);
    const saved = { id, ...store.patient(id), ...d };
    if (saved.active !== false && saved.portalCode) await publishPatientPortal(saved).catch((e) => console.warn('[portal]', e?.code || e));
    resetPublished();
    return saved;
  }
  const ref = store.newRef('patients');
  const code = fmtSeq('P', store.nextSeq(b, 'patient'), 5);
  const full = { ...d, code, portalCode: genCode(8), active: true, createdAt: nowISO(), by: by() };
  b.set(ref, full);
  await store.commit(b);
  const saved = { id: ref.id, ...full };
  await publishPatientPortal(saved).catch((e) => console.warn('[portal]', e?.code || e));
  resetPublished();
  return saved;
}
export async function setPatientActive(p, active) { await store.save('patients', p.id, { active, updatedAt: nowISO() }); resetPublished(); }
export async function renewPortalCode(p) {
  const old = p.portalCode;
  const code = genCode(8);
  const updated = { ...p, portalCode: code };
  const docData = JSON.parse(JSON.stringify(portalDoc(updated)));
  const b = store.batch();
  b.set(store.ref('patients', p.id), { portalCode: code, updatedAt: nowISO() }, { merge: true });
  if (old) b.delete(store.portalRef(old));
  if (updated.active !== false) b.set(store.portalRef(code), docData);
  await store.commit(b);
  published.delete('p:' + old);
  const { updatedAt, ...cmp } = docData;
  published.set('p:' + code, JSON.stringify(cmp));
  return code;
}
/** Importa pacientes desde filas de CSV (nombre, cédula, teléfono, correo, nacimiento…) */
export async function importPatients(rows) {
  const pick = (r, ...keys) => { for (const k of keys) { const f = Object.keys(r).find((x) => normalize(x).replace(/\s+/g, '') === k); if (f && String(r[f]).trim()) return String(r[f]).trim(); } return ''; };
  const ops = []; let created = 0; let skipped = 0;
  const seen = new Set(store.patients.map((p) => normalize(p.idDoc || '').replace(/\W/g, '')).filter(Boolean));
  let seq = Number(store.counters.patient) || 0;
  for (const r of rows) {
    const name = pick(r, 'nombre', 'nombres', 'paciente', 'name');
    if (!name || name.length < 3) { skipped++; continue; }
    const idDoc = pick(r, 'cedula', 'documento', 'ci', 'rif', 'id');
    const key = normalize(idDoc).replace(/\W/g, '');
    if (key && seen.has(key)) { skipped++; continue; }
    if (key) seen.add(key);
    let birth = pick(r, 'nacimiento', 'fechanacimiento', 'fechadenacimiento', 'birthdate');
    const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(birth); if (m) birth = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birth)) birth = '';
    seq++;
    const d = { ...cleanPatient({ name, idDoc, phone: pick(r, 'telefono', 'celular', 'whatsapp', 'phone'), email: pick(r, 'correo', 'email'), birthDate: birth, address: pick(r, 'direccion', 'address'), occupation: pick(r, 'ocupacion', 'profesion'), notes: pick(r, 'notas', 'observaciones') }), code: fmtSeq('P', seq, 5), portalCode: genCode(8), active: true, howFound: 'Importado', createdAt: nowISO(), by: by() };
    const ref = store.newRef('patients');
    ops.push((b) => b.set(ref, d));
    created++;
  }
  if (created) ops.push((b) => b.set(store.ref('config', 'counters'), { patient: seq }, { merge: true }));
  await chunked(ops);
  store.counters = { ...store.counters, patient: seq };
  resetPublished();
  return { created, skipped };
}

// ======================================================================
// EXÁMENES VISUALES (FÓRMULAS)
// ======================================================================
const cleanEye = (e = {}) => clean({
  sph: e.sph == null || isNaN(e.sph) ? null : round2(e.sph), cyl: e.cyl == null || isNaN(e.cyl) || e.cyl === 0 ? null : round2(e.cyl),
  axis: e.cyl && e.axis != null && !isNaN(e.axis) ? Math.round(e.axis) : null, add: e.add == null || isNaN(e.add) || e.add === 0 ? null : round2(e.add),
  prism: e.prism ? round2(e.prism) : null, base: e.prism ? str(e.base, 6) : null, dp: e.dp ? round2(e.dp) : null, height: e.height ? round2(e.height) : null,
  av: str(e.av, 10), avcc: str(e.avcc, 10)
});
export async function saveExam(data, id = null) {
  const p = store.patient(data.patientId);
  if (!p) throw new Error('Elige el paciente.');
  const rx = { od: cleanEye(data.rx?.od), oi: cleanEye(data.rx?.oi), dp: data.rx?.dp ? round2(data.rx.dp) : null, dpNear: data.rx?.dpNear ? round2(data.rx.dpNear) : null };
  const errs = [...eyeErrors(rx.od, 'OD'), ...eyeErrors(rx.oi, 'OI')];
  if (errs.length) throw new Error(errs[0].charAt(0).toUpperCase() + errs[0].slice(1) + '.');
  if (!hasRx(rx) && data.kind !== 'contacto') throw new Error('Escribe la graduación de al menos un ojo (puede ser "Plano").');
  const date = data.date || todayKey();
  const months = Math.max(1, Math.min(36, Number(data.nextControlMonths) || Number(store.settings.controlMonths) || 12));
  const d = clean({
    patientId: p.id, patientName: p.name, patientCode: p.code || '', date, kind: data.kind === 'contacto' ? 'contacto' : 'lentes',
    reason: str(data.reason, 300), history: str(data.history, 600), optometrist: str(data.optometrist || store.settings.optometrist, 80), license: str(data.license || store.settings.license, 40),
    rx, contact: data.kind === 'contacto' ? { od: clean({ bc: str(data.contact?.od?.bc, 8), dia: str(data.contact?.od?.dia, 8), power: str(data.contact?.od?.power, 10), brand: str(data.contact?.od?.brand, 60) }), oi: clean({ bc: str(data.contact?.oi?.bc, 8), dia: str(data.contact?.oi?.dia, 8), power: str(data.contact?.oi?.power, 10), brand: str(data.contact?.oi?.brand, 60) }) } : null,
    pio: { od: str(data.pio?.od, 6), oi: str(data.pio?.oi, 6) }, kerato: { od: str(data.kerato?.od, 24), oi: str(data.kerato?.oi, 24) },
    diagnosis: Array.isArray(data.diagnosis) ? data.diagnosis.slice(0, 10) : [], diagnosisNote: str(data.diagnosisNote, 300),
    lensType: str(data.lensType, 20), material: str(data.material, 12), treatments: Array.isArray(data.treatments) ? data.treatments.slice(0, 8) : [], use: str(data.use, 20),
    nextControlMonths: months, nextControl: addMonthsKey(date, months), notes: str(data.notes, 800), refer: !!data.refer, status: 'vigente'
  });
  const b = store.batch();
  let ref; let full;
  if (id) {
    ref = store.ref('exams', id);
    full = { ...store.exam(id), ...d, updatedAt: nowISO() };
    b.set(ref, { ...d, updatedAt: nowISO() }, { merge: true });
  } else {
    ref = store.newRef('exams');
    full = { ...d, number: fmtSeq('F', store.nextSeq(b, 'exam'), 5), verify: genCode(8), createdAt: nowISO(), by: by() };
    b.set(ref, full);
  }
  const last = store.lastExam(p.id);
  if (!last || date >= (last.date || '') || last.id === id) b.set(store.ref('patients', p.id), { lastExamAt: date, nextControl: d.nextControl, lastExamId: ref.id, updatedAt: nowISO() }, { merge: true });
  await store.commit(b);
  resetPublished();
  return { id: ref.id, ...full };
}
export async function voidExam(ex, reason = '') {
  const b = store.batch();
  b.set(store.ref('exams', ex.id), { status: 'anulada', voidReason: str(reason, 200), voidedAt: nowISO(), voidedBy: by() }, { merge: true });
  await store.commit(b);
  resetPublished();
}

// ======================================================================
// ÓRDENES DE TRABAJO Y VENTAS
// ======================================================================
const cleanItems = (items = []) => items.filter((i) => i && str(i.name)).slice(0, 40).map((i) => clean({
  kind: str(i.kind || 'producto', 14), productId: i.productId || undefined, lensId: i.lensId || undefined, treatmentId: i.treatmentId || undefined,
  name: str(i.name, 120), code: str(i.code, 40) || undefined, qty: Math.max(1, Math.min(999, Math.round(Number(i.qty) || 1))), price: Math.max(0, n2(i.price)), cost: Math.max(0, n2(i.cost))
}));
function payData(b, o, p, number) {
  return clean({
    orderId: o.id, orderNumber: o.number, patientId: o.patientId || '', patientName: o.patientName || '', patientCode: o.patientCode || '',
    amount: round2(p.amount), date: p.date || todayKey(), method: p.method || 'efectivo', bank: str(p.bank, 60), reference: str(p.reference, 40),
    amountBs: round2(p.amountBs || 0), rate: Number(p.rate) || 0, payer: str(p.payer, 80), note: str(p.note, 300), kind: p.kind || 'abono',
    status: 'confirmado', number, source: p.inboxId ? 'portal' : 'tienda', inboxId: p.inboxId || '', createdAt: nowISO(), by: by()
  });
}
/** Crea una orden de trabajo (lentes formulados) o una venta de mostrador. `deposit` = primer abono opcional. */
export async function createOrder(data) {
  const kind = data.kind === 'venta' ? 'venta' : 'trabajo';
  const p = data.patientId ? store.patient(data.patientId) : null;
  if (kind === 'trabajo' && !p) throw new Error('Elige el paciente de la orden.');
  const items = cleanItems(data.items);
  if (!items.length) throw new Error(kind === 'venta' ? 'Agrega al menos un producto.' : 'Agrega la montura y los cristales de la orden.');
  const t = orderTotals(items, data.discount, data.discountMode);
  const dep = round2(data.deposit?.amount || 0);
  if (dep > t.total + 0.009) throw new Error('El abono no puede ser mayor que el total.');
  // Stock disponible
  const need = {};
  for (const i of items) if (i.productId) need[i.productId] = (need[i.productId] || 0) + i.qty;
  for (const [pid, q] of Object.entries(need)) {
    const pr = store.product(pid);
    if (pr && pr.track !== false && (Number(pr.stock) || 0) < q && !data.allowNoStock) throw new Error(`No hay existencia suficiente de ${productLabel(pr)} (quedan ${Number(pr.stock) || 0}).`);
  }
  const b = store.batch();
  const ref = store.newRef('orders');
  const prefix = kind === 'venta' ? 'V' : (store.settings.orderPrefix || 'OT');
  const number = fmtSeq(prefix, store.nextSeq(b, kind === 'venta' ? 'sale' : 'order'), 5);
  const status = kind === 'venta' ? 'entregada' : 'registrada';
  const lab = data.labId ? store.lab(data.labId) : null;
  const ex = data.examId ? store.exam(data.examId) : null;
  const now = nowISO();
  const d = clean({
    kind, number, date: data.date || todayKey(), status, history: [{ s: status, at: now, by: by(), note: kind === 'venta' ? 'Venta de mostrador' : 'Orden registrada' }],
    patientId: p?.id || '', patientName: p?.name || str(data.customerName, 80) || 'Cliente de mostrador', patientCode: p?.code || '', patientPhone: p?.phone || str(data.customerPhone, 20),
    examId: ex?.id || '', examNumber: ex?.number || '', rx: data.rx || ex?.rx || null,
    lens: data.lens ? clean({ type: str(data.lens.type, 20), material: str(data.lens.material, 12), lensId: data.lens.lensId || '', treatments: (data.lens.treatments || []).slice(0, 8), tint: str(data.lens.tint, 40), design: str(data.lens.design, 60) }) : null,
    frame: data.frame ? clean({ productId: data.frame.productId || '', name: str(data.frame.name, 120), own: !!data.frame.own, eye: str(data.frame.eye, 4), bridge: str(data.frame.bridge, 4), temple: str(data.frame.temple, 4), type: str(data.frame.type, 40), notes: str(data.frame.notes, 160) }) : null,
    items, subtotal: t.subtotal, discount: t.discount, discountMode: data.discountMode === 'pct' ? 'pct' : 'monto', discountValue: n2(data.discount), total: t.total, cost: round2(t.cost + (Number(data.labCost) || 0)), paid: dep,
    labId: lab?.id || '', labName: lab?.name || '', labCost: n2(data.labCost), labRef: str(data.labRef, 30), promised: kind === 'trabajo' ? str(data.promised, 10) : '',
    notes: str(data.notes, 600), seller: str(data.seller, 60), deliveredAt: kind === 'venta' ? now : '', warrantyUntil: kind === 'venta' ? dayKey(addDays(new Date(), Number(store.settings.warrantyDays) || 90)) : '',
    createdAt: now, by: by()
  });
  d.open = isOpenOrder(d);
  b.set(ref, d);
  for (const i of items) {
    if (!i.productId) continue;
    const pr = store.product(i.productId);
    if (!pr || pr.track === false) continue;
    b.set(store.ref('products', i.productId), { stock: store.inc(-i.qty), lastSaleAt: d.date, updatedAt: now }, { merge: true });
    b.set(store.newRef('moves'), { productId: i.productId, productName: productLabel(pr), qty: -i.qty, reason: kind === 'venta' ? 'venta' : 'orden', ref: number, date: d.date, createdAt: now, by: by() });
  }
  let payment = null;
  if (dep > 0) {
    const pref = store.newRef('payments');
    payment = { id: pref.id, ...payData(b, { ...d, id: ref.id }, { ...data.deposit, amount: dep, kind: dep >= t.total - 0.009 ? 'pago' : 'abono' }, fmtSeq('R', store.nextSeq(b, 'payment'), 6)) };
    b.set(pref, payment);
  }
  if (p) b.set(store.ref('patients', p.id), { lastOrderAt: d.date, updatedAt: now, ...(dep > 0 ? { lastPaymentAt: d.date } : {}) }, { merge: true });
  await store.commit(b);
  resetPublished();
  return { order: { id: ref.id, ...d }, payment };
}
export async function updateOrder(o, patch) {
  const allowed = clean({ labId: patch.labId, labName: patch.labId !== undefined ? store.lab(patch.labId)?.name || '' : undefined, labRef: patch.labRef !== undefined ? str(patch.labRef, 30) : undefined, labCost: patch.labCost !== undefined ? n2(patch.labCost) : undefined, promised: patch.promised !== undefined ? str(patch.promised, 10) : undefined, notes: patch.notes !== undefined ? str(patch.notes, 600) : undefined });
  if (allowed.labCost !== undefined) allowed.cost = round2(orderTotals(o.items || []).cost + allowed.labCost);
  await store.save('orders', o.id, { ...allowed, updatedAt: nowISO() });
  resetPublished();
}
/** Avanza (o cambia) el estado de una orden y deja el historial */
export async function setOrderStatus(o, status, { note = '', force = false } = {}) {
  if (!ORDER_STATUS[status] || o.status === status) return;
  if (o.status === 'anulada') throw new Error('La orden está anulada.');
  if (status === 'entregada' && orderBalance(o) > 0.009 && !force) throw new Error(`La orden tiene un saldo pendiente de ${num(orderBalance(o))}. Cóbralo antes de entregar.`);
  if (status === 'laboratorio' && !o.labId && !force) throw new Error('Indica a qué laboratorio se envía la orden.');
  const now = nowISO();
  const patch = { status, history: [...(o.history || []), { s: status, at: now, by: by(), note: str(note, 200) }], updatedAt: now };
  if (status === 'laboratorio') patch.sentAt = now;
  if (status === 'recibida') patch.receivedAt = now;
  if (status === 'lista') patch.readyAt = now;
  if (status === 'entregada') { patch.deliveredAt = now; patch.warrantyUntil = dayKey(addDays(new Date(), Number(store.settings.warrantyDays) || 90)); }
  patch.open = isOpenOrder({ ...o, ...patch });
  await store.save('orders', o.id, patch);
  resetPublished();
  return { ...o, ...patch };
}
export async function warrantyOrder(o, reason) {
  if (!str(reason)) throw new Error('Describe el motivo de la garantía.');
  const now = nowISO();
  await store.save('orders', o.id, { status: 'garantia', open: true, warrantyCount: (Number(o.warrantyCount) || 0) + 1, warrantyReason: str(reason, 300), history: [...(o.history || []), { s: 'garantia', at: now, by: by(), note: str(reason, 200) }], updatedAt: now });
  resetPublished();
}
export async function voidOrder(o, reason = '') {
  if (o.status === 'anulada') return;
  if ((Number(o.paid) || 0) > 0.009) throw new Error('La orden tiene abonos. Anula primero los pagos (o regístralos como reembolso) en la pestaña Pagos.');
  const b = store.batch(); const now = nowISO();
  b.set(store.ref('orders', o.id), { status: 'anulada', open: false, voidReason: str(reason, 200), voidedAt: now, voidedBy: by(), history: [...(o.history || []), { s: 'anulada', at: now, by: by(), note: str(reason, 200) }], updatedAt: now }, { merge: true });
  for (const i of o.items || []) {
    if (!i.productId) continue;
    const pr = store.product(i.productId);
    if (!pr || pr.track === false) continue;
    b.set(store.ref('products', i.productId), { stock: store.inc(i.qty), updatedAt: now }, { merge: true });
    b.set(store.newRef('moves'), { productId: i.productId, productName: productLabel(pr), qty: i.qty, reason: 'anulacion', ref: o.number, date: todayKey(), createdAt: now, by: by() });
  }
  await store.commit(b);
  resetPublished();
}
export const lensSummary = (o) => {
  const l = o?.lens; if (!l) return '';
  const tr = (l.treatments || []).map((id) => store.treatment(id)?.name || id);
  return [LENS_TYPES[l.type]?.label, LENS_MATERIALS[l.material], ...tr, l.tint].filter(Boolean).join(' · ');
};

// ======================================================================
// COBROS
// ======================================================================
export async function registerPayment(p) {
  const o = store.order(p.orderId);
  if (!o) throw new Error('Orden no encontrada.');
  if (o.status === 'anulada') throw new Error('La orden está anulada.');
  const amount = round2(p.amount);
  if (!(amount > 0)) throw new Error('Indica el monto del pago.');
  const bal = orderBalance(o);
  if (amount > bal + 0.009) throw new Error(`El monto supera el saldo de la orden (${num(bal)}).`);
  if (p.reference && store.payments.some((x) => x.status === 'confirmado' && x.reference && x.reference === String(p.reference).trim() && x.method === p.method && Math.abs((Number(x.amount) || 0) - amount) < 0.01)) {
    throw new Error(`Ya hay un pago confirmado con la referencia ${p.reference}. Revisa que no esté duplicado.`);
  }
  const b = store.batch();
  const ref = store.newRef('payments');
  const d = payData(b, o, { ...p, amount, kind: amount >= bal - 0.009 ? 'pago' : 'abono' }, fmtSeq('R', store.nextSeq(b, 'payment'), 6));
  b.set(ref, d);
  const paid = round2((Number(o.paid) || 0) + amount);
  b.set(store.ref('orders', o.id), { paid: store.inc(amount), open: isOpenOrder({ ...o, paid }), lastPaymentAt: d.date, updatedAt: nowISO() }, { merge: true });
  if (o.patientId) b.set(store.ref('patients', o.patientId), { lastPaymentAt: d.date, updatedAt: nowISO() }, { merge: true });
  if (p.inboxId) b.set(store.inboxRef(p.inboxId), { status: 'procesada', paymentId: ref.id, processedAt: nowISO() }, { merge: true });
  await store.commit(b);
  resetPublished();
  return { id: ref.id, ...d };
}
export async function voidPayment(pay, reason = '') {
  if (pay.status !== 'confirmado') return;
  const o = store.order(pay.orderId);
  const b = store.batch();
  b.set(store.ref('payments', pay.id), { status: 'anulado', voidReason: str(reason, 200), voidedAt: nowISO(), voidedBy: by() }, { merge: true });
  if (pay.orderId) {
    const paid = round2((Number(o?.paid) || 0) - (Number(pay.amount) || 0));
    b.set(store.ref('orders', pay.orderId), { paid: store.inc(-(Number(pay.amount) || 0)), open: o ? isOpenOrder({ ...o, paid }) : true, updatedAt: nowISO() }, { merge: true });
  }
  await store.commit(b);
  resetPublished();
}
export async function rejectReport(item, reason = '') {
  await setInbox(item, { status: 'rechazada', reply: str(reason, 300) || 'No pudimos verificar el pago. Comunícate con la óptica.' });
}
export async function setInbox(item, patch) {
  const b = store.batch(); b.set(store.inboxRef(item.id), { ...patch, updatedAt: nowISO() }, { merge: true }); await store.commit(b);
  resetPublished();
}

// ======================================================================
// INVENTARIO
// ======================================================================
export async function saveProduct(data, id = null) {
  const name = str(data.name || [data.brand, data.model].filter(Boolean).join(' '), 120);
  if (!name) throw new Error('Escribe el nombre o la marca y el modelo.');
  const code = str(data.code, 40);
  if (code && store.products.some((p) => p.id !== id && p.active !== false && String(p.code || '').toLowerCase() === code.toLowerCase())) throw new Error(`El código ${code} ya está en uso.`);
  const d = clean({
    name, cat: data.cat || 'montura', code, brand: str(data.brand, 60), model: str(data.model, 60), color: str(data.color, 40), material: str(data.material, 30), frameType: str(data.frameType, 40),
    gender: str(data.gender, 1), eye: str(data.eye, 4), bridge: str(data.bridge, 4), temple: str(data.temple, 4), location: str(data.location, 40), supplier: str(data.supplier, 60),
    cost: Math.max(0, n2(data.cost)), price: Math.max(0, n2(data.price)), min: Math.max(0, Math.round(Number(data.min) || 0)), track: data.track !== false, photo: data.photo !== undefined ? String(data.photo || '') : undefined,
    active: data.active !== false, updatedAt: nowISO()
  });
  const b = store.batch();
  if (id) b.set(store.ref('products', id), d, { merge: true });
  else {
    const ref = store.newRef('products');
    const stock = Math.max(0, Math.round(Number(data.stock) || 0));
    b.set(ref, { ...d, stock, createdAt: nowISO() });
    if (stock) b.set(store.newRef('moves'), { productId: ref.id, productName: name, qty: stock, reason: 'inicial', ref: '', date: todayKey(), createdAt: nowISO(), by: by() });
    await store.commit(b);
    return { id: ref.id, ...d, stock };
  }
  await store.commit(b);
  return { id, ...store.product(id), ...d };
}
/** Entrada (compra) o salida (ajuste, daño, muestra) de inventario */
export async function adjustStock(p, qty, reason = 'ajuste', note = '', cost = null) {
  const q = Math.round(Number(qty) || 0);
  if (!q) throw new Error('Indica la cantidad.');
  if (q < 0 && (Number(p.stock) || 0) + q < 0) throw new Error(`Solo hay ${Number(p.stock) || 0} en existencia.`);
  const b = store.batch();
  const patch = { stock: store.inc(q), updatedAt: nowISO() };
  if (cost != null && Number(cost) > 0 && q > 0) patch.cost = n2(cost);
  b.set(store.ref('products', p.id), patch, { merge: true });
  b.set(store.newRef('moves'), { productId: p.id, productName: productLabel(p), qty: q, reason, note: str(note, 160), ref: '', date: todayKey(), createdAt: nowISO(), by: by() });
  await store.commit(b);
}

// ======================================================================
// LABORATORIOS
// ======================================================================
export async function saveLab(data, id = null) {
  const name = str(data.name, 80);
  if (!name) throw new Error('Escribe el nombre del laboratorio.');
  const d = clean({ name, contact: str(data.contact, 80), phone: str(data.phone, 20), whatsapp: str(data.whatsapp, 20), email: str(data.email, 80), address: str(data.address, 160), days: Math.max(0, Math.min(60, Math.round(Number(data.days) || 0))), notes: str(data.notes, 300), active: data.active !== false, updatedAt: nowISO() });
  const ref = id ? store.ref('labs', id) : store.newRef('labs');
  await store.save('labs', ref.id, id ? d : { ...d, createdAt: nowISO() });
  return { id: ref.id, ...d };
}

// ======================================================================
// CITAS
// ======================================================================
export function slotTaken(date, time, ignoreId = null) {
  const per = Math.max(1, Number(store.settings.hours?.perSlot) || 1);
  return store.appointments.filter((a) => a.id !== ignoreId && a.date === date && a.time === time && !['cancelada', 'no_asistio'].includes(a.status)).length >= per;
}
export async function saveAppointment(data, id = null, { force = false } = {}) {
  const p = data.patientId ? store.patient(data.patientId) : null;
  const name = str(p?.name || data.name, 80);
  if (!name) throw new Error('Elige el paciente o escribe su nombre.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date || '')) throw new Error('Elige la fecha.');
  if (!/^\d{2}:\d{2}$/.test(data.time || '')) throw new Error('Elige la hora.');
  if (!force && slotTaken(data.date, data.time, id)) throw new Error('Esa hora ya está ocupada. Elige otra.');
  const d = clean({ patientId: p?.id || '', name, phone: str(p?.phone || data.phone, 20), reason: APPT_REASONS[data.reason] ? data.reason : 'examen', date: data.date, time: data.time, notes: str(data.notes, 300), optometrist: str(data.optometrist, 60), status: data.status || 'confirmada', source: data.source || 'tienda', inboxId: data.inboxId || '', updatedAt: nowISO() });
  const ref = id ? store.ref('appointments', id) : store.newRef('appointments');
  await store.save('appointments', ref.id, id ? d : { ...d, createdAt: nowISO(), by: by() });
  resetPublished();
  return { id: ref.id, ...d };
}
export async function setApptStatus(a, status) { await store.save('appointments', a.id, { status, updatedAt: nowISO() }); resetPublished(); }
/** Convierte una cita pedida en línea en una cita de la agenda (y crea el paciente si es nuevo) */
export async function acceptBooking(item, { createPatient = true } = {}) {
  const digits = String(item.phone || '').replace(/\D/g, '').slice(-10);
  let p = item.who ? store.patient(item.who) : null;
  if (!p && digits) p = store.patients.find((x) => String(x.phone || '').replace(/\D/g, '').slice(-10) === digits) || null;
  if (!p && item.idDoc) p = store.findPatient(item.idDoc);
  if (!p && createPatient) { p = await savePatient({ name: item.name, phone: item.phone, idDoc: item.idDoc, howFound: 'Agenda en línea', notes: item.note ? `Cita en línea: ${item.note}` : '' }); await new Promise((r) => setTimeout(r, 150)); }
  const a = await saveAppointment({ patientId: p?.id || '', name: item.name, phone: item.phone, reason: item.reason, date: item.date, time: item.time, notes: item.note, status: 'confirmada', source: 'en_linea', inboxId: item.id }, null, { force: true });
  await setInbox(item, { status: 'procesada', appointmentId: a.id, processedAt: nowISO() });
  return { appointment: a, patient: p };
}

// ======================================================================
// GASTOS Y CAJA
// ======================================================================
export async function saveExpense(data, id = null) {
  const amount = round2(data.amount);
  if (!str(data.concept)) throw new Error('Escribe el concepto del gasto.');
  if (!(amount > 0)) throw new Error('Indica el monto.');
  const date = data.date || todayKey();
  const d = clean({ concept: str(data.concept, 140), amount, date, period: date.slice(0, 7), category: data.category || 'otros', supplier: str(data.supplier, 80), method: data.method || '', reference: str(data.reference, 40), labId: data.labId || '', status: 'activo', updatedAt: nowISO(), by: by() });
  const ref = id ? store.ref('expenses', id) : store.newRef('expenses');
  await store.save('expenses', ref.id, id ? d : { ...d, createdAt: nowISO() });
  return { id: ref.id, ...d };
}
export async function voidExpense(e) { await store.save('expenses', e.id, { status: 'anulado', updatedAt: nowISO(), by: by() }); }
/** Resumen de la caja de un día: lo cobrado por forma de pago y los gastos */
export function cashSummary(date = todayKey()) {
  const pays = store.confirmedPayments.filter((p) => p.date === date);
  const byMethod = {};
  for (const p of pays) { const k = p.method || 'otro'; byMethod[k] ||= { n: 0, amount: 0, amountBs: 0 }; byMethod[k].n++; byMethod[k].amount = round2(byMethod[k].amount + (Number(p.amount) || 0)); byMethod[k].amountBs = round2(byMethod[k].amountBs + (Number(p.amountBs) || 0)); }
  const exps = store.expenses.filter((e) => e.date === date && e.status !== 'anulado');
  const cashExp = round2(exps.filter((e) => /efectivo/.test(e.method || '')).reduce((a, e) => a + (Number(e.amount) || 0), 0));
  const total = round2(pays.reduce((a, p) => a + (Number(p.amount) || 0), 0));
  const sales = store.orders.filter((o) => o.date === date && o.status !== 'anulada');
  return { date, pays, byMethod, total, expenses: round2(exps.reduce((a, e) => a + (Number(e.amount) || 0), 0)), cashExp, exps, sales: round2(sales.reduce((a, o) => a + (Number(o.total) || 0), 0)), nOrders: sales.filter((o) => o.kind !== 'venta').length, nSales: sales.filter((o) => o.kind === 'venta').length };
}
export async function closeCash(date, { counted = {}, note = '' } = {}) {
  const s = cashSummary(date);
  const cnt = {}; for (const [k, v] of Object.entries(counted)) cnt[k] = n2(v);
  const expectedCash = round2(Object.entries(s.byMethod).filter(([k]) => /efectivo/.test(k)).reduce((a, [, v]) => a + v.amount, 0) - s.cashExp);
  const countedCash = round2(Object.entries(cnt).filter(([k]) => /efectivo/.test(k)).reduce((a, [, v]) => a + v, 0));
  const d = { date, period: date.slice(0, 7), total: s.total, byMethod: s.byMethod, expenses: s.expenses, counted: cnt, expectedCash, countedCash, diff: round2(countedCash - expectedCash), sales: s.sales, payments: s.pays.length, note: str(note, 300), status: 'cerrado', createdAt: nowISO(), by: by() };
  await store.save('closings', date, d, false);
  return d;
}

// ======================================================================
// PÁGINAS PÚBLICAS: portal del paciente, verificación de fórmula y agenda en línea
// ======================================================================
const fxRate = () => (store.settings.fx?.enabled ? Number(store.settings.fx.rate) || 0 : 0);
const pubEye = (e = {}) => clean({ sph: e.sph ?? null, cyl: e.cyl ?? null, axis: e.axis ?? null, add: e.add ?? null, prism: e.prism ?? null, base: e.base ?? null });
const bizInfo = () => { const st = store.settings; return { business: store.businessName, slogan: st.slogan || '', phone: st.whatsapp || st.phone || '', email: st.email || '', address: st.address || '', country: st.country || 'VE', currency: st.currency || '' }; };
export function portalDoc(p) {
  const st = store.settings;
  const orders = store.ordersOf(p.id).filter((o) => o.status !== 'anulada').slice(0, 8).map((o) => ({
    id: o.id, number: o.number, kind: o.kind || 'trabajo', date: o.date, status: o.status, promised: o.promised || '', total: Number(o.total) || 0, paid: Number(o.paid) || 0, balance: Math.max(0, orderBalance(o)),
    items: itemsText(o).slice(0, 220), lens: lensSummary(o).slice(0, 160), frame: o.frame?.own ? 'Montura propia' : (o.frame?.name || ''),
    history: (o.history || []).slice(-8).map((h) => ({ s: h.s, at: h.at })), readyAt: o.readyAt || '', deliveredAt: o.deliveredAt || '', warrantyUntil: o.warrantyUntil || ''
  }));
  const ex = store.lastExam(p.id);
  const rx = ex && st.portal?.rx !== false ? { date: ex.date, number: ex.number, verify: ex.verify, od: pubEye(ex.rx?.od), oi: pubEye(ex.rx?.oi), dp: ex.rx?.dp || null, lensType: ex.lensType || '', use: ex.use || '', optometrist: ex.optometrist || '', kind: ex.kind || 'lentes' } : null;
  const pays = store.payments.filter((x) => x.patientId === p.id && x.status === 'confirmado').slice(0, 6).map((x) => ({ n: x.number, date: x.date, amount: x.amount, method: x.method, order: x.orderNumber || '' }));
  const reports = store.inbox.filter((x) => x.who === p.id && x.type === 'pago').slice(0, 4).map((x) => ({ date: (x.createdAt || '').slice(0, 10), amount: x.amount, status: x.status, reply: x.reply || '', order: x.orderNumber || '' }));
  const appts = store.appointments.filter((a) => a.patientId === p.id && a.date >= todayKey() && ['pendiente', 'confirmada'].includes(a.status)).slice(0, 3).map((a) => ({ date: a.date, time: a.time, reason: a.reason, status: a.status }));
  const asked = store.inbox.filter((x) => x.who === p.id && x.type === 'cita' && x.status === 'nueva').slice(0, 2).map((x) => ({ date: x.date, time: x.time, reason: x.reason, status: 'pedida' }));
  return {
    kind: 'paciente', tenantId: store.tenantId, who: p.id, code: p.portalCode, ...bizInfo(),
    name: String(p.name || '').split(' ').slice(0, 3).join(' '), patientCode: p.code || '', balance: round2(store.balanceOf(p.id)), rate: fxRate(), fxSym: st.fx?.sym || 'Bs',
    orders, rx, nextControl: p.nextControl || '', payments: pays, reports, appointments: [...asked, ...appts],
    banks: (st.banks || []).filter((b) => b.active !== false).slice(0, 6).map((b) => ({ type: b.type, bank: b.bank || '', holder: b.holder || '', number: b.number || '', idDoc: b.idDoc || '', phone: b.phone || '', email: b.email || '' })),
    hours: st.hours || null, bookingCode: st.portal?.booking !== false ? st.bookingCode || '' : '',
    allow: { reports: st.portal?.reports !== false, booking: st.portal?.booking !== false }, active: p.active !== false && st.portal?.enabled !== false, updatedAt: nowISO()
  };
}
export function rxDoc(ex) {
  const st = store.settings;
  return {
    tenantId: store.tenantId, code: ex.verify, business: store.businessName, address: st.address || '', phone: st.whatsapp || st.phone || '',
    patient: String(ex.patientName || '').split(' ').slice(0, 3).join(' '), number: ex.number, date: ex.date, kind: ex.kind || 'lentes',
    od: pubEye(ex.rx?.od), oi: pubEye(ex.rx?.oi), dp: ex.rx?.dp || null, lensType: ex.lensType || '', use: ex.use || '',
    optometrist: ex.optometrist || st.optometrist || '', license: ex.license || st.license || '', nextControl: ex.nextControl || '',
    status: ex.status === 'anulada' ? 'anulada' : 'vigente', updatedAt: nowISO()
  };
}
export function bookingDoc() {
  const st = store.settings;
  const taken = {};
  const per = Math.max(1, Number(st.hours?.perSlot) || 1);
  const counts = {};
  const today = todayKey(); const lim = dayKey(addDays(new Date(), 35));
  for (const a of store.appointments) if (a.date >= today && a.date <= lim && !['cancelada', 'no_asistio'].includes(a.status)) counts[`${a.date} ${a.time}`] = (counts[`${a.date} ${a.time}`] || 0) + 1;
  for (const x of store.inboxOf('cita', 'nueva')) if (x.date >= today) counts[`${x.date} ${x.time}`] = (counts[`${x.date} ${x.time}`] || 0) + 1;
  for (const [k, n] of Object.entries(counts)) if (n >= per) { const [d, t] = k.split(' '); (taken[d] ||= []).push(t); }
  return {
    tenantId: store.tenantId, code: st.bookingCode, ...bizInfo(), hours: st.hours || null, taken, examFee: Number(st.examFee) || 0, rate: fxRate(), fxSym: st.fx?.sym || 'Bs',
    reasons: Object.keys(APPT_REASONS).filter((k) => k !== 'entrega'), optometrist: st.optometrist || '', active: st.portal?.booking !== false && st.portal?.enabled !== false, updatedAt: nowISO()
  };
}
/** Asegura que la óptica tenga su código para el enlace de la agenda en línea */
export async function publishPatientPortal(p) {
  if (!store.tenantId || !p) return null;
  let pat = p;
  if (!pat.portalCode) {
    const code = genCode(8);
    const b0 = store.batch(); b0.set(store.ref('patients', pat.id), { portalCode: code, updatedAt: nowISO() }, { merge: true }); await store.commit(b0);
    pat = { ...pat, portalCode: code };
  }
  const data = JSON.parse(JSON.stringify(portalDoc(pat)));
  const { updatedAt, ...cmp } = data;
  const b = store.batch(); b.set(store.portalRef(pat.portalCode), data); await store.commit(b);
  published.set('p:' + pat.portalCode, JSON.stringify(cmp));
  return pat.portalCode;
}
export async function ensureBookingCode() {
  if (!store.settings.bookingCode) {
    const code = genCode(6);
    await store.saveSettings({ bookingCode: code });
  }
  const code = store.settings.bookingCode;
  if (code) {
    const data = JSON.parse(JSON.stringify(bookingDoc()));
    const { updatedAt, ...cmp } = data;
    const b = store.batch(); b.set(store.bookingRef(code), data); await store.commit(b).catch(() => {});
    published.set('b:' + code, JSON.stringify(cmp));
  }
  return code;
}
/** Horas libres de un día para la agenda (oficina y en línea) */
export const freeSlots = (date) => daySlots(store.settings.hours, date).filter((t) => !slotTaken(date, t) && (date > todayKey() || toMin(t) > new Date().getHours() * 60 + new Date().getMinutes()));

let published = new Map();
export function resetPublished() { published = new Map(); schedulePublish?.(); }
let schedulePublish = null;
export function setPublishScheduler(fn) { schedulePublish = fn; }
/** Publica (solo lo que cambió) el portal de cada paciente, sus fórmulas verificables y la agenda en línea */
export async function publishPortals() {
  if (!store.tenantId || !store.ready) return 0;
  if (!store.settings.bookingCode) { await store.saveSettings({ bookingCode: genCode(6) }).catch(() => {}); }
  const ops = [];
  const add = (key, ref, d) => {
    const data = JSON.parse(JSON.stringify(d));
    const { updatedAt, ...cmp } = data;
    const h = JSON.stringify(cmp);
    if (published.get(key) === h) return;
    ops.push({ key, h, fn: (b) => b.set(ref, data) });
  };
  for (const p of store.patients) if (p.portalCode) add('p:' + p.portalCode, store.portalRef(p.portalCode), portalDoc(p));
  for (const ex of store.exams) if (ex.verify) add('r:' + ex.verify, store.rxRef(ex.verify), rxDoc(ex));
  if (store.settings.bookingCode) add('b:' + store.settings.bookingCode, store.bookingRef(store.settings.bookingCode), bookingDoc());
  if (!ops.length) return 0;
  await chunked(ops.map((o) => o.fn), 50);
  ops.forEach((o) => published.set(o.key, o.h));
  return ops.length;
}

export { addDays, dayKey, fmtDate, normalize, toast, num, currentPeriod };
