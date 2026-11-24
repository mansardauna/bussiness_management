'use strict';
/* =====================================================================
   Ma Caisse — encrypted cloud backup.
   The phone locks everything (data + photos) with a password BEFORE sending:
   PBKDF2-SHA256 → AES-GCM 256. The server only stores files it cannot read.
   Protocol: PUT / GET {server}/backup with header "Authorization: Bearer <access code>".
   Reference server: server/backup-server.mjs. Settings live in IndexedDB 'kv/cloud',
   never inside the data or the backup files (they contain the access code and the key).
   ===================================================================== */

const CLOUD = { cfg: null, busy: false };
const KDF_BACKUP = 200000;
const cloudOn = () => !!(CLOUD.cfg && CLOUD.cfg.url && CLOUD.cfg.key);
const bytesToB64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
const b64ToBytes = s => { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
/* Fingerprint of the data: changes whenever something is recorded (every change is in the activity log). */
const dataSig = () => [S.audit.length, S.audit.at(-1)?.id, S.tx.length, S.sales.length, S.products.length, S.credits.length].join(':');
/* Most recent safe copy (file or cloud) — used by alerts and the sidebar card. */
const lastSafe = () => [S.settings.lastBackup, CLOUD.cfg?.last].filter(Boolean).sort().pop() || null;

async function passKey(pass, salt, iter = KDF_BACKUP) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: b64ToBytes(salt), iterations: iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}
async function gzip(u8, pack) {
  if (typeof CompressionStream === 'undefined') return null;
  const s = new Blob([u8]).stream().pipeThrough(pack ? new CompressionStream('gzip') : new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
async function sealBackup(obj, key, salt) {
  const raw = new TextEncoder().encode(JSON.stringify(obj)), packed = await gzip(raw, true);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, packed || raw));
  return { app: 'macaissepro-cloud', v: 1, when: nowISO(), kdf: { name: 'PBKDF2-SHA256', iter: KDF_BACKUP, salt }, enc: 'AES-GCM-256', iv: bytesToB64(iv), gz: !!packed, data: bytesToB64(ct) };
}
async function openBackup(env, pass) {
  if (!env || env.app !== 'macaissepro-cloud') throw new Error(t('This file is not a Ma Caisse backup'));
  const key = await passKey(pass, env.kdf.salt, env.kdf.iter);
  let pt;
  try { pt = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64ToBytes(env.iv) }, key, b64ToBytes(env.data))); }
  catch { throw new Error(t('Wrong backup password')); }
  if (env.gz) pt = await gzip(pt, false);
  return { obj: JSON.parse(new TextDecoder().decode(pt)), key, salt: env.kdf.salt };
}
async function api(cfg, method, body) {
  const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 90000);
  try {
    const r = await fetch(cfg.url.replace(/\/+$/, '') + '/backup', { method, cache: 'no-store', signal: ctl.signal, body,
      headers: { Authorization: 'Bearer ' + cfg.token, ...(body ? { 'Content-Type': 'application/json' } : {}) } });
    if (r.status === 401 || r.status === 403) throw new Error(t('The server refused the access code'));
    if (r.status === 404 && method === 'GET') throw new Error(t('No backup found on the server'));
    if (r.status === 413) throw new Error(t('The backup is too big for the server'));
    if (!r.ok) throw new Error(t('Server error {n}', { n: r.status }));
    return method === 'GET' ? r.json() : r;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error(t('The server did not answer'));
    if (e instanceof TypeError) throw new Error(t('Cannot reach the server (internet?)'));
    throw e;
  } finally { clearTimeout(tm); }
}

/* Send a backup. manual: show messages and log it. cfg: settings to use (when testing new ones). */
async function cloudBackup(manual, cfg = CLOUD.cfg) {
  if (!cfg || !cfg.key || CLOUD.busy) return false;
  if (!navigator.onLine) { if (manual) toast(t('No internet: the backup will be sent later'), 'bad'); return false; }
  CLOUD.busy = true; if (manual) toast(t('Sending the backup…'));
  try {
    const key = await crypto.subtle.importKey('raw', b64ToBytes(cfg.key), 'AES-GCM', false, ['encrypt']);
    const env = await sealBackup(await backupObj(), key, cfg.salt);
    await api(cfg, 'PUT', JSON.stringify(env));
    Object.assign(cfg, { last: nowISO(), sig: dataSig(), err: '', size: env.data.length });
    if (cfg === CLOUD.cfg) await DB.put('kv', 'cloud', cfg);
    if (manual) { audit('cloud_backup'); commit(); toast(t('Backup sent to the cloud'), 'ok'); }
    return true;
  } catch (e) {
    console.warn('cloud backup', e);
    cfg.err = e.message; cfg.errAt = nowISO();
    if (cfg === CLOUD.cfg) await DB.put('kv', 'cloud', cfg).catch(() => { });
    if (manual) toast(e.message, 'bad');
    return false;
  } finally { CLOUD.busy = false; renderShell(); }
}
/* Automatic sending: only when something changed, at most every 30 min (5 min when the app is closed). */
function cloudAuto(reason) {
  const c = CLOUD.cfg; if (!cloudOn() || !c.auto || !navigator.onLine || c.sig === dataSig()) return;
  const gap = reason === 'hidden' ? 5 : 30;
  if (c.last && Date.now() - new Date(c.last) < gap * 60000 && reason !== 'start') return;
  cloudBackup(false);
}
async function cloudInit() {
  try { CLOUD.cfg = await DB.get('kv', 'cloud'); } catch { CLOUD.cfg = null; }
  setTimeout(() => cloudAuto('start'), 8000);
  setInterval(() => cloudAuto('timer'), 5 * 60000);
  window.addEventListener('online', () => setTimeout(() => cloudAuto('online'), 3000));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') cloudAuto('hidden'); });
}

/* ---------- Screens ---------- */
function cloudCard() {
  const c = CLOUD.cfg;
  if (!cloudOn()) return card(t('Cloud backup'), `<p class="muted sm" style="margin:0 0 14px">${t('Sends an encrypted copy automatically when there is internet. If the phone is lost, stolen or broken, everything comes back on a new phone.')}</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap">${btn(t('Connect'), 'cloudSetup', { cls: 'pri', icon: 'shield' })}${btn(t('Restore from the cloud'), 'cloudRestore', { icon: 'download' })}</div>`, { sub: t('Off') });
  const host = (() => { try { return new URL(c.url).host; } catch { return c.url; } })();
  const late = c.sig !== dataSig();
  return card(t('Cloud backup'), `<table class="kv"><tr><td>${t('Server')}</td><td>${esc(host)}</td></tr><tr><td>${t('Last sent')}</td><td>${c.last ? fdate(c.last) : t('never')}</td></tr><tr><td>${t('Automatic')}</td><td>${c.auto ? pill(t('On'), 'green') : pill(t('Off'), 'gray')}</td></tr><tr><td>${t('Status')}</td><td>${c.err ? pill(t('Problem'), 'red') : late ? pill(t('Changes waiting'), 'amber') : pill(t('Up to date'), 'green')}</td></tr></table>
    ${c.err ? note('alert', 'red', `${t('Last try failed:')} ${esc(c.err)}`) : ''}
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px">${btn(t('Send now'), 'cloudNow', { cls: 'pri', icon: 'upload' })}${btn(c.auto ? t('Turn off automatic') : t('Turn on automatic'), 'cloudAutoToggle', { icon: 'refresh' })}${btn(t('Restore from the cloud'), 'cloudRestore', { icon: 'download' })}${btn(t('Disconnect'), 'cloudOff', { cls: 'danger', icon: 'x' })}</div>`, { sub: t('Encrypted on this phone') });
}
function cloudForm() {
  const c = CLOUD.cfg || {};
  openModal(t('Connect cloud backup'), `
    ${note('shield', 'pri', t('Your data is locked with a password <b>on this phone</b> before it is sent. The server only stores a file nobody can read without that password.'))}
    ${fld(t('Server address'), inp('url', c.url || (location.protocol === 'https:' ? location.origin : ''), 'type="url" inputmode="url" required placeholder="https://backup.example.com" autofocus'))}
    ${fld(t('Access code'), inp('token', c.token || '', 'required autocomplete="off" spellcheck="false"'), t('Given by whoever runs the backup server'))}
    <div class="row2">${fld(t('Backup password'), inp('pass', '', 'type="password" required autocomplete="new-password"'), t('At least 8 characters'))}${fld(t('Repeat the password'), inp('pass2', '', 'type="password" required autocomplete="new-password"'))}</div>
    ${note('alert', 'amber', t('<b>Write this password down and keep it somewhere safe.</b> Without it nobody can restore the backup, not even the server owner.'))}
    <label class="check"><input type="checkbox" name="auto" value="1" checked><span>${t('Send automatically')}<small>${t('When there is internet and something has changed')}</small></span></label>`,
  async f => {
    if (!hasSubtle()) { toast(t('Encryption needs the app to be opened over https'), 'bad'); return false; }
    if (f.pass.length < 8) { toast(t('The password needs at least 8 characters'), 'bad'); return false; }
    if (f.pass !== f.pass2) { toast(t('The two passwords are different'), 'bad'); return false; }
    const salt = bytesToB64(crypto.getRandomValues(new Uint8Array(16)));
    const key = await passKey(f.pass, salt);
    const cfg = { url: f.url.trim(), token: f.token.trim(), salt, key: bytesToB64(new Uint8Array(await crypto.subtle.exportKey('raw', key))), auto: !!f.auto, last: null, err: '' };
    if (!(await cloudBackup(true, cfg))) return false;          // first backup = connection test
    CLOUD.cfg = cfg; await DB.put('kv', 'cloud', cfg);
    audit('cloud_on', new URL(cfg.url).host); commit(); renderShell();
  }, { icon: 'shield', ok: t('Connect and send') });
}
function cloudRestoreForm() {
  const c = CLOUD.cfg || {};
  openModal(t('Restore from the cloud'), `
    ${note('info', 'pri', t('Use this on a new phone or after a problem. The data on this phone will be replaced by the last backup.'))}
    ${fld(t('Server address'), inp('url', c.url || (location.protocol === 'https:' ? location.origin : ''), 'type="url" inputmode="url" required placeholder="https://backup.example.com"'))}
    ${fld(t('Access code'), inp('token', c.token || '', 'required autocomplete="off" spellcheck="false"'))}
    ${fld(t('Backup password'), inp('pass', '', 'type="password" required autocomplete="current-password"' + (c.url ? ' autofocus' : '')))}`,
  async f => {
    if (!hasSubtle()) { toast(t('Encryption needs the app to be opened over https'), 'bad'); return false; }
    const cfg = { url: f.url.trim(), token: f.token.trim() };
    toast(t('Downloading…'));
    const env = await api(cfg, 'GET');
    const { obj, key, salt } = await openBackup(env, f.pass);
    if (obj.app !== 'macaissepro' || !obj.state) throw new Error(t('This file is not a Ma Caisse backup'));
    confirmBox(t('Replace all current data with the backup from <b>{d}</b>?', { d: fdate(env.when) }), async () => {
      await applyRestore(obj, 'cloud');
      CLOUD.cfg = { ...cfg, salt, key: bytesToB64(new Uint8Array(await crypto.subtle.exportKey('raw', key))), auto: true, last: env.when, sig: dataSig(), err: '' };
      await DB.put('kv', 'cloud', CLOUD.cfg);
    }, t('Restore'), 'pri', 'download');
    return false;
  }, { icon: 'download', ok: t('Find the backup') });
}
const cloudAct = {
  cloudSetup: () => needOwner(t('Connect cloud backup'), cloudForm),
  cloudRestore: () => needOwner(t('Restore from the cloud'), cloudRestoreForm),
  cloudNow: () => cloudBackup(true).then(() => render()),
  cloudAutoToggle: async () => { CLOUD.cfg.auto = !CLOUD.cfg.auto; await DB.put('kv', 'cloud', CLOUD.cfg); render(); },
  cloudOff: () => needOwner(t('Disconnect cloud backup'), () => confirmBox(t('Stop sending backups to the cloud? Backups already on the server are not deleted.'), async () => { CLOUD.cfg = null; await DB.del('kv', 'cloud'); audit('cloud_off'); commit(); }, t('Disconnect')))
};
