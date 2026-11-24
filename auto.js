'use strict';
/* =====================================================================
   Ma Caisse — automation:
   1. automatic payments: rent, salaries… recorded by themselves on their day
   2. daily closing: cash count + a summary sent to the owner on WhatsApp
   3. order suggestions: what to buy, and the order ready to send to the supplier
   4. phone notifications, also when the app is closed (service worker, notify-core.js)
   Depends on core.js, security.js, notify-core.js, app.js (screens), at run time.
   ===================================================================== */

/* ---------- 1. Automatic payments (reminders with an expense category) ---------- */
/* Same day next month; 31 → last day of a short month, and back to 31 after. */
function addMonth(iso, day) {
  const [y, m] = iso.slice(0, 7).split('-').map(Number), ny = m === 12 ? y + 1 : y, nm = m === 12 ? 1 : m + 1;
  const want = day || +iso.slice(8, 10), last = new Date(ny, nm, 0).getDate();
  return `${ny}-${z(nm)}-${z(Math.min(want, last))}`;
}
function payReminder(r, by) {
  const x = { id: uid(), type: 'out', date: (r.date < today() ? r.date + 'T09:00' : nowISO()), amount: rnd(r.amount, r.cur), cur: r.cur, rate: S.settings.rate, cat: r.cat, method: r.method || 'cash', note: r.title, partyId: r.partyId, reminderId: r.id };
  S.tx.push(x); r.done = true; r.txId = x.id;
  if (r.repeat === 'month') S.reminders.push({ ...r, id: uid(), date: addMonth(r.date, r.day), done: false, txId: undefined });
  audit(by ? 'auto_payment' : 'tx_new', `${r.title} · ${fmt(r.amount, r.cur)} · ${fday(r.date)}`, by);
  return x;
}
/* Records every automatic payment whose day has come (several months if the app was not opened). */
function runAutoPayments() {
  const d0 = today(), done = [];
  for (let guard = 0; guard < 120; guard++) {
    const r = S.reminders.find(x => x.auto && !x.done && x.cat && x.amount > 0 && x.date <= d0);
    if (!r) break;
    payReminder(r, 'Ma Caisse'); done.push(r);
  }
  if (done.length) { commit(); toast(t('{n} payment recorded by itself|{n} payments recorded by themselves', { n: done.length }) + ': ' + done.slice(0, 2).map(r => r.title).join(', '), 'ok'); }
  return done;
}
/* "Done" on a reminder: a payment reminder records the payment, the others are simply ticked. */
function reminderDone(r) {
  if (r.cat && r.amount > 0) { payReminder(r); toast(t('Payment recorded'), 'ok'); }
  else { r.done = true; if (r.repeat === 'month') S.reminders.push({ ...r, id: uid(), date: addMonth(r.date, r.day), done: false }); toast(t('Reminder done'), 'ok'); }
  commit(); render();
}
/* One automatic monthly salary per employee. */
function salariesAuto() {
  const day = +S.settings.payDay || 28, d0 = today();
  let first = `${d0.slice(0, 7)}-${z(Math.min(day, new Date(+d0.slice(0, 4), +d0.slice(5, 7), 0).getDate()))}`;
  if (first < d0) first = addMonth(first, day);
  let n = 0;
  for (const p of S.people.filter(p => !p.archived && p.role === 'employe' && p.salary > 0)) {
    if (S.reminders.some(r => r.partyId === p.id && r.auto && !r.done)) continue;
    S.reminders.push({ id: uid(), title: t('Salary') + ' – ' + p.name, date: first, day, amount: p.salary, cur: p.cur, repeat: 'month', note: '', done: false, cat: 'salaries', method: 'cash', auto: true, partyId: p.id });
    n++;
  }
  audit('settings', t('Automatic salaries: {n}', { n })); commit(); render();
  toast(n ? t('Salaries will be recorded by themselves on day {d} of each month', { d: day }) : t('Salaries are already automatic'), 'ok');
}
const autoSalaryOf = pid => S.reminders.find(r => r.partyId === pid && r.auto && !r.done);

/* ---------- 2. Daily closing ---------- */
const closedOn = d => (S.closings || []).find(c => c.date === d);
function closingCompute(counted) {     // counted = { USD: '...', CDF: '...' } as typed ('' = not counted)
  const d0 = today(), mc = S.settings.mainCur, st = stats(d0, mc), bal = balances(), exp = {}, cnt = {}, diff = {};
  for (const c of ['USD', 'CDF']) {
    exp[c] = rnd(bal[c].cash, c);
    const v = String(counted[c] ?? '').trim();
    cnt[c] = v === '' ? null : rnd(num(v), c);
    diff[c] = cnt[c] == null ? null : rnd(cnt[c] - exp[c], c);
  }
  return { id: uid(), date: d0, at: nowISO(), by: meName(), sales: st.count, revenue: rnd(st.revenue, mc), profit: rnd(st.profit, mc), cashIn: rnd(st.in, mc), cashOut: rnd(st.out, mc), cur: mc, expected: exp, counted: cnt, diff };
}
const diffText = (d, c) => d == null ? t('not counted') : d === 0 ? t('the till is right') : d > 0 ? t('surplus of {a}', { a: fmt(d, c) }) : t('shortage of {a}', { a: fmt(-d, c) });
function closingText(r) {
  return `${bizName()} · ${fday(r.date)}\n` +
    `${t('{n} sale|{n} sales', { n: r.sales })} · ${fmt(r.revenue, r.cur)} · ${t('Profit')} ${fmt(r.profit, r.cur)}\n` +
    `${t('Money in')} ${fmt(r.cashIn, r.cur)} · ${t('Money out')} ${fmt(r.cashOut, r.cur)}\n` +
    `${t('Dollars')}: ${diffText(r.diff.USD, 'USD')} · ${t('Francs')}: ${diffText(r.diff.CDF, 'CDF')}\n` +
    t('Closed by {name}', { name: r.by }) + (r.note ? `\n${r.note}` : '');
}
function closingForm() {
  const d0 = today(), mc = S.settings.mainCur, st = stats(d0, mc), bal = balances(), done = closedOn(d0);
  openModal(t('Close the day'), `
    ${done ? note('checkc', 'green', t('Already closed today by {name}. Closing again replaces it.', { name: esc(done.by) })) : ''}
    <div class="g2" style="gap:10px;margin-bottom:16px">
      <div class="card kpi" style="padding:14px;box-shadow:none"><div class="lbl"><span class="ki t-pri">${ic('cart', 'sm')}</span>${t('Sales today')}</div><div class="val" style="font-size:20px;margin:10px 0 0">${fmt(st.revenue, mc)}</div><div class="ft"><span>${t('{n} sale|{n} sales', { n: st.count })}</span></div></div>
      <div class="card kpi" style="padding:14px;box-shadow:none"><div class="lbl"><span class="ki t-green">${ic('coins', 'sm')}</span>${t('Profit today')}</div><div class="val" style="font-size:20px;margin:10px 0 0">${fmt(st.profit, mc)}</div><div class="ft"><span>${t('Money in')} ${fmt(st.in, mc)}</span></div></div>
    </div>
    ${note('info', 'pri', t('Count the cash in the till and type it. The app compares it with what was recorded today.'))}
    <div class="row2 keep">${fld(t('Dollars counted'), money('usd', '', 'USD', `placeholder="${rnd(bal.USD.cash, 'USD')}"`))}${fld(t('Francs counted'), money('cdf', '', 'CDF', `placeholder="${rnd(bal.CDF.cash, 'CDF')}"`))}</div>
    ${fld(t('Note'), inp('note', '', `placeholder="${esc(t('e.g. power cut in the afternoon'))}"`))}
    ${can('approve') ? `<label class="check"><input type="checkbox" name="fix" value="1"><span>${t('Adjust the till with the difference')}<small>${t('Adds a “cash difference” income or expense')}</small></span></label>` : ''}`,
  f => {
    const r = closingCompute({ USD: f.usd, CDF: f.cdf }); r.note = (f.note || '').trim();
    if (f.fix) for (const c of ['USD', 'CDF']) if (r.diff[c]) S.tx.push({ id: uid(), type: r.diff[c] > 0 ? 'in' : 'out', date: nowISO(), amount: Math.abs(r.diff[c]), cur: c, rate: S.settings.rate, cat: r.diff[c] > 0 ? 'other_in' : 'other_out', method: 'cash', note: t('Cash difference (count)') });
    S.closings = (S.closings || []).filter(c => c.date !== r.date); S.closings.push(r);
    if (S.closings.length > 400) S.closings.splice(0, S.closings.length - 400);
    audit('closing', `${fmt(r.revenue, r.cur)} · $ ${diffText(r.diff.USD, 'USD')} · FC ${diffText(r.diff.CDF, 'CDF')}`);
    commit(); render(); closingResult(r); return false;
  }, { icon: 'moon', ok: t('Close the day'), okIcon: 'moon' });
}
function closingResult(r) {
  const text = closingText(r), ph = S.settings.ownerPhone, bad = ['USD', 'CDF'].some(c => r.diff[c] < 0);
  openModal(t('Day closed'), `
    ${bad ? note('alert', 'red', t('Cash is short. Count again, and check today’s expenses and sales.')) : note('checkc', 'green', t('The day is closed.'))}
    <pre class="ocr" style="white-space:pre-wrap;font-size:13px">${esc(text)}</pre>
    <div class="dlg-acts">${ph ? `<a class="btn pri" href="${waLink(ph, text)}" target="_blank" rel="noopener">${ic('chat')}<span>${t('Send to the owner')}</span></a>` : ''}${btn(t('Share'), 'closingShare', { icon: 'share', data: `data-text="${esc(text)}"` })}</div>
    ${ph ? '' : `<p class="muted xs" style="margin:10px 0 0">${t('Add the owner’s WhatsApp number in Settings to send this summary in one tap.')}</p>`}`, null, { icon: 'moon', tone: bad ? 'red' : 'green', sub: fday(r.date) });
}
function closingsCard() {
  const list = (S.closings || []).slice(-7).reverse();
  return card(t('Daily closings'), list.length ? `<div class="lst">${list.map(r => { const short = ['USD', 'CDF'].some(c => r.diff[c] < 0), counted = ['USD', 'CDF'].some(c => r.diff[c] != null); return `<button type="button" data-act="closingOpen" data-id="${r.id}"><span class="ai t-${short ? 'red' : counted ? 'green' : 'gray'}">${ic(short ? 'alert' : 'moon')}</span><span class="tx"><b>${fday(r.date)} · ${fmt(r.revenue, r.cur)}</b><p>${esc(r.by)} · $ ${diffText(r.diff.USD, 'USD')} · FC ${diffText(r.diff.CDF, 'CDF')}</p></span></button>`; }).join('')}</div>` : emptyBox('moon', t('No closing yet'), t('Close the day each evening: count the cash and send the summary to the owner.')), { sub: t('Last 7 days') });
}

/* ---------- 3. Order suggestions ---------- */
const orderPlan = () => mcOrderPlan(S, today());
function orderText(supplier, lines) {
  return t('Hello {s}, order from {biz}:', { s: supplier || '', biz: bizName() }).replace(' ,', ',') + '\n' + lines.map(x => `- ${x.qty} × ${x.name}`).join('\n') + '\n' + t('Thank you!');
}
function orderCard() {
  const plan = orderPlan(); if (!plan.length) return '';
  const lead = S.settings.leadDays ?? 2, cover = S.settings.coverDays ?? 7, own = can('cost');
  const groups = {}; plan.forEach(x => (groups[x.supplier || ''] = groups[x.supplier || ''] || []).push(x));
  const dl = x => x.daysLeft === Infinity ? '—' : x.daysLeft < 1 ? t('Today') : t('{n} day|{n} days', { n: Math.floor(x.daysLeft) });
  return `<section class="card p0 mt"><div class="card-h"><div><h3>${t('What to order')}</h3><p>${t('Enough for {c} days after a delivery of {l} days, from the sales of the last 14 days', { c: cover, l: lead })}</p></div></div>
    ${table([{ l: t('Product') }, { l: t('Sold per day'), c: 'n hide-s' }, { l: t('Stock left') }, { l: t('Order'), c: 'n' }, ...(own ? [{ l: t('Cost'), c: 'n hide-s' }] : [])],
      plan.map(x => ({ act: 'productOpen', id: x.pid, cells: [`<div class="who"><span class="av sq t-${x.urgent ? 'red' : 'amber'}">${ic('package', 'sm')}</span><div><b>${esc(x.name)}</b><small>${esc(x.supplier || t('No supplier'))}</small></div></div>`, NF1.format(x.perDay), pill(`${x.stock} · ${x.stock <= (prod(x.pid)?.min || 0) ? t('below minimum') : dl(x)}`, x.urgent ? 'red' : 'amber'), `<b>${x.qty}</b>${x.pack > 1 ? ` <small class="muted">(${x.qty / x.pack} × ${x.pack})</small>` : ''}`, ...(own ? [fmt(x.qty * x.cost, x.cur)] : [])] })))}
    <div style="display:flex;gap:8px;flex-wrap:wrap;padding:14px 22px 18px">${Object.keys(groups).map(s => btn(s ? t('Order from {s}', { s }) : t('Send the order'), 'orderSend', { cls: 'soft', icon: 'chat', data: `data-s="${esc(s)}"` })).join('')}</div></section>`;
}
function orderSend(supplier) {
  const lines = orderPlan().filter(x => (x.supplier || '') === supplier), text = orderText(supplier, lines);
  const phone = (S.contacts.find(c => c.name.toLowerCase() === supplier.toLowerCase()) || {}).phone;
  audit('order_sent', `${supplier || '—'} · ${lines.map(x => `${x.qty} × ${x.name}`).join(', ')}`);
  commit();
  if (phone) { window.open(waLink(phone, text), '_blank', 'noopener'); return; }
  shareOrCopy(text);
}
async function shareOrCopy(text) {
  if (navigator.share) { try { await navigator.share({ text }); } catch { } return; }
  try { await navigator.clipboard.writeText(text); toast(t('Copied: paste it in WhatsApp or SMS'), 'ok'); } catch { toast(t('Sharing is not available on this device'), 'bad'); }
}

/* ---------- 4. Phone notifications ---------- */
const notifyOk = () => 'Notification' in window && 'serviceWorker' in navigator && location.protocol !== 'file:';
const notifyState = () => !notifyOk() ? 'unsupported' : Notification.permission === 'denied' ? 'blocked' : S.settings.notify && Notification.permission === 'granted' ? (S.settings.notifyBg ? 'on' : 'open') : 'off';
async function notifySetup() {
  if (!notifyOk()) return toast(t('This phone or browser cannot show notifications'), 'bad');
  const p = await Notification.requestPermission();
  if (p !== 'granted') { toast(t('Notifications are blocked. Allow them for this app in the phone settings.'), 'bad'); render(); return; }
  let bg = false;
  try {
    const reg = await navigator.serviceWorker.ready;
    if ('periodicSync' in reg) {
      const st = await navigator.permissions.query({ name: 'periodic-background-sync' });
      if (st.state === 'granted') { await reg.periodicSync.register('mc-daily', { minInterval: 12 * 3600e3 }); bg = true; }
    }
  } catch (e) { console.warn('periodic sync', e); }
  S.settings.notify = true; S.settings.notifyBg = bg;
  audit('settings', t('Phone notifications') + ': ' + (bg ? t('On') : t('when the app is open'))); await commit(); render();
  toast(bg ? t('Notifications on, also when the app is closed') : t('Notifications on while the app is open. Install the app on the phone for notifications when it is closed.'), 'ok');
}
async function notifyCheck(force) {
  if (notifyState() === 'off' || notifyState() === 'blocked' || notifyState() === 'unsupported') return false;
  await commit();
  const reg = await navigator.serviceWorker.ready.catch(() => null);
  if (!reg || !reg.active) return false;
  reg.active.postMessage({ type: 'mc-check', force: !!force, hour: new Date().getHours() });
  return true;
}
function automationCard() {
  const st = notifyState(), s = S.settings;
  const label = { on: [t('On, also when the app is closed'), 'green'], open: [t('On while the app is open'), 'amber'], off: [t('Off'), 'gray'], blocked: [t('Blocked in the phone settings'), 'red'], unsupported: [t('Not available on this device'), 'gray'] }[st];
  const autoN = S.reminders.filter(r => r.auto && !r.done).length;
  return card(t('Automation'), `<table class="kv">
      <tr><td>${t('Phone notifications')}</td><td>${pill(label[0], label[1])}</td></tr>
      <tr><td>${t('Automatic payments')}</td><td>${t('{n} active|{n} active', { n: autoN })} · <a href="#/rappels">${t('Reminders')}</a></td></tr></table>
    <p class="muted xs" style="margin:10px 0 0">${t('Once a day: late credits, payments due, stock to order, a day not closed.')}</p>
    <div class="row2 keep" style="margin-top:14px">
      <label class="f"><span>${t('Close the day at')}</span><select class="inp" data-chg="closeHour">${[16, 17, 18, 19, 20, 21, 22].map(h => `<option value="${h}" ${h === (s.closeHour ?? 18) ? 'selected' : ''}>${h}:00</option>`).join('')}</select></label>
      <label class="f"><span>${t('Delivery takes')}</span><select class="inp" data-chg="leadDays">${[1, 2, 3, 5, 7, 14].map(d => `<option value="${d}" ${d === (s.leadDays ?? 2) ? 'selected' : ''}>${t('{n} day|{n} days', { n: d })}</option>`).join('')}</select></label>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">${st === 'off' || st === 'open' ? btn(st === 'off' ? t('Turn on notifications') : t('Try again for closed app'), 'notifySetup', { cls: 'pri', icon: 'bell' }) : ''}${st === 'on' || st === 'open' ? btn(t('Send a test'), 'notifyTest', { icon: 'bell' }) : ''}</div>`, { sub: t('What the app does by itself') });
}

const autoAct = {
  closeDay: () => closingForm(),
  closingOpen: el => { const r = (S.closings || []).find(x => x.id === el.dataset.id); if (r) closingResult(r); },
  closingShare: el => shareOrCopy(el.dataset.text),
  orderSend: el => orderSend(el.dataset.s || ''),
  salariesAuto: () => needOwner(t('Automatic salaries'), salariesAuto),
  notifySetup: () => notifySetup(),
  notifyTest: async () => { if (await notifyCheck(true)) toast(t('Test sent: look at the phone’s notifications'), 'ok'); else toast(t('This phone or browser cannot show notifications'), 'bad'); }
};

/* When the app comes back to the screen: record due payments. In the background: let the service worker check. */
document.addEventListener('visibilitychange', () => {
  if (typeof S === 'undefined' || !S.reminders) return;
  if (document.visibilityState === 'visible') { if (runAutoPayments().length) render(); }
  else notifyCheck(false);
});
setInterval(() => { if (typeof S !== 'undefined' && S.reminders && runAutoPayments().length) render(); }, 10 * 60000);
