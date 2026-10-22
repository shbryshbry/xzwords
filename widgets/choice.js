'use strict';
/* 选题浮窗逻辑（外链加载）：四选一 + 右下角拖拽缩放 */
(function () {
  const $ = function (id) { return document.getElementById(id); };
  let S = null, words = [], wi = -1, cur = null, opts = [], ansIdx = -1;
  let answered = false, voice = null, wrongStreak = 0;

  async function boot() {
    S = await momo.getSettings();
    applySyncBtn();
    pickVoice();
    await nextBatch();
    next();
    momo.onSettings(function (s) { S = s; applySyncBtn(); });
    momo.onDataChanged(function () { nextBatch().then(next); });
    $('q-close').onclick = function () { momo.toggleChoice(false); };
    $('q-speak').onclick = function () { if (cur) speak(cur.word); };
    $('q-skip').onclick = function () { next(); };
    $('q-sync').onclick = async function () {
      const sync = !(S.widget && S.widget.choice && S.widget.choice.sync !== false);
      await momo.setSettings({ widget: { choice: { sync: sync } } });
      applySyncBtn();
    };
    $('q-kb').onclick = async function () {
      const cur2 = S.widget && S.widget.choice && S.widget.choice.kbMode;
      await momo.setKbMode(!cur2);
    };
    document.addEventListener('keydown', function (e) {
      const k = e.key.toLowerCase();
      const map = { 1: 0, 2: 1, 3: 2, 4: 3, a: 0, b: 1, c: 2, d: 3 };
      if (k in map) clickOpt(map[k]);
      if (k === 'enter') next();
    });
    momo.onKbAnswer(function (i) { clickOpt(i); });
    setupResize();
  }

  function applySyncBtn() {
    const on = S.widget && S.widget.choice && S.widget.choice.sync !== false;
    $('q-sync').textContent = on ? '✓ 计入进度' : '仅练习';
    $('q-sync').classList.toggle('on', !!on);
    const kb = S.widget && S.widget.choice && S.widget.choice.kbMode;
    const kbBtn = $('q-kb');
    if (kbBtn) {
      kbBtn.classList.toggle('on', !!kb);
      kbBtn.title = kb ? '键盘答题已开启（1-4 全局生效，点击关闭）' : '键盘答题未开启（点击后 1-4 全局答题）';
    }
    const op = S.widget && S.widget.choice && S.widget.choice.opacity != null ? S.widget.choice.opacity : 1;
    $('card').style.opacity = op;
  }

  /* 右下角 grip 拖拽缩放窗口 */
  function setupResize() {
    const grip = $('grip');
    let startX = 0, startY = 0, startW = 0, startH = 0, dragging = false;
    grip.addEventListener('mousedown', function (e) {
      e.preventDefault(); e.stopPropagation();
      dragging = true;
      startX = e.screenX; startY = e.screenY;
      startW = window.innerWidth; startH = window.innerHeight;
      grip.setPointerCapture && grip.setPointerCapture(e.pointerId);
    });
    window.addEventListener('mousemove', function (e) {
      if (!dragging) return;
      const w = Math.max(300, Math.min(700, startW + (e.screenX - startX)));
      const h = Math.max(260, Math.min(640, startH + (e.screenY - startY)));
      momo.resizeWidget({ w: w, h: h, save: false });
    });
    window.addEventListener('mouseup', function (e) {
      if (!dragging) return;
      dragging = false;
      const w = Math.max(300, Math.min(700, startW + (e.screenX - startX)));
      const h = Math.max(260, Math.min(640, startH + (e.screenY - startY)));
      momo.resizeWidget({ w: w, h: h, save: true });
    });
  }

  function pickVoice() {
    function pick() {
      const vs = speechSynthesis.getVoices().filter(function (v) { return /^en/i.test(v.lang); });
      voice = vs.find(function (v) { return /US/i.test(v.lang); }) || vs[0] || null;
    }
    pick();
    speechSynthesis.onvoiceschanged = pick;
  }

  function speak(t) {
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(t);
      u.rate = (S && S.ttsRate) || 1;
      if (voice) u.voice = voice;
      speechSynthesis.speak(u);
    } catch (e) {}
  }

  async function nextBatch() {
    try { words = await momo.widgetWords({ n: 30 }); wi = -1; } catch (e) { words = []; }
  }

  async function next() {
    if (!words.length) await nextBatch();
    if (!words.length) { $('word').textContent = '暂无词库数据'; $('opts').innerHTML = ''; return; }
    wi++;
    if (wi >= words.length) { await nextBatch(); if (!words.length) return; wi = 0; }
    cur = words[wi];
    /* 词义级出题：正确答案从该词所有词义中随机抽一个；干扰项排除与该词任何词义同文的项 */
    const senses = [];
    (cur.trans || []).forEach(function (t) {
      if (t.cn) senses.push({ pos: t.pos || '', bare: t.cn.toLowerCase(), text: (t.pos ? t.pos + '. ' : '') + t.cn });
    });
    if (!senses.length && cur.cn) {
      senses.push({ pos: cur.pos || '', bare: cur.cn.replace(/^[a-z]+\.\s*/i, '').toLowerCase(), text: cur.cn });
    }
    if (!senses.length) senses.push({ pos: '', bare: '', text: '（无释义）' });
    const pick = senses[Math.floor(Math.random() * senses.length)];
    const correct = pick.text;
    const bareSet = new Set(senses.map(function (s) { return s.bare; }));
    const set = {}; set[correct] = 1;
    opts = [correct];
    for (let i = 0; i < words.length && opts.length < 4; i++) {
      const o = words[(wi + 1 + i) % words.length];
      if (!o || o.id === cur.id) continue;
      /* 候选词的任一词义若与当前词的任一词义同文，则不能做干扰项（避免一题双解） */
      const oBares = (o.trans || []).map(function (t) { return (t.cn || '').toLowerCase(); }).filter(Boolean);
      if (!oBares.length && o.cn) oBares.push(o.cn.replace(/^[a-z]+\.\s*/i, '').toLowerCase());
      if (oBares.some(function (b) { return bareSet.has(b); })) continue;
      const cn = o.cn || (o.trans && o.trans[0] && (o.trans[0].pos ? o.trans[0].pos + '. ' : '') + o.trans[0].cn) || '';
      if (!cn || set[cn]) continue;
      set[cn] = 1; opts.push(cn);
    }
    while (opts.length < 4) opts.push('——');
    for (let i = opts.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = opts[i]; opts[i] = opts[j]; opts[j] = t;
    }
    ansIdx = opts.indexOf(correct);
    answered = false;
    const posAll = [];
    senses.forEach(function (s) { if (s.pos && posAll.indexOf(s.pos) < 0) posAll.push(s.pos); });
    $('word').innerHTML = esc(cur.word) + (posAll.length ? '<span class="pos">' + esc(posAll.join('/')) + '.</span>' : '');
    $('phon').textContent = [cur.uk ? '/' + cur.uk + '/' : '', cur.us ? '/' + cur.us + '/' : ''].filter(Boolean).join('  ');
    $('msg').innerHTML = '';
    $('idx').textContent = (wi + 1) + '/' + words.length;
    $('opts').innerHTML = opts.map(function (o, i) {
      return '<div class="opt" data-i="' + i + '"><span class="idx idx' + i + '">' + 'ABCD'[i] + '</span><span>' + esc(o) + '</span></div>';
    }).join('');
    Array.prototype.forEach.call($('opts').children, function (el) {
      el.onclick = function () { clickOpt(+el.dataset.i); };
    });
    if (!S.widget || !S.widget.choice || S.widget.choice.speak !== false) speak(cur.word);
  }

  async function clickOpt(i) {
    if (answered || !cur || i < 0 || i > 3) return;
    answered = true;
    const ok = i === ansIdx;
    Array.prototype.forEach.call($('opts').children, function (el, j) {
      el.classList.add(j === ansIdx ? 'correct' : (j === i && !ok ? 'wrong' : 'dim'));
      el.style.pointerEvents = 'none';
    });
    $('msg').innerHTML = ok
      ? '<span class="ok">✓ 答对了</span>'
      : '<span class="bad">✗ 正确：' + esc(opts[ansIdx]) + '</span>';
    wrongStreak = ok ? 0 : wrongStreak + 1;
    const sync = S.widget && S.widget.choice && S.widget.choice.sync !== false;
    if (sync && cur.id) {
      try { await momo.rate({ wordId: cur.id, rating: ok ? 3 : (wrongStreak >= 2 ? 1 : 2) }); } catch (e) {}
    }
    setTimeout(function () { if (answered) next(); }, ok ? 900 : 1600);
  }

  function esc(s) {
    const A = String.fromCharCode(38);
    return String(s == null ? '' : s)
      .split(A).join(A + 'amp;')
      .split('<').join(A + 'lt;')
      .split('>').join(A + 'gt;')
      .split('"').join(A + 'quot;');
  }

  boot();
})();
