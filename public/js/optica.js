// SanoÓptica — Lógica del negocio óptico: fórmulas (OD/OI), cristales, órdenes de trabajo, saldos y fechas
import { round2, todayKey, dayKey, addDays, fromKey, num, esc } from './utils.js';

// ======================================================================
// ESTADOS Y CATÁLOGOS
// ======================================================================
export const ORDER_STATUS = {
  registrada: { label: 'Registrada', tone: 'neutral', icon: 'clipboard', step: 0, hint: 'Pedido tomado, falta enviarlo al laboratorio' },
  laboratorio: { label: 'En laboratorio', tone: 'info', icon: 'lab', step: 1, hint: 'El laboratorio está tallando los cristales' },
  recibida: { label: 'Control de calidad', tone: 'violet', icon: 'eye', step: 2, hint: 'Llegó del laboratorio: revisar graduación y montaje' },
  lista: { label: 'Lista para retirar', tone: 'success', icon: 'checkCircle', step: 3, hint: 'El paciente puede pasar a retirar' },
  entregada: { label: 'Entregada', tone: 'brand', icon: 'glasses', step: 4, hint: 'El paciente retiró sus lentes' },
  garantia: { label: 'En garantía', tone: 'warning', icon: 'refresh', step: 1, hint: 'Se rehace por garantía o reclamo' },
  anulada: { label: 'Anulada', tone: 'danger', icon: 'x', step: -1, hint: 'Orden anulada' }
};
export const FLOW = ['registrada', 'laboratorio', 'recibida', 'lista', 'entregada'];
export const nextStatus = (s) => (s === 'garantia' ? 'recibida' : FLOW[FLOW.indexOf(s) + 1] || null);
export const isOpenOrder = (o) => o && o.status !== 'anulada' && (o.status !== 'entregada' || orderBalance(o) > 0.009);

export const APPT_STATUS = {
  pendiente: { label: 'Por confirmar', tone: 'neutral' },
  confirmada: { label: 'Confirmada', tone: 'info' },
  atendida: { label: 'Atendida', tone: 'success' },
  no_asistio: { label: 'No asistió', tone: 'danger' },
  cancelada: { label: 'Cancelada', tone: 'neutral' }
};
export const APPT_REASONS = {
  examen: { label: 'Examen visual', icon: 'eyeTest', min: 30 },
  control: { label: 'Control anual', icon: 'calendar', min: 30 },
  contacto: { label: 'Adaptación de lentes de contacto', icon: 'contact', min: 40 },
  entrega: { label: 'Entrega de lentes', icon: 'glasses', min: 15 },
  ajuste: { label: 'Ajuste o reparación', icon: 'wrench', min: 15 },
  ninos: { label: 'Examen para niños', icon: 'smile', min: 30 }
};

export const PRODUCT_CATS = {
  montura: { label: 'Monturas', one: 'Montura', icon: 'frame', color: '#0284c7' },
  sol: { label: 'Lentes de sol', one: 'Lente de sol', icon: 'sunglasses', color: '#f59e0b' },
  contacto: { label: 'Lentes de contacto', one: 'Lente de contacto', icon: 'contact', color: '#14b8a6' },
  solucion: { label: 'Soluciones y gotas', one: 'Solución', icon: 'droplet', color: '#6366f1' },
  terminado: { label: 'Cristales terminados', one: 'Cristal terminado', icon: 'lens', color: '#8b5cf6' },
  accesorio: { label: 'Accesorios', one: 'Accesorio', icon: 'tag', color: '#ec4899' }
};
export const catOf = (k) => PRODUCT_CATS[k] || PRODUCT_CATS.accesorio;
export const FRAME_MATERIALS = ['Acetato', 'Metal', 'TR-90', 'Titanio', 'Aluminio', 'Inyectado', 'Madera'];
export const FRAME_TYPES = ['Completo (aro cerrado)', 'Semi al aire (ranurado)', 'Al aire (perforado)'];
export const GENDERS = { U: 'Unisex', D: 'Dama', C: 'Caballero', N: 'Niño(a)' };

export const LENS_TYPES = {
  monofocal: { label: 'Monofocal', sub: 'Una sola graduación (lejos o cerca)' },
  bifocal: { label: 'Bifocal', sub: 'Lejos y cerca con segmento visible' },
  progresivo: { label: 'Progresivo', sub: 'Lejos, intermedio y cerca sin línea' },
  ocupacional: { label: 'Ocupacional', sub: 'Computadora y cerca (oficina)' },
  contacto: { label: 'Lente de contacto', sub: 'Blando o rígido' }
};
export const LENS_MATERIALS = { cr39: 'CR-39 (1.50)', poli: 'Policarbonato (1.59)', trivex: 'Trivex (1.53)', ai160: 'Alto índice 1.60', ai167: 'Alto índice 1.67', ai174: 'Alto índice 1.74', vidrio: 'Vidrio mineral' };

/** Lista de precios por defecto de cristales (por par) y tratamientos */
export const LENS_CATALOG_DEFAULT = [
  { id: 'm-cr39', type: 'monofocal', material: 'cr39', name: 'Monofocal CR-39', price: 25, cost: 9 },
  { id: 'm-poli', type: 'monofocal', material: 'poli', name: 'Monofocal policarbonato', price: 45, cost: 17 },
  { id: 'm-ai160', type: 'monofocal', material: 'ai160', name: 'Monofocal alto índice 1.60', price: 70, cost: 28 },
  { id: 'm-ai167', type: 'monofocal', material: 'ai167', name: 'Monofocal alto índice 1.67', price: 95, cost: 40 },
  { id: 'b-cr39', type: 'bifocal', material: 'cr39', name: 'Bifocal flat-top CR-39', price: 55, cost: 22 },
  { id: 'p-cr39', type: 'progresivo', material: 'cr39', name: 'Progresivo estándar CR-39', price: 120, cost: 50 },
  { id: 'p-poli', type: 'progresivo', material: 'poli', name: 'Progresivo digital policarbonato', price: 190, cost: 82 },
  { id: 'o-cr39', type: 'ocupacional', material: 'cr39', name: 'Ocupacional (oficina) CR-39', price: 110, cost: 46 }
];
export const TREATMENTS_DEFAULT = [
  { id: 'ar', name: 'Antirreflejo', price: 20, cost: 6 },
  { id: 'blue', name: 'Filtro de luz azul', price: 30, cost: 10 },
  { id: 'foto', name: 'Fotocromático (transitions)', price: 45, cost: 18 },
  { id: 'polar', name: 'Polarizado', price: 40, cost: 16 },
  { id: 'tinte', name: 'Tinte / degradado', price: 12, cost: 3 },
  { id: 'hard', name: 'Endurecido antirrayas', price: 8, cost: 2 }
];

export const DIAGNOSES = {
  emetropia: 'Emetropía (visión normal)', miopia: 'Miopía', hipermetropia: 'Hipermetropía', astigmatismo: 'Astigmatismo', presbicia: 'Presbicia',
  anisometropia: 'Anisometropía', ambliopia: 'Ambliopía', estrabismo: 'Estrabismo', ojo_seco: 'Ojo seco', conjuntivitis: 'Conjuntivitis',
  pterigion: 'Pterigión', catarata: 'Sospecha de catarata (referir)', glaucoma: 'Sospecha de glaucoma (referir)', fatiga: 'Fatiga visual digital'
};
export const LENS_USE = { permanente: 'Uso permanente', lejos: 'Visión lejana (manejar, TV)', cerca: 'Lectura / cerca', computadora: 'Computadora', sol: 'Sol / exteriores' };
export const CONDITIONS = ['Diabetes', 'Hipertensión', 'Glaucoma en la familia', 'Cirugía ocular', 'Usa lentes de contacto', 'Alergias oculares', 'Migraña'];

export const EXPENSE_CATEGORIES = [
  { id: 'laboratorio', name: 'Laboratorio', icon: 'lab' },
  { id: 'mercancia', name: 'Compra de monturas', icon: 'frame' },
  { id: 'alquiler', name: 'Alquiler', icon: 'building' },
  { id: 'servicios', name: 'Servicios (luz, agua, internet)', icon: 'zap' },
  { id: 'nomina', name: 'Nómina y comisiones', icon: 'users' },
  { id: 'equipos', name: 'Equipos y mantenimiento', icon: 'wrench' },
  { id: 'publicidad', name: 'Publicidad', icon: 'megaphone' },
  { id: 'impuestos', name: 'Impuestos y permisos', icon: 'receipt' },
  { id: 'otros', name: 'Otros', icon: 'tag' }
];
export const expCat = (id, list = EXPENSE_CATEGORIES) => list.find((c) => c.id === id) || { id, name: id || 'Otros', icon: 'tag' };
export const PAY_STATUS = { confirmado: { label: 'Confirmado', tone: 'success' }, anulado: { label: 'Anulado', tone: 'danger' } };
export const HOURS_DEFAULT = { days: [1, 2, 3, 4, 5, 6], from: '08:30', to: '17:30', lunchFrom: '12:30', lunchTo: '13:30', slot: 30, satTo: '13:00' };

export const badge = (map, k) => { const s = map[k] || { label: k, tone: 'neutral' }; return `<span class="badge badge-${s.tone}"><i class="dotc"></i>${s.label}</span>`; };

// ======================================================================
// FECHAS Y PERIODOS
// ======================================================================
export const periodOf = (d = new Date()) => dayKey(d).slice(0, 7);
export const currentPeriod = () => periodOf(new Date());
export function addMonths(period, n) {
  const [y, m] = period.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export function periodName(period, short = false) {
  if (!period) return '—';
  const [y, m] = period.split('-').map(Number);
  const n = MONTHS[m - 1] || '';
  return short ? `${n.slice(0, 3)} ${String(y).slice(2)}` : `${n.charAt(0).toUpperCase() + n.slice(1)} ${y}`;
}
export const lastPeriods = (n, from = currentPeriod()) => Array.from({ length: n }, (_, i) => addMonths(from, -i));
export const daysTo = (key) => (key ? Math.round((fromKey(key) - fromKey(todayKey())) / 864e5) : null);
export const addMonthsKey = (key, n) => { const d = fromKey(key || todayKey()); d.setMonth(d.getMonth() + n); return dayKey(d); };
export function fmtHour(t) {
  if (!t) return '';
  const [h, m] = String(t).split(':').map(Number);
  const ap = h >= 12 ? 'p. m.' : 'a. m.';
  return `${((h + 11) % 12) + 1}:${String(m || 0).padStart(2, '0')} ${ap}`;
}
export const toMin = (t) => { const [h, m] = String(t || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
export const fromMin = (n) => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
/** Horas disponibles de un día según el horario de atención */
export function daySlots(hours, dateKey) {
  const h = { ...HOURS_DEFAULT, ...(hours || {}) };
  const dow = fromKey(dateKey).getDay();
  if (!(h.days || []).map(Number).includes(dow)) return [];
  const end = toMin(dow === 6 && h.satTo ? h.satTo : h.to);
  const step = Math.max(10, Number(h.slot) || 30);
  const out = [];
  for (let t = toMin(h.from); t + step <= end; t += step) {
    if (h.lunchFrom && h.lunchTo && t >= toMin(h.lunchFrom) && t < toMin(h.lunchTo)) continue;
    out.push(fromMin(t));
  }
  return out;
}

// ======================================================================
// PERSONAS
// ======================================================================
export const firstName = (p) => String(p?.name || '').trim().split(/\s+/)[0] || '';
export function ageOf(birth, at = new Date()) {
  if (!birth) return null;
  const b = new Date(birth + 'T12:00:00');
  if (isNaN(b)) return null;
  let a = at.getFullYear() - b.getFullYear();
  if (at.getMonth() < b.getMonth() || (at.getMonth() === b.getMonth() && at.getDate() < b.getDate())) a--;
  return a >= 0 && a < 130 ? a : null;
}
export const isMinor = (p) => { const a = ageOf(p?.birthDate); return a != null && a < 18; };
export const contactPhone = (p) => (isMinor(p) && p.guardianPhone ? p.guardianPhone : p?.phone || p?.guardianPhone || '');
export const contactName = (p) => (isMinor(p) && p.guardianName ? p.guardianName : p?.name || '');

// ======================================================================
// FÓRMULA (REFRACCIÓN)
// ======================================================================
export const EYES = { od: 'OD (ojo derecho)', oi: 'OI (ojo izquierdo)' };
/** Convierte texto a dioptría: acepta "-1,25", "+2", "pl", "plano", "N" → número redondeado a 0,25 */
export function parseDiop(v) {
  if (v == null) return null;
  const s = String(v).trim().toLowerCase().replace(',', '.').replace(/\s+/g, '');
  if (!s) return null;
  if (['pl', 'plano', 'n', 'neutro', '0'].includes(s)) return 0;
  const n = Number(s);
  if (!isFinite(n)) return NaN;
  return Math.round(n * 4) / 4;
}
export const parseAxis = (v) => { const s = String(v ?? '').trim(); if (!s) return null; const n = Math.round(Number(s)); return isFinite(n) ? n : NaN; };
/** Dioptría con signo y dos decimales: +1,25 · -0,50 · Plano */
export function fmtDiop(v, { plano = true } = {}) {
  if (v == null || v === '' || isNaN(v)) return '';
  const n = Number(v);
  if (n === 0) return plano ? 'Plano' : '0,00';
  return `${n > 0 ? '+' : '−'}${num(Math.abs(n), 2)}`;
}
export const fmtAxis = (v) => (v == null || v === '' || isNaN(v) ? '' : `${Math.round(v)}°`);
/** Valida un ojo. Devuelve lista de errores en texto. */
export function eyeErrors(e = {}, label = '') {
  const out = [];
  const L = label ? `${label}: ` : '';
  if (e.sph != null && (isNaN(e.sph) || e.sph < -30 || e.sph > 30)) out.push(`${L}la esfera debe estar entre −30,00 y +30,00`);
  if (e.cyl != null && (isNaN(e.cyl) || e.cyl < -12 || e.cyl > 12)) out.push(`${L}el cilindro debe estar entre −12,00 y +12,00`);
  if (e.cyl && (e.axis == null || isNaN(e.axis))) out.push(`${L}con cilindro debes indicar el eje`);
  if (e.axis != null && !isNaN(e.axis) && (e.axis < 0 || e.axis > 180)) out.push(`${L}el eje va de 0° a 180°`);
  if (e.add != null && (isNaN(e.add) || e.add < 0 || e.add > 4)) out.push(`${L}la adición va de +0,75 a +4,00`);
  return out;
}
/** Transpone a cilindro negativo (convención habitual del laboratorio) */
export function toMinusCyl(e = {}) {
  if (!e || !e.cyl || e.cyl <= 0) return { ...e };
  const sph = round2((Number(e.sph) || 0) + e.cyl);
  const axis = ((Number(e.axis) || 0) + 90) % 180 || 180;
  return { ...e, sph, cyl: -e.cyl, axis };
}
export const spherEq = (e = {}) => round2((Number(e.sph) || 0) + (Number(e.cyl) || 0) / 2);
/** Texto corto de un ojo: "-2,25 −0,75 × 180° Add +2,00" */
export function eyeText(e = {}) {
  if (!e || (e.sph == null && e.cyl == null && e.add == null)) return '—';
  const parts = [fmtDiop(e.sph ?? 0)];
  if (e.cyl) parts.push(`${fmtDiop(e.cyl, { plano: false })} × ${fmtAxis(e.axis)}`);
  if (e.add) parts.push(`Add ${fmtDiop(e.add, { plano: false })}`);
  if (e.prism) parts.push(`Prisma ${num(e.prism, 2)}Δ ${e.base || ''}`.trim());
  return parts.join(' ');
}
export const rxText = (rx = {}) => `OD ${eyeText(rx.od)} · OI ${eyeText(rx.oi)}${rx.dp ? ` · DP ${num(rx.dp, rx.dp % 1 ? 1 : 0)} mm` : ''}`;
export const hasRx = (rx) => !!rx && ['od', 'oi'].some((k) => rx[k] && (rx[k].sph != null || rx[k].cyl != null || rx[k].add != null));
/** Diagnóstico sugerido a partir de la refracción y la edad */
export function suggestDiagnosis(rx = {}, age = null) {
  const set = new Set();
  const eyes = ['od', 'oi'].map((k) => rx[k] || {}).filter((e) => e.sph != null || e.cyl != null);
  for (const e of eyes) {
    const se = spherEq(e);
    if ((Number(e.sph) || 0) < -0.12 || se < -0.25) set.add('miopia');
    if ((Number(e.sph) || 0) > 0.12 && se > 0.25) set.add('hipermetropia');
    if (Math.abs(Number(e.cyl) || 0) >= 0.5) set.add('astigmatismo');
    if ((Number(e.add) || 0) > 0) set.add('presbicia');
  }
  if (eyes.length === 2 && Math.abs(spherEq(eyes[0]) - spherEq(eyes[1])) >= 2) set.add('anisometropia');
  if (age != null && age >= 42 && !set.has('presbicia') && eyes.some((e) => e.add)) set.add('presbicia');
  if (eyes.length && !set.size) set.add('emetropia');
  return [...set];
}
/** Tipo de cristal sugerido: con adición → progresivo (o bifocal); sin adición → monofocal */
export function suggestLensType(rx = {}, age = null) {
  const add = Math.max(Number(rx.od?.add) || 0, Number(rx.oi?.add) || 0);
  if (add > 0) return 'progresivo';
  if (age != null && age >= 45) return 'progresivo';
  return 'monofocal';
}
/** Material sugerido por la potencia más alta (meridiano más fuerte) */
export function suggestMaterial(rx = {}) {
  const pow = Math.max(...['od', 'oi'].map((k) => { const e = rx[k] || {}; const s = Number(e.sph) || 0; const c = Number(e.cyl) || 0; return Math.max(Math.abs(s), Math.abs(s + c)); }), 0);
  if (pow >= 6) return 'ai167';
  if (pow >= 4) return 'ai160';
  if (pow >= 2.5) return 'poli';
  return 'cr39';
}
export const AV_VALUES = ['20/20', '20/25', '20/30', '20/40', '20/50', '20/60', '20/70', '20/80', '20/100', '20/200', '20/400', 'CD', 'MM', 'PL', 'NPL'];

// ======================================================================
// ÓRDENES Y SALDOS
// ======================================================================
export const orderBalance = (o) => round2((Number(o?.total) || 0) - (Number(o?.paid) || 0));
export const orderPaidPct = (o) => (Number(o?.total) > 0 ? Math.min(100, Math.round((Number(o.paid) || 0) / o.total * 100)) : 100);
export function orderTotals(items = [], discount = 0, discountMode = 'monto') {
  const subtotal = round2(items.reduce((a, i) => a + (Number(i.price) || 0) * (Number(i.qty) || 1), 0));
  const cost = round2(items.reduce((a, i) => a + (Number(i.cost) || 0) * (Number(i.qty) || 1), 0));
  const disc = round2(discountMode === 'pct' ? subtotal * Math.min(100, Math.max(0, Number(discount) || 0)) / 100 : Math.min(subtotal, Math.max(0, Number(discount) || 0)));
  return { subtotal, discount: disc, total: round2(subtotal - disc), cost };
}
/** Días de atraso de una orden (si pasó la fecha prometida y no está lista) */
export function orderLate(o, today = todayKey()) {
  if (!o?.promised || ['lista', 'entregada', 'anulada'].includes(o.status)) return 0;
  return Math.max(0, Math.round((fromKey(today) - fromKey(o.promised)) / 864e5));
}
/** Días que lleva lista sin retirar */
export function waitingDays(o) {
  if (o?.status !== 'lista' || !o.readyAt) return 0;
  return Math.max(0, Math.round((Date.now() - new Date(o.readyAt).getTime()) / 864e5));
}
export const promiseDate = (labDays = 5, from = new Date()) => {
  let d = new Date(from); let n = Number(labDays) || 0;
  while (n > 0) { d = addDays(d, 1); if (d.getDay() !== 0) n--; }
  return dayKey(d);
};
export const kindLabel = (o) => (o?.kind === 'venta' ? 'Venta' : 'Orden de trabajo');
export const itemsText = (o) => (o?.items || []).map((i) => `${(Number(i.qty) || 1) > 1 ? i.qty + ' × ' : ''}${i.name}`).join(' · ');

// ======================================================================
// INVENTARIO
// ======================================================================
export const stockTone = (p) => (Number(p?.stock) <= 0 ? 'danger' : Number(p?.stock) <= (Number(p?.min) || 0) ? 'warning' : 'success');
export const productLabel = (p) => [p?.brand, p?.model || p?.name, p?.color].filter(Boolean).join(' · ') || p?.name || 'Producto';
export const sizeText = (p) => (p?.eye ? `${p.eye}□${p.bridge || '—'} ${p.temple || ''}`.trim() : '');
export const margin = (p) => (Number(p?.price) > 0 ? Math.round((1 - (Number(p.cost) || 0) / p.price) * 100) : 0);

/** Celda de fórmula para tablas (HTML) */
export const dCell = (v, axis = false) => `<td class="c mono">${esc(axis ? fmtAxis(v) : fmtDiop(v, { plano: true }))}</td>`;
