// SanoÓptica — Genera el video tutorial narrado (voz es-VE) grabando el sistema real.
// Requisitos: URL de la app (producción o emuladores), ffmpeg en el PATH y `pip install edge-tts`.
// Uso: node make-video.mjs [url=https://sano-optica.web.app]
//   RECORD_ONLY=1 solo graba · ENCODE_ONLY=1 solo monta lo grabado (útil con poca RAM) · UNTIL=08 graba hasta esa escena
import puppeteer from 'puppeteer-core';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = process.argv[2] || 'https://sano-optica.web.app';
const WORK = path.join(here, 'work');
const OUT_DIR = path.join(here, '..', '..', 'public', 'tutorial');
mkdirSync(WORK, { recursive: true }); mkdirSync(OUT_DIR, { recursive: true });
const FFMPEG = execFileSync('where', ['ffmpeg']).toString().split(/\r?\n/)[0].trim();
const VOICE = 'es-VE-PaolaNeural';
const W = 1280, H = 720;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LAST = '.modal-backdrop:last-child';

// ======================================================================
// Guion: cada escena tiene la narración y las acciones que se graban
// ======================================================================
const SCENES = [
  { id: '01-intro', card: 'intro', text: 'Hola. Bienvenido a SanoÓptica, el sistema para llevar tu óptica en orden. En pocos minutos te muestro cómo registrar el examen visual, armar la orden de los lentes con el laboratorio, cobrar los abonos, controlar tus monturas y avisarle a cada paciente cuando sus lentes están listos.' },
  { id: '02-login', text: 'Para empezar, entra con el usuario y la contraseña de tu óptica. Si solo quieres probar, toca “Probar demo gratis”: tendrás treinta minutos con una óptica de ejemplo, con pacientes, fórmulas, órdenes y monturas.',
    act: async (v, dur) => { await v.hl('#login-form', 4200); await v.hl('#lg-demo', 4600); await v.move('#lg-demo'); await sleep(Math.max(0, dur * 1000 - 11800)); await v.point('#lg-demo'); }, after: 'country' },
  { id: '03-pais', text: 'La primera vez, el sistema te pregunta en qué país está tu óptica. Así toma sola la moneda; en Venezuela además usa la tasa oficial del BCV del día para cobrar en bolívares.',
    act: async (v) => {
      await v.hl('.country-grid', 4200);
      await v.point(`${LAST} [data-search], ${LAST} input`); await v.page.keyboard.type('Venez', { delay: 110 }); await sleep(900);
      await v.point('.country-grid [data-c="VE"]'); await sleep(1400);
      await v.point(`${LAST} [data-ok]`); await sleep(800);
    }, after: 'demo' },
  { id: '04-inicio', text: 'Esta es tu pantalla de inicio. Arriba tienes a un toque lo que más haces: examen visual, nueva orden, cobrar y venta de mostrador. Ves lo cobrado hoy, lo que te deben y cuántos examinados terminan comprando. Y aquí, cada orden en curso: en el laboratorio, en control de calidad o lista para retirar.',
    act: async (v) => { await v.hl('[data-tour="quick"]', 4800); await v.hl('[data-tour="kpis"]', 6000); await v.hl('[data-tour="pipeline"]', 6000); await v.hl('[data-tour="today"]', 3000); } },
  { id: '05-examen', text: 'El examen visual es rápido: eliges al paciente, anotas la agudeza visual y la fórmula de cada ojo, con esfera, cilindro, eje y adición. El sistema valida los valores, transpone el cilindro, sugiere el diagnóstico y el tipo de cristal, y deja programado el próximo control.',
    act: async (v) => {
      await v.nav('examenes'); await sleep(900); await v.hl('#e-list', 3200);
      await v.point('#e-new'); await sleep(1000); await v.point('.modal .pick-list .list-item'); await sleep(1400);
      await v.scrollModalTo('.rx-table'); await v.hl('.modal .rx-table', 6500); await v.scrollModalTo('.rx-live'); await v.hl('.modal .rx-live', 3500);
    }, after: 'closeModal' },
  { id: '06-orden', text: 'Desde la fórmula creas la orden de trabajo: eliges la montura de tu inventario o la que trae el paciente, los cristales y tratamientos de tu lista de precios, el laboratorio y la fecha de entrega. A la derecha ves el total, el abono mínimo y lo que resta al retirar.',
    act: async (v) => {
      await v.nav('ordenes'); await sleep(900);
      await v.point('#o-new'); await sleep(1000); await v.point('.modal .pick-list .list-item'); await sleep(1500);
      await v.point('.modal .frame-pick'); await sleep(800);
      await v.scrollModalTo('.lens-grid'); await v.point('.modal .lens-opt', 'Progresivo'); await sleep(900); await v.hl('.modal .lens-grid', 3500);
      await v.hl('.modal .ob-side', 5500);
    }, after: 'closeModal' },
  { id: '07-tablero', text: 'En el tablero de órdenes sigues cada par de lentes: registrada, en el laboratorio, en control de calidad y lista para retirar. Las atrasadas se marcan en rojo. Con un toque la pasas al siguiente paso, e imprimes la orden para el laboratorio con el cilindro en negativo y sin precios.',
    act: async (v) => { await v.nav('ordenes'); await sleep(900); await v.hl('.kboard', 5000); await v.point('.k-card'); await sleep(1300); await v.hl('.modal .o-steps', 5000); await v.hl('.modal .u-actions, .modal [data-a]', 3500); }, after: 'closeModal' },
  { id: '08-entrega', text: 'Antes de entregar, el sistema te pide revisar el control de calidad: la graduación en el lensómetro, los centros ópticos, los tratamientos y el ajuste de la montura. No te deja entregar con saldo pendiente, y al entregar empieza a contar la garantía.',
    act: async (v) => { await v.nav('ordenes'); await sleep(900); await v.hl('.kcol:last-child', 4500); await v.point('.kcol:last-child .k-card'); await sleep(1300); await v.hl('.modal .u-bal', 3500); await v.hl('.modal .o-steps', 3500); }, after: 'closeModal' },
  { id: '09-portal', track: 'paciente', text: 'Cada paciente tiene su portal privado, en el teléfono y sin contraseñas: ve en qué paso van sus lentes, su fórmula, su saldo con tus cuentas para pagar, reporta su pago y pide su próxima cita.' },
  { id: '10-cobranza', text: 'En Cobranza registras los abonos en dólares o en bolívares a la tasa del día. Los pagos que reportan los pacientes desde su portal llegan aquí: revisas la referencia y confirmas. También ves quién te debe y le recuerdas por WhatsApp.',
    act: async (v) => { await v.nav('cobranza'); await sleep(1000); await v.hl('#c-kpis', 3800); await v.point('#c-tabs button', 'Reportados'); await sleep(1200); await v.hl('#c-body', 5000); await v.point('#c-tabs button', 'Saldos'); await sleep(1200); await v.hl('#c-body', 3000); } },
  { id: '11-venta', text: 'La venta de mostrador es para lentes de sol, de contacto, soluciones y accesorios: escaneas el código de barras o tocas el producto, eliges la forma de pago y el sistema calcula el vuelto.',
    act: async (v) => { await v.nav('venta'); await sleep(900); await v.hl('#p-grid', 3000); await v.point('#p-grid .prod:not(:disabled)'); await sleep(600); await v.point('#p-grid .prod:not(:disabled)'); await sleep(900); await v.hl('#p-cart', 5000); } },
  { id: '12-inventario', text: 'En Inventario llevas tus monturas por marca, modelo, color y medidas, con su costo, su precio y su margen. Te avisa cuando algo queda en poca existencia, registras entradas y salidas e imprimes etiquetas con código de barras.',
    act: async (v) => { await v.nav('inventario'); await sleep(900); await v.hl('#i-kpis', 4500); await v.hl('#i-list', 6000); } },
  { id: '13-laboratorios', text: 'En Laboratorios guardas cada laboratorio con sus días de entrega. El sistema calcula la fecha prometida y mide cuánto tarda de verdad cada uno. Aquí también ajustas los precios de tus cristales y tratamientos.',
    act: async (v) => { await v.nav('laboratorios'); await sleep(900); await v.hl('#l-body .lab-card', 6000); await v.point('#l-tabs button', 'Cristales'); await sleep(1300); await v.hl('#l-body', 4000); } },
  { id: '14-agenda', text: 'Comparte tu agenda en línea por Instagram o WhatsApp: el paciente elige el motivo, el día y una hora libre según tu horario, y la cita te llega para confirmar. Desde la cita empiezas el examen.',
    act: async (v) => { await v.nav('agenda'); await sleep(1000); await v.hl('#a-share', 4500); await v.hl('#a-body', 5000); } },
  { id: '15-recordatorios', text: 'En Recordatorios tienes listos los mensajes para traer a tus pacientes de vuelta: controles anuales vencidos, lentes sin retirar, saldos pendientes, citas de mañana y cumpleaños. Se envían por WhatsApp y quedan marcados.',
    act: async (v) => { await v.nav('recordatorios'); await sleep(1000); await v.hl('#r-tabs', 4000); await v.hl('#r-body', 6500); } },
  { id: '16-caja', text: 'En Caja ves lo cobrado del día por forma de pago y los gastos, y cierras contando el efectivo: el sistema te dice si cuadra, si falta o si sobra. Y en Reportes, protegidos con tu PIN, ves lo vendido, la ganancia, las marcas y los cristales que más se venden.',
    act: async (v) => {
      await v.nav('caja'); await sleep(900); await v.hl('#k-body', 5500);
      await v.nav('reportes'); await sleep(900);
      const pin = await v.page.$('.modal [data-pin]'); if (pin) { await pin.type('1234', { delay: 120 }); await v.page.evaluate(() => [...document.querySelectorAll('.modal [data-ok]')].pop().click()); await sleep(1200); }
      await v.hl('#r-body', 6000);
    } },
  { id: '17-instalar', card: 'phone', text: 'SanoÓptica se instala desde el navegador, en la computadora del mostrador, en una tablet o en tu teléfono, sin descargar nada de una tienda. Funciona incluso si se va el internet, y todo queda guardado en la nube.' },
  { id: '18-ayuda', text: 'Si tienes dudas, en “Ayuda y recorridos” encuentras guías que te señalan cada parte de la pantalla, y este mismo video.',
    act: async (v) => { await v.nav('inicio'); await sleep(500); await v.point('#sb-help'); await sleep(1300); await v.hl('.modal .help-list', 3500); }, after: 'closeModal' },
  { id: '19-cierre', card: 'outro', text: '¿Listo para tener tu óptica en orden y a tus pacientes viendo claro? Escríbenos por WhatsApp al más cincuenta y ocho, cuatro, dos, dos, uno, nueve, cero, seis, cero, cuatro, cinco, y activa SanoÓptica hoy mismo.' }
];

// ======================================================================
// Voz
// ======================================================================
function tts(scene) {
  const h = createHash('md5').update(VOICE + scene.text).digest('hex').slice(0, 10);
  const mp3 = path.join(WORK, `${scene.id}-${h}.mp3`), srt = path.join(WORK, `${scene.id}-${h}.srt`);
  if (!existsSync(mp3)) execFileSync('python', ['-m', 'edge_tts', '--voice', VOICE, '--rate=+3%', '--text', scene.text, '--write-media', mp3, '--write-subtitles', srt]);
  const dur = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp3]).toString());
  return { mp3, srt, dur };
}

// ======================================================================
// Ayudas visuales: cursor animado, clic y resaltado
// ======================================================================
const OVERLAY = () => {
  const add = () => {
    if (document.getElementById('vcur')) return;
    const st = document.createElement('style');
    st.textContent = `#vcur{position:fixed;left:640px;top:360px;width:26px;height:26px;z-index:2147483647;pointer-events:none;transition:left .7s cubic-bezier(.2,.8,.2,1),top .7s cubic-bezier(.2,.8,.2,1);filter:drop-shadow(0 2px 4px rgba(0,0,0,.5))}
      .vrip{position:fixed;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;border:3px solid #fbbf24;z-index:2147483646;pointer-events:none;animation:vrip .6s ease-out forwards}
      @keyframes vrip{to{transform:scale(3.6);opacity:0}}
      .vhl{position:fixed;z-index:2147483645;pointer-events:none;border-radius:14px;border:3px solid #fbbf24;box-shadow:0 0 0 4px rgba(251,191,36,.25),0 0 28px 6px rgba(251,191,36,.45);transition:opacity .3s;animation:vhl 1.4s ease-in-out infinite}
      @keyframes vhl{50%{box-shadow:0 0 0 7px rgba(251,191,36,.18),0 0 34px 10px rgba(251,191,36,.3)}}
      .toasts{top:auto!important;bottom:18px!important}`;
    document.head.appendChild(st);
    const c = document.createElement('div');
    c.id = 'vcur';
    c.innerHTML = '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M4 2l15 9.5-6.6 1.4L16 20.5l-3 1.4-3.6-7.6L4 19z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>';
    document.body.appendChild(c);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add); else add();
};

function helpers(page) {
  const rectOf = async (sel, text = null, pick = null) => {
    const r = await page.evaluate((sel, text, pickSrc) => {
      const vis = (e) => { const b = e.getBoundingClientRect(); return b.width > 2 && b.height > 2; };
      let el = [...document.querySelectorAll(sel)].find((e) => vis(e) && (!text || e.textContent.replace(/\s+/g, ' ').includes(text)));
      if (!el) return null;
      if (pickSrc) el = (0, eval)(pickSrc)(el) || el;
      const b0 = el.getBoundingClientRect();
      if (b0.top < 0 || b0.bottom > innerHeight) el.scrollIntoView({ block: 'center', behavior: 'instant' });
      else el.scrollIntoView({ block: 'nearest', behavior: 'instant' });
      const b = el.getBoundingClientRect();
      return { x: b.left, y: b.top, w: b.width, h: b.height };
    }, sel, text, pick ? pick.toString() : null);
    if (!r) console.warn('   (no encontré', sel, text || '', ')');
    return r;
  };
  const moveXY = async (x, y) => { await page.evaluate((x, y) => { const c = document.getElementById('vcur'); if (c) { c.style.left = x + 'px'; c.style.top = y + 'px'; } }, x, y); await sleep(760); };
  const v = {
    page,
    async move(sel, text) { const r = await rectOf(sel, text); if (r) await moveXY(r.x + r.w / 2, r.y + r.h / 2); return r; },
    async point(sel, text) {
      const r = await v.move(sel, text);
      if (!r) return;
      const x = r.x + r.w / 2, y = r.y + r.h / 2;
      await page.evaluate((x, y) => { const d = document.createElement('div'); d.className = 'vrip'; d.style.left = x + 'px'; d.style.top = y + 'px'; document.body.appendChild(d); setTimeout(() => d.remove(), 700); }, x, y);
      // Si algo cambió de lugar mientras se movía el cursor, se pulsa el elemento directamente
      const hit = await page.evaluate((sel, text, x, y) => {
        const vis = (e) => { const b = e.getBoundingClientRect(); return b.width > 2 && b.height > 2; };
        const el = [...document.querySelectorAll(sel)].find((e) => vis(e) && (!text || e.textContent.replace(/\s+/g, ' ').includes(text)));
        if (!el) return 'sin elemento';
        const at = document.elementFromPoint(x, y);
        if (at && (at === el || el.contains(at))) return 'ok';
        if (typeof el.click === 'function') el.click(); else el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        return 'directo: ' + (at ? at.tagName + '.' + at.className : 'nada');
      }, sel, text || null, x, y);
      if (hit === 'ok') await page.mouse.click(x, y);
      else console.warn('   clic', sel, '→', hit);
      await sleep(250);
    },
    pointText(sel, text) { return v.point(sel, text); },
    async pointRow(rowSel, text, btnSel) {
      const r = await rectOf(rowSel, text, (el) => el.querySelector('[data-ed]'));
      if (!r) return;
      await moveXY(r.x + r.w / 2, r.y + r.h / 2);
      await page.mouse.click(r.x + r.w / 2, r.y + r.h / 2);
    },
    async hl(sel, ms = 2500, pick = null, text = null) {
      const r = await rectOf(sel, text, pick);
      if (!r) { await sleep(ms); return; }
      await page.evaluate((r) => { const d = document.createElement('div'); d.className = 'vhl'; d.id = 'vhl-cur'; Object.assign(d.style, { left: r.x - 6 + 'px', top: r.y - 6 + 'px', width: r.w + 12 + 'px', height: r.h + 12 + 'px' }); document.body.appendChild(d); }, r);
      await sleep(ms);
      await page.evaluate(() => document.querySelectorAll('.vhl').forEach((d) => d.remove()));
    },
    hlText(sel, text, ms) { return v.hl(sel, ms, null, text); },
    hlRow(sel, text, ms) { return v.hl(sel, ms, null, text); },
    async scrollModalTo(sel) { await page.evaluate((sel) => document.querySelector('.modal ' + sel)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), sel); await sleep(700); },
    async nav(id) { await v.point(`.sb-nav [data-nav="${id}"]`); await sleep(500); },
    async navRaw(id) { await v.point(`.sb-nav [data-nav="${id}"]`); }
  };
  return v;
}

// ======================================================================
// Tarjetas (portada, instalación en teléfono, cierre)
// ======================================================================
const logo = readFileSync(path.join(here, '..', '..', 'public', 'assets', 'logo.svg'), 'utf8');
const CARD_CSS = `body{margin:0;width:${W}px;height:${H}px;overflow:hidden;font-family:'Segoe UI',system-ui,sans-serif;color:#fff;
  background:radial-gradient(900px 500px at -10% -20%,#0284c7 0%,transparent 55%),radial-gradient(800px 500px at 110% 120%,#0ea5e9 0%,transparent 50%),linear-gradient(150deg,#04121f,#082f49 55%,#0c4a6e)}
  .c{height:100%;display:flex;align-items:center;justify-content:center;gap:60px;text-align:left}
  .logo svg{width:150px;height:150px;border-radius:40px;box-shadow:0 30px 60px -20px rgba(0,0,0,.7);animation:pop .9s cubic-bezier(.2,.8,.2,1)}
  h1{font-size:64px;margin:0;letter-spacing:-2px;animation:up .9s .15s both} h1 em{font-style:normal;background:linear-gradient(90deg,#e0f2fe,#7dd3fc);-webkit-background-clip:text;color:transparent}
  p{font-size:26px;margin:14px 0 0;opacity:.82;animation:up .9s .35s both} .tag{display:inline-block;margin-top:26px;padding:10px 18px;border-radius:999px;background:rgba(255,255,255,.12);font-size:20px;animation:up .9s .55s both}
  @keyframes pop{from{transform:scale(.6);opacity:0}} @keyframes up{from{transform:translateY(22px);opacity:0}}`;
function cardHTML(kind) {
  if (kind === 'intro') return `<style>${CARD_CSS}</style><div class="c"><div class="logo">${logo}</div><div><h1>Sano<em>Óptica</em></h1><p>Tutorial: cómo llevar tu óptica</p><span class="tag">Examen visual · Órdenes · Laboratorio · Abonos · Monturas</span></div></div>`;
  if (kind === 'outro') return `<style>${CARD_CSS} .wa{display:inline-flex;align-items:center;gap:14px;margin-top:28px;padding:18px 28px;border-radius:18px;background:#16a34a;font-size:34px;font-weight:700;animation:up .9s .45s both;box-shadow:0 20px 40px -16px rgba(22,163,74,.8)}</style>
    <div class="c"><div class="logo">${logo}</div><div><h1>Tu óptica <em>en orden</em></h1><p>Instálala desde sano-optica.web.app</p><div class="wa">WhatsApp +58 422-190 6045</div></div></div>`;
  return `<style>${CARD_CSS} .phone{width:330px;height:640px;border-radius:46px;background:#000;padding:12px;box-shadow:0 40px 80px -24px rgba(0,0,0,.85),0 0 0 2px #333;animation:pop .9s cubic-bezier(.2,.8,.2,1)}
    .phone{position:relative;width:302px;height:648px;padding:12px;overflow:hidden} .phone img{position:absolute;left:12px;top:12px;width:302px;height:648px;object-fit:cover;object-position:top;border-radius:36px}
    .phone .s2{opacity:0;animation:fadein .8s 7s forwards} @keyframes fadein{to{opacity:1}}
    .steps{max-width:520px} .steps h1{font-size:50px} .st{display:flex;gap:16px;align-items:center;margin-top:22px;font-size:24px;animation:up .8s both} .st b{width:44px;height:44px;border-radius:14px;background:#0284c7;display:grid;place-items:center;flex:none}</style>
    <div class="c"><div class="phone"><img src="${PHONE[0]}"><img class="s2" src="${PHONE[1]}"></div><div class="steps"><h1>Instálalo <em>desde la web</em></h1>
    <div class="st" style="animation-delay:.4s"><b>1</b>Abre sano-optica.web.app en Chrome</div>
    <div class="st" style="animation-delay:1.6s"><b>2</b>Toca “Instalar app”</div>
    <div class="st" style="animation-delay:2.8s"><b>3</b>Listo: el ícono queda en tu pantalla</div>
    <div class="st" style="animation-delay:4s"><b>✓</b>Teléfono, tablet o computadora, conectados</div></div></div>`;
}

// ======================================================================
// Grabación
// ======================================================================
const ENCODE_ONLY = !!process.env.ENCODE_ONLY;
const PHONE = [];
let parts = [];
if (!ENCODE_ONLY) {
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--no-sandbox', `--window-size=${W},${H}`, '--autoplay-policy=no-user-gesture-required', '--disable-gpu', '--disable-extensions', '--renderer-process-limit=2'] });
const app = await browser.newPage();
await app.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
await app.evaluateOnNewDocument(OVERLAY);
await app.evaluateOnNewDocument(() => { window.print = () => {}; Element.prototype.requestFullscreen = function () { return Promise.resolve(); }; try { localStorage.setItem('so_installed', '1'); localStorage.setItem('so_theme', 'dark'); } catch (_) {} });
const v = helpers(app);

// Capturas del teléfono (Android) para la escena de instalación
// PHONE se declara arriba
{
  const ctx = await browser.createBrowserContext();
  const m = await ctx.newPage();
  await m.setUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36');
  await m.setViewport({ width: 390, height: 836, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await m.goto(APP, { waitUntil: 'networkidle0' });
  await m.waitForSelector('.install-card'); await sleep(900);
  await m.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await sleep(300);
  PHONE.push('data:image/png;base64,' + (await m.screenshot({ encoding: 'base64' })));
  await m.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
  await m.evaluate(() => document.querySelector('.install-card [data-install]').click());
  await m.waitForSelector('.modal'); await sleep(700);
  await m.evaluate(() => document.querySelectorAll('.toast').forEach((t) => t.remove()));
  PHONE.push('data:image/png;base64,' + (await m.screenshot({ encoding: 'base64' })));
  await ctx.close();
}
await app.goto(APP, { waitUntil: 'networkidle0' });
await app.waitForSelector('#login-form');
await sleep(1200);

parts = [];
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
if (ONLY) {
  // entra a la demo sin grabar y solo graba las escenas pedidas
  await app.click('#lg-demo');
  await app.waitForSelector('.country-grid [data-c="VE"]', { timeout: 90000 });
  await app.click('.country-grid [data-c="VE"]'); await sleep(400);
  await app.evaluate(() => [...document.querySelectorAll('.modal [data-ok]')].pop().click());
  await app.waitForSelector('.sb-nav', { timeout: 120000 });
  await app.waitForFunction(() => !document.getElementById('boot'), { timeout: 180000 }).catch(() => {});
  await app.waitForSelector('.tour-tip', { timeout: 30000 }).catch(() => {});
  await sleep(6000);
  await app.evaluate(async () => { (await import('/js/tour.js')).stopTour(); document.querySelectorAll('.tour').forEach((x) => x.remove()); document.querySelectorAll('.toast').forEach((t) => t.remove()); });
}
for (const sc of SCENES.filter((s) => (!process.env.UNTIL || s.id <= process.env.UNTIL) && (!ONLY || ONLY.some((o) => s.id.startsWith(o))))) {
  if (sc.before) { try { await sc.before(app); } catch (e) { console.warn('   antes:', e.message); } }
  const voice = tts(sc);
  console.log(`● ${sc.id} (${voice.dur.toFixed(1)} s)`);
  const webm = path.join(WORK, `${sc.id}.webm`);
  let page = app, cardPage = null;
  if (sc.card) {
    cardPage = await browser.newPage();
    await cardPage.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
    await cardPage.setContent(cardHTML(sc.card), { waitUntil: 'load' });
    page = cardPage;
  }
  if (sc.track) {
    cardPage = await browser.newPage();
    await cardPage.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
    const u = new URL(APP);
    await cardPage.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
    const code = await app.evaluate(async () => { const { store } = await import('/js/store.js'); const o = await import('/js/ops.js'); await o.publishPortals(); await new Promise((r) => setTimeout(r, 900)); await o.publishPortals(); await new Promise((r) => setTimeout(r, 1500)); const pt = store.patients.find((x) => store.ordersOf(x.id).some((y) => y.status === 'laboratorio')) || store.patients.find((x) => store.ordersOf(x.id).length); return pt?.portalCode; });
    await cardPage.goto(`${u.origin}/paciente/${code}${u.search}`, { waitUntil: 'networkidle2' });
    await cardPage.waitForSelector('.portal-hero', { timeout: 30000 }).catch(() => {});
    await cardPage.evaluateOnNewDocument(OVERLAY); await cardPage.evaluate(OVERLAY);
    v.shop = helpers(cardPage);
    await sleep(800);
    page = cardPage;
  }
  await page.bringToFront();
  await sleep(300);
  const rec = await page.screencast({ path: webm, ffmpegPath: FFMPEG });
  const t0 = Date.now();
  if (sc.track && v.shop) {
    try {
      const s2 = v.shop;
      await s2.hl('.portal-hero', 4200);
      await s2.hl('.p-steps', 3800);
      for (const t of ['formula', 'pagos', 'citas']) { await s2.point(`.portal-tabs [data-t="${t}"]`); await sleep(2600); }
      await s2.point('.portal-tabs [data-t="lentes"]'); await sleep(1200);
    } catch (e) { console.warn('   portal:', e.message); }
  }
  if (sc.act) { try { await sc.act(v, voice.dur); } catch (e) { console.warn('   acción:', e.message); } }
  const left = voice.dur * 1000 + 700 - (Date.now() - t0);
  if (left > 0) await sleep(left);
  await rec.stop();
  const total = Math.max(voice.dur + 0.7, (Date.now() - t0) / 1000);
  parts.push({ webm, ...voice, total });
  if (cardPage) await cardPage.close();
  // Acciones fuera de cámara
  if (sc.after === 'country') { await app.waitForSelector('.country-grid', { timeout: 90000 }); await sleep(900); }
  if (sc.after === 'demo') {
    await app.waitForSelector('.sb-nav', { timeout: 90000 });
    // la demo termina de cargar sus datos y recién ahí abre el recorrido
    await app.waitForFunction(() => !document.getElementById('boot'), { timeout: 180000 }).catch(() => {});
    await app.waitForSelector('.tour-tip', { timeout: 30000 }).catch(() => {});
    await app.evaluate(async () => (await import('/js/tour.js')).stopTour());
    await sleep(6000);
    await app.evaluate(async () => { (await import('/js/tour.js')).stopTour(); document.querySelectorAll('.tour').forEach((x) => x.remove()); document.querySelectorAll('.toast').forEach((t) => t.remove()); });
  }
  if (sc.after === 'exitKiosk') { await app.click('#k-exit').catch(() => {}); await app.waitForSelector('.modal [data-pin]', { timeout: 8000 }).catch(() => {}); await app.type('.modal [data-pin]', '1234').catch(() => {}); await app.evaluate(() => [...document.querySelectorAll('.modal [data-ok]')].pop()?.click()); await sleep(1500); }
  if (sc.after === 'closeModal') { await app.keyboard.press('Escape'); await sleep(400); await app.keyboard.press('Escape'); await sleep(1500); await app.evaluate(async () => (await import('/js/utils.js')).closeAllModals()).catch(() => {}); await sleep(400); }
}
// Termina la demo usada en la grabación (se borra de la base de datos)
try {
  await app.bringToFront();
  await app.keyboard.press('Escape'); await sleep(300);
  await app.evaluate(() => document.getElementById('demo-end')?.click());
  await app.waitForSelector('.modal [data-yes]', { timeout: 8000 }); await app.click('.modal [data-yes]');
  let fin = false; for (let i = 0; i < 60 && !fin; i++) { await sleep(1500); try { fin = !!(await app.$('#login-form')); } catch (_) {} }
  console.log(fin ? 'Demo de la grabación terminada y borrada' : 'La demo no confirmó el cierre (se limpia sola al vencer)');
} catch (e) { console.warn('No se pudo terminar la demo:', e.message); }
await browser.close();
if (ONLY) {
  const old = JSON.parse(readFileSync(path.join(WORK, 'parts.json'), 'utf8'));
  parts = old.map((o) => parts.find((n) => n.webm === o.webm) || o);
}
writeFileSync(path.join(WORK, 'parts.json'), JSON.stringify(parts, null, 1));
}
if (ENCODE_ONLY) parts = JSON.parse(readFileSync(path.join(WORK, 'parts.json'), 'utf8'));
if (process.env.RECORD_ONLY) { console.log('Grabación lista:', parts.length, 'escenas'); process.exit(0); }

// ======================================================================
// Montaje con ffmpeg: video + voz + subtítulos por escena, luego unión
// ======================================================================
const subStyle = "FontName=Segoe UI,FontSize=17,PrimaryColour=&H00FFFFFF,BackColour=&H99000000,BorderStyle=4,Outline=0,Shadow=0,MarginV=22,MarginL=60,MarginR=60";
const list = [];
for (const p of parts) {
  const mp4 = p.webm.replace('.webm', '.mp4');
  const srtName = path.basename(p.srt);
  execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-i', p.webm, '-i', p.mp3,
    '-filter_complex', `[0:v]fps=30,scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=0x04121f,tpad=stop_mode=clone:stop_duration=5,subtitles=${srtName}:force_style='${subStyle}',setsar=1[v];[1:a]adelay=250|250,apad[a]`,
    '-map', '[v]', '-map', '[a]', '-t', p.total.toFixed(2), '-c:v', 'libx264', '-preset', 'medium', '-crf', '24', '-pix_fmt', 'yuv420p', '-r', '30', '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2', mp4], { cwd: WORK });
  list.push(`file '${mp4.replace(/\\/g, '/')}'`);
}
const listFile = path.join(WORK, 'lista.txt');
writeFileSync(listFile, list.join('\n'));
const final = path.join(OUT_DIR, 'sano-optica-tutorial.mp4');
execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', '-movflags', '+faststart', final]);
execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-ss', '2.5', '-i', parts[0].webm.replace('.webm', '.mp4'), '-frames:v', '1', '-q:v', '3', path.join(OUT_DIR, 'portada.jpg')]);
const dur = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', final]).toString());
console.log(`\n✔ Video listo: ${final} (${(dur / 60).toFixed(1)} min)`);
