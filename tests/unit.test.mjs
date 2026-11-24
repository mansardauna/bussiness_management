// Unit tests: money logic, languages, roles & PINs, migration, encryption, translations, backup server.
// Run: node --test tests/      (Node 20+, no dependencies)
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

/* Load the browser scripts into a sandbox with a tiny fake DOM. */
function loadApp() {
  const noop = () => { };
  const store = new Map();
  const node = () => ({ addEventListener: noop, setAttribute: noop, querySelector: () => null, classList: { add: noop, remove: noop, contains: () => false, toggle: noop }, style: {}, dataset: {} });
  const ctx = {
    console, crypto: globalThis.crypto, TextEncoder, TextDecoder, Blob, Response, CompressionStream, DecompressionStream, btoa, atob, URL,
    setTimeout, clearTimeout, setInterval: () => 0, innerWidth: 1200, navigator: { onLine: true },
    localStorage: { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k), key: noop, get length() { return store.size; } },
    document: { documentElement: { lang: '' }, addEventListener: noop, querySelector: () => node(),   // toasts write into a dummy element
    querySelectorAll: () => [], createElement: node, visibilityState: 'visible' }
  };
  ctx.window = ctx; ctx.addEventListener = noop;
  vm.createContext(ctx);
  for (const f of ['i18n.js', 'core.js', 'notify-core.js', 'qr.js', 'security.js', 'cloud.js', 'print.js', 'ifb.js', 'auto.js', 'roles.js']) vm.runInContext(read(f), ctx, { filename: f });
  const ev = code => vm.runInContext(code, ctx);
  ev.json = code => JSON.parse(ev(`JSON.stringify(${code})`));   // plain values (arrays from the sandbox are another realm)
  return ev;
}

describe('languages', () => {
  const ev = loadApp();
  test('plurals follow each language', () => {
    ev("setLang('en')");
    assert.equal(ev("t('{n} sale|{n} sales', { n: 1 })"), '1 sale');
    assert.equal(ev("t('{n} sale|{n} sales', { n: 0 })"), '0 sales');
    ev("setLang('fr')");
    assert.equal(ev("t('{n} sale|{n} sales', { n: 0 })"), '0 vente');      // French: 0 and 1 are singular
    assert.equal(ev("t('{n} sale|{n} sales', { n: 2 })"), '2 ventes');
    ev("setLang('es')");
    assert.equal(ev("t('{n} sale|{n} sales', { n: 0 })"), '0 ventas');
    assert.equal(ev("t('Receipt {no}', { no: 'R-1' })"), 'Recibo R-1');
  });
  test('unknown language falls back to English, unknown text stays as is', () => {
    ev("setLang('xx')"); assert.equal(ev('LANG'), 'en');
    ev("setLang('fr')"); assert.equal(ev("t('Some new text')"), 'Some new text');
    assert.ok(ev("TR_MISSING.has('Some new text')"));
  });
  test('numbers and money are formatted per language', () => {
    ev("setLang('en')");
    assert.equal(ev("fmt(1234.5, 'USD')"), '$1,234.50');
    assert.equal(ev("fmt(2850, 'CDF')"), '2,850 FC');
    ev("setLang('fr')");
    assert.match(ev("fmt(1234.5, 'USD')"), /^\$1\s234,50$/);
    assert.equal(ev("num('1 234,5')"), 1234.5);
    assert.equal(ev("rnd(1234.4, 'CDF')"), 1234);
  });
  test('every text in the code has a French and a Spanish translation with the same {variables}', () => {
    const TR = ev('TR'), keys = new Set();
    for (const f of ['core.js', 'app.js', 'security.js', 'cloud.js', 'print.js', 'ifb.js', 'auto.js', 'notify-core.js', 'sw.js', 'roles.js'].filter(f => fs.existsSync(path.join(ROOT, f))))
      for (const m of read(f).matchAll(/\bt{1,2}\('((?:[^'\\]|\\.)*)'/g)) keys.add(m[1]);   // t('…') and tt('…') (service worker)
    // texts kept in tables and translated with t(variable)
    const tables = { 'core.js': ['const CATS = {', 'const REASONS', 'const METHODS'], 'app.js': ['const NAV = [', 'const DESC', 'const STRATEGY', 'const HELP'], 'security.js': ['const ROLE_DEFS = {', 'const ACTIONS = {'] };
    keys.add('Phone print dialog'); keys.add('Bluetooth printer'); keys.add('RawBT app');
    for (const [f, starts] of Object.entries(tables)) {
      const src = read(f);
      for (const s of starts) { const i = src.indexOf(s); assert.ok(i >= 0, s); const block = src.slice(i, src.indexOf('\n}', i) > 0 ? Math.min(...['};', '];'].map(e => src.indexOf(e, i)).filter(x => x > 0)) : undefined); for (const m of block.matchAll(/'((?:[^'\\]|\\.)*)'/g)) if (/[A-Z ]/.test(m[1])) keys.add(m[1]); }
    }
    const vars = s => [...s.split('|')[0].matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join();
    const problems = [];
    for (const k of keys) {
      const e = TR[k];
      if (!e || !e[0] || !e[1]) { problems.push('missing: ' + k); continue; }
      for (const v of e) { if (vars(v) !== vars(k)) problems.push(`{vars} differ: ${k} → ${v}`); if (k.includes('|') !== v.includes('|')) problems.push(`plural: ${k} → ${v}`); }
    }
    assert.deepEqual(problems, []);
  });
});

describe('money', () => {
  const ev = loadApp();
  before(() => {
    ev("setLang('en')");
    const m = new Date().toISOString().slice(0, 7), d = m + '-02T10:00';
    const tx = (o) => ({ id: Math.random().toString(36).slice(2), date: d, rate: 2000, method: 'cash', ...o });
    const state = {
      v: 2, settings: { rate: 2000, mainCur: 'USD' },
      products: [{ id: 'p1', name: 'Beer', price: 2, cost: 1, cur: 'USD', stock: 100 }],
      sales: [
        { id: 's1', no: 'R-1', date: d, cur: 'USD', rate: 2000, sub: 20, total: 20, paid: 20, method: 'cash', items: [{ pid: 'p1', name: 'Beer', qty: 10, price: 2, cost: 1, costCur: 'USD' }] },
        { id: 's2', no: 'R-2', date: d, cur: 'USD', rate: 2000, sub: 10, total: 10, paid: 10, method: 'cash', void: { at: d }, items: [{ pid: 'p1', name: 'Beer', qty: 5, price: 2, cost: 1, costCur: 'USD' }] }
      ],
      tx: [
        tx({ type: 'in', amount: 20, cur: 'USD', cat: 'sales', saleId: 's1' }),
        tx({ type: 'in', amount: 10, cur: 'USD', cat: 'sales', saleId: 's2', void: { at: d } }),
        tx({ type: 'out', amount: 3, cur: 'USD', cat: 'rent' }),
        tx({ type: 'out', amount: 50, cur: 'USD', cat: 'purchase' }),
        tx({ type: 'out', amount: 10, cur: 'USD', cat: 'fx' }),
        tx({ type: 'in', amount: 20000, cur: 'CDF', cat: 'fx' }),
        tx({ type: 'out', amount: 100, cur: 'USD', cat: 'rent', void: { at: d } })
      ],
      stockLog: [{ date: d, pid: 'p1', delta: -2, reason: 'broken', cost: 1, cur: 'USD', rate: 2000 }, { date: d, pid: 'p1', delta: -10, reason: 'sale', cost: 1, cur: 'USD', rate: 2000 }],
      invoices: [{ id: 'f1', date: d, cur: 'USD', rate: 2000, tax: 10, items: [{ qty: 1, price: 10 }], payments: [] }, { id: 'f2', date: d, cur: 'USD', rate: 2000, tax: 0, items: [{ qty: 1, price: 999 }], payments: [], void: { at: d } }],
      credits: [{ id: 'c1', kind: 'client', amount: 10, cur: 'USD', payments: [{ amount: 4 }] }, { id: 'c2', kind: 'client', amount: 50, cur: 'USD', payments: [], void: { at: d } }]
    };
    ev(`S = migrate(${JSON.stringify(state)}); globalThis.__m = '${m}';`);
  });
  test('profit = revenue − cost of goods − expenses − stock losses, voided items ignored', () => {
    const r = ev('stats(__m, "USD")');
    assert.equal(r.revenue, 31);   // sale 20 + invoice 10 + 10 % tax
    assert.equal(r.cogs, 10);
    assert.equal(r.charges, 3);    // rent only: purchases, exchange and voided rent are not expenses
    assert.equal(r.losses, 2);     // breakage, not the sale itself
    assert.equal(r.profit, 16);
    assert.equal(r.count, 1);
    assert.equal(Math.round(r.in * 100) / 100, 30);   // 20 sales + 20 000 FC exchange = $10
  });
  test('balances per currency ignore voided transactions', () => {
    const b = ev('balances()');
    assert.equal(b.USD.total, -43);
    assert.equal(b.CDF.total, 20000);
  });
  test('credits, invoices and conversions', () => {
    assert.equal(ev("creditLeft(S.credits[0])"), 6);
    assert.equal(ev('CR().length'), 1);
    assert.equal(ev("invTotal(S.invoices[0])"), 11);
    assert.equal(ev("conv(10, 'USD', 'CDF', 2000)"), 20000);
    assert.equal(ev("conv(5000, 'CDF', 'USD', 2000)"), 2.5);
  });
});

describe('version 1 data', () => {
  const ev = loadApp();
  test('French labels become ids, the single PIN becomes the owner account', async () => {
    const legacy = { settings: { biz: 'Mon Commerce', footer: 'Merci pour votre confiance !', rate: 2800 }, tx: [{ cat: 'Ventes' }, { cat: 'Électricité / eau' }], credits: [{ cat: 'Achat marchandises', payments: [] }], stockLog: [{ reason: 'achat – Brasserie' }, { reason: 'casse' }], bottles: [{ client: 'Client comptant' }] };
    ev(`S = migrateUsers(migrate(${JSON.stringify(legacy)})); S.settings.pin = ''`);
    ev(`S.settings.pin = hashPin('1234'); S.users = []; migrateUsers(S)`);
    assert.equal(ev('S.settings.lang'), 'fr');
    assert.equal(ev('S.settings.biz'), '');
    assert.deepEqual(ev.json('S.tx.map(x => x.cat)'), ['sales', 'utilities']);
    assert.equal(ev('S.credits[0].cat'), 'purchase');
    assert.deepEqual(ev.json("S.stockLog.map(l => l.reason + ':' + (l.who || ''))"), ['purchase:Brasserie', 'broken:']);
    assert.equal(ev('S.bottles[0].client'), '');
    assert.equal(ev('S.users.length'), 1);
    assert.equal(await ev("verifyPin('0000', S.users[0])"), false);
    assert.equal(await ev("verifyPin('1234', S.users[0])"), true);
    assert.equal(ev('S.users[0].kdf'), 'pbkdf2');       // upgraded on first use
    assert.equal(await ev("verifyPin('1234', S.users[0])"), true);
  });
});

describe('team & control', () => {
  const ev = loadApp();
  before(async () => {
    ev('S = DEFAULT()');
    await ev(`(async () => { S.users.push({ id: 'o', name: 'Marie', role: 'owner', ...(await makePin('1357')) }, { id: 'c', name: 'Jean', role: 'cashier', ...(await makePin('2468')) }); })()`);
  });
  test('no account means one owner, no lock', () => {
    assert.equal(loadApp()('S = DEFAULT(); isOwner()'), true);
  });
  test('each role sees its own screens', () => {
    const add = (id, role) => ev(`S.users.push({ id: '${id}', name: '${id}', role: '${role}', hash: 'x', salt: 'x', kdf: 'pbkdf2' })`);
    for (const [id, r] of [['m', 'manager'], ['k', 'stock'], ['a', 'accountant'], ['u', 'auditor']]) add(id, r);
    const sees = (id, routes) => { ev(`SESSION.uid = '${id}'`); return routes.filter(r => ev(`canSee('${r}')`)); };
    const ALL = ['home', 'dash', 'vente', 'caisse', 'credits', 'produits', 'emballages', 'personnel', 'factures', 'rappels', 'rapports', 'analyse', 'scanner', 'journal', 'params'];
    assert.deepEqual(sees('o', ALL), ALL.filter(r => r !== 'home'));                                   // owner: everything
    assert.deepEqual(sees('m', ALL), ALL.filter(r => r !== 'home' && r !== 'params'));                // manager: no settings
    assert.deepEqual(sees('c', ALL), ['home', 'vente', 'caisse', 'credits', 'emballages', 'rappels', 'scanner']);
    assert.deepEqual(sees('k', ALL), ['home', 'produits', 'emballages', 'rappels', 'scanner']);
    assert.deepEqual(sees('a', ALL), ['home', 'caisse', 'credits', 'personnel', 'factures', 'rappels', 'rapports', 'analyse', 'scanner']);
    assert.deepEqual(sees('u', ALL), ALL.filter(r => !['scanner', 'params'].includes(r)));
    ev('SESSION.uid = null');
    assert.deepEqual(sees('nobody', ALL), [], 'signed out sees nothing');
  });
  test('each role can only do its job', () => {
    const acts = ['checkout', 'voidSale', 'newTx', 'txEdit', 'newProduct', 'restock', 'adjust', 'newInvoice', 'payPerson', 'exportCSV', 'jUser', 'userAdd', 'closeDay'];
    const may = id => { ev(`SESSION.uid = '${id}'`); return acts.filter(a => ev(`allowedAct('${a}')`)); };
    assert.deepEqual(may('o'), acts);
    assert.deepEqual(may('m'), acts.filter(a => a !== 'userAdd'));
    assert.deepEqual(may('c'), ['checkout', 'voidSale', 'newTx', 'txEdit', 'closeDay']);
    assert.deepEqual(may('k'), ['newProduct', 'restock', 'adjust']);
    assert.deepEqual(may('a'), ['newTx', 'txEdit', 'newInvoice', 'payPerson', 'exportCSV', 'closeDay']);
    assert.deepEqual(may('u'), ['exportCSV', 'jUser'], 'auditor: read only');
    ev("SESSION.uid = 'u'");
    assert.equal(ev("btn('New', 'newTx')"), '', 'buttons a role cannot use are not drawn');
    assert.notEqual(ev("btn('Log', 'jUser')"), '');
    ev("SESSION.uid = 'c'"); assert.equal(ev("can('approve')"), false);
    ev("SESSION.uid = 'm'"); assert.equal(ev("can('approve')"), true);
    assert.deepEqual(ev.json('approvers().map(u => u.role).sort()'), ['manager', 'owner']);
    ev("SESSION.uid = 'o'");
  });
  test('demo accounts: one per role, PINs work, sales get a seller', async () => {
    const keep = ev('JSON.stringify({ u: S.users, s: S.sales, a: S.audit })');
    ev("S.users = []; SESSION.uid = null; S.sales = [{ id: 'x1', items: [] }, { id: 'x2', items: [] }]; lockApp = () => {}");
    await ev('addDemoTeam()');
    assert.deepEqual(ev.json('[...new Set(S.users.map(u => u.role))]'), ['owner', 'manager', 'cashier', 'stock', 'accountant', 'auditor']);
    assert.equal(await ev("verifyPin('3333', S.users.find(u => u.name === 'Jean'))"), true);
    assert.equal(await ev("verifyPin('1111', S.users.find(u => u.name === 'Jean'))"), false);
    assert.equal(ev("S.sales.every(s => s.by && S.users.find(u => u.id === s.by).role === 'cashier')"), true);
    const n = ev('S.users.length'); await ev('addDemoTeam()'); assert.equal(ev('S.users.length'), n, 'never added twice');
    ev(`(() => { const k = ${JSON.stringify(keep)}; const o = JSON.parse(k); S.users = o.u; S.sales = o.s; S.audit = o.a; SESSION.uid = 'o'; })()`);
  });
  test('PINs are hashed and checked', async () => {
    assert.equal(await ev("verifyPin('1357', S.users[0])"), true);
    assert.equal(await ev("verifyPin('2468', S.users[0])"), false);
    assert.ok(!ev('JSON.stringify(S.users)').includes('1357'));
  });
  test('the activity log records who approved, once', () => {
    ev("SESSION.uid = 'c'; ui.approval = 'Marie'; audit('tx_void', 'x'); audit('sale', 'y')");
    const [a, b] = ev('S.audit.slice(-2)');
    assert.equal(a.by, 'Jean'); assert.equal(a.ap, 'Marie');
    assert.equal(b.ap, undefined);
  });
});

describe('receipt printer (ESC/POS)', () => {
  const ev = loadApp();
  const sale = { no: 'R-00012', date: '2026-11-19T10:30', client: 'Maman Odile', cur: 'USD', sub: 26.4, discount: 1, total: 25.4, paid: 20, change: 0, method: 'cash',
    items: [{ name: 'Bière 72cl casier de douze bouteilles consignées', qty: 12, price: 2.2, bottle: true, back: 10 }] };
  before(() => ev(`S = DEFAULT(); S.settings.biz = 'Dépôt La Grâce'; setLang('fr')`));
  for (const [width, W] of [[58, 32], [80, 48]]) test(`${width} mm: every line fits ${W} characters`, () => {
    const lines = ev.json(`escReceipt(${JSON.stringify(sale)}, { width: ${width}, charset: 'cp850' }).lines`);
    assert.ok(lines.length > 10);
    for (const l of lines) assert.ok(l.length <= W, `too long (${l.length}): ${l}`);
    assert.ok(lines.some(l => l.startsWith('TOTAL') && l.endsWith('$25,40')), 'total aligned right');
    assert.ok(lines.some(l => /RESTE À PAYER\s+\$5,40$/.test(l)), 'balance due');
  });
  test('starts with printer reset + code page, ends with feed and cut', () => {
    const b = ev.json(`[...escReceipt(${JSON.stringify(sale)}, { width: 58, charset: 'cp850' })]`);
    assert.deepEqual(b.slice(0, 5), [0x1B, 0x40, 0x1B, 0x74, 2]);
    assert.deepEqual(b.slice(-7), [0x1B, 0x64, 4, 0x1D, 0x56, 0x42, 0x00]);
    assert.ok(b.includes(0x82) && b.includes(0x85), 'é and à in code page 850');
    assert.ok(b.every(x => x <= 0xFF));
  });
  test('"without accents" sends plain ASCII letters', () => {
    const b = ev.json(`[...escReceipt(${JSON.stringify(sale)}, { width: 58, charset: 'ascii' })]`);
    const text = b.slice(5, -7).filter(x => x >= 0x20 && x !== 0x1B);
    assert.ok(text.every(x => x < 0x80), 'only ASCII');
    assert.ok(ev.json(`escReceipt(${JSON.stringify(sale)}, { width: 58, charset: 'ascii' }).lines`).some(l => l.includes('Depot La Grace')));
  });
  test('RawBT link carries the bytes', () => {
    const url = ev(`rawbtURL(new Uint8Array([0x1B, 0x40, 0x41]))`);
    assert.equal(url, 'intent:base64,G0BB#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;');
  });
});

describe('IFB payments (Infinite Future Bank)', () => {
  const ev = loadApp();
  before(() => {
    const d = new Date().toISOString().slice(0, 10) + 'T10:00';
    const st = { v: 2, settings: { rate: 2000, mainCur: 'USD', ifb: { page: 'https://app.infinitefuturebank.org/p/grace', fee: 1.5 } },
      sales: [{ id: 's1', no: 'R-00012', date: d, cur: 'CDF', rate: 2000, sub: 24000, total: 24000, paid: 0, method: 'ifb', items: [] }],
      credits: [{ id: 'c1', kind: 'client', name: 'IFB customer', amount: 24000, cur: 'CDF', rate: 2000, date: d, saleId: 's1', payments: [], ifb: { ref: 'R-00012', usd: 12 } },
                { id: 'c2', kind: 'client', name: 'Papa K', amount: 30, cur: 'USD', rate: 2000, date: d, payments: [], ifb: { ref: 'C-0007', usd: 30 } }],
      invoices: [{ id: 'f1', no: 'F-0003', date: d, cur: 'USD', rate: 2000, tax: 0, items: [{ qty: 1, price: 50 }], payments: [], ifb: { ref: 'F-0003', usd: 50 } }] };
    ev(`S = migrateUsers(migrate(${JSON.stringify(st)})); setLang('en')`);
  });
  test('references match however the customer types them', () => {
    assert.equal(ev("ifbKey('R-00012')"), ev("ifbKey(' r12 ')"));
    assert.equal(ev("ifbKey('F-0003')"), ev("ifbKey('f 3')"));
    assert.notEqual(ev("ifbKey('R-00012')"), ev("ifbKey('R-00120')"));
    assert.equal(ev("ifbUSD(2850, 'CDF', 2850)"), 1);
    assert.equal(ev("ifbUSD(10.001, 'USD')"), 10.01);
    assert.equal(ev("ifbLink({ usd: 12.4, ref: 'R-00012' })"), 'https://app.infinitefuturebank.org/p/grace?amount=12.40&ref=R-00012&lock=1');
  });
  test('a sale paid with IFB is settled; the customer paid the fee, so the shop gets the full price', () => {
    const r = ev.json(`ifbApply({ id: 'o1', ref: 'r12', total_cents: 1218, fee_cents: 18, name: 'Amara', received_at: '2026-11-19T10:00:00Z' })`);
    assert.deepEqual(r, { status: 'paid', ref: 'R-00012', kind: 'credit', id: 'c1' });
    assert.equal(ev("S.sales[0].paid"), 24000);
    assert.equal(ev("creditLeft(S.credits[0])"), 0);
    const tx = ev.json("TX().filter(x => x.ifbId === 'o1')");
    assert.equal(tx.length, 1);
    assert.deepEqual([tx[0].amount, tx[0].cur, tx[0].cat, tx[0].method, tx[0].saleId], [12, 'USD', 'sales', 'ifb', 's1']);
    assert.equal(ev("S.audit.at(-1).by"), 'IFB');
  });
  test('the same payment twice is applied once', () => {
    assert.equal(ev(`ifbApply({ id: 'o1', ref: 'R-00012', total_cents: 1218, fee_cents: 18 })`), null);
    assert.equal(ev("TX().filter(x => x.ifbId === 'o1').length"), 1);
  });
  test('part payment of an invoice; the shop pays the 1.5 % fee', () => {
    const r = ev.json(`ifbApply({ id: 'o2', ref: 'F-0003', total_cents: 2000, fee_cents: 0 })`);
    assert.equal(r.status, 'partial');
    assert.equal(ev("invLeft(S.invoices[0])"), 30);
    const fee = ev.json("TX().find(x => x.ifbId === 'o2' && x.cat === 'fees')");
    assert.equal(fee.amount, 0.3); assert.equal(fee.type, 'out');
  });
  test('an unknown reference goes to the IFB till and is flagged', () => {
    const r = ev.json(`ifbApply({ id: 'o3', ref: 'ZZZ', total_cents: 500, fee_cents: 0 })`);
    assert.equal(r.status, 'unmatched');
    assert.equal(ev('ifbUnmatched().length'), 1);
    assert.equal(Math.round(ev('balances().USD.ifb') * 100) / 100, 36.62);   // IFB till: 12 + 20 − 0.30 fee + 5 − 0.08 fee
    assert.equal(ev('ifbPending()'), 2);                     // invoice (30 left) + credit C-0007
  });
});

describe('automation', () => {
  const ev = loadApp();
  before(() => ev(`S = migrateUsers(migrate({ v: 2, settings: { rate: 2000, mainCur: 'USD', leadDays: 2, coverDays: 7 } })); setLang('en')`));
  test('same day next month, also at the end of short months', () => {
    assert.equal(ev("addMonth('2026-01-31', 31)"), '2026-02-28');
    assert.equal(ev("addMonth('2026-02-28', 31)"), '2026-03-31');
    assert.equal(ev("addMonth('2026-12-28', 28)"), '2027-01-28');
  });
  test('automatic payments: recorded on their day, months missed are caught up, once', () => {
    const d0 = ev('today()'), back = ev(`addDays(today(), -40)`);
    ev(`S.reminders = [{ id: 'r1', title: 'Rent', date: '${back}', day: +'${back}'.slice(8, 10), amount: 50, cur: 'USD', repeat: 'month', done: false, cat: 'rent', method: 'cash', auto: true },
                       { id: 'r2', title: 'Call supplier', date: '${back}', done: false }]`);
    const n = ev('runAutoPayments().length');
    assert.ok(n === 2 || n === 1, 'one or two months due');           // 40 days back: 1 or 2 rent days have passed
    const rent = ev.json("TX().filter(x => x.cat === 'rent')");
    assert.equal(rent.length, n);
    assert.ok(rent.every(x => x.amount === 50 && x.type === 'out' && x.date.slice(0, 10) <= d0));
    assert.equal(ev("S.reminders.filter(r => r.title === 'Rent' && !r.done).length"), 1, 'next month waiting');
    assert.ok(ev("S.reminders.find(r => r.title === 'Rent' && !r.done).date") > d0);
    assert.equal(ev('runAutoPayments().length'), 0, 'nothing twice');
    assert.equal(ev("S.reminders.find(r => r.id === 'r2').done"), false, 'plain reminders are not touched');
    assert.equal(ev("S.audit.at(-1).by"), 'Ma Caisse');
  });
  test('order plan: from the last 14 days of sales, rounded up to the crate', () => {
    const d = ev('today()');
    ev(`S.products = [{ id: 'b', name: 'Beer', stock: 10, min: 6, pack: 12, cost: 1.7, cur: 'USD' }, { id: 'w', name: 'Water', stock: 100, min: 6, cost: 0.4, cur: 'USD' }, { id: 's', name: 'Sugar', stock: 2, min: 4, cost: 1.4, cur: 'USD' }];
        S.stockLog = [{ pid: 'b', reason: 'purchase', who: 'Brewery', delta: 24, date: addDays(today(), -20) + 'T08:00', cost: 1.7, cur: 'USD', rate: 2000 }];
        S.sales = Array.from({ length: 14 }, (_, i) => ({ id: 'x' + i, date: addDays('${d}', -i) + 'T10:00', items: [{ pid: 'b', qty: 3 }, { pid: 'w', qty: 1 }] }));`);
    const plan = ev.json('orderPlan()');
    const beer = plan.find(x => x.pid === 'b'), sugar = plan.find(x => x.pid === 's');
    assert.equal(beer.perDay, 3);                     // 42 sold in 14 days
    assert.equal(beer.qty, 24);                       // 3 × 9 days + 6 safety − 10 = 23 → 2 crates of 12
    assert.equal(beer.supplier, 'Brewery');           // from the last purchase
    assert.ok(beer.urgent);                           // 10 / 3 = 3.3 days left, delivery 2 days + 2 days margin
    assert.equal(sugar.qty, 6);                       // not selling, under its minimum: back to 2 × min
    assert.ok(!plan.some(x => x.pid === 'w'), 'water has 100 days of stock');
    assert.match(ev("orderText('Brewery', orderPlan().filter(x => x.supplier === 'Brewery'))"), /Brewery[\s\S]*- 24 × Beer/);
  });
  test('daily closing compares the counted cash with the cash book', () => {
    ev(`S.tx = [{ id: 'a', type: 'in', date: today() + 'T08:00', amount: 100, cur: 'USD', rate: 2000, cat: 'owner_in', method: 'cash' },
                { id: 'b', type: 'in', date: today() + 'T09:00', amount: 20000, cur: 'CDF', rate: 2000, cat: 'other_in', method: 'cash' }]; S.sales = []`);
    const r = ev.json(`closingCompute({ USD: '95', CDF: '' })`);
    assert.deepEqual([r.expected.USD, r.counted.USD, r.diff.USD], [100, 95, -5]);
    assert.equal(r.diff.CDF, null, 'francs not counted');
    assert.match(ev(`closingText(closingCompute({ USD: '95', CDF: '' }))`), /shortage of \$5\.00[\s\S]*not counted/);
  });
  test('what needs attention (phone notification text, any language)', () => {
    const d = ev('today()');
    ev(`S.credits = [{ id: 'c', kind: 'client', name: 'X', amount: 10, payments: [], due: addDays(today(), -2) }];
        S.reminders = [{ title: 'Tax', date: today(), done: false }];
        S.sales = [{ id: 's1', date: addDays(today(), -1) + 'T10:00', items: [] }]; S.closings = []`);
    const en = ev.json(`mcDue(S, '${d}', (s, v) => mcT('en', s, v), 9).map(i => i.text)`);
    assert.ok(en.includes('1 overdue customer credit'));
    assert.ok(en.includes('Tax · Today'));
    assert.ok(en.includes('Yesterday was not closed'));
    assert.ok(en.includes('1 product to reorder: Sugar'), en.join(' | '));   // the sales were replaced: only Sugar is under its minimum
    const fr = ev.json(`mcDue(S, '${d}', (s, v) => mcT('fr', s, v), 9).map(i => i.text)`);
    assert.ok(fr.includes('1 crédit client en retard'));
    assert.ok(fr.includes('Tax · Aujourd’hui'));
  });
});

describe('cloud backup encryption', () => {
  const ev = loadApp();
  test('what is sealed with the password opens with it, and only with it', async () => {
    const env = await ev(`(async () => { const salt = bytesToB64(crypto.getRandomValues(new Uint8Array(16))); const key = await passKey('blue-mango-2026', salt); return sealBackup({ app: 'macaissepro', state: { note: 'Bière été ¡ñ!' } }, key, salt); })()`);
    assert.equal(env.app, 'macaissepro-cloud');
    assert.ok(!JSON.stringify(env).includes('Bière'));
    const back = await ev(`openBackup(${JSON.stringify(env)}, 'blue-mango-2026')`);
    assert.equal(back.obj.state.note, 'Bière été ¡ñ!');
    await assert.rejects(ev(`openBackup(${JSON.stringify(env)}, 'wrong-password')`), /Wrong backup password/);
  });
});

describe('backup server', () => {
  let proc, port, dir, codes, ifbFile;
  const B = JSON.stringify({ app: 'macaissepro-cloud', v: 1, iv: 'x', data: 'eA==' });
  const call = (method, code, body) => fetch(`http://127.0.0.1:${port}/backup`, { method, body, headers: code ? { Authorization: 'Bearer ' + code } : {} }).then(r => r.status);
  before(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-srv-'));
    codes = path.join(dir, 'shops.txt'); fs.writeFileSync(codes, 'aaaaaaaaaaaaaaaaaaaa  # Shop A\nshort # ignored\n');
    ifbFile = path.join(dir, 'ifb.json'); fs.writeFileSync(ifbFile, '{}');
    port = 20000 + Math.floor(Math.random() * 20000);
    proc = spawn(process.execPath, [path.join(ROOT, 'server/backup-server.mjs')], { env: { ...process.env, PORT: port, DATA_DIR: path.join(dir, 'data'), BACKUP_TOKENS_FILE: codes, IFB_FILE: ifbFile, KEEP: '2' } });
    await new Promise((res, rej) => { proc.stdout.on('data', d => /server on/.test(d) && res()); proc.on('exit', c => rej(new Error('server exited ' + c))); });
  });
  after(() => proc.kill());
  test('accepts known codes, refuses others and non-backups', async () => {
    assert.equal(await call('PUT', 'aaaaaaaaaaaaaaaaaaaa', B), 200);
    assert.equal(await call('GET', 'aaaaaaaaaaaaaaaaaaaa'), 200);
    assert.equal(await call('PUT', 'short', B), 401);
    assert.equal(await call('PUT', null, B), 401);
    assert.equal(await call('PUT', 'aaaaaaaaaaaaaaaaaaaa', '{"hello":1}'), 400);
  });
  test('keeps only the last versions', async () => {
    for (let i = 0; i < 3; i++) { assert.equal(await call('PUT', 'aaaaaaaaaaaaaaaaaaaa', B), 200); await new Promise(r => setTimeout(r, 5)); }
    const sub = fs.readdirSync(path.join(dir, 'data'))[0];
    assert.equal(fs.readdirSync(path.join(dir, 'data', sub)).length, 2);
  });
  test('IFB webhook: signed payments are stored without personal details, per shop', async () => {
    const hook = 'hhhhhhhhhhhhhhhhhhhh', secret = 'whsec_test_123456', code = 'bbbbbbbbbbbbbbbbbbbb';
    fs.appendFileSync(codes, code + '  # Shop B\n');
    const folderOf = c => crypto.createHash('sha256').update(c).digest('hex').slice(0, 24);
    fs.writeFileSync(ifbFile, JSON.stringify({ [hook]: { secret, folder: folderOf(code), name: 'Shop B' } }));
    await new Promise(r => setTimeout(r, 20));
    const order = { event: 'order.paid', order: { id: 'ord-1', page_slug: 'grace', total_cents: 1218, currency: 'USD', customer_name: 'Amara', customer_email: 'amara@example.com', answers: { order_reference: 'R-00012', note: 'private' }, line_items: [{ label: 'Item', total_cents: 1200 }, { label: 'Processing fee', total_cents: 18 }], paid_at: '2026-11-19T10:00:00Z' } };
    const body = JSON.stringify(order), sig = 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
    const post = (h, b, s) => fetch(`http://127.0.0.1:${port}/ifb/${h}`, { method: 'POST', body: b, headers: { 'Content-Type': 'application/json', 'X-IFB-Signature': s } }).then(r => r.status);
    assert.equal(await post(hook, body, sig), 200);
    assert.equal(await post(hook, body, sig), 200);                          // duplicate: accepted, kept once
    assert.equal(await post(hook, body, 'sha256=' + '0'.repeat(64)), 401);   // wrong signature
    assert.equal(await post(hook, body.replace('1218', '9999'), sig), 401);  // body changed
    assert.equal(await post('unknownhookunknownhook', body, sig), 404);
    const list = c => fetch(`http://127.0.0.1:${port}/ifb/payments`, { headers: { Authorization: 'Bearer ' + c } }).then(r => r.json());
    const { payments } = await list(code);
    assert.equal(payments.length, 1);
    assert.deepEqual([payments[0].ref, payments[0].total_cents, payments[0].fee_cents, payments[0].name], ['R-00012', 1218, 18, 'Amara']);
    assert.ok(!JSON.stringify(payments).includes('amara@example.com') && !JSON.stringify(payments).includes('private'));
    assert.equal((await list('aaaaaaaaaaaaaaaaaaaa')).payments?.length ?? 0, 0);   // another shop sees nothing
    const later = await fetch(`http://127.0.0.1:${port}/ifb/payments?since=2999-01-01`, { headers: { Authorization: 'Bearer ' + code } }).then(r => r.json());
    assert.equal(later.payments.length, 0);
  });
  test('new and revoked codes apply without restart', async () => {
    fs.appendFileSync(codes, 'bbbbbbbbbbbbbbbbbbbb  # Shop B\n'); await new Promise(r => setTimeout(r, 20));
    assert.equal(await call('GET', 'bbbbbbbbbbbbbbbbbbbb'), 404);          // known, no backup yet
    fs.writeFileSync(codes, 'bbbbbbbbbbbbbbbbbbbb  # Shop B\n'); await new Promise(r => setTimeout(r, 20));
    assert.equal(await call('GET', 'aaaaaaaaaaaaaaaaaaaa'), 401);
  });
});

describe('shop code tool', { skip: process.platform === 'win32' }, () => {
  test('add, list, show, revoke', () => {
    const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mc-shops-')), 'shops.txt');
    const run = (...a) => execFileSync('bash', [path.join(ROOT, 'deploy/shop-codes.sh'), ...a], { env: { ...process.env, SHOPS_FILE: f }, encoding: 'utf8' });
    const code = run('add', 'Grace Depot').trim().split(' ').pop();
    assert.match(code, /^[A-Za-z0-9_-]{24}$/);
    assert.match(run('list'), /Grace Depot/);
    assert.ok(!run('list').includes(code));
    assert.equal(run('show', 'Grace Depot').trim(), code);
    const out = execFileSync('bash', [path.join(ROOT, 'deploy/shop-codes.sh'), 'ifb', 'Grace Depot'], { env: { ...process.env, SHOPS_FILE: f, MACAISSE_DOMAIN: 'pay.example.com' }, input: 'whsec_from_ifb_app\n', encoding: 'utf8' });
    const url = out.match(/https:\/\/pay\.example\.com\/ifb\/([A-Za-z0-9_-]{24})/);
    assert.ok(url, out);
    const j = JSON.parse(fs.readFileSync(path.join(path.dirname(f), 'ifb.json'), 'utf8'));
    assert.deepEqual([j[url[1]].secret, j[url[1]].folder, j[url[1]].name], ['whsec_from_ifb_app', crypto.createHash('sha256').update(code).digest('hex').slice(0, 24), 'Grace Depot']);
    assert.ok(!out.includes('whsec_from_ifb_app'), 'secret is never printed');
    run('revoke', code.slice(0, 6));
    assert.ok(!fs.readFileSync(f, 'utf8').includes(code));
  });
});
