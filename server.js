'use strict';
/* WorkSquare server: zero npm dependencies (node:http, node:crypto, node:sqlite). */
const http = require('http'), fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');
const WF = require('./public/logic.js');

const PUB = path.join(__dirname, 'public');
const SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'); // random per boot if unset
const DEMO_PW = process.env.DEMO_PASSWORD || 'worksquare-demo'; // demo accounts only
const db = new DatabaseSync(process.env.DB_PATH || path.join(os.tmpdir(), 'worksquare.db'));

// ---------- database ----------
function setup() {
  db.exec(`CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, email TEXT UNIQUE, name TEXT, role TEXT, ind TEXT, dept TEXT, monthly INTEGER, salt TEXT, pw TEXT);
  CREATE TABLE IF NOT EXISTS recs(id INTEGER PRIMARY KEY, uid INTEGER, tin TEXT, tout TEXT);
  CREATE TABLE IF NOT EXISTS comps(id TEXT PRIMARY KEY, ind TEXT, uid INTEGER, cat INTEGER, sev INTEGER, descr TEXT, created TEXT, st INTEGER);`);
  if (db.prepare('SELECT COUNT(*) n FROM users').get().n) return;
  const H = [8, 9.5, 8, 11, 8.5];
  const add = db.prepare('INSERT INTO users(email,name,role,ind,dept,monthly,salt,pw) VALUES(?,?,?,?,?,?,?,?)');
  const rec = db.prepare('INSERT INTO recs(uid,tin,tout) VALUES(?,?,?)');
  [['c', 'Murugan', 'Site Crew', 18000], ['c', 'Selvi', 'Site Crew', 17000], ['c', 'Karthik', 'Supervisors', 26000], ['c', 'Anitha', 'Safety', 28000],
   ['e', 'Lakshmi', 'Housekeeping', 14000], ['e', 'Ravi', 'Maintenance', 16000], ['e', 'Suresh', 'Security', 15000], ['e', 'Priya', 'Admin', 20000]]
    .forEach(([ind, name, dept, monthly], i) => {
      const salt = crypto.randomBytes(16).toString('hex');
      const id = Number(add.run(name.toLowerCase() + '@worksquare.demo', name, 'worker', ind, dept, monthly, salt, hash(DEMO_PW, salt)).lastInsertRowid);
      for (let d = 1; d <= 5; d++) {
        const s = new Date(); s.setDate(s.getDate() - d); s.setHours(8, 0, 0, 0);
        rec.run(id, s.toISOString(), new Date(+s + H[(i + d) % 5] * 36e5).toISOString());
      }
    });
  const salt = crypto.randomBytes(16).toString('hex');
  add.run('admin@worksquare.demo', 'Employer Admin', 'admin', 'c', 'Management', 0, salt, hash(DEMO_PW, salt));
  const now = new Date().toISOString(), c = db.prepare('INSERT INTO comps VALUES(?,?,?,?,?,?,?,?)');
  c.run('WF-1001', 'c', 2, 0, 2, 'Loose planks on level 3 scaffolding.', now, 0);
  c.run('WF-1002', 'c', 1, 2, 1, 'Worked 11 hours two days in a row.', now, 1);
  c.run('WF-1003', 'e', 5, 0, 1, 'Wet floor near the hostel stairs, no sign.', now, 0);
  c.run('WF-1004', 'e', 7, 1, 0, 'Night shifts assigned back to back.', now, 2);
}
const hash = (pw, salt) => crypto.scryptSync(pw, salt, 32).toString('hex');

// ---------- auth (HMAC-signed, HttpOnly cookie) ----------
const sign = (s) => crypto.createHmac('sha256', SECRET).update(s).digest('base64url');
const safeEq = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
function userFrom(req) {
  const m = /(?:^|;\s*)wf=([^;]+)/.exec(req.headers.cookie || '');
  const [uid, exp, sig] = m ? m[1].split('.') : [];
  if (!sig || +exp < Date.now() || !safeEq(sig, sign(uid + '.' + exp))) return null;
  return db.prepare('SELECT id,email,name,role,ind,dept,monthly FROM users WHERE id=?').get(+uid) || null;
}
const cookie = (req, v, age) => `wf=${v}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}` + (req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '');
const fails = new Map(); // simple in-memory login throttle: 10 failures / 15 min / IP
const throttled = (ip) => { const f = fails.get(ip); return f && f.reset > Date.now() && f.n >= 10; };
const fail = (ip) => { const f = fails.get(ip); fails.set(ip, f && f.reset > Date.now() ? { n: f.n + 1, reset: f.reset } : { n: 1, reset: Date.now() + 9e5 }); };

// ---------- API ----------
const send = (res, code, obj, hdr = {}) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...hdr }); res.end(JSON.stringify(obj)); };
const readBody = (req) => new Promise((ok, no) => {
  let s = ''; req.on('data', (c) => { s += c; if (s.length > 1e4) { no(new Error('Too large')); req.destroy(); } });
  req.on('end', () => { try { ok(s ? JSON.parse(s) : {}); } catch { no(new Error('Bad JSON')); } });
});
const int = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;

async function api(req, res, p) {
  const m = req.method;
  if (m !== 'GET' && !(req.headers['content-type'] || '').includes('application/json')) return send(res, 415, { error: 'JSON only' });
  const b = m === 'GET' ? {} : await readBody(req);
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();

  if (p === '/api/login' && m === 'POST') {
    if (throttled(ip)) return send(res, 429, { error: 'Too many attempts. Try later.' });
    const u = db.prepare('SELECT * FROM users WHERE email=?').get(String(b.email || '').toLowerCase().slice(0, 100));
    if (!u || !safeEq(hash(String(b.password || '').slice(0, 100), u.salt), u.pw)) { fail(ip); return send(res, 401, { error: 'Invalid email or password' }); }
    fails.delete(ip);
    const exp = Date.now() + 8 * 36e5;
    return send(res, 200, { ok: true }, { 'Set-Cookie': cookie(req, `${u.id}.${exp}.${sign(u.id + '.' + exp)}`, 28800) });
  }
  if (p === '/api/logout' && m === 'POST') return send(res, 200, { ok: true }, { 'Set-Cookie': cookie(req, '', 0) });

  const u = userFrom(req);
  if (!u) return send(res, 401, { error: 'Login required' });
  const admin = u.role === 'admin';

  if (p === '/api/state' && m === 'GET') {
    const w = admin ? '' : ' AND id=' + u.id, r = admin ? '' : ' WHERE uid=' + u.id, c = admin ? '' : ' WHERE uid=' + u.id; // u.id is a trusted integer
    return send(res, 200, {
      user: { id: u.id, name: u.name, role: u.role, ind: u.ind },
      workers: db.prepare(`SELECT id,ind,name,dept,monthly FROM users WHERE role='worker'${w}`).all(),
      recs: db.prepare(`SELECT uid AS wid, tin AS "in", tout AS "out" FROM recs${r}`).all(),
      comps: db.prepare(`SELECT id,ind,uid AS wid,cat,sev,descr AS "desc",created AS "at",st FROM comps${c} ORDER BY created DESC`).all(),
    });
  }
  if (p === '/api/checkin' && m === 'POST' && !admin) {
    if (db.prepare('SELECT 1 FROM recs WHERE uid=? AND tout IS NULL').get(u.id)) return send(res, 409, { error: 'Already checked in' });
    db.prepare('INSERT INTO recs(uid,tin) VALUES(?,?)').run(u.id, new Date().toISOString());
    return send(res, 200, { ok: true });
  }
  if (p === '/api/checkout' && m === 'POST' && !admin) {
    const r = db.prepare('UPDATE recs SET tout=? WHERE uid=? AND tout IS NULL').run(new Date().toISOString(), u.id);
    return r.changes ? send(res, 200, { ok: true }) : send(res, 409, { error: 'Not checked in' });
  }
  if (p === '/api/complaints' && m === 'POST' && !admin) {
    const d = typeof b.desc === 'string' ? b.desc.trim() : '';
    if (!int(b.cat, 0, 4) || !int(b.sev, 0, 2) || d.length < 10 || d.length > 500) return send(res, 400, { error: 'Invalid report' });
    const id = WF.newId(db.prepare('SELECT id FROM comps').all());
    db.prepare('INSERT INTO comps VALUES(?,?,?,?,?,?,?,0)').run(id, u.ind, u.id, b.cat, b.sev, d, new Date().toISOString());
    return send(res, 200, { id });
  }
  const mt = /^\/api\/complaints\/(WF-\d+)$/.exec(p);
  if (mt && m === 'PATCH') {
    if (!admin) return send(res, 403, { error: 'Admins only' });
    if (!int(b.st, 0, 2)) return send(res, 400, { error: 'Invalid status' });
    return db.prepare('UPDATE comps SET st=? WHERE id=?').run(b.st, mt[1]).changes ? send(res, 200, { ok: true }) : send(res, 404, { error: 'Not found' });
  }
  return send(res, admin ? 403 : 404, { error: 'Not allowed' });
}

// ---------- static files + server ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.svg': 'image/svg+xml' };
const SEC = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; frame-ancestors 'none'" };

const server = http.createServer(async (req, res) => {
  for (const [k, v] of Object.entries(SEC)) res.setHeader(k, v);
  try {
    const url = new URL(req.url, 'http://x');
    if (url.pathname.startsWith('/api/')) return await api(req, res, url.pathname);
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
    const file = path.normalize(path.join(PUB, decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)));
    if (!file.startsWith(PUB + path.sep)) { res.writeHead(404); return res.end('Not found'); }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); return res.end('Not found'); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' }); res.end(data);
    });
  } catch (e) { send(res, 400, { error: e.message === 'Bad JSON' || e.message === 'Too large' ? e.message : 'Bad request' }); }
});

setup();
module.exports = { server };
if (require.main === module) server.listen(process.env.PORT || 8080, () => console.log('WorkSquare listening'));
