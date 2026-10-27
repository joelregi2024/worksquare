const test = require('node:test'), assert = require('node:assert');
const WF = require('../public/logic.js');
const d = (h, m = 0, day = 1) => new Date(2026, 0, day, h, m).toISOString();
test('hours computed, invalid range gives 0', () => {
  assert.equal(WF.hours(d(8), d(17, 30)), 9.5);
  assert.equal(WF.hours(d(9), d(8)), 0);
});
test('overtime splits above 8h', () => {
  assert.deepEqual(WF.split(10), { regular: 8, overtime: 2 });
  assert.deepEqual(WF.split(6), { regular: 6, overtime: 0 });
});
test('payslip is consistent', () => {
  const p = WF.pay({ monthly: 20800 }, [{ in: d(8), out: d(18) }]); // 2h OT, rate 100/h
  assert.equal(p.otPay, 300); assert.equal(p.ded, 1664);
  assert.equal(p.net, p.base + p.otPay - p.ded);
});
test('open shifts ignored in pay', () => assert.equal(WF.pay({ monthly: 1000 }, [{ in: d(8) }]).otHours, 0));
test('fatigue: long day and short rest', () => {
  assert.equal(WF.fatigue([{ in: d(6), out: d(18) }]), true);
  assert.equal(WF.fatigue([{ in: d(8, 0, 1), out: d(16, 0, 1) }, { in: d(23, 0, 1), out: d(23, 59, 1) }]), true);
  assert.equal(WF.fatigue([{ in: d(8, 0, 1), out: d(16, 0, 1) }, { in: d(8, 0, 2), out: d(16, 0, 2) }]), false);
});
test('complaint IDs unique and increasing', () => {
  assert.equal(WF.newId([]), 'WF-1001'); assert.equal(WF.newId([{ id: 'WF-1005' }]), 'WF-1006');
});
