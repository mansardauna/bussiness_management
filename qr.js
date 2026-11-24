'use strict';
/* =====================================================================
   Ma Caisse — small QR code encoder (no dependencies, works offline).
   Byte mode (UTF-8), error correction level M (~15 %), versions 1–10 (up to 213 bytes).
   qrMatrix(text) → array of rows of booleans (true = dark). qrSVG(text) → <svg> markup.
   ===================================================================== */
const QR_M = { total: [26, 44, 70, 100, 134, 172, 196, 242, 292, 346], ec: [10, 16, 26, 18, 24, 16, 18, 22, 22, 26], blocks: [1, 1, 1, 2, 2, 4, 4, 4, 5, 5] };
const QR_ALIGN = [[], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];

function qrGfMul(x, y) { let z = 0; for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11D); z ^= ((y >>> i) & 1) * x; } return z & 0xFF; }
function qrRsDivisor(deg) {
  const r = new Array(deg).fill(0); r[deg - 1] = 1; let root = 1;
  for (let i = 0; i < deg; i++) { for (let j = 0; j < deg; j++) { r[j] = qrGfMul(r[j], root); if (j + 1 < deg) r[j] ^= r[j + 1]; } root = qrGfMul(root, 0x02); }
  return r;
}
function qrRsRemainder(data, div) {
  const r = new Array(div.length).fill(0);
  for (const b of data) { const f = b ^ r.shift(); r.push(0); div.forEach((d, i) => { r[i] ^= qrGfMul(d, f); }); }
  return r;
}

function qrMatrix(text) {
  const bytes = [...new TextEncoder().encode(String(text))];
  let ver = 0;
  for (let v = 1; v <= 10; v++) {
    const dataCw = QR_M.total[v - 1] - QR_M.ec[v - 1] * QR_M.blocks[v - 1];
    if (4 + (v < 10 ? 8 : 16) + bytes.length * 8 <= dataCw * 8) { ver = v; break; }
  }
  if (!ver) throw new Error('QR: text too long');
  const total = QR_M.total[ver - 1], ecLen = QR_M.ec[ver - 1], nb = QR_M.blocks[ver - 1], dataCw = total - ecLen * nb;

  // 1. Data bits: mode 0100 (byte), length, bytes, terminator, padding
  const bits = [];
  const put = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  put(4, 4); put(bytes.length, ver < 10 ? 8 : 16); bytes.forEach(b => put(b, 8));
  put(0, Math.min(4, dataCw * 8 - bits.length));
  while (bits.length % 8) bits.push(0);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(''), 2));
  for (let pad = 0xEC; data.length < dataCw; pad ^= 0xEC ^ 0x11) data.push(pad);

  // 2. Split into blocks, add Reed-Solomon error correction, interleave
  const shortN = nb - (dataCw % nb), shortLen = Math.floor(dataCw / nb), div = qrRsDivisor(ecLen), blocks = [];
  for (let i = 0, k = 0; i < nb; i++) { const len = shortLen + (i < shortN ? 0 : 1); const d = data.slice(k, k + len); k += len; blocks.push({ d, e: qrRsRemainder(d, div) }); }
  const cw = [];
  for (let i = 0; i <= shortLen; i++) blocks.forEach(b => { if (i < b.d.length) cw.push(b.d[i]); });
  for (let i = 0; i < ecLen; i++) blocks.forEach(b => cw.push(b.e[i]));

  // 3. Function patterns
  const size = ver * 4 + 17;
  const mod = Array.from({ length: size }, () => new Array(size).fill(false));
  const fn = Array.from({ length: size }, () => new Array(size).fill(false));
  const set = (x, y, dark) => { mod[y][x] = dark; fn[y][x] = true; };
  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]])
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx, y = cy + dy, dist = Math.max(Math.abs(dx), Math.abs(dy));
      if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, dist !== 2 && dist !== 4);
    }
  const al = QR_ALIGN[ver - 1], last = al.length - 1;
  al.forEach((ax, i) => al.forEach((ay, j) => {
    if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }));
  const drawFormat = mask => {
    const d = (0 << 3) | mask; let rem = d;                 // level M = 00
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const b = ((d << 10) | rem) ^ 0x5412, g = i => ((b >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) set(8, i, g(i));
    set(8, 7, g(6)); set(8, 8, g(7)); set(7, 8, g(8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, g(i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, g(i));
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, g(i));
    set(8, size - 8, true);                                  // dark module
  };
  drawFormat(0);
  if (ver >= 7) {
    let rem = ver; for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
    const b = (ver << 12) | rem;
    for (let i = 0; i < 18; i++) { const bit = ((b >>> i) & 1) === 1, a = size - 11 + (i % 3), c = Math.floor(i / 3); set(a, c, bit); set(c, a, bit); }
  }

  // 4. Place the codewords in the zigzag
  let n = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let v = 0; v < size; v++) for (let j = 0; j < 2; j++) {
      const x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - v : v;
      if (!fn[y][x] && n < cw.length * 8) { mod[y][x] = ((cw[n >>> 3] >>> (7 - (n & 7))) & 1) === 1; n++; }
    }
  }

  // 5. Try the 8 masks, keep the one with the lowest penalty
  const MASKS = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, x => x % 3 === 0, (x, y) => (x + y) % 3 === 0, (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => (x * y) % 2 + (x * y) % 3 === 0, (x, y) => ((x * y) % 2 + (x * y) % 3) % 2 === 0, (x, y) => ((x + y) % 2 + (x * y) % 3) % 2 === 0];
  const applyMask = m => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && MASKS[m](x, y)) mod[y][x] = !mod[y][x]; };
  const penalty = () => {
    let p = 0, dark = 0;
    for (let y = 0; y < size; y++) for (const horiz of [true, false]) {
      let run = 1;
      for (let x = 1; x <= size; x++) {
        const same = x < size && (horiz ? mod[y][x] === mod[y][x - 1] : mod[x][y] === mod[x - 1][y]);
        if (same) run++; else { if (run >= 5) p += run - 2; run = 1; }
      }
    }
    for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) { const c = mod[y][x]; if (c === mod[y][x + 1] && c === mod[y + 1][x] && c === mod[y + 1][x + 1]) p += 3; }
    mod.forEach(r => r.forEach(c => { if (c) dark++; }));
    return p + Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10;
  };
  let best = 0, bestP = Infinity;
  for (let m = 0; m < 8; m++) { applyMask(m); drawFormat(m); const p = penalty(); if (p < bestP) { bestP = p; best = m; } applyMask(m); }
  applyMask(best); drawFormat(best);
  return mod;
}

function qrSVG(text, label = 'QR code') {
  const m = qrMatrix(text), n = m.length, q = 4, s = n + q * 2;
  let d = '';
  m.forEach((row, y) => row.forEach((c, x) => { if (c) d += `M${x + q},${y + q}h1v1h-1z`; }));
  return `<svg class="qr" viewBox="0 0 ${s} ${s}" role="img" aria-label="${label.replace(/"/g, '&quot;')}" shape-rendering="crispEdges"><rect width="${s}" height="${s}" fill="#fff"/><path d="${d}" fill="#111"/></svg>`;
}
