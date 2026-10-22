'use strict';
/* ============================================================
 * 页面：词库详情 / 单词管理（筛选、搜索、批量、详情、导入添加）
 * ============================================================ */
(function () {

const FILTERS = [
  { k: 'all', t: '全部' }, { k: 'new', t: '新词' }, { k: 'learning', t: '学习中' },
  { k: 'review', t: '复习中' }, { k: 'master', t: '已掌握' }, { k: 'star', t: '收藏' }, { k: 'known', t: '熟词' }
];
const PAGE = 200;
let st = { filter: 'all', q: '', unit: 0, page: 1, batch: false, sel: {} };
let stBookId = null;   /* 筛选/批量状态随词库隔离，切换词库时重置 */

App.views.book = async function (view, params) {
  const bookId = params.bookId || App.bookId;
  if (!bookId) { App.go('home'); return; }
  if (App.bookId !== bookId) await App.setBook(bookId);   /* 避免每次 render 都写设置 */
  if (stBookId !== bookId) {                              /* 换词库：重置筛选/批量状态 */
    st = { filter: 'all', q: '', unit: 0, page: 1, batch: false, sel: {} };
    stBookId = bookId;
  }
  const data = await momo.bookData(bookId);
  const book = data.book;
  if (!book) { App.toast('词库不存在', 'err'); App.go('home'); return; }

  /* 单元数 */
  const unitSize = book.unitSize || 50;
  const unitCount = Math.ceil(data.words.length / unitSize) || 1;

  view.innerHTML =
    '<div class="page-title">' +
      '<span id="bk-name" style="cursor:pointer" title="点击重命名">' + App.esc(book.name) + '</span>' +
      '<span class="row" style="gap:6px">' +
        '<span class="badge review">共 ' + data.counts.total + ' 词</span>' +
        '<span class="badge new">新词 ' + data.counts.news + '</span>' +
        '<span class="badge learning">学习中 ' + data.counts.learning + '</span>' +
        '<span class="badge master">已掌握 ' + data.counts.mastered + '</span>' +
        (data.counts.star ? '<span class="badge star">收藏 ' + data.counts.star + '</span>' : '') +
        (data.counts.known ? '<span class="badge known">熟词 ' + data.counts.known + '</span>' : '') +
      '</span>' +
      '<span class="grow"></span>' +
      '<button class="btn primary" id="bk-learn">▶ 开始学习</button>' +
    '</div>' +
    '<div class="row" style="margin-bottom:12px">' +
      '<input class="input" id="bk-q" value="' + App.esc(st.q) + '" placeholder="🔍 搜索单词或释义…" style="width:230px">' +
      '<select class="select" id="bk-unit"><option value="0">全部单元</option>' +
        unitOptions(unitCount) + '</select>' +
      '<span id="bk-chips" class="row" style="gap:6px"></span>' +
      '<span class="grow"></span>' +
      '<button class="btn" id="bk-add">＋ 添加单词</button>' +
      '<button class="btn" id="bk-import">📥 导入文件</button>' +
      '<button class="btn" id="bk-batch">☑️ 批量管理</button>' +
      '<button class="btn danger" id="bk-del">🗑 删除词库</button>' +
    '</div>' +
    '<div class="word-panel"><table class="words"><thead><tr>' +
      '<th style="width:26px"><input type="checkbox" id="bk-all" hidden></th>' +
      '<th style="width:150px">单词</th><th>释义</th><th style="width:90px">状态</th>' +
      '<th style="width:120px">掌握度</th><th style="width:190px">操作</th>' +
    '</tr></thead><tbody id="bk-rows"></tbody></table></div>' +
    '<div class="row" style="margin-top:10px;justify-content:center" id="bk-pager"></div>' +
    '<div class="muted" style="text-align:center;margin-top:6px" id="bk-count"></div>' +
    '<div id="bk-batchbar" hidden style="position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:50" class="card row">' +
    '</div>';

  function unitOptions(n) {
    let h = '';
    for (let i = 1; i <= n; i++) h += '<option value="' + i + '">单元 ' + i + '（第 ' + ((i - 1) * unitSize + 1) + '-' + Math.min(i * unitSize, data.words.length) + ' 词）</option>';
    return h;
  }

  /* 筛选 chips */
  const chips = App.$('#bk-chips', view);
  FILTERS.forEach(function (f) {
    const el = document.createElement('span');
    el.className = 'chip' + (st.filter === f.k ? ' active' : '');
    el.textContent = f.t;
    el.onclick = function () { st.filter = f.k; st.page = 1; render(); };
    chips.appendChild(el);
  });

  function matchState(w) {
    const p = data.prog[w.id];
    switch (st.filter) {
      case 'all': return true;
      case 'new': return !p || (!p.st && !p.master && !p.known);
      case 'learning': return p && p.st && !p.master && !p.known && p.st !== 2;
      case 'review': return p && p.st === 2 && !p.master && !p.known;
      case 'master': return p && p.master;
      case 'star': return !!w.star;
      case 'known': return p && p.known;
    }
    return true;
  }

  function filtered() {
    const q = st.q.toLowerCase();
    const unitIdx = st.unit;
    return data.words
      .map(function (w, i) { return { w: w, i: i }; })
      .filter(function (x) {
        if (unitIdx && (Math.floor(x.i / unitSize) + 1) !== unitIdx) return false;
        if (!matchState(x.w)) return false;
        if (q) {
          const cn = (x.w.trans || []).map(function (t) { return t.cn; }).join(' ');
          return x.w.word.toLowerCase().indexOf(q) >= 0 || cn.toLowerCase().indexOf(q) >= 0;
        }
        return true;
      })
      .sort(function (a, b) { return (a.w.rank || 0) - (b.w.rank || 0) || a.i - b.i; });
  }

  function render() {
    const list = filtered();
    const pages = Math.max(1, Math.ceil(list.length / PAGE));
    if (st.page > pages) st.page = pages;
    const slice = list.slice((st.page - 1) * PAGE, st.page * PAGE);
    const tbody = App.$('#bk-rows', view);
    tbody.innerHTML = '';
    slice.forEach(function (x) { tbody.appendChild(rowEl(x.w, x.i)); });
    /* 恢复控件状态 + 全选框 */
    App.$('#bk-q', view).value = st.q;
    App.$('#bk-unit', view).value = String(st.unit);
    const allBox = App.$('#bk-all', view);
    allBox.hidden = !st.batch;
    allBox.checked = list.length > 0 && list.every(function (x) { return st.sel[x.w.id]; });
    App.$('#bk-count', view).textContent = '符合条件的单词 ' + list.length + ' 个';
    allBox.onclick = function () {
      const all = list.length > 0 && list.every(function (x) { return st.sel[x.w.id]; });
      st.sel = {};
      if (!all) list.forEach(function (x) { st.sel[x.w.id] = 1; });
      render();
    };
    /* 分页 */
    const pg = App.$('#bk-pager', view);
    pg.innerHTML = '';
    if (pages > 1) {
      const prev = document.createElement('button'); prev.className = 'btn small'; prev.textContent = '‹ 上一页'; prev.disabled = st.page <= 1;
      const next = document.createElement('button'); next.className = 'btn small'; next.textContent = '下一页 ›'; next.disabled = st.page >= pages;
      const info = document.createElement('span'); info.className = 'muted'; info.textContent = '第 ' + st.page + ' / ' + pages + ' 页';
      prev.onclick = function () { st.page--; render(); };
      next.onclick = function () { st.page++; render(); };
      pg.appendChild(prev); pg.appendChild(info); pg.appendChild(next);
    }
    App.$('#bk-batchbar', view).hidden = !(st.batch && Object.keys(st.sel).length);
    renderBatchBar();
  }

  function rowEl(w, idx) {
    const p = data.prog[w.id];
    const tr = document.createElement('tr');
    tr.innerHTML =
      '<td>' + (st.batch ? '<input type="checkbox" class="row-sel"' + (st.sel[w.id] ? ' checked' : '') + '>' : '') + '</td>' +
      '<td><span class="w">' + App.esc(w.word) + '</span>' +
        '<div class="muted" style="font-size:11px">' + (w.uk ? '/' + App.esc(w.uk) + '/' : (w.us ? '/' + App.esc(w.us) + '/' : '')) + '</div></td>' +
      '<td>' + App.esc(App.firstTrans(w)) + (w.trans.length > 1 ? '<span class="muted"> 等' + w.trans.length + '义</span>' : '') + '</td>' +
      '<td>' + App.stateBadge(p) + (w.star ? ' <span class="badge star">★</span>' : '') + '</td>' +
      '<td>' + App.scoreBar(p) + ' <span class="muted" style="font-size:11px">' + App.wordScore(p) + '</span></td>' +
      '<td class="act">' +
        '<button class="btn small icon" data-a="speak" title="发音">🔊</button>' +
        '<button class="btn small icon" data-a="detail" title="详情">📄</button>' +
        '<button class="btn small icon" data-a="star" title="收藏/取消">' + (w.star ? '⭐' : '☆') + '</button>' +
        '<button class="btn small icon" data-a="sticker" title="贴到桌面">📌</button>' +
        '<button class="btn small icon" data-a="master" title="掌握/未掌握">' + (p && p.master ? '✅' : '☑️') + '</button>' +
        '<button class="btn small icon danger" data-a="del" title="删除">🗑</button>' +
      '</td>';
    tr.dataset.id = w.id;
    App.$('.w', tr).onclick = function () { App.speak(w.word); openDetail(w); };
    tr.oncontextmenu = function (e) {
      e.preventDefault();
      App.ctxMenu(e.clientX, e.clientY, [
        { label: '🔊 发音', onClick: function () { App.speak(w.word); } },
        { label: '📄 查看详情', onClick: function () { openDetail(w); } },
        { label: w.star ? '☆ 取消收藏' : '⭐ 收藏', onClick: function () { toggleStar(w); } },
        { label: '📌 添加桌面贴纸', onClick: function () { addSticker(w); } },
        { label: (p && p.master) ? '↩️ 标记为未掌握' : '✅ 标记为已掌握', onClick: function () { toggleMaster(w); } },
        { label: '🌍 加入全局熟词', onClick: function () { setKnownWord(w, true); } },
        { label: '🔄 重置学习进度', onClick: function () { resetWord(w); } },
        { label: '🗑 删除单词', danger: true, onClick: function () { delWord(w); } }
      ]);
    };
    tr.onclick = function (e) {
      const a = e.target.dataset && e.target.closest('[data-a]');
      if (!a) {
        if (st.batch && e.target.classList.contains('row-sel')) {
          if (e.target.checked) st.sel[w.id] = 1; else delete st.sel[w.id];
          tr.classList.toggle('selected', !!e.target.checked);
          renderBatchBar();
        }
        return;
      }
      const act = a.dataset.a;
      if (act === 'speak') App.speak(w.word, 'us');
      else if (act === 'detail') openDetail(w);
      else if (act === 'star') toggleStar(w);
      else if (act === 'sticker') addSticker(w);
      else if (act === 'master') toggleMaster(w);
      else if (act === 'del') delWord(w);
    };
    return tr;
  }

  function renderBatchBar() {
    const bar = App.$('#bk-batchbar', view);
    const n = Object.keys(st.sel).length;
    bar.hidden = !(st.batch && n);
    if (bar.hidden) return;
    bar.innerHTML = '已选 <b>' + n + '</b> 词' +
      '<button class="btn small" data-b="master">✅ 标记掌握</button>' +
      '<button class="btn small" data-b="unmaster">↩️ 取消掌握</button>' +
      '<button class="btn small" data-b="star">⭐ 收藏</button>' +
      '<button class="btn small" data-b="known">🌍 加入熟词</button>' +
      '<button class="btn small" data-b="reset">🔄 重置进度</button>' +
      '<button class="btn small danger" data-b="del">🗑 删除</button>';
    App.$$('[data-b]', bar).forEach(function (b) {
      b.onclick = async function () {
        const ids = Object.keys(st.sel);
        const act = b.dataset.b;
        if (act === 'del') {
          if (!(await App.confirm('删除选中的 ' + ids.length + ' 个单词？'))) return;
          await momo.deleteWords({ bookId: bookId, ids: ids });
        } else if (act === 'master') await momo.setFlags({ bookId: bookId, ids: ids, flags: { master: true } });
        else if (act === 'unmaster') await momo.setFlags({ bookId: bookId, ids: ids, flags: { master: false } });
        else if (act === 'star') await momo.setFlags({ bookId: bookId, ids: ids, flags: { star: true } });
        else if (act === 'known') {
          const words = ids.map(function (id) { const w = data.words.find(function (x) { return x.id === id; }); return w && w.word; }).filter(Boolean);
          await momo.setKnown({ words: words, val: true });
        } else if (act === 'reset') {
          if (!(await App.confirm('重置选中单词的学习进度？'))) return;
          await momo.setFlags({ bookId: bookId, ids: ids, flags: { reset: true } });
        }
        st.sel = {};
        App.toast('操作完成', 'ok');
        App.render();
      };
    });
  }

  async function toggleStar(w) {
    await momo.setFlags({ bookId: bookId, ids: [w.id], flags: { star: !w.star } });
    App.render();
  }
  async function toggleMaster(w) {
    const p = data.prog[w.id];
    await momo.setFlags({ bookId: bookId, ids: [w.id], flags: { master: !(p && p.master) } });
    App.render();
  }
  async function setKnownWord(w, val) {
    await momo.setKnown({ words: [w.word], val: val });
    App.toast('「' + w.word + '」已在全部词库中标记为熟词', 'ok');
    App.render();
  }
  async function resetWord(w) {
    await momo.setFlags({ bookId: bookId, ids: [w.id], flags: { reset: true } });
    App.toast('进度已重置'); App.render();
  }
  async function delWord(w) {
    if (!(await App.confirm('删除单词「' + w.word + '」？'))) return;
    await momo.deleteWords({ bookId: bookId, ids: [w.id] });
    App.render();
  }
  function addSticker(w) {
    momo.createSticker({ bookId: bookId, wordId: w.id, space: App.S.stickerSpace || '默认' });
    App.toast('已把「' + w.word + '」贴到桌面 📌', 'ok');
  }

  /* ---------- 详情弹窗 ---------- */
  function openDetail(w) {
    const p = data.prog[w.id];
    const body = document.createElement('div');
    body.innerHTML = detailHtml(w, p);
    const m = App.modal({
      title: App.esc(w.word), wide: true, body: body,
      foot: false,
      onClose: function () { }
    });
    App.$$('.spk', body).forEach(function (b) {
      b.onclick = function () { App.speak(b.dataset.t, b.dataset.v); };
    });
    const qz = App.$('.dt-quiz', body);
    if (qz) {
      App.$$('.opt', qz).forEach(function (o) {
        o.onclick = function () {
          const ok = o.dataset.ok === '1';
          o.classList.add(ok ? 'correct' : 'wrong');
          App.$$('.opt', qz).forEach(function (x) { if (x.dataset.ok === '1') x.classList.add('correct'); x.classList.add('disabled'); });
        };
      });
    }
    const editBtn = App.$('[data-d=edit]', body);
    if (editBtn) editBtn.onclick = function () { m.close(); editTrans(w); };
    const stickBtn = App.$('[data-d=sticker]', body);
    if (stickBtn) stickBtn.onclick = function () { addSticker(w); };
    const resetBtn = App.$('[data-d=reset]', body);
    if (resetBtn) resetBtn.onclick = async function () { await resetWord(w); m.close(); };
  }

  function detailHtml(w, p) {
    let h =
      '<div class="row" style="margin-bottom:12px">' +
        '<span class="phon">' + App.esc(App.phon(w)) + '</span>' +
        '<button class="btn small spk" data-t="' + App.esc(w.word) + '" data-v="uk">🇬🇧 英音</button>' +
        '<button class="btn small spk" data-t="' + App.esc(w.word) + '" data-v="us">🇺🇸 美音</button>' +
        '<span class="grow"></span>' + App.stateBadge(p) +
      '</div>';
    /* 释义 */
    h += '<div class="dt-sec"><h4>释义</h4>' + (w.trans.length
      ? w.trans.map(function (t) { return '<div class="tran"><span class="pos">' + App.esc(t.pos) + '</span> ' + App.esc(t.cn) + (t.en ? '<div class="muted" style="font-size:12px">' + App.esc(t.en) + '</div>' : '') + '</div>'; }).join('')
      : '<span class="muted">（无译文，可在下方编辑补充）</span>') + '</div>';
    /* 例句 */
    if (w.sentences.length) {
      h += '<div class="dt-sec"><h4>例句</h4>' + w.sentences.slice(0, 4).map(function (s) {
        return '<div class="dt-sent">' + App.esc(s.en) + '<div class="cn">' + App.esc(s.cn) + '</div></div>';
      }).join('') + '</div>';
    }
    /* 短语 */
    if (w.phrases.length) {
      h += '<div class="dt-sec"><h4>常用短语</h4>' + w.phrases.slice(0, 8).map(function (s) {
        return '<span class="dt-tag">' + App.esc(s.en) + ' <small>' + App.esc(s.cn) + '</small></span>';
      }).join('') + '</div>';
    }
    /* 同近义词 */
    if (w.synos.length) {
      h += '<div class="dt-sec"><h4>同近义词</h4>' + w.synos.map(function (s) {
        return '<div style="margin-bottom:4px"><span class="pos">' + App.esc(s.pos) + '</span> ' + App.esc(s.cn) + '：<span class="muted">' + s.words.map(App.esc).join('、') + '</span></div>';
      }).join('') + '</div>';
    }
    /* 同根词 */
    if (w.rels.length) {
      h += '<div class="dt-sec"><h4>同根词</h4>' + w.rels.map(function (r) {
        return '<div style="margin-bottom:4px"><span class="pos">' + App.esc(r.pos) + '</span> ' + r.words.map(function (x) {
          return '<span class="dt-tag">' + App.esc(x.w) + ' <small>' + App.esc(x.cn) + '</small></span>';
        }).join('') + '</div>';
      }).join('') + '</div>';
    }
    /* 真题例句 */
    if (w.realExam.length) {
      h += '<div class="dt-sec"><h4>真题例句</h4>' + w.realExam.slice(0, 4).map(function (s) {
        return '<div class="dt-sent">' + App.esc(s.en) + (s.src ? '<div class="cn">' + App.esc(s.src) + '</div>' : '') + '</div>';
      }).join('') + '</div>';
    }
    /* 真题选择题 */
    if (w.exam.length) {
      const e = w.exam[0];
      h += '<div class="dt-sec"><h4>真题练习</h4><div class="dt-quiz">' +
        '<div class="dt-sent">' + App.esc(e.q) + '</div>' +
        e.ch.map(function (c, i) {
          return '<span class="opt" data-ok="' + (i === e.ans ? 1 : 0) + '" style="display:inline-flex;margin:0 8px 6px 0"><span class="idx">' + 'ABCD'[i] + '.</span> ' + App.esc(c) + '</span>';
        }).join('') +
        (e.explain ? '<div class="muted" style="font-size:12.5px">💡 ' + App.esc(e.explain) + '</div>' : '') +
        '</div></div>';
    }
    /* 记忆法 */
    if (w.remMethod) h += '<div class="dt-sec"><h4>记忆法</h4><div class="dt-sent">' + App.esc(w.remMethod) + '</div></div>';
    /* 进度 */
    if (p) {
      h += '<div class="dt-sec"><h4>学习进度</h4><div class="muted">' +
        '状态：' + ['新词', '学习中', '复习中', '重学中'][p.st || 0] +
        (p.due ? ' ｜ 下次复习：' + App.fmtDate(p.due) + ' ' + App.fmtTime(p.due) : '') +
        ' ｜ 复习 ' + (p.reps || 0) + ' 次 ｜ 遗忘 ' + (p.lapses || 0) + ' 次' +
        (p.s ? ' ｜ 稳定度 ' + p.s.toFixed(1) + ' 天' : '') +
        '</div></div>';
    }
    h += '<div class="row" style="margin-top:6px">' +
      '<button class="btn" data-d="edit">✏️ 编辑释义</button>' +
      '<button class="btn" data-d="sticker">📌 贴到桌面</button>' +
      '<button class="btn" data-d="reset">🔄 重置进度</button>' +
      '</div>';
    return h;
  }

  function editTrans(w) {
    const body = document.createElement('div');
    const lines = (w.trans || []).map(function (t) { return (t.pos ? t.pos + '. ' : '') + t.cn; }).join('\n');
    body.innerHTML =
      '<div class="muted" style="margin-bottom:8px">每行一条，可带词性前缀，如 <code>v. 遗弃</code></div>' +
      '<textarea class="input" rows="7" style="width:100%" id="et-t">' + App.esc(lines) + '</textarea>' +
      '<div class="set-row" style="margin-top:10px"><label>英式音标</label><input class="input grow" id="et-uk" value="' + App.esc(w.uk) + '"></div>' +
      '<div class="set-row"><label>美式音标</label><input class="input grow" id="et-us" value="' + App.esc(w.us) + '"></div>';
    App.modal({
      title: '编辑「' + App.esc(w.word) + '」', body: body,
      actions: [
        { label: '取消', onClick: function (c) { c(); } },
        { label: '保存', cls: 'primary', onClick: async function (c) {
          const trans = App.$('#et-t', body).value.split('\n').map(function (l) {
            l = l.trim(); if (!l) return null;
            const mm = l.match(/^([a-z]+)\.\s*(.+)$/i);
            return mm ? { pos: mm[1], cn: mm[2], en: '' } : { pos: '', cn: l, en: '' };
          }).filter(Boolean);
          await momo.updateWord({ bookId: bookId, wordId: w.id, patch: { trans: trans, uk: App.$('#et-uk', body).value.trim(), us: App.$('#et-us', body).value.trim() } });
          c(); App.toast('已保存', 'ok'); App.render();
        } }
      ]
    });
  }

  /* ---------- 添加单词 ---------- */
  App.$('#bk-add', view).onclick = function () {
    const body = document.createElement('div');
    body.innerHTML =
      '<div class="muted" style="margin-bottom:8px">每行一个：<code>单词 = 译文</code>（只写单词也可以，适合自己认识的词）</div>' +
      '<textarea class="input" rows="7" style="width:100%" id="aw-text" placeholder="caption = 标题&#10;distance = 距离&#10;hello my friend = 你好我的朋友"></textarea>';
    App.modal({
      title: '添加单词到「' + App.esc(book.name) + '」', body: body,
      actions: [
        { label: '取消', onClick: function (c) { c(); } },
        { label: '添加', cls: 'primary', onClick: async function (c) {
          const text = App.$('#aw-text', body).value;
          if (!text.trim()) return App.toast('请输入内容', 'err');
          const r = await momo.importText({ bookId: bookId, text: text });
          c(); App.toast('成功添加 ' + r.added + ' 词（重复 ' + r.dup + '，无法解析 ' + r.bad + '）', 'ok');
          App.render();
        } }
      ]
    });
  };

  /* ---------- 导入文件 ---------- */
  App.$('#bk-import', view).onclick = async function () {
    const paths = await momo.pickImportFiles();
    if (!paths.length) return;
    const rs = await momo.importFile({ bookId: bookId, paths: paths });
    rs.forEach(function (r) {
      if (r.added === 0 && r.dup > 0) App.toast(r.file + ' 的 ' + r.dup + ' 个词已全部存在，无需重复导入');
      else App.toast(r.file + '：成功导入 ' + r.added + ' 词（重复 ' + r.dup + '，无法解析 ' + r.bad + '）', 'ok');
    });
    App.render();
  };

  /* ---------- 批量模式 ---------- */
  App.$('#bk-batch', view).onclick = function () {
    st.batch = !st.batch;
    st.sel = {};
    App.$('#bk-batch', view).classList.toggle('primary', st.batch);
    App.render();
  };

  /* ---------- 删除词库 ---------- */
  App.$('#bk-del', view).onclick = async function () {
    if (!(await App.confirm('删除词库「' + book.name + '」？其全部单词与学习进度将一并删除。'))) return;
    await momo.deleteBook(bookId);
    App.toast('词库已删除', 'ok');
    App.go('home');
  };

  /* ---------- 重命名 ---------- */
  App.$('#bk-name', view).onclick = function () {
    const body = document.createElement('div');
    body.innerHTML = '<div class="set-row"><label>词库名称</label><input class="input grow" id="rn-v" value="' + App.esc(book.name) + '"></div>' +
      '<div class="set-row"><label>每单元词数</label><input class="input" style="width:90px" type="number" min="5" max="500" value="' + unitSize + '" id="rn-unit"><span class="hint">用于单元筛选与学习范围</span></div>';
    App.modal({
      title: '词库设置', body: body,
      actions: [
        { label: '取消', onClick: function (c) { c(); } },
        { label: '保存', cls: 'primary', onClick: async function (c) {
          await momo.updateBook({ id: bookId, name: App.$('#rn-v', body).value.trim() || book.name, patch: { unitSize: Math.max(5, +App.$('#rn-unit', body).value || 50) } });
          c(); App.toast('已保存', 'ok'); App.render();
        } }
      ]
    });
  };

  /* 搜索/单元 */
  let qTimer = null;
  App.$('#bk-q', view).oninput = function (e) {
    clearTimeout(qTimer);
    qTimer = setTimeout(function () { st.q = e.target.value.trim(); st.page = 1; render(); }, 200);
  };
  App.$('#bk-unit', view).onchange = function (e) { st.unit = +e.target.value; st.page = 1; render(); };
  App.$('#bk-learn', view).onclick = function () { App.go('learn'); };

  render();
};
})();
