// SanoÓptica — Caja del día: cobros por forma de pago, gastos, conteo y cierre
import { store } from '../store.js';
import { esc, usd, bs, num, emptyState, toast, fmtDate, fmtLongDate, todayKey, fromKey, dayKey, addDays, parseNum, setBusy, methodLabel, PAY_METHODS, round2, fmtTime } from '../utils.js';
import { icon } from '../icons.js';
import { cashSummary, closeCash } from '../ops.js';
import { printDoc, printPayment } from '../shared.js';
import { expenseForm } from './expenses.js';
import { openOrder } from '../order.js';

export function mount(el, { params = {} }) {
  let day = params.date || todayKey();
  el.innerHTML = `
    <div class="view-header"><div><h1 class="view-title">Caja del día</h1><p class="view-sub">Lo cobrado por forma de pago, los gastos pagados y el cierre con el conteo del efectivo.</p></div>
      <div class="view-actions"><input type="date" class="input" id="k-d" max="${todayKey()}" style="max-width:170px"><button class="btn btn-secondary" id="k-exp">${icon('receipt')} Gasto</button><button class="btn btn-ghost" id="k-pr">${icon('print')} Imprimir</button></div></div>
    <div id="k-body"></div>`;
  const $ = (s) => el.querySelector(s);
  $('#k-d').onchange = (e) => { if (e.target.value) { day = e.target.value; draw(); } };
  $('#k-exp').onclick = () => expenseForm();
  $('#k-pr').onclick = () => {
    const s = cashSummary(day); const c = store.closing(day);
    printDoc(`Caja del ${fmtDate(day)}`, `<table><thead><tr><th>Forma de pago</th><th class="r">N°</th><th class="r">Monto</th></tr></thead><tbody>${Object.entries(s.byMethod).map(([k, v]) => `<tr><td>${esc(methodLabel(k))}</td><td class="r">${v.n}</td><td class="r">${usd(v.amount)}${v.amountBs ? ` (Bs ${num(v.amountBs)})` : ''}</td></tr>`).join('')}<tr><td><b>Total cobrado</b></td><td class="r">${s.pays.length}</td><td class="r"><b>${usd(s.total)}</b></td></tr><tr><td>Gastos del día</td><td></td><td class="r">-${usd(s.expenses)}</td></tr></tbody></table>
      <h3>Pagos</h3><table><thead><tr><th>Recibo</th><th>Paciente</th><th>Orden</th><th>Forma</th><th class="r">Monto</th></tr></thead><tbody>${s.pays.map((p) => `<tr><td>${esc(p.number)}</td><td>${esc(p.patientName)}</td><td>${esc(p.orderNumber || '')}</td><td>${esc(methodLabel(p.method))}${p.reference ? ' ' + esc(p.reference) : ''}</td><td class="r">${usd(p.amount)}</td></tr>`).join('')}</tbody></table>
      ${c ? `<h3>Cierre</h3><p>Efectivo esperado: <b>${usd(c.expectedCash)}</b> · contado: <b>${usd(c.countedCash)}</b> · diferencia: <b>${usd(c.diff)}</b>${c.note ? `<br>Nota: ${esc(c.note)}` : ''}<br>Cerrado por ${esc(c.by || '')}</p>` : ''}`);
  };
  function draw() {
    $('#k-d').value = day;
    const s = cashSummary(day); const c = store.closing(day);
    const cashKeys = Object.keys(PAY_METHODS).filter((k) => /efectivo/.test(k));
    const expCash = round2(Object.entries(s.byMethod).filter(([k]) => /efectivo/.test(k)).reduce((a, [, v]) => a + v.amount, 0) - s.cashExp);
    const days = Array.from({ length: 7 }, (_, i) => dayKey(addDays(new Date(), -i)));
    $('#k-body').innerHTML = `
      <div class="day-tabs">${days.map((d) => `<button data-d="${d}" class="${d === day ? 'on' : ''} ${d === todayKey() ? 'is-today' : ''}">${['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'][fromKey(d).getDay()]}<small>${d.slice(8)}${store.closing(d) ? ' ✓' : ''}</small></button>`).join('')}</div>
      <div class="kpis kpis-4 mt">
        <div class="card kpi"><div class="kpi-top"><span class="kpi-label">Cobrado</span><span class="kpi-icon tone-success">${icon('cash')}</span></div><div class="kpi-value">${usd(s.total)}</div><div class="kpi-sub">${s.pays.length} pago(s)${bs(s.total) ? ' · ' + bs(s.total) : ''}</div></div>
        <div class="card kpi"><div class="kpi-top"><span class="kpi-label">Vendido</span><span class="kpi-icon tone-brand">${icon('glasses')}</span></div><div class="kpi-value">${usd(s.sales)}</div><div class="kpi-sub">${s.nOrders} orden(es) · ${s.nSales} venta(s)</div></div>
        <div class="card kpi"><div class="kpi-top"><span class="kpi-label">Gastos</span><span class="kpi-icon tone-danger">${icon('receipt')}</span></div><div class="kpi-value">${usd(s.expenses)}</div><div class="kpi-sub">${usd(s.cashExp)} en efectivo</div></div>
        <div class="card kpi"><div class="kpi-top"><span class="kpi-label">Efectivo esperado</span><span class="kpi-icon tone-warning">${icon('wallet')}</span></div><div class="kpi-value">${usd(expCash)}</div><div class="kpi-sub">cobros − gastos en efectivo</div></div></div>
      <div class="grid-2-1 mt-lg">
        <div class="card"><div class="card-head"><div class="card-title">${icon('receipt')} ${esc(fmtLongDate(fromKey(day)))}</div>${c ? `<span class="badge badge-success">${icon('lock')} Cerrada</span>` : ''}</div>
          ${Object.keys(s.byMethod).length ? `<div class="pay-methods">${Object.entries(s.byMethod).sort((a, b) => b[1].amount - a[1].amount).map(([k, v]) => `<div class="pm-row"><span>${esc(methodLabel(k))}</span><small>${v.n}</small><b class="num">${usd(v.amount)}</b>${v.amountBs ? `<small class="t-sub">Bs ${num(v.amountBs)}</small>` : ''}</div>`).join('')}</div>` : ''}
          ${s.pays.length ? `<div class="section-title">Pagos</div><div class="list">${s.pays.slice().sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')).map((p) => `<div class="list-item"><div class="grow" style="min-width:0"><b>${esc(p.patientName)}</b><div class="t-sub">${esc(p.number)} · <button class="linkish text-brand" data-o="${p.orderId}">${esc(p.orderNumber || '')}</button> · ${esc(methodLabel(p.method))}${p.reference ? ' · ' + esc(p.reference) : ''}${p.createdAt ? ' · ' + fmtTime(p.createdAt) : ''}</div></div><b class="num">${usd(p.amount)}</b><button class="btn btn-ghost btn-icon btn-sm" data-pp="${p.id}">${icon('print')}</button></div>`).join('')}</div>` : emptyState('cash', 'Sin cobros', 'No se registraron pagos este día.')}
          ${s.exps.length ? `<div class="section-title">Gastos</div><div class="list">${s.exps.map((e) => `<div class="list-item"><div class="grow"><b>${esc(e.concept)}</b><div class="t-sub">${esc(e.method ? methodLabel(e.method) : '')}</div></div><b class="num text-danger">-${usd(e.amount)}</b></div>`).join('')}</div>` : ''}</div>
        <div class="card"><div class="card-title">${icon('lock')} Cierre de caja</div>
          ${c ? `<div class="kv mt-sm"><div><span>Efectivo esperado</span><b>${usd(c.expectedCash)}</b></div><div><span>Contado</span><b>${usd(c.countedCash)}</b></div><div><span>Diferencia</span><b class="${Math.abs(c.diff) > 0.009 ? (c.diff < 0 ? 'text-danger' : 'text-warning') : 'text-success'}">${c.diff > 0 ? '+' : ''}${usd(c.diff)}</b></div><div><span>Total del día</span><b>${usd(c.total)}</b></div></div>${c.note ? `<div class="box small mt-sm">${esc(c.note)}</div>` : ''}<div class="t-sub mt-sm">Cerrada por ${esc(c.by || '')} · ${fmtDate(c.createdAt)}</div>${Math.abs(s.total - c.total) > 0.009 ? `<div class="hint text-warning mt-sm">${icon('alert')} Hubo cobros después del cierre (${usd(s.total - c.total)}). Puedes volver a cerrar.</div><button class="btn btn-secondary btn-block mt-sm" id="k-re">${icon('refresh')} Volver a cerrar</button>` : ''}`
          : `<form class="stack mt-sm" id="k-f">${cashKeys.map((k) => `<div class="field"><label>${esc(PAY_METHODS[k].label)} contado</label><input class="input input-lg" name="${k}" inputmode="decimal" placeholder="${num(Math.max(0, s.byMethod[k]?.amount || 0))}"></div>`).join('')}
            <div id="k-diff"></div><div class="field"><label>Nota</label><input class="input" name="note" placeholder="Ej.: se pagó el delivery del laboratorio"></div>
            <button type="button" class="btn btn-primary btn-block" id="k-close">${icon('lock')} Cerrar la caja</button></form>`}</div></div>`;
    el.querySelectorAll('[data-d]').forEach((b) => b.onclick = () => { day = b.dataset.d; draw(); });
    el.querySelectorAll('[data-o]').forEach((b) => b.onclick = () => openOrder(b.dataset.o));
    el.querySelectorAll('[data-pp]').forEach((b) => b.onclick = () => printPayment(store.payments.find((x) => x.id === b.dataset.pp)));
    const f = $('#k-f');
    if (f) {
      const upd = () => { const counted = cashKeys.reduce((a, k) => a + parseNum(f.elements[k].value), 0); const any = cashKeys.some((k) => f.elements[k].value.trim()); const d = round2(counted - expCash); $('#k-diff').innerHTML = any ? `<div class="pay-status ${Math.abs(d) < 0.01 ? 'ok' : 'due'}"><span>${Math.abs(d) < 0.01 ? `${icon('check')} Cuadra` : d < 0 ? 'Falta' : 'Sobra'}</span><span class="num">${Math.abs(d) < 0.01 ? '' : usd(Math.abs(d))}</span></div>` : ''; };
      cashKeys.forEach((k) => f.elements[k].oninput = upd);
      $('#k-close').onclick = async (e) => {
        const counted = {}; cashKeys.forEach((k) => { counted[k] = f.elements[k].value.trim() === '' ? Math.max(0, s.byMethod[k]?.amount || 0) : parseNum(f.elements[k].value); });
        setBusy(e.currentTarget, true);
        try { const r = await closeCash(day, { counted, note: f.elements.note.value }); toast(Math.abs(r.diff) < 0.01 ? 'Caja cerrada: cuadra' : `Caja cerrada con diferencia de ${usd(r.diff)}`, Math.abs(r.diff) < 0.01 ? 'success' : 'warning'); }
        catch (ex) { toast(ex.message, 'warning'); setBusy(e.currentTarget, false); }
      };
    }
    $('#k-re')?.addEventListener('click', async () => { const counted = {}; cashKeys.forEach((k) => { counted[k] = s.byMethod[k]?.amount || 0; }); await closeCash(day, { counted, note: (c?.note || '') + ' (recierre)' }); toast('Caja cerrada de nuevo'); });
  }
  draw();
  const off = store.on('*', (evt) => { if (['payments', 'expenses', 'closings', 'orders'].includes(evt)) draw(); });
  return off;
}
