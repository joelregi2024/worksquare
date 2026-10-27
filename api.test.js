const test = require('node:test'), assert = require('node:assert');
process.env.DB_PATH = ':memory:'; process.env.DEMO_PASSWORD = 'pw-test-123';
const { server } = require('../server.js');
let base;
test.before(() => new Promise((r) => server.listen(0, () => { base = 'http://127.0.0.1:' + server.address().port; r(); })));
test.after(() => server.close());
const call = async (p, m = 'GET', b, c) => {
  const r = await fetch(base + p, { method: m, headers: { 'Content-Type': 'application/json', ...(c ? { Cookie: c } : {}) }, body: b ? JSON.stringify(b) : undefined });
  return { r, j: await r.json().catch(() => ({})) };
};
const login = async (e) => (await call('/api/login', 'POST', { email: e, password: 'pw-test-123' })).r.headers.get('set-cookie').split(';')[0];
test('requires login', async () => assert.equal((await call('/api/state')).r.status, 401));
test('bad password rejected', async () => assert.equal((await call('/api/login', 'POST', { email: 'murugan@worksquare.demo', password: 'x' })).r.status, 401));
test('worker sees only own data and cannot update complaints', async () => {
  const c = await login('murugan@worksquare.demo');
  assert.equal((await call('/api/state', 'GET', null, c)).j.workers.length, 1);
  assert.equal((await call('/api/complaints/WF-1001', 'PATCH', { st: 2 }, c)).r.status, 403);
});
test('admin sees all workers', async () => assert.equal((await call('/api/state', 'GET', null, await login('admin@worksquare.demo'))).j.workers.length, 8));
test('check in/out flow', async () => {
  const c = await login('selvi@worksquare.demo');
  assert.equal((await call('/api/checkin', 'POST', {}, c)).r.status, 200);
  assert.equal((await call('/api/checkin', 'POST', {}, c)).r.status, 409);
  assert.equal((await call('/api/checkout', 'POST', {}, c)).r.status, 200);
});
test('complaint lifecycle and validation', async () => {
  const w = await login('ravi@worksquare.demo'), a = await login('admin@worksquare.demo');
  const { j } = await call('/api/complaints', 'POST', { cat: 0, sev: 1, desc: 'Broken light in corridor' }, w);
  assert.match(j.id, /^WF-\d+$/);
  assert.equal((await call('/api/complaints/' + j.id, 'PATCH', { st: 1 }, a)).r.status, 200);
  assert.equal((await call('/api/complaints', 'POST', { cat: 0, sev: 1, desc: 'short' }, w)).r.status, 400);
});
test('path traversal blocked', async () => assert.notEqual((await fetch(base + '/..%2fserver.js')).status, 200));
