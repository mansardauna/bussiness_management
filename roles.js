'use strict';
/* =====================================================================
   Ma Caisse — home screen of each role.
   Owner & manager: the business dashboard (vDash). Others get the screen made for their job:
   sales staff → My shift · store manager → Stock overview · accountant → Money overview · auditor → Audit overview.
   Depends on core.js, security.js, auto.js, app.js (helpers) at run time.
   ===================================================================== */

function vHome() {
  const r = me()?.role;
  if (!teamOn() || !r || r === 'owner' || r === 'manager') return vDash();
  return ({ cashier: vShift, stock: vStockHome, accountant: vMoneyHome, auditor: vAuditHome }[r] || vDash)();
}
const homeHead = (sub, acts = '') => ph(t('Hello {name}', { name: esc(me()?.name || '') }), `${roleBadge(me())} <span>${cap(fdateLong(today()))}${sub ? ' · ' + sub : ''}</span>`, acts);
const tile = (href, act, icon, tone, label, data = '') => href ? `<a href="${href}"><span class="qi t-${tone}">${ic(icon)}</span>${label}</a>` : (allowedAct(act) ? `<button type="button" data-act="${act}" ${data}><span class="qi t-${tone}">${ic(icon)}</span>${label}</button>` : '');
const sumIn = (list, mc) => sum(list.map(s => conv(s.total, s.cur, mc, s.rate)));

/* ---------- Sales staff: My shift ---------- */
function vShift() {
  const d0 = today(), mc = S.settings.mainCur, uid_ = SESSION.uid, bal = balances(), closed = closedOn(d0);
  const todays = S.sales.filter(s => !s.void && s.date.startsWith(d0)), mine = todays.filter(s => s.by === uid_);
  const due = CR().filter(c => c.kind === 'client' && creditLeft(c) > 0 && c.due && c.due <= d0);
  const recent = (mine.length ? mine : todays).slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
  return homeHead(closed ? t('Day closed') : '', `<a class="btn pri lg" href="#/vente">${ic('cart')}<span>${t('New sale')}</span></a>`) + `
  <div class="g4">
    ${kpi({ label: t('My sales today'), icon: 'cart', tone: 'pri', value: fmt(sumIn(mine, mc), mc), sub: t('{n} sale|{n} sales', { n: mine.length }), active: true })}
    ${kpi({ label: t('Shop sales today'), icon: 'store', tone: 'blue', value: fmt(sumIn(todays, mc), mc), sub: t('{n} sale|{n} sales', { n: todays.length }) })}
    ${kpi({ label: t('Cash in the till'), icon: 'cash', tone: 'teal', value: fmt(bal.USD.cash, 'USD'), sub: fmt(bal.CDF.cash, 'CDF') })}
    ${kpi({ label: t('Credits to collect'), icon: 'book', tone: due.length ? 'amber' : 'gray', value: due.length, sub: t('due today or late'), act: 'go', data: 'data-to="#/credits"' })}
  </div>
  <div class="gm mt">
    <section class="card p0"><div class="card-h"><div><h3>${mine.length ? t('My sales today') : t('Sales today')}</h3><p>${t('{n} sale|{n} sales', { n: recent.length })}</p></div></div>
      ${table([{ l: t('Customer') }, { l: t('Time'), c: 'w' }, { l: t('Payment'), c: 'hide-s' }, { l: t('Amount'), c: 'n' }, { l: t('Status') }],
        recent.map(s => ({ act: 'saleOpen', id: s.id, cells: [who(custName(s.client), t('Receipt {no}', { no: s.no })), s.date.slice(11, 16), mTag(s.total - s.paid > 0 && !s.paid ? 'credit' : s.method), `<b>${fmt(s.total, s.cur)}</b>`, saleStatus(s)] })),
        emptyBox('receipt', t('No sales yet today'), t('Tap New sale to start.'), `<a class="btn pri" href="#/vente">${ic('cart')}<span>${t('New sale')}</span></a>`))}
    </section>
    <div class="stack">
      ${card(t('Quick actions'), `<div class="qa">${tile('#/vente', '', 'cart', 'pri', t('Sell'))}${tile('#/credits', '', 'book', 'amber', t('Customer pays'))}${tile('', 'bottleReturn', 'bottle', 'teal', t('Empties returned'))}${tile('', 'newTx', 'out', 'red', t('Expense'), 'data-type="out"')}${tile('#/scanner', '', 'scan', 'blue', t('Scan'))}${tile('', 'closeDay', 'moon', 'pri', closed ? t('Day closed') : t('Close the day'))}</div>`)}
      ${card(t('Customers to call'), due.length ? `<div class="lst">${due.slice(0, 6).map(c => `<button type="button" data-act="creditOpen" data-id="${c.id}">${av(c.name)}<span class="tx"><b>${esc(c.name)} · ${fmt(creditLeft(c), c.cur)}</b><p>${c.due < d0 ? t('{n} d late', { n: daysBetween(c.due, d0) }) : t('Due today')}</p></span>${ic('right', 'sm')}</button>`).join('')}</div>` : emptyBox('checkc', t('Nobody to call today'), '', '', 'green'))}
    </div>
  </div>`;
}

/* ---------- Store manager: Stock overview ---------- */
function vStockHome() {
  const mc = S.settings.mainCur, list = S.products.filter(p => !p.archived), plan = orderPlan(), urgent = plan.filter(x => x.urgent);
  const value = sum(list.map(p => conv(Math.max(0, p.stock) * (p.cost || 0), p.cur, mc))), empties = sum(list.filter(p => p.bottle).map(p => p.empties || 0));
  const moves = S.stockLog.filter(l => l.reason !== 'sale').slice(-10).reverse();
  return homeHead('', btn(t('Add a product'), 'newProduct', { cls: 'pri', icon: 'plus' })) + `
  <div class="g4">
    ${kpi({ label: t('To reorder'), icon: 'alert', tone: urgent.length ? 'red' : 'gray', value: urgent.length, sub: t('{n} more to plan', { n: plan.length - urgent.length }), active: true })}
    ${kpi({ label: t('Products'), icon: 'package', tone: 'pri', value: list.length, sub: t('{n} category|{n} categories', { n: new Set(list.map(p => p.cat).filter(Boolean)).size }), act: 'go', data: 'data-to="#/produits"' })}
    ${kpi({ label: t('Stock value'), icon: 'layers', tone: 'blue', value: fmt(value, mc), sub: t('at cost price') })}
    ${kpi({ label: t('Empties at the depot'), icon: 'bottle', tone: 'teal', value: empties, sub: t('to return to the supplier'), act: 'go', data: 'data-to="#/emballages"' })}
  </div>
  ${orderCard() || card('', emptyBox('checkc', t('Nothing to order'), t('Every product has enough stock for the coming days.'), '', 'green'), { cls: 'mt' })}
  <div class="gm mt">
    <section class="card p0"><div class="card-h"><div><h3>${t('Stock movements')}</h3><p>${t('Deliveries, counts and losses')}</p></div></div>
      ${table([{ l: t('Product') }, { l: t('Date'), c: 'w' }, { l: t('Reason') }, { l: t('Quantity'), c: 'n' }],
        moves.map(l => { const p = prod(l.pid); return { act: p ? 'productOpen' : '', id: l.pid, cells: [iconWho(l.delta < 0 ? 'out' : 'in', l.delta < 0 ? 'red' : 'green', p ? p.name : '?'), fdate(l.date), esc(reasonName(l)), `<b class="${l.delta < 0 ? 'neg' : 'pos'}">${l.delta > 0 ? '+' : ''}${l.delta}</b>`] }; }),
        emptyBox('package', t('No movements yet'), t('Deliveries and stock counts appear here.')))}
    </section>
    ${card(t('Quick actions'), `<div class="qa">${tile('#/produits', '', 'plus', 'green', t('Receive a delivery'))}${tile('#/produits', '', 'calculator', 'amber', t('Stock count'))}${tile('', 'newProduct', 'package', 'pri', t('New product'))}${tile('', 'bottleSupplier', 'truck', 'teal', t('Return to supplier'))}${tile('#/emballages', '', 'bottle', 'blue', t('Packaging'))}${tile('#/scanner', '', 'scan', 'gray', t('Scan'))}</div><p class="muted xs" style="margin:12px 0 0">${t('To receive a delivery or count a product: open it in Products.')}</p>`)}
  </div>`;
}

/* ---------- Accountant: Money overview ---------- */
function vMoneyHome() {
  const mc = S.settings.mainCur, d0 = today(), m = d0.slice(0, 7), bal = balances(), st = stats(m, mc);
  const owed = sum(CR().filter(c => c.kind === 'client' && creditLeft(c) > 0).map(c => conv(creditLeft(c), c.cur, mc)));
  const unpaid = INV().filter(f => invLeft(f) > 0), debts = CR().filter(c => c.kind === 'fournisseur' && creditLeft(c) > 0);
  const coming = [
    ...S.reminders.filter(r => !r.done && r.amount > 0 && r.date <= addDays(d0, 30)).map(r => ({ date: r.date, title: r.title, amount: r.amount, cur: r.cur, auto: r.auto, to: '#/rappels' })),
    ...debts.filter(c => c.due && c.due <= addDays(d0, 30)).map(c => ({ date: c.due, title: c.name, amount: creditLeft(c), cur: c.cur, to: '#/credits' }))
  ].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 8);
  return homeHead('', btn(t('Expense'), 'newTx', { icon: 'out', data: 'data-type="out"' }) + btn(t('Income'), 'newTx', { cls: 'pri', icon: 'in', data: 'data-type="in"' })) + `
  <div class="g4">
    ${kpi({ label: t('Dollar balance'), icon: 'dollar', tone: 'blue', value: fmt(bal.USD.total, 'USD'), vcls: bal.USD.total < 0 ? 'neg' : '', sub: t('all tills'), active: true, act: 'go', data: 'data-to="#/caisse"' })}
    ${kpi({ label: t('Franc balance'), icon: 'cash', tone: 'teal', value: fmt(bal.CDF.total, 'CDF'), vcls: bal.CDF.total < 0 ? 'neg' : '', sub: t('all tills'), act: 'go', data: 'data-to="#/caisse"' })}
    ${kpi({ label: t('Money in this month'), icon: 'in', tone: 'green', value: fmt(st.in, mc), sub: t('Net profit') + ' ' + fmt(st.profit, mc) })}
    ${kpi({ label: t('Money out this month'), icon: 'out', tone: 'red', value: fmt(st.out, mc), sub: t('Expenses') + ' ' + fmt(st.charges, mc) })}
  </div>
  <div class="g3 mt">
    ${kpi({ label: t('Customers owe'), icon: 'book', tone: 'amber', value: fmt(owed, mc), act: 'go', data: 'data-to="#/credits"' })}
    ${kpi({ label: t('Unpaid invoices'), icon: 'file', tone: unpaid.length ? 'amber' : 'gray', value: fmt(sum(unpaid.map(f => conv(invLeft(f), f.cur, mc))), mc), sub: t('{n} invoice|{n} invoices', { n: unpaid.length }), act: 'go', data: 'data-to="#/factures"' })}
    ${kpi({ label: t('We owe suppliers'), icon: 'tag', tone: debts.length ? 'red' : 'gray', value: fmt(sum(debts.map(c => conv(creditLeft(c), c.cur, mc))), mc), sub: t('{n} debt|{n} debts', { n: debts.length }) })}
  </div>
  <div class="gm mt">
    ${card(t('Payments coming'), coming.length ? `<div class="lst">${coming.map(x => `<a href="${x.to}"><span class="ai t-${x.date < d0 ? 'red' : x.auto ? 'blue' : 'amber'}">${ic(x.auto ? 'refresh' : 'calendar')}</span><span class="tx"><b>${esc(x.title)} · ${fmt(x.amount, x.cur)}</b><p>${fday(x.date)}${x.auto ? ' · ' + t('Automatic') : ''}</p></span>${ic('right', 'sm')}</a>`).join('')}</div>` : emptyBox('calendar', t('Nothing in the next 30 days')), { sub: t('Next 30 days: reminders, automatic payments, supplier debts') })}
    ${card(t('Where the money goes'), hbars(st.byOut, mc, 'out'), { sub: MONTHS[+m.slice(5) - 1] })}
  </div>
  ${card(t('Quick actions'), `<div class="qa">${tile('', 'newTx', 'in', 'green', t('Income'), 'data-type="in"')}${tile('', 'newTx', 'out', 'red', t('Expense'), 'data-type="out"')}${tile('', 'newInvoice', 'file', 'pri', t('New invoice'))}${tile('#/personnel', '', 'users', 'blue', t('Pay the staff'))}${tile('', 'cashCount', 'calculator', 'amber', t('Count'))}${tile('#/rapports', '', 'chart', 'teal', t('Reports'))}</div>`, { cls: 'mt' })}`;
}

/* ---------- Auditor: Audit overview (read only) ---------- */
function vAuditHome() {
  const mc = S.settings.mainCur, d0 = today(), m = d0.slice(0, 7), month = S.audit.filter(x => x.at.startsWith(m));
  const voids = month.filter(x => /void|remove/.test(x.a)), discSales = S.sales.filter(s => !s.void && s.discount > 0 && s.date.startsWith(m));
  const closings = (S.closings || []).filter(c => c.date.startsWith(m)), short = sum(closings.map(c => Math.max(0, -(c.diff.USD || 0)) + conv(Math.max(0, -(c.diff.CDF || 0)), 'CDF', 'USD')));
  const notClosed = []; for (let i = 1; i <= 14; i++) { const d = addDays(d0, -i); if (S.sales.some(s => !s.void && s.date.startsWith(d)) && !closedOn(d)) notClosed.push(d); }
  const sensitive = S.audit.filter(x => /void|remove|_edit|adjust|denied|reset|restore|user_|due|cash_count|closing/.test(x.a)).slice(-12).reverse();
  return homeHead(t('Read only'), btn(t('Activity log'), 'go', { cls: 'pri', icon: 'clock', data: 'data-to="#/journal"' })) + `
  ${note('eye', 'pri', t('You can see everything but change nothing. Every action of the team is in the activity log.'))}
  <div class="g4">
    ${kpi({ label: t('Voids & deletions'), icon: 'trash', tone: voids.length ? 'red' : 'gray', value: voids.length, sub: t('this month'), active: true, act: 'go', data: 'data-to="#/journal"' })}
    ${kpi({ label: t('Discounts given'), icon: 'percent', tone: discSales.length ? 'amber' : 'gray', value: fmt(sum(discSales.map(s => conv(s.discount, s.cur, mc, s.rate))), mc), sub: t('{n} sale|{n} sales', { n: discSales.length }) })}
    ${kpi({ label: t('Cash short at closing'), icon: 'alert', tone: short ? 'red' : 'green', value: fmt(short, 'USD'), sub: t('{n} closing|{n} closings', { n: closings.length }) })}
    ${kpi({ label: t('Days not closed'), icon: 'moon', tone: notClosed.length ? 'amber' : 'green', value: notClosed.length, sub: t('last 14 days') })}
  </div>
  <div class="gm mt">
    <section class="card p0"><div class="card-h"><div><h3>${t('Sensitive actions')}</h3><p>${t('Voids, deletions, edits, counts and approvals')}</p></div><div class="tools"><a class="btn sm" href="#/journal">${t('View all')} ${ic('right', 'sm')}</a></div></div>
      ${table([{ l: t('When'), c: 'w' }, { l: t('Who') }, { l: t('Action') }, { l: t('Details'), c: 'hide-s' }, { l: t('Approved by') }],
        sensitive.map(x => { const [l, i] = ACTIONS[x.a] || [x.a, 'info']; return { cells: [fdate(x.at), who(x.by), iconWho(i, ACT_TONE(x.a), t(l)), esc(x.d) || '—', x.ap ? pill(esc(x.ap), 'green') : '—'] }; }),
        emptyBox('checkc', t('Nothing sensitive yet'), '', '', 'green'))}
    </section>
    <div class="stack">
      ${card(t('Closings this month'), closings.length ? `<div class="lst">${closings.slice(-6).reverse().map(c => { const bad = ['USD', 'CDF'].some(k => c.diff[k] < 0); return `<button type="button" data-act="closingOpen" data-id="${c.id}"><span class="ai t-${bad ? 'red' : 'green'}">${ic(bad ? 'alert' : 'moon')}</span><span class="tx"><b>${fday(c.date)} · ${esc(c.by)}</b><p>$ ${diffText(c.diff.USD, 'USD')} · FC ${diffText(c.diff.CDF, 'CDF')}</p></span></button>`; }).join('')}</div>` : emptyBox('moon', t('No closing yet')))}
      ${notClosed.length ? card(t('Days not closed'), `<p class="muted sm" style="margin:0">${notClosed.map(fday).join(' · ')}</p>`) : ''}
      ${card(t('Reports'), `<div class="qa">${tile('#/rapports', '', 'chart', 'pri', t('Reports'))}${tile('#/dash', '', 'dashboard', 'blue', t('Dashboard'))}${tile('', 'exportCSV', 'download', 'green', 'Excel')}</div>`)}
    </div>
  </div>`;
}
