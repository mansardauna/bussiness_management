'use strict';
/* =====================================================================
   Ma Caisse — screens, actions and router (depends on core.js, i18n.js)
   Every visible text goes through t() so the app works in EN / FR / ES.
   ===================================================================== */

/* ---------- Statuses ---------- */
const saleStatus = s => s.void ? pill(t('Voided'), 'gray') : s.total - s.paid > 0 && s.method === 'ifb' ? pill(t('Waiting for IFB'), 'amber') : s.total - s.paid > 0 ? (s.paid > 0 ? pill(t('Partial'), 'amber') : pill(t('Credit'), 'amber')) : pill(t('Paid'), 'green');
function creditStatus(c) {
  const left = creditLeft(c), d = today();
  if (left <= 0) return pill(t('Settled'), 'green');
  if (c.due && c.due < d) return pill(t('{n} d late', { n: daysBetween(c.due, d) }), 'red');
  if (c.due && c.due <= addDays(d, 2)) return pill(t('Due soon'), 'amber');
  return pill(t('Open'), 'pri');
}
const nItemsTxt = n => t('{n} item|{n} items', { n });

/* =====================================================================
   DASHBOARD
   ===================================================================== */
function vDash() {
  const s = S.settings, mc = s.mainCur, d0 = today();
  const bal = balances(), { now: mo, prev: pm } = monthCompare(mc), d = stats(d0, mc), yd = stats(addDays(d0, -1), mc);
  const totalMain = conv(bal.USD.total, 'USD', mc) + conv(bal.CDF.total, 'CDF', mc);
  const al = alerts();
  // Sales analysis
  let series = [];
  if (ui.dashRange === '12') { const [y, m] = d0.slice(0, 7).split('-').map(Number); for (let k = 11; k >= 0; k--) { let mm = m - k, yy = y; while (mm < 1) { mm += 12; yy--; } series.push({ l: MONTHS[mm - 1] + ' ' + yy, s: MON3[mm - 1], v: stats(`${yy}-${z(mm)}`, mc).revenue }); } }
  else { const n = +ui.dashRange; for (let k = n - 1; k >= 0; k--) { const dd = addDays(d0, -k), x = dt(dd); series.push({ l: fdateLong(dd), s: n <= 7 ? DAYS[x.getDay()].slice(0, 3) : String(x.getDate()), v: stats(dd, mc).revenue }); } }
  // Performance by weekday (last 4 weeks)
  const wd = Array(7).fill(0), from = addDays(d0, -27);
  for (const sl of S.sales) if (!sl.void && sl.date.slice(0, 10) >= from) wd[dt(sl.date).getDay()] += conv(sl.total, sl.cur, mc, sl.rate);
  const perf = [1, 2, 3, 4, 5, 6, 0].map(i => ({ l: DAYS[i], s: DAYS[i].slice(0, 3), v: wd[i] / 4 }));
  const recent = [...S.sales].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  const first = !S.products.length && !TX().length;
  return `
  ${ph(t('Dashboard'), cap(fdateLong(d0)), btn(t('Expense'), 'newTx', { icon: 'out', data: 'data-type="out"' }) + btn(t('Income'), 'newTx', { icon: 'in', data: 'data-type="in"' }) + `<a class="btn pri" href="#/vente">${ic('plus')}<span>${t('New sale')}</span></a>`)}
  ${first ? `<div class="card mt" style="margin:0 0 18px;display:flex;gap:16px;align-items:center;flex-wrap:wrap;background:linear-gradient(120deg,#F1F1FD,#fff)"><span class="av sq lg t-pri">${ic('sparkles')}</span><div style="flex:1;min-width:200px"><b style="font-size:16px">${t('Welcome to Ma Caisse')}</b><p class="muted sm" style="margin:4px 0 0">${t('Add your products, then record every sale and every expense. You can also load sample data to practise.')}</p></div><div class="acts" style="display:flex;gap:8px;flex-wrap:wrap">${btn(t('Sample data'), 'demo', { icon: 'flask' })}<a class="btn pri" href="#/produits">${ic('plus')}<span>${t('Add a product')}</span></a></div></div>` : ''}
  ${!first && !teamOn() && !S.settings.teamHintOff ? accountCard(true) : ''}
  <div class="g4">
    ${kpi({ label: t('Dollar balance'), icon: 'dollar', tone: 'blue', value: fmt(bal.USD.total, 'USD'), vcls: bal.USD.total < 0 ? 'neg' : '', sub: t('Cash {a}', { a: fmt(bal.USD.cash, 'USD') }), active: true, act: 'go', data: 'data-to="#/caisse"' })}
    ${kpi({ label: t('Franc balance'), icon: 'cash', tone: 'teal', value: fmt(bal.CDF.total, 'CDF'), vcls: bal.CDF.total < 0 ? 'neg' : '', sub: t('Cash {a}', { a: fmt(bal.CDF.cash, 'CDF') }), act: 'go', data: 'data-to="#/caisse"' })}
    ${kpi({ label: t('Sales this month'), icon: 'cart', tone: 'pri', value: fmt(mo.revenue, mc), trend: trendChip(mo.revenue, pm.revenue), sub: `<span class="hide-s">${t('vs last month')}</span>`, act: 'go', data: 'data-to="#/rapports"' })}
    ${kpi({ label: t('Profit this month'), icon: 'coins', tone: mo.profit < 0 ? 'red' : 'green', value: fmt(mo.profit, mc), vcls: mo.profit < 0 ? 'neg' : '', trend: trendChip(mo.profit, pm.profit), sub: `<span class="hide-s">${t('margin {p}', { p: pct(mo.margin * 100) })}</span>`, act: 'go', data: 'data-to="#/rapports"' })}
  </div>
  <p class="muted sm" style="margin:12px 2px 0;display:flex;gap:6px;align-items:center;flex-wrap:wrap">${ic('wallet', 'sm')} ${t('Total in hand')} ≈ <b style="color:var(--ink)">${fmt(totalMain, mc)}</b> · ${t('Rate')} 1 $ = ${NF0.format(s.rate)} FC · <a href="#/params">${t('Change rate')}</a></p>

  <div class="gm mt">
    ${card(t('Sales analysis'), lineChart('dash', series, mc), { sub: `${t('Revenue · today {a}', { a: fmt(d.revenue, mc) })} ${d.revenue || yd.revenue ? trendChip(d.revenue, yd.revenue) : ''}`, tools: segTabs('dashRange', [['7', t('7 days')], ['30', t('30 days')], ['12', t('12 months')]]) })}
    ${card(t('Performance'), barChart(perf, mc), { sub: t('Average sales by day of the week') })}
  </div>

  <div class="gm mt">
    <section class="card p0"><div class="card-h"><div><h3>${t('Latest sales')}</h3><p>${t('{n} sale this month|{n} sales this month', { n: mo.count })}</p></div><div class="tools"><a class="btn sm" href="#/vente" data-act="tab" data-k="venteTab" data-v="recus">${t('View all')} ${ic('right', 'sm')}</a></div></div>
    ${table([{ l: t('Customer') }, { l: t('Date'), c: 'w' }, { l: t('Payment'), c: 'hide-s' }, { l: t('Amount'), c: 'n' }, { l: t('Status') }],
      recent.map(sl => ({ act: 'saleOpen', id: sl.id, cells: [who(custName(sl.client), t('Receipt {no}', { no: sl.no }) + ' · ' + nItemsTxt(sum(sl.items.map(i => i.qty)))), fshort(sl.date), sl.total - sl.paid > 0 && !sl.paid ? mTag('credit') : mTag(sl.method), `<b>${fmt(sl.total, sl.cur)}</b>`, saleStatus(sl)] })),
      emptyBox('receipt', t('No sales yet'), t('Sales recorded at the point of sale will appear here.'), `<a class="btn pri" href="#/vente">${ic('cart')}<span>${t('Make a sale')}</span></a>`))}
    </section>
    <div class="stack">
      ${card(t('Quick actions'), `<div class="qa">
        <a href="#/vente"><span class="qi t-pri">${ic('cart')}</span>${t('Sell')}</a>
        <button type="button" data-act="newTx" data-type="in"><span class="qi t-green">${ic('in')}</span>${t('Income')}</button>
        <button type="button" data-act="newTx" data-type="out"><span class="qi t-red">${ic('out')}</span>${t('Expense')}</button>
        <button type="button" data-act="newCredit" data-kind="client"><span class="qi t-amber">${ic('book')}</span>${t('Credit')}</button>
        <a href="#/scanner"><span class="qi t-blue">${ic('scan')}</span>${t('Scan')}</a>
        <button type="button" data-act="exchange"><span class="qi t-teal">${ic('exchange')}</span>${t('Exchange')}</button></div>`)}
      ${card(t('To do'), al.length ? `<div class="lst">${al.slice(0, 5).map(alertRow).join('')}</div>${al.length > 5 ? `<button type="button" class="btn sm block mt" data-act="showAlerts">${t('View all {n} alerts', { n: al.length })}</button>` : ''}` : emptyBox('checkc', t('All good'), t('No overdue credit, no reminders, stock is fine.'), '', 'green'), { sub: al.length ? t('{n} item needs your attention|{n} items need your attention', { n: al.length }) : '' })}
    </div>
  </div>`;
}
const alertRow = a => `<a href="${a.to}" data-act="closeModal"><span class="ai t-${a.t}">${ic(a.i)}</span><span class="tx"><b>${a.title}</b>${a.d ? `<p>${a.d}</p>` : ''}</span>${ic('right', 'sm')}</a>`;
function alerts() {
  const out = [], d0 = today(), mc = S.settings.mainCur;
  const names = l => [...new Set(l.map(c => esc(c.name)))].slice(0, 3).join(', ');
  const cl = CR().filter(c => c.kind === 'client' && creditLeft(c) > 0);
  const late = cl.filter(c => c.due && c.due < d0);
  if (late.length) out.push({ t: 'red', i: 'clock', title: t('{n} overdue customer credit|{n} overdue customer credits', { n: late.length }), d: t('Total {a} · send a reminder', { a: fmt(sum(late.map(c => conv(creditLeft(c), c.cur, mc))), mc) }), to: '#/credits' });
  const soon = cl.filter(c => c.due && c.due >= d0 && c.due <= addDays(d0, 2));
  if (soon.length) out.push({ t: 'amber', i: 'book', title: t('{n} credit to collect soon|{n} credits to collect soon', { n: soon.length }), d: names(soon), to: '#/credits' });
  const debts = CR().filter(c => c.kind === 'fournisseur' && creditLeft(c) > 0 && c.due && c.due <= addDays(d0, 3));
  if (debts.length) out.push({ t: 'red', i: 'tag', title: t('{n} supplier debt to pay|{n} supplier debts to pay', { n: debts.length }), d: names(debts), to: '#/credits' });
  S.reminders.filter(r => !r.done && r.date <= addDays(d0, 2)).forEach(r => out.push({ t: r.date < d0 ? 'red' : 'pri', i: 'bell', title: esc(r.title), d: (r.date < d0 ? t('Overdue · {d}', { d: fday(r.date) }) : t('Due {d}', { d: fday(r.date) })) + (r.amount ? ' · ' + fmt(r.amount, r.cur) : ''), to: '#/rappels' }));
  const low = orderPlan().filter(x => x.urgent);
  if (low.length) out.push({ t: 'amber', i: 'package', title: t('{n} product to reorder|{n} products to reorder', { n: low.length }), d: low.slice(0, 3).map(x => esc(x.name) + ' (' + x.stock + ')').join(', '), to: '#/produits' });
  const y = addDays(d0, -1), soldOn = d => S.sales.some(s => !s.void && s.date.startsWith(d));
  if (soldOn(y) && !closedOn(y)) out.push({ t: 'amber', i: 'moon', title: t('Yesterday was not closed'), d: fday(y), to: '#/caisse' });
  if (new Date().getHours() >= (S.settings.closeHour ?? 18) && soldOn(d0) && !closedOn(d0)) out.push({ t: 'pri', i: 'moon', title: t('Time to close the day'), d: t('Count the cash and send the summary'), to: '#/caisse' });
  const short = (S.closings || []).filter(c => c.date >= addDays(d0, -6) && ['USD', 'CDF'].some(k => c.diff[k] < 0));
  if ((can('approve') || can('audit')) && short.length) out.push({ t: 'red', i: 'alert', title: t('{n} closing with cash short this week|{n} closings with cash short this week', { n: short.length }), d: short.map(c => fday(c.date) + ' · ' + esc(c.by)).slice(0, 3).join(', '), to: '#/caisse' });
  const inv = INV().filter(f => invLeft(f) > 0 && f.due && f.due < d0);
  if (inv.length) out.push({ t: 'red', i: 'file', title: t('{n} overdue unpaid invoice|{n} overdue unpaid invoices', { n: inv.length }), to: '#/factures' });
  const un = ifbUnmatched();
  if (un.length) out.push({ t: 'amber', i: 'qr', title: t('{n} IFB payment to match|{n} IFB payments to match', { n: un.length }), d: un.slice(0, 3).map(x => esc(x.ifbRef || '—') + ' · ' + fmt(x.amount, 'USD')).join(', '), to: '#/caisse' });
  const lb = lastSafe();
  if (can('team') && cloudOn() && CLOUD.cfg.err && (!CLOUD.cfg.last || daysBetween(CLOUD.cfg.last, d0) >= 2)) out.push({ t: 'red', i: 'shield', title: t('Cloud backup is not working'), d: esc(CLOUD.cfg.err), to: '#/params' });
  if (can('backup') && TX().length > 5 && (!lb || daysBetween(lb, d0) >= 7)) out.push({ t: 'blue', i: 'shield', title: t('Make a backup'), d: lb ? t('Last one {d}', { d: fday(lb) }) : t('No backup yet'), to: '#/params' });
  return out;
}

/* =====================================================================
   POINT OF SALE
   ===================================================================== */
const cartCur = () => cart.cur || S.settings.mainCur;
function cartLines() {
  const cur = cartCur();
  return Object.entries(cart.items).filter(([id, q]) => q > 0 && prod(id)).map(([id, q]) => { const p = prod(id); const price = rnd(conv(p.price, p.cur, cur), cur); return { p, q, price, total: rnd(price * q, cur) }; });
}
function stockBadge(p) { const low = p.stock <= (p.min || 0); return `<span class="stk ${p.stock <= 0 ? 't-red' : low ? 't-amber' : 't-gray'}">${p.stock <= 0 ? t('Out of stock') : t('{n} in stock', { n: p.stock })}</span>`; }
const curSeg = (cur, act) => `<div class="seg">${['USD', 'CDF'].map(c => `<button type="button" class="${cur === c ? 'on' : ''}" data-act="${act}" data-v="${c}">${c === 'USD' ? '$ ' + t('Dollars') : 'FC ' + t('Francs')}</button>`).join('')}</div>`;
function vVente() {
  const tabsHTML = segTabs('venteTab', [['pos', t('Sell'), 'cart'], ['recus', t('Receipts'), 'receipt']]);
  if (!can('sell')) ui.venteTab = 'recus';
  if (ui.venteTab === 'recus') return ph(t('Point of sale'), t('Sales and receipts history'), tabsHTML) + receiptsList();
  const prods = S.products.filter(p => !p.archived).sort((a, b) => a.name.localeCompare(b.name));
  if (!prods.length) return ph(t('Point of sale'), '', tabsHTML) + card('', emptyBox('package', t('No products'), t('First add what you sell so you can take payments.'), btn(t('Add a product'), 'newProduct', { cls: 'pri', icon: 'plus' })));
  const cats = [...new Set(prods.map(p => p.cat).filter(Boolean))];
  const cur = cartCur(), lines = cartLines(), total = rnd(sum(lines.map(l => l.total)), cur), nItems = sum(lines.map(l => l.q));
  const shown = prods.filter(p => !ui.posCat || p.cat === ui.posCat);
  return ph(t('Point of sale'), t('Tap a product to add it to the cart'), tabsHTML) + `
  <div class="posg">
    <div>
      <div class="filters"><div class="search"><span>${ic('search', 'sm')}</span><input type="search" placeholder="${esc(t('Search a product'))}" data-inp="psearch"></div>
        ${curSeg(cur, 'cartCur')}</div>
      ${cats.length > 1 ? `<div class="chips"><button type="button" class="${!ui.posCat ? 'on' : ''}" data-act="posCat" data-v="">${t('All')}</button>${cats.map(c => `<button type="button" class="${ui.posCat === c ? 'on' : ''}" data-act="posCat" data-v="${esc(c)}">${esc(c)}</button>`).join('')}</div>` : ''}
      <div class="pgrid">${shown.map(p => { const q = cart.items[p.id] || 0; return `<button type="button" class="pc ${q ? 'in' : ''}" data-act="addCart" data-id="${p.id}" data-name="${esc(p.name.toLowerCase())}">
        <span class="th t-${tone(p.name)}">${ic(prodIcon(p), 'xl')}</span>
        <span class="nm">${esc(p.name)}</span>
        <span class="bt"><span class="pr">${fmt(rnd(conv(p.price, p.cur, cur), cur), cur)}</span>${stockBadge(p)}</span>${q ? `<span class="qb">${q}</span>` : ''}</button>`; }).join('')}</div>
    </div>
    <aside class="card cartp" id="cartp">
      <div class="card-h"><div><h3>${t('Cart')}</h3><p>${nItemsTxt(nItems)}</p></div>${lines.length ? `<div class="tools">${btn(t('Clear'), 'cartClear', { cls: 'sm ghost', icon: 'trash' })}</div>` : ''}</div>
      ${lines.length ? `<div>${lines.map(l => `<div class="cl">
          ${av(l.p.name, 'sq')}
          <div class="info"><b>${esc(l.p.name)}</b><small>${fmt(l.price, cur)} / ${esc(l.p.unit || t('unit'))}</small></div>
          <div class="step"><button type="button" data-act="cartQty" data-id="${l.p.id}" data-v="-1" aria-label="${esc(t('Less'))}">${ic('minus', 'sm')}</button><input inputmode="numeric" value="${l.q}" data-chg="cartSet" data-id="${l.p.id}" aria-label="${esc(t('Quantity'))}"><button type="button" data-act="cartQty" data-id="${l.p.id}" data-v="1" aria-label="${esc(t('More'))}">${ic('plus', 'sm')}</button></div>
          <span class="lt">${fmt(l.total, cur)}</span>
          ${l.p.bottle ? `<div class="ret">${ic('bottle', 'sm')} ${t('Empties returned')}<input inputmode="numeric" value="${cart.back[l.p.id] ?? l.q}" data-chg="cartBack" data-id="${l.p.id}" aria-label="${esc(t('Empties returned'))}"> / ${l.q}</div>` : ''}
        </div>`).join('')}</div>
        <div style="margin-top:14px"><div class="tr"><span>${t('Subtotal')}</span><b>${fmt(total, cur)}</b></div><div class="tr"><span>${t('Equivalent')}</span><b>${fmt(conv(total, cur, other(cur)), other(cur))}</b></div><div class="tr big"><span>${t('Total')}</span><b>${fmt(total, cur)}</b></div></div>
        <button type="button" class="btn pri lg block" style="margin-top:16px" data-act="checkout">${ic('wallet')}<span>${t('Charge {a}', { a: fmt(total, cur) })}</span></button>`
      : emptyBox('cart', t('Cart is empty'), t('Tap a product to add it to the cart.'))}
    </aside>
  </div>
  <div class="mbar ${lines.length ? 'show' : ''}"><div class="t"><small>${nItemsTxt(nItems)}</small><b>${fmt(total, cur)}</b></div><button type="button" class="btn sm ghost" style="color:#fff" data-act="scrollCart">${t('View')}</button><button type="button" class="btn pri" data-act="checkout">${ic('wallet', 'sm')}<span>${t('Charge')}</span></button></div>`;
}
function receiptsList() {
  const list = [...S.sales].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 300);
  return `<section class="card p0"><div class="card-h"><div><h3>${t('Receipts')}</h3><p>${t('{n} sale recorded|{n} sales recorded', { n: S.sales.length })}</p></div><div class="tools"><div class="search" style="min-width:220px"><span>${ic('search', 'sm')}</span><input type="search" placeholder="${esc(t('Receipt no. or customer'))}" data-inp="rsearch"></div></div></div>
  ${table([{ l: t('Customer') }, { l: t('Date'), c: 'w' }, { l: t('Items'), c: 'n hide-s' }, { l: t('Payment'), c: 'hide-s' }, { l: t('Amount'), c: 'n' }, { l: t('Status') }],
    list.map(s => ({ act: 'saleOpen', id: s.id, attrs: ` data-name="${esc((s.no + ' ' + s.client).toLowerCase())}"`, cells: [who(custName(s.client), t('Receipt {no}', { no: s.no })), fdate(s.date), sum(s.items.map(i => i.qty)), s.total - s.paid > 0 && !s.paid ? mTag('credit') : mTag(s.method), `<b>${fmt(s.total, s.cur)}</b>`, saleStatus(s)] })),
    emptyBox('receipt', t('No sales yet'), t('Your receipts will appear here.')))}</section>`;
}
function checkout() {
  const cur = cartCur(), lines = cartLines(), tot = rnd(sum(lines.map(l => l.total)), cur);
  if (!lines.length) return toast(t('The cart is empty'), 'bad');
  const short_ = lines.filter(l => l.q > l.p.stock);
  openModal(t('Take payment'), `
    <div class="hero-amt"><b>${fmt(tot, cur)}</b><small>≈ ${fmt(conv(tot, cur, other(cur)), other(cur))}</small></div>
    ${short_.length ? note('alert', 'amber', t('<b>Not enough stock:</b> {list}. The sale will still be recorded.', { list: short_.map(l => esc(l.p.name)).join(', ') })) : ''}
    <p class="flabel">${t('Payment method')}</p>
    ${choices('method', [...Object.keys(METHODS).filter(k => k !== 'bank' && (k !== 'ifb' || ifbOn())).map(k => [k, mName(k), METHODS[k][1]]), ['credit', t('Credit'), 'book']], 'cash')}
    ${ifbOn() ? `<p class="muted xs" style="margin:-8px 0 14px">${ic('qr', 'sm')} ${t('IFB: the customer pays {a} on the IFB page (dollars only).', { a: fmt(ifbUSD(tot, cur), 'USD') })}</p>` : ''}
    <div class="row2">${fld(t('Amount received'), money('paid', '', cur, `placeholder="${tot}"`), t('Leave empty if paid exactly'))}${fld(t('Discount'), money('discount', '', cur))}</div>
    <div class="row2">${fld(t('Customer'), inp('client', '', `list="dl-clients" placeholder="${esc(t('Customer name'))}"`), t('Required for credit'))}${fld(t('Phone'), inp('phone', '', 'type="tel" inputmode="tel" placeholder="099…"'))}</div>
    ${fld(t('Due date (if credit)'), inp('due', addDays(today(), 7), 'type="date"'))}
    ${note('info', 'pri', t('If the customer pays less than the total, the rest is added to <b>credits</b> automatically.'))}`,
  f => doSale(f), { ok: t('Confirm sale'), icon: 'wallet', sub: nItemsTxt(sum(lines.map(l => l.q))) });
}
function doSale(f) {
  const cur = cartCur(), rate = S.settings.rate, lines = cartLines();
  if (!lines.length) { toast(t('The cart is empty'), 'bad'); return false; }
  const items = lines.map(l => ({ pid: l.p.id, name: l.p.name, qty: l.q, price: l.price, cost: l.p.cost || 0, costCur: l.p.cur, bottle: !!l.p.bottle, back: l.p.bottle ? Math.max(0, Math.min(l.q, cart.back[l.p.id] ?? l.q)) : 0 }));
  const sub = rnd(sum(items.map(i => i.price * i.qty)), cur);
  const discount = Math.min(Math.max(0, num(f.discount)), sub), total = rnd(sub - discount, cur);
  const isIfb = f.method === 'ifb', given = f.method === 'credit' || isIfb ? 0 : (String(f.paid || '').trim() === '' ? total : num(f.paid));
  const paid = rnd(Math.min(given, total), cur), change = rnd(Math.max(0, given - total), cur);
  const client = (f.client || '').trim() || (isIfb ? t('IFB customer') : '');
  if (isIfb && ifbUSD(total, cur, rate) < IFB_MIN_USD) { toast(t('IFB payments start at $1'), 'bad'); return false; }
  if (paid < total && !client) { toast(t('For a credit sale, enter the customer name'), 'bad'); return false; }
  if (discount > 0 && !can('approve') && !f._ok) { needOwner(t('Discount of {a}', { a: fmt(discount, cur) }), () => doSale({ ...f, _ok: 1 })); return false; }
  const date = nowISO();
  const sale = { id: uid(), no: 'R-' + String(S.settings.recNo++).padStart(5, '0'), date, client, phone: f.phone || '', items, cur, rate, sub, discount, total, paid, change, method: f.method, by: SESSION.uid || undefined, byName: teamOn() ? meName() : undefined };
  S.sales.push(sale);
  for (const i of items) {
    const p = prod(i.pid); p.stock -= i.qty; p.lastSold = date;
    S.stockLog.push({ id: uid(), date, pid: p.id, delta: -i.qty, reason: 'sale', ref: sale.id, cost: p.cost || 0, cur: p.cur, rate });
    if (i.bottle) { p.empties = (p.empties || 0) + i.back; S.bottles.push({ id: uid(), date, client, pid: p.id, out: i.qty, back: i.back, saleId: sale.id }); }
  }
  const nt = t('Sale {no}', { no: sale.no });
  if (paid > 0) S.tx.push({ id: uid(), type: 'in', date, amount: paid, cur, rate, cat: 'sales', method: f.method === 'credit' ? 'cash' : f.method, note: nt + (client ? ' – ' + client : ''), saleId: sale.id });
  if (total - paid > 0) S.credits.push({ id: uid(), kind: 'client', name: client, phone: f.phone || '', amount: rnd(total - paid, cur), cur, rate, date, due: f.due || addDays(today(), 7), note: nt, saleId: sale.id, payments: [] });
  if (isIfb) ifbRequest('credit', S.credits.at(-1));
  if (!isIfb) upsertContact(client, f.phone);
  audit('sale', `${sale.no} · ${fmt(total, cur)} · ${mName(isIfb ? 'ifb' : paid < total ? 'credit' : f.method)}` + (discount ? ` · ${t('Discount')} ${fmt(discount, cur)}` : ''));
  commit(); cart.items = {}; cart.back = {};
  render(); toast(t('Sale recorded'), 'ok');
  if (isIfb) { const c = S.credits.at(-1); ifbSheet({ ...c.ifb, who: client, phone: f.phone }); return false; }
  showReceipt(sale);
  if (prnCfg().auto) printReceipt(sale, true);
  return false;
}
function receiptHTML(s) {
  const st = S.settings, bottles = s.items.filter(i => i.bottle);
  return `<div class="receipt"><h4>${esc(bizName())}</h4>${st.address ? `<p class="center">${esc(st.address)}</p>` : ''}${st.phone ? `<p class="center">${t('Tel: {p}', { p: esc(st.phone) })}</p>` : ''}<hr>
  <p><b>${t('RECEIPT')} ${s.no}</b>${s.void ? ` — <b>${t('VOIDED')}</b>` : ''}</p><p>${fdate(s.date)}</p>${s.byName ? `<p>${t('Served by {name}', { name: esc(s.byName) })}</p>` : ''}${s.client ? `<p>${t('Customer: {c}', { c: esc(s.client) })}</p>` : ''}<hr>
  <table>${s.items.map(i => `<tr><td>${esc(i.name)}<br>${i.qty} × ${fmt(i.price, s.cur)}</td><td class="n">${fmt(i.qty * i.price, s.cur)}</td></tr>`).join('')}</table><hr>
  <table>${s.discount ? `<tr><td>${t('Subtotal')}</td><td class="n">${fmt(s.sub, s.cur)}</td></tr><tr><td>${t('Discount')}</td><td class="n">− ${fmt(s.discount, s.cur)}</td></tr>` : ''}
  <tr class="tot"><td>${t('TOTAL')}</td><td class="n">${fmt(s.total, s.cur)}</td></tr>
  <tr><td>${t('Paid ({m})', { m: s.paid ? mName(s.method) : mName('credit') })}</td><td class="n">${fmt(s.paid, s.cur)}</td></tr>
  ${s.change ? `<tr><td>${t('Change given')}</td><td class="n">${fmt(s.change, s.cur)}</td></tr>` : ''}
  ${s.total - s.paid > 0 ? `<tr class="tot"><td>${t('BALANCE DUE')}</td><td class="n">${fmt(s.total - s.paid, s.cur)}</td></tr>` : ''}</table>
  ${bottles.length ? `<hr><p>${t('Packaging')}: ${bottles.map(i => `${esc(i.name)} ${t('{b}/{q} returned', { b: i.back, q: i.qty })}${i.qty - i.back > 0 ? ` (${t('{n} to bring back', { n: i.qty - i.back })})` : ''}`).join('; ')}</p>` : ''}
  ${s.method === 'ifb' && s.total - s.paid > 0 && ifbOn() ? `<hr><p class="center"><b>${t('Pay with IFB')}</b><br>${esc(ifbCfg().page.replace('https://', ''))}<br>${t('Reference to type')}: <b>${s.no}</b></p>` : ''}
  <hr><p class="center">${esc(footerText())}</p></div>`;
}
function receiptText(s) {
  return `${bizName()}\n${t('RECEIPT')} ${s.no} – ${fdate(s.date)}\n${s.client ? t('Customer: {c}', { c: s.client }) + '\n' : ''}` + s.items.map(i => `${i.qty} x ${i.name} = ${fmt(i.qty * i.price, s.cur)}`).join('\n') +
    `\n${t('TOTAL')}: ${fmt(s.total, s.cur)}\n${t('Paid')}: ${fmt(s.paid, s.cur)}` + (s.total - s.paid > 0 ? `\n${t('Balance due')}: ${fmt(s.total - s.paid, s.cur)}` : '') + `\n${footerText()}`;
}
function showReceipt(s) {
  openModal(t('Receipt {no}', { no: s.no }), receiptHTML(s) + `<div class="dlg-acts">
    ${btn(t('Print'), 'printReceipt', { cls: 'pri', icon: 'printer', data: `data-id="${s.id}"` })}
    ${btn(t('Share'), 'shareText', { icon: 'share', data: `data-id="${s.id}"` })}
    ${s.phone ? `<a class="btn" href="${waLink(s.phone, receiptText(s))}" target="_blank" rel="noopener">${ic('chat')}<span>WhatsApp</span></a>` : ''}
    ${!s.void && s.method === 'ifb' && s.total - s.paid > 0 && ifbOn() ? btn(t('Pay with IFB'), 'ifbCredit', { cls: 'soft', icon: 'qr', data: `data-id="${(S.credits.find(c => c.saleId === s.id && !c.void) || {}).id}"` }) : ''}
    ${!s.void ? btn(t('Void sale'), 'voidSale', { cls: 'danger', icon: 'xc', data: `data-id="${s.id}"` }) : ''}</div>`,
  null, { icon: 'receipt', tone: s.void ? 'gray' : 'green', sub: `${fdate(s.date)} · ${s.void ? t('voided') : s.total - s.paid > 0 ? t('balance {a}', { a: fmt(s.total - s.paid, s.cur) }) : t('paid')}` });
}
function voidSale(id) {
  const s = S.sales.find(x => x.id === id); if (!s || s.void) return;
  confirmBox(t('Void sale <b>{no}</b> ({a})? Stock will be restored, and the linked money and credit removed.', { no: s.no, a: fmt(s.total, s.cur) }), () => {
    s.void = voidMark();
    for (const i of s.items) { const p = prod(i.pid); if (p) { p.stock += i.qty; if (i.bottle) p.empties = (p.empties || 0) - i.back; } }
    S.stockLog = S.stockLog.filter(l => l.ref !== s.id);
    const vd = s.void, credIds = S.credits.filter(c => c.saleId === s.id).map(c => c.id);
    S.tx.forEach(x => { if (!x.void && (x.saleId === s.id || credIds.includes(x.creditId))) x.void = vd; });
    S.credits.forEach(c => { if (!c.void && c.saleId === s.id) c.void = vd; });
    S.bottles = S.bottles.filter(b => b.saleId !== s.id);
    audit('void_sale', `${s.no} · ${fmt(s.total, s.cur)}`); commit(); toast(t('Sale voided'));
  }, t('Void sale'));
}
function upsertContact(name, phone) {
  if (!name) return;
  const c = S.contacts.find(x => x.name.toLowerCase() === name.toLowerCase());
  if (c) { if (phone) c.phone = phone; } else S.contacts.push({ name, phone: phone || '' });
}
function waLink(phone, text) { let d = String(phone || '').replace(/\D/g, ''); if (d.startsWith('0')) d = (S.settings.cc || '243') + d.slice(1); return `https://wa.me/${d}?text=${encodeURIComponent(text)}`; }
const smsLink = (phone, text) => `sms:${String(phone || '').replace(/[^\d+]/g, '')}?body=${encodeURIComponent(text)}`;

/* =====================================================================
   CASH BOOK
   ===================================================================== */
function txCells(x) {
  const [i, tn] = catIc(x.cat), io = x.type === 'in';
  return [iconWho(i, tn, x.note || catName(x.cat), esc(catName(x.cat)) + (x.photo ? ' · ' + t('photo attached') : '')), fdate(x.date), mTag(x.method), pill(io ? t('Income') : t('Expense'), io ? 'green' : 'red'), `<b class="${io ? 'pos' : 'neg'}">${io ? '+' : '−'} ${fmt(x.amount, x.cur)}</b>`];
}
function vCaisse() {
  const p = ui.caisse, mc = S.settings.mainCur, bal = balances(), st = stats(p.val, mc);
  let list = TX().filter(x => x.date.startsWith(p.val)); const nIn = list.filter(x => x.type === 'in').length;
  if (ui.caisseTab !== 'all') list = list.filter(x => x.type === ui.caisseTab);
  list.sort((a, b) => b.date.localeCompare(a.date));
  const methRows = Object.keys(METHODS).filter(k => k !== 'ifb' || ifbOn() || bal.USD.ifb).map(k => `<div class="hb"><div class="top"><span><span class="ci t-gray">${ic(METHODS[k][1])}</span>${mName(k)}</span><b>${fmt(bal.USD[k] || 0, 'USD')} <em>· ${fmt(bal.CDF[k] || 0, 'CDF')}</em></b></div></div>`).join('');
  const pl = periodLabel(p);
  return ph(t('Cash book'), t('All the money coming in and going out'), btn(closedOn(today()) ? t('Day closed') : t('Close the day'), 'closeDay', { cls: closedOn(today()) ? '' : 'soft', icon: 'moon' }) + btn(t('Count'), 'cashCount', { icon: 'calculator' }) + btn(t('Exchange'), 'exchange', { icon: 'exchange' }) + btn(t('Expense'), 'newTx', { icon: 'out', data: 'data-type="out"' }) + btn(t('Income'), 'newTx', { cls: 'pri', icon: 'in', data: 'data-type="in"' })) + `
  <div class="g4">
    ${kpi({ label: t('Dollar balance'), icon: 'dollar', tone: 'blue', value: fmt(bal.USD.total, 'USD'), vcls: bal.USD.total < 0 ? 'neg' : '', sub: t('all tills'), active: true })}
    ${kpi({ label: t('Franc balance'), icon: 'cash', tone: 'teal', value: fmt(bal.CDF.total, 'CDF'), vcls: bal.CDF.total < 0 ? 'neg' : '', sub: t('all tills') })}
    ${kpi({ label: t('Income') + ' · ' + (p.kind === 'day' ? pl.toLowerCase() : pl), icon: 'in', tone: 'green', value: fmt(st.in, mc), sub: t('{n} transaction|{n} transactions', { n: nIn }) })}
    ${kpi({ label: t('Expenses') + ' · ' + (p.kind === 'day' ? pl.toLowerCase() : pl), icon: 'out', tone: 'red', value: fmt(st.out, mc), sub: t('Difference {a}', { a: fmt(st.in - st.out, mc) }) })}
  </div>
  <div class="gm mt">
    <section class="card p0"><div class="card-h"><div><h3>${t('Transactions')}</h3></div><div class="tools">${periodTools('caisse')}</div></div>
      ${uTabs('caisseTab', [['all', t('All')], ['in', t('Income')], ['out', t('Expenses')]])}
      ${table([{ l: t('Description') }, { l: t('Date'), c: 'w' }, { l: t('Method') }, { l: t('Type'), c: 'hide-s' }, { l: t('Amount'), c: 'n' }], list.map(x => ({ act: 'txOpen', id: x.id, cells: txCells(x) })), emptyBox('inbox', t('No transactions'), t('Nothing recorded for this period.')))}
    </section>
    <div class="stack">${card(t('Balance breakdown'), methRows, { sub: t('By till (dollars · francs)') })}
      ${card(t('Where the money goes'), hbars(st.byOut, mc, 'out'), { sub: pl })}
      ${closingsCard()}</div>
  </div>`;
}
function txForm(type, pre = {}) {
  const x = { type, date: nowISO(), cur: S.settings.mainCur, method: 'cash', cat: type === 'in' ? 'other_in' : 'other_out', amount: '', note: '', ...pre };
  const io = type === 'in';
  openModal(x.id ? (io ? t('Edit income') : t('Edit expense')) : (io ? t('New income') : t('New expense')), `
    ${fld(t('Amount'), money('amount', x.amount, x.cur, 'big required' + (x.id ? '' : ' autofocus')))}
    ${curChoices(x.cur)}
    ${fld(t('Category'), sel('cat', catOpts(io ? CATS_IN : CATS_OUT), x.cat))}
    <p class="flabel">${io ? t('Received via') : t('Paid via')}</p>${methChoices(x.method)}
    ${fld(t('Description'), inp('note', x.note, `placeholder="${esc(t('e.g. November electricity bill'))}"`))}
    ${fld(t('Date and time'), inp('date', x.date, 'type="datetime-local"'))}
    ${x.photo ? `<input type="hidden" name="keepPhoto" value="${x.photo}">${note('image', 'pri', `${t('Photo attached')} · <a href="#" data-act="photo" data-id="${x.photo}">${t('view')}</a>`)}` : pre.photoData ? note('image', 'green', t('Scanned photo attached')) : fld(t('Receipt photo (optional)'), `<input class="inp" type="file" name="photo" accept="image/*" capture="environment">`)}`,
  async f => {
    const amount = num(f.amount);
    if (amount <= 0) { toast(t('Enter an amount'), 'bad'); return false; }
    const photo = f.keepPhoto || await savePhoto(pre.photoData || f.photo);
    const rec = { id: x.id || uid(), type, date: f.date || nowISO(), amount: rnd(amount, f.cur), cur: f.cur, rate: x.rate || S.settings.rate, cat: f.cat, method: f.method, note: f.note.trim(), photo, partyId: x.partyId, saleId: x.saleId, creditId: x.creditId, invoiceId: x.invoiceId };
    const i = S.tx.findIndex(y => y.id === rec.id);
    if (i >= 0) S.tx[i] = rec; else S.tx.push(rec);
    audit(i >= 0 ? 'tx_edit' : 'tx_new', `${io ? '+' : '−'} ${fmt(rec.amount, rec.cur)} · ${catName(rec.cat)}${rec.note ? ' · ' + rec.note : ''}`);
    commit(); toast(t('Transaction saved'), 'ok'); ui.scan = null;
  }, { icon: io ? 'in' : 'out', tone: io ? 'green' : 'red', cls: io ? 'green' : 'pri', sub: io ? t('Money received') : t('Money spent') });
}
function txOpen(id) {
  const x = S.tx.find(y => y.id === id); if (!x) return;
  const linked = x.saleId || x.creditId || x.invoiceId, io = x.type === 'in';
  openModal(x.note || catName(x.cat), `
    <div class="hero-amt"><b class="${io ? 'pos' : 'neg'}">${io ? '+' : '−'} ${fmt(x.amount, x.cur)}</b><small>${fdate(x.date)}</small></div>
    <table class="kv"><tr><td>${t('Category')}</td><td>${esc(catName(x.cat))}</td></tr><tr><td>${t('Method')}</td><td>${mTag(x.method)}</td></tr><tr><td>${t('Description')}</td><td>${esc(x.note) || '—'}</td></tr><tr><td>${t('Rate')}</td><td>1 $ = ${NF0.format(x.rate || S.settings.rate)} FC</td></tr></table>
    ${x.ifbUnmatched ? note('alert', 'amber', t('IFB payment with reference “{r}”: no open sale, credit or invoice matched it. Link it to the right customer.', { r: esc(x.ifbRef || '—') })) + `<div class="dlg-acts" style="margin:0 0 12px">${btn(t('Link the IFB payment'), 'ifbLink', { cls: 'pri', icon: 'qr', data: `data-id="${x.id}"` })}</div>` : ''}
    ${linked ? note('info', 'pri', t('This transaction is linked to a sale, credit or invoice: to cancel it, open that sale, credit or invoice.')) : ''}
    <div class="dlg-acts">${x.photo ? btn(t('View photo'), 'photo', { icon: 'image', data: `data-id="${x.photo}"` }) : ''}
    ${linked ? '' : btn(t('Edit'), 'txEdit', { icon: 'edit', data: `data-id="${x.id}"` }) + btn(t('Delete'), 'txDel', { cls: 'danger', icon: 'trash', data: `data-id="${x.id}"` })}</div>`,
  null, { icon: catIc(x.cat)[0], tone: catIc(x.cat)[1], sub: io ? t('Income') : t('Expense') });
}
function exchangeForm() {
  openModal(t('Currency exchange'), `
    ${note('info', 'pri', t('Example: you change $100 into francs. The dollar till goes down, the franc till goes up.'))}
    <p class="flabel">${t('I give')}</p>${choices('from', [['USD', t('Dollars'), 'dollar'], ['CDF', t('Francs'), 'cash']], 'USD')}
    <div class="row2">${fld(t('Amount given'), inp('amount', '', 'inputmode="decimal" autofocus placeholder="0"'))}${fld(t('Rate (FC for $1)'), inp('rate', S.settings.rate, 'inputmode="decimal"'))}</div>
    ${fld(t('Till'), sel('method', Object.keys(METHODS).map(k => [k, mName(k)]), 'cash'))}`,
  f => {
    const a = num(f.amount), rate = num(f.rate) || S.settings.rate; if (a <= 0) { toast(t('Enter the amount'), 'bad'); return false; }
    const to = other(f.from), got = rnd(conv(a, f.from, to, rate), to), date = nowISO(), nt = t('Exchange {a} → {b}', { a: fmt(a, f.from), b: fmt(got, to) });
    S.tx.push({ id: uid(), type: 'out', date, amount: rnd(a, f.from), cur: f.from, rate, cat: 'fx', method: f.method, note: nt });
    S.tx.push({ id: uid(), type: 'in', date, amount: got, cur: to, rate, cat: 'fx', method: f.method, note: nt });
    audit('exchange', nt); commit(); toast(nt, 'ok');
  }, { icon: 'exchange', tone: 'teal', ok: t('Confirm exchange') });
}
function cashCountForm() {
  const bal = balances();
  openModal(t('Count the cash'), `
    ${note('info', 'pri', t('Count the cash in hand and enter the amount. The app compares it with what is recorded.'))}
    <div class="row2 keep">${fld(t('Dollars counted'), money('usd', '', 'USD', `placeholder="${rnd(bal.USD.cash, 'USD')}"`))}${fld(t('Francs counted'), money('cdf', '', 'CDF', `placeholder="${rnd(bal.CDF.cash, 'CDF')}"`))}</div>
    ${can('approve') ? `<label class="check"><input type="checkbox" name="fix" value="1"><span>${t('Adjust the till with the difference')}<small>${t('Adds a “cash difference” income or expense')}</small></span></label>` : note('info', 'pri', t('Only an owner can adjust the till. The result is saved in the activity log.'))}`,
  f => {
    const res = [];
    for (const [cur, key] of [['USD', 'usd'], ['CDF', 'cdf']]) {
      if (String(f[key]).trim() === '') continue;
      const diff = rnd(num(f[key]) - bal[cur].cash, cur);
      res.push([cur, diff]);
      if (f.fix && diff !== 0) S.tx.push({ id: uid(), type: diff > 0 ? 'in' : 'out', date: nowISO(), amount: Math.abs(diff), cur, rate: S.settings.rate, cat: diff > 0 ? 'other_in' : 'other_out', method: 'cash', note: t('Cash difference (count)') });
    }
    if (res.length) { audit('cash_count', res.map(([c, d]) => `${c === 'USD' ? t('Dollars') : t('Francs')}: ${d === 0 ? t('the till is right') : (d > 0 ? '+' : '−') + fmt(Math.abs(d), c)}`).join(' · ') + (f.fix ? ' · ' + t('Till adjusted.') : '')); commit(); }
    openModal(t('Count result'), `<div class="lst">${res.map(([c, d]) => `<div><span class="ai t-${d === 0 ? 'green' : d > 0 ? 'blue' : 'red'}">${ic(d === 0 ? 'check' : 'alert')}</span><span class="tx"><b>${c === 'USD' ? t('Dollars') : t('Francs')}: ${d === 0 ? t('the till is right') : d > 0 ? t('surplus of {a}', { a: fmt(Math.abs(d), c) }) : t('shortage of {a}', { a: fmt(Math.abs(d), c) })}</b><p>${f.fix && d ? t('Till adjusted.') : d < 0 ? t('Repeated shortages can mean entry mistakes or lost money.') : ''}</p></span></div>`).join('') || `<p class="muted">${t('No amount entered.')}</p>`}</div>`, null, { icon: 'calculator' });
    return false;
  }, { icon: 'calculator', ok: t('Compare') });
}

/* =====================================================================
   CREDITS
   ===================================================================== */
function vCredits() {
  const mc = S.settings.mainCur, d0 = today(), m = d0.slice(0, 7);
  const open = CR().filter(c => creditLeft(c) > 0);
  const cl = open.filter(c => c.kind === 'client'), fo = open.filter(c => c.kind === 'fournisseur'), late = cl.filter(c => c.due && c.due < d0);
  const tot = l => sum(l.map(c => conv(creditLeft(c), c.cur, mc)));
  const recov = sum(TX().filter(x => x.cat === 'credit_in' && x.date.startsWith(m)).map(x => conv(x.amount, x.cur, mc, x.rate)));
  let list = ui.credTab === 'paid' ? CR().filter(c => creditLeft(c) <= 0) : ui.credTab === 'client' ? cl : fo;
  list = [...list].sort((a, b) => ui.credTab === 'paid' ? b.date.localeCompare(a.date) : (a.due || '9').localeCompare(b.due || '9'));
  return ph(t('Credits'), t('Who owes you money, and who you owe'), btn(t('Supplier debt'), 'newCredit', { icon: 'tag', data: 'data-kind="fournisseur"' }) + btn(t('Customer credit'), 'newCredit', { cls: 'pri', icon: 'plus', data: 'data-kind="client"' })) + `
  <div class="g4">
    ${kpi({ label: t('Customers owe me'), icon: 'in', tone: 'green', value: fmt(tot(cl), mc), sub: t('{n} open credit|{n} open credits', { n: cl.length }), active: true })}
    ${kpi({ label: t('I owe'), icon: 'out', tone: 'red', value: fmt(tot(fo), mc), sub: t('{n} debt|{n} debts', { n: fo.length }) })}
    ${kpi({ label: t('Overdue'), icon: 'clock', tone: late.length ? 'red' : 'gray', value: fmt(tot(late), mc), vcls: late.length ? 'neg' : '', sub: t('{n} customer|{n} customers', { n: late.length }) })}
    ${kpi({ label: t('Recovered this month'), icon: 'checkc', tone: 'pri', value: fmt(recov, mc), sub: t('credit payments') })}
  </div>
  <section class="card p0 mt">
    ${uTabs('credTab', [['client', t('Customers'), cl.length], ['fournisseur', t('Suppliers'), fo.length], ['paid', t('Settled'), CR().length - open.length]])}
    ${table([{ l: t('Name') }, { l: t('Date'), c: 'w hide-s' }, { l: t('Due'), c: 'w' }, { l: t('Amount'), c: 'n hide-s' }, { l: t('Balance'), c: 'n' }, { l: t('Status') }],
      list.map(c => ({ act: 'creditOpen', id: c.id, cells: [who(c.name, esc(c.note || '') + (c.phone ? ' · ' + esc(c.phone) : '')), fday(c.date), fday(c.due), fmt(c.amount, c.cur), `<b>${fmt(Math.max(0, creditLeft(c)), c.cur)}</b>`, creditStatus(c)] })),
      emptyBox('book', ui.credTab === 'paid' ? t('No settled credit') : t('No open credit'), ui.credTab === 'client' ? t('Credit sales appear here automatically.') : ''))}
  </section>`;
}
function creditForm(kind, pre = {}) {
  const c = { name: '', phone: '', amount: '', cur: S.settings.mainCur, due: addDays(today(), 7), note: '', cat: 'purchase', ...pre };
  const isC = kind === 'client';
  openModal(isC ? t('New customer credit') : t('New debt'), `
    <div class="row2">${fld(isC ? t('Customer name') : t('Supplier / person'), inp('name', c.name, 'required list="dl-clients" autofocus'))}${fld(t('Phone'), inp('phone', c.phone, 'type="tel" inputmode="tel"'))}</div>
    ${fld(t('Amount'), money('amount', c.amount, c.cur, 'big required'))}${curChoices(c.cur)}
    ${!isC ? fld(t('What for?'), sel('cat', catOpts(CATS_OUT.filter(x => x !== 'fx')), c.cat)) : `<label class="check"><input type="checkbox" name="cashOut" value="1"><span>${t('I lent cash')}<small>${t('The amount will be taken from the till')}</small></span></label>`}
    <div class="row2">${fld(t('Payment due date'), inp('due', c.due, 'type="date"'))}${fld(t('Note'), inp('note', c.note, `placeholder="${esc(t('e.g. 2 crates of beer'))}"`))}</div>
    ${pre.photoData ? note('image', 'green', t('Scanned photo attached')) : ''}`,
  async f => {
    const amount = num(f.amount); if (!f.name.trim() || amount <= 0) { toast(t('Name and amount are required'), 'bad'); return false; }
    const date = nowISO();
    const cr = { id: uid(), kind, name: f.name.trim(), phone: f.phone, amount: rnd(amount, f.cur), cur: f.cur, rate: S.settings.rate, date, due: f.due, note: f.note, cat: f.cat, payments: [], photo: await savePhoto(pre.photoData) };
    S.credits.push(cr); upsertContact(cr.name, cr.phone);
    if (f.cashOut) S.tx.push({ id: uid(), type: 'out', date, amount: cr.amount, cur: cr.cur, rate: cr.rate, cat: 'other_out', method: 'cash', note: t('Loan to {name}', { name: cr.name }), creditId: cr.id });
    audit('credit_new', `${cr.name} · ${fmt(cr.amount, cr.cur)}`); commit(); toast(t('Credit saved'), 'ok'); ui.scan = null;
  }, { icon: isC ? 'book' : 'tag', tone: isC ? 'amber' : 'red', sub: isC ? t('The customer owes you money') : t('You owe money') });
}
function creditOpen(id) {
  const c = S.credits.find(x => x.id === id); if (!c) return;
  const left = creditLeft(c), isC = c.kind === 'client';
  if (isC && left > 0 && ifbOn() && !c.ifb) { ifbRequest('credit', c); commit(); }
  const msg = t('Hello {name}, a friendly reminder from {biz}: {a} is still to be paid{due}. Thank you!', { name: c.name, biz: bizName(), a: fmt(left, c.cur), due: c.due ? ' (' + t('due {d}', { d: fdate(c.due) }) + ')' : '' }) + (isC && c.ifb && ifbOn() ? '\n' + ifbPayText({ ...c.ifb, usd: ifbUSD(left, c.cur) }) : '');
  openModal(c.name, `
    <div class="hero-amt"><b class="${isC ? 'pos' : 'neg'}">${fmt(Math.max(0, left), c.cur)}</b><small>${isC ? t('left to receive out of {a}', { a: fmt(c.amount, c.cur) }) : t('left to pay out of {a}', { a: fmt(c.amount, c.cur) })}</small></div>
    <table class="kv"><tr><td>${t('Status')}</td><td>${creditStatus(c)}</td></tr><tr><td>${t('Created')}</td><td>${fday(c.date)}</td></tr><tr><td>${t('Due')}</td><td>${fday(c.due)}</td></tr><tr><td>${t('Phone')}</td><td>${esc(c.phone) || '—'}</td></tr><tr><td>${t('Note')}</td><td>${esc(c.note) || '—'}</td></tr></table>
    ${c.payments.length ? `<p class="flabel" style="margin-top:18px">${t('Payments received')}</p><table class="kv">${c.payments.map(p => `<tr><td>${fdate(p.date)}</td><td class="right"><b>${fmt(p.amount, c.cur)}</b></td></tr>`).join('')}</table>` : ''}
    <div class="dlg-acts">
      ${left > 0 ? btn(isC ? t('Customer pays') : t('I pay'), 'creditPay', { cls: isC ? 'green' : 'pri', icon: 'wallet', data: `data-id="${c.id}"` }) : ''}
      ${left > 0 && isC && c.phone ? `<a class="btn" href="${smsLink(c.phone, msg)}">${ic('mail')}<span>${t('SMS reminder')}</span></a><a class="btn" href="${waLink(c.phone, msg)}" target="_blank" rel="noopener">${ic('chat')}<span>WhatsApp</span></a>` : ''}
      ${left > 0 && isC && ifbOn() ? btn(t('Pay with IFB'), 'ifbCredit', { cls: 'soft', icon: 'qr', data: `data-id="${c.id}"` }) : ''}
      ${c.photo ? btn(t('View paper'), 'photo', { icon: 'image', data: `data-id="${c.photo}"` }) : ''}
      ${btn(t('Due date'), 'creditDue', { icon: 'calendar', data: `data-id="${c.id}"` })}
      ${btn(t('Delete'), 'creditDel', { cls: 'danger', icon: 'trash', data: `data-id="${c.id}"` })}
    </div>`, null, { icon: isC ? 'book' : 'tag', tone: isC ? 'amber' : 'red', sub: isC ? t('Customer credit') : t('Supplier debt') });
}
function creditPay(id) {
  const c = S.credits.find(x => x.id === id), left = creditLeft(c), isC = c.kind === 'client';
  openModal(isC ? t('Payment from {name}', { name: c.name }) : t('Payment to {name}', { name: c.name }), `
    ${fld(t('Amount'), money('amount', left, c.cur, 'big autofocus'), t('Balance: {a}', { a: fmt(left, c.cur) }))}
    <p class="flabel">${t('Method')}</p>${methChoices('cash')}`,
  f => {
    const a = Math.min(num(f.amount), left); if (a <= 0) { toast(t('Enter the amount'), 'bad'); return false; }
    const date = nowISO(), txId = uid();
    c.payments.push({ date, amount: rnd(a, c.cur), txId });
    S.tx.push({ id: txId, type: isC ? 'in' : 'out', date, amount: rnd(a, c.cur), cur: c.cur, rate: S.settings.rate, cat: isC ? 'credit_in' : (c.cat || 'debt_out'), method: f.method, note: isC ? t('Credit paid by {name}', { name: c.name }) : t('Payment to {name}', { name: c.name }), creditId: c.id });
    audit('credit_pay', `${c.name} · ${fmt(a, c.cur)}`); commit(); toast(creditLeft(c) <= 0 ? t('Credit settled') : t('Payment saved'), 'ok');
  }, { icon: 'wallet', tone: 'green', cls: isC ? 'green' : 'pri', ok: t('Save payment') });
}

/* =====================================================================
   PRODUCTS
   ===================================================================== */
function vProduits() {
  const list = S.products.filter(p => !p.archived).sort((a, b) => a.name.localeCompare(b.name)), mc = S.settings.mainCur;
  const value = sum(list.map(p => conv(Math.max(0, p.stock) * (p.cost || 0), p.cur, mc)));
  const low = list.filter(p => p.stock <= (p.min || 0)).length;
  const priced = list.filter(p => p.price), avgM = priced.length ? sum(priced.map(p => (p.price - (p.cost || 0)) / p.price)) / priced.length : 0;
  const own = can('cost'), keep = a => own ? a : a.filter((_, i) => i !== 2 && i !== 3);
  return ph(t('Products & stock'), t('What you sell, your prices and quantities'), btn(t('Add a product'), 'newProduct', { cls: 'pri', icon: 'plus' })) + `
  <div class="g4">
    ${kpi({ label: t('Products'), icon: 'package', tone: 'pri', value: list.length, sub: t('{n} category|{n} categories', { n: new Set(list.map(p => p.cat).filter(Boolean)).size }), active: true })}
    ${own ? kpi({ label: t('Stock value'), icon: 'layers', tone: 'blue', value: fmt(value, mc), sub: t('at cost price') }) : ''}
    ${kpi({ label: t('To reorder'), icon: 'alert', tone: low ? 'amber' : 'gray', value: low, sub: t('low or out of stock') })}
    ${own ? kpi({ label: t('Average margin'), icon: 'percent', tone: avgM < .15 ? 'red' : 'green', value: pct(avgM * 100), sub: t('selling − cost price') }) : ''}
  </div>
  ${orderCard()}
  <section class="card p0 mt"><div class="card-h"><div><h3>${t('Product list')}</h3></div><div class="tools"><div class="search" style="min-width:220px"><span>${ic('search', 'sm')}</span><input type="search" placeholder="${esc(t('Search'))}" data-inp="plist"></div></div></div>
  ${table(keep([{ l: t('Product') }, { l: t('Selling price'), c: 'n' }, { l: t('Cost price'), c: 'n' }, { l: t('Margin'), c: 'n' }, { l: t('Stock') }, { l: t('Empties'), c: 'n' }]),
    list.map(p => { const mg = p.price ? (p.price - (p.cost || 0)) / p.price : 0; return { act: 'productOpen', id: p.id, attrs: ` data-name="${esc(p.name.toLowerCase())}"`, cells: keep([`<div class="who"><span class="av sq t-${tone(p.name)}">${esc(initials(p.name))}</span><div><b>${esc(p.name)}</b><small>${esc(p.cat || t('No category'))} · ${esc(p.unit || t('unit'))}</small></div></div>`, `<b>${fmt(p.price, p.cur)}</b>`, fmt(p.cost || 0, p.cur), `<span class="${mg < .1 ? 'neg strong' : ''}">${pct(mg * 100)}</span>`, stockBadge(p), p.bottle ? t('{n} empty|{n} empties', { n: p.empties || 0 }) : '—']) }; }),
    emptyBox('package', t('No products'), t('Add what you sell: drinks, sugar, soap…'), btn(t('Add a product'), 'newProduct', { cls: 'pri', icon: 'plus' })))}</section>`;
}
function productForm(p = {}) {
  const x = { name: '', cat: '', unit: t('piece'), cur: S.settings.mainCur, price: '', cost: '', stock: 0, min: 5, bottle: false, deposit: '', empties: 0, ...p };
  openModal(p.id ? t('Edit product') : t('New product'), `
    ${fld(t('Product name'), inp('name', x.name, `required placeholder="${esc(t('e.g. Beer 72cl'))}"` + (p.id ? '' : ' autofocus')))}
    <div class="row2 keep">${fld(t('Category'), inp('cat', x.cat, `placeholder="${esc(t('Drinks'))}" list="dl-cats"`))}${fld(t('Unit'), inp('unit', x.unit, `placeholder="${esc(t('bottle, kg…'))}"`))}</div>
    <datalist id="dl-cats">${[...new Set(S.products.map(q => q.cat).filter(Boolean))].map(c => `<option value="${esc(c)}">`).join('')}</datalist>
    <p class="flabel">${t('Price currency')}</p>${curChoices(x.cur)}
    <div class="row2 keep">${fld(t('Selling price'), inp('price', x.price, 'inputmode="decimal" required placeholder="0"'))}${fld(t('Cost price'), inp('cost', x.cost, 'inputmode="decimal" placeholder="0"'), t('Used to calculate profit'))}</div>
    <div class="row2 keep">${p.id ? fld(t('Current stock'), inp('', x.stock, 'disabled'), t('Use “Restock” or “Stock count”')) : fld(t('Opening stock'), inp('stock', x.stock, 'inputmode="numeric"'))}${fld(t('Alert when stock ≤'), inp('min', x.min, 'inputmode="numeric"'))}</div>
    <label class="check"><input type="checkbox" name="bottle" value="1" ${x.bottle ? 'checked' : ''}><span>${t('Product with returnable packaging')}<small>${t('Bottles or crates to get back from customers')}</small></span></label>
    <div class="row2 keep">${fld(t('Deposit per bottle / crate'), inp('deposit', x.deposit || '', 'inputmode="decimal" placeholder="0"'))}${p.id ? '' : fld(t('Empties in stock'), inp('empties', x.empties || 0, 'inputmode="numeric"'))}</div>
    <div class="row2 keep">${fld(t('Supplier'), inp('supplier', x.supplier || '', `list="dl-clients" placeholder="${esc(t('Brewery'))}"`))}${fld(t('Ordered in packs of'), inp('pack', x.pack || 1, 'inputmode="numeric"'), t('e.g. 12 or 24 for a crate'))}</div>`,
  f => {
    if (!f.name.trim()) { toast(t('The name is required'), 'bad'); return false; }
    const rec = p.id ? prod(p.id) : { id: uid(), stock: Math.round(num(f.stock)), empties: Math.round(num(f.empties)), created: today() };
    const was = p.id ? `${fmt(rec.price, rec.cur)} / ${fmt(rec.cost || 0, rec.cur)}` : '';
    Object.assign(rec, { name: f.name.trim(), cat: f.cat.trim(), unit: f.unit.trim(), cur: f.cur, price: rnd(num(f.price), f.cur), cost: rnd(num(f.cost), f.cur), min: Math.round(num(f.min)), bottle: !!f.bottle, deposit: num(f.deposit), supplier: (f.supplier || '').trim(), pack: Math.max(1, Math.round(num(f.pack)) || 1) });
    if (!p.id) { S.products.push(rec); if (rec.stock) S.stockLog.push({ id: uid(), date: nowISO(), pid: rec.id, delta: rec.stock, reason: 'start', cost: rec.cost, cur: rec.cur, rate: S.settings.rate }); }
    const now_ = `${fmt(rec.price, rec.cur)} / ${fmt(rec.cost || 0, rec.cur)}`;
    audit(p.id ? 'product_edit' : 'product_new', `${rec.name} · ${t('price / cost')} ${now_}` + (was && was !== now_ ? ` (${t('before: {a}', { a: was })})` : ''));
    commit(); toast(t('Product saved'), 'ok');
  }, { icon: 'package' });
}
function productOpen(id) {
  const p = prod(id); if (!p) return;
  const sold30 = sum(S.sales.filter(s => !s.void && s.date >= addDays(today(), -30)).flatMap(s => s.items.filter(i => i.pid === id).map(i => i.qty)));
  const log = S.stockLog.filter(l => l.pid === id && l.reason !== 'sale').slice(-8).reverse();
  openModal(p.name, `
    <div class="g3" style="gap:10px">${[[t('Stock'), p.stock + ' ' + esc(p.unit || ''), p.stock <= (p.min || 0) ? 'red' : 'pri', 'package'], [t('Sold in 30 days'), sold30, 'blue', 'cart'], [t('Margin per unit'), fmt(p.price - (p.cost || 0), p.cur), 'green', 'coins']].filter((_, i) => i < 2 || can('cost')).map(([l, v, tn, i]) => `<div class="card kpi" style="padding:14px;box-shadow:none"><div class="lbl"><span class="ki t-${tn}">${ic(i, 'sm')}</span>${l}</div><div class="val" style="font-size:18px;margin:10px 0 0">${v}</div></div>`).join('')}</div>
    ${p.bottle ? note('bottle', 'teal', t('Empties at the depot: <b>{n}</b> · deposit {a}', { n: p.empties || 0, a: fmt(p.deposit || 0, p.cur) })) : ''}
    <div class="dlg-acts" style="margin-top:14px">${btn(t('Restock'), 'restock', { cls: 'pri', icon: 'plus', data: `data-id="${id}"` })}${btn(t('Count / loss'), 'adjust', { icon: 'calculator', data: `data-id="${id}"` })}${btn(t('Edit'), 'productEdit', { icon: 'edit', data: `data-id="${id}"` })}${btn(t('Remove'), 'productDel', { cls: 'danger', icon: 'trash', data: `data-id="${id}"` })}</div>
    ${log.length ? `<p class="flabel" style="margin-top:20px">${t('Stock movements')}</p><table class="kv">${log.map(l => `<tr><td>${fdate(l.date)}</td><td>${esc(reasonName(l))}</td><td class="right"><b class="${l.delta < 0 ? 'neg' : 'pos'}">${l.delta > 0 ? '+' : ''}${l.delta}</b></td></tr>`).join('')}</table>` : ''}`,
  null, { icon: p.bottle ? 'bottle' : 'package', sub: `${esc(p.cat || t('No category'))} · ${t('price {a}', { a: fmt(p.price, p.cur) })}` });
}
function restockForm(id) {
  const p = prod(id);
  openModal(t('Restock'), `
    <div class="row2 keep">${fld(t('Quantity received'), inp('qty', '', 'inputmode="numeric" required autofocus placeholder="0"'))}${fld(t('Unit cost price'), money('cost', p.cost || '', p.cur))}</div>
    <p class="flabel">${t('Payment')}</p>${choices('method', [['cash', mName('cash'), 'cash'], ['mobile', t('Mobile'), 'mobile'], ['bank', mName('bank'), 'landmark'], ['credit', t('On credit'), 'book'], ['none', t('Already paid'), 'check']], 'cash')}
    ${fld(t('Supplier'), inp('supplier', '', `list="dl-clients" placeholder="${esc(t('Supplier name'))}"`), t('Required if bought on credit'))}
    ${p.bottle ? fld(t('Empties returned to the supplier'), inp('emptiesBack', 0, 'inputmode="numeric"')) : ''}`,
  f => {
    const q = Math.round(num(f.qty)), cost = num(f.cost); if (q <= 0) { toast(t('Enter the quantity'), 'bad'); return false; }
    const sup = f.supplier.trim();
    if (f.method === 'credit' && !sup) { toast(t('Supplier name is required for credit'), 'bad'); return false; }
    const date = nowISO(), total = rnd(q * cost, p.cur), oldStock = Math.max(0, p.stock);
    p.cost = rnd(oldStock + q ? (oldStock * (p.cost || 0) + q * cost) / (oldStock + q) : cost, p.cur);
    p.stock += q;
    S.stockLog.push({ id: uid(), date, pid: p.id, delta: q, reason: 'purchase', who: sup, cost, cur: p.cur, rate: S.settings.rate });
    if (p.bottle && num(f.emptiesBack) > 0) { const n = Math.round(num(f.emptiesBack)); p.empties = (p.empties || 0) - n; S.bottles.push({ id: uid(), date, client: sup || t('Supplier'), pid: p.id, out: 0, back: n, supplier: true }); }
    if (total > 0) {
      if (f.method === 'credit') S.credits.push({ id: uid(), kind: 'fournisseur', name: sup, phone: '', amount: total, cur: p.cur, rate: S.settings.rate, date, due: addDays(today(), 14), note: `${q} × ${p.name}`, cat: 'purchase', payments: [] });
      else if (f.method !== 'none') S.tx.push({ id: uid(), type: 'out', date, amount: total, cur: p.cur, rate: S.settings.rate, cat: 'purchase', method: f.method, note: `${q} × ${p.name}` + (sup ? ' – ' + sup : '') });
    }
    upsertContact(sup, '');
    audit('restock', `${q} × ${p.name}` + (total > 0 ? ' · ' + fmt(total, p.cur) : '') + (sup ? ' · ' + sup : ''));
    commit(); toast(t('Stock updated: {n}', { n: p.stock }), 'ok');
  }, { icon: 'package', tone: 'green', sub: esc(p.name), ok: t('Add to stock') });
}
function adjustForm(id) {
  const p = prod(id);
  openModal(t('Stock count'), `
    ${note('info', 'pri', t('Count what is really left. The difference is recorded (breakage, theft, loss, mistake) and counts in the profit.'))}
    <div class="row2 keep">${fld(t('Counted stock'), inp('count', p.stock, 'inputmode="numeric" autofocus'), t('Recorded: {n}', { n: p.stock }))}${fld(t('Reason'), sel('reason', ['count', 'broken', 'expired', 'theft', 'personal', 'gift'].map(k => [k, t(REASONS[k])]), 'count'))}</div>`,
  f => {
    const d = Math.round(num(f.count)) - p.stock; if (!d) return;
    p.stock += d;
    S.stockLog.push({ id: uid(), date: nowISO(), pid: p.id, delta: d, reason: f.reason, cost: p.cost || 0, cur: p.cur, rate: S.settings.rate });
    audit('stock_adjust', `${p.name} ${d > 0 ? '+' : ''}${d} · ${t(REASONS[f.reason])}`); commit(); toast(d < 0 ? t('Loss recorded: {n}', { n: -d }) : t('Added: +{n}', { n: d }), d < 0 ? 'bad' : 'ok');
  }, { icon: 'calculator', sub: esc(p.name) });
}

/* =====================================================================
   PACKAGING (bottles & crates)
   ===================================================================== */
function vEmballages() {
  const bp = S.products.filter(p => p.bottle && !p.archived);
  const head = ph(t('Packaging'), t('Bottles and crates: at the depot, with customers, with the supplier'), bp.length ? btn(t('Lend'), 'bottleLend', { icon: 'out' }) + btn(t('Return to supplier'), 'bottleSupplier', { icon: 'truck' }) + btn(t('Empties returned'), 'bottleReturn', { cls: 'pri', icon: 'in' }) : '');
  if (!bp.length) return head + card('', emptyBox('bottle', t('No returnable products'), t('In Products, tick “Product with returnable packaging” for beer, soft drinks, bottled water…'), `<a class="btn pri" href="#/produits">${ic('package')}<span>${t('Go to products')}</span></a>`, 'teal'));
  const bal = bottleBalance(), mc = S.settings.mainCur;
  const outside = pid => sum(bal.filter(b => b.pid === pid).map(b => b.n));
  const valueOut = sum(bp.map(p => conv(Math.max(0, outside(p.id)) * (p.deposit || 0), p.cur, mc)));
  const clients = {}; bal.filter(b => b.n > 0).forEach(b => { (clients[b.client] = clients[b.client] || []).push(b); });
  return head + `
  <div class="g4">
    ${kpi({ label: t('With customers'), icon: 'users', tone: 'amber', value: sum(bp.map(p => Math.max(0, outside(p.id)))), sub: t('{n} customer|{n} customers', { n: Object.keys(clients).length }), active: true })}
    ${kpi({ label: t('Value outside'), icon: 'coins', tone: valueOut ? 'red' : 'gray', value: fmt(valueOut, mc), sub: t('based on the deposit') })}
    ${kpi({ label: t('Empties at the depot'), icon: 'bottle', tone: 'teal', value: sum(bp.map(p => p.empties || 0)), sub: t('to return to the supplier') })}
    ${kpi({ label: t('Full in stock'), icon: 'package', tone: 'pri', value: sum(bp.map(p => p.stock)), sub: t('{n} product|{n} products', { n: bp.length }) })}
  </div>
  <div class="g2 mt">
    <section class="card p0"><div class="card-h"><div><h3>${t('By product')}</h3></div></div>
    ${table([{ l: t('Product') }, { l: t('Full'), c: 'n' }, { l: t('Empty'), c: 'n' }, { l: t('At customers'), c: 'n' }], bp.map(p => ({ cells: [iconWho('bottle', 'teal', p.name, t('deposit {a}', { a: fmt(p.deposit || 0, p.cur) })), p.stock, p.empties || 0, `<b>${outside(p.id)}</b>`] })))}</section>
    <section class="card p0"><div class="card-h"><div><h3>${t('Customers who owe packaging')}</h3></div></div>
    ${table([{ l: t('Customer') }, { l: t('To return'), c: 'n' }, { l: '' }], Object.entries(clients).map(([c, l]) => ({ cells: [who(custName(c), l.map(b => `${b.n} × ${esc(prod(b.pid)?.name || '?')}`).join(', ')), `<b>${sum(l.map(b => b.n))}</b>`, btn(t('Return'), 'bottleReturn', { cls: 'sm soft', icon: 'in', data: `data-client="${esc(c)}"` })] })), emptyBox('checkc', t('Everything is back'), t('No customer owes packaging.'), '', 'green'))}</section>
  </div>`;
}
function bottleMoveForm(mode, client = '') {
  const bp = S.products.filter(p => p.bottle && !p.archived);
  const meta = { ret: [t('Empties returned'), 'in', 'green'], lend: [t('Lend packaging'), 'out', 'amber'], sup: [t('Return to supplier'), 'truck', 'teal'] }[mode];
  openModal(meta[0], `
    ${fld(mode === 'sup' ? t('Supplier') : t('Customer'), inp('client', client, 'list="dl-clients" required'))}
    <div class="row2 keep">${bp.map(p => fld(esc(p.name), inp('q_' + p.id, '', 'inputmode="numeric" placeholder="0"'))).join('')}</div>`,
  f => {
    const c = f.client.trim(); if (!c) { toast(t('Enter the name'), 'bad'); return false; }
    let n = 0;
    for (const p of bp) {
      const q = Math.round(num(f['q_' + p.id])); if (q <= 0) continue; n += q;
      if (mode === 'ret') { p.empties = (p.empties || 0) + q; S.bottles.push({ id: uid(), date: nowISO(), client: c, pid: p.id, out: 0, back: q }); }
      if (mode === 'lend') { p.empties = (p.empties || 0) - q; S.bottles.push({ id: uid(), date: nowISO(), client: c, pid: p.id, out: q, back: 0 }); }
      if (mode === 'sup') { p.empties = (p.empties || 0) - q; S.bottles.push({ id: uid(), date: nowISO(), client: c, pid: p.id, out: 0, back: q, supplier: true }); }
    }
    if (!n) { toast(t('No quantity entered'), 'bad'); return false; }
    upsertContact(c); audit('bottles', `${meta[0]} · ${c} · ${n}`); commit(); toast(t('{n} bottle / crate recorded|{n} bottles / crates recorded', { n }), 'ok');
  }, { icon: meta[1], tone: meta[2] });
}

/* =====================================================================
   STAFF
   ===================================================================== */
function vPersonnel() {
  const role = ui.persTab, mc = S.settings.mainCur, m = today().slice(0, 7), isE = role === 'employe';
  const all = S.people.filter(p => !p.archived), list = all.filter(p => p.role === role);
  const nE = all.filter(p => p.role === 'employe').length, nS = all.filter(p => p.role === 'soustraitant').length;
  const paidMonth = id => sum(TX().filter(x => x.partyId === id && x.date.startsWith(m)).map(x => conv(x.amount, x.cur, mc, x.rate)));
  const catSum = k => sum(TX().filter(x => x.cat === k && x.date.startsWith(m)).map(x => conv(x.amount, x.cur, mc, x.rate)));
  const due = sum(all.filter(p => p.role === 'employe').map(p => Math.max(0, conv(p.salary || 0, p.cur, mc) - paidMonth(p.id))));
  return ph(t('Staff'), t('Employees and subcontractors, salaries and payments'), (isE ? btn(t('Pay salaries automatically'), 'salariesAuto', { icon: 'refresh' }) : '') + btn(isE ? t('Add an employee') : t('Add a subcontractor'), 'newPerson', { cls: 'pri', icon: 'userplus' })) + `
  <div class="g4">
    ${kpi({ label: t('Employees'), icon: 'users', tone: 'pri', value: nE, sub: t('{n} subcontractor|{n} subcontractors', { n: nS }), active: true })}
    ${kpi({ label: t('Salaries paid this month'), icon: 'wallet', tone: 'green', value: fmt(catSum('salaries'), mc) })}
    ${kpi({ label: t('Left to pay'), icon: 'clock', tone: due ? 'amber' : 'gray', value: fmt(due, mc), sub: t('this month’s salaries') })}
    ${kpi({ label: t('Subcontractors this month'), icon: 'briefcase', tone: 'blue', value: fmt(catSum('subcontract'), mc) })}
  </div>
  <section class="card p0 mt">
    ${uTabs('persTab', [['employe', t('Employees'), nE], ['soustraitant', t('Subcontractors'), nS]])}
    ${table([{ l: t('Name') }, { l: t('Phone'), c: 'hide-s' }, { l: isE ? t('Monthly salary') : t('Rate'), c: 'n' }, { l: t('Paid this month'), c: 'n' }, { l: t('Status') }, { l: '' }],
      list.map(p => { const pm = paidMonth(p.id), s = conv(p.salary || 0, p.cur, mc); return { act: 'personOpen', id: p.id, cells: [who(p.name, esc(p.job || '') + (autoSalaryOf(p.id) ? ' · ' + t('automatic on {d}', { d: fday(autoSalaryOf(p.id).date) }) : '')), esc(p.phone) || '—', p.salary ? fmt(p.salary, p.cur) : '—', `<b>${fmt(pm, mc)}</b>`, isE && s ? (pm >= s ? pill(t('Paid'), 'green') : pm > 0 ? pill(t('Partial'), 'amber') : pill(t('To pay'), 'red')) : pm ? pill(t('Paid'), 'green') : pill('—', 'gray', 'nodot'), btn(t('Pay'), 'payPerson', { cls: 'sm soft', icon: 'wallet', data: `data-id="${p.id}"` })] }; }),
      emptyBox(isE ? 'users' : 'briefcase', t('Nobody yet'), isE ? t('Add your employees (packaging, sales…) to track salaries.') : t('Add your subcontractors (transport, delivery…).')))}
  </section>`;
}
function personForm(p = {}) {
  const x = { name: '', job: '', phone: '', salary: '', cur: S.settings.mainCur, role: ui.persTab, ...p }, isE = x.role === 'employe';
  openModal(p.id ? t('Edit') : (isE ? t('New employee') : t('New subcontractor')), `
    <div class="row2">${fld(t('Name'), inp('name', x.name, 'required autofocus'))}${fld(t('Role / job'), inp('job', x.job, `placeholder="${esc(isE ? t('e.g. packaging') : t('e.g. transport'))}"`))}</div>
    ${fld(t('Phone'), inp('phone', x.phone, 'type="tel" inputmode="tel"'))}
    ${fld(isE ? t('Monthly salary') : t('Usual rate'), inp('salary', x.salary, 'inputmode="decimal" placeholder="0"'))}${curChoices(x.cur)}`,
  f => {
    if (!f.name.trim()) return false;
    const rec = p.id ? S.people.find(y => y.id === p.id) : { id: uid(), role: x.role };
    Object.assign(rec, { name: f.name.trim(), job: f.job, phone: f.phone, salary: num(f.salary), cur: f.cur });
    if (!p.id) S.people.push(rec);
    audit(p.id ? 'staff_edit' : 'staff_new', `${rec.name}${rec.salary ? ' · ' + fmt(rec.salary, rec.cur) : ''}`);
    commit(); toast(t('Saved'), 'ok');
  }, { icon: 'userplus' });
}
function personOpen(id) {
  const p = S.people.find(x => x.id === id);
  const hist = TX().filter(x => x.partyId === id).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 15);
  openModal(p.name, `
    <div class="dlg-acts" style="margin-top:0">${btn(t('Pay'), 'payPerson', { cls: 'pri', icon: 'wallet', data: `data-id="${id}"` })}${btn(t('Advance'), 'payPerson', { icon: 'coins', data: `data-id="${id}" data-adv="1"` })}${p.phone ? `<a class="btn" href="tel:${esc(p.phone)}">${ic('phone')}<span>${t('Call')}</span></a>` : ''}</div>
    <p class="flabel" style="margin-top:20px">${t('Payment history')}</p>
    ${hist.length ? `<table class="kv">${hist.map(x => `<tr><td>${fday(x.date)}</td><td>${esc(x.note)}</td><td class="right"><b>${fmt(x.amount, x.cur)}</b></td></tr>`).join('')}</table>` : `<p class="muted sm">${t('No payments.')}</p>`}
    <div class="dlg-acts">${btn(t('Edit'), 'personEdit', { icon: 'edit', data: `data-id="${id}"` })}${btn(t('Remove'), 'personDel', { cls: 'danger', icon: 'trash', data: `data-id="${id}"` })}</div>`,
  null, { icon: p.role === 'employe' ? 'user' : 'briefcase', sub: esc(p.job || '') + (p.salary ? ' · ' + fmt(p.salary, p.cur) : '') });
}
function payPersonForm(id, adv) {
  const p = S.people.find(x => x.id === id), [y, mo] = today().slice(0, 7).split('-');
  openModal(adv ? t('Advance to {name}', { name: p.name }) : t('Pay {name}', { name: p.name }), `
    ${fld(t('Amount'), money('amount', adv ? '' : (p.salary || ''), p.cur, 'big autofocus'))}${curChoices(p.cur)}
    <p class="flabel">${t('Method')}</p>${methChoices('cash')}
    ${fld(t('Note'), inp('note', adv ? t('Advance') : (p.role === 'employe' ? t('Salary {m}', { m: MONTHS[+mo - 1] + ' ' + y }) : t('Work'))))}`,
  f => {
    const a = num(f.amount); if (a <= 0) return false;
    S.tx.push({ id: uid(), type: 'out', date: nowISO(), amount: rnd(a, f.cur), cur: f.cur, rate: S.settings.rate, cat: p.role === 'employe' ? 'salaries' : 'subcontract', method: f.method, note: `${f.note} – ${p.name}`, partyId: p.id });
    audit('staff_pay', `${p.name} · ${fmt(a, f.cur)}`); commit(); toast(t('Payment saved'), 'ok');
  }, { icon: 'wallet', ok: t('Pay') });
}

/* =====================================================================
   INVOICES
   ===================================================================== */
function invStatus(f) { const l = invLeft(f); if (l <= 0) return pill(t('Paid'), 'green'); if (f.due && f.due < today()) return pill(t('Overdue'), 'red'); return invPaid(f) ? pill(t('Partial'), 'amber') : pill(t('Pending'), 'pri'); }
function vFactures() {
  const mc = S.settings.mainCur, open = INV().filter(f => invLeft(f) > 0), m = today().slice(0, 7);
  let list = INV().sort((a, b) => b.date.localeCompare(a.date));
  list = ui.factTab === 'open' ? list.filter(f => invLeft(f) > 0) : list.filter(f => invLeft(f) <= 0);
  return ph(t('Invoices'), t('Create, print and collect your invoices'), btn(t('New invoice'), 'newInvoice', { cls: 'pri', icon: 'plus' })) + `
  <div class="g4">
    ${kpi({ label: t('To collect'), icon: 'clock', tone: 'amber', value: fmt(sum(open.map(f => conv(invLeft(f), f.cur, mc))), mc), sub: t('{n} invoice|{n} invoices', { n: open.length }), active: true })}
    ${kpi({ label: t('Overdue'), icon: 'alert', tone: 'red', value: open.filter(f => f.due && f.due < today()).length, sub: t('past the due date') })}
    ${kpi({ label: t('Invoiced this month'), icon: 'file', tone: 'pri', value: fmt(sum(INV().filter(f => f.date.startsWith(m)).map(f => conv(invTotal(f), f.cur, mc))), mc) })}
    ${kpi({ label: t('Collected this month'), icon: 'checkc', tone: 'green', value: fmt(sum(TX().filter(x => x.cat === 'invoice_in' && x.date.startsWith(m)).map(x => conv(x.amount, x.cur, mc, x.rate))), mc) })}
  </div>
  <section class="card p0 mt">${uTabs('factTab', [['open', t('Unpaid'), open.length], ['paid', t('Paid'), INV().length - open.length]])}
  ${table([{ l: t('Customer') }, { l: t('Date'), c: 'w hide-s' }, { l: t('Due'), c: 'w' }, { l: t('Total'), c: 'n' }, { l: t('Balance'), c: 'n' }, { l: t('Status') }],
    list.map(f => ({ act: 'invoiceOpen', id: f.id, cells: [who(f.client, t('Invoice {no}', { no: f.no })), fday(f.date), fday(f.due), `<b>${fmt(invTotal(f), f.cur)}</b>`, fmt(Math.max(0, invLeft(f)), f.cur), invStatus(f)] })),
    emptyBox('file', t('No invoices here'), t('Create an invoice for a business customer (bar, restaurant, NGO…).')))}</section>`;
}
let lineN = 0;
const invLine = (i, d = {}) => `<div class="row2 keep" style="grid-template-columns:2fr 1fr 1fr;align-items:end">${fld(i === 0 ? t('Description') : '', inp('d_' + i, d.desc || '', `list="dl-products" placeholder="${esc(t('Item or service'))}"`))}${fld(i === 0 ? t('Qty') : '', inp('q_' + i, d.qty || 1, 'inputmode="decimal"'))}${fld(i === 0 ? t('Unit price') : '', inp('p_' + i, d.price || '', 'inputmode="decimal" placeholder="0"'))}</div>`;
function invoiceForm() {
  lineN = 1;
  openModal(t('New invoice'), `
    <div class="row2">${fld(t('Customer'), inp('client', '', 'required list="dl-clients" autofocus'))}${fld(t('Phone'), inp('phone', '', 'type="tel"'))}</div>
    ${fld(t('Customer address'), inp('address'))}
    ${curChoices(S.settings.mainCur)}
    <div id="lines">${invLine(0)}</div>
    <button type="button" class="btn sm soft" data-act="addLine" style="margin-bottom:16px">${ic('plus', 'sm')}<span>${t('Add a line')}</span></button>
    <div class="row2 keep">${fld(t('VAT / tax (%)'), inp('tax', 0, 'inputmode="decimal"'))}${fld(t('Due date'), inp('due', addDays(today(), 15), 'type="date"'))}</div>
    ${fld(t('Note'), inp('note', '', `placeholder="${esc(t('Payment terms…'))}"`))}
    <datalist id="dl-products">${S.products.map(p => `<option value="${esc(p.name)}">`).join('')}</datalist>`,
  f => {
    const items = [];
    for (let i = 0; i < lineN; i++) { const d = (f['d_' + i] || '').trim(); if (d) items.push({ desc: d, qty: num(f['q_' + i]) || 1, price: rnd(num(f['p_' + i]), f.cur) }); }
    if (!f.client.trim() || !items.length) { toast(t('Customer and at least one line are required'), 'bad'); return false; }
    const inv = { id: uid(), no: 'F-' + String(S.settings.invNo++).padStart(4, '0'), date: nowISO(), due: f.due, client: f.client.trim(), phone: f.phone, address: f.address, cur: f.cur, rate: S.settings.rate, tax: num(f.tax), note: f.note, items, payments: [] };
    if (ifbOn()) ifbRequest('invoice', inv);
    S.invoices.push(inv); upsertContact(inv.client, inv.phone); audit('invoice_new', `${inv.no} · ${inv.client} · ${fmt(invTotal(inv), inv.cur)}`); commit(); render();
    invoiceOpen(inv.id); return false;
  }, { icon: 'file', ok: t('Create invoice'), wide: true });
}
function invoiceHTML(f) {
  const st = S.settings, sub = sum(f.items.map(i => i.qty * i.price));
  return `<div class="doc"><div class="dh"><div><h2>${esc(bizName())}</h2><p class="muted" style="margin:4px 0 0">${esc(st.address)}<br>${esc(st.phone)}</p></div><div class="right"><div class="tag">${t('INVOICE')}</div><p style="margin:4px 0 0">${t('No.')} <b>${f.no}</b><br>${t('Date')}: ${fday(f.date)}${f.due ? '<br>' + t('Due') + ': ' + fday(f.due) : ''}</p></div></div>
  <p><span class="muted">${t('Billed to')}</span><br><b>${esc(f.client)}</b><br>${esc(f.address || '')} ${esc(f.phone || '')}</p>
  <table><tr><th>${t('Description')}</th><th class="n">${t('Qty')}</th><th class="n">${t('Unit price')}</th><th class="n">${t('Total')}</th></tr>${f.items.map(i => `<tr><td>${esc(i.desc)}</td><td class="n">${i.qty}</td><td class="n">${fmt(i.price, f.cur)}</td><td class="n">${fmt(i.qty * i.price, f.cur)}</td></tr>`).join('')}
  <tr><td colspan="3" class="n">${t('Subtotal')}</td><td class="n">${fmt(sub, f.cur)}</td></tr>${f.tax ? `<tr><td colspan="3" class="n">${t('Tax {n} %', { n: f.tax })}</td><td class="n">${fmt(sub * f.tax / 100, f.cur)}</td></tr>` : ''}
  <tr class="gt"><td colspan="3" class="n">${t('Total')}</td><td class="n">${fmt(invTotal(f), f.cur)}</td></tr>${invPaid(f) ? `<tr><td colspan="3" class="n">${t('Already paid')}</td><td class="n">${fmt(invPaid(f), f.cur)}</td></tr><tr class="gt"><td colspan="3" class="n">${t('Balance due')}</td><td class="n">${fmt(invLeft(f), f.cur)}</td></tr>` : ''}</table>
  ${f.note ? `<p>${esc(f.note)}</p>` : ''}
  ${ifbOn() && invLeft(f) > 0 ? `<div class="doc-pay">${qrSVG(ifbLink({ usd: ifbUSD(invLeft(f), f.cur, f.rate), ref: f.no }), t('IFB payment page'))}<div><b>${t('Pay online with IFB')}</b><p>${t('Scan the code or open {link}. Type the amount {a} and the reference {ref}. Card, mobile money or IFB wallet.', { link: esc(ifbCfg().page.replace('https://', '')), a: fmt(ifbUSD(invLeft(f), f.cur, f.rate), 'USD'), ref: `<b>${f.no}</b>` })}</p></div></div>` : ''}
  <p class="center muted sm">${esc(footerText())}</p></div>`;
}
function invoiceOpen(id) {
  const f = S.invoices.find(x => x.id === id), left = invLeft(f);
  openModal(t('Invoice {no}', { no: f.no }), invoiceHTML(f) + `<div class="dlg-acts">
    ${btn(t('Print / PDF'), 'printInvoice', { cls: 'pri', icon: 'printer', data: `data-id="${id}"` })}
    ${left > 0 ? btn(t('Collect payment'), 'invoicePay', { cls: 'green', icon: 'wallet', data: `data-id="${id}"` }) : ''}
    ${left > 0 && ifbOn() ? btn(t('Pay with IFB'), 'ifbInvoice', { cls: 'soft', icon: 'qr', data: `data-id="${id}"` }) : ''}
    ${btn(t('Delete'), 'invoiceDel', { cls: 'danger', icon: 'trash', data: `data-id="${id}"` })}</div>`,
  null, { icon: 'file', wide: true, sub: esc(f.client) + ' · ' + (left > 0 ? t('balance {a}', { a: fmt(left, f.cur) }) : t('paid')) });
}
function invoicePay(id) {
  const f = S.invoices.find(x => x.id === id), left = invLeft(f);
  openModal(t('Invoice payment {no}', { no: f.no }), `${fld(t('Amount'), money('amount', left, f.cur, 'big autofocus'), t('Balance: {a}', { a: fmt(left, f.cur) }))}<p class="flabel">${t('Method')}</p>${methChoices('cash')}`, x => {
    const a = Math.min(num(x.amount), left); if (a <= 0) return false;
    const txId = uid(), date = nowISO();
    f.payments.push({ date, amount: rnd(a, f.cur), txId });
    S.tx.push({ id: txId, type: 'in', date, amount: rnd(a, f.cur), cur: f.cur, rate: S.settings.rate, cat: 'invoice_in', method: x.method, note: t('Invoice {no}', { no: f.no }) + ' – ' + f.client, invoiceId: f.id });
    audit('invoice_pay', `${f.no} · ${fmt(a, f.cur)}`); commit(); toast(t('Payment saved'), 'ok');
  }, { icon: 'wallet', tone: 'green', cls: 'green' });
}

/* =====================================================================
   REMINDERS
   ===================================================================== */
function vRappels() {
  const d0 = today(), todo = S.reminders.filter(r => !r.done);
  const list = S.reminders.filter(r => ui.rappTab === 'todo' ? !r.done : r.done).sort((a, b) => ui.rappTab === 'todo' ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date));
  return ph(t('Reminders'), t('Taxes, rent, orders, calls… nothing is forgotten'), btn(t('New reminder'), 'newReminder', { cls: 'pri', icon: 'plus' })) + `
  <section class="card p0">${uTabs('rappTab', [['todo', t('To do'), todo.length], ['done', t('Done'), S.reminders.length - todo.length]])}
  ${table([{ l: t('Reminder') }, { l: t('Date'), c: 'w' }, { l: t('Amount'), c: 'n' }, { l: t('Status') }, { l: '' }],
    list.map(r => ({ cells: [iconWho(r.repeat === 'month' ? 'refresh' : 'bell', r.done ? 'gray' : r.date < d0 ? 'red' : 'pri', r.title, (r.repeat === 'month' ? t('Every month') : t('Once')) + (r.note ? ' · ' + esc(r.note) : '')), fday(r.date), r.amount ? fmt(r.amount, r.cur) : '—', r.done ? pill(t('Done'), 'green') : r.date < d0 ? pill(t('Overdue'), 'red') : r.date <= addDays(d0, 2) ? pill(t('Due soon'), 'amber') : pill(t('Planned'), 'pri'), r.done ? btn('', 'remDel', { cls: 'sm ghost', icon: 'trash', data: `data-id="${r.id}" aria-label="${esc(t('Delete'))}"` }) : r.auto ? pill(t('Automatic'), 'blue') : btn(r.cat && r.amount ? t('Paid') : t('Done'), 'remDone', { cls: 'sm soft', icon: r.cat && r.amount ? 'wallet' : 'check', data: `data-id="${r.id}"` })] })),
    emptyBox('bell', ui.rappTab === 'todo' ? t('No reminders to do') : t('No completed reminders'), t('Add a monthly reminder for taxes so you avoid penalties.')))}</section>`;
}
function reminderForm() {
  openModal(t('New reminder'), `
    ${fld(t('What?'), inp('title', '', `required autofocus placeholder="${esc(t('e.g. Pay the monthly tax'))}"`))}
    <div class="row2 keep">${fld(t('Which day?'), inp('date', addDays(today(), 1), 'type="date"'))}${fld(t('Repeat'), sel('repeat', [['', t('Just once')], ['month', t('Every month')]], ''))}</div>
    <div class="row2 keep">${fld(t('Amount (optional)'), inp('amount', '', 'inputmode="decimal" placeholder="0"'))}${fld(t('Currency'), sel('cur', [['USD', t('Dollars ($)')], ['CDF', t('Francs (FC)')]], S.settings.mainCur))}</div>
    <div class="row2 keep">${fld(t('Is it a payment?'), sel('cat', [['', t('No, just a reminder')], ...catOpts(CATS_OUT.filter(x => x !== 'fx'))], ''))}${fld(t('Paid from'), sel('method', Object.keys(METHODS).filter(k => k !== 'ifb').map(k => [k, mName(k)]), 'cash'))}</div>
    <label class="check"><input type="checkbox" name="auto" value="1"><span>${t('Record the payment by itself on that day')}<small>${t('For rent, salaries, subscriptions: no need to open the reminder')}</small></span></label>
    ${fld(t('Note'), inp('note'))}`,
  f => {
    if (!f.title.trim()) return false;
    if (f.auto && (!f.cat || num(f.amount) <= 0)) { toast(t('For an automatic payment, choose what it is and the amount'), 'bad'); return false; }
    S.reminders.push({ id: uid(), title: f.title.trim(), date: f.date, day: +f.date.slice(8, 10), amount: num(f.amount), cur: f.cur, repeat: f.repeat, note: f.note, done: false, cat: f.cat || undefined, method: f.method, auto: !!f.auto });
    if (f.auto) { audit('settings', t('Automatic payment') + ': ' + f.title.trim()); runAutoPayments(); }
    commit(); toast(t('Reminder added'), 'ok');
  }, { icon: 'bell' });
}

/* =====================================================================
   REPORTS
   ===================================================================== */
function vRapports() {
  const p = ui.rap, cur = ui.rapCur || S.settings.mainCur, st = stats(p.val, cur);
  let series = [], title = '';
  const tk = today();
  if (p.kind === 'year') { title = t('Profit by month'); series = MONTHS.map((m, i) => ({ k: `${p.val}-${z(i + 1)}`, l: m + ' ' + p.val, s: MON3[i] })).filter(x => x.k <= tk.slice(0, 7)).map(x => ({ ...x, v: stats(x.k, cur).profit })); }
  else if (p.kind === 'month') { title = t('Sales by day'); const [y, m] = p.val.split('-').map(Number), n = new Date(y, m, 0).getDate(); series = Array.from({ length: n }, (_, i) => `${p.val}-${z(i + 1)}`).filter(k => k <= tk).map(k => ({ l: fdateLong(k), s: String(+k.slice(8)), v: stats(k, cur).revenue })); }
  else { title = t('Sales by hour'); series = Array.from({ length: 14 }, (_, i) => ({ l: `${z(i + 7)}:00`, s: `${i + 7}h`, v: stats(`${p.val}T${z(i + 7)}`, cur).revenue })); }
  const prods = Object.entries(st.byProd).sort((a, b) => b[1].profit - a[1].profit);
  const COLORS = { cash: '#5B5BD6', mobile: '#0C9A94', pos: '#2F6FED', bank: '#8B90A5', credit: '#F0A35E', ifb: '#0F766E' };
  const pl = (label, v, cls = '', strong) => `<div class="tr" style="${strong ? 'font-weight:750;color:var(--ink);border-top:1px solid var(--line);margin-top:6px;padding-top:10px' : ''}"><span>${label}</span><b class="${cls}">${fmt(v, cur)}</b></div>`;
  return ph(t('Reports'), t('Business results by day, month or year'), curSeg(cur, 'rapCur') + btn('Excel', 'exportCSV', { icon: 'download' }) + btn(t('Print'), 'printReport', { icon: 'printer' })) + `
  <div class="card" style="padding:14px 18px;margin-bottom:18px;display:flex;gap:12px;flex-wrap:wrap;align-items:center;justify-content:space-between">${periodTools('rap')}</div>
  <div class="g4">
    ${kpi({ label: t('Revenue'), icon: 'cart', tone: 'pri', value: fmt(st.revenue, cur), sub: t('{n} sale|{n} sales', { n: st.count }), active: true })}
    ${kpi({ label: t('Gross margin'), icon: 'tag', tone: 'blue', value: fmt(st.revenue - st.cogs, cur), sub: t('sales − cost of goods') })}
    ${kpi({ label: t('Expenses'), icon: 'out', tone: 'amber', value: fmt(st.charges, cur), sub: t('salaries, rent, taxes…') })}
    ${kpi({ label: t('Net profit'), icon: 'coins', tone: st.profit < 0 ? 'red' : 'green', value: fmt(st.profit, cur), vcls: st.profit < 0 ? 'neg' : 'pos', sub: t('margin {p}', { p: pct(st.margin * 100) }) })}
  </div>
  <div class="gm mt">
    ${card(title, lineChart('rap', series, cur), { sub: periodLabel(p) })}
    ${card(t('Income statement'), pl(t('Sales and invoices'), st.revenue, 'pos') + pl('− ' + t('Cost of goods sold'), st.cogs) + pl('= ' + t('Gross margin'), st.revenue - st.cogs, '', 1) + pl('− ' + t('Expenses'), st.charges) + (st.losses ? pl('− ' + t('Stock losses'), st.losses, 'neg') : '') + pl('= ' + t('Net profit'), st.profit, st.profit < 0 ? 'neg' : 'pos', 1) + `<p class="muted xs" style="margin:14px 0 0">${t('Cash: in {a} · out {b}. Stock purchases are counted when the goods are sold (cost of goods sold).', { a: fmt(st.in, cur), b: fmt(st.out, cur) })}</p>`)}
  </div>
  <div class="g3 mt">
    ${card(t('Where the money goes'), hbars(st.byOut, cur, 'out'), { sub: t('Expenses by category') })}
    ${card(t('Where the money comes from'), hbars(st.byIn, cur), { sub: t('Income by category') })}
    ${card(t('Payment methods'), donut(Object.entries(st.byMethod).map(([k, v]) => ({ l: mName(k), v, color: COLORS[k] || '#ccc' })), cur), { sub: t('Sales in the period') })}
  </div>
  <section class="card p0 mt"><div class="card-h"><div><h3>${t('Products sold')}</h3><p>${t('Ranked by profit')}</p></div></div>
  ${table([{ l: t('Product') }, { l: t('Quantity'), c: 'n' }, { l: t('Sales'), c: 'n' }, { l: t('Profit'), c: 'n' }, { l: t('Margin'), c: 'n' }],
    prods.map(([n, v]) => ({ cells: [`<div class="who"><span class="av sq t-${tone(n)}">${esc(initials(n))}</span><div><b>${esc(n)}</b></div></div>`, v.qty, fmt(v.rev, cur), `<b class="${v.profit < 0 ? 'neg' : ''}">${fmt(v.profit, cur)}</b>`, pct(v.rev ? v.profit / v.rev * 100 : 0)] })),
    emptyBox('cart', t('No sales in this period')))}</section>`;
}

/* =====================================================================
   ANALYSIS & ADVICE
   ===================================================================== */
function insights() {
  const out = [], mc = S.settings.mainCur, d0 = today(), m = d0.slice(0, 7);
  if (S.sales.length + TX().length < 3) return [];
  const { now: a, prev: b } = monthCompare(mc), full = stats(prevMonth(m), mc);
  const I = (lvl, icon, title, d) => out.push({ lvl, icon, title, d });
  const P = v => Math.round(v * 100);
  if (a.revenue && a.profit < 0) I('bad', 'dn', t('This month is making a loss'), t('Profit: {p}. Expenses ({c}) are higher than the margin on sales ({m}). Cut costs or raise the price of low-margin products.', { p: fmt(a.profit, mc), c: fmt(a.charges, mc), m: fmt(a.revenue - a.cogs, mc) }));
  else if (a.revenue) I('ok', 'coins', t('Profit this month: {a}', { a: fmt(a.profit, mc) }), t('Net margin of {p} % on {a} of sales.', { p: P(a.margin), a: fmt(a.revenue, mc) }));
  if (b.revenue && a.revenue) {
    const ch = (a.revenue - b.revenue) / b.revenue;
    if (ch < -0.1) I('warn', 'dn', t('Sales are falling ({p} %)', { p: P(ch) }), t('{a} since the start of the month, against {b} at the same date last month.', { a: fmt(a.revenue, mc), b: fmt(b.revenue, mc) }));
    else if (ch > 0.1) I('ok', 'up', t('Sales are rising (+{p} %)', { p: P(ch) }), t('{a} since the start of the month, against {b} at the same date last month.', { a: fmt(a.revenue, mc), b: fmt(b.revenue, mc) }));
    if (b.charges && a.charges > b.charges * 1.25) I('warn', 'out', t('Expenses are rising fast'), t('{a} against {b} at the same date last month. Look at “Where the money goes” in Reports.', { a: fmt(a.charges, mc), b: fmt(b.charges, mc) }));
  }
  const topOut = Object.entries(a.byOut).filter(([k]) => !NOT_CHARGE.includes(k)).sort((x, y) => y[1] - x[1])[0];
  if (topOut && a.revenue && topOut[1] / a.revenue > 0.2) I('warn', catIc(topOut[0])[0], t('“{c}” costs a lot', { c: catName(topOut[0]) }), t('{a}, that is {p} % of this month’s sales.', { a: fmt(topOut[1], mc), p: P(topOut[1] / a.revenue) }));
  const lowM = S.products.filter(p => !p.archived && p.price && p.cost && (p.price - p.cost) / p.price < 0.095);
  if (lowM.length) I('bad', 'tag', t('{n} product with a margin that is too low|{n} products with a margin that is too low', { n: lowM.length }), lowM.slice(0, 5).map(p => `${esc(p.name)} (${P((p.price - p.cost) / p.price)} %)`).join(', ') + '. ' + t('Check the cost price and the selling price.'));
  const noCost = S.products.filter(p => !p.archived && !p.cost);
  if (noCost.length) I('warn', 'help', t('{n} product without a cost price|{n} products without a cost price', { n: noCost.length }), t('Without a cost price, the profit shown is wrong. Fill it in under Products.'));
  const dorm = S.products.filter(p => !p.archived && p.stock > 0 && (!p.lastSold || p.lastSold < addDays(d0, -30)) && (p.created || '0') < addDays(d0, -30));
  if (dorm.length) I('warn', 'package', t('{n} product not sold for 30 days|{n} products not sold for 30 days', { n: dorm.length }), dorm.slice(0, 5).map(p => esc(p.name)).join(', ') + '. ' + t('Money tied up: {a}. Run a promotion or stop ordering.', { a: fmt(sum(dorm.map(p => conv(p.stock * (p.cost || 0), p.cur, mc))), mc) }));
  const top = Object.entries(a.byProd).sort((x, y) => y[1].profit - x[1].profit).slice(0, 3);
  if (top.length) I('ok', 'star', t('Products that earn the most'), top.map(([n, v]) => `${esc(n)} (${fmt(v.profit, mc)})`).join(', ') + '. ' + t('Never run out of these products.'));
  const cl = CR().filter(c => c.kind === 'client' && creditLeft(c) > 0), totCl = sum(cl.map(c => conv(creditLeft(c), c.cur, mc))), late = cl.filter(c => c.due && c.due < d0);
  const ref = Math.max(a.revenue, full.revenue);
  if (ref && totCl > ref * 0.3) I('bad', 'book', t('Too much money out on credit'), t('Customers owe {a}, that is {p} % of a month of sales. Give credit only to loyal customers and set a payment date.', { a: fmt(totCl, mc), p: P(totCl / ref) }));
  if (late.length) I('bad', 'clock', t('{n} overdue credit|{n} overdue credits', { n: late.length }), t('Customers: {list}. Send an SMS or WhatsApp reminder from Credits.', { list: [...new Set(late.map(c => c.name))].slice(0, 5).map(esc).join(', ') }));
  if (a.losses) I('warn', 'alert', t('Stock losses: {a} this month', { a: fmt(a.losses, mc) }), t('Breakage, theft or mistakes. Count the stock every week and check the depot.'));
  const bp = S.products.filter(p => p.bottle), bal = bottleBalance();
  const outVal = sum(bp.map(p => conv(Math.max(0, sum(bal.filter(x => x.pid === p.id).map(x => x.n))) * (p.deposit || 0), p.cur, mc)));
  if (outVal > 0) I('warn', 'bottle', t('Packaging with customers: {a}', { a: fmt(outVal, mc) }), t('Ask for a deposit or for the empties back before delivering again.'));
  const pay = sum(Object.values(a.byMethod)), cashShare = pay ? (a.byMethod.cash || 0) / pay : 0;
  if (cashShare > 0.85) I('info', 'mobile', t('{p} % of sales in cash', { p: P(cashShare) }), t('Accepting Mobile Money (M-Pesa, Orange Money, Airtel Money) and card payments reduces theft and change mistakes.'));
  const wd = Array(7).fill(0); S.sales.filter(s => !s.void && s.date >= addDays(d0, -90)).forEach(s => { wd[dt(s.date).getDay()] += conv(s.total, s.cur, mc, s.rate); });
  if (sum(wd)) { const best = DAYS[wd.indexOf(Math.max(...wd))], worst = DAYS[wd.indexOf(Math.min(...wd))]; I('info', 'calendar', t('Best day: {b} · weakest: {w}', { b: best, w: worst }), t('Have more stock and staff on {b}. Try a small promotion on {w}.', { b: best, w: worst })); }
  const days = new Set(TX().filter(x => x.date >= addDays(d0, -14)).map(x => x.date.slice(0, 10))).size;
  if (days < 8) I('warn', 'pen', t('Irregular record keeping: {n} day out of 14|Irregular record keeping: {n} days out of 14', { n: days }), t('For reliable control, record every sale and every expense the same day.'));
  if (!S.reminders.some(r => /imp[oô]t|tax|dgi|dgrad|patente|impuesto/i.test(r.title))) I('info', 'landmark', t('No reminder for taxes'), t('Add a monthly reminder for taxes (tax office, trading licence, town hall) to avoid penalties.'));
  return out;
}
const STRATEGY = [
  ['pen', 'Record everything, every day', 'Every sale, every expense, every credit. Two minutes a day is enough to control the profit.'],
  ['shield', 'Back up every week', 'Settings → Back up, then send the file to WhatsApp or Drive. If the phone is lost, you keep everything.'],
  ['chat', 'WhatsApp Business', 'A catalogue with photos and prices, a status every morning with the promotions. Customers order by message.'],
  ['mobile', 'Mobile Money and card', 'Less cash means less theft, fewer fake notes and fewer change mistakes. Every payment leaves a trace.'],
  ['receipt', 'A receipt for every sale', 'The receipt reassures the customer and stops sales that are not recorded.'],
  ['users', 'Know your customers', 'Write down the name and phone of good customers, send them news, reward loyal ones.'],
  ['chart', 'Review at the end of each month', 'Reports and Analysis: which product earns, which expense is growing, which credit is late.'],
  ['bottle', 'Deposit on packaging', 'A small deposit per bottle or crate: empties come back faster.']
];
function gauge(score) {
  const a = Math.PI * score / 100, x = 90 - 70 * Math.cos(a), y = 90 - 70 * Math.sin(a), col = score >= 70 ? '#0E8A44' : score >= 45 ? '#C27300' : '#D93A40';
  return `<svg viewBox="0 0 180 104"><path d="M20 90 A70 70 0 0 1 160 90" fill="none" stroke="#F0F1F5" stroke-width="14" stroke-linecap="round"/><path d="M20 90 A70 70 0 0 1 ${x.toFixed(1)} ${y.toFixed(1)}" fill="none" stroke="${col}" stroke-width="14" stroke-linecap="round"/><text x="90" y="80" text-anchor="middle" font-size="30" font-weight="700" fill="#181B2A">${score}</text><text x="90" y="98" text-anchor="middle" font-size="10" fill="#6B7087">${esc(t('out of 100'))}</text></svg>`;
}
function vAnalyse() {
  const ins = insights();
  if (!ins.length) return ph(t('Analysis & advice'), t('Strengths, weak points and strategy')) + card('', emptyBox('sparkles', t('Not enough data yet'), t('Record your sales and expenses for 2 to 4 weeks: the app will then show the strengths and weak points of the business.')));
  const bad = ins.filter(x => x.lvl === 'bad'), warn = ins.filter(x => x.lvl === 'warn'), good = ins.filter(x => x.lvl === 'ok'), info = ins.filter(x => x.lvl === 'info');
  const score = Math.max(5, Math.min(100, 100 - bad.length * 16 - warn.length * 7 + good.length * 3));
  const T = { bad: 'red', warn: 'amber', ok: 'green', info: 'blue' };
  const row = x => `<div><span class="ai t-${T[x.lvl]}">${ic(x.icon)}</span><span class="tx"><b>${x.title}</b><p>${x.d}</p></span></div>`;
  const strat = l => `<div class="lst">${l.map(([i, ti, d]) => `<div><span class="ai t-pri">${ic(i)}</span><span class="tx"><b>${t(ti)}</b><p>${t(d)}</p></span></div>`).join('')}</div>`;
  return ph(t('Analysis & advice'), t('The app reads your numbers and shows what is going well and what needs fixing')) + `
  <div class="gm">
    ${card(t('Business health'), `<div class="gauge">${gauge(score)}<div style="flex:1;min-width:200px"><b style="font-size:18px">${score >= 70 ? t('Healthy') : score >= 45 ? t('Needs watching') : t('Warning')}</b><p class="muted sm" style="margin:6px 0 14px">${t('Score based on the strengths and weak points below. It goes up as you fix the weak points.')}</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap">${pill(t('{n} urgent', { n: bad.length }), 'red')}${pill(t('{n} to watch', { n: warn.length }), 'amber')}${pill(t('{n} strength|{n} strengths', { n: good.length }), 'green')}</div></div></div>`)}
    ${card(t('Strengths'), good.length ? `<div class="lst">${good.map(row).join('')}</div>` : emptyBox('star', t('Nothing to report yet'), '', '', 'green'))}
  </div>
  <div class="gm mt">
    ${card(t('Weak points to fix'), bad.length + warn.length ? `<div class="lst">${[...bad, ...warn].map(row).join('')}</div>` : emptyBox('checkc', t('No weak points found'), '', '', 'green'), { sub: t('Most urgent first') })}
    ${card(t('Customer & market insights'), info.length ? `<div class="lst">${info.map(row).join('')}</div>` : emptyBox('globe', t('Nothing new')))}
  </div>
  ${card(t('Digital strategy & improvement'), `<div class="g2" style="gap:0 28px">${strat(STRATEGY.slice(0, 4))}${strat(STRATEGY.slice(4))}</div>`, { cls: 'mt', sub: t('Good practices to grow the business') })}`;
}

/* =====================================================================
   SCANNER
   ===================================================================== */
function vScanner() {
  const sc = ui.scan;
  const KIND = { in: [t('Income'), 'green'], out: [t('Expense'), 'red'], credit: [t('Credit'), 'amber'] };
  const docs = [...TX().filter(x => x.photo).map(x => ({ ...x, kind: x.type, label: catName(x.cat) })), ...CR().filter(c => c.photo).map(c => ({ ...c, kind: 'credit', note: c.name, label: t('Credit') }))].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 40);
  return ph(t('Scan a paper'), t('Photograph receipts, invoices and notebook pages: the photo is kept as proof')) + `
  <div class="gm">
    ${card('', sc ? `<div class="g2" style="align-items:start">
        <img class="photo" src="${sc.data}" alt="${esc(t('Scanned paper'))}" style="max-height:420px">
        <div>
          <p class="flabel">${t('Automatic reading')}</p>
          ${sc.busy ? note('clock', 'pri', `${t('Reading…')} <b id="ocrp">${sc.progress || ''}</b>`) : sc.text != null ? `<div class="ocr">${esc(sc.text) || t('(nothing read)')}</div>${sc.amounts.length ? `<p class="flabel" style="margin-top:14px">${t('Tap the right amount')}</p><div class="amts">${sc.amounts.map(a => `<button type="button" class="${sc.amount === a ? 'on' : ''}" data-act="scanAmt" data-v="${a}">${NF2.format(a).replace(/[.,]00$/, '')}</button>`).join('')}</div>` : ''}`
            : `${btn(t('Read the numbers'), 'scanOCR', { cls: 'soft block', icon: 'scan' })}<p class="muted xs" style="margin:8px 0 0">${navigator.onLine ? t('The reading engine downloads the first time.') : t('Internet is needed the first time. You can also type the amount by hand.')}</p>`}
          <p class="flabel" style="margin-top:20px">${t('Save this paper as')}</p>
          <div class="qa">
            <button type="button" data-act="scanAs" data-v="in"><span class="qi t-green">${ic('in')}</span>${t('Income')}</button>
            <button type="button" data-act="scanAs" data-v="out"><span class="qi t-red">${ic('out')}</span>${t('Expense')}</button>
            <button type="button" data-act="scanAs" data-v="credit"><span class="qi t-amber">${ic('book')}</span>${t('Credit')}</button>
          </div>
          ${btn(t('Cancel'), 'scanClear', { cls: 'ghost block', icon: 'x' }).replace('class="btn', 'style="margin-top:10px" class="btn')}
        </div></div>`
      : `<label class="drop"><span class="di">${ic('camera', 'xl')}</span><b>${t('Take a photo')}</b><span class="sm">${t('or choose a picture from the gallery')}</span><input type="file" accept="image/*" capture="environment" data-chg="scanFile" hidden></label>`)}
    ${card(t('How it works'), `<div class="steps">
      <div><span class="sn">1</span><div><b>${t('Photograph the paper')}</b><p>${t('Flat, with good light.')}</p></div></div>
      <div><span class="sn">2</span><div><b>${t('Read the numbers')}</b><p>${t('The app suggests the amounts it finds.')}</p></div></div>
      <div><span class="sn">3</span><div><b>${t('Save')}</b><p>${t('As income, expense or credit. The photo stays attached.')}</p></div></div></div>`)}
  </div>
  <section class="card p0 mt"><div class="card-h"><div><h3>${t('Saved documents')}</h3><p>${t('{n} document|{n} documents', { n: docs.length })}</p></div></div>
  ${table([{ l: t('Document') }, { l: t('Type') }, { l: t('Date'), c: 'w' }, { l: t('Amount'), c: 'n' }], docs.map(d => ({ act: 'photo', id: d.photo, cells: [iconWho('image', 'pri', d.note || d.label, esc(d.label)), pill(KIND[d.kind][0], KIND[d.kind][1]), fdate(d.date), `<b>${fmt(d.amount, d.cur)}</b>`] })), emptyBox('image', t('No scanned documents')))}</section>`;
}
function extractAmounts(text) {
  const found = new Set();
  for (const raw of text.match(/\d[\d .,]*\d|\d/g) || []) {
    let s = raw.replace(/ (?=\d{3}\b)/g, '').replace(/\s/g, '');
    const lastSep = Math.max(s.lastIndexOf(','), s.lastIndexOf('.'));
    if (lastSep >= 0 && s.length - lastSep - 1 === 2) s = s.slice(0, lastSep).replace(/[.,]/g, '') + '.' + s.slice(lastSep + 1);
    else s = s.replace(/[.,]/g, '');
    const n = parseFloat(s);
    if (isFinite(n) && n > 0 && n < 1e9 && !(n >= 1900 && n <= 2100 && Number.isInteger(n))) found.add(n);
  }
  return [...found].sort((a, b) => b - a).slice(0, 12);
}
function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error(t('download failed (internet?)'))); document.head.appendChild(s); }); }
async function runOCR() {
  const sc = ui.scan; if (!sc) return;
  sc.busy = true; sc.progress = ''; render();
  try {
    if (!window.Tesseract) await loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js');
    const worker = await Tesseract.createWorker(LANGS[LANG][2], 1, { logger: m => { if (m.status === 'recognizing text' && ui.scan) { ui.scan.progress = Math.round(m.progress * 100) + ' %'; const el = $('#ocrp'); if (el) el.textContent = ui.scan.progress; } } });
    const { data } = await worker.recognize(sc.data); await worker.terminate();
    sc.text = data.text.trim(); sc.amounts = extractAmounts(sc.text); sc.amount = sc.amounts[0] || null;
  } catch (e) { toast(t('Automatic reading failed: {e}', { e: e.message }), 'bad'); sc.text = null; }
  sc.busy = false; render();
}

/* =====================================================================
   MORE, SETTINGS, HELP
   ===================================================================== */
const NAV = [
  ['Main', [['home', 'Home', 'dashboard'], ['dash', 'Dashboard', 'dashboard'], ['vente', 'Point of sale', 'cart'], ['caisse', 'Cash book', 'wallet'], ['credits', 'Credits', 'book']]],
  ['Management', [['produits', 'Products & stock', 'package'], ['emballages', 'Packaging', 'bottle'], ['personnel', 'Staff', 'users'], ['factures', 'Invoices', 'file'], ['rappels', 'Reminders', 'bell']]],
  ['Analysis', [['rapports', 'Reports', 'chart'], ['analyse', 'Analysis & advice', 'sparkles'], ['scanner', 'Scan a paper', 'scan']]],
  ['System', [['journal', 'Activity log', 'clock'], ['params', 'Settings', 'settings'], ['aide', 'Help', 'help']]]
];
const DESC = { produits: 'Prices, stock, stock counts', emballages: 'Bottles and crates', personnel: 'Salaries and payments', factures: 'Create and collect', rappels: 'Taxes, rent…', rapports: 'Day, month, year', analyse: 'Weak points, strategy', scanner: 'Photos of papers', journal: 'Who did what, and when', params: 'Language, team, backup', aide: 'How to use the app' };
const TONE = { produits: 'pri', emballages: 'teal', personnel: 'blue', factures: 'amber', rappels: 'red', rapports: 'pri', analyse: 'green', scanner: 'blue', journal: 'blue', params: 'gray', aide: 'gray' };
const routeTitle = r => r === 'menu' ? t('More') : r === 'home' ? homeLabel() : t(NAV.flatMap(g => g[1]).find(x => x[0] === r)?.[1] || 'Dashboard');
function vMenu() {
  return ph(t('More'), t('All features')) + accountCard() + NAV.slice(1).map(([g, items]) => [g, items.filter(([r]) => canSee(r))]).filter(([, items]) => items.length).map(([g, items]) => `<p class="nav-g" style="margin:18px 2px 10px">${t(g)}</p><div class="tiles">${items.map(([r, l, i]) => `<a class="tile" href="#/${r}"><span class="ti t-${TONE[r]}">${ic(i)}</span><span>${t(l)}<small>${t(DESC[r])}</small></span></a>`).join('')}</div>`).join('');
}
let installEvt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; });
function vParams() {
  const s = S.settings;
  return ph(t('Settings'), t('Your business, language, currency, security and backup')) + `
  <div class="gm">
    <div class="stack">
    ${card(t('Language'), `<div class="choices">${Object.entries(LANGS).map(([k, [l]]) => `<label><input type="radio" name="lang" value="${k}" data-chg="lang" ${k === LANG ? 'checked' : ''}><span>${ic('globe', 'sm')}${l}</span></label>`).join('')}</div><p class="muted xs" style="margin:-6px 0 0">${t('Screens, receipts, invoices and messages use this language.')}</p>`, { sub: t('Language of the app') })}
    <form id="setform" class="card"><div class="card-h"><div><h3>${t('My business')}</h3><p>${t('This information appears on receipts and invoices')}</p></div></div>
      <div class="row2">${fld(t('Business name'), inp('biz', s.biz, `placeholder="${esc(t('My Shop'))}"`))}${fld(t('Manager name'), inp('owner', s.owner, `placeholder="${esc(t('Optional'))}"`))}</div>
      <div class="row2">${fld(t('Phone'), inp('phone', s.phone, 'type="tel"'))}${fld(t('Country code'), inp('cc', s.cc, 'inputmode="numeric"'), t('DR Congo: 243 (for WhatsApp)'))}</div>
      ${fld(t('Address'), inp('address', s.address))}
      ${fld(t('Owner’s WhatsApp for the daily summary'), inp('ownerPhone', s.ownerPhone || '', 'type="tel" inputmode="tel" placeholder="099…"'))}
      ${fld(t('Message at the bottom of receipts'), inp('footer', s.footer, `placeholder="${esc(t('Thank you for your business!'))}"`))}
      <div class="card-h" style="margin-top:8px"><div><h3>${t('Currency')}</h3></div></div>
      ${fld(t('Today’s rate: francs for 1 dollar'), `<div class="ig"><span class="pre">FC</span><input class="inp" name="rate" inputmode="decimal" value="${s.rate}"></div>`, t('Change it when the rate moves. Past transactions keep their own rate.'))}
      <p class="flabel">${t('Main currency for reports')}</p>${curChoices(s.mainCur, 'mainCur')}
      <button class="btn pri">${ic('check')}<span>${t('Save')}</span></button>
    </form>
    </div>
    <div class="stack">
      ${card(t('Backup file'), `<p class="muted sm" style="margin:0 0 14px">${t('Last backup:')} <b style="color:var(--ink)">${s.lastBackup ? fdate(s.lastBackup) : t('never')}</b>. ${t('Your data is only on this phone: make a copy every week.')}</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap">${btn(t('Back up'), 'backup', { cls: 'pri', icon: 'download' })}${navigator.canShare ? btn(t('Send'), 'backupShare', { icon: 'share' }) : ''}<label class="btn">${ic('upload')}<span>${t('Restore')}</span><input type="file" accept=".json,application/json" data-chg="restore" hidden></label></div>`, { sub: t('A copy of all your data') })}
      ${teamCard()}
      ${cloudCard()}
      ${ifbCard()}
      ${automationCard()}
      ${printerCard()}
      ${card(t('Install on the phone'), `<p class="muted sm" style="margin:0 0 14px">${t('In Chrome: menu ⋮ → “Add to Home screen”. The app then works without internet.')}</p>${installEvt ? btn(t('Install now'), 'install', { cls: 'pri', icon: 'smartphone' }) : ''}`)}
      ${card(t('Training'), `<div style="display:flex;gap:8px;flex-wrap:wrap">${btn(t('Sample data'), 'demo', { icon: 'flask' })}${btn(t('Erase everything'), 'reset', { cls: 'danger', icon: 'trash' })}</div><p class="muted xs" style="margin:12px 0 0">${t('{n} transaction|{n} transactions', { n: TX().length })} · ${t('{n} sale|{n} sales', { n: S.sales.length })} · ${t('{n} product|{n} products', { n: S.products.length })}</p>`)}
    </div>
  </div>`;
}
const HELP = [
  ['Set today’s rate', 'Settings: how many francs make 1 dollar. Change it when the rate moves.'],
  ['Add your products', 'Products & stock: name, selling price, cost price, stock. Tick “returnable packaging” for bottled drinks.'],
  ['Sell', 'Point of sale: tap the products, then “Charge”. Cash, Mobile Money, card or credit. The receipt is created.'],
  ['Record the money that comes in and goes out', 'Cash book: “Income” when you receive money, “Expense” when you pay (rent, transport, taxes…).'],
  ['Follow the credits', 'Credits: who owes you, who you owe. SMS or WhatsApp reminder in one tap.'],
  ['Pay the staff', 'Staff: “Pay” or “Advance”. Everything is recorded in the expenses.'],
  ['Look at the results', 'Reports (day, month, year) and Analysis (weak points and advice).'],
  ['Back up', 'Every week: Settings → Back up, then send the file to WhatsApp.']
];
function vAide() {
  return ph(t('Help'), t('Getting started in 8 steps')) + `<div class="gm">${card('', `<div class="steps">${HELP.map(([ti, d], i) => `<div><span class="sn">${i + 1}</span><div><b>${t(ti)}</b><p>${t(d)}</p></div></div>`).join('')}</div>`)}
  <div class="stack">${card(t('No internet needed'), `<p class="muted sm" style="margin:0">${t('Everything works offline. Internet is only used to send a WhatsApp message, send the backup or read a paper automatically.')}</p>`)}
  ${card(t('Privacy'), `<p class="muted sm" style="margin:0 0 12px">${t('Your data stays on this phone. No account, no advertising, no tracking.')}</p><a class="btn sm" href="privacy.html#${LANG}" target="_blank" rel="noopener">${ic('shield', 'sm')}<span>${t('Privacy policy')}</span></a>`)}
  ${card(t('How profit is calculated'), `<p class="muted sm" style="margin:0">${t('Sales − cost of the goods sold − expenses (salaries, rent, taxes, transport, fees…) − stock losses. Stock purchases and currency exchange are not expenses.')}</p>`)}</div></div>`;
}

/* ---------- Backup / export ---------- */
function download(name, blob) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); }
async function backupObj() {
  const photos = {}; for (const k of await DB.keys('photos')) photos[k] = await DB.get('photos', k);
  return { app: 'macaissepro', when: nowISO(), state: S, photos };
}
const backupBlob = async () => new Blob([JSON.stringify(await backupObj())], { type: 'application/json' });
const slug = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
const backupName = () => `${slug(t('backup'))}-${slug(bizName())}-${today()}.json`;
async function doBackup(share) {
  const blob = await backupBlob();
  if (share) {
    const file = new File([blob], backupName(), { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: t('Ma Caisse backup') }); } catch { return; } }
    else return toast(t('Sharing is not available on this device'), 'bad');
  } else download(backupName(), blob);
  S.settings.lastBackup = nowISO(); audit('backup'); commit(); renderShell(); render(); toast(t('Backup done'), 'ok');
}
async function restore(file) {
  try {
    const d = JSON.parse(await file.text());
    if (d.app !== 'macaissepro' || !d.state) throw new Error(t('This file is not a Ma Caisse backup'));
    confirmBox(t('Replace all current data with the backup from <b>{d}</b>?', { d: fdate(d.when) }), () => applyRestore(d, 'file'), t('Restore'), 'pri', 'upload');
  } catch (e) { toast(e.message, 'bad'); }
}
async function applyRestore(d, from) {
  const lang = LANG;
  S = migrateUsers(migrate(d.state)); S.settings.lang = lang;
  for (const [k, v] of Object.entries(d.photos || {})) await DB.put('photos', k, v);
  if (!S.users.some(u => u.id === SESSION.uid && !u.off)) SESSION.uid = null;
  audit('restore', `${from === 'cloud' ? t('Cloud backup') : t('Backup file')} · ${fdate(d.when)}`);
  await commit(); toast(t('Data restored'), 'ok');
  if (teamOn() && !SESSION.uid) lockApp(); else { renderShell(); render(); }
}
function exportCSV() {
  const p = ui.rap, en = LANG === 'en', sep = en ? ',' : ';';
  const rows = [[t('Date'), t('Type'), t('Category'), t('Description'), t('Amount'), t('Currency'), t('Method'), t('Rate')]];
  TX().filter(x => x.date.startsWith(p.val)).sort((a, b) => a.date.localeCompare(b.date)).forEach(x => rows.push([fdate(x.date), x.type === 'in' ? t('Income') : t('Expense'), catName(x.cat), x.note, en ? String(x.amount) : String(x.amount).replace('.', ','), x.cur, mName(x.method), x.rate]));
  const csv = '﻿' + rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(sep)).join('\r\n');
  download(`${slug(t('transactions'))}-${p.val}.csv`, new Blob([csv], { type: 'text/csv;charset=utf-8' }));
}
function printHTML(html) { $('#print').innerHTML = html; setTimeout(() => window.print(), 60); }
function printReport() {
  const p = ui.rap, cur = ui.rapCur || S.settings.mainCur, st = stats(p.val, cur);
  const rows = o => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<tr><td>${esc(catName(k))}</td><td class="n">${fmt(v, cur)}</td></tr>`).join('');
  printHTML(`<div class="doc"><div class="dh"><div><h2>${esc(bizName())}</h2><p class="muted">${t('Report')} · ${periodLabel(p)}</p></div><div class="tag">${t('REPORT')}</div></div>
  <table><tr><td>${t('Sales and invoices')}</td><td class="n">${fmt(st.revenue, cur)}</td></tr><tr><td>${t('Cost of goods sold')}</td><td class="n">${fmt(st.cogs, cur)}</td></tr><tr><td>${t('Expenses')}</td><td class="n">${fmt(st.charges, cur)}</td></tr><tr><td>${t('Stock losses')}</td><td class="n">${fmt(st.losses, cur)}</td></tr><tr class="gt"><td>${t('Net profit')}</td><td class="n">${fmt(st.profit, cur)}</td></tr></table>
  <h3>${t('Expenses by category')}</h3><table>${rows(st.byOut)}</table><h3>${t('Income by category')}</h3><table>${rows(st.byIn)}</table>
  <h3>${t('Products sold')}</h3><table><tr><th>${t('Product')}</th><th class="n">${t('Qty')}</th><th class="n">${t('Sales')}</th><th class="n">${t('Profit')}</th></tr>${Object.entries(st.byProd).sort((a, b) => b[1].profit - a[1].profit).map(([n, v]) => `<tr><td>${esc(n)}</td><td class="n">${v.qty}</td><td class="n">${fmt(v.rev, cur)}</td><td class="n">${fmt(v.profit, cur)}</td></tr>`).join('')}</table></div>`);
}

/* ---------- Sample data (training): one simple week, always the same, written in the current language ---------- */
function loadDemo() {
  const d = DEFAULT(); d.settings = { ...S.settings, biz: S.settings.biz || t('Grace Drinks Depot'), owner: S.settings.owner || t('Manager'), recNo: 1, invNo: 1 };
  d.users = S.users; d.audit = S.audit;
  const rate = d.settings.rate, DR = t('Drinks'), day = k => addDays(today(), k);
  const P = (name, price, cost, stock, min, bottle, deposit = 0, cat = DR, unit = t('bottle')) => ({ id: uid(), name, cat, unit, cur: 'USD', price, cost, stock, min, bottle, deposit, empties: bottle ? 24 : 0, created: day(-30) });
  d.products = [P(t('Beer 72cl'), 2.2, 1.7, 96, 12, true, 0.3), P(t('Soda 33cl'), 0.8, 0.6, 48, 12, true, 0.15), P(t('Water 1.5L'), 0.7, 0.45, 24, 6, false), P(t('Sugar 1kg'), 1.8, 1.4, 12, 8, false, 0, t('Food'), t('bag'))];
  const [beer, soda, water, sugar] = d.products;
  Object.assign(beer, { supplier: t('Brewery'), pack: 12 }); Object.assign(soda, { supplier: t('Brewery'), pack: 12 }); Object.assign(water, { supplier: t('Brewery'), pack: 6 });
  d.people = [{ id: uid(), role: 'employe', name: 'Jean Mukendi', job: t('Packaging'), phone: '0990000001', salary: 120, cur: 'USD' }, { id: uid(), role: 'employe', name: 'Grâce Mbuyi', job: t('Packaging / sales'), phone: '0990000002', salary: 120, cur: 'USD' }];
  d.contacts = [{ name: 'Maman Odile', phone: '0990000003' }, { name: 'Bar Le Palmier', phone: '0990000004' }, { name: t('Brewery'), phone: '0990000005' }];
  const out = (k, h, amount, cur, cat, note, extra = {}) => d.tx.push({ id: uid(), type: 'out', date: `${day(k)}T${h}`, amount, cur, rate, cat, method: 'cash', note, ...extra });
  d.tx.push({ id: uid(), type: 'in', date: `${day(-7)}T07:00`, amount: 200, cur: 'USD', rate, cat: 'owner_in', method: 'cash', note: t('Cash float') });
  d.tx.push({ id: uid(), type: 'in', date: `${day(-7)}T07:00`, amount: 100000, cur: 'CDF', rate, cat: 'owner_in', method: 'cash', note: t('Cash float') });
  // [day, time, items [product, qty], payment, customer, currency, empties kept by the customer]
  const PLAN = [
    [-6, '09:15', [[beer, 6]], 'cash'], [-6, '16:40', [[soda, 12], [water, 2]], 'mobile'],
    [-5, '10:05', [[beer, 12]], 'cash'], [-5, '18:20', [[sugar, 1], [water, 3]], 'cash', '', 'CDF'],
    [-4, '11:30', [[beer, 24]], 'credit', 'Bar Le Palmier', 'USD', 6], [-4, '17:10', [[soda, 6]], 'pos'],
    [-3, '09:45', [[beer, 6], [sugar, 2]], 'cash', 'Maman Odile'], [-2, '12:00', [[water, 4]], 'mobile'],
    [-2, '19:05', [[beer, 12], [soda, 6]], 'cash'], [-1, '10:20', [[sugar, 2]], 'cash'],
    [-1, '17:55', [[beer, 6], [water, 2]], 'pos'], [0, '09:30', [[soda, 6]], 'cash', 'Maman Odile']
  ];
  for (const [k, h, lines, method, client = '', cur = 'USD', kept = 0] of PLAN) {
    const date = `${day(k)}T${h}`;
    const items = lines.map(([p, qty]) => { p.stock -= qty; p.lastSold = date; return { pid: p.id, name: p.name, qty, price: rnd(conv(p.price, 'USD', cur, rate), cur), cost: p.cost, costCur: 'USD', bottle: p.bottle, back: p.bottle ? qty - kept : 0 }; });
    const total = rnd(sum(items.map(i => i.price * i.qty)), cur), credit = method === 'credit';
    const sale = { id: uid(), no: 'R-' + String(d.settings.recNo++).padStart(5, '0'), date, client, phone: '', items, cur, rate, sub: total, discount: 0, total, paid: credit ? 0 : total, change: 0, method };
    const nt = t('Sale {no}', { no: sale.no });
    d.sales.push(sale);
    items.forEach(i => { if (i.bottle) d.bottles.push({ id: uid(), date, client, pid: i.pid, out: i.qty, back: i.back, saleId: sale.id }); });
    if (credit) d.credits.push({ id: uid(), kind: 'client', name: client, phone: '0990000004', amount: total, cur, rate, date, due: day(3), note: nt, saleId: sale.id, payments: [] });
    else d.tx.push({ id: uid(), type: 'in', date, amount: total, cur, rate, cat: 'sales', method, note: nt + (client ? ' – ' + client : ''), saleId: sale.id });
  }
  out(-3, '15:00', 15000, 'CDF', 'transport', t('Daily expenses'));
  out(-2, '09:00', 50, 'USD', 'rent', t('Depot rent'));
  out(-1, '18:00', 20, 'USD', 'salaries', t('Advance') + ' – Jean Mukendi', { partyId: d.people[0].id });
  d.invoices.push({ id: uid(), no: 'F-' + String(d.settings.invNo++).padStart(4, '0'), date: `${day(-4)}T10:00`, due: day(10), client: 'Hôtel Kivu', phone: '', address: 'Goma', cur: 'USD', rate, tax: 0, note: '', items: [{ desc: t('Beer 72cl (crates of 12)'), qty: 5, price: 25 }], payments: [] });
  d.reminders.push({ id: uid(), title: t('Pay the monthly tax (DGI)'), date: day(3), amount: 60, cur: 'USD', repeat: 'month', note: '', done: false });
  d.reminders.push({ id: uid(), title: t('Depot rent'), date: day(10), day: +day(10).slice(8, 10), amount: 50, cur: 'USD', repeat: 'month', note: '', done: false, cat: 'rent', method: 'cash', auto: true });
  S = d;
}

/* =====================================================================
   SHELL, ROUTER & EVENTS
   ===================================================================== */
const ROUTES = {
  home: vHome, dash: vDash, vente: vVente, caisse: vCaisse, credits: vCredits, menu: vMenu, produits: vProduits, emballages: vEmballages, personnel: vPersonnel,
  factures: vFactures, rappels: vRappels, rapports: vRapports, analyse: vAnalyse, scanner: vScanner, params: vParams, aide: vAide, journal: vJournal
};
const route = () => { const h = location.hash.replace(/^#\/?/, '').split('?')[0], r = ROUTES[h] ? h : roleHome(); return canSee(r) ? r : roleHome(); };
function renderShell() {
  const s = S.settings, r = route(), al = alerts();
  const late = CR().filter(c => c.kind === 'client' && creditLeft(c) > 0 && c.due && c.due < today()).length;
  const due = S.reminders.filter(x => !x.done && x.date <= today()).length;
  const cnt = { credits: late, rappels: due };
  $('#logo').innerHTML = ic('logo');
  $('#sidenav').innerHTML = NAV.map(([g, items]) => { const its = items.filter(([k]) => canSee(k)); return its.length ? `<div class="nav-g">${t(g)}</div>${its.map(([k, l, i]) => `<a href="#/${k}" class="${r === k ? 'on' : ''}">${ic(i)}<span>${k === 'home' ? homeLabel() : t(l)}</span>${cnt[k] ? `<span class="cnt">${cnt[k]}</span>` : ''}</a>`).join('')}` : ''; }).join('');
  const lb = lastSafe(), old = !lb || daysBetween(lb, today()) >= 7;
  $('#promo').hidden = !can('backup');
  $('#promo').innerHTML = `<span class="pi">${ic('shield')}</span><b>${old ? t('Protect your data') : t('Your data is protected')}</b><p>${lb ? t('Last backup {d}.', { d: fday(lb) }) : t('No backup yet.')} ${old ? t('Make a safety copy.') : ''}</p>${btn(t('Back up'), 'backup', { icon: 'download' })}`;
  const rd = teamOn() && me() ? roleOf(me()) : ROLE_DEFS.manager, MAIN = (rd.tabs || ROLE_DEFS.manager.tabs).map(([k, l, i]) => [k, t(l), i]), fab = rd.fab || 'vente';
  const inMenu = !MAIN.some(([k]) => k === r);
  $('#bnav').innerHTML = MAIN.map(([k, l, i]) => `<a href="#/${k}" class="${r === k || (k === 'menu' && inMenu) ? 'on' : ''}">${k === fab ? `<span class="fab">${ic(i)}</span>` : ic(i)}<span>${l}</span></a>`).join('');
  $('#menuBtn').innerHTML = ic('menu'); $('#menuBtn').setAttribute('aria-label', t('Menu'));
  $('#tbBrand').innerHTML = `<span class="logo">${ic('logo')}</span><span>${esc(bizName())}</span>`;
  $('#searchIcon').innerHTML = ic('search', 'sm');
  $('#gsearch').placeholder = t('Search a product, customer, receipt…');
  $('#langIc').innerHTML = ic('globe', 'sm');
  const ls = $('#langSel'); ls.innerHTML = Object.keys(LANGS).map(k => `<option value="${k}" ${k === LANG ? 'selected' : ''}>${k.toUpperCase()}</option>`).join(''); ls.setAttribute('aria-label', t('Language'));
  $('#bellBtn').innerHTML = ic('bell') + (al.length ? `<span class="dot">${al.length}</span>` : ''); $('#bellBtn').setAttribute('aria-label', t('Alerts'));
  $('#lockBtn').innerHTML = ic('lock'); $('#lockBtn').hidden = !teamOn(); $('#lockBtn').setAttribute('aria-label', t('Log out')); $('#lockBtn').title = t('Log out / switch user');
  const u = me(), pr = $('#prof');
  pr.innerHTML = `${av(u ? u.name : (s.owner || bizName()))}<span><b>${esc(u ? u.name : bizName())}</b><small>${esc(u ? t(roleOf(u).name) : (s.owner || t('Settings')))}</small></span>${ic('down', 'sm')}`;
  $('#pmenu').innerHTML = profMenuHTML();
  netState();
  $('#dl-clients').innerHTML = [...new Set([...S.contacts.map(c => c.name), ...S.people.map(p => p.name)])].map(n => `<option value="${esc(n)}">`).join('');
}
function render() {
  const r = route();
  try { $('#view').innerHTML = ROUTES[r](); }
  catch (e) { console.error(e); $('#view').innerHTML = card('', emptyBox('alert', t('Display error'), esc(e.message), '', 'red')); }
  document.title = routeTitle(r) + ' · Ma Caisse';
  renderShell(); initCharts();
}
function netState() { const on = navigator.onLine; $('#net').className = 'net ' + (on ? 'on' : 'off'); $('#net').innerHTML = `${ic(on ? 'wifi' : 'wifioff', 'sm')}${on ? t('Online') : t('Offline · OK')}`; }
function changeLang(l) {
  if (!LANGS[l] || l === LANG) return;
  setLang(l); S.settings.lang = l; commit(); closeModal(true); render();
  toast(t('Language: {l}', { l: LANGS[l][0] }), 'ok');
}

/* Global search */
function globalSearch(q) {
  const box = $('#sres'); q = q.trim().toLowerCase();
  if (!q) { box.classList.remove('open'); return; }
  const P = S.products.filter(p => !p.archived && p.name.toLowerCase().includes(q)).slice(0, 5);
  const C = [...new Set([...S.contacts.map(c => c.name), ...S.credits.map(c => c.name)])].filter(n => n.toLowerCase().includes(q)).slice(0, 5);
  const R = S.sales.filter(s => s.no.toLowerCase().includes(q)).slice(0, 4);
  const grp = (ti, html) => html ? `<div class="sg">${ti}</div>${html}` : '';
  box.innerHTML = (grp(t('Products'), P.map(p => `<button type="button" data-act="productOpen" data-id="${p.id}"><span class="av sq t-${tone(p.name)}">${esc(initials(p.name))}</span><span><b>${esc(p.name)}</b><br><small class="muted">${fmt(p.price, p.cur)} · ${t('stock {n}', { n: p.stock })}</small></span></button>`).join('')) +
    grp(t('Customers'), C.map(n => { const cr = CR().filter(c => c.name === n && creditLeft(c) > 0); return `<button type="button" data-act="${cr.length ? 'creditOpen' : 'go'}" ${cr.length ? `data-id="${cr[0].id}"` : 'data-to="#/credits"'}>${av(n)}<span><b>${esc(n)}</b><br><small class="muted">${cr.length ? t('{n} open credit|{n} open credits', { n: cr.length }) : t('no credit')}</small></span></button>`; }).join('')) +
    grp(t('Receipts'), R.map(s => `<button type="button" data-act="saleOpen" data-id="${s.id}"><span class="av sq t-green">${ic('receipt', 'sm')}</span><span><b>${s.no}</b><br><small class="muted">${fmt(s.total, s.cur)} · ${fdate(s.date)}</small></span></button>`).join(''))) || `<div class="none">${t('No results for “{q}”', { q: esc(q) })}</div>`;
  box.classList.add('open');
}

const A = {
  go: el => { location.hash = el.dataset.to; },
  closeModal: () => closeModal(),
  openSide: () => $('#side').classList.add('open'),
  closeSide: () => $('#side').classList.remove('open'),
  showAlerts: () => { const al = alerts(); openModal(t('Alerts'), al.length ? `<div class="lst">${al.map(alertRow).join('')}</div>` : emptyBox('checkc', t('All good'), t('No alerts right now.'), '', 'green'), null, { icon: 'bell', sub: t('{n} alert|{n} alerts', { n: al.length }) }); },
  tab: el => { ui[el.dataset.k] = el.dataset.v; if (el.tagName !== 'A') render(); },
  pkind: el => { const p = ui[el.dataset.k]; p.kind = el.dataset.v; p.val = today().slice(0, PK[p.kind]); render(); },
  pshift: el => { shiftP(ui[el.dataset.k], +el.dataset.v); render(); },
  newTx: el => txForm(el.dataset.type),
  txOpen: el => txOpen(el.dataset.id),
  txEdit: el => needOwner(t('Edit a transaction'), () => { const x = S.tx.find(y => y.id === el.dataset.id); txForm(x.type, { ...x }); }, 'editmoney'),
  txDel: el => needOwner(t('Delete a transaction'), () => confirmBox(t('Delete this transaction? It will be removed from the cash book.'), () => { const x = S.tx.find(y => y.id === el.dataset.id); x.void = voidMark(); audit('tx_void', `${fmt(x.amount, x.cur)} · ${x.note || catName(x.cat)}`); commit(); toast(t('Transaction deleted')); }, t('Delete'))),
  photo: (el, e) => { e.preventDefault(); showPhoto(el.dataset.id); },
  exchange: () => exchangeForm(), cashCount: () => cashCountForm(),
  // sales
  addCart: el => { const id = el.dataset.id; cart.items[id] = (cart.items[id] || 0) + 1; render(); },
  cartQty: el => { const id = el.dataset.id; cart.items[id] = Math.max(0, (cart.items[id] || 0) + +el.dataset.v); if (!cart.items[id]) { delete cart.items[id]; delete cart.back[id]; } render(); },
  cartClear: () => { cart.items = {}; cart.back = {}; render(); },
  cartCur: el => { cart.cur = el.dataset.v; render(); },
  posCat: el => { ui.posCat = el.dataset.v; render(); },
  scrollCart: () => $('#cartp')?.scrollIntoView({ behavior: 'smooth' }),
  checkout: () => checkout(),
  saleOpen: el => { const s = S.sales.find(x => x.id === el.dataset.id); if (s) showReceipt(s); },
  printReceipt: el => printReceipt(S.sales.find(s => s.id === el.dataset.id)),
  shareText: async el => { const s = S.sales.find(x => x.id === el.dataset.id), text = receiptText(s); if (navigator.share) { try { await navigator.share({ title: t('Receipt {no}', { no: s.no }), text }); } catch { } } else { try { await navigator.clipboard.writeText(text); toast(t('Receipt copied'), 'ok'); } catch { toast(t('Sharing is not available on this device'), 'bad'); } } },
  voidSale: el => needOwner(t('Void a sale'), () => voidSale(el.dataset.id)),
  // credits
  newCredit: el => creditForm(el.dataset.kind),
  creditOpen: el => creditOpen(el.dataset.id),
  creditPay: el => creditPay(el.dataset.id),
  creditDue: el => needOwner(t('Change a due date'), () => { const c = S.credits.find(x => x.id === el.dataset.id); openModal(t('New due date'), fld(t('Due date'), inp('due', c.due || today(), 'type="date"')), f => { c.due = f.due; audit('credit_due', `${c.name} · ${fday(f.due)}`); commit(); }, { icon: 'calendar', sub: esc(c.name) }); }, 'editmoney'),
  creditDel: el => needOwner(t('Delete a credit'), () => confirmBox(t('Delete this credit? Payments already received stay in the cash book.'), () => { const c = S.credits.find(x => x.id === el.dataset.id); c.void = voidMark(); audit('credit_void', `${c.name} · ${fmt(creditLeft(c), c.cur)}`); commit(); }, t('Delete'))),
  // products
  newProduct: () => needOwner(t('Add a product'), () => productForm(), 'product'), productOpen: el => productOpen(el.dataset.id), productEdit: el => needOwner(t('Edit a product'), () => productForm({ ...prod(el.dataset.id) }), 'product'),
  productDel: el => needOwner(t('Remove a product'), () => confirmBox(t('Remove this product from the list? Its sales history is kept.'), () => { const p = prod(el.dataset.id); p.archived = true; audit('product_remove', p.name); commit(); }, t('Remove')), 'product'),
  restock: el => restockForm(el.dataset.id), adjust: el => needOwner(t('Stock count'), () => adjustForm(el.dataset.id), 'stock'),
  // packaging
  bottleReturn: el => bottleMoveForm('ret', el.dataset.client || ''), bottleLend: () => bottleMoveForm('lend'), bottleSupplier: () => bottleMoveForm('sup', t('Supplier')),
  // staff
  newPerson: () => personForm(), personOpen: el => personOpen(el.dataset.id), personEdit: el => personForm({ ...S.people.find(p => p.id === el.dataset.id) }),
  personDel: el => confirmBox(t('Remove this person? Their payments stay in the history.'), () => { const p = S.people.find(x => x.id === el.dataset.id); p.archived = true; audit('staff_remove', p.name); commit(); }, t('Remove')),
  payPerson: (el, e) => { e.stopPropagation(); payPersonForm(el.dataset.id, !!el.dataset.adv); },
  // invoices
  newInvoice: () => invoiceForm(), invoiceOpen: el => invoiceOpen(el.dataset.id), invoicePay: el => invoicePay(el.dataset.id),
  addLine: () => { $('#lines').insertAdjacentHTML('beforeend', invLine(lineN++)); },
  printInvoice: el => printHTML(invoiceHTML(S.invoices.find(f => f.id === el.dataset.id))),
  invoiceDel: el => confirmBox(t('Delete this invoice and its payments?'), () => { const f = S.invoices.find(x => x.id === el.dataset.id), vd = voidMark(); f.void = vd; S.tx.forEach(x => { if (!x.void && x.invoiceId === f.id) x.void = vd; }); audit('invoice_void', `${f.no} · ${f.client}`); commit(); }, t('Delete')),
  // reminders
  newReminder: () => reminderForm(),
  remDone: el => reminderDone(S.reminders.find(x => x.id === el.dataset.id)),
  remDel: el => { S.reminders = S.reminders.filter(r => r.id !== el.dataset.id); commit(); render(); },
  // reports
  rapCur: el => { ui.rapCur = el.dataset.v; render(); },
  exportCSV: () => exportCSV(), printReport: () => printReport(),
  // scanner
  scanOCR: () => runOCR(),
  scanAmt: el => { ui.scan.amount = +el.dataset.v; render(); },
  scanClear: () => { ui.scan = null; render(); },
  scanAs: el => { const sc = ui.scan, v = el.dataset.v, pre = { amount: sc.amount || '', photoData: sc.data, note: '' }; if (v === 'credit') creditForm('client', pre); else txForm(v, pre); },
  // settings
  backup: () => doBackup(false), backupShare: () => doBackup(true),
  install: async () => { if (installEvt) { installEvt.prompt(); installEvt = null; render(); } },
  demo: () => confirmBox(t('Replace the current data with sample data to learn?'), () => { loadDemo(); audit('demo'); commit(); toast(t('Sample data loaded'), 'ok'); location.hash = '#/dash'; if (!teamOn()) addDemoTeam(); }, t('Load'), 'pri', 'flask'),
  reset: () => confirmBox(t('<b>Erase everything?</b> Sales, credits, products… will be deleted. Make a backup first.'), async () => { const st = S.settings, us = S.users, au = S.audit; S = DEFAULT(); S.users = us; S.audit = au; Object.assign(S.settings, { biz: st.biz, rate: st.rate, lang: st.lang, cc: st.cc, autoLock: st.autoLock }); for (const k of await DB.keys('photos')) await DB.del('photos', k); audit('reset'); commit(); toast(t('Data erased')); }, t('Erase everything'))
};
Object.assign(A, userAct, cloudAct, printAct, ifbAct, autoAct);

document.addEventListener('click', e => {
  if (!e.target.closest('.search')) $('#sres').classList.remove('open');
  if (!e.target.closest('#prof')) profClose();
  const el = e.target.closest('[data-act]');
  if (e.target.closest('.nav a, .brand')) A.closeSide();
  if (!el) return;
  const fn = A[el.dataset.act]; if (!fn) return;
  if (!allowedAct(el.dataset.act)) { e.preventDefault(); toast(t('Your role cannot do this'), 'bad'); return; }
  if (el.closest('#sres')) { $('#sres').classList.remove('open'); $('#gsearch').value = ''; }
  if (el.tagName === 'A' && el.dataset.act !== 'closeModal' && el.dataset.act !== 'tab') e.preventDefault();
  if (el.tagName === 'A' && el.dataset.act === 'closeModal') { closeModal(true); return; }
  try { const r = fn(el, e); if (r && r.catch) r.catch(err => { console.error(err); toast(t('Error: {e}', { e: err.message }), 'bad'); }); }
  catch (err) { console.error(err); toast(t('Error: {e}', { e: err.message }), 'bad'); }
});
document.addEventListener('submit', async e => {
  e.preventDefault();
  if (e.target.id === 'setform') {
    const f = Object.fromEntries(new FormData(e.target)), oldRate = S.settings.rate;
    Object.assign(S.settings, { biz: f.biz.trim(), owner: f.owner.trim(), phone: f.phone, cc: f.cc.replace(/\D/g, '') || '243', address: f.address, footer: f.footer.trim(), ownerPhone: (f.ownerPhone || '').trim(), rate: num(f.rate) || S.settings.rate, mainCur: f.mainCur });
    audit('settings', oldRate !== S.settings.rate ? `${t('Rate')}: ${NF0.format(oldRate)} → ${NF0.format(S.settings.rate)} FC` : bizName());
    commit(); render(); toast(t('Settings saved'), 'ok'); return;
  }
  if (e.target.id !== 'mform' || !modalCb) return;
  const b = e.submitter; if (b) b.disabled = true;
  const fd = {}; for (const [k, v] of new FormData(e.target)) fd[k] = v;
  try { const r = await modalCb(fd, e.target); if (r !== false) { closeModal(); render(); } }
  catch (err) { console.error(err); toast(t('Error: {e}', { e: err.message }), 'bad'); }
  if (b && b.isConnected) b.disabled = false;
});
document.addEventListener('change', async e => {
  const el = e.target, k = el.dataset.chg; if (!k) return;
  if (!allowedChg(k)) { toast(t('Your role cannot do this'), 'bad'); render(); return; }
  if (k === 'lang') return changeLang(el.value);
  if (k === 'closeHour' || k === 'leadDays') { S.settings[k] = +el.value; commit(); render(); return; }
  if (k === 'autoLock') { S.settings.autoLock = +el.value; audit('settings', t('Lock automatically after') + ': ' + el.selectedOptions[0].text); commit(); return; }
  if (k === 'cartSet') { const q = Math.max(0, Math.round(num(el.value))); if (q) cart.items[el.dataset.id] = q; else { delete cart.items[el.dataset.id]; delete cart.back[el.dataset.id]; } render(); }
  if (k === 'cartBack') { cart.back[el.dataset.id] = Math.max(0, Math.round(num(el.value))); render(); }
  if (k === 'scanFile' && el.files[0]) { try { ui.scan = { data: await compressImage(el.files[0], 1800), text: null, amounts: [], amount: null }; render(); } catch { toast(t('This picture cannot be read'), 'bad'); } }
  if (k === 'restore' && el.files[0]) restore(el.files[0]);
});
document.addEventListener('input', e => {
  if (e.target.id === 'gsearch') return globalSearch(e.target.value);
  const k = e.target.dataset.inp; if (!k) return;
  const q = e.target.value.toLowerCase().trim();
  const s = { psearch: '.pgrid .pc', rsearch: '.tbl tbody tr', plist: '.tbl tbody tr' }[k];
  $$(s).forEach(x => { x.style.display = !q || (x.dataset.name || '').includes(q) ? '' : 'none'; });
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { if ($('#modal').classList.contains('open')) closeModal(); $('#sres').classList.remove('open'); A.closeSide(); }
  if (e.key === '/' && !/input|textarea|select/i.test(document.activeElement.tagName)) { e.preventDefault(); $('#gsearch').focus(); }
});
window.addEventListener('hashchange', () => { closeModal(true); A.closeSide(); render(); window.scrollTo(0, 0); });
let rzT; window.addEventListener('resize', () => { clearTimeout(rzT); rzT = setTimeout(() => { if ($('.lc')) render(); }, 250); });
window.addEventListener('online', netState); window.addEventListener('offline', netState);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') commit(); });

/* ---------- Start ---------- */
(async function start() {
  await DB.open();
  try { const saved = await DB.get('kv', 'state'); if (saved) S = migrate(saved); } catch (e) { console.error(e); toast(t('Could not read the data'), 'bad'); }
  migrateUsers(S);
  await cloudInit();
  setTimeout(() => ifbSync(false), 5000);
  // ?lang=fr|es|en forces a language (handy for demo links)
  const q = new URLSearchParams(location.search), ql = q.get('lang');
  if (ql && LANGS[ql]) S.settings.lang = ql;
  setLang(S.settings.lang);
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => { });
  // Demo link: ?demo loads sample data if the device is empty
  if (q.has('demo') && !S.sales.length && !TX().length) { loadDemo(); commit(); }
  render();
  if (q.has('team') && !teamOn()) { await addDemoTeam(); return; }   // ?demo&team: sample data with the demo accounts
  if (runAutoPayments().length) render();
  if (needsSetup()) setupPage(); else if (teamOn()) lockApp();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => { });
})();
