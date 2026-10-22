'use strict';
/* 导出内置词库：把当前数据目录里的三大词库（按名称匹配）导出为应用自带资源
 * 用法: node scripts/export-builtin.js
 * 产物: assets/bundled-books.json（首次启动自动导入）
 */
const fs = require('fs');
const path = require('path');
const store = require('../lib/store');

const BUILTIN = ['英语四级全词库', '英语六级全词库', '考研英语全词库'];
const dataDir = process.env.APPDATA ? path.join(process.env.APPDATA, 'xz背单词', 'data') : null;
if (!dataDir) { console.error('缺少 APPDATA'); process.exit(1); }
store.init(dataDir);

const books = [];
BUILTIN.forEach(function (name) {
  const meta = store.listBooks().find(function (b) { return b.name === name; });
  if (!meta) { console.warn('⚠ 跳过（未找到）: ' + name); return; }
  books.push({
    name: meta.name, desc: meta.desc, color: meta.color,
    words: store.getWords(meta.id)
  });
});

const out = { version: 1, exportedAt: new Date().toISOString(), books: books };
const dest = path.join(__dirname, '..', 'assets', 'bundled-books.json');
fs.writeFileSync(dest, JSON.stringify(out));
console.log('✓ 导出 ' + books.length + ' 个内置词库，共 ' +
  books.reduce(function (n, b) { return n + b.words.length; }, 0) + ' 词 → ' + dest +
  ' (' + Math.round(fs.statSync(dest).size / 1048576 * 10) / 10 + ' MB)');
