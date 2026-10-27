/* Pure business logic (works in browser as window.WF and in Node for tests). */
(function (root, factory) {
  if (typeof module === 'object') module.exports = factory(); else root.WF = factory();
})(this, function () {
  // Configurable rules: standard hours/day, overtime multiplier, deduction %, workdays/month, max hours/day, min rest hours
  const RULES = { std: 8, otx: 1.5, ded: 0.08, workdays: 26, maxDay: 10, minRest: 10 };
  const round = (n) => Math.round(n * 100) / 100;
  const hours = (i, o) => { const h = (new Date(o) - new Date(i)) / 36e5; return h > 0 ? round(h) : 0; };
  const split = (h, r = RULES) => ({ regular: Math.min(h, r.std), overtime: round(Math.max(0, h - r.std)) });
  function pay(w, recs, r = RULES) {
    let ot = 0;
    recs.forEach((x) => { if (x.out) ot += split(hours(x.in, x.out), r).overtime; });
    const rate = w.monthly / (r.workdays * r.std);
    const otPay = round(ot * rate * r.otx), ded = round(w.monthly * r.ded);
    return { base: w.monthly, otHours: round(ot), otPay, ded, net: round(w.monthly + otPay - ded) };
  }
  // Flags any day over maxDay hours, or rest between shifts under minRest hours.
  function fatigue(recs, r = RULES) {
    const done = recs.filter((x) => x.out).sort((a, b) => a.in.localeCompare(b.in));
    return done.some((x, i) =>
      hours(x.in, x.out) > r.maxDay ||
      (i > 0 && (new Date(x.in) - new Date(done[i - 1].out)) / 36e5 < r.minRest));
  }
  const newId = (list) => 'WF-' + (Math.max(1000, ...list.map((c) => +c.id.slice(3) || 0)) + 1);
  return { RULES, hours, split, pay, fatigue, newId };
});
