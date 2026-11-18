// SanoÓptica — Órdenes de trabajo: armado (fórmula + montura + cristales + tratamientos), seguimiento y entrega
import { store } from './store.js';
import { esc, usd, bs, num, fmtDate, fmtDateTime, toast, openModal, setBusy, parseNum, normalize, round2, todayKey, PAY_METHODS, methodLabel, loc, fx, emptyState, confirmDialog, promptDialog } from './utils.js';
import { icon } from './icons.js';
import {
  ORDER_STATUS, FLOW, nextStatus, LENS_TYPES, LENS_MATERIALS, PRODUCT_CATS, PAY_STATUS, badge, orderBalance, orderTotals, promiseDate, eyeText, productLabel, sizeText, stockTone, orderLate, waitingDays, kindLabel, itemsText, FRAME_TYPES, hasRx
} from './optica.js';
import { createOrder, setOrderStatus, updateOrder, voidOrder, warrantyOrder, voidPayment, lensSummary } from './ops.js';
import { printOrderTicket, printLabOrder, printPayment, waPatient, rxTablePrint } from './shared.js';
import { pickPatient, paymentModal, rxMini, patientAvatar } from './patient.js';
import { isVE } from './bcv.js';

// ======================================================================
// NUEVA ORDEN DE TRABAJO
// ======================================================================
export async function orderForm({ patient = null, exam = null } = {}) {
  let p = patient || await pickPatient({ title: 'Nueva orden · paciente' });
  if (!p) return null;
  return new Promise((resolve) => {
    let done = false;
    let ex = exam || store.lastExam(p.id);
    let frame = null; let ownFrame = false;
    let lensId = '';
    const tr = new Set(ex?.treatments || []);
    let extras = [];
    let discMode = 'monto';
    let manualLens = null;
    const st = store.settings;
    const defaultLab = store.liveLabs[0]?.id || '';
    const m = openModal({
      title: 'Nueva orden de lentes', size: 'xl',
      body: `<div class="order-builder">
        <div class="ob-main stack">
          <div class="ob-step"><span class="ob-n">1</span><div class="grow"><div class="between"><b>Paciente y fórmula</b><button type="button" class="btn btn-ghost btn-sm" data-chp>${icon('refresh')} Cambiar paciente</button></div><div data-pat class="mt-xs"></div></div></div>
          <div class="ob-step"><span class="ob-n">2</span><div class="grow"><div class="between" style="flex-wrap:wrap;gap:6px"><b>Montura</b><label class="check"><input type="checkbox" data-own> <span>El paciente trae su montura</span></label></div><div data-frame class="mt-xs"></div></div></div>
          <div class="ob-step"><span class="ob-n">3</span><div class="grow"><b>Cristales y tratamientos</b><div data-lens class="mt-xs"></div></div></div>
          <div class="ob-step"><span class="ob-n">4</span><div class="grow"><div class="between"><b>Extras</b><div class="row" style="gap:6px"><button type="button" class="btn btn-ghost btn-sm" data-addp>${icon('plus')} Producto</button><button type="button" class="btn btn-ghost btn-sm" data-addc>${icon('plus')} Servicio</button></div></div><div data-extras class="mt-xs"></div></div></div>
          <div class="ob-step"><span class="ob-n">5</span><div class="grow"><b>Laboratorio y entrega</b>
            <div class="form-grid mt-xs">
              <div class="field"><label>Laboratorio</label><select class="input select" data-lab><option value="">— Elegir después —</option>${store.liveLabs.map((l) => `<option value="${l.id}" ${l.id === defaultLab ? 'selected' : ''}>${esc(l.name)}${l.days ? ` · ${l.days} días` : ''}</option>`).join('')}</select></div>
              <div class="field"><label>Fecha prometida</label><input class="input" type="date" data-prom min="${todayKey()}"></div>
              <div class="field"><label>Costo del laboratorio</label><input class="input" data-labcost inputmode="decimal" placeholder="0"><span class="hint">Para calcular tu ganancia (no lo ve el paciente).</span></div>
              <div class="field"><label>Atendido por</label><input class="input" data-seller placeholder="Asesor(a)"></div>
              <div class="field full"><label>Observaciones</label><input class="input" data-notes placeholder="Ej.: biselado brillante, entregar con estuche rígido"></div>
            </div></div></div>
        </div>
        <aside class="ob-side">
          <div class="card ob-sum"><div class="card-title">${icon('receipt')} Resumen</div><div data-items class="mt-sm"></div>
            <div class="row mt-sm" style="gap:6px"><div class="seg seg-sm">${[['monto', loc().sym], ['pct', '%']].map(([k, l]) => `<button type="button" data-dm="${k}" class="${k === 'monto' ? 'on' : ''}">${esc(l)}</button>`).join('')}</div><input class="input grow" data-disc inputmode="decimal" placeholder="Descuento"></div>
            <div data-totals class="mt-sm"></div>
            <div class="divider"></div>
            <div class="field"><label>Abono inicial</label><div class="input-group"><span class="prefix">${esc(loc().sym)}</span><input class="input input-lg" data-dep inputmode="decimal" placeholder="0"></div></div>
            <div class="row" style="gap:6px"><select class="input select grow" data-meth>${Object.entries(PAY_METHODS).map(([k, x]) => `<option value="${k}">${esc(x.label)}</option>`).join('')}</select><input class="input" data-ref placeholder="Ref." style="max-width:110px"></div>
            <div class="row mt-xs" style="gap:4px;flex-wrap:wrap" data-quick></div>
            <div data-depst class="mt-sm"></div>
            <div class="error-msg" data-err></div>
            <button type="button" class="btn btn-primary btn-lg btn-block mt-sm" data-ok>${icon('check')} Crear orden</button>
          </div>
        </aside>
      </div>`,
      onClose: () => { if (!done) resolve(null); }
    });
    const $ = (q) => m.el.querySelector(q);
    const labSel = $('[data-lab]');
    const setPromise = () => { const l = store.lab(labSel.value); $('[data-prom]').value = promiseDate((l?.days || 5) + 1); };
    setPromise();
    labSel.onchange = setPromise;

    function lensOptions() {
      const want = ex?.lensType && ex.lensType !== 'contacto' ? ex.lensType : '';
      const list = store.lensCatalog;
      if (!lensId) lensId = (list.find((l) => l.type === want && l.material === ex?.material) || list.find((l) => l.type === want) || list[0])?.id || '';
      return list;
    }
    function drawPatient() {
      const exams = store.examsOf(p.id);
      $('[data-pat]').innerHTML = `<div class="row" style="gap:10px">${patientAvatar(p)}<div class="grow" style="min-width:0"><b>${esc(p.name)}</b><div class="t-sub">${esc(p.code || '')}${p.phone ? ' · ' + esc(p.phone) : ''}</div></div></div>
        ${exams.length ? `<div class="field mt-sm"><label>Fórmula</label><select class="input select" data-ex>${exams.map((e) => `<option value="${e.id}" ${e.id === ex?.id ? 'selected' : ''}>${esc(e.number)} · ${fmtDate(e.date)} · OD ${esc(eyeText(e.rx?.od))} / OI ${esc(eyeText(e.rx?.oi))}</option>`).join('')}<option value="" ${!ex ? 'selected' : ''}>Sin fórmula (solo montura, sol o reparación)</option></select></div>${ex ? rxMini(ex) : ''}`
        : `<div class="box mt-sm">${icon('info')} Sin examen registrado. <button type="button" class="linkish text-brand" data-doex><b>Hacer el examen ahora</b></button> o continúa sin fórmula (lentes de sol, reparación…).</div>`}`;
      $('[data-ex]')?.addEventListener('change', (e) => { ex = store.exam(e.target.value) || null; tr.clear(); (ex?.treatments || []).forEach((t) => tr.add(t)); lensId = ''; drawPatient(); drawLens(); totals(); });
      $('[data-doex]')?.addEventListener('click', async () => { const { examForm } = await import('./rx.js'); const e = await examForm({ patient: p }); if (e) { ex = store.exam(e.id) || e; (ex.treatments || []).forEach((t) => tr.add(t)); lensId = ''; drawPatient(); drawLens(); totals(); } });
    }
    function drawFrame(q = '') {
      const box = $('[data-frame]');
      if (ownFrame) {
        box.innerHTML = `<div class="form-grid form-grid-3"><div class="field"><label>Descripción</label><input class="input" data-fn value="${esc(frame?.name || '')}" placeholder="Ej.: Metal dorado, aro completo"></div><div class="field"><label>Tipo</label><select class="input select" data-ft>${FRAME_TYPES.map((t) => `<option>${esc(t)}</option>`).join('')}</select></div><div class="field"><label>Calibre □ puente</label><div class="row" style="gap:4px"><input class="input" data-fe placeholder="52" maxlength="3"><input class="input" data-fb placeholder="18" maxlength="3"><input class="input" data-fv placeholder="140" maxlength="3"></div></div></div><span class="hint">Revisa el estado de la montura con el paciente antes de enviarla al laboratorio.</span>`;
        box.querySelectorAll('input,select').forEach((i) => i.oninput = () => { frame = { own: true, name: box.querySelector('[data-fn]').value, type: box.querySelector('[data-ft]').value, eye: box.querySelector('[data-fe]').value, bridge: box.querySelector('[data-fb]').value, temple: box.querySelector('[data-fv]').value }; });
        frame = { own: true, name: '', type: FRAME_TYPES[0] };
        totals(); return;
      }
      if (frame && !frame.own) {
        const pr = store.product(frame.productId);
        box.innerHTML = `<div class="frame-pick on"><span class="kpi-icon tone-brand" style="width:42px;height:42px">${pr?.photo ? `<img src="${pr.photo}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:inherit">` : icon('frame')}</span><div class="grow" style="min-width:0"><b>${esc(productLabel(pr || frame))}</b><div class="t-sub">${esc([pr?.code, sizeText(pr), pr?.material].filter(Boolean).join(' · '))}</div></div><b class="num">${usd(pr?.price || 0)}</b><button type="button" class="btn btn-ghost btn-icon btn-sm" data-fx>${icon('x')}</button></div>`;
        box.querySelector('[data-fx]').onclick = () => { frame = null; drawFrame(); totals(); };
        return;
      }
      const t = normalize(q);
      const list = store.liveProducts.filter((x) => ['montura', 'sol'].includes(x.cat) && (x.track === false || Number(x.stock) > 0) && (!t || normalize(`${x.code}${x.brand}${x.model}${x.name}${x.color}`).includes(t))).slice(0, 12);
      box.innerHTML = `<label class="search">${icon('search')}<input data-fq value="${esc(q)}" placeholder="Buscar montura por código, marca, modelo o color…"></label>
        <div class="frame-grid mt-xs">${list.length ? list.map((x) => `<button type="button" class="frame-pick" data-fp="${x.id}"><span class="kpi-icon tone-${x.cat === 'sol' ? 'warning' : 'brand'}" style="width:38px;height:38px">${x.photo ? `<img src="${x.photo}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:inherit">` : icon(x.cat === 'sol' ? 'sunglasses' : 'frame')}</span><span class="grow" style="min-width:0"><b class="ellipsis">${esc(productLabel(x))}</b><small class="t-sub">${esc([x.code, sizeText(x)].filter(Boolean).join(' · '))} · <span class="text-${stockTone(x)}">${x.stock} en stock</span></small></span><b class="num">${usd(x.price)}</b></button>`).join('') : `<div class="t-sub pd-3">${store.liveProducts.some((x) => x.cat === 'montura') ? 'Ninguna montura coincide.' : 'Aún no tienes monturas en el inventario.'}</div>`}</div>`;
      const qi = box.querySelector('[data-fq]');
      qi.oninput = () => { const v = qi.value; drawFrame(v); const n = $('[data-fq]'); n.focus(); n.setSelectionRange(v.length, v.length); };
      box.querySelectorAll('[data-fp]').forEach((b) => b.onclick = () => { const x = store.product(b.dataset.fp); frame = { productId: x.id, name: productLabel(x), eye: x.eye || '', bridge: x.bridge || '', temple: x.temple || '', type: x.frameType || '' }; drawFrame(); totals(); });
    }
    function drawLens() {
      const box = $('[data-lens]');
      if (!ex || !hasRx(ex.rx)) { box.innerHTML = `<div class="t-sub">${ex ? 'La fórmula no tiene graduación.' : 'Sin fórmula: no se agregan cristales formulados.'} <button type="button" class="linkish text-brand" data-mlens>Agregar cristales igual</button></div>`; box.querySelector('[data-mlens]').onclick = () => { manualLens = true; ex = ex || { id: '', rx: null }; drawLens(); totals(); }; if (!manualLens) { lensId = ''; return; } }
      const list = lensOptions();
      const sug = ex?.lensType ? `${LENS_TYPES[ex.lensType]?.label || ''}${ex.material ? ' · ' + (LENS_MATERIALS[ex.material] || '') : ''}` : '';
      box.innerHTML = `${sug ? `<div class="t-sub mb">${icon('sparkle')} Recomendado en el examen: <b>${esc(sug)}</b></div>` : ''}
        <div class="lens-grid">${list.map((l) => `<button type="button" class="lens-opt ${l.id === lensId ? 'on' : ''}" data-l="${l.id}"><b>${esc(l.name)}</b><small>${esc(LENS_TYPES[l.type]?.label || '')} · ${esc(LENS_MATERIALS[l.material] || '')}</small><span class="num">${usd(l.price)}</span></button>`).join('')}<button type="button" class="lens-opt ${!lensId ? 'on' : ''}" data-l=""><b>Sin cristales</b><small>Solo montura</small><span></span></button></div>
        <div class="chips chips-wrap mt-sm">${store.treatments.map((t) => `<button type="button" class="chip ${tr.has(t.id) ? 'on' : ''}" data-t="${t.id}">${esc(t.name)} <span class="chip-n">+${usd(t.price)}</span></button>`).join('')}</div>
        <input class="input mt-xs" data-tint placeholder="Color o tinte (opcional): gris 80 %, café degradado…">`;
      box.querySelectorAll('[data-l]').forEach((b) => b.onclick = () => { lensId = b.dataset.l; drawLens(); totals(); });
      box.querySelectorAll('[data-t]').forEach((b) => b.onclick = () => { const t = b.dataset.t; tr.has(t) ? tr.delete(t) : tr.add(t); b.classList.toggle('on'); totals(); });
    }
    function drawExtras() {
      $('[data-extras]').innerHTML = extras.length ? `<div class="list">${extras.map((x, i) => `<div class="list-item"><span class="kpi-icon tone-violet" style="width:32px;height:32px">${icon(x.kind === 'servicio' ? 'wrench' : 'tag')}</span><div class="grow ellipsis"><b>${esc(x.name)}</b></div><input class="input input-qty" data-xq="${i}" value="${x.qty}" inputmode="numeric" style="width:60px"><b class="num">${usd(x.price * x.qty)}</b><button type="button" class="btn btn-ghost btn-icon btn-sm" data-xd="${i}">${icon('x')}</button></div>`).join('')}</div>` : '<div class="t-sub">Estuche, líquido limpiador, cordón, montaje… (opcional)</div>';
      m.el.querySelectorAll('[data-xd]').forEach((b) => b.onclick = () => { extras.splice(Number(b.dataset.xd), 1); drawExtras(); totals(); });
      m.el.querySelectorAll('[data-xq]').forEach((b) => b.onchange = () => { extras[Number(b.dataset.xq)].qty = Math.max(1, parseInt(b.value, 10) || 1); drawExtras(); totals(); });
    }
    const items = () => {
      const out = [];
      if (frame && !frame.own && frame.productId) { const pr = store.product(frame.productId); out.push({ kind: 'montura', productId: pr.id, name: `Montura ${productLabel(pr)}`, code: pr.code, qty: 1, price: pr.price, cost: pr.cost }); }
      const l = lensId ? store.lens(lensId) : null;
      if (l) out.push({ kind: 'cristal', lensId: l.id, name: `Cristales ${l.name}`, qty: 1, price: l.price, cost: l.cost });
      if (l || manualLens) for (const id of tr) { const t = store.treatment(id); if (t) out.push({ kind: 'tratamiento', treatmentId: t.id, name: t.name, qty: 1, price: t.price, cost: t.cost }); }
      return [...out, ...extras];
    };
    function totals() {
      const it = items();
      const t = orderTotals(it, parseNum($('[data-disc]').value), discMode);
      $('[data-items]').innerHTML = it.length ? it.map((i) => `<div class="sum-line"><span>${esc(i.name)}${i.qty > 1 ? ` × ${i.qty}` : ''}</span><b class="num">${usd(i.price * i.qty)}</b></div>`).join('') : '<div class="t-sub">Elige la montura y los cristales.</div>';
      const dep = round2(parseNum($('[data-dep]').value));
      const minDep = round2(t.total * (Number(st.minDepositPct) || 0) / 100);
      $('[data-totals]').innerHTML = `${t.discount ? `<div class="sum-line"><span>Subtotal</span><b class="num">${usd(t.subtotal)}</b></div><div class="sum-line text-success"><span>Descuento</span><b class="num">-${usd(t.discount)}</b></div>` : ''}<div class="sum-total"><span>Total</span><b>${usd(t.total)}</b></div>${bs(t.total) ? `<div class="t-sub r">${bs(t.total)}</div>` : ''}`;
      $('[data-quick]').innerHTML = t.total > 0 ? [[minDep, `Mínimo ${st.minDepositPct || 0}%`], [round2(t.total / 2), '50 %'], [t.total, 'Todo']].filter(([v], i, a) => v > 0 && a.findIndex((x) => x[0] === v) === i).map(([v, l]) => `<button type="button" class="chip" data-qd="${v}">${esc(l)} · ${usd(v)}</button>`).join('') : '';
      m.el.querySelectorAll('[data-qd]').forEach((b) => b.onclick = () => { $('[data-dep]').value = num(Number(b.dataset.qd)); totals(); });
      const rest = round2(t.total - dep);
      $('[data-depst]').innerHTML = t.total > 0 ? `<div class="pay-status ${rest <= 0.009 ? 'ok' : 'due'}"><span>${dep > t.total + 0.009 ? 'El abono supera el total' : rest > 0.009 ? `Resta al retirar` : `${icon('check')} Pagada completa`}</span><span class="num">${rest > 0.009 ? usd(rest) : ''}</span></div>${dep > 0 && dep < minDep - 0.009 ? `<div class="hint text-warning mt-xs">${icon('alert')} El abono es menor al mínimo de ${st.minDepositPct}% (${usd(minDep)}).</div>` : ''}` : '';
      return t;
    }
    $('[data-own]').onchange = (e) => { ownFrame = e.target.checked; frame = null; drawFrame(); };
    $('[data-chp]').onclick = async () => { const np = await pickPatient({ title: 'Cambiar paciente' }); if (np) { p = np; ex = store.lastExam(p.id); lensId = ''; tr.clear(); (ex?.treatments || []).forEach((t) => tr.add(t)); drawPatient(); drawLens(); totals(); } };
    m.el.querySelectorAll('[data-dm]').forEach((b) => b.onclick = () => { discMode = b.dataset.dm; m.el.querySelectorAll('[data-dm]').forEach((x) => x.classList.toggle('on', x === b)); totals(); });
    $('[data-disc]').oninput = totals; $('[data-dep]').oninput = totals;
    $('[data-addp]').onclick = async () => { const pr = await pickProduct({ cats: ['accesorio', 'solucion', 'contacto', 'terminado', 'sol', 'montura'] }); if (pr) { extras.push({ kind: 'producto', productId: pr.id, name: productLabel(pr), code: pr.code, qty: 1, price: pr.price, cost: pr.cost }); drawExtras(); totals(); } };
    $('[data-addc]').onclick = async () => {
      const name = await promptDialog({ title: 'Agregar servicio', label: 'Descripción', placeholder: 'Ej.: Montaje de cristales, cambio de plaquetas' });
      if (!name?.trim()) return;
      const price = parseNum(await promptDialog({ title: 'Precio del servicio', label: `Precio (${loc().sym})`, value: '0', type: 'text' }) || '0');
      extras.push({ kind: 'servicio', name: name.trim(), qty: 1, price: round2(price), cost: 0 }); drawExtras(); totals();
    };
    drawPatient(); drawFrame(); drawLens(); drawExtras(); totals();
    $('[data-ok]').onclick = async (e) => {
      const err = $('[data-err]'); err.textContent = '';
      const it = items();
      if (!it.length) { err.textContent = 'Agrega la montura, los cristales o algún producto.'; return; }
      const t = totals();
      const dep = round2(parseNum($('[data-dep]').value));
      if (dep > t.total + 0.009) { err.textContent = 'El abono no puede ser mayor que el total.'; return; }
      const btn = e.currentTarget; setBusy(btn, true, 'Creando…');
      const l = lensId ? store.lens(lensId) : null;
      try {
        const rate = Number(fx()?.rate) || 0;
        const r = await createOrder({
          kind: 'trabajo', patientId: p.id, examId: ex?.id || '', rx: ex?.rx || null,
          lens: l || manualLens ? { type: l?.type || ex?.lensType || '', material: l?.material || ex?.material || '', lensId: l?.id || '', treatments: [...tr], tint: $('[data-tint]')?.value || '' } : null,
          frame: ownFrame ? { ...frame, own: true } : frame, items: it, discount: parseNum($('[data-disc]').value), discountMode: discMode,
          labId: labSel.value, promised: $('[data-prom]').value, labCost: parseNum($('[data-labcost]').value), seller: $('[data-seller]').value, notes: $('[data-notes]').value,
          deposit: dep > 0 ? { amount: dep, method: $('[data-meth]').value, reference: $('[data-ref]').value, rate: isVE() ? rate : 0 } : null
        });
        done = true; m.close(); resolve(r.order);
        orderDone(r.order);
      } catch (ex2) { err.textContent = ex2.message; setBusy(btn, false); }
    };
  });
}

/** Elegir un producto del inventario */
export function pickProduct({ cats = null, title = 'Agregar producto' } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const m = openModal({ title, size: 'md', body: `<div class="stack"><label class="search">${icon('search')}<input data-q placeholder="Código, marca, modelo o nombre…" autofocus autocomplete="off"></label><div class="list pick-list" data-l style="max-height:52vh;overflow:auto"></div></div>`, onClose: () => { if (!done) resolve(null); } });
    const draw = (q = '') => {
      const t = normalize(q);
      const exact = store.findProduct(q);
      const list = (exact ? [exact] : store.liveProducts.filter((x) => (!cats || cats.includes(x.cat)) && (!t || normalize(`${x.code}${x.brand}${x.model}${x.name}${x.color}`).includes(t)))).slice(0, 60);
      m.el.querySelector('[data-l]').innerHTML = list.length ? list.map((x) => `<button type="button" class="list-item linkish" data-p="${x.id}" style="width:100%;text-align:left" ${x.track !== false && Number(x.stock) <= 0 ? 'disabled' : ''}><span class="kpi-icon" style="width:36px;height:36px;background:color-mix(in srgb, ${PRODUCT_CATS[x.cat]?.color || '#0284c7'} 16%, transparent);color:${PRODUCT_CATS[x.cat]?.color || '#0284c7'}">${icon(PRODUCT_CATS[x.cat]?.icon || 'tag')}</span><div class="grow" style="min-width:0"><b class="ellipsis">${esc(productLabel(x))}</b><div class="t-sub">${esc(x.code || '')} · <span class="text-${stockTone(x)}">${x.track === false ? 'servicio' : x.stock + ' en stock'}</span></div></div><b class="num">${usd(x.price)}</b></button>`).join('') : emptyState('search', 'Sin resultados', 'Prueba con otro código o nombre.');
      m.el.querySelectorAll('[data-p]').forEach((b) => b.onclick = () => { done = true; m.close(); resolve(store.product(b.dataset.p)); });
    };
    m.el.querySelector('[data-q]').oninput = (e) => draw(e.target.value);
    draw();
  });
}

export function orderDone(o) {
  const m = openModal({
    size: 'sm',
    body: `<div class="center stack" style="padding:16px 0 4px;align-items:center">
      <div class="kpi-icon tone-success" style="width:64px;height:64px;border-radius:20px">${icon(o.kind === 'venta' ? 'cart' : 'glasses')}</div>
      <div><div class="muted small">${esc(kindLabel(o))} creada</div><div style="font-size:24px;font-weight:800">${esc(o.number)}</div><div class="t-sub">${esc(o.patientName)}</div></div>
      <div class="kv kv-3" style="width:100%"><div><span>Total</span><b>${usd(o.total)}</b></div><div><span>Abonado</span><b>${usd(o.paid || 0)}</b></div><div><span>Resta</span><b class="${orderBalance(o) > 0.009 ? 'text-danger' : 'text-success'}">${usd(Math.max(0, orderBalance(o)))}</b></div></div>
      ${o.promised ? `<div class="t-sub">${icon('calendar')} Entrega estimada: <b>${fmtDate(o.promised)}</b></div>` : ''}
    </div>`,
    footer: `<button class="btn btn-secondary" data-pr>${icon('print')} Comprobante</button>${o.kind !== 'venta' ? `<button class="btn btn-secondary" data-lab>${icon('lab')} Orden lab.</button>` : ''}${o.patientPhone ? `<button class="btn btn-whatsapp" data-wa>${icon('whatsapp')} Enviar</button>` : ''}<button class="btn btn-primary" data-go>Ver orden</button>`
  });
  m.el.querySelector('[data-pr]').onclick = () => printOrderTicket(store.order(o.id) || o);
  m.el.querySelector('[data-lab]')?.addEventListener('click', () => printLabOrder(store.order(o.id) || o));
  m.el.querySelector('[data-wa]')?.addEventListener('click', () => waPatient('pedido', { order: store.order(o.id) || o }));
  m.el.querySelector('[data-go]').onclick = () => { m.close(); openOrder(o.id); };
}

// ======================================================================
// FICHA DE LA ORDEN
// ======================================================================
const ACTION = {
  registrada: { to: 'laboratorio', label: 'Enviar al laboratorio', icon: 'send' },
  laboratorio: { to: 'recibida', label: 'Recibir del laboratorio', icon: 'download' },
  garantia: { to: 'recibida', label: 'Recibir del laboratorio', icon: 'download' },
  recibida: { to: 'lista', label: 'Control de calidad OK', icon: 'checkCircle' },
  lista: { to: 'entregada', label: 'Entregar al paciente', icon: 'glasses' }
};
export async function advanceOrder(o, { silent = false } = {}) {
  o = store.order(o.id) || o;
  const to = ACTION[o.status]?.to || nextStatus(o.status);
  if (!to) return null;
  try {
    if (to === 'laboratorio' && !o.labId) {
      const ok = await labDialog(o); if (!ok) return null; o = store.order(o.id) || o;
    }
    if (to === 'lista' && !(await qcDialog(o))) return null;
    if (to === 'entregada' && orderBalance(o) > 0.009) {
      const pay = await confirmDialog({ title: 'Saldo pendiente', message: `La orden tiene un saldo de ${usd(orderBalance(o))}. Cóbralo para poder entregar.`, confirmText: 'Cobrar ahora' });
      if (!pay) return null;
      const p = await paymentModal(o);
      if (!p) return null;
      o = store.order(o.id) || o;
      if (orderBalance(o) > 0.009) { toast('Aún queda saldo pendiente.', 'warning'); return null; }
    }
    const r = await setOrderStatus(o, to);
    if (!silent) toast(`${o.number}: ${ORDER_STATUS[to].label}`);
    if (to === 'lista' && (o.patientPhone || store.patient(o.patientId)?.phone)) {
      if (await confirmDialog({ title: '¡Lentes listos!', message: `¿Avisas a ${o.patientName.split(' ')[0]} por WhatsApp que ya puede retirar sus lentes?`, confirmText: 'Avisar por WhatsApp' })) waPatient('lista', { order: store.order(o.id) || r });
    }
    return r;
  } catch (e) { toast(e.message, 'warning', 5000); return null; }
}
function labDialog(o) {
  return new Promise((resolve) => {
    let ok = false;
    const m = openModal({
      title: `Enviar ${esc(o.number)} al laboratorio`, size: 'sm',
      body: `<form class="stack" data-f><div class="field"><label>Laboratorio</label><select class="input select" name="lab">${store.liveLabs.map((l) => `<option value="${l.id}">${esc(l.name)}</option>`).join('')}</select>${store.liveLabs.length ? '' : '<span class="hint text-warning">Agrega tus laboratorios en la sección Laboratorios.</span>'}</div>
        <div class="field"><label>N° de orden del laboratorio</label><input class="input" name="ref" placeholder="Opcional"></div></form>`,
      footer: `<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" data-ok ${store.liveLabs.length ? '' : 'disabled'}>${icon('send')} Enviar</button>`,
      onClose: () => resolve(ok)
    });
    m.el.querySelector('[data-ok]').onclick = async () => { const F = m.el.querySelector('[data-f]').elements; await updateOrder(o, { labId: F.lab.value, labRef: F.ref.value }); ok = true; m.close(); };
  });
}
function qcDialog(o) {
  return new Promise((resolve) => {
    let ok = false;
    const checks = ['Graduación verificada en el lensómetro', 'Centros ópticos y DP correctos', 'Altura del segmento / progresivo correcta', 'Tratamientos y color correctos', 'Sin rayas ni defectos', 'Montura ajustada y limpia'];
    const m = openModal({
      title: `Control de calidad · ${esc(o.number)}`, size: 'sm', sub: 'Marca cada punto antes de avisar al paciente.',
      body: `<div class="stack-sm">${checks.map((c, i) => `<label class="check box box-white"><input type="checkbox" data-qc="${i}"> <span>${esc(c)}</span></label>`).join('')}</div>${o.rx ? `<div class="mono small mt">OD ${esc(eyeText(o.rx.od))}<br>OI ${esc(eyeText(o.rx.oi))}</div>` : ''}`,
      footer: `<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-success" data-ok disabled>${icon('checkCircle')} Lista para retirar</button>`,
      onClose: () => resolve(ok)
    });
    const btn = m.el.querySelector('[data-ok]');
    m.el.querySelectorAll('[data-qc]').forEach((c) => c.onchange = () => { btn.disabled = [...m.el.querySelectorAll('[data-qc]')].some((x) => !x.checked); });
    btn.onclick = () => { ok = true; m.close(); };
  });
}

export function openOrder(id) {
  let o = store.order(id);
  if (!o) { toast('Orden no encontrada', 'warning'); return; }
  const m = openModal({ title: '', size: 'lg', body: '<div data-b></div>' });
  const body = m.el.querySelector('[data-b]');
  const draw = () => {
    o = store.order(id) || o;
    const bal = orderBalance(o);
    const pays = store.payments.filter((x) => x.orderId === id);
    const late = orderLate(o); const wait = waitingDays(o);
    const act = ACTION[o.status];
    const stepIdx = o.status === 'garantia' ? 1 : FLOW.indexOf(o.status);
    const when = (s) => (o.history || []).filter((h) => h.s === s).pop()?.at;
    body.innerHTML = `
      <div class="u-head"><span class="kpi-icon tone-${ORDER_STATUS[o.status]?.tone || 'brand'}" style="width:60px;height:60px;border-radius:18px">${icon(o.kind === 'venta' ? 'cart' : ORDER_STATUS[o.status]?.icon || 'glasses')}</span>
        <div class="grow" style="min-width:0"><div class="u-title">${esc(o.number)} ${badge(ORDER_STATUS, o.status)}</div>
          <div class="t-sub">${esc(kindLabel(o))} · ${fmtDate(o.date)} · <button class="linkish text-brand" data-pt><b>${esc(o.patientName)}</b></button>${o.labName ? ` · ${esc(o.labName)}` : ''}${o.labRef ? ` (ref. ${esc(o.labRef)})` : ''}</div>
          <div class="mt-xs row" style="gap:6px;flex-wrap:wrap">${o.promised && o.kind !== 'venta' ? `<span class="badge badge-${late ? 'danger' : 'neutral'}">${icon('calendar')} ${late ? `Atrasada ${late} día(s)` : 'Entrega ' + fmtDate(o.promised)}</span>` : ''}${wait ? `<span class="badge badge-warning">${icon('clock')} Lista hace ${wait} día(s)</span>` : ''}${o.warrantyUntil && o.status === 'entregada' ? `<span class="badge badge-neutral">${icon('shield')} Garantía hasta ${fmtDate(o.warrantyUntil)}</span>` : ''}${o.warrantyCount ? `<span class="badge badge-warning">Garantía ×${o.warrantyCount}</span>` : ''}</div></div>
        <div class="u-bal ${bal > 0.009 ? 'due' : 'ok'}">${bal > 0.009 ? `<small>Resta</small><b>${usd(bal)}</b><small>de ${usd(o.total)}</small>` : `<small>Pagada</small><b>${usd(o.total)}</b><small>sin saldo</small>`}</div>
        <button type="button" class="x-btn o-close" data-close aria-label="Cerrar">${icon('x')}</button></div>
      ${o.kind !== 'venta' && o.status !== 'anulada' ? `<div class="o-steps">${FLOW.map((s, i) => `<div class="o-step ${i < stepIdx || o.status === 'entregada' ? 'done' : i === stepIdx ? 'now' : ''}"><span>${icon(i < stepIdx || o.status === 'entregada' ? 'check' : ORDER_STATUS[s].icon)}</span><b>${esc(ORDER_STATUS[s].label)}</b><small>${when(s) ? new Date(when(s)).toLocaleDateString('es-VE', { day: '2-digit', month: 'short' }) : ''}</small></div>`).join('')}</div>` : ''}
      ${o.status === 'garantia' ? `<div class="vital-alert warning mt-sm">${icon('refresh')} En garantía: ${esc(o.warrantyReason || '')}</div>` : ''}
      <div class="u-actions">
        ${act && o.status !== 'anulada' ? `<button class="btn btn-primary btn-sm" data-a="adv">${icon(act.icon)} ${esc(act.label)}</button>` : ''}
        ${bal > 0.009 && o.status !== 'anulada' ? `<button class="btn btn-success btn-sm" data-a="pay">${icon('wallet')} Cobrar</button>` : ''}
        ${o.patientPhone || store.patient(o.patientId)?.phone ? `<button class="btn btn-whatsapp btn-sm" data-a="wa">${icon('whatsapp')} ${o.status === 'lista' ? 'Avisar: listos' : bal > 0.009 ? 'Recordar saldo' : 'WhatsApp'}</button>` : ''}
        <button class="btn btn-secondary btn-sm" data-a="ticket">${icon('print')} Comprobante</button>
        ${o.kind !== 'venta' ? `<button class="btn btn-secondary btn-sm" data-a="lab">${icon('lab')} Orden lab.</button>` : ''}
        ${o.kind !== 'venta' && o.status !== 'anulada' ? `<button class="btn btn-ghost btn-sm" data-a="edit">${icon('edit')} Datos</button>` : ''}
        ${o.status === 'entregada' && o.kind !== 'venta' ? `<button class="btn btn-ghost btn-sm" data-a="warranty">${icon('refresh')} Garantía</button>` : ''}
        ${o.status !== 'anulada' && o.status !== 'entregada' ? `<button class="btn btn-ghost btn-sm" data-a="void">${icon('x')} Anular</button>` : ''}
        ${o.status !== 'anulada' && o.status !== 'entregada' && o.status !== 'registrada' && o.kind !== 'venta' ? `<button class="btn btn-ghost btn-sm" data-a="back">${icon('arrowLeft')} Estado anterior</button>` : ''}
      </div>
      <div class="grid-2 mt">
        <div>${o.rx && hasRx(o.rx) ? `<div class="section-title" style="margin-top:0">${icon('eyeTest')} Graduación${o.examNumber ? ` · ${esc(o.examNumber)}` : ''}</div>${rxMini({ rx: o.rx })}` : ''}
          ${o.lens ? `<div class="section-title">${icon('lens')} Cristales</div><div class="box small">${esc(lensSummary(o) || '—')}</div>` : ''}
          ${o.frame ? `<div class="section-title">${icon('frame')} Montura</div><div class="box small">${esc(o.frame.own ? 'Propia del paciente' + (o.frame.name ? ' · ' + o.frame.name : '') : o.frame.name || '—')}${o.frame.eye ? ` · ${esc(o.frame.eye)}□${esc(o.frame.bridge || '')} ${esc(o.frame.temple || '')}` : ''}${o.frame.type ? ` · ${esc(o.frame.type)}` : ''}</div>` : ''}
          ${o.notes ? `<div class="section-title">${icon('info')} Observaciones</div><div class="box small">${esc(o.notes)}</div>` : ''}</div>
        <div><div class="section-title" style="margin-top:0">${icon('receipt')} Detalle</div>
          <div class="box">${(o.items || []).map((i) => `<div class="sum-line"><span>${esc(i.name)}${i.qty > 1 ? ` × ${i.qty}` : ''}</span><b class="num">${usd(i.price * i.qty)}</b></div>`).join('')}${o.discount ? `<div class="sum-line text-success"><span>Descuento</span><b class="num">-${usd(o.discount)}</b></div>` : ''}<div class="sum-total"><span>Total</span><b>${usd(o.total)}</b></div>${bs(o.total) ? `<div class="t-sub r">${bs(o.total)}</div>` : ''}</div>
          <div class="section-title">${icon('wallet')} Pagos</div>
          ${pays.length ? `<div class="list">${pays.map((x) => `<div class="list-item ${x.status === 'anulado' ? 'is-void' : ''}"><span class="kpi-icon tone-${x.status === 'anulado' ? 'danger' : 'success'}" style="width:32px;height:32px">${icon(x.status === 'anulado' ? 'x' : 'check')}</span><div class="grow" style="min-width:0"><b>${esc(x.number)}</b><div class="t-sub">${fmtDate(x.date)} · ${esc(methodLabel(x.method))}${x.reference ? ` · ref. ${esc(x.reference)}` : ''}</div></div><b class="num">${usd(x.amount)}</b><button class="btn btn-ghost btn-icon btn-sm" data-pp="${x.id}">${icon('print')}</button>${x.status === 'confirmado' ? `<button class="btn btn-ghost btn-icon btn-sm" data-pv="${x.id}" title="Anular pago">${icon('x')}</button>` : ''}</div>`).join('')}</div>` : '<div class="t-sub">Sin pagos todavía.</div>'}
          <div class="section-title">${icon('history')} Historial</div>
          <div class="o-hist">${(o.history || []).slice().reverse().map((h) => `<div><b>${esc(ORDER_STATUS[h.s]?.label || h.s)}</b><small>${fmtDateTime(h.at)} · ${esc(h.by || '')}${h.note ? ' · ' + esc(h.note) : ''}</small></div>`).join('')}</div></div>
      </div>`;
    body.querySelectorAll('[data-a]').forEach((b) => b.onclick = () => run(b.dataset.a));
    body.querySelector('.o-close')?.addEventListener('click', () => m.close());
    body.querySelector('[data-pt]')?.addEventListener('click', async () => { if (!o.patientId) return; const { openPatient } = await import('./patient.js'); m.close(); openPatient(o.patientId, { tab: 'ordenes' }); });
    body.querySelectorAll('[data-pp]').forEach((b) => b.onclick = () => printPayment(store.payments.find((x) => x.id === b.dataset.pp)));
    body.querySelectorAll('[data-pv]').forEach((b) => b.onclick = async () => {
      const { requirePin } = await import('./auth.js');
      if (!(await requirePin('Anular un pago'))) return;
      const reason = await promptDialog({ title: 'Anular pago', label: 'Motivo', placeholder: 'Ej.: pago duplicado, reembolso al cliente' });
      if (reason == null) return;
      await voidPayment(store.payments.find((x) => x.id === b.dataset.pv), reason); toast('Pago anulado');
    });
  };
  const run = async (a) => {
    if (a === 'adv') await advanceOrder(o);
    if (a === 'pay') await paymentModal(o);
    if (a === 'wa') waPatient(o.status === 'lista' ? 'lista' : orderBalance(o) > 0.009 ? 'recordatorio' : o.status === 'laboratorio' ? 'laboratorio' : o.status === 'entregada' ? 'entregada' : 'pedido', { order: o });
    if (a === 'ticket') printOrderTicket(o);
    if (a === 'lab') printLabOrder(o);
    if (a === 'edit') await editDialog(o);
    if (a === 'warranty') { const r = await promptDialog({ title: `Garantía · ${o.number}`, label: 'Motivo', placeholder: 'Ej.: cristal rayado, graduación no adaptada, montura partida' }); if (r?.trim()) { await warrantyOrder(o, r); toast('Orden en garantía: vuelve al laboratorio'); } }
    if (a === 'void') {
      const { requirePin } = await import('./auth.js');
      if (!(await requirePin('Anular una orden'))) return;
      const r = await promptDialog({ title: `Anular ${o.number}`, label: 'Motivo', placeholder: 'Ej.: el paciente desistió' });
      if (r == null) return;
      try { await voidOrder(o, r); toast('Orden anulada; la montura volvió al inventario'); } catch (e) { toast(e.message, 'warning', 6000); }
    }
    if (a === 'back') {
      const i = FLOW.indexOf(o.status); const prev = o.status === 'garantia' ? 'entregada' : FLOW[i - 1];
      if (prev && await confirmDialog({ title: 'Volver al estado anterior', message: `La orden pasará a "${ORDER_STATUS[prev].label}".`, confirmText: 'Volver' })) { try { await setOrderStatus(o, prev, { note: 'Corrección de estado', force: true }); } catch (e) { toast(e.message, 'warning'); } }
    }
  };
  const off = store.on('*', (evt) => { if (['orders', 'payments'].includes(evt) && document.body.contains(body)) draw(); });
  const obs = new MutationObserver(() => { if (!document.body.contains(body)) { off(); obs.disconnect(); } });
  obs.observe(document.getElementById('modals'), { childList: true });
  draw();
}
function editDialog(o) {
  return new Promise((resolve) => {
    const m = openModal({
      title: `Datos de ${esc(o.number)}`, size: 'md',
      body: `<form class="form-grid" data-f>
        <div class="field"><label>Laboratorio</label><select class="input select" name="lab"><option value="">—</option>${store.labs.map((l) => `<option value="${l.id}" ${l.id === o.labId ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select></div>
        <div class="field"><label>N° de orden del laboratorio</label><input class="input" name="ref" value="${esc(o.labRef || '')}"></div>
        <div class="field"><label>Fecha prometida</label><input class="input" type="date" name="prom" value="${esc(o.promised || '')}"></div>
        <div class="field"><label>Costo del laboratorio</label><input class="input" name="cost" inputmode="decimal" value="${o.labCost ? num(o.labCost) : ''}"></div>
        <div class="field full"><label>Observaciones</label><textarea class="input textarea" name="notes" rows="2">${esc(o.notes || '')}</textarea></div></form>`,
      footer: `<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" data-ok>${icon('check')} Guardar</button>`,
      onClose: () => resolve()
    });
    m.el.querySelector('[data-ok]').onclick = async () => { const F = m.el.querySelector('[data-f]').elements; await updateOrder(o, { labId: F.lab.value, labRef: F.ref.value, promised: F.prom.value, labCost: parseNum(F.cost.value), notes: F.notes.value }); m.close(); toast('Orden actualizada'); };
  });
}
export { rxTablePrint, itemsText, PAY_STATUS };
