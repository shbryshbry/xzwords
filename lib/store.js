'use strict';
/* ============================================================
 * 数据层：所有持久化都在主进程完成，原子写（tmp+rename）。
 * 目录结构（userData/data）：
 *   settings.json  books.json  stats.json  known.json  stickers.json
 *   books/<id>.words.json  books/<id>.prog.json
 * ============================================================ */
const fs = require('fs');
const path = require('path');
const srs = require('./srs');
const imp = require('./importer');

let dir = null;
let settings = null;
let books = null;      /* 词库元信息数组 */
let stats = null;      /* { 'YYYY-MM-DD': {new,rev,again} } */
let known = null;      /* 全局熟词（小写单词数组） */
let stickers = null;   /* 桌面贴纸 */
const cache = {};      /* bookId -> { words:[], prog:{} } */

/* ---------- 基础工具 ---------- */
function loadJson(file, def) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) {
    /* 文件损坏时隔离备份，避免静默归零导致"词库消失" */
    try { fs.renameSync(file, file + '.corrupt-' + Date.now()); } catch (e2) {}
    return def;
  }
}
function atomicWrite(file, obj) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj));
  try { fs.renameSync(tmp, file); } catch (e) {
    /* rename 偶发被占用时退化为直接写 */
    fs.writeFileSync(file, JSON.stringify(obj));
    try { fs.unlinkSync(tmp); } catch (e2) {}
  }
}
function rid(prefix) {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
function localDateKey(ms) {
  const d = new Date(ms == null ? Date.now() : ms);
  const p = function (n) { return n < 10 ? '0' + n : '' + n; };
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
function endOfToday(ms) {
  const d = new Date(ms == null ? Date.now() : ms);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

/* ---------- 初始化 ---------- */
function init(dataDir) {
  dir = dataDir;
  fs.mkdirSync(path.join(dir, 'books'), { recursive: true });
  settings = loadJson(path.join(dir, 'settings.json'), null) || defaultSettings();
  books = loadJson(path.join(dir, 'books.json'), null) || [];
  stats = loadJson(path.join(dir, 'stats.json'), null) || {};
  known = loadJson(path.join(dir, 'known.json'), null) || [];
  stickers = loadJson(path.join(dir, 'stickers.json'), null) || [];
}

function defaultSettings() {
  return {
    dailyNew: 20,
    reviewLimit: 200,
    algo: 'fsrs',           /* fsrs | ebb */
    retention: 0.9,
    stepsMin: [10, 1440],   /* 新词学习步骤：10分钟、1天 */
    relearnStepsMin: [10],
    orderMode: 'seq',       /* seq=正序 | rand=乱序 */
    autospeak: true,
    ttsVoice: '',
    ttsRate: 1,
    ttsVariant: 'us',       /* us | uk */
    activeBookId: null,
    stickerSpace: '默认',
    widgetSource: { bookId: '', kind: 'all' },  /* 插件取词来源：''=跟随当前词库 */
    widget: {
      carousel: { on: false, intervalSec: 15, showTrans: true, speak: true, theme: 'green', opacity: 1, w: 360, h: 250 },
      choice: { on: false, sync: true, speak: true, w: 380, h: 330, kbMode: false, opacity: 1 },
      sticker: { showTrans: true, style: 'yellow', opacity: 1, w: 250, h: 170 }
    }
  };
}

function saveSettings() { atomicWrite(path.join(dir, 'settings.json'), settings); }
function saveBooks() { atomicWrite(path.join(dir, 'books.json'), books); }
function saveStats() { atomicWrite(path.join(dir, 'stats.json'), stats); }
function saveKnown() { atomicWrite(path.join(dir, 'known.json'), known); }
function saveStickers() { atomicWrite(path.join(dir, 'stickers.json'), stickers); }
function wordsFile(id) { return path.join(dir, 'books', id + '.words.json'); }
function progFile(id) { return path.join(dir, 'books', id + '.prog.json'); }

/* ---------- 设置 ---------- */
function getSettings() { return settings; }
function updateSettings(patch) {
  deepMerge(settings, patch || {});
  saveSettings();
  return settings;
}
function deepMerge(dst, src) {
  Object.keys(src).forEach(function (k) {
    const v = src[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && dst[k] && typeof dst[k] === 'object' && !Array.isArray(dst[k])) deepMerge(dst[k], v);
    else dst[k] = v;
  });
  return dst;
}

/* ---------- 词库 ---------- */
function findBook(id) { return books.find(function (b) { return b.id === id; }); }

function createBook(opts) {
  const b = {
    id: rid('b'),
    name: (opts && opts.name || '新词库').slice(0, 60),
    desc: (opts && opts.desc || '').slice(0, 200),
    color: (opts && opts.color) || pickColor(),
    createdAt: new Date().toISOString(),
    unitSize: 50,
    seqPos: 0
  };
  books.push(b);
  saveBooks();
  return b;
}
const COLORS = ['#4f7cff', '#00b578', '#ff8f1f', '#8f4bff', '#f53f3f', '#14b8b8', '#e6a23c', '#5c7cfa'];
function pickColor() { return COLORS[books.length % COLORS.length]; }

function deleteBook(id) {
  const i = books.findIndex(function (b) { return b.id === id; });
  if (i < 0) return false;
  books.splice(i, 1);
  saveBooks();
  delete cache[id];
  try { fs.unlinkSync(wordsFile(id)); } catch (e) {}
  try { fs.unlinkSync(progFile(id)); } catch (e) {}
  if (settings.activeBookId === id) { settings.activeBookId = books.length ? books[0].id : null; saveSettings(); }
  for (let k = stickers.length - 1; k >= 0; k--) if (stickers[k].bookId === id) { stickers.splice(k, 1); }
  saveStickers();
  return true;
}

function renameBook(id, name, patch) {
  const b = findBook(id);
  if (!b) return null;
  if (name) b.name = String(name).slice(0, 60);
  if (patch) ['desc', 'color', 'unitSize', 'seqPos', 'spellPos', 'spellMode', 'spellRepeat'].forEach(function (k) {
    if (patch[k] != null) b[k] = patch[k];
  });
  saveBooks();
  return b;
}

function loadBook(id) {
  if (cache[id]) return cache[id];
  const words = loadJson(wordsFile(id), []);
  const prog = loadJson(progFile(id), {});
  cache[id] = { words: words, prog: prog };
  return cache[id];
}
function saveWords(id) { const c = cache[id]; if (c) atomicWrite(wordsFile(id), c.words); }
function saveProg(id) { const c = cache[id]; if (c) atomicWrite(progFile(id), c.prog); }

function getWords(id) { return loadBook(id).words; }
function getProg(id) { return loadBook(id).prog; }
function getBook(id) { return findBook(id); }
function listBookMetas() { return books.slice(); }

/* 汇总一本书的统计 */
function counts(id, nowMs) {
  const now = nowMs || Date.now();
  const eod = endOfToday(now);
  const c = loadBook(id);
  const r = { total: c.words.length, news: 0, learning: 0, dueNow: 0, dueToday: 0, star: 0, mastered: 0, known: 0 };
  c.words.forEach(function (w) {
    const p = c.prog[w.id];
    if (w.star) r.star++;
    if (!p) { r.news++; return; }
    if (p.known) { r.known++; return; }
    if (p.master) { r.mastered++; return; }
    if (!p.st) { r.news++; return; }
    r.learning++;   /* 学习中/重学中/复习中（含未到期的复习词） */
    if (p.due) {
      const due = Date.parse(p.due);
      if (due <= now) r.dueNow++;
      else if (due <= eod) r.dueToday++;
    }
  });
  r.notMaster = r.total - r.mastered - r.known;
  return r;
}

function listBooks() {
  return books.map(function (b) {
    let c = null;
    try { c = counts(b.id); } catch (e) { c = { total: 0 }; }
    return Object.assign({}, b, { wordCount: c.total, counts: c });
  });
}

/* ---------- 词条增删改 ---------- */
function addWords(bookId, words) {
  const c = loadBook(bookId);
  const dd = imp.dedupe(words, c.words);
  c.words = c.words.concat(dd.words);
  /* 新导入的词若在全局熟词中，直接标记 */
  const kset = knownSet();
  dd.words.forEach(function (w) { if (kset.has(w.word.toLowerCase())) c.prog[w.id] = Object.assign(srs.newProgress(), { known: true }); });
  saveWords(bookId); saveProg(bookId);
  return { added: dd.words.length, dup: dd.dup };
}

function deleteWords(bookId, ids) {
  const c = loadBook(bookId);
  const set = {}; (ids || []).forEach(function (x) { set[x] = 1; });
  const before = c.words.length;
  c.words = c.words.filter(function (w) { return !set[w.id]; });
  (ids || []).forEach(function (x) { delete c.prog[x]; });
  saveWords(bookId); saveProg(bookId);
  return before - c.words.length;
}

function updateWord(bookId, wordId, patch) {
  const c = loadBook(bookId);
  const w = c.words.find(function (x) { return x.id === wordId; });
  if (!w) return null;
  if (patch.word != null && String(patch.word).trim()) w.word = String(patch.word).trim();
  if (patch.trans != null) w.trans = patch.trans;
  if (patch.remMethod != null) w.remMethod = String(patch.remMethod);
  if (patch.uk != null) w.uk = String(patch.uk);
  if (patch.us != null) w.us = String(patch.us);
  saveWords(bookId);
  return w;
}

/* ---------- 学习调度 ---------- */
function todayNewCount(nowMs) {
  const d = stats[localDateKey(nowMs)];
  return d && d.news || 0;
}

/**
 * 组一次学习队列
 * opts: { sources:{new,review,star,notmaster}, newLimit, reviewLimit, nmLimit,
 *         range:{start,end} 序号区间(1基), unit:{start,end} 单元区间,
 *         orderMode:'seq'|'rand', nowMs }
 * 范围（单元/序号）对全部来源生效；序号按词库原始顺序（与词库管理页一致）
 */
function buildQueue(bookId, opts) {
  const o = opts || {};
  const src = o.sources || {};
  const now = o.nowMs || Date.now();
  const c = loadBook(bookId);
  const out = [];
  const push = function (w) { if (!out.some(function (x) { return x.id === w.id; })) out.push({ id: w.id, st: c.prog[w.id] ? c.prog[w.id].st : 0 }); };
  const shuffle = function (arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  };

  /* 指定 id 列表（复习预览"提前学"等场景） */
  if (Array.isArray(o.ids)) {
    o.ids.forEach(function (id) {
      const w = c.words.find(function (x) { return x.id === id; });
      if (!w) return;
      const p = c.prog[w.id];
      if (p && (p.master || p.known)) return;
      push(w);
    });
    return out;
  }

  /* 原始顺序索引（与词库管理页/顺序模式的单元划分一致） */
  const rawIdx = {};
  c.words.forEach(function (w, i) { rawIdx[w.id] = i; });
  const unitSize = (findBook(bookId) && findBook(bookId).unitSize) || 50;
  const inRange = function (w) {
    const idx = rawIdx[w.id] || 0;
    if (o.range && (idx + 1 < o.range.start || idx + 1 > o.range.end)) return false;
    if (o.unit) {
      const u = Math.floor(idx / unitSize) + 1;
      if (u < o.unit.start || u > o.unit.end) return false;
    }
    return true;
  };
  const orderMode = o.orderMode || settings.orderMode || 'seq';

  if (src.review) {
    const limit = o.reviewLimit != null ? o.reviewLimit : (settings.reviewLimit > 0 ? settings.reviewLimit : Infinity);
    let dueList = [];
    c.words.forEach(function (w) {
      if (!inRange(w)) return;
      const p = c.prog[w.id];
      if (!p || p.master || p.known || !p.st) return;
      if (!p.due) return;
      const due = Date.parse(p.due);
      if (due <= now) dueList.push({ w: w, due: due });
    });
    dueList.sort(function (a, b) { return a.due - b.due; });
    if (orderMode === 'rand') dueList = shuffle(dueList);
    dueList.slice(0, limit === Infinity ? undefined : limit).forEach(function (x) { push(x.w); });
  }
  if (src.new) {
    const todayN = todayNewCount(now);
    const remain = Math.max(0, (settings.dailyNew || 0) - todayN);
    const limit = o.newLimit != null ? o.newLimit : remain;
    let list = c.words.filter(function (w) {
      if (!inRange(w)) return false;
      const p = c.prog[w.id];
      return !(p && (p.st || p.master || p.known));
    });
    if (orderMode === 'rand') list = shuffle(list);
    list.slice(0, Math.max(0, limit)).forEach(push);
  }
  if (src.star) {
    let list = c.words.filter(function (w) { return w.star && inRange(w); })
      .sort(function (a, b) { return (a.shows || 0) - (b.shows || 0); });
    if (orderMode === 'rand') list = shuffle(list);
    list.slice(0, o.starLimit != null ? o.starLimit : 100).forEach(push);
  }
  if (src.notmaster) {
    let list = c.words.filter(function (w) {
      if (!inRange(w)) return false;
      const p = c.prog[w.id];
      return !(p && (p.master || p.known));
    }).sort(function (a, b) { return (a.shows || 0) - (b.shows || 0); });
    if (orderMode === 'rand') list = shuffle(list);
    list.slice(0, o.nmLimit != null ? o.nmLimit : 50).forEach(push);
  }
  return out;
}

/* 一次记忆反馈 */
function rate(bookId, wordId, rating, opts) {
  const o = opts || {};
  const now = o.nowMs || Date.now();
  const c = loadBook(bookId);
  const w = c.words.find(function (x) { return x.id === wordId; });
  if (!w) return { ok: false, error: 'word-not-found' };
  let p = c.prog[wordId] || srs.newProgress();
  if (p.known) return { ok: false, error: 'known-word' };
  const wasNew = !p.st;
  const r = srs.review(p, rating, {
    now: now,
    algo: settings.algo,
    retention: settings.retention,
    stepsMin: settings.stepsMin,
    relearnStepsMin: settings.relearnStepsMin
  });
  p = r.prog;
  c.prog[wordId] = p;
  saveProg(bookId);
  /* 学习统计 */
  const key = localDateKey(now);
  if (!stats[key]) stats[key] = { news: 0, rev: 0, again: 0 };
  if (wasNew) stats[key].news++; else stats[key].rev++;
  if (rating === 1) stats[key].again++;
  saveStats();
  return { ok: true, prog: p, intervalMin: r.intervalMin, intervalText: srs.fmtInterval(r.intervalMin) };
}

/* 显示次数（会话开始时批量+1） */
function touchShown(bookId, ids) {
  const c = loadBook(bookId);
  let changed = false;
  (ids || []).forEach(function (id) {
    const w = c.words.find(function (x) { return x.id === id; });
    if (w) { w.shows = Math.min((w.shows || 0) + 1, 99999); changed = true; }
  });
  if (changed) saveWords(bookId);
  return ids ? ids.length : 0;
}

function setFlags(bookId, ids, flags) {
  const c = loadBook(bookId);
  const f = flags || {};
  (ids || []).forEach(function (id) {
    const w = c.words.find(function (x) { return x.id === id; });
    if (!w) return;
    if (f.star != null) w.star = !!f.star;
    if (f.master != null || f.reset || f.known != null) {
      let p = c.prog[id] || srs.newProgress();
      if (f.reset) p = srs.newProgress();
      if (f.master != null) p.master = !!f.master;
      if (f.known != null) p.known = !!f.known;
      if (p.master || p.known) { p.st = 0; p.due = null; }
      c.prog[id] = p;
    }
  });
  saveWords(bookId); saveProg(bookId);
  return (ids || []).length;
}

/* ---------- 全局熟词 ---------- */
function knownSet() { return new Set(known.map(function (x) { return String(x).toLowerCase(); })); }
function listKnown() { return known.slice(); }
function setKnown(words, val) {
  const set = knownSet();
  (words || []).forEach(function (w) {
    const k = String(w).toLowerCase().trim();
    if (!k) return;
    if (val) set.add(k); else set.delete(k);
  });
  known = Array.from(set).sort();
  saveKnown();
  /* 同步到所有词库 */
  books.forEach(function (b) {
    const c = loadBook(b.id);
    let changed = false;
    c.words.forEach(function (w) {
      if (!set.has(w.word.toLowerCase())) return;
      const p = c.prog[w.id] || srs.newProgress();
      if (p.known !== !!val) { p.known = !!val; if (val) { p.st = 0; p.due = null; } c.prog[w.id] = p; changed = true; }
    });
    if (changed) saveProg(b.id);
  });
  return known.length;
}

/* ---------- 复习预览 / 统计 ---------- */
function forecast(bookId, days) {
  const c = loadBook(bookId);
  const now = Date.now();
  const buckets = {};
  const day0 = localDateKey(now);
  for (let i = 0; i < (days || 30); i++) {
    const d = new Date(now + i * 86400000);
    buckets[localDateKey(d.getTime())] = 0;
  }
  let overdue = 0;
  c.words.forEach(function (w) {
    const p = c.prog[w.id];
    if (!p || !p.st || p.master || p.known || !p.due) return;
    const due = Date.parse(p.due);
    if (due <= now) { overdue++; return; }
    const k = localDateKey(due);
    if (k in buckets) buckets[k]++;
  });
  const list = Object.keys(buckets).sort().map(function (k) { return { date: k, count: buckets[k] }; });
  if (overdue) list[0].count += overdue;
  return { today: day0, overdue: overdue, days: list };
}

/* 某日到期明细 */
function forecastDetail(bookId, dateKey) {
  const c = loadBook(bookId);
  const now = Date.now();
  const isToday = dateKey === localDateKey(now);
  const dayStart = Date.parse(dateKey + 'T00:00:00') || 0;
  const dayEnd = dayStart + 86400000;
  const out = [];
  c.words.forEach(function (w) {
    const p = c.prog[w.id];
    if (!p || !p.st || p.master || p.known || !p.due) return;
    const due = Date.parse(p.due);
    const hit = isToday ? due <= dayEnd : (due > dayStart && due <= dayEnd);
    if (!hit) return;
    out.push({ id: w.id, word: w.word, cn: (w.trans && w.trans[0] && w.trans[0].cn) || '', due: p.due, st: p.st });
  });
  out.sort(function (a, b) { return Date.parse(a.due) - Date.parse(b.due); });
  return out;
}

function statsAll() {
  const keys = Object.keys(stats).sort();
  let news = 0, rev = 0, again = 0;
  keys.forEach(function (k) { news += stats[k].news || 0; rev += stats[k].rev || 0; again += stats[k].again || 0; });
  return { byDay: stats, keys: keys, totals: { news: news, rev: rev, again: again, days: keys.length } };
}

/* ---------- 顺序模式位置 ---------- */
function getSeq(bookId) { const b = findBook(bookId); return b ? (b.seqPos || 0) : 0; }
function setSeq(bookId, pos) { const b = findBook(bookId); if (b) { b.seqPos = pos | 0; saveBooks(); } }

/* ---------- 桌面贴纸 ---------- */
function listStickers() { return stickers.slice(); }
function createSticker(s) {
  const st = {
    id: rid('s'),
    bookId: s.bookId, wordId: s.wordId,
    x: s.x == null ? null : s.x, y: s.y == null ? null : s.y,
    space: s.space || settings.stickerSpace || '默认',
    style: s.style || (settings.widget && settings.widget.sticker && settings.widget.sticker.style) || 'yellow',
    showTrans: s.showTrans != null ? !!s.showTrans
      : !!(settings.widget && settings.widget.sticker && settings.widget.sticker.showTrans)
  };
  stickers.push(st);
  saveStickers();
  return st;
}
function updateSticker(id, patch) {
  const st = stickers.find(function (x) { return x.id === id; });
  if (!st) return null;
  ['x', 'y', 'space', 'style', 'showTrans', 'wordId', 'bookId', 'w', 'h'].forEach(function (k) {
    if (patch[k] != null) st[k] = patch[k];
  });
  saveStickers();
  return st;
}
function deleteSticker(id) {
  const i = stickers.findIndex(function (x) { return x.id === id; });
  if (i < 0) return false;
  stickers.splice(i, 1);
  saveStickers();
  return true;
}

/* 贴纸/轮播/浮窗取词 */
function widgetWords(bookId, kind, n) {
  const c = loadBook(bookId);
  const now = Date.now();
  let pool = [];
  if (kind === 'due') {
    pool = c.words.filter(function (w) {
      const p = c.prog[w.id];
      return p && p.st && !p.master && !p.known && p.due && Date.parse(p.due) <= now + 86400000;
    });
  } else if (kind === 'new') {
    pool = c.words.filter(function (w) { const p = c.prog[w.id]; return !p || (!p.st && !p.master && !p.known); });
  } else {
    pool = c.words.filter(function (w) { const p = c.prog[w.id]; return !(p && (p.master || p.known)); });
  }
  if (!pool.length) pool = c.words.slice();
  /* 洗牌取前 n */
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
  }
  return pool.slice(0, n || 10).map(function (w) {
    const t0 = (w.trans && w.trans[0]) || {};
    return {
      id: w.id, word: w.word, uk: w.uk, us: w.us,
      pos: t0.pos || '',
      cn: (t0.pos ? t0.pos + '. ' : '') + (t0.cn || ''),
      /* 前几个词义（含词性），供选题做"同词多义"判重 */
      trans: (w.trans || []).slice(0, 4).map(function (t) { return { pos: t.pos || '', cn: t.cn || '' }; })
    };
  });
}

/* ---------- 备份 ---------- */
function exportAll() {
  const data = {
    version: 1, exportedAt: new Date().toISOString(),
    settings: settings, books: books, stats: stats, known: known, stickers: stickers,
    bookData: books.map(function (b) {
      const c = loadBook(b.id);
      return { id: b.id, words: c.words, prog: c.prog };
    })
  };
  return data;
}
function importAll(data) {
  if (!data || !Array.isArray(data.books)) throw new Error('备份文件格式不正确');
  /* 清空现有 */
  books.forEach(function (b) { try { fs.unlinkSync(wordsFile(b.id)); fs.unlinkSync(progFile(b.id)); } catch (e) {} });
  Object.keys(cache).forEach(function (k) { delete cache[k]; });
  settings = deepMerge(defaultSettings(), data.settings || {});
  books = data.books || [];
  stats = data.stats || {};
  known = data.known || [];
  stickers = data.stickers || [];
  (data.bookData || []).forEach(function (bd) {
    if (!bd || !bd.id) return;
    try {
      atomicWrite(wordsFile(bd.id), bd.words || []);
      atomicWrite(progFile(bd.id), bd.prog || {});
    } catch (e) {}
  });
  saveSettings(); saveBooks(); saveStats(); saveKnown(); saveStickers();
  return true;
}

function dataDirPath() { return dir; }

module.exports = {
  init: init, defaultSettings: defaultSettings,
  getSettings: getSettings, updateSettings: updateSettings,
  listBooks: listBooks, listBookMetas: listBookMetas, getBook: getBook,
  createBook: createBook, deleteBook: deleteBook, renameBook: renameBook,
  getWords: getWords, getProg: getProg, counts: counts,
  addWords: addWords, deleteWords: deleteWords, updateWord: updateWord,
  buildQueue: buildQueue, rate: rate, touchShown: touchShown, setFlags: setFlags,
  todayNewCount: todayNewCount,
  knownSet: knownSet, listKnown: listKnown, setKnown: setKnown,
  forecast: forecast, forecastDetail: forecastDetail, statsAll: statsAll,
  getSeq: getSeq, setSeq: setSeq,
  listStickers: listStickers, createSticker: createSticker, updateSticker: updateSticker, deleteSticker: deleteSticker,
  widgetWords: widgetWords,
  exportAll: exportAll, importAll: importAll,
  dataDirPath: dataDirPath, localDateKey: localDateKey
};
