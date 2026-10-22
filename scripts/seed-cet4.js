'use strict';
/* 首次交付预置：清空演示数据，导入用户提供的 CET-4 词库 */
const path = require('path');
const fs = require('fs');
const store = require('../lib/store');

const CET4 = process.argv[2] || 'D:\\浏览器下载\\1521164635506_CET4_2\\CET4_2.json';
const dataDir = process.env.APPDATA ? path.join(process.env.APPDATA, 'MoMo背单词', 'data') : null;
if (!dataDir || !fs.existsSync(CET4)) {
  console.error('环境不满足：APPDATA=' + process.env.APPDATA + ' 词库=' + CET4);
  process.exit(1);
}

/* 清掉冒烟测试遗留数据，全新开始 */
fs.rmSync(dataDir, { recursive: true, force: true });
store.init(dataDir);

const text = fs.readFileSync(CET4, 'utf8');
const t0 = Date.now();
const parsed = require('../lib/importer').parseImport(text);
const book = store.createBook({ name: 'CET-4 英语四级核心词汇', desc: '大学英语四级考试大纲词汇（含音标/释义/例句/短语/真题）', color: '#4f7cff' });
const r = store.addWords(book.id, parsed.words);
store.updateSettings({ activeBookId: book.id, dailyNew: 20 });

console.log('词库: ' + book.name);
console.log('解析: ' + parsed.words.length + ' 词 (坏行 ' + parsed.bad + ')');
console.log('导入: 新增 ' + r.added + '，重复 ' + r.dup);
console.log('状态: ' + JSON.stringify(store.counts(book.id)));
console.log('耗时: ' + (Date.now() - t0) + 'ms');
console.log('数据目录: ' + dataDir);
