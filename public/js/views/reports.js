// SanoÓptica — Reportes del mes: ventas, ganancia, mezcla de productos, laboratorios y conversión
import { store } from '../store.js';
import { esc, usd, emptyState, methodLabel, toCSV, download, round2 } from '../utils.js';
import { icon } from '../icons.js';
import { currentPeriod, periodName, lastPeriods, LENS_TYPES, PRODUCT_CATS, expCat, DIAGNOSES } from '../optica.js';
import { printDoc } from '../shared.js';

const bars = (rows, fmt = usd) => { const max = Math.max(1, ...rows.map((r) => r.v)); return rows.length ? `<div class="stack-sm">${rows.map((r) => `<div><div class="between small"><span class="ellipsis">${r.icon ? icon(r.icon) + ' ' : ''}${esc(r.k)}</span><b>${fmt(r.v)}${r.n != null ? ` <span class="t-sub">· ${r.n}</span>` : ''}</b></div><div class="progress progress-sm"><span style="width:${r.v / max * 100}%"></span></div></div>`).join('')}</div>` : emptyState('chart', 'Sin datos', 'No hay movimientos en este mes.'); };
const group = (list, key, val = () => 1) => { const m = new Map(); for (const x of list) { const k = key(x); if (!k) continue; const c = m.get(k) || { k, v: 0, n: 0 }; c.v += val(x); c.n++; m.set(k, c); } return [...m.values()].sort((a, b) => b.v - a.v); };

export function mount(el) {
  let period = currentPeriod();
  el.innerHTML = `
    <div class="view-header"><div><h1 class="view-title">Reportes</h1><p class="view-sub">Cómo va la óptica: ventas, ganancia, lo que más se vende, laboratorios y cuántos examinados compran.</p></div>
      <div class="view-actions"><button class="btn btn-secondary" id="r-pr">${icon('print')} Imprimir</button><button class="btn btn-ghost" id="r-csv">${icon('download')} CSV</button></div></div>
    <div class="chips" id="r-m"></div><div id="r-body" class="mt"></div>`;
  const $ = (s) => el.querySelector(s);
  const calc = () => {
    const orders = store.orders.filter((o) => o.status !== 'anulada' && (o.date || '').startsWith(period));
    const work = orders.filter((o) => o.kind !== 'venta'); const sales = orders.filter((o) => o.kind === 'venta');
    const total = round2(orders.reduce((a, o) => a + (Number(o.total) || 0), 0)); const cost = round2(orders.reduce((a, o) => a + (Number(o.cost) || 0), 0));
    const coll = store.collectedIn(period); const exp = store.expensesIn(period);
    const items = orders.flatMap((o) => (o.items || []).map((i) => ({ ...i, o })));
    const exams = store.exams.filter((e) => e.status !== 'anulada' && (e.date || '').startsWith(period));
    const conv = exams.length ? Math.round(exams.filter((e) => store.orders.some((o) => o.examId === e.id && o.status !== 'anulada')).length / exams.length * 100) : null;
    const newPat = store.patients.filter((p) => (p.createdAt || '').startsWith(period)).length;
    const pays = store.confirmedPayments.filter((p) => (p.date || '').startsWith(period));
    const labs = store.labs.map((l) => { const os = store.orders.filter((o) => o.labId === l.id && o.sentAt && o.receivedAt && (o.receivedAt || '').startsWith(period)); const avg = os.length ? os.reduce((a, o) => a + (new Date(o.receivedAt) - new Date(o.sentAt)) / 864e5, 0) / os.length : null; const late = os.filter((o) => o.promised && o.receivedAt.slice(0, 10) > o.promised).length; return { l, n: os.length, avg, late }; }).filter((x) => x.n);
    return {
      orders, work, sales, total, cost, coll, exp, exams, conv, newPat, pays, labs,
      profit: round2(total - cost), net: round2(coll - exp), ticket: work.length ? round2(work.reduce((a, o) => a + (Number(o.total) || 0), 0) / work.length) : 0,
      byLensType: group(work.filter((o) => o.lens?.type), (o) => LENS_TYPES[o.lens.type]?.label || o.lens.type),
      byFrame: group(items.filter((i) => i.kind === 'montura' || (i.productId && ['montura', 'sol'].includes(store.product(i.productId)?.cat))), (i) => store.product(i.productId)?.brand || 'Sin marca', (i) => i.price * i.qty),
      byCat: group(items.filter((i) => i.productId), (i) => PRODUCT_CATS[store.product(i.productId)?.cat]?.label || 'Otros', (i) => i.price * i.qty),
      byLens: group(items.filter((i) => i.kind === 'cristal'), (i) => i.name.replace(/^Cristales /, ''), (i) => i.price * i.qty),
      byTreat: group(items.filter((i) => i.kind === 'tratamiento'), (i) => i.name, (i) => i.price * i.qty),
      byMethod: group(pays, (p) => methodLabel(p.method), (p) => Number(p.amount) || 0),
      byDx: group(exams.flatMap((e) => e.diagnosis || []).map((d) => ({ d })), (x) => DIAGNOSES[x.d] || x.d),
      byExp: group(store.expenses.filter((e) => e.period === period && e.status !== 'anulado'), (e) => expCat(e.category, store.categories).name, (e) => Number(e.amount) || 0),
      bySeller: group(orders.filter((o) => o.seller), (o) => o.seller, (o) => Number(o.total) || 0)
    };
  };
  function draw() {
    $('#r-m').innerHTML = lastPeriods(12).map((p) => `<button class="chip ${p === period ? 'on' : ''}" data-p="${p}">${esc(periodName(p))}</button>`).join('');
    el.querySelectorAll('[data-p]').forEach((b) => b.onclick = () => { period = b.dataset.p; draw(); });
    const r = calc();
    const trend = lastPeriods(6, period).reverse().map((p) => ({ p, v: store.salesIn(p), c: store.collectedIn(p) }));
    const mx = Math.max(1, ...trend.map((t) => Math.max(t.v, t.c)));
    $('#r-body').innerHTML = `
      <div class="kpis">
        <div class="card kpi"><div class="kpi-top"><span class="kpi-label">Vendido</span><span class="kpi-icon tone-brand">${icon('trend')}</span></div><div class="kpi-value">${usd(r.total)}</div><div class="kpi-sub">${r.work.length} orden(es) · ${r.sales.length} venta(s)</div></div>
        <div class="card kpi"><div class="kpi-top"><span class="kpi-label">Cobrado</span><span class="kpi-icon tone-success">${icon('cash')}</span></div><div class="kpi-value">${usd(r.coll)}</div><div class="kpi-sub">${r.pays.length} pago(s)</div></div>
        <div class="card kpi"><div class="kpi-top"><span class="kpi-label">Ganancia bruta</span><span class="kpi-icon tone-violet">${icon('target')}</span></div><div class="kpi-value">${usd(r.profit)}</div><div class="kpi-sub">margen ${r.total ? Math.round(r.profit / r.total * 100) : 0}%</div></div>
        <div class="card kpi"><div class="kpi-top"><span class="kpi-label">Resultado de caja</span><span class="kpi-icon tone-${r.net >= 0 ? 'success' : 'danger'}">${icon('chart')}</span></div><div class="kpi-value ${r.net < 0 ? 'text-danger' : ''}">${usd(r.net)}</div><div class="kpi-sub">cobrado − gastos (${usd(r.exp)})</div></div>
        <div class="card kpi"><div class="kpi-top"><span class="kpi-label">Ticket promedio</span><span class="kpi-icon tone-info">${icon('glasses')}</span></div><div class="kpi-value">${usd(r.ticket)}</div><div class="kpi-sub">por orden de lentes</div></div>
        <div class="card kpi"><div class="kpi-top"><span class="kpi-label">Examen → compra</span><span class="kpi-icon tone-warning">${icon('eyeTest')}</span></div><div class="kpi-value">${r.conv == null ? '—' : r.conv + '%'}</div><div class="kpi-sub">${r.exams.length} examen(es) · ${r.newPat} paciente(s) nuevo(s)</div></div></div>
      <div class="grid-2 mt-lg">
        <div class="card"><div class="card-title">${icon('chart')} Últimos 6 meses</div><div class="bars2 mt">${trend.map((t) => `<div class="bar2"><div class="bar2-cols"><i class="b" style="height:${t.v / mx * 100}%" title="Vendido ${usd(t.v)}"></i><i class="c" style="height:${t.c / mx * 100}%" title="Cobrado ${usd(t.c)}"></i></div><span>${esc(periodName(t.p, true))}</span></div>`).join('')}</div><div class="ag-legend mt"><span><i class="lg-b"></i> Vendido</span><span><i class="lg-c"></i> Cobrado</span></div></div>
        <div class="card"><div class="card-title">${icon('lens')} Tipo de lente</div><div class="mt">${bars(r.byLensType, (v) => v + ' ord.')}</div></div>
        <div class="card"><div class="card-title">${icon('frame')} Monturas por marca</div><div class="mt">${bars(r.byFrame.slice(0, 8))}</div></div>
        <div class="card"><div class="card-title">${icon('lens')} Cristales más vendidos</div><div class="mt">${bars(r.byLens.slice(0, 8))}</div></div>
        <div class="card"><div class="card-title">${icon('sparkle')} Tratamientos</div><div class="mt">${bars(r.byTreat)}</div></div>
        <div class="card"><div class="card-title">${icon('box')} Productos por categoría</div><div class="mt">${bars(r.byCat)}</div></div>
        <div class="card"><div class="card-title">${icon('wallet')} Formas de pago</div><div class="mt">${bars(r.byMethod)}</div></div>
        <div class="card"><div class="card-title">${icon('eye')} Diagnósticos</div><div class="mt">${bars(r.byDx.slice(0, 8), (v) => v)}</div></div>
        <div class="card"><div class="card-title">${icon('lab')} Laboratorios (recibidas en el mes)</div>${r.labs.length ? `<div class="table-wrap mt"><table class="table lab-rep"><thead><tr><th>Laboratorio</th><th class="r">Órdenes</th><th class="r hide-xs">Promete</th><th class="r">Real</th><th class="r">Tarde</th></tr></thead><tbody>${r.labs.map((x) => `<tr><td>${esc(x.l.name)}</td><td class="r">${x.n}</td><td class="r hide-xs">${x.l.days || 0} d</td><td class="r ${x.avg > (x.l.days || 0) ? 'text-warning' : ''}">${x.avg.toFixed(1)} d</td><td class="r ${x.late ? 'text-danger' : ''}">${x.late}</td></tr>`).join('')}</tbody></table></div>` : emptyState('lab', 'Sin datos', 'Aún no se reciben órdenes del laboratorio este mes.')}</div>
        <div class="card"><div class="card-title">${icon('receipt')} Gastos por categoría</div><div class="mt">${bars(r.byExp)}</div>${r.bySeller.length ? `<div class="section-title">${icon('users')} Ventas por asesor(a)</div>${bars(r.bySeller)}` : ''}</div>
      </div>`;
  }
  $('#r-pr').onclick = () => {
    const r = calc();
    const t = (title, rows) => rows.length ? `<h3>${esc(title)}</h3><table><tbody>${rows.map((x) => `<tr><td>${esc(x.k)}</td><td class="r">${x.n}</td><td class="r">${usd(x.v)}</td></tr>`).join('')}</tbody></table>` : '';
    printDoc(`Reporte de ${periodName(period)}`, `<table><tbody><tr><td>Vendido</td><td class="r"><b>${usd(r.total)}</b></td></tr><tr><td>Cobrado</td><td class="r">${usd(r.coll)}</td></tr><tr><td>Costo (productos y laboratorio)</td><td class="r">${usd(r.cost)}</td></tr><tr><td>Ganancia bruta</td><td class="r"><b>${usd(r.profit)}</b></td></tr><tr><td>Gastos</td><td class="r">${usd(r.exp)}</td></tr><tr><td>Resultado de caja</td><td class="r"><b>${usd(r.net)}</b></td></tr><tr><td>Órdenes / ventas</td><td class="r">${r.work.length} / ${r.sales.length}</td></tr><tr><td>Exámenes · conversión</td><td class="r">${r.exams.length} · ${r.conv ?? 0}%</td></tr></tbody></table>
      ${t('Monturas por marca', r.byFrame)}${t('Cristales', r.byLens)}${t('Tratamientos', r.byTreat)}${t('Formas de pago', r.byMethod)}${t('Gastos', r.byExp)}`);
  };
  $('#r-csv').onclick = () => {
    const r = calc();
    download(`reporte-${period}.csv`, toCSV(r.orders.map((o) => ({ Numero: o.number, Tipo: o.kind === 'venta' ? 'Venta' : 'Orden', Fecha: o.date, Paciente: o.patientName, Total: o.total, Costo: o.cost || 0, Ganancia: round2((o.total || 0) - (o.cost || 0)), Pagado: o.paid || 0, Asesor: o.seller || '' }))));
  };
  draw();
  const off = store.on('*', (evt) => { if (['orders', 'payments', 'expenses', 'exams'].includes(evt)) draw(); });
  return off;
}
