// End-to-end tests: the real app in headless Chrome, driven through the DevTools protocol (no dependencies).
// Run: node --test tests/e2e.test.mjs      Chrome path: CHROME=/path/to/chrome (auto-detected on macOS / Linux)
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find(p => fs.existsSync(p));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };

let server, chrome, ws, base, sid, tmp, msgId = 0;
const pending = new Map(), problems = [];
function cdp(method, params = {}, session = sid) {
  const id = ++msgId; ws.send(JSON.stringify({ id, method, params, sessionId: session }));
  return new Promise((res, rej) => pending.set(id, { res, rej }));
}
/* Run code inside the page (it sees the app's globals) and return a plain value. */
async function page(code, timeout = 30000) {
  const r = await Promise.race([
    cdp('Runtime.evaluate', { expression: `(async () => { ${code} })()`, awaitPromise: true, returnByValue: true }),
    sleep(timeout).then(() => { throw new Error('page code timed out: ' + code.slice(0, 80)); })
  ]);
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}
async function open(url) {
  await cdp('Page.navigate', { url: base + url });
  for (let i = 0; i < 100; i++) { await sleep(100); try { if (await page("return typeof S !== 'undefined' && !!document.querySelector('#view .ph, #view .card')")) return; } catch { } }
  throw new Error('app did not start: ' + url);
}
const PRESS = `const press = async (d, wait = 900) => { for (const k of d) { document.querySelector('#lock [data-k="' + k + '"]').click(); await new Promise(r => setTimeout(r, 30)); } await new Promise(r => setTimeout(r, wait)); };`;

describe('app in Chrome', { skip: !CHROME && 'Chrome not found (set CHROME=...)' }, () => {
  before(async () => {
    server = http.createServer((req, res) => {
      const p = path.normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
      const file = path.join(ROOT, p === '/' ? 'index.html' : p);
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); fs.createReadStream(file).pipe(res);
    }).listen(0, '127.0.0.1');
    await new Promise(r => server.on('listening', r));
    base = `http://127.0.0.1:${server.address().port}`;
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-chrome-'));
    chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${tmp}`, '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--window-size=1280,900', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
    const wsUrl = await new Promise((res, rej) => { let buf = ''; chrome.stderr.on('data', d => { buf += d; const m = buf.match(/ws:\/\/\S+/); if (m) res(m[0]); }); chrome.on('exit', c => rej(new Error('Chrome exited ' + c))); });
    ws = new WebSocket(wsUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    ws.onmessage = m => {
      const d = JSON.parse(m.data);
      if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(new Error(d.error.message)) : p.res(d.result); return; }
      if (d.method === 'Runtime.exceptionThrown') problems.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
      if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') problems.push(d.params.args.map(a => a.value ?? a.description).join(' '));
    };
    const { targetId } = await cdp('Target.createTarget', { url: 'about:blank' }, undefined);
    ({ sessionId: sid } = await cdp('Target.attachToTarget', { targetId, flatten: true }, undefined));
    await cdp('Runtime.enable'); await cdp('Page.enable');
  });
  after(async () => {
    try { ws?.close(); } catch { }
    chrome?.kill(); server?.close();
    await sleep(300); try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { }
  });

  test('opens in English with sample data, without errors', async () => {
    await open('/?demo');
    const r = await page(`return { lang: LANG, sales: S.sales.length, h1: document.querySelector('.ph h1').textContent, nav: document.querySelectorAll('#sidenav a').length }`);
    assert.equal(r.lang, 'en'); assert.equal(r.sales, 12); assert.equal(r.h1, 'Dashboard'); assert.equal(r.nav, 15);
    assert.deepEqual(problems, []);
  });

  for (const L of ['en', 'fr', 'es']) test(`every screen and dialog works in ${L}, with nothing untranslated`, async () => {
    const r = await page(`
      window.print = () => {};
      const bad = [], pid = S.products.find(p => !p.archived).id, cid = CR().find(c => c.kind === 'client').id, sid = S.sales.filter(s => !s.void).at(-1).id;
      changeLang('${L}'); TR_MISSING.clear();
      for (const r of Object.keys(ROUTES)) { location.hash = '#/' + r; await new Promise(x => setTimeout(x, 5)); render(); if (document.querySelector('#view').textContent.includes(t('Display error'))) bad.push(r); }
      for (const [k, v, r] of [['venteTab','recus','vente'],['caisseTab','out','caisse'],['credTab','paid','credits'],['factTab','paid','factures'],['persTab','soustraitant','personnel'],['rappTab','done','rappels'],['dashRange','12','dash']]) { const o = ui[k]; ui[k] = v; location.hash = '#/' + r; await new Promise(x => setTimeout(x, 5)); render(); ui[k] = o; }
      for (const kind of ['day', 'year']) { ui.rap = { kind, val: today().slice(0, PK[kind]) }; location.hash = '#/rapports'; await new Promise(x => setTimeout(x, 5)); render(); }
      ui.rap = { kind: 'month', val: today().slice(0, 7) };
      const dialogs = [() => txForm('in'), () => txOpen(TX()[0].id), () => exchangeForm(), () => cashCountForm(), () => creditForm('client'), () => creditOpen(cid), () => creditPay(cid), () => productForm(), () => productOpen(pid), () => restockForm(pid), () => adjustForm(pid), () => bottleMoveForm('ret'), () => personForm(), () => personOpen(S.people[0].id), () => payPersonForm(S.people[0].id), () => invoiceForm(), () => invoiceOpen(INV()[0].id), () => invoicePay(INV()[0].id), () => reminderForm(), () => showReceipt(S.sales.find(s => s.id === sid)), () => voidSale(sid), () => A.showAlerts(), () => printReport(), () => userForm('cashier'), () => cloudForm(), () => cloudRestoreForm()${'' /* printer dialogs added when present */}];
      if (typeof printerForm === 'function') dialogs.push(() => printerForm());
      dialogs.push(() => closingForm(), () => closingResult(closingCompute({ USD: '1', CDF: '' })));
      for (const d of dialogs) { try { d(); } catch (e) { bad.push('dialog: ' + e.message); } closeModal(true); }
      globalSearch('a'); document.querySelector('#sres').classList.remove('open');
      const missing = [...TR_MISSING]; changeLang('en'); location.hash = '#/dash';
      return { bad, missing };`);
    assert.deepEqual(r.bad, []); assert.deepEqual(r.missing, []); assert.deepEqual(problems, []);
  });

  test('a credit sale, then voiding it, puts stock, money and credit back', async () => {
    const r = await page(`
      const p = S.products.find(x => !x.archived), stock0 = p.stock, bal0 = balances().USD.total, credits0 = CR().length;
      cart.items = { [p.id]: 3 }; cart.cur = 'USD'; location.hash = '#/vente'; await new Promise(x => setTimeout(x, 20)); render();
      A.checkout(); const f = document.querySelector('#mform');
      f.querySelector('input[value=credit]').checked = true; f.client.value = 'Test Client'; f.requestSubmit();
      await new Promise(x => setTimeout(x, 200));
      const sale = S.sales.at(-1), afterSale = { stock: p.stock, credit: creditLeft(CR().at(-1)), credits: CR().length, receipt: !!document.querySelector('#modal .receipt') };
      closeModal(); voidSale(sale.id); document.querySelector('#mform').requestSubmit(); await new Promise(x => setTimeout(x, 200));
      return { stock0, bal0, credits0, total: sale.total, afterSale, after: { stock: p.stock, bal: balances().USD.total, credits: CR().length, voided: !!sale.void, log: S.audit.slice(-2).map(a => a.a) } };`);
    assert.equal(r.afterSale.stock, r.stock0 - 3);
    assert.equal(r.afterSale.credits, r.credits0 + 1);
    assert.equal(r.afterSale.credit, r.total);
    assert.ok(r.afterSale.receipt);
    assert.equal(r.after.stock, r.stock0);
    assert.equal(r.after.credits, r.credits0);
    assert.equal(r.after.bal, r.bal0);
    assert.ok(r.after.voided);
    assert.deepEqual(r.after.log, ['sale', 'void_sale']);
  });

  test('cashier: limited screens, discount needs the owner PIN, the log shows who approved', async () => {
    const r = await page(`${PRESS}
      S.users.push({ id: 'own', name: 'Marie', role: 'owner', ...(await makePin('1357')) }, { id: 'cash', name: 'Jean', role: 'cashier', ...(await makePin('2468')) });
      commit(); lockApp(); await new Promise(x => setTimeout(x, 50));
      const picker = [...document.querySelectorAll('#lock .atiles b')].map(b => b.textContent), authPage = document.querySelector('#lock').classList.contains('is-auth');
      [...document.querySelectorAll('#lock .atiles button')].find(b => b.textContent.includes('Jean')).click(); await new Promise(x => setTimeout(x, 30));
      await press('1111'); const wrong = document.querySelector('#lock p.err')?.textContent;
      await press('2468');
      const who = me()?.name;
      location.hash = '#/rapports'; await new Promise(x => setTimeout(x, 50)); const blocked = document.querySelector('.ph h1').textContent;
      location.hash = '#/produits'; await new Promise(x => setTimeout(x, 50)); const cols = [route(), document.querySelector('.ph h1').textContent];
      const p = S.products.find(x => !x.archived); cart.items = { [p.id]: 2 }; cart.cur = 'USD';
      A.checkout(); const f = document.querySelector('#mform'); f.discount.value = '0.5'; f.requestSubmit(); await new Promise(x => setTimeout(x, 100));
      const pad = document.querySelector('#lock .lk')?.innerText || '';
      await press('1357');
      const sale = S.sales.at(-1), log = S.audit.at(-1); closeModal();
      A.voidSale({ dataset: { id: sale.id } }); await new Promise(x => setTimeout(x, 50)); document.querySelector('#lock [data-k="x"]').click();
      const denied = S.audit.at(-1);
      return { picker, authPage, wrong, who, blocked, cols, pad, discount: sale.discount, log: { a: log.a, by: log.by, ap: log.ap }, denied: { a: denied.a, by: denied.by }, stillValid: !sale.void };`);
    assert.deepEqual(r.picker, ['Marie', 'Jean']);
    assert.ok(r.authPage, 'full sign-in page');
    assert.equal(r.wrong, 'Wrong code, try again');
    assert.equal(r.who, 'Jean');
    assert.equal(r.blocked, 'Hello Jean', 'reports → back to My shift');
    assert.deepEqual(r.cols, ['home', 'Hello Jean'], 'products are for the store manager');
    assert.match(r.pad, /Marie/); assert.match(r.pad, /Discount of \$0\.50/);
    assert.equal(r.discount, 0.5);
    assert.deepEqual(r.log, { a: 'sale', by: 'Jean', ap: 'Marie' });
    assert.deepEqual(r.denied, { a: 'denied', by: 'Jean' });
    assert.ok(r.stillValid);
    assert.deepEqual(problems, []);
  });
  test('IFB: the customer pays on the IFB page, the sale settles by itself', async () => {
    // the shop's server, with one shop and its IFB webhook
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-ifb-')), code = 'shop-code-e2e-0123456789', hook = 'hook0123456789abcdef', secret = 'whsec_e2e_secret';
    fs.writeFileSync(path.join(dir, 'shops.txt'), code + '  # E2E shop\n');
    fs.writeFileSync(path.join(dir, 'ifb.json'), JSON.stringify({ [hook]: { secret, folder: crypto.createHash('sha256').update(code).digest('hex').slice(0, 24), name: 'E2E shop' } }));
    const port = 20000 + Math.floor(Math.random() * 20000);
    const srv = spawn(process.execPath, [path.join(ROOT, 'server/backup-server.mjs')], { env: { ...process.env, PORT: port, DATA_DIR: path.join(dir, 'data'), BACKUP_TOKENS_FILE: path.join(dir, 'shops.txt'), IFB_FILE: path.join(dir, 'ifb.json') } });
    await new Promise((res, rej) => { srv.stdout.on('data', d => /server on/.test(d) && res()); srv.on('exit', c => rej(new Error('server exited ' + c))); });
    try {
      const sale = await page(`
        S.settings.ifb = { page: 'https://app.infinitefuturebank.org/p/e2e-shop', fee: 1.5 }; CLOUD.cfg = { url: 'http://127.0.0.1:${port}', token: '${code}' };
        const p = S.products.find(x => !x.archived); cart.items = { [p.id]: 2 }; cart.cur = 'USD'; location.hash = '#/vente'; await new Promise(x => setTimeout(x, 20)); render();
        A.checkout(); const f = document.querySelector('#mform');
        const choice = f.querySelector('input[name=method][value=ifb]'); choice.checked = true; f.requestSubmit();
        await new Promise(x => setTimeout(x, 300));
        const s = S.sales.at(-1), c = CR().find(x => x.saleId === s.id);
        return { no: s.no, total: s.total, method: s.method, paid: s.paid, pill: saleStatus(s), creditRef: c && c.ifb.ref, sheet: !!document.querySelector('#ifbState'), qr: !!document.querySelector('.ifb-qr svg path'), ref: document.querySelector('.ifb-ref')?.textContent, amount: document.querySelector('.ifb-facts b')?.textContent };`);
      assert.equal(sale.method, 'ifb'); assert.equal(sale.paid, 0); assert.match(sale.pill, /Waiting for IFB/);
      assert.ok(sale.sheet && sale.qr, 'pay sheet with QR code');
      assert.equal(sale.ref, sale.no); assert.equal(sale.creditRef, sale.no);
      // IFB confirms the payment: the customer typed the reference in lower case and paid the fee
      const cents = Math.round(sale.total * 100), body = JSON.stringify({ event: 'order.paid', order: { id: 'ifb-e2e-1', page_slug: 'e2e-shop', total_cents: cents + 30, currency: 'USD', customer_name: 'Amara', customer_email: 'a@example.com', answers: { order_reference: sale.no.toLowerCase() }, line_items: [{ label: 'Amount', total_cents: cents }, { label: 'Processing fee', total_cents: 30 }], paid_at: new Date().toISOString() } });
      const st = await fetch(`http://127.0.0.1:${port}/ifb/${hook}`, { method: 'POST', body, headers: { 'Content-Type': 'application/json', 'X-IFB-Signature': 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex') } }).then(r => r.status);
      assert.equal(st, 200);
      const after = await page(`
        await ifbSync(false); ifbWatchUpdate();
        const s = S.sales.find(x => x.no === '${sale.no}');
        return { paid: s.paid, pill: saleStatus(s), state: document.querySelector('#ifbState')?.innerText, tx: TX().filter(x => x.saleId === s.id && x.method === 'ifb').map(x => x.amount), fees: TX().filter(x => x.ifbId === 'ifb-e2e-1' && x.cat === 'fees').length, log: S.audit.at(-1) };`);
      assert.equal(after.paid, sale.total);
      assert.match(after.pill, /Paid/);
      assert.match(after.state, /Paid with IFB/);
      assert.deepEqual(after.tx, [sale.total]);
      assert.equal(after.fees, 0, 'the customer paid the fee');
      assert.equal(after.log.a, 'ifb_paid'); assert.equal(after.log.by, 'IFB');
      assert.deepEqual(problems, []);
    } finally { srv.kill(); }
  });
  test('every role: its home screen, its screens, nothing else; auditor changes nothing', async () => {
    await open('/');                                  // fresh page: no dialog history left by the tests above
    const r = await page(`
      const out = {}, sleep = ms => new Promise(x => setTimeout(x, ms));
      for (const [id, role] of [['r-mgr', 'manager'], ['r-stk', 'stock'], ['r-acc', 'accountant'], ['r-aud', 'auditor']]) if (!S.users.some(u => u.id === id)) S.users.push({ id, name: role, role, ...(await makePin('1111')) });
      $('#lock').hidden = true;
      for (const [id, role] of [['own', 'owner'], ['r-mgr', 'manager'], ['cash', 'cashier'], ['r-stk', 'stock'], ['r-acc', 'accountant'], ['r-aud', 'auditor']]) {
        SESSION.uid = id; const home = roleHome(); location.hash = '#/' + home; await sleep(30); render();
        const h1 = document.querySelector('.ph h1').textContent, seen = [], bad = [];
        for (const r of Object.keys(ROUTES)) { location.hash = '#/' + r; await sleep(5); render(); if (route() === r) seen.push(r); if (document.querySelector('#view').textContent.includes(t('Display error'))) bad.push(r); }
        const tabs = [...document.querySelectorAll('#bnav a')].map(a => a.getAttribute('href').slice(2));
        out[role] = { home, h1, seen, bad, tabs, newTxButtons: (location.hash = '#/caisse', await sleep(5), render(), document.querySelectorAll('[data-act="newTx"]').length) };
      }
      // auditor: a forced click is refused
      SESSION.uid = 'r-aud'; const n0 = S.tx.length, b = document.createElement('button'); b.dataset.act = 'newTx'; b.dataset.type = 'in'; document.body.appendChild(b); b.click(); b.remove(); await sleep(50);
      out.auditorForced = { opened: document.querySelector('#modal').classList.contains('open'), tx: S.tx.length - n0, toast: document.querySelector('#toast').innerText };
      // store manager adds a product without anyone's approval
      SESSION.uid = 'r-stk'; A.newProduct(); await sleep(50);
      out.stockNoPad = { modal: document.querySelector('#modal h3')?.textContent, pad: !document.querySelector('#lock').hidden };
      closeModal(true); SESSION.uid = 'own'; location.hash = '#/dash';
      return out;`);
    assert.equal(r.owner.home, 'dash'); assert.equal(r.manager.home, 'dash');
    for (const role of ['cashier', 'stock', 'accountant', 'auditor']) { assert.equal(r[role].home, 'home', role); assert.match(r[role].h1, /^Hello/, role); }
    for (const role of Object.keys(r).filter(k => r[k].bad)) assert.deepEqual(r[role].bad, [], role + ': screens render');
    assert.ok(!r.cashier.seen.includes('rapports') && r.cashier.seen.includes('vente'));
    assert.deepEqual(r.stock.seen.filter(x => x !== 'menu'), ['home', 'produits', 'emballages', 'rappels', 'scanner', 'aide']);
    assert.ok(r.accountant.seen.includes('factures') && !r.accountant.seen.includes('vente'));
    assert.ok(r.auditor.seen.includes('journal') && !r.auditor.seen.includes('params'));
    assert.ok(!r.manager.seen.includes('params') && r.manager.seen.includes('journal'));
    assert.equal(r.stock.tabs[2], 'produits', 'store manager: Products in the middle');
    assert.equal(r.auditor.newTxButtons, 0, 'auditor sees no Income / Expense buttons');
    assert.ok(r.owner.newTxButtons > 0);
    assert.deepEqual([r.auditorForced.opened, r.auditorForced.tx], [false, 0]); assert.match(r.auditorForced.toast, /role cannot/);
    assert.deepEqual(r.stockNoPad, { modal: 'New product', pad: false });
    assert.deepEqual(problems, []);
  });

  test('first launch: set up the shop and the owner PIN', async () => {
    const r = await page(`${PRESS}
      const keep = S; S = DEFAULT(); SESSION.uid = null;
      const need = needsSetup(); setupPage(); await new Promise(x => setTimeout(x, 30));
      const f = document.querySelector('#setupForm'); f.biz.value = 'Test Shop'; f.name.value = 'Aline'; f.requestSubmit(); await new Promise(x => setTimeout(x, 50));
      await press('2580', 100); await press('2580', 900);
      const res = { need, users: S.users.map(u => u.name + ':' + u.role), signedIn: me()?.name, biz: S.settings.biz, lockHidden: document.querySelector('#lock').hidden, setupDone: S.settings.setupDone, needAfter: needsSetup() };
      S = keep; SESSION.uid = 'own'; render(); return res;`);
    assert.deepEqual(r, { need: true, users: ['Aline:owner'], signedIn: 'Aline', biz: 'Test Shop', lockHidden: true, setupDone: true, needAfter: false });
    assert.deepEqual(problems, []);
  });
});
