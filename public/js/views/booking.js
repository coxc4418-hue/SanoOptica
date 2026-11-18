// SanoÓptica — Agenda en línea (pública): el paciente elige motivo, día y hora libre
import { db, collection, addDoc } from '../firebase.js';
import { getBooking, getPortal } from '../store.js';
import { esc, usd, fmtDate, fromKey, dayKey, addDays, applyLocale, setFx, todayKey, waLink } from '../utils.js';
import { icon } from '../icons.js';
import { APPT_REASONS, daySlots, fmtHour, toMin } from '../optica.js';

const DSHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export async function mount(el) {
  const code = (location.pathname.split('/')[2] || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const pCode = (new URLSearchParams(location.search).get('p') || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  el.innerHTML = `<div class="portal-page"><div class="portal-load">${icon('calendar')}<p>Cargando la agenda…</p></div></div>`;
  document.title = 'Agenda tu cita · SanoÓptica';
  let b = null; let me = null;
  try { [b, me] = await Promise.all([code ? getBooking(code) : null, pCode ? getPortal(pCode).catch(() => null) : null]); } catch (e) { console.warn(e); }
  if (!b || b.active === false) {
    el.innerHTML = `<div class="portal-page"><div class="verify-card card center"><span class="kpi-icon tone-warning" style="width:64px;height:64px;margin:0 auto">${icon('calendar')}</span><h2>${b ? 'Agenda no disponible' : 'Agenda no encontrada'}</h2><p class="t-sub">${b ? `${esc(b.business)} no está recibiendo citas en línea en este momento.` : 'Revisa que el enlace esté completo.'}</p>${b?.phone ? `<a class="btn btn-whatsapp" href="${waLink(b.phone, 'Hola, quiero agendar una cita.')}" target="_blank" rel="noopener">${icon('whatsapp')} Escribir a la óptica</a>` : ''}</div></div>`;
    return;
  }
  if (me && me.tenantId !== b.tenantId) me = null;
  applyLocale(b.country || 'VE', b.currency || null);
  setFx(b.rate ? { enabled: true, rate: b.rate, sym: b.fxSym || 'Bs' } : null);
  document.title = `Agenda tu cita · ${b.business}`;
  const st = { reason: 'examen', date: '', time: '' };
  const taken = (d) => new Set((b.taken || {})[d] || []);
  const free = (d) => { const now = new Date(); const nowMin = now.getHours() * 60 + now.getMinutes() + 30; const t = taken(d); return daySlots(b.hours, d).filter((x) => !t.has(x) && (d > todayKey() || toMin(x) > nowMin)); };
  const days = Array.from({ length: 30 }, (_, i) => dayKey(addDays(new Date(), i))).filter((d) => daySlots(b.hours, d).length);
  st.date = days.find((d) => free(d).length) || days[0] || '';

  const render = () => {
    const slots = st.date ? free(st.date) : [];
    const reasons = (b.reasons || Object.keys(APPT_REASONS)).filter((k) => APPT_REASONS[k]);
    el.innerHTML = `<div class="portal-page">
      <header class="portal-hero"><div class="portal-brand"><span class="portal-logo">${icon('glasses')}</span><div><b>${esc(b.business)}</b>${b.slogan ? `<small>${esc(b.slogan)}</small>` : ''}</div></div>
        <h1>Agenda tu cita 👓</h1><p>Elige el motivo, el día y la hora. La óptica te confirma por WhatsApp.${b.examFee ? ` Examen visual: <b>${usd(b.examFee)}</b>.` : ''}</p>
        ${b.address ? `<div class="portal-chips"><span>${icon('pin')} ${esc(b.address)}</span></div>` : ''}</header>
      <main class="portal-body">
        <section class="card"><b class="bk-step"><i>1</i> Motivo</b><div class="cat-pick mt-sm">${reasons.map((k) => `<label><input type="radio" name="reason" value="${k}" ${st.reason === k ? 'checked' : ''}><span>${icon(APPT_REASONS[k].icon)}${esc(APPT_REASONS[k].label)}</span></label>`).join('')}</div></section>
        <section class="card"><b class="bk-step"><i>2</i> Día</b><div class="day-tabs bk-days mt-sm">${days.map((d) => { const n = free(d).length; const dt = fromKey(d); return `<button data-d="${d}" class="${d === st.date ? 'on' : ''}" ${n ? '' : 'disabled'}>${DSHORT[dt.getDay()]}<b>${dt.getDate()}</b><small>${MONTHS[dt.getMonth()]}${n ? '' : ' · lleno'}</small></button>`; }).join('') || '<p class="t-sub">No hay días disponibles.</p>'}</div></section>
        <section class="card"><b class="bk-step"><i>3</i> Hora ${st.date ? `<span class="t-sub">· ${esc(fmtDate(st.date))}</span>` : ''}</b>${slots.length ? `<div class="slot-grid mt-sm">${slots.map((t) => `<button class="slot ${st.time === t ? 'on' : ''}" data-h="${t}">${fmtHour(t)}</button>`).join('')}</div>` : '<p class="t-sub">No quedan horas libres este día. Elige otro.</p>'}</section>
        <section class="card"><b class="bk-step"><i>4</i> Tus datos</b>
          <form class="stack mt-sm" data-f>
            <div class="form-grid"><div class="field"><label>Nombre y apellido</label><input class="input" name="name" maxlength="80" value="${esc(me?.name || '')}" autocomplete="name"></div>
            <div class="field"><label>WhatsApp</label><input class="input" name="phone" maxlength="20" inputmode="tel" autocomplete="tel" placeholder="0414 123 4567"></div>
            <div class="field"><label>Cédula (opcional)</label><input class="input" name="idDoc" maxlength="20"></div>
            <div class="field"><label>Comentario (opcional)</label><input class="input" name="note" maxlength="200" placeholder="Ej.: veo borroso de lejos"></div></div>
            <div class="error-msg" data-err></div>
            <button class="btn btn-primary btn-lg btn-block" data-ok ${st.time ? '' : 'disabled'}>${icon('check')} ${st.time ? `Pedir cita: ${esc(fmtDate(st.date))} · ${fmtHour(st.time)}` : 'Elige una hora'}</button></form></section>
      </main>
      <footer class="portal-by">${b.phone ? `<a class="btn btn-whatsapp" href="${waLink(b.phone, 'Hola, quiero agendar una cita.')}" target="_blank" rel="noopener">${icon('whatsapp')} Prefiero escribir</a>` : ''}<div class="t-sub">Hecho con <b>SanoÓptica</b></div></footer></div>`;
    el.querySelectorAll('[name=reason]').forEach((r) => r.onchange = () => { st.reason = r.value; });
    el.querySelectorAll('[data-d]').forEach((x) => x.onclick = () => { st.date = x.dataset.d; st.time = ''; keep(); render(); });
    el.querySelectorAll('[data-h]').forEach((x) => x.onclick = () => { st.time = x.dataset.h; keep(); render(); el.querySelector('[data-f]').scrollIntoView({ behavior: 'smooth', block: 'center' }); });
    restore();
    el.querySelector('[data-f]').onsubmit = submit;
  };
  let draft = {};
  const keep = () => { const F = el.querySelector('[data-f]')?.elements; if (F) draft = { name: F.name.value, phone: F.phone.value, idDoc: F.idDoc.value, note: F.note.value }; };
  const restore = () => { const F = el.querySelector('[data-f]').elements; for (const [k, v] of Object.entries(draft)) if (v) F[k].value = v; };
  async function submit(e) {
    e.preventDefault();
    const F = e.target.elements; const err = el.querySelector('[data-err]'); err.textContent = '';
    const name = F.name.value.trim(); const phone = F.phone.value.replace(/[^\d+]/g, '');
    if (name.length < 3) { err.textContent = 'Escribe tu nombre y apellido.'; return; }
    if (phone.replace(/\D/g, '').length < 7) { err.textContent = 'Escribe un número de WhatsApp válido.'; return; }
    if (!st.time) { err.textContent = 'Elige una hora.'; return; }
    const btn = el.querySelector('[data-ok]'); btn.disabled = true; btn.textContent = 'Enviando…';
    try {
      await addDoc(collection(db, 'inbox'), { type: 'cita', tenantId: b.tenantId, code: b.code, who: me?.who || '', name: name.slice(0, 80), phone: phone.slice(0, 20), idDoc: F.idDoc.value.trim().slice(0, 20), reason: st.reason, date: st.date, time: st.time, note: F.note.value.trim().slice(0, 200), status: 'nueva', createdAt: new Date().toISOString() });
      el.innerHTML = `<div class="portal-page"><div class="verify-card card center"><span class="kpi-icon tone-success" style="width:72px;height:72px;border-radius:22px;margin:0 auto">${icon('checkCircle')}</span><h2>¡Cita solicitada!</h2>
        <p><b>${esc(APPT_REASONS[st.reason]?.label || '')}</b><br>${esc(fmtDate(st.date))} · ${fmtHour(st.time)}</p><p class="t-sub">${esc(b.business)} te confirmará por WhatsApp al ${esc(phone)}.</p>
        ${b.phone ? `<a class="btn btn-whatsapp" href="${waLink(b.phone, `Hola, soy ${name}. Acabo de pedir una cita para el ${fmtDate(st.date)} a las ${fmtHour(st.time)}.`)}" target="_blank" rel="noopener">${icon('whatsapp')} Avisar por WhatsApp</a>` : ''}
        ${pCode ? `<a class="btn btn-ghost mt" href="/paciente/${esc(pCode)}">Volver a mi portal</a>` : ''}</div></div>`;
    } catch (ex) { console.warn(ex); err.textContent = 'No se pudo enviar. Revisa tu conexión e intenta de nuevo.'; btn.disabled = false; btn.textContent = 'Pedir cita'; }
  }
  render();
}
