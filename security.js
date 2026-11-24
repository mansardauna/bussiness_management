'use strict';
/* =====================================================================
   Ma Caisse — team & control: accounts with roles, sign-in page, first-launch setup,
   PIN codes (PBKDF2), approval for sensitive actions, activity log, automatic lock.
   Depends on core.js. Screens call: can(perm), canSee(route), allowedAct(action),
   needOwner(label, fn, perm), audit(action, detail).
   ===================================================================== */

/* ---------- Roles ----------
   perms: what the role may do. Actions are tied to perms in ACT_NEED below, screens to `routes`.
   approve = may approve sensitive actions of others (void, delete, discount…). */
const ROLE_DEFS = {
  owner: { name: 'Owner', icon: 'shield', tone: 'pri', desc: 'Everything: sales, money, stock, team and settings.', perms: '*', routes: '*' },
  manager: { name: 'Manager', icon: 'briefcase', tone: 'blue', desc: 'All daily work, reports and approvals. No team or settings.',
    perms: ['sell', 'credit', 'cash', 'count', 'close', 'bottles', 'product', 'stock', 'invoice', 'staff', 'remind', 'reports', 'audit', 'cost', 'approve', 'editmoney', 'backup'],
    routes: ['dash', 'vente', 'caisse', 'credits', 'produits', 'emballages', 'personnel', 'factures', 'rappels', 'rapports', 'analyse', 'scanner', 'journal', 'aide', 'menu'],
    tabs: [['dash', 'Home', 'dashboard'], ['caisse', 'Cash book', 'wallet'], ['vente', 'Sell', 'cart'], ['credits', 'Credits', 'book'], ['menu', 'More', 'grid']], fab: 'vente' },
  cashier: { name: 'Sales staff', icon: 'cart', tone: 'green', home: 'My shift', desc: 'Sells, gives receipts, takes credit payments and closes the day.',
    perms: ['sell', 'credit', 'cash', 'count', 'close', 'bottles', 'remind'],
    routes: ['home', 'vente', 'caisse', 'credits', 'emballages', 'rappels', 'scanner', 'aide', 'menu'],
    tabs: [['home', 'Home', 'dashboard'], ['caisse', 'Cash book', 'wallet'], ['vente', 'Sell', 'cart'], ['credits', 'Credits', 'book'], ['menu', 'More', 'grid']], fab: 'vente' },
  stock: { name: 'Store manager', icon: 'package', tone: 'amber', home: 'Stock overview', desc: 'Logs products, deliveries, stock counts and packaging, and prepares orders.',
    perms: ['product', 'stock', 'bottles', 'remind', 'cost'],
    routes: ['home', 'produits', 'emballages', 'rappels', 'scanner', 'aide', 'menu'],
    tabs: [['home', 'Home', 'dashboard'], ['emballages', 'Packaging', 'bottle'], ['produits', 'Products', 'package'], ['rappels', 'Reminders', 'bell'], ['menu', 'More', 'grid']], fab: 'produits' },
  accountant: { name: 'Accountant', icon: 'calculator', tone: 'teal', home: 'Money overview', desc: 'Cash book, invoices, salaries, payments and reports.',
    perms: ['cash', 'count', 'close', 'credit', 'invoice', 'staff', 'remind', 'reports', 'cost', 'editmoney'],
    routes: ['home', 'caisse', 'credits', 'factures', 'personnel', 'rappels', 'rapports', 'analyse', 'scanner', 'aide', 'menu'],
    tabs: [['home', 'Home', 'dashboard'], ['credits', 'Credits', 'book'], ['caisse', 'Cash book', 'wallet'], ['factures', 'Invoices', 'file'], ['menu', 'More', 'grid']], fab: 'caisse' },
  auditor: { name: 'Auditor', icon: 'eye', tone: 'gray', home: 'Audit overview', desc: 'Sees everything, changes nothing.',
    perms: ['reports', 'audit', 'cost'],
    routes: ['home', 'dash', 'vente', 'caisse', 'credits', 'produits', 'emballages', 'personnel', 'factures', 'rappels', 'rapports', 'analyse', 'journal', 'aide', 'menu'],
    tabs: [['home', 'Home', 'dashboard'], ['rapports', 'Reports', 'chart'], ['journal', 'Log', 'clock'], ['caisse', 'Cash book', 'wallet'], ['menu', 'More', 'grid']], fab: 'journal' }
};
const ROLE_ORDER = ['owner', 'manager', 'cashier', 'stock', 'accountant', 'auditor'];
const ROLES = Object.fromEntries(ROLE_ORDER.map(k => [k, ROLE_DEFS[k].name]));   // id → English name (translate with t())
const roleOf = u => ROLE_DEFS[u?.role] || ROLE_DEFS.cashier;

/* What each button / action needs. Actions not listed only show or open things. */
const ACT_NEED = {
  newTx: 'cash', exchange: 'cash', scanAs: 'cash', ifbLink: 'cash', txEdit: 'cash', txDel: 'cash', cashCount: 'count', closeDay: 'close',
  addCart: 'sell', cartQty: 'sell', cartClear: 'sell', cartCur: 'sell', checkout: 'sell', voidSale: 'sell',
  newCredit: 'credit', creditPay: 'credit', creditDue: 'credit', creditDel: 'credit', ifbCredit: 'credit', ifbCheck: ['credit', 'cash', 'sell'],
  newProduct: 'product', productEdit: 'product', productDel: 'product', restock: 'stock', adjust: 'stock', orderSend: 'stock',
  bottleReturn: 'bottles', bottleLend: 'bottles', bottleSupplier: 'bottles',
  newPerson: 'staff', personEdit: 'staff', personDel: 'staff', payPerson: 'staff', salariesAuto: 'staff',
  newInvoice: 'invoice', invoicePay: 'invoice', invoiceDel: 'invoice', addLine: 'invoice', ifbInvoice: 'invoice',
  newReminder: 'remind', remDone: 'remind', remDel: 'remind',
  exportCSV: 'reports', printReport: 'reports', jUser: 'audit',
  backup: 'backup', backupShare: 'backup',
  demo: 'team', reset: 'team', install: 'team', userAdd: 'team', userEdit: 'team', userPin: 'team', userOff: 'team',
  cloudSetup: 'team', cloudRestore: 'team', cloudOff: 'team', cloudAutoToggle: 'team', cloudNow: 'backup',
  ifbSetup: 'team', ifbOff: 'team', printerSetup: 'team', printerConnect: 'team', printerTest: 'team', notifySetup: 'team', notifyTest: 'team'
};
const CHG_NEED = { cartSet: 'sell', cartBack: 'sell', restore: 'team', autoLock: 'team', closeHour: 'team', leadDays: 'team', scanFile: 'cash' };

const SESSION = { uid: null };
const users = () => (S.users || []).filter(u => !u.off);
const owners = () => users().filter(u => u.role === 'owner');
const approvers = () => users().filter(u => u.role === 'owner' || u.role === 'manager');
const teamOn = () => users().length > 0;               // no account yet = single-user mode (acts as owner)
const me = () => (S.users || []).find(u => u.id === SESSION.uid) || null;
function can(p) {
  if (!teamOn()) return true;
  const u = me(); if (!u) return false;
  const d = roleOf(u); return d.perms === '*' || d.perms.includes(p);
}
const isOwner = () => can('team');
const canSee = r => { if (!teamOn()) return r !== 'home'; const u = me(); if (!u) return false; const d = roleOf(u); return d.routes === '*' ? r !== 'home' : d.routes.includes(r); };
const roleHome = () => canSee('home') ? 'home' : canSee('dash') ? 'dash' : 'vente';
const allowedAct = act => { const n = ACT_NEED[act]; return !n || [].concat(n).some(can); };
const allowedChg = k => { const n = CHG_NEED[k]; return !n || [].concat(n).some(can); };
const homeLabel = () => t(roleOf(me()).home || 'Dashboard');
const meName = () => me()?.name || S.settings.owner || t('Owner');
const voidMark = () => ({ at: nowISO(), by: meName(), ap: ui.approval || undefined });

/* ---------- PIN codes ---------- */
/* A 4-digit PIN has only 10 000 values: the lock-out after 5 wrong tries is the real protection.
   The hash only stops the PIN being read in clear text; keep it fast on cheap phones. */
const KDF_PIN = 30000;
const hashPin = p => { let h = 5381; for (const c of 'mcp:' + p) h = ((h << 5) + h + c.charCodeAt(0)) >>> 0; return h.toString(36); }; // version 1 (weak), only to read old PINs
const rawB64 = u8 => btoa(String.fromCharCode(...u8));
const hasSubtle = () => !!(window.crypto && crypto.subtle);
async function pinHash(pin, salt, iter = KDF_PIN) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: Uint8Array.from(atob(salt), c => c.charCodeAt(0)), iterations: iter, hash: 'SHA-256' }, k, 256);
  return rawB64(new Uint8Array(bits));
}
async function makePin(pin) {
  const salt = rawB64(crypto.getRandomValues(new Uint8Array(16)));
  if (!hasSubtle()) return { salt, hash: hashPin(salt + pin), kdf: 'weak' };   // only without https (file://)
  return { salt, hash: await pinHash(pin, salt), kdf: 'pbkdf2', iter: KDF_PIN };
}
async function verifyPin(pin, u) {
  if (!u) return false;
  if (u.legacy) {                                       // old single PIN: check, then upgrade to PBKDF2
    if (hashPin(pin) !== u.hash) return false;
    Object.assign(u, await makePin(pin)); delete u.legacy; commit(); return true;
  }
  if (u.kdf === 'weak' || !hasSubtle()) return hashPin(u.salt + pin) === u.hash;
  return (await pinHash(pin, u.salt, u.iter || KDF_PIN)) === u.hash;
}
/* Version 1 had one PIN in settings: turn it into the owner account. */
function migrateUsers(s) {
  if (!Array.isArray(s.users)) s.users = [];
  if (!Array.isArray(s.audit)) s.audit = [];
  if (s.settings.pin && !s.users.length) s.users.push({ id: uid(), name: s.settings.owner || t('Owner'), role: 'owner', hash: s.settings.pin, legacy: true, created: today() });
  s.settings.pin = '';
  if (s.settings.autoLock == null) s.settings.autoLock = 5;
  return s;
}

/* ---------- PIN pad: sign-in page, approvals, new PIN ----------
   o = { title, sub, users: [..] to choose from, set: true to create a PIN, cancel: true, auth: true for the full sign-in page,
         verify(pin,user), done(pin,user), onCancel() } */
let padTries = 0, padBlockedUntil = 0;
const roleBadge = u => { const d = roleOf(u); return `<span class="rbadge t-${d.tone}">${ic(d.icon, 'sm')}${t(d.name)}</span>`; };
function pinPad(o) {
  const L = $('#lock'); L.hidden = false; L.className = 'lock' + (o.auth ? ' is-auth' : '');
  const list = o.users || [];
  let user = list.length === 1 && !o.auth ? list[0] : null, code = '', first = null, busy = false;
  const picking = () => list.length > (o.auth ? 0 : 1) && !user;
  const prompt = () => o.set ? (first ? t('Confirm the code') : t('Choose 4 digits')) : t('Enter your code');
  const close = () => { L.hidden = true; L.innerHTML = ''; L.onclick = null; L.className = 'lock'; };
  const padHTML = (msg, err) => {
    const back = (list.length > 1 || o.auth) && user ? t('Back') : o.cancel ? t('Cancel') : '';
    return `${user && !o.set ? `${av(user.name, 'lg')}<h3>${esc(user.name)}</h3>${o.auth ? roleBadge(user) : ''}` : `<span class="logo">${ic(o.set ? 'lock' : 'logo')}</span><h3>${esc(o.title)}</h3>`}
      ${o.sub ? `<p class="ctx">${o.sub}</p>` : ''}<p class="${err ? 'err' : ''}">${msg}</p>
      <div class="dots">${[0, 1, 2, 3].map(i => `<i class="${i < code.length ? 'f' : ''}"></i>`).join('')}</div>
      <div class="pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(k => `<button type="button" data-k="${k}">${k}</button>`).join('')}${back ? `<button type="button" class="ghost" data-k="x">${back}</button>` : '<span></span>'}<button type="button" data-k="0">0</button><button type="button" class="ghost" data-k="del" aria-label="${esc(t('Delete'))}">${ic('left')}</button></div>`;
  };
  const pickHTML = () => {
    if (!o.auth) return `<span class="logo">${ic('logo')}</span><h3>${esc(o.title)}</h3>${o.sub ? `<p class="ctx">${o.sub}</p>` : ''}<p>${t('Who are you?')}</p>
      <div class="ulist">${list.map(u => `<button type="button" data-u="${u.id}">${av(u.name)}<span><b>${esc(u.name)}</b><small>${t(roleOf(u).name)}</small></span>${ic('right', 'sm')}</button>`).join('')}</div>
      ${o.cancel ? `<button type="button" class="btn ghost block" data-k="x" style="margin-top:12px">${t('Cancel')}</button>` : ''}`;
    const sorted = ROLE_ORDER.flatMap(r => list.filter(u => u.role === r));
    const demo = sorted.some(u => u.demoPin);
    return `<h2>${t('Who is working?')}</h2><p class="muted">${t('Tap your name, then type your PIN.')}</p>
      ${demo ? `<p class="demo-note">${ic('flask', 'sm')}<span>${t('Demo accounts: the PIN is written under each name.')}</span></p>` : ''}
      <div class="atiles">${sorted.map(u => `<button type="button" data-u="${u.id}">${av(u.name, 'lg')}<b>${esc(u.name)}</b>${roleBadge(u)}${u.demoPin ? `<small class="dpin">PIN ${u.demoPin}</small>` : ''}</button>`).join('')}</div>`;
  };
  const draw = (msg, err) => {
    const inner = picking() ? pickHTML() : padHTML(msg, err);
    if (!o.auth) { L.innerHTML = `<div class="lk">${inner}</div>`; return; }
    const d0 = today();
    L.innerHTML = `<div class="auth"><aside class="auth-brand"><div class="ab-top"><span class="logo">${ic('logo')}</span><b>Ma Caisse</b></div>
        <div class="ab-mid"><p class="ab-date">${cap(fdateLong(d0))}</p><h1>${esc(bizName())}</h1><p>${t('Sign in to start your shift.')}</p></div>
        <div class="ab-langs">${Object.entries(LANGS).map(([k, [l]]) => `<button type="button" data-lang="${k}" class="${k === LANG ? 'on' : ''}">${l}</button>`).join('')}</div></aside>
      <main class="auth-main"><div class="auth-card ${picking() ? 'wide' : 'lk'}">${inner}</div><p class="auth-foot">${ic('lock', 'sm')} ${t('Each person has their own PIN. Everything they do is recorded in the activity log.')}</p></main></div>`;
  };
  L.onclick = async e => {
    const b = e.target.closest('button'); if (!b || busy) return;
    if (b.dataset.lang) { changeLang(b.dataset.lang); draw(picking() ? '' : prompt()); return; }
    if (b.dataset.u) { user = list.find(u => u.id === b.dataset.u); code = ''; draw(prompt()); return; }
    const k = b.dataset.k; if (k == null) return;
    if (k === 'x') {
      if (user && (list.length > 1 || o.auth)) { user = null; code = ''; first = null; draw(''); return; }
      close(); if (o.onCancel) o.onCancel(); return;
    }
    if (!o.set && Date.now() < padBlockedUntil) { draw(t('Too many tries. Wait {n} s', { n: Math.ceil((padBlockedUntil - Date.now()) / 1000) }), 1); return; }
    if (k === 'del') code = code.slice(0, -1); else if (code.length < 4) code += k;
    draw(prompt()); if (code.length < 4) return;
    busy = true; await new Promise(r => setTimeout(r, 120));
    if (o.set) {
      busy = false;
      if (!first) { first = code; code = ''; draw(prompt()); return; }
      if (first !== code) { first = null; code = ''; draw(t('The codes are different, start again'), 1); return; }
      close(); return o.done(code, user);
    }
    draw(t('Checking…'));
    let ok = false; try { ok = await o.verify(code, user); } catch (err) { console.error(err); }
    busy = false;
    if (ok) { padTries = 0; close(); return o.done(code, user); }
    code = ''; if (++padTries >= 5) { padTries = 0; padBlockedUntil = Date.now() + 30000; }
    draw(t('Wrong code, try again'), 1);
  };
  draw(picking() ? '' : prompt());
}
document.addEventListener('keydown', e => {   // keyboard on computers
  const L = $('#lock'); if (!L || L.hidden || e.target.closest?.('input,select,textarea')) return;
  const k = /^\d$/.test(e.key) ? e.key : e.key === 'Backspace' ? 'del' : e.key === 'Escape' ? 'x' : null;
  const b = k && L.querySelector(`[data-k="${k}"]`); if (b) { e.preventDefault(); e.stopPropagation(); b.click(); }
}, true);

/* ---------- Sign in / lock ---------- */
let lastAct = Date.now();
function lockApp(reason) {
  if (!teamOn()) return;
  if (SESSION.uid) { audit('lock', reason === 'idle' ? t('Automatic lock') : ''); commit(); }
  SESSION.uid = null; closeModal(true); render();
  pinPad({
    auth: true, title: bizName(), users: users(), verify: verifyPin,
    done: (_, u) => {
      SESSION.uid = u.id; lastAct = Date.now(); audit('login', t(roleOf(u).name)); commit();
      const h = location.hash.replace(/^#\/?/, '').split('?')[0];
      if (!h || !ROUTES[h] || !canSee(h)) history.replaceState(null, '', '#/' + roleHome());
      render(); toast(t('Hello {name}', { name: u.name }), 'ok');
    }
  });
}
['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, () => { lastAct = Date.now(); }, true));
function idleCheck() { const m = +S.settings.autoLock || 0; if (teamOn() && SESSION.uid && m > 0 && Date.now() - lastAct > m * 60000) lockApp('idle'); }
setInterval(idleCheck, 20000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') idleCheck(); });

/* ---------- First launch: create the owner account (or try with sample data) ---------- */
const needsSetup = () => !teamOn() && !S.settings.setupDone && !S.sales.length && !S.tx.length && !S.products.length;
function setupPage() {
  const L = $('#lock'); L.hidden = false; L.className = 'lock is-auth';
  const draw = () => {
    L.innerHTML = `<div class="auth"><aside class="auth-brand"><div class="ab-top"><span class="logo">${ic('logo')}</span><b>Ma Caisse</b></div>
      <div class="ab-mid"><h1>${t('Welcome')}</h1><p>${t('Sales, cash, credits and stock for your shop. Works without internet.')}</p>
        <ul class="ab-list">${[['cart', t('Sell and give receipts')], ['wallet', t('Dollars and francs, credits, expenses')], ['package', t('Stock, packaging and orders')], ['users', t('A PIN and a role for each person')]].map(([i, l]) => `<li>${ic(i, 'sm')}${l}</li>`).join('')}</ul></div>
      <div class="ab-langs">${Object.entries(LANGS).map(([k, [l]]) => `<button type="button" data-lang="${k}" class="${k === LANG ? 'on' : ''}">${l}</button>`).join('')}</div></aside>
      <main class="auth-main"><form class="auth-card wide setup" id="setupForm" autocomplete="off">
        <h2>${t('Set up your shop')}</h2><p class="muted">${t('Two minutes. You will be the owner: you can add your team afterwards.')}</p>
        ${fld(t('Business name'), inp('biz', S.settings.biz, `required placeholder="${esc(t('My Shop'))}"`))}
        ${fld(t('Your name'), inp('name', S.settings.owner, 'required autocomplete="name"'))}
        ${fld(t('Today’s rate: francs for 1 dollar'), `<div class="ig"><span class="pre">FC</span><input class="inp" name="rate" inputmode="decimal" value="${S.settings.rate}"></div>`)}
        <button class="btn pri lg block">${ic('lock')}<span>${t('Next: choose your PIN')}</span></button>
        <div class="or"><span>${t('or')}</span></div>
        <button type="button" class="btn block" data-demo="1">${ic('flask')}<span>${t('Try with sample data first')}</span></button>
      </form></main></div>`;
  };
  L.onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.lang) { changeLang(b.dataset.lang); draw(); return; }
    if (b.dataset.demo) { S.settings.setupDone = true; loadDemo(); audit('demo'); commit(); L.hidden = true; L.className = 'lock'; L.innerHTML = ''; L.onclick = L.onsubmit = null; location.hash = '#/dash'; render(); toast(t('Sample data loaded'), 'ok'); addDemoTeam(); }
  };
  L.onsubmit = e => {
    e.preventDefault(); e.stopPropagation();
    const f = Object.fromEntries(new FormData(e.target)), name = (f.name || '').trim(), biz = (f.biz || '').trim();
    if (!name || !biz) return;
    Object.assign(S.settings, { biz, owner: name, rate: num(f.rate) || S.settings.rate });
    L.onsubmit = null;
    pinPad({ title: t('PIN for {name}', { name }), sub: t('You will type it to open the app and to approve sensitive actions.'), set: true, cancel: true, onCancel: () => setupPage(),
      done: async pin => {
        const u = { id: uid(), name, role: 'owner', created: today(), ...(await makePin(pin)) };
        S.users.push(u); S.settings.setupDone = true; SESSION.uid = u.id;
        audit('user_new', `${name} · ${t('Owner')}`); await commit();
        location.hash = '#/dash'; render(); toast(t('Your shop is ready. Add your team in Settings.'), 'ok');
      } });
  };
  draw();
}

/* ---------- Approval ----------
   Someone without the right asks; an owner or a manager types their PIN on the same phone.
   perm: roles that have it do not need approval (e.g. a store manager adding a product). */
function needOwner(label, fn, perm) {
  if (can('approve') || (perm && can(perm))) return fn();
  pinPad({
    title: t('Approval needed'), sub: esc(label), users: approvers(), cancel: true, verify: verifyPin,
    done: (_, u) => { ui.approval = u.name; fn(); },
    onCancel: () => { audit('denied', label); commit(); }
  });
}

/* ---------- Activity log ---------- */
const ACTIONS = {
  login: ['Signed in', 'user'], lock: ['Locked', 'lock'], sale: ['Sale', 'cart'], void_sale: ['Sale voided', 'xc'],
  tx_new: ['Transaction added', 'wallet'], tx_edit: ['Transaction edited', 'edit'], tx_void: ['Transaction deleted', 'trash'], exchange: ['Currency exchange', 'exchange'], cash_count: ['Cash count', 'calculator'],
  credit_new: ['Credit added', 'book'], credit_pay: ['Credit payment', 'wallet'], credit_due: ['Due date changed', 'calendar'], credit_void: ['Credit deleted', 'trash'],
  product_new: ['Product added', 'package'], product_edit: ['Product edited', 'edit'], product_remove: ['Product removed', 'trash'], restock: ['Restock', 'plus'], stock_adjust: ['Stock count', 'calculator'], bottles: ['Packaging movement', 'bottle'],
  staff_new: ['Staff added', 'userplus'], staff_edit: ['Staff edited', 'edit'], staff_pay: ['Staff payment', 'wallet'], staff_remove: ['Staff removed', 'trash'],
  invoice_new: ['Invoice created', 'file'], invoice_pay: ['Invoice payment', 'wallet'], invoice_void: ['Invoice deleted', 'trash'],
  settings: ['Settings changed', 'settings'], backup: ['Backup file saved', 'download'], cloud_backup: ['Cloud backup sent', 'shield'], cloud_on: ['Cloud backup connected', 'shield'], cloud_off: ['Cloud backup disconnected', 'shield'],
  restore: ['Data restored', 'upload'], reset: ['All data erased', 'trash'], demo: ['Sample data loaded', 'flask'], demo_team: ['Demo accounts added', 'users'],
  user_new: ['User added', 'userplus'], user_edit: ['User edited', 'edit'], user_pin: ['PIN changed', 'lock'], user_off: ['User deactivated', 'trash'], denied: ['Approval cancelled', 'xc'],
  ifb_paid: ['IFB payment received', 'qr'], auto_payment: ['Automatic payment', 'refresh'], closing: ['Day closed', 'moon'], order_sent: ['Order sent', 'package'], ifb_link: ['IFB payment linked', 'qr']
};
const ACT_TONE = a => /void|remove|reset|denied|_off/.test(a) ? 'red' : /edit|adjust|count|due|restore|pin/.test(a) ? 'amber' : /login|lock/.test(a) ? 'gray' : 'pri';
function audit(action, detail = '', by) {
  const d = new Date();
  S.audit.push({ id: uid(), at: nowISO(d) + ':' + z(d.getSeconds()), uid: by ? null : SESSION.uid, by: by || meName(), a: action, d: String(detail || '').slice(0, 240), ap: ui.approval || undefined });
  ui.approval = null;
  if (S.audit.length > 8000) S.audit.splice(0, S.audit.length - 8000);
}
function vJournal() {
  const all = S.audit, f = ui.jUser || '', m = today().slice(0, 7);
  const list = all.filter(x => !f || x.by === f).slice(-400).reverse();
  const names = [...new Set(all.map(x => x.by))];
  const month = all.filter(x => x.at.startsWith(m));
  const n = re => month.filter(x => re.test(x.a)).length;
  return ph(t('Activity log'), t('Who did what, and when. Nothing can be removed from this list.')) + `
  <div class="g4">
    ${kpi({ label: t('Actions today'), icon: 'clock', tone: 'pri', value: all.filter(x => x.at.startsWith(today())).length, active: true })}
    ${kpi({ label: t('Voids & deletions'), icon: 'trash', tone: n(/void|remove/) ? 'red' : 'gray', value: n(/void|remove/), sub: t('this month') })}
    ${kpi({ label: t('Approvals'), icon: 'shield', tone: 'green', value: month.filter(x => x.ap).length, sub: t('this month') })}
    ${kpi({ label: t('Approvals cancelled'), icon: 'xc', tone: n(/denied/) ? 'amber' : 'gray', value: n(/denied/), sub: t('this month') })}
  </div>
  <section class="card p0 mt">
    ${names.length > 1 ? `<div class="chips" style="padding:16px 20px 0"><button type="button" class="${!f ? 'on' : ''}" data-act="jUser" data-v="">${t('Everyone')}</button>${names.map(x => `<button type="button" class="${f === x ? 'on' : ''}" data-act="jUser" data-v="${esc(x)}">${esc(x)}</button>`).join('')}</div>` : ''}
    ${table([{ l: t('When'), c: 'w' }, { l: t('Who') }, { l: t('Action') }, { l: t('Details'), c: 'hide-s' }, { l: t('Approved by') }],
      list.map(x => { const [l, i] = ACTIONS[x.a] || [x.a, 'info']; return { cells: [fdate(x.at), who(x.by), iconWho(i, ACT_TONE(x.a), t(l)), esc(x.d) || '—', x.ap ? pill(esc(x.ap), 'green') : '—'] }; }),
      emptyBox('clock', t('Nothing yet'), t('Actions appear here as soon as people use the app.')))}
  </section>`;
}

/* ---------- Team management (Settings) ---------- */
function teamCard() {
  if (!teamOn()) return card(t('Team & access'), `<p class="muted sm" style="margin:0 0 14px">${t('Right now anyone who opens the phone can use the app. Create the owner account to protect it, then give each person their own PIN and role.')}</p><div class="acct-a">${btn(t('Create the owner account'), 'userAdd', { cls: 'pri', icon: 'shield', data: 'data-role="owner"' })}${btn(t('Add demo accounts'), 'demoTeam', { icon: 'users' })}</div>`, { sub: t('Off') });
  const al = +S.settings.autoLock || 0;
  return card(t('Team & access'), `<div class="lst">${ROLE_ORDER.flatMap(r => users().filter(u => u.role === r)).map(u => `<div>${av(u.name)}<span class="tx"><b>${esc(u.name)}${u.id === SESSION.uid ? ` <small class="muted">(${t('you')})</small>` : ''}</b><p>${roleBadge(u)}</p></span>${btn(t('Edit'), 'userEdit', { cls: 'sm soft', icon: 'edit', data: `data-id="${u.id}"` })}</div>`).join('')}</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">${btn(t('Add a person'), 'userAdd', { cls: 'pri', icon: 'userplus', data: 'data-role="cashier"' })}</div>
    <label class="f" style="margin-top:16px"><span>${t('Lock automatically after')}</span><select class="inp" data-chg="autoLock">${[[0, t('Never')], [2, t('{n} minutes', { n: 2 })], [5, t('{n} minutes', { n: 5 })], [10, t('{n} minutes', { n: 10 })], [30, t('{n} minutes', { n: 30 })]].map(([v, l]) => `<option value="${v}" ${v === al ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    ${note('info', 'pri', t('Each role sees its own home screen and only the screens it needs. Voids, deletions and discounts need the PIN of an owner or a manager.'))}`, { sub: t('{n} person|{n} people', { n: users().length }) });
}
const rolePick = cur => `<div class="rolepick">${ROLE_ORDER.map(r => { const d = ROLE_DEFS[r]; return `<label><input type="radio" name="role" value="${r}" ${r === cur ? 'checked' : ''}><span><span class="ri t-${d.tone}">${ic(d.icon)}</span><span><b>${t(d.name)}</b><small>${t(d.desc)}</small></span></span></label>`; }).join('')}</div>`;
function userForm(role, u) {
  const first = !teamOn(), x = u || { name: first ? (S.settings.owner || '') : '', role };
  openModal(u ? t('Edit {name}', { name: u.name }) : first ? t('Create the owner account') : t('Add a person'), `
    ${first ? note('shield', 'pri', t('You will choose a 4-digit PIN next. The app will ask for it when it opens and for sensitive actions.')) : ''}
    ${fld(t('Name'), inp('name', x.name, 'required autofocus'))}
    ${first ? '' : `<p class="flabel">${t('Role')}</p>${rolePick(x.role)}`}
    ${u ? `<div class="dlg-acts" style="margin-top:0">${btn(t('Change PIN'), 'userPin', { icon: 'lock', data: `data-id="${u.id}"` })}${btn(t('Deactivate'), 'userOff', { cls: 'danger', icon: 'trash', data: `data-id="${u.id}"` })}</div>` : ''}`,
  f => {
    const name = f.name.trim(); if (!name) return false;
    const newRole = first ? 'owner' : (ROLE_DEFS[f.role] ? f.role : 'cashier');
    if (u) {
      if (u.role === 'owner' && newRole !== 'owner' && owners().length < 2) { toast(t('Keep at least one owner'), 'bad'); return false; }
      Object.assign(u, { name, role: newRole }); audit('user_edit', `${name} · ${t(ROLES[newRole])}`); commit(); return;
    }
    closeModal();
    pinPad({ title: t('PIN for {name}', { name }), set: true, cancel: true, done: async pin => {
      const nu = { id: uid(), name, role: newRole, created: today(), ...(await makePin(pin)) };
      S.users.push(nu); if (first) { SESSION.uid = nu.id; S.settings.setupDone = true; }
      audit('user_new', `${name} · ${t(ROLES[newRole])}`); commit(); render();
      toast(first ? t('Owner account created. The app is now protected.') : t('{name} can now sign in', { name }), 'ok');
    } });
    return false;
  }, { icon: first ? 'shield' : 'userplus', ok: u ? t('Save') : t('Next'), wide: !first });
}
const userAct = {
  userAdd: el => needOwner(t('Add a user'), () => userForm(el.dataset.role)),
  userEdit: el => needOwner(t('Edit a user'), () => userForm(null, S.users.find(u => u.id === el.dataset.id))),
  userPin: el => { const u = S.users.find(x => x.id === el.dataset.id); closeModal(); pinPad({ title: t('New PIN for {name}', { name: u.name }), set: true, cancel: true, done: async pin => { Object.assign(u, await makePin(pin)); delete u.legacy; delete u.demoPin; audit('user_pin', u.name); commit(); render(); toast(t('PIN changed'), 'ok'); } }); },
  userOff: el => {
    const u = S.users.find(x => x.id === el.dataset.id);
    if (u.role === 'owner' && owners().length < 2) return toast(t('Keep at least one owner'), 'bad');
    if (u.id === SESSION.uid) return toast(t('You cannot deactivate yourself'), 'bad');
    confirmBox(t('Deactivate <b>{name}</b>? They will not be able to sign in. Their past actions stay in the activity log.', { name: esc(u.name) }), () => { u.off = nowISO(); audit('user_off', u.name); commit(); }, t('Deactivate'));
  },
  lockNow: () => lockApp(),
  demoTeam: () => addDemoTeam(),
  logout: () => { profClose(); lockApp(); toast(t('Logged out'), 'ok'); },
  profMenu: () => { const m = $('#pmenu'), o = !m.classList.contains('open'); m.classList.toggle('open', o); $('#prof').setAttribute('aria-expanded', o); },
  setupTeam: () => { profClose(); if (!teamOn()) userForm('owner'); },
  teamHintOff: () => { S.settings.teamHintOff = true; commit(); render(); },
  jUser: el => { ui.jUser = el.dataset.v; render(); }
};

/* ---------- Who is using the app: profile menu, log out, set up accounts ---------- */
const profClose = () => { const m = $('#pmenu'); if (m && m.classList.contains('open')) { m.classList.remove('open'); $('#prof').setAttribute('aria-expanded', 'false'); } };
function profMenuHTML() {
  const u = me(), nm = u ? u.name : (S.settings.owner || bizName());
  const head = `<div class="pm-h">${av(nm)}<div><b>${esc(nm)}</b>${u ? roleBadge(u) : `<small>${t('No accounts: anyone can use this phone')}</small>`}</div></div>`;
  return head
    + (canSee('params') ? `<a class="pm-i" role="menuitem" href="#/params">${ic('settings', 'sm')}<span>${t('Settings')}</span></a>` : '')
    + `<a class="pm-i" role="menuitem" href="#/aide">${ic('help', 'sm')}<span>${t('Help')}</span></a>`
    + (teamOn() ? `<button class="pm-i bad" role="menuitem" data-act="logout">${ic('logout', 'sm')}<span>${t('Log out')}</span></button>`
      : `<button class="pm-i pri" role="menuitem" data-act="setupTeam">${ic('shield', 'sm')}<span>${t('Set up accounts')}</span></button>`);
}
/* Card on the More page (phones have no profile button), and the dashboard banner while there are no accounts. */
function accountCard(banner) {
  const u = me();
  if (teamOn() && u) return `<div class="card acct"><div class="who">${av(u.name, 'lg')}<div><small class="muted">${t('Signed in as')}</small><b>${esc(u.name)}</b>${roleBadge(u)}</div></div>${btn(t('Log out'), 'logout', { icon: 'logout', cls: 'danger' })}</div>`;
  if (teamOn()) return '';
  return `<div class="card acct"><span class="av sq lg t-amber">${ic('shield')}</span><div class="acct-t"><b>${t('No accounts yet')}</b><p class="muted sm">${t('Anyone who opens this phone sees everything, and nobody needs to sign in or log out. Set up accounts so each person signs in with their own PIN and role.')}</p></div><div class="acct-a">${btn(t('Set up accounts'), 'setupTeam', { cls: 'pri', icon: 'shield' })}${btn(t('Add demo accounts'), 'demoTeam', { icon: 'users' })}${banner ? btn(t('Later'), 'teamHintOff') : ''}</div></div>`;
}

/* ---------- Demo accounts: one person per role, simple PINs shown on the sign-in page ---------- */
const DEMO_TEAM = [['Marie', 'owner', '1111'], ['Paul', 'manager', '2222'], ['Jean', 'cashier', '3333'], ['Grâce', 'cashier', '3333'], ['Didier', 'stock', '4444'], ['Esther', 'accountant', '5555'], ['Bosco', 'auditor', '6666']];
async function addDemoTeam() {
  if (teamOn()) return toast(t('There are already accounts'), 'bad');
  const made = [];
  for (const [name, role, pin] of DEMO_TEAM) made.push({ id: uid(), name, role, ...(await makePin(pin)), demoPin: pin, created: today() });
  S.users.push(...made); S.settings.setupDone = true;
  if (!S.settings.owner) S.settings.owner = 'Marie';
  const sellers = made.filter(u => u.role === 'cashier');   // sample sales get a seller, so "My shift" has numbers
  S.sales.filter(s => !s.by).forEach((s, i) => { const u = sellers[i % sellers.length]; s.by = u.id; s.byName = u.name; });
  audit('demo_team', made.map(u => u.name).join(', '), made[0].name); commit();
  toast(t('Demo accounts added'), 'ok'); lockApp();
}
