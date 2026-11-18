// SanoÓptica — Verificación pública de una fórmula óptica (código QR impreso)
import { getRx } from '../store.js';
import { esc, num, fmtDate, waLink } from '../utils.js';
import { icon } from '../icons.js';
import { fmtDiop, fmtAxis, LENS_TYPES, LENS_USE } from '../optica.js';

export async function mount(el) {
  const code = (location.pathname.split('/')[2] || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  el.innerHTML = `<div class="portal-page"><div class="portal-load">${icon('shieldCheck')}<p>Verificando la fórmula…</p></div></div>`;
  document.title = 'Verificar fórmula · SanoÓptica';
  let r = null;
  try { r = code ? await getRx(code) : null; } catch (e) { console.warn(e); }
  if (!r) {
    el.innerHTML = `<div class="portal-page"><div class="verify-card card center"><span class="kpi-icon tone-danger" style="width:68px;height:68px;margin:0 auto">${icon('x')}</span><h2>Fórmula no encontrada</h2><p class="t-sub">El código <b class="mono">${esc(code || '—')}</b> no corresponde a ninguna fórmula registrada. Si te la entregaron impresa, comunícate con la óptica que la emitió.</p><a class="btn btn-ghost" href="/">Ir a SanoÓptica</a></div></div>`;
    return;
  }
  const ok = r.status !== 'anulada';
  const row = (k, e = {}) => `<tr><th><span class="eye-tag eye-${k}">${k.toUpperCase()}</span></th><td>${fmtDiop(e.sph)}</td><td>${e.cyl ? fmtDiop(e.cyl) : '—'}</td><td>${e.cyl ? fmtAxis(e.axis) : '—'}</td><td>${e.add ? fmtDiop(e.add) : '—'}</td></tr>`;
  document.title = `Fórmula ${r.number} · ${r.business}`;
  el.innerHTML = `<div class="portal-page"><div class="verify-card card">
    <div class="center"><span class="kpi-icon tone-${ok ? 'success' : 'danger'}" style="width:72px;height:72px;border-radius:22px;margin:0 auto">${icon(ok ? 'shieldCheck' : 'x')}</span>
      <h2 style="margin:12px 0 2px">${ok ? 'Fórmula auténtica' : 'Fórmula anulada'}</h2><p class="t-sub">${ok ? 'Emitida y registrada por la óptica en SanoÓptica.' : 'Esta fórmula fue anulada por la óptica y no es válida.'}</p></div>
    <div class="kv mt"><div><span>Óptica</span><b>${esc(r.business)}</b></div><div><span>Paciente</span><b>${esc(r.patient)}</b></div><div><span>Fórmula</span><b class="mono">${esc(r.number)}</b></div><div><span>Fecha del examen</span><b>${fmtDate(r.date)}</b></div>${r.optometrist ? `<div><span>Optometrista</span><b>${esc(r.optometrist)}${r.license ? ` · ${esc(r.license)}` : ''}</b></div>` : ''}${r.nextControl ? `<div><span>Próximo control</span><b>${fmtDate(r.nextControl)}</b></div>` : ''}</div>
    ${ok ? `<div class="table-wrap mt"><table class="rx-table rx-pub"><thead><tr><th></th><th>Esfera</th><th>Cilindro</th><th>Eje</th><th>Adición</th></tr></thead><tbody>${row('od', r.od)}${row('oi', r.oi)}</tbody></table></div>
      <div class="kv kv-3 mt">${r.dp ? `<div><span>DP</span><b>${num(r.dp, 1)} mm</b></div>` : ''}${r.lensType ? `<div><span>Lente</span><b>${esc(LENS_TYPES[r.lensType]?.label || r.lensType)}</b></div>` : ''}${r.use ? `<div><span>Uso</span><b>${esc(LENS_USE[r.use] || r.use)}</b></div>` : ''}</div>` : ''}
    <p class="t-sub center mt">Código de verificación <b class="mono">${esc(r.code)}</b>${r.address ? ` · ${esc(r.address)}` : ''}</p>
    ${r.phone ? `<a class="btn btn-whatsapp btn-block" href="${waLink(r.phone, `Hola, quiero confirmar la fórmula ${r.number}.`)}" target="_blank" rel="noopener">${icon('whatsapp')} Contactar a la óptica</a>` : ''}
    <div class="portal-by"><div class="t-sub">Verificado con <b>SanoÓptica</b></div></div></div></div>`;
}
