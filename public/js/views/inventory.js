// SanoÓptica — Inventario: monturas, lentes de sol y de contacto, soluciones y accesorios
import { store } from '../store.js';
import { esc, usd, num, emptyState, toast, openModal, setBusy, parseNum, normalize, todayKey, fmtDate, toCSV, download, compressImage, promptDialog, confirmDialog } from '../utils.js';
import { icon } from '../icons.js';
import { PRODUCT_CATS, FRAME_MATERIALS, FRAME_TYPES, GENDERS, productLabel, sizeText, stockTone, margin } from '../optica.js';
import { saveProduct, adjustStock } from '../ops.js';
import { printLabels } from '../shared.js';
import { requirePin } from '../auth.js';

export function productForm(p = null, preset = {}) {
  return new Promise((resolve) => {
    const d = { cat: 'montura', track: true, min: 1, ...preset, ...(p || {}) };
    let photo = d.photo || ''; let done = false;
    const m = openModal({
      title: p ? 'Editar producto' : 'Nuevo producto', size: 'lg',
      body: `<form data-f class="stack">
        <div class="cat-pick">${Object.entries(PRODUCT_CATS).map(([k, c]) => `<label><input type="radio" name="cat" value="${k}" ${d.cat === k ? 'checked' : ''}><span>${icon(c.icon)}${esc(c.one)}</span></label>`).join('')}</div>
        <div class="row" style="gap:14px;align-items:flex-start"><label class="photo-pick prod-photo" data-ph>${photo ? `<img src="${photo}" alt="">` : `${icon('camera')}<small>Foto</small>`}<input type="file" accept="image/*" hidden data-file></label>
        <div class="form-grid grow">
          <div class="field"><label>Marca</label><input class="input" name="brand" value="${esc(d.brand || '')}" placeholder="Ray-Ban, Vogue, genérica…"></div>
          <div class="field"><label>Modelo / nombre</label><input class="input" name="model" value="${esc(d.model || d.name || '')}" placeholder="RB5154"></div>
          <div class="field"><label>Código o código de barras</label><input class="input" name="code" value="${esc(d.code || '')}" placeholder="Se puede escanear"></div>
          <div class="field"><label>Color</label><input class="input" name="color" value="${esc(d.color || '')}" placeholder="Negro mate"></div></div></div>
        <div class="form-grid form-grid-3" data-fr>
          <div class="field"><label>Material</label><select class="input select" name="material"><option value=""></option>${FRAME_MATERIALS.map((x) => `<option ${d.material === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></div>
          <div class="field"><label>Tipo de aro</label><select class="input select" name="frameType"><option value=""></option>${FRAME_TYPES.map((x) => `<option ${d.frameType === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></div>
          <div class="field"><label>Para</label><select class="input select" name="gender">${Object.entries(GENDERS).map(([k, x]) => `<option value="${k}" ${d.gender === k ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></div>
          <div class="field"><label>Calibre □ puente · varilla</label><div class="row" style="gap:4px"><input class="input" name="eye" value="${esc(d.eye || '')}" placeholder="52" maxlength="3"><input class="input" name="bridge" value="${esc(d.bridge || '')}" placeholder="18" maxlength="3"><input class="input" name="temple" value="${esc(d.temple || '')}" placeholder="140" maxlength="3"></div></div>
          <div class="field"><label>Ubicación</label><input class="input" name="location" value="${esc(d.location || '')}" placeholder="Vitrina 2"></div>
          <div class="field"><label>Proveedor</label><input class="input" name="supplier" value="${esc(d.supplier || '')}"></div></div>
        <div class="form-grid form-grid-3">
          <div class="field"><label>Costo</label><input class="input" name="cost" inputmode="decimal" value="${d.cost ? num(d.cost) : ''}"></div>
          <div class="field"><label>Precio de venta</label><input class="input" name="price" inputmode="decimal" value="${d.price ? num(d.price) : ''}"><span class="hint" data-mg></span></div>
          <div class="field"><label>Mínimo (alerta)</label><input class="input" name="min" inputmode="numeric" value="${d.min ?? 1}"></div>
          ${p ? '' : '<div class="field"><label>Existencia inicial</label><input class="input" name="stock" inputmode="numeric" value="1"></div>'}
          <label class="check" style="align-self:end"><input type="checkbox" name="track" ${d.track !== false ? 'checked' : ''}> <span>Controlar existencia</span></label></div>
        <div class="error-msg" data-err></div></form>`,
      footer: `<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" data-ok>${icon('check')} Guardar</button>`,
      onClose: () => { if (!done) resolve(null); }
    });
    const F = m.el.querySelector('[data-f]').elements;
    const sync = () => { const c = [...F.cat].find((x) => x.checked)?.value; m.el.querySelector('[data-fr]').hidden = !['montura', 'sol'].includes(c); const pr = parseNum(F.price.value); m.el.querySelector('[data-mg]').textContent = pr > 0 ? `Margen ${margin({ price: pr, cost: parseNum(F.cost.value) })}%` : ''; };
    [...F.cat].forEach((x) => x.onchange = sync); F.price.oninput = sync; F.cost.oninput = sync; sync();
    m.el.querySelector('[data-file]').onchange = async (e) => { const f = e.target.files[0]; if (!f) return; photo = await compressImage(f, 360, 0.72); m.el.querySelector('[data-ph]').innerHTML = `<img src="${photo}" alt=""><input type="file" accept="image/*" hidden data-file>`; };
    m.el.querySelector('[data-ok]').onclick = async (e) => {
      const err = m.el.querySelector('[data-err]'); err.textContent = '';
      const btn = e.currentTarget; setBusy(btn, true);
      try {
        const cat = [...F.cat].find((x) => x.checked)?.value || 'montura';
        const r = await saveProduct({ cat, brand: F.brand.value, model: F.model.value, name: [F.brand.value, F.model.value].filter(Boolean).join(' '), code: F.code.value, color: F.color.value, material: F.material.value, frameType: F.frameType.value, gender: F.gender.value, eye: F.eye.value, bridge: F.bridge.value, temple: F.temple.value, location: F.location.value, supplier: F.supplier.value, cost: parseNum(F.cost.value), price: parseNum(F.price.value), min: F.min.value, stock: F.stock?.value, track: F.track.checked, photo }, p?.id || null);
        done = true; m.close(); resolve(r); toast(p ? 'Producto actualizado' : 'Producto agregado');
      } catch (ex) { err.textContent = ex.message; setBusy(btn, false); }
    };
  });
}

function stockDialog(p) {
  const m = openModal({
    title: `Existencia · ${esc(productLabel(p))}`, size: 'sm', sub: `Hay ${p.stock} en existencia.`,
    body: `<form data-f class="stack"><div class="seg">${[['compra', 'Entrada (compra)'], ['salida', 'Salida / ajuste']].map(([k, l], i) => `<button type="button" data-k="${k}" class="${i ? '' : 'on'}">${l}</button>`).join('')}</div>
      <div class="form-grid"><div class="field"><label>Cantidad</label><input class="input input-lg" name="qty" inputmode="numeric" value="1"></div><div class="field" data-cw><label>Costo unitario</label><input class="input" name="cost" inputmode="decimal" value="${p.cost ? num(p.cost) : ''}"></div></div>
      <div class="field" data-rw hidden><label>Motivo</label><select class="input select" name="reason"><option value="ajuste">Ajuste de conteo</option><option value="dano">Dañado / roto</option><option value="muestra">Muestra / exhibición</option><option value="devolucion">Devolución al proveedor</option></select></div>
      <div class="field"><label>Nota</label><input class="input" name="note" placeholder="Factura, proveedor…"></div><div class="error-msg" data-err></div></form>`,
    footer: `<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" data-ok>${icon('check')} Registrar</button>`
  });
  let k = 'compra';
  const F = m.el.querySelector('[data-f]').elements;
  m.el.querySelectorAll('[data-k]').forEach((b) => b.onclick = () => { k = b.dataset.k; m.el.querySelectorAll('[data-k]').forEach((x) => x.classList.toggle('on', x === b)); m.el.querySelector('[data-cw]').hidden = k !== 'compra'; m.el.querySelector('[data-rw]').hidden = k === 'compra'; });
  m.el.querySelector('[data-ok]').onclick = async (e) => {
    const q = Math.abs(parseInt(F.qty.value, 10) || 0);
    setBusy(e.currentTarget, true);
    try { await adjustStock(p, k === 'compra' ? q : -q, k === 'compra' ? 'compra' : F.reason.value, F.note.value, k === 'compra' ? parseNum(F.cost.value) : null); m.close(); toast('Existencia actualizada'); }
    catch (ex) { m.el.querySelector('[data-err]').textContent = ex.message; setBusy(e.currentTarget, false); }
  };
}

export function mount(el, { params = {} }) {
  let cat = ''; let q = ''; let filter = params.tab || 'todos'; let sel = new Set(); let limit = 80;
  el.innerHTML = `
    <div class="view-header"><div><h1 class="view-title">Inventario</h1><p class="view-sub">Monturas, lentes de sol y de contacto, soluciones y accesorios con alerta de existencia mínima.</p></div>
      <div class="view-actions"><button class="btn btn-primary" id="i-new">${icon('plus')} Nuevo producto</button><button class="btn btn-secondary" id="i-lbl">${icon('qr')} Etiquetas</button><button class="btn btn-ghost" id="i-csv">${icon('download')} Exportar</button></div></div>
    <div class="kpis kpis-4" id="i-kpis"></div>
    <div class="toolbar mt"><label class="search grow">${icon('search')}<input id="i-q" placeholder="Código, marca, modelo o color…" autocomplete="off"></label><select class="input select" id="i-cat" style="max-width:200px"><option value="">Todas las categorías</option>${Object.entries(PRODUCT_CATS).map(([k, c]) => `<option value="${k}">${esc(c.label)}</option>`).join('')}</select></div>
    <div class="chips mt-sm" id="i-f"></div>
    <div id="i-list" class="mt"></div>`;
  const $ = (s) => el.querySelector(s);
  $('#i-new').onclick = () => productForm(null, cat ? { cat } : {});
  $('#i-q').oninput = (e) => { q = e.target.value; limit = 80; list(); };
  $('#i-cat').onchange = (e) => { cat = e.target.value; list(); };
  $('#i-csv').onclick = () => { const rows = store.liveProducts.map((p) => ({ Codigo: p.code || '', Categoria: PRODUCT_CATS[p.cat]?.one || p.cat, Marca: p.brand || '', Modelo: p.model || p.name, Color: p.color || '', Medidas: sizeText(p), Existencia: p.stock, Minimo: p.min || 0, Costo: p.cost || 0, Precio: p.price || 0, Ubicacion: p.location || '' })); download(`inventario-${todayKey()}.csv`, toCSV(rows)); toast(`${rows.length} productos exportados`); };
  $('#i-lbl').onclick = () => { const list = sel.size ? [...sel].map((id) => store.product(id)).filter(Boolean) : filtered().slice(0, 60); if (!list.length) { toast('No hay productos para imprimir', 'warning'); return; } printLabels(list); };
  function kpis() {
    const live = store.liveProducts.filter((p) => p.track !== false);
    const units = live.reduce((a, p) => a + Math.max(0, Number(p.stock) || 0), 0);
    const cost = live.reduce((a, p) => a + Math.max(0, Number(p.stock) || 0) * (Number(p.cost) || 0), 0);
    const value = live.reduce((a, p) => a + Math.max(0, Number(p.stock) || 0) * (Number(p.price) || 0), 0);
    $('#i-kpis').innerHTML = `
      <div class="card kpi"><div class="kpi-top"><span class="kpi-label">Productos</span><span class="kpi-icon tone-brand">${icon('frame')}</span></div><div class="kpi-value">${store.liveProducts.length}</div><div class="kpi-sub">${units} unidades</div></div>
      <div class="card kpi"><div class="kpi-top"><span class="kpi-label">Monturas</span><span class="kpi-icon tone-info">${icon('glasses')}</span></div><div class="kpi-value">${live.filter((p) => p.cat === 'montura').reduce((a, p) => a + Math.max(0, Number(p.stock) || 0), 0)}</div><div class="kpi-sub">en vitrina</div></div>
      <div class="card kpi"><div class="kpi-top"><span class="kpi-label">Invertido</span><span class="kpi-icon tone-violet">${icon('box')}</span></div><div class="kpi-value">${usd(cost)}</div><div class="kpi-sub">a precio de venta ${usd(value)}</div></div>
      <div class="card kpi kpi-link" data-low><div class="kpi-top"><span class="kpi-label">Poca existencia</span><span class="kpi-icon tone-warning">${icon('alert')}</span></div><div class="kpi-value">${store.lowStock.length}</div><div class="kpi-sub">en o bajo el mínimo</div></div>`;
    $('[data-low]').onclick = () => { filter = 'bajo'; chips(); list(); };
  }
  function chips() {
    $('#i-f').innerHTML = [['todos', 'Todos'], ['bajo', 'Poca existencia'], ['agotado', 'Agotados'], ['sinmov', 'Sin venta 90 días'], ['inactivos', 'Inactivos']].map(([k, l]) => `<button class="chip ${filter === k ? 'on' : ''}" data-f="${k}">${l}</button>`).join('') + (sel.size ? ` <span class="t-sub">${sel.size} seleccionado(s) <button class="linkish text-brand" id="i-uns">quitar</button></span>` : '');
    el.querySelectorAll('[data-f]').forEach((b) => b.onclick = () => { filter = b.dataset.f; limit = 80; chips(); list(); });
    $('#i-uns')?.addEventListener('click', () => { sel.clear(); chips(); list(); });
  }
  const filtered = () => {
    const t = normalize(q); const old = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
    let rows = filter === 'inactivos' ? store.products.filter((p) => p.active === false) : store.liveProducts;
    if (filter === 'bajo') rows = store.lowStock;
    if (filter === 'agotado') rows = rows.filter((p) => p.track !== false && Number(p.stock) <= 0);
    if (filter === 'sinmov') rows = rows.filter((p) => p.track !== false && Number(p.stock) > 0 && (p.lastSaleAt || (p.createdAt || '').slice(0, 10)) < old);
    if (cat) rows = rows.filter((p) => p.cat === cat);
    if (t) rows = rows.filter((p) => normalize(`${p.code} ${p.brand} ${p.model} ${p.name} ${p.color} ${p.supplier}`).includes(t));
    return rows;
  };
  function list() {
    const all = filtered(); const rows = all.slice(0, limit);
    $('#i-list').innerHTML = rows.length ? `<div class="card card-flush"><div class="table-wrap"><table class="table table-cards inv-table"><thead><tr><th style="width:30px"><input type="checkbox" id="i-all"></th><th>Producto</th><th class="hide-sm">Categoría</th><th class="hide-sm">Medidas</th><th class="r">Existencia</th><th class="r hide-sm">Costo</th><th class="r">Precio</th><th></th></tr></thead><tbody>
      ${rows.map((p) => { const c = PRODUCT_CATS[p.cat] || PRODUCT_CATS.accesorio; return `<tr class="${p.active === false ? 'is-void' : ''}"><td><input type="checkbox" data-s="${p.id}" ${sel.has(p.id) ? 'checked' : ''}></td>
        <td><div class="row" style="gap:10px;flex-wrap:nowrap"><span class="kpi-icon" style="width:36px;height:36px;flex:none;background:color-mix(in srgb, ${c.color} 15%, transparent);color:${c.color}">${p.photo ? `<img src="${p.photo}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:inherit">` : icon(c.icon)}</span><div style="min-width:0"><b class="ellipsis">${esc(productLabel(p))}</b><div class="t-sub">${esc([p.code, p.color].filter(Boolean).join(' · '))}</div></div></div></td>
        <td class="hide-sm">${esc(c.one)}</td><td class="hide-sm">${esc(sizeText(p) || '—')}</td>
        <td class="r"><b class="text-${stockTone(p)}">${p.track === false ? '—' : p.stock}</b>${p.track !== false && p.min ? `<div class="t-sub">mín. ${p.min}</div>` : ''}</td>
        <td class="r num hide-sm">${usd(p.cost || 0)}</td><td class="r num"><b>${usd(p.price || 0)}</b>${Number(p.price) > 0 && Number(p.cost) > 0 ? `<div class="t-sub">${margin(p)}%</div>` : ''}</td>
        <td class="r nowrap">${p.track !== false && p.active !== false ? `<button class="btn btn-ghost btn-icon btn-sm" data-st="${p.id}" title="Entrada / salida">${icon('box')}</button>` : ''}<button class="btn btn-ghost btn-icon btn-sm" data-ed="${p.id}" title="Editar">${icon('edit')}</button><button class="btn btn-ghost btn-icon btn-sm" data-tg="${p.id}" title="${p.active === false ? 'Reactivar' : 'Desactivar'}">${icon(p.active === false ? 'refresh' : 'archive')}</button></td></tr>`; }).join('')}
      </tbody></table></div></div>${all.length > limit ? `<div class="center mt"><button class="btn btn-secondary" id="i-more">Ver más (${all.length - limit})</button></div>` : ''}`
      : `<div class="card">${emptyState('frame', q || filter !== 'todos' ? 'Sin resultados' : 'Inventario vacío', q || filter !== 'todos' ? 'No hay productos en este filtro.' : 'Agrega tus monturas, lentes de sol y de contacto para venderlos y usarlos en las órdenes.')}</div>`;
    $('#i-more')?.addEventListener('click', () => { limit += 80; list(); });
    $('#i-all')?.addEventListener('change', (e) => { rows.forEach((p) => e.target.checked ? sel.add(p.id) : sel.delete(p.id)); chips(); list(); });
    el.querySelectorAll('[data-s]').forEach((c) => c.onchange = () => { c.checked ? sel.add(c.dataset.s) : sel.delete(c.dataset.s); chips(); });
    el.querySelectorAll('[data-st]').forEach((b) => b.onclick = () => stockDialog(store.product(b.dataset.st)));
    el.querySelectorAll('[data-ed]').forEach((b) => b.onclick = () => productForm(store.product(b.dataset.ed)));
    el.querySelectorAll('[data-tg]').forEach((b) => b.onclick = async () => { const p = store.product(b.dataset.tg); if (p.active !== false && !(await confirmDialog({ title: 'Desactivar producto', message: `${productLabel(p)} dejará de aparecer en ventas y órdenes.`, confirmText: 'Desactivar' }))) return; await saveProduct({ ...p, active: p.active === false }, p.id); toast(p.active === false ? 'Producto reactivado' : 'Producto desactivado'); });
  }
  void requirePin; void promptDialog; void fmtDate;
  kpis(); chips(); list();
  const off = store.on('*', (evt) => { if (evt === 'products') { kpis(); list(); } });
  return off;
}
