// SanoÓptica — Examen visual: agudeza visual, refracción OD/OI, lentes de contacto, diagnóstico y recomendación
import { store } from './store.js';
import { esc, num, toast, openModal, setBusy, todayKey, fmtDate, loc } from './utils.js';
import { icon } from './icons.js';
import {
  parseDiop, parseAxis, fmtDiop, eyeErrors, spherEq, toMinusCyl, eyeText, suggestDiagnosis, suggestLensType, suggestMaterial, DIAGNOSES, LENS_TYPES, LENS_MATERIALS, LENS_USE, AV_VALUES, ageOf
} from './optica.js';
import { saveExam } from './ops.js';
import { printRx, waPatient } from './shared.js';
import { pickPatient } from './patient.js';

const SYMPTOMS = ['Visión borrosa de lejos', 'Visión borrosa de cerca', 'Dolor de cabeza', 'Fatiga con pantallas', 'Ardor o picazón', 'Lagrimeo', 'Ve doble', 'Molestia con la luz', 'Control de rutina', 'Cambio de lentes'];
const fv = (v) => (v == null || v === '' ? '' : fmtDiop(v, { plano: true }).replace('−', '-').replace('Plano', '0,00'));

/** Abre el formulario de examen. Resuelve el examen guardado (o null). */
export async function examForm({ patient = null, exam = null } = {}) {
  const p = patient || (exam ? store.patient(exam.patientId) : null) || await pickPatient({ title: 'Examen visual · paciente' });
  if (!p) return null;
  const prev = exam ? null : store.lastExam(p.id);
  const base = exam || { date: todayKey(), kind: 'lentes', rx: { od: {}, oi: {} }, nextControlMonths: Number(store.settings.controlMonths) || 12, optometrist: store.settings.optometrist || '' };
  const age = ageOf(p.birthDate);
  return new Promise((resolve) => {
    let done = false;
    const dx = new Set(base.diagnosis || []);
    let dxTouched = !!exam;
    const tr = new Set(base.treatments || []);
    const sym = new Set((base.reason || '').split(' · ').filter((x) => SYMPTOMS.includes(x)));
    const eyeRow = (k) => {
      const e = base.rx?.[k] || {};
      return `<tr data-eye="${k}"><th><span class="eye-tag eye-${k}">${k.toUpperCase()}</span></th>
        <td><input class="input rx-in" data-f="sph" inputmode="decimal" value="${esc(fv(e.sph))}" placeholder="0,00" aria-label="Esfera ${k}"></td>
        <td><input class="input rx-in" data-f="cyl" inputmode="decimal" value="${esc(e.cyl ? fv(e.cyl) : '')}" placeholder="—" aria-label="Cilindro ${k}"></td>
        <td><input class="input rx-in" data-f="axis" inputmode="numeric" value="${esc(e.axis ?? '')}" placeholder="—" aria-label="Eje ${k}"></td>
        <td><input class="input rx-in" data-f="add" inputmode="decimal" value="${esc(e.add ? fv(e.add) : '')}" placeholder="—" aria-label="Adición ${k}"></td>
        <td><input class="input rx-in" data-f="dp" inputmode="decimal" value="${esc(e.dp ?? '')}" placeholder="mm" aria-label="DP ${k}"></td>
        <td><input class="input rx-in" data-f="height" inputmode="decimal" value="${esc(e.height ?? '')}" placeholder="mm" aria-label="Altura ${k}"></td></tr>`;
    };
    const avSel = (k, f) => `<select class="input select" data-av="${k}.${f}"><option value="">—</option>${AV_VALUES.map((v) => `<option ${base.rx?.[k]?.[f] === v ? 'selected' : ''}>${v}</option>`).join('')}</select>`;
    const m = openModal({
      title: exam ? `Editar examen ${esc(exam.number || '')}` : 'Examen visual', size: 'xl',
      sub: `<b>${esc(p.name)}</b> · ${esc(p.code || '')}${age != null ? ` · ${age} años` : ''}${p.occupation ? ` · ${esc(p.occupation)}` : ''}${prev ? ` · último examen ${fmtDate(prev.date)}` : ' · primer examen'}`,
      body: `<form class="stack exam-form" data-f autocomplete="off">
        ${(p.conditions || []).length || p.allergies ? `<div class="vital-alert warning">${icon('alert')} ${esc([...(p.conditions || []), p.allergies].filter(Boolean).join(' · '))}</div>` : ''}
        <div class="form-grid form-grid-3">
          <div class="field"><label>Fecha</label><input class="input" type="date" name="date" value="${esc(base.date)}" max="${todayKey()}"></div>
          <div class="field"><label>Optometrista</label><input class="input" name="optometrist" value="${esc(base.optometrist || '')}" placeholder="Nombre de quien examina"></div>
          <div class="field"><label>Tipo de corrección</label><div class="seg seg-block" data-kind>${[['lentes', 'Lentes'], ['contacto', 'Lentes de contacto']].map(([k, l]) => `<button type="button" data-k="${k}" class="${(base.kind || 'lentes') === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
        </div>
        <div class="field"><label>Motivo de consulta</label><div class="chips chips-wrap">${SYMPTOMS.map((s) => `<button type="button" class="chip ${sym.has(s) ? 'on' : ''}" data-sym="${esc(s)}">${esc(s)}</button>`).join('')}</div>
          <input class="input mt-xs" name="reasonText" value="${esc((base.reason || '').split(' · ').filter((x) => !SYMPTOMS.includes(x)).join(' · '))}" placeholder="Otro motivo o detalle"></div>
        ${prev ? `<div class="box prev-rx"><div class="between"><b>${icon('history')} Fórmula anterior · ${fmtDate(prev.date)}</b><button type="button" class="btn btn-ghost btn-sm" data-copyprev>${icon('copy')} Usar como base</button></div><div class="mono small mt-xs">OD ${esc(eyeText(prev.rx?.od))}<br>OI ${esc(eyeText(prev.rx?.oi))}${prev.rx?.dp ? `<br>DP ${num(prev.rx.dp, 1)} mm` : ''}</div></div>` : ''}

        <div class="section-title">${icon('eyeTest')} Agudeza visual</div>
        <div class="av-grid">
          <div></div><b>Sin corrección</b><b>Con corrección</b>
          <span class="eye-tag eye-od">OD</span>${avSel('od', 'av')}${avSel('od', 'avcc')}
          <span class="eye-tag eye-oi">OI</span>${avSel('oi', 'av')}${avSel('oi', 'avcc')}
        </div>

        <div class="between"><div class="section-title" style="margin:0">${icon('lens')} Refracción final</div><div class="row" style="gap:6px"><button type="button" class="btn btn-ghost btn-sm" data-copy>${icon('copy')} Copiar OD → OI</button><button type="button" class="btn btn-ghost btn-sm" data-minus title="Pasa el cilindro positivo a negativo">${icon('refresh')} Transponer</button></div></div>
        <div class="rx-wrap"><table class="rx-table"><thead><tr><th></th><th>Esfera</th><th>Cilindro</th><th>Eje</th><th>Adición</th><th>DP mono</th><th>Altura</th></tr></thead><tbody>${eyeRow('od')}${eyeRow('oi')}</tbody></table></div>
        <div class="form-grid form-grid-3">
          <div class="field"><label>DP total (lejos, mm)</label><input class="input" name="dp" inputmode="decimal" value="${esc(base.rx?.dp ?? '')}" placeholder="Ej.: 63"></div>
          <div class="field"><label>DP cerca (mm)</label><input class="input" name="dpNear" inputmode="decimal" value="${esc(base.rx?.dpNear ?? '')}" placeholder="Ej.: 60"></div>
          <div class="field"><label>Prisma (si aplica)</label><input class="input" name="prism" value="${esc([base.rx?.od?.prism ? `OD ${base.rx.od.prism} ${base.rx.od.base || ''}` : '', base.rx?.oi?.prism ? `OI ${base.rx.oi.prism} ${base.rx.oi.base || ''}` : ''].filter(Boolean).join(' · '))}" placeholder="Ej.: OD 1 BI"></div>
        </div>
        <div class="rx-live" data-live></div>

        <div data-cl ${base.kind === 'contacto' ? '' : 'hidden'}>
          <div class="section-title">${icon('contact')} Lentes de contacto</div>
          <div class="rx-wrap"><table class="rx-table"><thead><tr><th></th><th>Curva base</th><th>Diámetro</th><th>Poder</th><th>Marca / tipo</th></tr></thead><tbody>${['od', 'oi'].map((k) => `<tr data-cl-eye="${k}"><th><span class="eye-tag eye-${k}">${k.toUpperCase()}</span></th><td><input class="input rx-in" data-c="bc" value="${esc(base.contact?.[k]?.bc || '')}" placeholder="8,6"></td><td><input class="input rx-in" data-c="dia" value="${esc(base.contact?.[k]?.dia || '')}" placeholder="14,2"></td><td><input class="input rx-in" data-c="power" value="${esc(base.contact?.[k]?.power || '')}" placeholder="-2,25"></td><td><input class="input" data-c="brand" value="${esc(base.contact?.[k]?.brand || '')}" placeholder="Mensual, tórico…"></td></tr>`).join('')}</tbody></table></div>
        </div>

        <details class="more-tests" ${base.pio?.od || base.kerato?.od ? 'open' : ''}><summary>${icon('plus')} Más pruebas (presión intraocular, queratometría)</summary>
          <div class="form-grid mt-sm">
            <div class="field"><label>PIO OD (mmHg)</label><input class="input" name="pioOd" inputmode="decimal" value="${esc(base.pio?.od || '')}"></div>
            <div class="field"><label>PIO OI (mmHg)</label><input class="input" name="pioOi" inputmode="decimal" value="${esc(base.pio?.oi || '')}"></div>
            <div class="field"><label>Queratometría OD</label><input class="input" name="kOd" value="${esc(base.kerato?.od || '')}" placeholder="43,25 / 44,00 × 90"></div>
            <div class="field"><label>Queratometría OI</label><input class="input" name="kOi" value="${esc(base.kerato?.oi || '')}"></div>
            <div class="field full"><label>Antecedentes y hallazgos</label><textarea class="input textarea" name="history" rows="2">${esc(base.history || '')}</textarea></div>
          </div></details>

        <div class="section-title">${icon('clipboard')} Diagnóstico <small class="t-sub" data-dxhint></small></div>
        <div class="chips chips-wrap" data-dx>${Object.entries(DIAGNOSES).map(([k, l]) => `<button type="button" class="chip ${dx.has(k) ? 'on' : ''}" data-d="${k}">${esc(l)}</button>`).join('')}</div>
        <input class="input" name="diagnosisNote" value="${esc(base.diagnosisNote || '')}" placeholder="Observación del diagnóstico (opcional)">

        <div class="section-title">${icon('glasses')} Recomendación</div>
        <div class="form-grid form-grid-3">
          <div class="field"><label>Tipo de cristal</label><select class="input select" name="lensType">${Object.entries(LENS_TYPES).map(([k, v]) => `<option value="${k}" ${(base.lensType || '') === k ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}</select></div>
          <div class="field"><label>Material</label><select class="input select" name="material">${Object.entries(LENS_MATERIALS).map(([k, v]) => `<option value="${k}" ${(base.material || '') === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></div>
          <div class="field"><label>Uso</label><select class="input select" name="use">${Object.entries(LENS_USE).map(([k, v]) => `<option value="${k}" ${(base.use || 'permanente') === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></div>
        </div>
        <div class="chips chips-wrap">${store.treatments.map((t) => `<button type="button" class="chip ${tr.has(t.id) ? 'on' : ''}" data-tr="${t.id}">${esc(t.name)}</button>`).join('')}</div>
        <div class="form-grid">
          <div class="field"><label>Próximo control en</label><select class="input select" name="months">${[3, 6, 12, 18, 24].map((n) => `<option value="${n}" ${Number(base.nextControlMonths || 12) === n ? 'selected' : ''}>${n} meses</option>`).join('')}</select></div>
          <label class="check box box-white" style="align-self:end"><input type="checkbox" name="refer" ${base.refer ? 'checked' : ''}> <span><b>Referir a oftalmología</b><br><small class="muted">Sale indicado en la fórmula impresa.</small></span></label>
          <div class="field full"><label>Indicaciones</label><textarea class="input textarea" name="notes" rows="2" placeholder="Ej.: uso permanente, pausas activas frente a la pantalla (20-20-20)">${esc(base.notes || '')}</textarea></div>
        </div>
        <div class="error-msg" data-err></div>
      </form>`,
      footer: `<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary btn-lg" data-ok>${icon('check')} ${exam ? 'Guardar cambios' : 'Guardar examen'}</button>`,
      onClose: () => { if (!done) resolve(null); }
    });
    const F = m.el.querySelector('[data-f]');
    const $ = (q) => m.el.querySelector(q);
    let kind = base.kind || 'lentes';
    const readEye = (k) => {
      const row = m.el.querySelector(`[data-eye="${k}"]`);
      const g = (f) => row.querySelector(`[data-f="${f}"]`).value;
      const av = (f) => m.el.querySelector(`[data-av="${k}.${f}"]`).value;
      return { sph: parseDiop(g('sph')), cyl: parseDiop(g('cyl')), axis: parseAxis(g('axis')), add: parseDiop(g('add')), dp: Number(String(g('dp')).replace(',', '.')) || null, height: Number(String(g('height')).replace(',', '.')) || null, av: av('av'), avcc: av('avcc') };
    };
    const readPrism = () => {
      const out = {}; const t = F.elements.prism.value.toUpperCase();
      for (const k of ['OD', 'OI']) { const r = new RegExp(`${k}\\s*([\\d.,]+)\\s*(BI|BE|BS|BA|BN|BT)?`).exec(t); if (r) out[k.toLowerCase()] = { prism: Number(r[1].replace(',', '.')) || null, base: r[2] || '' }; }
      return out;
    };
    const readRx = () => {
      const pr = readPrism();
      const od = { ...readEye('od'), ...(pr.od || {}) }; const oi = { ...readEye('oi'), ...(pr.oi || {}) };
      const dp = Number(String(F.elements.dp.value).replace(',', '.')) || ((od.dp && oi.dp) ? od.dp + oi.dp : null);
      return { od, oi, dp, dpNear: Number(String(F.elements.dpNear.value).replace(',', '.')) || null };
    };
    const live = () => {
      const rx = readRx();
      const errs = [...eyeErrors(rx.od, 'OD'), ...eyeErrors(rx.oi, 'OI')];
      m.el.querySelectorAll('.rx-in').forEach((i) => i.classList.remove('bad'));
      for (const k of ['od', 'oi']) {
        const row = m.el.querySelector(`[data-eye="${k}"]`); const e = rx[k];
        if (e.sph != null && isNaN(e.sph)) row.querySelector('[data-f="sph"]').classList.add('bad');
        if (e.cyl != null && isNaN(e.cyl)) row.querySelector('[data-f="cyl"]').classList.add('bad');
        if (e.cyl && (e.axis == null || isNaN(e.axis) || e.axis < 0 || e.axis > 180)) row.querySelector('[data-f="axis"]').classList.add('bad');
      }
      const se = ['od', 'oi'].map((k) => rx[k].sph != null || rx[k].cyl != null ? `${k.toUpperCase()} ${fmtDiop(spherEq(rx[k]))}` : '').filter(Boolean);
      const pos = ['od', 'oi'].filter((k) => rx[k].cyl > 0);
      $('[data-live]').innerHTML = `${se.length ? `<span>${icon('scale')} Equivalente esférico: <b>${esc(se.join(' · '))}</b></span>` : ''}${pos.length ? `<span class="text-warning">${icon('info')} Cilindro positivo en ${pos.join(' y ').toUpperCase()}: el laboratorio lo recibe transpuesto (botón Transponer).</span>` : ''}${errs.length ? `<span class="text-danger">${icon('alert')} ${esc(errs[0])}</span>` : ''}`;
      if (!dxTouched) {
        const sug = suggestDiagnosis(rx, age);
        dx.clear(); sug.forEach((d) => dx.add(d));
        m.el.querySelectorAll('[data-d]').forEach((b) => b.classList.toggle('on', dx.has(b.dataset.d)));
        $('[data-dxhint]').textContent = sug.length ? '· sugerido según la graduación' : '';
        if (!exam) { F.elements.lensType.value = kind === 'contacto' ? 'contacto' : suggestLensType(rx, age); F.elements.material.value = suggestMaterial(rx); }
      }
    };
    // Formato al salir de cada casilla: +1,25 / -0,50 / ejes enteros
    m.el.querySelectorAll('[data-eye] .rx-in').forEach((i) => {
      i.addEventListener('input', live);
      i.addEventListener('blur', () => {
        const f = i.dataset.f;
        if (['sph', 'cyl', 'add'].includes(f)) { const v = parseDiop(i.value); if (v != null && !isNaN(v)) i.value = f === 'sph' && v === 0 ? '0,00' : fv(v); }
        if (f === 'axis') { const v = parseAxis(i.value); if (v != null && !isNaN(v)) i.value = String(v === 0 ? 180 : v); }
        if (f === 'add' && i.closest('[data-eye="od"]')) { const oi = m.el.querySelector('[data-eye="oi"] [data-f="add"]'); if (!oi.value && i.value) oi.value = i.value; }
        live();
      });
    });
    ['dp', 'dpNear', 'prism'].forEach((n) => F.elements[n].addEventListener('input', live));
    m.el.querySelectorAll('[data-sym]').forEach((b) => b.onclick = () => { const s = b.dataset.sym; sym.has(s) ? sym.delete(s) : sym.add(s); b.classList.toggle('on'); });
    m.el.querySelectorAll('[data-d]').forEach((b) => b.onclick = () => { dxTouched = true; const d = b.dataset.d; dx.has(d) ? dx.delete(d) : dx.add(d); b.classList.toggle('on'); $('[data-dxhint]').textContent = ''; });
    m.el.querySelectorAll('[data-tr]').forEach((b) => b.onclick = () => { const t = b.dataset.tr; tr.has(t) ? tr.delete(t) : tr.add(t); b.classList.toggle('on'); });
    m.el.querySelectorAll('[data-k]').forEach((b) => b.onclick = () => { kind = b.dataset.k; m.el.querySelectorAll('[data-k]').forEach((x) => x.classList.toggle('on', x === b)); $('[data-cl]').hidden = kind !== 'contacto'; if (kind === 'contacto') F.elements.lensType.value = 'contacto'; else if (F.elements.lensType.value === 'contacto') F.elements.lensType.value = 'monofocal'; });
    $('[data-copy]').onclick = () => { const s = m.el.querySelector('[data-eye="od"]'); const t = m.el.querySelector('[data-eye="oi"]'); s.querySelectorAll('[data-f]').forEach((i) => { if (i.dataset.f !== 'dp' && i.dataset.f !== 'height') t.querySelector(`[data-f="${i.dataset.f}"]`).value = i.value; }); live(); };
    $('[data-minus]').onclick = () => {
      let n = 0;
      for (const k of ['od', 'oi']) {
        const e = readEye(k); if (!(e.cyl > 0)) continue;
        const t = toMinusCyl(e); const row = m.el.querySelector(`[data-eye="${k}"]`);
        row.querySelector('[data-f="sph"]').value = fv(t.sph); row.querySelector('[data-f="cyl"]').value = fv(t.cyl); row.querySelector('[data-f="axis"]').value = String(t.axis); n++;
      }
      toast(n ? 'Fórmula transpuesta a cilindro negativo' : 'No hay cilindros positivos que transponer', n ? 'success' : 'info'); live();
    };
    $('[data-copyprev]')?.addEventListener('click', () => {
      for (const k of ['od', 'oi']) {
        const e = prev.rx?.[k] || {}; const row = m.el.querySelector(`[data-eye="${k}"]`);
        row.querySelector('[data-f="sph"]').value = fv(e.sph); row.querySelector('[data-f="cyl"]').value = e.cyl ? fv(e.cyl) : ''; row.querySelector('[data-f="axis"]').value = e.axis ?? ''; row.querySelector('[data-f="add"]').value = e.add ? fv(e.add) : '';
        row.querySelector('[data-f="dp"]').value = e.dp ?? ''; row.querySelector('[data-f="height"]').value = e.height ?? '';
      }
      if (prev.rx?.dp) F.elements.dp.value = prev.rx.dp;
      live(); toast('Se copió la fórmula anterior: ajústala con lo que mediste hoy', 'info');
    });
    live();
    const go = async (ev) => {
      ev?.preventDefault();
      const err = $('[data-err]'); err.textContent = '';
      const E = F.elements;
      const rx = readRx();
      const contact = {};
      m.el.querySelectorAll('[data-cl-eye]').forEach((row) => { const k = row.dataset.clEye; contact[k] = {}; row.querySelectorAll('[data-c]').forEach((i) => { contact[k][i.dataset.c] = i.value; }); });
      const btn = $('[data-ok]'); setBusy(btn, true, 'Guardando…');
      try {
        const saved = await saveExam({
          patientId: p.id, date: E.date.value, kind, optometrist: E.optometrist.value, reason: [...sym, E.reasonText.value.trim()].filter(Boolean).join(' · '),
          rx, contact, pio: { od: E.pioOd.value, oi: E.pioOi.value }, kerato: { od: E.kOd.value, oi: E.kOi.value }, history: E.history.value,
          diagnosis: [...dx], diagnosisNote: E.diagnosisNote.value, lensType: E.lensType.value, material: E.material.value, use: E.use.value, treatments: [...tr],
          nextControlMonths: Number(E.months.value), refer: E.refer.checked, notes: E.notes.value
        }, exam?.id || null);
        done = true; m.close(); resolve(saved);
        if (!exam) examDone(saved); else toast('Examen actualizado');
      } catch (ex) { err.textContent = ex.message; setBusy(btn, false); err.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    };
    F.onsubmit = go; $('[data-ok]').onclick = go;
  });
}

function examDone(ex) {
  const p = store.patient(ex.patientId);
  const m = openModal({
    size: 'sm',
    body: `<div class="center stack" style="padding:16px 0 4px;align-items:center">
      <div class="kpi-icon tone-success" style="width:64px;height:64px;border-radius:20px">${icon('eyeTest')}</div>
      <div><div class="muted small">Examen guardado · ${esc(ex.number)}</div><div style="font-size:20px;font-weight:800">${esc(p?.name || ex.patientName)}</div></div>
      <div class="mono small">OD ${esc(eyeText(ex.rx?.od))}<br>OI ${esc(eyeText(ex.rx?.oi))}</div>
      <div class="t-sub">Próximo control: ${fmtDate(ex.nextControl)}</div>
    </div>`,
    footer: `<button class="btn btn-secondary" data-pr>${icon('print')} Fórmula</button>${p?.phone ? `<button class="btn btn-whatsapp" data-wa>${icon('whatsapp')} Enviar</button>` : ''}<button class="btn btn-primary" data-ord>${icon('glasses')} Crear orden de lentes</button>`
  });
  m.el.querySelector('[data-pr]').onclick = () => printRx(ex);
  m.el.querySelector('[data-wa]')?.addEventListener('click', () => waPatient('formula', { patient: p, exam: ex }));
  m.el.querySelector('[data-ord]').onclick = async () => { m.close(); const { orderForm } = await import('./order.js'); orderForm({ patient: p, exam: ex }); };
}
export { loc };
