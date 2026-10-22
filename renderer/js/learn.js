'use strict';
/* ============================================================
 * 学习：会话配置页 + 五种学习工具
 * ============================================================ */
(function () {

let kbHandler = null;   /* 当前会话键盘监听 */
function bindKeys(map, f3Fn) {
  unbindKeys();
  kbHandler = function (e) {
    if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if (e.key === 'F3' && f3Fn) { e.preventDefault(); f3Fn(); return; }
    const k = e.key.toLowerCase();
    if (map[k]) { e.preventDefault(); map[k](); }
  };
  document.addEventListener('keydown', kbHandler);
}
function unbindKeys() {
  if (kbHandler) { document.removeEventListener('keydown', kbHandler); kbHandler = null; }
}
function ratePreview(prog, rating) {
  try {
    const r = window.SRS.review(prog || window.SRS.newProgress(), rating, {
      now: Date.now(), algo: App.S.algo, retention: App.S.retention,
      stepsMin: App.S.stepsMin, relearnStepsMin: App.S.relearnStepsMin
    });
    return SRS.fmtInterval(r.intervalMin);
  } catch (e) { return ''; }
}
function feedbackRowHtml(prog, labels) {
  const lb = labels || ['不认识', '模糊', '认识', '简单'];
  return '<div class="feedback-row">' + [1, 2, 3, 4].map(function (g) {
    return '<button class="fb-btn fb' + g + '" data-g="' + g + '"><b>' + lb[g - 1] + '<i>' + g + '</i></b><small>' + ratePreview(prog, g) + '</small></button>';
  }).join('') + '</div>';
}
function speakBtn(word) {
  return '<button class="speak-btn" data-spk="' + App.esc(word) + '" title="发音">🔊</button>';
}

/* ============================================================
 * 学习配置页
 * ============================================================ */
App.views.learn = async function (view) {
  App._cleanup = unbindKeys;
  unbindKeys();
  if (!App.bookId) { App.go('home'); return; }
  await App.refreshBooks();
  const book = App.books.find(function (b) { return b.id === App.bookId; });
  if (!book) { App.go('home'); return; }
  const c = book.counts || {};
  const target = App.S.dailyNew;
  const todayN = await momo.learnQueue({ bookId: App.bookId, opts: { sources: {} } }).then(function (r) { return r.todayNew; });
  let unitSel = 0, rangeOn = false, rangeStart = 1, rangeEnd = c.total || 1;
  const srcState = { new: true, review: true, star: false, notmaster: false };

  view.innerHTML =
    '<div class="page-title">开始学习 <select class="select" id="ln-book">' + App.bookSelectHtml(App.bookId) + '</select></div>' +
    '<div class="page-sub">先选择单词来源，再挑一个顺手的工具开干。快捷键 <span class="kbd">Alt+N</span> 随时回到本页</div>' +
    '<div class="src-grid">' +
      '<div class="src-card active" data-s="new"><div class="t">✨ 学习新词</div><div class="v">' + Math.max(0, target - todayN) + '<small> / 今日目标 ' + target + '</small></div></div>' +
      '<div class="src-card active" data-s="review"><div class="t">🔁 复习单词</div><div class="v">' + c.dueNow + '<small> 现在到期</small></div><div class="muted" style="font-size:12px">今日内到期 ' + ((c.dueNow || 0) + (c.dueToday || 0)) + ' 个</div></div>' +
      '<div class="src-card off" data-s="star"><div class="t">⭐ 我的收藏</div><div class="v">' + (c.star || 0) + '<small> 个</small></div></div>' +
      '<div class="src-card off" data-s="notmaster"><div class="t">🎲 未掌握乱序</div><div class="v">' + (c.notMaster || 0) + '<small> 个</small></div></div>' +
    '</div>' +
    '<div class="card"><div class="row">' +
      '<b>学习范围：</b>' +
      '<label class="row" style="gap:6px"><input type="radio" name="lnr" checked> 全部单词</label>' +
      '<label class="row" style="gap:6px"><input type="radio" name="lnr" id="lnr-unit"> 按单元</label>' +
      '<select class="select" id="ln-unit" disabled>' + unitOptions() + '</select>' +
      '<label class="row" style="gap:6px"><input type="radio" name="lnr" id="lnr-range"> 自定义序号</label>' +
      '<input class="input" style="width:80px" id="ln-rs" value="1" disabled> ~ ' +
      '<input class="input" style="width:80px" id="ln-re" value="' + (c.total || 1) + '" disabled>' +
      '<span class="grow"></span>' +
      '<b>出题顺序：</b>' +
      '<select class="select" id="ln-order"><option value="seq"' + ((App.S.orderMode || 'seq') === 'seq' ? ' selected' : '') + '>正序（按词库顺序）</option><option value="rand"' + (App.S.orderMode === 'rand' ? ' selected' : '') + '>乱序（随机打乱）</option></select>' +
      '<button class="btn" id="ln-forecast">👀 看复习预览</button>' +
    '</div></div>' +
    '<div class="tool-grid">' +
      '<button class="tool-card" data-t="card"><div class="ic">🃏</div><b>卡片背单词</b><span>正反面记忆，底部反馈安排下次复习（1-4 键）</span></button>' +
      '<button class="tool-card" data-t="list"><div class="ic">📃</div><b>列表快速背单词</b><span>单词+译文平铺展示，方向键/数字键快速反馈</span></button>' +
      '<button class="tool-card" data-t="choice"><div class="ic">✅</div><b>选题背单词</b><span>四选一，词义或真题选择题</span></button>' +
      '<button class="tool-card" data-t="spell"><div class="ic">⌨️</div><b>拼写练习</b><span>默写/抄写，按字母拼写巩固记忆</span></button>' +
      '<button class="tool-card" data-t="seq"><div class="ic">🔢</div><b>顺序模式</b><span>按词库顺序浏览，带进度计数，不受学习计划影响</span></button>' +
    '</div>';

  function unitOptions() {
    const us = book.unitSize || 50;
    const n = Math.ceil((c.total || 0) / us) || 1;
    let h = '';
    for (let i = 1; i <= n; i++) h += '<option value="' + i + '">单元 ' + i + '</option>';
    return h;
  }

  App.$$('[data-s]', view).forEach(function (el) {
    el.onclick = function () {
      const k = el.dataset.s;
      srcState[k] = !srcState[k];
      el.classList.toggle('active', srcState[k]);
      el.classList.toggle('off', !srcState[k]);
    };
  });
  App.$('#ln-book', view).onchange = function (e) { App.setBook(e.target.value).then(function () { App.render(); }); };
  App.$('#ln-order', view).onchange = function (e) { momo.setSettings({ orderMode: e.target.value }); };
  App.$('#ln-forecast', view).onclick = function () { App.go('forecast'); };
  const radios = App.$$('input[name=lnr]', view);
  radios.forEach(function (r, i) {
    r.onchange = function () {
      App.$('#ln-unit', view).disabled = i !== 1;
      App.$('#ln-rs', view).disabled = i !== 2;
      App.$('#ln-re', view).disabled = i !== 2;
    };
  });

  function rangeOpts() {
    const o = {};
    const mode = radios[1].checked ? 'unit' : radios[2].checked ? 'range' : 'all';
    if (mode === 'unit') o.unit = { start: +App.$('#ln-unit', view).value, end: +App.$('#ln-unit', view).value };
    if (mode === 'range') {
      const a = Math.max(1, parseInt(App.$('#ln-rs', view).value, 10) || 1);
      const b = Math.max(a, parseInt(App.$('#ln-re', view).value, 10) || 1);
      o.range = { start: a, end: b };
    }
    return o;
  }

  App.$$('.tool-card', view).forEach(function (el) {
    el.onclick = async function () {
      const tool = el.dataset.t;
      const opts = rangeOpts();
      if (tool === 'seq') {
        /* 顺序模式：取范围内全部词，按 rank 排 */
        const data = await momo.bookData(App.bookId);
        const ws = data.words.map(function (w, i) { return { w: w, i: i }; })
          .filter(function (x) {
            if (opts.unit) return Math.floor(x.i / (book.unitSize || 50)) + 1 === opts.unit.start;
            if (opts.range) return x.i + 1 >= opts.range.start && x.i + 1 <= opts.range.end;
            return true;
          })
          .sort(function (a, b) { return (a.w.rank || 0) - (b.w.rank || 0) || a.i - b.i; })
          .map(function (x) { return x.w.id; });
        if (!ws.length) return App.toast('这个范围内没有单词', 'err');
        const saved = await momo.getSeq(App.bookId).catch(function () { return 0; });
        App.go('tools', {
          bookId: App.bookId, ids: ws, tool: 'seq', title: '顺序模式',
          startIdx: Math.max(0, Math.min(saved | 0, ws.length - 1))
        });
        return;
      }
      const r = await momo.learnQueue({ bookId: App.bookId, opts: Object.assign({ sources: srcState, orderMode: App.S.orderMode || 'seq' }, opts) });
      const ids = r.queue.map(function (x) { return x.id; });
      if (!ids.length) {
        return App.toast('没有符合条件的学习内容：换个来源或范围试试', 'err');
      }
      App.go('tools', { bookId: App.bookId, ids: ids, tool: tool, title: '学习会话' });
    };
  });
};

/* ============================================================
 * 工具会话页
 * ============================================================ */
App.views.tools = async function (view, params) {
  App._cleanup = unbindKeys;
  unbindKeys();
  const bookId = params.bookId || App.bookId;
  const tool = params.tool || 'card';
  let data;
  try { data = await momo.bookData(bookId); } catch (e) { App.go('home'); return; }
  const wordMap = {};
  data.words.forEach(function (w) { wordMap[w.id] = w; });

  let queue = (params.ids || []).filter(function (id) { return wordMap[id]; });
  if (!queue.length) {
    view.innerHTML = '<div class="empty"><div class="big">🎉</div>没有需要学习的内容<br><br><button class="btn primary" onclick="App.go(\'learn\')">返回学习页</button></div>';
    return;
  }
  momo.touchShown({ bookId: bookId, ids: queue.slice(0, 60) });

  const sess = {
    idx: Math.max(0, Math.min(params.startIdx | 0, queue.length - 1)),
    queue: queue.slice(),
    news: 0, revs: 0, again: 0, done: 0,
    prog: data.prog, tool: tool, title: params.title || '学习会话'
  };

  view.innerHTML =
    '<div class="learn-top">' +
      '<button class="btn" id="tt-exit">✕ 退出学习 <span class="kbd">Esc</span></button>' +
      '<div class="learn-prog"><div class="row" style="justify-content:space-between;margin-bottom:4px">' +
      '<b id="tt-title">' + App.esc(sess.title) + '</b><span class="muted" id="tt-prog"></span></div>' +
      '<div class="pbar"><i id="tt-bar" style="width:0%"></i></div></div>' +
      '<span class="row" style="gap:4px" id="tt-tools">' +
        '<button class="btn small" data-sw="card">🃏</button><button class="btn small" data-sw="list">📃</button>' +
        '<button class="btn small" data-sw="choice">✅</button><button class="btn small" data-sw="spell">⌨️</button>' +
        '<button class="btn small" data-sw="seq">🔢</button>' +
      '</span>' +
    '</div>' +
    '<div id="tt-body"></div>';

  App.$('#tt-exit', view).onclick = exit;
  App.$$('[data-sw]', view).forEach(function (b) {
    b.onclick = function () {
      sess.tool = b.dataset.sw;
      App.$$('[data-sw]', view).forEach(function (x) { x.classList.toggle('primary', x === b); });
      renderTool();
    };
  });
  App.$$('[data-sw]', view).forEach(function (b) { b.classList.toggle('primary', b.dataset.sw === tool); });

  function updateBar() {
    const total = sess.queue.length;
    const cur = Math.min(sess.idx + 1, total);
    App.$('#tt-prog', view).textContent = '第 ' + cur + ' / ' + total + ' 词 ｜ 本次新学 ' + sess.news + ' · 复习 ' + sess.revs;
    App.$('#tt-bar', view).style.width = Math.round((sess.idx / Math.max(1, total)) * 100) + '%';
  }

  function exit() { unbindKeys(); App.go('learn'); }

  function finish() {
    unbindKeys();
    App.$('#tt-body', view).innerHTML =
      '<div class="empty"><div class="big">🎉</div><b style="font-size:18px">本轮学习完成！</b>' +
      '<div class="muted" style="margin:10px 0">本次新学 <b>' + sess.news + '</b> 词 ｜ 复习 <b>' + sess.revs + '</b> 次 ｜ 标记不认识 <b>' + sess.again + '</b> 次</div>' +
      '<button class="btn primary" id="fn-again">🔄 换一批继续</button> <button class="btn" id="fn-back">返回学习页</button></div>';
    App.$('#fn-back', view).onclick = exit;
    App.$('#fn-again', view).onclick = function () { App.go('learn'); };
  }

  function curWord() { return wordMap[sess.queue[sess.idx]]; }
  function curProg() { return sess.prog[sess.queue[sess.idx]] || null; }

  /* 评分后推进 */
  async function rate(g) {
    const w = curWord();
    if (!w) return;
    const wasNew = !(sess.prog[w.id] && sess.prog[w.id].st);
    const r = await momo.rate({ bookId: bookId, wordId: w.id, rating: g });
    if (r && r.ok) {
      sess.prog[w.id] = r.prog;
      if (wasNew) sess.news++; else sess.revs++;
      if (g === 1) sess.again++;
      App.toast('「' + w.word + '」安排在' + r.intervalText, 'ok');
    }
    sess.done++;
    sess.idx++;
    if (sess.idx >= sess.queue.length) finish(); else renderTool();
  }
  function postpone() {
    const id = sess.queue[sess.idx];
    sess.queue.push(id);
    /* 还有下一个词就前进（被延后的词排在其后）；当前已是最后一个则原地重展示 */
    if (sess.idx + 1 < sess.queue.length) sess.idx++;
    renderTool();
    App.toast('已延后，穿插到下一词之后');
  }
  async function masterIt() {
    const w = curWord();
    await momo.setFlags({ bookId: bookId, ids: [w.id], flags: { master: true } });
    sess.prog[w.id] = Object.assign({}, sess.prog[w.id] || {}, { master: true });
    App.toast('「' + w.word + '」已标记为掌握 🎉', 'ok');
    sess.done++;
    sess.idx++;
    if (sess.idx >= sess.queue.length) finish(); else renderTool();
  }
  function starIt() {
    const w = curWord();
    const v = !w.star;
    w.star = v;
    momo.setFlags({ bookId: bookId, ids: [w.id], flags: { star: v } });
    App.toast(v ? '已收藏 ⭐' : '已取消收藏');
  }
  function stickerIt() {
    const w = curWord();
    momo.createSticker({ bookId: bookId, wordId: w.id, space: App.S.stickerSpace || '默认' });
    App.toast('已把「' + w.word + '」贴到桌面 📌', 'ok');
  }
  function bindCommonKeys(extra) {
    bindKeys(Object.assign({
      escape: exit, p: postpone, s: starIt
    }, extra || {}), masterIt);
  }

  function renderTool() {
    updateBar();
    const body = App.$('#tt-body', view);
    if (sess.tool === 'card') toolCard(body);
    else if (sess.tool === 'list') toolList(body);
    else if (sess.tool === 'choice') toolChoice(body);
    else if (sess.tool === 'spell') toolSpell(body);
    else if (sess.tool === 'seq') toolSeq(body);
  }

  /* ---------- 卡片 ---------- */
  function toolCard(body) {
    const w = curWord();
    const p = curProg();
    body.innerHTML =
      '<div class="flash-wrap"><div class="flash" id="fl-card">' +
        '<div class="flash-face" id="fl-front">' +
          '<div class="big-word">' + App.esc(w.word) + '</div>' +
          '<div class="phon">' + App.esc(App.phon(w)) + '</div>' +
          '<div class="row">' + speakBtn(w.word) + '</div>' +
          '<div class="tip">点击卡片或按 空格 翻面 ｜ 1-4 反馈 ｜ P 延后 ｜ S 收藏 ｜ F3 掌握</div>' +
        '</div>' +
        '<div class="flash-face flash-back" id="fl-back">' + backHtml(w) + '</div>' +
      '</div></div>' +
      '<div class="feedback-row" id="fl-fb"></div>';
    const card = App.$('#fl-card', body);
    let flipped = false;
    const flip = function () { flipped = !flipped; card.classList.toggle('flipped', flipped); };
    card.onclick = flip;
    App.$$('[data-spk]', body).forEach(function (b) {
      b.onclick = function (e) { e.stopPropagation(); App.speak(w.word); };
    });
    if (App.S.autospeak) App.speak(w.word);
    App.$('#fl-fb', body).innerHTML = feedbackRowHtml(p);
    App.$$('#fl-fb [data-g]', body).forEach(function (b) {
      b.onclick = function () { rate(+b.dataset.g); };
    });
    bindCommonKeys({
      ' ': flip, enter: flip,
      1: function () { rate(1); }, 2: function () { rate(2); }, 3: function () { rate(3); }, 4: function () { rate(4); }
    });
  }

  function backHtml(w) {
    let h = '<div style="display:flex;align-items:center;gap:12px;margin-bottom:6px">' +
      '<span class="big-word" style="font-size:30px">' + App.esc(w.word) + '</span>' + speakBtn(w.word) +
      '<span class="phon">' + App.esc(App.phon(w)) + '</span></div>';
    h += w.trans.map(function (t) {
      return '<div class="tran"><span class="pos">' + App.esc(t.pos) + '</span> ' + App.esc(t.cn) + '</div>';
    }).join('') || '<div class="muted">（未录入释义）</div>';
    if (w.sentences.length) {
      h += '<div class="sec-t">例句</div>' + w.sentences.slice(0, 2).map(function (s) {
        return '<div class="sent">' + App.esc(s.en) + '<div class="cn">' + App.esc(s.cn) + '</div></div>';
      }).join('');
    }
    if (w.phrases.length) {
      h += '<div class="sec-t">短语</div><div>' + w.phrases.slice(0, 4).map(function (s) {
        return '<span class="dt-tag">' + App.esc(s.en) + ' <small>' + App.esc(s.cn) + '</small></span>';
      }).join('') + '</div>';
    }
    if (w.remMethod) h += '<div class="sec-t">记忆法</div><div class="sent">' + App.esc(w.remMethod) + '</div>';
    return h;
  }

  /* ---------- 列表 ---------- */
  function toolList(body) {
    const w = curWord();
    const p = curProg();
    body.innerHTML =
      '<div class="list-wrap card" style="padding:40px 30px">' +
        '<div class="row" style="justify-content:center;gap:14px"><span class="big-word" style="font-size:40px">' + App.esc(w.word) + '</span>' + speakBtn(w.word) + '</div>' +
        '<div class="phon" style="text-align:center;margin-top:4px">' + App.esc(App.phon(w)) + '</div>' +
        '<div style="text-align:center;margin:18px 0">' + (w.trans.map(function (t) {
          return '<div class="tran" style="font-size:18px"><span class="pos">' + App.esc(t.pos) + '</span> ' + App.esc(t.cn) + '</div>';
        }).join('') || '<span class="muted">（未录入释义）</span>') + '</div>' +
        (w.sentences.length ? '<div class="muted" style="text-align:center;font-size:13px">' + App.esc(w.sentences[0].en) + '</div>' : '') +
        '<div class="row" style="justify-content:center;margin-top:14px">' +
          '<button class="btn small" id="ls-star">' + (w.star ? '⭐ 已收藏' : '☆ 收藏') + '</button>' +
          '<button class="btn small" id="ls-sticker">📌 贴纸</button>' +
        '</div>' +
      '</div>' +
      '<div class="feedback-row" id="ls-fb"></div>';
    App.$('[data-spk]', body).onclick = function () { App.speak(w.word); };
    if (App.S.autospeak) App.speak(w.word);
    App.$('#ls-fb', body).innerHTML = feedbackRowHtml(p);
    App.$$('#ls-fb [data-g]', body).forEach(function (b) { b.onclick = function () { rate(+b.dataset.g); }; });
    App.$('#ls-star', body).onclick = starIt;
    App.$('#ls-sticker', body).onclick = stickerIt;
    bindCommonKeys({
      1: function () { rate(1); }, 2: function () { rate(2); }, 3: function () { rate(3); }, 4: function () { rate(4); }
    });
  }

  /* ---------- 选题 ---------- */
  function toolChoice(body) {
    const w = curWord();
    const p = curProg();
    const useExam = w.exam && w.exam.length && Math.random() < 0.4;
    let qHtml, options, ansIdx;
    if (useExam) {
      const e = w.exam[0];
      options = e.ch; ansIdx = e.ans;
      qHtml = '<div class="stem blank">' + App.esc(e.q) + '</div>' +
        '<div class="exam-src">真题 · ' + App.esc(e.type || '') + '</div>';
    } else {
      /* 词义级出题：正确答案随机取该词的一个词义；干扰项排除与本词任一词义同文的候选 */
      const senses = (w.trans || []).filter(function (t) { return t.cn; })
        .map(function (t) { return { pos: t.pos || '', bare: t.cn.toLowerCase(), text: (t.pos ? t.pos + '. ' : '') + t.cn }; });
      const pickSense = senses.length ? senses[Math.floor(Math.random() * senses.length)] : { pos: '', bare: '', text: '（无释义）' };
      const correct = pickSense.text;
      const bareSet = new Set(senses.map(function (s) { return s.bare; }));
      const pool = data.words.filter(function (x) { return x.id !== w.id && x.trans && x.trans.length; });
      const set = {};
      const opts = [correct];
      set[correct] = 1;
      for (let i = 0; i < pool.length && opts.length < 4; i++) {
        const x = pool[Math.floor(Math.random() * pool.length)];
        /* 候选词任一词义与本词任一词义同文 → 跳过（避免一题双解） */
        const collide = (x.trans || []).some(function (t) { return t.cn && bareSet.has(t.cn.toLowerCase()); });
        if (collide) continue;
        const cn = App.firstTrans(x);
        if (!cn || set[cn]) continue;
        set[cn] = 1; opts.push(cn);
      }
      while (opts.length < 4) opts.push('——');
      /* 打乱 */
      for (let i = opts.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const t = opts[i]; opts[i] = opts[j]; opts[j] = t;
      }
      ansIdx = opts.indexOf(correct);
      options = opts;
      const posAll = [];
      senses.forEach(function (s) { if (s.pos && posAll.indexOf(s.pos) < 0) posAll.push(s.pos); });
      qHtml = '<div class="stem">' + App.esc(w.word) +
        (posAll.length ? '<span class="muted" style="font-size:13px;font-weight:400;margin-left:10px">' + App.esc(posAll.join('/')) + '.</span>' : '') + '</div>' +
        '<div class="phon">' + App.esc(App.phon(w)) + '</div>';
    }
    body.innerHTML =
      '<div class="choice-q card" style="padding:34px 28px">' +
        '<div class="muted">选出正确的一项</div>' + qHtml +
        '<div class="row" style="justify-content:center;margin-top:8px">' + (useExam ? '' : speakBtn(w.word)) + '</div>' +
        '<div class="opts" id="ch-opts">' + options.map(function (o, i) {
          return '<div class="opt" data-i="' + i + '"><span class="idx">' + 'ABCD'[i] + '</span><span>' + App.esc(o) + '</span></div>';
        }).join('') + '</div>' +
        '<div id="ch-msg" class="spell-msg"></div>' +
        '<div class="row" style="justify-content:center;margin-top:6px">' +
          '<button class="btn small" id="ch-skip">跳过（延后）</button>' +
        '</div>' +
      '</div>' +
      '<div id="ch-fb"></div>';
    const spk = App.$('[data-spk]', body);
    if (spk && spk.dataset.spk) spk.onclick = function () { App.speak(w.word); };
    if (!useExam && App.S.autospeak) App.speak(w.word);
    let answered = false;
    App.$$('#ch-opts .opt', body).forEach(function (el) {
      el.onclick = function () {
        if (answered) return;
        answered = true;
        const i = +el.dataset.i;
        const ok = i === ansIdx;
        el.classList.add(ok ? 'correct' : 'wrong');
        App.$$('#ch-opts .opt', body).forEach(function (x) {
          x.classList.add('disabled');
          if (+x.dataset.i === ansIdx) x.classList.add('correct');
        });
        const msg = App.$('#ch-msg', body);
        if (ok) msg.innerHTML = '<span class="spell-msg ok">✓ 答对了</span>';
        else {
          msg.innerHTML = '<span class="spell-msg err">✗ 正确答案：' + 'ABCD'[ansIdx] + '. ' + App.esc(options[ansIdx]) + '</span>' +
            (useExam && w.exam[0].explain ? '<div class="muted" style="font-size:12.5px;margin-top:4px">💡 ' + App.esc(w.exam[0].explain) + '</div>' : '');
        }
        App.$('#ch-fb', body).innerHTML = feedbackRowHtml(p, ['没记牢', '模糊', '记住了', '很简单']);
        App.$$('#ch-fb [data-g]', body).forEach(function (b) { b.onclick = function () { rate(+b.dataset.g); }; });
        App.speak(w.word);
      };
    });
    App.$('#ch-skip', body).onclick = postpone;
    bindCommonKeys({
      a: function () { clickOpt(0); }, b: function () { clickOpt(1); }, c: function () { clickOpt(2); }, d: function () { clickOpt(3); },
      1: function () { answered && rate(1); }, 2: function () { answered && rate(2); },
      3: function () { answered && rate(3); }, 4: function () { answered && rate(4); }
    });
    function clickOpt(i) {
      const el = App.$('#ch-opts .opt[data-i="' + i + '"]', body);
      if (el) el.click();
    }
  }

  /* ---------- 拼写 ---------- */
  function toolSpell(body) {
    const w = curWord();
    const p = curProg();
    const bookMeta = data.book;
    const mode = bookMeta.spellMode || 'dictation';   /* dictation=默写 copy=抄写 */
    const repeat = Math.max(1, bookMeta.spellRepeat || 1);
    const letters = w.word.split('');
    let doneCount = 0, attempts = 0;

    body.innerHTML =
      '<div class="spell-wrap">' +
        '<div class="row" style="justify-content:center;margin-bottom:10px">' +
          '<label class="row" style="gap:4px"><input type="radio" name="spm" ' + (mode === 'dictation' ? 'checked' : '') + '> 默写（看译文拼词）</label>' +
          '<label class="row" style="gap:4px"><input type="radio" name="spm" ' + (mode === 'copy' ? 'checked' : '') + '> 抄写（照着拼词）</label>' +
          '<select class="select" id="sp-rep"><option value="1">每词 1 遍</option><option value="2">每词 2 遍</option><option value="3">每词 3 遍</option></select>' +
        '</div>' +
        '<div class="spell-trans" id="sp-trans"></div>' +
        '<div class="row" style="justify-content:center;gap:8px">' + speakBtn(w.word) +
          '<button class="btn small" id="sp-hint">💡 提示一个字母</button>' +
          '<button class="btn small" id="sp-show">👀 看一眼</button>' +
        '</div>' +
        '<div class="slots" id="sp-slots"></div>' +
        '<div class="spell-msg" id="sp-msg"></div>' +
        '<div class="muted" id="sp-repinfo"></div>' +
      '</div>' +
      '<div id="sp-fb"></div>';

    App.$('#sp-rep', body).value = String(repeat);
    App.$('#sp-rep', body).onchange = function (e) {
      momo.updateBook({ id: bookId, patch: { spellRepeat: +e.target.value } });
    };
    App.$$('input[name=spm]', body).forEach(function (r) {
      r.onchange = function () {
        momo.updateBook({ id: bookId, patch: { spellMode: r.checked && r.parentNode.textContent.indexOf('抄写') >= 0 ? 'copy' : 'dictation' } });
        toolSpell(body);
      };
    });

    const slotsBox = App.$('#sp-slots', body);
    let inputs = [];
    /* 可输入字符：字母/撇号/连字符；空格等不可输入字符显示为固定占位（避免死锁） */
    const TYPEABLE = /[a-zA-Z'’-]/;
    const parts = w.word.split('').map(function (ch) { return { ch: ch, ok: TYPEABLE.test(ch) }; });
    function buildSlots() {
      slotsBox.innerHTML = '';
      inputs = [];
      parts.forEach(function (pt) {
        if (!pt.ok) {
          const gap = document.createElement('span');
          gap.className = 'slot-gap';
          gap.textContent = pt.ch === ' ' ? '' : pt.ch;
          if (pt.ch === ' ') gap.style.width = '18px';
          slotsBox.appendChild(gap);
          return;
        }
        const inp = document.createElement('input');
        inp.className = 'slot'; inp.maxLength = 1; inp.autocomplete = 'off'; inp.spellcheck = false;
        slotsBox.appendChild(inp);
        inputs.push(inp);
      });
      inputs.forEach(function (inp, i) {
        inp.addEventListener('input', function () {
          inp.value = inp.value.toLowerCase().replace(/[^a-zA-Z'’-]/g, '');
          if (inp.value && i < inputs.length - 1) inputs[i + 1].focus();
          autoCheck();
        });
        inp.addEventListener('keydown', function (e) {
          if (e.key === 'Backspace' && !inp.value && i > 0) inputs[i - 1].focus();
          if (e.key === 'Enter') { e.preventDefault(); check(true); }
        });
      });
      inputs[0] && inputs[0].focus();
    }
    function showTransPart() {
      App.$('#sp-trans', body).innerHTML = mode === 'copy'
        ? '<b style="font-size:26px;letter-spacing:2px">' + App.esc(w.word) + '</b><div class="muted" style="margin-top:4px">' + App.esc(App.firstTrans(w)) + '</div>'
        : '<span style="font-size:17px">' + App.esc(App.allTrans(w) || '（无译文，请发音听写）') + '</span>';
    }
    function autoCheck() {
      const filled = inputs.every(function (x) { return x.value; });
      if (filled) check(false);
    }
    function check(strict) {
      const val = inputs.map(function (x) { return x.value; }).join('').toLowerCase();
      if (!val) return;
      attempts++;
      const targetChars = parts.filter(function (pt) { return pt.ok; }).map(function (pt) { return pt.ch.toLowerCase(); });
      let allOk = true;
      inputs.forEach(function (inp, i) {
        const ok = inp.value.toLowerCase() === targetChars[i];
        inp.classList.toggle('ok', ok);
        inp.classList.toggle('no', !ok);
        if (!ok) allOk = false;
      });
      const msg = App.$('#sp-msg', body);
      if (allOk) {
        doneCount++;
        App.speak(w.word);
        if (doneCount >= (+App.$('#sp-rep', body).value || 1)) {
          msg.innerHTML = '<span class="spell-msg ok">✓ 拼写正确！请给出记忆反馈（1-4 键）</span>';
          App.$('#sp-fb', body).innerHTML = feedbackRowHtml(p);
          App.$$('#sp-fb [data-g]', body).forEach(function (b) { b.onclick = function () { rate(+b.dataset.g); }; });
          inputs.forEach(function (x) { x.blur(); });   /* 焦点移出输入框，键盘反馈才生效 */
          bindKeys({ escape: exit, 1: function () { rate(1); }, 2: function () { rate(2); }, 3: function () { rate(3); }, 4: function () { rate(4); } });
        } else {
          msg.innerHTML = '<span class="spell-msg ok">✓ 正确！再来一遍（' + (doneCount + 1) + '/' + App.$('#sp-rep', body).value + '）</span>';
          inputs.forEach(function (x) { x.value = ''; x.classList.remove('ok', 'no'); });
          inputs[0].focus();
        }
      } else {
        msg.innerHTML = '<span class="spell-msg err">再想想，红色字母不对（' + App.esc(val) + '）</span>';
        msg.className = 'spell-msg err';
        const firstNo = inputs.find(function (x) { return x.classList.contains('no'); });
        if (firstNo) { firstNo.focus(); if (firstNo.select) firstNo.select(); }
      }
    }
    App.$('#sp-hint', body).onclick = function () {
      const idx = inputs.findIndex(function (x) { return !x.value; });
      if (idx >= 0) {
        inputs[idx].value = parts.filter(function (pt) { return pt.ok; })[idx].ch.toLowerCase();
        inputs[idx].classList.remove('no');
        if (idx < inputs.length - 1) inputs[idx + 1].focus();
        autoCheck();
      }
    };
    App.$('#sp-show', body).onclick = function () {
      App.toast('单词是：' + w.word);
      App.$('#sp-trans', body).innerHTML = '<div style="margin-top:6px"><b>' + App.esc(w.word) + '</b></div>';
    };
    App.$('[data-spk]', body).onclick = function () { App.speak(w.word); };
    showTransPart();
    buildSlots();
    if (App.S.autospeak && mode === 'dictation') App.speak(w.word);
    bindCommonKeys({});
  }

  /* ---------- 顺序模式 ---------- */
  async function toolSeq(body) {
    const w = curWord();
    const pos = sess.idx;
    const total = sess.queue.length;
    body.innerHTML =
      '<div class="seq-wrap card" style="padding:40px 30px">' +
        '<div class="seq-counter">第 <b style="font-size:18px">' + (pos + 1) + '</b> / ' + total + ' 词</div>' +
        '<div class="row" style="justify-content:center;gap:14px"><span class="big-word" style="font-size:42px">' + App.esc(w.word) + '</span>' + speakBtn(w.word) + '</div>' +
        '<div class="phon" style="margin-top:4px">' + App.esc(App.phon(w)) + '</div>' +
        '<div style="margin:16px 0">' + (w.trans.map(function (t) {
          return '<div class="tran" style="font-size:17px"><span class="pos">' + App.esc(t.pos) + '</span> ' + App.esc(t.cn) + '</div>';
        }).join('') || '<span class="muted">（未录入释义）</span>') + '</div>' +
        (w.sentences.length ? '<div class="sent" style="margin-bottom:8px">' + App.esc(w.sentences[0].en) + '<div class="cn">' + App.esc(w.sentences[0].cn) + '</div></div>' : '') +
        '<div class="row" style="justify-content:center;margin-top:10px">' +
          '<button class="btn" id="sq-prev">← 上一个</button>' +
          '<button class="btn primary" id="sq-next">下一个 →</button>' +
        '</div>' +
        '<div class="row" style="justify-content:center;margin-top:12px">' +
          '<button class="btn small" id="sq-star">' + (w.star ? '⭐ 已收藏' : '☆ 收藏') + '</button>' +
          '<button class="btn small" id="sq-sticker">📌 贴纸</button>' +
          '<button class="btn small" id="sq-master">✅ 标记掌握</button>' +
          '<span class="muted">进度自动保存，下次从当前位置继续</span>' +
        '</div>' +
      '</div>';
    App.$('[data-spk]', body).onclick = function () { App.speak(w.word); };
    if (App.S.autospeak) App.speak(w.word);
    momo.setSeq({ bookId: bookId, pos: pos });
    App.$('#sq-prev', body).onclick = function () { seqGo(pos - 1); };
    App.$('#sq-next', body).onclick = function () { seqGo(pos + 1); };
    App.$('#sq-star', body).onclick = starIt;
    App.$('#sq-sticker', body).onclick = stickerIt;
    App.$('#sq-master', body).onclick = masterIt;
    bindCommonKeys({
      arrowleft: function () { seqGo(pos - 1); },
      arrowright: function () { seqGo(pos + 1); }
    });
  }
  function seqGo(n) {
    if (n < 0 || n >= sess.queue.length) return;
    sess.idx = n;
    renderTool();
  }

  renderTool();
};
})();
