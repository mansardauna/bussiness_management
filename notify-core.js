'use strict';
/* =====================================================================
   Ma Caisse — shared by the app and the service worker (no screen code here):
   what needs the owner's attention today, and what to order.
   Pure functions: saved data in, plain lists out. Text goes through the `tt` function given.
   ===================================================================== */

const mcDay = (iso, n) => {
  const d = new Date(String(iso).slice(0, 10) + 'T12:00'); d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
/* Translation without the screen code (same rules as t() in core.js). */
function mcT(lang, s, v) {
  let r = s;
  if (lang && lang !== 'en' && typeof TR !== 'undefined' && TR[s]) r = TR[s][lang === 'fr' ? 0 : 1] || s;
  if (r.includes('|')) { const n = Math.abs(v && v.n != null ? +v.n : 0), f = r.split('|'); r = (lang === 'fr' ? n >= 2 : n !== 1) ? f[1] : f[0]; }
  return v ? r.replace(/\{(\w+)\}/g, (m, k) => v[k] ?? m) : r;
}
const mcLive = a => (a || []).filter(x => !x.void);
const mcPaid = x => (x.payments || []).reduce((a, p) => a + (+p.amount || 0), 0);
function mcLastSupplier(st, pid) {
  const l = (st.stockLog || []).filter(x => x.pid === pid && x.reason === 'purchase' && x.who).pop();
  return l ? l.who : '';
}

/* What to order: average sales of the last `window` days, enough stock for `cover` days
   after a delivery that takes `lead` days, rounded up to the product's pack size. */
function mcOrderPlan(st, today, o = {}) {
  const win = o.window || 14, lead = st.settings?.leadDays ?? 2, cover = st.settings?.coverDays ?? 7, from = mcDay(today, 1 - win), sold = {};
  for (const s of mcLive(st.sales)) if (s.date.slice(0, 10) >= from && s.date.slice(0, 10) <= today) for (const i of s.items || []) sold[i.pid] = (sold[i.pid] || 0) + (+i.qty || 0);
  return (st.products || []).filter(p => !p.archived).map(p => {
    const perDay = (sold[p.id] || 0) / win, stock = Math.max(0, +p.stock || 0), min = +p.min || 0;
    const daysLeft = perDay ? stock / perDay : stock <= min ? 0 : Infinity;
    let qty = Math.ceil(perDay * (lead + cover) + min - stock);
    if (!perDay && stock <= min) qty = Math.max(1, min * 2 - stock);
    const pack = Math.max(1, Math.round(+p.pack || 1));
    if (qty > 0) qty = Math.ceil(qty / pack) * pack;
    return { pid: p.id, name: p.name, unit: p.unit || '', perDay, daysLeft, stock, qty: qty > 0 ? qty : 0, pack, cost: +p.cost || 0, cur: p.cur || 'USD', supplier: p.supplier || mcLastSupplier(st, p.id), urgent: stock <= min || daysLeft <= lead + 2 };   // 2 days' margin: orders are rarely sent the same minute
  }).filter(x => x.qty > 0 && (x.urgent || x.daysLeft <= lead + cover)).sort((a, b) => a.daysLeft - b.daysLeft || a.name.localeCompare(b.name));
}

/* Everything that needs attention today, short lines for a phone notification. */
function mcDue(st, today, tt, hour = 0) {
  const out = [], left = c => c.amount - mcPaid(c);
  const late = mcLive(st.credits).filter(c => c.kind === 'client' && left(c) > 0.004 && c.due && c.due < today);
  if (late.length) out.push({ to: '#/credits', text: tt('{n} overdue customer credit|{n} overdue customer credits', { n: late.length }) });
  const debts = mcLive(st.credits).filter(c => c.kind === 'fournisseur' && left(c) > 0.004 && c.due && c.due <= mcDay(today, 3));
  if (debts.length) out.push({ to: '#/credits', text: tt('{n} supplier debt to pay|{n} supplier debts to pay', { n: debts.length }) });
  for (const r of (st.reminders || []).filter(r => !r.done && !r.auto && r.date <= mcDay(today, 2)))
    out.push({ to: '#/rappels', text: `${r.title} · ${r.date < today ? tt('Overdue') : r.date === today ? tt('Today') : tt('In {n} days', { n: 2 })}` });
  const order = mcOrderPlan(st, today).filter(x => x.urgent);
  if (order.length) out.push({ to: '#/produits', text: tt('{n} product to reorder|{n} products to reorder', { n: order.length }) + ': ' + order.slice(0, 3).map(x => x.name).join(', ') });
  const closed = d => (st.closings || []).some(c => c.date === d), sold = d => mcLive(st.sales).some(s => s.date.startsWith(d));
  const y = mcDay(today, -1);
  if (sold(y) && !closed(y)) out.push({ to: '#/caisse', text: tt('Yesterday was not closed') });
  if (hour >= (st.settings?.closeHour ?? 18) && sold(today) && !closed(today)) out.push({ to: '#/caisse', text: tt('Time to close the day') });
  const un = mcLive(st.tx).filter(x => x.ifbUnmatched).length;
  if (un) out.push({ to: '#/caisse', text: tt('{n} IFB payment to match|{n} IFB payments to match', { n: un }) });
  return out;
}
