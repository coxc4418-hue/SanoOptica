// SanoÓptica — Agenda: citas del día, horas libres, citas pedidas en línea y enlace para agendar
import { store } from '../store.js';
import { esc, emptyState, toast, openModal, setBusy, todayKey, dayKey, addDays, fromKey, fmtDate, fmtLongDate, confirmDialog, promptDialog } from '../utils.js';
import { icon } from '../icons.js';
import { APPT_REASONS, APPT_STATUS, badge, fmtHour, daySlots } from '../optica.js';
import { saveAppointment, setApptStatus, acceptBooking, setInbox, ensureBookingCode, slotTaken } from '../ops.js';
import { pickPatient, openPatient } from '../patient.js';
import { waPatient, BOOKING_URL, qrDataURL } from '../shared.js';

const DSHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

export function appointmentForm(a0 = null, preset = {}) {
  return new Promise((resolve) => {
    const a = { date: todayKey(), reason: 'examen', ...preset, ...(a0 || {}) };
    let p = a.patientId ? store.patient(a.patientId) : null;
    let done = false;
    const m = openModal({
      title: a0 ? 'Editar cita' : 'Nueva cita', size: 'md',
      body: `<form class="stack" data-f>
        <div class="field"><label>Paciente</label><div class="row" style="gap:6px"><div class="input grow" data-pn style="display:flex;align-items:center">${p ? esc(p.name) : '<span class="muted">Elegir paciente…</span>'}</div><button type="button" class="btn btn-secondary" data-pick>${icon('search')}</button></div></div>
        <div class="form-grid" data-new ${p ? 'hidden' : ''}><div class="field"><label>O escribe el nombre</label><input class="input" name="name" value="${esc(a.name || '')}" placeholder="Paciente nuevo"></div><div class="field"><label>Teléfono</label><input class="input" name="phone" value="${esc(a.phone || '')}" inputmode="tel"></div></div>
        <div class="field"><label>Motivo</label><div class="cat-pick">${Object.entries(APPT_REASONS).map(([k, r]) => `<label><input type="radio" name="reason" value="${k}" ${a.reason === k ? 'checked' : ''}><span>${icon(r.icon)}${esc(r.label)}</span></label>`).join('')}</div></div>
        <div class="form-grid"><div class="field"><label>Fecha</label><input class="input" type="date" name="date" value="${esc(a.date)}" min="${a0 ? '' : todayKey()}"></div><div class="field"><label>Hora</label><select class="input select" name="time" data-time></select></div></div>
        <div class="field"><label>Notas</label><input class="input" name="notes" value="${esc(a.notes || '')}" placeholder="Ej.: trae sus lentes actuales"></div>
        <div class="error-msg" data-err></div></form>`,
      footer: `<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" data-ok>${icon('check')} ${a0 ? 'Guardar' : 'Agendar'}</button>`,
      onClose: () => { if (!done) resolve(null); }
    });
    const F = m.el.querySelector('[data-f]').elements;
    const times = () => {
      const d = F.date.value;
      const list = daySlots(store.settings.hours, d);
      const all = [...new Set([...list, ...(a.time && d === a.date ? [a.time] : [])])].sort();
      m.el.querySelector('[data-time]').innerHTML = all.length ? all.map((t) => { const busy = slotTaken(d, t, a0?.id) && t !== a.time; return `<option value="${t}" ${t === a.time ? 'selected' : ''} ${busy ? 'disabled' : ''}>${fmtHour(t)}${busy ? ' · ocupada' : ''}</option>`; }).join('') : '<option value="">Día sin atención</option>';
      if (!a.time) { const first = [...m.el.querySelector('[data-time]').options].find((o) => !o.disabled && o.value); if (first) first.selected = true; }
    };
    F.date.onchange = times; times();
    m.el.querySelector('[data-pick]').onclick = async () => { const np = await pickPatient({ title: 'Paciente de la cita' }); if (np) { p = np; m.el.querySelector('[data-pn]').textContent = np.name; m.el.querySelector('[data-new]').hidden = true; } };
    m.el.querySelector('[data-ok]').onclick = async (e) => {
      const err = m.el.querySelector('[data-err]'); err.textContent = '';
      const btn = e.currentTarget; setBusy(btn, true);
      try {
        const r = await saveAppointment({ patientId: p?.id || '', name: F.name.value, phone: F.phone.value, reason: [...F.reason].find((x) => x.checked)?.value || 'examen', date: F.date.value, time: F.time.value, notes: F.notes.value, status: a0?.status || 'confirmada' }, a0?.id || null);
        done = true; m.close(); resolve(r);
        toast(a0 ? 'Cita actualizada' : 'Cita agendada');
        if (!a0 && (p?.phone || r.phone)) { if (await confirmDialog({ title: 'Cita agendada', message: '¿Envías la confirmación por WhatsApp?', confirmText: 'Enviar' })) waPatient('cita', { patient: p || { name: r.name, phone: r.phone }, appt: r }); }
      } catch (ex) { err.textContent = ex.message; setBusy(btn, false); }
    };
  });
}

export function mount(el, { params = {} }) {
  let tab = params.tab || (store.newBookings.length ? 'solicitudes' : 'dia');
  let day = params.date || todayKey();
  el.innerHTML = `
    <div class="view-header"><div><h1 class="view-title">Agenda de citas</h1><p class="view-sub">Exámenes, controles, adaptación de lentes de contacto y entregas.</p></div>
      <div class="view-actions"><button class="btn btn-primary" id="a-new">${icon('plus')} Nueva cita</button><button class="btn btn-secondary" id="a-share">${icon('link')} Agenda en línea</button></div></div>
    <div class="tabs" id="a-tabs"></div>
    <div id="a-body" class="mt"></div>`;
  const $ = (s) => el.querySelector(s);
  $('#a-new').onclick = () => appointmentForm(null, { date: day >= todayKey() ? day : todayKey() });
  $('#a-share').onclick = () => shareBooking();

  function tabs() {
    const n = store.newBookings.length;
    $('#a-tabs').innerHTML = [['dia', 'Por día'], ['proximas', `Próximas (${store.upcoming.length})`], ['solicitudes', `En línea${n ? ` <span class="tab-n">${n}</span>` : ''}`]].map(([k, l]) => `<button data-t="${k}" class="${tab === k ? 'on' : ''}">${l}</button>`).join('');
    el.querySelectorAll('[data-t]').forEach((b) => b.onclick = () => { tab = b.dataset.t; draw(); });
  }
  const row = (a, withDate = false) => `<div class="list-item appt-row ${a.status === 'cancelada' ? 'is-void' : ''}"><span class="class-time" style="--gc:var(--brand)"><b>${fmtHour(a.time)}</b><small>${withDate ? esc(fmtDate(a.date)) : esc(DSHORT[fromKey(a.date).getDay()])}</small></span>
    <div class="grow" style="min-width:0"><button class="linkish ellipsis" data-pp="${a.patientId || ''}"><b>${esc(a.name)}</b></button><div class="t-sub ellipsis">${icon(APPT_REASONS[a.reason]?.icon || 'calendar')} ${esc(APPT_REASONS[a.reason]?.label || '')}${a.phone ? ` · ${esc(a.phone)}` : ''}${a.source === 'en_linea' ? ' · <span class="text-brand">en línea</span>' : ''}${a.notes ? ` · ${esc(a.notes)}` : ''}</div></div>
    ${badge(APPT_STATUS, a.status)}
    <div class="row" style="gap:4px;flex-wrap:nowrap">
      ${['pendiente', 'confirmada'].includes(a.status) && ['examen', 'control', 'contacto', 'ninos'].includes(a.reason) ? `<button class="btn btn-primary btn-icon btn-sm" data-ex="${a.id}" title="Atender: examen visual">${icon('eyeTest')}</button>` : ''}
      ${['pendiente', 'confirmada'].includes(a.status) ? `<button class="btn btn-success btn-icon btn-sm" data-done="${a.id}" title="Marcar atendida">${icon('check')}</button>` : ''}
      ${a.phone ? `<button class="btn btn-whatsapp btn-icon btn-sm" data-wa="${a.id}" title="Recordar por WhatsApp">${icon('whatsapp')}</button>` : ''}
      <button class="btn btn-ghost btn-icon btn-sm" data-more="${a.id}" title="Más">${icon('edit')}</button></div></div>`;

  function dia() {
    const week = Array.from({ length: 14 }, (_, i) => dayKey(addDays(new Date(), i - 2)));
    const slots = daySlots(store.settings.hours, day);
    const appts = store.appointments.filter((a) => a.date === day).sort((a, b) => a.time.localeCompare(b.time));
    const busy = new Set(appts.filter((a) => !['cancelada', 'no_asistio'].includes(a.status)).map((a) => a.time));
    const free = slots.filter((t) => !busy.has(t));
    $('#a-body').innerHTML = `<div class="day-tabs" id="a-days">${week.map((d) => { const n = store.appointmentsOn(d).length; return `<button data-d="${d}" class="${d === day ? 'on' : ''} ${d === todayKey() ? 'is-today' : ''}">${DSHORT[fromKey(d).getDay()]}<small>${d.slice(8)}${n ? ` · ${n}` : ''}</small></button>`; }).join('')}<input type="date" class="input" id="a-date" value="${day}" style="max-width:160px"></div>
      <div class="grid-2-1 mt">
        <div class="card"><div class="card-head"><div class="card-title">${icon('calendar')} ${esc(fmtLongDate(fromKey(day)))}</div><span class="t-sub">${appts.length} cita(s)</span></div>
          ${appts.length ? `<div class="list">${appts.map((a) => row(a)).join('')}</div>` : emptyState('calendar', 'Sin citas', slots.length ? 'Toca una hora libre para agendar.' : 'La óptica no atiende este día (ver Configuración › Horario).')}</div>
        <div class="card"><div class="card-head"><div class="card-title">${icon('clock')} Horas libres</div><span class="t-sub">${free.length} de ${slots.length}</span></div>
          ${free.length ? `<div class="slot-grid">${slots.map((t) => `<button class="slot ${busy.has(t) ? 'busy' : ''}" ${busy.has(t) ? 'disabled' : ''} data-slot="${t}">${fmtHour(t)}</button>`).join('')}</div>` : `<p class="t-sub">${slots.length ? 'Día completo.' : 'Día sin atención.'}</p>`}</div>
      </div>`;
    el.querySelectorAll('[data-d]').forEach((b) => b.onclick = () => { day = b.dataset.d; dia(); });
    $('#a-date').onchange = (e) => { if (e.target.value) { day = e.target.value; dia(); } };
    el.querySelectorAll('[data-slot]').forEach((b) => b.onclick = () => appointmentForm(null, { date: day, time: b.dataset.slot }));
    bindRows();
  }
  function proximas() {
    const list = store.upcoming;
    $('#a-body').innerHTML = `<div class="card card-flush">${list.length ? `<div class="list" style="padding:6px 10px">${list.map((a) => row(a, true)).join('')}</div>` : `<div class="pd-3">${emptyState('calendar', 'Sin citas próximas', 'Agenda una cita o comparte tu enlace de agenda en línea.')}</div>`}</div>`;
    bindRows();
  }
  function solicitudes() {
    const list = store.newBookings;
    const done = store.inboxOf('cita', ['procesada', 'rechazada']).slice(0, 12);
    $('#a-body').innerHTML = `${list.length ? `<div class="grid-cards">${list.map((x) => `<div class="card rep-card"><div class="between"><b>${esc(x.name)}</b><span class="badge badge-info">Nueva</span></div>
        <div class="t-sub">${icon(APPT_REASONS[x.reason]?.icon || 'calendar')} ${esc(APPT_REASONS[x.reason]?.label || 'Consulta')}</div>
        <div class="rep-amt"><b>${esc(fmtDate(x.date))}</b><small>${esc(fmtHour(x.time))}${slotTaken(x.date, x.time) ? ' · <span class="text-danger">hora ocupada</span>' : ''}</small></div>
        <div class="t-sub">${esc(x.phone || '')}${x.idDoc ? ` · ${esc(x.idDoc)}` : ''}${x.who ? ' · <span class="text-brand">paciente registrado</span>' : ''}</div>${x.note ? `<div class="box small">${esc(x.note)}</div>` : ''}
        <div class="row mt-sm" style="gap:6px"><button class="btn btn-success btn-sm grow" data-acc="${x.id}">${icon('check')} Confirmar</button><button class="btn btn-ghost btn-sm" data-rej="${x.id}">${icon('x')} Rechazar</button></div></div>`).join('')}</div>`
      : `<div class="card">${emptyState('inbox', 'Sin solicitudes nuevas', 'Comparte tu enlace de agenda en línea (botón de arriba): los pacientes eligen día y hora libre y la cita llega aquí.')}</div>`}
      ${done.length ? `<div class="section-title mt-lg">Atendidas recientemente</div><div class="card card-flush"><div class="list" style="padding:6px 10px">${done.map((x) => `<div class="list-item"><div class="grow"><b>${esc(x.name)}</b><div class="t-sub">${fmtDate(x.date)} ${fmtHour(x.time)} · ${esc(APPT_REASONS[x.reason]?.label || '')}</div></div><span class="badge badge-${x.status === 'procesada' ? 'success' : 'neutral'}">${x.status === 'procesada' ? 'Confirmada' : 'Rechazada'}</span></div>`).join('')}</div></div>` : ''}`;
    el.querySelectorAll('[data-acc]').forEach((b) => b.onclick = async () => {
      const x = store.inbox.find((i) => i.id === b.dataset.acc);
      setBusy(b, true);
      try {
        let item = x;
        if (slotTaken(x.date, x.time)) {
          const t = await promptDialog({ title: 'Hora ocupada', label: 'Escribe otra hora (HH:MM) para esta cita', value: x.time });
          if (!t) { setBusy(b, false); return; }
          item = { ...x, time: t };
        }
        const r = await acceptBooking(item);
        toast('Cita confirmada');
        if (await confirmDialog({ title: 'Cita confirmada', message: `¿Le confirmas a ${x.name.split(' ')[0]} por WhatsApp?`, confirmText: 'Enviar' })) waPatient('cita', { patient: r.patient || { name: x.name, phone: x.phone }, appt: r.appointment });
      } catch (e) { toast(e.message, 'warning'); setBusy(b, false); }
    });
    el.querySelectorAll('[data-rej]').forEach((b) => b.onclick = async () => {
      const x = store.inbox.find((i) => i.id === b.dataset.rej);
      const r = await promptDialog({ title: 'Rechazar cita', label: 'Motivo (lo verá el paciente si tiene portal)', value: 'No tenemos disponibilidad a esa hora. Escríbenos para darte otra.' });
      if (r == null) return;
      await setInbox(x, { status: 'rechazada', reply: r }); toast('Solicitud rechazada');
    });
  }
  function bindRows() {
    el.querySelectorAll('#a-body [data-pp]').forEach((b) => b.onclick = () => { if (b.dataset.pp) openPatient(b.dataset.pp); });
    el.querySelectorAll('#a-body [data-done]').forEach((b) => b.onclick = async () => { await setApptStatus(store.appointments.find((a) => a.id === b.dataset.done), 'atendida'); toast('Cita atendida'); });
    el.querySelectorAll('#a-body [data-ex]').forEach((b) => b.onclick = async () => {
      const a = store.appointments.find((x) => x.id === b.dataset.ex);
      let p = a.patientId ? store.patient(a.patientId) : null;
      if (!p) { const { patientForm } = await import('../patient.js'); p = await patientForm(null, { name: a.name, phone: a.phone }); if (!p) return; await saveAppointment({ ...a, patientId: p.id }, a.id, { force: true }); }
      const { examForm } = await import('../rx.js');
      if (await examForm({ patient: p })) setApptStatus(a, 'atendida');
    });
    el.querySelectorAll('#a-body [data-wa]').forEach((b) => b.onclick = () => { const a = store.appointments.find((x) => x.id === b.dataset.wa); waPatient(a.date > todayKey() ? 'recordarCita' : 'cita', { patient: store.patient(a.patientId) || { name: a.name, phone: a.phone }, appt: a }); });
    el.querySelectorAll('#a-body [data-more]').forEach((b) => b.onclick = () => moreMenu(store.appointments.find((x) => x.id === b.dataset.more)));
  }
  function moreMenu(a) {
    const m = openModal({
      title: esc(a.name), sub: `${fmtDate(a.date)} · ${fmtHour(a.time)} · ${esc(APPT_REASONS[a.reason]?.label || '')}`, size: 'sm',
      body: `<div class="stack-sm">${[['edit', 'Cambiar fecha u hora', 'edit'], ['confirmada', 'Marcar confirmada', 'check'], ['no_asistio', 'No asistió', 'userX'], ['cancelada', 'Cancelar cita', 'x']].map(([k, l, i]) => `<button class="btn btn-secondary btn-block" data-m="${k}" style="justify-content:flex-start">${icon(i)} ${l}</button>`).join('')}</div>`
    });
    m.el.querySelectorAll('[data-m]').forEach((b) => b.onclick = async () => { m.close(); if (b.dataset.m === 'edit') appointmentForm(a); else { await setApptStatus(a, b.dataset.m); toast('Cita actualizada'); } });
  }
  async function shareBooking() {
    const code = await ensureBookingCode();
    const url = BOOKING_URL() || `https://sano-optica.web.app/cita/${code}`;
    const qr = await qrDataURL(url, 6);
    const m = openModal({
      title: 'Agenda en línea', size: 'sm', sub: 'Compártelo en Instagram, WhatsApp o en tu vitrina: los pacientes eligen un día y una hora libres según tu horario y la cita te llega para confirmar.',
      body: `<div class="center stack" style="align-items:center"><img src="${qr}" alt="QR" width="220" height="220" style="image-rendering:pixelated;border-radius:12px;background:#fff;padding:6px"><input class="input input-ro small" readonly value="${esc(url)}"></div>`,
      footer: `<button class="btn btn-secondary" data-copy>${icon('copy')} Copiar</button><a class="btn btn-secondary" href="${esc(url)}" target="_blank" rel="noopener">${icon('external')} Abrir</a><a class="btn btn-whatsapp" href="https://wa.me/?text=${encodeURIComponent(`👓 Agenda tu examen visual en ${store.businessName}: ${url}`)}" target="_blank" rel="noopener">${icon('whatsapp')} Compartir</a>`
    });
    m.el.querySelector('[data-copy]').onclick = async () => { try { await navigator.clipboard.writeText(url); toast('Enlace copiado'); } catch (_) { toast('No se pudo copiar', 'warning'); } };
  }
  function draw() { tabs(); ({ dia, proximas, solicitudes })[tab](); }
  draw();
  const off = store.on('*', (evt) => { if (['appointments', 'inbox', 'settings'].includes(evt)) draw(); });
  return off;
}
