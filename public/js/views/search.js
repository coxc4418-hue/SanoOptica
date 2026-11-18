// SanoÓptica — Búsqueda global (Ctrl K): pacientes, órdenes, fórmulas y productos
import { store } from '../store.js';
import { esc, usd, openModal, normalize, fmtDate } from '../utils.js';
import { icon } from '../icons.js';
import { ORDER_STATUS, badge, productLabel, PRODUCT_CATS, orderBalance } from '../optica.js';
import { patientAvatar, patientSub, openPatient } from '../patient.js';
import { openOrder } from '../order.js';

const ACTIONS = [
  ['Nuevo examen visual', 'eyeTest', () => import('../rx.js').then((m) => m.examForm())],
  ['Nueva orden de lentes', 'glasses', () => import('../order.js').then((m) => m.orderForm())],
  ['Registrar un pago', 'wallet', () => import('../patient.js').then((m) => m.paymentModal())],
  ['Nueva cita', 'calendar', () => import('./agenda.js').then((m) => m.appointmentForm())],
  ['Nuevo paciente', 'userPlus', () => import('../patient.js').then(async (m) => { const p = await m.patientForm(); if (p) m.openPatient(p.id); })],
  ['Venta de mostrador', 'cart', () => { location.hash = '#/venta'; }],
  ['Caja del día', 'cash', () => { location.hash = '#/caja'; }]
];

export function openSearch() {
  const m = openModal({ size: 'md', body: `<div class="stack"><label class="search search-lg">${icon('search')}<input data-q placeholder="Paciente, cédula, orden (OT-…), fórmula (F-…) o código de montura" autofocus autocomplete="off"></label><div data-r class="search-results"></div></div>` });
  const box = m.el.querySelector('[data-r]');
  let items = []; let sel = 0;
  const go = (i) => { const it = items[i]; if (!it) return; m.close(); it.run(); };
  const draw = (q) => {
    const t = normalize(q).replace(/\s+/g, '');
    items = [];
    if (!t) {
      ACTIONS.forEach(([l, ic, run]) => items.push({ group: 'Acciones rápidas', html: `<span class="kpi-icon tone-brand" style="width:34px;height:34px">${icon(ic)}</span><b class="grow">${esc(l)}</b>`, run }));
      store.activeOrders.slice(0, 4).forEach((o) => items.push({ group: 'Órdenes en curso', html: `<span class="kpi-icon tone-${ORDER_STATUS[o.status].tone}" style="width:34px;height:34px">${icon(ORDER_STATUS[o.status].icon)}</span><div class="grow" style="min-width:0"><b>${esc(o.number)} · ${esc(o.patientName)}</b><div class="t-sub">${badge(ORDER_STATUS, o.status)}</div></div>`, run: () => openOrder(o.id) }));
    } else {
      const has = (s) => normalize(s).replace(/\s+/g, '').includes(t);
      store.patients.filter((p) => has(`${p.name}${p.code}${p.idDoc}${p.phone}${p.guardianName || ''}`)).slice(0, 7).forEach((p) => items.push({ group: 'Pacientes', html: `${patientAvatar(p, 'sm')}<div class="grow" style="min-width:0"><b class="ellipsis">${esc(p.name)}</b><div class="t-sub ellipsis">${esc(patientSub(p))}</div></div>${store.balanceOf(p.id) > 0.009 ? `<b class="num text-danger">${usd(store.balanceOf(p.id))}</b>` : ''}`, run: () => openPatient(p.id) }));
      store.orders.filter((o) => has(`${o.number}${o.patientName}${o.labRef || ''}`)).slice(0, 6).forEach((o) => items.push({ group: 'Órdenes y ventas', html: `<span class="kpi-icon tone-${ORDER_STATUS[o.status]?.tone || 'brand'}" style="width:34px;height:34px">${icon(o.kind === 'venta' ? 'cart' : 'glasses')}</span><div class="grow" style="min-width:0"><b>${esc(o.number)} · ${esc(o.patientName)}</b><div class="t-sub">${fmtDate(o.date)} · ${badge(ORDER_STATUS, o.status)}</div></div><b class="num ${orderBalance(o) > 0.009 && o.status !== 'anulada' ? 'text-danger' : ''}">${usd(o.total)}</b>`, run: () => openOrder(o.id) }));
      store.exams.filter((e) => has(`${e.number}${e.verify || ''}`)).slice(0, 4).forEach((e) => items.push({ group: 'Fórmulas', html: `<span class="kpi-icon tone-info" style="width:34px;height:34px">${icon('eyeTest')}</span><div class="grow"><b>${esc(e.number)} · ${esc(e.patientName)}</b><div class="t-sub">${fmtDate(e.date)}</div></div>`, run: () => openPatient(e.patientId, { tab: 'formulas' }) }));
      store.liveProducts.filter((p) => has(`${p.code}${p.brand}${p.model}${p.name}${p.color}`)).slice(0, 5).forEach((p) => items.push({ group: 'Inventario', html: `<span class="kpi-icon tone-violet" style="width:34px;height:34px">${icon(PRODUCT_CATS[p.cat]?.icon || 'tag')}</span><div class="grow" style="min-width:0"><b class="ellipsis">${esc(productLabel(p))}</b><div class="t-sub">${esc(p.code || '')} · ${p.track === false ? 'servicio' : p.stock + ' en stock'}</div></div><b class="num">${usd(p.price)}</b>`, run: () => import('./inventory.js').then((mm) => mm.productForm(p)) }));
    }
    sel = 0;
    let last = '';
    box.innerHTML = items.length ? items.map((it, i) => { const h = it.group !== last ? `<div class="section-title" style="margin:${i ? '12px' : '0'} 0 4px">${esc(it.group)}</div>` : ''; last = it.group; return `${h}<button class="list-item linkish search-item ${i === sel ? 'on' : ''}" data-i="${i}" style="width:100%;text-align:left">${it.html}</button>`; }).join('')
      : `<div class="t-sub center pd-3">Sin resultados para «${esc(q)}».</div>`;
    box.querySelectorAll('[data-i]').forEach((b) => b.onclick = () => go(Number(b.dataset.i)));
  };
  const input = m.el.querySelector('[data-q]');
  input.oninput = () => draw(input.value);
  input.onkeydown = (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % Math.max(1, items.length); box.querySelectorAll('[data-i]').forEach((b) => b.classList.toggle('on', Number(b.dataset.i) === sel)); box.querySelector('.search-item.on')?.scrollIntoView({ block: 'nearest' }); }
    if (e.key === 'Enter') { e.preventDefault(); go(sel); }
  };
  draw('');
  setTimeout(() => input.focus(), 30);
}
