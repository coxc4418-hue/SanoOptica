// SanoÓptica — Venta de mostrador: lentes de sol, lentes de contacto, soluciones y accesorios
import { store } from '../store.js';
import { esc, usd, bs, num, toast, setBusy, parseNum, normalize, round2, PAY_METHODS, loc, fx, emptyState } from '../utils.js';
import { icon } from '../icons.js';
import { PRODUCT_CATS, productLabel, stockTone, orderTotals } from '../optica.js';
import { createOrder } from '../ops.js';
import { pickPatient } from '../patient.js';
import { orderDone } from '../order.js';
import { isVE } from '../bcv.js';

export function mount(el) {
  let cat = ''; let q = ''; let cart = []; let patient = null; let discMode = 'monto';
  el.innerHTML = `
    <div class="view-header"><div><h1 class="view-title">Venta de mostrador</h1><p class="view-sub">Lentes de sol, de contacto, soluciones y accesorios sin orden de laboratorio. Escanea o escribe el código.</p></div></div>
    <div class="pos">
      <div class="pos-left">
        <div class="toolbar"><label class="search grow">${icon('search')}<input id="p-q" placeholder="Código de barras, marca o modelo… (Enter agrega)" autocomplete="off" autofocus></label></div>
        <div class="chips mt-sm" id="p-cats"></div>
        <div class="prod-grid mt" id="p-grid"></div>
      </div>
      <aside class="cart card" id="p-cart"></aside>
    </div>`;
  const $ = (s) => el.querySelector(s);
  const inCart = (id) => cart.filter((c) => c.productId === id).reduce((a, c) => a + c.qty, 0);
  const add = (pr) => {
    if (!pr) return;
    if (pr.track !== false && inCart(pr.id) + 1 > (Number(pr.stock) || 0)) { toast(`Solo hay ${pr.stock} de ${productLabel(pr)}`, 'warning'); return; }
    const c = cart.find((x) => x.productId === pr.id);
    if (c) c.qty++; else cart.push({ kind: 'producto', productId: pr.id, name: productLabel(pr), code: pr.code, qty: 1, price: pr.price, cost: pr.cost });
    drawCart(); grid();
  };
  $('#p-q').oninput = (e) => { q = e.target.value; grid(); };
  $('#p-q').onkeydown = (e) => {
    if (e.key !== 'Enter') return;
    const exact = store.findProduct(q);
    const list = filtered();
    const pr = exact || (list.length === 1 ? list[0] : null);
    if (pr) { add(pr); e.target.value = ''; q = ''; grid(); } else if (q) toast('No se encontró un producto con ese código', 'warning');
  };
  function cats() {
    const used = Object.keys(PRODUCT_CATS).filter((k) => store.liveProducts.some((p) => p.cat === k));
    $('#p-cats').innerHTML = [['', 'Todo'], ...used.map((k) => [k, PRODUCT_CATS[k].label])].map(([k, l]) => `<button class="chip ${cat === k ? 'on' : ''}" data-c="${k}">${k ? icon(PRODUCT_CATS[k].icon) : ''} ${esc(l)}</button>`).join('');
    el.querySelectorAll('[data-c]').forEach((b) => b.onclick = () => { cat = b.dataset.c; cats(); grid(); });
  }
  const filtered = () => { const t = normalize(q); return store.liveProducts.filter((p) => (!cat || p.cat === cat) && (!t || normalize(`${p.code} ${p.brand} ${p.model} ${p.name} ${p.color}`).includes(t))); };
  function grid() {
    const list = filtered().slice(0, 90);
    $('#p-grid').innerHTML = list.length ? list.map((p) => { const left = p.track === false ? Infinity : (Number(p.stock) || 0) - inCart(p.id); const c = PRODUCT_CATS[p.cat] || PRODUCT_CATS.accesorio; return `<button class="prod" data-p="${p.id}" ${left <= 0 ? 'disabled' : ''}>
      <span class="prod-img" style="--pc:${c.color}">${p.photo ? `<img src="${p.photo}" alt="" loading="lazy">` : icon(c.icon)}</span>
      <b class="prod-name">${esc(productLabel(p))}</b><small class="t-sub ellipsis">${esc([p.code, p.color].filter(Boolean).join(' · '))}</small>
      <span class="prod-foot"><b class="num">${usd(p.price)}</b><small class="text-${stockTone(p)}">${p.track === false ? '∞' : left}</small></span></button>`; }).join('')
      : `<div style="grid-column:1/-1">${emptyState('frame', store.liveProducts.length ? 'Sin resultados' : 'Inventario vacío', store.liveProducts.length ? 'Prueba con otro código o categoría.' : 'Agrega productos en Inventario para venderlos aquí.')}</div>`;
    el.querySelectorAll('#p-grid [data-p]').forEach((b) => b.onclick = () => add(store.product(b.dataset.p)));
  }
  function drawCart() {
    const t = orderTotals(cart, parseNum($('#c-disc')?.value || ''), discMode);
    const prevDisc = $('#c-disc')?.value || ''; const prevPay = $('#c-pay')?.value || ''; const prevMeth = $('#c-meth')?.value || 'efectivo'; const prevRef = $('#c-ref')?.value || '';
    $('#p-cart').innerHTML = `
      <div class="between"><div class="card-title">${icon('cart')} Venta</div>${cart.length ? `<button class="btn btn-ghost btn-sm" id="c-clear">${icon('trash')} Vaciar</button>` : ''}</div>
      <button class="cart-client mt-sm" id="c-pat">${icon('user')} ${patient ? `<b>${esc(patient.name)}</b>` : '<span class="muted">Cliente de mostrador (opcional: elegir paciente)</span>'}</button>
      <div class="cart-lines">${cart.length ? cart.map((c, i) => `<div class="cart-line"><div class="grow" style="min-width:0"><b class="ellipsis">${esc(c.name)}</b><small class="t-sub">${usd(c.price)} c/u</small></div>
        <div class="qty"><button data-m="${i}">−</button><span>${c.qty}</span><button data-pl="${i}">+</button></div><b class="num">${usd(c.price * c.qty)}</b></div>`).join('') : `<div class="t-sub center pd-3">${icon('qr')}<br>Toca un producto o escanea su código.</div>`}</div>
      ${cart.length ? `<div class="row mt-sm" style="gap:6px"><div class="seg seg-sm">${[['monto', loc().sym], ['pct', '%']].map(([k, l]) => `<button data-dm="${k}" class="${discMode === k ? 'on' : ''}">${esc(l)}</button>`).join('')}</div><input class="input grow" id="c-disc" inputmode="decimal" placeholder="Descuento" value="${esc(prevDisc)}"></div>
      ${t.discount ? `<div class="sum-line mt-xs"><span>Subtotal</span><b class="num">${usd(t.subtotal)}</b></div><div class="sum-line text-success"><span>Descuento</span><b class="num">-${usd(t.discount)}</b></div>` : ''}
      <div class="sum-total"><span>Total</span><b>${usd(t.total)}</b></div>${bs(t.total) ? `<div class="t-sub r">${bs(t.total)}</div>` : ''}
      <div class="field mt-sm"><label>Recibido</label><input class="input input-lg" id="c-pay" inputmode="decimal" value="${esc(prevPay || num(t.total))}"></div>
      <div class="row" style="gap:6px"><select class="input select grow" id="c-meth">${Object.entries(PAY_METHODS).map(([k, x]) => `<option value="${k}" ${k === prevMeth ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}</select><input class="input" id="c-ref" placeholder="Ref." style="max-width:110px" value="${esc(prevRef)}"></div>
      <div id="c-st" class="mt-sm"></div>
      <button class="btn btn-primary btn-lg btn-block mt-sm" id="c-ok">${icon('check')} Cobrar ${usd(t.total)}</button>` : ''}`;
    $('#c-pat').onclick = async () => { const p = await pickPatient({ title: 'Cliente de la venta' }); if (p) { patient = p; drawCart(); } };
    $('#c-clear')?.addEventListener('click', () => { cart = []; drawCart(); grid(); });
    el.querySelectorAll('[data-m]').forEach((b) => b.onclick = () => { const c = cart[Number(b.dataset.m)]; c.qty--; if (c.qty <= 0) cart.splice(Number(b.dataset.m), 1); drawCart(); grid(); });
    el.querySelectorAll('[data-pl]').forEach((b) => b.onclick = () => add(store.product(cart[Number(b.dataset.pl)].productId)));
    el.querySelectorAll('[data-dm]').forEach((b) => b.onclick = () => { discMode = b.dataset.dm; $('#c-pay').value = ''; drawCart(); });
    if (!cart.length) return;
    $('#c-disc').onchange = () => { $('#c-pay').value = ''; drawCart(); };
    const st = () => {
      const tt = orderTotals(cart, parseNum($('#c-disc').value), discMode);
      const paid = round2(parseNum($('#c-pay').value)); const meth = $('#c-meth').value;
      const cash = /efectivo/.test(meth);
      $('#c-st').innerHTML = paid > tt.total + 0.009 ? (cash ? `<div class="pay-status ok"><span>Vuelto</span><span class="num">${usd(paid - tt.total)}</span></div>` : '<div class="pay-status due"><span>El monto supera el total</span></div>') : paid < tt.total - 0.009 ? `<div class="pay-status due"><span>Queda a crédito</span><span class="num">${usd(tt.total - paid)}</span></div>${patient ? '' : '<div class="hint text-warning mt-xs">Para dejar saldo pendiente elige el paciente.</div>'}` : `<div class="pay-status ok"><span>${icon('check')} Pago completo</span></div>`;
    };
    $('#c-pay').oninput = st; $('#c-meth').onchange = st; st();
    $('#c-ok').onclick = async (e) => {
      const tt = orderTotals(cart, parseNum($('#c-disc').value), discMode);
      let paid = round2(parseNum($('#c-pay').value)); const meth = $('#c-meth').value;
      if (paid > tt.total + 0.009) { if (!/efectivo/.test(meth)) { toast('El monto supera el total', 'warning'); return; } paid = tt.total; }
      if (paid < tt.total - 0.009 && !patient) { toast('Elige el paciente para dejar saldo pendiente', 'warning'); return; }
      const btn = e.currentTarget; setBusy(btn, true, 'Cobrando…');
      try {
        const r = await createOrder({ kind: 'venta', patientId: patient?.id || '', items: cart, discount: parseNum($('#c-disc').value), discountMode: discMode, deposit: paid > 0 ? { amount: paid, method: meth, reference: $('#c-ref').value, rate: isVE() ? Number(fx()?.rate) || 0 : 0 } : null });
        cart = []; patient = null; drawCart(); grid();
        toast(`Venta ${r.order.number} registrada`);
        orderDone(r.order);
        $('#p-q').focus();
      } catch (ex) { toast(ex.message, 'warning', 5000); setBusy(btn, false); }
    };
  }
  cats(); grid(); drawCart();
  const off = store.on('*', (evt) => { if (evt === 'products') { cats(); grid(); } if (evt === 'settings') drawCart(); });
  return off;
}
