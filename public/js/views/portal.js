// SanoÓptica — Portal del paciente (público, sin sesión): sus lentes, su fórmula, su saldo y sus citas
import { db, collection, addDoc } from '../firebase.js';
import { getPortal } from '../store.js';
import { esc, loc, usd, num, fmtDate, fmtDateTime, applyLocale, setFx, parseNum, round2, todayKey, PAY_METHODS, methodLabel, waLink, toast } from '../utils.js';
import { icon } from '../icons.js';
import { FLOW, APPT_REASONS, fmtDiop, fmtAxis, LENS_TYPES, LENS_USE, fmtHour, daysTo } from '../optica.js';

const STEP = {
  registrada: { t: 'Pedido recibido', d: 'Tomamos tu pedido y tus medidas.', i: 'clipboard' },
  laboratorio: { t: 'En el laboratorio', d: 'Están tallando tus cristales a tu medida.', i: 'lab' },
  recibida: { t: 'Revisión de calidad', d: 'Verificamos la graduación y el montaje.', i: 'eye' },
  lista: { t: '¡Listos para retirar!', d: 'Pasa por la óptica cuando quieras.', i: 'checkCircle' },
  entregada: { t: 'Entregados', d: 'Que los disfrutes.', i: 'glasses' }
};
const BANK = { transferencia: 'Transferencia', pagomovil: 'Pago móvil', zelle: 'Zelle', efectivo: 'Efectivo', otro: 'Otro' };

export async function mount(el) {
  const code = (location.pathname.split('/')[2] || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  el.innerHTML = `<div class="portal-page"><div class="portal-load">${icon('glasses')}<p>Cargando tu portal…</p></div></div>`;
  document.title = 'Mis lentes · SanoÓptica';
  let d = null;
  try { d = code ? await getPortal(code) : null; } catch (e) { console.warn(e); }
  if (!d || d.kind !== 'paciente') { el.innerHTML = notFound('No encontramos este portal', 'Revisa que el enlace esté completo o pídele a tu óptica un enlace nuevo.'); return; }
  if (d.active === false) { el.innerHTML = notFound('Portal no disponible', `El portal de ${esc(d.business)} no está activo en este momento. Escríbele a la óptica.`, d.phone); return; }
  applyLocale(d.country || 'VE', d.currency || null);
  setFx(d.rate ? { enabled: true, rate: d.rate, sym: d.fxSym || 'Bs' } : null);
  document.title = `${d.name} · ${d.business}`;
  let tab = 'lentes';
  const reported = new Set();
  const active = (d.orders || []).filter((o) => o.kind !== 'venta' && o.status !== 'entregada');
  const ready = active.filter((o) => o.status === 'lista');

  const render = () => {
    el.innerHTML = `<div class="portal-page">
      <header class="portal-hero"><div class="portal-brand"><span class="portal-logo">${icon('glasses')}</span><div><b>${esc(d.business)}</b>${d.slogan ? `<small>${esc(d.slogan)}</small>` : ''}</div></div>
        <h1>Hola, ${esc(String(d.name).split(' ')[0])} 👋</h1>
        <p>${ready.length ? `<b>¡Tus lentes están listos!</b> Ya puedes pasar a retirarlos.` : active.length ? `Tienes ${active.length} pedido(s) en proceso. Aquí ves en qué paso va.` : 'Aquí tienes tu fórmula, tus pedidos y tus pagos.'}</p>
        <div class="portal-chips">${d.patientCode ? `<span>${icon('user')} ${esc(d.patientCode)}</span>` : ''}${d.balance > 0.009 ? `<span class="due">${icon('wallet')} Saldo ${usd(d.balance)}</span>` : `<span class="ok">${icon('check')} Al día</span>`}${d.nextControl ? `<span>${icon('calendar')} Control ${daysTo(d.nextControl) < 0 ? 'vencido' : fmtDate(d.nextControl)}</span>` : ''}</div></header>
      <nav class="portal-tabs">${[['lentes', 'Mis lentes', 'glasses'], ['formula', 'Mi fórmula', 'eyeTest'], ['pagos', 'Pagos', 'wallet'], ['citas', 'Citas', 'calendar']].map(([k, l, i]) => `<button data-t="${k}" class="${tab === k ? 'on' : ''}">${icon(i)}<span>${l}</span></button>`).join('')}</nav>
      <main class="portal-body">${({ lentes, formula, pagos, citas })[tab]()}</main>
      <footer class="portal-by">${d.phone ? `<a class="btn btn-whatsapp" href="${waLink(d.phone, `Hola, soy ${d.name}${d.patientCode ? ` (${d.patientCode})` : ''}.`)}" target="_blank" rel="noopener">${icon('whatsapp')} Escribir a la óptica</a>` : ''}
        <div class="t-sub">${esc([d.address, d.phone].filter(Boolean).join(' · '))}</div><div class="t-sub">Actualizado ${fmtDateTime(d.updatedAt)} · Hecho con <b>SanoÓptica</b></div></footer></div>`;
    el.querySelectorAll('[data-t]').forEach((b) => b.onclick = () => { tab = b.dataset.t; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
    bind();
  };

  function lentes() {
    const list = d.orders || [];
    if (!list.length) return emptyBox('glasses', 'Aún no tienes pedidos', 'Cuando encargues tus lentes podrás seguir aquí cada paso: laboratorio, revisión y entrega.');
    return list.map((o) => {
      const isSale = o.kind === 'venta';
      const idx = o.status === 'garantia' ? 1 : FLOW.indexOf(o.status);
      const at = (s) => (o.history || []).filter((h) => h.s === s).pop()?.at;
      return `<section class="card p-order ${o.status === 'lista' ? 'is-ready' : ''}">
        <div class="between"><div><b>${esc(o.number)}</b><div class="t-sub">${isSale ? 'Compra' : 'Pedido'} del ${fmtDate(o.date)}</div></div>${o.balance > 0.009 ? `<span class="badge badge-danger">Resta ${usd(o.balance)}</span>` : '<span class="badge badge-success">Pagado</span>'}</div>
        ${!isSale ? `<ol class="p-steps">${FLOW.map((s, i) => `<li class="${i < idx || o.status === 'entregada' ? 'done' : i === idx ? 'now' : ''}"><span>${icon(i < idx || o.status === 'entregada' ? 'check' : STEP[s].i)}</span><div><b>${STEP[s].t}</b><small>${at(s) ? fmtDate(at(s)) : i === idx ? STEP[s].d : ''}</small></div></li>`).join('')}</ol>
          ${o.status === 'garantia' ? `<div class="box small">${icon('refresh')} Tus lentes están en revisión por garantía. Te avisaremos al estar listos.</div>` : ''}
          ${o.promised && !['lista', 'entregada'].includes(o.status) ? `<div class="p-promise">${icon('calendar')} Fecha estimada: <b>${fmtDate(o.promised)}</b></div>` : ''}` : ''}
        <div class="p-detail">${o.frame ? `<div>${icon('frame')} ${esc(o.frame)}</div>` : ''}${o.lens ? `<div>${icon('lens')} ${esc(o.lens)}</div>` : ''}${!o.frame && !o.lens ? `<div>${icon('tag')} ${esc(o.items)}</div>` : ''}</div>
        <div class="kv kv-3"><div><span>Total</span><b>${usd(o.total)}</b></div><div><span>Abonado</span><b>${usd(o.paid)}</b></div><div><span>Resta</span><b class="${o.balance > 0.009 ? 'text-danger' : 'text-success'}">${usd(o.balance)}</b></div></div>
        ${o.warrantyUntil && o.status === 'entregada' ? `<div class="t-sub">${icon('shield')} Garantía hasta ${fmtDate(o.warrantyUntil)}</div>` : ''}
        ${o.balance > 0.009 && d.allow?.reports !== false ? `<button class="btn btn-primary btn-block" data-rep="${o.id}" ${reported.has(o.id) ? 'disabled' : ''}>${icon('send')} ${reported.has(o.id) ? 'Pago reportado' : 'Ya pagué: reportar pago'}</button>` : ''}
      </section>`;
    }).join('');
  }
  function formula() {
    const r = d.rx;
    if (!r) return emptyBox('eyeTest', 'Sin fórmula registrada', 'Tu fórmula aparecerá aquí después de tu examen visual.');
    const row = (k, e = {}) => `<tr><th><span class="eye-tag eye-${k}">${k.toUpperCase()}</span></th><td>${fmtDiop(e.sph)}</td><td>${e.cyl ? fmtDiop(e.cyl) : '—'}</td><td>${e.cyl ? fmtAxis(e.axis) : '—'}</td><td>${e.add ? fmtDiop(e.add) : '—'}</td></tr>`;
    return `<section class="card"><div class="between"><div><b>Fórmula ${esc(r.number)}</b><div class="t-sub">Examen del ${fmtDate(r.date)}${r.optometrist ? ' · ' + esc(r.optometrist) : ''}</div></div><span class="badge badge-success">${icon('shieldCheck')} Vigente</span></div>
      <div class="table-wrap mt"><table class="rx-table rx-pub"><thead><tr><th></th><th>Esfera</th><th>Cilindro</th><th>Eje</th><th>Adición</th></tr></thead><tbody>${row('od', r.od)}${row('oi', r.oi)}</tbody></table></div>
      <div class="kv kv-3 mt">${r.dp ? `<div><span>Distancia pupilar</span><b>${num(r.dp, 1)} mm</b></div>` : ''}${r.lensType ? `<div><span>Lente sugerido</span><b>${esc(LENS_TYPES[r.lensType]?.label || r.lensType)}</b></div>` : ''}${r.use ? `<div><span>Uso</span><b>${esc(LENS_USE[r.use] || r.use)}</b></div>` : ''}</div>
      <p class="t-sub mt">OD = ojo derecho · OI = ojo izquierdo. Puedes mostrar esta pantalla en cualquier óptica. ${r.verify ? `Verificación: <a class="text-brand" href="/formula/${esc(r.verify)}">/formula/${esc(r.verify)}</a>` : ''}</p>
      ${d.nextControl ? `<div class="box small">${icon('calendar')} Tu próximo control visual: <b>${fmtDate(d.nextControl)}</b>${daysTo(d.nextControl) < 0 ? ' · <b class="text-warning">ya está vencido</b>' : ''}</div>` : ''}</section>`;
  }
  function pagos() {
    const banks = d.banks || [];
    return `${d.balance > 0.009 ? `<section class="card p-balance"><span>Saldo pendiente</span><b>${usd(d.balance)}</b>${d.rate ? `<small>${esc(d.fxSym || 'Bs')} ${num(d.balance * d.rate, 2)} a tasa ${num(d.rate, 2)}</small>` : ''}</section>` : `<section class="card p-balance ok"><span>${icon('check')} Estás al día</span><b>${usd(0)}</b></section>`}
      ${banks.length && d.balance > 0.009 ? `<section class="card"><b>${icon('card')} Dónde pagar</b><div class="stack-sm mt-sm">${banks.map((b) => `<div class="box"><b>${esc(BANK[b.type] || b.type)}${b.bank ? ' · ' + esc(b.bank) : ''}</b><div class="mono small">${esc([b.number, b.phone, b.email].filter(Boolean).join(' · '))}</div><div class="t-sub">${esc([b.holder, b.idDoc].filter(Boolean).join(' · '))}</div></div>`).join('')}</div></section>` : ''}
      ${(d.reports || []).length ? `<section class="card"><b>${icon('send')} Pagos que reportaste</b><div class="list mt-sm">${d.reports.map((x) => `<div class="list-item"><div class="grow"><b>${usd(x.amount)}</b> · ${esc(x.order)}<div class="t-sub">${fmtDate(x.date)}${x.reply && x.status === 'rechazada' ? ' · ' + esc(x.reply) : ''}</div></div><span class="badge badge-${x.status === 'procesada' ? 'success' : x.status === 'rechazada' ? 'danger' : 'info'}">${x.status === 'procesada' ? 'Confirmado' : x.status === 'rechazada' ? 'Rechazado' : 'En revisión'}</span></div>`).join('')}</div></section>` : ''}
      <section class="card"><b>${icon('receipt')} Pagos recibidos</b>${(d.payments || []).length ? `<div class="list mt-sm">${d.payments.map((x) => `<div class="list-item"><div class="grow"><b>${usd(x.amount)}</b><div class="t-sub">${fmtDate(x.date)} · ${esc(methodLabel(x.method))} · ${esc(x.order)}</div></div><span class="t-sub">${esc(x.n)}</span></div>`).join('')}</div>` : '<p class="t-sub">Aún no hay pagos registrados.</p>'}</section>`;
  }
  function citas() {
    const ap = d.appointments || [];
    return `<section class="card"><b>${icon('calendar')} Tus próximas citas</b>${ap.length ? `<div class="list mt-sm">${ap.map((a) => `<div class="list-item"><span class="class-time" style="--gc:var(--brand)"><b>${fmtHour(a.time)}</b><small>${esc(fmtDate(a.date))}</small></span><div class="grow"><b>${esc(APPT_REASONS[a.reason]?.label || 'Cita')}</b><div class="t-sub">${a.status === 'pedida' ? 'Solicitada · esperando confirmación' : 'Confirmada'}</div></div></div>`).join('')}</div>` : '<p class="t-sub">No tienes citas agendadas.</p>'}
      ${d.bookingCode ? `<a class="btn btn-primary btn-block mt" href="/cita/${esc(d.bookingCode)}?p=${esc(d.code)}">${icon('plus')} Pedir una cita</a>` : ''}</section>`;
  }
  function bind() {
    el.querySelectorAll('[data-rep]').forEach((b) => b.onclick = () => reportForm((d.orders || []).find((o) => o.id === b.dataset.rep)));
  }
  function reportForm(o) {
    const wrap = document.createElement('div');
    wrap.className = 'p-sheet';
    const methods = Object.entries(PAY_METHODS).filter(([k]) => !/efectivo/.test(k));
    wrap.innerHTML = `<div class="p-sheet-card card"><div class="between"><b>Reportar pago · ${esc(o.number)}</b><button class="btn btn-ghost btn-icon btn-sm" data-x>${icon('x')}</button></div>
      <p class="t-sub">La óptica lo verifica con su banco y lo confirma. Resta ${usd(o.balance)}.</p>
      <form class="stack" data-f>
        <div class="form-grid"><div class="field"><label>Monto (${esc(loc().sym)})</label><input class="input input-lg" name="amount" inputmode="decimal" value="${num(o.balance)}"></div>
        <div class="field"><label>Forma de pago</label><select class="input select" name="method">${methods.map(([k, x]) => `<option value="${k}">${esc(x.label)}</option>`).join('')}</select></div>
        <div class="field"><label>Banco de origen</label><input class="input" name="bank" maxlength="60"></div>
        <div class="field"><label>N° de referencia</label><input class="input" name="reference" maxlength="40" inputmode="numeric"></div>
        <div class="field"><label>Fecha del pago</label><input class="input" type="date" name="date" value="${todayKey()}" max="${todayKey()}"></div>
        ${d.rate ? `<div class="field"><label>Monto en ${esc(d.fxSym || 'Bs')} (opcional)</label><input class="input" name="amountBs" inputmode="decimal" placeholder="${num(o.balance * d.rate, 2)}"></div>` : ''}</div>
        <div class="field"><label>Nota</label><input class="input" name="note" maxlength="200" placeholder="Opcional"></div>
        <div class="error-msg" data-err></div>
        <button class="btn btn-primary btn-lg btn-block" data-ok>${icon('send')} Enviar reporte</button></form></div>`;
    document.body.appendChild(wrap);
    const close = () => wrap.remove();
    wrap.querySelector('[data-x]').onclick = close;
    wrap.onclick = (e) => { if (e.target === wrap) close(); };
    wrap.querySelector('[data-f]').onsubmit = async (e) => {
      e.preventDefault();
      const F = e.target.elements; const err = wrap.querySelector('[data-err]'); err.textContent = '';
      const amount = round2(parseNum(F.amount.value));
      if (!(amount > 0)) { err.textContent = 'Escribe el monto que pagaste.'; return; }
      if (amount > o.balance + 0.009) { err.textContent = `El monto supera el saldo (${usd(o.balance)}).`; return; }
      if (!F.reference.value.trim()) { err.textContent = 'Escribe el número de referencia.'; return; }
      const btn = wrap.querySelector('[data-ok]'); btn.disabled = true; btn.textContent = 'Enviando…';
      try {
        await addDoc(collection(db, 'inbox'), {
          type: 'pago', tenantId: d.tenantId, code: d.code, who: d.who, patientName: d.name, patientCode: d.patientCode || '', orderId: o.id, orderNumber: o.number,
          amount, method: F.method.value, bank: F.bank.value.trim().slice(0, 60), reference: F.reference.value.trim().slice(0, 40), date: F.date.value || todayKey(),
          amountBs: F.amountBs ? round2(parseNum(F.amountBs.value)) : 0, rate: Number(d.rate) || 0, payer: String(d.name).slice(0, 80), note: F.note.value.trim().slice(0, 200), status: 'nueva', createdAt: new Date().toISOString()
        });
        reported.add(o.id); close(); render();
        toast('¡Listo! La óptica revisará tu pago.', 'success', 5000);
      } catch (ex) { console.warn(ex); err.textContent = 'No se pudo enviar. Revisa tu conexión e intenta de nuevo.'; btn.disabled = false; btn.textContent = 'Enviar reporte'; }
    };
  }
  render();
}

function emptyBox(ic, t, s) { return `<section class="card center pd-3"><span class="kpi-icon tone-brand" style="width:56px;height:56px;margin:0 auto 8px">${icon(ic)}</span><b>${esc(t)}</b><p class="t-sub">${esc(s)}</p></section>`; }
function notFound(t, s, phone = '') {
  return `<div class="portal-page"><div class="verify-card card center"><span class="kpi-icon tone-warning" style="width:64px;height:64px;margin:0 auto">${icon('alert')}</span><h2>${esc(t)}</h2><p class="t-sub">${s}</p>${phone ? `<a class="btn btn-whatsapp" href="${waLink(phone, 'Hola, quiero consultar mi portal.')}" target="_blank" rel="noopener">${icon('whatsapp')} Escribir a la óptica</a>` : ''}<a class="btn btn-ghost mt" href="/">Ir a SanoÓptica</a></div></div>`;
}
