'use strict';
const { test, assert, near } = require('./run');
const srs = require('../lib/srs');

const NOW = Date.parse('2026-10-20T10:00:00+08:00');
const DAY = 86400000;
const EBB_LAST = srs.EBB_LEVELS.length - 1;

test('新词-认识: 进入1天学习步骤', function () {
  const r = srs.review(srs.newProgress(), 3, { now: NOW });
  assert(r.prog.st === srs.ST.LEARN, '应为学习状态');
  assert(r.prog.step === 1, 'step=1');
  near(r.intervalMin, 1440, 0.1, '间隔1天');
  assert(srs.fmtInterval(r.intervalMin) === '1天后', '文案1天后, 实际=' + srs.fmtInterval(r.intervalMin));
});

test('新词-简单: 直接毕业≈2周', function () {
  const r = srs.review(srs.newProgress(), 4, { now: NOW });
  assert(r.prog.st === srs.ST.REVIEW, '应毕业');
  near(r.intervalMin / 1440, 13.8, 1.5, '默认S0(4)=13.82天');
});

test('新词-不认识: 10分钟后', function () {
  const r = srs.review(srs.newProgress(), 1, { now: NOW });
  assert(r.prog.st === srs.ST.LEARN, '学习状态');
  near(r.intervalMin, 10, 0.1, '10分钟');
});

test('学习中-认识最后一步: 毕业进入复习', function () {
  let p = srs.newProgress();
  p = srs.review(p, 3, { now: NOW }).prog;        /* 1天后 */
  const r = srs.review(p, 3, { now: NOW + DAY }); /* 毕业 */
  assert(r.prog.st === srs.ST.REVIEW, '应毕业');
  assert(r.intervalMin > 1440, '间隔应大于1天: ' + r.intervalMin);
  assert(/天后/.test(srs.fmtInterval(r.intervalMin)), '文案: ' + srs.fmtInterval(r.intervalMin));
});

test('复习-到期判断', function () {
  const p = srs.newProgress();
  const r = srs.review(p, 4, { now: NOW - 20 * DAY }).prog;
  assert(srs.isDue(r, NOW), '20天前毕业的卡现在应到期');
  const r2 = srs.review(p, 4, { now: NOW - 1000 }).prog;
  assert(!srs.isDue(r2, NOW), '刚学的卡不应到期');
  assert(!srs.isDue(null, NOW), '空进度不算到期');
});

test('复习-不认识: 进入重学, 稳定度下降', function () {
  let p = srs.review(srs.newProgress(), 4, { now: NOW - 30 * DAY }).prog; /* S=13.8 */
  const before = p.s;
  const r = srs.review(p, 1, { now: NOW });
  assert(r.prog.st === srs.ST.RELEARN, '应重学');
  assert(r.prog.s < before, '稳定度应下降');
  near(r.intervalMin, 10, 0.1, '10分钟后重学');
  assert(r.prog.lapses === 1, '遗忘次数+1');
});

test('重学-认识: 回到复习, 间隔变短', function () {
  let p = srs.review(srs.newProgress(), 4, { now: NOW - 30 * DAY }).prog;
  p = srs.review(p, 1, { now: NOW - 1000 * 60 }).prog; /* 遗忘 */
  const r = srs.review(p, 3, { now: NOW });
  assert(r.prog.st === srs.ST.REVIEW, '应回复习');
  assert(r.intervalMin > 60 && r.intervalMin < 30 * 1440, '间隔合理: ' + r.intervalMin);
});

test('复习-认识: 间隔延长且S增长', function () {
  let p = srs.review(srs.newProgress(), 4, { now: NOW - 14 * DAY }).prog; /* S≈13.8 */
  const before = p.s;
  const r = srs.review(p, 3, { now: NOW });
  assert(r.prog.s > before, 'S应增长');
  assert(r.intervalMin > 14 * 1440, '间隔应>2周: ' + (r.intervalMin / 1440).toFixed(1) + '天');
});

test('FSRS区间单调: 简单>认识>模糊', function () {
  const mk = function (g) {
    const p = srs.review(srs.newProgress(), 4, { now: NOW - 10 * DAY }).prog;
    return srs.review(p, g, { now: NOW }).intervalMin;
  };
  assert(mk(4) > mk(3), '简单应比认识长');
  assert(mk(3) > mk(2), '认识应比模糊长');
});

test('艾宾浩斯: 升级/遗忘/封顶', function () {
  const ebb = function (now) { return { now: now, algo: 'ebb' }; };
  let p = srs.review(srs.newProgress(), 3, ebb(NOW)).prog;
  assert(p.level === 1 && dueMin(p, NOW) === 1440, '认识→1天');
  p = srs.review(p, 3, ebb(NOW + DAY)).prog;
  assert(p.level === 2 && dueMin(p, NOW + DAY) === 2880, '再认识→2天');
  p = srs.review(p, 1, ebb(NOW + 3 * DAY)).prog;
  assert(dueMin(p, NOW + 3 * DAY) === 10, '遗忘→10分钟');
  p = srs.review(p, 4, ebb(NOW + 3 * DAY + 3600000)).prog;
  assert(p.level === 2, '简单+2级');
  p = srs.review(p, 3, ebb(NOW + 3 * DAY + 7200000)).prog;
  assert(p.level === 3, '再认识+1级');
  p = srs.review(p, 3, ebb(NOW + 10 * DAY)).prog;
  p = srs.review(p, 3, ebb(NOW + 17 * DAY)).prog;
  p = srs.review(p, 3, ebb(NOW + 24 * DAY)).prog;
  p = srs.review(p, 3, ebb(NOW + 31 * DAY)).prog;
  p = srs.review(p, 3, ebb(NOW + 38 * DAY)).prog;
  assert(p.level === EBB_LAST, '升级封顶, level=' + p.level);
  function dueMin(pp, from) { return Math.round((Date.parse(pp.due) - from) / 60000); }
});

test('间隔文案', function () {
  assert(srs.fmtInterval(10) === '10分钟后', srs.fmtInterval(10));
  assert(srs.fmtInterval(90) === '1.5小时后', srs.fmtInterval(90));
  assert(srs.fmtInterval(1440) === '1天后', srs.fmtInterval(1440));
  assert(srs.fmtInterval(4320) === '3天后', srs.fmtInterval(4320));
  assert(srs.fmtInterval(45 * 1440) === '45天后', srs.fmtInterval(45 * 1440));
  assert(/个月后/.test(srs.fmtInterval(75 * 1440)), srs.fmtInterval(75 * 1440));
});

test('进度不变式: 原对象不被修改', function () {
  const p = srs.newProgress();
  const snap = JSON.stringify(p);
  srs.review(p, 3, { now: NOW });
  assert(JSON.stringify(p) === snap, '原对象应保持不变');
});
