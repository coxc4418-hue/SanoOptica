// SanoÓptica — Gastos de la óptica: alquiler, servicios, materiales, publicidad…
import { store } from '../store.js';
import { esc, usd, bs, num, emptyState, toast, openModal, setBusy, confirmDialog, parseNum, fmtDate, todayKey, PAY_METHODS, methodLabel, download, toCSV } from '../utils.js';
import { icon } from '../icons.js';
import { currentPeriod, periodName, lastPeriods, expCat } from '../optica.js';
import { saveExpense, voidExpense } from '../ops.js';

export function expenseForm(e0 = null) {
  return new Promise((resolve) => {
    const e = e0 || { date: todayKey(), category: store.categories[0]?.id || 'otros' };
    let done = false;
    const m = openModal({
      title: e0 ? 'Editar gasto' : 'Nuevo gasto', size: 'md',
      body: `<form class="stack" data-f>
        <div class="field"><label>Categoría</label><div class="cat-pick">${store.categories.map((c) => `<label><input type="radio" name="category" value="${c.id}" ${e.category === c.id ? 'checked' : ''}><span>${icon(c.icon || 'tag')}${esc(c.name)}</span></label>`).join('')}</div></div>
        <div class="form-grid">
          <div class="field"><label>Concepto *</label><input class="input" name="concept" value="${esc(e.concept || '')}" placeholder="Ej.: Pago al laboratorio, semana 46" maxlength="140"></div>
          <div class="field"><label>Monto *</label><input class="input input-lg" name="amount" inputmode="decimal" value="${e.amount ? num(e.amount) : ''}"></div>
          <div class="field"><label>Fecha</label><input class="input" type="date" name="date" value="${e.date || todayKey()}"></div>
          <div class="field"><label>Proveedor</label><input class="input" name="supplier" value="${esc(e.supplier || '')}"></div>
          <div class="field"><label>Forma de pago</label><select class="input" name="method"><option value="">—</option>${Object.entries(PAY_METHODS).map(([k, p]) => `<option value="${k}" ${e.method === k ? 'selected' : ''}>${esc(p.label)}</option>`).join('')}</select></div>
          <div class="field"><label>Referencia</label><input class="input" name="reference" value="${esc(e.reference || '')}"></div>
        </div>
        <div class="error-msg" data-err></div></form>`,
      footer: `<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" data-ok>${icon('check')} Guardar gasto</button>`,
      onClose: () => { if (!done) resolve(null); }
    });
    const F = m.el.querySelector('[data-f]');
    const go = async (ev) => {
      ev?.preventDefault();
      const btn = m.el.querySelector('[data-ok]'); setBusy(btn, true, 'Guardando…');
      try {
        const cat = F.querySelector('[name=category]:checked')?.value || 'otros';
        const r = await saveExpense({ category: cat, concept: F.concept.value || expCat(cat, store.categories).name, amount: parseNum(F.amount.value), date: F.date.value, supplier: F.supplier.value, method: F.method.value, reference: F.reference.value }, e0?.id);
        toast('Gasto guardado'); done = true; m.close(); resolve(r);
      } catch (ex) { m.el.querySelector('[data-err]').textContent = ex.message; setBusy(btn, false); }
    };
    F.onsubmit = go; m.el.querySelector('[data-ok]').onclick = go;
  });
}

export function mount(el, { params }) {
  let period = currentPeriod();
  el.innerHTML = `
    <div class="view-header"><div><h1 class="view-title">Gastos de la óptica</h1><p class="view-sub">Registra lo que sale: laboratorio, compra de monturas, alquiler, servicios, nómina y publicidad.</p></div>
      <div class="view-actions"><button class="btn btn-primary" id="e-new">${icon('plus')} Nuevo gasto</button></div></div>
    <div class="card card-flush"><div class="toolbar"><div class="chips" id="e-months"></div><button class="btn btn-ghost btn-sm" id="e-csv">${icon('download')} CSV</button></div></div>
    <div class="kpis kpis-4 mt" id="e-kpis"></div>
    <div class="grid-2-1 mt-lg"><div class="card card-flush" id="e-list"></div><div class="card" id="e-cats"></div></div>`;
  const $ = (s) => el.querySelector(s);
  $('#e-new').onclick = () => expenseForm();

  function draw() {
    $('#e-months').innerHTML = lastPeriods(6).map((p) => `<button class="chip ${period === p ? 'on' : ''}" data-p="${p}">${esc(periodName(p))}</button>`).join('');
    el.querySelectorAll('[data-p]').forEach((b) => b.onclick = () => { period = b.dataset.p; draw(); });
    const list = store.expenses.filter((e) => e.period === period);
    const live = list.filter((e) => e.status !== 'anulado');
    const exp = store.expensesIn(period); const inc = store.collectedIn(period);
    const sold = store.orders.filter((o) => o.status !== 'anulada' && (o.date || '').startsWith(period));
    const salesT = sold.reduce((a, o) => a + (Number(o.total) || 0), 0); const costT = sold.reduce((a, o) => a + (Number(o.cost) || 0), 0);
    const net = inc - exp;
    $('#e-kpis').innerHTML = `
      <div class="card kpi"><div class="kpi-top"><span class="kpi-label">Cobrado</span><span class="kpi-icon tone-success">${icon('trend')}</span></div><div class="kpi-value">${usd(inc)}</div><div class="kpi-sub">ingresos del mes</div></div>
      <div class="card kpi"><div class="kpi-top"><span class="kpi-label">Gastos</span><span class="kpi-icon tone-danger">${icon('receipt')}</span></div><div class="kpi-value">${usd(exp)}</div><div class="kpi-sub">${live.length} gasto(s)</div></div>
      <div class="card kpi"><div class="kpi-top"><span class="kpi-label">Margen en ventas</span><span class="kpi-icon tone-warning">${icon('target')}</span></div><div class="kpi-value">${salesT > 0 ? Math.round((1 - costT / salesT) * 100) + '%' : '—'}</div><div class="kpi-sub">vendido ${usd(salesT)} · costo ${usd(costT)}</div></div>
      <div class="card kpi"><div class="kpi-top"><span class="kpi-label">Resultado</span><span class="kpi-icon tone-${net >= 0 ? 'brand' : 'danger'}">${icon('chart')}</span></div><div class="kpi-value ${net < 0 ? 'text-danger' : ''}">${usd(net)}</div><div class="kpi-sub">${bs(net) || 'cobrado − gastos'}</div></div>`;
    $("#e-list").innerHTML = list.length ? `<div class="table-wrap"><table class="table table-cards"><thead><tr><th>Fecha</th><th>Concepto</th><th class="hide-sm">Categoría</th><th class="r">Monto</th><th></th></tr></thead><tbody>
      ${list.map((e) => { const c = expCat(e.category, store.categories); return `<tr class="${e.status === 'anulado' ? 'is-void' : ''}"><td>${fmtDate(e.date)}</td><td><b>${esc(e.concept)}</b><div class="t-sub">${esc([e.supplier, e.method ? methodLabel(e.method) : '', e.reference ? 'ref. ' + e.reference : ''].filter(Boolean).join(' · '))}</div></td><td class="hide-sm"><span class="row" style="gap:6px">${icon(c.icon || 'tag')} ${esc(c.name)}</span></td><td class="r"><b class="num">${usd(e.amount)}</b>${e.status === 'anulado' ? '<div class="badge badge-neutral">Anulado</div>' : ''}</td>
        <td class="r" style="white-space:nowrap">${e.status !== 'anulado' ? `<button class="btn btn-ghost btn-icon btn-sm" data-ed="${e.id}">${icon('edit')}</button><button class="btn btn-ghost btn-icon btn-sm" data-vd="${e.id}">${icon('x')}</button>` : ''}</td></tr>`; }).join('')}
    </tbody></table></div>` : `<div class="pd-3">${emptyState('receipt', 'Sin gastos este mes', 'Registra el laboratorio, el alquiler, los servicios y lo que compres para la óptica.')}</div>`;
    const by = {};
    for (const e of live) by[e.category] = (by[e.category] || 0) + (Number(e.amount) || 0);
    const tot = Object.values(by).reduce((a, b) => a + b, 0) || 1;
    $('#e-cats').innerHTML = `<div class="card-title">${icon('pie')} ¿En qué se va el dinero?</div>${Object.keys(by).length ? `<div class="stack mt">${Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, v]) => { const c = expCat(k, store.categories); return `<div><div class="between small"><span class="row" style="gap:6px">${icon(c.icon || 'tag')} ${esc(c.name)}</span><b>${usd(v)}</b></div><div class="progress progress-sm"><span style="width:${v / tot * 100}%"></span></div></div>`; }).join('')}</div>` : emptyState('pie', 'Sin datos')}`;
    el.querySelectorAll('[data-ed]').forEach((b) => b.onclick = () => expenseForm(store.expenses.find((x) => x.id === b.dataset.ed)));
    el.querySelectorAll('[data-vd]').forEach((b) => b.onclick = async () => {
      const { requirePin } = await import('../auth.js');
      if (!(await requirePin('Anular un gasto'))) return;
      if (!(await confirmDialog({ title: 'Anular gasto', message: 'El gasto queda anulado y deja de sumar.', confirmText: 'Anular', danger: true }))) return;
      await voidExpense(store.expenses.find((x) => x.id === b.dataset.vd)); toast('Gasto anulado');
    });
    $('#e-csv').onclick = () => download(`gastos-${period}.csv`, toCSV([['Fecha', 'N°', 'Categoría', 'Concepto', 'Proveedor', 'Forma de pago', 'Referencia', 'Monto', 'Estado'], ...list.map((e) => [e.date, e.number || '', expCat(e.category, store.categories).name, e.concept, e.supplier || '', e.method ? methodLabel(e.method) : '', e.reference || '', num(e.amount), e.status])]), 'text/csv;charset=utf-8');
  }
  draw();
  if (params?.new) expenseForm();
  const off = store.on('*', (e) => { if (['expenses', 'orders', 'payments', 'settings', 'rate'].includes(e)) draw(); });
  return () => off();
}
