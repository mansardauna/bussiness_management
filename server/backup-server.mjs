// Ma Caisse — minimal backup server. Node 18+, no dependencies.
// It only stores files the phones have already encrypted: it cannot read the shops' data.
// Keeps the last KEEP versions for each access code (one secret code per shop).
//
// Access codes come from BACKUP_TOKENS="code1,code2" and/or BACKUP_TOKENS_FILE (one code per line,
// "# comment" allowed). The file is re-read when it changes, so adding a shop needs no restart.
//
//   BACKUP_TOKENS_FILE=./shops.txt PORT=8787 DATA_DIR=./backup-data node server/backup-server.mjs
//
// Put it behind HTTPS (see deploy/): the app on the phone runs on https and browsers refuse
// to call a plain http server from it.
import http from 'node:http';
import fs from 'node:fs/promises';
import { statSync, readFileSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const PORT = +process.env.PORT || 8787;
const HOST = process.env.HOST || '127.0.0.1';             // behind Caddy: only reachable from the VPS itself
const DIR = process.env.DATA_DIR || './backup-data';
const KEEP = +process.env.KEEP || 30;
const MAX = (+process.env.MAX_MB || 80) * 1024 * 1024;
const ORIGIN = process.env.ALLOW_ORIGIN || '*';          // set to your app's address, e.g. https://macaisse.example.com
const FILE = process.env.BACKUP_TOKENS_FILE || '';

const sha = s => crypto.createHash('sha256').update(s).digest();
const parse = txt => txt.split(/[\n,]/).map(l => l.replace(/#.*/, '').trim()).filter(Boolean);
const ENV_CODES = parse(process.env.BACKUP_TOKENS || '');
let HASHES = [], mtime = -1;
function loadCodes() {
  let fileCodes = [];
  if (FILE) {
    let st = null; try { st = statSync(FILE); } catch { }
    const m = st ? st.mtimeMs : 0;
    if (m === mtime) return HASHES;
    mtime = m; if (st) fileCodes = parse(readFileSync(FILE, 'utf8'));
  } else if (HASHES.length) return HASHES;
  const codes = [...ENV_CODES, ...fileCodes], weak = codes.filter(x => x.length < 16);
  if (weak.length) console.error(`Ignoring ${weak.length} access code(s) shorter than 16 characters.`);
  HASHES = codes.filter(x => x.length >= 16).map(sha);
  console.log(new Date().toISOString(), `${HASHES.length} shop access code(s) loaded`);
  return HASHES;
}
if (!loadCodes().length && !FILE) {
  console.error('Set BACKUP_TOKENS="code1,code2" or BACKUP_TOKENS_FILE — one secret access code per shop, at least 16 characters.');
  console.error('Example code: ' + crypto.randomBytes(18).toString('base64url'));
  process.exit(1);
}
const known = tok => { const h = sha(tok); return loadCodes().some(x => crypto.timingSafeEqual(x, h)); };

/* ---------- IFB (Infinite Future Bank) payments ----------
   Each shop's IFB Payment Page sends a signed order.paid webhook to /ifb/<hook id>.
   IFB_FILE (JSON, re-read when it changes) maps hook id → { secret, folder, name }:
   the webhook secret stays on this server (never on the phones), folder = the shop's data folder.
   Only what the shop needs is kept: no customer e-mail, no form answers except the reference. */
const IFB_FILE = process.env.IFB_FILE || '';
const IFB_KEEP_DAYS = +process.env.IFB_KEEP_DAYS || 90;
let IFB = {}, ifbMtime = -1;
function loadIfb() {
  if (!IFB_FILE) return IFB;
  let st = null; try { st = statSync(IFB_FILE); } catch { }
  const m = st ? st.mtimeMs : 0; if (m === ifbMtime) return IFB;
  ifbMtime = m;
  try { IFB = st && st.size ? JSON.parse(readFileSync(IFB_FILE, 'utf8')) : {}; } catch { console.error('IFB_FILE is not valid JSON: IFB webhooks are refused until it is fixed'); IFB = {}; }
  return IFB;
}
async function readBody(req, max) {
  const chunks = []; let size = 0;
  for await (const c of req) { size += c.length; if (size > max) { const e = new Error('too big'); e.code = 413; throw e; } chunks.push(c); }
  return Buffer.concat(chunks);
}
const ifbRecord = o => {
  const items = Array.isArray(o.line_items) ? o.line_items : [];
  const fee = items.filter(l => /processing fee/i.test(String(l?.label || ''))).reduce((a, l) => a + (Math.round(+l.total_cents) || 0), 0);
  return {
    id: String(o.id).slice(0, 64), page: String(o.page_slug || '').slice(0, 80),
    total_cents: Math.round(+o.total_cents) || 0, fee_cents: fee, currency: String(o.currency || 'USD').slice(0, 3),
    name: String(o.customer_name || '').slice(0, 80), ref: String(o.answers?.order_reference ?? '').trim().slice(0, 40),
    paid_at: String(o.paid_at || '').slice(0, 40), received_at: new Date().toISOString()
  };
};
async function ifbPrune(dir) {
  const old = Date.now() - IFB_KEEP_DAYS * 864e5;
  for (const f of await fs.readdir(dir).catch(() => [])) { const p = path.join(dir, f); const st = await fs.stat(p).catch(() => null); if (st && st.mtimeMs < old) await fs.unlink(p).catch(() => { }); }
}
async function ifbWebhook(req, res, hookId) {
  const hook = loadIfb()[hookId];
  if (!hook || !hook.secret || !/^[0-9a-f]{24}$/.test(hook.folder || '')) return send(res, 404, 'unknown');
  let body; try { body = await readBody(req, 256 * 1024); } catch { return send(res, 413, 'too big'); }
  const given = String(req.headers['x-ifb-signature'] || '');
  const expected = 'sha256=' + crypto.createHmac('sha256', hook.secret).update(body).digest('hex');
  if (given.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected))) return send(res, 401, 'bad signature');
  let ev; try { ev = JSON.parse(body); } catch { return send(res, 400, 'not json'); }
  if (ev?.event !== 'order.paid' || !ev.order?.id) return send(res, 200, 'ignored');
  const rec = ifbRecord(ev.order), dir = path.join(DIR, hook.folder, 'ifb');
  await fs.mkdir(dir, { recursive: true });
  try { await fs.writeFile(path.join(dir, rec.id.replace(/[^A-Za-z0-9_-]/g, '_') + '.json'), JSON.stringify(rec), { flag: 'wx' }); }
  catch (e) { if (e.code !== 'EEXIST') throw e; }                 // same order twice: keep the first
  send(res, 200, 'ok');
  console.log(new Date().toISOString(), 'ifb payment', hook.name || hookId.slice(0, 6), rec.total_cents / 100, rec.currency);
  ifbPrune(dir).catch(() => { });
}
async function ifbList(res, tok, since) {
  const dir = path.join(folder(tok), 'ifb'), out = [];
  for (const f of (await fs.readdir(dir).catch(() => [])).filter(f => f.endsWith('.json'))) {
    try { const r = JSON.parse(await fs.readFile(path.join(dir, f), 'utf8')); if (!since || r.received_at >= since) out.push(r); } catch { }
  }
  out.sort((a, b) => a.received_at.localeCompare(b.received_at));
  return send(res, 200, JSON.stringify({ payments: out.slice(-500) }), 'application/json');
}
const folder = tok => path.join(DIR, sha(tok).toString('hex').slice(0, 24));
const versions = async dir => (await fs.readdir(dir).catch(() => [])).filter(f => f.endsWith('.json')).sort();
const send = (res, code, body = '', type = 'text/plain') => { res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' }); res.end(body); };

http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', ORIGIN);
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') return send(res, 204);
  const { pathname } = new URL(req.url, 'http://local');
  if (pathname === '/health') return send(res, 200, 'ok');
  const hook = pathname.match(/^\/ifb\/([A-Za-z0-9_-]{16,64})$/);
  if (hook && req.method === 'POST') { try { return await ifbWebhook(req, res, hook[1]); } catch (e) { console.error(e); return send(res, 500, 'server error'); } }
  if (pathname !== '/backup' && pathname !== '/ifb/payments') return send(res, 404, 'not found');

  const tok = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!tok || !known(tok)) { await new Promise(r => setTimeout(r, 400)); return send(res, 401, 'unknown access code'); }
  const dir = folder(tok);
  try {
    if (pathname === '/ifb/payments') {
      if (req.method !== 'GET') return send(res, 405, 'method not allowed');
      return await ifbList(res, tok, new URL(req.url, 'http://local').searchParams.get('since') || '');
    }
    if (req.method === 'GET') {
      const v = await versions(dir);
      if (!v.length) return send(res, 404, 'no backup yet');
      return send(res, 200, await fs.readFile(path.join(dir, v.at(-1))), 'application/json');
    }
    if (req.method === 'PUT') {
      const chunks = []; let size = 0;
      for await (const c of req) { size += c.length; if (size > MAX) { send(res, 413, 'too big'); req.destroy(); return; } chunks.push(c); }
      const body = Buffer.concat(chunks);
      let j; try { j = JSON.parse(body); } catch { return send(res, 400, 'not json'); }
      if (j.app !== 'macaissepro-cloud' || !j.iv || !j.data) return send(res, 400, 'not an encrypted Ma Caisse backup');
      await fs.mkdir(dir, { recursive: true });
      const name = new Date().toISOString().replace(/[:.]/g, '-') + '.json', file = path.join(dir, name);
      await fs.writeFile(file + '.tmp', body); await fs.rename(file + '.tmp', file);
      const v = await versions(dir);
      for (const old of v.slice(0, -KEEP)) await fs.unlink(path.join(dir, old));
      console.log(new Date().toISOString(), 'backup', path.basename(dir), Math.round(size / 1024) + ' KB');
      return send(res, 200, JSON.stringify({ ok: true, versions: Math.min(v.length, KEEP) }), 'application/json');
    }
    send(res, 405, 'method not allowed');
  } catch (e) { console.error(e); send(res, 500, 'server error'); }
}).listen(PORT, HOST, () => console.log(`Ma Caisse backup server on ${HOST}:${PORT}, keeping ${KEEP} versions in ${DIR}`));
