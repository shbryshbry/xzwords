'use strict';
const fs = require('fs');
const { test, assert, near } = require('./run');
const imp = require('../lib/importer');

/* 真实词库文件可选：本机不存在时自动跳过相关用例（可用环境变量 MOMO_CET4 指定路径） */
const CET4 = process.env.MOMO_CET4 || 'D:\\浏览器下载\\1521164635506_CET4_2\\CET4_2.json';
const HAS_CET4 = fs.existsSync(CET4);
const it = function (cond, name, fn) { if (cond) test(name, fn); };

it(HAS_CET4, '解析用户真实 CET4 词库 (JSONL)', function () {
  const text = fs.readFileSync(CET4, 'utf8');
  const r = imp.parseImport(text);
  assert(r.format === 'jsonl', '格式应为 jsonl: ' + r.format);
  near(r.words.length, 3739, 0, '应解析出3739个词, 实际=' + r.words.length);
  assert(r.bad === 0, '不应有坏行: ' + r.bad);
});

it(HAS_CET4, '抽查 abandon 的字段映射', function () {
  const text = fs.readFileSync(CET4, 'utf8');
  const r = imp.parseImport(text);
  const w = r.words.find(function (x) { return x.word === 'abandon'; });
  assert(w, '应包含 abandon');
  assert(w.id === 'CET4_2_2', 'id=' + w.id);
  assert(w.rank === 2, 'rank=' + w.rank);
  assert(w.trans.length >= 1 && w.trans[0].cn.indexOf('抛弃') >= 0, '译文: ' + JSON.stringify(w.trans[0]));
  assert(w.uk.length > 0, '英式音标: ' + w.uk);
  assert(w.phrases.some(function (p) { return p.en === 'with abandon'; }), '短语 with abandon');
  assert(w.remMethod.indexOf('band') >= 0, '记忆法');
  assert(w.sentences.length >= 1 && w.sentences[0].cn.length > 0, '例句');
  assert(w.synos.length >= 1, '同近义词');
  assert(w.rels.length >= 1, '同根词');
});

it(HAS_CET4, '抽查 a (含真题例句与HTML清理)', function () {
  const text = fs.readFileSync(CET4, 'utf8');
  const r = imp.parseImport(text);
  const w = r.words.find(function (x) { return x.word === 'a'; });
  assert(w, '应包含 a');
  assert(w.realExam.length >= 3, '真题例句数: ' + w.realExam.length);
  assert(w.realExam[0].src.indexOf('CET4') >= 0 || w.realExam[0].src.length > 0, '来源: ' + w.realExam[0].src);
  const able = r.words.find(function (x) { return x.word === 'able'; });
  assert(able, '应包含 able');
  const sentWithTags = able.sentences.some(function (s) { return /[<>]/.test(s.en); });
  assert(!sentWithTags, '例句应去除HTML标签');
});

test('文本导入: word = 译文', function () {
  const r = imp.parseImport('caption = 标题\ndistance = 距离\nhello my friend = 你好我的朋友\n# 注释\n\n');
  assert(r.words.length === 3, '3个词, 实际=' + r.words.length);
  assert(r.words[0].word === 'caption' && r.words[0].trans[0].cn === '标题', '译文');
  assert(r.words[2].word === 'hello my friend', '整句做单词');
});

test('文本导入: 纯单词行', function () {
  const r = imp.parseImport('hello\nworld\n');
  assert(r.words.length === 2, '2个词');
  assert(r.words[0].trans.length === 0, '无译文');
});

test('JSON数组导入(简化结构)', function () {
  const r = imp.parseImport('[{"word":"apple","trans":["苹果"]},{"word":"bus","translation":"公交车"}]');
  assert(r.words.length === 2, '2个词');
  assert(r.words[0].trans[0].cn === '苹果', '译文');
  assert(r.words[1].trans[0].cn === '公交车', '译文2');
});

test('坏行容错', function () {
  const r = imp.parseImport('{"headWord":"ok","content":{"word":{"wordHead":"ok","content":{}}}}\n{坏行\nword = 单词\n');
  assert(r.words.length === 2, '2个词');
  assert(r.bad === 1, '1个坏行, 实际=' + r.bad);
});

test('去重逻辑', function () {
  const a = { id: '1', word: 'apple', rank: 1 };
  const b = { id: '2', word: 'Apple', rank: 2 };
  const c = { id: '1', word: 'banana', rank: 3 };
  const dd = imp.dedupe([a, b, c], []);
  assert(dd.words.length === 2, '去重后2个: ' + dd.words.length);
  assert(dd.dup === 1, '重复1个');
  assert(dd.words[1].id !== '1', 'id冲突自动改名: ' + dd.words[1].id);
  const dd2 = imp.dedupe([{ id: 'x', word: 'pear' }], [{ id: 'x', word: 'pear' }]);
  assert(dd2.words.length === 0 && dd2.dup === 1, '与已有词库重复');
});
