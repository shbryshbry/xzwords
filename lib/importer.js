'use strict';
/* ============================================================
 * 词库导入解析器
 * 支持格式：
 *  1) 百词斩/CET 系列 JSONL（每行一个 JSON 对象，用户提供的 CET4_2.json 即此格式）
 *  2) 整体 JSON 数组（元素为百词斩结构或 {word, trans[]} 简化结构）
 *  3) 文本/CSV/TSV：`单词 = 译文` / `单词,译文` / `单词<TAB>译文`（每行一条，无译文则只导入单词）
 * ============================================================ */

const _E = String.fromCharCode(38);   /* & ，用 charCode 构建实体引用避免源码转义问题 */
function stripTags(s) {
  return String(s == null ? '' : s)
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .split(_E + 'lt;').join('<')
    .split(_E + 'gt;').join('>')
    .split(_E + 'quot;').join('"')
    .split(_E + '#39;').join("'")
    .split(_E + 'amp;').join(_E)
    .replace(/\s+/g, ' ')
    .trim();
}

function asArr(x) { return Array.isArray(x) ? x : []; }

/* 百词斩结构 → 归一化词条 */
function fromBaicizhan(raw) {
  var head = String(raw.headWord || (raw.content && raw.content.word && raw.content.word.wordHead) || '').trim();
  if (!head) return null;
  var wc = (raw.content && raw.content.word) || {};
  var c = wc.content || {};
  var trans = asArr(c.trans).map(function (t) {
    return { pos: stripTags(t.pos), cn: stripTags(t.tranCn), en: stripTags(t.tranOther) };
  }).filter(function (t) { return t.cn; });
  var sentences = asArr(c.sentence && c.sentence.sentences).map(function (s) {
    return { en: stripTags(s.sContent || s.sContent_eng), cn: stripTags(s.sCn) };
  }).filter(function (s) { return s.en; });
  var realExam = asArr(c.realExamSentence && c.realExamSentence.sentences).map(function (s) {
    var si = s.sourceInfo || {};
    var src = [si.year, si.type, si.paper].filter(Boolean).join(' ');
    return { en: stripTags(s.sContent), src: src };
  }).filter(function (s) { return s.en; });
  var phrases = asArr(c.phrase && c.phrase.phrases).map(function (p) {
    return { en: stripTags(p.pContent), cn: stripTags(p.pCn) };
  }).filter(function (p) { return p.en; });
  var synos = asArr(c.syno && c.syno.synos).map(function (s) {
    return {
      pos: stripTags(s.pos), cn: stripTags(s.tran),
      words: asArr(s.hwds).map(function (h) { return stripTags(h.w); }).filter(Boolean)
    };
  }).filter(function (s) { return s.words.length; });
  var rels = asArr(c.relWord && c.relWord.rels).map(function (r) {
    return {
      pos: stripTags(r.pos),
      words: asArr(r.words).map(function (h) { return { w: stripTags(h.hwd), cn: stripTags(h.tran) }; })
        .filter(function (h) { return h.w; })
    };
  }).filter(function (r) { return r.words.length; });
  var exam = asArr(c.exam).map(function (e) {
    var ch = asArr(e.choices).map(function (x) { return stripTags(x.choice); }).filter(Boolean);
    var ans = e.answer && e.answer.rightIndex != null ? Number(e.answer.rightIndex) - 1 : -1;
    if (ch.length < 2 || ans < 0 || ans >= ch.length) return null;
    return {
      q: stripTags(e.question), ch: ch, ans: ans,
      explain: stripTags(e.answer && e.answer.explain),
      type: e.examType === 2 ? '阅读' : e.examType === 3 ? '听力' : '真题'
    };
  }).filter(Boolean);

  return {
    id: String(wc.wordId || raw.wordId || ('w' + (raw.wordRank || 0) + '_' + head)).trim(),
    word: head,
    rank: Number(raw.wordRank) || 0,
    uk: stripTags(c.ukphone || c.phone),
    us: stripTags(c.usphone || c.phone),
    trans: trans,
    sentences: sentences,
    realExam: realExam,
    phrases: phrases,
    synos: synos,
    rels: rels,
    remMethod: stripTags(c.remMethod && c.remMethod.val),
    exam: exam,
    star: false,
    shows: 0
  };
}

/* 简化结构 {word/单词, trans/translation/意思, phonetic...} */
function fromSimple(raw) {
  var w = String(raw.word || raw.headWord || raw.单词 || raw.w || '').trim();
  if (!w) return null;
  var tr = raw.trans != null ? raw.trans : (raw.translation != null ? raw.translation : (raw.cn != null ? raw.cn : raw.译文));
  var list;
  if (Array.isArray(tr)) {
    list = tr.map(function (t) {
      if (typeof t === 'string') return { pos: '', cn: stripTags(t), en: '' };
      return { pos: stripTags(t.pos), cn: stripTags(t.cn || t.tranCn || t.meaning), en: stripTags(t.en || t.tranOther) };
    }).filter(function (t) { return t.cn; });
  } else if (tr != null && String(tr).trim()) {
    list = [{ pos: '', cn: stripTags(tr), en: '' }];
  } else list = [];
  return {
    id: String(raw.id || ('w_' + w)).trim(),
    word: w,
    rank: Number(raw.rank) || 0,
    uk: stripTags(raw.uk || raw.ukphone),
    us: stripTags(raw.us || raw.usphone),
    trans: list,
    sentences: asArr(raw.sentences).map(function (s) {
      return { en: stripTags(s.en || s.sContent), cn: stripTags(s.cn || s.sCn) };
    }).filter(function (s) { return s.en; }),
    realExam: [], phrases: [], synos: [], rels: [],
    remMethod: stripTags(raw.remMethod || raw.memo),
    exam: [],
    star: false,
    shows: 0
  };
}

/* `单词 = 译文` 文本行 */
function fromTextLine(line) {
  var s = line.trim();
  if (!s || s.charAt(0) === '#') return null;
  var m = s.split(/\s*[=\t]\s*|,(?=(?:[^"]*"[^"]*")*[^"]*$)/);
  var w = stripTags(m[0]).replace(/^["']|["']$/g, '');
  if (!w) return null;
  var cn = m.length > 1 ? m.slice(1).join(', ').replace(/^["']|["']$/g, '').trim() : '';
  var out = {
    id: 'w_' + w, word: w, rank: 0,
    uk: '', us: '',
    trans: cn ? [{ pos: '', cn: cn, en: '' }] : [],
    sentences: [], realExam: [], phrases: [], synos: [], rels: [],
    remMethod: '', exam: [], star: false, shows: 0
  };
  return out;
}

/* 检测一行是否 JSON 对象 */
function tryParseLine(line) {
  var s = line.trim();
  if (s.charAt(0) !== '{') return null;
  try { return JSON.parse(s); } catch (e) { return undefined; } /* undefined = 坏行 */
}

function normalizeOne(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.content && raw.content.word) return fromBaicizhan(raw);
  if (raw.headWord || raw.word || raw.单词) return fromSimple(raw);
  return null;
}

/**
 * 解析导入文本。
 * @returns {words:[], total, bad, format}
 */
function parseImport(text) {
  var s = String(text == null ? '' : text);
  if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1);
  s = s.trim();
  var words = [], bad = 0;

  if (s.charAt(0) === '[') {
    var arr = null;
    try { arr = JSON.parse(s); } catch (e) { arr = null; }
    if (Array.isArray(arr)) {
      arr.forEach(function (raw) {
        var n = normalizeOne(raw);
        if (n) words.push(n); else bad++;
      });
      return { words: words, total: arr.length, bad: bad, format: 'json-array' };
    }
  }

  var lines = s.split(/\r?\n/);
  var jsonCount = 0, textCount = 0;
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (!line.trim()) continue;
    var parsed = tryParseLine(line);
    if (parsed === undefined) { bad++; continue; }
    if (parsed !== null) {
      jsonCount++;
      var n = normalizeOne(parsed);
      if (n) words.push(n); else bad++;
    } else {
      textCount++;
      var t = fromTextLine(line);
      if (t) words.push(t); else bad++;
    }
  }
  var format = jsonCount >= textCount ? 'jsonl' : 'text';
  return { words: words, total: words.length + bad, bad: bad, format: format };
}

/* 去重：同书内按单词去重（保留先出现的），id 冲突加后缀 */
function dedupe(words, existingWords) {
  var seenWord = {};
  (existingWords || []).forEach(function (w) { seenWord[String(w.word).toLowerCase()] = 1; });
  var seenId = {};
  (existingWords || []).forEach(function (w) { seenId[w.id] = 1; });
  var out = [], dup = 0;
  words.forEach(function (w) {
    var key = String(w.word).toLowerCase();
    if (seenWord[key]) { dup++; return; }
    seenWord[key] = 1;
    var id = w.id && !seenId[w.id] ? w.id : ('w' + (w.rank || '') + '_' + key.replace(/[^a-z0-9\u4e00-\u9fa5]/gi, '_'));
    while (seenId[id]) id = id + '_2';
    seenId[id] = 1;
    w.id = id;
    out.push(w);
  });
  return { words: out, dup: dup };
}

module.exports = { parseImport: parseImport, dedupe: dedupe, stripTags: stripTags, normalizeOne: normalizeOne };
