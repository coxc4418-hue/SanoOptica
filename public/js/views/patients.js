// SanoÓptica — Pacientes: búsqueda, filtros, ficha, importación y exportación
import { store } from '../store.js';
import { esc, usd, emptyState, toast, fmtDate, normalize, todayKey, toCSV, parseCSV, download, openModal, setBusy } from '../utils.js';
import { icon } from '../icons.js';
import { ageOf, daysTo, eyeText } from '../optica.js';
import { importPatients } from '../ops.js';
import { patientAvatar, patientSub, patientForm, openPatient, balanceBadge, controlBadge } from '../patient.js';

export function mount(el, { params = {} }) {
  let q = params.q || ''; let filter = params.tab || 'activos'; let sort = 'nombre'; let limit = 60;
  el.innerHTML = `
    <div class="view-header"><div><h1 class="view-title">Pacientes</h1><p class="view-sub">Historia clínica visual, fórmulas, órdenes y saldo de cada paciente.</p></div>
      <div class="view-actions"><button class="btn btn-primary" id="pt-new">${icon('userPlus')} Nuevo paciente</button><button class="btn btn-secondary" id="pt-imp">${icon('upload')} Importar</button><button class="btn btn-ghost" id="pt-csv">${icon('download')} Exportar</button></div></div>
    <div class="toolbar"><label class="search grow">${icon('search')}<input id="pt-q" value="${esc(q)}" placeholder="Nombre, cédula, teléfono o N° de historia…" autocomplete="off"></label>
      <select class="input select" id="pt-sort" style="max-width:190px"><option value="nombre">Orden: nombre</option><option value="reciente">Más recientes</option><option value="examen">Último examen</option><option value="saldo">Mayor saldo</option></select></div>
    <div class="chips mt-sm" id="pt-f"></div>
    <div id="pt-list" class="mt"></div>`;
  const $ = (s) => el.querySelector(s);
  $('#pt-new').onclick = async () => { const p = await patientForm(); if (p) openPatient(p.id); };
  $('#pt-q').oninput = (e) => { q = e.target.value; limit = 60; list(); };
  $('#pt-sort').onchange = (e) => { sort = e.target.value; list(); };
  $('#pt-csv').onclick = () => {
    const rows = store.patients.map((p) => { const e = store.lastExam(p.id); return { Historia: p.code, Nombre: p.name, Cedula: p.idDoc || '', Telefono: p.phone || '', Correo: p.email || '', Nacimiento: p.birthDate || '', Edad: ageOf(p.birthDate) ?? '', UltimoExamen: p.lastExamAt || '', ProximoControl: p.nextControl || '', OD: e ? eyeText(e.rx?.od) : '', OI: e ? eyeText(e.rx?.oi) : '', Saldo: store.balanceOf(p.id), Activo: p.active === false ? 'No' : 'Sí' }; });
    download(`pacientes-${todayKey()}.csv`, toCSV(rows)); toast(`${rows.length} pacientes exportados`);
  };
  $('#pt-imp').onclick = importDialog;
  function chips() {
    const n = { activos: store.activePatients.length, saldo: store.debtors.length, control: store.controlsDue(0).length, sinexamen: store.activePatients.filter((p) => !p.lastExamAt).length, ninos: store.activePatients.filter((p) => (ageOf(p.birthDate) ?? 99) < 16).length, inactivos: store.patients.filter((p) => p.active === false).length };
    $('#pt-f').innerHTML = [['activos', 'Activos'], ['saldo', 'Con saldo'], ['control', 'Control vencido'], ['sinexamen', 'Sin examen'], ['ninos', 'Niños'], ['inactivos', 'Inactivos']].map(([k, l]) => `<button class="chip ${filter === k ? 'on' : ''}" data-f="${k}">${l} <span class="chip-n">${n[k]}</span></button>`).join('');
    el.querySelectorAll('[data-f]').forEach((b) => b.onclick = () => { filter = b.dataset.f; limit = 60; chips(); list(); });
  }
  function list() {
    const t = normalize(q).replace(/\s+/g, '');
    let rows = filter === 'inactivos' ? store.patients.filter((p) => p.active === false) : store.activePatients;
    if (filter === 'saldo') rows = rows.filter((p) => store.balanceOf(p.id) > 0.009);
    if (filter === 'control') rows = rows.filter((p) => p.nextControl && p.nextControl < todayKey());
    if (filter === 'sinexamen') rows = rows.filter((p) => !p.lastExamAt);
    if (filter === 'ninos') rows = rows.filter((p) => (ageOf(p.birthDate) ?? 99) < 16);
    if (t) rows = rows.filter((p) => normalize(`${p.name}${p.code}${p.idDoc}${p.phone}${p.email}${p.guardianName || ''}`).replace(/\s+/g, '').includes(t));
    rows = rows.slice();
    if (sort === 'reciente') rows.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    if (sort === 'examen') rows.sort((a, b) => (b.lastExamAt || '').localeCompare(a.lastExamAt || ''));
    if (sort === 'saldo') rows.sort((a, b) => store.balanceOf(b.id) - store.balanceOf(a.id));
    const total = rows.length; rows = rows.slice(0, limit);
    $('#pt-list').innerHTML = rows.length ? `<div class="t-sub mb">${total} paciente(s)</div><div class="card card-flush"><div class="list" style="padding:6px 10px">${rows.map((p) => {
      const d = p.nextControl ? daysTo(p.nextControl) : null;
      return `<button class="list-item linkish" data-p="${p.id}" style="width:100%;text-align:left">${patientAvatar(p)}<div class="grow" style="min-width:0"><b class="ellipsis">${esc(p.name)}</b><div class="t-sub ellipsis">${esc(patientSub(p))}</div></div>
        <div class="r hide-xs" style="min-width:120px"><div class="t-sub">${p.lastExamAt ? 'Examen ' + fmtDate(p.lastExamAt) : 'Sin examen'}</div>${d != null ? controlBadge(p) : ''}</div>
        <div class="r" style="min-width:80px">${balanceBadge(p)}</div></button>`; }).join('')}</div></div>${total > limit ? `<div class="center mt"><button class="btn btn-secondary" id="pt-more">Ver más (${total - limit})</button></div>` : ''}`
      : `<div class="card">${emptyState('users', q ? 'Sin resultados' : 'Sin pacientes', q ? 'Prueba con otro nombre, cédula o teléfono.' : 'Registra tu primer paciente o importa tu lista desde Excel (CSV).')}</div>`;
    $('#pt-more')?.addEventListener('click', () => { limit += 60; list(); });
    el.querySelectorAll('#pt-list [data-p]').forEach((b) => b.onclick = () => openPatient(b.dataset.p));
  }
  function importDialog() {
    const m = openModal({
      title: 'Importar pacientes', size: 'md', sub: 'Desde Excel: Archivo › Guardar como › CSV. Columnas reconocidas: nombre, cédula, teléfono, correo, nacimiento (dd/mm/aaaa), dirección, ocupación, notas.',
      body: `<div class="stack"><label class="file-pick">${icon('upload')} <span data-fn>Elegir archivo .csv</span><input type="file" accept=".csv,text/csv" data-file hidden></label><div data-prev></div><div class="error-msg" data-err></div></div>`,
      footer: `<button class="btn btn-ghost" data-tpl>${icon('download')} Plantilla</button><button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" data-ok disabled>${icon('check')} Importar</button>`
    });
    let rows = [];
    m.el.querySelector('[data-tpl]').onclick = () => download('plantilla-pacientes.csv', toCSV([{ nombre: 'María Pérez', cedula: 'V-12345678', telefono: '04141234567', correo: 'maria@correo.com', nacimiento: '15/03/1985', direccion: 'Av. Principal', ocupacion: 'Docente', notas: '' }]));
    m.el.querySelector('[data-file]').onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      m.el.querySelector('[data-fn]').textContent = f.name;
      try {
        rows = parseCSV(await f.text());
        const ok = rows.filter((r) => Object.keys(r).some((k) => /nombre|paciente|name/i.test(k)));
        m.el.querySelector('[data-prev]').innerHTML = `<div class="box">${icon('info')} ${rows.length} fila(s) leídas${ok.length !== rows.length ? '' : ''}. Los pacientes con una cédula ya registrada se omiten.</div>`;
        m.el.querySelector('[data-ok]').disabled = !rows.length;
      } catch (ex) { m.el.querySelector('[data-err]').textContent = 'No se pudo leer el archivo: ' + ex.message; }
    };
    m.el.querySelector('[data-ok]').onclick = async (e) => {
      setBusy(e.currentTarget, true, 'Importando…');
      try { const r = await importPatients(rows); m.close(); toast(`${r.created} paciente(s) importados${r.skipped ? ` · ${r.skipped} omitidos` : ''}`); }
      catch (ex) { m.el.querySelector('[data-err]').textContent = ex.message; setBusy(e.currentTarget, false); }
    };
  }
  chips(); list();
  const off = store.on('*', (evt) => { if (['patients', 'orders', 'exams'].includes(evt)) { chips(); list(); } });
  return off;
}
