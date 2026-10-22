'use strict';
/* 桌面贴纸逻辑（外链加载） */
(function () {
  const qs = new URLSearchParams(location.search);
  const sid = qs.get('sid');
  const $ = function (id) { return document.getElementById(id); };
  let sticker = null, word = null, pi = 0, S = null, voice = null;
  const STYLES = ['yellow', 'green', 'blue', 'pink', 'dark'];

  async function boot() {
    S = await momo.getSettings();
    pickVoice();
    sticker = (await momo.listStickers()).find(function (x) { return x.id === sid; });
    if (!sticker) { window.close(); return; }
    await loadWord(sticker.wordId);
    render();
    momo.onStickers(async function (list) {
      const me = list.find(function (x) { return x.id === sid; });
      if (!me) { window.close(); return; }
      sticker = me;
      applyOpacity();
      render();
    });
    $('s-close').onclick = async function () { await momo.deleteSticker(sid); };
    $('s-speak').onclick = function () { if (word) speak(word.word); };
    $('s-prev').onclick = function () { cycle(-1); };
    $('s-next').onclick = function () { cycle(1); };
    $('word').onclick = function () { if (word) speak(word.word); };
    applyOpacity();
    setupResize();
    $('card').addEventListener('contextmenu', function (e) {
      e.preventDefault();
      showMenu(e.clientX, e.clientY);
    });
    document.addEventListener('mousedown', function (e) {
      if (!$('menu').hidden && !$('menu').contains(e.target)) $('menu').hidden = true;
    });
  }

  function applyOpacity() {
    const op = S && S.widget && S.widget.sticker && S.widget.sticker.opacity != null ? S.widget.sticker.opacity : 1;
    $('card').style.opacity = op;
  }

  /* 右下角 grip 拖拽缩放（尺寸按贴纸持久化） */
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
      const w = Math.max(200, Math.min(500, sw + (e.screenX - sx)));
      const h = Math.max(150, Math.min(450, sh + (e.screenY - sy)));
      momo.resizeWidget({ w: w, h: h, save: false });
    });
    window.addEventListener('mouseup', function (e) {
      if (!dragging) return;
      dragging = false;
      const w = Math.max(200, Math.min(500, sw + (e.screenX - sx)));
      const h = Math.max(150, Math.min(450, sh + (e.screenY - sy)));
      momo.resizeWidget({ w: w, h: h, save: true });
    });
  }

  function showMenu(x, y) {
    const m = $('menu');
    m.innerHTML = '';
    [
      { t: '🔊 发音', f: function () { if (word) speak(word.word); } },
      { t: '🎨 换个样式', f: async function () {
        const cur = STYLES.indexOf(sticker.style || 'yellow');
        await momo.updateSticker({ id: sid, patch: { style: STYLES[(cur + 1) % STYLES.length] } });
      } },
      { t: sticker.showTrans ? '🙈 隐藏译文' : '👁 显示译文', f: async function () {
        await momo.updateSticker({ id: sid, patch: { showTrans: !sticker.showTrans } });
      } },
      { t: '➡️ 移到「' + (S.stickerSpace || '默认') + '」空间', f: async function () {
        await momo.updateSticker({ id: sid, patch: { space: S.stickerSpace || '默认' } });
      } },
      { t: '🗑 删除贴纸', danger: true, f: async function () { await momo.deleteSticker(sid); } }
    ].forEach(function (it) {
      const d = document.createElement('div');
      d.textContent = it.t;
      if (it.danger) d.className = 'danger';
      d.onclick = function () { m.hidden = true; it.f(); };
      m.appendChild(d);
    });
    m.hidden = false;
    m.style.left = Math.min(x, window.innerWidth - 150) + 'px';
    m.style.top = Math.min(y, window.innerHeight - 190) + 'px';
  }

  async function loadWord(wordId) {
    if (!sticker) return;
    try {
      word = await momo.wordDetail({ bookId: sticker.bookId, wordId: sticker.wordId });
    } catch (e) { word = null; }
    if (!word) {
      try {
        const pool = await momo.widgetWords({ bookId: sticker.bookId, n: 10 });
        word = pool[0] || null;
      } catch (e) { word = null; }
    }
  }

  async function cycle(dir) {
    if (!sticker) return;
    try {
      const pool = await momo.widgetWords({ bookId: sticker.bookId, n: 20 });
      if (!pool.length) return;
      pi = (pi + dir + pool.length) % pool.length;
      const nw = pool[pi];
      await momo.updateSticker({ id: sid, patch: { wordId: nw.id } });
      word = await momo.wordDetail({ bookId: sticker.bookId, wordId: nw.id });
      render();
    } catch (e) {}
  }

  function render() {
    if (!sticker) return;
    $('card').className = 'st-' + (sticker.style || 'yellow');
    $('s-space').textContent = sticker.space || '默认';
    if (!word) { $('word').textContent = '词条缺失'; $('phon').textContent = ''; $('trans').textContent = ''; return; }
    $('word').textContent = word.word;
    $('phon').textContent = [word.uk ? '/' + word.uk + '/' : '', word.us ? '/' + word.us + '/' : ''].filter(Boolean).join('  ');
    const show = sticker.showTrans != null ? sticker.showTrans : true;
    $('trans').innerHTML = show ? esc(cnOf(word)) : '<span style="opacity:.55">（点击 🔊 听发音回忆）</span>';
  }

  function cnOf(w) {
    if (w.cn) return w.cn;
    return (w.trans || []).map(function (t) { return (t.pos ? t.pos + '. ' : '') + t.cn; }).join('；');
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
