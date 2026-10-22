'use strict';
/* ============================================================
 * 渲染层核心：状态、路由、TTS、Toast、模态框、通用工具
 * ============================================================ */
const App = window.App = {
  S: null,            /* 设置 */
  books: [],
  bookId: null,       /* 当前词库 */
  route: 'home',
  params: {},
  views: {},
  voices: []
};

/* ---------- 小工具 ---------- */
const _AMP = String.fromCharCode(38);   /* & ；用 charCode 构建实体，避免源码被实体转义破坏 */
App.esc = function (s) {
  return String(s == null ? '' : s)
    .split(_AMP).join(_AMP + 'amp;')
    .split('<').join(_AMP + 'lt;')
    .split('>').join(_AMP + 'gt;')
    .split('"').join(_AMP + 'quot;')
    .split("'").join(_AMP + '#39;');
};
App.$ = function (sel, el) { return (el || document).querySelector(sel); };
App.$$ = function (sel, el) { return Array.prototype.slice.call((el || document).querySelectorAll(sel)); };

App.firstTrans = function (w) {
  if (!w || !w.trans || !w.trans.length) return '';
  const t = w.trans[0];
  return (t.pos ? t.pos + '. ' : '') + t.cn;
};
App.allTrans = function (w) {
  return (w.trans || []).map(function (t) { return (t.pos ? t.pos + '. ' : '') + t.cn; }).join('；');
};
App.phon = function (w) {
  const parts = [];
  if (w.uk) parts.push('英 /' + w.uk + '/');
  if (w.us) parts.push('美 /' + w.us + '/');
  return parts.join('  ');
};
App.fmtTime = function (iso) {
  const d = new Date(iso);
  const p = function (n) { return n < 10 ? '0' + n : '' + n; };
  return p(d.getHours()) + ':' + p(d.getMinutes());
};
App.fmtDate = function (iso) {
  const d = new Date(iso);
  const p = function (n) { return n < 10 ? '0' + n : '' + n; };
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
};

/* 词卡状态徽标 */
App.stateBadge = function (p) {
  if (!p) return '<span class="badge new">新词</span>';
  if (p.known) return '<span class="badge known">熟词</span>';
  if (p.master) return '<span class="badge master">已掌握</span>';
  if (!p.st) return '<span class="badge new">新词</span>';
  if (p.st === 2) return '<span class="badge review">复习中</span>';
  return '<span class="badge learning">学习中</span>';
};
/* 词汇评分 0-100 */
App.wordScore = function (p) {
  if (!p || !p.st) return 0;
  if (p.master) return 100;
  const v = (p.s || 0) * 4 + (p.reps || 0) * 4 - (p.lapses || 0) * 10;
  return Math.max(0, Math.min(95, Math.round(v)));
};
App.scoreBar = function (p) {
  const v = App.wordScore(p);
  const cls = p && p.master ? 's3' : v >= 60 ? 's2' : v >= 25 ? 's1' : 's0';
  return '<span class="score ' + cls + '"><i style="width:' + v + '%"></i></span>';
};

/* ---------- Toast ---------- */
App.toast = function (msg, type) {
  const box = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = 'toast' + (type ? ' ' + type : '');
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(function () { el.style.opacity = '0'; el.style.transition = 'opacity .4s'; }, 2600);
  setTimeout(function () { el.remove(); }, 3100);
};
App.confirm = function (msg, detail) {
  return momo.confirmDialog({ message: msg, detail: detail || '', buttons: ['取消', '确定'] })
    .then(function (r) { return r === 1; });
};

/* ---------- 模态框 ---------- */
App.modal = function (opts) {
  const root = document.getElementById('modal-root');
  const mask = document.createElement('div');
  mask.className = 'modal-mask';
  mask.innerHTML =
    '<div class="modal' + (opts.wide ? ' wide' : '') + '">' +
      '<div class="modal-head"><b>' + opts.title + '</b>' +
      '<button class="modal-close">✕</button></div>' +
      '<div class="modal-body"></div>' +
      (opts.foot === false ? '' : '<div class="modal-foot"></div>') +
    '</div>';
  const body = App.$('.modal-body', mask);
  if (typeof opts.body === 'string') body.innerHTML = opts.body; else if (opts.body) body.appendChild(opts.body);
  const foot = App.$('.modal-foot', mask);
  let closed = false;
  const close = function () { if (closed) return; closed = true; mask.remove(); if (opts.onClose) opts.onClose(); };
  (opts.actions || []).forEach(function (a) {
    const b = document.createElement('button');
    b.className = 'btn ' + (a.cls || '');
    b.textContent = a.label;
    b.onclick = function () { Promise.resolve(a.onClick ? a.onClick(close) : null); };
    foot.appendChild(b);
  });
  App.$('.modal-close', mask).onclick = close;
  mask.addEventListener('mousedown', function (e) { if (e.target === mask) close(); });
  root.appendChild(mask);
  return { close: close, body: body, el: mask };
};

/* ---------- 右键菜单 ---------- */
App.ctxMenu = function (x, y, items) {
  const m = document.getElementById('ctx-menu');
  m.innerHTML = '';
  items.forEach(function (it) {
    const d = document.createElement('div');
    if (it.label === '-') { d.style.cssText = 'height:1px;background:#eee;margin:3px 8px;padding:0'; }
    else {
      d.textContent = it.label;
      if (it.danger) d.className = 'danger';
      d.onclick = function () { m.hidden = true; it.onClick(); };
    }
    m.appendChild(d);
  });
  m.hidden = false;
  const r = m.getBoundingClientRect();
  m.style.left = Math.min(x, window.innerWidth - r.width - 8) + 'px';
  m.style.top = Math.min(y, window.innerHeight - r.height - 8) + 'px';
};
document.addEventListener('mousedown', function (e) {
  const m = document.getElementById('ctx-menu');
  if (!m.hidden && !m.contains(e.target)) m.hidden = true;
});
document.addEventListener('keydown', function (e) { if (e.key === 'Escape') document.getElementById('ctx-menu').hidden = true; });

/* ---------- TTS 发音 ---------- */
App.speak = function (text, variant) {
  if (!text || !window.speechSynthesis) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(String(text));
    const wantUs = (variant || App.S.ttsVariant || 'us') === 'us';
    u.lang = wantUs ? 'en-US' : 'en-GB';
    u.rate = App.S.ttsRate || 1;
    let v = null;
    if (App.S.ttsVoice) v = App.voices.find(function (x) { return x.name === App.S.ttsVoice; });
    if (!v) v = App.voices.find(function (x) { return x.lang === u.lang; });
    if (!v) v = App.voices.find(function (x) { return /^en/.test(x.lang); });
    if (v) { u.voice = v; u.lang = v.lang; }
    speechSynthesis.speak(u);
  } catch (e) { /* 忽略语音异常 */ }
};
App.loadVoices = function () {
  if (!window.speechSynthesis) return;
  App.voices = speechSynthesis.getVoices().filter(function (v) { return /^en/i.test(v.lang); });
};
if (window.speechSynthesis) {
  App.loadVoices();
  speechSynthesis.onvoiceschanged = function () {
    App.loadVoices();
    if (App.route === 'settings') App.render();   /* 音色列表异步到达后刷新设置页 */
  };
}

/* ---------- 路由 ---------- */
App.go = function (route, params) {
  if (App._cleanup) { try { App._cleanup(); } catch (e) {} App._cleanup = null; }
  App.route = route;
  App.params = params || {};
  App.render();
};
App.render = function () {
  const view = document.getElementById('view');
  view.innerHTML = '';
  App.$$('#nav a').forEach(function (a) {
    a.classList.toggle('active', a.dataset.route === App.route ||
      (a.dataset.route === 'learn' && (App.route === 'tools')));
  });
  const v = App.views[App.route];
  if (v) Promise.resolve(v(view, App.params)).catch(function (e) {
    console.error(e);
    view.innerHTML = '<div class="empty"><div class="big">😵</div>页面出错了：' + App.esc(e.message) + '</div>';
  });
};

/* ---------- 导航 ---------- */
App.init = async function () {
  App.S = await momo.getSettings();
  App.bookId = App.S.activeBookId || null;
  App.$$('#nav a').forEach(function (a) {
    a.onclick = function () {
      if (a.dataset.route === 'learn' || a.dataset.route === 'forecast') {
        if (!App.bookId && App.books.length) App.bookId = App.books[0].id;
        if (!App.bookId) { App.toast('请先创建或导入一个词库', 'err'); App.go('home'); return; }
      }
      App.go(a.dataset.route);
    };
  });
  document.getElementById('btn-tray-tip').onclick = function () {
    App.toast('点击 ✕ 关闭窗口后，程序在系统托盘继续运行；托盘图标右键可彻底退出');
  };
  momo.onSettings(function (s) { App.S = s; });
  momo.onWidgetState(function () { if (App.route === 'widgets') App.render(); });
  momo.onDataChanged(function () { App.refreshBooks().then(function () { App.render(); }); });
  momo.onImportRequest(function (file) { App.handleImportRequest(file); });
  window.addEventListener('keydown', function (e) {
    if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if (e.altKey && (e.key === 'n' || e.key === 'N')) { e.preventDefault(); document.querySelector('[data-route="learn"]').click(); }
  });
  await App.refreshBooks();
  App.go('home');
};

App.refreshBooks = async function () {
  App.books = await momo.listBooks();
  if (App.bookId && !App.books.some(function (b) { return b.id === App.bookId; })) {
    App.bookId = App.books.length ? App.books[0].id : null;
  }
  if (!App.bookId && App.books.length) App.bookId = App.books[0].id;
  /* 导航角标：各词库到期总数 */
  let due = 0;
  App.books.forEach(function (b) { due += (b.counts && b.counts.dueNow) || 0; });
  const badge = document.getElementById('nav-due');
  if (badge) { badge.hidden = due === 0; badge.textContent = due > 99 ? '99+' : due; }
  return App.books;
};

/* 保存活动词库 */
App.setBook = async function (id) {
  if (App.bookId === id) return;
  App.bookId = id;
  await momo.setSettings({ activeBookId: id });
};

/* 拖拽/双击打开 .json 词库文件 → 导入当前词库 */
App.handleImportRequest = async function (file) {
  if (!App.books.length) {
    App.toast('请先在「我的词库」新建一个词库，再导入文件', 'err');
    App.go('home');
    return;
  }
  const book = App.books.find(function (b) { return b.id === App.bookId; });
  const name = book ? book.name : '当前词库';
  if (!(await App.confirm('把 ' + file + ' 导入「' + name + '」？'))) return;
  try {
    const rs = await momo.importFile({ bookId: App.bookId, paths: [file] });
    const r = rs[0] || {};
    App.toast('导入完成：新增 ' + r.added + ' 词，重复 ' + r.dup + '，坏行 ' + r.bad, 'ok');
    await App.refreshBooks();
    App.render();
  } catch (e) {
    App.toast('导入失败：' + e.message, 'err');
  }
};

/* 延迟 */
App.sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

/* 打赏作者弹窗：微信收款码 + 社交账号 */
App.donateModal = function () {
  const body = document.createElement('div');
  body.innerHTML =
    '<div style="text-align:center">' +
      '<img src="../assets/donate.webp" alt="微信赞赏码" style="width:270px;max-width:80%;border-radius:14px;box-shadow:var(--shadow);border:1px solid var(--line)">' +
      '<div style="margin-top:14px;font-size:15.5px;font-weight:700">如果 xz背单词 对你有帮助，欢迎请作者喝杯饮料 💛</div>' +
      '<div style="margin-top:8px;font-size:12.5px;color:#067a52;font-weight:700">本软件完全免费，任何收费行为均为骗子</div>' +
      '<div class="row" style="justify-content:center;gap:8px;margin-top:12px">' +
        '<span class="chip">📕 小红书：xz0516762</span>' +
        '<span class="chip">🎵 抖音：xz0516762</span>' +
      '</div>' +
      '<div class="muted" style="margin-top:8px;font-size:12.5px">昵称：先z · 关注可以第一时间看到更新动态</div>' +
    '</div>';
  App.modal({
    title: '💗 打赏作者', body: body,
    actions: [{ label: '关闭', onClick: function (close) { close(); } }]
  });
};

/* 词书选择下拉 HTML */
App.bookSelectHtml = function (cur) {
  return App.books.map(function (b) {
    return '<option value="' + b.id + '"' + (b.id === cur ? ' selected' : '') + '>' + App.esc(b.name) + '</option>';
  }).join('');
};
