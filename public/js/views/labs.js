// SanoÓptica — Laboratorios y lista de precios de cristales y tratamientos
import { store } from '../store.js';
import { esc, usd, num, emptyState, toast, openModal, setBusy, parseNum, round2, shortId, confirmDialog, waLink } from '../utils.js';
import { icon } from '../icons.js';
import { LENS_TYPES, LENS_MATERIALS, orderLate } from '../optica.js';
import { saveLab } from '../ops.js';
import { openOrder } from '../order.js';

function labForm(l = null) {
  const d = l || { days: 5 };
  const m = openModal({
    title: l ? 'Editar laboratorio' : 'Nuevo laboratorio', size: 'md',
    body: `<form class="form-grid" data-f>
      <div class="field full"><label>Nombre</label><input class="input" name="name" value="${esc(d.name || '')}" placeholder="Laboratorio Óptico Central"></div>
      <div class="field"><label>Persona de contacto</label><input class="input" name="contact" value="${esc(d.contact || '')}"></div>
      <div class="field"><label>Días de entrega</label><input class="input" name="days" inputmode="numeric" value="${esc(String(d.days ?? 5))}"><span class="hint">Calcula la fecha prometida al paciente.</span></div>
      <div class="field"><label>Teléfono</label><input class="input" name="phone" value="${esc(d.phone || '')}" inputmode="tel"></div>
      <div class="field"><label>WhatsApp</label><input class="input" name="whatsapp" value="${esc(d.whatsapp || '')}" inputmode="tel"></div>
      <div class="field full"><label>Correo</label><input class="input" name="email" value="${esc(d.email || '')}" type="email"></div>
      <div class="field full"><label>Dirección</label><input class="input" name="address" value="${esc(d.address || '')}"></div>
      <div class="field full"><label>Notas</label><textarea class="input textarea" name="notes" rows="2">${esc(d.notes || '')}</textarea></div>
      <div class="error-msg full" data-err></div></form>`,
    footer: `<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" data-ok>${icon('check')} Guardar</button>`
  });
  m.el.querySelector('[data-ok]').onclick = async (e) => {
    const F = m.el.querySelector('[data-f]').elements; setBusy(e.currentTarget, true);
    try { await saveLab({ name: F.name.value, contact: F.contact.value, days: F.days.value, phone: F.phone.value, whatsapp: F.whatsapp.value, email: F.email.value, address: F.address.value, notes: F.notes.value, active: l ? l.active !== false : true }, l?.id || null); m.close(); toast('Laboratorio guardado'); }
    catch (ex) { m.el.querySelector('[data-err]').textContent = ex.message; setBusy(e.currentTarget, false); }
  };
}

function priceForm(kind, item = null) {
  const isLens = kind === 'lens';
  const d = item || (isLens ? { type: 'monofocal', material: 'cr39' } : {});
  const m = openModal({
    title: `${item ? 'Editar' : 'Nuevo'} ${isLens ? 'cristal' : 'tratamiento'}`, size: 'sm',
    body: `<form class="stack" data-f><div class="field"><label>Nombre</label><input class="input" name="name" value="${esc(d.name || '')}" placeholder="${isLens ? 'Monofocal policarbonato' : 'Antirreflejo premium'}"></div>
      ${isLens ? `<div class="form-grid"><div class="field"><label>Tipo</label><select class="input select" name="type">${Object.entries(LENS_TYPES).filter(([k]) => k !== 'contacto').map(([k, t]) => `<option value="${k}" ${d.type === k ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}</select></div><div class="field"><label>Material</label><select class="input select" name="material">${Object.entries(LENS_MATERIALS).map(([k, x]) => `<option value="${k}" ${d.material === k ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></div></div>` : ''}
      <div class="form-grid"><div class="field"><label>Precio al paciente</label><input class="input" name="price" inputmode="decimal" value="${d.price != null ? num(d.price) : ''}"></div><div class="field"><label>Costo del laboratorio</label><input class="input" name="cost" inputmode="decimal" value="${d.cost != null ? num(d.cost) : ''}"></div></div>
      <div class="error-msg" data-err></div></form>`,
    footer: `${item ? `<button class="btn btn-ghost text-danger" data-del>${icon('trash')} Quitar</button>` : ''}<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" data-ok>${icon('check')} Guardar</button>`
  });
  const key = isLens ? 'lensCatalog' : 'treatments';
  const list = () => (isLens ? store.lensCatalog : store.treatments).slice();
  m.el.querySelector('[data-ok]').onclick = async (e) => {
    const F = m.el.querySelector('[data-f]').elements;
    const name = F.name.value.trim();
    if (!name) { m.el.querySelector('[data-err]').textContent = 'Escribe el nombre.'; return; }
    setBusy(e.currentTarget, true);
    const row = { id: item?.id || (isLens ? 'l' : 't') + shortId(6), name, price: round2(parseNum(F.price.value)), cost: round2(parseNum(F.cost.value)), ...(isLens ? { type: F.type.value, material: F.material.value } : {}) };
    const arr = list(); const i = arr.findIndex((x) => x.id === row.id);
    if (i >= 0) arr[i] = row; else arr.push(row);
    await store.saveSettings({ [key]: arr }); m.close(); toast('Lista de precios actualizada');
  };
  m.el.querySelector('[data-del]')?.addEventListener('click', async () => {
    if (!(await confirmDialog({ title: 'Quitar de la lista', message: `${item.name} ya no aparecerá al armar nuevas órdenes. Las órdenes anteriores no cambian.`, confirmText: 'Quitar' }))) return;
    await store.saveSettings({ [key]: list().filter((x) => x.id !== item.id) }); m.close(); toast('Quitado de la lista');
  });
}

export function mount(el, { params = {} }) {
  let tab = params.tab || 'labs';
  el.innerHTML = `
    <div class="view-header"><div><h1 class="view-title">Laboratorios y precios</h1><p class="view-sub">Tus laboratorios con sus tiempos de entrega, y la lista de precios de cristales y tratamientos que usas al armar las órdenes.</p></div>
      <div class="view-actions" id="l-act"></div></div>
    <div class="tabs" id="l-tabs"></div><div id="l-body" class="mt"></div>`;
  const $ = (s) => el.querySelector(s);
  function labs() {
    $('#l-act').innerHTML = `<button class="btn btn-primary" id="l-new">${icon('plus')} Nuevo laboratorio</button>`;
    $('#l-new').onclick = () => labForm();
    const list = store.labs.slice().sort((a, b) => (a.active === false) - (b.active === false));
    $('#l-body').innerHTML = list.length ? `<div class="grid-cards">${list.map((l) => {
      const inLab = store.orders.filter((o) => o.labId === l.id && ['laboratorio', 'garantia'].includes(o.status));
      const late = inLab.filter((o) => orderLate(o) > 0).length;
      const done = store.orders.filter((o) => o.labId === l.id && o.receivedAt && o.sentAt);
      const avg = done.length ? Math.round(done.reduce((a, o) => a + (new Date(o.receivedAt) - new Date(o.sentAt)) / 864e5, 0) / done.length * 10) / 10 : null;
      return `<div class="card lab-card ${l.active === false ? 'is-void' : ''}">
        <div class="row" style="gap:10px"><span class="kpi-icon tone-violet" style="width:44px;height:44px">${icon('lab')}</span><div class="grow" style="min-width:0"><b class="ellipsis">${esc(l.name)}</b><div class="t-sub">${esc(l.contact || '')}${l.phone ? ' · ' + esc(l.phone) : ''}</div></div>${l.active === false ? '<span class="badge badge-neutral">Inactivo</span>' : ''}</div>
        <div class="kv kv-3 mt-sm"><div><span>Promete</span><b>${l.days || 0} días</b></div><div><span>Real</span><b>${avg != null ? avg + ' d' : '—'}</b></div><div><span>En proceso</span><b class="${late ? 'text-danger' : ''}">${inLab.length}${late ? ` (${late} atr.)` : ''}</b></div></div>
        ${inLab.length ? `<div class="chips chips-wrap mt-sm">${inLab.slice(0, 8).map((o) => `<button class="chip ${orderLate(o) ? 'chip-danger' : ''}" data-o="${o.id}">${esc(o.number)}</button>`).join('')}</div>` : ''}
        <div class="row mt-sm" style="gap:6px;flex-wrap:wrap">${l.whatsapp || l.phone ? `<a class="btn btn-whatsapp btn-sm" target="_blank" rel="noopener" href="${waLink(l.whatsapp || l.phone, `Hola${l.contact ? ' ' + l.contact.split(' ')[0] : ''}, te escribimos de ${store.businessName}${inLab.length ? `. Consulta por las órdenes: ${inLab.map((o) => o.labRef || o.number).join(', ')}` : ''}.`)}">${icon('whatsapp')} Escribir</a>` : ''}<button class="btn btn-ghost btn-sm" data-ed="${l.id}">${icon('edit')} Editar</button><button class="btn btn-ghost btn-sm" data-tg="${l.id}">${icon(l.active === false ? 'refresh' : 'archive')} ${l.active === false ? 'Reactivar' : 'Desactivar'}</button></div></div>`; }).join('')}</div>`
      : `<div class="card">${emptyState('lab', 'Sin laboratorios', 'Agrega los laboratorios donde tallan tus cristales para enviarles las órdenes y medir sus tiempos.')}</div>`;
    el.querySelectorAll('[data-o]').forEach((b) => b.onclick = () => openOrder(b.dataset.o));
    el.querySelectorAll('[data-ed]').forEach((b) => b.onclick = () => labForm(store.lab(b.dataset.ed)));
    el.querySelectorAll('[data-tg]').forEach((b) => b.onclick = async () => { const l = store.lab(b.dataset.tg); await saveLab({ ...l, active: l.active === false }, l.id); toast('Laboratorio actualizado'); });
  }
  function prices() {
    $('#l-act').innerHTML = `<button class="btn btn-primary" id="l-nl">${icon('plus')} Cristal</button><button class="btn btn-secondary" id="l-nt">${icon('plus')} Tratamiento</button>`;
    $('#l-nl').onclick = () => priceForm('lens'); $('#l-nt').onclick = () => priceForm('treat');
    const groups = Object.entries(LENS_TYPES).filter(([k]) => k !== 'contacto').map(([k, t]) => ({ k, t, list: store.lensCatalog.filter((l) => l.type === k) })).filter((g) => g.list.length);
    const pct = (p, c) => (p > 0 ? Math.round((1 - c / p) * 100) + '%' : '—');
    $('#l-body').innerHTML = `<div class="grid-2-1">
      <div class="card"><div class="card-head"><div class="card-title">${icon('lens')} Cristales</div><span class="t-sub">${store.lensCatalog.length}</span></div>
        ${groups.length ? groups.map((g) => `<div class="section-title">${esc(g.t.label)}</div><div class="list">${g.list.map((l) => `<button class="list-item linkish" data-l="${l.id}" style="width:100%;text-align:left"><div class="grow" style="min-width:0"><b>${esc(l.name)}</b><div class="t-sub">${esc(LENS_MATERIALS[l.material] || '')} · costo ${usd(l.cost || 0)} · margen ${pct(l.price, l.cost || 0)}</div></div><b class="num">${usd(l.price)}</b></button>`).join('')}</div>`).join('') : emptyState('lens', 'Sin cristales', 'Agrega los cristales que ofreces.')}</div>
      <div class="card"><div class="card-head"><div class="card-title">${icon('sparkle')} Tratamientos</div><span class="t-sub">${store.treatments.length}</span></div>
        ${store.treatments.length ? `<div class="list">${store.treatments.map((t) => `<button class="list-item linkish" data-t="${t.id}" style="width:100%;text-align:left"><div class="grow"><b>${esc(t.name)}</b><div class="t-sub">costo ${usd(t.cost || 0)} · margen ${pct(t.price, t.cost || 0)}</div></div><b class="num">+${usd(t.price)}</b></button>`).join('')}</div>` : emptyState('sparkle', 'Sin tratamientos', 'Antirreflejo, filtro azul, fotocromático…')}
        <div class="box small mt">${icon('info')} Los precios se suman automáticamente al armar la orden. Cambiarlos no altera las órdenes ya registradas.</div></div></div>`;
    el.querySelectorAll('[data-l]').forEach((b) => b.onclick = () => priceForm('lens', store.lens(b.dataset.l)));
    el.querySelectorAll('[data-t]').forEach((b) => b.onclick = () => priceForm('treat', store.treatment(b.dataset.t)));
  }
  function draw() {
    $('#l-tabs').innerHTML = [['labs', `Laboratorios (${store.liveLabs.length})`], ['precios', 'Cristales y tratamientos']].map(([k, l]) => `<button data-t2="${k}" class="${tab === k ? 'on' : ''}">${l}</button>`).join('');
    el.querySelectorAll('[data-t2]').forEach((b) => b.onclick = () => { tab = b.dataset.t2; draw(); });
    tab === 'labs' ? labs() : prices();
  }
  draw();
  const off = store.on('*', (evt) => { if (['labs', 'orders', 'settings'].includes(evt)) draw(); });
  return off;
}
