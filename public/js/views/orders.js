// SanoÓptica — Órdenes de trabajo: tablero por estado (laboratorio → control → lista → entrega) y listado
import { store } from '../store.js';
import { esc, usd, emptyState, fmtDate, normalize, todayKey, toCSV, download, toast } from '../utils.js';
import { icon } from '../icons.js';
import { ORDER_STATUS, badge, orderBalance, orderLate, waitingDays, kindLabel, itemsText } from '../optica.js';
import { orderForm, openOrder, advanceOrder } from '../order.js';
import { waPatient, printLabOrder } from '../shared.js';

const COLS = ['registrada', 'laboratorio', 'recibida', 'lista'];

export function mount(el, { params = {} }) {
  let view = ['entregada', 'todas', 'atrasadas', 'anulada', 'garantia', 'ventas'].includes(params.tab) ? 'lista' : 'tablero';
  let filter = params.tab && view === 'lista' ? params.tab : 'todas';
  let focus = COLS.includes(params.tab) ? params.tab : '';
  let q = ''; let limit = 60;
  el.innerHTML = `
    <div class="view-header"><div><h1 class="view-title">Órdenes de trabajo</h1><p class="view-sub">Sigue cada par de lentes: registrada → laboratorio → control de calidad → lista → entregada.</p></div>
      <div class="view-actions"><button class="btn btn-primary" id="o-new">${icon('plus')} Nueva orden <kbd class="hide-sm">F3</kbd></button><button class="btn btn-ghost" id="o-csv">${icon('download')} Exportar</button></div></div>
    <div class="toolbar"><div class="seg" id="o-view">${[['tablero', 'Tablero'], ['lista', 'Lista']].map(([k, l]) => `<button data-v="${k}" class="${view === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <label class="search grow">${icon('search')}<input id="o-q" placeholder="Número, paciente o laboratorio…" autocomplete="off"></label></div>
    <div id="o-chips" class="mt-sm"></div>
    <div id="o-body" class="mt"></div>`;
  const $ = (s) => el.querySelector(s);
  $('#o-new').onclick = () => orderForm();
  $('#o-q').oninput = (e) => { q = e.target.value; draw(); };
  el.querySelectorAll('[data-v]').forEach((b) => b.onclick = () => { view = b.dataset.v; el.querySelectorAll('[data-v]').forEach((x) => x.classList.toggle('on', x === b)); draw(); });
  $('#o-csv').onclick = () => {
    const rows = store.orders.map((o) => ({ Numero: o.number, Tipo: kindLabel(o), Fecha: o.date, Paciente: o.patientName, Estado: ORDER_STATUS[o.status]?.label || o.status, Laboratorio: o.labName || '', Prometida: o.promised || '', Detalle: itemsText(o), Total: o.total, Pagado: o.paid || 0, Saldo: Math.max(0, orderBalance(o)) }));
    download(`ordenes-${todayKey()}.csv`, toCSV(rows)); toast(`${rows.length} órdenes exportadas`);
  };
  const match = (o) => { const t = normalize(q); return !t || normalize(`${o.number} ${o.patientName} ${o.patientCode} ${o.labName || ''} ${o.labRef || ''}`).includes(t); };
  const card = (o) => {
    const late = orderLate(o); const wait = waitingDays(o); const bal = orderBalance(o);
    return `<div class="k-card ${late ? 'is-late' : ''}" data-o="${o.id}">
      <div class="between"><b>${esc(o.number)}</b>${o.status === 'garantia' ? '<span class="badge badge-warning">Garantía</span>' : ''}${bal > 0.009 ? `<span class="badge badge-danger">${usd(bal)}</span>` : '<span class="badge badge-success">Pagada</span>'}</div>
      <div class="ellipsis"><b>${esc(o.patientName)}</b></div>
      <div class="t-sub ellipsis">${esc(itemsText(o).slice(0, 70) || '—')}</div>
      <div class="t-sub">${o.labName ? `${icon('lab')} ${esc(o.labName)}` : ''}${o.promised ? ` <span class="${late ? 'text-danger' : ''}">· ${late ? `atrasada ${late} d` : fmtDate(o.promised)}</span>` : ''}${wait ? ` · <span class="${wait > 7 ? 'text-warning' : ''}">esperando ${wait} d</span>` : ''}</div>
      <div class="k-actions"><button class="btn btn-secondary btn-sm grow" data-adv="${o.id}">${icon('arrowRight')} ${esc({ registrada: 'Al laboratorio', laboratorio: 'Recibir', garantia: 'Recibir', recibida: 'Control OK', lista: 'Entregar' }[o.status] || 'Avanzar')}</button>
        ${o.status === 'lista' ? `<button class="btn btn-whatsapp btn-sm btn-icon" data-wa="${o.id}" title="Avisar">${icon('whatsapp')}</button>` : ''}${o.status === 'registrada' ? `<button class="btn btn-ghost btn-sm btn-icon" data-lp="${o.id}" title="Imprimir orden de laboratorio">${icon('print')}</button>` : ''}</div></div>`;
  };
  function chips() {
    if (view === 'tablero') { $('#o-chips').innerHTML = ''; return; }
    const late = store.activeOrders.filter((o) => orderLate(o) > 0).length;
    $('#o-chips').innerHTML = `<div class="chips">${[['todas', 'Todas'], ['abiertas', 'En curso'], ['atrasadas', `Atrasadas${late ? ` (${late})` : ''}`], ['saldo', 'Con saldo'], ['entregada', 'Entregadas'], ['garantia', 'Garantía'], ['ventas', 'Ventas de mostrador'], ['anulada', 'Anuladas']].map(([k, l]) => `<button class="chip ${filter === k ? 'on' : ''}" data-f="${k}">${l}</button>`).join('')}</div>`;
    el.querySelectorAll('[data-f]').forEach((b) => b.onclick = () => { filter = b.dataset.f; limit = 60; draw(); });
  }
  function tablero() {
    const cols = COLS.map((s) => ({ s, list: store.workOrders.filter((o) => (o.status === s || (s === 'laboratorio' && o.status === 'garantia')) && match(o)).sort((a, b) => (a.promised || '9').localeCompare(b.promised || '9')) }));
    $('#o-body').innerHTML = store.activeOrders.length || q ? `<div class="kboard">${cols.map(({ s, list }) => `<div class="kcol ${focus === s ? 'is-focus' : ''}"><div class="kcol-head"><span class="kpi-icon tone-${ORDER_STATUS[s].tone}" style="width:30px;height:30px">${icon(ORDER_STATUS[s].icon)}</span><b>${esc(ORDER_STATUS[s].label)}</b><span class="tab-n">${list.length}</span></div><div class="t-sub kcol-hint">${esc(ORDER_STATUS[s].hint || '')}</div><div class="kcol-list">${list.map(card).join('') || '<div class="t-sub center pd-3">Vacío</div>'}</div></div>`).join('')}</div>`
      : `<div class="card">${emptyState('glasses', 'Sin órdenes en curso', 'Crea una orden desde un examen visual o con el botón Nueva orden.')}</div>`;
    bind();
    if (focus) setTimeout(() => el.querySelector('.kcol.is-focus')?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' }), 50);
  }
  function lista() {
    let rows = store.orders.filter(match);
    if (filter === 'abiertas') rows = rows.filter((o) => o.kind !== 'venta' && !['entregada', 'anulada'].includes(o.status));
    if (filter === 'atrasadas') rows = rows.filter((o) => orderLate(o) > 0);
    if (filter === 'saldo') rows = rows.filter((o) => o.status !== 'anulada' && orderBalance(o) > 0.009);
    if (filter === 'entregada') rows = rows.filter((o) => o.status === 'entregada' && o.kind !== 'venta');
    if (filter === 'garantia') rows = rows.filter((o) => o.status === 'garantia' || o.warrantyCount);
    if (filter === 'ventas') rows = rows.filter((o) => o.kind === 'venta');
    if (filter === 'anulada') rows = rows.filter((o) => o.status === 'anulada');
    rows.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.number || '').localeCompare(a.number || ''));
    const total = rows.length; const sum = rows.filter((o) => o.status !== 'anulada').reduce((a, o) => a + (Number(o.total) || 0), 0);
    rows = rows.slice(0, limit);
    $('#o-body').innerHTML = rows.length ? `<div class="t-sub mb">${total} orden(es) · ${usd(sum)}</div><div class="card card-flush"><div class="table-wrap"><table class="table"><thead><tr><th>Orden</th><th>Paciente</th><th class="hide-sm">Detalle</th><th>Estado</th><th class="hide-sm">Entrega</th><th class="r">Total</th><th class="r">Saldo</th></tr></thead><tbody>
      ${rows.map((o) => { const bal = orderBalance(o); const late = orderLate(o); return `<tr class="tr-link ${o.status === 'anulada' ? 'is-void' : ''}" data-o="${o.id}"><td><b>${esc(o.number)}</b><div class="t-sub">${fmtDate(o.date)}</div></td><td>${esc(o.patientName)}</td><td class="hide-sm"><div class="ellipsis" style="max-width:260px">${esc(itemsText(o))}</div></td><td>${badge(ORDER_STATUS, o.status)}</td><td class="hide-sm ${late ? 'text-danger' : ''}">${o.kind === 'venta' ? '—' : o.promised ? fmtDate(o.promised) : '—'}${late ? `<div class="t-sub text-danger">+${late} d</div>` : ''}</td><td class="r num">${usd(o.total)}</td><td class="r num ${bal > 0.009 && o.status !== 'anulada' ? 'text-danger' : ''}">${o.status === 'anulada' ? '—' : bal > 0.009 ? usd(bal) : '✓'}</td></tr>`; }).join('')}
      </tbody></table></div></div>${total > limit ? `<div class="center mt"><button class="btn btn-secondary" id="o-more">Ver más (${total - limit})</button></div>` : ''}`
      : `<div class="card">${emptyState('glasses', 'Sin órdenes', q ? 'Ninguna orden coincide con la búsqueda.' : 'No hay órdenes en este filtro.')}</div>`;
    $('#o-more')?.addEventListener('click', () => { limit += 60; lista(); });
    bind();
  }
  function bind() {
    el.querySelectorAll('#o-body [data-o]').forEach((c) => c.onclick = (e) => { if (e.target.closest('button')) return; openOrder(c.dataset.o); });
    el.querySelectorAll('#o-body [data-adv]').forEach((b) => b.onclick = () => advanceOrder(store.order(b.dataset.adv)));
    el.querySelectorAll('#o-body [data-wa]').forEach((b) => b.onclick = () => waPatient('lista', { order: store.order(b.dataset.wa) }));
    el.querySelectorAll('#o-body [data-lp]').forEach((b) => b.onclick = () => printLabOrder(store.order(b.dataset.lp)));
  }
  function draw() { chips(); view === 'tablero' ? tablero() : lista(); }
  draw();
  const off = store.on('*', (evt) => { if (['orders', 'payments', 'labs'].includes(evt)) draw(); });
  return off;
}
