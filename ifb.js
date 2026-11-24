'use strict';
/* =====================================================================
   Ma Caisse — IFB payments (Infinite Future Bank, the DEUS app).
   A customer pays a sale, a credit or an invoice on the shop's IFB Payment Page
   (card, mobile money, Paystack or IFB wallet), typing the amount and the reference
   (R-00012, F-0003, C-0007). IFB sends a signed order.paid webhook to the shop's server
   (server/backup-server.mjs); the phone fetches confirmed payments and settles the
   matching sale / credit / invoice by itself. Unknown references land in the IFB till
   and are flagged so the owner can link them.
   Depends on core.js, security.js (audit), cloud.js (server address + access code), qr.js.
   ===================================================================== */

const IFB_PAGE_RE = /^https:\/\/app\.infinitefuturebank\.org\/p\/[A-Za-z0-9_-]{3,80}\/?$/;
const IFB_MIN_USD = 1;
const ifbCfg = () => ({ page: '', fee: 1.5, ...(S.settings.ifb || {}) });
const ifbOn = () => !!ifbCfg().page;
const ifbServer = () => (CLOUD.cfg && CLOUD.cfg.url && CLOUD.cfg.token ? CLOUD.cfg : null);
/* R-00012, r12, "R 12" → R12: customers type references in many ways. */
const ifbKey = r => String(r || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^([A-Z])0+(?=\d)/, '$1');
const ifbUSD = (amount, cur, rate) => Math.ceil(conv(amount, cur, 'USD', rate) * 100 - 1e-6) / 100;   // round up to the cent
const IFBS = { busy: false, watch: null, last: null, err: '' };
/* Link with the amount and reference filled in (IFB ≥ payment-page-prefill; older pages simply ignore them). */
const ifbLink = o => `${ifbCfg().page}?amount=${(Math.round(o.usd * 100) / 100).toFixed(2)}&ref=${encodeURIComponent(o.ref)}&lock=1`;

/* Everything that is waiting for an IFB payment. */
function ifbTargets() {
  return [
    ...CR().filter(c => c.ifb && creditLeft(c) > 0).map(c => ({ kind: 'credit', obj: c, ref: c.ifb.ref })),
    ...INV().filter(f => f.ifb && invLeft(f) > 0).map(f => ({ kind: 'invoice', obj: f, ref: f.ifb.ref }))
  ];
}
const ifbPending = () => ifbTargets().length;
const ifbUnmatched = () => TX().filter(x => x.ifbUnmatched);

/* Ask for an IFB payment on a credit (sale on credit included) or an invoice. Returns {ref, usd}. */
function ifbRequest(kind, obj) {
  const rate = S.settings.rate;
  if (kind === 'invoice') { obj.ifb = { ref: obj.no, usd: ifbUSD(invLeft(obj), obj.cur, rate), at: nowISO() }; }
  else {
    const sale = obj.saleId && S.sales.find(s => s.id === obj.saleId);
    const ref = obj.ifb?.ref || (sale ? sale.no : 'C-' + String(S.settings.crNo = (S.settings.crNo || 0) + 1).padStart(4, '0'));
    obj.ifb = { ref, usd: ifbUSD(creditLeft(obj), obj.cur, rate), at: nowISO() };
  }
  return obj.ifb;
}

/* Apply one confirmed payment from the server. Returns what happened, or null if already done. */
function ifbApply(p) {
  S.ifbSeen = S.ifbSeen || [];
  if (!p || !p.id || S.ifbSeen.includes(p.id)) return null;
  const usd = Math.max(0, (Math.round(+p.total_cents) || 0) - (Math.round(+p.fee_cents) || 0)) / 100;
  const rate = S.settings.rate, date = nowISO(), key = ifbKey(p.ref), who = p.name ? ' – ' + p.name : '', txId = uid();
  const tgt = key && ifbTargets().find(x => ifbKey(x.ref) === key);
  let res;
  if (tgt && tgt.kind === 'credit') {
    const c = tgt.obj, left = creditLeft(c), applied = Math.min(rnd(conv(usd, 'USD', c.cur, rate), c.cur), left);
    const sale = c.saleId && S.sales.find(s => s.id === c.saleId);
    c.payments.push({ date, amount: applied, txId, ifb: p.id });
    if (sale) sale.paid = rnd(Math.min(sale.total, sale.paid + applied), sale.cur);
    S.tx.push({ id: txId, type: 'in', date, amount: rnd(usd, 'USD'), cur: 'USD', rate, cat: sale ? 'sales' : 'credit_in', method: 'ifb', note: `IFB ${tgt.ref}${who}`, creditId: c.id, saleId: sale ? sale.id : undefined, ifbId: p.id });
    res = { status: creditLeft(c) <= 0 ? 'paid' : 'partial', ref: tgt.ref, kind: 'credit', id: c.id };
  } else if (tgt && tgt.kind === 'invoice') {
    const f = tgt.obj, applied = Math.min(rnd(conv(usd, 'USD', f.cur, rate), f.cur), invLeft(f));
    f.payments.push({ date, amount: applied, txId, ifb: p.id });
    S.tx.push({ id: txId, type: 'in', date, amount: rnd(usd, 'USD'), cur: 'USD', rate, cat: 'invoice_in', method: 'ifb', note: `IFB ${tgt.ref}${who}`, invoiceId: f.id, ifbId: p.id });
    res = { status: invLeft(f) <= 0 ? 'paid' : 'partial', ref: tgt.ref, kind: 'invoice', id: f.id };
  } else {
    S.tx.push({ id: txId, type: 'in', date, amount: rnd(usd, 'USD'), cur: 'USD', rate, cat: 'other_in', method: 'ifb', note: `IFB ${p.ref || '—'}${who}`, ifbId: p.id, ifbUnmatched: true, ifbRef: p.ref || '' });
    res = { status: 'unmatched', ref: p.ref || '' };
  }
  const feeRate = +ifbCfg().fee || 0;
  if (!p.fee_cents && feeRate > 0) S.tx.push({ id: uid(), type: 'out', date, amount: rnd(usd * feeRate / 100, 'USD'), cur: 'USD', rate, cat: 'fees', method: 'ifb', note: `${t('IFB fee')} · ${p.ref || '—'}`, ifbId: p.id });
  S.ifbSeen.push(p.id); if (S.ifbSeen.length > 3000) S.ifbSeen.splice(0, S.ifbSeen.length - 3000);
  audit('ifb_paid', `${p.ref || '—'} · ${fmt(usd, 'USD')}${who}` + (res.status === 'unmatched' ? ' · ' + t('not matched') : res.status === 'partial' ? ' · ' + t('part payment') : ''), 'IFB');
  return res;
}

/* Fetch confirmed payments from the shop's server and apply them. */
async function ifbSync(manual) {
  const srv = ifbServer();
  if (!ifbOn()) return [];
  if (!srv) { if (manual) toast(t('Connect cloud backup first: IFB payments arrive through the same server.'), 'bad'); return []; }
  if (!navigator.onLine) { if (manual) toast(t('No internet: payments will be checked later'), 'bad'); return []; }
  if (IFBS.busy) return [];
  IFBS.busy = true;
  try {
    const since = S.ifbLast ? new Date(new Date(S.ifbLast).getTime() - 2 * 864e5).toISOString() : '';
    const r = await fetch(srv.url.replace(/\/+$/, '') + '/ifb/payments' + (since ? '?since=' + encodeURIComponent(since) : ''), { headers: { Authorization: 'Bearer ' + srv.token }, cache: 'no-store' });
    if (r.status === 401 || r.status === 403) throw new Error(t('The server refused the access code'));
    if (!r.ok) throw new Error(t('Server error {n}', { n: r.status }));
    const { payments = [] } = await r.json();
    const done = [];
    for (const p of payments) {
      const res = ifbApply(p); if (res) done.push(res);
      if (p.received_at && p.received_at > (S.ifbLast || '')) S.ifbLast = p.received_at;
    }
    IFBS.last = nowISO(); IFBS.err = '';
    if (done.length) {
      commit(); render();
      const paid = done.filter(d => d.status !== 'unmatched').length, un = done.length - paid;
      toast(un ? t('{n} IFB payment received, {u} to match|{n} IFB payments received, {u} to match', { n: done.length, u: un }) : t('{n} IFB payment received|{n} IFB payments received', { n: done.length }), 'ok');
    } else if (manual) toast(t('No new IFB payment'));
    return done;
  } catch (e) {
    IFBS.err = e instanceof TypeError ? t('Cannot reach the server (internet?)') : e.message;
    if (manual) toast(IFBS.err, 'bad');
    return [];
  } finally { IFBS.busy = false; }
}
/* Check often while someone waits for a payment, rarely otherwise. */
let ifbTick = 0;
setInterval(() => {
  if (!ifbOn() || !ifbServer() || document.visibilityState !== 'visible') return;
  ifbTick++;
  const waiting = IFBS.watch && $('#ifbState');
  if (waiting || (ifbPending() && ifbTick % 15 === 0) || ifbTick % 150 === 0) ifbSync(false).then(() => ifbWatchUpdate());
}, 4000);
window.addEventListener('online', () => setTimeout(() => ifbSync(false), 2500));

/* ---------- Screens ---------- */
const ifbPayText = o => t('Pay {biz} with IFB: {a} · reference {ref} · {link}', { biz: bizName(), a: fmt(o.usd, 'USD'), ref: o.ref, link: ifbLink(o) });
function ifbIsPaid(ref) {
  const k = ifbKey(ref);
  const c = S.credits.find(x => x.ifb && ifbKey(x.ifb.ref) === k), f = S.invoices.find(x => x.ifb && ifbKey(x.ifb.ref) === k);
  const o = c || f; if (!o) return false;
  return c ? creditLeft(c) <= 0 : invLeft(f) <= 0;
}
function ifbSheet(o) {   // o = { ref, usd, who, phone }
  IFBS.watch = o.ref;
  const link = ifbLink(o), text = ifbPayText(o);
  openModal(t('Pay with IFB'), `
    <div class="ifb">
      <div class="ifb-qr">${qrSVG(link, t('IFB payment page'))}</div>
      <div class="ifb-facts">
        <div><small>${t('Amount to type')}</small><b>${fmt(o.usd, 'USD')}</b></div>
        <div><small>${t('Reference to type')}</small><b class="ifb-ref">${esc(o.ref)}</b></div>
      </div>
      <ol class="ifb-steps"><li>${t('The customer scans the code with the phone camera.')}</li><li>${t('On the IFB page, they check the amount and the reference (or type them if empty).')}</li><li>${t('They pay by card, mobile money or IFB wallet. No IFB account needed.')}</li></ol>
      <div id="ifbState" data-ref="${esc(o.ref)}">${ifbStateHTML(o.ref)}</div>
      <div class="dlg-acts">
        ${o.phone ? `<a class="btn" href="${waLink(o.phone, text)}" target="_blank" rel="noopener">${ic('chat')}<span>WhatsApp</span></a>` : ''}
        ${btn(t('Share the link'), 'ifbShare', { icon: 'share', data: `data-text="${esc(text)}"` })}
        ${btn(t('Check now'), 'ifbCheck', { icon: 'refresh' })}
      </div>
      <p class="muted xs" style="margin:12px 0 0">${t('You can close this window: the payment is matched by itself when it arrives.')}</p>
    </div>`, null, { icon: 'qr', tone: 'pri', sub: esc(o.who || '') });
}
function ifbStateHTML(ref) {
  if (ifbIsPaid(ref)) return note('checkc', 'green', `<b>${t('Paid with IFB')}</b> · ${t('The sale, credit or invoice is settled.')}`);
  if (!ifbServer()) return note('alert', 'amber', t('Connect cloud backup first: IFB payments arrive through the same server.'));
  return note('clock', 'pri', `${t('Waiting for the payment… This updates by itself.')}${IFBS.err ? `<br><span class="neg">${esc(IFBS.err)}</span>` : ''}`);
}
function ifbWatchUpdate() {
  const el = $('#ifbState'); if (!el) { IFBS.watch = null; return; }
  const was = el.dataset.paid === '1', now = ifbIsPaid(el.dataset.ref);
  el.innerHTML = ifbStateHTML(el.dataset.ref); el.dataset.paid = now ? '1' : '';
  if (now && !was) { const sale = S.sales.find(s => s.no === el.dataset.ref); if (sale && prnCfg().auto) printReceipt(sale, true); }
}
function ifbCard() {
  const c = ifbCfg();
  if (!ifbOn()) return card(t('IFB payments'), `<p class="muted sm" style="margin:0 0 14px">${t('Customers pay by card, mobile money or IFB wallet on your Infinite Future Bank page. Payments are matched to the sale, credit or invoice by themselves.')}</p>${btn(t('Set up'), 'ifbSetup', { cls: 'pri', icon: 'qr' })}`, { sub: t('Off') });
  const un = ifbUnmatched().length;
  return card(t('IFB payments'), `<table class="kv"><tr><td>${t('Payment page')}</td><td style="word-break:break-all">${esc(c.page.replace('https://', ''))}</td></tr><tr><td>${t('Fee')}</td><td>${+c.fee ? t('I pay {p} %', { p: c.fee }) : t('The customer pays it')}</td></tr><tr><td>${t('Waiting')}</td><td>${ifbPending()}</td></tr><tr><td>${t('Last check')}</td><td>${IFBS.last ? fdate(IFBS.last) : '—'}</td></tr></table>
    ${!ifbServer() ? note('alert', 'amber', t('Connect cloud backup first: IFB payments arrive through the same server.')) : IFBS.err ? note('alert', 'red', esc(IFBS.err)) : ''}
    ${un ? note('alert', 'amber', t('{n} IFB payment to match: open it in the Cash book.|{n} IFB payments to match: open them in the Cash book.', { n: un })) : ''}
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px">${btn(t('Check payments now'), 'ifbCheck', { cls: 'pri', icon: 'refresh' })}${btn(t('Change'), 'ifbSetup', { icon: 'settings' })}${btn(t('Turn off'), 'ifbOff', { cls: 'danger', icon: 'x' })}</div>`, { sub: t('Infinite Future Bank · DEUS') });
}
function ifbForm() {
  const c = ifbCfg();
  openModal(t('IFB payments'), `
    ${note('info', 'pri', `<b>${t('In the IFB app (DEUS), once:')}</b><ol style="margin:6px 0 0;padding-left:18px"><li>${t('Services → Payment Pages → New page, pricing “Customer enters amount”.')}</li><li>${t('Add a required text field with the id order_reference, labelled “Reference”.')}</li><li>${t('Webhook URL: ask whoever runs your server (macaisse-shops ifb).')}</li></ol>`)}
    ${fld(t('Your IFB payment page link'), inp('page', c.page, 'type="url" inputmode="url" required placeholder="https://app.infinitefuturebank.org/p/your-shop" autofocus spellcheck="false"'))}
    <p class="flabel">${t('Who pays the IFB fee (1.5 %)?')}</p>${choices('fee', [['0', t('The customer'), 'user'], ['1.5', t('The shop'), 'store']], String(+c.fee ? c.fee : 0))}`,
  f => {
    const page = f.page.trim().replace(/\/+$/, '');
    if (!IFB_PAGE_RE.test(page)) { toast(t('This is not an IFB payment page link (https://app.infinitefuturebank.org/p/…)'), 'bad'); return false; }
    S.settings.ifb = { ...c, page, fee: +f.fee };
    audit('settings', 'IFB · ' + page.replace('https://', '')); commit(); toast(t('IFB payments are on'), 'ok');
    setTimeout(() => ifbSync(false), 300);
  }, { icon: 'qr' });
}
/* Link a payment that came with an unknown reference to an open credit or invoice. */
function ifbLinkForm(txId) {
  const x = S.tx.find(y => y.id === txId); if (!x || !x.ifbUnmatched) return;
  const opts = [...CR().filter(c => c.kind === 'client' && creditLeft(c) > 0).map(c => [`c:${c.id}`, `${c.name} · ${fmt(creditLeft(c), c.cur)}${c.ifb ? ' · ' + c.ifb.ref : ''}`]),
    ...INV().filter(f => invLeft(f) > 0).map(f => [`f:${f.id}`, `${t('Invoice {no}', { no: f.no })} · ${f.client} · ${fmt(invLeft(f), f.cur)}`])];
  if (!opts.length) return toast(t('No open credit or invoice to link'), 'bad');
  openModal(t('Link the IFB payment'), `<div class="hero-amt"><b class="pos">+ ${fmt(x.amount, 'USD')}</b><small>${esc(x.note)}</small></div>${fld(t('This payment is for'), sel('to', opts, opts[0][0]))}`,
  f => {
    const [k, id] = f.to.split(':'), rate = S.settings.rate, date = nowISO();
    if (k === 'c') {
      const c = S.credits.find(y => y.id === id), applied = Math.min(rnd(conv(x.amount, 'USD', c.cur, rate), c.cur), creditLeft(c)), sale = c.saleId && S.sales.find(s => s.id === c.saleId);
      c.payments.push({ date, amount: applied, txId: x.id, ifb: x.ifbId });
      if (sale) sale.paid = rnd(Math.min(sale.total, sale.paid + applied), sale.cur);
      Object.assign(x, { cat: sale ? 'sales' : 'credit_in', creditId: c.id, saleId: sale ? sale.id : undefined });
      audit('ifb_link', `${x.ifbRef || '—'} → ${c.name}`);
    } else {
      const inv = S.invoices.find(y => y.id === id), applied = Math.min(rnd(conv(x.amount, 'USD', inv.cur, rate), inv.cur), invLeft(inv));
      inv.payments.push({ date, amount: applied, txId: x.id, ifb: x.ifbId });
      Object.assign(x, { cat: 'invoice_in', invoiceId: inv.id });
      audit('ifb_link', `${x.ifbRef || '—'} → ${inv.no}`);
    }
    delete x.ifbUnmatched; commit(); toast(t('Payment linked'), 'ok');
  }, { icon: 'qr', ok: t('Link') });
}
const ifbAct = {
  ifbSetup: () => needOwner(t('IFB payments'), ifbForm),
  ifbOff: () => needOwner(t('IFB payments'), () => confirmBox(t('Stop taking IFB payments in the app? Payments already received stay in the cash book.'), () => { S.settings.ifb = { ...ifbCfg(), page: '' }; audit('settings', 'IFB off'); commit(); }, t('Turn off'))),
  ifbCheck: () => ifbSync(true).then(() => ifbWatchUpdate()),
  ifbShare: async el => { const text = el.dataset.text; if (navigator.share) { try { await navigator.share({ text }); } catch { } } else { try { await navigator.clipboard.writeText(text); toast(t('Link copied'), 'ok'); } catch { toast(t('Sharing is not available on this device'), 'bad'); } } },
  ifbCredit: el => { const c = S.credits.find(x => x.id === el.dataset.id); const r = ifbRequest('credit', c); commit(); ifbSheet({ ...r, who: c.name, phone: c.phone }); },
  ifbInvoice: el => { const f = S.invoices.find(x => x.id === el.dataset.id); const r = ifbRequest('invoice', f); commit(); ifbSheet({ ...r, who: f.client, phone: f.phone }); },
  ifbLink: el => needOwner(t('Link the IFB payment'), () => ifbLinkForm(el.dataset.id))
};
