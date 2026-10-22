'use strict';
/* ============================================================
 * 预置词库合并导入：四级/六级/考研 全词库
 * 用法: node scripts/seed-all.js [词库下载目录]
 * 目录下需有各词书的 zip 解压产物（<时间戳>_<书名>/<书名>.json）
 * 合并策略：同词取"信息最丰富"的词条（例句/真题/短语/释义最多者），
 *          按字母序重排 rank，保证单元划分与顺序模式整齐。
 * ============================================================ */
const fs = require('fs');
const path = require('path');
const store = require('../lib/store');
const imp = require('../lib/importer');

const DL = process.argv[2] || 'D:\\deep软件zj\\词库下载';
const CET4_2 = 'D:\\浏览器下载\\1521164635506_CET4_2\\CET4_2.json';
const dataDir = process.env.APPDATA ? path.join(process.env.APPDATA, 'xz背单词', 'data') : null;
if (!dataDir) { console.error('缺少 APPDATA 环境'); process.exit(1); }

function find(sub, name) {
  const hits = fs.readdirSync(DL).filter(d => d.includes(sub));
  if (!hits.length) throw new Error('找不到目录: ' + sub);
  return path.join(DL, hits[0], name);
}
const SOURCES = {
  'CET4_1': find('1521164649209_CET4_1', 'CET4_1.json'),
  'CET4_2': CET4_2,
  'CET4_3': find('1521164643060_CET4_3', 'CET4_3.json'),
  'CET6_1': find('1521164668667_CET6_1', 'CET6_1.json'),
  'CET6_2': find('1524052554766_CET6_2', 'CET6_2.json'),
  'CET6_3': find('1521164633851_CET6_3', 'CET6_3.json'),
  'KaoYan_1': find('1521164669833_KaoYan_1', 'KaoYan_1.json'),
  'KaoYan_2': find('1521164654696_KaoYan_2', 'KaoYan_2.json'),
  'KaoYan_3': find('1521164658897_KaoYan_3', 'KaoYan_3.json')
};

/* 词条信息丰富度：真题例句/例句/短语/释义/记忆法/真题题 */
function rich(w) {
  return (w.realExam || []).length * 3 + (w.sentences || []).length * 2 +
    (w.phrases || []).length + (w.trans || []).length +
    (w.remMethod ? 1 : 0) + (w.exam || []).length * 2;
}

function merge(keys) {
  const byWord = new Map();
  let dup = 0;
  keys.forEach(function (k) {
    const r = imp.parseImport(fs.readFileSync(SOURCES[k], 'utf8'));
    if (r.bad) console.warn('  ⚠ ' + k + ' 坏行 ' + r.bad);
    r.words.forEach(function (w) {
      const key = w.word.toLowerCase();
      const old = byWord.get(key);
      if (!old) { byWord.set(key, w); return; }
      dup++;
      if (rich(w) > rich(old)) byWord.set(key, w);   /* 取更丰富的词条 */
    });
  });
  const words = [...byWord.values()]
    .sort(function (a, b) { return a.word.toLowerCase() < b.word.toLowerCase() ? -1 : 1; });
  words.forEach(function (w, i) { w.rank = i + 1; });
  return { words: words, dup: dup };
}

/* 全新开始 */
fs.rmSync(dataDir, { recursive: true, force: true });
store.init(dataDir);

const PLANS = [
  { name: '英语四级全词库', desc: '四级考试全词（大纲+真题+核心，含音标/词性/释义/例句/短语/真题）· 词库来源：百词斩', color: '#4f7cff', files: ['CET4_1', 'CET4_2', 'CET4_3'] },
  { name: '英语六级全词库', desc: '六级考试全词（大纲+真题+核心，含音标/词性/释义/例句/短语/真题）· 词库来源：百词斩', color: '#00b578', files: ['CET6_1', 'CET6_2', 'CET6_3'] },
  { name: '考研英语全词库', desc: '考研英语全词（大纲+真题+核心，含音标/词性/释义/例句/短语/真题）· 词库来源：百词斩', color: '#f53f3f', files: ['KaoYan_1', 'KaoYan_2', 'KaoYan_3'] }
];

let first = null;
for (const p of PLANS) {
  const m = merge(p.files);
  const b = store.createBook({ name: p.name, desc: p.desc, color: p.color });
  store.addWords(b.id, m.words);
  if (!first) first = b;
  const c = store.counts(b.id);
  const noPos = m.words.filter(function (w) { return !(w.trans || []).some(function (t) { return t.pos; }); }).length;
  console.log('✓ ' + p.name + ': ' + m.words.length + ' 词（合并去重 ' + m.dup + '，无词性 ' + noPos + '）');
}
store.updateSettings({ activeBookId: first.id, dailyNew: 20 });
console.log('完成。数据目录: ' + dataDir);
