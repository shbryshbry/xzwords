'use strict';
/* ============================================================
 * 记忆调度算法库（纯函数，主进程与测试共用）
 * - FSRS-4.5（默认权重 w[17]）
 * - 艾宾浩斯箱线（8 级固定间隔）
 * 评分：1=不认识(Again) 2=模糊(Hard) 3=认识(Good) 4=简单(Easy)
 * 卡片状态：0=新词 1=学习中 2=复习中 3=重学中
 * ============================================================ */

const RATING = { AGAIN: 1, HARD: 2, GOOD: 3, EASY: 4 };
const ST = { NEW: 0, LEARN: 1, REVIEW: 2, RELEARN: 3 };

/* FSRS-4.5 官方默认参数 */
const FSRS_W = [
  0.4872, 1.4003, 3.7145, 13.8206, 5.1618, 1.2298, 0.8975, 0.031,
  1.6474, 0.1367, 1.0461, 2.1072, 0.0793, 0.3246, 1.587, 0.2272, 2.8755
];

/* 艾宾浩斯箱线间隔（分钟）：10分钟 1天 2天 4天 7天 15天 30天 60天 */
const EBB_LEVELS = [10, 1440, 2880, 5760, 10080, 21600, 43200, 86400];

const DAY_MIN = 1440;

function clamp(x, lo, hi) { return Math.min(hi, Math.max(lo, x)); }

function newProgress() {
  return { st: 0, due: null, s: 0, d: 0, reps: 0, lapses: 0, last: null, step: 0, level: 0, master: false, known: false };
}

/* FSRS 可提取记忆强度 r(t,S)，t 单位天；t=S 时 r=0.9 */
function retrievability(days, s) {
  if (!(s > 0)) return 0;
  const t = Math.max(0, days);
  return Math.pow(1 + (19 / 81) * (t / s), -0.5);
}

/* 由稳定度求复习间隔（天），期望记忆率 retention */
function intervalDays(s, retention) {
  const r = clamp(retention || 0.9, 0.7, 0.98);
  return Math.max(0.02, (s || 0.1) * (81 / 19) * (Math.pow(r, -2) - 1));
}

function initD(g, w) { return clamp(w[4] - Math.exp(w[5] * (g - 1)) + 1, 1, 10); }

function nextD(d, g, w) {
  const nd = d - w[6] * (g - 3);
  const anchor = initD(4, w);
  return clamp(anchor * (1 - w[7]) + nd * w[7], 1, 10);
}

/* 复习成功后的新稳定度 */
function successS(d, s, r, g, w) {
  const hard = g === 2 ? w[15] : 1;
  const easy = g === 4 ? w[16] : 1;
  const grow = Math.exp(w[8]) * (11 - d) * Math.pow(s, -w[9]) * (Math.exp((1 - r) * w[10]) - 1);
  return s * (1 + Math.max(0, grow) * hard * easy);
}

/* 遗忘后的新稳定度 */
function failureS(d, s, r, w) {
  return w[11] * Math.pow(Math.max(d, 1), -w[12]) * (Math.pow(s + 1, w[13]) - 1) * Math.exp((1 - r) * w[14]);
}

/**
 * 对一张卡做一次记忆反馈。
 * @param prev   进度记录（不修改原对象）
 * @param rating 1..4
 * @param opts   { now:ms, algo:'fsrs'|'ebb', retention, stepsMin:[], relearnStepsMin:[], w:[] }
 * @returns { prog, intervalMin }  intervalMin=下次复习距现在的分钟数
 */
function review(prev, rating, opts) {
  const o = opts || {};
  const now = o.now || Date.now();
  const algo = o.algo === 'ebb' ? 'ebb' : 'fsrs';
  const steps = (Array.isArray(o.stepsMin) && o.stepsMin.length ? o.stepsMin : [10, 1440])
    .map(function (x) { return Math.max(1, x | 0); }).sort(function (a, b) { return a - b; });
  const rsteps = (Array.isArray(o.relearnStepsMin) && o.relearnStepsMin.length ? o.relearnStepsMin : [10])
    .map(function (x) { return Math.max(1, x | 0); }).sort(function (a, b) { return a - b; });
  const w = Array.isArray(o.w) && o.w.length === 17 ? o.w : FSRS_W;
  const ret = clamp(o.retention || 0.9, 0.7, 0.98);

  const p = Object.assign(newProgress(), prev || {});
  p.reps = (p.reps | 0) + 1;
  const lastMs = prev && prev.last ? Date.parse(prev.last) : NaN;
  const elapsedDays = isFinite(lastMs) ? Math.max(0, (now - lastMs) / 86400000) : 0;

  let intervalMin;
  if (algo === 'ebb') {
    /* 艾宾浩斯：箱线升级 */
    if (!p.st) {
      p.st = ST.LEARN;
      if (rating <= 2) p.level = 0;
      else if (rating === 3) p.level = Math.min(1, EBB_LEVELS.length - 1);
      else p.level = Math.min(2, EBB_LEVELS.length - 1);
    } else {
      if (rating === RATING.AGAIN) { p.level = 0; p.lapses = (p.lapses | 0) + 1; }
      else if (rating === RATING.HARD) { /* 原地停留 */ }
      else if (rating === RATING.GOOD) p.level = Math.min((p.level | 0) + 1, EBB_LEVELS.length - 1);
      else p.level = Math.min((p.level | 0) + 2, EBB_LEVELS.length - 1);
    }
    intervalMin = EBB_LEVELS[clamp(p.level | 0, 0, EBB_LEVELS.length - 1)];
  } else {
    const st = p.st | 0;
    if (st === ST.NEW) {
      /* 新词首次反馈 */
      p.d = initD(rating, w);
      p.s = w[clamp(rating, 1, 4) - 1];
      if (rating === RATING.EASY) {
        p.st = ST.REVIEW;
        intervalMin = intervalDays(p.s, ret) * DAY_MIN;
      } else if (rating === RATING.GOOD && steps.length === 1) {
        p.st = ST.REVIEW;
        intervalMin = intervalDays(p.s, ret) * DAY_MIN;
      } else {
        p.st = ST.LEARN;
        p.step = rating === RATING.GOOD ? Math.min(1, steps.length - 1) : 0;
        intervalMin = steps[p.step];
      }
    } else if (st === ST.LEARN) {
      const cur = clamp(p.step | 0, 0, steps.length - 1);
      if (rating === RATING.AGAIN) { p.step = 0; intervalMin = steps[0]; }
      else if (rating === RATING.HARD) { intervalMin = steps[cur]; }
      else if (rating === RATING.GOOD && cur < steps.length - 1) { p.step = cur + 1; intervalMin = steps[p.step]; }
      else {
        /* GOOD 最后一步毕业 / EASY 直接毕业 */
        p.st = ST.REVIEW;
        const s0 = Math.max(p.s || w[2], 0.1);
        const d0 = clamp(p.d || initD(3, w), 1, 10);
        const r = retrievability(elapsedDays, s0);
        p.s = Math.max(s0, successS(d0, s0, r, rating === RATING.EASY ? 4 : 3, w));
        intervalMin = intervalDays(p.s, ret) * DAY_MIN;
      }
    } else if (st === ST.RELEARN) {
      const cur = clamp(p.step | 0, 0, rsteps.length - 1);
      if (rating === RATING.AGAIN) { p.step = 0; intervalMin = rsteps[0]; }
      else if (rating === RATING.HARD) { intervalMin = rsteps[cur]; }
      else {
        p.st = ST.REVIEW;
        const s0 = Math.max(p.s || w[2], 0.1);
        const r = retrievability(elapsedDays, s0);
        p.s = Math.max(s0, successS(clamp(p.d || 5, 1, 10), s0, r, rating === RATING.EASY ? 4 : 3, w));
        intervalMin = intervalDays(p.s, ret) * DAY_MIN;
      }
    } else {
      /* 复习中 */
      const s = Math.max(p.s || 1, 0.1);
      const d = clamp(p.d || 5, 1, 10);
      const r = retrievability(elapsedDays, s);
      if (rating === RATING.AGAIN) {
        p.st = ST.RELEARN; p.step = 0;
        p.lapses = (p.lapses | 0) + 1;
        p.s = failureS(d, s, r, w);
        p.d = nextD(d, 1, w);
        intervalMin = rsteps[0];
      } else {
        p.s = successS(d, s, r, rating, w);
        p.d = nextD(d, rating, w);
        intervalMin = intervalDays(p.s, ret) * DAY_MIN;
      }
    }
  }

  intervalMin = Math.max(1, Math.min(intervalMin, 36500 * DAY_MIN));
  p.last = new Date(now).toISOString();
  p.due = new Date(now + intervalMin * 60000).toISOString();
  return { prog: p, intervalMin: intervalMin };
}

/* 是否到期（未被掌握/熟词屏蔽由调用方过滤） */
function isDue(prog, nowMs) {
  if (!prog || prog.master || prog.known) return false;
  if (!(prog.st > 0) || !prog.due) return false;
  return Date.parse(prog.due) <= (nowMs || Date.now());
}

/* 间隔分钟数 → 中文文案 */
function fmtInterval(min) {
  min = Math.max(1, Math.round(min));
  if (min < 60) return min + '分钟后';
  if (min < DAY_MIN) {
    const h = min / 60;
    return (h >= 10 ? Math.round(h) : Math.round(h * 10) / 10) + '小时后';
  }
  const d = min / DAY_MIN;
  if (d < 60) return (d < 10 ? Math.round(d * 10) / 10 : Math.round(d)) + '天后';
  if (d < 365) return Math.round(d / 30) + '个月后';
  return Math.round(d / 365) + '年后';
}

const RATING_LABELS = ['不认识', '模糊', '认识', '简单'];

const API = {
  RATING: RATING, ST: ST, FSRS_W: FSRS_W, EBB_LEVELS: EBB_LEVELS, DAY_MIN: DAY_MIN,
  newProgress: newProgress, retrievability: retrievability, intervalDays: intervalDays,
  review: review, isDue: isDue, fmtInterval: fmtInterval, clamp: clamp, RATING_LABELS: RATING_LABELS
};
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.SRS = API;
