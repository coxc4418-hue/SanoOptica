// SanoÓptica — Inicio: el día de la óptica de un vistazo
import { store } from '../store.js';
import { esc, usd, bs, fmtLongDate, todayKey, emptyState, fmtDate, dayKey, addDays } from '../utils.js';
import { icon } from '../icons.js';
import { patientAvatar, openPatient, paymentModal, patientForm } from '../patient.js';
import { openOrder, orderForm, advanceOrder } from '../order.js';
import { examForm } from '../rx.js';
import { waPatient } from '../shared.js';
import { currentPeriod, periodName, lastPeriods, fmtHour, APPT_REASONS, APPT_STATUS, badge, ORDER_STATUS, orderBalance, orderLate, waitingDays, ageOf, daysTo } from '../optica.js';

export function mount(el, { navigate }) {
  const h = new Date().getHours();
  const hello = h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
  el.innerHTML = `
    <div class="view-header"><div><h1 class="view-title">${hello} ${h < 12 ? '☀️' : h < 19 ? '👓' : '🌙'}</h1><p class="view-sub">${fmtLongDate()} · ${esc(store.businessName)}</p></div>
      <div class="view-actions" data-tour="quick">
        <button class="btn btn-primary" data-q="exam">${icon('eyeTest')} Examen visual <kbd class="hide-sm">F2</kbd></button>
        <button class="btn btn-secondary" data-q="order">${icon('glasses')} Nueva orden <kbd class="hide-sm">F3</kbd></button>
        <button class="btn btn-secondary" data-q="pay">${icon('wallet')} Cobrar <kbd class="hide-sm">F1</kbd></button>
        <button class="btn btn-ghost" data-q="sale">${icon('cart')} Venta</button>
      </div></div>
    <div id="d-alerts"></div>
    <div class="kpis" data-tour="kpis" id="d-kpis"></div>
    <div class="grid-2-1 mt-lg">
      <div class="card" data-tour="pipeline"><div class="card-head"><div class="card-title">${icon('lab')} Órdenes en curso</div><button class="btn btn-ghost btn-sm" data-go="ordenes">Tablero</button></div><div id="d-pipe"></div></div>
      <div class="card" data-tour="today"><div class="card-head"><div class="card-title">${icon('calendar')} Citas de hoy</div><button class="btn btn-ghost btn-sm" data-go="agenda">Agenda</button></div><div id="d-today"></div></div>
    </div>
    <div class="grid-2 mt-lg">
      <div class="card" data-tour="ready"><div class="card-head"><div class="card-title">${icon('checkCircle')} Listos para retirar</div><button class="btn btn-ghost btn-sm" data-go="ordenes" data-p="lista">Ver todos</button></div><div id="d-ready"></div></div>
      <div class="card"><div class="card-head"><div class="card-title">${icon('alert')} Por cobrar</div><button class="btn btn-ghost btn-sm" data-go="cobranza">Cobranza</button></div><div id="d-debt"></div></div>
    </div>
    <div class="grid-2 mt-lg">
      <div class="card"><div class="card-head"><div class="card-title">${icon('chart')} Ventas vs. cobrado</div><button class="btn btn-ghost btn-sm" data-go="reportes">Reportes</button></div><div id="d-chart"></div></div>
      <div class="card"><div class="card-head"><div class="card-title">${icon('bell')} Controles y cumpleaños</div><button class="btn btn-ghost btn-sm" data-go="recordatorios">Recordatorios</button></div><div id="d-comm"></div></div>
    </div>`;
  const $ = (s) => el.querySelector(s);
  el.querySelectorAll('[data-go]').forEach((b) => b.onclick = () => navigate(b.dataset.go, b.dataset.p ? { tab: b.dataset.p } : {}));
  $('[data-q="exam"]').onclick = () => examForm();
  $('[data-q="order"]').onclick = () => orderForm();
  $('[data-q="pay"]').onclick = () => paymentModal();
  $('[data-q="sale"]').onclick = () => navigate('venta');

  function alerts() {
    const rep = store.reportedPayments; const bk = store.newBookings;
    const late = store.activeOrders.filter((o) => orderLate(o) > 0);
    $('#d-alerts').innerHTML = (rep.length ? `<div class="banner req-banner"><span>${icon('bell')} <b>${rep.length} pago(s) reportado(s)</b> desde el portal esperan tu confirmación: ${rep.slice(0, 3).map((x) => `${esc(x.patientName || x.patientCode)} (${usd(x.amount)})`).join(', ')}</span><button class="btn btn-sm btn-primary" id="d-rep">Revisar</button></div>` : '')
      + (bk.length ? `<div class="banner req-banner"><span>${icon('calendar')} <b>${bk.length} cita(s)</b> pedida(s) en línea por confirmar</span><button class="btn btn-sm btn-primary" id="d-bk">Atender</button></div>` : '')
      + (late.length ? `<div class="banner lic-banner"><span>${icon('clock')} <b>${late.length} orden(es) atrasada(s)</b> según la fecha prometida: ${late.slice(0, 3).map((o) => esc(o.number)).join(', ')}</span><button class="btn btn-sm btn-secondary" id="d-late">Ver</button></div>` : '')
      + (store.lowStock.length ? `<div class="banner lic-banner"><span>${icon('frame')} <b>${store.lowStock.length} producto(s)</b> con poca existencia</span><button class="btn btn-sm btn-secondary" id="d-low">Inventario</button></div>` : '')
      + (!store.products.length && !store.isDemo ? `<div class="banner req-banner"><span>${icon('frame')} Empieza cargando tus monturas y tus laboratorios; luego registra el primer examen.</span><button class="btn btn-sm btn-primary" id="d-start">Cargar inventario</button></div>` : '');
    $('#d-rep')?.addEventListener('click', () => navigate('cobranza', { tab: 'reportados' }));
    $('#d-bk')?.addEventListener('click', () => navigate('agenda', { tab: 'solicitudes' }));
    $('#d-late')?.addEventListener('click', () => navigate('ordenes', { tab: 'atrasadas' }));
    $('#d-low')?.addEventListener('click', () => navigate('inventario', { tab: 'bajo' }));
    $('#d-start')?.addEventListener('click', () => navigate('inventario'));
  }

  function kpis() {
    const t = todayKey(); const p = currentPeriod();
    const todayColl = store.collectedOn(t);
    const todaySales = store.orders.filter((o) => o.date === t && o.status !== 'anulada');
    const exams = store.exams.filter((e) => e.date === t && e.status !== 'anulada').length;
    const monthSales = store.salesIn(p);
    const conv = (() => { const ex = store.exams.filter((e) => (e.date || '').startsWith(p) && e.status !== 'anulada'); if (!ex.length) return null; const withOrder = ex.filter((e) => store.orders.some((o) => o.examId === e.id && o.status !== 'anulada')).length; return Math.round(withOrder / ex.length * 100); })();
    $('#d-kpis').innerHTML = `
      <div class="card kpi kpi-link" data-go2="caja"><div class="kpi-top"><span class="kpi-label">Cobrado hoy</span><span class="kpi-icon tone-success">${icon('cash')}</span></div><div class="kpi-value">${usd(todayColl)}</div><div class="kpi-sub">${todaySales.length} venta(s)/orden(es) hoy${bs(todayColl) ? ` · ${bs(todayColl)}` : ''}</div></div>
      <div class="card kpi kpi-link" data-go2="ordenes"><div class="kpi-top"><span class="kpi-label">Órdenes en curso</span><span class="kpi-icon tone-info">${icon('lab')}</span></div><div class="kpi-value">${store.activeOrders.length}</div><div class="kpi-sub">${store.ordersIn('laboratorio').length} en laboratorio · ${store.readyOrders.length} listas</div></div>
      <div class="card kpi kpi-link" data-go2="cobranza"><div class="kpi-top"><span class="kpi-label">Por cobrar</span><span class="kpi-icon tone-danger">${icon('wallet')}</span></div><div class="kpi-value">${usd(store.totalDebt)}</div><div class="kpi-sub">${store.debtors.length} paciente(s)${bs(store.totalDebt) ? ` · ${bs(store.totalDebt)}` : ''}</div></div>
      <div class="card kpi kpi-link" data-go2="examenes"><div class="kpi-top"><span class="kpi-label">Exámenes hoy</span><span class="kpi-icon tone-brand">${icon('eyeTest')}</span></div><div class="kpi-value">${exams}</div><div class="kpi-sub">${store.appointmentsOn(t).length} cita(s) en agenda</div></div>
      <div class="card kpi kpi-link" data-go2="reportes"><div class="kpi-top"><span class="kpi-label">Ventas de ${esc(periodName(p).split(' ')[0].toLowerCase())}</span><span class="kpi-icon tone-violet">${icon('trend')}</span></div><div class="kpi-value">${usd(monthSales)}</div><div class="kpi-sub">cobrado ${usd(store.collectedIn(p))}</div></div>
      <div class="card kpi kpi-link" data-go2="examenes"><div class="kpi-top"><span class="kpi-label">Examen → compra</span><span class="kpi-icon tone-warning">${icon('target')}</span></div><div class="kpi-value">${conv == null ? '—' : conv + '%'}</div><div class="kpi-sub">de los examinados este mes compró</div></div>`;
    el.querySelectorAll('[data-go2]').forEach((b) => b.onclick = () => navigate(b.dataset.go2));
  }

  function pipe() {
    const cols = ['registrada', 'laboratorio', 'recibida', 'lista'];
    const counts = cols.map((s) => store.ordersIn(s).length + (s === 'laboratorio' ? store.ordersIn('garantia').length : 0));
    const list = store.activeOrders.slice().sort((a, b) => (a.promised || '9').localeCompare(b.promised || '9')).slice(0, 6);
    $('#d-pipe').innerHTML = `<div class="pipe">${cols.map((s, i) => `<button class="pipe-step tone-b-${ORDER_STATUS[s].tone}" data-st="${s}"><span>${icon(ORDER_STATUS[s].icon)}</span><b>${counts[i]}</b><small>${esc(ORDER_STATUS[s].label)}</small></button>`).join('')}</div>
      ${list.length ? `<div class="list mt-sm">${list.map((o) => { const late = orderLate(o); return `<div class="list-item"><span class="kpi-icon tone-${ORDER_STATUS[o.status].tone}" style="width:34px;height:34px">${icon(ORDER_STATUS[o.status].icon)}</span><div class="grow" style="min-width:0"><button class="linkish ellipsis" data-o="${o.id}"><b>${esc(o.number)} · ${esc(o.patientName)}</b></button><div class="t-sub">${badge(ORDER_STATUS, o.status)} ${o.promised ? `<span class="${late ? 'text-danger' : ''}">· ${late ? `atrasada ${late} d` : 'entrega ' + fmtDate(o.promised)}</span>` : ''}</div></div><button class="btn btn-secondary btn-sm" data-adv="${o.id}" title="Pasar al siguiente estado">${icon('arrowRight')}</button></div>`; }).join('')}</div>`
        : emptyState('glasses', 'Sin órdenes en curso', 'Cuando registres una orden de lentes la verás avanzar aquí: laboratorio → control de calidad → lista.')}`;
    el.querySelectorAll('#d-pipe [data-st]').forEach((b) => b.onclick = () => navigate('ordenes', { tab: b.dataset.st }));
    el.querySelectorAll('#d-pipe [data-o]').forEach((b) => b.onclick = () => openOrder(b.dataset.o));
    el.querySelectorAll('#d-pipe [data-adv]').forEach((b) => b.onclick = () => advanceOrder(store.order(b.dataset.adv)));
  }

  function today() {
    const list = store.appointmentsOn(todayKey());
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
    $('#d-today').innerHTML = list.length ? `<div class="list">${list.map((a) => {
      const [hh, mm] = a.time.split(':').map(Number); const past = hh * 60 + mm < nowMin - 20;
      return `<div class="list-item class-row ${a.status === 'atendida' ? '' : !past && hh * 60 + mm - nowMin < 30 && hh * 60 + mm >= nowMin - 10 ? 'is-live' : ''}"><span class="class-time" style="--gc:var(--brand)"><b>${fmtHour(a.time)}</b><small>${esc(APPT_REASONS[a.reason]?.label.split(' ')[0] || '')}</small></span>
        <div class="grow" style="min-width:0"><button class="linkish ellipsis" data-ap="${a.patientId || ''}"><b>${esc(a.name)}</b></button><div class="t-sub row" style="gap:6px;flex-wrap:wrap"><span>${esc(APPT_REASONS[a.reason]?.label || '')}</span>${badge(APPT_STATUS, a.status)}</div></div>
        ${a.status !== 'atendida' && a.patientId && ['examen', 'control', 'contacto', 'ninos'].includes(a.reason) ? `<button class="btn btn-sm btn-primary" data-ex="${a.id}">${icon('eyeTest')}</button>` : ''}</div>`;
    }).join('')}</div>` : emptyState('calendar', 'Sin citas hoy', 'Agenda exámenes desde la Agenda o comparte tu enlace de citas en línea.');
    el.querySelectorAll('#d-today [data-ap]').forEach((b) => b.onclick = () => { if (b.dataset.ap) openPatient(b.dataset.ap); });
    el.querySelectorAll('#d-today [data-ex]').forEach((b) => b.onclick = async () => {
      const a = store.appointments.find((x) => x.id === b.dataset.ex);
      const ex = await examForm({ patient: store.patient(a.patientId) });
      if (ex) { const { setApptStatus } = await import('../ops.js'); setApptStatus(a, 'atendida'); }
    });
  }

  function ready() {
    const list = store.readyOrders.slice().sort((a, b) => (a.readyAt || '').localeCompare(b.readyAt || '')).slice(0, 7);
    $('#d-ready').innerHTML = list.length ? `<div class="list">${list.map((o) => { const w = waitingDays(o); const bal = orderBalance(o); return `<div class="list-item"><span class="kpi-icon tone-success" style="width:34px;height:34px">${icon('glasses')}</span><div class="grow" style="min-width:0"><button class="linkish ellipsis" data-o="${o.id}"><b>${esc(o.patientName)}</b></button><div class="t-sub">${esc(o.number)} · ${w ? `<span class="${w > 7 ? 'text-warning' : ''}">lista hace ${w} d</span>` : 'lista hoy'}${bal > 0.009 ? ` · resta <b class="text-danger">${usd(bal)}</b>` : ' · pagada'}</div></div><button class="btn btn-whatsapp btn-icon btn-sm" data-wa="${o.id}" title="Avisar">${icon('whatsapp')}</button></div>`; }).join('')}</div>`
      : emptyState('checkCircle', 'Nada por retirar', 'Cuando una orden pase el control de calidad aparece aquí para avisar al paciente.');
    el.querySelectorAll('#d-ready [data-o]').forEach((b) => b.onclick = () => openOrder(b.dataset.o));
    el.querySelectorAll('#d-ready [data-wa]').forEach((b) => b.onclick = () => waPatient('lista', { order: store.order(b.dataset.wa) }));
  }

  function debt() {
    const list = store.debtors.slice(0, 7);
    $('#d-debt').innerHTML = list.length ? `<div class="list">${list.map((p) => `<div class="list-item">${patientAvatar(p)}<div class="grow" style="min-width:0"><button class="linkish ellipsis" data-p="${p.id}"><b>${esc(p.name)}</b></button><div class="t-sub">${store.ordersOf(p.id).filter((o) => orderBalance(o) > 0.009 && o.status !== 'anulada').map((o) => esc(o.number)).join(', ')}</div></div><b class="num">${usd(store.balanceOf(p.id))}</b><button class="btn btn-success btn-icon btn-sm" data-pay="${p.id}" title="Cobrar">${icon('wallet')}</button></div>`).join('')}</div>`
      : emptyState('checkCircle', '¡Todo cobrado!', 'Ningún paciente tiene saldo pendiente.');
    el.querySelectorAll('#d-debt [data-p]').forEach((b) => b.onclick = () => openPatient(b.dataset.p));
    el.querySelectorAll('#d-debt [data-pay]').forEach((b) => b.onclick = () => paymentModal(store.patient(b.dataset.pay)));
  }

  function chart() {
    const ps = lastPeriods(6).reverse();
    const data = ps.map((p) => ({ p, sold: store.salesIn(p), coll: store.collectedIn(p) }));
    const max = Math.max(1, ...data.map((d) => Math.max(d.sold, d.coll)));
    $('#d-chart').innerHTML = data.some((d) => d.sold || d.coll) ? `<div class="bars2">${data.map((d) => `<div class="bar2"><div class="bar2-cols"><i class="b" style="height:${d.sold / max * 100}%" title="Vendido ${usd(d.sold)}"></i><i class="c" style="height:${d.coll / max * 100}%" title="Cobrado ${usd(d.coll)}"></i></div><span>${esc(periodName(d.p, true))}</span><small>${d.sold ? usd(d.sold).replace(/,\d\d$/, '') : ''}</small></div>`).join('')}</div>
      <div class="ag-legend mt"><span><i class="lg-b"></i> Vendido</span><span><i class="lg-c"></i> Cobrado</span></div>`
      : emptyState('chart', 'Aún sin datos', 'Aquí verás cuánto vendes y cuánto cobras cada mes.');
  }

  function comm() {
    const due = store.controlsDue(15).slice(0, 5);
    const days = Array.from({ length: 7 }, (_, i) => dayKey(addDays(new Date(), i)).slice(5));
    const bdays = store.activePatients.filter((p) => p.birthDate && days.includes(p.birthDate.slice(5))).sort((a, b) => days.indexOf(a.birthDate.slice(5)) - days.indexOf(b.birthDate.slice(5))).slice(0, 4);
    const todayMD = todayKey().slice(5);
    $('#d-comm').innerHTML = `
      ${due.length ? `<div class="list">${due.map((p) => { const d = daysTo(p.nextControl); return `<div class="list-item">${patientAvatar(p)}<div class="grow" style="min-width:0"><button class="linkish ellipsis" data-p="${p.id}"><b>${esc(p.name)}</b></button><div class="t-sub">${icon('eye')} Control ${d < 0 ? `<b class="text-warning">vencido hace ${-d} d</b>` : d === 0 ? 'hoy' : `en ${d} d`} · último examen ${fmtDate(p.lastExamAt)}</div></div><button class="btn btn-whatsapp btn-icon btn-sm" data-ctl="${p.id}" title="Recordar control">${icon('whatsapp')}</button></div>`; }).join('')}</div>` : ''}
      ${bdays.length ? `<div class="section-title ${due.length ? 'mt' : ''}">${icon('cake')} Cumpleaños de la semana</div><div class="list">${bdays.map((p) => `<div class="list-item">${patientAvatar(p, 'sm')}<div class="grow" style="min-width:0"><button class="linkish ellipsis" data-p="${p.id}"><b>${esc(p.name)}</b></button><div class="t-sub">${p.birthDate.slice(5) === todayMD ? '<b class="text-success">¡Hoy!</b>' : fmtDate(new Date().getFullYear() + p.birthDate.slice(4))} · cumple ${(ageOf(p.birthDate) || 0) + (p.birthDate.slice(5) === todayMD ? 0 : 1)}</div></div><button class="btn btn-whatsapp btn-icon btn-sm" data-bd="${p.id}" title="Felicitar">${icon('whatsapp')}</button></div>`).join('')}</div>` : ''}
      ${!due.length && !bdays.length ? emptyState('bell', 'Sin pendientes', 'Aquí verás los controles anuales por vencer y los cumpleaños de la semana.') : ''}`;
    el.querySelectorAll('#d-comm [data-p]').forEach((b) => b.onclick = () => openPatient(b.dataset.p));
    el.querySelectorAll('#d-comm [data-ctl]').forEach((b) => b.onclick = () => waPatient('control', { patient: store.patient(b.dataset.ctl) }));
    el.querySelectorAll('#d-comm [data-bd]').forEach((b) => b.onclick = () => waPatient('cumple', { patient: store.patient(b.dataset.bd) }));
  }

  const all = () => { alerts(); kpis(); pipe(); today(); ready(); debt(); chart(); comm(); };
  all();
  const iv = setInterval(today, 60000);
  const off = store.on('*', (evt) => {
    if (['orders', 'payments'].includes(evt)) { kpis(); pipe(); ready(); debt(); chart(); alerts(); }
    if (['patients', 'exams'].includes(evt)) { kpis(); debt(); comm(); }
    if (evt === 'appointments') { today(); kpis(); }
    if (['inbox', 'products'].includes(evt)) alerts();
    if (['settings', 'rate'].includes(evt)) all();
  });
  void patientForm;
  return () => { off(); clearInterval(iv); };
}
