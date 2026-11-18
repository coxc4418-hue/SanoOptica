// SanoÓptica — Configuración: óptica, órdenes y cobro, horario de citas, cuentas, portales, moneda y seguridad
import { store } from '../store.js';
import { requirePin, changePassword, authErrorMessage, session } from '../auth.js';
import { esc, num, toast, parseNum, setBusy, download, nowISO, round2, openModal, shortId, confirmDialog, emptyState, loc, flagImg, usd } from '../utils.js';
import { icon } from '../icons.js';
import { fxSectionHTML, bindFxSection } from '../bcv.js';
import { openCountryPicker, salesWa, SALES_PHONE_FMT, BOOKING_URL } from '../shared.js';
import { isStandalone, bindInstallButtons } from '../install.js';
import { EXPENSE_CATEGORIES, HOURS_DEFAULT, daySlots, fmtHour } from '../optica.js';
import { slugify, ensureBookingCode } from '../ops.js';

const SECTIONS = { optica: 'Óptica', ordenes: 'Órdenes y cobro', horario: 'Horario de citas', cuentas: 'Cuentas para cobrar', portal: 'Portal y agenda', moneda: 'Moneda', seguridad: 'Seguridad', apps: 'Instalar y respaldo' };
const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const sw = (name, on, title, sub) => `<label class="check box box-white"><span class="switch"><input type="checkbox" name="${name}" ${on ? 'checked' : ''}><span></span></span><span><b>${title}</b><br><small class="muted">${sub}</small></span></label>`;
const save = (t) => `<div class="row" style="justify-content:flex-end"><button class="btn btn-primary">${icon('check')} ${t || 'Guardar'}</button></div>`;
const BANK_TYPES = { transferencia: 'Transferencia bancaria', pagomovil: 'Pago móvil', zelle: 'Zelle', efectivo: 'Efectivo en la óptica', otro: 'Otro' };

export function mount(el, { params = {} }) {
  let sec = SECTIONS[params.tab || params.sec] ? (params.tab || params.sec) : 'optica';
  el.innerHTML = `
    <div class="view-header"><div><h1 class="view-title">Configuración</h1><p class="view-sub">Datos de la óptica, abonos y garantía, horario de citas, cuentas, portal del paciente y seguridad.</p></div></div>
    <div class="tabs">${Object.entries(SECTIONS).map(([k, v]) => `<button data-s="${k}">${v}</button>`).join('')}</div>
    <div id="s-body" class="mt" style="max-width:980px"></div>`;
  const $ = (q) => el.querySelector(q);
  const s = () => store.settings;

  function render() {
    el.querySelectorAll('[data-s]').forEach((b) => b.classList.toggle('on', b.dataset.s === sec));
    const body = $('#s-body');

    if (sec === 'optica') {
      body.innerHTML = `<form class="card stack" id="f-adm">
        <div class="form-grid">
          <div class="field full"><label>Nombre de la óptica</label><input class="input" name="businessName" value="${esc(s().businessName || store.tenant?.name || '')}" placeholder="Ej.: Óptica Visión Clara"></div>
          <div class="field full"><label>Lema (sale en el portal, la agenda en línea y los impresos)</label><input class="input" name="slogan" value="${esc(s().slogan || '')}" placeholder="Ej.: Cuidamos tu mirada"></div>
          <div class="field"><label>${esc(loc().tax)}</label><input class="input" name="rif" value="${esc(s().rif)}"></div>
          <div class="field"><label>Gerente / responsable</label><input class="input" name="manager" value="${esc(s().manager || '')}"></div>
          <div class="field"><label>Optometrista (firma la fórmula)</label><input class="input" name="optometrist" value="${esc(s().optometrist || '')}" placeholder="Lic. en Optometría"></div>
          <div class="field"><label>N° de colegiatura / registro</label><input class="input" name="license" value="${esc(s().license || '')}" placeholder="Ej.: COV 1234"></div>
          <div class="field"><label>Teléfono</label><input class="input" name="phone" value="${esc(s().phone)}"></div>
          <div class="field"><label>WhatsApp de la óptica</label><input class="input" name="whatsapp" value="${esc(s().whatsapp || '')}"><span class="hint">Aparece en el portal del paciente y la agenda en línea.</span></div>
          <div class="field"><label>Correo</label><input class="input" name="email" value="${esc(s().email || '')}"></div>
          <div class="field"><label>Dirección</label><input class="input" name="address" value="${esc(s().address)}"></div>
        </div>${save()}</form>`;
      $('#f-adm').onsubmit = async (e) => {
        e.preventDefault(); const F = e.target.elements;
        await store.saveSettings({ businessName: F.businessName.value.trim(), slogan: F.slogan.value.trim(), rif: F.rif.value.trim(), manager: F.manager.value.trim(), optometrist: F.optometrist.value.trim(), license: F.license.value.trim(), phone: F.phone.value.trim(), whatsapp: F.whatsapp.value.trim(), email: F.email.value.trim(), address: F.address.value.trim() });
        if (F.businessName.value.trim() && !store.isDemo) { const { updateTenant } = await import('../store.js'); updateTenant(store.tenantId, { name: F.businessName.value.trim(), updatedAt: nowISO() }).catch(() => {}); }
        toast('Datos guardados');
      };
    }

    if (sec === 'ordenes') {
      body.innerHTML = `<form class="card stack" id="f-rec">
        <div class="form-grid">
          <div class="field"><label>Abono mínimo sugerido (%)</label><input class="input" name="minDepositPct" inputmode="decimal" value="${num(s().minDepositPct ?? 50, 0)}"><span class="hint">Se sugiere al crear la orden. 0 = sin mínimo.</span></div>
          <div class="field"><label>Garantía (días)</label><input class="input" name="warrantyDays" inputmode="numeric" value="${s().warrantyDays ?? 90}"><span class="hint">Desde la entrega de los lentes.</span></div>
          <div class="field"><label>Control visual cada (meses)</label><input class="input" name="controlMonths" inputmode="numeric" value="${s().controlMonths ?? 12}"><span class="hint">Valor por defecto en cada examen.</span></div>
          <div class="field"><label>Precio del examen visual</label><input class="input" name="examFee" inputmode="decimal" value="${num(s().examFee || 0, 2)}"><span class="hint">Para cobrarlo como servicio en la orden.</span></div>
          <div class="field"><label>Prefijo de las órdenes</label><input class="input" name="orderPrefix" maxlength="4" value="${esc(s().orderPrefix || 'OT')}"></div>
        </div>
        <div class="field"><label>Nota al pie del comprobante</label><textarea class="input textarea" name="receiptNote" rows="2" placeholder="Ej.: Pasados 60 días de lista la orden, la óptica no se responsabiliza por los lentes no retirados.">${esc(s().receiptNote || '')}</textarea></div>
        ${save()}</form>
        <div class="card mt-lg"><div class="card-head"><div class="card-title">${icon('tag')} Categorías de gasto</div><button class="btn btn-ghost btn-sm" id="c-reset">Restaurar</button></div>
          <div class="chips chips-wrap mt">${store.categories.map((c) => `<span class="chip">${icon(c.icon)} ${esc(c.name)}${EXPENSE_CATEGORIES.some((x) => x.id === c.id) ? '' : ` <button class="linkish" data-cdel="${c.id}">${icon('x')}</button>`}</span>`).join('')}<button class="chip" id="c-add">${icon('plus')} Agregar</button></div></div>`;
      $('#f-rec').onsubmit = async (e) => {
        e.preventDefault(); const F = e.target.elements;
        await store.saveSettings({ minDepositPct: Math.min(100, Math.max(0, parseNum(F.minDepositPct.value))), warrantyDays: Math.max(0, Math.min(730, parseInt(F.warrantyDays.value, 10) || 0)), controlMonths: Math.max(1, Math.min(36, parseInt(F.controlMonths.value, 10) || 12)), examFee: round2(parseNum(F.examFee.value)), orderPrefix: F.orderPrefix.value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '') || 'OT', receiptNote: F.receiptNote.value.trim() });
        toast('Reglas guardadas');
      };
      $('#c-add').onclick = async () => {
        const { promptDialog } = await import('../utils.js');
        const name = await promptDialog({ title: 'Nueva categoría de gasto', label: 'Nombre', placeholder: 'Ej.: Estuches y paños' });
        if (!name?.trim()) return;
        await store.saveSettings({ categories: [...store.categories, { id: 'c' + shortId(5), name: name.trim(), icon: 'tag' }] }); render();
      };
      $('#c-reset').onclick = async () => { await store.saveSettings({ categories: EXPENSE_CATEGORIES }); render(); };
      body.querySelectorAll('[data-cdel]').forEach((x) => x.onclick = async () => { await store.saveSettings({ categories: store.categories.filter((c) => c.id !== x.dataset.cdel) }); render(); });
    }

    if (sec === 'horario') {
      const h = { ...HOURS_DEFAULT, ...(s().hours || {}) };
      body.innerHTML = `<form class="card stack" id="f-h">
        <div class="field"><label>Días de atención</label><div class="chips chips-wrap">${[1, 2, 3, 4, 5, 6, 0].map((d) => `<label class="chip chip-check"><input type="checkbox" name="d${d}" ${(h.days || []).map(Number).includes(d) ? 'checked' : ''}> ${DAYS[d]}</label>`).join('')}</div></div>
        <div class="form-grid form-grid-3">
          <div class="field"><label>Abre</label><input class="input" type="time" name="from" value="${esc(h.from)}"></div>
          <div class="field"><label>Cierra</label><input class="input" type="time" name="to" value="${esc(h.to)}"></div>
          <div class="field"><label>Sábado cierra</label><input class="input" type="time" name="satTo" value="${esc(h.satTo || '')}"></div>
          <div class="field"><label>Almuerzo desde</label><input class="input" type="time" name="lunchFrom" value="${esc(h.lunchFrom || '')}"></div>
          <div class="field"><label>Almuerzo hasta</label><input class="input" type="time" name="lunchTo" value="${esc(h.lunchTo || '')}"></div>
          <div class="field"><label>Duración de cada cita</label><select class="input select" name="slot">${[15, 20, 30, 40, 45, 60].map((m) => `<option value="${m}" ${Number(h.slot) === m ? 'selected' : ''}>${m} minutos</option>`).join('')}</select></div>
          <div class="field"><label>Pacientes a la misma hora</label><select class="input select" name="perSlot">${[1, 2, 3].map((n) => `<option value="${n}" ${Number(h.perSlot || 1) === n ? 'selected' : ''}>${n}${n > 1 ? ' (varios optometristas)' : ''}</option>`).join('')}</select></div>
        </div>
        <div class="box small" id="h-prev"></div>
        ${save()}</form>`;
      const F = $('#f-h').elements;
      const read = () => ({ days: [0, 1, 2, 3, 4, 5, 6].filter((d) => F['d' + d].checked), from: F.from.value || '08:00', to: F.to.value || '17:00', satTo: F.satTo.value, lunchFrom: F.lunchFrom.value, lunchTo: F.lunchTo.value, slot: Number(F.slot.value), perSlot: Number(F.perSlot.value) });
      const prev = () => {
        const hh = read(); const d = new Date();
        for (let i = 0; i < 7 && hh.days.length && !hh.days.includes(d.getDay()); i++) d.setDate(d.getDate() + 1);
        const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const sl = hh.days.length ? daySlots(hh, k) : [];
        $('#h-prev').innerHTML = `${icon('calendar')} Vista previa del ${DAYS[d.getDay()]}: <b>${sl.length} cita(s)</b> · ${sl.slice(0, 14).map(fmtHour).join(' · ')}${sl.length > 14 ? ' …' : ''}`;
      };
      $('#f-h').oninput = prev; prev();
      $('#f-h').onsubmit = async (e) => { e.preventDefault(); const hh = read(); if (!hh.days.length) { toast('Elige al menos un día', 'warning'); return; } if (hh.from >= hh.to) { toast('La hora de cierre debe ser después de la apertura', 'warning'); return; } await store.saveSettings({ hours: hh }); toast('Horario guardado'); };
    }

    if (sec === 'cuentas') {
      const list = s().banks || [];
      body.innerHTML = `<div class="card card-flush"><div class="toolbar between"><div><b>Cuentas donde pagan los pacientes</b><div class="t-sub">Aparecen en el comprobante, en los mensajes de WhatsApp y en el portal del paciente.</div></div><button class="btn btn-primary btn-sm" id="k-new">${icon('plus')} Agregar</button></div>
        ${list.length ? `<div class="list" style="padding:6px 10px">${list.map((b) => `<div class="list-item"><span class="kpi-icon tone-info" style="width:38px;height:38px">${icon(b.type === 'pagomovil' ? 'phone' : b.type === 'efectivo' ? 'cash' : 'card')}</span><div class="grow" style="min-width:0"><b>${esc(BANK_TYPES[b.type] || b.type)}${b.bank ? ` · ${esc(b.bank)}` : ''}</b><div class="t-sub ellipsis">${esc([b.number, b.phone, b.email, b.holder, b.idDoc].filter(Boolean).join(' · '))}</div></div><button class="btn btn-ghost btn-icon btn-sm" data-ke="${b.id}">${icon('edit')}</button><button class="btn btn-ghost btn-icon btn-sm" data-kd="${b.id}">${icon('trash')}</button></div>`).join('')}</div>` : `<div class="pd-3">${emptyState('card', 'Sin cuentas', 'Agrega la cuenta bancaria, el pago móvil o el Zelle de la óptica.')}</div>`}</div>`;
      $('#k-new').onclick = () => bankForm();
      body.querySelectorAll('[data-ke]').forEach((x) => x.onclick = () => bankForm(list.find((b) => b.id === x.dataset.ke)));
      body.querySelectorAll('[data-kd]').forEach((x) => x.onclick = async () => { await store.saveSettings({ banks: list.filter((b) => b.id !== x.dataset.kd) }); render(); });
    }

    if (sec === 'portal') {
      const P = s().portal || {};
      body.innerHTML = `<form class="card stack" id="f-portal">
        <p class="small muted" style="margin:0">Cada paciente tiene un enlace privado, sin usuario ni contraseña (va en su comprobante con un QR). Ve <b>solo lo suyo</b>: el estado de sus lentes, su fórmula vigente, su saldo y sus pagos.</p>
        ${sw('enabled', P.enabled !== false, 'Portal del paciente activo', 'Si lo apagas, los enlaces muestran que el portal no está disponible.')}
        ${sw('reports', P.reports !== false, 'Permitir reportar pagos', 'El paciente indica monto, banco y referencia; tú lo confirmas en Cobranza.')}
        ${sw('rx', P.rx !== false, 'Fórmula verificable con QR', 'Cualquiera puede comprobar con el código QR que la fórmula impresa es auténtica.')}
        ${sw('booking', P.booking !== false, 'Agenda en línea', 'Página pública donde los pacientes eligen un día y una hora libres según tu horario.')}
        ${save()}</form>
        <div class="card mt-lg"><div class="card-title">${icon('link')} Enlace de la agenda en línea</div><div class="code-box mono small mt" style="word-break:break-all" id="p-url">${esc(BOOKING_URL() || 'Aún no creado')}</div><div class="row mt" style="gap:6px">${s().bookingCode ? `<a class="btn btn-secondary btn-sm" href="${esc(BOOKING_URL())}" target="_blank" rel="noopener">${icon('external')} Abrir</a>` : `<button class="btn btn-primary btn-sm" id="p-make">${icon('plus')} Crear enlace</button>`}</div></div>`;
      $('#f-portal').onsubmit = async (e) => { e.preventDefault(); const F = e.target.elements; await store.saveSettings({ portal: { enabled: F.enabled.checked, reports: F.reports.checked, rx: F.rx.checked, booking: F.booking.checked } }); toast('Portal actualizado'); };
      $('#p-make')?.addEventListener('click', async () => { await ensureBookingCode(); render(); });
    }

    if (sec === 'moneda') {
      body.innerHTML = `<div class="card stack"><div class="between"><div><div class="card-title">${flagImg(loc().code, 20)} ${esc(loc().name)}</div><div class="t-sub">Trabajas en ${esc(loc().curName)} (${esc(loc().sym)})</div></div><button class="btn btn-secondary" id="m-country">${icon('globe')} Cambiar país</button></div></div><div class="mt-lg">${fxSectionHTML()}</div>`;
      bindFxSection(body, render);
      $('#m-country').onclick = async () => { if (!(await requirePin('Cambiar el país y la moneda'))) return; if (await openCountryPicker()) location.reload(); };
    }

    if (sec === 'seguridad') {
      body.innerHTML = `<div class="grid-2">
        <form class="card stack" id="f-pin"><div class="card-title">${icon('lock')} PIN de administrador</div><p class="small muted" style="margin:0">Protege anular órdenes, pagos y gastos, cambiar el país, descargar el respaldo y entrar a los reportes.</p>
          <div class="field"><label>Nuevo PIN (4 a 12 dígitos)</label><input class="input" name="pin" type="password" inputmode="numeric" maxlength="12" autocomplete="new-password"></div>
          <div class="field"><label>Repetir PIN</label><input class="input" name="pin2" type="password" inputmode="numeric" maxlength="12" autocomplete="new-password"></div>
          <button class="btn btn-primary">${icon('check')} Cambiar PIN</button></form>
        ${session.user?.isAnonymous ? `<div class="card stack"><div class="card-title">${icon('shield')} Contraseña</div><p class="muted" style="margin:0">En la demo no hay contraseña. Contrata SanoÓptica para tener tu propia cuenta.</p><a class="btn btn-whatsapp" href="${salesWa()}" target="_blank" rel="noopener">${icon('whatsapp')} ${SALES_PHONE_FMT}</a></div>`
          : `<form class="card stack" id="f-pass"><div class="card-title">${icon('shield')} Contraseña de acceso</div>
          <div class="field"><label>Contraseña actual</label><input class="input" name="cur" type="password" autocomplete="current-password"></div>
          <div class="field"><label>Nueva contraseña (mínimo 8)</label><input class="input" name="next" type="password" autocomplete="new-password"></div>
          <div class="error-msg" data-err></div>
          <button class="btn btn-primary">${icon('check')} Cambiar contraseña</button></form>`}
      </div>
      <div class="box small mt-lg">${icon('shieldCheck')} Las historias y fórmulas de tus pacientes solo son visibles con tu usuario. Cada portal muestra únicamente la información de ese paciente.</div>`;
      $('#f-pin').onsubmit = async (e) => {
        e.preventDefault(); const F = e.target.elements;
        if (store.isDemo) { toast('En la demo el PIN siempre es 1234.', 'info'); return; }
        if (!/^\d{4,12}$/.test(F.pin.value)) { toast('El PIN debe tener de 4 a 12 dígitos', 'warning'); return; }
        if (F.pin.value !== F.pin2.value) { toast('Los PIN no coinciden', 'warning'); return; }
        if (store.hasPin() && !(await requirePin('Cambiar el PIN', { always: true }))) return;
        await store.setPin(F.pin.value); e.target.reset(); toast('PIN actualizado');
      };
      const fp = $('#f-pass');
      if (fp) fp.onsubmit = async (e) => {
        e.preventDefault(); const F = e.target.elements; const err = fp.querySelector('[data-err]'); err.textContent = '';
        if (F.next.value.length < 8) { err.textContent = 'La nueva contraseña debe tener al menos 8 caracteres.'; return; }
        const btn = fp.querySelector('button'); setBusy(btn, true);
        try { await changePassword(F.cur.value, F.next.value); e.target.reset(); toast('Contraseña actualizada'); }
        catch (ex) { err.textContent = authErrorMessage(ex); }
        setBusy(btn, false);
      };
    }

    if (sec === 'apps') {
      body.innerHTML = `<div class="grid-2">
        <div class="card stack"><div class="card-title">${icon('install')} Instalar la app</div>
          <p class="small muted" style="margin:0">Instala SanoÓptica en la computadora del mostrador y en tu teléfono. Todo conectado en tiempo real, también sin internet.</p>
          ${isStandalone() ? `<div class="pay-status ok"><span>${icon('check')} Estás usando la app instalada</span><span></span></div>` : `<button class="btn btn-primary btn-lg" data-install>${icon('install')} Instalar en este equipo</button>`}
          <div class="list">
            <div class="list-item"><span class="kpi-icon tone-success" style="width:34px;height:34px">${icon('phone')}</span><div class="grow"><b>Android</b><div class="t-sub">Chrome › menú ⋮ › Instalar app</div></div></div>
            <div class="list-item"><span class="kpi-icon tone-info" style="width:34px;height:34px">${icon('laptop')}</span><div class="grow"><b>Computadora</b><div class="t-sub">Chrome o Edge › ícono de instalar en la barra de direcciones</div></div></div>
            <div class="list-item"><span class="kpi-icon tone-violet" style="width:34px;height:34px">${icon('phone')}</span><div class="grow"><b>iPhone / iPad</b><div class="t-sub">Safari › Compartir › Agregar a inicio</div></div></div>
          </div></div>
        <div class="card stack"><div class="card-title">${icon('download')} Respaldo de datos</div>
          <p class="small muted" style="margin:0">Descarga una copia de pacientes, exámenes, órdenes, pagos, inventario, laboratorios, citas, gastos, cierres y configuración (JSON). Protegido con PIN.</p>
          <button class="btn btn-secondary" id="s-backup">${icon('download')} Descargar respaldo completo</button>
          <div class="divider"></div>
          <div class="card-title">${icon('whatsapp')} Soporte</div>
          <a class="btn btn-whatsapp" href="${salesWa('Hola, necesito soporte con SanoÓptica.')}" target="_blank" rel="noopener">${icon('whatsapp')} ${SALES_PHONE_FMT}</a></div>
      </div>`;
      bindInstallButtons(body);
      $('#s-backup').onclick = async (e) => {
        const btn = e.currentTarget;
        if (!(await requirePin('Descargar el respaldo'))) return;
        setBusy(btn, true, 'Preparando…');
        try {
          const names = ['patients', 'exams', 'orders', 'payments', 'products', 'labs', 'appointments', 'expenses', 'closings', 'moves'];
          const got = await Promise.all(names.map((n) => store.listAll(n)));
          const data = { app: 'SanoÓptica', exportedAt: nowISO(), business: store.businessName, settings: store.settings, inbox: store.inbox };
          names.forEach((n, i) => { data[n] = got[i]; });
          download(`respaldo-${slugify(store.businessName || 'sanooptica')}-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2), 'application/json');
          toast('Respaldo descargado');
        } catch (ex) { toast('No se pudo generar el respaldo: ' + ex.message, 'danger'); }
        setBusy(btn, false);
      };
    }
  }


  function bankForm(b = null) {
    const x = b || { type: loc().code === 'VE' ? 'pagomovil' : 'transferencia', active: true };
    const m = openModal({
      title: b ? 'Editar cuenta' : 'Nueva cuenta para cobrar', size: 'md',
      body: `<form class="stack" data-f>
        <div class="field"><label>Tipo</label><select class="input select" name="type">${Object.entries(BANK_TYPES).map(([k, l]) => `<option value="${k}" ${x.type === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="form-grid">
          <div class="field"><label>Banco</label><input class="input" name="bank" value="${esc(x.bank || '')}" placeholder="Ej.: Banesco"></div>
          <div class="field"><label>N° de cuenta</label><input class="input" name="number" value="${esc(x.number || '')}"></div>
          <div class="field"><label>Teléfono (pago móvil)</label><input class="input" name="phone" value="${esc(x.phone || '')}"></div>
          <div class="field"><label>Correo (Zelle)</label><input class="input" name="email" value="${esc(x.email || '')}"></div>
          <div class="field"><label>Titular</label><input class="input" name="holder" value="${esc(x.holder || '')}" placeholder="Óptica Visión Clara C.A."></div>
          <div class="field"><label>${esc(loc().tax)} / ${esc(loc().id)}</label><input class="input" name="idDoc" value="${esc(x.idDoc || '')}"></div>
        </div></form>`,
      footer: `<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" data-ok>${icon('check')} Guardar</button>`
    });
    m.el.querySelector('[data-ok]').onclick = async () => {
      const F = m.el.querySelector('[data-f]').elements;
      const item = { id: x.id || 'k' + shortId(5), type: F.type.value, bank: F.bank.value.trim(), number: F.number.value.trim(), phone: F.phone.value.trim(), email: F.email.value.trim(), holder: F.holder.value.trim(), idDoc: F.idDoc.value.trim(), active: true };
      const list = s().banks || [];
      await store.saveSettings({ banks: b ? list.map((y) => (y.id === b.id ? item : y)) : [...list, item] });
      m.close(); toast('Cuenta guardada'); render();
    };
  }
  el.querySelectorAll('[data-s]').forEach((b) => b.onclick = () => { sec = b.dataset.s; render(); });
  render();
  return () => {};
}
