// SanoÓptica — Exámenes visuales: historial de fórmulas, búsqueda y acciones
import { store } from '../store.js';
import { esc, emptyState, toast, fmtDate, normalize, todayKey, promptDialog, toCSV, download } from '../utils.js';
import { icon } from '../icons.js';
import { DIAGNOSES, LENS_TYPES, eyeText, spherEq, currentPeriod, periodName } from '../optica.js';
import { voidExam } from '../ops.js';
import { examForm } from '../rx.js';
import { orderForm } from '../order.js';
import { openPatient, rxMini, patientAvatar } from '../patient.js';
import { printRx, waPatient } from '../shared.js';

export function mount(el, { params = {} }) {
  let q = ''; let filter = params.tab || 'todos'; let limit = 40;
  el.innerHTML = `
    <div class="view-header"><div><h1 class="view-title">Exámenes visuales</h1><p class="view-sub">Cada fórmula queda en la historia del paciente y se puede verificar con su código QR.</p></div>
      <div class="view-actions"><button class="btn btn-primary" id="e-new">${icon('eyeTest')} Nuevo examen <kbd class="hide-sm">F2</kbd></button><button class="btn btn-ghost" id="e-csv">${icon('download')} Exportar</button></div></div>
    <div class="kpis kpis-4" id="e-kpis"></div>
    <div class="toolbar mt">
      <label class="search grow">${icon('search')}<input id="e-q" placeholder="Paciente, cédula o número de fórmula…" autocomplete="off"></label>
      <div class="chips" id="e-f"></div></div>
    <div id="e-list" class="mt"></div>`;
  const $ = (s) => el.querySelector(s);
  $('#e-new').onclick = () => examForm();
  $('#e-q').oninput = (e) => { q = e.target.value; limit = 40; list(); };
  $('#e-csv').onclick = () => {
    const rows = store.exams.filter((e) => e.status !== 'anulada').map((e) => ({ Numero: e.number, Fecha: e.date, Paciente: e.patientName, Codigo: e.patientCode, OD: eyeText(e.rx?.od), OI: eyeText(e.rx?.oi), DP: e.rx?.dp || '', Diagnostico: (e.diagnosis || []).map((d) => DIAGNOSES[d] || d).join(' / '), Lente: LENS_TYPES[e.lensType]?.label || '', Control: e.nextControl || '', Optometrista: e.optometrist || '' }));
    download(`examenes-${todayKey()}.csv`, toCSV(rows)); toast(`${rows.length} exámenes exportados`);
  };
  function kpis() {
    const p = currentPeriod();
    const mon = store.exams.filter((e) => (e.date || '').startsWith(p) && e.status !== 'anulada');
    const withOrder = mon.filter((e) => store.orders.some((o) => o.examId === e.id && o.status !== 'anulada')).length;
    const presb = mon.filter((e) => (e.diagnosis || []).includes('presbicia')).length;
    $('#e-kpis').innerHTML = `
      <div class="card kpi"><div class="kpi-top"><span class="kpi-label">Hoy</span><span class="kpi-icon tone-brand">${icon('eyeTest')}</span></div><div class="kpi-value">${store.exams.filter((e) => e.date === todayKey() && e.status !== 'anulada').length}</div><div class="kpi-sub">exámenes realizados</div></div>
      <div class="card kpi"><div class="kpi-top"><span class="kpi-label">${esc(periodName(p))}</span><span class="kpi-icon tone-info">${icon('calendar')}</span></div><div class="kpi-value">${mon.length}</div><div class="kpi-sub">${presb} con presbicia</div></div>
      <div class="card kpi"><div class="kpi-top"><span class="kpi-label">Compraron</span><span class="kpi-icon tone-success">${icon('glasses')}</span></div><div class="kpi-value">${mon.length ? Math.round(withOrder / mon.length * 100) : 0}%</div><div class="kpi-sub">${withOrder} de ${mon.length} este mes</div></div>
      <div class="card kpi"><div class="kpi-top"><span class="kpi-label">Sin orden</span><span class="kpi-icon tone-warning">${icon('target')}</span></div><div class="kpi-value">${mon.length - withOrder}</div><div class="kpi-sub">oportunidades de venta</div></div>`;
  }
  function chips() {
    $('#e-f').innerHTML = [['todos', 'Todos'], ['hoy', 'Hoy'], ['sinorden', 'Sin orden'], ['remitir', 'Remitidos'], ['contacto', 'Contacto'], ['anulada', 'Anulados']].map(([k, l]) => `<button class="chip ${filter === k ? 'on' : ''}" data-f="${k}">${l}</button>`).join('');
    el.querySelectorAll('[data-f]').forEach((b) => b.onclick = () => { filter = b.dataset.f; limit = 40; chips(); list(); });
  }
  function list() {
    const t = normalize(q);
    let rows = store.exams.slice().sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.number || '').localeCompare(a.number || ''));
    if (filter === 'anulada') rows = rows.filter((e) => e.status === 'anulada'); else rows = rows.filter((e) => e.status !== 'anulada');
    if (filter === 'hoy') rows = rows.filter((e) => e.date === todayKey());
    if (filter === 'sinorden') rows = rows.filter((e) => !store.orders.some((o) => o.examId === e.id && o.status !== 'anulada'));
    if (filter === 'remitir') rows = rows.filter((e) => e.refer);
    if (filter === 'contacto') rows = rows.filter((e) => e.kind === 'contacto');
    if (t) rows = rows.filter((e) => { const p = store.patient(e.patientId); return normalize(`${e.number} ${e.patientName} ${e.patientCode} ${p?.idDoc || ''}`).includes(t); });
    const total = rows.length; rows = rows.slice(0, limit);
    $('#e-list').innerHTML = rows.length ? `<div class="exam-grid">${rows.map((e) => {
      const p = store.patient(e.patientId) || { name: e.patientName };
      const hasOrder = store.orders.some((o) => o.examId === e.id && o.status !== 'anulada');
      return `<div class="card exam-card ${e.status === 'anulada' ? 'is-void' : ''}">
        <div class="row" style="gap:10px">${patientAvatar(p, 'sm')}<div class="grow" style="min-width:0"><button class="linkish ellipsis" data-p="${e.patientId}"><b>${esc(e.patientName)}</b></button><div class="t-sub">${esc(e.number)} · ${fmtDate(e.date)}${e.optometrist ? ' · ' + esc(e.optometrist) : ''}</div></div>${e.status === 'anulada' ? '<span class="badge badge-danger">Anulado</span>' : hasOrder ? `<span class="badge badge-success">${icon('glasses')} Con orden</span>` : '<span class="badge badge-warning">Sin orden</span>'}</div>
        ${rxMini(e)}
        <div class="t-sub ellipsis">${(e.diagnosis || []).map((d) => esc(DIAGNOSES[d] || d)).join(' · ') || '—'}${e.rx?.od?.sph != null || e.rx?.oi?.sph != null ? ` · EE ${esc(String(spherEq(e.rx.od) ?? '—'))} / ${esc(String(spherEq(e.rx.oi) ?? '—'))}` : ''}${e.refer ? ' · <b class="text-danger">Remitir al oftalmólogo</b>' : ''}</div>
        ${e.status !== 'anulada' ? `<div class="row" style="gap:6px;flex-wrap:wrap">
          ${!hasOrder ? `<button class="btn btn-primary btn-sm" data-o="${e.id}">${icon('glasses')} Crear orden</button>` : ''}
          <button class="btn btn-secondary btn-sm" data-pr="${e.id}">${icon('print')} Fórmula</button>
          ${p.phone ? `<button class="btn btn-whatsapp btn-sm btn-icon" data-wa="${e.id}" title="Enviar fórmula">${icon('whatsapp')}</button>` : ''}
          <button class="btn btn-ghost btn-sm btn-icon" data-ed="${e.id}" title="Editar">${icon('edit')}</button>
          <button class="btn btn-ghost btn-sm btn-icon" data-v="${e.id}" title="Anular">${icon('x')}</button></div>` : `<div class="t-sub">Motivo: ${esc(e.voidReason || '—')}</div>`}
      </div>`; }).join('')}</div>${total > limit ? `<div class="center mt"><button class="btn btn-secondary" id="e-more">Ver más (${total - limit})</button></div>` : ''}`
      : `<div class="card">${emptyState('eyeTest', q ? 'Sin resultados' : 'Aún no hay exámenes', q ? 'Prueba con otro nombre, cédula o número.' : 'Registra el primer examen visual con F2 o con el botón de arriba.')}</div>`;
    $('#e-more')?.addEventListener('click', () => { limit += 40; list(); });
    el.querySelectorAll('#e-list [data-p]').forEach((b) => b.onclick = () => openPatient(b.dataset.p, { tab: 'formulas' }));
    el.querySelectorAll('#e-list [data-o]').forEach((b) => b.onclick = () => { const e = store.exam(b.dataset.o); orderForm({ patient: store.patient(e.patientId), exam: e }); });
    el.querySelectorAll('#e-list [data-pr]').forEach((b) => b.onclick = () => printRx(store.exam(b.dataset.pr)));
    el.querySelectorAll('#e-list [data-wa]').forEach((b) => b.onclick = () => { const e = store.exam(b.dataset.wa); waPatient('formula', { patient: store.patient(e.patientId), exam: e }); });
    el.querySelectorAll('#e-list [data-ed]').forEach((b) => b.onclick = () => examForm({ exam: store.exam(b.dataset.ed) }));
    el.querySelectorAll('#e-list [data-v]').forEach((b) => b.onclick = async () => {
      const e = store.exam(b.dataset.v);
      const r = await promptDialog({ title: `Anular ${e.number}`, label: 'Motivo', placeholder: 'Ej.: registrado al paciente equivocado' });
      if (r == null) return;
      await voidExam(e, r); toast('Examen anulado');
    });
  }
  kpis(); chips(); list();
  const off = store.on('*', (evt) => { if (['exams', 'orders', 'patients'].includes(evt)) { kpis(); list(); } });
  return off;
}
