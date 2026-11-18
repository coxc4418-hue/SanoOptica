// SanoÓptica — Recordatorios: controles anuales, lentes sin retirar, saldos, cumpleaños y citas de mañana
import { store } from '../store.js';
import { esc, usd, emptyState, fmtDate, todayKey, dayKey, addDays } from '../utils.js';
import { icon } from '../icons.js';
import { daysTo, ageOf, orderBalance, waitingDays, fmtHour, APPT_REASONS } from '../optica.js';
import { patientAvatar, openPatient } from '../patient.js';
import { openOrder } from '../order.js';
import { waPatient } from '../shared.js';

const SENT_KEY = 'so_sent_reminders';
const sent = () => { try { return JSON.parse(localStorage.getItem(SENT_KEY) || '{}'); } catch (_) { return {}; } };
const markSent = (k) => { try { const s = sent(); s[k] = todayKey(); for (const [x, d] of Object.entries(s)) if (d < dayKey(addDays(new Date(), -45))) delete s[x]; localStorage.setItem(SENT_KEY, JSON.stringify(s)); } catch (_) { /* sin almacenamiento */ } };

export function mount(el, { params = {} }) {
  let tab = params.tab || 'controles';
  el.innerHTML = `
    <div class="view-header"><div><h1 class="view-title">Recordatorios</h1><p class="view-sub">Mensajes listos para WhatsApp: un toque y se abre el chat con el texto escrito. Lo enviado hoy queda marcado.</p></div></div>
    <div class="tabs" id="r-tabs"></div><div id="r-body" class="mt"></div>`;
  const $ = (s) => el.querySelector(s);
  const groups = () => {
    const tomorrow = dayKey(addDays(new Date(), 1));
    const days = Array.from({ length: 7 }, (_, i) => dayKey(addDays(new Date(), i)).slice(5));
    return {
      controles: { label: 'Controles', icon: 'eye', kind: 'control', list: store.controlsDue(30).map((p) => ({ key: 'c:' + p.id, p, title: p.name, sub: (() => { const d = daysTo(p.nextControl); return d < 0 ? `<b class="text-warning">Vencido hace ${-d} días</b> · último examen ${fmtDate(p.lastExamAt)}` : `Vence ${d === 0 ? 'hoy' : `en ${d} días`} (${fmtDate(p.nextControl)})`; })() })) },
      retirar: { label: 'Lentes sin retirar', icon: 'glasses', kind: 'lista', list: store.readyOrders.slice().sort((a, b) => waitingDays(b) - waitingDays(a)).map((o) => ({ key: 'l:' + o.id, o, p: store.patient(o.patientId) || { name: o.patientName, phone: o.patientPhone }, title: o.patientName, sub: `${esc(o.number)} · lista hace ${waitingDays(o)} día(s)${orderBalance(o) > 0.009 ? ` · resta <b class="text-danger">${usd(orderBalance(o))}</b>` : ''}` })) },
      saldos: { label: 'Saldos', icon: 'wallet', kind: 'recordatorio', list: store.openBalanceOrders.filter((o) => o.patientId && o.status !== 'lista').map((o) => ({ key: 's:' + o.id, o, p: store.patient(o.patientId) || { name: o.patientName }, title: o.patientName, sub: `${esc(o.number)} · debe <b class="text-danger">${usd(orderBalance(o))}</b> de ${usd(o.total)}` })) },
      citas: { label: 'Citas de mañana', icon: 'calendar', kind: 'recordarCita', list: store.appointmentsOn(tomorrow).filter((a) => ['pendiente', 'confirmada'].includes(a.status)).map((a) => ({ key: 'a:' + a.id, a, p: store.patient(a.patientId) || { name: a.name, phone: a.phone }, title: a.name, sub: `${fmtHour(a.time)} · ${esc(APPT_REASONS[a.reason]?.label || '')}` })) },
      cumple: { label: 'Cumpleaños', icon: 'cake', kind: 'cumple', list: store.activePatients.filter((p) => p.birthDate && days.includes(p.birthDate.slice(5))).sort((a, b) => days.indexOf(a.birthDate.slice(5)) - days.indexOf(b.birthDate.slice(5))).map((p) => ({ key: 'b:' + p.id + new Date().getFullYear(), p, title: p.name, sub: p.birthDate.slice(5) === todayKey().slice(5) ? '<b class="text-success">¡Hoy cumple ' + ageOf(p.birthDate) + '!</b>' : `${fmtDate(new Date().getFullYear() + p.birthDate.slice(4))} · cumple ${(ageOf(p.birthDate) || 0) + 1}` })) }
    };
  };
  function draw() {
    const g = groups(); const s = sent();
    $('#r-tabs').innerHTML = Object.entries(g).map(([k, x]) => `<button data-t="${k}" class="${tab === k ? 'on' : ''}">${esc(x.label)}${x.list.length ? ` <span class="tab-n">${x.list.length}</span>` : ''}</button>`).join('');
    el.querySelectorAll('[data-t]').forEach((b) => b.onclick = () => { tab = b.dataset.t; draw(); });
    const cur = g[tab];
    const pend = cur.list.filter((x) => !s[x.key]).length;
    $('#r-body').innerHTML = cur.list.length ? `<div class="t-sub mb">${pend} por enviar · ${cur.list.length - pend} enviados hoy</div><div class="card card-flush"><div class="list" style="padding:6px 10px">${cur.list.map((x, i) => `<div class="list-item ${s[x.key] ? 'is-sent' : ''}">${patientAvatar(x.p)}<div class="grow" style="min-width:0"><button class="linkish ellipsis" data-op="${i}"><b>${esc(x.title)}</b></button><div class="t-sub">${x.sub}</div></div>
      ${s[x.key] ? `<span class="badge badge-success">${icon('check')} Enviado</span>` : ''}
      ${(x.p?.phone || x.p?.guardianPhone || x.o?.patientPhone || x.a?.phone) ? `<button class="btn btn-whatsapp btn-sm" data-wa="${i}">${icon('whatsapp')}<span class="hide-xs"> ${s[x.key] ? 'Reenviar' : 'Enviar'}</span></button>` : '<span class="t-sub">sin teléfono</span>'}</div>`).join('')}</div></div>`
      : `<div class="card">${emptyState(cur.icon, 'Nada pendiente', { controles: 'Ningún control anual vence en los próximos 30 días.', retirar: 'No hay lentes esperando ser retirados.', saldos: 'No hay saldos pendientes por recordar.', citas: 'No hay citas para mañana.', cumple: 'Nadie cumple años esta semana.' }[tab])}</div>`;
    el.querySelectorAll('[data-wa]').forEach((b) => b.onclick = () => { const x = cur.list[Number(b.dataset.wa)]; waPatient(cur.kind, { patient: x.p?.id ? x.p : x.p, order: x.o, appt: x.a }); markSent(x.key); draw(); });
    el.querySelectorAll('[data-op]').forEach((b) => b.onclick = () => { const x = cur.list[Number(b.dataset.op)]; if (x.o) openOrder(x.o.id); else if (x.p?.id) openPatient(x.p.id); });
  }
  draw();
  const off = store.on('*', (evt) => { if (['patients', 'orders', 'appointments', 'payments'].includes(evt)) draw(); });
  return off;
}
