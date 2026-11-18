// SanoÓptica — Pacientes: selector, formulario, ficha, cobro de abonos y portal
import { store } from './store.js';
import { esc, usd, bs, num, fmtDate, toast, openModal, setBusy, parseNum, normalize, round2, todayKey, PAY_METHODS, methodLabel, loc, fx, emptyState, confirmDialog, promptDialog, compressImage, initials, colorFor } from './utils.js';
import { icon } from './icons.js';
import { ORDER_STATUS, PAY_STATUS, badge, ageOf, isMinor, contactPhone, orderBalance, itemsText, eyeText, rxText, CONDITIONS, daysTo, kindLabel, orderPaidPct, DIAGNOSES } from './optica.js';
import { savePatient, registerPayment, setPatientActive, renewPortalCode, voidPayment } from './ops.js';
import { waPatient, PORTAL_URL, qrDataURL, printStatement, printPayment, printRx } from './shared.js';
import { isVE } from './bcv.js';

export function patientAvatar(p, size = '') {
  const t = store.balanceOf(p?.id) > 0.009 ? 'danger' : p?.nextControl && p.nextControl < todayKey() ? 'warning' : 'success';
  return p?.photo
    ? `<span class="s-av ${size} ring-${t}"><img src="${p.photo}" alt=""></span>`
    : `<span class="s-av ${size} ring-${t}" style="background:${colorFor(p?.name || '?')}">${esc(initials(p?.name || '?'))}</span>`;
}
export const patientSub = (p) => [p.code, ageOf(p.birthDate) != null ? `${ageOf(p.birthDate)} años` : '', p.phone || p.guardianPhone || ''].filter(Boolean).join(' · ');
export const balanceBadge = (p) => { const b = store.balanceOf(p.id); return b > 0.009 ? `<span class="badge badge-danger"><i class="dotc"></i>Debe ${usd(b)}</span>` : '<span class="badge badge-success"><i class="dotc"></i>Al día</span>'; };
export const controlBadge = (p) => {
  if (!p.nextControl) return '<span class="badge badge-neutral">Sin examen</span>';
  const d = daysTo(p.nextControl);
  return d < 0 ? `<span class="badge badge-warning">${icon('eye')} Control vencido</span>` : d <= 30 ? `<span class="badge badge-info">${icon('eye')} Control en ${d} d</span>` : `<span class="badge badge-neutral">${icon('eye')} Control ${fmtDate(p.nextControl)}</span>`;
};

/** Elegir un paciente (busca por nombre, historia, cédula o teléfono) */
export function pickPatient({ title = 'Elegir paciente', filter = null, allowNew = true } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const m = openModal({
      title, size: 'md',
      body: `<div class="stack"><div class="row" style="gap:8px"><label class="search grow"><svg></svg><input data-q placeholder="Nombre, cédula, teléfono o N° de historia…" autofocus autocomplete="off"></label>${allowNew ? `<button class="btn btn-primary" data-new type="button">${icon('userPlus')}<span class="hide-xs"> Nuevo</span></button>` : ''}</div><div class="list pick-list" data-l style="max-height:52vh;overflow:auto"></div></div>`,
      onClose: () => { if (!done) resolve(null); }
    });
    m.el.querySelector('.search svg').outerHTML = icon('search');
    const draw = (q = '') => {
      const t = normalize(q).replace(/\s+/g, '');
      const list = store.patients.filter((p) => (p.active !== false || store.balanceOf(p.id) > 0.009) && (!filter || filter(p)) && (!t || normalize(`${p.name}${p.code}${p.idDoc}${p.phone}${p.guardianName || ''}`).replace(/\s+/g, '').includes(t))).slice(0, 80);
      m.el.querySelector('[data-l]').innerHTML = list.length ? list.map((p) => `<button type="button" class="list-item linkish" data-p="${p.id}" style="width:100%;text-align:left">${patientAvatar(p)}<div class="grow" style="min-width:0"><b>${esc(p.name)}</b><div class="t-sub ellipsis">${esc(patientSub(p))}</div></div><div class="r">${store.balanceOf(p.id) > 0.009 ? `<b class="num text-danger">${usd(store.balanceOf(p.id))}</b>` : ''}<div class="t-sub">${p.lastExamAt ? 'Examen ' + fmtDate(p.lastExamAt) : 'Sin examen'}</div></div></button>`).join('')
        : emptyState('search', 'Sin resultados', allowNew ? 'Crea el paciente con el botón Nuevo.' : 'Prueba con otro nombre o número.');
      m.el.querySelectorAll('[data-p]').forEach((b) => b.onclick = () => { done = true; m.close(); resolve(store.patient(b.dataset.p)); });
    };
    m.el.querySelector('[data-q]').oninput = (e) => draw(e.target.value);
    m.el.querySelector('[data-new]')?.addEventListener('click', async () => {
      const q = m.el.querySelector('[data-q]').value.trim();
      done = true; m.close();
      const p = await patientForm(null, /\d{5,}/.test(q) ? { idDoc: q } : { name: q });
      resolve(p);
    });
    draw();
  });
}

// ======================================================================
// FORMULARIO DEL PACIENTE
// ======================================================================
export function patientForm(patient = null, preset = {}) {
  return new Promise((resolve) => {
    const p = { ...preset, ...(patient || {}) };
    let photo = p.photo || '';
    let done = false;
    const conds = new Set(p.conditions || []);
    const m = openModal({
      title: patient ? 'Editar paciente' : 'Nuevo paciente', size: 'lg',
      body: `<form class="stack" data-f autocomplete="off">
        <div class="row" style="gap:14px;align-items:flex-start">
          <label class="photo-pick" title="Foto (opcional)"><input type="file" accept="image/*" hidden data-photo><span data-ph>${photo ? `<img src="${photo}" alt="">` : icon('camera')}</span></label>
          <div class="form-grid grow">
            <div class="field full"><label>Nombre y apellido *</label><input class="input" name="name" value="${esc(p.name || '')}" autofocus maxlength="90"></div>
            <div class="field"><label>${esc(loc().id)}</label><input class="input" name="idDoc" value="${esc(p.idDoc || '')}" maxlength="20" placeholder="${loc().code === 'VE' ? 'V-12345678' : ''}"></div>
            <div class="field"><label>Fecha de nacimiento</label><input class="input" type="date" name="birthDate" value="${esc(p.birthDate || '')}" max="${todayKey()}"></div>
          </div>
        </div>
        <div class="form-grid">
          <div class="field"><label>Teléfono / WhatsApp</label><input class="input" name="phone" inputmode="tel" value="${esc(p.phone || '')}" placeholder="0414-1234567"></div>
          <div class="field"><label>Correo</label><input class="input" name="email" type="email" value="${esc(p.email || '')}"></div>
          <div class="field"><label>Sexo</label><select class="input select" name="sex"><option value="">—</option>${[['F', 'Femenino'], ['M', 'Masculino']].map(([k, l]) => `<option value="${k}" ${p.sex === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
          <div class="field"><label>Ocupación</label><input class="input" name="occupation" value="${esc(p.occupation || '')}" placeholder="Ej.: Contador, estudiante, chofer"><span class="hint">Ayuda a recomendar el cristal (pantallas, manejo…).</span></div>
          <div class="field full"><label>Dirección</label><input class="input" name="address" value="${esc(p.address || '')}"></div>
          <div class="field" data-guard><label>Representante (si es menor)</label><input class="input" name="guardianName" value="${esc(p.guardianName || '')}"></div>
          <div class="field" data-guard><label>WhatsApp del representante</label><input class="input" name="guardianPhone" inputmode="tel" value="${esc(p.guardianPhone || '')}"></div>
        </div>
        <div class="field"><label>Antecedentes</label><div class="chips chips-wrap">${CONDITIONS.map((c) => `<button type="button" class="chip ${conds.has(c) ? 'on' : ''}" data-cond="${esc(c)}">${esc(c)}</button>`).join('')}</div></div>
        <div class="form-grid">
          <div class="field"><label>Alergias o medicamentos</label><input class="input" name="allergies" value="${esc(p.allergies || '')}"></div>
          <div class="field"><label>Seguro / convenio</label><input class="input" name="insurance" value="${esc(p.insurance || '')}" placeholder="Ej.: Seguros Caracas, convenio empresa"></div>
          <div class="field"><label>¿Cómo nos conoció?</label><select class="input select" name="howFound">${['', 'Recomendación', 'Instagram', 'Facebook', 'TikTok', 'Google', 'Pasaba por aquí', 'Convenio empresa', 'Jornada / operativo', 'Agenda en línea', 'Otro'].map((x) => `<option ${p.howFound === x ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
          <div class="field full"><label>Notas</label><textarea class="input textarea" name="notes" rows="2">${esc(p.notes || '')}</textarea></div>
        </div>
        <div class="error-msg" data-err></div>
      </form>`,
      footer: `<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" data-ok>${icon('check')} ${patient ? 'Guardar' : 'Crear paciente'}</button>`,
      onClose: () => { if (!done) resolve(null); }
    });
    const F = m.el.querySelector('[data-f]');
    const guard = () => { const a = ageOf(F.elements.birthDate.value); m.el.querySelectorAll('[data-guard]').forEach((x) => { x.hidden = !(a != null && a < 18) && !F.elements.guardianName.value; }); };
    F.elements.birthDate.oninput = guard; guard();
    m.el.querySelectorAll('[data-cond]').forEach((b) => b.onclick = () => { const c = b.dataset.cond; conds.has(c) ? conds.delete(c) : conds.add(c); b.classList.toggle('on'); });
    m.el.querySelector('[data-photo]').onchange = async (e) => { const f = e.target.files?.[0]; if (!f) return; try { photo = await compressImage(f, 240, 0.75); m.el.querySelector('[data-ph]').innerHTML = `<img src="${photo}" alt="">`; } catch (_) { toast('No se pudo leer la imagen', 'warning'); } };
    const go = async (ev) => {
      ev?.preventDefault();
      const E = F.elements; const err = m.el.querySelector('[data-err]'); err.textContent = '';
      const btn = m.el.querySelector('[data-ok]'); setBusy(btn, true, 'Guardando…');
      try {
        const saved = await savePatient({ name: E.name.value, idDoc: E.idDoc.value, birthDate: E.birthDate.value, phone: E.phone.value, email: E.email.value, sex: E.sex.value, occupation: E.occupation.value, address: E.address.value, guardianName: E.guardianName.value, guardianPhone: E.guardianPhone.value, allergies: E.allergies.value, insurance: E.insurance.value, howFound: E.howFound.value, notes: E.notes.value, conditions: [...conds], photo }, patient?.id || null);
        done = true; m.close(); toast(patient ? 'Paciente actualizado' : 'Paciente creado'); resolve(store.patient(saved.id) || saved);
      } catch (ex) { err.textContent = ex.message; setBusy(btn, false); }
    };
    F.onsubmit = go; m.el.querySelector('[data-ok]').onclick = go;
  });
}

// ======================================================================
// COBRO (abono o pago total de una orden)
// ======================================================================
export async function paymentModal(target = null, preset = {}) {
  let o = target && target.number ? target : null;
  if (!o) {
    const p = target && !target.number ? target : await pickPatient({ title: 'Registrar pago · ¿quién paga?', filter: (x) => store.balanceOf(x.id) > 0.009, allowNew: false });
    if (!p) return null;
    const open = store.ordersOf(p.id).filter((x) => x.status !== 'anulada' && orderBalance(x) > 0.009);
    if (!open.length) { toast(`${p.name} no tiene saldo pendiente.`, 'info'); return null; }
    o = open.length === 1 ? open[0] : await pickOrder(open, p);
    if (!o) return null;
  }
  return new Promise((resolve) => {
    o = store.order(o.id) || o;
    const bal = Math.max(0, orderBalance(o));
    const rateNow = Number(fx()?.rate) || 0;
    const allowBs = isVE() && rateNow > 0;
    let cur = preset.amountBs && allowBs ? 'bs' : 'main';
    let done = false;
    const banks = (store.settings.banks || []).filter((b) => b.active !== false);
    const m = openModal({
      title: `Cobrar · ${esc(o.patientName)}`, size: 'md',
      sub: `${esc(kindLabel(o))} <b>${esc(o.number)}</b> · total ${usd(o.total)} · abonado ${usd(o.paid || 0)} · <b>resta ${usd(bal)}</b>${bs(bal) ? ` (${bs(bal)})` : ''}`,
      body: `<form class="stack" data-f>
        ${allowBs ? `<div class="seg seg-block"><button type="button" data-c="main" class="${cur === 'main' ? 'on' : ''}">Pagó en ${esc(loc().sym)}</button><button type="button" data-c="bs" class="${cur === 'bs' ? 'on' : ''}">Pagó en bolívares</button></div>` : ''}
        <div class="form-grid">
          <div class="field" data-main-f><label>Monto (${esc(loc().sym)})</label><div class="input-group"><span class="prefix">${esc(loc().sym)}</span><input class="input input-lg" name="amount" inputmode="decimal" value="${preset.amount ? num(preset.amount) : ''}" placeholder="0" autofocus></div></div>
          ${allowBs ? `<div class="field" data-bs-f><label>Monto en Bs</label><div class="input-group"><span class="prefix">Bs</span><input class="input input-lg" name="amountBs" inputmode="decimal" value="${preset.amountBs ? num(preset.amountBs) : ''}" placeholder="0"></div></div>
          <div class="field" data-bs-f><label>Tasa (Bs por 1 $)</label><input class="input" name="rate" inputmode="decimal" value="${num(preset.rate || rateNow, 2)}"><span class="hint">Tasa BCV del día del pago.</span></div>` : ''}
          <div class="field"><label>Fecha</label><input class="input" type="date" name="date" value="${preset.date || todayKey()}" max="${todayKey()}"></div>
          <div class="field"><label>Forma de pago</label><select class="input select" name="method">${Object.entries(PAY_METHODS).map(([k, x]) => `<option value="${k}" ${(preset.method || 'efectivo') === k ? 'selected' : ''}>${x.label}</option>`).join('')}</select></div>
          <div class="field"><label>Banco / cuenta</label>${banks.length ? `<select class="input select" name="bank"><option value="">—</option>${banks.map((b) => `<option ${preset.bank === b.bank ? 'selected' : ''}>${esc(b.bank || b.type)}</option>`).join('')}</select>` : `<input class="input" name="bank" value="${esc(preset.bank || '')}">`}</div>
          <div class="field"><label>Referencia</label><input class="input" name="reference" value="${esc(preset.reference || '')}" placeholder="Últimos dígitos"></div>
          <div class="field full"><label>Nota</label><input class="input" name="note" value="${esc(preset.note || '')}"></div>
        </div>
        <div class="pay-status due" data-st></div>
        <div class="error-msg" data-err></div>
      </form>`,
      footer: `<button class="btn btn-ghost" data-all>Paga todo ${usd(bal)}</button><button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-success" data-ok>${icon('check')} Registrar pago</button>`,
      onClose: () => { if (!done) resolve(null); }
    });
    const F = m.el.querySelector('[data-f]').elements;
    const $ = (q) => m.el.querySelector(q);
    if (!F.method.value && F.method.options.length) F.method.selectedIndex = 0;
    const amount = () => cur === 'bs' ? round2(parseNum(F.amountBs.value) / Math.max(0.0001, parseNum(F.rate.value))) : round2(parseNum(F.amount.value));
    const paint = () => {
      m.el.querySelectorAll('[data-bs-f]').forEach((x) => { x.hidden = cur !== 'bs'; });
      $('[data-main-f]').hidden = cur === 'bs';
      const a = amount(); const st = $('[data-st]');
      if (!(a > 0)) { st.className = 'pay-status due'; st.innerHTML = '<span>Escribe el monto</span><span></span>'; return; }
      const rest = round2(bal - a);
      st.className = 'pay-status ' + (rest <= 0.009 ? 'ok' : 'due');
      st.innerHTML = rest < -0.009 ? `<span>${icon('alert')} Supera el saldo de la orden</span><span class="num">${usd(-rest)}</span>` : `<span>${cur === 'bs' ? `Equivale a <b>${usd(a)}</b> · ` : ''}${rest > 0.009 ? 'Queda debiendo' : `${icon('check')} Orden pagada`}</span><span class="num">${rest > 0.009 ? usd(rest) : ''}</span>`;
    };
    m.el.querySelectorAll('[data-c]').forEach((b) => b.onclick = () => { cur = b.dataset.c; m.el.querySelectorAll('[data-c]').forEach((x) => x.classList.toggle('on', x === b)); if (cur === 'bs' && PAY_METHODS.pagomovil) F.method.value = 'pagomovil'; paint(); });
    ['amount', 'amountBs', 'rate'].forEach((n) => { if (F[n]) F[n].oninput = paint; });
    $('[data-all]').onclick = () => { if (cur === 'bs') F.amountBs.value = num(bal * parseNum(F.rate.value), 2); else F.amount.value = num(bal); paint(); };
    paint();
    $('[data-ok]').onclick = async (e) => {
      const err = $('[data-err]'); err.textContent = '';
      const a = amount();
      if (!(a > 0)) { err.textContent = 'Escribe el monto del pago.'; return; }
      const btn = e.currentTarget; setBusy(btn, true, 'Registrando…');
      try {
        const pay = await registerPayment({ orderId: o.id, amount: a, date: F.date.value, method: F.method.value, bank: F.bank.value, reference: F.reference.value, note: F.note.value, amountBs: cur === 'bs' ? parseNum(F.amountBs.value) : 0, rate: cur === 'bs' ? parseNum(F.rate.value) : rateNow, inboxId: preset.inboxId || '' });
        done = true; m.close(); resolve(pay);
        paidDone(pay);
      } catch (ex) { err.textContent = ex.message; setBusy(btn, false); }
    };
  });
}
function pickOrder(list, p) {
  return new Promise((resolve) => {
    let done = false;
    const m = openModal({
      title: `¿Qué orden paga ${esc(p.name.split(' ')[0])}?`, size: 'md',
      body: `<div class="list">${list.map((o) => `<button type="button" class="list-item linkish" data-o="${o.id}" style="width:100%;text-align:left"><span class="kpi-icon tone-brand" style="width:38px;height:38px">${icon(o.kind === 'venta' ? 'cart' : 'glasses')}</span><div class="grow" style="min-width:0"><b>${esc(o.number)}</b> ${badge(ORDER_STATUS, o.status)}<div class="t-sub ellipsis">${esc(itemsText(o))}</div></div><div class="r"><b class="num text-danger">${usd(orderBalance(o))}</b><div class="t-sub">de ${usd(o.total)}</div></div></button>`).join('')}</div>`,
      onClose: () => { if (!done) resolve(null); }
    });
    m.el.querySelectorAll('[data-o]').forEach((b) => b.onclick = () => { done = true; m.close(); resolve(store.order(b.dataset.o)); });
  });
}
export function paidDone(p) {
  const o = store.order(p.orderId);
  const m = openModal({
    size: 'sm',
    body: `<div class="center stack" style="padding:18px 0 4px;align-items:center">
      <div class="kpi-icon tone-success" style="width:64px;height:64px;border-radius:20px">${icon('check')}</div>
      <div><div class="muted small">Pago registrado · ${esc(p.patientName)}</div><div style="font-size:28px;font-weight:800">${usd(p.amount)}</div>${p.amountBs ? `<div class="muted">Bs ${num(p.amountBs, 2)}</div>` : ''}</div>
      ${o ? `<div>${orderBalance(o) > 0.009 ? `<span class="badge badge-warning">Resta ${usd(orderBalance(o))}</span>` : '<span class="badge badge-success">Orden pagada</span>'}</div>` : ''}
    </div>`,
    footer: `<button class="btn btn-secondary" data-pr>${icon('print')} Recibo</button>${o?.patientPhone || store.patient(p.patientId)?.phone ? `<button class="btn btn-whatsapp" data-wa>${icon('whatsapp')} Enviar</button>` : ''}<button class="btn btn-primary" data-close autofocus>Listo</button>`
  });
  m.el.querySelector('[data-pr]').onclick = () => printPayment(p);
  m.el.querySelector('[data-wa]')?.addEventListener('click', () => waPatient('pago', { patient: store.patient(p.patientId), order: store.order(p.orderId), payment: p }));
}

// ======================================================================
// PORTAL: QR y enlace
// ======================================================================
export async function portalModal(p) {
  const url = PORTAL_URL(p);
  const qr = await qrDataURL(url, 6);
  const m = openModal({
    title: `Portal de ${esc(p.name.split(' ')[0])}`, size: 'sm',
    sub: 'El paciente sigue el estado de sus lentes, ve su fórmula y sus pagos, pide cita y reporta pagos. Sin usuario ni contraseña: solo con este enlace.',
    body: `<div class="center stack" style="align-items:center"><img src="${qr}" alt="QR" width="220" height="220" style="image-rendering:pixelated;border-radius:12px;background:#fff;padding:6px"><code class="mono" style="font-size:20px;letter-spacing:.15em">${esc(p.portalCode)}</code><input class="input input-ro small" readonly value="${esc(url)}"></div>`,
    footer: `<button class="btn btn-ghost" data-new>${icon('refresh')} Cambiar código</button><button class="btn btn-secondary" data-copy>${icon('copy')} Copiar</button><a class="btn btn-secondary" href="${esc(url)}" target="_blank" rel="noopener">${icon('external')} Abrir</a>${contactPhone(p) ? `<button class="btn btn-whatsapp" data-wa>${icon('whatsapp')} Enviar</button>` : ''}`
  });
  m.el.querySelector('[data-copy]').onclick = async () => { try { await navigator.clipboard.writeText(url); toast('Enlace copiado'); } catch (_) { toast('No se pudo copiar', 'warning'); } };
  m.el.querySelector('[data-wa]')?.addEventListener('click', () => waPatient('portal', { patient: p }));
  m.el.querySelector('[data-new]').onclick = async () => {
    if (!(await confirmDialog({ title: 'Cambiar el código del portal', message: 'El enlace anterior dejará de funcionar.', confirmText: 'Cambiar' }))) return;
    await renewPortalCode(p); m.close(); toast('Código renovado'); portalModal(store.patient(p.id));
  };
}

// ======================================================================
// FICHA DEL PACIENTE
// ======================================================================
export async function openPatient(id, { tab = 'resumen' } = {}) {
  let p = store.patient(id);
  if (!p) { toast('Paciente no encontrado', 'warning'); return; }
  let cur = tab;
  let allOrders = null; let allPays = null;
  const m = openModal({ title: '', size: 'lg', body: '<div data-b></div>' });
  const body = m.el.querySelector('[data-b]');
  const load = async () => {
    [allOrders, allPays] = await Promise.all([store.patientOrders(id).catch(() => null), store.patientPayments(id).catch(() => null)]);
    if (document.body.contains(body)) draw();
  };
  const draw = () => {
    p = store.patient(id) || p;
    const bal = store.balanceOf(id);
    const exams = store.examsOf(id);
    const orders = allOrders ? allOrders.map((o) => store.order(o.id) || o) : store.ordersOf(id);
    const pays = allPays || store.payments.filter((x) => x.patientId === id);
    const age = ageOf(p.birthDate);
    const last = exams[0];
    body.innerHTML = `
      <div class="u-head">
        ${patientAvatar(p, 'xl')}
        <div class="grow" style="min-width:0"><div class="u-title">${esc(p.name)}</div>
          <div class="t-sub">${esc(p.code || '')}${age != null ? ` · ${age} años` : ''}${p.idDoc ? ` · ${esc(loc().id)} ${esc(p.idDoc)}` : ''}${p.phone ? ` · ${esc(p.phone)}` : ''}</div>
          <div class="mt-xs row" style="gap:6px;flex-wrap:wrap">${balanceBadge(p)} ${controlBadge(p)} ${p.active === false ? '<span class="badge badge-neutral">Inactivo</span>' : ''}</div></div>
        <div class="u-bal ${bal > 0.009 ? 'due' : 'ok'}"><small>${bal > 0.009 ? 'Debe' : 'Al día'}</small><b>${usd(bal)}</b>${bs(bal) && bal > 0.009 ? `<small>${bs(bal)}</small>` : ''}</div>
        <button type="button" class="x-btn o-close" data-close aria-label="Cerrar">${icon('x')}</button>
      </div>
      ${(p.conditions || []).length || p.allergies ? `<div class="vital-alert warning mt-sm">${icon('alert')} ${esc([...(p.conditions || []), p.allergies].filter(Boolean).join(' · '))}</div>` : ''}
      <div class="u-actions">
        <button class="btn btn-primary btn-sm" data-a="exam">${icon('eyeTest')} Examen visual</button>
        <button class="btn btn-secondary btn-sm" data-a="order">${icon('glasses')} Nueva orden</button>
        ${bal > 0.009 ? `<button class="btn btn-success btn-sm" data-a="pay">${icon('wallet')} Cobrar</button>` : ''}
        ${contactPhone(p) ? `<button class="btn btn-whatsapp btn-sm" data-a="wa">${icon('whatsapp')} ${bal > 0.009 ? 'Recordar pago' : p.nextControl && p.nextControl < todayKey() ? 'Recordar control' : 'WhatsApp'}</button>` : ''}
        <button class="btn btn-secondary btn-sm" data-a="appt">${icon('calendar')} Cita</button>
        <button class="btn btn-secondary btn-sm" data-a="portal">${icon('qr')} Portal</button>
        <button class="btn btn-ghost btn-sm" data-a="stmt">${icon('file')} Estado de cuenta</button>
        <button class="btn btn-ghost btn-sm" data-a="edit">${icon('edit')} Editar</button>
      </div>
      <div class="tabs" data-tabs>${[['resumen', 'Resumen'], ['formulas', `Fórmulas (${exams.length})`], ['ordenes', `Órdenes (${orders.length})`], ['pagos', `Pagos (${pays.length})`]].map(([k, l]) => `<button data-t="${k}" class="${cur === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div data-tab></div>`;
    body.querySelector('.o-close')?.addEventListener('click', () => m.close());
    const tb = body.querySelector('[data-tab]');
    if (cur === 'resumen') {
      const active = orders.filter((o) => !['entregada', 'anulada'].includes(o.status));
      tb.innerHTML = `
        ${last ? `<div class="section-title" style="margin-top:4px">${icon('eyeTest')} Última fórmula · ${fmtDate(last.date)}</div>${rxMini(last)}` : `<div class="box">${icon('info')} Aún no tiene examen visual. <button class="linkish text-brand" data-a="exam"><b>Hacer examen ahora</b></button></div>`}
        ${active.length ? `<div class="section-title">${icon('glasses')} Órdenes en curso</div><div class="list">${active.map(orderRow).join('')}</div>` : ''}
        <div class="kv mt">
          <div><span>Teléfono</span><b>${esc(p.phone || '—')}</b></div>
          <div><span>Correo</span><b>${esc(p.email || '—')}</b></div>
          <div><span>Nacimiento</span><b>${p.birthDate ? fmtDate(p.birthDate) : '—'}</b></div>
          <div><span>Ocupación</span><b>${esc(p.occupation || '—')}</b></div>
          ${p.guardianName ? `<div><span>Representante</span><b>${esc(p.guardianName)} · ${esc(p.guardianPhone || '')}</b></div>` : ''}
          <div><span>Seguro / convenio</span><b>${esc(p.insurance || '—')}</b></div>
          <div><span>Próximo control</span><b>${p.nextControl ? fmtDate(p.nextControl) : '—'}</b></div>
          <div><span>Paciente desde</span><b>${fmtDate(p.createdAt)}</b></div>
          <div><span>Nos conoció por</span><b>${esc(p.howFound || '—')}</b></div>
          <div><span>Código del portal</span><b class="mono">${esc(p.portalCode || '—')}</b></div>
        </div>
        ${p.notes ? `<div class="box small mt">${esc(p.notes)}</div>` : ''}
        <div class="row mt" style="justify-content:flex-end"><button class="btn btn-ghost btn-sm" data-a="toggle">${icon(p.active === false ? 'check' : 'userX')} ${p.active === false ? 'Reactivar paciente' : 'Marcar inactivo'}</button></div>`;
    }
    if (cur === 'formulas') {
      tb.innerHTML = exams.length ? `<div class="stack">${exams.map((ex, i) => `<div class="card" style="padding:14px"><div class="between" style="gap:8px;flex-wrap:wrap"><div><b>${esc(ex.number)}</b> · ${fmtDate(ex.date)} ${i === 0 ? '<span class="badge badge-success">Vigente</span>' : ''}<div class="t-sub">${esc(ex.optometrist || '')}${(ex.diagnosis || []).length ? ' · ' + esc(ex.diagnosis.map((d) => DIAGNOSES[d] || d).join(', ')) : ''}</div></div>
          <div class="row" style="gap:4px"><button class="btn btn-ghost btn-sm" data-ex-edit="${ex.id}">${icon('edit')}</button><button class="btn btn-ghost btn-sm" data-ex-print="${ex.id}">${icon('print')} Fórmula</button><button class="btn btn-secondary btn-sm" data-ex-order="${ex.id}">${icon('glasses')} Orden</button></div></div>${rxMini(ex)}</div>`).join('')}</div>
        ${exams.length > 1 ? `<div class="section-title">${icon('trend')} Evolución de la graduación</div>${evolution(exams)}` : ''}` : emptyState('eyeTest', 'Sin fórmulas', 'Registra el primer examen visual del paciente.');
    }
    if (cur === 'ordenes') {
      tb.innerHTML = orders.length ? `<div class="list">${orders.map(orderRow).join('')}</div>` : emptyState('glasses', 'Sin órdenes', 'Crea la primera orden de lentes o una venta.');
    }
    if (cur === 'pagos') {
      tb.innerHTML = pays.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Recibo</th><th>Fecha</th><th>Orden</th><th>Forma</th><th class="r">Monto</th><th></th></tr></thead><tbody>${pays.map((x) => `<tr class="${x.status === 'anulado' ? 'is-void' : ''}"><td><b>${esc(x.number)}</b></td><td>${fmtDate(x.date)}</td><td>${esc(x.orderNumber || '')}</td><td>${esc(methodLabel(x.method))}${x.reference ? `<div class="t-sub">ref. ${esc(x.reference)}</div>` : ''}</td><td class="r num">${usd(x.amount)}</td><td class="r"><button class="btn btn-ghost btn-icon btn-sm" data-pp="${x.id}" title="Recibo">${icon('print')}</button>${x.status === 'confirmado' ? `<button class="btn btn-ghost btn-icon btn-sm" data-pv="${x.id}" title="Anular">${icon('x')}</button>` : badge(PAY_STATUS, x.status)}</td></tr>`).join('')}</tbody></table></div>` : emptyState('wallet', 'Sin pagos', 'Los abonos y pagos de sus órdenes aparecen aquí.');
    }
    body.querySelectorAll('[data-t]').forEach((b) => b.onclick = () => { cur = b.dataset.t; draw(); });
    body.querySelectorAll('[data-a]').forEach((b) => b.onclick = () => act(b.dataset.a));
    body.querySelectorAll('[data-o]').forEach((b) => b.onclick = async () => { const { openOrder } = await import('./order.js'); openOrder(b.dataset.o); });
    body.querySelectorAll('[data-ex-print]').forEach((b) => b.onclick = () => printRx(store.exam(b.dataset.exPrint)));
    body.querySelectorAll('[data-ex-edit]').forEach((b) => b.onclick = async () => { const { examForm } = await import('./rx.js'); await examForm({ exam: store.exam(b.dataset.exEdit) }); draw(); });
    body.querySelectorAll('[data-ex-order]').forEach((b) => b.onclick = async () => { const { orderForm } = await import('./order.js'); m.close(); orderForm({ patient: p, exam: store.exam(b.dataset.exOrder) }); });
    body.querySelectorAll('[data-pp]').forEach((b) => b.onclick = () => printPayment(pays.find((x) => x.id === b.dataset.pp)));
    body.querySelectorAll('[data-pv]').forEach((b) => b.onclick = async () => {
      const { requirePin } = await import('./auth.js');
      if (!(await requirePin('Anular un pago'))) return;
      const reason = await promptDialog({ title: 'Anular pago', label: 'Motivo', placeholder: 'Ej.: pago duplicado, reembolso' });
      if (reason == null) return;
      await voidPayment(pays.find((x) => x.id === b.dataset.pv), reason); toast('Pago anulado'); load();
    });
  };
  const act = async (a) => {
    if (a === 'edit') { await patientForm(p); draw(); }
    if (a === 'pay') { await paymentModal(p); load(); }
    if (a === 'wa') waPatient(store.balanceOf(id) > 0.009 ? 'recordatorio' : p.nextControl && p.nextControl < todayKey() ? 'control' : 'libre', { patient: p });
    if (a === 'portal') portalModal(p);
    if (a === 'exam') { const { examForm } = await import('./rx.js'); const ex = await examForm({ patient: p }); if (ex) { cur = 'formulas'; draw(); } }
    if (a === 'order') { const { orderForm } = await import('./order.js'); m.close(); orderForm({ patient: p, exam: store.lastExam(p.id) }); }
    if (a === 'appt') { const { appointmentForm } = await import('./views/agenda.js'); appointmentForm(null, { patientId: p.id }); }
    if (a === 'stmt') { const [o, x] = await Promise.all([store.patientOrders(id).catch(() => store.ordersOf(id)), store.patientPayments(id).catch(() => [])]); printStatement(p, o, x); }
    if (a === 'toggle') { await setPatientActive(p, p.active === false); toast(p.active === false ? 'Paciente reactivado' : 'Paciente marcado como inactivo'); draw(); }
  };
  const off = store.on('*', (evt) => { if (['patients', 'orders', 'payments', 'exams'].includes(evt) && document.body.contains(body)) draw(); });
  const obs = new MutationObserver(() => { if (!document.body.contains(body)) { off(); obs.disconnect(); } });
  obs.observe(document.getElementById('modals'), { childList: true });
  draw();
  load();
}
export function orderRow(o) {
  const bal = orderBalance(o);
  return `<button type="button" class="list-item linkish ${o.status === 'anulada' ? 'is-void' : ''}" data-o="${o.id}" style="width:100%;text-align:left"><span class="kpi-icon tone-${ORDER_STATUS[o.status]?.tone || 'brand'}" style="width:38px;height:38px">${icon(o.kind === 'venta' ? 'cart' : ORDER_STATUS[o.status]?.icon || 'glasses')}</span>
    <div class="grow" style="min-width:0"><b>${esc(o.number)}</b> ${badge(ORDER_STATUS, o.status)}<div class="t-sub ellipsis">${fmtDate(o.date)} · ${esc(itemsText(o))}</div>${o.kind !== 'venta' && o.status !== 'anulada' ? `<div class="progress progress-sm mt-xs" title="Pagado ${orderPaidPct(o)}%"><span style="width:${orderPaidPct(o)}%"></span></div>` : ''}</div>
    <div class="r"><b class="num">${usd(o.total)}</b><div class="t-sub ${bal > 0.009 ? 'text-danger' : ''}">${bal > 0.009 ? 'resta ' + usd(bal) : 'pagada'}</div></div></button>`;
}
/** Tabla compacta OD/OI */
export function rxMini(ex) {
  const rx = ex?.rx || {};
  const row = (k) => { const e = rx[k] || {}; return `<tr><th>${k.toUpperCase()}</th><td>${esc(e.sph != null ? fmtD(e.sph) : '—')}</td><td>${esc(e.cyl ? fmtD(e.cyl, false) : '—')}</td><td>${e.cyl ? esc(String(e.axis ?? '')) + '°' : '—'}</td><td>${esc(e.add ? fmtD(e.add, false) : '—')}</td><td>${esc(e.av || '—')}</td></tr>`; };
  return `<div class="rx-mini"><table><thead><tr><th></th><th>Esf.</th><th>Cil.</th><th>Eje</th><th>Add</th><th>AV sc</th></tr></thead><tbody>${row('od')}${row('oi')}</tbody></table>${rx.dp ? `<div class="t-sub mt-xs">DP ${num(rx.dp, 1)} mm${ex.lensType ? ' · ' + esc(ex.lensType) : ''}</div>` : ''}</div>`;
}
const fmtD = (v, plano = true) => { const n = Number(v); if (n === 0) return plano ? 'Plano' : '0,00'; return `${n > 0 ? '+' : '−'}${num(Math.abs(n), 2)}`; };
function evolution(exams) {
  const list = exams.slice(0, 6).reverse();
  return `<div class="table-wrap"><table class="table"><thead><tr><th>Fecha</th><th>OD</th><th>OI</th></tr></thead><tbody>${list.map((ex) => `<tr><td>${fmtDate(ex.date)}</td><td class="mono small">${esc(eyeText(ex.rx?.od))}</td><td class="mono small">${esc(eyeText(ex.rx?.oi))}</td></tr>`).join('')}</tbody></table></div>`;
}
export { rxText };
