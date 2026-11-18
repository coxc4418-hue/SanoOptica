// SanoÓptica — Recorrido guiado: ilumina zonas de la pantalla y explica para qué sirven
import { esc, openModal, closeAllModals } from './utils.js';
import { icon } from './icons.js';

// Cada paso: { route, sel: [selectores alternativos], title, text }. Sin elemento visible → tarjeta centrada.
export const TOURS = {
  general: {
    name: 'Recorrido general', desc: 'Lo esencial del sistema en 1 minuto', icon: 'sparkle',
    steps: [
      { route: 'inicio', title: '¡Bienvenido a SanoÓptica! 👓', text: 'En un minuto te mostramos cómo llevar tu óptica aquí: examen visual, órdenes de trabajo con el laboratorio, abonos y saldos, inventario de monturas y avisos por WhatsApp.' },
      { route: 'inicio', sel: ['[data-tour="quick"]'], title: 'Lo que más haces, a un toque', text: 'Examen visual (F2), nueva orden (F3), cobrar (F1) y venta de mostrador. También funcionan con el teclado.' },
      { route: 'inicio', sel: ['[data-tour="kpis"]'], title: 'Cómo va la óptica', text: 'Lo cobrado hoy, las órdenes en curso, lo que te deben, los exámenes del día, las ventas del mes y cuántos examinados terminan comprando.' },
      { route: 'inicio', sel: ['[data-tour="pipeline"]'], title: 'Órdenes en curso', text: 'Cada par de lentes pasa por registrada → laboratorio → control de calidad → lista. La flecha la pasa al siguiente paso y las atrasadas se marcan en rojo.' },
      { route: 'inicio', sel: ['[data-tour="ready"]'], title: 'Listos para retirar', text: 'Con un toque le escribes al paciente por WhatsApp que ya puede pasar, con el saldo que le falta.' },
      { route: 'examenes', sel: ['#e-list', '#view'], title: 'Exámenes visuales', text: 'Agudeza visual, fórmula OD/OI con esfera, cilindro, eje y adición (valida los valores y transpone el cilindro), DP, diagnóstico sugerido y recomendación de cristales. La fórmula se imprime con un QR verificable.' },
      { route: 'ordenes', sel: ['.kboard', '#view'], title: 'Tablero de órdenes', text: 'Mueve el trabajo del día: envía al laboratorio, recibe, pasa el control de calidad y entrega. No deja entregar con saldo pendiente.' },
      { route: 'pacientes', sel: ['#pt-f', '#view'], title: 'Pacientes', text: 'Historia con todas sus fórmulas, órdenes y pagos, su control anual y su portal privado para seguir sus lentes desde el teléfono.' },
      { route: 'inicio', title: '¡Listo! 🎉', text: 'Prueba ahora: haz un examen visual, crea la orden con montura y cristales, y confirma el pago reportado que espera en Cobranza.' }
    ]
  },
  ordenes: {
    name: 'Examen, orden y entrega', desc: 'Del examen visual al paciente con sus lentes', icon: 'glasses',
    steps: [
      { route: 'examenes', sel: ['#e-new', '#view'], title: '1. Examen visual', text: 'Registra la agudeza visual, la refracción de cada ojo, la DP y el diagnóstico. El sistema sugiere el tipo de cristal y el material según la graduación y la edad.' },
      { route: 'examenes', sel: ['#e-list', '#view'], title: '2. Crear la orden', text: 'Desde la fórmula tocas «Crear orden»: eliges la montura del inventario (o la del paciente), los cristales y los tratamientos de tu lista de precios, el laboratorio y el abono.' },
      { route: 'laboratorios', sel: ['#l-body', '#view'], title: '3. Laboratorios y precios', text: 'Cada laboratorio con sus días de entrega: el sistema calcula la fecha prometida y mide cuánto tarda de verdad. Aquí también ajustas los precios de cristales y tratamientos.' },
      { route: 'ordenes', sel: ['.kboard', '#view'], title: '4. Seguimiento', text: 'Imprime la orden para el laboratorio (con el cilindro en negativo y sin precios), marca cuando llega, pasa la lista de control de calidad y avisa al paciente.' },
      { route: 'ordenes', sel: ['#o-view', '#view'], title: '5. Entrega y garantía', text: 'Al entregar se cobra el saldo y empieza la garantía. Si hay un reclamo, la orden vuelve al laboratorio como garantía sin perder su historial.' }
    ]
  },
  dinero: {
    name: 'Cobros, caja y reportes', desc: 'Abonos, pagos del portal, cierre del día y ganancias', icon: 'wallet',
    steps: [
      { route: 'cobranza', sel: ['#c-tabs', '#view'], title: 'Cobranza', text: 'Los pagos que los pacientes reportan desde su portal llegan aquí para que los verifiques con tu banco. También ves quién debe y le recuerdas por WhatsApp.' },
      { route: 'venta', sel: ['#p-grid', '#view'], title: 'Venta de mostrador', text: 'Lentes de sol, de contacto, soluciones y accesorios. Escanea el código de barras o toca el producto; calcula el vuelto en efectivo.' },
      { route: 'caja', sel: ['#k-body', '#view'], title: 'Caja del día', text: 'Lo cobrado por forma de pago, los gastos y el cierre con el conteo del efectivo: te dice si cuadra, falta o sobra.' },
      { route: 'reportes', sel: ['#r-body', '#view'], title: 'Reportes (con PIN)', text: 'Vendido, cobrado, ganancia bruta, ticket promedio, conversión de examen a compra, marcas y cristales más vendidos y tiempos reales de cada laboratorio.' }
    ]
  },
  pacientes: {
    name: 'Portal, agenda y recordatorios', desc: 'Lo que ve el paciente y cómo lo traes de vuelta', icon: 'users',
    steps: [
      { route: 'agenda', sel: ['#a-share', '#view'], title: 'Agenda en línea', text: 'Comparte el enlace o su QR en Instagram y WhatsApp: el paciente elige una hora libre según tu horario y la cita te llega para confirmar.' },
      { route: 'agenda', sel: ['#a-body', '#view'], title: 'Tu agenda', text: 'Las citas del día con las horas libres. Desde la cita empiezas el examen y queda marcada como atendida.' },
      { route: 'recordatorios', sel: ['#r-tabs', '#view'], title: 'Recordatorios', text: 'Controles anuales vencidos, lentes sin retirar, saldos, citas de mañana y cumpleaños: mensajes listos para WhatsApp que quedan marcados al enviarlos.' },
      { route: 'pacientes', sel: ['#pt-list', '#view'], title: 'Portal del paciente', text: 'Abre un paciente › Portal: ve el estado de sus lentes paso a paso, su fórmula, su saldo y las cuentas para pagar, y puede reportar su pago o pedir una cita.' }
    ]
  }
};
let state = null;

const visible = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 4 && r.height > 4 && getComputedStyle(el).visibility !== 'hidden'; };
async function findTarget(sels = [], timeout = 2500) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    for (const s of sels) { const el = [...document.querySelectorAll(s)].find(visible); if (el) return el; }
    await new Promise((r) => setTimeout(r, 120));
  }
  return null;
}

/** Inicia un recorrido (por defecto el general). */
export async function startTour(id = 'general') {
  stopTour();
  const tour = TOURS[id];
  if (!tour) return;
  const root = document.createElement('div');
  root.className = 'tour';
  root.innerHTML = '<div class="tour-block"></div><div class="tour-spot"></div><div class="tour-tip" role="dialog" aria-live="polite"></div>';
  document.body.appendChild(root);
  state = { id, tour, i: 0, root, target: null };
  const onKey = (e) => {
    if (!state) return;
    if (e.key === 'Escape') { e.stopPropagation(); stopTour(); }
    if (e.key === 'ArrowRight') go(1);
    if (e.key === 'ArrowLeft') go(-1);
  };
  const onResize = () => place();
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('resize', onResize);
  window.addEventListener('scroll', onResize, true);
  state.cleanup = () => { window.removeEventListener('keydown', onKey, true); window.removeEventListener('resize', onResize); window.removeEventListener('scroll', onResize, true); };
  await show();
}

export function stopTour() {
  if (!state) return;
  state.cleanup?.();
  state.root.remove();
  state = null;
  try { localStorage.setItem('sc_tour_done', '1'); } catch (_) {}
}
export const tourActive = () => !!state;

async function go(d) {
  if (!state) return;
  const n = state.i + d;
  if (n < 0) return;
  if (n >= state.tour.steps.length) { stopTour(); return; }
  state.i = n;
  await show();
}

async function show() {
  const s = state.tour.steps[state.i];
  const tip = state.root.querySelector('.tour-tip');
  tip.classList.add('busy');
  const { navigate } = await import('./main.js');
  if (s.route && location.hash.replace(/^#\/?/, '') !== s.route) {
    await navigate(s.route);
    await new Promise((r) => setTimeout(r, 350));
  }
  if (!state) return;
  closeAllModals();
  state.target = s.sel ? await findTarget(s.sel) : null;
  if (!state) return;
  if (state.target) state.target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
  const total = state.tour.steps.length;
  tip.innerHTML = `
    <div class="tour-step">${state.i + 1} de ${total}</div>
    <div class="tour-title">${esc(s.title)}</div>
    <div class="tour-text">${esc(s.text)}</div>
    <div class="tour-dots">${Array.from({ length: total }, (_, k) => `<i class="${k === state.i ? 'on' : ''}"></i>`).join('')}</div>
    <div class="tour-actions">
      <button type="button" class="btn btn-ghost btn-sm" data-t="stop">${s.final ? 'Cerrar' : 'Salir'}</button>
      <span class="grow"></span>
      ${state.i > 0 ? `<button type="button" class="btn btn-secondary btn-sm" data-t="prev">${icon('arrowLeft')}</button>` : ''}
      ${s.final && videoOk ? `<button type="button" class="btn btn-secondary btn-sm" data-t="video">${icon('eye')} Ver video</button>` : ''}
      <button type="button" class="btn btn-primary btn-sm" data-t="next">${state.i === total - 1 ? 'Terminar' : 'Siguiente'} ${state.i === total - 1 ? '' : icon('arrowRight')}</button>
    </div>`;
  tip.querySelector('[data-t="stop"]').onclick = stopTour;
  tip.querySelector('[data-t="next"]').onclick = () => go(1);
  const pv = tip.querySelector('[data-t="prev"]'); if (pv) pv.onclick = () => go(-1);
  const vd = tip.querySelector('[data-t="video"]'); if (vd) vd.onclick = () => { stopTour(); openVideo(); };
  tip.classList.remove('busy');
  place();
  tip.querySelector('[data-t="next"]').focus({ preventScroll: true });
}

function place() {
  if (!state) return;
  const spot = state.root.querySelector('.tour-spot');
  const tip = state.root.querySelector('.tour-tip');
  const vw = innerWidth, vh = innerHeight, pad = 8;
  const el = state.target;
  if (!el || !document.contains(el)) {
    spot.style.cssText = `left:${vw / 2}px;top:${vh / 2}px;width:0;height:0;`;
    tip.className = 'tour-tip center';
    tip.style.left = `${Math.max(12, (vw - tip.offsetWidth) / 2)}px`;
    tip.style.top = `${Math.max(12, (vh - tip.offsetHeight) / 2)}px`;
    return;
  }
  const r = el.getBoundingClientRect();
  const x = Math.max(4, r.left - pad), y = Math.max(4, r.top - pad);
  const w = Math.min(vw - x - 4, r.width + pad * 2), h = Math.min(vh - y - 4, r.height + pad * 2);
  spot.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${h}px;`;
  const tw = tip.offsetWidth, th = tip.offsetHeight, gap = 14;
  let left, top, side;
  if (y + h + gap + th <= vh - 8) { side = 'bottom'; top = y + h + gap; left = x + w / 2 - tw / 2; }
  else if (y - gap - th >= 8) { side = 'top'; top = y - gap - th; left = x + w / 2 - tw / 2; }
  else if (x + w + gap + tw <= vw - 8) { side = 'right'; left = x + w + gap; top = y + h / 2 - th / 2; }
  else if (x - gap - tw >= 8) { side = 'left'; left = x - gap - tw; top = y + h / 2 - th / 2; }
  else { side = 'inside'; left = vw / 2 - tw / 2; top = vh - th - 16; }
  left = Math.max(10, Math.min(vw - tw - 10, left));
  top = Math.max(10, Math.min(vh - th - 10, top));
  tip.className = `tour-tip side-${side}`;
  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
}

// ======================================================================
// Ayuda: lista de recorridos y video tutorial
// ======================================================================
export const VIDEO_URL = '/tutorial/sano-optica-tutorial.mp4';

export function openVideo() {
  const m = openModal({
    title: 'Video tutorial', sub: 'Cómo usar SanoÓptica, paso a paso', size: 'xl',
    body: `<video class="tutorial-video" src="${VIDEO_URL}" poster="/tutorial/portada.jpg" controls autoplay playsinline preload="metadata"></video>`,
    footer: '<a class="btn btn-secondary" href="' + VIDEO_URL + '" download>' + icon('download') + ' Descargar</a><button class="btn btn-primary" data-close>Cerrar</button>'
  });
  return m;
}

let videoOk = null;
async function hasVideo() {
  if (videoOk != null) return videoOk;
  try { const r = await fetch(VIDEO_URL, { method: 'HEAD' }); videoOk = r.ok && /video/.test(r.headers.get('content-type') || ''); } catch (_) { videoOk = false; }
  return videoOk;
}

export async function openHelp() {
  const video = await hasVideo();
  const m = openModal({
    title: 'Ayuda', sub: video ? 'Elige un recorrido guiado o mira el video tutorial' : 'Elige un recorrido guiado', size: 'md',
    body: `<div class="stack">
      ${video ? `<button type="button" class="help-video" data-video><span class="help-play">${icon('arrowRight')}</span><span><b>Video tutorial</b><small>Las funciones principales explicadas con voz</small></span></button>` : ''}
      <div class="section-title">Recorridos guiados</div>
      <div class="help-list">${Object.entries(TOURS).map(([k, t]) => `<button type="button" class="help-item" data-tour-id="${k}"><span class="kpi-icon tone-brand" style="width:36px;height:36px">${icon(t.icon)}</span><span class="grow"><b>${esc(t.name)}</b><small>${esc(t.desc)}</small></span>${icon('arrowRight')}</button>`).join('')}</div>
    </div>`,
    footer: '<button class="btn btn-primary" data-close>Cerrar</button>'
  });
  const vb = m.el.querySelector('[data-video]'); if (vb) vb.onclick = () => { m.close(); openVideo(); };
  m.el.querySelectorAll('[data-tour-id]').forEach((b) => b.onclick = () => { m.close(); startTour(b.dataset.tourId); });
}
