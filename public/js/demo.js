// SanoÓptica — Modo demo (sesión anónima de 30 minutos) con una óptica de ejemplo llena de vida
import { auth, db, doc, collection, writeBatch, getDoc, getDocs, query, where, Timestamp, signInAnonymously, signOut } from './firebase.js';
import { store, DEFAULT_SETTINGS } from './store.js';
import { fmtSeq, genCode, chunked, saveLab } from './ops.js';
import { round2, nowISO, todayKey, dayKey, addDays, sha256, scaleUSD } from './utils.js';
import { addMonthsKey, isOpenOrder, orderTotals, suggestDiagnosis, suggestLensType, suggestMaterial, LENS_CATALOG_DEFAULT, TREATMENTS_DEFAULT, HOURS_DEFAULT, daySlots, ageOf, productLabel } from './optica.js';

/** PIN de administrador de todas las demos (se muestra en pantalla) */
export const DEMO_PIN = '1234';
export const DEMO_MINUTES = 30;
const DATA_COLLECTIONS = ['patients', 'exams', 'orders', 'payments', 'products', 'labs', 'appointments', 'expenses', 'closings', 'moves', 'config'];
const BIZ = 'Óptica Visión Clara (demo)';

export async function startDemo() { await signInAnonymously(auth); }

export function demoRemainingMs(tenant) {
  const exp = tenant?.expiresAt;
  if (!exp) return 0;
  const ms = typeof exp.toMillis === 'function' ? exp.toMillis() : new Date(exp).getTime();
  return ms - Date.now();
}

export async function createDemoTenant(uid) {
  const expiresAt = Timestamp.fromMillis(Date.now() + DEMO_MINUTES * 60 * 1000);
  const b1 = writeBatch(db);
  b1.set(doc(db, 'tenants', uid), { name: BIZ, code: 'demo', ownerUid: uid, ownerEmail: '', active: true, demo: true, createdAt: nowISO(), expiresAt });
  await b1.commit();
  const ref = (name, id) => doc(db, 'tenants', uid, name, id);
  const b = writeBatch(db);
  b.set(ref('config', 'settings'), {
    ...DEFAULT_SETTINGS, businessName: BIZ, slogan: 'Cuidamos tu mirada desde 2009', rif: 'J-40987654-3', manager: 'Gabriela Moreno',
    optometrist: 'Lic. Andrés Villalobos', license: 'COV 2318', phone: '0241-8243311', whatsapp: '0414-4123311', email: 'demo@sanooptica.app',
    address: 'Av. Bolívar Norte, C.C. Camoruco, local 14, Valencia', minDepositPct: 50, warrantyDays: 90, controlMonths: 12, examFee: 15, orderPrefix: 'OT',
    hours: { ...HOURS_DEFAULT, perSlot: 1 },
    banks: [
      { id: 'k1', type: 'pagomovil', bank: 'Banesco (0134)', phone: '0414-4123311', idDoc: 'J-40987654-3', holder: 'Óptica Visión Clara, C.A.', active: true },
      { id: 'k2', type: 'transferencia', bank: 'Mercantil', number: '0105-0000-11-0000789012', holder: 'Óptica Visión Clara, C.A.', idDoc: 'J-40987654-3', active: true },
      { id: 'k3', type: 'zelle', email: 'pagos@visionclara-demo.com', holder: 'Vision Clara LLC', active: true },
      { id: 'k4', type: 'efectivo', active: true }
    ],
    receiptNote: 'Garantía de 90 días por defectos de fabricación. Los lentes no retirados en 60 días pasan a depósito.',
    portal: { enabled: true, reports: true, booking: true, rx: true },
    bookingCode: genCode(6)
  });
  b.set(ref('config', 'security'), { pinHash: await sha256(`${uid}:${DEMO_PIN}`), updatedAt: nowISO() });
  await b.commit();
}

async function waitFor(cond, ms = 8000) {
  const t0 = Date.now();
  while (!cond() && Date.now() - t0 < ms) await new Promise((r) => setTimeout(r, 120));
}
function rng(seed = 7) { let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }

const PEOPLE = [
  ['María Fernanda Rodríguez', 'F', 34], ['José Gregorio Pérez', 'M', 52], ['Ana Carolina Méndez', 'F', 47], ['Luis Alberto Hernández', 'M', 61], ['Daniela Sofía Castillo', 'F', 22],
  ['Carlos Eduardo Ramírez', 'M', 39], ['Yelitza Coromoto Díaz', 'F', 56], ['Miguel Ángel Torres', 'M', 44], ['Valentina Andrea Rojas', 'F', 17], ['Pedro Antonio Suárez', 'M', 68],
  ['Gabriela Alejandra Mora', 'F', 29], ['Rafael Enrique Blanco', 'M', 50], ['Lucía Isabel Fernández', 'F', 9], ['Andrés Felipe Gómez', 'M', 26], ['Carmen Elena Marcano', 'F', 63],
  ['Jesús Manuel Briceño', 'M', 41], ['Rosa María Quintero', 'F', 58], ['Samuel David Ochoa', 'M', 12], ['Paola Cristina Salazar', 'F', 36], ['Héctor Javier Medina', 'M', 55],
  ['Mariana Victoria León', 'F', 31], ['Óscar Rafael Contreras', 'M', 46], ['Isabella Camila Ruiz', 'F', 7], ['Wilmer José Ortiz', 'M', 49], ['Luisana Beatriz Rivas', 'F', 24],
  ['Francisco Javier Peña', 'M', 72], ['Andreína Paola Vargas', 'F', 43], ['Diego Armando Silva', 'M', 33], ['Milagros del Valle Rondón', 'F', 51], ['Ricardo Antonio Paredes', 'M', 57],
  ['Sofía Gabriela Álvarez', 'F', 19], ['Ángel David Herrera', 'M', 38], ['Beatriz Eugenia Mendoza', 'F', 66], ['Kevin Alejandro Linares', 'M', 15], ['Natalia Carolina Pineda', 'F', 28],
  ['Omar Enrique Castro', 'M', 60], ['Yuleidy Carolina Rangel', 'F', 35], ['Sebastián José Molina', 'M', 10], ['Elena Margarita Uzcátegui', 'F', 48], ['Gustavo Adolfo Lugo', 'M', 53],
  ['Karina Patricia Acosta', 'F', 40], ['Eduardo José Villegas', 'M', 64], ['Camila Valeria Guerra', 'F', 21], ['Ramón Antonio Escalona', 'M', 70], ['Daniela Alejandra Fuentes', 'F', 32],
  ['Alejandro José Bravo', 'M', 45], ['Gloria Esperanza Sánchez', 'F', 59], ['Mateo Andrés Colmenares', 'M', 8]
];
const GUARD = { 12: 'Patricia Fernández', 17: 'David Ochoa', 22: 'Laura Ruiz', 33: 'Marisela Linares', 37: 'Carolina Molina', 47: 'Jhoana Colmenares', 8: 'Alberto Rojas' };

export async function seedDemoActivity() {
  const money = (v) => scaleUSD(v);
  const R = rng(31);
  const today = todayKey();
  const ago = (n) => dayKey(addDays(new Date(), -n));
  const iso = (n, h = 10, m = 0) => { const d = addDays(new Date(), -n); d.setHours(h, m, 0, 0); return d.toISOString(); };
  const phone = () => `04${['14', '24', '12', '16', '26'][Math.floor(R() * 5)]}-${String(1000000 + Math.floor(R() * 8999999))}`;
  const pick = (a) => a[Math.floor(R() * a.length)];
  const by = 'Mostrador';
  const ops = [];
  const T = (name) => doc(collection(db, 'tenants', store.tenantId, name));
  const set = (ref, d) => ops.push((b) => b.set(ref, d));
  let seqPay = 0;

  // 0) Precios en la moneda del país elegido
  const lensCatalog = LENS_CATALOG_DEFAULT.map((l) => ({ ...l, price: money(l.price), cost: money(l.cost) }));
  const treatments = TREATMENTS_DEFAULT.map((t) => ({ ...t, price: money(t.price), cost: money(t.cost) }));
  await store.saveSettings({ lensCatalog, treatments, examFee: money(15) });

  // 1) Laboratorios
  const labs = [];
  for (const [name, contact, days] of [['Laboratorio Óptico Central', 'Sr. Ernesto Pacheco', 5], ['Lab Digital Lentes Premium', 'Ing. Mónica Arias', 7], ['Talla Express Valencia', 'Jorge Luis Peña', 3]]) {
    labs.push(await saveLab({ name, contact, days, phone: phone(), whatsapp: phone(), email: '', address: 'Zona Industrial, Valencia', notes: days === 7 ? 'Progresivos digitales y alto índice.' : '' }));
  }
  // 2) Inventario
  const P = [];
  const prod = (d) => { const ref = T('products'); const p = { name: [d.brand, d.model].filter(Boolean).join(' '), track: true, active: true, gender: 'U', location: 'Vitrina 1', supplier: 'Distribuidora Lentimax', min: 1, createdAt: iso(150), updatedAt: nowISO(), ...d, price: money(d.price), cost: money(d.cost) }; set(ref, p); P.push({ id: ref.id, ...p }); return ref.id; };
  [['Ray-Ban', 'RB5154 Clubmaster', 'Negro / dorado', 'Acetato', 51, 21, 145, 120, 52, 4, 'U'], ['Ray-Ban', 'RB2140 Wayfarer óptico', 'Carey', 'Acetato', 50, 22, 150, 115, 48, 3, 'U'], ['Vogue', 'VO5276 Cat-eye', 'Rosa cuarzo', 'Acetato', 53, 17, 140, 85, 34, 5, 'D'],
    ['Oakley', 'OX8046 Airdrop', 'Negro satinado', 'Inyectado', 55, 18, 143, 110, 46, 2, 'C'], ['Tommy Hilfiger', 'TH1689 Rectangular', 'Azul marino', 'Metal', 54, 17, 145, 75, 29, 6, 'C'], ['Carolina Herrera', 'VHE875 Mariposa', 'Burdeos', 'Acetato', 52, 17, 135, 95, 38, 3, 'D'],
    ['Guess', 'GU2700 Redondo', 'Dorado', 'Metal', 50, 20, 140, 70, 26, 4, 'D'], ['Silhouette', 'Titan Minimal Art', 'Plata', 'Titanio', 52, 19, 140, 160, 70, 1, 'U'], ['Lentimax', 'LX-220 Clásico', 'Negro', 'TR-90', 53, 18, 140, 35, 10, 12, 'U'],
    ['Lentimax', 'LX-118 Semi al aire', 'Gris', 'Metal', 54, 17, 140, 38, 11, 9, 'C'], ['Lentimax Kids', 'KD-07 Flexible', 'Azul / rojo', 'TR-90', 44, 16, 125, 30, 9, 7, 'N'], ['Lentimax Kids', 'KD-12 Gatito', 'Lila', 'TR-90', 42, 15, 120, 30, 9, 1, 'N'],
    ['Polo Ralph Lauren', 'PH2084 Clásico', 'Habana', 'Acetato', 54, 18, 145, 90, 36, 0, 'C'], ['Lentimax', 'LX-305 Al aire', 'Dorado', 'Titanio', 52, 18, 140, 55, 18, 5, 'D']]
    .forEach(([brand, model, color, material, eye, bridge, temple, price, cost, stock, gender], i) => prod({ cat: 'montura', code: `MT-${String(1001 + i)}`, brand, model, color, material, eye: String(eye), bridge: String(bridge), temple: String(temple), frameType: material === 'Titanio' && i === 7 ? 'Al aire (perforado)' : i === 9 ? 'Semi al aire (ranurado)' : 'Completo (aro cerrado)', price, cost, stock, min: price > 100 ? 1 : 3, gender }));
  [['Ray-Ban', 'RB3025 Aviator polarizado', 'Dorado / verde G-15', 165, 80, 3], ['Oakley', 'Holbrook OO9102', 'Negro mate / Prizm', 150, 72, 2], ['Vogue', 'VO5211S Oversize', 'Carey degradado', 95, 40, 4], ['Lentimax Sun', 'SN-45 Deportivo', 'Negro / espejado azul', 28, 9, 10]]
    .forEach(([brand, model, color, price, cost, stock], i) => prod({ cat: 'sol', code: `SL-${2001 + i}`, brand, model, color, price, cost, stock, min: 2, location: 'Vitrina sol' }));
  [['Acuvue', 'Oasys quincenal (caja x6)', '', 38, 20, 14], ['Air Optix', 'Plus HydraGlyde mensual (x3)', '', 34, 18, 9], ['FreshLook', 'Colorblends cosmético (x2)', 'Gris', 32, 15, 2]]
    .forEach(([brand, model, color, price, cost, stock], i) => prod({ cat: 'contacto', code: `LC-${3001 + i}`, brand, model, color, price, cost, stock, min: 3, location: 'Gaveta LC' }));
  [['Renu', 'Solución multipropósito 355 ml', 9, 4, 18], ['Opti-Free', 'PureMoist 300 ml', 11, 5, 7], ['Systane', 'Lágrimas artificiales 10 ml', 8, 3.5, 2]]
    .forEach(([brand, model, price, cost, stock], i) => prod({ cat: 'solucion', code: `SO-${4001 + i}`, brand, model, price, cost, stock, min: 4, location: 'Mostrador' }));
  [['Estuche rígido', 'Clamshell', 4, 1.2, 40], ['Paño', 'Microfibra premium', 2, 0.5, 60], ['Spray limpiador', '60 ml antiempañante', 5, 1.5, 22], ['Cordón', 'Silicona deportivo', 3, 0.8, 1]]
    .forEach(([brand, model, price, cost, stock], i) => prod({ cat: 'accesorio', code: `AC-${5001 + i}`, brand, model, price, cost, stock, min: 5, location: 'Mostrador' }));

  // 3) Pacientes
  const pats = PEOPLE.map(([name, sex, age], i) => {
    const ref = T('patients');
    const by0 = new Date().getFullYear() - age; const m = 1 + Math.floor(R() * 12); const dd = 1 + Math.floor(R() * 27);
    let birth = `${by0}-${String(m).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
    if (i === 4 || i === 27) birth = `${by0}-${todayKey().slice(5)}`; // cumplen hoy
    if (i === 15) birth = `${by0}-${dayKey(addDays(new Date(), 3)).slice(5)}`;
    const p = { name, sex, birthDate: birth, idDoc: age < 10 ? '' : `V-${(age > 40 ? 5 : 14) + Math.floor(R() * 14)}.${100 + Math.floor(R() * 899)}.${100 + Math.floor(R() * 899)}`, phone: GUARD[i] ? '' : phone(), email: R() < 0.4 ? `${name.split(' ')[0].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')}${10 + i}@correo.com` : '',
      guardianName: GUARD[i] || '', guardianPhone: GUARD[i] ? phone() : '', occupation: age < 18 ? 'Estudiante' : pick(['Docente', 'Contador(a)', 'Comerciante', 'Ingeniero(a)', 'Administrador(a)', 'Chofer', 'Jubilado(a)', 'Enfermero(a)', 'Diseñador(a)']),
      howFound: pick(['Instagram', 'Recomendación', 'Pasaba por el centro comercial', 'Google Maps', 'Seguro médico']), conditions: age > 55 && R() < 0.5 ? ['Hipertensión'] : age > 50 && R() < 0.3 ? ['Diabetes'] : [],
      code: fmtSeq('P', i + 1, 5), portalCode: genCode(8), active: true, createdAt: iso(Math.floor(R() * 170) + 3), updatedAt: nowISO(), by };
    set(ref, p);
    return { id: ref.id, ...p, age };
  });

  // 4) Exámenes visuales
  const eye = (base, cyl, axis, add) => ({ sph: base, cyl: cyl || null, axis: cyl ? axis : null, add: add || null, av: '20/20', avcc: '20/20' });
  const q = (v) => Math.round(v * 4) / 4;
  const exams = {};
  let seqEx = 0;
  pats.forEach((p, i) => {
    if (i % 9 === 8) return; // algunos sin examen
    const myope = R() < 0.55;
    const s = q(myope ? -(0.5 + R() * 4.5) : (p.age < 15 ? 0.75 + R() * 2 : 0.25 + R() * 2));
    const c1 = R() < 0.6 ? -q(0.5 + R() * 1.75) : null; const ax = 10 + Math.floor(R() * 17) * 10;
    const add = p.age >= 42 ? q(Math.min(3, 0.75 + (p.age - 42) * 0.08)) : null;
    const rx = { od: eye(s, c1, ax, add), oi: eye(q(s + (R() - 0.5) * 0.75), c1 ? q(c1 + (R() - 0.5) * 0.5) || -0.25 : null, (ax + 170) % 180 || 180, add), dp: 58 + Math.floor(R() * 10), dpNear: null };
    if (i === 5) { rx.od.sph = -7.25; rx.oi.sph = -6.75; }
    const back = i < 6 ? 375 + i * 6 : i < 10 ? 345 + i : i === 10 ? 0 : Math.floor(R() * 140) + 1; // primeros: control vencido o por vencer
    const date = ago(back);
    const diag = suggestDiagnosis(rx, p.age);
    const lensType = suggestLensType(rx, p.age);
    const ref = T('exams');
    const e = { patientId: p.id, patientName: p.name, patientCode: p.code, date, kind: i === 20 ? 'contacto' : 'lentes', reason: pick(['Visión borrosa de lejos', 'Dolor de cabeza al leer', 'Control anual', 'Cansancio visual con la computadora', 'Le cuesta leer de cerca', 'Renovar lentes']), history: '', optometrist: 'Lic. Andrés Villalobos', license: 'COV 2318',
      rx, contact: i === 20 ? { od: { bc: '8.6', dia: '14.2', power: String(rx.od.sph), brand: 'Acuvue Oasys' }, oi: { bc: '8.6', dia: '14.2', power: String(rx.oi.sph), brand: 'Acuvue Oasys' } } : null,
      pio: { od: String(13 + Math.floor(R() * 6)), oi: String(13 + Math.floor(R() * 6)) }, kerato: { od: '', oi: '' }, diagnosis: Array.isArray(diag) ? diag : [], diagnosisNote: '', lensType, material: suggestMaterial(rx), treatments: R() < 0.7 ? ['ar', ...(R() < 0.5 ? ['blue'] : [])] : ['ar'], use: add ? 'permanente' : pick(['permanente', 'lejos', 'computadora']),
      nextControlMonths: p.age >= 60 || p.age < 15 ? 6 : 12, notes: '', refer: i === 25, status: 'vigente', number: fmtSeq('F', ++seqEx, 5), verify: genCode(8), createdAt: iso(back, 9 + Math.floor(R() * 8)), by: 'Lic. Andrés Villalobos' };
    e.nextControl = addMonthsKey(date, e.nextControlMonths);
    if (i === 25) e.diagnosisNote = 'Presión intraocular elevada: remitir al oftalmólogo.';
    set(ref, e);
    exams[p.id] = { id: ref.id, ...e };
    ops.push((b) => b.set(doc(db, 'tenants', store.tenantId, 'patients', p.id), { lastExamAt: date, nextControl: e.nextControl, lastExamId: ref.id }, { merge: true }));
  });

  // 5) Órdenes de trabajo con su recorrido
  const frames = P.filter((x) => x.cat === 'montura' && x.stock > 0);
  const stockUse = {};
  let seqOrd = 0; let seqSale = 0;
  const flow = ['registrada', 'laboratorio', 'recibida', 'lista', 'entregada'];
  const pay = (o, amount, date, method, extra = {}) => {
    if (!(amount > 0)) return;
    const ref = T('payments');
    set(ref, { orderId: o.id, orderNumber: o.number, patientId: o.patientId, patientName: o.patientName, patientCode: o.patientCode, amount: round2(amount), date, method, bank: method === 'pagomovil' ? 'Banesco' : method === 'transferencia' ? 'Mercantil' : '', reference: /efectivo/.test(method) ? '' : String(20000000 + Math.floor(R() * 79999999)), amountBs: 0, rate: 0, payer: '', note: '', kind: amount >= o.total - 0.009 ? 'pago' : 'abono', status: 'confirmado', number: fmtSeq('R', ++seqPay, 6), source: extra.source || 'tienda', inboxId: '', createdAt: extra.at || iso(0), by });
  };
  const methods = ['efectivo', 'pagomovil', 'debito', 'transferencia', 'zelle', 'credito'];
  const mkOrder = (p, { status, back, labIdx = 0, frame = null, own = false, paidPct = 0.5, payRest = true, late = false, warranty = false, voided = false, seller = 'Gabriela' }) => {
    const ex = exams[p.id];
    const lens = lensCatalog.find((l) => l.type === ex?.lensType && l.material === ex?.material) || lensCatalog.find((l) => l.type === ex?.lensType) || lensCatalog[0];
    const tr = (ex?.treatments || ['ar']).map((id) => treatments.find((t) => t.id === id)).filter(Boolean);
    const fr = own ? null : frame || pick(frames);
    if (fr) stockUse[fr.id] = (stockUse[fr.id] || 0) + 1;
    const items = [...(fr ? [{ kind: 'montura', productId: fr.id, name: `Montura ${productLabel(fr)}`, code: fr.code, qty: 1, price: fr.price, cost: fr.cost }] : []), { kind: 'cristal', lensId: lens.id, name: `Cristales ${lens.name}`, qty: 1, price: lens.price, cost: lens.cost }, ...tr.map((t) => ({ kind: 'tratamiento', treatmentId: t.id, name: t.name, qty: 1, price: t.price, cost: t.cost }))];
    const disc = R() < 0.25 ? 10 : 0;
    const t = orderTotals(items, disc, 'pct');
    const lab = labs[labIdx % labs.length];
    const labCost = round2(lens.cost + tr.reduce((a, x) => a + (x.cost || 0), 0));
    const date = ago(back);
    const idx = flow.indexOf(status === 'garantia' ? 'entregada' : status === 'anulada' ? 'registrada' : status);
    const history = []; let at = {};
    flow.slice(0, idx + 1).forEach((s, k) => { const n = Math.max(0, back - [0, 1, lab.days + 1, lab.days + 2, lab.days + 4][k]); const stamp = iso(n, 9 + k * 2, 15); history.push({ s, at: stamp, by: k === 0 ? seller : 'Taller' }); at[s] = stamp; });
    if (late && at.laboratorio) { /* atrasada: prometida antes de hoy */ }
    if (status === 'garantia') history.push({ s: 'garantia', at: iso(2, 11), by: 'Taller', note: 'Cristal izquierdo con raya: se repone' });
    if (voided) history.push({ s: 'anulada', at: iso(back, 16), by: 'Gabriela', note: 'El paciente desistió' });
    const ref = T('orders');
    const o = {
      id: ref.id, kind: 'trabajo', number: fmtSeq('OT', ++seqOrd, 5), date, status, history,
      patientId: p.id, patientName: p.name, patientCode: p.code, patientPhone: p.phone || p.guardianPhone || '', examId: ex?.id || '', examNumber: ex?.number || '', rx: ex?.rx || null,
      lens: { type: lens.type, material: lens.material, lensId: lens.id, treatments: tr.map((x) => x.id), tint: '', design: '' },
      frame: own ? { own: true, name: 'Metal dorado, aro completo', type: 'Completo (aro cerrado)', eye: '52', bridge: '18', temple: '140' } : { productId: fr.id, name: productLabel(fr), own: false, eye: fr.eye, bridge: fr.bridge, temple: fr.temple, type: fr.frameType },
      items, subtotal: t.subtotal, discount: t.discount, discountMode: 'pct', discountValue: disc, total: t.total, cost: round2(t.cost + labCost), paid: 0,
      labId: lab.id, labName: lab.name, labCost, labRef: idx >= 1 ? `L-${4500 + seqOrd}` : '', promised: late ? ago(2) : dayKey(addDays(new Date(), -back + lab.days + 1)),
      notes: own ? 'Montura propia del paciente: revisada, sin daños.' : '', seller, createdAt: iso(back, 10), by: seller,
      sentAt: at.laboratorio || '', receivedAt: at.recibida || '', readyAt: at.lista || '', deliveredAt: at.entregada || '', warrantyUntil: at.entregada ? dayKey(addDays(new Date(at.entregada), 90)) : '',
      ...(status === 'garantia' ? { warrantyCount: 1, warrantyReason: 'Cristal izquierdo con raya: se repone' } : {}), ...(voided ? { voidReason: 'El paciente desistió', voidedAt: iso(back, 16) } : {})
    };
    const dep = voided ? 0 : round2(t.total * paidPct);
    o.paid = dep;
    if (dep > 0) pay(o, dep, date, pick(methods), { at: iso(back, 10, 20) });
    if (payRest && ['entregada', 'garantia'].includes(status) && dep < t.total) { const rest = round2(t.total - dep); o.paid = round2(o.paid + rest); pay(o, rest, dayKey(new Date(at.entregada || iso(back))), pick(methods), { at: at.entregada }); }
    o.open = isOpenOrder(o);
    set(ref, o);
    return o;
  };
  const withEx = pats.filter((p) => exams[p.id] && exams[p.id].kind !== 'contacto');
  const plan = [
    // entregadas a lo largo de los meses
    ...[150, 132, 118, 101, 88, 74, 61, 47, 39, 30, 24, 18, 12, 9].map((back, k) => ({ status: 'entregada', back, labIdx: k, paidPct: k % 3 === 0 ? 1 : 0.5, payRest: !(k === 4 || k === 10) })),
    { status: 'lista', back: 12, paidPct: 0.5, labIdx: 0 }, { status: 'lista', back: 8, paidPct: 1, labIdx: 2 }, { status: 'lista', back: 6, paidPct: 0.6, labIdx: 1 }, { status: 'lista', back: 5, paidPct: 0.5, labIdx: 2, own: true },
    { status: 'recibida', back: 6, paidPct: 0.5, labIdx: 0 }, { status: 'recibida', back: 4, paidPct: 1, labIdx: 2 },
    { status: 'laboratorio', back: 9, paidPct: 0.5, labIdx: 1, late: true }, { status: 'laboratorio', back: 4, paidPct: 0.5, labIdx: 1 }, { status: 'laboratorio', back: 3, paidPct: 0.7, labIdx: 0 }, { status: 'laboratorio', back: 2, paidPct: 0.5, labIdx: 0 }, { status: 'laboratorio', back: 1, paidPct: 1, labIdx: 2 },
    { status: 'registrada', back: 0, paidPct: 0.5, labIdx: 0 }, { status: 'registrada', back: 0, paidPct: 0.3, labIdx: 1 }, { status: 'registrada', back: 1, paidPct: 0.5, labIdx: 2, own: true },
    { status: 'garantia', back: 16, paidPct: 1, labIdx: 0 }, { status: 'anulada', back: 20, voided: true, labIdx: 0 }
  ];
  const orders = plan.map((x, k) => mkOrder(withEx[(k * 7 + 3) % withEx.length], x));

  // 6) Ventas de mostrador
  const sellables = P.filter((x) => ['sol', 'contacto', 'solucion', 'accesorio'].includes(x.cat) && x.stock > 2);
  for (const back of [40, 33, 26, 19, 14, 11, 7, 5, 3, 2, 1, 0, 0]) {
    const its = [pick(sellables), ...(R() < 0.45 ? [pick(sellables)] : [])].filter((v, i, a) => a.findIndex((y) => y.id === v.id) === i);
    const items = its.map((x) => ({ kind: 'producto', productId: x.id, name: productLabel(x), code: x.code, qty: x.cat === 'solucion' && R() < 0.4 ? 2 : 1, price: x.price, cost: x.cost }));
    items.forEach((i) => { stockUse[i.productId] = (stockUse[i.productId] || 0) + i.qty; });
    const t = orderTotals(items, 0, 'monto');
    const p = R() < 0.5 ? pick(pats) : null;
    const ref = T('orders');
    const o = { id: ref.id, kind: 'venta', number: fmtSeq('V', ++seqSale, 5), date: ago(back), status: 'entregada', history: [{ s: 'entregada', at: iso(back, 11 + Math.floor(R() * 6)), by, note: 'Venta de mostrador' }], patientId: p?.id || '', patientName: p?.name || 'Cliente de mostrador', patientCode: p?.code || '', patientPhone: p?.phone || '', examId: '', examNumber: '', rx: null, lens: null, frame: null, items, subtotal: t.subtotal, discount: 0, discountMode: 'monto', discountValue: 0, total: t.total, cost: t.cost, paid: t.total, labId: '', labName: '', labCost: 0, labRef: '', promised: '', notes: '', seller: pick(['Gabriela', 'Rosmary']), deliveredAt: iso(back, 12), warrantyUntil: dayKey(addDays(new Date(), 90 - back)), createdAt: iso(back, 12), by, open: false };
    set(ref, o);
    pay(o, t.total, o.date, pick(['efectivo', 'pagomovil', 'debito', 'zelle']), { at: iso(back, 12, 5) });
  }
  // Existencias descontadas por lo vendido
  for (const [pid, n] of Object.entries(stockUse)) { const pr = P.find((x) => x.id === pid); if (pr) ops.push((b) => b.set(doc(db, 'tenants', store.tenantId, 'products', pid), { stock: Math.max(0, pr.stock - n), lastSaleAt: ago(1) }, { merge: true })); }

  // 7) Citas
  const slotsToday = daySlots(store.settings.hours || HOURS_DEFAULT, today);
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  const appt = (p, date, time, reason, status, notes = '', source = 'tienda') => set(T('appointments'), { patientId: p?.id || '', name: p?.name || '', phone: p?.phone || p?.guardianPhone || '', reason, date, time, notes, optometrist: 'Lic. Andrés Villalobos', status, source, inboxId: '', createdAt: iso(3), updatedAt: nowISO(), by });
  slotsToday.filter((_, k) => k % 3 === 0).slice(0, 6).forEach((t, k) => { const [h, m] = t.split(':').map(Number); const past = h * 60 + m < nowMin; appt(pats[(k * 5 + 2) % pats.length], today, t, ['examen', 'control', 'entrega', 'contacto', 'examen', 'ninos'][k], past ? (k === 2 ? 'no_asistio' : 'atendida') : 'confirmada', k === 0 ? 'Trae sus lentes actuales' : ''); });
  for (let d = 1; d <= 12; d++) {
    const k = dayKey(addDays(new Date(), d)); const sl = daySlots(store.settings.hours || HOURS_DEFAULT, k);
    sl.filter((_, j) => j % (d === 1 ? 4 : 6) === 1).slice(0, d === 1 ? 4 : 2).forEach((t, j) => appt(pats[(d * 3 + j * 11) % pats.length], k, t, pick(['examen', 'control', 'examen', 'ajuste', 'contacto']), d < 3 ? 'confirmada' : 'pendiente', '', j === 1 ? 'en_linea' : 'tienda'));
  }
  for (let d = 1; d <= 20; d += 3) { const k = ago(d); const sl = daySlots(store.settings.hours || HOURS_DEFAULT, k); if (sl[2]) appt(pats[(d * 7) % pats.length], k, sl[2], 'examen', d === 4 ? 'no_asistio' : 'atendida'); }

  // 8) Gastos
  const expense = (concept, amount, date, category, method = 'transferencia', supplier = '') => set(T('expenses'), { concept, amount: money(amount), date, period: date.slice(0, 7), category, supplier, method, reference: '', labId: '', status: 'activo', createdAt: nowISO(), updatedAt: nowISO(), by });
  for (const m of [0, 1, 2, 3, 4]) {
    const base = dayKey(addDays(new Date(), -m * 30));
    const mk = (d) => { const x = base.slice(0, 8) + String(Math.min(28, d)).padStart(2, '0'); return x > today ? today : x; };
    expense('Alquiler del local', 450, mk(2), 'alquiler', 'transferencia', 'Inversiones Camoruco');
    expense('Pago semanal al laboratorio', 180 + Math.round(R() * 90), mk(9), 'laboratorio', 'pagomovil', 'Laboratorio Óptico Central');
    expense('Pago al laboratorio digital', 140 + Math.round(R() * 80), mk(20), 'laboratorio', 'zelle', 'Lab Digital Lentes Premium');
    expense('Electricidad e internet', 55, mk(12), 'servicios', 'debito');
    if (m < 4) expense('Publicidad Instagram', 40, mk(15), 'publicidad', 'credito', 'Meta');
    if (m % 2 === 0) expense('Compra de monturas', 380, mk(6), 'mercancia', 'transferencia', 'Distribuidora Lentimax');
  }
  expense('Café y artículos de limpieza', 12, today, 'otros', 'efectivo');

  // 9) Bandeja pública: pagos reportados desde el portal y citas pedidas en línea
  const minsAgo = (n) => new Date(Date.now() - n * 60000).toISOString();
  const withBal = orders.filter((o) => o.status !== 'anulada' && o.total - o.paid > 1 && ['laboratorio', 'lista'].includes(o.status)).slice(0, 2);
  withBal.forEach((o, i) => { const p = pats.find((x) => x.id === o.patientId); const amt = round2(o.total - o.paid); set(doc(collection(db, 'inbox')), { type: 'pago', tenantId: store.tenantId, code: p.portalCode, who: p.id, patientName: p.name, patientCode: p.code, orderId: o.id, orderNumber: o.number, amount: amt, method: i ? 'zelle' : 'pagomovil', bank: i ? '' : 'Banesco', reference: String(40000000 + Math.floor(R() * 9999999)), date: today, amountBs: 0, rate: 0, payer: p.name, note: i ? '' : 'Resto de mis lentes', status: 'nueva', createdAt: minsAgo(20 + i * 95) }); });
  const bk = store.settings.bookingCode;
  const k2 = dayKey(addDays(new Date(), 2)); const s2 = daySlots(store.settings.hours || HOURS_DEFAULT, k2);
  const k3 = dayKey(addDays(new Date(), 3)); const s3 = daySlots(store.settings.hours || HOURS_DEFAULT, k3);
  if (s2[4]) set(doc(collection(db, 'inbox')), { type: 'cita', tenantId: store.tenantId, code: bk, who: '', name: 'Fabiola Requena', phone: '0414-5512398', idDoc: 'V-21.334.876', reason: 'examen', date: k2, time: s2[4], note: 'Veo borroso de lejos, sobre todo de noche', status: 'nueva', createdAt: minsAgo(45) });
  if (s3[7]) set(doc(collection(db, 'inbox')), { type: 'cita', tenantId: store.tenantId, code: bk, who: '', name: 'Tomás Echenique', phone: '0424-3321870', idDoc: '', reason: 'contacto', date: k3, time: s3[7], note: 'Quiero probar lentes de contacto', status: 'nueva', createdAt: minsAgo(180) });

  // 10) Contadores
  ops.push((b) => b.set(doc(db, 'tenants', store.tenantId, 'config', 'counters'), { patient: pats.length, exam: seqEx, order: seqOrd, sale: seqSale, payment: seqPay }, { merge: true }));
  await chunked(ops, 80);
  store.counters = { ...store.counters, patient: pats.length, exam: seqEx, order: seqOrd, sale: seqSale, payment: seqPay };
  await waitFor(() => store.patients.length >= pats.length && store.orders.length >= orders.length, 10000);

  // 11) Cierre de caja de ayer
  try {
    const { closeCash, cashSummary } = await import('./ops.js');
    const y = ago(1); const s = cashSummary(y);
    if (s.total > 0) await closeCash(y, { counted: { efectivo: Math.max(0, (s.byMethod.efectivo?.amount || 0) - s.cashExp) }, note: 'Cierre del turno de la tarde' });
  } catch (e) { console.warn('[demo] cierre', e); }
}

/** Borra todos los datos de una cuenta: portales públicos, fórmulas verificables, agenda en línea, bandeja y colecciones. */
export async function purgeTenant(tenantId, onlyDemo = true, codes = null, extra = {}) {
  const del = async (refs) => { for (let i = 0; i < refs.length; i += 80) { const b = writeBatch(db); refs.slice(i, i + 80).forEach((r) => b.delete(r)); await b.commit().catch((e) => console.warn('[purge]', e?.code || e)); } };
  try {
    let list = codes;
    if (!list) { const st = await getDocs(collection(db, 'tenants', tenantId, 'patients')); list = st.docs.map((d) => d.data().portalCode).filter(Boolean); }
    await del(list.map((c) => doc(db, 'portals', c)));
  } catch (e) { console.warn('[purge] portales', e?.code || e); }
  try {
    let booking = extra.booking;
    if (booking === undefined) { const s = await getDoc(doc(db, 'tenants', tenantId, 'config', 'settings')); booking = s.exists() ? s.data().bookingCode : ''; }
    if (booking) await del([doc(db, 'bookings', booking)]);
    let rx = extra.rx;
    if (!rx) { const cs = await getDocs(collection(db, 'tenants', tenantId, 'exams')); rx = cs.docs.map((d) => d.data().verify).filter(Boolean); }
    await del(rx.map((c) => doc(db, 'rx', c)));
  } catch (e) { console.warn('[purge] agenda/fórmulas', e?.code || e); }
  try {
    const rq = await getDocs(query(collection(db, 'inbox'), where('tenantId', '==', tenantId)));
    await del(rq.docs.map((d) => d.ref));
  } catch (e) { console.warn('[purge] bandeja', e?.code || e); }
  for (const c of DATA_COLLECTIONS) {
    try { const snap = await getDocs(collection(db, 'tenants', tenantId, c)); await del(snap.docs.map((d) => d.ref)); }
    catch (e) { console.warn('[purge]', c, e?.code || e); }
  }
  if (onlyDemo) {
    try {
      const t = await getDoc(doc(db, 'tenants', tenantId));
      if (t.exists() && t.data().demo === true) { const b = writeBatch(db); b.delete(t.ref); await b.commit(); }
    } catch (e) { console.warn('[purge] cuenta', e?.code || e); }
  }
}

export async function cleanupDemo(tenantId, codes = null, extra = {}) {
  await purgeTenant(tenantId, true, codes && codes.length ? codes : null, extra);
  const u = auth.currentUser;
  if (u && u.isAnonymous) {
    try { await u.delete(); } catch (_) { await signOut(auth).catch(() => {}); }
  }
}
void ageOf;
