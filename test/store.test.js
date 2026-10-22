'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { test, assert, near } = require('./run');
const store = require('../lib/store');

function freshStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'momo-test-'));
  store.init(dir);
  return dir;
}

test('创建词库与导入', function () {
  freshStore();
  const b = store.createBook({ name: 'CET4' });
  const parsed = { words: [
    { id: 'w1', word: 'apple', rank: 1, uk: '', us: '', trans: [{ pos: 'n', cn: '苹果', en: '' }], sentences: [], realExam: [], phrases: [], synos: [], rels: [], remMethod: '', exam: [], star: false, shows: 0 },
    { id: 'w2', word: 'bus', rank: 2, uk: '', us: '', trans: [{ pos: 'n', cn: '公交', en: '' }], sentences: [], realExam: [], phrases: [], synos: [], rels: [], remMethod: '', exam: [], star: false, shows: 0 }
  ] };
  const r1 = store.addWords(b.id, parsed.words);
  near(r1.added, 2, 0, '加入2个');
  const r2 = store.addWords(b.id, parsed.words);
  near(r2.added, 0, 0, '重复加入0个');
  near(r2.dup, 2, 0, '重复2个');
  near(store.getWords(b.id).length, 2, 0, '词库共2个');
});

test('学习闭环: 新词→学习→复习→遗忘→重学→掌握', function () {
  freshStore();
  const b = store.createBook({ name: 'T' });
  store.addWords(b.id, [{ id: 'a1', word: 'cat', rank: 1, trans: [{ pos: '', cn: '猫', en: '' }], sentences: [], realExam: [], phrases: [], synos: [], rels: [], remMethod: '', exam: [], star: false, shows: 0 }]);
  const NOW = Date.now();
  let c = store.counts(b.id, NOW);
  near(c.news, 1, 0, '1个新词');
  let q = store.buildQueue(b.id, { sources: { new: true, review: true } });
  near(q.length, 1, 0, '队列1个');
  let r = store.rate(b.id, 'a1', 1, { nowMs: NOW });
  assert(r.ok && r.intervalMin === 10, '不认识→10分钟');
  c = store.counts(b.id, NOW);
  near(c.learning, 1, 0, '学习中1个');
  near(store.statsAll().totals.news, 1, 0, '今日新词1');
  /* 10分钟后复习 */
  r = store.rate(b.id, 'a1', 3, { nowMs: NOW + 11 * 60000 });
  assert(r.intervalMin === 1440, '认识→1天: ' + r.intervalMin);
  r = store.rate(b.id, 'a1', 3, { nowMs: NOW + DAY2() });
  assert(r.prog.st === 2, '毕业后复习状态');
  const beforeS = r.prog.s;
  r = store.rate(b.id, 'a1', 1, { nowMs: NOW + DAY2() + 10 * 86400000 });
  assert(r.prog.st === 3 && r.prog.s < beforeS, '遗忘→重学,S下降');
  r = store.rate(b.id, 'a1', 3, { nowMs: NOW + DAY2() + 10 * 86400000 + 15 * 60000 });
  assert(r.prog.st === 2, '重学毕业');
  store.setFlags(b.id, ['a1'], { master: true });
  c = store.counts(b.id, NOW + DAY2());
  near(c.mastered, 1, 0, '已掌握1个');
  q = store.buildQueue(b.id, { sources: { review: true, new: true, notmaster: true } });
  near(q.length, 0, '掌握后队列为空');
  function DAY2() { return 86400000 + 2 * 60000; }
});

test('每日新词上限', function () {
  freshStore();
  store.updateSettings({ dailyNew: 2 });
  const b = store.createBook({ name: 'L' });
  const words = [];
  for (let i = 1; i <= 5; i++) words.push({ id: 'x' + i, word: 'w' + i, rank: i, trans: [{ pos: '', cn: '中' + i, en: '' }], sentences: [], realExam: [], phrases: [], synos: [], rels: [], remMethod: '', exam: [], star: false, shows: 0 });
  store.addWords(b.id, words);
  let q = store.buildQueue(b.id, { sources: { new: true } });
  near(q.length, 2, 0, '新词队列=每日上限2');
  store.rate(b.id, 'x1', 3, {});
  store.rate(b.id, 'x2', 3, {});
  q = store.buildQueue(b.id, { sources: { new: true } });
  near(q.length, 0, '学满后新词队列=0');
});

test('收藏/未掌握数据源', function () {
  freshStore();
  const b = store.createBook({ name: 'S' });
  store.addWords(b.id, [
    { id: 's1', word: 'one', rank: 1, trans: [{ pos: '', cn: '一', en: '' }], sentences: [], realExam: [], phrases: [], synos: [], rels: [], remMethod: '', exam: [], star: false, shows: 0 },
    { id: 's2', word: 'two', rank: 2, trans: [{ pos: '', cn: '二', en: '' }], sentences: [], realExam: [], phrases: [], synos: [], rels: [], remMethod: '', exam: [], star: false, shows: 0 }
  ]);
  store.setFlags(b.id, ['s1'], { star: true });
  let q = store.buildQueue(b.id, { sources: { star: true } });
  near(q.length, 1, 0, '收藏1个');
  q = store.buildQueue(b.id, { sources: { notmaster: true } });
  near(q.length, 2, 0, '未掌握2个');
});

test('全局熟词: 跨词库同步', function () {
  freshStore();
  const b1 = store.createBook({ name: 'A' });
  const b2 = store.createBook({ name: 'B' });
  const mk = function (id, w) { return { id: id, word: w, rank: 1, trans: [{ pos: '', cn: 'x', en: '' }], sentences: [], realExam: [], phrases: [], synos: [], rels: [], remMethod: '', exam: [], star: false, shows: 0 }; };
  store.addWords(b1.id, [mk('k1', 'the')]);
  store.addWords(b2.id, [mk('k2', 'the'), mk('k3', 'dog')]);
  store.setKnown(['THE'], true);
  near(store.getProg(b1.id).k1.known, true, 'b1标记');
  near(store.getProg(b2.id).k2.known, true, 'b2标记');
  let q = store.buildQueue(b2.id, { sources: { new: true } });
  near(q.length, 1, 0, '熟词不进队列');
  store.setKnown(['the'], false);
  near(store.getProg(b1.id).k1.known, false, '取消标记');
});

test('复习预览 forecast', function () {
  freshStore();
  const b = store.createBook({ name: 'F' });
  store.addWords(b.id, [
    { id: 'f1', word: 'aa', rank: 1, trans: [{ pos: '', cn: '', en: '' }], sentences: [], realExam: [], phrases: [], synos: [], rels: [], remMethod: '', exam: [], star: false, shows: 0 },
    { id: 'f2', word: 'bb', rank: 2, trans: [{ pos: '', cn: '', en: '' }], sentences: [], realExam: [], phrases: [], synos: [], rels: [], remMethod: '', exam: [], star: false, shows: 0 }
  ]);
  const NOW = Date.now();
  store.rate(b.id, 'f1', 4, { nowMs: NOW - 14 * 86400000 }); /* 今天到期 */
  store.rate(b.id, 'f2', 3, { nowMs: NOW }); /* 明天到期(1天) */
  const f = store.forecast(b.id, 7);
  assert(f.days[0].count >= 1, '今天应有到期');
  assert(f.days[1].count >= 1, '明天应有到期');
  const d = store.forecastDetail(b.id, f.days[0].date);
  assert(d.some(function (x) { return x.id === 'f1'; }), '明细含 f1');
});

test('贴纸 CRUD 与空间', function () {
  freshStore();
  const b = store.createBook({ name: 'P' });
  store.addWords(b.id, [{ id: 'p1', word: 'hi', rank: 1, trans: [{ pos: '', cn: '嗨', en: '' }], sentences: [], realExam: [], phrases: [], synos: [], rels: [], remMethod: '', exam: [], star: false, shows: 0 }]);
  const st = store.createSticker({ bookId: b.id, wordId: 'p1', space: '工作', x: 10, y: 20 });
  assert(st.space === '工作', '空间');
  store.updateSticker(st.id, { x: 100 });
  near(store.listStickers()[0].x, 100, 0, '更新位置');
  store.updateSettings({ stickerSpace: '工作' });
  assert(store.getSettings().stickerSpace === '工作', '设置空间');
  store.deleteSticker(st.id);
  near(store.listStickers().length, 0, 0, '删除');
});

test('备份导出导入', function () {
  freshStore();
  const b = store.createBook({ name: 'BK' });
  store.addWords(b.id, [{ id: 'z1', word: 'zoo', rank: 1, trans: [{ pos: '', cn: '动物园', en: '' }], sentences: [], realExam: [], phrases: [], synos: [], rels: [], remMethod: '', exam: [], star: false, shows: 0 }]);
  store.rate(b.id, 'z1', 3, {});
  store.setKnown(['zoo'], false);
  const backup = store.exportAll();
  /* 重置后导入 */
  store.init(fs.mkdtempSync(path.join(os.tmpdir(), 'momo-test2-')));
  store.importAll(JSON.parse(JSON.stringify(backup)));
  near(store.listBooks().length, 1, 0, '恢复1个词库');
  near(store.getWords(store.listBooks()[0].id).length, 1, 0, '恢复1个词');
  const prog = store.getProg(store.listBooks()[0].id);
  assert(prog.z1 && prog.z1.st > 0, '进度恢复');
});

test('widget 取词', function () {
  freshStore();
  const b = store.createBook({ name: 'W' });
  const words = [];
  for (let i = 1; i <= 8; i++) words.push({ id: 'v' + i, word: 'word' + i, rank: i, uk: 'uk' + i, us: 'us' + i, trans: [{ pos: '', cn: '意思' + i, en: '' }], sentences: [], realExam: [], phrases: [], synos: [], rels: [], remMethod: '', exam: [], star: false, shows: 0 });
  store.addWords(b.id, words);
  const ws = store.widgetWords(b.id, 'all', 5);
  near(ws.length, 5, 0, '取5个');
  assert(ws[0].word && ws[0].cn, '字段齐全');
  store.updateSettings({ activeBookId: b.id });
  assert(store.getSettings().activeBookId === b.id, '活动词库');
});
