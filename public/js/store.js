// SanoÓptica — Capa de datos (Firestore en tiempo real + caché offline)
import {
  db, collection, doc, getDoc, getDocs, setDoc, deleteDoc, onSnapshot, query, where, writeBatch, increment
} from './firebase.js';
import { sha256, toast, todayKey, dayKey, addDays, applyLocale, setFx, round2 } from './utils.js';
import { EXPENSE_CATEGORIES, LENS_CATALOG_DEFAULT, TREATMENTS_DEFAULT, HOURS_DEFAULT, orderBalance, isOpenOrder, currentPeriod, addMonths } from './optica.js';

const DEFAULT_SETTINGS = {
  businessName: '', rif: '', phone: '', whatsapp: '', email: '', address: '', manager: '', slogan: '',
  optometrist: '', license: '',
  country: '', currency: '', fx: { enabled: false, sym: 'Bs', name: 'Bolívares', rate: 0, updatedAt: '' },
  minDepositPct: 50,
  warrantyDays: 90,
  controlMonths: 12,
  examFee: 15,
  categories: EXPENSE_CATEGORIES,
  lensCatalog: LENS_CATALOG_DEFAULT,
  treatments: TREATMENTS_DEFAULT,
  hours: HOURS_DEFAULT,
  banks: [],
  receiptNote: 'Garantía de 90 días por defectos de fabricación del cristal y la montura. Los lentes no retirados en 90 días pasan a depósito.',
  portal: { enabled: true, reports: true, booking: true, rx: true },
  bookingCode: '',
  orderPrefix: 'OT'
};

class Store {
  constructor() {
    this.tenantId = null; this.tenant = null;
    this.settings = { ...DEFAULT_SETTINGS }; this.security = {}; this.counters = {}; this.announcement = null;
    this.patients = []; this.exams = []; this.orders = []; this.payments = []; this.products = []; this.labs = [];
    this.appointments = []; this.expenses = []; this.closings = []; this.moves = []; this.inbox = [];
    this._openOrders = []; this._recentOrders = [];
    this.ready = false; this._unsubs = []; this._listeners = {}; this._loaded = new Set();
  }

  on(evt, fn) { (this._listeners[evt] ||= new Set()).add(fn); return () => this._listeners[evt].delete(fn); }
  emit(evt, data) {
    (this._listeners[evt] || []).forEach((fn) => { try { fn(data); } catch (e) { console.error(e); } });
    (this._listeners['*'] || []).forEach((fn) => { try { fn(evt); } catch (e) { console.error(e); } });
  }

  col(name) { return collection(db, 'tenants', this.tenantId, name); }
  ref(name, id) { return doc(db, 'tenants', this.tenantId, name, String(id)); }
  newRef(name) { return doc(this.col(name)); }
  tenantRef(id = this.tenantId) { return doc(db, 'tenants', id); }
  portalRef(code) { return doc(db, 'portals', String(code)); }
  rxRef(code) { return doc(db, 'rx', String(code)); }
  bookingRef(code) { return doc(db, 'bookings', String(code)); }
  inboxRef(id) { return doc(db, 'inbox', String(id)); }
  newInboxRef() { return doc(collection(db, 'inbox')); }
  batch() { return writeBatch(db); }
  get isDemo() { return this.tenant?.demo === true; }
  inc(n) { return increment(n); }

  /** La caché local aplica el cambio al instante (también sin internet); se espera al servidor como máximo unos segundos. */
  async commit(batch) {
    const p = batch.commit();
    p.catch((err) => {
      console.error('[store] commit', err);
      toast(err?.code === 'permission-denied' ? 'Sin permiso para guardar. Verifica que la cuenta esté activa.' : 'No se pudo sincronizar un cambio: ' + (err?.message || err), 'danger', 5000);
    });
    if (!navigator.onLine) return;
    await Promise.race([p.catch(() => {}), new Promise((r) => setTimeout(r, 3500))]);
  }
  async save(name, id, data, merge = true) { const b = this.batch(); b.set(this.ref(name, id), data, { merge }); await this.commit(b); }
  async remove(name, id) { const b = this.batch(); b.delete(this.ref(name, id)); await this.commit(b); }

  async start(tenantId) {
    this.stop();
    this.tenantId = tenantId;
    this._loaded = new Set();
    const need = ['tenant', 'settings', 'patients', 'orders', 'payments', 'products'];
    let resolveReady;
    const readyP = new Promise((r) => { resolveReady = r; });
    const mark = (k) => { this._loaded.add(k); if (need.every((x) => this._loaded.has(x))) resolveReady(); };
    const fail = (k) => (err) => { console.error('[store]', k, err); mark(k); if (err?.code === 'permission-denied') this.emit('denied', err); };
    const listen = (q, k, fn) => this._unsubs.push(onSnapshot(q, (s) => { fn(s); mark(k); this.emit(k); this.emit('change', k); }, fail(k)));
    const rows = (s) => s.docs.map((d) => ({ id: d.id, ...d.data() }));
    const byName = (a, b) => (a.name || '').localeCompare(b.name || '', 'es', { numeric: true });
    const byDateDesc = (a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || '');

    listen(this.tenantRef(), 'tenant', (s) => { this.tenant = s.exists() ? { id: s.id, ...s.data() } : null; });
    listen(this.ref('config', 'settings'), 'settings', (s) => {
      this.settings = { ...DEFAULT_SETTINGS, ...(s.exists() ? s.data() : {}) };
      applyLocale(this.settings.country || 'VE', this.settings.currency);
      if (!Array.isArray(this.settings.categories) || !this.settings.categories.length) this.settings.categories = EXPENSE_CATEGORIES;
      if (!Array.isArray(this.settings.lensCatalog)) this.settings.lensCatalog = LENS_CATALOG_DEFAULT;
      if (!Array.isArray(this.settings.treatments)) this.settings.treatments = TREATMENTS_DEFAULT;
      if (!Array.isArray(this.settings.banks)) this.settings.banks = [];
      for (const k of ['portal', 'fx', 'hours']) this.settings[k] = { ...DEFAULT_SETTINGS[k], ...(this.settings[k] || {}) };
      setFx(this.settings.fx);
    });
    this._unsubs.push(onSnapshot(this.ref('config', 'security'), (s) => { this.security = s.exists() ? s.data() : {}; }, () => {}));
    this._unsubs.push(onSnapshot(this.ref('config', 'counters'), (s) => { this.counters = s.exists() ? s.data() : {}; }, () => {}));
    this._unsubs.push(onSnapshot(doc(db, 'system', 'announcement'), (s) => { this.announcement = s.exists() ? s.data() : null; this.emit('announcement'); }, () => {}));
    listen(this.col('patients'), 'patients', (s) => { this.patients = rows(s).sort(byName); this._pMap = null; });
    listen(this.col('products'), 'products', (s) => { this.products = rows(s).sort(byName); this._prMap = null; });
    // Órdenes: las abiertas (sin entregar o con saldo) + las de los últimos 13 meses
    const mergeOrders = () => {
      const m = new Map();
      for (const o of [...this._recentOrders, ...this._openOrders]) m.set(o.id, o);
      this.orders = [...m.values()].sort(byDateDesc);
      this._oMap = null; this._balMap = null;
    };
    this._unsubs.push(onSnapshot(query(this.col('orders'), where('open', '==', true)), (s) => { this._openOrders = rows(s); mergeOrders(); this.emit('orders'); this.emit('change', 'orders'); }, (e) => console.warn('[store] open orders', e?.code || e)));
    listen(query(this.col('orders'), where('date', '>=', dayKey(addDays(new Date(), -400)))), 'orders', (s) => { this._recentOrders = rows(s); mergeOrders(); });
    listen(query(this.col('payments'), where('date', '>=', dayKey(addDays(new Date(), -400)))), 'payments', (s) => { this.payments = rows(s).sort(byDateDesc); });
    const sub = (name, key, sort, q = null) => this._unsubs.push(onSnapshot(q || this.col(name), (s) => { this[key] = rows(s).sort(sort); if (key === 'labs') this._lMap = null; this.emit(key); this.emit('change', key); }, (e) => console.warn('[store]', name, e?.code || e)));
    sub('exams', 'exams', byDateDesc);
    sub('labs', 'labs', byName);
    sub('appointments', 'appointments', (a, b) => (a.date || '').localeCompare(b.date || '') || (a.time || '').localeCompare(b.time || ''), query(this.col('appointments'), where('date', '>=', dayKey(addDays(new Date(), -90)))));
    sub('expenses', 'expenses', byDateDesc, query(this.col('expenses'), where('period', '>=', addMonths(currentPeriod(), -12))));
    sub('closings', 'closings', (a, b) => (b.date || '').localeCompare(a.date || ''), query(this.col('closings'), where('date', '>=', dayKey(addDays(new Date(), -120)))));
    sub('moves', 'moves', (a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''), query(this.col('moves'), where('date', '>=', dayKey(addDays(new Date(), -90)))));
    // Bandeja pública: pagos reportados desde el portal y citas pedidas en línea
    this._unsubs.push(onSnapshot(query(collection(db, 'inbox'), where('tenantId', '==', tenantId)), (s) => {
      this.inbox = rows(s).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      this.emit('inbox');
    }, (e) => console.warn('[store] inbox', e?.code || e)));

    await Promise.race([readyP, new Promise((r) => setTimeout(r, 8000))]);
    this.ready = true;
  }

  stop() {
    this._unsubs.forEach((u) => { try { u(); } catch (_) {} });
    this._unsubs = []; this.ready = false;
    this.tenant = null; this.patients = []; this.exams = []; this.orders = []; this.payments = []; this.products = []; this.labs = [];
    this.appointments = []; this.expenses = []; this.closings = []; this.moves = []; this.inbox = []; this._openOrders = []; this._recentOrders = [];
    this.settings = { ...DEFAULT_SETTINGS }; this.security = {}; this.counters = {};
    this._pMap = this._oMap = this._prMap = this._lMap = this._balMap = null;
  }

  // ---------- Ajustes ----------
  get country() { return this.settings.country || ''; }
  get businessName() { return this.settings.businessName || this.tenant?.name || 'Mi óptica'; }
  get categories() { return this.settings.categories || EXPENSE_CATEGORIES; }
  get lensCatalog() { return (this.settings.lensCatalog || []).filter((l) => l.active !== false); }
  get treatments() { return (this.settings.treatments || []).filter((t) => t.active !== false); }
  lens(id) { return (this.settings.lensCatalog || []).find((l) => l.id === id) || null; }
  treatment(id) { return (this.settings.treatments || []).find((t) => t.id === id) || null; }

  async saveSettings(patch) {
    Object.assign(this.settings, patch);
    if (patch.fx) setFx(this.settings.fx);
    await this.save('config', 'settings', patch, true);
    this.emit('settings');
  }
  async setCountry(code, currency = null) {
    const l = applyLocale(code, currency);
    await this.saveSettings({ country: code, currency: l.cur, countrySetAt: new Date().toISOString() });
    this.emit('rate', 1);
  }
  nextSeq(b, key) {
    const n = (Number(this.counters[key]) || 0) + 1;
    this.counters = { ...this.counters, [key]: n };
    b.set(this.ref('config', 'counters'), { [key]: n }, { merge: true });
    return n;
  }

  // ---------- PIN ----------
  hasPin() { return !!this.security.pinHash; }
  async verifyPin(pin) {
    if (!this.security.pinHash) { const s = await getDoc(this.ref('config', 'security')).catch(() => null); if (s?.exists()) this.security = s.data(); }
    if (!this.security.pinHash) return true;
    return (await sha256(`${this.tenantId}:${pin}`)) === this.security.pinHash;
  }
  async setPin(pin) {
    const pinHash = await sha256(`${this.tenantId}:${pin}`);
    this.security = { ...this.security, pinHash, updatedAt: new Date().toISOString() };
    await this.save('config', 'security', this.security, true);
  }

  // ---------- Pacientes ----------
  patient(id) { if (!this._pMap) this._pMap = new Map(this.patients.map((p) => [p.id, p])); return this._pMap.get(id) || null; }
  get activePatients() { return this.patients.filter((p) => p.active !== false); }
  findPatient(text) {
    const raw = String(text || '').trim();
    const v = raw.toLowerCase().replace(/\s+/g, '');
    if (!v) return null;
    const url = /\/paciente\/([a-z0-9]+)/i.exec(raw);
    if (url) return this.patients.find((p) => (p.portalCode || '').toLowerCase() === url[1].toLowerCase()) || null;
    return this.patients.find((p) => (p.code || '').toLowerCase() === v) || this.patients.find((p) => String(p.idDoc || '').toLowerCase().replace(/\W/g, '') === v.replace(/\W/g, '')) || null;
  }
  examsOf(patientId) { return this.exams.filter((e) => e.patientId === patientId && e.status !== 'anulada'); }
  lastExam(patientId) { return this.examsOf(patientId)[0] || null; }
  exam(id) { return this.exams.find((e) => e.id === id) || null; }
  ordersOf(patientId) { return this.orders.filter((o) => o.patientId === patientId); }
  balanceOf(patientId) {
    if (!this._balMap) {
      this._balMap = new Map();
      for (const o of this.orders) if (o.status !== 'anulada') this._balMap.set(o.patientId, round2((this._balMap.get(o.patientId) || 0) + Math.max(0, orderBalance(o))));
    }
    return this._balMap.get(patientId) || 0;
  }
  get debtors() { return this.patients.filter((p) => this.balanceOf(p.id) > 0.009).sort((a, b) => this.balanceOf(b.id) - this.balanceOf(a.id)); }
  get totalDebt() { return round2(this.debtors.reduce((a, p) => a + this.balanceOf(p.id), 0)); }
  /** Pacientes con control vencido o por vencer en `days` días */
  controlsDue(days = 30) {
    const lim = dayKey(addDays(new Date(), days));
    return this.activePatients.filter((p) => p.nextControl && p.nextControl <= lim).sort((a, b) => a.nextControl.localeCompare(b.nextControl));
  }

  // ---------- Órdenes ----------
  order(id) { if (!this._oMap) this._oMap = new Map(this.orders.map((o) => [o.id, o])); return this._oMap.get(id) || null; }
  get workOrders() { return this.orders.filter((o) => o.kind !== 'venta'); }
  get activeOrders() { return this.workOrders.filter((o) => !['entregada', 'anulada'].includes(o.status)); }
  ordersIn(status) { return this.workOrders.filter((o) => o.status === status); }
  get readyOrders() { return this.ordersIn('lista'); }
  get openBalanceOrders() { return this.orders.filter((o) => o.status !== 'anulada' && orderBalance(o) > 0.009); }
  isOpen(o) { return isOpenOrder(o); }

  // ---------- Inventario y laboratorios ----------
  product(id) { if (!this._prMap) this._prMap = new Map(this.products.map((p) => [p.id, p])); return this._prMap.get(id) || null; }
  get liveProducts() { return this.products.filter((p) => p.active !== false); }
  get lowStock() { return this.liveProducts.filter((p) => p.track !== false && Number(p.stock) <= (Number(p.min) || 0)); }
  findProduct(code) { const v = String(code || '').trim().toLowerCase(); return v ? this.liveProducts.find((p) => String(p.code || '').toLowerCase() === v) || null : null; }
  lab(id) { if (!this._lMap) this._lMap = new Map(this.labs.map((l) => [l.id, l])); return this._lMap.get(id) || null; }
  get liveLabs() { return this.labs.filter((l) => l.active !== false); }

  // ---------- Citas ----------
  appointmentsOn(date) { return this.appointments.filter((a) => a.date === date && a.status !== 'cancelada'); }
  get upcoming() { const t = todayKey(); return this.appointments.filter((a) => a.date >= t && ['pendiente', 'confirmada'].includes(a.status)); }

  // ---------- Buzón ----------
  inboxOf(type, status = null) { return this.inbox.filter((x) => x.type === type && (!status || (Array.isArray(status) ? status.includes(x.status) : x.status === status))); }
  get reportedPayments() { return this.inboxOf('pago', 'nueva'); }
  get newBookings() { return this.inboxOf('cita', 'nueva'); }

  // ---------- Dinero ----------
  get confirmedPayments() { return this.payments.filter((p) => p.status === 'confirmado'); }
  collectedOn(date) { return round2(this.confirmedPayments.filter((p) => p.date === date).reduce((a, p) => a + (Number(p.amount) || 0), 0)); }
  collectedIn(period) { return round2(this.confirmedPayments.filter((p) => (p.date || '').startsWith(period)).reduce((a, p) => a + (Number(p.amount) || 0), 0)); }
  salesIn(period) { return round2(this.orders.filter((o) => o.status !== 'anulada' && (o.date || '').startsWith(period)).reduce((a, o) => a + (Number(o.total) || 0), 0)); }
  expensesIn(period) { return round2(this.expenses.filter((e) => e.period === period && e.status !== 'anulado').reduce((a, e) => a + (Number(e.amount) || 0), 0)); }
  expensesOn(date) { return round2(this.expenses.filter((e) => e.date === date && e.status !== 'anulado').reduce((a, e) => a + (Number(e.amount) || 0), 0)); }
  closing(date) { return this.closings.find((c) => c.date === date && c.status !== 'anulado') || null; }

  // ---------- Consultas ----------
  async listBetween(name, field, from, to) {
    const s = await getDocs(query(this.col(name), where(field, '>=', from), where(field, '<=', to)));
    return s.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
  async listEq(name, field, value) {
    const s = await getDocs(query(this.col(name), where(field, '==', value)));
    return s.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
  async listAll(name) { const s = await getDocs(this.col(name)); return s.docs.map((d) => ({ id: d.id, ...d.data() })); }
  async getDocById(name, id) { const s = await getDoc(this.ref(name, id)); return s.exists() ? { id: s.id, ...s.data() } : null; }
  async patientOrders(id) { return (await this.listEq('orders', 'patientId', id)).sort((a, b) => (b.date || '').localeCompare(a.date || '')); }
  async patientPayments(id) { return (await this.listEq('payments', 'patientId', id)).sort((a, b) => (b.date || '').localeCompare(a.date || '')); }
}

export const store = new Store();

// ---------- Administración de sedes (solo administrador general) ----------
export async function listTenants() {
  const s = await getDocs(collection(db, 'tenants'));
  return s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.code || a.name || '').localeCompare(b.code || b.name || '', 'es', { numeric: true }));
}
export async function updateTenant(id, data) { await setDoc(doc(db, 'tenants', id), data, { merge: true }); }
/** Cobros confirmados de una sede desde una fecha (para el panel del administrador) */
export async function tenantSalesSince(tenantId, fromISO) {
  const s = await getDocs(query(collection(db, 'tenants', tenantId, 'payments'), where('date', '>=', String(fromISO).slice(0, 10))));
  return s.docs.map((d) => d.data()).map((p) => ({ ...p, received: p.status === 'confirmado' ? Number(p.amount) || 0 : 0, status: p.status === 'confirmado' ? 'ok' : 'voided' }));
}
export async function getTenant(id) { const s = await getDoc(doc(db, 'tenants', id)); return s.exists() ? { id: s.id, ...s.data() } : null; }
export async function createTenantDoc(id, data) { await setDoc(doc(db, 'tenants', id), data); }
export async function getUsername(username) { const s = await getDoc(doc(db, 'usernames', String(username).toLowerCase())); return s.exists() ? s.data() : null; }
export async function setUsername(username, data) { await setDoc(doc(db, 'usernames', String(username).toLowerCase()), data); }
export async function deleteUsername(username) { await deleteDoc(doc(db, 'usernames', String(username).toLowerCase())); }
export async function setAnnouncement(data) { await setDoc(doc(db, 'system', 'announcement'), data); }
export async function getAnnouncement() { const s = await getDoc(doc(db, 'system', 'announcement')); return s.exists() ? s.data() : null; }
/** Páginas públicas: portal del paciente, verificación de fórmula y agenda en línea */
export async function getPortal(code) { const s = await getDoc(doc(db, 'portals', String(code).toUpperCase())); return s.exists() ? s.data() : null; }
export async function getRx(code) { const s = await getDoc(doc(db, 'rx', String(code).toUpperCase())); return s.exists() ? s.data() : null; }
export async function getBooking(code) { const s = await getDoc(doc(db, 'bookings', String(code).toUpperCase())); return s.exists() ? s.data() : null; }
export { DEFAULT_SETTINGS };
