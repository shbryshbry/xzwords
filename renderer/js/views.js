'use strict';
/* ============================================================
 * 页面：我的词库 / 复习预览 / 学习统计 / 桌面插件 / 全局熟词 / 设置
 * ============================================================ */

/* ================= 我的词库 ================= */
App.views.home = async function (view) {
  await App.refreshBooks();
  view.innerHTML =
    '<div class="page-title">我的词库 <button class="btn primary" id="b-new">＋ 新建词库</button></div>' +
    '<div class="page-sub">纯单机运行，数据保存在本机。点击词库卡片查看与管理单词。</div>' +
    '<div class="book-grid" id="book-grid"></div>';
  const grid = App.$('#book-grid', view);

  function renderGrid() {
    grid.innerHTML = '';
    App.books.forEach(function (b) {
      const c = b.counts || {};
      const el = document.createElement('div');
      el.className = 'book-card';
      el.innerHTML =
        '<div class="stripe" style="background:' + b.color + '"></div>' +
        '<h3>' + App.esc(b.name) + '</h3>' +
        '<div class="stats"><span>共 <b>' + (c.total || 0) + '</b> 词</span>' +
        '<span>新词 <b>' + (c.news || 0) + '</b></span>' +
        '<span>待复习 <b>' + ((c.dueNow || 0) + (c.dueToday || 0)) + '</b></span>' +
        '<span>已掌握 <b>' + (c.mastered || 0) + '</b></span></div>' +
        '<div class="row"><button class="btn small primary" data-a="learn">开始学习</button>' +
        '<button class="btn small" data-a="manage">管理</button></div>';
      App.$('[data-a=learn]', el).onclick = function (e) {
        e.stopPropagation();
        App.setBook(b.id).then(function () { App.go('learn'); });
      };
      App.$('[data-a=manage]', el).onclick = function (e) {
        e.stopPropagation();
        App.setBook(b.id).then(function () { App.go('book', { bookId: b.id }); });
      };
      el.onclick = function () { App.setBook(b.id).then(function () { App.go('book', { bookId: b.id }); }); };
      el.oncontextmenu = function (e) {
        e.preventDefault();
        App.ctxMenu(e.clientX, e.clientY, [
          { label: '📖 打开 / 管理', onClick: function () { App.go('book', { bookId: b.id }); } },
          { label: '✏️ 重命名', onClick: function () { renameBook(b); } },
          { label: '🗑️ 删除词库', danger: true, onClick: async function () {
            if (await App.confirm('删除词库「' + b.name + '」？其学习进度将一并删除。')) {
              await momo.deleteBook(b.id);
              await App.refreshBooks(); App.render(); App.toast('已删除');
            }
          } }
        ]);
      };
      grid.appendChild(el);
    });
    const add = document.createElement('div');
    add.className = 'book-add';
    add.innerHTML = '<div class="plus">＋</div><div>新建空白词库 / 导入词库文件</div>';
    add.onclick = function () { createBookDialog(); };
    grid.appendChild(add);
  }

  function createBookDialog() {
    const body = document.createElement('div');
    body.innerHTML =
      '<div class="set-row"><label>词库 名称</label><input class="input grow" id="nb-name" placeholder="例如：CET-4 核心词"></div>' +
      '<div class="set-row"><label>描述（可选）</label><input class="input grow" id="nb-desc"></div>' +
      '<div class="set-row"><label>导入文件（可选）</label>' +
      '<button class="btn" id="nb-pick">选择文件</button><span class="muted" id="nb-file"></span></div>' +
      '<div class="muted" style="margin-top:8px">支持：官网同款 JSONL（每行一个词的 JSON）、JSON 数组、TXT/CSV（每行「单词 = 译文」或「单词,译文」）</div>';
    let picked = [];
    const m = App.modal({
      title: '新建词库', body: body,
      actions: [
        { label: '取消', onClick: function (close) { close(); } },
        { label: '创建', cls: 'primary', onClick: async function (close) {
          const name = App.$('#nb-name', body).value.trim() || '新词库';
          const b = await momo.createBook({ name: name, desc: App.$('#nb-desc', body).value.trim() });
          let msg = '';
          if (picked.length) {
            const rs = await momo.importFile({ bookId: b.id, paths: picked });
            rs.forEach(function (r) {
              if (r.added === 0 && r.dup > 0) msg += r.file + ' 的 ' + r.dup + ' 个词已全部存在；';
              else msg += r.file + '：导入 ' + r.added + ' 词（重复 ' + r.dup + '，坏行 ' + r.bad + '）；';
            });
          }
          close();
          await App.refreshBooks(); App.render();
          if (msg) App.toast(msg, 'ok'); else App.toast('词库已创建', 'ok');
          if (picked.length) App.go('book', { bookId: b.id });
        } }
      ]
    });
    App.$('#nb-pick', body).onclick = async function () {
      picked = await momo.pickImportFiles();
      App.$('#nb-file', body).textContent = picked.map(function (p) { return p.split(/[\\/]/).pop(); }).join('、');
    };
  }

  function renameBook(b) {
    const body = document.createElement('div');
    body.innerHTML = '<div class="set-row"><label>新名称</label><input class="input grow" id="rb-name" value="' + App.esc(b.name) + '"></div>';
    App.modal({
      title: '重命名词库', body: body,
      actions: [
        { label: '取消', onClick: function (close) { close(); } },
        { label: '保存', cls: 'primary', onClick: async function (close) {
          await momo.updateBook({ id: b.id, name: App.$('#rb-name', body).value.trim() });
          close(); await App.refreshBooks(); App.render();
        } }
      ]
    });
  }

  App.$('#b-new', view).onclick = createBookDialog;
  renderGrid();
};

/* ================= 复习预览 ================= */
App.views.forecast = async function (view) {
  if (!App.bookId) { App.go('home'); return; }
  const f = await momo.forecast({ bookId: App.bookId, days: 30 });
  view.innerHTML =
    '<div class="page-title">复习预览 <select class="select" id="fc-book">' + App.bookSelectHtml(App.bookId) + '</select></div>' +
    '<div class="page-sub">未来 30 天到期安排（' + (f.overdue ? '<b style="color:var(--bad)">有 ' + f.overdue + ' 个已逾期，点今天开始复习</b>' : '一切按计划') + '）</div>' +
    '<div class="fc-grid" id="fc-grid"></div>' +
    '<div id="fc-detail" style="margin-top:18px"></div>';
  App.$('#fc-book', view).onchange = function (e) { App.setBook(e.target.value).then(function () { App.render(); }); };

  const grid = App.$('#fc-grid', view);
  let selected = null;
  f.days.forEach(function (d, i) {
    const el = document.createElement('div');
    el.className = 'fc-day' + (i === 0 ? ' today' : '');
    el.innerHTML = '<div class="d">' + (i === 0 ? '今天' : i === 1 ? '明天' : d.date.slice(5)) + '</div>' +
      '<div class="c">' + d.count + '</div>' + (i === 0 && f.overdue ? '<div class="od">含逾期' + f.overdue + '</div>' : '');
    el.onclick = function () {
      selected = d.date;
      App.$$('.fc-day', grid).forEach(function (x) { x.classList.remove('sel'); });
      el.classList.add('sel');
      showDetail(d);
    };
    grid.appendChild(el);
  });

  async function showDetail(d) {
    const box = App.$('#fc-detail', view);
    if (!d.count && !(d.date === f.today && f.overdue)) { box.innerHTML = '<div class="card muted">这一天没有安排复习 🎉</div>'; return; }
    const list = await momo.forecastDetail({ bookId: App.bookId, date: d.date });
    const rows = list.map(function (w) {
      return '<tr><td class="w" data-id="' + w.id + '">' + App.esc(w.word) + '</td><td class="muted">' + App.esc(w.cn) + '</td>' +
        '<td class="muted">' + App.fmtTime(w.due) + '</td></tr>';
    }).join('');
    box.innerHTML =
      '<div class="card"><div class="row" style="margin-bottom:10px"><b>' + d.date + ' 到期（' + list.length + ' 词）</b><span class="grow"></span>' +
      '<button class="btn small primary" id="fc-learn">▶ 提前学习这一天</button></div>' +
      '<table class="words"><tbody>' + (rows || '<tr><td class="muted">无</td></tr>') + '</tbody></table></div>';
    App.$$('#fc-detail .w', view).forEach(function (td) {
      td.onclick = function () { App.speak(td.textContent); };
    });
    App.$('#fc-learn', box).onclick = async function () {
      const ids = list.map(function (w) { return w.id; });
      App.go('tools', { bookId: App.bookId, ids: ids, title: d.date + ' 到期复习' });
    };
  }
  if (f.days[0]) {
    grid.children[0].classList.add('sel');
    showDetail(Object.assign({ date: f.today, count: f.overdue }, f.days[0]));
  }
};

/* ================= 学习统计 ================= */
App.views.stats = async function (view) {
  const st = await momo.stats();
  const todayKey = (() => {
    const d = new Date(); const p = function (n) { return n < 10 ? '0' + n : '' + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  })();
  const today = st.byDay[todayKey] || { news: 0, rev: 0 };
  /* 连续学习天数 */
  let streak = 0;
  {
    const day = new Date();
    for (;;) {
      const p = function (n) { return n < 10 ? '0' + n : '' + n; };
      const k = day.getFullYear() + '-' + p(day.getMonth() + 1) + '-' + p(day.getDate());
      const rec = st.byDay[k];
      if (rec && ((rec.news || 0) + (rec.rev || 0)) > 0) { streak++; day.setDate(day.getDate() - 1); }
      else if (streak === 0 && k === todayKey) { day.setDate(day.getDate() - 1); }  /* 今天还没学，看昨天起算 */
      else break;
    }
  }
  /* 最近 14 天 */
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const p = function (n) { return n < 10 ? '0' + n : '' + n; };
    const k = d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
    days.push({ key: k, md: p(d.getMonth() + 1) + '/' + p(d.getDate()), news: (st.byDay[k] || {}).news || 0, rev: (st.byDay[k] || {}).rev || 0 });
  }
  const maxV = Math.max(10, ...days.map(function (d) { return d.news + d.rev; }));

  let totalWords = 0, mastered = 0;
  App.books.forEach(function (b) { totalWords += (b.counts && b.counts.total) || 0; mastered += (b.counts && b.counts.mastered) || 0; });

  view.innerHTML =
    '<div class="page-title">学习统计</div>' +
    '<div class="page-sub">所有数据仅保存在本机</div>' +
    '<div class="count-cards" style="margin-bottom:16px">' +
      '<div class="count-card hl"><div class="v">' + today.news + '</div><div class="l">今日新学</div></div>' +
      '<div class="count-card"><div class="v">' + today.rev + '</div><div class="l">今日复习</div></div>' +
      '<div class="count-card"><div class="v">' + streak + ' 天</div><div class="l">连续学习</div></div>' +
      '<div class="count-card"><div class="v">' + st.totals.news + '</div><div class="l">累计新学</div></div>' +
      '<div class="count-card"><div class="v">' + st.totals.rev + '</div><div class="l">累计复习</div></div>' +
    '</div>' +
    '<div class="card"><b>近 14 天学习量</b>' +
      '<div class="chart" id="chart"></div>' +
      '<div class="legend"><span><i style="background:var(--ok)"></i>新学</span><span><i style="background:#9db8ff"></i>复习</span></div>' +
    '</div>' +
    '<div class="row" style="margin-top:16px">' +
      '<div class="card grow">词库总数 <b>' + App.books.length + '</b> ｜ 单词总量 <b>' + totalWords + '</b> ｜ 已掌握 <b>' + mastered + '</b></div>' +
    '</div>';

  const chart = App.$('#chart', view);
  days.forEach(function (d) {
    const col = document.createElement('div');
    col.className = 'col';
    const hNews = Math.round(d.news / maxV * 150), hRev = Math.round(d.rev / maxV * 150);
    col.innerHTML = '<div class="bar" title="新学 ' + d.news + ' / 复习 ' + d.rev + '">' +
      '<div class="b-rev" style="height:' + hRev + 'px"></div>' +
      '<div class="b-news" style="height:' + hNews + 'px"></div></div>' +
      '<div class="xl">' + d.md + '</div>';
    chart.appendChild(col);
  });
};

/* ================= 桌面插件 ================= */
let _widgetsBound = false;
App.views.widgets = async function (view) {
  const state = await momo.widgetState();
  App._stickers = await momo.listStickers();   /* 先取贴纸列表，避免空间下拉用陈旧数据 */
  const s = App.S;
  const sp = s.widget;
  const ws = s.widgetSource || { bookId: '', kind: 'all' };

  view.innerHTML =
    '<div class="page-title">桌面插件</div>' +
    '<div class="page-sub">利用碎片时间被动学习：轮播定时切换、浮窗四选一、贴纸常驻桌面。点击单词均可发音。</div>' +
    '<div class="book-grid">' +

    /* 轮播 */
    '<div class="card"><h3 style="margin-bottom:8px">🎠 桌面轮播 <span class="badge ' + (state.carousel.on ? 'master' : 'new') + '">' + (state.carousel.on ? '运行中' : '未开启') + '</span></h3>' +
      '<div class="set-row"><label>切换间隔（秒）</label><input class="input" style="width:90px" type="number" min="3" max="600" value="' + (sp.carousel.intervalSec || 15) + '" id="cm-int"></div>' +
      '<div class="set-row"><label>透明度</label><input type="range" min="30" max="100" value="' + Math.round((sp.carousel.opacity == null ? 1 : sp.carousel.opacity) * 100) + '" id="cm-op"></div>' +
      '<div class="set-row"><label>显示译文</label><div class="switch' + (sp.carousel.showTrans !== false ? ' on' : '') + '" id="cm-st"></div></div>' +
      '<div class="set-row"><label>切换时发音</label><div class="switch' + (sp.carousel.speak !== false ? ' on' : '') + '" id="cm-sp"></div></div>' +
      '<div class="row" style="margin-top:10px"><button class="btn primary" id="cm-toggle">' + (state.carousel.on ? '关闭轮播' : '开启轮播') + '</button></div></div>' +

    /* 选题浮窗 */
    '<div class="card"><h3 style="margin-bottom:8px">✅ 选题浮窗 <span class="badge ' + (state.choice && state.choice.on ? 'master' : 'new') + '">' + (state.choice && state.choice.on ? '运行中' : '未开启') + '</span></h3>' +
      '<div class="page-sub" style="margin-bottom:6px">常驻桌面小窗，四选一答题，边看别的边背词。拖动右下角 ⌟ 可调整大小。</div>' +
      '<div class="set-row"><label>答题计入学习进度</label><div class="switch' + (sp.choice && sp.choice.sync !== false ? ' on' : '') + '" id="qm-sync"></div>' +
      '<span class="hint">答对→认识，连错→不认识，自动安排复习</span></div>' +
      '<div class="set-row"><label>出题时发音</label><div class="switch' + (sp.choice && sp.choice.speak !== false ? ' on' : '') + '" id="qm-spk"></div></div>' +
      '<div class="set-row"><label>透明度</label><input type="range" min="30" max="100" value="' + Math.round((sp.choice && sp.choice.opacity != null ? sp.choice.opacity : 1) * 100) + '" id="qm-op"></div>' +
      '<div class="row" style="margin-top:10px"><button class="btn primary" id="qm-toggle">' + (state.choice && state.choice.on ? '关闭浮窗' : '开启浮窗') + '</button>' +
      '<span class="muted">全局快捷键 <span class="kbd">Alt+Q</span> 显示/隐藏；浮窗内 ⌨ 开启后可随时按 <span class="kbd">1-4</span> 答题（不抢焦点）</span></div></div>' +

    /* 贴纸 */
    '<div class="card"><h3 style="margin-bottom:8px">📌 桌面贴纸 <span class="badge review">已有 ' + state.sticker.count + ' 张</span></h3>' +
      '<div class="set-row"><label>显示译文</label><div class="switch' + (sp.sticker.showTrans !== false ? ' on' : '') + '" id="km-st"></div></div>' +
      '<div class="set-row"><label>透明度</label><input type="range" min="30" max="100" value="' + Math.round((sp.sticker.opacity == null ? 1 : sp.sticker.opacity) * 100) + '" id="km-op"></div>' +
      '<div class="set-row"><label>默认样式</label><select class="select" id="km-style">' + stickerStyles(sp.sticker.style) + '</select></div>' +
      '<div class="set-row"><label>贴纸空间</label><select class="select" id="km-space">' + spaceOptions() + '</select></div>' +
      '<div class="row" style="margin-top:10px"><span class="muted">在「词库管理」中右键单词 → 添加贴纸；贴纸右键可换样式或删除</span></div></div>' +
    '</div>' +
    '<div class="card" style="margin-top:16px"><b>词汇来源（轮播/浮窗通用）</b><div class="row" style="margin-top:8px">' +
      '<select class="select" id="wg-book"><option value="">跟随当前词库</option>' + App.bookSelectHtml(ws.bookId || App.bookId) + '</select>' +
      '<select class="select" id="wg-kind">' +
        '<option value="all"' + ((ws.kind || 'all') === 'all' ? ' selected' : '') + '>全部单词</option>' +
        '<option value="new"' + (ws.kind === 'new' ? ' selected' : '') + '>新词</option>' +
        '<option value="due"' + (ws.kind === 'due' ? ' selected' : '') + '>待复习</option></select>' +
      '<span class="muted">改动即时生效，无需重启插件</span></div></div>';

  function stickerStyles(cur) {
    const m = { yellow: '便签黄', green: '清新绿', blue: '天空蓝', pink: '樱花粉', dark: '夜间黑' };
    return Object.keys(m).map(function (k) {
      return '<option value="' + k + '"' + (k === cur ? ' selected' : '') + '>' + m[k] + '</option>';
    }).join('');
  }
  function spaceOptions() {
    const set = { '默认': 1 };
    (App._stickers || []).forEach(function (x) { set[x.space] = 1; });
    return Object.keys(set).map(function (x) {
      return '<option' + (x === s.stickerSpace ? ' selected' : '') + '>' + App.esc(x) + '</option>';
    }).join('');
  }

  const bind = function (id, fn) { const el = App.$(id, view); if (el) el.onchange = fn; };
  const sw = function (id, set) {
    const el = App.$(id, view);
    el.onclick = async function () {
      el.classList.toggle('on');
      await set(el.classList.contains('on'));
    };
  };

  bind('#cm-int', async function (e) { await momo.setSettings({ widget: { carousel: { intervalSec: Math.max(3, Math.min(600, +e.target.value || 15)) } } }); });
  bind('#cm-op', async function (e) { await momo.setSettings({ widget: { carousel: { opacity: +e.target.value / 100 } } }); });
  sw('#cm-st', async function (v) { await momo.setSettings({ widget: { carousel: { showTrans: v } } }); });
  sw('#cm-sp', async function (v) { await momo.setSettings({ widget: { carousel: { speak: v } } }); });
  sw('#qm-sync', async function (v) { await momo.setSettings({ widget: { choice: { sync: v } } }); });
  sw('#qm-spk', async function (v) { await momo.setSettings({ widget: { choice: { speak: v } } }); });
  bind('#qm-op', async function (e) { await momo.setSettings({ widget: { choice: { opacity: +e.target.value / 100 } } }); });
  sw('#km-st', async function (v) { await momo.setSettings({ widget: { sticker: { showTrans: v } } }); });
  bind('#km-op', async function (e) { await momo.setSettings({ widget: { sticker: { opacity: +e.target.value / 100 } } }); });
  bind('#km-style', async function (e) { await momo.setSettings({ widget: { sticker: { style: e.target.value } } }); });
  bind('#km-space', async function (e) { await momo.setSettings({ stickerSpace: e.target.value }); });
  bind('#wg-book', async function (e) { await momo.setSettings({ widgetSource: { bookId: e.target.value } }); });
  bind('#wg-kind', async function (e) { await momo.setSettings({ widgetSource: { kind: e.target.value } }); });

  App.$('#cm-toggle', view).onclick = async function () {
    const st = await momo.toggleCarousel();
    App.toast(st ? '轮播已开启' : '轮播已关闭');
    App.render();
  };
  App.$('#qm-toggle', view).onclick = async function () {
    const st = await momo.toggleChoice();
    App.toast(st ? '选题浮窗已开启' : '选题浮窗已关闭');
    App.render();
  };
};

/* ================= 全局熟词 ================= */
App.views.known = async function (view) {
  const list = await momo.listKnown();
  view.innerHTML =
    '<div class="page-title">全局熟词</div>' +
    '<div class="page-sub">加入后，这些词在<b>所有词库</b>中都会自动标记为熟词，不再进入学习队列。</div>' +
    '<div class="card" style="margin-bottom:14px"><b>批量添加（每行一个单词）</b>' +
    '<textarea class="input" id="kn-add" rows="4" style="width:100%;margin:10px 0" placeholder="the&#10;is&#10;and"></textarea>' +
    '<button class="btn primary" id="kn-btn">加入全局熟词</button></div>' +
    '<div class="card"><b>已标记 ' + list.length + ' 个</b><div id="kn-list" style="margin-top:10px"></div></div>';
  const listBox = App.$('#kn-list', view);
  if (!list.length) listBox.innerHTML = '<div class="muted">还没有熟词</div>';
  else {
    list.forEach(function (w) {
      const el = document.createElement('span');
      el.className = 'dt-tag';
      el.innerHTML = App.esc(w) + ' <small style="cursor:pointer" title="移除">✕</small>';
      App.$('small', el).onclick = async function () {
        await momo.setKnown({ words: [w], val: false });
        App.toast('已移除 ' + w); App.render();
      };
      listBox.appendChild(el);
    });
  }
  App.$('#kn-btn', view).onclick = async function () {
    const words = App.$('#kn-add', view).value.split(/[\n,，\s]+/).map(function (x) { return x.trim(); }).filter(Boolean);
    if (!words.length) return App.toast('请先输入单词', 'err');
    const n = await momo.setKnown({ words: words, val: true });
    App.toast('已加入，现有熟词 ' + n + ' 个', 'ok');
    App.render();
  };
};

/* ================= 设置 ================= */
App.views.settings = async function (view) {
  const s = App.S;
  view.innerHTML =
    '<div class="page-title">设置</div>' +
    '<div class="page-sub">更改即时生效并自动保存</div>' +
    '<div class="card set-sec"><h3>🎯 学习计划</h3>' +
      '<div class="set-row"><label>每日新词上限</label><input class="input" style="width:90px" type="number" min="0" max="1000" value="' + s.dailyNew + '" id="st-dn"><span class="hint">每天最多学习多少个新词</span></div>' +
      '<div class="set-row"><label>每日复习上限</label><input class="input" style="width:90px" type="number" min="0" max="5000" value="' + s.reviewLimit + '" id="st-rl"><span class="hint">一次复习会话最多拉取的到期词数，0 表示不限制</span></div>' +
    '</div>' +
    '<div class="card set-sec"><h3>🧠 记忆算法</h3>' +
      '<div class="set-row"><label>算法</label><select class="select" id="st-algo">' +
        '<option value="fsrs"' + (s.algo === 'fsrs' ? ' selected' : '') + '>FSRS（科学调度，推荐）</option>' +
        '<option value="ebb"' + (s.algo === 'ebb' ? ' selected' : '') + '>艾宾浩斯（经典固定间隔）</option></select></div>' +
      '<div class="set-row"><label>期望记忆率</label><input type="range" min="70" max="97" value="' + Math.round(s.retention * 100) + '" id="st-ret"><b id="st-ret-v">' + Math.round(s.retention * 100) + '%</b>' +
      '<span class="hint">仅 FSRS：越高记得越牢，但复习更频繁（推荐 90%）</span></div>' +
      '<div class="set-row"><label>新词学习步骤（分钟）</label><input class="input" style="width:200px" value="' + (s.stepsMin || []).join(',') + '" id="st-steps"><span class="hint">逗号分隔，如 10,1440 表示 10分钟、1天后；最后一步为毕业</span></div>' +
    '</div>' +
    '<div class="card set-sec"><h3>🔊 发音</h3>' +
      '<div class="set-row"><label>自动发音</label><div class="switch' + (s.autospeak ? ' on' : '') + '" id="st-as"></div><span class="hint">学习工具展示单词时自动读一遍</span></div>' +
      '<div class="set-row"><label>默认口音</label><select class="select" id="st-var"><option value="us"' + (s.ttsVariant === 'us' ? ' selected' : '') + '>美音</option><option value="uk"' + (s.ttsVariant === 'uk' ? ' selected' : '') + '>英音</option></select></div>' +
      '<div class="set-row"><label>音色</label><select class="select" id="st-voice" style="max-width:340px"></select></div>' +
      '<div class="set-row"><label>语速</label><input type="range" min="5" max="20" value="' + Math.round((s.ttsRate || 1) * 10) + '" id="st-rate"><b id="st-rate-v">' + (s.ttsRate || 1) + 'x</b></div>' +
      '<div class="set-row"><label>试听</label><button class="btn" id="st-try">🔊 pronunciation</button></div>' +
    '</div>' +
    '<div class="card set-sec"><h3>💾 数据</h3>' +
      '<div class="set-row"><label>数据目录</label><button class="btn" id="st-dir">打开数据文件夹</button></div>' +
      '<div class="set-row"><label>备份</label><button class="btn" id="st-exp">导出全部数据</button><button class="btn" id="st-imp">导入备份</button>' +
      '<span class="hint">备份包含词库、学习进度与设置，可迁移到其他电脑</span></div>' +
      '<div class="set-row"><label>关于</label><span class="muted" id="st-about">…</span></div>' +
      '<div class="set-row"><label>支持作者</label><button class="btn" id="st-donate" style="border-color:#ff8f1f;color:#c2680a">💗 打赏作者</button>' +
      '<span class="hint">小红书 / 抖音：<b>xz0516762</b>（先z）· 本软件完全免费，任何收费均为骗子</span></div>' +
    '</div>';

  App.$('#st-dn', view).onchange = function (e) { momo.setSettings({ dailyNew: clampN(e.target.value, 0, 1000, 20) }); };
  App.$('#st-rl', view).onchange = function (e) { momo.setSettings({ reviewLimit: clampN(e.target.value, 0, 5000, 200) }); };
  App.$('#st-algo', view).onchange = function (e) { momo.setSettings({ algo: e.target.value }); App.toast('算法已切换为 ' + (e.target.value === 'fsrs' ? 'FSRS' : '艾宾浩斯')); };
  App.$('#st-ret', view).oninput = function (e) {
    App.$('#st-ret-v', view).textContent = e.target.value + '%';
    momo.setSettings({ retention: +e.target.value / 100 });
  };
  App.$('#st-steps', view).onchange = function (e) {
    const arr = e.target.value.split(/[,，\s]+/).map(function (x) { return Math.max(1, parseInt(x, 10) || 0); }).filter(Boolean);
    if (!arr.length) { App.toast('格式不正确', 'err'); e.target.value = (App.S.stepsMin || []).join(','); return; }
    momo.setSettings({ stepsMin: arr });
  };
  App.$('#st-var', view).onchange = function (e) { momo.setSettings({ ttsVariant: e.target.value }); };
  App.$('#st-rate', view).oninput = function (e) {
    const v = +e.target.value / 10;
    App.$('#st-rate-v', view).textContent = v + 'x';
    momo.setSettings({ ttsRate: v });
  };
  swBind('#st-as', function (v) { return momo.setSettings({ autospeak: v }); });
  App.$('#st-try', view).onclick = function () { App.speak('pronunciation'); };
  App.$('#st-dir', view).onclick = function () { momo.openDataDir(); };
  App.$('#st-donate', view).onclick = function () { App.donateModal(); };
  App.$('#st-exp', view).onclick = async function () {
    const p = await momo.exportBackup();
    if (p) App.toast('已导出到 ' + p, 'ok');
  };
  App.$('#st-imp', view).onclick = async function () {
    if (!(await App.confirm('导入备份将覆盖当前所有词库与进度，继续？'))) return;
    const ok = await momo.importBackup();
    if (ok) { App.toast('备份已恢复', 'ok'); App.S = await momo.getSettings(); await App.refreshBooks(); App.render(); }
  };
  momo.appInfo().then(function (info) {
    App.$('#st-about', view).textContent = 'xz背单词 单机版 v' + info.version + ' · Electron ' + info.electron;
  });

  /* 音色下拉 */
  const sel = App.$('#st-voice', view);
  sel.innerHTML = '<option value="">自动选择（系统默认英文音色）</option>' + App.voices.map(function (v) {
    return '<option value="' + App.esc(v.name) + '"' + (v.name === App.S.ttsVoice ? ' selected' : '') + '>' + App.esc(v.name) + ' (' + v.lang + ')</option>';
  }).join('');
  sel.onchange = function () { momo.setSettings({ ttsVoice: sel.value }); };

  function clampN(v, lo, hi, def) { v = parseInt(v, 10); if (isNaN(v)) v = def; return Math.max(lo, Math.min(hi, v)); }
  function swBind(id, fn) {
    const el = App.$(id, view);
    el.onclick = function () { el.classList.toggle('on'); fn(el.classList.contains('on')); };
  }
};
