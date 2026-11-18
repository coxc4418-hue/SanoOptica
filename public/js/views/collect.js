// SanoÓptica — Cobranza: pagos reportados desde el portal, saldos pendientes e historial de pagos
import { store } from '../store.js';
import { esc, usd, bs, emptyState, toast, fmtDate, setBusy, normalize, methodLabel, promptDialog, todayKey, toCSV, download, dayKey, addDays } from '../utils.js';
import { icon } from '../icons.js';
import { orderBalance, ORDER_STATUS, badge } from '../optica.js';
import { registerPayment, rejectReport, voidPayment } from '../ops.js';
import { patientAvatar, openPatient, paymentModal } from '../patient.js';
import { openOrder } from '../order.js';
import { waPatient, printPayment } from '../shared.js';
import { requirePin } from '../auth.js';

export function mount(el, { params = {} }) {
  let tab = params.tab || (store.reportedPayments.length ? 'reportados' : 'saldos');
  let q = ''; let range = 30;
  el.innerHTML = `
    <div class="view-header"><div><h1 class="view-title">Cobranza</h1><p class="view-sub">Saldos de las órdenes, pagos que los pacientes reportan desde su portal e historial de cobros.</p></div>
      <div class="view-actions"><button class="btn btn-primary" id="c-pay">${icon('wallet')} Registrar pago <kbd class="hide-sm">F1</kbd></button></div></div>
    <div class="kpis kpis-4" id="c-kpis"></div>
    <div class="tabs mt" id="c-tabs"></div>
    <div id="c-body" class="mt"></div>`;
  const $ = (s) => el.querySelector(s);
  $('#c-pay').onclick = () => paymentModal();
  function kpis() {
    const t = todayKey();
    const weekAgo = dayKey(addDays(new Date(), -6));
    const week = store.confirmedPayments.filter((p) => p.date >= weekAgo).reduce((a, p) => a + (Number(p.amount) || 0), 0);
    const old = store.openBalanceOrders.filter((o) => o.status === 'entregada');
    $('#c-kpis').innerHTML = `
      <div class="card kpi"><div class="kpi-top"><span class="kpi-label">Por cobrar</span><span class="kpi-icon tone-danger">${icon('wallet')}</span></div><div class="kpi-value">${usd(store.totalDebt)}</div><div class="kpi-sub">${store.openBalanceOrders.length} orden(es)${bs(store.totalDebt) ? ' · ' + bs(store.totalDebt) : ''}</div></div>
      <div class="card kpi"><div class="kpi-top"><span class="kpi-label">Cobrado hoy</span><span class="kpi-icon tone-success">${icon('cash')}</span></div><div class="kpi-value">${usd(store.collectedOn(t))}</div><div class="kpi-sub">7 días: ${usd(week)}</div></div>
      <div class="card kpi"><div class="kpi-top"><span class="kpi-label">Reportados</span><span class="kpi-icon tone-info">${icon('bell')}</span></div><div class="kpi-value">${store.reportedPayments.length}</div><div class="kpi-sub">${usd(store.reportedPayments.reduce((a, x) => a + (Number(x.amount) || 0), 0))} por confirmar</div></div>
      <div class="card kpi"><div class="kpi-top"><span class="kpi-label">Entregadas con saldo</span><span class="kpi-icon tone-warning">${icon('alert')}</span></div><div class="kpi-value">${old.length}</div><div class="kpi-sub">${usd(old.reduce((a, o) => a + orderBalance(o), 0))} a crédito</div></div>`;
  }
  function tabs() {
    const n = store.reportedPayments.length;
    $('#c-tabs').innerHTML = [['reportados', `Reportados${n ? ` <span class="tab-n">${n}</span>` : ''}`], ['saldos', `Saldos (${store.debtors.length})`], ['pagos', 'Pagos recibidos']].map(([k, l]) => `<button data-t="${k}" class="${tab === k ? 'on' : ''}">${l}</button>`).join('');
    el.querySelectorAll('[data-t]').forEach((b) => b.onclick = () => { tab = b.dataset.t; draw(); });
  }
  function reportados() {
    const list = store.reportedPayments;
    const done = store.inboxOf('pago', ['procesada', 'rechazada']).slice(0, 10);
    $('#c-body').innerHTML = `${list.length ? `<div class="grid-cards">${list.map((x) => { const o = store.order(x.orderId); const bal = o ? orderBalance(o) : 0; return `<div class="card rep-card">
        <div class="between"><b class="ellipsis">${esc(x.patientName || x.patientCode)}</b><span class="badge badge-info">Nuevo</span></div>
        <div class="t-sub">${esc(x.orderNumber || '')}${o ? ` · saldo ${usd(bal)}` : ' · <span class="text-danger">orden no encontrada</span>'}</div>
        <div class="rep-amt"><b>${usd(x.amount)}</b><small>${esc(methodLabel(x.method))}${x.bank ? ' · ' + esc(x.bank) : ''}</small></div>
        <div class="t-sub">${x.reference ? `Ref. <b class="mono">${esc(x.reference)}</b> · ` : ''}${fmtDate(x.date)}${x.payer ? ' · ' + esc(x.payer) : ''}${x.amountBs ? ` · Bs ${esc(Number(x.amountBs).toLocaleString('es-VE', { minimumFractionDigits: 2 }))}` : ''}</div>
        ${x.note ? `<div class="box small">${esc(x.note)}</div>` : ''}
        ${o && Number(x.amount) > bal + 0.009 ? `<div class="hint text-warning">${icon('alert')} El monto supera el saldo; se confirmará solo ${usd(bal)}.</div>` : ''}
        <div class="row mt-sm" style="gap:6px"><button class="btn btn-success btn-sm grow" data-ok="${x.id}" ${o && bal > 0.009 ? '' : 'disabled'}>${icon('check')} Confirmar</button><button class="btn btn-ghost btn-sm" data-no="${x.id}">${icon('x')} Rechazar</button></div></div>`; }).join('')}</div>`
      : `<div class="card">${emptyState('inbox', 'Sin pagos por confirmar', 'Cuando un paciente reporte una transferencia o pago móvil desde su portal, aparecerá aquí para que lo verifiques con tu banco.')}</div>`}
      ${done.length ? `<div class="section-title mt-lg">Revisados recientemente</div><div class="card card-flush"><div class="list" style="padding:6px 10px">${done.map((x) => `<div class="list-item"><div class="grow"><b>${esc(x.patientName || '')}</b><div class="t-sub">${esc(x.orderNumber || '')} · ${usd(x.amount)} · ${esc(methodLabel(x.method))}${x.reference ? ' · ref. ' + esc(x.reference) : ''}</div></div><span class="badge badge-${x.status === 'procesada' ? 'success' : 'neutral'}">${x.status === 'procesada' ? 'Confirmado' : 'Rechazado'}</span></div>`).join('')}</div></div>` : ''}`;
    el.querySelectorAll('[data-ok]').forEach((b) => b.onclick = async () => {
      const x = store.inbox.find((i) => i.id === b.dataset.ok); const o = store.order(x.orderId);
      setBusy(b, true);
      try {
        const amount = Math.min(Number(x.amount) || 0, orderBalance(o));
        const p = await registerPayment({ orderId: o.id, amount, method: x.method, bank: x.bank, reference: x.reference, date: x.date && x.date <= todayKey() ? x.date : todayKey(), payer: x.payer, note: 'Reportado desde el portal', amountBs: x.amountBs, rate: x.rate, inboxId: x.id });
        toast(`Pago ${p.number} confirmado`);
        waPatient('pago', { order: store.order(o.id) || o, payment: p });
      } catch (e) { toast(e.message, 'warning', 6000); setBusy(b, false); }
    });
    el.querySelectorAll('[data-no]').forEach((b) => b.onclick = async () => {
      const x = store.inbox.find((i) => i.id === b.dataset.no);
      const r = await promptDialog({ title: 'Rechazar pago reportado', label: 'Motivo (el paciente lo verá en su portal)', value: 'No encontramos este pago en nuestra cuenta. Verifica la referencia o escríbenos.' });
      if (r == null) return;
      await rejectReport(x, r); toast('Reporte rechazado');
      if (store.patient(x.patientId)?.phone) waPatient('rechazo', { patient: store.patient(x.patientId), extra: r });
    });
  }
  function saldos() {
    const t = normalize(q);
    const list = store.debtors.filter((p) => !t || normalize(`${p.name} ${p.code} ${p.idDoc}`).includes(t));
    $('#c-body').innerHTML = `<label class="search mb">${icon('search')}<input id="c-q" value="${esc(q)}" placeholder="Buscar paciente…"></label>
      ${list.length ? `<div class="card card-flush"><div class="list" style="padding:6px 10px">${list.map((p) => { const os = store.ordersOf(p.id).filter((o) => o.status !== 'anulada' && orderBalance(o) > 0.009); return `<div class="list-item">${patientAvatar(p)}<div class="grow" style="min-width:0"><button class="linkish ellipsis" data-p="${p.id}"><b>${esc(p.name)}</b></button><div class="t-sub">${os.map((o) => `<button class="linkish text-brand" data-o="${o.id}">${esc(o.number)}</button> ${badge(ORDER_STATUS, o.status)}`).join(' · ')}</div></div><b class="num text-danger">${usd(store.balanceOf(p.id))}</b>
        ${p.phone ? `<button class="btn btn-whatsapp btn-icon btn-sm" data-wa="${p.id}" title="Recordar saldo">${icon('whatsapp')}</button>` : ''}<button class="btn btn-success btn-sm" data-pay="${p.id}">${icon('wallet')}<span class="hide-xs"> Cobrar</span></button></div>`; }).join('')}</div></div>`
      : `<div class="card">${emptyState('checkCircle', q ? 'Sin resultados' : '¡Todo cobrado!', q ? 'Ningún paciente con saldo coincide.' : 'Ningún paciente tiene saldo pendiente.')}</div>`}`;
    const qi = $('#c-q'); qi.oninput = () => { q = qi.value; saldos(); const n = $('#c-q'); n.focus(); n.setSelectionRange(q.length, q.length); };
    el.querySelectorAll('#c-body [data-p]').forEach((b) => b.onclick = () => openPatient(b.dataset.p, { tab: 'pagos' }));
    el.querySelectorAll('#c-body [data-o]').forEach((b) => b.onclick = () => openOrder(b.dataset.o));
    el.querySelectorAll('#c-body [data-pay]').forEach((b) => b.onclick = () => paymentModal(store.patient(b.dataset.pay)));
    el.querySelectorAll('#c-body [data-wa]').forEach((b) => b.onclick = () => { const p = store.patient(b.dataset.wa); const o = store.ordersOf(p.id).find((x) => x.status !== 'anulada' && orderBalance(x) > 0.009); waPatient('recordatorio', { patient: p, order: o }); });
  }
  function pagos() {
    const from = dayKey(addDays(new Date(), -range + 1));
    const t = normalize(q);
    const list = store.payments.filter((p) => p.date >= from && (!t || normalize(`${p.number} ${p.patientName} ${p.orderNumber} ${p.reference}`).includes(t))).sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.number || '').localeCompare(a.number || ''));
    const sum = list.filter((p) => p.status === 'confirmado').reduce((a, p) => a + (Number(p.amount) || 0), 0);
    $('#c-body').innerHTML = `<div class="toolbar mb"><label class="search grow">${icon('search')}<input id="c-q" value="${esc(q)}" placeholder="Recibo, paciente, orden o referencia…"></label><select class="input select" id="c-r" style="max-width:160px">${[[7, '7 días'], [30, '30 días'], [90, '90 días'], [365, '1 año']].map(([v, l]) => `<option value="${v}" ${range === v ? 'selected' : ''}>${l}</option>`).join('')}</select><button class="btn btn-ghost" id="c-csv">${icon('download')}</button></div>
      <div class="t-sub mb">${list.length} pago(s) · ${usd(sum)} confirmados</div>
      ${list.length ? `<div class="card card-flush"><div class="table-wrap"><table class="table"><thead><tr><th>Recibo</th><th>Paciente</th><th class="hide-sm">Orden</th><th>Forma</th><th class="r">Monto</th><th></th></tr></thead><tbody>${list.slice(0, 200).map((p) => `<tr class="${p.status === 'anulado' ? 'is-void' : ''}"><td><b>${esc(p.number)}</b><div class="t-sub">${fmtDate(p.date)}${p.source === 'portal' ? ' · portal' : ''}</div></td><td>${esc(p.patientName)}</td><td class="hide-sm"><button class="linkish text-brand" data-o="${p.orderId}">${esc(p.orderNumber || '')}</button></td><td>${esc(methodLabel(p.method))}${p.reference ? `<div class="t-sub">ref. ${esc(p.reference)}</div>` : ''}</td><td class="r num"><b>${usd(p.amount)}</b>${p.status === 'anulado' ? '<div class="t-sub text-danger">anulado</div>' : ''}</td><td class="r nowrap"><button class="btn btn-ghost btn-icon btn-sm" data-pr="${p.id}">${icon('print')}</button>${p.status === 'confirmado' ? `<button class="btn btn-ghost btn-icon btn-sm" data-v="${p.id}" title="Anular">${icon('x')}</button>` : ''}</td></tr>`).join('')}</tbody></table></div></div>`
      : `<div class="card">${emptyState('receipt', 'Sin pagos', 'No hay pagos en este período.')}</div>`}`;
    const qi = $('#c-q'); qi.oninput = () => { q = qi.value; pagos(); const n = $('#c-q'); n.focus(); n.setSelectionRange(q.length, q.length); };
    $('#c-r').onchange = (e) => { range = Number(e.target.value); pagos(); };
    $('#c-csv').onclick = () => { download(`pagos-${todayKey()}.csv`, toCSV(list.map((p) => ({ Recibo: p.number, Fecha: p.date, Paciente: p.patientName, Orden: p.orderNumber, Forma: methodLabel(p.method), Banco: p.bank || '', Referencia: p.reference || '', Monto: p.amount, MontoBs: p.amountBs || '', Estado: p.status })))); };
    el.querySelectorAll('#c-body [data-o]').forEach((b) => b.onclick = () => openOrder(b.dataset.o));
    el.querySelectorAll('#c-body [data-pr]').forEach((b) => b.onclick = () => printPayment(store.payments.find((x) => x.id === b.dataset.pr)));
    el.querySelectorAll('#c-body [data-v]').forEach((b) => b.onclick = async () => {
      if (!(await requirePin('Anular un pago'))) return;
      const r = await promptDialog({ title: 'Anular pago', label: 'Motivo', placeholder: 'Ej.: pago duplicado' });
      if (r == null) return;
      await voidPayment(store.payments.find((x) => x.id === b.dataset.v), r); toast('Pago anulado');
    });
  }
  function draw() { kpis(); tabs(); ({ reportados, saldos, pagos })[tab](); }
  draw();
  const off = store.on('*', (evt) => { if (['payments', 'orders', 'inbox', 'patients'].includes(evt)) draw(); });
  return off;
}
