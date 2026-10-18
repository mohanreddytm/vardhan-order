const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'data', 'db.json');
const PUBLIC = path.join(__dirname, 'public');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const STATUSES = ['new', 'production', 'polish', 'packing', 'partial', 'dispatched', 'hold', 'returned'];

function ago(n) {
  return new Date(Date.now() - n * 864e5).toISOString();
}

function seed() {
  const rows = [
    ['Gupta Traders Ambala', 'Kadai No.10', 200, 'pcs', 185, 'dispatched', 200, 'Second row on the sheet looked like a repeat', 6],
    ['Sharma Bartan Bhandar Karnal', 'Gilas 300ml', 30, 'dozen', 260, 'hold', 0, 'Old dues 1.8L, Suresh ji to clear', 5],
    ['Bansal & Sons Rohtak', 'Tope No.6', 120, 'pcs', 340, 'polish', 0, 'Waiting on polish', 5],
    ['Jain Crockery Panipat', 'Kadhai No 10', 150, 'pcs', 192, 'production', 0, 'Sent twice on WhatsApp, check before making', 5],
    ['Mehra Kitchenware Jalandhar', 'Kadai No.10', 300, 'pcs', 180, 'partial', 300, '180 gone on 4th, 120 on 6th', 4],
    ['New Delhi Steel House', 'Bhagona 8L', 60, 'pcs', 410, 'polish', 0, '', 4],
    ['Verma Utensils Sonipat', 'Kadhai No 10', 180, 'kg', null, 'new', 0, 'Rate to be confirmed', 2],
    ['Gupta Traders Ambala', 'Bhagona 8L', 40, 'pcs', 400, 'polish', 0, '', 2]
  ];
  const orders = rows.map((r, i) => {
    const sent = r[5] === 'partial' ? 120 : r[5] === 'dispatched' ? r[2] : 0;
    return {
      id: 'VS-' + String(i + 1).padStart(4, '0'),
      party: r[0], item: r[1], qty: r[2], unit: r[3], rate: r[4],
      status: r[5], dispatched: sent, note: r[7], created: ago(r[8]),
      history: [{ status: r[5], at: ago(r[8]), by: 'Kunal' }]
    };
  });
  orders[4].dispatched = 180;
  const polish = [
    { id: 'P-001', karigar: 'Pappu', kgOut: 420, orderRef: '', sent: ago(6), pcsBack: 1180, shortKg: 6, closed: true },
    { id: 'P-002', karigar: 'Pappu', kgOut: 150, orderRef: 'VS-0003', sent: ago(5), pcsBack: null, shortKg: null, closed: false }
  ];
  return { seq: orders.length, pseq: polish.length, orders, polish };
}

function load() {
  if (!fs.existsSync(DB_FILE)) save(seed());
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function save(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function norm(s) {
  return String(s).toLowerCase().replace(/kadhai/g, 'kadai').replace(/[^a-z0-9]/g, '');
}

function readBody(req) {
  return new Promise(resolve => {
    let raw = '';
    req.on('data', c => (raw += c));
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch (e) { resolve({}); }
    });
  });
}

function send(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

function stamp(order, status, by) {
  order.status = status;
  order.history.push({ status, at: new Date().toISOString(), by: by || 'unknown' });
}

async function api(req, res, url) {
  const db = load();
  if (req.method === 'GET' && url === '/api/state') return send(res, 200, db);

  const b = await readBody(req);

  if (req.method === 'POST' && url === '/api/orders') {
    if (!b.party || !b.item || !(Number(b.qty) > 0)) return send(res, 400, { error: 'party, item and qty are needed' });
    const dup = db.orders.find(o =>
      norm(o.party) === norm(b.party) && norm(o.item) === norm(b.item) &&
      o.qty === Number(b.qty) && o.status !== 'dispatched' && o.status !== 'returned');
    if (dup && !b.force) return send(res, 409, { duplicateOf: dup.id });
    db.seq += 1;
    const order = {
      id: 'VS-' + String(db.seq).padStart(4, '0'),
      party: b.party.trim(), item: b.item.trim(), qty: Number(b.qty),
      unit: b.unit || 'pcs', rate: b.rate ? Number(b.rate) : null,
      status: 'new', dispatched: 0, note: b.note || '',
      created: new Date().toISOString(), history: []
    };
    stamp(order, 'new', b.by);
    db.orders.unshift(order);
    save(db);
    return send(res, 200, order);
  }

  let m = url.match(/^\/api\/orders\/([\w-]+)\/(status|dispatch)$/);
  if (req.method === 'POST' && m) {
    const order = db.orders.find(o => o.id === m[1]);
    if (!order) return send(res, 404, { error: 'no such order' });
    if (m[2] === 'status') {
      if (!STATUSES.includes(b.status)) return send(res, 400, { error: 'bad status' });
      if (b.status === 'hold' && !b.note) return send(res, 400, { error: 'say why it is on hold' });
      if (b.note) order.note = b.note;
      stamp(order, b.status, b.by);
    } else {
      const q = Number(b.qty);
      if (!(q > 0) || order.dispatched + q > order.qty) return send(res, 400, { error: 'quantity does not fit' });
      order.dispatched += q;
      stamp(order, order.dispatched >= order.qty ? 'dispatched' : 'partial', b.by);
    }
    save(db);
    return send(res, 200, order);
  }

  if (req.method === 'POST' && url === '/api/polish') {
    if (!b.karigar || !(Number(b.kgOut) > 0)) return send(res, 400, { error: 'karigar and weight are needed' });
    db.pseq += 1;
    const lot = {
      id: 'P-' + String(db.pseq).padStart(3, '0'), karigar: b.karigar.trim(),
      kgOut: Number(b.kgOut), orderRef: b.orderRef || '', sent: new Date().toISOString(),
      pcsBack: null, shortKg: null, closed: false
    };
    db.polish.unshift(lot);
    save(db);
    return send(res, 200, lot);
  }

  m = url.match(/^\/api\/polish\/([\w-]+)\/receive$/);
  if (req.method === 'POST' && m) {
    const lot = db.polish.find(p => p.id === m[1]);
    if (!lot) return send(res, 404, { error: 'no such lot' });
    lot.pcsBack = Number(b.pcs);
    lot.shortKg = Number(b.shortKg || 0);
    lot.closed = true;
    save(db);
    return send(res, 200, lot);
  }

  send(res, 404, { error: 'not found' });
}

http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url.startsWith('/api/')) return api(req, res, url);
  const file = path.join(PUBLIC, url === '/' ? 'index.html' : url);
  if (!file.startsWith(PUBLIC) || !fs.existsSync(file)) {
    res.writeHead(404);
    return res.end('not found');
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'text/plain' });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log('Running on http://localhost:' + PORT));
