// SanoÓptica — Componentes compartidos: país y moneda, QR, WhatsApp e impresos (fórmula, orden, laboratorio, recibos, etiquetas)
import { store } from './store.js';
import { openModal, toast, num, esc, fmtDateTime, fmtDate, setBusy, usd, bs, fx, methodLabel, printHTML, todayKey, waLink, COUNTRIES, loc, flagImg, fmtLongDate } from './utils.js';
import { icon } from './icons.js';
import {
  ORDER_STATUS, APPT_REASONS, LENS_TYPES, LENS_MATERIALS, LENS_USE, DIAGNOSES, orderBalance, fmtDiop, fmtAxis, eyeText, toMinusCyl, firstName, contactPhone, contactName, isMinor, ageOf,
  itemsText, fmtHour, productLabel, sizeText, kindLabel, spherEq
} from './optica.js';
import { lensSummary } from './ops.js';

export const APP_NAME = 'SanoÓptica';
export const SALES_PHONE = '584221906045';
export const SALES_PHONE_FMT = '+58 422-190 6045';
export const salesWa = (msg = 'Hola, me interesa SanoÓptica para gestionar mi óptica. ¿Me pueden dar más información?') =>
  `https://wa.me/${SALES_PHONE}?text=${encodeURIComponent(msg)}`;

// ======================================================================
// PAÍS DE TRABAJO (se elige una sola vez, al entrar por primera vez)
// ======================================================================
export function openCountryPicker({ force = false } = {}) {
  return new Promise((resolve) => {
    let picked = store.settings.country || '';
    let cur = store.settings.currency || '';
    const list = Object.entries(COUNTRIES).sort((a, b) => a[1].name.localeCompare(b[1].name, 'es'));
    const m = openModal({
      title: force ? '¿En qué país está tu óptica?' : 'País y moneda', size: 'md', dismissible: !force,
      sub: 'Según el país, SanoÓptica trabaja con su moneda, sus formas de pago y el código telefónico para WhatsApp.',
      body: `<div class="stack"><label class="search"><svg></svg><input data-q placeholder="Buscar país…" autocomplete="off"></label><div class="country-grid" data-l></div><div data-cur></div><div class="error-msg" data-err></div></div>`,
      footer: `${force ? '' : '<button class="btn btn-secondary" data-close>Cancelar</button>'}<button class="btn btn-primary btn-lg" data-ok disabled>Continuar</button>`,
      onClose: () => resolve(picked && store.settings.country === picked ? picked : null)
    });
    m.el.querySelector('.search svg').outerHTML = icon('search');
    const draw = (qv = '') => {
      const t = qv.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      m.el.querySelector('[data-l]').innerHTML = list.filter(([, c]) => !t || c.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(t)).map(([k, c]) =>
        `<button type="button" class="country ${picked === k ? 'on' : ''}" data-c="${k}"><span class="flag">${flagImg(k, 24)}</span><span class="grow"><b>${esc(c.name)}</b><small>${esc(c.curName)} · ${esc(c.sym)}</small></span></button>`).join('');
      m.el.querySelectorAll('[data-c]').forEach((b) => b.onclick = () => { picked = b.dataset.c; cur = COUNTRIES[picked].cur; draw(m.el.querySelector('[data-q]').value); });
      const c = COUNTRIES[picked];
      m.el.querySelector('[data-cur]').innerHTML = c ? `<div class="card stack" style="padding:12px 14px"><div class="row" style="gap:10px"><span class="flag">${flagImg(picked, 30)}</span><div class="grow"><b>${esc(c.name)}</b><div class="t-sub">Formas de pago: efectivo, transferencia${(c.extra || []).length ? ' y otras locales' : ''} · WhatsApp +${esc(c.dial)}</div></div></div>
        ${c.alt ? `<div class="field"><label>Moneda en la que vendes</label><div class="seg seg-block">${[[c.cur, c.curName + ' (' + c.sym + ')'], [c.alt.cur, c.alt.curName + ' (' + c.alt.sym + ')']].map(([k, l]) => `<button type="button" data-mc="${k}" class="${cur === k ? 'on' : ''}">${esc(l)}</button>`).join('')}</div>${picked === 'VE' ? '<span class="hint">Recomendado: dólares. Cada orden y cada pago muestra su equivalente en bolívares a la tasa BCV del día.</span>' : ''}</div>` : `<div class="small">Moneda: <b>${esc(c.curName)} (${esc(c.sym)})</b></div>`}
        ${store.settings.country && store.settings.country !== picked ? `<div class="vital-alert warning">Los montos ya registrados no se convierten.</div>` : ''}</div>` : '';
      m.el.querySelectorAll('[data-mc]').forEach((b) => b.onclick = () => { cur = b.dataset.mc; draw(m.el.querySelector('[data-q]').value); });
      m.el.querySelector('[data-ok]').disabled = !picked;
    };
    m.el.querySelector('[data-q]').oninput = (e) => draw(e.target.value);
    m.el.querySelector('[data-ok]').onclick = async (e) => {
      if (!picked) return;
      setBusy(e.currentTarget, true, 'Guardando…');
      try { await store.setCountry(picked, cur); await (await import('./bcv.js')).onCountryChanged().catch(() => {}); toast(`Listo: trabajarás en ${loc().curName} (${loc().sym})`); m.close(); }
      catch (ex) { m.el.querySelector('[data-err]').textContent = ex.message; setBusy(e.currentTarget, false); }
    };
    draw();
  });
}

// ======================================================================
// QR
// ======================================================================
let qrLoad = null;
function loadQR() {
  if (window.qrcode) return Promise.resolve(window.qrcode);
  qrLoad ||= new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = '/js/vendor/qrcode.js';
    s.onload = () => res(window.qrcode); s.onerror = rej;
    document.head.appendChild(s);
  });
  return qrLoad;
}
export async function qrDataURL(text, cell = 4) {
  try { const q = await loadQR(); const qr = q(0, 'M'); qr.addData(text); qr.make(); return qr.createDataURL(cell, 2); } catch (_) { return ''; }
}

// ======================================================================
// WHATSAPP AL PACIENTE
// ======================================================================
const BASE = 'https://sano-optica.web.app';
export const PORTAL_URL = (p) => (p?.portalCode ? `${BASE}/paciente/${p.portalCode}` : '');
export const RX_URL = (ex) => (ex?.verify ? `${BASE}/formula/${ex.verify}` : '');
export const BOOKING_URL = () => (store.settings.bookingCode ? `${BASE}/cita/${store.settings.bookingCode}` : '');
const amt = (v) => `${usd(v)}${bs(v) ? ` (${bs(v)})` : ''}`;
export function banksText() {
  const list = (store.settings.banks || []).filter((b) => b.active !== false);
  if (!list.length) return '';
  return '\n\n🏦 *Datos para pagar*\n' + list.map((b) => b.type === 'pagomovil'
    ? `• Pago móvil: ${b.bank || ''} · ${b.phone || ''} · ${b.idDoc || ''}`
    : b.type === 'zelle' ? `• Zelle: ${b.email || b.number || ''} (${b.holder || ''})`
      : b.type === 'efectivo' ? `• Efectivo en la óptica`
        : `• ${b.bank || 'Transferencia'}: ${b.number || ''} · ${b.holder || ''} · ${b.idDoc || ''}`).join('\n');
}
export function patientMessage(kind, { patient: p = {}, order: o = null, payment = null, appt = null, exam = null, extra = '' } = {}) {
  const who = firstName({ name: contactName(p) }) || 'hola';
  const biz = store.businessName;
  const portal = PORTAL_URL(p);
  const about = isMinor(p) ? ` de *${firstName(p)}*` : '';
  const h = `Hola ${who} 👋, te escribimos de *${biz}*.`;
  const bal = o ? Math.max(0, orderBalance(o)) : store.balanceOf(p.id);
  const addr = store.settings.address ? `\n📍 ${store.settings.address}` : '';
  const T = {
    pedido: () => `${h}
\n🧾 Registramos tu orden *${o?.number}*${about}: ${itemsText(o)}.${o?.promised ? `\n📅 Fecha estimada de entrega: *${fmtDate(o.promised)}*` : ''}
Total: *${amt(o?.total || 0)}* · Abonado: ${usd(o?.paid || 0)}${bal > 0.009 ? ` · Resta: *${amt(bal)}*` : ' · ¡Pagado! ✅'}${portal ? `
\n📲 Sigue el estado de tus lentes aquí: ${portal}` : ''}`,
    laboratorio: () => `${h}
\n🔬 Tus lentes${about} (orden *${o?.number}*) ya están en el laboratorio. Te avisaremos apenas estén listos.${portal ? `\n📲 ${portal}` : ''}`,
    lista: () => `${h}
\n🎉 ¡Tus lentes${about} están *listos para retirar*! Orden *${o?.number}*.${bal > 0.009 ? `
Saldo pendiente: *${amt(bal)}*${banksText()}` : ''}
\nTe esperamos para entregártelos y ajustarlos a tu medida.${addr}${horarioTxt()}`,
    entregada: () => `${h}
\n👓 ¡Gracias por confiar en nosotros! Esperamos que disfrutes tus lentes nuevos.${o?.warrantyUntil ? `\n🛡️ Garantía hasta el *${fmtDate(o.warrantyUntil)}*.` : ''}
Si sientes alguna molestia los primeros días, pásate y te los ajustamos sin costo.`,
    recordatorio: () => `${h}
\n🔔 Te recordamos que tienes un saldo pendiente de *${amt(bal)}*${o ? ` en la orden *${o.number}*` : ''}.${banksText()}${portal ? `
\n📲 Reporta tu pago aquí: ${portal}` : ''}`,
    pago: () => `${h}
\n✅ Recibimos tu pago${payment?.number ? ` *${payment.number}*` : ''} por *${amt(payment?.amount || 0)}*${payment?.orderNumber ? ` (orden ${payment.orderNumber})` : ''}.
${bal <= 0.009 ? '🎉 ¡Tu orden quedó *pagada*!' : `Saldo pendiente: *${amt(bal)}*.`}${portal ? `\n\n📲 ${portal}` : ''}`,
    rechazo: () => `${h}
\nNo pudimos verificar el pago que reportaste${extra ? `: ${extra}` : '.'} Por favor envíanos el comprobante.`,
    control: () => `${h}
\n👁️ ${isMinor(p) ? `Ya le toca a *${firstName(p)}*` : 'Ya te toca'} el *control visual anual*${p.lastExamAt ? ` (último examen: ${fmtDate(p.lastExamAt)})` : ''}. La vista cambia con el tiempo y revisarla a tiempo evita dolores de cabeza y fatiga.
${BOOKING_URL() ? `\n📅 Agenda tu cita en un minuto: ${BOOKING_URL()}` : '\nResponde este mensaje y te damos una cita.'}`,
    cita: () => `${h}
\n📅 Tu cita${about} quedó *confirmada*: *${APPT_REASONS[appt?.reason]?.label || 'Consulta'}* el *${fmtDate(appt?.date)}* a las *${fmtHour(appt?.time)}*.${addr}
Si traes lentes o fórmula anterior, tráelos. ¡Te esperamos!`,
    recordarCita: () => `${h}
\n⏰ Te recordamos tu cita de mañana${about}: *${APPT_REASONS[appt?.reason]?.label || 'Consulta'}* a las *${fmtHour(appt?.time)}*.${addr}
Si no puedes asistir, avísanos para darte otra hora.`,
    formula: () => `${h}
\n📋 Esta es tu fórmula${about} del ${fmtDate(exam?.date)}:
OD: ${eyeText(exam?.rx?.od)}
OI: ${eyeText(exam?.rx?.oi)}${exam?.rx?.dp ? `\nDP: ${num(exam.rx.dp, 1)} mm` : ''}${RX_URL(exam) ? `
\n🔐 Verifícala aquí: ${RX_URL(exam)}` : ''}`,
    portal: () => `${h}
\n📲 Este es tu portal${about}: ${portal}
\nAhí ves el estado de tus lentes, tu fórmula, tus pagos y puedes pedir cita o reportar un pago. Guárdalo en tu pantalla de inicio.`,
    cumple: () => `🎂 ¡Feliz cumpleaños, ${firstName(p)}! 🎉
Todo el equipo de *${biz}* te desea un día increíble. Como regalo, tienes un *descuento especial* en tus próximos lentes este mes. 👓✨`,
    libre: () => `${h}
\n${extra || ''}`
  };
  return (T[kind] || T.libre)().replace(/\n\\n/g, '\n\n');
}
function horarioTxt() {
  const h = store.settings.hours;
  return h?.from ? `\n🕘 Horario: ${fmtHour(h.from)} a ${fmtHour(h.to)}` : '';
}
export function waPatient(kind, ctx = {}) {
  const p = ctx.patient || (ctx.order?.patientId ? store.patient(ctx.order.patientId) : null) || { name: ctx.order?.patientName, phone: ctx.order?.patientPhone };
  const phone = contactPhone(p) || ctx.order?.patientPhone || ctx.appt?.phone || '';
  const text = patientMessage(kind, { ...ctx, patient: p });
  window.open(phone ? waLink(phone, text) : 'https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener');
}

// ======================================================================
// IMPRESIÓN
// ======================================================================
export const PRINT_HEAD = '<meta charset="utf-8"><meta name="color-scheme" content="light"><style>:root{color-scheme:light}html,body{background:#fff;color:#000}</style>';
const ACCENT = '#0369a1';
const baseCSS = `@page { margin: 12mm; } body { font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 12px; }
  h1 { font-size: 18px; margin: 0 0 2px; } h2 { font-size: 13px; margin: 14px 0 6px; text-transform: uppercase; letter-spacing: .04em; color: ${ACCENT}; }
  .muted { color: #555; } table { width: 100%; border-collapse: collapse; margin-top: 6px; }
  th { background: ${ACCENT}; color: #fff; text-align: left; padding: 6px; font-size: 11px; }
  td { padding: 5px 6px; border-bottom: 1px solid #ddd; vertical-align: top; } .r { text-align: right; white-space: nowrap; } .c { text-align: center; }
  .tot td { font-weight: bold; border-top: 2px solid #111; border-bottom: 0; } .big { font-size: 16px; font-weight: bold; }
  .head { display: flex; justify-content: space-between; gap: 20px; border-bottom: 3px solid ${ACCENT}; padding-bottom: 10px; margin-bottom: 10px; }
  .box { border: 1px solid #ccc; border-radius: 6px; padding: 8px 10px; } .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .rx th { text-align: center; } .rx td { text-align: center; font-family: 'Courier New', monospace; font-size: 14px; font-weight: bold; border: 1px solid #bbb; } .rx td.eye { font-family: Arial; background: #f0f7fb; width: 52px; }
  .sign { margin-top: 50px; display: flex; gap: 40px; } .sign div { flex: 1; border-top: 1px solid #333; padding-top: 4px; text-align: center; }
  .stamp { display: inline-block; border: 3px solid #15803d; color: #15803d; font-weight: bold; padding: 6px 14px; border-radius: 8px; font-size: 18px; transform: rotate(-4deg); }
  .pb { page-break-after: always; } .foot { margin-top: 18px; font-size: 10px; color: #666; } .ok { color: #15803d; font-weight: bold; } .bad { color: #b91c1c; font-weight: bold; }
  .qr { text-align: center; font-size: 10px; color: #555; } .qr img { width: 92px; height: 92px; display: block; margin: 0 auto 2px; }`;
function bizHead(right = '') {
  const s = store.settings;
  return `<div class="head"><div><h1>${esc(store.businessName)}</h1>
    ${s.slogan ? `<div class="muted">${esc(s.slogan)}</div>` : ''}${s.rif ? `<div>${esc(loc().tax)}: ${esc(s.rif)}</div>` : ''}${s.address ? `<div class="muted">${esc(s.address)}</div>` : ''}${s.phone || s.whatsapp ? `<div class="muted">Tel: ${esc(s.phone || s.whatsapp)}${s.email ? ' · ' + esc(s.email) : ''}</div>` : ''}</div>
    ${right ? `<div style="text-align:right">${right}</div>` : ''}</div>`;
}
const patientBox = (p, o = null) => `<div class="box"><div class="muted">Paciente</div><div class="big">${esc(p?.name || o?.patientName || '')}</div><div>${p?.code || o?.patientCode ? `Historia <b>${esc(p?.code || o?.patientCode)}</b>` : ''}${p?.idDoc ? ` · ${esc(loc().id)} ${esc(p.idDoc)}` : ''}${ageOf(p?.birthDate) != null ? ` · ${ageOf(p.birthDate)} años` : ''}</div>${p?.phone || o?.patientPhone ? `<div>Tel: ${esc(p?.phone || o?.patientPhone)}</div>` : ''}</div>`;
/** Tabla de refracción OD/OI para impresos */
export function rxTablePrint(rx = {}, { minus = false } = {}) {
  const row = (k) => { const e0 = rx?.[k] || {}; const e = minus ? toMinusCyl(e0) : e0; return `<tr><td class="eye"><b>${k.toUpperCase()}</b></td><td>${fmtDiop(e.sph ?? (e.cyl || e.add ? 0 : null))}</td><td>${e.cyl ? fmtDiop(e.cyl, { plano: false }) : '—'}</td><td>${e.cyl ? fmtAxis(e.axis) : '—'}</td><td>${e.add ? fmtDiop(e.add, { plano: false }) : '—'}</td><td>${e.prism ? `${num(e.prism, 2)}Δ ${esc(e.base || '')}` : '—'}</td><td>${e.dp ? num(e.dp, 1) : '—'}</td><td>${e.height ? num(e.height, 1) : '—'}</td></tr>`; };
  return `<table class="rx"><tr><th></th><th>Esfera</th><th>Cilindro</th><th>Eje</th><th>Adición</th><th>Prisma</th><th>DP mono</th><th>Altura</th></tr>${row('od')}${row('oi')}</table>
    ${rx?.dp || rx?.dpNear ? `<div style="margin-top:4px">DP total: <b>${rx.dp ? num(rx.dp, 1) + ' mm' : '—'}</b>${rx.dpNear ? ` · DP cerca: <b>${num(rx.dpNear, 1)} mm</b>` : ''}</div>` : ''}`;
}

/** Fórmula / récipe óptico con QR de verificación */
export async function printRx(ex) {
  const p = store.patient(ex.patientId) || { name: ex.patientName, code: ex.patientCode };
  const qr = ex.verify ? await qrDataURL(RX_URL(ex), 3) : '';
  const s = store.settings;
  const dx = (ex.diagnosis || []).map((d) => DIAGNOSES[d] || d);
  const tr = (ex.treatments || []).map((id) => store.treatment(id)?.name || id);
  printHTML(`<!DOCTYPE html><html><head>${PRINT_HEAD}<title>Fórmula ${esc(ex.number || '')}</title><style>${baseCSS} @page { size: A5; margin: 10mm; } body { font-size: 11.5px; }</style></head><body>
    ${bizHead(`<b style="font-size:15px">FÓRMULA ÓPTICA</b><div>N° ${esc(ex.number || '')}</div><div>${fmtDate(ex.date)}</div>${ex.status === 'anulada' ? '<div class="bad">*** ANULADA ***</div>' : ''}`)}
    ${patientBox(p)}
    <h2>${ex.kind === 'contacto' ? 'Refracción y lentes de contacto' : 'Refracción final (lentes)'}</h2>
    ${rxTablePrint(ex.rx)}
    ${ex.kind === 'contacto' && ex.contact ? `<table class="rx" style="margin-top:8px"><tr><th></th><th>Curva base</th><th>Diámetro</th><th>Poder</th><th>Marca / tipo</th></tr>${['od', 'oi'].map((k) => `<tr><td class="eye"><b>${k.toUpperCase()}</b></td><td>${esc(ex.contact[k]?.bc || '—')}</td><td>${esc(ex.contact[k]?.dia || '—')}</td><td>${esc(ex.contact[k]?.power || '—')}</td><td style="font-family:Arial;font-size:11px">${esc(ex.contact[k]?.brand || '—')}</td></tr>`).join('')}</table>` : ''}
    ${['od', 'oi'].some((k) => ex.rx?.[k]?.av || ex.rx?.[k]?.avcc) ? `<div style="margin-top:6px">Agudeza visual · OD: sc ${esc(ex.rx?.od?.av || '—')} / cc ${esc(ex.rx?.od?.avcc || '—')} · OI: sc ${esc(ex.rx?.oi?.av || '—')} / cc ${esc(ex.rx?.oi?.avcc || '—')}</div>` : ''}
    <div class="grid" style="margin-top:10px"><div class="box"><div class="muted">Recomendación</div><b>${esc([LENS_TYPES[ex.lensType]?.label, LENS_MATERIALS[ex.material], ...tr].filter(Boolean).join(' · ') || '—')}</b>${ex.use ? `<div>${esc(LENS_USE[ex.use] || ex.use)}</div>` : ''}</div>
      <div class="box"><div class="muted">Diagnóstico</div><b>${esc(dx.join(', ') || '—')}</b>${ex.diagnosisNote ? `<div>${esc(ex.diagnosisNote)}</div>` : ''}</div></div>
    ${ex.refer ? '<div class="box" style="margin-top:8px;border-color:#b91c1c"><b class="bad">Se recomienda evaluación por oftalmología.</b></div>' : ''}
    ${ex.notes ? `<p style="margin-top:8px">${esc(ex.notes)}</p>` : ''}
    <div style="margin-top:8px">Próximo control: <b>${fmtDate(ex.nextControl)}</b></div>
    <div class="sign" style="align-items:flex-end"><div>${esc(ex.optometrist || s.optometrist || 'Optometrista')}<br><small>${esc(loc().lic || 'Registro')}${ex.license || s.license ? ' ' + esc(ex.license || s.license) : ''}</small></div>${qr ? `<div class="qr" style="border:0;flex:0 0 110px"><img src="${qr}" alt="">Verifica esta fórmula</div>` : ''}</div>
    <div class="foot">Fórmula válida por 12 meses o hasta el próximo control. Código de verificación ${esc(ex.verify || '')} · ${esc(RX_URL(ex))} · SanoÓptica</div></body></html>`);
}

/** Comprobante de la orden para el cliente (con QR a su portal) */
export async function printOrderTicket(o) {
  const p = o.patientId ? store.patient(o.patientId) : null;
  const qr = p ? await qrDataURL(PORTAL_URL(p), 3) : '';
  const rate = Number(fx()?.rate) || 0;
  const bal = Math.max(0, orderBalance(o));
  const pays = store.payments.filter((x) => x.orderId === o.id && x.status === 'confirmado');
  printHTML(`<!DOCTYPE html><html><head>${PRINT_HEAD}<title>${esc(o.number)}</title><style>${baseCSS}</style></head><body>
    ${bizHead(`<b style="font-size:15px">${esc(kindLabel(o).toUpperCase())}</b><div class="big">N° ${esc(o.number)}</div><div>Fecha: ${fmtDate(o.date)}</div>${o.promised ? `<div>Entrega estimada: <b>${fmtDate(o.promised)}</b></div>` : ''}${o.status === 'anulada' ? '<div class="bad">*** ANULADA ***</div>' : ''}`)}
    <div class="grid">${patientBox(p, o)}<div class="box"><div class="muted">Estado</div><div class="big">${esc(ORDER_STATUS[o.status]?.label || o.status)}</div>${o.frame?.name || o.frame?.own ? `<div>Montura: ${esc(o.frame.own ? 'propia del paciente' : o.frame.name)}</div>` : ''}${o.lens ? `<div>Cristales: ${esc(lensSummary(o))}</div>` : ''}</div></div>
    ${o.rx && o.kind !== 'venta' ? `<h2>Graduación</h2>${rxTablePrint(o.rx)}` : ''}
    <h2>Detalle</h2>
    <table><tr><th>Descripción</th><th class="c">Cant.</th><th class="r">Precio</th><th class="r">Importe</th></tr>
      ${(o.items || []).map((i) => `<tr><td>${esc(i.name)}</td><td class="c">${i.qty || 1}</td><td class="r">${usd(i.price)}</td><td class="r">${usd((i.price || 0) * (i.qty || 1))}</td></tr>`).join('')}
      ${o.discount ? `<tr><td colspan="3">Descuento</td><td class="r">-${usd(o.discount)}</td></tr>` : ''}
      <tr class="tot"><td colspan="3">TOTAL</td><td class="r">${usd(o.total)}${rate && fx() ? `<br><small>${esc(fx().sym)} ${num(o.total * rate, 2)}</small>` : ''}</td></tr>
      <tr><td colspan="3">Abonado</td><td class="r">${usd(o.paid || 0)}</td></tr>
      <tr class="tot"><td colspan="3">${bal > 0.009 ? 'SALDO PENDIENTE' : 'PAGADO'}</td><td class="r">${usd(bal)}${bal > 0.009 && rate && fx() ? `<br><small>${esc(fx().sym)} ${num(bal * rate, 2)}</small>` : ''}</td></tr></table>
    ${pays.length ? `<h2>Pagos</h2><table><tr><th>Recibo</th><th>Fecha</th><th>Forma de pago</th><th class="r">Monto</th></tr>${pays.map((x) => `<tr><td>${esc(x.number)}</td><td>${fmtDate(x.date)}</td><td>${esc(methodLabel(x.method))}${x.reference ? ' · ref. ' + esc(x.reference) : ''}</td><td class="r">${usd(x.amount)}</td></tr>`).join('')}</table>` : ''}
    ${bal > 0.009 ? banksPrint() : ''}
    <div class="grid" style="margin-top:12px;align-items:center"><div class="muted" style="font-size:10.5px">${esc(store.settings.receiptNote || '')}${o.warrantyUntil ? `<br><b>Garantía hasta el ${fmtDate(o.warrantyUntil)}.</b>` : ''}<br>Presente este comprobante para retirar sus lentes.</div>${qr ? `<div class="qr"><img src="${qr}" alt="">Sigue tu pedido en línea</div>` : ''}</div>
    <div class="sign"><div>Recibido por<br><small>${esc(store.businessName)}</small></div><div>Cliente<br><small>${esc(o.patientName || '')}</small></div></div>
    <div class="foot">SanoÓptica · ${fmtDateTime(new Date().toISOString())}</div></body></html>`);
}

/** Orden para el laboratorio: graduación (cilindro negativo), medidas, cristal y montura, sin precios */
export function printLabOrder(o) {
  const p = o.patientId ? store.patient(o.patientId) : null;
  const l = o.lens || {};
  const tr = (l.treatments || []).map((id) => store.treatment(id)?.name || id);
  printHTML(`<!DOCTYPE html><html><head>${PRINT_HEAD}<title>Laboratorio ${esc(o.number)}</title><style>${baseCSS} .rx td { font-size: 16px; }</style></head><body>
    ${bizHead(`<b style="font-size:15px">ORDEN AL LABORATORIO</b><div class="big">${esc(o.number)}</div><div>${esc(o.labName || '')}</div>${o.labRef ? `<div>Ref. lab: <b>${esc(o.labRef)}</b></div>` : ''}<div>Enviada: ${fmtDate(o.sentAt || todayKey())}</div>${o.promised ? `<div>Requerida: <b>${fmtDate(o.promised)}</b></div>` : ''}`)}
    <div class="box"><b>Paciente:</b> ${esc(p?.name || o.patientName || '')} ${p?.code ? `· ${esc(p.code)}` : ''}${p?.birthDate ? ` · ${ageOf(p.birthDate)} años` : ''}</div>
    <h2>Graduación (transpuesta a cilindro negativo)</h2>
    ${rxTablePrint(o.rx || {}, { minus: true })}
    <h2>Cristales</h2>
    <table><tr><th>Diseño</th><th>Material</th><th>Tratamientos</th><th>Color / tinte</th></tr><tr><td>${esc(LENS_TYPES[l.type]?.label || '—')}${l.design ? ` · ${esc(l.design)}` : ''}</td><td>${esc(LENS_MATERIALS[l.material] || '—')}</td><td>${esc(tr.join(', ') || 'Ninguno')}</td><td>${esc(l.tint || 'Blanco')}</td></tr></table>
    <h2>Montura</h2>
    <table><tr><th>Montura</th><th>Tipo</th><th class="c">Calibre</th><th class="c">Puente</th><th class="c">Varilla</th></tr><tr><td>${esc(o.frame?.own ? 'Propia del paciente' : o.frame?.name || '—')}</td><td>${esc(o.frame?.type || '—')}</td><td class="c">${esc(o.frame?.eye || '—')}</td><td class="c">${esc(o.frame?.bridge || '—')}</td><td class="c">${esc(o.frame?.temple || '—')}</td></tr></table>
    ${o.frame?.notes || o.notes ? `<h2>Observaciones</h2><p>${esc([o.frame?.notes, o.notes].filter(Boolean).join(' · '))}</p>` : ''}
    <div class="sign"><div>Elaborado por<br><small>${esc(store.businessName)}</small></div><div>Recibido por el laboratorio</div></div>
    <div class="foot">SanoÓptica · ${fmtDateTime(new Date().toISOString())}</div></body></html>`);
}

function banksPrint() {
  const list = (store.settings.banks || []).filter((b) => b.active !== false);
  if (!list.length) return '';
  return `<h2>Formas de pago</h2><table>${list.map((b) => `<tr><td><b>${esc(b.type === 'pagomovil' ? 'Pago móvil' : b.type === 'zelle' ? 'Zelle' : b.type === 'efectivo' ? 'Efectivo' : 'Transferencia')}</b></td><td>${esc([b.bank, b.number, b.phone, b.email, b.holder, b.idDoc].filter(Boolean).join(' · '))}</td></tr>`).join('')}</table>`;
}

/** Recibo de pago */
export function printPayment(p) {
  const o = store.order(p.orderId);
  printHTML(`<!DOCTYPE html><html><head>${PRINT_HEAD}<title>${esc(p.number)}</title><style>${baseCSS}</style></head><body>
    ${bizHead()}
    <div class="grid"><div class="box"><div class="muted">Recibo de pago</div><div class="big">N° ${esc(p.number)}</div><div>Fecha: ${fmtDate(p.date)}</div><div>Orden: <b>${esc(p.orderNumber || '')}</b></div>${p.status === 'anulado' ? '<div><b>*** ANULADO ***</b></div>' : ''}</div>${patientBox(store.patient(p.patientId), { patientName: p.patientName, patientCode: p.patientCode })}</div>
    <table><tr><th>Concepto</th><th>Forma de pago</th><th class="r">Monto</th></tr>
      <tr><td>${p.kind === 'pago' ? 'Pago total' : 'Abono'} de la ${esc(o ? kindLabel(o).toLowerCase() : 'orden')} ${esc(p.orderNumber || '')}</td><td>${esc(methodLabel(p.method))}${p.bank ? ' · ' + esc(p.bank) : ''}${p.reference ? ' · ref. ' + esc(p.reference) : ''}</td><td class="r">${usd(p.amount)}${p.amountBs ? `<br><small>${esc(fx()?.sym || 'Bs')} ${num(p.amountBs, 2)} · tasa ${num(p.rate, 2)}</small>` : ''}</td></tr></table>
    ${o ? `<div style="margin-top:8px">Total de la orden: <b>${usd(o.total)}</b> · Abonado: <b>${usd(o.paid)}</b> · ${orderBalance(o) > 0.009 ? `Resta: <b class="bad">${usd(orderBalance(o))}</b>` : '<b class="ok">PAGADA</b>'}</div>` : ''}
    <div class="sign"><div>Recibido por<br><small>${esc(store.businessName)}</small></div></div>
    <div class="foot">SanoÓptica · ${fmtDateTime(new Date().toISOString())}</div></body></html>`);
}

/** Estado de cuenta del paciente */
export function printStatement(p, orders = [], payments = []) {
  const rows = [
    ...orders.filter((o) => o.status !== 'anulada').map((o) => ({ date: o.date, text: `${kindLabel(o)} ${o.number} · ${itemsText(o).slice(0, 80)}`, debit: Number(o.total) || 0, credit: 0 })),
    ...payments.filter((x) => x.status === 'confirmado').map((x) => ({ date: x.date, text: `Pago ${x.number} · ${methodLabel(x.method)}${x.reference ? ' ref. ' + x.reference : ''}`, debit: 0, credit: Number(x.amount) || 0 }))
  ].sort((a, b) => a.date.localeCompare(b.date));
  let run = 0;
  const bal = store.balanceOf(p.id);
  printHTML(`<!DOCTYPE html><html><head>${PRINT_HEAD}<title>Estado de cuenta ${esc(p.name)}</title><style>${baseCSS}</style></head><body>${bizHead()}
    <h1 style="font-size:16px">Estado de cuenta · ${esc(p.name)}</h1>
    <div class="muted">Historia ${esc(p.code || '')}${p.idDoc ? ` · ${esc(loc().id)} ${esc(p.idDoc)}` : ''} · Al ${fmtLongDate()}</div>
    <table><tr><th>Fecha</th><th>Movimiento</th><th class="r">Cargo</th><th class="r">Abono</th><th class="r">Saldo</th></tr>
    ${rows.map((r) => { run = Math.round((run + r.debit - r.credit) * 100) / 100; return `<tr><td>${fmtDate(r.date)}</td><td>${esc(r.text)}</td><td class="r">${r.debit ? usd(r.debit) : ''}</td><td class="r">${r.credit ? usd(r.credit) : ''}</td><td class="r">${usd(run)}</td></tr>`; }).join('')}
    <tr class="tot"><td colspan="4">${bal > 0.009 ? 'SALDO PENDIENTE' : 'AL DÍA'}</td><td class="r">${usd(bal)}</td></tr></table>
    ${bal > 0.009 ? banksPrint() : ''}
    <div class="foot">Documento generado por SanoÓptica · ${fmtDateTime(new Date().toISOString())}</div></body></html>`);
}

/** Etiquetas de precio para monturas y productos (código + QR) */
export async function printLabels(list) {
  const items = await Promise.all(list.map(async (p) => ({ p, qr: p.code ? await qrDataURL(p.code, 2) : '' })));
  const css = `@page { margin: 8mm; } body { font-family: Arial, Helvetica, sans-serif; margin: 0; } .wrap { display: flex; flex-wrap: wrap; gap: 3mm; }
    .lb { width: 62mm; height: 24mm; border: 0.3mm dashed #999; border-radius: 2mm; display: flex; gap: 2mm; padding: 2mm; box-sizing: border-box; page-break-inside: avoid; align-items: center; }
    .lb img { width: 19mm; height: 19mm; } .lb b { font-size: 3.2mm; display: block; line-height: 1.15; } .lb small { font-size: 2.5mm; color: #444; display: block; } .lb .pr { font-size: 4.6mm; font-weight: bold; color: #0369a1; margin-top: .6mm; }`;
  printHTML(`<!DOCTYPE html><html><head>${PRINT_HEAD}<title>Etiquetas</title><style>${css}</style></head><body><div class="wrap">
    ${items.map(({ p, qr }) => `<div class="lb">${qr ? `<img src="${qr}" alt="">` : ''}<div><b>${esc(productLabel(p))}</b><small>${esc([p.code, sizeText(p), p.material].filter(Boolean).join(' · '))}</small><div class="pr">${usd(p.price)}</div></div></div>`).join('')}
  </div></body></html>`);
}

/** Documento imprimible genérico (reportes, listados) */
export function printDoc(title, inner, { landscape = false } = {}) {
  printHTML(`<!DOCTYPE html><html><head>${PRINT_HEAD}<title>${esc(title)}</title><style>${baseCSS} @page { margin: 12mm; ${landscape ? 'size: landscape;' : ''} }</style></head><body>
  ${bizHead()}<h1 style="font-size:16px">${esc(title)}</h1><div class="muted">Generado ${fmtDateTime(new Date().toISOString())}</div>
  ${inner}
  <p class="foot">SanoÓptica — Gestión de ópticas</p></body></html>`);
}
export { usd, bs, amt as moneyBoth, spherEq };
