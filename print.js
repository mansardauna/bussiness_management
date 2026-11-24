'use strict';
/* =====================================================================
   Ma Caisse — receipts on small thermal printers (58 / 80 mm, ESC/POS).
   Three ways to print:
   - 'system': the phone's print dialog (works everywhere, needs a printer driver)
   - 'ble':    Bluetooth LE printers, straight from Chrome on Android (Web Bluetooth)
   - 'rawbt':  the free RawBT app, for "classic" Bluetooth printers (most cheap 58 mm models)
   Depends on core.js, cloud.js (bytesToB64), app.js (receiptHTML, printHTML).
   ===================================================================== */

const PRN = { dev: null, ch: null };
const prnCfg = () => ({ mode: 'system', width: 58, charset: 'cp850', auto: false, ...(S.settings.printer || {}) });

/* Code page 850 covers French and Spanish letters; anything else is simplified. */
const CP850 = { 'Ç': 0x80, 'ü': 0x81, 'é': 0x82, 'â': 0x83, 'ä': 0x84, 'à': 0x85, 'å': 0x86, 'ç': 0x87, 'ê': 0x88, 'ë': 0x89, 'è': 0x8A, 'ï': 0x8B, 'î': 0x8C, 'ì': 0x8D, 'Ä': 0x8E, 'Å': 0x8F, 'É': 0x90, 'æ': 0x91, 'Æ': 0x92, 'ô': 0x93, 'ö': 0x94, 'ò': 0x95, 'û': 0x96, 'ù': 0x97, 'ÿ': 0x98, 'Ö': 0x99, 'Ü': 0x9A, 'ø': 0x9B, '£': 0x9C, 'Ø': 0x9D, '×': 0x9E, 'á': 0xA0, 'í': 0xA1, 'ó': 0xA2, 'ú': 0xA3, 'ñ': 0xA4, 'Ñ': 0xA5, 'ª': 0xA6, 'º': 0xA7, '¿': 0xA8, '¡': 0xAD, '«': 0xAE, '»': 0xAF, 'Á': 0xB5, 'Â': 0xB6, 'À': 0xB7, 'ã': 0xC6, 'Ã': 0xC7, 'Ê': 0xD2, 'Ë': 0xD3, 'È': 0xD4, 'Í': 0xD6, 'Î': 0xD7, 'Ï': 0xD8, 'Ì': 0xDE, 'Ó': 0xE0, 'ß': 0xE1, 'Ô': 0xE2, 'Ò': 0xE3, 'õ': 0xE4, 'Õ': 0xE5, 'Ú': 0xE9, 'Û': 0xEA, 'Ù': 0xEB, '°': 0xF8, '·': 0xFA };
const plain = s => String(s ?? '').replace(/[   ]/g, ' ').replace(/[−–—]/g, '-').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/…/g, '...').replace(/€/g, 'EUR').replace(/→/g, '->');
function encChar(ch, cp) {
  const c = ch.codePointAt(0);
  if (c < 0x80) return c >= 0x20 ? c : 0x20;
  if (cp && CP850[ch]) return CP850[ch];
  const base = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
  return base.length === 1 && base.charCodeAt(0) < 0x80 ? base.charCodeAt(0) : 0x3F;
}

/* ESC/POS document builder. Returns bytes; .lines keeps the plain text (for tests and preview). */
function escDoc(width, charset) {
  const W = width === 80 ? 48 : 32, cp = charset !== 'ascii', b = [0x1B, 0x40, 0x1B, 0x74, cp ? 2 : 0], lines = [];
  const raw = (...x) => b.push(...x);
  const shown = s => cp ? s : [...s].map(ch => String.fromCharCode(encChar(ch, false))).join('');   // what the paper shows
  const text = s => { for (const ch of plain(s)) b.push(encChar(ch, cp)); };
  const wrap = s => { const out = []; let cur = ''; for (const w of plain(s).split(/\s+/)) { if ((cur + ' ' + w).trim().length > W) { if (cur) out.push(cur); cur = w.length > W ? w.slice(0, W) : w; } else cur = (cur + ' ' + w).trim(); } if (cur || !out.length) out.push(cur); return out; };
  const d = {
    W, lines,
    line(s = '') { for (const l of wrap(s)) { text(l); raw(0x0A); lines.push(shown(l)); } return d; },
    lr(l, r) { l = plain(l); r = plain(r); if (l.length + r.length + 1 > W) { d.line(l); l = ''; } const s = l + ' '.repeat(Math.max(1, W - l.length - r.length)) + r; text(s); raw(0x0A); lines.push(shown(s)); return d; },
    rule(ch = '-') { return d.line(ch.repeat(W)); },
    center(on) { raw(0x1B, 0x61, on ? 1 : 0); return d; },
    bold(on) { raw(0x1B, 0x45, on ? 1 : 0); return d; },
    tall(on) { raw(0x1D, 0x21, on ? 0x01 : 0x00); return d; },
    end() { raw(0x1B, 0x64, 4, 0x1D, 0x56, 0x42, 0x00); return Object.assign(Uint8Array.from(b), { lines }); }   // feed + cut (ignored without cutter)
  };
  return d;
}
function escReceipt(s, o = prnCfg()) {
  const st = S.settings, d = escDoc(+o.width, o.charset), bottles = s.items.filter(i => i.bottle);
  d.center(1).bold(1).tall(1).line(bizName()).tall(0).bold(0);
  if (st.address) d.line(st.address);
  if (st.phone) d.line(t('Tel: {p}', { p: st.phone }));
  d.center(0).rule();
  d.bold(1).lr(`${t('RECEIPT')} ${s.no}`, s.void ? t('VOIDED') : '').bold(0).line(fdate(s.date));
  if (s.client) d.line(t('Customer: {c}', { c: s.client }));
  d.rule();
  for (const i of s.items) d.line(i.name).lr(`  ${i.qty} x ${fmt(i.price, s.cur)}`, fmt(i.qty * i.price, s.cur));
  d.rule();
  if (s.discount) d.lr(t('Subtotal'), fmt(s.sub, s.cur)).lr(t('Discount'), '- ' + fmt(s.discount, s.cur));
  d.bold(1).tall(1).lr(t('TOTAL'), fmt(s.total, s.cur)).tall(0).bold(0);
  d.lr(t('Paid ({m})', { m: s.paid ? mName(s.method) : mName('credit') }), fmt(s.paid, s.cur));
  if (s.change) d.lr(t('Change given'), fmt(s.change, s.cur));
  if (s.total - s.paid > 0) d.bold(1).lr(t('BALANCE DUE'), fmt(s.total - s.paid, s.cur)).bold(0);
  if (bottles.length) { d.rule(); d.line(t('Packaging') + ':'); for (const i of bottles) d.line(`${i.name} ${t('{b}/{q} returned', { b: i.back, q: i.qty })}` + (i.qty - i.back > 0 ? ` (${t('{n} to bring back', { n: i.qty - i.back })})` : '')); }
  d.rule().center(1).line(footerText()).center(0);
  return d.end();
}
function escTest(o = prnCfg()) {
  const d = escDoc(+o.width, o.charset);
  d.center(1).bold(1).tall(1).line(bizName()).tall(0).bold(0).line(t('Printer test')).center(0).rule();
  d.lr(t('Paper'), `${o.width} mm · ${d.W}`).lr(t('Characters'), o.charset === 'ascii' ? 'ASCII' : 'CP850');
  d.line('àâçéèêëîïôùûü ÀÇÉÈ ñÑ ¿¡ áíóú');
  d.line('0123456789'.repeat(5).slice(0, d.W)).rule().center(1).line(t('If the accents look wrong, choose "Without accents" in the printer settings.')).center(0);
  return d.end();
}

/* ---------- Bluetooth LE (Web Bluetooth) ---------- */
const BLE_SERVICES = ['000018f0-0000-1000-8000-00805f9b34fb', 'e7810a71-73ae-499d-8c15-faa9aef0c3f2', '49535343-fe7d-4ae5-8fa9-9fafd205e455', '0000ff00-0000-1000-8000-00805f9b34fb', '0000fee7-0000-1000-8000-00805f9b34fb', '0000ae30-0000-1000-8000-00805f9b34fb'];
const bleOk = () => !!(navigator.bluetooth && navigator.bluetooth.requestDevice);
async function bleConnect(ask) {
  if (!bleOk()) throw new Error(t('This browser cannot use Bluetooth. Use Chrome on Android, or the RawBT app.'));
  if (PRN.ch && PRN.dev?.gatt?.connected) return PRN.ch;
  let dev = PRN.dev;
  if (!dev && navigator.bluetooth.getDevices) { try { dev = (await navigator.bluetooth.getDevices()).find(x => x.id === prnCfg().bleId) || null; } catch { } }
  if (!dev) {
    if (!ask) throw new Error(t('Connect the printer first: Settings → Receipt printer'));
    dev = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: BLE_SERVICES });
  }
  const gatt = await dev.gatt.connect();
  let ch = null;
  for (const svc of await gatt.getPrimaryServices()) {
    for (const c of await svc.getCharacteristics()) if (c.properties.writeWithoutResponse || c.properties.write) { ch = c; break; }
    if (ch) break;
  }
  if (!ch) { gatt.disconnect(); throw new Error(t('This device does not accept printing. Is it a receipt printer?')); }
  PRN.dev = dev; PRN.ch = ch;
  dev.addEventListener('gattserverdisconnected', () => { PRN.ch = null; });
  S.settings.printer = { ...prnCfg(), bleId: dev.id, bleName: dev.name || t('Printer') }; commit();
  return ch;
}
async function bleWrite(ch, bytes) {
  for (let i = 0; i < bytes.length; i += 100) {
    const part = bytes.slice(i, i + 100);
    if (ch.properties.writeWithoutResponse && ch.writeValueWithoutResponse) await ch.writeValueWithoutResponse(part); else await ch.writeValue(part);
    await new Promise(r => setTimeout(r, 15));
  }
}
/* ---------- RawBT app (classic Bluetooth printers) ---------- */
const rawbtURL = bytes => `intent:base64,${bytesToB64(bytes)}#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;`;

/* ---------- Entry points ---------- */
async function sendToPrinter(bytes, ask) {
  const o = prnCfg();
  if (o.mode === 'rawbt') { location.href = rawbtURL(bytes); return true; }
  const ch = await bleConnect(ask); await bleWrite(ch, bytes); return true;
}
async function printReceipt(s, auto) {
  const o = prnCfg();
  if (o.mode === 'system') { if (!auto) printHTML(receiptHTML(s)); return; }
  try { await sendToPrinter(escReceipt(s, o), !auto); if (!auto) toast(t('Receipt sent to the printer'), 'ok'); }
  catch (e) { if (e.name === 'NotFoundError') return; console.warn(e); toast(t('Printing failed: {e}', { e: e.message }), 'bad'); }
}
function printerCard() {
  const o = prnCfg(), M = { system: t('Phone print dialog'), ble: t('Bluetooth printer'), rawbt: t('RawBT app') };
  return card(t('Receipt printer'), `<table class="kv"><tr><td>${t('Method')}</td><td>${M[o.mode]}</td></tr>${o.mode !== 'system' ? `<tr><td>${t('Paper')}</td><td>${o.width} mm</td></tr><tr><td>${t('Print after each sale')}</td><td>${o.auto ? pill(t('On'), 'green') : pill(t('Off'), 'gray')}</td></tr>` : ''}${o.mode === 'ble' ? `<tr><td>${t('Printer')}</td><td>${o.bleName ? esc(o.bleName) + (PRN.ch ? ' ' + pill(t('Connected'), 'green') : '') : '—'}</td></tr>` : ''}</table>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px">${btn(t('Change'), 'printerSetup', { cls: 'pri', icon: 'settings' })}${o.mode === 'ble' ? btn(o.bleName ? t('Reconnect') : t('Connect the printer'), 'printerConnect', { icon: 'refresh' }) : ''}${o.mode !== 'system' ? btn(t('Test print'), 'printerTest', { icon: 'printer' }) : ''}</div>`, { sub: t('Small Bluetooth receipt printers (58 or 80 mm)') });
}
function printerForm() {
  const o = prnCfg();
  openModal(t('Receipt printer'), `
    <p class="flabel">${t('How to print')}</p>
    ${choices('mode', [['system', t('Phone print dialog'), 'printer'], ['ble', t('Bluetooth printer'), 'zap'], ['rawbt', t('RawBT app'), 'smartphone']], o.mode)}
    ${note('info', 'pri', `<b>${t('Bluetooth printer')}:</b> ${t('printers that support Bluetooth LE, straight from Chrome on Android.')}<br><b>${t('RawBT app')}:</b> ${t('for most cheap Bluetooth printers. Install the free “RawBT” app from the Play Store and pair the printer in it once.')}`)}
    <p class="flabel">${t('Paper width')}</p>${choices('width', [['58', '58 mm', 'receipt'], ['80', '80 mm', 'receipt']], String(o.width))}
    <p class="flabel">${t('Letters')}</p>${choices('charset', [['cp850', t('With accents'), 'check'], ['ascii', t('Without accents'), 'x']], o.charset)}
    <label class="check"><input type="checkbox" name="auto" value="1" ${o.auto ? 'checked' : ''}><span>${t('Print after each sale')}<small>${t('Otherwise, tap Print on the receipt')}</small></span></label>`,
  f => { S.settings.printer = { ...o, mode: f.mode, width: +f.width, charset: f.charset, auto: !!f.auto }; audit('settings', t('Receipt printer') + ': ' + f.mode); commit(); toast(t('Saved'), 'ok'); },
  { icon: 'printer' });
}
const printAct = {
  printerSetup: () => printerForm(),
  printerConnect: async () => { PRN.dev = null; PRN.ch = null; try { await bleConnect(true); toast(t('Printer connected'), 'ok'); render(); } catch (e) { if (e.name !== 'NotFoundError') toast(t('Printing failed: {e}', { e: e.message }), 'bad'); } },
  printerTest: async () => { try { await sendToPrinter(escTest(), true); if (prnCfg().mode === 'ble') { toast(t('Receipt sent to the printer'), 'ok'); render(); } } catch (e) { if (e.name !== 'NotFoundError') toast(t('Printing failed: {e}', { e: e.message }), 'bad'); } }
};
