'use strict';
/* 桌面轮播逻辑（外链加载）：顶栏拖动 / 右下角缩放 / 透明度 / 词义显示 */
(function () {
  const $ = function (id) { return document.getElementById(id); };
  let S = null, words = [], wi = -1, timer = null, voice = null, busy = false;

  function cfg() { return (S && S.widget && S.widget.carousel) || {}; }

  async function boot() {
    S = await momo.getSettings();
    applyTheme();
    applyOpacity();
    pickVoice();
    await nextBatch();
    await next();
    restartTimer();
    momo.onSettings(function (s) { S = s; applyTheme(); applyOpacity(); restartTimer(); });
    $('c-next').onclick = function () { next(true); };
    $('c-prev').onclick = function () { prev(); };
    $('c-close').onclick = function () { momo.toggleCarousel(false); };
    $('c-speak').onclick = function () { if (words[wi]) speak(words[wi].word); };
    $('word').onclick = function () { if (words[wi]) speak(words[wi].word); };
    setupResize();
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

  function applyTheme() {
    const th = cfg().theme || 'green';
    $('card').className = 'theme-' + th;
    applyOpacity();
  }

  function applyOpacity() {
    const op = cfg().opacity == null ? 1 : cfg().opacity;
    $('card').style.opacity = op;
  }

  /* 右下角 grip 拖拽缩放（窗口级） */
  function setupResize() {
    const grip = $('grip');
    let sx = 0, sy = 0, sw = 0, sh = 0, dragging = false;
    grip.addEventListener('mousedown', function (e) {
      e.preventDefault(); e.stopPropagation();
      dragging = true;
      sx = e.screenX; sy = e.screenY;
      sw = window.innerWidth; sh = window.innerHeight;
      if (grip.setPointerCapture) try { grip.setPointerCapture(e.pointerId); } catch (e2) {}
    });
    window.addEventListener('mousemove', function (e) {
      if (!dragging) return;
      const w = Math.max(300, Math.min(700, sw + (e.screenX - sx)));
      const h = Math.max(220, Math.min(620, sh + (e.screenY - sy)));
      momo.resizeWidget({ w: w, h: h, save: false });
    });
    window.addEventListener('mouseup', function (e) {
      if (!dragging) return;
      dragging = false;
      const w = Math.max(300, Math.min(700, sw + (e.screenX - sx)));
      const h = Math.max(220, Math.min(620, sh + (e.screenY - sy)));
      momo.resizeWidget({ w: w, h: h, save: true });
    });
  }

  async function nextBatch() {
    try { words = await momo.widgetWords({ n: 15 }); } catch (e) { words = []; }
    wi = -1;
    renderDots();
  }

  function renderDots() {
    const box = $('dots');
    box.innerHTML = '';
    const max = Math.min(words.length, 12);
    for (let i = 0; i < max; i++) {
      const d = document.createElement('i');
      if (i === ((wi % max) + max) % max) d.className = 'on';
      box.appendChild(d);
    }
  }

  async function next(manual) {
    if (busy) return;
    busy = true;
    try {
      if (!words.length) await nextBatch();
      if (!words.length) { $('word').textContent = '暂无词库数据'; return; }
      wi++;
      if (wi >= words.length) { await nextBatch(); if (!words.length) return; wi = 0; }
      render(true);
      if (S.widget && S.widget.carousel.speak) speak(words[wi].word);
    } finally { busy = false; }
  }

  function prev() {
    if (busy || !words.length) return;
    wi = (wi - 1 + words.length) % words.length;
    render(false);
    if (S.widget && S.widget.carousel.speak) speak(words[wi].word);
  }

  function render(animate) {
    const w = words[wi];
    if (!w) return;
    const wordEl = $('word');
    wordEl.textContent = w.word;
    if (animate) {
      wordEl.classList.remove('swap');
      void wordEl.offsetWidth;
      wordEl.classList.add('swap');
    }
    $('word').innerHTML = esc(w.word) + (w.pos ? '<span class="pos">' + esc(w.pos) + '.</span>' : '');
    const ph = [w.uk ? '英 /' + w.uk + '/' : '', w.us ? '美 /' + w.us + '/' : ''].filter(Boolean).join('  ');
    $('phon').textContent = ph;
    const showTrans = !S.widget || !S.widget.carousel || S.widget.carousel.showTrans !== false;
    $('trans').innerHTML = showTrans ? esc(w.cn || (w.trans && w.trans[0] && w.trans[0].cn) || '') : '<span style="opacity:.6">点击 ‹ › 切换</span>';
    $('idx').textContent = (wi + 1) + '/' + words.length;
    renderDots();
  }

  function restartTimer() {
    clearInterval(timer);
    const sec = Math.max(3, cfg().intervalSec || 15);
    timer = setInterval(function () { next(); }, sec * 1000);
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
